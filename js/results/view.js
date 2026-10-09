// Results view: the end-of-game screen's content and the #results screen it fills. The formats and
// resultsContent() are pure and DOM-free; createResultsView() binds the markup handed in.
//
// Time format. Every time the game shows — except the in-game overlay's timer and the replay
// viewer's playback clock, which keep the overlay's whole seconds — is formatTime(ms): seconds to
// the tenth, truncated rather than rounded (47380 ms → "47.3 s"), so a shown time never beats the
// time actually played. The records screen, the replay library, the replay viewer's recorded time
// and the leaderboard screen reuse it; the summary and the records keep the full milliseconds.
// 3BV/s shows two decimals and efficiency a whole percentage; a stat that is not available shows
// DASH.
//
// resultsContent({ summary, comparison, saved, notSaved }) → the screen's content:
//   { outcome, title, board, stats: [{ key, label, value, shown }], bests: [{ stat, label, best,
//     difference, newBest }] | null, notes: [text] }
// The bests show on a win with a comparison (the bests that stood before this game); notes say
// that the result could not be saved (saved false) or that records are not being saved this
// session (notSaved, told once by the flow).
//
// createResultsView({ root, onPlayAgain, onRecords, onMenu }) → { show(content), hide() }: fills
// the #results markup by id and calls back on its three actions.

import { boardLabel } from '../records/board.js';

export const DASH = '—';
const MINUS = '−';

/** Notes the screen can carry. */
export const NOTES = Object.freeze({
  notRecorded: 'This result could not be saved.',
  notSaved: 'Records are not being saved this session.',
});

const missing = (v) => v === null || v === undefined || !Number.isFinite(v);
const signed = (v, text) => (v > 0 ? `+${text}` : v < 0 ? `${MINUS}${text}` : text);

/** Seconds to the tenth, truncated: 47380 ms → "47.3 s". */
export function formatTime(ms) {
  if (missing(ms)) return DASH;
  const tenths = Math.trunc(Math.abs(ms) / 100);
  return `${Math.trunc(tenths / 10)}.${tenths % 10} s`;
}
/** A signed time difference, truncated toward zero: -1270 ms → "−1.2 s". */
export function formatTimeDifference(ms) {
  return missing(ms) ? DASH : signed(ms, formatTime(Math.abs(ms)));
}
/** 3BV/s to two decimals. */
export function formatRate(v) { return missing(v) ? DASH : v.toFixed(2); }
export function formatRateDifference(v) { return missing(v) ? DASH : signed(v, Math.abs(v).toFixed(2)); }
/** Efficiency as a whole percentage. */
export function formatEfficiency(v) { return missing(v) ? DASH : `${Math.round(v)}%`; }
export function formatEfficiencyDifference(v) { return missing(v) ? DASH : signed(v, `${Math.round(Math.abs(v))}%`); }

const BESTS = Object.freeze([
  { stat: 'time', label: 'Best time', format: formatTime, difference: formatTimeDifference },
  { stat: 'bbbvPerSecond', label: 'Best 3BV/s', format: formatRate, difference: formatRateDifference },
  { stat: 'efficiency', label: 'Best efficiency', format: formatEfficiency, difference: formatEfficiencyDifference },
]);

export function resultsContent({ summary, comparison = null, saved = true, notSaved = false }) {
  const won = summary.outcome === 'won';
  const count = (v) => (missing(v) ? DASH : String(v));
  const stats = [
    { key: 'time', label: 'Time', value: formatTime(summary.elapsedMs), shown: true },
    { key: 'bbbv', label: '3BV', value: count(summary.bbbv), shown: true },
    { key: 'bbbvSolved', label: '3BV solved', value: count(summary.bbbvSolved), shown: !won },
    { key: 'bbbvPerSecond', label: '3BV/s', value: formatRate(summary.bbbvPerSecond), shown: true },
    { key: 'efficiency', label: 'Efficiency', value: formatEfficiency(summary.efficiency), shown: true },
  ];
  const bests = won && comparison
    ? BESTS.map(({ stat, label, format, difference }) => {
      const c = comparison[stat];
      return { stat, label, best: format(c?.best ? c.best.value : null), difference: difference(c?.difference ?? null), newBest: !!c?.newBest };
    })
    : null;
  const notes = [];
  if (!saved) notes.push(NOTES.notRecorded);
  if (notSaved) notes.push(NOTES.notSaved);
  return {
    outcome: summary.outcome,
    title: won ? 'You won!' : 'Game over',
    board: boardLabel(summary.board),
    stats,
    bests,
    notes,
  };
}

/** The best's detail line: its difference, led by "New best" when the game set one. */
const bestDetail = (b) => (b.newBest ? (b.difference === DASH ? 'New best' : `New best · ${b.difference}`) : b.difference);

export function createResultsView({ root, onPlayAgain, onRecords, onMenu }) {
  const $ = (id) => root.querySelector(`#${id}`);
  const value = (id) => $(id).querySelector('.ui-stat__value');
  $('r-again').addEventListener('click', () => onPlayAgain());
  $('r-records').addEventListener('click', () => onRecords());
  $('r-menu').addEventListener('click', () => onMenu());
  return {
    show(content) {
      $('results-title').textContent = content.title;
      $('results-board').textContent = content.board;
      for (const s of content.stats) {
        value(`rs-${s.key}`).textContent = s.value;
        $(`rs-${s.key}`).classList.toggle('hidden', !s.shown);
      }
      $('results-bests').classList.toggle('hidden', !content.bests);
      for (const b of content.bests ?? []) {
        value(`rb-${b.stat}`).textContent = b.best;
        const detail = $(`rb-${b.stat}`).querySelector('.ui-stat__detail');
        detail.textContent = bestDetail(b);
        detail.toggleAttribute('data-new-best', b.newBest);
      }
      const note = $('results-note');
      note.textContent = content.notes.join(' ');
      note.classList.toggle('hidden', !content.notes.length);
      root.classList.remove('hidden');
    },
    hide() { root.classList.add('hidden'); },
  };
}
