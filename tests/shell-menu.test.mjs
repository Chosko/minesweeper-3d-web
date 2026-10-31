import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MENU_ENTRIES, PLACEHOLDER_SCREEN, LAST_MODE_DOC, LAST_MODE_VERSION, UNAVAILABLE_REASONS, UNAVAILABLE_SHORT_REASONS, entryRoute, entryReason,
  createMenu, createLastMode, openingEntry, menuPreview, entryShortReason, buildLabel, DEMO_BOARD_3D,
} from '../js/shell/menu.js';
import { VERSION } from '../js/version.js';
import { demoBoard2D, dailyBoard2D, bindMenuPreview, mountTilePreviews } from '../js/shell/menu-preview.js';
import { HEXAGON, TRIANGLE } from '../js/flat-modes.js';
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

test('the main menu has eight entries in two blocks: the five modes and Daily as play tiles, then Records and Settings — no Quit and no Leaderboards', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.label), ['Classic 2D', 'Hexagon', 'Triangle', 'Surface', '3D', 'Daily', 'Records', 'Settings']);
  assert.deepEqual(MENU_ENTRIES.map((e) => e.id), ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily', 'records', 'settings']);
  assert.deepEqual(MENU_ENTRIES.map((e) => e.block), [0, 0, 0, 0, 0, 0, 1, 1]);
  assert.ok(Object.isFrozen(MENU_ENTRIES) && MENU_ENTRIES.every(Object.isFrozen));
  assert.deepEqual(MENU_ENTRIES.map((e) => e.mode ?? null), ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', null, null, null], 'each mode entry names its mode');
  assert.deepEqual(MENU_ENTRIES.map((e) => e.screen ?? null), [null, null, null, null, null, 'daily', 'records', 'settings']);
  assert.ok(!MENU_ENTRIES.some((e) => /leaderboard|quit/i.test(e.id + e.label)), 'Leaderboards is a Records tab and Quit the title bar\'s, neither an entry');
});

test('Hexagon, Triangle and Surface are enabled and open the placeholder titled with their mode until the mode is registered', () => {
  const all = { hasMode: (m) => ['classic-2d', '3d'].includes(m), hasScreen: () => true };
  for (const [id, title] of [['hexagon', 'Hexagon'], ['triangle', 'Triangle'], ['surface', 'Surface']]) {
    const entry = MENU_ENTRIES.find((e) => e.id === id);
    assert.equal(entryReason(entry, ['webgl2']), null, `${title} is enabled`);
    assert.deepEqual(entryRoute(entry, { ...all, missing: ['webgl2'] }), { screen: PLACEHOLDER_SCREEN, data: { entry: id, title } });
  }
});

test('the menu opens on the last mode played; the first entry when nothing was played or that entry cannot open here', () => {
  assert.equal(openingEntry(null), 'classic-2d', 'nothing played: the first entry');
  assert.equal(openingEntry('3d'), '3d');
  assert.equal(openingEntry('hexagon'), 'hexagon', 'Hexagon, a mode of its own');
  assert.equal(openingEntry('triangle'), 'triangle', 'Triangle, a mode of its own');
  assert.equal(openingEntry('triangle', { missing: ['webgl2'] }), 'triangle', 'Triangle needs no WebGL 2');
  assert.equal(openingEntry('classic-2d', { missing: ['webgl2'] }), 'classic-2d');
  assert.equal(openingEntry('3d', { missing: ['webgl2'] }), 'classic-2d', '3D without WebGL 2: Classic 2D, the first enabled entry');
  assert.equal(openingEntry(null, { missing: ['webgl2'] }), 'classic-2d', 'a fresh profile without WebGL 2: Classic 2D');
  assert.equal(openingEntry('records'), 'classic-2d', 'not a mode');
  const entries = [{ id: 'a', mode: 'a', needs: 'webgl2' }, { id: 'b', mode: 'b' }];
  assert.equal(openingEntry(null, { entries, missing: ['webgl2'] }), 'b', 'the first enabled entry, not the first entry');
});

test('each play tile shows its own preview: the Classic 2D, Hexagon and Triangle boards on the dark ground, the stills and the calendar on the light one, 3D locked without WebGL 2; the small entries none', () => {
  assert.deepEqual(menuPreview('classic-2d'), { kind: 'board', grid: 'square', ground: 'dark' });
  assert.deepEqual(menuPreview('hexagon'), { kind: 'board', grid: 'hex', ground: 'dark' }, 'Hexagon: its board on the hex grid');
  assert.deepEqual(menuPreview('triangle'), { kind: 'board', grid: 'tri', ground: 'dark' }, 'Triangle: its board on the tri grid');
  assert.deepEqual(menuPreview('surface'), { kind: 'still', still: 'surface', ground: 'light' }, 'Surface: the torus');
  assert.deepEqual(menuPreview('3d'), { kind: 'still', still: '3d', ground: 'light' }, '3D: a still of the demo board, never the live scene');
  assert.deepEqual(menuPreview('daily'), { kind: 'icon', ground: 'light' }, 'Daily: a calendar icon');
  assert.deepEqual(menuPreview('3d', { missing: ['webgl2'] }), { kind: 'locked', ground: 'locked' }, 'no WebGL 2: the locked preview');
  for (const id of ['classic-2d', 'hexagon', 'triangle']) assert.equal(menuPreview(id, { missing: ['webgl2'] }).kind, 'board', `${id} draws without WebGL 2`);
  assert.equal(menuPreview('records'), null, 'a small entry: no preview');
  assert.equal(menuPreview('settings'), null);
  assert.throws(() => menuPreview('campaign'), /unknown menu entry/);
  const a = menuPreview('classic-2d');
  a.kind = 'x';
  assert.equal(menuPreview('classic-2d').kind, 'board', 'each call its own copy');
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
  assert.equal(a.geometry.kind, 'square');
  assert.deepEqual(demoBoard2D('square').game.mineCount, 40, 'the square grid by name too');

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
  assert.equal(panel.dataset.shows, 'board', 'the panel names what it shows, for a screen\'s own styling of it');

  preview.show({ kind: 'scene', tag: '3D · Demo board 7 × 7 × 7' });
  assert.equal(panel.classList.contains('ui-scene-panel--live'), true, 'the 3D scene draws through the panel');
  assert.deepEqual(shownLayers(), [], 'nothing of the page over it');

  preview.show({ kind: 'daily', tag: 'Daily · 16 Oct 2026' });
  assert.equal(panel.classList.contains('ui-scene-panel--live'), false);
  assert.deepEqual([mounts.length, mounts[1].grid, mounts[1].games, mounts[1].marks], [2, boards.daily.grid, ['daily-game'], [7]], 'the daily board, its start cell marked');
  assert.deepEqual(shownLayers(), ['daily']);
  assert.equal(panel.dataset.shows, 'daily');

  preview.show({ kind: 'board', tag: 'Classic 2D · Intermediate' });
  assert.equal(mounts.length, 2, 'each board view is mounted once');
  assert.deepEqual(mounts[0].games, ['demo-game'], 'an unchanged board is not handed over again');
  boards.daily = { ...boards.daily, key: '20261017', game: 'tomorrow' };
  preview.show({ kind: 'daily', tag: 'Daily · 17 Oct 2026' });
  assert.deepEqual(mounts[1].games, ['daily-game', 'tomorrow'], 'a new day\'s board replaces the old one');

  preview.show({ kind: 'badge', entry: 'quit', label: 'Quit', note: 'Desktop build only', locked: true });
  assert.deepEqual(shownLayers(), ['card']);
  assert.equal(panel.dataset.shows, 'badge');
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
  preview.show({ kind: 'daily', tag: '' });
  assert.equal(tag.classes.has('hidden'), true, 'an empty tag is hidden');
  preview.show({ kind: 'daily', tag: 'Daily · 17 Oct 2026' });
  assert.equal(tag.classes.has('hidden'), false);
});

test('the preview binder: a daily board on each grid in its own view, over its grid; a view that fails to mount shows the mode\'s card', () => {
  const { panel, stage, tag } = stubDoc();
  const mounts = [];
  const asked = [];
  const preview = bindMenuPreview({
    panel, stage, tag,
    iconOf: (entry) => ({ cloneNode: () => `icon:${entry}` }),
    mountBoard: ({ container, grid }) => {
      if (grid === 'tri-grid') throw new Error('no canvas');
      const view = { container, grid, games: [], marks: [], setGame: (g) => view.games.push(g), setMark: (m) => view.marks.push(m) };
      mounts.push(view);
      return view;
    },
    boardOf: (kind, grid) => { asked.push([kind, grid]); return { key: 'today', grid: `${grid}-grid`, game: `${grid}-game`, mark: 3 }; },
  });
  const shownLayers = () => stage.children.filter((c) => !c.hidden).map((c) => [c.dataset.preview, c.dataset.grid ?? null]);
  preview.show({ kind: 'daily', grid: 'square', entry: 'classic-2d', label: 'Classic 2D', tag: '' });
  preview.show({ kind: 'daily', grid: 'hex', entry: 'hexagon', label: 'Hexagon', tag: '' });
  assert.deepEqual(asked, [['daily', 'square'], ['daily', 'hex']], 'the board of each preview\'s grid');
  assert.deepEqual(mounts.map((m) => [m.grid, m.games, m.marks]), [['square-grid', ['square-game'], [3]], ['hex-grid', ['hex-game'], [3]]], 'one view per grid');
  assert.deepEqual(shownLayers(), [['daily', 'hex']]);
  assert.equal(panel.dataset.shows, 'daily');
  preview.show({ kind: 'daily', grid: 'square', entry: 'classic-2d', label: 'Classic 2D', tag: '' });
  assert.equal(mounts.length, 2, 'each grid\'s view is mounted once');
  assert.deepEqual(shownLayers(), [['daily', 'square']]);

  preview.show({ kind: 'daily', grid: 'tri', entry: 'triangle', label: 'Triangle', tag: 'Daily' });
  assert.equal(panel.dataset.shows, 'badge', 'the panel shows a card');
  assert.equal(tag.classes.has('hidden'), true);
  const card = stage.children.find((c) => c.dataset.preview === 'card');
  assert.equal(card.hidden, false);
  const [badge, name] = card.children[0].children;
  assert.deepEqual([badge.dataset, badge.children, name.textContent], [{ entry: 'triangle' }, ['icon:triangle'], 'Triangle']);
  assert.deepEqual(shownLayers(), [['card', null]], 'the failed layer stays hidden');
  preview.show({ kind: 'daily', grid: 'tri', entry: 'triangle', label: 'Triangle', tag: '' });
  assert.equal(asked.filter(([, g]) => g === 'tri').length, 1, 'a failed mount is not tried again');
  assert.equal(panel.dataset.shows, 'badge');
});

test('the Hexagon and Triangle daily previews are today\'s closed daily boards on their grids, their start cells marked', () => {
  const now = new Date(2026, 9, 16, 9, 30);
  for (const [grid, id, cells] of [['hex', 'hex-expert', 480], ['tri', 'tri-expert', 41 * 17]]) {
    const daily = dailyPreview(now, grid);
    const g = dailyGame(id, dateText(now));
    const d = dailyBoard2D(daily);
    assert.equal(d.geometry.kind, grid);
    assert.deepEqual([d.grid.width, d.grid.height, d.game.mineCount], [g.board.width, g.board.height, g.board.mines]);
    assert.equal(d.grid.graph.count, cells, 'one cell per tile of the board');
    assert.equal(d.mark, g.startCell);
    assert.ok(Array.from({ length: cells }, (_, c) => d.game.cellState(c)).every((x) => x === 'closed'), 'closed');
  }
});

test('the play tiles\' previews: the Classic 2D, Hexagon and Triangle board views mounted at once in their tiles\' art, each over its grid and handed its game; a mount that fails leaves the plain ground', () => {
  const tile = (entry) => {
    const art = { children: ['stale'], replaceChildren: (...xs) => { art.children = xs; } };
    const preview = { dataset: {} };
    return { dataset: { entry }, art, preview, querySelector: (sel) => (sel === '.ui-play-tile__art' ? art : preview) };
  };
  const tiles = MENU_ENTRIES.filter((e) => e.block === 0).map((e) => tile(e.id));
  const mounted = [];
  const demos = Object.fromEntries(['square', 'hex', 'tri'].map((g) => [g, { grid: { width: 16, height: 16, g }, geometry: g, game: `${g}-game` }]));
  const demo = demos.square;
  const views = mountTilePreviews({
    tiles,
    previewOf: (id) => menuPreview(id),
    mountBoard: ({ container, grid, geometry }) => {
      const view = { container, grid, geometry, games: [], marks: [], setGame: (g) => view.games.push(g), setMark: (m) => view.marks.push(m) };
      mounted.push(view);
      return view;
    },
    boardOf: (kind, grid) => (kind === 'board' ? demos[grid] : null),
  });
  assert.deepEqual([...views.keys()], ['classic-2d', 'hexagon', 'triangle'], 'only the board previews are drawn by views, one per tile; the others are the tiles\' own art');
  assert.equal(mounted.length, 3, 'one view each');
  for (const [i, g] of ['square', 'hex', 'tri'].entries()) {
    assert.deepEqual([mounted[i].container, mounted[i].grid, mounted[i].geometry, mounted[i].games, mounted[i].marks],
      [tiles[i].art, demos[g].grid, g, [`${g}-game`], [-1]], `${g}: its demo game in its own tile, no mark`);
  }
  const failing = [tile('classic-2d')];
  const none = mountTilePreviews({ tiles: failing, previewOf: (id) => menuPreview(id), mountBoard: () => { throw new Error('no canvas'); }, boardOf: () => demo });
  assert.equal(none.size, 0);
  assert.deepEqual([failing[0].art.children, failing[0].preview.dataset], [[], { failed: '' }], 'the fallback: the preview\'s plain ground');
});

test('the Hexagon and Triangle previews are their modes\' Intermediate boards, real engine games built from the fixed seed, the same on every load, each on its grid\'s geometry', () => {
  for (const [kind, mode] of [['hex', HEXAGON], ['tri', TRIANGLE]]) {
    const a = demoBoard2D(kind);
    const b = demoBoard2D(kind);
    const { width, height, mines } = mode.standardSizes.intermediate;
    const n = width * height;
    assert.deepEqual([a.grid.width, a.grid.height, a.game.mineCount], [width, height, mines], `${kind}: Intermediate`);
    assert.equal(a.geometry.kind, kind, `${kind}: its grid's geometry`);
    assert.deepEqual([a.geometry.width, a.geometry.height], [width, height]);
    const own = mode.createGrid(width, height).graph;
    assert.ok(Array.from({ length: n }, (_, c) => c).every((c) => String(Array.from(a.grid.graph.neighbours(c))) === String(Array.from(own.neighbours(c)))), `${kind}: the mode's own graph`);
    const states = (g) => Array.from({ length: n }, (_, c) => `${g.cellState(c)}${g.cellNumber(c)}`).join();
    assert.equal(states(a.game), states(b.game), `${kind}: the same board each time`);
    const cells = Array.from({ length: n }, (_, c) => a.game.cellState(c));
    const revealed = cells.filter((x) => x === 'revealed').length;
    assert.ok(revealed > 5 && revealed < n - mines, `${kind}: an opening revealed (${revealed} cells)`);
    assert.ok(cells.includes('flagged'), `${kind}: a few flags`);
    assert.equal(a.game.phase, 'playing', `${kind}: a game in progress`);
  }
  assert.notDeepEqual([demoBoard2D('hex').geometry.kind, demoBoard2D('hex').grid.width], [demoBoard2D('tri').geometry.kind, demoBoard2D('tri').grid.width], 'each kind its own mode\'s board');
  assert.throws(() => demoBoard2D('cube'), RangeError, 'no flat mode on that grid');
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

test('Hexagon and Triangle, registered, take the mode route to their board choice; Surface, not registered, stays on Coming soon', () => {
  const modes = createModeHost();
  const fakes = { 'classic-2d': fakeMode(), hexagon: fakeMode(), triangle: fakeMode(), '3d': fakeMode() };
  for (const [id, f] of Object.entries(fakes)) modes.register(id, f.factory);
  const router = fakeRouter(['menu', 'coming-soon', 'daily', 'records', 'settings']);
  const menu = createMenu({ router, modes, missing: ['webgl2'] });
  assert.deepEqual(menu.open('hexagon'), { mode: 'hexagon' });
  assert.deepEqual(menu.open('triangle'), { mode: 'triangle' });
  assert.deepEqual([fakes.hexagon.calls, fakes.triangle.calls], [['openBoardChoice'], ['openBoardChoice']], 'each opens its own board choice');
  assert.equal(modes.active, null, 'opening a board choice starts no game');
  assert.deepEqual(menu.open('surface'), { screen: PLACEHOLDER_SCREEN, data: { entry: 'surface', title: 'Surface' } });
  assert.equal(menu.open('3d'), null, 'an unavailable entry still opens nothing');
  assert.deepEqual(fakes['3d'].calls, []);
  assert.deepEqual(router.went, [['coming-soon', { entry: 'surface', title: 'Surface' }]], 'only Surface reaches the router');
});

test('the shell registers Hexagon and Triangle on the mode host, so their entries take the mode route, each board choice opened on its last board', () => {
  const main = read('js/main.js');
  assert.match(main, /const MODES = createModeHost\(\);[\s\S]*const MENU = createMenu\(\{ router: SHELL, modes: MODES, missing: MISSING \}\);/);
  assert.match(main, /const mode = MODES\.register\(config\.id, /, 'each flat mode registered under its configuration\'s id');
  assert.match(main, /const HEX_MODE = flatMode\(HEXAGON, 'hex'\);\nconst TRI_MODE = flatMode\(TRIANGLE, 'tri'\);/);
  for (const [screen, binder] of [['hexagon-choice', 'HEX_MODE'], ['triangle-choice', 'TRI_MODE']]) {
    assert.match(main, new RegExp(`'${screen}': \\{[^\\n]*${binder}\\.show\\(d\\.choice \\?\\? ${binder}\\.lastChoice\\.current, from\\)`),
      `${screen} shows the choice handed in, else the mode's last board`);
  }
  assert.match(read('js/classic2d/mode.js'), /openBoardChoice\(\) \{ flow\.openBoardChoice\(lastChoice\.current\); \}/, 'the mode offers its last board choice');
  assert.match(main, /const LAST_MODE = createLastMode\(\{ storage, modes: \{ has: \(m\) => MODES\.has\(m\), on: /,
    'the last mode reads a stored mode against the registered ones');
});

// ---------------------------------------------------------------- an entry the browser cannot run

test('the 3D entry needs WebGL 2; without it the entry is unavailable with its reason and routes nowhere', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.needs ?? null), [null, null, null, null, 'webgl2', null, null, null], 'only 3D needs anything: WebGL 2');
  assert.deepEqual(UNAVAILABLE_REASONS, { webgl2: 'Needs WebGL 2 — not available in this browser' });
  assert.deepEqual(UNAVAILABLE_SHORT_REASONS, { webgl2: 'Needs WebGL 2' }, 'a phone row\'s short reason');
  assert.ok(Object.isFrozen(UNAVAILABLE_REASONS) && Object.isFrozen(UNAVAILABLE_SHORT_REASONS));
  const all = { hasMode: () => true, hasScreen: () => true };
  const three = MENU_ENTRIES.find((e) => e.id === '3d');
  assert.equal(entryReason(three, ['webgl2']), UNAVAILABLE_REASONS.webgl2);
  assert.equal(entryReason(three, []), null, 'with WebGL 2 the entry is available');
  assert.equal(entryReason(three), null, 'nothing missing by default');
  assert.equal(entryRoute(three, { ...all, missing: ['webgl2'] }), null, 'an unavailable entry routes nowhere');
  assert.deepEqual(entryRoute(three, all), { mode: '3d' });
  assert.equal(entryShortReason(three, ['webgl2']), 'Needs WebGL 2', 'its phone row\'s reason');
  assert.equal(entryShortReason(three, []), null);
  for (const entry of MENU_ENTRIES.filter((e) => e.id !== '3d')) {
    assert.equal(entryReason(entry, ['webgl2']), null, `${entry.label} runs without WebGL 2`);
    assert.equal(entryShortReason(entry, ['webgl2']), null);
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
  const fakes = { '3d': fakeMode(), 'classic-2d': fakeMode(), hexagon: fakeMode(), triangle: fakeMode() };
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

  for (const id of ['hexagon', 'triangle']) {
    modes.start(id, {});
    fakes[id].click();
    await settle();
    assert.equal(last.current, id, `${id} is a mode of its own`);
    assert.deepEqual(JSON.parse(backend.documents.get(LAST_MODE_DOC)), { version: 1, data: { mode: id } });
    assert.equal(openingEntry(last.current), id, 'and the menu opens on it');
  }
});

test('the last mode is read back at start-up; nothing stored or a malformed document reads as none', async () => {
  const stored = (data) => createMemoryBackend({ initial: { [LAST_MODE_DOC]: JSON.stringify({ version: 1, data }) } });
  const loadFrom = async (backend) => {
    const modes = createModeHost();
    for (const id of ['classic-2d', 'hexagon', 'triangle', '3d']) modes.register(id, fakeMode().factory);
    const last = createLastMode({ storage: createStorage({ backend }), modes });
    const mode = await last.load();
    assert.equal(last.current, mode);
    return mode;
  };
  assert.equal(await loadFrom(stored({ mode: '3d' })), '3d');
  assert.equal(await loadFrom(stored({ mode: 'hexagon' })), 'hexagon');
  assert.equal(await loadFrom(stored({ mode: 'triangle' })), 'triangle');
  assert.equal(await loadFrom(stored({ mode: 'surface' })), null, 'a mode not registered reads as none');
  assert.equal(await loadFrom(stored({ mode: 'campaign' })), null, 'an unknown mode reads as none');
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

test('the demo board the shell builds is one size, the one the 3D still shows', () => {
  assert.deepEqual(DEMO_BOARD_3D, { X: 7, Y: 7, Z: 7 });
  const demo = read('js/shell/menu-preview.js').match(/export function demoBoard3D\(random = Math\.random\) \{[\s\S]*?\n\}/)[0];
  assert.match(demo, /create3DGame\(\{ \.\.\.DEMO_BOARD_3D,/, 'demoBoard3D builds the board of that size');
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

test('index.html: the menu\'s window under its title bar, the play tiles with their own previews then the small entries, Quit only in the title bar, and a foot of the build label alone', () => {
  assert.match(MENU, /<section id="menu" class="overlay" aria-label="Main menu">\s*<section class="ui-frame" id="menu-frame" aria-labelledby="menu-title">/, 'the menu in its window, no game title above it');
  assert.match(MENU, /<header class="ui-frame__head">\s*<div class="ui-frame__start"><\/div>\s*<h1 class="ui-logo ui-frame__logo" id="menu-title" aria-label="Minesweeper 3D"><\/h1>/, 'the title bar with no Back, the logo naming the menu');
  assert.match(MENU, /<div class="ui-frame__window"[^>]*>[\s\S]*?data-window="quit"/, 'Quit is the title bar\'s');
  assert.doesNotMatch(MENU, /ui-frame__heading/, 'no heading: the logo names it');
  assert.match(MENU, /<div class="ui-frame__body" id="menu-body">\s*<div class="ui-mode-list" id="menu-entries" role="group" aria-label="Main menu">\s*<div class="ui-mode-list__tiles">\s*<button type="button" class="ui-play-tile"/,
    'the buttons in the body, the play tiles first');
  assert.match(MENU, /<\/button>\s*<\/div>\s*<div class="ui-mode-list__places">\s*<button type="button" class="ui-small-entry"[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<\/div>\s*<footer/,
    'then the small entries');
  const tiles = [...MENU.matchAll(/<button type="button" class="ui-play-tile" id="menu-entry-([\w-]+)" data-entry="([\w-]+)"><span class="ui-play-tile__side"><span class="ui-play-tile__top"><span class="ui-play-tile__icon" aria-hidden="true"><svg [^>]*>[\s\S]*?<\/svg><\/span><span class="ui-play-tile__lock" aria-hidden="true"><svg [^>]*>[\s\S]*?<\/svg><\/span><\/span><span class="ui-play-tile__text"><span class="ui-play-tile__label">([^<]+)<\/span><\/span><\/span><span class="ui-play-tile__preview( ui-play-tile__preview--light)?" data-preview="(\w+)" aria-hidden="true"><span class="ui-play-tile__art"( id="[\w-]+")?>([\s\S]*?)<\/span><\/span><\/button>/g)];
  const playing = MENU_ENTRIES.filter((e) => e.block === 0);
  assert.deepEqual(tiles.map((m) => m[2]), playing.map((e) => e.id), 'a play tile per mode and Daily, in menu order');
  assert.deepEqual(tiles.map((m) => m[1]), playing.map((e) => e.id), 'each with its id');
  assert.deepEqual(tiles.map((m) => m[3]), playing.map((e) => e.label));
  for (const m of tiles) {
    const preview = menuPreview(m[2]);
    assert.equal(m[5], preview.kind, `${m[2]}: its preview is the one menuPreview names`);
    assert.equal(!!m[4], preview.ground === 'light', `${m[2]}: on its ${preview.ground} ground`);
  }
  const art = Object.fromEntries(tiles.map((m) => [m[2], [m[6]?.trim() ?? null, m[7]]]));
  for (const id of ['classic-2d', 'hexagon', 'triangle']) assert.deepEqual(art[id], [`id="menu-preview-${id}"`, ''], `${id}: its board view mounts there`);
  assert.equal(art.surface[1], '<img class="ui-play-tile__still" data-still="surface" src="assets/menu/surface.png" alt="">', 'Surface: the torus still');
  assert.equal(art['3d'][1], '<img class="ui-play-tile__still" data-still="3d" src="assets/menu/3d.png" alt="">', '3D: the demo board\'s still, no live scene');
  assert.match(art.daily[1], /^<svg class="ui-play-tile__calendar" viewBox="0 0 160 140">/, 'Daily: the calendar icon');
  const small = [...MENU.matchAll(/<button type="button" class="ui-small-entry" id="menu-entry-([\w-]+)" data-entry="([\w-]+)"><span class="ui-small-entry__icon" aria-hidden="true"><svg [^>]*>[\s\S]*?<\/svg><\/span><span class="ui-small-entry__label">([^<]+)<\/span><\/button>/g)];
  assert.deepEqual(small.map((m) => [m[1], m[2], m[3]]), [['records', 'records', 'Records'], ['settings', 'settings', 'Settings']], 'Records and Settings, the small entries');
  assert.equal([...MENU.matchAll(/data-entry="/g)].length, MENU_ENTRIES.length, 'no other entry: no Quit');
  assert.equal([...MENU.matchAll(/class="ui-mode-list"/g)].length, 1, 'one list of buttons');
  assert.doesNotMatch(MENU, /ui-scene-panel|menu-preview-stage|ui-chip|data-last|Last played/, 'no preview panel and no Last played chip');
  assert.match(MENU, /<footer class="ui-frame__foot" id="menu-foot">\s*<p id="touch-note" class="ui-text hidden" data-icon="hand" role="alert"><span class="ui-note__text">[^<]*<\/span><\/p>\s*<p class="ui-text ui-text--muted" id="menu-build"><\/p>\s*<\/footer>/,
    'the foot: the build label, and the touch note on a touch device; no key hints');
  assert.doesNotMatch(MENU, /ui-key-hint|menu-hints/, 'no Move / Select hints');
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

test('the placeholder screen is a screen frame on the backdrop: the title bar\'s Back, the mode as its heading, the line and Back', () => {
  assert.match(SOON, /<section id="coming-soon" class="overlay ui-backdrop hidden" aria-label="Coming soon">/);
  assert.match(SOON, /<section class="ui-frame" id="coming-soon-frame" aria-labelledby="coming-soon-title">\s*<div class="ui-frame__chrome" data-slot="window-chrome" aria-hidden="true"><\/div>/);
  assert.match(SOON, /<div class="ui-frame__start"><button type="button" id="coming-soon-menu" class="ui-button ui-button--secondary ui-button--sm ui-frame__back" data-back data-icon="arrow-left" aria-label="Back to Main menu" title="Back"><\/button><\/div>\s*<h1 class="ui-logo ui-frame__logo" aria-label="Minesweeper 3D"><\/h1>/,
    'the title bar: Back its arrow alone, named Back to Main menu, then the logo');
  assert.match(SOON, /<div class="ui-frame__heading">\s*<h2 class="ui-frame__title" id="coming-soon-title">Coming soon<\/h2>\s*<div class="ui-frame__action"><\/div>\s*<\/div>/,
    'the heading: the title the shell sets to the mode, no action');
  assert.match(SOON, /<span id="coming-soon-badge" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"\/><path d="M8 11V8a4 4 0 0 1 8 0v3"\/><\/svg><\/span>\s*<h3 class="ui-card__title" id="coming-soon-heading">Coming soon<\/h3>\s*<p id="coming-soon-text" class="ui-text">This part of the game is coming soon\.<\/p>/,
    'the lock badge above the title and its line');
  assert.match(SOON, /<button type="button" id="coming-soon-back" class="ui-button ui-button--secondary" data-icon="arrow-left">Back <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button>/);
  assert.doesNotMatch(SOON, /ui-card ui-screen|data-esc-hint/, 'no card: the frame, its Back holding its key hint');
  const ui = read('js/ui.js');
  const show = ui.slice(ui.indexOf('showComingSoon(title) {'), ui.indexOf('\n  }\n', ui.indexOf('showComingSoon(title) {')));
  assert.match(show, /this\.el\.comingSoonTitle\.textContent = title;/, 'the mode it was opened for names it');
  assert.doesNotMatch(show, /comingSoonText/, 'the line stays "This part of the game is coming soon."');
  assert.match(ui, /for \(const id of \['coming-soon-back', 'coming-soon-menu', 'settings-back'\]\) \$\(id\)\.addEventListener\('click', \(\) => cb\.onBack\?\.\(\)\);/,
    'both go Back');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /#coming-soon-frame \{[^}]*width: 900px;[^}]*height: 560px;[^}]*margin-top: -8px;/, 'the frame at the canvas\'s size, 4 px above centre');
  assert.match(css, /#coming-soon-panel \{[^}]*gap: 16px;/, 'the badge, title, line and Back 16 px apart');
  assert.match(css, /#coming-soon-badge \{[^}]*width: 120px;[^}]*height: 120px;/, 'the badge 120 px square');
  assert.match(css, /@media \(max-width: 719px\) \{[^@]*#coming-soon-frame \{[^}]*width: 100%;[^}]*height: 100%;[^}]*margin-top: 0;/, 'full-bleed on a phone');
  const theme = read('themes/joyful-tiles/theme.css');
  assert.match(theme, /:root\[data-theme="joyful-tiles"\] #coming-soon-badge \{[^}]*border-radius: 30px;[^}]*background: var\(--color-locked\);[^}]*box-shadow: 0 8px 0 var\(--color-locked-edge\);/,
    'the badge: radius 30, the locked fill and its drop');
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
  assert.match(MAIN, /const MISSING = WEBGL2 \? \[\] : \['webgl2'\];/, 'what the browser lacks');
  assert.match(MAIN, /createMenu\(\{ router: SHELL, modes: MODES, missing: MISSING \}\)/, 'the menu knows it');
  assert.match(MAIN, /ui\.setEntryUnavailable\(entry\.id, entryReason\(entry, MISSING\), entryShortReason\(entry, MISSING\)\)/, 'the menu button shows the reason, short on a phone row');
  assert.match(MAIN, /document\.body\.classList\.toggle\('no-webgl2', !WEBGL2\)/, 'the page knows it has no 3D scene');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /body\.no-webgl2 #scene \{ display: none; \}/, 'the #scene canvas is hidden');
  assert.doesNotMatch(css, /:is\(#menu, #board-choice, #coming-soon, #c2d-choice, #settings, #records\) \{[^}]*background/,
    'the menu screens carry no tint of their own: without WebGL 2 they sit on the body\'s static backdrop');
  assert.match(read('themes/joyful-tiles/theme.css'), /body \{[^}]*background-color: var\(--color-ground\);[^}]*background-image: radial-gradient\([^)]*var\(--color-ground-dot\)/,
    'the body\'s backdrop, built from the theme tokens');
  const hook = MAIN.slice(MAIN.indexOf('window.__ms = {'));
  assert.match(hook.match(/start\(X, Y, Z, mines, minePositions\) \{[^\n]*/)[0], /if \(!WEBGL2\) throw new Error\(/, 'the start hook reports the reason');
  assert.match(INDEX, /<noscript>[\s\S]*<h2 class="ui-card__title" id="noscript-title">Minesweeper 3D needs JavaScript\.<\/h2>[\s\S]*<\/noscript>/, 'the noscript line asks only for JavaScript');
  assert.match(INDEX, /The game files failed to load\. Check your connection and reload the page\./, 'the onerror card stays');
  assert.match(read('README.md'), /3D needs WebGL 2; Classic 2D, Records and Settings run without it\./);
});

test('the catalogue documents the main menu, the 3D board choice and the placeholder', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  const menu = head.match(/Main menu \(index\.html #menu\)[\s\S]*?Default focus:\s+the\s+entry\s+last\s+opened[\s\S]*?last\s+mode\s+played[^.]*\./)?.[0] ?? '';
  assert.match(menu, /ui-frame[\s\S]*?title bar with no Back[\s\S]*?ui-mode-list[\s\S]*?ui-play-tile[\s\S]*?ui-small-entry[\s\S]*?build label/);
  assert.doesNotMatch(menu, /ui-scene-panel|ui-key-hints|ui-chip|Quit,/, 'no preview panel, no key hints, no chip, no Quit entry');
  assert.match(menu, /no Last played chip and no preview panel[\s\S]*?no key hints/);
  assert.match(head, /3D board choice \(index\.html #board-choice\)/);
  assert.match(head, /Coming soon \(index\.html #coming-soon\)/);
});

// ---------------------------------------------------------------- browser

test('in a browser, the menu shows its eight buttons, every play tile its own preview at once and no 3D scene, each routes, and Back returns to its entry', async (t) => {
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
    const shown = () => ms(() => ['menu', 'board-choice', 'coming-soon', 'records', 'c2d-choice', 'hex-choice', 'tri-choice', 'settings', 'daily', 'ready', 'pause']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')));
    const backdrop = () => ms(() => globalThis.__ms.renderer.game === globalThis.__ms.state.demo);
    // What every play tile's preview shows, and whether the 3D scene shows or draws anywhere on the menu.
    const previews = () => ms(() => Object.fromEntries([...document.querySelectorAll('#menu .ui-play-tile')].map((b) => {
      const p = b.querySelector('.ui-play-tile__preview');
      const art = p.querySelector('.ui-play-tile__art');
      const img = art.querySelector('img');
      return [b.dataset.entry, {
        kind: p.dataset.preview, light: p.classList.contains('ui-play-tile__preview--light'),
        canvas: !!art.querySelector('canvas'), still: img ? img.complete && img.naturalWidth > 0 : null,
        shown: p.getBoundingClientRect().width > 0,
      }];
    })));
    const scene = () => ms(() => ({ shown: getComputedStyle(document.getElementById('scene')).visibility === 'visible', target: globalThis.__ms.renderer.target }));
    const select = async (id) => { await page.focus(`#menu-entry-${id}`); };
    assert.equal(await ms(() => document.getElementById('menu-build').textContent), buildLabel(VERSION), 'the build label shows the release version');

    // The eight buttons, in order, visible; the first takes the focus when no mode was played yet.
    assert.equal(await mode(), 'menu');
    const labels = await ms(() => [...document.querySelectorAll('#menu [data-entry]')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.querySelector('.ui-play-tile__label, .ui-small-entry__label').textContent));
    assert.deepEqual(labels, ['Classic 2D', 'Hexagon', 'Triangle', 'Surface', '3D', 'Daily', 'Records', 'Settings']);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.equal(await ms(() => document.querySelectorAll('#menu [aria-disabled="true"]').length), 0, 'with WebGL 2 nothing is disabled');
    assert.equal(await ms(() => document.querySelectorAll('#menu .ui-chip, #menu [data-last]').length), 0, 'no Last played chip');

    // Every tile's own preview at once: the Classic 2D, Hexagon and Triangle boards drawn by their board views, the others their art.
    await page.waitForFunction(() => ['classic-2d', 'hexagon', 'triangle'].every((id) => document.querySelector(`#menu-preview-${id} canvas`)));
    await page.waitForFunction(() => [...document.querySelectorAll('#menu img.ui-play-tile__still')].every((i) => i.complete && i.naturalWidth > 0));
    const all = {
      'classic-2d': { kind: 'board', light: false, canvas: true, still: null, shown: true },
      hexagon: { kind: 'board', light: false, canvas: true, still: null, shown: true },
      triangle: { kind: 'board', light: false, canvas: true, still: null, shown: true },
      surface: { kind: 'still', light: true, canvas: false, still: true, shown: true },
      '3d': { kind: 'still', light: true, canvas: false, still: true, shown: true },
      daily: { kind: 'icon', light: true, canvas: false, still: null, shown: true },
    };
    assert.deepEqual(await previews(), all);
    assert.deepEqual(await scene(), { shown: false, target: null }, 'the menu shows no 3D scene');
    // None follows the selection: selecting 3D shows the same still and still no scene.
    for (const id of ['3d', 'daily', 'hexagon', 'records']) {
      await select(id);
      assert.deepEqual(await previews(), all, `${id} selected: every preview unchanged`);
      assert.deepEqual(await scene(), { shown: false, target: null }, `${id} selected: no 3D scene`);
    }
    // The mouse selects as the keys do.
    const box = await page.locator('#menu-entry-triangle').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);
    assert.equal(await active(), 'menu-entry-triangle');

    // Classic 2D: its board choice, Back by its button to the entry.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.deepEqual(await shown(), ['c2d-choice']);
    assert.ok(await backdrop(), 'the backdrop stays behind the board choice');
    await page.click('#c2d-choice-back');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');
    assert.deepEqual(await shown(), ['menu']);
    assert.equal(await active(), 'menu-entry-classic-2d');

    // Hexagon and Triangle: each its own board choice; Back returns with the entry selected.
    for (const [id, layer] of [['hexagon', 'hex-choice'], ['triangle', 'tri-choice']]) {
      await page.click(`#menu-entry-${id}`);
      assert.equal(await mode(), `${id}-choice`);
      assert.deepEqual(await shown(), [layer]);
      await page.keyboard.press('Escape');
      assert.equal(await mode(), 'menu');
      assert.equal(await active(), `menu-entry-${id}`, `Back returns with ${id} selected`);
    }
    // Surface: the placeholder titled with the mode; Back returns with the entry selected.
    await page.click('#menu-entry-surface');
    assert.equal(await mode(), 'coming-soon');
    assert.equal(await ms(() => document.getElementById('coming-soon-title').textContent), 'Surface');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    assert.equal(await active(), 'menu-entry-surface', 'Back returns with Surface selected');

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
    assert.equal(await ms(() => document.body.classList.contains('scene-off')), true, 'back on the menu: still no 3D scene');
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
    assert.equal(await ms(() => document.querySelectorAll('#menu .ui-chip, #menu [data-last]').length), 0, 'and marks it with no chip');
    // Enter, then Play: its board choice opens on the board last played.
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'board-choice');
    assert.equal(await ms(() => document.activeElement?.dataset.preset), '6,6,6,10', 'the last board is selected');
    await page.keyboard.press('Escape');

    // It survives a reload.
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.waitForFunction(() => document.activeElement?.id === 'menu-entry-3d');
    assert.deepEqual(await scene(), { shown: false, target: null }, 'the 3D tile focused: its still, no live scene');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the menu fits each window as its artboard draws it: the window\'s size and place, the play tiles two by two of one height, none growing when selected, the previews\' squares, labels and icons, the small entries, no sideways scroll; a phone\'s rows in one column with their preview strips; a coarse pointer keeps every button a 44 px touch target; no key hints', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    // Per window size (J-Menu-xl, -l, -m, -p): the window's place [left, top, right, bottom], the body's
    // padding [top, side], the gap between buttons, the space before the small entries, the preview
    // square, the play tile's label and icon box, the small entry's height, label and icon box.
    const SIZES = [
      { width: 1920, height: 1080, frame: [470, 64, 1450, 1016], pad: [22, 26], gap: 12, block: 24, preview: 175, label: 30, icon: 52, small: [64, 21, 40] },
      { width: 1366, height: 768, frame: [303, 28, 1063, 740], pad: [16, 22], gap: 10, block: 20, preview: 116, label: 24, icon: 42, small: [52, 19, 34] },
      { width: 1024, height: 768, frame: [132, 28, 892, 740], pad: [16, 22], gap: 10, block: 20, preview: 116, label: 24, icon: 42, small: [52, 19, 34] },
      { width: 390, height: 844, frame: [0, 0, 390, 844], pad: [16, 18], gap: 8, block: 16, strip: 106, label: 20, icon: 36, small: [50, 19, 34], phone: true },
    ];
    // Laid out at the window's size: two frames, then every animation that ends (a button's move) done.
    const settle = async (page) => {
      await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
      await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().endTime === Infinity),
        null, { timeout: patience(2000) });
    };
    const measure = (page) => page.evaluate(() => {
      const rect = (el) => el.getBoundingClientRect();
      const px = (el, prop) => parseFloat(getComputedStyle(el)[prop]);
      const tiles = [...document.querySelectorAll('#menu .ui-play-tile')];
      const small = [...document.querySelectorAll('#menu .ui-small-entry')];
      const body = document.getElementById('menu-body');
      return {
        frame: ['left', 'top', 'right', 'bottom'].map((k) => Math.round(rect(document.getElementById('menu-frame'))[k])),
        body: [rect(body).top, rect(body).left, px(body, 'paddingTop'), px(body, 'paddingLeft')],
        head: rect(document.querySelector('#menu-frame > .ui-frame__head')).bottom,
        // offsetTop and offsetHeight: the selected tile's transform left out
        tiles: tiles.map((b) => ({ id: b.dataset.entry, left: Math.round(rect(b).left), top: b.offsetTop, height: b.offsetHeight, width: b.offsetWidth })),
        small: small.map((b) => ({ left: Math.round(rect(b).left), top: b.offsetTop, height: b.offsetHeight })),
        places: document.querySelector('#menu .ui-mode-list__places').offsetTop,
        tilesBottom: document.querySelector('#menu .ui-mode-list__tiles').offsetTop + document.querySelector('#menu .ui-mode-list__tiles').offsetHeight,
        gap: px(document.querySelector('#menu .ui-mode-list__tiles'), 'rowGap'),
        preview: tiles.map((b) => { const r = rect(b.querySelector('.ui-play-tile__preview')); const t = rect(b); return [Math.round(r.width), Math.round(r.height), Math.round(t.right - r.right), Math.round(r.top - t.top), Math.round(t.bottom - r.bottom)]; }),
        label: px(tiles[1].querySelector('.ui-play-tile__label'), 'fontSize'),
        icon: px(tiles[1].querySelector('.ui-play-tile__icon'), 'width'),
        smallLabel: px(small[0].querySelector('.ui-small-entry__label'), 'fontSize'),
        smallIcon: px(small[0].querySelector('.ui-small-entry__icon'), 'width'),
        hints: document.querySelectorAll('#menu .ui-key-hint').length,
        scroll: document.documentElement.scrollWidth,
        build: rect(document.getElementById('menu-build')).bottom,
      };
    });
    const fit = async (page, size) => {
      const { width, height } = size;
      const label = `${width} × ${height}`;
      const m = await measure(page);
      assert.deepEqual(m.frame, size.frame, `${label}: the window's place`);
      assert.ok(Math.abs(m.body[0] - m.head) <= 1, `${label}: the body under the title bar`);
      assert.deepEqual(m.body.slice(2), size.pad, `${label}: the body's padding`);
      assert.equal(m.gap, size.gap, `${label}: the buttons ${size.gap} px apart`);
      const heights = new Set(m.tiles.map((x) => x.height));
      assert.equal(heights.size, 1, `${label}: every play tile one height, the selected one too (${[...heights]})`);
      if (size.phone) {
        assert.equal(new Set(m.tiles.map((x) => x.left)).size, 1, `${label}: one column of phone rows`);
        assert.ok(m.preview.every(([w, h, right, top, bottom]) => w === size.strip && right === 8 && top === 8 && bottom === 8 && h === m.tiles[0].height - 16),
          `${label}: each row's preview a ${size.strip} px strip pinned 8 px inside its right end, the row's height less its insets (${JSON.stringify(m.preview)})`);
        assert.equal(new Set(m.small.map((x) => x.left)).size, 1, `${label}: the small entries stacked`);
      } else {
        const [left, right] = [...new Set(m.tiles.map((x) => x.left))];
        assert.deepEqual(m.tiles.map((x) => x.left === left ? 0 : x.left === right ? 1 : -1), [0, 1, 0, 1, 0, 1], `${label}: two columns — Classic 2D · Hexagon, Triangle · Surface, 3D · Daily`);
        assert.deepEqual([...new Set(m.tiles.map((x) => x.top))].length, 3, `${label}: in three rows`);
        assert.ok(m.preview.every(([w, h]) => w === size.preview && h === size.preview), `${label}: each preview a ${size.preview} px square (${JSON.stringify(m.preview)})`);
        assert.deepEqual(new Set(m.small.map((x) => x.top)).size, 1, `${label}: the small entries side by side`);
      }
      assert.ok(Math.abs(m.places - m.tilesBottom - size.block) <= 0.5, `${label}: the small entries ${size.block} px after the tiles (${m.places - m.tilesBottom})`);
      assert.deepEqual([m.label, m.icon], [size.label, size.icon], `${label}: the play tile's label and icon box`);
      assert.deepEqual([m.small[0].height, m.smallLabel, m.smallIcon], size.small, `${label}: the small entry's height, label and icon box`);
      assert.equal(m.hints, 0, `${label}: no key hints`);
      assert.ok(m.scroll <= width, `${label}: no sideways scroll (${m.scroll})`);
      assert.ok(m.build <= height, `${label}: the build label inside the window (${m.build})`);
    };

    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.activeElement?.id === 'menu-entry-classic-2d');
    // The Classic 2D preview is drawn with the board module's gap: until its number font has loaded the
    // skin has no module, and the board is laid out — steadily — with none.
    await page.evaluate(async () => {
      const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
      while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
    });
    for (const size of SIZES.filter((s) => !s.phone)) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await page.focus('#menu-entry-classic-2d');
      await settle(page);
      await fit(page, size);
      // The Classic 2D, Hexagon and Triangle boards, near playing size, larger than their squares: cropped from the middle, no edge showing.
      await assertBoardsCropped(page, `${size.width}`);
      // Selected, a tile keeps its size and place in the grid, only moved down level with the surface.
      const before = await page.evaluate(() => { const b = document.getElementById('menu-entry-hexagon'); return [b.offsetTop, b.offsetHeight, b.offsetWidth]; });
      await page.focus('#menu-entry-hexagon');
      await settle(page);
      assert.deepEqual(await page.evaluate(() => { const b = document.getElementById('menu-entry-hexagon'); return [b.offsetTop, b.offsetHeight, b.offsetWidth]; }), before,
        `${size.width}: a selected tile keeps its size`);
    }
    await page.close();

    // A touch phone: the phone's artboard; then resized to a coarse pointer at 1366 and 1024.
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await context.newPage();
    await phone.goto(`${base}/index.html?still-backdrop`);
    await phone.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.activeElement?.id === 'menu-entry-classic-2d');
    await settle(phone);
    await fit(phone, SIZES.find((s) => s.phone));
    await assertBoardsCropped(phone, 'a phone row');
    assert.equal(await phone.evaluate(() => document.getElementById('touch-note').classList.contains('hidden')), false, 'the touch note in the foot');
    for (const [width, height] of [[1366, 768], [1024, 768]]) {
      await phone.setViewportSize({ width, height });
      await settle(phone);
      const m = await phone.evaluate(() => ({
        coarse: matchMedia('(pointer: coarse)').matches,
        width: innerWidth,
        heights: [...document.querySelectorAll('#menu [data-entry]')].map((b) => b.getBoundingClientRect().height),
      }));
      assert.ok(m.coarse, 'a coarse pointer');
      assert.equal(m.width, width);
      assert.equal(m.heights.length, 8);
      assert.ok(m.heights.every((h) => h >= 44), `${width}: every button at least 44 px (${m.heights})`);
    }
    await context.close();
  } finally {
    await browser.close();
  }
});

// Each board preview — Classic 2D, Hexagon, Triangle — drawn by its board view in its own tile, its board's
// tiles covering the tile's preview past every side (no board edge showing) and centred on it.
async function assertBoardsCropped(page, label) {
  await page.waitForFunction(() => ['classic-2d', 'hexagon', 'triangle'].every((id) => document.querySelector(`#menu-preview-${id} canvas`)));
  const crops = await page.evaluate(async () => {
    const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
    while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    return Object.fromEntries(['classic-2d', 'hexagon', 'triangle'].map((id) => {
      const square = document.querySelector(`#menu-entry-${id} .ui-play-tile__preview`).getBoundingClientRect();
      const canvas = document.querySelector(`#menu-preview-${id} canvas`);
      const box = canvas.getBoundingClientRect();
      // the drawn board: the canvas's painted pixels, read back in CSS pixels
      const k = canvas.width / box.width;
      const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      let [l, t, r, b] = [Infinity, Infinity, -Infinity, -Infinity];
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] === 0) continue;
        l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
      }
      const board = { left: box.left + l / k, right: box.left + (r + 1) / k, top: box.top + t / k, bottom: box.top + (b + 1) / k };
      return [id, {
        drawn: r >= l,
        inside: board.left < square.left && board.right > square.right && board.top < square.top && board.bottom > square.bottom,
        centred: Math.abs((box.left + box.right) / 2 - (square.left + square.right) / 2) < 1 && Math.abs((box.top + box.bottom) / 2 - (square.top + square.bottom) / 2) < 1,
      }];
    }));
  });
  for (const [id, crop] of Object.entries(crops)) {
    assert.deepEqual(crop, { drawn: true, inside: true, centred: true }, `${label}: the ${id} board drawn, cropped from its middle, no edge of it showing`);
  }
}

// Open the placeholder from the menu, its window settled.
async function openPlaceholder(page, base) {
  await page.goto(`${base}/index.html?still-backdrop`);
  await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
  await page.evaluate(() => document.getElementById('menu-entry-surface').click());
  await page.waitForFunction(() => globalThis.__ms.state.mode === 'coming-soon');
}

test('in a browser, the placeholder as J-Other draws it: its window 4 px above centre, the lock badge over the title, both Backs after the arrow, full-bleed on a phone', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    // J-Other-xl, -l, -m, -p: the window's top left.
    const SIZES = [
      { width: 1920, height: 1080, top: 256, left: 510 },
      { width: 1366, height: 768, top: 120, left: 273 },
      { width: 1024, height: 768, top: 120, left: 132 },
      { width: 390, height: 844, top: 0, left: 0, phone: true },
    ];
    for (const { width, height, top, left, phone } of SIZES) {
      const label = `${width}×${height}`;
      const context = await browser.newContext({ viewport: { width, height }, ...(phone ? { hasTouch: true, isMobile: true } : {}) });
      try {
        const page = await context.newPage();
        await openPlaceholder(page, base);
        await page.waitForFunction(() => document.getElementById('coming-soon-frame').getAnimations().every((a) => a.playState !== 'running'), null, { timeout: patience(2000) });
        const m = await page.evaluate(() => {
          const $ = (id) => document.getElementById(id);
          const rect = (el) => el.getBoundingClientRect();
          const badge = $('coming-soon-badge');
          const b = getComputedStyle(badge);
          const shown = (el) => getComputedStyle(el).display !== 'none';
          const lead = (id) => $(id).firstElementChild?.matches('svg.ui-icon[data-icon="arrow-left"]') ?? false;
          const menu = $('coming-soon-menu');
          return {
            frame: [Math.round(rect($('coming-soon-frame')).top), Math.round(rect($('coming-soon-frame')).left)],
            badge: [rect(badge).width, rect(badge).height, b.borderRadius, b.backgroundColor, b.boxShadow],
            glyph: rect(badge.querySelector('svg')).width,
            above: rect(badge).bottom <= rect($('coming-soon-heading')).top,
            gap: getComputedStyle($('coming-soon-panel')).rowGap,
            lead: [lead('coming-soon-menu'), lead('coming-soon-back')],
            menu: { text: menu.innerText.trim(), name: menu.getAttribute('aria-label'), shown: shown(menu) },
          };
        });
        assert.deepEqual(m.frame, [top, left], `${label}: the window's top left`);
        assert.deepEqual(m.badge.slice(0, 4), [120, 120, '30px', 'rgb(236, 229, 216)'], `${label}: the badge 120 px square, radius 30, the locked fill`);
        assert.match(m.badge[4], /rgb\(216, 205, 185\) 0px 8px 0px/, `${label}: its locked edge's 8 px drop`);
        assert.equal(m.glyph, 56, `${label}: the 56 px lock`);
        assert.ok(m.above, `${label}: the badge above Coming soon`);
        assert.equal(m.gap, '16px', `${label}: 16 px apart`);
        assert.deepEqual(m.lead, [true, true], `${label}: the title bar's Back and the body's each start with the arrow`);
        assert.deepEqual(m.menu, { text: '', name: 'Back to Main menu', shown: true }, `${label}: the title bar's Back, its arrow alone, named Back to Main menu`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test('[slow] in a browser, the placeholder\'s window pops in and its layer fades out over the slow duration, kept on screen until it has; under reduced motion it goes at once', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const reducedMotion of ['no-preference', 'reduce']) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, reducedMotion });
      try {
        const page = await context.newPage();
        await openPlaceholder(page, base);
        const pop = await page.evaluate(() => document.getElementById('coming-soon-frame').getAnimations()
          .filter((a) => a.animationName === 'joyful-tiles-pop').map((a) => a.effect.getTiming().duration));
        const leaving = await page.evaluate(() => {
          const layer = document.getElementById('coming-soon');
          document.getElementById('coming-soon-back').click();
          return {
            hidden: layer.classList.contains('hidden'),
            display: getComputedStyle(layer).display,
            fades: layer.getAnimations().filter((a) => a.transitionProperty === 'opacity').map((a) => a.effect.getTiming().duration),
            clicks: getComputedStyle(layer).pointerEvents,
          };
        });
        assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
        if (reducedMotion === 'reduce') {
          assert.deepEqual(pop, [], 'no pop under reduced motion');
          assert.equal(leaving.display, 'none', 'the layer goes at once');
          continue;
        }
        assert.deepEqual(pop, [260], 'the window pops in over --duration-slow');
        assert.ok(leaving.hidden && leaving.display !== 'none', 'the layer leaving stays shown while it fades');
        assert.deepEqual(leaving.fades, [260], 'its fade over --duration-slow');
        assert.equal(leaving.clicks, 'none', 'clicks go through to the menu meanwhile');
        await page.waitForFunction(() => getComputedStyle(document.getElementById('coming-soon')).display === 'none', null, { timeout: patience(2000) });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, a window too short for the menu scrolls its window\'s body, every entry still a finger tall', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const [width, height] of [[1366, 520], [1024, 480], [390, 480]]) {
      const context = await browser.newContext({ viewport: { width, height } });
      const page = await context.newPage();
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.activeElement?.id === 'menu-entry-classic-2d');
      const m = await page.evaluate(() => {
        const menu = document.getElementById('menu-body');
        return {
          overflow: getComputedStyle(menu).overflowY, scrollHeight: menu.scrollHeight, clientHeight: menu.clientHeight,
          heights: [...document.querySelectorAll('#menu [data-entry]')].map((b) => b.offsetHeight),
          sideways: menu.scrollWidth - menu.clientWidth,
          page: document.getElementById('menu').scrollHeight - document.getElementById('menu').clientHeight,
        };
      });
      const label = `${width} × ${height}`;
      assert.equal(m.overflow, 'auto', `${label}: the window's body scrolls`);
      assert.equal(m.page, 0, `${label}: the window stays in the page, its title bar and foot in view`);
      assert.ok(m.scrollHeight > m.clientHeight, `${label}: its content is taller than the window (${m.scrollHeight} > ${m.clientHeight})`);
      assert.ok(m.heights.every((h) => h >= 44), `${label}: no button squeezed below 44 px (${m.heights})`);
      assert.equal(m.sideways, 0, `${label}: no sideways scroll`);
      const foot = await page.evaluate(() => document.getElementById('menu-build').getBoundingClientRect().bottom);
      assert.ok(foot <= height, `${label}: the build label shows in the foot (${foot})`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser, the build label is the canvas\'s mono caption and the phone\'s touch note one ink line after its hand icon', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const m = await page.evaluate(() => {
      const ink = getComputedStyle(document.documentElement).getPropertyValue('--color-ink').trim();
      const probe = document.createElement('span');
      probe.style.color = ink;
      document.body.append(probe);
      const inkRgb = getComputedStyle(probe).color;
      probe.remove();
      const build = document.getElementById('menu-build');
      const b = getComputedStyle(build);
      const note = document.getElementById('touch-note');
      const n = getComputedStyle(note);
      const icon = note.querySelector(':scope > .ui-icon');
      const text = note.querySelector('.ui-note__text');
      return {
        build: [build.textContent, b.fontFamily.includes('JetBrains Mono'), b.fontSize, b.fontWeight, b.letterSpacing, b.textTransform],
        note: [note.classList.contains('hidden'), n.fontSize, n.fontWeight, n.color === inkRgb, text.textContent],
        icon: icon && [icon.dataset.icon, icon.getBoundingClientRect().width, icon.getBoundingClientRect().height, text.getBoundingClientRect().left - icon.getBoundingClientRect().right],
        oneLine: text.getBoundingClientRect().height < parseFloat(n.fontSize) * 2,
      };
    });
    assert.deepEqual(m.build, [buildLabel(VERSION), true, '12px', '700', '1.8px', 'uppercase'], 'JetBrains Mono 12 px, bold, .15em apart, uppercase; the version as content');
    assert.deepEqual(m.note, [false, '14px', '700', true, 'Both modes play by touch: 3D and Classic 2D.'], 'the touch note: 14 px bold ink');
    assert.deepEqual(m.icon, ['hand', 20, 20, 10], 'after a 20 px hand icon, 10 px before its text');
    assert.ok(m.oneLine, 'on one line');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('in a browser, the main menu buttons\' look: a pastel on its pastel edge at rest, the full colour level with the surface selected, sunk pressed, no drop shadow; the previews on their grounds', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && document.activeElement?.id === 'menu-entry-classic-2d');
    const token = (name) => page.evaluate((n) => {
      const probe = document.createElement('span');
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
      document.body.append(probe);
      const v = getComputedStyle(probe).color;
      probe.remove();
      return v;
    }, name);
    const look = (id) => page.evaluate(async (x) => {
      const b = document.getElementById(`menu-entry-${x}`);
      await Promise.all(b.getAnimations().map((a) => a.finished.catch(() => {})));
      const s = getComputedStyle(b);
      const p = b.querySelector('.ui-play-tile__preview');
      return { background: s.backgroundColor, color: s.color, shadow: s.boxShadow, transform: s.transform, radius: s.borderTopLeftRadius,
        preview: p && { background: getComputedStyle(p).backgroundImage === 'none' ? getComputedStyle(p).backgroundColor : 'gradient', radius: getComputedStyle(p).borderTopLeftRadius } };
    }, id);
    const ink = await token('--color-ink');
    // Hexagon at rest: teal's pastel, its pastel edge 4 px below, the ink; no drop shadow.
    const rest = await look('hexagon');
    assert.equal(rest.background, await token('--color-teal-soft'), 'at rest, its pastel');
    assert.equal(rest.color, ink, 'in the navy ink');
    assert.match(rest.shadow, new RegExp(`${(await token('--color-teal-soft-edge')).replace(/[()]/g, '\\$&')} 0px 4px 0px`), 'on its pastel edge, the smaller one');
    assert.equal(rest.shadow.match(/rgba?\(/g).length, 2, 'the highlight and the edge, no drop shadow');
    assert.equal(rest.transform, 'none');
    assert.equal(rest.radius, '12px');
    assert.deepEqual(rest.preview, { background: 'gradient', radius: '12px' }, 'its preview on the dark scene');
    // Classic 2D selected: blue, white ink, moved level with the surface, its edge gone.
    const selected = await look('classic-2d');
    assert.equal(selected.background, await token('--color-blue'));
    assert.equal(selected.color, await token('--color-blue-on'));
    assert.equal(selected.transform, 'matrix(1, 0, 0, 1, 0, 4)', 'level with the surface');
    assert.equal(selected.shadow.match(/rgba?\(/g).length, 1, 'its edge gone');
    // A light preview: translucent white over the colour.
    assert.equal((await look('surface')).preview.background, 'rgba(255, 255, 255, 0.55)');
    // Records at rest: the neutral raised surface; selected: the stronger neutral.
    assert.equal((await look('records')).background, await token('--color-surface-raised'));
    await page.focus('#menu-entry-records');
    assert.equal((await look('records')).background, await token('--color-neutral-strong'), 'a small entry selected: the stronger neutral');
    // Pressed: the full colour, sunk below the surface.
    const daily = await page.locator('#menu-entry-daily').boundingBox();
    await page.mouse.move(daily.x + daily.width / 2, daily.y + daily.height / 2);
    await page.mouse.down();
    const pressed = await look('daily');
    await page.mouse.up();
    await page.keyboard.press('Escape').catch(() => {});
    assert.equal(pressed.background, await token('--color-violet'));
    assert.equal(pressed.transform, 'matrix(1, 0, 0, 1, 0, 6)', 'sunk below the surface');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('[slow] in a browser, the backdrop orbits and draws every frame, and the ?still-backdrop test hook draws it only when it changes', async (t) => {
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

    // Without the hook: the menu draws no 3D scene, its 3D tile a still; behind Records the demo board orbits, every frame drawing it.
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await frames(2);
    let renders = await drawn();
    await page.focus('#menu-entry-3d');
    await frames(3);
    assert.equal(await drawn(), renders, 'the menu, 3D selected: no 3D scene is drawn');
    await page.click('#menu-entry-records');
    await frames(2);
    renders = await drawn();
    let angle = await orbit();
    await frames(3);
    assert.ok(await drawn() >= renders + 3, 'the backdrop draws every frame');
    assert.ok(await orbit() > angle, 'the camera orbits the demo board');

    // With the hook: drawn once, then still until the screen changes.
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.click('#menu-entry-records');
    await frames(2);
    assert.ok(await drawn() >= 1, 'the backdrop is drawn');
    assert.ok(await ms(() => globalThis.__ms.renderer.game === globalThis.__ms.state.demo), 'the demo board is the backdrop');
    renders = await drawn();
    angle = await orbit();
    await frames(3);
    assert.equal(await drawn(), renders, 'no frame redraws a backdrop that did not change');
    assert.equal(await orbit(), angle, 'the camera holds still');
    await page.keyboard.press('Escape');
    await page.click('#menu-entry-settings');
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

    // The 3D tile: disabled, its reason under its label, its lock shown and its preview locked; the focus starts on Classic 2D.
    const tile3d = () => ms(() => {
      const b = document.getElementById('menu-entry-3d');
      const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
      const p = b.querySelector('.ui-play-tile__preview');
      return [b.getAttribute('aria-disabled'), b.querySelector('.ui-play-tile__label').textContent, b.querySelector('.ui-play-tile__reason').innerText.trim(),
        shown(b.querySelector('.ui-play-tile__lock')), p.dataset.preview, p.classList.contains('ui-play-tile__preview--locked'), !!p.querySelector('img'), !!p.querySelector('svg'),
        getComputedStyle(b).transform];
    });
    assert.deepEqual(await tile3d(), ['true', '3D', 'Needs WebGL 2 — not available in this browser', true, 'locked', true, false, true, 'none']);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.equal(await ms(() => document.querySelector('#menu-preview-classic-2d canvas') !== null), true, 'the Classic 2D preview draws without WebGL 2');
    await page.click('#menu-entry-3d', { force: true }); // aria-disabled: Playwright counts it not enabled
    assert.equal(await mode(), 'menu', 'a click opens nothing');
    assert.equal(await active(), 'menu-entry-3d', 'the disabled tile is selected');
    await page.waitForFunction(() => document.getElementById('menu-entry-3d').getAnimations().length === 0);
    const locked = await tile3d();
    assert.equal(locked[8], 'none', 'and does not move');
    assert.equal(await ms(() => getComputedStyle(document.getElementById('menu-entry-3d')).backgroundColor),
      await ms(() => { const s = document.createElement('span'); s.style.color = getComputedStyle(document.documentElement).getPropertyValue('--color-locked-edge'); document.body.append(s); const v = getComputedStyle(s).color; s.remove(); return v; }),
      'a locked tile selected darkens');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'menu', 'Enter opens nothing');
    await page.focus('#menu-entry-triangle');
    await page.keyboard.press('ArrowDown');
    assert.equal(await active(), 'menu-entry-3d', 'the arrow keys reach the disabled tile');
    await ms(() => globalThis.__ms.modes.openBoardChoice('3d'));
    await ms(() => globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }));
    assert.equal(await mode(), 'menu', 'no route opens the 3D board choice or starts a 3D game');
    assert.equal(await ms(() => globalThis.__ms.modes.active), null);
    await assert.rejects(ms(() => globalThis.__ms.start(6, 6, 6, 10)), /WebGL 2/, 'the start hook reports why');
    assert.equal(await mode(), 'menu');

    // Classic 2D end to end: board choice, generation, play, pause, restart, results.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    await page.evaluate(() => document.getElementById('c2d-noguess').click()); // no-guess off, its switch in the closed panel
    await page.click('#c2d-choice [data-size="beginner"]');
    await page.click('#c2d-play');
    assert.equal(await mode(), 'classic-2d');
    const box = await page.locator('#c2d-board canvas').first().boundingBox();
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
      return [area.left + v.layout.viewX + (c % 9) * v.layout.pitch + 0.5 * t, area.top + v.layout.viewY + Math.floor(c / 9) * v.layout.pitch + 0.5 * t];
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
    await page.click('#records-tab-replays');
    await page.waitForSelector('#records-replays-table [data-act="watch"]', { timeout: patience(5000) });
    await page.click('#records-replays-table [data-act="watch"]');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    assert.equal(await ms(() => document.querySelectorAll('#replay-board canvas:not(.board-motion):not(.board-ring)').length), 1, 'the 2D board view is mounted');
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
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:settings.machine') ?? '{}').data?.renderResolution === 'sharp', null, { timeout: patience(5000) });
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:settings')).data.theme), 'joyful-tiles');
    assert.equal(await ms(() => document.documentElement.dataset.theme), 'joyful-tiles', 'the theme picked is the one shown');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // A last mode played of 3D: the focus falls to Classic 2D, the first enabled tile.
    await ms(() => localStorage.setItem('ms3d:doc:shell.lastMode', JSON.stringify({ version: 1, data: { mode: '3d' } })));
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: patience(5000) });
    await frames(4);
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

test('[slow] in a browser, a controller alone walks the menu, the 3D board choice and the placeholder', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    // ---- 3D board choice: move between presets, confirm one, Back to the menu.
    {
      const { errors, press, mode, focused, page } = await controllerPage(browser, base);
      assert.equal(await mode(), 'menu');
      assert.equal(await focused(), 'menu-entry-classic-2d');
      await press(PAD_BTN.RIGHT);
      assert.equal(await focused(), 'menu-entry-hexagon', 'the D-pad moves across the two columns');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-surface', 'and down them');
      await press(PAD_BTN.LEFT);
      assert.equal(await focused(), 'menu-entry-triangle');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-3d');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-records', 'down from the last row to the small entries');
      await press(PAD_BTN.UP);
      assert.equal(await focused(), 'menu-entry-3d', 'and back up');
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
      assert.equal(await page.evaluate(() => document.querySelector('#board-choice [data-preset][aria-pressed="true"]')?.dataset.preset), chosen);
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

    // ---- Placeholder: Surface opens it titled with the mode; B leaves it, back on Surface.
    {
      const { errors, press, mode, focused, page } = await controllerPage(browser, base);
      assert.equal(await mode(), 'menu');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-triangle', 'Triangle under Classic 2D');
      await press(PAD_BTN.RIGHT);
      assert.equal(await focused(), 'menu-entry-surface', 'Surface beside it');
      await press(PAD_BTN.A);
      assert.equal(await mode(), 'coming-soon', 'a mode not built yet opens the placeholder');
      assert.ok(await page.evaluate(() => !document.getElementById('coming-soon').classList.contains('hidden')));
      assert.equal(await page.evaluate(() => document.getElementById('coming-soon-title').textContent), 'Surface');
      assert.equal(await focused(), 'coming-soon-back', 'its Back button takes the focus');
      assert.equal(await page.evaluate(() => document.getElementById('coming-soon-text').textContent), 'This part of the game is coming soon.');
      assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#coming-soon .ui-key-hint')].map((h) => [h.classList.contains('ui-key-hint--pad'), h.textContent])),
        [[true, 'B']], 'the body\'s Back shows the controller\'s Back button; the title bar\'s shows its arrow alone');
      // The title bar's Back goes back too, as the frame's Back does on every screen.
      await press(PAD_BTN.UP);
      assert.equal(await focused(), 'coming-soon-menu', 'the D-pad reaches the title bar\'s Back');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'coming-soon-back');
      await press(PAD_BTN.B);
      assert.equal(await mode(), 'menu', 'B is Back: the placeholder returns to the menu');
      assert.equal(await focused(), 'menu-entry-surface', 'with Surface selected');
      assert.ok(await page.evaluate(() => document.getElementById('coming-soon').classList.contains('hidden')));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
