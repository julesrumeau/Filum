const test = require('node:test');
const assert = require('node:assert');
const { parseRelationInput, buildSearch, readSearch } = require('../src/input.js');

test('un numéro seul, avec ou sans espaces', () => {
  assert.strictEqual(parseRelationInput('7444').id, 7444);
  assert.strictEqual(parseRelationInput('  2952375 ').id, 2952375);
});

test('les formes courtes : relation 123, relation/123, r123, r 123, #123', () => {
  ['relation 123', 'Relation/123', 'r123', 'R 123', '#123', 'relation #123'].forEach(t => {
    assert.strictEqual(parseRelationInput(t).id, 123, t);
  });
});

test('une adresse openstreetmap.org, avec suite (#map, ?, /history, barre finale)', () => {
  [
    'https://www.openstreetmap.org/relation/2952375',
    'openstreetmap.org/relation/2952375/',
    'https://www.openstreetmap.org/relation/2952375#map=14/48.1/7.2',
    'https://www.openstreetmap.org/relation/2952375?foo=1',
    'https://www.openstreetmap.org/relation/2952375/history',
    'https://osm.org/relation/2952375',
  ].forEach(t => assert.strictEqual(parseRelationInput(t).id, 2952375, t));
});

test('l\'adresse d\'un chemin ou d\'un nœud est refusée avec une explication, pas prise pour une relation', () => {
  const w = parseRelationInput('https://www.openstreetmap.org/way/805380795');
  assert.strictEqual(w.id, undefined);
  assert.match(w.error, /chemin/);
  assert.match(parseRelationInput('https://www.openstreetmap.org/node/5').error, /nœud/);
});

test('texte sans numéro, vide ou numéro nul : erreur', () => {
  ['', 'abc', '0', 'relation'].forEach(t => assert.ok(parseRelationInput(t).error, t));
});

test('buildSearch : relation seule, ou avec la période (dates AAAA-MM-JJ)', () => {
  assert.strictEqual(buildSearch(7444), '?relation=7444');
  assert.strictEqual(buildSearch(7444, '2025-01-05T10:00:00Z', '2026-03-01T00:00:00Z'), '?relation=7444&du=2025-01-05&au=2026-03-01');
  assert.strictEqual(buildSearch(7444, null, '2026-03-01T00:00:00Z'), '?relation=7444&au=2026-03-01');
});

test('readSearch relit relation et période, ignore ce qui est invalide', () => {
  assert.deepStrictEqual(readSearch('?relation=7444&du=2025-01-05&au=2026-03-01'), { id: 7444, from: '2025-01-05', to: '2026-03-01' });
  assert.deepStrictEqual(readSearch('?relation=7444'), { id: 7444, from: null, to: null });
  assert.deepStrictEqual(readSearch('?relation=7444&du=hier&au=2026-13-45'), { id: 7444, from: null, to: null });
  assert.strictEqual(readSearch('?relation=abc'), null);
  assert.strictEqual(readSearch(''), null);
});
