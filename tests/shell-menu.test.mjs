import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MENU_ENTRIES, PLACEHOLDER_SCREEN, LAST_MODE_DOC, LAST_MODE_VERSION, UNAVAILABLE_REASONS, WEB_MISSING, COMING_SOON, entryRoute, entryReason,
  createMenu, createLastMode, openingEntry, menuPreview, buildLabel, DEMO_BOARD_3D,
} from '../js/shell/menu.js';
import { VERSION } from '../js/version.js';
import { demoBoard2D, dailyBoard2D, bindMenuPreview } from '../js/shell/menu-preview.js';
import { dailyPreview } from '../js/shell/daily.js';
import { dailyGame, dateText } from '../js/records/board-code.js';
import { createModeHost } from '../js/shell/mode-host.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A fake mode for the host: `click()` reports the first click the way a board would.
function fakeMode() {
  let report = null;
  const calls = [];
  const mode = {
    openBoardChoice() { calls.push('openBoardChoice'); },
    start() { calls.push('start'); },
    pause() {}, resume() {}, restart() {}, leave() { calls.push('leave'); },
    summary() { return { mode: 'fake', outcome: 'abandoned' }; },
  };
  return { factory: (r) => { report = r; return mode; }, calls, click: () => report.started() };
}
function fakeRouter(names) {
  const went = [];
  return { went, has: (n) => names.includes(n), go: (name, opts) => { went.push([name, opts?.data]); } };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

// ---------------------------------------------------------------- entries and routes

test('the main menu has nine entries in three blocks: the five modes; Daily, Records and Settings; Quit — and no Leaderboards', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.label), ['Classic 2D', 'Hexagon', 'Triangle', 'Surface', '3D', 'Daily', 'Records', 'Settings', 'Quit']);
  assert.deepEqual(MENU_ENTRIES.map((e) => e.id), ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily', 'records', 'settings', 'quit']);
  assert.deepEqual(MENU_ENTRIES.map((e) => e.block), [0, 0, 0, 0, 0, 1, 1, 1, 2]);
  assert.ok(Object.isFrozen(MENU_ENTRIES) && MENU_ENTRIES.every(Object.isFrozen));
  assert.deepEqual(MENU_ENTRIES.map((e) => e.mode ?? null), ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', null, null, null, null], 'each mode entry names its mode');
  assert.deepEqual(MENU_ENTRIES.map((e) => e.screen ?? null), [null, null, null, null, null, 'daily', 'records', 'settings', null]);
  assert.ok(!MENU_ENTRIES.some((e) => /leaderboard/i.test(e.id + e.label)), 'Leaderboards is a Records tab, not an entry');
});

test('Hexagon, Triangle and Surface are enabled and open the placeholder titled with their mode until the mode is registered', () => {
  const all = { hasMode: (m) => ['classic-2d', '3d'].includes(m), hasScreen: () => true };
  for (const [id, title] of [['hexagon', 'Hexagon'], ['triangle', 'Triangle'], ['surface', 'Surface']]) {
    const entry = MENU_ENTRIES.find((e) => e.id === id);
    assert.equal(entryReason(entry, [...WEB_MISSING]), null, `${title} is enabled`);
    assert.deepEqual(entryRoute(entry, { ...all, missing: [...WEB_MISSING] }), { screen: PLACEHOLDER_SCREEN, data: { entry: id, title } });
  }
});

test('Quit is the desktop build\'s: on the web it is disabled with its reason and opens nothing', () => {
  const quit = MENU_ENTRIES.find((e) => e.id === 'quit');
  assert.deepEqual(WEB_MISSING, ['desktop']);
  assert.ok(Object.isFrozen(WEB_MISSING));
  assert.equal(UNAVAILABLE_REASONS.desktop, 'Desktop build only');
  assert.equal(entryReason(quit, WEB_MISSING), 'Desktop build only');
  assert.equal(entryRoute(quit, { hasMode: () => true, hasScreen: () => true, missing: WEB_MISSING }), null);
  const router = fakeRouter(['menu', 'coming-soon']);
  const menu = createMenu({ router, modes: createModeHost(), missing: WEB_MISSING });
  assert.equal(menu.open('quit'), null);
  assert.deepEqual(router.went, [], 'Quit opens nothing on the web');
});

test('the menu opens on the last mode played; the first entry when nothing was played or that entry cannot open here', () => {
  assert.equal(openingEntry(null), 'classic-2d', 'nothing played: the first entry');
  assert.equal(openingEntry('3d'), '3d');
  assert.equal(openingEntry('classic-2d', { missing: ['desktop', 'webgl2'] }), 'classic-2d');
  assert.equal(openingEntry('3d', { missing: ['desktop', 'webgl2'] }), 'classic-2d', '3D without WebGL 2: the first enabled entry');
  assert.equal(openingEntry('records'), 'classic-2d', 'not a mode');
  const entries = [{ id: 'a', mode: 'a', needs: 'webgl2' }, { id: 'b', mode: 'b' }];
  assert.equal(openingEntry(null, { entries, missing: ['webgl2'] }), 'b', 'the first enabled entry, not the first entry');
});

test('the preview of each entry: the Classic 2D board, the 3D scene or its static panel, the daily board, a badge with its note', () => {
  const web = { missing: ['desktop'], hasMode: (m) => ['classic-2d', '3d'].includes(m) };
  assert.deepEqual(menuPreview('classic-2d', web), { kind: 'board', tag: 'Classic 2D · Intermediate' });
  assert.deepEqual(menuPreview('3d', web), { kind: 'scene', tag: '3D · Demo board 7 × 7 × 7' });
  assert.deepEqual(menuPreview('3d', { ...web, missing: ['desktop', 'webgl2'] }), { kind: 'still', tag: '3D' }, 'no WebGL 2: the static themed background');
  assert.deepEqual(menuPreview('daily', web), { kind: 'daily' });
  for (const [id, label] of [['hexagon', 'Hexagon'], ['triangle', 'Triangle'], ['surface', 'Surface']]) {
    assert.deepEqual(menuPreview(id, web), { kind: 'badge', entry: id, label, note: COMING_SOON, locked: false });
  }
  assert.equal(COMING_SOON, 'Coming soon');
  assert.deepEqual(menuPreview('records', web), { kind: 'badge', entry: 'records', label: 'Records', note: null, locked: false }, 'a place: its badge alone');
  assert.deepEqual(menuPreview('settings', web), { kind: 'badge', entry: 'settings', label: 'Settings', note: null, locked: false });
  assert.deepEqual(menuPreview('quit', web), { kind: 'badge', entry: 'quit', label: 'Quit', note: 'Desktop build only', locked: true });
  assert.throws(() => menuPreview('campaign'), /unknown menu entry/);
});

test('the Classic 2D preview is a real engine board, the same on every load; the daily preview is today\'s Expert, closed, its start cell marked', () => {
  const a = demoBoard2D();
  const b = demoBoard2D();
  assert.deepEqual([a.grid.width, a.grid.height, a.game.mineCount], [16, 16, 40], 'Intermediate');
  const states = (g) => Array.from({ length: 256 }, (_, c) => `${g.cellState(c)}${g.cellNumber(c)}`).join();
  assert.equal(states(a.game), states(b.game), 'the same board each time');
  const revealed = Array.from({ length: 256 }, (_, c) => a.game.cellState(c)).filter((x) => x === 'revealed').length;
  assert.ok(revealed > 10 && revealed < 200, `an opening revealed (${revealed} cells)`);
  assert.ok(Array.from({ length: 256 }, (_, c) => a.game.cellState(c)).includes('flagged'), 'a few flags');
  assert.equal(a.game.phase, 'playing', 'a game in progress');

  const now = new Date(2026, 9, 16, 9, 30);
  const daily = dailyPreview(now);
  const expert = dailyGame('expert', dateText(now));
  assert.deepEqual(daily, { board: expert.board, startCell: expert.startCell, date: '20261016', dateLabel: '16 Oct 2026', tag: 'Daily · 16 Oct 2026' });
  const d = dailyBoard2D(daily);
  assert.deepEqual([d.grid.width, d.grid.height, d.game.mineCount], [30, 16, 99]);
  assert.equal(d.mark, expert.startCell, 'the marked start cell');
  assert.ok(Array.from({ length: 480 }, (_, c) => d.game.cellState(c)).every((x) => x === 'closed'), 'closed');
});

/** Stub elements enough for bindMenuPreview. */
function stubDoc() {
  const make = (tag) => {
    const el = {
      tagName: tag, children: [], dataset: {}, attrs: {}, hidden: false, textContent: '', className: '',
      classes: new Set(),
      classList: { toggle: (c, on) => { if (on) el.classes.add(c); else el.classes.delete(c); }, contains: (c) => el.classes.has(c) },
      append: (...xs) => { el.children.push(...xs); },
      replaceChildren: (...xs) => { el.children = [...xs]; },
      setAttribute: (k, v) => { el.attrs[k] = v; },
      cloneNode: () => ({ cloned: el }),
    };
    return el;
  };
  const doc = { createElement: make };
  const panel = make('figure');
  panel.ownerDocument = doc;
  return { panel, stage: make('div'), tag: make('figcaption') };
}

test('the preview binder shows each preview: a board view mounted once per board, the live panel only for the 3D scene, a card with badge, name and note', () => {
  const { panel, stage, tag } = stubDoc();
  const mounts = [];
  const boards = { board: { key: 'demo', grid: { width: 16, height: 16 }, game: 'demo-game' }, daily: { key: '20261016', grid: { width: 30, height: 16 }, game: 'daily-game', mark: 7 } };
  const preview = bindMenuPreview({
    panel, stage, tag,
    iconOf: (entry) => ({ cloneNode: () => `icon:${entry}` }),
    mountBoard: ({ container, grid }) => {
      const view = { container, grid, games: [], marks: [], setGame: (g) => view.games.push(g), setMark: (m) => view.marks.push(m) };
      mounts.push(view);
      return view;
    },
    boardOf: (kind) => boards[kind],
  });
  const layer = (kind) => stage.children.find((c) => c.dataset.preview === kind);
  const shownLayers = () => stage.children.filter((c) => !c.hidden).map((c) => c.dataset.preview);

  preview.show({ kind: 'board', tag: 'Classic 2D · Intermediate' });
  assert.equal(tag.textContent, 'Classic 2D · Intermediate');
  assert.equal(panel.classList.contains('ui-scene-panel--live'), false);
  assert.equal(mounts.length, 1);
  assert.deepEqual([mounts[0].container, mounts[0].grid, mounts[0].games, mounts[0].marks], [layer('board'), boards.board.grid, ['demo-game'], [-1]]);
  assert.deepEqual(shownLayers(), ['board']);

  preview.show({ kind: 'scene', tag: '3D · Demo board 7 × 7 × 7' });
  assert.equal(panel.classList.contains('ui-scene-panel--live'), true, 'the 3D scene draws through the panel');
  assert.deepEqual(shownLayers(), [], 'nothing of the page over it');

  preview.show({ kind: 'daily', tag: 'Daily · 16 Oct 2026' });
  assert.equal(panel.classList.contains('ui-scene-panel--live'), false);
  assert.deepEqual([mounts.length, mounts[1].grid, mounts[1].games, mounts[1].marks], [2, boards.daily.grid, ['daily-game'], [7]], 'the daily board, its start cell marked');
  assert.deepEqual(shownLayers(), ['daily']);

  preview.show({ kind: 'board', tag: 'Classic 2D · Intermediate' });
  assert.equal(mounts.length, 2, 'each board view is mounted once');
  assert.deepEqual(mounts[0].games, ['demo-game'], 'an unchanged board is not handed over again');
  boards.daily = { ...boards.daily, key: '20261017', game: 'tomorrow' };
  preview.show({ kind: 'daily', tag: 'Daily · 17 Oct 2026' });
  assert.deepEqual(mounts[1].games, ['daily-game', 'tomorrow'], 'a new day\'s board replaces the old one');

  preview.show({ kind: 'badge', entry: 'quit', label: 'Quit', note: 'Desktop build only', locked: true });
  assert.deepEqual(shownLayers(), ['card']);
  const [card] = layer('card').children;
  assert.equal(card.className, 'ui-scene-panel__card');
  const [badge, name, note] = card.children;
  assert.deepEqual([badge.className, badge.dataset, badge.attrs['aria-hidden'], badge.children], ['ui-scene-panel__badge', { entry: 'quit', unavailable: '' }, 'true', ['icon:quit']]);
  assert.deepEqual([name.className, name.textContent, note.className, note.textContent], ['ui-scene-panel__name', 'Quit', 'ui-scene-panel__note', 'Desktop build only']);
  assert.equal(tag.textContent, 'Quit', 'the figure keeps its name');
  assert.equal(tag.classes.has('hidden'), true, 'a card shows no tag');
  preview.show({ kind: 'badge', entry: 'records', label: 'Records', note: null, locked: false });
  assert.equal(layer('card').children[0].children.length, 2, 'a place: badge and name, no note');
  assert.deepEqual(layer('card').children[0].children[0].dataset, { entry: 'records' });
  assert.deepEqual(preview.shown, { kind: 'badge', entry: 'records', label: 'Records', note: null, locked: false });
});

test('a mode entry opens its mode\'s board choice once the mode is registered', () => {
  const entry = MENU_ENTRIES.find((e) => e.id === '3d');
  assert.deepEqual(entryRoute(entry, { hasMode: (m) => m === '3d', hasScreen: () => false }), { mode: '3d' });
});

test('an entry whose feature has not landed routes to the one shared placeholder screen', () => {
  const none = { hasMode: () => false, hasScreen: () => false };
  for (const entry of MENU_ENTRIES) {
    assert.deepEqual(entryRoute(entry, none), { screen: PLACEHOLDER_SCREEN, data: { entry: entry.id, title: entry.label } },
      `${entry.label} goes to the placeholder`);
  }
  assert.equal(PLACEHOLDER_SCREEN, 'coming-soon');
});

test('a screen entry routes to its screen once the router has it', () => {
  const entry = MENU_ENTRIES.find((e) => e.id === 'records');
  assert.deepEqual(entryRoute(entry, { hasMode: () => false, hasScreen: (s) => s === 'records' }), { screen: 'records' });
});

test('opening an entry asks the mode host for a board choice, or routes through the router', () => {
  const modes = createModeHost();
  const three = fakeMode();
  modes.register('3d', three.factory);
  const router = fakeRouter(['menu', 'coming-soon', 'settings']);
  const menu = createMenu({ router, modes });
  menu.open('3d');
  assert.deepEqual(three.calls, ['openBoardChoice'], '3D opens the 3D board choice');
  assert.equal(modes.active, null, 'opening a board choice starts no game');
  menu.open('classic-2d');
  menu.open('hexagon');
  menu.open('daily');
  menu.open('records');
  menu.open('settings');
  assert.deepEqual(router.went, [
    ['coming-soon', { entry: 'classic-2d', title: 'Classic 2D' }],
    ['coming-soon', { entry: 'hexagon', title: 'Hexagon' }],
    ['coming-soon', { entry: 'daily', title: 'Daily' }],
    ['coming-soon', { entry: 'records', title: 'Records' }],
    ['settings', undefined],
  ]);
  assert.throws(() => menu.open('campaign'), /unknown menu entry/);
});

// ---------------------------------------------------------------- an entry the browser cannot run

test('the 3D entry needs WebGL 2; without it the entry is unavailable with its reason and routes nowhere', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.needs ?? null), [null, null, null, null, 'webgl2', null, null, null, 'desktop'], 'only 3D needs WebGL 2');
  assert.equal(UNAVAILABLE_REASONS.webgl2, 'Needs WebGL 2 — not available in this browser');
  assert.ok(Object.isFrozen(UNAVAILABLE_REASONS));
  const all = { hasMode: () => true, hasScreen: () => true };
  const three = MENU_ENTRIES.find((e) => e.id === '3d');
  assert.equal(entryReason(three, ['webgl2']), UNAVAILABLE_REASONS.webgl2);
  assert.equal(entryReason(three, []), null, 'with WebGL 2 the entry is available');
  assert.equal(entryReason(three), null, 'nothing missing by default');
  assert.equal(entryRoute(three, { ...all, missing: ['webgl2'] }), null, 'an unavailable entry routes nowhere');
  assert.deepEqual(entryRoute(three, all), { mode: '3d' });
  for (const entry of MENU_ENTRIES.filter((e) => e.id !== '3d' && e.id !== 'quit')) {
    assert.equal(entryReason(entry, ['webgl2']), null, `${entry.label} runs without WebGL 2`);
    assert.notEqual(entryRoute(entry, { ...all, missing: ['webgl2'] }), null);
  }
});

test('the menu over a browser without WebGL 2 carries the 3D entry\'s reason, opens nothing for it, and the other entries still route', () => {
  const modes = createModeHost();
  const fakes = { '3d': fakeMode(), 'classic-2d': fakeMode() };
  for (const [id, f] of Object.entries(fakes)) modes.register(id, f.factory);
  const router = fakeRouter(['menu', 'coming-soon', 'records', 'settings']);
  const menu = createMenu({ router, modes, missing: ['webgl2'] });
  assert.equal(menu.unavailable('3d'), UNAVAILABLE_REASONS.webgl2);
  assert.deepEqual(MENU_ENTRIES.filter((e) => menu.unavailable(e.id)).map((e) => e.id), ['3d'], 'only 3D is unavailable');
  const web = createMenu({ router, modes, missing: [...WEB_MISSING, 'webgl2'] });
  assert.deepEqual(MENU_ENTRIES.filter((e) => web.unavailable(e.id)).map((e) => e.id), ['3d', 'quit'], 'on the web Quit too');
  assert.equal(menu.route('3d'), null);
  assert.equal(menu.open('3d'), null, 'opening it routes nowhere');
  assert.deepEqual(fakes['3d'].calls, [], 'the 3D board choice is not opened');
  assert.deepEqual(router.went, []);
  assert.deepEqual(menu.open('classic-2d'), { mode: 'classic-2d' });
  assert.deepEqual(fakes['classic-2d'].calls, ['openBoardChoice']);
  menu.open('records');
  menu.open('settings');
  assert.deepEqual(router.went, [['records', undefined], ['settings', undefined]]);
  const full = createMenu({ router, modes });
  assert.equal(full.unavailable('3d'), null, 'with WebGL 2 every entry is available');
  full.open('3d');
  assert.deepEqual(fakes['3d'].calls, ['openBoardChoice']);
  assert.throws(() => menu.unavailable('campaign'), /unknown menu entry/);
});

// ---------------------------------------------------------------- the last mode played

test('the last mode played is a platform-storage document registered at version 1', () => {
  assert.equal(LAST_MODE_DOC, 'shell.lastMode');
  assert.equal(LAST_MODE_VERSION, 1);
  const storage = createStorage({ backend: createMemoryBackend() });
  createLastMode({ storage, modes: createModeHost() });
  assert.throws(() => storage.register(LAST_MODE_DOC, 1), /already registered/, 'the document is registered');
});

test('a game started in any mode records that mode', async () => {
  const backend = createMemoryBackend();
  const storage = createStorage({ backend });
  const modes = createModeHost();
  const fakes = { '3d': fakeMode(), 'classic-2d': fakeMode() };
  for (const [id, f] of Object.entries(fakes)) modes.register(id, f.factory);
  const last = createLastMode({ storage, modes });
  assert.equal(last.current, null);

  modes.start('3d', {});
  fakes['3d'].click();
  await settle();
  assert.equal(last.current, '3d');
  assert.deepEqual(JSON.parse(backend.documents.get(LAST_MODE_DOC)), { version: 1, data: { mode: '3d' } });

  modes.start('classic-2d', {});
  fakes['classic-2d'].click();
  await settle();
  assert.equal(last.current, 'classic-2d');
  assert.deepEqual(JSON.parse(backend.documents.get(LAST_MODE_DOC)), { version: 1, data: { mode: 'classic-2d' } });
});

test('the last mode is read back at start-up; nothing stored or a malformed document reads as none', async () => {
  const stored = (data) => createMemoryBackend({ initial: { [LAST_MODE_DOC]: JSON.stringify({ version: 1, data }) } });
  const loadFrom = async (backend) => {
    const last = createLastMode({ storage: createStorage({ backend }), modes: createModeHost() });
    const mode = await last.load();
    assert.equal(last.current, mode);
    return mode;
  };
  assert.equal(await loadFrom(stored({ mode: '3d' })), '3d');
  assert.equal(await loadFrom(createMemoryBackend()), null);
  assert.equal(await loadFrom(stored({ mode: 7 })), null);
  assert.equal(await loadFrom(stored('3d')), null);
  assert.equal(await loadFrom(createMemoryBackend({ initial: { [LAST_MODE_DOC]: 'not json' } })), null);
});

test('storage that does not persist never stops a game from starting', async () => {
  const storage = createStorage({ backend: createMemoryBackend({ available: false }) });
  const modes = createModeHost();
  const f = fakeMode();
  modes.register('3d', f.factory);
  const last = createLastMode({ storage, modes });
  modes.start('3d', {});
  f.click();
  const r = await last.record('3d');
  assert.equal(r.ok, false);
  assert.equal(last.current, '3d', 'the session still knows the mode');
  assert.equal(await last.load(), '3d', 'a failed read keeps what this session recorded');
});

test('the menu module is DOM-free and reaches storage only through what it is handed', () => {
  const src = read('js/shell/menu.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator|localStorage)\b/);
  assert.doesNotMatch(src, /^\s*import\b/m, 'menu.js imports nothing');
});

test('the 3D preview\'s tag names the demo board the shell builds, from one size', () => {
  const { X, Y, Z } = DEMO_BOARD_3D;
  assert.equal(menuPreview('3d', { missing: [] }).tag, `3D · Demo board ${X} × ${Y} × ${Z}`);
  const demo = read('js/main.js').match(/function makeDemo\(\) \{[\s\S]*?\n\}/)[0];
  assert.match(demo, /create3DGame\(\{ \.\.\.DEMO_BOARD_3D,/, 'makeDemo builds the board of that size');
  assert.doesNotMatch(demo, /\b(343|=== 6)\b|X: 7/, 'and states no size of its own');
});

test('the build label is the web build and the release version js/version.js holds', () => {
  assert.match(VERSION, /^\d+\.\d+\.\d+$/, 'a release version, major.minor.patch');
  assert.equal(buildLabel('0.2.0'), 'Web · v0.2.0');
  assert.equal(buildLabel('1.10.3'), 'Web · v1.10.3');
  const src = read('js/version.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /^\s*import\b/m, 'version.js imports nothing');
  assert.match(read('js/main.js'), /ui\.setBuild\(buildLabel\(VERSION\)\)/, 'the menu shows that label');
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const section = (start, end) => INDEX.slice(INDEX.indexOf(start), INDEX.indexOf(end));
const MENU = section('<section id="menu"', '<!-- 3D board choice -->');
const BOARD = section('<section id="board-choice"', '<!-- Coming soon -->');
const SOON = section('<section id="coming-soon"', '<!-- Click to play -->');

test('index.html: the wordmark, one mode list of the nine entries in their blocks, the preview panel, the key hints and the build label', () => {
  assert.match(MENU, /<h1 class="ui-wordmark" id="menu-title" aria-label="Minesweeper 3D">(<span class="ui-wordmark__word" aria-hidden="true">[^<]+<\/span>){3}<\/h1>/);
  assert.deepEqual([...MENU.matchAll(/ui-wordmark__word[^>]*>([^<]+)</g)].map((m) => m[1]), ['Mine', 'sweeper', '3D'], 'the title in one line');
  const entries = [...MENU.matchAll(/<button type="button" class="ui-mode-entry" id="menu-entry-([\w-]+)" data-entry="([\w-]+)"( data-block-start)?><span class="ui-mode-entry__icon" aria-hidden="true"><svg [^>]*>[\s\S]*?<\/svg><\/span><span class="ui-mode-entry__label">([^<]+)<\/span><span class="ui-chip hidden" data-last>Last played<\/span><span class="ui-mode-entry__lock" aria-hidden="true">/g)];
  assert.deepEqual(entries.map((m) => m[2]), MENU_ENTRIES.map((e) => e.id));
  assert.deepEqual(entries.map((m) => m[1]), MENU_ENTRIES.map((e) => e.id), 'each entry has its id');
  assert.deepEqual(entries.map((m) => m[4]), MENU_ENTRIES.map((e) => e.label));
  assert.deepEqual(entries.filter((m) => m[3]).map((m) => m[2]),
    MENU_ENTRIES.filter((e, i) => i > 0 && e.block !== MENU_ENTRIES[i - 1].block).map((e) => e.id), 'each later block starts with a gap, and no group label');
  assert.equal([...MENU.matchAll(/class="ui-mode-list"/g)].length, 1, 'one list of entries');
  assert.match(MENU, /<figure class="ui-scene-panel" id="menu-preview" aria-labelledby="menu-preview-tag"><div class="ui-scene-panel__stage" id="menu-preview-stage"><\/div><figcaption class="ui-scene-panel__tag" id="menu-preview-tag"><\/figcaption><\/figure>/);
  assert.deepEqual([...MENU.matchAll(/class="ui-key-hint" data-action="(\w+)"><span class="ui-key-hint__label">(\w+)</g)].map((m) => [m[1], m[2]]),
    [['move', 'Move'], ['select', 'Select']], 'move and select, no Back');
  assert.match(MENU, /<p class="ui-text ui-text--muted" id="menu-build"><\/p>/, 'the build label');
  assert.match(MENU, /<p id="touch-note" class="ui-text ui-text--warning hidden" role="alert">/);
  assert.doesNotMatch(MENU, /ui-menu|ui-card|menu-again|menu-strip|menu-help|menu-sound|menu-vol|data-setting|ui-link|Leaderboards/,
    'no Play again, session strip, Controls, Sound, Volume, credit line or Leaderboards');
  assert.doesNotMatch(MENU, /data-preset|id="custom"/, 'the 3D presets and custom board left the main menu');
});

test('the 3D board choice holds the presets and custom board, and a Back button', () => {
  assert.ok(BOARD.length > 500, 'index.html has the 3D board choice');
  assert.match(BOARD, /class="overlay ui-backdrop hidden"/);
  assert.equal([...BOARD.matchAll(/data-preset="\d/g)].length, 4, 'the four cube presets');
  assert.match(BOARD, /<form id="custom"/);
  assert.match(BOARD, /id="board-choice-back"/);
});

test('the placeholder screen is a screen frame on the backdrop: Main menu with its key hint, the mode as title, the line and Back', () => {
  assert.match(SOON, /<section id="coming-soon" class="overlay ui-backdrop hidden" aria-label="Coming soon">/);
  assert.match(SOON, /<section class="ui-frame" id="coming-soon-frame" aria-labelledby="coming-soon-title">\s*<div class="ui-frame__chrome" data-slot="window-chrome" aria-hidden="true"><\/div>/);
  assert.match(SOON, /<div class="ui-frame__start"><button type="button" id="coming-soon-menu" class="ui-button ui-button--secondary ui-button--sm" data-back>Main menu <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button><\/div>\s*<h2 class="ui-frame__title" id="coming-soon-title">Coming soon<\/h2>\s*<div class="ui-frame__end"><\/div>/,
    'the head: Main menu, the title the shell sets to the mode, no action');
  assert.match(SOON, /<h3 class="ui-card__title" id="coming-soon-heading">Coming soon<\/h3>\s*<p id="coming-soon-text" class="ui-text ui-text--muted">This part of the game is coming soon\.<\/p>/);
  assert.match(SOON, /<button type="button" id="coming-soon-back" class="ui-button ui-button--secondary">Back <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button>/);
  assert.doesNotMatch(SOON, /ui-card ui-screen|data-esc-hint/, 'no card: the frame, its Back holding its key hint');
  const ui = read('js/ui.js');
  const show = ui.slice(ui.indexOf('showComingSoon(title) {'), ui.indexOf('\n  }\n', ui.indexOf('showComingSoon(title) {')));
  assert.match(show, /this\.el\.comingSoonTitle\.textContent = title;/, 'the mode it was opened for names it');
  assert.doesNotMatch(show, /comingSoonText/, 'the line stays "This part of the game is coming soon."');
  assert.match(ui, /for \(const id of \['coming-soon-back', 'coming-soon-menu', 'settings-back'\]\) \$\(id\)\.addEventListener\('click', \(\) => cb\.onBack\?\.\(\)\);/,
    'both go Back');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /#coming-soon-frame \{[^}]*width: 900px;[^}]*height: 560px;/, 'the frame at the canvas\'s size');
  assert.match(css, /@media \(max-width: 719px\) \{[^@]*#coming-soon-frame \{[^}]*width: 100%;[^}]*height: 100%;/, 'full-bleed on a phone');
});

test('the shell routes the new screens, declares their default focus and lets the controller reach them', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  const focus = (name) => table.match(new RegExp(`'?${name}'?: \\{[^\\n]*defaultFocus: '([^']+)'`))?.[1];
  assert.match(table, /\n\s+menu: \{ defaultFocus: \(\) => `#menu-entry-\$\{menuFocusEntry\(\)\}`, show: /, 'the menu focuses its selection');
  const select = MAIN.slice(MAIN.indexOf('function menuFocusEntry('), MAIN.indexOf('\n}\n', MAIN.indexOf('function menuFocusEntry(')));
  assert.match(select, /menuOpened \?\? openingEntry\(LAST_MODE\.current, \{ missing: MISSING \}\)/, 'the entry Back returns to, else the last mode played');
  assert.match(MAIN, /MODES\.on\('started', [^\n]*menuOpened = null;/, 'a game started forgets the entry opened');
  assert.match(focus('board-choice'), /data-preset/, 'the board choice focuses the last played board');
  assert.equal(focus('coming-soon'), '#coming-soon-back');
  assert.match(MAIN, /'board-choice': 'board-choice'/, 'the controller reaches the board choice');
  assert.match(MAIN, /'coming-soon': 'coming-soon'/, 'the controller reaches the placeholder');
  assert.match(MAIN, /openBoardChoice: \(\) => \{ if \(WEBGL2\) SHELL\.go\('board-choice'/, 'the 3D mode opens its board choice, given WebGL 2');
  assert.match(MAIN, /import \{ storage(, [^}]*)? \} from '\.\/platform\/index\.js'/, 'the last mode goes through platform storage');
});

test('without WebGL 2 the shell starts on one availability flag: no "Cannot start" card, the 3D entry disabled with its reason', () => {
  assert.doesNotMatch(MAIN, /This game needs WebGL 2|function fatal\(/, 'no full-page card for a missing WebGL 2');
  assert.match(MAIN, /const WEBGL2 = renderer !== null;/, 'one flag: the renderer was created');
  assert.match(MAIN, /const MISSING = \[\.\.\.WEB_MISSING, \.\.\.\(WEBGL2 \? \[\] : \['webgl2'\]\)\];/, 'what the web build and the browser lack');
  assert.match(MAIN, /createMenu\(\{ router: SHELL, modes: MODES, missing: MISSING \}\)/, 'the menu knows it');
  assert.match(MAIN, /ui\.setEntryUnavailable\(/, 'the menu item shows the reason');
  assert.match(MAIN, /document\.body\.classList\.toggle\('no-webgl2', !WEBGL2\)/, 'the page knows it has no 3D scene');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /body\.no-webgl2 #scene \{ display: none; \}/, 'the #scene canvas is hidden');
  assert.doesNotMatch(css, /:is\(#menu, #board-choice, #coming-soon, #c2d-choice, #settings, #records\) \{[^}]*background/,
    'the menu screens carry no tint of their own: without WebGL 2 they sit on the body\'s static backdrop');
  assert.match(read('themes/joyful-tiles/theme.css'), /body \{[^}]*background-color: var\(--color-ground\);[^}]*background-image: radial-gradient\([^)]*var\(--color-ground-dot\)/,
    'the body\'s backdrop, built from the theme tokens');
  const hook = MAIN.slice(MAIN.indexOf('window.__ms = {'));
  assert.match(hook.match(/start\(X, Y, Z, mines, minePositions\) \{[^\n]*/)[0], /if \(!WEBGL2\) throw new Error\(/, 'the start hook reports the reason');
  assert.match(INDEX, /<noscript><div class="noscript">Minesweeper 3D needs JavaScript\.<\/div><\/noscript>/, 'the noscript line asks only for JavaScript');
  assert.match(INDEX, /The game files failed to load\. Check your connection and reload the page\./, 'the onerror card stays');
  assert.match(read('README.md'), /3D needs WebGL 2; Classic 2D, Records and Settings run without it\./);
});

test('the catalogue documents the main menu, the 3D board choice and the placeholder', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Main menu \(index\.html #menu\)[\s\S]*?ui-wordmark[\s\S]*?ui-mode-list[\s\S]*?ui-scene-panel[\s\S]*?ui-key-hints[\s\S]*?build label[\s\S]*?Default focus: the entry last opened[\s\S]*?last mode played/);
  assert.match(head, /3D board choice \(index\.html #board-choice\)/);
  assert.match(head, /Coming soon \(index\.html #coming-soon\)/);
});

// ---------------------------------------------------------------- browser

test('in a browser, the menu shows the nine entries with the selected one\'s preview, each routes, and Back returns to its entry', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const shown = () => ms(() => ['menu', 'board-choice', 'coming-soon', 'records', 'c2d-choice', 'settings', 'daily', 'ready', 'pause']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')));
    const backdrop = () => ms(() => globalThis.__ms.renderer.game === globalThis.__ms.state.demo);
    // What the preview shows: its tag, whether the scene draws through it, the layer shown and the card's lines.
    const preview = () => ms(() => {
      const panel = document.getElementById('menu-preview');
      const layer = [...panel.querySelectorAll('[data-preview]')].find((l) => !l.hidden);
      const card = layer?.querySelector('.ui-scene-panel__card');
      return {
        tag: document.getElementById('menu-preview-tag').classList.contains('hidden') ? null : document.getElementById('menu-preview-tag').textContent,
        live: panel.classList.contains('ui-scene-panel--live'),
        layer: layer?.dataset.preview ?? null,
        canvas: !!layer?.querySelector('canvas'),
        card: card ? [...card.children].map((c) => c.textContent || c.dataset.entry + (c.hasAttribute('data-unavailable') ? ' locked' : '')) : null,
        sceneShown: getComputedStyle(document.getElementById('scene')).visibility === 'visible',
      };
    });
    const select = async (id) => { await page.focus(`#menu-entry-${id}`); };
    assert.equal(await ms(() => document.getElementById('menu-build').textContent), buildLabel(VERSION), 'the build label shows the release version');

    // The nine entries, in order, visible; the first takes the focus when no mode was played yet.
    assert.equal(await mode(), 'menu');
    const labels = await ms(() => [...document.querySelectorAll('#menu [data-entry]')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.querySelector('.ui-mode-entry__label').textContent));
    assert.deepEqual(labels, ['Classic 2D', 'Hexagon', 'Triangle', 'Surface', '3D', 'Daily', 'Records', 'Settings', 'Quit']);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#menu [data-entry]')].filter((b) => b.getAttribute('aria-disabled') === 'true')
      .map((b) => [b.dataset.entry, b.querySelector('.ui-mode-entry__reason').textContent])), [['quit', 'Desktop build only']], 'on the web only Quit is disabled');
    assert.equal(await ms(() => document.querySelectorAll('#menu .ui-chip:not(.hidden)').length), 0, 'nothing played: no Last played chip');

    // The preview follows the selection.
    assert.deepEqual(await preview(), { tag: 'Classic 2D · Intermediate', live: false, layer: 'board', canvas: true, card: null, sceneShown: false },
      'Classic 2D: a board drawn by its board view; the 3D scene neither shows nor draws');
    assert.equal(await ms(() => globalThis.__ms.renderer.target), null);
    await select('3d');
    assert.deepEqual(await preview(), { tag: '3D · Demo board 7 × 7 × 7', live: true, layer: null, canvas: false, card: null, sceneShown: true });
    assert.ok(await backdrop(), 'the 3D demo board');
    assert.deepEqual(await ms(() => {
      const r = document.getElementById('menu-preview-stage').getBoundingClientRect();
      return [globalThis.__ms.renderer.target, { x: r.left, y: r.top, width: r.width, height: r.height }];
    }).then(([target, box]) => [target, target && Object.keys(box).every((k) => Math.abs(box[k] - target[k]) < 1)]).then(([, near]) => near), true,
    'the scene draws into the panel\'s stage');
    assert.match(await ms(() => document.getElementById('scene').style.clipPath), /^inset\(.* round \d+px\)$/, 'clipped to the panel\'s corners');
    await select('daily');
    const daily = await preview();
    assert.match(daily.tag, /^Daily · \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    assert.deepEqual({ ...daily, tag: null }, { tag: null, live: false, layer: 'daily', canvas: true, card: null, sceneShown: false }, 'today\'s daily board');
    for (const [id, card] of [['hexagon', ['hexagon', 'Hexagon', 'Coming soon']], ['triangle', ['triangle', 'Triangle', 'Coming soon']],
      ['surface', ['surface', 'Surface', 'Coming soon']], ['records', ['records', 'Records']], ['settings', ['settings', 'Settings']],
      ['quit', ['quit locked', 'Quit', 'Desktop build only']]]) {
      await select(id);
      assert.deepEqual(await preview(), { tag: null, live: false, layer: 'card', canvas: false, card, sceneShown: false }, `${id}'s card`);
    }
    // The mouse selects as the keys do.
    const box = await page.locator('#menu-entry-triangle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);
    assert.equal(await active(), 'menu-entry-triangle');
    assert.deepEqual((await preview()).card, ['triangle', 'Triangle', 'Coming soon']);

    // Quit opens nothing on the web.
    await page.click('#menu-entry-quit', { force: true }); // aria-disabled: Playwright counts it not enabled
    assert.equal(await mode(), 'menu');
    assert.equal(await active(), 'menu-entry-quit', 'it stays selected');

    // Classic 2D: its board choice, Back by its button to the entry.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.deepEqual(await shown(), ['c2d-choice']);
    assert.ok(await backdrop(), 'the backdrop stays behind the board choice');
    await page.click('#c2d-choice-back');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');
    assert.deepEqual(await shown(), ['menu']);
    assert.equal(await active(), 'menu-entry-classic-2d');

    // Hexagon, Triangle and Surface: the placeholder titled with the mode; Back returns with the entry selected.
    for (const [id, title] of [['hexagon', 'Hexagon'], ['triangle', 'Triangle'], ['surface', 'Surface']]) {
      await page.click(`#menu-entry-${id}`);
      assert.equal(await mode(), 'coming-soon');
      assert.equal(await ms(() => document.getElementById('coming-soon-title').textContent), title);
      await page.keyboard.press('Escape');
      assert.equal(await mode(), 'menu');
      assert.equal(await active(), `menu-entry-${id}`, `Back returns with ${title} selected`);
      assert.deepEqual((await preview()).card?.[1], title, 'and its preview');
    }

    // Records, Daily and Settings: their screens, by mouse and keyboard; Back returns to the entry.
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.deepEqual(await shown(), ['records']);
    assert.ok(await backdrop(), 'the backdrop stays behind the records screen');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu', 'Esc is Back');
    assert.equal(await active(), 'menu-entry-records');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'records');
    await page.click('#records-back');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');
    await select('daily');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'daily');
    await page.keyboard.press('Escape');
    assert.equal(await active(), 'menu-entry-daily');
    await select('settings');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'settings');
    assert.ok(await backdrop(), 'the backdrop stays behind the Settings page');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    assert.equal(await active(), 'menu-entry-settings');

    // 3D: the 3D presets and custom board, Back by keyboard and by its button.
    await select('3d');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'board-choice');
    assert.deepEqual(await shown(), ['board-choice']);
    assert.ok(await ms(() => document.activeElement?.matches('[data-preset]')), 'a preset takes the focus');
    assert.ok(await ms(() => document.querySelector('#board-choice [data-preset="custom"]').getBoundingClientRect().height > 0), 'Custom is offered');
    assert.ok(await backdrop());
    assert.equal(await ms(() => globalThis.__ms.renderer.target), null, 'a screen without a panel: the scene full-window');
    assert.equal(await ms(() => document.body.classList.contains('scene-off')), true, 'its own backdrop: no 3D scene shows or draws');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    assert.equal(await active(), 'menu-entry-3d');
    assert.equal((await preview()).live, true);
    await page.click('#menu-entry-3d');
    await page.click('#board-choice-back');
    assert.equal(await mode(), 'menu');

    // A 3D game started from its board choice records the mode once the first click starts it.
    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="6,6,6,10"]');
    await page.click('#bc-play');
    assert.equal(await mode(), 'ready');
    await ms(() => { globalThis.__ms.forcePlay(); globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    await page.waitForFunction(() => localStorage.getItem('ms3d:doc:shell.lastMode') !== null);
    assert.deepEqual(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.lastMode'))), { version: 1, data: { mode: '3d' } });
    await ms(() => {
      globalThis.__ms.pause();
      document.getElementById('p-menu').click();
      // a started, unfinished game asks first (the first click may also have ended it)
      if (!document.getElementById('pause-confirm').classList.contains('hidden')) document.getElementById('p-confirm-yes').click();
    });
    assert.equal(await mode(), 'menu');
    assert.equal(await active(), 'menu-entry-3d', 'the menu opens on the last mode played');
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#menu .ui-chip:not(.hidden)')].map((c) => [c.closest('[data-entry]').dataset.entry, c.textContent])),
      [['3d', 'Last played']], '3D carries the Last played chip');
    // Enter, then Play: its board choice opens on the board last played.
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'board-choice');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '6,6,6,10', 'the last board is selected');
    await page.keyboard.press('Escape');

    // It survives a reload.
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.waitForFunction(() => document.activeElement?.id === 'menu-entry-3d');
    assert.equal((await preview()).live, true, 'the 3D preview shows');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the menu fits each window: the title\'s size, the entries as tall as the preview, the selected one taller, no sideways scroll; a phone shows no preview', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    // [width, height, title px] per artboard (J-Menu-xl, -l, -m, -p)
    for (const [width, height, title, phone] of [[1920, 1080, 84], [1366, 768, 58], [1024, 768, 50], [390, 844, 31, true]]) {
      const context = await browser.newContext({ viewport: { width, height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
      const page = await context.newPage();
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.activeElement?.id === 'menu-entry-classic-2d');
      await page.waitForTimeout(300); // the selected entry's move
      const m = await page.evaluate(() => {
        const rect = (el) => el.getBoundingClientRect();
        const title = document.getElementById('menu-title');
        const entries = [...document.querySelectorAll('#menu-entries .ui-mode-entry')].map(rect);
        const list = rect(document.getElementById('menu-entries'));
        const preview = rect(document.getElementById('menu-preview'));
        return {
          title: parseFloat(getComputedStyle(title).fontSize),
          titleLines: Math.round(rect(title).height / parseFloat(getComputedStyle(title).lineHeight || getComputedStyle(title).fontSize)),
          titleCentre: rect(title).left + rect(title).width / 2,
          heights: entries.map((r) => r.height),
          first: entries[0].top, last: entries[entries.length - 1].bottom, list: [list.top, list.bottom],
          preview: [preview.top, preview.bottom, preview.width],
          scroll: document.documentElement.scrollWidth,
          bottom: Math.max(...[...document.querySelectorAll('#menu-foot > :not(.hidden)')].map((e) => rect(e).bottom)),
        };
      });
      const label = `${width} × ${height}`;
      assert.ok(Math.abs(m.title - title) <= 3, `${label}: the title at ${title} px (${m.title})`);
      assert.ok(Math.abs(m.titleCentre - width / 2) < 2, `${label}: the title centred`);
      const [selected, ...rest] = m.heights;
      assert.ok(rest.every((h) => Math.abs(h - rest[0]) < 1), `${label}: every other entry the same height (${rest})`);
      assert.ok(selected > rest[0] * 1.2, `${label}: the selected entry taller (${selected} vs ${rest[0]})`);
      assert.ok(m.scroll <= width, `${label}: no sideways scroll (${m.scroll})`);
      assert.ok(m.bottom <= height, `${label}: the foot inside the window (${m.bottom})`);
      if (phone) {
        assert.equal(m.preview[2], 0, `${label}: no preview`);
        assert.ok(m.last <= m.list[1] + 1 && m.first >= m.list[0] - 1, `${label}: the entries fill their place`);
      } else {
        assert.ok(Math.abs(m.list[0] - m.preview[0]) <= 1 && Math.abs(m.list[1] - m.preview[1]) <= 1 && Math.abs(m.last - m.list[1]) <= 1,
          `${label}: the entries together as tall as the preview (${m.list}, last ${m.last} vs ${m.preview})`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser with a coarse pointer, every unselected menu entry is a 44 px touch target at 1366 and 1024', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const [width, height] of [[1366, 768], [1024, 768]]) {
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: true, isMobile: true });
      const page = await context.newPage();
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.activeElement?.id === 'menu-entry-classic-2d');
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        width: innerWidth,
        heights: [...document.querySelectorAll('#menu-entries .ui-mode-entry')].filter((b) => b !== document.activeElement).map((b) => b.getBoundingClientRect().height),
      }));
      assert.ok(m.coarse, 'a coarse pointer');
      assert.equal(m.width, width);
      assert.equal(m.heights.length, 8);
      assert.ok(m.heights.every((h) => h >= 44), `${width}: every unselected entry at least 44 px (${m.heights})`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, the menu\'s key hints follow the active device: the keyboard\'s arrows and Enter, the controller\'s buttons, none on touch', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, press } = await controllerPage(browser, base);
    const hints = () => page.evaluate(() => [...document.querySelectorAll('#menu-hints .ui-key-hint')]
      .map((h) => [h.dataset.action, h.classList.contains('hidden'), [...h.querySelectorAll('.ui-key-hint__key')].map((k) => k.textContent).join(' '), h.textContent.replace(/\s+/g, '')]));
    assert.deepEqual(await hints(), [['move', false, '↑ ↓', '↑↓Move'], ['select', false, 'Enter', 'EnterSelect']]);
    await press(PAD_BTN.DOWN);
    const pad = await hints();
    assert.deepEqual(pad.map(([a, hidden]) => [a, hidden]), [['move', false], ['select', false]]);
    assert.equal(pad[0][2], 'D-pad');
    assert.notEqual(pad[1][2], 'Enter', 'the controller\'s button');
    await page.close();
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await context.newPage();
    await phone.goto(`${base}/index.html?still-backdrop`);
    await phone.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    assert.deepEqual(await phone.evaluate(() => [...document.querySelectorAll('#menu-hints .ui-key-hint')].map((h) => h.classList.contains('hidden'))), [true, true],
      'a touch device: no key hints');
    assert.equal(await phone.evaluate(() => document.getElementById('touch-note').classList.contains('hidden')), false, 'the touch note instead');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('in a browser, the backdrop orbits and draws every frame, and the ?still-backdrop test hook draws it only when it changes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const frames = (n) => ms((count) => new Promise((done) => {
      const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
      step(count);
    }), n);
    const drawn = () => ms(() => globalThis.__ms.frameStats.renders);
    const orbit = () => ms(() => globalThis.__ms.state.orbit);

    // Without the hook: the demo board orbits in the menu's 3D preview, and every frame draws it.
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await frames(2);
    let renders = await drawn();
    await frames(3);
    assert.equal(await drawn(), renders, 'the Classic 2D preview: no 3D scene is drawn');
    await page.focus('#menu-entry-3d');
    await frames(2);
    renders = await drawn();
    let angle = await orbit();
    await frames(3);
    assert.ok(await drawn() >= renders + 3, 'the backdrop draws every frame');
    assert.ok(await orbit() > angle, 'the camera orbits the demo board');

    // With the hook: drawn once, then still until the screen changes.
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.focus('#menu-entry-3d');
    await frames(2);
    assert.ok(await drawn() >= 1, 'the backdrop is drawn');
    assert.ok(await ms(() => globalThis.__ms.renderer.game === globalThis.__ms.state.demo), 'the demo board is the backdrop');
    renders = await drawn();
    angle = await orbit();
    await frames(3);
    assert.equal(await drawn(), renders, 'no frame redraws a backdrop that did not change');
    assert.equal(await orbit(), angle, 'the camera holds still');
    await page.click('#menu-entry-records');
    await frames(2);
    assert.ok(await drawn() > renders, 'a screen change draws it again');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('the shell hands the renderer the shown screen\'s scene panel on screen change, resize and a panel resize', () => {
  const main = read('js/main.js');
  const sync = main.slice(main.indexOf('function syncScenePanel('), main.indexOf('\n}\n', main.indexOf('function syncScenePanel(')));
  assert.match(sync, /\.ui-scene-panel__stage/, 'the panel\'s stage is the rectangle');
  assert.match(sync, /renderer\.setTarget\(/, 'handed to the renderer');
  assert.match(sync, /SCENE_PANEL_OBSERVER\?\.observe\(/, 'the panel\'s box is tracked');
  assert.match(main, /new ResizeObserver\(\(\) => syncScenePanel\(\)\)/, 'a change of the panel\'s box re-applies it');
  assert.match(main, /onChange: \(\) => \{[^\n]*syncScenePanel\(\)/, 'every screen change sets or clears it');
  assert.match(main, /addEventListener\('resize', \(\) => syncScenePanel\(\)\)/, 'a window resize too');
});

test('in a browser, a scene panel takes the 3D scene: outside it the page, inside the scene, moving with the panel', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const target = () => ms(() => globalThis.__ms.renderer.target);
    // Draw a frame and read the drawing buffer before the page composites it: [alpha] at each CSS point.
    const alphas = (points) => ms((pts) => {
      const r = globalThis.__ms.renderer;
      r.render();
      const gl = r.renderer.getContext(), pr = r.renderer.getPixelRatio(), out = new Uint8Array(4);
      return pts.map(([x, y]) => {
        gl.readPixels(Math.floor(x * pr), Math.floor(gl.drawingBufferHeight - y * pr - 1), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return out[3];
      });
    }, points);
    const around = ({ x, y, width, height }) => [
      [x + width / 2, y + height / 2], // inside
      [x - 6, y + height / 2], [x + width + 6, y + height / 2], [x + width / 2, y - 6], [x + width / 2, y + height + 6], // outside
    ];

    assert.equal(await target(), null, 'no screen has a panel yet: the full window');
    assert.deepEqual(await alphas([[400, 300], [5, 5], [795, 595]]), [255, 255, 255], 'the scene fills the window');

    // A panel on the menu, its own background cleared so the scene shows through it.
    await ms(() => {
      const fig = document.createElement('figure');
      fig.className = 'ui-scene-panel ui-scene-panel--live';
      fig.id = 'test-panel';
      fig.style.cssText = 'position: fixed; right: 100px; top: 120px; width: 300px; height: 200px; margin: 0; background: none; box-shadow: none';
      fig.innerHTML = '<div class="ui-scene-panel__stage"></div>';
      document.getElementById('menu').append(fig);
    });
    await page.click('#menu-entry-records');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'records');
    assert.equal(await target(), null, 'a screen without a panel draws full-window');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu' && globalThis.__ms.renderer.target !== null);
    let rect = await target();
    assert.deepEqual(rect, { x: 400, y: 120, width: 300, height: 200 }, 'the shown screen\'s panel');
    assert.equal(await ms(() => globalThis.__ms.renderer.camera.aspect), 1.5, 'the camera takes the panel\'s aspect');
    assert.deepEqual(await alphas(around(rect)), [255, 0, 0, 0, 0], 'the scene inside the panel, the page outside it');

    // The panel's box changes: the scene follows.
    await ms(() => { document.getElementById('test-panel').style.height = '260px'; });
    await page.waitForFunction(() => globalThis.__ms.renderer.target?.height === 260);
    rect = await target();
    assert.deepEqual(await alphas(around(rect)), [255, 0, 0, 0, 0], 'a resized panel');

    // The window resizes: the panel moves with its right edge, and the scene with it.
    await page.setViewportSize({ width: 1000, height: 700 });
    await page.waitForFunction(() => globalThis.__ms.renderer.target?.x === 600);
    rect = await target();
    assert.deepEqual(rect, { x: 600, y: 120, width: 300, height: 260 });
    assert.deepEqual(await alphas(around(rect)), [255, 0, 0, 0, 0], 'the scene moved with the panel');

    // A 3D game draws full-window.
    await ms(() => { globalThis.__ms.start(4, 4, 4, 3); globalThis.__ms.forcePlay(); });
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    assert.equal(await target(), null, 'a 3D game is full-window');
    assert.deepEqual(await alphas([[5, 5], [995, 695]]), [255, 255], 'drawn to the window\'s corners');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// A browser without WebGL 2: every canvas refuses a 'webgl2' context, as a locked-down browser or a
// blocklisted GPU does; the other context types are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser without WebGL 2, the shell starts with a static background, 3D disabled with its reason, and Classic 2D, Records and Settings working', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: patience(5000) });
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const frames = (n) => ms((count) => new Promise((done) => {
      const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
      step(count);
    }), n);

    // The shell started: no card, no renderer, no demo board, the canvas hidden.
    assert.equal(await ms(() => document.querySelector('.fatal')), null, 'no "Cannot start" card');
    assert.equal(await ms(() => globalThis.__ms.renderer), null);
    assert.equal(await ms(() => globalThis.__ms.state.demo), null, 'no demo board is generated');
    assert.equal(await ms(() => getComputedStyle(document.getElementById('scene')).display), 'none');
    const skipped = await ms(() => globalThis.__ms.frameStats.skipped);
    await frames(3);
    assert.equal(await ms(() => globalThis.__ms.frameStats.renders), 0, 'nothing is drawn');
    assert.ok(await ms(() => globalThis.__ms.frameStats.skipped) >= skipped + 3, 'the frame loop keeps running');

    // The static backdrop, from the theme's tokens.
    const bg = await ms(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--color-ground)';
      document.body.append(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const body = getComputedStyle(document.body);
      return { color: body.backgroundColor, token, image: body.backgroundImage, menu: getComputedStyle(document.getElementById('menu')).backgroundImage };
    });
    assert.equal(bg.color, bg.token, 'the page is the theme\'s ground colour');
    assert.match(bg.image, /radial-gradient/, 'the theme\'s dotted ground shows');
    assert.equal(bg.menu, 'none', 'the menu screen lays no tint of its own over it');

    // The 3D entry: disabled, its reason under its label and its lock shown; the focus starts on Classic 2D.
    assert.deepEqual(await ms(() => {
      const b = document.getElementById('menu-entry-3d');
      return [b.getAttribute('aria-disabled'), b.querySelector('.ui-mode-entry__label').textContent, b.querySelector('.ui-mode-entry__reason').textContent,
        getComputedStyle(b.querySelector('.ui-mode-entry__lock')).display !== 'none'];
    }), ['true', '3D', 'Needs WebGL 2 — not available in this browser', true]);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.equal(await ms(() => document.getElementById('menu-preview-stage').querySelector('canvas') !== null), true, 'the Classic 2D preview draws without WebGL 2');
    await page.click('#menu-entry-3d', { force: true }); // aria-disabled: Playwright counts it not enabled
    assert.equal(await mode(), 'menu', 'a click opens nothing');
    assert.equal(await active(), 'menu-entry-3d', 'the disabled entry is selected');
    assert.deepEqual(await ms(() => [document.getElementById('menu-preview-tag').textContent, document.getElementById('menu-preview').classList.contains('ui-scene-panel--live'),
      [...document.querySelectorAll('#menu-preview [data-preview]')].filter((l) => !l.hidden).length]), ['3D', false, 0], 'its preview: the panel\'s static background');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'menu', 'Enter opens nothing');
    await page.focus('#menu-entry-surface');
    await page.keyboard.press('ArrowDown');
    assert.equal(await active(), 'menu-entry-3d', 'the arrow keys reach the disabled entry');
    await ms(() => globalThis.__ms.modes.openBoardChoice('3d'));
    await ms(() => globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }));
    assert.equal(await mode(), 'menu', 'no route opens the 3D board choice or starts a 3D game');
    assert.equal(await ms(() => globalThis.__ms.modes.active), null);
    await assert.rejects(ms(() => globalThis.__ms.start(6, 6, 6, 10)), /WebGL 2/, 'the start hook reports why');
    assert.equal(await mode(), 'menu');

    // Classic 2D end to end: board choice, generation, play, pause, restart, results.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    await page.uncheck('#c2d-noguess');
    await page.click('#c2d-choice [data-size="beginner"]');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d');
    const box = await page.locator('#c2d-board canvas').boundingBox();
    const cell = (i) => [box.x + (box.width / 9) * ((i % 9) + 0.5), box.y + (box.height / 9) * (Math.floor(i / 9) + 0.5)];
    await page.mouse.click(...cell(40));
    await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: patience(5000) });
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    await page.click('#p-restart');
    assert.equal(await mode(), 'classic-2d', 'restart: a new board');
    assert.equal(await ms(() => globalThis.__ms.modes.state.started), false);
    // The first click starts the game once its board arrives; the clicks after it stop at the end
    // delay, where one would end it and a later one land on the results screen.
    const over = () => ms(() => !!globalThis.__ms.board2D?.effect);
    const where = () => ms(() => ({ mode: globalThis.__ms.state.mode, ...globalThis.__ms.modes.state, ending: !!globalThis.__ms.board2D?.effect,
      status: !document.getElementById('c2d-status').classList.contains('hidden'), active: document.activeElement?.id }));
    // the restarted board's own layout, the hint strip or a scale change may have moved it
    const at = (i) => ms((c) => {
      const v = globalThis.__ms.board2D, area = document.getElementById('c2d-board').getBoundingClientRect(), t = v.layout.tile;
      return [area.left + v.layout.viewX + ((c % 9) + 0.5) * t, area.top + v.layout.viewY + (Math.floor(c / 9) + 0.5) * t];
    }, i);
    await page.mouse.click(...await at(0));
    await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: patience(5000) })
      .catch(async (error) => { throw new Error(`not started: ${JSON.stringify(await where())} (${error.message})`); });
    for (let i = 1; i < 81 && (await mode()) === 'classic-2d' && !(await over()); i++) await page.mouse.click(...await at(i));
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000) })
      .catch(async (error) => { throw new Error(`no results screen: ${JSON.stringify(await where())} (${error.message})`); });

    // Watch replay from the results screen plays the game's 2D replay.
    await page.waitForFunction(() => !document.getElementById('r-watch').classList.contains('hidden'), null, { timeout: patience(5000) });
    await page.click('#r-watch');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    await page.keyboard.press('End');
    assert.equal(await ms(() => globalThis.__ms.replayViewer.state.ended), true, 'the replay plays through to its end');
    await page.click('#rp-back');
    assert.equal(await mode(), 'results');

    // Records from the results screen; its library view's Watch plays the kept replay; the 3D side opens.
    await page.click('#r-records');
    assert.equal(await mode(), 'records');
    await page.waitForSelector('#records-replays-table [data-act="watch"]', { timeout: patience(5000) });
    await page.click('#records-replays-table [data-act="watch"]');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    assert.equal(await ms(() => document.querySelectorAll('#replay-board canvas').length), 1, 'the 2D board view is mounted');
    await page.click('#rp-back');
    assert.equal(await mode(), 'records');
    await page.click('#records-mode [data-value="3d"]');
    assert.equal(await ms(() => document.querySelector('#records-mode [aria-checked="true"]').dataset.value), '3d');
    assert.ok(await ms(() => document.querySelectorAll('#records-picker [role="radio"]').length > 0), 'the 3D board picker shows');
    await page.click('#records-mode [data-value="classic-2d"]');
    await page.click('#records-back');
    assert.equal(await mode(), 'results', 'Back returns to the results screen');

    // Play again, then back to the menu.
    await page.click('#r-again');
    assert.equal(await mode(), 'classic-2d');
    await page.keyboard.press('Escape');
    await page.click('#p-menu');
    assert.equal(await mode(), 'menu');

    // Settings: every control is saved, the graphics settings too.
    await page.click('#menu-entry-settings');
    assert.equal(await mode(), 'settings');
    await page.click('#set-renderResolution [data-value="sharp"]');
    await page.click('#set-theme [data-value="joyful-tiles"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:settings') ?? '{}').data?.renderResolution === 'sharp', null, { timeout: patience(5000) });
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:settings')).data.theme), 'joyful-tiles');
    assert.equal(await ms(() => document.documentElement.dataset.theme), 'joyful-tiles', 'the theme picked is the one shown');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // A last mode played of 3D still marks it; the focus falls to the first enabled entry.
    await ms(() => localStorage.setItem('ms3d:doc:shell.lastMode', JSON.stringify({ version: 1, data: { mode: '3d' } })));
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: patience(5000) });
    await page.waitForFunction(() => document.getElementById('menu-entry-3d').hasAttribute('data-last'), null, { timeout: patience(5000) });
    assert.ok(await ms(() => !document.querySelector('#menu-entry-3d .ui-chip[data-last]').classList.contains('hidden')), '"Last played" shows');
    await frames(2);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.equal(await ms(() => getComputedStyle(document.getElementById('scene')).display), 'none');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// A fake standard controller in the page: `navigator.getGamepads` returns it, and the shell's
// per-frame poll reads its buttons. press(button) holds a button for exactly one poll — it is
// released in the animation frame whose poll read it, so menu auto-repeat never fires however slow
// the machine — then waits two more frames, so held-button suppression across a screen change
// never swallows the next press.
const PAD_BTN = { A: 0, B: 1, BACK: 8, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
function installFakePad() {
  const pad = {
    id: 'Fake pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
  globalThis.__fakePad = pad;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
}
async function controllerPage(browser, base, { route } = {}) {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(installFakePad);
  if (route) await page.route(route.url, route.handler);
  await page.goto(`${base}/index.html?still-backdrop`);
  await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.pads.connected);
  const frames = (n) => page.evaluate((count) => new Promise((done) => {
    const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
    step(count);
  }), n);
  // The shell's frame loop registers its next animation frame before this callback, so within one
  // frame its poll reads the button pressed and this callback releases it straight after.
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
  const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
  const focused = () => page.evaluate(() => {
    const el = document.activeElement;
    return el?.dataset?.preset ?? el?.id ?? '';
  });
  return { page, errors, press, mode, focused };
}

test('in a browser, a controller alone walks the menu, the 3D board choice and the placeholder', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    // ---- 3D board choice: move between presets, confirm one, Back to the menu.
    {
      const { errors, press, mode, focused, page } = await controllerPage(browser, base);
      assert.equal(await mode(), 'menu');
      assert.equal(await focused(), 'menu-entry-classic-2d');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-hexagon', 'the D-pad moves down the menu');
      for (let i = 0; i < 3; i++) await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-3d');
      await press(PAD_BTN.A);
      assert.equal(await mode(), 'board-choice', 'A opens the 3D board choice');
      assert.equal(await focused(), '6,6,6,20', 'the default preset, cube Beginner, takes the focus when none was played');

      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), '8,8,8,40', 'down moves to the next preset');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), '10,10,10,100');
      await press(PAD_BTN.UP);
      const chosen = await focused();
      assert.equal(chosen, '8,8,8,40', 'up moves back');
      assert.equal(await mode(), 'board-choice', 'moving changes no screen');

      await press(PAD_BTN.A);
      assert.equal(await mode(), 'board-choice', 'A chooses the focused preset');
      assert.equal(await page.evaluate(() => document.querySelector('#board-choice [aria-pressed="true"]')?.dataset.preset), chosen);
      await page.evaluate(() => document.getElementById('bc-play').focus());
      await press(PAD_BTN.A);
      assert.equal(await mode(), 'ready', 'A on Play plays the chosen preset');
      const [X, Y, Z, mines] = chosen.split(',').map(Number);
      assert.deepEqual(await page.evaluate(() => globalThis.__ms.state.settings), { X, Y, Z, mines }, 'the confirmed preset is the board');

      await press(PAD_BTN.BACK);
      assert.equal(await mode(), 'board-choice', 'Back on a fresh board returns to the board choice');
      assert.equal(await focused(), chosen, 'the preset just played keeps the focus');
      await press(PAD_BTN.BACK);
      assert.equal(await mode(), 'menu', 'Back returns to the menu');
      assert.deepEqual(errors, []);
      await page.close();
    }

    // ---- Placeholder: Triangle opens it titled with the mode; B leaves it, back on Triangle.
    {
      const { errors, press, mode, focused, page } = await controllerPage(browser, base);
      assert.equal(await mode(), 'menu');
      await press(PAD_BTN.DOWN);
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-triangle');
      await press(PAD_BTN.A);
      assert.equal(await mode(), 'coming-soon', 'a mode not built yet opens the placeholder');
      assert.ok(await page.evaluate(() => !document.getElementById('coming-soon').classList.contains('hidden')));
      assert.equal(await page.evaluate(() => document.getElementById('coming-soon-title').textContent), 'Triangle');
      assert.equal(await focused(), 'coming-soon-back', 'its Back button takes the focus');
      assert.equal(await page.evaluate(() => document.getElementById('coming-soon-text').textContent), 'This part of the game is coming soon.');
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#coming-soon .ui-key-hint')].map((h) => [h.classList.contains('ui-key-hint--pad'), h.textContent])),
        [[true, 'B'], [true, 'B']], 'the head\'s Main menu and Back show the controller\'s Back button');
      // The head's Main menu goes back too, as the frame's Back does on every screen.
      await press(PAD_BTN.UP);
      assert.equal(await focused(), 'coming-soon-menu', 'the D-pad reaches the head\'s Main menu');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'coming-soon-back');
      await press(PAD_BTN.B);
      assert.equal(await mode(), 'menu', 'B is Back: the placeholder returns to the menu');
      assert.equal(await focused(), 'menu-entry-triangle', 'with Triangle selected');
      assert.ok(await page.evaluate(() => document.getElementById('coming-soon').classList.contains('hidden')));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
