// Classic 2D end effect: the 3D game's win and loss effects (js/render.js) re-expressed at board
// scale, played on the 2D board canvas during the 2D end delay (js/classic2d/mode.js END_DELAY_MS)
// and drawn by the board view (js/classic2d/board-view.js) over the skin's static end-state tiles.
// DOM-free and stateless over time: an effect is made once at the game's end and asked about any
// moment t, in milliseconds since the end.
//
// Both waves start at an origin cell and reach each tile at a delay proportional to its distance
// from it, in tiles: at most WAVE_STEP_MS per tile, as the 3D waves, and less on a large board, so
// the wave reaches the board's farthest tile at WAVE_SHARE of the end delay at the latest. Their
// values and colours are the board module's `end2d` and confetti colours (js/themes/board-module.js);
// it reads no design token.
//   win    a wave spreading from the last action's cell — each tile bumps in scale and mixes toward
//          the module's light as the wave passes it (waveAt), and an unflagged mine turns into its
//          end-state flag (wonState) — and confetti bursting from that cell and falling over the
//          board's own rectangle (confettiAt), never outside it.
//   loss   a reveal wave from the exploded tile: each tile the loss changed keeps its pre-loss tile
//          (preLossState) until the wave reaches it (shownState), then snaps to its revealed face
//          from the module's scale with an overshoot under the module's flash (waveAt).
//
// createEndEffect({ kind, cols, rows, origin, duration, random? }) → effect
//   kind      WIN | LOSS
//   origin    the cell the wave starts at, as the square grid indexes it (col + cols × row)
//   duration  the end delay in ms
//   random    () → [0, 1), the confetti's seeds; Math.random by default
// reachMs(effect, c)                 when the wave reaches cell c: 0 at the origin
// preLossState(state)                the tile a cell showed before the loss changed it
// wonState(state)                    the tile a won board shows: a closed cell (a mine) as a flag
// shownState(effect, c, state, t)    the tile cell c, in `state` on the game, shows at t
// waveAt(effect, c, state, t, end2d) → { scale, flash } | null: the wave over cell c, in `state` on
//                                    the game, at t — the tile's scale about its centre and its share
//                                    of the light — from the module's `end2d`; null while it is still
// confettiAt(effect, t, { width, height, tile }) → [{ x, y, size, angle, color, alpha }]: the
//                                    pieces in view, in board CSS pixels from its top-left corner,
//                                    each inside width × height; color indexes the module's
//                                    confetti colours, wrapping round
// done(effect, t)                    the effect has played out: t ≥ duration
// drawWave(ctx, x, y, size, wave, board, paint)  one tile at x, y under its wave: paint() draws the
//                                    tile, scaled about its centre, then the light over it, clipped
//                                    to the tile's rounded corners (the module's style2d radius)
// drawConfetti(ctx, pieces, colours, x, y)  the pieces in `colours`, the board's corner at x, y

import { CELL } from '../engine/rules.js';
import { roundRect } from '../tile-art.js';

export const WIN = 'win';
export const LOSS = 'loss';

/** The waves' largest delay per tile of distance (the 3D waves' 0.06 s). */
export const WAVE_STEP_MS = 60;
/** The share of the end delay by which a wave has reached the board's farthest tile. */
export const WAVE_SHARE = 0.6;
/** The win wave over a tile: its peak after the wave reaches it and its width (the 3D win wave's). */
export const WIN_WAVE = Object.freeze({ peakMs: 140, widthMs: 100 });
/** How long a tile the loss changed takes to snap in once the wave reaches it (the 3D WAVE_CELL_S). */
export const LOSS_SNAP_MS = 300;
/** How many confetti pieces a win throws. */
export const CONFETTI_COUNT = 140;

const FADE_SHARE = 0.3; // the confetti fades out over the last share of the delay

/** The tile a cell showed before the loss changed it: a mine shown or exploded was closed, a wrong flag was a flag. */
export function preLossState(state) {
  if (state === CELL.MINE || state === CELL.EXPLODED) return CELL.CLOSED;
  if (state === CELL.WRONG_FLAG) return CELL.FLAGGED;
  return state;
}

export function createEndEffect({ kind, cols, rows, origin, duration, random = Math.random }) {
  if (kind !== WIN && kind !== LOSS) throw new RangeError(`unknown end effect "${kind}"`);
  const count = cols * rows;
  const o = Number.isInteger(origin) && origin >= 0 && origin < count ? origin : Math.floor(rows / 2) * cols + Math.floor(cols / 2);
  const oc = o % cols;
  const or = (o - oc) / cols;
  const far = Math.hypot(Math.max(oc, cols - 1 - oc), Math.max(or, rows - 1 - or));
  const step = far > 0 ? Math.min(WAVE_STEP_MS, (duration * WAVE_SHARE) / far) : 0;
  const pieces = [];
  if (kind === WIN) {
    for (let i = 0; i < CONFETTI_COUNT; i++) {
      pieces.push({ dir: random() * Math.PI * 2, rise: random(), speed: random(), late: random(), spin: random(), size: random(), color: i });
    }
  }
  return Object.freeze({ kind, cols, rows, origin: o, originCol: oc, originRow: or, duration, step, pieces: Object.freeze(pieces) });
}

/** When the wave reaches cell c, in ms since the end: 0 at the origin, proportional to the distance. */
export function reachMs(effect, c) {
  const col = c % effect.cols;
  const row = (c - col) / effect.cols;
  return Math.hypot(col - effect.originCol, row - effect.originRow) * effect.step;
}

/** The tile a won board shows for a cell: every cell still closed at a win is a mine, shown flagged. */
export function wonState(state) {
  return state === CELL.CLOSED ? CELL.FLAGGED : state;
}

/**
 * The tile cell c, in `state` on the game, shows at t: before the wave reaches it, the tile it
 * showed before the end (a loss's pre-loss tile, a win's closed mine); after, its end-state tile
 * (a win's unflagged mine as a flag).
 */
export function shownState(effect, c, state, t) {
  const reached = t >= reachMs(effect, c);
  if (effect.kind === LOSS) return reached ? state : preLossState(state);
  return reached ? wonState(state) : state;
}

/**
 * The wave over cell c, in `state` on the game, at t, from the board module's `end2d`: a win bumps
 * every tile WIN_WAVE.peakMs after the wave reaches it, to end2d.win.scale and end2d.win.mix of the
 * light at the peak; a loss snaps a tile it changed in from end2d.loss.scale, overshooting before it
 * settles at LOSS_SNAP_MS (the 3D loss wave's curve), under end2d.loss.flash of the light fading out.
 * Null while the tile is still.
 */
export function waveAt(effect, c, state, t, end2d) {
  if (!end2d || t >= effect.duration) return null;
  const local = t - reachMs(effect, c);
  if (effect.kind === WIN) {
    if (local <= 0) return null;
    const b = Math.exp(-(((local - WIN_WAVE.peakMs) / WIN_WAVE.widthMs) ** 2));
    if (b < 0.01) return null;
    return { scale: 1 + (end2d.win.scale - 1) * b, flash: end2d.win.mix * b };
  }
  if (preLossState(state) === state || local < 0 || local >= LOSS_SNAP_MS) return null;
  const p = local / LOSS_SNAP_MS;
  const q = p - 1;
  const settle = 1 + 2.2 * q * q * q + 1.2 * q * q; // 0 at the start, past 1 midway, 1 at the end
  return { scale: end2d.loss.scale + (1 - end2d.loss.scale) * settle, flash: end2d.loss.flash * (1 - p) };
}

/** Whether the effect has played out. */
export function done(effect, t) { return t >= effect.duration; }

/**
 * The confetti at t over a board width × height CSS pixels with `tile` pixel tiles: each piece
 * bursts from the origin's tile, slows and falls; a piece outside the board's rectangle is not in
 * view and left out. Fades over the last FADE_SHARE of the delay; none after it.
 */
export function confettiAt(effect, t, { width, height, tile }) {
  if (effect.kind !== WIN || t < 0 || t >= effect.duration || !(width > 0 && height > 0)) return [];
  const span = Math.max(width, height);
  const x0 = (effect.originCol + 0.5) * tile;
  const y0 = (effect.originRow + 0.5) * tile;
  const fadeFrom = effect.duration * (1 - FADE_SHARE);
  const alpha = t <= fadeFrom ? 1 : Math.max(0, (effect.duration - t) / (effect.duration - fadeFrom));
  const out = [];
  for (const p of effect.pieces) {
    const s = Math.max(0, t / 1000 - p.late * 0.15); // seconds since this piece left
    const drag = 2.2;
    const travel = (1 - Math.exp(-drag * s)) / drag;
    const speed = span * (0.9 + 1.4 * p.speed);
    const dx = Math.cos(p.dir);
    const dy = Math.sin(p.dir) - 0.9 * p.rise; // most pieces are thrown upward first
    const x = x0 + dx * speed * travel + Math.sin(s * 5 + p.spin * 40) * tile * 0.3 * s;
    const y = y0 + dy * speed * travel + span * 0.9 * s * s;
    const size = Math.max(3, tile * (0.18 + 0.14 * p.size));
    if (x < 0 || y < 0 || x > width || y > height) continue;
    out.push({ x, y, size, angle: p.spin * Math.PI * 2 + s * (4 + 6 * p.spin), color: p.color, alpha });
  }
  return out;
}

/**
 * One tile at x, y, `size` px under its wave (waveAt; null for none): paint() draws the tile, scaled
 * about its centre, then the module's light at the wave's share over it, clipped to the tile's
 * rounded corners (the module's style2d radius), never over its corners or the ground.
 */
export function drawWave(ctx, x, y, size, wave, board, paint) {
  ctx.save();
  if (wave) {
    const cx = x + size / 2;
    const cy = y + size / 2;
    ctx.translate(cx, cy);
    ctx.scale(wave.scale, wave.scale);
    ctx.translate(-cx, -cy);
  }
  paint();
  if (wave?.flash > 0 && board?.end2d) {
    ctx.globalAlpha = wave.flash;
    ctx.fillStyle = board.end2d.light;
    roundRect(ctx, x, y, size, size, size * (board.style2d?.params?.radius ?? 0));
    ctx.fill();
  }
  ctx.restore();
}

/** Draws confetti pieces (confettiAt) with the board's top-left corner at x, y; colours by piece colour index. */
export function drawConfetti(ctx, pieces, colours, x, y) {
  for (const p of pieces) {
    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = colours[p.color % colours.length];
    ctx.translate(x + p.x, y + p.y);
    ctx.rotate(p.angle);
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
}
