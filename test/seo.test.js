const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const head = html.slice(0, html.indexOf('</head>'));
const URL_SITE = 'https://julesrumeau.github.io/Filum/';
const meta = (attr, name) => {
  const m = new RegExp('<meta ' + attr + '="' + name + '" content="([^"]*)"').exec(head);
  return m ? m[1] : null;
};

test('seo : un titre descriptif de 70 caractères au plus', () => {
  const t = /<title>([^<]*)<\/title>/.exec(head)[1];
  assert.ok(t.length > 'Filum'.length + 10 && t.length <= 70, t + ' (' + t.length + ')');
  assert.match(t, /OpenStreetMap/);
});

test('seo : une description de 70 à 160 caractères', () => {
  const d = meta('name', 'description');
  assert.ok(d && d.length >= 70 && d.length <= 160, d && d.length);
});

test('seo : l\'adresse canonique est celle du site, sans paramètres', () => {
  assert.match(head, new RegExp('<link rel="canonical" href="' + URL_SITE.replace(/[./]/g, '\\$&') + '">'));
});

test('seo : des données structurées JSON-LD valides de type WebApplication', () => {
  const m = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(head);
  assert.ok(m, 'bloc JSON-LD absent');
  const d = JSON.parse(m[1]);
  assert.strictEqual(d['@type'], 'WebApplication');
  assert.strictEqual(d.url, URL_SITE);
  assert.strictEqual(d.inLanguage, 'fr');
  assert.strictEqual(d.isAccessibleForFree, true);
});

test('seo : les balises d\'aperçu Open Graph et Twitter', () => {
  ['og:type', 'og:locale', 'og:site_name', 'og:title', 'og:description', 'og:url'].forEach(p => assert.ok(meta('property', p), p));
  assert.strictEqual(meta('property', 'og:url'), URL_SITE);
  ['twitter:card', 'twitter:title', 'twitter:description'].forEach(p => assert.ok(meta('name', p), p));
});

test('seo : les icônes existent (SVG, PNG 48 px) et l\'icône vide a disparu', () => {
  assert.doesNotMatch(head, /href="data:,"/);
  assert.match(head, /<link rel="icon" href="favicon\.svg" type="image\/svg\+xml">/);
  assert.match(head, /<link rel="icon" href="favicon-48\.png" sizes="48x48" type="image\/png">/);
  assert.ok(fs.existsSync(path.join(root, 'favicon.svg')), 'favicon.svg');
  const png = fs.readFileSync(path.join(root, 'favicon-48.png'));
  assert.strictEqual(png.readUInt32BE(16), 48, 'largeur du PNG');
  assert.strictEqual(png.readUInt32BE(20), 48, 'hauteur du PNG');
});

test('seo : un sitemap.xml avec la page d\'accueil', () => {
  const s = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
  assert.match(s, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.ok(s.includes('<loc>' + URL_SITE + '</loc>'));
});

test('seo : un paragraphe d\'introduction visible, lisible avant le script, dans le corps de la page', () => {
  const body = html.slice(html.indexOf('<body'));
  assert.match(body, /<p[^>]*id="intro"[^>]*>[^<]*relations OpenStreetMap[^<]*<\/p>/);
});

test('seo : aucun tiret cadratin dans les balises du head ni dans l\'introduction', () => {
  const intro = /<p[^>]*id="intro"[^>]*>([^<]*)<\/p>/.exec(html);
  assert.doesNotMatch(head, /—/);
  assert.ok(!intro || !/—/.test(intro[1]));
});
