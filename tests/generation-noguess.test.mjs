import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate, boardGraph, ATTEMPT_BUDGET, PROGRESS_INTERVAL_MS } from '../js/generation/generate.js';
import { startCell } from '../js/generation/start-cell.js';
import { GENERATOR_VERSION, placeMines } from '../js/generation/placer.js';
import { createSeededSource } from '../js/generation/random.js';
import { solve } from '../js/generation/solver.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createHexGrid } from '../js/engine/hex-grid.js';
import { createTriGrid } from '../js/engine/tri-grid.js';
import { handleMessage } from '../js/generation/worker.js';
import { STANDARD_SIZES as HEX_SIZES } from '../js/hexagon/board-setup.js';
import { STANDARD_SIZES as TRI_SIZES } from '../js/triangle/board-setup.js';

const square = (width, height) => ({ kind: 'square', width, height });
const hex = (width, height) => ({ kind: 'hex', width, height });
const tri = (width, height) => ({ kind: 'tri', width, height });
const LEVELS = [
  { name: 'Beginner', graph: square(9, 9), mineCount: 10, seeds: 300 },
  { name: 'Intermediate', graph: square(16, 16), mineCount: 40, seeds: 150 },
  { name: 'Expert', graph: square(30, 16), mineCount: 99, seeds: 60 },
  { name: 'hexagon Beginner', graph: hex(9, 9), mineCount: 13, seeds: 150 },
  { name: 'hexagon Intermediate', graph: hex(16, 16), mineCount: 50, seeds: 60 },
  { name: 'triangle Beginner', graph: tri(TRI_SIZES.beginner.width, TRI_SIZES.beginner.height), mineCount: TRI_SIZES.beginner.mines, seeds: 150 },
  { name: 'triangle Intermediate', graph: tri(TRI_SIZES.intermediate.width, TRI_SIZES.intermediate.height), mineCount: TRI_SIZES.intermediate.mines, seeds: 60 },
];

// ---------- request and result ----------

test('generate: a standard board is the placer\'s first draw from the seed', () => {
  const request = { graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: false, seed: 2026 };
  const r = generate(request);
  const graph = createSquareGrid(9, 9).graph;
  const expected = placeMines({ graph, mineCount: 10, firstClick: 40, source: createSeededSource(2026) });
  assert.equal(r.ok, true);
  assert.ok(r.mines instanceof Int32Array);
  assert.deepEqual([...r.mines], [...expected]);
  assert.equal(r.seed, 2026);
  assert.equal(r.generatorVersion, GENERATOR_VERSION);
  assert.equal('candidates' in r, false, 'a standard board carries no candidate count');
});

test('generate: no-guess pins the accepted board for a fixed seed', () => {
  const r = generate({ graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: true, seed: 2026 });
  assert.deepEqual(
    { ...r, mines: [...r.mines] },
    { ok: true, mines: [14, 20, 25, 35, 43, 55, 64, 70, 77, 80], seed: 2026, generatorVersion: GENERATOR_VERSION, candidates: 3 },
  );
});

test('generate: the same no-guess request always yields the same board', () => {
  const request = { graph: square(30, 16), mineCount: 99, firstClick: 0, noGuess: true, seed: 7 };
  const a = generate(request);
  const b = generate({ ...request, graph: { ...request.graph } });
  assert.equal(a.ok, true);
  assert.deepEqual([...a.mines], [...b.mines]);
  assert.equal(a.candidates, b.candidates);
  const c = generate({ ...request, seed: 8 });
  assert.notDeepEqual([...a.mines], [...c.mines]);
});

test('generate: candidates are drawn one after another from one seeded source', () => {
  const request = { graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: true, seed: 2026 };
  const r = generate(request);
  assert.ok(r.candidates > 1, 'the pinned seed rejects at least one candidate');
  const graph = createSquareGrid(9, 9).graph;
  const source = createSeededSource(2026);
  for (let k = 1; k <= r.candidates; k++) {
    const mines = placeMines({ graph, mineCount: 10, firstClick: 40, source });
    const cleared = solve({ graph, mines, firstClick: 40 }).cleared;
    if (k < r.candidates) assert.equal(cleared, false, `candidate ${k} is rejected`);
    else {
      assert.equal(cleared, true);
      assert.deepEqual([...mines], [...r.mines]);
    }
  }
});

// ---------- the no-guess promise ----------

for (const { name, graph, mineCount, seeds } of LEVELS) {
  test(`generate: every accepted ${name} no-guess board clears with the solver from its first click`, () => {
    const cells = boardGraph(graph);
    for (let seed = 1; seed <= seeds; seed++) {
      const firstClick = (seed * 7919) % cells.count;
      const r = generate({ graph, mineCount, firstClick, noGuess: true, seed });
      assert.equal(r.ok, true, `seed ${seed}`);
      assert.equal(r.mines.length, mineCount);
      assert.ok(r.candidates >= 1 && r.candidates <= ATTEMPT_BUDGET);
      assert.equal(r.mines.includes(firstClick), false);
      assert.equal(solve({ graph: cells, mines: r.mines, firstClick }).cleared, true, `seed ${seed}`);
    }
  });
}

// ---------- failure ----------

test('generate: an exhausted budget returns a failure with a reason, never a board', () => {
  // 3 x 3, first click in a corner, 7 mines: one safe cell among the other 8. If it is one of
  // the corner's 3 neighbours the number is 2 and the count leaves 2 of those 3 open to doubt;
  // otherwise the number is 3 and 4 mines hide among 5 cells. No candidate can ever clear.
  const r = generate({ graph: square(3, 3), mineCount: 7, firstClick: 0, noGuess: true, seed: 1 });
  assert.equal(r.ok, false);
  assert.equal(typeof r.reason, 'string');
  assert.ok(r.reason.length > 0);
  assert.equal('mines' in r, false);
  assert.equal(r.candidates, ATTEMPT_BUDGET);
  assert.equal(r.seed, 1);
  assert.equal(r.generatorVersion, GENERATOR_VERSION);
});

test('generate: an impossible or malformed request is rejected at once', () => {
  const ok = { graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: true, seed: 1 };
  assert.throws(() => generate({ ...ok, mineCount: 81 }), /do not fit/);
  assert.throws(() => generate({ ...ok, mineCount: 81, noGuess: false }), /do not fit/);
  assert.throws(() => generate({ ...ok, graph: { kind: 'ring', width: 9, height: 9 } }), RangeError);
  assert.throws(() => generate({ ...ok, graph: { kind: 'hex', width: 0, height: 9 } }), RangeError);
  assert.throws(() => generate({ ...ok, graph: undefined }), RangeError);
  assert.throws(() => generate({ ...ok, graph: square(0, 9) }), RangeError);
  assert.throws(() => generate({ ...ok, noGuess: 'yes' }), RangeError);
  assert.throws(() => generate({ ...ok, seed: -1 }), RangeError);
  assert.throws(() => generate({ ...ok, firstClick: 81 }), RangeError);
  assert.throws(() => generate(), RangeError);
});

// ---------- budget and module ----------

test('generate: the attempt budget is a positive integer recorded with its measurement', () => {
  assert.ok(Number.isInteger(ATTEMPT_BUDGET) && ATTEMPT_BUDGET > 0);
  const src = readFileSync(new URL('../js/generation/generate.js', import.meta.url), 'utf8');
  const before = src.slice(0, src.indexOf('export const ATTEMPT_BUDGET'));
  const note = before.slice(before.lastIndexOf('\n\n'));
  for (const word of ['Expert', 'median', 'worst', 'seeds']) assert.ok(note.includes(word), word);
});

test('generate: the module is DOM-free and independent of the 3D engine', () => {
  const src = readFileSync(new URL('../js/generation/generate.js', import.meta.url), 'utf8');
  for (const name of ['document', 'window', 'Math.random', 'Date.now', 'logic.js']) {
    assert.equal(src.includes(name), false, name);
  }
});

// ---------- progress ----------

test('generate: the progress callback reports candidates tried at most every PROGRESS_INTERVAL_MS, and never changes the result', () => {
  assert.equal(PROGRESS_INTERVAL_MS, 250);
  // a board that never clears runs the whole budget; the clock moves 100 ms per reading
  const request = { graph: square(3, 3), mineCount: 7, firstClick: 4, noGuess: true, seed: 9 };
  let t = 0;
  const reports = [];
  let lastAt = 0;
  const r = generate(request, {
    now: () => (t += 100),
    onProgress: (p) => {
      assert.ok(t - lastAt >= PROGRESS_INTERVAL_MS, 'no faster than the interval');
      lastAt = t;
      reports.push(p.candidates);
    },
  });
  assert.ok(reports.length > 10);
  for (let i = 1; i < reports.length; i++) assert.ok(reports[i] > reports[i - 1], 'the count only grows');
  assert.ok(reports.at(-1) <= ATTEMPT_BUDGET);
  const plainR = (x) => ({ ...x, mines: x.mines ? [...x.mines] : x.mines });
  assert.deepEqual(plainR(r), plainR(generate(request)), 'the result is the same with or without progress');
});

test('generate: progress leaves every no-guess board unchanged, and a standard request reports none', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const request = { graph: square(16, 16), mineCount: 40, firstClick: seed % 256, noGuess: true, seed };
    let t = 0;
    const withP = generate(request, { now: () => (t += 1000), onProgress: () => {} });
    assert.deepEqual([...withP.mines], [...generate(request).mines]);
    assert.equal(withP.candidates, generate(request).candidates);
  }
  let calls = 0;
  let t = 0;
  generate({ graph: square(9, 9), mineCount: 10, firstClick: 40, noGuess: false, seed: 3 }, { now: () => (t += 1000), onProgress: () => { calls += 1; } });
  assert.equal(calls, 0);
});

test('generate: a box no-guess board for its marked start cell is reproduced by its seed', () => {
  const graph = { kind: 'box', X: 6, Y: 6, Z: 6 };
  const firstClick = startCell(graph);
  const a = generate({ graph, mineCount: 10, firstClick, noGuess: true, seed: 4242 });
  const b = generate({ graph, mineCount: 10, firstClick, noGuess: true, seed: 4242 });
  assert.equal(a.ok, true);
  assert.deepEqual([...a.mines], [...b.mines]);
  assert.equal(a.mines.includes(firstClick), false);
});

// ---------- the hexagon description ----------

test('generate: a hex description runs over the hexagon graph — a standard board is the placer\'s first draw', () => {
  assert.equal(boardGraph(hex(5, 4)).count, 20);
  assert.deepEqual([...boardGraph(hex(5, 4)).neighbours(7)], [...createHexGrid(5, 4).graph.neighbours(7)]);
  const request = { graph: hex(9, 9), mineCount: 13, firstClick: 40, noGuess: false, seed: 2026 };
  const r = generate(request);
  const expected = placeMines({ graph: createHexGrid(9, 9).graph, mineCount: 13, firstClick: 40, source: createSeededSource(2026) });
  assert.equal(r.ok, true);
  assert.deepEqual([...r.mines], [...expected]);
  assert.equal(r.generatorVersion, GENERATOR_VERSION);
  assert.equal(GENERATOR_VERSION, 1, 'no generator version change');
});

test('generate: a hex no-guess board is pinned for a fixed seed, with the same attempt budget', () => {
  const graph = hex(9, 9);
  const r = generate({ graph, mineCount: 13, firstClick: startCell(graph), noGuess: true, seed: 2026 });
  assert.deepEqual({ ...r, mines: [...r.mines] }, { ...PINNED_HEX_NOGUESS, generatorVersion: GENERATOR_VERSION });
  // 3 × 3, first click on the centre tile (6 neighbours, 2 tiles apart), 7 mines: one other safe
  // tile, either among the centre's neighbours or one of the 2 apart — a guess either way.
  const fail = generate({ graph: hex(3, 3), mineCount: 7, firstClick: 4, noGuess: true, seed: 1 });
  assert.equal(fail.ok, false);
  assert.equal(fail.candidates, ATTEMPT_BUDGET);
});

test('generate: hexagon Expert no-guess — every seed is accepted within the budget and clears from the start cell', () => {
  // The standard Hexagon Expert board; its mine count is the one no-guess clears within the
  // attempt budget on every seed measured (dev/measure-noguess-hex.mjs).
  const { width, height, mines } = HEX_SIZES.expert;
  const graph = hex(width, height);
  const cells = boardGraph(graph);
  const firstClick = startCell(graph);
  for (let seed = 1; seed <= 30; seed++) {
    const r = generate({ graph, mineCount: mines, firstClick, noGuess: true, seed });
    assert.equal(r.ok, true, `seed ${seed} misses`);
    assert.ok(r.candidates >= 1 && r.candidates <= ATTEMPT_BUDGET);
    assert.equal(r.mines.length, mines);
    assert.equal(r.mines.includes(firstClick), false);
    assert.equal(solve({ graph: cells, mines: r.mines, firstClick }).cleared, true, `seed ${seed}`);
  }
});

test('generate: the same hex request and seed give the same result in the worker and in Node', () => {
  const plain = (x) => ({ ...x, mines: x.mines ? [...x.mines] : x.mines });
  const { width, height, mines } = HEX_SIZES.expert;
  const cases = [[hex(9, 9), 13, true], [hex(16, 16), 50, true], [hex(width, height), mines, false], [hex(width, height), mines, true]];
  // a no-guess miss for the failure result's parity: 3 × 3 with 7 mines never clears (above)
  for (const [graph, mineCount, noGuess, seeds = [1, 5, 4000000000]] of [...cases, [hex(3, 3), 7, true, [1]]]) {
    for (const seed of seeds) {
      const request = { graph, mineCount, firstClick: startCell(graph), noGuess, seed };
      const reply = handleMessage(structuredClone({ id: seed, request }));
      assert.equal(reply.id, seed);
      assert.deepEqual(plain(reply.result), plain(generate(request)));
      assert.equal(reply.result.generatorVersion, GENERATOR_VERSION);
    }
  }
  assert.equal(generate({ graph: hex(3, 3), mineCount: 7, firstClick: startCell(hex(3, 3)), noGuess: true, seed: 1 }).ok, false);
});

// ---------- the triangle description ----------

test('generate: a tri description runs over the triangle graph — a standard board is the placer\'s first draw', () => {
  assert.equal(boardGraph(tri(7, 4)).count, 28);
  for (const c of [0, 10, 17, 27]) {
    assert.deepEqual([...boardGraph(tri(7, 4)).neighbours(c)], [...createTriGrid(7, 4).graph.neighbours(c)]);
  }
  const request = { graph: tri(13, 7), mineCount: 8, firstClick: 45, noGuess: false, seed: 2026 };
  const r = generate(request);
  const expected = placeMines({ graph: createTriGrid(13, 7).graph, mineCount: 8, firstClick: 45, source: createSeededSource(2026) });
  assert.equal(r.ok, true);
  assert.deepEqual([...r.mines], [...expected]);
  assert.equal(r.generatorVersion, GENERATOR_VERSION);
  assert.equal(GENERATOR_VERSION, 1, 'no generator version change');
  assert.throws(() => generate({ ...request, graph: tri(0, 7) }), RangeError);
});

test('start cell: a triangle board\'s is the tile at the centre column and row', () => {
  for (const [w, h] of [[1, 1], [13, 7], [25, 13], [41, 17], [8, 6]]) {
    const c = startCell(tri(w, h));
    assert.deepEqual(createTriGrid(w, h).colRow(c), [Math.floor(w / 2), Math.floor(h / 2)], `${w} × ${h}`);
  }
  assert.equal(startCell(tri(41, 17)), 8 * 41 + 20, 'Expert');
  assert.throws(() => startCell({ kind: 'tri', width: 3 }), RangeError);
});

test('generate: a tri no-guess board is pinned for a fixed seed, with the same attempt budget', () => {
  const graph = tri(13, 7);
  const r = generate({ graph, mineCount: 8, firstClick: startCell(graph), noGuess: true, seed: 2026 });
  assert.deepEqual({ ...r, mines: [...r.mines] }, { ...PINNED_TRI_NOGUESS, generatorVersion: GENERATOR_VERSION });
  // 3 × 3, first click on the centre tile, which touches all 8 others, 7 mines: it shows a 7 and
  // the one other safe tile may be any of the 8 — a guess every time.
  const fail = generate({ graph: tri(3, 3), mineCount: 7, firstClick: 4, noGuess: true, seed: 1 });
  assert.equal(fail.ok, false);
  assert.equal(fail.candidates, ATTEMPT_BUDGET);
});

test('generate: triangle Expert no-guess — every seed is accepted within the budget and clears from the start cell', () => {
  // The standard Triangle Expert board; measured with dev/measure-noguess-tri.mjs, well inside the
  // attempt budget on every seed.
  const { width, height, mines } = TRI_SIZES.expert;
  const graph = tri(width, height);
  const cells = boardGraph(graph);
  const firstClick = startCell(graph);
  for (let seed = 1; seed <= 30; seed++) {
    const r = generate({ graph, mineCount: mines, firstClick, noGuess: true, seed });
    assert.equal(r.ok, true, `seed ${seed} misses`);
    assert.ok(r.candidates >= 1 && r.candidates <= ATTEMPT_BUDGET);
    assert.equal(r.mines.length, mines);
    assert.equal(r.mines.includes(firstClick), false);
    assert.equal(solve({ graph: cells, mines: r.mines, firstClick }).cleared, true, `seed ${seed}`);
  }
});

test('generate: the same tri request and seed give the same result in the worker and in Node', () => {
  const plain = (x) => ({ ...x, mines: x.mines ? [...x.mines] : x.mines });
  const cases = Object.values(TRI_SIZES).flatMap(({ width: w, height: h, mines: m }) => [[tri(w, h), m, false], [tri(w, h), m, true]]);
  // a no-guess miss for the failure result's parity: 3 × 3 with 7 mines never clears (above)
  for (const [graph, mineCount, noGuess, seeds = [1, 5, 4000000000]] of [...cases, [tri(3, 3), 7, true, [1]]]) {
    for (const seed of seeds) {
      const request = { graph, mineCount, firstClick: startCell(graph), noGuess, seed };
      const reply = handleMessage(structuredClone({ id: seed, request }));
      assert.equal(reply.id, seed);
      assert.deepEqual(plain(reply.result), plain(generate(request)));
      assert.equal(reply.result.generatorVersion, GENERATOR_VERSION);
    }
  }
  assert.equal(generate({ graph: tri(3, 3), mineCount: 7, firstClick: startCell(tri(3, 3)), noGuess: true, seed: 1 }).ok, false);
});

// Triangle Beginner (13 × 7, 8 mines), no-guess, first click on the start cell, seed 2026.
const PINNED_TRI_NOGUESS = { ok: true, mines: [3, 12, 13, 15, 41, 42, 69, 74], seed: 2026, candidates: 7 };

// Hexagon Beginner (9 × 9, 13 mines), no-guess, first click on the start cell, seed 2026.
const PINNED_HEX_NOGUESS = { ok: true, mines: [0, 1, 10, 13, 44, 45, 47, 50, 53, 63, 68, 69, 80], seed: 2026, candidates: 2 };
