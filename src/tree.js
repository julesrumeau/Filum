(function (root) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var C = isNode ? require('./continuity.js') : root.Filum;
  var Fx = isNode ? require('./forensic.js') : root.Filum;

  function metaOf(e) {
    return { version: e.version, user: e.user, timestamp: e.timestamp, changeset: e.changeset };
  }

  // Tags où les contributeurs expliquent leurs choix (note, fixme, description, commentaire), toutes langues.
  var EXPLAIN = /^(note|fixme|description|comment)(:[a-z_-]+)?$/i;
  function notesOf(e) {
    var tags = e.tags || {};
    return Object.keys(tags).filter(function (k) { return EXPLAIN.test(k); })
      .map(function (k) { return { key: k, value: tags[k] }; });
  }

  function statusOf(r) {
    if (r.gaps.length || r.missing.length || r.openEnds.length) return 'mauvais';
    if (r.orderIssues.length || r.detached.length) return 'ordre';
    return 'bon';
  }

  // L'arbre « qui contient quoi » : la relation, ses membres dans l'ordre (sous-relations, chemins, nœuds),
  // chaque sous-relation avec ses propres membres. Les nœuds des chemins ne sont pas dans l'arbre (non chargés).
  function buildTree(snapshot, rootId) {
    var rels = {}, ways = {};
    snapshot.elements.forEach(function (e) {
      if (e.type === 'relation') rels[e.id] = e;
      else if (e.type === 'way') ways[e.id] = e;
    });
    if (!rels[rootId]) throw new Error('relation ' + rootId + ' absente de l\'instantané');

    var analysis = {}, borders = {};
    function analyze(id) {
      if (!analysis[id]) {
        analysis[id] = C.analyzeContinuity(snapshot, id);
        var r = analysis[id];
        var list = (r.gaps.length || r.openEnds.length) ? Fx.borderWayRefs(snapshot, id, r) : [];
        borders[id] = {};
        list.forEach(function (ref) { borders[id][ref] = true; });
      }
      return analysis[id];
    }

    function relationNode(id, role, ancestors) {
      var rel = rels[id], r = analyze(id);
      var node = Object.assign({
        kind: 'relation', id: id, role: role, name: (rel.tags && rel.tags.name) || null,
        status: statusOf(r), notes: notesOf(rel),
        summary: { gaps: r.gaps.length, orderIssues: r.orderIssues.length, openEnds: r.openEnds.length,
          detached: r.detached.length, pieces: r.pieces.length, missing: r.missing.length, isPolygon: r.isPolygon },
        children: [],
      }, metaOf(rel));
      var path = ancestors.concat([id]);
      var before = {};
      function queue(list, kind, key) {
        list.forEach(function (g, k) {
          var row = { kind: kind, relationId: id, fromRef: rel.members[g.fromIndex].ref, toRef: rel.members[g.toIndex].ref,
            fromEnds: g.fromEnds, toEnds: g.toEnds, children: [] };
          row[key] = k;
          (before[g.toIndex] = before[g.toIndex] || []).push(row);
        });
      }
      queue(r.gaps, 'gap', 'gapIndex');
      queue(r.orderIssues, 'order', 'orderIndex');
      rel.members.forEach(function (m, memberIndex) {
        (before[memberIndex] || []).forEach(function (row) { node.children.push(row); });
        if (m.type === 'relation') {
          if (path.indexOf(m.ref) >= 0) node.children.push({ kind: 'relation', id: m.ref, role: m.role || '', cycle: true, children: [] });
          else if (rels[m.ref]) node.children.push(relationNode(m.ref, m.role || '', path));
          else node.children.push({ kind: 'relation', id: m.ref, role: m.role || '', missing: true, children: [] });
        } else if (m.type === 'way') {
          var w = ways[m.ref];
          if (!w) node.children.push({ kind: 'way', id: m.ref, role: m.role || '', missing: true, children: [] });
          else node.children.push(Object.assign({
            kind: 'way', id: m.ref, role: m.role || '', name: (w.tags && w.tags.name) || null,
            nodeCount: w.nodes.length, ends: [w.nodes[0], w.nodes[w.nodes.length - 1]],
            border: !!borders[id][m.ref], notes: notesOf(w), children: [],
          }, metaOf(w)));
        } else {
          node.children.push({ kind: 'node', id: m.ref, role: m.role || '', children: [] });
        }
      });
      return node;
    }

    return relationNode(rootId, '', []);
  }

  // Tous les chemins d'une relation et de ses sous-relations (une fois chacun), pour le tracé.
  function wayRefsOf(snapshot, rootId) {
    var rels = {};
    snapshot.elements.forEach(function (e) { if (e.type === 'relation') rels[e.id] = e; });
    var seenRel = {}, seenWay = {}, out = [];
    (function visit(id) {
      if (seenRel[id] || !rels[id]) return;
      seenRel[id] = true;
      rels[id].members.forEach(function (m) {
        if (m.type === 'relation') visit(m.ref);
        else if (m.type === 'way' && !seenWay[m.ref]) { seenWay[m.ref] = true; out.push(m.ref); }
      });
    })(rootId);
    return out;
  }

  // Première suite de nœuds (de la racine jusqu'à la cible) dont le dernier vérifie `match`, ou null.
  function findPath(tree, match) {
    function walk(n, path) {
      var here = path.concat([n]);
      if (match(n)) return here;
      for (var i = 0; i < n.children.length; i++) {
        var found = walk(n.children[i], here);
        if (found) return found;
      }
      return null;
    }
    return walk(tree, []);
  }

  // L'arbre vu comme une fenêtre sur les changements : ne reste que ce qui a un événement dans la période
  // (créé, modifié, ajouté, retiré, supprimé). Les éléments retirés ou supprimés, absents de l'arbre de l'état
  // à la date de fin, reviennent comme lignes à part. hiddenCount = éléments existants mais non touchés.
  function windowTree(tree, events) {
    var by = {};
    events.forEach(function (e) { (by[e.kind + ':' + e.id] = by[e.kind + ':' + e.id] || []).push(e); });
    function evs(kind, id) { return (by[kind + ':' + id] || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; }); }
    var kept = [], keptWays = {}, hidden = 0, present = {};
    tree.children.forEach(function (c) {
      if (c.kind === 'gap' || c.kind === 'order') return;
      present[c.kind + ':' + c.id] = true;
      var e = evs(c.kind, c.id);
      if (!e.length) { hidden++; return; }
      kept.push(Object.assign({}, c, { events: e }));
      if (c.kind === 'way') keptWays[c.id] = true;
    });
    // trous toujours gardés (état à la date de fin, c'est ce que l'on cherche) ; lignes d'ordre gardées
    // si l'un des deux chemins reste visible ; à leur place d'origine
    var out = [], k = 0;
    tree.children.forEach(function (c) {
      if (c.kind === 'gap' || c.kind === 'order') {
        if (c.kind === 'gap' || keptWays[c.fromRef] || keptWays[c.toRef]) out.push(c);
        return;
      }
      var e = evs(c.kind, c.id);
      if (e.length) out.push(kept[k++]);
    });
    // éléments retirés ou supprimés : plus dans l'arbre de l'état à la date de fin
    var removedKeys = [];
    events.forEach(function (e) {
      var key = e.kind + ':' + e.id;
      if (!present[key] && e.kind !== 'relation' && removedKeys.indexOf(key) < 0) removedKeys.push(key);
    });
    removedKeys.forEach(function (key) {
      var parts = key.split(':'), e = evs(parts[0], Number(parts[1]));
      out.push({ kind: parts[0], id: Number(parts[1]), role: (e[0] && e[0].role) || '', removed: true, events: e, children: [] });
    });
    return Object.assign({}, tree, { children: out, hiddenCount: hidden, events: events.filter(function (e) {
      return e.kind === 'relation' && e.id === tree.id;
    }) });
  }

  var api = { windowTree: windowTree, buildTree: buildTree, wayRefsOf: wayRefsOf, findPath: findPath };
  if (isNode) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
