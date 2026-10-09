import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRouter, SHELL_SCREENS } from '../js/shell/router.js';
import {
  FOCUSABLE, topLayer, resolveFocus, createHeldSuppressor, backButtons, isBackKey,
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
  const decl = Object.fromEntries([...SCREEN_TABLE.matchAll(/\b([\w]+): \{[^\n]*?defaultFocus: (?:'([^']+)'|null|\(\))/g)]
    .map((m) => [m[1], m[2] ?? null]));
  assert.match(decl.menu, /data-preset/, 'the menu focuses the last played board');
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
    const shown = () => page.evaluate(() => ['menu', 'ready', 'pause', 'ctx-lost']
      .filter((id) => !document.getElementById(id).classList.contains('hidden')));

    assert.equal(await mode(), 'menu');
    assert.deepEqual(await shown(), ['menu']);
    const first = await active();
    assert.ok(first, 'the menu focuses its default target');

    // menu → ready by keyboard
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'ready');
    assert.deepEqual(await shown(), ['ready'], 'exactly one screen');
    assert.equal(await active(), 'ready-btn', 'the ready card focuses its button');

    // Back by keyboard
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    assert.deepEqual(await shown(), ['menu']);
    assert.equal(await active(), first, 'Back returns to the menu and its default focus');

    // Esc while playing pauses; the controls modal on the menu closes on Esc before anything else.
    await page.keyboard.press('Enter');
    await page.evaluate(() => globalThis.__ms.forcePlay());
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
