// Board generation entry point: standard and no-guess boards from a seeded request (no DOM).
//
// generate(request) is a pure function of (request, GENERATOR_VERSION): the same request gives
// the same result in the worker and under Node.
//
// No-guess loop: one seeded source per request, created from request.seed; candidates are
// drawn from it one after another with placeMines(), and the first one solve() clears from the
// first-click cell is the board. The candidate sequence is part of the deterministic output, so
// changing the draw order, the solver's verdicts or this loop changes boards and requires
// bumping GENERATOR_VERSION in js/generation/placer.js.

import { createSquareGrid } from '../engine/square-grid.js';
import { createBoxGrid } from '../engine/box-grid.js';
import { createSeededSource } from './random.js';
import { placeMines, GENERATOR_VERSION } from './placer.js';
import { solve } from './solver.js';

// Candidates a no-guess request may try before it fails. Set from a measurement of Expert
// no-guess generation (30 x 16, 99 mines) under Node 22, seeds 1 .. 1000, first click on cell
// (seed % 480): candidates tried — median 23, worst 433 (mean 36, so about 1 candidate in 36
// clears); time per board — median 2 ms, worst 42 ms. 2000 is over 4 times the worst seen, a
// miss on Expert at 1 in 36 has odds near e^-56, and 2000 failing Expert candidates take about
// 0.2 to 0.3 s, which bounds a failure's wait.
export const ATTEMPT_BUDGET = 2000;

// boardGraph(description) → the cell graph of a graph description.
//   { kind: 'square', width, height } — the 8-neighbour square grid (js/engine/square-grid.js).
//   { kind: 'box', X, Y, Z }          — the 26-neighbour box (js/engine/box-grid.js).
// Throws RangeError on any other description.
export function boardGraph(description) {
  if (!description || typeof description !== 'object') throw new RangeError('a graph description is required');
  if (description.kind === 'square') return createSquareGrid(description.width, description.height).graph;
  if (description.kind === 'box') return createBoxGrid(description.X, description.Y, description.Z).graph;
  throw new RangeError(`unknown graph kind ${JSON.stringify(description.kind)}`);
}

// generate({ graph, mineCount, firstClick, noGuess, seed }) → result.
//   graph       — a graph description (see boardGraph).
//   mineCount   — mines to place; at most every cell but the first-click cell.
//   firstClick  — the first-click cell; never a mine.
//   noGuess     — true: only a board the solver clears from firstClick is returned.
//   seed        — integer 0 .. 2^32 - 1.
// Success: { ok: true, mines, seed, generatorVersion } — mines an ascending Int32Array; a
// no-guess result adds candidates, the number of candidates tried (the accepted one included).
// Exhausted budget (no-guess only): { ok: false, reason, seed, generatorVersion, candidates }.
// Throws RangeError on a malformed or impossible request.
export function generate({ graph, mineCount, firstClick, noGuess, seed } = {}) {
  const cells = boardGraph(graph);
  if (typeof noGuess !== 'boolean') throw new RangeError('noGuess must be true or false');
  const source = createSeededSource(seed);
  const generatorVersion = GENERATOR_VERSION;

  if (!noGuess) {
    const mines = placeMines({ graph: cells, mineCount, firstClick, source });
    return { ok: true, mines, seed, generatorVersion };
  }

  for (let candidates = 1; candidates <= ATTEMPT_BUDGET; candidates++) {
    const mines = placeMines({ graph: cells, mineCount, firstClick, source });
    if (solve({ graph: cells, mines, firstClick }).cleared) {
      return { ok: true, mines, seed, generatorVersion, candidates };
    }
  }
  return {
    ok: false,
    reason: `no candidate in ${ATTEMPT_BUDGET} cleared without a guess from the first-click cell`,
    seed,
    generatorVersion,
    candidates: ATTEMPT_BUDGET,
  };
}
