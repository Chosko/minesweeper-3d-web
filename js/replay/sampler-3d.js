// The 3D movement sampler: the camera position in cell units and its yaw and pitch about 10 times
// a second, and the view mode (Shift, Space, Ctrl) whenever it changes, fed to the 3D session's
// recorder. DOM-free: driven by calls from the frame loop.
//
// cameraSample(camera, board, spacing) → [x, y, z, yaw, pitch]: the camera { x, y, z, yaw, pitch }
//   (js/input.js's FlyCamera) on a board { X, Y, Z } drawn at `spacing`. The position is in cell
//   units — cell (i, j, k)'s centre is (i, j, k), so a replay plays at any spacing — quantised to
//   1/POSITION_STEPS of a cell; yaw and pitch are quantised to 1/ANGLE_STEPS of a turn, the yaw
//   keeping its whole turns. Off the board the values run below 0 or past the board's size.
// viewMode(controls) → the held view modes { shift, space, ctrl } (js/controls.js) as VIEW_MODE
//   bits, 0 .. 7.
//
// createSampler3D({ session, camera, controls, spacing, interval? }) → sampler
//   session   the 3D session (js/mode3d/session.js): recording, board, elapsedMs(),
//             recordSample(values), recordView(mode).
//   camera    read at each sample; controls read at each tick; spacing () → the current spacing.
//   tick()    call every frame: while the session is recording, takes a sample when
//             SAMPLE_INTERVAL_MS of game time have passed since the last, and records the current
//             view mode (the recorder stores only a change).
// The session decides when it records — started, unpaused and unfinished — and stamps each event
// with its game timer, so paused time is absent.

/** Game time between two camera samples: about 10 a second. */
export const SAMPLE_INTERVAL_MS = 100;

/** A position's unit: 1/POSITION_STEPS of a cell. */
export const POSITION_STEPS = 16;

/** An angle's unit: 1/ANGLE_STEPS of a turn. */
export const ANGLE_STEPS = 4096;

/** The view mode's bits. */
export const VIEW_MODE = Object.freeze({ shift: 1, space: 2, ctrl: 4 });

const LIMIT = 2 ** 30;
const clampInt = (v) => Math.max(-LIMIT, Math.min(LIMIT, Math.round(v)));
const TURN = 2 * Math.PI;

export function cameraSample(camera, { X, Y, Z }, spacing) {
  const p = 4 * spacing; // the distance between two cell centres (js/render.js, js/picking.js)
  return [
    clampInt((camera.x / p + (X - 1) / 2) * POSITION_STEPS),
    clampInt((camera.y / p + (Y - 1) / 2) * POSITION_STEPS),
    clampInt((camera.z / p + (Z - 1) / 2) * POSITION_STEPS),
    clampInt((camera.yaw / TURN) * ANGLE_STEPS),
    clampInt((camera.pitch / TURN) * ANGLE_STEPS),
  ];
}

export function viewMode({ shift, space, ctrl }) {
  return (shift ? VIEW_MODE.shift : 0) | (space ? VIEW_MODE.space : 0) | (ctrl ? VIEW_MODE.ctrl : 0);
}

export function createSampler3D({ session, camera, controls, spacing, interval = SAMPLE_INTERVAL_MS }) {
  let last = null; // game time of the last sample

  return {
    tick() {
      if (!session.recording) return;
      const t = session.elapsedMs();
      if (last === null || t - last >= interval) {
        // Keep to the schedule across frame jitter; after a gap (a stalled frame), start it afresh.
        last = last !== null && t - last < 2 * interval ? last + interval : t;
        session.recordSample(cameraSample(camera, session.board, spacing()));
      }
      session.recordView(viewMode(controls));
    },
  };
}
