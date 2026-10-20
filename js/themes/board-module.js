// The theme board module: what a theme's `board.js` exports as `BOARD`, everything the Classic 2D
// tile skin and the 3D renderer draw the theme with, and the board conformance checks every
// registered theme passes (tests/theme-conformance.test.mjs). DOM-free; it reads no token.
//
// The shape (every colour `#rrggbb`; one marked "any CSS colour" may also be `#rrggbbaa`, `rgb()`
// or `rgba()`, and must be `#rrggbb` wherever a contrast check reads it):
//   palette
//     faces2d   recipe palettes (js/tile-art.js) for the Classic 2D style — closed, sunk (pressed),
//               revealed, exploded, and marked (the marked start cell's closed face)
//     faces3d   the same for the 3D style — closed, sunk, revealed, exploded
//               (closed, sunk and marked take rim, bevelLight, bevelDark, face; revealed and
//               exploded take rim, edge, face; any face may add faceShade, gloss and glossFade;
//               a face's colours are any CSS colour except where a bevel mixes them — see checkStyle)
//     flag      base (the pole and its stepped base), shadow (any CSS colour), cloth, clothShade
//     mine      body, highlight (any CSS colour)
//     cross     the wrong-flag cross: outline (any CSS colour), mark
//     numberShadow  the number glyph's shadow (any CSS colour)
//     boardGround   the Classic 2D board's ground between tiles
//     confetti  the win confetti's colours, in both modes
//   numbers2d   numbers2d[1..8] (index 0 unused): the Classic 2D number colours
//   numbers3d   numbers3d[1..26] (index 0 unused): the 3D number colours
//   font        the number font: { family, weight }, one of the theme's self-hosted faces
//   sky         { horizon, zenith, nadir, fog? } — the fog is the horizon when absent
//   style2d     { name, params } — a drawing style of js/tile-art.js `STYLES` with its parameters,
//               plus `gap` (between tiles) and `frameRadius` (the board frame's corner radius),
//               every length a fraction of the tile
//   style3d     { name, params } — the 3D cubes' style and its parameters
//               (a bevel side is a shade from -1 to 1 or a `#rrggbb` colour — js/tile-art.js)
//   cursor      the Classic 2D cursor ring: color, inner (its hairline, any CSS colour), width in
//               px, radius { tile, px } — the corner radius is tile × size + px
//   selection   the 3D aimed cube: outline, width { face, px } — max(face × the face, px) —, glow
//               (the line inside the outline), glowWidth in px, tint [r, g, b] multiplying the
//               selected face's colour
//   mark        the 3D marked start cell: tint, mix (its share of the face), pulseMix (at the
//               peak of its pulse)
//   end2d       the Classic 2D end effect's waves (js/classic2d/end-effect.js): light (the
//               `#rrggbb` colour a wave mixes a tile toward); win { scale (each tile's peak
//               scale), mix (its peak share of the light) }; loss { scale (a tile the loss changed
//               snaps in from, with an overshoot), flash (its share of the light as the wave
//               arrives, fading out) }; the confetti is the palette's
//   motion      one entry per cell event (CELL_EVENTS): a motion description, or null to leave
//               the event still
//
// A motion description is { duration, easing, tracks }:
//   duration    in ms, above zero
//   easing      a named curve (NAMED_EASINGS) or a cubic Bézier [x1, y1, x2, y2]
//   tracks      one or more { property, keyframes: [{ at, value }] }, `at` in ms from the start
//               (0 to the duration, ascending); before its first and after its last keyframe a
//               track holds that keyframe's value. The vocabulary (MOTION_PROPERTIES):
//     scale       uniform, 1 the cell's size
//     offset      { x, y, z? } in cell sizes; 2D uses x and y, 3D maps x and y to the camera's
//                 screen axes and z toward the camera
//     rotation    the angle in degrees about the track's `axis` [x, y, z]; with `flip: true` the
//                 cell shows its state before the event until the track's midpoint (halfway from
//                 its first to its last keyframe) and its state after from then on — a flip whose
//                 angle stays 0 is a cut from one face to the other at that point, and a flip of
//                 one keyframe cuts at it (one at the duration shows the state before throughout)
//     depth       the drawing style's depth, 0 flat to 1 fully raised; a keyframe past 1 is an
//                 overshoot, which the tile recipe draws fully raised
//     brightness  1 the drawn colour; above 1 a lift toward white by the excess, below 1 a
//                 multiplier on the drawn colour
//     opacity     0 to 1
//   A cell shows its state after the event once the animation ends.
import { STYLES } from '../tile-art.js';
import { MIN_TILE_SIZE } from '../classic2d/tile-skin.js';

export const CELL_EVENTS = Object.freeze(['press', 'release', 'reveal', 'flag', 'unflag', 'chordPress', 'solvedPulse']);
export const MOTION_PROPERTIES = Object.freeze(['scale', 'offset', 'rotation', 'depth', 'brightness', 'opacity']);
export const NAMED_EASINGS = Object.freeze(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out']);

const RAISED_ENTRIES = Object.freeze(['rim', 'bevelLight', 'bevelDark', 'face']);
const FLUSH_ENTRIES = Object.freeze(['rim', 'edge', 'face']);
// The entries each face's recipe palette takes.
export const FACE_ENTRIES = Object.freeze({
  closed: RAISED_ENTRIES,
  sunk: RAISED_ENTRIES,
  revealed: FLUSH_ENTRIES,
  exploded: FLUSH_ENTRIES,
  marked: RAISED_ENTRIES,
});
const FACES_2D = Object.freeze(['closed', 'sunk', 'revealed', 'exploded', 'marked']);
const FACES_3D = Object.freeze(['closed', 'sunk', 'revealed', 'exploded']);

// Every entry a board module carries, as paths from its root.
export const BOARD_ENTRIES = Object.freeze([
  ...FACES_2D.flatMap((f) => FACE_ENTRIES[f].map((k) => `palette.faces2d.${f}.${k}`)),
  ...FACES_3D.flatMap((f) => FACE_ENTRIES[f].map((k) => `palette.faces3d.${f}.${k}`)),
  'palette.flag.base', 'palette.flag.shadow', 'palette.flag.cloth', 'palette.flag.clothShade',
  'palette.mine.body', 'palette.mine.highlight',
  'palette.cross.outline', 'palette.cross.mark',
  'palette.numberShadow', 'palette.boardGround', 'palette.confetti',
  'cursor.color', 'cursor.inner', 'cursor.width', 'cursor.radius.tile', 'cursor.radius.px',
  'selection.outline', 'selection.width.face', 'selection.width.px', 'selection.glow', 'selection.glowWidth', 'selection.tint',
  'mark.tint', 'mark.mix', 'mark.pulseMix',
  'end2d.light', 'end2d.win.scale', 'end2d.win.mix', 'end2d.loss.scale', 'end2d.loss.flash',
]);

// The entries of the parameters of each style that set the closed face's relief, which the
// revealed face does not have: closed and revealed differ by more than colour while one is above
// zero, and stay legible while it is at least a pixel at the minimum tile size.
const RELIEF = Object.freeze({ bevel: ['slope'], flat: ['band', 'edge'] });
const PARAMS_2D = Object.freeze(['gap', 'frameRadius']);

const HEX = /^#[0-9a-f]{6}$/i;
const COLOUR = /^(#[0-9a-f]{6}|#[0-9a-f]{8}|rgba?\([^)]*\))$/i;
const isObject = (v) => v !== null && typeof v === 'object';
const isHex = (v) => typeof v === 'string' && HEX.test(v);
const isColour = (v) => typeof v === 'string' && COLOUR.test(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const at = (root, path) => path.split('.').reduce((v, k) => (isObject(v) ? v[k] : undefined), root);

// WCAG contrast of two `#rrggbb` colours.
function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c((n >> 16) & 255) + 0.7152 * c((n >> 8) & 255) + 0.0722 * c(n & 255);
}
export function contrast(a, b) {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const problem = (check, subject) => ({ check, subject });

function checkPalette(b) {
  const out = [];
  for (const path of BOARD_ENTRIES) {
    const v = at(b, path);
    const ok = path === 'palette.confetti' ? Array.isArray(v) && v.length > 0 && v.every(isColour)
      : path === 'selection.tint' ? Array.isArray(v) && v.length === 3 && v.every(isNumber)
        : /\.(width|px|tile|face|glowWidth|mix|pulseMix|scale|flash)$/.test(path) && !/^palette\./.test(path) ? isNumber(v)
          : path === 'mark.tint' || path === 'end2d.light' ? isHex(v)
            : isColour(v);
    if (!ok) out.push(problem('palette', path));
  }
  return out;
}

// Each mode's number list: its key, its last number, the faces its glyphs sit on and the points of
// the revealed face it is measured against — the 2D list its face and shade (the hairline round a
// flat 2D face holds no glyph), the 3D list every point, its border included.
const NUMBER_LISTS = Object.freeze([
  ['numbers2d', 8, 'faces2d', ['face', 'faceShade']],
  ['numbers3d', 26, 'faces3d', ['rim', 'edge', 'face', 'faceShade']],
]);

function checkNumbers(b) {
  const out = [];
  for (const [key, last] of NUMBER_LISTS) {
    for (let n = 1; n <= last; n++) if (!isHex(b[key]?.[n])) out.push(problem('numbers', `${key}[${n}]`));
  }
  return out;
}

function checkFont(b, fonts) {
  const { family, weight } = b.font ?? {};
  if (typeof family !== 'string' || !family || !isNumber(weight)) return [problem('font', 'font')];
  if (fonts && !fonts.some((f) => f.family === family && f.files.some((x) => x.weight === weight))) return [problem('font', 'font')];
  return [];
}

function checkSky(b) {
  const out = [];
  for (const k of ['horizon', 'zenith', 'nadir']) if (!isHex(b.sky?.[k])) out.push(problem('sky', `sky.${k}`));
  if (b.sky?.fog !== undefined && !isHex(b.sky.fog)) out.push(problem('sky', 'sky.fog'));
  return out;
}

// A shipped style with every one of its parameters (and, in 2D, the gap and the frame radius);
// a bevel side is a shade from -1 to 1 or a `#rrggbb` colour, and a bevel whose sides mix shades —
// or turn a colour over on the sunk face — needs `#rrggbb` faces to mix.
function checkStyle(b, key, faces, extra) {
  const s = b[key];
  if (!isObject(s) || !STYLES[s.name] || !isObject(s.params)) return [problem('style', key)];
  const out = [];
  const shipped = STYLES[s.name].params;
  for (const p of [...Object.keys(shipped), ...extra]) {
    const v = s.params[p];
    const side = (x) => (isNumber(x) && x >= -1 && x <= 1) || isHex(x);
    const ok = p === 'sides' ? isObject(v) && Object.keys(shipped.sides).every((k) => side(v[k])) : isNumber(v) && v >= 0;
    if (!ok) out.push(problem('style', `${key}.params.${p}`));
  }
  const sides = s.params.sides;
  if (isObject(sides) && Object.values(sides).some((v) => (isNumber(v) && v !== Math.trunc(v)) || isHex(v))) {
    const palettes = b.palette?.[faces] ?? {};
    for (const face of ['closed', 'sunk', 'marked']) {
      for (const k of ['face', 'bevelLight', 'bevelDark']) {
        const v = palettes[face]?.[k];
        if (v !== undefined && !isHex(v)) out.push(problem('style', `palette.${faces}.${face}.${k}`));
      }
    }
  }
  return out;
}

function checkRelief(b, key, minTileSize) {
  const s = b[key];
  if (!isObject(s) || !RELIEF[s.name] || !isObject(s.params)) return { relief: [], legible: [] };
  const widths = RELIEF[s.name].map((p) => s.params[p]).filter(isNumber);
  const widest = Math.max(0, ...widths);
  return {
    relief: widest > 0 ? [] : [problem('relief', key)],
    legible: widest > 0 && widest * minTileSize < 1 ? [problem('legible', key)] : [],
  };
}

// The points of a mode's revealed face a number list is measured against.
function revealedPoints(b, faces, keys) {
  const p = b.palette?.[faces]?.revealed ?? {};
  return keys.map((k) => p[k]).filter((v) => v !== undefined);
}

function checkContrast(b) {
  const out = [];
  // A colour the contrast cannot be measured on (not `#rrggbb`) fails it.
  const below = (ink, grounds, min) => !isHex(ink) || grounds.some((g) => !isHex(g) || contrast(ink, g) < min);
  for (const [key, last, faces, keys] of NUMBER_LISTS) {
    const revealed = revealedPoints(b, faces, keys);
    for (let n = 1; n <= last; n++) {
      const c = b[key]?.[n];
      if (c !== undefined && below(c, revealed, 4.5)) out.push(problem('contrast', `${key}[${n}]`));
    }
  }
  for (const [path, faces] of [['cursor.color', 'faces2d'], ['selection.outline', 'faces3d']]) {
    const ink = at(b, path);
    if (ink === undefined) continue;
    const grounds = [at(b, `palette.${faces}.closed.face`), at(b, `palette.${faces}.revealed.face`)].filter((g) => g !== undefined);
    if (below(ink, grounds, 3)) out.push(problem('contrast', path));
  }
  return out;
}

const DESCRIPTION_KEYS = new Set(['duration', 'easing', 'tracks']);
const TRACK_KEYS = new Set(['property', 'keyframes', 'axis', 'flip']);

function validValue(property, v) {
  if (property === 'offset') return isObject(v) && isNumber(v.x) && isNumber(v.y) && (v.z === undefined || isNumber(v.z)) && Object.keys(v).every((k) => 'xyz'.includes(k));
  if (property === 'opacity') return isNumber(v) && v >= 0 && v <= 1;
  if (property === 'scale' || property === 'depth' || property === 'brightness') return isNumber(v) && v >= 0;
  return isNumber(v);
}

function validTrack(t, duration) {
  if (!isObject(t) || !MOTION_PROPERTIES.includes(t.property) || !Object.keys(t).every((k) => TRACK_KEYS.has(k))) return false;
  if (t.property === 'rotation') {
    if (!Array.isArray(t.axis) || t.axis.length !== 3 || !t.axis.every(isNumber)) return false;
    if (t.flip !== undefined && typeof t.flip !== 'boolean') return false;
  } else if (t.axis !== undefined || t.flip !== undefined) return false;
  const k = t.keyframes;
  if (!Array.isArray(k) || k.length === 0) return false;
  let last = -Infinity;
  for (const f of k) {
    if (!isObject(f) || !isNumber(f.at) || f.at < 0 || f.at > duration || f.at < last || !validValue(t.property, f.value)) return false;
    if (!Object.keys(f).every((x) => x === 'at' || x === 'value')) return false;
    last = f.at;
  }
  return true;
}

function checkMotion(b) {
  if (!isObject(b.motion)) return [problem('motion', 'motion')];
  const out = [];
  for (const event of CELL_EVENTS) {
    const m = b.motion[event];
    const base = `motion.${event}`;
    if (m === null) continue;
    if (!isObject(m)) { out.push(problem('motion', base)); continue; }
    for (const k of Object.keys(m)) if (!DESCRIPTION_KEYS.has(k)) out.push(problem('motion', `${base}.${k}`));
    const durationOk = isNumber(m.duration) && m.duration > 0;
    if (!durationOk) out.push(problem('motion', `${base}.duration`));
    const e = m.easing;
    if (!(NAMED_EASINGS.includes(e) || (Array.isArray(e) && e.length === 4 && e.every(isNumber)))) out.push(problem('motion', `${base}.easing`));
    if (!Array.isArray(m.tracks) || m.tracks.length === 0) { out.push(problem('motion', `${base}.tracks`)); continue; }
    m.tracks.forEach((t, i) => { if (!validTrack(t, durationOk ? m.duration : Infinity)) out.push(problem('motion', `${base}.tracks[${i}]`)); });
  }
  for (const k of Object.keys(b.motion)) if (!CELL_EVENTS.includes(k)) out.push(problem('motion', `motion.${k}`));
  return out;
}

// The board conformance checks: the problems `board` has, each { check, subject }, none when it
// conforms. `fonts` is the theme's registry entry's fonts, which the number font must be one of;
// `minTileSize` the Classic 2D minimum tile size the relief must stay legible at.
export function checkBoardModule(board, { fonts, minTileSize = MIN_TILE_SIZE } = {}) {
  if (!isObject(board)) return [problem('module', 'BOARD')];
  const r2 = checkRelief(board, 'style2d', minTileSize);
  const r3 = checkRelief(board, 'style3d', minTileSize);
  return [
    ...checkPalette(board),
    ...checkNumbers(board),
    ...checkFont(board, fonts),
    ...checkSky(board),
    ...checkStyle(board, 'style2d', 'faces2d', PARAMS_2D),
    ...checkStyle(board, 'style3d', 'faces3d', []),
    ...r2.relief, ...r3.relief, ...r2.legible, ...r3.legible,
    ...checkContrast(board),
    ...checkMotion(board),
  ];
}
