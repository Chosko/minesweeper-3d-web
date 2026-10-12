// Results screen (js/results/): the time and stat formats, the screen's content from a summary and
// its comparison, the results flow over fakes, the #results markup and its wiring in js/main.js,
// and in a browser a fixed Beginner board won through the real shell, then Play again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  formatTime, formatTimeDifference, formatRate, formatRateDifference, formatEfficiency,
  formatEfficiencyDifference, formatClicks, resultsContent, createResultsView, DASH, NOTES, EQUAL_BEST, NOT_ELIGIBLE,
  RESULTS_ACTIONS, resultsEnter,
} from '../js/results/view.js';
import { restartInput } from '../js/shell/pause.js';
import { createEndSkip } from '../js/shell/end-skip.js';
import { pauseLine } from '../js/ui.js';
import { createResultsFlow, RESULTS_SCREEN } from '../js/results/flow.js';
import { createBoardIdentity } from '../js/records/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
const summary = (over = {}) => ({
  id: 'g1', board: { ...BEGINNER }, outcome: 'won', elapsedMs: 47380, bbbv: 120, bbbvSolved: 120, clicks: clicks(138),
  bbbvPerSecond: 120 / 47.38, efficiency: (100 * 120) / 138, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});
const comparison = {
  time: { best: { id: 'a', value: 45120, endedAt: 'x' }, value: 47380, difference: 2260, newBest: false },
  bbbvPerSecond: { best: { id: 'b', value: 2.4, endedAt: 'x' }, value: 2.5327, difference: 0.1327, newBest: true },
  efficiency: { best: null, value: 86.96, difference: null, newBest: true },
};

// ---------------------------------------------------------------- formats

test('times show to the thousandth of a second, truncated, never rounded', () => {
  assert.equal(formatTime(13343), '13.343 s');
  assert.equal(formatTime(47380), '47.380 s');
  assert.equal(formatTime(47999.9), '47.999 s');
  assert.equal(formatTime(0), '0.000 s');
  assert.equal(formatTime(9), '0.009 s');
  assert.equal(formatTime(99.99), '0.099 s');
  assert.equal(formatTime(4700), '4.700 s');
  assert.equal(formatTime(612345), '612.345 s');
  assert.equal(formatTime(null), DASH);
  assert.equal(formatTime(undefined), DASH);
  assert.equal(formatTime(Number.NaN), DASH);
});

test('a time difference shows the same precision, signed, truncated toward zero; none at that precision is "= best"', () => {
  assert.equal(EQUAL_BEST, '= best');
  assert.equal(formatTimeDifference(2280), '+2.280 s');
  assert.equal(formatTimeDifference(-1270), '−1.270 s');
  assert.equal(formatTimeDifference(-50), '−0.050 s');
  assert.equal(formatTimeDifference(1.9), '+0.001 s');
  assert.equal(formatTimeDifference(0), EQUAL_BEST);
  assert.equal(formatTimeDifference(0.6), EQUAL_BEST, 'under a millisecond is no difference');
  assert.equal(formatTimeDifference(-0.9), EQUAL_BEST);
  assert.equal(formatTimeDifference(null), DASH);
});

test('3BV/s shows two decimals and efficiency one decimal; a difference of zero at that precision is "= best"', () => {
  assert.equal(formatRate(2.5327), '2.53');
  assert.equal(formatRate(0), '0.00');
  assert.equal(formatRate(null), DASH);
  assert.equal(formatRateDifference(0.1327), '+0.13');
  assert.equal(formatRateDifference(-0.5), '−0.50');
  assert.equal(formatRateDifference(0), EQUAL_BEST);
  assert.equal(formatRateDifference(0.004), EQUAL_BEST);
  assert.equal(formatRateDifference(-0.004), EQUAL_BEST);
  assert.equal(formatRateDifference(null), DASH);
  assert.equal(formatEfficiency(86.96), '87.0%');
  assert.equal(formatEfficiency(94.7), '94.7%');
  assert.equal(formatEfficiency(100), '100.0%');
  assert.equal(formatEfficiency(null), DASH);
  assert.equal(formatEfficiencyDifference(0.3), '+0.3%', '94.7 % → 95.0 % is a real gain');
  assert.equal(formatEfficiencyDifference(-4.6), '−4.6%');
  assert.equal(formatEfficiencyDifference(3), '+3.0%');
  assert.equal(formatEfficiencyDifference(0), EQUAL_BEST, 'a tie has no sign and no number');
  assert.equal(formatEfficiencyDifference(0.04), EQUAL_BEST);
  assert.equal(formatEfficiencyDifference(null), DASH);
});

test('the click row: counted clicks, then reveal, flag and chord clicks and the wasted total', () => {
  const c = { reveal: { effective: 150, wasted: 3 }, flag: { effective: 20, wasted: 2 }, chord: { effective: 7, wasted: 1 } };
  assert.equal(formatClicks(c), 'Clicks 183 (L 153 · R 22 · D 8 · wasted 6)');
  assert.equal(formatClicks(clicks(0)), 'Clicks 0 (L 0 · R 0 · D 0 · wasted 0)');
  assert.equal(formatClicks(null), `Clicks ${DASH} (L ${DASH} · R ${DASH} · D ${DASH} · wasted ${DASH})`);
});

test('one time format outside the live bar: the results view formats, the pause card reuses them', () => {
  const src = read('js/results/view.js');
  assert.match(src, /export function formatTime\(/);
  assert.doesNotMatch(formatTime.toString(), /toFixed|Math\.round/, 'time is truncated, never rounded');
  assert.doesNotMatch(src, /document|window/, 'the formats and the content are DOM-free at import');
  const ui = read('js/ui.js');
  assert.doesNotMatch(ui, /fmtTime/, 'no second time format in js/ui.js');
  assert.match(ui, /import \{[^}]*formatTime[^}]*\} from '\.\/results\/view\.js'/);
  assert.equal(pauseLine(11.643, 12), 'Time 11.643 s · 12 mines left');
  assert.equal(pauseLine(11643 / 1000, 1), 'Time 11.643 s · 1 mine left', 'seconds back to whole milliseconds');
  assert.equal(pauseLine(0, 0), 'Time 0.000 s · 0 mines left');
  assert.match(ui, /pauseSub\.textContent = pauseLine\(/, 'the pause card shows that line');
});

// ---------------------------------------------------------------- content

const statValue = (content, key) => content.stats.find((s) => s.key === key);
const best = (content, stat) => content.bests.find((b) => b.stat === stat);

test('a won game shows its outcome, board, stats and the three best comparisons', () => {
  const c = resultsContent({ summary: summary(), mode: 'classic-2d', comparison, saved: true, notSaved: false });
  assert.equal(c.outcome, 'won');
  assert.equal(c.title, 'You won!');
  assert.equal(c.board, 'Beginner');
  assert.deepEqual(c.stats.filter((s) => s.shown).map((s) => [s.key, s.label, s.value]), [
    ['time', 'Time', '47.380 s'],
    ['bbbv', '3BV', '120'],
    ['bbbvPerSecond', '3BV/s', '2.53'],
    ['efficiency', 'Efficiency', '87.0%'],
  ]);
  assert.equal(statValue(c, 'bbbvSolved').shown, false, '3BV solved only on a loss');
  assert.equal(c.eligible, true);
  assert.equal(c.bestsNote, null);
  assert.deepEqual(c.bests.map((b) => [b.stat, b.label, b.best, b.difference, b.newBest, b.direction, b.detail]), [
    ['time', 'Best time', '45.120 s', '+2.260 s', false, 'worse', '+2.260 s'],
    ['bbbvPerSecond', 'Best 3BV/s', '2.40', '+0.13', true, 'better', 'New best · +0.13'],
    ['efficiency', 'Best efficiency', DASH, DASH, true, null, 'New best'],
  ]);
  assert.deepEqual(c.notes, []);
});

test('the best time and its difference are truncated like every other time', () => {
  const cmp = { ...comparison, time: { best: { id: 'a', value: 47389, endedAt: 'x' }, value: 46010, difference: -1379, newBest: true } };
  const c = resultsContent({ summary: summary({ elapsedMs: 46010 }), comparison: cmp, saved: true });
  assert.equal(statValue(c, 'time').value, '46.010 s');
  assert.deepEqual([best(c, 'time').best, best(c, 'time').difference, best(c, 'time').newBest], ['47.389 s', '−1.379 s', true]);
});

test('delta direction: lower is better for time, higher for 3BV/s and efficiency; none at display precision is "= best"', () => {
  const cmp = {
    time: { best: { id: 'a', value: 50000, endedAt: 'x' }, value: 47380, difference: -2620, newBest: true },
    bbbvPerSecond: { best: { id: 'b', value: 2.6, endedAt: 'x' }, value: 2.5327, difference: -0.0673, newBest: false },
    efficiency: { best: { id: 'c', value: 86.96, endedAt: 'x' }, value: 86.96, difference: 0, newBest: false },
  };
  const c = resultsContent({ summary: summary(), comparison: cmp, saved: true });
  assert.deepEqual(c.bests.map((b) => [b.stat, b.direction, b.detail]), [
    ['time', 'better', 'New best · −2.620 s'],
    ['bbbvPerSecond', 'worse', '−0.07'],
    ['efficiency', 'equal', '= best'],
  ]);
  // A new best whose difference is zero at display precision reads "New best" alone.
  const tiny = { ...cmp, time: { best: { id: 'a', value: 47380.4, endedAt: 'x' }, value: 47380, difference: -0.4, newBest: true } };
  const t = best(resultsContent({ summary: summary(), comparison: tiny, saved: true }), 'time');
  assert.deepEqual([t.difference, t.direction, t.detail], [EQUAL_BEST, 'equal', 'New best']);
});

test('a new best is a visible event: a banner names the bests set, and each improved figure is highlighted', () => {
  const c = resultsContent({ summary: summary(), comparison, saved: true });
  assert.equal(c.banner, 'New best 3BV/s and efficiency!');
  assert.deepEqual(c.stats.filter((s) => s.newBest).map((s) => s.key), ['bbbvPerSecond', 'efficiency']);
  const all = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, newBest: true }]));
  assert.equal(resultsContent({ summary: summary(), comparison: all, saved: true }).banner, 'New best time, 3BV/s and efficiency!');
  const two = { ...comparison, time: { ...comparison.time, newBest: true }, efficiency: { ...comparison.efficiency, newBest: false } };
  assert.equal(resultsContent({ summary: summary(), comparison: two, saved: true }).banner, 'New best time and 3BV/s!');
  const none = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, newBest: false }]));
  const plain = resultsContent({ summary: summary(), comparison: none, saved: true });
  assert.equal(plain.banner, null);
  assert.deepEqual(plain.stats.filter((s) => s.newBest), []);
});

test('the second row: the clicks on wins and losses alike, the board rank on a win, a dash for what is missing', () => {
  const won = resultsContent({ summary: summary(), comparison, saved: true, rank: { position: 3, of: 12 } });
  assert.deepEqual(won.figures, { clicks: 'Clicks 138 (L 138 · R 0 · D 0 · wasted 0)', rank: '#3 of 12 on this board' });
  const unranked = resultsContent({ summary: summary(), comparison: null, saved: false });
  assert.equal(unranked.figures.rank, `#${DASH} of ${DASH} on this board`);
  const lost = resultsContent({ summary: summary({ outcome: 'lost', bbbvSolved: 40, clicks: clicks(60) }), comparison, saved: true });
  assert.deepEqual(lost.figures, { clicks: 'Clicks 60 (L 60 · R 0 · D 0 · wasted 0)', rank: null }, 'no rank on a loss');
  const noClicks = resultsContent({ summary: summary({ clicks: undefined }), comparison, saved: true, rank: { position: 1, of: 1 } });
  assert.match(noClicks.figures.clicks, /^Clicks — \(/);
  assert.ok(!JSON.stringify(won).includes('IOE'), 'the card shows no IOE');
});

const lostSummary = (over = {}) => summary({
  outcome: 'lost', elapsedMs: 20000, bbbvSolved: 40, bbbvPerSecond: 40 / 20, efficiency: (100 * 40) / 60, clicks: clicks(60), ...over,
});
const lostComparison = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, value: null, difference: null, newBest: false }]));

test('a lost game shows 3BV solved and the comparison greyed, not eligible, with its pace', () => {
  const c = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true });
  assert.equal(c.title, 'Game over');
  assert.deepEqual([statValue(c, 'bbbv').value, statValue(c, 'bbbvSolved').value, statValue(c, 'bbbvSolved').shown], ['120', '40', true]);
  assert.equal(statValue(c, 'bbbvPerSecond').value, '2.00');
  assert.equal(c.eligible, false);
  assert.equal(c.bestsNote, 'Not eligible — only won games set bests');
  assert.equal(c.banner, null);
  // pace: 20 000 ms × 120 ÷ 40 = 60 000 ms, against the best 45 120 ms
  assert.deepEqual(c.bests.map((b) => [b.stat, b.best, b.difference, b.newBest, b.direction, b.detail]), [
    ['time', '45.120 s', '+14.880 s', false, null, 'Pace 60.000 s · +14.880 s'],
    ['bbbvPerSecond', '2.40', '−0.40', false, null, '−0.40'],
    ['efficiency', DASH, DASH, false, null, DASH],
  ]);
  assert.ok(c.bests.every((b) => !/New best/.test(b.detail)), 'never "New best" on a loss');
  assert.deepEqual(c.stats.filter((s) => s.newBest), []);
});

test('a loss with no 3BV solved has no pace; a board with no best yet shows dashes', () => {
  const none = resultsContent({ summary: lostSummary({ bbbvSolved: 0, bbbvPerSecond: 0, efficiency: 0 }), comparison: lostComparison, saved: true });
  assert.equal(best(none, 'time').detail, `Pace ${DASH} · ${DASH}`);
  const empty = Object.fromEntries(Object.keys(comparison).map((k) => [k, { best: null, value: null, difference: null, newBest: false }]));
  const first = resultsContent({ summary: lostSummary(), comparison: empty, saved: true });
  assert.deepEqual(first.bests.map((b) => [b.best, b.detail]), [[DASH, `Pace 60.000 s · ${DASH}`], [DASH, DASH], [DASH, DASH]]);
});

test('the next-target line after a win: the board\'s best time as it stands and its current streak', () => {
  const streak = { before: 2, current: 3, longest: 5 };
  const kept = resultsContent({ summary: summary(), comparison, saved: true, streak });
  assert.equal(kept.next, 'Beat 45.120 s for a new best · streak 3', 'the standing best when this game did not beat it');
  const beaten = { ...comparison, time: { best: { id: 'a', value: 48213, endedAt: 'x' }, value: 47380, difference: -833, newBest: true } };
  assert.equal(resultsContent({ summary: summary(), comparison: beaten, saved: true, streak }).next,
    'Beat 47.380 s for a new best · streak 3', 'this game\'s time once it is the best');
});

test('the next-target line after a loss: the streak it ended, else the best to beat, else a first win', () => {
  const ended = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, streak: { before: 3, current: 0, longest: 7 } });
  assert.equal(ended.next, 'Streak ended at 3 · best 7');
  const noStreak = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, streak: { before: 0, current: 0, longest: 7 } });
  assert.equal(noStreak.next, 'Beat 45.120 s for a new best');
  const empty = Object.fromEntries(Object.keys(comparison).map((k) => [k, { best: null, value: null, difference: null, newBest: false }]));
  const firstGame = resultsContent({ summary: lostSummary(), comparison: empty, saved: true, streak: { before: 0, current: 0, longest: 0 } });
  assert.equal(firstGame.next, 'Win this board to set a best');
});

test('the board\'s standing after a won or lost game: the reference win rate and longest streak, each with its completed-games figure beside it', () => {
  const standing = { winRate: 4 / 6, completedWinRate: 0.8, longestStreak: 4, longestCompletedStreak: 5 };
  const won = resultsContent({ summary: summary(), comparison, saved: true, standing });
  assert.equal(won.standing, 'Win rate 67% (completed games 80%) · Longest streak 4 (completed games 5)');
  const lost = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, standing });
  assert.equal(lost.standing, won.standing, 'a loss shows the same line');
  const none = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true,
    standing: { winRate: 0, completedWinRate: null, longestStreak: 0, longestCompletedStreak: 0 } });
  assert.equal(none.standing, `Win rate 0% (completed games ${DASH}) · Longest streak 0 (completed games 0)`);
  assert.equal(resultsContent({ summary: summary(), comparison: null, saved: false }).standing, null, 'a failed recording shows no figures line');
  assert.equal(resultsContent({ summary: summary(), comparison }).standing, null, 'nor does a game the flow gave none');
});

test('a stat that is not available shows a dash', () => {
  const c = resultsContent({ summary: summary({ bbbvPerSecond: null, efficiency: null }), comparison, saved: true });
  assert.equal(statValue(c, 'bbbvPerSecond').value, DASH);
  assert.equal(statValue(c, 'efficiency').value, DASH);
});

test('a failed recording shows the game without a comparison or a next target, and says it was not saved', () => {
  const c = resultsContent({ summary: summary(), comparison: null, saved: false, notSaved: false });
  assert.equal(c.bests, null);
  assert.equal(c.next, null);
  assert.equal(c.banner, null);
  assert.equal(statValue(c, 'time').value, '47.380 s');
  assert.deepEqual(c.notes, [NOTES.notRecorded]);
  const lost = resultsContent({ summary: lostSummary(), comparison: null, saved: false });
  assert.equal(lost.bests, null, 'a loss whose recording failed shows no comparison either');
  const told = resultsContent({ summary: summary(), comparison, saved: true, notSaved: true });
  assert.deepEqual(told.notes, [NOTES.notSaved]);
  assert.ok(told.bests, 'records kept for the session still compare');
});

// ---------------------------------------------------------------- the view's binding

// A fake #results root: every element by id, with classes, attributes and a detail child.
function fakeRoot() {
  const els = {};
  const el = (id) => {
    if (els[id]) return els[id];
    const classes = new Set();
    const attrs = new Map();
    const kids = {};
    const node = {
      id, textContent: '', attrs,
      classList: {
        toggle: (c, on) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); },
        add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c),
      },
      addEventListener() {},
      setAttribute: (n, v) => attrs.set(n, String(v)),
      removeAttribute: (n) => attrs.delete(n),
      toggleAttribute: (n, on) => { if (on ?? !attrs.has(n)) attrs.set(n, ''); else attrs.delete(n); },
      querySelector: (sel) => (kids[sel] ??= el(`${id} ${sel}`)),
    };
    els[id] = node;
    return node;
  };
  return { el, querySelector: (sel) => el(sel.replace(/^#/, '')), classList: el('root').classList };
}

test('the view colours a win\'s deltas, greys a loss\'s panel under its note, and clears a win\'s colours on the next loss', () => {
  const root = fakeRoot();
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  const delta = (stat) => root.el(`rb-${stat} .ui-stat__detail`).attrs.get('data-delta');
  const cmp = {
    time: { best: { id: 'a', value: 50000, endedAt: 'x' }, value: 47380, difference: -2620, newBest: true },
    bbbvPerSecond: { best: { id: 'b', value: 2.6, endedAt: 'x' }, value: 2.5327, difference: -0.0673, newBest: false },
    efficiency: { best: { id: 'c', value: 86.96, endedAt: 'x' }, value: 86.96, difference: 0, newBest: false },
  };
  view.show(resultsContent({ summary: summary(), comparison: cmp, saved: true }));
  assert.deepEqual(['time', 'bbbvPerSecond', 'efficiency'].map(delta), ['better', 'worse', 'equal']);
  assert.equal(root.el('rb-time .ui-stat__detail').textContent, 'New best · −2.620 s');
  assert.equal(root.el('results-bests').classList.contains('ui-panel--muted'), false, 'a win is not greyed');
  assert.equal(root.el('results-bests-note').classList.contains('hidden'), true);
  assert.equal(root.el('rs-time').attrs.has('data-new-best'), true, 'the improved figure is highlighted');
  assert.equal(root.el('results-banner').textContent, 'New best time!');

  const lost = summary({ outcome: 'lost', elapsedMs: 20000, bbbvSolved: 40, bbbvPerSecond: 2, efficiency: 66.7, clicks: clicks(60) });
  const lostCmp = Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, { ...v, value: null, difference: null, newBest: false }]));
  view.show(resultsContent({ summary: lost, comparison: lostCmp, saved: true }));
  assert.equal(root.el('results-bests').classList.contains('hidden'), false, 'a loss shows the comparison');
  assert.equal(root.el('results-bests').classList.contains('ui-panel--muted'), true, 'greyed');
  assert.equal(root.el('results-bests-note').classList.contains('hidden'), false);
  assert.equal(root.el('results-bests-note').textContent, NOT_ELIGIBLE);
  assert.deepEqual(['time', 'bbbvPerSecond', 'efficiency'].map(delta), [undefined, undefined, undefined], 'no delta colour is left from the win');
  assert.equal(root.el('rs-time').attrs.has('data-new-best'), false);
  assert.equal(root.el('results-banner').classList.contains('hidden'), true);

  view.show(resultsContent({ summary: summary(), comparison: null, saved: false }));
  assert.equal(root.el('results-bests').classList.contains('hidden'), true, 'a failed recording shows no comparison');
  assert.equal(root.el('results-bests').classList.contains('ui-panel--muted'), false);
});

test('the view shows the standing line under the next target, and hides it when there is none', () => {
  const root = fakeRoot();
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  const standing = { winRate: 0.5, completedWinRate: 1, longestStreak: 2, longestCompletedStreak: 3 };
  view.show(resultsContent({ summary: summary(), comparison, saved: true, standing }));
  assert.equal(root.el('results-standing').textContent, 'Win rate 50% (completed games 100%) · Longest streak 2 (completed games 3)');
  assert.equal(root.el('results-standing').classList.contains('hidden'), false);
  view.show(resultsContent({ summary: summary(), comparison: null, saved: false }));
  assert.equal(root.el('results-standing').classList.contains('hidden'), true);
});

// ---------------------------------------------------------------- flow

const STREAK_BEFORE = { games: 5, wins: 3, currentStreak: 2, longestStreak: 4, completed: 4, currentCompletedStreak: 2, longestCompletedStreak: 5 };
const STREAK_AFTER = { games: 6, wins: 4, currentStreak: 3, longestStreak: 4, completed: 5, currentCompletedStreak: 3, longestCompletedStreak: 5 };
const STANDING = { winRate: 4 / 6, completedWinRate: 4 / 5, longestStreak: 4, longestCompletedStreak: 5 };
const HISTORY = [
  { id: 'h1', outcome: 'won', elapsedMs: 52000 },
  { id: 'h2', outcome: 'won', elapsedMs: 47380 }, // a tie ranks the earlier game first
  { id: 'h3', outcome: 'lost', elapsedMs: 9000 }, // a loss never ranks
  { id: 'h4', outcome: 'won', elapsedMs: 41000 },
  { id: 'g1', outcome: 'won', elapsedMs: 47380 },
];
function fakeRecords({ fail = false, available = true, history = HISTORY } = {}) {
  const calls = [];
  let recorded = false;
  return {
    calls,
    record(s) { calls.push(['record', s.id]); if (fail) throw new RangeError('broken'); recorded = true; return comparison; },
    available() { calls.push(['available']); return available; },
    counters(board) { calls.push(['counters', board.mode]); return recorded ? STREAK_AFTER : STREAK_BEFORE; },
    history(board) { calls.push(['history', board.mode]); return history; },
    winRate(board) { calls.push(['winRate', board.mode]); return STANDING.winRate; },
    completedWinRate(board) { calls.push(['completedWinRate', board.mode]); return STANDING.completedWinRate; },
  };
}
function fakeRouter(screens = ['results', 'coming-soon']) {
  const routes = [];
  return { routes, has: (n) => screens.includes(n), go: (n, o) => routes.push([n, o?.data]) };
}
function fakePauser() {
  const hooks = {};
  return { hooks, attach(name, fn) { (hooks[name] ??= new Set()).add(fn); return () => hooks[name].delete(fn); } };
}

test('the flow records a finished game before the results screen shows, and routes with the comparison', () => {
  const records = fakeRecords();
  const router = fakeRouter();
  const order = [];
  const flow = createResultsFlow({
    records: { ...records, record: (s) => { order.push('record'); return records.record(s); } },
    router: { ...router, go: (n, o) => { order.push('route'); router.go(n, o); } },
    restart() {}, goMenu() {},
  });
  const pauser = fakePauser();
  const detach = flow.attach(pauser);
  assert.equal(pauser.hooks.finished.size, 1, 'attached to the game-finished hand-off');
  const s = summary();
  for (const fn of pauser.hooks.finished) fn(s, 'classic-2d');
  assert.deepEqual(order, ['record', 'route']);
  assert.equal(RESULTS_SCREEN, 'results');
  assert.deepEqual(router.routes, [['results', {
    summary: s, mode: 'classic-2d', comparison, saved: true, notSaved: false, watch: false,
    rank: { position: 3, of: 4 }, streak: { before: 2, current: 3, longest: 4 }, standing: STANDING,
  }]]);
  assert.equal(flow.current.summary, s);
  detach();
  assert.equal(pauser.hooks.finished.size, 0);
});

test('the flow reads the board\'s streak before recording and its history after, for the next target and the rank', () => {
  const records = fakeRecords();
  const flow = createResultsFlow({ records, router: fakeRouter(), restart() {}, goMenu() {} });
  const data = flow.finished(summary(), 'classic-2d');
  assert.deepEqual(records.calls, [['counters', 'classic-2d'], ['record', 'g1'], ['counters', 'classic-2d'], ['history', 'classic-2d'],
    ['winRate', 'classic-2d'], ['completedWinRate', 'classic-2d'], ['available']]);
  assert.deepEqual(data.standing, STANDING, 'the board\'s standing counting this game');
  // 1 + the earlier won games at or below 47 380 ms (h2's tie, h4) of the board's 4 won games, this one included
  assert.deepEqual(data.rank, { position: 3, of: 4 });
  assert.deepEqual(data.streak, { before: 2, current: 3, longest: 4 });
  const fastest = flow.finished(summary({ id: 'g9', elapsedMs: 30000 }), 'classic-2d');
  assert.deepEqual(fastest.rank, { position: 1, of: 5 }, 'a game missing from the history still counts itself');
});

test('a loss has no rank but its streak and standing; a failed recording has none of them', () => {
  const lost = createResultsFlow({ records: fakeRecords(), router: fakeRouter(), restart() {}, goMenu() {} })
    .finished(summary({ outcome: 'lost' }), 'classic-2d');
  assert.equal(lost.rank, null);
  assert.deepEqual(lost.streak, { before: 2, current: 3, longest: 4 });
  assert.deepEqual(lost.standing, STANDING);
  const failed = createResultsFlow({ records: fakeRecords({ fail: true }), router: fakeRouter(), restart() {}, goMenu() {} })
    .finished(summary(), 'classic-2d');
  assert.deepEqual([failed.rank, failed.streak, failed.standing], [null, null, null]);
});

test('a records query that throws leaves its figure out and never stops the results screen', () => {
  const records = { ...fakeRecords(), counters() { throw new Error('broken'); }, history() { throw new Error('broken'); }, winRate() { throw new Error('broken'); } };
  const router = fakeRouter();
  const error = console.error;
  console.error = () => {};
  try {
    const data = createResultsFlow({ records, router, restart() {}, goMenu() {} }).finished(summary(), 'classic-2d');
    assert.deepEqual([data.rank, data.streak, data.standing, data.saved], [null, null, null, true]);
    assert.equal(router.routes.length, 1);
  } finally {
    console.error = error;
  }
});

test('a finished 3D game is recorded and routed to the results screen like a 2D game', () => {
  const records = fakeRecords();
  const router = fakeRouter();
  const flow = createResultsFlow({ records, router, restart() {}, goMenu() {} });
  const board = createBoardIdentity({ mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: false });
  const s = summary({ id: 'g3', board: { ...board } });
  const data = flow.finished(s, '3d');
  assert.deepEqual(records.calls, [['counters', '3d'], ['record', 'g3'], ['counters', '3d'], ['history', '3d'], ['winRate', '3d'],
    ['completedWinRate', '3d'], ['available']]);
  assert.deepEqual(router.routes, [['results', {
    summary: s, mode: '3d', comparison, saved: true, notSaved: false, watch: false,
    rank: { position: 4, of: 5 }, streak: { before: 2, current: 3, longest: 4 }, standing: STANDING,
  }]]);
  assert.equal(data.summary, s);
});

test('a fixed 3D board\'s null summary is not a record: no recording, no results screen', () => {
  const records = fakeRecords();
  const router = fakeRouter();
  const flow = createResultsFlow({ records, router, restart() {}, goMenu() {} });
  assert.equal(flow.finished(null, '3d'), null);
  assert.deepEqual(records.calls, []);
  assert.deepEqual(router.routes, []);
});

test('a failed recording still routes, without a comparison', () => {
  const router = fakeRouter();
  const flow = createResultsFlow({ records: fakeRecords({ fail: true }), router, restart() {}, goMenu() {} });
  const data = flow.finished(summary(), 'classic-2d');
  assert.deepEqual([data.comparison, data.saved], [null, false]);
  assert.equal(router.routes.length, 1);
});

test('records not saved this session are told once', () => {
  const router = fakeRouter();
  const flow = createResultsFlow({ records: fakeRecords({ available: false }), router, restart() {}, goMenu() {} });
  assert.equal(flow.finished(summary({ id: 'g1' }), 'classic-2d').notSaved, true);
  assert.equal(flow.finished(summary({ id: 'g2' }), 'classic-2d').notSaved, false);
});

test('the actions: Play again restarts the same choice, Records opens this board, Main menu goes home', () => {
  const asked = [];
  const router = fakeRouter();
  const flow = createResultsFlow({
    records: fakeRecords(), router, restart: (source, data) => asked.push(['restart', source, data.mode]), goMenu: () => asked.push(['menu']),
  });
  flow.finished(summary(), 'classic-2d');
  flow.playAgain('pad');
  flow.toMenu();
  assert.deepEqual(asked, [['restart', 'pad', 'classic-2d'], ['menu']]);
  flow.openRecords();
  assert.deepEqual(router.routes.at(-1), ['coming-soon', { entry: 'records', title: 'Records', boardKey: 'classic-2d:square:9x9:10:guess' }],
    'the placeholder while the records screen has not landed');
  const withRecords = fakeRouter(['results', 'records']);
  const flow2 = createResultsFlow({ records: fakeRecords(), router: withRecords, restart() {}, goMenu() {} });
  flow2.finished(summary(), 'classic-2d');
  flow2.openRecords();
  assert.deepEqual(withRecords.routes.at(-1), ['records', { boardKey: 'classic-2d:square:9x9:10:guess' }]);
});

test('the flow is DOM-free', () => {
  assert.doesNotMatch(read('js/results/flow.js'), /document|window/);
});

// ---------------------------------------------------------------- the keys

test('Enter is Play again while the focus is on Play again or on no action; on another action it keeps that action\'s meaning; its repeat does nothing', () => {
  assert.deepEqual(RESULTS_ACTIONS, ['r-again', 'r-watch', 'r-records', 'r-menu']);
  assert.equal(resultsEnter({ focused: 'r-again' }), 'playAgain', 'its default focus');
  assert.equal(resultsEnter({ focused: null }), 'playAgain', 'no focus');
  assert.equal(resultsEnter({ focused: 'results' }), 'playAgain', 'the card itself, no action');
  for (const id of ['r-watch', 'r-records', 'r-menu']) assert.equal(resultsEnter({ focused: id }), null, `${id} is activated by its own Enter`);
  for (const focused of [null, 'r-again', 'r-menu']) assert.equal(resultsEnter({ focused, repeat: true }), 'ignore', 'a key repeat activates nothing');
});

test('R and Enter play again on the results screen only, through the one R binding and the Enter handler', () => {
  assert.equal(restartInput('KeyR', { screen: 'results' }), 'playAgain');
  for (const screen of ['classic-2d', 'playing', 'paused', 'menu', 'records']) assert.equal(restartInput('KeyR', { screen }), null, `R on ${screen}`);
  const src = MAIN.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.equal(src.match(/'KeyR'/g).length, 1, 'R is bound once in js/main.js: the 3D camera return; results reach R through restartInput');
  const enter = src.slice(src.indexOf('resultsEnter({'), src.indexOf('});', src.indexOf('resultsEnter({')));
  assert.match(src, /if \(S\.mode !== 'results' \|\| \(e\.code !== 'Enter' && e\.code !== 'NumpadEnter'\)/, 'Enter acts on the results screen only');
  assert.match(enter, /focused: document\.activeElement\?\.id/);
  assert.match(src, /if \(action === 'playAgain'\) RESULTS\.playAgain\('key'\)/);
});

test('a key that ended the end delay does not also play again: its press, repeat and release are consumed; a fresh press is not', () => {
  let ending = true;
  const skips = [];
  const skip = createEndSkip({ ending: () => ending, skip: () => { skips.push('skip'); ending = false; } });
  for (const code of ['Enter', 'KeyR']) {
    ending = true;
    skips.length = 0;
    assert.equal(skip.keyDown({ code, repeat: false }), true, `${code} ends the delay and is consumed`);
    assert.deepEqual(skips, ['skip']);
    assert.equal(ending, false, 'the results card now shows');
    assert.equal(skip.keyDown({ code, repeat: true }), true, 'its auto-repeat does not reach the card');
    assert.equal(skip.keyUp({ code }), true, 'nor its release');
    assert.equal(skip.keyDown({ code, repeat: false }), false, 'a fresh press reaches the card: Play again');
    assert.equal(skip.keyUp({ code }), false);
    assert.deepEqual(skips, ['skip'], 'one skip');
  }
  assert.match(MAIN, /window\.addEventListener\('keydown', \(e\) => \{ if \(END_SKIP\.keyDown\(e\)\) swallow\(e\); \}, true\)/,
    'the shell consumes it in the capture phase, before the results screen\'s keys see it');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RESULTS_HTML = INDEX.slice(INDEX.indexOf('<section id="results"'), INDEX.indexOf('<!-- /Results -->'));

test('the results screen is the kit composition: outcome, board, stats, bests, note and its actions', () => {
  assert.ok(RESULTS_HTML.length > 400, 'index.html holds #results');
  assert.match(RESULTS_HTML, /^<section id="results" class="overlay hidden"/);
  const classes = [...RESULTS_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
  for (const id of ['results-title', 'results-board', 'rs-time', 'rs-bbbv', 'rs-bbbvSolved', 'rs-bbbvPerSecond', 'rs-efficiency',
    'results-bests', 'rb-time', 'rb-bbbvPerSecond', 'rb-efficiency', 'results-note', 'r-again', 'r-watch', 'r-records', 'r-menu']) {
    assert.ok(RESULTS_HTML.includes(`id="${id}"`), `#${id}`);
  }
  // The card reads top to bottom: outcome and board, the new-best banner, the game's own stats, the
  // second row, the next target, the bests panel (its not-eligible label first), the notes, the actions.
  const order = ['results-title', 'results-board', 'results-banner', 'results-stats', 'results-figures', 'results-next', 'results-standing',
    'results-bests', 'results-bests-note', 'rb-time', 'results-note', 'r-again', 'results-keys'];
  const at = order.map((id) => RESULTS_HTML.indexOf(`id="${id}"`));
  assert.ok(at.every((i) => i >= 0), `every part is in the markup: ${order.filter((_, k) => at[k] < 0)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in reading order');
  assert.match(RESULTS_HTML, /<p id="results-banner" class="ui-banner hidden" role="status">/);
  assert.match(RESULTS_HTML, /<div id="results-stats" class="ui-stat-row">/);
  assert.match(RESULTS_HTML, /<p id="results-standing" class="ui-text ui-text--muted hidden"><\/p>/);
  assert.match(RESULTS_HTML, /<span class="ui-text ui-text--muted" id="results-keys">R: Play again<\/span>/, 'the hint names R');
  assert.match(RESULTS_HTML, /<p id="results-bests-note" class="ui-text ui-text--muted hidden">Not eligible — only won games set bests<\/p>/);
  assert.match(RESULTS_HTML, /class="ui-card ui-screen" aria-labelledby="results-title"/);
  const buttons = [...RESULTS_HTML.matchAll(/<button type="button" id="(r-[a-z]+)" class="ui-button ([^"]+)">([^<]+)</g)]
    .map((m) => [m[1], m[2], m[3]]);
  assert.deepEqual(buttons, [
    ['r-again', 'ui-button--primary', 'Play again'],
    ['r-watch', 'ui-button--secondary hidden', 'Watch replay'],
    ['r-records', 'ui-button--secondary', 'Records'],
    ['r-menu', 'ui-button--secondary', 'Main menu'],
  ]);
});

test('the shell registers the results screen, its focus, its controller layer and the flow on the hand-off', () => {
  assert.match(MAIN, /results: \{ defaultFocus: '#r-again'/, 'Play again has default focus');
  assert.match(MAIN, /LAYER_SCREEN = \{[^}]*results: 'results'/, 'the controller reaches the results layer');
  assert.match(MAIN, /RESULTS\.attach\(PAUSE\)/, 'the flow attaches to the pause controller');
  const pauseBlock = MAIN.slice(MAIN.indexOf('createPauseController({'), MAIN.indexOf('});', MAIN.indexOf('createPauseController({')));
  assert.doesNotMatch(pauseBlock, /router/, 'the flow, not the pause controller, routes to results');
  assert.match(read('js/shell/pause.js'), /results flow/i);
});

test('the kit catalogue documents the stat detail line the comparison uses', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-stat__detail/);
  assert.match(read('css/components.css'), /\.ui-stat__detail\s*\{/);
  assert.match(read('dev/components.html'), /ui-stat__detail/, 'the gallery shows it');
});

test('the kit carries the deltas\' colours, the greyed panel, the highlighted stat and the banner, all from tokens', () => {
  const css = read('css/components.css');
  const head = css.match(/^\/\*([\s\S]*?)\*\//)[1];
  for (const part of ['data-delta', 'ui-panel--muted', 'ui-banner']) assert.ok(head.includes(part), `the catalogue documents ${part}`);
  const rule = (sel) => css.match(new RegExp(`${sel.replace(/[[\]().]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(rule('.ui-stat__detail[data-delta="better"]'), /color:\s*var\(--color-success\)/);
  assert.match(rule('.ui-stat__detail[data-delta="worse"]'), /color:\s*var\(--color-danger\)/);
  assert.match(rule('.ui-stat__detail[data-delta="equal"]'), /color:\s*var\(--color-ink-muted\)/);
  assert.match(css, /\.ui-panel--muted[^{]*\{[^}]*color:\s*var\(--color-ink-muted\)/);
  assert.match(css, /\.ui-stat\[data-new-best\]\s*\{/);
  assert.match(css, /\.ui-banner\s*\{/);
  const gallery = read('dev/components.html');
  for (const part of ['data-delta="better"', 'data-delta="worse"', 'data-delta="equal"', 'ui-panel--muted', 'ui-banner']) {
    assert.ok(gallery.includes(part), `the gallery shows ${part}`);
  }
});

test('the coloured deltas meet the body-text contrast contract on the bests panel in both themes', () => {
  const tokens = read('css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = (sel) => {
    const i = tokens.indexOf(`${sel} {`);
    const m = new Map();
    for (const d of tokens.slice(tokens.indexOf('{', i) + 1, tokens.indexOf('}', i)).split(';')) {
      const k = d.indexOf(':');
      if (k > 0) m.set(d.slice(0, k).trim(), d.slice(k + 1).trim());
    }
    return m;
  };
  const parse = (v) => {
    const hex = v.match(/^#([0-9a-f]{6})$/i);
    if (hex) return [0, 2, 4].map((i) => parseInt(hex[1].slice(i, i + 2), 16)).concat(1);
    const m = v.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/);
    return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  };
  const over = ([r, g, b, a], base) => [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
  const lum = ([r, g, b]) => { const l = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b); };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const [theme, sel] of [['light', ':root'], ['dark', ':root[data-theme="dark"]']]) {
    const t = block(sel);
    const card = over(parse(t.get('--color-surface')), parse(t.get('--color-backdrop')));
    const panel = over(parse(t.get('--color-surface-sunken')), card);
    for (const ink of ['--color-success', '--color-danger', '--color-ink-muted']) {
      const r = ratio(parse(t.get(ink)), panel);
      assert.ok(r >= 4.5, `${theme}: ${ink} on the bests panel ${r.toFixed(2)}:1`);
    }
  }
});

// ---------------------------------------------------------------- browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

test('in a browser, a fixed Beginner board won through the shell shows the results, then Play again', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fixed board: every board seed the session draws is 12345.
    await page.addInitScript(() => {
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);

    await page.click('#menu-entry-classic-2d');
    if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
    await page.click('#c2d-choice [data-size="beginner"]');
    assert.equal(await mode(), 'classic-2d');

    // The cell centres, from the board view's own layout of the canvas.
    const centres = await page.evaluate(async () => {
      const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const L = globalThis.__ms.board2D.layout;
      return Array.from({ length: 81 }, (_, c) => ({
        x: r.left + L.offsetX + ((c % 9) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / 9) + 0.5) * L.tile,
      }));
    });
    const first = 40;
    const mines = await page.evaluate(async (fc) => {
      const { generate } = await import('/js/generation/generate.js');
      const r = generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: fc, noGuess: false, seed: 12345 });
      return [...r.mines];
    }, first);
    const hudClicks = () => page.evaluate(() => document.getElementById('hud-clicks').textContent);
    assert.equal(await hudClicks(), '0', 'the overlay counts no click before the first');
    await page.mouse.click(centres[first].x, centres[first].y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    assert.equal(await hudClicks(), '1', 'the first click is counted as it is made');
    // Clicks `cells` in the page, in one task, until the end effect starts — the click the mounted
    // input takes, by mouse events at the cell centres — then, in that same task so it lands inside
    // the end delay however slow the machine, presses `skip`: a key code, 'mouse', or nothing.
    const ending = () => page.evaluate(() => globalThis.__ms.board2D?.effect?.kind ?? null);
    const playInPage = (cells, skip = null) => page.evaluate(({ points, skip: press }) => {
      const m = globalThis.__ms;
      const canvas = document.querySelector('#c2d-board canvas');
      const mouse = (type, p, buttons) => new MouseEvent(type, { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, buttons });
      for (const p of points) {
        if (m.board2D.effect) break;
        canvas.dispatchEvent(mouse('mousedown', p, 1));
        canvas.dispatchEvent(mouse('mouseup', p, 0));
      }
      const out = { effect: m.board2D.effect?.kind ?? null, origin: m.board2D.effect?.origin ?? null, mode: m.state.mode, at: performance.now() };
      if (press === 'mouse') {
        const p = points[0];
        canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, buttons: 1 }));
        out.afterPress = m.state.mode;
        canvas.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 0, buttons: 0 }));
        canvas.dispatchEvent(mouse('click', p, 0));
      } else if (press) {
        document.body.dispatchEvent(new KeyboardEvent('keydown', { code: press, key: 'r', bubbles: true, cancelable: true }));
        out.afterPress = m.state.mode;
      }
      return out;
    }, { points: cells.map((c) => centres[c]), skip });
    const safe = () => [...Array(81).keys()].filter((c) => !mines.includes(c));
    const clearBoard = async () => {
      const won = await playInPage(safe());
      assert.deepEqual([won.effect, won.mode], ['win', 'classic-2d'], 'the win confetti plays on the board during the end delay');
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
      const waited = await page.evaluate(() => performance.now()) - won.at;
      assert.ok(waited >= 700, `the results card shows after the end delay (${waited.toFixed(0)} ms)`);
      assert.equal(await ending(), null, 'the board is left in its end state');
    };
    await clearBoard();
    const made = await hudClicks();

    const shown = await page.evaluate(() => {
      const text = (id) => document.getElementById(id).textContent.trim();
      const value = (id) => document.querySelector(`#${id} .ui-stat__value`).textContent.trim();
      const visible = (id) => !document.getElementById(id).classList.contains('hidden') && document.getElementById(id).getBoundingClientRect().width > 0;
      return {
        title: text('results-title'), board: text('results-board'), time: value('rs-time'), bbbv: value('rs-bbbv'),
        rate: value('rs-bbbvPerSecond'), efficiency: value('rs-efficiency'), solvedShown: visible('rs-bbbvSolved'),
        bests: visible('results-bests'), bestTime: value('rb-time'), detail: document.querySelector('#rb-time .ui-stat__detail').textContent.trim(),
        board2d: visible('c2d'), focus: document.activeElement.id, games: globalThis.__ms.records.counters('classic-2d:square:9x9:10:guess').games,
        banner: visible('results-banner') && text('results-banner'), figures: text('results-figures'), next: text('results-next'),
        notEligible: visible('results-bests-note'), muted: document.getElementById('results-bests').classList.contains('ui-panel--muted'),
        highlighted: [...document.querySelectorAll('#results-stats .ui-stat[data-new-best]')].map((e) => e.id),
        sizes: [document.querySelector('#rs-time .ui-stat__value'), document.querySelector('#rb-time .ui-stat__value')]
          .map((e) => parseFloat(getComputedStyle(e).fontSize)),
        clicks: globalThis.__ms.records.history('classic-2d:square:9x9:10:guess').at(-1).clicks,
        standing: visible('results-standing') && text('results-standing'),
      };
    });
    assert.equal(shown.title, 'You won!');
    assert.equal(shown.board, 'Beginner');
    assert.match(shown.time, /^\d+\.\d{3} s$/);
    assert.match(shown.bbbv, /^\d+$/);
    assert.match(shown.rate, /^\d+\.\d\d$/);
    assert.match(shown.efficiency, /^\d+\.\d%$/);
    assert.equal(shown.solvedShown, false);
    assert.equal(shown.banner, 'New best time, 3BV/s and efficiency!', 'a first win sets every best');
    assert.deepEqual(shown.highlighted, ['rs-time', 'rs-bbbvPerSecond', 'rs-efficiency']);
    assert.equal(shown.figures, `${formatClicks(shown.clicks)} · #1 of 1 on this board`);
    assert.equal(shown.figures.split(' ')[1], made, 'the overlay, frozen at the end, and the card count the same clicks');
    assert.equal(shown.next, `Beat ${shown.time} for a new best · streak 1`);
    assert.equal(shown.standing, 'Win rate 100% (completed games 100%) · Longest streak 1 (completed games 1)');
    assert.deepEqual([shown.notEligible, shown.muted], [false, false], 'a win is eligible');
    assert.ok(shown.sizes[0] > shown.sizes[1], `the game's own figures are larger than the bests (${shown.sizes})`);
    assert.equal(shown.bests, true, 'the comparison shows on a win');
    assert.equal(shown.bestTime, '—', 'no standing best on a first win');
    assert.match(shown.detail, /New best/);
    assert.equal(shown.board2d, true, 'the finished board stays visible behind the screen');
    assert.equal(shown.focus, 'r-again', 'Play again has default focus');
    assert.equal(shown.games, 1, 'the game was recorded');

    // Records, then Back: the results screen shows again, and Play again still starts the same choice.
    await page.click('#r-records');
    assert.equal(await mode(), 'records', 'the records screen');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Beginner', 'on this board');
    assert.equal(await page.evaluate(() => document.querySelector('#rec-games .ui-stat__value').textContent), '1');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'results');
    assert.equal(await page.evaluate(() => document.getElementById('results-title').textContent), 'You won!');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-again');

    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d', 'Play again goes back to the board');
    assert.deepEqual(await page.evaluate(() => ({ ...globalThis.__ms.modes.state })),
      { mode: 'classic-2d', started: false, finished: false, canPause: false }, 'a fresh game of the same choice');
    assert.equal(await page.evaluate(() => document.getElementById('hud-size').textContent), '9 × 9');

    // The same board won again, its end delay cut short by R: the card shows at once, and the R that
    // ended the delay — held, repeating, released — does not also play again; a fresh R does, as the
    // focused Play again's Enter does; with Ctrl it is the browser's.
    await page.mouse.click(centres[first].x, centres[first].y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    const skipped = await playInPage(safe(), 'KeyR');
    assert.deepEqual([skipped.effect, skipped.mode], ['win', 'classic-2d'], 'the end delay runs');
    assert.equal(skipped.afterPress, 'results', 'a key during the end delay shows the card at once');
    assert.equal(await page.evaluate(() => globalThis.__ms.modes.state.finished), true, 'the game is finished');
    await page.evaluate(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', repeat: true, bubbles: true, cancelable: true }));
      document.body.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyR', key: 'r', bubbles: true, cancelable: true }));
    });
    assert.equal(await mode(), 'results', 'the R that ended the delay, repeating and released, does not play again');
    assert.equal(await page.evaluate(() => globalThis.__ms.records.counters('classic-2d:square:9x9:10:guess').games), 2, 'recorded once, finished');
    assert.equal(await page.evaluate(() => {
      const e = new KeyboardEvent('keydown', { code: 'KeyR', key: 'r', ctrlKey: true, bubbles: true, cancelable: true });
      window.dispatchEvent(e);
      return globalThis.__ms.state.mode;
    }), 'results', 'Ctrl+R is left to the browser');
    await page.keyboard.press('KeyR');
    assert.equal(await mode(), 'classic-2d', 'R plays again');
    assert.deepEqual(await page.evaluate(() => ({ ...globalThis.__ms.modes.state })),
      { mode: 'classic-2d', started: false, finished: false, canPause: false }, 'a fresh game of the same choice');

    // A loss: the reveal wave plays from the exploded tile; a click during the delay shows the card at
    // once and acts on nothing; Enter on another focused action keeps that action's meaning.
    await page.mouse.click(centres[first].x, centres[first].y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    const lost = await playInPage([mines[0]], 'mouse');
    assert.deepEqual([lost.effect, lost.mode], ['loss', 'classic-2d'], 'the loss reveal wave plays on the board');
    assert.equal(lost.origin, mines[0], 'from the exploded tile');
    assert.equal(lost.afterPress, 'results', 'a click during the end delay shows the card at once');
    assert.equal(await mode(), 'results');
    assert.equal(await page.evaluate(() => document.getElementById('results-title').textContent), 'Game over');
    assert.equal(await ending(), null, 'the board is drawn in its end state');
    assert.equal(await page.evaluate(() => globalThis.__ms.records.history('classic-2d:square:9x9:10:guess').at(-1).outcome), 'lost', 'recorded finished, as lost');
    await page.evaluate(() => document.getElementById('r-menu').focus());
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'menu', 'Enter on Main menu goes to the menu, not Play again');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
