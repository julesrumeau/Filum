(function () {
  'use strict';
  var F = window.Filum;
  var $ = function (id) { return document.getElementById(id); };
  var state = { snapshot: null, results: [], nodes: {}, loaded: {}, tree: null, index: [], selected: null, map: null, live: null, frise: null, friseToken: 0, shown: null, window: null };

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function setStatus(msg, isError) {
    var el = $('status');
    el.textContent = msg;
    el.className = isError ? 'erreur' : '';
  }

  function isHole(r) { return r.gaps.length || r.missing.length || r.openEnds.length; }
  function isWarning(r) { return r.orderIssues.length || r.detached.length; }

  function metaText(n) {
    if (!n.version) return '';
    return 'v' + n.version + ' · ' + esc(n.user) + ' · ' + fmtDate(n.timestamp);
  }

  function osmLink(kind, id) {
    return '<a href="https://www.openstreetmap.org/' + kind + '/' + id + '" target="_blank" rel="noopener">#' + id + '</a>';
  }

  function summaryText(n) {
    var s = n.summary, shown = n.children.filter(function (c) { return c.kind !== 'gap' && c.kind !== 'order'; }).length;
    var parts = [n.hiddenCount === undefined ? shown + ' membre(s)' : shown + ' touché(s) affiché(s), ' + n.hiddenCount + ' masqué(s)'];
    parts.push(s.isPolygon ? 'polygone' : s.pieces + ' morceau(x)');
    if (s.gaps) parts.push(s.gaps + ' trou(s)');
    if (s.openEnds) parts.push(s.openEnds + ' bout(s) ouvert(s)');
    if (s.orderIssues) parts.push(s.orderIssues + ' problème(s) d\'ordre');
    if (s.detached) parts.push(s.detached + ' isolé(s)');
    if (s.missing) parts.push(s.missing + ' absent(s)');
    return parts.join(', ');
  }

  // Clé d'une ligne ou d'un élément de la carte sélectionnable : chemin, trou ou problème d'ordre.
  function selKey(n) {
    if (n.kind === 'way' && !n.missing) return 'way:' + n.id;
    if (n.kind === 'node' && n.loaded) return 'node:' + n.id;
    if (n.kind === 'gap') return 'gap:' + n.relationId + ':' + n.gapIndex;
    if (n.kind === 'order') return 'order:' + n.relationId + ':' + n.orderIndex;
    return null;
  }

  function notesHtml(n) {
    return (n.notes || []).map(function (x) {
      return '<span class="note" title="Écrit par un contributeur sur cet élément">' + esc(x.key) + ' : ' + esc(x.value) + '</span>';
    }).join('');
  }

  function eventText(e) {
    if (e.action === 'created') return e.kind === 'relation' ? 'relation créée' : 'créé';
    if (e.action === 'deleted') return 'supprimé';
    if (e.action === 'added-to-relation') return 'ajouté à la relation' + (e.role ? ' (rôle ' + e.role + ')' : '');
    if (e.action === 'removed-from-relation') return 'retiré de la relation';
    if (e.action === 'role-changed') return 'rôle : ' + (e.before || 'aucun') + ' → ' + (e.after || 'aucun');
    var parts = [];
    if (e.nodes) {
      if (e.nodes.removed.length) parts.push('−' + e.nodes.removed.length + ' nœud(s)');
      if (e.nodes.added.length) parts.push('+' + e.nodes.added.length + ' nœud(s)');
      if (e.nodes.endsChanged) parts.push('extrémités changées');
    }
    if (e.tags && e.tags.length) parts.push('tags : ' + e.tags.map(function (t) { return t.key; }).join(', '));
    if (e.members && (e.members.added || e.members.removed)) parts.push('membres +' + e.members.added + ' −' + e.members.removed);
    return 'modifié' + (parts.length ? ' (' + parts.join(', ') + ')' : '');
  }

  // Preuve avant/après : de quoi contrôler sans aller sur osm.org (versions brutes, nœuds, tags, membres).
  var PROOF_MAX = 10;
  function linkList(kind, list) {
    var shown = list.slice(0, PROOF_MAX).map(function (x) { return osmLink(kind, x); }).join(', ');
    return shown + (list.length > PROOF_MAX ? ' et ' + (list.length - PROOF_MAX) + ' autre(s)' : '');
  }
  function versionLink(kind, id, v) {
    return '<a href="https://api.openstreetmap.org/api/0.6/' + kind + '/' + id + '/' + v + '" target="_blank" rel="noopener">v' + v + '</a>';
  }
  function proofHtml(e) {
    if (e.action !== 'modified' && e.action !== 'created') return '';
    var rows = [];
    if (e.prevVersion) {
      rows.push('Versions : ' + versionLink(e.kind, e.id, e.prevVersion) + ' (avant) → ' + versionLink(e.kind, e.id, e.version)
        + ' (après), données brutes de l\'API. <a href="https://www.openstreetmap.org/' + e.kind + '/' + e.id
        + '/history" target="_blank" rel="noopener">Historique complet</a>');
    }
    if (e.nodes) {
      if (e.nodes.endsChanged && e.nodes.endsBefore.length) {
        rows.push('Extrémités : avant ' + linkList('node', e.nodes.endsBefore) + ', après ' + linkList('node', e.nodes.endsAfter));
      }
      if (e.nodes.removed.length) rows.push('Nœuds retirés : ' + linkList('node', e.nodes.removed));
      if (e.nodes.added.length && e.action !== 'created') rows.push('Nœuds ajoutés : ' + linkList('node', e.nodes.added));
    }
    (e.tags || []).slice(0, PROOF_MAX).forEach(function (t) {
      rows.push('Tag ' + esc(t.key) + ' : ' + (t.before === undefined ? '(absent)' : '« ' + esc(t.before) + ' »')
        + ' → ' + (t.after === undefined ? '(retiré)' : '« ' + esc(t.after) + ' »'));
    });
    if (e.members && e.members.addedList) {
      var key = function (m) { return m.type + ' ' + osmLink(m.type, m.ref) + (m.role ? ' (' + esc(m.role) + ')' : ''); };
      if (e.members.addedList.length) rows.push('Membres ajoutés : ' + e.members.addedList.slice(0, PROOF_MAX).map(key).join(', ')
        + (e.members.addedList.length > PROOF_MAX ? ' et ' + (e.members.addedList.length - PROOF_MAX) + ' autre(s)' : ''));
      if (e.members.removedList.length) rows.push('Membres retirés : ' + e.members.removedList.slice(0, PROOF_MAX).map(key).join(', ')
        + (e.members.removedList.length > PROOF_MAX ? ' et ' + (e.members.removedList.length - PROOF_MAX) + ' autre(s)' : ''));
    }
    if (!rows.length) return '';
    return '<details class="preuve"><summary>Preuve</summary><div>' + rows.join('<br>') + '</div></details>';
  }

  function eventLine(e) {
    return '<div class="ev ev-' + e.action + '">' + esc(eventText(e)) + ' <span class="detail">par ' + esc(e.user) + ', '
      + fmtDate(e.date) + ', <a href="https://www.openstreetmap.org/changeset/' + e.changeset
      + '" target="_blank" rel="noopener">changeset ' + e.changeset + '</a></span>' + proofHtml(e) + '</div>';
  }

  // Les nombreuses versions de la relation sont résumées en une ligne, détail à ouvrir.
  function relationEventsHtml(n) {
    var added = 0, removed = 0, tags = 0;
    n.events.forEach(function (e) {
      if (e.members) { added += e.members.added; removed += e.members.removed; }
      if (e.tags && e.tags.length) tags++;
    });
    return '<details class="evenements ev-groupe"><summary>La relation a été modifiée ' + n.events.length + ' fois dans la période (v'
      + n.events[0].version + ' à v' + n.events[n.events.length - 1].version + ') : +' + added + ' et −' + removed + ' membre(s)'
      + (tags ? ', ' + tags + ' changement(s) de tags' : '') + '</summary>' + n.events.map(eventLine).join('') + '</details>';
  }

  function eventsHtml(n) {
    if (!n.events || !n.events.length) return '';
    if (n.kind === 'relation' && n.events.length > 2) return relationEventsHtml(n);
    return '<div class="evenements">' + n.events.map(eventLine).join('') + '</div>';
  }

  function nodeIds(list) { return list.map(function (id) { return '#' + id; }).join(' ou '); }

  function rowHtml(n) {
    if (n.removed) {
      return '<span class="pastille mauvais" title="Retiré ou supprimé dans la période"></span>' + (n.kind === 'way' ? 'chemin ' : n.kind === 'node' ? 'nœud ' : 'relation ')
        + osmLink(n.kind, n.id) + (n.role ? '<span class="role">' + esc(n.role) + '</span>' : '')
        + ' <span class="detail">n\'est plus dans la relation à la date de fin</span>';
    }
    if (n.kind === 'gap') {
      return '<span class="pastille mauvais"></span><strong>Trou</strong> : le chemin ' + osmLink('way', n.fromRef)
        + ' (bout libre : nœud ' + nodeIds(n.fromEnds) + ') ne se raccorde pas au chemin ' + osmLink('way', n.toRef)
        + ' (nœud ' + nodeIds(n.toEnds) + ') <button class="voir" data-piste="1" data-from="' + n.fromEnds.join(',')
        + '" data-to="' + n.toEnds.join(',') + '" title="Cherche les chemins qui touchent les bouts libres sans être dans la relation">Chercher une cause</button>'
        + '<div class="pistes"></div>';
    }
    if (n.kind === 'order') {
      return '<span class="pastille ordre"></span><strong>Ordre</strong> : le chemin ' + osmLink('way', n.toRef)
        + ' ne suit pas par un bout le chemin ' + osmLink('way', n.fromRef)
        + (n.touching ? ' (raccord en T : ils se touchent ailleurs qu\'à un bout, couper un des deux chemins à cet endroit règle le problème)'
          : ' (aucun nœud commun : la liste saute d\'un chemin à un autre, la relation reste reliée par d\'autres chemins)');
    }
    var role = n.role ? '<span class="role">' + esc(n.role) + '</span>' : '';
    if (n.kind === 'relation') {
      if (n.cycle) return '<div class="ligne-arbre">relation ' + osmLink('relation', n.id) + ' (déjà dans l\'arbre plus haut, cycle)' + role + '</div>';
      if (n.missing) return '<div class="ligne-arbre">relation ' + osmLink('relation', n.id) + ' absente des données chargées' + role + '</div>';
      return '<span class="pastille ' + n.status + '"></span><strong>' + esc(n.name || 'relation') + '</strong> '
        + osmLink('relation', n.id) + role + ' <span class="detail">' + summaryText(n) + ' · ' + metaText(n) + '</span> '
        + (state.window ? '' : '<button class="voir" data-act="map" data-id="' + n.id + '">Tracé</button>') + notesHtml(n);
    }
    if (n.kind === 'way') {
      if (n.missing) return 'chemin ' + osmLink('way', n.id) + ' absent des données chargées' + role;
      return (n.border ? '<span class="pastille mauvais" title="Bord d\'un trou"></span>' : '<span class="pastille vide"></span>')
        + 'chemin ' + osmLink('way', n.id) + (n.name ? ' ' + esc(n.name) : '') + role
        + ' <span class="detail">' + n.nodeCount + ' nœuds (' + n.ends[0] + ' à ' + n.ends[1] + ') · ' + metaText(n)
        + (n.border ? ' · bord d\'un trou' : '') + '</span>' + notesHtml(n);
    }
    var label = [n.name, n.ref && '(' + n.ref + ')'].filter(Boolean).map(esc).join(' ');
    return '<span class="pastille noeud"></span>nœud ' + osmLink('node', n.id) + (label ? ' ' + label : '') + role
      + (n.what ? ' <span class="detail">' + esc(n.what) + '</span>' : (n.loaded ? '' : ' <span class="detail">(non chargé)</span>'));
  }

  function nodeHtml(n, open) {
    var hasKids = n.kind === 'relation' && n.children.length;
    if (!hasKids) {
      var sel = selKey(n);
      return '<div class="feuille ' + n.kind + '"' + (sel ? ' data-sel="' + sel + '"' : '') + '>' + rowHtml(n) + eventsHtml(n) + '</div>';
    }
    var key = state.index.length;
    state.index.push(n);
    return '<details data-key="' + key + '"' + (open ? ' open' : '') + '><summary>' + rowHtml(n) + '</summary>' + eventsHtml(n)
      + '<div class="enfants">' + (open ? childrenHtml(n) : '') + '</div></details>';
  }

  // Les chemins sans rien à signaler sont repliés par suites de 3 ou plus, sauf dans la fenêtre sur une période.
  function childrenHtml(n) {
    var items = state.window ? n.children : F.groupQuiet(n.children, 3);
    return items.map(function (c) {
      if (!c.quiet) return nodeHtml(c, false);
      return '<details class="plie"><summary class="detail">' + c.items.length + ' chemin(s) sans problème</summary>'
        + c.items.map(function (x) { return nodeHtml(x, false); }).join('') + '</details>';
    }).join('');
  }

  // Les enfants d'une relation ne sont dessinés que quand on l'ouvre.
  function fillChildren(details) {
    var box = details.querySelector(':scope > .enfants');
    if (box.firstChild) return;
    box.innerHTML = childrenHtml(state.index[Number(details.dataset.key)]);
  }

  function renderList() {
    var holes = state.results.filter(isHole).length;
    var orders = state.results.filter(function (r) { return !isHole(r) && isWarning(r); }).length;
    $('resume').textContent = state.results.length + ' relation(s) analysée(s) : '
      + holes + ' avec un trou, ' + orders + ' avec seulement un avertissement (ordre, variante isolée).';
    state.index = [];
    $('liste').innerHTML = nodeHtml(state.tree, true);
    var sums = F.holeSummary(state.results);
    $('trous').innerHTML = state.results.length > 1 && sums.length
      ? 'Où sont les trous : ' + sums.slice(0, 12).map(function (h) {
        var r = state.results.filter(function (x) { return x.relationId === h.relationId; })[0];
        return '<button class="voir" data-trou="' + h.relationId + '">' + esc(F.relationLabel({ name: h.name }) || 'relation') + ' #' + h.relationId
          + ' : ' + h.count + (r && r.isPolygon ? ' bout(s) ouvert(s)' : ' trou(s)') + '</button>'
          + (h.relationId !== state.tree.id ? '<button class="voir" data-seule="' + h.relationId + '" title="Analyser cette relation seule, avec la frise et la recherche de l\'historique">Enquêter</button>' : '');
      }).join(' ') + (sums.length > 12 ? ' et ' + (sums.length - 12) + ' autre(s)' : '')
      : '';
  }

  function visibleWayRefs(relId) {
    var refs = F.wayRefsOf(state.snapshot, relId);
    return state.window ? refs.filter(function (id) { return state.window.ways[id]; }) : refs;
  }

  async function showMap(result, keepView) {
    if (!keepView) useLive();
    state.shown = result.relationId;
    var wayIds = visibleWayRefs(result.relationId);
    $('carte').innerHTML = '<p>Chargement du tracé...</p>';
    try {
      var missing = (await F.fetchNodes(state.snapshot, wayIds.filter(function (id) { return !state.loaded[id]; }))) || [];
      missing.forEach(function (n) { state.nodes[n.id] = n; });
      wayIds.forEach(function (id) { state.loaded[id] = true; });
    } catch (e) {
      // Dans une fenêtre, des nœuds d'anciens chemins peuvent avoir été supprimés : on dessine ce qu'on a.
      if (!state.window) { $('carte').innerHTML = '<p class="erreur">Échec du tracé : ' + esc(e.message) + '</p>'; return; }
    }
    renderMap(result);
  }

  function fmtKm(km) { return (km >= 100 ? Math.round(km) : km.toFixed(1)).toString().replace('.', ',') + ' km'; }

  // Taille de la relation affichée : de quoi décider de la redécouper.
  function renderStats(relId) {
    var box = $('stats');
    if (state.window) { box.innerHTML = ''; return; }
    var st = F.structureStats(state.snapshot, relId), ln = F.lengthStats(state.snapshot, relId, state.nodes);
    var rel = state.snapshot.elements.filter(function (e) { return e.type === 'relation' && e.id === relId; })[0];
    var members = rel ? rel.members.length : 0;
    var rows = ['Longueur totale : ' + fmtKm(ln.totalKm) + (ln.noPosition ? ' (' + ln.noPosition + ' chemin(s) sans position, non comptés)' : '')
        + (ln.longest ? ', plus long chemin ' + osmLink('way', ln.longest.id) + ' (' + fmtKm(ln.longest.km) + ')' : ''),
      st.relations + ' relation(s) sur ' + st.depth + ' niveau(x), ' + st.ways + ' chemin(s), ' + st.nodes + ' nœuds'
        + (st.maxNodesWay ? ', au plus ' + st.maxNodesWay.count + ' nœuds sur un chemin (' + osmLink('way', st.maxNodesWay.id) + ')' : ''),
      'Relations les plus chargées : ' + st.biggest.map(function (r) {
        return osmLink('relation', r.id) + (r.name ? ' ' + esc(r.name) : '') + ' (' + r.members + ' membres)';
      }).join(', ')];
    if (members > 300) rows.push('<span class="erreur">La relation a ' + members + ' membres : au-delà de quelques centaines, une relation devient difficile à éditer et à vérifier. Les bonnes pratiques OSM conseillent de la découper en sous-relations.</span>');
    box.innerHTML = '<details><summary>Statistiques de la relation</summary><div class="stats">' + rows.join('<br>') + '</div></details>';
  }

  function fmtDate(iso) { return iso.slice(0, 10); }

  function elementLabel(c) {
    var text = (c.type === 'relation' ? 'la relation' : 'chemin ' + c.id) + ' (v' + c.version + ')';
    if (c.type !== 'way') return esc(text);
    return '<span class="el" data-sel="way:' + c.id + '">' + esc(text) + '</span>';
  }

  // Une ligne par changeset (plusieurs éléments modifiés dans un même lot ne sont pas répétés).
  function clip(text) { return text.length > 300 ? text.slice(0, 300) + '…' : text; }

  function discussionHtml(list) {
    if (!list || !list.length) return '';
    return '<div class="discussion"><span class="detail">Discussion (' + list.length + ') :</span>' + list.map(function (c) {
      return '<blockquote><strong>' + esc(c.user) + '</strong> <span class="detail">' + fmtDate(c.date) + '</span><br>'
        + esc(clip(c.text.replace(/\s+/g, ' ').trim())) + '</blockquote>';
    }).join('') + '</div>';
  }

  function causesHtml(causes, changesets, discussions) {
    var order = [], by = {};
    causes.forEach(function (c) {
      if (!by[c.changeset]) { by[c.changeset] = []; order.push(c.changeset); }
      by[c.changeset].push(c);
    });
    return '<ul>' + order.map(function (id) {
      var list = by[id], first = list[0], cs = changesets[id], info = '';
      if (cs) {
        info = '<br><span class="detail">« ' + esc(cs.comment || 'sans commentaire') + ' »'
          + (cs.changesCount === undefined ? '' : ' · ' + cs.changesCount.toLocaleString('fr-FR') + ' changement(s) au total')
          + (cs.createdBy ? ' · ' + esc(cs.createdBy) : '') + '</span>';
      }
      return '<li>par <strong>' + esc(first.user) + '</strong>, le ' + fmtDate(first.timestamp) + ', '
        + '<a href="https://www.openstreetmap.org/changeset/' + id + '" target="_blank" rel="noopener">changeset ' + id + '</a>'
        + ' : ' + list.map(elementLabel).join(', ') + info + discussionHtml(discussions[id]) + '</li>';
    }).join('') + '</ul>';
  }

  // ---- Vues : l'état actuel (live) ou une fenêtre sur les modifications d'une période ----
  function useLive() {
    state.snapshot = state.live.snapshot; state.results = state.live.results; state.tree = state.live.tree;
    state.window = null;
  }

  function showView(v) {
    state.snapshot = v.snapshot; state.results = v.results; state.tree = v.tree;
    renderList();
    var shown = v.results.filter(function (r) { return r.relationId === state.shown; })[0] || v.results[0];
    return showMap(shown, true);
  }

  // Ce que la fenêtre affiche : chemins gardés (avec leur type de changement) et lignes de trou ou d'ordre gardées.
  function windowState(wtree) {
    var ways = {}, rows = {}, prio = { created: 4, modified: 3, 'added-to-relation': 2, 'role-changed': 1 };
    wtree.children.forEach(function (c) {
      if (c.kind === 'way' && !c.removed && !c.missing) {
        var best = 'modified', bp = 0;
        (c.events || []).forEach(function (e) { if ((prio[e.action] || 0) > bp) { bp = prio[e.action]; best = e.action; } });
        ways[c.id] = best;
      } else if (c.kind === 'gap') rows['gap:' + c.relationId + ':' + c.gapIndex] = true;
      else if (c.kind === 'order') rows['order:' + c.relationId + ':' + c.orderIndex] = true;
    });
    return { ways: ways, rows: rows };
  }

  // ---- Frise : deux curseurs, début et fin de la période étudiée, sous la recherche ----
  function nowIso() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z'); }
  function isFull(fr) { return fr.from === fr.min && fr.to === fr.max; }

  // Adresse partageable : relation et période analysée (sans effet si le navigateur refuse, par exemple en file://).
  function syncUrl() {
    var id = state.live && state.live.tree && state.live.tree.id;
    if (!id) return;
    var fr = state.frise, a = fr && fr.relId === id && fr.applied;
    var from = a && a.from !== fr.min ? a.from : null, to = a && a.to !== fr.max ? a.to : null;
    try { history.replaceState(null, '', F.buildSearch(id, from, to)); } catch (e) { /* adresse non modifiable */ }
  }

  // Période demandée par l'adresse (?du=&au=), appliquée une seule fois à la frise créée.
  function applyPendingPeriod(fr) {
    var p = state.pendingPeriod;
    state.pendingPeriod = null;
    if (!p || !fr) return;
    if (p.from && p.from + 'T00:00:00Z' > fr.min) fr.from = p.from + 'T00:00:00Z';
    if (p.to) {
      var to = p.to + 'T23:59:59Z';
      if (to < fr.max) { fr.to = to; fr.toIsMax = false; }
    }
    if (fr.from > fr.to) { fr.from = fr.min; fr.to = fr.max; fr.toIsMax = true; }
    buildFrise();
  }

  async function setupFrise(id, prev) {
    var zone = $('frise-zone');
    var rel = state.live.snapshot.elements.filter(function (e) { return e.type === 'relation' && e.id === id; })[0];
    if (!rel || !rel.members.some(function (m) { return m.type === 'way'; })) {
      state.frise = null;
      zone.innerHTML = '<p class="detail">La frise s\'applique à une relation qui contient directement des chemins. '
        + 'Pour une relation parente (par exemple EuroVelo), saisissez le numéro d\'une de ses sous-relations.</p>';
      return null;
    }
    var fr = prev, max = nowIso();
    var wayRefs = {};
    rel.members.forEach(function (m) { if (m.type === 'way') wayRefs[m.ref] = true; });
    if (!fr) {
      zone.innerHTML = '<p class="detail">Chargement de la frise...</p>';
      var hist = await F.fetchRelationHistory(id);
      fr = { relId: id, hist: hist, min: hist[0].timestamp, max: max, from: hist[0].timestamp, to: max, toIsMax: true,
        ctx: null, points: null, allSpans: null, applied: null, loading: false, stop: false, progress: null, failedCount: 0,
        totalWays: 0 };
    } else {
      fr.max = max;
      if (fr.toIsMax) fr.to = max;
    }
    fr.totalWays = Object.keys(wayRefs).length;
    state.frise = fr;
    buildFrise();
    return fr;
  }

  // Bulle au survol de la frise : date, version de la relation proche, rupture en cours à cette date.
  function setupFriseHover(fr) {
    var pistes = $('frise-zone').querySelector('.frise-pistes'), fond = $('frise-fond');
    var bulle = document.createElement('div');
    bulle.className = 'frise-bulle'; bulle.hidden = true;
    pistes.appendChild(bulle);
    pistes.addEventListener('mousemove', function (e) {
      var rc = fond.getBoundingClientRect();
      var f = Math.min(1, Math.max(0, (e.clientX - rc.left) / rc.width));
      var info = F.hoverInfo(f, fr.hist, fr.allSpans, fr.min, fr.max, 6 / rc.width);
      var lines = ['<strong>' + fmtDate(info.date) + '</strong>'];
      if (info.version) {
        var v = info.version;
        lines.push('Relation v' + v.version + ' par ' + esc(v.user) + ', ' + fmtDate(v.timestamp) + ', changeset ' + v.changeset);
      }
      if (info.span) {
        var sp = info.span, who = (sp.start.causes || []).slice(0, 2).map(function (c) {
          return (c.type === 'relation' ? 'la relation' : 'chemin ' + c.id) + ' v' + c.version + ' par ' + esc(c.user);
        }).join(', ');
        lines.push('<span class="rupture">Relation cassée ' + (sp.fromCreation ? 'dès sa création' : 'depuis le ' + fmtDate(sp.start.date))
          + (sp.end ? ' jusqu\'au ' + fmtDate(sp.end.date) : ' (toujours cassée)') + '</span>' + (who ? '<br>Début : ' + who : ''));
      }
      bulle.innerHTML = lines.join('<br>');
      bulle.hidden = false;
      var x = e.clientX - pistes.getBoundingClientRect().left;
      bulle.style.left = Math.max(0, Math.min(x + 12, pistes.clientWidth - bulle.offsetWidth)) + 'px';
    });
    pistes.addEventListener('mouseleave', function () { bulle.hidden = true; });
  }

  function buildFrise() {
    var fr = state.frise;
    $('frise-zone').innerHTML = '<div class="frise-pistes"><div id="frise-fond"></div>'
      + '<input type="range" id="cur-g" min="0" max="1000" aria-label="Début de la période">'
      + '<input type="range" id="cur-d" min="0" max="1000" aria-label="Fin de la période"></div>'
      + '<div class="frise-dates"><span id="date-g"></span><span id="date-d"></span></div>'
      + '<div id="frise-legende" class="detail"></div><div id="frise-aide" class="aide"></div>'
      + '<div id="charge" class="charge"></div>'
      + '<label class="detail mineurs"><input type="checkbox" id="mineurs"' + (state.hideMinor ? ' checked' : '')
      + '> Masquer les modifications sans effet sur la continuité (tags, nœuds ajoutés ou retirés à l\'intérieur d\'un chemin)</label>'
      + '<div id="frise-note" class="detail"></div>';
    $('cur-g').value = Math.round(F.toFraction(fr.from, fr.min, fr.max) * 1000);
    $('cur-d').value = fr.toIsMax ? 1000 : Math.round(F.toFraction(fr.to, fr.min, fr.max) * 1000);
    function onMove(side) {
      var g = $('cur-g'), d = $('cur-d');
      if (side === 'g' && Number(g.value) > Number(d.value)) g.value = d.value;
      if (side === 'd' && Number(d.value) < Number(g.value)) d.value = g.value;
      fr.from = Number(g.value) === 0 ? fr.min : F.fromFraction(Number(g.value) / 1000, fr.min, fr.max);
      fr.toIsMax = Number(d.value) === 1000;
      fr.to = fr.toIsMax ? fr.max : F.fromFraction(Number(d.value) / 1000, fr.min, fr.max);
      paintFrise();
    }
    setupFriseHover(fr);
    $('mineurs').addEventListener('change', function () {
      state.hideMinor = $('mineurs').checked;
      if (fr.applied && fr.ctx && fr.points && !isFull(fr) && state.frise === fr) showWindow(fr);
    });
    $('cur-g').addEventListener('input', function () { onMove('g'); });
    $('cur-d').addEventListener('input', function () { onMove('d'); });
    $('charge').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.act === 'charger') loadAll();
      else if (b.dataset.act === 'pause') fr.stop = true;
    });
    paintFrise();
    paintCharge();
  }

  function paintFrise() {
    var fr = state.frise, html = '';
    if (!fr || !$('frise-fond')) return;
    var pending = fr.ctx ? F.wayIdsToLoad(fr.ctx, fr.max).length : null;
    var uncertain = pending === null ? false : pending > 0;
    if (fr.allSpans) {
      html += F.bandsOf(fr.allSpans, fr.min, fr.max).map(function (b) {
        return '<div class="bande' + (b.open ? ' ouverte' : '') + (uncertain ? ' incertaine' : '') + '" style="left:'
          + (b.left * 100) + '%;width:' + Math.max(b.width * 100, 0.6) + '%"></div>';
      }).join('');
    }
    html += F.tickFractions(fr.hist.map(function (v) { return v.timestamp; }), fr.min, fr.max).map(function (x) {
      return '<div class="repere" style="left:' + (x * 100) + '%"></div>';
    }).join('');
    // voile sur ce qui est hors de la période choisie, mis à jour en direct avec les curseurs
    var left = F.toFraction(fr.from, fr.min, fr.max) * 100, right = F.toFraction(fr.to, fr.min, fr.max) * 100;
    html += '<div class="hors" style="left:0;width:' + left + '%"></div><div class="hors" style="left:' + right + '%;right:0"></div>';
    $('frise-fond').innerHTML = html;
    $('date-g').textContent = 'du ' + fmtDate(fr.from);
    $('date-d').textContent = 'au ' + (fr.toIsMax ? 'aujourd\'hui' : fmtDate(fr.to));
    var vers = fr.hist.length === 1
      ? 'La relation elle-même n\'a qu\'une version (un seul trait) : ses modifications se trouvent surtout dans l\'historique de ses chemins.'
      : 'Traits : les ' + fr.hist.length + ' versions de la relation.';
    $('frise-legende').textContent = vers
      + (fr.allSpans ? ' Rouge : périodes où la relation est cassée (toute son histoire, ne dépend pas des curseurs). Zone grisée : hors de la période choisie.'
        : ' Les périodes où la relation est cassée (en rouge) apparaîtront après la lecture de l\'historique : choisissez une période puis « Analyser ».')
      + (uncertain ? ' Rayé : période approximative, il reste ' + pending + ' chemin(s) dont l\'historique n\'est pas lu.' : '');
    var changed = !fr.applied || fr.applied.from !== fr.from || fr.applied.to !== fr.to;
    $('frise-aide').textContent = changed ? 'Période modifiée : cliquez sur « Analyser » pour l\'appliquer.' : '';
  }

  // Historique de la relation et des chemins aux bords des trous (rapide). Le reste se charge à la demande.
  async function ensureCtx(fr) {
    if (fr.ctx) return;
    var liveRes = state.live.results.filter(function (r) { return r.relationId === fr.relId; })[0];
    var border = F.borderWayRefs(state.live.snapshot, fr.relId, liveRes);
    fr.ctx = await F.fetchHistoryContext(fr.relId, state.live.snapshot, border, undefined, 60);
    fr.points = null;
  }

  // Timeline calculée par tranches (la page reste utilisable), une seule fois par état de l'historique chargé.
  async function ensurePoints(fr, out) {
    if (fr.points) return;
    var points = await F.timelineAsync(fr.ctx, fr.relId, { chunk: 100, onProgress: function (done, total) {
      if (state.frise === fr) out.innerHTML = '<p>Calcul des périodes de rupture : ' + done + ' / ' + total + ' dates...</p>';
    } });
    if (state.frise !== fr) return;
    fr.points = points;
    fr.allSpans = F.spansOf(points);
    paintFrise();
  }

  function paintCharge() {
    var fr = state.frise, box = $('charge');
    if (!fr || !box) return;
    $('go').disabled = !!fr.loading;
    if (fr.loading) {
      var p = fr.progress || { done: 0, total: 0, failed: [] };
      box.innerHTML = '<progress max="' + (p.total || 1) + '" value="' + p.done + '"></progress> Lecture de l\'historique des chemins : '
        + p.done + ' / ' + (p.total || '...') + (p.failed.length ? ' (' + p.failed.length + ' en échec)' : '')
        + ' <button class="voir" data-act="pause">Pause</button>';
      return;
    }
    var pending = fr.ctx ? F.wayIdsToLoad(fr.ctx, fr.max).length : null;
    if (fr.ctx && pending === 0) {
      box.innerHTML = '<span class="detail">Historique complet lu.' + (fr.failedCount ? ' ' + fr.failedCount + ' chemin(s) en échec.' : '') + '</span>';
      return;
    }
    var est = F.estimateLoad(pending, fr.totalWays);
    box.innerHTML = '<button class="voir" data-act="charger">' + (fr.progress ? 'Reprendre' : 'Charger tout l\'historique')
      + '</button> <span class="detail">' + (est.approx ? 'environ ' : '') + est.n + ' chemin(s) à lire, environ ' + est.secs
      + ' s, par pages de 80 (8 appels en parallèle). Se lance tout seul quand vous choisissez une période.</span>';
  }

  // Lit l'historique des chemins qui restent, page par page. S'arrête à la pause, reprend où il en était.
  async function loadHistory(fr) {
    if (fr.loading) return;
    fr.loading = true; fr.stop = false; fr.progress = { done: 0, total: 0, failed: [] };
    paintCharge();
    try {
      await ensureCtx(fr);
      var ids = F.wayIdsToLoad(fr.ctx, fr.to);
      var res = await F.fetchWayHistories(ids, fr.ctx, undefined, {
        onPage: function (p) { if (state.frise === fr) { fr.progress = p; paintCharge(); } },
        shouldStop: function () { return fr.stop || state.frise !== fr; },
      });
      fr.failedCount += res.failed.length;
      if (res.done) fr.points = null;
    } catch (e) {
      if (state.frise === fr) $('charge').innerHTML = '<span class="erreur">Échec du chargement : ' + esc(e.message) + '</span>';
    }
    fr.loading = false;
    if (state.frise === fr) paintCharge();
  }

  async function loadAll() {
    var fr = state.frise;
    if (!fr || fr.loading) return;
    await loadHistory(fr);
    if (state.frise === fr) await applyPeriod();
  }

  // Applique la période choisie : période complète = vue actuelle ; sinon fenêtre sur les modifications
  // (créées, modifiées, ajoutées, retirées, supprimées entre les deux dates), état complet à la date de fin.
  async function applyPeriod() {
    var fr = state.frise;
    if (!fr) return;
    fr.applied = { from: fr.from, to: fr.to };
    syncUrl();
    paintFrise();
    $('enquete').innerHTML = '<div id="enquete-res"></div>';
    var out = $('enquete-res');
    if (isFull(fr) && !fr.ctx) {
      useLive(); renderList();
      out.innerHTML = '<p class="detail">Période complète : vue actuelle. Choisissez une période avec les curseurs puis cliquez sur « Analyser » '
        + 'pour voir ce qui a été modifié, ajouté ou supprimé.</p>';
      return;
    }
    try {
      await ensureCtx(fr);
      if (!isFull(fr)) await loadHistory(fr);
      if (state.frise !== fr) return;
      await ensurePoints(fr, out);
      if (state.frise !== fr) return;
      paintCharge();
      var spans = F.clipSpans(F.spansOf(fr.points.filter(function (p) { return p.date <= fr.to; })), fr.from);
      await renderSpans(out, spans, fr);
      if (isFull(fr)) {
        $('frise-note').textContent = '';
        if (state.snapshot !== state.live.snapshot) { useLive(); renderList(); await showMap(state.live.results[0], true); }
        return;
      }
      await showWindow(fr);
    } catch (e) {
      out.innerHTML = '<p class="erreur">Échec de l\'analyse de la période : ' + esc(e.message) + '</p>';
    }
  }

  async function showWindow(fr) {
    var events = F.windowChanges(fr.ctx, fr.relId, fr.from, fr.to), snap, results, tree, minor = 0;
    if (state.hideMinor && fr.points) {
      var kept = F.filterMinor(events, F.impactDates(fr.points));
      minor = events.length - kept.length;
      events = kept;
    }
    if (fr.toIsMax) { snap = state.live.snapshot; results = state.live.results; tree = state.live.tree; }
    else {
      snap = F.stateAt(fr.to, fr.ctx, fr.relId);
      if (!snap) { $('frise-note').textContent = 'La relation n\'existait pas encore à cette date.'; return; }
      results = F.analyzeTree(snap, fr.relId); tree = F.buildTree(snap, fr.relId);
    }
    var wtree = F.windowTree(tree, events);
    state.window = windowState(wtree);
    state.shown = fr.relId;
    await showView({ snapshot: snap, results: results, tree: wtree });
    var r = results.filter(function (x) { return x.relationId === fr.relId; })[0];
    var shownCount = wtree.children.filter(function (c) { return c.kind !== 'gap' && c.kind !== 'order'; }).length;
    $('resume').textContent = 'Période du ' + fmtDate(fr.from) + ' au ' + (fr.toIsMax ? 'aujourd\'hui' : fmtDate(fr.to)) + ' : '
      + shownCount + ' élément(s) touché(s) affiché(s), ' + wtree.hiddenCount + ' masqué(s) (non modifiés dans la période'
      + (minor ? ' ou seulement ' + minor + ' modification(s) sans effet sur la continuité' : '') + '). '
      + 'État à la date de fin, relation complète : ' + (r ? r.gaps.length + ' trou(s), ' + r.pieces.length + ' morceau(x)' : 'inconnu') + '.';
    var pending = F.wayIdsToLoad(fr.ctx, fr.max).length;
    $('frise-note').className = pending ? 'erreur' : 'detail';
    $('frise-note').textContent = pending
      ? 'ATTENTION : il reste ' + pending + ' chemin(s) dont l\'historique n\'est pas lu, les changements de la période peuvent être incomplets.'
      : 'Les changements affichés sont ceux de la période. Positions des nœuds et sous-relations non reconstituées.';
  }

  async function renderSpans(out, spans, fr) {
    var changesets = {}, discussions = {};
    try { changesets = await F.fetchChangesets(F.changesetIds(spans)); } catch (e) { changesets = {}; }
    try { discussions = await F.fetchDiscussions(changesets); } catch (e) { discussions = {}; }
    if (state.frise !== fr) return;
    var atDate = !fr.toIsMax;
    var html = '<p class="detail">Périodes de rupture, du ' + fmtDate(fr.from) + ' au ' + (atDate ? fmtDate(fr.to) : 'aujourd\'hui') + '.</p>';
    if (!spans.length) {
      html += '<p>Aucune période de rupture sur cette période dans l\'historique chargé.</p>';
    }
    var parts = F.splitSpans(spans, 86400000);
    function spanHtml(sp) {
      return '<div class="periode"><p><strong>' + (sp.end ? 'Rupture réparée' : (atDate ? 'Rupture non réparée à cette date' : 'Rupture en cours'))
        + '</strong> : depuis le ' + fmtDate(sp.start.date) + (sp.fromCreation ? ' (dès la création de la relation)' : '')
        + (sp.startsBeforeWindow ? ' (commencée avant la période étudiée)' : '')
        + (sp.end ? ', jusqu\'au ' + fmtDate(sp.end.date) : '') + '.</p>'
        + '<p>Modification(s) à ce moment : </p>' + causesHtml(sp.start.causes, changesets, discussions)
        + (sp.end ? '<p>Réparation : </p>' + causesHtml(sp.end.causes, changesets, discussions) : '')
        + '</div>';
    }
    parts.long.forEach(function (sp) { html += spanHtml(sp); });
    if (parts.brief.length) {
      html += '<details class="breves"><summary>' + parts.brief.length + ' rupture(s) brève(s), de moins d\'un jour (le plus souvent '
        + 'une édition faite en plusieurs envois)</summary>' + parts.brief.map(spanHtml).join('') + '</details>';
    }
    var pending = F.wayIdsToLoad(fr.ctx, fr.max).length;
    html += '<p class="limite">Ce sont des pistes, pas des preuves : une modification au moment de la rupture '
      + 'n\'est pas forcément une faute (la personne a pu réparer ou raccrocher un autre chemin). '
      + (pending
        ? 'Il reste ' + pending + ' chemin(s) dont l\'historique n\'est pas lu : ils sont pris dans leur état actuel, ce qui peut '
          + 'inventer ou cacher des ruptures, surtout les plus anciennes. Utilisez « Charger tout l\'historique ».'
        : 'L\'historique de tous les chemins a été lu' + (fr.failedCount ? ' (sauf ' + fr.failedCount + ' en échec)' : '')
          + ' ; les positions des nœuds et les sous-relations ne sont pas reconstituées.') + '</p>';
    out.innerHTML = html;
    highlightEnquete(state.selected);
  }

  // Identifiants de la relation et de toutes ses sous-relations.
  function subtreeIds(id) {
    var out = {};
    (function walk(n) {
      if (n.id === id && !out[id]) { mark(n); return true; }
      return n.children.some(walk);
    })(state.tree);
    function mark(n) { if (n.kind === 'relation') { out[n.id] = true; n.children.forEach(mark); } }
    return out;
  }

  // Nœuds membres chargés de la relation affichée et de ses sous-relations.
  function memberNodeRows(relId) {
    var inside = subtreeIds(relId), seen = {}, out = [];
    state.snapshot.elements.forEach(function (e) {
      if (e.type !== 'relation' || !inside[e.id]) return;
      e.members.forEach(function (mb) {
        if (mb.type !== 'node' || seen[mb.ref]) return;
        seen[mb.ref] = true;
        var n = state.snapshot.elements.filter(function (x) { return x.type === 'node' && x.id === mb.ref; })[0];
        if (n) out.push(n);
      });
    });
    return out;
  }

  function renderMap(result) {
    var nodes = state.nodes, ways = {};
    state.snapshot.elements.forEach(function (e) { if (e.type === 'way') ways[e.id] = e; });
    var lines = [], pts = [];
    var pieces = {};
    if (!state.window) {
      var inRel = subtreeIds(result.relationId);
      pieces = F.pieceByWay(state.snapshot, state.results.filter(function (r) { return inRel[r.relationId]; }));
    }
    visibleWayRefs(result.relationId).forEach(function (ref) {
      if (!ways[ref]) return;
      var p = ways[ref].nodes.map(function (n) { return nodes[n]; }).filter(function (n) { return n && typeof n.lat === 'number'; });
      if (p.length) { lines.push({ id: ref, pts: p, action: state.window ? state.window.ways[ref] : '' }); pts = pts.concat(p); }
    });
    if (!pts.length) { $('carte').innerHTML = '<p>Aucune géométrie à afficher.</p>'; return; }
    var minLat = Math.min.apply(null, pts.map(function (p) { return p.lat; }));
    var maxLat = Math.max.apply(null, pts.map(function (p) { return p.lat; }));
    var minLon = Math.min.apply(null, pts.map(function (p) { return p.lon; }));
    var maxLon = Math.max.apply(null, pts.map(function (p) { return p.lon; }));
    // Projection Web Mercator (x = longitude, y = ordonnée Mercator) : le tracé s'aligne sur les tuiles OSM.
    var minV = F.mercV(minLat), maxV = F.mercV(maxLat);
    var box = $('carte'), pad = 14;
    var W = Math.max(box.clientWidth, 300), H = Math.max(box.clientHeight, 300);
    var spanX = Math.max(maxLon - minLon, 1e-9), spanY = Math.max(maxV - minV, 1e-9);
    var scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
    var offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
    state.proj = { minU: minLon, maxV: maxV, scale: scale, offX: offX, offY: offY };
    function X(p) { return ((p.lon - minLon) * scale + offX).toFixed(1); }
    function Y(p) { return ((maxV - F.mercV(p.lat)) * scale + offY).toFixed(1); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tracé de la relation"><g id="tuiles"></g>';
    // Chaque chemin est dessiné deux fois : un trait épais invisible pour le clic, un trait fin visible.
    lines.forEach(function (l) {
      var pts2 = l.pts.map(function (q) { return X(q) + ',' + Y(q); }).join(' ');
      svg += '<polyline class="touche" fill="none" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" '
        + 'data-sel="way:' + l.id + '" points="' + pts2 + '"/>'
        + '<polyline class="voie ' + (l.action || '') + (pieces[l.id] !== undefined ? ' p' + (pieces[l.id] % 6) : '') + '" fill="none" stroke="var(--trace)" stroke-width="2" vector-effect="non-scaling-stroke" '
        + 'data-way="' + l.id + '" points="' + pts2 + '"/>';
    });
    // Trait pointillé entre les deux bouts libres les plus proches du trou
    function gapLine(g, i, relId) {
      var best = null;
      g.fromEnds.forEach(function (a) {
        g.toEnds.forEach(function (b) {
          if (!nodes[a] || !nodes[b]) return;
          var d = Math.pow(X(nodes[a]) - X(nodes[b]), 2) + Math.pow(Y(nodes[a]) - Y(nodes[b]), 2);
          if (!best || d < best.d) best = { d: d, a: nodes[a], b: nodes[b] };
        });
      });
      return best ? '<line class="trait-trou" data-sel="gap:' + relId + ':' + i + '" x1="' + X(best.a) + '" y1="' + Y(best.a)
        + '" x2="' + X(best.b) + '" y2="' + Y(best.b) + '" stroke="var(--alerte)" stroke-width="2" stroke-dasharray="6 4" '
        + 'vector-effect="non-scaling-stroke" pointer-events="none"/>' : '';
    }
    function dots(list, color, kind, relId) {
      list.forEach(function (g, i) {
        if (state.window && kind !== 'open' && !state.window.rows[kind + ':' + relId + ':' + i]) return;
        if (kind === 'gap') svg += gapLine(g, i, relId);
        g.fromEnds.concat(g.toEnds).forEach(function (id) {
          var n = nodes[id];
          if (n) svg += '<circle class="pastille-carte" data-sel="' + kind + ':' + relId + ':' + i + '" cx="' + X(n)
            + '" cy="' + Y(n) + '" r="5" fill="' + color + '"/>';
        });
      });
    }
    var nodeRows = state.window ? [] : memberNodeRows(result.relationId);
    nodeRows.forEach(function (n) {
      svg += '<rect class="noeud-membre" data-sel="node:' + n.id + '" data-cx="' + X(n) + '" data-cy="' + Y(n) + '"/>';
    });
    var inside = subtreeIds(result.relationId);
    state.results.filter(function (r) { return inside[r.relationId]; }).forEach(function (r) {
      dots(r.orderIssues, 'var(--avert)', 'order', r.relationId);
      dots(r.gaps, 'var(--alerte)', 'gap', r.relationId);
      dots([{ fromEnds: r.openEnds, toEnds: [] }], 'var(--alerte)', 'open', r.relationId);
    });
    box.innerHTML = svg + '</svg>'
      + '<div class="zoom"><button data-z="in" aria-label="Zoom avant">+</button>'
      + '<button data-z="out" aria-label="Zoom arrière">&minus;</button>'
      + '<button data-z="reset" aria-label="Vue complète">&#8962;</button>'
      + (nodeRows.length ? '<button data-z="noeuds" aria-label="Nœuds membres" title="Nœuds membres (arrêts, bornes...)" class="noeuds' + (state.nodesOff ? '' : ' actif') + '">&#9670;</button>' : '')
      + '<button data-z="fond" aria-label="Fond de carte OpenStreetMap" title="Fond de carte OpenStreetMap" class="fond' + (state.fondOn ? ' actif' : '') + '">&#9638;</button></div>'
      + '<div class="attrib" ' + (state.fondOn ? '' : 'hidden') + '>&copy; contributeurs <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></div>';
    if (nodeRows.length && state.nodesOff) box.querySelector('svg').classList.add('cache-noeuds');
    state.map = setupZoom(box, { x: 0, y: 0, w: W, h: H });
    renderStats(result.relationId);
    if (state.selected) highlightMap(state.selected);
  }

  // Zoom à la molette ou aux boutons, déplacement en glissant. Le dessin garde des traits et
  // des pastilles de taille constante à l'écran.
  // Fond de carte : tuiles OpenStreetMap du zoom adapté à la vue, ajoutées et retirées au fil du déplacement.
  function drawTiles(svg, view, box) {
    var g = svg.querySelector('#tuiles'), p = state.proj;
    if (!g || !p) return;
    var u0 = (view.x - p.offX) / p.scale + p.minU, u1 = (view.x + view.w - p.offX) / p.scale + p.minU;
    var v1 = p.maxV - (view.y - p.offY) / p.scale, v0 = p.maxV - (view.y + view.h - p.offY) / p.scale;
    var z = F.chooseZoom(view.w / box.clientWidth / p.scale);
    var tiles = F.tilesFor(u0, u1, v0, v1, z, 40), want = {};
    tiles.forEach(function (t) { want[t.z + '/' + t.x + '/' + t.y] = t; });
    Array.prototype.forEach.call(g.querySelectorAll('image'), function (im) {
      if (want[im.getAttribute('data-t')]) delete want[im.getAttribute('data-t')];
      else g.removeChild(im);
    });
    Object.keys(want).forEach(function (key) {
      var t = want[key], im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      im.setAttribute('data-t', key);
      im.setAttribute('href', 'https://tile.openstreetmap.org/' + key + '.png');
      im.setAttribute('x', (t.u0 - p.minU) * p.scale + p.offX - 0.3);
      im.setAttribute('y', (p.maxV - t.v0) * p.scale + p.offY - 0.3);
      im.setAttribute('width', (t.u1 - t.u0) * p.scale + 0.6);
      im.setAttribute('height', (t.v0 - t.v1) * p.scale + 0.6);
      im.setAttribute('preserveAspectRatio', 'none');
      g.appendChild(im);
    });
  }

  // Distance d'un point à un segment (mêmes unités que les coordonnées du dessin).
  function segDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    var t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    var cx = a.x + t * dx, cy = a.y + t * dy;
    return Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
  }

  function setupZoom(box, full) {
    var svg = box.querySelector('svg'), view = full, drag = null, moved = 0;
    function apply() {
      svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
      var r = 6 * view.w / box.clientWidth;
      Array.prototype.forEach.call(svg.querySelectorAll('circle'), function (c) {
        c.setAttribute('r', r);
      });
      var half = 5 * view.w / box.clientWidth;
      Array.prototype.forEach.call(svg.querySelectorAll('rect.noeud-membre'), function (q) {
        q.setAttribute('x', Number(q.getAttribute('data-cx')) - half); q.setAttribute('y', Number(q.getAttribute('data-cy')) - half);
        q.setAttribute('width', 2 * half); q.setAttribute('height', 2 * half);
      });
      if (state.fondOn) drawTiles(svg, view, box);
    }
    function toDrawing(clientX, clientY) {
      var rc = svg.getBoundingClientRect();
      return { x: view.x + (clientX - rc.left) / rc.width * view.w, y: view.y + (clientY - rc.top) / rc.height * view.h };
    }
    function zoom(factor, cx, cy) {
      var pt = cx === undefined ? { x: view.x + view.w / 2, y: view.y + view.h / 2 } : toDrawing(cx, cy);
      view = F.zoomAt(view, full, factor, pt.x, pt.y);
      apply();
    }
    svg.addEventListener('wheel', function (e) {
      e.preventDefault();
      zoom(Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
    }, { passive: false });
    svg.addEventListener('dblclick', function (e) { zoom(2, e.clientX, e.clientY); });
    svg.addEventListener('pointerdown', function (e) {
      drag = { x: e.clientX, y: e.clientY };
      moved = 0;
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('glisse');
    });
    svg.addEventListener('pointermove', function (e) {
      if (!drag) return;
      moved += Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y);
      var rc = svg.getBoundingClientRect();
      view = F.panBy(view, full, -(e.clientX - drag.x) / rc.width * view.w, -(e.clientY - drag.y) / rc.height * view.h);
      drag = { x: e.clientX, y: e.clientY };
      apply();
    });
    function stop() { drag = null; svg.classList.remove('glisse'); }
    // Un appui sans déplacement est un clic : sélection de l'élément sous le doigt (ou aucun).
    svg.addEventListener('pointerup', function (e) {
      var wasClick = drag && moved < 4;
      stop();
      if (!wasClick) return;
      var hit = pickAt(e.clientX, e.clientY);
      select(hit ? hit.getAttribute('data-sel') : null, { fromMap: true });
    });
    // Sous le doigt : une pastille d'abord, sinon, parmi les chemins qui se recouvrent, le plus proche du point.
    function pickAt(clientX, clientY) {
      var under = document.elementsFromPoint(clientX, clientY).filter(function (el) { return el.closest && el.closest('[data-sel]'); });
      var dot = under.filter(function (el) { return el.tagName === 'circle' || el.tagName === 'rect'; })[0];
      if (dot) return dot;
      var lines = under.filter(function (el) { return el.tagName === 'polyline'; });
      if (lines.length < 2) return under[0] ? under[0].closest('[data-sel]') : null;
      var pt = toDrawing(clientX, clientY), best = null, bestD = Infinity;
      lines.forEach(function (el) {
        var q = el.getAttribute('points').split(' ').map(function (s2) { var c = s2.split(','); return { x: Number(c[0]), y: Number(c[1]) }; });
        for (var i = 1; i < q.length; i++) {
          var d = segDist(pt, q[i - 1], q[i]);
          if (d < bestD) { bestD = d; best = el; }
        }
      });
      return best;
    }
    svg.addEventListener('pointercancel', stop);
    box.querySelector('.zoom').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.z === 'noeuds') {
        state.nodesOff = !state.nodesOff;
        b.classList.toggle('actif', !state.nodesOff);
        svg.classList.toggle('cache-noeuds', !!state.nodesOff);
      }
      else if (b.dataset.z === 'fond') {
        state.fondOn = !state.fondOn;
        b.classList.toggle('actif', state.fondOn);
        box.querySelector('.attrib').hidden = !state.fondOn;
        if (state.fondOn) drawTiles(svg, view, box); else $('tuiles').innerHTML = '';
      }
      else if (b.dataset.z === 'reset') { view = full; apply(); }
      else zoom(b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
    });
    apply();
    return {
      refresh: apply,
      // Centre la vue sur un point du dessin, avec un zoom suffisant pour le voir.
      // Cadre une boîte du dessin avec de la marge (un chemin minuscule reste visible, un grand tient en entier).
      fit: function (x0, y0, x1, y1) {
        var ratio = full.w / full.h, minW = full.w / 60;
        var w = Math.min(full.w, Math.max((x1 - x0) * 1.6, (y1 - y0) * 1.6 * ratio, minW)), h = w / ratio;
        view = F.panBy({ x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w: w, h: h }, full, 0, 0);
        apply();
      },
      focus: function (cx, cy) {
        var w = full.w / 6, h = full.h / 6;
        view = F.panBy({ x: cx - w / 2, y: cy - h / 2, w: w, h: h }, full, 0, 0);
        apply();
      },
    };
  }

  // Sélection d'un chemin, d'un trou ou d'un problème d'ordre : surbrillance sur la carte ET dans l'arbre.
  function parseSel(sel) {
    var p = sel.split(':');
    return { kind: p[0], id: Number(p[1]), index: p[2] === undefined ? null : Number(p[2]) };
  }

  function targetNode(sel) {
    var q = parseSel(sel);
    return F.findPath(state.tree, function (n) {
      if (q.kind === 'way') return n.kind === 'way' && n.id === q.id && !n.missing;
      if (q.kind === 'node') return n.kind === 'node' && n.id === q.id && n.loaded;
      return n.kind === q.kind && n.relationId === q.id && (n.gapIndex === q.index || n.orderIndex === q.index);
    });
  }

  // Chemins concernés par une sélection : le chemin lui-même, ou les deux chemins de part et d'autre d'un trou.
  function selectedWays(sel) {
    var ways = {}, path = sel && targetNode(sel);
    if (path) {
      var t = path[path.length - 1];
      if (t.kind === 'way') ways[t.id] = true;
      else if (t.kind !== 'node') { ways[t.fromRef] = true; ways[t.toRef] = true; }
    }
    return ways;
  }

  // Dans le résultat de l'enquête : surligne les modifications qui portent sur les chemins sélectionnés.
  function highlightEnquete(sel) {
    var box = $('enquete');
    Array.prototype.forEach.call(box.querySelectorAll('.selection'), function (el) { el.classList.remove('selection'); });
    var ways = selectedWays(sel), first = null;
    Array.prototype.forEach.call(box.querySelectorAll('.el'), function (el) {
      if (!ways[parseSel(el.getAttribute('data-sel')).id]) return;
      el.classList.add('selection');
      el.closest('li').classList.add('selection');
      first = first || el;
    });
    if (first) first.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function highlightMap(sel) {
    var svg = $('carte').querySelector('svg');
    if (!svg) return;
    var ways = selectedWays(sel);
    Array.prototype.forEach.call(svg.querySelectorAll('.voie'), function (el) {
      el.classList.toggle('sel', !!ways[el.getAttribute('data-way')]);
    });
    Array.prototype.forEach.call(svg.querySelectorAll('.trait-trou'), function (el) {
      el.classList.toggle('sel', el.getAttribute('data-sel') === sel);
    });
    Array.prototype.forEach.call(svg.querySelectorAll('circle, rect.noeud-membre'), function (el) {
      var on = el.getAttribute('data-sel') === sel;
      el.classList.toggle('sel', on);
      if (on) svg.appendChild(el); // au premier plan, sinon les pastilles voisines le cachent
    });
    if (state.map) state.map.refresh();
  }

  // Ouvre dans l'arbre les relations qui mènent à l'élément, le surligne et le fait défiler à l'écran.
  function revealInTree(sel) {
    Array.prototype.forEach.call($('liste').querySelectorAll('.selection'), function (el) { el.classList.remove('selection'); });
    var path = sel && targetNode(sel);
    if (!path) return;
    for (var i = 0; i < path.length - 1; i++) {
      var d = $('liste').querySelector('details[data-key="' + state.index.indexOf(path[i]) + '"]');
      if (!d) break;
      d.open = true;
      fillChildren(d);
    }
    var rows = $('liste').querySelectorAll('[data-sel="' + sel + '"]');
    Array.prototype.forEach.call(rows, function (el) {
      el.classList.add('selection');
      for (var g = el.closest('details.plie'); g; g = g.parentElement && g.parentElement.closest('details.plie')) g.open = true;
    });
    if (rows.length) rows[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function select(sel, opts) {
    state.selected = sel;
    highlightMap(sel);
    highlightEnquete(sel);
    if (opts && opts.fromMap) revealInTree(sel);
    else {
      Array.prototype.forEach.call($('liste').querySelectorAll('.selection'), function (el) { el.classList.remove('selection'); });
      if (sel) Array.prototype.forEach.call($('liste').querySelectorAll('[data-sel="' + sel + '"]'), function (el) { el.classList.add('selection'); });
      var c = sel && $('carte').querySelector('circle[data-sel="' + sel + '"]');
      if (c && state.map) state.map.focus(Number(c.getAttribute('cx')), Number(c.getAttribute('cy')));
      var sq = sel && $('carte').querySelector('rect[data-sel="' + sel + '"]');
      if (sq && state.map) state.map.focus(Number(sq.getAttribute('data-cx')), Number(sq.getAttribute('data-cy')));
      var line = sel && sel.indexOf('way:') === 0 && $('carte').querySelector('polyline.voie[data-way="' + sel.slice(4) + '"]');
      if (line && state.map) {
        var xs = [], ys = [];
        line.getAttribute('points').split(' ').forEach(function (pt) { var c2 = pt.split(','); xs.push(Number(c2[0])); ys.push(Number(c2[1])); });
        state.map.fit(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys));
      }
    }
  }

  function parentsHtml(list) {
    return list.map(function (r) {
      var name = F.relationLabel(r.tags) || (r.tags.type || 'relation');
      return '<button class="voir" data-rel="' + r.id + '">' + esc(name) + ' #' + r.id + '</button>';
    }).join(' ');
  }

  // Un chemin comme point de départ : on cherche les relations qui le contiennent. Une seule : on l'analyse et on
  // sélectionne le chemin. Plusieurs : on propose la liste. Aucune : on le dit.
  async function runWay(wayId) {
    setStatus('Recherche des relations qui contiennent le chemin ' + wayId + '...');
    $('parents').innerHTML = ''; $('trous').innerHTML = ''; $('resume').textContent = '';
    try {
      var way = await F.fetchWay(wayId);
      if (!way) { setStatus('Chemin ' + wayId + ' introuvable (supprimé ou numéro erroné).', true); return; }
      var list = await F.fetchParents('way', wayId);
      var closed = way.nodes.length > 2 && way.nodes[0] === way.nodes[way.nodes.length - 1];
      if (list.length === 1) {
        state.pendingSelect = 'way:' + wayId;
        $('relation').value = String(list[0].id);
        return run();
      }
      setStatus('');
      var desc = 'Chemin ' + osmLink('way', wayId) + (way.tags && way.tags.name ? ' ' + esc(way.tags.name) : '') + ' : '
        + way.nodes.length + ' nœuds, ' + (closed ? 'fermé' : 'ouvert') + '. ';
      $('liste').innerHTML = ''; $('carte').innerHTML = ''; $('enquete').innerHTML = ''; $('frise-zone').innerHTML = '';
      $('resume').innerHTML = desc + (list.length
        ? 'Il fait partie de ' + list.length + ' relations : choisissez celle à analyser.'
        : 'Il ne fait partie d\'aucune relation, Filum n\'a donc rien à analyser (l\'analyse du contenu d\'un parc seul n\'existe pas encore).');
      $('parents').innerHTML = parentsHtml(list);
    } catch (e) {
      setStatus('Échec : ' + e.message, true);
    }
  }

  async function run() {
    var input = F.parseRelationInput($('relation').value);
    if (input.error) { setStatus(input.error, true); return; }
    if (input.way) return runWay(input.way);
    var id = input.id;
    $('parents').innerHTML = ''; $('trous').innerHTML = '';
    var prev = state.frise && state.frise.relId === id ? state.frise : null;
    if (prev && prev.loading) return;
    var token = ++state.friseToken;
    if (!prev) { state.frise = null; $('frise-zone').innerHTML = ''; }
    $('go').disabled = true;
    $('liste').innerHTML = ''; $('carte').innerHTML = ''; $('resume').textContent = ''; $('enquete').innerHTML = '';
    setStatus('Chargement de la relation ' + id + '...');
    try {
      state.nodes = {}; state.loaded = {}; state.selected = null; state.window = null;
      state.snapshot = await F.fetchTree(id);
      try { state.snapshot.elements = state.snapshot.elements.concat(await F.fetchMemberNodes(state.snapshot)); }
      catch (e) { /* les nœuds membres sont facultatifs */ }
      state.results = F.analyzeTree(state.snapshot, id);
      state.tree = F.buildTree(state.snapshot, id);
      state.live = { snapshot: state.snapshot, results: state.results, tree: state.tree };
      if (!state.results.length) throw new Error('Relation ' + id + ' introuvable.');
      setStatus('');
      renderList();
      syncUrl();
      F.fetchParents('relation', id).then(function (list) {
        if (list.length && state.live && state.live.tree.id === id) {
          $('parents').innerHTML = 'Fait partie de : ' + parentsHtml(list);
        }
      }).catch(function () { /* information facultative */ });
      await showMap(state.results[0]);
      if (token !== state.friseToken) return;
      var fr = await setupFrise(id, prev);
      if (token !== state.friseToken) return;
      if (fr) { applyPendingPeriod(fr); await applyPeriod(); }
      else state.pendingPeriod = null;
      if (state.pendingSelect) { var sel = state.pendingSelect; state.pendingSelect = null; select(sel, { fromMap: true }); }
    } catch (e) {
      setStatus('Échec : ' + e.message, true);
    } finally {
      $('go').disabled = !!(state.frise && state.frise.loading);
    }
  }

  $('go').addEventListener('click', run);
  $('trous').addEventListener('click', function (e) {
    var seule = e.target.closest('button[data-seule]');
    if (seule) { $('relation').value = seule.dataset.seule; run(); return; }
    var b = e.target.closest('button[data-trou]');
    if (!b) return;
    var r = state.results.filter(function (x) { return x.relationId === Number(b.dataset.trou); })[0];
    var sel = r && (r.gaps.length ? 'gap:' + r.relationId + ':0' : r.openEnds.length ? 'open:' + r.relationId + ':0' : null);
    if (!sel) return;
    select(sel, { fromMap: false });
    if (r.gaps.length) revealInTree(sel);
  });
  $('parents').addEventListener('click', function (e) {
    var b = e.target.closest('button[data-rel]');
    if (!b) return;
    $('relation').value = b.dataset.rel;
    run();
  });
  (function startFromUrl() {
    var q = F.readSearch(location.search);
    if (!q) return;
    $('relation').value = String(q.id);
    state.pendingPeriod = q.from || q.to ? { from: q.from, to: q.to } : null;
    run();
  })();
  $('relation').addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  // Pistes de réparation d'un trou : chemins hors relation qui touchent les bouts libres (une indication, pas une preuve).
  async function chercherPistes(b) {
    var row = b.closest('.feuille'), out = row.querySelector('.pistes');
    var from = b.dataset.from.split(',').map(Number), to = b.dataset.to.split(',').map(Number);
    out.innerHTML = '<span class="detail">Recherche...</span>';
    try {
      var nodeWays = await F.fetchNodeWays(from.concat(to));
      var members = {};
      state.snapshot.elements.forEach(function (x) { if (x.type === 'way') members[x.id] = true; });
      var cands = F.repairCandidates({ fromEnds: from, toEnds: to }, nodeWays, members);
      if (!cands.length) {
        out.innerHTML = '<span class="detail">Aucun chemin hors de la relation ne touche ces bouts libres : ce n\'est pas un simple oubli d\'ajout. '
          + 'Les bouts ne sont raccordés à rien d\'autre, ou le tronçon manque dans OpenStreetMap.</span>';
        return;
      }
      out.innerHTML = '<span class="detail">Pistes (une indication, pas une preuve) : chemins hors de la relation qui touchent un bout libre.</span><ul>'
        + cands.slice(0, 6).map(function (c) {
          var what = [c.tags.name, c.tags.highway].filter(Boolean).map(esc).join(', ');
          return '<li>' + osmLink('way', c.id) + (what ? ' ' + what : '') + ' : '
            + (c.bridges ? '<strong>touche les deux côtés du trou, serait le chemin manquant</strong>' : 'touche le nœud ' + c.touches.map(function (n) { return osmLink('node', n); }).join(', '))
            + (c.changeset ? ' <span class="detail">(v' + c.version + ', ' + fmtDate(c.timestamp) + ', ' + esc(c.user) + ', changeset ' + c.changeset + ')</span>' : '')
            + '</li>';
        }).join('') + '</ul>' + (cands.length > 6 ? '<span class="detail">et ' + (cands.length - 6) + ' autre(s)</span>' : '');
    } catch (e) {
      out.innerHTML = '<span class="erreur">Échec de la recherche : ' + esc(e.message) + '</span>';
    }
  }

  $('liste').addEventListener('click', function (e) {
    var piste = e.target.closest('button[data-piste]');
    if (piste) { chercherPistes(piste); return; }
    if (!e.target.closest('a, button')) {
      var row = e.target.closest('[data-sel]');
      if (row) { select(row.getAttribute('data-sel'), { fromMap: false }); return; }
    }
    var b = e.target.closest('button[data-act="map"]');
    if (!b) return;
    e.preventDefault();
    var id = Number(b.dataset.id);
    showMap(state.live.results.filter(function (r) { return r.relationId === id; })[0]);
  });
  $('enquete').addEventListener('click', function (e) {
    var el = e.target.closest('.el');
    if (el) select(el.getAttribute('data-sel'), { fromMap: true });
  });
  $('liste').addEventListener('toggle', function (e) {
    if (e.target.open && e.target.tagName === 'DETAILS' && e.target.dataset.key !== undefined) fillChildren(e.target);
  }, true);
})();
