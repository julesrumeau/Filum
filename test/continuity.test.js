const test = require('node:test');
const assert = require('node:assert');
const { analyzeContinuity } = require('../src/continuity.js');

// Instantané minimal au format Overpass : seuls les chemins et la relation comptent ici.
function way(id, nodes) { return { type: 'way', id, nodes }; }
function rel(id, memberWays) {
  return {
    type: 'relation', id,
    members: memberWays.map(ref => ({ type: 'way', ref, role: '' })),
  };
}
function snapshot(elements) { return { elements }; }

test('deux chemins qui se touchent par une extrémité : aucune discontinuité', () => {
  const snap = snapshot([way(1, [10, 11, 12]), way(2, [12, 13, 14]), rel(100, [1, 2])]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.gaps, []);
});

test('deux chemins sans extrémité commune : une discontinuité entre les membres 0 et 1', () => {
  const snap = snapshot([way(1, [10, 11, 12]), way(2, [20, 21, 22]), rel(100, [1, 2])]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.gaps.length, 1);
  assert.strictEqual(res.gaps[0].fromIndex, 0);
  assert.strictEqual(res.gaps[0].toIndex, 1);
});

test('un chemin parcouru à l\'envers reste continu', () => {
  const snap = snapshot([way(1, [10, 11, 12]), way(2, [14, 13, 12]), rel(100, [1, 2])]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).gaps, []);
});

test('chemin raccourci à une extrémité : la discontinuité apparaît sans que la relation change', () => {
  const avant = snapshot([way(1, [10, 11, 12]), way(2, [12, 13, 14]), rel(100, [1, 2])]);
  const apres = snapshot([way(1, [10, 11]), way(2, [12, 13, 14]), rel(100, [1, 2])]);
  assert.strictEqual(analyzeContinuity(avant, 100).gaps.length, 0);
  assert.strictEqual(analyzeContinuity(apres, 100).gaps.length, 1);
});

test('nœud du milieu supprimé : la continuité n\'est pas affectée', () => {
  const snap = snapshot([way(1, [10, 12]), way(2, [12, 13, 14]), rel(100, [1, 2])]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).gaps, []);
});

test('l\'ambiguïté du premier chemin est levée par le suivant (3 chemins en chaîne)', () => {
  const snap = snapshot([
    way(1, [10, 11, 12]), way(2, [10, 20, 21]), way(3, [21, 30, 31]), rel(100, [1, 2, 3]),
  ]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).gaps, []);
});

test('un chemin absent de l\'instantané est signalé comme membre manquant', () => {
  const snap = snapshot([way(1, [10, 11, 12]), rel(100, [1, 2])]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.missing, [2]);
});

test('les membres qui ne sont pas des chemins sont ignorés', () => {
  const snap = snapshot([
    way(1, [10, 11, 12]), way(2, [12, 13]),
    { type: 'relation', id: 100, members: [
      { type: 'way', ref: 1, role: '' },
      { type: 'node', ref: 99, role: 'stop' },
      { type: 'way', ref: 2, role: '' },
    ] },
  ]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).gaps, []);
});

test('une relation inconnue lève une erreur claire', () => {
  assert.throws(() => analyzeContinuity(snapshot([]), 100), /relation 100/);
});

const { analyzeTree } = require('../src/continuity.js');

test('une super-relation est analysée sous-relation par sous-relation, chacune avec ses discontinuités', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]), way(3, [20, 21]), way(4, [30, 31]),
    { type: 'relation', id: 10, tags: { name: 'Etape A' }, members: [
      { type: 'way', ref: 1, role: '' }, { type: 'way', ref: 2, role: '' } ] },
    { type: 'relation', id: 11, tags: { name: 'Etape B' }, members: [
      { type: 'way', ref: 3, role: '' }, { type: 'way', ref: 4, role: '' } ] },
    { type: 'relation', id: 100, tags: { name: 'Route' }, members: [
      { type: 'relation', ref: 10, role: '' }, { type: 'relation', ref: 11, role: '' } ] },
  ]);
  const res = analyzeTree(snap, 100);
  assert.deepStrictEqual(res.map(r => r.relationId), [100, 10, 11]);
  assert.strictEqual(res[1].gaps.length, 0);
  assert.strictEqual(res[2].gaps.length, 1);
  assert.strictEqual(res[2].name, 'Etape B');
});

test('une relation qui se contient elle-même ne boucle pas', () => {
  const snap = snapshot([
    { type: 'relation', id: 100, members: [{ type: 'relation', ref: 100, role: '' }] },
  ]);
  assert.deepStrictEqual(analyzeTree(snap, 100).map(r => r.relationId), [100]);
});

// Connexité (vrai trou) et ordre (liste mal triée) sont deux choses distinctes.
const junction = [way(1, [10, 11]), way(2, [11, 12]), way(3, [11, 13]), way(4, [11, 14])];

test('carrefour à 4 chemins visité dans le désordre : connexe, donc aucun trou', () => {
  const res = analyzeContinuity(snapshot([...junction, rel(100, [2, 1, 3, 4])]), 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.strictEqual(res.pieces.length, 1);
});

test('carrefour : l\'ordre non séquentiel est signalé à part, pas comme un trou', () => {
  const res = analyzeContinuity(snapshot([...junction, rel(100, [1, 2, 3])]), 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.strictEqual(res.orderIssues.length, 1);
  assert.strictEqual(res.orderIssues[0].fromIndex, 1);
  assert.strictEqual(res.orderIssues[0].toIndex, 2);
});

test('une liste bien ordonnée n\'a ni trou ni problème d\'ordre', () => {
  const res = analyzeContinuity(snapshot([...junction, rel(100, [1, 2])]), 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('raccord par un nœud du milieu d\'un chemin : connexe, mais l\'ordre est signalé', () => {
  const snap = snapshot([way(1, [10, 11, 12]), way(2, [11, 20]), rel(100, [1, 2])]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.strictEqual(res.pieces.length, 1);
  assert.strictEqual(res.orderIssues.length, 1);
});

test('deux groupes de chemins sans nœud commun : deux morceaux et un vrai trou', () => {
  const snap = snapshot([way(1, [10, 11]), way(2, [11, 12]), way(3, [30, 31]), rel(100, [1, 2, 3])]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.pieces.length, 2);
  assert.deepStrictEqual(res.pieces.map(p => p.length).sort(), [1, 2]);
  assert.strictEqual(res.gaps.length, 1);
  assert.strictEqual(res.gaps[0].fromIndex, 1);
  assert.strictEqual(res.gaps[0].toIndex, 2);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('un trou n\'est pas aussi compté comme problème d\'ordre', () => {
  const snap = snapshot([way(1, [10, 11]), way(2, [20, 21]), rel(100, [1, 2])]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.gaps.length, 1);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('analyzeTree expose aussi les morceaux et les problèmes d\'ordre', () => {
  const snap = snapshot([...junction, rel(100, [1, 2, 3])]);
  const r = analyzeTree(snap, 100)[0];
  assert.strictEqual(r.pieces.length, 1);
  assert.strictEqual(r.orderIssues.length, 1);
});

// Relation avec rôles : members = [[ref, role], ...]
function relR(id, tags, members) {
  return { type: 'relation', id, tags, members: members.map(m => ({ type: 'way', ref: m[0], role: m[1] })) };
}
const route = { type: 'route' };

test('passage forward vers backward : la chaîne recommence, pas de problème d\'ordre', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]), way(3, [11, 13]), way(4, [13, 10]),
    relR(100, route, [[1, 'forward'], [2, 'forward'], [3, 'backward'], [4, 'backward']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('un vrai trou à l\'intérieur de la chaîne forward est toujours signalé', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [20, 21]), relR(100, route, [[1, 'forward'], [2, 'forward']]),
  ]);
  assert.strictEqual(analyzeContinuity(snap, 100).gaps.length, 1);
});

for (const role of ['alternative', 'excursion', 'approach', 'connection']) {
  test('rôle ' + role + ' : un chemin raccordé à l\'itinéraire ne pose aucun problème', () => {
    const snap = snapshot([
      way(1, [10, 11]), way(2, [11, 12]), way(3, [12, 30, 31]),
      relR(100, route, [[1, ''], [2, ''], [3, role]]),
    ]);
    const res = analyzeContinuity(snap, 100);
    assert.deepStrictEqual(res.gaps, []);
    assert.deepStrictEqual(res.orderIssues, []);
    assert.deepStrictEqual(res.detached, []);
  });
}

test('un chemin de variante placé au milieu de la liste ne casse pas l\'ordre de l\'itinéraire principal', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]), way(3, [11, 40, 41]),
    relR(100, route, [[1, ''], [3, 'alternative'], [2, '']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('une variante qui ne touche rien est signalée comme isolée, pas comme trou', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]), way(3, [90, 91]),
    relR(100, route, [[1, ''], [2, ''], [3, 'alternative']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.detached, [2]);
  assert.deepStrictEqual(res.gaps, []);
});

test('une variante qui relie deux morceaux ne comble pas le trou de l\'itinéraire principal', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [20, 21]), way(3, [11, 20]),
    relR(100, route, [[1, ''], [2, ''], [3, 'connection']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.gaps.length, 1);
  assert.deepStrictEqual(res.detached, []);
});

// Polygones : une limite ou un multipolygone doit se refermer sur lui-même.
const poly = { type: 'multipolygon' };

test('contour fermé fait de 3 chemins : aucun bout ouvert', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]), way(3, [12, 10]),
    relR(100, poly, [[1, 'outer'], [2, 'outer'], [3, 'outer']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.isPolygon, true);
  assert.deepStrictEqual(res.openEnds, []);
});

test('un chemin manquant dans le contour laisse deux bouts ouverts', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]),
    relR(100, poly, [[1, 'outer'], [2, 'outer']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.openEnds.slice().sort(), [10, 12]);
});

test('un chemin qui se ferme tout seul est un contour fermé', () => {
  const snap = snapshot([way(1, [10, 11, 12, 10]), relR(100, poly, [[1, 'outer']])]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).openEnds, []);
});

test('deux contours fermés séparés (île) ne sont pas un trou', () => {
  const snap = snapshot([
    way(1, [10, 11, 10]), way(2, [20, 21, 22]), way(3, [22, 20]),
    relR(100, { type: 'boundary', boundary: 'administrative' }, [[1, 'outer'], [2, 'outer'], [3, 'outer']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.openEnds, []);
  assert.deepStrictEqual(res.gaps, []);
});

test('l\'ordre des chemins d\'un polygone n\'a pas d\'importance', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]), way(3, [12, 10]),
    relR(100, poly, [[2, 'outer'], [1, 'outer'], [3, 'outer']]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.openEnds, []);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('chaque rôle (outer, inner) est vérifié séparément', () => {
  const snap = snapshot([
    way(1, [10, 11, 12, 10]), way(2, [20, 21]), way(3, [21, 22]),
    relR(100, poly, [[1, 'outer'], [2, 'inner'], [3, 'inner']]),
  ]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).openEnds.slice().sort(), [20, 22]);
});

test('un chemin sans rôle d\'une limite administrative compte comme extérieur', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [11, 12]),
    relR(100, { type: 'boundary' }, [[1, ''], [2, '']]),
  ]);
  assert.deepStrictEqual(analyzeContinuity(snap, 100).openEnds.slice().sort(), [10, 12]);
});

test('une relation d\'itinéraire n\'est pas un polygone', () => {
  const snap = snapshot([way(1, [10, 11]), relR(100, route, [[1, '']])]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.isPolygon, false);
  assert.deepStrictEqual(res.openEnds, []);
});

test('analyzeTree expose les bouts ouverts et les variantes isolées', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [90, 91]),
    relR(100, poly, [[1, 'outer']]),
    relR(101, route, [[1, ''], [2, 'alternative']]),
  ]);
  const t = analyzeTree({ elements: [...snap.elements, { type: 'relation', id: 1, members: [
    { type: 'relation', ref: 100, role: '' }, { type: 'relation', ref: 101, role: '' }] }] }, 1);
  assert.deepStrictEqual(t.map(r => r.relationId), [1, 100, 101]);
  assert.strictEqual(t[1].openEnds.length, 2);
  assert.deepStrictEqual(t[2].detached, [1]);
});

test('forward puis backward sans aucun nœud commun : c\'est un vrai trou', () => {
  const snap = snapshot([
    way(1, [10, 11]), way(2, [20, 21]),
    relR(100, route, [[1, 'forward'], [2, 'backward']]),
  ]);
  assert.strictEqual(analyzeContinuity(snap, 100).gaps.length, 1);
});

// Rond-point : chemin fermé (junction=roundabout) où l'on entre et sort par n'importe quel nœud.
function roundabout(id, nodes) { return { type: 'way', id, nodes: nodes.concat([nodes[0]]), tags: { junction: 'roundabout' } }; }

test('rond-point : entrée et sortie par des nœuds différents, ni trou ni problème d\'ordre', () => {
  const snap = snapshot([
    way(1, [10, 11, 50]), roundabout(2, [50, 51, 52, 53]), way(3, [52, 60, 61]), rel(100, [1, 2, 3]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.gaps, []);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('rond-point : entre par le milieu d\'une séquence, sort par un autre nœud que le début', () => {
  const snap = snapshot([
    way(1, [10, 53]), roundabout(2, [50, 51, 52, 53]), way(3, [51, 60]), rel(100, [1, 2, 3]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(res.orderIssues, []);
});

test('rond-point : un chemin qui ne touche pas le rond-point reste signalé', () => {
  const snap = snapshot([
    way(1, [10, 11]), roundabout(2, [50, 51, 52]), way(3, [60, 61]), rel(100, [1, 2, 3]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.ok(res.gaps.length >= 1);
});

test('chemin fermé sans tag junction=roundabout : comportement inchangé', () => {
  const snap = snapshot([
    way(1, [10, 11, 50]), way(2, [50, 51, 52, 53, 50]), way(3, [52, 60, 61]), rel(100, [1, 2, 3]),
  ]);
  const res = analyzeContinuity(snap, 100);
  assert.strictEqual(res.orderIssues.length, 1);
});

test('problème d\'ordre : touching dit si les deux chemins se touchent (raccord en T) ou non', () => {
  const t = analyzeContinuity(snapshot([way(1, [10, 11, 12]), way(2, [11, 20]), rel(100, [1, 2])]), 100);
  assert.strictEqual(t.orderIssues[0].touching, true);
  const far = analyzeContinuity(snapshot([
    way(1, [10, 11]), way(2, [30, 31]), way(3, [11, 12, 30]), rel(100, [1, 2, 3])]), 100);
  assert.strictEqual(far.orderIssues[0].touching, false);
});

// Polygones : trois sortes de bout non raccordé, pour dire ce qui ne va pas au lieu d'un « bout ouvert » unique.
function polyRel(id, members) {
  return { type: 'relation', id, tags: { type: 'multipolygon' }, members: members.map(([ref, role]) => ({ type: 'way', ref, role })) };
}

test('polygone : un bout libre simple est de sorte « libre »', () => {
  const snap = snapshot([way(1, [1, 2, 3]), way(2, [3, 4, 5]), polyRel(100, [[1, 'outer'], [2, 'outer']])]);
  const r = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(r.openEnds.slice().sort(), [1, 5]);
  assert.deepStrictEqual([r.openKinds[1], r.openKinds[5]], ['free', 'free']);
});

test('polygone : trois chemins qui finissent au même nœud donnent un embranchement', () => {
  const snap = snapshot([way(1, [1, 2, 9]), way(2, [9, 3, 1]), way(3, [9, 7, 8]), polyRel(100, [[1, 'outer'], [2, 'outer'], [3, 'outer']])]);
  const r = analyzeContinuity(snap, 100);
  assert.ok(r.openEnds.includes(9));
  assert.strictEqual(r.openKinds[9], 'branch');
  assert.strictEqual(r.openKinds[8], 'free');
});

test('polygone : un bout posé sur le milieu d\'un autre chemin est signalé comme tel', () => {
  const snap = snapshot([way(1, [1, 2, 3, 4]), way(2, [4, 5, 1]), way(3, [3, 6, 7]), polyRel(100, [[1, 'outer'], [2, 'outer'], [3, 'outer']])]);
  const r = analyzeContinuity(snap, 100);
  assert.strictEqual(r.openKinds[3], 'mid');
  assert.strictEqual(r.openKinds[7], 'free');
});

test('polygone fermé : aucun bout, openKinds vide', () => {
  const snap = snapshot([way(1, [1, 2, 3]), way(2, [3, 4, 1]), polyRel(100, [[1, 'outer'], [2, 'outer']])]);
  const r = analyzeContinuity(snap, 100);
  assert.deepStrictEqual([r.openEnds, r.openKinds], [[], {}]);
});

test('liste qui alterne entre deux morceaux (A, B, A) : un seul trou, le retour en arrière est un problème d\'ordre', () => {
  // A = chemins 1 et 3 (se touchent en 12), B = chemin 2 (loin d'eux)
  const snap = snapshot([way(1, [10, 11, 12]), way(2, [50, 51, 52]), way(3, [12, 13, 14]), rel(100, [1, 2, 3])]);
  const r = analyzeContinuity(snap, 100);
  assert.strictEqual(r.pieces.length, 2);
  assert.strictEqual(r.gaps.length, 1);
  assert.deepStrictEqual([r.gaps[0].fromIndex, r.gaps[0].toIndex], [0, 1]);
  assert.strictEqual(r.orderIssues.length, 1);
  assert.deepStrictEqual([r.orderIssues[0].fromIndex, r.orderIssues[0].toIndex], [1, 2]);
});

test('trois morceaux visités dans l\'ordre A, B, C : deux trous, comme avant', () => {
  const snap = snapshot([way(1, [10, 11]), way(2, [20, 21]), way(3, [30, 31]), rel(100, [1, 2, 3])]);
  const r = analyzeContinuity(snap, 100);
  assert.strictEqual(r.pieces.length, 3);
  assert.strictEqual(r.gaps.length, 2);
  assert.strictEqual(r.orderIssues.length, 0);
});
