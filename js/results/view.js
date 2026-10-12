// Results view: the end-of-game screen's content and the #results screen it fills. The formats and
// resultsContent() are pure and DOM-free; createResultsView() binds the markup handed in.
//
// Time format. Every time the game shows — except the in-game overlay's timer and the replay
// viewer's playback clock, which keep the overlay's whole seconds — is formatTime(ms): seconds to
// the thousandth, truncated rather than rounded (47380 ms → "47.380 s"), so a shown time never
// beats the time actually played. The pause card, the records screen, the replay library, the
// replay viewer's recorded time and seek bar, and the leaderboard screen reuse it; the summary and
// the records keep the full milliseconds. 3BV/s shows two decimals and efficiency one decimal
// ("94.7%"); a stat that is not available shows DASH. A difference from a best carries the same
// precision and a sign, truncated toward zero for time; one that is zero at that precision reads
// EQUAL_BEST ("= best"), with no sign and no number.
//
// resultsContent({ summary, comparison, saved, notSaved, watch, rank, streak, standing }) → the
// screen's content, top to bottom:
//   { outcome, title, board,
//     banner      "New best time and 3BV/s!" naming the bests this game set, or null;
//     stats       [{ key, label, value, shown, newBest }] — the game's own figures, newBest marking
//                 each one that set a best;
//     figures     { clicks, rank } — the second row: "Clicks 183 (L 183 · R 0 · D 0 · wasted 0)",
//                 the counted clicks, then the reveal, flag and chord clicks (effective plus wasted)
//                 and the wasted total; on a win the rank "#3 of 12 on this board", else null;
//     next        the next-target line, or null without a comparison;
//     standing    the board's figures counting this game, the reference figure first and its
//                 completed-games figure beside it: "Win rate 67% (completed games 80%) · Longest
//                 streak 4 (completed games 5)", from the flow's standing { winRate,
//                 completedWinRate, longestStreak, longestCompletedStreak }; null without one (a
//                 recording that failed);
//     eligible, bestsNote, bests  [{ stat, label, best, difference, newBest, direction, detail }]
//                 | null — the bests panel;
//     notes: [text], watch, takeover }
// The bests panel shows whenever there is a comparison (the bests that stood before this game). On
// a win each detail is the difference, led by "New best" when the game set one (alone when the
// difference is a dash or "= best"), and direction is 'better', 'worse' or 'equal' (lower is better
// for time, higher for 3BV/s and efficiency; null without a difference). On a loss the panel is not
// eligible (bestsNote NOT_ELIGIBLE, direction null, never "New best"): each detail is the game's
// difference from the standing best, and the time's is the pace — the time at this game's rate,
// elapsed × 3BV ÷ 3BV solved, a dash with no 3BV solved — with its difference ("Pace 47.912 s ·
// +2.792 s"). rank is { position, of } from the results flow; streak is { before, current, longest },
// the board's streak before this game and its counters after. The next-target line: after a win
// "Beat <the board's best time as it stands> for a new best · streak <current>"; after a loss that
// ended a streak "Streak ended at <before> · best <longest>", else "Beat <best time> for a new best",
// or FIRST_BEST when the board has no best time. notes say that the result could not be saved
// (saved false) or that records are not being saved this session (notSaved, told once by the
// flow); watch is whether Watch replay shows (the flow's watch); takeover is whether the screen
// takes over on an opaque surface — a 3D game's, whose scene is not seen behind it, where the
// Classic 2D board stays visible behind the screen.
//
// createResultsView({ root, onPlayAgain, onWatch?, onRecords, onMenu }) → { show(content), hide() }:
// fills the #results markup by id and calls back on its actions; Watch replay (#r-watch) shows only
// while content.watch, the root carries `results--takeover` while content.takeover, the bests
// panel `ui-panel--muted` while not eligible, each improved stat `data-new-best` and each best's
// detail `data-delta` (its direction).

import { boardLabel, MODE_3D } from '../records/board.js';
import { countedClicks } from '../records/summary.js';

export const DASH = '—';
export const EQUAL_BEST = '= best';
export const NOT_ELIGIBLE = 'Not eligible — only won games set bests';
export const FIRST_BEST = 'Win this board to set a best';
const MINUS = '−';

/** Notes the screen can carry. */
export const NOTES = Object.freeze({
  notRecorded: 'This result could not be saved.',
  notSaved: 'Records are not being saved this session.',
});

const missing = (v) => v === null || v === undefined || !Number.isFinite(v);
/** A best difference: "= best" when its magnitude shows as zero, else signed. */
const difference = (v, magnitude, zero) => {
  if (missing(v)) return DASH;
  const text = magnitude(Math.abs(v));
  if (text === zero) return EQUAL_BEST;
  return v > 0 ? `+${text}` : `${MINUS}${text}`;
};

/** Seconds to the thousandth, truncated: 47380 ms → "47.380 s". */
export function formatTime(ms) {
  if (missing(ms)) return DASH;
  const whole = Math.trunc(Math.abs(ms));
  return `${Math.trunc(whole / 1000)}.${String(whole % 1000).padStart(3, '0')} s`;
}
/** A signed time difference, truncated toward zero: -1270 ms → "−1.270 s". */
export function formatTimeDifference(ms) { return difference(ms, formatTime, formatTime(0)); }
/** A win rate (0..1) as a whole percentage: 2/3 → "67%". */
export function formatWinRate(rate) {
  return rate === null || rate === undefined || !Number.isFinite(rate) ? DASH : `${Math.round(rate * 100)}%`;
}
/** 3BV/s to two decimals. */
export function formatRate(v) { return missing(v) ? DASH : v.toFixed(2); }
export function formatRateDifference(v) { return difference(v, (a) => a.toFixed(2), '0.00'); }
/** Efficiency to one decimal: "94.7%". */
export function formatEfficiency(v) { return missing(v) ? DASH : `${v.toFixed(1)}%`; }
export function formatEfficiencyDifference(v) { return difference(v, formatEfficiency, '0.0%'); }

/** The second row's clicks: "Clicks 183 (L 183 · R 0 · D 0 · wasted 0)"; a dash for what is missing. */
export function formatClicks(clicks) {
  const kinds = ['reveal', 'flag', 'chord'];
  const known = clicks && kinds.every((k) => Number.isFinite(clicks[k]?.effective) && Number.isFinite(clicks[k]?.wasted));
  if (!known) return `Clicks ${DASH} (L ${DASH} · R ${DASH} · D ${DASH} · wasted ${DASH})`;
  const [l, r, d] = kinds.map((k) => clicks[k].effective + clicks[k].wasted);
  const wasted = kinds.reduce((n, k) => n + clicks[k].wasted, 0);
  return `Clicks ${countedClicks(clicks)} (L ${l} · R ${r} · D ${d} · wasted ${wasted})`;
}

const rankText = (rank) => {
  const n = (v) => (Number.isInteger(v) ? String(v) : DASH);
  return `#${n(rank?.position)} of ${n(rank?.of)} on this board`;
};

/** The projected time at this game's rate, elapsed × 3BV ÷ 3BV solved; null with nothing solved. */
function pace(summary) {
  const { elapsedMs, bbbv, bbbvSolved } = summary;
  if (missing(elapsedMs) || missing(bbbv) || missing(bbbvSolved) || bbbvSolved <= 0) return null;
  return (elapsedMs * bbbv) / bbbvSolved;
}

const BESTS = Object.freeze([
  { stat: 'time', label: 'Best time', name: 'time', lowerIsBetter: true, format: formatTime, difference: formatTimeDifference },
  { stat: 'bbbvPerSecond', label: 'Best 3BV/s', name: '3BV/s', lowerIsBetter: false, format: formatRate, difference: formatRateDifference },
  { stat: 'efficiency', label: 'Best efficiency', name: 'efficiency', lowerIsBetter: false, format: formatEfficiency, difference: formatEfficiencyDifference },
]);

const listed = (names) => (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);

/** The standing line: each reference figure with its completed-games figure beside it. */
function standingText(s) {
  const count = (v) => (Number.isInteger(v) ? String(v) : DASH);
  return `Win rate ${formatWinRate(s.winRate)} (completed games ${formatWinRate(s.completedWinRate)})`
    + ` · Longest streak ${count(s.longestStreak)} (completed games ${count(s.longestCompletedStreak)})`;
}

export function resultsContent({
  summary, comparison = null, saved = true, notSaved = false, watch = false, rank = null, streak = null, standing = null,
}) {
  const won = summary.outcome === 'won';
  const count = (v) => (missing(v) ? DASH : String(v));
  const setBest = (stat) => won && comparison?.[stat]?.newBest === true;
  const stats = [
    { key: 'time', label: 'Time', value: formatTime(summary.elapsedMs), shown: true, newBest: setBest('time') },
    { key: 'bbbv', label: '3BV', value: count(summary.bbbv), shown: true, newBest: false },
    { key: 'bbbvSolved', label: '3BV solved', value: count(summary.bbbvSolved), shown: !won, newBest: false },
    { key: 'bbbvPerSecond', label: '3BV/s', value: formatRate(summary.bbbvPerSecond), shown: true, newBest: setBest('bbbvPerSecond') },
    { key: 'efficiency', label: 'Efficiency', value: formatEfficiency(summary.efficiency), shown: true, newBest: setBest('efficiency') },
  ];
  const set = BESTS.filter(({ stat }) => setBest(stat)).map(({ name }) => name);

  const bests = comparison
    ? BESTS.map(({ stat, label, lowerIsBetter, format, difference: diff }) => {
      const c = comparison[stat];
      const standing = c?.best ? c.best.value : null;
      if (won) {
        const d = diff(c?.difference ?? null);
        const newBest = c?.newBest === true;
        const direction = d === DASH ? null : d === EQUAL_BEST ? 'equal' : (c.difference < 0) === lowerIsBetter ? 'better' : 'worse';
        const detail = newBest ? (d === DASH || d === EQUAL_BEST ? 'New best' : `New best · ${d}`) : d;
        return { stat, label, best: format(standing), difference: d, newBest, direction, detail };
      }
      const own = stat === 'time' ? pace(summary) : summary[stat];
      const d = diff(missing(own) || missing(standing) ? null : own - standing);
      const detail = stat === 'time' ? `Pace ${formatTime(own)} · ${d}` : d;
      return { stat, label, best: format(standing), difference: d, newBest: false, direction: null, detail };
    })
    : null;

  let next = null;
  if (comparison) {
    const time = comparison.time;
    const bestTime = won && time?.newBest ? summary.elapsedMs : time?.best ? time.best.value : null;
    const beat = `Beat ${formatTime(bestTime)} for a new best`;
    if (won) next = `${beat} · streak ${count(streak?.current)}`;
    else if (streak?.before >= 1) next = `Streak ended at ${streak.before} · best ${count(streak.longest)}`;
    else next = missing(bestTime) ? FIRST_BEST : beat;
  }

  const notes = [];
  if (!saved) notes.push(NOTES.notRecorded);
  if (notSaved) notes.push(NOTES.notSaved);
  return {
    outcome: summary.outcome,
    title: won ? 'You won!' : 'Game over',
    board: boardLabel(summary.board),
    banner: set.length ? `New best ${listed(set)}!` : null,
    stats,
    figures: { clicks: formatClicks(summary.clicks), rank: won ? rankText(rank) : null },
    next,
    standing: saved && standing ? standingText(standing) : null,
    eligible: won,
    bestsNote: won ? null : NOT_ELIGIBLE,
    bests,
    notes,
    watch: watch === true,
    takeover: summary.board?.mode === MODE_3D,
  };
}

export function createResultsView({ root, onPlayAgain, onWatch = () => {}, onRecords, onMenu }) {
  const $ = (id) => root.querySelector(`#${id}`);
  const value = (id) => $(id).querySelector('.ui-stat__value');
  const line = (id, text) => {
    $(id).textContent = text ?? '';
    $(id).classList.toggle('hidden', !text);
  };
  $('r-again').addEventListener('click', () => onPlayAgain());
  $('r-watch').addEventListener('click', () => onWatch());
  $('r-records').addEventListener('click', () => onRecords());
  $('r-menu').addEventListener('click', () => onMenu());
  return {
    show(content) {
      $('results-title').textContent = content.title;
      $('results-board').textContent = content.board;
      line('results-banner', content.banner);
      for (const s of content.stats) {
        value(`rs-${s.key}`).textContent = s.value;
        $(`rs-${s.key}`).classList.toggle('hidden', !s.shown);
        $(`rs-${s.key}`).toggleAttribute('data-new-best', !!s.newBest);
      }
      line('results-figures', [content.figures.clicks, content.figures.rank].filter(Boolean).join(' · '));
      line('results-next', content.next);
      line('results-standing', content.standing);
      const panel = $('results-bests');
      panel.classList.toggle('hidden', !content.bests);
      panel.classList.toggle('ui-panel--muted', !!content.bests && !content.eligible);
      line('results-bests-note', content.bests ? content.bestsNote : null);
      for (const b of content.bests ?? []) {
        value(`rb-${b.stat}`).textContent = b.best;
        const detail = $(`rb-${b.stat}`).querySelector('.ui-stat__detail');
        detail.textContent = b.detail;
        detail.toggleAttribute('data-new-best', b.newBest);
        if (b.direction) detail.setAttribute('data-delta', b.direction);
        else detail.removeAttribute('data-delta');
      }
      line('results-note', content.notes.join(' '));
      $('r-watch').classList.toggle('hidden', !content.watch);
      root.classList.toggle('results--takeover', !!content.takeover);
      root.classList.remove('hidden');
    },
    hide() { root.classList.add('hidden'); },
  };
}
