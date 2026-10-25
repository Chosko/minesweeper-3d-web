// The tile recipe both boards draw from: the cube face of the 3D atlas
// (js/textures.js) and every Classic 2D tile (js/classic2d/tile-skin.js), so
// the two modes read as one game. A face is drawn through `drawFace` in one of
// the named drawing styles (`STYLES`) with its parameters, and the glyphs over
// it by their own functions, each in a `size` × `size` box at the context's
// origin (or the box of a hexagon or triangle outline, the glyphs in the glyph
// box its board's geometry gives, through `inGlyphBox`), at any size, with
// every colour passed in by the caller: both callers pass the active theme's
// board module's (js/themes/board-module.js) — the atlas its 3D style and
// palette, the 2D skin its Classic 2D ones. This module imports nothing, reads
// no token and touches no DOM.
//
// The bevel style's own parameters are the proportions of the 256 px atlas
// face. `px`, when given, is one device pixel in drawing units: every band then
// snaps to whole device pixels, never thinner than one, so the relief survives
// at small tiles. The atlas passes none and draws its proportions unsnapped.

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

// A hex colour `t` of the way from `a` to `b`: exactly `a` at 0, `b` at 1.
// Both must be `#rrggbb`, as for shade.
export function mix(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (shift) => {
    const x = (pa >> shift) & 255, y = (pb >> shift) & 255;
    return Math.max(0, Math.min(255, Math.round(x + (y - x) * t)));
  };
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

const snap = (v, px) => (px ? Math.max(px, Math.round(v / px) * px) : v);
const clamp01 = (v) => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1);

// The faces every style draws: closed (raised by the depth), sunk (the closed
// face pressed in) and revealed. The glyphs below draw over any of them.
export const FACES = Object.freeze(['closed', 'sunk', 'revealed']);

// The palette entries a face takes, the same names in every style:
//   closed and sunk — rim, bevelLight, bevelDark, face, and for closed
//                     faceShade, gloss and glossFade when present;
//   revealed        — rim, edge, face, faceShade.

// A face drawn inside a rounded tile when the style's radius (a fraction of
// the size) is above zero; the tile's corners are left unpainted.
function clipped(ctx, S, radius, draw) {
  if (!(radius > 0)) { draw(); return; }
  ctx.save();
  roundRect(ctx, 0, 0, S, S, S * radius);
  ctx.clip();
  draw();
  ctx.restore();
}

// ---- outlines: the shape a face is drawn in ----
// A face is drawn in an outline: the square of its size, the flat-top hexagon
// whose size is across its flats, or the triangle whose size is its side,
// pointing up or down. A hexagon or triangle measures its style's fractions
// against its height, which for the square and the hexagon is the size.
const SQRT3 = Math.sqrt(3);
export const OUTLINES = Object.freeze(['square', 'hexagon', 'triangle-up', 'triangle-down']);

const outlineOf = (outline) => (OUTLINES.includes(outline) ? outline : 'square');

// The outline's box at a tile `size`, from the context's origin.
export function outlineBox(outline, size) {
  switch (outlineOf(outline)) {
    case 'hexagon': return { width: (2 * size) / SQRT3, height: size };
    case 'triangle-up':
    case 'triangle-down': return { width: size, height: (size * SQRT3) / 2 };
    default: return { width: size, height: size };
  }
}

// The outline's corners in its box, clockwise on the page.
export function outlinePoints(outline, size) {
  const { width: w, height: h } = outlineBox(outline, size);
  switch (outlineOf(outline)) {
    case 'hexagon': {
      const s = w / 2;
      return [[s / 2, 0], [w - s / 2, 0], [w, h / 2], [w - s / 2, h], [s / 2, h], [0, h / 2]];
    }
    case 'triangle-up': return [[w / 2, 0], [w, h], [0, h]];
    case 'triangle-down': return [[0, 0], [w, 0], [w / 2, h]];
    default: return [[0, 0], [w, 0], [w, h], [0, h]];
  }
}

// Calls draw(S) with the context moved to a glyph box's square — its smaller
// side, centred in it — so any glyph below draws in that box.
export function inGlyphBox(ctx, box, draw) {
  const S = Math.min(box.width, box.height);
  ctx.save();
  ctx.translate(box.x + (box.width - S) / 2, box.y + (box.height - S) / 2);
  draw(S);
  ctx.restore();
}

const centroid = (points) => [
  points.reduce((a, p) => a + p[0], 0) / points.length,
  points.reduce((a, p) => a + p[1], 0) / points.length,
];

// Each edge of a convex polygon, corner i to corner i + 1: its direction and
// its outward normal, a component under a billionth taken as zero.
function edges(points) {
  const n = points.length;
  const [cx, cy] = centroid(points);
  return points.map(([x0, y0], i) => {
    const [x1, y1] = points[(i + 1) % n];
    const len = Math.hypot(x1 - x0, y1 - y0);
    let m = [(y1 - y0) / len, (x0 - x1) / len];
    if (m[0] * ((x0 + x1) / 2 - cx) + m[1] * ((y0 + y1) / 2 - cy) < 0) m = [-m[0], -m[1]];
    return { from: [x0, y0], u: [(x1 - x0) / len, (y1 - y0) / len], out: m.map((c) => (Math.abs(c) < 1e-9 ? 0 : c)) };
  });
}

// A convex polygon's corners moved `d` in from every edge.
function inset(points, d) {
  if (!(d > 0)) return points;
  const lines = edges(points).map(({ from, u, out }) => ({ p: [from[0] - out[0] * d, from[1] - out[1] * d], u }));
  return lines.map((b, i) => {
    const a = lines[(i + lines.length - 1) % lines.length];
    const t = ((b.p[0] - a.p[0]) * b.u[1] - (b.p[1] - a.p[1]) * b.u[0]) / (a.u[0] * b.u[1] - a.u[1] * b.u[0]);
    return [a.p[0] + a.u[0] * t, a.p[1] + a.u[1] * t];
  });
}

// The polygon's path, its corners rounded by `r` when above zero, each
// corner's arc no longer than half its shorter edge allows.
function polygonPath(ctx, points, r) {
  const n = points.length;
  ctx.beginPath();
  if (!(r > 0)) {
    points.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
    ctx.closePath();
    return;
  }
  const last = points[n - 1];
  ctx.moveTo((last[0] + points[0][0]) / 2, (last[1] + points[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const a = points[(i + n - 1) % n], b = points[i], c = points[(i + 1) % n];
    const ab = Math.hypot(a[0] - b[0], a[1] - b[1]), cb = Math.hypot(c[0] - b[0], c[1] - b[1]);
    const angle = Math.acos(((a[0] - b[0]) * (c[0] - b[0]) + (a[1] - b[1]) * (c[1] - b[1])) / (ab * cb));
    ctx.arcTo(b[0], b[1], c[0], c[1], Math.min(r, Math.tan(angle / 2) * (Math.min(ab, cb) / 2)));
  }
  ctx.closePath();
}

function fillPolygon(ctx, points, style, r = 0) {
  ctx.fillStyle = style;
  polygonPath(ctx, points, r);
  ctx.fill();
}

const topOf = (points) => Math.min(...points.map((p) => p[1]));
const bottomOf = (points) => Math.max(...points.map((p) => p[1]));

// The hexagon or triangle a face is drawn in: its box and corners. Null for
// the square, which every style draws on its own path.
function tileOf(outline, size) {
  const kind = outlineOf(outline);
  if (kind === 'square') return null;
  return { ...outlineBox(kind, size), points: outlinePoints(kind, size) };
}

// A face drawn in a hexagon or triangle: clipped to the outline, its corners
// rounded by the style's radius, a fraction of the height.
function outlined(ctx, tile, radius, draw) {
  ctx.save();
  polygonPath(ctx, tile.points, radius > 0 ? tile.height * radius : 0);
  ctx.clip();
  draw();
  ctx.restore();
}

// ---- bevel: a raised face inside a thin edge, framed by four sloped sides ----
// Parameters: `edge` and `slope` the edge's and each slope's width, and
// `revealedEdge` the revealed face's inset, as fractions of the size; `sides`
// the shade of each slope, from -1 (bevelDark) through 0 (the face) to 1
// (bevelLight) — a sunk face turns each one over, and a shade between the
// three mixes the face with bevelLight or bevelDark, which must then be
// `#rrggbb` — or a `#rrggbb` colour the closed face draws as it is and the
// sunk face turns over through its own face; `radius` the corner radius.
const BEVEL = Object.freeze({
  edge: 1 / 64,
  slope: 0.075,
  sides: Object.freeze({ top: 1, right: -1, bottom: -1, left: 1 }),
  revealedEdge: 3 / 64,
  radius: 0,
});

// The bands of a bevel tile of `size` at `depth`: the edge every face starts
// with, the slope inside it (none at depth 0), and the revealed face's inset.
function bevelBands(size, q, depth, px) {
  const rim = snap(size * q.edge, px);
  const w = size * q.slope * depth;
  const bevel = w > 0 ? snap(w, px) : 0;
  const edge = px ? Math.max(rim + px, snap(size * q.revealedEdge, px)) : size * q.revealedEdge;
  return { rim, bevel, edge };
}

// The bands of today's bevel tile of `size`, fully raised.
export function tileBands(size, px) {
  return bevelBands(size, BEVEL, 1, px);
}

const SIDES = ['top', 'right', 'bottom', 'left'];

function sideShade(p, s, sign) {
  if (typeof s === 'string') return sign > 0 ? s : mix(p.face, s, -1);
  s *= sign;
  if (s >= 1) return p.bevelLight;
  if (s <= -1) return p.bevelDark;
  if (s === 0) return p.face;
  return mix(p.face, s > 0 ? p.bevelLight : p.bevelDark, Math.abs(s));
}

// The edge, then the four slopes inside it. Neighbouring slopes of one shade
// are one polygon, so no seam shows between them; the run holding the top
// slope draws first, the rest follow clockwise.
function slopes(ctx, S, r, b, rim, shades) {
  ctx.fillStyle = rim;
  ctx.fillRect(0, 0, S, S);
  if (!(b > 0)) return;
  const outer = [[r, r], [S - r, r], [S - r, S - r], [r, S - r]];
  const inner = [[r + b, r + b], [S - r - b, r + b], [S - r - b, S - r - b], [r + b, S - r - b]];
  if (shades.every((c) => c === shades[0])) {
    ctx.fillStyle = shades[0];
    ctx.fillRect(r, r, S - 2 * r, S - 2 * r);
    return;
  }
  slopeRuns(ctx, outer, inner, shades);
}

// The slopes between an outer and an inner polygon, side i running corner i
// to corner i + 1 in shades[i], a run of neighbouring sides of one shade one
// polygon; the run holding the first side draws first, the rest follow it.
function slopeRuns(ctx, outer, inner, shades) {
  const n = shades.length;
  let from = 0;
  while (shades[(from + n - 1) % n] === shades[from]) from = (from + n - 1) % n;
  const runs = [];
  for (let i = 0; i < n;) {
    const first = (from + i) % n;
    let k = 1;
    while (i + k < n && shades[(from + i + k) % n] === shades[first]) k++;
    runs.push([first, k]);
    i += k;
  }
  for (const [first, k] of runs) {
    // corners q0…qk along the run; the slope of side i runs corner i to corner i + 1
    const q = Array.from({ length: k + 1 }, (_, j) => (first + j) % n);
    ctx.fillStyle = shades[first];
    ctx.beginPath();
    ctx.moveTo(...outer[q[1]]);
    for (let j = 2; j <= k; j++) ctx.lineTo(...outer[q[j]]);
    for (let j = k; j >= 0; j--) ctx.lineTo(...inner[q[j]]);
    ctx.lineTo(...outer[q[0]]);
    ctx.closePath();
    ctx.fill();
  }
}

const bevelShades = (q, p, sign) => SIDES.map((side) => sideShade(p, q.sides[side], sign));

// The shade of each edge of a hexagon or triangle, by the way it faces: its
// outward normal's share of across (left or right) and of up or down weighs
// the two sides' shades, so an edge facing straight up is the top side's. An
// edge between a shade and a colour takes the one it faces more.
function edgeShades(q, p, points, sign) {
  return edges(points).map(({ out: [nx, ny] }) => {
    const across = nx > 0 ? q.sides.right : q.sides.left, wa = Math.abs(nx);
    const upDown = ny > 0 ? q.sides.bottom : q.sides.top, wu = Math.abs(ny);
    if (!wa) return sideShade(p, upDown, sign);
    if (!wu) return sideShade(p, across, sign);
    if (typeof across === 'string' || typeof upDown === 'string') return sideShade(p, wa > wu ? across : upDown, sign);
    return sideShade(p, (across * wa + upDown * wu) / (wa + wu), sign);
  });
}

// A bevel's closed or sunk face in a hexagon or triangle: the edge, the slope
// along every side inside it, and the face; `sign` 1 raised, -1 sunk.
function bevelRaisedIn(ctx, tile, q, p, depth, px, sign) {
  outlined(ctx, tile, q.radius, () => {
    const H = tile.height;
    const { rim: r, bevel: b } = bevelBands(H, q, depth, px);
    const outer = inset(tile.points, r);
    const inner = inset(tile.points, r + b);
    ctx.fillStyle = p.rim;
    ctx.fillRect(0, 0, tile.width, H);
    if (b > 0) {
      const shades = edgeShades(q, p, tile.points, sign);
      if (shades.every((c) => c === shades[0])) fillPolygon(ctx, outer, shades[0]);
      else slopeRuns(ctx, outer, inner, shades);
    }
    if (sign < 0) {
      fillPolygon(ctx, inner, p.face);
      return;
    }
    const g = ctx.createLinearGradient(0, topOf(inner), 0, bottomOf(inner));
    g.addColorStop(0, p.face);
    g.addColorStop(1, p.faceShade ?? p.face);
    fillPolygon(ctx, inner, g);
    if (p.gloss === undefined) return;
    const shine = inset(inner, H * (3 / 128));
    const from = topOf(shine);
    const gl = ctx.createLinearGradient(0, from, 0, H * 0.55);
    gl.addColorStop(0, p.gloss);
    gl.addColorStop(1, p.glossFade);
    ctx.save();
    polygonPath(ctx, shine, 0);
    ctx.clip();
    ctx.fillStyle = gl;
    ctx.fillRect(0, from, tile.width, Math.min(H * 0.32, H - from));
    ctx.restore();
  });
}

// A bevel's revealed face in a hexagon or triangle: flat inside its edge.
function bevelRevealedIn(ctx, tile, q, p, depth, px) {
  outlined(ctx, tile, q.radius, () => {
    const { rim: r, edge: e } = bevelBands(tile.height, q, 1, px);
    ctx.fillStyle = p.rim;
    ctx.fillRect(0, 0, tile.width, tile.height);
    fillPolygon(ctx, inset(tile.points, r), p.edge);
    const g = ctx.createLinearGradient(0, 0, tile.width, tile.height);
    g.addColorStop(0, p.face);
    g.addColorStop(1, p.faceShade ?? p.face);
    fillPolygon(ctx, inset(tile.points, e), g);
  });
}

function bevelClosed(ctx, S, q, p, depth, px, tile) {
  if (tile) { bevelRaisedIn(ctx, tile, q, p, depth, px, 1); return; }
  clipped(ctx, S, q.radius, () => {
    const { rim: r, bevel: b } = bevelBands(S, q, depth, px);
    slopes(ctx, S, r, b, p.rim, bevelShades(q, p, 1));
    const g = ctx.createLinearGradient(0, r + b, 0, S - r - b);
    g.addColorStop(0, p.face);
    g.addColorStop(1, p.faceShade ?? p.face);
    ctx.fillStyle = g;
    ctx.fillRect(r + b, r + b, S - 2 * r - 2 * b, S - 2 * r - 2 * b);
    if (p.gloss === undefined) return;
    const o = S * (3 / 128);
    const gl = ctx.createLinearGradient(0, r + b, 0, S * 0.55);
    gl.addColorStop(0, p.gloss);
    gl.addColorStop(1, p.glossFade);
    ctx.fillStyle = gl;
    roundRect(ctx, r + b + o, r + b + o, S - 2 * r - 2 * b - 2 * o, S * 0.32, S * (7 / 128));
    ctx.fill();
  });
}

function bevelSunk(ctx, S, q, p, depth, px, tile) {
  if (tile) { bevelRaisedIn(ctx, tile, q, p, depth, px, -1); return; }
  clipped(ctx, S, q.radius, () => {
    const { rim: r, bevel: b } = bevelBands(S, q, depth, px);
    slopes(ctx, S, r, b, p.rim, bevelShades(q, p, -1));
    ctx.fillStyle = p.face;
    ctx.fillRect(r + b, r + b, S - 2 * r - 2 * b, S - 2 * r - 2 * b);
  });
}

function bevelRevealed(ctx, S, q, p, depth, px, tile) {
  if (tile) { bevelRevealedIn(ctx, tile, q, p, depth, px); return; }
  clipped(ctx, S, q.radius, () => {
    const { rim: r, edge: e } = bevelBands(S, q, 1, px);
    ctx.fillStyle = p.rim;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.edge;
    ctx.fillRect(r, r, S - 2 * r, S - 2 * r);
    const g = ctx.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, p.face);
    g.addColorStop(1, p.faceShade ?? p.face);
    ctx.fillStyle = g;
    ctx.fillRect(e, e, S - 2 * e, S - 2 * e);
  });
}

// ---- flat: a face with a light top band and a dark bottom edge; revealed flush ----
// Parameters: as fractions of the size (a hexagon's or triangle's height),
// `band` the light top band, `edge` the
// dark bottom edge, `press` the sunk face's inset shade along its top and
// `radius` the corner radius; in drawing units (CSS pixels on a Classic 2D
// tile), so constant at every size, `hairline` the revealed face's border and
// `border` the exploded tile's (see explodedParams). Depth changes nothing it
// draws; a sunk face is flat, its shade in bevelDark.
const FLAT = Object.freeze({ band: 0.1, edge: 0.1, press: 0.08, hairline: 1, border: 2, radius: 0.15 });

function flatClosed(ctx, S, q, p, depth, px, tile) {
  if (tile) {
    outlined(ctx, tile, q.radius, () => {
      const { width: W, height: H } = tile;
      const band = snap(H * q.band, px), edge = snap(H * q.edge, px);
      ctx.fillStyle = p.face;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = p.bevelLight;
      ctx.fillRect(0, 0, W, band);
      ctx.fillStyle = p.bevelDark;
      ctx.fillRect(0, H - edge, W, edge);
    });
    return;
  }
  clipped(ctx, S, q.radius, () => {
    const band = snap(S * q.band, px), edge = snap(S * q.edge, px);
    ctx.fillStyle = p.face;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.bevelLight;
    ctx.fillRect(0, 0, S, band);
    ctx.fillStyle = p.bevelDark;
    ctx.fillRect(0, S - edge, S, edge);
  });
}

function flatSunk(ctx, S, q, p, depth, px, tile) {
  if (tile) {
    outlined(ctx, tile, q.radius, () => {
      ctx.fillStyle = p.face;
      ctx.fillRect(0, 0, tile.width, tile.height);
      ctx.fillStyle = p.bevelDark;
      ctx.fillRect(0, 0, tile.width, snap(tile.height * q.press, px));
    });
    return;
  }
  clipped(ctx, S, q.radius, () => {
    const shade = snap(S * q.press, px);
    ctx.fillStyle = p.face;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.bevelDark;
    ctx.fillRect(0, 0, S, shade);
  });
}

function flatRevealed(ctx, S, q, p, depth, px, tile) {
  if (tile) {
    outlined(ctx, tile, q.radius, () => {
      const h = snap(q.hairline, px);
      ctx.fillStyle = p.rim;
      ctx.fillRect(0, 0, tile.width, tile.height);
      fillPolygon(ctx, inset(tile.points, h), p.face, Math.max(0, tile.height * q.radius - h));
    });
    return;
  }
  clipped(ctx, S, q.radius, () => {
    const h = snap(q.hairline, px);
    ctx.fillStyle = p.rim;
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = p.face;
    roundRect(ctx, h, h, S - 2 * h, S - 2 * h, Math.max(0, S * q.radius - h));
    ctx.fill();
  });
}

// The drawing styles, the first the one an unknown style name falls back to.
// Each draws every face from its parameters (its own `params` filling any the
// caller leaves out), the palette and a depth, in the square of its size or,
// given a tile (tileOf), in that hexagon or triangle.
export const STYLES = Object.freeze({
  bevel: Object.freeze({ params: BEVEL, closed: bevelClosed, sunk: bevelSunk, revealed: bevelRevealed }),
  flat: Object.freeze({ params: FLAT, closed: flatClosed, sunk: flatSunk, revealed: flatRevealed }),
});

const DEV = /^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(globalThis.location?.hostname ?? '');
const reported = new Set();

// Draws `face` (one of FACES) in an `outline` (one of OUTLINES, the square by
// default) of a tile `size`, its box (outlineBox) at the context's origin, in
// the drawing style named `style`, with its `params`, the face's `palette`
// entries and a `depth` from 0 (flat) to 1 (fully raised). `px`, when given, is
// one device pixel in drawing units: every band then snaps to whole device
// pixels, never thinner than one. An unknown style draws the first shipped
// style with its own parameters, and is reported once in development; an
// unknown outline draws the square.
export function drawFace(ctx, size, face, { style = 'bevel', params, palette, depth = 1, px, outline = 'square' } = {}) {
  let drawing = STYLES[style];
  let q;
  if (drawing) {
    q = { ...drawing.params, ...params };
    if (params?.sides) q.sides = { ...drawing.params.sides, ...params.sides };
  } else {
    if (DEV && !reported.has(style)) {
      reported.add(style);
      console.error(`[tile-art] unknown drawing style "${style}", drawing "${Object.keys(STYLES)[0]}"`);
    }
    drawing = Object.values(STYLES)[0];
    q = drawing.params;
  }
  drawing[face]?.(ctx, size, q, palette, clamp01(depth), px, tileOf(outline, size));
}

// The parameters a style draws the exploded tile's revealed face with: its
// `border`, when it has one, as the hairline; a style without one draws the
// exploded face as its revealed face.
export function explodedParams(params) {
  return params?.border === undefined ? params : { ...params, hairline: params.border };
}

// Today's cube face, the bevel at full depth: the closed face, the face sunk
// in under a held press, and the revealed face.
export function drawRaisedFace(ctx, S, p, px) { drawFace(ctx, S, 'closed', { palette: p, px }); }
export function drawSunkenFace(ctx, S, p, px) { drawFace(ctx, S, 'sunk', { palette: p, px }); }
export function drawRevealedFace(ctx, S, p, px) { drawFace(ctx, S, 'revealed', { palette: p, px }); }

// Number n in its colour at the heavy weight, under a darker outline of its own
// hue and over a soft drop shadow, its glyph box centred on the tile; a number
// of two digits is set at the same height and narrowed to fit. `font`, when given, is the face to set it
// in, NUMBER_FONT standing behind it.
// p: { color, shadow, font? { family, weight } }
export function drawNumberGlyph(ctx, S, n, p) {
  const txt = String(n);
  const size = S * 0.68;
  ctx.font = p.font ? `${p.font.weight} ${size}px "${p.font.family}", ${NUMBER_FONT}` : `800 ${size}px ${NUMBER_FONT}`;
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

// The mine: a round body and eight spikes, each ending in a round knob, three
// quarters of the tile from knob to knob, with a highlight up and left.
// p: { body, highlight }
export function drawMineGlyph(ctx, S, p) {
  const c = S / 2, r = S * 0.24, knob = S * 0.055, reach = S * 0.375 - knob;
  ctx.save();
  ctx.translate(c, c);
  ctx.strokeStyle = p.body;
  ctx.fillStyle = p.body;
  ctx.lineCap = 'butt';
  ctx.lineWidth = S * 0.05;
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4;
    const x = Math.cos(t) * reach, y = Math.sin(t) * reach;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(x, y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, knob, 0, Math.PI * 2); ctx.fill();
  }
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

// The wrong-flag cross: two butt-ended strokes corner to corner in the mark
// colour over a wider outline.
// p: { outline, mark }
export function drawCross(ctx, S, p) {
  const a = S * 0.22, b = S * 0.78;
  ctx.save();
  ctx.lineCap = 'butt';
  for (const [w, c] of [[S * 0.10, p.outline], [S * 0.057, p.mark]]) {
    ctx.lineWidth = w; ctx.strokeStyle = c;
    ctx.beginPath(); ctx.moveTo(a, a); ctx.lineTo(b, b); ctx.moveTo(b, a); ctx.lineTo(a, b); ctx.stroke();
  }
  ctx.restore();
}

// The marked start cell's ring: a dashed circle whose outer edge is 0.22 of
// the tile in from every side, `width` drawing units wide (two by default).
// p: { color, width? }
export function drawMarkRing(ctx, S, p) {
  const w = p.width ?? 2;
  ctx.save();
  ctx.strokeStyle = p.color;
  ctx.lineWidth = w;
  ctx.setLineDash([2 * w, 1.5 * w]);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, Math.max(0, S * (0.5 - 0.22) - w / 2), 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}
