// The 3D tile atlas, drawn on a canvas 2D from the active theme's board module through the shared tile
// recipe (js/tile-art.js) in the module's 3D style, and packed into a THREE.DataArrayTexture, one layer
// per tile. It holds no colour of its own: every face, glyph and number colour, the number font and
// the style's parameters are the board module's (js/themes/board-module.js).
// Row 0 of every layer is the TOP of the drawn image, so a UV with v = 0 samples the top
// (matches the XNA convention used by the original Cube.cs UVs).
import * as THREE from 'three';
import { drawFace, drawNumberGlyph, drawMineGlyph, drawFlagGlyph, drawCross } from './tile-art.js';

export const TILE = 256;
export const L_CLOSED = 0;
export const L_FLAG = 1;
export const L_MINE = 2;
export const L_MINE_EXPLODED = 3;
export const L_NUM0 = 4; // number n (0..26) -> layer L_NUM0 + n

export const L_WRONG_FLAG = L_NUM0 + 27; // loss screen: flag placed on a non-mine (render-only)
export const L_SUNK = L_NUM0 + 28; // the closed face fully pressed in, which a depth motion blends towards
export const LAYERS = L_NUM0 + 29;

// A face of the board module's 3D style, from its 3D palette, unsnapped.
const face = (ctx, board, name, palette) => drawFace(ctx, TILE, name, { style: board.style3d.name, params: board.style3d.params, palette });

/** Draws one layer of `board`'s atlas onto a 2D context of size TILE x TILE. */
export function drawLayer(ctx, layer, board) {
  const faces = board.palette.faces3d;
  const { flag, mine, cross } = board.palette;
  ctx.clearRect(0, 0, TILE, TILE);
  if (layer === L_CLOSED) face(ctx, board, 'closed', faces.closed);
  else if (layer === L_SUNK) face(ctx, board, 'sunk', faces.sunk);
  else if (layer === L_FLAG) { face(ctx, board, 'closed', faces.closed); drawFlagGlyph(ctx, TILE, flag); }
  else if (layer === L_MINE) { face(ctx, board, 'revealed', faces.revealed); drawMineGlyph(ctx, TILE, mine); }
  else if (layer === L_MINE_EXPLODED) { face(ctx, board, 'revealed', faces.exploded); drawMineGlyph(ctx, TILE, mine); }
  else if (layer === L_WRONG_FLAG) { face(ctx, board, 'revealed', faces.revealed); drawFlagGlyph(ctx, TILE, flag); drawCross(ctx, TILE, cross); }
  else {
    const n = layer - L_NUM0;
    face(ctx, board, 'revealed', faces.revealed);
    if (n > 0) drawNumberGlyph(ctx, TILE, n, { color: board.numbers3d[n], shadow: board.palette.numberShadow, font: board.font });
  }
}

/** The atlas of `board` as a texture, every layer drawn (browser only). */
export function createTileTexture(board) {
  const canvas = document.createElement('canvas');
  canvas.width = TILE; canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const layerBytes = TILE * TILE * 4;
  const data = new Uint8Array(layerBytes * LAYERS);
  for (let l = 0; l < LAYERS; l++) {
    drawLayer(ctx, l, board);
    data.set(ctx.getImageData(0, 0, TILE, TILE).data, l * layerBytes);
  }
  return atlasTexture(data);
}

/** An atlas texture over `data`, LAYERS layers of TILE x TILE RGBA; all zero (transparent) when omitted. */
export function atlasTexture(data = new Uint8Array(TILE * TILE * 4 * LAYERS)) {
  const tex = new THREE.DataArrayTexture(data, TILE, TILE, LAYERS);
  tex.format = THREE.RGBAFormat;
  tex.type = THREE.UnsignedByteType;
  tex.colorSpace = THREE.NoColorSpace; // shader outputs raw sRGB values
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  tex.flipY = false;
  tex.unpackAlignment = 4;
  tex.needsUpdate = true;
  return tex;
}
