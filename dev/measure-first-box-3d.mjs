// Measures the no-guess first click from the marked start cell on Cube Beginner's box, for each
// candidate mine count: the measurement behind Cube Beginner's mine count in PRESETS
// (js/mode3d/board-choice.js).
//
// Usage: node dev/measure-first-box-3d.mjs [seeds]   (default 100 seeds per count)
//
// Each seed s asks generate() for a no-guess board with the first click on the box's marked start
// cell (startCell, the centre cell floor(X / 2), floor(Y / 2), floor(Z / 2)). Per count it prints the
// requests that met the attempt budget, the median share of safe cells the first click opens, the
// median 3BV left after the first click, and the seeds the first click wins outright.
//
// The rule that picks the count: Cube Beginner (6 × 6 × 6, 16 to 20 mines) — among the counts where
// every seed meets the budget and the median 3BV left is at least 40, the one whose median opening is
// nearest 60 %; with no count meeting every condition, the count nearest 60 % among those every seed
// meets the budget for.
//
// Measured under Node 22, 100 seeds, attempt budget 2000 (every request met it):
//   6 × 6 × 6:  16 mines opens 72.0 %, 3BV left 42.5;  17 68.1 %, 45;  18 60.6 %, 53;  19 61.2 %, 51;
//               20 60.5 %, 57; no wins at any count.  Every count meets the budget and leaves at least
//               40: Cube Beginner takes 20, its opening nearest 60 %.

import { generate, boardGraph, ATTEMPT_BUDGET } from '../js/generation/generate.js';
import { startCell } from '../js/generation/start-cell.js';

// The boxes measured and the mine counts tried on each.
export const SERIES = Object.freeze([
  Object.freeze({ name: 'Cube Beginner', X: 6, Y: 6, Z: 6, counts: Object.freeze([16, 17, 18, 19, 20]) }),
]);

const median = (values) => {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** The cells the first click on `first` opens (a zero cascades through the graph's neighbours) and
 *  the board's 3BV left once they are open, for `mines` on `graph`. */
export function firstClick(graph, mines, first) {
  const n = graph.count;
  const mine = new Uint8Array(n);
  for (const m of mines) mine[m] = 1;
  const number = new Int8Array(n);
  for (let c = 0; c < n; c++) {
    if (mine[c]) continue;
    let k = 0;
    graph.forEachNeighbour(c, (nb) => { k += mine[nb]; });
    number[c] = k;
  }
  const open = new Uint8Array(n);
  const queue = [first];
  open[first] = 1;
  let opened = 0;
  while (queue.length) {
    const c = queue.pop();
    opened++;
    if (number[c] !== 0) continue;
    graph.forEachNeighbour(c, (nb) => { if (!open[nb] && !mine[nb]) { open[nb] = 1; queue.push(nb); } });
  }
  // 3BV left: each opening with a closed zero, and each closed number bordering no zero.
  const seen = new Uint8Array(n);
  let left = 0;
  for (let s = 0; s < n; s++) {
    if (mine[s] || number[s] !== 0 || seen[s]) continue;
    let closed = false;
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const c = stack.pop();
      if (!open[c]) closed = true;
      graph.forEachNeighbour(c, (nb) => { if (!seen[nb] && !mine[nb] && number[nb] === 0) { seen[nb] = 1; stack.push(nb); } });
    }
    if (closed) left++;
  }
  for (let c = 0; c < n; c++) {
    if (mine[c] || number[c] === 0 || open[c]) continue;
    let byZero = false;
    graph.forEachNeighbour(c, (nb) => { if (!mine[nb] && number[nb] === 0) byZero = true; });
    if (!byZero) left++;
  }
  return { opened, safe: n - mines.length, left };
}

export function measure({ X, Y, Z, mines, seeds }) {
  const description = { kind: 'box', X, Y, Z };
  const graph = boardGraph(description);
  const first = startCell(description);
  const shares = [];
  const lefts = [];
  let met = 0, wins = 0;
  for (let seed = 1; seed <= seeds; seed++) {
    const r = generate({ graph: description, mineCount: mines, firstClick: first, noGuess: true, seed });
    if (!r.ok) continue;
    met++;
    const f = firstClick(graph, r.mines, first);
    shares.push(f.opened / f.safe);
    lefts.push(f.left);
    if (f.opened === f.safe) wins++;
  }
  return { mines, seeds, met, opening: median(shares), left: median(lefts), wins };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] ?? 100);
  console.log(`no-guess first click from the marked start cell, ${seeds} seeds per count, attempt budget ${ATTEMPT_BUDGET}`);
  console.log('board            mines  met       opens   3BV left  wins');
  for (const { name, X, Y, Z, counts } of SERIES) {
    for (const mines of counts) {
      const m = measure({ X, Y, Z, mines, seeds });
      console.log([
        `${name} ${X}x${Y}x${Z}`.padEnd(24), String(mines).padStart(3), `${m.met}/${m.seeds}`.padStart(9),
        `${(m.opening * 100).toFixed(1)} %`.padStart(7), String(m.left).padStart(9), String(m.wins).padStart(5),
      ].join(' '));
    }
  }
}
