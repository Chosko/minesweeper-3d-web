// The replay simulator: a replay played again on the engine, to any point in its time (no DOM).
//
// A simulator builds the graph from the replay's header, creates the game from the header's mine
// set under the recorded rule profile and rules version, and applies the action stream up to a
// requested time. It is deterministic — the same replay always plays the same way, in the browser
// and in Node — and never changes the replay it is given.
//
//   openReplay(input) → { ok: true, replay } | { ok: false, reason, message }
//       input is a blob (Uint8Array or ArrayBuffer) or a replay object (js/replay/format.js); a
//       replay object is checked by encoding it, and the replay handed back is always a fresh
//       decoded copy. Refused, with `reason` one of REFUSAL and `message` the line the viewer shows:
//         REFUSAL.NEWER       a newer format version, or a rule profile or rules version this
//                             build does not have — "made by a newer version";
//         REFUSAL.UNREADABLE  anything else that is not a well-formed replay.
//
//   createSimulator(input, { snapshotInterval?, snapshotMinCells?, snapshotMemory? }) → simulator
//       (the options default to the constants below; tests set them); throws
//       ReplayRefusedError (`reason`, `message`) where openReplay refuses.
//     replay, grid (the square or box grid), duration (the check's elapsed time, or the last
//     action's time when later), length (the number of actions)
//     game          the engine game, read-only for callers; always the same object
//     seek(t)       → frame at replay time t (clamped to 0 .. duration): every action with
//                     time <= t applied
//     seekIndex(i)  → frame with the first i actions applied (clamped to 0 .. length), at the time
//                     of action i - 1 (0 for none)
//     indexAt(t)    the number of actions with time <= t
//     stats()       → { snapshots, snapshotBytes, interval, lastSeek: { from: 'current' |
//                     'snapshot', applied } }: snapshots kept, their bytes, the actions between
//                     periodic snapshots (null when none are kept), and where the last seek
//                     started and how many actions it applied
//   frame — { time, index, phase, minesLeft, explodedCell, bbbv, bbbvSolved, clicks, state,
//            game, changed }: `state` the game's state arrays (js/engine/rules.js), `changed` an
//            Int32Array of the cells whose look — the cell state a board view draws, and the 3D
//            hidden state — differs from the previous frame's (from the start of the game for
//            the first).
//
//   simulate(input, upTo) → the frame of a fresh simulator at time upTo, its `changed` the cells
//       changed from the start of the game.
//
// Seeking. Forwards, the simulator applies the actions in between. Backwards, it restores the
// nearest engine-state snapshot at or before the target (js/engine/rules.js snapshot() /
// restore()) and replays from there. Every simulator keeps the snapshot of the start, so a small
// board replays from the start; a board of at least SNAPSHOT_MIN_CELLS cells also keeps one every
// SNAPSHOT_INTERVAL actions, taken as playback first passes it and kept while the simulator lives.
// A stream so long that its snapshots would pass SNAPSHOT_MEMORY bytes spaces them further apart,
// evenly, to stay within it.
//
// The constants are measured (feature replay-playback § Snapshot interval): a backward seek on the
// largest 3D board, 100 × 100 × 100, costs about 25 ms of restoring and comparing every cell plus
// 4 to 6 µs an action replayed, and a snapshot there is about 2 MB; below 8,000 cells a replay
// from the start stays within about 15 ms.

import { decodeReplay, encodeReplay, ReplayNewerVersionError } from './format.js';
import { createGameWithMines, PHASE } from '../engine/rules.js';
import { PROFILES } from '../engine/profiles.js';
import { createSquareGrid } from '../engine/square-grid.js';
import { createBoxGrid } from '../engine/box-grid.js';

export const SNAPSHOT_MIN_CELLS = 8000;
export const SNAPSHOT_INTERVAL = 2000;
export const SNAPSHOT_MEMORY = 64 * 1024 * 1024;

export const REFUSAL = Object.freeze({ NEWER: 'newer-version', UNREADABLE: 'unreadable' });

const MESSAGES = Object.freeze({
  [REFUSAL.NEWER]: 'This replay was made by a newer version of the game.',
  [REFUSAL.UNREADABLE]: 'This replay cannot be read.',
});

export class ReplayRefusedError extends Error {
  constructor(reason, message, options) {
    super(message, options);
    this.name = 'ReplayRefusedError';
    this.reason = reason;
  }
}

const refused = (reason, cause) => ({ ok: false, reason, message: MESSAGES[reason], cause });

const isBytes = (x) => x instanceof Uint8Array || x instanceof ArrayBuffer;

export function openReplay(input) {
  let replay;
  try {
    replay = decodeReplay(isBytes(input) ? input : encodeReplay(input));
  } catch (err) {
    return refused(err instanceof ReplayNewerVersionError ? REFUSAL.NEWER : REFUSAL.UNREADABLE, err);
  }
  const { id, version } = replay.header.profile;
  const entry = Object.hasOwn(PROFILES, id) ? PROFILES[id] : null;
  if (!entry || !Object.hasOwn(entry.versions, version)) return refused(REFUSAL.NEWER, new RangeError(`rule profile ${id} version ${version} is not in this build`));
  return { ok: true, replay };
}

const gridOf = (graph) => (graph.kind === 'square' ? createSquareGrid(graph.width, graph.height) : createBoxGrid(graph.x, graph.y, graph.z));

export function createSimulator(input, {
  snapshotInterval = SNAPSHOT_INTERVAL, snapshotMinCells = SNAPSHOT_MIN_CELLS, snapshotMemory = SNAPSHOT_MEMORY,
} = {}) {
  const opened = openReplay(input);
  if (!opened.ok) throw new ReplayRefusedError(opened.reason, opened.message, { cause: opened.cause });
  const { replay } = opened;
  const { header, actions, check } = replay;
  const grid = gridOf(header.graph);
  const n = grid.graph.count;
  const length = actions.length;
  const duration = Math.max(check.elapsedMs, length ? actions[length - 1].time : 0);
  const game = createGameWithMines({ graph: grid.graph, profile: header.profile.id, version: header.profile.version, mines: header.mines });

  const periodic = n >= snapshotMinCells;
  const snaps = []; // snaps[k]: the snapshot after k * interval actions (k = 0 the start)
  let snapCount = 0, snapBytes = 0;
  function take(k) {
    const s = game.snapshot();
    snaps[k] = s;
    snapCount++;
    snapBytes += s.cells.byteLength + (s.flagNb ? s.flagNb.byteLength : 0) + (s.metrics ? s.metrics.left.byteLength : 0) + s.clicks.byteLength;
  }
  take(0);
  const fits = Math.max(1, Math.floor(snapshotMemory / snapBytes) - 1); // periodic snapshots the budget holds
  const interval = periodic ? Math.max(snapshotInterval, Math.ceil(length / fits)) : null;

  // Each cell's look at the last frame — what a board view draws: 0 closed, 1 revealed (9 revealed
  // and hidden), 2 flagged, and in the loss view 3 mine, 4 exploded, 5 wrong flag. A fresh game is
  // all closed.
  const look = new Uint8Array(n);
  const out = new Int32Array(n);
  const mark = new Uint8Array(n);
  const pending = new Int32Array(n);
  let pendingLen = 0;
  let everyCell = false;

  let index = 0;
  let lastSeek = Object.freeze({ from: 'current', applied: 0 });

  function step() {
    const a = actions[index];
    const r = a.kind === 'reveal' ? game.reveal(a.cell) : a.kind === 'flag' ? game.toggleFlag(a.cell) : game.chord(a.cell);
    const ch = r.changed;
    for (let i = 0; i < ch.length; i++) {
      const c = ch[i];
      if (!mark[c]) { mark[c] = 1; pending[pendingLen++] = c; }
    }
    index++;
    if (periodic && index % interval === 0 && !snaps[index / interval]) take(index / interval);
  }

  // The cells whose look moved since the last frame: those the actions in between reported, or
  // every cell after a restore. Ascending.
  function changedCells() {
    const { revealed, flagged, hidden, mine } = game.state;
    const lost = game.phase === PHASE.LOST, exploded = game.explodedCell;
    let len = 0;
    const visit = (c) => {
      let l;
      if (revealed[c]) l = hidden[c] ? 9 : 1;
      else if (lost && c === exploded) l = 4;
      else if (lost && mine[c] && !flagged[c]) l = 3;
      else if (lost && flagged[c] && !mine[c]) l = 5;
      else l = flagged[c] ? 2 : 0;
      if (l !== look[c]) { look[c] = l; out[len++] = c; }
    };
    if (everyCell) {
      for (let c = 0; c < n; c++) visit(c);
    } else {
      pending.subarray(0, pendingLen).sort();
      for (let i = 0; i < pendingLen; i++) visit(pending[i]);
    }
    for (let i = 0; i < pendingLen; i++) mark[pending[i]] = 0;
    pendingLen = 0;
    everyCell = false;
    return out.slice(0, len);
  }

  function frame(time) {
    const { bbbv, bbbvSolved, clicks } = game.counts();
    return Object.freeze({
      time, index, phase: game.phase, minesLeft: game.minesLeft, explodedCell: game.explodedCell,
      bbbv, bbbvSolved, clicks, state: game.state, game, changed: changedCells(),
    });
  }

  function goTo(target) {
    let from = 'current', applied = 0;
    if (target < index) {
      let k = periodic ? Math.floor(target / interval) : 0;
      while (!snaps[k]) k--;
      game.restore(snaps[k]);
      index = periodic ? k * interval : 0;
      everyCell = true;
      from = 'snapshot';
    }
    while (index < target) { step(); applied++; }
    lastSeek = Object.freeze({ from, applied });
  }

  function indexAt(t) {
    let lo = 0, hi = length; // the first action with time > t
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (actions[mid].time <= t) lo = mid + 1; else hi = mid;
    }
    return lo;
  }

  const finite = (x, what) => {
    if (typeof x !== 'number' || Number.isNaN(x)) throw new RangeError(`${what} must be a number, got ${x}`);
    return x;
  };

  return Object.freeze({
    replay, grid, game, duration, length,
    indexAt,
    seek(t) {
      const time = Math.min(Math.max(finite(t, 'replay time'), 0), duration);
      goTo(indexAt(time));
      return frame(time);
    },
    seekIndex(i) {
      const target = Math.min(Math.max(Math.floor(finite(i, 'action index')), 0), length);
      goTo(target);
      return frame(target === 0 ? 0 : actions[target - 1].time);
    },
    stats() {
      return Object.freeze({ snapshots: snapCount, snapshotBytes: snapBytes, interval, lastSeek });
    },
  });
}

export function simulate(input, upTo) {
  return createSimulator(input).seek(upTo);
}
