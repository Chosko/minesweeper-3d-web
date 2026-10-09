// Square tile skin for the Classic 2D Canvas board: the stateless tile
// painter, the tile cache that pre-renders every state and number, and the
// shared minimum tile size. Colours come from the tile and number tokens
// (css/tokens.css) through the token reader; this module holds no palette.
// The renderer owns layout and hit-testing; the skin owns appearance only.

import { token as readerToken, onThemeChange as readerOnThemeChange, FALLBACK_COLOR } from '../tokens.js';

// The smallest tile size the Classic 2D renderer allows, shared with it: the
// tile an Expert board (30 × 16) gets in a 1366×768 and a 1280×800 window,
// below the overlay bar with 16px margins. Every state and number stays
// legible at it in both themes (tests/tile-skin.test.mjs).
export const MIN_TILE_SIZE = 41;

// The rules engine's cell states (js/engine/rules.js CELL) plus `pressed`,
// the renderer's feedback under a held click or chord.
export const TILE_STATES = Object.freeze(['closed', 'pressed', 'revealed', 'flagged', 'mine', 'exploded', 'wrong-flag']);

const color = (token, name) => token(`--color-${name}`);

function fill(ctx, x, y, size, style) {
  ctx.fillStyle = style;
  ctx.fillRect(x, y, size, size);
}

// The simple edge of a closed tile: a solid border inside the tile.
function edge(token, ctx, x, y, size) {
  const w = Math.max(2, Math.round(size / 12));
  ctx.fillStyle = color(token, 'tile-edge');
  ctx.fillRect(x, y, size, w);
  ctx.fillRect(x, y + size - w, size, w);
  ctx.fillRect(x, y + w, w, size - 2 * w);
  ctx.fillRect(x + size - w, y + w, w, size - 2 * w);
}

function flag(token, ctx, x, y, size) {
  const pole = Math.max(1, Math.round(size / 16));
  const px = x + size * 0.58;
  ctx.fillStyle = color(token, 'tile-mine-glyph');
  ctx.fillRect(Math.round(px), Math.round(y + size * 0.18), pole, Math.round(size * 0.58));
  ctx.fillRect(Math.round(x + size * 0.3), Math.round(y + size * 0.74), Math.round(size * 0.4), pole);
  ctx.fillStyle = color(token, 'tile-flag');
  ctx.beginPath();
  ctx.moveTo(px, y + size * 0.18);
  ctx.lineTo(px, y + size * 0.56);
  ctx.lineTo(x + size * 0.2, y + size * 0.37);
  ctx.closePath();
  ctx.fill();
}

function mine(token, ctx, x, y, size) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const r = size * 0.24;
  ctx.fillStyle = color(token, 'tile-mine-glyph');
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color(token, 'tile-mine-glyph');
  ctx.lineWidth = Math.max(1, size / 16);
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 4;
    const dx = Math.cos(a) * r * 1.45;
    const dy = Math.sin(a) * r * 1.45;
    ctx.moveTo(cx - dx, cy - dy);
    ctx.lineTo(cx + dx, cy + dy);
  }
  ctx.stroke();
}

function cross(ctx, x, y, size, style, width) {
  const m = size * 0.2;
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x + m, y + m);
  ctx.lineTo(x + size - m, y + size - m);
  ctx.moveTo(x + size - m, y + m);
  ctx.lineTo(x + m, y + size - m);
  ctx.stroke();
}

function digit(token, ctx, x, y, size, n) {
  ctx.fillStyle = color(token, `number-${n}`);
  ctx.font = `bold ${Math.round(size * 0.72)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(n), x + size / 2, y + size * 0.54);
}

// Visibly wrong on purpose, so an unhandled state is noticed on the board.
function placeholder(ctx, x, y, size) {
  fill(ctx, x, y, size, FALLBACK_COLOR);
  cross(ctx, x, y, size, 'black', Math.max(2, size / 8));
}

const validNumber = (n) => Number.isInteger(n) && n >= 0 && n <= 8;

// Paints one tile with tokens from `token(name)`.
export function paintTileWith(token, ctx, x, y, size, state, number) {
  switch (state) {
    case 'closed':
      fill(ctx, x, y, size, color(token, 'tile-closed'));
      edge(token, ctx, x, y, size);
      return;
    case 'pressed':
      fill(ctx, x, y, size, color(token, 'tile-pressed'));
      return;
    case 'revealed':
      if (!validNumber(number)) break;
      fill(ctx, x, y, size, color(token, 'tile-revealed'));
      if (number > 0) digit(token, ctx, x, y, size, number);
      return;
    case 'flagged':
      fill(ctx, x, y, size, color(token, 'tile-flagged'));
      edge(token, ctx, x, y, size);
      flag(token, ctx, x, y, size);
      return;
    case 'mine':
      fill(ctx, x, y, size, color(token, 'tile-mine'));
      mine(token, ctx, x, y, size);
      return;
    case 'exploded':
      fill(ctx, x, y, size, color(token, 'tile-exploded'));
      mine(token, ctx, x, y, size);
      return;
    case 'wrong-flag':
      fill(ctx, x, y, size, color(token, 'tile-wrong-flag'));
      mine(token, ctx, x, y, size);
      cross(ctx, x, y, size, color(token, 'tile-wrong-flag-mark'), Math.max(2, size / 10));
      return;
    default:
      break;
  }
  placeholder(ctx, x, y, size);
}

// Paints one tile of `state` (and `number` when revealed) at x, y, size
// CSS pixels, reading the tile tokens through the token reader.
export function paintTile(ctx, x, y, size, state, number) {
  paintTileWith(readerToken, ctx, x, y, size, state, number);
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
// keyed by tile size, device pixel ratio and theme. On a theme change it
// drops the cache and calls `redraw`, which the renderer supplies.
export function createTileSkin({
  token = readerToken,
  onThemeChange = readerOnThemeChange,
  currentTheme = () => globalThis.msTheme?.current?.() ?? 'light',
  createCanvas = defaultCreateCanvas,
  redraw = () => {},
} = {}) {
  let theme = currentTheme();
  let key = null;
  let images = null;

  function build(size, ratio) {
    const px = Math.max(1, Math.round(size * ratio));
    const render = (state, number) => {
      const canvas = createCanvas(px, px);
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintTileWith(token, ctx, 0, 0, size, state, number);
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

  const unsubscribe = onThemeChange((next) => {
    theme = next;
    invalidate();
    redraw();
  });

  // Copies the pre-rendered tile to ctx at x, y, size CSS pixels; rebuilds
  // the cache first when size, pixel ratio or theme changed.
  function drawTile(ctx, x, y, size, state, number, pixelRatio = 1) {
    const want = `${size}|${pixelRatio}|${theme}`;
    if (want !== key) {
      images = build(size, pixelRatio);
      key = want;
    }
    ctx.drawImage(images.get(keyOf(state, number)), x, y, size, size);
  }

  return {
    paintTile: (ctx, x, y, size, state, number) => paintTileWith(token, ctx, x, y, size, state, number),
    drawTile,
    invalidate,
    cacheKey: () => key,
    dispose() {
      unsubscribe();
      invalidate();
    },
  };
}
