// Results screen (js/results/): the time and stat formats, the screen's content from a summary and
// its comparison, the results flow over fakes, the #results markup and its wiring in js/main.js,
// and in a browser a fixed Beginner board won through the real shell, watched from the results
// screen by mouse, keyboard and controller and from the Records screen's library view, then Play again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatTime, formatTimeDifference, formatRate, formatRateDifference, formatEfficiency,
  formatEfficiencyDifference, formatClicks, resultsContent, createResultsView, DASH, NOTES, EQUAL_BEST, BOARD_DIFFICULTY, LOSS_NO_BESTS,
  RESULTS_ACTIONS, resultsEnter, LOOK_REFUSED, CHALLENGE_LABEL, CHALLENGE_NOTE,
} from '../js/results/view.js';
import { encodeBoardCode } from '../js/records/board-code.js';
import { restartInput } from '../js/shell/pause.js';
import { createEndSkip } from '../js/shell/end-skip.js';
import { pauseLine } from '../js/ui.js';
import { createResultsFlow, RESULTS_SCREEN } from '../js/results/flow.js';
import { createBoardIdentity } from '../js/records/board.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
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

test('a time difference shows the same precision, signed, truncated toward zero; none at that precision is "equal"', () => {
  assert.equal(EQUAL_BEST, 'equal');
  assert.equal(formatTimeDifference(2280), '+2.280 s');
  assert.equal(formatTimeDifference(-1270), '−1.270 s');
  assert.equal(formatTimeDifference(-50), '−0.050 s');
  assert.equal(formatTimeDifference(1.9), '+0.001 s');
  assert.equal(formatTimeDifference(0), EQUAL_BEST);
  assert.equal(formatTimeDifference(0.6), EQUAL_BEST, 'under a millisecond is no difference');
  assert.equal(formatTimeDifference(-0.9), EQUAL_BEST);
  assert.equal(formatTimeDifference(null), DASH);
});

test('3BV/s shows two decimals and efficiency one decimal; a difference of zero at that precision is "equal"', () => {
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

test('the clicks row: the counted clicks, then the reveal clicks as left, the flag clicks as right, the chords and the wasted total', () => {
  const c = { reveal: { effective: 150, wasted: 3 }, flag: { effective: 20, wasted: 2 }, chord: { effective: 7, wasted: 1 } };
  assert.equal(formatClicks(c), '183 · left 153 · right 22 · chords 8 · wasted 6');
  assert.equal(formatClicks(clicks(0)), '0 · left 0 · right 0 · chords 0 · wasted 0');
  assert.equal(formatClicks(null), `${DASH} · left ${DASH} · right ${DASH} · chords ${DASH} · wasted ${DASH}`);
  // With the mouse buttons swapped, left and right would name the wrong clicks: reveal and flag instead.
  assert.equal(formatClicks(c, { swapped: true }), '183 · reveal 153 · flag 22 · chords 8 · wasted 6');
  assert.equal(detail(resultsContent({ summary: summary(), swapped: true }), 'clicks').value, '138 · reveal 138 · flag 0 · chords 0 · wasted 0');
  assert.match(read('js/main.js'), /resultsContent\(\{ \.\.\.data, swapped: data\.mode !== '3d' && BUTTON_SWAP\.on \}\)/, 'the shell passes the Classic 2D swap');
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
  assert.match(ui, /pauseSub\.textContent = noGame \? \(ended \? ENDED_LINE : NO_GAME_LINE\) : pauseLine\(/, 'the pause card shows that line during a game');
});

// ---------------------------------------------------------------- content

const tile = (content, key) => content.tiles.find((s) => s.key === key);
const detail = (content, key) => content.details.find((d) => d.key === key);
const tileRow = (t) => [t.key, t.label, t.value, t.detail, t.direction, t.newBest];

test('a won game shows its outcome, board, rank chip and four figure tiles, each with its own comparison', () => {
  const c = resultsContent({ summary: summary(), mode: 'classic-2d', comparison, saved: true, notSaved: false, rank: { position: 3, of: 12 } });
  assert.equal(c.outcome, 'won');
  assert.equal(c.title, 'You won!');
  assert.equal(c.board, 'Classic 2D · Beginner');
  assert.equal(c.rank, '#3 of 12 wins on this board');
  assert.deepEqual(c.tiles.map(tileRow), [
    ['time', 'Time', '47.380 s', 'best 45.120 s · +2.260 s', 'worse', false],
    ['bbbvPerSecond', '3BV/s', '2.53', 'was 2.40 · +0.13', 'better', true],
    ['efficiency', 'Efficiency', '87.0%', null, null, true],
    ['bbbv', '3BV', '120', BOARD_DIFFICULTY, null, false],
  ]);
  assert.equal(BOARD_DIFFICULTY, 'board difficulty');
  assert.ok(c.tiles.every((t) => t.progress === null), 'no progress bar on a win');
  assert.deepEqual(c.notes, []);
  assert.ok(!('banner' in c) && !('bests' in c), 'no separate new-best banner and no separate bests panel');
});

test('the best time and its difference are truncated like every other time', () => {
  const cmp = { ...comparison, time: { best: { id: 'a', value: 47389, endedAt: 'x' }, value: 46010, difference: -1379, newBest: true } };
  const c = resultsContent({ summary: summary({ elapsedMs: 46010 }), comparison: cmp, saved: true });
  assert.deepEqual([tile(c, 'time').value, tile(c, 'time').detail, tile(c, 'time').newBest], ['46.010 s', 'was 47.389 s · −1.379 s', true]);
});

test('delta direction: lower is better for time, higher for 3BV/s and efficiency; none at display precision is "equal"', () => {
  const cmp = {
    time: { best: { id: 'a', value: 50000, endedAt: 'x' }, value: 47380, difference: -2620, newBest: true },
    bbbvPerSecond: { best: { id: 'b', value: 2.6, endedAt: 'x' }, value: 2.5327, difference: -0.0673, newBest: false },
    efficiency: { best: { id: 'c', value: 86.96, endedAt: 'x' }, value: 86.96, difference: 0, newBest: false },
  };
  const c = resultsContent({ summary: summary(), comparison: cmp, saved: true });
  assert.deepEqual(c.tiles.slice(0, 3).map((t) => [t.key, t.direction, t.detail, t.newBest]), [
    ['time', 'better', 'was 50.000 s · −2.620 s', true],
    ['bbbvPerSecond', 'worse', 'best 2.60 · −0.07', false],
    ['efficiency', 'equal', 'best 87.0% · equal', false],
  ]);
  // A new best whose difference is zero at display precision gives the best it replaced alone.
  const tiny = { ...cmp, time: { best: { id: 'a', value: 47380.4, endedAt: 'x' }, value: 47380, difference: -0.4, newBest: true } };
  const t = tile(resultsContent({ summary: summary(), comparison: tiny, saved: true }), 'time');
  assert.deepEqual([t.direction, t.detail, t.newBest], ['equal', 'was 47.380 s', true]);
});

test('a new best is marked on its own tile: every best the game set carries the badge, the others none', () => {
  const all = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, newBest: true }]));
  const set = resultsContent({ summary: summary(), comparison: all, saved: true });
  assert.deepEqual(set.tiles.filter((t) => t.newBest).map((t) => t.key), ['time', 'bbbvPerSecond', 'efficiency']);
  const none = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, newBest: false }]));
  assert.deepEqual(resultsContent({ summary: summary(), comparison: none, saved: true }).tiles.filter((t) => t.newBest), []);
});

test('the details: the clicks on wins and losses alike, then the next target or the streak, then the win rate', () => {
  const streak = { before: 2, current: 3, longest: 5 };
  const standing = { winRate: 4 / 6, completedWinRate: 0.8, longestStreak: 4, longestCompletedStreak: 5 };
  const won = resultsContent({ summary: summary(), comparison, saved: true, streak, standing, rank: { position: 3, of: 12 } });
  assert.deepEqual(won.details.map((d) => [d.key, d.label, d.value]), [
    ['clicks', 'Clicks', '138 · left 138 · right 0 · chords 0 · wasted 0'],
    ['next', 'Next target', 'beat 45.120 s · streak 3'],
    ['winRate', 'Win rate', '67% · completed games 80% · longest streak 4'],
  ]);
  const lost = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, streak: { before: 3, current: 0, longest: 7 }, standing });
  assert.deepEqual(lost.details.map((d) => [d.key, d.label, d.value]), [
    ['clicks', 'Clicks', '60 · left 60 · right 0 · chords 0 · wasted 0'],
    ['streak', 'Streak', 'ended at 3 · longest 7'],
    ['winRate', 'Win rate', '67% · completed games 80%'],
  ]);
  assert.equal(lost.rank, null, 'no rank on a loss');
  const noClicks = resultsContent({ summary: summary({ clicks: undefined }), comparison, saved: true });
  assert.match(detail(noClicks, 'clicks').value, /^— · left —/);
  assert.ok(!JSON.stringify(won).includes('IOE'), 'the card shows no IOE');
});

const lostSummary = (over = {}) => summary({
  outcome: 'lost', elapsedMs: 20000, bbbvSolved: 40, bbbvPerSecond: 40 / 20, efficiency: (100 * 40) / 60, clicks: clicks(60), ...over,
});
const lostComparison = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, value: null, difference: null, newBest: false }]));

test('a lost game: time, 3BV solved with its progress, 3BV/s and efficiency; losses set no bests, the others show the standing best', () => {
  const c = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true });
  assert.equal(c.title, 'Game over');
  assert.deepEqual(c.tiles.map(tileRow), [
    ['time', 'Time', '20.000 s', LOSS_NO_BESTS, null, false],
    ['bbbvSolved', '3BV solved', '40 / 120', null, null, false],
    ['bbbvPerSecond', '3BV/s', '2.00', 'best 2.40', null, false],
    ['efficiency', 'Efficiency', '66.7%', `best ${DASH}`, null, false],
  ]);
  assert.equal(LOSS_NO_BESTS, 'Losses set no bests');
  assert.deepEqual(tile(c, 'bbbvSolved').progress, { value: 40, max: 120 });
  assert.equal(resultsContent({ summary: lostSummary({ bbbv: null }), comparison: lostComparison }).tiles[1].progress, null, 'no bar without the board\'s 3BV');
});

test('the streak row after a loss: the streak it ended, else the best to beat, else a first win', () => {
  const ended = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, streak: { before: 3, current: 0, longest: 7 } });
  assert.equal(detail(ended, 'streak').value, 'ended at 3 · longest 7');
  const noStreak = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, streak: { before: 0, current: 0, longest: 7 } });
  assert.equal(detail(noStreak, 'streak').value, 'beat 45.120 s');
  const empty = Object.fromEntries(Object.keys(comparison).map((k) => [k, { best: null, value: null, difference: null, newBest: false }]));
  const firstGame = resultsContent({ summary: lostSummary(), comparison: empty, saved: true, streak: { before: 0, current: 0, longest: 0 } });
  assert.equal(detail(firstGame, 'streak').value, 'Win this board to set a best');
});

test('the next target after a win: the board\'s best time as it stands and its current streak', () => {
  const streak = { before: 2, current: 3, longest: 5 };
  const kept = resultsContent({ summary: summary(), comparison, saved: true, streak });
  assert.equal(detail(kept, 'next').value, 'beat 45.120 s · streak 3', 'the standing best when this game did not beat it');
  const beaten = { ...comparison, time: { best: { id: 'a', value: 48213, endedAt: 'x' }, value: 47380, difference: -833, newBest: true } };
  assert.equal(detail(resultsContent({ summary: summary(), comparison: beaten, saved: true, streak }), 'next').value,
    'beat 47.380 s · streak 3', 'this game\'s time once it is the best');
});

test('the win rate row: the board\'s win rate counting this game, its completed games\' figure and, after a win, its longest streak', () => {
  const standing = { winRate: 0, completedWinRate: null, longestStreak: 0, longestCompletedStreak: 0 };
  const none = resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, standing });
  assert.equal(detail(none, 'winRate').value, `0% · completed games ${DASH}`, 'a loss shows no longest streak');
  assert.equal(detail(resultsContent({ summary: summary(), comparison, saved: true, standing }), 'winRate').value, `0% · completed games ${DASH} · longest streak 0`);
  assert.equal(detail(resultsContent({ summary: summary(), comparison: null, saved: false, standing: { winRate: 1 } }), 'winRate'), undefined, 'a failed recording shows no win rate');
  assert.equal(detail(resultsContent({ summary: summary(), comparison }), 'winRate'), undefined, 'nor does a game the flow gave none');
});

test('a stat that is not available shows a dash', () => {
  const c = resultsContent({ summary: summary({ bbbvPerSecond: null, efficiency: null }), comparison, saved: true });
  assert.equal(tile(c, 'bbbvPerSecond').value, DASH);
  assert.equal(tile(c, 'efficiency').value, DASH);
});

test('a failed recording shows the game without comparisons, a next target, a win rate or a rank, and says it was not saved', () => {
  const c = resultsContent({ summary: summary(), comparison: null, saved: false, notSaved: false, rank: null });
  assert.deepEqual(c.tiles.map((t) => [t.key, t.value, t.detail]), [
    ['time', '47.380 s', null], ['bbbvPerSecond', '2.53', null], ['efficiency', '87.0%', null], ['bbbv', '120', BOARD_DIFFICULTY],
  ]);
  assert.deepEqual(c.details.map((d) => d.key), ['clicks']);
  assert.equal(c.rank, null);
  assert.deepEqual(c.notes, [NOTES.notRecorded]);
  const lost = resultsContent({ summary: lostSummary(), comparison: null, saved: false });
  assert.deepEqual(lost.tiles.map((t) => t.detail), [LOSS_NO_BESTS, null, null, null], 'a loss whose recording failed shows no comparison either');
  const told = resultsContent({ summary: summary(), comparison, saved: true, notSaved: true });
  assert.deepEqual(told.notes, [NOTES.notSaved]);
  assert.ok(tile(told, 'time').detail, 'records kept for the session still compare');
});

test('Watch best present makes the secondary actions small so the bar stays one row', () => {
  assert.equal(resultsContent({ summary: summary(), watch: true, watchBest: 'b' }).compact, true);
  assert.equal(resultsContent({ summary: summary(), watch: true, watchBest: null }).compact, false);
});

// ---------------------------------------------------------------- the view's binding

// A fake #results root: every element by id, with classes, attributes and child parts by selector.
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
      listeners: {},
      addEventListener(type, fn) { (node.listeners[type] ??= []).push(fn); },
      click() { for (const fn of node.listeners.click ?? []) fn(); },
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
const hidden = (root, id) => root.el(id).classList.contains('hidden');

test('the view fills each tile with its figure, its comparison coloured by direction and its New best badge, and clears them on the next game', () => {
  const root = fakeRoot();
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  const part = (key, sel) => root.el(`rs-${key} ${sel}`);
  const cmp = {
    time: { best: { id: 'a', value: 50000, endedAt: 'x' }, value: 47380, difference: -2620, newBest: true },
    bbbvPerSecond: { best: { id: 'b', value: 2.6, endedAt: 'x' }, value: 2.5327, difference: -0.0673, newBest: false },
    efficiency: { best: { id: 'c', value: 86.96, endedAt: 'x' }, value: 86.96, difference: 0, newBest: false },
  };
  view.show(resultsContent({ summary: summary(), comparison: cmp, saved: true, rank: { position: 1, of: 4 } }));
  assert.deepEqual(['time', 'bbbvPerSecond', 'efficiency'].map((k) => part(k, '.ui-stat__detail').attrs.get('data-delta')), ['better', 'worse', 'equal']);
  assert.equal(part('time', '.ui-stat__value').textContent, '47.380 s');
  assert.equal(part('time', '.ui-stat__detail').textContent, 'was 50.000 s · −2.620 s');
  assert.equal(root.el('rs-time').attrs.has('data-new-best'), true, 'the tile that set a best is highlighted');
  assert.equal(part('time', '.ui-chip').classList.contains('hidden'), false, 'and carries the New best badge');
  assert.equal(part('bbbvPerSecond', '.ui-chip').classList.contains('hidden'), true);
  assert.equal(part('bbbv', '.ui-stat__detail').textContent, BOARD_DIFFICULTY);
  assert.deepEqual(['rs-time', 'rs-bbbvPerSecond', 'rs-efficiency', 'rs-bbbv'].map((id) => hidden(root, id)), [false, false, false, false]);
  assert.equal(hidden(root, 'rs-bbbvSolved'), true, '3BV solved only on a loss');
  assert.equal(root.el('results-rank').textContent, '#1 of 4 wins on this board');
  assert.equal(hidden(root, 'results-rank'), false);
  assert.equal(hidden(root, 'results-trophy'), false, 'the trophy on a win');
  assert.equal(root.el('results-frame').attrs.get('data-outcome'), 'won');

  const lost = summary({ outcome: 'lost', elapsedMs: 20000, bbbvSolved: 40, bbbvPerSecond: 2, efficiency: 66.7, clicks: clicks(60) });
  const lostCmp = Object.fromEntries(Object.entries(cmp).map(([k, v]) => [k, { ...v, value: null, difference: null, newBest: false }]));
  view.show(resultsContent({ summary: lost, comparison: lostCmp, saved: true }));
  assert.equal(root.el('results-frame').attrs.get('data-outcome'), 'lost');
  assert.equal(hidden(root, 'results-trophy'), true);
  assert.equal(hidden(root, 'results-rank'), true, 'no rank chip on a loss');
  assert.deepEqual(['rs-time', 'rs-bbbvSolved', 'rs-bbbvPerSecond', 'rs-efficiency'].map((id) => hidden(root, id)), [false, false, false, false]);
  assert.equal(hidden(root, 'rs-bbbv'), true);
  assert.equal(part('time', '.ui-stat__detail').textContent, LOSS_NO_BESTS);
  assert.equal(part('bbbvSolved', '.ui-stat__value').textContent, '40 / 120');
  assert.deepEqual([part('bbbvSolved', 'progress').attrs.get('value'), part('bbbvSolved', 'progress').attrs.get('max')], ['40', '120']);
  assert.equal(part('bbbvPerSecond', '.ui-stat__detail').textContent, 'best 2.60');
  assert.deepEqual(['time', 'bbbvPerSecond', 'efficiency'].map((k) => part(k, '.ui-stat__detail').attrs.get('data-delta')), [undefined, undefined, undefined], 'no delta colour is left from the win');
  assert.equal(root.el('rs-time').attrs.has('data-new-best'), false);
  assert.equal(part('time', '.ui-chip').classList.contains('hidden'), true);

  view.show(resultsContent({ summary: summary(), comparison: null, saved: false }));
  assert.equal(part('time', '.ui-stat__detail').classList.contains('hidden'), true, 'a failed recording shows no comparison');
  assert.equal(hidden(root, 'results-rank'), true, 'and no rank chip');
});

test('the view fills the three detail rows, hiding a row the game has none for', () => {
  const root = fakeRoot();
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  const standing = { winRate: 0.5, completedWinRate: 1, longestStreak: 2, longestCompletedStreak: 3 };
  view.show(resultsContent({ summary: summary(), comparison, saved: true, standing, streak: { before: 0, current: 1, longest: 2 } }));
  const row = (id) => [root.el(`${id} th`).textContent, root.el(`${id} td`).textContent, hidden(root, id)];
  assert.deepEqual(row('rd-clicks'), ['Clicks', '138 · left 138 · right 0 · chords 0 · wasted 0', false]);
  assert.deepEqual(row('rd-target'), ['Next target', 'beat 45.120 s · streak 1', false]);
  assert.deepEqual(row('rd-winRate'), ['Win rate', '50% · completed games 100% · longest streak 2', false]);
  view.show(resultsContent({ summary: lostSummary(), comparison: lostComparison, saved: true, standing, streak: { before: 2, current: 0, longest: 2 } }));
  assert.deepEqual(row('rd-target'), ['Streak', 'ended at 2 · longest 2', false]);
  view.show(resultsContent({ summary: summary(), comparison: null, saved: false }));
  assert.deepEqual([hidden(root, 'rd-clicks'), hidden(root, 'rd-target'), hidden(root, 'rd-winRate')], [false, true, true]);
});

test('the board code on results: the game form from the seed and start cell, a daily\'s daily form, none without a seed', () => {
  const won = summary({ startCell: 40 });
  assert.equal(resultsContent({ summary: won, comparison }).code, encodeBoardCode({ board: BEGINNER, seed: 1, startCell: 40, generatorVersion: 1 }));
  assert.equal(resultsContent({ summary: summary({ outcome: 'lost', bbbvSolved: 3, startCell: 40 }) }).code, encodeBoardCode({ board: BEGINNER, seed: 1, startCell: 40, generatorVersion: 1 }));
  const expert = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 30, height: 16, mines: 99, noGuess: true });
  const daily = summary({ board: { ...expert, daily: true }, daily: '20261011', startCell: 255 });
  assert.equal(resultsContent({ summary: daily }).code, 'EN-20261011-184A');
  assert.equal(resultsContent({ summary: daily }).board, 'Classic 2D · Daily · Expert · no-guess');
  assert.equal(resultsContent({ summary: summary() }).code, null, 'an older summary with no start cell shows no code');
  assert.equal(resultsContent({ summary: won }).label, null);
});

test('a challenge: the not-eligible chip in place of the rank, no badge, uncoloured comparisons and its details row', () => {
  const ch = summary({ startCell: 40, challenge: true });
  const noBest = Object.fromEntries(Object.entries(comparison).map(([k, v]) => [k, { ...v, value: null, difference: null, newBest: false }]));
  const c = resultsContent({ summary: ch, comparison: noBest, rank: null, streak: { before: 0, current: 0, longest: 0 } });
  assert.equal(c.label, CHALLENGE_LABEL);
  assert.equal(CHALLENGE_LABEL, 'Challenge · not eligible for bests');
  assert.equal(c.rank, null, 'no rank');
  assert.equal(c.tiles.some((t) => t.newBest), false, 'no tile carries a badge');
  assert.equal(c.tiles.some((t) => t.direction), false, 'no difference is coloured');
  assert.equal(tile(c, 'time').detail, 'best 45.120 s · +2.260 s', 'the standing best and the difference');
  assert.deepEqual(detail(c, 'challenge'), { key: 'challenge', label: 'Challenge', value: CHALLENGE_NOTE });
  assert.equal(CHALLENGE_NOTE, 'Kept in your history; sets no best and no rank');
  assert.equal(detail(c, 'next'), undefined, 'no next target');
});

test('the view shows the challenge chip and the code chip, with Copy and Copy link calling back', () => {
  const root = fakeRoot();
  const copies = [];
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {}, onCopy: (c) => copies.push(c.kind) });
  view.show(resultsContent({ summary: summary({ startCell: 40, challenge: true }), comparison: null }));
  assert.equal(root.el('results-label').textContent, CHALLENGE_LABEL);
  assert.equal(hidden(root, 'results-label'), false);
  assert.equal(hidden(root, 'results-rank'), true);
  assert.equal(hidden(root, 'results-code'), false);
  assert.equal(hidden(root, 'results-code-group'), false, 'the code under its label');
  assert.equal(root.el('results-code .ui-code__value').textContent, encodeBoardCode({ board: BEGINNER, seed: 1, startCell: 40, generatorVersion: 1 }));
  view.show(resultsContent({ summary: summary(), comparison: null }));
  assert.equal(hidden(root, 'results-label'), true);
  assert.equal(hidden(root, 'results-code'), true, 'no code, no chip');
  assert.equal(hidden(root, 'results-code-group'), true, 'and no label');
  // The kit's code chip under its "Board code" section label: the label names the chip's group; quiet small Copy and Copy link with their icons.
  assert.match(RESULTS_HTML, /<div id="results-code-group" class="hidden"><div class="ui-section-label"><h3 class="ui-section-label__text" id="results-code-label">Board code<\/h3><\/div><div id="results-code" class="ui-code hidden" role="group" aria-labelledby="results-code-label">/);
  assert.match(RESULTS_HTML, /class="ui-button ui-button--quiet ui-button--sm" data-copy="code" data-icon="copy">Copy<\/button>[\s\S]*class="ui-button ui-button--quiet ui-button--sm" data-copy="link" data-icon="link">Copy link<\/button><\/div><\/div>/);
  assert.doesNotMatch(RESULTS_HTML, /ui-code__label/, 'no label inside the chip');
  assert.match(MAIN, /onCopy: \(c\) => copyCode\(c\)/, 'the shell copies through the clipboard');
});

test('the view makes the secondary actions small while Watch best shows, and middle-sized otherwise', () => {
  const root = fakeRoot();
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  const small = () => ['r-watch', 'r-watch-best', 'r-records'].map((id) => root.el(id).classList.contains('ui-button--sm'));
  view.show(resultsContent({ summary: summary(), watch: true, watchBest: 'b' }));
  assert.deepEqual(small(), [true, true, true]);
  view.show(resultsContent({ summary: summary(), watch: true, watchBest: null }));
  assert.deepEqual(small(), [false, false, false]);
});

// ---------------------------------------------------------------- Look at the board (3D)

const BOARD_3D = createBoardIdentity({ mode: '3d', width: 8, height: 8, depth: 8, mines: 40, noGuess: false });

test('a 3D game\'s results carry Look at the board, over the dimmed scene; a Classic 2D game\'s carry neither', () => {
  const three = resultsContent({ summary: summary({ board: { ...BOARD_3D } }), comparison });
  assert.equal(three.look, true);
  assert.equal(three.over3d, true);
  assert.equal(resultsContent({ summary: lostSummary({ board: { ...BOARD_3D } }) }).look, true, 'after a loss too');
  const flat = resultsContent({ summary: summary(), comparison });
  assert.equal(flat.look, false);
  assert.equal(flat.over3d, false);
});

test('the view shows Look at the board for a 3D summary only, calls back on it, and notes a refused pointer lock until the card shows again', () => {
  const root = fakeRoot();
  const calls = [];
  const view = createResultsView({ root, onPlayAgain: () => calls.push('again'), onRecords() {}, onMenu: () => calls.push('menu'), onLook: () => calls.push('look') });
  view.show(resultsContent({ summary: summary({ board: { ...BOARD_3D } }), comparison }));
  assert.equal(root.el('r-look').classList.contains('hidden'), false, 'shown for a 3D game');
  assert.equal(root.el('results-look-note').classList.contains('hidden'), true, 'no note');
  root.el('r-look').click();
  root.el('r-menu').click();
  assert.deepEqual(calls, ['look', 'menu'], 'Look calls back; Main menu keeps its meaning');
  view.noteLook(LOOK_REFUSED);
  assert.equal(root.el('results-look-note').textContent, LOOK_REFUSED);
  assert.equal(root.el('results-look-note').classList.contains('hidden'), false);
  view.show(resultsContent({ summary: summary({ board: { ...BOARD_3D } }), comparison }));
  assert.equal(root.el('results-look-note').classList.contains('hidden'), true, 'the note goes with the next showing');
  view.show(resultsContent({ summary: summary(), comparison }));
  assert.equal(root.el('r-look').classList.contains('hidden'), true, 'hidden for Classic 2D');
  assert.match(LOOK_REFUSED, /^[^\n]{10,120}$/, 'one line');
});

test('the Esc hint sits on what Esc does: Look at the board on a 3D card that offers it, with the rank at the end of the board line; Main menu otherwise', () => {
  const root = fakeRoot();
  const look = () => root.classList.contains('results--look');
  const view = createResultsView({ root, onPlayAgain() {}, onRecords() {}, onMenu() {} });
  view.show(resultsContent({ summary: summary({ board: { ...BOARD_3D } }), comparison, rank: { position: 9, of: 42 } }));
  assert.equal(look(), true, 'a 3D results card: Main menu without its Esc hint');
  assert.equal(root.el('r-look').classList.contains('hidden'), false, 'Look at the board, with its own');
  assert.equal(root.el('results-rank').classList.contains('hidden'), true, 'no rank chip over the scene');
  assert.equal(root.el('results-board').textContent, '3D · Cube Intermediate · #9 of 42 wins on this board', 'the rank at the end of the board line');
  view.show(resultsContent({ summary: summary(), comparison, rank: { position: 9, of: 42 } }));
  assert.equal(look(), false, 'a Classic 2D results card: Esc is Main menu');
  assert.equal(root.el('results-rank').classList.contains('hidden'), false);
  assert.equal(root.el('results-board').textContent, 'Classic 2D · Beginner', 'the rank in its chip, not on the board line');
  view.show({ ...resultsContent({ summary: summary({ board: { ...BOARD_3D } }), comparison }), look: false });
  assert.equal(look(), false, 'a 3D card whose board can no longer be looked at: Esc goes back to the menu');
  assert.match(read('css/style.css'), /#results\.results--look #r-menu \.ui-key-hint\s*\{\s*display:\s*none;\s*\}/, 'which hides Main menu\'s Esc hint');
  assert.match(RESULTS_HTML, /id="r-look" class="ui-button ui-button--secondary hidden" data-icon="eye">Look at the board <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button>/);
  assert.match(RESULTS_HTML, /id="r-menu" class="ui-button ui-button--secondary" data-icon="arrow-left">Main menu <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button>/);
  assert.match(read('js/ui.js'), /for \(const id of \[[^\]]*'results'[^\]]*\]\) showKeyHints/, 'its key hints follow the active device');
});

test('Back on a 3D results card opens the look, Main menu still goes to the menu; Back on a Classic 2D card goes to the menu', () => {
  const main = read('js/main.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  const row = main.match(/results: \{ defaultFocus: '#r-again'[^\n]*/)[0];
  assert.match(row, /back: \(\{ source \}\) => resultsBack\(source\)/);
  const at = main.indexOf('function resultsBack(');
  const body = main.slice(at, main.indexOf('\n}', at));
  assert.match(body, /lookable\(\)/, 'only where the finished 3D board can be looked at');
  assert.match(body, /openLook\(source\)/);
  assert.match(body, /RESULTS\.toMenu\(\)/, 'otherwise the menu, as before');
  assert.match(main, /onMenu: \(\) => RESULTS\.toMenu\(\)/, 'Main menu keeps its meaning');
  assert.match(main, /onLook: \(\) => openLook\(padGesture \? 'pad' : 'pointer'\)/, 'the action: a controller\'s A looks lockless, a click or key is the lock gesture');
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
    summary: s, mode: 'classic-2d', comparison, saved: true, notSaved: false, watch: false, watchBest: null,
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
    summary: s, mode: '3d', comparison, saved: true, notSaved: false, watch: false, watchBest: null,
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
  assert.deepEqual(RESULTS_ACTIONS, ['r-again', 'r-watch', 'r-watch-best', 'r-look', 'r-records', 'r-menu']);
  assert.equal(resultsEnter({ focused: 'r-again' }), 'playAgain', 'its default focus');
  assert.equal(resultsEnter({ focused: null }), 'playAgain', 'no focus');
  assert.equal(resultsEnter({ focused: 'results' }), 'playAgain', 'the card itself, no action');
  for (const id of ['r-look', 'r-watch', 'r-records', 'r-menu']) assert.equal(resultsEnter({ focused: id }), null, `${id} is activated by its own Enter`);
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
  assert.match(MAIN, /window\.addEventListener\('keydown', \(e\) => \{ if \(END_SKIP\.keyDown\(e\) \|\| \(\(isBackKey\(e\.code\) \|\| !looking\(\)\) && LOOK_END\.keyDown\(e\)\)\) swallow\(e\); \}, true\)/,
    'the shell consumes it in the capture phase, before the results screen\'s keys see it');
});

test('after a mouse button ended the look, a key press on the card ends that press\'s click window: Enter\'s own click on a button goes through', () => {
  let open = true;
  const look = createEndSkip({ ending: () => open, skip: () => { open = false; } });
  // the shell feeds LOOK_END Esc in the look, and every key outside it
  const keyDown = (e) => (e.code === 'Escape' || !open) && look.keyDown(e);
  assert.equal(look.press(), true, 'the press ends the look');
  assert.equal(open, false);
  assert.equal(look.release({ buttons: 0 }), true);
  assert.equal(look.click({ isTrusted: true }), true, 'its own click is consumed');
  assert.equal(keyDown({ code: 'Tab', repeat: false }), false, 'Tab moves the focus');
  assert.equal(look.click({ isTrusted: true }), false, 'Enter\'s trusted click on the focused button reaches it');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RESULTS_HTML = INDEX.slice(INDEX.indexOf('<section id="results"'), INDEX.indexOf('<!-- /Results -->'));

test('the results screen is the kit composition: one framed column — header band, figure tiles, details, board code, action bar', () => {
  assert.ok(RESULTS_HTML.length > 400, 'index.html holds #results');
  assert.match(RESULTS_HTML, /^<section id="results" class="overlay hidden"/);
  const classes = [...RESULTS_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
  assert.match(RESULTS_HTML, /<section id="results-frame" class="ui-frame" aria-labelledby="results-title" data-outcome="won">/);
  assert.doesNotMatch(RESULTS_HTML, /ui-card|ui-banner|ui-panel|ui-columns/, 'no card, no banner, no bests panel, no second column');
  for (const id of ['results-title', 'results-board', 'results-rank', 'results-label', 'rs-time', 'rs-bbbv', 'rs-bbbvSolved', 'rs-bbbvPerSecond', 'rs-efficiency',
    'rd-clicks', 'rd-target', 'rd-winRate', 'results-code', 'results-note', 'r-again', 'r-look', 'r-watch', 'r-watch-best', 'r-records', 'r-menu', 'results-look-note']) {
    assert.ok(RESULTS_HTML.includes(`id="${id}"`), `#${id}`);
  }
  for (const gone of ['results-banner', 'results-bests', 'rb-time', 'results-figures', 'results-next', 'results-standing', 'results-keys', 'data-esc-hint', 'results-rank-line']) {
    assert.ok(!RESULTS_HTML.includes(gone), `${gone} is gone`);
  }
  // Top to bottom: the head (title, board, rank; the chips and Look at the board on the right), the
  // tiles, the details, the code, the note, then the foot's bar: Main menu left; the rest right.
  const order = ['results-head', 'results-trophy', 'results-title', 'results-board', 'results-rank', 'results-label', 'r-look',
    'results-tiles', 'rs-time', 'rs-bbbvSolved', 'rs-bbbvPerSecond', 'rs-efficiency', 'rs-bbbv', 'results-details', 'rd-clicks', 'rd-target', 'rd-winRate',
    'results-code-group', 'results-code-label', 'results-code', 'results-note', 'results-actions', 'r-menu', 'r-watch', 'r-watch-best', 'r-records', 'r-again', 'results-look-note'];
  const at = order.map((id) => RESULTS_HTML.indexOf(`id="${id}"`));
  assert.ok(at.every((i) => i >= 0), `every part is in the markup: ${order.filter((_, k) => at[k] < 0)}`);
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'in reading order');
  assert.match(RESULTS_HTML, /<header class="ui-frame__head" id="results-head">/);
  assert.match(RESULTS_HTML, /<h2 class="ui-frame__title" id="results-title">You won!<\/h2>/);
  assert.match(RESULTS_HTML, /<span id="results-rank" class="ui-chip hidden"><\/span>/);
  assert.match(RESULTS_HTML, /<span id="results-label" class="ui-chip ui-chip--muted hidden"><\/span>/);
  assert.match(RESULTS_HTML, /<div id="results-tiles" class="ui-stat-row ui-stat-row--tiles">/);
  for (const key of ['time', 'bbbvSolved', 'bbbvPerSecond', 'efficiency', 'bbbv']) {
    assert.match(RESULTS_HTML, new RegExp(`<div id="rs-${key}" class="ui-stat ui-stat--tile( hidden)?" role="group" aria-labelledby="rs-${key}-label">`), `#rs-${key} is a stat tile`);
  }
  assert.equal((RESULTS_HTML.match(/<span class="ui-chip ui-chip--best hidden">New best<\/span>/g) ?? []).length, 3, 'a New best badge on each comparable tile');
  assert.match(RESULTS_HTML, /<progress id="rs-progress" max="1" value="0" aria-labelledby="rs-bbbvSolved-label"><\/progress>/, '3BV solved carries its progress bar');
  assert.match(RESULTS_HTML, /<table id="results-details" class="ui-table">/);
  assert.match(RESULTS_HTML, /<footer class="ui-frame__foot ui-frame__foot--action" id="results-actions">/);
  // Every action leads with its icon; the secondary actions take the middle size, Play again the large one.
  const buttons = [...RESULTS_HTML.matchAll(/<button type="button" id="(r-[a-z-]+)" class="ui-button ([^"]+)" data-icon="([a-z-]+)">([^<]+)</g)]
    .map((m) => [m[1], m[2], m[3], m[4].trim()]);
  assert.deepEqual(buttons, [
    ['r-look', 'ui-button--secondary hidden', 'eye', 'Look at the board'],
    ['r-menu', 'ui-button--secondary', 'arrow-left', 'Main menu'],
    ['r-watch', 'ui-button--secondary hidden', 'film', 'Watch replay'],
    ['r-watch-best', 'ui-button--secondary hidden', 'trophy', 'Watch best'],
    ['r-records', 'ui-button--secondary', 'chart', 'Records'],
    ['r-again', 'ui-button--primary ui-button--go ui-button--lg', 'play', 'Play again'],
  ]);
  assert.match(RESULTS_HTML, /id="r-again" class="ui-button ui-button--primary ui-button--go ui-button--lg" data-icon="play">Play again <span class="ui-key-hint" data-action="confirm" aria-hidden="true"><\/span><\/button>/, 'Play again shows its controller glyph, no Enter label');
  assert.match(RESULTS_HTML, /<p id="results-look-note" class="ui-text ui-text--warning hidden" role="status"><\/p>/);
});

test('the results layout: one column sized to its content; on a phone the tiles two by two and the actions stacked, Play again first', () => {
  const style = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(style, /#results-frame\s*\{[^}]*width:\s*min\(/, 'the frame is sized to its content, never past the window');
  assert.match(style, /#results-tiles\s*\{[^}]*grid-template-columns:\s*repeat\(4,/, 'four tiles in a row');
  const narrow = style.slice(style.indexOf('@media (max-width: 999px)', style.indexOf('#results-frame')));
  assert.match(narrow, /^@media \(max-width: 999px\) \{\s*#results-tiles\s*\{[^}]*grid-template-columns:\s*repeat\(2,/, 'two by two below a 1000 px window, and so on a phone');
  const phone = style.slice(style.indexOf('@media (max-width: 719px)', style.indexOf('#results-frame')));
  assert.match(phone, /#r-again\s*\{[^}]*grid-column:\s*1 \/ -1[^}]*order:\s*-1/, 'Play again full width, first');
  assert.match(phone, /#r-menu\s*\{[^}]*grid-column:\s*1 \/ -1/, 'Main menu full width, last');
  assert.doesNotMatch(style, /#results-stats|#results-bests/, 'the old card\'s rules are gone');
});

test('the results card to the canvas: its width by window size, the head, the loss head, the tiles, the details, the code row and the phone card', () => {
  const style = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const theme = read('themes/joyful-tiles/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = (css, sel) => css.match(new RegExp(`(?:^|[}\\s])${sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`, 'm'))?.[1] ?? '';
  const J = ':root[data-theme="joyful-tiles"] ';
  // 1040 px wide on the largest windows, 1000 px below 1440 px, 960 px below 1200 px.
  assert.match(style, /#results-frame \{ width: min\(1040px, 100%\); \}\s*@media \(max-width: 1439px\) \{ #results-frame \{ width: min\(1000px, 100%\); \} \}\s*@media \(max-width: 1199px\) \{ #results-frame \{ width: min\(960px, 100%\); \} \}/);
  assert.match(rule(theme, `${J}#results-frame`), /border-radius: 22px;[\s\S]*box-shadow: inset 0 -2px 0 var\(--color-line\), 0 8px 0 var\(--color-head-edge\), var\(--elevation-2\);/, 'radius 22 on an 8 px head-edge drop');
  // The head: 22 × 28 px padding, the title 40 px, the board line 16 px bold, the trophy in a 56 px white tile on the head's edge.
  assert.match(rule(style, '#results-head'), /gap: 16px; padding: 22px 28px;/);
  assert.match(rule(style, '#results-head .ui-frame__title'), /font-size: 40px;/);
  assert.match(rule(style, '#results-board'), /font-size: 16px; font-weight: var\(--font-weight-bold\);/);
  assert.match(rule(style, '#results-trophy'), /width: 56px; height: 56px;/);
  assert.match(rule(theme, `${J}#results-trophy`), /border-radius: 16px;\s*background: var\(--color-surface\);\s*box-shadow: 0 4px 0 var\(--color-head-edge\);/);
  assert.match(RESULTS_HTML, /<span id="results-trophy" aria-hidden="true"><svg viewBox="0 0 24 24" width="30" height="30"/, 'a 30 px trophy in its tile');
  // The rank chip 14 px on 6 × 12 px, white; a loss's head the neutral sunk band with no trophy column.
  assert.match(rule(style, '#results-head :is(#results-rank, #results-label)'), /font-size: 14px; padding: 6px 12px;/);
  assert.match(rule(theme, `${J}#results-head :is(#results-rank, #results-label)`), /background: var\(--color-surface\); color: var\(--color-ink\);/);
  assert.match(rule(theme, `${J}#results-frame[data-outcome="lost"] #results-head`), /background: var\(--color-surface-sunk\);\s*border-bottom-color: var\(--color-line\);/);
  assert.match(rule(style, '#results-frame[data-outcome="lost"] #results-head .ui-frame__start'), /display: none;/);
  // The 3BV solved bar: 10 px, radius 6, teal on the line colour, not the native look.
  assert.match(rule(style, '#rs-progress'), /height: 10px;[^}]*appearance: none;/);
  assert.match(rule(theme, `${J}#rs-progress`), /border: 0; border-radius: 6px; background: var\(--color-line\);/);
  assert.match(rule(theme, `${J}#rs-progress::-webkit-progress-value`), /background: var\(--color-teal-edge\);/);
  assert.match(rule(theme, `${J}#rs-progress::-moz-progress-bar`), /background: var\(--color-teal-edge\);/);
  assert.match(rule(theme, `${J}#rs-progress::-webkit-progress-bar`), /background: var\(--color-line\);/);
  // The details: each label 15 px heavy, at least 110 px, beside its 14 px value; a ruled line per row.
  assert.match(rule(style, '#results-details tr'), /display: flex; gap: 14px; padding: 9px 0;/);
  assert.match(rule(style, '#results-details th'), /min-width: 110px; font-size: 15px; font-weight: var\(--font-weight-heavy\);/);
  assert.match(rule(style, '#results-details td'), /font-size: 14px; text-align: start;/);
  assert.match(rule(theme, `${J}.ui-table tbody tr`), /border-top: 1px solid var\(--color-line\);/);
  // The code row: the label on the left, the chip on the right.
  assert.match(rule(style, '#results-code-group'), /display: flex; align-items: center; justify-content: space-between;/);
  // On a phone: the card 12 px in from the sides and top, the page scrolling, its body 16 px in, each label over its value, the code under its label.
  const phone = style.slice(style.indexOf('@media (max-width: 719px)', style.indexOf('#results-frame')));
  assert.match(phone, /#results \{ align-items: flex-start; padding: 12px; \}/);
  assert.match(phone, /#results-frame \{ width: 100%; max-height: none; flex: none; \}/);
  assert.match(phone, /#results-body \{ overflow: visible; padding: 16px; \}/);
  assert.match(phone, /#results-head \{ grid-template-columns: auto minmax\(0, 1fr\); padding: 18px; \}/);
  assert.match(phone, /#results-head \.ui-frame__title \{ font-size: 32px; \}/);
  assert.match(phone, /#results-details tr \{ flex-direction: column; gap: 2px; \}/);
  assert.match(phone, /#results-code-group \{ flex-direction: column;/);
  assert.match(style, /@media \(pointer: coarse\) \{\s*#results :is\(#r-again, #r-menu\) \.ui-key-hint \{ display: none; \}/, 'no key hints on Play again and Main menu by touch');
});

test('no first-use toast draws over the results card', () => {
  const style = read('css/style.css');
  assert.match(style, /body:has\(> #results:not\(\.hidden\)\) #toast\.toast--first-use \{ display: none; \}/);
  assert.match(MAIN, /ui\.toast\(ui\.hint\('autoHide'\), 4000, \{ firstUse: true \}\)/, 'the auto-hide hint is a first-use toast');
  assert.match(MAIN, /ui\.toast\(ui\.hint\('aimHint'\), 4000, \{ firstUse: true \}\)/, 'and so is the aim hint');
  assert.match(read('js/ui.js'), /t\.classList\[firstUse \? 'add' : 'remove'\]\('toast--first-use'\);/, 'the toast carries the mark, cleared for any other toast');
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
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  const css = read('themes/joyful-tiles/theme.css').replace(/:root\[data-theme="joyful-tiles"\] /g, '');
  for (const part of ['data-delta', 'ui-panel--muted', 'ui-banner']) assert.ok(head.includes(part), `the catalogue documents ${part}`);
  const rule = (sel) => css.match(new RegExp(`${sel.replace(/[[\]().]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
  assert.match(rule('.ui-stat__detail[data-delta="better"]'), /color:\s*var\(--color-success\)/);
  assert.match(rule('.ui-stat__detail[data-delta="worse"]'), /color:\s*var\(--color-ink-muted\)/);
  assert.match(rule('.ui-stat__detail[data-delta="equal"]'), /color:\s*var\(--color-ink-muted\)/);
  assert.match(css, /\.ui-panel--muted[^{]*\{[^}]*color:\s*var\(--color-ink-muted\)/);
  assert.match(css, /\.ui-panel--muted\s*\{[^}]*background:\s*var\(--color-surface-sunk\)/);
  assert.match(css, /\.ui-stat\[data-new-best\]\s*\{/);
  assert.match(css, /\.ui-banner\s*\{/);
  const gallery = read('dev/components.html');
  for (const part of ['data-delta="better"', 'data-delta="worse"', 'data-delta="equal"', 'ui-panel--muted', 'ui-banner']) {
    assert.ok(gallery.includes(part), `the gallery shows ${part}`);
  }
});

test('the coloured differences meet the body-text contrast contract on a figure tile and on the kit\'s other surfaces', () => {
  const tokens = read('themes/joyful-tiles/theme.css').replace(/\/\*[\s\S]*?\*\//g, '');
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
  const t = block(':root[data-theme="joyful-tiles"]');
  for (const surface of ['--color-surface-raised', '--color-surface', '--color-surface-sunk']) {
    const panel = over(parse(t.get(surface)), [255, 255, 255, 1]);
    for (const ink of ['--color-success', '--color-danger', '--color-ink-muted']) {
      const r = ratio(parse(t.get(ink)), panel);
      assert.ok(r >= 4.5, `${ink} on ${surface} ${r.toFixed(2)}:1`);
    }
  }
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser, a fixed Beginner board won through the shell shows the results, then Play again', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fixed board: every board seed the session draws is 12345. A fake standard controller,
    // idle until pressed, for Watch replay's controller turn.
    await page.addInitScript(() => {
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
      const pad = {
        id: 'Fake pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
        buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
        axes: [0, 0, 0, 0],
      };
      globalThis.__fakePad = pad;
      Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
    });
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const frames = (n) => page.evaluate((count) => new Promise((done) => {
      const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
      step(count);
    }), n);
    // Holds a controller button for exactly one poll, then waits two frames (as tests/shell-menu.test.mjs).
    const press = async (b) => {
      await page.evaluate((i) => new Promise((done) => {
        const set = (v) => {
          Object.assign(globalThis.__fakePad.buttons[i], { pressed: v, touched: v, value: v ? 1 : 0 });
          globalThis.__fakePad.timestamp++;
        };
        set(true);
        requestAnimationFrame(() => { set(false); done(); });
      }), b);
      await frames(2);
    };
    const PAD = { A: 0, B: 1, LEFT: 14 };
    const focused = () => page.evaluate(() => document.activeElement.id);
    const viewerReady = () => page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    const shownNow = (id) => page.evaluate((i) => {
      const el = document.getElementById(i);
      return !el.classList.contains('hidden') && el.getBoundingClientRect().width > 0;
    }, id);

    await page.click('#menu-entry-classic-2d');
    if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
    await page.click('#c2d-choice [data-size="beginner"]');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d');

    // The cell centres, from the board view's own layout of the canvas.
    const centres = await page.evaluate(async () => {
      const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const L = globalThis.__ms.board2D.layout;
      return Array.from({ length: 81 }, (_, c) => ({
        x: r.left + L.offsetX + (c % 9) * L.pitch + 0.5 * L.tile, y: r.top + L.offsetY + Math.floor(c / 9) * L.pitch + 0.5 * L.tile,
      }));
    });
    const first = 40;
    const mines = await page.evaluate(async (fc) => {
      const { generate } = await import('/js/generation/generate.js');
      const r = generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: fc, noGuess: false, seed: 12345 });
      return [...r.mines];
    }, first);
    const hudClicks = () => page.evaluate(() => document.getElementById('c2d-clicks').textContent);
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
      const note = (id) => document.querySelector(`#${id} .ui-stat__detail`).textContent.trim();
      const visible = (id) => !document.getElementById(id).classList.contains('hidden') && document.getElementById(id).getBoundingClientRect().width > 0;
      const row = (id) => visible(id) && `${document.querySelector(`#${id} th`).textContent.trim()}: ${document.querySelector(`#${id} td`).textContent.trim()}`;
      const tiles = [...document.querySelectorAll('#results-tiles .ui-stat--tile')].filter((e) => e.getBoundingClientRect().width > 0);
      return {
        title: text('results-title'), board: text('results-board'), time: value('rs-time'), bbbv: value('rs-bbbv'),
        rate: value('rs-bbbvPerSecond'), efficiency: value('rs-efficiency'), solvedShown: visible('rs-bbbvSolved'),
        tiles: tiles.map((e) => e.id), tops: tiles.map((e) => Math.round(e.getBoundingClientRect().top)),
        timeNote: note('rs-time'), bbbvNote: note('rs-bbbv'),
        badges: tiles.filter((e) => e.querySelector('.ui-chip--best')?.getBoundingClientRect().width > 0).map((e) => e.id),
        highlighted: tiles.filter((e) => e.hasAttribute('data-new-best')).map((e) => e.id),
        rank: visible('results-rank') && text('results-rank'), trophy: visible('results-trophy'),
        clicksRow: row('rd-clicks'), target: row('rd-target'), winRate: row('rd-winRate'),
        board2d: visible('c2d'), focus: document.activeElement.id, games: globalThis.__ms.records.counters('classic-2d:square:9x9:10:guess').games,
        clicks: globalThis.__ms.records.history('classic-2d:square:9x9:10:guess').at(-1).clicks,
        hints: [...document.querySelectorAll('#results .ui-key-hint')].filter((e) => e.getBoundingClientRect().width > 0)
          .map((e) => `${e.closest('button').id}:${e.textContent}`),
        // the layout box, so the focused button's selected-state lift does not count
        bar: ['r-menu', 'r-records', 'r-again'].map((id) => { const e = document.getElementById(id); return e.offsetParent === document.getElementById('r-menu').offsetParent && e.offsetTop + e.offsetHeight / 2; }),
        menuLeft: document.getElementById('r-menu').getBoundingClientRect().right < document.getElementById('r-records').getBoundingClientRect().left,
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.getElementById('results-frame').scrollWidth > document.getElementById('results-frame').clientWidth,
      };
    });
    assert.equal(shown.title, 'You won!');
    assert.equal(shown.board, 'Classic 2D · Beginner');
    assert.match(shown.time, /^\d+\.\d{3} s$/);
    assert.match(shown.bbbv, /^\d+$/);
    assert.match(shown.rate, /^\d+\.\d\d$/);
    assert.match(shown.efficiency, /^\d+\.\d%$/);
    assert.equal(shown.solvedShown, false);
    assert.deepEqual(shown.tiles, ['rs-time', 'rs-bbbvPerSecond', 'rs-efficiency', 'rs-bbbv'], 'four figure tiles');
    assert.equal(new Set(shown.tops).size, 1, 'in one row');
    assert.deepEqual(shown.badges, ['rs-time', 'rs-bbbvPerSecond', 'rs-efficiency'], 'a first win sets every best, each tile badged');
    assert.deepEqual(shown.highlighted, shown.badges);
    assert.equal(shown.timeNote, '', 'no best was replaced');
    assert.equal(shown.bbbvNote, 'board difficulty');
    assert.equal(shown.rank, '#1 of 1 wins on this board');
    assert.equal(shown.trophy, true);
    assert.equal(shown.clicksRow, `Clicks: ${formatClicks(shown.clicks)}`);
    assert.equal(shown.clicksRow.split(' ')[1], made, 'the overlay, frozen at the end, and the card count the same clicks');
    assert.equal(shown.target, `Next target: beat ${shown.time} · streak 1`);
    assert.equal(shown.winRate, 'Win rate: 100% · completed games 100% · longest streak 1');
    assert.equal(shown.board2d, true, 'the finished board stays visible behind the screen');
    assert.equal(shown.focus, 'r-again', 'Play again has default focus');
    assert.equal(shown.games, 1, 'the game was recorded');
    assert.deepEqual(shown.hints, ['r-menu:Esc'], 'Main menu shows Esc; Play again, a confirm button, no Enter label');
    assert.ok(Math.max(...shown.bar) - Math.min(...shown.bar) <= 2, `the action bar is one row (${shown.bar})`);
    assert.equal(shown.menuLeft, true, 'Main menu on the left');
    assert.equal(shown.hscroll, false, 'no horizontal scroll');
    // The card as the canvas draws it at 1366 × 768: 1000 px wide, the head 22 × 28 px with the 40 px title and the 56 px trophy tile,
    // the rank chip 14 px, each detail's label 15 px heavy beside its 14 px mono value, every action with its icon.
    const look = await page.evaluate(() => {
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const box = (sel) => document.querySelector(sel).getBoundingClientRect();
      return {
        width: Math.round(box('#results-frame').width), radius: cs('#results-frame').borderRadius, head: cs('#results-head').padding,
        title: [cs('#results-title').fontSize, cs('#results-title').fontWeight], board: [cs('#results-board').fontSize, cs('#results-board').fontWeight],
        trophy: [Math.round(box('#results-trophy').width), Math.round(box('#results-trophy').height), cs('#results-trophy').backgroundColor],
        rank: [cs('#results-rank').fontSize, cs('#results-rank').padding],
        label: [cs('#rd-clicks th').fontSize, cs('#rd-clicks th').fontWeight, Math.round(box('#rd-clicks th').width) >= 110],
        value: [cs('#rd-clicks td').fontSize, /JetBrains Mono/.test(cs('#rd-clicks td').fontFamily), box('#rd-clicks td').left > box('#rd-clicks th').left, Math.abs(box('#rd-clicks td').top - box('#rd-clicks th').top) <= 2],
        rule: cs('#rd-clicks').borderTopWidth,
        icons: ['r-menu', 'r-watch', 'r-records', 'r-again'].map((id) => document.querySelector(`#${id} > .ui-icon`)?.dataset.icon ?? null),
        codeRow: box('#results-code-group .ui-section-label').right < box('#results-code').left,
      };
    });
    assert.deepEqual(look, {
      width: 1000, radius: '22px', head: '22px 28px', title: ['40px', '800'], board: ['16px', '700'], trophy: [56, 56, 'rgb(255, 255, 255)'],
      rank: ['14px', '6px 12px'], label: ['15px', '800', true], value: ['14px', true, true, true], rule: '1px',
      icons: ['arrow-left', 'film', 'chart', 'play'], codeRow: true,
    });
    for (const [width, height, cardW] of [[1920, 1080, 1040], [1024, 768, 960]]) {
      await page.setViewportSize({ width, height });
      assert.equal(await page.evaluate(() => Math.round(document.getElementById('results-frame').getBoundingClientRect().width)), cardW, `the card is ${cardW} wide at ${width} × ${height}`);
    }

    // On a phone the same card: tiles two by two, Play again first and full width, Main menu last; no horizontal scroll.
    await page.setViewportSize({ width: 390, height: 844 });
    const phone = await page.evaluate(() => {
      const box = (id) => document.getElementById(id).getBoundingClientRect();
      const tiles = ['rs-time', 'rs-bbbvPerSecond', 'rs-efficiency', 'rs-bbbv'].map((id) => Math.round(box(id).top));
      return {
        rows: new Set(tiles).size, pairs: tiles[0] === tiles[1] && tiles[2] === tiles[3],
        overflow: [...document.querySelectorAll('#results-tiles .ui-stat--tile')].filter((t) => t.getBoundingClientRect().width > 0
          && [...t.children].some((c) => c.getBoundingClientRect().right > t.getBoundingClientRect().right + 0.5)).map((t) => t.id),
        again: [box('r-again').top < box('r-records').top, box('r-again').width > box('r-records').width * 1.5],
        menuLast: box('r-menu').top > box('r-records').top,
        hscroll: document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.getElementById('results-frame').scrollWidth > document.getElementById('results-frame').clientWidth,
      };
    });
    assert.deepEqual(phone, { rows: 2, pairs: true, overflow: [], again: [true, true], menuLast: true, hscroll: false });
    // The phone card: 12 px in from the sides and top, its head 18 px in with the 32 px title, its body 16 px in, each detail's
    // label over its value, the code chip under its label, and the action bar in flow at the card's end — the page scrolls to it.
    const phoneCard = await page.evaluate(() => {
      const box = (sel) => document.querySelector(sel).getBoundingClientRect();
      const cs = (sel) => getComputedStyle(document.querySelector(sel));
      const frame = box('#results-frame');
      const scroller = document.getElementById('results');
      return {
        insets: [Math.round(frame.left), Math.round(window.innerWidth - frame.right), Math.round(frame.top + scroller.scrollTop)],
        head: cs('#results-head').padding, title: cs('#results-title').fontSize, body: cs('#results-body').padding,
        stacked: box('#rd-clicks td').top >= box('#rd-clicks th').bottom - 1,
        code: box('#results-code').top >= box('#results-code-group .ui-section-label').bottom - 1,
        footInFlow: Math.round(box('#results-actions').bottom) === Math.round(frame.bottom) && box('#results-actions').top >= box('#results-body').bottom - 1,
        scrolls: scroller.scrollHeight > scroller.clientHeight,
      };
    });
    assert.deepEqual(phoneCard, { insets: [12, 12, 12], head: '18px', title: '32px', body: '16px', stacked: true, code: true, footInFlow: true, scrolls: true });
    // The narrowest four-tile window, a narrow desktop window and the narrowest phone, with long figures: none outgrows its tile.
    for (const [width, height] of [[1000, 800], [720, 800], [360, 740]]) {
      await page.setViewportSize({ width, height });
      const over = await page.evaluate(() => {
        const keep = [...document.querySelectorAll('#results-tiles .ui-stat__value')].map((v) => v.textContent);
        for (const v of document.querySelectorAll('#results-tiles .ui-stat__value')) v.textContent = '143.271 s';
        const out = [...document.querySelectorAll('#results-tiles .ui-stat--tile')].filter((t) => t.getBoundingClientRect().width > 0
          && [...t.children].some((c) => c.getBoundingClientRect().right > t.getBoundingClientRect().right + 0.5)).map((t) => t.id);
        document.querySelectorAll('#results-tiles .ui-stat__value').forEach((v, i) => { v.textContent = keep[i]; });
        return out;
      });
      assert.deepEqual(over, [], `no figure outgrows its tile at ${width} px`);
    }
    await page.setViewportSize({ width: 1366, height: 768 });

    // Watch replay shows beside Play again; the mouse opens the viewer on the game just played.
    assert.equal(await shownNow('r-watch'), true, 'Watch replay is offered');
    await page.click('#r-watch');
    assert.equal(await mode(), 'replay');
    await viewerReady();
    const played = await page.evaluate(() => globalThis.__ms.replayViewer.state);
    assert.equal(played.time, -500, 'the replay starts at the beginning, on the closed board');
    assert.ok(played.duration > 0);
    await page.keyboard.press('End');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended);
    assert.match(await page.evaluate(() => document.getElementById('replay-end').textContent), /won/i, 'the replay ends on the win');
    // Back returns to the results screen of the same game.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'results', 'Back from the viewer returns to the results screen');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.status), 'closed');
    assert.equal(await page.evaluate(() => document.getElementById('results-title').textContent), 'You won!', 'the same results');
    assert.equal(await shownNow('c2d'), true, 'the finished board is still behind the results screen');
    // The keyboard reaches Watch replay too: back from Play again past Records, Enter.
    assert.equal(await focused(), 'r-again');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Shift+Tab');
    assert.equal(await focused(), 'r-watch', 'Shift+Tab twice from Play again');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'replay', 'Enter on Watch replay');
    await viewerReady();
    await page.click('#rp-back');
    assert.equal(await mode(), 'results');
    // And the controller: left from Play again past Records, A opens the viewer, B comes back.
    assert.equal(await focused(), 'r-again');
    await press(PAD.LEFT);
    await press(PAD.LEFT);
    assert.equal(await focused(), 'r-watch', 'Left twice from Play again');
    await press(PAD.A);
    assert.equal(await mode(), 'replay', 'A on Watch replay');
    await viewerReady();
    await press(PAD.B);
    assert.equal(await mode(), 'results', 'B from the viewer');

    // Records, then Back: the results screen shows again, and Play again still starts the same choice.
    await page.click('#r-records');
    assert.equal(await mode(), 'records', 'the records screen');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Beginner · Bests', 'on this board');
    assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('records-back'); return [b.hasAttribute('data-to-menu'), b.getAttribute('aria-label'), b.innerText.split('\n')[0].trim()]; }),
      [false, 'Back', 'Back'], 'Records\' Back returns to the results, so it reads Back');
    assert.equal(await page.evaluate(() => document.querySelector('#rec-games .ui-stat__value').textContent), '1');
    // From the Records screen's library view: Watch on the kept replay, on the best and on the recent
    // game opens the viewer by id; Back returns to Records on the same board.
    const kept = await page.evaluate(() => document.querySelector('#records-replays-body button[data-act="watch"]')?.dataset.id);
    assert.ok(kept, 'the game\'s replay is kept and offers Watch');
    for (const selector of [`#records-replays-body button[data-act="watch"][data-id="${kept}"]`, `#rec-time [data-watch="${kept}"]`, `#records-games-body [data-watch="${kept}"]`]) {
      if (selector.startsWith('#records-replays')) await page.click('#records-tab-replays');
      await page.click(selector);
      assert.equal(await mode(), 'replay', selector);
      await viewerReady();
      await page.keyboard.press('Escape');
      assert.equal(await mode(), 'records', selector);
      assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Beginner · Bests', `${selector}: back on the same board`);
    }
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'results');
    assert.equal(await page.evaluate(() => document.getElementById('results-title').textContent), 'You won!');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'r-again');

    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d', 'Play again goes back to the board');
    assert.deepEqual(await page.evaluate(() => ({ ...globalThis.__ms.modes.state })),
      { mode: 'classic-2d', started: false, finished: false, canPause: false }, 'a fresh game of the same choice');
    assert.equal(await page.evaluate(() => document.getElementById('c2d-size').textContent), '9 × 9 · 10 mines');

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
    assert.deepEqual(await page.evaluate(() => {
      const head = getComputedStyle(document.getElementById('results-head'));
      const sunk = getComputedStyle(document.documentElement).getPropertyValue('--color-surface-sunk').trim();
      const probe = document.createElement('i'); probe.style.color = sunk; document.body.append(probe);
      const want = getComputedStyle(probe).color; probe.remove();
      const bar = getComputedStyle(document.getElementById('rs-progress'));
      return { neutral: head.backgroundColor === want, trophy: document.getElementById('results-trophy').getBoundingClientRect().width, bar: [bar.height, bar.borderRadius, bar.appearance] };
    }), { neutral: true, trophy: 0, bar: ['10px', '6px', 'none'] }, 'a loss: the neutral head with no trophy, the 3BV solved bar 10 px with radius 6');
    assert.equal(await ending(), null, 'the board is drawn in its end state');
    assert.equal(await page.evaluate(() => globalThis.__ms.records.history('classic-2d:square:9x9:10:guess').at(-1).outcome), 'lost', 'recorded finished, as lost');
    await page.evaluate(() => document.getElementById('r-menu').focus());
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'menu', 'Enter on Main menu goes to the menu, not Play again');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
