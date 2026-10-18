(function (root) {
  'use strict';

  var ENDPOINT = 'https://overpass-api.de/api/interpreter';

  function buildQuery(relationId, isoDate) {
    var head = '[out:json][timeout:120]' + (isoDate ? '[date:"' + isoDate + '"]' : '') + ';';
    return head + 'rel(' + relationId + ');>>;out meta;';
  }

  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Instantané de la relation (et de tout ce qu'elle contient) à une date, ou à l'instant présent.
  async function fetchSnapshot(relationId, isoDate) {
    var lastError;
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var res = await fetch(ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'data=' + encodeURIComponent(buildQuery(relationId, isoDate)),
        });
        if (res.status === 429 || res.status >= 500) throw new Error('Overpass a répondu ' + res.status);
        if (!res.ok) throw new Error('Overpass a répondu ' + res.status);
        return await res.json();
      } catch (e) {
        lastError = e;
        await sleep(2000 * (attempt + 1));
      }
    }
    throw lastError;
  }

  var api = { buildQuery: buildQuery, fetchSnapshot: fetchSnapshot };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
