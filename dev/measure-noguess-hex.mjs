// Measures no-guess generation on the hexagon standard boards (js/hexagon/board-setup.js) against
// the attempt budget, beside the square Expert board the budget was set from. The measurement
// behind the hexagon-grid feature's Expert mine count: every seed it measures on Hexagon Expert
// meets the budget. A budget change is board generation's.
//
// Usage: node dev/measure-noguess-hex.mjs [seeds]   (default 300 seeds per board)
//
// Each seed s asks generate() for a no-guess board twice: first click on the marked start cell,
// then on cell (s % cells). Per board and first click it prints the requests that met the budget,
// the candidates tried (median, mean, worst) and the time per request (median, worst).

import { generate, ATTEMPT_BUDGET } from '../js/generation/generate.js';
import { startCell } from '../js/generation/start-cell.js';
import { STANDARD_SIZES, GRID } from '../js/hexagon/board-setup.js';

const hexagon = (name, { width, height, mines }) => ({ name: `hexagon ${name}`, graph: { kind: GRID, width, height }, mineCount: mines });
export const BOARDS = Object.freeze([
  hexagon('Beginner', STANDARD_SIZES.beginner),
  hexagon('Intermediate', STANDARD_SIZES.intermediate),
  hexagon('Expert', STANDARD_SIZES.expert),
  { name: 'square Expert', graph: { kind: 'square', width: 30, height: 16 }, mineCount: 99 },
]);

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export function measure({ graph, mineCount }, seeds, firstClickOf) {
  const cells = graph.width * graph.height;
  const candidates = [];
  const times = [];
  let met = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const r = generate({ graph, mineCount, firstClick: firstClickOf(seed, cells), noGuess: true, seed });
    times.push(performance.now() - t0);
    candidates.push(r.candidates);
    if (r.ok) met++;
  }
  candidates.sort((a, b) => a - b);
  times.sort((a, b) => a - b);
  return {
    met, seeds,
    candidates: { median: quantile(candidates, 0.5), mean: candidates.reduce((a, b) => a + b, 0) / seeds, worst: candidates.at(-1) },
    ms: { median: quantile(times, 0.5), worst: times.at(-1) },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] ?? 300);
  console.log(`no-guess on the hexagon boards, ${seeds} seeds each, attempt budget ${ATTEMPT_BUDGET}`);
  console.log('board                  first click  met        candidates med/mean/worst   ms med/worst');
  for (const board of BOARDS) {
    for (const [label, firstClickOf] of [['start cell', () => startCell(board.graph)], ['s % cells', (s, cells) => s % cells]]) {
      const m = measure(board, seeds, firstClickOf);
      console.log([
        board.name.padEnd(22), label.padEnd(12), `${m.met}/${m.seeds}`.padStart(9),
        `${m.candidates.median}/${m.candidates.mean.toFixed(1)}/${m.candidates.worst}`.padStart(28),
        `${m.ms.median.toFixed(1)}/${m.ms.worst.toFixed(1)}`.padStart(14),
      ].join(' '));
    }
  }
}
