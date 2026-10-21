// The live figures both modes and the replay viewer show beside the board (no DOM).
//
// liveFigures({ bbbv, bbbvSolved, clicks, flags, mines, elapsedMs, bests }) turns a game's counts —
// the engine's counts() (bbbv null until the mines are placed, bbbvSolved, clicks as
// { reveal, flag, chord } each { effective, wasted }), the flags placed and the board's mines — its
// elapsed game-clock time in ms and the board's bests read when the game started
// ({ time, bbbvPerSecond }, each a records best { value } or a plain value, null or absent when the
// board has none) into one { text, detail } per figure, in FIGURES order:
//   bbbv    "60 / 120", no detail, with `progress` 0..1 for the bar;
//   pace    pace vs PB: elapsed − best time × (3BV solved ÷ 3BV), signed, in the results time
//           format ("−5.000 s" ahead, "+5.000 s" behind, "0.000 s" on pace), `ahead` true when
//           negative, the best time as its detail ("ahead of 48.213 s", "behind 48.213 s", on pace
//           ahead of); null — not shown — when the board has no best time or before the first 3BV
//           is solved;
//   rate    3BV/s, the best 3BV/s as its detail ("PB 2.91"), no detail when the board has none;
//   clicks  the counted clicks, the live efficiency as its detail ("efficiency 88.5%";
//           js/records/summary.js's definitions, so the figure matches the game summary for the
//           same counts);
//   flags   the flags placed, the mines left as its detail.
// The formats are the results screen's (js/results/view.js); a figure the inputs cannot yet produce
// — no time elapsed, no click counted, no 3BV yet — shows PLACEHOLDER, never NaN or Infinity.
//
// changedFigures(previous, next) names the figures whose text or detail differ, or that appeared
// or disappeared, so the overlay writes only those; with no previous figures every one changed.
//
// figuresLine(figures) → the line a figures panel's live part announces, "3BV 12 / 59, 39 mines
// left": the 3BV figure and the flags figure's detail.

import { countedClicks, bbbvPerSecond, efficiency } from '../records/summary.js';
import { DASH, MINUS, formatTime, formatRate, formatEfficiency } from '../results/view.js';

export const FIGURES = Object.freeze(['bbbv', 'pace', 'rate', 'clicks', 'flags']);
export const PLACEHOLDER = DASH;

const known = (v) => typeof v === 'number' && Number.isFinite(v);
const bestValue = (b) => (known(b) ? b : known(b?.value) ? b.value : null);

function paceFigure(bbbv, bbbvSolved, elapsedMs, bestTime) {
  if (bestTime === null || !known(bbbv) || bbbv <= 0 || !(bbbvSolved > 0)) return null;
  const ms = elapsedMs - (bestTime * bbbvSolved) / bbbv;
  const magnitude = formatTime(Math.abs(ms));
  const zero = magnitude === formatTime(0);
  const sign = zero ? '' : ms < 0 ? MINUS : '+';
  return { text: `${sign}${magnitude}`, detail: `${ms > 0 && !zero ? 'behind' : 'ahead of'} ${formatTime(bestTime)}`, ahead: !zero && ms < 0 };
}

export function liveFigures({ bbbv = null, bbbvSolved = 0, clicks, flags = 0, mines = 0, elapsedMs = 0, bests } = {}) {
  const solved = known(bbbvSolved) ? bbbvSolved : 0;
  const elapsed = known(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
  const counts = { bbbvSolved: solved, elapsedMs: elapsed, clicks };
  const bestTime = bestValue(bests?.time);
  const bestRate = bestValue(bests?.bbbvPerSecond);
  const total = known(bbbv) && bbbv > 0 ? bbbv : null;
  const left = mines - flags;
  return {
    bbbv: { text: `${solved} / ${total ?? PLACEHOLDER}`, detail: null, progress: total ? Math.min(1, solved / total) : 0 },
    pace: paceFigure(total, solved, elapsed, bestTime),
    rate: { text: formatRate(bbbvPerSecond(counts)), detail: bestRate === null ? null : `PB ${formatRate(bestRate)}` },
    clicks: { text: String(countedClicks(clicks)), detail: `efficiency ${formatEfficiency(efficiency(counts))}` },
    flags: { text: String(flags), detail: `${left} mine${left === 1 ? '' : 's'} left` },
  };
}

export function changedFigures(previous, next) {
  if (!previous) return [...FIGURES];
  return FIGURES.filter((name) => {
    const a = previous[name], b = next[name];
    if (!a || !b) return a !== b;
    return a.text !== b.text || a.detail !== b.detail;
  });
}

export const figuresLine = (f) => `3BV ${f.bbbv.text}, ${f.flags.detail}`;
