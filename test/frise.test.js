const test = require('node:test');
const assert = require('node:assert');
const { toFraction, fromFraction, truncateCtx, clipSpans, bandsOf, tickFractions } = require('../src/frise.js');

const MIN = '2020-01-01T00:00:00Z', MAX = '2022-01-01T00:00:00Z'; // 731 jours (2020 bissextile)

test('toFraction : 0 au début, 1 à la fin, proportionnel entre les deux', () => {
  assert.strictEqual(toFraction(MIN, MIN, MAX), 0);
  assert.strictEqual(toFraction(MAX, MIN, MAX), 1);
  assert.ok(Math.abs(toFraction('2021-01-01T00:00:00Z', MIN, MAX) - 366 / 731) < 1e-9);
});

test('toFraction : bornée entre 0 et 1, et 0 si la période est vide', () => {
  assert.strictEqual(toFraction('2019-01-01T00:00:00Z', MIN, MAX), 0);
  assert.strictEqual(toFraction('2030-01-01T00:00:00Z', MIN, MAX), 1);
  assert.strictEqual(toFraction(MIN, MIN, MIN), 0);
});

test('fromFraction est l\'inverse de toFraction, au format ISO sans millisecondes', () => {
  assert.strictEqual(fromFraction(0, MIN, MAX), MIN);
  assert.strictEqual(fromFraction(1, MIN, MAX), MAX);
  assert.strictEqual(fromFraction(366 / 731, MIN, MAX), '2021-01-01T00:00:00Z');
});

test('truncateCtx retire les versions postérieures à la date, de la relation et des chemins', () => {
  const ctx = {
    relHistory: [{ version: 1, timestamp: '2020-02-01T00:00:00Z' }, { version: 2, timestamp: '2021-06-01T00:00:00Z' }],
    wayHistories: { 1: [{ version: 1, timestamp: '2020-02-01T00:00:00Z' }, { version: 2, timestamp: '2021-09-01T00:00:00Z' }] },
    currentWays: { 9: { id: 9 } }, truncated: true,
  };
  const t = truncateCtx(ctx, '2021-01-01T00:00:00Z');
  assert.deepStrictEqual(t.relHistory.map(v => v.version), [1]);
  assert.deepStrictEqual(t.wayHistories[1].map(v => v.version), [1]);
  assert.deepStrictEqual(t.currentWays, ctx.currentWays);
  assert.strictEqual(t.truncated, true);
  assert.strictEqual(ctx.relHistory.length, 2); // l'original n'est pas modifié
});

test('truncateCtx garde la version datée exactement à la limite', () => {
  const ctx = { relHistory: [{ version: 1, timestamp: '2021-01-01T00:00:00Z' }], wayHistories: {}, currentWays: {} };
  assert.strictEqual(truncateCtx(ctx, '2021-01-01T00:00:00Z').relHistory.length, 1);
});

const span = (start, end) => ({ start: { date: start, causes: [] }, end: end ? { date: end, causes: [] } : null, fromCreation: false });

test('clipSpans retire les ruptures terminées avant le début de la fenêtre', () => {
  const out = clipSpans([span('2020-02-01T00:00:00Z', '2020-03-01T00:00:00Z')], '2021-01-01T00:00:00Z');
  assert.deepStrictEqual(out, []);
});

test('clipSpans garde une rupture commencée avant la fenêtre mais encore en cours, et le dit', () => {
  const out = clipSpans([span('2020-02-01T00:00:00Z', null)], '2021-01-01T00:00:00Z');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].startsBeforeWindow, true);
});

test('clipSpans garde une rupture commencée dans la fenêtre telle quelle', () => {
  const out = clipSpans([span('2021-05-01T00:00:00Z', '2021-06-01T00:00:00Z')], '2021-01-01T00:00:00Z');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].startsBeforeWindow, false);
});

test('clipSpans garde une rupture réparée après le début de la fenêtre', () => {
  const out = clipSpans([span('2020-02-01T00:00:00Z', '2021-03-01T00:00:00Z')], '2021-01-01T00:00:00Z');
  assert.strictEqual(out.length, 1);
  assert.strictEqual(out[0].startsBeforeWindow, true);
});

test('clipSpans ne modifie pas les périodes d\'origine', () => {
  const s = span('2020-02-01T00:00:00Z', null);
  clipSpans([s], '2021-01-01T00:00:00Z');
  assert.strictEqual(s.startsBeforeWindow, undefined);
});

test('bandsOf : position et largeur de chaque rupture, une rupture en cours va jusqu\'à la fin', () => {
  const bands = bandsOf([span('2020-01-01T00:00:00Z', '2021-01-01T00:00:00Z'), span('2021-07-01T00:00:00Z', null)], MIN, MAX);
  assert.strictEqual(bands[0].left, 0);
  assert.ok(Math.abs(bands[0].width - 366 / 731) < 1e-9);
  assert.strictEqual(bands[0].open, false);
  assert.strictEqual(bands[1].open, true);
  assert.ok(Math.abs(bands[1].left + bands[1].width - 1) < 1e-9);
});

test('tickFractions : positions uniques triées des dates données', () => {
  const f = tickFractions(['2021-01-01T00:00:00Z', MIN, '2021-01-01T00:00:00Z', MAX], MIN, MAX);
  assert.strictEqual(f.length, 3);
  assert.deepStrictEqual(f.slice().sort((a, b) => a - b), f);
  assert.strictEqual(f[0], 0);
  assert.strictEqual(f[2], 1);
});

const { splitSpans } = require('../src/frise.js');
const DAY = 86400000;

test('splitSpans : les ruptures de moins d\'un jour sont brèves, les autres et celles en cours sont longues', () => {
  const spans = [
    span('2020-01-01T10:00:00Z', '2020-01-01T10:05:00Z'),
    span('2020-02-01T00:00:00Z', '2020-03-01T00:00:00Z'),
    span('2021-01-01T00:00:00Z', null),
  ];
  const r = splitSpans(spans, DAY);
  assert.deepStrictEqual(r.brief.map(s => s.start.date), ['2020-01-01T10:00:00Z']);
  assert.deepStrictEqual(r.long.map(s => s.start.date), ['2020-02-01T00:00:00Z', '2021-01-01T00:00:00Z']);
});

test('splitSpans : une rupture d\'exactement un jour est longue', () => {
  const r = splitSpans([span('2020-01-01T00:00:00Z', '2020-01-02T00:00:00Z')], DAY);
  assert.strictEqual(r.long.length, 1);
  assert.strictEqual(r.brief.length, 0);
});

test('splitSpans garde l\'ordre chronologique dans chaque groupe', () => {
  const r = splitSpans([
    span('2020-01-01T10:00:00Z', '2020-01-01T10:01:00Z'),
    span('2020-05-01T10:00:00Z', '2020-05-01T10:01:00Z'),
    span('2020-09-01T10:00:00Z', '2020-09-01T10:01:00Z'),
  ], DAY);
  assert.deepStrictEqual(r.brief.map(s => s.start.date.slice(0, 10)), ['2020-01-01', '2020-05-01', '2020-09-01']);
});

test('splitSpans : aucune période, deux groupes vides', () => {
  assert.deepStrictEqual(splitSpans([], DAY), { long: [], brief: [] });
});

const { estimateLoad } = require('../src/frise.js');

test('estimateLoad : avant tout chargement, on estime d\'après le nombre de chemins de la relation', () => {
  assert.deepStrictEqual(estimateLoad(null, 1022), { n: 1022, secs: 31, approx: true });
});

test('estimateLoad : une fois le contexte chargé, on utilise le nombre exact restant', () => {
  assert.deepStrictEqual(estimateLoad(729, 1022), { n: 729, secs: 22, approx: false });
});

test('estimateLoad : au moins une seconde, jamais de NaN ni de undefined', () => {
  assert.strictEqual(estimateLoad(5, 1022).secs, 1);
  const r = estimateLoad(null, undefined);
  assert.strictEqual(r.n, 0);
  assert.ok(Number.isFinite(r.secs));
});

const { hoverInfo } = require('../src/frise.js');

test('hoverInfo : la date sous le curseur, la version proche et la rupture qui la contient', () => {
  const hist = [
    { version: 1, timestamp: '2020-01-01T00:00:00Z', user: 'a', changeset: 1 },
    { version: 2, timestamp: '2021-01-01T00:00:00Z', user: 'b', changeset: 2 },
  ];
  const spans = [{ start: { date: '2020-06-01T00:00:00Z', causes: [] }, end: { date: '2020-09-01T00:00:00Z', causes: [] } }];
  const mid = hoverInfo(toFraction('2020-07-15T00:00:00Z', MIN, MAX), hist, spans, MIN, MAX, 0.005);
  assert.strictEqual(mid.date.slice(0, 10), '2020-07-15');
  assert.strictEqual(mid.version, null);
  assert.strictEqual(mid.span, spans[0]);
  const near = hoverInfo(toFraction('2021-01-03T00:00:00Z', MIN, MAX), hist, spans, MIN, MAX, 0.01);
  assert.strictEqual(near.version.version, 2);
  assert.strictEqual(near.span, null);
});

test('hoverInfo : la version la plus proche gagne, une rupture en cours va jusqu\'à la fin, pas d\'historique de ruptures', () => {
  const hist = [
    { version: 1, timestamp: '2020-01-01T00:00:00Z' }, { version: 2, timestamp: '2020-01-04T00:00:00Z' }];
  const f = toFraction('2020-01-03T00:00:00Z', MIN, MAX);
  assert.strictEqual(hoverInfo(f, hist, null, MIN, MAX, 0.01).version.version, 2);
  assert.strictEqual(hoverInfo(f, hist, null, MIN, MAX, 0.01).span, null);
  const open = [{ start: { date: '2021-06-01T00:00:00Z' }, end: null }];
  assert.strictEqual(hoverInfo(0.99, [], open, MIN, MAX, 0.01).span, open[0]);
});
