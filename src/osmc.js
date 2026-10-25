(function (root) {
  'use strict';

  // Symbole de balisage d'un itinéraire de randonnée (tag osmc:symbol) : waycolor:fond:avant-plan:texte:couleur du texte.
  // Le fond est une couleur (avec une forme facultative : white_circle), l'avant-plan une couleur et une forme (red_bar).
  var COLORS = { black: 1, blue: 1, brown: 1, gray: 1, grey: 1, green: 1, orange: 1, pink: 1, purple: 1, red: 1, white: 1, yellow: 1 };

  // Formes de l'avant-plan que Filum dessine, et formes de fond dessinées. Les autres (Waymarked Trails en connaît une
  // quarantaine) donnent un petit carré et un avertissement.
  var DRAWN = { bar: 1, stripe: 1, dot: 1, circle: 1, cross: 1, x: 1, backslash: 1, slash: 1, triangle: 1, upper: 1, lower: 1, left: 1, right: 1, diamond: 1 };
  var BG_DRAWN = { circle: 1, round: 1, frame: 1 };

  function escText(s) {
    return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }

  // couleur ou couleur_forme. Une couleur inconnue donne null et un avertissement ; une forme non dessinée un avertissement.
  function part(s, drawn, warnings) {
    if (!s) return null;
    var m = /^([a-z]+)(?:_([A-Za-z_]+))?$/.exec(s);
    if (!m || !COLORS[m[1]]) { warnings.push('couleur inconnue : ' + String(s).slice(0, 30)); return null; }
    if (m[2] && !drawn[m[2]]) warnings.push('forme non dessinée : ' + m[2]);
    return { color: m[1], shape: m[2] || null };
  }

  // null seulement si la valeur est vide. Tout champ est facultatif après la couleur de trait : une couleur ou une forme
  // inconnue n'empêche pas le rendu du reste, elle ajoute un avertissement. Après le premier avant-plan viennent
  // éventuellement un second avant-plan (couleur_forme), puis le texte (4 caractères au plus) et sa couleur.
  function parseOsmc(value) {
    var str = String(value || '').trim();
    if (!str) return null;
    var p = str.split(':'), warnings = [];
    var waycolor = null;
    if (p[0]) { if (COLORS[p[0]]) waycolor = p[0]; else warnings.push('couleur inconnue : ' + p[0].slice(0, 30)); }
    var bg = part(p[1], BG_DRAWN, warnings), fg = part(p[2], DRAWN, warnings);
    var rest = p.slice(3), fg2 = null;
    if (rest.length && rest[0].indexOf('_') > 0) fg2 = part(rest.shift(), DRAWN, warnings);
    var text = /^[A-Za-z0-9]{1,4}$/.test(rest[0] || '') ? rest[0] : null;
    var tc = text && COLORS[rest[1]] ? rest[1] : null;
    return { waycolor: waycolor, background: bg, foreground: fg, foreground2: fg2, text: text, textcolor: tc, warnings: warnings };
  }

  // Forme de l'avant-plan, dessinée dans un carré de 20 sur 20. La couleur vient de la liste connue, jamais du tag brut.
  function foreground(fg) {
    var c = fg.color;
    switch (fg.shape) {
      case 'bar': return '<rect x="3" y="8" width="14" height="4" fill="' + c + '"/>';
      case 'stripe': return '<rect x="8" y="3" width="4" height="14" fill="' + c + '"/>';
      case 'dot': return '<circle cx="10" cy="10" r="4.5" fill="' + c + '"/>';
      case 'circle': return '<circle cx="10" cy="10" r="5.5" fill="none" stroke="' + c + '" stroke-width="2"/>';
      case 'cross': return '<path d="M4 4L16 16M16 4L4 16" stroke="' + c + '" stroke-width="2.4" fill="none"/>';
      case 'upper': return '<rect x="0.5" y="0.5" width="19" height="9.5" fill="' + c + '"/>';
      case 'lower': return '<rect x="0.5" y="10" width="19" height="9.5" fill="' + c + '"/>';
      case 'left': return '<rect x="0.5" y="0.5" width="9.5" height="19" fill="' + c + '"/>';
      case 'right': return '<rect x="10" y="0.5" width="9.5" height="19" fill="' + c + '"/>';
      case 'diamond': return '<path d="M10 2L18 10L10 18L2 10Z" fill="' + c + '"/>';
      case 'backslash': return '<path d="M4 4L16 16" stroke="' + c + '" stroke-width="3" fill="none"/>';
      case 'slash': return '<path d="M16 4L4 16" stroke="' + c + '" stroke-width="3" fill="none"/>';
      case 'triangle': return '<path d="M10 3L17 16H3Z" fill="' + c + '"/>';
      default: return '<rect x="6" y="6" width="8" height="8" fill="' + c + '"/>';
    }
  }

  // Petit SVG du symbole, ou une chaîne vide si la valeur est vide. Les avertissements vont dans une infobulle (échappée).
  function osmcSvg(value) {
    var o = parseOsmc(value);
    if (!o) return '';
    var bg = o.background || { color: 'none', shape: null }, shape = bg.shape;
    var back = shape === 'circle' || shape === 'round'
      ? '<circle cx="10" cy="10" r="9" fill="' + bg.color + '" stroke="#888" stroke-width="1"/>'
      : shape === 'frame'
        ? '<rect x="1" y="1" width="18" height="18" fill="none" stroke="' + bg.color + '" stroke-width="2"/>'
        : '<rect x="0.5" y="0.5" width="19" height="19" rx="2" fill="' + bg.color + '" stroke="#888" stroke-width="1"/>';
    var inner = (o.foreground ? foreground(o.foreground) : '') + (o.foreground2 ? foreground(o.foreground2) : '');
    if (!o.background && !inner) {
      // Pas de symbole : la couleur de trait seule se dessine en barre, sinon un carré gris.
      inner = o.waycolor ? '<rect x="1" y="8" width="18" height="4" fill="' + o.waycolor + '"/>' : '<text x="10" y="14" font-size="11" text-anchor="middle" fill="#888">?</text>';
    }
    var text = o.text ? '<text x="10" y="14" font-size="9" font-weight="bold" text-anchor="middle" fill="' + (o.textcolor || 'black') + '">' + o.text + '</text>' : '';
    var label = o.foreground ? o.foreground.color : o.background ? bg.color : o.waycolor || 'inconnu';
    var title = o.warnings.length ? '<title>' + escText(o.warnings.join(' ; ')) + '</title>' : '';
    return '<svg class="osmc" viewBox="0 0 20 20" width="20" height="20" role="img" aria-label="Balisage ' + label + '">'
      + title + back + inner + text + '</svg>';
  }

  var api = { parseOsmc: parseOsmc, osmcSvg: osmcSvg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Filum = Object.assign(root.Filum || {}, api);
})(typeof self !== 'undefined' ? self : this);
