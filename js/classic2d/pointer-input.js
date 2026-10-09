// Classic 2D pointer input: the press-and-release state machine over the mouse buttons, and
// mountPointerInput, its browser wiring to the board view (js/classic2d/board-view.js) and the
// session (js/classic2d/session.js). DOM-free at import.
//
// The behaviour is the reference's (tests/fidelity/minesweeper-online.md), read from the rule
// profile's input markers (js/engine/profiles.js) through pointerRules():
//   chordInputs     which inputs chord on a revealed number: 'left', 'middle', 'left+right'.
//   revealInputs    the buttons whose release opens a closed cell: 'left', 'middle'.
//   flagToggle      'right-press' or 'right-release': when the right button toggles a flag on a
//                   closed cell; it does nothing on a revealed one.
//   pressFeedback   what shows pressed while a reveal button is held, by the state of the cell
//                   under the pointer: { closed: 'cell' | 'none', flagged: 'cell' | 'none',
//                   number: 'closed-unflagged-neighbours' | 'none' }.
//   releaseOffCell  'press-follows-pointer': moving presses the cell under the pointer and the
//                   release acts there; 'cancel': moving off the pressed cell cancels the press.
//                   Either way, off the board (cell -1) nothing is pressed and a release does
//                   nothing.
// A left + right gesture — right pressed while left is held, or left while right is — acts on the
// left release only: a chord when chordInputs has 'left+right', and never a reveal.
//
// createPointerInput({ graph, game, onPress, onAction, rules?, active? }) → input
//   graph     the cell graph (degree / neighbour), for a number's neighbours.
//   game      () → the engine game, read for cellState / cellNumber.
//   onPress   (cells) → called with the cells to show pressed whenever that set changes.
//   onAction  (kind, c) → kind 'reveal' | 'toggleFlag' | 'chord', the session's method names.
//   active    () → false while the board takes no input; nothing is pressed or sent then, and a
//             press begun then is ignored through its release.
//
//   down(button, c), up(button, c), move(c)  button 0 left, 1 middle, 2 right; c the cell under
//                                            the pointer, or -1 off the board.
//   reset()   forgets the held buttons without firing (focus loss, pause).
//   holding   whether any button is held.
//
// mountPointerInput({ view, session, graph?, win?, rules? }) → { input, destroy() }: mouse
// buttons on the view's canvas, moves and releases anywhere on the page (`win`), the context menu
// suppressed over the board, held buttons dropped on blur. A shift + primary press on a board that
// scrolls belongs to the view's pan (PAN_MODIFIER) and is ignored here.

import { getRuleProfile, REFERENCE_PROFILE } from '../engine/profiles.js';
import { CELL } from '../engine/rules.js';
import { PAN_MODIFIER } from './board-view.js';

export const BUTTON = Object.freeze({ LEFT: 0, MIDDLE: 1, RIGHT: 2 });

const NAMES = ['left', 'middle', 'right'];

/** The pointer input rules of a rule profile, the reference profile's current version by default. */
export function pointerRules(profile = getRuleProfile(REFERENCE_PROFILE)) {
  const { chordInputs, revealInputs, flagToggle, pressFeedback, releaseOffCell } = profile;
  return Object.freeze({ chordInputs, revealInputs, flagToggle, pressFeedback, releaseOffCell });
}

export function createPointerInput({ graph, game, onPress, onAction, rules = pointerRules(), active = () => true }) {
  const held = [false, false, false];
  let cell = -1;
  let downCell = -1; // the cell the press started on, for releaseOffCell 'cancel'
  let both = false; // left + right during this left hold
  let cancelled = false;
  let shown = [];

  const reveals = (b) => rules.revealInputs.includes(NAMES[b]);
  const revealHeld = () => held.some((h, b) => h && reveals(b));
  const isNumber = (state, c) => state === CELL.REVEALED && game().cellNumber(c) > 0;

  function feedback() {
    if (!revealHeld() || cancelled || cell < 0 || !active()) return [];
    const g = game();
    const state = g.cellState(cell);
    if (state === CELL.CLOSED) return rules.pressFeedback.closed === 'cell' ? [cell] : [];
    if (state === CELL.FLAGGED) return rules.pressFeedback.flagged === 'cell' ? [cell] : [];
    if (isNumber(state, cell) && rules.pressFeedback.number === 'closed-unflagged-neighbours') {
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

  // The release of the last reveal button held, on cell c.
  function release(button, c) {
    if (cancelled || c < 0) return;
    const state = game().cellState(c);
    if (both) {
      if (rules.chordInputs.includes('left+right') && isNumber(state, c)) send('chord', c);
    } else if (state === CELL.CLOSED) {
      send('reveal', c);
    } else if (isNumber(state, c) && rules.chordInputs.includes(NAMES[button])) {
      send('chord', c);
    }
  }

  function toggleFlag(c) {
    if (c < 0) return;
    const state = game().cellState(c);
    if (state === CELL.CLOSED || state === CELL.FLAGGED) send('toggleFlag', c);
  }

  function startPress(c) {
    downCell = c;
    cancelled = false;
  }

  return {
    get holding() { return held.some(Boolean); },

    down(button, c) {
      if (!(button in held) || held[button] || !active()) return;
      cell = c;
      if (reveals(button) && !revealHeld()) startPress(c);
      held[button] = true;
      if (held[BUTTON.LEFT] && held[BUTTON.RIGHT]) both = true;
      if (button === BUTTON.RIGHT && rules.flagToggle === 'right-press') toggleFlag(c);
      refresh();
    },

    up(button, c) {
      if (!(button in held) || !held[button]) return;
      held[button] = false;
      cell = c;
      if (reveals(button) && !revealHeld()) {
        release(button, c);
        if (button === BUTTON.LEFT) both = false;
        cancelled = false;
      } else if (button === BUTTON.RIGHT && !both && rules.flagToggle === 'right-release') {
        toggleFlag(c);
      }
      if (button === BUTTON.LEFT) both = false;
      refresh();
    },

    move(c) {
      if (c === cell) return;
      cell = c;
      if (revealHeld() && rules.releaseOffCell === 'cancel' && c !== downCell) cancelled = true;
      refresh();
    },

    reset() {
      held.fill(false);
      both = false;
      cancelled = false;
      cell = -1;
      refresh();
    },
  };
}

const PLAYABLE = new Set(['ready', 'playing']);

export function mountPointerInput({ view, session, graph = session.setup.grid.graph, win = globalThis, rules }) {
  const canvas = view.canvas;
  const input = createPointerInput({
    graph,
    game: () => session.game,
    rules,
    active: () => PLAYABLE.has(session.state) && !session.paused,
    onPress: (cells) => view.setPressed(cells),
    onAction: (kind, c) => session[kind](c),
  });

  const cellOf = (event) => {
    const box = canvas.getBoundingClientRect();
    return view.cellAt(event.clientX - box.left, event.clientY - box.top);
  };
  const onDown = (event) => {
    if (event.button === BUTTON.LEFT && event[PAN_MODIFIER] && view.layout.scrolls) return;
    if (!(event.button in NAMES)) return;
    event.preventDefault();
    input.down(event.button, cellOf(event));
  };
  const onMove = (event) => {
    if (input.holding) input.move(cellOf(event));
  };
  const onUp = (event) => {
    if (input.holding) input.up(event.button, cellOf(event));
  };
  const onMenu = (event) => event.preventDefault();
  const onBlur = () => input.reset();

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('contextmenu', onMenu);
  win.addEventListener('mousemove', onMove);
  win.addEventListener('mouseup', onUp);
  win.addEventListener('blur', onBlur);

  return {
    input,
    destroy() {
      canvas.removeEventListener('mousedown', onDown);
      canvas.removeEventListener('contextmenu', onMenu);
      win.removeEventListener('mousemove', onMove);
      win.removeEventListener('mouseup', onUp);
      win.removeEventListener('blur', onBlur);
      input.reset();
    },
  };
}
