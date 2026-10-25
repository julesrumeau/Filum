(function (root) {
  'use strict';

  var DATE = /^\d{4}-\d{2}-\d{2}$/;

  var DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

  // Une date AAAA-MM-JJ ou une date avec heure AAAA-MM-JJThh:mm:ssZ (UTC), réelle dans le calendrier.
  function validDate(s) {
    s = s || '';
    if (!DATE.test(s) && !DATETIME.test(s)) return false;
    var d = new Date(DATE.test(s) ? s + 'T00:00:00Z' : s);
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s.slice(0, 10) && (DATE.test(s) || d.toISOString().slice(0, 19) + 'Z' === s);
  }

  // Bord d'une période : une date seule couvre la journée (début à 00:00:00, fin à 23:59:59), une date avec heure reste telle quelle.
  function periodBound(s, isEnd) {
    return DATE.test(s) ? s + (isEnd ? 'T23:59:59Z' : 'T00:00:00Z') : s;
  }

  // Ce que l'utilisateur a saisi : numéro, « relation 123 », « r123 », adresse openstreetmap.org ou waymarkedtrails.org.
  // Renvoie { id } (relation), { way } (chemin) ou { error }.
  function parseRelationInput(text) {
    var t = String(text || '').trim();
    var node = t.match(/(?:openstreetmap\.org|osm\.org)\/node\/\d+/i);
    if (node) return { error: 'Cette adresse est celle d\'un nœud. Filum analyse une relation (ou un chemin) : indiquez un numéro de relation ou de chemin.' };
    var way = t.match(/(?:openstreetmap\.org|osm\.org)\/way\/(\d+)/i) || t.match(/^(?:way|w)[\s/#]*(\d+)\b/i);
    if (way) return { way: Number(way[1]) };
    var wmt = /waymarkedtrails\.org/i.test(t) ? t.match(/[?&;]id=(\d+)/i) : null;
    var m = wmt || t.match(/\/relation\/(\d+)/i) || t.match(/^(?:relation|r)?[\s/#]*(\d+)$/i);
    var id = m ? Number(m[1]) : 0;
    return id > 0 ? { id: id } : { error: 'Indiquez un numéro de relation (par exemple 7444) ou l\'adresse de sa page sur openstreetmap.org ou waymarkedtrails.org.' };
  }

  // Forme courte (le jour) quand le bord est la borne naturelle de la journée, sinon date et heure à la seconde.
  function stamp(iso, isEnd) {
    var full = String(iso).replace(/\.\d+Z$/, 'Z');
    return full === periodBound(full.slice(0, 10), isEnd) ? full.slice(0, 10) : full;
  }

  // Paramètres d'adresse pour partager une analyse : ?relation=ID&du=AAAA-MM-JJ&au=AAAA-MM-JJ
  function buildSearch(id, from, to) {
    var s = '?relation=' + id;
    if (from) s += '&du=' + stamp(from, false);
    if (to) s += '&au=' + stamp(to, true);
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

  var api = { periodBound: periodBound, parseRelationInput: parseRelationInput, buildSearch: buildSearch, readSearch: readSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
