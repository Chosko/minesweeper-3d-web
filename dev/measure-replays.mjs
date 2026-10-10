// Measures replay recording on simulated games played through the real sessions, samplers and
// recorder: replay sizes, with and without the platform's compression stream, and how smoothly the
// recorded movement plays back, at candidate sampling intervals and quantisation steps. The
// measurement behind the sampler constants (js/replay/sampler-2d.js, js/replay/sampler-3d.js),
// MOVEMENT_CAP_BYTES (js/replay/recorder.js) and the uncompressed blob (js/replay/format.js).
//
// Usage: node dev/measure-replays.mjs                    the tables below
//        node dev/measure-replays.mjs --write-fixtures   (re)writes the recorded games under
//                                                        tests/fixtures/replays/ at the current
//                                                        constants; only when the format changes
//
// The player. A seeded simulated player that knows the mines plays each game frame by frame
// (60 frames a second with jitter) on a fake clock: it reveals the frontier cell nearest its
// pointer, flags and chords some of the time, and pauses to think. Pointer and camera move in
// minimum-jerk strokes with a curved path (and, in 2D, a tremor while moving), timed by Fitts' law
// in 2D and by the turn's angle in 3D; the 3D camera turns to aim at each cell, sometimes flies to
// a new vantage point at the camera's top speed (MOVE_SPEED at spacing 1.1, about 11 cells a
// second) and holds Shift, Space or Ctrl now and then. Every frame's true pose is kept.
//
// Smoothness. Playback places the pointer or camera by linear interpolation between stored samples
// (feature replay-playback). A sample equal to the previous one is not stored, so after a still
// stretch the next stored sample lies one interval or many after the last; "hold" interpolation
// holds the last value until one interval before the next sample, "plain" interpolates across the
// whole gap, which drifts through every still stretch. The error is the distance between the
// played-back and the true pose at every frame the pose moved: in 2D in pixels at MIN_TILE_SIZE
// (the smallest tile, so the largest pixel error per cell), in 3D the position in cells and the
// view direction in degrees. p95 is the 95th percentile over every moving frame of every game.
//
// How the constants are chosen, from BOUNDS. Quantisation: the coarsest power-of-two step at which
// one step moves the played-back pointer or view by at most 2 px on a 1920 × 1080 window — in 2D
// at the Beginner tile there (the largest standard tile), in 3D at the camera's 45° field of view —
// except the 3D position, whose step is the coarsest with a p95 position error within 0.05 cell.
// Sampling: the longest interval whose p95 hold error stays within 0.1 cell in 2D (at
// MIN_TILE_SIZE), and within 1° of view direction and 0.05 cell of position in 3D. The script
// prints the constants these rules pick as "Chosen".
//
// How to read it. A row is one candidate; the current constants are marked *. Bytes are the
// movement stream's per second of game time and the median whole blob per board. The compression
// table compares each blob with its 'deflate-raw' and 'gzip' CompressionStream output.

import { generate } from '../js/generation/generate.js';
import { createSession as createSession2D } from '../js/classic2d/session.js';
import { createSession as createSession3D } from '../js/mode3d/session.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { boardLayout } from '../js/classic2d/board-view.js';
import { PRESETS } from '../js/mode3d/board-choice.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { createGameWithMines, PHASE } from '../js/engine/rules.js';
import { PROFILE_3D } from '../js/engine/profiles.js';
import { MOVE_SPEED } from '../js/input.js';
import { buildSummary } from '../js/records/summary.js';
import { MODE_3D } from '../js/records/board.js';
import {
  boardPoint, createSampler2D, SAMPLE_INTERVAL_MS as INTERVAL_2D, SAMPLE_STEPS,
} from '../js/replay/sampler-2d.js';
import {
  createSampler3D, SAMPLE_INTERVAL_MS as INTERVAL_3D, POSITION_STEPS, ANGLE_STEPS,
} from '../js/replay/sampler-3d.js';
import { MOVEMENT_CAP_BYTES } from '../js/replay/recorder.js';
import { decodeReplay, encodeReplay } from '../js/replay/format.js';

const FRAME_MS = 1000 / 60;
const SPACING = 1.1;
const TURN = 2 * Math.PI;

// ---------- the games ----------

// The recorded games kept as test fixtures (tests/replay-determinism.test.mjs): per mode a win, a
// loss, an abandon and wasted clicks; in 3D flags placed before the first reveal.
export const FIXTURE_GAMES = Object.freeze([
  { kind: '2d', board: 'beginner', seed: 11, outcome: 'won', waste: true, note: '2D Beginner, won with wasted clicks' },
  { kind: '2d', board: 'intermediate', seed: 12, outcome: 'lost', stopAfter: 30, note: '2D Intermediate, lost' },
  { kind: '2d', board: 'expert', seed: 13, outcome: 'abandoned', stopAfter: 40, note: '2D Expert, abandoned' },
  { kind: '3d', board: 'double-beginner', seed: 21, outcome: 'won', preFlags: true, note: '3D double layer Beginner, won, flags before the first reveal' },
  { kind: '3d', board: 'cube-beginner', seed: 22, outcome: 'lost', stopAfter: 12, waste: true, note: '3D cube Beginner, lost with wasted clicks' },
  { kind: '3d', board: 'cube-intermediate', seed: 23, outcome: 'abandoned', stopAfter: 25, note: '3D cube Intermediate, abandoned' },
].map(Object.freeze));

// The games measured: wins on every standard board and 3D preset.
export const MEASURED_GAMES = Object.freeze([
  ...['beginner', 'intermediate', 'expert'].flatMap((board) => [1, 2, 3].map((s) => ({ kind: '2d', board, seed: 100 + s, outcome: 'won', waste: s === 3 }))),
  ...PRESETS.flatMap((p) => [1, 2].map((s) => ({ kind: '3d', board: p.id, seed: 200 + s, outcome: 'won', waste: s === 2 }))),
]);

// ---------- helpers ----------

// mulberry32: a small seeded source in 0 .. 1.
export function createRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function fakeClock(start = 1000) {
  let t = start;
  let next = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const h = next++; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout(h) { timers.delete(h); },
    advance(ms) {
      t += ms;
      for (const [h, timer] of [...timers]) if (timer.at <= t) { timers.delete(h); timer.fn(); }
    },
  };
}

// The generation client over generate() itself, keeping the last board's mines.
function generatingClient() {
  return {
    mines: null,
    request(req) {
      const r = generate(req);
      if (r.ok) this.mines = Array.from(r.mines);
      return Promise.resolve(r);
    },
    cancel() {},
  };
}

const minJerk = (u) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * u * (10 - 15 * u + 6 * u * u));
const between = (rng, a, b) => a + (b - a) * rng();

// One stroke of the pose from `from` to `to` over [t0, t1]: minimum jerk along the way, bent by
// `bend` at its middle, with a tremor of `tremor` (per component) while moving.
function stroke(from, to, t0, t1, bend, tremor, rng) {
  const phase = from.map(() => [rng() * TURN, rng() * TURN]);
  return (t) => {
    const u = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
    const s = minJerk(u), arc = Math.sin(Math.PI * u);
    return from.map((f, i) => {
      const shake = tremor ? tremor[i] * arc * (Math.sin(TURN * 9 * (t / 1000) + phase[i][0]) + 0.5 * Math.sin(TURN * 23 * (t / 1000) + phase[i][1])) : 0;
      return f + (to[i] - f) * s + bend[i] * arc + shake;
    });
  };
}

// The frame loop shared by both modes: advances the fake clock frame by frame, moves the pose,
// keeps the true pose of every recorded frame and ticks the sampler.
function createDriver({ session, clock, rng, pose, apply, tick }) {
  let motion = null; // { at(t), t1 }
  const truth = [];
  function frame() {
    clock.advance(FRAME_MS + (rng() - 0.5) * 4);
    const now = clock.now();
    if (motion) {
      const p = motion.at(now);
      for (let i = 0; i < pose.length; i++) pose[i] = p[i];
      if (now >= motion.t1) motion = null;
    }
    apply(pose);
    if (session.recording) truth.push([session.elapsedMs(), ...pose]);
    tick();
  }
  return {
    truth,
    wait(ms) { const until = clock.now() + ms; while (clock.now() < until) frame(); },
    move(to, ms, bend, tremor) {
      const t0 = clock.now();
      motion = { at: stroke(pose.slice(), to, t0, t0 + ms, bend, tremor, rng), t1: t0 + ms };
      while (motion) frame();
    },
  };
}

// The player's choice on the engine state: { kind, cell } or null to stop.
function choose({ st, n, neighbours, near, rng, spec, step, canChord }) {
  const closed = (c) => !st.revealed[c];
  const flaggedAround = (c) => neighbours(c).reduce((k, d) => k + (st.flagged[d] ? 1 : 0), 0);
  const nearest = (pred) => {
    let best = -1, bestD = Infinity;
    for (let c = 0; c < n; c++) if (pred(c)) { const d = near(c); if (d < bestD) { bestD = d; best = c; } }
    return best;
  };
  const touchesOpen = (c) => neighbours(c).some((d) => st.revealed[d]);

  if (spec.stopAfter !== undefined && step >= spec.stopAfter) {
    if (spec.outcome === 'abandoned') return null;
    if (spec.outcome === 'lost') return { kind: 'reveal', cell: nearest((c) => st.mine[c] && !st.flagged[c]) };
  }
  const wrong = nearest((c) => closed(c) && st.flagged[c] && !st.mine[c]);
  if (wrong >= 0) return { kind: 'toggleFlag', cell: wrong };
  if (spec.waste && rng() < 0.1) {
    const c = nearest((c) => canChord(c) && st.number[c] > 0 && flaggedAround(c) !== st.number[c] && neighbours(c).some((d) => closed(d) && !st.flagged[d]));
    if (c >= 0) return { kind: 'chord', cell: c };
  }
  const r = rng();
  if (r < 0.25) {
    const c = nearest((c) => closed(c) && st.mine[c] && !st.flagged[c] && touchesOpen(c));
    if (c >= 0) return { kind: 'toggleFlag', cell: c };
  } else if (r < 0.45) {
    const c = nearest((c) => canChord(c) && st.number[c] > 0 && flaggedAround(c) === st.number[c] && neighbours(c).some((d) => closed(d) && !st.flagged[d]));
    if (c >= 0) return { kind: 'chord', cell: c };
  }
  let c = nearest((c) => closed(c) && !st.mine[c] && !st.flagged[c] && touchesOpen(c));
  if (c < 0) c = nearest((c) => closed(c) && !st.mine[c] && !st.flagged[c]);
  return c < 0 ? null : { kind: 'reveal', cell: c };
}

const MAX_STEPS = 20000;

// ---------- a 2D game ----------

// Plays one Classic 2D game through the session with the 2D sampler at `interval` and `steps`:
// → { summary, replay, truth, interval, steps }.
export async function playGame2D(spec, { interval = INTERVAL_2D, steps = SAMPLE_STEPS } = {}) {
  const rng = createRandom(spec.seed);
  const clock = fakeClock();
  const client = generatingClient();
  const session = createSession2D({ choice: { size: spec.board, noGuess: false }, client, clock, randomSeed: () => spec.seed });
  const { width, height, grid } = session.setup;
  const n = width * height;
  const pose = [between(rng, 0, width), between(rng, 0, height)];
  const unit = { offsetX: 0, offsetY: 0, tile: 1 };
  const origin = { x: 0, y: 0 };
  const sampler = createSampler2D({ session, point: () => boardPoint(unit, origin, pose[0], pose[1], steps), interval });
  const drive = createDriver({ session, clock, rng, pose, apply: () => {}, tick: () => sampler.tick() });
  let ended = null;
  session.on('finished', (e) => { ended = e; });
  session.on('abandoned', (e) => { ended = e; });

  const aim = (c) => {
    const [col, row] = grid.colRow(c);
    const to = [col + 0.5 + between(rng, -0.3, 0.3), row + 0.5 + between(rng, -0.3, 0.3)];
    const dx = to[0] - pose[0], dy = to[1] - pose[1], d = Math.hypot(dx, dy);
    const ms = (80 + 110 * Math.log2(d + 1)) * between(rng, 0.8, 1.2);
    const b = d * between(rng, -0.12, 0.12);
    const bend = d > 0 ? [(-dy / d) * b, (dx / d) * b] : [0, 0];
    drive.move(to, ms, bend, [0.02, 0.02]);
    drive.wait(between(rng, 30, 120));
  };

  const first = grid.index(Math.floor(width / 2), Math.floor(height / 2));
  aim(first);
  await session.reveal(first);
  const neighbours = (c) => grid.graph.neighbours(c);
  for (let step = 0; step < MAX_STEPS && !ended; step++) {
    if (rng() < 0.2) drive.wait(between(rng, 200, 1200));
    const st = session.game.state;
    const act = choose({ st, n, neighbours, near: (c) => { const [x, y] = grid.colRow(c); return Math.hypot(x + 0.5 - pose[0], y + 0.5 - pose[1]); }, rng, spec, step, canChord: (c) => st.revealed[c] });
    if (!act) { session.restart(); break; }
    aim(act.cell);
    session[act.kind](act.cell);
  }
  if (!ended) throw new Error(`the 2D game ${spec.board}/${spec.seed} did not end`);
  return { summary: ended.summary, replay: ended.replay, truth: drive.truth, interval, steps };
}

// ---------- a 3D game ----------

// Plays one 3D game through the session with the 3D sampler at `interval` and `steps`
// { position, angle }: → { summary, replay, truth, interval, steps }. The truth is the camera in
// cell units and its yaw and pitch in radians.
export async function playGame3D(spec, { interval = INTERVAL_3D, steps = { position: POSITION_STEPS, angle: ANGLE_STEPS } } = {}) {
  const rng = createRandom(spec.seed);
  const clock = fakeClock();
  const client = generatingClient();
  const preset = PRESETS.find((p) => p.id === spec.board);
  const { X, Y, Z } = preset;
  const session = createSession3D({ board: { X, Y, Z, mines: preset.mines, noGuess: false }, client, clock, randomSeed: () => spec.seed });
  const box = createBoxGrid(X, Y, Z);
  const n = X * Y * Z;
  const p = 4 * SPACING;
  const centre = [(X - 1) / 2, (Y - 1) / 2, (Z - 1) / 2];
  const reach = Math.hypot(X, Y, Z) / 2;

  // pose: camera position in cells, yaw, pitch; the camera itself in world units.
  const vantage = (azimuth, height, radius) => [
    centre[0] + radius * Math.sin(azimuth), centre[1] + height, centre[2] - radius * Math.cos(azimuth),
  ];
  let azimuth = rng() * TURN;
  const pose = [...vantage(azimuth, between(rng, -1, 1) * reach * 0.5, reach + between(rng, 2, 5)), 0, 0];
  const camera = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 };
  const apply = (q) => {
    camera.x = (q[0] - centre[0]) * p; camera.y = (q[1] - centre[1]) * p; camera.z = (q[2] - centre[2]) * p;
    camera.yaw = q[3]; camera.pitch = q[4];
  };
  const controls = { shift: false, space: false, ctrl: false };
  const sampler = createSampler3D({ session, camera, controls, spacing: () => SPACING, interval, steps });
  const drive = createDriver({ session, clock, rng, pose, apply, tick: () => sampler.tick() });

  // The yaw and pitch that look from `from` at `at` (FlyCamera: forward = (sin -yaw, sin pitch, cos -yaw)),
  // the yaw taken nearest the current one.
  const look = (from, at) => {
    const dx = at[0] - from[0], dy = at[1] - from[1], dz = at[2] - from[2];
    let yaw = -Math.atan2(dx, dz);
    yaw += Math.round((pose[3] - yaw) / TURN) * TURN;
    const pitch = Math.asin(Math.max(-1, Math.min(1, dy / Math.max(1e-9, Math.hypot(dx, dz)))));
    return [yaw, Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch))];
  };
  [pose[3], pose[4]] = look(pose, centre);
  apply(pose);

  const turnTo = (at) => {
    const [yaw, pitch] = look(pose, at);
    const deg = Math.hypot(yaw - pose[3], pitch - pose[4]) * (180 / Math.PI);
    const ms = (100 + 130 * Math.log2(1 + deg / 3)) * between(rng, 0.8, 1.25);
    const bend = [0, 0, 0, 0, (yaw - pose[3]) * between(rng, -0.08, 0.08)];
    drive.move([pose[0], pose[1], pose[2], yaw, pitch], ms, bend, null);
  };
  const fly = () => {
    azimuth += between(rng, 0.5, 1.6) * (rng() < 0.5 ? -1 : 1);
    const to = vantage(azimuth, between(rng, -1, 1) * reach * 0.6, reach + between(rng, 1.5, 5));
    const dist = Math.hypot(to[0] - pose[0], to[1] - pose[1], to[2] - pose[2]) * p;
    const ms = (1.875 * dist / MOVE_SPEED) * 1000 * between(rng, 1, 1.4);
    const [yaw, pitch] = look(to, centre);
    drive.move([...to, yaw, pitch], ms, [between(rng, -1, 1), between(rng, -1, 1), between(rng, -1, 1), 0, 0], null);
  };
  const cellAt = (c) => box.coords(c);
  const aim = (c) => { turnTo(cellAt(c)); drive.wait(between(rng, 40, 150)); };

  let shadow = null;
  const pre = [];
  const first = box.index(Math.floor(X / 2), Math.floor(Y / 2), Math.floor(Z / 2));
  if (spec.preFlags) {
    const a = (first + 1) % n, b = (first + X + 1) % n;
    for (const c of [a, b, b]) { aim(c); session.toggleFlag(c); pre.push(c); }
  }
  aim(first);
  await session.reveal(first);
  shadow = createGameWithMines({ graph: box.graph, profile: PROFILE_3D, mines: client.mines });
  for (const c of pre) shadow.toggleFlag(c);
  shadow.reveal(first);

  const neighbours = (c) => box.graph.neighbours(c);
  let held = 0;
  let ended = false;
  for (let step = 0; step < MAX_STEPS && !ended; step++) {
    if (rng() < 0.2) drive.wait(between(rng, 200, 1200));
    if (rng() < 0.1) fly();
    if (held > 0 && --held === 0) { controls.shift = controls.space = controls.ctrl = false; }
    if (held === 0 && rng() < 0.08) { controls[['shift', 'space', 'ctrl'][Math.floor(rng() * 3)]] = true; held = 2 + Math.floor(rng() * 5); }
    const st = shadow.state;
    const near = (c) => { const q = cellAt(c); return Math.hypot(q[0] - pose[0], q[1] - pose[1], q[2] - pose[2]); };
    const act = choose({ st, n, neighbours, near, rng, spec, step, canChord: (c) => st.revealed[c] && !st.hidden[c] });
    if (!act) break;
    aim(act.cell);
    session[act.kind](act.cell);
    shadow[act.kind](act.cell);
    ended = shadow.phase === PHASE.WON || shadow.phase === PHASE.LOST;
  }
  if (spec.outcome !== 'abandoned' && !ended) throw new Error(`the 3D game ${spec.board}/${spec.seed} did not end`);
  const engine = ended ? session.engineSummary() : session.counts();
  const summary = buildSummary({
    engine,
    elapsedMs: session.elapsedMs(),
    board: { mode: MODE_3D, width: X, height: Y, depth: Z, mines: preset.mines, noGuess: false },
    seed: session.seed,
    generatorVersion: session.generatorVersion,
  });
  const replay = session.replay(summary);
  if (!ended) session.restart();
  return { summary, replay, truth: drive.truth, interval, steps };
}

export const playGame = (spec, options) => (spec.kind === '2d' ? playGame2D : playGame3D)(spec, options);

// ---------- measuring ----------

const quantile = (values, q) => {
  if (values.length === 0) return 0;
  const sorted = Float64Array.from(values).sort();
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

// The played-back pose at each true frame, and its error at the frames where the pose moved.
// `hold` holds a sample over a still stretch (see the head comment); scale turns stored values back
// into the truth's units.
export function playbackErrors(game, { hold }) {
  const kind = game.replay ? decodeReplay(game.replay.blob).header.graph.kind : null;
  const samples = decodeReplay(game.replay.blob).movement.filter((e) => e.type === 'sample');
  const scale = kind === 'square'
    ? [game.steps, game.steps]
    : [game.steps.position, game.steps.position, game.steps.position, game.steps.angle / TURN, game.steps.angle / TURN];
  const T = samples.map((e) => e.time);
  const V = samples.map((e) => e.values.map((v, i) => v / scale[i]));
  const errors = kind === 'square' ? { px: [] } : { cells: [], deg: [] };
  let k = 0, prev = null;
  for (const [t, ...truth] of game.truth) {
    const moved = prev && truth.some((v, i) => v !== prev[i]);
    prev = truth;
    if (!moved || T.length === 0) continue;
    while (k + 1 < T.length && T[k + 1] <= t) k++;
    let at;
    if (t <= T[0]) at = V[0];
    else if (k + 1 >= T.length) at = V[k];
    else {
      const start = hold && T[k + 1] - T[k] > 1.5 * game.interval ? T[k + 1] - game.interval : T[k];
      const u = t <= start ? 0 : (t - start) / (T[k + 1] - start);
      at = V[k].map((v, i) => v + (V[k + 1][i] - v) * u);
    }
    if (kind === 'square') {
      errors.px.push(Math.hypot(at[0] - truth[0], at[1] - truth[1]) * MIN_TILE_SIZE);
    } else {
      errors.cells.push(Math.hypot(at[0] - truth[0], at[1] - truth[1], at[2] - truth[2]));
      const dir = (yaw, pitch) => [Math.sin(-yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(-yaw) * Math.cos(pitch)];
      const a = dir(at[3], at[4]), b = dir(truth[3], truth[4]);
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      errors.deg.push(Math.acos(dot) * (180 / Math.PI));
    }
  }
  return errors;
}

// Bytes of the blob's movement stream: the blob less the same replay without movement.
export function movementBytes(blob) {
  const replay = decodeReplay(blob);
  return blob.length - encodeReplay({ ...replay, movement: [] }).length;
}

export async function compressedSize(bytes, format) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream(format));
  return (await new Response(stream).arrayBuffer()).byteLength;
}

// One candidate over a set of games: movement bytes per second, the median blob per board, the
// p95 and worst playback errors (hold and plain).
async function measureCandidate(games, options) {
  const played = [];
  for (const spec of games) played.push(await playGame(spec, options));
  let bytes = 0, ms = 0;
  const blobs = {};
  const hold = {}, plain = {};
  for (const g of played) {
    bytes += movementBytes(g.replay.blob);
    ms += g.summary.elapsedMs;
    (blobs[g.replay.listing.boardKey] ??= []).push(g.replay.blob.length);
    for (const [into, h] of [[hold, true], [plain, false]]) {
      for (const [k, v] of Object.entries(playbackErrors(g, { hold: h }))) (into[k] ??= []).push(...v);
    }
  }
  const stat = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { p95: quantile(v, 0.95), max: quantile(v, 1) }]));
  return {
    played,
    bytesPerSecond: bytes / (ms / 1000),
    blobs: Object.fromEntries(Object.entries(blobs).map(([k, v]) => [k, quantile(v, 0.5)])),
    hold: stat(hold),
    plain: stat(plain),
  };
}

const fmt = (v, d = 1) => v.toFixed(d).padStart(7);

// The bounds the constants are chosen by (the head comment's "How the constants are chosen").
export const BOUNDS = Object.freeze({
  windowHeight: 1080, // a 1920 × 1080 window
  stepPx: 2, // one quantisation step moves the played-back pointer or view by at most this
  p95Cells2D: 0.1, // 2D playback error, p95 over moving frames
  p95Degrees3D: 1, // 3D view direction playback error, p95
  p95Cells3D: 0.05, // 3D camera position playback error, p95
});
const FOV_DEGREES = 45; // js/render.js's camera

// The largest standard tile: Beginner on a 1920 × 1080 window, below the 64 px overlay bar with
// 16 px margins (js/classic2d/board-view.js's fit rule).
const BEGINNER_TILE = boardLayout({ cols: 9, rows: 9, width: 1920 - 32, height: BOUNDS.windowHeight - 64 - 32 }).tile;
const pow2AtLeast = (v) => 2 ** Math.ceil(Math.log2(v));

async function report() {
  const games2D = MEASURED_GAMES.filter((g) => g.kind === '2d');
  const games3D = MEASURED_GAMES.filter((g) => g.kind === '3d');
  const mark = (on) => (on ? '*' : ' ');
  const chosen = {};

  // 2D: the step from the Beginner tile, then the longest interval within the error bound.
  chosen.steps2D = pow2AtLeast(BEGINNER_TILE / BOUNDS.stepPx);
  console.log(`2D: ${games2D.length} games; error in px at MIN_TILE_SIZE ${MIN_TILE_SIZE}, step in px at the Beginner tile ${BEGINNER_TILE}`);
  console.log('  interval steps step px   B/s  p95 hold  max hold  p95 plain');
  const row2 = (m, interval, steps, on) => console.log(`${mark(on)} ${String(interval).padStart(7)} ${String(steps).padStart(5)} ${fmt(BEGINNER_TILE / steps)} ${fmt(m.bytesPerSecond, 0)} ${fmt(m.hold.px.p95)}   ${fmt(m.hold.px.max)}   ${fmt(m.plain.px.p95)}`);
  chosen.interval2D = 0;
  for (const interval of [17, 25, 33, 50, 67, 100]) {
    const m = await measureCandidate(games2D, { interval, steps: chosen.steps2D });
    if (m.hold.px.p95 <= BOUNDS.p95Cells2D * MIN_TILE_SIZE) chosen.interval2D = interval;
    row2(m, interval, chosen.steps2D, interval === INTERVAL_2D && chosen.steps2D === SAMPLE_STEPS);
  }
  for (const steps of [8, 16, 32, 64, 128]) {
    if (steps === chosen.steps2D && chosen.interval2D) continue;
    row2(await measureCandidate(games2D, { interval: chosen.interval2D, steps }), chosen.interval2D, steps, chosen.interval2D === INTERVAL_2D && steps === SAMPLE_STEPS);
  }

  // 3D: the angle step from the view's pixel; the position step and the interval within the bounds.
  const degPerPx = FOV_DEGREES / BOUNDS.windowHeight;
  chosen.angle = pow2AtLeast(360 / (BOUNDS.stepPx * degPerPx));
  console.log(`\n3D: ${games3D.length} games; position error in cells, direction error in degrees, angle step in px of a ${BOUNDS.windowHeight} px high view`);
  console.log('  interval pos angle step px    B/s  p95 cells  max cells  p95 deg  max deg  p95 deg plain');
  const row3 = (m, interval, steps, on) => console.log(`${mark(on)} ${String(interval).padStart(7)} ${String(steps.position).padStart(4)} ${String(steps.angle).padStart(5)} ${fmt(360 / steps.angle / degPerPx)} ${fmt(m.bytesPerSecond, 0)}   ${fmt(m.hold.cells.p95, 3)}    ${fmt(m.hold.cells.max, 3)}  ${fmt(m.hold.deg.p95, 2)}  ${fmt(m.hold.deg.max, 2)}  ${fmt(m.plain.deg.p95, 2)}`);
  const isCurrent = (interval, s) => interval === INTERVAL_3D && s.position === POSITION_STEPS && s.angle === ANGLE_STEPS;
  chosen.position = 0;
  for (const position of [128, 64, 32, 16, 8, 4]) {
    const steps = { position, angle: chosen.angle };
    const m = await measureCandidate(games3D, { interval: INTERVAL_3D, steps });
    if (m.hold.cells.p95 <= BOUNDS.p95Cells3D) chosen.position = position;
    row3(m, INTERVAL_3D, steps, isCurrent(INTERVAL_3D, steps));
  }
  chosen.interval3D = 0;
  for (const interval of [33, 50, 67, 100, 150, 200]) {
    const steps = { position: chosen.position, angle: chosen.angle };
    const m = await measureCandidate(games3D, { interval, steps });
    if (m.hold.deg.p95 <= BOUNDS.p95Degrees3D && m.hold.cells.p95 <= BOUNDS.p95Cells3D) chosen.interval3D = interval;
    row3(m, interval, steps, isCurrent(interval, steps));
  }
  for (const angle of [1024, 2048, 4096, 8192, 16384]) {
    if (angle === chosen.angle) continue;
    const steps = { position: chosen.position, angle };
    row3(await measureCandidate(games3D, { interval: chosen.interval3D, steps }), chosen.interval3D, steps, isCurrent(chosen.interval3D, steps));
  }

  console.log(`\nChosen: 2D every ${chosen.interval2D} ms at 1/${chosen.steps2D} cell; 3D every ${chosen.interval3D} ms, position 1/${chosen.position} cell, angles 1/${chosen.angle} turn`);

  console.log('\nAt the current constants: blob sizes and compression (median per board, bytes)');
  console.log('  board                              blob  deflate-raw   gzip  saved');
  const current = [
    ...(await measureCandidate(games2D, {})).played,
    ...(await measureCandidate(games3D, {})).played,
  ];
  const byBoard = {};
  for (const g of current) {
    const b = g.replay.blob;
    (byBoard[g.replay.listing.boardKey] ??= []).push([b.length, await compressedSize(b, 'deflate-raw'), await compressedSize(b, 'gzip')]);
  }
  let raw = 0, deflated = 0;
  for (const [key, rows] of Object.entries(byBoard)) {
    const med = (i) => quantile(rows.map((r) => r[i]), 0.5);
    raw += rows.reduce((s, r) => s + r[0], 0); deflated += rows.reduce((s, r) => s + r[1], 0);
    console.log(`  ${key.padEnd(32)} ${String(med(0)).padStart(6)} ${String(med(1)).padStart(10)} ${String(med(2)).padStart(6)}  ${((1 - med(1) / med(0)) * 100).toFixed(0).padStart(3)} %`);
  }
  console.log(`  all games: deflate-raw saves ${((1 - deflated / raw) * 100).toFixed(1)} %`);

  const rate = (mode3D) => Math.max(...current.filter((g) => (g.replay.listing.mode === MODE_3D) === mode3D).map((g) => movementBytes(g.replay.blob) / (g.summary.elapsedMs / 60000)));
  for (const [name, perMinute] of [['3D', rate(true)], ['2D', rate(false)]]) {
    console.log(`Movement cap ${MOVEMENT_CAP_BYTES} bytes: the busiest ${name} game records ${(perMinute / 1024).toFixed(1)} KB a minute; the cap holds ${(MOVEMENT_CAP_BYTES / perMinute / 60).toFixed(1)} hours of it`);
  }
}

async function writeFixtures() {
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const dir = new URL('../tests/fixtures/replays/', import.meta.url);
  mkdirSync(dir, { recursive: true });
  const index = [];
  for (const spec of FIXTURE_GAMES) {
    const game = await playGame(spec);
    const file = `${spec.kind}-${spec.board}-${spec.outcome}.msrp`;
    writeFileSync(new URL(file, dir), game.replay.blob);
    index.push({ file, note: spec.note });
    console.log(`${file}: ${game.replay.blob.length} bytes`);
  }
  writeFileSync(new URL('index.json', dir), `${JSON.stringify(index, null, 2)}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes('--write-fixtures')) await writeFixtures();
  else await report();
}
