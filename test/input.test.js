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

test('l\'adresse d\'un chemin donne { way }, celle d\'un nœud est refusée avec une explication', () => {
  assert.deepStrictEqual(parseRelationInput('https://www.openstreetmap.org/way/805380795'), { way: 805380795 });
  assert.strictEqual(parseRelationInput('https://www.openstreetmap.org/way/805380795').id, undefined);
  ['way 55', 'way/55', 'w55', 'W 55', 'openstreetmap.org/way/55/history'].forEach(t => assert.strictEqual(parseRelationInput(t).way, 55, t));
  const n = parseRelationInput('https://www.openstreetmap.org/node/5');
  assert.strictEqual(n.way, undefined);
  assert.match(n.error, /nœud/);
});

test('texte sans numéro, vide ou numéro nul : erreur', () => {
  ['', 'abc', '0', 'relation'].forEach(t => assert.ok(parseRelationInput(t).error, t));
});

test('buildSearch : relation seule, ou avec la période (dates AAAA-MM-JJ)', () => {
  assert.strictEqual(buildSearch(7444), '?relation=7444');
  assert.strictEqual(buildSearch(7444, '2025-01-05T00:00:00Z', '2026-03-01T23:59:59Z'), '?relation=7444&du=2025-01-05&au=2026-03-01');
  assert.strictEqual(buildSearch(7444, null, '2026-03-01T23:59:59Z'), '?relation=7444&au=2026-03-01');
});

test('readSearch relit relation et période, ignore ce qui est invalide', () => {
  assert.deepStrictEqual(readSearch('?relation=7444&du=2025-01-05&au=2026-03-01'), { id: 7444, from: '2025-01-05', to: '2026-03-01' });
  assert.deepStrictEqual(readSearch('?relation=7444'), { id: 7444, from: null, to: null });
  assert.deepStrictEqual(readSearch('?relation=7444&du=hier&au=2026-13-45'), { id: 7444, from: null, to: null });
  assert.strictEqual(readSearch('?relation=abc'), null);
  assert.strictEqual(readSearch(''), null);
});

test('une adresse Waymarked Trails donne la relation de son paramètre id (avec & ou &amp;)', () => {
  [
    'https://hiking.waymarkedtrails.org/#route?id=21373346&type=relation',
    'https://hiking.waymarkedtrails.org/#route?id=21373346&amp;type=relation',
    'https://cycling.waymarkedtrails.org/#route?type=relation&id=21373346&map=9/44/5',
    'waymarkedtrails.org/#route?id=21373346',
  ].forEach(s => assert.deepEqual(parseRelationInput(s), { id: 21373346 }, s));
});

test('buildSearch garde l\'heure quand le bord n\'est pas une borne de journée (ticket 21)', () => {
  assert.strictEqual(buildSearch(17032107, '2025-07-18T20:33:22Z', '2025-07-18T20:45:18Z'),
    '?relation=17032107&du=2025-07-18T20:33:22Z&au=2025-07-18T20:45:18Z');
});

test('readSearch accepte une date ou une date avec heure (UTC), ignore une heure invalide', () => {
  assert.deepStrictEqual(readSearch('?relation=1&du=2025-07-18T20:33:22Z&au=2025-07-18T20:45:18Z'),
    { id: 1, from: '2025-07-18T20:33:22Z', to: '2025-07-18T20:45:18Z' });
  assert.deepStrictEqual(readSearch('?relation=1&du=2025-07-18T25:00:00Z'), { id: 1, from: null, to: null });
});

test('periodBound complète une date en début ou fin de journée, laisse une date avec heure telle quelle', () => {
  const { periodBound } = require('../src/input.js');
  assert.strictEqual(periodBound('2025-07-18', false), '2025-07-18T00:00:00Z');
  assert.strictEqual(periodBound('2025-07-18', true), '2025-07-18T23:59:59Z');
  assert.strictEqual(periodBound('2025-07-18T20:33:22Z', true), '2025-07-18T20:33:22Z');
});

const { buildHash, readHash } = require('../src/input.js');

test('buildHash : zoom, position et objet sélectionné, au format d\'OpenStreetMap (ticket 27)', () => {
  assert.strictEqual(buildHash({ zoom: 19, lat: 48.898136, lon: -1.51117, sel: 'way:740533245' }), '#map=19/48.89814/-1.51117&id=way/740533245');
  assert.strictEqual(buildHash({ zoom: 12.4, lat: 48.3655, lon: -4.4415 }), '#map=12.4/48.36550/-4.44150');
  assert.strictEqual(buildHash({ sel: 'node:5' }), '#id=node/5');
  assert.strictEqual(buildHash({ sel: 'gap:100:2' }), '#id=gap/100/2');
  assert.strictEqual(buildHash({}), '');
  assert.strictEqual(buildHash(null), '');
});

test('readHash : relit le zoom, la position et l\'objet, ignore ce qui est invalide (ticket 27)', () => {
  assert.deepStrictEqual(readHash('#map=19/48.898136/-1.511170&id=way/740533245'), { zoom: 19, lat: 48.898136, lon: -1.51117, sel: 'way:740533245' });
  assert.deepStrictEqual(readHash('#id=gap/100/2'), { zoom: null, lat: null, lon: null, sel: 'gap:100:2' });
  assert.deepStrictEqual(readHash('#map=abc/1/2&id=way/x'), { zoom: null, lat: null, lon: null, sel: null });
  assert.deepStrictEqual(readHash('#map=99/10/20'), { zoom: null, lat: null, lon: null, sel: null }, 'zoom hors de 0 à 22');
  assert.deepStrictEqual(readHash('#map=10/95/20'), { zoom: null, lat: null, lon: null, sel: null }, 'latitude hors limites');
  assert.deepStrictEqual(readHash('#id=<script>/1'), { zoom: null, lat: null, lon: null, sel: null });
  assert.deepStrictEqual(readHash(''), { zoom: null, lat: null, lon: null, sel: null });
});
