(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, $ = U.$, state = U.state, setStatus = U.setStatus, isHole = U.isHole, isWarning = U.isWarning;
  var esc = F.esc, fmtDate = F.fmtDate, osmLink = F.osmLink, fmtKm = F.fmtKm, clip = F.clip;

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
    var ways = {}, q = sel && parseSel(sel);
    if (q && q.kind === 'piece') {
      var res = state.results.filter(function (r) { return r.relationId === q.id; })[0];
      if (res) F.pieceWayRefs(state.snapshot, res, q.index).forEach(function (ref) { ways[ref] = true; });
      return ways;
    }
    var path = sel && targetNode(sel);
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
      U.fillChildren(d);
    }
    var rows = $('liste').querySelectorAll('[data-sel="' + sel + '"]');
    Array.prototype.forEach.call(rows, function (el) {
      el.classList.add('selection');
      for (var g = el.closest('details.plie'); g; g = g.parentElement && g.parentElement.closest('details.plie')) g.open = true;
    });
    if (rows.length) rows[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  // Cadre la carte sur l'ensemble des traits en surbrillance (un morceau entier).
  function fitSelected() {
    var xs = [], ys = [];
    Array.prototype.forEach.call($('carte').querySelectorAll('polyline.voie.sel'), function (line) {
      line.getAttribute('points').split(' ').forEach(function (pt) { var c = pt.split(','); xs.push(Number(c[0])); ys.push(Number(c[1])); });
    });
    if (xs.length && state.map) state.map.fit(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys));
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
      if (sel && sel.indexOf('piece:') === 0 && opts && opts.fit) fitSelected();
      var line = sel && sel.indexOf('way:') === 0 && $('carte').querySelector('polyline.voie[data-way="' + sel.slice(4) + '"]');
      if (line && state.map && opts && opts.fit) { // Maj+clic : cadrer le chemin ; un clic simple le met seulement en évidence
        var xs = [], ys = [];
        line.getAttribute('points').split(' ').forEach(function (pt) { var c2 = pt.split(','); xs.push(Number(c2[0])); ys.push(Number(c2[1])); });
        state.map.fit(Math.min.apply(null, xs), Math.min.apply(null, ys), Math.max.apply(null, xs), Math.max.apply(null, ys));
      }
    }
  }

  U.highlightEnquete = highlightEnquete;
  U.highlightMap = highlightMap;
  U.parseSel = parseSel;
  U.revealInTree = revealInTree;
  U.select = select;
  U.selectedWays = selectedWays;
  U.targetNode = targetNode;
})();
