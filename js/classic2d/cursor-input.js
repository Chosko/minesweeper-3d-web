// Classic 2D cursor input: a cell cursor moved by arrow keys, d-pad and left stick with auto-repeat,
// and reveal, flag and chord on keys and controller buttons, ending in the same session actions as
// the pointer input (js/classic2d/pointer-input.js). mountCursorInput wires it to the board view
// (js/classic2d/board-view.js), which draws the cursor as a focus ring, and to the session
// (js/classic2d/session.js). DOM-free at import.
//
// The mapping — B, Start and Back are the shell's (back / pause) and never act on the board:
//   reveal  Space, Enter; controller A, RT   — held on a closed cell, it shows the pressed
//                                              feedback; released there, it reveals. It never
//                                              chords: there is no "smart" button.
//   flag    F; controller X, LT              — the right mouse button: toggles a flag on a closed
//                                              or flagged cell, on the press (the profile's
//                                              flagToggle).
//   chord   D; controller Y                  — held, it shows the pressed feedback; released on a
//                                              revealed number, it chords; it never reveals.
//   A reveal and a flag input held together (both triggers) are left + right: the reveal's release
//   chords a number when the profile's chordInputs has 'left+right', and never reveals.
// Pressed feedback (pressFeedback) and what a move does to a held press (releaseOffCell) read the
// same profile markers as the pointer input (pointerRules): the press follows the cursor and the
// release acts where it is.
//
// createCursorInput({ grid, game, onPress, onAction, onCursor?, rules?, active?, delay?, interval? })
//   grid      the square grid (width, height, graph).
//   game      () → the engine game, read for cellState / cellNumber.
//   onPress   (cells) → the cells to show pressed, whenever that set changes.
//   onAction  (kind, c) → kind 'reveal' | 'toggleFlag' | 'chord', the session's method names.
//   onCursor  (c) → the cursor moved to cell c.
//   active    () → false while the board takes no input: no press, no action, no move.
//   delay, interval  the auto-repeat timing of a held direction (js/gamepad.js Repeat).
//
//   cell, setCell(c), move(dx, dy)     the cursor, clamped to the board.
//   hold(source, dir), let(source, dir) a direction ('up' | 'down' | 'left' | 'right') held or let
//                                      go by an input source (a key code, a pad button, the stick).
//   tick(now)                          moves for the held directions, with auto-repeat.
//   down(source, button), up(source, button)  button 'reveal' | 'flag' | 'chord'.
//   pad(poll, now)                     a GamepadReader poll ({ held, ls }) after the shell's held-
//                                      button suppression; maps the buttons and stick, then ticks.
//   reset()                            forgets every held input without firing (focus loss, pause).
//   holding, moving                    whether a button / a direction is held.
//
// mountCursorInput({ view, session, grid?, win?, rules?, delay?, interval? }) → { input, pad,
// destroy() }: the cursor shown on the view and kept in view, keys on the page (`win`) — the
// system key repeat ignored, a held direction repeated on animation frames — and held inputs
// dropped on blur. pad(poll, now?) is for the shell's controller poll. Keys with Ctrl, Alt or Meta
// and every key not in CURSOR_KEYS are left alone.

import { BTN, Repeat, stickCurve } from '../gamepad.js';
import { CELL } from '../engine/rules.js';
import { pointerRules } from './pointer-input.js';

/** Key codes and what they do on the board. */
export const CURSOR_KEYS = Object.freeze({
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  Space: 'reveal',
  Enter: 'reveal',
  NumpadEnter: 'reveal',
  KeyF: 'flag',
  KeyD: 'chord',
});

/** Controller buttons (standard mapping) and what they do on the board. */
export const PAD_MAP = Object.freeze({
  [BTN.A]: 'reveal',
  [BTN.RT]: 'reveal',
  [BTN.X]: 'flag',
  [BTN.LT]: 'flag',
  [BTN.Y]: 'chord',
  [BTN.UP]: 'up',
  [BTN.DOWN]: 'down',
  [BTN.LEFT]: 'left',
  [BTN.RIGHT]: 'right',
});

/** How far the curved left stick must lean on an axis to hold that direction. */
export const STICK_THRESHOLD = 0.25;

const STEP = Object.freeze({ up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] });
const DIRECTIONS = Object.keys(STEP);
const BUTTONS = ['reveal', 'flag', 'chord'];

export function createCursorInput({
  grid, game, onPress, onAction, onCursor = () => {}, rules = pointerRules(), active = () => true,
  delay, interval,
}) {
  const cols = grid.width;
  const rows = grid.height;
  const graph = grid.graph;
  const dirs = Object.fromEntries(DIRECTIONS.map((d) => [d, new Set()]));
  const repeats = Object.fromEntries(DIRECTIONS.map((d) => [d, new Repeat(delay, interval)]));
  const held = Object.fromEntries(BUTTONS.map((b) => [b, new Set()]));
  let cell = 0;
  let chordOnly = false; // a chord input or reveal + flag during this press
  let chordButton = false; // a chord input during this press
  let downCell = -1; // the cell the press started on, for releaseOffCell 'cancel'
  let cancelled = false;
  let shown = [];
  const padHeld = new Set();
  const stickHeld = new Set();

  const pressing = () => held.reveal.size > 0 || held.chord.size > 0;
  const isNumber = (state, c) => state === CELL.REVEALED && game().cellNumber(c) > 0;

  function feedback() {
    if (!pressing() || cancelled || !active()) return [];
    const g = game();
    const state = g.cellState(cell);
    if (state === CELL.CLOSED) return rules.pressFeedback.closed === 'cell' ? [cell] : [];
    if (state === CELL.FLAGGED) return rules.pressFeedback.flagged === 'cell' ? [cell] : [];
    if (chordOnly && isNumber(state, cell) && rules.pressFeedback.number === 'closed-unflagged-neighbours') {
      const out = [];
      for (let k = 0, d = graph.degree(cell); k < d; k++) {
        const nb = graph.neighbour(cell, k);
        if (g.cellState(nb) === CELL.CLOSED) out.push(nb);
      }
      return out;
    }
    return [];
  }

  function refresh() {
    const next = feedback();
    if (next.length === shown.length && next.every((c, i) => c === shown[i])) return;
    shown = next;
    onPress([...next]);
  }

  function send(kind, c) {
    if (active()) onAction(kind, c);
  }

  function release() {
    if (cancelled) return;
    const state = game().cellState(cell);
    if (chordOnly) {
      if (isNumber(state, cell) && (chordButton || rules.chordInputs.includes('left+right'))) send('chord', cell);
    } else if (state === CELL.CLOSED) {
      send('reveal', cell);
    }
  }

  function toggleFlag() {
    const state = game().cellState(cell);
    if (state === CELL.CLOSED || state === CELL.FLAGGED) send('toggleFlag', cell);
  }

  function setCell(c) {
    if (!Number.isInteger(c) || c < 0 || c >= cols * rows || c === cell) return;
    cell = c;
    if (pressing() && rules.releaseOffCell === 'cancel' && c !== downCell) cancelled = true;
    onCursor(c);
    refresh();
  }

  function move(dx, dy) {
    const col = Math.min(cols - 1, Math.max(0, (cell % cols) + dx));
    const row = Math.min(rows - 1, Math.max(0, Math.floor(cell / cols) + dy));
    setCell(col + cols * row);
  }

  function hold(source, dir) {
    if (dirs[dir]) dirs[dir].add(source);
  }

  function letGo(source, dir) {
    if (!dirs[dir] || !dirs[dir].delete(source)) return;
    if (!dirs[dir].size) repeats[dir].reset();
  }

  function tick(now) {
    if (!active()) {
      for (const d of DIRECTIONS) repeats[d].reset();
      return;
    }
    let dx = 0;
    let dy = 0;
    for (const d of DIRECTIONS) {
      const n = repeats[d].update(dirs[d].size > 0, now);
      dx += STEP[d][0] * n;
      dy += STEP[d][1] * n;
    }
    if (dx || dy) move(dx, dy);
  }

  function down(source, button) {
    const set = held[button];
    if (!set || set.has(source) || !active()) return;
    const was = pressing();
    const flagWas = held.flag.size > 0;
    set.add(source);
    if (button === 'flag') {
      if (pressing()) chordOnly = true;
      if (!flagWas && rules.flagToggle === 'right-press') toggleFlag();
    } else {
      if (!was) {
        downCell = cell;
        cancelled = false;
        chordOnly = false;
        chordButton = false;
      }
      if (button === 'chord') chordButton = true;
      if (button === 'chord' || held.flag.size > 0) chordOnly = true;
    }
    refresh();
  }

  function up(source, button) {
    const set = held[button];
    if (!set || !set.delete(source)) return;
    if (button === 'flag') {
      if (!held.flag.size && !chordOnly && rules.flagToggle === 'right-release') toggleFlag();
    } else if (!pressing()) {
      release();
      chordOnly = false;
      chordButton = false;
      cancelled = false;
    }
    refresh();
  }

  function pad(poll, now) {
    const h = poll?.held ?? [];
    for (const [index, what] of Object.entries(PAD_MAP)) {
      const b = Number(index);
      const source = `pad:${b}`;
      const on = Boolean(h[b]);
      if (on === padHeld.has(b)) continue;
      if (on) padHeld.add(b);
      else padHeld.delete(b);
      if (STEP[what]) {
        if (on) hold(source, what);
        else letGo(source, what);
      } else if (on) {
        down(source, what);
      } else {
        up(source, what);
      }
    }
    const [x, y] = stickCurve(...(poll?.ls ?? [0, 0]));
    const lean = {
      left: x < -STICK_THRESHOLD, right: x > STICK_THRESHOLD, up: y < -STICK_THRESHOLD, down: y > STICK_THRESHOLD,
    };
    for (const d of DIRECTIONS) {
      if (lean[d] === stickHeld.has(d)) continue;
      if (lean[d]) { stickHeld.add(d); hold('stick', d); } else { stickHeld.delete(d); letGo('stick', d); }
    }
    tick(now);
  }

  function reset() {
    for (const b of BUTTONS) held[b].clear();
    for (const d of DIRECTIONS) { dirs[d].clear(); repeats[d].reset(); }
    padHeld.clear();
    stickHeld.clear();
    chordOnly = false;
    chordButton = false;
    cancelled = false;
    refresh();
  }

  return {
    get cell() { return cell; },
    get holding() { return BUTTONS.some((b) => held[b].size > 0); },
    get moving() { return DIRECTIONS.some((d) => dirs[d].size > 0); },
    setCell,
    move,
    hold,
    let: letGo,
    tick,
    down,
    up,
    pad,
    reset,
  };
}

const PLAYABLE = new Set(['ready', 'playing']);

export function mountCursorInput({ view, session, grid = session.setup.grid, win = globalThis, rules, delay, interval }) {
  const active = () => PLAYABLE.has(session.state) && !session.paused;
  const now = () => win.performance.now();
  const input = createCursorInput({
    grid,
    game: () => session.game,
    rules,
    active,
    delay,
    interval,
    onPress: (cells) => view.setPressed(cells),
    onAction: (kind, c) => session[kind](c),
    onCursor: (c) => {
      view.setCursor(c);
      view.ensureVisible(c);
    },
  });
  view.setCursor(input.cell);

  let frame = null;
  const loop = () => {
    frame = null;
    input.tick(now());
    if (input.moving) frame = win.requestAnimationFrame(loop);
  };

  const onKeyDown = (event) => {
    const what = CURSOR_KEYS[event.code];
    if (!what || event.ctrlKey || event.altKey || event.metaKey || !active()) return;
    event.preventDefault();
    if (event.repeat) return;
    if (STEP[what]) {
      input.hold(event.code, what);
      input.tick(now());
      if (frame === null && input.moving) frame = win.requestAnimationFrame(loop);
    } else {
      input.down(event.code, what);
    }
  };
  const onKeyUp = (event) => {
    const what = CURSOR_KEYS[event.code];
    if (!what) return;
    if (STEP[what]) input.let(event.code, what);
    else input.up(event.code, what);
  };
  const onBlur = () => input.reset();

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  win.addEventListener('blur', onBlur);

  return {
    input,
    pad: (poll, at = now()) => input.pad(poll, at),
    destroy() {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      win.removeEventListener('blur', onBlur);
      if (frame !== null) win.cancelAnimationFrame(frame);
      frame = null;
      input.reset();
    },
  };
}
