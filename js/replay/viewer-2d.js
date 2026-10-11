// The replay viewer's 2D viewer: a Classic 2D replay drawn on the mode's own board view, read-only,
// with the recorded pointer and the recorded keyboard and controller cursor. DOM-free at import:
// createViewer2D is driven by calls; mountViewer2D is its browser wiring.
//
// movementTrack(movement) → track: the replay's movement stream (js/replay/format.js) split into its
//   pointer samples and cursor cells, for lookups by time.
// pointerAt(track, t) → [x, y] the recorded pointer at replay time t in cells from the board's
//   top-left corner, interpolated linearly between the samples around t and held at the last one;
//   null before the first sample. Off the board the values run below 0 or past the board's size.
// cursorAt(track, t) → the cell of the last cursor event at or before t, or -1.
// pointerPixel(layout, scroll, [x, y]) → { x, y } that point in canvas CSS pixels, through the board
//   view's layout and scroll (the inverse of js/replay/sampler-2d.js boardPoint).
//
// createViewer2D({ view, sim, pointer }) → { track, draw(frame), place(), destroy() }
//   view     the board view (js/classic2d/board-view.js) over the simulator's square grid; the viewer
//            hands it the simulator's game, which it draws and never changes.
//   sim      the simulator (js/replay/simulator.js).
//   pointer  { place(x, y), hide() } — the pointer drawn over the board, in canvas CSS pixels.
//   draw(frame) a simulator frame: redraws the cells it changed, moves the focus ring to the recorded
//            cursor and the pointer to its interpolated position; on a board that scrolls, the view
//            follows the pointer's cell, else the cursor's.
//   place()  re-places the pointer when the board view's layout or scroll moved since it was last
//            placed (a refit or a scroll while paused); call it every frame nothing is drawn.
//
// mountViewer2D({ container, sim, win? }) → the viewer plus destroy(): the board view mounted in
// container (js/classic2d/board-view.js mountBoardView, no play input) and the pointer as an element
// over it.

import { SAMPLE_STEPS } from './sampler-2d.js';
import { mountBoardView } from '../classic2d/board-view.js';

export function movementTrack(movement) {
  const samples = movement.filter((e) => e.type === 'sample');
  const cursors = movement.filter((e) => e.type === 'cursor');
  return Object.freeze({
    sampleTimes: Float64Array.from(samples, (e) => e.time),
    xs: Float64Array.from(samples, (e) => e.values[0] / SAMPLE_STEPS),
    ys: Float64Array.from(samples, (e) => e.values[1] / SAMPLE_STEPS),
    cursorTimes: Float64Array.from(cursors, (e) => e.time),
    cursorCells: Int32Array.from(cursors, (e) => e.cell),
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
  const { sampleTimes: times, xs, ys } = track;
  const i = countAtOrBefore(times, t) - 1;
  if (i < 0) return null;
  if (i === times.length - 1 || times[i] === t) return [xs[i], ys[i]];
  const k = (t - times[i]) / (times[i + 1] - times[i]);
  return [xs[i] + (xs[i + 1] - xs[i]) * k, ys[i] + (ys[i + 1] - ys[i]) * k];
}

export function cursorAt(track, t) {
  const i = countAtOrBefore(track.cursorTimes, t) - 1;
  return i < 0 ? -1 : track.cursorCells[i];
}

export function pointerPixel(layout, scroll, [x, y]) {
  return { x: layout.offsetX - scroll.x + x * layout.tile, y: layout.offsetY - scroll.y + y * layout.tile };
}

export function createViewer2D({ view, sim, pointer }) {
  const track = movementTrack(sim.replay.movement);
  const { width, height } = sim.grid;
  view.setGame(sim.game);

  const cellOf = (p) => {
    if (!p) return -1;
    const col = Math.floor(p[0]), row = Math.floor(p[1]);
    return col >= 0 && row >= 0 && col < width && row < height ? col + width * row : -1;
  };

  let point = null; // the pointer in cells at the last frame drawn
  let placed = '';  // the layout and scroll it was last placed through
  function place(force = false) {
    if (!point) return;
    const { layout, scroll } = view;
    const key = `${layout.tile},${layout.offsetX},${layout.offsetY},${scroll.x},${scroll.y}`;
    if (!force && key === placed) return;
    placed = key;
    const at = pointerPixel(layout, scroll, point);
    pointer.place(at.x, at.y);
  }

  return {
    track,
    place: () => place(),
    draw(frame) {
      const p = pointerAt(track, frame.time);
      const cursor = cursorAt(track, frame.time);
      if (view.layout.scrolls) {
        const follow = cellOf(p) >= 0 ? cellOf(p) : cursor;
        if (follow >= 0) view.ensureVisible(follow);
      }
      view.update(frame.changed);
      view.setCursor(cursor);
      point = p;
      if (p) place(true);
      else pointer.hide();
    },
    destroy() {},
  };
}

export function mountViewer2D({ container, sim, win = globalThis }) {
  const view = mountBoardView({ container, grid: sim.grid, win });
  const el = win.document.createElement('div');
  el.className = 'replay-pointer';
  el.setAttribute('aria-hidden', 'true');
  el.hidden = true;
  container.append(el);
  const pointer = {
    place(x, y) { el.hidden = false; el.style.transform = `translate(${x}px, ${y}px)`; },
    hide() { el.hidden = true; },
  };
  const viewer = createViewer2D({ view, sim, pointer });
  return {
    track: viewer.track,
    draw: viewer.draw,
    place: viewer.place,
    destroy() {
      viewer.destroy();
      el.remove();
      view.destroy();
    },
  };
}
