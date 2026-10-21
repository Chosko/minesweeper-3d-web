// The replay viewer's 2D viewer: a Classic 2D replay drawn on the mode's own board view, read-only,
// with the recorded pointer — a core in a contrasting outline, trailing its last TRAIL_MS while
// playing —, the recorded keyboard and controller cursor, a press ring for each click and Show
// 3BV's paint. DOM-free at import: createViewer2D is driven by calls; mountViewer2D is its browser
// wiring.
//
// movementTrack(movement, interval?) → track: the replay's movement stream (js/replay/format.js)
//   split into its pointer samples and cursor cells, for lookups by time; interval is the replay's
//   movement sampling interval (its sampleIntervalMs), js/replay/sampler-2d.js SAMPLE_INTERVAL_MS
//   when not given.
// pointerAt(track, t) → [x, y] the recorded pointer at replay time t in board units from the board's
//   top-left corner (js/replay/sampler-2d.js boardPoint). Between two samples it holds the earlier one until one interval before the
//   later one, then interpolates linearly to it (throughout, across a gap of one interval or less):
//   the recorder stores no sample equal to the previous one, so a longer gap is a still stretch.
//   Held at the last sample; null before the first. Off the board the values run below 0 or past
//   the board's size.
// cursorAt(track, t) → the cell of the last cursor event at or before t, or -1: the ring shows only
//   while the recorded player used the cursor. A recording opens its cursor stream with -1 (its
//   ring hidden); one that opens on a cell was made while the ring showed from the start, before
//   it hid, and that opening cell counts as -1, so its ring shows from its next cursor event.
// pointerPixel(layout, scroll, [x, y]) → { x, y } that point in canvas CSS pixels, through the board
//   view's layout and scroll: a board unit is the layout's pitch, as the board view's boardPoint
//   reports it (the inverse of js/replay/sampler-2d.js boardPoint).
// replayGeometry(board) → the grid geometry (js/geometry/index.js) of a replay's 2D board identity
//   ({ grid, width, height }, js/records/board.js); an unknown grid kind is a RangeError.
// trailPoints(track, t, ms?) → [[x, y]] the recorded pointer's trail behind replay time t, in board units,
//   newest first: the pointer every TRAIL_STEP_MS back over the last ms (TRAIL_MS), where it was
//   elsewhere than at t; none before the first sample.
// paintBbbv(ctx, rects, colours) paints Show 3BV's rects on a 2D canvas context, each filling its
//   tile's outline — a square's box with its corners rounded TINT_RADIUS, any other shape the polygon
//   of its points — in colours[tint] at TINT_ALPHA of it — the colours of BBBV_TINT_TOKENS, three of
//   the confetti tokens —; a tint past them (an isolated number) is left unpainted.
//
// createViewer2D({ view, sim, pointer, overlay?, geometry? }) → { track, draw(frame, { playing }),
//   place(), setScale(scale), press(actions), still(), showBbbv(tints), destroy() }
//   view     the board view (js/classic2d/board-view.js) over the simulator's grid and the same
//            geometry; the viewer hands it the simulator's game, which it draws and never changes.
//   sim      the simulator (js/replay/simulator.js).
//   geometry the board's grid geometry, rebuilt from the replay's board (replayGeometry) when not
//            given, so an unknown grid kind is refused here and never at draw time. The pointer's
//            cell is the one the geometry hit-tests under it, a press ring's centre and a tint's
//            outline the geometry's, at the layout's tile and gap.
//   pointer  { place(x, y), hide(), trail?(points), ring?(x, y, kind) } — the pointer drawn over the
//            board, its trail and the press rings, in canvas CSS pixels.
//   overlay  { paint(rects), clear() } — Show 3BV's paint: rects [{ x, y, size, width, height, shape,
//            points, tint }], each cell's outline (its box, shape and corners) in canvas CSS pixels,
//            size the layout's tile, tint as js/replay/viewer.js regionTints.
//   draw(frame, { playing }) a simulator frame: redraws the cells it changed — playing their cell
//            events (reveal, flag, unflag) when playback drew the frame; a seek drops the running ones
//            and starts none —, moves the focus ring to the recorded cursor and the pointer to its
//            position at the frame's time (pointerAt, at
//            the replay's sampling interval), with its trail when playback drew the frame and none
//            otherwise (a seek clears it); on a view that scrolls (one mountViewer2D never mounts),
//            the view follows the pointer's cell, else the cursor's.
//   still()  playback paused: the trail goes, the pointer stays.
//   press(actions) a press ring for each action [{ time, kind, cell }]: on the recorded pointer at
//            its time when the pointer was on the acted cell, else on the cell's centre (a keyboard
//            or controller click, or one before the first sample).
//   showBbbv(tints) paints each cell's tint over the board (null clears it), kept through seeks and
//            refits; repaint() paints it again, for a theme change.
//   place()  re-places the pointer when the board view's layout or scroll moved since it was last
//            placed (a refit or a scroll while paused); call it every frame nothing is drawn.
//   setScale(scale)  the board scale (js/classic2d/board-view.js BOARD_SCALES) changed: the view
//            refits and repaints, and the pointer follows.
//
// mountViewer2D({ container, sim, scale?, win? }) → the viewer plus destroy(): the board view on the
// geometry rebuilt from the replay's board, mounted in container in its board frame (js/classic2d/board-view.js mountBoardView, framed, no
// play input), the whole board fitted in the container at any tile up to the board scale's cap, so
// it never scrolls, the pointer, its trail and the press rings
// as elements over it (.replay-pointer, .replay-trail, .replay-ring--<kind>, coloured from tokens),
// and Show 3BV as a canvas over the board view made the first time it shows, painted by paintBbbv.

import { SAMPLE_STEPS, SAMPLE_INTERVAL_MS } from './sampler-2d.js';
import { mountBoardView } from '../classic2d/board-view.js';
import { createGeometry } from '../geometry/index.js';
import { token, onThemeChange } from '../tokens.js';

/** The pointer's trail: its last TRAIL_MS of replay time, a point every TRAIL_STEP_MS. */
export const TRAIL_MS = 150;
export const TRAIL_STEP_MS = 25;
/** A press ring's wall-clock life, expanding and fading (css/style.css .replay-ring). */
export const RING_MS = 400;

export function movementTrack(movement, interval = SAMPLE_INTERVAL_MS) {
  const samples = movement.filter((e) => e.type === 'sample');
  const cursors = movement.filter((e) => e.type === 'cursor');
  const cells = Int32Array.from(cursors, (e) => e.cell);
  if (cells.length && cells[0] >= 0) cells[0] = -1; // the opening cell of a recording made before the ring hid
  return Object.freeze({
    interval,
    sampleTimes: Float64Array.from(samples, (e) => e.time),
    xs: Float64Array.from(samples, (e) => e.values[0] / SAMPLE_STEPS),
    ys: Float64Array.from(samples, (e) => e.values[1] / SAMPLE_STEPS),
    cursorTimes: Float64Array.from(cursors, (e) => e.time),
    cursorCells: cells,
  });
}

// The number of entries of an ascending time list at or before t.
function countAtOrBefore(times, t) {
  let lo = 0, hi = times.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (times[mid] <= t) lo = mid + 1; else hi = mid;
  }
  return lo;
}

export function pointerAt(track, t) {
  const { sampleTimes: times, xs, ys, interval } = track;
  const i = countAtOrBefore(times, t) - 1;
  if (i < 0) return null;
  if (i === times.length - 1) return [xs[i], ys[i]];
  const from = Math.max(times[i], times[i + 1] - interval);
  if (t <= from) return [xs[i], ys[i]];
  const k = (t - from) / (times[i + 1] - from);
  return [xs[i] + (xs[i + 1] - xs[i]) * k, ys[i] + (ys[i + 1] - ys[i]) * k];
}

export function cursorAt(track, t) {
  const i = countAtOrBefore(track.cursorTimes, t) - 1;
  return i < 0 ? -1 : track.cursorCells[i];
}

export function pointerPixel(layout, scroll, [x, y]) {
  return { x: layout.offsetX - scroll.x + x * layout.pitch, y: layout.offsetY - scroll.y + y * layout.pitch };
}

export function replayGeometry(board) {
  return createGeometry(board.grid, board.width, board.height);
}

export function trailPoints(track, t, ms = TRAIL_MS) {
  const now = pointerAt(track, t);
  if (!now) return [];
  const points = [];
  for (let back = TRAIL_STEP_MS; back <= ms; back += TRAIL_STEP_MS) {
    const p = pointerAt(track, t - back);
    if (!p) break;
    const last = points.at(-1) ?? now;
    if (p[0] !== last[0] || p[1] !== last[1]) points.push(p);
  }
  return points;
}

export function createViewer2D({ view, sim, pointer, overlay = null, geometry = replayGeometry(sim.replay.header.board) }) {
  const track = movementTrack(sim.replay.movement, sim.replay.sampleIntervalMs);
  view.setGame(sim.game);

  // The layout's tile, gap and pitch (a board unit), and the board's corner on the canvas now.
  const placing = () => {
    const { layout, scroll } = view;
    return { tile: layout.tile, gap: layout.pitch - layout.tile, pitch: layout.pitch, dx: layout.offsetX - scroll.x, dy: layout.offsetY - scroll.y };
  };
  // The cell the geometry hit-tests under a point in board units, or -1.
  const cellOf = (p) => {
    if (!p) return -1;
    const { tile, gap, pitch } = placing();
    return geometry.cellAt(p[0] * pitch, p[1] * pitch, tile, gap);
  };

  let point = null; // the pointer in board units at the last frame drawn
  let trail = [];   // its trail in board units
  let placed = '';  // the layout and scroll it was last placed through
  let tints = null; // Show 3BV's, while shown
  let painted = '';
  const pixel = (p) => pointerPixel(view.layout, view.scroll, p);
  const layoutKey = () => {
    const { layout, scroll } = view;
    return `${layout.tile},${layout.pitch},${layout.offsetX},${layout.offsetY},${scroll.x},${scroll.y}`;
  };
  function paint(force = false) {
    if (!tints || !overlay) return;
    const key = layoutKey();
    if (!force && key === painted) return;
    painted = key;
    const { tile, gap, dx, dy } = placing();
    const rects = [];
    for (let c = 0; c < tints.length; c++) {
      if (tints[c] < 0) continue;
      const o = geometry.outline(c, tile, gap);
      rects.push({
        x: dx + o.x, y: dy + o.y, size: tile, width: o.width, height: o.height, shape: o.shape,
        points: o.points.map(([x, y]) => [dx + x, dy + y]), tint: tints[c],
      });
    }
    overlay.paint(rects);
  }
  function place(force = false) {
    paint();
    if (!point) return;
    const key = layoutKey();
    if (!force && key === placed) return;
    placed = key;
    const at = pixel(point);
    pointer.place(at.x, at.y);
    pointer.trail?.(trail.map((p) => { const q = pixel(p); return [q.x, q.y]; }));
  }

  return {
    track,
    place: () => place(),
    setScale(scale) {
      view.setScale(scale);
      place();
    },
    draw(frame, { playing = false } = {}) {
      const p = pointerAt(track, frame.time);
      const cursor = cursorAt(track, frame.time);
      if (view.layout.scrolls) {
        const follow = cellOf(p) >= 0 ? cellOf(p) : cursor;
        if (follow >= 0) view.ensureVisible(follow);
      }
      if (!playing) view.dropMotion?.();
      view.update(frame.changed, { motion: playing });
      view.setCursor(cursor);
      point = p;
      trail = playing ? trailPoints(track, frame.time) : [];
      if (p) place(true);
      else { pointer.hide(); pointer.trail?.([]); paint(); }
    },
    still() {
      trail = [];
      pointer.trail?.([]);
    },
    press(actions) {
      for (const a of actions) {
        const p = pointerAt(track, a.time);
        if (p && cellOf(p) === a.cell) {
          const at = pixel(p);
          pointer.ring?.(at.x, at.y, a.kind);
          continue;
        }
        const { tile, gap, dx, dy } = placing();
        const centre = geometry.centre(a.cell, tile, gap);
        if (centre) pointer.ring?.(dx + centre.x, dy + centre.y, a.kind);
      }
    },
    showBbbv(next) {
      tints = next;
      if (tints) paint(true);
      else { painted = ''; overlay?.clear(); }
    },
    /** The tokens changed (a theme change): Show 3BV paints again in the new colours. */
    repaint() { paint(true); },
    destroy() {},
  };
}

/** Show 3BV's opening tints, a cycle of three (js/replay/viewer.js regionTints); an isolated number is left unpainted. */
export const BBBV_TINT_TOKENS = Object.freeze(['--color-confetti-2', '--color-confetti-3', '--color-confetti-5']);
/** A tint's share of its colour (the 3D cubes' too), and its square's corner radius in CSS pixels. */
export const TINT_ALPHA = 0.42;
const TINT_RADIUS = 4;

export function paintBbbv(ctx, rects, colours) {
  for (const { x, y, size, width = size, height = size, shape = 'square', points, tint } of rects) {
    if (tint < 0 || tint >= colours.length) continue;
    ctx.globalAlpha = TINT_ALPHA;
    ctx.fillStyle = colours[tint];
    ctx.beginPath();
    if (shape === 'square') ctx.roundRect(x, y, width, height, TINT_RADIUS);
    else {
      points.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export function mountViewer2D({ container, sim, scale, win = globalThis }) {
  const doc = win.document;
  const geometry = replayGeometry(sim.replay.header.board);
  const view = mountBoardView({ container, grid: sim.grid, geometry, scale, win, framed: true, minTile: 1 });
  const mark = (className) => {
    const node = doc.createElement('div');
    node.className = className;
    node.setAttribute('aria-hidden', 'true');
    node.hidden = true;
    container.append(node);
    return node;
  };
  const dots = Array.from({ length: Math.floor(TRAIL_MS / TRAIL_STEP_MS) }, () => mark('replay-trail'));
  const el = mark('replay-pointer');
  const rings = new Set();
  const pointer = {
    place(x, y) { el.hidden = false; el.style.transform = `translate(${x}px, ${y}px)`; },
    hide() { el.hidden = true; },
    trail(points) {
      dots.forEach((dot, i) => {
        const p = points[i];
        dot.hidden = !p;
        if (p) { dot.style.transform = `translate(${p[0]}px, ${p[1]}px)`; dot.style.opacity = String(0.6 * (1 - i / dots.length)); }
      });
    },
    ring(x, y, kind) {
      const ring = doc.createElement('div');
      ring.className = `replay-ring replay-ring--${kind}`;
      ring.setAttribute('aria-hidden', 'true');
      ring.style.left = `${x}px`;
      ring.style.top = `${y}px`;
      container.append(ring);
      rings.add(ring);
      win.setTimeout(() => { ring.remove(); rings.delete(ring); }, RING_MS);
    },
  };
  let canvas = null; // Show 3BV's, made the first time it shows
  const overlay = {
    paint(rects) {
      if (!canvas) {
        canvas = doc.createElement('canvas');
        canvas.className = 'replay-bbbv';
        canvas.setAttribute('aria-hidden', 'true');
        container.insertBefore(canvas, dots[0]);
      }
      const ratio = win.devicePixelRatio || 1;
      const w = container.clientWidth, h = container.clientHeight;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      canvas.hidden = false;
      const ctx = canvas.getContext('2d');
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, w, h);
      paintBbbv(ctx, rects, BBBV_TINT_TOKENS.map((name) => token(name)));
    },
    clear() { if (canvas) canvas.hidden = true; },
  };
  const viewer = createViewer2D({ view, sim, pointer, overlay, geometry });
  const offTheme = onThemeChange(() => viewer.repaint());
  return {
    track: viewer.track,
    draw: viewer.draw,
    place: viewer.place,
    setScale: viewer.setScale,
    press: viewer.press,
    still: viewer.still,
    showBbbv: viewer.showBbbv,
    destroy() {
      offTheme?.();
      viewer.destroy();
      el.remove();
      for (const dot of dots) dot.remove();
      for (const ring of rings) ring.remove();
      canvas?.remove();
      view.destroy();
    },
  };
}
