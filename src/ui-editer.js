(function () {
  'use strict';

  var F = window.Filum, U = window.FilumUI, state = U.state;
  var NAMES = { way: 'chemin', node: 'nœud', relation: 'relation' };

  function link(href, text) {
    return '<a href="' + F.esc(href) + '" target="_blank" rel="noopener">' + F.esc(text) + '</a>';
  }

  // Envoie une adresse à la télécommande de JOSM (Vespucci répond aussi). La réponse n'est pas lisible depuis une autre
  // origine (no-cors) : seul un refus de connexion est détecté.
  function sendToJosm(url, msg) {
    msg.textContent = 'Envoi...';
    fetch(url, { mode: 'no-cors' }).then(function () {
      msg.textContent = 'Envoyé. Si rien ne bouge, vérifiez dans JOSM que la télécommande est activée (Préférences, Télécommande).';
    }).catch(function () {
      msg.textContent = 'JOSM ne répond pas : lancez-le et activez la télécommande (Préférences, Télécommande), ou autorisez cette page à joindre 127.0.0.1.';
    });
  }

  // Menu « Modifier » de la carte : l'objet sélectionné (ou la relation) et la zone visible, dans iD ou JOSM.
  function openEditMenu(box) {
    var old = box.querySelector('.menu-editeur');
    if (old) { old.remove(); return; }
    var obj = F.objectOf(state.selected, state.shown), geo = state.map.geoNow(), bounds = state.map.getBounds();
    var what = obj ? NAMES[obj.kind] + ' ' + obj.id : '';
    var menu = document.createElement('div');
    menu.className = 'menu-editeur';
    menu.innerHTML = '<strong>Modifier avec un éditeur</strong>'
      + (obj ? link(F.idUrl(obj, geo), 'iD : ' + what) + '<button data-josm="objet">JOSM ou Vespucci : ' + F.esc(what) + '</button>' : '')
      + link(F.idUrl(null, geo), 'iD : la zone visible') + '<button data-josm="zone">JOSM ou Vespucci : la zone visible</button>'
      + '<p class="detail" data-msg></p>';
    box.appendChild(menu);
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-josm]');
      if (!b) return;
      var url = b.dataset.josm === 'objet' ? F.josmObjectUrl(obj) : F.josmAreaUrl(bounds);
      if (url) sendToJosm(url, menu.querySelector('[data-msg]'));
    });
    function close(e) {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.type === 'click' && (menu.contains(e.target) || e.target.closest('button[data-z="editer"]'))) return;
      menu.remove();
      document.removeEventListener('keydown', close); document.removeEventListener('click', close);
    }
    document.addEventListener('keydown', close); document.addEventListener('click', close);
  }

  U.openEditMenu = openEditMenu;
})();
