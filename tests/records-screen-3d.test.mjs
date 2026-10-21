// Records screen for 3D (js/records/screen.js): the 2D | 3D switch above the board picker, the
// picker listing the chosen mode's boards under their labels, the chosen mode's overall figures,
// the open rules (mode, board key, last game played) and the mode switch from a fake records
// store; the results screen's Records opening on a 3D game's board; the #records-mode markup and
// its wiring; and in a browser the switch by mouse, keyboard and controller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RECORDS_MODES, pickerBoards, lastBoardPlayed, recordsContent, createRecordsScreen,
} from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { createResultsFlow } from '../js/results/flow.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board2D = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const board3D = (width, height, depth, mines, noGuess = false) => createBoardIdentity({ mode: MODE_3D, width, height, depth, mines, noGuess });
const BEGINNER = board2D(9, 9, 10);
const CUSTOM_2D = board2D(20, 12, 50);
const CUBE_BEGINNER = board3D(6, 6, 6, 20);
const CUBE_INTRO = board3D(6, 6, 6, 10);
const FORMER_EXPERT = board3D(12, 12, 8, 130);
const FORMER_DOUBLE = board3D(8, 8, 2, 10);
const CUBE_EXPERT_NG = board3D(10, 10, 10, 100, true);
const CUSTOM_3D = board3D(10, 10, 10, 80);
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
let n = 0;
const game = (b, over = {}) => {
  const won = (over.outcome ?? 'won') === 'won';
  const elapsedMs = over.elapsedMs ?? 47380;
  const bbbv = 20;
  const bbbvSolved = won ? bbbv : 5;
  return {
    id: `g${++n}`, board: { ...b }, outcome: 'won', elapsedMs, bbbv, bbbvSolved, clicks: clicks(25),
    bbbvPerSecond: bbbvSolved / (elapsedMs / 1000), efficiency: (100 * bbbvSolved) / 25, seed: 1, generatorVersion: 1,
    endedAt: '2026-10-09T12:00:00.000Z', ...over,
  };
};

/** A fake records store: the real model's queries, plus onChange, available and record. */
function fakeStore({ games = [], available = true } = {}) {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  const listeners = new Set();
  const store = {
    available: () => available,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    record(s) { const c = model.record(s); for (const fn of listeners) fn(c, s); return c; },
  };
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'completedWinRate', 'history', 'overall', 'overallWinRate', 'overallCompletedWinRate']) {
    store[q] = (...a) => model[q](...a);
  }
  return store;
}
function brokenStore() {
  const fail = () => { throw new RangeError('records: unreadable'); };
  return {
    available: () => false, onChange: () => () => {},
    boardsPlayed: fail, bests: fail, counters: fail, winRate: fail, completedWinRate: fail, history: fail, overall: fail, overallWinRate: fail,
    overallCompletedWinRate: fail,
  };
}
/** A fake replay library recording the boards it is asked for. */
function fakeLibrary() {
  const asked = [];
  return {
    asked,
    forBoard(key) { asked.push(key); return []; },
    has: () => false,
    load: () => Promise.resolve(),
    available: () => true,
    onChange: () => () => {},
  };
}
function fakeView() {
  const shown = [];
  return { shown, show(c) { shown.push(c); }, hide() {} };
}
const PRESETS = ['Cube Intro', 'Cube Beginner', 'Cube Intermediate', 'Cube Expert'];
const PRESET_LABELS = [...PRESETS, ...PRESETS.map((l) => `${l} · no-guess`)];
const DAILY_3D = 'Daily';
const value = (list, key) => list.find((s) => s.key === key || s.stat === key).value;

// ---------------------------------------------------------------- the switch and the picker

test('the switch offers Classic 2D and 3D; the content carries the chosen mode', () => {
  assert.deepEqual(RECORDS_MODES.map((m) => [m.value, m.label]), [['classic-2d', 'Classic 2D'], ['3d', '3D']]);
  const c = recordsContent(fakeStore(), { mode: '3d' });
  assert.equal(c.mode, '3d');
  assert.deepEqual(c.modes, [{ value: 'classic-2d', label: 'Classic 2D', selected: false }, { value: '3d', label: '3D', selected: true }]);
  assert.equal(recordsContent(fakeStore()).mode, 'classic-2d');
});

test('the 3D picker lists the four presets without no-guess, then with it, then the custom 3D boards played, under their 3D labels', () => {
  const store = fakeStore({ games: [game(CUSTOM_3D), game(BEGINNER), game(CUSTOM_2D), game(CUBE_EXPERT_NG)] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '10 × 10 × 10 · 80 mines']);
  assert.equal(three[0].key, boardKey(CUBE_INTRO));
  assert.equal(three[1].key, boardKey(CUBE_BEGINNER));
  assert.ok(three.every((b) => !b.label.startsWith('First box')), 'no First box entry');
  assert.equal(new Set(three.map((b) => b.key)).size, three.length, 'a preset played is not listed twice');
  const two = pickerBoards(store, 'classic-2d');
  assert.ok(two.every((b) => b.board.mode === 'classic-2d'), 'no 3D board in the 2D picker');
  assert.equal(two.at(-1).label, '20 × 12 · 50 mines');
  assert.deepEqual(pickerBoards(store).map((b) => b.key), two.map((b) => b.key), 'Classic 2D by default');
  assert.deepEqual(pickerBoards(brokenStore(), '3d').map((b) => b.label), [...PRESET_LABELS, DAILY_3D], 'unreadable records: the presets and the Daily board');
});

test('the 3D picker lists a former double layer board with the custom boards, under its size', () => {
  const store = fakeStore({ games: [
    game(FORMER_DOUBLE, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '10 × 10 × 10 · 80 mines', '8 × 8 × 2 · 10 mines']);
  const c = recordsContent(store, { boardKey: boardKey(FORMER_DOUBLE) });
  assert.equal(c.board.label, '8 × 8 × 2 · 10 mines');
  assert.equal(c.board.key, '3d:8x8x2:10:guess', 'its records keep their board key');
});

test('the 3D picker lists a former First box board with the custom boards, under its size and mine count', () => {
  const store = fakeStore({ games: [
    game(board3D(4, 4, 3, 4), { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '10 × 10 × 10 · 80 mines', '4 × 4 × 3 · 4 mines']);
  const c = recordsContent(store, { boardKey: boardKey(board3D(4, 4, 3, 4)) });
  assert.equal(c.board.label, '4 × 4 × 3 · 4 mines');
  assert.equal(c.board.key, '3d:4x4x3:4:guess', 'its records keep their board key');
});

test('the 3D picker lists the former Cube Expert with the custom boards, and the old Beginner\'s records as Cube Intro', () => {
  const store = fakeStore({ games: [
    game(FORMER_EXPERT, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUBE_INTRO, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, DAILY_3D, '12 × 12 × 8 · 130 mines']);
  const c = recordsContent(store, { boardKey: boardKey(FORMER_EXPERT) });
  assert.equal(c.board.label, '12 × 12 × 8 · 130 mines');
  assert.equal(c.board.key, '3d:12x12x8:130:guess', 'its records keep their board key');
  assert.equal(recordsContent(store, { boardKey: boardKey(CUBE_INTRO) }).board.label, 'Cube Intro');
});

// ---------------------------------------------------------------- open rules

test('a board key alone sets the switch from its mode', () => {
  const store = fakeStore({ games: [game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' })] });
  const c = recordsContent(store, { boardKey: boardKey(CUBE_EXPERT_NG) });
  assert.equal(c.mode, '3d');
  assert.equal(c.board.key, boardKey(CUBE_EXPERT_NG));
  assert.equal(c.board.label, 'Cube Expert · no-guess');
  assert.deepEqual(c.boards.map((b) => b.label), [...PRESET_LABELS, DAILY_3D]);
  const custom = recordsContent(store, { boardKey: boardKey(CUSTOM_3D) });
  assert.equal(custom.mode, '3d');
  assert.equal(custom.boards.at(-1).key, boardKey(CUSTOM_3D), 'a 3D board asked for joins the 3D picker');
  assert.equal(recordsContent(store, { mode: 'classic-2d', boardKey: boardKey(CUBE_BEGINNER) }).mode, '3d', 'the key carries its mode');
});

test('a mode alone opens on its last board played, else on its first board', () => {
  const store = fakeStore({ games: [
    game(CUBE_EXPERT_NG, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
  ] });
  assert.equal(recordsContent(store, { mode: '3d' }).board.key, boardKey(CUSTOM_3D));
  assert.equal(recordsContent(store, { mode: 'classic-2d' }).board.key, boardKey(BEGINNER));
  assert.equal(recordsContent(fakeStore({ games: [game(BEGINNER)] }), { mode: '3d' }).board.key, boardKey(CUBE_INTRO));
  assert.equal(lastBoardPlayed(store, '3d'), boardKey(CUSTOM_3D));
  assert.equal(lastBoardPlayed(store, 'classic-2d'), boardKey(BEGINNER));
});

test('without a mode or a board the screen opens on the mode and board of the last game played', () => {
  const store = fakeStore({ games: [
    game(BEGINNER, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUBE_EXPERT_NG, { endedAt: '2026-10-09T12:00:00.000Z' }),
    game(CUSTOM_2D, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  const c = recordsContent(store);
  assert.equal(c.mode, '3d');
  assert.equal(c.board.key, boardKey(CUBE_EXPERT_NG));
  assert.equal(lastBoardPlayed(store), boardKey(CUBE_EXPERT_NG), 'across both modes');
  const none = recordsContent(fakeStore());
  assert.equal(none.mode, 'classic-2d');
  assert.equal(none.board.label, 'Beginner');
  assert.equal(recordsContent(brokenStore()).mode, 'classic-2d');
});

// ---------------------------------------------------------------- figures

test("the figures panel shows the chosen 3D board's figures and the 3D overall figures", () => {
  const store = fakeStore({ games: [
    game(CUBE_BEGINNER, { elapsedMs: 30000, endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUBE_BEGINNER, { outcome: 'lost', endedAt: '2026-10-08T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T13:00:00.000Z' }),
    game(CUSTOM_3D, { outcome: 'abandoned', endedAt: '2026-10-08T14:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T13:00:00.000Z' }),
  ] });
  const library = fakeLibrary();
  const c = recordsContent(store, { boardKey: boardKey(CUBE_BEGINNER), replays: library });
  assert.equal(value(c.bests, 'time'), '30.000 s');
  assert.deepEqual(c.counters.map((s) => [s.key, s.value]), [
    ['games', '2'], ['wins', '1'], ['winRate', '50%'], ['completedWinRate', '50%'], ['currentStreak', '0'], ['longestStreak', '1'],
    ['longestCompletedStreak', '1'],
  ]);
  assert.equal(c.overallTitle, '3D overall');
  assert.deepEqual(c.overall.map((s) => [s.key, s.value]), [
    ['games', '4'], ['wins', '2'], ['winRate', '50%'], ['completedWinRate', '67%'], ['currentStreak', '0'], ['longestStreak', '1'],
    ['longestCompletedStreak', '1'],
  ], 'the 3D games only, the restarted one left out of the completed figures');
  assert.equal(c.games.rows.length, 2, 'the games list reads the chosen board');
  assert.equal(c.chart.points.length, 1, 'the chart reads the chosen board');
  assert.deepEqual(library.asked, [boardKey(CUBE_BEGINNER)], 'the library view reads the chosen board');
  const two = recordsContent(store, { mode: 'classic-2d' });
  assert.equal(two.overallTitle, 'Classic 2D overall');
  assert.equal(value(two.overall, 'games'), '2');
});

// ---------------------------------------------------------------- the controller

test('the mode switch shows the chosen mode on its last board played, on the first games page', () => {
  const store = fakeStore({ games: [
    game(CUSTOM_3D, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
  ] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show();
  assert.equal(screen.mode, 'classic-2d');
  assert.equal(screen.board, boardKey(BEGINNER));
  screen.showPage(3);
  screen.setMode('3d');
  assert.equal(screen.mode, '3d');
  assert.equal(screen.board, boardKey(CUSTOM_3D));
  assert.equal(screen.page, 0);
  assert.equal(view.shown.at(-1).mode, '3d');
  assert.ok(view.shown.at(-1).boards.every((b) => b.key.startsWith('3d:') || b.key.startsWith('daily:3d:')));
  screen.select(boardKey(CUBE_BEGINNER));
  assert.equal(view.shown.at(-1).board.label, 'Cube Beginner');
  assert.equal(screen.mode, '3d', 'a board chosen in the picker keeps the mode');
  store.record(game(BEGINNER, { endedAt: '2026-10-09T14:00:00.000Z' }));
  assert.equal(view.shown.at(-1).board.key, boardKey(CUBE_BEGINNER), 'a game recorded live keeps the chosen board');
  screen.setMode('classic-2d');
  assert.equal(screen.board, boardKey(BEGINNER));
  const shown = view.shown.length;
  screen.setMode('classic-2d');
  assert.equal(view.shown.length, shown, 'choosing the mode already shown changes nothing');
  screen.setMode('nonsense');
  assert.equal(screen.mode, 'classic-2d', 'an unknown mode is ignored');
});

test("a 3D board gets every history view: the Top 10, the averages, the best-time chart and the filters, ranking its no-guess board alone", () => {
  const store = fakeStore({ games: [
    game(CUBE_BEGINNER, { id: 'c1', elapsedMs: 90000, endedAt: '2026-10-01T12:00:00.000Z' }),
    game(CUBE_BEGINNER, { id: 'c2', elapsedMs: 70000, endedAt: '2026-10-05T12:00:00.000Z' }),
    game(CUBE_BEGINNER, { id: 'c3', outcome: 'lost', endedAt: '2026-10-06T12:00:00.000Z' }),
    game(board3D(6, 6, 6, 10, true), { id: 'n1', elapsedMs: 10000, endedAt: '2026-10-07T12:00:00.000Z' }),
  ] });
  const now = new Date('2026-10-14T12:00:00.000Z');
  const c = recordsContent(store, { boardKey: boardKey(CUBE_BEGINNER), now, tab: 'top' });
  assert.equal(c.mode, '3d');
  assert.deepEqual(c.top.rows.map((r) => [r.rank, r.id, r.time]), [['1', 'c2', '70.000 s'], ['2', 'c1', '90.000 s']]);
  assert.deepEqual(c.averages.rows[0].values, ['80.000 s', '80.000 s', '80.000 s']);
  assert.equal(c.averages.winRate, 'Win rate, last 50 (3): 67% (completed games 67%)');
  assert.deepEqual(c.bestChart.steps.map((x) => x.id), ['c1', 'c2']);
  const week = recordsContent(store, { boardKey: boardKey(CUBE_BEGINNER), now, period: '7d' });
  assert.deepEqual([week.top.rows.length, week.games.rows.length], [0, 0], 'nothing in the last 7 days on this board');
  assert.equal(week.empty, false, 'the board is not empty');
});

test('Open takes an optional mode beside the optional board key', () => {
  const store = fakeStore({ games: [game(CUSTOM_3D, { endedAt: '2026-10-07T12:00:00.000Z' }), game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show({ mode: '3d' });
  assert.equal(screen.mode, '3d');
  assert.equal(screen.board, boardKey(CUSTOM_3D));
  screen.show({ boardKey: boardKey(CUBE_EXPERT_NG) });
  assert.equal(screen.mode, '3d');
  assert.equal(screen.board, boardKey(CUBE_EXPERT_NG));
  screen.show();
  assert.equal(screen.mode, 'classic-2d', 'opened again without either: the last game played');
  assert.equal(screen.board, boardKey(BEGINNER));
});

test("Watch from a 3D board returns to the Records screen on that board, and so on 3D", () => {
  const store = fakeStore({ games: [game(CUBE_BEGINNER)] });
  const routes = [];
  const router = { has: () => true, go: (screen, opts) => routes.push({ screen, ...opts }) };
  const screen = createRecordsScreen({ records: store, view: fakeView(), router });
  screen.show({ mode: '3d' });
  screen.watch('g-x');
  const back = routes.at(-1).data.returnTo;
  assert.equal(back.data.boardKey, boardKey(CUBE_BEGINNER));
  assert.equal(recordsContent(store, back.data).mode, '3d');
});

// ---------------------------------------------------------------- results screen

test("the results screen's Records opens on 3D and on this game's board for a 3D game", () => {
  const routes = [];
  const router = { has: () => true, go: (screen, opts) => routes.push({ screen, ...opts }) };
  const store = fakeStore();
  const flow = createResultsFlow({ records: store, router, restart: () => {}, goMenu: () => {} });
  flow.finished(game(CUBE_EXPERT_NG), '3d');
  flow.openRecords();
  const { screen, data } = routes.at(-1);
  assert.equal(screen, 'records');
  assert.equal(data.boardKey, boardKey(CUBE_EXPERT_NG));
  const c = recordsContent(store, data);
  assert.equal(c.mode, '3d');
  assert.equal(c.board.label, 'Cube Expert · no-guess');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the 2D | 3D switch is a kit segmented choice in the frame\'s head, above the board picker', () => {
  const at = RECORDS_HTML.indexOf('id="records-mode"');
  assert.ok(at > 0, '#records-mode');
  assert.ok(at < RECORDS_HTML.indexOf('id="records-picker"'), 'above the picker');
  const group = RECORDS_HTML.slice(RECORDS_HTML.lastIndexOf('<div', at), RECORDS_HTML.indexOf('</div>', at));
  assert.match(group, /<div id="records-mode" class="ui-segmented" role="radiogroup" aria-label="Mode">/);
  const options = [...group.matchAll(/<button type="button" class="ui-segmented__option" role="radio" aria-checked="(true|false)" data-value="([^"]+)">([^<]+)<\/button>/g)]
    .map((m) => [m[2], m[3], m[1]]);
  assert.deepEqual(options, [['classic-2d', 'Classic 2D', 'true'], ['3d', '3D', 'false']]);
  const head = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div class="ui-frame__end">'), RECORDS_HTML.indexOf('</header>'));
  assert.ok(head.includes('id="records-mode"'), 'the switch is the frame head\'s end');
  const body = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div class="ui-frame__body" id="records-body">'));
  assert.match(body, /^<div class="ui-frame__body" id="records-body">\s*<div id="records-mode-touch" class="ui-segmented" role="radiogroup" aria-label="Mode">/,
    'the phone\'s full-width bar opens the body, above the picker');
  assert.ok(body.indexOf('id="records-mode-touch"') < body.indexOf('id="records-picker"'));
});

test('the shell opens the records screen with its mode and board, and the switch calls the controller', () => {
  assert.match(MAIN, /RECORDS_PAGE\.show\(\{ mode: d\.mode, boardKey: d\.boardKey \}\)/);
  assert.match(MAIN, /onMode: \(mode\) => RECORDS_PAGE\.setMode\(mode\)/);
  const src = read('js/records/screen.js');
  assert.match(src, /\['records-mode', 'records-mode-touch'\]\.map\(\$\)/, 'the head\'s switch and the phone\'s bar');
  assert.match(src, /for \(const group of modeGroups\) bindSegmented\(group, \{ onChange: \(mode\) => onMode\(mode\) \}\)/);
});

test('the catalogue documents the mode switch', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?2D \| 3D[\s\S]*?#records-mode/);
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu keeps no 3D backdrop
// redrawing under software rendering.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser, mouse, keyboard and controller operate the 2D | 3D switch', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const checked = () => ms(() => document.querySelector('#records-mode [aria-checked="true"]')?.dataset.value);
    const boardShown = () => ms(() => document.getElementById('records-board').textContent);
    const firstOption = () => ms(() => document.querySelector('#records-picker .ui-segmented__option')?.textContent);
    const overallTitle = () => ms(() => document.getElementById('records-overall-title').textContent);
    const frames = (count) => ms((k) => new Promise((r) => { const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
    const tap = async (button) => {
      await ms((b) => globalThis.__pad.press(b, true), button);
      await frames(1);
      await ms((b) => globalThis.__pad.press(b, false), button);
      await frames(2);
    };
    const BTN = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

    await ms(() => {
      const c = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const g = (id, board, endedAt) => ({ id, board, outcome: 'won', elapsedMs: 40000, bbbv: 20, bbbvSolved: 20, clicks: c,
        bbbvPerSecond: 0.5, efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      globalThis.__ms.records.record(g('d1', { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, '2026-10-08T12:00:00.000Z'));
      globalThis.__ms.records.record(g('t1', { mode: '3d', width: 6, height: 6, depth: 6, mines: 10, noGuess: false }, '2026-10-09T12:00:00.000Z'));
    });

    // Opens on the mode and board of the last game played: 3D, Cube Intro (the 6 × 6 × 6 · 10 board).
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.equal(await checked(), '3d');
    assert.equal(await boardShown(), 'Cube Intro · Bests');
    assert.equal(await overallTitle(), '3D overall');
    assert.equal(await firstOption(), 'Cube Intro');
    assert.deepEqual((await ms(() => [...document.querySelectorAll('#records-picker .ui-segmented__option')].map((o) => o.textContent))).slice(0, PRESET_LABELS.length),
      PRESET_LABELS, 'the picker offers the four presets without no-guess, then with it');
    const figure = (id) => ms((i) => document.querySelector(`#${i} .ui-stat__value`).textContent, id);
    assert.equal(await figure('rec-completedWinRate'), '100%', 'the 3D board\'s completed-games figures');
    assert.match(await ms(() => document.getElementById('records-overall-line').textContent), /Longest 1 \(completed 1\)$/);

    // Mouse.
    await page.click('#records-mode [data-value="classic-2d"]');
    assert.equal(await checked(), 'classic-2d');
    assert.equal(await boardShown(), 'Beginner · Bests');
    assert.equal(await overallTitle(), 'Classic 2D overall');
    assert.equal(await firstOption(), 'Beginner');

    // Keyboard: the arrows move the switch.
    await page.focus('#records-mode [aria-checked="true"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await checked(), '3d');
    assert.equal(await boardShown(), 'Cube Intro · Bests');
    assert.equal(await ms(() => document.activeElement?.dataset.value), '3d', 'focus stays on the switch');

    // Controller: focus moves onto the 2D option and A chooses it.
    await tap(BTN.LEFT);
    assert.equal(await ms(() => document.activeElement?.dataset.value), 'classic-2d');
    await tap(BTN.A);
    assert.equal(await checked(), 'classic-2d');
    assert.equal(await boardShown(), 'Beginner · Bests');

    await tap(BTN.B);
    assert.equal(await mode(), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
