const test = require('node:test');
const assert = require('node:assert');
const { objectOf, idUrl, josmObjectUrl, josmAreaUrl } = require('../src/editeurs.js');

test('objectOf : un chemin ou un nœud sélectionné, sinon la relation affichée (ticket 28)', () => {
  assert.deepStrictEqual(objectOf('way:740533245', 20196176), { kind: 'way', id: 740533245 });
  assert.deepStrictEqual(objectOf('node:5', 100), { kind: 'node', id: 5 });
  assert.deepStrictEqual(objectOf('gap:100:2', 100), { kind: 'relation', id: 100 }, 'un trou n\'est pas un objet OSM : la relation');
  assert.deepStrictEqual(objectOf(null, 100), { kind: 'relation', id: 100 });
  assert.strictEqual(objectOf(null, 0), null);
  assert.strictEqual(objectOf('way:abc', 0), null);
});

test('idUrl : iD sur openstreetmap.org, avec l\'objet et la position facultatifs (ticket 28)', () => {
  assert.strictEqual(idUrl({ kind: 'way', id: 123 }, { zoom: 19, lat: 48.898136, lon: -1.51117 }), 'https://www.openstreetmap.org/edit?editor=id&way=123#map=19/48.89814/-1.51117');
  assert.strictEqual(idUrl({ kind: 'relation', id: 7 }), 'https://www.openstreetmap.org/edit?editor=id&relation=7');
  assert.strictEqual(idUrl(null, { zoom: 12.34, lat: 1, lon: 2 }), 'https://www.openstreetmap.org/edit?editor=id#map=12.3/1.00000/2.00000');
});

test('josmObjectUrl : télécommande de JOSM (et Vespucci), identifiant forcé en nombre (ticket 28)', () => {
  assert.strictEqual(josmObjectUrl({ kind: 'way', id: 123 }), 'http://127.0.0.1:8111/load_object?objects=w123&relation_members=true');
  assert.strictEqual(josmObjectUrl({ kind: 'node', id: 5 }), 'http://127.0.0.1:8111/load_object?objects=n5&relation_members=true');
  assert.strictEqual(josmObjectUrl({ kind: 'relation', id: 7 }), 'http://127.0.0.1:8111/load_object?objects=r7&relation_members=true');
  assert.strictEqual(josmObjectUrl({ kind: 'way', id: '1&x=<' }), null);
});

test('josmAreaUrl : charger une zone dans JOSM (ticket 28)', () => {
  assert.strictEqual(josmAreaUrl({ left: -1.5123, right: -1.5101, top: 48.8992, bottom: 48.8971 }),
    'http://127.0.0.1:8111/load_and_zoom?left=-1.51230&right=-1.51010&top=48.89920&bottom=48.89710');
  assert.strictEqual(josmAreaUrl({ left: 'a', right: 1, top: 2, bottom: 1 }), null);
});
