(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, $ = U.$, state = U.state, setStatus = U.setStatus, isHole = U.isHole, isWarning = U.isWarning;
  var esc = F.esc, fmtDate = F.fmtDate, osmLink = F.osmLink, fmtKm = F.fmtKm, clip = F.clip;

  function visibleWayRefs(relId) {
    var refs = F.wayRefsOf(state.snapshot, relId);
    return state.window ? refs.filter(function (id) { return state.window.ways[id]; }) : refs;
  }

  async function showMap(result, keepView) {
    if (!keepView) U.useLive();
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
    var res = state.results.filter(function (r) { return r.relationId === relId; })[0];
    if (res && res.isPolygon) {
      box.innerHTML += '<p><button class="voir" id="btn-contenu">Chercher le contenu du polygone</button> '
        + '<span class="detail">arbres, bancs, aires de jeux... (état actuel, petite zone seulement)</span></p><div id="contenu-res"></div>';
    }
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
    // Une relation sans chemin (parcours de santé, arrêts seuls) se dessine avec ses nœuds membres.
    if (!pts.length && !state.window) pts = memberNodeRows(result.relationId).filter(function (n) { return typeof n.lat === 'number'; });
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
    function X(p) { return ((p.lon - minLon) * scale + offX).toFixed(3); }
    function Y(p) { return ((maxV - F.mercV(p.lat)) * scale + offY).toFixed(3); }
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
    if (state.selected) U.highlightMap(state.selected);
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
    var tiles = F.tilesFor(u0, u1, v0, v1, z, 40), want = {}, pending = 0;
    z = tiles.length ? tiles[0].z : z;   // tilesFor peut avoir baissé le niveau
    g.setAttribute('data-z', z);
    tiles.forEach(function (t) { want[t.z + '/' + t.x + '/' + t.y] = t; });
    Array.prototype.forEach.call(g.querySelectorAll('image'), function (im) {
      var key = im.getAttribute('data-t');
      if (want[key]) delete want[key];
      else if (Number(key.split('/')[0]) === z) g.removeChild(im);   // même niveau, hors de la vue
      // un autre niveau reste dessous jusqu'à ce que les nouvelles tuiles soient arrivées (voir dropOldLevels)
    });
    // Recouvrement d'un millième de tuile (environ un demi-pixel) contre les coutures, proportionnel à la tuile :
    // un recouvrement en unités du dessin deviendrait énorme en zoomant.
    function dropOldLevels() {
      Array.prototype.forEach.call(g.querySelectorAll('image'), function (im) {
        if (Number(im.getAttribute('data-t').split('/')[0]) !== Number(g.getAttribute('data-z'))) g.removeChild(im);
      });
    }
    function done() { if (--pending <= 0) dropOldLevels(); }
    Object.keys(want).forEach(function (key) {
      var t = want[key], im = document.createElementNS('http://www.w3.org/2000/svg', 'image');
      var w = (t.u1 - t.u0) * p.scale, h = (t.v0 - t.v1) * p.scale;
      im.setAttribute('data-t', key);
      im.setAttribute('x', (t.u0 - p.minU) * p.scale + p.offX - w * 0.0005);
      im.setAttribute('y', (p.maxV - t.v0) * p.scale + p.offY - h * 0.0005);
      im.setAttribute('width', w * 1.001);
      im.setAttribute('height', h * 1.001);
      im.setAttribute('preserveAspectRatio', 'none');
      pending++;
      im.addEventListener('load', done);
      im.addEventListener('error', function () { if (im.parentNode) im.parentNode.removeChild(im); done(); });
      im.setAttribute('href', 'https://tile.openstreetmap.org/' + key + '.png');
      g.appendChild(im);
    });
    if (!pending) dropOldLevels();
    clearTimeout(g.dropTimer);
    g.dropTimer = setTimeout(dropOldLevels, 3000);
  }

  // Distance d'un point à un segment (mêmes unités que les coordonnées du dessin).
  function segDist(p, a, b) {
    var dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy;
    var t = len2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
    var cx = a.x + t * dx, cy = a.y + t * dy;
    return Math.sqrt((p.x - cx) * (p.x - cx) + (p.y - cy) * (p.y - cy));
  }

  // Parmi des polylignes du dessin, celle dont un segment est le plus proche du point.
  function nearestLine(lines, pt) {
    var best = null, bestD = Infinity;
    lines.forEach(function (el) {
      var q = el.getAttribute('points').split(' ').map(function (s2) { var c = s2.split(','); return { x: Number(c[0]), y: Number(c[1]) }; });
      for (var i = 1; i < q.length; i++) {
        var d = segDist(pt, q[i - 1], q[i]);
        if (d < bestD) { bestD = d; best = el; }
      }
    });
    return best;
  }

  function setupZoom(box, full) {
    var svg = box.querySelector('svg'), view = full, drag = null, moved = 0;
    function apply() {
      svg.setAttribute('viewBox', view.x + ' ' + view.y + ' ' + view.w + ' ' + view.h);
      var r = 6 * view.w / box.clientWidth;
      Array.prototype.forEach.call(svg.querySelectorAll('circle'), function (c) {
        c.setAttribute('r', c.classList.contains('contenu') ? r / 2.4 : r);
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
      U.select(hit ? hit.getAttribute('data-sel') : null, { fromMap: true });
    });
    // Sous le doigt : une pastille d'abord, sinon, parmi les chemins qui se recouvrent, le plus proche du point.
    function pickAt(clientX, clientY) {
      var under = document.elementsFromPoint(clientX, clientY).filter(function (el) { return el.closest && el.closest('[data-sel]'); });
      var dot = under.filter(function (el) { return el.tagName === 'circle' || el.tagName === 'rect'; })[0];
      if (dot) return dot;
      var lines = under.filter(function (el) { return el.tagName === 'polyline'; });
      if (lines.length < 2) return under[0] ? under[0].closest('[data-sel]') : null;
      return nearestLine(lines, toDrawing(clientX, clientY));
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

  U.drawTiles = drawTiles;
  U.memberNodeRows = memberNodeRows;
  U.renderMap = renderMap;
  U.renderStats = renderStats;
  U.segDist = segDist;
  U.setupZoom = setupZoom;
  U.showMap = showMap;
  U.subtreeIds = subtreeIds;
  U.visibleWayRefs = visibleWayRefs;
})();
