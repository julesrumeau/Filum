(function (root) {
  'use strict';

  var C = (typeof module !== 'undefined' && module.exports) ? require('./continuity.js') : root.Filum;

  // Dernière version dont la date est antérieure ou égale à `date` (les dates ISO se comparent en texte).
  function versionAt(versions, date) {
    var best = null;
    (versions || []).forEach(function (v) {
      if (v.timestamp <= date && (!best || v.version > best.version)) best = v;
    });
    return best;
  }

  // La relation et ses chemins tels qu'ils étaient à `date`, au format attendu par analyzeContinuity.
  // Un chemin sans historique chargé garde son état actuel (ctx.currentWays).
  // Renvoie null si la relation n'existait pas encore, ou était supprimée.
  function stateAt(date, ctx, relationId) {
    var relV = versionAt(ctx.relHistory, date);
    if (!relV || relV.visible === false) return null;
    var elements = [{ type: 'relation', id: relationId, tags: relV.tags || {}, members: relV.members || [] }];
    var seen = {};
    (relV.members || []).forEach(function (m) {
      if (m.type !== 'way' || seen[m.ref]) return;
      seen[m.ref] = true;
      var hist = ctx.wayHistories[m.ref];
      if (hist) {
        var v = versionAt(hist, date);
        if (v && v.visible !== false) elements.push({ type: 'way', id: m.ref, nodes: v.nodes, tags: v.tags || {} });
      } else if (ctx.currentWays[m.ref]) {
        elements.push({ type: 'way', id: m.ref, nodes: ctx.currentWays[m.ref].nodes, tags: ctx.currentWays[m.ref].tags || {} });
      }
    });
    return { elements: elements };
  }

  function cause(v) {
    return { type: v.type, id: v.id, version: v.version, user: v.user, changeset: v.changeset, timestamp: v.timestamp };
  }

  // Prépare le calcul de la timeline : dates triées, et une fonction qui en traite une tranche.
  // Un point par date où une version (de la relation ou d'un chemin chargé) est apparue :
  // la relation est-elle alors cassée, et quelles versions viennent d'apparaître ?
  function timelinePlan(ctx, relationId) {
    var byDate = {};
    function add(v) { (byDate[v.timestamp] = byDate[v.timestamp] || []).push(cause(v)); }
    ctx.relHistory.forEach(add);
    Object.keys(ctx.wayHistories).forEach(function (id) { ctx.wayHistories[id].forEach(add); });
    var dates = Object.keys(byDate).sort(), points = [];
    function run(from, to) {
      for (var i = from; i < Math.min(to, dates.length); i++) {
        var date = dates[i], snap = stateAt(date, ctx, relationId);
        if (!snap) continue;
        // Une version d'un chemin qui n'est pas membre à cette date ne change rien : on évite de tout recalculer.
        var members = {};
        snap.elements[0].members.forEach(function (m) { if (m.type === 'way') members[m.ref] = true; });
        var relevant = byDate[date].some(function (c) { return c.type === 'relation' || members[c.id]; });
        if (!relevant && points.length) {
          var prev = points[points.length - 1];
          points.push({ date: date, causes: byDate[date], broken: prev.broken, pieces: prev.pieces, gaps: prev.gaps });
          continue;
        }
        var r = C.analyzeContinuity(snap, relationId);
        points.push({
          date: date,
          causes: byDate[date],
          broken: r.gaps.length > 0 || r.openEnds.length > 0,
          pieces: r.pieces.length,
          gaps: r.gaps.length,
        });
      }
    }
    return { total: dates.length, run: run, points: points };
  }

  function timeline(ctx, relationId) {
    var plan = timelinePlan(ctx, relationId);
    plan.run(0, plan.total);
    return plan.points;
  }

  // Même résultat que timeline, par tranches qui rendent la main au navigateur entre deux.
  // opts : chunk (dates par tranche), onProgress(done, total).
  async function timelineAsync(ctx, relationId, opts) {
    opts = opts || {};
    var chunk = opts.chunk || 100, plan = timelinePlan(ctx, relationId);
    for (var i = 0; i < plan.total; i += chunk) {
      plan.run(i, i + chunk);
      if (opts.onProgress) opts.onProgress(Math.min(i + chunk, plan.total), plan.total);
      await new Promise(function (resolve) { setTimeout(resolve, 0); });
    }
    return plan.points;
  }

  // Périodes pendant lesquelles la relation est cassée : début (date et versions responsables)
  // et fin (réparation) ou null si c'est toujours cassé.
  function spansOf(points) {
    var spans = [], open = null;
    points.forEach(function (p, i) {
      if (p.broken && !open) {
        open = { start: { date: p.date, causes: p.causes }, end: null, fromCreation: i === 0 };
        spans.push(open);
      } else if (!p.broken && open) {
        open.end = { date: p.date, causes: p.causes };
        open = null;
      }
    });
    return spans;
  }

  function findBreaks(ctx, relationId) { return spansOf(timeline(ctx, relationId)); }

  // Chemins dont l'historique reste à lire : d'abord ceux membres à la date `toIso` (indispensables pour
  // reconstituer cette date), puis ceux des autres versions de la relation (du plus récent au plus ancien).
  function wayIdsToLoad(ctx, toIso) {
    var out = [], seen = {};
    function add(v) {
      ((v && v.members) || []).forEach(function (m) {
        if (m.type === 'way' && !seen[m.ref] && !ctx.wayHistories[m.ref]) { seen[m.ref] = true; out.push(m.ref); }
      });
    }
    var at = versionAt(ctx.relHistory, toIso);
    add(at);
    ctx.relHistory.slice().sort(function (a, b) { return b.version - a.version; }).forEach(function (v) { if (v !== at) add(v); });
    return out;
  }

  // Identifiants des chemins à examiner : de part et d'autre de chaque trou (itinéraire),
  // ou portant un bout ouvert (polygone).
  function borderWayRefs(snapshot, relationId, result) {
    var rel = snapshot.elements.filter(function (e) { return e.type === 'relation' && e.id === relationId; })[0];
    var refs = [], seen = {};
    function add(ref) { if (!seen[ref]) { seen[ref] = true; refs.push(ref); } }
    result.gaps.forEach(function (g) {
      add(rel.members[g.fromIndex].ref);
      add(rel.members[g.toIndex].ref);
    });
    if (result.openEnds.length) {
      var open = {};
      result.openEnds.forEach(function (n) { open[n] = true; });
      var ways = {};
      snapshot.elements.forEach(function (e) { if (e.type === 'way') ways[e.id] = e; });
      rel.members.forEach(function (m) {
        var w = m.type === 'way' && ways[m.ref];
        if (w && (open[w.nodes[0]] || open[w.nodes[w.nodes.length - 1]])) add(m.ref);
      });
    }
    return refs;
  }

  // Numéros de changesets cités par les périodes de rupture (début et fin), sans doublon.
  function changesetIds(spans) {
    var seen = {}, out = [];
    spans.forEach(function (sp) {
      [sp.start, sp.end].forEach(function (side) {
        (side ? side.causes : []).forEach(function (c) {
          if (!seen[c.changeset]) { seen[c.changeset] = true; out.push(c.changeset); }
        });
      });
    });
    return out;
  }

  var api = { stateAt: stateAt, timeline: timeline, timelineAsync: timelineAsync, spansOf: spansOf, findBreaks: findBreaks, borderWayRefs: borderWayRefs,
    changesetIds: changesetIds, wayIdsToLoad: wayIdsToLoad };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
