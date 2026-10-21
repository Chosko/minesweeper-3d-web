import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHexGrid } from '../js/engine/hex-grid.js';
import { createGame, createGameWithMines, PHASE, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { placeMines } from '../js/generation/placer.js';
import { createSeededSource } from '../js/generation/random.js';

const REF = REFERENCE_PROFILE;
const nb = (graph, i) => Array.from(graph.neighbours(i));

// Reference adjacency written from the geometry, independent of the provider: flat-top hexagons in
// columns, odd columns half a tile lower ("odd-q" offset). Each tile goes to cube coordinates and
// its neighbours are the tiles at cube distance 1 — the tiles that share a side.
function cube(col, row) {
  const x = col, z = row - (col - (col & 1)) / 2;
  return [x, -x - z, z];
}
function naive(width, height, c) {
  const col = c % width, row = (c - col) / width;
  const [x, y, z] = cube(col, row);
  const out = [];
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const [a, b, d] = cube(q, r);
      if (Math.max(Math.abs(a - x), Math.abs(b - y), Math.abs(d - z)) === 1) out.push(q + width * r);
    }
  }
  return out;
}

// ---------- construction ----------

test('hex: an impossible size throws RangeError', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, '3', null, undefined]) {
    assert.throws(() => createHexGrid(bad, 3), RangeError, `width = ${bad}`);
    assert.throws(() => createHexGrid(3, bad), RangeError, `height = ${bad}`);
  }
});

test('hex: frozen, with width, height and the cell count', () => {
  const grid = createHexGrid(5, 4);
  assert.ok(Object.isFrozen(grid));
  assert.ok(Object.isFrozen(grid.graph));
  assert.equal(grid.width, 5);
  assert.equal(grid.height, 4);
  assert.equal(grid.graph.count, 20);
  assert.equal(createHexGrid(1, 1).graph.count, 1);
  assert.equal(createHexGrid(1, 1).graph.edgeCount, 0);
});

// ---------- index layout ----------

test('hex: index = column + width × row, as on the square grid, and colRow round-trips', () => {
  const grid = createHexGrid(5, 4);
  for (let row = 0, i = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++, i++) {
      assert.equal(grid.index(col, row), i);
      assert.deepEqual(grid.colRow(i), [col, row]);
    }
  }
  for (const [c, r] of [[-1, 0], [5, 0], [0, -1], [0, 4], [1.5, 0], [0, '1']]) {
    assert.throws(() => grid.index(c, r), RangeError, `(${c}, ${r})`);
  }
  for (const bad of [-1, 20, 2.5, NaN]) assert.throws(() => grid.colRow(bad), RangeError, String(bad));
});

// ---------- neighbourhoods ----------

test('hex: neighbourhoods pinned — interior, edges and corners of even and odd columns', () => {
  // 5 × 4: columns 0, 2, 4 even, 1, 3 odd (half a tile lower); the right edge is an even column.
  const g = createHexGrid(5, 4).graph;
  const pinned = {
    7: [1, 2, 3, 6, 8, 12], // (2, 1) even interior: the row above at the sides
    6: [1, 5, 7, 10, 11, 12], // (1, 1) odd interior: the row below at the sides
    8: [3, 7, 9, 12, 13, 14], // (3, 1) odd interior
    0: [1, 5], // (0, 0) even top-left corner
    4: [3, 9], // (4, 0) even top-right corner
    15: [10, 11, 16], // (0, 3) even bottom-left corner
    19: [13, 14, 18], // (4, 3) even bottom-right corner
    1: [0, 2, 5, 6, 7], // (1, 0) odd top edge
    2: [1, 3, 7], // (2, 0) even top edge
    16: [11, 15, 17], // (1, 3) odd bottom edge
    17: [11, 12, 13, 16, 18], // (2, 3) even bottom edge
    5: [0, 1, 6, 10], // (0, 1) even left edge
    9: [3, 4, 8, 14], // (4, 1) even right edge
  };
  for (const [c, list] of Object.entries(pinned)) assert.deepEqual(nb(g, Number(c)), list, `cell ${c}`);

  // 4 × 3: the right edge is an odd column.
  const h = createHexGrid(4, 3).graph;
  assert.deepEqual(nb(h, 3), [2, 6, 7], '(3, 0) odd top-right corner');
  assert.deepEqual(nb(h, 7), [3, 6, 10, 11], '(3, 1) odd right edge');
  assert.deepEqual(nb(h, 11), [7, 10], '(3, 2) odd bottom-right corner');
  assert.deepEqual(nb(h, 8), [4, 5, 9], '(0, 2) even bottom-left corner');
});

test('hex: a tile\'s neighbours are the tiles sharing a side, every list ascending, the graph symmetric', () => {
  for (const [w, h] of [[1, 1], [1, 6], [6, 1], [2, 2], [3, 3], [4, 3], [5, 4], [9, 9], [16, 16], [30, 16], [7, 12]]) {
    const g = createHexGrid(w, h).graph;
    let edges = 0;
    for (let c = 0; c < g.count; c++) {
      const list = nb(g, c);
      assert.deepEqual(list, naive(w, h, c), `${w} × ${h}, cell ${c}`);
      for (let k = 1; k < list.length; k++) assert.ok(list[k] > list[k - 1], `${w} × ${h}, cell ${c} ascending`);
      for (const n of list) assert.ok(nb(g, n).includes(c), `${w} × ${h}: ${c} ↔ ${n}`);
      assert.ok(list.length <= 6);
      edges += list.length;
    }
    assert.equal(g.edgeCount, edges);
  }
  assert.equal(createHexGrid(9, 9).graph.maxDegree, 6);
});

test('hex: a single row or column is a chain', () => {
  const row = createHexGrid(5, 1).graph;
  const col = createHexGrid(1, 5).graph;
  for (const g of [row, col]) {
    assert.deepEqual(nb(g, 0), [1]);
    assert.deepEqual(nb(g, 2), [1, 3]);
    assert.deepEqual(nb(g, 4), [3]);
  }
});

test('hex: the provider is DOM-free and builds on the cell graph', () => {
  const src = readFileSync(new URL('../js/engine/hex-grid.js', import.meta.url), 'utf8');
  for (const name of ['document', 'window', 'Math.random']) assert.equal(src.includes(name), false, name);
  assert.match(src, /from '\.\/graph\.js'/);
});

// ---------- the reference profile on a hexagon board ----------

// 4 × 3 hexagon board, one mine at (1, 1) — cell 5, an odd-column interior tile.
//   cells   0  1  2  3      neighbours of 5: 1 4 6 8 9 10 — each a 1
//           4  5  6  7      zeros: 0 alone; 2 3 7 11 together (two openings)
//           8  9 10 11      isolated numbers (no zero beside them): 8, 9
// On the square grid 7 and 11 would touch 6 and 10 diagonally and the counts would differ; here
// 6 is a 1 (it touches 5) and 7 a 0 (it does not).
function hexBoard(mines = [5]) {
  const grid = createHexGrid(4, 3);
  const game = createGameWithMines({ graph: grid.graph, profile: REF, mines, dimensions: { width: 4, height: 3 } });
  return { grid, game };
}
const sorted = (changed) => Array.from(changed).sort((a, b) => a - b);

test('hex rules: reveal opens a number alone and flood-fills a zero to its numbered rim', () => {
  const { game } = hexBoard();
  let r = game.reveal(9);
  assert.deepEqual(sorted(r.changed), [9]);
  assert.equal(game.cellNumber(9), 1);
  r = game.reveal(0);
  assert.deepEqual(sorted(r.changed), [0, 1, 4]);
  r = game.reveal(3);
  assert.deepEqual(sorted(r.changed), [2, 3, 6, 7, 10, 11]);
  assert.equal(game.cellNumber(6), 1);
  assert.equal(game.cellNumber(7), 0);
  assert.equal(game.cellNumber(10), 1);
  assert.equal(game.phase, PHASE.PLAYING);
  r = game.reveal(8);
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.WON);
});

test('hex rules: flag toggles a closed tile, never a revealed one; revealing the mine loses', () => {
  const { game } = hexBoard();
  game.reveal(0);
  let r = game.toggleFlag(5);
  assert.deepEqual(sorted(r.changed), [5]);
  assert.equal(game.cellState(5), CELL.FLAGGED);
  assert.equal(game.minesLeft, 0);
  r = game.toggleFlag(1);
  assert.equal(r.changed.length, 0);
  assert.equal(game.cellState(1), CELL.REVEALED);
  game.toggleFlag(5);
  r = game.reveal(5);
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.LOST);
  assert.equal(game.explodedCell, 5);
});

test('hex rules: chord opens the unflagged closed neighbours on a matching flag count, through a wrong flag too', () => {
  {
    const { game } = hexBoard();
    game.reveal(0); // opens 0 1 4
    game.toggleFlag(5);
    assert.deepEqual(sorted(game.chord(4).changed), [8]); // 4's neighbours: 0 1 5 8
    game.reveal(3); // opens 2 3 6 7 10 11
    const r = game.chord(10); // 10's neighbours: 5 6 7 9 11
    assert.deepEqual(sorted(r.changed), [9]);
    assert.equal(r.ended, true);
    assert.equal(game.phase, PHASE.WON);
  }
  {
    const { game } = hexBoard();
    game.reveal(0);
    game.toggleFlag(8); // wrong flag: 4's count matches, so the chord opens the mine
    const r = game.chord(4);
    assert.equal(r.ended, true);
    assert.equal(game.phase, PHASE.LOST);
    assert.equal(game.explodedCell, 5);
    assert.equal(game.cellState(8), CELL.WRONG_FLAG);
  }
  {
    const { game } = hexBoard();
    game.reveal(0);
    assert.equal(game.chord(4).changed.length, 0, 'no flag beside a 1: nothing opens');
  }
});

test('hex rules: the first click is safe — the board is asked for at that tile, a mine may sit beside it', () => {
  const grid = createHexGrid(4, 3);
  const game = createGame({ graph: grid.graph, profile: REF, mineCount: 1 });
  assert.equal(game.reveal(5).boardNeeded, 5);
  assert.equal(game.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.throws(() => game.supplyBoard(5, [5]), RangeError);
  const r = game.supplyBoard(5, [1]);
  assert.deepEqual(sorted(r.changed), [5]);
  assert.equal(game.cellNumber(5), 1);

  // the densest legal board: every tile but the first click, which the placer never mines
  for (let seed = 1; seed <= 20; seed++) {
    const g = createGame({ graph: grid.graph, profile: REF, mineCount: 11 });
    const first = seed % 12;
    g.reveal(first);
    const mines = placeMines({ graph: grid.graph, mineCount: 11, firstClick: first, source: createSeededSource(seed) });
    assert.equal(mines.includes(first), false);
    g.supplyBoard(first, mines);
    assert.equal(g.phase, PHASE.WON, `seed ${seed}`);
    assert.equal(g.cellNumber(first), grid.graph.degree(first));
  }
});

test('hex rules: 3BV counts each opening once and each isolated number once', () => {
  const { game } = hexBoard();
  assert.equal(game.counts().bbbv, 4); // openings {0}, {2 3 7 11}; isolated 8, 9
  assert.equal(game.counts().bbbvSolved, 0);
  game.reveal(0);
  assert.equal(game.counts().bbbvSolved, 1);
  game.reveal(9);
  assert.equal(game.counts().bbbvSolved, 2);
  game.reveal(3);
  game.reveal(8);
  assert.equal(game.phase, PHASE.WON);
  assert.deepEqual([game.summary().bbbv, game.counts().bbbvSolved], [4, 4]);
});

test('hex rules: click counting — effective and wasted reveals, flags and chords', () => {
  const { game } = hexBoard();
  game.reveal(0); // effective
  game.reveal(0); // already open: wasted
  game.toggleFlag(5); // effective flag
  game.toggleFlag(1); // a revealed tile: no click at all
  game.chord(4); // opens 8: effective
  game.chord(9); // a closed tile: wasted
  assert.deepEqual(game.counts().clicks, {
    reveal: { effective: 1, wasted: 1 },
    flag: { effective: 1, wasted: 0 },
    chord: { effective: 1, wasted: 1 },
  });
});
