// 3D replay viewer (replay-playback): the recorded camera track (js/replay/viewer-3d.js) — position,
// yaw and pitch interpolated between samples, held after the movement cap, the recorded view mode,
// the camera in world units — the 3D viewer over the simulator's 3D state view, its wiring in
// js/main.js (the box viewer, the replay camera that ignores player input, a lost graphics context),
// and in a browser a recorded 3D replay from tests/fixtures/replays/ played through to the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  cameraTrack, cameraAt, viewModeAt, viewToggles, worldPose, createViewer3D,
} from '../js/replay/viewer-3d.js';
import { cameraSample, POSITION_STEPS, ANGLE_STEPS, VIEW_MODE } from '../js/replay/sampler-3d.js';
import { createReplayViewer, FAILURES } from '../js/replay/viewer.js';
import { createSimulator } from '../js/replay/simulator.js';
import { decodeReplay, encodeReplay } from '../js/replay/format.js';
import { REPLAY_SCREEN } from '../js/records/replay-list.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const blobOf = (file) => new Uint8Array(readFileSync(new URL(file, FIXTURES)));
const CUBE = '3d-cube-beginner-lost.msrp';
const TURN = 2 * Math.PI;
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;
const sample = (time, values) => ({ time, type: 'sample', values });

// ---------------------------------------------------------------- the camera track

test('the recorded camera is interpolated linearly between samples, in cells and radians', () => {
  const track = cameraTrack([
    sample(100, [0, 16, 32, 0, 0]),
    { time: 100, type: 'view', mode: 0 },
    sample(200, [16, 16, 0, ANGLE_STEPS / 4, -ANGLE_STEPS / 8]),
  ]);
  assert.deepEqual(cameraAt(track, 100), [0, 1, 2, 0, 0]);
  const mid = cameraAt(track, 150);
  assert.deepEqual(mid.slice(0, 3), [0.5, 1, 1]);
  assert.ok(near(mid[3], TURN / 8) && near(mid[4], -TURN / 16), 'yaw and pitch halfway');
  const end = cameraAt(track, 200);
  assert.ok(near(end[3], TURN / 4) && near(end[4], -TURN / 8));
  assert.deepEqual(cameraAt(track, 5000), end, 'held at the last sample');
  assert.deepEqual(cameraAt(track, 0), [0, 1, 2, 0, 0], 'before the first sample, the first one');
  assert.equal(cameraAt(cameraTrack([]), 100), null, 'no samples, no recorded camera');
});

test('the yaw keeps its whole turns, so the camera turns the way it was turned', () => {
  const track = cameraTrack([sample(0, [0, 0, 0, ANGLE_STEPS - 64, 0]), sample(100, [0, 0, 0, ANGLE_STEPS + 64, 0])]);
  const yaw = cameraAt(track, 50)[3];
  assert.ok(near(yaw, TURN), `through a whole turn, not back across it (${yaw})`);
});

test('after the point where the movement was capped, the camera holds its last recorded position', () => {
  const track = cameraTrack([sample(0, [0, 0, 0, 0, 0]), sample(100, [16, 0, 0, 0, 0]), sample(300, [48, 0, 0, 0, 0])], 200);
  assert.deepEqual(cameraAt(track, 50), [0.5, 0, 0, 0, 0], 'before the cap, interpolated as usual');
  assert.deepEqual(cameraAt(track, 200), [1, 0, 0, 0, 0], 'at the cap, the last sample recorded before it');
  assert.deepEqual(cameraAt(track, 250), [1, 0, 0, 0, 0], 'nothing past the cap is followed');
  assert.deepEqual(cameraAt(track, 9000), [1, 0, 0, 0, 0]);
});

test('a capped recording from a fixture holds its last camera to the end of the replay', () => {
  const replay = decodeReplay(blobOf(CUBE));
  const cap = 5000;
  replay.movement = replay.movement.filter((e) => e.time < cap);
  replay.header.movementEndedAt = cap;
  const sim = createSimulator(encodeReplay(replay));
  const scene = fakeScene();
  const viewer = createViewer3D({ sim, scene, spacing: 1 });
  const last = replay.movement.filter((e) => e.type === 'sample').at(-1);
  const held = worldPose(cameraAt(viewer.track, last.time), sim.grid, 1);
  for (const t of [cap, 8000, sim.duration]) {
    viewer.draw(sim.seek(t));
    assert.deepEqual(scene.poses.at(-1), held, `held at ${t} ms`);
  }
});

test('the recorded view mode is the last one at or before the time, as Shift, Space and Ctrl', () => {
  const track = cameraTrack([
    { time: 10, type: 'view', mode: 0 },
    { time: 500, type: 'view', mode: VIEW_MODE.shift | VIEW_MODE.ctrl },
    { time: 900, type: 'view', mode: VIEW_MODE.space },
  ]);
  assert.equal(viewModeAt(track, 0), 0, 'none before the first');
  assert.equal(viewModeAt(track, 499), 0);
  assert.equal(viewModeAt(track, 500), VIEW_MODE.shift | VIEW_MODE.ctrl);
  assert.equal(viewModeAt(track, 5000), VIEW_MODE.space);
  assert.deepEqual(viewToggles(VIEW_MODE.shift | VIEW_MODE.ctrl), { shift: true, space: false, ctrl: true });
  assert.deepEqual(viewToggles(0), { shift: false, space: false, ctrl: false });
});

test('the recorded camera lands where it was in the world, at any spacing', () => {
  const board = { X: 6, Y: 4, Z: 9 };
  for (const spacing of [1, 1.1, 2.5]) {
    const camera = { x: 3.2 * spacing, y: -7.5 * spacing, z: 40 * spacing, yaw: 7.1, pitch: -0.4 };
    const track = cameraTrack([sample(0, cameraSample(camera, board, spacing))]);
    const pose = worldPose(cameraAt(track, 0), board, spacing);
    const step = 4 * spacing / POSITION_STEPS;
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(pose[k] - camera[k]) <= step / 2 + 1e-9, `${k} within half a step`);
    for (const k of ['yaw', 'pitch']) assert.ok(Math.abs(pose[k] - camera[k]) <= TURN / ANGLE_STEPS / 2 + 1e-9, `${k} within half a step`);
  }
});

// ---------------------------------------------------------------- the 3D viewer

function fakeScene() {
  const scene = {
    shown: [], poses: [], toggles: [], hidden: 0,
    show(view) { scene.shown.push(view); },
    camera(pose, toggles) { scene.poses.push(pose); scene.toggles.push(toggles); },
    hide() { scene.hidden++; },
  };
  return scene;
}

test('a 3D replay draws the simulator\'s 3D state view, its changes marked for the renderer', () => {
  const sim = createSimulator(blobOf(CUBE));
  const scene = fakeScene();
  const viewer = createViewer3D({ sim, scene, spacing: 1.1 });
  assert.equal(scene.shown.length, 1);
  const view = scene.shown[0];
  assert.equal(view, viewer.view);
  assert.deepEqual([view.X, view.Y, view.Z, view.n], [6, 6, 6, 216]);
  viewer.draw(sim.seek(0));
  view.consumeDirty();
  const v0 = view.version;
  const frame = sim.seek(4000);
  viewer.draw(frame);
  assert.ok(frame.changed.length > 0);
  assert.ok(view.version > v0, 'the change counter moved');
  assert.deepEqual([...view.consumeDirty()].sort((a, b) => a - b), [...frame.changed]);
  for (const c of frame.changed) assert.equal(view.pressed[c], sim.game.state.revealed[c], `cell ${c} as the simulator has it`);
  viewer.destroy();
  assert.equal(scene.hidden, 1);
});

test('each frame places the camera from the recording and applies the recorded view mode', () => {
  const sim = createSimulator(blobOf(CUBE));
  const scene = fakeScene();
  const viewer = createViewer3D({ sim, scene, spacing: 1.1 });
  for (const t of [0, 1075, 4000, 7000]) {
    viewer.draw(sim.seek(t));
    assert.deepEqual(scene.poses.at(-1), worldPose(cameraAt(viewer.track, t), sim.grid, 1.1), `the camera at ${t} ms`);
    assert.deepEqual(scene.toggles.at(-1), viewToggles(viewModeAt(viewer.track, t)));
  }
  viewer.draw(sim.seek(4000));
  assert.equal(scene.toggles.at(-1).shift, true, 'the fixture holds Shift from 3.7 s');
});

test('crossing the end of the game either way marks every cell, so the loss view comes and goes whole', () => {
  const sim = createSimulator(blobOf(CUBE));
  const scene = fakeScene();
  const viewer = createViewer3D({ sim, scene, spacing: 1 });
  const view = viewer.view;
  viewer.draw(sim.seek(5000));
  view.consumeDirty();
  viewer.draw(sim.seek(sim.duration));
  assert.equal(view.state, 'lost');
  assert.equal(view.consumeDirty().length, view.n, 'the loss view: every cell');
  viewer.draw(sim.seek(5000));
  assert.equal(view.state, 'playing');
  assert.equal(view.consumeDirty().length, view.n, 'back before the loss: every cell');
  assert.equal(view.pressed, sim.game.state.revealed, 'the engine\'s own arrays again');
});

// ---------------------------------------------------------------- the viewer screen

test('a viewer that leaves the screen while it mounts is dropped', async () => {
  const destroyed = [];
  let viewer = null;
  const view = { open() {}, close() {}, loading() {}, failed() {}, ready: () => ({}), render() {} };
  const router = { current: REPLAY_SCREEN, go() {}, refocus() {} };
  viewer = createReplayViewer({
    library: null, router, view,
    viewers: { box: () => { viewer.hide(); return { draw() { throw new Error('drawn after leaving'); }, destroy: () => destroyed.push(1) }; } },
  });
  await viewer.show({ replay: blobOf(CUBE) });
  assert.equal(viewer.state.status, 'closed');
  assert.deepEqual(destroyed, [1], 'the mounted viewer is destroyed');
});

test('a 3D replay opens on the scene: the screen lets the 3D scene show', () => {
  const src = read('js/replay/viewer.js');
  assert.match(src, /replay--scene/, 'the view marks a 3D replay');
  assert.match(read('css/style.css'), /#replay\.replay--scene\s*\{[^}]*background: transparent/);
});

test('the 3D viewer is DOM-free and reaches no records, sound, pause or player input', () => {
  const src = read('js/replay/viewer-3d.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /document|window|audio\.js|records\/store|mode-host|pause\.js|input\.js|controls\.js/);
});

// ---------------------------------------------------------------- wiring

const MAIN = read('js/main.js');

test('the shell registers the 3D viewer under the box graph, with its own camera that player input never moves', () => {
  const block = MAIN.slice(MAIN.indexOf('const REPLAY_VIEWER = createReplayViewer('), MAIN.indexOf('// ---------- results ----------'));
  assert.match(block, /viewers: \{ square: mountViewer2D, box: mountReplay3D \}/);
  assert.match(MAIN, /createViewer3D\(\{ sim, scene: REPLAY_SCENE, spacing: REPLAY_SPACING \}\)/);
  assert.match(MAIN, /const replayCam = new FlyCamera\(\)/);
  assert.match(MAIN, /const REPLAY_SPACING = SPACING_START;/, 'drawn at the spacing a game starts at');
  const loop = MAIN.slice(MAIN.indexOf('function frame(now)'), MAIN.indexOf('requestAnimationFrame(frame);\n}'));
  const branch = loop.slice(loop.indexOf('} else if (replay3d.view) {'), loop.indexOf('} else {', loop.indexOf('} else if (replay3d.view) {')));
  assert.match(branch, /replayCam\.apply\(three\)/);
  assert.doesNotMatch(branch, /cam\.move|moveAxes|controls\./, 'no player movement or held keys');
});

test('a lost graphics context is reported as a mode\'s failure, during a 3D replay and when one opens after it', () => {
  const handler = MAIN.slice(MAIN.indexOf("canvas.addEventListener('webglcontextlost'"), MAIN.indexOf('/** Dead canvas'));
  assert.match(handler, /SHELL\.go\('ctxlost'\)/);
  const mount = MAIN.slice(MAIN.indexOf('function mountReplay3D('), MAIN.indexOf('\n}\n', MAIN.indexOf('function mountReplay3D(')));
  assert.match(mount, /if \(contextLost\)[^\n]*SHELL\.go\('ctxlost'\)/);
  assert.notEqual(FAILURES.unsupported, undefined);
});

// ---------------------------------------------------------------- in a browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.msrp': 'application/octet-stream' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try { return await import(pathToFileURL(global).href); } catch { return null; }
  }
}
async function openBrowser(t) {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return null; }
  try {
    return await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return null;
  }
}

test('in a browser, a recorded 3D replay plays from its fixture through to the end', async (t) => {
  const browser = await openBrowser(t);
  if (!browser) return;
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const demo = await page.evaluate(() => globalThis.__ms.renderer.game.n);
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/3d-cube-beginner-lost.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);
    const frames = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'replay');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.n), 216, 'the renderer draws the replay\'s 6 × 6 × 6 box');
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('replay')).backgroundColor), 'rgba(0, 0, 0, 0)', 'the scene shows through');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas').length), 0, 'no 2D board view');

    // The camera follows the recording and the view mode is applied; player input does not move it.
    const expected = (t) => page.evaluate(async (time) => {
      const m = await import('/js/replay/viewer-3d.js');
      const { decodeReplay } = await import('/js/replay/format.js');
      const replay = decodeReplay(new Uint8Array(await (await fetch('/tests/fixtures/replays/3d-cube-beginner-lost.msrp')).arrayBuffer()));
      const track = m.cameraTrack(replay.movement, replay.header.movementEndedAt);
      const { SPACING_START } = await import('/js/input.js');
      return m.worldPose(m.cameraAt(track, time), { X: 6, Y: 6, Z: 6 }, SPACING_START);
    }, t);
    const camera = () => page.evaluate(() => {
      const c = globalThis.__ms.renderer.camera;
      return { x: c.position.x, y: c.position.y, z: c.position.z, toggles: { ...globalThis.__ms.renderer.toggles } };
    });
    await page.evaluate(() => globalThis.__ms.replayViewer.seek(4000));
    await frames();
    const want = await expected(4000);
    let got = await camera();
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(got[k] - want[k]) < 1e-6, `camera ${k} ${got[k]} vs ${want[k]}`);
    assert.deepEqual(got.toggles, { shift: true, space: false, ctrl: false }, 'the recorded Shift');
    await page.mouse.move(300, 300);
    await page.mouse.move(700, 500);
    await page.keyboard.down('KeyW');
    await frames();
    await page.keyboard.up('KeyW');
    got = await camera();
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(got[k] - want[k]) < 1e-6, `camera ${k} unmoved by the player`);

    await page.click('#rp-speed [data-value="4"]');
    await page.click('#rp-play');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: 15000 });
    assert.equal(await text('replay-end'), 'Lost · 13.5 s');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.state), 'lost');
    // Back before the loss, the end-of-game effect stops and the board is in play again.
    await page.keyboard.press('Home');
    await frames();
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.state), 'playing');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer._eff === null && globalThis.__ms.renderer._shake === null), true);
    await page.click('#rp-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.n), demo, 'the menu\'s board is back');

    // A lost graphics context during a 3D replay is reported as a mode's failure; Back still works.
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/3d-cube-beginner-lost.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    await page.evaluate(() => globalThis.__ms.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ctxlost');
    assert.equal(await page.evaluate(() => document.getElementById('ctx-lost').classList.contains('hidden')), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    server.close();
    await browser.close();
  }
});
