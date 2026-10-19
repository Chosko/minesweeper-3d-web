// The cell motion player (js/cell-motion.js): keyframe interpolation with the description's easing,
// a flip's midpoint, the after state once an animation ends, restart, the concurrency cap, dropping,
// a null description, and the player's isolation from game state, settings and media queries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createCellMotion, easingFunction, cubicBezier, MOTION_CAP } from '../js/cell-motion.js';
import { NAMED_EASINGS, CELL_EVENTS } from '../js/themes/board-module.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// A player on a fake clock.
function player(options = {}) {
  const clock = { t: 1000 };
  const p = createCellMotion({ now: () => clock.t, ...options });
  return { p, clock };
}
const track = (property, keyframes, extra = {}) => ({ property, keyframes, ...extra });
const linear = (duration, tracks) => ({ duration, easing: 'linear', tracks });

// ---------------------------------------------------------------- easing

test('the named easings are the CSS curves, linear the identity', () => {
  for (const name of NAMED_EASINGS) {
    const f = easingFunction(name);
    near(f(0), 0);
    near(f(1), 1);
  }
  near(easingFunction('linear')(0.3), 0.3);
  near(easingFunction('ease')(0.5), cubicBezier(0.25, 0.1, 0.25, 1)(0.5));
  near(easingFunction('ease-in')(0.5), cubicBezier(0.42, 0, 1, 1)(0.5));
  near(easingFunction('ease-out')(0.5), cubicBezier(0, 0, 0.58, 1)(0.5));
  near(easingFunction('ease-in-out')(0.5), 0.5, 1e-4);
});

test('a cubic Bézier easing solves x for t and answers y', () => {
  const f = cubicBezier(0.42, 0, 0.58, 1);
  near(f(0.5), 0.5, 1e-5);
  assert.ok(f(0.25) < 0.25 && f(0.75) > 0.75);
  // The control points as the identity.
  const id = cubicBezier(1 / 3, 1 / 3, 2 / 3, 2 / 3);
  for (const x of [0.1, 0.37, 0.8]) near(id(x), x, 1e-5);
  // A spring overshoots above 1 before settling.
  const spring = easingFunction([0.34, 1.56, 0.64, 1]);
  assert.ok([0.5, 0.6, 0.7, 0.8].some((x) => spring(x) > 1));
  near(spring(1), 1);
});

// ---------------------------------------------------------------- interpolation

test('a track interpolates between its keyframes and holds its ends', () => {
  const { p, clock } = player();
  p.start(7, 'press', 'closed', 'sunk', linear(100, [track('scale', [{ at: 20, value: 1 }, { at: 60, value: 2 }, { at: 100, value: 0 }])]));
  const at = (ms) => p.valuesAt(1000 + ms).get(7);
  near(at(0).scale, 1);
  near(at(10).scale, 1);
  near(at(40).scale, 1.5);
  near(at(60).scale, 2);
  near(at(80).scale, 1);
  assert.equal(clock.t, 1000);
});

test('the description easing shapes every keyframe segment', () => {
  const { p } = player();
  const easing = [0.42, 0, 1, 1];
  p.start(1, 'release', 'sunk', 'closed', { duration: 200, easing, tracks: [track('depth', [{ at: 0, value: 0 }, { at: 100, value: 1 }, { at: 200, value: 3 }])] });
  const e = cubicBezier(...easing);
  near(p.valuesAt(1000 + 50).get(1).depth, e(0.5));
  near(p.valuesAt(1000 + 150).get(1).depth, 1 + 2 * e(0.5));
});

test('every vocabulary property interpolates: offset per axis, rotation about its axis, brightness, opacity', () => {
  const { p } = player();
  p.start(3, 'flag', 'closed', 'flag', linear(100, [
    track('offset', [{ at: 0, value: { x: 0, y: 0 } }, { at: 100, value: { x: 1, y: -1, z: 0.5 } }]),
    track('rotation', [{ at: 0, value: 0 }, { at: 100, value: 90 }], { axis: [0, 1, 0] }),
    track('brightness', [{ at: 0, value: 1 }, { at: 100, value: 2 }]),
    track('opacity', [{ at: 0, value: 1 }, { at: 100, value: 0 }]),
  ]));
  const v = p.valuesAt(1000 + 50).get(3);
  assert.deepEqual(v.offset, { x: 0.5, y: -0.5, z: 0.25 });
  assert.deepEqual(v.rotation.axis, [0, 1, 0]);
  near(v.rotation.angle, 45);
  near(v.brightness, 1.5);
  near(v.opacity, 0.5);
  assert.equal(v.event, 'flag');
});

test("a property no track animates rests: scale 1, no offset or rotation, brightness and opacity 1, the face's own depth", () => {
  const { p } = player();
  p.start(4, 'reveal', 'closed', 'revealed', linear(100, [track('scale', [{ at: 0, value: 1 }])]));
  const v = p.valuesAt(1000 + 10).get(4);
  assert.deepEqual(v.offset, { x: 0, y: 0, z: 0 });
  near(v.rotation.angle, 0);
  assert.equal(v.depth, null);
  assert.equal(v.brightness, 1);
  assert.equal(v.opacity, 1);
});

// ---------------------------------------------------------------- the face shown

test('a flip shows the before state until its midpoint and the after state from then on', () => {
  const { p } = player();
  p.start(5, 'reveal', 'closed', 'revealed', linear(160, [track('rotation', [{ at: 0, value: 0 }, { at: 120, value: 0 }], { axis: [1, 0, 0], flip: true })]));
  assert.equal(p.valuesAt(1000 + 0).get(5).face, 'closed');
  assert.equal(p.valuesAt(1000 + 59).get(5).face, 'closed');
  assert.equal(p.valuesAt(1000 + 60).get(5).face, 'revealed');
  assert.equal(p.valuesAt(1000 + 150).get(5).face, 'revealed');
});

test('a flip midpoint is halfway between its first and last keyframe, not the duration', () => {
  const { p } = player();
  p.start(5, 'flag', 'closed', 'flag', linear(200, [track('rotation', [{ at: 40, value: 0 }, { at: 80, value: 180 }], { axis: [0, 1, 0], flip: true })]));
  assert.equal(p.valuesAt(1000 + 59).get(5).face, 'closed');
  assert.equal(p.valuesAt(1000 + 60).get(5).face, 'flag');
});

test('without a flip the cell shows its after state throughout', () => {
  const { p } = player();
  p.start(6, 'press', 'closed', 'sunk', linear(90, [track('depth', [{ at: 0, value: 1 }, { at: 90, value: 0 }])]));
  assert.equal(p.valuesAt(1000).get(6).face, 'sunk');
});

test('a cell shows its after state once its animation ends: it leaves the animating set', () => {
  const { p } = player();
  p.start(8, 'reveal', 'closed', 'revealed', linear(100, [track('opacity', [{ at: 0, value: 0 }, { at: 100, value: 1 }])]));
  assert.equal(p.animating(1000 + 99), true);
  assert.ok(p.valuesAt(1000 + 99).has(8));
  assert.equal(p.valuesAt(1000 + 100).has(8), false);
  assert.equal(p.animating(1000 + 100), false);
});

test('animating() reads the player clock when given no time', () => {
  const { p, clock } = player();
  assert.equal(p.animating(), false);
  p.start(1, 'press', 'closed', 'sunk', linear(50, [track('scale', [{ at: 0, value: 1 }])]));
  assert.equal(p.animating(), true);
  clock.t += 50;
  assert.equal(p.animating(), false);
});

// ---------------------------------------------------------------- restart, null, cap, drop

test('a second event on an animating cell restarts it from the new state', () => {
  const { p, clock } = player();
  const d = linear(100, [track('scale', [{ at: 0, value: 0 }, { at: 100, value: 1 }])]);
  p.start(2, 'press', 'closed', 'sunk', d);
  clock.t += 60;
  p.start(2, 'release', 'sunk', 'closed', d);
  const v = p.valuesAt(clock.t + 10).get(2);
  near(v.scale, 0.1);
  assert.equal(v.event, 'release');
  assert.equal(v.face, 'closed');
  assert.equal(p.valuesAt(clock.t + 10).size, 1);
  assert.ok(p.valuesAt(clock.t + 99).has(2));
});

test('a null description starts nothing, and an animating cell shows its new state at once', () => {
  const { p } = player();
  assert.equal(p.start(1, 'unflag', 'flag', 'closed', null), false);
  assert.equal(p.animating(), false);
  p.start(2, 'press', 'closed', 'sunk', linear(100, [track('scale', [{ at: 0, value: 1 }])]));
  assert.equal(p.start(2, 'reveal', 'sunk', 'revealed', null), false);
  assert.equal(p.valuesAt(1000).has(2), false);
});

test('past the cap a cell shows its new state at once; a restart within the cap still plays', () => {
  const { p, clock } = player({ cap: 3 });
  const d = linear(100, [track('scale', [{ at: 0, value: 1 }])]);
  for (const cell of [1, 2, 3]) assert.equal(p.start(cell, 'reveal', 'closed', 'revealed', d), true);
  assert.equal(p.start(4, 'reveal', 'closed', 'revealed', d), false);
  assert.deepEqual([...p.valuesAt(clock.t).keys()].sort(), [1, 2, 3]);
  assert.equal(p.start(2, 'flag', 'closed', 'flag', d), true);
  clock.t += 100;
  assert.equal(p.start(4, 'reveal', 'closed', 'revealed', d), true, 'ended animations free their slots');
});

test('the shipped cap is a positive whole number and the default', () => {
  assert.ok(Number.isInteger(MOTION_CAP) && MOTION_CAP > 0);
  const { p } = player();
  const d = linear(100, [track('scale', [{ at: 0, value: 1 }])]);
  let started = 0;
  for (let cell = 0; cell < 100 * 100; cell++) if (p.start(cell, 'reveal', 'closed', 'revealed', d)) started++;
  assert.equal(started, MOTION_CAP);
  assert.equal(p.valuesAt(1000).size, MOTION_CAP);
});

test('dropAll() drops every running animation', () => {
  const { p } = player();
  const d = linear(100, [track('scale', [{ at: 0, value: 1 }])]);
  for (const cell of [1, 2, 3]) p.start(cell, 'reveal', 'closed', 'revealed', d);
  p.dropAll();
  assert.equal(p.animating(), false);
  assert.equal(p.valuesAt(1000).size, 0);
});

test('every Joyful tiles description plays and ends in its after state', () => {
  const { p } = player();
  CELL_EVENTS.forEach((event, cell) => {
    const d = JOYFUL.motion[event];
    if (!d) return;
    assert.equal(p.start(cell, event, 'before', 'after', d), true);
    const v = p.valuesAt(1000 + d.duration / 2).get(cell);
    for (const k of ['scale', 'brightness', 'opacity']) assert.ok(Number.isFinite(v[k]), `${event}.${k}`);
    assert.equal(p.valuesAt(1000 + d.duration).has(cell), false);
  });
});

// ---------------------------------------------------------------- isolation

test('the player is DOM-free and reads no game state, timer, replay, settings or media query', () => {
  const src = readFileSync(`${ROOT}js/cell-motion.js`, 'utf8');
  const imports = [...src.matchAll(/^\s*import\s[^;]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.deepEqual(imports, [], 'imports nothing');
  for (const banned of ['matchMedia', 'prefers-reduced-motion', 'document', 'window', 'settings', 'localStorage', 'replay', 'engine', 'session']) {
    assert.ok(!new RegExp(`\\b${banned}\\b`).test(src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), `mentions ${banned}`);
  }
});
