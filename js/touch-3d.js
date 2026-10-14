// Touch controls for 3D: the touch gesture machine, and mountTouch3D, its browser wiring to the
// scene canvas. DOM-free at import. Mounted only on a coarse-only device (js/main.js), where the 3D
// game plays lockless by touch; every action goes through the page's one MouseActions
// (js/input.js), as the mouse buttons, the controller's triggers and the keyboard's keys do, so the
// release rule, the chord toggle and the selection guard are the mouse's.
//
// The scene splits into two zones (touchZone): a touch that starts in the left half is the stick,
// one that starts in the right half is the look; above the overlay bar is neither.
//
// Stick (one finger, left half): a base under the thumb; the drag's offset from it over
// STICK_RADIUS_PX, through stickCurve (js/gamepad.js), is the analog move — up forward, sideways
// strafe (stickAxes). Lifting stops it. It acts on nothing.
// Look (right half):
//   one finger         presses button 0 as it lands.
//     lifted before LONG_PRESS_MS, moved under TAP_SLOP px   releases it: the crosshair cube reveals.
//     moved TAP_SLOP px or more   the press is dropped without firing (drag-to-cancel) and every
//                                 movement turns the camera through onLook(dx, dy), in pixels.
//     held LONG_PRESS_MS still    the press is dropped, then button 2 is pressed and released —
//                                 right on the crosshair cube while the finger is down — with one
//                                 vibration; the lift does nothing.
//   a second finger, while the first is a pending tap: presses button 2. Lifting either fires the
//                                 chord through the toggle, in both orders; the other lift clears it.
//     either moving TAP_SLOP px, or their distance changing by TAP_SLOP px, before a lift: a pinch;
//                                 both presses are dropped. Each PINCH_STEP_PX of change in the
//                                 fingers' distance is one onSpacing(±1) step, spreading = larger.
//   a second finger, while the first is a look drag: a pinch.
//
// createTouch3D({ mouse, onLook?, onSpacing?, vibrate?, clock?, canAct?, canMove? }) → touch
//   mouse      the page's MouseActions (button 0 / 2; cancel drops one press without firing).
//   canAct()   whether a press may act on the board now; a press made, or lifted, while it is false
//              is dropped without firing.
//   canMove()  whether the camera may move now (play, or the look at a finished board); a touch
//              begun while it is false is ignored through its lift.
//   clock      { setTimeout, clearTimeout } for the long-press; the global ones by default.
//   onTap()    after every tap (a lift before LONG_PRESS_MS that moved under TAP_SLOP px), once its
//              release reached the state machine; the look at a finished board ends on it.
//   down(id, x, y, zone), move(id, x, y), up(id)   a touch point by id, in CSS pixels; zone is
//              touchZone's.
//   cancel(id)   the browser took the touch: it acts on nothing.
//   reset()      forget every touch without firing (blur, tab hide, pause, leaving play).
//   stick        { f, r } — the analog move now, zero with no stick.
//   stickView    { x0, y0, x, y } — the base and the knob (clamped to the radius), or null.
//   holding      whether a finger is down.
//
// applyTouchStick({ cam, dt, stick, orbit }) moves the camera by the stick for one frame: in Fly
// (orbit null) as the controller's left stick (FlyCamera.moveAxes); in Orbit (the OrbitCamera)
// the vertical axis dollies at Orbit's stick rate, up = in, and the horizontal axis does nothing.
//
// mountTouch3D({ canvas, touch, zone, win? }) → { destroy() }: touch pointers on the canvas
// (pointerType 'touch'; a mouse or pen is left alone) feed the machine, zone(x, y) naming each
// touch's zone; the browser's own touch gestures and the emulated mouse events of a touch are
// cancelled on the canvas; losing focus and the tab's hide reset the machine.

import { stickCurve } from './gamepad.js';
import { LONG_PRESS_MS, TAP_SLOP, VIBRATE_MS } from './classic2d/touch-input.js';

export { LONG_PRESS_MS, TAP_SLOP, VIBRATE_MS };
/** The stick's full deflection, in CSS px from its base. */
export const STICK_RADIUS_PX = 60;
/** One spacing step per this many CSS px of change in a pinch's finger distance. */
export const PINCH_STEP_PX = 24;

const globalClock = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h),
};

/** The zone a touch at x, y starts in: 'stick' (left half), 'look' (right half), or null above the overlay bar (`top`). */
export function touchZone(x, y, { width, top = 0 }) {
  if (y < top) return null;
  return x < width / 2 ? 'stick' : 'look';
}

/** The analog move of a stick dragged dx, dy px from its base: { f, r }, up forward, right strafe. */
export function stickAxes(dx, dy, radius = STICK_RADIUS_PX) {
  let nx = dx / radius, ny = dy / radius;
  const m = Math.hypot(nx, ny);
  if (m > 1) { nx /= m; ny /= m; }
  const [x, y] = stickCurve(nx, ny);
  return { f: y ? -y : 0, r: x || 0 };
}

/** One frame of the stick's move: Fly as the controller's left stick, Orbit's dolly on the vertical axis. */
export function applyTouchStick({ cam, dt, stick, orbit }) {
  if (orbit) { if (stick.f) orbit.dollyAxis(dt, stick.f); return; }
  if (stick.f || stick.r) cam.moveAxes(dt, stick.f, stick.r, 0);
}

const IDLE = 'idle';
const PENDING = 'pending'; // one look finger, a tap or long-press still possible
const LOOK = 'look'; // one look finger dragging the view
const TWO = 'two'; // two look fingers, the chord still possible
const CHORD = 'chord'; // the chord fired; the other finger's lift clears the toggle
const PINCH = 'pinch';
const DONE = 'done'; // acted or cancelled: nothing more until every look finger is up

export function createTouch3D({
  mouse, onLook = () => {}, onSpacing = () => {}, onTap = () => {}, vibrate = () => {}, clock = globalClock,
  canAct = () => true, canMove = () => true,
}) {
  let stick = null; // { id, x0, y0, x, y }
  const look = new Map(); // id → { x0, y0, x, y, button }
  const pressed = new Set(); // the buttons this machine holds in the mouse's state machine
  let phase = IDLE;
  let timer = null;
  let pinch = null; // { spread0, ref }

  const press = (b) => { if (canAct()) { pressed.add(b); mouse.down(b); } };
  const drop = (b) => { if (pressed.delete(b)) mouse.cancel(b); };
  const release = (b) => {
    if (!pressed.delete(b)) return;
    if (canAct()) mouse.up(b);
    else mouse.cancel(b);
  };
  const spread = () => { const [a, b] = [...look.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };

  function stopTimer() {
    if (timer !== null) clock.clearTimeout(timer);
    timer = null;
  }

  function longPress() {
    timer = null;
    if (phase !== PENDING) return;
    phase = DONE;
    const held = pressed.has(0);
    drop(0);
    if (held && canAct()) {
      mouse.down(2);
      mouse.up(2);
      vibrate();
    }
  }

  function stepPinch() {
    const steps = Math.trunc((spread() - pinch.ref) / PINCH_STEP_PX);
    if (!steps) return;
    pinch.ref += steps * PINCH_STEP_PX;
    onSpacing(steps);
  }

  function toPinch(ref) {
    stopTimer();
    drop(0);
    drop(2);
    phase = PINCH;
    pinch = { ref };
  }

  function settle() {
    stopTimer();
    pinch = null;
    phase = look.size ? DONE : IDLE;
  }

  return {
    get holding() { return !!stick || look.size > 0; },
    get stick() {
      if (!stick) return { f: 0, r: 0 };
      return stickAxes(stick.x - stick.x0, stick.y - stick.y0);
    },
    get stickView() {
      if (!stick) return null;
      const dx = stick.x - stick.x0, dy = stick.y - stick.y0;
      const m = Math.hypot(dx, dy), k = m > STICK_RADIUS_PX ? STICK_RADIUS_PX / m : 1;
      return { x0: stick.x0, y0: stick.y0, x: stick.x0 + dx * k, y: stick.y0 + dy * k };
    },

    down(id, x, y, zone) {
      if (stick?.id === id || look.has(id) || !canMove()) return;
      if (zone === 'stick') {
        if (!stick) stick = { id, x0: x, y0: y, x, y };
        return;
      }
      if (zone !== 'look' || look.size >= 2) return;
      if (look.size === 0) {
        look.set(id, { x0: x, y0: y, x, y, button: 0 });
        phase = PENDING;
        press(0);
        timer = clock.setTimeout(longPress, LONG_PRESS_MS);
        return;
      }
      look.set(id, { x0: x, y0: y, x, y, button: 2 });
      if (phase === PENDING) {
        stopTimer();
        phase = TWO;
        press(2);
        const s = spread();
        pinch = { spread0: s, ref: s };
      } else if (phase === LOOK) {
        toPinch(spread());
      }
    },

    move(id, x, y) {
      if (stick?.id === id) { stick.x = x; stick.y = y; return; }
      const p = look.get(id);
      if (!p) return;
      const dx = x - p.x, dy = y - p.y;
      p.x = x; p.y = y;
      if (phase === PENDING) {
        if (Math.hypot(x - p.x0, y - p.y0) < TAP_SLOP) return;
        stopTimer();
        drop(0);
        phase = LOOK;
        onLook(x - p.x0, y - p.y0);
      } else if (phase === LOOK) {
        onLook(dx, dy);
      } else if (phase === TWO) {
        if (Math.hypot(x - p.x0, y - p.y0) < TAP_SLOP && Math.abs(spread() - pinch.spread0) < TAP_SLOP) return;
        toPinch(pinch.spread0);
        stepPinch();
      } else if (phase === PINCH) {
        stepPinch();
      }
    },

    up(id) {
      if (stick?.id === id) { stick = null; return; }
      const p = look.get(id);
      if (!p) return;
      look.delete(id);
      if (phase === PENDING) {
        stopTimer();
        phase = IDLE;
        release(0);
        onTap();
      } else if (phase === TWO) {
        phase = CHORD;
        pinch = null;
        release(p.button);
      } else if (phase === CHORD) {
        release(p.button);
        phase = IDLE;
      } else settle();
    },

    cancel(id) {
      if (stick?.id === id) { stick = null; return; }
      if (!look.delete(id)) return;
      drop(0);
      drop(2);
      settle();
    },

    reset() {
      stick = null;
      look.clear();
      drop(0);
      drop(2);
      settle();
    },
  };
}

export function mountTouch3D({ canvas, touch, zone, win = globalThis }) {
  const at = (event) => {
    const box = canvas.getBoundingClientRect();
    return [event.clientX - box.left, event.clientY - box.top];
  };
  const isTouch = (event) => event.pointerType === 'touch';
  const onDown = (event) => {
    if (!isTouch(event)) return;
    event.preventDefault();
    const [x, y] = at(event);
    touch.down(event.pointerId, x, y, zone(x, y));
  };
  const onMove = (event) => { if (isTouch(event)) touch.move(event.pointerId, ...at(event)); };
  const onUp = (event) => { if (isTouch(event)) touch.up(event.pointerId); };
  const onCancel = (event) => { if (isTouch(event)) touch.cancel(event.pointerId); };
  const swallow = (event) => { if (event.cancelable) event.preventDefault(); };
  const onBlur = () => touch.reset();
  const onHide = () => { if (win.document?.hidden) touch.reset(); };

  const passive = { passive: false };
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onCancel);
  for (const type of ['touchstart', 'touchmove', 'touchend', 'contextmenu', 'selectstart', 'dblclick']) canvas.addEventListener(type, swallow, passive);
  win.addEventListener('blur', onBlur);
  win.document?.addEventListener('visibilitychange', onHide);

  return {
    destroy() {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onCancel);
      for (const type of ['touchstart', 'touchmove', 'touchend', 'contextmenu', 'selectstart', 'dblclick']) canvas.removeEventListener(type, swallow, passive);
      win.removeEventListener('blur', onBlur);
      win.document?.removeEventListener('visibilitychange', onHide);
      touch.reset();
    },
  };
}
