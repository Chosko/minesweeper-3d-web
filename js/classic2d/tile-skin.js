// Square tile skin for the Classic 2D Canvas board: the stateless tile
// painter, the tile cache that pre-renders every state and number, and the
// shared minimum tile size. Every tile is drawn from the cube-face recipe the
// 3D atlas draws from (js/tile-art.js), with the 3D number, flag and mine
// artwork, so both modes read as one game. Colours come from the tile and
// number tokens (css/tokens.css) through the token reader; this module holds
// no palette. The renderer owns layout and hit-testing; the skin owns
// appearance only.

import { token as readerToken, onThemeChange as readerOnThemeChange, FALLBACK_COLOR } from '../tokens.js';
import { themeApplier } from '../themes/applier.js';
import { drawFace, drawNumberGlyph, drawMineGlyph, drawFlagGlyph, drawCross } from '../tile-art.js';

// The smallest tile size the Classic 2D renderer allows, shared with it: the
// readable floor a board shrinks to before it scrolls. With it an Expert board
// (30 × 16) fits, inside the framed panel with 16px margins, every window
// 1024px wide whose height leaves room for 16 rows at it (tests/tile-skin.test.mjs
// measures the window). Every state and number stays legible at it in both
// themes (the same test).
export const MIN_TILE_SIZE = 26;

// The rules engine's cell states (js/engine/rules.js CELL) plus `pressed`,
// the renderer's feedback under a held click or chord.
export const TILE_STATES = Object.freeze(['closed', 'pressed', 'revealed', 'flagged', 'mine', 'exploded', 'wrong-flag']);

// The recipe's palettes, read from the tile and number tokens at paint time.
const color = (token, name) => token(`--color-${name}`);
const raised = (token, face) => ({
  rim: color(token, 'tile-rim'),
  bevelLight: color(token, 'tile-bevel-light'),
  bevelDark: color(token, 'tile-bevel-dark'),
  face: color(token, face),
  faceShade: color(token, 'tile-face-shade'),
  gloss: color(token, 'tile-gloss'),
  glossFade: color(token, 'tile-gloss-fade'),
});
const sunken = (token) => ({
  rim: color(token, 'tile-rim'),
  bevelLight: color(token, 'tile-bevel-light'),
  bevelDark: color(token, 'tile-bevel-dark'),
  face: color(token, 'tile-pressed'),
});
const revealed = (token, face) => ({
  rim: color(token, 'tile-revealed-rim'),
  edge: color(token, 'tile-revealed-edge'),
  face: color(token, face),
  faceShade: color(token, 'tile-revealed-shade'),
});
const exploded = (token) => ({
  rim: color(token, 'tile-revealed-rim'),
  edge: color(token, 'tile-exploded-edge'),
  face: color(token, 'tile-exploded'),
  faceShade: color(token, 'tile-exploded-shade'),
});
const mine = (token) => ({ body: color(token, 'tile-mine-glyph'), highlight: color(token, 'tile-mine-highlight') });
const flag = (token) => ({
  base: color(token, 'tile-mine-glyph'),
  shadow: color(token, 'tile-flag-shadow'),
  cloth: color(token, 'tile-flag'),
  clothShade: color(token, 'tile-flag-shade'),
});
const cross = (token) => ({ outline: color(token, 'tile-wrong-flag-outline'), mark: color(token, 'tile-wrong-flag-mark') });

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

// The recipe's drawing style for every tile: the bevelled cube face.
const STYLE = 'bevel';
const face = (ctx, size, name, palette, px) => drawFace(ctx, size, name, { style: STYLE, palette, px });

const validNumber = (n) => Number.isInteger(n) && n >= 0 && n <= 8;

// One device pixel in the context's CSS pixels, from the scale it draws at, so
// the recipe's bands snap to whole device pixels.
function devicePixel(ctx) {
  const scale = Math.abs(ctx.getTransform?.()?.a ?? 1);
  return scale > 0 ? 1 / scale : 1;
}

// Paints one tile with tokens from `token(name)`.
export function paintTileWith(token, ctx, x, y, size, state, number) {
  if (!TILE_STATES.includes(state) || (state === 'revealed' && !validNumber(number))) {
    placeholder(ctx, x, y, size);
    return;
  }
  const px = devicePixel(ctx);
  ctx.save();
  ctx.translate(x, y);
  switch (state) {
    case 'closed':
      face(ctx, size, 'closed', raised(token, 'tile-closed'), px);
      break;
    case 'pressed':
      face(ctx, size, 'sunk', sunken(token), px);
      break;
    case 'revealed':
      face(ctx, size, 'revealed', revealed(token, 'tile-revealed'), px);
      if (number > 0) drawNumberGlyph(ctx, size, number, { color: color(token, `number-${number}`), shadow: color(token, 'tile-number-shadow') });
      break;
    case 'flagged':
      face(ctx, size, 'closed', raised(token, 'tile-flagged'), px);
      drawFlagGlyph(ctx, size, flag(token));
      break;
    case 'mine':
      face(ctx, size, 'revealed', revealed(token, 'tile-mine'), px);
      drawMineGlyph(ctx, size, mine(token));
      break;
    case 'exploded':
      face(ctx, size, 'revealed', exploded(token), px);
      drawMineGlyph(ctx, size, mine(token));
      break;
    case 'wrong-flag':
      face(ctx, size, 'revealed', revealed(token, 'tile-wrong-flag'), px);
      drawFlagGlyph(ctx, size, flag(token));
      drawCross(ctx, size, cross(token));
      break;
    default:
      break;
  }
  ctx.restore();
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
  currentTheme = () => themeApplier().current(),
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
