// The 3D movement sampler: the camera position in cell units and its yaw and pitch about 10 times
// a second, and the view mode (Shift, Space, Ctrl) whenever it changes, fed to the 3D session's
// recorder. DOM-free: driven by calls from the frame loop.
//
// cameraSample(camera, board, spacing, steps?) → [x, y, z, yaw, pitch]: the camera
//   { x, y, z, yaw, pitch } (js/input.js's FlyCamera) on a board { X, Y, Z } drawn at `spacing`.
//   The position is in cell units — cell (i, j, k)'s centre is (i, j, k), so a replay plays at any
//   spacing — quantised to 1/POSITION_STEPS of a cell; yaw and pitch are quantised to
//   1/ANGLE_STEPS of a turn, the yaw keeping its whole turns. Off the board the values run below 0
//   or past the board's size. steps { position, angle } replaces the two steps, for the
//   measurement (dev/measure-replays.mjs).
// viewMode(controls) → the held view modes { shift, space, ctrl } (js/controls.js) as VIEW_MODE
//   bits, 0 .. 7.
//
// createSampler3D({ session, camera, controls, spacing, interval?, steps? }) → sampler
//   session   the 3D session (js/mode3d/session.js): recording, board, elapsedMs(),
//             recordSample(values), recordView(mode).
//   camera    read at each sample; controls read at each tick; spacing () → the current spacing.
//   tick()    call every frame: while the session is recording, takes a sample when
//             SAMPLE_INTERVAL_MS of game time have passed since the last, and records the current
//             view mode (the recorder stores only a change).
// The session decides when it records — started, unpaused and unfinished — and stamps each event
// with its game timer, so paused time is absent.

// All set from dev/measure-replays.mjs (simulated games played through the session, Node 22): at
// 1/8192 of a turn one angle step is about 1 px of a 1080 px high view (45° field of view); 1/16
// of a cell is the coarsest position step whose playback error stays within 0.05 cell (p95 0.042);
// and 100 ms is the longest interval whose view direction error stays within 1° (p95 0.56°; 150 ms
// gives 1.19°), at about 62 bytes of movement a second.

/** Game time between two camera samples: about 10 a second. */
export const SAMPLE_INTERVAL_MS = 100;

/** A position's unit: 1/POSITION_STEPS of a cell. */
export const POSITION_STEPS = 16;

/** An angle's unit: 1/ANGLE_STEPS of a turn. */
export const ANGLE_STEPS = 8192;

/** The view mode's bits. */
export const VIEW_MODE = Object.freeze({ shift: 1, space: 2, ctrl: 4 });

const LIMIT = 2 ** 30;
const clampInt = (v) => Math.max(-LIMIT, Math.min(LIMIT, Math.round(v)));
const TURN = 2 * Math.PI;

export function cameraSample(camera, { X, Y, Z }, spacing, { position = POSITION_STEPS, angle = ANGLE_STEPS } = {}) {
  const p = 4 * spacing; // the distance between two cell centres (js/render.js, js/picking.js)
  return [
    clampInt((camera.x / p + (X - 1) / 2) * position),
    clampInt((camera.y / p + (Y - 1) / 2) * position),
    clampInt((camera.z / p + (Z - 1) / 2) * position),
    clampInt((camera.yaw / TURN) * angle),
    clampInt((camera.pitch / TURN) * angle),
  ];
}

export function viewMode({ shift, space, ctrl }) {
  return (shift ? VIEW_MODE.shift : 0) | (space ? VIEW_MODE.space : 0) | (ctrl ? VIEW_MODE.ctrl : 0);
}

export function createSampler3D({ session, camera, controls, spacing, interval = SAMPLE_INTERVAL_MS, steps }) {
  let last = null; // game time of the last sample

  return {
    tick() {
      if (!session.recording) return;
      const t = session.elapsedMs();
      if (last === null || t - last >= interval) {
        // Keep to the schedule across frame jitter; after a gap (a stalled frame), start it afresh.
        last = last !== null && t - last < 2 * interval ? last + interval : t;
        session.recordSample(cameraSample(camera, session.board, spacing(), steps));
      }
      session.recordView(viewMode(controls));
    },
  };
}
