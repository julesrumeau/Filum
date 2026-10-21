const test = require('node:test');
const assert = require('node:assert');
const { buildRings } = require('../src/rings.js');

const wm = (ref, role, nodes) => ({ ref, role, nodes });

test('un contour fermé en trois chemins forme un seul anneau extérieur fermé', () => {
  const r = buildRings([wm(1, 'outer', [1, 2, 3]), wm(2, 'outer', [3, 4, 5]), wm(3, 'outer', [5, 6, 1])]);
  assert.strictEqual(r.length, 1);
  assert.deepStrictEqual([r[0].role, r[0].closed, r[0].ways.slice().sort()], ['outer', true, [1, 2, 3]]);
  assert.deepStrictEqual(r[0].openEnds, []);
});

test('un chemin déjà bouclé est un anneau fermé à lui seul', () => {
  const r = buildRings([wm(1, 'outer', [1, 2, 3, 1])]);
  assert.deepStrictEqual([r.length, r[0].closed, r[0].ways], [1, true, [1]]);
});

test('l\'ordre des chemins dans la liste n\'importe pas, les sens non plus', () => {
  const r = buildRings([wm(3, 'outer', [1, 6, 5]), wm(1, 'outer', [1, 2, 3]), wm(2, 'outer', [5, 4, 3])]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].closed, true);
});

test('contour extérieur et trous séparés par rôle ; sans rôle = extérieur', () => {
  const r = buildRings([
    wm(1, '', [1, 2, 3, 1]), wm(2, 'inner', [10, 11, 12, 10]), wm(3, 'inner', [20, 21, 22, 20]),
  ]);
  assert.deepStrictEqual(r.map(x => x.role).sort(), ['inner', 'inner', 'outer']);
});

test('un anneau ouvert donne ses deux bouts libres', () => {
  const r = buildRings([wm(1, 'outer', [1, 2, 3]), wm(2, 'outer', [3, 4, 5])]);
  assert.strictEqual(r.length, 1);
  assert.strictEqual(r[0].closed, false);
  assert.deepStrictEqual(r[0].openEnds.slice().sort(), [1, 5]);
});

test('deux chemins qui ne se touchent pas : deux anneaux ouverts', () => {
  const r = buildRings([wm(1, 'outer', [1, 2]), wm(2, 'outer', [7, 8])]);
  assert.strictEqual(r.length, 2);
  assert.ok(r.every(x => !x.closed));
});
