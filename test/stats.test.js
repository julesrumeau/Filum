const test = require('node:test');
const assert = require('node:assert');
const { structureStats, wayLengthKm, lengthStats } = require('../src/stats.js');

const W = (id, nodes) => ({ type: 'way', id, nodes });
const R = (id, members, tags) => ({ type: 'relation', id, tags: tags || {}, members });
const m = (type, ref) => ({ type, ref, role: '' });

function demo() {
  return { elements: [
    W(1, [10, 11, 12]), W(2, [12, 13]), W(3, [13, 14, 15, 16, 17]),
    R(200, [m('way', 1), m('way', 2)], { name: 'Étape 1' }),
    R(201, [m('way', 2), m('way', 3)], { name: 'Étape 2' }),
    R(100, [m('relation', 200), m('relation', 201), m('node', 5)], { name: 'Racine' }),
  ] };
}

test('structureStats : relations, niveaux, chemins uniques, nœuds, maximum par chemin', () => {
  const s = structureStats(demo(), 100);
  assert.strictEqual(s.relations, 3);
  assert.strictEqual(s.depth, 2);
  assert.strictEqual(s.ways, 3);          // le chemin 2 est dans deux étapes mais compte une fois
  assert.strictEqual(s.nodes, 10);        // 3 + 2 + 5, chaque chemin une fois
  assert.deepStrictEqual(s.maxNodesWay, { id: 3, count: 5 });
});

test('structureStats : les relations les plus chargées, par nombre de membres', () => {
  const s = structureStats(demo(), 100);
  assert.deepStrictEqual(s.biggest.map(r => [r.id, r.members]), [[100, 3], [200, 2], [201, 2]]);
  assert.strictEqual(s.biggest[0].name, 'Racine');
});

test('structureStats : une relation sans sous-relation a un niveau et un cycle ne boucle pas', () => {
  const cyc = { elements: [R(1, [m('relation', 2)]), R(2, [m('relation', 1), m('way', 9)]), W(9, [1, 2])] };
  const s = structureStats(cyc, 1);
  assert.strictEqual(s.relations, 2);
  assert.strictEqual(s.ways, 1);
  assert.strictEqual(structureStats({ elements: [W(1, [1, 2]), R(5, [m('way', 1)])] }, 5).depth, 1);
});

test('wayLengthKm : un degré de latitude fait environ 111 km, un chemin sans position vaut 0', () => {
  const nodes = { 1: { lat: 48, lon: 7 }, 2: { lat: 49, lon: 7 }, 3: { lat: 49, lon: 8 } };
  assert.ok(Math.abs(wayLengthKm([1, 2], nodes) - 111.2) < 0.5);
  assert.ok(wayLengthKm([1, 2, 3], nodes) > wayLengthKm([1, 2], nodes));
  assert.strictEqual(wayLengthKm([1, 99], nodes), 0);
  assert.strictEqual(wayLengthKm([], nodes), 0);
});

test('lengthStats : longueur totale (chaque chemin une fois), plus long chemin, chemins sans position', () => {
  const nodes = { 10: { lat: 0, lon: 0 }, 11: { lat: 0.1, lon: 0 }, 12: { lat: 0.2, lon: 0 }, 13: { lat: 0.3, lon: 0 } };
  const snap = { elements: [W(1, [10, 11]), W(2, [11, 12, 13]), W(3, [99, 98]),
    R(200, [m('way', 1), m('way', 2)]), R(100, [m('relation', 200), m('way', 1), m('way', 3)])] };
  const l = lengthStats(snap, 100, nodes);
  assert.ok(Math.abs(l.totalKm - 33.4) < 0.3);
  assert.strictEqual(l.longest.id, 2);
  assert.strictEqual(l.noPosition, 1);
});

const { relationLengths, pieceStats } = require('../src/stats.js');
// Un degré de latitude fait environ 111,19 km.
const POS = { 10: { lat: 0, lon: 0 }, 11: { lat: 1, lon: 0 }, 12: { lat: 2, lon: 0 }, 13: { lat: 3, lon: 0 } };

test('relationLengths : membres, chemins et longueur de chaque relation de l\'arbre (ticket 9)', () => {
  const snap = { elements: [W(1, [10, 11]), W(2, [11, 12]), W(3, [12, 13]),
    R(200, [m('way', 1), m('way', 2)], { name: 'A' }), R(201, [m('way', 3)], { name: 'B' }),
    R(100, [m('relation', 200), m('relation', 201)], { name: 'Racine' })] };
  const rows = relationLengths(snap, 100, POS);
  assert.deepStrictEqual(rows.map(r => [r.id, r.members, r.ways]), [[100, 2, 3], [200, 2, 2], [201, 1, 1]]);
  assert.ok(Math.abs(rows[0].km - 333.6) < 0.5, 'racine : 3 degrés');
  assert.ok(Math.abs(rows[1].km - 222.4) < 0.5);
  assert.strictEqual(rows[1].name, 'A');
});

test('pieceStats : chemins, nœuds et longueur de chaque morceau (ticket 3)', () => {
  const snap = { elements: [W(1, [10, 11]), W(2, [11, 12]), W(3, [12, 13]), R(100, [m('way', 1), m('way', 2), m('way', 3)])] };
  const res = { relationId: 100, pieces: [[0, 1], [2]] };
  const ps = pieceStats(snap, res, POS);
  assert.deepStrictEqual(ps.map(p => [p.ways, p.nodes]), [[2, 3], [1, 2]]);
  assert.ok(Math.abs(ps[0].km - 222.4) < 0.5 && Math.abs(ps[1].km - 111.2) < 0.5);
});

const { pieceWayRefs } = require('../src/stats.js');

test('pieceStats : un morceau dont tous les bouts se raccordent est une boucle (ticket 3)', () => {
  const loop = { elements: [W(1, [1, 2, 3]), W(2, [3, 4, 1]), R(100, [m('way', 1), m('way', 2)])] };
  assert.strictEqual(pieceStats(loop, { relationId: 100, pieces: [[0, 1]] }, {})[0].closed, true);
  const open = { elements: [W(1, [1, 2, 3]), W(2, [3, 4, 5]), R(100, [m('way', 1), m('way', 2)])] };
  assert.strictEqual(pieceStats(open, { relationId: 100, pieces: [[0, 1]] }, {})[0].closed, false);
  const self = { elements: [W(1, [1, 2, 3, 1]), R(100, [m('way', 1)])] };
  assert.strictEqual(pieceStats(self, { relationId: 100, pieces: [[0]] }, {})[0].closed, true);
});

test('pieceWayRefs : les chemins d\'un morceau, sans doublon (ticket 3)', () => {
  const snap = { elements: [W(1, [1, 2]), W(2, [2, 3]), W(3, [3, 4]), R(100, [m('way', 1), m('way', 2), m('way', 1), m('way', 3)])] };
  const res = { relationId: 100, pieces: [[0, 1, 2], [3]] };
  assert.deepStrictEqual(pieceWayRefs(snap, res, 0), [1, 2]);
  assert.deepStrictEqual(pieceWayRefs(snap, res, 1), [3]);
  assert.deepStrictEqual(pieceWayRefs(snap, res, 5), []);
});
