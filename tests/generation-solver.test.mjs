import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solve, solveFrom } from '../js/generation/solver.js';
import { createSeededSource } from '../js/generation/random.js';
import { placeMines } from '../js/generation/placer.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { cellGraphFromLists } from '../js/engine/graph.js';

// A board from row strings: '*' a mine, 'o' the first-click cell, '.' a safe cell.
function board(rows) {
  const grid = createSquareGrid(rows[0].length, rows.length);
  const mines = [];
  let first = -1;
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '*') mines.push(grid.index(x, y));
    if (ch === 'o') first = grid.index(x, y);
  }));
  return { grid, graph: grid.graph, mines, first };
}

const cells = (grid, list) => list.map(([x, y]) => grid.index(x, y)).sort((a, b) => a - b);

function popcount(x) {
  let k = 0;
  for (x >>>= 0; x; x &= x - 1) k++;
  return k;
}

// Exhaustive reference for tiny boards (at most 30 cells): keeps every mine set consistent
// with what is open (and, with useCount, with the mine count), opens every cell that is a mine
// in none of them, until nothing more opens. Independent of the solver's staged reasoning.
function oracle(graph, mines, starts, useCount = true) {
  const n = graph.count;
  const nb = Array.from({ length: n }, (_, c) => graph.neighbours(c).reduce((m, d) => (m | (1 << d)) >>> 0, 0));
  const truth = mines.reduce((m, c) => (m | (1 << c)) >>> 0, 0);
  const free = [];
  for (let c = 0; c < n; c++) if (!starts.includes(c)) free.push(c);
  let configs = [];
  if (useCount) {
    const pick = (i, left, m) => {
      if (left === 0) { configs.push(m >>> 0); return; }
      if (free.length - i < left) return;
      pick(i + 1, left - 1, m | (1 << free[i]));
      pick(i + 1, left, m);
    };
    pick(0, mines.length, 0);
  } else {
    for (let s = 0; s < 1 << free.length; s++) {
      let m = 0;
      for (let i = 0; i < free.length; i++) if ((s >>> i) & 1) m |= 1 << free[i];
      configs.push(m >>> 0);
    }
  }
  const opened = new Set();
  const openCell = (c) => {
    opened.add(c);
    const k = popcount(truth & nb[c]);
    configs = configs.filter((m) => !((m >>> c) & 1) && popcount(m & nb[c]) === k);
  };
  for (const s of starts) openCell(s);
  for (;;) {
    let union = 0;
    for (const m of configs) union |= m;
    const next = [];
    for (let c = 0; c < n; c++) if (!opened.has(c) && !((union >>> c) & 1)) next.push(c);
    if (!next.length) break;
    for (const c of next) openCell(c);
  }
  let inter = -1;
  for (const m of configs) inter &= m;
  const cleared = opened.size === n - mines.length;
  const unresolved = [];
  if (!cleared) for (let c = 0; c < n; c++) if (!opened.has(c) && !((inter >>> c) & 1)) unresolved.push(c);
  return { cleared, unresolved };
}

// ---------- hand-built boards with known answers ----------

test('solver: a board solvable by single-cell rules alone clears with no other stage', () => {
  const b = board([
    'o....',
    '.....',
    '***..',
    '.....',
  ]);
  const r = solve({ graph: b.graph, mines: b.mines, firstClick: b.first });
  assert.equal(r.cleared, true);
  assert.deepEqual(Array.from(r.unresolved), []);
  assert.equal(r.deductions.subset, 0);
  assert.equal(r.deductions.global, 0);
  assert.ok(r.deductions.single > 0);
});

test('solver: a board needing subset reasoning (the 1-2-1 wall) clears through the subset stage', () => {
  const b = board([
    '.*.*.',
    '.....',
    '..o..',
  ]);
  const r = solve({ graph: b.graph, mines: b.mines, firstClick: b.first });
  assert.equal(r.cleared, true);
  assert.ok(r.deductions.subset > 0, 'single-cell rules stall on the wall');
  assert.equal(r.deductions.global, 0);
});

test('solver: a board needing the remaining-mine count clears through the global stage', () => {
  const b = board([
    '....',
    '..**',
    '..o.',
    '..*.',
  ]);
  const r = solve({ graph: b.graph, mines: b.mines, firstClick: b.first });
  assert.equal(r.cleared, true);
  assert.ok(r.deductions.global > 0);
  assert.equal(oracle(b.graph, b.mines, [b.first], false).cleared, false, 'without the mine count it needs a guess');
});

test('solver: a board needing exactly one guess stops, and one guess clears the rest', () => {
  const b = board([
    '....*',
    'o..*.',
    '..*..',
    '.*...',
  ]);
  const r = solve({ graph: b.graph, mines: b.mines, firstClick: b.first });
  assert.equal(r.cleared, false);
  assert.deepEqual(Array.from(r.unresolved), cells(b.grid, [[3, 0], [4, 0], [3, 1], [4, 1], [4, 2], [0, 3], [1, 3], [3, 3], [4, 3]]));
  assert.equal(oracle(b.graph, b.mines, [b.first, b.grid.index(3, 0)]).cleared, true, 'guessing (3, 0) leaves no further guess');
});

test('solver: a board needing a guess only at the end resolves everything but the last pair', () => {
  const b = board([
    '.....',
    '**...',
    '.....',
    '*...o',
  ]);
  const r = solve({ graph: b.graph, mines: b.mines, firstClick: b.first });
  assert.equal(r.cleared, false);
  assert.deepEqual(Array.from(r.unresolved), cells(b.grid, [[0, 2], [0, 3]]));
});

// ---------- against the exhaustive reference ----------

test('solver: agrees with the exhaustive reference on random small square boards', () => {
  let checked = 0, clearedCount = 0;
  for (const [w, h, m] of [[4, 4, 3], [5, 4, 4], [5, 5, 5], [6, 4, 6]]) {
    const grid = createSquareGrid(w, h);
    for (let seed = 0; seed < 150; seed++) {
      const first = createSeededSource(seed + 1000).int(w * h);
      const mines = Array.from(placeMines({ graph: grid.graph, mineCount: m, firstClick: first, source: createSeededSource(seed) }));
      const r = solve({ graph: grid.graph, mines, firstClick: first });
      const o = oracle(grid.graph, mines, [first]);
      assert.equal(r.cleared, o.cleared, `${w}x${h} seed ${seed}`);
      assert.deepEqual(Array.from(r.unresolved), o.unresolved, `${w}x${h} seed ${seed}`);
      checked++;
      clearedCount += r.cleared;
    }
  }
  assert.ok(clearedCount > 0 && clearedCount < checked, 'the sample holds solvable and guess-needing boards');
});

test('solver: works over a non-square graph (a 4 × 4 torus) and agrees with the reference', () => {
  const lists = [];
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    const l = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx || dy) l.push(((x + dx + 4) % 4) + 4 * ((y + dy + 4) % 4));
    }
    lists.push(l);
  }
  const graph = cellGraphFromLists(16, lists);
  for (let seed = 0; seed < 200; seed++) {
    const first = seed % 16;
    const mines = Array.from(placeMines({ graph, mineCount: 3, firstClick: first, source: createSeededSource(seed) }));
    const r = solve({ graph, mines, firstClick: first });
    const o = oracle(graph, mines, [first]);
    assert.equal(r.cleared, o.cleared, `seed ${seed}`);
    assert.deepEqual(Array.from(r.unresolved), o.unresolved, `seed ${seed}`);
  }
  const line = cellGraphFromLists(5, [[1], [0, 2], [1, 3], [2, 4], [3]]);
  assert.equal(solve({ graph: line, mines: [4], firstClick: 0 }).cleared, true);
});

// ---------- never reads a mine ----------

test('solver: learns the board only through open(), on deduced-safe cells, each once', () => {
  const grid = createSquareGrid(30, 16);
  for (let seed = 0; seed < 40; seed++) {
    const first = grid.index(seed % 30, seed % 16);
    const mines = placeMines({ graph: grid.graph, mineCount: 99, firstClick: first, source: createSeededSource(seed) });
    const isMine = new Uint8Array(grid.graph.count);
    for (const m of mines) isMine[m] = 1;
    const seen = new Set();
    const open = (c) => {
      assert.equal(isMine[c], 0, `seed ${seed}: opened mine ${c}`);
      assert.ok(!seen.has(c), `seed ${seed}: opened ${c} twice`);
      seen.add(c);
      let k = 0;
      grid.graph.forEachNeighbour(c, (d) => { k += isMine[d]; });
      return k;
    };
    const r = solveFrom({ graph: grid.graph, mineCount: 99, firstClick: first, open });
    assert.deepEqual(r, solve({ graph: grid.graph, mines, firstClick: first }));
    assert.equal(r.cleared, seen.size === grid.graph.count - 99);
    for (const c of r.unresolved) assert.ok(!seen.has(c));
  }
});

test('solver: a group over its enumeration budget only loses deductions, never makes a wrong one', () => {
  for (const [w, h, m] of [[5, 4, 4], [5, 5, 5]]) {
    const grid = createSquareGrid(w, h);
    for (let seed = 0; seed < 150; seed++) {
      const first = createSeededSource(seed + 2000).int(w * h);
      const mines = placeMines({ graph: grid.graph, mineCount: m, firstClick: first, source: createSeededSource(seed) });
      const isMine = new Uint8Array(w * h);
      for (const c of mines) isMine[c] = 1;
      const open = (c) => {
        assert.equal(isMine[c], 0, `${w}x${h} seed ${seed}: opened mine ${c}`);
        let k = 0;
        grid.graph.forEachNeighbour(c, (d) => { k += isMine[d]; });
        return k;
      };
      const starved = solveFrom({ graph: grid.graph, mineCount: m, firstClick: first, open, groupBudget: 1 });
      const full = solve({ graph: grid.graph, mines, firstClick: first });
      if (starved.cleared) assert.equal(full.cleared, true);
      for (const c of full.unresolved) assert.ok(starved.unresolved.includes(c), `${w}x${h} seed ${seed}: cell ${c}`);
    }
  }
  assert.throws(() => solveFrom({ graph: createSquareGrid(3, 3).graph, mineCount: 1, firstClick: 0, open: () => 0, groupBudget: 0 }), RangeError);
});

// ---------- requests ----------

test('solver: a board with no mines clears from any cell; malformed requests are rejected', () => {
  const g = createSquareGrid(4, 3).graph;
  assert.deepEqual(solve({ graph: g, mines: [], firstClick: 5 }).cleared, true);
  assert.throws(() => solve({ mines: [], firstClick: 0 }), RangeError);
  assert.throws(() => solve({ graph: g, firstClick: 0 }), RangeError);
  assert.throws(() => solve({ graph: g, mines: [12], firstClick: 0 }), RangeError);
  assert.throws(() => solve({ graph: g, mines: [1, 1], firstClick: 0 }), RangeError);
  assert.throws(() => solve({ graph: g, mines: [3], firstClick: 3 }), RangeError);
  assert.throws(() => solve({ graph: g, mines: [3], firstClick: 12 }), RangeError);
  assert.throws(() => solveFrom({ graph: g, mineCount: 1, firstClick: 0 }), RangeError);
  assert.throws(() => solveFrom({ graph: g, mineCount: 12, firstClick: 0, open: () => 0 }), RangeError);
});

// ---------- speed ----------

test('solver: an Expert board is solved well within a second', () => {
  const grid = createSquareGrid(30, 16);
  let worst = 0;
  for (let seed = 0; seed < 50; seed++) {
    const first = grid.index(15, 8);
    const mines = placeMines({ graph: grid.graph, mineCount: 99, firstClick: first, source: createSeededSource(seed) });
    const t = performance.now();
    solve({ graph: grid.graph, mines, firstClick: first });
    worst = Math.max(worst, performance.now() - t);
  }
  assert.ok(worst < 500, `slowest Expert solve took ${worst.toFixed(1)} ms`);
});

test('solver module is DOM-free and never reads platform randomness', () => {
  const src = readFileSync(new URL('../js/generation/solver.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|Math\.random)\b/);
  assert.doesNotMatch(src, /from ['"].*logic\.js['"]/);
});
