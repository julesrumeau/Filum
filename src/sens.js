(function (root) {
  'use strict';

  // Sens de parcours d'un itinéraire SIMPLE : une seule suite de chemins, deux bouts libres, sans branche, sans boucle,
  // sans rond-point ni raccord en T, sans rôle autre que vide ou main. Dans tous les autres cas, null : mieux vaut
  // ne rien montrer qu'un sens faux (message 31 de pyrog).
  var MIN_AGREEMENT = 0.6;

  // members : [{ ref, nodes, role }] dans l'ordre de la liste de la relation.
  // Renvoie { path: [{ index, ref, forward, from, to }], start, end } ou null. `forward` : le chemin est parcouru dans
  // l'ordre de ses nœuds. Le sens vient de l'ordre de la LISTE (on part du bout où elle commence), pas de la géométrie.
  function routeDirection(members) {
    if (members.length < 2) return null;
    var seen = {}, ends = {}, interior = {}, k, j;
    for (k = 0; k < members.length; k++) {
      var m = members[k], n = m.nodes;
      if (seen[m.ref] || n.length < 2 || n[0] === n[n.length - 1]) return null;
      if (m.role && m.role !== 'main') return null;
      seen[m.ref] = true;
      [[0, n[0]], [1, n[n.length - 1]]].forEach(function (e) { (ends[e[1]] = ends[e[1]] || []).push({ k: k, side: e[0] }); });
      for (j = 1; j < n.length - 1; j++) {
        if (interior[n[j]]) return null; // nœud intérieur partagé : croisement
        interior[n[j]] = true;
      }
    }
    var free = [];
    for (var node in ends) {
      if (interior[node] || ends[node].length > 2) return null; // raccord en T ou branche
      if (ends[node].length === 1) free.push(Number(node));
    }
    if (free.length !== 2) return null;
    var path = orderPath(members, ends, free[0]);
    return path && direct(path);
  }

  // Parcourt la chaîne depuis un bout libre ; null si elle n'atteint pas tous les chemins (plusieurs morceaux).
  function orderPath(members, ends, startNode) {
    var cur = startNode, used = {}, path = [];
    for (;;) {
      var item = ends[cur].filter(function (e) { return !used[e.k]; })[0];
      if (!item) break;
      used[item.k] = true;
      var m = members[item.k], forward = item.side === 0, next = forward ? m.nodes[m.nodes.length - 1] : m.nodes[0];
      path.push({ index: item.k, ref: m.ref, forward: forward, from: cur, to: next });
      cur = next;
    }
    return path.length === members.length ? path : null;
  }

  // Choisit le bout de départ : celui d'où la liste est le plus souvent croissante. Sans ordre net, null.
  function direct(path) {
    var up = 0;
    for (var i = 1; i < path.length; i++) if (path[i].index > path[i - 1].index) up++;
    var ratio = up / (path.length - 1);
    if (ratio >= MIN_AGREEMENT) return result(path);
    if (ratio <= 1 - MIN_AGREEMENT) {
      return result(path.slice().reverse().map(function (p) { return { index: p.index, ref: p.ref, forward: !p.forward, from: p.to, to: p.from }; }));
    }
    return null;
  }

  function result(path) { return { path: path, start: path[0].from, end: path[path.length - 1].to }; }

  var api = { routeDirection: routeDirection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
