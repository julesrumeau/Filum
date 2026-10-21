(function (root) {
  'use strict';

  function has(list, x) { return list.indexOf(x) >= 0; }

  // Nœuds ajoutés et retirés entre deux versions d'un chemin, et extrémités changées ou non.
  function diffNodes(prev, cur) {
    prev = prev || []; cur = cur || [];
    var ends = function (l) { return l.length ? [l[0], l[l.length - 1]] : []; };
    var a = ends(prev), b = ends(cur);
    return {
      added: cur.filter(function (n) { return !has(prev, n); }),
      removed: prev.filter(function (n) { return !has(cur, n); }),
      endsChanged: a.length !== b.length || a[0] !== b[0] || a[1] !== b[1],
      endsBefore: a, endsAfter: b,
    };
  }

  // Tags ajoutés, retirés ou modifiés entre deux versions.
  function diffTags(a, b) {
    a = a || {}; b = b || {};
    var keys = Object.keys(a).concat(Object.keys(b).filter(function (k) { return !(k in a); }));
    return keys.filter(function (k) { return a[k] !== b[k]; })
      .map(function (k) { return { key: k, before: a[k], after: b[k] }; });
  }

  // Membres ajoutés, retirés, ou dont le rôle a changé entre deux versions d'une relation.
  function diffMembers(a, b) {
    function key(m) { return m.type + ':' + m.ref; }
    var inA = {}, inB = {};
    a.forEach(function (m) { inA[key(m)] = m; });
    b.forEach(function (m) { inB[key(m)] = m; });
    return {
      added: b.filter(function (m) { return !inA[key(m)]; }),
      removed: a.filter(function (m) { return !inB[key(m)]; }),
      roleChanged: b.filter(function (m) { return inA[key(m)] && inA[key(m)].role !== m.role; })
        .map(function (m) { return { type: m.type, ref: m.ref, before: inA[key(m)].role, after: m.role }; }),
    };
  }

  function versionAt(versions, date) {
    var best = null;
    versions.forEach(function (v) { if (v.timestamp <= date && (!best || v.version > best.version)) best = v; });
    return best;
  }

  function byVersion(list) { return list.slice().sort(function (a, b) { return a.version - b.version; }); }

  function base(kind, id, action, v) {
    return { kind: kind, id: id, action: action, date: v.timestamp, version: v.version, user: v.user, changeset: v.changeset };
  }

  // Tout ce qui a été créé, modifié, ajouté à la relation, retiré ou supprimé entre fromIso et toIso (inclus).
  // Seuls les chemins dont l'historique est chargé peuvent apparaître. Un chemin n'est retenu que s'il était
  // membre de la relation à la date de l'événement.
  function windowChanges(ctx, relationId, fromIso, toIso) {
    var events = [];
    function inWindow(v) { return v.timestamp >= fromIso && v.timestamp <= toIso; }

    var rels = byVersion(ctx.relHistory);
    rels.forEach(function (v, i) {
      if (!inWindow(v)) return;
      var prev = i > 0 ? rels[i - 1] : null;
      var members = diffMembers(prev ? prev.members || [] : [], v.members || []);
      if (!prev) {
        events.push(Object.assign(base('relation', relationId, 'created', v), { tags: diffTags({}, v.tags) }));
      } else {
        events.push(Object.assign(base('relation', relationId, 'modified', v), {
          tags: diffTags(prev.tags, v.tags),
          members: { added: members.added.length, removed: members.removed.length,
            addedList: members.added, removedList: members.removed },
          prevVersion: prev.version,
        }));
      }
      members.added.forEach(function (m) {
        events.push(Object.assign(base(m.type, m.ref, 'added-to-relation', v), { role: m.role }));
      });
      members.removed.forEach(function (m) {
        events.push(Object.assign(base(m.type, m.ref, 'removed-from-relation', v), { role: m.role }));
      });
      members.roleChanged.forEach(function (m) {
        events.push(Object.assign(base(m.type, m.ref, 'role-changed', v), { before: m.before, after: m.after }));
      });
    });

    Object.keys(ctx.wayHistories).forEach(function (id) {
      var vs = byVersion(ctx.wayHistories[id]);
      vs.forEach(function (v, i) {
        if (!inWindow(v)) return;
        var rel = versionAt(ctx.relHistory, v.timestamp);
        var member = rel && (rel.members || []).some(function (m) { return m.type === 'way' && String(m.ref) === String(id); });
        if (!member) return;
        var wayId = Number(id);
        if (i === 0) {
          events.push(Object.assign(base('way', wayId, 'created', v), { nodes: diffNodes([], v.nodes), tags: diffTags({}, v.tags) }));
        } else if (v.visible === false) {
          events.push(base('way', wayId, 'deleted', v));
        } else {
          var prev = vs[i - 1];
          events.push(Object.assign(base('way', wayId, 'modified', v), {
            nodes: diffNodes(prev.nodes, v.nodes), tags: diffTags(prev.tags, v.tags), prevVersion: prev.version }));
        }
      });
    });

    return events.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  var api = { windowChanges: windowChanges, diffNodes: diffNodes, diffTags: diffTags, diffMembers: diffMembers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
