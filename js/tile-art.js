// The tile recipe both boards draw from: the cube face of the 3D atlas
// (js/textures.js) and every Classic 2D tile (js/classic2d/tile-skin.js), so
// the two modes read as one game. Each function draws one part of a tile in a
// `size` × `size` box at the context's origin, at any size, with every colour
// passed in by the caller: the atlas brings its own unthemed palette, the 2D
// skin its tile and number tokens. This module imports nothing, reads no token
// and touches no DOM.
//
// The proportions are those of the 256 px atlas face. `px`, when given, is one
// device pixel in drawing units: the rim, bevel and edge bands then snap to
// whole device pixels, never thinner than one, so the relief survives at small
// tiles. The atlas passes none and draws its proportions unsnapped.

// The number glyph's typeface, at its heavy weight.
export const NUMBER_FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';
// How much darker than its colour a number's outline is (see shade).
export const NUMBER_OUTLINE = -0.45;

// A hex colour moved toward black (amt < 0) or white (amt > 0) by |amt|.
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + (amt < 0 ? c * amt : (255 - c) * amt))));
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const snap = (v, px) => (px ? Math.max(px, Math.round(v / px) * px) : v);

// The bands of a tile of `size`: the rim every face starts with, the raised
// and sunken faces' bevel inside it, and the revealed face's inset (rim plus
// its flat edge).
export function tileBands(size, px) {
  const rim = snap(size / 64, px);
  const bevel = snap(size * 0.075, px);
  const edge = px ? Math.max(rim + px, snap(size * (3 / 64), px)) : size * (3 / 64);
  return { rim, bevel, edge };
}

// The rim and the bevel: `topLeft` lights the top and left bands, `bottomRight`
// the bottom and right ones.
function bevelled(ctx, S, r, b, rim, topLeft, bottomRight) {
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = topLeft;
  ctx.beginPath(); ctx.moveTo(r, r); ctx.lineTo(S - r, r); ctx.lineTo(S - r - b, r + b); ctx.lineTo(r + b, r + b); ctx.lineTo(r + b, S - r - b); ctx.lineTo(r, S - r); ctx.closePath(); ctx.fill();
  ctx.fillStyle = bottomRight;
  ctx.beginPath(); ctx.moveTo(S - r, S - r); ctx.lineTo(r, S - r); ctx.lineTo(r + b, S - r - b); ctx.lineTo(S - r - b, S - r - b); ctx.lineTo(S - r - b, r + b); ctx.lineTo(S - r, r); ctx.closePath(); ctx.fill();
}

// The closed cube face: a dark rim, a bevel lit top-left and dark bottom-right,
// a face shaded top to bottom, and a gloss across its upper part.
// p: { rim, bevelLight, bevelDark, face, faceShade, gloss, glossFade }
export function drawRaisedFace(ctx, S, p, px) {
  const { rim: r, bevel: b } = tileBands(S, px);
  bevelled(ctx, S, r, b, p.rim, p.bevelLight, p.bevelDark);
  const g = ctx.createLinearGradient(0, r + b, 0, S - r - b);
  g.addColorStop(0, p.face);
  g.addColorStop(1, p.faceShade);
  ctx.fillStyle = g;
  ctx.fillRect(r + b, r + b, S - 2 * r - 2 * b, S - 2 * r - 2 * b);
  const o = S * (3 / 128);
  const gl = ctx.createLinearGradient(0, r + b, 0, S * 0.55);
  gl.addColorStop(0, p.gloss);
  gl.addColorStop(1, p.glossFade);
  ctx.fillStyle = gl;
  roundRect(ctx, r + b + o, r + b + o, S - 2 * r - 2 * b - 2 * o, S * 0.32, S * (7 / 128));
  ctx.fill();
}

// The cube face sunk in under a held press: the bevel inverted (dark top-left,
// lit bottom-right), a flat face and no gloss.
// p: { rim, bevelLight, bevelDark, face }
export function drawSunkenFace(ctx, S, p, px) {
  const { rim: r, bevel: b } = tileBands(S, px);
  bevelled(ctx, S, r, b, p.rim, p.bevelDark, p.bevelLight);
  ctx.fillStyle = p.face;
  ctx.fillRect(r + b, r + b, S - 2 * r - 2 * b, S - 2 * r - 2 * b);
}

// The revealed face: a rim, a flat edge, and a face shaded from its top-left
// corner to its bottom-right one.
// p: { rim, edge, face, faceShade }
export function drawRevealedFace(ctx, S, p, px) {
  const { rim: r, edge: e } = tileBands(S, px);
  ctx.fillStyle = p.rim;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = p.edge;
  ctx.fillRect(r, r, S - 2 * r, S - 2 * r);
  const g = ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, p.face);
  g.addColorStop(1, p.faceShade);
  ctx.fillStyle = g;
  ctx.fillRect(e, e, S - 2 * e, S - 2 * e);
}

// Number n in its colour at the heavy weight, under a darker outline of its own
// hue and over a soft drop shadow, its glyph box centred on the tile; numbers
// of two digits are narrowed to fit.
// p: { color, shadow }
export function drawNumberGlyph(ctx, S, n, p) {
  const txt = String(n);
  const size = txt.length === 1 ? S * 0.68 : S * 0.62;
  ctx.font = `800 ${size}px ${NUMBER_FONT}`;
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
  ctx.fillStyle = p.shadow;
  ctx.fillText(txt, S * (3 / 256), y + S / 64);
  // the outline thickens the glyph so it survives mip filtering at distance and small tiles
  ctx.lineJoin = 'round';
  ctx.lineWidth = S * (txt.length === 1 ? 0.03 : 0.036);
  ctx.strokeStyle = shade(p.color, NUMBER_OUTLINE);
  ctx.strokeText(txt, 0, y);
  ctx.fillStyle = p.color;
  ctx.fillText(txt, 0, y);
  ctx.restore();
}

// The mine: eight spikes round a round body, with a highlight up and left.
// p: { body, highlight }
export function drawMineGlyph(ctx, S, p) {
  const c = S / 2, r = S * 0.24;
  ctx.save();
  ctx.translate(c, c);
  ctx.strokeStyle = p.body;
  ctx.lineCap = 'round';
  ctx.lineWidth = S * 0.05;
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4;
    const len = a % 2 ? r * 1.38 : r * 1.55;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(t) * len, Math.sin(t) * len); ctx.stroke();
  }
  ctx.fillStyle = p.body;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = p.highlight;
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, r * 0.24, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// The flag: a stepped base, a pole and a cloth shaded from its tip, over the
// cloth's drop shadow.
// p: { base, shadow, cloth, clothShade }
export function drawFlagGlyph(ctx, S, p) {
  const d = S * (5 / 256);
  const rr = S * (3 / 128);
  ctx.save();
  ctx.fillStyle = p.base;
  roundRect(ctx, S * 0.28, S * 0.72, S * 0.44, S * 0.08, rr); ctx.fill();
  roundRect(ctx, S * 0.36, S * 0.66, S * 0.28, S * 0.08, rr); ctx.fill();
  ctx.fillRect(S * 0.49, S * 0.2, S * 0.045, S * 0.5);
  ctx.fillStyle = p.shadow;
  ctx.beginPath(); ctx.moveTo(S * 0.52, S * 0.2 + d); ctx.lineTo(S * 0.2 + d, S * 0.34 + d); ctx.lineTo(S * 0.52, S * 0.48 + d); ctx.closePath(); ctx.fill();
  const g = ctx.createLinearGradient(S * 0.2, 0, S * 0.52, 0);
  g.addColorStop(0, p.cloth);
  g.addColorStop(1, p.clothShade);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(S * 0.52, S * 0.19); ctx.lineTo(S * 0.18, S * 0.335); ctx.lineTo(S * 0.52, S * 0.48); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// The wrong-flag cross: two strokes corner to corner in the mark colour over a
// wider outline.
// p: { outline, mark }
export function drawCross(ctx, S, p) {
  const a = S * 0.22, b = S * 0.78;
  ctx.save();
  ctx.lineCap = 'round';
  for (const [w, c] of [[S * 0.13, p.outline], [S * 0.075, p.mark]]) {
    ctx.lineWidth = w; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.moveTo(a, a); ctx.lineTo(b, b); ctx.moveTo(b, a); ctx.lineTo(a, b); ctx.stroke();
  }
  ctx.restore();
}
