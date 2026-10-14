// Records stats (js/records/stats.js): the one ranking of a board's won games by each best stat and
// its tie rule, the rank the results flow reads from it, the Top 10, the averages over the last 10,
// 50 and all won games, the last-50 win rate, the period and outcome filters and the best time's
// steps. Pure functions over history entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOP_SIZE, RECENT_GAMES, AVERAGE_WINDOWS, PERIODS, OUTCOME_FILTERS, statValue, rankedGames, gameRank, topGames, averages, recentWinRate,
  periodStart, filterHistory, bestTimeSteps,
} from '../js/records/stats.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { bbbvPerSecond, efficiency } from '../js/records/summary.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const clicks = (n, wasted = 0) => ({ reveal: { effective: n, wasted }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
let n = 0;
const at = (i) => new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString();
/** A compact history entry, as the records model keeps it. */
const entry = (over = {}) => {
  const outcome = over.outcome ?? 'won';
  const id = over.id ?? `e${++n}`;
  return {
    id, boardKey: boardKey(BEGINNER), outcome, elapsedMs: 40000, pauses: 0, pausedMs: 0, bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 5,
    clicks: clicks(25), endedAt: at(n), ...over,
  };
};

// ---------------------------------------------------------------- ranking

test('the ranking orders won games by time ascending, 3BV/s and efficiency descending', () => {
  const a = entry({ elapsedMs: 50000, clicks: clicks(40) });
  const b = entry({ elapsedMs: 30000, clicks: clicks(25) });
  const c = entry({ elapsedMs: 40000, clicks: clicks(20) });
  const lost = entry({ outcome: 'lost', elapsedMs: 1000 });
  const history = [a, b, lost, c];
  assert.deepEqual(rankedGames(history, 'time').map((e) => e.id), [b.id, c.id, a.id], 'lower time first; a loss never ranks');
  assert.deepEqual(rankedGames(history, 'bbbvPerSecond').map((e) => e.id), [b.id, c.id, a.id]);
  assert.deepEqual(rankedGames(history, 'efficiency').map((e) => e.id), [c.id, b.id, a.id], '100%, 80%, 50%');
  assert.throws(() => rankedGames(history, 'clicks'), RangeError);
});

test('a tie goes to the earlier game, and a game whose stat is null is left out of that ranking', () => {
  const first = entry({ elapsedMs: 40000 });
  const second = entry({ elapsedMs: 40000 });
  const instant = entry({ elapsedMs: 0, clicks: clicks(0) });
  const history = [first, second, instant];
  assert.deepEqual(rankedGames(history, 'time').map((e) => e.id), [instant.id, first.id, second.id]);
  assert.deepEqual(rankedGames(history, 'bbbvPerSecond').map((e) => e.id), [first.id, second.id], 'no time: no 3BV/s');
  assert.deepEqual(rankedGames(history, 'efficiency').map((e) => e.id), [first.id, second.id], 'no click: no efficiency');
  assert.equal(statValue(instant, 'bbbvPerSecond'), null);
  assert.equal(statValue(first, 'time'), 40000);
});

test("rank 1 by each stat is the game holding that best in the records", () => {
  const model = createRecordsModel();
  const games = [
    { elapsedMs: 50000, clicks: clicks(20) }, { elapsedMs: 30000, clicks: clicks(40) }, { elapsedMs: 30000, clicks: clicks(25) },
    { elapsedMs: 35000, clicks: clicks(20) }, { outcome: 'lost', elapsedMs: 9000 },
  ].map((over, i) => {
    const outcome = over.outcome ?? 'won';
    const s = { id: `r${i}`, board: { ...BEGINNER }, outcome, clicks: clicks(25), bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 5, seed: 1, generatorVersion: 1, endedAt: at(i), ...over };
    return { ...s, bbbvPerSecond: bbbvPerSecond(s), efficiency: efficiency(s) };
  });
  for (const g of games) model.record(g);
  const history = model.history(BEGINNER);
  const bests = model.bests(BEGINNER);
  for (const stat of ['time', 'bbbvPerSecond', 'efficiency']) assert.equal(rankedGames(history, stat)[0].id, bests[stat].id, stat);
});

test("the rank of a game is its place by time among the board's won games, this one included", () => {
  const history = [entry({ id: 'h1', elapsedMs: 52000 }), entry({ id: 'h2', elapsedMs: 47380 }), entry({ id: 'h3', outcome: 'lost', elapsedMs: 9000 }),
    entry({ id: 'h4', elapsedMs: 41000 }), entry({ id: 'g1', elapsedMs: 47380 })];
  assert.deepEqual(gameRank(history, history[4]), { position: 3, of: 4 }, 'the tie ranks the earlier h2 first');
  assert.deepEqual(gameRank(history, entry({ id: 'g9', elapsedMs: 30000 })), { position: 1, of: 5 }, 'a game missing from the history counts itself');
  assert.equal(gameRank(history, history[2]), null, 'a loss does not rank');
  assert.equal(gameRank(null, history[0]), null);
  const top = topGames(history, 'time');
  assert.equal(top.findIndex((e) => e.id === 'g1') + 1, gameRank(history, history[4]).position, 'the results rank and the Top 10 by time agree');
});

test('the results flow reads its rank from the shared ranking and keeps no rule of its own', () => {
  const src = read('js/results/flow.js');
  assert.match(src, /import \{[^}]*gameRank[^}]*\} from '\.\.\/records\/stats\.js'/);
  assert.doesNotMatch(src, /elapsedMs <=/, 'no second copy of the rank rule');
});

test('the Top 10 is the first ten of the ranking; fewer games show them all', () => {
  const history = Array.from({ length: 14 }, (_, i) => entry({ elapsedMs: 60000 - i * 1000 }));
  const top = topGames(history, 'time');
  assert.equal(TOP_SIZE, 10);
  assert.equal(top.length, 10);
  assert.deepEqual(top.map((e) => e.elapsedMs), Array.from({ length: 10 }, (_, i) => 47000 + i * 1000));
  assert.equal(topGames(history.slice(0, 3), 'time').length, 3);
  assert.deepEqual(topGames([entry({ outcome: 'lost' })], 'time'), []);
});

// ---------------------------------------------------------------- averages and win rate

test('the averages are the means over the last 10, last 50 and all won games', () => {
  const history = [];
  for (let i = 0; i < 60; i++) {
    history.push(entry({ elapsedMs: 10000 * (1 + (i % 4)), clicks: clicks(20 + (i % 2) * 20) }));
    if (i % 5 === 0) history.push(entry({ outcome: 'lost', elapsedMs: 1000 }));
  }
  const avg = averages(history);
  const won = history.filter((e) => e.outcome === 'won');
  const meanOf = (list, f) => list.reduce((a, e) => a + f(e), 0) / list.length;
  assert.equal(avg.won, 60);
  assert.deepEqual(avg.columns, [{ key: 'last10', size: 10, count: 10 }, { key: 'last50', size: 50, count: 50 }, { key: 'all', size: null, count: 60 }]);
  for (const [i, list] of [won.slice(-10), won.slice(-50), won].entries()) {
    assert.equal(avg.rows.time[i], meanOf(list, (e) => e.elapsedMs), 'time, lost games left out');
    assert.ok(Math.abs(avg.rows.bbbvPerSecond[i] - meanOf(list, bbbvPerSecond)) < 1e-12);
    assert.ok(Math.abs(avg.rows.efficiency[i] - meanOf(list, efficiency)) < 1e-12);
  }
  assert.deepEqual(AVERAGE_WINDOWS.map((w) => w.key), ['last10', 'last50', 'all']);
});

test('a short window averages what there is and says how many; no won game gives nulls', () => {
  const short = averages([entry({ elapsedMs: 20000 }), entry({ outcome: 'lost' }), entry({ elapsedMs: 40000 })]);
  assert.deepEqual(short.columns.map((c) => c.count), [2, 2, 2]);
  assert.deepEqual(short.rows.time, [30000, 30000, 30000]);
  const none = averages([entry({ outcome: 'lost' }), entry({ outcome: 'abandoned' })]);
  assert.equal(none.won, 0);
  assert.deepEqual(none.rows, { time: [null, null, null], bbbvPerSecond: [null, null, null], efficiency: [null, null, null] });
  const instant = averages([entry({ elapsedMs: 0, clicks: clicks(0) }), entry({ elapsedMs: 20000 })]);
  assert.equal(instant.rows.bbbvPerSecond[2], 1, 'a null stat is left out of its mean');
});

test('the recent win rate counts every outcome over the last 50 games, with the completed games beside it', () => {
  const history = [];
  for (let i = 0; i < 70; i++) history.push(entry({ outcome: i < 20 ? 'lost' : ['won', 'lost', 'abandoned', 'won', 'won'][i % 5] }));
  const r = recentWinRate(history);
  assert.equal(RECENT_GAMES, 50);
  const last = history.slice(-50);
  const wins = last.filter((e) => e.outcome === 'won').length;
  const completed = last.filter((e) => e.outcome !== 'abandoned').length;
  assert.deepEqual(r, { games: 50, wins, completed, winRate: wins / 50, completedWinRate: wins / completed });
  assert.deepEqual(recentWinRate([]), { games: 0, wins: 0, completed: 0, winRate: null, completedWinRate: null });
  assert.equal(recentWinRate([entry({ outcome: 'abandoned' })]).completedWinRate, null);
});

// ---------------------------------------------------------------- filters

test('the period filter keeps the games that ended within 12 months, 30 days or 7 days of now', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  const ago = (days) => entry({ endedAt: new Date(now.getTime() - days * 86400000).toISOString() });
  const history = [ago(400), ago(200), ago(20), ago(3), ago(0)];
  const ids = (list) => list.map((e) => history.indexOf(e));
  assert.deepEqual(PERIODS.map((p) => p.label), ['All time', '12 months', '30 days', '7 days']);
  assert.deepEqual(ids(filterHistory(history, { period: 'all' }, now)), [0, 1, 2, 3, 4]);
  assert.deepEqual(ids(filterHistory(history, { period: '12m' }, now)), [1, 2, 3, 4]);
  assert.deepEqual(ids(filterHistory(history, { period: '30d' }, now)), [2, 3, 4]);
  assert.deepEqual(ids(filterHistory(history, { period: '7d' }, now)), [3, 4]);
  assert.equal(periodStart('all', now), -Infinity);
  assert.equal(periodStart('7d', now), now.getTime() - 7 * 86400000);
  assert.deepEqual(ids(filterHistory(history, { period: 'nonsense' }, now)), [0, 1, 2, 3, 4], 'an unknown period keeps everything');
});

test('the outcome filter keeps one outcome, or every one under All, and combines with the period', () => {
  const now = new Date('2026-10-14T12:00:00.000Z');
  const old = '2025-01-01T00:00:00.000Z';
  const history = [entry({ outcome: 'won' }), entry({ outcome: 'lost' }), entry({ outcome: 'abandoned' }), entry({ outcome: 'won', endedAt: old })];
  assert.deepEqual(OUTCOME_FILTERS.map((o) => o.label), ['All', 'Won', 'Lost', 'Abandoned']);
  assert.equal(filterHistory(history, { outcome: 'all' }, now).length, 4);
  assert.deepEqual(filterHistory(history, { outcome: 'won' }, now).map((e) => e.outcome), ['won', 'won']);
  assert.deepEqual(filterHistory(history, { outcome: 'lost' }, now).map((e) => e.outcome), ['lost']);
  assert.deepEqual(filterHistory(history, { outcome: 'abandoned' }, now).map((e) => e.outcome), ['abandoned']);
  assert.equal(filterHistory(history, { outcome: 'won', period: '30d' }, now).length, 1, 'the October win is 13 days old, the 2025 one out');
  assert.equal(filterHistory(history, { period: '7d' }, now).length, 0);
});

// ---------------------------------------------------------------- best time steps

test("the best time's steps are the won games that set a new standing best, in play order", () => {
  const history = [
    entry({ id: 'a', elapsedMs: 50000 }), entry({ id: 'b', outcome: 'lost', elapsedMs: 1000 }), entry({ id: 'c', elapsedMs: 55000 }),
    entry({ id: 'd', elapsedMs: 42000 }), entry({ id: 'e', elapsedMs: 42000 }), entry({ id: 'f', elapsedMs: 39000 }),
  ];
  const steps = bestTimeSteps(history);
  assert.deepEqual(steps.map((s) => s.id), ['a', 'd', 'f'], 'a loss and a slower game never step; a tie keeps the earlier best');
  assert.deepEqual(steps.map((s) => s.elapsedMs), [50000, 42000, 39000]);
  assert.equal(steps[1].endedAt, history[3].endedAt);
  assert.deepEqual(bestTimeSteps([entry({ outcome: 'lost' })]), []);
});

test('the stats module is pure: no DOM and no storage', () => {
  const src = read('js/records/stats.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b|localStorage|storage\./);
  const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['./summary.js']);
});
