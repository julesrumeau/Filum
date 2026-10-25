(function (root) {
  'use strict';

  // Tout texte venu d'OpenStreetMap (noms, tags, auteurs, commentaires de changeset) est écrit dans la page :
  // il passe par esc() avant d'entrer dans un innerHTML. Les numéros d'éléments sont forcés en nombres.
  var ENTITY = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' };
  var KINDS = { node: 1, way: 1, relation: 1, changeset: 1 };

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return ENTITY[c]; });
  }

  function osmLink(kind, id) {
    var n = Number(id), k = KINDS[kind] ? kind : 'element';
    return '<a href="https://www.openstreetmap.org/' + k + '/' + n + '" target="_blank" rel="noopener">#' + n + '</a>';
  }

  function fmtKm(km) { return (km >= 100 ? Math.round(km) : km.toFixed(1)).toString().replace('.', ',') + ' km'; }

  function fmtDate(iso) { return iso.slice(0, 10); }

  // Jour et heure UTC à la seconde : une rupture brève se joue en quelques minutes.
  function fmtDateTime(iso) { return iso.slice(0, 10) + ' ' + iso.slice(11, 19) + ' UTC'; }

  function clip(text) { return text.length > 300 ? text.slice(0, 300) + '…' : text; }

  // Nom d'un contributeur avec un lien vers « How did you contribute » (nom encodé dans l'adresse, échappé à l'affichage).
  function userLink(name) {
    return '<a href="https://hdyc.neis-one.org/?' + encodeURIComponent(String(name)) + '" target="_blank" rel="noopener">' + esc(name) + '</a>';
  }

  var api = { userLink: userLink, esc: esc, osmLink: osmLink, fmtKm: fmtKm, fmtDate: fmtDate, fmtDateTime: fmtDateTime, clip: clip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
