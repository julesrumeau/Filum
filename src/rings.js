(function (root) {
  'use strict';

  // Assemble les chemins d'un polygone en anneaux (un contour = une suite de chemins bout à bout), séparément
  // pour chaque rôle (outer, inner ; un chemin sans rôle compte comme outer). Un anneau est fermé s'il revient à son
  // point de départ, sinon on donne ses deux bouts libres. Entrée : [{ ref, role, nodes }].
  function ringsOfRole(members, role) {
    var byEnd = new Map(), used = {}, rings = [];
    members.forEach(function (m, i) {
      var e = [m.nodes[0], m.nodes[m.nodes.length - 1]];
      e.forEach(function (n, k) {
        if (k === 1 && e[0] === e[1]) return;
        if (!byEnd.has(n)) byEnd.set(n, []);
        byEnd.get(n).push(i);
      });
    });
    function next(node) {
      var list = byEnd.get(node) || [];
      for (var k = 0; k < list.length; k++) if (!used[list[k]]) return list[k];
      return -1;
    }
    members.forEach(function (m, i) {
      if (used[i]) return;
      used[i] = true;
      var ways = [m.ref], first = m.nodes[0], tail = m.nodes[m.nodes.length - 1];
      var head = first;
      var closed = first === tail;
      while (!closed) {
        var j = next(tail);
        if (j < 0) break;
        used[j] = true; ways.push(members[j].ref);
        var ends = [members[j].nodes[0], members[j].nodes[members[j].nodes.length - 1]];
        tail = ends[0] === tail ? ends[1] : ends[0];
        if (tail === head) closed = true;
      }
      while (!closed) {
        var j2 = next(head);
        if (j2 < 0) break;
        used[j2] = true; ways.unshift(members[j2].ref);
        var e2 = [members[j2].nodes[0], members[j2].nodes[members[j2].nodes.length - 1]];
        head = e2[0] === head ? e2[1] : e2[0];
        if (head === tail) closed = true;
      }
      rings.push({ role: role, ways: ways, closed: closed, openEnds: closed ? [] : [head, tail] });
    });
    return rings;
  }

  function buildRings(wayMembers) {
    var outer = [], inner = [];
    wayMembers.forEach(function (m) { (m.role === 'inner' ? inner : outer).push(m); });
    return ringsOfRole(outer, 'outer').concat(ringsOfRole(inner, 'inner'));
  }

  var api = { buildRings: buildRings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
