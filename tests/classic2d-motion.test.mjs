// Classic 2D cell motion (js/classic2d/motion-layer.js on js/cell-motion.js): the motion layer over
// the board canvas drawing only animating cells, frames only while a cell animates and no per-frame
// board redraw, the slot left empty for the animation's length, depth from the tile cache's fixed
// steps, the event sources — the inputs' pressed set (press, release, chord press) and the engine's
// change lists (reveal, flag, unflag), no solved pulse —, motion visual only (hit testing, game,
// timer and replay the same with motion on or off), the drops (new board, seek, pause, theme), no
// reduce-motion preference read, the replay viewer's frames, and in a browser a flood reveal on a
// 100 × 100 board within the frame budget behind MOTION_CAP.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createMotionLayer, changeEvent } from '../js/classic2d/motion-layer.js';
import { createBoardView, cellAtLayout } from '../js/classic2d/board-view.js';
import { createTileSkin, createBoardArt, DEPTH_STEPS } from '../js/classic2d/tile-skin.js';
import { createPointerInput, BUTTON } from '../js/classic2d/pointer-input.js';
import { createCursorInput } from '../js/classic2d/cursor-input.js';
import { createSession } from '../js/classic2d/session.js';
import { createViewer2D } from '../js/replay/viewer-2d.js';
import { MOTION_CAP } from '../js/cell-motion.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';
import { browserSuite } from './helpers/browser.mjs';
import { TIME_SLACK } from './helpers/timing.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const suite = browserSuite();
const SOURCES = ['js/classic2d/motion-layer.js', 'js/classic2d/board-view.js', 'js/cell-motion.js'];

// ---------- fakes ----------

function fakeContext(name) {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000', globalAlpha: 1, globalCompositeOperation: 'source-over', name };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (prop === 'getTransform') return () => ({ a: 1 });
      if (prop === 'measureText') return () => ({ width: 5, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 0 });
      return (...args) => { calls.push({ op: prop, args, fill: target.fillStyle, alpha: target.globalAlpha, composite: target.globalCompositeOperation }); };
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function fakeCanvas(name) {
  const ctx = fakeContext(name);
  return { width: 0, height: 0, style: {}, ctx, getContext: () => ctx };
}

// Animation frames run by hand.
function fakeFrames() {
  const queue = new Map();
  let next = 1;
  return {
    request(fn) { const id = next++; queue.set(id, fn); return id; },
    cancel(id) { queue.delete(id); },
    get pending() { return queue.size; },
    run() {
      const fns = [...queue.values()];
      queue.clear();
      for (const fn of fns) fn();
    },
  };
}

// A skin drawing from `board` (Joyful tiles by default; null for none), recording every tile drawn
// with the context it went to.
function fakeSkinFactory(board = JOYFUL) {
  const out = { draws: [], redraw: null };
  out.createSkin = ({ redraw }) => {
    out.redraw = redraw;
    return {
      drawTile(ctx, x, y, size, state, number, ratio, depth = null) { out.draws.push({ ctx: ctx.name, x, y, size, state, number, ratio, depth, alpha: ctx.globalAlpha }); },
      board: () => board,
      dispose() {},
    };
  };
  return out;
}

const REF = { profile: REFERENCE_PROFILE };
// 9 × 9 with mines on the right column and at (7, 0): revealing (0, 0) floods the left part.
function beginnerGame() {
  const grid = createSquareGrid(9, 9);
  const mines = [];
  for (let row = 0; row < 9; row++) mines.push(grid.index(8, row));
  mines.push(grid.index(7, 0));
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines, dimensions: { width: 9, height: 9 } });
  return { grid, game };
}

function makeView({ board = JOYFUL, layer = true, width = 600, height = 500 } = {}) {
  const { grid, game } = beginnerGame();
  const canvas = fakeCanvas('board');
  const layerCanvas = layer ? fakeCanvas('layer') : null;
  const skin = fakeSkinFactory(board);
  const frames = fakeFrames();
  const clock = { t: 1000 };
  const events = [];
  const view = createBoardView({
    canvas, grid, createSkin: skin.createSkin, scale: 'fit', layer: layerCanvas, frames, now: () => clock.t,
    token: () => '#111111', onMotion: (e) => events.push(e),
  });
  view.resize(width, height, 1);
  view.setGame(game);
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  return { grid, game, canvas, layerCanvas, skin, frames, clock, view, events };
}

const layerDraws = (h) => h.skin.draws.filter((d) => d.ctx === 'layer');
const boardDraws = (h) => h.skin.draws.filter((d) => d.ctx === 'board');
// Advances the clock by `ms` and runs one frame.
function step(h, ms) {
  h.clock.t += ms;
  h.skin.draws.length = 0;
  h.canvas.ctx.calls.length = 0;
  if (h.layerCanvas) h.layerCanvas.ctx.calls.length = 0;
  h.frames.run();
}

// ---------- static ----------

test('the motion layer is DOM-free at import, and no motion module reads a reduce-motion preference', () => {
  const layer = readFileSync(join(ROOT, 'js/classic2d/motion-layer.js'), 'utf8');
  assert.doesNotMatch(layer, /\b(document|window|requestAnimationFrame|localStorage)\b/);
  for (const file of SOURCES) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(src, /reduced?-motion/, file);
  }
});

test('Classic 2D has no solved pulse: neither the layer nor the view starts one', () => {
  for (const file of ['js/classic2d/motion-layer.js', 'js/classic2d/board-view.js']) {
    assert.doesNotMatch(readFileSync(join(ROOT, file), 'utf8'), /solvedPulse/, file);
  }
});

// ---------- the change list's events ----------

test('a changed cell\'s event comes from its state after the change: reveal, flag or unflag, with the face before', () => {
  assert.deepEqual(changeEvent(CELL.REVEALED, false), { event: 'reveal', before: 'closed' });
  assert.deepEqual(changeEvent(CELL.REVEALED, true), { event: 'reveal', before: 'pressed' }, 'a pressed cell opens from its pressed face');
  assert.deepEqual(changeEvent(CELL.EXPLODED, true), { event: 'reveal', before: 'pressed' });
  assert.deepEqual(changeEvent(CELL.MINE, false), { event: 'reveal', before: 'closed' });
  assert.deepEqual(changeEvent(CELL.WRONG_FLAG, false), { event: 'reveal', before: 'flagged' });
  assert.deepEqual(changeEvent(CELL.FLAGGED, false), { event: 'flag', before: 'closed' });
  assert.deepEqual(changeEvent(CELL.CLOSED, false), { event: 'unflag', before: 'flagged' });
  assert.equal(changeEvent('nonsense', false), null);
});

// ---------- the tile cache's depth steps ----------

test('depth draws from cached in-between faces at fixed steps, held per theme, size and pixel ratio', () => {
  assert.ok(DEPTH_STEPS.length >= 3 && DEPTH_STEPS.length <= 6, 'a few steps');
  assert.equal(DEPTH_STEPS[0], 0);
  assert.equal(DEPTH_STEPS.at(-1), 1);
  const art = createBoardArt();
  art.set('joyful-tiles', JOYFUL);
  const made = [];
  const createCanvas = (w, h) => { const c = fakeCanvas(`tile${made.length}`); c.width = w; c.height = h; made.push(c); return c; };
  const skin = createTileSkin({ art, createCanvas });
  const target = fakeContext('target');
  skin.drawTile(target, 0, 0, 30, 'closed', 0, 1);
  const built = made.length;
  assert.ok(built > 0);
  const image = (i) => target.calls.filter((c) => c.op === 'drawImage')[i].args[0];
  skin.drawTile(target, 0, 0, 30, 'closed', 0, 1, 0.4);
  skin.drawTile(target, 0, 0, 30, 'closed', 0, 1, 0.5);
  skin.drawTile(target, 0, 0, 30, 'pressed', 0, 1, 0.1);
  skin.drawTile(target, 0, 0, 30, 'flagged', 0, 1, 0.9);
  skin.drawTile(target, 0, 0, 30, 'closed', 0, 1, 1.1);
  assert.equal(made.length, built, 'every depth step was built with the cache: none on demand');
  assert.notEqual(image(1), image(0), 'an in-between face');
  assert.equal(image(2), image(1), 'depth rounds to the nearest step');
  assert.equal(image(5), image(0), 'an overshoot draws fully raised');
  skin.drawTile(target, 0, 0, 30, 'revealed', 3, 1, 0.5);
  assert.equal(image(6), (skin.drawTile(target, 0, 0, 30, 'revealed', 3, 1), image(7)), 'a revealed face has no depth');
  skin.drawTile(target, 0, 0, 31, 'closed', 0, 1, 0.5);
  assert.equal(made.length, 2 * built, 'a new size rebuilds the cache with its steps');
  skin.drawTile(target, 0, 0, 31, 'closed', 0, 2, 0.5);
  assert.equal(made.length, 3 * built, 'so does a new pixel ratio');
  art.set('other', JOYFUL);
  skin.drawTile(target, 0, 0, 31, 'closed', 0, 2, 0.5);
  assert.equal(made.length, 4 * built, 'and a new theme');
});

// ---------- the layer over the board ----------

test('a reveal animates the changed cells on the layer, the slots left empty on the board, and frames run only while a cell animates', () => {
  const h = makeView();
  assert.equal(h.frames.pending, 0, 'no frame while nothing animates');
  const r = h.game.reveal(0);
  const changed = [...r.changed];
  h.view.update(changed);
  const animating = h.view.motion.cells;
  assert.equal(animating.length, Math.min(changed.length, MOTION_CAP));
  assert.deepEqual(new Set(animating), new Set(changed));
  assert.equal(boardDraws(h).length, 0, 'the board draws no tile for an animating cell');
  const grounds = h.canvas.ctx.calls.filter((c) => c.op === 'fillRect');
  assert.ok(grounds.length >= changed.length, 'each animating slot is laid empty');
  assert.equal(h.frames.pending, 1);

  step(h, 16);
  assert.equal(h.canvas.ctx.calls.length, 0, 'nothing on the board canvas is redrawn per frame');
  assert.deepEqual(new Set(layerDraws(h).map((d) => d.state)), new Set(['closed']), 'the reveal shows the closed face before its cut');
  const placed = h.layerCanvas.ctx.calls.filter((c) => c.op === 'setTransform').length - 1; // one is the clear's
  assert.equal(placed, changed.length, 'only animating cells are drawn');
  assert.equal(h.frames.pending, 1);

  step(h, 100);
  assert.equal(h.canvas.ctx.calls.length, 0);
  assert.ok(layerDraws(h).every((d) => d.state === 'revealed'), 'past the cut the revealed face shows');

  step(h, JOYFUL.motion.reveal.duration);
  assert.deepEqual(h.view.motion.cells, []);
  assert.equal(layerDraws(h).length, 0);
  assert.deepEqual(new Set(boardDraws(h).map((d) => d.state)), new Set(['revealed']), 'the settled cells are drawn on the board');
  assert.equal(boardDraws(h).length, changed.length);
  assert.equal(h.frames.pending, 0, 'frames stop once nothing animates');
});

test('the layer draws each animating cell transformed by the player\'s values: scale, offset, opacity', () => {
  const h = makeView();
  h.game.toggleFlag(0);
  h.view.update([0]);
  step(h, 80); // the flag's peak: scale 1.18, offset y −0.15
  const transforms = h.layerCanvas.ctx.calls.filter((c) => c.op === 'setTransform');
  const { tile } = h.view.layout;
  const rect = h.view.cellRect(0);
  const last = transforms.at(-1).args;
  assert.ok(Math.abs(last[0] - 1.18) < 0.02, `scale ${last[0]}`);
  assert.ok(Math.abs(last[5] - (rect.y + tile / 2 - 0.15 * tile)) < 1, 'offset in tile sizes');
  assert.ok(Math.abs(last[4] - (rect.x + tile / 2)) < 1);
});

test('a press moves, shrinks and dims the closed face in the flat style, its pressed face only at the cut', () => {
  const h = makeView();
  assert.equal(JOYFUL.style2d.name, 'flat');
  h.view.setPressed([0], 'press');
  step(h, 45); // the board sheet's 45 ms: offset y .04, scale .98, brightness .97, the closed face
  const { tile } = h.view.layout;
  const rect = h.view.cellRect(0);
  const last = h.layerCanvas.ctx.calls.filter((c) => c.op === 'setTransform').at(-1).args;
  assert.ok(Math.abs(last[0] - 0.98) < 0.005, `scale ${last[0]}`);
  assert.ok(Math.abs(last[5] - (rect.y + tile / 2 + 0.04 * tile)) < 0.5, 'the offset is drawn in the flat style');
  assert.deepEqual(layerDraws(h).map((d) => d.state), ['closed'], 'the closed face until the cut');
  const dim = h.layerCanvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.composite === 'source-atop');
  assert.equal(dim.length, 1);
  assert.equal(dim[0].fill, '#000000');
  assert.ok(Math.abs(dim[0].alpha - 0.03) < 0.005, `darkened by the factor: ${dim[0].alpha}`);
});

test('depth is handed to the tile cache, which draws its nearest step', () => {
  const h = makeView();
  h.view.setPressed([0], 'chordPress');
  step(h, 45);
  const d = layerDraws(h)[0];
  assert.equal(d.state, 'closed', 'the chord press shows the closed face until its cut');
  assert.ok(d.depth > 0 && d.depth < 1, `the chord press animates depth: ${d.depth}`);
});

test('the layer draws brightness above 1 as a lift toward white and below 1 as a darkening, at the opacity', () => {
  const canvas = fakeCanvas('layer');
  const frames = fakeFrames();
  const painted = [];
  const layer = createMotionLayer({
    canvas, frames, now: () => 0,
    place: () => ({ x: 0, y: 0, size: 10 }),
    paint: (ctx) => painted.push({ alpha: ctx.globalAlpha, composite: ctx.globalCompositeOperation }),
  });
  layer.resize(100, 50, 1);
  const held = (brightness, opacity) => ({
    duration: 100, easing: 'linear',
    tracks: [{ property: 'brightness', keyframes: [{ at: 0, value: brightness }] }, { property: 'opacity', keyframes: [{ at: 0, value: opacity }] }],
  });
  const second = () => canvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.composite !== 'source-over');
  for (const [brightness, opacity, fill, alpha] of [[1.12, 0.6, '#ffffff', 0.12], [1.45, 1, '#ffffff', 0.45], [0.96, 1, '#000000', 0.04]]) {
    painted.length = 0;
    canvas.ctx.calls.length = 0;
    layer.start(1, 'reveal', 'closed', 'revealed', held(brightness, opacity));
    layer.frame();
    assert.deepEqual(painted, [{ alpha: opacity, composite: 'source-over' }], 'the cell is painted once, at its opacity');
    const pass = second();
    assert.equal(pass.length, 1, `brightness ${brightness}: one pass over the painted cell`);
    assert.equal(pass[0].composite, 'source-atop', 'only over the cell itself');
    assert.equal(pass[0].fill, fill, `brightness ${brightness} mixes toward ${fill}`);
    assert.ok(Math.abs(pass[0].alpha - alpha) < 1e-9, `by ${alpha}: ${pass[0].alpha}`);
  }
  painted.length = 0;
  canvas.ctx.calls.length = 0;
  layer.start(1, 'reveal', 'closed', 'revealed', held(1, 1));
  layer.frame();
  assert.equal(second().length, 0, 'brightness 1 draws the colour as it is');
  assert.equal(painted.length, 1);
});

test('a reveal fades and lifts the cell open: the board sheet\'s opacity and brightness on the layer', () => {
  const h = makeView();
  const r = h.game.reveal(h.grid.index(7, 1)); // a number beside the mines: one cell changes
  h.view.update([...r.changed]);
  step(h, 60);
  const [drawn] = layerDraws(h);
  assert.equal(drawn.state, 'revealed');
  assert.ok(Math.abs(drawn.alpha - 0.6) < 1e-6, `at the sheet's opacity .6: ${drawn.alpha}`);
  const lift = h.layerCanvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.composite === 'source-atop');
  assert.equal(lift.length, 1);
  assert.equal(lift[0].fill, '#ffffff', 'brightness 1.12 lifts toward white');
});

test('the pressed set reports press, release and chord press, each from and to the right face', () => {
  const h = makeView();
  const started = () => h.events;
  h.view.setPressed([0], 'press');
  assert.deepEqual(started().at(-1), { cell: 0, event: 'press', before: 'closed', after: 'pressed' });
  h.view.setPressed([], 'press');
  assert.deepEqual(started().at(-1), { cell: 0, event: 'release', before: 'pressed', after: 'closed' });
  h.view.setPressed([1, 9, 10], 'chordPress');
  assert.deepEqual(started().slice(-3).map((e) => [e.cell, e.event]), [[1, 'chordPress'], [9, 'chordPress'], [10, 'chordPress']]);
  // A pressed cell that opened does not release: its reveal took it.
  const r = h.game.reveal(1);
  h.view.update([...r.changed]);
  const before = started().length;
  h.view.setPressed([], 'press');
  assert.ok(started().slice(before).every((e) => e.cell !== 1 && e.event === 'release'));
});

test('flag and unflag come from the change list, and a loss\'s change list starts nothing and drops what runs', () => {
  const h = makeView();
  const started = () => h.events;
  h.view.update([...h.game.toggleFlag(4).changed]);
  assert.deepEqual(started().at(-1), { cell: 4, event: 'flag', before: 'closed', after: 'flagged' });
  h.view.update([...h.game.toggleFlag(4).changed]);
  assert.deepEqual(started().at(-1), { cell: 4, event: 'unflag', before: 'flagged', after: 'closed' });
  h.game.reveal(0);
  const n = started().length;
  const r = h.game.reveal(8); // a mine
  h.view.update([...r.changed]);
  assert.equal(started().length, n, 'the loss wave draws a loss');

  // A cell still animating when a loss changes it shows its new state at once.
  const g = makeView();
  g.view.setPressed([8], 'press');
  assert.deepEqual(g.view.motion.cells, [8]);
  g.view.update([...g.game.reveal(8).changed]);
  assert.deepEqual(g.view.motion.cells, [], 'the running press is dropped');
  assert.ok(boardDraws(g).some((d) => d.state === 'exploded'), 'the board draws the exploded mine');
});

test('a theme with no motion for an event leaves it still, and a skin without a board module animates nothing', () => {
  const still = { ...JOYFUL, motion: { ...JOYFUL.motion, reveal: null } };
  const h = makeView({ board: still });
  h.view.update([...h.game.reveal(0).changed]);
  assert.deepEqual(h.view.motion.cells, []);
  assert.equal(h.frames.pending, 0);
  assert.ok(boardDraws(h).length > 0, 'drawn at once in the new state');
  const bare = makeView({ board: null });
  bare.view.update([...bare.game.reveal(0).changed]);
  assert.deepEqual(bare.view.motion.cells, []);
});

test('hit testing uses the logical slot while a cell moves', () => {
  const h = makeView();
  h.view.update([...h.game.toggleFlag(10).changed]);
  step(h, 80);
  const rect = h.view.cellRect(10);
  assert.equal(h.view.cellAt(rect.x + 1, rect.y + 1), 10);
  assert.equal(h.view.cellAt(rect.x + 1, rect.y + 1), cellAtLayout(h.view.layout, h.view.scroll, 9, 9, rect.x + 1, rect.y + 1));
});

test('motion drops on a new board, a pause hiding the board, a theme change and a seek, each slot drawn again', () => {
  for (const [name, drop] of [
    ['new board', (h) => h.view.setGame(beginnerGame().game)],
    ['pause', (h) => h.view.setHidden(true)],
    ['theme change', (h) => h.skin.redraw()],
    ['seek', (h) => h.view.dropMotion()],
  ]) {
    const h = makeView();
    h.view.update([...h.game.reveal(0).changed]);
    step(h, 16);
    assert.ok(h.view.motion.cells.length > 0, name);
    h.skin.draws.length = 0;
    drop(h);
    assert.deepEqual(h.view.motion.cells, [], name);
    assert.equal(h.frames.pending, 0, `${name}: no frame left`);
    const cleared = h.layerCanvas.ctx.calls.filter((c) => c.op === 'clearRect');
    assert.ok(cleared.length > 0, `${name}: the layer is cleared`);
    if (name !== 'pause') assert.ok(boardDraws(h).length > 0, `${name}: the board draws the cells again`);
  }
});

test('a view without a layer plays no motion and draws as before', () => {
  const h = makeView({ layer: false });
  assert.equal(h.view.motion, null);
  h.view.update([...h.game.reveal(0).changed]);
  assert.ok(boardDraws(h).length > 0);
  assert.equal(h.frames.pending, 0);
});

test('the layer itself: start, cap, drop and frames on its own', () => {
  const canvas = fakeCanvas('layer');
  const frames = fakeFrames();
  const clock = { t: 0 };
  const painted = [];
  const settled = [];
  const layer = createMotionLayer({
    canvas, frames, now: () => clock.t, cap: 2,
    place: (c) => ({ x: c * 10, y: 0, size: 10 }),
    paint: (ctx, c, face) => painted.push([c, face]),
    onSettle: (cells) => settled.push(...cells),
  });
  layer.resize(100, 50, 1);
  const d = JOYFUL.motion.flag;
  assert.equal(layer.start(1, 'flag', 'closed', 'flagged', d), true);
  assert.equal(layer.start(2, 'flag', 'closed', 'flagged', d), true);
  assert.equal(layer.start(3, 'flag', 'closed', 'flagged', d), false, 'past the cap');
  assert.equal(layer.has(3), false);
  assert.equal(layer.start(2, 'flag', 'closed', 'flagged', null), false, 'a null description drops the running one');
  assert.equal(layer.has(2), false);
  frames.run();
  assert.deepEqual(painted.map(([c]) => c), [1]);
  clock.t = d.duration + 1;
  frames.run();
  assert.deepEqual(settled, [1]);
  assert.equal(frames.pending, 0);
  layer.start(4, 'flag', 'closed', 'flagged', d);
  assert.deepEqual(layer.dropAll(), [4]);
  assert.equal(frames.pending, 0);
});

// ---------- the inputs' pressed set ----------

test('the pointer and cursor inputs report a number\'s pressed neighbours as a chord press, a cell as a press', () => {
  const { grid, game } = beginnerGame();
  game.reveal(0);
  const n = grid.index(7, 1); // a number beside the mines
  assert.ok(game.cellNumber(n) > 0 && game.cellState(n) === CELL.REVEALED);
  const presses = [];
  const pointer = createPointerInput({ graph: grid.graph, game: () => game, onPress: (cells, event) => presses.push([cells, event]), onAction() {} });
  pointer.down(BUTTON.LEFT, n);
  assert.equal(presses.at(-1)[1], 'chordPress');
  assert.ok(presses.at(-1)[0].length > 0);
  pointer.up(BUTTON.LEFT, n);
  pointer.down(BUTTON.LEFT, grid.index(8, 8));
  assert.deepEqual(presses.at(-1), [[grid.index(8, 8)], 'press']);
  pointer.reset();

  const cursorPresses = [];
  const cursor = createCursorInput({ grid, game: () => game, onPress: (cells, event) => cursorPresses.push([cells, event]), onAction() {}, start: n });
  cursor.down('KeyD', 'chord');
  assert.equal(cursorPresses.at(-1)[1], 'chordPress');
  cursor.up('KeyD', 'chord');
  cursor.setCell(grid.index(8, 8));
  cursor.down('Space', 'reveal');
  assert.deepEqual(cursorPresses.at(-1), [[grid.index(8, 8)], 'press']);
});

// ---------- motion is visual only ----------

function fakeClock(start = 1000) {
  let t = start;
  let next = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const id = next++; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      t += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= t) { timers.delete(id); timer.fn(); }
    },
  };
}

// One game played by the pointer through the board view, with the motion layer or without it.
function playThrough(withMotion) {
  const mines = [1, 2, 3, 9, 10, 11, 12, 18, 19, 20];
  const clock = fakeClock();
  const place = (req) => ({ ok: true, mines: Int32Array.from(mines), seed: req.seed, generatorVersion: GENERATOR_VERSION });
  const session = createSession({ choice: { size: 'beginner', noGuess: false }, client: { request() {}, cancel() {} }, clock, randomSeed: () => 7, place });
  const skin = fakeSkinFactory();
  const frames = fakeFrames();
  const events = [];
  const view = createBoardView({
    canvas: fakeCanvas('board'), grid: session.setup.grid, createSkin: skin.createSkin, scale: 'fit', token: () => '#111111',
    layer: withMotion ? fakeCanvas('layer') : null, frames, now: clock.now, onMotion: (e) => events.push(e),
  });
  view.resize(600, 500, 1);
  view.setGame(session.game);
  session.on('changed', ({ changed }) => view.update(changed));
  const input = createPointerInput({
    graph: session.setup.grid.graph, game: () => session.game,
    onPress: (cells, event) => view.setPressed(cells, event), onAction: (kind, c) => session[kind](c),
  });
  const click = (button, c) => { input.down(button, c); clock.advance(40); frames.run(); input.up(button, c); clock.advance(70); frames.run(); };
  click(BUTTON.LEFT, 80); // opens the board around the wall
  click(BUTTON.RIGHT, 1);
  click(BUTTON.RIGHT, 1);
  click(BUTTON.RIGHT, 2);
  input.down(BUTTON.LEFT, 4); clock.advance(30); frames.run(); input.move(5); input.move(4); input.up(BUTTON.LEFT, 4);
  click(BUTTON.LEFT, 13); // a number: a chord
  click(BUTTON.LEFT, 0); // the walled-in cell: the win
  return { session, view, events };
}

test('the game, timer and replay are identical with motion on or off', () => {
  // The game's id and end date are the only values not from the game: fixed for both runs.
  const uuid = globalThis.crypto.randomUUID;
  const RealDate = globalThis.Date;
  globalThis.crypto.randomUUID = () => '00000000-0000-4000-8000-000000000000';
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [Date.UTC(2026, 9, 20)])); } };
  try {
    const on = playThrough(true);
    const off = playThrough(false);
    assert.ok(on.events.length > 0, 'motion played');
    const kinds = new Set(on.events.map((e) => e.event));
    for (const k of ['press', 'release', 'reveal', 'flag', 'unflag']) assert.ok(kinds.has(k), k);
    assert.ok([...kinds].every((k) => ['press', 'release', 'reveal', 'flag', 'unflag', 'chordPress'].includes(k)), [...kinds].join());
    assert.equal(off.view.motion, null);
    assert.equal(on.session.state, off.session.state);
    assert.equal(on.session.state, 'won');
    assert.deepEqual([...on.session.game.state.revealed], [...off.session.game.state.revealed]);
    assert.deepEqual([...on.session.game.state.flagged], [...off.session.game.state.flagged]);
    assert.equal(on.session.summary().elapsedMs, off.session.summary().elapsedMs);
    assert.deepEqual(on.session.clicks(), off.session.clicks());
    const a = on.session.replay();
    const b = off.session.replay();
    assert.deepEqual(Buffer.from(a.blob), Buffer.from(b.blob), 'the replay bytes');
  } finally {
    globalThis.crypto.randomUUID = uuid;
    globalThis.Date = RealDate;
  }
});

// ---------- the replay viewer ----------

test('the replay viewer plays a frame\'s changes while playing, and a seek drops motion and starts none', () => {
  const calls = [];
  const view = {
    layout: { tile: 30, pitch: 30, offsetX: 0, offsetY: 0, scrolls: false },
    scroll: { x: 0, y: 0 },
    setGame() {}, setCursor() {}, ensureVisible() {},
    update(changed, options) { calls.push(['update', [...changed], options]); },
    dropMotion() { calls.push(['drop']); },
  };
  const sim = { grid: { width: 9, height: 9 }, game: {}, replay: { header: { board: { grid: 'square', width: 9, height: 9 } }, movement: [], sampleIntervalMs: 50 } };
  const viewer = createViewer2D({ view, sim, pointer: { place() {}, hide() {} } });
  viewer.draw({ time: 100, changed: [3, 4] }, { playing: true });
  assert.deepEqual(calls, [['update', [3, 4], { motion: true }]]);
  calls.length = 0;
  viewer.draw({ time: 50, changed: [3, 4] }, { playing: false });
  assert.deepEqual(calls, [['drop'], ['update', [3, 4], { motion: false }]]);
});

// ---------- browser ----------

// Runs in the page: a 100 × 100 board at the floor tile on a 1920 × 1080 area, mounted with its
// motion layer and Joyful tiles' board module, one mine in a corner; the flood reveal from the far
// corner then plays frame by frame, each frame's layer work timed.
async function floodReveal() {
  const { mountBoardView } = await import('/js/classic2d/board-view.js');
  const { createBoardArt, createTileSkin } = await import('/js/classic2d/tile-skin.js');
  const { createSquareGrid } = await import('/js/engine/square-grid.js');
  const { createGameWithMines } = await import('/js/engine/rules.js');
  const { REFERENCE_PROFILE } = await import('/js/engine/profiles.js');
  const { BOARD } = await import('/themes/joyful-tiles/board.js');
  const host = document.createElement('div');
  Object.assign(host.style, { position: 'fixed', left: '0', top: '0', width: '1920px', height: '1080px' });
  document.body.append(host);
  const art = createBoardArt();
  art.set('joyful-tiles', BOARD);
  const grid = createSquareGrid(100, 100);
  let clock = 0;
  const frames = { request: () => 1, cancel() {} }; // frames run by hand below
  const view = mountBoardView({ container: host, grid, createSkin: (o) => createTileSkin({ ...o, art }), frames, now: () => clock });
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines: [0], dimensions: { width: 100, height: 100 } });
  view.setGame(game);
  const layer = host.querySelectorAll('canvas')[1];
  const style = getComputedStyle(layer);
  const r = game.reveal(grid.index(99, 99));
  const opened = r.changed.length;
  view.update(r.changed);
  const animating = view.motion.cells.length;
  const times = [];
  for (; view.motion.cells.length; clock += 1000 / 60) {
    const t0 = performance.now();
    view.motion.frame();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  return { opened, animating, median: times[Math.floor(times.length / 2)], pointerEvents: style.pointerEvents, above: layer.previousElementSibling === view.canvas };
}

test('in a browser, a flood reveal on a 100 × 100 board stays within the frame budget behind MOTION_CAP', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    let best = Infinity;
    let result;
    for (let i = 0; i < 3 && best > 2 * TIME_SLACK; i++) {
      result = await page.evaluate(floodReveal);
      best = Math.min(best, result.median);
    }
    assert.ok(result.opened > 9000, `a flood: ${result.opened} cells`);
    assert.equal(result.animating, MOTION_CAP, 'past the cap a cell shows its new state');
    assert.equal(result.pointerEvents, 'none', 'the layer takes no input');
    assert.ok(result.above, 'the layer sits above the board canvas');
    assert.ok(best <= 2 * TIME_SLACK, `median frame ${best.toFixed(2)} ms within 2 ms × ${TIME_SLACK}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
