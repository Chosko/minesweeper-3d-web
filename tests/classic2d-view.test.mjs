// Classic 2D board view (js/classic2d/board-view.js): the fit rule and layout — the floor, the cap
// per board scale, the frame and the panel around the board, Expert and Beginner at the windows
// the game must fit — hit-testing in a fitted and a scrolled board, per-cell redraw from the
// engine's change lists through the tile skin, full repaints on resize, pixel-ratio, scale and
// theme change, scrolling and panning, a clipped board's shadows and scroll bars, the focus ring's
// redraws, the hidden board while paused, and in a browser the board drawn in both themes and the
// Classic 2D screen at the windows it must fit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  fitTileSize, boardLayout, cellAtLayout, createBoardView, PAN_MODIFIER, BOARD_BACKGROUND, BOARD_SHADOW, BOARD_SCROLLBAR,
  BOARD_SCALES, DEFAULT_BOARD_SCALE, TILE_CAP, tileCap, panelRect, clipMarks, SCROLLBAR, CURSOR_RING, START_MARK,
} from '../js/classic2d/board-view.js';
import { SCHEMA } from '../js/settings/schema.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { createEndEffect, reachMs, WIN, LOSS, PULSE_COLOR, CONFETTI_COLORS } from '../js/classic2d/end-effect.js';
import { END_DELAY_MS } from '../js/classic2d/mode.js';
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
    set(target, prop, value) { target[prop] = value; return true; },
  });
}

function fakeCanvas() {
  const ctx = fakeContext();
  return { width: 0, height: 0, style: {}, ctx, getContext: () => ctx };
}

// A skin recording every tile it draws, and the redraw callback the view hands it.
function fakeSkinFactory() {
  const out = { draws: [], redraw: null, disposed: false };
  out.createSkin = ({ redraw }) => {
    out.redraw = redraw;
    return {
      drawTile(ctx, x, y, size, state, number, ratio) { out.draws.push({ x, y, size, state, number, ratio }); },
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
function makeView({ cols = 9, rows = 9, width = 600, height = 500, pixelRatio = 1, token, scale = 'fit', frame, onLayout } = {}) {
  const grid = createSquareGrid(cols, rows);
  const canvas = fakeCanvas();
  const skin = fakeSkinFactory();
  const tokens = {
    light: { '--color-board-frame': '#111111', '--color-board-shadow': '#333333', '--color-board-scrollbar': '#444444', '--color-tile-cursor': '#0000ff', '--color-success': '#00aa00' },
    dark: { '--color-board-frame': '#222222', '--color-board-shadow': '#333333', '--color-board-scrollbar': '#444444', '--color-tile-cursor': '#0000ff', '--color-success': '#00aa00' },
  };
  let theme = 'light';
  const view = createBoardView({
    canvas, grid, createSkin: skin.createSkin, scale, frame, onLayout,
    token: token ?? ((name) => tokenMap(tokens[theme])(name)),
  });
  view.resize(width, height, pixelRatio);
  return { grid, canvas, skin, view, setTheme: (t) => { theme = t; } };
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

// The panel's frame as the Classic 2D screen takes it (js/ui.js panelFrame2D): a 1 px border and
// 8 px inside it on every side, the readouts on the top edge (a 48 px row stands in for the
// measured one, a little taller than it) and 8 px between them and the board.
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
  const css = readFileSync(join(ROOT, 'css/tokens.css'), 'utf8');
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

test('a win\'s end effect brightens the tiles the pulse is passing and throws confetti over the board\'s own rectangle only', () => {
  const { view, skin, canvas, grid } = makeView({ token: (name) => (name === PULSE_COLOR ? '#fefefe' : CONFETTI_COLORS.includes(name) ? '#c0ffee' : '#111111') });
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
  const pulses = canvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === '#fefefe');
  const at = view.cellRect(origin);
  assert.ok(pulses.some((c) => c.args[0] === at.x && c.args[1] === at.y), 'the pulse brightens the origin first');
  const far = view.cellRect(grid.index(8, 8));
  assert.equal(pulses.some((c) => c.args[0] === far.x && c.args[1] === far.y), false, 'not yet the far corner');
  const pieces = canvas.ctx.calls.filter((c) => c.op === 'fillRect' && c.fill === '#c0ffee');
  assert.ok(pieces.length > 0, 'confetti is drawn');
  const clip = canvas.ctx.calls.findLast((c) => c.op === 'rect');
  const { viewX, viewY, viewWidth, viewHeight } = view.layout;
  assert.deepEqual(clip.args, [viewX, viewY, viewWidth, viewHeight], 'clipped to the board\'s rectangle in view');
  for (const t of canvas.ctx.calls.filter((c) => c.op === 'translate')) {
    assert.ok(t.args[0] >= viewX && t.args[0] <= viewX + viewWidth && t.args[1] >= viewY && t.args[1] <= viewY + viewHeight, 'each piece over the board');
  }
  skin.draws.length = 0;
  view.showEffect(effect, reachMs(effect, mine));
  assert.equal(drawnStates(view, skin, grid).get(mine), CELL.FLAGGED, 'reached: shown as its end-state flag');
  canvas.ctx.calls.length = 0;
  skin.draws.length = 0;
  view.showEffect(null);
  assert.equal(canvas.ctx.calls.some((c) => c.op === 'fillRect' && (c.fill === '#fefefe' || c.fill === '#c0ffee')), false, 'nothing of the effect is left');
  const shown = drawnStates(view, skin, grid);
  for (let c = 0; c < 81; c++) {
    assert.equal(shown.get(c), game.cellState(c) === CELL.CLOSED ? CELL.FLAGGED : game.cellState(c), `cell ${c}: the won board's end state, every unflagged mine a flag`);
  }
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
  view.setCursor(edgeCell);
  assert.ok(barFills(canvas).length >= 1, 'a redrawn tile under a bar gets its part of the bar back');
  canvas.ctx.calls.length = 0;
  view.setCursor(grid.index(80, 10)); // the old one under the bar, the new one clear of every mark
  const clips = canvas.ctx.calls.filter((c) => c.op === 'rect').length;
  assert.ok(clips >= 2, 'the marks are clipped to the tiles redrawn');
});

test('the focus ring: setCursor redraws only the cells it leaves and enters, and -1 hides it, redrawing one cell', () => {
  const { view, canvas, skin, grid } = makeView();
  view.setGame(beginnerGame().game);
  const rings = () => canvas.ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#0000ff');
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setCursor(grid.index(2, 2));
  assert.deepEqual([skin.draws.length, rings().length], [1, 1], 'showing it: one cell');
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  view.setCursor(-1);
  assert.equal(view.cursor, -1);
  assert.deepEqual([skin.draws.length, rings().length], [1, 0], 'hiding it: its cell only, with no ring');
  assert.deepEqual([skin.draws[0].x, skin.draws[0].y], [52 + 2 * 55, 2 + 2 * 55]);
  skin.draws.length = 0;
  view.setCursor(-1);
  assert.equal(skin.draws.length, 0, 'hidden again: nothing');
});

test('the start-cell mark: a ring in the cursor ring\'s style from an existing token, redrawn on its cells only, under the cursor', () => {
  assert.equal(START_MARK, '--color-success', 'an existing design token, apart from the cursor ring\'s');
  const tokensCss = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8');
  assert.equal((tokensCss.match(/--color-success:/g) ?? []).length >= 2, true, 'defined in both themes');
  const { view, canvas, skin, grid } = makeView();
  view.setGame(beginnerGame().game);
  const marks = () => canvas.ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#00aa00');
  const rings = () => canvas.ctx.calls.filter((c) => c.op === 'strokeRect' && c.stroke === '#0000ff');
  assert.equal(view.mark, -1, 'no mark without a pre-generated board');
  skin.draws.length = 0;
  canvas.ctx.calls.length = 0;
  const centre = grid.index(4, 4);
  view.setMark(centre);
  assert.equal(view.mark, centre);
  assert.deepEqual([skin.draws.length, marks().length], [1, 1], 'one cell redrawn, with its ring');
  const cursorRing = (() => { canvas.ctx.calls.length = 0; view.setCursor(grid.index(2, 2)); return rings()[0]; })();
  const markRing = (() => { canvas.ctx.calls.length = 0; view.repaint(); return marks()[0]; })();
  assert.equal(markRing.args[2], cursorRing.args[2], 'the cursor ring\'s size and inset');
  assert.equal(markRing.args[0] - (52 + 4 * 55), cursorRing.args[0] - (52 + 2 * 55), 'the same inset in its tile');
  // the cursor on the mark draws the cursor's ring alone
  canvas.ctx.calls.length = 0;
  view.setCursor(centre);
  assert.deepEqual([marks().length, rings().length], [0, 1]);
  view.setCursor(-1);
  canvas.ctx.calls.length = 0;
  skin.draws.length = 0;
  view.setMark(-1);
  assert.deepEqual([view.mark, skin.draws.length, marks().length], [-1, 1, 0], 'the first click takes it away, redrawing its cell');
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
  const { token } = await import('/js/tokens.js');
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
  if (scroll) view.scrollTo(scroll.x, scroll.y);
  const ctx = view.canvas.getContext('2d');
  const dpr = view.pixelRatio;
  const rgb = (x, y) => [...ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data.slice(0, 3)];
  const hex = (name) => { const v = token(name).trim(); return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
  // A tile's centre is halfway along its face's shading, from the face colour to its shade.
  const face = (name, shade) => hex(name).map((v, i) => Math.round((v + hex(shade)[i]) / 2));
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
    revealed: { want: face('--color-tile-revealed', '--color-tile-revealed-shade'), got: centre(revealedZero), cell: revealedZero, state: game.cellState(revealedZero) },
    closed: { want: face('--color-tile-closed', '--color-tile-face-shade'), got: centre(grid.index(cols - 1, 1)) },
    topLeftCell: view.cellAt(1, 1),
    middle: (() => {
      const c = view.cellAt(view.layout.width / 2, view.layout.height / 2);
      return { state: game.cellState(c), number: game.cellNumber(c), got: centre(c) };
    })(),
  };
}

const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) <= 6);

test('in a browser, Beginner and Expert in both themes and a large scrolled custom board are drawn correctly', async (t) => {
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

    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      for (const [name, cols, rows] of [['beginner', 9, 9], ['expert', 30, 16]]) {
        const r = await page.evaluate(mountBoard, { cols, rows });
        const tile = Math.max(M, Math.min(48, Math.floor(Math.min(area.width / cols, area.height / rows))));
        assert.equal(r.layout.tile, tile, `${theme} ${name}: tile ${tile}`);
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
    await page.evaluate(() => globalThis.msTheme.setTheme('light'));
    await page.evaluate(mountBoard, { cols: 9, rows: 9 });
    await page.evaluate(() => globalThis.msTheme.setTheme('dark'));
    const after = await page.evaluate(async () => {
      const { token } = await import('/js/tokens.js');
      const v = globalThis.__view;
      const r = v.cellRect(8 * 9);
      const d = v.canvas.getContext('2d').getImageData(Math.round(r.x + r.size / 2), Math.round(r.y + r.size / 2), 1, 1).data;
      const hex = (name) => { const v = token(name).trim(); return [1, 3, 5].map((i) => parseInt(v.slice(i, i + 2), 16)); };
      const want = hex('--color-tile-revealed').map((v, i) => Math.round((v + hex('--color-tile-revealed-shade')[i]) / 2));
      return { got: [d[0], d[1], d[2]], want };
    });
    assert.ok(near(after.got, after.want), `repainted in the dark theme ${after.got} ~ ${after.want}`);

    // A large custom board keeps the minimum tile and scrolls by wheel, shift-drag and cursor follow.
    await page.evaluate(() => globalThis.msTheme.setTheme('light'));
    const big = await page.evaluate(mountBoard, { cols: 100, rows: 100, scroll: { x: 600, y: 900 } });
    assert.equal(big.layout.tile, M);
    assert.equal(big.layout.scrolls, true);
    assert.deepEqual(big.scroll, { x: 600, y: 900 });
    assert.equal(big.topLeftCell, Math.floor(901 / M) * 100 + Math.floor(601 / M));
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
    await page.waitForFunction(() => globalThis.__view.layout.tile === Math.max(26, Math.min(48, Math.floor(Math.min(468 / 9, 288 / 9)))));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    rmSync(shots, { recursive: true, force: true });
  }
});
