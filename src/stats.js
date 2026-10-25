(function (root) {
  'use strict';

  var EARTH_KM = 6371.0088;

  function index(snapshot) {
    var ways = {}, rels = {};
    snapshot.elements.forEach(function (e) {
      if (e.type === 'way') ways[e.id] = e;
      else if (e.type === 'relation') rels[e.id] = e;
    });
    return { ways: ways, rels: rels };
  }

  // Parcourt la relation et ses sous-relations (une fois chacune) : relations vues, niveaux, chemins uniques.
  function walk(idx, rootId) {
    var seenRel = {}, seenWay = {}, relList = [], wayList = [], depth = 0;
    (function visit(id, level) {
      var rel = idx.rels[id];
      if (!rel || seenRel[id]) return;
      seenRel[id] = true; relList.push(rel);
      depth = Math.max(depth, level);
      rel.members.forEach(function (mb) {
        if (mb.type === 'relation') visit(mb.ref, level + 1);
        else if (mb.type === 'way' && idx.ways[mb.ref] && !seenWay[mb.ref]) { seenWay[mb.ref] = true; wayList.push(idx.ways[mb.ref]); }
      });
    })(rootId, 1);
    return { rels: relList, ways: wayList, depth: depth };
  }

  // Taille de la structure : de quoi décider s'il faut redécouper une relation trop grosse.
  function structureStats(snapshot, rootId) {
    var w = walk(index(snapshot), rootId), maxWay = null, nodes = 0;
    w.ways.forEach(function (way) {
      nodes += way.nodes.length;
      if (!maxWay || way.nodes.length > maxWay.count) maxWay = { id: way.id, count: way.nodes.length };
    });
    var biggest = w.rels.map(function (r) { return { id: r.id, name: (r.tags && r.tags.name) || null, members: r.members.length }; })
      .sort(function (a, b) { return b.members - a.members || a.id - b.id; }).slice(0, 5);
    return { relations: w.rels.length, depth: w.depth, ways: w.ways.length, nodes: nodes, maxNodesWay: maxWay, biggest: biggest };
  }

  function rad(d) { return d * Math.PI / 180; }

  // Longueur d'un chemin en kilomètres (distance sur la sphère). 0 si une position manque.
  function wayLengthKm(nodeIds, nodes) {
    var total = 0;
    for (var i = 1; i < nodeIds.length; i++) {
      var a = nodes[nodeIds[i - 1]], b = nodes[nodeIds[i]];
      if (!a || !b) return 0;
      var dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      total += 2 * EARTH_KM * Math.asin(Math.sqrt(h));
    }
    return total;
  }

  // Longueur totale (chaque chemin une fois) et plus long chemin, à partir des positions chargées.
  function lengthStats(snapshot, rootId, nodes) {
    var w = walk(index(snapshot), rootId), total = 0, longest = null, noPosition = 0;
    w.ways.forEach(function (way) {
      var km = wayLengthKm(way.nodes, nodes);
      if (!km) { noPosition++; return; }
      total += km;
      if (!longest || km > longest.km) longest = { id: way.id, km: km };
    });
    return { totalKm: total, longest: longest, noPosition: noPosition };
  }

  function sumKm(ways, nodes) {
    return ways.reduce(function (t, w) { return t + wayLengthKm(w.nodes, nodes); }, 0);
  }

  // Une ligne par relation de l'arbre (la racine d'abord) : membres, chemins uniques et longueur de ses chemins
  // (sous-relations comprises, chaque chemin une fois), à partir des positions chargées.
  function relationLengths(snapshot, rootId, nodes) {
    var idx = index(snapshot);
    return walk(idx, rootId).rels.map(function (rel) {
      var sub = walk(idx, rel.id);
      return { id: rel.id, name: (rel.tags && rel.tags.name) || null, members: rel.members.length, ways: sub.ways.length, km: sumKm(sub.ways, nodes) };
    });
  }

  // Un morceau est un ensemble de membres reliés (result.pieces : indices de membres) : chemins, nœuds distincts, longueur.
  function pieceStats(snapshot, result, nodes) {
    var idx = index(snapshot), rel = idx.rels[result.relationId];
    return result.pieces.map(function (piece) {
      var ways = [], seen = {}, nodeSet = {};
      piece.forEach(function (i) {
        var mb = rel && rel.members[i], w = mb && mb.type === 'way' && idx.ways[mb.ref];
        if (!w || seen[w.id]) return;
        seen[w.id] = true; ways.push(w);
        w.nodes.forEach(function (n) { nodeSet[n] = true; });
      });
      return { ways: ways.length, nodes: Object.keys(nodeSet).length, km: sumKm(ways, nodes) };
    });
  }

  var api = { relationLengths: relationLengths, pieceStats: pieceStats, structureStats: structureStats, wayLengthKm: wayLengthKm, lengthStats: lengthStats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
