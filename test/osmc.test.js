const test = require('node:test');
const assert = require('node:assert');
const { parseOsmc, osmcSvg } = require('../src/osmc.js');

test('parseOsmc : waycolor:fond:avant-plan:texte:couleur du texte', () => {
  assert.deepStrictEqual(parseOsmc('red:white:red_bar'),
    { waycolor: 'red', background: { color: 'white', shape: null }, foreground: { color: 'red', shape: 'bar' }, foreground2: null, text: null, textcolor: null, warnings: [] });
  const p = parseOsmc('blue:white_circle:blue_stripe:AB:black');
  assert.deepStrictEqual(p.background, { color: 'white', shape: 'circle' });
  assert.deepStrictEqual([p.text, p.textcolor], ['AB', 'black']);
});

test('parseOsmc : valeur vide : null ; une couleur seule se lit (ticket 6, retour de pyrog)', () => {
  assert.strictEqual(parseOsmc(''), null);
  assert.strictEqual(parseOsmc(undefined), null);
  const p = parseOsmc('red');
  assert.strictEqual(p.waycolor, 'red');
  assert.strictEqual(p.background, null);
  assert.deepStrictEqual(p.warnings, []);
});

test('parseOsmc : une couleur ou une forme inconnue n\'empêche pas le rendu partiel, elle donne un avertissement', () => {
  const p = parseOsmc('red:white:red_bar_unknown_shape');
  assert.deepStrictEqual(p.foreground, { color: 'red', shape: 'bar_unknown_shape' });
  assert.ok(p.warnings.some(w => /forme/.test(w)));
  const q = parseOsmc('red:chartreuse:blue_bar');
  assert.strictEqual(q.background, null);
  assert.deepStrictEqual(q.foreground, { color: 'blue', shape: 'bar' });
  assert.ok(q.warnings.some(w => /couleur inconnue : chartreuse/.test(w)));
});

test('osmcSvg : un petit SVG avec le fond et la forme, sans rien venu du tag hors couleurs connues', () => {
  const svg = osmcSvg('red:white:red_bar');
  assert.match(svg, /^<svg /);
  assert.match(svg, /fill="white"/);
  assert.match(svg, /fill="red"/);
  const trap = osmcSvg('red:"><img src=x onerror=1>:red_bar');
  assert.doesNotMatch(trap, /<img/);
  assert.match(trap, /fill="red"/, 'le reste se dessine');
  assert.match(trap, /<title>/, 'avec un avertissement');
  const odd = osmcSvg('n\'importe quoi');
  assert.doesNotMatch(odd, /n'importe/, 'la valeur brute n\'apparaît pas telle quelle, seulement échappée dans l\'avertissement');
  assert.match(odd, /<title>couleur inconnue : n&#39;importe quoi<\/title>/);
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

test('osmcSvg : une couleur seule se dessine en trait ; le texte peut avoir 4 caractères ; valeur vide : rien', () => {
  assert.match(osmcSvg('red'), /^<svg /);
  assert.strictEqual(osmcSvg(''), '');
  assert.match(osmcSvg('red:white:red_bar:GR65:black'), />GR65</);
});
