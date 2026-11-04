// Both modes' input read through the bindings resolver (js/settings/resolver.js): the flat modes'
// pointer input (logical buttons from the resolver, in front of the button swap and the state
// machine) and cell cursor (keys and controller buttons), the 3D keyboard, mouse and controller
// (js/input.js, js/controls.js), the reserved inputs kept ahead of the bindings — F2, R and the
// Start + Y chord — and an input held through a binding change dropped, not fired. In a browser, a
// fixed Classic 2D board won with rebound keys, and a flat-mode key rebinding revealing on Hexagon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createSettingsStore } from '../js/settings/store.js';
import { createBindings, resolveBindings } from '../js/settings/resolver.js';
import { BUTTON, pointerButton, mountPointerInput } from '../js/classic2d/pointer-input.js';
import { createCursorInput, mountCursorInput } from '../js/classic2d/cursor-input.js';
import { createButtonSwap } from '../js/classic2d/button-swap.js';
import { MouseActions, Input } from '../js/input.js';
import { padActions3D, createStartChord } from '../js/controls.js';
import { restartInput } from '../js/shell/pause.js';
import { BTN, NUM_BUTTONS } from '../js/gamepad.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { browserSuite } from './helpers/browser.mjs';

const suite = browserSuite();

async function bindingsOver() {
  const store = createSettingsStore({ storage: createStorage({ backend: createMemoryBackend() }), legacy: null });
  await store.load();
  return createBindings({ store });
}

// ---------------------------------------------------------------- the flat modes' board

// 5 × 4, a mine in the top-left corner: (1, 1) is a 1 with eight closed neighbours.
const CORNER = ['*....', '.....', '.....', '.....'];

function board(rows = CORNER) {
  const width = rows[0].length;
  const height = rows.length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((line, row) => [...line].forEach((ch, col) => { if (ch === '*') mines.push(grid.index(col, row)); }));
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines, dimensions: { width, height } });
  return { grid, game };
}

function sessionOver(game, grid, asked) {
  return {
    state: 'playing',
    paused: false,
    game,
    setup: { grid },
    reveal: (c) => { asked.push(['reveal', c]); return game.reveal(c); },
    toggleFlag: (c) => { asked.push(['toggleFlag', c]); return game.toggleFlag(c); },
    chord: (c) => { asked.push(['chord', c]); return game.chord(c); },
  };
}

function mouse(type, props) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { button: 0, clientX: 0, clientY: 0, shiftKey: false, ...props });
}

function key(type, code, props = {}) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...props });
}

/** The pointer input mounted over a 10 px-cell fake view of CORNER, through `bindings` and `swap`. */
function pointerWiring(bindings, { swap = null } = {}) {
  const { grid, game } = board();
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 50, height: 40 });
  const win = new EventTarget();
  const view = {
    canvas,
    layout: { scrolls: false },
    cellAt: (x, y) => (x >= 0 && y >= 0 && x < 50 && y < 40 ? Math.floor(x / 10) + 5 * Math.floor(y / 10) : -1),
    setPressed: () => {},
  };
  const asked = [];
  const mounted = mountPointerInput({ view, session: sessionOver(game, grid, asked), graph: grid.graph, win, bindings, swap });
  const xy = (c) => ({ clientX: (c % 5) * 10 + 5, clientY: Math.floor(c / 5) * 10 + 5 });
  return {
    grid, game, asked, mounted,
    down: (button, c) => canvas.dispatchEvent(mouse('mousedown', { button, ...xy(c) })),
    up: (button, c) => win.dispatchEvent(mouse('mouseup', { button, ...xy(c) })),
    click(button, c) { this.down(button, c); this.up(button, c); },
  };
}

/** The cursor input mounted over CORNER through `bindings`, its keys on a fake page. */
function cursorWiring(bindings) {
  const { grid, game } = board();
  const win = new EventTarget();
  let time = 0;
  win.requestAnimationFrame = () => 1;
  win.cancelAnimationFrame = () => {};
  win.performance = { now: () => (time += 1000) };
  const view = { canvas: new EventTarget(), setPressed: () => {}, setCursor: () => {}, ensureVisible: () => false };
  const asked = [];
  const mounted = mountCursorInput({ view, session: sessionOver(game, grid, asked), win, bindings });
  return {
    grid, game, asked, mounted,
    down: (code, props) => { const e = key('keydown', code, props); win.dispatchEvent(e); return e; },
    up: (code) => win.dispatchEvent(key('keyup', code)),
    press(code) { this.down(code); this.up(code); },
    get cell() { return mounted.input.cell; },
  };
}

// A poll result as js/gamepad.js's GamepadReader returns it, with the buttons named held.
function poll(held = [], ls = [0, 0]) {
  const h = new Array(NUM_BUTTONS).fill(false);
  for (const b of held) h[b] = true;
  return { held: h, ls };
}

test('flat: with no override each physical mouse button is its own logical button', () => {
  for (const b of [BUTTON.LEFT, BUTTON.MIDDLE, BUTTON.RIGHT]) assert.equal(pointerButton(undefined, b), b);
  assert.equal(pointerButton(undefined, 3), null, 'back and forward are bound to nothing');
});

test('flat: a swapped mouse reveals on the right button, flags on the left, and still chords on both', async () => {
  const bindings = await bindingsOver();
  const r = await bindings.bind('classic-2d', 'mouse', 'reveal', 0, BUTTON.RIGHT);
  assert.deepEqual(r, { ok: true, swapped: { action: 'flag', input: BUTTON.LEFT } });
  assert.equal(pointerButton(bindings, BUTTON.RIGHT), BUTTON.LEFT, 'the right button stands for the left one');
  assert.equal(pointerButton(bindings, BUTTON.LEFT), BUTTON.RIGHT);
  const w = pointerWiring(bindings);
  const one = w.grid.index(1, 1);
  w.down(BUTTON.LEFT, 0);
  assert.deepEqual(w.asked, [['toggleFlag', 0]], 'the left press flags at once');
  w.up(BUTTON.LEFT, 0);
  w.down(BUTTON.RIGHT, 7);
  assert.deepEqual(w.asked.length, 1, 'nothing on the right press');
  w.up(BUTTON.RIGHT, 7);
  assert.deepEqual(w.asked.at(-1), ['reveal', 7], 'the right release reveals');
  w.click(BUTTON.RIGHT, one);
  assert.equal(w.game.cellState(one), 'revealed');
  const before = w.asked.length;
  w.down(BUTTON.RIGHT, one);
  w.down(BUTTON.LEFT, one);
  w.up(BUTTON.RIGHT, one);
  w.up(BUTTON.LEFT, one);
  assert.deepEqual(w.asked.slice(before), [['chord', one]], 'both buttons chord, on the release of the reveal one');
});

test('flat: the button swap trades the buttons the bindings produce, in front of the state machine', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('classic-2d', 'mouse', 'reveal', 0, BUTTON.RIGHT);
  const swap = createButtonSwap();
  swap.toggle();
  const w = pointerWiring(bindings, { swap });
  w.click(BUTTON.LEFT, 7);
  assert.deepEqual(w.asked, [['reveal', 7]], 'swapped twice: the left button reveals a closed cell again');
});

test('flat: a mouse button bound directly to chord chords a number and never reveals', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('classic-2d', 'mouse', 'chord', 0, 3);
  assert.equal(pointerButton(bindings, 3), BUTTON.CHORD);
  const w = pointerWiring(bindings);
  const one = w.grid.index(1, 1);
  w.click(BUTTON.LEFT, one);
  w.click(3, 7);
  assert.deepEqual(w.asked, [['reveal', one]], 'the chord button opens no closed cell');
  w.down(BUTTON.RIGHT, 0);
  w.up(BUTTON.RIGHT, 0);
  w.click(3, one);
  assert.deepEqual(w.asked.at(-1), ['chord', one], 'the same chord action as left + right');
});

test('flat: a rebound move key moves the cursor, and the key it replaced does nothing', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('hexagon', 'keyboard', 'right', 0, 'KeyL');
  const w = cursorWiring(bindings);
  w.press('ArrowRight');
  assert.equal(w.cell, 0, 'the arrow is no longer bound');
  assert.equal(w.down('ArrowRight').defaultPrevented, false, 'and is left to the page');
  w.up('ArrowRight');
  w.press('KeyL');
  assert.equal(w.cell, 1, 'L moves right, in every flat mode');
  w.press('KeyD');
  w.press('Space');
  assert.deepEqual(w.asked, [['reveal', 1]], 'the other keys keep their actions');
});

test('flat: a rebound controller button reveals, and the button it replaced does nothing', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('triangle', 'controller', 'reveal', 0, BTN.LB);
  const { grid, game } = board();
  const acts = [];
  const cursor = createCursorInput({ grid, game: () => game, bindings, onPress() {}, onAction: (k, c) => acts.push([k, c]) });
  cursor.setCell(7);
  cursor.pad(poll([BTN.A]), 0);
  cursor.pad(poll([]), 16);
  assert.deepEqual(acts, [], 'A is no longer reveal');
  cursor.pad(poll([BTN.LB]), 32);
  cursor.pad(poll([]), 48);
  assert.deepEqual(acts, [['reveal', 7]], 'LB reveals on its release');
  cursor.pad(poll([BTN.RIGHT]), 64);
  assert.equal(cursor.cell, 8, 'the d-pad still moves');
});

// ---------------------------------------------------------------- 3D

function fakeTarget(extra = {}) {
  const l = {};
  return { ...extra, addEventListener(t, f) { (l[t] ??= []).push(f); }, fire(t, e) { for (const f of l[t] ?? []) f(e); } };
}

/** An Input over a fake page, through `bindings`, its actions recorded; locked after lock(). */
function inputSetup(bindings) {
  const saved = { window: globalThis.window, document: globalThis.document };
  const win = fakeTarget();
  const canvas = {};
  const doc = fakeTarget({ hidden: false, pointerLockElement: null });
  globalThis.window = win;
  globalThis.document = doc;
  const actions = [];
  const keysSeen = [];
  const mouseActions = new MouseActions((t) => actions.push(t), () => true);
  let input;
  try {
    input = new Input({
      canvas, mouse: mouseActions, isActive: () => true, onLook() {}, onWheel() {}, onKey: (code) => keysSeen.push(code), bindings,
    });
  } finally {
    globalThis.window = saved.window;
    globalThis.document = saved.document;
  }
  const fire = (target, type, e) => { const ev = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...e }; target.fire(type, ev); return ev; };
  return {
    input, actions, keysSeen,
    down: (code, repeat = false) => fire(win, 'keydown', { code, repeat, ctrlKey: false }),
    up: (code) => fire(win, 'keyup', { code }),
    lock() { doc.pointerLockElement = canvas; doc.fire('pointerlockchange', {}); },
    mouseDown: (button) => fire(doc, 'mousedown', { button }),
    mouseUp: (button) => fire(doc, 'mouseup', { button }),
  };
}

test('3D: a rebound move key and a rebound view-mode key are what the controls read', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('3d', 'keyboard', 'forward', 0, 'KeyI');
  await bindings.bind('3d', 'keyboard', 'neighbours', 0, 'KeyZ');
  const s = inputSetup(bindings);
  s.down('KeyW');
  assert.equal(s.input.move.w, false, 'W no longer flies forward');
  s.up('KeyW');
  assert.equal(s.down('KeyI').defaultPrevented, true, 'the bound key is the game\'s');
  assert.equal(s.input.move.w, true, 'I flies forward');
  s.up('KeyI');
  assert.equal(s.input.move.w, false);
  s.down('KeyZ');
  assert.equal(s.input.shift, true, 'Z holds the neighbours view');
  s.up('KeyZ');
  s.down('ShiftRight');
  assert.equal(s.input.shift, true, 'the other Shift kept its slot');
});

test('3D: rebound reveal and flag keys and mouse buttons drive the one MouseActions', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('3d', 'keyboard', 'reveal', 0, 'KeyT');
  await bindings.bind('3d', 'mouse', 'flag', 0, 0);
  const s = inputSetup(bindings);
  s.down('Enter'); s.up('Enter');
  assert.deepEqual(s.actions, [], 'Enter reveals no more');
  s.down('KeyT'); s.up('KeyT');
  assert.deepEqual(s.actions, ['left']);
  s.lock();
  s.mouseDown(0); s.mouseUp(0);
  s.mouseDown(2); s.mouseUp(2);
  assert.deepEqual(s.actions, ['left', 'right', 'left'], 'the left button flags, the right reveals');
  s.mouseDown(0); s.mouseDown(2); s.mouseUp(0); s.mouseUp(2);
  assert.deepEqual(s.actions.at(-1), 'chord', 'both still chord');
});

test('3D: with no override the controller gives today\'s modes, moves and trigger buttons', () => {
  const held = new Set([BTN.LB, BTN.Y, BTN.A]);
  const a = padActions3D({ held: (b) => held.has(b), pressed: (b) => b === BTN.RT, released: (b) => b === BTN.LT });
  assert.deepEqual(a.modes, { shift: true, space: false, ctrl: true });
  assert.deepEqual(a.move, { f: 0, r: 0, u: 1 });
  assert.deepEqual(a.press, [0]);
  assert.deepEqual(a.release, [2]);
});

test('3D: a rebound controller button gives its new action, and the swapped one takes its old place', async () => {
  const bindings = await bindingsOver();
  const r = await bindings.bind('3d', 'controller', 'up', 0, BTN.LB);
  assert.deepEqual(r.swapped, { action: 'neighbours', input: BTN.A });
  const only = (b) => (x) => x === b;
  assert.deepEqual(padActions3D({ held: only(BTN.LB), pressed: () => false, released: () => false }, bindings).move.u, 1, 'LB rises');
  assert.equal(padActions3D({ held: only(BTN.LB), pressed: () => false, released: () => false }, bindings).modes.shift, false);
  assert.equal(padActions3D({ held: only(BTN.A), pressed: () => false, released: () => false }, bindings).modes.shift, true, 'A holds the neighbours view');
  await bindings.bind('3d', 'controller', 'reveal', 0, BTN.RB);
  assert.deepEqual(padActions3D({ held: () => false, pressed: only(BTN.RB), released: () => false }, bindings).press, [0], 'RB presses the reveal button');
  assert.deepEqual(padActions3D({ held: () => false, pressed: only(BTN.RT), released: () => false }, bindings).press, [], 'RT holds aim-through now, no reveal');
});

// ---------------------------------------------------------------- reserved inputs ahead of the bindings

test('Start + Y restarts whatever Y is bound to, and Y alone still fires its binding', async () => {
  const bindings = await bindingsOver();
  await bindings.bind('3d', 'controller', 'neighbours', 0, BTN.Y);
  await bindings.bind('classic-2d', 'controller', 'flag', 0, BTN.Y);
  assert.equal(bindings.actionFor('3d', 'controller', BTN.Y), 'neighbours');
  assert.equal(bindings.actionFor('classic-2d', 'controller', BTN.Y), 'flag');

  // 3D: the chord is read ahead of the bindings, and Y stays kept from them until released.
  const chord = createStartChord();
  const p = poll([BTN.START, BTN.Y]);
  assert.equal(chord.update(p, (b) => b === BTN.Y), true, 'Y pressed while Start is held is the restart chord');
  assert.equal(restartInput('pad', { screen: 'playing' }), 'restart');
  const kept = (b) => !chord.keeps(b) && p.held[b];
  assert.equal(padActions3D({ held: kept, pressed: () => false, released: () => false }, bindings).modes.shift, false, 'Y is not translated');
  assert.equal(chord.update(poll([BTN.Y]), () => false), false);
  assert.equal(chord.keeps(BTN.Y), true, 'still kept while held');
  assert.equal(chord.update(poll([]), () => false), false);
  assert.equal(chord.keeps(BTN.Y), true, 'kept through the poll of its release, so its release edge acts on nothing');
  chord.update(poll([]), () => false);
  assert.equal(chord.keeps(BTN.Y), false, 'then it binds again');
  const alone = poll([BTN.Y]);
  assert.equal(chord.update(alone, (b) => b === BTN.Y), false, 'Y alone is no chord');
  assert.equal(padActions3D({ held: (b) => !chord.keeps(b) && alone.held[b], pressed: () => false, released: () => false }, bindings).modes.shift, true, 'Y alone holds the neighbours view');

  // The flat modes: the same chord keeps Y from the cursor; Y alone flags.
  const { grid, game } = board();
  const acts = [];
  const cursor = createCursorInput({ grid, game: () => game, bindings, onPress() {}, onAction: (k, c) => acts.push([k, c]) });
  cursor.setCell(7);
  const flat = createStartChord();
  const both = poll([BTN.START, BTN.Y]);
  assert.equal(flat.update(both, (b) => b === BTN.Y), true);
  cursor.pad({ ...both, held: both.held.map((h, b) => h && !flat.keeps(b)) }, 0);
  cursor.pad(poll([]), 16);
  flat.update(poll([]), () => false);
  assert.deepEqual(acts, [], 'the chord\'s Y never reaches the board');
  cursor.pad(poll([BTN.Y]), 32);
  assert.deepEqual(acts, [['toggleFlag', 7]], 'Y alone flags');
});

test('F2 and R keep their restart and play-again meaning, and no binding reaches them', async () => {
  const bindings = await bindingsOver();
  for (const mode of ['classic-2d', '3d']) {
    for (const code of ['F2', 'KeyR']) {
      assert.equal(bindings.actionFor(mode, 'keyboard', code), null, `${code} is no ${mode} action`);
      assert.deepEqual(await bindings.bind(mode, 'keyboard', 'reveal', 0, code), { ok: false, reason: 'reserved' });
    }
  }
  const stored = resolveBindings({ flat: { keyboard: { reveal: ['F2'] } }, '3d': { keyboard: { reveal: ['KeyR'] } } });
  assert.deepEqual(stored.flat.keyboard.reveal, ['Space', 'Enter'], 'a stored override on F2 falls back to the defaults');
  assert.deepEqual(stored['3d'].keyboard.reveal, ['Enter']);
  assert.equal(restartInput('F2', { screen: 'classic-2d' }), 'restart');
  assert.equal(restartInput('F2', { screen: 'paused' }), 'restart');
  assert.equal(restartInput('KeyR', { screen: 'results' }), 'playAgain');

  const w = cursorWiring(bindings);
  w.mounted.input.setCell(7);
  for (const code of ['F2', 'KeyR']) {
    assert.equal(w.down(code).defaultPrevented, false, `${code} is left to the shell`);
    w.up(code);
  }
  assert.deepEqual(w.asked, [], 'the board takes neither');
  const s = inputSetup(bindings);
  for (const code of ['F2', 'KeyR']) { s.down(code); s.up(code); }
  assert.deepEqual(s.actions, []);
  assert.deepEqual(s.keysSeen, ['F2', 'KeyR'], 'both reach the shell\'s key handler');
});

// ---------------------------------------------------------------- held through a binding change

test('an input held when its binding changes is dropped, not fired', async () => {
  const bindings = await bindingsOver();
  // the flat cursor: a held key and a held controller button
  const w = cursorWiring(bindings);
  w.mounted.input.setCell(7);
  w.down('Space');
  await bindings.bind('classic-2d', 'keyboard', 'reveal', 0, 'KeyU');
  w.up('Space');
  assert.deepEqual(w.asked, [], 'the held Space is dropped');
  w.mounted.pad(poll([BTN.A]), 0);
  await bindings.bind('classic-2d', 'controller', 'reveal', 0, BTN.RB);
  w.mounted.pad(poll([BTN.A]), 16);
  w.mounted.pad(poll([]), 32);
  assert.deepEqual(w.asked, [], 'the held A is dropped through its release');

  // the flat pointer: a held button
  const p = pointerWiring(bindings);
  p.down(BUTTON.LEFT, 7);
  await bindings.bind('classic-2d', 'mouse', 'reveal', 0, BUTTON.RIGHT);
  p.up(BUTTON.LEFT, 7);
  assert.deepEqual(p.asked, [], 'the held left button is dropped');

  // 3D: a held move key stays dropped through its auto-repeat
  const s = inputSetup(bindings);
  s.down('KeyW');
  assert.equal(s.input.move.w, true);
  await bindings.bind('3d', 'keyboard', 'forward', 0, 'KeyI');
  s.down('KeyW', true);
  assert.equal(s.input.move.w, false, 'dropped');
  await bindings.reset('3d', 'keyboard');
  s.down('KeyW', true);
  assert.equal(s.input.move.w, false, 'its repeats press nothing until it is released');
  s.up('KeyW');
  s.down('KeyW');
  assert.equal(s.input.move.w, true, 'pressed again, it flies');
});

// ---------------------------------------------------------------- in a browser

// A fixed board: every board seed the session draws is 12345.
function fixSeed() {
  const real = crypto.getRandomValues.bind(crypto);
  crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
}
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

const REBOUND = { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', reveal: 'KeyU' };

test('in a browser, a fixed Classic 2D board is won with rebound keys, and the flat modes\' rebound reveal key reveals on Hexagon', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  try {
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(fixSeed);
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await ms(async (keys) => {
      for (const [action, code] of Object.entries(keys)) {
        const r = await globalThis.__ms.bindings.bind('classic-2d', 'keyboard', action, 0, code);
        if (!r.ok) throw new Error(`${action}: ${r.reason}`);
      }
    }, REBOUND);
    const start = async (id, prefix) => {
      await page.click(`#menu-entry-${id}`);
      await page.waitForFunction((s) => globalThis.__ms.state.mode === s, `${id}-choice`);
      await ms((p) => { const s = document.getElementById(`${p}-noguess`); if (s.checked) s.click(); }, prefix);
      await page.click(`#${prefix}-choice [data-size="beginner"]`);
      await page.click(`#${prefix}-play`);
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    };
    const cursor = () => ms(() => globalThis.__ms.board2D.cursor);
    const state = (c) => ms((cell) => globalThis.__ms.game2D.cellState(cell), c);
    // the rebound move keys walk the cursor to `c` on the square board, and the rebound reveal key opens it
    const keyTo = async (c) => {
      if ((await cursor()) < 0) await page.keyboard.press(REBOUND.right);
      const from = await cursor();
      const [dx, dy] = [(c % 9) - (from % 9), Math.floor(c / 9) - Math.floor(from / 9)];
      for (let i = 0; i < Math.abs(dx); i++) await page.keyboard.press(dx < 0 ? REBOUND.left : REBOUND.right);
      for (let i = 0; i < Math.abs(dy); i++) await page.keyboard.press(dy < 0 ? REBOUND.up : REBOUND.down);
      assert.equal(await cursor(), c, `the cursor reached cell ${c}`);
      await page.keyboard.press(REBOUND.reveal);
    };

    // ---- Classic 2D, won by the rebound keys alone
    await start('classic-2d', 'c2d');
    await page.keyboard.press('ArrowRight');
    assert.equal(await cursor(), -1, 'the arrows move no cursor once rebound');
    const first = 40;
    await keyTo(first);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    assert.equal(await state(first), 'revealed', 'the rebound reveal key made the first reveal');
    const safe = await ms(() => {
      const g = globalThis.__ms.game2D;
      const mines = new Set(Array.from(g.snapshot().mines));
      return Array.from({ length: 81 }, (_, c) => c).filter((c) => !mines.has(c));
    });
    for (const c of safe) {
      if (await ms(() => globalThis.__ms.board2D.effect)) break;
      if ((await state(c)) === 'closed') await keyTo(c);
    }
    assert.equal(await ms(() => globalThis.__ms.board2D.effect?.kind), 'win', 'the board is won');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
    assert.equal(await ms(() => document.getElementById('results-title').textContent), 'You won!');

    // ---- Hexagon: Space no longer reveals, the flat modes' rebound key does
    await page.click('#r-menu');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu');
    await start('hexagon', 'hex');
    await page.keyboard.press(REBOUND.right);
    const at = await cursor();
    assert.ok(at >= 0, 'the rebound move key shows the cursor');
    await page.keyboard.press('Space');
    assert.equal(await state(at), 'closed', 'Space reveals nothing');
    await page.keyboard.press(REBOUND.reveal);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    assert.equal(await state(at), 'revealed', 'the rebound key reveals on a Hexagon board');
    assert.deepEqual(errors, []);
  } finally {
    await page.close();
  }
});
