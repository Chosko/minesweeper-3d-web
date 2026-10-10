import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoardIdentity, boardKey } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createSeededSource } from '../js/generation/random.js';
import {
  createRecordsModel,
  compactSummary,
  rebuildRecords,
  emptyRecords,
} from '../js/records/model.js';

const square = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });

const BEGINNER = square(9, 9, 10);
const BEGINNER_NG = square(9, 9, 10, true);
const INTERMEDIATE = square(16, 16, 40);
const EXPERT = square(30, 16, 99);
const CUSTOM_A = square(20, 12, 50);
const CUSTOM_B = square(8, 8, 5);

const clicksOf = (reveal, wasted = 0, flag = 0) => ({
  reveal: { effective: reveal, wasted },
  flag: { effective: flag, wasted: 0 },
  chord: { effective: 0, wasted: 0 },
});

let nextId = 1;
let clock = Date.parse('2026-10-01T00:00:00.000Z');

// A summary through the real builder. `outcome` won / lost / abandoned; `ms` elapsed time;
// `bbbv` and `solved` the 3BV pair; `clicks` the reveal count (efficiency = 100 × solved / clicks).
function game({ board = BEGINNER, outcome = 'won', ms = 10000, bbbv = 20, solved, clicks = 20, id } = {}) {
  const bbbvSolved = solved ?? (outcome === 'won' ? bbbv : Math.max(0, bbbv - 5));
  const engine = { bbbv, bbbvSolved, clicks: clicksOf(clicks) };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  clock += 60000;
  return buildSummary({
    engine, elapsedMs: ms, board, seed: 7, generatorVersion: 1,
    endedAt: new Date(clock), id: id ?? `g-${nextId++}`,
  });
}

// ---------- bests ----------

test('bests: three per board, from won games only, each holding the summary id, value and date', () => {
  const m = createRecordsModel();
  m.record(game({ outcome: 'lost', ms: 1000 }));
  m.record(game({ outcome: 'abandoned', ms: 500 }));
  assert.deepEqual(m.bests(BEGINNER), { time: null, bbbvPerSecond: null, efficiency: null });
  const won = game({ ms: 8000, bbbv: 20, clicks: 25 });
  m.record(won);
  assert.deepEqual(m.bests(BEGINNER), {
    time: { id: won.id, value: 8000, endedAt: won.endedAt },
    bbbvPerSecond: { id: won.id, value: 2.5, endedAt: won.endedAt },
    efficiency: { id: won.id, value: 80, endedAt: won.endedAt },
  });
});

test('bests: each stat is replaced only when strictly better, independently of the others', () => {
  const m = createRecordsModel();
  const first = game({ ms: 10000, bbbv: 20, clicks: 20 }); // 2 3BV/s, 100 %
  m.record(first);
  const faster = game({ ms: 9000, bbbv: 9, clicks: 18 }); // 1 3BV/s, 50 %
  m.record(faster);
  const b = m.bests(BEGINNER);
  assert.equal(b.time.id, faster.id);
  assert.equal(b.bbbvPerSecond.id, first.id);
  assert.equal(b.efficiency.id, first.id);
});

test('bests: a tie keeps the earlier holder', () => {
  const m = createRecordsModel();
  const first = game({ ms: 10000, bbbv: 20, clicks: 20 });
  const tie = game({ ms: 10000, bbbv: 20, clicks: 20 });
  m.record(first);
  m.record(tie);
  const b = m.bests(BEGINNER);
  assert.equal(b.time.id, first.id);
  assert.equal(b.bbbvPerSecond.id, first.id);
  assert.equal(b.efficiency.id, first.id);
});

test('bests: a stat that is not available never becomes a best', () => {
  const m = createRecordsModel();
  const instant = game({ ms: 0, bbbv: 1, clicks: 1 }); // 3BV/s not available
  m.record(instant);
  const b = m.bests(BEGINNER);
  assert.equal(b.time.value, 0);
  assert.equal(b.bbbvPerSecond, null);
  assert.equal(b.efficiency.value, 100);
});

test('bests: every exact board keeps its own', () => {
  const m = createRecordsModel();
  m.record(game({ board: BEGINNER, ms: 5000 }));
  m.record(game({ board: BEGINNER_NG, ms: 7000 }));
  assert.equal(m.bests(BEGINNER).time.value, 5000);
  assert.equal(m.bests(BEGINNER_NG).time.value, 7000);
  assert.deepEqual(m.bests(EXPERT), { time: null, bbbvPerSecond: null, efficiency: null });
});

// ---------- counters ----------

test('counters: games, wins and streaks per board; a loss or an abandoned game ends the streak', () => {
  const m = createRecordsModel();
  const seq = ['won', 'won', 'lost', 'won', 'won', 'won', 'abandoned', 'won'];
  const expected = [
    [1, 1, 1, 1], [2, 2, 2, 2], [3, 2, 0, 2], [4, 3, 1, 2], [5, 4, 2, 2], [6, 5, 3, 3], [7, 5, 0, 3], [8, 6, 1, 3],
  ];
  seq.forEach((outcome, i) => {
    m.record(game({ outcome }));
    const [games, wins, currentStreak, longestStreak] = expected[i];
    assert.deepEqual(m.counters(BEGINNER), { games, wins, currentStreak, longestStreak }, `after game ${i + 1}`);
  });
});

test('counters: Classic 2D overall counts every board, its streak across boards', () => {
  const m = createRecordsModel();
  m.record(game({ board: BEGINNER }));
  m.record(game({ board: EXPERT }));
  m.record(game({ board: CUSTOM_A, outcome: 'lost' }));
  m.record(game({ board: BEGINNER }));
  assert.deepEqual(m.overall(), { games: 4, wins: 3, currentStreak: 1, longestStreak: 2 });
  assert.deepEqual(m.counters(BEGINNER), { games: 2, wins: 2, currentStreak: 2, longestStreak: 2 });
  assert.deepEqual(m.counters(EXPERT), { games: 1, wins: 1, currentStreak: 1, longestStreak: 1 });
});

test('counters: a board never played has zero counters and no win rate', () => {
  const m = createRecordsModel();
  assert.deepEqual(m.counters(EXPERT), { games: 0, wins: 0, currentStreak: 0, longestStreak: 0 });
  assert.equal(m.winRate(EXPERT), null);
  assert.deepEqual(m.overall(), { games: 0, wins: 0, currentStreak: 0, longestStreak: 0 });
  assert.equal(m.overallWinRate(), null);
});

test('win rate: derived from games and wins, never stored', () => {
  const m = createRecordsModel();
  for (const outcome of ['won', 'lost', 'won', 'abandoned']) m.record(game({ outcome }));
  m.record(game({ board: EXPERT, outcome: 'won' }));
  assert.equal(m.winRate(BEGINNER), 0.5);
  assert.equal(m.winRate(EXPERT), 1);
  assert.equal(m.overallWinRate(), 0.6);
  assert.doesNotMatch(JSON.stringify(m.documents()), /winRate|rate/i);
});

// ---------- history ----------

test('history: every summary in play order, in compact form', () => {
  const m = createRecordsModel();
  const a = game({ board: BEGINNER, outcome: 'won' });
  const b = game({ board: EXPERT, outcome: 'lost' });
  const c = game({ board: BEGINNER, outcome: 'abandoned' });
  for (const s of [a, b, c]) m.record(s);
  const all = m.documents().history;
  assert.deepEqual(all.map((h) => h.id), [a.id, b.id, c.id]);
  assert.deepEqual(all[1], {
    id: b.id,
    boardKey: boardKey(EXPERT),
    outcome: 'lost',
    elapsedMs: b.elapsedMs,
    bbbv: b.bbbv,
    bbbvSolved: b.bbbvSolved,
    clicks: b.clicks,
    endedAt: b.endedAt,
  });
  assert.deepEqual(all[1], compactSummary(b));
  assert.deepEqual(m.history(BEGINNER).map((h) => h.id), [a.id, c.id]);
  assert.deepEqual(m.history(CUSTOM_A), []);
});

test('history: the compact form is plain data that survives a JSON round trip', () => {
  const s = game();
  const c = compactSummary(s);
  assert.deepEqual(JSON.parse(JSON.stringify(c)), c);
  assert.deepEqual(Object.keys(c).sort(),
    ['bbbv', 'bbbvSolved', 'boardKey', 'clicks', 'elapsedMs', 'endedAt', 'id', 'outcome']);
});

// ---------- comparison ----------

test('comparison: against the bests that stood before this game, with the difference and new-best mark', () => {
  const m = createRecordsModel();
  const first = m.record(game({ ms: 10000, bbbv: 20, clicks: 20 })); // 2 3BV/s, 100 %
  assert.deepEqual(first.time, { best: null, value: 10000, difference: null, newBest: true });
  assert.equal(first.bbbvPerSecond.newBest, true);
  assert.equal(first.efficiency.newBest, true);

  const holder = m.bests(BEGINNER);
  const second = m.record(game({ ms: 8000, bbbv: 20, clicks: 40 })); // 2.5 3BV/s, 50 %
  assert.deepEqual(second.time, { best: holder.time, value: 8000, difference: -2000, newBest: true });
  assert.deepEqual(second.bbbvPerSecond, { best: holder.bbbvPerSecond, value: 2.5, difference: 0.5, newBest: true });
  assert.deepEqual(second.efficiency, { best: holder.efficiency, value: 50, difference: -50, newBest: false });
});

test('comparison: a tie is no new best; a lost or abandoned game sets none and has no value', () => {
  const m = createRecordsModel();
  m.record(game({ ms: 10000 }));
  const tie = m.record(game({ ms: 10000 }));
  assert.equal(tie.time.difference, 0);
  assert.equal(tie.time.newBest, false);
  for (const outcome of ['lost', 'abandoned']) {
    const c = m.record(game({ outcome, ms: 1 }));
    for (const stat of ['time', 'bbbvPerSecond', 'efficiency']) {
      assert.equal(c[stat].value, null);
      assert.equal(c[stat].difference, null);
      assert.equal(c[stat].newBest, false);
      assert.notEqual(c[stat].best, null);
    }
  }
});

test('record: the same summary id twice is a no-op returning the original comparison', () => {
  const m = createRecordsModel();
  m.record(game({ ms: 10000 }));
  const s = game({ ms: 9000 });
  const original = m.record(s);
  m.record(game({ ms: 5000 }));
  const before = JSON.stringify(m.documents());
  assert.deepEqual(m.record(s), original);
  assert.deepEqual(m.record({ ...s, elapsedMs: 1 }), original);
  assert.equal(JSON.stringify(m.documents()), before);

  // Also after a reload from the stored documents alone.
  const reloaded = createRecordsModel(JSON.parse(before));
  assert.deepEqual(reloaded.record(s), original);
  assert.equal(JSON.stringify(reloaded.documents()), before);
});

test('record: a summary that is not a recordable summary throws a range error', () => {
  const m = createRecordsModel();
  const s = game();
  const bads = [
    null, {}, { ...s, id: '' }, { ...s, outcome: 'drawn' }, { ...s, board: { ...s.board, mines: -1 } },
    { ...s, elapsedMs: undefined }, { ...s, elapsedMs: -1 }, { ...s, elapsedMs: 1.5 }, { ...s, bbbv: 'x' },
    { ...s, bbbvSolved: s.bbbv + 1 }, { ...s, clicks: undefined }, { ...s, clicks: { ...s.clicks, chord: null } },
    { ...s, clicks: { ...s.clicks, flag: { effective: -1, wasted: 0 } } }, { ...s, endedAt: 'yesterday' },
  ];
  for (const bad of bads) assert.throws(() => m.record(bad), RangeError, JSON.stringify(bad));
  assert.deepEqual(m.documents(), { records: emptyRecords(), history: [] });
  assert.deepEqual(m.boardsPlayed(), []);
});

// ---------- rebuild ----------

test('rebuild: bests and counters rebuilt from the history alone equal the incremental ones', () => {
  const rnd = createSeededSource(20261009);
  const boards = [BEGINNER, BEGINNER_NG, INTERMEDIATE, EXPERT, CUSTOM_A, CUSTOM_B];
  const outcomes = ['won', 'won', 'lost', 'abandoned'];
  const m = createRecordsModel();
  for (let i = 0; i < 400; i++) {
    const bbbv = 1 + rnd.int(50);
    m.record(game({
      board: boards[rnd.int(boards.length)],
      outcome: outcomes[rnd.int(outcomes.length)],
      ms: rnd.int(5) === 0 ? 1000 * (1 + rnd.int(3)) : rnd.int(200000),
      bbbv,
      clicks: bbbv + rnd.int(30),
    }));
  }
  const docs = m.documents();
  assert.deepEqual(rebuildRecords(docs.history), docs.records);
  const rebuilt = createRecordsModel({ history: docs.history });
  assert.deepEqual(rebuilt.documents(), docs);
  assert.ok(docs.records.boards[boardKey(EXPERT)].counters.games > 0);
});

test('rebuild: an empty history gives empty records', () => {
  assert.deepEqual(rebuildRecords([]), emptyRecords());
  assert.deepEqual(createRecordsModel().documents(), { records: emptyRecords(), history: [] });
});

test('documents: plain, serialisable, and the board record carries its identity', () => {
  const m = createRecordsModel();
  m.record(game({ board: CUSTOM_A }));
  const docs = m.documents();
  assert.deepEqual(JSON.parse(JSON.stringify(docs)), docs);
  assert.deepEqual(docs.records.boards[boardKey(CUSTOM_A)].board, { ...CUSTOM_A });
  assert.deepEqual(Object.keys(docs.records.overall), ['classic-2d', '3d']);
});

// ---------- queries ----------

test('boards played: standard boards first in their order, then custom boards by last played', () => {
  const m = createRecordsModel();
  const order = [CUSTOM_B, EXPERT, CUSTOM_A, BEGINNER_NG, INTERMEDIATE, BEGINNER, CUSTOM_B];
  for (const board of order) m.record(game({ board }));
  assert.deepEqual(m.boardsPlayed().map((b) => b.key), [
    boardKey(BEGINNER), boardKey(BEGINNER_NG), boardKey(INTERMEDIATE), boardKey(EXPERT),
    boardKey(CUSTOM_B), boardKey(CUSTOM_A),
  ]);
  assert.deepEqual(m.boardsPlayed()[4].board, { ...CUSTOM_B });
});

test('queries: a board is named by its identity or its key alike', () => {
  const m = createRecordsModel();
  m.record(game({ board: EXPERT }));
  const key = boardKey(EXPERT);
  assert.deepEqual(m.bests(key), m.bests(EXPERT));
  assert.deepEqual(m.counters(key), m.counters(EXPERT));
  assert.equal(m.winRate(key), m.winRate(EXPERT));
  assert.deepEqual(m.history(key), m.history(EXPERT));
});

test('queries: results are copies, so a caller cannot change the records', () => {
  const m = createRecordsModel();
  m.record(game());
  m.bests(BEGINNER).time.value = -1;
  m.counters(BEGINNER).games = 99;
  m.history(BEGINNER)[0].elapsedMs = -1;
  m.documents().records.overall['classic-2d'].wins = 99;
  assert.equal(m.bests(BEGINNER).time.value, 10000);
  assert.equal(m.counters(BEGINNER).games, 1);
  assert.equal(m.history(BEGINNER)[0].elapsedMs, 10000);
  assert.equal(m.overall().wins, 1);
});

test('module: DOM-free and storage-free', () => {
  const src = readFileSync(new URL('../js/records/model.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|navigator|localStorage|indexedDB)\b/);
  assert.doesNotMatch(src, /from '\.\.\/(platform|logic)/);
});
