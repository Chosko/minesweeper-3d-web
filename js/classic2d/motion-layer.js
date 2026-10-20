// Classic 2D motion layer (feature themed-board-art-and-motion): a canvas over the board canvas on
// which the cells the cell motion player (js/cell-motion.js) animates are drawn, each from the tile
// cache, transformed by the player's values. The board canvas leaves an animating cell's slot empty
// (js/classic2d/board-view.js), so a growing or moving cell overlaps its neighbours cleanly and
// nothing on the board canvas is redrawn per frame. Frames run only while a cell animates. DOM-free
// at import: it is handed its canvas, its frame scheduler and its clock.
//
// changeEvent(state, pressed) → { event, before } | null: the cell event an engine change list's
//   cell plays, from its state after the change (js/engine/rules.js CELL) — every change starts from
//   a closed or flagged cell, so the state after names both the event and the face before it:
//   revealed, mine or exploded → reveal from closed (pressed when the cell was shown pressed), a
//   wrong flag → reveal from flagged, flagged → flag from closed, closed → unflag from flagged.
//
// createMotionLayer({ canvas, place, paint, frames, clip?, onSettle?, now?, cap? }) → layer
//   canvas    the layer's <canvas>, or anything with width, height, style and getContext('2d').
//   place     (cell) → { x, y, size }, the cell's tile in canvas CSS pixels, or null out of view.
//   paint     (ctx, cell, face, x, y, size, depth) → draws the cell's `face` (a tile state) at
//             x, y in the context's current transform, depth null for the face's own.
//   clip      () → { x, y, width, height } the layer draws inside, or null for the whole canvas.
//   onSettle  (cells) → the cells whose animation ended or was dropped by the player since the last
//             frame: the board draws them again.
//   frames    { request(fn) → id, cancel(id) }: the page's animation frames.
//   now, cap  the player's clock (ms) and its cap (MOTION_CAP by default).
//
//   start(cell, event, before, after, description)  starts the cell's animation (the player's
//             start); false when none started — a null description or the cap — and a running one on
//             the cell is then dropped.
//   drop(cell)  drops the cell's running animation, if any: it shows its new state at once.
//   has(cell), cells   whether the cell animates, and the animating cells.
//   frame()   draws the layer at now(): cleared, then every animating cell at its values.
//   dropAll() drops every animation and clears the layer; returns the cells that animated.
//   resize(width, height, pixelRatio), dispose()
//
// A cell is drawn centred on its tile at the offset (in tile sizes), scaled, and turned by the
// rotation as seen face on — a turn about the screen's axis in the plane, about a board axis as a
// foreshortening —, at the opacity, its brightness a lighter or darker second pass over it.
import { createCellMotion } from '../cell-motion.js';

const REVEALED_STATES = new Set(['revealed', 'mine', 'exploded']);

export function changeEvent(state, pressed = false) {
  if (REVEALED_STATES.has(state)) return { event: 'reveal', before: pressed ? 'pressed' : 'closed' };
  if (state === 'wrong-flag') return { event: 'reveal', before: 'flagged' };
  if (state === 'flagged') return { event: 'flag', before: 'closed' };
  if (state === 'closed') return { event: 'unflag', before: 'flagged' };
  return null;
}

// The face-on view of a rotation by `angle` degrees about `axis`: the 2 × 2 part of its matrix.
function turn(axis, angle) {
  if (!angle) return [1, 0, 0, 1];
  const [x = 0, y = 0, z = 1] = axis ?? [];
  const n = Math.hypot(x, y, z) || 1;
  const ux = x / n, uy = y / n, uz = z / n;
  const a = (angle * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a), t = 1 - c;
  return [c + ux * ux * t, uy * ux * t + uz * s, ux * uy * t - uz * s, c + uy * uy * t];
}

export function createMotionLayer({
  canvas, place, paint, frames, clip = () => null, onSettle = () => {}, now = () => performance.now(), cap,
}) {
  const ctx = canvas.getContext('2d');
  const player = createCellMotion({ now, ...(cap === undefined ? {} : { cap }) });
  let live = new Set(); // the cells the player animated at the last frame or start since
  let pending = null;
  let width = 0, height = 0, ratio = 1;

  function schedule() {
    if (pending === null) pending = frames.request(tick);
  }

  function tick() {
    pending = null;
    frame();
    if (live.size) schedule();
  }

  function clear() {
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
  }

  function drawCell(cell, v) {
    const at = place(cell);
    if (!at) return;
    const { size } = at;
    const [a, b, c, d] = turn(v.rotation.axis, v.rotation.angle);
    const k = v.scale;
    const cx = at.x + size / 2 + v.offset.x * size;
    const cy = at.y + size / 2 + v.offset.y * size;
    ctx.setTransform(ratio * a * k, ratio * b * k, ratio * c * k, ratio * d * k, ratio * cx, ratio * cy);
    const half = -size / 2;
    ctx.globalAlpha = v.opacity;
    paint(ctx, cell, v.face, half, half, size, v.depth);
    if (v.brightness > 1) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = v.opacity * Math.min(1, v.brightness - 1);
      paint(ctx, cell, v.face, half, half, size, v.depth);
    } else if (v.brightness < 1) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.globalAlpha = Math.min(1, 1 - v.brightness);
      ctx.fillStyle = '#000000';
      ctx.fillRect(half, half, size, size);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  function frame() {
    const values = player.valuesAt(now());
    const settled = [];
    for (const cell of live) if (!values.has(cell)) settled.push(cell);
    live = new Set(values.keys());
    clear();
    if (values.size) {
      ctx.save();
      const box = clip();
      if (box) {
        ctx.beginPath();
        ctx.rect(box.x, box.y, box.width, box.height);
        ctx.clip();
      }
      for (const [cell, v] of values) drawCell(cell, v);
      ctx.restore();
    }
    if (settled.length) onSettle(settled);
  }

  function start(cell, event, before, after, description) {
    const started = player.start(cell, event, before, after, description);
    if (started) live.add(cell);
    else if (!live.delete(cell)) return false;
    schedule(); // a dropped cell leaves the layer at the next frame
    return started;
  }

  function drop(cell) {
    if (live.has(cell)) start(cell, null, null, null, null);
  }

  function dropAll() {
    player.dropAll();
    const cells = [...live];
    live = new Set();
    if (pending !== null) frames.cancel(pending);
    pending = null;
    clear();
    return cells;
  }

  return {
    start,
    drop,
    has: (cell) => live.has(cell),
    get cells() { return [...live]; },
    frame,
    dropAll,
    resize(w, h, pixelRatio = 1) {
      width = Math.max(0, Math.round(w));
      height = Math.max(0, Math.round(h));
      ratio = pixelRatio;
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      if (canvas.style) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }
      if (live.size) schedule();
    },
    dispose() {
      if (pending !== null) frames.cancel(pending);
      pending = null;
      player.dropAll();
      live = new Set();
    },
  };
}
