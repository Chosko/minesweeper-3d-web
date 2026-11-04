import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTriGrid } from '../js/engine/tri-grid.js';
import { createGame, createGameWithMines, PHASE, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { placeMines } from '../js/generation/placer.js';
import { createSeededSource } from '../js/generation/random.js';

const REF = REFERENCE_PROFILE;
const nb = (graph, i) => Array.from(graph.neighbours(i));

// Reference adjacency written from the geometry, independent of the provider. In units of half a
// side across and one triangle height down, the tile at (col, row) has its corners at
//   up   (col + row even) — (col, row) at the tip, (col - 1, row + 1) and (col + 1, row + 1) on the base
//   down (col + row odd)  — (col - 1, row) and (col + 1, row) on the base, (col, row + 1) at the tip
// and its neighbours are the tiles sharing at least one corner with it.
function corners(col, row) {
  return (col + row) % 2 === 0
    ? [[col, row], [col - 1, row + 1], [col + 1, row + 1]]
    : [[col - 1, row], [col + 1, row], [col, row + 1]];
}
function naive(width, height, c) {
  const col = c % width, row = (c - col) / width;
  const mine = new Set(corners(col, row).map(([x, y]) => `${x},${y}`));
  const out = [];
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      if (q === col && r === row) continue;
      if (corners(q, r).some(([x, y]) => mine.has(`${x},${y}`))) out.push(q + width * r);
    }
  }
  return out;
}

// ---------- construction ----------

test('tri: an impossible size throws RangeError', () => {
  for (const bad of [0, -1, 1.5, NaN, Infinity, '3', null, undefined]) {
    assert.throws(() => createTriGrid(bad, 3), RangeError, `width = ${bad}`);
    assert.throws(() => createTriGrid(3, bad), RangeError, `height = ${bad}`);
  }
});

test('tri: frozen, with width, height and the cell count', () => {
  const grid = createTriGrid(7, 4);
  assert.ok(Object.isFrozen(grid));
  assert.ok(Object.isFrozen(grid.graph));
  assert.equal(grid.width, 7);
  assert.equal(grid.height, 4);
  assert.equal(grid.graph.count, 28);
  assert.equal(createTriGrid(1, 1).graph.count, 1);
  assert.equal(createTriGrid(1, 1).graph.edgeCount, 0);
});

// ---------- index layout and orientation ----------

test('tri: index = column + width × row, as on the square grid, and colRow round-trips', () => {
  const grid = createTriGrid(5, 4);
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

test('tri: a tile points up when column + row is even — the top-left tile up, alternating along rows and down columns', () => {
  const grid = createTriGrid(5, 4);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      assert.equal(grid.orientation(grid.index(col, row)), (col + row) % 2 === 0 ? 'up' : 'down', `(${col}, ${row})`);
    }
  }
  assert.equal(grid.orientation(0), 'up');
  assert.equal(grid.orientation(1), 'down');
  assert.equal(grid.orientation(5), 'down');
  for (const bad of [-1, 20, 2.5, NaN]) assert.throws(() => grid.orientation(bad), RangeError, String(bad));
});

// ---------- neighbourhoods ----------

test('tri: neighbourhoods pinned — interior, edges and corners of both orientations', () => {
  // 7 × 4: row r holds cells 7r .. 7r + 6.
  const g = createTriGrid(7, 4).graph;
  const pinned = {
    // interior: 3 on the tip's side, 2 on each side in the row, 5 on the base's side
    10: [2, 3, 4, 8, 9, 11, 12, 15, 16, 17, 18, 19], // (3, 1) up
    17: [8, 9, 10, 11, 12, 15, 16, 18, 19, 23, 24, 25], // (3, 2) down
    // corners
    0: [1, 2, 7, 8, 9], // (0, 0) up
    6: [4, 5, 11, 12, 13], // (6, 0) up
    21: [14, 15, 16, 22, 23], // (0, 3) down
    27: [18, 19, 20, 25, 26], // (6, 3) down
    // top edge
    2: [0, 1, 3, 4, 7, 8, 9, 10, 11], // (2, 0) up: the base below
    3: [1, 2, 4, 5, 9, 10, 11], // (3, 0) down: the tip below
    // bottom edge
    24: [16, 17, 18, 22, 23, 25, 26], // (3, 3) up: the tip above
    23: [14, 15, 16, 17, 18, 21, 22, 24, 25], // (2, 3) down: the base above
    // left edge
    7: [0, 1, 2, 8, 9, 14, 15], // (0, 1) down
    14: [7, 8, 15, 16, 21, 22, 23], // (0, 2) up
    // right edge
    13: [4, 5, 6, 11, 12, 19, 20], // (6, 1) down
    20: [12, 13, 18, 19, 25, 26, 27], // (6, 2) up
  };
  for (const [c, list] of Object.entries(pinned)) assert.deepEqual(nb(g, Number(c)), list, `cell ${c}`);
  for (const c of [10, 17]) assert.equal(g.degree(c), 12);

  // 6 × 3: a down top-right corner and an up bottom-left corner.
  const h = createTriGrid(6, 3).graph;
  assert.deepEqual(nb(h, 5), [3, 4, 10, 11], '(5, 0) down top-right corner');
  assert.deepEqual(nb(h, 12), [6, 7, 13, 14], '(0, 2) up bottom-left corner');
  assert.deepEqual(nb(h, 17), [9, 10, 11, 15, 16], '(5, 2) down bottom-right corner');
});

test('tri: a tile\'s neighbours are the tiles sharing a side or a corner, every list ascending, the graph symmetric', () => {
  for (const [w, h] of [[1, 1], [1, 6], [6, 1], [2, 2], [3, 3], [4, 3], [5, 4], [7, 4], [13, 7], [25, 13], [41, 17], [8, 11]]) {
    const g = createTriGrid(w, h).graph;
    let edges = 0;
    for (let c = 0; c < g.count; c++) {
      const list = nb(g, c);
      assert.deepEqual(list, naive(w, h, c), `${w} × ${h}, cell ${c}`);
      for (let k = 1; k < list.length; k++) assert.ok(list[k] > list[k - 1], `${w} × ${h}, cell ${c} ascending`);
      for (const n of list) assert.ok(nb(g, n).includes(c), `${w} × ${h}: ${c} ↔ ${n}`);
      assert.ok(list.length <= 12);
      edges += list.length;
    }
    assert.equal(g.edgeCount, edges);
  }
  assert.equal(createTriGrid(13, 7).graph.maxDegree, 12);
});

test('tri: a single row reaches two tiles each way; a single column is a chain', () => {
  const row = createTriGrid(5, 1).graph;
  assert.deepEqual(nb(row, 0), [1, 2]);
  assert.deepEqual(nb(row, 2), [0, 1, 3, 4]);
  assert.deepEqual(nb(row, 4), [2, 3]);
  const col = createTriGrid(1, 5).graph;
  assert.deepEqual(nb(col, 0), [1]);
  assert.deepEqual(nb(col, 2), [1, 3]);
  assert.deepEqual(nb(col, 4), [3]);
});

test('tri: the provider is DOM-free and builds on the cell graph', () => {
  const src = readFileSync(new URL('../js/engine/tri-grid.js', import.meta.url), 'utf8');
  for (const name of ['document', 'window', 'Math.random']) assert.equal(src.includes(name), false, name);
  assert.match(src, /from '\.\/graph\.js'/);
});

// ---------- the reference profile on a triangle board ----------

// 7 × 3 triangle board, one mine at (0, 0) — cell 0, an up corner tile.
//   cells   0  1  2  3  4  5  6      neighbours of 0: 1 2 7 8 9 — each a 1
//           7  8  9 10 11 12 13      every other tile a 0, one opening holding every safe tile
//          14 15 16 17 18 19 20
// On the square grid 2 would not touch 0 and 9 would not either; here both are 1s.
function cornerBoard(mines = [0]) {
  const grid = createTriGrid(7, 3);
  const game = createGameWithMines({ graph: grid.graph, profile: REF, mines, dimensions: { width: 7, height: 3 } });
  return { grid, game };
}

// 5 × 3 triangle board where the centre tile (2, 1), cell 7, points down and touches 12 tiles:
// every tile but 7, 10 and 14. All 12 are mines, so 7 is a 12 and 10, 14 (corner tiles, each
// touching 4 of the mines) are 4s — three isolated numbers, no opening.
const TWELVE = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11, 12, 13];
function twelveBoard() {
  const grid = createTriGrid(5, 3);
  const game = createGameWithMines({ graph: grid.graph, profile: REF, mines: TWELVE, dimensions: { width: 5, height: 3 } });
  return { grid, game };
}
const sorted = (changed) => Array.from(changed).sort((a, b) => a - b);

test('tri rules: reveal opens a number alone and flood-fills a zero to its numbered rim', () => {
  const { game } = cornerBoard();
  let r = game.reveal(9);
  assert.deepEqual(sorted(r.changed), [9]);
  assert.equal(game.cellNumber(9), 1);
  assert.equal(game.cellNumber(2), -1, 'still closed');
  r = game.reveal(20);
  assert.deepEqual(sorted(r.changed), [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
  assert.equal(game.cellNumber(2), 1);
  assert.equal(game.cellNumber(3), 0);
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.WON);
});

test('tri rules: a 12 — the centre tile beside twelve mines', () => {
  const { grid, game } = twelveBoard();
  assert.equal(grid.graph.degree(7), 12);
  let r = game.reveal(7);
  assert.deepEqual(sorted(r.changed), [7]);
  assert.equal(game.cellNumber(7), 12);
  game.reveal(10);
  assert.equal(game.cellNumber(10), 4);
  r = game.reveal(14);
  assert.equal(game.cellNumber(14), 4);
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.WON);
});

test('tri rules: flag toggles a closed tile, never a revealed one; revealing the mine loses', () => {
  const { game } = cornerBoard();
  game.reveal(1);
  let r = game.toggleFlag(0);
  assert.deepEqual(sorted(r.changed), [0]);
  assert.equal(game.cellState(0), CELL.FLAGGED);
  assert.equal(game.minesLeft, 0);
  r = game.toggleFlag(1);
  assert.equal(r.changed.length, 0);
  assert.equal(game.cellState(1), CELL.REVEALED);
  game.toggleFlag(0);
  r = game.reveal(0);
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.LOST);
  assert.equal(game.explodedCell, 0);
});

test('tri rules: chord opens the unflagged closed neighbours on a matching flag count, through a wrong flag too', () => {
  {
    const { game } = cornerBoard();
    game.reveal(1); // 1 is (1, 0) down: neighbours 0 2 3 7 8 9
    game.toggleFlag(0);
    const r = game.chord(1); // opens 2 3 7 8 9; 3 is a 0 and floods the rest
    assert.deepEqual(sorted(r.changed), [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    assert.equal(r.ended, true);
    assert.equal(game.phase, PHASE.WON);
  }
  {
    const { game } = cornerBoard();
    game.reveal(1);
    game.toggleFlag(2); // wrong flag: 1's count matches, so the chord opens the mine
    const r = game.chord(1);
    assert.equal(r.ended, true);
    assert.equal(game.phase, PHASE.LOST);
    assert.equal(game.explodedCell, 0);
    assert.equal(game.cellState(2), CELL.WRONG_FLAG);
  }
  {
    const { game } = twelveBoard();
    game.reveal(7);
    for (const m of TWELVE.slice(1)) game.toggleFlag(m);
    assert.equal(game.chord(7).changed.length, 0, 'eleven flags beside a 12: nothing opens');
    game.toggleFlag(TWELVE[0]);
    assert.equal(game.chord(7).changed.length, 0, 'twelve flags, every other neighbour a mine: nothing to open');
  }
});

test('tri rules: the first click is safe — the board is asked for at that tile, twelve mines may sit beside it', () => {
  const grid = createTriGrid(5, 3);
  const game = createGame({ graph: grid.graph, profile: REF, mineCount: 12 });
  assert.equal(game.reveal(7).boardNeeded, 7);
  assert.equal(game.phase, PHASE.AWAITING_FIRST_CLICK);
  assert.throws(() => game.supplyBoard(7, [7, ...TWELVE.slice(1)]), RangeError);
  const r = game.supplyBoard(7, TWELVE);
  assert.deepEqual(sorted(r.changed), [7]);
  assert.equal(game.cellNumber(7), 12);

  // the densest legal board: every tile but the first click, which the placer never mines
  for (let seed = 1; seed <= 20; seed++) {
    const g = createGame({ graph: grid.graph, profile: REF, mineCount: 14 });
    const first = seed % 15;
    g.reveal(first);
    const mines = placeMines({ graph: grid.graph, mineCount: 14, firstClick: first, source: createSeededSource(seed) });
    assert.equal(mines.includes(first), false);
    g.supplyBoard(first, mines);
    assert.equal(g.phase, PHASE.WON, `seed ${seed}`);
    assert.equal(g.cellNumber(first), grid.graph.degree(first));
  }
});

test('tri rules: 3BV counts each opening once and each isolated number once', () => {
  {
    const { game } = cornerBoard();
    assert.equal(game.counts().bbbv, 1); // one opening holds every safe tile
    game.reveal(20);
    assert.deepEqual([game.summary().bbbv, game.counts().bbbvSolved], [1, 1]);
  }
  {
    const { game } = twelveBoard();
    assert.equal(game.counts().bbbv, 3); // isolated 7, 10, 14
    game.reveal(7);
    assert.equal(game.counts().bbbvSolved, 1);
    game.reveal(10);
    game.reveal(14);
    assert.equal(game.phase, PHASE.WON);
    assert.deepEqual([game.summary().bbbv, game.counts().bbbvSolved], [3, 3]);
  }
});

test('tri rules: click counting — effective and wasted reveals, flags and chords', () => {
  const { game } = cornerBoard();
  game.reveal(1); // effective
  game.reveal(1); // already open: wasted
  game.toggleFlag(0); // effective flag
  game.toggleFlag(1); // a revealed tile: no click at all
  game.chord(8); // a closed tile: wasted
  game.chord(1); // opens the rest: effective
  assert.deepEqual(game.counts().clicks, {
    reveal: { effective: 1, wasted: 1 },
    flag: { effective: 1, wasted: 0 },
    chord: { effective: 1, wasted: 1 },
  });
});
