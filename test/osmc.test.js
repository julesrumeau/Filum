const test = require('node:test');
const assert = require('node:assert');
const { parseOsmc, osmcSvg } = require('../src/osmc.js');

test('parseOsmc : waycolor:fond:avant-plan:texte:couleur du texte', () => {
  assert.deepStrictEqual(parseOsmc('red:white:red_bar'),
    { waycolor: 'red', background: { color: 'white', shape: null }, foreground: { color: 'red', shape: 'bar' }, foreground2: null, text: null, textcolor: null });
  const p = parseOsmc('blue:white_circle:blue_stripe:AB:black');
  assert.deepStrictEqual(p.background, { color: 'white', shape: 'circle' });
  assert.deepStrictEqual([p.text, p.textcolor], ['AB', 'black']);
});

test('parseOsmc : valeur vide, inconnue ou piégée : null', () => {
  assert.strictEqual(parseOsmc(''), null);
  assert.strictEqual(parseOsmc(undefined), null);
  assert.strictEqual(parseOsmc('red'), null, 'il faut au moins un fond');
  assert.strictEqual(parseOsmc('red:"><script>:red_bar'), null);
});

test('osmcSvg : un petit SVG avec le fond et la forme, sans rien venu du tag hors couleurs connues', () => {
  const svg = osmcSvg('red:white:red_bar');
  assert.match(svg, /^<svg /);
  assert.match(svg, /fill="white"/);
  assert.match(svg, /fill="red"/);
  assert.strictEqual(osmcSvg('red:"><img src=x onerror=1>:red_bar'), '');
  assert.strictEqual(osmcSvg('n\'importe quoi'), '');
});

test('osmcSvg : le texte est limité à 3 caractères simples et échappé', () => {
  assert.match(osmcSvg('red:white:red_bar:GR:black'), />GR</);
  assert.doesNotMatch(osmcSvg('red:white:red_bar:<b>:black'), /<b>/);
});

test('parseOsmc : cas réels des GR français, fond vide, deux avant-plans (upper, lower) et numéro', () => {
  const p = parseOsmc('red::white_upper:red_lower:965:black');
  assert.strictEqual(p.background, null);
  assert.deepStrictEqual(p.foreground, { color: 'white', shape: 'upper' });
  assert.deepStrictEqual(p.foreground2, { color: 'red', shape: 'lower' });
  assert.deepStrictEqual([p.text, p.textcolor], ['965', 'black']);
  assert.deepStrictEqual(parseOsmc('red:white:red_diamond').foreground, { color: 'red', shape: 'diamond' });
});

test('osmcSvg : un GR avec fond vide, demi-bandes et numéro se dessine', () => {
  const svg = osmcSvg('red::white_upper:red_lower:965:black');
  assert.match(svg, /^<svg /);
  assert.match(svg, />965</);
  assert.match(svg, /fill="red"/);
});
