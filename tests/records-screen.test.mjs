// Records screen (js/records/screen.js): the board picker, the figures and overall panels, the empty
// state and the not-saving notice from a fake records store; the screen controller's live update and
// told-once notice; the #records markup and its wiring in js/main.js; and in a browser the routes
// from the main menu and the results screen, the picker and Back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  RECORDS_SCREEN, pickerBoards, lastBoardPlayed, recordsContent, createRecordsScreen, formatDate, formatWinRate,
  EMPTY_TEXT,
} from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { DASH, NOTES } from '../js/results/view.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const BEGINNER = board(9, 9, 10);
const EXPERT_NG = board(30, 16, 99, true);
const CUSTOM = board(20, 12, 50);
const CUSTOM2 = board(5, 5, 3);
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
    subscribed: () => listeners.size,
    available: () => available,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    record(s) { const c = model.record(s); for (const fn of listeners) fn(c, s); return c; },
  };
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'history', 'overall', 'overallWinRate']) store[q] = (...a) => model[q](...a);
  return store;
}
/** A store whose stored records could not be read: every query throws. */
function brokenStore() {
  const fail = () => { throw new RangeError('records: unreadable'); };
  return {
    available: () => false, onChange: () => () => {},
    boardsPlayed: fail, bests: fail, counters: fail, winRate: fail, history: fail, overall: fail, overallWinRate: fail,
  };
}
const STANDARD_LABELS = ['Beginner', 'Beginner · no-guess', 'Intermediate', 'Intermediate · no-guess', 'Expert', 'Expert · no-guess'];
const stat = (list, key) => list.find((s) => s.key === key || s.stat === key);

// ---------------------------------------------------------------- picker

test('the picker lists the six standard boards, then every custom board played, by boardLabel', () => {
  assert.deepEqual(pickerBoards(fakeStore()).map((b) => b.label), STANDARD_LABELS, 'the standard boards with no games played');
  const store = fakeStore({ games: [game(CUSTOM2, { endedAt: '2026-10-01T12:00:00.000Z' }), game(BEGINNER), game(CUSTOM, { endedAt: '2026-10-08T12:00:00.000Z' }), game(EXPERT_NG)] });
  const boards = pickerBoards(store);
  assert.deepEqual(boards.map((b) => b.label), [...STANDARD_LABELS, '20 × 12 · 50 mines', '5 × 5 · 3 mines']);
  assert.equal(boards[0].key, boardKey(BEGINNER));
  assert.equal(boards[5].key, boardKey(EXPERT_NG));
  assert.equal(new Set(boards.map((b) => b.key)).size, boards.length, 'a standard board played is not listed twice');
});

test('the last board played is the one whose latest game ended last; none before any game', () => {
  assert.equal(lastBoardPlayed(fakeStore()), null);
  const store = fakeStore({ games: [
    game(BEGINNER, { endedAt: '2026-10-07T12:00:00.000Z' }),
    game(CUSTOM, { endedAt: '2026-10-09T08:00:00.000Z' }),
    game(EXPERT_NG, { endedAt: '2026-10-08T12:00:00.000Z' }),
  ] });
  assert.equal(lastBoardPlayed(store), boardKey(CUSTOM));
});

test('the screen opens on the board asked for, else on the last board played, else on Beginner', () => {
  const store = fakeStore({ games: [game(BEGINNER, { endedAt: '2026-10-01T12:00:00.000Z' }), game(CUSTOM, { endedAt: '2026-10-02T12:00:00.000Z' })] });
  assert.equal(recordsContent(store, { boardKey: boardKey(BEGINNER) }).board.key, boardKey(BEGINNER));
  assert.equal(recordsContent(store).board.key, boardKey(CUSTOM));
  assert.equal(recordsContent(fakeStore()).board.key, boardKey(BEGINNER));
  const c = recordsContent(store, { boardKey: boardKey(EXPERT_NG) });
  assert.equal(c.board.label, 'Expert · no-guess');
  assert.deepEqual(c.boards.filter((b) => b.selected).map((b) => b.key), [boardKey(EXPERT_NG)], 'one board is selected');
  const unplayed = recordsContent(store, { boardKey: boardKey(CUSTOM2) });
  assert.equal(unplayed.board.key, boardKey(CUSTOM2), 'a board asked for that the records do not hold is still shown');
  assert.equal(unplayed.boards.at(-1).key, boardKey(CUSTOM2));
  assert.equal(recordsContent(store, { boardKey: 'not a key' }).board.key, boardKey(CUSTOM), 'a malformed key falls back');
});

// ---------------------------------------------------------------- figures

test('the figures panel shows the three bests with their dates, games, wins, win rate and streaks', () => {
  const store = fakeStore({ games: [
    game(BEGINNER, { elapsedMs: 52000, endedAt: '2026-10-07T12:00:00.000Z' }),
    game(BEGINNER, { elapsedMs: 47380, endedAt: '2026-10-08T12:00:00.000Z' }),
    game(BEGINNER, { outcome: 'lost', endedAt: '2026-10-09T12:00:00.000Z' }),
    game(BEGINNER, { elapsedMs: 60000, endedAt: '2026-10-09T13:00:00.000Z' }),
  ] });
  const c = recordsContent(store, { boardKey: boardKey(BEGINNER) });
  assert.equal(c.empty, false);
  assert.deepEqual(c.bests.map((b) => b.stat), ['time', 'bbbvPerSecond', 'efficiency']);
  assert.deepEqual(c.bests.map((b) => b.label), ['Best time', 'Best 3BV/s', 'Best efficiency']);
  assert.equal(stat(c.bests, 'time').value, '47.3 s', 'the fastest time, to the tenth, truncated');
  assert.equal(stat(c.bests, 'time').date, formatDate('2026-10-08T12:00:00.000Z'));
  assert.equal(stat(c.bests, 'bbbvPerSecond').value, (20 / 47.38).toFixed(2));
  assert.equal(stat(c.bests, 'efficiency').value, '80%');
  assert.equal(stat(c.bests, 'efficiency').date, formatDate('2026-10-07T12:00:00.000Z'), 'a tie keeps the earlier holder');
  assert.deepEqual(c.counters.map((s) => [s.key, s.value]), [
    ['games', '4'], ['wins', '3'], ['winRate', '75%'], ['currentStreak', '1'], ['longestStreak', '2'],
  ]);
  assert.deepEqual(c.counters.map((s) => s.label), ['Games', 'Wins', 'Win rate', 'Current streak', 'Longest streak']);
});

test("the fastest-time best goes through the results screen's time formatter", () => {
  const store = fakeStore({ games: [game(BEGINNER, { elapsedMs: 47999 })] });
  assert.equal(stat(recordsContent(store).bests, 'time').value, '47.9 s', 'truncated, never rounded');
  const src = read('js/records/screen.js');
  assert.match(src, /import \{[^}]*formatTime[^}]*\} from '\.\.\/results\/view\.js'/, 'the one time formatter is imported');
  assert.doesNotMatch(src, /\/\s*1000|\.toFixed\(1\)|tenths/, 'no second copy of the time format');
});

test('the overall panel shows the Classic 2D totals across every board', () => {
  const store = fakeStore({ games: [game(BEGINNER), game(CUSTOM, { outcome: 'lost' }), game(EXPERT_NG), game(EXPERT_NG)] });
  const c = recordsContent(store, { boardKey: boardKey(CUSTOM) });
  assert.deepEqual(c.overall.map((s) => [s.key, s.value]), [
    ['games', '4'], ['wins', '3'], ['winRate', '75%'], ['currentStreak', '2'], ['longestStreak', '2'],
  ]);
  assert.equal(c.overallTitle, 'Classic 2D overall');
});

test('formats: a date is day, month and year; a win rate a whole percentage; a missing value a dash', () => {
  assert.equal(formatDate('2026-10-09T12:00:00.000Z'), '9 Oct 2026');
  assert.equal(formatDate('2026-01-31T12:00:00.000Z'), '31 Jan 2026');
  assert.equal(formatDate(null), DASH);
  assert.equal(formatDate('garbage'), DASH);
  assert.equal(formatWinRate(2 / 3), '67%');
  assert.equal(formatWinRate(1), '100%');
  assert.equal(formatWinRate(null), DASH);
});

test('a board with no games shows the empty state, and a best not yet set shows a dash', () => {
  const c = recordsContent(fakeStore({ games: [game(CUSTOM)] }), { boardKey: boardKey(BEGINNER) });
  assert.equal(c.empty, true);
  assert.equal(c.emptyText, EMPTY_TEXT);
  assert.deepEqual(c.counters.map((s) => s.value), ['0', '0', DASH, '0', '0']);
  const lostOnly = recordsContent(fakeStore({ games: [game(BEGINNER, { outcome: 'lost' })] }), { boardKey: boardKey(BEGINNER) });
  assert.equal(lostOnly.empty, false);
  assert.deepEqual(lostOnly.bests.map((b) => [b.value, b.date]), [[DASH, DASH], [DASH, DASH], [DASH, DASH]]);
});

test('unreadable records show the empty state over the standard boards and never throw', () => {
  const c = recordsContent(brokenStore(), { boardKey: boardKey(CUSTOM) });
  assert.equal(c.empty, true);
  assert.deepEqual(c.boards.map((b) => b.label).slice(0, 6), STANDARD_LABELS);
  assert.ok(c.overall.every((s) => s.value === '0' || s.value === DASH));
});

test('the not-saving notice is the results screen\'s, carried only when asked', () => {
  const store = fakeStore({ available: false });
  assert.deepEqual(recordsContent(store, { notSaved: true }).notes, [NOTES.notSaved]);
  assert.deepEqual(recordsContent(store).notes, []);
});

// ---------------------------------------------------------------- the screen controller

function fakeView() {
  const shown = [];
  return { shown, hidden: 0, show(c) { shown.push(c); }, hide() { this.hidden++; } };
}

test('the screen subscribes to the store\'s change notification while open and unsubscribes when left', () => {
  const store = fakeStore({ games: [game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  assert.equal(store.subscribed(), 0);
  screen.show({ boardKey: boardKey(BEGINNER) });
  assert.equal(store.subscribed(), 1);
  assert.equal(view.shown.at(-1).counters[0].value, '1');
  store.record(game(BEGINNER));
  assert.equal(view.shown.length, 2, 'a newly recorded game redraws the open screen');
  assert.equal(view.shown.at(-1).counters[0].value, '2');
  assert.equal(view.shown.at(-1).board.key, boardKey(BEGINNER), 'on the same board');
  screen.show({ boardKey: boardKey(BEGINNER) });
  assert.equal(store.subscribed(), 1, 'shown again, still one subscription');
  screen.hide();
  assert.equal(store.subscribed(), 0);
  assert.equal(view.hidden, 1);
  store.record(game(BEGINNER));
  assert.equal(view.shown.length, 3, 'nothing redraws once left');
});

test('choosing a board in the picker shows its figures; a new custom board joins the picker live', () => {
  const store = fakeStore({ games: [game(BEGINNER)] });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show();
  assert.equal(screen.board, boardKey(BEGINNER), 'the last board played');
  screen.select(boardKey(EXPERT_NG));
  assert.equal(view.shown.at(-1).board.key, boardKey(EXPERT_NG));
  assert.equal(view.shown.at(-1).empty, true);
  store.record(game(CUSTOM, { endedAt: '2026-10-09T15:00:00.000Z' }));
  assert.equal(view.shown.at(-1).board.key, boardKey(EXPERT_NG), 'the chosen board stays chosen');
  assert.equal(view.shown.at(-1).boards.at(-1).label, '20 × 12 · 50 mines');
  screen.hide();
  screen.show();
  assert.equal(screen.board, boardKey(CUSTOM), 'opened again without a board: the last board played');
});

test('when records are not being saved the screen says so once', () => {
  const store = fakeStore({ available: false });
  const view = fakeView();
  const screen = createRecordsScreen({ records: store, view });
  screen.show();
  assert.deepEqual(view.shown.at(-1).notes, [NOTES.notSaved]);
  store.record(game(BEGINNER));
  assert.deepEqual(view.shown.at(-1).notes, [NOTES.notSaved], 'kept while this visit lasts');
  screen.hide();
  screen.show();
  assert.deepEqual(view.shown.at(-1).notes, [], 'not told again');
  const saved = createRecordsScreen({ records: fakeStore(), view: fakeView() });
  saved.show();
  assert.equal(RECORDS_SCREEN, 'records');
});

test('unreadable records never block the screen or Back', () => {
  const view = fakeView();
  const screen = createRecordsScreen({ records: brokenStore(), view });
  assert.doesNotThrow(() => screen.show({ boardKey: boardKey(CUSTOM) }));
  assert.equal(view.shown.at(-1).empty, true);
  assert.doesNotThrow(() => screen.hide());
});

test('the view model and controller are DOM-free apart from the view binder', () => {
  const src = read('js/records/screen.js');
  const binder = src.indexOf('export function createRecordsView');
  assert.ok(binder > 0, 'the binder is createRecordsView');
  assert.doesNotMatch(src.slice(0, binder), /document|window/);
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the records screen is the kit composition: picker, figures, overall, empty state, note and Back', () => {
  assert.ok(RECORDS_HTML.length > 400, 'index.html holds #records');
  assert.match(RECORDS_HTML, /^<section id="records" class="overlay hidden"/);
  const classes = [...RECORDS_HTML.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden' || c === 'overlay', `kit class only: ${c}`);
  assert.match(RECORDS_HTML, /class="ui-card ui-screen ui-screen--wide" aria-labelledby="records-title"/);
  assert.match(RECORDS_HTML, /<div id="records-picker" class="ui-segmented" role="radiogroup" aria-label="Board"><\/div>/);
  for (const id of ['records-title', 'records-picker', 'records-figures', 'records-board', 'records-empty', 'records-bests', 'records-counters',
    'rec-time', 'rec-bbbvPerSecond', 'rec-efficiency', 'rec-games', 'rec-wins', 'rec-winRate', 'rec-currentStreak', 'rec-longestStreak',
    'records-overall', 'ro-games', 'ro-wins', 'ro-winRate', 'ro-currentStreak', 'ro-longestStreak', 'records-note', 'records-back']) {
    assert.ok(RECORDS_HTML.includes(`id="${id}"`), `#${id}`);
  }
  const buttons = [...RECORDS_HTML.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
  assert.deepEqual(buttons, ['<button type="button" id="records-back" class="ui-button ui-button--primary">']);
});

test('the shell registers the records screen, its default focus on the picker, its controller layer and Back', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /records: \{ defaultFocus: '#records-picker \[aria-checked="true"\]'/, 'the picker takes default focus');
  assert.doesNotMatch(table.match(/records: \{[^\n]*/)[0], /back:/, 'Back is the back stack');
  assert.match(MAIN, /LAYER_SCREEN = \{[^}]*records: 'records'/, 'the controller reaches the records layer');
  assert.match(MAIN, /BACKDROP_SCREENS = new Set\(\[[^\]]*'records'/);
  assert.match(MAIN, /createRecordsScreen\(\{ records: RECORDS/);
  assert.match(read('css/style.css'), /#settings, #records \{/);
});

test('the catalogue documents the records screen', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?Default focus: the chosen board/);
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

test('in a browser, the menu opens the records screen on the last board played, the picker chooses a board, Back returns', async (t) => {
  const browser = await openBrowser(t);
  if (!browser) return;
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const active = () => page.evaluate(() => document.activeElement?.textContent ?? '');
    const value = (id) => page.evaluate((i) => document.querySelector(`#${i} .ui-stat__value`).textContent, id);
    const visible = (id) => page.evaluate((i) => !document.getElementById(i).classList.contains('hidden'), id);

    // Nothing played: Beginner, its empty state.
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.equal(await visible('records'), true);
    const options = await page.evaluate(() => [...document.querySelectorAll('#records-picker .ui-segmented__option')].map((o) => o.textContent));
    assert.deepEqual(options, STANDARD_LABELS);
    assert.equal(await active(), 'Beginner', 'the picker takes default focus');
    assert.equal(await visible('records-empty'), true);
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');
    assert.equal(await visible('records'), false);

    // Two games recorded: a custom board joins the picker and is the last board played.
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const g = (id, board, elapsedMs, endedAt) => ({ id, board, outcome: 'won', elapsedMs, bbbv: 20, bbbvSolved: 20, clicks,
        bbbvPerSecond: 20 / (elapsedMs / 1000), efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      globalThis.__ms.records.record(g('b1', { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, 47380, '2026-10-08T12:00:00.000Z'));
      globalThis.__ms.records.record(g('c1', { mode: 'classic-2d', grid: 'square', width: 20, height: 12, mines: 50, noGuess: false }, 90000, '2026-10-09T12:00:00.000Z'));
    });
    await page.focus('#menu-entry-records');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'records');
    assert.equal(await active(), '20 × 12 · 50 mines', 'opens on the last board played');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), '20 × 12 · 50 mines');
    assert.equal(await value('rec-time'), '90.0 s');

    // Keyboard: the arrow keys move the choice; the figures follow.
    await page.keyboard.press('ArrowRight');
    assert.equal(await active(), 'Beginner', 'the arrows wrap through every board');
    assert.equal(await value('rec-time'), '47.3 s');
    assert.equal(await value('rec-games'), '1');
    assert.equal(await visible('records-empty'), false);

    // Mouse: an option click chooses it.
    await page.click('#records-picker [data-value="classic-2d:square:30x16:99:no-guess"]');
    assert.equal(await page.evaluate(() => document.getElementById('records-board').textContent), 'Expert · no-guess');
    assert.equal(await visible('records-empty'), true);
    assert.equal(await value('ro-games'), '2', 'the Classic 2D overall figures');

    // Live: a game recorded while the screen is open redraws it.
    await page.click('#records-picker [data-value="classic-2d:square:9x9:10:guess"]');
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      globalThis.__ms.records.record({ id: 'b2', board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false },
        outcome: 'lost', elapsedMs: 3000, bbbv: 20, bbbvSolved: 4, clicks, bbbvPerSecond: 4 / 3, efficiency: 16, seed: 1, generatorVersion: 1,
        endedAt: '2026-10-09T13:00:00.000Z' });
    });
    assert.equal(await value('rec-games'), '2');
    assert.equal(await value('rec-winRate'), '50%');

    await page.click('#records-back');
    assert.equal(await mode(), 'menu', 'the Back button returns to the menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
