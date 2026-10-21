(function (root) {
  'use strict';

  function ms(iso) { return new Date(iso).getTime(); }

  // Position (0 à 1) d'une date sur la frise, bornée.
  function toFraction(iso, minIso, maxIso) {
    var span = ms(maxIso) - ms(minIso);
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (ms(iso) - ms(minIso)) / span));
  }

  // Date ISO (sans millisecondes) correspondant à une position de la frise.
  function fromFraction(f, minIso, maxIso) {
    var t = ms(minIso) + f * (ms(maxIso) - ms(minIso));
    return new Date(Math.round(t)).toISOString().replace(/\.\d+Z$/, 'Z');
  }

  // L'historique chargé, sans les versions postérieures à `toIso` (la copie ne modifie pas l'original).
  function truncateCtx(ctx, toIso) {
    function keep(list) { return list.filter(function (v) { return v.timestamp <= toIso; }); }
    var ways = {};
    Object.keys(ctx.wayHistories).forEach(function (id) { ways[id] = keep(ctx.wayHistories[id]); });
    return { relHistory: keep(ctx.relHistory), wayHistories: ways, currentWays: ctx.currentWays, truncated: ctx.truncated };
  }

  // Périodes de rupture qui touchent la fenêtre commençant à `fromIso` : celles terminées avant sont
  // retirées, celles commencées avant sont gardées et marquées startsBeforeWindow.
  function clipSpans(spans, fromIso) {
    return spans.filter(function (sp) { return !sp.end || sp.end.date >= fromIso; })
      .map(function (sp) { return Object.assign({}, sp, { startsBeforeWindow: sp.start.date < fromIso }); });
  }

  // Position et largeur (en fractions de la frise) de chaque rupture ; une rupture en cours va jusqu'au bout.
  function bandsOf(spans, minIso, maxIso) {
    return spans.map(function (sp) {
      var left = toFraction(sp.start.date, minIso, maxIso);
      var right = sp.end ? toFraction(sp.end.date, minIso, maxIso) : 1;
      return { left: left, width: right - left, open: !sp.end };
    });
  }

  // Positions uniques et triées de dates sur la frise (repères des versions).
  function tickFractions(dates, minIso, maxIso) {
    var seen = {}, out = [];
    dates.forEach(function (d) {
      var f = toFraction(d, minIso, maxIso);
      if (!seen[f]) { seen[f] = true; out.push(f); }
    });
    return out.sort(function (a, b) { return a - b; });
  }

  // Sépare les ruptures brèves (moins de minMs : le plus souvent une édition faite en plusieurs envois)
  // des vraies ruptures. Une rupture encore en cours est toujours longue. L'ordre est conservé.
  function splitSpans(spans, minMs) {
    var out = { long: [], brief: [] };
    spans.forEach(function (sp) {
      var brief = sp.end && (ms(sp.end.date) - ms(sp.start.date)) < minMs;
      (brief ? out.brief : out.long).push(sp);
    });
    return out;
  }

  // Combien de chemins reste-t-il à lire, et en combien de secondes environ (environ 30 ms par chemin).
  // pending est null tant que l'historique n'est pas chargé : on estime alors avec le nombre de chemins de la
  // relation. Ne renvoie jamais NaN.
  function estimateLoad(pending, totalWays) {
    var approx = pending === null || pending === undefined;
    var n = approx ? (Number(totalWays) || 0) : pending;
    return { n: n, secs: Math.max(1, Math.round(n * 0.03)), approx: approx };
  }

  // Ce qu'il y a sous le curseur de la souris à la fraction f : la date, la version de la relation la plus
  // proche (à moins de tol de la frise), la rupture qui contient la date (une rupture en cours va jusqu'au bout).
  function hoverInfo(f, hist, spans, minIso, maxIso, tol) {
    var date = fromFraction(f, minIso, maxIso), best = null, bestD = tol;
    (hist || []).forEach(function (v) {
      var d = Math.abs(toFraction(v.timestamp, minIso, maxIso) - f);
      if (d <= bestD) { best = v; bestD = d; }
    });
    var span = null;
    (spans || []).forEach(function (sp) {
      if (!span && sp.start.date <= date && (!sp.end || date <= sp.end.date)) span = sp;
    });
    return { date: date, version: best, span: span };
  }

  var api = { hoverInfo: hoverInfo, estimateLoad: estimateLoad, splitSpans: splitSpans, toFraction: toFraction, fromFraction: fromFraction, truncateCtx: truncateCtx,
    clipSpans: clipSpans, bandsOf: bandsOf, tickFractions: tickFractions };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
