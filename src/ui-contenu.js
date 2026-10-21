(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, $ = U.$, state = U.state;
  var esc = F.esc;

  var MAX_AREA = 0.25;   // degrés carrés par requête de carte
  var MAX_BOXES = 6;

  // Anneaux de coordonnées [lon, lat] des chemins du polygone ; manque = chemins dont un nœud n'est pas chargé.
  function polygonRings(relId) {
    var rel = state.snapshot.elements.filter(function (e) { return e.type === 'relation' && e.id === relId; })[0];
    var ways = {}, rings = [], missing = 0, points = [];
    state.snapshot.elements.forEach(function (e) { if (e.type === 'way') ways[e.id] = e; });
    rel.members.forEach(function (m) {
      if (m.type !== 'way' || !ways[m.ref]) return;
      var ring = ways[m.ref].nodes.map(function (id) { return state.nodes[id]; });
      if (ring.some(function (n) { return !n; })) { missing++; return; }
      rings.push(ring.map(function (n) { return [n.lon, n.lat]; }));
      points = points.concat(ring);
    });
    return { rings: rings, points: points, missing: missing };
  }

  function drawGroup(group) {
    var svg = $('carte').querySelector('svg'), p = state.proj;
    if (!svg || !p) return;
    var g = svg.querySelector('#contenu');
    if (!g) { g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.id = 'contenu'; svg.appendChild(g); }
    g.innerHTML = '';
    group.points.slice(0, 3000).forEach(function (pt) {
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', 'contenu');
      c.setAttribute('cx', ((pt.lon - p.minU) * p.scale + p.offX).toFixed(1));
      c.setAttribute('cy', ((p.maxV - F.mercV(pt.lat)) * p.scale + p.offY).toFixed(1));
      c.setAttribute('pointer-events', 'none');
      g.appendChild(c);
    });
    if (state.map) state.map.refresh();
  }

  function renderResult(out, sum, partial) {
    if (!sum.groups.length) { out.innerHTML = '<span class="detail">Rien d\'étiqueté trouvé dans le polygone.</span>'; return; }
    out.innerHTML = '<span class="detail">' + sum.total + ' élément(s) étiqueté(s) dans le polygone (état actuel). Cliquez un type pour le voir sur la carte (3 000 points au plus sont dessinés).'
      + (partial ? ' ' + partial : '') + '</span><div class="groupes">' + sum.groups.slice(0, 20).map(function (g, i) {
        return '<button class="voir" data-groupe="' + i + '">' + esc(g.label) + ' : ' + g.count + '</button>';
      }).join(' ') + '</div>';
    out.onclick = function (e) {
      var b = e.target.closest('button[data-groupe]');
      if (b) drawGroup(sum.groups[Number(b.dataset.groupe)]);
    };
  }

  async function chercherContenu() {
    var out = $('contenu-res');
    if (!out) return;
    var poly = polygonRings(state.shown);
    if (!poly.rings.length) { out.innerHTML = '<span class="erreur">Aucun contour chargé : affichez d\'abord le tracé.</span>'; return; }
    var boxes = F.splitBbox(F.bboxOf(poly.points), MAX_AREA);
    if (boxes.length > MAX_BOXES) {
      out.innerHTML = '<span class="erreur">Zone trop grande (' + boxes.length + ' requêtes de carte nécessaires, ' + MAX_BOXES + ' au plus) : '
        + 'l\'API OpenStreetMap ne livre que de petites zones.</span>';
      return;
    }
    out.innerHTML = '<span class="detail">Lecture de la carte (' + boxes.length + ' requête(s))...</span>';
    try {
      var elements = await F.fetchMap(boxes);
      var sum = F.summarize(elements, F.ringsToSegments(poly.rings));
      var res = state.results.filter(function (r) { return r.relationId === state.shown; })[0];
      var warn = (poly.missing ? poly.missing + ' chemin(s) sans position, ignoré(s). ' : '')
        + (res && res.openEnds.length ? 'Le contour a des bouts ouverts : le résultat peut être faux.' : '');
      renderResult(out, sum, warn);
    } catch (e) {
      out.innerHTML = '<span class="erreur">Échec : ' + esc(/ 400 /.test(e.message)
        ? 'zone trop chargée pour l\'API OpenStreetMap (plus de 50 000 éléments).' : e.message) + '</span>';
    }
  }

  U.chercherContenu = chercherContenu;
})();
