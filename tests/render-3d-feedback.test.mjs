// 3D small feedback in the renderer: Ctrl draws hidden cells as ghosts at GHOST_ALPHA in the
// transparent pass instead of opaque, and a number the player could see plays a short "solved"
// pulse — brighter and larger, then fading out — after the engine hides it, the theme's solved-pulse
// cell motion (tests/render-3d-motion.test.mjs covers the motion mesh); the drawing is checked in a
// browser through `__ms`. The scene is
// drawn from the board module the shell hands in: the atlas, the sky and fog, the selection — outline,
// glow line and face tint —, the marked start cell's tint and the win confetti's colours.
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
const { GHOST_ALPHA } = await import('../js/render.js');
const TEX = await import('../js/textures.js');
const { createCellMotion } = await import('../js/cell-motion.js');
const { BOARD } = await import('../themes/joyful-tiles/board.js');
const RENDER = read('js/render.js');
const TEXTURES = read('js/textures.js');
const PULSE = BOARD.motion.solvedPulse;

// ---------------------------------------------------------------- the board module

test('the atlas keeps its layer order and adds the sunk closed face after it', () => {
  assert.deepEqual([TEX.L_CLOSED, TEX.L_FLAG, TEX.L_MINE, TEX.L_MINE_EXPLODED, TEX.L_NUM0], [0, 1, 2, 3, 4]);
  assert.equal(TEX.L_WRONG_FLAG, TEX.L_NUM0 + 27, 'numbers 0–26, then the wrong flag');
  assert.equal(TEX.L_SUNK, TEX.L_NUM0 + 28, 'then the sunk closed face');
  assert.equal(TEX.LAYERS, TEX.L_SUNK + 1);
  assert.equal(TEX.drawLayer.length, 3, 'drawLayer(ctx, layer, board)');
  assert.equal(TEX.createTileTexture.length, 1, 'createTileTexture(board)');
});

test('the atlas holds no palette and no picture: every colour is the board module\'s, drawn through the recipe', () => {
  const code = TEXTURES.replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'no colour of its own');
  assert.doesNotMatch(code, /\bImage\(|\.png|\.webp|fetch\(|import\s*\(/, 'no shipped picture');
  assert.match(code, /from '\.\/tile-art\.js'/, 'drawn through the shared recipe');
  assert.match(code, /board\.style3d/, 'in the theme\'s 3D style');
  assert.match(code, /board\.palette\.faces3d/, 'with the theme\'s 3D faces');
});

// A Canvas 2D context recording each call with the fill and stroke styles in force.
function recordingContext() {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', lineWidth: 1, font: '', lineCap: 'butt' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (prop === 'measureText') return (text) => ({ width: 60 * String(text).length, actualBoundingBoxAscent: 120, actualBoundingBoxDescent: 0 });
      if (prop in target) return target[prop];
      return (...args) => calls.push({ op: prop, args, fill: target.fillStyle, stroke: target.strokeStyle });
    },
    set(target, prop, value) { target[prop] = value; calls.push({ op: `set:${String(prop)}`, args: [value] }); return true; },
  });
}

test('the atlas draws the Joyful tiles glyphs: the knobbed ink mine, the cross in its own red, two-digit numbers at a single digit\'s height', () => {
  for (const layer of [TEX.L_MINE, TEX.L_MINE_EXPLODED]) {
    const ctx = recordingContext();
    TEX.drawLayer(ctx, layer, BOARD);
    const knobs = ctx.calls.filter((c) => c.op === 'arc' && Math.hypot(c.args[0], c.args[1]) > TEX.TILE * 0.25);
    assert.equal(knobs.length, 8, `layer ${layer}: eight knobs`);
    assert.ok(knobs.every((c) => c.fill === '#16204a'), `layer ${layer}: in ink`);
    const reach = Math.max(...knobs.map((c) => Math.hypot(c.args[0], c.args[1]) + c.args[2]));
    assert.ok(Math.abs(TEX.TILE / 2 - reach - 31) <= 1 && Math.abs(TEX.TILE / 2 + reach - 224) <= 1.5, `layer ${layer}: the glyph box runs 31-224`);
    assert.ok(ctx.calls.some((c) => c.op === 'arc' && c.fill === '#ffffff'), `layer ${layer}: an opaque white highlight`);
  }
  const cross = recordingContext();
  TEX.drawLayer(cross, TEX.L_WRONG_FLAG, BOARD);
  assert.equal(cross.calls.filter((c) => c.op === 'stroke').at(-1).stroke, '#c62f2f', 'the cross in its own red');
  assert.equal(cross.calls.filter((c) => c.op === 'set:lineCap').at(-1).args[0], 'butt', 'with butt ends');
  for (const n of [9, 10, 26]) {
    const ctx = recordingContext();
    TEX.drawLayer(ctx, TEX.L_NUM0 + n, BOARD);
    const font = ctx.calls.filter((c) => c.op === 'set:font').at(-1).args[0];
    assert.match(font, new RegExp(`^800 ${TEX.TILE * 0.68}px "Rubik"`), `${n} set at 0.68 of the tile`);
  }
});

test('the renderer takes a board module: it rebuilds its atlas and sky on one, imports no theme and holds no palette', () => {
  assert.doesNotMatch(RENDER, /from '\.\/(themes|shell\/scene-palette|tokens)/, 'imports no theme, no token reader');
  const setBoard = RENDER.slice(RENDER.indexOf('\n  setBoard(board) {'), RENDER.indexOf('\n  }\n', RENDER.indexOf('\n  setBoard(board) {')));
  assert.ok(setBoard.length > 20, 'setBoard(board) is defined');
  assert.match(setBoard, /createTileTexture\(board\)|_buildAtlas\(board\)/, 'the atlas is rebuilt from it');
  assert.match(setBoard, /board\.sky/, 'the sky comes from it');
  assert.match(setBoard, /sky\.fog \?\? sky\.horizon/, 'the fog defaults to the horizon');
  assert.match(setBoard, /selectionUniforms\(board\)/, 'the selection comes from it');
  assert.match(setBoard, /board\.mark/, 'the marked start cell\'s tint comes from it');
  const frag = RENDER.slice(RENDER.indexOf('const FRAG ='), RENDER.indexOf('const SKY_VERT'));
  assert.doesNotMatch(frag, /vec3\(1\.0, 0\.27, 0\.42\)|vec3\(0\.18, 0\.72, 0\.36\)/, 'no constant outline or mark colour');
  assert.match(frag, /uSelOutline/, 'the outline in the theme\'s colour');
  assert.match(frag, /max\(uSelWidth\.x, uSelWidth\.y \* fw\)/, 'and width: max(face × the face, px)');
  assert.match(frag, /mix\(rgb, uMarkTint, mix\(uMarkMix\.x, uMarkMix\.y, uMarkPulse\) \* vMark\)/, 'the mark tint, its mix swelling to its pulse mix');
  const ground = RENDER.slice(RENDER.indexOf('const SKY_FRAG'));
  assert.match(ground, /dot\(uSkyHorizon, vec3\(0\.2126, 0\.7152, 0\.0722\)\)/, 'the ground grid keeps deriving its ink from the horizon');
});

// ---------------------------------------------------------------- the ghosts

test('Ctrl ghosts are one named alpha, 0.25, used by the shader for hidden cells under Ctrl', () => {
  assert.equal(GHOST_ALPHA, 0.25);
  const vert = RENDER.slice(RENDER.indexOf('const VERT ='), RENDER.indexOf('const FRAG ='));
  assert.match(vert, /else if \(kind == 4\) \{[^\n]*uCtrl > 0\.5[^\n]*a = \$\{GHOST_ALPHA\}/, 'a hidden cell under Ctrl takes the ghost alpha');
  assert.match(vert, /bool want = uPass < 0\.5 \? a > 0\.99 : \(a < 0\.99/, 'so it is drawn in a transparent pass');
});

test('the opaque list leaves hidden cells to the transparent pass under Ctrl, and the sort takes them', () => {
  const opaque = RENDER.slice(RENDER.indexOf('  _rebuildOpaque() {'), RENDER.indexOf('  _applyShiftOpaque() {'));
  assert.doesNotMatch(opaque, /kd === K_HIDDEN && \(ctrl \|\|/, 'hidden cells are no longer opaque under Ctrl');
  const trans = RENDER.slice(RENDER.indexOf('  _updateTransparent() {'), RENDER.indexOf('  /** Advances time-based effects'));
  assert.match(trans, /if \(!shift && !space && !ctrl\)/, 'the transparent pass runs while Ctrl is held');
  assert.match(trans, /ctrl && kd === K_HIDDEN/, 'and sorts the hidden cells back-to-front with the rest');
  const toggles = RENDER.slice(RENDER.indexOf('  setToggles('), RENDER.indexOf('  setSpacing('));
  assert.match(toggles, /t\.ctrl !== ctrl/, 'a Ctrl change re-sorts the transparent list');
});

// ---------------------------------------------------------------- the solved pulse

test('the solved pulse rises, then fades out to nothing in under half a second', () => {
  assert.ok(PULSE.duration <= 500, `${PULSE.duration} ms in all`);
  let clock = 0;
  const player = createCellMotion({ now: () => clock });
  const at = (t) => player.valuesAt(t).get(1);
  player.start(1, 'solvedPulse', 'number', 'number', PULSE);
  assert.deepEqual([at(0).scale, at(0).brightness, at(0).opacity], [1, 1, 1], 'it starts as the cube was');
  let prev = at(0), peak = 0;
  for (let t = 10; t <= 250; t += 10) {
    const v = at(t);
    assert.ok(v.scale >= prev.scale && v.brightness >= prev.brightness && v.opacity === 1, `rising and whole at ${t}`);
    prev = v;
    peak = t;
  }
  assert.ok(prev.scale > 1 && prev.brightness > 1, `it grows and brightens by ${peak} ms`);
  for (let t = 260; t < PULSE.duration; t += 10) {
    const v = at(t);
    assert.ok(v.opacity <= prev.opacity && v.opacity > 0, `fading at ${t}`);
    prev = v;
  }
  assert.ok(at(PULSE.duration - 10).opacity < 1, 'it fades');
  assert.equal(player.valuesAt(PULSE.duration).size, 0, 'gone at the end');
  assert.equal(player.animating(PULSE.duration), false);
  clock = 0;
});

test('pulses start when a visible number hides, end with the game\'s loss or a seek, and keep the effects ticking', () => {
  const sync = RENDER.slice(RENDER.indexOf('  sync('), RENDER.indexOf('  /**\n   * Opaque instance list.'));
  assert.match(sync, /cellEvent\(was, K\[i\]\)/, 'a number the player could see that hid is a solved pulse (cellEvent)');
  assert.match(sync, /this\._startMotion\(i, event,/, 'a cell shown again plays no event, which drops its pulse');
  assert.match(sync, /if \(seek\) this\.dropMotion\(\)/, 'a seek drops every pulse');
  assert.match(sync, /g\.state === 'lost'\) \{ this\.dropMotion\(\); this\._beginLoss\(dirty\)/, 'a loss drops them for its wave');
  assert.match(RENDER, /isAnimating\(\) \{\n {4}return [^\n]*this\.motion\.animating\(/, 'render-on-demand draws while one runs');
  const tick = RENDER.slice(RENDER.indexOf('  _tickMotion('), RENDER.indexOf('\n  }\n', RENDER.indexOf('  _tickMotion(')));
  assert.match(tick, /for \(const \[i, v\] of values\)/, 'each frame visits the pulsing cells only');
  assert.doesNotMatch(tick, /this\.n\b|< n;/, 'never the whole board');
});

// ---------------------------------------------------------------- the target rectangle

test('the renderer draws into a target rectangle: viewport, scissor and camera aspect from it, re-applied on resize', () => {
  const target = RENDER.slice(RENDER.indexOf('  setTarget('), RENDER.indexOf('  setGame('));
  assert.match(target, /if \(!rect\) this\._target = null/, 'null is the full window');
  assert.match(target, /this\.resize\(\)/, 'a new target is applied at once');
  const resize = target.slice(target.indexOf('  resize() {'));
  assert.match(resize, /setViewport\(/, 'the viewport is the rectangle');
  assert.match(resize, /setScissor\(/, 'and nothing is drawn outside it');
  assert.match(resize, /setScissorTest\(true\)/);
  assert.match(resize, /setScissorTest\(false\)/, 'the full window draws without a scissor');
  assert.match(resize, /camera\.aspect = t\.width \/ Math\.max\(1, t\.height\)/, 'the camera takes the rectangle\'s aspect');
  const pr = RENDER.slice(RENDER.indexOf('  setPixelRatio('), RENDER.indexOf('  resize() {'));
  assert.match(pr, /this\.resize\(\)/, 'a pixel-ratio change re-applies it');
  const render = RENDER.slice(RENDER.indexOf('  render() {'));
  assert.match(render, /if \(this\._target\) \{[^}]*setScissorTest\(false\)[^}]*setClearAlpha\(0\)[^}]*clear\(\)/, 'a frame first clears the whole canvas to transparent, so the page shows outside the rectangle');
});

// ---------------------------------------------------------------- in a browser

test('in a browser, a solved number stops being drawn, and Ctrl draws hidden cells as transparent ghosts that stay unpickable', async (t) => {
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
    const frames = () => ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const stats = async () => { await frames(); return ms(() => ({ ...globalThis.__ms.renderer.stats })); };
    const act = (cell, type) => ms(([c, k]) => {
      if (globalThis.__ms.aimAt(c) !== c) throw new Error(`cell ${c} could not be aimed at`);
      globalThis.__ms.click(k);
    }, [cell, type]);

    // A row of six: mines at 0 and 3; 1 and 2 show a 1. Flagging 0 solves 1, which hides.
    await ms(() => { globalThis.__ms.start(6, 1, 1, 2, [0, 3]); globalThis.__ms.forcePlay(); });
    await act(1, 'left');
    await act(2, 'left');
    await ms(() => globalThis.__ms.aimAt(0));
    await page.waitForFunction(() => !globalThis.__ms.renderer.isAnimating(), null, { timeout: 8000 }); // the aim's glow settles
    const plain = await stats();
    assert.deepEqual([plain.opaque, plain.trans], [6, 0], 'every cube opaque, nothing transparent');

    // The flag hides the 1; once its pulse has played, the renderer stops asking for frames.
    await ms(() => globalThis.__ms.click('right'));
    await page.waitForFunction(() => !globalThis.__ms.renderer.isAnimating(), null, { timeout: 8000 });
    assert.equal(await ms(() => globalThis.__ms.game.unlinked[1]), 1, 'the engine hid the cell');
    assert.notEqual(await ms(() => globalThis.__ms.aimAt(1)), 1, 'and picking passes through it');
    await ms(() => globalThis.__ms.aimAt(0));
    const hidden = await stats();
    assert.deepEqual([hidden.opaque, hidden.trans], [5, 0], 'the hidden 1 is not drawn');

    // Ctrl: the hidden 1 counts in the transparent pass, not the opaque one; releasing it hides it again.
    await ms(() => globalThis.__ms.key('ControlLeft'));
    const ghosts = await stats();
    assert.deepEqual([ghosts.opaque, ghosts.trans], [5, 1], 'a ghost in the transparent pass');
    await ms(() => globalThis.__ms.key('ShiftLeft'));
    const shifted = await stats();
    assert.deepEqual([shifted.opaque, shifted.trans], [1, 6], 'with Shift too the ghost stays in the transparent pass');
    assert.notEqual(await ms(() => globalThis.__ms.aimAt(1)), 1, 'hidden cells stay unpickable under Ctrl');
    await ms(() => globalThis.__ms.aimAt(0));
    await ms(() => globalThis.__ms.key('ShiftLeft', false));
    await ms(() => globalThis.__ms.key('ControlLeft', false));
    const released = await stats();
    assert.deepEqual([released.opaque, released.trans], [5, 0], 'released: hidden again');

    // Unflagging shows the 1 again, drawn as before.
    await act(0, 'right');
    await page.waitForFunction(() => !globalThis.__ms.renderer.isAnimating(), null, { timeout: 8000 });
    const shown = await stats();
    assert.deepEqual([shown.opaque, shown.trans], [6, 0], 'the 1 is drawn normally');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- in a browser: the board module

// J-3DSheet's atlas: the closed cube's thin edge and four lit sides round its face, the revealed cube
// flat cream inside its edge (page "Joyful tiles").
const J3D = {
  edge: '#4a7bdb', top: '#b3d0fc', left: '#98befa', right: '#5e92ec', bottom: '#5385e4', face: '#78aaf8',
  revealedEdge: '#ddd3c1', revealed: '#f3f0ea',
};
const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const near = (got, hex, what) => {
  const want = rgb(hex);
  assert.ok(got.every((v, i) => Math.abs(v - want[i]) <= 2), `${what}: ${got} is ${hex} (${want})`);
};

test('in a browser, the Joyful tiles atlas samples as J-3DSheet: bevelled closed and flagged cubes, flat revealed cubes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    const px = await page.evaluate(async () => {
      const tex = await import('/js/textures.js');
      const { BOARD } = await import('/themes/joyful-tiles/board.js');
      const canvas = document.createElement('canvas');
      canvas.width = tex.TILE;
      canvas.height = tex.TILE;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const S = tex.TILE;
      const at = { edge: [S / 2, 3], top: [S / 2, 13], left: [13, S / 2], right: [S - 13, S / 2], bottom: [S / 2, S - 13], face: [S / 2, S / 2] };
      const sample = (layer) => {
        tex.drawLayer(ctx, layer, BOARD);
        const out = {};
        for (const [k, [x, y]] of Object.entries(at)) out[k] = [...ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data].slice(0, 3);
        return out;
      };
      return { closed: sample(tex.L_CLOSED), flag: sample(tex.L_FLAG), sunk: sample(tex.L_SUNK), zero: sample(tex.L_NUM0) };
    });
    for (const side of ['edge', 'top', 'left', 'right', 'bottom', 'face']) near(px.closed[side], J3D[side], `closed ${side}`);
    for (const side of ['edge', 'top', 'left', 'right', 'bottom']) near(px.flag[side], J3D[side], `flagged ${side}`);
    near(px.sunk.top, J3D.bottom, 'the sunk face turns its top side over');
    near(px.sunk.bottom, J3D.top, 'and its bottom side');
    near(px.zero.edge, J3D.revealedEdge, 'revealed edge');
    for (const side of ['top', 'left', 'right', 'bottom', 'face']) near(px.zero[side], J3D.revealed, `revealed flat at the ${side}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, switching theme in a 3D game changes the atlas and the sky and nothing in the game', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && !!globalThis.__ms.renderer.board);
    const look = () => page.evaluate(async () => {
      const tex = await import('/js/textures.js');
      const r = globalThis.__ms.renderer;
      const g = globalThis.__ms.game;
      const { data } = r.tiles.image;
      const S = tex.TILE;
      const texel = (layer, x, y) => [...data.subarray((layer * S * S + y * S + x) * 4, (layer * S * S + y * S + x) * 4 + 3)];
      return {
        sky: r.scenePalette, closed: texel(tex.L_CLOSED, S / 2, S / 2), top: texel(tex.L_CLOSED, S / 2, 13),
        game: { state: g.state, version: g.version, flagged: [...g.flagged].join(''), number: [...g.number].join(',') },
        mode: globalThis.__ms.state.mode,
      };
    });
    // A 3D game with one cell revealed.
    await page.evaluate(() => { globalThis.__ms.start(6, 1, 1, 2, [0, 3]); globalThis.__ms.forcePlay(); });
    await page.evaluate(() => {
      const c = 1;
      if (globalThis.__ms.aimAt(c) !== c) throw new Error('cell could not be aimed at');
      globalThis.__ms.click('left');
    });
    const before = await look();
    assert.deepEqual(before.sky.horizon, [0x2b, 0x3f, 0x8a], 'Joyful tiles\' horizon');
    assert.deepEqual(before.sky.fog, [0x2b, 0x3f, 0x8a], 'its fog');
    near(before.closed, J3D.face, 'Joyful tiles\' closed face');
    await page.evaluate(async () => {
      const { registerTheme } = await import('/js/themes/registry.js');
      const { FIXTURE_THEME } = await import('/tests/fixtures/themes/fixture-theme.js');
      const { themeApplier } = await import('/js/themes/applier.js');
      registerTheme(FIXTURE_THEME);
      await themeApplier().setTheme(FIXTURE_THEME.id);
    });
    await page.waitForFunction(() => globalThis.__ms.renderer.board?.fixture === 'fixture-dusk');
    const after = await look();
    assert.deepEqual(after.sky.horizon, [0x33, 0x41, 0x5d], 'the fixture\'s horizon');
    assert.deepEqual(after.sky.zenith, [0x0b, 0x14, 0x24], 'its zenith');
    assert.deepEqual(after.sky.fog, after.sky.horizon, 'a module with no fog fogs toward its horizon');
    assert.notDeepEqual(after.closed, before.closed, 'the atlas is rebuilt');
    assert.notDeepEqual(after.top, before.top, 'its bevel too');
    assert.deepEqual(after.game, before.game, 'the game is untouched');
    assert.equal(after.mode, before.mode);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// J-3DSheet's selection and confetti (page "Joyful tiles", panels "Selection, start cell, view modes,
// waves" and "Confetti").
const J3D_SEL = { outline: '#16204a', glow: '#ffc93c', tint: [1, 0.86, 0.84] };
const J3D_CONFETTI = ['#ff6b6b', '#ffc93c', '#49c6b8', '#78aaf8', '#6d4ee8', '#ffffff', '#ff8c42'];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('in a browser, a selected cube under Joyful tiles samples as J-3DSheet: navy outline, a yellow glow line inside it, a coral-tinted face', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && !!globalThis.__ms.renderer.board);
    await page.evaluate(() => { globalThis.__ms.start(6, 1, 1, 2, [0, 3]); globalThis.__ms.forcePlay(); });
    // The camera straight in front of the closed cube 2, a few cubes away, aimed at its centre.
    const px = await page.evaluate(() => {
      const ms = globalThis.__ms, r = ms.renderer;
      const [x, y, z] = ms.cellCenter(2);
      ms.moveTo(x, y, z + 16);
      if (ms.aimAt(2) !== 2) throw new Error('cell 2 could not be aimed at');
      r._selAnim = false; // the aim's glow settled: its steady value
      const gl = r.renderer.getContext(), pr = r.renderer.getPixelRatio(), out = new Uint8Array(4);
      const c = r.cellScreen(2);
      const at = (x, y) => {
        gl.readPixels(Math.floor(x), Math.floor(gl.drawingBufferHeight - y - 1), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
        return [out[0], out[1], out[2]];
      };
      const cx = c.x * pr, cy = c.y * pr;
      r.render();
      const row = [];
      for (let dx = 0; dx < 220 * pr; dx++) row.push(at(cx + dx, cy));
      r.setSelected(-1);
      r.render();
      const plain = at(cx, cy);
      r.setSelected(2);
      return { row, plain, pr };
    });
    // The selected face is the plain face × the tint, give or take the selection's lighter face shade:
    // one common factor over the three channels.
    const face = px.row[0];
    const k = face.map((v, i) => v / (px.plain[i] * J3D_SEL.tint[i]));
    assert.ok(Math.max(...k) - Math.min(...k) <= 0.03 && Math.min(...k) >= 0.97 && Math.max(...k) <= 1.08,
      `the selected face ${face} is the plain face ${px.plain} × the tint ${J3D_SEL.tint} (${k.map((v) => v.toFixed(3))})`);
    const outline = rgb(J3D_SEL.outline);
    const o = px.row.findIndex((p) => dist(p, outline) <= 6);
    assert.ok(o > 0, `the outline in ${J3D_SEL.outline} along the face's middle row: ${JSON.stringify(px.row.slice(0, 120))}`);
    const run = px.row.slice(o).findIndex((p) => dist(p, outline) > 6);
    assert.ok(run >= Math.floor(3 * px.pr) - 1, `the outline at least 3 px wide (${run} device px)`);
    // Just inside the outline, the glow line: one pixel nearer its colour than the outline's or the face's.
    const glow = rgb(J3D_SEL.glow);
    const inside = px.row.slice(Math.max(0, o - 3 * px.pr), o);
    const best = inside.reduce((a, p) => (dist(p, glow) < dist(a, glow) ? p : a));
    assert.ok(dist(best, glow) < dist(best, outline) && dist(best, glow) < dist(best, face),
      `a glow line in ${J3D_SEL.glow} inside the outline: ${JSON.stringify(inside)}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, a frame of the win confetti under Joyful tiles shows J-3DSheet\'s seven colours', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 650 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu' && !!globalThis.__ms.renderer.board);
    // A row of six, mines at 0 and 3: revealing 1, 2 and 5 (which opens 4) wins.
    await page.evaluate(() => { globalThis.__ms.start(6, 1, 1, 2, [0, 3]); globalThis.__ms.forcePlay(); });
    for (const c of [1, 2, 5]) {
      await page.evaluate((cell) => {
        if (globalThis.__ms.aimAt(cell) !== cell) throw new Error(`cell ${cell} could not be aimed at`);
        globalThis.__ms.click('left');
      }, c);
    }
    await page.waitForFunction(() => globalThis.__ms.game.state === 'won' && globalThis.__ms.renderer.confetti.visible);
    await page.waitForTimeout(500); // the burst spread out
    // The confetti's own colours: each piece is its colour × (0.75 to 1) as it flips.
    const found = await page.evaluate((palette) => {
      const r = globalThis.__ms.renderer;
      r.render();
      const gl = r.renderer.getContext(), w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const buf = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
      const want = palette.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
      const seen = want.map(() => 0);
      for (let p = 0; p < w * h * 4; p += 4) {
        want.forEach((c, k) => {
          const m = Math.max(...c), s = Math.max(buf[p], buf[p + 1], buf[p + 2]) / m;
          if (s < 0.74 || s > 1.01) return;
          if (c.every((v, i) => Math.abs(v * s - buf[p + i]) <= 2)) seen[k]++;
        });
      }
      return seen;
    }, J3D_CONFETTI);
    J3D_CONFETTI.forEach((hex, k) => assert.ok(found[k] > 0, `confetti in ${hex}: ${found}`));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
