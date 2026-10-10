// Records screen's library view (js/records/replay-list.js and its place in js/records/screen.js):
// the chosen board's kept replays from a fake replay library — their row fields, order, pinned-first
// filter and empty state; the Pin / Unpin toggle and the live update through the library's change
// notification; Watch on replays, bests and recent games only once the replay route is registered;
// the told-once notice when replays are not being saved; the markup and the wiring in js/main.js;
// and in a browser the panel's binder — keyboard pinning with focus kept, the filter, Watch, the empty state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  REPLAY_SCREEN, REPLAYS_EMPTY_TEXT, REPLAYS_NOT_SAVED, REPLAY_HEADERS, replayList, pinState, togglePin, watchRoute,
} from '../js/records/replay-list.js';
import { RECORDS_SCREEN, recordsContent, createRecordsScreen, formatDate } from '../js/records/screen.js';
import { createRecordsModel } from '../js/records/model.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { DASH, NOTES } from '../js/results/view.js';
import { PIN_BEST, PIN_HAND } from '../js/replay/library.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

const board = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const BEGINNER = board(9, 9, 10);
const EXPERT = board(30, 16, 99);
const KEY = boardKey(BEGINNER);
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
const game = (id, over = {}) => ({
  id, board: { ...BEGINNER }, outcome: 'won', elapsedMs: 47380, bbbv: 20, bbbvSolved: 20, clicks: clicks(25),
  bbbvPerSecond: 20 / 47.38, efficiency: 80, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T12:00:00.000Z', ...over,
});

function fakeStore(games = []) {
  const model = createRecordsModel();
  for (const g of games) model.record(g);
  const store = { available: () => true, onChange: () => () => {} };
  for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'history', 'overall', 'overallWinRate']) store[q] = (...a) => model[q](...a);
  return store;
}

const listing = (id, over = {}) => ({
  id, boardKey: KEY, mode: 'classic-2d', outcome: 'won', elapsedMs: 47380, bbbvPerSecond: 1.234, efficiency: 79.6,
  endedAt: '2026-10-09T12:00:00.000Z', size: 100, pins: [], ...over,
});

/** A fake replay library: the queries, pin / unpin and change notification of js/replay/library.js. */
function fakeLibrary(entries = [], { available = true } = {}) {
  const map = new Map(entries.map((e) => [e.id, { ...e, pins: [...e.pins] }]));
  const listeners = new Set();
  const calls = [];
  const notify = (change) => { for (const fn of [...listeners]) fn(change); };
  return {
    calls,
    subscribed: () => listeners.size,
    load: () => Promise.resolve(),
    available: () => available,
    has: (id) => map.has(id),
    forBoard: (key) => [...map.values()].filter((e) => e.boardKey === key)
      .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt)).map((e) => Object.freeze({ ...e, pins: Object.freeze([...e.pins]) })),
    async pin(id) {
      calls.push(['pin', id]);
      const e = map.get(id);
      if (!e || e.pins.includes(PIN_HAND)) return;
      e.pins.push(PIN_HAND);
      notify({ kind: 'pin', id });
    },
    async unpin(id) {
      calls.push(['unpin', id]);
      const e = map.get(id);
      if (!e) return;
      e.pins = [];
      notify({ kind: 'unpin', id });
    },
    add(entry) { map.set(entry.id, { ...entry }); notify({ kind: 'add', id: entry.id }); },
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  };
}

function fakeView() {
  const shown = [];
  return { shown, hidden: 0, show(c) { shown.push(c); }, hide() { this.hidden++; } };
}
function fakeRouter(screens = [RECORDS_SCREEN]) {
  const went = [];
  return { went, has: (s) => screens.includes(s), go: (screen, opts) => went.push([screen, opts]) };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- the list model

test('the board\'s kept replays, newest first, with date, outcome, time, 3BV/s, efficiency and pin state', () => {
  const library = fakeLibrary([
    listing('a', { endedAt: '2026-10-01T12:00:00.000Z', outcome: 'lost', pins: [] }),
    listing('b', { endedAt: '2026-10-09T12:00:00.000Z', pins: [PIN_BEST] }),
    listing('c', { endedAt: '2026-10-05T12:00:00.000Z', outcome: 'abandoned', bbbvPerSecond: null, efficiency: null, pins: [PIN_HAND] }),
    listing('x', { boardKey: boardKey(EXPERT) }),
  ]);
  const list = recordsContent(fakeStore(), { boardKey: KEY, replays: library }).replays;
  assert.equal(list.empty, false);
  assert.deepEqual(list.rows.map((r) => r.id), ['b', 'c', 'a'], 'newest first, this board only');
  const [b, c, a] = list.rows;
  assert.equal(b.date, formatDate('2026-10-09T12:00:00.000Z'));
  assert.deepEqual([b.outcome, c.outcome, a.outcome], ['Won', 'Abandoned', 'Lost']);
  assert.equal(b.time, '47.3 s', 'the results screen\'s time, truncated to the tenth');
  assert.equal(b.rate, '1.23');
  assert.equal(b.efficiency, '80%');
  assert.deepEqual([c.rate, c.efficiency], [DASH, DASH], 'a missing stat is a dash');
  assert.deepEqual([b.pinned, c.pinned, a.pinned], [true, true, false]);
  assert.deepEqual([b.pin, c.pin, a.pin], [pinState([PIN_BEST]), pinState([PIN_HAND]), pinState([])]);
  assert.deepEqual([b.action, c.action, a.action], ['unpin', 'unpin', 'pin']);
  assert.deepEqual([b.actionLabel, a.actionLabel], ['Unpin', 'Pin']);
  assert.equal(REPLAY_HEADERS.length, 6);
});

test('a row\'s time goes through the results screen\'s formatter', () => {
  const library = fakeLibrary([listing('t', { elapsedMs: 59999 })]);
  assert.equal(replayList(library, KEY).rows[0].time, '59.9 s', 'truncated, never rounded');
  assert.match(read('js/records/replay-list.js'), /import \{[^}]*formatTime[^}]*\} from '\.\.\/results\/view\.js'/);
});

test('the pin state names its reasons', () => {
  assert.equal(pinState([]), 'Not pinned');
  assert.equal(pinState([PIN_HAND]), 'Pinned');
  assert.equal(pinState([PIN_BEST]), 'Pinned · best');
  assert.equal(pinState([PIN_BEST, PIN_HAND]), 'Pinned · best');
});

test('the pinned-first filter puts pinned replays first, each group newest first', () => {
  const library = fakeLibrary([
    listing('old-pinned', { endedAt: '2026-10-01T12:00:00.000Z', pins: [PIN_HAND] }),
    listing('new', { endedAt: '2026-10-09T12:00:00.000Z' }),
    listing('mid-best', { endedAt: '2026-10-05T12:00:00.000Z', pins: [PIN_BEST] }),
    listing('older', { endedAt: '2026-10-02T12:00:00.000Z' }),
  ]);
  assert.deepEqual(replayList(library, KEY).rows.map((r) => r.id), ['new', 'mid-best', 'older', 'old-pinned']);
  const filtered = replayList(library, KEY, { pinnedFirst: true });
  assert.equal(filtered.pinnedFirst, true);
  assert.deepEqual(filtered.rows.map((r) => r.id), ['mid-best', 'old-pinned', 'new', 'older']);
});

test('no kept replay is the empty state; a missing or broken library never throws', () => {
  const none = replayList(fakeLibrary([listing('x', { boardKey: boardKey(EXPERT) })]), KEY);
  assert.deepEqual([none.empty, none.rows, none.emptyText], [true, [], REPLAYS_EMPTY_TEXT]);
  assert.equal(replayList(null, KEY).empty, true);
  const broken = { forBoard: () => { throw new Error('broken'); }, has: () => false };
  assert.equal(replayList(broken, KEY).empty, true);
});

test('Watch is offered only when watching is possible', () => {
  const library = fakeLibrary([listing('a')]);
  assert.equal(replayList(library, KEY).rows[0].watch, false);
  assert.equal(replayList(library, KEY, { canWatch: true }).rows[0].watch, true);
});

// ---------------------------------------------------------------- pin toggle

test('Pin / Unpin toggles the hand pin', async () => {
  const library = fakeLibrary([listing('a'), listing('b', { pins: [PIN_BEST] })]);
  const [a] = replayList(library, KEY).rows.filter((r) => r.id === 'a');
  await togglePin(library, a);
  assert.deepEqual(library.calls.at(-1), ['pin', 'a']);
  assert.equal(replayList(library, KEY).rows.find((r) => r.id === 'a').pinned, true);
  const b = replayList(library, KEY).rows.find((r) => r.id === 'b');
  await togglePin(library, b);
  assert.deepEqual(library.calls.at(-1), ['unpin', 'b']);
  assert.equal(replayList(library, KEY).rows.find((r) => r.id === 'b').pinned, false);
});

test('the screen toggles a pin and redraws through the library\'s change notification', async () => {
  const library = fakeLibrary([listing('a'), listing('b', { endedAt: '2026-10-01T12:00:00.000Z' })]);
  const view = fakeView();
  const screen = createRecordsScreen({ records: fakeStore(), view, replays: library });
  assert.equal(library.subscribed(), 0);
  screen.show({ boardKey: KEY });
  assert.equal(library.subscribed(), 1, 'subscribed while open');
  const drawn = view.shown.length;
  await screen.togglePin('b');
  assert.deepEqual(library.calls, [['pin', 'b']]);
  assert.equal(view.shown.length, drawn + 1, 'the change notification redraws');
  assert.equal(view.shown.at(-1).replays.rows.find((r) => r.id === 'b').pinned, true);
  screen.setPinnedFirst(true);
  assert.deepEqual(view.shown.at(-1).replays.rows.map((r) => r.id), ['b', 'a'], 'the filter redraws, pinned first');
  await screen.togglePin('b');
  assert.deepEqual(library.calls.at(-1), ['unpin', 'b']);
  assert.equal(view.shown.at(-1).replays.rows.find((r) => r.id === 'b').pinned, false);
  await screen.togglePin('nope');
  assert.equal(library.calls.length, 2, 'an id not listed changes nothing');
  screen.hide();
  assert.equal(library.subscribed(), 0, 'unsubscribed when left');
  const before = view.shown.length;
  library.add(listing('c'));
  assert.equal(view.shown.length, before, 'nothing redraws once left');
});

test('a replay added while the screen is open joins the list', () => {
  const library = fakeLibrary([]);
  const view = fakeView();
  const screen = createRecordsScreen({ records: fakeStore(), view, replays: library });
  screen.show({ boardKey: KEY });
  assert.equal(view.shown.at(-1).replays.empty, true);
  library.add(listing('n'));
  assert.deepEqual(view.shown.at(-1).replays.rows.map((r) => r.id), ['n']);
});

// ---------------------------------------------------------------- watch

test('without a replay route there is no Watch anywhere', () => {
  const store = fakeStore([game('g1')]);
  const library = fakeLibrary([listing('g1')]);
  const view = fakeView();
  const router = fakeRouter();
  const screen = createRecordsScreen({ records: store, view, replays: library, router });
  screen.show({ boardKey: KEY });
  const c = view.shown.at(-1);
  assert.equal(c.canWatch, false);
  assert.equal(c.replays.rows[0].watch, false);
  assert.equal(c.bests.find((b) => b.stat === 'time').watch, null);
  assert.equal(c.games.rows[0].watch, null);
  screen.watch('g1');
  assert.deepEqual(router.went, [], 'Watch does nothing before the route is registered');
});

test('with the replay route, Watch shows on the bests and recent games whose replay is kept', () => {
  const store = fakeStore([
    game('g1', { endedAt: '2026-10-01T12:00:00.000Z', elapsedMs: 30000 }),
    game('g2', { endedAt: '2026-10-02T12:00:00.000Z', elapsedMs: 40000, efficiency: 95, clicks: clicks(21) }),
    game('g3', { endedAt: '2026-10-03T12:00:00.000Z', outcome: 'lost', bbbvSolved: 5 }),
  ]);
  const library = fakeLibrary([listing('g1', { endedAt: '2026-10-01T12:00:00.000Z' }), listing('g3', { endedAt: '2026-10-03T12:00:00.000Z' })]);
  const c = recordsContent(store, { boardKey: KEY, replays: library, canWatch: true });
  assert.equal(c.canWatch, true);
  assert.equal(c.bests.find((b) => b.stat === 'time').watch, 'g1', 'the best time\'s replay is kept');
  assert.equal(c.bests.find((b) => b.stat === 'efficiency').watch, null, 'the best efficiency\'s replay is not kept');
  assert.deepEqual(c.games.rows.map((r) => [r.id, r.watch]), [['g3', 'g3'], ['g2', null], ['g1', 'g1']]);
  assert.deepEqual(c.replays.rows.map((r) => r.watch), [true, true]);
});

test('Watch routes to the replay viewer with the replay id and the Records screen to return to', () => {
  const library = fakeLibrary([listing('a')]);
  const view = fakeView();
  const router = fakeRouter([RECORDS_SCREEN, REPLAY_SCREEN]);
  const screen = createRecordsScreen({ records: fakeStore(), view, replays: library, router });
  screen.show({ boardKey: KEY });
  assert.equal(view.shown.at(-1).canWatch, true);
  screen.watch('a');
  assert.deepEqual(router.went, [[REPLAY_SCREEN, { data: { replayId: 'a', returnTo: { screen: RECORDS_SCREEN, data: { boardKey: KEY } } } }]]);
  assert.deepEqual(watchRoute('a', { screen: RECORDS_SCREEN, data: { boardKey: KEY } }),
    { screen: REPLAY_SCREEN, data: { replayId: 'a', returnTo: { screen: RECORDS_SCREEN, data: { boardKey: KEY } } } });
});

// ---------------------------------------------------------------- not saved

test('when replays are not being saved this session the screen says so once', async () => {
  const library = fakeLibrary([], { available: false });
  const view = fakeView();
  const screen = createRecordsScreen({ records: fakeStore(), view, replays: library });
  screen.show({ boardKey: KEY });
  await flush();
  assert.deepEqual(view.shown.at(-1).notes, [REPLAYS_NOT_SAVED]);
  library.add(listing('a'));
  assert.deepEqual(view.shown.at(-1).notes, [REPLAYS_NOT_SAVED], 'kept while this visit lasts');
  screen.hide();
  screen.show({ boardKey: KEY });
  await flush();
  assert.deepEqual(view.shown.at(-1).notes, [], 'not told again');

  const both = fakeView();
  const told = createRecordsScreen({ records: { ...fakeStore(), available: () => false }, view: both, replays: fakeLibrary([], { available: false }) });
  told.show();
  await flush();
  assert.deepEqual(both.shown.at(-1).notes, [NOTES.notSaved, REPLAYS_NOT_SAVED], 'records and replays each say so');

  const saved = fakeView();
  createRecordsScreen({ records: fakeStore(), view: saved, replays: fakeLibrary() }).show();
  await flush();
  assert.deepEqual(saved.shown.at(-1).notes, []);
});

test('a screen left before the library loads is not told', async () => {
  let release;
  const loaded = new Promise((r) => { release = r; });
  const library = { ...fakeLibrary([], { available: false }), load: () => loaded };
  const view = fakeView();
  const screen = createRecordsScreen({ records: fakeStore(), view, replays: library });
  screen.show();
  screen.hide();
  const drawn = view.shown.length;
  release();
  await flush();
  assert.equal(view.shown.length, drawn, 'nothing draws on a screen already left');
  screen.show();
  await flush();
  assert.deepEqual(view.shown.at(-1).notes, [REPLAYS_NOT_SAVED], 'told on the next visit');
});

// ---------------------------------------------------------------- source, markup and wiring

test('the list model is DOM-free apart from its view binder', () => {
  const src = read('js/records/replay-list.js');
  const binder = src.indexOf('export function createReplayListView');
  assert.ok(binder > 0, 'the binder is createReplayListView');
  assert.doesNotMatch(src.slice(0, binder), /\bdocument\b|\bwindow\b/);
});

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const RECORDS_HTML = INDEX.slice(INDEX.indexOf('<section id="records"'), INDEX.indexOf('<!-- /Records -->'));

test('the records screen holds the replays panel: heading, pinned-first toggle, empty state and list', () => {
  const panel = RECORDS_HTML.slice(RECORDS_HTML.indexOf('<div id="records-replays"'), RECORDS_HTML.indexOf('<div id="records-overall"'));
  assert.ok(panel.length > 100, 'the replays panel sits before the overall figures');
  assert.match(panel, /^<div id="records-replays" class="ui-panel" role="group" aria-labelledby="records-replays-title">/);
  assert.match(panel, /<h3 class="ui-heading" id="records-replays-title">Replays<\/h3>/);
  assert.match(panel, /<label class="ui-toggle"><input type="checkbox" role="switch" id="records-pinned-first" class="ui-toggle__input"><span class="ui-toggle__label">Pinned first<\/span><\/label>/);
  assert.match(panel, new RegExp(`<p id="records-replays-empty" class="ui-text ui-text--muted hidden">${REPLAYS_EMPTY_TEXT}</p>`));
  assert.match(panel, /<tbody id="records-replays-body"><\/tbody>/);
  for (const h of REPLAY_HEADERS) assert.ok(panel.includes(`<th scope="col">${h}</th>`), `header ${h}`);
});

test('the shell hands the records screen the replay library and the router, and reports replays not saved', () => {
  assert.match(MAIN, /createRecordsScreen\(\{ records: RECORDS, replays: REPLAYS, router: SHELL,/);
  assert.match(MAIN, /createReplayLibrary\(\{\s*storage,\s*blobStore,\s*onNotSaved:/);
  assert.match(MAIN, /onWatch: \(id\) => RECORDS_PAGE\.watch\(id\)/);
  assert.match(MAIN, /onTogglePin: \(id\) => RECORDS_PAGE\.togglePin\(id\)/);
  assert.match(MAIN, /onPinnedFirst: \(on\) => RECORDS_PAGE\.setPinnedFirst\(on\)/);
});

test('the catalogue documents the replays panel', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Records \(index\.html #records\)[\s\S]*?replays[\s\S]*?Default focus: the chosen board/);
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

test('in a browser, the replays panel lists, pins by keyboard keeping focus, filters, watches and shows its empty state', async (t) => {
  const browser = await openBrowser(t);
  if (!browser) return;
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    // A copy of the #records markup, bound to a screen over a fake library and a router with the replay route.
    await page.evaluate(async (key) => {
      const { createRecordsScreen, createRecordsView } = await import('/js/records/screen.js');
      const { createRecordsModel } = await import('/js/records/model.js');
      const real = document.getElementById('records');
      const root = real.cloneNode(true);
      root.id = 'records-test';
      document.body.append(root);
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const model = createRecordsModel();
      model.record({ id: 'a', board: { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }, outcome: 'won',
        elapsedMs: 47380, bbbv: 20, bbbvSolved: 20, clicks, bbbvPerSecond: 20 / 47.38, efficiency: 80, seed: 1, generatorVersion: 1,
        endedAt: '2026-10-09T12:00:00.000Z' });
      const records = { available: () => true, onChange: () => () => {} };
      for (const q of ['boardsPlayed', 'bests', 'counters', 'winRate', 'history', 'overall', 'overallWinRate']) records[q] = (...a) => model[q](...a);
      const entries = new Map([
        ['a', { id: 'a', boardKey: key, mode: 'classic-2d', outcome: 'won', elapsedMs: 47380, bbbvPerSecond: 0.42, efficiency: 80, endedAt: '2026-10-09T12:00:00.000Z', size: 9, pins: [] }],
        ['b', { id: 'b', boardKey: key, mode: 'classic-2d', outcome: 'lost', elapsedMs: 12000, bbbvPerSecond: 0.5, efficiency: 50, endedAt: '2026-10-01T12:00:00.000Z', size: 9, pins: [] }],
      ]);
      const listeners = new Set();
      const notify = (c) => { for (const fn of [...listeners]) fn(c); };
      const library = {
        load: () => Promise.resolve(), available: () => true, has: (id) => entries.has(id),
        forBoard: (k) => [...entries.values()].filter((e) => e.boardKey === k).sort((x, y) => Date.parse(y.endedAt) - Date.parse(x.endedAt)),
        async pin(id) { entries.get(id).pins = ['hand']; notify({ kind: 'pin', id }); },
        async unpin(id) { entries.get(id).pins = []; notify({ kind: 'unpin', id }); },
        onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
      };
      const went = [];
      const router = { has: (s) => s === 'replay' || s === 'records', go: (s, o) => went.push([s, o]) };
      const screen = createRecordsScreen({ records, replays: library, router,
        view: createRecordsView({
          root, onSelect: (k) => screen.select(k), onPage: (p) => screen.showPage(p), onBack: () => {},
          onWatch: (id) => screen.watch(id), onTogglePin: (id) => screen.togglePin(id), onPinnedFirst: (on) => screen.setPinnedFirst(on),
        }),
      });
      globalThis.__t = { screen, went };
      screen.show({ boardKey: key });
    }, KEY);
    const T = '#records-test';
    const rows = () => page.evaluate((s) => [...document.querySelectorAll(`${s} #records-replays-body tr`)].map((r) => [...r.cells].map((c) => c.textContent)), T);
    const active = () => page.evaluate(() => ({ ...document.activeElement?.dataset }));

    let r = await rows();
    assert.deepEqual(r.map((c) => c.slice(1, 6)), [['Won', '47.3 s', '0.42', '80%', 'Not pinned'], ['Lost', '12.0 s', '0.50', '50%', 'Not pinned']], 'newest first');
    assert.deepEqual(r.map((c) => c[6]), ['WatchPin', 'WatchPin']);
    assert.equal(await page.evaluate((s) => document.querySelector(`${s} #records-replays-empty`).classList.contains('hidden'), T), true);

    // Keyboard: Pin flips to Unpin and focus stays on that replay's button.
    await page.focus(`${T} #records-replays-body button[data-act="pin"][data-id="b"]`);
    await page.keyboard.press('Enter');
    await page.waitForFunction((s) => document.querySelector(`${s} #records-replays-body button[data-act="pin"][data-id="b"]`)?.textContent === 'Unpin', T);
    assert.deepEqual(await active(), { id: 'b', act: 'pin' }, 'focus stays on the replay\'s Pin / Unpin button');
    assert.equal((await rows())[1][5], 'Pinned');

    // The Pinned first switch reorders the list.
    await page.focus(`${T} #records-pinned-first`);
    await page.keyboard.press('Space');
    await page.waitForFunction((s) => document.querySelector(`${s} #records-replays-body tr td`)?.textContent !== '9 Oct 2026', T);
    assert.deepEqual((await rows()).map((c) => c[1]), ['Lost', 'Won'], 'pinned first');

    // Watch on a replay, on a best and on a recent game routes with the id and the Records screen to return to.
    await page.click(`${T} #records-replays-body button[data-act="watch"][data-id="a"]`);
    await page.click(`${T} #rec-time [data-watch="a"]`);
    await page.click(`${T} #records-games-body [data-watch="a"]`);
    const went = await page.evaluate(() => globalThis.__t.went);
    const route = ['replay', { data: { replayId: 'a', returnTo: { screen: 'records', data: { boardKey: KEY } } } }];
    assert.deepEqual(went, [route, route, route]);
    assert.equal(await page.evaluate((s) => document.querySelector(`${s} #records-games-replay`).classList.contains('hidden'), T), false, 'the Replay column shows');

    // A board with no kept replay shows the empty state and hides the table.
    await page.evaluate(() => globalThis.__t.screen.select('classic-2d:square:30x16:99:guess'));
    assert.deepEqual(await page.evaluate((s) => [
      document.querySelector(`${s} #records-replays-empty`).classList.contains('hidden'),
      document.querySelector(`${s} #records-replays-table`).classList.contains('hidden'),
    ], T), [false, true]);
    assert.deepEqual(errors, []);
  } finally {
    server.close();
    await browser.close();
  }
});
