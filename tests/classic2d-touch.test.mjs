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
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    // The Reveal / Flag switch shows in the overlay bar, with a 44 px hit area, on Reveal.
    const sw = await ms(() => {
      const el = document.getElementById('hud-tap');
      const r = el.getBoundingClientRect();
      return { shown: getComputedStyle(el).display !== 'none', w: r.width, h: r.height, pressed: el.getAttribute('aria-pressed'), text: el.textContent };
    });
    assert.ok(sw.shown, 'the switch shows on a coarse pointer');
    assert.ok(sw.w >= 44 && sw.h >= 44, `a 44 px hit area (${sw.w} × ${sw.h})`);
    assert.equal(sw.pressed, 'false', 'it starts on Reveal');

    const view = () => ms(() => {
      const v = globalThis.__ms.board2D;
      const b = v.canvas.getBoundingClientRect();
      return { left: b.left, top: b.top, scroll: v.scroll, tile: v.layout.tile, scrolls: v.layout.scrolls, viewX: v.layout.viewX, viewY: v.layout.viewY, viewWidth: v.layout.viewWidth, viewHeight: v.layout.viewHeight };
    });
    const v0 = await view();
    assert.ok(v0.scrolls, 'Expert scrolls on a phone');
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
    assert.equal(await ms(() => Number(document.getElementById('hud-clicks').textContent)), 1, 'one click counted');
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

    // The switch on Flag: a tap takes the flag back; back on Reveal.
    await page.tap('#hud-tap');
    assert.equal(await ms(() => document.getElementById('hud-tap').getAttribute('aria-pressed')), 'true');
    const becomes = (c, state) => page.waitForFunction(([cell, s]) => globalThis.__ms.game2D.cellState(cell) === s, [c, state], { timeout: patience(2000) });
    await f.tap(await centreOf(target));
    await becomes(target, 'closed');
    assert.equal(await cellState(target), 'closed', 'a tap in Flag toggles the flag');
    await f.tap(await centreOf(target));
    await becomes(target, 'flagged');
    assert.equal(await cellState(target), 'flagged');
    await page.tap('#hud-tap');
    assert.equal(await ms(() => document.getElementById('hud-tap').getAttribute('aria-pressed')), 'false');

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
    const clicks = await ms(() => Number(document.getElementById('hud-clicks').textContent));
    await ms(() => globalThis.__ms.board2D.scrollTo(0, 0));
    const p = [v0.left + v0.viewX + v0.viewWidth / 2, v0.top + v0.viewY + v0.viewHeight / 2];
    await f.drag(p, [-60, -30]);
    await page.waitForFunction(() => globalThis.__ms.board2D.scroll.x >= 50, null, { timeout: patience(2000) });
    const panned = await view();
    assert.ok(panned.scroll.x >= 50, `the board followed the finger (${JSON.stringify(panned.scroll)})`);
    assert.equal(await ms(() => Number(document.getElementById('hud-clicks').textContent)), clicks, 'a pan is no click');

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
    assert.equal(await ms(() => Number(document.getElementById('hud-clicks').textContent)), clicks, 'a zoom is no click');

    // Restart opens at the fit rule's tile again.
    await ms((tile) => globalThis.__ms.board2D.zoom(tile, 10, 10), range.min);
    await ms(() => globalThis.__ms.pauser.restart('key'));
    await page.waitForFunction((tile) => globalThis.__ms.board2D && globalThis.__ms.board2D.layout.tile === tile, v0.tile);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser with a mouse at 1280 × 800, the 2D overlay bar, the menu, Settings and the pause card keep their sizes and show no touch controls', async (t) => {
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

    // Settings: a switch stays 44 × 24, a slider 28 px tall with its 20 px thumb.
    await page.click('#menu-entry-settings');
    const sizes = await ms(() => {
      const shown = (sel) => [...document.querySelectorAll(`#settings ${sel}`)].map((e) => e.getBoundingClientRect()).find((r) => r.width > 0);
      const toggle = shown('.ui-toggle__input');
      const slider = shown('.ui-slider__input');
      return { toggle: [toggle.width, toggle.height], slider: slider.height };
    });
    assert.deepEqual(sizes, { toggle: [44, 24], slider: 28 });
    await page.keyboard.press('Escape');

    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="beginner"]');
    const bar = await ms(() => ({
      tap: getComputedStyle(document.getElementById('hud-tap')).display,
      label: getComputedStyle(document.querySelector('#hud .ui-stat__label')).fontSize,
      swap: getComputedStyle(document.getElementById('hud-swap')).display,
    }));
    assert.deepEqual(bar, { tap: 'none', label: '11px', swap: 'flex' }, 'no switch, the labels at 11 px, the swap toggle as before');

    await page.keyboard.press('Escape');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    const kbd = await ms(() => {
      const k = document.querySelector('#pause kbd');
      return k ? getComputedStyle(k).fontSize : null;
    });
    assert.ok(kbd, 'the pause card shows key caps');
    assert.ok(parseFloat(kbd) < 11, `the pause card's key caps keep their size on a fine pointer (${kbd})`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
