(function (root) {
  'use strict';

  function indexByType(snapshot) {
    var ways = {}, rels = {};
    snapshot.elements.forEach(function (e) {
      if (e.type === 'way') ways[e.id] = e;
      else if (e.type === 'relation') rels[e.id] = e;
    });
    return { ways: ways, rels: rels };
  }

  function ends(w) {
    return [w.nodes[0], w.nodes[w.nodes.length - 1]];
  }

  // Les deux chemins ont-ils au moins un nœud en commun (même ailleurs qu'aux bouts) ?
  function sharesNode(a, b) {
    var set = new Set(a.nodes);
    return b.nodes.some(function (n) { return set.has(n); });
  }

  // Rond-point : chemin fermé où l'on entre et sort par n'importe lequel de ses nœuds.
  function isRoundabout(w) {
    return !!(w.tags && w.tags.junction === 'roundabout' && w.nodes.length > 1);
  }

  function uniqueNodes(w) {
    return w.nodes.filter(function (n, i) { return w.nodes.indexOf(n) === i; });
  }

  // Bouts libres possibles après avoir enchaîné le chemin d'extrémités [c, d]
  // sur un bout libre parmi `exits`. Vide si aucun ne se raccorde.
  function advance(exits, c, d) {
    var next = [];
    exits.forEach(function (e) {
      if (e === c && next.indexOf(d) < 0) next.push(d);
      if (e === d && next.indexOf(c) < 0) next.push(c);
    });
    return next;
  }

  // Regroupe les chemins qui partagent au moins un nœud (n'importe où, pas seulement aux bouts).
  // Renvoie, pour chaque indice de membre, le numéro de son groupe.
  function groupByNodes(wayMembers) {
    var parent = wayMembers.map(function (_, i) { return i; });
    function find(i) { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; }
    var owner = new Map();
    wayMembers.forEach(function (wm, i) {
      var nodes = wm.way.nodes;
      for (var k = 0; k < nodes.length; k++) {
        var o = owner.get(nodes[k]);
        if (o === undefined) owner.set(nodes[k], i);
        else if (o !== i) parent[find(i)] = find(o);
      }
    });
    return wayMembers.map(function (_, i) { return find(i); });
  }

  // Rôles de chemins qui s'écartent de l'itinéraire principal (variante, excursion, accès, liaison).
  var SECONDARY = { alternative: 1, excursion: 1, approach: 1, connection: 1 };
  var DIRECTION = { forward: 1, backward: 1 };

  function isPolygon(rel) {
    var t = rel.tags && rel.tags.type;
    return t === 'multipolygon' || t === 'boundary';
  }

  // Bouts ouverts d'un ensemble de contours : un nœud où il arrive un nombre impair de bouts de chemins.
  // Un chemin qui se referme sur lui-même n'en a aucun.
  function openEndsOf(ways) {
    var deg = {};
    ways.forEach(function (w) {
      var e = ends(w);
      if (e[0] === e[1]) return;
      deg[e[0]] = (deg[e[0]] || 0) + 1;
      deg[e[1]] = (deg[e[1]] || 0) + 1;
    });
    return Object.keys(deg).filter(function (n) { return deg[n] % 2 === 1; }).map(Number);
  }

  function analyzePolygon(wayMembers, missing) {
    var rings = { outer: [], inner: [] };
    wayMembers.forEach(function (wm) {
      if (wm.role === 'inner') rings.inner.push(wm.way);
      else if (wm.role === '' || wm.role === 'outer') rings.outer.push(wm.way);
    });
    var group = groupByNodes(wayMembers), byGroup = {};
    wayMembers.forEach(function (wm, k) { (byGroup[group[k]] = byGroup[group[k]] || []).push(wm.index); });
    return {
      isPolygon: true,
      pieces: Object.keys(byGroup).map(function (g) { return byGroup[g]; }),
      gaps: [], orderIssues: [], detached: [], missing: missing,
      openEnds: openEndsOf(rings.outer).concat(openEndsOf(rings.inner)),
    };
  }

  // Itinéraire : deux notions distinctes.
  //  - connexité : les chemins de l'itinéraire principal forment-ils un seul morceau ? Sinon, vrai trou (gaps).
  //  - ordre : chaque chemin se raccorde-t-il par un bout au précédent de la liste ? Sinon, liste mal
  //    triée (orderIssues). Un changement forward/backward fait recommencer la chaîne.
  // Les chemins de variante, accès, excursion ou liaison sont à part : isolés s'ils ne touchent rien (detached).
  function analyzeRoute(wayMembers, missing) {
    var main = wayMembers.filter(function (wm) { return !SECONDARY[wm.role]; });
    var secondary = wayMembers.filter(function (wm) { return SECONDARY[wm.role]; });

    var group = groupByNodes(main), byGroup = {};
    main.forEach(function (wm, k) { (byGroup[group[k]] = byGroup[group[k]] || []).push(wm.index); });
    var pieces = Object.keys(byGroup).map(function (g) { return byGroup[g]; });

    var detached = [];
    if (main.length && secondary.length) {
      var all = main.concat(secondary), allGroup = groupByNodes(all), withMain = {};
      main.forEach(function (_, k) { withMain[allGroup[k]] = true; });
      secondary.forEach(function (wm, k) {
        if (!withMain[allGroup[main.length + k]]) detached.push(wm.index);
      });
    }

    var gaps = [], orderIssues = [], exits = null;
    main.forEach(function (wm, k) {
      var rb = isRoundabout(wm.way);
      var e = ends(wm.way), fresh = rb ? uniqueNodes(wm.way) : e[0] === e[1] ? [e[0]] : e.slice();
      if (k === 0) { exits = fresh; return; }
      var prev = main[k - 1];
      var turn = DIRECTION[prev.role] && DIRECTION[wm.role] && prev.role !== wm.role;
      var next = turn ? [] : rb ? (exits.some(function (x) { return fresh.indexOf(x) >= 0; }) ? fresh : []) : advance(exits, e[0], e[1]);
      if (turn || next.length === 0) {
        var issue = { fromIndex: prev.index, toIndex: wm.index, fromEnds: exits.slice(), toEnds: e.slice() };
        if (group[k - 1] === group[k]) issue.touching = sharesNode(prev.way, wm.way);
        var sameGroup = group[k - 1] === group[k];
        if (!sameGroup) gaps.push(issue);
        else if (!turn) orderIssues.push(issue);
        next = fresh;
      }
      exits = next;
    });

    return { isPolygon: false, pieces: pieces, gaps: gaps, orderIssues: orderIssues,
      detached: detached, missing: missing, openEnds: [] };
  }

  function analyzeContinuity(snapshot, relationId) {
    var idx = indexByType(snapshot);
    var rel = idx.rels[relationId];
    if (!rel) throw new Error('relation ' + relationId + ' absente de l\'instantané');

    var missing = [], wayMembers = [];
    rel.members.forEach(function (m, i) {
      if (m.type !== 'way') return;
      var w = idx.ways[m.ref];
      if (!w) { missing.push(m.ref); return; }
      wayMembers.push({ index: i, way: w, role: m.role || '' });
    });
    return isPolygon(rel) ? analyzePolygon(wayMembers, missing) : analyzeRoute(wayMembers, missing);
  }

  // Analyse la relation puis chacune de ses sous-relations (une seule fois chacune).
  function analyzeTree(snapshot, relationId) {
    var idx = indexByType(snapshot);
    var seen = {}, out = [];
    function visit(id) {
      if (seen[id]) return;
      seen[id] = true;
      var rel = idx.rels[id];
      if (!rel) return;
      var r = analyzeContinuity(snapshot, id);
      out.push({
        relationId: id,
        name: (rel.tags && rel.tags.name) || null,
        pieces: r.pieces,
        gaps: r.gaps,
        orderIssues: r.orderIssues,
        detached: r.detached,
        isPolygon: r.isPolygon,
        openEnds: r.openEnds,
        missing: r.missing,
      });
      rel.members.forEach(function (m) { if (m.type === 'relation') visit(m.ref); });
    }
    visit(relationId);
    return out;
  }

  var api = { analyzeContinuity: analyzeContinuity, analyzeTree: analyzeTree };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
