const test = require('node:test');
const assert = require('node:assert');
const { esc, osmLink, fmtKm, fmtDate, clip } = require('../src/html.js');

test('esc neutralise le HTML venu d\'OSM : chevrons, esperluette, guillemets doubles et simples', () => {
  assert.strictEqual(esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.strictEqual(esc('a & b'), 'a &amp; b');
  assert.strictEqual(esc('"x" \'y\''), '&quot;x&quot; &#39;y&#39;');
  assert.strictEqual(esc(42), '42');
  assert.strictEqual(esc(undefined), 'undefined');
});

test('esc : dans un attribut entre guillemets, rien ne permet d\'en sortir', () => {
  const attr = '<a title="' + esc('" onmouseover="alert(1)') + '">';
  assert.ok(!/title="[^"]*"[^>]*onmouseover/.test(attr));
});

test('osmLink : adresse complète vers openstreetmap.org, numéro forcé en nombre', () => {
  assert.match(osmLink('way', 12), /href="https:\/\/www\.openstreetmap\.org\/way\/12"/);
  assert.match(osmLink('way', 12), />#12</);
  const evil = osmLink('way', '1"><script>alert(1)</script>');
  assert.ok(!evil.includes('<script>'));
  assert.ok(!osmLink('node/../x', 5).includes('node/../x'));
});

test('fmtKm : virgule française, une décimale sous 100 km, entier au-dessus', () => {
  assert.strictEqual(fmtKm(2.14), '2,1 km');
  assert.strictEqual(fmtKm(113.4), '113 km');
});

test('fmtDate garde le jour, clip coupe au-delà de 300 caractères', () => {
  assert.strictEqual(fmtDate('2026-10-13T11:38:31Z'), '2026-10-13');
  assert.strictEqual(clip('abc'), 'abc');
  assert.strictEqual(clip('x'.repeat(400)).length, 301);
});
