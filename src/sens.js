(function (root) {
  'use strict';

  // Sens de parcours d'un itinéraire SIMPLE : une seule suite de chemins, deux bouts libres (ou une boucle fermée sur
  // elle-même), sans branche, sans rond-point ni raccord en T, sans rôle autre que vide ou main. Dans tous les autres cas, null : mieux vaut
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
    if (free.length === 0) return loopDirection(members, ends);
    if (free.length !== 2) return null;
    var path = orderPath(members, ends, free[0], null);
    return path && direct(path);
  }

  // Boucle (aucun bout libre) : on part du premier membre de la liste, dans un sens ou dans l'autre, et on garde le
  // sens où la liste monte le plus souvent. Le départ et l'arrivée sont le même nœud.
  function loopDirection(members, ends) {
    var best = null;
    [0, 1].forEach(function (side) {
      var m = members[0], first = { k: 0, side: side }, node = side === 0 ? m.nodes[0] : m.nodes[m.nodes.length - 1];
      var path = orderPath(members, ends, node, first);
      if (!path || path[path.length - 1].to !== node) return;
      var r = fit(path);
      if (!best || r > best.r) best = { path: path, r: r };
    });
    if (!best || best.r < MIN_AGREEMENT) return null;
    var res = result(best.path);
    res.loop = true;
    return res;
  }

  // Parcourt la chaîne depuis un bout libre ; null si elle n'atteint pas tous les chemins (plusieurs morceaux).
  function orderPath(members, ends, startNode, firstItem) {
    var cur = startNode, used = {}, path = [];
    for (;;) {
      var item = firstItem && !path.length ? firstItem : (ends[cur] || []).filter(function (e) { return !used[e.k]; })[0];
      if (!item) break;
      used[item.k] = true;
      var m = members[item.k], forward = item.side === 0, next = forward ? m.nodes[m.nodes.length - 1] : m.nodes[0];
      path.push({ index: item.k, ref: m.ref, forward: forward, from: cur, to: next });
      cur = next;
    }
    return path.length === members.length ? path : null;
  }

  // Choisit le bout de départ : celui d'où la liste est le plus souvent croissante. Sans ordre net, null.
  // Part des paires de chemins consécutifs du parcours qui se suivent aussi dans la LISTE (rang suivant). 1 pour une
  // liste parfaitement ordonnée, (N-2)/(N-1) pour une liste tournée en deux moitiés, près de 0 pour une liste mélangée.
  function fit(path) {
    var next = 0;
    for (var i = 1; i < path.length; i++) if (path[i].index === path[i - 1].index + 1) next++;
    return next / (path.length - 1);
  }

  function reverse(path) {
    return path.slice().reverse().map(function (p) { return { index: p.index, ref: p.ref, forward: !p.forward, from: p.to, to: p.from }; });
  }

  // Choisit le bout de départ : celui d'où la liste se suit le mieux. Sans ordre net, null.
  function direct(path) {
    var back = reverse(path), a = fit(path), b = fit(back);
    if (Math.max(a, b) < MIN_AGREEMENT) return null;
    return result(a >= b ? path : back);
  }

  function result(path) { return { path: path, start: path[0].from, end: path[path.length - 1].to }; }

  // Sens de circulation d'un chemin selon son rôle dans la relation : forward (dans l'ordre de ses nœuds), backward
  // (à l'envers), both (aucun rôle ou main : dans les deux sens). null pour tout autre rôle (variante, quai, arrêt...).
  function roleKind(role) {
    if (role === 'forward' || role === 'backward') return role;
    return !role || role === 'main' ? 'both' : null;
  }

  // Pour un itinéraire à sens (vélo, voiture, bus) : les chemins forward et backward avec leurs nœuds dans le sens de
  // circulation, et le type de chaque chemin (kinds, par identifiant). hasDirections : il y a au moins un rôle forward ou
  // backward. members : [{ ref, nodes, role }].
  function rolePaths(members) {
    var out = { hasDirections: false, paths: [], kinds: {} };
    members.forEach(function (m) {
      var kind = roleKind(m.role);
      if (!kind) return;
      out.kinds[m.ref] = kind;
      if (kind === 'both') return;
      out.hasDirections = true;
      out.paths.push({ ref: m.ref, kind: kind, nodes: kind === 'forward' ? m.nodes.slice() : m.nodes.slice().reverse() });
    });
    return out;
  }

  var api = { roleKind: roleKind, rolePaths: rolePaths, routeDirection: routeDirection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
