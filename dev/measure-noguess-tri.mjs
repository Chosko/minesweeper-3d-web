// Measures no-guess generation on the triangle standard boards (the triangle-grid feature's
// Beginner, Intermediate and Expert) against the attempt budget, beside the square Expert board
// the budget was set from. The measurement behind the triangle-grid feature's statement that
// every standard board, Expert included, meets the attempt budget. A budget change is board
// generation's.
//
// Usage: node dev/measure-noguess-tri.mjs [seeds]   (default 300 seeds per board)
//
// Each seed s asks generate() for a no-guess board twice: first click on the marked start cell,
// then on cell (s % cells). Per board and first click it prints the requests that met the budget,
// the candidates tried (median, mean, worst) and the time per request (median, worst).

import { ATTEMPT_BUDGET } from '../js/generation/generate.js';
import { startCell } from '../js/generation/start-cell.js';
import { measure } from './measure-noguess-hex.mjs';

const triangle = (name, width, height, mineCount) => ({ name: `triangle ${name}`, graph: { kind: 'tri', width, height }, mineCount });
export const BOARDS = Object.freeze([
  triangle('Beginner', 13, 7, 8),
  triangle('Intermediate', 25, 13, 36),
  triangle('Expert', 41, 17, 103),
  { name: 'square Expert', graph: { kind: 'square', width: 30, height: 16 }, mineCount: 99 },
]);

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] ?? 300);
  console.log(`no-guess on the triangle boards, ${seeds} seeds each, attempt budget ${ATTEMPT_BUDGET}`);
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
