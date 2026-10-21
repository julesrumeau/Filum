const test = require('node:test');
const assert = require('node:assert');
const { buildTree } = require('../src/tree.js');

const meta = (n) => ({ version: n, user: 'u' + n, timestamp: '2024-0' + n + '-01T00:00:00Z', changeset: 900 + n });
const W = (id, nodes, tags) => Object.assign({ type: 'way', id, nodes, tags: tags || {} }, meta(id % 9 + 1));
const R = (id, members, tags) => Object.assign({ type: 'relation', id, tags: tags || {}, members }, meta(id % 9 + 1));
const m = (type, ref, role) => ({ type, ref, role: role || '' });

function demo() {
  return { elements: [
    W(1, [10, 11, 12]), W(2, [12, 13]), W(3, [30, 31]),
    R(10, [m('way', 1), m('way', 2)], { name: 'Etape A' }),
    R(11, [m('way', 3, 'alternative'), m('node', 99, 'stop')]),
    R(100, [m('relation', 10), m('relation', 11, 'sub'), m('way', 1)], { name: 'Route' }),
  ] };
}

test('la racine contient ses membres dans l\'ordre de la relation', () => {
  const t = buildTree(demo(), 100);
  assert.strictEqual(t.kind, 'relation');
  assert.strictEqual(t.id, 100);
  assert.deepStrictEqual(t.children.map(c => c.kind + c.id), ['relation10', 'relation11', 'way1']);
});

test('les sous-relations contiennent leurs propres membres', () => {
  const t = buildTree(demo(), 100);
  assert.deepStrictEqual(t.children[0].children.map(c => c.id), [1, 2]);
});

test('le nom vient du tag name, sinon null', () => {
  const t = buildTree(demo(), 100);
  assert.strictEqual(t.name, 'Route');
  assert.strictEqual(t.children[1].name, null);
});

test('le rôle de chaque membre est conservé', () => {
  const t = buildTree(demo(), 100);
  assert.strictEqual(t.children[1].role, 'sub');
  assert.strictEqual(t.children[1].children[0].role, 'alternative');
});

test('chaque élément porte version, auteur, date et changeset', () => {
  const t = buildTree(demo(), 100);
  const way1 = t.children[2];
  assert.deepStrictEqual([way1.version, way1.user, way1.changeset], [2, 'u2', 902]);
  assert.strictEqual(way1.timestamp, '2024-02-01T00:00:00Z');
});

test('un chemin indique son nombre de nœuds et ses deux extrémités', () => {
  const way1 = buildTree(demo(), 100).children[2];
  assert.strictEqual(way1.nodeCount, 3);
  assert.deepStrictEqual(way1.ends, [10, 12]);
});

test('un membre nœud est une feuille', () => {
  const node = buildTree(demo(), 100).children[1].children[1];
  assert.deepStrictEqual([node.kind, node.id, node.role, node.children], ['node', 99, 'stop', []]);
});

test('un chemin absent de l\'instantané est marqué manquant', () => {
  const snap = { elements: [R(100, [m('way', 5)])] };
  const t = buildTree(snap, 100);
  assert.deepStrictEqual([t.children[0].kind, t.children[0].id, t.children[0].missing], ['way', 5, true]);
});

test('une relation qui contient un de ses ancêtres est marquée en cycle, sans boucler', () => {
  const snap = { elements: [R(1, [m('relation', 2)]), R(2, [m('relation', 1)])] };
  const t = buildTree(snap, 1);
  assert.strictEqual(t.children[0].id, 2);
  assert.strictEqual(t.children[0].children[0].cycle, true);
  assert.deepStrictEqual(t.children[0].children[0].children, []);
});

test('une sous-relation partagée par deux parents apparaît sous chacun', () => {
  const snap = { elements: [
    W(1, [1, 2]), R(5, [m('way', 1)]), R(6, [m('relation', 5)]), R(7, [m('relation', 5)]),
    R(1000, [m('relation', 6), m('relation', 7)]),
  ] };
  const t = buildTree(snap, 1000);
  assert.strictEqual(t.children[0].children[0].children[0].id, 1);
  assert.strictEqual(t.children[1].children[0].children[0].id, 1);
  assert.ok(!t.children[1].children[0].cycle);
});

test('le statut d\'une relation : bon, ordre ou mauvais selon l\'analyse de continuité', () => {
  const snap = { elements: [
    W(1, [10, 11]), W(2, [11, 12]), W(3, [30, 31]), W(4, [11, 13]),
    R(20, [m('way', 1), m('way', 2)]),                 // continue
    R(21, [m('way', 1), m('way', 2), m('way', 4)]),    // connexe mais mal ordonnée
    R(22, [m('way', 1), m('way', 3)]),                 // trou
    R(100, [m('relation', 20), m('relation', 21), m('relation', 22)]),
  ] };
  const t = buildTree(snap, 100);
  assert.deepStrictEqual(t.children.map(c => c.status), ['bon', 'ordre', 'mauvais']);
});

test('les chemins aux bords d\'un trou sont marqués', () => {
  const snap = { elements: [
    W(1, [10, 11]), W(2, [11, 12]), W(3, [30, 31]),
    R(100, [m('way', 1), m('way', 2), m('way', 3)]),
  ] };
  const t = buildTree(snap, 100);
  const ways = t.children.filter(c => c.kind === 'way');
  assert.deepStrictEqual(ways.map(c => !!c.border), [false, true, true]);
});

test('le résumé d\'une relation compte trous, problèmes d\'ordre et morceaux', () => {
  const snap = { elements: [
    W(1, [10, 11]), W(3, [30, 31]), R(100, [m('way', 1), m('way', 3)]),
  ] };
  const t = buildTree(snap, 100);
  assert.deepStrictEqual([t.summary.gaps, t.summary.pieces], [1, 2]);
});

test('une relation inconnue lève une erreur claire', () => {
  assert.throws(() => buildTree({ elements: [] }, 5), /relation 5/);
});

const { wayRefsOf } = require('../src/tree.js');

test('wayRefsOf réunit les chemins de la relation et de toutes ses sous-relations, sans doublon', () => {
  const refs = wayRefsOf(demo(), 100);
  assert.deepStrictEqual(refs.slice().sort((a, b) => a - b), [1, 2, 3]);
});

test('wayRefsOf d\'une sous-relation ne contient que ses propres chemins', () => {
  assert.deepStrictEqual(wayRefsOf(demo(), 10).sort(), [1, 2]);
});

test('wayRefsOf ne boucle pas sur une relation qui se contient elle-même', () => {
  const snap = { elements: [W(1, [1, 2]), R(7, [m('relation', 7), m('way', 1)])] };
  assert.deepStrictEqual(wayRefsOf(snap, 7), [1]);
});

const { findPath } = require('../src/tree.js');

function withGap() {
  return { elements: [
    W(1, [10, 11]), W(2, [11, 12]), W(3, [30, 31]), W(4, [31, 32]),
    R(100, [m('way', 1), m('way', 2), m('way', 3), m('way', 4)]),
  ] };
}

test('un trou devient une ligne de l\'arbre, juste avant le membre qui ne se raccorde pas', () => {
  const t = buildTree(withGap(), 100);
  assert.deepStrictEqual(t.children.map(c => c.kind + (c.id || '')), ['way1', 'way2', 'gap', 'way3', 'way4']);
});

test('la ligne de trou dit entre quels chemins il se trouve et quels nœuds ne se touchent pas', () => {
  const g = buildTree(withGap(), 100).children[2];
  assert.deepStrictEqual([g.fromRef, g.toRef], [2, 3]);
  assert.deepStrictEqual(g.fromEnds, [12]); // seul bout encore libre après 1 puis 2
  assert.deepStrictEqual(g.toEnds.slice().sort(), [30, 31]);
  assert.deepStrictEqual(g.children, []);
});

test('chaque ligne de trou a un numéro d\'ordre et la relation qui la porte', () => {
  const g = buildTree(withGap(), 100).children[2];
  assert.deepStrictEqual([g.relationId, g.gapIndex], [100, 0]);
});

test('un problème d\'ordre est aussi une ligne, distincte du trou', () => {
  const snap = { elements: [
    W(1, [10, 11]), W(2, [11, 12]), W(4, [11, 13]),
    R(100, [m('way', 1), m('way', 2), m('way', 4)]),
  ] };
  const t = buildTree(snap, 100);
  assert.deepStrictEqual(t.children.map(c => c.kind + (c.id || '')), ['way1', 'way2', 'order', 'way4']);
  assert.deepStrictEqual([t.children[2].fromRef, t.children[2].toRef], [2, 4]);
});

test('une relation continue n\'a aucune ligne de trou ni d\'ordre', () => {
  const snap = { elements: [W(1, [10, 11]), W(2, [11, 12]), R(100, [m('way', 1), m('way', 2)])] };
  assert.deepStrictEqual(buildTree(snap, 100).children.map(c => c.kind), ['way', 'way']);
});

test('findPath renvoie la suite de nœuds de la racine jusqu\'au chemin cherché', () => {
  const t = buildTree(demo(), 100);
  const path = findPath(t, n => n.kind === 'way' && n.id === 2);
  assert.deepStrictEqual(path.map(n => n.kind + n.id), ['relation100', 'relation10', 'way2']);
});

test('findPath prend la première occurrence quand un chemin est dans plusieurs relations', () => {
  const path = findPath(buildTree(demo(), 100), n => n.kind === 'way' && n.id === 1);
  assert.deepStrictEqual(path.map(n => n.kind + n.id), ['relation100', 'relation10', 'way1']);
});

test('findPath trouve une ligne de trou par sa relation et son numéro', () => {
  const t = buildTree(withGap(), 100);
  const path = findPath(t, n => n.kind === 'gap' && n.relationId === 100 && n.gapIndex === 0);
  assert.deepStrictEqual(path.map(n => n.kind), ['relation', 'gap']);
});

test('findPath renvoie null si rien ne correspond', () => {
  assert.strictEqual(findPath(buildTree(demo(), 100), n => n.id === 424242), null);
});

test('les tags note, fixme et description d\'un chemin ou d\'une relation remontent dans l\'arbre', () => {
  const snap = { elements: [
    W(1, [10, 11], { note: 'coupé exprès', fixme: 'à vérifier', description: 'passage privé', highway: 'path' }),
    R(100, [m('way', 1)], { name: 'X', note: 'tracé provisoire', type: 'route' }),
  ] };
  const t = buildTree(snap, 100);
  assert.deepStrictEqual(t.notes, [{ key: 'note', value: 'tracé provisoire' }]);
  const keys = t.children[0].notes.map(n => n.key).sort();
  assert.deepStrictEqual(keys, ['description', 'fixme', 'note']);
  assert.strictEqual(t.children[0].notes.find(n => n.key === 'note').value, 'coupé exprès');
});

test('sans tag explicatif, notes est une liste vide', () => {
  const t = buildTree(demo(), 100);
  assert.deepStrictEqual(t.notes, []);
  assert.deepStrictEqual(t.children[2].notes, []);
});

test('les variantes de langue (note:fr) et la casse (FIXME) sont reconnues', () => {
  const snap = { elements: [W(1, [10, 11], { 'note:fr': 'coupé', FIXME: 'oups', name: 'rue' }), R(100, [m('way', 1)])] };
  const keys = buildTree(snap, 100).children[0].notes.map(n => n.key).sort();
  assert.deepStrictEqual(keys, ['FIXME', 'note:fr']);
});

const { windowTree } = require('../src/tree.js');

const ev = (kind, id, action, date, extra) => Object.assign({ kind, id, action, date, version: 1, user: 'u', changeset: 9 }, extra);

function windowDemo() {
  return buildTree({ elements: [
    W(1, [10, 11]), W(2, [11, 12]), W(3, [30, 31]), W(4, [31, 32]),
    R(100, [m('way', 1), m('way', 2), m('way', 3), m('way', 4), m('node', 99, 'stop')], { name: 'Route' }),
  ] }, 100);
}

test('windowTree : les éléments sans événement dans la période sont masqués, les autres gardés', () => {
  const t = windowTree(windowDemo(), [ev('way', 2, 'modified', '2022-01-01T00:00:00Z'), ev('way', 4, 'created', '2022-02-01T00:00:00Z')]);
  assert.deepStrictEqual(t.children.filter(c => c.kind === 'way').map(c => c.id), [2, 4]);
  assert.strictEqual(t.hiddenCount, 3); // chemins 1 et 3, nœud 99
});

test('windowTree : les événements d\'un élément sont rattachés à sa ligne, dans l\'ordre du temps', () => {
  const t = windowTree(windowDemo(), [
    ev('way', 2, 'modified', '2022-05-01T00:00:00Z'), ev('way', 2, 'added-to-relation', '2022-01-01T00:00:00Z')]);
  const w = t.children.find(c => c.id === 2);
  assert.deepStrictEqual(w.events.map(e => e.action), ['added-to-relation', 'modified']);
});

test('windowTree : un trou est toujours gardé, même si ses deux chemins n\'ont pas bougé dans la période', () => {
  const none = windowTree(windowDemo(), [ev('way', 1, 'modified', '2022-01-01T00:00:00Z')]);
  assert.ok(none.children.some(c => c.kind === 'gap')); // le trou est entre les chemins 2 et 3
  const nothing = windowTree(windowDemo(), []);
  assert.strictEqual(nothing.children.filter(c => c.kind === 'gap').length, 1);
});

test('windowTree : un problème d\'ordre n\'est gardé que si l\'un des deux chemins est visible', () => {
  const t = buildTree({ elements: [
    W(1, [10, 11]), W(2, [20, 21]), W(3, [11, 12, 20]), R(100, [m('way', 1), m('way', 2), m('way', 3)]),
  ] }, 100);
  assert.ok(t.children.some(c => c.kind === 'order'));
  assert.ok(!windowTree(t, [ev('way', 3, 'modified', '2022-01-01T00:00:00Z')]).children.some(c => c.kind === 'order'));
  assert.ok(windowTree(t, [ev('way', 2, 'modified', '2022-01-01T00:00:00Z')]).children.some(c => c.kind === 'order'));
});

test('windowTree : un chemin retiré de la relation apparaît comme ligne à part, une seule fois', () => {
  const t = windowTree(windowDemo(), [
    ev('way', 77, 'removed-from-relation', '2022-01-01T00:00:00Z'), ev('way', 77, 'deleted', '2022-02-01T00:00:00Z')]);
  const rows = t.children.filter(c => c.id === 77);
  assert.strictEqual(rows.length, 1);
  assert.strictEqual(rows[0].removed, true);
  assert.strictEqual(rows[0].events.length, 2);
});

test('windowTree : la racine garde ses propres événements, son statut et son résumé', () => {
  const full = windowDemo();
  const t = windowTree(full, [ev('relation', 100, 'modified', '2022-01-01T00:00:00Z', { tags: [] })]);
  assert.strictEqual(t.events.length, 1);
  assert.strictEqual(t.status, full.status);
  assert.deepStrictEqual(t.summary, full.summary);
});

test('windowTree : sans aucun événement, plus rien sauf les trous, et tout est compté comme masqué', () => {
  const t = windowTree(windowDemo(), []);
  assert.deepStrictEqual(t.children.map(c => c.kind), ['gap']);
  assert.strictEqual(t.hiddenCount, 5);
  assert.deepStrictEqual(t.events, []);
});

test('windowTree : un nœud membre est gardé seulement s\'il a un événement', () => {
  const t = windowTree(windowDemo(), [ev('node', 99, 'added-to-relation', '2022-01-01T00:00:00Z')]);
  assert.deepStrictEqual(t.children.filter(c => c.kind === 'node').map(c => c.id), [99]);
});

test('windowTree ne modifie pas l\'arbre d\'origine', () => {
  const full = windowDemo();
  windowTree(full, [ev('way', 2, 'modified', '2022-01-01T00:00:00Z')]);
  assert.strictEqual(full.children.filter(c => c.kind === 'way').length, 4);
  assert.strictEqual(full.events, undefined);
});

test('la ligne d\'ordre garde touching (raccord en T ou saut dans la liste)', () => {
  const t = buildTree({ elements: [W(1, [10, 11, 12]), W(2, [11, 20]), R(100, [m('way', 1), m('way', 2)])] }, 100);
  assert.strictEqual(t.children.find(c => c.kind === 'order').touching, true);
});

const { groupQuiet } = require('../src/tree.js');

test('groupQuiet : une suite de chemins sans problème est regroupée, les chemins aux bords d\'un trou et les trous restent visibles', () => {
  const way = (id, extra) => Object.assign({ kind: 'way', id, children: [] }, extra);
  const kids = [way(1), way(2), way(3), way(4, { border: true }), { kind: 'gap', children: [] }, way(5, { border: true }), way(6), way(7), way(8), way(9)];
  const g = groupQuiet(kids, 3);
  assert.deepStrictEqual(g.map(x => x.quiet ? 'Q' + x.items.length : x.kind + (x.id || '')), ['Q3', 'way4', 'gap', 'way5', 'Q4']);
});

test('groupQuiet : une suite trop courte reste telle quelle, une note ou un chemin absent ne sont pas « sans problème »', () => {
  const way = (id, extra) => Object.assign({ kind: 'way', id, children: [] }, extra);
  const kids = [way(1), way(2), way(3, { notes: [{ key: 'note', value: 'x' }] }), way(4), way(5, { missing: true }), way(6)];
  const g = groupQuiet(kids, 3);
  assert.strictEqual(g.length, 6);
  assert.ok(g.every(x => !x.quiet));
});

const { relationLabel } = require('../src/tree.js');

test('relationLabel : name d\'abord, sinon départ → arrivée, sinon ref, sinon rien', () => {
  assert.strictEqual(relationLabel({ name: 'GR 965', from: 'A', to: 'B' }), 'GR 965');
  assert.strictEqual(relationLabel({ from: 'Metz', to: 'Nancy' }), 'Metz → Nancy');
  assert.strictEqual(relationLabel({ from: 'Metz', via: 'Pont-à-Mousson', to: 'Nancy' }), 'Metz → Pont-à-Mousson → Nancy');
  assert.strictEqual(relationLabel({ ref: '12', network: 'lwn' }), 'ref 12');
  assert.strictEqual(relationLabel({ from: 'Metz' }), 'depuis Metz');
  assert.strictEqual(relationLabel({ type: 'route' }), null);
  assert.strictEqual(relationLabel(undefined), null);
});

test('relationLabel : name:fr utilisé à défaut de name, et ref ajouté derrière name si absent du nom', () => {
  assert.strictEqual(relationLabel({ 'name:fr': 'Sentier' }), 'Sentier');
  assert.strictEqual(relationLabel({ name: 'Sentier des Roches', ref: 'GR5' }), 'Sentier des Roches (GR5)');
  assert.strictEqual(relationLabel({ name: 'GR5 Nord', ref: 'GR5' }), 'GR5 Nord');
});

test('buildTree : une relation sans name prend le libellé construit', () => {
  const t = buildTree({ elements: [W(1, [10, 11]), { type: 'relation', id: 100, tags: { from: 'A', to: 'B' }, members: [m('way', 1)] }] }, 100);
  assert.strictEqual(t.name, 'A → B');
});

test('buildTree : un nœud membre chargé porte son nom, sa référence et son type (arrêt, borne...)', () => {
  const n = { type: 'node', id: 50, lat: 1, lon: 2, tags: { name: 'Gare', highway: 'bus_stop', ref: 'B2' } };
  const t = buildTree({ elements: [W(1, [10, 11]), n, R(100, [m('way', 1), m('node', 50, 'stop'), m('node', 51)])] }, 100);
  const kids = t.children.filter(c => c.kind === 'node');
  assert.deepStrictEqual([kids[0].name, kids[0].ref, kids[0].what, kids[0].role], ['Gare', 'B2', 'highway=bus_stop', 'stop']);
  assert.strictEqual(kids[0].loaded, true);
  assert.strictEqual(kids[1].loaded, false);   // nœud non chargé : seulement son numéro
});

test('buildTree : what prend le premier tag parlant (public_transport avant tourism), vide si aucun', () => {
  const n = (id, tags) => ({ type: 'node', id, lat: 1, lon: 2, tags });
  const t = buildTree({ elements: [n(50, { public_transport: 'platform', tourism: 'information' }), n(51, { foo: 'bar' }),
    R(100, [m('node', 50), m('node', 51)])] }, 100);
  assert.deepStrictEqual(t.children.map(c => c.what), ['public_transport=platform', null]);
});
