// Classic 2D pointer input (js/classic2d/pointer-input.js): the press-and-release state machine
// over the mouse buttons against the behaviour recorded in tests/fidelity/minesweeper-online.md,
// its rules read from the reference profile, the pressed feedback drawn by the board view
// (js/classic2d/board-view.js), the browser wiring to the view and the session, and in a browser
// a Beginner game played by mouse to a win.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  BUTTON, pointerRules, createPointerInput, mountPointerInput,
} from '../js/classic2d/pointer-input.js';
import { createBoardView, PAN_MODIFIER } from '../js/classic2d/board-view.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE, getRuleProfile } from '../js/engine/profiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = getRuleProfile(REFERENCE_PROFILE);
const FIDELITY = readFileSync(join(ROOT, 'tests', 'fidelity', 'minesweeper-online.md'), 'utf8');

const { LEFT, MIDDLE, RIGHT } = BUTTON;

// ---------- harness ----------

// A game from row strings ('*' a mine), playing from the start.
function board(rows) {
  const width = rows[0].length;
  const height = rows.length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((line, row) => [...line].forEach((ch, col) => { if (ch === '*') mines.push(grid.index(col, row)); }));
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines, dimensions: { width, height } });
  return { grid, game };
}

// The state machine over a real game: every press set reported and every action applied.
function harness(rows, options = {}) {
  const { grid, game } = board(rows);
  const presses = [];
  const actions = [];
  const input = createPointerInput({
    graph: grid.graph,
    game: () => game,
    onPress: (cells) => presses.push([...cells].sort((a, b) => a - b)),
    onAction: (kind, c) => { actions.push([kind, c]); game[kind](c); },
    ...options,
  });
  return {
    grid,
    game,
    input,
    presses,
    actions,
    at: (col, row) => grid.index(col, row),
    get pressed() { return presses.length ? presses[presses.length - 1] : []; },
  };
}

// 5 × 4, a mine in the top-left corner: (1, 1) is a 1 with eight closed neighbours.
const CORNER = ['*....', '.....', '.....', '.....'];

// ---------- the rules ----------

test('profile: the reference profile carries the pointer input rules, each citing its fidelity entry', () => {
  assert.deepEqual([...PROFILE.chordInputs], ['left', 'middle', 'left+right']);
  assert.deepEqual([...PROFILE.revealInputs], ['left', 'middle']);
  assert.equal(PROFILE.flagToggle, 'right-press');
  assert.deepEqual({ ...PROFILE.pressFeedback }, { closed: 'cell', flagged: 'none', number: 'closed-unflagged-neighbours' });
  assert.equal(PROFILE.releaseOffCell, 'press-follows-pointer');
  assert.equal(PROFILE.fidelity.revealInputs, 'Chording: which inputs chord');
  assert.equal(PROFILE.fidelity.flagToggle, 'Flag timing');
  assert.equal(PROFILE.fidelity.pressFeedback, 'Pressed feedback');
  assert.equal(PROFILE.fidelity.releaseOffCell, 'Releasing off the pressed cell');
  for (const marker of ['revealInputs', 'flagToggle', 'pressFeedback', 'releaseOffCell']) {
    assert.ok(FIDELITY.includes(`### ${PROFILE.fidelity[marker]}`), `${marker} cites an entry in the fidelity file`);
  }
});

test('pointerRules reads the input rules of a profile, the reference one by default', () => {
  const rules = pointerRules();
  assert.deepEqual(rules, pointerRules(PROFILE));
  assert.deepEqual([...rules.chordInputs], [...PROFILE.chordInputs]);
  assert.deepEqual([...rules.revealInputs], [...PROFILE.revealInputs]);
  assert.equal(rules.flagToggle, PROFILE.flagToggle);
  assert.deepEqual({ ...rules.pressFeedback }, { ...PROFILE.pressFeedback });
  assert.equal(rules.releaseOffCell, PROFILE.releaseOffCell);
  assert.ok(Object.isFrozen(rules));
});

// ---------- pressed feedback and reveal ----------

test('left held on a closed, unflagged cell shows it pressed and reveals it on release', () => {
  const h = harness(CORNER);
  const c = h.at(2, 2);
  h.input.down(LEFT, c);
  assert.deepEqual(h.pressed, [c]);
  assert.deepEqual(h.actions, [], 'nothing happens on the press');
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, [['reveal', c]]);
  assert.deepEqual(h.pressed, [], 'the press clears on release');
  assert.equal(h.game.cellState(c), 'revealed');
});

test('a held button on a flagged cell shows nothing and its release does nothing', () => {
  const h = harness(CORNER);
  const c = h.at(0, 0);
  h.game.toggleFlag(c);
  h.input.down(LEFT, c);
  assert.deepEqual(h.presses, [], 'no press reported');
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, []);
  assert.equal(h.game.cellState(c), 'flagged');
});

test('the middle button behaves exactly like the left: press, reveal and chord', () => {
  const h = harness(CORNER);
  const c = h.at(1, 1);
  h.input.down(MIDDLE, c);
  assert.deepEqual(h.pressed, [c]);
  h.input.up(MIDDLE, c);
  assert.deepEqual(h.actions, [['reveal', c]]);
  assert.equal(h.game.cellNumber(c), 1);
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(MIDDLE, c);
  h.input.up(MIDDLE, c);
  assert.deepEqual(h.actions[1], ['chord', c]);
  assert.equal(h.game.cellState(h.at(2, 2)), 'revealed', 'the chord opened the neighbours');
});

test('held on a revealed number, its closed unflagged neighbours show pressed, and the release chords', () => {
  const h = harness(CORNER);
  const c = h.at(1, 1);
  h.game.reveal(c);
  h.game.reveal(h.at(1, 0));
  h.game.toggleFlag(h.at(0, 1)); // a wrong flag: the count matches, so the chord loses
  h.input.down(LEFT, c);
  const want = [h.at(0, 0), h.at(2, 0), h.at(0, 2), h.at(1, 2), h.at(2, 2), h.at(2, 1)].sort((a, b) => a - b);
  assert.deepEqual(h.pressed, want, 'closed unflagged neighbours only: not the flag, not the revealed one, not the number');
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, [['chord', c]]);
  assert.equal(h.game.phase, 'lost');
});

test('the neighbours show pressed whether or not the flag count matches', () => {
  const h = harness(CORNER);
  const c = h.at(1, 1);
  h.game.reveal(c);
  h.input.down(LEFT, c);
  assert.equal(h.pressed.length, 8, 'no flag around the 1, all eight neighbours pressed');
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, [['chord', c]], 'the chord is sent; the engine opens nothing');
  assert.equal(h.game.cellState(h.at(2, 2)), 'closed');
});

test('a revealed zero shows nothing pressed and its release does nothing', () => {
  const h = harness(CORNER);
  const c = h.at(4, 3);
  h.game.reveal(c);
  assert.equal(h.game.cellNumber(c), 0);
  h.input.down(LEFT, c);
  assert.deepEqual(h.presses, []);
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, []);
});

// ---------- right button ----------

test('a right press toggles a flag at once; its release does nothing', () => {
  const h = harness(CORNER);
  const c = h.at(0, 0);
  h.input.down(RIGHT, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]]);
  assert.equal(h.game.cellState(c), 'flagged');
  h.input.up(RIGHT, c);
  assert.equal(h.actions.length, 1);
  h.input.down(RIGHT, c);
  assert.equal(h.game.cellState(c), 'closed', 'a second press removes the flag');
  h.input.up(RIGHT, c);
  assert.deepEqual(h.presses, [], 'the right button shows nothing pressed');
});

test('a right press on a revealed cell does nothing', () => {
  const h = harness(CORNER);
  const c = h.at(1, 1);
  h.game.reveal(c);
  h.input.down(RIGHT, c);
  h.input.up(RIGHT, c);
  assert.deepEqual(h.actions, []);
});

test('a right press while left is held on a closed cell toggles its flag, and the left release then does nothing', () => {
  const h = harness(CORNER);
  const c = h.at(2, 2);
  h.input.down(LEFT, c);
  assert.deepEqual(h.pressed, [c]);
  h.input.down(RIGHT, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]]);
  assert.deepEqual(h.pressed, [], 'a flagged cell no longer shows pressed');
  h.input.up(RIGHT, c);
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]], 'no reveal after a left + right gesture on a closed cell');
  assert.equal(h.game.cellState(c), 'flagged');
});

test('left + right chords through the left release, whichever button went down first', () => {
  for (const order of [[LEFT, RIGHT], [RIGHT, LEFT]]) {
    for (const releaseFirst of [RIGHT, LEFT]) {
      const h = harness(CORNER);
      const c = h.at(1, 1);
      h.game.reveal(c);
      h.game.toggleFlag(h.at(0, 0));
      h.input.down(order[0], c);
      h.input.down(order[1], c);
      assert.deepEqual(h.actions, [], 'nothing on the presses over a number');
      h.input.up(releaseFirst, c);
      h.input.up(releaseFirst === LEFT ? RIGHT : LEFT, c);
      assert.deepEqual(h.actions, [['chord', c]], `down ${order}, release ${releaseFirst} first: one chord`);
      assert.equal(h.game.cellState(h.at(2, 2)), 'revealed');
    }
  }
});

// ---------- moving and releasing elsewhere ----------

test('moving onto another cell while holding presses that cell, and releasing there acts on it', () => {
  const h = harness(CORNER);
  const a = h.at(0, 1);
  const b = h.at(1, 1);
  h.input.down(LEFT, a);
  h.input.move(b);
  assert.deepEqual(h.pressed, [b]);
  h.input.up(LEFT, b);
  assert.deepEqual(h.actions, [['reveal', b]]);
  assert.equal(h.game.cellState(a), 'closed');
});

test('moving off the board un-presses the cell, and releasing off the board does nothing', () => {
  const h = harness(CORNER);
  const a = h.at(2, 2);
  h.input.down(LEFT, a);
  h.input.move(-1);
  assert.deepEqual(h.pressed, []);
  h.input.up(LEFT, -1);
  assert.deepEqual(h.actions, []);
  h.input.down(LEFT, -1);
  h.input.move(a);
  assert.deepEqual(h.pressed, [a], 'a press that started off the board presses the cell it moves onto');
  h.input.up(LEFT, a);
  assert.deepEqual(h.actions, [['reveal', a]]);
});

test('moving a chord preview off its number clears it', () => {
  const h = harness(CORNER);
  const c = h.at(1, 1);
  h.game.reveal(c);
  h.input.down(LEFT, c);
  assert.equal(h.pressed.length, 8);
  h.input.move(h.at(4, 3));
  assert.deepEqual(h.pressed, [h.at(4, 3)]);
  h.input.move(-1);
  assert.deepEqual(h.pressed, []);
});

test('moving without a button held presses nothing, and a release without its press is ignored', () => {
  const h = harness(CORNER);
  h.input.move(h.at(2, 2));
  h.input.up(LEFT, h.at(2, 2));
  h.input.up(RIGHT, h.at(2, 2));
  h.input.down(3, h.at(2, 2));
  h.input.up(3, h.at(2, 2));
  assert.deepEqual(h.presses, []);
  assert.deepEqual(h.actions, []);
});

// ---------- inactive and reset ----------

test('while the board is not active nothing shows pressed and nothing is sent', () => {
  let active = false;
  const h = harness(CORNER, { active: () => active });
  const c = h.at(2, 2);
  h.input.down(LEFT, c);
  h.input.down(RIGHT, h.at(0, 0));
  h.input.up(RIGHT, h.at(0, 0));
  h.input.up(LEFT, c);
  assert.deepEqual(h.presses, []);
  assert.deepEqual(h.actions, []);
  h.input.down(LEFT, c);
  active = true;
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, [], 'a press begun while inactive sends nothing on its release');
  h.input.down(LEFT, c);
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, [['reveal', c]]);
});

test('reset forgets the held buttons without firing and clears the press', () => {
  const h = harness(CORNER);
  const c = h.at(2, 2);
  h.input.down(LEFT, c);
  assert.equal(h.input.holding, true);
  h.input.reset();
  assert.equal(h.input.holding, false);
  assert.deepEqual(h.pressed, []);
  h.input.up(LEFT, c);
  assert.deepEqual(h.actions, []);
});

// ---------- rules other than the reference ----------

test('the state machine follows the rules it is given', () => {
  const base = pointerRules();
  const rules = (over) => ({ ...base, ...over });

  // Middle not chording: its release on a number does nothing.
  let h = harness(CORNER, { rules: rules({ chordInputs: ['left', 'left+right'] }) });
  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(MIDDLE, h.at(1, 1));
  h.input.up(MIDDLE, h.at(1, 1));
  assert.deepEqual(h.actions, []);

  // Left + right not chording: the left release after both does nothing.
  h = harness(CORNER, { rules: rules({ chordInputs: ['left', 'middle'] }) });
  h.game.reveal(h.at(1, 1));
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(LEFT, h.at(1, 1));
  h.input.down(RIGHT, h.at(1, 1));
  h.input.up(LEFT, h.at(1, 1));
  assert.deepEqual(h.actions, []);

  // Middle not revealing: nothing at all.
  h = harness(CORNER, { rules: rules({ revealInputs: ['left'], chordInputs: ['left'] }) });
  h.input.down(MIDDLE, h.at(2, 2));
  h.input.up(MIDDLE, h.at(2, 2));
  assert.deepEqual([h.presses, h.actions], [[], []]);

  // Flag on the right release.
  h = harness(CORNER, { rules: rules({ flagToggle: 'right-release' }) });
  h.input.down(RIGHT, h.at(0, 0));
  assert.deepEqual(h.actions, []);
  h.input.up(RIGHT, h.at(0, 0));
  assert.deepEqual(h.actions, [['toggleFlag', h.at(0, 0)]]);

  // No feedback on a number; a flagged cell showing pressed.
  h = harness(CORNER, { rules: rules({ pressFeedback: { closed: 'cell', flagged: 'cell', number: 'none' } }) });
  h.game.reveal(h.at(1, 1));
  h.input.down(LEFT, h.at(1, 1));
  assert.deepEqual(h.presses, []);
  h.input.up(LEFT, h.at(1, 1));
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(LEFT, h.at(0, 0));
  assert.deepEqual(h.pressed, [h.at(0, 0)]);
  h.input.up(LEFT, h.at(0, 0));
  assert.equal(h.game.cellState(h.at(0, 0)), 'flagged', 'a flagged cell is still never revealed');

  // Moving off the pressed cell cancels the gesture.
  h = harness(CORNER, { rules: rules({ releaseOffCell: 'cancel' }) });
  h.input.down(LEFT, h.at(2, 2));
  h.input.move(h.at(3, 2));
  assert.deepEqual(h.pressed, []);
  h.input.move(h.at(2, 2));
  h.input.up(LEFT, h.at(2, 2));
  assert.deepEqual(h.actions, [], 'a cancelled press stays cancelled until released');
});

// ---------- the board view draws the press ----------

function fakeCanvas() {
  const calls = [];
  const ctx = new Proxy({ fillStyle: '#000000' }, {
    get(target, prop) {
      if (prop in target) return target[prop];
      return (...args) => { calls.push({ op: prop, args }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  return { width: 0, height: 0, style: {}, getContext: () => ctx };
}

function recordingView(rows) {
  const { grid, game } = board(rows);
  const draws = [];
  const view = createBoardView({
    canvas: fakeCanvas(),
    grid,
    token: () => '#123456',
    createSkin: () => ({
      drawTile(ctx, x, y, size, state) { draws.push({ c: view.cellAt(x + 1, y + 1), state }); },
      dispose() {},
    }),
  });
  view.resize(500, 400, 1);
  view.setGame(game);
  draws.length = 0;
  return { grid, game, view, draws, at: (col, row) => grid.index(col, row) };
}

test('the board view draws pressed cells through the skin\'s pressed state, and redraws them when released', () => {
  const v = recordingView(CORNER);
  const a = v.at(2, 2);
  const b = v.at(3, 2);
  v.view.setPressed([a]);
  assert.deepEqual(v.draws, [{ c: a, state: 'pressed' }], 'only the pressed cell is drawn');
  assert.deepEqual(v.view.pressed, [a]);
  v.draws.length = 0;
  v.view.setPressed([b]);
  assert.deepEqual(v.draws.sort((x, y) => x.c - y.c), [{ c: a, state: 'closed' }, { c: b, state: 'pressed' }]);
  v.draws.length = 0;
  v.view.repaint();
  assert.equal(v.draws.find((d) => d.c === b).state, 'pressed', 'a full repaint keeps the press');
  v.draws.length = 0;
  v.view.setPressed([]);
  assert.deepEqual(v.draws, [{ c: b, state: 'closed' }]);
});

test('only a closed cell is drawn pressed; a new game clears the press', () => {
  const v = recordingView(CORNER);
  const c = v.at(1, 1);
  v.game.reveal(c);
  v.view.setPressed([c, v.at(0, 0)]);
  assert.deepEqual(v.draws.sort((x, y) => x.c - y.c), [{ c: v.at(0, 0), state: 'pressed' }, { c, state: 'revealed' }]);
  v.view.setGame(board(CORNER).game);
  assert.deepEqual(v.view.pressed, []);
});

// ---------- the browser wiring ----------

function mouse(type, props) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { button: 0, clientX: 0, clientY: 0, shiftKey: false, ...props });
}

// A view and a session standing in for the real ones: cells are 10 px squares from the canvas
// origin at (100, 50), the session records what it is asked.
function wiring({ scrolls = false, state = 'playing' } = {}) {
  const { grid, game } = board(CORNER);
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 50, height: 40 });
  const win = new EventTarget();
  const pressedCalls = [];
  const view = {
    canvas,
    layout: { scrolls },
    cellAt: (x, y) => (x >= 0 && y >= 0 && x < 50 && y < 40 ? Math.floor(x / 10) + 5 * Math.floor(y / 10) : -1),
    setPressed: (cells) => pressedCalls.push([...cells]),
  };
  const asked = [];
  const session = {
    state,
    paused: false,
    game,
    reveal: (c) => { asked.push(['reveal', c]); return game.reveal(c); },
    toggleFlag: (c) => { asked.push(['toggleFlag', c]); return game.toggleFlag(c); },
    chord: (c) => { asked.push(['chord', c]); return game.chord(c); },
  };
  const mounted = mountPointerInput({ view, session, graph: grid.graph, win });
  const xy = (col, row) => ({ clientX: 100 + col * 10 + 5, clientY: 50 + row * 10 + 5 });
  return { grid, game, canvas, win, view, session, asked, pressedCalls, mounted, xy };
}

test('mounted: mouse buttons on the canvas drive the session and the view\'s pressed feedback', () => {
  const w = wiring();
  const down = mouse('mousedown', { button: 0, ...w.xy(2, 2) });
  w.canvas.dispatchEvent(down);
  assert.ok(down.defaultPrevented, 'the press is the game\'s, not a text selection');
  assert.deepEqual(w.pressedCalls.at(-1), [w.grid.index(2, 2)]);
  w.win.dispatchEvent(mouse('mousemove', { buttons: 1, ...w.xy(3, 2) }));
  assert.deepEqual(w.pressedCalls.at(-1), [w.grid.index(3, 2)]);
  w.win.dispatchEvent(mouse('mouseup', { button: 0, ...w.xy(3, 2) }));
  assert.deepEqual(w.asked, [['reveal', w.grid.index(3, 2)]]);
  assert.deepEqual(w.pressedCalls.at(-1), []);

  w.canvas.dispatchEvent(mouse('mousedown', { button: 2, ...w.xy(0, 0) }));
  assert.deepEqual(w.asked.at(-1), ['toggleFlag', 0]);
  w.win.dispatchEvent(mouse('mouseup', { button: 2, ...w.xy(0, 0) }));

  // A release outside the canvas is a release off the board.
  w.canvas.dispatchEvent(mouse('mousedown', { button: 1, ...w.xy(4, 3) }));
  w.win.dispatchEvent(mouse('mouseup', { button: 1, clientX: 5, clientY: 5 }));
  assert.equal(w.asked.length, 2);
});

test('mounted: the context menu is suppressed over the board', () => {
  const w = wiring();
  const menu = mouse('contextmenu', { button: 2, ...w.xy(1, 1) });
  w.canvas.dispatchEvent(menu);
  assert.ok(menu.defaultPrevented);
});

test('mounted: a shift + primary press on a board that scrolls is the pan\'s, never a play', () => {
  const w = wiring({ scrolls: true });
  const down = mouse('mousedown', { button: 0, [PAN_MODIFIER]: true, ...w.xy(2, 2) });
  w.canvas.dispatchEvent(down);
  w.win.dispatchEvent(mouse('mouseup', { button: 0, [PAN_MODIFIER]: true, ...w.xy(2, 2) }));
  assert.deepEqual(w.pressedCalls, []);
  assert.deepEqual(w.asked, []);

  // On a board that fits, shift changes nothing.
  const fits = wiring({ scrolls: false });
  fits.canvas.dispatchEvent(mouse('mousedown', { button: 0, [PAN_MODIFIER]: true, ...fits.xy(2, 2) }));
  fits.win.dispatchEvent(mouse('mouseup', { button: 0, [PAN_MODIFIER]: true, ...fits.xy(2, 2) }));
  assert.deepEqual(fits.asked, [['reveal', fits.grid.index(2, 2)]]);
});

test('mounted: a board that is not in play takes no input; losing focus drops the held buttons', () => {
  const w = wiring({ state: 'won' });
  w.canvas.dispatchEvent(mouse('mousedown', { button: 0, ...w.xy(2, 2) }));
  w.win.dispatchEvent(mouse('mouseup', { button: 0, ...w.xy(2, 2) }));
  assert.deepEqual([w.pressedCalls, w.asked], [[], []]);

  const p = wiring({ state: 'playing' });
  p.session.paused = true;
  p.canvas.dispatchEvent(mouse('mousedown', { button: 0, ...p.xy(2, 2) }));
  p.win.dispatchEvent(mouse('mouseup', { button: 0, ...p.xy(2, 2) }));
  assert.deepEqual(p.asked, []);

  const b = wiring({ state: 'ready' });
  b.canvas.dispatchEvent(mouse('mousedown', { button: 0, ...b.xy(2, 2) }));
  b.win.dispatchEvent(new Event('blur'));
  assert.deepEqual(b.pressedCalls.at(-1), []);
  b.win.dispatchEvent(mouse('mouseup', { button: 0, ...b.xy(2, 2) }));
  assert.deepEqual(b.asked, [], 'the release after a lost focus fires nothing');
});

test('mounted: destroy removes every listener', () => {
  const w = wiring();
  w.mounted.destroy();
  w.canvas.dispatchEvent(mouse('mousedown', { button: 0, ...w.xy(2, 2) }));
  w.win.dispatchEvent(mouse('mouseup', { button: 0, ...w.xy(2, 2) }));
  const menu = mouse('contextmenu', { button: 2 });
  w.canvas.dispatchEvent(menu);
  assert.deepEqual([w.pressedCalls, w.asked, menu.defaultPrevented], [[], [], false]);
});

test('the module is DOM-free at import and independent of three.js and js/input.js', () => {
  const src = readFileSync(join(ROOT, 'js', 'classic2d', 'pointer-input.js'), 'utf8');
  assert.doesNotMatch(src, /\b(document|window|localStorage|HTMLElement|requestAnimationFrame)\b/);
  assert.doesNotMatch(src, /three|\.\.\/input\.js/);
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
// board view below a 64px bar with 16px margins, and the pointer input wired to both. Mines: a
// wall along row 4 from column 0 to 7, and the two top corners.
async function mountGame() {
  const { mountBoardView } = await import('/js/classic2d/board-view.js');
  const { mountPointerInput } = await import('/js/classic2d/pointer-input.js');
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
  const pointer = mountPointerInput({ view, session });
  const menus = [];
  window.addEventListener('contextmenu', (e) => menus.push(e.defaultPrevented));
  globalThis.__play = { session, view, pointer, mines, menus };
}

test('in a browser, a Beginner game on a fixed board is played by mouse to a win', async (t) => {
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

    const centre = async (col, row) => {
      const r = await page.evaluate((c) => globalThis.__play.view.cellRect(c), row * 9 + col);
      const box = await page.evaluate(() => {
        const b = globalThis.__play.view.canvas.getBoundingClientRect();
        return { x: b.left, y: b.top };
      });
      return { x: box.x + r.x + r.size / 2, y: box.y + r.y + r.size / 2 };
    };
    const state = (col, row) => page.evaluate((c) => globalThis.__play.session.game.cellState(c), row * 9 + col);
    const at = async (col, row) => { const p = await centre(col, row); await page.mouse.move(p.x, p.y); };

    // The first click: the pressed state shows while held, the board arrives on release.
    await at(0, 8);
    await page.mouse.down();
    assert.deepEqual(await page.evaluate(() => globalThis.__play.view.pressed), [8 * 9]);
    await page.mouse.up();
    await page.waitForFunction(() => globalThis.__play.session.state === 'playing');
    assert.equal(await state(0, 6), 'revealed', 'the bottom opened');
    assert.equal(await state(8, 4), 'closed', 'the wall holds the top closed');

    // A right press flags the wall's last mine; the context menu stays shut.
    await at(7, 4);
    await page.mouse.down({ button: 'right' });
    assert.equal(await state(7, 4), 'flagged', 'flagged on the press');
    await page.mouse.up({ button: 'right' });
    assert.deepEqual(await page.evaluate(() => globalThis.__play.menus), [true]);

    // Left on the 1 beside the flag chords the gap open.
    await at(8, 5);
    await page.mouse.down();
    assert.deepEqual(await page.evaluate(() => globalThis.__play.view.pressed), [4 * 9 + 8]);
    await page.mouse.up();
    assert.equal(await state(8, 4), 'revealed');

    // Left + right on that new 1 chords through the left release.
    await at(8, 4);
    await page.mouse.down();
    await page.mouse.down({ button: 'right' });
    await page.mouse.up({ button: 'right' });
    assert.equal(await state(8, 3), 'closed', 'nothing yet');
    await page.mouse.up();
    assert.equal(await state(8, 3), 'revealed');
    assert.equal(await state(7, 3), 'revealed');

    // A press dragged off the board and released there does nothing.
    await at(4, 2);
    await page.mouse.down();
    await page.mouse.move(4, 4, { steps: 3 });
    assert.deepEqual(await page.evaluate(() => globalThis.__play.view.pressed), []);
    await page.mouse.up();
    assert.equal(await state(4, 2), 'closed');

    // The middle button opens the top.
    await at(4, 2);
    await page.mouse.down({ button: 'middle' });
    await page.mouse.up({ button: 'middle' });
    assert.equal(await state(4, 2), 'revealed');

    // Every safe cell still closed is opened with the left button.
    const closed = await page.evaluate(() => {
      const { session, mines } = globalThis.__play;
      const out = [];
      for (let c = 0; c < 81; c++) if (!mines.includes(c) && session.game.cellState(c) === 'closed') out.push(c);
      return out;
    });
    for (const c of closed) {
      await at(c % 9, Math.floor(c / 9));
      await page.mouse.down();
      await page.mouse.up();
    }
    assert.equal(await page.evaluate(() => globalThis.__play.session.state), 'won');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
