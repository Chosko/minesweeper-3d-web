// 3D capture (js/replay/sampler-3d.js, js/mode3d/session.js, js/shell/mode-3d.js): the camera in
// cell units and its yaw and pitch, quantised; the view mode; the sampler's schedule on the game
// clock; a recorded 3D game — flags before the first reveal at time 0 — sealed through the session
// with a fake clock; a no-guess failure played standard; and the replay beside the summary in the
// 3D adapter's finished and abandoned reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  cameraSample, viewMode, createSampler3D, SAMPLE_INTERVAL_MS, POSITION_STEPS, ANGLE_STEPS, VIEW_MODE,
} from '../js/replay/sampler-3d.js';
import { createSession as openSession } from '../js/mode3d/session.js';

// A session whose standard board is placed by the fake client's place(), as the worker would answer.
const createSession = (options) => openSession({ place: options.client?.place, ...options });
import { create3DMode, END_DELAY_MS } from '../js/shell/mode-3d.js';
import { createModeHost } from '../js/shell/mode-host.js';
import { decodeReplay, cellStateDigest } from '../js/replay/format.js';
import { verify } from '../js/replay/verify.js';
import { createSimulator } from '../js/replay/simulator.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { buildSummary } from '../js/records/summary.js';
import { boardKey, MODE_3D } from '../js/records/board.js';
import { FlyCamera, OrbitCamera, KeyLook, KeyActions, MouseActions } from '../js/input.js';

const settle = () => new Promise((r) => setTimeout(r, 0));

// 5 × 1 × 1 with mines at 0 and 2: the first click at 4 opens 4 and 3 (a 1), revealing 1 wins.
const ROW = Object.freeze({ X: 5, Y: 1, Z: 1, mines: 2, noGuess: false });
const MINES = [0, 2];

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

// Answers every board request — and places every standard board — with MINES, or with the queued
// results first.
function fakeClient(queue = []) {
  const client = {
    requests: [],
    place(req) {
      client.requests.push(req);
      return queue.shift() ?? { ok: true, mines: MINES, seed: req.seed, generatorVersion: 1 };
    },
    request(req) { return Promise.resolve(client.place(req)); },
    cancel() {},
  };
  return client;
}

const camera = (x = 0, y = 0, z = 0, yaw = Math.PI, pitch = 0) => ({ x, y, z, yaw, pitch });
const keys = (shift = false, space = false, ctrl = false) => ({ shift, space, ctrl });

// The summary the 3D adapter builds of the session's game, here built directly.
function summaryOf(session, outcome) {
  const engine = outcome === 'abandoned' ? session.counts() : session.engineSummary();
  const { X, Y, Z, mines, noGuess } = session.board;
  const elapsedMs = session.elapsedMs();
  return buildSummary({
    engine,
    elapsedMs,
    pauses: session.pauses(elapsedMs),
    board: { mode: MODE_3D, width: X, height: Y, depth: Z, mines, noGuess },
    seed: session.seed,
    generatorVersion: session.generatorVersion,
    id: 'game-1',
  });
}

function replayAgain(replay) {
  const { graph, profile, mines } = replay.header;
  const game = createGameWithMines({ graph: createBoxGrid(graph.x, graph.y, graph.z).graph, profile: profile.id, version: profile.version, mines });
  for (const a of replay.actions) {
    if (a.kind === 'reveal') game.reveal(a.cell);
    else if (a.kind === 'flag') game.toggleFlag(a.cell);
    else game.chord(a.cell);
  }
  return game;
}

// ---------- the camera sample and the view mode ----------

test('cameraSample: the camera position in cell units and its yaw and pitch, quantised', () => {
  const board = { X: 5, Y: 3, Z: 2 };
  for (const spacing of [1.1, 2]) {
    const p = 4 * spacing;
    // the centre of cell (i, j, k) is at ((i - (X - 1) / 2) p, (j - (Y - 1) / 2) p, (k - (Z - 1) / 2) p)
    const at = (i, j, k, yaw, pitch) => cameraSample(camera((i - 2) * p, (j - 1) * p, (k - 0.5) * p, yaw, pitch), board, spacing);
    assert.deepEqual(at(0, 0, 0, 0, 0), [0, 0, 0, 0, 0]);
    assert.deepEqual(at(4, 2, 1, Math.PI, 0), [4 * POSITION_STEPS, 2 * POSITION_STEPS, POSITION_STEPS, ANGLE_STEPS / 2, 0]);
    assert.deepEqual(at(2.5, -3, 0.25, 0, -Math.PI / 2), [2.5 * POSITION_STEPS, -3 * POSITION_STEPS, 0.25 * POSITION_STEPS, 0, -ANGLE_STEPS / 4], 'off the board too');
  }
  const v = cameraSample(camera(1.234, -5.678, 9.1011, 7.3, 0.4321), board, 1.1);
  assert.equal(v.length, 5);
  for (const x of v) assert.ok(Number.isInteger(x));
  assert.deepEqual(cameraSample(camera(0, 0, 0, Math.PI * 6, 0), board, 1)[3], ANGLE_STEPS * 3, 'yaw keeps its turns');
});

test('viewMode: Shift, Space and Ctrl as bits', () => {
  assert.equal(viewMode(keys()), 0);
  assert.equal(viewMode(keys(true)), VIEW_MODE.shift);
  assert.equal(viewMode(keys(false, true)), VIEW_MODE.space);
  assert.equal(viewMode(keys(false, false, true)), VIEW_MODE.ctrl);
  assert.equal(viewMode(keys(true, true, true)), VIEW_MODE.shift | VIEW_MODE.space | VIEW_MODE.ctrl);
  assert.deepEqual(new Set(Object.values(VIEW_MODE)).size, 3);
});

// ---------- a recorded game on a real session ----------

test('a recorded 3D game: flags before the first reveal at time 0, samples about 10 times a second and view modes on the game clock, a pause in it, sealed at the win', async () => {
  const clock = fakeClock();
  const session = createSession({ board: ROW, client: fakeClient(), clock, randomSeed: () => 7 });
  const cam = camera();
  const held = keys();
  let spacing = 1;
  const sampler = createSampler3D({ session, camera: cam, controls: held, spacing: () => spacing });
  let finished = 0;
  session.on('finished', () => { finished += 1; });

  assert.equal(SAMPLE_INTERVAL_MS, 100);
  assert.equal(session.recording, false, 'not before the first reveal');
  sampler.tick();
  session.toggleFlag(0);
  session.toggleFlag(1);
  session.toggleFlag(1); // unflagged again: both toggles reach the engine and are recorded
  session.chord(3); // nothing happens before the first reveal: not recorded
  session.reveal(0); // a flagged cell: nothing happens, not recorded
  clock.advance(500); // time before the board is no game time
  await session.reveal(4);
  assert.equal(session.state, 'playing');
  assert.equal(session.recording, true);

  const p = 4 * spacing; // camera at the centre of cell (i, 0, 0) is x = (i - 2) p
  cam.x = 2 * p; sampler.tick(); // t 0: a sample, and the view mode 0
  clock.advance(60); cam.x = 1 * p; sampler.tick(); // t 60: too soon
  clock.advance(50); held.shift = true; sampler.tick(); // t 110: a sample and Shift
  sampler.tick(); // the same time: nothing
  clock.advance(100); held.shift = false; held.space = true; sampler.tick(); // t 210: the same camera, Space

  session.pause();
  assert.equal(session.recording, false, 'not while paused');
  clock.advance(5000); cam.yaw = 0; held.space = false; sampler.tick();
  session.resume();
  clock.advance(100); sampler.tick(); // t 5310: the camera turned and the view mode changed while paused

  session.reveal(4); // t 5310: changes nothing, still recorded, later by the paused span
  clock.advance(100);
  session.reveal(1); // t 5410: the win
  assert.equal(finished, 1);
  assert.equal(session.state, 'won');
  assert.equal(session.recording, false, 'not after the end');
  clock.advance(200); cam.y = 5; held.ctrl = true; sampler.tick();

  const summary = summaryOf(session, 'won');
  const replay = session.replay(summary);
  assert.ok(replay && replay.blob instanceof Uint8Array);
  assert.equal(replay.listing.id, summary.id);
  assert.equal(replay.listing.outcome, 'won');
  assert.equal(replay.listing.elapsedMs, 5410, 'the clock ran through the pause');
  assert.deepEqual([summary.pauses, summary.pausedMs], [1, 5000]);
  assert.equal(session.replay(summary), replay, 'sealing again returns the same replay');

  const decoded = decodeReplay(replay.blob);
  assert.equal(decoded.header.id, summary.id);
  assert.equal(decoded.header.mode, '3d');
  assert.deepEqual(decoded.header.graph, { kind: 'box', x: 5, y: 1, z: 1 });
  assert.equal(boardKey(decoded.header.board), boardKey(summary.board));
  assert.deepEqual(decoded.header.profile, { id: 'minesweeper-3d', version: 2 });
  assert.deepEqual(decoded.header.mines, MINES);
  assert.equal(decoded.header.seed, 7);
  assert.equal(decoded.header.movementEndedAt, null);
  assert.deepEqual(decoded.header.pauses, [{ start: 210, end: 5210 }], 'the pause span on the game clock');
  assert.deepEqual(decoded.actions, [
    { time: 0, kind: 'flag', cell: 0 },
    { time: 0, kind: 'flag', cell: 1 },
    { time: 0, kind: 'flag', cell: 1 },
    { time: 0, kind: 'reveal', cell: 4 },
    { time: 5310, kind: 'reveal', cell: 4 },
    { time: 5410, kind: 'reveal', cell: 1 },
  ]);
  const S = POSITION_STEPS, half = ANGLE_STEPS / 2;
  assert.deepEqual(decoded.movement, [
    { time: 0, type: 'sample', values: [4 * S, 0, 0, half, 0] },
    { time: 0, type: 'view', mode: 0 },
    { time: 110, type: 'sample', values: [3 * S, 0, 0, half, 0] },
    { time: 110, type: 'view', mode: VIEW_MODE.shift },
    { time: 210, type: 'view', mode: VIEW_MODE.space },
    { time: 5310, type: 'sample', values: [3 * S, 0, 0, 0, 0] },
    { time: 5310, type: 'view', mode: 0 },
  ]);
  const again = replayAgain(decoded);
  assert.equal(cellStateDigest(again.state), decoded.check.digest);
  assert.deepEqual(again.summary().clicks, decoded.check.clicks);
  assert.deepEqual(decoded.check.clicks, summary.clicks);
  assert.equal(decoded.check.elapsedMs, 5410);
});

test('a lost 3D game and an abandoned one reproduce their check values', async () => {
  const lost = createSession({ board: ROW, client: fakeClient(), clock: fakeClock(), randomSeed: () => 3 });
  lost.toggleFlag(1);
  await lost.reveal(4);
  lost.toggleFlag(1);
  lost.reveal(2); // a mine
  assert.equal(lost.state, 'lost');
  let decoded = decodeReplay(lost.replay(summaryOf(lost, 'lost')).blob);
  assert.equal(decoded.check.outcome, 'lost');
  let again = replayAgain(decoded);
  assert.equal(cellStateDigest(again.state), decoded.check.digest);
  assert.deepEqual(again.summary().clicks, decoded.check.clicks);

  const clock = fakeClock();
  const left = createSession({ board: ROW, client: fakeClient(), clock, randomSeed: () => 3 });
  await left.reveal(4);
  clock.advance(250);
  left.toggleFlag(0);
  const summary = summaryOf(left, 'abandoned');
  decoded = decodeReplay(left.replay(summary).blob);
  assert.equal(decoded.check.outcome, 'abandoned');
  assert.deepEqual(decoded.actions, [{ time: 0, kind: 'reveal', cell: 4 }, { time: 250, kind: 'flag', cell: 0 }]);
  again = replayAgain(decoded);
  assert.equal(cellStateDigest(again.state), decoded.check.digest);
});

test('a 3D game played with keyboard look and the keyboard keys records and replays like a mouse game', async () => {
  const clock = fakeClock();
  const session = createSession({ board: ROW, client: fakeClient(), clock, randomSeed: () => 9 });
  const cam = new FlyCamera();
  const look = new KeyLook();
  const held = keys();
  const sampler = createSampler3D({ session, camera: cam, controls: held, spacing: () => 1 });
  let aimed = -1;
  let pending = null;
  const act = { left: (c) => session.reveal(c), right: (c) => session.toggleFlag(c), chord: (c) => session.chord(c) };
  const mouse = new MouseActions((type) => { pending = act[type](aimed); }, () => aimed >= 0);
  const keyboard = new KeyActions(mouse);
  const press = async (...codes) => {
    for (const c of codes) keyboard.down(c);
    for (const c of codes) keyboard.up(c);
    await pending;
  };
  /** Hold the arrows for `ms` of game time in 100 ms frames, sampling the camera each frame. */
  const turn = (ms, x, y) => {
    for (let t = 0; t < ms; t += 100) { clock.advance(100); look.update(cam, 0.1, x, y); sampler.tick(); }
  };

  aimed = 4;
  await press('Enter'); // the first reveal: 4 opens 4 and 3
  assert.equal(session.state, 'playing');
  sampler.tick();
  turn(300, 1, 0); // ArrowRight
  aimed = 2;
  await press('Quote'); // flag the mine at 2
  turn(200, 0, -1); // ArrowUp
  aimed = 3;
  await press('Enter', 'Quote'); // chord the 1 at 3: its flag is placed, nothing left to open
  turn(200, -1, 1);
  aimed = 1;
  await press('Enter'); // the win
  assert.equal(session.state, 'won');

  const summary = summaryOf(session, 'won');
  const decoded = decodeReplay(session.replay(summary).blob);
  assert.deepEqual(decoded.actions.map((a) => [a.kind, a.cell]), [['reveal', 4], ['flag', 2], ['chord', 3], ['reveal', 1]],
    'actions by cell, as the mouse records them');
  const samples = decoded.movement.filter((m) => m.type === 'sample');
  assert.ok(samples.length >= 6, 'the camera sampled while the arrows turned it');
  assert.ok(new Set(samples.map((m) => m.values[3])).size > 2, 'the yaw moved');
  assert.ok(new Set(samples.map((m) => m.values[4])).size > 1, 'the pitch moved');
  assert.deepEqual(verify(decoded), { ok: true, result: 'reproduces' });
  const again = replayAgain(decoded);
  assert.equal(cellStateDigest(again.state), decoded.check.digest);
  assert.deepEqual(decoded.check.clicks, summary.clicks, 'a key action counts as the mouse action it replaces');
});

test('an Orbit game records its camera as ordinary position, yaw and pitch samples and replays to the same final state', async () => {
  const clock = fakeClock();
  const session = createSession({ board: ROW, client: fakeClient(), clock, randomSeed: () => 9 });
  const cam = new FlyCamera();
  const orbit = new OrbitCamera(cam);
  orbit.setRange({ min: 4, max: 200 });
  cam.place({ x: 0, y: 10, z: -60, yaw: Math.PI, pitch: 0.2 });
  orbit.enter();
  const held = keys();
  const sampler = createSampler3D({ session, camera: cam, controls: held, spacing: () => 1 });
  let aimed = -1;
  let pending = null;
  const act = { left: (c) => session.reveal(c), right: (c) => session.toggleFlag(c), chord: (c) => session.chord(c) };
  const mouse = new MouseActions((type) => { pending = act[type](aimed); }, () => aimed >= 0);
  const click = async (...buttons) => {
    for (const b of buttons) mouse.down(b);
    for (const b of buttons) mouse.up(b);
    await pending;
  };
  const frames = (ms, step) => { for (let t = 0; t < ms; t += 100) { clock.advance(100); step(); sampler.tick(); } };

  aimed = 4;
  await click(0); // the first reveal: 4 opens 4 and 3
  sampler.tick();
  frames(300, () => orbit.look(40, 5)); // rotate with the mouse
  aimed = 2;
  await click(2); // flag the mine at 2
  frames(300, () => orbit.dollyAxis(0.1, 1)); // dolly in (W)
  frames(200, () => orbit.wheel(-1)); // and out with the wheel
  aimed = 1;
  await click(0); // the win
  assert.equal(session.state, 'won');

  const summary = summaryOf(session, 'won');
  const decoded = decodeReplay(session.replay(summary).blob);
  assert.deepEqual(decoded.actions.map((a) => [a.kind, a.cell]), [['reveal', 4], ['flag', 2], ['reveal', 1]]);
  const samples = decoded.movement.filter((m) => m.type === 'sample');
  assert.ok(samples.length >= 8, 'the orbit sampled every frame it moved');
  assert.ok(new Set(samples.map((m) => m.values[3])).size > 2, 'the yaw moved');
  const last = samples.at(-1).values;
  assert.deepEqual(last, cameraSample(cam, ROW, 1), 'the last sample is the camera as it ended');
  const distances = new Set(samples.map((m) => Math.round(Math.hypot(...m.values.slice(0, 3)))));
  assert.ok(distances.size > 2, 'the dolly moved the camera along its view line');
  assert.deepEqual(verify(decoded), { ok: true, result: 'reproduces' });
  assert.equal(cellStateDigest(replayAgain(decoded).state), decoded.check.digest);
});

test('a 3D game under rules version 2 with a flag-all, a hand unflag of one of its flags and the undo verifies, and seeks both ways as it was played', async () => {
  // 4 × 3 × 1 with mines at the corners: 6 is a 2 whose closed neighbours are 1 2 3 7 9 10 11
  const BOARD = Object.freeze({ X: 4, Y: 3, Z: 1, mines: 4, noGuess: false });
  const mines = [0, 3, 8, 11];
  const clock = fakeClock();
  const session = createSession({
    board: BOARD, client: fakeClient([{ ok: true, mines, seed: 5, generatorVersion: 1 }]), clock, randomSeed: () => 5,
  });
  await session.reveal(5);
  const live = [];
  const act = (fn) => { clock.advance(100); fn(); live.push(Array.from(session.view.flagged)); };
  act(() => session.reveal(6));
  act(() => session.toggleFlag(6)); // the flag-all: 1 2 3 7 9 10 11
  act(() => session.toggleFlag(7)); // a hand unflag of one of its flags
  act(() => session.toggleFlag(7)); // flagged again by hand
  act(() => session.toggleFlag(6)); // the undo: 7 stays
  const flagged = (row) => row.flatMap((f, c) => (f ? [c] : []));
  assert.deepEqual(flagged(live.at(-1)), [7]);
  const decoded = decodeReplay(session.replay(summaryOf(session, 'abandoned')).blob);
  assert.deepEqual(decoded.header.profile, { id: 'minesweeper-3d', version: 2 });
  assert.deepEqual(verify(decoded), { ok: true, result: 'reproduces' });
  assert.equal(decoded.actions.length, 6);
  // seek over the undo and back, from the start and from periodic snapshots alike
  for (const options of [{}, { snapshotInterval: 2, snapshotMinCells: 1 }]) {
    const sim = createSimulator(decoded, options);
    for (const i of [6, 2, 6, 3, 5, 4, 1, 6]) {
      const frame = sim.seekIndex(i);
      const expected = i < 2 ? new Array(12).fill(0) : live[i - 2]; // no flag before the second action
      assert.deepEqual(Array.from(frame.state.flagged), expected, `flags at action ${i}`);
    }
  }
});

test('a restarted session discards its recording, a left one stops it; before the first reveal there is nothing to seal', async () => {
  const session = createSession({ board: ROW, client: fakeClient(), clock: fakeClock(), randomSeed: () => 7 });
  session.toggleFlag(0);
  assert.equal(session.replay(null), null, 'no summary, no replay');

  await session.reveal(4);
  const summary = summaryOf(session, 'abandoned');
  session.restart();
  assert.equal(session.state, 'ready');
  assert.equal(session.replay(summary), null, 'the restart discarded the recording');
  await session.reveal(4);
  const fresh = decodeReplay(session.replay(summaryOf(session, 'abandoned')).blob);
  assert.deepEqual(fresh.actions, [{ time: 0, kind: 'reveal', cell: 4 }], 'the new box records afresh');

  const clock2 = fakeClock();
  const other = createSession({ board: ROW, client: fakeClient(), clock: clock2, randomSeed: () => 7 });
  await other.reveal(4);
  const s = summaryOf(other, 'abandoned');
  clock2.advance(300);
  other.leave();
  assert.equal(other.recording, false);
  assert.equal(other.toggleFlag(0), null, 'no action after leave');
  const left = decodeReplay(other.replay(s).blob);
  assert.deepEqual(left.actions, [{ time: 0, kind: 'reveal', cell: 4 }], 'leave stops the recording; it seals what was recorded');
});

test('a no-guess board that failed and was played standard records the standard board, with its early flags and first reveal', async () => {
  const client = fakeClient([{ ok: false, reason: 'no-guess board not found' }]);
  const session = createSession({ board: { ...ROW, noGuess: true }, client, clock: fakeClock(), randomSeed: () => 9 });
  session.toggleFlag(0);
  await session.reveal(4);
  assert.equal(session.state, 'failed');
  await session.playStandard();
  assert.equal(session.state, 'playing');
  assert.equal(session.board.noGuess, false);
  const summary = summaryOf(session, 'abandoned');
  const decoded = decodeReplay(session.replay(summary).blob);
  assert.equal(decoded.header.board.noGuess, false);
  assert.equal(boardKey(decoded.header.board), boardKey(summary.board));
  assert.deepEqual(decoded.actions, [{ time: 0, kind: 'flag', cell: 0 }, { time: 0, kind: 'reveal', cell: 4 }]);
});

test('a fixed board (the debug hook) records its actions but has no summary to seal with', () => {
  const session = createSession({ board: { ...ROW, minePositions: MINES }, client: fakeClient(), clock: fakeClock() });
  session.reveal(4);
  assert.equal(session.recording, true);
  assert.equal(session.replay(null), null);
});

test('the sampler keeps to its schedule across frame jitter: 10 samples a second at 60 frames a second', () => {
  let t = 0;
  let n = 0;
  const views = [];
  const session = {
    recording: true,
    board: { X: 4, Y: 4, Z: 4 },
    elapsedMs: () => t,
    recordSample() { n += 1; },
    recordView(mode) { views.push(mode); },
  };
  const cam = camera();
  const sampler = createSampler3D({ session, camera: cam, controls: keys(), spacing: () => 1.1 });
  for (let f = 0; f < 60; f++) { t = Math.round(f * (1000 / 60)) + (f % 3); cam.x = f; sampler.tick(); }
  assert.equal(n, 10);
  assert.ok(views.length >= 1 && views.every((m) => m === 0), 'the view mode is offered at every tick; the recorder keeps a change');
  session.recording = false;
  t += 1000; sampler.tick();
  assert.equal(n, 10, 'nothing while the session does not record');
});

// ---------- the 3D adapter ----------

// A shell flow over real sessions: start and restart open a session on ROW with the fake clock and
// client, and sampler(session) hands back a recording fake sampler.
function shell3D() {
  const host = createModeHost();
  const handed = { finished: [], abandoned: [] };
  host.on('finished', (e) => handed.finished.push(e));
  host.on('abandoned', (e) => handed.abandoned.push(e));
  const clock = fakeClock();
  const samplers = [];
  const open = () => createSession({ board: ROW, client: fakeClient(), clock, randomSeed: () => 7 });
  const flow = {
    openBoardChoice() {},
    start: () => open(),
    pause() {},
    resume() {},
    restart: () => open(),
    leave() {},
    contextLost: () => false,
    clock,
    sampler(session) {
      const s = { session, ticks: 0, destroyed: false, tick() { s.ticks += 1; }, destroy() { s.destroyed = true; } };
      samplers.push(s);
      return s;
    },
  };
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  return { host, mode, handed, clock, samplers };
}

test('the 3D adapter: finished carries the replay beside the summary; tick() drives the sampler', async () => {
  const { host, mode, handed, clock, samplers } = shell3D();
  host.start('3d', ROW);
  assert.equal(samplers.length, 1, 'one sampler per session');
  mode.tick();
  assert.equal(samplers[0].ticks, 1);

  const { session } = samplers[0];
  session.toggleFlag(0);
  await session.reveal(4);
  clock.advance(400);
  session.reveal(1);
  await settle();
  assert.equal(handed.finished.length, 0, 'the end effect plays first');
  clock.advance(END_DELAY_MS);
  assert.equal(handed.finished.length, 1);
  const { summary, replay, mode: id } = handed.finished[0];
  assert.equal(id, '3d');
  assert.equal(summary.outcome, 'won');
  assert.equal(replay.listing.id, summary.id);
  const decoded = decodeReplay(replay.blob);
  assert.equal(decoded.check.elapsedMs, 400);
  assert.equal(decoded.actions.length, 3);
  assert.equal(mode.replay(summary), replay, 'the same replay, sealed once');
  host.leave();
  assert.equal(handed.abandoned.length, 0, 'a finished game is not abandoned');
  assert.equal(samplers[0].destroyed, true, 'the sampler goes with the session');
  mode.tick(); // no game: nothing to drive
});

test('the 3D adapter: restart and leave report the abandoned game with its replay; before the first reveal nothing', async () => {
  const { host, mode, handed, clock, samplers } = shell3D();
  host.start('3d', ROW);
  samplers[0].session.toggleFlag(0);
  host.restart();
  assert.equal(handed.abandoned.length, 0, 'nothing before the first reveal');
  assert.equal(samplers[0].destroyed, true);
  assert.equal(mode.replay(null), null);

  const session = samplers[1].session;
  await session.reveal(4);
  clock.advance(1200);
  session.toggleFlag(0);
  host.restart();
  assert.equal(handed.abandoned.length, 1);
  let { summary, replay } = handed.abandoned[0];
  assert.equal(summary.outcome, 'abandoned');
  assert.equal(replay.listing.id, summary.id);
  assert.equal(replay.listing.outcome, 'abandoned');
  assert.deepEqual(decodeReplay(replay.blob).actions, [{ time: 0, kind: 'reveal', cell: 4 }, { time: 1200, kind: 'flag', cell: 0 }]);

  const next = samplers[2].session;
  await next.reveal(4);
  clock.advance(100);
  host.leave();
  assert.equal(handed.abandoned.length, 2);
  ({ summary, replay } = handed.abandoned[1]);
  assert.notEqual(summary.id, handed.abandoned[0].summary.id);
  assert.equal(replay.listing.id, summary.id);
});

test('the 3D adapter: a game whose graphics context was lost after its first reveal is abandoned with its replay', async () => {
  const { host, mode, handed, clock, samplers } = shell3D();
  host.start('3d', ROW);
  const { session } = samplers[0];
  await session.reveal(4);
  clock.advance(700);
  session.toggleFlag(0);
  mode.contextLost();
  assert.equal(session.state, 'left');
  host.leave();
  assert.equal(handed.abandoned.length, 1);
  const { summary, replay } = handed.abandoned[0];
  assert.equal(summary.outcome, 'abandoned');
  assert.ok(replay, 'the replay survives the lost context');
  assert.equal(replay.listing.id, summary.id);
  assert.deepEqual(decodeReplay(replay.blob).actions, [{ time: 0, kind: 'reveal', cell: 4 }, { time: 700, kind: 'flag', cell: 0 }]);
});
