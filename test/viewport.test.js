const test = require('node:test');
const assert = require('node:assert');
const { zoomAt, panBy, MIN_ZOOM, MAX_ZOOM } = require('../src/viewport.js');

const full = { x: 0, y: 0, w: 800, h: 400 };

test('zoomer d\'un facteur 2 divise la taille de la vue par 2', () => {
  const v = zoomAt(full, full, 2, 400, 200);
  assert.strictEqual(v.w, 400);
  assert.strictEqual(v.h, 200);
});

test('le point sous le curseur reste immobile pendant le zoom', () => {
  // curseur en (200, 100) : au quart de la largeur et de la hauteur
  const v = zoomAt(full, full, 2, 200, 100);
  assert.strictEqual(v.x + v.w * 0.25, 200);
  assert.strictEqual(v.y + v.h * 0.25, 100);
});

test('dézoomer au-delà de la vue complète est bloqué', () => {
  const v = zoomAt(full, full, 0.5, 400, 200);
  assert.deepStrictEqual(v, full);
});

test('le zoom est limité à MAX_ZOOM', () => {
  let v = full;
  for (let i = 0; i < 50; i++) v = zoomAt(v, full, 2, 400, 200);
  assert.ok(Math.abs(v.w - full.w / MAX_ZOOM) < 1e-9);
});

test('déplacer la vue d\'un delta la translate', () => {
  const zoomed = { x: 100, y: 50, w: 400, h: 200 };
  const v = panBy(zoomed, full, 30, -20);
  assert.strictEqual(v.x, 130);
  assert.strictEqual(v.y, 30);
});

test('on ne peut pas sortir du tracé en déplaçant la vue', () => {
  const zoomed = { x: 100, y: 50, w: 400, h: 200 };
  const v = panBy(zoomed, full, 5000, 5000);
  assert.strictEqual(v.x + v.w, 800);
  assert.strictEqual(v.y + v.h, 400);
  const v2 = panBy(zoomed, full, -5000, -5000);
  assert.strictEqual(v2.x, 0);
  assert.strictEqual(v2.y, 0);
});

test('MIN_ZOOM vaut 1 (vue complète)', () => {
  assert.strictEqual(MIN_ZOOM, 1);
});
