// 3D cell motion: the theme's cell motion played on the cubes. Animating cubes are drawn by one more
// instanced mesh from the cell motion player's values (js/cell-motion.js) — scale, offset, rotation,
// brightness, opacity, the face shown and the depth blend — while the cube's ordinary instance is
// hidden. Reveal, flag and unflag come from the engine's change lists, the solved pulse from the
// renderer's number-to-hidden detection; all of it is visual only and dropped on a new board, a seek,
// a loss, a pause hiding the board and a theme change. The pure parts run in Node; the mesh, the
// hidden instance, the solved pulse from the theme's description and the drops in a browser through
// `__ms`, on a renderer clock the test holds still.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
// js/render.js imports 'three' through the page's import map; Node resolves it to the vendored build.
const THREE_URL = pathToFileURL(join(ROOT, 'vendor/three/three.module.min.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : next(s, c);
}`)}`);
const THREE = await import(THREE_URL);
const { cellEvent, motionInstance, K_CLOSED, K_FLAG, K_NUMBER, K_MINE, K_HIDDEN } = await import('../js/render.js');
const { L_CLOSED, L_FLAG, L_NUM0, L_SUNK } = await import('../js/textures.js');
const { MOTION_CAP } = await import('../js/cell-motion.js');
const RENDER = read('js/render.js');
const body = (src, head) => src.slice(src.indexOf(head), src.indexOf('\n  }\n', src.indexOf(head)));
const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);

// ---------------------------------------------------------------- the event sources

test('a cell event from a change: reveal, flag and unflag from the change list, the solved pulse when a visible number hides', () => {
  assert.equal(cellEvent(K_CLOSED, K_NUMBER), 'reveal');
  assert.equal(cellEvent(K_CLOSED, K_HIDDEN), 'reveal', 'a zero, or a number hidden by the same action');
  assert.equal(cellEvent(K_CLOSED, K_MINE), 'reveal');
  assert.equal(cellEvent(K_CLOSED, K_FLAG), 'flag');
  assert.equal(cellEvent(K_FLAG, K_CLOSED), 'unflag');
  assert.equal(cellEvent(K_NUMBER, K_HIDDEN), 'solvedPulse');
  assert.equal(cellEvent(K_HIDDEN, K_NUMBER), null, 'a number shown again plays nothing');
  assert.equal(cellEvent(K_CLOSED, K_CLOSED), null, 'a cell whose kind did not change plays nothing');
  assert.equal(cellEvent(K_FLAG, K_NUMBER), null);
});

// ---------------------------------------------------------------- one instance

const REST = { event: 'reveal', scale: 1, offset: { x: 0, y: 0, z: 0 }, rotation: { axis: [0, 0, 1], angle: 0 }, depth: null, brightness: 1, opacity: 1 };
const camera = (yaw, pitch) => {
  const c = new THREE.PerspectiveCamera(60, 1, 1, 1000);
  c.rotation.order = 'YXZ';
  c.rotation.set(pitch, yaw, 0);
  c.position.set(3, -2, 5);
  c.updateMatrixWorld(true);
  return c;
};
const axes = (c) => {
  const e = c.matrixWorld.elements;
  return { right: [e[0], e[1], e[2]], up: [e[4], e[5], e[6]], back: [e[8], e[9], e[10]] };
};

test('an instance at rest is the face as it is: scale 1, no offset, no turn, its own brightness and opacity, no depth blend', () => {
  const m = motionInstance({ ...REST, face: { layer: L_NUM0 + 3, kind: K_NUMBER } }, camera(0, 0));
  assert.equal(m.scale, 1);
  assert.deepEqual(m.offset, [0, 0, 0]);
  assert.equal(m.angle, 0);
  assert.equal(m.bright, 0);
  assert.equal(m.alpha, 1);
  assert.equal(m.layer, L_NUM0 + 3);
  assert.equal(m.kind, K_NUMBER);
  assert.equal(m.sunk, 0);
});

test('offsets map x and y to the camera\'s screen axes and z toward the camera, in cube sizes', () => {
  for (const [yaw, pitch] of [[0, 0], [0.7, -0.4], [-2.1, 0.9]]) {
    const c = camera(yaw, pitch);
    const { right, up, back } = axes(c);
    const at = (offset) => motionInstance({ ...REST, offset, face: { layer: L_CLOSED, kind: K_CLOSED } }, c).offset;
    const x = at({ x: 0.5, y: 0, z: 0 }), y = at({ x: 0, y: 0.25, z: 0 }), z = at({ x: 0, y: 0, z: 1 });
    for (let k = 0; k < 3; k++) {
      close(x[k], 0.5 * 4 * right[k], `x along the screen's right (${yaw}, ${pitch})`);
      close(y[k], -0.25 * 4 * up[k], `y down the screen, as in 2D (${yaw}, ${pitch})`);
      close(z[k], 4 * back[k], `z toward the camera (${yaw}, ${pitch})`);
    }
  }
});

test('a rotation turns about its axis in the camera\'s frame, its angle in degrees', () => {
  const c = camera(0.7, -0.4);
  const { right, up } = axes(c);
  const m = motionInstance({ ...REST, rotation: { axis: [1, 0, 0], angle: 90 }, face: { layer: L_CLOSED, kind: K_CLOSED } }, c);
  close(m.angle, Math.PI / 2, 'radians');
  for (let k = 0; k < 3; k++) close(m.axis[k], right[k], 'the screen\'s x axis');
  const v = motionInstance({ ...REST, rotation: { axis: [0, 2, 0], angle: 30 }, face: { layer: L_CLOSED, kind: K_CLOSED } }, c);
  for (let k = 0; k < 3; k++) close(v.axis[k], -up[k], 'the screen\'s y axis, normalised');
});

test('brightness above 1 lifts the colour toward white by the excess, below 1 darkens it; opacity is the alpha', () => {
  const at = (brightness, opacity = 1) => motionInstance({ ...REST, brightness, opacity, face: { layer: L_NUM0 + 1, kind: K_NUMBER } }, camera(0, 0));
  close(at(1.45).bright, 0.45, 'the solved pulse\'s ×1.45 is 45 % toward white, as the reference pulse was');
  close(at(1.12).bright, 0.12);
  close(at(0.96).bright, -0.04, 'a darkening is a negative lift, multiplied in the shader');
  close(at(1, 0.5).alpha, 0.5);
});

test('the depth blend mixes a closed face toward the sunk face as the depth goes from raised to flat; other faces keep theirs', () => {
  const at = (depth, layer = L_CLOSED, kind = K_CLOSED) => motionInstance({ ...REST, depth, face: { layer, kind } }, camera(0, 0)).sunk;
  assert.equal(at(null), 0, 'no depth track: the face\'s own');
  assert.equal(at(1), 0, 'fully raised');
  close(at(0.25), 0.75, 'a quarter raised');
  assert.equal(at(0), 1, 'flat: the sunk face');
  assert.equal(at(1.1), 0, 'an overshoot draws fully raised');
  assert.equal(at(0, L_FLAG, K_FLAG), 0, 'the atlas has no sunk flag');
  assert.equal(at(0, L_NUM0 + 2, K_NUMBER), 0);
  assert.equal(L_SUNK, L_NUM0 + 28);
});

// ---------------------------------------------------------------- the renderer's source

test('one instanced motion mesh draws the animating cubes from the player, which the theme\'s descriptions drive', () => {
  assert.match(RENDER, /import \{ createCellMotion, MOTION_CAP \} from '\.\/cell-motion\.js';/);
  assert.match(RENDER, /this\.motion = createCellMotion\(\{ now: \(\) => this\.clock\(\) \}\)/, 'one player, on the renderer\'s clock');
  assert.match(RENDER, /this\.matMotion\.defines = \{ MOTION: '' \}/, 'its own shader branch');
  assert.doesNotMatch(RENDER, /PULSE: ''|_pulses|_pulseFx|pulseEnvelope/, 'the solved pulse is no longer a mesh and an envelope of its own');
  const start = body(RENDER, '  _startMotion(');
  assert.match(start, /this\.board\?\.motion\?\.\[event\]/, 'each event plays the theme\'s description for it');
  const tick = body(RENDER, '  _tickMotion(');
  assert.match(tick, /this\.motion\.valuesAt\(/, 'each frame takes the player\'s values');
  assert.doesNotMatch(tick, /this\.n\b|< n;/, 'and visits the animating cells only');
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /#if defined\(MOTION\)/);
  assert.match(vert, /st\.b > 0\.5/, 'the ordinary passes skip a cube that animates');
  assert.match(RENDER, /isAnimating\(\) \{\n {4}return [^\n]*this\.motion\.animating\(/, 'render-on-demand draws while a cell animates');
  assert.equal(MOTION_CAP > 0, true);
});

test('motion is visual only: the motion code writes no game state, picking never reads it, and no reduce-motion preference is read', () => {
  for (const head of ['  _startMotion(', '  _tickMotion(', '  dropMotion(']) {
    assert.doesNotMatch(body(RENDER, head), /\b(g|this\.game)\.\w+\s*(\[[^\]]*\])?\s*=[^=]/, `${head.trim()} writes no game state`);
  }
  assert.doesNotMatch(read('js/picking.js'), /render\.js|motion/i, 'picking uses the logical cell');
  for (const file of ['js/render.js', 'js/cell-motion.js']) assert.doesNotMatch(read(file), /matchMedia|prefers-reduced-motion/, `${file} ignores reduce-motion`);
});

test('motion drops on a new board, a seek, a loss, a theme change and a pause hiding the board', () => {
  assert.match(body(RENDER, '  setGame('), /this\.motion\.dropAll\(\)/, 'a new board');
  assert.match(body(RENDER, '  setBoard('), /this\.dropMotion\(\)/, 'a theme change');
  const sync = body(RENDER, '  sync(');
  assert.match(sync, /if \(seek\) this\.dropMotion\(\)/, 'a seek');
  assert.match(sync, /g\.state === 'lost'\) \{ this\.dropMotion\(\); this\._beginLoss\(dirty\)/, 'a loss, before its wave');
  assert.match(body(read('js/main.js'), 'function setBoardHidden('), /if \(on\) renderer\?\.dropMotion\(\)/, 'a pause hiding the board');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, a cube animates on the motion mesh with its ordinary instance hidden; the solved pulse plays the theme\'s description; motion drops; the game is the same with motion on or off', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    await page.emulateMedia({ reducedMotion: 'reduce' }); // cell motion plays all the same
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && !!globalThis.__ms.renderer.board);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    // A row of six: mines at 0 and 3; 1 and 2 show a 1. The renderer's clock stands still at `__t`.
    const setup = () => ms(() => {
      globalThis.__ms.start(6, 1, 1, 2, [0, 3]);
      globalThis.__ms.forcePlay();
      globalThis.__t = 10000;
      globalThis.__ms.renderer.clock = () => globalThis.__t;
    });
    const act = (cell, type) => ms(([c, k]) => {
      if (globalThis.__ms.aimAt(c) !== c) throw new Error(`cell ${c} could not be aimed at`);
      globalThis.__ms.click(k);
      globalThis.__ms.renderer.sync();
      return { state: globalThis.__ms.game.state, effect: globalThis.__ms.renderer._eff?.type ?? null };
    }, [cell, type]);
    // The motion mesh and the hidden flags at `t` ms after the clock's start, after one tick.
    const look = (t) => ms(async (at) => {
      const tex = await import('/js/textures.js');
      globalThis.__t = 10000 + at;
      const r = globalThis.__ms.renderer;
      r.render();
      const m = r.meshMotion;
      const n = m.visible ? m.geometry.instanceCount : 0;
      const g = m.geometry.attributes;
      const cells = [];
      for (let c = 0; c < n; c++) {
        cells.push({
          cell: g.aIdx.array[c], scale: g.aMotion.array[c * 4], bright: g.aMotion.array[c * 4 + 1], alpha: g.aMotion.array[c * 4 + 2],
          layer: g.aMotion.array[c * 4 + 3], kind: g.aMotionOffset.array[c * 4 + 3],
        });
      }
      cells.sort((a, b) => a.cell - b.cell);
      const hidden = [];
      for (let c = 0; c < r.n; c++) if (r.stateData[c * 4 + 2] > 0) hidden.push(c);
      const events = Object.fromEntries([...r.motion.valuesAt(r.clock())].map(([c, v]) => [c, v.event]));
      return { cells, hidden, events, animating: r.isAnimating() && r.motion.animating(), L_NUM0: tex.L_NUM0, L_CLOSED: tex.L_CLOSED, L_FLAG: tex.L_FLAG };
    }, t);
    const { BOARD } = await import(pathToFileURL(join(ROOT, 'themes/joyful-tiles/board.js')).href);

    // A reveal: the closed face until the theme's cut, then the number; the ordinary cube hidden throughout.
    await setup();
    await act(1, 'left');
    let s = await look(0);
    assert.deepEqual(s.events, { 1: 'reveal' });
    assert.deepEqual(s.cells.map((c) => c.cell), [1], 'one instance on the motion mesh');
    assert.equal(s.cells[0].layer, s.L_CLOSED, 'the closed face before the cut');
    assert.deepEqual(s.hidden, [1], 'its ordinary instance is hidden');
    s = await look(100);
    assert.equal(s.cells[0].layer, s.L_NUM0 + 1, 'the number after it');
    assert.equal(s.cells[0].kind, 2, 'drawn as a number under the view modes');
    s = await look(BOARD.motion.reveal.duration);
    assert.deepEqual([s.cells, s.hidden, s.animating], [[], [], false], 'over: the ordinary cube shows again');

    // A flag on 0 solves the 1, which hides: the flag and the solved pulse play together.
    await ms(() => { globalThis.__t = 15000; });
    await act(2, 'left');
    await ms(() => { globalThis.__t = 20000; });
    await act(0, 'right');
    const pulse = BOARD.motion.solvedPulse;
    s = await look(10000 + 120);
    assert.deepEqual(s.events, { 0: 'flag', 1: 'solvedPulse' });
    assert.deepEqual(s.hidden, [0, 1]);
    assert.equal(s.cells.find((c) => c.cell === 0).layer, s.L_FLAG, 'the flag face past the theme\'s cut');
    let p = s.cells.find((c) => c.cell === 1);
    assert.equal(p.layer, s.L_NUM0 + 1, 'the pulse draws the number it was');
    assert.equal(p.kind, 2);
    assert.ok(Math.abs(p.scale - 1.08) < 1e-6 && Math.abs(p.bright - 0.25) < 1e-6, 'J-3DSheet\'s first step: ×1.08, 25 % toward white');
    s = await look(10000 + 250);
    assert.deepEqual(s.events, { 1: 'solvedPulse' }, 'the flag is over');
    p = s.cells.find((c) => c.cell === 1);
    assert.ok(Math.abs(p.scale - 1.15) < 1e-6 && Math.abs(p.bright - 0.45) < 1e-6 && p.alpha === 1, 'its peak: ×1.15, 45 % toward white');
    s = await look(10000 + 400);
    assert.ok(Math.abs(s.cells[0].alpha - 0.25) < 1e-6, 'fading');
    assert.equal(await ms(() => globalThis.__ms.game.unlinked[1]), 1, 'the engine hid the cell at once');
    assert.notEqual(await ms(() => globalThis.__ms.aimAt(1)), 1, 'and picking passes through it');
    s = await look(10000 + pulse.duration);
    assert.deepEqual([s.cells, s.hidden], [[], []], 'the pulse is over');

    // The solved pulse is the theme's description: another description plays another pulse; none, no pulse.
    const slow = { duration: 1000, easing: 'linear', tracks: [{ property: 'scale', keyframes: [{ at: 0, value: 1 }, { at: 1000, value: 2 }] }] };
    await ms(async (d) => {
      const { BOARD: b } = await import('/themes/joyful-tiles/board.js');
      globalThis.__ms.renderer.setBoard({ ...b, motion: { ...b.motion, solvedPulse: d } });
      globalThis.__t = 40000;
    }, slow);
    await act(0, 'right'); // unflag: the 1 shows again
    await act(0, 'right'); // flag: it hides and pulses
    s = await look(30000 + 500);
    assert.ok(Math.abs(s.cells.find((c) => c.cell === 1).scale - 1.5) < 1e-6, 'halfway through the theme\'s own pulse');
    await ms(async () => {
      const { BOARD: b } = await import('/themes/joyful-tiles/board.js');
      globalThis.__ms.renderer.setBoard({ ...b, motion: { ...b.motion, solvedPulse: null, flag: null, unflag: null } });
      globalThis.__t = 50000;
    });
    s = await look(40000);
    assert.deepEqual([s.cells, s.hidden, s.animating], [[], [], false], 'a theme change dropped the pulse');
    await act(0, 'right');
    await act(0, 'right');
    s = await look(40000);
    assert.deepEqual([s.cells, s.hidden], [[], []], 'a theme that leaves the pulse still plays none');
    await ms(async () => {
      const { BOARD: b } = await import('/themes/joyful-tiles/board.js');
      globalThis.__ms.renderer.setBoard(b);
    });

    // The drops: a seek, a pause hiding the board, a new board, a loss.
    const running = async () => { await ms(() => { globalThis.__t = 60000; }); await act(0, 'right'); return (await look(50000)).cells.length; };
    assert.ok(await running() > 0);
    await ms(() => globalThis.__ms.renderer.sync({ seek: true }));
    assert.deepEqual((await look(50000)).cells, [], 'a seek drops motion');
    assert.ok(await running() > 0);
    await ms(() => globalThis.__ms.pause());
    assert.deepEqual((await look(50000)).cells, [], 'a pause hiding the board drops it');
    await setup();
    await act(2, 'left');
    assert.ok((await look(0)).cells.length > 0);
    assert.deepEqual(await act(3, 'left'), { state: 'lost', effect: 'loss' }, 'the mine: lost, its wave runs');
    s = await look(0);
    assert.deepEqual([s.cells, s.hidden], [[], []], 'a loss drops motion');
    // A win: the win wave plays the winning action's cubes, so they take no reveal motion.
    await setup();
    await act(1, 'left');
    await act(2, 'left');
    await ms(() => { globalThis.__t = 30000; });
    assert.deepEqual(await act(5, 'left'), { state: 'won', effect: 'win' }, 'the win wave starts on the ordinary cubes'); // 5 is a zero: it opens 4 too, the last safe cells
    s = await look(20000);
    assert.deepEqual([s.cells, s.hidden], [[], []], 'no revealed cube on the motion mesh');
    await setup();
    await act(1, 'left');
    await ms(() => globalThis.__ms.start(6, 1, 1, 2, [0, 3]));
    s = await look(0);
    assert.deepEqual([s.cells, s.hidden], [[], []], 'a new board drops motion');

    // The game is the same with motion on or off: the same moves, the same states and picking.
    const play = (still) => page.evaluate(async (off) => {
      const { BOARD } = await import('/themes/joyful-tiles/board.js');
      const r = globalThis.__ms.renderer;
      r.setBoard(off ? { ...BOARD, motion: Object.fromEntries(Object.keys(BOARD.motion).map((k) => [k, null])) } : BOARD);
      globalThis.__ms.start(6, 1, 1, 2, [0, 3]);
      globalThis.__ms.forcePlay();
      const out = [];
      for (const [c, k] of [[1, 'left'], [2, 'left'], [0, 'right'], [0, 'right'], [0, 'right']]) {
        if (globalThis.__ms.aimAt(c) !== c) throw new Error(`cell ${c} could not be aimed at`);
        globalThis.__ms.click(k);
        r.sync();
        r.render();
        const g = globalThis.__ms.game;
        out.push({ state: g.state, version: g.version, flagged: [...g.flagged].join(''), pressed: [...g.pressed].join(''), unlinked: [...g.unlinked].join(''), aim: globalThis.__ms.aimAt(1) });
      }
      return { out, animating: r.motion.animating() };
    }, still);
    const on = await play(false);
    const off = await play(true);
    assert.equal(on.animating, true, 'motion ran');
    assert.equal(off.animating, false, 'none ran');
    assert.deepEqual(on.out, off.out, 'the same game, the same picking');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
