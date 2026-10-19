// The cell motion player both renderers use (feature themed-board-art-and-motion): it holds the
// running cell animations and answers, per frame, each animating cell's current values. DOM-free;
// it imports nothing and never touches game state, the timer or a replay — a cell event changes
// the game at once, and the player only says how the cell looks meanwhile.
//
// start(cell, event, before, after, description)
//   starts `cell`'s animation for a cell event, `description` being the theme's motion description
//   for it (the shape js/themes/board-module.js documents) and `before` / `after` the visual states
//   the caller draws, passed back as `face`. A null description starts nothing; past the cap
//   nothing starts either. Either way the cell shows its new state at once, so a running animation
//   on it is dropped. A second event on an animating cell restarts it from the new state. Answers
//   whether an animation started.
// valuesAt(time) → Map cell → { event, face, scale, offset { x, y, z }, rotation { axis, angle },
//   depth, brightness, opacity }, every animating cell's values at `time` (the player's clock, ms).
//   A property no track animates rests: scale 1, offset 0, angle 0, brightness and opacity 1, depth
//   null (the face's own). An animation whose duration has passed is over and leaves the map: the
//   cell shows its after state.
// dropAll() drops every animation — a new board, a seek, a pause hiding the board, a theme change.
// animating(time = now()) — whether any animation still runs (the render-on-demand loops poll it).
//
// Each track interpolates between its keyframes with the description's easing applied to every
// keyframe segment, as a CSS animation's timing function is; before its first and after its last
// keyframe it holds that keyframe's value. A rotation track with `flip: true` shows `before` until
// its midpoint (halfway from its first to its last keyframe, in time) and `after` from then on;
// without a flip the cell shows `after` throughout.
//
// MOTION_CAP — how many cells animate at once. Measured by dev/measure-cell-motion.mjs (a flood
// reveal on a 100 × 100 board, Joyful tiles' reveal, in headless Chromium on the 4-core cloud box
// with no GPU): per frame, the player plus the 2D motion layer's drawing from cached tiles, and the
// player plus the 3D motion mesh's instance updates and draw. The 2D layer is the heavier: about
// 1.1–1.9 ms a frame at 256 cells, 3.4–5.3 ms at 512 and about 110 ms for all 10,000 (the 3D mesh
// 0.6, 0.6–1.4 and about 18 ms). The cap is the largest power of two whose heavier renderer stays
// within 2 ms, an eighth of a 60 Hz frame.
export const MOTION_CAP = 256;

const NAMED = {
  linear: null,
  ease: [0.25, 0.1, 0.25, 1],
  'ease-in': [0.42, 0, 1, 1],
  'ease-out': [0, 0, 0.58, 1],
  'ease-in-out': [0.42, 0, 0.58, 1],
};

/** The CSS cubic-bezier(x1, y1, x2, y2) timing function: progress x in [0, 1] → eased y. */
export function cubicBezier(x1, y1, x2, y2) {
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  return (x) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-7) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0, hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t; else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

const identity = (x) => x;

/** A description's easing — a named curve or a cubic Bézier [x1, y1, x2, y2] — as a function. */
export function easingFunction(easing) {
  const points = Array.isArray(easing) ? easing : NAMED[easing];
  return points ? cubicBezier(...points) : identity;
}

const lerp = (a, b, k) => a + (b - a) * k;

function sample(keyframes, t, ease, mix) {
  const first = keyframes[0], last = keyframes[keyframes.length - 1];
  if (t <= first.at) return first.value;
  if (t >= last.at) return last.value;
  let i = 1;
  while (keyframes[i].at < t) i++;
  const a = keyframes[i - 1], b = keyframes[i];
  const span = b.at - a.at;
  return span > 0 ? mix(a.value, b.value, ease((t - a.at) / span)) : b.value;
}

const mixOffset = (a, b, k) => ({ x: lerp(a.x, b.x, k), y: lerp(a.y, b.y, k), z: lerp(a.z ?? 0, b.z ?? 0, k) });
const NO_AXIS = Object.freeze([0, 0, 1]);

/** A cell motion player on `now()`'s clock (ms), animating at most `cap` cells at once. */
export function createCellMotion({ now = () => performance.now(), cap = MOTION_CAP } = {}) {
  const running = new Map(); // cell -> { t0, event, before, after, description, ease, flipAt }

  function prune(time) {
    for (const [cell, a] of running) if (time - a.t0 >= a.description.duration) running.delete(cell);
  }

  function start(cell, event, before, after, description) {
    const restart = running.delete(cell);
    if (!description) return false;
    if (!restart && running.size >= cap) {
      prune(now());
      if (running.size >= cap) return false;
    }
    const flip = description.tracks.find((t) => t.property === 'rotation' && t.flip);
    const flipAt = flip ? (flip.keyframes[0].at + flip.keyframes[flip.keyframes.length - 1].at) / 2 : -Infinity;
    running.set(cell, { t0: now(), event, before, after, description, ease: easingFunction(description.easing), flipAt });
    return true;
  }

  function valuesAt(time) {
    prune(time);
    const out = new Map();
    for (const [cell, a] of running) {
      const t = Math.max(0, time - a.t0);
      const v = {
        event: a.event, face: t < a.flipAt ? a.before : a.after,
        scale: 1, offset: { x: 0, y: 0, z: 0 }, rotation: { axis: NO_AXIS, angle: 0 },
        depth: null, brightness: 1, opacity: 1,
      };
      for (const tr of a.description.tracks) {
        if (tr.property === 'offset') {
          const o = sample(tr.keyframes, t, a.ease, mixOffset);
          v.offset = { x: o.x, y: o.y, z: o.z ?? 0 };
        }
        else if (tr.property === 'rotation') v.rotation = { axis: tr.axis, angle: sample(tr.keyframes, t, a.ease, lerp) };
        else v[tr.property] = sample(tr.keyframes, t, a.ease, lerp);
      }
      out.set(cell, v);
    }
    return out;
  }

  function animating(time = now()) {
    prune(time);
    return running.size > 0;
  }

  return { start, valuesAt, dropAll: () => running.clear(), animating };
}
