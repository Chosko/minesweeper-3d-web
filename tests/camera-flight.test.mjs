// 3D flight (task 139, P-25, P-26, P-30, P-32): W flies where the camera looks; the spacing steps
// 0.1 a notch with acceleration, toggles between 1.1 and 2.0 on X and carries the camera with it;
// cubes within the fly-through distance of the camera turn to glass and cannot be picked. Pure
// functions are checked directly; the drawing and the wiring in a browser through `__ms`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  FlyCamera, MOVE_SPEED, SPACING_MIN, SPACING_MAX, SPACING_START, SPACING_STEP, SPACING_STEP_MAX,
  SPACING_RUN_GAP_MS, SPACING_TOGGLE, spacingStep, spacingToggle,
} from '../js/input.js';
import { pickCell, pickCellBrute, FLY_THROUGH_DIST } from '../js/picking.js';
import { cameraSample } from '../js/replay/sampler-3d.js';
import { hudStripHtml } from '../js/settings/bindings.js';
import { GLYPHS } from '../js/gamepad.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const DEG = Math.PI / 180;
// js/render.js imports 'three' through the page's import map; Node resolves it to the vendored build.
const THREE_URL = pathToFileURL(join(ROOT, 'vendor/three/three.module.min.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : next(s, c);
}`)}`);
const { FLY_THROUGH_ALPHA, FLY_THROUGH_BAND, flyThroughAlpha } = await import('../js/render.js');
const RENDER = read('js/render.js');
const MAIN = read('js/main.js');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const close = (a, b, eps = 1e-9, what = '') => assert.ok(Math.abs(a - b) < eps, `${what} ${a} != ${b}`);
/** The view direction of a FlyCamera pose (three.js's camera looks along it). */
const viewDir = (yaw, pitch) => [Math.cos(pitch) * Math.sin(yaw), -Math.sin(pitch), -Math.cos(pitch) * Math.cos(yaw)];

// ---------------------------------------------------------------- forward follows the view

test('W for one second moves exactly MOVE_SPEED along the view direction, S against it, at any pitch and yaw', () => {
  for (const pitchDeg of [-90, -45, 0, 30, 90]) {
    for (const yaw of [Math.PI, 0, 0.7, -2.3]) {
      const pitch = pitchDeg * DEG;
      const [vx, vy, vz] = viewDir(yaw, pitch);
      const w = new FlyCamera(); w.yaw = yaw; w.pitch = pitch;
      w.move(1, { w: true });
      close(w.x, vx * MOVE_SPEED, 1e-9, 'x'); close(w.y, vy * MOVE_SPEED, 1e-9, 'y'); close(w.z, vz * MOVE_SPEED, 1e-9, 'z');
      close(Math.hypot(w.x, w.y, w.z), MOVE_SPEED);
      const s = new FlyCamera(); s.yaw = yaw; s.pitch = pitch;
      s.move(1, { s: true });
      close(s.x, -vx * MOVE_SPEED); close(s.y, -vy * MOVE_SPEED); close(s.z, -vz * MOVE_SPEED);
    }
  }
  const down = new FlyCamera(); down.pitch = 90 * DEG; down.yaw = 1.1;
  down.move(1, { w: true });
  close(down.x, 0); close(down.z, 0); close(down.y, -MOVE_SPEED, 1e-9, 'looking straight down, W goes straight down');
  const level = new FlyCamera(); // pitch 0, facing +Z: unchanged from the original
  level.move(1, { w: true });
  close(level.x, 0); close(level.y, 0); close(level.z, MOVE_SPEED);
});

test('Q and E move only on Y; A and D only on XZ, at any pitch', () => {
  for (const pitch of [-1.2, 0, 0.9]) {
    for (const yaw of [Math.PI, 0.4]) {
      for (const [keys, sign] of [[{ q: true }, -1], [{ e: true }, 1]]) {
        const c = new FlyCamera(); c.yaw = yaw; c.pitch = pitch; c.move(1, keys);
        assert.deepEqual([c.x, c.z], [0, 0]);
        close(c.y, sign * MOVE_SPEED);
      }
      for (const keys of [{ a: true }, { d: true }]) {
        const c = new FlyCamera(); c.yaw = yaw; c.pitch = pitch; c.move(1, keys);
        assert.equal(c.y, 0);
        close(Math.hypot(c.x, c.z), MOVE_SPEED);
      }
    }
  }
});

test('the forward-vector quirk is gone from the camera', () => {
  const src = strip(read('js/input.js'));
  const camera = src.slice(src.indexOf('class FlyCamera'), src.indexOf('lookAxes('));
  assert.match(camera, /Math\.cos\(this\.pitch\)/, 'XZ is scaled by cos(pitch)');
  assert.doesNotMatch(read('js/input.js'), /quirk/i, 'no comment keeps the quirk');
});

// ---------------------------------------------------------------- the spacing step

const wheel = (events, spacing = SPACING_START) => {
  let st = { spacing };
  for (const [notches, at] of events) st = spacingStep(st, notches, at);
  return st.spacing;
};

test('one isolated wheel notch changes the spacing by exactly 0.1, up or down', () => {
  assert.equal(SPACING_STEP, 0.1);
  close(wheel([[1, 0]]), 1.2);
  close(wheel([[-1, 0]], 2), 1.9);
  // notches with a pause between them do not accelerate
  close(wheel([[1, 0], [1, SPACING_RUN_GAP_MS + 1], [1, 2 * SPACING_RUN_GAP_MS + 2]]), 1.4);
  // a press of the controller's D-pad is a notch with no time: always one step
  let s = { spacing: SPACING_START };
  for (let i = 0; i < 5; i++) s = spacingStep({ spacing: s.spacing }, 1);
  close(s.spacing, 1.6, 1e-9, 'five D-pad presses');
  // several auto-repeats in one tick: still one step each, never accelerating
  close(spacingStep({ spacing: SPACING_START }, 2).spacing, 1.3, 1e-9, 'two untimed notches');
  close(spacingStep({ spacing: SPACING_START }, -4).spacing, 1, 1e-9, 'clamped');
});

test('notches in quick succession step further, growing to the cap per notch, and fall back to 0.1 after a pause', () => {
  const steps = [];
  let st = { spacing: 1 };
  for (let i = 0; i < 20; i++) {
    const before = st.spacing;
    st = spacingStep(st, 1, i * 30);
    steps.push(st.spacing - before);
  }
  close(steps[0], SPACING_STEP, 1e-9, 'the first notch');
  for (let i = 1; i < steps.length; i++) assert.ok(steps[i] >= steps[i - 1] - 1e-9, `growing at ${i}`);
  assert.ok(steps[3] > SPACING_STEP + 1e-9, 'it accelerates');
  close(steps.at(-1), SPACING_STEP_MAX, 1e-6, 'capped');
  assert.ok(steps.every((d) => d <= SPACING_STEP_MAX + 1e-9));
  // from 1.1, a quick spin reaches 2.0 in a few notches
  let quick = { spacing: SPACING_START }, n = 0;
  while (quick.spacing < 2 - 1e-9) { quick = spacingStep(quick, 1, n * 30); n++; }
  assert.ok(n <= 6, `${n} notches to 2.0`);
  // after a pause the next notch is one step again
  const after = spacingStep(st, 1, 19 * 30 + SPACING_RUN_GAP_MS + 1);
  close(after.spacing - st.spacing, SPACING_STEP, 1e-6);
  // a reversal starts a new run
  const back = spacingStep(st, -1, 19 * 30 + 10);
  close(st.spacing - back.spacing, SPACING_STEP, 1e-6);
});

test('fractional notches scale proportionally and do not run away', () => {
  close(wheel([[0.25, 0]]) - SPACING_START, 0.025, 1e-9, 'a quarter notch');
  // a trackpad: one notch's worth in many small events, quick succession
  const tiny = [];
  for (let i = 0; i < 100; i++) tiny.push([0.01, i * 8]);
  const moved = wheel(tiny) - SPACING_START;
  close(moved, 0.1, 1e-6, 'one notch in 100 events');
  // five notches' worth in fractions moves about as five quick notches do
  const frac = [], whole = [];
  for (let i = 0; i < 50; i++) frac.push([0.1, i * 8]);
  for (let i = 0; i < 5; i++) whole.push([1, i * 80]);
  close(wheel(frac), wheel(whole), 1e-6, 'fractions against whole notches');
});

test('the spacing stays within [1, 10]', () => {
  assert.equal(SPACING_MIN, 1); assert.equal(SPACING_MAX, 10);
  close(wheel([[-1, 0]], 1.05), 1);
  close(wheel([[1, 0]], 9.95), 10);
  const up = [];
  for (let i = 0; i < 200; i++) up.push([1, i * 20]);
  assert.equal(wheel(up), 10);
  const down = [];
  for (let i = 0; i < 200; i++) down.push([-1, i * 20]);
  assert.equal(wheel(down, 10), 1);
});

test('X toggles the spacing between 1.1 and 2.0', () => {
  assert.equal(SPACING_TOGGLE, 2);
  assert.equal(spacingToggle(SPACING_START), 2);
  assert.equal(spacingToggle(2), SPACING_START);
  assert.equal(spacingToggle(2.04), SPACING_START, '2.0 to the readout\'s precision');
  assert.equal(spacingToggle(3.7), 2, 'any other value goes to 2.0');
  assert.equal(spacingToggle(1), 2);
});

// ---------------------------------------------------------------- the camera scales with the spacing

const fakeView = (X, Y, Z) => ({ X, Y, Z, n: X * Y * Z, unlinked: new Uint8Array(X * Y * Z), pressed: new Uint8Array(X * Y * Z) });

test('scaling the camera with the spacing keeps its cell-unit sample and the cube under the crosshair', () => {
  const box = { X: 8, Y: 8, Z: 8 }, view = fakeView(8, 8, 8);
  const cam = new FlyCamera();
  { // looking from outside the box at the centre of its nearest corner cube, (7, 7, 0)
    const [x, y, z] = [30, 45, -80], p = 4 * SPACING_START, t = [3.5 * p, 3.5 * p, -3.5 * p];
    const [dx, dy, dz] = [t[0] - x, t[1] - y, t[2] - z], l = Math.hypot(dx, dy, dz);
    cam.place({ x, y, z, yaw: Math.atan2(dx, -dz), pitch: Math.asin(-dy / l) });
  }
  const o = () => ({ x: cam.x, y: cam.y, z: cam.z });
  const d = () => { const [x, y, z] = viewDir(cam.yaw, cam.pitch); return { x, y, z }; };
  const before = cameraSample(cam, box, SPACING_START);
  const aimed = pickCell(view, SPACING_START, o(), d(), false);
  assert.equal(aimed, 7 + 8 * 7, 'the corner cube is aimed');
  for (const next of [2, 4.5, 1, 10]) {
    const c = new FlyCamera(); c.place({ x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch });
    c.rescale(next / SPACING_START);
    assert.deepEqual(cameraSample(c, box, next), before, `spacing ${next}: the same sample`);
    assert.deepEqual([c.yaw, c.pitch], [cam.yaw, cam.pitch], 'yaw and pitch kept');
    assert.equal(pickCell(view, next, { x: c.x, y: c.y, z: c.z }, d(), false), aimed, `spacing ${next}: the same cube aimed`);
  }
});

test('every spacing change goes through the one setter, which scales the camera; a new game resets to 1.1', () => {
  const main = strip(MAIN);
  assert.doesNotMatch(main, /0\.04/, 'no 0.04 step is left');
  assert.doesNotMatch(main, /showSpacing/, 'the spacing toast is gone');
  const setter = main.slice(main.indexOf('function setSpacing('), main.indexOf('\n}\n', main.indexOf('function setSpacing(')));
  assert.match(setter, /cam\.rescale\(/, 'the camera follows the spacing');
  assert.match(setter, /ui\.setSpacing\(/, 'the readout follows it');
  assert.match(main, /spacingStep\(/, 'the wheel, the D-pad and the hook share the step');
  const onKey = main.slice(main.indexOf('onKey: (code, e) => {'));
  assert.match(onKey.slice(0, onKey.indexOf('onLockChange')), /code === 'KeyX' && input\.o\.isActive\(\)[^\n]*spacingToggle\(/, 'X toggles in 3D play only');
  const startGame = main.slice(main.indexOf('function startGame('), main.indexOf('\n}\n', main.indexOf('function startGame(')));
  assert.match(startGame, /S\.spacing = SPACING_START;\s*ui\.setSpacing\(S\.spacing\);/, 'a new game resets the spacing to the start spacing, and the readout with it');
});

test('the 3D tools strip carries the spacing to one decimal, like its other key hints; the toast is gone; not in Classic 2D', () => {
  const text = (html) => html.replace(/<[^>]+>/g, '');
  assert.match(text(hudStripHtml('3d', 'keyboard', GLYPHS.generic, { spacing: 1.1 })), /X spacing 1\.1/);
  assert.match(text(hudStripHtml('3d', 'keyboard', GLYPHS.generic, { spacing: 2.04 })), /X spacing 2\.0/);
  assert.match(text(hudStripHtml('3d', 'controller', GLYPHS.xbox, { spacing: 3 })), /spacing 3\.0/, 'on the controller too');
  assert.doesNotMatch(text(hudStripHtml('classic-2d', 'keyboard', GLYPHS.generic, { spacing: 1.1 })), /spacing/);
  assert.doesNotMatch(read('index.html'), /chip-spacing/);
  assert.doesNotMatch(read('js/ui.js'), /showSpacing|chip-spacing/);
  assert.match(read('js/ui.js'), /setSpacing\(/);
});

// ---------------------------------------------------------------- picking skips the glass

test('the fly-through distance is 1.5 pitches at the start spacing, with a fade band about half a pitch wide', () => {
  close(FLY_THROUGH_DIST, 1.5 * 4 * SPACING_START);
  close(FLY_THROUGH_DIST, 6.6, 1e-9);
  assert.ok(FLY_THROUGH_ALPHA >= 0.2 && FLY_THROUGH_ALPHA <= 0.3);
  assert.equal(FLY_THROUGH_ALPHA, 0.25);
  close(FLY_THROUGH_BAND, 0.5 * 4 * SPACING_START, 1e-9);
  assert.equal(flyThroughAlpha(0), FLY_THROUGH_ALPHA);
  assert.equal(flyThroughAlpha(FLY_THROUGH_DIST - 0.01), FLY_THROUGH_ALPHA);
  close(flyThroughAlpha(FLY_THROUGH_DIST + FLY_THROUGH_BAND / 2), (FLY_THROUGH_ALPHA + 1) / 2);
  assert.equal(flyThroughAlpha(FLY_THROUGH_DIST + FLY_THROUGH_BAND), 1);
  assert.equal(flyThroughAlpha(100), 1);
});

test('picking skips cells within the fly-through distance of the ray origin and picks the first cube beyond', () => {
  const view = fakeView(5, 5, 5), s = SPACING_START, p = 4 * s;
  // inside the centre cube (2, 2, 2), looking along +Z
  const o = { x: 0, y: 0, z: 0 }, d = { x: 0, y: 0, z: 1 };
  const idx = (i, j, k) => i + 5 * (j + 5 * k);
  // (2,2,3) is 4.4 away: glass; (2,2,4) is 8.8 away: picked
  assert.equal(pickCell(view, s, o, d, false), idx(2, 2, 4));
  assert.equal(pickCellBrute(view, s, o, d, false), idx(2, 2, 4));
  // just outside the distance of the next cube: it is picked
  const o2 = { x: 0, y: 0, z: p - FLY_THROUGH_DIST - 0.01 };
  assert.equal(pickCell(view, s, o2, d, false), idx(2, 2, 3));
  // nothing beyond the glass: -1
  const o3 = { x: 0, y: 0, z: 2 * p - 1 };
  assert.equal(pickCell(view, s, o3, d, false), -1);
  assert.equal(pickCellBrute(view, s, o3, d, false), -1);
  // the rule is the distance, whatever the spacing
  const wide = 3;
  assert.equal(pickCell(view, wide, { x: 0, y: 0, z: 4 * wide - FLY_THROUGH_DIST - 0.01 }, d, false), idx(2, 2, 3));
});

test('pickCell agrees with pickCellBrute on rays starting inside the box', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  for (const [X, Y, Z, s] of [[6, 6, 6, 1.1], [9, 4, 7, 1], [5, 5, 5, 2.5], [12, 12, 12, 1.4]]) {
    const view = fakeView(X, Y, Z);
    for (let c = 0; c < view.n; c++) if (rnd() < 0.2) view.unlinked[c] = 1;
    for (let c = 0; c < view.n; c++) if (rnd() < 0.3) view.pressed[c] = 1;
    const half = [X, Y, Z].map((n) => (n * 4 * s) / 2);
    for (let t = 0; t < 300; t++) {
      const o = { x: (rnd() * 2 - 1) * half[0], y: (rnd() * 2 - 1) * half[1], z: (rnd() * 2 - 1) * half[2] };
      let d = { x: rnd() * 2 - 1, y: rnd() * 2 - 1, z: rnd() * 2 - 1 };
      const l = Math.hypot(d.x, d.y, d.z); d = { x: d.x / l, y: d.y / l, z: d.z / l };
      const space = rnd() < 0.5;
      const a = pickCell(view, s, o, d, space), b = pickCellBrute(view, s, o, d, space);
      assert.equal(a, b, `${X}x${Y}x${Z} s ${s} ray ${t}`);
      if (a >= 0) {
        const i = a % X, j = ((a - i) / X) % Y, k = Math.floor(a / (X * Y));
        const centre = [(i - (X - 1) / 2) * 4 * s, (j - (Y - 1) / 2) * 4 * s, (k - (Z - 1) / 2) * 4 * s];
        assert.ok(Math.hypot(centre[0] - o.x, centre[1] - o.y, centre[2] - o.z) >= FLY_THROUGH_DIST, 'never a cube within the glass');
      }
    }
  }
});

// ---------------------------------------------------------------- the fade in the renderer

test('the fade runs on the Shift fade\'s path: the vertex shader decides it from the camera position', () => {
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /\$\{glslFloat\(FLY_THROUGH_DIST\)\}/, 'the shader reads the distance constant');
  assert.match(vert, /\$\{glslFloat\(FLY_THROUGH_ALPHA\)\}/);
  assert.match(vert, /\$\{glslFloat\(FLY_THROUGH_BAND\)\}/);
  assert.match(vert, /cameraPosition/);
  assert.match(vert, /a = min\(a, flyAlpha\(centre\)\)/, 'the lower alpha wins');
  const trans = RENDER.slice(RENDER.indexOf('  _updateTransparent() {'), RENDER.indexOf('  /** Advances time-based effects'));
  assert.match(trans, /if \(!shift && !space && !ctrl\)/);
  assert.match(trans, /_nearCells\(/, 'with no view mode held, the list holds only the cells around the camera');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, flying into a cube turns it to glass and aims beyond; the wheel, X and the field of view apply', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const frames = () => ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const strip3d = () => ms(() => document.getElementById('hud-tools').textContent);

    assert.equal(await ms(() => globalThis.__ms.settings.get('fieldOfView')), 60, 'a new install starts at 60°');
    assert.equal(await ms(() => globalThis.__ms.renderer.camera.fov), 60);
    assert.equal(await ms(() => document.getElementById('chip-spacing')), null, 'the spacing toast is gone');

    for (const [X, Y, Z] of [[8, 8, 8]]) { // a cube preset: the fast tests hold the rule for every box
      await ms(([x, y, z]) => globalThis.__ms.start(x, y, z, 10), [X, Y, Z]);
      await ms(() => globalThis.__ms.forcePlay());
      assert.match(await strip3d(), /X spacing 1\.1/, 'the strip shows the spacing');
      // inside a corner cube, looking into the box along +Z: that cube and the next are glass
      const inside = await ms(() => {
        const ms3 = globalThis.__ms, c = ms3.cellCenter(0);
        ms3.moveTo(c[0], c[1], c[2]);
        ms3.look(Math.PI, 0);
        return ms3.selected();
      });
      const g = await ms(() => ({ X: globalThis.__ms.game.X, Y: globalThis.__ms.game.Y }));
      assert.equal(inside, 2 * g.X * g.Y, `${X}³: the crosshair selects the first cube beyond the glass`);
      // a cube in the fade band, measured from the camera, stays pickable
      const band = await ms(() => {
        const ms3 = globalThis.__ms, c = ms3.cellCenter(0);
        ms3.moveTo(c[0], c[1], c[2] - 7);
        ms3.look(Math.PI, 0);
        return ms3.selected();
      });
      assert.equal(band, 0, `${X}³: a cube 7 units ahead, in the band, is aimed`);
      await ms(() => { const ms3 = globalThis.__ms, c = ms3.cellCenter(0); ms3.moveTo(c[0], c[1], c[2]); });
      await frames();
      const stats = await ms(() => globalThis.__ms.renderer.stats);
      assert.ok(stats.trans > 0 && stats.trans < 30, `${X}³: only the cells around the camera are transparent (${stats.trans})`);
    }

    // the wheel: one notch is 0.1, the camera keeps its cell-unit place
    await ms(() => globalThis.__ms.start(8, 8, 8, 10));
    await ms(() => globalThis.__ms.forcePlay());
    const sample = () => ms(() => {
      const ms3 = globalThis.__ms, c = ms3.camera, s = ms3.state.spacing, g = ms3.game, p = 4 * s;
      return [c.x / p + (g.X - 1) / 2, c.y / p + (g.Y - 1) / 2, c.z / p + (g.Z - 1) / 2].map((v) => Math.round(v * 1e6));
    });
    const before = await sample();
    const aimed = await ms(() => globalThis.__ms.selected());
    await ms(() => globalThis.__ms.wheel(1));
    close(await ms(() => globalThis.__ms.state.spacing), 1.2);
    assert.match(await strip3d(), /X spacing 1\.2/);
    assert.deepEqual(await sample(), before, 'the camera scaled with the spacing');
    assert.equal(await ms(() => globalThis.__ms.selected()), aimed, 'the aimed cube stays aimed');

    // X: to 2.0 and back to 1.1, not while paused
    const press = (code) => ms((c) => {
      window.dispatchEvent(new KeyboardEvent('keydown', { code: c, key: c, cancelable: true }));
      window.dispatchEvent(new KeyboardEvent('keyup', { code: c, key: c }));
    }, code);
    await press('KeyX');
    assert.equal(await ms(() => globalThis.__ms.state.spacing), 2);
    assert.match(await strip3d(), /X spacing 2\.0/);
    assert.deepEqual(await sample(), before);
    await press('KeyX');
    close(await ms(() => globalThis.__ms.state.spacing), SPACING_START);
    await ms(() => globalThis.__ms.pause());
    await press('KeyX');
    close(await ms(() => globalThis.__ms.state.spacing), SPACING_START, 1e-9, 'X does nothing while paused');

    // the field of view: the setting moves the camera's fov at once
    await ms(() => globalThis.__ms.settings.set('fieldOfView', 80));
    assert.equal(await ms(() => globalThis.__ms.renderer.camera.fov), 80);
    const proj = await ms(() => globalThis.__ms.renderer.camera.projectionMatrix.elements[5]);
    close(proj, 1 / Math.tan(40 * DEG), 1e-6, 'the projection follows');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
