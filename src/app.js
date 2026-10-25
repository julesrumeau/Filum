(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, $ = U.$, state = U.state, setStatus = U.setStatus, isHole = U.isHole, isWarning = U.isWarning;
  var esc = F.esc, fmtDate = F.fmtDate, fmtDateTime = F.fmtDateTime, osmLink = F.osmLink, fmtKm = F.fmtKm, clip = F.clip;

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

  // La relation et son arbre. Une relation supprimée d'OpenStreetMap est lue dans sa dernière version avant la
  // suppression (state.deleted garde qui l'a supprimée et quand) ; sans version visible, l'erreur reste.
  async function loadSnapshot(id) {
    state.deleted = null;
    try { return await F.fetchTree(id); }
    catch (e) {
      if (!e.deletedRoot) throw e;
      var d = await F.fetchDeletedRelation(id);
      if (!d.last || !d.deletion) throw e;
      state.deleted = { lastVersion: d.last.version, version: d.deletion.version, timestamp: d.deletion.timestamp, user: d.deletion.user, changeset: d.deletion.changeset };
      var l = d.last;
      return F.fetchTree(id, undefined, { type: 'relation', id: id, version: l.version, timestamp: l.timestamp, user: l.user, changeset: l.changeset, tags: l.tags || {}, members: l.members || [] });
    }
  }

  function deletedBanner(id) {
    var d = state.deleted;
    if (!d) return '';
    return '<p class="erreur">La relation ' + osmLink('relation', id) + ' a été supprimée d\'OpenStreetMap le ' + fmtDateTime(d.timestamp)
      + (d.user ? ' par ' + F.userLink(d.user) : '') + (d.changeset ? ' (changeset ' + osmLink('changeset', d.changeset) + ')' : '') + '. '
      + 'Vous voyez sa dernière version avant la suppression (v' + d.lastVersion + ') avec l\'état actuel de ses chemins ; '
      + 'la frise permet de remonter dans son histoire jusqu\'à la suppression.</p>';
  }

  async function run() {
    var input = F.parseRelationInput($('relation').value);
    if (input.error) { setStatus(input.error, true); return; }
    if (input.way) return runWay(input.way);
    var id = input.id;
    $('parents').innerHTML = ''; $('trous').innerHTML = ''; $('supprimee').innerHTML = '';
    var prev = state.frise && state.frise.relId === id ? state.frise : null;
    if (prev && prev.loading) return;
    var token = ++state.friseToken;
    if (!prev) { state.frise = null; $('frise-zone').innerHTML = ''; }
    $('go').disabled = true;
    $('liste').innerHTML = ''; $('carte').innerHTML = ''; $('resume').textContent = ''; $('enquete').innerHTML = '';
    setStatus('Chargement de la relation ' + id + '...');
    try {
      state.nodes = {}; state.loaded = {}; state.selected = null; state.window = null;
      state.snapshot = await loadSnapshot(id);
      $('supprimee').innerHTML = deletedBanner(id);
      try { state.snapshot.elements = state.snapshot.elements.concat(await F.fetchMemberNodes(state.snapshot)); }
      catch (e) { /* les nœuds membres sont facultatifs */ }
      state.results = F.analyzeTree(state.snapshot, id);
      state.tree = F.buildTree(state.snapshot, id);
      state.live = { snapshot: state.snapshot, results: state.results, tree: state.tree };
      if (!state.results.length) throw new Error('Relation ' + id + ' introuvable.');
      setStatus('');
      U.renderList();
      U.syncUrl();
      F.fetchParents('relation', id).then(function (list) {
        if (list.length && state.live && state.live.tree.id === id) {
          $('parents').innerHTML = 'Fait partie de : ' + parentsHtml(list);
        }
      }).catch(function () { /* information facultative */ });
      await U.showMap(state.results[0]);
      if (token !== state.friseToken) return;
      var fr = await U.setupFrise(id, prev);
      if (token !== state.friseToken) return;
      if (fr) { U.applyPendingPeriod(fr); await U.applyPeriod(); }
      else state.pendingPeriod = null;
      if (state.pendingSelect) { var sel = state.pendingSelect; state.pendingSelect = null; U.select(sel, { fromMap: true }); }
    } catch (e) {
      setStatus('Échec : ' + e.message, true);
    } finally {
      $('go').disabled = !!(state.frise && state.frise.loading);
    }
  }

  $('go').addEventListener('click', run);

  $('stats').addEventListener('click', function (e) {
    if (e.target.closest('#btn-contenu')) U.chercherContenu();
  });
  $('trous').addEventListener('click', function (e) {
    var seule = e.target.closest('button[data-seule]');
    if (seule) { $('relation').value = seule.dataset.seule; run(); return; }
    var b = e.target.closest('button[data-trou]');
    if (!b) return;
    var r = state.results.filter(function (x) { return x.relationId === Number(b.dataset.trou); })[0];
    var sel = r && (r.gaps.length ? 'gap:' + r.relationId + ':0' : r.openEnds.length ? 'open:' + r.relationId + ':0' : null);
    if (!sel) return;
    U.select(sel, { fromMap: false });
    if (r.gaps.length) U.revealInTree(sel);
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
      if (row) { U.select(row.getAttribute('data-sel'), { fromMap: false, fit: e.shiftKey }); return; }
    }
    var b = e.target.closest('button[data-act="map"]');
    if (!b) return;
    e.preventDefault();
    var id = Number(b.dataset.id);
    U.showMap(state.live.results.filter(function (r) { return r.relationId === id; })[0]);
  });

  $('enquete').addEventListener('click', function (e) {
    var el = e.target.closest('.el');
    if (el) U.select(el.getAttribute('data-sel'), { fromMap: true });
  });

  $('liste').addEventListener('toggle', function (e) {
    if (e.target.open && e.target.tagName === 'DETAILS' && e.target.dataset.key !== undefined) U.fillChildren(e.target);
  }, true);

  U.run = run;
})();
