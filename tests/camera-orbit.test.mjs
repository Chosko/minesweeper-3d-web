// The orbit camera (task 146, I-15): the Camera setting's Orbit keeps the board centred. The pose is
// yaw, pitch and a distance to the board centre, written into FlyCamera's x, y, z, yaw, pitch so
// everything that reads the camera reads it unchanged. Rotation goes through FlyCamera.look, the dolly
// moves along the view line within [one lattice pitch, three spawn distances], and the crosshair picks
// along the camera-to-centre line. Pure objects are checked directly; the wiring in js/main.js as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FlyCamera, OrbitCamera, KeyLook, orbitRange, spawnPose, LOOK_DEG_PER_PX, PAD_LOOK_DEG_PER_S, MOVE_SPEED,
  ORBIT_MIN_PITCHES, ORBIT_MAX_SPAWNS, ORBIT_WHEEL_FACTOR, ORBIT_DOLLY_SPEED, SPACING_START, keyLookDeg,
} from '../js/input.js';
import { pickCell, pickCellBrute } from '../js/picking.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAIN = readFileSync(join(ROOT, 'js/main.js'), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
const DEG = Math.PI / 180;
const close = (a, b, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) < eps, `${what} ${a} != ${b}`);
const viewDir = (yaw, pitch) => [Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];
const dist = (c) => Math.hypot(c.x, c.y, c.z);
const fakeView = (X, Y, Z) => ({ X, Y, Z, n: X * Y * Z, unlinked: new Uint8Array(X * Y * Z), pressed: new Uint8Array(X * Y * Z) });

/** An orbit over a fresh FlyCamera with a wide range, at yaw / pitch / distance. */
function orbitAt(yaw, pitch, d, range = { min: 1, max: 1000 }) {
  const cam = new FlyCamera();
  const orbit = new OrbitCamera(cam);
  orbit.setRange(range);
  cam.place({ x: 0, y: 0, z: -d, yaw, pitch });
  orbit.enter();
  return { cam, orbit };
}

/** The camera looks through the board centre: its view direction points from its position to the origin. */
function assertAimsAtCentre(cam, what = '') {
  const [fx, fy, fz] = viewDir(cam.yaw, cam.pitch);
  const d = dist(cam);
  close(-cam.x / d, fx, 1e-9, `${what} x`);
  close(-cam.y / d, fy, 1e-9, `${what} y`);
  close(-cam.z / d, fz, 1e-9, `${what} z`);
}

// ---------------------------------------------------------------- the pose

test('the orbit pose looks through the board centre from its distance, for any yaw, pitch and distance', () => {
  for (const pitchDeg of [-90, -60, -10, 0, 15, 45, 90]) {
    for (const yaw of [Math.PI, 0, 0.7, -2.3, 7]) {
      for (const d of [5, 37.5, 210]) {
        const { cam, orbit } = orbitAt(yaw, pitchDeg * DEG, d);
        close(dist(cam), d, 1e-9, 'distance');
        close(orbit.dist, d);
        assertAimsAtCentre(cam, `yaw ${yaw} pitch ${pitchDeg} d ${d}`);
        close(cam.yaw, yaw); close(cam.pitch, pitchDeg * DEG);
      }
    }
  }
});

test('the orbit writes FlyCamera\'s own pose fields, so apply, the sampler and the render signature read it unchanged', () => {
  const { cam } = orbitAt(1.2, 0.3, 40);
  for (const k of ['x', 'y', 'z', 'yaw', 'pitch']) assert.equal(typeof cam[k], 'number', k);
  assert.ok(cam instanceof FlyCamera, 'the orbit drives the one camera');
});

// ---------------------------------------------------------------- rotation

test('rotation: 0.2°/px through FlyCamera.look, mouse right turns the view right and swings the camera around the board', () => {
  const { cam, orbit } = orbitAt(Math.PI, 0, 50);
  orbit.look(100, 0);
  close(cam.yaw, Math.PI + 100 * LOOK_DEG_PER_PX * DEG, 1e-12, 'yaw grows as in Fly');
  close(dist(cam), 50, 1e-9, 'the distance holds');
  assertAimsAtCentre(cam);
  // facing +Z from z = -50, right is -X: the view turns toward -X, so the camera swings around to +X
  assert.ok(cam.x > 0, 'the camera swings around the board');
  const fly = new FlyCamera(); fly.yaw = Math.PI; fly.look(100, 0);
  close(cam.yaw, fly.yaw, 1e-12, 'the same yaw as Fly for the same input');
  orbit.look(0, 50);
  close(cam.pitch, 50 * LOOK_DEG_PER_PX * DEG, 1e-12, 'mouse down looks down, as in Fly');
  assert.ok(cam.y > 0, 'looking down onto the board from above');
  assertAimsAtCentre(cam);
});

test('rotation: Look sensitivity scales it, Invert Y flips its vertical part, the pitch clamp holds at ±90°', () => {
  const { cam, orbit } = orbitAt(Math.PI, 0, 50);
  cam.sensitivity = 2;
  orbit.look(10, 10);
  close(cam.yaw, Math.PI + 20 * LOOK_DEG_PER_PX * DEG, 1e-12);
  close(cam.pitch, 20 * LOOK_DEG_PER_PX * DEG, 1e-12);
  cam.invertY = true;
  orbit.look(0, 10);
  close(cam.pitch, 0, 1e-12, 'inverted: mouse down looks up');
  orbit.look(0, 1e6);
  close(cam.pitch, -Math.PI / 2, 1e-12, 'clamped');
  assertAimsAtCentre(cam);
  cam.invertY = false;
  orbit.look(0, 1e6);
  close(cam.pitch, Math.PI / 2, 1e-12, 'clamped');
  close(dist(cam), 50, 1e-9);
  close(cam.y, 50, 1e-9, 'straight above the centre');
});

test('rotation: the right stick turns at the controller look rate, the arrows through the ramped keyboard look', () => {
  const { cam, orbit } = orbitAt(Math.PI, 0, 50);
  orbit.lookAxes(0.5, 1, 0);
  close(cam.yaw, Math.PI + PAD_LOOK_DEG_PER_S * 0.5 * DEG, 1e-9, '180°/s at full deflection');
  assertAimsAtCentre(cam);
  const keys = orbitAt(Math.PI, 0, 50);
  const look = new KeyLook();
  for (let i = 0; i < 10; i++) look.update(keys.orbit, 0.1, 1, 0);
  close(keys.cam.yaw, Math.PI + keyLookDeg(1) * DEG, 1e-9, 'the ramp: 30°/s rising to 120°/s over 0.5 s');
  assertAimsAtCentre(keys.cam);
});

// ---------------------------------------------------------------- the dolly

test('the dolly range: one lattice pitch to three spawn distances, named constants', () => {
  assert.equal(ORBIT_MIN_PITCHES, 1);
  assert.equal(ORBIT_MAX_SPAWNS, 3);
  assert.equal(ORBIT_WHEEL_FACTOR, 0.9);
  assert.equal(ORBIT_DOLLY_SPEED, MOVE_SPEED);
  const box = { X: 6, Y: 5, Z: 4 };
  for (const spacing of [1.1, 2, 7]) {
    const r = orbitRange(box, spacing, 60, 16 / 9);
    close(r.min, 4 * spacing);
    const s = spawnPose(box, spacing, 60, 16 / 9);
    close(r.max, 3 * Math.hypot(s.x, s.y, s.z));
  }
});

test('the dolly clamps to its range, along the view line', () => {
  const { cam, orbit } = orbitAt(0.4, 0.2, 50, { min: 10, max: 100 });
  orbit.dolly(45);
  close(orbit.dist, 10, 1e-12, 'in: clamped at the minimum');
  close(dist(cam), 10, 1e-9);
  assertAimsAtCentre(cam);
  orbit.dolly(-1000);
  close(orbit.dist, 100, 1e-12, 'out: clamped at the maximum');
  assertAimsAtCentre(cam);
  const far = orbitAt(0.4, 0.2, 500, { min: 10, max: 100 });
  close(far.orbit.dist, 100, 1e-12, 'entering takes the distance clamped to the range');
  assertAimsAtCentre(far.cam);
});

test('the wheel dollies one notch at a time: up moves in by 0.9 a notch, down out by its inverse', () => {
  const { orbit } = orbitAt(Math.PI, 0, 50);
  orbit.wheel(1);
  close(orbit.dist, 45, 1e-9);
  orbit.wheel(2);
  close(orbit.dist, 45 * 0.81, 1e-9);
  orbit.wheel(-3);
  close(orbit.dist, 50, 1e-9, 'down undoes up');
  orbit.wheel(0);
  close(orbit.dist, 50, 1e-9);
});

test('W / S and the left stick dolly at 50 u/s, in proportion to the stick (up = in)', () => {
  const { cam, orbit } = orbitAt(Math.PI, 0.3, 100);
  orbit.dollyAxis(0.5, 1);
  close(orbit.dist, 75, 1e-9, 'W: in at 50 u/s');
  orbit.dollyAxis(0.2, -1);
  close(orbit.dist, 85, 1e-9, 'S: out');
  orbit.dollyAxis(1, 0.5);
  close(orbit.dist, 60, 1e-9, 'half deflection: half the rate');
  orbit.dollyAxis(1, 0);
  close(orbit.dist, 60, 1e-9);
  assertAimsAtCentre(cam);
});

// ---------------------------------------------------------------- spacing, start, the switches

test('a spacing change scales the orbit distance by the ratio of the new spacing to the old', () => {
  const { cam, orbit } = orbitAt(2, 0.4, 60);
  const yaw = cam.yaw, pitch = cam.pitch;
  cam.rescale(2 / 1.1);
  orbit.rescale(2 / 1.1, { min: 8, max: 1000 });
  close(orbit.dist, 60 * 2 / 1.1, 1e-9);
  close(dist(cam), 60 * 2 / 1.1, 1e-9);
  assert.deepEqual([cam.yaw, cam.pitch], [yaw, pitch], 'yaw and pitch kept');
  assertAimsAtCentre(cam);
  assert.deepEqual([orbit.min, orbit.max], [8, 1000], 'the range follows the spacing');
});

test('the start pose: the spawn pose\'s yaw and pitch at its distance to the board centre, re-aimed at the centre', () => {
  const box = { X: 6, Y: 6, Z: 6 };
  const s = spawnPose(box, SPACING_START, 60, 1.5);
  const cam = new FlyCamera();
  const orbit = new OrbitCamera(cam);
  orbit.setRange(orbitRange(box, SPACING_START, 60, 1.5));
  cam.place(s);
  orbit.enter();
  assert.deepEqual([cam.yaw, cam.pitch], [s.yaw, s.pitch]);
  close(orbit.dist, Math.hypot(s.x, s.y, s.z), 1e-9);
  assertAimsAtCentre(cam);
  // Back to start after orbiting and dollying: the same pose again
  orbit.look(300, -120);
  orbit.wheel(3);
  cam.place(s);
  orbit.enter();
  assert.deepEqual([cam.yaw, cam.pitch], [s.yaw, s.pitch]);
  close(orbit.dist, Math.hypot(s.x, s.y, s.z), 1e-9);
});

test('Fly to Orbit keeps yaw and pitch and the distance to the centre, clamped; Orbit to Fly keeps the pose', () => {
  const cam = new FlyCamera();
  cam.place({ x: 12, y: -30, z: 44, yaw: 0.9, pitch: -0.35 });
  const orbit = new OrbitCamera(cam);
  orbit.setRange({ min: 4.4, max: 200 });
  const d = Math.hypot(12, -30, 44);
  orbit.enter();
  assert.deepEqual([cam.yaw, cam.pitch], [0.9, -0.35]);
  close(dist(cam), d, 1e-9);
  assertAimsAtCentre(cam);
  orbit.look(40, 10);
  const pose = { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch };
  // Orbit to Fly: nothing moves; Fly's own inputs then fly from there
  assert.deepEqual({ x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch }, pose);
  cam.move(1, { w: true });
  const [fx, fy, fz] = viewDir(pose.yaw, pose.pitch);
  close(cam.x, pose.x + fx * MOVE_SPEED); close(cam.y, pose.y + fy * MOVE_SPEED); close(cam.z, pose.z + fz * MOVE_SPEED);
  const near = new FlyCamera(); near.place({ x: 1, y: 0, z: 0, yaw: 1, pitch: 0 });
  const o2 = new OrbitCamera(near); o2.setRange({ min: 4.4, max: 200 }); o2.enter();
  close(o2.dist, 4.4, 1e-12, 'clamped to the minimum');
  assertAimsAtCentre(near);
});

test('FlyCamera gives the same pose for the same inputs', () => {
  const cam = new FlyCamera();
  cam.place({ x: 3, y: 4, z: -50, yaw: Math.PI - 0.3, pitch: 0.2 });
  cam.look(37, -12);
  cam.move(0.25, { w: true, d: true, e: true });
  cam.moveAxes(0.1, 0.5, -0.25, 1);
  cam.lookAxes(0.1, -0.5, 0.3);
  cam.rescale(1.5);
  const exp = { x: 3, y: 4, z: -50, yaw: Math.PI - 0.3, pitch: 0.2 };
  const k = LOOK_DEG_PER_PX * DEG;
  exp.pitch += -12 * k; exp.yaw += 37 * k;
  const step = (f, r, u, v) => {
    const cp = Math.cos(exp.pitch);
    const F = [Math.sin(exp.yaw) * cp, -Math.sin(exp.pitch), -Math.cos(exp.yaw) * cp], R = [Math.cos(exp.yaw), 0, Math.sin(exp.yaw)];
    let vx = F[0] * f + R[0] * r, vy = F[1] * f + u, vz = F[2] * f + R[2] * r;
    const len = Math.hypot(vx, vy, vz);
    if (len > 1) { vx /= len; vy /= len; vz /= len; }
    exp.x += vx * v; exp.y += vy * v; exp.z += vz * v;
  };
  { // move(): each key its own full-speed step
    const v = MOVE_SPEED * 0.25, cp = Math.cos(exp.pitch);
    exp.x += Math.sin(exp.yaw) * cp * v; exp.y += -Math.sin(exp.pitch) * v; exp.z += -Math.cos(exp.yaw) * cp * v;
    exp.x += Math.cos(exp.yaw) * v; exp.z += Math.sin(exp.yaw) * v;
    exp.y += v;
  }
  step(0.5, -0.25, 1, MOVE_SPEED * 0.1);
  const px = (PAD_LOOK_DEG_PER_S * 0.1) / LOOK_DEG_PER_PX;
  exp.pitch += 0.3 * px * k; exp.yaw += -0.5 * px * k;
  exp.x *= 1.5; exp.y *= 1.5; exp.z *= 1.5;
  for (const key of ['x', 'y', 'z', 'yaw', 'pitch']) close(cam[key], exp[key], 1e-9, key);
});

// ---------------------------------------------------------------- picking

test('picking: the crosshair aims along the camera-to-centre line and picks the cube nearest the camera on it', () => {
  const s = SPACING_START;
  for (const side of [6, 5]) {
    const view = fakeView(side, side, side);
    let hits = 0;
    for (let i = 0; i < 400; i++) {
      const yaw = (i * 2.399) % (2 * Math.PI), pitch = Math.asin(((i * 0.618) % 2) - 1);
      const { cam } = orbitAt(yaw, pitch, 60 + (i % 7) * 10);
      const [x, y, z] = viewDir(cam.yaw, cam.pitch);
      const o = { x: cam.x, y: cam.y, z: cam.z }, d = { x, y, z };
      const picked = pickCell(view, s, o, d, false);
      assert.equal(picked, pickCellBrute(view, s, o, d, false), 'the nearest cube on the line');
      if (picked >= 0) hits++;
    }
    // an odd side has a cube at the centre, so the line always meets one; an even side's centre is a gap
    if (side % 2) assert.equal(hits, 400, 'the line through the centre cube always picks');
    else assert.ok(hits > 300, 'most lines through the gap at the centre meet a cube');
  }
});

test('picking: every surface cube of a 6 × 6 × 6 box is picked from some orbit direction', () => {
  const X = 6, view = fakeView(X, X, X), s = SPACING_START, p = 4 * s;
  for (let k = 0; k < X; k++) for (let j = 0; j < X; j++) for (let i = 0; i < X; i++) {
    if (![i, j, k].some((c) => c === 0 || c === X - 1)) continue;
    const c = [(i - (X - 1) / 2) * p, (j - (X - 1) / 2) * p, (k - (X - 1) / 2) * p];
    const l = Math.hypot(...c);
    // orbit to the cube's direction: the camera on the line from the centre through it, looking back
    const d = [-c[0] / l, -c[1] / l, -c[2] / l];
    const { cam } = orbitAt(Math.atan2(d[0], -d[2]), Math.asin(-d[1]), 80);
    const [x, y, z] = viewDir(cam.yaw, cam.pitch);
    assert.equal(pickCell(view, s, { x: cam.x, y: cam.y, z: cam.z }, { x, y, z }, false), i + X * (j + X * k), `cube ${i} ${j} ${k}`);
  }
});

// ---------------------------------------------------------------- the wiring

test('the shell routes every 3D camera input through the orbit while the Camera setting is Orbit', () => {
  assert.match(MAIN, /new OrbitCamera\(cam\)/, 'one orbit over the one camera');
  assert.match(MAIN, /cameraMode: \(mode\) => setCameraMode\(mode\)/, 'the applier is the only writer of the mode');
  const setter = MAIN.slice(MAIN.indexOf('function setCameraMode('), MAIN.indexOf('\n}\n', MAIN.indexOf('function setCameraMode(')));
  assert.match(setter, /orbitCam\.enter\(\)/, 'Fly to Orbit re-aims at the centre');
  const spawn = MAIN.slice(MAIN.indexOf('function placeAtSpawn('), MAIN.indexOf('\n}\n', MAIN.indexOf('function placeAtSpawn(')));
  assert.match(spawn, /cam\.place\(spawnPose\(/);
  assert.match(spawn, /orbitCam\.enter\(\)/, 'start and Back to start in Orbit');
  const spacing = MAIN.slice(MAIN.indexOf('function setSpacing('), MAIN.indexOf('\n}\n', MAIN.indexOf('function setSpacing(')));
  assert.match(spacing, /orbitCam\.rescale\(/, 'the orbit distance follows the spacing');
  assert.match(MAIN, /onWheel: \(notches\) => wheel3D\(notches\)/, 'the wheel dollies in Orbit');
  assert.match(MAIN, /wheel\(notches\) \{ wheel3D\(notches\)/, 'the debug hook\'s wheel too');
});
