const test = require('node:test');
const assert = require('node:assert');
const { repairCandidates } = require('../src/repair.js');

const W = (id, nodes, tags) => ({ type: 'way', id, nodes, tags: tags || {} });

test('un chemin hors relation qui touche les deux côtés du trou est le meilleur candidat', () => {
  const gap = { fromEnds: [12], toEnds: [30, 31] };
  const nodeWays = {
    12: [W(1, [10, 11, 12]), W(500, [12, 20, 30], { highway: 'path', name: 'Raccord' })],
    30: [W(500, [12, 20, 30]), W(2, [30, 31])],
    31: [W(2, [30, 31]), W(600, [31, 40], { highway: 'track' })],
  };
  const c = repairCandidates(gap, nodeWays, { 1: true, 2: true });
  assert.deepStrictEqual(c.map(x => [x.id, x.bridges]), [[500, true], [600, false]]);
  assert.deepStrictEqual(c[0].touches.sort(), [12, 30]);
  assert.strictEqual(c[0].tags.name, 'Raccord');
});

test('les chemins déjà membres de la relation ne sont jamais proposés, ni les doublons', () => {
  const gap = { fromEnds: [1], toEnds: [2] };
  const nodeWays = { 1: [W(7, [1, 2])], 2: [W(7, [1, 2])] };
  assert.deepStrictEqual(repairCandidates(gap, nodeWays, { 7: true }), []);
  assert.strictEqual(repairCandidates(gap, nodeWays, {}).length, 1);
});

test('un nœud sans autre chemin ne donne aucun candidat, nœud inconnu toléré', () => {
  assert.deepStrictEqual(repairCandidates({ fromEnds: [1], toEnds: [2] }, { 1: [] }, {}), []);
});

test('un chemin touche un seul côté : candidat sans pont, trié après les ponts', () => {
  const gap = { fromEnds: [1], toEnds: [2] };
  const nodeWays = { 1: [W(8, [1, 9]), W(5, [1, 6, 2])], 2: [W(5, [1, 6, 2])] };
  assert.deepStrictEqual(repairCandidates(gap, nodeWays, {}).map(x => [x.id, x.bridges]), [[5, true], [8, false]]);
});

test('le candidat garde sa version, sa date, son auteur et son changeset (indice : créé dans le même changeset que la cassure)', () => {
  const w = { type: 'way', id: 9, nodes: [1, 2], tags: {}, version: 1, timestamp: '2026-10-13T11:38:31Z', user: 'u', changeset: 190448839 };
  const c = repairCandidates({ fromEnds: [1], toEnds: [2] }, { 1: [w] }, {})[0];
  assert.deepStrictEqual([c.version, c.timestamp, c.user, c.changeset], [1, '2026-10-13T11:38:31Z', 'u', 190448839]);
});
