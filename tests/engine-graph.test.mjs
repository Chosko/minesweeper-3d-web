import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCellGraph, cellGraphFromLists } from '../js/engine/graph.js';
import { createSquareGrid } from '../js/engine/square-grid.js';

const nb = (graph, i) => Array.from(graph.neighbours(i));

// ---------- cell graph ----------

test('graph: built from per-cell neighbour lists, read back per cell', () => {
  const g = cellGraphFromLists(3, [[1], [0, 2], [1]]);
  assert.equal(g.count, 3);
  assert.deepEqual(nb(g, 0), [1]);
  assert.deepEqual(nb(g, 1), [0, 2]);
  assert.deepEqual(nb(g, 2), [1]);
  assert.equal(g.degree(1), 2);
  assert.equal(g.neighbour(1, 0), 0);
  assert.equal(g.neighbour(1, 1), 2);
  const seen = [];
  g.forEachNeighbour(1, (c) => seen.push(c));
  assert.deepEqual(seen, [0, 2]);
});

test('graph: built from flat typed arrays (offsets + targets)', () => {
  const g = createCellGraph(3, Uint32Array.of(0, 1, 3, 4), Int32Array.of(1, 0, 2, 1));
  assert.equal(g.count, 3);
  assert.deepEqual(nb(g, 1), [0, 2]);
  assert.equal(g.edgeCount, 4);
  assert.equal(g.maxDegree, 2);
});

test('graph: immutable — frozen, inputs copied, returned lists are copies', () => {
  const offsets = Uint32Array.of(0, 1, 2);
  const targets = Int32Array.of(1, 0);
  const g = createCellGraph(2, offsets, targets);
  assert.ok(Object.isFrozen(g));
  assert.throws(() => { g.count = 5; }, TypeError);
  targets[0] = 0; offsets[1] = 2;
  assert.deepEqual(nb(g, 0), [1]);
  const list = g.neighbours(0);
  assert.ok(list instanceof Int32Array);
  list[0] = 0;
  assert.deepEqual(nb(g, 0), [1]);
});

test('graph: invalid input throws RangeError', () => {
  assert.throws(() => cellGraphFromLists(-1, []), RangeError);
  assert.throws(() => cellGraphFromLists(1.5, [[]]), RangeError);
  assert.throws(() => cellGraphFromLists(2, [[1]]), RangeError); // list count mismatch
  assert.throws(() => cellGraphFromLists(2, [[2], [0]]), RangeError); // out of range
  assert.throws(() => cellGraphFromLists(2, [[0], [0]]), RangeError); // self neighbour
  assert.throws(() => cellGraphFromLists(2, [[1, 1], [0]]), RangeError); // repeated
  assert.throws(() => createCellGraph(2, Uint32Array.of(0, 2, 1), Int32Array.of(1, 0)), RangeError);
  assert.throws(() => createCellGraph(2, Uint32Array.of(0, 1), Int32Array.of(1, 0)), RangeError);
  assert.throws(() => createCellGraph(1, Uint32Array.of(0, 0), [0]), RangeError);
  assert.throws(() => g0().degree(1), RangeError);
  const g = cellGraphFromLists(2, [[1], [0]]);
  assert.throws(() => g.neighbour(0, 1), RangeError);
  assert.throws(() => g.neighbour(0, -1), RangeError);
  assert.throws(() => g.neighbour(1, 0.5), RangeError);
});
const g0 = () => cellGraphFromLists(1, [[]]);

// ---------- square-grid provider ----------

test('square grid: index and colRow map both ways (round-trip)', () => {
  const s = createSquareGrid(5, 3);
  assert.equal(s.width, 5);
  assert.equal(s.height, 3);
  assert.equal(s.graph.count, 15);
  assert.equal(s.index(0, 0), 0);
  assert.equal(s.index(4, 0), 4);
  assert.equal(s.index(0, 1), 5);
  assert.deepEqual(s.colRow(7), [2, 1]);
  for (let i = 0; i < 15; i++) {
    const [c, r] = s.colRow(i);
    assert.equal(s.index(c, r), i);
  }
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 5; c++) assert.deepEqual(s.colRow(s.index(c, r)), [c, r]);
  assert.throws(() => s.index(5, 0), RangeError);
  assert.throws(() => s.index(0, -1), RangeError);
  assert.throws(() => s.colRow(15), RangeError);
  assert.throws(() => s.colRow(1.5), RangeError);
});

test('square grid: neighbour counts — 3 at a corner, 5 on an edge, 8 inside', () => {
  const s = createSquareGrid(4, 4);
  for (let i = 0; i < 16; i++) {
    const [c, r] = s.colRow(i);
    const onX = c === 0 || c === 3, onY = r === 0 || r === 3;
    const want = onX && onY ? 3 : onX || onY ? 5 : 8;
    assert.equal(s.graph.degree(i), want, `cell ${c},${r}`);
  }
});

test('square grid: neighbour order is pinned (reading order NW N NE W E SW S SE)', () => {
  const s = createSquareGrid(4, 3);
  const at = (c, r) => nb(s.graph, s.index(c, r)).map((i) => s.colRow(i));
  // corner
  assert.deepEqual(at(0, 0), [[1, 0], [0, 1], [1, 1]]);
  // edge (top row)
  assert.deepEqual(at(2, 0), [[1, 0], [3, 0], [1, 1], [2, 1], [3, 1]]);
  // edge (left column)
  assert.deepEqual(at(0, 1), [[0, 0], [1, 0], [1, 1], [0, 2], [1, 2]]);
  // interior
  assert.deepEqual(at(1, 1), [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]]);
});

test('square grid: neighbour relation is symmetric and irreflexive', () => {
  for (const [w, h] of [[1, 1], [1, 7], [7, 1], [2, 2], [9, 6]]) {
    const g = createSquareGrid(w, h).graph;
    for (let i = 0; i < g.count; i++) {
      for (const j of nb(g, i)) {
        assert.notEqual(i, j);
        assert.ok(nb(g, j).includes(i), `${w}x${h}: ${i}->${j} not mirrored`);
      }
    }
  }
});

test('square grid: 1 x 1 and 1 x N boards', () => {
  const one = createSquareGrid(1, 1);
  assert.equal(one.graph.count, 1);
  assert.equal(one.graph.degree(0), 0);
  assert.deepEqual(one.colRow(0), [0, 0]);

  const col = createSquareGrid(1, 5);
  assert.equal(col.graph.count, 5);
  assert.deepEqual(nb(col.graph, 0), [1]);
  assert.deepEqual(nb(col.graph, 2), [1, 3]);
  assert.deepEqual(nb(col.graph, 4), [3]);
  assert.deepEqual(col.colRow(3), [0, 3]);

  const row = createSquareGrid(5, 1);
  assert.deepEqual(nb(row.graph, 0), [1]);
  assert.deepEqual(nb(row.graph, 2), [1, 3]);
  assert.deepEqual(nb(row.graph, 4), [3]);
});

test('square grid: invalid dimensions throw RangeError', () => {
  for (const [w, h] of [[0, 5], [5, 0], [-1, 3], [2.5, 3], [3, NaN], ['4', 4], [4, Infinity]]) {
    assert.throws(() => createSquareGrid(w, h), RangeError, `${w}x${h}`);
  }
});

test('square grid: large custom board builds quickly', () => {
  const t0 = performance.now();
  const s = createSquareGrid(1000, 1000);
  const ms = performance.now() - t0;
  assert.equal(s.graph.count, 1e6);
  assert.equal(s.graph.degree(s.index(500, 500)), 8);
  assert.ok(ms < 1000, `took ${ms} ms`);
});

test('engine modules are DOM-free and independent of js/logic.js', () => {
  for (const f of ['js/engine/graph.js', 'js/engine/square-grid.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    const imports = [...src.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
    assert.ok(imports.every((s) => s === './graph.js'), `${f} imports ${imports}`);
    assert.doesNotMatch(src, /\b(document|window|globalThis)\s*\./, f);
  }
});
