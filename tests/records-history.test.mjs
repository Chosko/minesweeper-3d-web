// Records history (js/records/history-chart.js and its use in js/records/screen.js): the chart's
// points, scaling, text alternative and drawing over a fake canvas with injected tokens, its redraw
// on a theme change; the recent games list's rows, time format and paging; the screen controller's
// paging and live redraw; the #records history markup; and in a browser a seeded history drawn in
// both themes (with screenshots) and paged by keyboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CHART_TOKENS, PAGE_SIZE, NO_WON_GAMES, chartPoints, niceCeiling, chartScale, chartText, pageOf, drawHistoryChart, createHistoryChart,
} from '../js/records/history-chart.js';
import { recordsContent, createRecordsScreen } from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { bbbvPerSecond, efficiency } from '../js/records/summary.js';
import { DASH } from '../js/results/view.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
  assert.match(text, /efficiency from 60% to 85%, latest 80%/);
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
  const t = performance.now();
  for (let p = 0; p < 1000; p++) pageOf(items, p);
  assert.ok(performance.now() - t < 500);
});

// ---------------------------------------------------------------- the screen's history content

test('the recent games list shows newest first with outcome, time, 3BV/s and efficiency', () => {
  const store = fakeStore([
    game(BEGINNER, { elapsedMs: 47380 }),
    game(BEGINNER, { outcome: 'lost', elapsedMs: 12000 }),
    game(EXPERT),
    game(BEGINNER, { outcome: 'abandoned', elapsedMs: 0 }),
  ]);
  const { games } = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.deepEqual(games.rows.map((r) => r.outcome), ['Abandoned', 'Lost', 'Won'], 'newest first, this board only');
  const won = games.rows[2];
  assert.equal(won.time, '47.3 s', 'to the tenth, truncated');
  assert.equal(won.rate, (20 / 47.38).toFixed(2));
  assert.equal(won.efficiency, '80%');
  assert.equal(games.rows[1].time, '12.0 s');
  assert.equal(games.rows[1].rate, (5 / 12).toFixed(2));
  assert.equal(games.rows[0].rate, DASH, 'no time, no 3BV/s');
  assert.deepEqual(games.headers, ['Outcome', 'Time', '3BV/s', 'Efficiency']);
});

test("a row's time goes through the results screen's time formatter", () => {
  const store = fakeStore([game(BEGINNER, { elapsedMs: 47999 })]);
  assert.equal(recordsContent(store, { boardKey: boardKey(BEGINNER) }).games.rows[0].time, '47.9 s', 'truncated, never rounded');
  const src = read('js/records/screen.js');
  assert.match(src, /import \{[^}]*formatTime[^}]*\} from '\.\.\/results\/view\.js'/);
  assert.doesNotMatch(src + read('js/records/history-chart.js'), /\/\s*1000\b|\.toFixed\(1\)|tenths/, 'no second copy of the time format');
});

test('the games list is paged, newest page first, and a page past the end shows the last', () => {
  const store = fakeStore(Array.from({ length: 23 }, (_, i) => game(BEGINNER, { elapsedMs: 10000 + i * 1000 })));
  const first = recordsContent(store, { boardKey: boardKey(BEGINNER) }).games;
  assert.equal(first.rows.length, 10);
  assert.equal(first.rows[0].time, '32.0 s', 'the newest game first');
  assert.deepEqual([first.page, first.pages, first.hasPrev, first.hasNext], [0, 3, false, true]);
  assert.equal(first.label, 'Games 1–10 of 23');
  const last = recordsContent(store, { boardKey: boardKey(BEGINNER), page: 7 }).games;
  assert.deepEqual([last.page, last.rows.length, last.hasNext, last.label], [2, 3, false, 'Games 21–23 of 23']);
  assert.equal(last.rows.at(-1).time, '10.0 s', 'the oldest game last');
  const empty = recordsContent(store, { boardKey: boardKey(EXPERT) }).games;
  assert.deepEqual([empty.rows, empty.hasPrev, empty.hasNext], [[], false, false]);
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

test('the history panel holds the chart canvas with its text alternative, the games table and the pager', () => {
  const panel = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-history"'));
  assert.ok(panel.length > 0, '#records-history');
  assert.match(panel, /^<div id="records-history" class="ui-panel" role="group" aria-labelledby="records-history-title">/);
  assert.match(panel, /<canvas id="records-chart" role="img" aria-label="[^"]+">[^<]*<\/canvas>/, 'the chart is an image with a text alternative');
  assert.match(panel, /<table id="records-games"[^>]*>[\s\S]*<caption[^>]*>[\s\S]*<thead>[\s\S]*<tbody id="records-games-body"><\/tbody>/);
  for (const h of ['Outcome', 'Time', '3BV/s', 'Efficiency']) assert.match(panel, new RegExp(`<th scope="col">${h.replace('/', '\\/')}</th>`));
  assert.match(panel, /<button type="button" id="records-prev" class="ui-button ui-button--secondary"[^>]*>Newer<\/button>/);
  assert.match(panel, /<button type="button" id="records-next" class="ui-button ui-button--secondary"[^>]*>Older<\/button>/);
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
async function openBrowser(t) {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return null; }
  try {
    return await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return null;
  }
}

test('in a browser, a seeded history is charted in both themes and its games list paged by keyboard', async (t) => {
  const browser = await openBrowser(t);
  if (!browser) return;
  const server = await serve();
  const shots = mkdtempSync(join(tmpdir(), 'records-history-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
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
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      const m = await measure();
      assert.ok(m.width > 200, `${theme}: the canvas is sized`);
      assert.ok(m.count.rate > 100, `${theme}: the 3BV/s line in the accent token (${m.count.rate} px)`);
      assert.ok(m.count.efficiency > 100, `${theme}: the efficiency line in the success token (${m.count.efficiency} px)`);
      assert.match(m.label, /18 won games/);
      const shot = await page.locator('#records-chart').screenshot({ path: join(shots, `records-chart-${theme}.png`) });
      assert.ok(shot.length > 1000, `${theme}: screenshot taken`);
    }
    await page.evaluate(() => globalThis.msTheme.setTheme('light'));

    const rows = () => page.evaluate(() => [...document.querySelectorAll('#records-games-body tr')].map((r) => [...r.cells].map((c) => c.textContent)));
    const label = () => page.evaluate(() => document.getElementById('records-page').textContent);
    let r = await rows();
    assert.equal(r.length, 10);
    assert.deepEqual(r[0], ['Lost', '13.9 s', (6 / 13.9).toFixed(2), `${Math.round(600 / 22)}%`, ''], 'the newest game first, its Replay cell empty: no replay is kept');
    assert.equal(await label(), 'Games 1–10 of 24');
    assert.equal(await page.evaluate(() => document.getElementById('records-prev').disabled), true);

    // Keyboard: the pager is reached and used like any button.
    await page.focus('#records-next');
    await page.keyboard.press('Enter');
    assert.equal(await label(), 'Games 11–20 of 24');
    await page.keyboard.press('Enter');
    assert.equal(await label(), 'Games 21–24 of 24');
    assert.equal((await rows()).length, 4);
    assert.equal(await page.evaluate(() => document.getElementById('records-next').disabled), true);
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'records-prev', 'focus moves off a pager button that ends');
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
    await new Promise((resolve) => server.close(resolve));
  }
});
