const test = require('node:test');
const assert = require('node:assert');
const { fetchTree, fetchNodes, MAX_IDS } = require('../src/osmapi.js');

// Faux serveur : répond comme l'API OSM aux appels groupés et garde la trace des appels.
function fakeApi(db) {
  const calls = [];
  async function getJson(path) {
    calls.push(path);
    const m = path.match(/^(relations|ways|nodes)\.json\?\1=([\d,]+)$/);
    if (!m) throw new Error('appel inattendu : ' + path);
    const kind = m[1].slice(0, -1);
    const elements = m[2].split(',').map(Number).map(id => db[kind + id]).filter(Boolean);
    return { elements };
  }
  return { getJson, calls };
}

const R = (id, members) => ({ type: 'relation', id, members });
const W = (id, nodes) => ({ type: 'way', id, nodes });
const N = (id) => ({ type: 'node', id, lat: 1, lon: 2 });

test('descend dans les sous-relations niveau par niveau, puis charge les chemins : 3 appels', async () => {
  const db = {
    relation1: R(1, [{ type: 'relation', ref: 2, role: '' }, { type: 'relation', ref: 3, role: '' }]),
    relation2: R(2, [{ type: 'way', ref: 10, role: '' }]),
    relation3: R(3, [{ type: 'way', ref: 11, role: '' }]),
    way10: W(10, [100, 101]), way11: W(11, [101, 102]),
  };
  const api = fakeApi(db);
  const snap = await fetchTree(1, api.getJson);
  const ids = snap.elements.map(e => e.type + e.id).sort();
  assert.deepStrictEqual(ids, ['relation1', 'relation2', 'relation3', 'way10', 'way11']);
  assert.strictEqual(api.calls.length, 3);
});

test('découpe les appels en lots de MAX_IDS identifiants', async () => {
  const db = { relation1: R(1, []) };
  const members = [];
  for (let i = 1; i <= MAX_IDS + 50; i++) {
    members.push({ type: 'way', ref: i, role: '' });
    db['way' + i] = W(i, [i * 10, i * 10 + 1]);
  }
  db.relation1.members = members;
  const api = fakeApi(db);
  await fetchTree(1, api.getJson);
  const wayCalls = api.calls.filter(c => c.startsWith('ways'));
  assert.strictEqual(wayCalls.length, 2);
  assert.ok(wayCalls.every(c => c.split('=')[1].split(',').length <= MAX_IDS));
});

test('une relation qui se contient elle-même ne fait pas boucler la récupération', async () => {
  const db = { relation1: R(1, [{ type: 'relation', ref: 1, role: '' }]) };
  const api = fakeApi(db);
  const snap = await fetchTree(1, api.getJson);
  assert.strictEqual(snap.elements.length, 1);
  assert.strictEqual(api.calls.length, 1);
});

test('un chemin partagé par deux relations n\'est demandé qu\'une fois', async () => {
  const db = {
    relation1: R(1, [{ type: 'relation', ref: 2, role: '' }, { type: 'way', ref: 10, role: '' }]),
    relation2: R(2, [{ type: 'way', ref: 10, role: '' }]),
    way10: W(10, [100, 101]),
  };
  const api = fakeApi(db);
  await fetchTree(1, api.getJson);
  assert.strictEqual(api.calls.filter(c => c.startsWith('ways')).length, 1);
  assert.strictEqual(api.calls.find(c => c.startsWith('ways')), 'ways.json?ways=10');
});

test('fetchNodes charge les nœuds des chemins demandés, une seule fois chacun', async () => {
  const db = {
    way10: W(10, [100, 101]), way11: W(11, [101, 102]),
    node100: N(100), node101: N(101), node102: N(102),
  };
  const api = fakeApi(db);
  const snap = { elements: [db.way10, db.way11] };
  const nodes = await fetchNodes(snap, [10, 11], api.getJson);
  assert.deepStrictEqual(nodes.map(n => n.id).sort(), [100, 101, 102]);
  assert.strictEqual(api.calls.length, 1);
});

const { fetchHistoryContext } = require('../src/osmapi.js');

// Faux serveur d'historiques : relation/ID/history.json et way/ID/history.json
function fakeHistory(db) {
  const calls = [];
  async function getJson(path) {
    calls.push(path);
    const m = path.match(/^(relation|way)\/(\d+)\/history\.json$/);
    if (!m || !db[m[1] + m[2]]) throw new Error('appel inattendu : ' + path);
    return { elements: db[m[1] + m[2]] };
  }
  return { getJson, calls };
}
const RVer = (version, refs) => ({ type: 'relation', id: 100, version, timestamp: '2020-0' + version + '-01T00:00:00Z',
  members: refs.map(r => ({ type: 'way', ref: r, role: '' })) });
const WVer = (id) => [{ type: 'way', id, version: 1, timestamp: '2020-01-01T00:00:00Z', nodes: [id, id + 1] }];

test('fetchHistoryContext charge l\'historique de la relation et des chemins demandés', async () => {
  const db = { relation100: [RVer(1, [1, 2]), RVer(2, [1, 2])], way1: WVer(1), way2: WVer(2) };
  const api = fakeHistory(db);
  const snap = { elements: [{ type: 'way', id: 1, nodes: [1, 2] }, { type: 'way', id: 2, nodes: [2, 3] }] };
  const ctx = await fetchHistoryContext(100, snap, [1], api.getJson, 10);
  assert.strictEqual(ctx.relHistory.length, 2);
  assert.deepStrictEqual(Object.keys(ctx.wayHistories), ['1']);
  assert.deepStrictEqual(ctx.currentWays[2].nodes, [2, 3]);
  assert.strictEqual(ctx.truncated, false);
});

test('fetchHistoryContext ajoute les chemins retirés de la relation au fil du temps', async () => {
  const db = { relation100: [RVer(1, [1, 3]), RVer(2, [1])], way1: WVer(1), way3: WVer(3) };
  const api = fakeHistory(db);
  const snap = { elements: [{ type: 'way', id: 1, nodes: [1, 2] }] };
  const ctx = await fetchHistoryContext(100, snap, [1], api.getJson, 10);
  assert.deepStrictEqual(Object.keys(ctx.wayHistories).sort(), ['1', '3']);
});

test('fetchHistoryContext respecte la limite de chemins, bords des trous d\'abord, et le signale', async () => {
  const db = { relation100: [RVer(1, [1, 3, 4]), RVer(2, [1])], way1: WVer(1), way3: WVer(3), way4: WVer(4) };
  const api = fakeHistory(db);
  const snap = { elements: [{ type: 'way', id: 1, nodes: [1, 2] }] };
  const ctx = await fetchHistoryContext(100, snap, [1], api.getJson, 2);
  assert.strictEqual(Object.keys(ctx.wayHistories).length, 2);
  assert.ok(ctx.wayHistories[1]);
  assert.strictEqual(ctx.truncated, true);
});

test('fetchHistoryContext ne demande pas deux fois le même chemin', async () => {
  const db = { relation100: [RVer(1, [1, 3]), RVer(2, [1, 3])], way1: WVer(1), way3: WVer(3) };
  const api = fakeHistory(db);
  const snap = { elements: [{ type: 'way', id: 1, nodes: [1, 2] }, { type: 'way', id: 3, nodes: [3, 4] }] };
  await fetchHistoryContext(100, snap, [1, 1, 3], api.getJson, 10);
  assert.strictEqual(api.calls.filter(c => c.startsWith('way/1/')).length, 1);
});

const { fetchChangesets } = require('../src/osmapi.js');

function fakeChangesets(db) {
  const calls = [];
  async function getJson(path) {
    calls.push(path);
    const m = path.match(/^changesets\.json\?changesets=([\d,]+)$/);
    if (!m) throw new Error('appel inattendu : ' + path);
    return { changesets: m[1].split(',').map(Number).filter(id => db[id]).map(id => db[id]) };
  }
  return { getJson, calls };
}
const CS = (id, extra) => Object.assign({ id, user: 'u' + id, changes_count: 10 * id,
  tags: { comment: 'commentaire ' + id, created_by: 'JOSM/1.5' } }, extra);

test('fetchChangesets renvoie commentaire, nombre de changements, éditeur et auteur par numéro', async () => {
  const api = fakeChangesets({ 5: CS(5) });
  const res = await fetchChangesets([5], api.getJson);
  assert.deepStrictEqual(res[5], { id: 5, user: 'u5', comment: 'commentaire 5', changesCount: 50, createdBy: 'JOSM/1.5', commentsCount: 0 });
});

test('fetchChangesets ne demande qu\'une fois chaque numéro, en un seul appel', async () => {
  const api = fakeChangesets({ 1: CS(1), 2: CS(2) });
  await fetchChangesets([1, 2, 1, 2], api.getJson);
  assert.deepStrictEqual(api.calls, ['changesets.json?changesets=1,2']);
});

test('fetchChangesets découpe en lots quand il y en a beaucoup', async () => {
  const db = {}, ids = [];
  for (let i = 1; i <= 120; i++) { db[i] = CS(i); ids.push(i); }
  const api = fakeChangesets(db);
  const res = await fetchChangesets(ids, api.getJson);
  assert.strictEqual(api.calls.length, 3);
  assert.strictEqual(Object.keys(res).length, 120);
});

test('fetchChangesets : un changeset inconnu est simplement absent du résultat', async () => {
  const api = fakeChangesets({ 1: CS(1) });
  const res = await fetchChangesets([1, 99], api.getJson);
  assert.ok(res[1]);
  assert.strictEqual(res[99], undefined);
});

test('fetchChangesets : commentaire absent donne null', async () => {
  const api = fakeChangesets({ 3: { id: 3, user: 'x', changes_count: 1, tags: {} } });
  const res = await fetchChangesets([3], api.getJson);
  assert.deepStrictEqual([res[3].comment, res[3].createdBy], [null, null]);
});

test('fetchChangesets sans numéro ne fait aucun appel', async () => {
  const api = fakeChangesets({});
  assert.deepStrictEqual(await fetchChangesets([], api.getJson), {});
  assert.strictEqual(api.calls.length, 0);
});

const { fetchDiscussions } = require('../src/osmapi.js');

test('fetchChangesets garde le nombre de commentaires de discussion', async () => {
  const api = fakeChangesets({ 4: Object.assign(CS(4), { comments_count: 2 }) });
  const res = await fetchChangesets([4], api.getJson);
  assert.strictEqual(res[4].commentsCount, 2);
});

test('fetchDiscussions ne demande que les changesets qui ont une discussion', async () => {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    return { changeset: { id: 8, comments: [
      { visible: true, user: 'aighes', date: '2026-09-29T21:53:22Z', text: 'bonjour' },
      { visible: false, user: 'spam', date: '2026-09-30T00:00:00Z', text: 'masqué' },
    ] } };
  };
  const res = await fetchDiscussions({ 7: { id: 7, commentsCount: 0 }, 8: { id: 8, commentsCount: 2 } }, get);
  assert.deepStrictEqual(calls, ['changeset/8.json?include_discussion=true']);
  assert.deepStrictEqual(res[8], [{ user: 'aighes', date: '2026-09-29T21:53:22Z', text: 'bonjour' }]);
  assert.strictEqual(res[7], undefined);
});

test('fetchDiscussions : une discussion qui échoue n\'empêche pas les autres', async () => {
  const get = async (path) => {
    if (path.includes('/8.')) throw new Error('boom');
    return { changeset: { id: 9, comments: [{ visible: true, user: 'a', date: 'd', text: 't' }] } };
  };
  const res = await fetchDiscussions({ 8: { id: 8, commentsCount: 1 }, 9: { id: 9, commentsCount: 1 } }, get);
  assert.strictEqual(res[8], undefined);
  assert.strictEqual(res[9].length, 1);
});

const { fetchRelationHistory } = require('../src/osmapi.js');

test('fetchRelationHistory renvoie les versions de la relation, de la plus ancienne à la plus récente', async () => {
  const calls = [];
  const get = async (path) => { calls.push(path); return { elements: [{ version: 3 }, { version: 1 }, { version: 2 }] }; };
  const h = await fetchRelationHistory(100, get);
  assert.deepStrictEqual(calls, ['relation/100/history.json']);
  assert.deepStrictEqual(h.map(v => v.version), [1, 2, 3]);
});

const { fetchWayHistories } = require('../src/osmapi.js');

function fakeWayHist(failIds) {
  const calls = [];
  async function getJson(path) {
    calls.push(path);
    const id = Number(path.match(/^way\/(\d+)\/history\.json$/)[1]);
    if ((failIds || []).includes(id)) throw new Error('boom');
    return { elements: [{ type: 'way', id, version: 1, timestamp: '2020-01-01T00:00:00Z', nodes: [id, id + 1] }] };
  }
  return { getJson, calls };
}

test('fetchWayHistories charge par pages et range les historiques dans le contexte', async () => {
  const api = fakeWayHist();
  const ctx = { wayHistories: {} };
  const pages = [];
  const res = await fetchWayHistories([1, 2, 3, 4, 5], ctx, api.getJson, { pageSize: 2, onPage: p => pages.push(p.done) });
  assert.deepStrictEqual(Object.keys(ctx.wayHistories).sort(), ['1', '2', '3', '4', '5']);
  assert.deepStrictEqual(pages, [2, 4, 5]);
  assert.deepStrictEqual([res.done, res.failed.length, res.stopped], [5, 0, false]);
});

test('fetchWayHistories s\'arrête entre deux pages quand on le demande, et peut reprendre', async () => {
  const api = fakeWayHist();
  const ctx = { wayHistories: {} };
  let stop = false;
  const first = await fetchWayHistories([1, 2, 3, 4], ctx, api.getJson, { pageSize: 2, onPage: () => { stop = true; }, shouldStop: () => stop });
  assert.strictEqual(first.stopped, true);
  assert.strictEqual(Object.keys(ctx.wayHistories).length, 2);
  stop = false;
  await fetchWayHistories([3, 4], ctx, api.getJson, { pageSize: 2 });
  assert.strictEqual(Object.keys(ctx.wayHistories).length, 4);
});

test('fetchWayHistories : un chemin en échec est signalé sans bloquer les autres', async () => {
  const api = fakeWayHist([2]);
  const ctx = { wayHistories: {} };
  const res = await fetchWayHistories([1, 2, 3], ctx, api.getJson, { pageSize: 10 });
  assert.deepStrictEqual(res.failed, [2]);
  assert.deepStrictEqual(Object.keys(ctx.wayHistories).sort(), ['1', '3']);
});

test('fetchWayHistories ne redemande pas un chemin déjà chargé', async () => {
  const api = fakeWayHist();
  const ctx = { wayHistories: { 1: [] } };
  await fetchWayHistories([1, 2], ctx, api.getJson, { pageSize: 10 });
  assert.deepStrictEqual(api.calls, ['way/2/history.json']);
});

test('fetchWayHistories sans chemin ne fait aucun appel', async () => {
  const api = fakeWayHist();
  const res = await fetchWayHistories([], { wayHistories: {} }, api.getJson, {});
  assert.strictEqual(api.calls.length, 0);
  assert.strictEqual(res.done, 0);
});

test('fetchNodes ne renvoie que les nœuds qui ont des coordonnées (les nœuds supprimés sont écartés)', async () => {
  const get = async (path) => ({ elements: [
    { type: 'node', id: 100, lat: 48.5, lon: 7.7 },
    { type: 'node', id: 101, visible: false },
    { type: 'node', id: 102, lat: 48.6, lon: 7.8 },
  ] });
  const snap = { elements: [{ type: 'way', id: 1, nodes: [100, 101, 102] }] };
  const nodes = await fetchNodes(snap, [1], get);
  assert.deepStrictEqual(nodes.map(n => n.id), [100, 102]);
});

const { MAX_URL_CHARS, API_BASE } = require('../src/osmapi.js');

// L'API répond 414 au-delà d'environ 8 190 caractères d'adresse (mesuré : 200 à 8 058, 414 à 8 358).
function longIds(n) { return Array.from({ length: n }, (_, i) => 11647551030 + i); }

test('les appels de nœuds restent sous la limite d\'adresse même avec des identifiants de 11 chiffres', async () => {
  const lengths = [];
  const get = async (path) => { lengths.push(API_BASE.length + path.length); return { elements: [] }; };
  const ids = longIds(2000);
  const snap = { elements: [{ type: 'way', id: 1, nodes: ids }] };
  await fetchNodes(snap, [1], get);
  assert.ok(lengths.length >= 2);
  assert.ok(lengths.every(l => l <= MAX_URL_CHARS), 'adresses trop longues : ' + lengths.filter(l => l > MAX_URL_CHARS));
});

test('aucun identifiant n\'est perdu ni demandé deux fois quand on découpe par longueur', async () => {
  const asked = [];
  const get = async (path) => { asked.push(...path.split('=')[1].split(',').map(Number)); return { elements: [] }; };
  const ids = longIds(2000);
  await fetchNodes({ elements: [{ type: 'way', id: 1, nodes: ids }] }, [1], get);
  assert.deepStrictEqual(asked.slice().sort((a, b) => a - b), ids);
});

test('les chemins et les relations aussi sont découpés par longueur d\'adresse', async () => {
  const lengths = [];
  const get = async (path) => { lengths.push(API_BASE.length + path.length); return { elements: [] }; };
  const members = longIds(2000).map(ref => ({ type: 'way', ref, role: '' }));
  const db = { relation1: { type: 'relation', id: 1, members } };
  const api = { getJson: async (path) => {
    if (path.startsWith('relations')) return { elements: [db.relation1] };
    return get(path);
  } };
  await fetchTree(1, api.getJson);
  assert.ok(lengths.length >= 2);
  assert.ok(lengths.every(l => l <= MAX_URL_CHARS));
});

test('des identifiants courts restent limités à MAX_IDS par appel', async () => {
  const counts = [];
  const get = async (path) => { counts.push(path.split('=')[1].split(',').length); return { elements: [] }; };
  const ids = Array.from({ length: 1500 }, (_, i) => i + 1);
  await fetchNodes({ elements: [{ type: 'way', id: 1, nodes: ids }] }, [1], get);
  assert.ok(counts.every(c => c <= MAX_IDS));
  assert.strictEqual(counts.length, 3);
});

// Comme l'API réelle : un identifiant absent de la base fait échouer TOUT l'appel groupé (404).
function strictApi(db) {
  const calls = [];
  async function getJson(path) {
    calls.push(path);
    const m = path.match(/^(relations|ways|nodes)\.json\?\1=([\d,]+)$/);
    const kind = m[1].slice(0, -1);
    const ids = m[2].split(',').map(Number);
    if (ids.some(id => !db[kind + id])) throw new Error('API OSM : réponse 404 pour ' + path.slice(0, 60));
    return { elements: ids.map(id => db[kind + id]) };
  }
  return { getJson, calls };
}

test('un chemin inexistant dans un appel groupé ne fait pas échouer les autres', async () => {
  const db = {
    relation1: R(1, [{ type: 'way', ref: 10, role: '' }, { type: 'way', ref: 99, role: '' }, { type: 'way', ref: 11, role: '' }]),
    way10: W(10, [100, 101]), way11: W(11, [101, 102]),
  };
  const api = strictApi(db);
  const snap = await fetchTree(1, api.getJson);
  const ids = snap.elements.filter(e => e.type === 'way').map(e => e.id).sort();
  assert.deepStrictEqual(ids, [10, 11]);
});

test('une erreur autre que 404 est toujours propagée', async () => {
  const get = async () => { throw new Error('API OSM : réponse 500'); };
  await assert.rejects(() => fetchTree(1, get), /500/);
});

const { fetchParents } = require('../src/osmapi.js');

test('fetchParents : relations qui contiennent un chemin ou une relation, avec nom et type', async () => {
  const calls = [];
  const get = async (path) => {
    calls.push(path);
    return { elements: [
      { type: 'relation', id: 7, tags: { name: 'GR 5', type: 'route' }, members: [{}, {}] },
      { type: 'relation', id: 3, tags: { type: 'multipolygon' }, members: [{}] },
    ] };
  };
  const list = await fetchParents('way', 55, get);
  assert.deepStrictEqual(calls, ['way/55/relations.json']);
  assert.deepStrictEqual(list.map(r => r.id), [3, 7]);
  assert.deepStrictEqual(list[1], { id: 7, tags: { name: 'GR 5', type: 'route' }, members: 2 });
  assert.deepStrictEqual(await fetchParents('relation', 9, async () => ({ elements: [] })), []);
});

const { fetchWay } = require('../src/osmapi.js');

test('fetchWay : le chemin demandé, ou null s\'il n\'existe pas (404)', async () => {
  const ok = await fetchWay(55, async () => ({ elements: [{ type: 'way', id: 55, nodes: [1, 2, 1], tags: { name: 'Parc' } }] }));
  assert.deepStrictEqual([ok.id, ok.nodes.length], [55, 3]);
  const none = await fetchWay(56, async () => { throw new Error('API OSM : réponse 404 pour ways.json?ways=56'); });
  assert.strictEqual(none, null);
  await assert.rejects(() => fetchWay(57, async () => { throw new Error('API OSM : réponse 500'); }), /500/);
});

const { fetchMemberNodes } = require('../src/osmapi.js');

test('fetchMemberNodes : charge les nœuds membres de toutes les relations, une fois chacun, avec leurs tags', async () => {
  const snap = { elements: [
    { type: 'relation', id: 1, members: [{ type: 'node', ref: 5, role: 'stop' }, { type: 'way', ref: 9, role: '' }, { type: 'relation', ref: 2, role: '' }] },
    { type: 'relation', id: 2, members: [{ type: 'node', ref: 5, role: '' }, { type: 'node', ref: 6, role: '' }] },
  ] };
  const db = { node5: { type: 'node', id: 5, lat: 1, lon: 2, tags: { name: 'A' } }, node6: { type: 'node', id: 6, lat: 3, lon: 4 } };
  const api = fakeApi(db);
  const nodes = await fetchMemberNodes(snap, api.getJson);
  assert.deepStrictEqual(nodes.map(n => n.id).sort(), [5, 6]);
  assert.strictEqual(api.calls.length, 1);
  assert.deepStrictEqual(await fetchMemberNodes({ elements: [{ type: 'relation', id: 1, members: [] }] }, api.getJson), []);
});
