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

  // Objets sélectionnables dans l'adresse : way et node comme dans OpenStreetMap, les autres sont propres à Filum.
  var SEL_KINDS = { way: 1, node: 1, gap: 1, order: 1, piece: 1, open: 1 };

  function num(s) { return /^-?\d+(\.\d+)?$/.test(s || '') ? Number(s) : null; }

  // Fragment d'adresse : #map=zoom/lat/lon&id=way/123, sur le modèle d'OpenStreetMap. Chaque partie est facultative.
  function buildHash(o) {
    if (!o) return '';
    var parts = [];
    if (typeof o.zoom === 'number' && typeof o.lat === 'number' && typeof o.lon === 'number') {
      parts.push('map=' + Number(o.zoom.toFixed(1)) + '/' + o.lat.toFixed(5) + '/' + o.lon.toFixed(5));
    }
    var m = o.sel && /^([a-z]+):(\d+)(?::(\d+))?$/.exec(o.sel);
    if (m && SEL_KINDS[m[1]]) parts.push('id=' + m[1] + '/' + m[2] + (m[3] !== undefined ? '/' + m[3] : ''));
    return parts.length ? '#' + parts.join('&') : '';
  }

  // Lit le fragment : { zoom, lat, lon, sel } avec null pour ce qui manque ou n'est pas valide.
  function readHash(hash) {
    var out = { zoom: null, lat: null, lon: null, sel: null };
    String(hash || '').replace(/^#/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('='), key = kv.slice(0, i), val = kv.slice(i + 1);
      if (key === 'map') {
        var p = val.split('/'), z = num(p[0]), la = num(p[1]), lo = num(p[2]);
        if (z !== null && z >= 0 && z <= 22 && la !== null && Math.abs(la) <= 85.06 && lo !== null && Math.abs(lo) <= 180) { out.zoom = z; out.lat = la; out.lon = lo; }
      } else if (key === 'id') {
        var m = /^([a-z]+)\/(\d+)(?:\/(\d+))?$/.exec(val);
        if (m && SEL_KINDS[m[1]]) out.sel = m[1] + ':' + m[2] + (m[3] !== undefined ? ':' + m[3] : '');
      }
    });
    return out;
  }

  var api = { buildHash: buildHash, readHash: readHash, periodBound: periodBound, parseRelationInput: parseRelationInput, buildSearch: buildSearch, readSearch: readSearch };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
