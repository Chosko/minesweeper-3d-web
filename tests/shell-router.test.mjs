import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRouter, SHELL_SCREENS } from '../js/shell/router.js';
import {
  FOCUSABLE, topLayer, resolveFocus, createHeldSuppressor, backButtons, isBackKey, arrowDirection, keepsArrow,
} from '../js/shell/navigation.js';
import { BTN, NUM_BUTTONS } from '../js/gamepad.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A screen table whose screens record what is visible, the focus calls and each show's data.
function harness(extra = {}) {
  const visible = new Set();
  const log = [];
  const focused = [];
  const screen = (name, decl = {}) => ({
    show(data, from) { visible.add(name); log.push(['show', name, data, from]); },
    hide(to) { visible.delete(name); log.push(['hide', name, to]); },
    ...decl,
  });
  const screens = {
    menu: screen('menu', { defaultFocus: '#menu-default' }),
    'board-choice': screen('board-choice', { defaultFocus: '#board-default' }),
    playing: screen('playing', { defaultFocus: null }),
    paused: screen('paused', { defaultFocus: () => '#p-resume' }),
    results: screen('results'),
    records: screen('records', { defaultFocus: '#records-default' }),
    settings: screen('settings', { defaultFocus: '#settings-default' }),
    ...extra,
  };
  const changes = [];
  const router = createRouter({
    screens,
    focus: (target, name) => focused.push([name, target]),
    onChange: (c) => changes.push(c),
  });
  return { router, visible, log, focused, changes, screens };
}

// ---------------------------------------------------------------- router

test('the shell screens are the seven the feature names', () => {
  assert.deepEqual([...SHELL_SCREENS], ['menu', 'board-choice', 'playing', 'paused', 'results', 'records', 'settings']);
  assert.ok(Object.isFrozen(SHELL_SCREENS));
});

test('the router starts on no screen and routes to a registered screen', () => {
  const { router, visible, changes } = harness();
  assert.equal(router.current, null);
  assert.deepEqual(router.stack, []);
  router.go('menu');
  assert.equal(router.current, 'menu');
  assert.deepEqual([...visible], ['menu']);
  assert.deepEqual(changes, [{ from: null, to: 'menu' }]);
});

test('an unknown screen is refused and changes nothing', () => {
  const { router, visible } = harness();
  router.go('menu');
  assert.throws(() => router.go('nowhere'), /unknown screen "nowhere"/);
  assert.equal(router.current, 'menu');
  assert.deepEqual([...visible], ['menu']);
});

test('each change shows exactly one screen and hands it the data', () => {
  const { router, visible, log } = harness();
  router.go('menu');
  router.go('board-choice', { data: { mode: 'classic2d' } });
  router.go('playing');
  router.go('paused', { data: { note: 'x' } });
  assert.deepEqual([...visible], ['paused']);
  const shows = log.filter((e) => e[0] === 'show');
  assert.deepEqual(shows.map((e) => e[1]), ['menu', 'board-choice', 'playing', 'paused']);
  assert.deepEqual(shows[1][2], { mode: 'classic2d' });
  assert.equal(shows[1][3], 'menu', 'show learns where it came from');
  assert.deepEqual(log.filter((e) => e[0] === 'hide').map((e) => [e[1], e[2]]),
    [['menu', 'board-choice'], ['board-choice', 'playing'], ['playing', 'paused']], 'the previous screen is hidden first');
});

test('the back stack records where each screen came from and Back returns there', () => {
  const { router, visible } = harness();
  router.go('menu');
  router.go('board-choice');
  router.go('settings');
  assert.deepEqual(router.stack, ['menu', 'board-choice']);
  assert.equal(router.back(), true);
  assert.equal(router.current, 'board-choice');
  assert.deepEqual(router.stack, ['menu']);
  assert.equal(router.back(), true);
  assert.equal(router.current, 'menu');
  assert.deepEqual(router.stack, []);
  assert.equal(router.back(), false, 'Back on the root screen does nothing');
  assert.equal(router.current, 'menu');
  assert.deepEqual([...visible], ['menu']);
});

test('going to a screen already on the stack unwinds the stack to it', () => {
  const { router } = harness();
  router.go('menu');
  router.go('board-choice');
  router.go('playing');
  router.go('paused');
  router.go('menu');
  assert.equal(router.current, 'menu');
  assert.deepEqual(router.stack, [], 'the menu is the root again');
  router.go('records');
  router.go('playing');
  router.go('records');
  assert.deepEqual(router.stack, ['menu']);
});

test('replace swaps the current screen without stacking it', () => {
  const { router } = harness();
  router.go('menu');
  router.go('board-choice');
  router.go('playing', { replace: true });
  assert.deepEqual(router.stack, ['menu']);
  router.go('paused');
  assert.deepEqual(router.stack, ['menu', 'playing']);
  router.back();
  assert.equal(router.current, 'playing');
});

test('routing to the current screen shows it again with the new data, without stacking', () => {
  const { router, log, visible, changes } = harness();
  router.go('menu');
  router.go('paused', { data: { note: 'a' } });
  router.go('paused', { data: { note: 'b' } });
  assert.deepEqual(router.stack, ['menu']);
  assert.deepEqual([...visible], ['paused']);
  assert.deepEqual(log.filter((e) => e[0] === 'show' && e[1] === 'paused').map((e) => e[2]), [{ note: 'a' }, { note: 'b' }]);
  assert.deepEqual(changes.at(-1), { from: 'paused', to: 'paused' });
});

test('each change focuses the screen\'s declared default target', () => {
  const { router, focused } = harness();
  router.go('menu');
  router.go('settings');
  router.go('playing');
  router.go('paused');
  router.go('results');
  assert.deepEqual(focused, [
    ['menu', '#menu-default'], ['settings', '#settings-default'], ['playing', null], ['paused', '#p-resume'], ['results', null],
  ]);
  assert.equal(router.defaultFocus('records'), '#records-default');
  assert.equal(router.defaultFocus(), null, 'the current screen (results) declares none');
});

test('a default focus declared as a function is resolved at each change', () => {
  let ended = false;
  const { router, focused } = harness({ paused: { show() {}, defaultFocus: () => (ended ? '#p-restart' : '#p-resume') } });
  router.go('paused');
  ended = true;
  router.go('paused');
  assert.deepEqual(focused.map((f) => f[1]), ['#p-resume', '#p-restart']);
  router.refocus();
  assert.deepEqual(focused.at(-1), ['paused', '#p-restart']);
});

test('a screen may resolve Back itself; it learns the input that asked', () => {
  const seen = [];
  const { router } = harness({
    playing: { show() {}, back: ({ router: r, source }) => { seen.push(source); r.go('paused'); } },
  });
  router.go('menu');
  router.go('playing');
  assert.equal(router.back('pad'), true);
  assert.equal(router.current, 'paused', 'Back while playing means Pause');
  assert.deepEqual(seen, ['pad']);
  assert.deepEqual(router.stack, ['menu', 'playing']);
});

test('the shown screen is current while its show runs', () => {
  let during = null;
  let router;
  ({ router } = harness({ settings: { show() { during = router.current; } } }));
  router.go('menu');
  router.go('settings');
  assert.equal(during, 'settings');
});

// ---------------------------------------------------------------- navigation

test('the topmost visible layer takes input', () => {
  const open = new Set(['menu', 'controls-modal']);
  const order = ['ctx-lost', 'controls-modal', 'pause', 'ready', 'menu'];
  assert.equal(topLayer(order, (id) => open.has(id)), 'controls-modal');
  open.delete('controls-modal');
  assert.equal(topLayer(order, (id) => open.has(id)), 'menu');
  open.clear();
  assert.equal(topLayer(order, (id) => open.has(id)), null);
});

test('the default focus falls back to the first focusable control', () => {
  const a = { id: 'a' }, b = { id: 'b' };
  assert.equal(resolveFocus(b, [a, b]), b);
  assert.equal(resolveFocus(null, [a, b]), a, 'no declared target');
  assert.equal(resolveFocus({ id: 'gone' }, [a, b]), a, 'the declared target is not focusable');
  assert.equal(resolveFocus(null, []), null);
});

test('the focusable selector collects every native control the kit uses', () => {
  for (const tag of ['button', 'input', 'summary', 'a[href]', 'select']) assert.ok(FOCUSABLE.split(',').map((s) => s.trim()).includes(tag), tag);
});

const pollOf = (held, prev = []) => ({
  held,
  pressed: held.map((h, i) => h && !prev[i]),
});
const buttons = (...on) => Array.from({ length: NUM_BUTTONS }, (_, i) => on.includes(i));

test('a button held across a screen change is ignored until released', () => {
  const s = createHeldSuppressor();
  let prev = buttons();
  let p = pollOf(buttons(BTN.A), prev);
  s.update(p.held);
  assert.equal(s.pressed(p, BTN.A), true, 'the press that changes the screen is seen');
  s.screenChanged();
  assert.equal(s.pressed(p, BTN.A), false, 'and is not seen again by the new screen');
  assert.equal(s.held(p, BTN.A), false);
  prev = p.held;
  p = pollOf(buttons(BTN.A), prev);
  s.update(p.held);
  assert.equal(s.held(p, BTN.A), false, 'still held: still ignored');
  prev = p.held;
  p = pollOf(buttons(), prev);
  s.update(p.held);
  prev = p.held;
  p = pollOf(buttons(BTN.A), prev);
  s.update(p.held);
  assert.equal(s.pressed(p, BTN.A), true, 'a fresh press after the release counts');
});

test('a screen change from another input suppresses what the controller held at the last poll', () => {
  const s = createHeldSuppressor();
  const p1 = pollOf(buttons(BTN.RT, BTN.DOWN));
  s.update(p1.held);
  s.screenChanged(); // e.g. Esc on the keyboard between two polls
  const p2 = pollOf(buttons(BTN.RT), p1.held);
  s.update(p2.held);
  assert.equal(s.held(p2, BTN.RT), false, 'RT held through the change stays ignored');
  const p3 = pollOf(buttons(BTN.RT, BTN.DOWN), p2.held);
  s.update(p3.held);
  assert.equal(s.pressed(p3, BTN.DOWN), true, 'DOWN was released before the next poll, so its new press counts');
});

test('buttons not held at the change are never suppressed', () => {
  const s = createHeldSuppressor();
  const p1 = pollOf(buttons(BTN.A));
  s.update(p1.held);
  s.screenChanged();
  const p2 = pollOf(buttons(BTN.A, BTN.B), p1.held);
  s.update(p2.held);
  assert.equal(s.pressed(p2, BTN.B), true);
  assert.equal(s.pressed(p2, BTN.A), false);
});

test('Esc and the controller back button mean Back; B is Back only off the board', () => {
  assert.equal(isBackKey('Escape'), true);
  for (const k of ['KeyQ', 'Space', 'Backspace', 'Enter']) assert.equal(isBackKey(k), false, k);
  assert.deepEqual(backButtons('playing'), [BTN.BACK], 'B is a game action while playing');
  for (const screen of ['menu', 'board-choice', 'paused', 'results', 'records', 'settings', 'ready']) {
    assert.deepEqual(backButtons(screen), [BTN.B, BTN.BACK], screen);
  }
});

test('the arrow keys are the keyboard\'s focus moves, in the D-pad\'s four directions', () => {
  assert.equal(arrowDirection('ArrowUp'), 'up');
  assert.equal(arrowDirection('ArrowDown'), 'down');
  assert.equal(arrowDirection('ArrowLeft'), 'left');
  assert.equal(arrowDirection('ArrowRight'), 'right');
  for (const code of ['KeyW', 'Escape', 'Tab', 'Numpad8', '', undefined]) assert.equal(arrowDirection(code), null, `${code} is no focus move`);
});

test('a control that owns an arrow keeps it, as the D-pad treats it', () => {
  const el = (tagName, type) => ({ tagName, type });
  const keeps = (control) => ['up', 'down', 'left', 'right'].filter((d) => keepsArrow(control, d));
  assert.deepEqual(keeps(el('INPUT', 'range')), ['left', 'right'], 'a slider keeps Left/Right for its value');
  assert.deepEqual(keeps(el('INPUT', 'number')), ['left', 'right'], 'a number field keeps Left/Right for its caret');
  assert.deepEqual(keeps(el('INPUT', 'text')), ['left', 'right'], 'a text field too');
  assert.deepEqual(keeps(el('TEXTAREA', 'textarea')), ['left', 'right']);
  assert.deepEqual(keeps(el('INPUT', 'checkbox')), [], 'a toggle owns no arrow');
  assert.deepEqual(keeps(el('BUTTON', 'button')), [], 'a button owns no arrow');
  assert.deepEqual(keeps(el('A')), []);
  assert.deepEqual(keeps(el('SELECT', 'select-one')), ['up', 'down', 'left', 'right']);
  assert.deepEqual(keeps(null), []);
});

test('router and navigation are DOM-free', () => {
  for (const f of ['js/shell/router.js', 'js/shell/navigation.js']) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(document|window|navigator)\b/, `${f} touches no browser global`);
    assert.doesNotMatch(src, /from ['"]three['"]/, `${f} does not import three.js`);
  }
});

// ---------------------------------------------------------------- the shell's wiring

const MAIN = read('js/main.js');
const SCREEN_TABLE = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));

test('every screen change in the shell goes through the router', () => {
  assert.ok(SCREEN_TABLE.length > 200, 'js/main.js declares its screen table');
  assert.doesNotMatch(MAIN, /S\.mode\s*=[^=]/, 'nothing assigns the mode directly');
  const outside = MAIN.replace(SCREEN_TABLE, '');
  assert.doesNotMatch(outside, /ui\.show(Menu|Ready|Playing|Pause)\(/, 'no screen is shown outside the screen table');
  for (const name of ['menu', 'ready', 'playing', 'paused', 'ctxlost']) {
    assert.match(SCREEN_TABLE, new RegExp(`\\b${name}: \\{`), `the table declares ${name}`);
  }
  assert.doesNotMatch(read('js/ui.js').slice(read('js/ui.js').indexOf('showPause(')), /^\s*\(ended[^\n]*\.focus\(/m,
    'the pause card does not pick its own focus');
});

test('the shell declares a default focus for each screen it shows', () => {
  const decl = Object.fromEntries([...SCREEN_TABLE.matchAll(/'?\b([\w-]+)'?: \{[^\n]*?defaultFocus: (?:'([^']+)'|null|\(\))/g)]
    .map((m) => [m[1], m[2] ?? null]));
  assert.equal(decl.menu, '[data-entry][data-last]', 'the menu focuses the last mode played');
  assert.match(decl['board-choice'], /data-preset/, 'the 3D board choice focuses the last played board');
  assert.equal(decl.ready, '#ready-btn');
  assert.equal(decl.ctxlost, '#ctx-lost-btn');
  assert.match(SCREEN_TABLE, /paused: \{[^\n]*defaultFocus: \(\) =>[^\n]*'#p-restart'[^\n]*'#p-resume'/, 'pause: Resume, or Play again once ended');
});

test('Esc and the controller back button always resolve Back through the router', () => {
  assert.match(MAIN, /isBackKey\(code\)\)\s*\{\s*shellBack\('key'\)/, 'Esc calls Back');
  assert.match(MAIN, /function shellBack\(source\)[\s\S]*?SHELL\.back\(source\)/, 'Back is resolved by the router');
  assert.doesNotMatch(MAIN, /pressed\(BTN\.BACK\)\)\s*toggleSound/, 'the back button is not a sound toggle');
  assert.match(MAIN, /backButtons\(S\.mode\)/, 'the controller back buttons depend on the screen');
});

test('the arrow keys move focus through the D-pad\'s spatial search, off the boards, Records and the replay viewer', () => {
  assert.match(read('js/input.js'), /if \(!e\.repeat \|\| ARROW_KEYS\.has\(e\.code\)\) this\.o\.onKey\?\.\(e\.code, e\)/,
    'arrows reach the shell with the browser\'s key repeat');
  assert.match(MAIN, /const dir = arrowDirection\(code\);\s*if \(dir\) \{ keyNav\(dir, e\); return; \}/);
  const nav = MAIN.slice(MAIN.indexOf('function keyNav('), MAIN.indexOf('\n}\n', MAIN.indexOf('function keyNav(')));
  assert.match(nav, /e\.defaultPrevented/, 'an arrow a control already handled is left alone');
  assert.match(nav, /KEY_NAV_OFF\.has\(S\.mode\)/);
  assert.match(nav, /keepsArrow\(cur, dir\)/, 'a control that owns the arrow keeps it');
  assert.match(nav, /navStep\(layer, items, cur, dir\)/, 'the same spatial search as the D-pad');
  assert.match(MAIN, /function padNav\(dir\)[\s\S]*?navStep\(layer, items, cur, dir\)/, 'which the D-pad uses');
  assert.match(MAIN, /const KEY_NAV_OFF = new Set\(\['playing', 'classic-2d', 'records', REPLAY_SCREEN\]\)/);
  assert.match(MAIN, /function keyFocus\(el\) \{[\s\S]*?classList\.remove\('pad-nav'\)[\s\S]*?focusVisible: true/,
    'the keyboard shows the kit\'s keyboard ring, not the controller\'s');
});

// ---------------------------------------------------------------- browser: keyboard walk

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

test('in a browser, the keyboard walks menu → screen → Back with the default focus on each', async (t) => {
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
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const active = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.dataset?.preset || '');
    const shown = () => page.evaluate(() => ['menu', 'board-choice', 'coming-soon', 'ready', 'pause', 'ctx-lost']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')));

    assert.equal(await mode(), 'menu');
    assert.deepEqual(await shown(), ['menu']);
    const first = await active();
    assert.ok(first, 'the menu focuses its default target');

    // menu → 3D board choice → ready by keyboard
    await page.focus('#menu-entry-3d');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'board-choice');
    assert.deepEqual(await shown(), ['board-choice'], 'exactly one screen');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'ready');
    assert.deepEqual(await shown(), ['ready'], 'exactly one screen');
    assert.equal(await active(), 'ready-btn', 'the ready card focuses its button');

    // Back by keyboard: the board choice it came from, on the board just chosen, then the menu
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'board-choice');
    assert.deepEqual(await shown(), ['board-choice']);
    assert.equal(await page.evaluate(() => document.activeElement?.hasAttribute('data-last')), true, 'the last played board takes the focus');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    assert.deepEqual(await shown(), ['menu']);
    assert.equal(await active(), first, 'Back returns to the menu and its default focus');

    // Esc while playing pauses; the controls modal on the menu closes on Esc before anything else.
    await page.evaluate(() => { globalThis.__ms.start(5, 5, 5, 5); globalThis.__ms.forcePlay(); });
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused', 'Esc while playing means Pause');
    assert.equal(await active(), 'p-resume');
    await page.evaluate(() => globalThis.__ms.state.game && document.getElementById('p-menu').click());
    assert.equal(await mode(), 'menu');
    await page.click('#menu-help');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), true);

    // The existing 3D flow keeps working through the hook.
    await page.evaluate(() => { globalThis.__ms.start(5, 5, 5, 5); globalThis.__ms.forcePlay(); });
    assert.equal(await mode(), 'playing');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

test('in a browser, the arrow keys alone walk the menu, the 2D board choice, the pause card and Settings', async (t) => {
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
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const focus = () => page.evaluate(() => {
      const el = document.activeElement;
      return {
        id: el?.id || el?.dataset?.size || el?.dataset?.value || '', visible: !!el?.matches(':focus-visible'),
        pad: document.body.classList.contains('pad-nav'), ring: el ? getComputedStyle(el).outlineStyle : 'none',
      };
    });
    /** Press `key` until the focus is on `id`, at most `max` times; each press must move or keep a ring. */
    const walkTo = async (key, id, max = 30) => {
      for (let i = 0; i < max; i++) {
        if ((await focus()).id === id) return;
        await page.keyboard.press(key);
        const f = await focus();
        assert.equal(f.pad, false, 'the keyboard path never shows the controller ring');
        assert.ok(f.visible && f.ring !== 'none', `#${f.id} shows the keyboard focus ring`);
      }
      assert.equal((await focus()).id, id, `${key} reaches #${id}`);
    };

    // The main menu: Down walks the entries; Up walks back.
    assert.equal((await focus()).id, 'menu-entry-classic-2d', 'the menu opens on its default');
    await page.keyboard.press('ArrowDown');
    assert.equal((await focus()).id, 'menu-entry-3d');
    await page.keyboard.press('ArrowUp');
    assert.equal((await focus()).id, 'menu-entry-classic-2d');
    // Held down, the key repeats as the browser delivers it.
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down('ArrowDown');
    await page.keyboard.up('ArrowDown');
    assert.equal((await focus()).id, 'menu-entry-records', 'a repeated keydown moves again');
    await walkTo('ArrowUp', 'menu-entry-classic-2d');

    // The Controls panel: its tabs keep Left/Right, and Up leaves them for Close.
    await page.click('#menu-help');
    const inTabs = () => page.evaluate(() => !!document.activeElement.closest('#controls-tabs'));
    for (let i = 0; i < 4 && !(await inTabs()); i++) await page.keyboard.press('ArrowDown');
    assert.equal(await inTabs(), true, 'Down reaches the tabs');
    await page.keyboard.press('ArrowUp');
    assert.equal((await focus()).id, 'controls-close', 'Up leaves the tabs');
    await page.keyboard.press('Escape');
    await page.focus('#menu-entry-classic-2d');

    // The Classic 2D board choice: arrows walk the sizes; a number field keeps Left/Right; Down reaches Back.
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d-choice');
    await walkTo('ArrowDown', 'c2d-width');
    const before = await page.inputValue('#c2d-width');
    await page.keyboard.press('ArrowLeft');
    assert.equal((await focus()).id, 'c2d-width', 'Left stays in the field for its caret');
    await page.keyboard.press('ArrowUp');
    assert.notEqual((await focus()).id, 'c2d-width', 'Up moves focus out of the field');
    assert.equal(await page.inputValue('#c2d-width'), before, 'and leaves its value alone');
    await walkTo('ArrowDown', 'c2d-choice-back');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'menu');

    // The pause card: arrows walk its actions and its settings shortcuts; a slider keeps Left/Right.
    await page.evaluate(() => { globalThis.__ms.start(5, 5, 5, 5); globalThis.__ms.forcePlay(); });
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    assert.equal((await focus()).id, 'p-resume');
    await walkTo('ArrowDown', 'p-sens');
    const sens = await page.inputValue('#p-sens');
    await page.keyboard.press('ArrowRight');
    assert.equal((await focus()).id, 'p-sens', 'Right stays on the slider');
    assert.notEqual(await page.inputValue('#p-sens'), sens, 'and moves its value');
    await page.keyboard.press('ArrowLeft');
    await walkTo('ArrowUp', 'p-resume');
    assert.equal(await mode(), 'paused', 'the arrows never resume');
    await walkTo('ArrowDown', 'p-menu');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'menu');

    // Settings: the segmented choice keeps Left/Right, Up/Down leave it; Back is always in view.
    await page.focus('#menu-entry-settings');
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'settings');
    assert.equal((await focus()).id, 'set-lookSensitivity');
    await page.keyboard.press('ArrowUp');
    assert.equal((await focus()).id, 'set-fullscreen', 'Up leaves the slider for the Graphics section');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#set-renderResolution')), true, 'Right reaches its choice');
    const choice = () => page.evaluate(() => document.querySelector('#set-renderResolution [aria-checked="true"]').dataset.value);
    const was = await choice();
    await page.keyboard.press('ArrowRight');
    assert.notEqual(await choice(), was, 'Right changes the choice');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await choice(), was);
    const on = (await focus()).id;
    await page.keyboard.press('ArrowDown');
    assert.notEqual((await focus()).id, on, 'Down moves focus off the choice');
    assert.equal(await choice(), was, 'without changing it');
    await walkTo('ArrowDown', 'settings-back');
    const backInView = () => page.evaluate(() => {
      const r = document.getElementById('settings-back').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.height > 0;
    });
    for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 700 }]) {
      await page.setViewportSize(size);
      for (const top of [0, 1e6]) {
        await page.evaluate((y) => { document.getElementById('settings').scrollTop = y; }, top);
        assert.equal(await backInView(), true, `Back is in view at ${size.width}×${size.height}, scrolled to ${top ? 'the bottom' : 'the top'}`);
      }
    }
    // A focus move scrolls the focused control into view above the sticky row.
    await page.evaluate(() => { document.getElementById('settings').scrollTop = 0; });
    await walkTo('ArrowDown', 'settings-back');
    await walkTo('ArrowUp', 'set-lookSensitivity');
    const clear = await page.evaluate(() => {
      const row = document.getElementById('settings-back').parentElement.getBoundingClientRect();
      const tops = [...document.querySelectorAll('#settings-body button, #settings-body input')].map((e) => e.getBoundingClientRect());
      return document.activeElement.getBoundingClientRect().bottom <= row.top && tops.length > 0;
    });
    assert.equal(clear, true, 'the focused control is not under the Back row');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu', 'Back returns to the screen Settings was opened from');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
