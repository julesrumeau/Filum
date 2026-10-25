(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, $ = U.$, state = U.state, setStatus = U.setStatus, isHole = U.isHole, isWarning = U.isWarning;
  var esc = F.esc, fmtDate = F.fmtDate, fmtDateTime = F.fmtDateTime, osmLink = F.osmLink, fmtKm = F.fmtKm, clip = F.clip;

  function elementLabel(c) {
    var text = (c.type === 'relation' ? 'la relation' : 'chemin ' + c.id) + ' (v' + c.version + ')';
    if (c.type !== 'way') return esc(text);
    return '<span class="el" data-sel="way:' + c.id + '">' + esc(text) + '</span>';
  }

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
      return '<li>par <strong>' + esc(first.user) + '</strong>, le ' + fmtDateTime(first.timestamp) + ', '
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
    U.renderList();
    var shown = v.results.filter(function (r) { return r.relationId === state.shown; })[0] || v.results[0];
    return U.showMap(shown, true);
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
    if (p.from && F.periodBound(p.from, false) > fr.min) fr.from = F.periodBound(p.from, false);
    if (p.to) {
      var to = F.periodBound(p.to, true);
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

  // Une version de la relation dans la bulle : qui, quand, quel changeset, et ce qu'elle a changé dans les membres.
  function versionLine(v, fr) {
    var line = 'Relation v' + v.version + ' par ' + esc(v.user) + ', ' + fmtDateTime(v.timestamp) + ', changeset ' + v.changeset;
    var c = F.memberChange(fr.hist, v.version);
    if (!c || !(c.added.length || c.removed.length || c.roleChanged.length)) return line;
    function names(list) {
      return list.slice(0, 3).map(function (m) { return m.type + ' ' + Number(m.ref); }).join(', ') + (list.length > 3 ? ' et ' + (list.length - 3) + ' autre(s)' : '');
    }
    var parts = [];
    if (c.added.length) parts.push('+' + c.added.length + ' (' + names(c.added) + ')');
    if (c.removed.length) parts.push('−' + c.removed.length + ' (' + names(c.removed) + ')');
    if (c.roleChanged.length) parts.push(c.roleChanged.length + ' rôle(s) changé(s)');
    return line + '<br><span class="detail">membres ' + parts.join(', ') + '</span>';
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
      var lines = ['<strong>' + fmtDateTime(info.date) + '</strong>'];
      info.versions.slice(0, 4).forEach(function (v) { lines.push(versionLine(v, fr)); });
      if (info.versions.length > 4) lines.push('et ' + (info.versions.length - 4) + ' autre(s) version(s) toutes proches');
      if (info.span) {
        var sp = info.span, who = (sp.start.causes || []).slice(0, 2).map(function (c) {
          return (c.type === 'relation' ? 'la relation' : 'chemin ' + c.id) + ' v' + c.version + ' par ' + esc(c.user);
        }).join(', ');
        lines.push('<span class="rupture">Relation cassée ' + (sp.fromCreation ? 'dès sa création' : 'depuis le ' + fmtDateTime(sp.start.date))
          + (sp.end ? ' jusqu\'au ' + fmtDateTime(sp.end.date) : ' (toujours cassée)') + '</span>' + (who ? '<br>Début : ' + who : ''));
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
    if (fr.mixedSpans) {
      html += F.bandsOf(fr.mixedSpans, fr.min, fr.max).map(function (b) {
        return '<div class="bande ordre" style="left:' + (b.left * 100) + '%;width:' + Math.max(b.width * 100, 0.6) + '%"></div>';
      }).join('');
    }
    html += F.tickFractions(fr.hist.map(function (v) { return v.timestamp; }), fr.min, fr.max).map(function (x) {
      return '<div class="repere" style="left:' + (x * 100) + '%"></div>';
    }).join('');
    // voile sur ce qui est hors de la période choisie, mis à jour en direct avec les curseurs
    var left = F.toFraction(fr.from, fr.min, fr.max) * 100, right = F.toFraction(fr.to, fr.min, fr.max) * 100;
    html += '<div class="hors" style="left:0;width:' + left + '%"></div><div class="hors" style="left:' + right + '%;right:0"></div>';
    $('frise-fond').innerHTML = html;
    $('date-g').textContent = 'du ' + fmtDateTime(fr.from);
    $('date-d').textContent = 'au ' + (fr.toIsMax ? 'aujourd\'hui' : fmtDateTime(fr.to));
    var vers = fr.hist.length === 1
      ? 'La relation elle-même n\'a qu\'une version (un seul trait) : ses modifications se trouvent surtout dans l\'historique de ses chemins.'
      : 'Traits : les ' + fr.hist.length + ' versions de la relation.';
    $('frise-legende').textContent = vers
      + (fr.allSpans ? ' Rouge : périodes où la relation est cassée (toute son histoire, ne dépend pas des curseurs). Orange : membres mélangés (liste mal ordonnée, sans trou). Zone grisée : hors de la période choisie.'
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
    fr.mixedSpans = F.spansOf(points, 'mixed');
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
      useLive(); U.renderList();
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
      var mixed = F.clipSpans(F.spansOf(fr.points.filter(function (p) { return p.date <= fr.to; }), 'mixed'), fr.from);
      await renderSpans(out, spans, fr, mixed);
      if (isFull(fr)) {
        $('frise-note').textContent = '';
        if (state.snapshot !== state.live.snapshot) { useLive(); U.renderList(); await U.showMap(state.live.results[0], true); }
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
    $('resume').textContent = 'Période du ' + fmtDateTime(fr.from) + ' au ' + (fr.toIsMax ? 'aujourd\'hui' : fmtDateTime(fr.to)) + ' : '
      + shownCount + ' élément(s) touché(s) affiché(s), ' + wtree.hiddenCount + ' masqué(s) (non modifiés dans la période'
      + (minor ? ' ou seulement ' + minor + ' modification(s) sans effet sur la continuité' : '') + '). '
      + 'État à la date de fin, relation complète : ' + (r ? r.gaps.length + ' trou(s), ' + r.pieces.length + ' morceau(x)' : 'inconnu') + '.';
    var pending = F.wayIdsToLoad(fr.ctx, fr.max).length;
    $('frise-note').className = pending ? 'erreur' : 'detail';
    $('frise-note').textContent = pending
      ? 'ATTENTION : il reste ' + pending + ' chemin(s) dont l\'historique n\'est pas lu, les changements de la période peuvent être incomplets.'
      : 'Les changements affichés sont ceux de la période. Positions des nœuds et sous-relations non reconstituées.';
  }

  // Cale les curseurs sur les dates exactes d'une rupture (à la seconde) puis lance l'analyse.
  function analyzeExact(fr, from, to) {
    fr.from = from > fr.min ? from : fr.min;
    fr.toIsMax = !to || to >= fr.max;
    fr.to = fr.toIsMax ? fr.max : to;
    buildFrise();
    U.applyPeriod();
  }

  async function renderSpans(out, spans, fr, mixed) {
    mixed = mixed || [];
    var changesets = {}, discussions = {};
    try { changesets = await F.fetchChangesets(F.changesetIds(spans.concat(mixed))); } catch (e) { changesets = {}; }
    try { discussions = await F.fetchDiscussions(changesets); } catch (e) { discussions = {}; }
    if (state.frise !== fr) return;
    var atDate = !fr.toIsMax;
    var html = '<p class="detail">Périodes de rupture, du ' + fmtDateTime(fr.from) + ' au ' + (atDate ? fmtDateTime(fr.to) : 'aujourd\'hui') + '.</p>';
    if (!spans.length) {
      html += '<p>Aucune période de rupture sur cette période dans l\'historique chargé.</p>';
    }
    var parts = F.splitSpans(spans, 86400000);
    function spanHtml(sp, fixed, notFixed) {
      return '<div class="periode"><p><strong>' + (sp.end ? (fixed ? fixed + ', corrigé' : 'Rupture réparée')
          : (notFixed || (atDate ? 'Rupture non réparée à cette date' : 'Rupture en cours')))
        + '</strong> : depuis le ' + fmtDateTime(sp.start.date) + (sp.fromCreation ? ' (dès la création de la relation)' : '')
        + (sp.startsBeforeWindow ? ' (commencée avant la période étudiée)' : '')
        + (sp.end ? ', jusqu\'au ' + fmtDateTime(sp.end.date) : '') + '.</p>'
        + '<p><button class="voir" data-act="periode" data-from="' + esc(sp.start.date) + '" data-to="' + esc(sp.end ? sp.end.date : '') + '">'
        + 'Analyser cette période exacte</button></p>'
        + '<p>Modification(s) à ce moment : </p>' + causesHtml(sp.start.causes, changesets, discussions)
        + (sp.end ? '<p>Réparation : </p>' + causesHtml(sp.end.causes, changesets, discussions) : '')
        + '</div>';
    }
    parts.long.forEach(function (sp) { html += spanHtml(sp); });
    if (parts.brief.length) {
      html += '<details class="breves"><summary>' + parts.brief.length + ' rupture(s) brève(s), de moins d\'un jour (le plus souvent '
        + 'une édition faite en plusieurs envois)</summary>' + parts.brief.map(function (sp) { return spanHtml(sp); }).join('') + '</details>';
    }
    if (mixed.length) {
      html += '<h3>Membres mélangés (ordre de la liste)</h3><p class="detail">La relation reste d\'un seul morceau, mais ses membres ne sont plus '
        + 'dans l\'ordre du parcours (Knooppuntnet parle de membres mélangés).</p>'
        + mixed.map(function (sp) { return spanHtml(sp, 'Membres mélangés', 'Membres encore mélangés'); }).join('');
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
    out.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-act=periode]');
      if (b) analyzeExact(fr, b.dataset.from, b.dataset.to);
    });
    U.highlightEnquete(state.selected);
  }

  U.applyPendingPeriod = applyPendingPeriod;
  U.applyPeriod = applyPeriod;
  U.buildFrise = buildFrise;
  U.causesHtml = causesHtml;
  U.discussionHtml = discussionHtml;
  U.elementLabel = elementLabel;
  U.ensureCtx = ensureCtx;
  U.ensurePoints = ensurePoints;
  U.isFull = isFull;
  U.loadAll = loadAll;
  U.loadHistory = loadHistory;
  U.nowIso = nowIso;
  U.paintCharge = paintCharge;
  U.paintFrise = paintFrise;
  U.renderSpans = renderSpans;
  U.setupFrise = setupFrise;
  U.setupFriseHover = setupFriseHover;
  U.showView = showView;
  U.showWindow = showWindow;
  U.syncUrl = syncUrl;
  U.useLive = useLive;
  U.windowState = windowState;
})();
