// The replay viewer's 3D viewer: a 3D replay drawn by the 3D renderer over the simulator's 3D state
// view, with the camera placed from the recorded position, yaw and pitch, interpolated between
// samples, and the recorded view mode applied. Player camera input never reaches it. DOM-free:
// createViewer3D is driven by calls; js/main.js hands it the scene.
//
// cameraTrack(movement, cappedAt?) → track: the replay's movement stream (js/replay/format.js) split
//   into its camera samples and view modes, for lookups by time; cappedAt is the header's
//   movementEndedAt (null when the movement was not capped).
// cameraAt(track, t) → [x, y, z, yaw, pitch] the recorded camera at replay time t: the position in
//   cells (cell (i, j, k)'s centre is (i, j, k)), yaw and pitch in radians, interpolated linearly
//   between the samples around t; the first sample before it, the last one after it. From the cap
//   on, the last sample recorded before it, so the camera holds its last recorded position. Null
//   when the replay holds no sample.
// viewModeAt(track, t) → the view mode of the last view event at or before t (js/replay/sampler-3d.js
//   VIEW_MODE bits), 0 before the first. viewToggles(mode) → { shift, space, ctrl }.
// worldPose([x, y, z, yaw, pitch], { X, Y, Z }, spacing) → { x, y, z, yaw, pitch } the camera in the
//   renderer's world at that spacing (the inverse of js/replay/sampler-3d.js cameraSample).
//
// createViewer3D({ sim, scene, spacing }) → { track, view, draw(frame), destroy() }
//   sim      the simulator (js/replay/simulator.js) of a box replay.
//   scene    { show(view), camera(pose, toggles), hide() } — the renderer's side: show() draws the
//            3D state view, camera() places the replay camera (a worldPose, or null when the replay
//            holds no sample) and applies the view mode's toggles, hide() gives the scene back.
//   spacing  the spacing the box is drawn at.
//   view     the 3D state view (js/engine/state-view-3d.js) over the simulator's game.
//   draw(frame) a simulator frame: marks the cells it changed for the renderer — every cell when the
//            game crosses its end either way, so the loss view comes and goes whole — and places the
//            camera at the frame's time.
//   destroy() hides the scene.

import { createStateView3D } from '../engine/state-view-3d.js';
import { POSITION_STEPS, ANGLE_STEPS, VIEW_MODE } from './sampler-3d.js';

const TURN = 2 * Math.PI;

export function cameraTrack(movement, cappedAt = null) {
  const samples = movement.filter((e) => e.type === 'sample');
  const views = movement.filter((e) => e.type === 'view');
  const column = (k, unit) => Float64Array.from(samples, (e) => e.values[k] * unit);
  const cell = 1 / POSITION_STEPS, angle = TURN / ANGLE_STEPS;
  return Object.freeze({
    cappedAt: cappedAt ?? null,
    sampleTimes: Float64Array.from(samples, (e) => e.time),
    values: Object.freeze([column(0, cell), column(1, cell), column(2, cell), column(3, angle), column(4, angle)]),
    viewTimes: Float64Array.from(views, (e) => e.time),
    viewModes: Uint8Array.from(views, (e) => e.mode),
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

const at = (values, i) => values.map((v) => v[i]);

export function cameraAt(track, t) {
  const { sampleTimes: times, values, cappedAt } = track;
  if (times.length === 0) return null;
  if (cappedAt !== null && t >= cappedAt) return at(values, Math.max(0, countAtOrBefore(times, cappedAt) - 1));
  const i = countAtOrBefore(times, t) - 1;
  if (i < 0) return at(values, 0);
  if (i === times.length - 1 || times[i] === t) return at(values, i);
  const k = (t - times[i]) / (times[i + 1] - times[i]);
  return values.map((v) => v[i] + (v[i + 1] - v[i]) * k);
}

export function viewModeAt(track, t) {
  const i = countAtOrBefore(track.viewTimes, t) - 1;
  return i < 0 ? 0 : track.viewModes[i];
}

export function viewToggles(mode) {
  return { shift: (mode & VIEW_MODE.shift) !== 0, space: (mode & VIEW_MODE.space) !== 0, ctrl: (mode & VIEW_MODE.ctrl) !== 0 };
}

export function worldPose([x, y, z, yaw, pitch], { X, Y, Z }, spacing) {
  const p = 4 * spacing; // the distance between two cell centres (js/render.js, js/picking.js)
  return { x: (x - (X - 1) / 2) * p, y: (y - (Y - 1) / 2) * p, z: (z - (Z - 1) / 2) * p, yaw, pitch };
}

export function createViewer3D({ sim, scene, spacing }) {
  const { replay, grid } = sim;
  const track = cameraTrack(replay.movement, replay.header.movementEndedAt);
  const view = createStateView3D(sim.game, grid);
  let every = null; // every cell, built the first time the game crosses its end
  let ended = view.state !== 'playing';

  scene.show(view);

  return {
    track,
    view,
    draw(frame) {
      const nowEnded = view.state !== 'playing';
      if (nowEnded !== ended) {
        every ??= Int32Array.from({ length: view.n }, (_, c) => c);
        view.apply({ changed: every });
      } else view.apply({ changed: frame.changed });
      ended = nowEnded;
      const pose = cameraAt(track, frame.time);
      scene.camera(pose && worldPose(pose, grid, spacing), viewToggles(viewModeAt(track, frame.time)));
    },
    destroy() { scene.hide(); },
  };
}
