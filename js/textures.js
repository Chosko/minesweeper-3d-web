// Procedurally drawn tile textures (canvas 2D) packed into a THREE.DataArrayTexture.
// Row 0 of every layer is the TOP of the drawn image, so a UV with v = 0 samples the top
// (matches the XNA convention used by the original Cube.cs UVs).
import * as THREE from 'three';

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

// Revealed tile face colours; the darkest point of the face gradient is the contrast reference.
const REVEALED_BASE = '#eef3fa';
export const REVEALED_DARK = shade(REVEALED_BASE, -0.06);
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

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawClosed(ctx) {
  const S = TILE;
  // Dark rim (shows the cube edges)
  ctx.fillStyle = '#21407a';
  ctx.fillRect(0, 0, S, S);
  // Bevel: light top-left, dark bottom-right
  const b = S * 0.075;
  ctx.fillStyle = '#9cc4ff';
  ctx.beginPath(); ctx.moveTo(4, 4); ctx.lineTo(S - 4, 4); ctx.lineTo(S - 4 - b, 4 + b); ctx.lineTo(4 + b, 4 + b); ctx.lineTo(4 + b, S - 4 - b); ctx.lineTo(4, S - 4); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#2b5cb8';
  ctx.beginPath(); ctx.moveTo(S - 4, S - 4); ctx.lineTo(4, S - 4); ctx.lineTo(4 + b, S - 4 - b); ctx.lineTo(S - 4 - b, S - 4 - b); ctx.lineTo(S - 4 - b, 4 + b); ctx.lineTo(S - 4, 4); ctx.closePath(); ctx.fill();
  // Face gradient
  const g = ctx.createLinearGradient(0, 4 + b, 0, S - 4 - b);
  g.addColorStop(0, '#6fa3f7');
  g.addColorStop(1, '#3f78e0');
  ctx.fillStyle = g;
  ctx.fillRect(4 + b, 4 + b, S - 8 - 2 * b, S - 8 - 2 * b);
  // Gloss
  const gl = ctx.createLinearGradient(0, 4 + b, 0, S * 0.55);
  gl.addColorStop(0, 'rgba(255,255,255,0.35)');
  gl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gl;
  roundRect(ctx, 4 + b + 6, 4 + b + 6, S - 8 - 2 * b - 12, S * 0.32, 14);
  ctx.fill();
}

function drawRevealedBg(ctx, base = REVEALED_BASE, edge = '#c4cfdd') {
  const S = TILE;
  ctx.fillStyle = '#8f9bb0';
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = edge;
  ctx.fillRect(4, 4, S - 8, S - 8);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, base);
  g.addColorStop(1, shade(base, -0.06));
  ctx.fillStyle = g;
  ctx.fillRect(12, 12, S - 24, S - 24);
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

function drawNumber(ctx, n) {
  drawRevealedBg(ctx);
  if (n === 0) return;
  const S = TILE;
  const txt = String(n);
  const size = txt.length === 1 ? S * 0.68 : S * 0.62;
  ctx.font = `800 ${size}px "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif`;
  ctx.textAlign = 'center';
  // Measure against the alphabetic baseline (the glyph box metrics are relative to the current
  // baseline) and centre the actual glyph box vertically.
  ctx.textBaseline = 'alphabetic';
  const m = ctx.measureText(txt);
  let y;
  if (m.actualBoundingBoxAscent !== undefined) y = S / 2 + (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
  else { ctx.textBaseline = 'middle'; y = S / 2; }
  const maxW = S * 0.84;
  const sx = m.width > maxW ? maxW / m.width : 1;
  ctx.save();
  ctx.translate(S / 2, 0);
  ctx.scale(sx, 1);
  const col = numberColor(n);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillText(txt, 3, y + 4);
  // thin darker outline of the same hue: thickens the glyph so it survives mip filtering at distance
  ctx.lineJoin = 'round';
  ctx.lineWidth = S * (txt.length === 1 ? 0.03 : 0.036);
  ctx.strokeStyle = shade(col, -0.45);
  ctx.strokeText(txt, 0, y);
  ctx.fillStyle = col;
  ctx.fillText(txt, 0, y);
  ctx.restore();
}

function drawMineGlyph(ctx) {
  const S = TILE, c = S / 2, r = S * 0.24;
  ctx.save();
  ctx.translate(c, c);
  ctx.strokeStyle = '#1b1b1b';
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.05;
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4;
    const len = a % 2 ? r * 1.38 : r * 1.55;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * len, Math.sin(t) * len); ctx.stroke();
  }
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

function drawFlag(ctx) {
  drawClosed(ctx);
  drawFlagGlyph(ctx);
}

function drawFlagGlyph(ctx) {
  const S = TILE;
  ctx.save();
  // base
  ctx.fillStyle = '#1b1b1b';
  roundRect(ctx, S * 0.28, S * 0.72, S * 0.44, S * 0.08, 6); ctx.fill();
  roundRect(ctx, S * 0.36, S * 0.66, S * 0.28, S * 0.08, 6); ctx.fill();
  // pole
  ctx.fillRect(S * 0.49, S * 0.2, S * 0.045, S * 0.5);
  // cloth
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath(); ctx.moveTo(S * 0.52, S * 0.2 + 5); ctx.lineTo(S * 0.2 + 5, S * 0.34 + 5); ctx.lineTo(S * 0.52, S * 0.48 + 5); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(S * 0.2, 0, S * 0.52, 0);
  g.addColorStop(0, '#ff3b30');
  g.addColorStop(1, '#c4161c');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(S * 0.52, S * 0.19); ctx.lineTo(S * 0.18, S * 0.335); ctx.lineTo(S * 0.52, S * 0.48); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawWrongFlag(ctx) {
  drawRevealedBg(ctx);
  ctx.save();
  drawFlagGlyph(ctx);
  ctx.restore();
  const S = TILE, a = S * 0.22, b = S * 0.78;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [w, c] of [[S * 0.13, 'rgba(255,255,255,0.95)'], [S * 0.075, '#d50000']]) {
    ctx.lineWidth = w; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.moveTo(a, a); ctx.lineTo(b, b); ctx.moveTo(b, a); ctx.lineTo(a, b); ctx.stroke();
  }
  ctx.restore();
}

/** Draws one layer onto a 2D context of size TILE x TILE. */
export function drawLayer(ctx, layer) {
  ctx.clearRect(0, 0, TILE, TILE);
  if (layer === L_CLOSED) drawClosed(ctx);
  else if (layer === L_FLAG) drawFlag(ctx);
  else if (layer === L_MINE) { drawRevealedBg(ctx); drawMineGlyph(ctx); }
  else if (layer === L_MINE_EXPLODED) { drawRevealedBg(ctx, '#ff5a4f', '#b3261e'); drawMineGlyph(ctx); }
  else if (layer === L_WRONG_FLAG) drawWrongFlag(ctx);
  else drawNumber(ctx, layer - L_NUM0);
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
