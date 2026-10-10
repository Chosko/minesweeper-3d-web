import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { createGameWithMines, PHASE } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { placeMines } from '../js/generation/placer.js';
import { createSeededSource } from '../js/generation/random.js';
import { solve } from '../js/generation/solver.js';

const nb = (graph, i) => Array.from(graph.neighbours(i));

// Reference enumeration written from the spec: (di, dj, dk) over -1..1, di outer, dk inner,
// skipping the cell itself and anything outside the box.
function naive(X, Y, Z, c) {
  const i = c % X, j = Math.floor(c / X) % Y, k = Math.floor(c / (X * Y));
  const out = [];
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      for (let dk = -1; dk <= 1; dk++) {
        if (!di && !dj && !dk) continue;
        const a = i + di, b = j + dj, d = k + dk;
        if (a < 0 || b < 0 || d < 0 || a >= X || b >= Y || d >= Z) continue;
        out.push(a + X * (b + Y * d));
      }
    }
  }
  return out;
}

// ---------- construction ----------

test('box: dimensions are integers 1..100, anything else throws RangeError', () => {
  for (const bad of [0, -1, 101, 1.5, NaN, Infinity, '3', null, undefined]) {
    assert.throws(() => createBoxGrid(bad, 2, 2), RangeError, `X = ${bad}`);
    assert.throws(() => createBoxGrid(2, bad, 2), RangeError, `Y = ${bad}`);
    assert.throws(() => createBoxGrid(2, 2, bad), RangeError, `Z = ${bad}`);
  }
  const box = createBoxGrid(100, 1, 100);
  assert.equal(box.graph.count, 10000);
});

test('box: frozen, with X, Y, Z and the cell count', () => {
  const box = createBoxGrid(4, 3, 2);
  assert.ok(Object.isFrozen(box));
  assert.ok(Object.isFrozen(box.graph));
  assert.equal(box.X, 4);
  assert.equal(box.Y, 3);
  assert.equal(box.Z, 2);
  assert.equal(box.graph.count, 24);
});

// ---------- index layout ----------

test('box: index = i + X*(j + Y*k), i fastest, and coords round-trips', () => {
  const X = 4, Y = 3, Z = 5;
  const box = createBoxGrid(X, Y, Z);
  let expected = 0;
  for (let k = 0; k < Z; k++) {
    for (let j = 0; j < Y; j++) {
      for (let i = 0; i < X; i++, expected++) {
        assert.equal(box.index(i, j, k), expected);
        assert.equal(box.index(i, j, k), i + X * (j + Y * k));
        assert.deepEqual(box.coords(expected), [i, j, k]);
      }
    }
  }
  for (let c = 0; c < box.graph.count; c++) assert.equal(box.index(...box.coords(c)), c);
});

test('box: index and coords reject cells off the box', () => {
  const box = createBoxGrid(4, 3, 2);
  for (const args of [[-1, 0, 0], [4, 0, 0], [0, 3, 0], [0, 0, 2], [0, -1, 0], [0.5, 0, 0]]) {
    assert.throws(() => box.index(...args), RangeError, `index(${args})`);
  }
  for (const c of [-1, 24, 1.5, NaN]) assert.throws(() => box.coords(c), RangeError, `coords(${c})`);
});

// ---------- neighbour order ----------

test('box: neighbour order is pinned (di outer, dk inner) at a corner, an edge, a face and inside', () => {
  const box = createBoxGrid(4, 4, 4);
  const g = box.graph;
  // corner (0,0,0)
  assert.deepEqual(nb(g, box.index(0, 0, 0)), [16, 4, 20, 1, 17, 5, 21]);
  // edge (1,0,0)
  assert.deepEqual(nb(g, box.index(1, 0, 0)), [0, 16, 4, 20, 17, 5, 21, 2, 18, 6, 22]);
  // face (1,1,0)
  assert.deepEqual(nb(g, box.index(1, 1, 0)), [0, 16, 4, 20, 8, 24, 1, 17, 21, 9, 25, 2, 18, 6, 22, 10, 26]);
  // interior (1,2,1)
  assert.deepEqual(nb(g, box.index(1, 2, 1)), [
    4, 20, 36, 8, 24, 40, 12, 28, 44, 5, 21, 37, 9, 41, 13, 29, 45, 6, 22, 38, 10, 26, 42, 14, 30, 46,
  ]);
});

test('box: every access path agrees with the reference enumeration', () => {
  for (const [X, Y, Z] of [[4, 3, 5], [1, 1, 6], [2, 2, 2], [3, 1, 4], [5, 4, 1]]) {
    const g = createBoxGrid(X, Y, Z).graph;
    let edges = 0, maxDegree = 0;
    for (let c = 0; c < g.count; c++) {
      const want = naive(X, Y, Z, c);
      assert.deepEqual(nb(g, c), want, `${X}x${Y}x${Z} cell ${c}`);
      assert.equal(g.degree(c), want.length);
      for (let s = 0; s < want.length; s++) assert.equal(g.neighbour(c, s), want[s]);
      const seen = [];
      g.forEachNeighbour(c, (n) => seen.push(n));
      assert.deepEqual(seen, want);
      edges += want.length;
      maxDegree = Math.max(maxDegree, want.length);
    }
    assert.equal(g.edgeCount, edges, `${X}x${Y}x${Z} edgeCount`);
    assert.equal(g.maxDegree, maxDegree, `${X}x${Y}x${Z} maxDegree`);
  }
});

test('box: neighbour slot and cell index are range-checked', () => {
  const g = createBoxGrid(3, 3, 3).graph;
  assert.throws(() => g.degree(27), RangeError);
  assert.throws(() => g.degree(-1), RangeError);
  assert.throws(() => g.neighbours(1.5), RangeError);
  assert.throws(() => g.forEachNeighbour(27, () => {}), RangeError);
  assert.throws(() => g.neighbour(0, 7), RangeError);
  assert.throws(() => g.neighbour(0, -1), RangeError);
  assert.throws(() => g.neighbour(13, 26), RangeError);
});

test('box: neighbours(i) returns a copy', () => {
  const g = createBoxGrid(3, 3, 3).graph;
  const list = g.neighbours(13);
  assert.ok(list instanceof Int32Array);
  list[0] = 99;
  assert.equal(g.neighbour(13, 0), 0);
});

// ---------- counts and symmetry ----------

test('box: neighbour counts are 7 at a corner, 11 on an edge, 17 on a face, 26 inside', () => {
  const box = createBoxGrid(5, 5, 5);
  const g = box.graph;
  assert.equal(g.degree(box.index(0, 0, 0)), 7);
  assert.equal(g.degree(box.index(4, 4, 4)), 7);
  assert.equal(g.degree(box.index(2, 0, 0)), 11);
  assert.equal(g.degree(box.index(4, 2, 4)), 11);
  assert.equal(g.degree(box.index(2, 2, 0)), 17);
  assert.equal(g.degree(box.index(0, 2, 3)), 17);
  assert.equal(g.degree(box.index(2, 2, 2)), 26);
  assert.equal(g.maxDegree, 26);
  const tally = new Map();
  for (let c = 0; c < g.count; c++) tally.set(g.degree(c), (tally.get(g.degree(c)) || 0) + 1);
  assert.deepEqual([...tally].sort((a, b) => a[0] - b[0]), [[7, 8], [11, 36], [17, 54], [26, 27]]);
});

test('box: the neighbour relation is symmetric, without self-loops or repeats', () => {
  for (const [X, Y, Z] of [[4, 3, 5], [1, 1, 6], [2, 3, 1]]) {
    const g = createBoxGrid(X, Y, Z).graph;
    for (let c = 0; c < g.count; c++) {
      const list = nb(g, c);
      assert.equal(new Set(list).size, list.length);
      assert.ok(!list.includes(c));
      for (const n of list) assert.ok(nb(g, n).includes(c), `${X}x${Y}x${Z}: ${c} -> ${n} but not back`);
    }
  }
});

test('box: 1 × 1 × 1 and 1 × 1 × N boxes', () => {
  const one = createBoxGrid(1, 1, 1);
  assert.equal(one.graph.count, 1);
  assert.equal(one.graph.degree(0), 0);
  assert.equal(one.graph.edgeCount, 0);
  assert.equal(one.graph.maxDegree, 0);
  assert.deepEqual(nb(one.graph, 0), []);
  assert.deepEqual(one.coords(0), [0, 0, 0]);

  const line = createBoxGrid(1, 1, 5);
  assert.equal(line.graph.count, 5);
  assert.deepEqual(nb(line.graph, 0), [1]);
  assert.deepEqual(nb(line.graph, 2), [1, 3]);
  assert.deepEqual(nb(line.graph, 4), [3]);
  assert.equal(line.graph.maxDegree, 2);
  assert.equal(line.graph.edgeCount, 8);
  assert.deepEqual(line.coords(3), [0, 0, 3]);
});

// ---------- large boxes ----------

test('box: a 100 × 100 × 100 graph builds without per-cell allocation', () => {
  const before = process.memoryUsage();
  const box = createBoxGrid(100, 100, 100);
  const after = process.memoryUsage();
  assert.equal(box.graph.count, 1_000_000);
  assert.equal(box.graph.edgeCount, 298 ** 3 - 1_000_000);
  // Stored neighbour lists would cost >= 100 MB here (26 M Int32 targets).
  assert.ok(after.arrayBuffers - before.arrayBuffers < 1_000_000, `arrayBuffers grew ${after.arrayBuffers - before.arrayBuffers}`);
  assert.ok(after.heapUsed - before.heapUsed < 32_000_000, `heap grew ${after.heapUsed - before.heapUsed}`);
  assert.equal(box.graph.degree(box.index(50, 50, 50)), 26);
  assert.equal(box.graph.neighbour(box.index(99, 99, 99), 0), box.index(98, 98, 98));
});

// ---------- plugs into the engine ----------

test('box: the rules engine plays over a box graph unchanged', () => {
  const box = createBoxGrid(3, 3, 3);
  const mine = box.index(2, 2, 2);
  const game = createGameWithMines({
    graph: box.graph,
    profile: REFERENCE_PROFILE,
    mines: [mine],
    dimensions: { X: 3, Y: 3, Z: 3 },
  });
  assert.equal(game.phase, PHASE.PLAYING);
  const r = game.reveal(box.index(0, 0, 0));
  assert.equal(r.ended, true);
  assert.equal(game.phase, PHASE.WON);
  assert.equal(game.cellNumber(box.index(1, 1, 1)), 1);
  assert.equal(game.cellNumber(box.index(0, 0, 0)), 0);
});

test('box: the placer and the solver accept a box graph unchanged', () => {
  const box = createBoxGrid(4, 4, 4);
  const first = box.index(1, 1, 1);
  for (let seed = 0; seed < 20; seed++) {
    const mines = Array.from(placeMines({ graph: box.graph, mineCount: 6, firstClick: first, source: createSeededSource(seed) }));
    assert.equal(mines.length, 6);
    assert.ok(!mines.includes(first));
    const r = solve({ graph: box.graph, mines, firstClick: first });
    assert.equal(typeof r.cleared, 'boolean');
  }
});

test('box: DOM-free and independent of js/logic.js', () => {
  const src = readFileSync(new URL('../js/engine/box-grid.js', import.meta.url), 'utf8');
  const imports = [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
  assert.ok(imports.every((s) => s === './graph.js'), `imports ${imports}`);
  assert.doesNotMatch(src, /\b(document|window|globalThis)\s*\./);
});
