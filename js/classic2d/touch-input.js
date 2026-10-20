// Classic 2D touch input: the touch state machine, and mountTouchInput, its browser wiring to the
// board view (js/classic2d/board-view.js) and the session (js/classic2d/session.js). DOM-free at
// import. Touch is its own input beside the mouse's (js/classic2d/pointer-input.js), which never
// sees a touch: the mount cancels the touch events, so a tap produces no emulated mouse events.
//
// One finger:
//   held LONG_PRESS_MS without moving TAP_SLOP px  toggles the flag on a closed or flagged cell
//                                       while still held, with one short vibration; on a revealed
//                                       cell it does nothing. The lift that follows does nothing.
//   lifted sooner, moved less than TAP_SLOP px  a tap, acting on the cell it touched on the lift:
//                                       a closed cell reveals, or toggles its flag while the
//                                       Reveal / Flag switch is on Flag (flagMode); a revealed
//                                       number chords, whichever way the switch is set.
//   moved TAP_SLOP px or more           pans the board when it scrolls (onPan, the finger's moves
//                                       from where it touched); otherwise acts on nothing.
//   While the finger is down the touched cell, or a number's closed unflagged neighbours, show the
//   pressed feedback the mouse shows (the profile's pressFeedback), for a tap that would reveal or
//   chord.
// Two fingers: the second cancels the first's pending tap or long-press; their midpoint and
// spread drive onPinchStart(mid) and onPinch(mid, ratio), ratio the spread over the spread at the
// start — the mount's pan and zoom. Lifting one ends the gesture: nothing acts until every finger
// is up.
//
// createTouchInput({ graph, game, onPress, onAction, onPan?, onPinchStart?, onPinch?, scrolls?,
//                    flagMode?, vibrate?, clock?, rules?, active? }) → input
//   graph, game, onPress, onAction, rules, active   as createPointerInput's (pointer-input.js); a
//             touch begun while active() is false is ignored through its lift.
//   scrolls   () → whether the board scrolls (a one-finger drag pans only then).
//   flagMode  () → true while the Reveal / Flag switch is on Flag.
//   vibrate   () → the long-press flag's vibration.
//   clock     { setTimeout, clearTimeout }, for the long-press; the global ones by default.
//
//   down(id, x, y, c), move(id, x, y, c), up(id, x, y, c)  a touch point by its id, at x, y in
//             canvas CSS pixels, over cell c or -1.
//   cancel(id)  the browser took the touch: it acts on nothing.
//   reset()   forgets every finger without acting (focus loss, pause).
//   holding   whether a finger is down.
//
// mountTouchInput({ view, session, graph?, win?, rules?, flagMode?, clock?, onUserScroll? }) →
// { input, destroy() }: touch pointers on the view's canvas (pointerType 'touch'; a mouse or pen is
// left alone), panning through view.pan and zooming through view.zoom about the pinch's midpoint,
// the board point under the midpoint at the start kept under it; onUserScroll() follows each pan
// or zoom. The vibration is the page's navigator.vibrate, where it exists. Input is taken only
// while the session is ready or playing and not paused, as the mouse's is.

import { CELL } from '../engine/rules.js';
import { pointerRules } from './pointer-input.js';

/** How long a still touch is held before it flags, in ms. */
export const LONG_PRESS_MS = 400;
/** How far a touch may move, in CSS px, and still be a tap or a long-press. */
export const TAP_SLOP = 8;
/** The long-press flag's vibration, in ms. */
export const VIBRATE_MS = 20;
/** What a tap on a closed cell does: the Reveal / Flag switch's two settings. */
export const TAP_MODES = Object.freeze(['reveal', 'flag']);

const globalClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h),
};
const IDLE = 'idle';
const PENDING = 'pending'; // one finger, a tap or long-press still possible
const PAN = 'pan'; // one finger panning
const PINCH = 'pinch'; // two fingers
const DONE = 'done'; // acted, or cancelled: nothing more until every finger is up

export function createTouchInput({
  graph, game, onPress, onAction, onPan = () => {}, onPinchStart = () => {}, onPinch = () => {},
  scrolls = () => false, flagMode = () => false, vibrate = () => {}, clock = globalClock,
  rules = pointerRules(), active = () => true,
}) {
  const points = new Map(); // id → { x0, y0, x, y }
  let phase = IDLE;
  let cell = -1; // the touched cell of a pending tap
  let timer = null;
  let shown = [];
  let pinch = null; // { spread }
  let ignored = false; // the gesture began while the board took no input

  const isNumber = (state, c) => state === CELL.REVEALED && game().cellNumber(c) > 0;

  let pressEvent = 'press'; // the feedback's cell event: chordPress for a number's neighbours

  function setPressed(next) {
    if (next.length === shown.length && next.every((c, i) => c === shown[i])) return;
    shown = next;
    onPress([...next], pressEvent);
  }

  // The feedback the mouse shows for a reveal press on cell c, for a tap that would reveal or chord.
  function feedback(c) {
    pressEvent = 'press';
    if (c < 0) return [];
    const g = game();
    const state = g.cellState(c);
    if (state === CELL.CLOSED) return !flagMode() && rules.pressFeedback.closed === 'cell' ? [c] : [];
    if (state === CELL.FLAGGED) return !flagMode() && rules.pressFeedback.flagged === 'cell' ? [c] : [];
    if (isNumber(state, c) && rules.pressFeedback.number === 'closed-unflagged-neighbours') {
      const out = [];
      pressEvent = 'chordPress';
      for (let k = 0, d = graph.degree(c); k < d; k++) {
        const nb = graph.neighbour(c, k);
        if (g.cellState(nb) === CELL.CLOSED) out.push(nb);
      }
      return out;
    }
    return [];
  }

  function stopTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function send(kind, c) {
    if (active()) onAction(kind, c);
  }

  function longPress() {
    timer = null;
    if (phase !== PENDING) return;
    phase = DONE;
    setPressed([]);
    const state = cell >= 0 ? game().cellState(cell) : undefined;
    if ((state === CELL.CLOSED || state === CELL.FLAGGED) && active()) {
      onAction('toggleFlag', cell);
      vibrate();
    }
  }

  function tap(c) {
    if (c < 0) return;
    const state = game().cellState(c);
    if (isNumber(state, c)) send('chord', c);
    else if (flagMode()) { if (state === CELL.CLOSED || state === CELL.FLAGGED) send('toggleFlag', c); }
    else if (state === CELL.CLOSED) send('reveal', c);
  }

  const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const spread = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function endGesture() {
    stopTimer();
    setPressed([]);
    pinch = null;
    phase = points.size ? DONE : IDLE;
  }

  return {
    get holding() { return points.size > 0; },

    down(id, x, y, c) {
      if (points.has(id)) return;
      if (points.size === 0) {
        points.set(id, { x0: x, y0: y, x, y });
        ignored = !active();
        if (ignored) { phase = DONE; return; }
        phase = PENDING;
        cell = c;
        timer = clock.setTimeout(longPress, LONG_PRESS_MS);
        setPressed(feedback(c));
        return;
      }
      points.set(id, { x0: x, y0: y, x, y });
      if (points.size === 2 && !ignored) {
        stopTimer();
        setPressed([]);
        const [a, b] = [...points.values()];
        phase = PINCH;
        pinch = { spread: spread(a, b) };
        onPinchStart(midpoint(a, b));
      } else {
        endGesture();
      }
    },

    move(id, x, y) {
      const p = points.get(id);
      if (!p) return;
      const dx = x - p.x;
      const dy = y - p.y;
      p.x = x;
      p.y = y;
      if (phase === PENDING) {
        if (Math.hypot(x - p.x0, y - p.y0) < TAP_SLOP) return;
        stopTimer();
        setPressed([]);
        if (scrolls()) {
          phase = PAN;
          onPan(x - p.x0, y - p.y0);
        } else {
          phase = DONE;
        }
      } else if (phase === PAN) {
        onPan(dx, dy);
      } else if (phase === PINCH) {
        const [a, b] = [...points.values()];
        onPinch(midpoint(a, b), pinch.spread > 0 ? spread(a, b) / pinch.spread : 1);
      }
    },

    up(id) {
      if (!points.has(id)) return;
      points.delete(id);
      if (phase === PENDING) {
        stopTimer();
        setPressed([]);
        phase = IDLE;
        tap(cell);
        return;
      }
      endGesture();
    },

    cancel(id) {
      if (!points.has(id)) return;
      points.delete(id);
      endGesture();
    },

    reset() {
      points.clear();
      endGesture();
    },
  };
}

const PLAYABLE = new Set(['ready', 'playing']);

export function mountTouchInput({
  view, session, graph = session.setup.grid.graph, win = globalThis, rules, flagMode = () => false, clock, onUserScroll = () => {},
}) {
  const canvas = view.canvas;
  let zoomFrom = null; // { tile, point }: the tile and the board point under the midpoint at a pinch's start
  const input = createTouchInput({
    graph,
    game: () => session.game,
    rules,
    clock,
    flagMode,
    active: () => PLAYABLE.has(session.state) && !session.paused,
    scrolls: () => !!view.layout.scrolls,
    vibrate: () => { try { win.navigator?.vibrate?.(VIBRATE_MS); } catch { /* no vibration */ } },
    onPress: (cells, event) => view.setPressed(cells, event),
    onAction: (kind, c) => session[kind](c),
    onPan: (dx, dy) => { if (view.pan(dx, dy)) onUserScroll(); },
    onPinchStart: (mid) => { zoomFrom = { tile: view.layout.tile, point: view.boardPoint(mid.x, mid.y) }; },
    onPinch: (mid, ratio) => {
      if (zoomFrom && view.zoom(zoomFrom.tile * ratio, mid.x, mid.y, zoomFrom.point)) onUserScroll();
    },
  });

  const at = (event) => {
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    return [x, y, view.cellAt(x, y)];
  };
  const touch = (event) => event.pointerType === 'touch';
  const onDown = (event) => {
    if (!touch(event)) return;
    event.preventDefault();
    input.down(event.pointerId, ...at(event));
  };
  const onMove = (event) => { if (touch(event)) input.move(event.pointerId, ...at(event)); };
  const onUp = (event) => { if (touch(event)) input.up(event.pointerId, ...at(event)); };
  const onCancel = (event) => { if (touch(event)) input.cancel(event.pointerId); };
  const swallow = (event) => { if (event.cancelable) event.preventDefault(); };
  const onBlur = () => input.reset();

  const passive = { passive: false };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  for (const type of ['touchstart', 'touchmove', 'touchend']) canvas.addEventListener(type, swallow, passive);
  win.addEventListener('blur', onBlur);

  return {
    input,
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      for (const type of ['touchstart', 'touchmove', 'touchend']) canvas.removeEventListener(type, swallow, passive);
      win.removeEventListener('blur', onBlur);
      input.reset();
    },
  };
}
