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
