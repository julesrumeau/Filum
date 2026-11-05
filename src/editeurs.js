(function (root) {
  'use strict';

  var PREFIX = { way: 'w', node: 'n', relation: 'r' };
  var JOSM = 'http://127.0.0.1:8111/';

  function whole(n) { return typeof n === 'number' && isFinite(n) && Math.floor(n) === n && n > 0; }

  // L'objet OpenStreetMap à éditer : le chemin ou le nœud sélectionné, sinon la relation affichée.
  // Un trou ou un problème d'ordre n'est pas un objet OSM : on prend alors la relation. null si rien d'exploitable.
  function objectOf(sel, relationId) {
    var m = /^(way|node):(\d+)$/.exec(sel || '');
    if (m && whole(Number(m[2]))) return { kind: m[1], id: Number(m[2]) };
    return whole(Number(relationId)) ? { kind: 'relation', id: Number(relationId) } : null;
  }

  // iD sur openstreetmap.org, avec l'objet sélectionné et la position si on les donne.
  function idUrl(obj, geo) {
    var url = 'https://www.openstreetmap.org/edit?editor=id';
    if (obj && PREFIX[obj.kind] && whole(obj.id)) url += '&' + obj.kind + '=' + obj.id;
    if (geo && typeof geo.zoom === 'number' && typeof geo.lat === 'number' && typeof geo.lon === 'number') {
      url += '#map=' + Number(geo.zoom.toFixed(1)) + '/' + geo.lat.toFixed(5) + '/' + geo.lon.toFixed(5);
    }
    return url;
  }

  // Télécommande de JOSM (Vespucci répond aussi sur ce port) : charge l'objet et ses membres. null si l'objet est invalide.
  function josmObjectUrl(obj) {
    if (!obj || !PREFIX[obj.kind] || !whole(obj.id)) return null;
    return JOSM + 'load_object?objects=' + PREFIX[obj.kind] + obj.id + '&relation_members=true';
  }

  // Charge une zone ({ left, right, top, bottom } en degrés) dans JOSM et zoome dessus.
  function josmAreaUrl(b) {
    if (!b || ['left', 'right', 'top', 'bottom'].some(function (k) { return typeof b[k] !== 'number' || !isFinite(b[k]); })) return null;
    return JOSM + 'load_and_zoom?left=' + b.left.toFixed(5) + '&right=' + b.right.toFixed(5) + '&top=' + b.top.toFixed(5) + '&bottom=' + b.bottom.toFixed(5);
  }

  var api = { objectOf: objectOf, idUrl: idUrl, josmObjectUrl: josmObjectUrl, josmAreaUrl: josmAreaUrl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
