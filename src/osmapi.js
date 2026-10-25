(function (root) {
  'use strict';

  var BASE = 'https://api.openstreetmap.org/api/0.6/';
  var MAX_IDS = 700; // l'API OSM accepte 725 identifiants par appel groupé
  // Longueur maximale d'une adresse complète. L'API répond 414 (URI Too Long) au-delà d'environ 8 190 caractères
  // (mesuré : 200 à 8 058, 414 à 8 358). Des identifiants de 11 chiffres en tiennent environ 578, pas 700.
  var MAX_URL_CHARS = 7000;

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Appel réel : JSON, 3 essais si le serveur est surchargé.
  async function getJson(path) {
    var lastError;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var res = await fetch(BASE + path);
        if (res.status === 429 || res.status >= 500) throw new Error('API OSM : réponse ' + res.status);
        if (!res.ok) throw new Error('API OSM : réponse ' + res.status + ' pour ' + path.slice(0, 60));
        return await res.json();
      } catch (e) {
        lastError = e;
        if (/ pour /.test(e.message)) throw e;
        await sleep(1500 * (attempt + 1));
      }
    }
    throw lastError;
  }

  function chunks(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  // Découpe en lots de au plus maxCount identifiants ET dont la liste (séparée par des virgules) tient
  // en maxChars caractères.
  function chunksByLength(list, maxCount, maxChars) {
    var out = [], cur = [], len = 0;
    list.forEach(function (id) {
      var add = String(id).length + 1;
      if (cur.length && (cur.length >= maxCount || len + add > maxChars)) { out.push(cur); cur = []; len = 0; }
      cur.push(id); len += add;
    });
    if (cur.length) out.push(cur);
    return out;
  }

  // Un identifiant inexistant (404) fait échouer tout l'appel groupé : on coupe en deux pour l'isoler.
  // Il est alors simplement absent du résultat (la continuité le compte comme membre manquant).
  async function getTolerant(path, ids, get) {
    try {
      return await get(path + ids.join(','));
    } catch (e) {
      if (!/ 404 /.test(e.message)) throw e;
      if (ids.length === 1) return { elements: [] };
      var half = Math.ceil(ids.length / 2);
      var parts = await Promise.all([getTolerant(path, ids.slice(0, half), get), getTolerant(path, ids.slice(half), get)]);
      return { elements: parts[0].elements.concat(parts[1].elements) };
    }
  }

  function fetchBulk(kind, ids, get) {
    var prefix = kind + 's.json?' + kind + 's=';
    var room = MAX_URL_CHARS - BASE.length - prefix.length;
    return Promise.all(chunksByLength(ids, MAX_IDS, room).map(function (c) {
      return getTolerant(prefix, c, get);
    })).then(function (parts) {
      return parts.reduce(function (all, p) { return all.concat(p.elements); }, []);
    });
  }

  // Historique d'une relation supprimée : sa dernière version visible (last, null s'il n'y en a jamais eu)
  // et la version qui l'a supprimée (deletion).
  async function fetchDeletedRelation(id, get) {
    get = get || getJson;
    var versions = (await get('relation/' + id + '/history.json')).elements.slice().sort(function (a, b) { return a.version - b.version; });
    var last = null, deletion = null;
    versions.forEach(function (v) {
      if (v.visible === false) { if (last && !deletion) deletion = v; }
      else { last = v; deletion = null; }
    });
    return { last: last, deletion: deletion };
  }

  // La relation demandée doit exister et ne pas être supprimée ; sinon un message qui dit pourquoi.
  function checkRoot(rootId, rels) {
    var root = rels.filter(function (r) { return r.id === rootId; })[0];
    if (!root) throw new Error('La relation ' + rootId + ' n\'existe pas dans OpenStreetMap.');
    if (root.visible === false) {
      var err = new Error('La relation ' + rootId + ' a été supprimée d\'OpenStreetMap (version ' + root.version + ').');
      err.deletedRoot = root;
      throw err;
    }
  }

  // La relation, toutes ses sous-relations (niveau par niveau) et tous leurs chemins.
  // Pas de nœuds : la continuité n'a besoin que de la liste des nœuds de chaque chemin.
  // rootOverride : la relation de départ déjà connue (par exemple la dernière version avant sa suppression),
  // utilisée à la place de la lecture de la racine.
  async function fetchTree(rootId, get, rootOverride) {
    get = get || getJson;
    var seen = {}, elements = [], level = [rootId];
    var wayIds = {};
    while (level.length) {
      level.forEach(function (id) { seen[id] = true; });
      var first = level[0] === rootId && level.length === 1;
      var rels = first && rootOverride ? [rootOverride] : await fetchBulk('relation', level, get);
      if (first && !rootOverride) checkRoot(rootId, rels);
      var next = {};
      rels.forEach(function (r) {
        if (r.visible === false) return; // sous-relation supprimée depuis : ignorée
        elements.push(r);
        r.members.forEach(function (m) {
          if (m.type === 'relation' && !seen[m.ref]) next[m.ref] = true;
          else if (m.type === 'way') wayIds[m.ref] = true;
        });
      });
      level = Object.keys(next).map(Number);
    }
    var ways = await fetchBulk('way', Object.keys(wayIds).map(Number), get);
    return { elements: elements.concat(ways) };
  }

  // Les nœuds (avec coordonnées) des chemins demandés, pour le dessin.
  async function fetchNodes(snapshot, wayIds, get) {
    get = get || getJson;
    var wanted = {}, want = {};
    wayIds.forEach(function (id) { wanted[id] = true; });
    snapshot.elements.forEach(function (e) {
      if (e.type === 'way' && wanted[e.id]) e.nodes.forEach(function (n) { want[n] = true; });
    });
    return fetchBulk('node', Object.keys(want).map(Number), get).then(function (nodes) {
      // Un nœud supprimé depuis est renvoyé sans coordonnées (visible: false) : inutilisable pour le tracé.
      return nodes.filter(function (n) { return typeof n.lat === 'number' && typeof n.lon === 'number'; });
    });
  }

  // Positions de nœuds : l'état actuel en appels groupés, puis, pour ceux supprimés depuis (renvoyés sans coordonnées),
  // la dernière version visible de leur historique, un appel par nœud, au plus `cap` appels (8 en parallèle).
  // Renvoie { nodes: { id: {id, lat, lon} }, unresolved } : unresolved compte les nœuds restés sans position.
  async function fetchNodePositions(ids, get, cap) {
    get = get || getJson;
    var nodes = {}, gone = [];
    var current = await fetchBulk('node', ids, get);
    current.forEach(function (n) {
      if (typeof n.lat === 'number' && typeof n.lon === 'number') nodes[n.id] = { id: n.id, lat: n.lat, lon: n.lon };
    });
    ids.forEach(function (id) { if (!nodes[id] && gone.indexOf(id) < 0) gone.push(id); });
    var todo = gone.slice(0, cap === undefined ? 100 : cap);
    for (var i = 0; i < todo.length; i += 8) {
      await Promise.all(todo.slice(i, i + 8).map(async function (id) {
        try {
          var versions = (await get('node/' + id + '/history.json')).elements.filter(function (v) { return typeof v.lat === 'number' && typeof v.lon === 'number'; });
          var last = versions.reduce(function (a, v) { return !a || v.version > a.version ? v : a; }, null);
          if (last) nodes[id] = { id: id, lat: last.lat, lon: last.lon };
        } catch (e) { /* nœud illisible : compté comme sans position */ }
      }));
    }
    return { nodes: nodes, unresolved: ids.filter(function (id, k) { return !nodes[id] && ids.indexOf(id) === k; }).length };
  }

  // Historique de la relation, et de quelques chemins seulement : ceux aux bords des trous
  // (borderWayIds) puis ceux qui ont été retirés de la relation au fil du temps. Les autres chemins
  // gardent leur état actuel (currentWays). Au plus `maxWays` chemins, `truncated` le dit.
  async function fetchHistoryContext(relationId, snapshot, borderWayIds, get, maxWays) {
    get = get || getJson;
    var relHistory = (await get('relation/' + relationId + '/history.json')).elements;
    var last = relHistory.reduce(function (a, v) { return !a || v.version > a.version ? v : a; }, null);
    var current = {};
    ((last && last.members) || []).forEach(function (m) { if (m.type === 'way') current[m.ref] = true; });

    var order = [], seen = {};
    function want(id) { if (!seen[id]) { seen[id] = true; order.push(id); } }
    borderWayIds.forEach(want);
    relHistory.forEach(function (v) {
      (v.members || []).forEach(function (m) { if (m.type === 'way' && !current[m.ref]) want(m.ref); });
    });
    var chosen = order.slice(0, maxWays);

    var wayHistories = {};
    for (var i = 0; i < chosen.length; i += 8) {
      await Promise.all(chosen.slice(i, i + 8).map(function (id) {
        return get('way/' + id + '/history.json').then(function (r) { wayHistories[id] = r.elements; });
      }));
    }

    var currentWays = {};
    snapshot.elements.forEach(function (e) { if (e.type === 'way') currentWays[e.id] = e; });
    return { relHistory: relHistory, wayHistories: wayHistories, currentWays: currentWays,
      truncated: order.length > chosen.length };
  }

  // Commentaire, taille et éditeur des changesets, par numéro (appels groupés de 50).
  // Un changeset introuvable est absent du résultat.
  async function fetchChangesets(ids, get) {
    get = get || getJson;
    var unique = [], seen = {};
    ids.forEach(function (id) { if (!seen[id]) { seen[id] = true; unique.push(id); } });
    var out = {};
    var parts = await Promise.all(chunks(unique, 50).map(function (c) {
      return get('changesets.json?changesets=' + c.join(','));
    }));
    parts.forEach(function (p) {
      p.changesets.forEach(function (cs) {
        var tags = cs.tags || {};
        out[cs.id] = { id: cs.id, user: cs.user, comment: tags.comment || null,
          changesCount: cs.changes_count, createdBy: tags.created_by || null,
          commentsCount: cs.comments_count || 0 };
      });
    });
    return out;
  }

  // Discussion de chaque changeset qui en a une (commentsCount > 0) : commentaires visibles seulement.
  // Un échec isolé n'empêche pas les autres.
  async function fetchDiscussions(changesets, get) {
    get = get || getJson;
    var out = {};
    var ids = Object.keys(changesets).filter(function (id) { return changesets[id].commentsCount > 0; });
    await Promise.all(ids.map(function (id) {
      return get('changeset/' + id + '.json?include_discussion=true').then(function (r) {
        out[id] = ((r.changeset && r.changeset.comments) || [])
          .filter(function (c) { return c.visible !== false; })
          .map(function (c) { return { user: c.user, date: c.date, text: c.text }; });
      }).catch(function () {});
    }));
    return out;
  }

  // Lit l'historique des chemins demandés, page par page (8 appels en parallèle), et le range dans
  // ctx.wayHistories. opts : pageSize, onPage({done, total, failed}), shouldStop() vérifié entre deux pages.
  // Un chemin en échec est listé dans `failed` sans bloquer les autres ; on peut reprendre plus tard.
  async function fetchWayHistories(ids, ctx, get, opts) {
    get = get || getJson;
    opts = opts || {};
    var todo = ids.filter(function (id) { return !ctx.wayHistories[id]; });
    var size = opts.pageSize || 80, done = 0, failed = [], stopped = false;
    for (var i = 0; i < todo.length; i += size) {
      if (opts.shouldStop && opts.shouldStop()) { stopped = true; break; }
      var page = todo.slice(i, i + size);
      for (var j = 0; j < page.length; j += 8) {
        await Promise.all(page.slice(j, j + 8).map(function (id) {
          return get('way/' + id + '/history.json').then(function (r) { ctx.wayHistories[id] = r.elements; })
            .catch(function () { failed.push(id); });
        }));
      }
      done += page.length;
      if (opts.onPage) opts.onPage({ done: done, total: todo.length, failed: failed.slice() });
    }
    return { done: done, failed: failed, stopped: stopped };
  }

  // Versions de la relation, de la plus ancienne à la plus récente.
  async function fetchRelationHistory(relationId, get) {
    get = get || getJson;
    var r = await get('relation/' + relationId + '/history.json');
    return r.elements.slice().sort(function (a, b) { return a.version - b.version; });
  }

  // Relations qui contiennent un chemin ou une relation (« partie de »), avec leurs tags et leur nombre de membres.
  async function fetchParents(kind, id, get) {
    get = get || getJson;
    var res = await get(kind + '/' + id + '/relations.json');
    return res.elements.map(function (r) { return { id: r.id, tags: r.tags || {}, members: (r.members || []).length }; })
      .sort(function (a, b) { return a.id - b.id; });
  }

  // Nœuds membres (arrêts, bornes, balisage...) de toutes les relations du cliché, avec leurs tags et positions.
  async function fetchMemberNodes(snapshot, get) {
    get = get || getJson;
    var want = {};
    snapshot.elements.forEach(function (e) {
      if (e.type === 'relation') e.members.forEach(function (m) { if (m.type === 'node') want[m.ref] = true; });
    });
    var ids = Object.keys(want).map(Number);
    if (!ids.length) return [];
    var nodes = await fetchBulk('node', ids, get);
    return nodes.filter(function (n) { return typeof n.lat === 'number' && typeof n.lon === 'number'; });
  }

  // Pour chaque nœud, les chemins qui le contiennent (un appel par nœud : à réserver à quelques nœuds).
  async function fetchNodeWays(nodeIds, get) {
    get = get || getJson;
    var ids = nodeIds.filter(function (n, i) { return nodeIds.indexOf(n) === i; }), out = {};
    await Promise.all(ids.map(async function (id) {
      var res = await get('node/' + id + '/ways.json');
      out[id] = res.elements;
    }));
    return out;
  }

  // Tout ce qui se trouve dans des boîtes [ouest, sud, est, nord] (état actuel), une requête par boîte, sans doublon.
  // L'API refuse les zones trop grandes ou trop chargées : l'erreur est propagée.
  async function fetchMap(boxes, get) {
    get = get || getJson;
    var parts = await Promise.all(boxes.map(function (b) {
      return get('map.json?bbox=' + b.map(function (v) { return v.toFixed(6); }).join(','));
    }));
    var seen = {}, out = [];
    parts.forEach(function (p) {
      p.elements.forEach(function (e) {
        var key = e.type + e.id;
        if (!seen[key]) { seen[key] = true; out.push(e); }
      });
    });
    return out;
  }

  // Un chemin seul (null s'il n'existe pas ou n'est pas visible).
  async function fetchWay(id, get) {
    get = get || getJson;
    try {
      var res = await get('ways.json?ways=' + id);
      return res.elements[0] || null;
    } catch (e) {
      if (/ 404 /.test(e.message)) return null;
      throw e;
    }
  }

  var api = { fetchMap: fetchMap, fetchNodeWays: fetchNodeWays, fetchMemberNodes: fetchMemberNodes, fetchWay: fetchWay, fetchParents: fetchParents, fetchWayHistories: fetchWayHistories, fetchRelationHistory: fetchRelationHistory, fetchDiscussions: fetchDiscussions, fetchTree: fetchTree, fetchNodes: fetchNodes, fetchDeletedRelation: fetchDeletedRelation, fetchNodePositions: fetchNodePositions, fetchHistoryContext: fetchHistoryContext,
    fetchChangesets: fetchChangesets, MAX_IDS: MAX_IDS, MAX_URL_CHARS: MAX_URL_CHARS, API_BASE: BASE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
