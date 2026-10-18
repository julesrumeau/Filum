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
        if (v && v.visible !== false) elements.push({ type: 'way', id: m.ref, nodes: v.nodes });
      } else if (ctx.currentWays[m.ref]) {
        elements.push({ type: 'way', id: m.ref, nodes: ctx.currentWays[m.ref].nodes });
      }
    });
    return { elements: elements };
  }

  function cause(v) {
    return { type: v.type, id: v.id, version: v.version, user: v.user, changeset: v.changeset, timestamp: v.timestamp };
  }

  // Un point par date où une version (de la relation ou d'un chemin chargé) est apparue :
  // la relation est-elle alors cassée, et quelles versions viennent d'apparaître ?
  function timeline(ctx, relationId) {
    var byDate = {};
    function add(v) { (byDate[v.timestamp] = byDate[v.timestamp] || []).push(cause(v)); }
    ctx.relHistory.forEach(add);
    Object.keys(ctx.wayHistories).forEach(function (id) { ctx.wayHistories[id].forEach(add); });
    var points = [];
    Object.keys(byDate).sort().forEach(function (date) {
      var snap = stateAt(date, ctx, relationId);
      if (!snap) return;
      var r = C.analyzeContinuity(snap, relationId);
      points.push({
        date: date,
        causes: byDate[date],
        broken: r.gaps.length > 0 || r.openEnds.length > 0,
        pieces: r.pieces.length,
        gaps: r.gaps.length,
      });
    });
    return points;
  }

  // Périodes pendant lesquelles la relation est cassée : début (date et versions responsables)
  // et fin (réparation) ou null si c'est toujours cassé.
  function findBreaks(ctx, relationId) {
    var spans = [], open = null;
    timeline(ctx, relationId).forEach(function (p, i) {
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

  var api = { stateAt: stateAt, timeline: timeline, findBreaks: findBreaks, borderWayRefs: borderWayRefs,
    changesetIds: changesetIds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
