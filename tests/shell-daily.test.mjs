// The daily boards in the shell (js/shell/daily.js): each row's counted attempt and state from the
// records — across a reload and across midnight —, the days in a row, the boards pre-generated when
// the main menu shows and nothing asked for a used attempt, and the Daily screen's binding; its
// markup in index.html and its wiring in js/main.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DAILY_SCREEN, NOT_PLAYED, LOST, dailyIdentity, countedAttempt, dailyRows, createDailyBoards, bindDailyScreen, dailyDateLabel,
} from '../js/shell/daily.js';
import { dailyGame } from '../js/records/board-code.js';
import { createRecordsModel } from '../js/records/model.js';
import { createRecordsStore, IN_PROGRESS_DOC } from '../js/records/store.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { buildSummary } from '../js/records/summary.js';
import { UNAVAILABLE_REASONS } from '../js/shell/menu.js';
import { dateText } from '../js/records/board-code.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite({ args: [] });
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
let n = 0;
// A daily game's summary through the real builder: the Daily board, its date and start cell.
function daily(id, date, { outcome = 'won', ms = 48230, endedAt = new Date(2026, 9, 11, 12) } = {}) {
  const engine = { bbbv: 100, bbbvSolved: outcome === 'won' ? 100 : 40, clicks: clicks(120) };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  const g = dailyGame(id, date);
  return buildSummary({
    engine, elapsedMs: ms, board: dailyIdentity(id), seed: g.seed, generatorVersion: g.generatorVersion,
    endedAt, id: `d${++n}`, startCell: g.startCell, daily: date,
  });
}
const store = (games = []) => {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  return model;
};
const TODAY = new Date(2026, 9, 11, 9, 30);

test('daily rows: Expert and Cube, today\'s local date, not played, their codes, Play offered', () => {
  const rows = dailyRows({ records: store(), now: TODAY });
  assert.deepEqual(rows.map((r) => [r.id, r.label, r.board]), [['expert', 'Expert', 'Expert · no-guess'], ['cube', 'Cube', '8 × 8 × 8 · 40 mines · no-guess']]);
  for (const r of rows) {
    assert.equal(r.date, '20261011');
    assert.equal(r.dateLabel, '11 Oct 2026');
    assert.equal(r.state, 'unplayed');
    assert.equal(r.result, NOT_PLAYED);
    assert.equal(r.canPlay, true);
    assert.equal(r.code, dailyGame(r.id, '20261011').code);
    assert.equal(r.streak, 'Days in a row 0 · longest 0');
  }
  assert.equal(DAILY_SCREEN, 'daily');
  assert.equal(dailyDateLabel('20270105'), '5 Jan 2027');
});

test('daily rows: the counted attempt is the first daily game of the date; its result shows and Play is gone', () => {
  const won = daily('expert', '20261011', { ms: 48291 });
  const records = store([daily('cube', '20261010'), won, daily('cube', '20261011', { outcome: 'lost' })]);
  const [expert, cube] = dailyRows({ records, now: TODAY, replays: { has: (id) => id === won.id } });
  assert.deepEqual([expert.state, expert.result, expert.canPlay, expert.attempt, expert.watch], ['won', 'Won 48.291 s', false, won.id, won.id]);
  assert.deepEqual([cube.state, cube.result, cube.canPlay, cube.watch], ['lost', LOST, false, null]);
  assert.deepEqual([cube.current, cube.longest], [2, 2]);
  assert.equal(cube.streak, 'Days in a row 2 · longest 2');
  assert.equal(countedAttempt(records, 'expert', '20261011').id, won.id);
  assert.equal(countedAttempt(records, 'expert', '20261012'), null);
});

test('daily rows: the cube row is disabled with the 3D entry\'s reason when 3D cannot run', () => {
  const [expert, cube] = dailyRows({ records: store(), now: TODAY, unavailable: { '3d': UNAVAILABLE_REASONS.webgl2 } });
  assert.equal(expert.canPlay, true);
  assert.equal(cube.canPlay, false);
  assert.equal(cube.reason, UNAVAILABLE_REASONS.webgl2);
});

test('daily rows: a started daily left by a reload is that date\'s counted attempt, a loss', async () => {
  const backend = createMemoryBackend();
  const first = createRecordsStore({ storage: createStorage({ backend }) });
  await first.load();
  first.begin(daily('expert', '20261011', { outcome: 'abandoned', ms: 3000 })); // the marker of a started game
  await first.settled();
  assert.equal(dailyRows({ records: first, now: TODAY })[0].state, 'unplayed', 'still running in this page');
  const reloaded = createRecordsStore({ storage: createStorage({ backend }) });
  await reloaded.load();
  const [expert] = dailyRows({ records: reloaded, now: TODAY });
  assert.deepEqual([expert.state, expert.result, expert.canPlay], ['lost', LOST, false]);
  await reloaded.settled();
  assert.equal(JSON.parse(backend.documents.get(IN_PROGRESS_DOC) ?? 'null')?.data ?? null, null);
});

test('daily rows: a daily started before midnight is its own date\'s attempt; the new day is unplayed', () => {
  const late = daily('expert', '20261011', { endedAt: new Date(2026, 9, 12, 0, 4) });
  const records = store([late]);
  const [before] = dailyRows({ records, now: new Date(2026, 9, 11, 23, 59) });
  assert.equal(before.state, 'won', 'recorded on its own date');
  const [after] = dailyRows({ records, now: new Date(2026, 9, 12, 0, 5) });
  assert.equal(after.date, '20261012');
  assert.equal(after.state, 'unplayed');
  assert.equal(after.canPlay, true);
  assert.equal(after.current, 1, 'yesterday\'s daily keeps the run alive today');
});

// ---------------------------------------------------------------- pre-generation

function fakeClient() {
  const c = {
    requests: [], cancels: 0, pending: [],
    request(req) { c.requests.push(req); return new Promise((resolve) => c.pending.push({ req, resolve })); },
    cancel() { c.cancels += 1; },
    answer(result) { const p = c.pending.shift(); p.resolve(result ?? { ok: true, mines: new Int32Array(0), seed: p.req.seed, generatorVersion: 1 }); },
  };
  return c;
}

test('pre-generation: when the menu shows, today\'s unused daily boards are asked of each mode\'s client, once', () => {
  const two = fakeClient();
  const three = fakeClient();
  const boards = createDailyBoards({ clients: { 'classic-2d': () => two, '3d': () => three } });
  boards.prepare(store(), TODAY);
  assert.deepEqual(two.requests, [dailyGame('expert', '20261011').request]);
  assert.deepEqual(three.requests, [dailyGame('cube', '20261011').request]);
  boards.prepare(store(), TODAY);
  assert.equal(two.requests.length + three.requests.length, 2, 'a board held or in flight is not asked again');
  assert.equal(boards.has(dailyGame('expert', '20261011').code), true);
});

test('pre-generation: nothing is asked for a used attempt; take hands a board over once; a failed one is asked again', async () => {
  const two = fakeClient();
  const three = fakeClient();
  const boards = createDailyBoards({ clients: { 'classic-2d': () => two, '3d': () => three } });
  boards.prepare(store([daily('cube', '20261011')]), TODAY);
  assert.equal(three.requests.length, 0, 'the cube was played today');
  assert.equal(two.requests.length, 1);
  const code = dailyGame('expert', '20261011').code;
  two.answer();
  await new Promise((r) => setImmediate(r));
  const pg = boards.take(code);
  assert.equal(pg.cell, dailyGame('expert', '20261011').startCell);
  assert.equal(pg.result.ok, true);
  assert.equal(boards.take(code), null, 'handed over once');
  boards.prepare(store(), TODAY);
  two.answer({ ok: false, cancelled: true, reason: 'cancelled' });
  await new Promise((r) => setImmediate(r));
  assert.equal(boards.take(code), null, 'a cancelled board is not handed over');
  boards.prepare(store(), TODAY);
  assert.equal(two.requests.length, 3, 'and is asked again at the next menu');
  boards.prepare(store(), new Date(2026, 9, 12, 9));
  assert.equal(boards.has(code), false, 'yesterday\'s board is dropped');
});

// ---------------------------------------------------------------- the screen

function fakeEl(data = {}, id = '') {
  const e = {
    id, dataset: data, textContent: '', disabled: false, hidden: new Set(), listeners: {}, children: [], attrs: {},
    classList: { toggle: (c, on) => { if (on) e.hidden.add(c); else e.hidden.delete(c); } },
    setAttribute(k, v) { e.attrs[k] = v; },
    addEventListener(t, f) { (e.listeners[t] ??= []).push(f); },
    click() { for (const f of e.listeners.click ?? []) f(); },
    querySelector(sel) {
      const m = /^\[data-([\w-]+)\]$/.exec(sel);
      const name = m ? m[1] : sel === '.ui-code__value' ? 'value' : null;
      return e.children.find((c) => c.dataset[name] !== undefined) ?? null;
    },
    querySelectorAll(sel) {
      if (sel === '[data-copy]') return e.children.filter((c) => c.dataset.copy);
      const m = /^\[data-([\w-]+)\]$/.exec(sel);
      return e.children.filter((c) => c.dataset[m[1]] !== undefined);
    },
  };
  return e;
}
function fakeScreen() {
  const root = fakeEl();
  for (const id of ['expert', 'cube']) {
    const row = fakeEl({ daily: id });
    const code = fakeEl({ code: '' });
    code.children.push(fakeEl({ value: '' }), fakeEl({ copy: 'code' }), fakeEl({ copy: 'link' }));
    row.children.push(...['date', 'board', 'state', 'streak', 'reason'].map((k) => fakeEl({ [k]: '' })), code,
      fakeEl({ play: '' }, `daily-${id}-play`), fakeEl({ watch: '' }, `daily-${id}-watch`));
    root.children.push(row);
  }
  root.children.push(fakeEl({ back: '' }, 'daily-back'));
  return root;
}

test('a won daily\'s time is the results screen\'s formatTime, never a local tenths format', () => {
  const src = read('js/shell/daily.js');
  assert.match(src, /import \{[^}]*\bformatTime\b[^}]*\} from '\.\.\/results\/view\.js'/);
  assert.doesNotMatch(src, /\btenths\b/);
});

test('the Daily screen shows each row, plays and watches through its callbacks, and focuses the first Play', () => {
  const root = fakeScreen();
  const calls = [];
  const screen = bindDailyScreen({ root, onPlay: (id) => calls.push(['play', id]), onWatch: (id) => calls.push(['watch', id]), onBack: () => calls.push(['back']) });
  const won = daily('expert', '20261011', { ms: 47380 });
  screen.show(dailyRows({ records: store([won]), now: TODAY, replays: { has: () => true } }));
  const [expert, cube] = root.children;
  const part = (row, k) => row.querySelector(`[data-${k}]`);
  assert.equal(part(expert, 'state').textContent, 'Won 47.380 s'); // the results screen's formatTime, trailing zeros kept
  assert.equal(part(expert, 'play').disabled, true);
  assert.equal(part(expert, 'watch').hidden.has('hidden'), false);
  assert.equal(part(cube, 'play').disabled, false);
  assert.equal(part(cube, 'state').textContent, NOT_PLAYED);
  assert.equal(part(cube, 'date').textContent, '11 Oct 2026');
  assert.equal(part(cube, 'code').querySelector('.ui-code__value').textContent, dailyGame('cube', '20261011').code);
  assert.equal(screen.defaultFocus(), '#daily-cube-play');
  part(expert, 'play').click();
  part(cube, 'play').click();
  part(expert, 'watch').click();
  root.querySelector('[data-back]').click();
  assert.deepEqual(calls, [['play', 'cube'], ['watch', won.id], ['back']]);
  screen.show(dailyRows({ records: store([won, daily('cube', '20261011')]), now: TODAY }));
  assert.equal(screen.defaultFocus(), '#daily-back', 'nothing left to play today');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const DAILY_HTML = INDEX.slice(INDEX.indexOf('<section id="daily"'), INDEX.indexOf('<!-- /Daily -->'));

test('index.html holds the Daily screen from the kit: two rows, each with its code chip, Play and Watch replay, and Back', () => {
  assert.ok(DAILY_HTML.length > 400, 'index.html has #daily');
  for (const id of ['expert', 'cube']) {
    const row = DAILY_HTML.slice(DAILY_HTML.indexOf(`data-daily="${id}"`));
    assert.match(row, new RegExp(`id="daily-${id}-play" class="ui-button ui-button--primary" data-play>Play</button>`));
    assert.match(row, new RegExp(`id="daily-${id}-watch" class="ui-button ui-button--secondary hidden" data-watch>Watch replay</button>`));
    assert.match(row, /<div class="ui-code" data-code>/);
  }
  assert.match(DAILY_HTML, /id="daily-back" class="ui-button ui-button--secondary" data-back>Back<\/button>/);
  const classes = [...DAILY_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
});

test('the shell routes the Daily screen, pre-generates when the menu shows and starts a daily with its board', () => {
  assert.match(MAIN, /\[DAILY_SCREEN\]: \{ defaultFocus: \(\) => DAILY_VIEW\.defaultFocus\(\)/);
  assert.match(MAIN, /menu: \{[^\n]*DAILY_BOARDS_HELD\.prepare\(RECORDS\)/, 'the menu shows: the daily boards are asked for');
  assert.match(MAIN, /function playDaily\(id, source\)/);
  assert.match(MAIN, /DAILY_BOARDS_HELD\.take\(game\.code\)/);
});

// ---------------------------------------------------------------- in a browser

test('in a browser, the menu pre-generates today\'s Expert, Daily plays it on the marked cell, and leaving it uses the day\'s attempt', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (kind, ...rest) { return kind === 'webgl2' ? null : get.call(this, kind, ...rest); };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const code = dailyGame('expert', dateText()).code;
    await page.waitForFunction((c) => globalThis.__ms.daily.has(c), code, { timeout: patience(10000) });
    // The Daily entry opens the second block, before Records.
    const entries = await page.evaluate(() => [...document.querySelectorAll('#menu [data-entry]')].map((b) => b.dataset.entry));
    assert.deepEqual(entries, ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily', 'records', 'settings', 'quit']);
    await page.click('#menu-entry-daily');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'daily');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'daily-expert-play', 'the first Play has the focus');
    assert.equal(await page.evaluate(() => document.querySelector('#daily-expert [data-code] .ui-code__value').textContent), code);
    assert.equal(await page.evaluate(() => document.getElementById('daily-cube-play').disabled), true, 'no WebGL 2: the cube cannot be played');
    assert.equal(await page.evaluate(() => document.querySelector('#daily-cube [data-reason]').textContent), UNAVAILABLE_REASONS.webgl2);
    await page.click('#daily-expert-play');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    const mark = dailyGame('expert', dateText()).startCell;
    assert.equal(await page.evaluate(() => globalThis.__ms.board2D.mark), mark);
    const at = await page.evaluate((cell) => {
      const v = globalThis.__ms.board2D;
      const r = v.cellRect(cell);
      const b = v.canvas.getBoundingClientRect();
      return { x: b.left + r.x + r.size / 2, y: b.top + r.y + r.size / 2 };
    }, mark);
    await page.mouse.click(at.x, at.y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started === true);
    assert.equal(await page.evaluate(() => document.getElementById('c2d-status').classList.contains('hidden')), true, 'the pre-generated board: no generating card');
    const summary = await page.evaluate(() => globalThis.__ms.modes.summary());
    assert.equal(summary.daily, dateText());
    assert.equal(summary.board.daily, true);
    // Leaving counts as a loss, on the day's Daily board.
    await page.keyboard.press('Escape');
    await page.click('#p-menu');
    await page.click('#p-confirm-yes');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    await page.click('#menu-entry-daily');
    assert.equal(await page.evaluate(() => document.querySelector('#daily-expert [data-state]').textContent), 'Lost');
    assert.equal(await page.evaluate(() => document.getElementById('daily-expert-play').disabled), true, 'the counted attempt is used');
    assert.equal(await page.evaluate(() => globalThis.__ms.daily.has(document.querySelector('#daily-expert [data-code] .ui-code__value').textContent)), false, 'nothing asked for a used attempt');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
