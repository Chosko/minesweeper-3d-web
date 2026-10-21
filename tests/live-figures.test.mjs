// Live figures model (js/shell/live-figures.js): 3BV progress, pace vs PB, 3BV/s, clicks with the
// live efficiency and flags with mines left, from a game's counts, its elapsed time and the board's
// bests; the neutral placeholder for a figure the inputs cannot yet produce; the change helper.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveFigures, changedFigures, FIGURES, PLACEHOLDER } from '../js/shell/live-figures.js';
import { buildSummary } from '../js/records/summary.js';
import { createBoardIdentity } from '../js/records/board.js';
import { DASH, formatEfficiency } from '../js/results/view.js';

const clicks = (reveal, flag = 0, chord = 0, wasted = 0) => ({
  reveal: { effective: reveal, wasted }, flag: { effective: flag, wasted: 0 }, chord: { effective: chord, wasted: 0 },
});
const input = (over = {}) => ({
  bbbv: 120, bbbvSolved: 60, clicks: clicks(70), flags: 4, mines: 10, elapsedMs: 30000,
  bests: { time: { value: 50000 }, bbbvPerSecond: { value: 2.5 } }, ...over,
});

test('the figures are listed in display order', () => {
  assert.deepEqual([...FIGURES], ['bbbv', 'pace', 'rate', 'clicks', 'flags']);
  assert.equal(PLACEHOLDER, DASH);
});

test('3BV is solved over total with its progress fraction', () => {
  const f = liveFigures(input());
  assert.equal(f.bbbv.text, '60 / 120');
  assert.equal(f.bbbv.progress, 0.5);
  assert.equal(liveFigures(input({ bbbvSolved: 120 })).bbbv.progress, 1);
});

test('3BV before the mines are placed is the placeholder with no progress', () => {
  const f = liveFigures(input({ bbbv: null, bbbvSolved: 0, clicks: clicks(0), elapsedMs: 0 }));
  assert.equal(f.bbbv.text, `0 / ${PLACEHOLDER}`);
  assert.equal(f.bbbv.progress, 0);
});

test('pace vs PB is elapsed minus the best time scaled by the share solved: behind is positive', () => {
  // 30 s elapsed, half the 3BV solved, best 50 s → 30 − 25 = +5 s.
  const f = liveFigures(input());
  assert.equal(f.pace.text, '+5.000 s');
  assert.equal(f.pace.ahead, false);
  assert.equal(f.pace.detail, 'behind 50.000 s');
});

test('pace vs PB ahead of the best is negative, shown with a minus sign', () => {
  // 20 s elapsed, half solved, best 50 s → −5 s.
  const f = liveFigures(input({ elapsedMs: 20000 }));
  assert.equal(f.pace.text, '−5.000 s');
  assert.equal(f.pace.ahead, true);
  assert.equal(f.pace.detail, 'ahead of 50.000 s');
});

test('pace vs PB exactly on the best pace is unsigned zero', () => {
  const f = liveFigures(input({ elapsedMs: 25000 }));
  assert.equal(f.pace.text, '0.000 s');
  assert.equal(f.pace.ahead, false);
  assert.equal(f.pace.detail, 'ahead of 50.000 s', 'on pace is not behind');
});

test('pace vs PB truncates toward zero like the results time format', () => {
  // 20 s elapsed, 1/3 of 120 solved, best 50 s → 20 − 16.6667 = +3.333 s.
  assert.equal(liveFigures(input({ elapsedMs: 20000, bbbvSolved: 40 })).pace.text, '+3.333 s');
});

test('pace vs PB is absent without a best time and before the first 3BV is solved', () => {
  assert.equal(liveFigures(input({ bests: {} })).pace, null);
  assert.equal(liveFigures(input({ bests: { time: null, bbbvPerSecond: null } })).pace, null);
  assert.equal(liveFigures(input({ bests: undefined })).pace, null);
  assert.equal(liveFigures(input({ bbbvSolved: 0 })).pace, null);
  assert.equal(liveFigures(input({ bbbv: null, bbbvSolved: 0 })).pace, null);
});

test('a best may be handed as its plain value', () => {
  const f = liveFigures(input({ bests: { time: 50000, bbbvPerSecond: 2.5 } }));
  assert.equal(f.pace.text, '+5.000 s');
  assert.equal(f.rate.detail, 'PB 2.50');
});

test('3BV/s is 3BV solved per elapsed second with the best 3BV/s as its detail', () => {
  const f = liveFigures(input());
  assert.equal(f.rate.text, '2.00');
  assert.equal(f.rate.detail, 'PB 2.50');
});

test('3BV/s has no detail line on a board with no best 3BV/s', () => {
  assert.equal(liveFigures(input({ bests: {} })).rate.detail, null);
  assert.equal(liveFigures(input({ bests: { time: { value: 50000 }, bbbvPerSecond: null } })).rate.detail, null);
});

test('3BV/s at zero elapsed time is the placeholder, never NaN or Infinity', () => {
  const f = liveFigures(input({ elapsedMs: 0 }));
  assert.equal(f.rate.text, PLACEHOLDER);
  assert.equal(liveFigures(input({ elapsedMs: 0, bbbvSolved: 0 })).rate.text, PLACEHOLDER);
});

test('clicks are the counted clicks with the live efficiency as their detail', () => {
  const f = liveFigures(input({ clicks: clicks(50, 10, 5, 5) }));
  assert.equal(f.clicks.text, '70');
  assert.equal(f.clicks.detail, `efficiency ${formatEfficiency((100 * 60) / 70)}`);
});

test('clicks before any click show zero and the placeholder efficiency', () => {
  const f = liveFigures(input({ bbbvSolved: 0, clicks: clicks(0) }));
  assert.equal(f.clicks.text, '0');
  assert.equal(f.clicks.detail, `efficiency ${PLACEHOLDER}`);
});

test('the live efficiency matches the game summary for the same counts', () => {
  const board = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
  const counts = { bbbv: 30, bbbvSolved: 17, clicks: clicks(19, 3, 2, 4) };
  const summary = buildSummary({ engine: counts, elapsedMs: 12345, board, seed: 1, generatorVersion: 1 });
  const f = liveFigures({ ...counts, flags: 3, mines: 10, elapsedMs: 12345, bests: {} });
  assert.equal(f.clicks.detail, `efficiency ${formatEfficiency(summary.efficiency)}`);
});

test('flags are flags placed with mines left as their detail', () => {
  assert.equal(liveFigures(input()).flags.text, '4');
  assert.equal(liveFigures(input()).flags.detail, '6 mines left');
  assert.equal(liveFigures(input({ flags: 9 })).flags.detail, '1 mine left');
  assert.equal(liveFigures(input({ flags: 12 })).flags.detail, '-2 mines left');
});

test('no figure ever carries NaN or Infinity, whatever the zero case', () => {
  const zero = { bbbv: null, bbbvSolved: 0, clicks: clicks(0), flags: 0, mines: 10, elapsedMs: 0, bests: { time: { value: 0 } } };
  for (const over of [{}, { bbbv: 1 }, { elapsedMs: 1 }]) {
    const text = JSON.stringify(liveFigures({ ...zero, ...over }));
    assert.doesNotMatch(text, /NaN|Infinity/);
  }
});

test('the change helper names the figures whose text or detail changed', () => {
  const a = liveFigures(input());
  assert.deepEqual(changedFigures(a, liveFigures(input())), []);
  assert.deepEqual(changedFigures(a, liveFigures(input({ flags: 5 }))), ['flags']);
  assert.deepEqual(changedFigures(a, liveFigures(input({ elapsedMs: 31000 }))), ['pace', 'rate']);
  assert.deepEqual(changedFigures(a, liveFigures(input({ bbbvSolved: 61, clicks: clicks(71) }))), ['bbbv', 'pace', 'rate', 'clicks']);
});

test('the change helper reports a figure appearing or disappearing', () => {
  const before = liveFigures(input({ bbbvSolved: 0 }));
  const after = liveFigures(input({ bbbvSolved: 1 }));
  assert.ok(changedFigures(before, after).includes('pace'));
  assert.ok(changedFigures(after, before).includes('pace'));
});

test('the change helper treats no previous figures as every figure changed', () => {
  assert.deepEqual(changedFigures(null, liveFigures(input())), [...FIGURES]);
});
