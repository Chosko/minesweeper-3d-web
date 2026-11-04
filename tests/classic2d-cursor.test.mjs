// Classic 2D cursor input (js/classic2d/cursor-input.js): the cell cursor moved by arrow keys,
// d-pad and left stick with auto-repeat, reveal / flag / chord on keys and controller buttons with
// the same pressed feedback and release rules as the mouse, the focus ring the board view
// (js/classic2d/board-view.js) draws over the cursor cell, the browser wiring to the view and the
// session, and in a browser the board module's cursor ring drawn round the cursor cell.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CURSOR_KEYS, PAD_MAP, STICK_THRESHOLD, createCursorInput, mountCursorInput,
} from '../js/classic2d/cursor-input.js';
import { createBoardView, CURSOR_RING } from '../js/classic2d/board-view.js';
import { BTN, NUM_BUTTONS } from '../js/gamepad.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { browserSuite } from './helpers/browser.mjs';

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

test('controller: a trigger press and a flag are reported for the rumble; A, the keyboard and a refused press are not', () => {
  const run = (fn, options = {}) => {
    const cues = [];
    const h = harness(CORNER, { onPadCue: (kind) => cues.push(kind), ...options });
    fn(h);
    return { cues, h };
  };
  // RT on a closed cell: the press cue at the press, nothing at the release that reveals
  let { cues, h } = run((x) => { x.go(2, 2); x.input.pad(poll([BTN.RT]), 0); });
  assert.deepEqual(cues, ['press']);
  h.input.pad(poll([]), 16);
  assert.deepEqual(cues, ['press'], 'the release acts without a cue');
  // LT on a closed cell flags: the flag cue in place of the press cue; again to unflag
  ({ cues, h } = run((x) => { x.input.pad(poll([BTN.LT]), 0); x.input.pad(poll([]), 16); x.input.pad(poll([BTN.LT]), 32); }));
  assert.deepEqual(cues, ['flag', 'flag'], 'placing and removing a flag');
  // LT on a revealed cell: no flag, so the press cue
  ({ cues } = run((x) => { x.game.reveal(x.at(1, 1)); x.go(1, 1); x.input.pad(poll([BTN.LT]), 0); }));
  assert.deepEqual(cues, ['press']);
  // X flags: the flag cue; on a revealed cell X does nothing and has no cue
  ({ cues } = run((x) => { x.input.pad(poll([BTN.X]), 0); x.input.pad(poll([]), 16); x.game.reveal(x.at(1, 1)); x.go(1, 1); x.input.pad(poll([BTN.X]), 32); }));
  assert.deepEqual(cues, ['flag']);
  // A reveals with no cue; Y chords with no cue
  ({ cues } = run((x) => { x.go(2, 2); x.input.pad(poll([BTN.A]), 0); x.input.pad(poll([]), 16); x.input.pad(poll([BTN.Y]), 32); }));
  assert.deepEqual(cues, []);
  // the keyboard never reports: F flags, Space reveals
  ({ cues, h } = run((x) => { x.input.down('KeyF', 'flag'); x.input.up('KeyF', 'flag'); x.go(2, 2); x.input.down('Space', 'reveal'); x.input.up('Space', 'reveal'); }));
  assert.deepEqual(cues, []);
  assert.deepEqual(h.actions, [['toggleFlag', 0], ['reveal', h.at(2, 2)]]);
  // a board that takes no input: no action, no cue
  ({ cues } = run((x) => { x.input.pad(poll([BTN.RT, BTN.LT]), 0); }, { active: () => false }));
  assert.deepEqual(cues, []);
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

test('onUse reports each cursor input the board takes, before it acts: a direction held, a button pressed', () => {
  let active = true;
  const used = [];
  const h = harness(CORNER, { onUse: () => used.push(h.input.cell), active: () => active });
  h.input.hold('ArrowRight', 'right');
  assert.deepEqual(used, [0], 'before the move');
  h.input.hold('ArrowRight', 'right');
  assert.equal(used.length, 1, 'a direction already held is no new input');
  h.input.let('ArrowRight', 'right');
  h.input.down('KeyF', 'flag');
  h.input.up('KeyF', 'flag');
  h.input.pad(poll([BTN.A]), 0);
  h.input.pad(poll([BTN.A]), 16);
  assert.equal(used.length, 3, 'a key and a controller button, once per press');
  h.input.pad(poll([]), 32);
  active = false;
  h.input.hold('ArrowDown', 'down');
  h.input.down('Space', 'reveal');
  assert.equal(used.length, 3, 'a board that takes no input reports none');
});

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
  const overlay = fakeCanvas();
  const draws = [];
  const view = createBoardView({
    canvas,
    overlay,
    grid,
    token: (name) => (name === CURSOR_RING ? '#0000ff' : '#123456'),
    createSkin: () => ({
      drawTile(ctx, x, y, size, state) { draws.push({ c: view.cellAt(x + 1, y + 1), state }); },
      dispose() {},
    }),
  });
  view.resize(500, 400, 1);
  view.setGame(game);
  return { grid, game, view, canvas, overlay, draws };
}

const rings = (canvas) => canvas.ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#0000ff');

test('the board view draws the cursor as a focus ring from the tile-cursor token on its ring layer, outside the tile, redrawing no cell', () => {
  assert.equal(CURSOR_RING, '--color-tile-cursor');
  const css = readFileSync(join(ROOT, 'themes/joyful-tiles/theme.css'), 'utf8');
  assert.match(css, new RegExp(`${CURSOR_RING}:`), 'the token exists');
  const v = ringView();
  assert.equal(v.view.cursor, -1, 'no cursor until one is set');
  assert.equal(rings(v.overlay).length, 0);
  v.draws.length = 0;
  v.view.setCursor(v.grid.index(2, 2));
  assert.equal(v.view.cursor, v.grid.index(2, 2));
  assert.deepEqual(v.draws, [], 'no cell redrawn');
  assert.equal(rings(v.canvas).length, 0, 'nothing stroked on the board');
  assert.equal(rings(v.overlay).length, 1);
  const [x, y, w, hgt] = rings(v.overlay)[0].args;
  const r = v.view.cellRect(v.grid.index(2, 2));
  assert.ok(x < r.x && y < r.y && x + w > r.x + r.size && y + hgt > r.y + r.size, 'round its tile, outside it');
  v.overlay.ctx.calls.length = 0;
  v.view.setCursor(v.grid.index(3, 2));
  assert.deepEqual(v.draws, [], 'a move redraws no cell either');
  assert.equal(rings(v.overlay).length, 1, 'only the new cell carries the ring');
  v.overlay.ctx.calls.length = 0;
  v.view.repaint();
  assert.equal(rings(v.overlay).length, 1, 'a full repaint keeps the ring');
  v.view.setHidden(true);
  v.overlay.ctx.calls.length = 0;
  v.view.setCursor(v.grid.index(1, 1));
  assert.equal(rings(v.overlay).length, 0, 'a hidden board draws no ring');
});

// ---------- the browser wiring ----------

function key(type, code, props = {}) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { code, repeat: false, ctrlKey: false, altKey: false, metaKey: false, ...props });
}

function wiring({ state = 'playing', rows = CORNER, geometry = null } = {}) {
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
    canvas: new EventTarget(),
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
  const mounted = mountCursorInput({ view, session, win, ...(geometry ? { geometry } : {}) });
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

test('mounted: no ring when the board opens; the first arrow shows it, moves it and the board scrolls to it', () => {
  const w = wiring();
  assert.deepEqual(w.cursorCalls, [], 'no ring for a mouse player');
  assert.equal(w.mounted.shown, false);
  const down = key('keydown', 'ArrowRight');
  w.win.dispatchEvent(down);
  assert.ok(down.defaultPrevented, 'the arrow is the board\'s, not a page scroll');
  assert.equal(w.mounted.shown, true);
  assert.deepEqual(w.cursorCalls, [0, 1], 'shown on the cursor\'s cell, then moved');
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
  assert.deepEqual([w.asked, w.cursorCalls], [[], []]);
});

test('mounted: the ring shows on any cursor key, hides on a mouse press or move over the board, and keeps its cell', () => {
  for (const code of ['Space', 'Enter', 'KeyF', 'KeyD', 'ArrowDown']) {
    const w = wiring();
    w.win.dispatchEvent(key('keydown', code));
    assert.equal(w.mounted.shown, true, `${code} shows the ring`);
    assert.equal(w.cursorCalls[0], 0, `${code}: on the cursor's cell`);
    w.win.dispatchEvent(key('keyup', code));
  }
  const w = wiring();
  w.win.dispatchEvent(key('keydown', 'ArrowRight'));
  w.win.dispatchEvent(key('keyup', 'ArrowRight'));
  w.cursorCalls.length = 0;
  w.view.canvas.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 0, movementY: 0 }));
  assert.deepEqual([w.mounted.shown, w.cursorCalls], [true, []], 'a pointer resting still sends nothing that hides it');
  w.view.canvas.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 3, movementY: 0 }));
  assert.deepEqual([w.mounted.shown, w.cursorCalls], [false, [-1]], 'the pointer moving over the board hides it');
  w.view.canvas.dispatchEvent(new Event('mousedown'));
  assert.deepEqual(w.cursorCalls, [-1], 'hidden already: nothing more');
  w.win.dispatchEvent(key('keydown', 'ArrowDown'));
  w.win.dispatchEvent(key('keyup', 'ArrowDown'));
  assert.deepEqual(w.cursorCalls, [-1, 1, 1 + 5], 'the next key shows it on the cell it kept, then moves it');
  w.view.canvas.dispatchEvent(new Event('mousedown'));
  assert.deepEqual([w.mounted.shown, w.cursorCalls.at(-1)], [false, -1], 'a button pressed on the board hides it');
  w.mounted.pad(poll([BTN.A]), 0);
  assert.deepEqual([w.mounted.shown, w.cursorCalls.at(-1)], [true, 6], 'a controller button shows it');
  w.mounted.pad(poll([]), 16);
  w.view.canvas.dispatchEvent(new Event('mousedown'));
  w.mounted.pad(poll([], [0, STICK_THRESHOLD / 2]), 32);
  assert.equal(w.mounted.shown, false, 'the stick inside its threshold is no input');
  w.mounted.pad(poll([], [0, 1]), 48);
  assert.equal(w.mounted.shown, true, 'the stick past its threshold shows it');
});

test('mounted: a board that is not in play takes no keys and shows no ring; losing focus drops what is held', () => {
  const w = wiring({ state: 'won' });
  const ev = key('keydown', 'ArrowRight');
  w.win.dispatchEvent(ev);
  w.win.dispatchEvent(key('keydown', 'Space'));
  w.win.dispatchEvent(key('keyup', 'Space'));
  w.mounted.pad(poll([BTN.DOWN]), 0);
  assert.deepEqual([w.asked, w.cursorCalls, ev.defaultPrevented], [[], [], false]);

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
  w.win.dispatchEvent(key('keydown', 'ArrowRight'));
  w.win.dispatchEvent(key('keyup', 'ArrowRight'));
  w.mounted.destroy();
  w.cursorCalls.length = 0;
  const ev = key('keydown', 'ArrowRight');
  w.win.dispatchEvent(ev);
  w.win.dispatchEvent(key('keydown', 'Space'));
  w.win.dispatchEvent(key('keyup', 'Space'));
  w.view.canvas.dispatchEvent(new Event('mousedown'));
  assert.deepEqual([w.asked, w.cursorCalls, ev.defaultPrevented], [[], [], false]);
});

// ---------- the grid geometry ----------

// A geometry of the CORNER board's size whose cursor steps two cells along the index to the right
// or left and has no up or down: a stand-in for a grid whose moves are not the square's. Logs
// every query.
function skipping(width = 5, height = 4) {
  const count = width * height;
  const asked = [];
  return {
    asked,
    kind: 'skip', width, height, count,
    neighbour(c, direction) {
      asked.push([c, direction]);
      if (direction === 'right') return c + 2 < count ? c + 2 : -1;
      if (direction === 'left') return c - 2 >= 0 ? c - 2 : -1;
      if (direction === 'up' || direction === 'down') return -1;
      throw new RangeError(direction);
    },
  };
}

test('the cursor moves by the geometry\'s neighbour query, one query a step, and stops where it answers none', () => {
  const geometry = skipping();
  const h = harness(CORNER, { geometry });
  h.input.move(1, 0);
  assert.equal(h.input.cell, 2, 'right is the geometry\'s right');
  assert.deepEqual(geometry.asked, [[0, 'right']]);
  h.input.move(3, 0);
  assert.equal(h.input.cell, 8, 'three steps, three queries');
  assert.deepEqual(h.moves, [2, 8], 'a move of several steps reports its last cell once');
  h.input.move(20, 0);
  assert.equal(h.input.cell, 18, 'stopped at the last cell the geometry answers');
  h.input.move(-1, 0);
  assert.equal(h.input.cell, 16);
  const before = h.moves.length;
  h.input.move(0, 1);
  h.input.move(0, -3);
  assert.equal(h.input.cell, 16, 'no neighbour up or down: the cursor stays');
  assert.equal(h.moves.length, before, 'and reports nothing');
  assert.ok(geometry.asked.some(([, d]) => d === 'up') && geometry.asked.some(([, d]) => d === 'down'), 'it asked');
});

test('held directions and the controller move by the geometry too', () => {
  const geometry = skipping();
  const h = harness(CORNER, { geometry, delay: 380, interval: 60 });
  h.input.hold('k', 'right');
  h.input.tick(1000);
  assert.equal(h.input.cell, 2);
  h.input.tick(1380);
  assert.equal(h.input.cell, 4, 'the auto-repeat steps by the geometry');
  h.input.let('k', 'right');
  h.input.pad(poll([BTN.LEFT]), 2000);
  assert.equal(h.input.cell, 2, 'the d-pad\'s left is the geometry\'s left');
});

test('a geometry built for another size than the grid is refused', () => {
  assert.throws(() => harness(CORNER, { geometry: skipping(4, 4) }), RangeError);
});

test('mounted: the cursor moves on the geometry it is handed', () => {
  const geometry = skipping();
  const w = wiring({ geometry });
  w.win.dispatchEvent(key('keydown', 'ArrowRight'));
  w.win.dispatchEvent(key('keyup', 'ArrowRight'));
  assert.deepEqual(w.cursorCalls, [0, 2], 'shown on its cell, then moved to the geometry\'s right');
  assert.deepEqual(geometry.asked, [[0, 'right']]);
});

test('the cursor input reads no column or row arithmetic of its own', () => {
  const src = readFileSync(join(ROOT, 'js', 'classic2d', 'cursor-input.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /%\s*cols|\/\s*cols|cols\s*\*|\bcols\b|\brows\b/, 'no col + cols × row indexing');
  assert.match(src, /\.neighbour\(/, 'it asks the geometry');
});

test('pointer and touch inputs reach cells only through the view\'s hit-testing, with no column or row arithmetic', () => {
  for (const file of ['pointer-input.js', 'touch-input.js']) {
    const src = readFileSync(join(ROOT, 'js', 'classic2d', file), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(cols|rows|pitch|width|height)\b|%|Math\.floor/, `${file}: no grid arithmetic`);
    assert.match(src, /view\.cellAt\(/, `${file}: the cell under a point is the view's`);
    assert.doesNotMatch(src, /geometry\/|square-grid/, `${file}: no geometry or grid of its own`);
  }
});

test('the module is DOM-free at import and independent of three.js and js/input.js', () => {
  const src = readFileSync(join(ROOT, 'js', 'classic2d', 'cursor-input.js'), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|HTMLElement)\b/);
  assert.doesNotMatch(src, /three|\.\.\/input\.js/);
  assert.match(src, /import \{[^}]*\bRepeat\b[^}]*\bstickCurve\b[^}]*\} from '\.\.\/gamepad\.js'/, 'reuses Repeat and stickCurve');
});

// ---------------------------------------------------------------- browser

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
  const place = () => ({ ok: true, mines, seed: 1, generatorVersion: 1 }); // the standard board, placed at the first click
  const session = createSession({ choice: { size: 'beginner', custom: { width: 30, height: 16, mines: 99 }, noGuess: false }, client, place });
  const view = mountBoardView({ container: host, grid: session.setup.grid });
  view.setGame(session.game);
  session.on('changed', ({ changed }) => view.update(changed));
  const cursor = mountCursorInput({ view, session });
  globalThis.__play = { session, view, cursor, mines };
}

// Runs in the page: for a hexagon and a triangle board, a 5 × 4 board view of the grid's geometry
// with a mine on cell (1, 1), whose upper-left slanted edge faces a tile drawn before it, the cursor
// on it, then the mine revealed and the loss's end effect drawn at the moment its tile is back at
// full size. Reads the ring layer and the board along the normal of that slanted edge — the
// neighbour's face across the gap lies inside the tile's box, where a square flash would light it —
// and where a square ring round the tile's box would stand.
async function shapedBoards() {
  const { mountBoardView } = await import('/js/classic2d/board-view.js');
  const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
  const { createHexGrid } = await import('/js/engine/hex-grid.js');
  const { createTriGrid } = await import('/js/engine/tri-grid.js');
  const { createGeometry } = await import('/js/geometry/index.js');
  const { createGameWithMines } = await import('/js/engine/rules.js');
  const { REFERENCE_PROFILE } = await import('/js/engine/profiles.js');
  const { createEndEffect, LOSS, LOSS_SNAP_MS } = await import('/js/classic2d/end-effect.js');
  const { cursor, palette } = BOARD_ART.current().board;
  const out = {};
  for (const [kind, make] of [['hex', createHexGrid], ['tri', createTriGrid]]) {
    const host = document.createElement('div');
    Object.assign(host.style, { position: 'fixed', left: '16px', top: '96px', width: '900px', height: '600px', zIndex: 10000 });
    document.body.append(host);
    const grid = make(5, 4);
    const geometry = createGeometry(kind, 5, 4);
    const view = mountBoardView({ container: host, grid, geometry });
    while (!(view.layout.width > 0)) await new Promise(requestAnimationFrame);
    const c = grid.index(1, 1);
    const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines: [c], dimensions: { width: 5, height: 4 } });
    view.setGame(game);
    view.setCursor(c);
    const l = view.layout;
    const o = geometry.outline(c, l.tile, l.gap);
    const pts = o.points.map(([x, y]) => [l.offsetX + x - view.scroll.x, l.offsetY + y - view.scroll.y]);
    // The slanted edge facing up and left (the corners run clockwise): its midpoint and outward normal.
    let edge = null;
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length];
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      if (a[0] !== b[0] && a[1] !== b[1] && (!edge || m[0] + m[1] < edge.m[0] + edge.m[1])) {
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        edge = { m, n: [(b[1] - a[1]) / len, (a[0] - b[0]) / len] };
      }
    });
    const along = (d) => [edge.m[0] + edge.n[0] * d, edge.m[1] + edge.n[1] * d];
    const ratio = view.pixelRatio;
    // The pixel whose centre is nearest the point, so a 3 px stroke through the point covers all of it.
    const at = (ctx, [x, y]) => [...ctx.getImageData(Math.round(x * ratio - 0.5), Math.round(y * ratio - 0.5), 1, 1).data];
    const ring = view.overlay.getContext('2d');
    const board = view.canvas.getContext('2d');
    const reach = cursor.radius.px + cursor.width / 2;
    const seen = {
      tile: l.tile,
      ring: at(ring, along(reach)),
      onFace: at(ring, along(-2)),
      squareRing: at(ring, [l.offsetX + o.x - reach, edge.m[1]]),
    };
    view.update(game.reveal(c).changed);
    const effect = createEndEffect({ kind: LOSS, geometry, origin: c, duration: 1000 });
    view.showEffect(effect, LOSS_SNAP_MS * (1 - 1.2 / 2.2)); // the snap's overshoot curve at scale 1, its flash still lit
    seen.litIn = at(board, along(-4));
    seen.litOut = at(board, along(l.gap + 3));
    view.showEffect(null);
    seen.plainIn = at(board, along(-4));
    seen.plainOut = at(board, along(l.gap + 3));
    seen.colour = [1, 3, 5].map((i) => parseInt(cursor.color.slice(i, i + 2), 16));
    seen.ground = [1, 3, 5].map((i) => parseInt(palette.boardGround.slice(i, i + 2), 16));
    out[kind] = seen;
    view.destroy();
    host.remove();
  }
  return out;
}

test('in a browser, the cursor ring an arrow key moves is the board module\'s and stands out from the closed tile it sits on; on a hexagon and a triangle board the ring and the end effect\'s flash trace the tile\'s outline', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const theme of ['joyful-tiles']) {
      const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/dev/components.html`);
      await page.evaluate(async () => {
        const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
        await globalThis.galleryReady;
        while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
      });
      await page.evaluate(mountGame);
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowDown');
      const seen = await page.evaluate(async () => {
        const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
        const { cursor, palette } = BOARD_ART.current().board;
        const { view } = globalThis.__play;
        const board = view.canvas.getContext('2d');
        const layer = view.overlay;
        const ring = layer.getContext('2d');
        const ratio = view.pixelRatio;
        const at = (ctx, x, y) => [...ctx.getImageData(Math.floor(x * ratio), Math.floor(y * ratio), 1, 1).data];
        // Along the middle of a tile's left side: the ring's centre line, its white band's, and the tile's own edge.
        const sides = (c) => {
          const r = view.cellRect(c);
          const y = r.y + r.size / 2;
          return {
            ring: at(ring, r.x - cursor.radius.px - cursor.width / 2, y),
            band: at(ring, r.x - cursor.radius.px + cursor.innerWidth / 2, y),
            onFace: at(ring, r.x + 1, y),
            face: at(board, r.x + 1, y).slice(0, 3),
          };
        };
        const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
        return {
          cursor: view.cursor, layerClass: layer.className, layerSize: [layer.width, layer.height, view.canvas.width, view.canvas.height],
          at: sides(view.cursor), neighbour: sides(view.cursor + 1),
          colour: hex(cursor.color), inner: hex(cursor.inner), face: hex(palette.faces2d.closed.face),
        };
      });
      assert.equal(seen.cursor, 10, `${theme}: the arrows moved the cursor to (1, 1)`);
      assert.equal(seen.layerClass, 'board-ring', `${theme}: drawn on the ring layer`);
      assert.deepEqual(seen.layerSize.slice(0, 2), seen.layerSize.slice(2), `${theme}: the layer is the board canvas's size`);
      assert.deepEqual(seen.at.ring, [...seen.colour, 255], `${theme}: the ring in the board module's colour, outside the tile`);
      assert.deepEqual(seen.at.band, [...seen.inner, 255], `${theme}: its white band inside it, still outside the tile`);
      assert.equal(seen.at.onFace[3], 0, `${theme}: the ring covers none of the tile's face`);
      assert.deepEqual(seen.at.face, seen.face, `${theme}: the cursor's tile shows its own face to its edge`);
      assert.equal(seen.neighbour.ring[3], 0, `${theme}: no ring round the neighbour`);
      const shaped = await page.evaluate(shapedBoards);
      const near = (a, b, tol = 10) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
      for (const [kind, s] of Object.entries(shaped)) {
        assert.ok(near(s.ring.slice(0, 3), s.colour) && s.ring[3] === 255, `${theme} ${kind}: the ring runs outside the tile's slanted edge (${s.ring}, tile ${s.tile})`);
        assert.equal(s.onFace[3], 0, `${theme} ${kind}: covering none of the face inside it`);
        assert.equal(s.squareRing[3], 0, `${theme} ${kind}: and none where a ring round the tile's box would stand (${s.squareRing})`);
        assert.ok(s.litIn.slice(0, 3).reduce((a, v) => a + v, 0) > s.plainIn.slice(0, 3).reduce((a, v) => a + v, 0) + 30, `${theme} ${kind}: the loss's flash lights the tile inside its slanted edge (${s.litIn} over ${s.plainIn})`);
        assert.ok(!near(s.plainOut.slice(0, 3), s.ground, 2), `${theme} ${kind}: across the gap from the slanted edge, inside the tile's box, is the neighbour's face (${s.plainOut})`);
        assert.ok(near(s.litOut.slice(0, 3), s.plainOut.slice(0, 3), 2), `${theme} ${kind}: which the flash leaves unlit (${s.litOut} vs ${s.plainOut})`);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
