import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MENU_ENTRIES, PLACEHOLDER_SCREEN, LAST_MODE_DOC, LAST_MODE_VERSION, UNAVAILABLE_REASONS, entryRoute, entryReason, createMenu, createLastMode,
} from '../js/shell/menu.js';
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

test('the main menu has five entries: Classic 2D, 3D, Daily, Records and Settings, in that order', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.label), ['Classic 2D', '3D', 'Daily', 'Records', 'Settings']);
  assert.deepEqual(MENU_ENTRIES.map((e) => e.id), ['classic-2d', '3d', 'daily', 'records', 'settings']);
  assert.ok(Object.isFrozen(MENU_ENTRIES) && MENU_ENTRIES.every(Object.isFrozen));
  assert.deepEqual(MENU_ENTRIES.map((e) => e.mode ?? null), ['classic-2d', '3d', null, null, null], 'the two mode entries name their mode');
  assert.deepEqual(MENU_ENTRIES.map((e) => e.screen ?? null), [null, null, 'daily', 'records', 'settings']);
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
  menu.open('daily');
  menu.open('records');
  menu.open('settings');
  assert.deepEqual(router.went, [
    ['coming-soon', { entry: 'classic-2d', title: 'Classic 2D' }],
    ['coming-soon', { entry: 'daily', title: 'Daily' }],
    ['coming-soon', { entry: 'records', title: 'Records' }],
    ['settings', undefined],
  ]);
  assert.throws(() => menu.open('campaign'), /unknown menu entry/);
});

// ---------------------------------------------------------------- an entry the browser cannot run

test('the 3D entry needs WebGL 2; without it the entry is unavailable with its reason and routes nowhere', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.needs ?? null), [null, 'webgl2', null, null, null], 'only 3D needs WebGL 2');
  assert.equal(UNAVAILABLE_REASONS.webgl2, 'Needs WebGL 2 — not available in this browser');
  assert.ok(Object.isFrozen(UNAVAILABLE_REASONS));
  const all = { hasMode: () => true, hasScreen: () => true };
  const three = MENU_ENTRIES.find((e) => e.id === '3d');
  assert.equal(entryReason(three, ['webgl2']), UNAVAILABLE_REASONS.webgl2);
  assert.equal(entryReason(three, []), null, 'with WebGL 2 the entry is available');
  assert.equal(entryReason(three), null, 'nothing missing by default');
  assert.equal(entryRoute(three, { ...all, missing: ['webgl2'] }), null, 'an unavailable entry routes nowhere');
  assert.deepEqual(entryRoute(three, all), { mode: '3d' });
  for (const entry of MENU_ENTRIES.filter((e) => e.id !== '3d')) {
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

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const section = (start, end) => INDEX.slice(INDEX.indexOf(start), INDEX.indexOf(end));
const MENU = section('<section id="menu"', '<!-- 3D board choice -->');
const BOARD = section('<section id="board-choice"', '<!-- Coming soon -->');
const SOON = section('<section id="coming-soon"', '<!-- Click to play -->');

test('index.html shows the five entries as one kit menu, matching the entry table', () => {
  const entries = [...MENU.matchAll(/<button type="button" class="ui-menu__item" id="menu-entry-([\w-]+)" data-entry="([\w-]+)"><span class="ui-menu__label">([^<]+)<\/span>/g)];
  assert.deepEqual(entries.map((m) => m[2]), MENU_ENTRIES.map((e) => e.id));
  assert.deepEqual(entries.map((m) => m[1]), MENU_ENTRIES.map((e) => e.id), 'each entry has its id');
  assert.deepEqual(entries.map((m) => m[3]), MENU_ENTRIES.map((e) => e.label));
  assert.equal([...MENU.matchAll(/class="ui-menu"/g)].length, 1, 'one menu of entries');
  assert.doesNotMatch(MENU, /data-preset|id="custom"/, 'the 3D presets and custom board left the main menu');
});

test('the 3D board choice holds the presets and custom board, and a Back button', () => {
  assert.ok(BOARD.length > 500, 'index.html has the 3D board choice');
  assert.match(BOARD, /class="overlay hidden"/);
  assert.equal([...BOARD.matchAll(/data-preset="\d/g)].length, 6, 'the two first-box and four cube presets');
  assert.match(BOARD, /<form id="custom"/);
  assert.match(BOARD, /id="board-choice-back"/);
});

test('the placeholder screen is a kit card with a title and a Back button', () => {
  assert.match(SOON, /class="overlay hidden"/);
  assert.match(SOON, /class="ui-card ui-screen" aria-labelledby="coming-soon-title"/);
  assert.match(SOON, /<button type="button" id="coming-soon-back" class="ui-button ui-button--primary">Back<\/button>/);
});

test('the shell routes the new screens, declares their default focus and lets the controller reach them', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  const focus = (name) => table.match(new RegExp(`'?${name}'?: \\{[^\\n]*defaultFocus: '([^']+)'`))?.[1];
  assert.equal(focus('menu'), '[data-entry][data-last]', 'the menu focuses the last mode played');
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
  assert.match(MAIN, /createMenu\(\{ router: SHELL, modes: MODES, missing: WEBGL2 \? \[\] : \['webgl2'\] \}\)/, 'the menu knows what the browser lacks');
  assert.match(MAIN, /ui\.setEntryUnavailable\(/, 'the menu item shows the reason');
  assert.match(MAIN, /document\.body\.classList\.toggle\('no-webgl2', !WEBGL2\)/, 'the page knows it has no 3D scene');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /body\.no-webgl2 #scene \{ display: none; \}/, 'the #scene canvas is hidden');
  assert.match(css, /body\.no-webgl2 :is\(#menu, #board-choice, #coming-soon, #c2d-choice, #settings, #records\) \{ background: none; \}/,
    'the menu screens sit on the body\'s static background, built from the theme tokens');
  assert.match(css, /body \{[^}]*background-image: radial-gradient\([^)]*var\(--color-backdrop-highlight\)[^)]*var\(--color-backdrop\)[^)]*var\(--color-backdrop-shade\)/);
  const hook = MAIN.slice(MAIN.indexOf('window.__ms = {'));
  assert.match(hook.match(/start\(X, Y, Z, mines, minePositions\) \{[^\n]*/)[0], /if \(!WEBGL2\) throw new Error\(/, 'the start hook reports the reason');
  assert.match(INDEX, /<noscript><div class="noscript">Minesweeper 3D needs JavaScript\.<\/div><\/noscript>/, 'the noscript line asks only for JavaScript');
  assert.match(INDEX, /The game files failed to load\. Check your connection and reload the page\./, 'the onerror card stays');
  assert.match(read('README.md'), /3D needs WebGL 2; Classic 2D, Records and Settings run without it\./);
});

test('the catalogue documents the main menu, the 3D board choice and the placeholder', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Main menu \(index\.html #menu\)[\s\S]*?Default focus: the last mode played/);
  assert.match(head, /3D board choice \(index\.html #board-choice\)/);
  assert.match(head, /Coming soon \(index\.html #coming-soon\)/);
});

// ---------------------------------------------------------------- browser

test('in a browser, the menu shows the five entries, each routes, and Back returns', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const shown = () => ms(() => ['menu', 'board-choice', 'coming-soon', 'records', 'c2d-choice', 'ready', 'pause']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')));
    const backdrop = () => ms(() => globalThis.__ms.renderer.game === globalThis.__ms.state.demo);

    // The five entries, in order, visible; the first takes the focus when no mode was played yet.
    assert.equal(await mode(), 'menu');
    const labels = await ms(() => [...document.querySelectorAll('#menu [data-entry]')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.querySelector('.ui-menu__label').textContent));
    assert.deepEqual(labels, ['Classic 2D', '3D', 'Daily', 'Records', 'Settings']);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.ok(await backdrop(), 'the demo board is the menu backdrop');
    assert.deepEqual(await ms(() => {
      const b = document.getElementById('menu-entry-3d');
      return [b.disabled, b.querySelector('.ui-menu__detail').textContent, document.body.classList.contains('no-webgl2'), getComputedStyle(document.getElementById('scene')).display];
    }), [false, 'Fly through a cube of cubes', false, 'block'], 'with WebGL 2 the 3D entry is enabled and the scene shows');

    // Classic 2D: its board choice, Back by its button.
    await page.click('#menu-entry-classic-2d');
    assert.equal(await mode(), 'classic-2d-choice');
    assert.deepEqual(await shown(), ['c2d-choice']);
    assert.ok(await backdrop(), 'the backdrop stays behind the board choice');
    await page.click('#c2d-choice-back');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');
    assert.deepEqual(await shown(), ['menu']);

    // Records: its screen, by mouse, keyboard and Back.
    await page.click('#menu-entry-records');
    assert.equal(await mode(), 'records');
    assert.deepEqual(await shown(), ['records']);
    assert.ok(await backdrop(), 'the backdrop stays behind the records screen');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu', 'Esc is Back');
    assert.deepEqual(await shown(), ['menu']);

    await page.focus('#menu-entry-records');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'records');
    await page.click('#records-back');
    assert.equal(await mode(), 'menu', 'Back returns to the menu');

    // Settings: its page, over the backdrop; Esc is Back.
    await page.focus('#menu-entry-settings');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'settings');
    assert.ok(await backdrop(), 'the backdrop stays behind the Settings page');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // 3D: the 3D presets and custom board, Back by keyboard and by its button.
    await page.focus('#menu-entry-3d');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'board-choice');
    assert.deepEqual(await shown(), ['board-choice']);
    assert.ok(await ms(() => document.activeElement?.matches('[data-preset]')), 'a preset takes the focus');
    assert.ok(await ms(() => document.getElementById('custom').getBoundingClientRect().height > 0), 'the custom board shows');
    assert.ok(await backdrop());
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    await page.click('#menu-entry-3d');
    await page.click('#board-choice-back');
    assert.equal(await mode(), 'menu');

    // A 3D game started from its board choice records the mode once the first click starts it.
    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="6,6,6,10"]');
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
    assert.equal(await active(), 'menu-entry-3d', 'the menu focuses the last mode played');
    assert.ok(await ms(() => !document.querySelector('#menu-entry-3d [data-last]').classList.contains('hidden')), '3D is marked last played');

    // It survives a reload.
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.waitForFunction(() => document.activeElement?.id === 'menu-entry-3d');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the backdrop orbits and draws every frame, and the ?still-backdrop test hook draws it only when it changes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 300 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const frames = (n) => ms((count) => new Promise((done) => {
      const step = (left) => (left ? requestAnimationFrame(() => step(left - 1)) : done());
      step(count);
    }), n);
    const drawn = () => ms(() => globalThis.__ms.frameStats.renders);
    const orbit = () => ms(() => globalThis.__ms.state.orbit);

    // Without the hook: the demo board orbits, and every frame draws it.
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await frames(2);
    let renders = await drawn(), angle = await orbit();
    await frames(3);
    assert.ok(await drawn() >= renders + 3, 'the backdrop draws every frame');
    assert.ok(await orbit() > angle, 'the camera orbits the demo board');

    // With the hook: drawn once, then still until the screen changes.
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
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
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
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

    // The static background, from the theme's tokens, in both themes.
    const background = () => ms(() => {
      const probe = document.createElement('div');
      probe.style.background = 'var(--color-backdrop)';
      document.body.append(probe);
      const token = getComputedStyle(probe).backgroundColor;
      probe.remove();
      const body = getComputedStyle(document.body);
      return { color: body.backgroundColor, token, image: body.backgroundImage, menu: getComputedStyle(document.getElementById('menu')).backgroundImage };
    });
    const seen = [];
    for (const theme of ['light', 'dark']) {
      await ms((th) => globalThis.msTheme.setTheme(th), theme);
      const bg = await background();
      assert.equal(bg.color, bg.token, `${theme}: the page is the theme's backdrop colour`);
      assert.match(bg.image, /radial-gradient/, `${theme}: the themed gradient shows`);
      assert.equal(bg.menu, 'none', `${theme}: the menu screen lays no tint of its own over it`);
      seen.push(bg.color);
    }
    assert.notEqual(seen[0], seen[1], 'light and dark differ');
    await ms(() => globalThis.msTheme.setTheme('light'));

    // The 3D entry: disabled, its reason in place of its detail line; the focus starts on Classic 2D.
    assert.deepEqual(await ms(() => {
      const b = document.getElementById('menu-entry-3d');
      const details = [...b.querySelectorAll('.ui-menu__detail')].filter((d) => !d.classList.contains('hidden')).map((d) => d.textContent);
      return [b.disabled, b.matches('.ui-menu__item:disabled'), b.querySelector('.ui-menu__label').textContent, details];
    }), [true, true, '3D', ['Needs WebGL 2 — not available in this browser']]);
    assert.equal(await active(), 'menu-entry-classic-2d');
    await page.click('#menu-entry-3d', { force: true });
    assert.equal(await mode(), 'menu', 'a click opens nothing');
    await page.focus('#menu-entry-classic-2d');
    await page.keyboard.press('ArrowDown');
    assert.equal(await active(), 'menu-entry-daily', 'the arrow keys skip the disabled entry');
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
    assert.equal(await mode(), 'classic-2d');
    const box = await page.locator('#c2d-board canvas').boundingBox();
    const cell = (i) => [box.x + (box.width / 9) * ((i % 9) + 0.5), box.y + (box.height / 9) * (Math.floor(i / 9) + 0.5)];
    await page.mouse.click(...cell(40));
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
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
    await page.waitForFunction(() => !document.getElementById('r-watch').classList.contains('hidden'));
    await page.click('#r-watch');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    await page.keyboard.press('End');
    assert.equal(await ms(() => globalThis.__ms.replayViewer.state.ended), true, 'the replay plays through to its end');
    await page.click('#rp-back');
    assert.equal(await mode(), 'results');

    // Records from the results screen; its library view's Watch plays the kept replay; the 3D side opens.
    await page.click('#r-records');
    assert.equal(await mode(), 'records');
    await page.waitForSelector('#records-replays-table [data-act="watch"]');
    await page.click('#records-replays-table [data-act="watch"]');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
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
    await page.click('#set-theme [data-value="dark"]');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:settings') ?? '{}').data?.renderResolution === 'sharp');
    assert.equal(await ms(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:settings')).data.theme), 'dark');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // A last mode played of 3D still marks it; the focus falls to the first enabled entry.
    await ms(() => localStorage.setItem('ms3d:doc:shell.lastMode', JSON.stringify({ version: 1, data: { mode: '3d' } })));
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.waitForFunction(() => document.getElementById('menu-entry-3d').hasAttribute('data-last'));
    assert.ok(await ms(() => !document.querySelector('#menu-entry-3d [data-last]').classList.contains('hidden')), '"Last played" shows');
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

test('in a browser, a controller alone walks the 3D board choice and the placeholder', async (t) => {
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
      assert.equal(await focused(), 'menu-entry-3d', 'the D-pad moves down the menu');
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
      assert.equal(await mode(), 'ready', 'A confirms the focused preset');
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

    // ---- Placeholder: an entry whose screen is not registered falls back to it; B leaves it.
    {
      const route = {
        url: '**/js/shell/menu.js',
        handler: async (r) => {
          const response = await r.fetch();
          const source = await response.text();
          const body = source.replace("screen: 'records' }", "screen: 'records-not-registered' }");
          assert.notEqual(body, source, 'the Records entry was pointed at an unregistered screen');
          await r.fulfill({ response, body });
        },
      };
      const { errors, press, mode, focused, page } = await controllerPage(browser, base, { route });
      assert.equal(await mode(), 'menu');
      await press(PAD_BTN.DOWN);
      await press(PAD_BTN.DOWN);
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), 'menu-entry-records');
      await press(PAD_BTN.A);
      assert.equal(await mode(), 'coming-soon', 'an entry without its screen opens the placeholder');
      assert.ok(await page.evaluate(() => !document.getElementById('coming-soon').classList.contains('hidden')));
      assert.equal(await page.evaluate(() => document.getElementById('coming-soon-title').textContent), 'Records');
      assert.equal(await focused(), 'coming-soon-back', 'its Back button takes the focus');
      await press(PAD_BTN.B);
      assert.equal(await mode(), 'menu', 'B is Back: the placeholder returns to the menu');
      assert.ok(await page.evaluate(() => document.getElementById('coming-soon').classList.contains('hidden')));
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
