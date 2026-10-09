import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGame, createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { createBoardIdentity } from '../js/records/board.js';
import {
  OUTCOMES,
  BEST_STATS,
  buildSummary,
  countedClicks,
  bbbvPerSecond,
  efficiency,
  isBestEligible,
} from '../js/records/summary.js';

const square = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });

// Hand-built square boards. `rows` are strings, '*' a mine, anything else safe.
function playing(rows) {
  const height = rows.length, width = rows[0].length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === '*') mines.push(x + width * y); }));
  const game = createGameWithMines({
    graph: grid.graph, profile: REFERENCE_PROFILE, mines, dimensions: { width, height },
  });
  return { game, at: (x, y) => grid.index(x, y), board: square(width, height, mines.length) };
}

const ENDED = new Date('2026-10-09T12:00:00.000Z');
const base = (board, engine, extra = {}) => ({
  engine, board, elapsedMs: 4000, seed: 12345, generatorVersion: 1, endedAt: ENDED, id: 'g-1', ...extra,
});

// 3 × 3 with one mine in a corner: 3BV 1 (the single opening reaches every safe number).
const ROWS = ['*..', '...', '...'];

// ---------- won, lost, abandoned ----------

test('won: the engine summary becomes a plain, serialisable record with every field', () => {
  const { game, at, board } = playing(ROWS);
  game.toggleFlag(at(0, 0));
  game.reveal(at(2, 2));
  const s = buildSummary(base(board, game.summary()));
  assert.deepEqual(s, {
    id: 'g-1',
    board: { mode: 'classic-2d', grid: 'square', width: 3, height: 3, mines: 1, noGuess: false },
    outcome: 'won',
    elapsedMs: 4000,
    bbbv: 1,
    bbbvSolved: 1,
    clicks: { reveal: { effective: 1, wasted: 0 }, flag: { effective: 1, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
    bbbvPerSecond: 0.25,
    efficiency: 50,
    seed: 12345,
    generatorVersion: 1,
    endedAt: '2026-10-09T12:00:00.000Z',
  });
  assert.deepEqual(JSON.parse(JSON.stringify(s)), s);
  assert.equal(Object.getPrototypeOf(s.clicks.reveal), Object.prototype);
});

test('lost: outcome from the engine summary, stats from 3BV solved so far', () => {
  // Two openings split by a mine column; the left one is opened, then the mine is hit.
  const { game, at, board } = playing(['..*..', '..*..', '..*..']);
  game.reveal(at(0, 0));
  game.reveal(at(2, 0));
  const engine = game.summary();
  assert.equal(engine.outcome, 'lost');
  const s = buildSummary(base(board, engine, { elapsedMs: 2000 }));
  assert.equal(s.outcome, 'lost');
  assert.equal(s.bbbv, engine.bbbv);
  assert.equal(s.bbbvSolved, engine.bbbvSolved);
  assert.ok(s.bbbvSolved < s.bbbv);
  assert.equal(s.bbbvPerSecond, s.bbbvSolved / 2);
  assert.equal(s.efficiency, (100 * s.bbbvSolved) / 2);
});

test('abandoned: a game with its first click summarised from its counts', () => {
  const grid = createSquareGrid(3, 3);
  const game = createGame({ graph: grid.graph, profile: REFERENCE_PROFILE, mineCount: 1, dimensions: { width: 3, height: 3 } });
  const first = grid.index(2, 2);
  assert.equal(game.reveal(first).boardNeeded, first);
  game.supplyBoard(first, [grid.index(1, 1)]); // opens only the clicked number
  const s = buildSummary(base(square(3, 3, 1), game.counts()));
  assert.equal(s.outcome, 'abandoned');
  assert.equal(s.bbbv, 8);
  assert.equal(s.bbbvSolved, 1);
  assert.deepEqual(s.clicks.reveal, { effective: 1, wasted: 0 });
  assert.equal(s.bbbvPerSecond, 0.25);
  assert.equal(s.efficiency, 100);
});

test('abandoned: a game left before its first click produces no summary', () => {
  const grid = createSquareGrid(3, 3);
  const game = createGame({ graph: grid.graph, profile: REFERENCE_PROFILE, mineCount: 1 });
  assert.equal(game.counts().bbbv, null);
  assert.equal(buildSummary(base(square(3, 3, 1), game.counts())), null);
});

test('outcome: a stated outcome must agree with the engine input', () => {
  const { game, at, board } = playing(ROWS);
  game.reveal(at(2, 2));
  assert.equal(buildSummary(base(board, game.summary(), { outcome: 'won' })).outcome, 'won');
  assert.throws(() => buildSummary(base(board, game.summary(), { outcome: 'lost' })), RangeError);
  const mid = playing(['..*..', '..*..', '..*..']);
  mid.game.reveal(mid.at(0, 0));
  assert.equal(buildSummary(base(mid.board, mid.game.counts(), { outcome: 'abandoned' })).outcome, 'abandoned');
  assert.throws(() => buildSummary(base(mid.board, mid.game.counts(), { outcome: 'won' })), RangeError);
  assert.deepEqual(OUTCOMES, ['won', 'lost', 'abandoned']);
});

test('id and end date: unique ids by default, end date now by default', () => {
  const { game, at, board } = playing(ROWS);
  game.reveal(at(2, 2));
  const input = base(board, game.summary(), { id: undefined, endedAt: undefined });
  const before = Date.now();
  const a = buildSummary(input);
  const b = buildSummary(input);
  assert.equal(typeof a.id, 'string');
  assert.ok(a.id.length > 0);
  assert.notEqual(a.id, b.id);
  const t = Date.parse(a.endedAt);
  assert.ok(t >= before && t <= Date.now());
});

// ---------- derived stats ----------

const record = (fields) => ({
  bbbv: 10, bbbvSolved: 10, elapsedMs: 5000, outcome: 'won',
  clicks: { reveal: { effective: 8, wasted: 1 }, flag: { effective: 2, wasted: 1 }, chord: { effective: 3, wasted: 1 } },
  ...fields,
});

test('countedClicks: every recorded click, wasted ones included', () => {
  assert.equal(countedClicks(record({}).clicks), 16);
});

test('3BV/s: 3BV solved per elapsed second', () => {
  assert.equal(bbbvPerSecond(record({})), 2);
  assert.equal(bbbvPerSecond(record({ bbbvSolved: 3, elapsedMs: 1500 })), 2);
});

test('efficiency: 3BV solved per counted click, as a percentage', () => {
  assert.equal(efficiency(record({ bbbvSolved: 8 })), 50);
});

test('zero divisors give not available, never 0 or infinity', () => {
  assert.equal(bbbvPerSecond(record({ elapsedMs: 0 })), null);
  const none = { effective: 0, wasted: 0 };
  assert.equal(efficiency(record({ bbbvSolved: 0, clicks: { reveal: none, flag: none, chord: none } })), null);
  // a zero dividend with a non-zero divisor is a real 0
  assert.equal(bbbvPerSecond(record({ bbbvSolved: 0 })), 0);
  assert.equal(efficiency(record({ bbbvSolved: 0 })), 0);
});

test('a built record carries the derived stats its own fields give', () => {
  const { game, at, board } = playing(ROWS);
  game.reveal(at(2, 2));
  const s = buildSummary(base(board, game.summary(), { elapsedMs: 0 }));
  assert.equal(s.bbbvPerSecond, null);
  assert.equal(s.bbbvPerSecond, bbbvPerSecond(s));
  assert.equal(s.efficiency, efficiency(s));
});

// ---------- best eligibility ----------

test('best eligibility: won games with the stat available only', () => {
  assert.deepEqual(BEST_STATS, ['time', 'bbbvPerSecond', 'efficiency']);
  for (const stat of BEST_STATS) {
    assert.equal(isBestEligible(record({}), stat), true, stat);
    assert.equal(isBestEligible(record({ outcome: 'lost' }), stat), false, stat);
    assert.equal(isBestEligible(record({ outcome: 'abandoned' }), stat), false, stat);
  }
  assert.equal(isBestEligible(record({ elapsedMs: 0 }), 'bbbvPerSecond'), false);
  assert.equal(isBestEligible(record({ elapsedMs: 0 }), 'time'), true);
  const none = { effective: 0, wasted: 0 };
  assert.equal(isBestEligible(record({ clicks: { reveal: none, flag: none, chord: none } }), 'efficiency'), false);
  assert.throws(() => isBestEligible(record({}), 'speed'), RangeError);
});

// ---------- invalid input ----------

test('invalid input throws a range error', () => {
  const { game, at, board } = playing(ROWS);
  game.reveal(at(2, 2));
  const won = game.summary();
  const bad = [
    { elapsedMs: -1 }, { elapsedMs: 1.5 }, { elapsedMs: NaN }, { elapsedMs: '4000' },
    { board: { mode: 'classic-2d' } },
    { board: square(3, 3, 2) }, // mine count differs from the engine's
    { board: square(9, 1, 1) }, // dimensions differ from the engine's
    { seed: -1 }, { seed: 2 ** 32 }, { seed: 1.5 },
    { generatorVersion: 0 }, { generatorVersion: '1' },
    { endedAt: new Date('nope') }, { endedAt: 'yesterday' },
    { id: '' }, { id: 7 },
    { engine: null }, { engine: { ...won, bbbvSolved: 2 } }, // more solved than the board's 3BV
    { engine: { ...won, bbbv: 9 } }, // 3BV above the safe cells
    { engine: { ...won, bbbv: 0, bbbvSolved: 0 } },
    { engine: { ...won, bbbvSolved: -1 } },
    { engine: { ...won, clicks: { reveal: { effective: -1, wasted: 0 }, flag: won.clicks.flag, chord: won.clicks.chord } } },
    { engine: { ...won, clicks: { reveal: won.clicks.reveal, flag: won.clicks.flag } } },
    { engine: { ...won, outcome: 'drawn' } },
  ];
  for (const extra of bad) {
    assert.throws(() => buildSummary(base(board, won, extra)), RangeError, JSON.stringify(extra));
  }
  // a win with 3BV left unsolved does not fit
  const lostMid = playing(['..*..', '..*..', '..*..']);
  lostMid.game.reveal(lostMid.at(0, 0));
  const counts = lostMid.game.counts();
  assert.throws(() => buildSummary(base(lostMid.board, { ...counts, outcome: 'won', dimensions: { width: 5, height: 3 }, mineCount: 3 })), RangeError);
});

test('DOM-free and independent of the 3D rules engine', () => {
  const src = readFileSync(new URL('../js/records/summary.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
  assert.doesNotMatch(src, /logic\.js/);
});
