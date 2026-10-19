// Records history (js/records/history-chart.js and its use in js/records/screen.js): the chart's
// points, scaling, text alternative and drawing over a fake canvas with injected tokens, its redraw
// on a theme change; the recent games list's rows, time format and paging; the screen controller's
// paging and live redraw; the #records history markup; and in a browser a seeded history drawn in
// the theme (with screenshots) and paged by keyboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CHART_TOKENS, PAGE_SIZE, NO_WON_GAMES, NO_WON_GAMES_PERIOD, NO_BEST_TIME, chartPoints, niceCeiling, chartScale, chartText, pageOf, drawHistoryChart,
  createHistoryChart, formatShortDate, dateTicks, bestTimeScale, bestTimeText, drawBestTimeChart, nearestIndex, rateReadout, bestReadout,
} from '../js/records/history-chart.js';
import { bestTimeSteps } from '../js/records/stats.js';
import { recordsContent, createRecordsScreen, formatDateTime } from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { bbbvPerSecond, efficiency } from '../js/records/summary.js';
import { DASH } from '../js/results/view.js';
import { pagerState } from '../js/ui/components.js';
import { browserSuite } from './helpers/browser.mjs';
import { timed } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const BEGINNER = board(9, 9, 10);
const EXPERT = board(30, 16, 99);
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
let n = 0;
const day = (i) => new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString();
const game = (b, over = {}) => {
  const outcome = over.outcome ?? 'won';
  const elapsedMs = over.elapsedMs ?? 47380;
  const bbbv = 20;
  const bbbvSolved = outcome === 'won' ? bbbv : 5;
  const c = over.clicks ?? clicks(25);
  const s = { id: `h${++n}`, board: { ...b }, outcome, elapsedMs, bbbv, bbbvSolved, clicks: c, seed: 1, generatorVersion: 1, endedAt: day(n), ...over };
  return { ...s, bbbvPerSecond: bbbvPerSecond(s), efficiency: efficiency(s) };
};
function fakeStore(games = []) {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  const listeners = new Set();
  const store = {
    available: () => true,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    record(s) { const c = model.record(s); for (const fn of listeners) fn(c, s); return c; },
  };
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'history', 'overall', 'overallWinRate']) store[q] = (...a) => model[q](...a);
  return store;
}

// ---------------------------------------------------------------- chart points and scaling

test('the chart points are the won games in play order, with their 3BV/s and efficiency', () => {
  const store = fakeStore([
    game(BEGINNER, { elapsedMs: 40000 }),
    game(BEGINNER, { outcome: 'lost' }),
    game(BEGINNER, { elapsedMs: 20000, clicks: clicks(40) }),
    game(BEGINNER, { outcome: 'abandoned' }),
  ]);
  const points = chartPoints(store.history(boardKey(BEGINNER)));
  assert.equal(points.length, 2, 'lost and abandoned games are not drawn');
  assert.deepEqual(points.map((p) => p.rate), [0.5, 1]);
  assert.deepEqual(points.map((p) => p.efficiency), [80, 50]);
  assert.deepEqual(chartPoints([]), []);
});

test('the value axis ends at a round ceiling', () => {
  assert.equal(niceCeiling(0.42), 0.5);
  assert.equal(niceCeiling(1), 1);
  assert.equal(niceCeiling(1.3), 2);
  assert.equal(niceCeiling(2.2), 2.5);
  assert.equal(niceCeiling(3.1), 5);
  assert.equal(niceCeiling(7), 10);
  assert.equal(niceCeiling(130), 200);
  assert.equal(niceCeiling(0), 1, 'nothing to show still gives an axis');
  assert.equal(niceCeiling(null), 1);
});

test('the scale spreads the games across the plot and maps each series to its own axis', () => {
  const points = [{ rate: 1, efficiency: 50 }, { rate: 2, efficiency: 100 }, { rate: 0.5, efficiency: 25 }];
  const s = chartScale(points, { width: 300, height: 140 });
  const { left, top, width, height } = s.plot;
  assert.ok(left > 0 && top >= 0 && width > 0 && height > 0 && left + width <= 300 && top + height <= 140, 'the plot sits inside the canvas');
  assert.equal(s.rateMax, 2);
  assert.equal(s.efficiencyMax, 100);
  assert.deepEqual(s.rate.map((p) => p.x), [left, left + width / 2, left + width]);
  assert.deepEqual(s.rate.map((p) => p.y), [top + height / 2, top, top + (height * 3) / 4]);
  assert.deepEqual(s.efficiency.map((p) => p.y), [top + height / 2, top, top + (height * 3) / 4]);
});

test('one game sits in the middle; a missing value leaves a gap; efficiency above 100% raises its axis', () => {
  const one = chartScale([{ rate: 1, efficiency: 80 }], { width: 200, height: 100 });
  assert.equal(one.rate[0].x, one.plot.left + one.plot.width / 2);
  const gap = chartScale([{ rate: null, efficiency: 80 }, { rate: 1, efficiency: null }], { width: 200, height: 100 });
  assert.equal(gap.rate[0], null);
  assert.equal(gap.efficiency[1], null);
  assert.equal(chartScale([{ rate: 1, efficiency: 130 }], { width: 200, height: 100 }).efficiencyMax, 200);
  assert.deepEqual(chartScale([], { width: 200, height: 100 }).rate, []);
});

test('the chart has a text alternative carrying the same numbers', () => {
  assert.equal(chartText([]), NO_WON_GAMES);
  const text = chartText([{ rate: 0.84, efficiency: 60 }, { rate: 1.4, efficiency: 85 }, { rate: 1.21, efficiency: 80 }]);
  assert.match(text, /3 won games/);
  assert.match(text, /3BV\/s from 0\.84 to 1\.40, latest 1\.21/);
  assert.match(text, /efficiency from 60\.0% to 85\.0%, latest 80\.0%/, 'efficiency to one decimal, as the results screen shows it');
  assert.match(chartText([{ rate: 1, efficiency: 94.66 }]), /efficiency from 94\.7% to 94\.7%/);
  assert.match(chartText([{ rate: 1, efficiency: 50 }]), /1 won game\b/);
});

// ---------------------------------------------------------------- drawing

/** A recording 2D context: every call with the stroke and fill style in force. */
function fakeContext() {
  const calls = [];
  const state = { strokeStyle: null, fillStyle: null, font: '', lineWidth: 1 };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (t) => ({ width: String(t).length * 6 });
      return (...args) => { calls.push({ op: prop, args, stroke: target.strokeStyle, fill: target.fillStyle }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}
const THEMES = {
  light: { '--color-accent': '#0000aa', '--color-success': '#00aa00', '--color-border': '#cccccc', '--color-ink-muted': '#555555', '--font-family-sans': 'sans-serif', '--font-size-xs': '11px' },
  dark: { '--color-accent': '#6666ff', '--color-success': '#66ff66', '--color-border': '#333333', '--color-ink-muted': '#aaaaaa', '--font-family-sans': 'sans-serif', '--font-size-xs': '11px' },
};
const strokes = (ctx) => new Set(ctx.calls.filter((c) => c.op === 'stroke').map((c) => c.stroke));

test('the chart draws both series and its grid in the token colours', () => {
  const ctx = fakeContext();
  const points = [{ rate: 1, efficiency: 50 }, { rate: 2, efficiency: 100 }];
  drawHistoryChart(ctx, { width: 300, height: 140, pixelRatio: 2, points, token: (name) => THEMES.light[name] });
  assert.ok(ctx.calls.some((c) => c.op === 'clearRect'), 'the canvas is cleared first');
  assert.deepEqual(ctx.calls.find((c) => c.op === 'setTransform').args, [2, 0, 0, 2, 0, 0], 'drawn at the pixel ratio');
  const s = strokes(ctx);
  for (const name of [CHART_TOKENS.rate, CHART_TOKENS.efficiency, CHART_TOKENS.grid]) assert.ok(s.has(THEMES.light[name]), `stroked in ${name}`);
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.fill === THEMES.light[CHART_TOKENS.label]), 'labels in the muted ink');
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.args[0] === '3BV/s'), 'a legend names the 3BV/s line');
  assert.ok(ctx.calls.some((c) => c.op === 'fillText' && c.args[0] === 'Efficiency'), 'a legend names the efficiency line');
  const empty = fakeContext();
  drawHistoryChart(empty, { width: 300, height: 140, pixelRatio: 1, points: [], token: (name) => THEMES.light[name] });
  assert.ok(!strokes(empty).has(THEMES.light[CHART_TOKENS.rate]), 'no line without a won game');
});

test('the chart module is DOM-free, takes no chart library and holds no literal colour', () => {
  const src = read('js/records/history-chart.js').replace(/\/\/[^\n]*/g, '');
  assert.doesNotMatch(src, /\bdocument\b|\bwindow\b/);
  assert.doesNotMatch(src, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'colours come from the token reader');
  const imports = [...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.ok(imports.every((i) => i.startsWith('./') || i.startsWith('../')), `local imports only: ${imports}`);
  assert.ok(imports.includes('../tokens.js'), 'the token reader by default');
});

function fakeCanvas(width = 320, height = 160) {
  const ctx = fakeContext();
  return { ctx, clientWidth: width, clientHeight: height, width: 0, height: 0, getContext: () => ctx };
}
function fakeTheme() {
  const listeners = new Set();
  let theme = 'light';
  return {
    token: (name) => THEMES[theme][name],
    onThemeChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set(t) { theme = t; for (const fn of listeners) fn(t); },
    listeners,
  };
}

test('the chart sizes its canvas at the pixel ratio and redraws on a theme change', () => {
  const canvas = fakeCanvas();
  const theme = fakeTheme();
  const chart = createHistoryChart({ canvas, token: theme.token, onThemeChange: (fn) => theme.onThemeChange(fn), pixelRatio: () => 2 });
  chart.draw([{ rate: 1, efficiency: 50 }, { rate: 1.5, efficiency: 70 }]);
  assert.equal(canvas.width, 640);
  assert.equal(canvas.height, 320);
  assert.ok(strokes(canvas.ctx).has(THEMES.light['--color-accent']));
  canvas.ctx.calls.length = 0;
  theme.set('dark');
  assert.ok(strokes(canvas.ctx).has(THEMES.dark['--color-accent']), 'redrawn in the new theme');
  assert.ok(!strokes(canvas.ctx).has(THEMES.light['--color-accent']));
  chart.destroy();
  assert.equal(theme.listeners.size, 0, 'destroy unsubscribes');
  canvas.ctx.calls.length = 0;
  const hidden = fakeCanvas(0, 0);
  createHistoryChart({ canvas: hidden, token: theme.token, onThemeChange: (fn) => theme.onThemeChange(fn) }).draw([{ rate: 1, efficiency: 50 }]);
  assert.equal(hidden.ctx.calls.length, 0, 'a canvas with no size is not drawn');
});

test('the chart redraws at the new size when its canvas box resizes, until destroyed', () => {
  const canvas = fakeCanvas(320, 160);
  const theme = fakeTheme();
  let resized = null;
  let stopped = false;
  const chart = createHistoryChart({
    canvas, token: theme.token, onThemeChange: (fn) => theme.onThemeChange(fn), pixelRatio: () => 1,
    observeResize: (target, fn) => { assert.equal(target, canvas); resized = fn; return () => { stopped = true; }; },
  });
  chart.draw([{ rate: 1, efficiency: 50 }]);
  canvas.clientWidth = 500;
  canvas.ctx.calls.length = 0;
  resized();
  assert.equal(canvas.width, 500, 'the bitmap follows the box');
  assert.ok(strokes(canvas.ctx).has(THEMES.light['--color-accent']), 'the last points redrawn');
  chart.destroy();
  assert.equal(stopped, true, 'destroy stops observing');
});

// ---------------------------------------------------------------- the best time by date

const localIso = (y, m, d, h = 12) => new Date(y, m, d, h).toISOString();
const STEPS = [
  { id: 'a', endedAt: localIso(2026, 9, 1), elapsedMs: 50000 },
  { id: 'd', endedAt: localIso(2026, 9, 4), elapsedMs: 42000 },
  { id: 'f', endedAt: localIso(2026, 9, 9), elapsedMs: 39000 },
];
const BEST = { steps: STEPS, start: localIso(2026, 9, 1), end: localIso(2026, 9, 13) };

test('the dated axis: the first and last date and evenly spaced dates between, in a short form', () => {
  assert.equal(formatShortDate(localIso(2026, 9, 9)), '9 Oct');
  const ticks = dateTicks(BEST.start, BEST.end);
  assert.deepEqual(ticks.map((t) => t.label), ['1 Oct', '5 Oct', '9 Oct', '13 Oct']);
  const span = Date.parse(BEST.end) - Date.parse(BEST.start);
  assert.deepEqual(ticks.map((t) => t.t - Date.parse(BEST.start)), [0, span / 3, (2 * span) / 3, span], 'evenly spaced');
  assert.deepEqual(dateTicks(BEST.start, BEST.start).map((t) => t.label), ['1 Oct'], 'one date: one tick');
  assert.deepEqual(dateTicks(localIso(2026, 9, 1, 9), localIso(2026, 9, 1, 18)).map((t) => t.label), ['1 Oct'], 'a label never repeats');
  assert.deepEqual(dateTicks(null, BEST.end), []);
});

test('the best-time scale: dates left to right over the shown span, the time axis from 0', () => {
  const s = bestTimeScale(BEST, { width: 400, height: 160 });
  assert.equal(s.timeMax, 50000, 'a round ceiling over the slowest best');
  const { left, top, width, height } = s.plot;
  assert.equal(s.points[0].x, left, 'the first shown game on the left edge');
  assert.ok(Math.abs(s.end - (left + width)) < 1e-9, 'the last shown game on the right edge');
  assert.ok(s.points[1].x > s.points[0].x && s.points[2].x > s.points[1].x);
  assert.equal(s.points[0].y, top, '50 s at the top of a 0..50 s axis');
  assert.ok(Math.abs(s.points[2].y - (top + height * (1 - 39000 / 50000))) < 1e-9);
  assert.deepEqual(s.ticks.map((t) => t.label), ['1 Oct', '5 Oct', '9 Oct', '13 Oct']);
  const one = bestTimeScale({ steps: [STEPS[0]], start: STEPS[0].endedAt, end: STEPS[0].endedAt }, { width: 400, height: 160 });
  assert.equal(one.points[0].x, one.plot.left + one.plot.width / 2, 'one date in the middle');
});

test('the best-time steps of a history feed the chart, and its text names each new best and its date', () => {
  const history = [game(BEGINNER, { elapsedMs: 50000 }), game(BEGINNER, { elapsedMs: 52000 }), game(BEGINNER, { elapsedMs: 41000 })];
  assert.deepEqual(bestTimeSteps(history).map((s) => s.elapsedMs), [50000, 41000]);
  const text = bestTimeText(STEPS);
  assert.equal(text, 'Best time by date, 3 new bests: 50.000 s on 1 Oct 2026, 42.000 s on 4 Oct 2026 and 39.000 s on 9 Oct 2026.');
  assert.equal(bestTimeText([STEPS[0]]), 'Best time by date, 1 new best: 50.000 s on 1 Oct 2026.');
  assert.equal(bestTimeText([]), NO_BEST_TIME);
  assert.equal(chartText([], NO_WON_GAMES_PERIOD), NO_WON_GAMES_PERIOD, 'a filtered empty chart says so');
});

test('the best-time chart draws its step line and markers in the token colour, the dated axis, and an empty line without a won game', () => {
  const ctx = fakeContext();
  drawBestTimeChart(ctx, { width: 400, height: 160, pixelRatio: 2, data: BEST, token: (name) => THEMES.light[name] });
  assert.deepEqual(ctx.calls.find((c) => c.op === 'setTransform').args, [2, 0, 0, 2, 0, 0]);
  assert.ok(strokes(ctx).has(THEMES.light[CHART_TOKENS.best]), 'the step line in its token');
  const s = bestTimeScale(BEST, { width: 400, height: 160 });
  const lines = ctx.calls.filter((c) => c.op === 'lineTo').map((c) => c.args).slice(5); // after the grid's five lines
  assert.deepEqual(lines.slice(0, 2), [[s.points[1].x, s.points[0].y], [s.points[1].x, s.points[1].y]], 'level, then down at the next new best');
  assert.deepEqual(lines.at(-1), [s.end, s.points[2].y], 'held to the last date');
  assert.equal(ctx.calls.filter((c) => c.op === 'arc').length, 3, 'a marker at each new best');
  const texts = ctx.calls.filter((c) => c.op === 'fillText').map((c) => c.args[0]);
  for (const label of ['1 Oct', '5 Oct', '9 Oct', '13 Oct', 'Best time', '50 s', '0 s']) assert.ok(texts.includes(label), label);
  const empty = fakeContext();
  drawBestTimeChart(empty, { width: 400, height: 160, data: { steps: [], emptyText: NO_BEST_TIME }, token: (name) => THEMES.light[name] });
  assert.ok(!strokes(empty).has(THEMES.light[CHART_TOKENS.best]), 'no line');
  assert.ok(empty.calls.some((c) => c.op === 'fillText' && c.args[0] === NO_BEST_TIME), 'the honest empty line');
  const src = read('js/records/history-chart.js');
  assert.match(src, /best: '--color-[a-z-]+'/, 'the best line is a token');
});

/** The best-time chart's time-axis labels, top to bottom: its first three texts, drawn before the legend. */
function timeAxisLabels(steps) {
  const ctx = fakeContext();
  const data = { steps, start: steps[0].endedAt, end: steps.at(-1).endedAt };
  drawBestTimeChart(ctx, { width: 400, height: 160, data, token: (name) => THEMES.light[name] });
  return ctx.calls.filter((c) => c.op === 'fillText').slice(0, 3).map((c) => c.args[0]);
}

test('the time axis reads in seconds with the fewest decimals that tell its ticks apart, never as thousands', () => {
  const axis = (slowest) => timeAxisLabels([{ id: 'a', endedAt: localIso(2026, 9, 1), elapsedMs: slowest }, { ...STEPS[2], elapsedMs: 1000 }]);
  assert.deepEqual(axis(4200), ['5 s', '2.5 s', '0 s'], 'a 0–5 s axis');
  assert.deepEqual(axis(73000), ['100 s', '50 s', '0 s'], 'a 0–100 s axis');
  assert.deepEqual(axis(2300), ['2.5 s', '1.25 s', '0 s'], 'a 0–2.5 s axis: 1.25 s does not force 2.50 s');
  assert.deepEqual(bestReadout([{ endedAt: localIso(2026, 9, 1), elapsedMs: 2500 }], 0).at(-1), 'Best time 2.500 s', 'the hover readout keeps thousandths');
  assert.equal(bestTimeText([{ endedAt: localIso(2026, 9, 1), elapsedMs: 2500 }]), 'Best time by date, 1 new best: 2.500 s on 1 Oct 2026.', 'so does the text alternative');
});

// ---------------------------------------------------------------- hover values

test('the hover lookup finds the nearest point on both charts', () => {
  assert.equal(nearestIndex([10, 50, 90], 62), 1);
  assert.equal(nearestIndex([10, 50, 90], 200), 2);
  assert.equal(nearestIndex([10, null, 90], 45), 0, 'a missing position is skipped');
  assert.equal(nearestIndex([], 5), -1);
  const points = [{ endedAt: localIso(2026, 9, 1, 14), rate: 1.234, efficiency: 80 }, { endedAt: localIso(2026, 9, 2, 9), rate: 2, efficiency: 95.25 }];
  const s = chartScale(points, { width: 300, height: 140 });
  assert.equal(nearestIndex(s.xs, s.xs[1] - 3), 1);
  assert.deepEqual(rateReadout(points, 0), ['1 Oct 2026 14:00', '3BV/s 1.23', 'Efficiency 80.0%'], "the game's date, 3BV/s and efficiency");
  assert.deepEqual(bestReadout(STEPS, 1), [formatDateTime(STEPS[1].endedAt), 'Best time 42.000 s'], 'its date and best time');
  const b = bestTimeScale(BEST, { width: 400, height: 160 });
  assert.equal(nearestIndex(b.xs, b.xs[2] + 4), 2);
});

test('hovering a chart marks the nearest point and draws its readout; leaving clears it; new data clears it', () => {
  const canvas = fakeCanvas(300, 140);
  const listeners = {};
  canvas.dataset = {};
  canvas.addEventListener = (type, fn) => { listeners[type] = fn; };
  const theme = fakeTheme();
  const chart = createHistoryChart({ canvas, token: theme.token, onThemeChange: (fn) => theme.onThemeChange(fn), pixelRatio: () => 1 });
  const points = [{ endedAt: localIso(2026, 9, 1, 14), rate: 1, efficiency: 50 }, { endedAt: localIso(2026, 9, 2, 9), rate: 1.5, efficiency: 70 }];
  chart.draw(points);
  assert.equal(chart.readout, null);
  const s = chartScale(points, { width: 300, height: 140 });
  canvas.ctx.calls.length = 0;
  listeners.pointermove({ pointerType: 'mouse', offsetX: s.xs[1] - 2 });
  assert.equal(chart.readout, `2 Oct 2026 09:00 · 3BV/s 1.50 · Efficiency 70.0%`);
  assert.equal(canvas.dataset.readout, chart.readout);
  assert.ok(canvas.ctx.calls.some((c) => c.op === 'fillText' && c.args[0] === '3BV/s 1.50'), 'the readout drawn');
  assert.ok(canvas.ctx.calls.some((c) => c.op === 'arc' && c.args[0] === s.rate[1].x && c.args[2] === 5), 'a marker on the point');
  listeners.pointerleave({ pointerType: 'mouse' });
  assert.equal(chart.readout, null);
  assert.equal(canvas.dataset.readout, undefined);
  listeners.pointerdown({ pointerType: 'touch', offsetX: s.xs[0] });
  assert.match(chart.readout, /^1 Oct 2026 14:00/, 'a tap shows the same readout');
  listeners.pointerleave({ pointerType: 'touch' });
  assert.notEqual(chart.readout, null, 'and it stays after the finger lifts');
  chart.draw([...points]);
  assert.equal(chart.readout, null, 'new data clears it');
  const bestCanvas = fakeCanvas(400, 160);
  const best = createHistoryChart({ canvas: bestCanvas, kind: 'best', token: theme.token, onThemeChange: (fn) => theme.onThemeChange(fn), pixelRatio: () => 1 });
  best.draw(BEST);
  best.hoverAt(bestTimeScale(BEST, { width: 400, height: 160 }).xs[1]);
  assert.equal(best.readout, `${formatDateTime(STEPS[1].endedAt)} · Best time 42.000 s`);
  best.leave();
  assert.equal(best.readout, null);
});

// ---------------------------------------------------------------- paging

test('paging: pages of PAGE_SIZE, clamped, with previous and next', () => {
  const items = Array.from({ length: 25 }, (_, i) => i);
  const first = pageOf(items, 0);
  assert.equal(PAGE_SIZE, 10);
  assert.deepEqual(first.items, items.slice(0, 10));
  assert.deepEqual([first.page, first.pages, first.hasPrev, first.hasNext, first.from, first.to, first.total], [0, 3, false, true, 1, 10, 25]);
  const last = pageOf(items, 2);
  assert.deepEqual(last.items, [20, 21, 22, 23, 24]);
  assert.deepEqual([last.hasPrev, last.hasNext, last.from, last.to], [true, false, 21, 25]);
  assert.equal(pageOf(items, 9).page, 2, 'past the end: the last page');
  assert.equal(pageOf(items, -1).page, 0);
  assert.equal(pageOf(items, 'x').page, 0);
  const none = pageOf([], 0);
  assert.deepEqual([none.items, none.page, none.pages, none.hasPrev, none.hasNext, none.from, none.to], [[], 0, 1, false, false, 0, 0]);
  assert.deepEqual(pageOf(items, 1, 5).items, [5, 6, 7, 8, 9]);
});

test('paging a long history stays fast', () => {
  const items = Array.from({ length: 100000 }, (_, i) => i);
  const run = timed(500, () => { for (let p = 0; p < 1000; p++) pageOf(items, p); });
  assert.ok(run.ok, `1000 pages took ${run.ms.toFixed(0)} ms, limit ${run.limit} ms`);
});

// ---------------------------------------------------------------- the screen's history content

test('the recent games list shows newest first with date and time, outcome, time, 3BV, 3BV/s and efficiency', () => {
  const store = fakeStore([
    game(BEGINNER, { elapsedMs: 47380 }),
    game(BEGINNER, { outcome: 'lost', elapsedMs: 12000 }),
    game(EXPERT),
    game(BEGINNER, { outcome: 'abandoned', elapsedMs: 0 }),
  ]);
  const { games } = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.deepEqual(games.rows.map((r) => r.outcome), ['Abandoned', 'Lost', 'Won'], 'newest first, this board only');
  const won = games.rows[2];
  assert.equal(won.time, '47.380 s', 'to the thousandth, truncated');
  assert.equal(won.rate, (20 / 47.38).toFixed(2));
  assert.equal(won.efficiency, '80.0%');
  assert.equal(games.rows[1].time, '12.000 s');
  assert.equal(games.rows[1].rate, (5 / 12).toFixed(2));
  assert.equal(games.rows[0].rate, DASH, 'no time, no 3BV/s');
  assert.deepEqual(games.headers, ['Date', 'Outcome', 'Time', '3BV', '3BV/s', 'Efficiency']);
  const ended = store.history(boardKey(BEGINNER)).toReversed();
  assert.deepEqual(games.rows.map((r) => r.date), ended.map((e) => formatDateTime(e.endedAt)), 'each game\'s end, as a date and a local time');
  assert.deepEqual(games.rows.map((r) => r.bbbv), ['20', '20', '20'], 'the board\'s 3BV for won, lost and abandoned games alike');
});

test('the date and time is one fixed 24-hour format: day, month, year, hours and minutes', () => {
  assert.equal(formatDateTime(new Date(2026, 9, 11, 14, 32, 59).toISOString()), '11 Oct 2026 14:32');
  assert.equal(formatDateTime(new Date(2026, 0, 2, 9, 5).toISOString()), '2 Jan 2026 09:05');
  assert.equal(formatDateTime(new Date(2026, 11, 31, 0, 0).toISOString()), '31 Dec 2026 00:00');
  for (const bad of [undefined, null, 'never', 42]) assert.equal(formatDateTime(bad), DASH);
});

test("a row's time goes through the results screen's time formatter", () => {
  const store = fakeStore([game(BEGINNER, { elapsedMs: 47999 })]);
  assert.equal(recordsContent(store, { boardKey: boardKey(BEGINNER) }).games.rows[0].time, '47.999 s', 'truncated, never rounded');
  const src = read('js/records/screen.js');
  assert.match(src, /import \{[^}]*formatTime[^}]*\} from '\.\.\/results\/view\.js'/);
  assert.doesNotMatch(src + read('js/records/history-chart.js'), /\/\s*1000\b|\.toFixed\(1\)|tenths/, 'no second copy of the time format');
});

test('the games list is paged, newest page first, and a page past the end shows the last', () => {
  const store = fakeStore(Array.from({ length: 23 }, (_, i) => game(BEGINNER, { elapsedMs: 10000 + i * 1000 })));
  const first = recordsContent(store, { boardKey: boardKey(BEGINNER) }).games;
  assert.equal(first.rows.length, 10);
  assert.equal(first.rows[0].time, '32.000 s', 'the newest game first');
  assert.deepEqual([first.page, first.pages], [0, 3]);
  assert.deepEqual(first.pager, pagerState(0, 3), 'the kit pager over the list\'s pages');
  assert.equal(first.label, 'Games 1–10 of 23');
  const last = recordsContent(store, { boardKey: boardKey(BEGINNER), page: 7 }).games;
  assert.deepEqual([last.page, last.rows.length, last.label], [2, 3, 'Games 21–23 of 23']);
  assert.equal(last.pager.last.disabled, true);
  assert.equal(last.rows.at(-1).time, '10.000 s', 'the oldest game last');
  const empty = recordsContent(store, { boardKey: boardKey(EXPERT) }).games;
  assert.deepEqual([empty.rows, empty.pager.hidden], [[], true], 'an empty list has no pager');
  const one = recordsContent(fakeStore(Array.from({ length: 10 }, () => game(BEGINNER))), { boardKey: boardKey(BEGINNER) }).games;
  assert.equal(one.pager.hidden, true, 'one page holds everything: no pager');
});

test("the chart content is the chosen board's won games, with its text alternative", () => {
  const store = fakeStore([game(BEGINNER, { elapsedMs: 40000 }), game(BEGINNER, { outcome: 'lost' }), game(EXPERT, { elapsedMs: 20000 })]);
  const { chart } = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.deepEqual(chart.points.map((p) => p.rate), [0.5]);
  assert.equal(chart.text, chartText(chart.points));
  assert.equal(recordsContent(store, { boardKey: boardKey(board(5, 5, 3)) }).chart.text, NO_WON_GAMES);
});

test('unreadable history shows no games and no chart, and never throws', () => {
  const store = fakeStore([game(BEGINNER)]);
  store.history = () => { throw new RangeError('records: unreadable'); };
  const c = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.deepEqual(c.games.rows, []);
  assert.deepEqual(c.chart.points, []);
});

// ---------------------------------------------------------------- the controller

function fakeView() {
  const shown = [];
  return { shown, show(c) { shown.push(c); }, hide() {} };
}

test('the screen pages the games list, starts each board on its first page and redraws on a recorded game', () => {
  const store = fakeStore(Array.from({ length: 15 }, () => game(BEGINNER)));
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show({ boardKey: boardKey(BEGINNER) });
  assert.equal(view.shown.at(-1).games.page, 0);
  screen.showPage(1);
  assert.equal(screen.page, 1);
  assert.equal(view.shown.at(-1).games.page, 1);
  assert.equal(view.shown.at(-1).games.rows.length, 5);
  screen.showPage(5);
  assert.equal(screen.page, 1, 'clamped to the last page');
  store.record(game(BEGINNER, { elapsedMs: 30000 }));
  assert.equal(view.shown.at(-1).games.page, 1, 'a recorded game keeps the page');
  assert.equal(view.shown.at(-1).chart.points.length, 16, 'and adds its point to the chart');
  screen.select(boardKey(EXPERT));
  assert.equal(view.shown.at(-1).games.page, 0, 'another board starts on its first page');
  screen.select(boardKey(BEGINNER));
  screen.showPage(1);
  screen.hide();
  screen.show();
  assert.equal(view.shown.at(-1).games.page, 0, 'opened again: the first page');
});

// ---------------------------------------------------------------- markup

const INDEX = read('index.html');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the history panel holds the chart canvas with its text alternative, the games table and the kit pager', () => {
  const panel = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-history"'));
  assert.ok(panel.length > 0, '#records-history');
  assert.match(panel, /^<div id="records-history" class="ui-panel" role="group" aria-labelledby="records-history-title">/);
  assert.match(panel, /<canvas id="records-chart" role="img" aria-label="[^"]+">[^<]*<\/canvas>/, 'the chart is an image with a text alternative');
  assert.match(panel, /<table id="records-games"[^>]*>[\s\S]*<caption[^>]*>[\s\S]*<thead>[\s\S]*<tbody id="records-games-body"><\/tbody>/);
  const heads = [...panel.slice(0, panel.indexOf('</thead>')).matchAll(/<th scope="col"[^>]*>([^<]+)<\/th>/g)].map((m) => m[1]);
  assert.deepEqual(heads, ['Date', 'Outcome', 'Time', '3BV', '3BV/s', 'Efficiency', 'Board code', 'Replay']);
  assert.match(panel, /<nav id="records-games-pager" class="ui-pager hidden" aria-label="[^"]+"><\/nav>/, 'the kit pager, filled by the view');
  assert.doesNotMatch(RECORDS_HTML, /records-prev|records-next|>Newer<|>Older</, 'Newer and Older are gone');
  assert.match(panel, /id="records-page"/);
  assert.match(read('css/style.css'), /#records-chart \{/);
});

test('the view draws the chart through the history chart and wires the pager to the controller', () => {
  const src = read('js/records/screen.js');
  assert.match(src, /import \{[^}]*createHistoryChart[^}]*\} from '\.\/history-chart\.js'/);
  assert.match(src, /createRecordsView\(\{ root, onSelect, onBack, onPage/);
  assert.match(read('js/main.js'), /onPage: \(page\) => RECORDS_PAGE\.showPage\(page\)/);
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}
test('in a browser, a seeded history is charted and its games list paged by keyboard', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = mkdtempSync(join(tmpdir(), 'records-history-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.evaluate(() => {
      const b = { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false };
      for (let i = 0; i < 24; i++) {
        const won = i % 4 !== 3;
        const clicks = { reveal: { effective: 20 + (i % 7), wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
        const elapsedMs = 30000 - i * 700;
        const bbbvSolved = won ? 20 : 6;
        globalThis.__ms.records.record({ id: `s${i}`, board: b, outcome: won ? 'won' : 'lost', elapsedMs, bbbv: 20, bbbvSolved, clicks,
          bbbvPerSecond: bbbvSolved / (elapsedMs / 1000), efficiency: (100 * bbbvSolved) / (20 + (i % 7)), seed: 1, generatorVersion: 1,
          endedAt: new Date(Date.UTC(2026, 9, 1, 12, i)).toISOString() });
      }
    });
    await page.click('#menu-entry-records');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'records');

    /** Pixels of the canvas near each series' token colour, as the page resolves the tokens. */
    const measure = () => page.evaluate(() => {
      const canvas = document.getElementById('records-chart');
      const css = getComputedStyle(document.documentElement);
      const rgb = (v) => {
        const h = v.trim().replace('#', '');
        return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
      };
      const want = { rate: rgb(css.getPropertyValue('--color-accent')), efficiency: rgb(css.getPropertyValue('--color-success')) };
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
      const count = { rate: 0, efficiency: 0 };
      for (let i = 0; i < data.length; i += 4) {
        for (const k of ['rate', 'efficiency']) {
          if (data[i + 3] > 200 && Math.abs(data[i] - want[k][0]) < 12 && Math.abs(data[i + 1] - want[k][1]) < 12 && Math.abs(data[i + 2] - want[k][2]) < 12) count[k]++;
        }
      }
      return { count, width: canvas.width, label: canvas.getAttribute('aria-label') };
    });
    for (const theme of ['joyful-tiles']) {
      const m = await measure();
      assert.ok(m.width > 200, `${theme}: the canvas is sized`);
      assert.ok(m.count.rate > 100, `${theme}: the 3BV/s line in the accent token (${m.count.rate} px)`);
      assert.ok(m.count.efficiency > 100, `${theme}: the efficiency line in the success token (${m.count.efficiency} px)`);
      assert.match(m.label, /18 won games/);
      const shot = await page.locator('#records-chart').screenshot({ path: join(shots, `records-chart-${theme}.png`) });
      assert.ok(shot.length > 1000, `${theme}: screenshot taken`);
    }

    const rows = () => page.evaluate(() => [...document.querySelectorAll('#records-games-body tr')].map((r) => [...r.cells].map((c) => c.textContent)));
    const label = () => page.evaluate(() => document.getElementById('records-page').textContent);
    let r = await rows();
    assert.equal(r.length, 10);
    assert.deepEqual(r[0].slice(1), ['Lost', '13.900 s', '20', (6 / 13.9).toFixed(2), `${(600 / 22).toFixed(1)}%`, '', ''], 'the newest game first, its Board code cell empty (no code before codes), its Replay cell empty: no replay is kept');
    assert.match(r[0][0], /^1 Oct 2026 \d\d:\d\d$/, 'the date and local time it ended');
    assert.equal(await label(), 'Games 1–10 of 24');
    const pager = () => page.evaluate(() => [...document.querySelectorAll('#records-games-pager button')].map((b) => ({
      text: b.textContent, current: b.getAttribute('aria-current'), disabled: b.disabled || b.getAttribute('aria-disabled') === 'true' })));
    assert.deepEqual((await pager()).map((b) => b.text), ['First', '1', '2', '3', 'Last']);
    assert.deepEqual((await pager()).filter((b) => b.disabled).map((b) => b.text), ['First', '1'], 'First and the current page are disabled');
    assert.equal((await pager()).find((b) => b.current === 'page').text, '1');

    // Keyboard: the pager's buttons are reached and used like any button.
    await page.focus('#records-games-pager button[data-page="1"]');
    await page.keyboard.press('Enter');
    assert.equal(await label(), 'Games 11–20 of 24');
    assert.equal((await pager()).find((b) => b.current === 'page').text, '2');
    await page.focus('#records-games-pager button[data-page="last"]');
    await page.keyboard.press('Enter');
    assert.equal(await label(), 'Games 21–24 of 24');
    assert.equal((await rows()).length, 4);
    assert.deepEqual((await pager()).filter((b) => b.disabled).map((b) => b.text), ['3', 'Last']);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-current')), 'page', 'a pager button that becomes disabled hands focus to the current page');
    await page.focus('#records-games-pager button[data-page="1"]');
    await page.keyboard.press('Enter');
    assert.equal(await label(), 'Games 11–20 of 24');

    // Live: a recorded game adds its point and its row.
    const before = (await measure()).label;
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 20, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      globalThis.__ms.records.record({ id: 'live', board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false },
        outcome: 'won', elapsedMs: 9000, bbbv: 20, bbbvSolved: 20, clicks, bbbvPerSecond: 20 / 9, efficiency: 100, seed: 1, generatorVersion: 1,
        endedAt: '2026-10-09T12:00:00.000Z' });
    });
    assert.notEqual((await measure()).label, before);
    assert.match((await measure()).label, /19 won games/);
    assert.equal(await label(), 'Games 11–20 of 25');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
