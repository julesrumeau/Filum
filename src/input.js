(function (root) {
  'use strict';

  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  function validDate(s) {
    if (!DATE.test(s || '')) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  // Ce que l'utilisateur a saisi : numéro, « relation 123 », « r123 » ou adresse openstreetmap.org.
  // Renvoie { id } (relation), { way } (chemin) ou { error }.
  function parseRelationInput(text) {
    var t = String(text || '').trim();
    var node = t.match(/(?:openstreetmap\.org|osm\.org)\/node\/\d+/i);
    if (node) return { error: 'Cette adresse est celle d\'un nœud. Filum analyse une relation (ou un chemin) : indiquez un numéro de relation ou de chemin.' };
    var way = t.match(/(?:openstreetmap\.org|osm\.org)\/way\/(\d+)/i) || t.match(/^(?:way|w)[\s/#]*(\d+)\b/i);
    if (way) return { way: Number(way[1]) };
    var m = t.match(/\/relation\/(\d+)/i) || t.match(/^(?:relation|r)?[\s/#]*(\d+)$/i);
    var id = m ? Number(m[1]) : 0;
    return id > 0 ? { id: id } : { error: 'Indiquez un numéro de relation (par exemple 7444) ou l\'adresse de sa page sur openstreetmap.org.' };
  }

  function day(iso) { return iso ? String(iso).slice(0, 10) : null; }

  // Paramètres d'adresse pour partager une analyse : ?relation=ID&du=AAAA-MM-JJ&au=AAAA-MM-JJ
  function buildSearch(id, from, to) {
    var s = '?relation=' + id;
    if (from) s += '&du=' + day(from);
    if (to) s += '&au=' + day(to);
    return s;
  }

  function readSearch(search) {
    var p = {};
    String(search || '').replace(/^\?/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('=');
      if (i > 0) p[kv.slice(0, i)] = decodeURIComponent(kv.slice(i + 1));
    });
    var id = /^\d+$/.test(p.relation || '') ? Number(p.relation) : 0;
    if (!id) return null;
    return { id: id, from: validDate(p.du) ? p.du : null, to: validDate(p.au) ? p.au : null };
  }

  var api = { parseRelationInput: parseRelationInput, buildSearch: buildSearch, readSearch: readSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
