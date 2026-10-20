// Measures the typical 3BV of every named board — Classic 2D's standard boards and the 3D
// presets: the measurement behind the cube steps' 3BV ratios in js/mode3d/board-choice.js.
//
// Usage: node dev/measure-typical-bbbv.mjs [seeds]   (default 400 seeds per board)
//
// Each seed s asks generate() — the generation worker's own entry point — for a no-guess board
// (the board choices' default) with the first click on cell (s % cells), places its mines, and
// takes the board's 3BV (js/engine/metrics.js). Per board it prints the median 3BV and its range.

import { generate, boardGraph } from '../js/generation/generate.js';
import { createBoardMetrics } from '../js/engine/metrics.js';
import { STANDARD_BOARDS, PRESETS_3D, createBoardIdentity, boardLabel } from '../js/records/board.js';

// The named boards as board identities with no-guess on, the default the board choices open with.
export const NAMED_BOARDS = Object.freeze([
  ...STANDARD_BOARDS.map(({ width, height, mines }) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess: true })),
  ...PRESETS_3D.map(({ width, height, depth, mines }) => createBoardIdentity({ mode: '3d', width, height, depth, mines, noGuess: true })),
]);

const describe = (board) => (board.mode === '3d'
  ? { kind: 'box', X: board.width, Y: board.height, Z: board.depth }
  : { kind: 'square', width: board.width, height: board.height });

/** The 3BV of a board with `mines` (ascending cell indexes) on `graph`. */
export function bbbvOf(graph, mines) {
  const mine = new Uint8Array(graph.count);
  for (const m of mines) mine[m] = 1;
  const number = new Int8Array(graph.count);
  for (let c = 0; c < graph.count; c++) {
    if (mine[c]) { number[c] = -1; continue; }
    let n = 0;
    graph.forEachNeighbour(c, (nb) => { n += mine[nb]; });
    number[c] = n;
  }
  return createBoardMetrics(graph, mine, number).bbbv;
}

export function measure(board, seeds) {
  const description = describe(board);
  const graph = boardGraph(description);
  const values = [];
  for (let seed = 1; seed <= seeds; seed++) {
    const r = generate({ graph: description, mineCount: board.mines, firstClick: seed % graph.count, noGuess: board.noGuess, seed });
    if (r.ok) values.push(bbbvOf(graph, r.mines));
  }
  values.sort((a, b) => a - b);
  const mid = values.length >> 1;
  const median = values.length % 2 ? values[mid] : Math.round((values[mid - 1] + values[mid]) / 2);
  return { boards: values.length, seeds, median, low: values[0], high: values.at(-1) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] ?? 400);
  console.log(`typical 3BV, no-guess boards, ${seeds} seeds each`);
  for (const board of NAMED_BOARDS) {
    const m = measure(board, seeds);
    console.log(`${boardLabel(board).padEnd(28)} median ${String(m.median).padStart(4)}  range ${m.low}..${m.high}  (${m.boards}/${m.seeds} boards)`);
  }
}
