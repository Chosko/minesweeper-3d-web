import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRouter, SHELL_SCREENS } from '../js/shell/router.js';
import {
  FOCUSABLE, topLayer, resolveFocus, focusMove, createHeldSuppressor, backButtons, isBackKey, arrowDirection, keepsArrow,
  inertSections, tabWrap,
} from '../js/shell/navigation.js';
import { BTN, NUM_BUTTONS } from '../js/gamepad.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
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

test('a focus move with nothing in the pressed direction falls back to the DOM order, with no wrap', () => {
  const items = ['a', 'b', 'c', 'd'];
  const none = () => null;
  for (const dir of ['down', 'right']) {
    assert.equal(focusMove(items, 'b', dir, { spatial: none }), 'c', `${dir}: the next focusable`);
    assert.equal(focusMove(items, 'd', dir, { spatial: none }), null, `${dir}: nothing after the last`);
  }
  for (const dir of ['up', 'left']) {
    assert.equal(focusMove(items, 'c', dir, { spatial: none }), 'b', `${dir}: the previous focusable`);
    assert.equal(focusMove(items, 'a', dir, { spatial: none }), null, `${dir}: nothing before the first`);
  }
  assert.equal(focusMove(items, 'x', 'down', { spatial: none }), null, 'a control outside the layer moves nowhere');
});

test('a focus move takes the spatial search\'s candidate when it finds one', () => {
  const items = ['a', 'b', 'c', 'd'];
  const asked = [];
  const spatial = (dir) => { asked.push(dir); return 'd'; };
  assert.equal(focusMove(items, 'a', 'down', { spatial }), 'd');
  assert.equal(focusMove(items, 'c', 'left', { spatial }), 'd');
  assert.deepEqual(asked, ['down', 'left'], 'the spatial search is asked in the pressed direction');
});

test('inside a group (a table, a menu) Down / Up step through it in DOM order; Left / Right stay spatial', () => {
  // picker above two tables: t1 holds w1, w2; t2 holds p1 (Watch), q1 (Pin), p2, q2; Back below
  const items = ['picker', 'w1', 'w2', 'older', 'toggle', 'p1', 'q1', 'p2', 'q2', 'back'];
  const table = { w1: 't1', w2: 't1', p1: 't2', q1: 't2', p2: 't2', q2: 't2' };
  const groupOf = (el) => table[el] ?? null;
  const at = (map) => (dir) => map[dir] ?? null; // a stand-in spatial search
  // stepping inside: the next / previous button of the table, whatever the spatial search says
  assert.equal(focusMove(items, 'p1', 'down', { spatial: at({ down: 'p2' }), groupOf }), 'q1', 'a row\'s second button is a Down stop');
  assert.equal(focusMove(items, 'q1', 'down', { spatial: at({ down: 'q2' }), groupOf }), 'p2');
  assert.equal(focusMove(items, 'p2', 'up', { spatial: at({ up: 'p1' }), groupOf }), 'q1', 'Up retraces it');
  // left / right inside a table stay spatial
  assert.equal(focusMove(items, 'p1', 'right', { spatial: at({ right: 'q1' }), groupOf }), 'q1');
  assert.equal(focusMove(items, 'q2', 'left', { spatial: at({ left: 'p2' }), groupOf }), 'p2');
  // leaving at either end: the next / previous control in DOM order, whatever the spatial search says
  assert.equal(focusMove(items, 'q2', 'down', { spatial: at({ down: 'picker' }), groupOf }), 'back');
  assert.equal(focusMove(items, 'w2', 'down', { spatial: at({ down: 'q1' }), groupOf }), 'older');
  assert.equal(focusMove(items, 'w1', 'up', { spatial: at({ up: 'toggle' }), groupOf }), 'picker');
  assert.equal(focusMove(['p1', 'q1'], 'q1', 'down', { spatial: at({ down: 'p1' }), groupOf }), null, 'no wrap past the layer\'s last control');
  // entering a table from above lands on its first button, from below on its last
  assert.equal(focusMove(items, 'toggle', 'down', { spatial: at({ down: 'q1' }), groupOf }), 'p1');
  assert.equal(focusMove(items, 'back', 'up', { spatial: at({ up: 'p2' }), groupOf }), 'q2');
  assert.equal(focusMove(items, 'older', 'up', { spatial: at({ up: 'w1' }), groupOf }), 'w2');
  // repeated Down from above a table visits each of its buttons before leaving it, and Up retraces
  const spatial = (from) => at({ toggle: { down: 'q1' }, q2: { down: 'back' }, back: { up: 'q2' }, p1: { up: 'toggle' } }[from] ?? {});
  const walk = (start, dir, n) => {
    const seen = [start];
    for (let i = 0; i < n; i++) seen.push(focusMove(items, seen.at(-1), dir, { spatial: spatial(seen.at(-1)), groupOf }));
    return seen;
  };
  assert.deepEqual(walk('toggle', 'down', 5), ['toggle', 'p1', 'q1', 'p2', 'q2', 'back']);
  assert.deepEqual(walk('back', 'up', 5), ['back', 'q2', 'p2', 'q1', 'p1', 'toggle']);
});

test('an open overlay makes every other top-level section inert, except the status toast', () => {
  const sections = ['scene-ui', 'c2d', 'hud', 'toast', 'menu', 'controls-modal', 'replay', 'results', 'pause'];
  assert.deepEqual(inertSections(sections, 'controls-modal'), ['scene-ui', 'c2d', 'hud', 'menu', 'replay', 'results', 'pause']);
  assert.deepEqual(inertSections(sections, 'pause'), ['scene-ui', 'c2d', 'hud', 'menu', 'controls-modal', 'replay', 'results']);
  assert.ok(!inertSections(sections, 'results').includes('toast'), 'the toast stays live');
  assert.deepEqual(inertSections(sections, null), [], 'no overlay open: nothing inert');
  // The confirmation inside the pause card: the card's other parts, with nothing kept live.
  assert.deepEqual(inertSections(['title', 'actions', 'confirm', 'settings'], 'confirm', []), ['title', 'actions', 'settings']);
});

test('Tab wraps at the overlay\'s edges and leaves the middle to the browser', () => {
  const items = ['first', 'middle', 'last'];
  assert.equal(tabWrap(items, 'last', false), 'first', 'Tab from the last control goes to the first');
  assert.equal(tabWrap(items, 'first', true), 'last', 'Shift+Tab from the first goes to the last');
  assert.equal(tabWrap(items, 'middle', false), null);
  assert.equal(tabWrap(items, 'middle', true), null);
  assert.equal(tabWrap(items, 'first', false), null);
  assert.equal(tabWrap(items, 'last', true), null);
  assert.equal(tabWrap(['only'], 'only', false), 'only', 'a single control keeps focus');
  assert.equal(tabWrap(items, 'outside', false), 'first', 'focus outside the overlay enters it at the first control');
  assert.equal(tabWrap(items, 'outside', true), 'last', 'or, with Shift, at the last');
  assert.equal(tabWrap([], 'outside', false), null);
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
  assert.match(SCREEN_TABLE, /\bmenu: \{ defaultFocus: \(\) => `#menu-entry-\$\{menuFocusEntry\(\)\}`/, 'the menu focuses its selection: the entry Back returns to, else the last mode played');
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

test('the arrow keys move focus through the D-pad\'s spatial search, off the boards, Records, the replay viewer and the look', () => {
  assert.match(read('js/input.js'), /if \(!e\.repeat \|\| ARROW_KEYS\.has\(e\.code\)\) this\.o\.onKey\?\.\(e\.code, e\)/,
    'arrows reach the shell with the browser\'s key repeat');
  assert.match(MAIN, /const dir = arrowDirection\(code\);\s*if \(dir\) \{ keyNav\(dir, e\); return; \}/);
  const nav = MAIN.slice(MAIN.indexOf('function keyNav('), MAIN.indexOf('\n}\n', MAIN.indexOf('function keyNav(')));
  assert.match(nav, /e\.defaultPrevented/, 'an arrow a control already handled is left alone');
  assert.match(nav, /KEY_NAV_OFF\.has\(S\.mode\)/);
  assert.match(nav, /keepsArrow\(cur, dir\)/, 'a control that owns the arrow keeps it');
  assert.match(nav, /navStep\(layer, items, cur, dir\)/, 'the same spatial search as the D-pad');
  assert.match(MAIN, /function padNav\(dir\)[\s\S]*?navStep\(layer, items, cur, dir\)/, 'which the D-pad uses');
  assert.match(MAIN, /function navStep\([^)]*\) \{[^}]*focusMove\(items, cur, dir,/, 'both through the one DOM-order fallback');
  assert.match(MAIN, /const KEY_NAV_OFF = new Set\(\['playing', 'classic-2d', 'records', REPLAY_SCREEN, LOOK_SCREEN\]\)/, 'nor the look at a finished 3D board, whose card is hidden');
  assert.match(MAIN, /function keyFocus\(el\) \{[\s\S]*?classList\.remove\('pad-nav'\)[\s\S]*?focusVisible: true/,
    'the keyboard shows the kit\'s keyboard ring, not the controller\'s');
});

// ---------------------------------------------------------------- browser: keyboard walk

test('in a browser, the keyboard walks menu → screen → Back with the default focus on each', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
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
    assert.equal(await active(), 'menu-entry-3d', 'Back returns to the menu with the entry it opened selected');
    assert.equal(first, 'menu-entry-classic-2d');

    // Esc while playing pauses; the controls reference over Settings closes on Esc before anything else.
    await page.evaluate(() => { globalThis.__ms.start(5, 5, 5, 5); globalThis.__ms.forcePlay(); });
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused', 'Esc while playing means Pause');
    assert.equal(await active(), 'p-resume');
    await page.evaluate(() => globalThis.__ms.state.game && document.getElementById('p-menu').click());
    assert.equal(await mode(), 'menu');
    await page.click('#menu-entry-settings');
    await page.click('#set-controls');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'settings');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), true);
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');

    // The existing 3D flow keeps working through the hook.
    await page.evaluate(() => { globalThis.__ms.start(5, 5, 5, 5); globalThis.__ms.forcePlay(); });
    assert.equal(await mode(), 'playing');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the arrow keys alone walk the menu, the 2D board choice, the pause card and Settings', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const mode = () => page.evaluate(() => globalThis.__ms.state.mode);
    const focus = () => page.evaluate(() => {
      const el = document.activeElement;
      return {
        id: el?.id || el?.dataset?.size || el?.dataset?.value || '', visible: !!el?.matches(':focus-visible'),
        pad: document.body.classList.contains('pad-nav'), ring: el ? getComputedStyle(el).outlineStyle : 'none',
        selectable: !!el?.matches('.ui-button, .ui-menu__item, .ui-mode-entry, .ui-option'),
      };
    });
    // The focused state a button, menu entry or board option shows is its selected look, once its move settles.
    const selected = async () => {
      await page.waitForTimeout(200);
      return page.evaluate(() => getComputedStyle(document.activeElement).transform !== 'none');
    };
    /** Press `key` until the focus is on `id`, at most `max` times; each press must move or keep a focused state. */
    const walkTo = async (key, id, max = 30) => {
      for (let i = 0; i < max; i++) {
        if ((await focus()).id === id) return;
        await page.keyboard.press(key);
        const f = await focus();
        assert.equal(f.pad, false, 'the keyboard path never shows the controller ring');
        assert.ok(f.visible && (f.selectable ? f.ring === 'none' && await selected() : f.ring !== 'none'), `#${f.id} shows its keyboard focused state`);
      }
      assert.equal((await focus()).id, id, `${key} reaches #${id}`);
    };

    // The main menu: Down walks the entries; Up walks back.
    assert.equal((await focus()).id, 'menu-entry-classic-2d', 'the menu opens on its default');
    await page.keyboard.press('ArrowDown');
    assert.equal((await focus()).id, 'menu-entry-hexagon');
    await page.keyboard.press('ArrowUp');
    assert.equal((await focus()).id, 'menu-entry-classic-2d');
    // Held down, the key repeats as the browser delivers it.
    await page.keyboard.down('ArrowDown');
    await page.keyboard.down('ArrowDown');
    await page.keyboard.up('ArrowDown');
    assert.equal((await focus()).id, 'menu-entry-triangle', 'a repeated keydown moves again');
    await walkTo('ArrowDown', 'menu-entry-quit');
    await walkTo('ArrowUp', 'menu-entry-classic-2d');

    // The Classic 2D board choice: arrows walk the options, Space chooses Custom, a number field keeps
    // Left/Right, Down reaches Play and Up from the first option Back.
    await page.keyboard.press('Enter');
    assert.equal(await mode(), 'classic-2d-choice');
    await walkTo('ArrowDown', 'custom');
    await page.keyboard.press('Space');
    assert.equal(await page.evaluate(() => document.querySelector('#c2d-choice [aria-pressed="true"]').dataset.size), 'custom');
    assert.equal(await mode(), 'classic-2d-choice', 'choosing starts nothing');
    await walkTo('ArrowRight', 'c2d-random');
    await walkTo('ArrowUp', 'c2d-width');
    const before = await page.inputValue('#c2d-width');
    await page.keyboard.press('ArrowLeft');
    assert.equal((await focus()).id, 'c2d-width', 'Left stays in the field for its caret');
    await page.keyboard.press('ArrowUp');
    assert.notEqual((await focus()).id, 'c2d-width', 'Up moves focus out of the field');
    assert.equal(await page.inputValue('#c2d-width'), before, 'and leaves its value alone');
    await walkTo('ArrowDown', 'c2d-play');
    await walkTo('ArrowUp', 'c2d-choice-back');
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
    assert.equal((await focus()).id, 'settings-back', 'above the first control: the head\'s Back');
    await page.keyboard.press('ArrowDown');
    assert.equal((await focus()).id, 'set-lookSensitivity', 'and Down returns to it');
    await page.focus('#set-fullscreen');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => !!document.activeElement.closest('#set-renderResolution')), true, 'Down reaches its choice');
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
    // At 1280 px the sections sit in two placed columns: Down walks them as they show.
    await page.focus('#set-controls');
    await page.keyboard.press('ArrowDown');
    assert.equal((await focus()).id, 'set-fullscreen', 'Down from Controls reaches Graphics, below it');
    // Down into a choice lands on its checked option, wherever that sits.
    await page.evaluate(() => globalThis.__ms.settings.set('renderResolution', 'sharp'));
    await page.focus('#set-fullscreen');
    await page.keyboard.press('ArrowDown');
    assert.deepEqual(await page.evaluate(() => [document.activeElement.closest('[role="radiogroup"]')?.id, document.activeElement.dataset.value]),
      ['set-renderResolution', 'sharp'], 'Down lands on the checked option, not the nearest one');
    await page.evaluate(() => globalThis.__ms.settings.set('renderResolution', 'auto'));
    // From the first control, the arrows alone reach every control of the page: each control, and each
    // choice at one of its options, in the placed columns (1280 px) and the laid-out ones (1920 px).
    const keyOf = () => page.evaluate(() => {
      const el = document.activeElement;
      return el.id || `${el.closest('[role="radiogroup"]').id}|${el.dataset.value}`;
    });
    const focusKey = (key) => page.evaluate((k) => {
      const [group, value] = k.split('|');
      (value === undefined ? document.getElementById(group) : document.querySelector(`#${group} [data-value="${value}"]`)).focus();
    }, key);
    for (const size of [{ width: 1280, height: 800 }, { width: 1920, height: 1080 }]) {
      await page.setViewportSize(size);
      await page.focus('#set-lookSensitivity');
      const seen = new Set([await keyOf()]);
      const queue = [...seen];
      while (queue.length) {
        const from = queue.shift();
        for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
          await focusKey(from);
          await page.keyboard.press(key);
          const to = await keyOf();
          if (!seen.has(to)) { seen.add(to); queue.push(to); }
        }
      }
      const targets = await page.evaluate(() => [...document.querySelectorAll('#settings button, #settings input')]
        .filter((e) => !e.disabled && e.getBoundingClientRect().width > 0)
        .map((e) => e.closest('[role="radiogroup"]')?.id ?? e.id));
      const reached = new Set([...seen].map((k) => k.split('|')[0]));
      assert.deepEqual([...new Set(targets)].filter((id) => !reached.has(id)), [], `${size.width} px: the arrows reach every control`);
      for (const id of ['set-reset', 'set-bind-device', 'settings-back']) assert.ok(reached.has(id), `${size.width} px: #${id} reached`);
    }
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.evaluate(() => globalThis.__ms.settings.set('renderResolution', 'auto'));
    const backInView = () => page.evaluate(() => {
      const r = document.getElementById('settings-back').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight && r.height > 0;
    });
    for (const size of [{ width: 1280, height: 800 }, { width: 390, height: 700 }]) {
      await page.setViewportSize(size);
      for (const top of [0, 1e6]) {
        await page.evaluate((y) => { document.getElementById('settings-body').scrollTop = y; }, top);
        assert.equal(await backInView(), true, `Back is in view at ${size.width}×${size.height}, scrolled to ${top ? 'the bottom' : 'the top'}`);
      }
    }
    // A focus move scrolls the focused control into the frame's body, below its head.
    await page.evaluate(() => { document.getElementById('settings-body').scrollTop = 0; });
    await page.focus('#set-reset');
    const shown = await page.evaluate(() => {
      const body = document.getElementById('settings-body').getBoundingClientRect();
      const r = document.activeElement.getBoundingClientRect();
      return r.top >= body.top && r.bottom <= body.bottom;
    });
    assert.equal(shown, true, 'the focused control is in view under the head');
    await page.setViewportSize({ width: 1280, height: 800 });

    // The Controls action's panel: its tabs keep Left/Right, and Up leaves them for Close.
    await page.click('#set-controls');
    const inTabs = () => page.evaluate(() => !!document.activeElement.closest('#controls-tabs'));
    for (let i = 0; i < 4 && !(await inTabs()); i++) await page.keyboard.press('ArrowDown');
    assert.equal(await inTabs(), true, 'Down reaches the tabs');
    await page.keyboard.press('ArrowUp');
    assert.equal((await focus()).id, 'controls-close', 'Up leaves the tabs');
    await page.keyboard.press('Escape');
    assert.equal((await focus()).id, 'set-controls', 'closing gives the focus back to the action');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu', 'Back returns to the screen Settings was opened from');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
