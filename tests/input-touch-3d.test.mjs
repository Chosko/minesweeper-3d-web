// Touch controls for 3D (js/touch-3d.js): the DOM-free gesture machine — zones (a left-half stick,
// a right-half look), the stick's axes, radius and deadzone, the look drag through FlyCamera.look,
// the 8 px and 400 ms thresholds — and its action streams on the shared MouseActions (tap, drag,
// long-press, two-finger chord, pinch), the pinch's spacing steps through spacingStep, the toolbar's
// view modes in Controls, dropping held touches without firing and the Orbit mapping. The mouse,
// trigger and keyboard streams are pinned unchanged beside them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTouch3D, touchZone, stickAxes, applyTouchStick, STICK_RADIUS_PX, PINCH_STEP_PX,
  LONG_PRESS_MS, TAP_SLOP, VIBRATE_MS,
} from '../js/touch-3d.js';
import * as touch2D from '../js/classic2d/touch-input.js';
import {
  FlyCamera, OrbitCamera, MouseActions, KeyActions, spacingStep, SPACING_START, SPACING_STEP,
  MOVE_SPEED, LOOK_DEG_PER_PX, ORBIT_DOLLY_SPEED,
} from '../js/input.js';
import { Controls } from '../js/controls.js';
import { stickCurve, STICK_DEADZONE } from '../js/gamepad.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DEG = Math.PI / 180;
const close = (a, b, what = '', eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${what}: ${a} != ${b}`);

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
  };
}

/** A machine over a real MouseActions whose actions are recorded, with a camera turned by its look. */
function rig({ selected = true, canAct = () => true, canMove = () => true } = {}) {
  const actions = [];
  const looks = [];
  const steps = [];
  const vibrations = [];
  const clock = fakeClock();
  const mouse = new MouseActions((type) => actions.push(type), () => selected);
  const cam = new FlyCamera();
  const touch = createTouch3D({
    mouse,
    clock,
    canAct,
    canMove,
    onLook: (dx, dy) => { looks.push([dx, dy]); cam.look(dx, dy); },
    onSpacing: (n) => steps.push(n),
    vibrate: () => vibrations.push(VIBRATE_MS),
  });
  return { actions, looks, steps, vibrations, clock, mouse, cam, touch };
}

// ---------------------------------------------------------------- shared values and zones

test('the thresholds are touch Classic 2D\'s: 8 px and 400 ms, with its vibration', () => {
  assert.equal(TAP_SLOP, 8);
  assert.equal(LONG_PRESS_MS, 400);
  assert.equal(TAP_SLOP, touch2D.TAP_SLOP);
  assert.equal(LONG_PRESS_MS, touch2D.LONG_PRESS_MS);
  assert.equal(VIBRATE_MS, touch2D.VIBRATE_MS);
  assert.ok(STICK_RADIUS_PX > 0 && Number.isFinite(STICK_RADIUS_PX));
  assert.ok(PINCH_STEP_PX > TAP_SLOP, 'a pinch step is larger than the slop that starts it');
});

test('zones: the left half is the stick, the right half the look; above the overlay bar nothing', () => {
  const area = { width: 800, top: 80 };
  assert.equal(touchZone(100, 400, area), 'stick');
  assert.equal(touchZone(399, 400, area), 'stick');
  assert.equal(touchZone(400, 400, area), 'look');
  assert.equal(touchZone(790, 100, area), 'look');
  assert.equal(touchZone(100, 79, area), null, 'over the overlay bar');
  assert.equal(touchZone(700, 20, area), null);
  assert.equal(touchZone(100, 400, { width: 800 }), 'stick', 'no bar given: everything is the scene');
});

// ---------------------------------------------------------------- the stick

test('the stick: deflection over its radius through stickCurve, up forward, sideways strafe, capped at full', () => {
  assert.deepEqual(stickAxes(0, 0), { f: 0, r: 0 });
  const dz = STICK_DEADZONE * STICK_RADIUS_PX;
  assert.deepEqual(stickAxes(0, -dz * 0.9), { f: 0, r: 0 }, 'inside the deadzone nothing moves');
  const up = stickAxes(0, -STICK_RADIUS_PX);
  close(up.f, 1, 'full up is full forward');
  assert.equal(up.r, 0);
  const far = stickAxes(0, -STICK_RADIUS_PX * 3);
  close(far.f, 1, 'beyond the radius stays at full deflection');
  const half = stickAxes(STICK_RADIUS_PX / 2, 0);
  const [cx] = stickCurve(0.5, 0);
  close(half.r, cx, 'half right is stickCurve(0.5)');
  assert.equal(half.f, 0);
  const down = stickAxes(0, STICK_RADIUS_PX);
  close(down.f, -1, 'down is back');
});

test('a touch in the left half places the stick; dragging flies the camera as the controller\'s left stick; lifting stops it', () => {
  const { touch, actions } = rig();
  touch.down(1, 100, 500, 'stick');
  assert.deepEqual(touch.stick, { f: 0, r: 0 });
  assert.deepEqual(touch.stickView, { x0: 100, y0: 500, x: 100, y: 500 });
  touch.move(1, 100, 500 - STICK_RADIUS_PX * 2);
  close(touch.stick.f, 1);
  assert.deepEqual(touch.stickView, { x0: 100, y0: 500, x: 100, y: 500 - STICK_RADIUS_PX }, 'the knob stays on its radius');
  const cam = new FlyCamera();
  cam.place({ x: 0, y: 0, z: 0, yaw: Math.PI, pitch: 0 });
  applyTouchStick({ cam, dt: 0.5, stick: touch.stick, orbit: null });
  close(cam.z, MOVE_SPEED * 0.5, 'forward follows the view, at MOVE_SPEED');
  const pad = new FlyCamera();
  pad.place({ x: 0, y: 0, z: 0, yaw: Math.PI, pitch: 0 });
  pad.moveAxes(0.5, 1, 0, 0);
  assert.deepEqual([cam.x, cam.y, cam.z], [pad.x, pad.y, pad.z], 'the same pose as the controller\'s stick');
  touch.up(1);
  assert.deepEqual(touch.stick, { f: 0, r: 0 });
  assert.equal(touch.stickView, null, 'the stick hides');
  assert.deepEqual(actions, [], 'a stick acts on nothing');
  touch.down(2, 100, 500, 'stick');
  touch.up(2);
  assert.deepEqual(actions, [], 'a tap in the left half acts on nothing');
});

// ---------------------------------------------------------------- the look drag

test('a drag in the right half looks at 0.2°/px with sensitivity, Invert Y and the pitch clamp; the stick works beside it', () => {
  const { touch, cam, actions } = rig();
  cam.sensitivity = 2;
  touch.down(1, 100, 500, 'stick');
  touch.move(1, 100 + STICK_RADIUS_PX, 500);
  touch.down(2, 600, 400, 'look');
  touch.move(2, 610, 400); // past the slop: the first 10 px look at once
  touch.move(2, 620, 410);
  close(cam.yaw, Math.PI + 20 * LOOK_DEG_PER_PX * DEG * 2, 'yaw');
  close(cam.pitch, 10 * LOOK_DEG_PER_PX * DEG * 2, 'pitch');
  close(touch.stick.r, 1, 'the stick still strafes');
  cam.invertY = true;
  touch.move(2, 620, 420);
  close(cam.pitch, 0, 'Invert Y turns the other way');
  touch.move(2, 620, -5000);
  close(cam.pitch, Math.PI / 2, 'the pitch clamp holds');
  touch.up(2);
  assert.deepEqual(actions, [], 'a drag acts on nothing');
});

// ---------------------------------------------------------------- actions

test('tap: button 0 pressed on landing, left fired on a lift before 400 ms that moved under 8 px', () => {
  const { touch, actions, mouse, clock } = rig();
  touch.down(1, 600, 400, 'look');
  assert.equal(mouse.left, true, 'pressed as it lands');
  clock.advance(LONG_PRESS_MS - 1);
  touch.move(1, 600 + TAP_SLOP - 1, 400);
  assert.deepEqual(actions, []);
  touch.up(1);
  assert.deepEqual(actions, ['left'], 'acts on the lift');
  assert.equal(mouse.left, false);
});

test('drag to cancel: moving 8 px drops the pending press without firing; the lift does nothing', () => {
  const { touch, actions, mouse, looks } = rig();
  touch.down(1, 600, 400, 'look');
  touch.move(1, 600 + TAP_SLOP, 400);
  assert.equal(mouse.left, false, 'the press is dropped');
  assert.deepEqual(looks, [[TAP_SLOP, 0]]);
  touch.up(1);
  assert.deepEqual(actions, []);
});

test('long-press: at 400 ms the press is dropped and right fires while held, with one vibration; the lift does nothing', () => {
  const { touch, actions, vibrations, clock, mouse } = rig();
  touch.down(1, 600, 400, 'look');
  clock.advance(LONG_PRESS_MS - 1);
  assert.deepEqual(actions, []);
  clock.advance(1);
  assert.deepEqual(actions, ['right'], 'right, not a chord: the left press was dropped first');
  assert.deepEqual(vibrations, [VIBRATE_MS]);
  assert.equal(mouse.left || mouse.right || mouse.toggle, false);
  touch.move(1, 700, 400);
  touch.up(1);
  assert.deepEqual(actions, ['right'], 'nothing more on a move or the lift');
  assert.equal(vibrations.length, 1);
});

test('two-finger tap: a second finger presses button 2; either lift fires chord, in both orders, exactly as Left + Right', () => {
  for (const order of [[1, 2], [2, 1]]) {
    const { touch, actions, clock, mouse } = rig();
    touch.down(1, 600, 400, 'look');
    touch.down(2, 700, 400, 'look');
    assert.equal(mouse.right, true);
    clock.advance(LONG_PRESS_MS * 2);
    assert.deepEqual(actions, [], 'no long-press once the second finger is down');
    touch.up(order[0]);
    assert.deepEqual(actions, ['chord']);
    touch.up(order[1]);
    assert.deepEqual(actions, ['chord'], 'the second lift only clears the toggle');
    assert.equal(mouse.left || mouse.right || mouse.toggle, false);

    const ref = [];
    const m = new MouseActions((t) => ref.push(t), () => true);
    m.down(0); m.down(2); m.up(order[0] === 1 ? 0 : 2); m.up(order[0] === 1 ? 2 : 0);
    assert.deepEqual(ref, actions, 'the mouse gives the same stream');
  }
});

test('pinch: moving 8 px apart before a lift turns two fingers into a pinch that fires nothing and steps the spacing', () => {
  const { touch, actions, steps } = rig();
  touch.down(1, 600, 400, 'look');
  touch.down(2, 700, 400, 'look');
  touch.move(2, 700 + TAP_SLOP, 400); // spread changed by the slop
  assert.deepEqual(steps, [], 'under one pinch step nothing changes yet');
  touch.move(2, 700 + PINCH_STEP_PX, 400);
  assert.deepEqual(steps, [1], 'spreading one step: larger');
  touch.move(2, 700 + PINCH_STEP_PX * 3 + 1, 400);
  assert.deepEqual(steps, [1, 2]);
  touch.move(1, 600 + PINCH_STEP_PX * 2 + 1, 400);
  assert.deepEqual(steps, [1, 2, -2], 'pinching in: smaller');
  touch.up(1);
  touch.up(2);
  assert.deepEqual(actions, [], 'a pinch fires no action');

  const moved = rig();
  moved.touch.down(1, 600, 400, 'look');
  moved.touch.down(2, 700, 400, 'look');
  moved.touch.move(1, 600, 400 + TAP_SLOP); // one finger moved, the spread nearly kept
  moved.touch.up(1);
  moved.touch.up(2);
  assert.deepEqual(moved.actions, [], 'a finger moving 8 px cancels the chord too');
});

test('the pinch steps the spacing through spacingStep: one SPACING_STEP each, within [1, 10]', () => {
  let spacing = SPACING_START;
  const clock = fakeClock();
  const mouse = new MouseActions(() => {}, () => true);
  const touch = createTouch3D({ mouse, clock, onSpacing: (n) => { spacing = spacingStep({ spacing }, n).spacing; } });
  touch.down(1, 500, 400, 'look');
  touch.down(2, 520, 400, 'look');
  touch.move(2, 520 + PINCH_STEP_PX * 4, 400);
  close(spacing, SPACING_START + 4 * SPACING_STEP, 'four steps larger');
  touch.move(2, 520 + PINCH_STEP_PX * 400, 400);
  assert.equal(spacing, 10, 'the range holds');
});

test('a touch begun while the board takes no input is ignored through its lift; actions follow canAct, movement canMove', () => {
  let act = false;
  let move = true;
  const r = rig({ canAct: () => act, canMove: () => move });
  r.touch.down(1, 600, 400, 'look');
  act = true;
  r.touch.up(1);
  assert.deepEqual(r.actions, [], 'pressed while actions were off: the lift fires nothing');
  r.touch.down(2, 600, 400, 'look');
  r.touch.move(2, 640, 400);
  assert.equal(r.looks.length, 1, 'looking still turns where it may move (the look at a finished board)');
  r.touch.up(2);
  move = false;
  r.touch.down(3, 100, 400, 'stick');
  r.touch.move(3, 100, 0);
  assert.deepEqual(r.touch.stick, { f: 0, r: 0 }, 'no stick while nothing moves');
  r.touch.down(4, 600, 400, 'look');
  r.touch.move(4, 700, 400);
  assert.equal(r.looks.length, 1, 'no look while nothing moves');
});

test('reset and cancel drop held touches without firing: a pending tap, a long-press timer, a chord, the stick', () => {
  const { touch, actions, clock, mouse } = rig();
  touch.down(1, 100, 500, 'stick');
  touch.move(1, 100, 400);
  touch.down(2, 600, 400, 'look');
  touch.down(3, 700, 400, 'look');
  touch.reset();
  assert.equal(mouse.left || mouse.right || mouse.toggle, false);
  assert.deepEqual(touch.stick, { f: 0, r: 0 });
  assert.equal(touch.holding, false);
  touch.up(2); touch.up(3); touch.up(1);
  clock.advance(LONG_PRESS_MS);
  assert.deepEqual(actions, [], 'nothing fired, nothing on the late lifts or the timer');
  touch.down(4, 600, 400, 'look');
  touch.cancel(4);
  clock.advance(LONG_PRESS_MS);
  touch.up(4);
  assert.deepEqual(actions, [], 'the browser took the touch: nothing');
});

test('MouseActions.cancel forgets one held button without firing, every other rule unchanged', () => {
  const out = [];
  const m = new MouseActions((t) => out.push(t), () => true);
  m.down(0); m.cancel(0); m.up(0);
  assert.deepEqual(out, [], 'a cancelled press fires nothing on its release');
  m.down(0); m.down(2); m.cancel(0); m.up(2);
  assert.deepEqual(out, ['right'], 'the other button acts alone');
  m.down(0); m.down(2); m.up(0); m.cancel(2);
  assert.equal(m.toggle, false, 'the toggle clears with the last held button');
  m.down(0); m.up(0);
  assert.deepEqual(out, ['right', 'chord', 'left']);
});

// ---------------------------------------------------------------- the toolbar's view modes

test('the toolbar\'s toggles feed Controls as one more source; with none on, Controls equals the keyboard and controller exactly', () => {
  const kb = { shift: false, space: false, ctrl: false };
  const c = new Controls(kb);
  for (const s of [false, true]) for (const p of [false, true]) {
    kb.shift = s; c.pad.shift = p;
    assert.equal(c.shift, s || p, 'no toggle on: keyboard OR controller');
  }
  kb.shift = false; c.pad.shift = false;
  for (const mode of ['shift', 'space', 'ctrl']) {
    assert.equal(c[mode], false);
    c.toggle(mode);
    assert.equal(c.touch[mode], true);
    assert.equal(c[mode], true, `${mode} latched`);
    c.releasePad();
    assert.equal(c[mode], true, 'a pause (releasePad) keeps the latch');
    c.toggle(mode);
    assert.equal(c[mode], false, `${mode} cleared`);
  }
  c.toggle('shift'); c.toggle('ctrl');
  c.clearTouch();
  assert.deepEqual(c.touch, { shift: false, space: false, ctrl: false }, 'a new game clears them');
  assert.throws(() => c.toggle('alt'));
});

// ---------------------------------------------------------------- Orbit

test('Orbit: the stick\'s vertical axis dollies at Orbit\'s stick rate (up is in), its horizontal axis does nothing; the drag rotates', () => {
  const cam = new FlyCamera();
  const orbit = new OrbitCamera(cam);
  orbit.setRange({ min: 4, max: 500 });
  cam.place({ x: 0, y: 0, z: -100, yaw: Math.PI, pitch: 0 });
  orbit.enter();
  const d0 = orbit.dist;
  applyTouchStick({ cam, dt: 0.5, stick: { f: 1, r: 1 }, orbit });
  close(orbit.dist, d0 - ORBIT_DOLLY_SPEED * 0.5, 'in at the stick rate');
  const yaw = cam.yaw;
  applyTouchStick({ cam, dt: 0.5, stick: { f: 0, r: 1 }, orbit });
  close(orbit.dist, d0 - ORBIT_DOLLY_SPEED * 0.5, 'sideways does not dolly');
  assert.equal(cam.yaw, yaw, 'nor rotate');
  orbit.dollyAxis(0, 0);
  const ref = new OrbitCamera(new FlyCamera());
  ref.setRange({ min: 4, max: 500 });
  ref.cam.place({ x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch });
  ref.enter();
  const { touch } = rig({});
  const looked = createTouch3D({ mouse: new MouseActions(() => {}, () => true), clock: fakeClock(), onLook: (dx, dy) => orbit.look(dx, dy) });
  looked.down(1, 600, 400, 'look');
  looked.move(1, 650, 420);
  ref.look(50, 20);
  assert.deepEqual([cam.x, cam.y, cam.z, cam.yaw, cam.pitch], [ref.cam.x, ref.cam.y, ref.cam.z, ref.cam.yaw, ref.cam.pitch], 'the drag rotates as the mouse does');
  touch.reset();
});

test('Fly: the stick moves as the controller\'s left stick does, unchanged by Orbit\'s mapping', () => {
  const a = new FlyCamera();
  const b = new FlyCamera();
  a.place({ x: 1, y: 2, z: 3, yaw: 2, pitch: 0.4 });
  b.place({ x: 1, y: 2, z: 3, yaw: 2, pitch: 0.4 });
  applyTouchStick({ cam: a, dt: 0.1, stick: { f: 0.5, r: -0.3 }, orbit: null });
  b.moveAxes(0.1, 0.5, -0.3, 0);
  assert.deepEqual([a.x, a.y, a.z], [b.x, b.y, b.z]);
});

// ---------------------------------------------------------------- the other inputs, unchanged

test('mouse, trigger and keyboard sequences give the action streams they gave before', () => {
  const run = (seq) => {
    const out = [];
    const m = new MouseActions((t) => out.push(t), () => true);
    const k = new KeyActions(m);
    for (const [kind, op, a] of seq) {
      if (kind === 'm') m[op](a);
      else k[op](a);
    }
    return out;
  };
  // Pinned streams, written before the touch controls: the mouse buttons (and the triggers, which press the same buttons).
  assert.deepEqual(run([['m', 'down', 0], ['m', 'up', 0]]), ['left']);
  assert.deepEqual(run([['m', 'down', 2], ['m', 'up', 2]]), ['right']);
  assert.deepEqual(run([['m', 'down', 0], ['m', 'down', 2], ['m', 'up', 0], ['m', 'up', 2]]), ['chord']);
  assert.deepEqual(run([['m', 'down', 2], ['m', 'down', 0], ['m', 'up', 0], ['m', 'up', 2]]), ['chord']);
  assert.deepEqual(run([['m', 'down', 0], ['m', 'down', 2], ['m', 'up', 2], ['m', 'down', 2], ['m', 'up', 2], ['m', 'up', 0]]), ['chord', 'left']);
  assert.deepEqual(run([['m', 'up', 0], ['m', 'down', 1], ['m', 'up', 1]]), []);
  assert.deepEqual(run([['m', 'down', 0], ['m', 'reset'], ['m', 'up', 0]]), []);
  // The keyboard's Enter and '.
  assert.deepEqual(run([['k', 'down', 'Enter'], ['k', 'up', 'Enter']]), ['left']);
  assert.deepEqual(run([['k', 'down', 'Quote'], ['k', 'up', 'Quote']]), ['right']);
  assert.deepEqual(run([['k', 'down', 'Enter'], ['k', 'down', 'Quote'], ['k', 'up', 'Quote'], ['k', 'up', 'Enter']]), ['chord']);
  assert.deepEqual(run([['k', 'down', 'Enter'], ['m', 'down', 2], ['m', 'up', 2], ['k', 'up', 'Enter']]), ['chord']);
});

// ---------------------------------------------------------------- the module's shape and wiring

test('the gesture machine is DOM-free at import and builds no second release state machine', () => {
  const src = read('js/touch-3d.js');
  const head = src.slice(0, src.indexOf('export function mountTouch3D'));
  assert.doesNotMatch(head, /\b(document|window|localStorage|requestAnimationFrame)\b/);
  assert.doesNotMatch(src, /onAction/, 'actions go through the MouseActions it is handed');
  assert.match(src, /stickCurve/);
  const main = read('js/main.js');
  assert.match(main, /createTouch3D\(\{[^]*?mouse,/, 'main hands the touch machine the mouse\'s own MouseActions');
  assert.match(main, /if \(COARSE_ONLY\)[^\n]*mountTouch3D/, 'mounted on a coarse-only device only');
});
