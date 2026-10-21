(function (root) {
  'use strict';

  // Tags qui disent « ce que c'est », du plus parlant au plus général.
  var KEYS = ['natural', 'amenity', 'leisure', 'tourism', 'man_made', 'historic', 'emergency', 'barrier', 'building', 'highway', 'landuse'];

  // Segments des anneaux (listes de [lon, lat]) : l'ordre et le sens des chemins n'ont pas d'importance pour le test.
  function ringsToSegments(rings) {
    var segs = [];
    rings.forEach(function (ring) {
      for (var i = 1; i < ring.length; i++) segs.push({ x1: ring[i - 1][0], y1: ring[i - 1][1], x2: ring[i][0], y2: ring[i][1] });
    });
    return segs;
  }

  // Point dans le polygone par parité des croisements d'un rayon vers l'est : les anneaux intérieurs (trous)
  // sont comptés par le même calcul. Fiable seulement si les contours sont fermés.
  function insidePolygon(pt, segs) {
    var inside = false;
    segs.forEach(function (s) {
      if ((s.y1 > pt.lat) !== (s.y2 > pt.lat)) {
        var x = s.x1 + (pt.lat - s.y1) / (s.y2 - s.y1) * (s.x2 - s.x1);
        if (pt.lon < x) inside = !inside;
      }
    });
    return inside;
  }

  function bboxOf(points) {
    var lons = points.map(function (p) { return p.lon; }), lats = points.map(function (p) { return p.lat; });
    return [Math.min.apply(null, lons), Math.min.apply(null, lats), Math.max.apply(null, lons), Math.max.apply(null, lats)];
  }

  // L'API de carte refuse les zones trop grandes (environ 0,25 degré carré) : découpe en cases.
  function splitBbox(b, maxArea) {
    var w = b[2] - b[0], h = b[3] - b[1];
    if (w * h <= maxArea) return [b];
    var side = Math.sqrt(maxArea), cols = Math.ceil(w / side), rows = Math.ceil(h / side), out = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        out.push([b[0] + c * w / cols, b[1] + r * h / rows, b[0] + (c + 1) * w / cols, b[1] + (r + 1) * h / rows]);
      }
    }
    return out;
  }

  function labelOf(tags) {
    for (var i = 0; i < KEYS.length; i++) if (tags[KEYS[i]]) return KEYS[i] + '=' + tags[KEYS[i]];
    return null;
  }

  // Ce qui se trouve dans le polygone : éléments étiquetés regroupés par type. Un nœud compte s'il est dedans,
  // un chemin si son premier nœud connu l'est. Chaque groupe garde ses points (pour les dessiner).
  function summarize(elements, segs) {
    var nodes = {}, groups = {}, total = 0;
    elements.forEach(function (e) { if (e.type === 'node') nodes[e.id] = e; });
    function add(label, e, p) {
      var g = groups[label] = groups[label] || { label: label, count: 0, points: [] };
      g.count++; total++;
      g.points.push({ id: e.id, type: e.type, lon: p.lon, lat: p.lat });
    }
    elements.forEach(function (e) {
      var label = e.tags && labelOf(e.tags);
      if (!label) return;
      var p = e.type === 'node' ? e : (e.nodes || []).map(function (id) { return nodes[id]; }).filter(Boolean)[0];
      if (p && insidePolygon(p, segs)) add(label, e, p);
    });
    return { total: total, groups: Object.keys(groups).map(function (k) { return groups[k]; })
      .sort(function (a, b) { return b.count - a.count || (a.label < b.label ? -1 : 1); }) };
  }

  var api = { ringsToSegments: ringsToSegments, insidePolygon: insidePolygon, bboxOf: bboxOf, splitBbox: splitBbox, summarize: summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
