// Measures no-guess generation on 3D box boards of growing cell count, at typical densities, and
// reports where the attempt budget stops being met and how long a request takes. The measurement
// behind NOGUESS_CELL_LIMIT in js/mode3d/board-choice.js: at the presets' densities the budget is
// met at every size, so the limit is the largest board whose slowest request stays a short wait.
//
// Usage: node dev/measure-noguess-3d.mjs [seeds]   (default 10 seeds per board)
//
// Each board is a box of the given dimensions with mines = round(cells × density); each seed s
// asks generate() for a no-guess board with first click on cell (s % cells). Per board it prints
// the requests that met the budget, the candidates tried (median, worst) and the time per request
// (median, worst). A board meets the budget when every seed answered within ATTEMPT_BUDGET.

import { generate, ATTEMPT_BUDGET } from '../js/generation/generate.js';

// The 3D presets' densities: the cube presets (4.6 %, 7.8 %, 11.3 %) and the double layer's
// Intermediate and Expert (15.3 %, 16.3 %); the original's default custom board is 2.5 %.
export const DENSITIES = Object.freeze([0.025, 0.05, 0.08, 0.11, 0.15, 0.163]);

// Box boards in growing cell count. None has a 2-cell axis: two cells stacked along such an axis
// share every neighbour, so a mine in one of them is always a guess and no candidate ever clears
// (8 x 8 x 2 at 2.5 %: 0 of 50 seeds); TWIN_BOX shows it.
export const BOXES = Object.freeze([
  [5, 5, 5], [6, 6, 6], [8, 8, 8], [10, 10, 10], [12, 12, 8], [16, 16, 16], [20, 20, 20],
  [30, 30, 30], [40, 40, 40], [50, 50, 50],
]);
export const TWIN_BOX = Object.freeze([8, 8, 2]);

const quantile = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];

export function measure({ X, Y, Z, density, seeds }) {
  const cells = X * Y * Z;
  const mineCount = Math.max(1, Math.round(cells * density));
  const candidates = [];
  const times = [];
  let met = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const t0 = performance.now();
    const r = generate({ graph: { kind: 'box', X, Y, Z }, mineCount, firstClick: seed % cells, noGuess: true, seed });
    times.push(performance.now() - t0);
    candidates.push(r.candidates);
    if (r.ok) met++;
  }
  candidates.sort((a, b) => a - b);
  times.sort((a, b) => a - b);
  return {
    cells, mineCount, met, seeds,
    candidates: { median: quantile(candidates, 0.5), worst: candidates.at(-1) },
    ms: { median: quantile(times, 0.5), worst: times.at(-1) },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] ?? 10);
  console.log(`no-guess on box boards, ${seeds} seeds each, attempt budget ${ATTEMPT_BUDGET}`);
  console.log('board         cells  density  mines  met        candidates med/worst   ms med/worst');
  for (const density of DENSITIES) {
    for (const [X, Y, Z] of BOXES) {
      const m = measure({ X, Y, Z, density, seeds });
      console.log([
        `${X}x${Y}x${Z}`.padEnd(12), String(m.cells).padStart(6), `${(density * 100).toFixed(1)} %`.padStart(8),
        String(m.mineCount).padStart(6), `${m.met}/${m.seeds}`.padStart(9),
        `${m.candidates.median}/${m.candidates.worst}`.padStart(20),
        `${m.ms.median.toFixed(1)}/${m.ms.worst.toFixed(1)}`.padStart(16),
      ].join(' '));
    }
  }
  const [X, Y, Z] = TWIN_BOX;
  const twin = measure({ X, Y, Z, density: DENSITIES[0], seeds: Math.min(seeds, 5) });
  console.log(`${X}x${Y}x${Z} (a 2-cell axis): ${twin.met}/${twin.seeds} met`);
}
