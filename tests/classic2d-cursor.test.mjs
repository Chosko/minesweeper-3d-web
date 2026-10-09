// Classic 2D cursor input (js/classic2d/cursor-input.js): the cell cursor moved by arrow keys,
// d-pad and left stick with auto-repeat, reveal / flag / chord on keys and controller buttons with
// the same pressed feedback and release rules as the mouse, the focus ring the board view
// (js/classic2d/board-view.js) draws over the cursor cell, the browser wiring to the view and the
// session, and in a browser a Beginner game played by keyboard to a win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  CURSOR_KEYS, PAD_MAP, STICK_THRESHOLD, createCursorInput, mountCursorInput,
} from '../js/classic2d/cursor-input.js';
import { createBoardView, CURSOR_RING } from '../js/classic2d/board-view.js';
import { BTN, NUM_BUTTONS } from '../js/gamepad.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

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

// 5 × 4, a mine in the top-left corner: (1, 1) is a 1 with eight closed neighbours.
const CORNER = ['*....', '.....', '.....', '.....'];

function harness(rows = CORNER, options = {}) {
  const { grid, game } = board(rows);
  const presses = [];
  const actions = [];
  const moves = [];
  const input = createCursorInput({
    grid,
    game: () => game,
    onPress: (cells) => presses.push([...cells].sort((a, b) => a - b)),
    onAction: (kind, c) => { actions.push([kind, c]); game[kind](c); },
    onCursor: (c) => moves.push(c),
    ...options,
  });
  return {
    grid, game, input, presses, actions, moves,
    at: (col, row) => grid.index(col, row),
    go(col, row) { input.setCell(grid.index(col, row)); },
    get pressed() { return presses.length ? presses[presses.length - 1] : []; },
  };
}

// A poll result as js/gamepad.js's GamepadReader returns it, with the buttons named held.
function poll(held = [], ls = [0, 0]) {
  const h = new Array(NUM_BUTTONS).fill(false);
  for (const b of held) h[b] = true;
  return { held: h, ls };
}

// ---------- the cursor ----------

test('the cursor starts on the top-left cell and moves one cell per step, clamped to the board', () => {
  const h = harness();
  assert.equal(h.input.cell, 0);
  h.input.move(1, 0);
  h.input.move(0, 1);
  assert.equal(h.input.cell, h.at(1, 1));
  assert.deepEqual(h.moves, [h.at(1, 0), h.at(1, 1)]);
  h.input.move(-5, -5);
  assert.equal(h.input.cell, 0, 'clamped at the top-left corner');
  h.input.move(10, 10);
  assert.equal(h.input.cell, h.at(4, 3), 'clamped at the bottom-right corner');
  const before = h.moves.length;
  h.input.move(1, 1);
  assert.equal(h.moves.length, before, 'a step against the edge reports nothing');
  h.input.setCell(h.at(2, 2));
  assert.equal(h.input.cell, h.at(2, 2));
  h.input.setCell(-1);
  assert.equal(h.input.cell, h.at(2, 2), 'a cell off the board is refused');
});

test('a held direction steps once, then auto-repeats after the delay at the interval', () => {
  const h = harness(['.........'], { delay: 380, interval: 60 });
  h.input.hold('k', 'right');
  h.input.tick(1000);
  assert.equal(h.input.cell, 1, 'the press steps at once');
  h.input.tick(1300);
  assert.equal(h.input.cell, 1, 'nothing before the delay');
  h.input.tick(1380);
  assert.equal(h.input.cell, 2);
  h.input.tick(1440);
  assert.equal(h.input.cell, 3);
  assert.ok(h.input.moving);
  h.input.let('k', 'right');
  h.input.tick(1500);
  assert.equal(h.input.cell, 3, 'released: no more steps');
  assert.equal(h.input.moving, false);
  h.input.hold('k', 'right');
  h.input.tick(1501);
  assert.equal(h.input.cell, 4, 'a new press steps at once again');
});

test('two sources on one direction keep it held until both let go', () => {
  const h = harness(['.........']);
  h.input.hold('key', 'right');
  h.input.hold('pad', 'right');
  h.input.tick(0);
  h.input.let('key', 'right');
  assert.ok(h.input.moving);
  h.input.let('pad', 'right');
  assert.equal(h.input.moving, false);
});

// ---------- reveal, flag and chord on keys ----------

test('Space or Enter held on a closed cell shows it pressed and reveals it on release', () => {
  for (const key of ['Space', 'Enter']) {
    const h = harness();
    assert.equal(CURSOR_KEYS[key], 'reveal');
    h.go(2, 2);
    h.input.down(key, 'reveal');
    assert.deepEqual(h.pressed, [h.at(2, 2)], 'the same feedback as a held mouse button');
    assert.deepEqual(h.actions, [], 'nothing happens on the press');
    h.input.up(key, 'reveal');
    assert.deepEqual(h.actions, [['reveal', h.at(2, 2)]]);
    assert.deepEqual(h.pressed, []);
  }
});

test('a reveal is not a "smart" button: on a revealed number it presses nothing and never chords', () => {
  const h = harness();
  const c = h.at(1, 1);
  h.game.reveal(c);
  h.game.toggleFlag(0);
  h.go(1, 1);
  h.input.down('Space', 'reveal');
  assert.deepEqual(h.presses, []);
  h.input.up('Space', 'reveal');
  assert.deepEqual(h.actions, []);
  assert.equal(h.game.cellState(h.at(2, 2)), 'closed');
});

test('F toggles a flag on the press, on a closed or flagged cell only', () => {
  const h = harness();
  assert.equal(CURSOR_KEYS.KeyF, 'flag');
  h.input.down('KeyF', 'flag');
  assert.deepEqual(h.actions, [['toggleFlag', 0]]);
  assert.deepEqual(h.presses, [], 'a flag shows no press');
  h.input.up('KeyF', 'flag');
  h.input.down('KeyF', 'flag');
  h.input.up('KeyF', 'flag');
  assert.equal(h.game.cellState(0), 'closed', 'toggled back');
  h.game.reveal(h.at(1, 1));
  h.go(1, 1);
  h.input.down('KeyF', 'flag');
  assert.equal(h.actions.length, 2, 'nothing on a revealed cell');
});

test('D chords a revealed number on release, with its neighbours pressed while held; on a closed cell it never reveals', () => {
  const h = harness();
  assert.equal(CURSOR_KEYS.KeyD, 'chord');
  h.go(2, 2);
  h.input.down('KeyD', 'chord');
  h.input.up('KeyD', 'chord');
  assert.deepEqual(h.actions, [], 'a chord button on a closed cell does nothing');
  assert.equal(h.game.cellState(h.at(2, 2)), 'closed');

  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(0);
  h.go(1, 1);
  h.input.down('KeyD', 'chord');
  assert.equal(h.pressed.length, 7);
  h.input.up('KeyD', 'chord');
  assert.deepEqual(h.actions, [['chord', h.at(1, 1)]]);
  assert.deepEqual(h.pressed, []);
});

test('the press follows the cursor and the release acts on the cell the cursor is on', () => {
  const h = harness();
  h.go(2, 2);
  h.input.down('Space', 'reveal');
  h.input.move(1, 0);
  assert.deepEqual(h.pressed, [h.at(3, 2)]);
  h.input.up('Space', 'reveal');
  assert.deepEqual(h.actions, [['reveal', h.at(3, 2)]]);
});

test('a reveal and a flag input held together chord on the reveal\'s release, never reveal, as left + right does', () => {
  const h = harness();
  h.go(2, 2);
  h.input.down('Space', 'reveal');
  h.input.down('KeyF', 'flag');
  assert.deepEqual(h.actions, [['toggleFlag', h.at(2, 2)]], 'the flag still toggles on its press');
  h.input.up('KeyF', 'flag');
  h.input.up('Space', 'reveal');
  assert.equal(h.actions.length, 1, 'the release reveals nothing');

  const n = harness();
  n.game.reveal(n.at(1, 1));
  n.game.toggleFlag(0);
  n.go(1, 1);
  n.input.down('Space', 'reveal');
  n.input.down('KeyF', 'flag');
  n.input.up('KeyF', 'flag');
  assert.deepEqual(n.actions, []);
  n.input.up('Space', 'reveal');
  assert.deepEqual(n.actions, [['chord', n.at(1, 1)]]);
});

test('an inactive board takes no press and sends nothing; reset drops the held buttons without firing', () => {
  let live = false;
  const h = harness(CORNER, { active: () => live });
  h.go(2, 2);
  h.input.down('Space', 'reveal');
  h.input.up('Space', 'reveal');
  h.input.hold('k', 'right');
  h.input.tick(0);
  assert.deepEqual([h.actions, h.presses, h.input.cell], [[], [], h.at(2, 2)]);
  live = true;
  h.input.down('Space', 'reveal');
  assert.deepEqual(h.pressed, [h.at(2, 2)]);
  h.input.reset();
  assert.deepEqual(h.pressed, []);
  h.input.up('Space', 'reveal');
  assert.deepEqual(h.actions, [], 'the release after a reset fires nothing');
  assert.equal(h.input.holding, false);
});

// ---------- the controller ----------

test('controller: A or RT reveals, X or LT flags, Y chords; B and Start never act on the board', () => {
  assert.equal(PAD_MAP[BTN.A], 'reveal');
  assert.equal(PAD_MAP[BTN.RT], 'reveal');
  assert.equal(PAD_MAP[BTN.X], 'flag');
  assert.equal(PAD_MAP[BTN.LT], 'flag');
  assert.equal(PAD_MAP[BTN.Y], 'chord');
  assert.equal(PAD_MAP[BTN.B], undefined);
  assert.equal(PAD_MAP[BTN.START], undefined);
  assert.equal(PAD_MAP[BTN.BACK], undefined);

  for (const b of [BTN.A, BTN.RT]) {
    const h = harness();
    h.go(2, 2);
    h.input.pad(poll([b]), 0);
    assert.deepEqual(h.pressed, [h.at(2, 2)], 'held: the pressed feedback');
    assert.deepEqual(h.actions, []);
    h.input.pad(poll([]), 16);
    assert.deepEqual(h.actions, [['reveal', h.at(2, 2)]], 'acts on release');
  }
  for (const b of [BTN.X, BTN.LT]) {
    const h = harness();
    h.input.pad(poll([b]), 0);
    h.input.pad(poll([b]), 16);
    assert.deepEqual(h.actions, [['toggleFlag', 0]], 'once, on the press');
  }
  const h = harness();
  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(0);
  h.go(1, 1);
  h.input.pad(poll([BTN.Y]), 0);
  assert.equal(h.pressed.length, 7);
  h.input.pad(poll([]), 16);
  assert.deepEqual(h.actions, [['chord', h.at(1, 1)]]);

  const other = harness();
  other.go(2, 2);
  other.input.pad(poll([BTN.B, BTN.START, BTN.BACK]), 0);
  other.input.pad(poll([]), 16);
  assert.deepEqual([other.actions, other.presses, other.input.cell], [[], [], other.at(2, 2)]);
});

test('controller: both triggers chord a number on the release, as left + right does', () => {
  const h = harness();
  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(0);
  h.go(1, 1);
  h.input.pad(poll([BTN.RT]), 0);
  h.input.pad(poll([BTN.RT, BTN.LT]), 16);
  assert.deepEqual(h.actions, [], 'nothing on a revealed number at the press');
  h.input.pad(poll([BTN.RT]), 32);
  h.input.pad(poll([]), 48);
  assert.deepEqual(h.actions, [['chord', h.at(1, 1)]]);
});

test('both triggers chord only under a profile whose chordInputs has left + right; Y chords regardless', () => {
  const rules = { chordInputs: ['left'], revealInputs: ['left'], flagToggle: 'right-press', pressFeedback: { closed: 'cell', flagged: 'none', number: 'closed-unflagged-neighbours' }, releaseOffCell: 'press-follows-pointer' };
  const h = harness(CORNER, { rules });
  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(0);
  h.go(1, 1);
  h.input.pad(poll([BTN.RT, BTN.LT]), 0);
  h.input.pad(poll([]), 16);
  assert.deepEqual(h.actions, []);
  h.input.pad(poll([BTN.Y]), 32);
  h.input.pad(poll([]), 48);
  assert.deepEqual(h.actions, [['chord', h.at(1, 1)]]);
});

test('controller: the d-pad and the left stick move the cursor with auto-repeat', () => {
  const h = harness(['.........', '.........'], { delay: 380, interval: 60 });
  h.input.pad(poll([BTN.RIGHT]), 0);
  assert.equal(h.input.cell, 1);
  h.input.pad(poll([BTN.RIGHT]), 380);
  h.input.pad(poll([BTN.RIGHT]), 440);
  assert.equal(h.input.cell, 3, 'repeats while held');
  h.input.pad(poll([BTN.DOWN]), 500);
  assert.equal(h.input.cell, 12);
  h.input.pad(poll([]), 520);

  h.input.pad(poll([], [-1, 0]), 600);
  assert.equal(h.input.cell, 11, 'stick left');
  h.input.pad(poll([], [-1, 0]), 980);
  assert.equal(h.input.cell, 10, 'the stick repeats too');
  h.input.pad(poll([], [0, -1]), 1000);
  assert.equal(h.input.cell, 1, 'stick up');
  h.input.pad(poll([], [0, 0]), 1020);
  h.input.pad(poll([], [0.1, 0]), 1040);
  assert.equal(h.input.cell, 1, 'inside the deadzone nothing moves');
  assert.ok(STICK_THRESHOLD > 0 && STICK_THRESHOLD < 1);
});

// ---------- the focus ring ----------

function fakeCanvas() {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1 };
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      return (...args) => { calls.push({ op: prop, args, stroke: target.strokeStyle }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return { width: 0, height: 0, style: {}, ctx, getContext: () => ctx };
}

function ringView(rows = CORNER) {
  const { grid, game } = board(rows);
  const canvas = fakeCanvas();
  const draws = [];
  const view = createBoardView({
    canvas,
    grid,
    token: (name) => (name === CURSOR_RING ? '#0000ff' : '#123456'),
    createSkin: () => ({
      drawTile(ctx, x, y, size, state) { draws.push({ c: view.cellAt(x + 1, y + 1), state }); },
      dispose() {},
    }),
  });
  view.resize(500, 400, 1);
  view.setGame(game);
  return { grid, game, view, canvas, draws };
}

const rings = (canvas) => canvas.ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#0000ff');

test('the board view draws the cursor as a focus ring from the focus-ring token, redrawing only the two cells a move touches', () => {
  assert.equal(CURSOR_RING, '--color-focus-ring');
  const css = readFileSync(join(ROOT, 'css/tokens.css'), 'utf8');
  assert.match(css, new RegExp(`${CURSOR_RING}:`), 'the token exists');
  const v = ringView();
  assert.equal(v.view.cursor, -1, 'no cursor until one is set');
  assert.equal(rings(v.canvas).length, 0);
  v.draws.length = 0;
  v.view.setCursor(v.grid.index(2, 2));
  assert.equal(v.view.cursor, v.grid.index(2, 2));
  assert.deepEqual(v.draws.map((d) => d.c), [v.grid.index(2, 2)]);
  assert.equal(rings(v.canvas).length, 1);
  const [x, y, w, hgt] = rings(v.canvas)[0].args;
  const r = v.view.cellRect(v.grid.index(2, 2));
  assert.ok(x >= r.x && y >= r.y && x + w <= r.x + r.size && y + hgt <= r.y + r.size, 'inside its own tile');
  v.draws.length = 0;
  v.canvas.ctx.calls.length = 0;
  v.view.setCursor(v.grid.index(3, 2));
  assert.deepEqual(v.draws.map((d) => d.c).sort((a, b) => a - b), [v.grid.index(2, 2), v.grid.index(3, 2)]);
  assert.equal(rings(v.canvas).length, 1, 'only the new cell carries the ring');
  v.canvas.ctx.calls.length = 0;
  v.view.repaint();
  assert.equal(rings(v.canvas).length, 1, 'a full repaint keeps the ring');
  v.view.setHidden(true);
  v.canvas.ctx.calls.length = 0;
  v.view.setCursor(v.grid.index(1, 1));
  assert.equal(rings(v.canvas).length, 0, 'a hidden board draws no ring');
});

// ---------- the browser wiring ----------

function key(type, code, props = {}) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...props });
}

function wiring({ state = 'playing', rows = CORNER } = {}) {
  const { grid, game } = board(rows);
  const win = new EventTarget();
  const frames = [];
  let time = 0;
  win.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
  win.cancelAnimationFrame = () => {};
  win.performance = { now: () => time };
  const pressedCalls = [];
  const cursorCalls = [];
  const shown = [];
  const view = {
    setPressed: (cells) => pressedCalls.push([...cells]),
    setCursor: (c) => cursorCalls.push(c),
    ensureVisible: (c) => { shown.push(c); return false; },
  };
  const asked = [];
  const session = {
    state,
    paused: false,
    game,
    setup: { grid },
    reveal: (c) => { asked.push(['reveal', c]); return game.reveal(c); },
    toggleFlag: (c) => { asked.push(['toggleFlag', c]); return game.toggleFlag(c); },
    chord: (c) => { asked.push(['chord', c]); return game.chord(c); },
  };
  const mounted = mountCursorInput({ view, session, win });
  const runFrames = (until) => {
    while (frames.length && time < until) {
      time += 16;
      frames.shift()(time);
    }
  };
  return {
    grid, game, win, view, session, asked, pressedCalls, cursorCalls, shown, mounted, frames,
    runFrames, setTime: (t) => { time = t; },
  };
}

test('mounted: the cursor is shown at once, arrow keys move it and the board scrolls to it', () => {
  const w = wiring();
  assert.deepEqual(w.cursorCalls, [0]);
  const down = key('keydown', 'ArrowRight');
  w.win.dispatchEvent(down);
  assert.ok(down.defaultPrevented, 'the arrow is the board\'s, not a page scroll');
  assert.deepEqual(w.cursorCalls.at(-1), 1);
  assert.deepEqual(w.shown.at(-1), 1);
  w.win.dispatchEvent(key('keydown', 'ArrowRight', { repeat: true }));
  assert.equal(w.cursorCalls.at(-1), 1, 'the system key repeat is ignored');
  w.runFrames(500);
  assert.ok(w.cursorCalls.at(-1) > 1, 'the held key auto-repeats on animation frames');
  w.win.dispatchEvent(key('keyup', 'ArrowRight'));
  const at = w.cursorCalls.length;
  w.runFrames(1000);
  assert.equal(w.cursorCalls.length, at, 'released: the cursor stops');
  assert.equal(w.frames.length, 0, 'no frame is requested while nothing is held');
});

test('mounted: Space, Enter, F and D drive the session and the pressed feedback', () => {
  const w = wiring();
  w.win.dispatchEvent(key('keydown', 'ArrowDown'));
  w.win.dispatchEvent(key('keyup', 'ArrowDown'));
  w.win.dispatchEvent(key('keydown', 'ArrowRight'));
  w.win.dispatchEvent(key('keyup', 'ArrowRight'));
  const c = w.grid.index(1, 1);
  const space = key('keydown', 'Space');
  w.win.dispatchEvent(space);
  assert.ok(space.defaultPrevented);
  assert.deepEqual(w.pressedCalls.at(-1), [c]);
  w.win.dispatchEvent(key('keyup', 'Space'));
  assert.deepEqual(w.asked, [['reveal', c]]);
  w.win.dispatchEvent(key('keydown', 'ArrowLeft'));
  w.win.dispatchEvent(key('keyup', 'ArrowLeft'));
  w.win.dispatchEvent(key('keydown', 'ArrowUp'));
  w.win.dispatchEvent(key('keyup', 'ArrowUp'));
  w.win.dispatchEvent(key('keydown', 'KeyF'));
  w.win.dispatchEvent(key('keyup', 'KeyF'));
  assert.deepEqual(w.asked.at(-1), ['toggleFlag', 0]);
  w.win.dispatchEvent(key('keydown', 'ArrowRight'));
  w.win.dispatchEvent(key('keyup', 'ArrowRight'));
  w.win.dispatchEvent(key('keydown', 'ArrowDown'));
  w.win.dispatchEvent(key('keyup', 'ArrowDown'));
  w.win.dispatchEvent(key('keydown', 'KeyD'));
  w.win.dispatchEvent(key('keyup', 'KeyD'));
  assert.deepEqual(w.asked.at(-1), ['chord', c]);
  w.win.dispatchEvent(key('keydown', 'Enter'));
  w.win.dispatchEvent(key('keyup', 'Enter'));
  assert.equal(w.asked.length, 3, 'Enter on a number does nothing');
});

test('mounted: other keys, modified keys and Esc are left to the page and the shell', () => {
  const w = wiring();
  for (const event of [key('keydown', 'Escape'), key('keydown', 'KeyW'), key('keydown', 'ArrowRight', { ctrlKey: true }), key('keydown', 'Space', { altKey: true })]) {
    w.win.dispatchEvent(event);
    assert.equal(event.defaultPrevented, false, event.code);
  }
  assert.deepEqual([w.asked, w.cursorCalls], [[], [0]]);
});

test('mounted: a board that is not in play takes no keys; losing focus drops what is held', () => {
  const w = wiring({ state: 'won' });
  const ev = key('keydown', 'ArrowRight');
  w.win.dispatchEvent(ev);
  w.win.dispatchEvent(key('keydown', 'Space'));
  w.win.dispatchEvent(key('keyup', 'Space'));
  assert.deepEqual([w.asked, w.cursorCalls, ev.defaultPrevented], [[], [0], false]);

  const p = wiring();
  p.session.paused = true;
  p.win.dispatchEvent(key('keydown', 'Space'));
  p.win.dispatchEvent(key('keyup', 'Space'));
  assert.deepEqual(p.asked, []);

  const b = wiring({ state: 'ready' });
  b.win.dispatchEvent(key('keydown', 'Space'));
  b.win.dispatchEvent(new Event('blur'));
  assert.deepEqual(b.pressedCalls.at(-1), []);
  b.win.dispatchEvent(key('keyup', 'Space'));
  assert.deepEqual(b.asked, [], 'the release after a lost focus fires nothing');
});

test('mounted: the controller reaches the cursor through pad(poll)', () => {
  const w = wiring();
  w.mounted.pad(poll([BTN.DOWN]), 0);
  w.mounted.pad(poll([]), 16);
  w.mounted.pad(poll([BTN.RIGHT]), 32);
  w.mounted.pad(poll([]), 48);
  w.mounted.pad(poll([BTN.A]), 64);
  assert.deepEqual(w.pressedCalls.at(-1), [w.grid.index(1, 1)]);
  w.mounted.pad(poll([]), 80);
  assert.deepEqual(w.asked, [['reveal', w.grid.index(1, 1)]]);
  assert.equal(w.shown.at(-1), w.grid.index(1, 1));
});

test('mounted: destroy removes every listener', () => {
  const w = wiring();
  w.mounted.destroy();
  const ev = key('keydown', 'ArrowRight');
  w.win.dispatchEvent(ev);
  w.win.dispatchEvent(key('keydown', 'Space'));
  w.win.dispatchEvent(key('keyup', 'Space'));
  assert.deepEqual([w.asked, w.cursorCalls, ev.defaultPrevented], [[], [0], false]);
});

test('the module is DOM-free at import and independent of three.js and js/input.js', () => {
  const src = readFileSync(join(ROOT, 'js', 'classic2d', 'cursor-input.js'), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|HTMLElement)\b/);
  assert.doesNotMatch(src, /three|\.\.\/input\.js/);
  assert.match(src, /import \{[^}]*\bRepeat\b[^}]*\bstickCurve\b[^}]*\} from '\.\.\/gamepad\.js'/, 'reuses Repeat and stickCurve');
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

// Runs in the page: a Beginner session whose board request is answered with a fixed board, the
// board view below a 64px bar with 16px margins, and the cursor input wired to both. Mines: a
// wall along row 4 from column 0 to 7, and the two top corners.
async function mountGame() {
  const { mountBoardView } = await import('/js/classic2d/board-view.js');
  const { mountCursorInput } = await import('/js/classic2d/cursor-input.js');
  const { createSession } = await import('/js/classic2d/session.js');
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '16px', right: '16px', top: '96px', bottom: '16px', zIndex: 9999 });
  document.body.append(host);
  const mines = [0, 8];
  for (let col = 0; col < 8; col++) mines.push(4 * 9 + col);
  const client = { request: async () => ({ ok: true, mines, seed: 1, generatorVersion: 1 }), cancel() {} };
  const session = createSession({ choice: { size: 'beginner', custom: { width: 30, height: 16, mines: 99 }, noGuess: false }, client });
  const view = mountBoardView({ container: host, grid: session.setup.grid });
  view.setGame(session.game);
  session.on('changed', ({ changed }) => view.update(changed));
  const cursor = mountCursorInput({ view, session });
  globalThis.__play = { session, view, cursor, mines };
}

test('in a browser, a Beginner game on a fixed board is played by keyboard to a win', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/dev/components.html`);
    await page.evaluate(mountGame);

    const state = (col, row) => page.evaluate((c) => globalThis.__play.session.game.cellState(c), row * 9 + col);
    const cursor = () => page.evaluate(() => globalThis.__play.view.cursor);
    // Moves the cursor to col, row one key press per cell.
    const to = async (col, row) => {
      for (let step = 0; step < 32; step++) {
        const c = await cursor();
        const dc = col - (c % 9);
        const dr = row - Math.floor(c / 9);
        if (!dc && !dr) return;
        await page.keyboard.press(dc > 0 ? 'ArrowRight' : dc < 0 ? 'ArrowLeft' : dr > 0 ? 'ArrowDown' : 'ArrowUp');
      }
      assert.fail(`the cursor never reached ${col}, ${row}`);
    };

    assert.equal(await cursor(), 0, 'the cursor is on the board from the start');

    // The first reveal: the pressed state shows while Space is held, the board arrives on release.
    await to(0, 8);
    await page.keyboard.down('Space');
    assert.deepEqual(await page.evaluate(() => globalThis.__play.view.pressed), [8 * 9]);
    await page.keyboard.up('Space');
    await page.waitForFunction(() => globalThis.__play.session.state === 'playing');
    assert.equal(await state(0, 6), 'revealed', 'the bottom opened');
    assert.equal(await state(8, 4), 'closed', 'the wall holds the top closed');

    // F flags the wall's last mine on the press.
    await to(7, 4);
    await page.keyboard.down('KeyF');
    assert.equal(await state(7, 4), 'flagged');
    await page.keyboard.up('KeyF');

    // D on the 1 beside the flag chords the gap open, its neighbours pressed while held.
    await to(8, 5);
    await page.keyboard.down('KeyD');
    assert.deepEqual(await page.evaluate(() => globalThis.__play.view.pressed), [4 * 9 + 8]);
    await page.keyboard.up('KeyD');
    assert.equal(await state(8, 4), 'revealed');

    // Enter on the new 1 does nothing; D chords it.
    await to(8, 4);
    await page.keyboard.press('Enter');
    assert.equal(await state(8, 3), 'closed', 'a reveal never chords');
    await page.keyboard.press('KeyD');
    assert.equal(await state(8, 3), 'revealed');
    assert.equal(await state(7, 3), 'revealed');

    // A held arrow auto-repeats across the board.
    await to(0, 0);
    await page.keyboard.down('ArrowRight');
    await page.waitForFunction(() => globalThis.__play.view.cursor === 8);
    await page.keyboard.up('ArrowRight');

    // Every safe cell still closed is opened with Space.
    const closed = await page.evaluate(() => {
      const { session, mines } = globalThis.__play;
      const out = [];
      for (let c = 0; c < 81; c++) if (!mines.includes(c) && session.game.cellState(c) === 'closed') out.push(c);
      return out;
    });
    for (const c of closed) {
      if (await state(c % 9, Math.floor(c / 9)) !== 'closed') continue; // opened by an earlier flood
      await to(c % 9, Math.floor(c / 9));
      await page.keyboard.press('Space');
    }
    assert.equal(await page.evaluate(() => globalThis.__play.session.state), 'won');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
