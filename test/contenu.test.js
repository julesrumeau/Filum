const test = require('node:test');
const assert = require('node:assert');
const { insidePolygon, bboxOf, splitBbox, summarize, ringsToSegments } = require('../src/contenu.js');

const square = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]; // [lon, lat]

test('insidePolygon : dedans, dehors, et trou (anneau intérieur) pris en compte par parité', () => {
  const outer = square(0, 0, 10, 10), hole = square(4, 4, 6, 6);
  const segs = ringsToSegments([outer, hole]);
  assert.strictEqual(insidePolygon({ lon: 2, lat: 2 }, segs), true);
  assert.strictEqual(insidePolygon({ lon: 5, lat: 5 }, segs), false);   // dans le trou
  assert.strictEqual(insidePolygon({ lon: 20, lat: 5 }, segs), false);
  assert.strictEqual(insidePolygon({ lon: 5, lat: -1 }, segs), false);
});

test('insidePolygon : les chemins peuvent venir dans le désordre, découpés en plusieurs morceaux', () => {
  const left = [[0, 0], [0, 10]], top = [[0, 10], [10, 10]], right = [[10, 10], [10, 0]], bottom = [[10, 0], [0, 0]];
  const segs = ringsToSegments([top, bottom, left, right]);
  assert.strictEqual(insidePolygon({ lon: 5, lat: 5 }, segs), true);
  assert.strictEqual(insidePolygon({ lon: 15, lat: 5 }, segs), false);
});

test('bboxOf : boîte englobante [ouest, sud, est, nord]', () => {
  assert.deepStrictEqual(bboxOf([{ lon: 7, lat: 48 }, { lon: 7.5, lat: 48.2 }, { lon: 7.2, lat: 47.9 }]), [7, 47.9, 7.5, 48.2]);
});

test('splitBbox : une petite boîte reste entière, une grande est découpée en cases de 0,25 degré carré au plus', () => {
  assert.deepStrictEqual(splitBbox([7, 48, 7.2, 48.2], 0.25), [[7, 48, 7.2, 48.2]]);
  const parts = splitBbox([0, 0, 2, 1], 0.25);
  assert.ok(parts.length >= 8);
  parts.forEach(b => assert.ok((b[2] - b[0]) * (b[3] - b[1]) <= 0.25 + 1e-9));
  assert.deepStrictEqual([Math.min(...parts.map(b => b[0])), Math.max(...parts.map(b => b[2]))], [0, 2]);
});

test('summarize : compte par type les éléments étiquetés dans le polygone, ignore les nœuds sans tag et les dehors', () => {
  const segs = ringsToSegments([square(0, 0, 10, 10)]);
  const els = [
    { type: 'node', id: 1, lon: 1, lat: 1, tags: { natural: 'tree' } },
    { type: 'node', id: 2, lon: 2, lat: 2, tags: { natural: 'tree', species: 'oak' } },
    { type: 'node', id: 3, lon: 3, lat: 3, tags: { amenity: 'bench' } },
    { type: 'node', id: 4, lon: 4, lat: 4 },
    { type: 'node', id: 5, lon: 50, lat: 50, tags: { natural: 'tree' } },
    { type: 'node', id: 6, lon: 5, lat: 5, tags: { name: 'sans type' } },
    { type: 'way', id: 9, nodes: [1, 2], tags: { leisure: 'playground' } },
  ];
  const s = summarize(els, segs);
  assert.deepStrictEqual(s.groups.map(g => [g.label, g.count]), [['natural=tree', 2], ['amenity=bench', 1], ['leisure=playground', 1]]);
  assert.deepStrictEqual(s.groups[0].points.map(p => p.id).sort(), [1, 2]);
  assert.strictEqual(s.total, 4);
});

test('summarize : un chemin est dedans si son premier nœud connu l\'est ; sans nœud connu, ignoré', () => {
  const segs = ringsToSegments([square(0, 0, 10, 10)]);
  const els = [
    { type: 'node', id: 1, lon: 1, lat: 1 }, { type: 'node', id: 2, lon: 40, lat: 40 },
    { type: 'way', id: 7, nodes: [1, 2], tags: { building: 'yes' } },
    { type: 'way', id: 8, nodes: [2, 1], tags: { building: 'yes' } },
    { type: 'way', id: 9, nodes: [99], tags: { building: 'yes' } },
  ];
  assert.deepStrictEqual(summarize(els, segs).groups.map(g => [g.label, g.count]), [['building=yes', 1]]);
});
