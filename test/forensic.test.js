const test = require('node:test');
const assert = require('node:assert');
const { stateAt, timeline, findBreaks } = require('../src/forensic.js');

// Une version de chemin ou de relation, au format de l'API OSM (history.json).
function wv(id, version, ts, nodes, extra) {
  return Object.assign({ type: 'way', id, version, timestamp: ts, user: 'u' + version, changeset: 1000 + version, nodes }, extra);
}
function rv(id, version, ts, refs, extra) {
  return Object.assign({
    type: 'relation', id, version, timestamp: ts, user: 'r' + version, changeset: 2000 + version,
    tags: { type: 'route' }, members: refs.map(r => ({ type: 'way', ref: r, role: '' })),
  }, extra);
}
const T = (d) => d + 'T12:00:00Z';

// Cas de base : deux chemins qui se touchent en 12, relation créée en 2020.
function base() {
  return {
    relHistory: [rv(100, 1, T('2020-01-01'), [1, 2])],
    wayHistories: {
      1: [wv(1, 1, T('2020-01-01'), [10, 11, 12])],
      2: [wv(2, 1, T('2020-01-01'), [12, 13, 14])],
    },
    currentWays: {},
  };
}

test('stateAt prend la dernière version de la relation antérieure ou égale à la date', () => {
  const ctx = base();
  ctx.relHistory.push(rv(100, 2, T('2021-01-01'), [1]));
  const snap = stateAt(T('2020-06-01'), ctx, 100);
  const rel = snap.elements.find(e => e.type === 'relation');
  assert.strictEqual(rel.members.length, 2);
  const later = stateAt(T('2021-06-01'), ctx, 100).elements.find(e => e.type === 'relation');
  assert.strictEqual(later.members.length, 1);
});

test('stateAt renvoie null avant la création de la relation', () => {
  assert.strictEqual(stateAt(T('2019-01-01'), base(), 100), null);
});

test('stateAt prend la liste de nœuds du chemin à la date demandée', () => {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-01-01'), [10, 11]));
  const way1 = d => stateAt(T(d), ctx, 100).elements.find(e => e.type === 'way' && e.id === 1);
  assert.deepStrictEqual(way1('2021-01-01').nodes, [10, 11, 12]);
  assert.deepStrictEqual(way1('2022-06-01').nodes, [10, 11]);
});

test('un chemin supprimé à cette date est absent de l\'état', () => {
  const ctx = base();
  ctx.wayHistories[2].push(wv(2, 2, T('2022-01-01'), undefined, { visible: false }));
  const snap = stateAt(T('2023-01-01'), ctx, 100);
  assert.ok(!snap.elements.some(e => e.type === 'way' && e.id === 2));
});

test('un chemin sans historique chargé garde son état actuel', () => {
  const ctx = base();
  delete ctx.wayHistories[2];
  ctx.currentWays[2] = { type: 'way', id: 2, nodes: [12, 99] };
  const w = stateAt(T('2021-01-01'), ctx, 100).elements.find(e => e.type === 'way' && e.id === 2);
  assert.deepStrictEqual(w.nodes, [12, 99]);
});

test('findBreaks : un chemin raccourci fait apparaître un trou, avec auteur, date et changeset', () => {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11], { user: 'bob', changeset: 77 }));
  const spans = findBreaks(ctx, 100);
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].start.date, T('2022-03-01'));
  assert.strictEqual(spans[0].start.causes.length, 1);
  const c = spans[0].start.causes[0];
  assert.deepStrictEqual([c.type, c.id, c.version, c.user, c.changeset], ['way', 1, 2, 'bob', 77]);
  assert.strictEqual(spans[0].end, null);
  assert.strictEqual(spans[0].fromCreation, false);
});

test('findBreaks : une réparation ultérieure ferme la période et désigne son auteur', () => {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11], { user: 'bob' }));
  ctx.wayHistories[1].push(wv(1, 3, T('2023-05-01'), [10, 11, 12], { user: 'alice' }));
  const spans = findBreaks(ctx, 100);
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].end.date, T('2023-05-01'));
  assert.strictEqual(spans[0].end.causes[0].user, 'alice');
});

test('findBreaks : une relation toujours continue ne donne aucune période', () => {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11, 12, 15]));
  assert.deepStrictEqual(findBreaks(ctx, 100), []);
});

test('findBreaks : une relation cassée dès sa création est signalée comme telle', () => {
  const ctx = base();
  ctx.wayHistories[2] = [wv(2, 1, T('2020-01-01'), [50, 51])];
  const spans = findBreaks(ctx, 100);
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].fromCreation, true);
  assert.strictEqual(spans[0].start.date, T('2020-01-01'));
});

test('findBreaks : retirer de la relation le chemin qui reliait deux morceaux désigne la relation', () => {
  const ctx = {
    relHistory: [rv(100, 1, T('2020-01-01'), [1, 3, 2]), rv(100, 2, T('2021-01-01'), [1, 2], { user: 'carl' })],
    wayHistories: {
      1: [wv(1, 1, T('2020-01-01'), [10, 11])],
      3: [wv(3, 1, T('2020-01-01'), [11, 20])],
      2: [wv(2, 1, T('2020-01-01'), [20, 21])],
    },
    currentWays: {},
  };
  const spans = findBreaks(ctx, 100);
  assert.strictEqual(spans.length, 1);
  const c = spans[0].start.causes[0];
  assert.deepStrictEqual([c.type, c.id, c.version, c.user], ['relation', 100, 2, 'carl']);
});

test('findBreaks : deux modifications à la même seconde sont toutes deux listées comme causes', () => {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11]));
  ctx.wayHistories[2].push(wv(2, 2, T('2022-03-01'), [40, 41]));
  const spans = findBreaks(ctx, 100);
  assert.strictEqual(spans[0].start.causes.length, 2);
});

test('findBreaks : un polygone qui s\'ouvre est détecté par ses bouts ouverts', () => {
  const ctx = {
    relHistory: [{
      type: 'relation', id: 100, version: 1, timestamp: T('2020-01-01'), user: 'u', changeset: 1,
      tags: { type: 'multipolygon' },
      members: [1, 2, 3].map(r => ({ type: 'way', ref: r, role: 'outer' })),
    }],
    wayHistories: {
      1: [wv(1, 1, T('2020-01-01'), [10, 11])],
      2: [wv(2, 1, T('2020-01-01'), [11, 12])],
      3: [wv(3, 1, T('2020-01-01'), [12, 10]), wv(3, 2, T('2024-01-01'), [12, 99], { user: 'dave' })],
    },
    currentWays: {},
  };
  const spans = findBreaks(ctx, 100);
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].start.causes[0].user, 'dave');
});

test('timeline donne l\'état de continuité après chaque événement, dans l\'ordre du temps', () => {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11]));
  const tl = timeline(ctx, 100);
  assert.deepStrictEqual(tl.map(p => p.broken), [false, true]);
  assert.ok(tl[0].date < tl[1].date);
});

const { borderWayRefs } = require('../src/forensic.js');
const { analyzeContinuity } = require('../src/continuity.js');

test('borderWayRefs : les chemins de part et d\'autre de chaque trou', () => {
  const snap = { elements: [
    { type: 'way', id: 1, nodes: [10, 11] }, { type: 'way', id: 2, nodes: [11, 12] }, { type: 'way', id: 3, nodes: [30, 31] },
    { type: 'relation', id: 100, tags: { type: 'route' }, members: [1, 2, 3].map(r => ({ type: 'way', ref: r, role: '' })) },
  ] };
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(borderWayRefs(snap, 100, res).sort(), [2, 3]);
});

test('borderWayRefs : pour un polygone, les chemins qui portent un bout ouvert', () => {
  const snap = { elements: [
    { type: 'way', id: 1, nodes: [10, 11] }, { type: 'way', id: 2, nodes: [11, 12] },
    { type: 'relation', id: 100, tags: { type: 'multipolygon' }, members: [1, 2].map(r => ({ type: 'way', ref: r, role: 'outer' })) },
  ] };
  const res = analyzeContinuity(snap, 100);
  assert.deepStrictEqual(borderWayRefs(snap, 100, res).sort(), [1, 2]);
});

test('borderWayRefs : aucun trou, aucun chemin', () => {
  const snap = { elements: [
    { type: 'way', id: 1, nodes: [10, 11] }, { type: 'way', id: 2, nodes: [11, 12] },
    { type: 'relation', id: 100, tags: { type: 'route' }, members: [1, 2].map(r => ({ type: 'way', ref: r, role: '' })) },
  ] };
  assert.deepStrictEqual(borderWayRefs(snap, 100, analyzeContinuity(snap, 100)), []);
});

const { changesetIds } = require('../src/forensic.js');

test('changesetIds : numéros uniques des débuts et fins de rupture', () => {
  const c = (cs) => ({ changeset: cs });
  const spans = [
    { start: { causes: [c(5), c(6), c(5)] }, end: { causes: [c(7)] } },
    { start: { causes: [c(6)] }, end: null },
  ];
  assert.deepStrictEqual(changesetIds(spans).sort(), [5, 6, 7]);
});

test('changesetIds : aucune période, aucun numéro', () => {
  assert.deepStrictEqual(changesetIds([]), []);
});

const { wayIdsToLoad } = require('../src/forensic.js');

const rvm = (version, ts, refs) => ({ type: 'relation', id: 100, version, timestamp: ts, tags: {},
  members: refs.map(r => (typeof r === 'object' ? r : { type: 'way', ref: r, role: '' })) });

test('wayIdsToLoad : d\'abord les chemins membres à la date demandée, puis ceux des autres versions', () => {
  const ctx = { relHistory: [rvm(1, T('2020-01-01'), [1, 2]), rvm(2, T('2022-01-01'), [3, 4])], wayHistories: {} };
  assert.deepStrictEqual(wayIdsToLoad(ctx, T('2021-01-01')), [1, 2, 3, 4]);
  assert.deepStrictEqual(wayIdsToLoad(ctx, T('2023-01-01')), [3, 4, 1, 2]);
});

test('wayIdsToLoad : ignore les chemins dont l\'historique est déjà chargé', () => {
  const ctx = { relHistory: [rvm(1, T('2020-01-01'), [1, 2, 3])], wayHistories: { 2: [] } };
  assert.deepStrictEqual(wayIdsToLoad(ctx, T('2021-01-01')), [1, 3]);
});

test('wayIdsToLoad : pas de doublon, et seuls les chemins comptent', () => {
  const ctx = { relHistory: [
    rvm(1, T('2020-01-01'), [1, { type: 'node', ref: 77, role: 'stop' }, { type: 'relation', ref: 9, role: '' }]),
    rvm(2, T('2021-01-01'), [1, 1, 2]),
  ], wayHistories: {} };
  assert.deepStrictEqual(wayIdsToLoad(ctx, T('2022-01-01')), [1, 2]);
});

test('wayIdsToLoad : avant la création de la relation, tout vient des versions connues', () => {
  const ctx = { relHistory: [rvm(1, T('2020-01-01'), [5])], wayHistories: {} };
  assert.deepStrictEqual(wayIdsToLoad(ctx, T('2019-01-01')), [5]);
});

test('timeline : un événement sur un chemin qui n\'est pas membre à cette date ne change pas le statut', () => {
  const ctx = base();
  ctx.wayHistories[99] = [wv(99, 1, T('2021-01-01'), [500, 501]), wv(99, 2, T('2021-06-01'), [600, 601])];
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11]));
  const tl = timeline(ctx, 100);
  assert.deepStrictEqual(tl.map(p => p.broken), [false, false, false, true]);
  assert.strictEqual(tl[1].date, T('2021-01-01'));
});

const { timelineAsync, spansOf } = require('../src/forensic.js');

function brokenCtx() {
  const ctx = base();
  ctx.wayHistories[1].push(wv(1, 2, T('2022-03-01'), [10, 11], { user: 'bob' }));
  ctx.wayHistories[1].push(wv(1, 3, T('2023-05-01'), [10, 11, 12], { user: 'alice' }));
  ctx.wayHistories[2].push(wv(2, 2, T('2024-01-01'), [40, 41], { user: 'dave' }));
  return ctx;
}

test('spansOf à partir de la timeline donne les mêmes périodes que findBreaks', () => {
  const ctx = brokenCtx();
  assert.deepStrictEqual(spansOf(timeline(ctx, 100)), findBreaks(ctx, 100));
});

test('timelineAsync donne exactement la même timeline que timeline', async () => {
  const ctx = brokenCtx();
  assert.deepStrictEqual(await timelineAsync(ctx, 100, { chunk: 1 }), timeline(ctx, 100));
});

test('timelineAsync signale sa progression, par tranches, jusqu\'à la fin', async () => {
  const ctx = brokenCtx();
  const seen = [];
  await timelineAsync(ctx, 100, { chunk: 2, onProgress: (done, total) => seen.push([done, total]) });
  assert.ok(seen.length >= 2);
  assert.deepStrictEqual(seen[seen.length - 1][0], seen[seen.length - 1][1]);
  assert.ok(seen.every((p, i) => i === 0 || p[0] > seen[i - 1][0]));
});

test('un préfixe de la timeline donne les périodes comme si la date de fin était plus tôt', () => {
  const ctx = brokenCtx();
  const points = timeline(ctx, 100);
  const upTo = points.filter(p => p.date <= T('2022-06-01'));
  const spans = spansOf(upTo);
  assert.strictEqual(spans.length, 1);
  assert.strictEqual(spans[0].end, null);
  assert.deepStrictEqual(spansOf(points.filter(p => p.date <= T('2023-06-01')))[0].end.causes[0].user, 'alice');
});

test('stateAt conserve les tags des chemins (rond-point), historique ou état actuel', () => {
  const ctx = base();
  ctx.wayHistories[1] = [wv(1, 1, T('2020-01-01'), [10, 11, 10], { tags: { junction: 'roundabout' } })];
  delete ctx.wayHistories[2];
  ctx.currentWays[2] = { nodes: [12, 13], tags: { highway: 'path' } };
  const snap = stateAt(T('2020-06-01'), ctx, 100);
  assert.strictEqual(snap.elements.find(e => e.id === 1).tags.junction, 'roundabout');
  assert.strictEqual(snap.elements.find(e => e.id === 2).tags.highway, 'path');
});

test('spansOf(points, "mixed") : les membres mélangés (problème d\'ordre sans trou) forment leur propre période (ticket 20)', () => {
  const ctx = {
    relHistory: [rv(100, 1, T('2020-01-01'), [1, 2, 3]), rv(100, 2, T('2021-01-01'), [1, 3, 2]), rv(100, 3, T('2022-01-01'), [1, 2, 3])],
    wayHistories: {
      1: [wv(1, 1, T('2020-01-01'), [10, 11, 12])],
      2: [wv(2, 1, T('2020-01-01'), [12, 13, 14])],
      3: [wv(3, 1, T('2020-01-01'), [14, 15, 16])],
    },
    currentWays: {},
  };
  const points = timeline(ctx, 100);
  assert.deepStrictEqual(points.map(p => p.mixed), [false, true, false]);
  assert.strictEqual(spansOf(points).length, 0, 'pas un trou');
  const mixed = spansOf(points, 'mixed');
  assert.strictEqual(mixed.length, 1);
  assert.strictEqual(mixed[0].start.date, T('2021-01-01'));
  assert.strictEqual(mixed[0].start.causes[0].type, 'relation');
  assert.strictEqual(mixed[0].end.date, T('2022-01-01'));
});
