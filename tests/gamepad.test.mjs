import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stickCurve, triggerHeld, Repeat, padFamily, padGlyphs, pickInDirection, GamepadReader, BTN,
  STICK_DEADZONE, PAD_PRESS, PAD_FLAG, PAD_BOOM, padPulse,
} from '../js/gamepad.js';
import { FlyCamera, MouseActions, MOVE_SPEED, LOOK_DEG_PER_PX, PAD_LOOK_DEG_PER_S } from '../js/input.js';
import { Controls } from '../js/controls.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

// ---------- stick curve ----------
test('stickCurve: radial deadzone', () => {
  assert.deepEqual(stickCurve(0, 0), [0, 0]);
  assert.deepEqual(stickCurve(0.1, 0.1), [0, 0]); // |v| = 0.141 < 0.15
  assert.deepEqual(stickCurve(STICK_DEADZONE, 0), [0, 0]);
  assert.deepEqual(stickCurve(NaN, undefined), [0, 0]);
  const [x, y] = stickCurve(0.12, 0.12); // |v| = 0.17 > 0.15 (each axis below the deadzone)
  assert.ok(x > 0 && y > 0);
});

test('stickCurve: rescaled, exponent 2, direction kept, clamped to 1', () => {
  const m = 0.15 + 0.85 * 0.5; // halfway through the live zone
  const [x, y] = stickCurve(m, 0);
  close(x, 0.25); close(y, 0);
  const [a, b] = stickCurve(0, -1);
  close(a, 0); close(b, -1);
  const [c, d] = stickCurve(1, 1); // corner of a square gate: magnitude clamped to 1
  close(Math.hypot(c, d), 1); close(c, d);
  // monotonic
  let prev = 0;
  for (let v = 0.16; v <= 1; v += 0.01) { const [o] = stickCurve(v, 0); assert.ok(o >= prev); prev = o; }
});

// ---------- triggers ----------
test('triggerHeld: hysteresis (press > 0.5, release < 0.3)', () => {
  let h = false;
  const seq = [[0.2, false], [0.5, false], [0.51, true], [0.4, true], [0.3, true], [0.29, false], [0.45, false], [0.9, true], [0, false]];
  for (const [v, want] of seq) { h = triggerHeld(h, v); assert.equal(h, want, `value ${v}`); }
  assert.equal(triggerHeld(false, undefined), false);
  assert.equal(triggerHeld(true, NaN), false);
});

// ---------- repeat ----------
test('Repeat: fires on press, then after the delay at the interval', () => {
  const r = new Repeat(400, 50);
  assert.equal(r.update(true, 0), 1);
  assert.equal(r.update(true, 399), 0);
  assert.equal(r.update(true, 400), 1);
  assert.equal(r.update(true, 449), 0);
  assert.equal(r.update(true, 450), 1);
  assert.equal(r.update(false, 460), 0);
  assert.equal(r.update(true, 470), 1); // new press
  assert.ok(r.update(true, 10000) <= 4); // no burst after a stall
});

// ---------- glyphs ----------
test('padFamily: vendor ids and names (Chrome and Firefox id formats)', () => {
  const cases = [
    ['DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)', 'playstation'],
    ['054c-09cc-Wireless Controller', 'playstation'],
    ['Wireless Controller (DUALSHOCK 4)', 'playstation'],
    ['Xbox 360 Controller (XInput STANDARD GAMEPAD)', 'xbox'],
    ['045e-0b13-Xbox Wireless Controller', 'xbox'],
    ['Controller (Vendor: 045e Product: 02ea)', 'xbox'],
    ['Pro Controller (STANDARD GAMEPAD Vendor: 057e Product: 2009)', 'nintendo'],
    ['057e-2009-Pro Controller', 'nintendo'],
    ['Logitech Dual Action (STANDARD GAMEPAD Vendor: 046d Product: c216)', 'generic'],
    ['Generic USB Joystick (Vendor: 0079 Product: 054c)', 'generic'], // 054c as a product id is not Sony
    ['', 'generic'],
    [undefined, 'generic'],
  ];
  for (const [id, fam] of cases) assert.equal(padFamily(id), fam, String(id));
});

test('padGlyphs: labels per family', () => {
  const ps = padGlyphs('Vendor: 054c');
  assert.deepEqual([ps.a, ps.b, ps.x, ps.y, ps.lb, ps.rb, ps.lt, ps.rt], ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2']);
  const xb = padGlyphs('Xbox');
  assert.deepEqual([xb.a, xb.b, xb.x, xb.y, xb.lb, xb.rb, xb.lt, xb.rt], ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT']);
  assert.equal(padGlyphs('057e-2009-Pro Controller').rt, 'ZR');
  assert.equal(padGlyphs('whatever').name, 'Controller');
});

// ---------- spatial navigation ----------
test('pickInDirection: nearest in the direction, prefers aligned candidates', () => {
  const R = (l, t, w = 100, h = 40) => ({ left: l, top: t, right: l + w, bottom: t + h });
  // 3 columns x 2 rows grid + a wide button below the right column
  const grid = {};
  for (const [name, l, t] of [['a1', 0, 0], ['b1', 120, 0], ['c1', 240, 0], ['a2', 0, 60], ['b2', 120, 60], ['c2', 240, 60], ['go', 260, 140]]) grid[name] = R(l, t);
  const cands = (except) => Object.entries(grid).filter(([k]) => k !== except).map(([k, r]) => ({ rect: r, item: k }));
  assert.equal(pickInDirection(grid.a1, cands('a1'), 'right'), 'b1');
  assert.equal(pickInDirection(grid.a1, cands('a1'), 'down'), 'a2');
  assert.equal(pickInDirection(grid.b2, cands('b2'), 'up'), 'b1');
  assert.equal(pickInDirection(grid.c2, cands('c2'), 'down'), 'go');
  assert.equal(pickInDirection(grid.go, cands('go'), 'up'), 'c2');
  assert.equal(pickInDirection(grid.a1, cands('a1'), 'left'), null);
  assert.equal(pickInDirection(grid.a1, cands('a1'), 'up'), null);
});

test('pickInDirection: only a candidate overlapping on the other axis or within 45° of the direction counts', () => {
  const R = (l, t, w = 100, h = 40) => ({ left: l, top: t, right: l + w, bottom: t + h });
  const from = R(0, 0); // centre (50, 20)
  const one = (rect, dir) => pickInDirection(from, [{ rect, item: 'x' }], dir);
  // a toggle far below-right: past the control on the right, but well outside the right cone
  assert.equal(one(R(150, 300, 40, 20), 'right'), null);
  assert.equal(one(R(150, 300, 40, 20), 'down'), 'x', 'inside the down cone');
  // overlapping on the perpendicular axis counts however far it lies
  assert.equal(one(R(200, 30, 100, 40), 'right'), 'x');
  assert.equal(one(R(90, 400, 40, 20), 'down'), 'x');
  // centre exactly on the 45° line counts, just past it does not
  assert.equal(one(R(230, 200, 40, 0), 'right'), 'x'); // centre (250, 200): dx 200, dy 180
  assert.equal(one(R(130, 200, 40, 0), 'right'), null); // centre (150, 200): dx 100, dy 180
  // inside the cone, scoring is unchanged: gap + 2 x perpendicular gap, so a near diagonal one beats a far aligned one
  const pick = pickInDirection(from, [{ rect: R(150, 60, 40, 40), item: 'diag' }, { rect: R(300, 0), item: 'aligned' }], 'right');
  assert.equal(pick, 'diag');
});

// ---------- rumble ----------
function fakeActuator({ reject = false, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    playEffect(type, params) {
      calls.push([type, params]);
      if (throws) throw new Error('unsupported');
      return reject ? Promise.reject(new Error('preempted')) : Promise.resolve('complete');
    },
  };
}
function fakeTimers() {
  const queue = [];
  return {
    queue,
    setTimeout: (fn, ms) => { queue.push({ fn, ms }); return queue.length; },
    run() { for (const t of queue.splice(0).sort((a, b) => a.ms - b.ms)) t.fn(); },
  };
}

test('pulse constants: a 10 ms press pulse, a flag\'s two pulses the second after the first ends, the explosion unchanged', () => {
  assert.equal(PAD_PRESS.length, 1);
  assert.equal(PAD_PRESS[0].at, 0);
  assert.equal(PAD_PRESS[0].effect.duration, 10);
  assert.equal(PAD_FLAG.length, 2);
  assert.equal(PAD_FLAG[0].at, 0);
  assert.ok(PAD_FLAG[1].at > PAD_FLAG[0].at + PAD_FLAG[0].effect.duration, 'the second starts after the first ends');
  assert.deepEqual(PAD_BOOM, [{ at: 0, effect: { duration: 400, strongMagnitude: 1, weakMagnitude: 0.6 } }]);
  for (const p of [PAD_PRESS, PAD_FLAG, PAD_BOOM]) assert.ok(Object.isFrozen(p));
});

test('padPulse plays each pulse on the pad\'s actuator in order, the later ones on a timer', async () => {
  const a = fakeActuator();
  const timers = fakeTimers();
  padPulse({ vibrationActuator: a }, PAD_PRESS, timers);
  assert.deepEqual(a.calls, [['dual-rumble', PAD_PRESS[0].effect]]);
  assert.equal(timers.queue.length, 0, 'one pulse, nothing scheduled');
  a.calls.length = 0;
  padPulse({ vibrationActuator: a }, PAD_FLAG, timers);
  assert.deepEqual(a.calls, [['dual-rumble', PAD_FLAG[0].effect]], 'the first pulse at once');
  assert.deepEqual(timers.queue.map((t) => t.ms), [PAD_FLAG[1].at]);
  timers.run();
  assert.deepEqual(a.calls, [['dual-rumble', PAD_FLAG[0].effect], ['dual-rumble', PAD_FLAG[1].effect]]);
});

test('padPulse is silent with no pad, no actuator, no playEffect, and swallows a rejected or thrown effect', async () => {
  const timers = fakeTimers();
  assert.doesNotThrow(() => padPulse(null, PAD_FLAG, timers));
  assert.doesNotThrow(() => padPulse({}, PAD_FLAG, timers));
  assert.doesNotThrow(() => padPulse({ vibrationActuator: {} }, PAD_FLAG, timers));
  assert.equal(timers.queue.length, 0, 'nothing scheduled without an actuator');
  const rejected = [];
  const onRejection = (e) => rejected.push(e);
  process.on('unhandledRejection', onRejection);
  try {
    const r = fakeActuator({ reject: true });
    padPulse({ vibrationActuator: r }, PAD_FLAG, timers);
    timers.run();
    assert.equal(r.calls.length, 2);
    const t = fakeActuator({ throws: true });
    assert.doesNotThrow(() => { padPulse({ vibrationActuator: t }, PAD_FLAG, timers); timers.run(); });
    assert.equal(t.calls.length, 2);
    await new Promise((res) => setTimeout(res, 10));
  } finally {
    process.off('unhandledRejection', onRejection);
  }
  assert.deepEqual(rejected, []);
});

// ---------- reader ----------
function fakePad(index = 0, id = 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)') {
  return {
    index, id, connected: true, mapping: 'standard', timestamp: 0,
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    axes: [0, 0, 0, 0],
  };
}
const press = (p, b, v = 1) => { p.buttons[b] = { pressed: v > 0.5, touched: v > 0, value: v }; };

test('GamepadReader: connect, edges, trigger hysteresis, disconnect releases', () => {
  const list = [null, null, null, null];
  const ev = [];
  const r = new GamepadReader({
    getGamepads: () => list,
    onConnect: (p) => ev.push(['connect', p.index]),
    onDisconnect: (i) => ev.push(['disconnect', i.index, i.wasActive]),
  });
  assert.equal(r.poll().pad, null);
  const p = fakePad(0); list[0] = p;
  let s = r.poll();
  assert.deepEqual(ev, [['connect', 0]]);
  assert.equal(s.pad, p);
  press(p, BTN.A);
  s = r.poll(); assert.ok(s.pressed[BTN.A] && s.held[BTN.A]);
  s = r.poll(); assert.ok(!s.pressed[BTN.A] && s.held[BTN.A]);
  // trigger hysteresis through the reader
  p.buttons[BTN.RT] = { pressed: true, value: 0.45 }; s = r.poll(); assert.ok(!s.held[BTN.RT]);
  p.buttons[BTN.RT] = { pressed: true, value: 0.6 }; s = r.poll(); assert.ok(s.pressed[BTN.RT]);
  p.buttons[BTN.RT] = { pressed: true, value: 0.35 }; s = r.poll(); assert.ok(s.held[BTN.RT] && !s.released[BTN.RT]);
  // unplug: everything held is released, onDisconnect reports it was active
  list[0] = null;
  s = r.poll();
  assert.deepEqual(ev.at(-1), ['disconnect', 0, true]);
  assert.ok(s.released[BTN.A] && s.released[BTN.RT]);
  assert.equal(s.pad, null);
});

test('GamepadReader: follows the most recently active pad', () => {
  const a = fakePad(0), b = fakePad(1, 'DualSense Wireless Controller (Vendor: 054c Product: 0ce6)');
  const list = [a, b];
  const changes = [];
  const r = new GamepadReader({ getGamepads: () => list, onActiveChange: (p) => changes.push(p && p.index) });
  assert.equal(r.poll().pad, a);
  press(b, BTN.X);
  let s = r.poll();
  assert.equal(s.pad, b); assert.ok(s.pressed[BTN.X]);
  press(a, BTN.A); // a starts giving input while b is still held: a becomes active, b's X is released
  s = r.poll();
  assert.equal(s.pad, a); assert.ok(s.released[BTN.X] && s.pressed[BTN.A]);
  s = r.poll(); assert.equal(s.pad, a); // no flapping while both are held
  assert.deepEqual(changes, [0, 1, 0]);
});

// ---------- camera ----------
test('FlyCamera.moveAxes: same vectors as move(), speed capped at 50 u/s', () => {
  const yaws = [Math.PI, 0.3, -2.1], pitches = [0, 0.7, -1.2];
  for (const yaw of yaws) for (const pitch of pitches) {
    for (const [keys, f, r, u] of [[{ w: true }, 1, 0, 0], [{ s: true }, -1, 0, 0], [{ a: true }, 0, -1, 0], [{ d: true }, 0, 1, 0], [{ e: true }, 0, 0, 1], [{ q: true }, 0, 0, -1]]) {
      const k = new FlyCamera(); k.yaw = yaw; k.pitch = pitch;
      const m = new FlyCamera(); m.yaw = yaw; m.pitch = pitch;
      k.move(0.1, keys); m.moveAxes(0.1, f, r, u);
      close(m.x, k.x, 1e-12); close(m.y, k.y, 1e-12); close(m.z, k.z, 1e-12);
    }
    // diagonal input never exceeds MOVE_SPEED
    const c = new FlyCamera(); c.yaw = yaw; c.pitch = pitch;
    c.moveAxes(1, 1, 1, 1);
    assert.ok(Math.hypot(c.x, c.y, c.z) <= MOVE_SPEED + 1e-9);
    // half deflection = half speed (straight forward)
    const h = new FlyCamera(); h.yaw = yaw; h.pitch = pitch; h.moveAxes(1, 0.5, 0, 0);
    close(Math.hypot(h.x, h.y, h.z), MOVE_SPEED / 2, 1e-9);
  }
  const z = new FlyCamera(); z.moveAxes(1, 0, 0, 0);
  assert.deepEqual([z.x, z.y, z.z], [0, 0, 0]);
});

test('FlyCamera.lookAxes: 180 deg/s x sensitivity, invertY respected, pitch clamped', () => {
  const c = new FlyCamera();
  const yaw0 = c.yaw;
  c.lookAxes(0.5, 1, 0);
  close(c.yaw - yaw0, Math.PI / 2, 1e-12); // 90 deg in half a second
  c.sensitivity = 2; c.lookAxes(0.25, 0, 0.5);
  close(c.pitch, (PAD_LOOK_DEG_PER_S * 0.25 * 0.5 * 2) * Math.PI / 180, 1e-12); // down = +pitch
  const i = new FlyCamera(); i.invertY = true; i.lookAxes(0.1, 0, 1);
  assert.ok(i.pitch < 0);
  i.lookAxes(10, 0, 1); close(i.pitch, -Math.PI / 2);
  assert.ok(LOOK_DEG_PER_PX > 0);
});

// ---------- controls + MouseActions (trigger sequences) ----------
test('Controls: unions keyboard and controller modes', () => {
  const kb = { shift: false, space: true, ctrl: false };
  const c = new Controls(kb);
  assert.deepEqual([c.shift, c.space, c.ctrl], [false, true, false]);
  c.pad.shift = true; c.pad.ctrl = true;
  assert.deepEqual([c.shift, c.space, c.ctrl], [true, true, true]);
  c.axes.f = 0.5; assert.ok(c.hasAxes);
  c.releasePad();
  assert.deepEqual([c.shift, c.space, c.ctrl, c.hasAxes], [false, true, false, false]);
});

test('MouseActions driven by triggers: RT reveal, LT flag, both = one chord', () => {
  const run = (ops) => {
    const out = [];
    const m = new MouseActions((t) => out.push(t), () => true);
    for (const [kind, b] of ops) m[kind](b);
    return out;
  };
  assert.deepEqual(run([['down', 0], ['up', 0]]), ['left']);
  assert.deepEqual(run([['down', 2], ['up', 2]]), ['right']);
  // both triggers, released in either order or in the same frame (RT processed first)
  assert.deepEqual(run([['down', 0], ['down', 2], ['up', 0], ['up', 2]]), ['chord']);
  assert.deepEqual(run([['down', 2], ['down', 0], ['up', 2], ['up', 0]]), ['chord']);
  // chord then re-press one trigger: the toggle was cleared, a normal action follows
  assert.deepEqual(run([['down', 0], ['down', 2], ['up', 2], ['up', 0], ['down', 0], ['up', 0]]), ['chord', 'left']);
});
