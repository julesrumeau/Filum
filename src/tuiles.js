(function (root) {
  'use strict';

  var MAX_Z = 19;

  // Ordonnée Web Mercator exprimée en « degrés » : 0 à l'équateur, 180 en haut de la carte (latitude 85,05).
  // Avec x = longitude, une tuile est un rectangle aligné sur ces deux axes.
  function mercV(lat) {
    return Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
  }

  // Niveau de zoom des tuiles pour que chacune fasse environ 256 pixels à l'écran.
  function chooseZoom(degPerPx) {
    var z = Math.round(Math.log(360 / (256 * degPerPx)) / Math.LN2);
    return Math.max(0, Math.min(MAX_Z, z));
  }

  function tilesAt(uMin, uMax, vMin, vMax, z) {
    var n = Math.pow(2, z), size = 360 / n, out = [];
    var x0 = Math.max(0, Math.floor((uMin + 180) / size)), x1 = Math.min(n - 1, Math.floor((uMax + 180) / size));
    var y0 = Math.max(0, Math.floor((180 - vMax) / size)), y1 = Math.min(n - 1, Math.floor((180 - vMin) / size));
    for (var y = y0; y <= y1; y++) {
      for (var x = x0; x <= x1; x++) {
        var u0 = -180 + x * size, v0 = 180 - y * size;
        out.push({ z: z, x: x, y: y, u0: u0, u1: u0 + size, v0: v0, v1: v0 - size });
      }
    }
    return out;
  }

  // Tuiles qui couvrent la boîte (u = longitude, v = ordonnée Mercator), au zoom demandé ou au plus grand
  // zoom inférieur qui n'en demande pas plus de maxTiles.
  function tilesFor(uMin, uMax, vMin, vMax, z, maxTiles) {
    var list = tilesAt(uMin, uMax, vMin, vMax, z);
    while (list.length > maxTiles && z > 0) { z--; list = tilesAt(uMin, uMax, vMin, vMax, z); }
    return list;
  }

  var api = { mercV: mercV, chooseZoom: chooseZoom, tilesFor: tilesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
