(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, $ = U.$, state = U.state, setStatus = U.setStatus, isHole = U.isHole, isWarning = U.isWarning;
  var esc = F.esc, fmtDate = F.fmtDate, osmLink = F.osmLink, fmtKm = F.fmtKm, clip = F.clip;

  function metaText(n) {
    if (!n.version) return '';
    return 'v' + n.version + ' · ' + F.userLink(n.user) + ' · ' + fmtDate(n.timestamp);
  }

  function summaryText(n) {
    var s = n.summary, shown = n.children.filter(function (c) { return c.kind !== 'gap' && c.kind !== 'order'; }).length;
    var parts = [n.hiddenCount === undefined ? shown + ' membre(s)' : shown + ' touché(s) affiché(s), ' + n.hiddenCount + ' masqué(s)'];
    if (s.isPolygon && n.rings) {
      var g = n.rings;
      parts.push('polygone : ' + g.outer.count + ' contour(s) extérieur(s) (' + g.outer.closed + ' fermé(s)), '
        + g.inner.count + ' trou(s) intérieur(s) (' + g.inner.closed + ' fermé(s))');
      if (g.open.length) parts.push(g.open.length + ' anneau(x) ouvert(s)');
    } else parts.push(s.isPolygon ? 'polygone' : s.pieces + ' morceau(x)');
    if (s.gaps) parts.push(s.gaps + ' trou(s)');
    if (s.openEnds) {
      var kinds = [];
      if (s.openFree) kinds.push(s.openFree + ' bout(s) libre(s)');
      if (s.openMid) kinds.push(s.openMid + ' bout(s) posé(s) sur le milieu d\'un chemin (à couper)');
      if (s.openBranch) kinds.push(s.openBranch + ' embranchement(s) (3 chemins ou plus finissent au même nœud)');
      parts.push(kinds.length ? kinds.join(', ') : s.openEnds + ' bout(s) ouvert(s)');
    }
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
      var kind = F.tagChangeKind(t), sign = { ajout: '+', modif: '~', retrait: '−' }[kind];
      rows.push('<span class="tag-' + kind + '"><b>' + sign + '</b> Tag ' + esc(t.key) + ' : ' + (t.before === undefined ? '(absent)' : '« ' + esc(t.before) + ' »')
        + ' → ' + (t.after === undefined ? '(retiré)' : '« ' + esc(t.after) + ' »') + '</span>');
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
        + osmLink('relation', n.id) + (n.osmc ? ' ' + F.osmcSvg(n.osmc) : '') + role + ' <span class="detail">' + summaryText(n) + ' · ' + metaText(n) + '</span> '
        + (state.window ? '' : '<button class="voir" data-act="map" data-id="' + n.id + '">Tracé</button>') + notesHtml(n);
    }
    if (n.kind === 'way') {
      if (n.missing) return 'chemin ' + osmLink('way', n.id) + ' absent des données chargées' + role;
      return railHtml(n.loop) + (n.border ? '<span class="pastille mauvais" title="Bord d\'un trou"></span>' : '<span class="pastille vide"></span>')
        + 'chemin ' + osmLink('way', n.id) + (n.name ? ' ' + esc(n.name) : '') + role
        + ' <span class="detail">' + n.nodeCount + ' nœuds (' + n.ends[0] + ' à ' + n.ends[1] + ') · ' + metaText(n)
        + (n.border ? ' · bord d\'un trou' : '') + '</span>' + notesHtml(n);
    }
    var label = [n.name, n.ref && '(' + n.ref + ')'].filter(Boolean).map(esc).join(' ');
    return '<span class="pastille noeud"></span>nœud ' + osmLink('node', n.id) + (label ? ' ' + label : '') + role
      + (n.what ? ' <span class="detail">' + esc(n.what) + '</span>' : (n.loaded ? '' : ' <span class="detail">(non chargé)</span>'));
  }

  // Rail de bouclage dans la marge gauche : un trait vertical qui relie les chemins d'un contour fermé (coin haut au
  // début, coin bas à la fin), ou un petit rond pour un chemin fermé sur lui-même. Les lignes se touchent, le trait se suit.
  function railHtml(loop) {
    if (!loop) return '';
    if (loop.kind === 'self') return '<span class="rail rail-seul" title="Chemin fermé sur lui-même"></span>';
    var where = loop.pos === 1 ? ['debut', 'début'] : loop.pos === loop.size ? ['fin', 'fin'] : ['milieu', 'suite'];
    var title = 'Contour fermé de ' + loop.size + ' chemins : ' + where[1] + ' (' + loop.pos + ' sur ' + loop.size + ')';
    // Deux rails, à gauche et à droite : le contour se referme sur lui-même, comme dans l'éditeur de JOSM.
    return '<span class="rail rail-' + where[0] + '" title="' + title + '"></span><span class="rail rail-d rail-' + where[0] + '" title="' + title + '"></span>';
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

  U.childrenHtml = childrenHtml;
  U.eventLine = eventLine;
  U.eventText = eventText;
  U.eventsHtml = eventsHtml;
  U.fillChildren = fillChildren;
  U.linkList = linkList;
  U.metaText = metaText;
  U.nodeHtml = nodeHtml;
  U.nodeIds = nodeIds;
  U.notesHtml = notesHtml;
  U.proofHtml = proofHtml;
  U.relationEventsHtml = relationEventsHtml;
  U.renderList = renderList;
  U.rowHtml = rowHtml;
  U.selKey = selKey;
  U.summaryText = summaryText;
  U.versionLink = versionLink;
})();
