import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generate, boardGraph, ATTEMPT_BUDGET } from '../js/generation/generate.js';
import { GENERATOR_VERSION, placeMines } from '../js/generation/placer.js';
import { createSeededSource } from '../js/generation/random.js';
import { solve } from '../js/generation/solver.js';
import { createSquareGrid } from '../js/engine/square-grid.js';

const square = (width, height) => ({ kind: 'square', width, height });
const LEVELS = [
  { name: 'Beginner', graph: square(9, 9), mineCount: 10, seeds: 300 },
  { name: 'Intermediate', graph: square(16, 16), mineCount: 40, seeds: 150 },
  { name: 'Expert', graph: square(30, 16), mineCount: 99, seeds: 60 },
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
  assert.throws(() => generate({ ...ok, graph: { kind: 'hex', width: 9, height: 9 } }), RangeError);
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
