const test = require('node:test');
const assert = require('node:assert');
const { mercV, chooseZoom, tilesFor } = require('../src/tuiles.js');

test('mercV : zéro à l\'équateur, 180 en haut de la carte Web Mercator, symétrique', () => {
  assert.ok(Math.abs(mercV(0)) < 1e-9);
  assert.ok(Math.abs(mercV(85.0511287798) - 180) < 1e-4);
  assert.ok(Math.abs(mercV(-48) + mercV(48)) < 1e-9);
});

test('chooseZoom : plus on est près (moins de degrés par pixel), plus le zoom est grand, borné à 0..19', () => {
  const far = chooseZoom(0.5), near = chooseZoom(0.0005);
  assert.ok(near > far);
  assert.strictEqual(chooseZoom(1000), 0);
  assert.strictEqual(chooseZoom(1e-9), 19);
  // une tuile de 256 px au zoom 12 couvre 360/4096 degrés : 360/4096/256 degrés par pixel
  assert.strictEqual(chooseZoom(360 / 4096 / 256), 12);
});

test('tilesFor : tuiles qui couvrent la boîte, avec leurs bornes en degrés', () => {
  // zoom 0 : une seule tuile, tout le monde
  const w = tilesFor(-10, 10, -10, 10, 0, 50);
  assert.deepStrictEqual(w.map(t => [t.z, t.x, t.y, t.u0, t.u1, t.v0, t.v1]), [[0, 0, 0, -180, 180, 180, -180]]);
  // zoom 12 autour de Strasbourg : la tuile 2120/1396 commence à 6.328125 de longitude
  const s = tilesFor(7.7, 7.8, 48.0, 48.1, 12, 50);
  assert.ok(s.length >= 1);
  s.forEach(t => assert.ok(t.x >= 0 && t.x < 4096 && t.y >= 0 && t.y < 4096));
  const lo = Math.min(...s.map(t => t.u0)), hi = Math.max(...s.map(t => t.u1));
  assert.ok(lo <= 7.7 && hi >= 7.8);
});

test('tilesFor : réduit le zoom plutôt que de dépasser le nombre maximal de tuiles', () => {
  const t = tilesFor(-10, 10, -10, 10, 8, 20);
  assert.ok(t.length <= 20);
  assert.ok(t.length >= 1);
});

test('tilesFor : ignore ce qui sort du monde (longitude hors -180..180)', () => {
  const t = tilesFor(-200, -170, -10, 10, 3, 50);
  t.forEach(x => assert.ok(x.x >= 0 && x.x < 8));
});

const { viewToGeo, geoToView } = require('../src/tuiles.js');

test('viewToGeo et geoToView : aller-retour entre la vue du dessin et zoom, latitude, longitude (ticket 27)', () => {
  const proj = { minU: -1.52, maxV: mercV(48.91), scale: 8000, offX: 14, offY: 20 };
  const view = { x: 300, y: 200, w: 120, h: 80 };
  const g = viewToGeo(proj, view, 1000);
  assert.ok(g.zoom > 10 && g.zoom < 25, 'zoom plausible : ' + g.zoom);
  assert.ok(g.lat > 48.8 && g.lat < 48.95 && g.lon > -1.6 && g.lon < -1.4, 'position plausible');
  const back = geoToView(proj, g, 1000, 1000 * view.h / view.w);
  ['x', 'y', 'w', 'h'].forEach(k => assert.ok(Math.abs(back[k] - view[k]) < 1e-6, k + ' : ' + back[k] + ' vs ' + view[k]));
});

test('viewToGeo : à pleine largeur d\'écran de 256 pixels pour 360 degrés on est au zoom 0 (ticket 27)', () => {
  const proj = { minU: -180, maxV: 180, scale: 1, offX: 0, offY: 0 };
  const g = viewToGeo(proj, { x: 0, y: 0, w: 360, h: 360 }, 256);
  assert.ok(Math.abs(g.zoom) < 1e-9);
  assert.ok(Math.abs(g.lon) < 1e-9 && Math.abs(g.lat) < 1e-9);
});
