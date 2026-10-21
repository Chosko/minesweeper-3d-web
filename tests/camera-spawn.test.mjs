// The 3D spawn framing and the world reference (task 125): the pure spawn pose of a box — a
// three-quarter view that frames every corner inside a margin with the crosshair on the near face's
// centre cube — and the off-screen arrow's in-view test and screen angle, checked against three.js's
// own projection; in a browser, Home and R and the pause card's "Back to start" returning the camera
// there during play only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three/three.module.min.js';
import {
  FlyCamera, spawnPose, offscreenArrow, SPAWN_PITCH_DEG, SPAWN_YAW_DEG, SPAWN_MARGIN, SPAWN_FACE_CLEARANCE, SPACING_START,
} from '../js/input.js';
import { pickCell } from '../js/picking.js';
import { PRESETS } from '../js/mode3d/board-choice.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DEG = Math.PI / 180;

// Each box at the start spacing, SPACING_START: the presets, a shallow box (the Learn 3D box and a
// former First box) and custom boards.
const BOXES = [
  ...PRESETS.map((p) => [p.X, p.Y, p.Z, SPACING_START]),
  [4, 4, 3, SPACING_START], [5, 5, 3, SPACING_START], [1, 1, 2, SPACING_START], [30, 16, 1, SPACING_START], [100, 100, 100, SPACING_START], [2, 9, 40, SPACING_START],
];
const ASPECTS = { '16:9': 16 / 9, '4:3': 4 / 3, '21:9': 21 / 9, '9:16': 9 / 16 };
const FOVS = [45, 90];

/** A three.js camera placed at `pose` the way FlyCamera.apply places the renderer's. */
function threeCamera(pose, fov, aspect) {
  const cam = new THREE.PerspectiveCamera(fov, aspect, 1, 1e6);
  cam.rotation.order = 'YXZ';
  const fly = new FlyCamera();
  fly.place(pose);
  fly.apply(cam);
  cam.updateProjectionMatrix();
  return cam;
}
const halfExtents = (X, Y, Z, s) => {
  const p = 4 * s;
  return [((X - 1) * p) / 2 + 2, ((Y - 1) * p) / 2 + 2, ((Z - 1) * p) / 2 + 2];
};
function corners(X, Y, Z, s) {
  const [hx, hy, hz] = halfExtents(X, Y, Z, s);
  const out = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) out.push(new THREE.Vector3(sx * hx, sy * hy, sz * hz));
  return out;
}
const fakeView = (X, Y, Z) => ({ X, Y, Z, n: X * Y * Z, unlinked: new Uint8Array(X * Y * Z), pressed: new Uint8Array(X * Y * Z) });
const forward = (pose) => ({ x: Math.cos(pose.pitch) * Math.sin(pose.yaw), y: -Math.sin(pose.pitch), z: -Math.cos(pose.pitch) * Math.cos(pose.yaw) });

// ---------------------------------------------------------------- the spawn pose

test('the spawn angles and the framing margin are named constants: about 15° down and 20° off the original +Z view', () => {
  assert.ok(SPAWN_FACE_CLEARANCE > 0 && SPAWN_FACE_CLEARANCE < 0.5, `face clearance ${SPAWN_FACE_CLEARANCE}`);
  assert.ok(Math.abs(SPAWN_PITCH_DEG - 15) <= 3, `pitch ${SPAWN_PITCH_DEG}°`);
  assert.ok(Math.abs(SPAWN_YAW_DEG - 20) <= 3, `yaw ${SPAWN_YAW_DEG}°`);
  assert.ok(Math.abs(SPAWN_MARGIN - 0.1) <= 0.02, `margin ${SPAWN_MARGIN}`);
});

test('the spawn pose frames every box with a margin, from three quarters, its crosshair on the near face\'s centre cube', () => {
  const view = new Map();
  for (const [X, Y, Z, spacing] of BOXES) {
    for (const [name, aspect] of Object.entries(ASPECTS)) {
      for (const fov of FOVS) {
        const label = `${X}×${Y}×${Z} at spacing ${spacing}, ${name}, ${fov}°`;
        const pose = spawnPose({ X, Y, Z }, spacing, fov, aspect);
        // the angles, in FlyCamera's convention (pitch + = down, yaw PI = toward +Z)
        assert.ok(Math.abs(pose.pitch - SPAWN_PITCH_DEG * DEG) < 1e-12, `${label}: pitch`);
        assert.ok(Math.abs(Math.abs(pose.yaw - Math.PI) - SPAWN_YAW_DEG * DEG) < 1e-12, `${label}: yaw`);
        // every corner in front of the camera and inside the margin, horizontally and vertically
        const cam = threeCamera(pose, fov, aspect);
        const lim = 1 - 2 * SPAWN_MARGIN;
        let widest = 0;
        for (const c of corners(X, Y, Z, spacing)) {
          const local = c.clone().applyMatrix4(cam.matrixWorldInverse);
          assert.ok(local.z < -1, `${label}: corner in front of the camera`);
          const ndc = c.clone().project(cam);
          assert.ok(Math.abs(ndc.x) <= lim + 1e-9 && Math.abs(ndc.y) <= lim + 1e-9, `${label}: corner inside the margin (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)})`);
          widest = Math.max(widest, Math.abs(ndc.x), Math.abs(ndc.y));
        }
        // three faces visible: the camera lies beyond the near face, the top face and one side face
        const [hx, hy, hz] = halfExtents(X, Y, Z, spacing);
        assert.ok(pose.z < -hz, `${label}: in front of the near face`);
        assert.ok(pose.y > hy, `${label}: above the top face`);
        assert.ok(Math.abs(pose.x) > hx, `${label}: beside a side face`);
        // the closest such pose: the framing touches the margin, unless the camera stands exactly at the
        // clearance it needs to see the top and side faces
        const k = 1 + SPAWN_FACE_CLEARANCE, at = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));
        assert.ok(pose.y >= hy * k - 1e-9 && Math.abs(pose.x) >= hx * k - 1e-9 && pose.z <= -hz * k + 1e-9, `${label}: clear of the three faces`);
        if (widest < lim - 1e-9) assert.ok(at(pose.y, hy * k) || at(-pose.x, hx * k) || at(-pose.z, hz * k), `${label}: no closer pose frames the box`);
        // the crosshair: the screen-centre ray picks the near face's centre cube
        const centre = Math.floor(X / 2) + X * Math.floor(Y / 2);
        assert.equal(pickCell(fakeView(X, Y, Z), spacing, pose, forward(pose), false), centre, `${label}: aims at the near face's centre cube`);
        view.set(label, widest);
      }
    }
  }
  // in the standard window the presets fill most of the frame
  for (const p of PRESETS) {
    assert.ok(view.get(`${p.X}×${p.Y}×${p.Z} at spacing ${SPACING_START}, 16:9, 45°`) > 0.7, `${p.id} fills the frame`);
  }
});

test('the spawn pose follows the spacing, and still aims at the near face\'s centre cube', () => {
  for (const s of [1, 2.5, 10]) {
    const pose = spawnPose({ X: 6, Y: 6, Z: 6 }, s, 45, 16 / 9);
    const cam = threeCamera(pose, 45, 16 / 9);
    for (const c of corners(6, 6, 6, s)) {
      const ndc = c.clone().project(cam);
      assert.ok(Math.abs(ndc.x) <= 0.8 + 1e-9 && Math.abs(ndc.y) <= 0.8 + 1e-9, `spacing ${s}: framed`);
    }
    assert.equal(pickCell(fakeView(6, 6, 6), s, pose, forward(pose), false), 3 + 6 * 3, `spacing ${s}: aimed`);
  }
  const near = spawnPose({ X: 6, Y: 6, Z: 6 }, 1, 45, 16 / 9), far = spawnPose({ X: 6, Y: 6, Z: 6 }, 10, 45, 16 / 9);
  assert.ok(Math.hypot(far.x, far.y, far.z) > Math.hypot(near.x, near.y, near.z), 'a wider spacing places the camera further out');
});

test('FlyCamera.place takes a pose; reset keeps the original orientation', () => {
  const cam = new FlyCamera();
  const pose = spawnPose({ X: 8, Y: 8, Z: 8 }, SPACING_START, 45, 16 / 9);
  cam.place(pose);
  assert.deepEqual({ x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch }, pose);
  cam.reset(1, 2, 3);
  assert.deepEqual({ x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch }, { x: 1, y: 2, z: 3, yaw: Math.PI, pitch: 0 });
});

// ---------------------------------------------------------------- the off-screen arrow

const BOX = { X: 6, Y: 6, Z: 6 };
const facingZ = (x, y, z, yaw = Math.PI, pitch = 0) => ({ x, y, z, yaw, pitch });
const angleOf = (pose) => offscreenArrow(pose, BOX, SPACING_START, 45, 16 / 9);
const near = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;

test('the off-screen arrow is hidden while any part of the box is in view', () => {
  assert.equal(angleOf(spawnPose(BOX, SPACING_START, 45, 16 / 9)), null, 'the spawn view');
  assert.equal(angleOf(facingZ(0, 0, -100)), null, 'the box straight ahead');
  assert.equal(angleOf(facingZ(0, 0, 0)), null, 'the camera inside the box');
  // the half view is atan(tan(22.5°) · 16/9) ≈ 36.4° wide; the box spans ±7.4° at this distance
  assert.equal(angleOf(facingZ(0, 0, -100, Math.PI + 40 * DEG)), null, 'the centre out of view, an edge still in it');
  assert.notEqual(angleOf(facingZ(0, 0, -100, Math.PI + 50 * DEG)), null, 'the whole box out of view');
});

test('the off-screen arrow points toward the box centre on screen: right, left, above, and behind by the shortest turn', () => {
  // facing +Z, screen right is world -X
  assert.ok(near(angleOf(facingZ(200, 0, 0)), 0), 'a box to the right points right');
  assert.ok(near(angleOf(facingZ(-200, 0, 0)), Math.PI), 'a box to the left points left');
  assert.ok(near(angleOf(facingZ(0, -200, 0)), Math.PI / 2), 'a box above points up');
  assert.ok(near(angleOf(facingZ(0, 200, 0)), -Math.PI / 2), 'a box below points down');
  assert.ok(near(angleOf(facingZ(60, 0, 200)), 0), 'a box behind on the right: turn right');
  assert.ok(near(angleOf(facingZ(-60, 0, 200)), Math.PI), 'a box behind on the left: turn left');
  assert.ok(near(angleOf(facingZ(0, -60, 200)), Math.PI / 2), 'a box behind and above: turn up');
  // a box in front, up and to the right: the arrow follows its on-screen direction
  const a = angleOf(facingZ(-300, -250, -150, Math.PI - 75 * DEG));
  assert.ok(a !== null && a > 0 && a < Math.PI / 2, `a box up and to the right (${a})`);
});

// ---------------------------------------------------------------- the shell's wiring

const MAIN = read('js/main.js');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

test('every 3D start places the camera through the one spawn function', () => {
  const main = strip(MAIN);
  assert.doesNotMatch(main, /startCameraPos|-8 \* M/, 'the original start pose is gone');
  assert.doesNotMatch(main, /cam\.reset\(|replayCam\.reset\(/, 'no start path resets to the original orientation');
  const fn = (name) => main.slice(main.indexOf(`function ${name}(`), main.indexOf('\n}\n', main.indexOf(`function ${name}(`)));
  assert.match(fn('startGame'), /placeAtSpawn\(\)/, 'a new game, Play again and Restart start framed');
  assert.match(fn('retry3D'), /placeAtSpawn\(\)/, 'the failure offer\'s Retry and standard board start framed');
  assert.match(fn('placeAtSpawn'), /spawnPose\(/);
});

test('Home and R return to start during 3D play only, unrepeated, with the browser\'s Home scrolling stopped', () => {
  const input = read('js/input.js');
  assert.match(input, /RETURN_KEYS = new Set\(\['Home', 'KeyR'\]\)/);
  assert.match(input, /RETURN_KEYS\.has\(e\.code\) && this\.o\.isActive\(\)\) e\.preventDefault\(\)/);
  const main = strip(MAIN);
  const onKey = main.slice(main.indexOf('onKey: (code, e) => {'));
  assert.match(onKey.slice(0, onKey.indexOf('onLockChange')), /\(code === 'Home' \|\| code === 'KeyR'\) && input\.o\.isActive\(\)[^\n]*placeAtSpawn\(\)/);
});

// ---------------------------------------------------------------- in a browser

test('in a browser, Cube Intro picked from the board choice starts at the ordinary spacing in the three-quarter view, the whole box on screen', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="6,6,6,10"]');
    await page.click('#bc-play');
    await page.waitForFunction(() => globalThis.__ms.modes.active === '3d' && globalThis.__ms.game);
    assert.deepEqual(await ms(() => globalThis.__ms.state.settings), { X: 6, Y: 6, Z: 6, mines: 10 });
    assert.equal(await ms(() => globalThis.__ms.state.spacing), SPACING_START, 'the ordinary start spacing');
    assert.match(await ms(() => document.getElementById('hud-tools').textContent), new RegExp(`spacing ${SPACING_START.toFixed(1).replace('.', '\\.')}`), 'the readout shows it');
    const cam = await ms(() => globalThis.__ms.info().cam);
    const spawn = await ms(() => globalThis.__ms.spawnPose(6, 6, 6));
    assert.ok(['x', 'y', 'z', 'yaw', 'pitch'].every((k) => Math.abs(cam[k] - spawn[k]) < 1e-9), 'at the spawn pose for that spacing');
    const ndc = await ms(() => {
      const { THREE, renderer, state } = globalThis.__ms;
      const c = renderer.camera;
      c.updateMatrixWorld();
      const p = 4 * state.spacing, h = [(6 - 1) * p / 2 + 2, (6 - 1) * p / 2 + 2, (6 - 1) * p / 2 + 2];
      const out = [];
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
        const v = new THREE.Vector3(sx * h[0], sy * h[1], sz * h[2]).project(c);
        out.push([v.x, v.y, v.z]);
      }
      return out;
    });
    for (const [x, y, z] of ndc) assert.ok(Math.abs(x) < 1 && Math.abs(y) < 1 && z < 1, `corner on screen (${x.toFixed(3)}, ${y.toFixed(3)})`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, a 3D game starts framed, and Home, R and "Back to start" return there during play only', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const cam = () => ms(() => globalThis.__ms.info().cam);
    const spawn = () => ms(() => { const g = globalThis.__ms.game; return globalThis.__ms.spawnPose(g.X, g.Y, g.Z); });
    const press = (code) => ms((c) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c }));
    }, code);
    const wander = () => ms(() => { globalThis.__ms.moveTo(400, -50, 300); globalThis.__ms.look(0.3, -0.4); });
    const close = (a, b) => ['x', 'y', 'z', 'yaw', 'pitch'].every((k) => Math.abs(a[k] - b[k]) < 1e-9);

    // a new game starts framed, the crosshair on the near face's centre cube, the arrow hidden
    await ms(() => globalThis.__ms.start(6, 6, 6, 10));
    assert.ok(close(await cam(), await spawn()), 'the ready card shows the spawn pose');
    await ms(() => globalThis.__ms.forcePlay());
    assert.equal(await ms(() => globalThis.__ms.selected()), 3 + 6 * 3, 'the crosshair rests on the near face\'s centre cube');
    assert.equal(await ms(() => document.getElementById('crosshair-arrow').classList.contains('hidden')), true, 'the arrow is hidden with the box in view');

    // Home and R return during play, at the current spacing; the arrow shows while the box is away
    await ms(() => globalThis.__ms.wheel(1));
    await wander();
    await ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await ms(() => document.getElementById('crosshair-arrow').classList.contains('hidden')), false, 'the arrow shows with the box out of view');
    const prevented = await ms(() => !window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Home', key: 'Home', cancelable: true })));
    await ms(() => window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Home', key: 'Home' })));
    assert.equal(prevented, true, 'the browser\'s own Home is stopped during play');
    assert.ok(close(await cam(), await spawn()), 'Home returns to start');
    assert.ok(Math.abs(await ms(() => globalThis.__ms.state.spacing) - (1.1 + 0.1)) < 1e-9, 'the spacing is kept');
    await wander();
    await press('KeyR');
    assert.ok(close(await cam(), await spawn()), 'R returns to start');
    assert.equal(await ms(() => globalThis.__ms.state.started), false, 'nothing is played');

    // paused: the keys do nothing; a game in progress's card offers "Back to start" after Resume, which resumes
    await ms(() => {
      const m = globalThis.__ms;
      m.start(6, 6, 6, 10, [1, 50, 80, 100, 120, 140, 160, 180, 200, 215]);
      m.forcePlay();
      m.aimAt(0); // beside a mine: the game goes on
      m.click('left');
    });
    assert.equal(await ms(() => globalThis.__ms.state.started), true, 'a game in progress');
    await wander();
    const away = await cam();
    await ms(() => globalThis.__ms.pause());
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    await press('Home');
    await press('KeyR');
    assert.deepEqual(await cam(), away, 'Home and R do nothing while paused');
    const actions = await ms(() => [...document.querySelectorAll('#pause-actions button')].filter((b) => b.offsetParent).map((b) => b.id));
    assert.deepEqual(actions, ['p-resume', 'p-home', 'p-restart', 'p-menu'], 'Back to start follows Resume');
    assert.equal(await ms(() => document.getElementById('p-home').textContent), 'Back to start');
    assert.equal(await ms(() => document.activeElement.id), 'p-resume', 'Resume keeps the default focus');
    await ms(() => globalThis.__ms.state.dragLook = true); // resume lockless, as drag-to-look play does
    await page.click('#p-home');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'playing', 'it resumes as Resume does');
    assert.ok(close(await cam(), await spawn()), 'and returns to start');

    // the end delay: the keys do nothing
    await ms(() => {
      const m = globalThis.__ms;
      m.start(3, 3, 1, 1, [0]);
      m.forcePlay();
      m.aimAt(0);
      m.click('left');
      m.moveTo(50, 50, -50);
    });
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    const ended = await cam();
    await press('Home');
    await press('KeyR');
    assert.deepEqual(await cam(), ended, 'Home and R do nothing during the end delay');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: 5000 });
    assert.equal(await ms(() => document.getElementById('p-home').offsetParent), null, 'an ended game has no Back to start');

    // Classic 2D's pause card has none
    await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'beginner', custom: { width: 9, height: 9, mines: 10 }, noGuess: false }));
    await ms(() => globalThis.__ms.pause());
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    assert.equal(await ms(() => document.getElementById('p-home').offsetParent), null, 'Classic 2D has no Back to start');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
