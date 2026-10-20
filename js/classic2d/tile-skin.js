// Square tile skin for the Classic 2D Canvas board: the stateless tile
// painter, the tile cache that pre-renders every state and number, the board
// art hand-off it draws from, and the shared minimum tile size. Every tile is
// drawn through the shared tile recipe (js/tile-art.js) in the active theme's
// Classic 2D drawing style, palette and number font, all from the theme's board
// module (js/themes/board-module.js), which the shell hands over through
// BOARD_ART once the number font has loaded (js/shell/board-art.js). The skin
// holds no palette, imports no theme and reads no stylesheet. The renderer owns
// layout and hit-testing; the skin owns appearance only.

import { FALLBACK_COLOR } from '../tokens.js';
import { drawFace, drawNumberGlyph, drawMineGlyph, drawFlagGlyph, drawCross } from '../tile-art.js';

// The smallest tile size the Classic 2D renderer allows, shared with it: the
// readable floor a board shrinks to before it scrolls. With it an Expert board
// (30 × 16) fits, inside the framed panel with 16px margins, every window
// 1024px wide whose height leaves room for 16 rows at it (tests/tile-skin.test.mjs
// measures the window). Every state and number stays legible at it in every
// theme (the same test).
export const MIN_TILE_SIZE = 26;

// The rules engine's cell states (js/engine/rules.js CELL) plus `pressed`,
// the renderer's feedback under a held click or chord.
export const TILE_STATES = Object.freeze(['closed', 'pressed', 'revealed', 'flagged', 'mine', 'exploded', 'wrong-flag']);

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
function placeholder(ctx, x, y, size) {
  ctx.fillStyle = FALLBACK_COLOR;
  ctx.fillRect(x, y, size, size);
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

// One device pixel in the context's CSS pixels, from the scale it draws at, so
// the recipe's bands snap to whole device pixels.
function devicePixel(ctx) {
  const scale = Math.abs(ctx.getTransform?.()?.a ?? 1);
  return scale > 0 ? 1 / scale : 1;
}

// Paints one tile of `state` (and `number` when revealed) at x, y, size CSS pixels from `board`, a
// theme's board module: its Classic 2D style and parameters, its 2D faces, flag, mine and cross,
// and its numbers in its number font.
export function paintTileWith(board, ctx, x, y, size, state, number) {
  if (!board || !TILE_STATES.includes(state) || (state === 'revealed' && !validNumber(number))) {
    placeholder(ctx, x, y, size);
    return;
  }
  const { style2d: style, palette } = board;
  const faces = palette.faces2d;
  const px = devicePixel(ctx);
  const face = (name, colours) => drawFace(ctx, size, name, { style: style.name, params: style.params, palette: colours, px });
  ctx.save();
  ctx.translate(x, y);
  switch (state) {
    case 'closed':
      face('closed', faces.closed);
      break;
    case 'pressed':
      face('sunk', faces.sunk);
      break;
    case 'revealed':
      face('revealed', faces.revealed);
      if (number > 0) drawNumberGlyph(ctx, size, number, { color: board.numbers[number], shadow: palette.numberShadow, font: board.font });
      break;
    case 'flagged':
      face('closed', faces.closed);
      drawFlagGlyph(ctx, size, palette.flag);
      break;
    case 'mine':
      face('revealed', faces.revealed);
      drawMineGlyph(ctx, size, palette.mine);
      break;
    case 'exploded':
      face('revealed', faces.exploded);
      drawMineGlyph(ctx, size, palette.mine);
      break;
    case 'wrong-flag':
      face('revealed', faces.revealed);
      drawFlagGlyph(ctx, size, palette.flag);
      drawCross(ctx, size, palette.cross);
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

// A skin for one renderer: draws tiles from a cache of pre-rendered images
// keyed by tile size, device pixel ratio and theme, from the board module the
// hand-off `art` holds. Until one is handed over it draws and caches nothing.
// On a hand-off it drops the cache and calls `redraw`, which the renderer
// supplies; board() is the module it draws from, or null.
export function createTileSkin({
  art = BOARD_ART,
  createCanvas = defaultCreateCanvas,
  redraw = () => {},
} = {}) {
  let current = art.current();
  let key = null;
  let images = null;

  function build(board, size, ratio) {
    const px = Math.max(1, Math.round(size * ratio));
    const render = (state, number) => {
      const canvas = createCanvas(px, px);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintTileWith(board, ctx, 0, 0, size, state, number);
      return canvas;
    };
    const out = new Map();
    for (const state of TILE_STATES) {
      if (state === 'revealed') for (let n = 0; n <= 8; n++) out.set(`revealed-${n}`, render(state, n));
      else out.set(state, render(state, 0));
    }
    out.set(PLACEHOLDER, render(PLACEHOLDER, 0));
    return out;
  }

  function invalidate() {
    key = null;
    images = null;
  }

  const unsubscribe = art.onChange((next) => {
    current = next;
    invalidate();
    redraw();
  });

  // Copies the pre-rendered tile to ctx at x, y, size CSS pixels; rebuilds
  // the cache first when size, pixel ratio or theme changed.
  function drawTile(ctx, x, y, size, state, number, pixelRatio = 1) {
    if (!current) return;
    const want = `${size}|${pixelRatio}|${current.id}`;
    if (want !== key) {
      images = build(current.board, size, pixelRatio);
      key = want;
    }
    ctx.drawImage(images.get(keyOf(state, number)), x, y, size, size);
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
