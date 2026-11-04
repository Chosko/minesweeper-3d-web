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
// EQUAL_BEST ("equal": "best 94.7% · equal"), with no sign and no number.
//
// resultsContent({ summary, comparison, saved, notSaved, watch, watchBest, rank, streak, standing, swapped }) →
// the screen's content, top to bottom:
//   { outcome, title,
//     board       the mode's name (js/shell/challenge.js MODE_NAMES) and the board's label:
//                 "Classic 2D · Intermediate · no-guess", "Hexagon · Beginner",
//                 "3D · Cube Intermediate · no-guess";
//     rank        on a ranked win the chip "#3 of 12 wins on this board", from the flow's rank
//                 { position, of }; null on a loss, a challenge or without a rank;
//     label       a challenge's CHALLENGE_LABEL ("Challenge · not eligible for bests"), shown in the
//                 rank's place, or null;
//     tiles       the four figure tiles [{ key, label, value, detail, direction, newBest, progress }]:
//                 on a win time, 3BV/s, efficiency and 3BV (its detail BOARD_DIFFICULTY); on a loss
//                 time, 3BV solved ("40 / 120", progress { value, max } for its bar), 3BV/s and
//                 efficiency. With a comparison, a won tile's detail is the standing best and the
//                 difference ("best 45.120 s · +2.260 s"), or, when the game set that best, the best
//                 it replaced ("was 48.213 s · −0.833 s", newBest marking its "New best" badge); a
//                 difference that is a dash or EQUAL_BEST at display precision is left off a replaced
//                 best. direction is 'better', 'worse' or 'equal' (lower is better for time, higher
//                 for 3BV/s and efficiency; null without a difference). A challenge sets no best: its
//                 tiles show the standing best and the game's own difference, uncoloured and never
//                 badged. On a loss the time tile says LOSS_NO_BESTS and the 3BV/s and efficiency
//                 tiles show the standing best alone. Without a comparison (a failed recording) no
//                 tile carries a comparison;
//     details     the labelled rows [{ key, label, value }]: clicks ("128 · left 104 · right 24 ·
//                 chords 0 · wasted 0": the counted clicks, then the reveal clicks as left, the flag
//                 clicks as right and the chord clicks, effective plus wasted, and the wasted total —
//                 "reveal" and "flag" in place of left and right while `swapped`, the Classic 2D
//                 mouse button swap being on); then, with a comparison, next after a win ("beat <the
//                 board's best time as it stands> · streak <current>") or streak after a loss
//                 ("ended at <before> · longest <longest>" when it ended one, else "beat <best
//                 time>", or FIRST_BEST when the board has no best time) — a challenge's row is
//                 challenge (CHALLENGE_NOTE) instead; then winRate, when the recording saved one,
//                 from the flow's standing { winRate, completedWinRate, longestStreak }: after a win
//                 "67% · completed games 80% · longest streak 4", after a loss "67% · completed
//                 games 80%";
//     code        the game's board code (js/records/board-code.js codeOf — a daily's in its daily
//                 form), shown with Copy and Copy link; null for a game with no seed;
//     notes: [text], watch, watchBest, compact, look, over3d }
// streak is { before, current, longest }, the board's streak before this game and its counters
// after. notes say that the result could not be saved (saved false) or that records are not being
// saved this session (notSaved, told once by the flow); watch is whether Watch replay shows (the
// flow's watch), watchBest whether Watch best shows (the flow's watchBest, the best's replay id or
// null), compact whether the secondary actions take their small size (beside Watch best, so the
// bar stays one row); look is whether Look at the board shows and over3d whether the screen shows
// over the 3D scene — both a 3D game's; the finished board, 2D or 3D, shows behind the screen's
// scrim.
//
// createResultsView({ root, onPlayAgain, onWatch?, onWatchBest?, onRecords, onMenu, onLook?, onCopy? }) →
// { show(content), hide(), noteLook(text) }: fills the #results markup by id and calls back on its
// actions. The frame (#results-frame) carries data-outcome, which gives a loss its neutral head; the
// head the trophy tile on a win (#results-trophy), the title, the board line, the rank chip
// (#results-rank) — at the end of the board line instead ("3D · … · #9 of 42 wins on this board") over
// the 3D scene — or the challenge chip (#results-label); the tiles (#rs-<key>) each their value,
// detail line (data-delta its direction), the tile's data-new-best and its "New best"
// ui-chip--best, and 3BV solved its <progress>; the detail rows (#rd-clicks, #rd-target,
// #rd-winRate) their label and value, a row without one hidden; the code its group
// (#results-code-group: the "Board code" section label and the #results-code chip, bindCodeChip,
// js/ui/components.js), hidden without a code, whose Copy and Copy link call
// onCopy({ kind, code, select }). Look at the board (#r-look, in the head) shows only while
// content.look, the root then carrying `results--look`, under which Main menu shows no Esc key hint
// (css/style.css); Watch replay (#r-watch) only
// while content.watch and Watch best (#r-watch-best) only while content.watchBest; the secondary
// actions take ui-button--sm while content.compact; the root carries `results--over3d` while
// content.over3d. noteLook(text) shows the one-line note under the actions (LOOK_REFUSED: the
// pointer lock the look asked for was refused) until the card next shows.
//
// Keys: Play again is also Enter (resultsEnter, wired by js/main.js) and R (js/shell/pause.js
// restartInput); Enter on another focused action activates that action.

import { boardLabel, MODE_3D } from '../records/board.js';
import { countedClicks } from '../records/summary.js';
import { codeOf } from '../records/board-code.js';
import { MODE_NAMES } from '../shell/challenge.js';
import { bindCodeChip } from '../ui/components.js';

export const DASH = '—';
export const EQUAL_BEST = 'equal';
export const FIRST_BEST = 'Win this board to set a best';
/** The 3BV tile's detail line on a win. */
export const BOARD_DIFFICULTY = 'board difficulty';
/** A lost game's time tile: no tile of a loss is eligible. */
export const LOSS_NO_BESTS = 'Losses set no bests';
/** A challenge's chip on the results screen, in the rank's place, in the style of "Paused · not eligible". */
export const CHALLENGE_LABEL = 'Challenge · not eligible for bests';
/** A challenge's details row. */
export const CHALLENGE_NOTE = 'Kept in your history; sets no best and no rank';
export const MINUS = '−';

/** The note under the actions when the look's pointer lock was refused; a fresh press tries again. */
export const LOOK_REFUSED = 'The mouse could not be captured — press Look at the board again to retry.';

/** Notes the screen can carry. */
export const NOTES = Object.freeze({
  notRecorded: 'This result could not be saved.',
  notSaved: 'Records are not being saved this session.',
});

const missing = (v) => v === null || v === undefined || !Number.isFinite(v);
/** A best difference: EQUAL_BEST when its magnitude shows as zero, else signed. */
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

/**
 * The clicks row: "128 · left 104 · right 24 · chords 0 · wasted 0" — the reveal clicks as left and the
 * flag clicks as right, or, with `swapped` (the mouse buttons traded), "reveal" and "flag"; a dash for
 * what is missing.
 */
export function formatClicks(clicks, { swapped = false } = {}) {
  const kinds = ['reveal', 'flag', 'chord'];
  const [left, right] = swapped ? ['reveal', 'flag'] : ['left', 'right'];
  const known = clicks && kinds.every((k) => Number.isFinite(clicks[k]?.effective) && Number.isFinite(clicks[k]?.wasted));
  if (!known) return `${DASH} · ${left} ${DASH} · ${right} ${DASH} · chords ${DASH} · wasted ${DASH}`;
  const [reveal, flag, chord] = kinds.map((k) => clicks[k].effective + clicks[k].wasted);
  const wasted = kinds.reduce((n, k) => n + clicks[k].wasted, 0);
  return `${countedClicks(clicks)} · ${left} ${reveal} · ${right} ${flag} · chords ${chord} · wasted ${wasted}`;
}

const COMPARABLE = Object.freeze({
  time: { label: 'Time', lowerIsBetter: true, format: formatTime, difference: formatTimeDifference },
  bbbvPerSecond: { label: '3BV/s', lowerIsBetter: false, format: formatRate, difference: formatRateDifference },
  efficiency: { label: 'Efficiency', lowerIsBetter: false, format: formatEfficiency, difference: formatEfficiencyDifference },
});

/** A comparable tile's comparison: its detail line, the direction that colours it and whether the game set that best. */
function compared(stat, { summary, comparison, won, challenge }) {
  const { lowerIsBetter, format, difference: diff } = COMPARABLE[stat];
  const none = { detail: null, direction: null, newBest: false };
  if (!won) {
    if (stat === 'time') return { ...none, detail: LOSS_NO_BESTS };
    return comparison ? { ...none, detail: `best ${format(comparison[stat]?.best?.value ?? null)}` } : none;
  }
  if (!comparison) return none;
  const c = comparison[stat];
  const standing = c?.best ? c.best.value : null;
  const best = format(standing);
  if (challenge) {
    const own = summary[stat === 'time' ? 'elapsedMs' : stat];
    const d = diff(missing(own) || missing(standing) ? null : own - standing);
    return { ...none, detail: d === DASH ? `best ${best}` : `best ${best} · ${d}` };
  }
  const d = diff(c?.difference ?? null);
  const direction = d === DASH ? null : d === EQUAL_BEST ? 'equal' : (c.difference < 0) === lowerIsBetter ? 'better' : 'worse';
  if (c?.newBest === true) {
    const detail = standing === null ? null : d === DASH || d === EQUAL_BEST ? `was ${best}` : `was ${best} · ${d}`;
    return { detail, direction, newBest: true };
  }
  return { detail: d === DASH ? `best ${best}` : `best ${best} · ${d}`, direction, newBest: false };
}

export function resultsContent({
  summary, comparison = null, saved = true, notSaved = false, watch = false, watchBest = null, rank = null, streak = null, standing = null,
  swapped = false,
}) {
  const won = summary.outcome === 'won';
  const challenge = summary.challenge === true;
  const count = (v) => (missing(v) ? DASH : String(v));
  const ctx = { summary, comparison, won, challenge };
  const figure = (key, value) => ({ key, label: COMPARABLE[key].label, value, progress: null, ...compared(key, ctx) });
  const plain = { detail: null, direction: null, newBest: false, progress: null };
  const solved = summary.bbbvSolved;
  const tiles = won
    ? [
      figure('time', formatTime(summary.elapsedMs)),
      figure('bbbvPerSecond', formatRate(summary.bbbvPerSecond)),
      figure('efficiency', formatEfficiency(summary.efficiency)),
      { key: 'bbbv', label: '3BV', value: count(summary.bbbv), ...plain, detail: BOARD_DIFFICULTY },
    ]
    : [
      figure('time', formatTime(summary.elapsedMs)),
      {
        key: 'bbbvSolved', label: '3BV solved', value: `${count(solved)} / ${count(summary.bbbv)}`, ...plain,
        progress: missing(solved) || missing(summary.bbbv) || summary.bbbv <= 0 ? null : { value: solved, max: summary.bbbv },
      },
      figure('bbbvPerSecond', formatRate(summary.bbbvPerSecond)),
      figure('efficiency', formatEfficiency(summary.efficiency)),
    ];

  const details = [{ key: 'clicks', label: 'Clicks', value: formatClicks(summary.clicks, { swapped }) }];
  if (challenge) details.push({ key: 'challenge', label: 'Challenge', value: CHALLENGE_NOTE });
  else if (comparison) {
    const time = comparison.time;
    const bestTime = won && time?.newBest ? summary.elapsedMs : time?.best ? time.best.value : null;
    const beat = `beat ${formatTime(bestTime)}`;
    if (won) details.push({ key: 'next', label: 'Next target', value: `${beat} · streak ${count(streak?.current)}` });
    else {
      const value = streak?.before >= 1 ? `ended at ${streak.before} · longest ${count(streak.longest)}` : missing(bestTime) ? FIRST_BEST : beat;
      details.push({ key: 'streak', label: 'Streak', value });
    }
  }
  if (saved && standing) {
    const rates = `${formatWinRate(standing.winRate)} · completed games ${formatWinRate(standing.completedWinRate)}`;
    const longest = Number.isInteger(standing.longestStreak) ? String(standing.longestStreak) : DASH;
    details.push({ key: 'winRate', label: 'Win rate', value: won ? `${rates} · longest streak ${longest}` : rates });
  }

  const ranked = won && !challenge && Number.isInteger(rank?.position) && Number.isInteger(rank?.of);
  const notes = [];
  if (!saved) notes.push(NOTES.notRecorded);
  if (notSaved) notes.push(NOTES.notSaved);
  const best = typeof watchBest === 'string' && watchBest !== '';
  return {
    outcome: summary.outcome,
    title: won ? 'You won!' : 'Game over',
    board: `${MODE_NAMES[summary.board?.mode] ?? MODE_NAMES['classic-2d']} · ${boardLabel(summary.board)}`,
    rank: ranked ? `#${rank.position} of ${rank.of} wins on this board` : null,
    label: challenge ? CHALLENGE_LABEL : null,
    tiles,
    details,
    code: codeOf(summary),
    notes,
    watch: watch === true,
    watchBest: best,
    compact: best,
    look: summary.board?.mode === MODE_3D,
    over3d: summary.board?.mode === MODE_3D,
  };
}

/** The results screen's actions by id: Play again (its default focus), Watch replay, Watch best, Look at the board, Records, Main menu. */
export const RESULTS_ACTIONS = Object.freeze(['r-again', 'r-watch', 'r-watch-best', 'r-look', 'r-records', 'r-menu']);

/**
 * What Enter does on the results screen, given the id of the focused element (null for none):
 * 'playAgain' while the focus is on Play again or on no action; null while another action has it,
 * which Enter then activates as a button does; 'ignore' for a key's auto-repeat, which activates
 * nothing. R is Play again through the shell's restart keys (js/shell/pause.js restartInput).
 */
export function resultsEnter({ focused = null, repeat = false } = {}) {
  if (repeat) return 'ignore';
  return focused !== RESULTS_ACTIONS[0] && RESULTS_ACTIONS.includes(focused) ? null : 'playAgain';
}

export function createResultsView({
  root, onPlayAgain, onWatch = () => {}, onWatchBest = () => {}, onRecords, onMenu, onLook = () => {}, onCopy = () => {},
}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const show = (el, on) => el.classList.toggle('hidden', !on);
  const line = (id, text) => {
    $(id).textContent = text ?? '';
    show($(id), !!text);
  };
  $('r-again').addEventListener('click', () => onPlayAgain());
  $('r-look').addEventListener('click', () => onLook());
  $('r-watch').addEventListener('click', () => onWatch());
  $('r-watch-best').addEventListener('click', () => onWatchBest());
  $('r-records').addEventListener('click', () => onRecords());
  $('r-menu').addEventListener('click', () => onMenu());
  const code = bindCodeChip($('results-code'), { onCopy: (c) => onCopy(c) });
  const TILES = ['time', 'bbbvSolved', 'bbbvPerSecond', 'efficiency', 'bbbv'];
  const ROWS = { clicks: 'rd-clicks', next: 'rd-target', streak: 'rd-target', challenge: 'rd-target', winRate: 'rd-winRate' };
  const fillTile = (key, t) => {
    const tile = $(`rs-${key}`);
    show(tile, !!t);
    if (!t) return;
    tile.querySelector('.ui-stat__value').textContent = t.value;
    const detail = tile.querySelector('.ui-stat__detail');
    detail.textContent = t.detail ?? '';
    show(detail, !!t.detail);
    if (t.direction) detail.setAttribute('data-delta', t.direction);
    else detail.removeAttribute('data-delta');
    tile.toggleAttribute('data-new-best', !!t.newBest);
    if (key === 'bbbvSolved') {
      const bar = tile.querySelector('progress');
      bar.setAttribute('max', t.progress?.max ?? 1);
      bar.setAttribute('value', t.progress?.value ?? 0);
      show(bar, !!t.progress);
    } else if (key !== 'bbbv') show(tile.querySelector('.ui-chip'), !!t.newBest);
  };
  return {
    show(content) {
      const over3d = !!content.over3d;
      $('results-frame').setAttribute('data-outcome', content.outcome === 'won' ? 'won' : 'lost');
      show($('results-trophy'), content.outcome === 'won');
      $('results-title').textContent = content.title;
      $('results-board').textContent = over3d && content.rank ? `${content.board} · ${content.rank}` : content.board;
      line('results-rank', over3d ? null : content.rank);
      line('results-label', content.label);
      for (const key of TILES) fillTile(key, content.tiles.find((t) => t.key === key));
      for (const id of new Set(Object.values(ROWS))) show($(id), false);
      for (const d of content.details) {
        const row = $(ROWS[d.key]);
        row.querySelector('th').textContent = d.label;
        row.querySelector('td').textContent = d.value;
        show(row, true);
      }
      code.show(content.code ?? null);
      show($('results-code-group'), !!content.code);
      line('results-note', content.notes.join(' '));
      show($('r-look'), !!content.look);
      show($('r-watch'), !!content.watch);
      show($('r-watch-best'), !!content.watchBest);
      for (const id of ['r-watch', 'r-watch-best', 'r-records']) $(id).classList.toggle('ui-button--sm', !!content.compact);
      line('results-look-note', null);
      root.classList.toggle('results--over3d', over3d);
      root.classList.toggle('results--look', !!content.look);
      root.classList.remove('hidden');
    },
    hide() { root.classList.add('hidden'); },
    noteLook(text) { line('results-look-note', text); },
  };
}
