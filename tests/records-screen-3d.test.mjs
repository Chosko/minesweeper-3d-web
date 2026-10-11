// Records screen for 3D (js/records/screen.js): the 2D | 3D switch above the board picker, the
// picker listing the chosen mode's boards under their labels, the chosen mode's overall figures,
// the open rules (mode, board key, last game played) and the mode switch from a fake records
// store; the results screen's Records opening on a 3D game's board; the #records-mode markup and
// its wiring; and in a browser the switch by mouse, keyboard and controller.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  RECORDS_MODES, pickerBoards, lastBoardPlayed, recordsContent, createRecordsScreen,
} from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { createResultsFlow } from '../js/results/flow.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board2D = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const board3D = (width, height, depth, mines, noGuess = false) => createBoardIdentity({ mode: MODE_3D, width, height, depth, mines, noGuess });
const BEGINNER = board2D(9, 9, 10);
const CUSTOM_2D = board2D(20, 12, 50);
const DL_BEGINNER = board3D(8, 8, 2, 10);
const CUBE_EXPERT_NG = board3D(12, 12, 8, 130, true);
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
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'history', 'overall', 'overallWinRate']) store[q] = (...a) => model[q](...a);
  return store;
}
function brokenStore() {
  const fail = () => { throw new RangeError('records: unreadable'); };
  return {
    available: () => false, onChange: () => () => {},
    boardsPlayed: fail, bests: fail, counters: fail, winRate: fail, history: fail, overall: fail, overallWinRate: fail,
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
const PRESET_LABELS = ['Double layer Beginner', 'Double layer Intermediate', 'Double layer Expert', 'Cube Beginner', 'Cube Intermediate', 'Cube Expert']
  .flatMap((l) => [l, `${l} · no-guess`]);
const value = (list, key) => list.find((s) => s.key === key || s.stat === key).value;

// ---------------------------------------------------------------- the switch and the picker

test('the switch offers 2D and 3D; the content carries the chosen mode', () => {
  assert.deepEqual(RECORDS_MODES.map((m) => [m.value, m.label]), [['classic-2d', '2D'], ['3d', '3D']]);
  const c = recordsContent(fakeStore(), { mode: '3d' });
  assert.equal(c.mode, '3d');
  assert.deepEqual(c.modes, [{ value: 'classic-2d', label: '2D', selected: false }, { value: '3d', label: '3D', selected: true }]);
  assert.equal(recordsContent(fakeStore()).mode, 'classic-2d');
});

test('the 3D picker lists the six presets with and without no-guess, then the custom 3D boards played, under their 3D labels', () => {
  const store = fakeStore({ games: [game(CUSTOM_3D), game(BEGINNER), game(CUSTOM_2D), game(CUBE_EXPERT_NG)] });
  const three = pickerBoards(store, '3d');
  assert.deepEqual(three.map((b) => b.label), [...PRESET_LABELS, '10 × 10 × 10 · 80 mines']);
  assert.equal(three[0].key, boardKey(DL_BEGINNER));
  assert.equal(new Set(three.map((b) => b.key)).size, three.length, 'a preset played is not listed twice');
  const two = pickerBoards(store, 'classic-2d');
  assert.ok(two.every((b) => b.board.mode === 'classic-2d'), 'no 3D board in the 2D picker');
  assert.equal(two.at(-1).label, '20 × 12 · 50 mines');
  assert.deepEqual(pickerBoards(store).map((b) => b.key), two.map((b) => b.key), 'Classic 2D by default');
  assert.deepEqual(pickerBoards(brokenStore(), '3d').map((b) => b.label), PRESET_LABELS, 'unreadable records: the presets');
});

// ---------------------------------------------------------------- open rules

test('a board key alone sets the switch from its mode', () => {
  const store = fakeStore({ games: [game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' })] });
  const c = recordsContent(store, { boardKey: boardKey(CUBE_EXPERT_NG) });
  assert.equal(c.mode, '3d');
  assert.equal(c.board.key, boardKey(CUBE_EXPERT_NG));
  assert.equal(c.board.label, 'Cube Expert · no-guess');
  assert.deepEqual(c.boards.map((b) => b.label), PRESET_LABELS);
  const custom = recordsContent(store, { boardKey: boardKey(CUSTOM_3D) });
  assert.equal(custom.mode, '3d');
  assert.equal(custom.boards.at(-1).key, boardKey(CUSTOM_3D), 'a 3D board asked for joins the 3D picker');
  assert.equal(recordsContent(store, { mode: 'classic-2d', boardKey: boardKey(DL_BEGINNER) }).mode, '3d', 'the key carries its mode');
});

test('a mode alone opens on its last board played, else on its first board', () => {
  const store = fakeStore({ games: [
    game(CUBE_EXPERT_NG, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
  ] });
  assert.equal(recordsContent(store, { mode: '3d' }).board.key, boardKey(CUSTOM_3D));
  assert.equal(recordsContent(store, { mode: 'classic-2d' }).board.key, boardKey(BEGINNER));
  assert.equal(recordsContent(fakeStore({ games: [game(BEGINNER)] }), { mode: '3d' }).board.key, boardKey(DL_BEGINNER));
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
    game(DL_BEGINNER, { elapsedMs: 30000, endedAt: '2026-10-07T12:00:00.000Z' }),
    game(DL_BEGINNER, { outcome: 'lost', endedAt: '2026-10-08T12:00:00.000Z' }),
    game(CUSTOM_3D, { endedAt: '2026-10-08T13:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T12:00:00.000Z' }),
    game(BEGINNER, { endedAt: '2026-10-09T13:00:00.000Z' }),
  ] });
  const library = fakeLibrary();
  const c = recordsContent(store, { boardKey: boardKey(DL_BEGINNER), replays: library });
  assert.equal(value(c.bests, 'time'), '30.0 s');
  assert.deepEqual(c.counters.map((s) => [s.key, s.value]), [
    ['games', '2'], ['wins', '1'], ['winRate', '50%'], ['currentStreak', '0'], ['longestStreak', '1'],
  ]);
  assert.equal(c.overallTitle, '3D overall');
  assert.deepEqual(c.overall.map((s) => [s.key, s.value]), [
    ['games', '3'], ['wins', '2'], ['winRate', '67%'], ['currentStreak', '1'], ['longestStreak', '1'],
  ], 'the 3D games only');
  assert.equal(c.games.rows.length, 2, 'the games list reads the chosen board');
  assert.equal(c.chart.points.length, 1, 'the chart reads the chosen board');
  assert.deepEqual(library.asked, [boardKey(DL_BEGINNER)], 'the library view reads the chosen board');
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
  assert.ok(view.shown.at(-1).boards.every((b) => b.key.startsWith('3d:')));
  screen.select(boardKey(DL_BEGINNER));
  assert.equal(view.shown.at(-1).board.label, 'Double layer Beginner');
  assert.equal(screen.mode, '3d', 'a board chosen in the picker keeps the mode');
  store.record(game(BEGINNER, { endedAt: '2026-10-09T14:00:00.000Z' }));
  assert.equal(view.shown.at(-1).board.key, boardKey(DL_BEGINNER), 'a game recorded live keeps the chosen board');
  screen.setMode('classic-2d');
  assert.equal(screen.board, boardKey(BEGINNER));
  const shown = view.shown.length;
  screen.setMode('classic-2d');
  assert.equal(view.shown.length, shown, 'choosing the mode already shown changes nothing');
  screen.setMode('nonsense');
  assert.equal(screen.mode, 'classic-2d', 'an unknown mode is ignored');
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
  const store = fakeStore({ games: [game(DL_BEGINNER)] });
  const routes = [];
  const router = { has: () => true, go: (screen, opts) => routes.push({ screen, ...opts }) };
  const screen = createRecordsScreen({ records: store, view: fakeView(), router });
  screen.show({ mode: '3d' });
  screen.watch('g-x');
  const back = routes.at(-1).data.returnTo;
  assert.equal(back.data.boardKey, boardKey(DL_BEGINNER));
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

test('the 2D | 3D switch is a kit segmented choice above the board picker', () => {
  const at = RECORDS_HTML.indexOf('id="records-mode"');
  assert.ok(at > 0, '#records-mode');
  assert.ok(at < RECORDS_HTML.indexOf('id="records-picker"'), 'above the picker');
  const group = RECORDS_HTML.slice(RECORDS_HTML.lastIndexOf('<div', at), RECORDS_HTML.indexOf('</div>', at));
  assert.match(group, /<div id="records-mode" class="ui-segmented" role="radiogroup" aria-label="Mode">/);
  const options = [...group.matchAll(/<button type="button" class="ui-segmented__option" role="radio" aria-checked="(true|false)" data-value="([^"]+)">([^<]+)<\/button>/g)]
    .map((m) => [m[2], m[3], m[1]]);
  assert.deepEqual(options, [['classic-2d', '2D', 'true'], ['3d', '3D', 'false']]);
});

test('the shell opens the records screen with its mode and board, and the switch calls the controller', () => {
  assert.match(MAIN, /RECORDS_PAGE\.show\(\{ mode: d\.mode, boardKey: d\.boardKey \}\)/);
  assert.match(MAIN, /onMode: \(mode\) => RECORDS_PAGE\.setMode\(mode\)/);
  const src = read('js/records/screen.js');
  assert.match(src, /bindSegmented\(modes, \{ onChange: \(mode\) => onMode\(mode\) \}\)/);
});

test('the catalogue documents the mode switch', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?2D \| 3D[\s\S]*?#records-mode/);
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

test('in a browser, mouse, keyboard and controller operate the 2D | 3D switch', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return; }
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
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
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

    // Opens on the mode and board of the last game played: 3D, Cube Beginner.
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.equal(await checked(), '3d');
    assert.equal(await boardShown(), 'Cube Beginner');
    assert.equal(await overallTitle(), '3D overall');
    assert.equal(await firstOption(), 'Double layer Beginner');

    // Mouse.
    await page.click('#records-mode [data-value="classic-2d"]');
    assert.equal(await checked(), 'classic-2d');
    assert.equal(await boardShown(), 'Beginner');
    assert.equal(await overallTitle(), 'Classic 2D overall');
    assert.equal(await firstOption(), 'Beginner');

    // Keyboard: the arrows move the switch.
    await page.focus('#records-mode [aria-checked="true"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await checked(), '3d');
    assert.equal(await boardShown(), 'Cube Beginner');
    assert.equal(await ms(() => document.activeElement?.dataset.value), '3d', 'focus stays on the switch');

    // Controller: focus moves onto the 2D option and A chooses it.
    await tap(BTN.LEFT);
    assert.equal(await ms(() => document.activeElement?.dataset.value), 'classic-2d');
    await tap(BTN.A);
    assert.equal(await checked(), 'classic-2d');
    assert.equal(await boardShown(), 'Beginner');

    await tap(BTN.B);
    assert.equal(await mode(), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
