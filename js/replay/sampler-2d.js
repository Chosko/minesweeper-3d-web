// The Classic 2D movement sampler: the pointer in board coordinates about 20 times a second and the
// keyboard and controller cursor's cell whenever it moves, fed to the session's recorder. DOM-free
// at import: createSampler2D is driven by calls; mountSampler2D is its browser wiring.
//
// boardPoint(layout, scroll, x, y, steps?) → [bx, by]: canvas position x, y (CSS pixels) in cell
//   units from the board's top-left corner, quantised to 1/steps of a cell (SAMPLE_STEPS by
//   default; another step is for the measurement, dev/measure-replays.mjs); off the board the
//   values run below 0 or past the board's size, so a replay plays at any window size and zoom.
//
// createSampler2D({ session, point, interval? }) → sampler
//   session   the Classic 2D session (js/classic2d/session.js): recording, elapsedMs(),
//             recordSample(values), recordCursor(cell).
//   point     () → [bx, by] from boardPoint, or null while no pointer position is known.
//   tick()    call every frame: while the session is recording, takes a sample when
//             SAMPLE_INTERVAL_MS of game time have passed since the last, and records the cursor's
//             current cell (the recorder stores only a change).
//   cursor(c) the cursor moved to cell c (-1 for none): recorded at once while recording, and at
//             the next tick otherwise.
// The session decides when it records — started, unpaused and unfinished — and stamps each event
// with its game timer, so paused time is absent.
//
// mountSampler2D({ view, session, win?, interval? }) → { sampler, tick(), cursor(c), destroy() }:
// the last pointer position over the page (`win` mousemove), read through the board view's canvas
// rectangle, layout and scroll at each sample.

// Both set from dev/measure-replays.mjs (simulated games played through the session, Node 22): at
// 1/64 of a cell one step is under 2 px on the largest standard tile (Beginner on a 1920 × 1080
// window, 109 px), and 50 ms is the longest interval whose playback error stays within 0.1 cell
// (p95 over moving frames: 2.7 px at MIN_TILE_SIZE; 67 ms gives 4.4 px), at about 47 bytes of
// movement a second.

/** Game time between two pointer samples: about 20 a second. */
export const SAMPLE_INTERVAL_MS = 50;

/** A sample's unit: 1/SAMPLE_STEPS of a cell. */
export const SAMPLE_STEPS = 64;

const LIMIT = 2 ** 30;
const clampInt = (v) => Math.max(-LIMIT, Math.min(LIMIT, Math.round(v)));

export function boardPoint(layout, scroll, x, y, steps = SAMPLE_STEPS) {
  const bx = (x - layout.offsetX + scroll.x) / layout.tile;
  const by = (y - layout.offsetY + scroll.y) / layout.tile;
  return [clampInt(bx * steps), clampInt(by * steps)];
}

export function createSampler2D({ session, point, interval = SAMPLE_INTERVAL_MS }) {
  let last = null; // game time of the last sample
  let cell = -1;

  const recordCursor = () => { if (cell >= 0) session.recordCursor(cell); };

  return {
    tick() {
      if (!session.recording) return;
      const t = session.elapsedMs();
      if (last === null || t - last >= interval) {
        const values = point();
        if (values) {
          // Keep to the schedule across frame jitter; after a gap (a pause), start it afresh.
          last = last !== null && t - last < 2 * interval ? last + interval : t;
          session.recordSample(values);
        }
      }
      recordCursor();
    },
    cursor(c) {
      cell = Number.isInteger(c) ? c : -1;
      if (session.recording) recordCursor();
    },
  };
}

export function mountSampler2D({ view, session, win = globalThis, interval }) {
  let client = null;
  const onMove = (event) => { client = [event.clientX, event.clientY]; };
  const point = () => {
    if (!client) return null;
    const box = view.canvas.getBoundingClientRect();
    return boardPoint(view.layout, view.scroll, client[0] - box.left, client[1] - box.top);
  };
  const sampler = createSampler2D({ session, point, interval });
  win.addEventListener('mousemove', onMove);
  return {
    sampler,
    tick: () => sampler.tick(),
    cursor: (c) => sampler.cursor(c),
    destroy() { win.removeEventListener('mousemove', onMove); },
  };
}
