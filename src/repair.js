(function (root) {
  'use strict';

  // Pistes pour réparer un trou : les chemins qui touchent un bout libre du trou sans être membres de la relation.
  // `nodeWays` donne, pour chaque nœud, les chemins qui le contiennent ; `memberWays` est l'ensemble des chemins
  // déjà dans la relation (ou ses sous-relations). Un candidat qui touche les deux côtés « fait le pont » : il serait
  // le chemin manquant. Ce n'est qu'une piste : un chemin proche n'est pas forcément le bon.
  function repairCandidates(gap, nodeWays, memberWays) {
    var found = {};
    function visit(ids, side) {
      ids.forEach(function (n) {
        (nodeWays[n] || []).forEach(function (w) {
          if (memberWays[w.id]) return;
          var c = found[w.id] = found[w.id] || { id: w.id, tags: w.tags || {}, touches: [], sides: {},
            version: w.version, timestamp: w.timestamp, user: w.user, changeset: w.changeset };
          if (c.touches.indexOf(n) < 0) c.touches.push(n);
          c.sides[side] = true;
        });
      });
    }
    visit(gap.fromEnds || [], 'from');
    visit(gap.toEnds || [], 'to');
    return Object.keys(found).map(function (k) {
      var c = found[k];
      return { id: c.id, tags: c.tags, touches: c.touches, bridges: !!(c.sides.from && c.sides.to),
        version: c.version, timestamp: c.timestamp, user: c.user, changeset: c.changeset };
    }).sort(function (a, b) { return (b.bridges ? 1 : 0) - (a.bridges ? 1 : 0) || a.id - b.id; });
  }

  var api = { repairCandidates: repairCandidates };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
