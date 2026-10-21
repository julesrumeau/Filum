// Socle partagé des fichiers d'interface (ui-*.js et app.js) : l'état de la page et quelques aides.
// Chaque fichier ajoute ses fonctions à window.FilumUI pour que les autres puissent les appeler.
(function () {
  'use strict';

  var U = window.FilumUI = {};

  U.$ = function (id) { return document.getElementById(id); };

  U.state = { snapshot: null, results: [], nodes: {}, loaded: {}, tree: null, index: [], selected: null, map: null, live: null,
    frise: null, friseToken: 0, shown: null, window: null };

  U.setStatus = function (msg, isError) {
    var el = U.$('status');
    el.textContent = msg;
    el.className = isError ? 'erreur' : '';
  };

  U.isHole = function (r) { return r.gaps.length || r.missing.length || r.openEnds.length; };

  U.isWarning = function (r) { return r.orderIssues.length || r.detached.length; };
})();
