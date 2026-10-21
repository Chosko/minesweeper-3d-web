// Classic 2D touch input (js/classic2d/touch-input.js): the DOM-free touch state machine — the
// 400 ms long-press flag and its one vibration, the tap acting on its lift, the Reveal / Flag
// switch, the chord on a number whichever way the switch is set, the 8 px threshold, the one-finger
// pan on a board that scrolls, the two-finger pan and pinch, the second finger cancelling the first
// finger's tap, the pressed feedback — its browser wiring to the board view and the session, and in
// a browser with touch emulation an Expert game played by touch and the same pages with a mouse
// unchanged. Touch play in 3D is tests/shell-mode-3d.test.mjs's and tests/shell-pause.test.mjs's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createTouchInput, mountTouchInput, LONG_PRESS_MS, TAP_SLOP, VIBRATE_MS, TAP_MODES,
} from '../js/classic2d/touch-input.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const suite = browserSuite();

// ---------- harness ----------

function board(rows) {
  const width = rows[0].length;
  const height = rows.length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((line, row) => [...line].forEach((ch, col) => { if (ch === '*') mines.push(grid.index(col, row)); }));
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines, dimensions: { width, height } });
  return { grid, game };
}

function fakeClock() {
  let t = 0;
  let next = 1;
  const timers = new Map();
  return {
    setTimeout(fn, ms) { const h = next++; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout(h) { timers.delete(h); },
    advance(ms) {
      t += ms;
      for (const [h, timer] of [...timers]) if (timer.at <= t) { timers.delete(h); timer.fn(); }
    },
    get pending() { return timers.size; },
  };
}

// 5 × 4, a mine in the top-left corner: (1, 1) is a 1 with eight closed neighbours.
const CORNER = ['*....', '.....', '.....', '.....'];

function harness(rows = CORNER, { scrolls = false, flag = false, active = true } = {}) {
  const { grid, game } = board(rows);
  const clock = fakeClock();
  const presses = [];
  const actions = [];
  const pans = [];
  const pinches = [];
  let vibrations = 0;
  const state = { scrolls, flag, active };
  const input = createTouchInput({
    graph: grid.graph,
    game: () => game,
    clock,
    scrolls: () => state.scrolls,
    flagMode: () => state.flag,
    active: () => state.active,
    vibrate: () => { vibrations += 1; },
    onPress: (cells) => presses.push([...cells].sort((a, b) => a - b)),
    onAction: (kind, c) => { actions.push([kind, c]); game[kind](c); },
    onPan: (dx, dy) => pans.push([dx, dy]),
    onPinchStart: (mid) => pinches.push(['start', mid]),
    onPinch: (mid, ratio) => pinches.push(['pinch', mid, ratio]),
  });
  return {
    grid, game, clock, input, presses, actions, pans, pinches, state,
    get vibrations() { return vibrations; },
    get pressed() { return presses.length ? presses[presses.length - 1] : []; },
    at: (col, row) => grid.index(col, row),
  };
}

// ---------- constants ----------

test('the touch thresholds: a 400 ms long-press, an 8 px slop, a short vibration, two tap modes', () => {
  assert.equal(LONG_PRESS_MS, 400);
  assert.equal(TAP_SLOP, 8);
  assert.ok(VIBRATE_MS > 0 && VIBRATE_MS <= 50, 'a short vibration');
  assert.deepEqual([...TAP_MODES], ['reveal', 'flag']);
});

// ---------- long-press ----------

test('a touch held 400 ms without moving flags the cell under it while still held, with one vibration; the lift does nothing', () => {
  const h = harness();
  const c = h.at(3, 2);
  h.input.down(1, 35, 25, c);
  h.clock.advance(LONG_PRESS_MS - 1);
  assert.deepEqual(h.actions, [], 'nothing before 400 ms');
  h.clock.advance(1);
  assert.deepEqual(h.actions, [['toggleFlag', c]], 'the flag lands at 400 ms, the finger still down');
  assert.equal(h.game.cellState(c), CELL.FLAGGED);
  assert.equal(h.vibrations, 1);
  assert.deepEqual(h.pressed, [], 'the press feedback goes with the flag');
  h.input.up(1, 35, 25, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]], 'the lift after a long-press does nothing');
  assert.equal(h.vibrations, 1, 'one vibration');

  h.input.down(2, 35, 25, c);
  h.clock.advance(LONG_PRESS_MS);
  h.input.up(2, 35, 25, c);
  assert.equal(h.game.cellState(c), CELL.CLOSED, 'a second long-press takes the flag back');
});

test('the long-press flags whichever way the switch is set', () => {
  const h = harness(CORNER, { flag: true });
  const c = h.at(4, 3);
  h.input.down(1, 45, 35, c);
  h.clock.advance(LONG_PRESS_MS);
  h.input.up(1, 45, 35, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]]);
});

test('a long-press on a revealed cell does nothing, and neither does its lift', () => {
  const h = harness();
  const one = h.at(1, 1);
  h.game.reveal(one);
  h.input.down(1, 15, 15, one);
  h.clock.advance(LONG_PRESS_MS + 100);
  h.input.up(1, 15, 15, one);
  assert.deepEqual(h.actions, []);
  assert.equal(h.vibrations, 0);
});

// ---------- tap ----------

test('a tap reveals a closed cell on its lift, never on its touch', () => {
  const h = harness();
  const c = h.at(4, 3);
  h.input.down(1, 45, 35, c);
  assert.deepEqual(h.actions, [], 'nothing on the touch');
  h.clock.advance(LONG_PRESS_MS - 1);
  h.input.up(1, 45, 35, c);
  assert.deepEqual(h.actions, [['reveal', c]]);
  assert.equal(h.clock.pending, 0, 'the long-press timer is gone');
  assert.equal(h.vibrations, 0);
});

test('with the switch on Flag, a tap on a closed cell toggles its flag', () => {
  const h = harness(CORNER, { flag: true });
  const c = h.at(0, 0);
  h.input.down(1, 5, 5, c);
  h.input.up(1, 5, 5, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]]);
  h.input.down(1, 5, 5, c);
  h.input.up(1, 5, 5, c);
  assert.equal(h.game.cellState(c), CELL.CLOSED, 'a second tap takes it back');
  h.state.flag = false;
  h.input.down(1, 5, 5, c);
  h.input.up(1, 5, 5, c);
  assert.deepEqual(h.actions.at(-1), ['reveal', c], 'back on Reveal, a tap reveals');
});

test('a tap on a revealed number chords, whichever way the switch is set; a tap on a flag in Reveal does nothing', () => {
  for (const flag of [false, true]) {
    const h = harness(CORNER, { flag });
    const one = h.at(1, 1);
    h.game.reveal(one);
    h.game.toggleFlag(h.at(0, 0));
    h.input.down(1, 15, 15, one);
    h.input.up(1, 15, 15, one);
    assert.deepEqual(h.actions, [['chord', one]], `switch on ${flag ? 'Flag' : 'Reveal'}`);
    assert.equal(h.game.cellState(h.at(2, 2)), CELL.REVEALED, 'the chord opened the neighbours');
  }
  const h = harness();
  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(1, 5, 5, h.at(0, 0));
  h.input.up(1, 5, 5, h.at(0, 0));
  assert.deepEqual(h.actions, []);
});

test('a tap acts on the cell it touched, the lift landing within the slop', () => {
  const h = harness();
  const c = h.at(2, 2);
  h.input.down(1, 29, 25, c);
  h.input.move(1, 33, 28, h.at(3, 2));
  h.input.up(1, 33, 28, h.at(3, 2));
  assert.deepEqual(h.actions, [['reveal', c]]);
});

// ---------- the slop ----------

test('a move under 8 px stays a tap; a move of 8 px or more on a board that does not scroll acts on nothing', () => {
  const h = harness();
  const c = h.at(4, 3);
  h.input.down(1, 45, 35, c);
  h.input.move(1, 45 + 5, 35 + 5, c); // 7.07 px
  h.input.up(1, 45 + 5, 35 + 5, c);
  assert.deepEqual(h.actions, [['reveal', c]], 'under 8 px: a tap');

  const g = harness();
  g.input.down(1, 45, 35, c);
  g.input.move(1, 45 + 8, 35, c);
  assert.deepEqual(g.pressed, [], 'the press feedback goes');
  g.clock.advance(LONG_PRESS_MS);
  g.input.move(1, 45, 35, c);
  g.input.up(1, 45, 35, c);
  assert.deepEqual(g.actions, [], 'no long-press and no tap after the slop');
  assert.deepEqual(g.pans, [], 'nothing to pan');
  assert.equal(g.vibrations, 0);
});

// ---------- panning ----------

test('on a board that scrolls a one-finger drag of 8 px or more pans and acts on nothing', () => {
  const h = harness(CORNER, { scrolls: true });
  const c = h.at(2, 2);
  h.input.down(1, 100, 100, c);
  h.input.move(1, 104, 100, c);
  assert.deepEqual(h.pans, [], 'under 8 px it is still a tap');
  h.input.move(1, 110, 96, c);
  assert.deepEqual(h.pans, [[10, -4]], 'past the slop the board follows the finger from where it touched');
  h.input.move(1, 130, 90, c);
  assert.deepEqual(h.pans.at(-1), [20, -6]);
  h.clock.advance(LONG_PRESS_MS);
  h.input.up(1, 130, 90, c);
  assert.deepEqual(h.actions, []);
  assert.equal(h.vibrations, 0);
});

test('a second finger cancels the first finger\'s pending tap or long-press, and two fingers pan and pinch', () => {
  const h = harness();
  const c = h.at(2, 2);
  h.input.down(1, 100, 100, c);
  assert.deepEqual(h.pressed, [c]);
  h.input.down(2, 200, 100, h.at(3, 3));
  assert.deepEqual(h.pressed, [], 'the second finger drops the press');
  assert.deepEqual(h.pinches, [['start', { x: 150, y: 100 }]]);
  h.clock.advance(LONG_PRESS_MS);
  assert.deepEqual(h.actions, [], 'no long-press');
  h.input.move(2, 300, 100, -1);
  assert.deepEqual(h.pinches.at(-1), ['pinch', { x: 200, y: 100 }, 2], 'the fingers twice as far apart, the midpoint moved');
  h.input.move(1, 120, 140, -1);
  h.input.move(2, 320, 140, -1);
  assert.deepEqual(h.pinches.at(-1), ['pinch', { x: 220, y: 140 }, 2], 'a two-finger drag moves the midpoint at the same spread');
  h.input.up(2, 320, 140, -1);
  h.input.move(1, 160, 160, -1);
  h.input.up(1, 160, 160, c);
  assert.deepEqual(h.actions, [], 'lifting after two fingers acts on nothing');
  assert.deepEqual(h.pans, [], 'and the finger left over pans nothing');

  h.input.down(3, 45, 35, h.at(4, 3));
  h.input.up(3, 45, 35, h.at(4, 3));
  assert.deepEqual(h.actions, [['reveal', h.at(4, 3)]], 'the next touch is a fresh tap');
});

test('a cancelled touch acts on nothing; reset drops every finger', () => {
  const h = harness();
  const c = h.at(4, 3);
  h.input.down(1, 45, 35, c);
  h.input.cancel(1);
  h.clock.advance(LONG_PRESS_MS);
  assert.deepEqual([h.actions, h.pressed, h.input.holding], [[], [], false]);
  h.input.down(2, 45, 35, c);
  h.input.reset();
  h.clock.advance(LONG_PRESS_MS);
  h.input.up(2, 45, 35, c);
  assert.deepEqual(h.actions, []);
});

// ---------- feedback and the gate ----------

test('while the finger is down a closed cell, or a number\'s closed neighbours, show pressed, as the mouse shows them', () => {
  const h = harness();
  const c = h.at(3, 2);
  h.input.down(1, 35, 25, c);
  assert.deepEqual(h.pressed, [c]);
  h.input.up(1, 35, 25, c);
  assert.deepEqual(h.pressed, []);

  const n = harness(['*....', '.....', '..*..', '.....']);
  const one = n.at(1, 0);
  n.game.reveal(n.at(4, 3)); // opens the bottom-right part
  n.game.reveal(one);
  n.game.toggleFlag(n.at(0, 0));
  n.input.down(1, 15, 5, one);
  const closed = [];
  for (const nb of [n.at(0, 1), n.at(1, 1), n.at(2, 1), n.at(2, 0)]) if (n.game.cellState(nb) === CELL.CLOSED) closed.push(nb);
  assert.deepEqual(n.pressed, closed.sort((a, b) => a - b), 'the number\'s closed, unflagged neighbours');
  n.input.up(1, 15, 5, one);
  assert.deepEqual(n.pressed, []);
});

test('with the switch on Flag a closed cell shows no reveal press', () => {
  const h = harness(CORNER, { flag: true });
  h.input.down(1, 35, 25, h.at(3, 2));
  assert.deepEqual(h.presses, []);
});

test('no touch is taken while the board takes no input, and one begun then is ignored through its lift', () => {
  const h = harness(CORNER, { active: false });
  const c = h.at(4, 3);
  h.input.down(1, 45, 35, c);
  h.state.active = true;
  h.clock.advance(LONG_PRESS_MS);
  h.input.up(1, 45, 35, c);
  assert.deepEqual([h.actions, h.presses, h.pans, h.pinches], [[], [], [], []]);
});

// ---------- the browser wiring ----------

function touchEvent(type, props) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { pointerType: 'touch', pointerId: 1, clientX: 0, clientY: 0, button: 0, isPrimary: true, ...props });
}

// A view and a session standing in for the real ones: cells are 10 px squares from the canvas
// origin at (100, 50); the session records what it is asked.
function wiring({ scrolls = false, flag = false } = {}) {
  const { grid, game } = board(CORNER);
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 50, height: 40 });
  const win = new EventTarget();
  const vibrations = [];
  win.navigator = { vibrate: (ms) => { vibrations.push(ms); return true; } };
  const pressedCalls = [];
  const pans = [];
  const zooms = [];
  const view = {
    canvas,
    layout: { scrolls, tile: 10 },
    cellAt: (x, y) => (x >= 0 && y >= 0 && x < 50 && y < 40 ? Math.floor(x / 10) + 5 * Math.floor(y / 10) : -1),
    setPressed: (cells) => pressedCalls.push([...cells]),
    pan: (dx, dy) => { pans.push([dx, dy]); return true; },
    boardPoint: (x, y) => ({ u: x / 10, v: y / 10 }),
    zoom: (tile, x, y, point) => { zooms.push({ tile, x, y, point }); return true; },
  };
  const asked = [];
  const session = {
    state: 'playing',
    paused: false,
    game,
    reveal: (c) => { asked.push(['reveal', c]); return game.reveal(c); },
    toggleFlag: (c) => { asked.push(['toggleFlag', c]); return game.toggleFlag(c); },
    chord: (c) => { asked.push(['chord', c]); return game.chord(c); },
  };
  const clock = fakeClock();
  let scrolledByUser = 0;
  const mounted = mountTouchInput({ view, session, graph: grid.graph, win, clock, flagMode: () => flag, onUserScroll: () => { scrolledByUser += 1; } });
  const xy = (col, row) => ({ clientX: 100 + col * 10 + 5, clientY: 50 + row * 10 + 5 });
  return { grid, game, canvas, win, view, session, asked, pressedCalls, pans, zooms, vibrations, clock, mounted, xy, get scrolledByUser() { return scrolledByUser; } };
}

test('mounted: touch pointers on the canvas tap and long-press, with the press shown and the vibration asked of the page', () => {
  const w = wiring();
  const down = touchEvent('pointerdown', w.xy(4, 3));
  w.canvas.dispatchEvent(down);
  assert.ok(down.defaultPrevented, 'the touch is the game\'s: no emulated mouse events follow it');
  assert.deepEqual(w.pressedCalls.at(-1), [w.grid.index(4, 3)]);
  w.canvas.dispatchEvent(touchEvent('pointerup', w.xy(4, 3)));
  assert.deepEqual(w.asked, [['reveal', w.grid.index(4, 3)]]);

  w.canvas.dispatchEvent(touchEvent('pointerdown', { pointerId: 2, ...w.xy(0, 0) }));
  w.clock.advance(LONG_PRESS_MS);
  assert.deepEqual(w.asked.at(-1), ['toggleFlag', 0]);
  assert.deepEqual(w.vibrations, [VIBRATE_MS]);
  w.canvas.dispatchEvent(touchEvent('pointerup', { pointerId: 2, ...w.xy(0, 0) }));
  assert.equal(w.asked.length, 2);
});

test('mounted: a mouse or pen pointer is left to the mouse input', () => {
  const w = wiring();
  const down = touchEvent('pointerdown', { pointerType: 'mouse', ...w.xy(2, 2) });
  w.canvas.dispatchEvent(down);
  w.canvas.dispatchEvent(touchEvent('pointerup', { pointerType: 'mouse', ...w.xy(2, 2) }));
  assert.equal(down.defaultPrevented, false);
  assert.deepEqual([w.asked, w.pressedCalls], [[], []]);
});

test('mounted: the touch events themselves are cancelled, so a tap never reaches the mouse input', () => {
  const w = wiring();
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    const e = new Event(type, { cancelable: true });
    w.canvas.dispatchEvent(e);
    assert.ok(e.defaultPrevented, type);
  }
});

test('mounted: a drag pans a scrolling board and is reported as the player\'s scroll; a pinch zooms about its midpoint', () => {
  const w = wiring({ scrolls: true });
  w.canvas.dispatchEvent(touchEvent('pointerdown', { clientX: 120, clientY: 70 }));
  w.canvas.dispatchEvent(touchEvent('pointermove', { clientX: 140, clientY: 70 }));
  assert.deepEqual(w.pans, [[20, 0]]);
  assert.equal(w.scrolledByUser, 1);
  w.canvas.dispatchEvent(touchEvent('pointerup', { clientX: 140, clientY: 70 }));
  assert.deepEqual(w.asked, []);

  w.canvas.dispatchEvent(touchEvent('pointerdown', { pointerId: 5, clientX: 110, clientY: 60 }));
  w.canvas.dispatchEvent(touchEvent('pointerdown', { pointerId: 6, clientX: 130, clientY: 60 }));
  w.canvas.dispatchEvent(touchEvent('pointermove', { pointerId: 6, clientX: 150, clientY: 60 }));
  const z = w.zooms.at(-1);
  assert.equal(z.tile, 20, 'twice the spread, twice the tile the pinch began at');
  assert.deepEqual([z.x, z.y], [30, 10], 'about the midpoint, in canvas pixels');
  assert.deepEqual(z.point, { u: 2, v: 1 }, 'keeping the board point the pinch began over');
  w.canvas.dispatchEvent(touchEvent('pointerup', { pointerId: 6, clientX: 150, clientY: 60 }));
  w.canvas.dispatchEvent(touchEvent('pointerup', { pointerId: 5, clientX: 110, clientY: 60 }));
  assert.deepEqual(w.asked, []);
});

test('mounted: the Flag switch reaches the tap; destroy removes every listener', () => {
  const w = wiring({ flag: true });
  w.canvas.dispatchEvent(touchEvent('pointerdown', w.xy(3, 3)));
  w.canvas.dispatchEvent(touchEvent('pointerup', w.xy(3, 3)));
  assert.deepEqual(w.asked, [['toggleFlag', w.grid.index(3, 3)]]);
  w.mounted.destroy();
  w.canvas.dispatchEvent(touchEvent('pointerdown', w.xy(2, 2)));
  w.canvas.dispatchEvent(touchEvent('pointerup', w.xy(2, 2)));
  const e = new Event('touchend', { cancelable: true });
  w.canvas.dispatchEvent(e);
  assert.deepEqual([w.asked.length, e.defaultPrevented], [1, false]);
});

test('the module is DOM-free at import and leaves the mouse input\'s rules alone', () => {
  const src = readFileSync(join(ROOT, 'js', 'classic2d', 'touch-input.js'), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|HTMLElement|requestAnimationFrame)\b/);
  assert.doesNotMatch(src, /three|\.\.\/input\.js/);
  assert.doesNotMatch(read('js/classic2d/pointer-input.js'), /touch/i, 'the mouse state machine knows nothing of touch');
});

const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// Touches through the DevTools protocol, so a finger can be held and two can move at once. A tap
// and a one-finger drag are gestures the browser synthesizes itself, touch to lift: sent as separate
// touch events, the time between them is the test's round trip, which on a loaded machine passes
// the 400 ms long-press and turns a tap or a drag into a flag.
function fingers(cdp) {
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  return {
    start: (points) => send('touchStart', points),
    move: (points) => send('touchMove', points),
    end: () => send('touchEnd', []),
    tap: ([x, y]) => cdp.send('Input.synthesizeTapGesture', { x, y, duration: 50, tapCount: 1, gestureSourceType: 'touch' }),
    drag: ([x, y], [dx, dy]) => cdp.send('Input.synthesizeScrollGesture', { x, y, xDistance: dx, yDistance: dy, speed: 2000, gestureSourceType: 'touch', preventFling: true }),
  };
}

test('in a browser with touch on a phone, Expert is played by touch: long-press and the switch flag, a tap chords, a drag pans and a pinch zooms', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const context = await browser.newContext(PHONE);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.addInitScript(() => {
      globalThis.__vibrations = [];
      navigator.vibrate = (ms) => { globalThis.__vibrations.push(ms); return true; };
      globalThis.__mouse = [];
      for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, (e) => globalThis.__mouse.push(type), true);
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const cdp = await context.newCDPSession(page);
    const f = fingers(cdp);

    // The menu's note: both modes play by touch.
    const note = await ms(() => ({ shown: !document.getElementById('touch-note').classList.contains('hidden'), text: document.getElementById('touch-note').textContent }));
    assert.ok(note.shown, 'the note shows on a coarse-only device');
    assert.match(note.text, /Both modes play by touch/);
    assert.doesNotMatch(note.text, /needs a mouse|desktop browser/);

    await page.tap('#menu-entry-classic-2d');
    await page.locator('#c2d-noguess').setChecked(false);
    await page.tap('#c2d-choice [data-size="expert"]');
    await page.tap('#c2d-play');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    // The Tap choice shows under the board, 48 px tall, a two-option radiogroup on Reveal.
    const sw = await ms(() => {
      const el = document.getElementById('hud-tap');
      const r = el.getBoundingClientRect();
      const options = [...el.querySelectorAll('[role="radio"]')];
      return {
        shown: getComputedStyle(el).display !== 'none', w: r.width, h: r.height, role: el.getAttribute('role'),
        options: options.map((o) => [o.textContent, o.dataset.value, o.getAttribute('aria-checked')]),
        fills: options.map((o) => getComputedStyle(o).backgroundColor), track: getComputedStyle(el).backgroundColor,
      };
    });
    assert.ok(sw.shown, 'the choice shows on a coarse pointer');
    assert.ok(sw.w >= 44 && sw.h === 48, `48 px tall (${sw.w} × ${sw.h})`);
    assert.equal(sw.role, 'radiogroup');
    assert.deepEqual(sw.options, [['Tap: Reveal', 'reveal', 'true'], ['Tap: Flag', 'flag', 'false']], 'it starts on Reveal');
    assert.notEqual(sw.fills[0], 'rgba(0, 0, 0, 0)', 'the chosen option ink-filled');
    assert.deepEqual([sw.fills[1], sw.track], ['rgba(0, 0, 0, 0)', 'rgb(251, 241, 223)'], 'the other transparent on the sunk track');

    const view = () => ms(() => {
      const v = globalThis.__ms.board2D;
      const b = v.canvas.getBoundingClientRect();
      return { left: b.left, top: b.top, scroll: v.scroll, tile: v.layout.tile, scrolls: v.layout.scrolls, viewX: v.layout.viewX, viewY: v.layout.viewY, viewWidth: v.layout.viewWidth, viewHeight: v.layout.viewHeight };
    });
    const v0 = await view();
    assert.ok(v0.scrolls, 'Expert scrolls on a phone');
    // The clipped board's one-time hint names the touch gestures, not the wheel.
    await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'), null, { timeout: patience(2000) });
    assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), 'Drag to pan · pinch to zoom');
    const centreOf = async (c) => {
      const v = await view();
      const r = await ms((cell) => globalThis.__ms.board2D.cellRect(cell), c);
      return [v.left + r.x + r.size / 2, v.top + r.y + r.size / 2];
    };
    const cellState = (c) => ms((cell) => globalThis.__ms.game2D.cellState(cell), c);

    // The first tap reveals and starts the game; it acts exactly once (no emulated mouse press).
    const first = 2 * 30 + 2;
    await ms(() => { globalThis.__mouse = []; });
    await f.tap(await centreOf(first));
    await page.waitForFunction(() => globalThis.__ms.modes.state.started, null, { timeout: patience(5000) });
    assert.equal(await cellState(first), 'revealed');
    assert.equal(await ms(() => Number(document.getElementById('c2d-clicks').textContent)), 1, 'one click counted');
    assert.deepEqual(await ms(() => globalThis.__mouse), [], 'the tap reached no mouse listener');

    // A closed mine to flag, found on the page: a mine, so that a number beside it still chords below
    // once its other mines are flagged — a flag on a safe cell beside it would block that chord.
    const closedCell = () => ms(() => {
      const g = globalThis.__ms.game2D;
      const v = globalThis.__ms.board2D;
      const mines = new Set(Array.from(g.snapshot().mines));
      for (let c = 0; c < 30 * 16; c++) {
        if (g.cellState(c) !== 'closed' || !mines.has(c)) continue;
        const r = v.cellRect(c);
        if (r.x >= v.layout.viewX && r.y >= v.layout.viewY && r.x + r.size <= v.layout.viewX + v.layout.viewWidth && r.y + r.size <= v.layout.viewY + v.layout.viewHeight) return c;
      }
      return -1;
    });
    const target = await closedCell();
    assert.ok(target >= 0);
    // Long-press: the flag lands while the finger is still down, with one vibration.
    await f.start([await centreOf(target)]);
    await page.waitForFunction((c) => globalThis.__ms.game2D.cellState(c) === 'flagged', target, { timeout: patience(2000) });
    await f.end();
    assert.equal(await cellState(target), 'flagged');
    assert.equal((await ms(() => globalThis.__vibrations)).length, 1);

    // The choice on Flag: a tap takes the flag back; back on Reveal. Touch input reads the radiogroup's value.
    const tapValue = () => ms(() => document.querySelector('#hud-tap [aria-checked="true"]').dataset.value);
    await page.tap('#hud-tap [data-value="flag"]');
    assert.equal(await tapValue(), 'flag');
    assert.equal(await ms(() => !document.activeElement?.closest('#hud-tap')), true, 'the choice takes no focus');
    const becomes = (c, state) => page.waitForFunction(([cell, s]) => globalThis.__ms.game2D.cellState(cell) === s, [c, state], { timeout: patience(2000) });
    await f.tap(await centreOf(target));
    await becomes(target, 'closed');
    assert.equal(await cellState(target), 'closed', 'a tap in Flag toggles the flag');
    await f.tap(await centreOf(target));
    await becomes(target, 'flagged');
    assert.equal(await cellState(target), 'flagged');
    await page.tap('#hud-tap [data-value="reveal"]');
    assert.equal(await tapValue(), 'reveal');

    // A tap on a satisfied number chords: flag a number's mines through the debug board, then tap it.
    const chordable = await ms(() => {
      const g = globalThis.__ms.game2D;
      const v = globalThis.__ms.board2D;
      const mines = new Set(Array.from(globalThis.__ms.game2D.snapshot().mines));
      for (let c = 0; c < 30 * 16; c++) {
        if (g.cellState(c) !== 'revealed' || g.cellNumber(c) === 0) continue;
        const col = c % 30; const row = Math.floor(c / 30);
        const nbs = [];
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const x = col + dx; const y = row + dy;
          if (x >= 0 && y >= 0 && x < 30 && y < 16) nbs.push(x + 30 * y);
        }
        const closedSafe = nbs.filter((n) => g.cellState(n) === 'closed' && !mines.has(n));
        const r = v.cellRect(c);
        const inView = r.x >= v.layout.viewX && r.y >= v.layout.viewY && r.x + r.size <= v.layout.viewX + v.layout.viewWidth && r.y + r.size <= v.layout.viewY + v.layout.viewHeight;
        if (closedSafe.length && inView) return { c, mines: nbs.filter((n) => mines.has(n) && g.cellState(n) !== 'flagged'), safe: closedSafe };
      }
      return null;
    });
    assert.ok(chordable, 'a number with a closed safe neighbour in view');
    {
      for (const m of chordable.mines) {
        await ms((c) => globalThis.__ms.board2D.ensureVisible(c), m);
        await f.start([await centreOf(m)]);
        await page.waitForFunction((c) => globalThis.__ms.game2D.cellState(c) === 'flagged', m, { timeout: patience(2000) });
        await f.end();
      }
      await ms((c) => globalThis.__ms.board2D.ensureVisible(c), chordable.c);
      await f.tap(await centreOf(chordable.c));
      await becomes(chordable.safe[0], 'revealed');
      assert.equal(await cellState(chordable.safe[0]), 'revealed', 'the tap on the number chorded');
    }

    // A one-finger drag pans the board and acts on nothing.
    const clicks = await ms(() => Number(document.getElementById('c2d-clicks').textContent));
    await ms(() => globalThis.__ms.board2D.scrollTo(0, 0));
    const p = [v0.left + v0.viewX + v0.viewWidth / 2, v0.top + v0.viewY + v0.viewHeight / 2];
    await f.drag(p, [-60, -30]);
    await page.waitForFunction(() => globalThis.__ms.board2D.scroll.x >= 50, null, { timeout: patience(2000) });
    const panned = await view();
    assert.ok(panned.scroll.x >= 50, `the board followed the finger (${JSON.stringify(panned.scroll)})`);
    // The pan retired the scroll hint, as a wheel scroll does: the mode's strip, which shows from the
    // game's start on a coarse-only device, takes its place.
    await page.waitForFunction(() => document.getElementById('hint-strip-text').textContent === 'Tap reveal · Long-press flag · Tap a number to chord', null, { timeout: patience(2000) });
    assert.equal(await ms(() => Number(document.getElementById('c2d-clicks').textContent)), clicks, 'a pan is no click');

    // A pinch zooms out to the whole board and back to the minimum tile; a pan or zoom records nothing.
    const range = await ms(() => globalThis.__ms.board2D.zoomRange);
    await f.start([[p[0] - 100, p[1]], [p[0] + 100, p[1]]]);
    await f.move([[p[0] - 50, p[1]], [p[0] + 50, p[1]]]);
    await f.move([[p[0] - 10, p[1]], [p[0] + 10, p[1]]]);
    await f.end();
    const out = await view();
    assert.equal(out.tile, range.min, 'pinched in: the smallest tile of the range');
    assert.equal(out.scrolls, false, 'the whole board shows');
    await f.start([[p[0] - 10, p[1]], [p[0] + 10, p[1]]]);
    await f.move([[p[0] - 150, p[1]], [p[0] + 150, p[1]]]);
    await f.end();
    assert.equal((await view()).tile, range.max, 'spread: back to the largest tile of the range');
    assert.equal(await ms(() => Number(document.getElementById('c2d-clicks').textContent)), clicks, 'a zoom is no click');

    // Restart opens at the fit rule's tile again.
    await ms((tile) => globalThis.__ms.board2D.zoom(tile, 10, 10), range.min);
    await ms(() => globalThis.__ms.pauser.restart('key'));
    await page.waitForFunction((tile) => globalThis.__ms.board2D && globalThis.__ms.board2D.layout.tile === tile, v0.tile);

    // On the coarse-only device the restarted game shows the mode's strip before any input, in touch
    // wording, and a key keeps it; the HUD strip, with nothing a finger can press, hides.
    await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'), null, { timeout: patience(2000) });
    assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), 'Tap reveal · Long-press flag · Tap a number to chord', 'the strip shows before the key');
    await page.keyboard.press('KeyQ');
    assert.equal(await ms(() => document.getElementById('hint-strip').classList.contains('hidden')), false, 'the key keeps the strip');
    const strip = await ms(() => document.getElementById('hint-strip-text').innerHTML);
    assert.doesNotMatch(strip, /<kbd/, 'no key cap in the strip');
    const tools = await ms(() => { const el = document.getElementById('hud-tools'); return { html: el.innerHTML, hidden: el.classList.contains('hidden') }; });
    assert.equal(strip, 'Tap reveal · Long-press flag · Tap a number to chord');
    assert.deepEqual(tools, { html: '', hidden: true }, 'no key in the HUD strip, and no empty box');

    // The pause card lists Classic 2D's touch rows, not the mouse and keyboard ones.
    await page.tap('#c2d-pause');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: patience(2000) });
    const pauseRows = await ms(() => document.getElementById('pause-controls').textContent);
    assert.match(pauseRows, /Long-press/, 'the pause card shows the touch rows');
    assert.match(pauseRows, /Tap a number/);
    assert.match(pauseRows, /PinchZoom/);
    assert.doesNotMatch(pauseRows, /Move the cursor|Right click|Wheel/, 'and no mouse or keyboard row');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// Every visible control and readout of the Classic 2D window, its counter strip and the board's panel.
function barGeometry() {
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
  const children = ['c2d-time', 'c2d-mines-left', 'c2d-clicks', 'c2d-size', 'c2d-restart', 'hud-tap', 'c2d-pause', 'hud-swap'].map((id) => document.getElementById(id))
    .filter((el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0 && !el.closest('.hidden, [style*="display: none"]') && el.checkVisibility())
    .map((el) => ({ id: el.id, ...box(el) }));
  const swap = document.getElementById('hud-swap');
  return {
    viewport: { width: innerWidth, height: innerHeight },
    bar: box(document.getElementById('c2d-counters')),
    panel: box(document.getElementById('c2d-panel')),
    children,
    swapShown: getComputedStyle(swap).display !== 'none' && swap.getBoundingClientRect().width > 0,
  };
}

// Waits until the bar, the panel and the board's view stay put across two frames: the board's
// container is sized, and the panel placed, a frame or two after the board opens.
async function settled(page) {
  await page.waitForFunction(() => {
    const v = globalThis.__ms.board2D;
    if (!v?.layout) return false;
    const now = JSON.stringify([document.getElementById('c2d-counters').getBoundingClientRect(), document.getElementById('c2d-panel').getBoundingClientRect(), v.canvas.getBoundingClientRect(), v.layout.viewY]);
    const same = globalThis.__lastGeometry === now;
    globalThis.__lastGeometry = now;
    return same;
  }, null, { polling: 'raf', timeout: patience(5000) });
}

// The narrowest supported phone: a board that fits it fits every wider one.
const PHONES = [
  { name: '360 × 740', viewport: { width: 360, height: 740 } },
];
const BOARDS_2D = ['beginner', 'intermediate', 'expert', 'custom'];

test('in a browser with touch on a phone, the Classic 2D window fits the screen on every board: Pause and the switch take a tap, no Swap clicks', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const phone of PHONES) {
      const context = await browser.newContext({ ...PHONE, viewport: phone.viewport });
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(removeWebGL2);
      const ms = (fn, arg) => page.evaluate(fn, arg);
      for (const size of BOARDS_2D) {
        const where = `${phone.name}, ${size}`;
        await page.goto(`${base}/index.html`);
        await page.waitForFunction(() => globalThis.__ms !== undefined);
        await page.tap('#menu-entry-classic-2d');
        await page.locator('#c2d-noguess').setChecked(true);
        await page.tap(`#c2d-choice [data-size="${size}"]`);
        if (size === 'custom') {
          await page.fill('#c2d-width', '100');
          await page.fill('#c2d-height', '100');
          await page.fill('#c2d-mines', '2000');
        }
        await page.tap('#c2d-play');
        await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
        await settled(page);
        const g = await ms(barGeometry);
        const ids = g.children.map((c) => c.id);
        for (const id of ['c2d-time', 'c2d-mines-left', 'c2d-size', 'c2d-restart', 'hud-tap', 'c2d-pause']) {
          assert.ok(ids.includes(id), `${where}: ${id} shows in the window (${ids})`);
        }
        for (const c of g.children) {
          assert.ok(c.left >= 0 && c.top >= 0 && c.right <= g.viewport.width && c.bottom <= g.viewport.height,
            `${where}: ${c.id} lies inside the viewport (${JSON.stringify(c)})`);
        }
        assert.equal(g.swapShown, false, `${where}: no Swap clicks on a coarse-only device`);
        const tap = g.children.find((c) => c.id === 'hud-tap');
        assert.ok(tap.width >= 44 && tap.height === 48, `${where}: the Tap choice 48 px tall (${tap.width} × ${tap.height})`);
        // The touch hint strip, shown from the game's start, stays clear of the Tap choice.
        const hint = await ms(() => { const el = document.getElementById('hint-strip'); return el.classList.contains('hidden') ? null : el.getBoundingClientRect().toJSON(); });
        if (hint) assert.ok(hint.bottom <= tap.top || hint.top >= tap.bottom || hint.right <= tap.left || hint.left >= tap.right, `${where}: the hint strip clear of the Tap choice (${JSON.stringify(hint)})`);
        const view = await ms(() => globalThis.__ms.board2D.canvas.getBoundingClientRect().top + globalThis.__ms.board2D.layout.viewY);
        assert.ok(view >= g.bar.bottom, `${where}: the board starts below the counter strip, not under it (${view} vs ${g.bar.bottom})`);
      }

      // The phone turns mid-game: a board opened in landscape, where the counter strip stands beside
      // the board, is laid out again below the strip in portrait.
      await page.setViewportSize({ width: phone.viewport.height, height: phone.viewport.width });
      await page.goto(`${base}/index.html`);
      await page.waitForFunction(() => globalThis.__ms !== undefined);
      await page.tap('#menu-entry-classic-2d');
      await page.tap('#c2d-choice [data-size="expert"]');
      await page.tap('#c2d-play');
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
      await settled(page);
      await page.setViewportSize(phone.viewport);
      await settled(page);
      {
        const g = await ms(barGeometry);
        const view = await ms(() => globalThis.__ms.board2D.canvas.getBoundingClientRect().top + globalThis.__ms.board2D.layout.viewY);
        assert.ok(view >= g.bar.bottom, `${phone.name}, turned: the board starts below the counter strip (${view} vs ${g.bar.bottom})`);
      }

      // On the last board: a real tap flips the switch, and a real tap on Pause opens the pause card.
      const checked = () => ms(() => document.querySelector('#hud-tap [aria-checked="true"]').textContent);
      await page.tap('#hud-tap [data-value="flag"]');
      assert.equal(await checked(), 'Tap: Flag', `${phone.name}: the choice takes a tap`);
      await page.tap('#hud-tap [data-value="reveal"]');
      assert.equal(await checked(), 'Tap: Reveal');
      await page.tap('#c2d-pause');
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: patience(2000) });
      assert.equal(await ms(() => document.getElementById('pause').classList.contains('hidden')), false, `${phone.name}: Pause opens the pause card`);
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test('in a browser with a mouse at 1280 × 800, the Classic 2D window, the menu, Settings and the pause card keep their sizes and show no touch controls', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    assert.equal(await ms(() => document.getElementById('touch-note').classList.contains('hidden')), true, 'no touch note with a mouse');

    // Settings: a switch stays 60 × 34, a slider 28 px tall with its 26 px thumb.
    await page.click('#menu-entry-settings');
    const sizes = await ms(() => {
      const shown = (sel) => [...document.querySelectorAll(`#settings ${sel}`)].map((e) => e.getBoundingClientRect()).find((r) => r.width > 0);
      const toggle = shown('.ui-toggle__input');
      const slider = shown('.ui-slider__input');
      return { toggle: [toggle.width, toggle.height], slider: slider.height };
    });
    assert.deepEqual(sizes, { toggle: [60, 34], slider: 28 });
    await page.keyboard.press('Escape');

    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="beginner"]');
    await page.click('#c2d-play');
    await settled(page);
    const bar = await ms(() => ({
      tap: getComputedStyle(document.getElementById('hud-tap')).display,
      label: getComputedStyle(document.querySelector('#c2d-figures .ui-figure__label')).fontSize,
    }));
    assert.deepEqual(bar, { tap: 'none', label: '13px' }, 'no switch, the figures\' labels at their size');
    const g = await ms(barGeometry);
    assert.equal(g.swapShown, true, 'Swap clicks shows with a mouse');
    const strip = g.children.filter((c) => ['c2d-time', 'c2d-mines-left', 'c2d-restart'].includes(c.id));
    assert.ok(strip.every((c) => c.top >= g.bar.top && c.bottom <= g.bar.bottom), `the counter strip keeps one row (${JSON.stringify(strip)})`);
    const viewTop = await ms(() => globalThis.__ms.board2D.canvas.getBoundingClientRect().top + globalThis.__ms.board2D.layout.viewY);
    assert.ok(viewTop >= g.bar.bottom, 'the board below the counter strip');

    // The clicks that chose the board brought no strip; a key brings the mode's strip in the
    // keyboard's words; the HUD strip reads as before.
    assert.equal(await ms(() => document.getElementById('hint-strip').classList.contains('hidden')), true, 'no strip before a key on a fine pointer');
    await page.keyboard.press('KeyQ');
    await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'), null, { timeout: patience(2000) });
    const help = await ms(() => ({ strip: document.getElementById('hint-strip-text').textContent, tools: document.getElementById('hud-tools').textContent }));
    assert.equal(help.strip, 'Arrows move Space reveal F flag D chord');
    assert.equal(help.tools, 'H helpM sound onEsc menu');

    await page.keyboard.press('Escape');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    const kbd = await ms(() => {
      const k = document.querySelector('#pause kbd');
      return k ? getComputedStyle(k).fontSize : null;
    });
    assert.ok(kbd, 'the pause card shows key caps');
    assert.ok(parseFloat(kbd) >= 11, `the pause card's key caps at 11 px or more on a fine pointer too (${kbd})`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
