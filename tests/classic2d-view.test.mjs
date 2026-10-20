// Classic 2D board view (js/classic2d/board-view.js): the fit rule and layout — the floor, the cap
// per board scale, the frame and the panel around the board, Expert and Beginner at the windows
// the game must fit — hit-testing in a fitted and a scrolled board, per-cell redraw from the
// engine's change lists through the tile skin, full repaints on resize, pixel-ratio, scale and
// theme change, scrolling and panning, a clipped board's shadows and scroll bars, the focus ring on
// its own layer outside the tile, the marked start cell, the hidden board while paused, and in a browser the board drawn in the theme, repainted on
// a theme switch, and the Classic 2D screen at the windows it must fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  fitTileSize, gapPx, boardLayout, cellAtLayout, createBoardView, PAN_MODIFIER, BOARD_BACKGROUND, BOARD_SHADOW, BOARD_SCROLLBAR,
  BOARD_SCALES, DEFAULT_BOARD_SCALE, TILE_CAP, tileCap, panelRect, clipMarks, SCROLLBAR, CURSOR_RING, MARK_PULSE_STEPS, MARK_PULSE_MS,
  MOTION_LAYER_CLASS, RING_LAYER_CLASS, BOARD_FRAME,
} from '../js/classic2d/board-view.js';
import { SCHEMA } from '../js/settings/schema.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { createEndEffect, reachMs, WIN, LOSS } from '../js/classic2d/end-effect.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';
import { END_DELAY_MS } from '../js/classic2d/mode.js';
import { createSession } from '../js/classic2d/session.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const suite = browserSuite({ args: [] });

// ---------- fakes ----------

function fakeContext() {
  const calls = [];
  const state = { fillStyle: '#000000', strokeStyle: '#000000' };
  return new Proxy(state, {
    get(target, prop) {
      if (prop === 'calls') return calls;
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient') {
        return (...args) => {
          const gradient = { kind: 'gradient', args, stops: [], addColorStop(at, colour) { gradient.stops.push([at, colour]); } };
          calls.push({ op: prop, args, gradient });
          return gradient;
        };
      }
      return (...args) => { calls.push({ op: prop, args, fill: target.fillStyle, stroke: target.strokeStyle }); };
    },
    set(target, prop, value) { target[prop] = value; calls.push({ op: `set:${String(prop)}`, args: [value] }); return true; },
  });
}

function fakeCanvas() {
  const ctx = fakeContext();
  return { width: 0, height: 0, style: {}, ctx, getContext: () => ctx };
}

// A skin recording every tile it draws, and the redraw callback the view hands it.
// `board`, when given, is the board module the skin draws from.
function fakeSkinFactory(board = null) {
  const out = { draws: [], redraw: null, disposed: false };
  out.createSkin = ({ redraw }) => {
    out.redraw = redraw;
    return {
      drawTile(ctx, x, y, size, state, number, ratio) { out.draws.push({ x, y, size, state, number, ratio }); },
      ...(board ? { board: () => board } : {}),
      dispose() { out.disposed = true; },
    };
  };
  return out;
}

function tokenMap(map) {
  return (name) => map[name.startsWith('--') ? name : `--${name}`] ?? '#ff00ff';
}

const REF = { profile: REFERENCE_PROFILE };
// 9 × 9 with mines on the right column: revealing (0, 0) floods the left part of the board.
function beginnerGame() {
  const grid = createSquareGrid(9, 9);
  const mines = [];
  for (let row = 0; row < 9; row++) mines.push(grid.index(8, row));
  mines.push(grid.index(7, 0));
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines, dimensions: { width: 9, height: 9 } });
  return { grid, game };
}

// A view at the Fit scale unless one is given: the fit rule's own numbers, with no cap.
function makeView({ cols = 9, rows = 9, width = 600, height = 500, pixelRatio = 1, token, scale = 'fit', frame, onLayout, board } = {}) {
  const grid = createSquareGrid(cols, rows);
  const canvas = fakeCanvas();
  const skin = fakeSkinFactory(board);
  const tokens = {
    light: { '--color-board-frame': '#111111', '--color-board-shadow': '#333333', '--color-board-scrollbar': '#444444', '--color-tile-cursor': '#0000ff', '--color-success': '#00aa00' },
    dark: { '--color-board-frame': '#222222', '--color-board-shadow': '#333333', '--color-board-scrollbar': '#444444', '--color-tile-cursor': '#0000ff', '--color-success': '#00aa00' },
  };
  let theme = 'light';
  const overlay = fakeCanvas();
  const view = createBoardView({
    canvas, grid, createSkin: skin.createSkin, scale, frame, onLayout, overlay,
    token: token ?? ((name) => tokenMap(tokens[theme])(name)),
  });
  view.resize(width, height, pixelRatio);
  return { grid, canvas, overlay, skin, view, setTheme: (t) => { theme = t; } };
}

const M = MIN_TILE_SIZE;
const backgroundFills = (canvas) => canvas.ctx.calls.filter((c) => c.op === 'fillRect' && (c.fill === '#111111' || c.fill === '#222222'));
const gradients = (canvas) => canvas.ctx.calls.filter((c) => c.op === 'createLinearGradient');
const barFills = (canvas) => canvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === '#444444');

// ---------- fit rule and layout ----------

test('the tile is the largest whole size that fits the board, at most the cap and never below the floor of 26 px', () => {
  assert.equal(M, 26, 'the floor: decision 10 of docs/UX_REVIEW.md');
  assert.equal(fitTileSize(9, 9, 656, 656), Math.floor(656 / 9), 'no cap by default');
  assert.equal(fitTileSize(9, 9, 656, 656, M, 48), 48, 'capped');
  assert.equal(fitTileSize(30, 16, 600, 300, M, 48), M, 'a board too large keeps the floor');
  assert.equal(fitTileSize(100, 100, 1334, 656), M, 'clamped to the floor');
  assert.equal(fitTileSize(4, 2, 100, 100), M);
  assert.equal(fitTileSize(2, 1, 1000, 1000), 500);
  assert.equal(fitTileSize(2, 1, 1000, 1000, 600), 600, 'an explicit floor');
  assert.equal(fitTileSize(2, 1, 1000, 1000, 10, 20), 20, 'an explicit cap');
  for (const [c, r] of [[9, 9], [16, 16], [30, 16], [7, 3]]) {
    const t = fitTileSize(c, r, 1001, 777, M, 48);
    assert.ok(Number.isInteger(t) && t >= M && t <= 48);
    assert.ok(t === M || (t * c <= 1001 && t * r <= 777), 'a fitted board fits');
  }
});

test('the board scale caps the tile: 48 px at 100 % (the default), 60 px at 125 %, none at Fit', () => {
  assert.deepEqual([...BOARD_SCALES], [...SCHEMA.boardScale.values], 'the settings\' boardScale values');
  assert.equal(DEFAULT_BOARD_SCALE, SCHEMA.boardScale.default);
  assert.equal(DEFAULT_BOARD_SCALE, '100');
  assert.equal(TILE_CAP, 48);
  assert.equal(tileCap('100'), 48);
  assert.equal(tileCap('125'), 60);
  assert.equal(tileCap('fit'), Infinity);
  assert.equal(tileCap(), 48, 'the default scale');
  for (const scale of BOARD_SCALES) {
    const big = boardLayout({ cols: 30, rows: 16, width: 600, height: 300, max: tileCap(scale) });
    assert.equal(big.tile, M, `${scale}: a board too large shrinks to the floor before it scrolls`);
  }
  const { view } = makeView({ scale: null });
  assert.equal(view.scale, '100', 'a view opens at the default scale');
  assert.equal(view.layout.tile, 48);
});

// A frame of fixed insets, as a page may give one: 9 px on every side, readouts on the top edge (a
// 48 px row) and 8 px between them and the board, at least 520 px wide.
const FRAME = Object.freeze({ top: 9 + 48 + 8, right: 9, bottom: 9, left: 9, minWidth: 520 });
const area = (w, h) => ({ width: w - 32, height: h - 32 }); // the window less its 16 px margins

test('at the default scale Expert fits with no scroll at 1024 × 768, 1280 × 800 and 1366 × 650, and any 1024 px window with room for 16 rows at the floor', () => {
  for (const [w, h] of [[1024, 768], [1280, 800], [1366, 650]]) {
    const l = boardLayout({ cols: 30, rows: 16, ...area(w, h), max: tileCap('100'), frame: FRAME });
    assert.equal(l.scrolls, false, `${w} × ${h}: Expert fits`);
    assert.ok(l.tile >= M && l.tile <= 48, `${w} × ${h}: ${l.tile} px`);
    assert.ok(l.viewX >= FRAME.left && l.viewX + l.viewWidth <= l.width - FRAME.right, `${w} × ${h}: no clipped column`);
    assert.ok(l.viewY >= FRAME.top && l.viewY + l.viewHeight <= l.height - FRAME.bottom, `${w} × ${h}: no clipped row`);
    assert.deepEqual([l.viewWidth, l.viewHeight], [30 * l.tile, 16 * l.tile], `${w} × ${h}: every cell in view`);
  }
  const tallEnough = 32 + FRAME.top + FRAME.bottom + 16 * M;
  for (const scale of BOARD_SCALES) {
    const l = boardLayout({ cols: 30, rows: 16, ...area(1024, tallEnough), max: tileCap(scale), frame: FRAME });
    assert.equal(l.scrolls, false, `${scale}: a 1024 × ${tallEnough} window fits Expert at the floor`);
    assert.equal(l.tile, M);
  }
  assert.equal(boardLayout({ cols: 30, rows: 16, ...area(1024, tallEnough - 1), frame: FRAME }).scrolls, true, 'a pixel less, it scrolls');
});

test('at 1280 × 800 Beginner plays at 48 px tiles by default, 60 px at 125 % and fills the area at Fit', () => {
  const at = (scale) => boardLayout({ cols: 9, rows: 9, ...area(1280, 800), max: tileCap(scale), frame: FRAME }).tile;
  assert.equal(at('100'), 48);
  assert.equal(at('125'), 60);
  assert.equal(at('fit'), Math.floor((800 - 32 - FRAME.top - FRAME.bottom) / 9));
});

test('the panel frames the board: the view widened by the frame, centred in the area, at least the readouts wide', () => {
  const l = boardLayout({ cols: 9, rows: 9, width: 1000, height: 700, max: 48, frame: FRAME });
  assert.deepEqual([l.viewWidth, l.viewHeight], [432, 432]);
  const natural = 432 + 18;
  assert.equal(l.viewX, 9 + Math.floor((1000 - 18 - 432) / 2), 'centred with its frame');
  assert.equal(l.viewY, Math.floor((700 - 432 - FRAME.top - FRAME.bottom) / 2) + FRAME.top);
  assert.deepEqual([l.offsetX, l.offsetY], [l.viewX, l.viewY], 'the board starts at the view');
  const p = panelRect(l, FRAME);
  assert.equal(p.width, Math.max(natural, FRAME.minWidth), 'as wide as the readouts');
  assert.equal(p.x + p.width / 2, l.viewX + l.viewWidth / 2, 'centred on the board');
  assert.deepEqual([p.y, p.height], [l.viewY - FRAME.top, 432 + FRAME.top + FRAME.bottom], 'the readouts on its top edge');
  assert.deepEqual(panelRect(l, { ...FRAME, minWidth: 0 }), { x: l.viewX - 9, y: l.viewY - FRAME.top, width: natural, height: p.height });
  const wide = boardLayout({ cols: 30, rows: 16, width: 1000, height: 700, max: 48, frame: FRAME });
  const pw = panelRect(wide, FRAME);
  assert.deepEqual([pw.width, pw.x], [wide.viewWidth + 18, wide.viewX - 9], 'a board wider than the readouts sets the width');
  const none = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  assert.deepEqual(panelRect(none), { x: none.viewX, y: none.viewY, width: 495, height: 495 }, 'no frame: the view itself');
});

test('a clipped board fills the area inside the frame and the panel fills the area', () => {
  const l = boardLayout({ cols: 100, rows: 100, width: 992, height: 736, max: 48, frame: FRAME });
  assert.equal(l.tile, M);
  assert.equal(l.scrolls, true);
  assert.deepEqual([l.viewX, l.viewY, l.viewWidth, l.viewHeight], [9, FRAME.top, 992 - 18, 736 - FRAME.top - 9]);
  assert.deepEqual([l.maxScrollX, l.maxScrollY], [100 * M - (992 - 18), 100 * M - (736 - FRAME.top - 9)]);
  assert.deepEqual(panelRect(l, FRAME), { x: 0, y: 0, width: 992, height: 736 });
  const at = (x, y, scroll = { x: 0, y: 0 }) => cellAtLayout(l, scroll, 100, 100, x, y);
  assert.equal(at(9, FRAME.top), 0, 'the first cell at the view\'s corner');
  assert.equal(at(8, FRAME.top + 5), -1, 'the frame is no cell');
  assert.equal(at(20, FRAME.top - 1), -1, 'the readouts\' edge is no cell');
  assert.equal(at(992 - 9, 100), -1, 'nor the right frame, where tiles run on under it');
});

test('the board frame pads a fitted board by the module\'s gap on every side, counted in the fit, its radius a fraction of the tile; a clipped board takes no frame', () => {
  assert.deepEqual({ ...BOARD_FRAME }, { gaps: 1 }, 'one gap of padding all round');
  const { gap, frameRadius } = JOYFUL.style2d.params;
  for (const [tile, pad] of [[48, 4], [28, 3], [26, 2]]) {
    const l = boardLayout({ cols: 9, rows: 9, width: 1000, height: 900, max: tile, frame: BOARD_FRAME, gap, frameRadius });
    assert.equal(l.tile, tile);
    assert.equal(l.gap, pad, `${tile} px: a ${pad} px gap`);
    assert.deepEqual(l.inset, { top: pad, right: pad, bottom: pad, left: pad }, `${tile} px: the frame pads by the gap`);
    assert.equal(l.frameRadius, Math.round(tile * frameRadius), `${tile} px: the frame's radius is the tile × the module's frame radius`);
    const span = 9 * tile + 8 * pad;
    assert.equal(l.viewX, pad + Math.floor((1000 - 2 * pad - span) / 2), 'centred with its frame');
    assert.deepEqual(panelRect(l), { x: l.viewX - pad, y: l.viewY - pad, width: span + 2 * pad, height: span + 2 * pad }, 'the frame around the view');
  }
  // The fit counts the frame: a board exactly as wide as its tiles, gaps and frame fits at that tile, a pixel less does not.
  const exact = 9 * 48 + 8 * 4 + 2 * 4;
  assert.equal(boardLayout({ cols: 9, rows: 9, width: exact, height: exact, max: 48, frame: BOARD_FRAME, gap }).tile, 48);
  assert.equal(boardLayout({ cols: 9, rows: 9, width: exact - 1, height: exact, max: 48, frame: BOARD_FRAME, gap }).tile, 47);
  // A board too large for its area at the floor scrolls in a viewport with no frame: the view fills the area.
  const clipped = boardLayout({ cols: 100, rows: 100, width: 992, height: 736, max: 48, frame: BOARD_FRAME, gap, frameRadius });
  assert.equal(clipped.scrolls, true);
  assert.deepEqual(clipped.inset, { top: 0, right: 0, bottom: 0, left: 0 }, 'no frame round a clipped board');
  assert.deepEqual([clipped.viewX, clipped.viewY, clipped.viewWidth, clipped.viewHeight], [0, 0, 992, 736]);
  // The view lays the board out in the frame from its module's gap and frame radius.
  const { view } = makeView({ cols: 9, rows: 9, width: 600, height: 500, scale: '100', frame: BOARD_FRAME, board: JOYFUL });
  assert.deepEqual([view.layout.tile, view.layout.inset.left, view.layout.frameRadius], [48, 4, 14]);
});

test('a fitted board is centred with nothing to scroll; a larger one starts at the edge and scrolls', () => {
  const fits = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  assert.equal(fits.tile, 55);
  assert.deepEqual([fits.boardWidth, fits.boardHeight], [495, 495]);
  assert.deepEqual([fits.offsetX, fits.offsetY], [52, 2]);
  assert.deepEqual([fits.maxScrollX, fits.maxScrollY, fits.scrolls], [0, 0, false]);

  assert.deepEqual([fits.viewX, fits.viewY, fits.viewWidth, fits.viewHeight], [52, 2, 495, 495], 'the view is the board');

  const big = boardLayout({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(big.tile, M);
  assert.deepEqual([big.offsetX, big.offsetY], [0, 0]);
  assert.deepEqual([big.maxScrollX, big.maxScrollY, big.scrolls], [100 * M - 1334, 100 * M - 656, true]);
  assert.deepEqual([big.viewWidth, big.viewHeight], [1334, 656], 'the view is the area');

  const wide = boardLayout({ cols: 100, rows: 2, width: 1334, height: 656 });
  assert.equal(wide.maxScrollY, 0, 'only the axis that overflows scrolls');
  assert.equal(wide.offsetY, Math.floor((656 - 2 * M) / 2), 'and the other stays centred');
  assert.ok(wide.maxScrollX > 0);
});

// ---------- hit-testing ----------

test('cellAt maps a position to its cell, and to -1 outside the board', () => {
  const layout = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  const at = (x, y, scroll = { x: 0, y: 0 }) => cellAtLayout(layout, scroll, 9, 9, x, y);
  assert.equal(at(52, 2), 0, 'top-left corner of the first tile');
  assert.equal(at(52 + 54.9, 2 + 54.9), 0);
  assert.equal(at(52 + 55, 2), 1, 'the next tile starts on its edge');
  assert.equal(at(52 + 3 * 55 + 10, 2 + 4 * 55 + 10), 3 + 9 * 4);
  assert.equal(at(52 + 495 - 1, 2 + 495 - 1), 80, 'last tile');
  assert.equal(at(51, 10), -1, 'left of the board');
  assert.equal(at(52 + 495, 10), -1, 'right of the board');
  assert.equal(at(60, 1), -1, 'above the board');
  assert.equal(at(60, 2 + 495), -1, 'below the board');
  assert.equal(at(NaN, 10), -1);
});

test('cellAt follows the scroll position in a scrolled board', () => {
  const { view, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(view.cellAt(0, 0), 0);
  view.scrollTo(M * 10 + 5, M * 3);
  assert.deepEqual(view.scroll, { x: M * 10 + 5, y: M * 3 });
  assert.equal(view.cellAt(0, 0), grid.index(10, 3));
  assert.equal(view.cellAt(M - 5, 0), grid.index(11, 3), 'the partly hidden tile ends 5px short of a tile in');
  assert.equal(view.cellAt(1333, 655), grid.index(Math.floor((M * 10 + 5 + 1333) / M), Math.floor((M * 3 + 655) / M)));
  view.scrollTo(1e9, 1e9);
  assert.equal(view.cellAt(1333, 655), grid.index(99, 99), 'the far corner at the end of the scroll');
  assert.equal(view.cellAt(1334, 10), -1, 'past the canvas');
});

test('cellRect gives a cell\'s tile in canvas coordinates, scroll included', () => {
  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  view.scrollTo(100, 50);
  assert.deepEqual(view.cellRect(0), { x: -100, y: -50, size: M });
  assert.deepEqual(view.cellRect(101), { x: M - 100, y: M - 50, size: M });
});

// ---------- painting ----------

test('the canvas takes the area at the device pixel ratio, and a game paints every cell once', () => {
  const { view, canvas, skin, setTheme } = makeView({ width: 600, height: 500, pixelRatio: 1.5 });
  assert.deepEqual([canvas.width, canvas.height], [900, 750]);
  assert.deepEqual([canvas.style.width, canvas.style.height], ['600px', '500px']);
  const { game } = beginnerGame();
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setGame(game);
  assert.equal(skin.draws.length, 81);
  const first = skin.draws[0];
  assert.deepEqual(first, { x: 52, y: 2, size: 55, state: 'closed', number: -1, ratio: 1.5 });
  const last = skin.draws[80];
  assert.deepEqual([last.x, last.y], [52 + 8 * 55, 2 + 8 * 55]);
  const transform = canvas.ctx.calls.find((c) => c.op === 'setTransform');
  assert.deepEqual(transform.args, [1.5, 0, 0, 1.5, 0, 0]);
  const bg = backgroundFills(canvas)[0];
  assert.equal(bg.fill, '#111111', 'the background is the board token');
  assert.deepEqual(bg.args, [52, 2, 495, 495], 'under the board only');
  const clear = canvas.ctx.calls.find((c) => c.op === 'clearRect');
  assert.deepEqual(clear.args, [0, 0, 600, 500], 'the rest of the canvas is left clear, for the frame behind it');
  setTheme('dark');
  skin.redraw();
  assert.equal(backgroundFills(canvas).at(-1).fill, '#222222', 'read again after a theme change');
});

test('the background and the marks are drawn from design tokens, never a literal colour', () => {
  assert.equal(BOARD_BACKGROUND, '--color-board-frame');
  assert.equal(BOARD_SHADOW, '--color-board-shadow');
  assert.equal(BOARD_SCROLLBAR, '--color-board-scrollbar');
  const src = readFileSync(join(ROOT, 'js/classic2d/board-view.js'), 'utf8');
  assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b/, 'no literal colours');
  assert.doesNotMatch(src, /\brgba?\(/, 'no literal colours');
  const css = readFileSync(join(ROOT, 'themes/joyful-tiles/theme.css'), 'utf8');
  for (const name of [BOARD_BACKGROUND, BOARD_SHADOW, BOARD_SCROLLBAR]) assert.match(css, new RegExp(`${name}:`), `${name} exists`);
});

test('after an action only the changed cells are repainted, in the engine\'s state', () => {
  const { view, skin } = makeView();
  const { game, grid } = beginnerGame();
  view.setGame(game);
  skin.draws.length = 0;
  const f = game.toggleFlag(grid.index(8, 8));
  view.update(f.changed);
  assert.deepEqual(skin.draws.map((d) => [d.state, d.x, d.y]), [['flagged', 52 + 8 * 55, 2 + 8 * 55]]);
  skin.draws.length = 0;
  const r = game.reveal(grid.index(0, 0));
  const changed = [...r.changed];
  assert.ok(changed.length > 1 && changed.length < 81);
  view.update(r.changed);
  assert.equal(skin.draws.length, changed.length);
  const layout = view.layout;
  changed.forEach((c, i) => {
    const d = skin.draws[i];
    const [col, row] = grid.colRow(c);
    assert.deepEqual([d.x, d.y], [layout.offsetX + col * layout.tile, layout.offsetY + row * layout.tile]);
    assert.equal(d.state, game.cellState(c));
    assert.equal(d.number, game.cellNumber(c));
  });
  skin.draws.length = 0;
  view.update([]);
  assert.equal(skin.draws.length, 0, 'nothing changed, nothing drawn');
});

// ---------- the end effect ----------

// The cell each recorded draw is at, from its position.
const drawnStates = (view, skin, grid) => {
  const out = new Map();
  for (const d of skin.draws) {
    const c = view.cellAt(d.x + 1, d.y + 1);
    if (c >= 0) out.set(c, d.state);
  }
  assert.equal(out.size > 0 && grid.width > 0, true);
  return out;
};

test('during a loss\'s end effect each tile the loss changed keeps its pre-loss tile until the wave reaches it; the end state shows at the delay\'s end', () => {
  const { view, skin, grid } = makeView();
  const { game } = beginnerGame();
  view.setGame(game);
  const wrong = grid.index(6, 8);
  game.toggleFlag(wrong); // a flag on a safe cell: a wrong flag at the loss
  game.reveal(grid.index(0, 0));
  const boom = grid.index(8, 4);
  const r = game.reveal(boom);
  assert.equal(game.cellState(boom), CELL.EXPLODED);
  const effect = createEndEffect({ kind: LOSS, cols: 9, rows: 9, origin: boom, duration: END_DELAY_MS });
  const mineNear = grid.index(8, 3);
  const mineFar = grid.index(8, 0);

  view.update(r.changed); // the session's changed event redraws the loss in its end state …
  skin.draws.length = 0;
  view.showEffect(effect, 0); // … and the effect starting at once repaints the board from the wave
  let shown = drawnStates(view, skin, grid);
  assert.equal(shown.size, 81, 'the whole board is repainted');
  assert.equal(shown.get(boom), CELL.EXPLODED, 'the exploded tile shows at once');
  assert.equal(shown.get(mineNear), CELL.CLOSED, 'a mine keeps its closed tile');
  assert.equal(shown.get(mineFar), CELL.CLOSED);
  assert.equal(shown.get(wrong), CELL.FLAGGED, 'a wrong flag keeps its flag');
  assert.equal(shown.get(grid.index(0, 0)), game.cellState(grid.index(0, 0)), 'a tile the loss did not change is drawn as it is');

  skin.draws.length = 0;
  view.showEffect(effect, reachMs(effect, mineNear));
  shown = drawnStates(view, skin, grid);
  assert.equal(shown.get(mineNear), CELL.MINE, 'reached: the end state');
  assert.equal(shown.get(mineFar), CELL.CLOSED, 'not yet reached');
  assert.ok(reachMs(effect, mineFar) > reachMs(effect, mineNear));

  skin.draws.length = 0;
  view.update([mineFar]); // a redraw during the effect draws the tile the wave shows
  assert.deepEqual(skin.draws.map((d) => d.state), [CELL.CLOSED]);
  skin.draws.length = 0;
  view.resize(620, 500, 1); // so does a resize, and a scroll or a theme change, which repaint
  assert.equal(drawnStates(view, skin, grid).get(mineFar), CELL.CLOSED);
  assert.equal(drawnStates(view, skin, grid).get(mineNear), CELL.MINE);

  skin.draws.length = 0;
  view.showEffect(null);
  shown = drawnStates(view, skin, grid);
  assert.equal(shown.size, 81, 'the end of the delay repaints the whole board');
  for (let c = 0; c < 81; c++) assert.equal(shown.get(c), game.cellState(c), `cell ${c} in its end state`);
  assert.equal(view.effect, null, 'no effect left running');
});

// Joyful tiles' module with a light and confetti colour the tests can pick out of the drawing.
function effectBoard() {
  const b = structuredClone(JOYFUL);
  b.end2d.light = '#fefefe';
  b.palette.confetti = ['#c0ffee'];
  return b;
}
// The tile each fill of the wave's light covers: the corner of the rounded rectangle before it.
function lightFills(canvas, light) {
  const out = [];
  let corner = null;
  let scale = 1;
  for (const c of canvas.ctx.calls) {
    if (c.op === 'scale') scale = c.args[0];
    if (c.op === 'restore') scale = 1;
    if (c.op === 'moveTo') corner = c.args;
    if (c.op === 'fill' && c.fill === light) out.push({ corner, scale });
  }
  return out;
}

test('a win\'s end effect bumps and lightens the tiles the wave is passing, clipped to each rounded tile, and throws the module\'s confetti over the board\'s own rectangle only', () => {
  const board = effectBoard();
  const { view, skin, canvas, grid } = makeView({ board, token: () => '#111111' });
  const { game } = beginnerGame();
  view.setGame(game);
  for (let c = 0; c < 81 && game.phase !== 'won'; c++) if (game.cellState(c) === CELL.CLOSED && c % 9 !== 8 && c !== grid.index(7, 0)) game.reveal(c);
  assert.equal(game.phase, 'won');
  const mine = grid.index(8, 8);
  assert.equal(game.cellState(mine), CELL.CLOSED, 'the engine leaves an unflagged mine closed at a win');
  const origin = grid.index(2, 3);
  const effect = createEndEffect({ kind: WIN, cols: 9, rows: 9, origin, duration: END_DELAY_MS, random: () => 0.5 });
  canvas.ctx.calls.length = 0;
  skin.draws.length = 0;
  view.showEffect(effect, 140);
  assert.equal(skin.draws.length, 81, 'the end-state tiles are the skin\'s static tiles');
  assert.equal(drawnStates(view, skin, grid).get(mine), CELL.CLOSED, 'a mine the wave has not reached is still closed');
  const lit = lightFills(canvas, '#fefefe');
  const at = view.cellRect(origin);
  const r = at.size * board.style2d.params.radius;
  const here = lit.find((f) => Math.abs(f.corner[0] - (at.x + r)) < 1e-9 && Math.abs(f.corner[1] - at.y) < 1e-9);
  assert.ok(here, 'the wave lightens the origin first, in a rounded rectangle on its tile');
  assert.ok(Math.abs(here.scale - board.end2d.win.scale) < 0.01, `bumped to the module's scale (${here.scale})`);
  const far = view.cellRect(grid.index(8, 8));
  assert.equal(lit.some((f) => Math.abs(f.corner[1] - far.y) < 1e-9 && Math.abs(f.corner[0] - (far.x + r)) < 1e-9), false, 'not yet the far corner');
  assert.equal(canvas.ctx.calls.some((c) => c.op === 'fillRect' && c.fill === '#fefefe'), false, 'no square over the tile\'s corners and the ground');
  const pieces = canvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === '#c0ffee');
  assert.ok(pieces.length > 0, 'confetti is drawn in the module\'s colours');
  const clip = canvas.ctx.calls.findLast((c) => c.op === 'rect');
  const { viewX, viewY, viewWidth, viewHeight } = view.layout;
  assert.deepEqual(clip.args, [viewX, viewY, viewWidth, viewHeight], 'clipped to the board\'s rectangle in view');
  const confettiFrom = canvas.ctx.calls.indexOf(clip);
  for (const t of canvas.ctx.calls.slice(confettiFrom).filter((c) => c.op === 'translate')) {
    assert.ok(t.args[0] >= viewX && t.args[0] <= viewX + viewWidth && t.args[1] >= viewY && t.args[1] <= viewY + viewHeight, 'each piece over the board');
  }
  skin.draws.length = 0;
  view.showEffect(effect, reachMs(effect, mine));
  assert.equal(drawnStates(view, skin, grid).get(mine), CELL.FLAGGED, 'reached: shown as its end-state flag');
  canvas.ctx.calls.length = 0;
  skin.draws.length = 0;
  view.showEffect(null);
  assert.equal(canvas.ctx.calls.some((c) => (c.op === 'fillRect' || c.op === 'fill') && (c.fill === '#fefefe' || c.fill === '#c0ffee')), false, 'nothing of the effect is left');
  assert.equal(canvas.ctx.calls.some((c) => c.op === 'scale'), false, 'every tile at its own size');
  const shown = drawnStates(view, skin, grid);
  for (let c = 0; c < 81; c++) {
    assert.equal(shown.get(c), game.cellState(c) === CELL.CLOSED ? CELL.FLAGGED : game.cellState(c), `cell ${c}: the won board's end state, every unflagged mine a flag`);
  }
});

test('a loss\'s end effect snaps each tile the loss changed in from the module\'s scale under its flash, and leaves the others still', () => {
  const board = effectBoard();
  const { view, canvas, grid } = makeView({ board, token: () => '#111111' });
  const { game } = beginnerGame();
  view.setGame(game);
  game.toggleFlag(grid.index(6, 8)); // a flag on a safe cell, so the flood leaves the game running
  game.reveal(grid.index(0, 0));
  const boom = grid.index(8, 4);
  game.reveal(boom);
  assert.equal(game.cellState(boom), CELL.EXPLODED);
  const effect = createEndEffect({ kind: LOSS, cols: 9, rows: 9, origin: boom, duration: END_DELAY_MS });
  const mineNear = grid.index(8, 3);
  canvas.ctx.calls.length = 0;
  view.showEffect(effect, reachMs(effect, mineNear));
  const lit = lightFills(canvas, '#fefefe');
  const at = view.cellRect(mineNear);
  const r = at.size * board.style2d.params.radius;
  const near = lit.find((f) => Math.abs(f.corner[0] - (at.x + r)) < 1e-9 && Math.abs(f.corner[1] - at.y) < 1e-9);
  assert.ok(near, 'the mine the wave reaches flashes on its rounded tile');
  assert.ok(Math.abs(near.scale - board.end2d.loss.scale) < 1e-9, `from the module's scale (${near.scale})`);
  const open = view.cellRect(grid.index(0, 0));
  assert.equal(lit.some((f) => Math.abs(f.corner[0] - (open.x + r)) < 1e-9 && Math.abs(f.corner[1] - open.y) < 1e-9), false, 'a tile the loss did not change does not flash');
});

test('a hidden board draws no effect', () => {
  const { view, skin } = makeView();
  view.setGame(beginnerGame().game);
  view.setHidden(true);
  skin.draws.length = 0;
  view.showEffect(createEndEffect({ kind: WIN, cols: 9, rows: 9, origin: 0, duration: END_DELAY_MS }), 100);
  assert.equal(skin.draws.length, 0);
});

test('resize, a pixel-ratio change and a theme change repaint the whole board', () => {
  const { view, skin } = makeView();
  view.setGame(beginnerGame().game);
  skin.draws.length = 0;
  view.resize(700, 500, 1);
  assert.equal(skin.draws.length, 81, 'resize');
  assert.equal(skin.draws[0].size, 55);
  skin.draws.length = 0;
  view.resize(700, 500, 2);
  assert.equal(skin.draws.length, 81, 'pixel ratio');
  assert.ok(skin.draws.every((d) => d.ratio === 2));
  skin.draws.length = 0;
  skin.redraw();
  assert.equal(skin.draws.length, 81, 'theme change through the skin\'s redraw callback');
  skin.draws.length = 0;
  view.resize(700, 500, 2);
  assert.equal(skin.draws.length, 0, 'the same size and ratio change nothing');
});

test('a scrolled board paints only the tiles in view', () => {
  const { view, skin, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines: [grid.index(99, 99)], dimensions: { width: 100, height: 100 } });
  view.setGame(game);
  const cols = Math.ceil(1334 / M) + 1;
  assert.ok(skin.draws.length <= cols * (Math.ceil(656 / M) + 1) && skin.draws.length > 500);
  skin.draws.length = 0;
  view.scrollTo(20, 0);
  assert.ok(skin.draws.length > 500, 'scrolling repaints');
  skin.draws.length = 0;
  const r = game.reveal(grid.index(0, 0));
  assert.ok(r.changed.length > 9000, 'the flood opens nearly the whole board');
  view.update(r.changed);
  assert.ok(skin.draws.length < 2000, 'only visible changed cells are drawn');
  assert.ok(skin.draws.every((d) => d.x > -M && d.x < 1334 && d.y > -M && d.y < 656));
});

// ---------- scrolling and panning ----------

test('scrolling is clamped, and a board that fits never scrolls', () => {
  const small = makeView();
  small.view.scrollTo(100, 100);
  assert.deepEqual(small.view.scroll, { x: 0, y: 0 });
  assert.equal(small.view.wheel({ deltaX: 0, deltaY: 120, deltaMode: 0 }), false, 'the wheel is not taken');

  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  view.scrollTo(-50, -5);
  assert.deepEqual(view.scroll, { x: 0, y: 0 });
  view.scrollBy(30, 40);
  assert.deepEqual(view.scroll, { x: 30, y: 40 });
  view.scrollTo(1e6, 1e6);
  assert.deepEqual(view.scroll, { x: 100 * M - 1334, y: 100 * M - 656 });
  view.resize(2000, 2000, 1);
  assert.deepEqual(view.scroll, { x: 100 * M - 2000, y: 100 * M - 2000 }, 're-clamped on resize');
});

test('the wheel scrolls a large board: vertical, horizontal, shift for horizontal, lines and pages', () => {
  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(view.wheel({ deltaX: 0, deltaY: 100, deltaMode: 0 }), true);
  assert.deepEqual(view.scroll, { x: 0, y: 100 });
  view.wheel({ deltaX: 30, deltaY: 0, deltaMode: 0 });
  assert.deepEqual(view.scroll, { x: 30, y: 100 });
  view.wheel({ deltaX: 0, deltaY: 50, deltaMode: 0, shiftKey: true });
  assert.deepEqual(view.scroll, { x: 80, y: 100 }, 'shift turns a vertical wheel horizontal');
  view.wheel({ deltaX: 0, deltaY: 2, deltaMode: 1 });
  assert.deepEqual(view.scroll, { x: 80, y: 100 + 2 * M }, 'a line is a tile');
  view.wheel({ deltaX: 0, deltaY: -1, deltaMode: 2 });
  assert.deepEqual(view.scroll, { x: 80, y: 0 }, 'a page is the view');
});

test('dragging with the pan modifier moves the board with the pointer', () => {
  assert.equal(PAN_MODIFIER, 'shiftKey');
  const { view } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  view.scrollTo(500, 500);
  view.pan(40, -25);
  assert.deepEqual(view.scroll, { x: 460, y: 525 }, 'the board follows the pointer');
});

test('ensureVisible scrolls just enough to show a cell, for the keyboard and controller cursor', () => {
  const { view, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  assert.equal(view.ensureVisible(grid.index(5, 5)), false, 'already in view');
  assert.equal(view.ensureVisible(grid.index(60, 0)), true);
  assert.deepEqual(view.scroll, { x: 61 * M - 1334, y: 0 }, 'the cell lands on the right edge');
  view.ensureVisible(grid.index(0, 40));
  assert.deepEqual(view.scroll, { x: 0, y: 41 * M - 656 }, 'left edge, bottom edge');
  view.ensureVisible(grid.index(0, 2));
  assert.deepEqual(view.scroll, { x: 0, y: 2 * M }, 'top edge');
  for (const c of [grid.index(99, 99), grid.index(57, 3), 0]) {
    view.ensureVisible(c);
    const r = view.cellRect(c);
    assert.ok(r.x >= 0 && r.y >= 0 && r.x + M <= 1334 && r.y + M <= 656);
  }
  assert.equal(view.ensureVisible(-1), false);
});

// ---------- a clipped board's marks ----------

test('a clipped board marks each edge beyond which cells are hidden, and a scroll bar per overflowing axis', () => {
  const l = boardLayout({ cols: 100, rows: 100, width: 1334, height: 656 });
  const start = clipMarks(l, { x: 0, y: 0 });
  assert.deepEqual([start.left, start.top, start.right, start.bottom], [false, false, true, true], 'at the start: right and bottom');
  const mid = clipMarks(l, { x: 300, y: 400 });
  assert.deepEqual([mid.left, mid.top, mid.right, mid.bottom], [true, true, true, true]);
  const end = clipMarks(l, { x: l.maxScrollX, y: l.maxScrollY });
  assert.deepEqual([end.left, end.top, end.right, end.bottom], [true, true, false, false], 'scrolled to an edge, its shadow goes');
  const { thickness, inset } = SCROLLBAR;
  assert.deepEqual(mid.barX, {
    x: 300 / (100 * M) * 1334, y: 656 - inset - thickness, width: 1334 / (100 * M) * 1334, height: thickness,
  }, 'the horizontal bar: the visible part\'s size and place along the bottom');
  assert.deepEqual(mid.barY, {
    x: 1334 - inset - thickness, y: 400 / (100 * M) * 656, width: thickness, height: 656 / (100 * M) * 656,
  }, 'the vertical bar along the right');
  assert.ok(end.barX.x + end.barX.width <= 1334 + 1e-9 && Math.abs(end.barX.x + end.barX.width - 1334) < 1e-9, 'it ends with the board');
  const wide = clipMarks(boardLayout({ cols: 100, rows: 2, width: 1334, height: 656 }), { x: 0, y: 0 });
  assert.equal(wide.barY, null, 'no bar on an axis that fits');
  assert.deepEqual([wide.top, wide.bottom], [false, false]);
  assert.ok(wide.barX);
});

test('the view draws the shadows and bars only on a board that scrolls, and keeps them over a redrawn edge tile', () => {
  const fits = makeView();
  fits.view.setGame(beginnerGame().game);
  assert.equal(gradients(fits.canvas).length, 0, 'a board that fits draws no shadow');
  assert.equal(barFills(fits.canvas).length, 0, 'and no scroll bar');

  const { view, canvas, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656 });
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines: [grid.index(99, 99)], dimensions: { width: 100, height: 100 } });
  canvas.ctx.calls.length = 0;
  view.setGame(game);
  assert.equal(gradients(canvas).length, 2, 'at the start: the right and bottom shadows');
  const shade = gradients(canvas).map((g) => g.gradient.stops);
  assert.ok(shade.every((stops) => stops[0][1] === '#333333' && stops[1][1] === 'transparent'), 'from the shadow token to clear');
  assert.equal(barFills(canvas).length, 2, 'two scroll bars');
  canvas.ctx.calls.length = 0;
  view.scrollTo(view.layout.maxScrollX, 0);
  assert.equal(gradients(canvas).length, 2, 'scrolled to the right edge: left and bottom');
  const right = gradients(canvas).find((g) => g.args[0] === 0 || g.args[0] === 12);
  assert.ok(right, 'the left band starts at the view\'s left edge');

  canvas.ctx.calls.length = 0;
  const edgeCell = grid.index(99, 3); // in the right column, under the vertical bar
  view.update([edgeCell]);
  assert.ok(barFills(canvas).length >= 1, 'a redrawn tile under a bar gets its part of the bar back');
  canvas.ctx.calls.length = 0;
  view.update([edgeCell, grid.index(80, 10)]); // one under the bar, one clear of every mark
  const clips = canvas.ctx.calls.filter((c) => c.op === 'rect').length;
  assert.ok(clips >= 2, 'the marks are clipped to the tiles redrawn');
});

test('the focus ring is drawn on the ring layer, outside its tile: setCursor redraws no cell, and -1 clears it', () => {
  const { view, canvas, overlay, skin, grid } = makeView();
  view.setGame(beginnerGame().game);
  const rings = () => overlay.ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#0000ff');
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setCursor(grid.index(2, 2));
  assert.equal(view.cursor, grid.index(2, 2));
  assert.deepEqual([skin.draws.length, canvas.ctx.calls.length], [0, 0], 'moving it redraws nothing on the board');
  assert.equal(rings().length, 1, 'one ring, in the cursor token while the skin has no module');
  const [x, y, w, h] = rings()[0].args;
  const r = view.cellRect(grid.index(2, 2));
  const lw = Math.max(2, Math.round(r.size / 12));
  assert.deepEqual([x, y, w, h], [r.x - lw / 2, r.y - lw / 2, r.size + lw, r.size + lw], 'a square ring just outside the tile');
  overlay.ctx.calls.length = 0;
  view.setCursor(grid.index(3, 2));
  assert.equal(overlay.ctx.calls.filter((c) => c.op === 'clearRect').length, 1, 'the layer is cleared');
  assert.equal(rings().length, 1, 'and the ring drawn at the new cell alone');
  assert.equal(skin.draws.length, 0, 'still no cell redrawn');
  overlay.ctx.calls.length = 0;
  view.setCursor(-1);
  assert.equal(view.cursor, -1);
  assert.deepEqual([skin.draws.length, rings().length, overlay.ctx.calls.filter((c) => c.op === 'clearRect').length], [0, 0, 1], 'hiding it clears the layer');
  overlay.ctx.calls.length = 0;
  view.setCursor(-1);
  assert.equal(overlay.ctx.calls.length, 0, 'hidden again: nothing');
});

test('the ring layer follows the board: sized with it, redrawn on a repaint and a scroll, clipped to a scrolled view, empty while hidden', () => {
  const { view, overlay, grid } = makeView({ cols: 100, rows: 100, width: 1334, height: 656, pixelRatio: 2 });
  assert.deepEqual([overlay.width, overlay.height, overlay.style.width, overlay.style.height], [2668, 1312, '1334px', '656px'], 'the board canvas\'s size');
  const game = createGameWithMines({ graph: grid.graph, ...REF, mines: [grid.index(99, 99)], dimensions: { width: 100, height: 100 } });
  view.setGame(game);
  const c = grid.index(3, 3);
  view.setCursor(c);
  const ring = () => overlay.ctx.calls.filter((x) => x.op === 'strokeRect' && x.stroke === '#0000ff').at(-1)?.args;
  const before = ring();
  overlay.ctx.calls.length = 0;
  view.scrollBy(10, 0);
  assert.equal(ring()[0], before[0] - 10, 'a scroll moves the ring with its cell');
  const clip = overlay.ctx.calls.find((x) => x.op === 'rect');
  const l = view.layout;
  assert.deepEqual(clip?.args, [l.viewX, l.viewY, l.viewWidth, l.viewHeight], 'clipped to the view');
  overlay.ctx.calls.length = 0;
  view.setHidden(true);
  assert.equal(ring(), undefined, 'a hidden board draws no ring');
  view.setCursor(grid.index(4, 4));
  assert.equal(ring(), undefined);
  view.setHidden(false);
  assert.ok(ring(), 'back with the board');
});

test('the marked start cell is drawn as the skin\'s marked tile while closed, redrawn on its cells only, the cursor beside it', () => {
  const { view, canvas, overlay, skin, grid } = makeView();
  const { game } = beginnerGame();
  view.setGame(game);
  assert.equal(view.mark, -1, 'no mark without a pre-generated board');
  skin.draws.length = 0;
  const centre = grid.index(4, 4);
  view.setMark(centre);
  assert.equal(view.mark, centre);
  assert.deepEqual(skin.draws.map((d) => d.state), ['marked'], 'one cell redrawn, as the marked tile');
  skin.draws.length = 0;
  view.repaint();
  assert.deepEqual(skin.draws.filter((d) => d.state === 'marked').length, 1, 'a repaint keeps it');
  assert.ok(!canvas.ctx.calls.some((c) => c.op === 'strokeRect' || c.op === 'stroke'), 'no ring stroked over the board');
  skin.draws.length = 0;
  view.setCursor(centre);
  assert.equal(skin.draws.length, 0, 'the cursor on the mark leaves the tile alone');
  assert.equal(overlay.ctx.calls.filter((c) => c.op === 'strokeRect').length, 1, 'its ring is on the layer');
  view.setPressed([centre]);
  assert.equal(skin.draws.at(-1).state, 'pressed', 'a held press shows the pressed tile');
  view.setPressed([]);
  assert.equal(skin.draws.at(-1).state, 'marked', 'and the mark again on release');
  game.reveal(centre);
  skin.draws.length = 0;
  view.update([centre]);
  assert.notEqual(skin.draws[0].state, 'marked', 'a revealed start cell is drawn as revealed');
  skin.draws.length = 0;
  view.setMark(-1);
  assert.deepEqual([view.mark, skin.draws.length], [-1, 1], 'the first click takes it away, redrawing its cell');
  skin.draws.length = 0;
  view.setMark(-1);
  assert.equal(skin.draws.length, 0);
});

test('setScale refits at another scale and repaints; every refit reports the layout', () => {
  const layouts = [];
  const { view, skin } = makeView({ scale: '100', onLayout: (l) => layouts.push(l) });
  assert.equal(layouts.length, 1, 'the first fit');
  assert.equal(view.layout.tile, 48);
  view.setGame(beginnerGame().game);
  skin.draws.length = 0;
  view.setScale('125');
  assert.deepEqual([view.scale, view.layout.tile, skin.draws.length], ['125', 55, 81], '125 %: the cap 60 px, here the area\'s 55');
  assert.equal(layouts.at(-1), view.layout);
  view.setScale('fit');
  assert.equal(view.layout.tile, 55);
  skin.draws.length = 0;
  view.setScale('100');
  assert.equal(view.layout.tile, 48);
  assert.equal(skin.draws[0].size, 48, 'repainted at the new size');
  const n = layouts.length;
  skin.draws.length = 0;
  view.setScale('100');
  assert.deepEqual([layouts.length, skin.draws.length], [n, 0], 'the same scale changes nothing');
  view.setScale('huge');
  assert.equal(view.scale, '100', 'an unknown scale is the default');
});

test('a frame given as a function is measured again at every refit, so a resize lays the board out in the frame of that moment', () => {
  let top = 60;
  let calls = 0;
  const frame = () => { calls += 1; return { top, right: 9, bottom: 9, left: 9 }; };
  const layouts = [];
  const { view } = makeView({ cols: 9, rows: 9, width: 600, height: 500, scale: '100', frame, onLayout: (l) => layouts.push(l) });
  assert.ok(view.layout.viewY >= 60, 'laid out inside the first frame');
  const before = calls;
  top = 160;
  view.resize(600, 520);
  assert.ok(calls > before, 'measured again on the resize');
  assert.ok(view.layout.viewY >= 160, `laid out inside the new frame (${view.layout.viewY})`);
  assert.equal(layouts.at(-1), view.layout);
});

// ---------- touch zoom ----------

test('the zoom range runs from the minimum tile to the fit-to-view tile, whichever is larger', () => {
  const phone = makeView({ cols: 30, rows: 16, width: 358, height: 700, scale: '100' });
  assert.equal(phone.view.layout.tile, M, 'the fit rule keeps its floor');
  assert.deepEqual(phone.view.zoomRange, { min: 11, max: M }, 'Expert on a phone: down to the whole-board overview');
  const small = makeView({ scale: '100' });
  assert.equal(small.view.layout.tile, 48, 'the fit rule keeps its cap');
  assert.deepEqual(small.view.zoomRange, { min: M, max: 55 }, 'a small board: up to the tile at which it fills the area');
  const framed = makeView({ cols: 30, rows: 16, width: 358, height: 700, scale: '100', frame: { top: 60, right: 9, bottom: 9, left: 9 } });
  assert.deepEqual(framed.view.zoomRange, { min: 11, max: M }, 'measured inside the frame: (358 − 18) / 30');
});

test('zoom sets the tile within the range, the anchor staying over the same board point, the scroll re-clamped', () => {
  const layouts = [];
  const { view, grid } = makeView({ cols: 100, rows: 100, width: 1000, height: 700, scale: '100', onLayout: (l) => layouts.push(l) });
  assert.deepEqual(view.zoomRange, { min: 7, max: M });
  view.scrollTo(500, 500);
  const cell = view.cellAt(300, 200);
  const point = view.boardPoint(300, 200);
  assert.deepEqual(point, { u: 800 / M, v: 700 / M }, 'a board point in tiles');
  assert.equal(view.zoom(20, 300, 200), true);
  assert.equal(view.layout.tile, 20);
  assert.equal(layouts.at(-1), view.layout, 'a zoom reports its layout');
  assert.deepEqual(view.scroll, { x: Math.round((800 / M) * 20 - 300), y: Math.round((700 / M) * 20 - 200) });
  assert.equal(view.cellAt(300, 200), cell, 'the same cell under the anchor');

  view.zoom(1000, 300, 200);
  assert.equal(view.layout.tile, M, 'never above the range');
  view.zoom(1, 300, 200);
  assert.equal(view.layout.tile, 7, 'never below it');
  assert.equal(view.layout.scrolls, false, 'the whole board shows');
  assert.deepEqual(view.scroll, { x: 0, y: 0 }, 're-clamped to a board that fits');

  view.zoom(M, 0, 0, point);
  assert.equal(view.layout.tile, M);
  assert.deepEqual(view.scroll, { x: 800, y: 700 }, 'a given board point is put under the anchor');
  view.zoom(M, 999, 699, { u: 100, v: 100 });
  assert.deepEqual(view.scroll, { x: 100 * M - 1000, y: 100 * M - 700 }, 'the scroll stays in range');
  assert.equal(grid.width, 100);
});

test('the zoom lasts through a resize, within the new range; a view starts at the fit rule\'s tile', () => {
  const { view } = makeView({ cols: 30, rows: 16, width: 358, height: 700, scale: '100' });
  view.zoom(11, 100, 100);
  view.resize(358, 640, 1);
  assert.equal(view.layout.tile, 11, 'kept');
  view.resize(600, 700, 1);
  assert.deepEqual(view.zoomRange, { min: 20, max: M });
  assert.equal(view.layout.tile, 20, 'clamped into the new range');
  assert.equal(makeView({ cols: 30, rows: 16, width: 358, height: 700, scale: '100' }).view.layout.tile, M, 'a new view opens at the fit rule');
});

test('a framed view keeps the board inside the frame: hit-testing, ensureVisible and the clip stop at the view', () => {
  const frame = { top: 60, right: 9, bottom: 9, left: 9 };
  const { view, canvas, grid } = makeView({ cols: 100, rows: 100, width: 1000, height: 700, frame });
  const l = view.layout;
  assert.deepEqual([l.viewX, l.viewY, l.viewWidth, l.viewHeight], [9, 60, 982, 631]);
  assert.equal(view.cellAt(5, 100), -1, 'the frame is no cell');
  assert.equal(view.cellAt(9, 60), 0);
  view.ensureVisible(grid.index(0, 30));
  const r = view.cellRect(grid.index(0, 30));
  assert.equal(r.y + r.size, 60 + 631, 'brought in above the bottom frame');
  view.ensureVisible(grid.index(0, 0));
  assert.equal(view.cellRect(0).y, 60, 'and below the top one');
  view.setGame(createGameWithMines({ graph: grid.graph, ...REF, mines: [1], dimensions: { width: 100, height: 100 } }));
  const clip = canvas.ctx.calls.filter((c) => c.op === 'rect').at(0);
  assert.deepEqual(clip.args, [9, 60, 982, 631], 'tiles are clipped to the view');
});

// ---------- hidden while paused ----------

test('a hidden board paints the background only, and comes back whole', () => {
  const { view, skin, canvas, grid } = makeView();
  const { game } = beginnerGame();
  view.setGame(game);
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setHidden(true);
  assert.equal(view.hidden, true);
  assert.equal(skin.draws.length, 0, 'no tile shows');
  assert.equal(backgroundFills(canvas).length, 1, 'the background covers the board');
  view.update(game.reveal(grid.index(0, 0)).changed);
  skin.redraw();
  view.resize(620, 500, 1);
  assert.equal(skin.draws.length, 0, 'nothing is drawn while hidden');
  view.setHidden(false);
  assert.equal(skin.draws.length, 81, 'showing repaints every cell');
  assert.equal(skin.draws[0].state, game.cellState(0));
});

test('a view without a game paints the background only, and dispose releases the skin', () => {
  const { view, skin } = makeView();
  view.repaint();
  assert.equal(skin.draws.length, 0);
  assert.equal(view.cellAt(60, 10), 0, 'hit-testing needs no game');
  view.dispose();
  assert.equal(skin.disposed, true);
});

test('the view needs a grid and a canvas', () => {
  assert.throws(() => createBoardView({ canvas: fakeCanvas() }), TypeError);
  assert.throws(() => createBoardView({ grid: createSquareGrid(2, 2) }), TypeError);
});

// ---------- the board module: gap, corner radius, ground and cursor ring ----------

// A skin holding a board module with `params` for its Classic 2D style, handing over another with
// swap(params): the view lays out on its gap and draws its ground and ring.
function boardSkinFactory(params) {
  const out = fakeSkinFactory();
  const make = out.createSkin;
  const moduleOf = (p) => ({
    style2d: { name: 'flat', params: { radius: 0, gap: 0, frameRadius: 0, ...p } },
    palette: { boardGround: '#fefefe', faces2d: { marked: { ring: '#123456' } } },
    cursor: { color: '#0a0a0a', inner: '#f0f0f0', width: 3, innerWidth: 2, radius: { tile: 0.15, px: 3 } },
  });
  let board = moduleOf(params);
  out.createSkin = (options) => Object.assign(make(options), { board: () => board });
  out.swap = (p) => { board = moduleOf(p); out.redraw(); };
  return out;
}

function boardModuleView({ cols = 9, rows = 9, width = 600, height = 500, params = { gap: 0.09, radius: 0.15 }, frame, onLayout, scale = 'fit' } = {}) {
  const grid = createSquareGrid(cols, rows);
  const canvas = fakeCanvas();
  const overlay = fakeCanvas();
  const skin = boardSkinFactory(params);
  const view = createBoardView({ canvas, grid, createSkin: skin.createSkin, scale, frame, onLayout, overlay, token: tokenMap({ '--color-board-frame': '#111111' }) });
  view.resize(width, height, 1);
  return { grid, canvas, overlay, skin, view };
}

test('tiles sit one pitch apart, the tile plus the module\'s gap, and the fit rule counts the gaps', () => {
  assert.equal(gapPx(48, 0.09), 4, 'the gap is a fraction of the tile, in whole pixels');
  assert.equal(gapPx(26, 0.09), 2);
  assert.equal(gapPx(48, 0), 0);
  const l = boardLayout({ cols: 9, rows: 9, width: 600, height: 500, max: 48, gap: 0.09 });
  assert.deepEqual([l.tile, l.gap, l.pitch], [48, 4, 52]);
  assert.deepEqual([l.boardWidth, l.boardHeight], [9 * 48 + 8 * 4, 9 * 48 + 8 * 4], 'the gaps lie between tiles, none outside');
  const tight = boardLayout({ cols: 9, rows: 9, width: 470, height: 470, gap: 0.09 });
  assert.ok(tight.boardWidth <= 470 && 9 * (tight.tile + 1) + 8 * gapPx(tight.tile + 1, 0.09) > 470, `the largest tile whose board fits, gaps included (${tight.tile})`);
  assert.equal(fitTileSize(30, 16, 600, 300, M, 48, 0.09), M, 'a board too large keeps the floor');
  const none = boardLayout({ cols: 9, rows: 9, width: 600, height: 500, max: 48 });
  assert.deepEqual([none.tile, none.gap, none.pitch, none.boardWidth], [48, 0, 48, 9 * 48], 'no gap: tiles edge to edge, as before');
});

test('the view lays tiles out on the pitch, and a pointer in a gap is the cell whose slot holds it', () => {
  const { grid, view, skin } = boardModuleView({ scale: '100' });
  const l = view.layout;
  assert.deepEqual([l.tile, l.gap], [48, 4]);
  const r = view.cellRect(grid.index(2, 1));
  assert.deepEqual(r, { x: l.offsetX + 2 * 52, y: l.offsetY + 52, size: 48 }, 'a cell\'s tile is at its column and row times the pitch');
  assert.equal(view.cellAt(r.x + 1, r.y + 1), grid.index(2, 1));
  assert.equal(view.cellAt(r.x + 48 + 2, r.y + 10), grid.index(2, 1), 'the gap after a tile is its cell\'s slot');
  assert.equal(view.cellAt(r.x + 52, r.y + 10), grid.index(3, 1), 'the next tile starts the next slot');
  assert.equal(view.cellAt(l.offsetX + l.boardWidth - 1, l.offsetY + l.boardHeight - 1), grid.index(8, 8));
  assert.equal(view.cellAt(l.offsetX + l.boardWidth, l.offsetY), -1, 'past the last tile is no cell');
  const { game } = beginnerGame();
  view.setGame(game);
  const draws = skin.draws.filter((d) => d.state === CELL.CLOSED);
  assert.deepEqual([...new Set(draws.map((d) => d.x - l.offsetX))].sort((a, b) => a - b), Array.from({ length: 9 }, (_, i) => i * 52), 'every column at its pitch');
  assert.deepEqual(view.boardPoint(r.x + 24, r.y + 24), { u: (2 * 52 + 24) / 52, v: (52 + 24) / 52 }, 'a board point is in pitches');
});

test('the ground is the module\'s, and a rounded tile is laid on fresh ground when it is redrawn', () => {
  const { view, canvas, grid } = boardModuleView();
  const { game } = beginnerGame();
  view.setGame(game);
  const l = view.layout;
  const fills = canvas.ctx.calls.filter((c) => c.op === 'fillRect');
  assert.deepEqual(fills[0].args, [l.viewX, l.viewY, l.viewWidth, l.viewHeight]);
  assert.equal(fills[0].fill, '#fefefe', 'the view filled with the module\'s ground');
  canvas.ctx.calls.length = 0;
  view.update([grid.index(3, 3)]);
  const r = view.cellRect(grid.index(3, 3));
  assert.deepEqual(canvas.ctx.calls.filter((c) => c.op === 'fillRect').map((c) => [c.fill, ...c.args]), [['#fefefe', r.x, r.y, r.size, r.size]], 'the tile\'s square laid with ground first');
  const square = boardModuleView({ params: { gap: 0, radius: 0 } });
  square.view.setGame(beginnerGame().game);
  square.canvas.ctx.calls.length = 0;
  square.view.update([grid.index(3, 3)]);
  assert.equal(square.canvas.ctx.calls.filter((c) => c.op === 'fillRect').length, 0, 'a square tile covers its old self: no ground under it');
});

test('the cursor ring is the module\'s, outside the tile: the ring 3-6 px out round a white band 1-3 px out, its corner the tile\'s plus 3 px, none of the face covered', () => {
  const { view, canvas, overlay, grid } = boardModuleView({ scale: '100' });
  view.setGame(beginnerGame().game);
  canvas.ctx.calls.length = 0;
  const c = grid.index(4, 4);
  view.setCursor(c);
  assert.equal(canvas.ctx.calls.length, 0, 'the board canvas is untouched');
  const r = view.cellRect(c);
  const strokes = overlay.ctx.calls.filter((x) => x.op === 'stroke');
  assert.deepEqual(strokes.map((x) => x.stroke), ['#0a0a0a', '#f0f0f0'], 'the ring, then its white band inside it');
  const starts = overlay.ctx.calls.filter((x) => x.op === 'moveTo').map((x) => x.args[1] - r.y);
  assert.deepEqual(starts, [-4.5, -2], 'centre lines: the ring 4.5 px out (3 wide: 3-6 px), the band 2 px out (2 wide: 1-3 px)');
  const widths = overlay.ctx.calls.filter((x) => x.op === 'set:lineWidth').map((x) => x.args[0]);
  assert.deepEqual(widths, [3, 2]);
  const corners = overlay.ctx.calls.filter((x) => x.op === 'arcTo').map((x) => x.args[4]);
  const corner = 48 * 0.15 + 3;
  assert.deepEqual([corners[0], corners[4]], [corner + 1.5, corner - 1], 'concentric with the ring\'s corner, tile × .15 + 3 px');
  assert.ok(!overlay.ctx.calls.some((x) => x.op === 'strokeRect'), 'no square ring');
});

test('the mark pulses on the board: its ring drawn twice as wide, MARK_PULSE_STEPS times MARK_PULSE_MS apart, then plain', () => {
  const grid = createSquareGrid(9, 9);
  const canvas = fakeCanvas();
  const skin = boardSkinFactory({ gap: 0.09, radius: 0.15 });
  const timers = [];
  const view = createBoardView({
    canvas, grid, createSkin: skin.createSkin, scale: '100', overlay: fakeCanvas(),
    timers: { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} },
    token: tokenMap({}),
  });
  view.resize(600, 500, 1);
  view.setGame(beginnerGame().game);
  const centre = grid.index(4, 4);
  view.setMark(centre);
  const wide = () => canvas.ctx.calls.filter((c) => c.op === 'stroke' && c.stroke === '#123456');
  canvas.ctx.calls.length = 0;
  view.pulseMark();
  assert.equal(view.markPulse, true);
  assert.equal(wide().length, 1, 'the ring in the marked face\'s ring colour');
  const r = view.cellRect(centre);
  assert.deepEqual(canvas.ctx.calls.filter((c) => c.op === 'translate').at(-1).args, [r.x, r.y], 'on the start cell');
  assert.deepEqual(canvas.ctx.calls.find((c) => c.op === 'arc').args.slice(0, 2), [24, 24], 'centred on its tile');
  assert.ok(canvas.ctx.calls.some((c) => c.op === 'set:lineWidth' && c.args[0] === 4), 'twice the tile\'s ring width');
  let steps = 1;
  while (timers.length) {
    const { fn, ms } = timers.shift();
    assert.equal(ms, MARK_PULSE_MS);
    fn();
    steps += 1;
  }
  assert.equal(steps, MARK_PULSE_STEPS);
  assert.equal(view.markPulse, false, 'ending plain');
});

test('a hand-off with a new gap lays the board out again and reports it', () => {
  const layouts = [];
  const { view, skin } = boardModuleView({ scale: '100', onLayout: (l) => layouts.push(l) });
  view.setGame(beginnerGame().game);
  assert.equal(view.layout.gap, 4);
  layouts.length = 0;
  skin.draws.length = 0;
  skin.swap({ gap: 0, radius: 0 });
  assert.equal(view.layout.gap, 0, 'the new module\'s gap');
  assert.equal(view.layout.pitch, 48);
  assert.equal(layouts.length, 1, 'the new layout is reported, so the frame follows');
  assert.equal(skin.draws.length, 81, 'and the whole board repainted');
});

test('the module is DOM-free at import and independent of three.js', () => {
  const src = readFileSync(join(ROOT, 'js/classic2d/board-view.js'), 'utf8');
  assert.doesNotMatch(src, /^(?!\s*\/\/).*\bthree\b/im);
  assert.equal(typeof globalThis.document, 'undefined', 'imported above without a DOM');
});

// ---------------------------------------------------------------- browser

// Runs in the page: mounts a board view in the area below the overlay bar (64px) with 16px
// margins, plays a deterministic game on it and reports the layout and the colours under a few
// tiles. Mines run down the last column; revealing the top-left cell floods the rest.
async function mountBoard({ cols, rows, scroll }) {
  const { mountBoardView } = await import('/js/classic2d/board-view.js');
  const { createSquareGrid } = await import('/js/engine/square-grid.js');
  const { createGameWithMines } = await import('/js/engine/rules.js');
  const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
  await globalThis.galleryReady;
  while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
  const board = BOARD_ART.current().board;
  globalThis.__view?.destroy();
  let host = document.getElementById('board-host');
  if (!host) {
    host = document.createElement('div');
    host.id = 'board-host';
    Object.assign(host.style, { position: 'fixed', left: '16px', right: '16px', top: '96px', bottom: '16px', zIndex: 9999 });
    document.body.append(host);
  }
  const grid = createSquareGrid(cols, rows);
  const mines = [];
  for (let row = 0; row < rows; row += 2) mines.push(grid.index(cols - 1, row));
  const game = createGameWithMines({ graph: grid.graph, profile: 'minesweeper-online', mines, dimensions: { width: cols, height: rows } });
  const view = mountBoardView({ container: host, grid });
  globalThis.__view = view;
  view.setGame(game);
  view.update(game.reveal(0).changed);
  view.update(game.toggleFlag(grid.index(cols - 1, 0)).changed);
  while (view.motion.cells.length) await new Promise(requestAnimationFrame); // the cell motion settles
  if (scroll) view.scrollTo(scroll.x, scroll.y);
  const ctx = view.canvas.getContext('2d');
  const dpr = view.pixelRatio;
  const rgb = (x, y) => [...ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data.slice(0, 3)];
  const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  // A tile's centre is halfway along its face's shading, from the face colour to its shade (the
  // face itself when it has none).
  const face = (p) => hex(p.face).map((v, i) => Math.round((v + hex(p.faceShade ?? p.face)[i]) / 2));
  const centre = (c) => { const r = view.cellRect(c); return rgb(r.x + r.size / 2, r.y + r.size / 2); };
  const revealedZero = grid.index(0, rows - 1);
  return {
    layout: view.layout,
    scroll: view.scroll,
    canvas: { width: view.canvas.width, height: view.canvas.height },
    outside: [...ctx.getImageData(Math.round(dpr), Math.round(dpr), 1, 1).data][3],
    marks: (() => {
      const l = view.layout;
      const inner = view.cellAt(l.viewX + l.viewWidth / 2, l.viewY + l.viewHeight / 2);
      return {
        bar: rgb(l.viewX + l.viewWidth - 4, l.viewY + l.viewHeight / 2),
        shadow: rgb(l.viewX + 1, l.viewY + l.viewHeight / 2),
        middle: rgb(l.viewX + l.viewWidth / 2, l.viewY + l.viewHeight / 2),
        inner: [game.cellState(inner), game.cellNumber(inner)],
      };
    })(),
    revealed: { want: face(board.palette.faces2d.revealed), got: centre(revealedZero), cell: revealedZero, state: game.cellState(revealedZero) },
    closed: { want: face(board.palette.faces2d.closed), got: centre(grid.index(cols - 1, 1)) },
    ground: { want: hex(board.palette.boardGround), got: (() => { const r = view.cellRect(0); return rgb(r.x + r.size + view.layout.gap / 2, r.y + r.size / 2); })() },
    corner: (() => { const r = view.cellRect(revealedZero); return rgb(r.x + 0.5, r.y + 0.5); })(),
    gapFraction: board.style2d.params.gap,
    topLeftCell: view.cellAt(1, 1),
    middle: (() => {
      const c = view.cellAt(view.layout.width / 2, view.layout.height / 2);
      return { state: game.cellState(c), number: game.cellNumber(c), got: centre(c) };
    })(),
  };
}

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);
// The largest whole tile at which `n` tiles and the gaps between them fit `room`, with a module's gap.
const span = (n, tile, gap) => n * tile + (n - 1) * Math.round(tile * gap);
const fitWith = (n, room, gap) => {
  let tile = Math.floor(room / n);
  while (tile > 1 && span(n, tile, gap) > room) tile--;
  return tile;
};

test('in a browser, Beginner and Expert, a theme switch and a large scrolled custom board are drawn correctly', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-classic2d-view-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    // The host stands where the board sits in play: below the 64px bar, 16px from every edge.
    const area = { width: 1366 - 32, height: 768 - 96 - 16 };
    const M = 26;

    let r9 = null;
    for (const theme of ['joyful-tiles']) {
      for (const [name, cols, rows] of [['beginner', 9, 9], ['expert', 30, 16]]) {
        const r = await page.evaluate(mountBoard, { cols, rows });
        if (name === 'beginner') r9 = r;
        const tile = Math.max(M, Math.min(48, fitWith(cols, area.width, r.gapFraction), fitWith(rows, area.height, r.gapFraction)));
        assert.equal(r.layout.tile, tile, `${theme} ${name}: tile ${tile}`);
        assert.equal(r.layout.gap, Math.round(tile * r.gapFraction), `${theme} ${name}: the module's gap at that tile`);
        assert.ok(near(r.ground.got, r.ground.want), `${theme} ${name}: the ground between tiles ${r.ground.got} ~ ${r.ground.want}`);
        assert.ok(near(r.corner, r.ground.want), `${theme} ${name}: a tile's rounded corner shows the ground ${r.corner}`);
        if (name === 'beginner') assert.equal(r.layout.tile, 48, 'Beginner at the default cap');
        assert.equal(r.layout.scrolls, false, `${theme} ${name}: fits without scrolling`);
        assert.deepEqual(r.canvas, area, `${theme} ${name}: canvas fills the area`);
        assert.equal(r.revealed.state, 'revealed');
        assert.ok(near(r.revealed.got, r.revealed.want), `${theme} ${name}: revealed tile ${r.revealed.got} ~ ${r.revealed.want}`);
        assert.ok(near(r.closed.got, r.closed.want), `${theme} ${name}: closed tile ${r.closed.got} ~ ${r.closed.want}`);
        if (name === 'beginner') {
          assert.equal(r.outside, 0, `${theme}: the canvas is clear around a board that fits`);
          assert.equal(r.topLeftCell, -1, 'the corner of a centred board is no cell');
        }
        const shot = await page.locator('#board-host').screenshot({ path: join(shots, `classic2d-${name}-${theme}.png`) });
        assert.ok(shot.length > 1000, `${theme} ${name}: screenshot taken`);
      }
    }

    // A theme change repaints through the skin's redraw callback.
    await page.evaluate(mountBoard, { cols: 9, rows: 9 });
    const after = await page.evaluate(async () => {
      const { registerTheme } = await import('/js/themes/registry.js');
      const { FIXTURE_THEME } = await import('/tests/fixtures/themes/fixture-theme.js');
      const { themeApplier } = await import('/js/themes/applier.js');
      const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
      registerTheme(FIXTURE_THEME);
      await themeApplier().setTheme(FIXTURE_THEME.id);
      while (BOARD_ART.current().id !== FIXTURE_THEME.id) await new Promise((r) => setTimeout(r, 20));
      const v = globalThis.__view;
      const r = v.cellRect(8 * 9);
      const d = v.canvas.getContext('2d').getImageData(Math.round(r.x + r.size / 2), Math.round(r.y + r.size / 2), 1, 1).data;
      const hex = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
      const { face, faceShade } = BOARD_ART.current().board.palette.faces2d.revealed;
      const want = hex(face).map((x, i) => Math.round((x + hex(faceShade)[i]) / 2));
      return { got: [d[0], d[1], d[2]], want, gap: v.layout.gap, theme: document.documentElement.getAttribute('data-theme') };
    });
    assert.equal(after.theme, 'fixture-dusk');
    assert.ok(near(after.got, after.want), `repainted in the fixture theme ${after.got} ~ ${after.want}`);
    assert.ok(!near(after.got, r9.revealed.want), 'the colour changed with the theme');
    assert.equal(after.gap, 0, 'laid out again on the fixture\'s pitch: no gap');
    await page.evaluate(async () => {
      const { themeApplier } = await import('/js/themes/applier.js');
      const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
      await themeApplier().setTheme('joyful-tiles');
      while (BOARD_ART.current().id !== 'joyful-tiles') await new Promise((r) => setTimeout(r, 20));
    });

    // A large custom board keeps the minimum tile and scrolls by wheel, shift-drag and cursor follow.
    const big = await page.evaluate(mountBoard, { cols: 100, rows: 100, scroll: { x: 600, y: 900 } });
    assert.equal(big.layout.tile, M);
    assert.equal(big.layout.scrolls, true);
    assert.deepEqual(big.scroll, { x: 600, y: 900 });
    const pitch = M + big.layout.gap;
    assert.equal(big.topLeftCell, Math.floor(901 / pitch) * 100 + Math.floor(601 / pitch));
    assert.deepEqual(big.marks.inner, ['revealed', 0]);
    assert.ok(near(big.marks.middle, big.revealed.want), 'the middle is the plain tile');
    assert.ok(!near(big.marks.bar, big.revealed.want), `the vertical scroll bar shows on the right edge ${big.marks.bar}`);
    assert.ok(!near(big.marks.shadow, big.revealed.want), `the left edge, scrolled past, is shaded ${big.marks.shadow}`);
    assert.deepEqual([big.middle.state, big.middle.number], ['revealed', 0]);
    assert.ok(near(big.middle.got, big.revealed.want), `scrolled board drawn: ${big.middle.got} ~ ${big.revealed.want}`);
    const box = await page.locator('#board-host').boundingBox();
    await page.mouse.move(box.x + 300, box.y + 300);
    await page.mouse.wheel(0, 200);
    await page.waitForFunction(() => globalThis.__view.scroll.y === 1100);
    await page.keyboard.down('Shift');
    await page.mouse.down();
    await page.mouse.move(box.x + 250, box.y + 260, { steps: 4 });
    await page.mouse.up();
    await page.keyboard.up('Shift');
    assert.deepEqual(await page.evaluate(() => globalThis.__view.scroll), { x: 650, y: 1140 }, 'shift-drag pans');
    const sample = await page.evaluate(() => {
      const v = globalThis.__view;
      v.ensureVisible(99 * 100 + 50);
      const r = v.cellRect(99 * 100 + 50);
      const d = v.canvas.getContext('2d').getImageData(Math.round(r.x + r.size / 2), Math.round(r.y + r.size / 2), 1, 1).data;
      return { rect: r, got: [d[0], d[1], d[2]], height: v.canvas.height };
    });
    assert.ok(sample.rect.y + M <= sample.height && sample.rect.y >= 0, 'the cursor cell is brought into view');
    assert.ok(near(sample.got, big.revealed.want), `bottom-row revealed tile drawn after scrolling ${sample.got}`);
    const shot = await page.locator('#board-host').screenshot({ path: join(shots, 'classic2d-custom-100x100-scrolled.png') });
    assert.ok(shot.length > 1000);

    // Resizing the window refits the board.
    await page.evaluate(mountBoard, { cols: 9, rows: 9 });
    await page.setViewportSize({ width: 500, height: 400 });
    const small = Math.max(26, Math.min(48, fitWith(9, 468, r9.gapFraction), fitWith(9, 288, r9.gapFraction)));
    await page.waitForFunction((tile) => globalThis.__view.layout.tile === tile, small);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    rmSync(shots, { recursive: true, force: true });
  }
});

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

// Runs in the game page: what the open Classic 2D board shows — every cell's state, the colour at the
// centre of a revealed and of a closed tile against the active board module's faces, the gap, and the
// board frame's corner radius against the module's frame radius at the tile.
function boardSeen() {
  const view = globalThis.__ms.board2D;
  const game = globalThis.__ms.game2D;
  const { BOARD_ART } = globalThis.__boardArt;
  const { id, board } = BOARD_ART.current();
  const ctx = view.canvas.getContext('2d');
  const ratio = view.pixelRatio;
  const states = Array.from({ length: 81 }, (_, c) => game.cellState(c));
  const centre = (c) => { const r = view.cellRect(c); return [...ctx.getImageData(Math.round((r.x + r.size / 2) * ratio), Math.round((r.y + r.size / 2) * ratio), 1, 1).data.slice(0, 3)]; };
  const hex = (v) => [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16));
  const face = (p) => hex(p.face).map((v, i) => Math.round((v + hex(p.faceShade ?? p.face)[i]) / 2));
  const revealed = states.findIndex((s, c) => s === 'revealed' && game.cellNumber(c) === 0);
  const closed = states.indexOf('closed');
  return {
    id,
    states,
    revealed: { got: centre(revealed), want: face(board.palette.faces2d.revealed) },
    closed: { got: centre(closed), want: face(board.palette.faces2d.closed) },
    gap: view.layout.gap,
    wantGap: Math.round(view.layout.tile * board.style2d.params.gap),
    frameRadius: getComputedStyle(document.getElementById('c2d-panel')).borderTopLeftRadius,
    wantFrameRadius: `${Math.round(view.layout.tile * board.style2d.params.frameRadius)}px`,
  };
}

// The board the mid-game theme switch plays: Beginner with its seed fixed, so the first click in the
// middle opens an area every run — a revealed blank and a closed tile to sample — and the game goes on.
const SWITCH_BOARD = Object.freeze({
  choice: Object.freeze({ size: 'beginner', noGuess: false }),
  fixed: Object.freeze({ startCell: 40, seed: 3 }),
});

test('the board the mid-game theme switch plays opens an area on its first click and leaves closed cells', () => {
  const s = createSession({ choice: SWITCH_BOARD.choice, client: { request() { throw new Error('a standard board asks no worker'); }, cancel() {} }, fixed: SWITCH_BOARD.fixed });
  s.reveal(SWITCH_BOARD.fixed.startCell);
  assert.equal(s.state, 'playing');
  assert.equal(s.game.cellNumber(SWITCH_BOARD.fixed.startCell), 0, 'the first click opens an area');
  const states = Array.from({ length: 81 }, (_, c) => s.game.cellState(c));
  assert.ok(states.filter((x) => x === 'revealed').length > 1 && states.includes('closed'));
});

test('in a browser, switching between Joyful tiles and a fixture theme mid-game redraws the tiles, the gap and the frame in each, with no state change', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.evaluate(async (board) => {
      globalThis.__boardArt = await import('/js/classic2d/tile-skin.js');
      globalThis.__ms.modes.start('classic-2d', { ...board.choice, fixed: board.fixed });
    }, SWITCH_BOARD);
    await page.waitForFunction(() => globalThis.__ms.board2D?.layout && globalThis.__boardArt.BOARD_ART.current());
    // The first reveal, in the middle of the board, opens an area.
    const box = await page.locator('#c2d-board canvas').first().boundingBox();
    const at = await page.evaluate(() => { const r = globalThis.__ms.board2D.cellRect(40); return { x: r.x + r.size / 2, y: r.y + r.size / 2 }; });
    await page.mouse.click(box.x + at.x, box.y + at.y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started && globalThis.__ms.game2D.cellState(40) === 'revealed');
    await page.waitForFunction(() => globalThis.__ms.board2D.motion.cells.length === 0); // the cell motion settles
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

    const joyful = await page.evaluate(boardSeen);
    assert.equal(joyful.id, 'joyful-tiles');
    assert.ok(joyful.gap > 0 && joyful.gap === joyful.wantGap, `Joyful tiles: the module's gap (${joyful.gap} px)`);
    assert.ok(near(joyful.revealed.got, joyful.revealed.want), `Joyful tiles: revealed ${joyful.revealed.got} ~ ${joyful.revealed.want}`);
    assert.ok(near(joyful.closed.got, joyful.closed.want), `Joyful tiles: closed ${joyful.closed.got} ~ ${joyful.closed.want}`);
    assert.equal(joyful.frameRadius, joyful.wantFrameRadius, 'Joyful tiles: the frame\'s radius follows the tile');

    const switchTo = (id) => page.evaluate(async (theme) => {
      const { registerTheme } = await import('/js/themes/registry.js');
      const { FIXTURE_THEME } = await import('/tests/fixtures/themes/fixture-theme.js');
      const { themeApplier } = await import('/js/themes/applier.js');
      registerTheme(FIXTURE_THEME);
      await themeApplier().setTheme(theme);
      while (globalThis.__boardArt.BOARD_ART.current().id !== theme) await new Promise((r) => setTimeout(r, 20));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, id);

    await switchTo('fixture-dusk');
    const fixture = await page.evaluate(boardSeen);
    assert.deepEqual(fixture.states, joyful.states, 'the switch changes no cell');
    assert.equal(fixture.gap, 0, 'the fixture\'s tiles sit edge to edge');
    assert.ok(near(fixture.revealed.got, fixture.revealed.want), `fixture: revealed ${fixture.revealed.got} ~ ${fixture.revealed.want}`);
    assert.ok(near(fixture.closed.got, fixture.closed.want), `fixture: closed ${fixture.closed.got} ~ ${fixture.closed.want}`);
    assert.ok(!near(fixture.revealed.got, joyful.revealed.got), 'the tiles redrew in the new theme');

    await switchTo('joyful-tiles');
    const back = await page.evaluate(boardSeen);
    assert.deepEqual(back.states, joyful.states, 'and back, still no cell changed');
    assert.deepEqual([back.gap, back.revealed.got, back.closed.got, back.frameRadius], [joyful.gap, joyful.revealed.got, joyful.closed.got, joyful.frameRadius], 'Joyful tiles drawn as before');
    assert.equal(await page.evaluate(() => globalThis.__ms.modes.state.started), true, 'the game goes on');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
