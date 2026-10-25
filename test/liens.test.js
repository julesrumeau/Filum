const test = require('node:test');
const assert = require('node:assert');
const { toolLinks } = require('../src/liens.js');
const { userLink } = require('../src/html.js');

const names = (tags) => toolLinks(tags, 42).map(l => l.name);

test('toolLinks : randonnée, vélo, VTT, cheval et roller vont vers le bon sous-site de Waymarked Trails', () => {
  const url = (route) => toolLinks({ route }, 42).find(l => l.name === 'Waymarked Trails').url;
  assert.strictEqual(url('hiking'), 'https://hiking.waymarkedtrails.org/#route?id=42&type=relation');
  assert.match(url('foot'), /^https:\/\/hiking\./);
  assert.match(url('bicycle'), /^https:\/\/cycling\./);
  assert.match(url('mtb'), /^https:\/\/mtb\./);
  assert.match(url('horse'), /^https:\/\/riding\./);
  assert.match(url('inline_skates'), /^https:\/\/skating\./);
});

test('toolLinks : bus et transports en commun vont vers PTNA, réseaux de carrefours vers Knooppuntnet', () => {
  assert.deepStrictEqual(names({ route: 'bus' }), ['PTNA']);
  assert.deepStrictEqual(names({ type: 'route_master', route_master: 'bus' }), ['PTNA']);
  assert.strictEqual(toolLinks({ route: 'bus' }, 42)[0].url, 'https://ptna.openstreetmap.de/relation.php?id=42&lang=fr');
  assert.deepStrictEqual(names({ route: 'hiking', 'network:type': 'node_network' }), ['Waymarked Trails', 'Knooppuntnet']);
  assert.strictEqual(toolLinks({ route: 'bicycle', 'network:type': 'node_network' }, 42)[1].url, 'https://knooppuntnet.nl/fr/analysis/route/42');
});

test('toolLinks : type non reconnu ou sans tags, aucun lien ; l\'identifiant est forcé en nombre', () => {
  assert.deepStrictEqual(names({}), []);
  assert.deepStrictEqual(names({ route: 'fitness_trail' }), []);
  assert.deepStrictEqual(toolLinks(undefined, 42), []);
  assert.deepStrictEqual(toolLinks({ route: 'bus' }, '42&x=<script>'), [], 'identifiant invalide : aucun lien');
});

test('userLink : lien vers How did you contribute, nom encodé dans l\'adresse et échappé à l\'affichage', () => {
  assert.strictEqual(userLink('StC'), '<a href="https://hdyc.neis-one.org/?StC" target="_blank" rel="noopener">StC</a>');
  const h = userLink('a b"<x>');
  assert.match(h, /href="https:\/\/hdyc\.neis-one\.org\/\?a%20b%22%3Cx%3E"/);
  assert.doesNotMatch(h, /<x>/);
});
