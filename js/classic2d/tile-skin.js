// Square tile skin for the Classic 2D Canvas board: the stateless tile
// painter, the tile cache that pre-renders every state and number, the board
// art hand-off it draws from, and the shared minimum tile size. Every tile is
// drawn through the shared tile recipe (js/tile-art.js) in the active theme's
// Classic 2D drawing style, palette and number font, all from the theme's board
// module (js/themes/board-module.js), which the shell hands over through
// BOARD_ART once the number font has loaded (js/shell/board-art.js). A tile is
// drawn through its cell's outline and glyph box, which the renderer takes from
// the board's grid geometry (js/geometry/index.js); a tile given none is the
// square of its size. The skin holds no palette, imports no theme and reads no
// stylesheet. The renderer owns layout and hit-testing; the skin owns appearance
// only.

import { FALLBACK_COLOR } from '../tokens.js';
import { drawFace, drawNumberGlyph, drawMineGlyph, drawFlagGlyph, drawCross, drawMarkRing, explodedParams } from '../tile-art.js';

// The smallest tile size the Classic 2D renderer allows, shared with it: the
// readable floor a board shrinks to before it scrolls (the fit rule never goes
// below it). Every state and number stays legible at it in every theme
// (tests/tile-skin.test.mjs).
export const MIN_TILE_SIZE = 26;

// The rules engine's cell states (js/engine/rules.js CELL) plus the renderer's own two: `pressed`,
// its feedback under a held click or chord, and `marked`, the closed start cell a pre-generated
// board waits for.
export const TILE_STATES = Object.freeze(['closed', 'pressed', 'revealed', 'flagged', 'mine', 'exploded', 'wrong-flag', 'marked']);

// The depths the cache holds the raised states at — the closed, pressed and flagged faces — for the
// cell motion's depth (js/classic2d/motion-layer.js): a depth draws from the nearest step, 1 the
// face's own. A few fixed steps, so depth costs a few cached images and never a draw per frame.
export const DEPTH_STEPS = Object.freeze([0, 0.25, 0.5, 0.75, 1]);
const DEPTH_STATES = Object.freeze(['closed', 'pressed', 'flagged']);

/** The step of DEPTH_STEPS nearest `depth` (clamped to 0..1), or 1 for none. */
export function depthStep(depth) {
  if (depth === null || depth === undefined || !Number.isFinite(depth)) return 1;
  const d = Math.max(0, Math.min(1, depth));
  let best = 1;
  for (const s of DEPTH_STEPS) if (Math.abs(s - d) < Math.abs(best - d)) best = s;
  return best;
}

// The board art hand-off: the board module the shell last handed over, as { id, board } (null until
// the first), and its subscribers. set(id, board) replaces it and tells every subscriber;
// onChange(listener) returns the unsubscribe.
export function createBoardArt() {
  let art = null;
  const listeners = new Set();
  return {
    current: () => art,
    set(id, board) {
      art = Object.freeze({ id, board });
      for (const listener of [...listeners]) listener(art);
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// The page's one hand-off, every skin's default.
export const BOARD_ART = createBoardArt();

// Visibly wrong on purpose, so an unhandled state is noticed on the board.
function placeholder(ctx, x, y, size, shape = null) {
  if (shape?.clip) {
    ctx.save();
    ctx.translate(x, y);
    clipTo(ctx, shape.points);
    ctx.fillStyle = FALLBACK_COLOR;
    ctx.fillRect(0, 0, shape.width, shape.height);
    cross(ctx, 0, 0, size);
    ctx.restore();
    return;
  }
  ctx.fillStyle = FALLBACK_COLOR;
  ctx.fillRect(x, y, size, size);
  cross(ctx, x, y, size);
}

function cross(ctx, x, y, size) {
  const m = size * 0.2;
  ctx.strokeStyle = 'black';
  ctx.lineWidth = Math.max(2, size / 8);
  ctx.beginPath();
  ctx.moveTo(x + m, y + m);
  ctx.lineTo(x + size - m, y + size - m);
  ctx.moveTo(x + size - m, y + m);
  ctx.lineTo(x + m, y + size - m);
  ctx.stroke();
}

const validNumber = (n) => Number.isInteger(n) && n >= 0 && n <= 8;

function clipTo(ctx, points) {
  ctx.beginPath();
  points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
  ctx.closePath();
  ctx.clip();
}

// A cell's tile shape from its outline and glyph box on the board (the geometry's): its shape and
// orientation, its box's size, its corners and its glyph box from the box's own corner, and
// whether it clips (every shape but the square, whose tile is its box). Null for a cell given none.
function tileShape(cell) {
  const o = cell?.outline;
  if (!o) return null;
  const g = cell.glyphBox ?? { x: o.x, y: o.y, width: o.width, height: o.height };
  return {
    shape: o.shape,
    orientation: o.orientation ?? 'none',
    width: o.width,
    height: o.height,
    clip: o.shape !== 'square',
    points: (o.points ?? []).map(([px, py]) => [px - o.x, py - o.y]),
    glyph: { x: g.x - o.x, y: g.y - o.y, width: g.width, height: g.height },
  };
}

// One device pixel in the context's CSS pixels, from the scale it draws at, so
// the recipe's bands snap to whole device pixels.
function devicePixel(ctx) {
  const scale = Math.abs(ctx.getTransform?.()?.a ?? 1);
  return scale > 0 ? 1 / scale : 1;
}

// Paints one tile of `state` (and `number` when revealed) at x, y, size CSS pixels from `board`, a
// theme's board module: its Classic 2D style and parameters, its 2D faces, flag, mine and cross,
// and its 2D numbers in its number font — the exploded tile with the style's exploded parameters
// (explodedParams), the marked start cell its marked face under the dashed ring; `depth` (0 flat to
// 1 fully raised) is the closed, pressed and flagged faces' style depth. `cell`, { outline,
// glyphBox } from the board's geometry, shapes the tile: x, y is its outline's box corner, the face
// is clipped to the outline and the glyphs are set in the glyph box; the square outline is the tile
// itself, drawn exactly as a tile given no cell.
export function paintTileWith(board, ctx, x, y, size, state, number, depth = 1, cell = null) {
  const shape = tileShape(cell);
  if (!board || !TILE_STATES.includes(state) || (state === 'revealed' && !validNumber(number))) {
    placeholder(ctx, x, y, size, shape);
    return;
  }
  const { style2d: style, palette } = board;
  const faces = palette.faces2d;
  const px = devicePixel(ctx);
  const faceSize = shape?.clip ? Math.max(shape.width, shape.height) : size;
  const face = (name, colours, params = style.params) => drawFace(ctx, faceSize, name, { style: style.name, params, palette: colours, px, depth });
  // The glyphs, in the glyph box: a square of its smaller side, centred in it.
  const glyph = (draw) => {
    if (!shape?.clip) return draw(size);
    const g = shape.glyph;
    const S = Math.min(g.width, g.height);
    ctx.save();
    ctx.translate(g.x + (g.width - S) / 2, g.y + (g.height - S) / 2);
    draw(S);
    ctx.restore();
  };
  ctx.save();
  ctx.translate(x, y);
  if (shape?.clip) clipTo(ctx, shape.points);
  switch (state) {
    case 'closed':
      face('closed', faces.closed);
      break;
    case 'pressed':
      face('sunk', faces.sunk);
      break;
    case 'revealed':
      face('revealed', faces.revealed);
      if (number > 0) glyph((S) => drawNumberGlyph(ctx, S, number, { color: board.numbers2d[number], shadow: palette.numberShadow, font: board.font }));
      break;
    case 'flagged':
      face('closed', faces.closed);
      glyph((S) => drawFlagGlyph(ctx, S, palette.flag));
      break;
    case 'mine':
      face('revealed', faces.revealed);
      glyph((S) => drawMineGlyph(ctx, S, palette.mine));
      break;
    case 'exploded':
      face('revealed', faces.exploded, explodedParams(style.params));
      glyph((S) => drawMineGlyph(ctx, S, palette.mine));
      break;
    case 'marked':
      face('closed', faces.marked);
      glyph((S) => drawMarkRing(ctx, S, { color: faces.marked.ring }));
      break;
    case 'wrong-flag':
      face('revealed', faces.revealed);
      glyph((S) => {
        drawFlagGlyph(ctx, S, palette.flag);
        drawCross(ctx, S, palette.cross);
      });
      break;
    default:
      break;
  }
  ctx.restore();
}

function defaultCreateCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

const PLACEHOLDER = 'placeholder';
const keyOf = (state, number) => {
  if (state === 'revealed') return validNumber(number) ? `revealed-${number}` : PLACEHOLDER;
  return TILE_STATES.includes(state) ? state : PLACEHOLDER;
};

/**
 * The cache's key for one image: the outline orientation, then the state (a revealed one with its
 * number, an unknown one the placeholder) and, for a raised state at a depth step short of 1, the
 * step — 'up:revealed-3', 'down:flagged@0.5', 'none:closed' for the square.
 */
export function tileKey(orientation, state, number, step = 1) {
  const base = keyOf(state, number);
  return `${orientation}:${step === 1 || !DEPTH_STATES.includes(base) ? base : `${base}@${step}`}`;
}

// A skin for one renderer: draws tiles from a cache of pre-rendered images — every state, and the
// raised states at each depth step, for each outline orientation drawn — keyed by tile size,
// device pixel ratio and theme, from the board module the hand-off `art` holds. Until one is
// handed over it draws and caches nothing. On a hand-off it drops the cache and calls `redraw`,
// which the renderer supplies; board() is the module it draws from, or null.
export function createTileSkin({
  art = BOARD_ART,
  createCanvas = defaultCreateCanvas,
  redraw = () => {},
} = {}) {
  let current = art.current();
  let key = null;
  let images = null; // tileKey → image, for the orientations drawn under `key`
  let built = null; // the orientations `images` holds

  // Every image of one outline orientation, `shape` (null for the square of `size`) at `size`.
  function build(board, size, ratio, shape, orientation) {
    const width = shape?.width ?? size;
    const height = shape?.height ?? size;
    const cell = shape && { outline: { shape: shape.shape, orientation, x: 0, y: 0, width, height, points: shape.points }, glyphBox: shape.glyph };
    const render = (state, number, depth = 1) => {
      const canvas = createCanvas(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)));
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintTileWith(board, ctx, 0, 0, size, state, number, depth, cell);
      return canvas;
    };
    for (const state of TILE_STATES) {
      if (state === 'revealed') for (let n = 0; n <= 8; n++) images.set(tileKey(orientation, state, n), render(state, n));
      else images.set(tileKey(orientation, state, 0), render(state, 0));
    }
    for (const state of DEPTH_STATES) for (const step of DEPTH_STEPS) if (step !== 1) images.set(tileKey(orientation, state, 0, step), render(state, 0, step));
    images.set(tileKey(orientation, PLACEHOLDER, 0), render(PLACEHOLDER, 0));
    built.add(orientation);
  }

  function invalidate() {
    key = null;
    images = null;
    built = null;
  }

  const unsubscribe = art.onChange((next) => {
    current = next;
    invalidate();
    redraw();
  });

  // Copies the pre-rendered tile to ctx at x, y, size CSS pixels — a closed, pressed or flagged one
  // at the depth step nearest `depth` when one is given; `cell` ({ outline, glyphBox } from the
  // board's geometry, none for the square) gives its outline, x, y being its box's corner. Rebuilds
  // the cache first when size, pixel ratio or theme changed, and renders an orientation's images the
  // first time a tile of it is drawn.
  function drawTile(ctx, x, y, size, state, number, pixelRatio = 1, depth = null, cell = null) {
    if (!current) return;
    const want = `${size}|${pixelRatio}|${current.id}`;
    if (want !== key) {
      images = new Map();
      built = new Set();
      key = want;
    }
    const shape = tileShape(cell);
    const orientation = shape?.orientation ?? 'none';
    if (!built.has(orientation)) build(current.board, size, pixelRatio, shape, orientation);
    const step = DEPTH_STATES.includes(state) ? depthStep(depth) : 1;
    ctx.drawImage(images.get(tileKey(orientation, state, number, step)), x, y, shape?.width ?? size, shape?.height ?? size);
  }

  return {
    paintTile: (ctx, x, y, size, state, number) => paintTileWith(current?.board ?? null, ctx, x, y, size, state, number),
    drawTile,
    board: () => current?.board ?? null,
    invalidate,
    cacheKey: () => key,
    dispose() {
      unsubscribe();
      invalidate();
    },
  };
}
