const test = require('node:test');
const assert = require('node:assert');
const { windowChanges, diffNodes, diffTags, diffMembers } = require('../src/changes.js');

const T = (d) => d + 'T12:00:00Z';
const wv = (id, version, ts, nodes, extra) => Object.assign(
  { type: 'way', id, version, timestamp: ts, user: 'u' + version, changeset: 1000 + version, nodes, tags: {} }, extra);
const rv = (version, ts, members, extra) => Object.assign({
  type: 'relation', id: 100, version, timestamp: ts, user: 'r' + version, changeset: 2000 + version, tags: { type: 'route' },
  members: members.map(m => (typeof m === 'number' ? { type: 'way', ref: m, role: '' } : m)),
}, extra);

function ctx0() {
  return {
    relHistory: [rv(1, T('2020-01-01'), [1, 2])],
    wayHistories: { 1: [wv(1, 1, T('2020-01-01'), [10, 11, 12])], 2: [wv(2, 1, T('2020-01-01'), [12, 13])] },
    currentWays: {},
  };
}
const find = (ev, kind, id, action) => ev.filter(e => e.kind === kind && e.id === id && (!action || e.action === action));

test('diffNodes : nœuds ajoutés, retirés, et extrémités changées', () => {
  assert.deepStrictEqual(diffNodes([10, 11, 12], [10, 12]), { added: [], removed: [11], endsChanged: false, endsBefore: [10, 12], endsAfter: [10, 12] });
  assert.deepStrictEqual(diffNodes([10, 11, 12], [10, 11]), { added: [], removed: [12], endsChanged: true, endsBefore: [10, 12], endsAfter: [10, 11] });
  assert.deepStrictEqual(diffNodes([10, 11], [10, 15, 11]), { added: [15], removed: [], endsChanged: false, endsBefore: [10, 11], endsAfter: [10, 11] });
  assert.deepStrictEqual(diffNodes([], [10, 11]).endsBefore, []);
});

test('diffTags : clés ajoutées, retirées, modifiées', () => {
  const d = diffTags({ a: '1', b: '2', c: '3' }, { a: '1', b: '9', d: '4' });
  assert.deepStrictEqual(d.map(x => x.key).sort(), ['b', 'c', 'd']);
  assert.deepStrictEqual(d.find(x => x.key === 'b'), { key: 'b', before: '2', after: '9' });
  assert.deepStrictEqual(d.find(x => x.key === 'c'), { key: 'c', before: '3', after: undefined });
});

test('diffMembers : membres ajoutés, retirés et changements de rôle', () => {
  const a = [{ type: 'way', ref: 1, role: '' }, { type: 'way', ref: 2, role: 'forward' }];
  const b = [{ type: 'way', ref: 2, role: 'backward' }, { type: 'way', ref: 3, role: '' }];
  const d = diffMembers(a, b);
  assert.deepStrictEqual(d.added.map(m => m.ref), [3]);
  assert.deepStrictEqual(d.removed.map(m => m.ref), [1]);
  assert.deepStrictEqual(d.roleChanged.map(m => [m.ref, m.before, m.after]), [[2, 'forward', 'backward']]);
});

test('une modification de chemin dans la période apparaît, avec auteur, version, changeset et nœuds retirés', () => {
  const c = ctx0();
  c.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11], { user: 'bob', changeset: 77 }));
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  const e = find(ev, 'way', 1, 'modified')[0];
  assert.deepStrictEqual([e.version, e.user, e.changeset, e.date], [2, 'bob', 77, T('2022-03-01')]);
  assert.deepStrictEqual(e.nodes, { added: [], removed: [12], endsChanged: true, endsBefore: [10, 12], endsAfter: [10, 11] });
});

test('preuve : une modification de chemin garde la version précédente, une création n\'en a pas', () => {
  const c = ctx0();
  c.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11]));
  const ev = windowChanges(c, 100, T('2019-01-01'), T('2023-01-01'));
  assert.strictEqual(find(ev, 'way', 1, 'modified')[0].prevVersion, 1);
  assert.strictEqual(find(ev, 'way', 1, 'created')[0].prevVersion, undefined);
});

test('preuve : une modification de la relation liste les membres ajoutés et retirés', () => {
  const c = ctx0();
  c.relHistory.push(rv(2, T('2022-02-01'), [2, { type: 'way', ref: 3, role: 'forward' }]));
  const e = find(windowChanges(c, 100, T('2022-01-01'), T('2023-01-01')), 'relation', 100, 'modified')[0];
  assert.deepStrictEqual(e.members.addedList, [{ type: 'way', ref: 3, role: 'forward' }]);
  assert.deepStrictEqual(e.members.removedList, [{ type: 'way', ref: 1, role: '' }]);
  assert.strictEqual(e.prevVersion, 1);
});

test('un chemin créé il y a longtemps et non modifié dans la période n\'apparaît pas', () => {
  const ev = windowChanges(ctx0(), 100, T('2022-01-01'), T('2023-01-01'));
  assert.deepStrictEqual(find(ev, 'way', 1), []);
  assert.deepStrictEqual(find(ev, 'way', 2), []);
});

test('les bornes de la période sont incluses, les événements hors période exclus', () => {
  const c = ctx0();
  c.wayHistories[1].push(wv(1, 2, T('2022-01-01'), [10, 11, 12, 14]), wv(1, 3, T('2023-01-01'), [10, 11, 12]), wv(1, 4, T('2023-01-02'), [10, 11]));
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  assert.deepStrictEqual(find(ev, 'way', 1).map(e => e.version), [2, 3]);
});

test('un chemin créé dans la période est signalé comme créé', () => {
  const c = ctx0();
  c.relHistory.push(rv(2, T('2022-02-01'), [1, 2, 3]));
  c.wayHistories[3] = [wv(3, 1, T('2022-02-01'), [13, 14])];
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  assert.strictEqual(find(ev, 'way', 3, 'created').length, 1);
  assert.strictEqual(find(ev, 'way', 3, 'added-to-relation').length, 1);
});

test('un chemin ancien ajouté à la relation dans la période : ajouté, pas créé', () => {
  const c = ctx0();
  c.wayHistories[3] = [wv(3, 1, T('2019-01-01'), [13, 14])];
  c.relHistory.push(rv(2, T('2022-02-01'), [1, 2, 3], { user: 'carl', changeset: 55 }));
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  assert.strictEqual(find(ev, 'way', 3, 'created').length, 0);
  const e = find(ev, 'way', 3, 'added-to-relation')[0];
  assert.deepStrictEqual([e.user, e.changeset, e.date], ['carl', 55, T('2022-02-01')]);
});

test('un chemin retiré de la relation dans la période est signalé', () => {
  const c = ctx0();
  c.relHistory.push(rv(2, T('2022-02-01'), [1], { user: 'dave' }));
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  const e = find(ev, 'way', 2, 'removed-from-relation')[0];
  assert.strictEqual(e.user, 'dave');
});

test('un chemin supprimé dans la période est signalé comme supprimé', () => {
  const c = ctx0();
  c.relHistory.push(rv(2, T('2021-12-01'), [1, 2]));
  c.wayHistories[2].push(wv(2, 2, T('2022-05-01'), undefined, { visible: false, user: 'eve' }));
  const e = find(windowChanges(c, 100, T('2022-01-01'), T('2023-01-01')), 'way', 2, 'deleted')[0];
  assert.strictEqual(e.user, 'eve');
});

test('modifier seulement les tags d\'un chemin : modifié, nœuds inchangés, tags listés', () => {
  const c = ctx0();
  c.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11, 12], { tags: { note: 'ok' } }));
  const e = find(windowChanges(c, 100, T('2022-01-01'), T('2023-01-01')), 'way', 1, 'modified')[0];
  assert.deepStrictEqual(e.nodes, { added: [], removed: [], endsChanged: false, endsBefore: [10, 12], endsAfter: [10, 12] });
  assert.deepStrictEqual(e.tags.map(t => t.key), ['note']);
});

test('la création de la relation dans la période est signalée', () => {
  const ev = windowChanges(ctx0(), 100, T('2019-06-01'), T('2020-06-01'));
  assert.strictEqual(find(ev, 'relation', 100, 'created').length, 1);
});

test('une modification des tags de la relation dans la période est signalée', () => {
  const c = ctx0();
  c.relHistory.push(rv(2, T('2022-02-01'), [1, 2], { tags: { type: 'route', name: 'Nouveau' } }));
  const e = find(windowChanges(c, 100, T('2022-01-01'), T('2023-01-01')), 'relation', 100, 'modified')[0];
  assert.deepStrictEqual(e.tags.map(t => t.key), ['name']);
});

test('un changement de rôle d\'un membre dans la période est signalé', () => {
  const c = ctx0();
  c.relHistory.push(rv(2, T('2022-02-01'), [{ type: 'way', ref: 1, role: 'forward' }, 2]));
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  const e = find(ev, 'way', 1, 'role-changed')[0];
  assert.deepStrictEqual([e.before, e.after], ['', 'forward']);
});

test('un chemin qui n\'est pas membre à la date de sa modification n\'apparaît pas', () => {
  const c = ctx0();
  c.wayHistories[99] = [wv(99, 1, T('2021-01-01'), [500, 501]), wv(99, 2, T('2022-06-01'), [500, 502])];
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  assert.deepStrictEqual(find(ev, 'way', 99), []);
});

test('les événements sont triés par date et portent un type d\'élément', () => {
  const c = ctx0();
  c.wayHistories[2].push(wv(2, 2, T('2022-08-01'), [12, 13, 15]));
  c.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11]));
  const ev = windowChanges(c, 100, T('2022-01-01'), T('2023-01-01'));
  assert.deepStrictEqual(ev.map(e => e.date), ev.map(e => e.date).slice().sort());
  assert.ok(ev.every(e => ['way', 'relation', 'node'].includes(e.kind)));
});

test('période qui commence avant la création de la relation : aucun chemin « supprimé » à tort', () => {
  const ev = windowChanges(ctx0(), 100, T('2010-01-01'), T('2011-01-01'));
  assert.deepStrictEqual(ev, []);
});
