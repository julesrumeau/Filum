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

  // Réciproque de mercV : latitude d'une ordonnée Web Mercator en « degrés ».
  function invMercV(v) {
    return (2 * Math.atan(Math.exp(v * Math.PI / 180)) - Math.PI / 2) * 180 / Math.PI;
  }

  // Vue du dessin (unités du dessin) vers { zoom, lat, lon } au sens d'OpenStreetMap, pour une carte de widthPx pixels
  // de large. proj : { minU, maxV, scale, offX, offY } comme dans renderMap.
  function viewToGeo(proj, view, widthPx) {
    var cx = view.x + view.w / 2, cy = view.y + view.h / 2;
    var pxPerDeg = widthPx / view.w * proj.scale;
    return {
      zoom: Math.log(pxPerDeg * 360 / 256) / Math.LN2,
      lat: invMercV(proj.maxV - (cy - proj.offY) / proj.scale),
      lon: proj.minU + (cx - proj.offX) / proj.scale,
    };
  }

  // Réciproque : la vue du dessin qui montre { zoom, lat, lon } dans une carte de widthPx sur heightPx pixels.
  function geoToView(proj, geo, widthPx, heightPx) {
    var pxPerDeg = 256 * Math.pow(2, geo.zoom) / 360;
    var w = widthPx * proj.scale / pxPerDeg, h = heightPx * proj.scale / pxPerDeg;
    var cx = (geo.lon - proj.minU) * proj.scale + proj.offX, cy = (proj.maxV - mercV(geo.lat)) * proj.scale + proj.offY;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }

  // Bords de la vue du dessin en degrés : { left, right, top, bottom }.
  function viewToBounds(proj, view) {
    return {
      left: proj.minU + (view.x - proj.offX) / proj.scale,
      right: proj.minU + (view.x + view.w - proj.offX) / proj.scale,
      top: invMercV(proj.maxV - (view.y - proj.offY) / proj.scale),
      bottom: invMercV(proj.maxV - (view.y + view.h - proj.offY) / proj.scale),
    };
  }

  var api = { viewToBounds: viewToBounds, viewToGeo: viewToGeo, geoToView: geoToView, mercV: mercV, chooseZoom: chooseZoom, tilesFor: tilesFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
