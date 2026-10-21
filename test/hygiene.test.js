const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));

test('chaque fichier de src/ est chargé par index.html (un script oublié casse la page sans faire échouer les autres tests)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  files.forEach(f => assert.ok(html.includes('src="src/' + f + '"'), f + ' absent de index.html'));
});

test('aucun fichier de src/ ne dépasse 1 000 lignes', () => {
  files.forEach(f => {
    const n = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').length;
    assert.ok(n <= 1000, f + ' : ' + n + ' lignes');
  });
});

test('aucune fonction de premier niveau ne dépasse 100 lignes', () => {
  files.forEach(f => {
    const L = fs.readFileSync(path.join(SRC, f), 'utf8').split('\n');
    for (let i = 0; i < L.length; i++) {
      const m = L[i].match(/^ {2}(?:async )?function (\w+)/);
      if (!m) continue;
      let j = i + 1;
      while (j < L.length && !L[j].startsWith('  }')) j++;
      assert.ok(j - i + 1 <= 100, f + ' : ' + m[1] + ' fait ' + (j - i + 1) + ' lignes');
    }
  });
});

test('aucun fichier d\'interface n\'écrit dans innerHTML un texte d\'OSM sans passer par esc (garde-fou grossier : champs d\'OSM)', () => {
  const risky = /\+ *(?:[a-z]\w*\.)?(?:user|comment|name|text|createdBy)\b(?! *\))/g;
  files.filter(f => f.startsWith('ui-') || f === 'app.js').forEach(f => {
    fs.readFileSync(path.join(SRC, f), 'utf8').split('\n').forEach((line, i) => {
      if (!/<|innerHTML/.test(line)) return;
      const hit = line.match(risky);
      if (hit && !/esc\(|textContent|label/.test(line)) assert.fail(f + ':' + (i + 1) + ' texte possiblement non échappé : ' + line.trim());
    });
  });
});
