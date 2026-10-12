// Procedurally drawn tile textures (canvas 2D) packed into a THREE.DataArrayTexture.
// Row 0 of every layer is the TOP of the drawn image, so a UV with v = 0 samples the top
// (matches the XNA convention used by the original Cube.cs UVs).
import * as THREE from 'three';
import { shade, drawRaisedFace, drawRevealedFace, drawNumberGlyph, drawMineGlyph, drawFlagGlyph, drawCross } from './tile-art.js';

export const TILE = 256;
export const L_CLOSED = 0;
export const L_FLAG = 1;
export const L_MINE = 2;
export const L_MINE_EXPLODED = 3;
export const L_NUM0 = 4; // number n (0..26) -> layer L_NUM0 + n

export const L_WRONG_FLAG = L_NUM0 + 27; // loss screen: flag placed on a non-mine (render-only)
export const LAYERS = L_NUM0 + 28;

// ---- colour helpers (sRGB) ----
function hexToRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function rgbToHex([r, g, b]) { return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1); }
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function luminance([r, g, b]) {
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export function contrastRatio(a, b) {
  const la = luminance(typeof a === 'string' ? hexToRgb(a) : a), lb = luminance(typeof b === 'string' ? hexToRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

// The atlas's own palette: the 3D tiles keep one look under both themes, so
// these are literals, never tokens. The drawing itself is the shared recipe in
// js/tile-art.js, which the Classic 2D skin draws its tiles from too.
const ATLAS = Object.freeze({
  rim: '#21407a',
  bevelLight: '#9cc4ff',
  bevelDark: '#2b5cb8',
  face: '#6fa3f7',
  faceShade: '#3f78e0',
  gloss: 'rgba(255,255,255,0.35)',
  glossFade: 'rgba(255,255,255,0)',
  revealedRim: '#8f9bb0',
  revealedEdge: '#c4cfdd',
  revealed: '#eef3fa',
  exploded: '#ff5a4f',
  explodedEdge: '#b3261e',
  numberShadow: 'rgba(0,0,0,0.12)',
  mine: '#1b1b1b',
  mineHighlight: 'rgba(255,255,255,0.85)',
  flag: '#ff3b30',
  flagShade: '#c4161c',
  flagShadow: 'rgba(0,0,0,0.25)',
  wrongFlagMark: '#d50000',
  wrongFlagOutline: 'rgba(255,255,255,0.95)',
});

// A revealed face shades 6% darker toward its bottom-right corner; its darkest point is the
// numbers' contrast reference.
const FACE_SHADE = -0.06;
export const REVEALED_DARK = shade(ATLAS.revealed, FACE_SHADE);
const MIN_CONTRAST = 5.0; // >= 4.5:1 with headroom for face shading / mip blur

// Classic palette for 1..8 (kept recognisable), then distinct hues for 9..26. Every colour is darkened
// (keeping its hue) until it reaches MIN_CONTRAST against the darkest part of the tile background.
const CLASSIC = ['#1565c0', '#2e7d32', '#d32f2f', '#1a237e', '#8d1c1c', '#00838f', '#212121', '#6d6d6d'];
const NUM_COLORS = [];
for (let n = 1; n <= 26; n++) {
  let rgb;
  if (n <= 8) rgb = hexToRgb(CLASSIC[n - 1]);
  else {
    const t = n - 9; // 0..17
    const hue = (t * 137.508 + 285) % 360; // golden-angle spread
    rgb = hslToRgb(hue, 72 + (t % 2) * 14, 34 + (t % 3) * 5);
  }
  for (let it = 0; it < 60 && contrastRatio(rgb, REVEALED_DARK) < MIN_CONTRAST; it++) rgb = rgb.map((v) => v * 0.95);
  NUM_COLORS[n] = rgbToHex(rgb);
}
export function numberColor(n) { return NUM_COLORS[n] || '#212121'; }

const RAISED = { rim: ATLAS.rim, bevelLight: ATLAS.bevelLight, bevelDark: ATLAS.bevelDark, face: ATLAS.face, faceShade: ATLAS.faceShade, gloss: ATLAS.gloss, glossFade: ATLAS.glossFade };
const REVEALED = { rim: ATLAS.revealedRim, edge: ATLAS.revealedEdge, face: ATLAS.revealed, faceShade: REVEALED_DARK };
const EXPLODED = { rim: ATLAS.revealedRim, edge: ATLAS.explodedEdge, face: ATLAS.exploded, faceShade: shade(ATLAS.exploded, FACE_SHADE) };
const MINE = { body: ATLAS.mine, highlight: ATLAS.mineHighlight };
const FLAG = { base: ATLAS.mine, shadow: ATLAS.flagShadow, cloth: ATLAS.flag, clothShade: ATLAS.flagShade };
const CROSS = { outline: ATLAS.wrongFlagOutline, mark: ATLAS.wrongFlagMark };

/** Draws one layer onto a 2D context of size TILE x TILE. */
export function drawLayer(ctx, layer) {
  ctx.clearRect(0, 0, TILE, TILE);
  if (layer === L_CLOSED) drawRaisedFace(ctx, TILE, RAISED);
  else if (layer === L_FLAG) { drawRaisedFace(ctx, TILE, RAISED); drawFlagGlyph(ctx, TILE, FLAG); }
  else if (layer === L_MINE) { drawRevealedFace(ctx, TILE, REVEALED); drawMineGlyph(ctx, TILE, MINE); }
  else if (layer === L_MINE_EXPLODED) { drawRevealedFace(ctx, TILE, EXPLODED); drawMineGlyph(ctx, TILE, MINE); }
  else if (layer === L_WRONG_FLAG) { drawRevealedFace(ctx, TILE, REVEALED); drawFlagGlyph(ctx, TILE, FLAG); drawCross(ctx, TILE, CROSS); }
  else {
    const n = layer - L_NUM0;
    drawRevealedFace(ctx, TILE, REVEALED);
    if (n > 0) drawNumberGlyph(ctx, TILE, n, { color: numberColor(n), shadow: ATLAS.numberShadow });
  }
}

export function createTileTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = TILE; canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const layerBytes = TILE * TILE * 4;
  const data = new Uint8Array(layerBytes * LAYERS);
  for (let l = 0; l < LAYERS; l++) {
    drawLayer(ctx, l);
    data.set(ctx.getImageData(0, 0, TILE, TILE).data, l * layerBytes);
  }
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
