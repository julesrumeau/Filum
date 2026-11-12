const test = require('node:test');
const assert = require('node:assert');
const { routeDirection } = require('../src/sens.js');

const m = (ref, nodes, role) => ({ ref, nodes, role: role || '' });

test('routeDirection : une suite de chemins dans l\'ordre de la liste donne le sens de la liste (message 31)', () => {
  const d = routeDirection([m(1, [10, 11, 12]), m(2, [12, 13, 14]), m(3, [14, 15])]);
  assert.deepStrictEqual(d.path.map(p => [p.ref, p.forward]), [[1, true], [2, true], [3, true]]);
  assert.strictEqual(d.start, 10);
  assert.strictEqual(d.end, 15);
});

test('routeDirection : un chemin dessiné à l\'envers est parcouru à l\'envers', () => {
  const d = routeDirection([m(1, [10, 11, 12]), m(2, [14, 13, 12]), m(3, [14, 15])]);
  assert.deepStrictEqual(d.path.map(p => [p.ref, p.forward]), [[1, true], [2, false], [3, true]]);
  assert.strictEqual(d.start, 10);
});

test('routeDirection : une liste en sens inverse du tracé donne le parcours dans le sens de la liste', () => {
  // le tracé physique va de 10 à 15 mais la liste commence par le chemin 3 : le parcours part de 15
  const d = routeDirection([m(3, [14, 15]), m(2, [12, 13, 14]), m(1, [10, 11, 12])]);
  assert.deepStrictEqual(d.path.map(p => [p.ref, p.forward]), [[3, false], [2, false], [1, false]]);
  assert.strictEqual(d.start, 15);
  assert.strictEqual(d.end, 10);
});

test('routeDirection : une liste en deux moitiés bien ordonnées mais tournées (12432165) garde le bon sens', () => {
  // tracé 10 -> 16 ; la liste commence au milieu : 3, 4, puis 1, 2
  const d = routeDirection([m(3, [14, 15]), m(4, [15, 16]), m(1, [10, 11, 12]), m(2, [12, 13, 14])]);
  assert.strictEqual(d.start, 10);
  assert.deepStrictEqual(d.path.map(p => p.ref), [1, 2, 3, 4]);
});

test('routeDirection : null pour une boucle, une branche, un raccord en T, un rond-point, un doublon ou un trou', () => {
  assert.strictEqual(routeDirection([m(1, [10, 11, 12]), m(2, [12, 13]), m(3, [12, 14])]), null, 'branche');
  assert.strictEqual(routeDirection([m(1, [10, 11, 12]), m(2, [11, 20])]), null, 'raccord en T');
  assert.strictEqual(routeDirection([m(1, [10, 11, 12]), m(2, [12, 13, 14, 12])]), null, 'chemin fermé');
  assert.strictEqual(routeDirection([m(1, [10, 11]), m(1, [10, 11])]), null, 'doublon');
  assert.strictEqual(routeDirection([m(1, [10, 11]), m(2, [20, 21])]), null, 'deux morceaux');
  assert.strictEqual(routeDirection([m(1, [10, 11])]), null, 'un seul chemin : rien à orienter');
  assert.strictEqual(routeDirection([]), null);
});

test('routeDirection : null avec des rôles forward, backward ou de variante (le sens y est déjà dit autrement)', () => {
  ['forward', 'backward', 'alternative', 'excursion'].forEach(role => {
    assert.strictEqual(routeDirection([m(1, [10, 11, 12]), m(2, [12, 13], role)]), null, role);
  });
  assert.ok(routeDirection([m(1, [10, 11, 12]), m(2, [12, 13], 'main')]), 'main est accepté');
});

test('routeDirection : une liste qui saute d\'un bout à l\'autre sans ordre net n\'a pas de sens déduit', () => {
  // tracé 10 -> 15 en 5 chemins ; liste mélangée 1, 3, 5, 2, 4 : environ la moitié des paires monte
  const ways = [m(1, [10, 11]), m(2, [11, 12]), m(3, [12, 13]), m(4, [13, 14]), m(5, [14, 15])];
  assert.strictEqual(routeDirection([ways[0], ways[2], ways[4], ways[1], ways[3]]), null);
});

test('routeDirection : une boucle (itinéraire fermé de plusieurs chemins) part du début de la liste et revient au même point (message 31)', () => {
  const d = routeDirection([m(1, [10, 11, 12]), m(2, [12, 13, 14]), m(3, [14, 15, 10])]);
  assert.strictEqual(d.loop, true);
  assert.deepStrictEqual(d.path.map(p => [p.ref, p.forward]), [[1, true], [2, true], [3, true]]);
  assert.strictEqual(d.start, 10);
  assert.strictEqual(d.end, 10);
});

test('routeDirection : une boucle dont un chemin est dessiné à l\'envers garde le sens de la liste', () => {
  const d = routeDirection([m(1, [10, 11, 12]), m(2, [14, 13, 12]), m(3, [14, 15, 10])]);
  assert.deepStrictEqual(d.path.map(p => [p.ref, p.forward]), [[1, true], [2, false], [3, true]]);
});

test('routeDirection : une boucle dont la liste est à l\'envers du premier chemin est parcourue dans le sens de la liste', () => {
  // le premier membre (1) est écrit de 12 vers 10 : on le parcourt de 12 vers 10 puis on enchaîne dans l'ordre de la liste
  const d = routeDirection([m(1, [12, 11, 10]), m(3, [10, 15, 14]), m(2, [14, 13, 12])]);
  assert.strictEqual(d.loop, true);
  assert.deepStrictEqual(d.path.map(p => p.ref), [1, 3, 2]);
  assert.strictEqual(d.start, d.end);
});

test('routeDirection : une boucle avec une branche ou une liste mélangée n\'a pas de sens (message 31)', () => {
  assert.strictEqual(routeDirection([m(1, [10, 11, 12]), m(2, [12, 13, 10]), m(3, [12, 20])]), null, 'branche');
  const ways = [m(1, [10, 11]), m(2, [11, 12]), m(3, [12, 13]), m(4, [13, 14]), m(5, [14, 10])];
  assert.strictEqual(routeDirection([ways[0], ways[2], ways[4], ways[1], ways[3]]), null, 'liste mélangée');
});

const { rolePaths, roleKind } = require('../src/sens.js');

test('roleKind : forward, backward ou dans les deux sens (aucun rôle, ou main), les autres rôles sont ignorés (ticket 1)', () => {
  assert.strictEqual(roleKind('forward'), 'forward');
  assert.strictEqual(roleKind('backward'), 'backward');
  assert.strictEqual(roleKind(''), 'both');
  assert.strictEqual(roleKind(undefined), 'both');
  assert.strictEqual(roleKind('main'), 'both');
  assert.strictEqual(roleKind('alternative'), null);
  assert.strictEqual(roleKind('platform'), null);
});

test('rolePaths : les chemins forward et backward avec leur sens de circulation, rien pour les autres (ticket 1)', () => {
  const r = rolePaths([m(1, [10, 11, 12], 'forward'), m(2, [20, 21], 'backward'), m(3, [30, 31], ''), m(4, [40, 41], 'platform')]);
  assert.deepStrictEqual(r.hasDirections, true);
  assert.deepStrictEqual(r.paths.map(p => [p.ref, p.kind, p.nodes]), [[1, 'forward', [10, 11, 12]], [2, 'backward', [21, 20]]]);
  assert.deepStrictEqual(r.kinds, { 1: 'forward', 2: 'backward', 3: 'both' });
});

test('rolePaths : sans forward ni backward, hasDirections est faux (ticket 1)', () => {
  const r = rolePaths([m(1, [10, 11], ''), m(2, [11, 12], 'main')]);
  assert.strictEqual(r.hasDirections, false);
  assert.deepStrictEqual(r.paths, []);
});
