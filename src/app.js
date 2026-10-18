(function () {
  'use strict';
  var F = window.Filum;
  var $ = function (id) { return document.getElementById(id); };
  var state = { snapshot: null, results: [], nodes: {}, loaded: {}, tree: null, index: [], selected: null, map: null, live: null, frise: null, friseToken: 0, shown: null };

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

  function parseRelationId(text) {
    var m = String(text).match(/(\d+)\s*\/?\s*$/);
    return m ? Number(m[1]) : null;
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
    var s = n.summary, parts = [n.children.filter(function (c) { return c.kind !== 'gap' && c.kind !== 'order'; }).length + ' membre(s)'];
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
    if (n.kind === 'gap') return 'gap:' + n.relationId + ':' + n.gapIndex;
    if (n.kind === 'order') return 'order:' + n.relationId + ':' + n.orderIndex;
    return null;
  }

  function notesHtml(n) {
    return (n.notes || []).map(function (x) {
      return '<span class="note" title="Écrit par un contributeur sur cet élément">' + esc(x.key) + ' : ' + esc(x.value) + '</span>';
    }).join('');
  }

  function nodeIds(list) { return list.map(function (id) { return '#' + id; }).join(' ou '); }

  function rowHtml(n) {
    if (n.kind === 'gap') {
      return '<span class="pastille mauvais"></span><strong>Trou</strong> : le chemin ' + osmLink('way', n.fromRef)
        + ' (bout libre : nœud ' + nodeIds(n.fromEnds) + ') ne se raccorde pas au chemin ' + osmLink('way', n.toRef)
        + ' (nœud ' + nodeIds(n.toEnds) + ')';
    }
    if (n.kind === 'order') {
      return '<span class="pastille ordre"></span><strong>Ordre</strong> : le chemin ' + osmLink('way', n.toRef)
        + ' ne suit pas par un bout le chemin ' + osmLink('way', n.fromRef) + ' (relation reliée mais liste mal triée)';
    }
    var role = n.role ? '<span class="role">' + esc(n.role) + '</span>' : '';
    if (n.kind === 'relation') {
      if (n.cycle) return '<div class="ligne-arbre">relation ' + osmLink('relation', n.id) + ' (déjà dans l\'arbre plus haut, cycle)' + role + '</div>';
      if (n.missing) return '<div class="ligne-arbre">relation ' + osmLink('relation', n.id) + ' absente des données chargées' + role + '</div>';
      return '<span class="pastille ' + n.status + '"></span><strong>' + esc(n.name || 'relation') + '</strong> '
        + osmLink('relation', n.id) + role + ' <span class="detail">' + summaryText(n) + ' · ' + metaText(n) + '</span> '
        + '<button class="voir" data-act="map" data-id="' + n.id + '">Tracé</button>' + notesHtml(n);
    }
    if (n.kind === 'way') {
      if (n.missing) return 'chemin ' + osmLink('way', n.id) + ' absent des données chargées' + role;
      return (n.border ? '<span class="pastille mauvais" title="Bord d\'un trou"></span>' : '<span class="pastille vide"></span>')
        + 'chemin ' + osmLink('way', n.id) + (n.name ? ' ' + esc(n.name) : '') + role
        + ' <span class="detail">' + n.nodeCount + ' nœuds (' + n.ends[0] + ' à ' + n.ends[1] + ') · ' + metaText(n)
        + (n.border ? ' · bord d\'un trou' : '') + '</span>' + notesHtml(n);
    }
    return '<span class="pastille vide"></span>nœud ' + osmLink('node', n.id) + role;
  }

  function nodeHtml(n, open) {
    var hasKids = n.kind === 'relation' && n.children.length;
    if (!hasKids) {
      var sel = selKey(n);
      return '<div class="feuille ' + n.kind + '"' + (sel ? ' data-sel="' + sel + '"' : '') + '>' + rowHtml(n) + '</div>';
    }
    var key = state.index.length;
    state.index.push(n);
    return '<details data-key="' + key + '"' + (open ? ' open' : '') + '><summary>' + rowHtml(n) + '</summary>'
      + '<div class="enfants">' + (open ? n.children.map(function (c) { return nodeHtml(c, false); }).join('') : '') + '</div></details>';
  }

  // Les enfants d'une relation ne sont dessinés que quand on l'ouvre.
  function fillChildren(details) {
    var box = details.querySelector(':scope > .enfants');
    if (box.firstChild) return;
    box.innerHTML = state.index[Number(details.dataset.key)].children.map(function (c) { return nodeHtml(c, false); }).join('');
  }

  function renderList() {
    var holes = state.results.filter(isHole).length;
    var orders = state.results.filter(function (r) { return !isHole(r) && isWarning(r); }).length;
    $('resume').textContent = state.results.length + ' relation(s) analysée(s) : '
      + holes + ' avec un trou, ' + orders + ' avec seulement un avertissement (ordre, variante isolée).';
    state.index = [];
    $('liste').innerHTML = nodeHtml(state.tree, true);
  }

  async function showMap(result) {
    useLive();
    state.shown = result.relationId;
    var wayIds = F.wayRefsOf(state.snapshot, result.relationId);
    $('carte').innerHTML = '<p>Chargement du tracé...</p>';
    try {
      var missing = (await F.fetchNodes(state.snapshot, wayIds.filter(function (id) { return !state.loaded[id]; }))) || [];
      missing.forEach(function (n) { state.nodes[n.id] = n; });
      wayIds.forEach(function (id) { state.loaded[id] = true; });
      renderMap(result);
      renderEnquete(result);
    } catch (e) {
      $('carte').innerHTML = '<p class="erreur">Échec du tracé : ' + esc(e.message) + '</p>';
    }
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

  // ---- Vues : l'état actuel (live) ou la relation reconstituée à une date ----
  function useLive() {
    state.snapshot = state.live.snapshot; state.results = state.live.results; state.tree = state.live.tree;
  }

  function showView(v) {
    state.snapshot = v.snapshot; state.results = v.results; state.tree = v.tree;
    renderList();
    var shown = v.results.filter(function (r) { return r.relationId === state.shown; })[0] || v.results[0];
    renderMap(shown);
  }

  // ---- Frise : deux curseurs, début et fin de la période étudiée ----
  function nowIso() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z'); }

  function renderEnquete(result) {
    var box = $('enquete');
    var rel = state.live.snapshot.elements.filter(function (e) { return e.type === 'relation' && e.id === result.relationId; })[0];
    state.frise = null;
    state.friseToken = (state.friseToken || 0) + 1;
    if (!rel || !rel.members.some(function (m) { return m.type === 'way'; })) {
      box.innerHTML = '<p class="detail">La frise et l\'enquête s\'appliquent à une relation qui contient directement des chemins. '
        + 'Choisissez une sous-relation (bouton « Tracé »).</p>';
      return;
    }
    box.innerHTML = '<div id="frise"><p class="detail">Chargement de la frise...</p></div>'
      + '<div class="actions"><button id="enqueter" class="go">Enquêter sur la période</button></div>'
      + '<div id="enquete-res"></div>';
    $('enqueter').addEventListener('click', reload);
    loadFrise(result, rel);
  }

  async function loadFrise(result, rel) {
    var token = state.friseToken;
    try {
      var hist = await F.fetchRelationHistory(result.relationId);
      if (token !== state.friseToken) return;
      var seen = {};
      rel.members.forEach(function (m) { if (m.type === 'way') seen[m.ref] = true; });
      var min = hist[0].timestamp, max = nowIso();
      state.frise = { relId: result.relationId, hist: hist, min: min, max: max, from: min, to: max,
        ctx: null, allSpans: null, totalWays: Object.keys(seen).length };
      buildFrise();
    } catch (e) {
      if (token === state.friseToken) $('frise').innerHTML = '<p class="erreur">Frise indisponible : ' + esc(e.message) + '</p>';
    }
  }

  function buildFrise() {
    $('frise').innerHTML = '<div class="frise-pistes"><div id="frise-fond"></div>'
      + '<input type="range" id="cur-g" min="0" max="1000" value="0" aria-label="Début de la période">'
      + '<input type="range" id="cur-d" min="0" max="1000" value="1000" aria-label="Fin de la période"></div>'
      + '<div class="frise-dates"><span id="date-g"></span><span id="date-d"></span></div>'
      + '<div id="frise-legende" class="detail"></div><div id="vue-date" class="detail"></div>';
    function onMove(side) {
      var g = $('cur-g'), d = $('cur-d'), fr = state.frise;
      if (side === 'g' && Number(g.value) > Number(d.value)) g.value = d.value;
      if (side === 'd' && Number(d.value) < Number(g.value)) d.value = g.value;
      fr.from = Number(g.value) === 0 ? fr.min : F.fromFraction(Number(g.value) / 1000, fr.min, fr.max);
      fr.to = Number(d.value) === 1000 ? fr.max : F.fromFraction(Number(d.value) / 1000, fr.min, fr.max);
      paintFrise();
    }
    $('cur-g').addEventListener('input', function () { onMove('g'); });
    $('cur-d').addEventListener('input', function () { onMove('d'); });
    paintFrise();
  }

  function paintFrise() {
    var fr = state.frise, html = '';
    if (!$('frise-fond')) return;
    var uncertain = fr.ctx && Object.keys(fr.ctx.wayHistories).length < fr.totalWays;
    if (fr.allSpans) {
      html += F.bandsOf(fr.allSpans, fr.min, fr.max).map(function (b) {
        return '<div class="bande' + (b.open ? ' ouverte' : '') + (uncertain ? ' incertaine' : '') + '" style="left:'
          + (b.left * 100) + '%;width:' + Math.max(b.width * 100, 0.6) + '%"></div>';
      }).join('');
    }
    html += F.tickFractions(fr.hist.map(function (v) { return v.timestamp; }), fr.min, fr.max).map(function (x) {
      return '<div class="repere" style="left:' + (x * 100) + '%"></div>';
    }).join('');
    $('frise-fond').innerHTML = html;
    $('date-g').textContent = 'du ' + fmtDate(fr.from);
    $('date-d').textContent = 'au ' + (fr.to === fr.max ? 'aujourd\'hui' : fmtDate(fr.to));
    $('frise-legende').textContent = 'Traits : versions de la relation (' + fr.hist.length + ').'
      + (fr.allSpans ? ' Rouge : relation cassée.' : '')
      + (uncertain ? ' Rayé : période approximative, ' + Object.keys(fr.ctx.wayHistories).length + ' chemin(s) sur '
        + fr.totalWays + ' ont leur historique lu.' : '');
  }

  // Charge l'historique (une fois), recalcule les périodes de rupture de la fenêtre choisie,
  // et affiche la relation telle qu'elle était à la date de fin.
  async function reload() {
    var fr = state.frise;
    if (!fr) return;
    var out = $('enquete-res');
    $('enqueter').disabled = true;
    out.innerHTML = '<p>Lecture de l\'historique...</p>';
    try {
      if (!fr.ctx) {
        var liveRes = state.live.results.filter(function (r) { return r.relationId === fr.relId; })[0];
        var border = F.borderWayRefs(state.live.snapshot, fr.relId, liveRes);
        fr.ctx = await F.fetchHistoryContext(fr.relId, state.live.snapshot, border, undefined, 60);
        fr.allSpans = F.findBreaks(fr.ctx, fr.relId);
        if (state.frise !== fr) return;
        paintFrise();
      }
      var spans = F.clipSpans(F.findBreaks(F.truncateCtx(fr.ctx, fr.to), fr.relId), fr.from);
      await renderSpans(out, spans, fr);
      applyDateView();
    } catch (e) {
      out.innerHTML = '<p class="erreur">Échec de l\'enquête : ' + esc(e.message) + '</p>';
    } finally {
      $('enqueter').disabled = false;
    }
  }

  function applyDateView() {
    var fr = state.frise, note = $('vue-date');
    if (fr.to === fr.max) {
      if (state.snapshot !== state.live.snapshot) { useLive(); showView(state.live); }
      note.textContent = '';
      return;
    }
    var snap = F.stateAt(fr.to, fr.ctx, fr.relId);
    if (!snap) { note.textContent = 'La relation n\'existait pas encore à cette date.'; return; }
    showView({ snapshot: snap, results: F.analyzeTree(snap, fr.relId), tree: F.buildTree(snap, fr.relId) });
    var rel = snap.elements[0], seen = {}, unread = 0, total = 0;
    rel.members.forEach(function (m) {
      if (m.type !== 'way' || seen[m.ref]) return;
      seen[m.ref] = true; total++;
      if (!fr.ctx.wayHistories[m.ref]) unread++;
    });
    note.className = unread ? 'erreur' : 'detail';
    note.textContent = 'Arbre et carte au ' + fmtDate(fr.to) + ' : état reconstitué. '
      + (unread ? 'ATTENTION, NON FIABLE : ' + unread + ' chemin(s) sur ' + total + ' n\'ont pas leur historique lu et sont pris dans leur état '
        + 'actuel, le nombre de trous et de morceaux est très probablement surestimé. ' : 'Tous les chemins ont leur historique lu. ')
      + 'Les sous-relations et les positions ne sont pas reconstituées.';
  }

  async function renderSpans(out, spans, fr) {
    var changesets = {}, discussions = {};
    try { changesets = await F.fetchChangesets(F.changesetIds(spans)); } catch (e) { changesets = {}; }
    try { discussions = await F.fetchDiscussions(changesets); } catch (e) { discussions = {}; }
    if (state.frise !== fr) return;
    var atDate = fr.to !== fr.max;
    var html = '<p class="detail">Période étudiée : du ' + fmtDate(fr.from) + ' au ' + (atDate ? fmtDate(fr.to) : 'aujourd\'hui') + '.</p>';
    if (!spans.length) {
      html += '<p>Aucune période de rupture trouvée sur cette période dans l\'historique chargé. Un trou peut venir d\'un chemin '
        + 'dont l\'historique n\'a pas été lu (voir les limites ci-dessous).</p>';
    }
    spans.forEach(function (sp) {
      html += '<div class="periode"><p><strong>' + (sp.end ? 'Rupture réparée' : (atDate ? 'Rupture non réparée à cette date' : 'Rupture en cours'))
        + '</strong> : depuis le ' + fmtDate(sp.start.date) + (sp.fromCreation ? ' (dès la création de la relation)' : '')
        + (sp.startsBeforeWindow ? ' (commencée avant la période étudiée)' : '')
        + (sp.end ? ', jusqu\'au ' + fmtDate(sp.end.date) : '') + '.</p>'
        + '<p>Modification(s) à ce moment : </p>' + causesHtml(sp.start.causes, changesets, discussions)
        + (sp.end ? '<p>Réparation : </p>' + causesHtml(sp.end.causes, changesets, discussions) : '')
        + '</div>';
    });
    html += '<p class="limite">Ce sont des pistes, pas des preuves : une modification au moment de la rupture '
      + 'n\'est pas forcément une faute (la personne a pu réparer ou raccrocher un autre chemin). '
      + 'Seuls les chemins aux bords des trous et ceux retirés de la relation ont leur historique lu, les autres '
      + 'sont pris dans leur état actuel.' + (fr.ctx.truncated ? ' Limite de 60 chemins atteinte : certains ont été ignorés.' : '') + '</p>';
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

  function renderMap(result) {
    var nodes = state.nodes, ways = {};
    state.snapshot.elements.forEach(function (e) { if (e.type === 'way') ways[e.id] = e; });
    var lines = [], pts = [];
    F.wayRefsOf(state.snapshot, result.relationId).forEach(function (ref) {
      if (!ways[ref]) return;
      var p = ways[ref].nodes.map(function (n) { return nodes[n]; }).filter(Boolean);
      if (p.length) { lines.push({ id: ref, pts: p }); pts = pts.concat(p); }
    });
    if (!pts.length) { $('carte').innerHTML = '<p>Aucune géométrie à afficher.</p>'; return; }
    var minLat = Math.min.apply(null, pts.map(function (p) { return p.lat; }));
    var maxLat = Math.max.apply(null, pts.map(function (p) { return p.lat; }));
    var minLon = Math.min.apply(null, pts.map(function (p) { return p.lon; }));
    var maxLon = Math.max.apply(null, pts.map(function (p) { return p.lon; }));
    var k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
    var box = $('carte'), pad = 14;
    var W = Math.max(box.clientWidth, 300), H = Math.max(box.clientHeight, 300);
    var spanX = Math.max((maxLon - minLon) * k, 1e-9), spanY = Math.max(maxLat - minLat, 1e-9);
    var scale = Math.min((W - 2 * pad) / spanX, (H - 2 * pad) / spanY);
    var offX = (W - spanX * scale) / 2, offY = (H - spanY * scale) / 2;
    function X(p) { return ((p.lon - minLon) * k * scale + offX).toFixed(1); }
    function Y(p) { return ((maxLat - p.lat) * scale + offY).toFixed(1); }
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Tracé de la relation">';
    // Chaque chemin est dessiné deux fois : un trait épais invisible pour le clic, un trait fin visible.
    lines.forEach(function (l) {
      var pts2 = l.pts.map(function (q) { return X(q) + ',' + Y(q); }).join(' ');
      svg += '<polyline class="touche" fill="none" stroke="transparent" stroke-width="14" vector-effect="non-scaling-stroke" '
        + 'data-sel="way:' + l.id + '" points="' + pts2 + '"/>'
        + '<polyline class="voie" fill="none" stroke="var(--trace)" stroke-width="2" vector-effect="non-scaling-stroke" '
        + 'data-way="' + l.id + '" points="' + pts2 + '"/>';
    });
    function dots(list, color, kind, relId) {
      list.forEach(function (g, i) {
        g.fromEnds.concat(g.toEnds).forEach(function (id) {
          var n = nodes[id];
          if (n) svg += '<circle class="pastille-carte" data-sel="' + kind + ':' + relId + ':' + i + '" cx="' + X(n)
            + '" cy="' + Y(n) + '" r="5" fill="' + color + '"/>';
        });
      });
    }
    var inside = subtreeIds(result.relationId);
    state.results.filter(function (r) { return inside[r.relationId]; }).forEach(function (r) {
      dots(r.orderIssues, 'var(--avert)', 'order', r.relationId);
      dots(r.gaps, 'var(--alerte)', 'gap', r.relationId);
      dots([{ fromEnds: r.openEnds, toEnds: [] }], 'var(--alerte)', 'open', r.relationId);
    });
    box.innerHTML = svg + '</svg>'
      + '<div class="zoom"><button data-z="in" aria-label="Zoom avant">+</button>'
      + '<button data-z="out" aria-label="Zoom arrière">&minus;</button>'
      + '<button data-z="reset" aria-label="Vue complète">&#8962;</button></div>';
    state.map = setupZoom(box, { x: 0, y: 0, w: W, h: H });
    if (state.selected) highlightMap(state.selected);
  }

  // Zoom à la molette ou aux boutons, déplacement en glissant. Le dessin garde des traits et
  // des pastilles de taille constante à l'écran.
  function setupZoom(box, full) {
    var svg = box.querySelector('svg'), view = full, drag = null, moved = 0;
    function apply() {
      svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
      var r = 6 * view.w / box.clientWidth;
      Array.prototype.forEach.call(svg.querySelectorAll('circle'), function (c) {
        c.setAttribute('r', r);
      });
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
      var el = document.elementFromPoint(e.clientX, e.clientY);
      var hit = el && el.closest('[data-sel]');
      select(hit ? hit.getAttribute('data-sel') : null, { fromMap: true });
    });
    svg.addEventListener('pointercancel', stop);
    box.querySelector('.zoom').addEventListener('click', function (e) {
      var b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.z === 'reset') { view = full; apply(); }
      else zoom(b.dataset.z === 'in' ? 1.6 : 1 / 1.6);
    });
    apply();
    return {
      refresh: apply,
      // Centre la vue sur un point du dessin, avec un zoom suffisant pour le voir.
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
      return n.kind === q.kind && n.relationId === q.id && (n.gapIndex === q.index || n.orderIndex === q.index);
    });
  }

  // Chemins concernés par une sélection : le chemin lui-même, ou les deux chemins de part et d'autre d'un trou.
  function selectedWays(sel) {
    var ways = {}, path = sel && targetNode(sel);
    if (path) {
      var t = path[path.length - 1];
      if (t.kind === 'way') ways[t.id] = true;
      else { ways[t.fromRef] = true; ways[t.toRef] = true; }
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
    Array.prototype.forEach.call(svg.querySelectorAll('circle'), function (el) {
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
    Array.prototype.forEach.call(rows, function (el) { el.classList.add('selection'); });
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
    }
  }

  async function run() {
    var id = parseRelationId($('relation').value);
    if (!id) { setStatus('Indiquez un identifiant de relation (par exemple 7444).', true); return; }
    $('go').disabled = true;
    $('liste').innerHTML = ''; $('carte').innerHTML = ''; $('resume').textContent = ''; $('enquete').innerHTML = '';
    setStatus('Chargement de la relation ' + id + '...');
    try {
      state.nodes = {}; state.loaded = {}; state.selected = null;
      state.snapshot = await F.fetchTree(id);
      state.results = F.analyzeTree(state.snapshot, id);
      state.tree = F.buildTree(state.snapshot, id);
      state.live = { snapshot: state.snapshot, results: state.results, tree: state.tree };
      state.frise = null; state.friseToken = (state.friseToken || 0) + 1;
      if (!state.results.length) throw new Error('Relation ' + id + ' introuvable.');
      setStatus('');
      renderList();
      showMap(state.results[0]);
    } catch (e) {
      setStatus('Échec : ' + e.message, true);
    } finally {
      $('go').disabled = false;
    }
  }

  $('go').addEventListener('click', run);
  $('relation').addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });
  $('liste').addEventListener('click', function (e) {
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
    if (e.target.open && e.target.tagName === 'DETAILS') fillChildren(e.target);
  }, true);
})();
