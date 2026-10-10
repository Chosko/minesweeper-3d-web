import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  MENU_ENTRIES, PLACEHOLDER_SCREEN, LAST_MODE_DOC, LAST_MODE_VERSION, entryRoute, createMenu, createLastMode,
} from '../js/shell/menu.js';
import { createModeHost } from '../js/shell/mode-host.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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

test('the main menu has four entries: Classic 2D, 3D, Records and Settings, in that order', () => {
  assert.deepEqual(MENU_ENTRIES.map((e) => e.label), ['Classic 2D', '3D', 'Records', 'Settings']);
  assert.deepEqual(MENU_ENTRIES.map((e) => e.id), ['classic-2d', '3d', 'records', 'settings']);
  assert.ok(Object.isFrozen(MENU_ENTRIES) && MENU_ENTRIES.every(Object.isFrozen));
  assert.deepEqual(MENU_ENTRIES.map((e) => e.mode ?? null), ['classic-2d', '3d', null, null], 'the two mode entries name their mode');
  assert.deepEqual(MENU_ENTRIES.map((e) => e.screen ?? null), [null, null, 'records', 'settings']);
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
  menu.open('records');
  menu.open('settings');
  assert.deepEqual(router.went, [
    ['coming-soon', { entry: 'classic-2d', title: 'Classic 2D' }],
    ['coming-soon', { entry: 'records', title: 'Records' }],
    ['settings', undefined],
  ]);
  assert.throws(() => menu.open('campaign'), /unknown menu entry/);
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

test('index.html shows the four entries as one kit menu, matching the entry table', () => {
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
  assert.equal([...BOARD.matchAll(/data-preset="\d/g)].length, 6, 'the six presets');
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
  assert.match(MAIN, /openBoardChoice: \(\) => SHELL\.go\('board-choice'/, 'the 3D mode opens its board choice');
  assert.match(MAIN, /import \{ storage \} from '\.\/platform\/index\.js'/, 'the last mode goes through platform storage');
});

test('the catalogue documents the main menu, the 3D board choice and the placeholder', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Main menu \(index\.html #menu\)[\s\S]*?Default focus: the last mode played/);
  assert.match(head, /3D board choice \(index\.html #board-choice\)/);
  assert.match(head, /Coming soon \(index\.html #coming-soon\)/);
});

// ---------------------------------------------------------------- browser

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };
function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
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

test('in a browser, the menu shows the four entries, each routes, and Back returns', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const shown = () => ms(() => ['menu', 'board-choice', 'coming-soon', 'records', 'c2d-choice', 'ready', 'pause']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')));
    const backdrop = () => ms(() => globalThis.__ms.renderer.game === globalThis.__ms.state.demo);

    // The four entries, in order, visible; the first takes the focus when no mode was played yet.
    assert.equal(await mode(), 'menu');
    const labels = await ms(() => [...document.querySelectorAll('#menu [data-entry]')]
      .filter((b) => b.getBoundingClientRect().width > 0).map((b) => b.querySelector('.ui-menu__label').textContent));
    assert.deepEqual(labels, ['Classic 2D', '3D', 'Records', 'Settings']);
    assert.equal(await active(), 'menu-entry-classic-2d');
    assert.ok(await backdrop(), 'the demo board is the menu backdrop');

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
    server.close();
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
  await page.goto(`${base}/index.html`);
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
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const base = `http://127.0.0.1:${server.address().port}`;
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
      assert.equal(await focused(), '8,8,2,10', 'the first preset takes the focus when none was played');

      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), '14,14,2,60', 'down moves to the next preset');
      await press(PAD_BTN.DOWN);
      assert.equal(await focused(), '25,16,2,130');
      await press(PAD_BTN.UP);
      assert.equal(await focused(), '14,14,2,60', 'up moves back');
      await press(PAD_BTN.RIGHT);
      const across = await focused();
      assert.match(across, /^\d+,\d+,\d+,\d+$/, 'right moves to another preset');
      assert.notEqual(across, '14,14,2,60');
      assert.equal(await mode(), 'board-choice', 'moving changes no screen');

      await press(PAD_BTN.A);
      assert.equal(await mode(), 'ready', 'A confirms the focused preset');
      const [X, Y, Z, mines] = across.split(',').map(Number);
      assert.deepEqual(await page.evaluate(() => globalThis.__ms.state.settings), { X, Y, Z, mines }, 'the confirmed preset is the board');

      await press(PAD_BTN.BACK);
      assert.equal(await mode(), 'board-choice', 'Back on a fresh board returns to the board choice');
      assert.equal(await focused(), across, 'the preset just played keeps the focus');
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
    server.close();
  }
});
