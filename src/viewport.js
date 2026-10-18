(function (root) {
  'use strict';

  var MIN_ZOOM = 1;
  var MAX_ZOOM = 200;

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Garde la vue `v` à l'intérieur de la vue complète `full`.
  function keepInside(v, full) {
    return {
      x: clamp(v.x, full.x, full.x + full.w - v.w),
      y: clamp(v.y, full.y, full.y + full.h - v.h),
      w: v.w, h: v.h,
    };
  }

  // Zoom de `factor` (>1 rapproche) autour du point (px, py), exprimé dans les coordonnées du dessin.
  // Le point reste sous le curseur.
  function zoomAt(view, full, factor, px, py) {
    var w = clamp(view.w / factor, full.w / MAX_ZOOM, full.w);
    var k = w / view.w;
    return keepInside({
      x: px - (px - view.x) * k,
      y: py - (py - view.y) * k,
      w: w,
      h: view.h * k,
    }, full);
  }

  // Déplace la vue de (dx, dy), en unités du dessin.
  function panBy(view, full, dx, dy) {
    return keepInside({ x: view.x + dx, y: view.y + dy, w: view.w, h: view.h }, full);
  }

  var api = { zoomAt: zoomAt, panBy: panBy, MIN_ZOOM: MIN_ZOOM, MAX_ZOOM: MAX_ZOOM };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
