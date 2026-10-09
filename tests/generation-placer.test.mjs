import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSeededSource } from '../js/generation/random.js';
import { placeMines, GENERATOR_VERSION } from '../js/generation/placer.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { cellGraphFromLists } from '../js/engine/graph.js';
import { createGame, PHASE } from '../js/engine/rules.js';

// ---------- seeded source ----------

test('source: a known seed yields pinned first outputs', () => {
  const s = createSeededSource(12345);
  const out = Array.from({ length: 6 }, () => s.next());
  assert.deepEqual(out, [4207900869, 1317490944, 2079646450, 3513001552, 2187978186, 1492380277]);
  for (const v of out) assert.ok(Number.isInteger(v) && v >= 0 && v <= 0xffffffff);
});

test('source: the same seed repeats, different seeds differ', () => {
  const a = createSeededSource(7), b = createSeededSource(7), c = createSeededSource(8);
  const ra = Array.from({ length: 20 }, () => a.next());
  const rb = Array.from({ length: 20 }, () => b.next());
  const rc = Array.from({ length: 20 }, () => c.next());
  assert.deepEqual(ra, rb);
  assert.notDeepEqual(ra, rc);
});

test('source: accepts the full 32-bit seed range, rejects anything else', () => {
  assert.doesNotThrow(() => createSeededSource(0));
  assert.doesNotThrow(() => createSeededSource(0xffffffff));
  for (const bad of [-1, 2 ** 32, 1.5, NaN, '3', undefined, null]) {
    assert.throws(() => createSeededSource(bad), RangeError, String(bad));
  }
});

test('source: int(n) stays in range and covers it', () => {
  const s = createSeededSource(99);
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const v = s.int(7);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 7);
    seen.add(v);
  }
  assert.equal(seen.size, 7);
  assert.equal(s.int(1), 0);
  for (const bad of [0, -1, 1.5, 2 ** 32 + 1, NaN]) assert.throws(() => s.int(bad), RangeError, String(bad));
});

test('source: never reads Math.random', () => {
  const saved = Math.random;
  Math.random = () => { throw new Error('Math.random was read'); };
  try {
    const s = createSeededSource(1);
    for (let i = 0; i < 100; i++) { s.next(); s.int(13); }
    placeMines({ graph: createSquareGrid(9, 9).graph, mineCount: 10, firstClick: 40, source: createSeededSource(1) });
  } finally {
    Math.random = saved;
  }
});

// ---------- placer ----------

const expert = () => createSquareGrid(30, 16);

test('placer: returns the requested number of distinct in-range cells, ascending, never the first click', () => {
  const grid = createSquareGrid(9, 9);
  const mines = placeMines({ graph: grid.graph, mineCount: 10, firstClick: 40, source: createSeededSource(3) });
  assert.ok(mines instanceof Int32Array);
  assert.equal(mines.length, 10);
  assert.equal(new Set(mines).size, 10);
  for (let i = 0; i < mines.length; i++) {
    assert.ok(mines[i] >= 0 && mines[i] < 81);
    if (i > 0) assert.ok(mines[i] > mines[i - 1]);
  }
  assert.ok(!mines.includes(40));
});

test('placer: determinism — same request and version, same mine set; pinned Expert board', () => {
  const req = () => ({ graph: expert().graph, mineCount: 99, firstClick: expert().index(15, 8), source: createSeededSource(20261009) });
  const a = placeMines(req()), b = placeMines(req());
  assert.deepEqual(Array.from(a), Array.from(b));
  assert.equal(GENERATOR_VERSION, 1);
  assert.deepEqual(Array.from(a), PINNED_EXPERT);
});

test('placer: different seeds give different boards', () => {
  const g = expert().graph;
  const a = placeMines({ graph: g, mineCount: 99, firstClick: 0, source: createSeededSource(1) });
  const b = placeMines({ graph: g, mineCount: 99, firstClick: 0, source: createSeededSource(2) });
  assert.notDeepEqual(Array.from(a), Array.from(b));
});

test('placer: over many seeds every cell but the first click holds a mine, neighbours included', () => {
  const grid = createSquareGrid(5, 5);
  for (const first of [grid.index(2, 2), grid.index(0, 0)]) {
    const hits = new Uint32Array(25);
    const runs = 3000;
    for (let seed = 0; seed < runs; seed++) {
      const mines = placeMines({ graph: grid.graph, mineCount: 4, firstClick: first, source: createSeededSource(seed) });
      for (const m of mines) hits[m]++;
    }
    assert.equal(hits[first], 0, 'the first-click cell never holds a mine');
    const expected = (runs * 4) / 24;
    for (let c = 0; c < 25; c++) {
      if (c === first) continue;
      assert.ok(hits[c] > 0, `cell ${c} never held a mine`);
      assert.ok(Math.abs(hits[c] - expected) < expected * 0.2, `cell ${c}: ${hits[c]} hits, expected ~${expected}`);
    }
    for (const n of grid.graph.neighbours(first)) assert.ok(hits[n] > 0, `neighbour ${n} of the first click never held a mine`);
  }
});

test('placer: the densest legal board fills every cell but the first click', () => {
  const grid = createSquareGrid(4, 3);
  const mines = placeMines({ graph: grid.graph, mineCount: 11, firstClick: 5, source: createSeededSource(4) });
  assert.deepEqual(Array.from(mines), [0, 1, 2, 3, 4, 6, 7, 8, 9, 10, 11]);
  assert.equal(placeMines({ graph: grid.graph, mineCount: 0, firstClick: 5, source: createSeededSource(4) }).length, 0);
});

test('placer: an impossible request is rejected at once with a reason', () => {
  const grid = createSquareGrid(4, 3);
  assert.throws(
    () => placeMines({ graph: grid.graph, mineCount: 12, firstClick: 0, source: createSeededSource(1) }),
    (e) => e instanceof RangeError && /12 mines/.test(e.message) && /11/.test(e.message),
  );
});

test('placer: malformed requests are rejected', () => {
  const g = createSquareGrid(4, 3).graph;
  const src = () => createSeededSource(1);
  assert.throws(() => placeMines({ mineCount: 1, firstClick: 0, source: src() }), RangeError);
  assert.throws(() => placeMines({ graph: g, mineCount: -1, firstClick: 0, source: src() }), RangeError);
  assert.throws(() => placeMines({ graph: g, mineCount: 1.5, firstClick: 0, source: src() }), RangeError);
  assert.throws(() => placeMines({ graph: g, mineCount: 1, firstClick: 12, source: src() }), RangeError);
  assert.throws(() => placeMines({ graph: g, mineCount: 1, firstClick: -1, source: src() }), RangeError);
  assert.throws(() => placeMines({ graph: g, mineCount: 1, firstClick: 0 }), RangeError);
});

test('placer: works over a non-square graph', () => {
  const g = cellGraphFromLists(6, [[1], [0, 2], [1, 3], [2, 4], [3, 5], [4]]);
  const mines = placeMines({ graph: g, mineCount: 3, firstClick: 2, source: createSeededSource(5) });
  assert.equal(mines.length, 3);
  assert.ok(!mines.includes(2));
});

test('placer: the mine set is accepted by the rules engine as the first-click board', () => {
  const grid = expert();
  const game = createGame({ graph: grid.graph, profile: 'minesweeper-online', mineCount: 99 });
  const first = grid.index(3, 3);
  assert.equal(game.reveal(first).boardNeeded, first);
  const mines = placeMines({ graph: grid.graph, mineCount: 99, firstClick: first, source: createSeededSource(42) });
  game.supplyBoard(first, mines);
  assert.equal(game.phase === PHASE.PLAYING || game.phase === PHASE.WON, true);
});

test('generation modules state the version-bump rule and stay DOM-free', () => {
  const placer = readFileSync(new URL('../js/generation/placer.js', import.meta.url), 'utf8');
  const random = readFileSync(new URL('../js/generation/random.js', import.meta.url), 'utf8');
  assert.match(placer, /GENERATOR_VERSION/);
  assert.match(random, /GENERATOR_VERSION/);
  for (const src of [placer, random]) {
    assert.doesNotMatch(src, /\b(document|window|Math\.random)\b/);
    assert.doesNotMatch(src, /from ['"].*logic\.js['"]/);
  }
});

// Expert (30 × 16, 99 mines), first click (15, 8), seed 20261009, generator version 1.
const PINNED_EXPERT = [
  5, 6, 9, 13, 18, 23, 24, 27, 37, 38, 44, 47, 52, 59, 70, 72,
  74, 89, 92, 94, 96, 98, 99, 103, 107, 108, 118, 120, 123, 125, 127, 128,
  137, 138, 143, 144, 145, 170, 172, 175, 192, 193, 194, 197, 200, 207, 210, 215,
  217, 223, 237, 240, 241, 270, 275, 281, 289, 291, 299, 305, 311, 316, 320, 321,
  329, 332, 337, 347, 349, 351, 355, 363, 368, 375, 376, 383, 388, 392, 400, 402,
  411, 412, 415, 416, 418, 419, 428, 430, 432, 434, 437, 442, 457, 462, 468, 469,
  471, 473, 477,
];
