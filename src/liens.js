(function (root) {
  'use strict';

  // Sous-site de Waymarked Trails selon route=*.
  var WMT = { hiking: 'hiking', foot: 'hiking', bicycle: 'cycling', mtb: 'mtb', horse: 'riding', inline_skates: 'skating' };
  var TRANSPORT = { bus: 1, tram: 1, trolleybus: 1, train: 1, subway: 1, light_rail: 1, ferry: 1, share_taxi: 1, monorail: 1 };

  // Outils plus spécialisés pour une relation, selon ses tags : [{ name, url }]. Aucun lien si le type n'est pas reconnu
  // ou si l'identifiant n'est pas un nombre entier positif.
  function toolLinks(tags, relationId) {
    var t = tags || {}, id = Number(relationId), out = [];
    if (!(id > 0) || Math.floor(id) !== id) return out;
    if (WMT[t.route]) out.push({ name: 'Waymarked Trails', url: 'https://' + WMT[t.route] + '.waymarkedtrails.org/#route?id=' + id + '&type=relation' });
    if (TRANSPORT[t.route] || (t.type === 'route_master' && TRANSPORT[t.route_master])) {
      out.push({ name: 'PTNA', url: 'https://ptna.openstreetmap.de/relation.php?id=' + id + '&lang=fr' });
    }
    if (t['network:type'] === 'node_network') out.push({ name: 'Knooppuntnet', url: 'https://knooppuntnet.nl/fr/analysis/route/' + id });
    return out;
  }

  var api = { toolLinks: toolLinks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
