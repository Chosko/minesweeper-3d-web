// 3D replay viewer (replay-playback): the recorded camera track (js/replay/viewer-3d.js) — position,
// yaw and pitch held through a still stretch and interpolated over the last sampling interval
// before the next sample, held after the movement cap, the recorded view mode,
// the camera in world units — the 3D viewer over the simulator's 3D state view, its wiring in
// js/main.js (the box viewer, the replay camera that ignores player input, a lost graphics context),
// and in a browser a recorded 3D replay from tests/fixtures/replays/ played through to the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  cameraTrack, cameraAt, viewModeAt, viewToggles, worldPose, createViewer3D,
} from '../js/replay/viewer-3d.js';
import { cameraSample, POSITION_STEPS, ANGLE_STEPS, VIEW_MODE } from '../js/replay/sampler-3d.js';
import { createReplayViewer, FAILURES } from '../js/replay/viewer.js';
import { createSimulator } from '../js/replay/simulator.js';
import { decodeReplay, encodeReplay } from '../js/replay/format.js';
import { REPLAY_SCREEN } from '../js/records/replay-list.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
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

test('the recorded camera holds each sample, then interpolates over the last interval before the next', () => {
  const track = cameraTrack([sample(0, [0, 0, 0, 0, 0]), sample(100, [16, 0, 0, 0, 0]), sample(600, [48, 16, 0, ANGLE_STEPS / 4, 0])], null, 100);
  assert.equal(track.interval, 100);
  assert.deepEqual(cameraAt(track, 50), [0.5, 0, 0, 0, 0], 'a gap of exactly one interval interpolates throughout');
  assert.deepEqual(cameraAt(track, 300), [1, 0, 0, 0, 0], 'a still stretch holds the earlier sample');
  assert.deepEqual(cameraAt(track, 500), [1, 0, 0, 0, 0], 'held until one interval before the next sample');
  const mid = cameraAt(track, 550);
  assert.deepEqual(mid.slice(0, 3), [2, 0.5, 0], 'then interpolated linearly to it');
  assert.ok(near(mid[3], TURN / 8));
  assert.deepEqual(cameraAt(track, 600).slice(0, 3), [3, 1, 0]);
});

test('across a gap shorter than the interval the camera interpolates throughout', () => {
  const track = cameraTrack([sample(0, [0, 0, 0, 0, 0]), sample(100, [16, 0, 0, 0, 0]), sample(400, [64, 0, 0, 0, 0])], null, 200);
  assert.deepEqual(cameraAt(track, 50), [0.5, 0, 0, 0, 0]);
  assert.deepEqual(cameraAt(track, 200), [1, 0, 0, 0, 0], 'a longer gap holds until one interval before');
  assert.deepEqual(cameraAt(track, 300), [2.5, 0, 0, 0, 0]);
});

test('the camera track takes the 3D recording interval unless given one; the 3D viewer takes the replay\'s', () => {
  assert.equal(cameraTrack([]).interval, 100);
  const sim = createSimulator(blobOf(CUBE));
  const viewer = createViewer3D({ sim, scene: fakeScene(), spacing: 1 });
  assert.equal(sim.replay.sampleIntervalMs, 100);
  assert.equal(viewer.track.interval, sim.replay.sampleIntervalMs);
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
    shown: [], poses: [], toggles: [], hidden: 0, free: [], rings: [], tints: [],
    show(view) { scene.shown.push(view); },
    camera(pose, toggles) { scene.poses.push(pose); scene.toggles.push(toggles); },
    detach(on) { scene.free.push(on); },
    ring(cell, kind) { scene.rings.push([cell, kind]); },
    tint(tints) { scene.tints.push(tints); },
    hide() { scene.hidden++; },
  };
  return scene;
}

test('Free detaches the camera at its pose while the recorded view mode still applies; Follow returns to the recorded camera now', () => {
  const sim = createSimulator(blobOf(CUBE));
  const scene = fakeScene();
  const viewer = createViewer3D({ sim, scene, spacing: 1.1 });
  viewer.draw(sim.seek(1000));
  viewer.setFree(true);
  assert.deepEqual(scene.free, [true]);
  const placed = scene.poses.length;
  viewer.draw(sim.seek(4000));
  assert.equal(scene.poses.at(-1), null, 'the recording no longer places the camera');
  assert.equal(scene.poses.length, placed + 1);
  assert.equal(scene.toggles.at(-1).shift, true, 'the recorded view mode still applies');
  viewer.setFree(false);
  assert.deepEqual(scene.free, [true, false]);
  assert.deepEqual(scene.poses.at(-1), worldPose(cameraAt(viewer.track, 4000), sim.grid, 1.1), 'back to the recorded camera at the current time');
});

test('a 3D press ring sits on the acted cell; Show 3BV hands the scene a tint per cell', () => {
  const sim = createSimulator(blobOf(CUBE));
  const scene = fakeScene();
  const viewer = createViewer3D({ sim, scene, spacing: 1.1 });
  const a = sim.replay.actions[1];
  viewer.press([{ index: 1, ...a }]);
  assert.deepEqual(scene.rings, [[a.cell, a.kind]]);
  const tints = new Int16Array(216).fill(2);
  viewer.showBbbv(tints);
  viewer.showBbbv(null);
  assert.deepEqual(scene.tints, [tints, null]);
});

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

test('a 3D replay shows the live figures of its frame, following a seek forward and back, against the box\'s bests stored now', async () => {
  const asked = [];
  let last = null;
  const view = { open() {}, close() {}, loading() {}, failed() {}, ready: () => ({}), render(state) { last = state; } };
  const router = { current: REPLAY_SCREEN, go() {}, refocus() {} };
  const viewer = createReplayViewer({
    library: null, router, view,
    viewers: { box: () => ({ draw() {}, destroy() {} }) },
    bests: (board) => { asked.push(board); return { time: { value: 20000 }, bbbvPerSecond: { value: 0.5 } }; },
  });
  await viewer.show({ replay: blobOf(CUBE) });
  assert.deepEqual(asked, [createSimulator(blobOf(CUBE)).replay.header.board], 'the box board\'s bests');
  const at = () => ['bbbv', 'clicks', 'flags'].map((name) => [last.live[name].text, last.live[name].detail]);
  viewer.seek(6559);
  assert.deepEqual(at(), [['4 / 35', null], ['8', 'Efficiency 50.0%'], ['1', '9 mines left']]);
  assert.deepEqual([last.live.pace.text, last.live.rate.text, last.live.rate.detail], ['+4.273 s', '0.61', 'Best 0.50']);
  viewer.seek(5000);
  assert.deepEqual(at(), [['1 / 35', null], ['5', 'Efficiency 20.0%'], ['0', '10 mines left']], 'a seek back');
  viewer.seek(13578);
  assert.deepEqual(at(), [['11 / 35', null], ['14', 'Efficiency 78.6%'], ['1', '9 mines left']], 'the end');
});

test('a 3D replay opens on the scene: the screen lets the 3D scene show', () => {
  const src = read('js/replay/viewer.js');
  assert.match(src, /replay--scene/, 'the view marks a 3D replay');
  const theme = read('themes/joyful-tiles/theme.css');
  assert.match(theme, /#replay\.replay--scene\s*\{[^}]*background: transparent/);
  assert.match(theme, /#replay\.replay--scene #replay-frame\s*\{[^}]*background: transparent/, 'the frame\'s window lets the scene through');
});

test('the 3D viewer is DOM-free and reaches no records, sound, pause or player input', () => {
  const src = read('js/replay/viewer-3d.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(src, /document|window|audio\.js|records\/store|mode-host|pause\.js|input\.js|controls\.js/);
});

// ---------------------------------------------------------------- wiring

const MAIN = read('js/main.js');

test('the shell registers the 3D viewer under the box graph, with its own camera that player input moves only in Free', () => {
  const block = MAIN.slice(MAIN.indexOf('const REPLAY_VIEWER = createReplayViewer('), MAIN.indexOf('// ---------- results ----------'));
  assert.match(block, /viewers: WEBGL2 \? \{ square: mountReplay2D, box: mountReplay3D \}/);
  assert.match(MAIN, /createViewer3D\(\{ sim, scene: REPLAY_SCENE, spacing: REPLAY_SPACING \}\)/);
  assert.match(MAIN, /const replayCam = new FlyCamera\(\)/);
  const show = MAIN.slice(MAIN.indexOf('const REPLAY_SCENE = {'), MAIN.indexOf('hide()', MAIN.indexOf('const REPLAY_SCENE = {')));
  assert.match(show, /replayCam\.place\(spawnPose\(view, REPLAY_SPACING, renderer\.camera\.fov, renderer\.camera\.aspect\)\)/,
    'before its first sample the replay\'s camera is at the spawn pose a game starts at');
  assert.match(MAIN, /const REPLAY_SPACING = SPACING_START;/, 'drawn at the spacing a game starts at');
  const loop = MAIN.slice(MAIN.indexOf('function frame(now)'), MAIN.indexOf('requestAnimationFrame(frame);\n}'));
  const branch = loop.slice(loop.indexOf('} else if (replay3d.view) {'), loop.indexOf('} else {', loop.indexOf('} else if (replay3d.view) {')));
  assert.match(branch, /replayCam\.apply\(three\)/);
  assert.doesNotMatch(branch, /cam\.move|moveAxes|controls\./, 'no player movement or held keys in the branch itself');
  assert.match(branch, /if \(replay3d\.free\) flyReplay\(dt\)/, 'Free flies the replay camera');
  const fly = MAIN.slice(MAIN.indexOf('function flyReplay('), MAIN.indexOf('\n}\n', MAIN.indexOf('function flyReplay(')));
  assert.match(fly, /replayCam\.move\(dt, input\.move\)/, 'the game\'s movement keys');
  assert.match(fly, /moveAxes\(/, 'the controller sticks');
  const scene = MAIN.slice(MAIN.indexOf('const REPLAY_SCENE = {'), MAIN.indexOf('\n};\n', MAIN.indexOf('const REPLAY_SCENE = {')));
  assert.match(scene, /const at = renderer\.cellScreen\(cell\);\s*if \(at\) ui\.replayRing\(at\.x, at\.y, kind\);/, 'a 3D press ring on the cell\'s projection');
  assert.match(fly, /needRender = true/, 'flying a paused replay draws');
});

test('while a 3D replay shows, the game\'s chips and toast stay hidden and the viewer shows its own key line', () => {
  const ui = read('js/ui.js');
  const show = ui.slice(ui.indexOf('showReplay() {'), ui.indexOf('\n  }\n', ui.indexOf('showReplay() {')));
  assert.match(show, /classList\.add\('replaying'\)/);
  assert.match(ui, /toast\(msg, ms = 2200\) \{\s*if \(this\._replaying\) return;/, 'no toast while the viewer shows');
  assert.match(read('css/style.css'), /body\.replaying :is\(#mode-chips, #hud-tools, #hint-strip, #toast\) \{ display: none; \}/);
  assert.match(MAIN, /hide: \(\) => \{ REPLAY_VIEWER\.hide\(\); ui\.hideReplay\(\); \}/, 'leaving restores the game\'s chrome');
});

test('whatever moves a 3D replay outside its playback is a seek for the renderer, which drops its pulses', () => {
  const loop = MAIN.slice(MAIN.indexOf('function frame(now)'), MAIN.indexOf('requestAnimationFrame(frame);\n}'));
  const seek = loop.indexOf('renderer.sync({ seek: true })');
  assert.ok(seek >= 0, 'a replay time moved since the last frame is synced as a seek');
  assert.ok(seek < loop.indexOf('REPLAY_VIEWER.tick('), 'before the playback advances');
  assert.ok(loop.indexOf('REPLAY_VIEWER.tick(') < loop.indexOf('const synced = renderer.sync();'), 'playback\'s own changes sync as play');
});

test('a lost graphics context is reported as a mode\'s failure, during a 3D replay and when one opens after it', () => {
  const handler = MAIN.slice(MAIN.indexOf("canvas.addEventListener('webglcontextlost'"), MAIN.indexOf('/** Dead canvas'));
  assert.match(handler, /SHELL\.go\('ctxlost'\)/);
  const mount = MAIN.slice(MAIN.indexOf('function mountReplay3D('), MAIN.indexOf('\n}\n', MAIN.indexOf('function mountReplay3D(')));
  assert.match(mount, /if \(contextLost\)[^\n]*SHELL\.go\('ctxlost'\)/);
  assert.notEqual(FAILURES.unsupported, undefined);
});

// ---------------------------------------------------------------- in a browser

test('[slow] in a browser, a recorded 3D replay plays from its fixture through to the end', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
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
    const scene = await page.evaluate(() => {
      const style = (id) => getComputedStyle(document.getElementById(id));
      const canvas = globalThis.__ms.renderer.renderer.domElement;
      const box = canvas.getBoundingClientRect();
      return { frame: style('replay-frame').backgroundColor, body: style('replay-body').backgroundColor,
        full: box.width === innerWidth && box.height === innerHeight && canvas.style.clipPath === '' && style('menu').display === 'none',
        title: /^Replay · 3D · Cube /.test(document.getElementById('replay-title').textContent) };
    });
    assert.deepEqual(scene, { frame: 'rgba(0, 0, 0, 0)', body: 'rgba(0, 0, 0, 0)', full: true, title: true },
      'the 3D scene stays full-window behind the frame, whose window lets it through, and no menu preview takes it from under the viewer');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas').length), 0, 'no 2D board view');

    // The camera follows the recording and the view mode is applied; player input does not move it.
    const expected = (t) => page.evaluate(async (time) => {
      const m = await import('/js/replay/viewer-3d.js');
      const { decodeReplay } = await import('/js/replay/format.js');
      const replay = decodeReplay(new Uint8Array(await (await fetch('/tests/fixtures/replays/3d-cube-beginner-lost.msrp')).arrayBuffer()));
      const track = m.cameraTrack(replay.movement, replay.header.movementEndedAt, replay.sampleIntervalMs);
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

    // Playback shows the "solved" pulse of the numbers it hides (two at 6559 ms); a seek drops it at once.
    const pulses = () => page.evaluate(() => globalThis.__ms.renderer._pulses.size);
    // A frame stalled past the pulse can miss it under load: play over the hides again until one is seen.
    let seen = false;
    for (let attempt = 0; attempt < 5 && !seen; attempt++) {
      await page.evaluate(() => { const v = globalThis.__ms.replayViewer; v.seek(6300); if (!v.state.playing) v.command('toggle'); });
      const outcome = await page.waitForFunction(() => {
        const v = globalThis.__ms.replayViewer;
        if (globalThis.__ms.renderer._pulses.size > 0) { v.seek(4000); return 'seen'; }
        return v.state.time > 7200 ? 'missed' : false;
      }, null, { polling: 'raf', timeout: patience(5000) });
      seen = (await outcome.jsonValue()) === 'seen';
    }
    assert.ok(seen, 'playback over the hides shows their pulse');
    await frames();
    assert.equal(await pulses(), 0, 'a seek leaves no pulsing cube');
    await page.evaluate(() => globalThis.__ms.replayViewer.command('toggle'));
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.playing), false);
    await page.evaluate(() => globalThis.__ms.replayViewer.seek(7500));
    await frames();
    assert.equal(await pulses(), 0, 'a seek over the hides starts no pulse');

    await page.click('#rp-speed [data-value="4"]');
    await page.click('#rp-play');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: patience(15000) });
    assert.equal(await text('replay-end'), 'Lost 13.578 s');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.state), 'lost');
    // Back before the loss, the end-of-game effect stops and the board is in play again.
    await page.keyboard.press('Home');
    await frames();
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.state), 'playing');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer._eff === null && globalThis.__ms.renderer._shake === null), true);
    // Replay chrome, not the game's: no chips, no toast, the viewer's key line.
    const hidden = (sel) => page.evaluate((s) => { const e = document.querySelector(s); return !e || getComputedStyle(e).display === 'none' || e.offsetParent === null; }, sel);
    for (const sel of ['#chip-shift', '#chip-space', '#chip-ctrl', '#hud-tools', '#toast']) assert.equal(await hidden(sel), true, `${sel} hidden`);
    assert.match(await text('rp-keys'), /C.*Free camera/);
    assert.equal(await hidden('#rp-camera'), false, 'the Follow / Free toggle shows in 3D');

    // Free camera: C detaches it, the movement keys fly it while playback runs on; C again follows the recording.
    await page.evaluate(() => globalThis.__ms.replayViewer.seek(4000));
    await frames();
    await page.evaluate(() => { document.activeElement?.blur(); });
    await page.keyboard.press('KeyC');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.camera), 'free');
    const detached = await camera();
    await page.keyboard.down('KeyW');
    await frames();
    await frames();
    await page.keyboard.up('KeyW');
    const flown = await camera();
    assert.ok(Math.hypot(flown.x - detached.x, flown.y - detached.y, flown.z - detached.z) > 1e-3, 'W flies the free camera');
    await page.keyboard.press('KeyC');
    await frames();
    got = await camera();
    for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(got[k] - want[k]) < 1e-6, `back on the recorded camera: ${k}`);

    // Show 3BV tints the cubes; a step to an action shows its press ring on the scene.
    await page.keyboard.press('KeyB');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.uniforms.uRegionOn.value), 1, 'the renderer takes the tints');
    assert.ok(await page.evaluate(() => { const t = globalThis.__ms.renderer.regionTex.image.data; return t.some((v, i) => i % 4 === 3 && v > 0); }));
    await page.keyboard.press('KeyB');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.uniforms.uRegionOn.value), 0);
    // The 3D ring sits on the acted cell's projection: a camera aimed at a cell projects it to the canvas centre, one facing away to nothing.
    const projected = await page.evaluate(() => {
      const r = globalThis.__ms.renderer, c = r.camera;
      const saved = { p: c.position.clone(), q: c.quaternion.clone() };
      c.position.set(30, 20, 40);
      c.lookAt(2.2, 2.2, 2.2); // cell (3, 3, 3) of the 6 × 6 × 6 box at pitch 4.4
      const front = r.cellScreen(129);
      c.lookAt(60, 40, 80);
      const behind = r.cellScreen(129);
      c.position.copy(saved.p); c.quaternion.copy(saved.q); c.updateMatrixWorld(true);
      return { front, behind, w: r.canvas.clientWidth, h: r.canvas.clientHeight };
    });
    assert.ok(Math.abs(projected.front.x - projected.w / 2) < 1 && Math.abs(projected.front.y - projected.h / 2) < 1, 'on the aimed cell');
    assert.equal(projected.behind, null, 'none behind the camera');


    await page.click('#rp-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer.game.n), demo, 'the menu\'s board is back');
    assert.equal(await page.evaluate(() => document.body.classList.contains('replaying')), false, 'the game\'s chrome is restored');

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
    await browser.close();
  }
});
