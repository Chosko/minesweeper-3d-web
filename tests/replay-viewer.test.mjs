// Replay viewer (replay-playback): the playback clock (js/replay/clock.js), its displayed format and the
// end-of-replay line, the overlay figures, the 2D viewer's movement interpolation and drawing
// (js/replay/viewer-2d.js), the viewer screen's open, verify, failure, control, key and controller
// logic (js/replay/viewer.js) over fake views and a fake library, its markup and its wiring in
// js/main.js, and in a browser a recorded 2D replay from tests/fixtures/replays/ played through to the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { SPEEDS, DEFAULT_SPEED, createPlaybackClock } from '../js/replay/clock.js';
import { movementTrack, pointerAt, cursorAt, pointerPixel, createViewer2D } from '../js/replay/viewer-2d.js';
import {
  FAILURES, REPLAY_KEYS, REPLAY_PAD, SEEK_STEP_MIN_MS, seekStep, clockText, overlayFigures, endLine, pauseMarks, pausesText, prepareReplay, createReplayViewer,
} from '../js/replay/viewer.js';
import { createSimulator, REFUSAL } from '../js/replay/simulator.js';
import { decodeReplay, encodeReplay, REPLAY_FORMAT_VERSION } from '../js/replay/format.js';
import { formatOverlayTime, formatMineCount } from '../js/ui/components.js';
import { formatTime, DASH } from '../js/results/view.js';
import { REPLAY_SCREEN } from '../js/records/replay-list.js';
import { BTN } from '../js/gamepad.js';
import { CELL } from '../js/engine/rules.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const blobOf = (file) => new Uint8Array(readFileSync(new URL(file, FIXTURES)));
const WON = '2d-beginner-won.msrp';
const LOST = '2d-intermediate-lost.msrp';
const CUBE = '3d-cube-beginner-lost.msrp';

// ---------------------------------------------------------------- the playback clock

test('the clock offers 0.5×, 1×, 2× and 4× and starts paused at 0 at 1×', () => {
  assert.deepEqual(SPEEDS, [0.5, 1, 2, 4]);
  assert.equal(DEFAULT_SPEED, 1);
  const c = createPlaybackClock({ duration: 10000 });
  assert.deepEqual([c.time, c.playing, c.speed, c.ended, c.duration], [0, false, 1, false, 10000]);
});

test('while playing the clock advances replay time at the chosen speed', () => {
  const c = createPlaybackClock({ duration: 100000 });
  c.advance(1000);
  assert.equal(c.time, 0, 'a paused clock does not move');
  c.play();
  const expected = [];
  let t = 0;
  for (const s of SPEEDS) {
    c.setSpeed(s);
    c.advance(1000);
    t += 1000 * s;
    expected.push(t);
    assert.equal(c.time, t, `${s}×`);
  }
  assert.deepEqual(expected, [500, 1500, 3500, 7500]);
  c.pause();
  c.advance(1000);
  assert.equal(c.time, 7500, 'pause stops the clock');
  c.toggle();
  assert.equal(c.playing, true);
  c.toggle();
  assert.equal(c.playing, false);
});

test('the clock stops at the end, and play then restarts from the beginning', () => {
  const c = createPlaybackClock({ duration: 3000, speed: 2 });
  c.play();
  assert.equal(c.advance(1000), 2000);
  assert.equal(c.advance(1000), 3000, 'held at the duration');
  assert.equal(c.playing, false);
  assert.equal(c.ended, true);
  c.advance(1000);
  assert.equal(c.time, 3000);
  c.play();
  assert.deepEqual([c.time, c.playing, c.ended], [0, true, false], 'play at the end starts again');
});

test('seek clamps to the replay, speeds outside the list are refused, faster and slower stop at the ends', () => {
  const c = createPlaybackClock({ duration: 5000 });
  c.seek(-10);
  assert.equal(c.time, 0);
  c.play();
  c.seek(99999);
  assert.deepEqual([c.time, c.playing, c.ended], [5000, false, true], 'seeking to the end ends playback');
  c.seek(1200);
  assert.equal(c.ended, false);
  assert.throws(() => c.setSpeed(3), RangeError);
  assert.throws(() => c.seek(NaN), RangeError);
  assert.throws(() => createPlaybackClock({ duration: 1, speed: 8 }), RangeError);
  for (let i = 0; i < 5; i++) c.faster();
  assert.equal(c.speed, 4);
  for (let i = 0; i < 5; i++) c.slower();
  assert.equal(c.speed, 0.5);
  c.faster();
  assert.equal(c.speed, 1);
});

// ---------------------------------------------------------------- what the viewer shows

test('the replay clock shows the in-game overlay timer format', () => {
  for (const ms of [0, 999, 1000, 47380, 998999, 999999, 1_200_000]) assert.equal(clockText(ms), formatOverlayTime(ms / 1000), `${ms} ms`);
  assert.equal(clockText(47380), '047');
  assert.equal(clockText(1_200_000), '999', 'stops at 999');
});

test('the overlay reads mines left, 3BV solved of 3BV and 3BV/s so far from the frame', () => {
  const frame = { minesLeft: -3, bbbv: 20, bbbvSolved: 5 };
  assert.deepEqual(overlayFigures(frame, 2000), { clock: '002', mines: formatMineCount(-3), bbbv: '5 / 20', rate: '2.50' });
  assert.equal(overlayFigures(frame, 0).rate, DASH, 'no rate before any time has passed');
  assert.equal(overlayFigures({ minesLeft: 1500, bbbv: 1, bbbvSolved: 0 }, 1000).mines, '1500', 'the real count past 999');
});

test('the end of a replay shows its outcome and recorded time in the results time format', () => {
  const sim = createSimulator(blobOf(WON));
  const end = endLine(sim.replay.check);
  assert.deepEqual(end, { outcome: 'Won', time: formatTime(9971), text: 'Won · 9.971 s' }, 'to the thousandth');
  assert.equal(endLine({ outcome: 'lost', elapsedMs: 14522 }).text, 'Lost · 14.522 s');
  assert.equal(endLine({ outcome: 'abandoned', elapsedMs: 120 }).text, 'Abandoned · 0.120 s');
});

test('the seek bar names its place in the results time format; the running clock keeps whole seconds', () => {
  const src = read('js/replay/viewer.js');
  assert.match(src, /aria-valuetext', `\$\{formatTime\(state\.time\)\} of \$\{formatTime\(state\.duration\)\}`/);
  assert.equal(formatTime(4321), '4.321 s');
  assert.equal(clockText(4321), '004', 'the overlay timer\'s whole seconds');
});

// ---------------------------------------------------------------- movement interpolation

const movement = [
  { time: 0, type: 'cursor', cell: 4 },
  { time: 100, type: 'sample', values: [64, 128] },
  { time: 150, type: 'sample', values: [128, 0] },
  { time: 400, type: 'cursor', cell: 7 },
  { time: 500, type: 'sample', values: [-64, 640] },
];

test('the recorded pointer holds each sample, then interpolates over the last interval before the next, in cells', () => {
  const track = movementTrack(movement, 50);
  assert.equal(track.interval, 50);
  assert.equal(pointerAt(track, 0), null, 'no pointer before the first sample');
  assert.equal(pointerAt(track, 99.9), null);
  assert.deepEqual(pointerAt(track, 100), [1, 2]);
  assert.deepEqual(pointerAt(track, 125), [1.5, 1], 'a gap of exactly one interval interpolates throughout');
  assert.deepEqual(pointerAt(track, 150), [2, 0]);
  assert.deepEqual(pointerAt(track, 325), [2, 0], 'a still stretch holds the earlier sample');
  assert.deepEqual(pointerAt(track, 450), [2, 0], 'held until one interval before the next sample');
  assert.deepEqual(pointerAt(track, 475), [0.5, 5], 'then interpolated linearly to it');
  assert.deepEqual(pointerAt(track, 500), [-1, 10], 'off the board stays off the board');
  assert.deepEqual(pointerAt(track, 9000), [-1, 10], 'the last sample holds');
  assert.equal(pointerAt(movementTrack([]), 10), null);
});

test('across a gap shorter than the interval the pointer interpolates throughout', () => {
  const track = movementTrack(movement, 100);
  assert.deepEqual(pointerAt(track, 125), [1.5, 1]);
  assert.deepEqual(pointerAt(track, 399), [2, 0], 'a longer gap holds until one interval before');
  assert.deepEqual(pointerAt(track, 450), [0.5, 5]);
});

test('the pointer track takes the 2D recording interval unless given one; the 2D viewer takes the replay\'s', () => {
  assert.equal(movementTrack(movement).interval, 50);
  const sim = createSimulator(blobOf(WON));
  const v = createViewer2D({ view: fakeView(), sim, pointer: fakePointer() });
  assert.equal(sim.replay.sampleIntervalMs, 50);
  assert.equal(v.track.interval, sim.replay.sampleIntervalMs);
});

test('the recorded ring is the last cursor event at or before the time: its cell while shown, -1 while hidden', () => {
  const recorded = [
    { time: 0, type: 'cursor', cell: -1 }, // a recording opens with the ring hidden
    { time: 100, type: 'sample', values: [64, 128] },
    { time: 200, type: 'cursor', cell: 4 }, // a key showed it
    { time: 400, type: 'cursor', cell: 7 },
    { time: 450, type: 'cursor', cell: -1 }, // the mouse hid it
    { time: 600, type: 'cursor', cell: 7 },
  ];
  const track = movementTrack(recorded);
  assert.deepEqual([0, 199, 200, 399, 400, 449, 450, 599, 600, 1e6].map((t) => cursorAt(track, t)), [-1, -1, 4, 4, 7, 7, -1, -1, 7, 7]);
  assert.equal(cursorAt(movementTrack(recorded.filter((e) => e.type === 'sample')), 1000), -1, 'no cursor recorded: no ring');
});

test('a recording made before the ring could hide shows no ring until its first cursor event after the opening one', () => {
  const track = movementTrack(movement); // opens on cell 4, as the cursor was drawn from the start
  assert.equal(cursorAt(track, 0), -1, 'the opening cell is no ring');
  assert.equal(cursorAt(track, 399), -1);
  assert.equal(cursorAt(track, 400), 7, 'the first move shows it');
  assert.equal(cursorAt(track, 1e6), 7);
  const mouseOnly = movementTrack([{ time: 0, type: 'cursor', cell: 0 }, { time: 50, type: 'sample', values: [0, 0] }]);
  assert.equal(cursorAt(mouseOnly, 0), -1);
  assert.equal(cursorAt(mouseOnly, 1e6), -1, 'a mouse-only game of the old build shows no ring at any point');
});

test('a pointer in cells lands on the canvas through the board layout and scroll', () => {
  const layout = { tile: 40, offsetX: 10, offsetY: 20 };
  assert.deepEqual(pointerPixel(layout, { x: 0, y: 0 }, [1.5, 2]), { x: 70, y: 100 });
  assert.deepEqual(pointerPixel(layout, { x: 30, y: 5 }, [1.5, 2]), { x: 40, y: 95 });
});

// A fake board view: records the game, updates and cursor, as js/classic2d/board-view.js is driven.
function fakeView() {
  const calls = { game: [], update: [], cursor: [], ensure: [] };
  return {
    calls,
    layout: { tile: 40, offsetX: 0, offsetY: 0, scrolls: false, width: 360, height: 360 },
    scroll: { x: 0, y: 0 },
    setGame(g) { calls.game.push(g); },
    update(changed) { calls.update.push([...changed]); },
    setCursor(c) { calls.cursor.push(c); },
    ensureVisible(c) { calls.ensure.push(c); return false; },
    dispose() { calls.disposed = true; },
  };
}
function fakePointer() {
  const at = [];
  return { at, place(x, y) { at.push([x, y]); }, hide() { at.push(null); } };
}

test('the 2D viewer draws the simulator game read-only from its changes, with the pointer and the cursor', () => {
  const sim = createSimulator(blobOf(WON));
  const view = fakeView();
  const pointer = fakePointer();
  const v = createViewer2D({ view, sim, pointer });
  assert.deepEqual(view.calls.game, [sim.game], 'the board view draws the simulator game');
  const f0 = sim.seek(0);
  v.draw(f0);
  assert.deepEqual(view.calls.update[0], [...f0.changed], 'only the changed cells are redrawn');
  assert.ok(f0.changed.length > 0, 'the first reveal opens cells');
  assert.equal(pointer.at.at(-1), null, 'no pointer before its first sample');
  const first = sim.replay.movement.find((e) => e.type === 'sample');
  const f1 = sim.seek(first.time);
  v.draw(f1);
  assert.deepEqual(pointer.at.at(-1), [first.values[0] / 64 * 40, first.values[1] / 64 * 40]);
  assert.equal(view.calls.cursor.at(-1), -1, 'this game recorded no keyboard cursor');
  const back = sim.seek(0);
  v.draw(back);
  assert.deepEqual(view.calls.update.at(-1), [...back.changed], 'a backward seek redraws what it changed back');
  v.destroy();
  assert.equal(view.calls.disposed, undefined, 'the viewer leaves the board view to its owner');
});

test('the 2D viewer draws the recorded ring only while the player used the cursor, the same at any seek as in playback', () => {
  const replay = decodeReplay(blobOf(WON));
  replay.movement = [
    { time: 0, type: 'cursor', cell: -1 }, { time: 100, type: 'cursor', cell: 40 },
    { time: 300, type: 'cursor', cell: 41 }, { time: 500, type: 'cursor', cell: -1 },
  ];
  const sim = createSimulator(replay);
  const times = [0, 10, 150, 300, 450, 600, 900];
  const played = fakeView();
  const v = createViewer2D({ view: played, sim, pointer: fakePointer() });
  for (const t of times) v.draw(sim.seek(t));
  assert.deepEqual(played.calls.cursor, [-1, -1, 40, 41, 41, -1, -1]);
  const sought = fakeView();
  const s2 = createSimulator(replay);
  const w = createViewer2D({ view: sought, sim: s2, pointer: fakePointer() });
  for (const t of [...times].reverse()) w.draw(s2.seek(t));
  assert.deepEqual(sought.calls.cursor, [-1, -1, 41, 41, 40, -1, -1], 'seeking back: each position as in playback');

  const old = decodeReplay(blobOf(WON));
  old.movement = [{ time: 0, type: 'cursor', cell: 40 }, { time: 300, type: 'cursor', cell: 41 }];
  const oldView = fakeView();
  const o = createSimulator(old);
  const ov = createViewer2D({ view: oldView, sim: o, pointer: fakePointer() });
  ov.draw(o.seek(10));
  ov.draw(o.seek(300));
  assert.deepEqual(oldView.calls.cursor, [-1, 41], 'an older recording: no ring until its first move');
});

test('every 2D fixture recorded before the ring hid plays with no ring at any point', () => {
  for (const name of ['2d-beginner-won', '2d-expert-abandoned', '2d-intermediate-lost']) {
    const sim = createSimulator(new Uint8Array(readFileSync(join(ROOT, `tests/fixtures/replays/${name}.msrp`))));
    const view = fakeView();
    const v = createViewer2D({ view, sim, pointer: fakePointer() });
    for (let t = 0; t <= sim.duration; t += Math.max(1, Math.floor(sim.duration / 20))) v.draw(sim.seek(t));
    assert.ok(view.calls.cursor.every((c) => c === -1), `${name}: no ring`);
  }
});

test('a board that fits is never scrolled by the viewer; the board scale reaches its view', () => {
  const view = fakeView();
  view.scales = [];
  view.setScale = (s) => { view.scales.push(s); view.layout = { ...view.layout, tile: 30 }; };
  const replay = decodeReplay(blobOf(WON));
  replay.movement = [{ time: 0, type: 'cursor', cell: -1 }, { time: 10, type: 'cursor', cell: 80 }, ...replay.movement];
  const s = createSimulator(replay);
  const v = createViewer2D({ view, sim: s, pointer: fakePointer() });
  for (const t of [0, 20, 500, s.duration]) v.draw(s.seek(t));
  assert.deepEqual(view.calls.ensure, [], 'no ensureVisible on a board that fits');
  v.setScale('fit');
  assert.deepEqual(view.scales, ['fit']);
});

test('a pointer left in place while paused follows the board view when it refits or scrolls', () => {
  const sim = createSimulator(blobOf(WON));
  const view = fakeView();
  const pointer = fakePointer();
  const v = createViewer2D({ view, sim, pointer });
  const first = sim.replay.movement.find((e) => e.type === 'sample');
  v.draw(sim.seek(first.time));
  const placed = pointer.at.length;
  v.place();
  assert.equal(pointer.at.length, placed, 'nothing moved: the pointer is not placed again');
  view.layout = { ...view.layout, tile: 50, offsetX: 20 };
  v.place();
  assert.deepEqual(pointer.at.at(-1), [20 + first.values[0] / 64 * 50, first.values[1] / 64 * 50], 'refitted');
  view.scroll = { x: 5, y: 7 };
  v.place();
  assert.deepEqual(pointer.at.at(-1), [15 + first.values[0] / 64 * 50, first.values[1] / 64 * 50 - 7], 'scrolled');
});

test('on a board that scrolls, the view follows the recorded pointer, else the cursor', () => {
  const sim = createSimulator(blobOf(WON));
  const view = fakeView();
  view.layout = { ...view.layout, scrolls: true };
  const v = createViewer2D({ view, sim, pointer: fakePointer() });
  const first = sim.replay.movement.find((e) => e.type === 'sample');
  v.draw(sim.seek(first.time));
  const [bx, by] = first.values.map((x) => Math.floor(x / 64));
  assert.deepEqual(view.calls.ensure, [bx + 9 * by]);
});

// ---------------------------------------------------------------- opening and verifying

function fakeLibrary(blobs = {}, { reject = false } = {}) {
  const asked = [];
  return {
    asked,
    load: () => Promise.resolve(),
    bytes(id) { asked.push(id); return reject ? Promise.reject(new Error('read failed')) : Promise.resolve(blobs[id]); },
  };
}

test('a replay opens from its blob, its replay object, the hand-off\'s { blob }, or an id fetched from the library', async () => {
  const blob = blobOf(WON);
  for (const replay of [blob, blob.buffer.slice(0), decodeReplay(blob), { blob, listing: {} }]) {
    const r = await prepareReplay({ replay });
    assert.equal(r.ok, true);
    assert.equal(r.sim.length, 28);
  }
  const library = fakeLibrary({ a: blob });
  const r = await prepareReplay({ replayId: 'a' }, { library });
  assert.equal(r.ok, true);
  assert.deepEqual(library.asked, ['a']);
});

test('every replay is verified first; a refused or failing one says why and is not played', async () => {
  const base = decodeReplay(blobOf(WON));
  const newer = encodeReplay(base, { version: REPLAY_FORMAT_VERSION + 1 });
  const oldRules = decodeReplay(blobOf(WON));
  oldRules.header.profile = { id: 'minesweeper-online', version: 99 };
  const tampered = decodeReplay(blobOf(WON));
  tampered.check.digest ^= 1;
  const cases = [
    [{ replay: newer }, 'newer', FAILURES.newer],
    [{ replay: encodeReplay(oldRules) }, 'newer', FAILURES.newer],
    [{ replay: encodeReplay(tampered) }, 'unreproducible', FAILURES.unreproducible],
    [{ replay: new Uint8Array([1, 2, 3]) }, 'unreadable', FAILURES.unreadable],
    [{ replayId: 'gone' }, 'unreadable', FAILURES.unreadable],
    [{}, 'unreadable', FAILURES.unreadable],
  ];
  for (const [data, reason, message] of cases) {
    const r = await prepareReplay(data, { library: fakeLibrary() });
    assert.deepEqual([r.ok, r.reason, r.message], [false, reason, message], reason);
  }
  const failing = await prepareReplay({ replayId: 'a' }, { library: fakeLibrary({}, { reject: true }) });
  assert.deepEqual([failing.ok, failing.reason], [false, 'unreadable']);
  assert.match(FAILURES.newer, /made by a newer version/);
  assert.match(FAILURES.unreproducible, /can no longer be reproduced/);
  assert.match(FAILURES.unreadable, /cannot be read/);
  assert.equal(FAILURES.newer, createSimulatorMessage(REFUSAL.NEWER));
});
function createSimulatorMessage(reason) {
  try { createSimulator(reason === REFUSAL.NEWER ? encodeReplay(decodeReplay(blobOf(WON)), { version: REPLAY_FORMAT_VERSION + 1 }) : new Uint8Array(1)); } catch (e) { return e.message; }
  return null;
}

// ---------------------------------------------------------------- the viewer screen

/** A fake screen binder: records what the viewer shows. */
function fakeScreen() {
  const log = [];
  const screen = {
    log, last: null, container: { id: 'board' },
    open() { log.push('open'); },
    close() { log.push('close'); },
    loading() { log.push('loading'); },
    failed(message) { log.push(['failed', message]); },
    ready(info) { log.push(['ready', info]); return screen.container; },
    render(state) { screen.last = state; },
  };
  return screen;
}
function fakeRouter() {
  const went = [];
  return { went, current: REPLAY_SCREEN, go(name, opts) { went.push([name, opts]); }, refocus() { went.push('refocus'); } };
}
function fakeViewers() {
  const drawn = [];
  const made = [];
  return {
    drawn, made,
    square: ({ container, sim }) => {
      made.push({ container, sim });
      return { draw: (f) => drawn.push(f), setScale: (scale) => made.push(['scale', scale]), destroy: () => made.push('destroyed') };
    },
  };
}
function viewerOver({ library = fakeLibrary(), viewers = fakeViewers() } = {}) {
  const view = fakeScreen();
  const router = fakeRouter();
  const viewer = createReplayViewer({ library, router, view, viewers });
  return { viewer, view, router, viewers };
}
const RETURN = { screen: 'records', data: { boardKey: 'classic-2d:square:9x9:10:guess' } };

test('the viewer opens a replay, shows the start paused, and Back returns to the screen it came from', async () => {
  const { viewer, view, router, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON), returnTo: RETURN });
  assert.deepEqual(view.log.slice(0, 2), ['open', 'loading']);
  assert.deepEqual(view.log[2], ['ready', { duration: 9971, kind: 'square', pauses: [] }]);
  assert.equal(viewers.made[0].container, view.container, 'the 2D viewer draws in the screen\'s board area');
  assert.equal(viewer.state.status, 'ready');
  assert.deepEqual([view.last.time, view.last.playing, view.last.speed, view.last.end], [0, false, 1, null]);
  assert.equal(view.last.figures.clock, '000');
  assert.equal(viewers.drawn.length, 1, 'the start is drawn');
  assert.ok(router.went.includes('refocus'), 'focus moves to the controls once the replay is ready');
  viewer.setScale('125');
  assert.deepEqual(viewers.made.at(-1), ['scale', '125'], 'a board scale change reaches the open board');
  viewer.back();
  assert.deepEqual(router.went.at(-1), ['records', { data: RETURN.data }]);
  viewer.hide();
  assert.ok(viewers.made.includes('destroyed'));
  viewer.setScale('fit');
  assert.equal(viewers.made.at(-1), 'destroyed', 'with no replay open, nothing to refit');
  assert.equal(view.log.at(-1), 'close');
});

test('a replay that cannot play says why, and Back still works', async () => {
  const { viewer, view, router, viewers } = viewerOver();
  await viewer.show({ replay: new Uint8Array([9, 9]), returnTo: { screen: 'results' } });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unreadable]);
  assert.equal(viewer.state.status, 'failed');
  assert.equal(viewers.made.length, 0);
  viewer.tick(1000);
  viewer.command('toggle');
  assert.equal(viewer.state.playing, false, 'nothing plays');
  viewer.back();
  assert.deepEqual(router.went.at(-1), ['results', { data: undefined }]);
  const bare = viewerOver();
  await bare.viewer.show({ replay: new Uint8Array([9, 9]) });
  bare.viewer.back();
  assert.deepEqual(bare.router.went.at(-1), ['menu', { data: undefined }], 'with nowhere named, Back goes to the menu');
});

test('a replay with no viewer for its board says it cannot be played here', async () => {
  const { viewer, view } = viewerOver({ viewers: {} });
  await viewer.show({ replay: blobOf(WON) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unsupported]);
  assert.match(FAILURES.unsupported, /cannot be played here yet/);
});

test('a 3D replay with no 3D viewer to offer (no WebGL 2) says why, Back still works, and a 2D replay still plays', async () => {
  assert.equal(FAILURES.webgl2, 'This 3D replay needs WebGL 2, which is not available in this browser.');
  const { viewer, view, router, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(CUBE), returnTo: RETURN });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.webgl2]);
  assert.equal(viewer.state.status, 'failed');
  assert.equal(viewer.state.message, FAILURES.webgl2);
  assert.equal(viewers.made.length, 0, 'no viewer mounts');
  assert.ok(router.went.includes('refocus'), 'the focus moves to the message\'s Back');
  viewer.back();
  assert.deepEqual(router.went.at(-1), ['records', { data: RETURN.data }]);
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(viewer.state.status, 'ready', 'a square replay plays');
  assert.equal(viewers.made.length, 1);
});

test('a replay still loading when the screen closes is dropped', async () => {
  const { viewer, viewers } = viewerOver({ library: fakeLibrary({ a: blobOf(WON) }) });
  const opening = viewer.show({ replayId: 'a' });
  viewer.hide();
  await opening;
  assert.equal(viewers.made.length, 0);
  assert.equal(viewer.state.status, 'closed');
});

test('ticks drive the clock and the simulator once per frame while playing, at the chosen speed', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  viewer.tick(500);
  assert.equal(viewers.drawn.length, 1, 'paused: nothing to draw');
  viewer.command('toggle');
  viewer.tick(500);
  assert.equal(view.last.time, 500);
  viewer.setSpeed(2);
  viewer.tick(500);
  assert.equal(view.last.time, 1500);
  assert.equal(viewers.drawn.at(-1).time, 1500, 'the simulator is at the clock');
  assert.equal(viewers.drawn.length, 3);
  const sim = createSimulator(blobOf(WON));
  const expected = sim.seek(1500);
  assert.deepEqual(view.last.figures, overlayFigures(expected, 1500));
  viewer.command('faster');
  assert.equal(view.last.speed, 4);
  viewer.command('slower');
  viewer.command('slower');
  assert.equal(view.last.speed, 1);
});

// ---------------------------------------------------------------- pauses on the seek bar

/** The won fixture with pause spans in its header: the same game, verified as recorded. */
const pausedBlob = (pauses) => {
  const r = decodeReplay(blobOf(WON));
  r.header.pauses = pauses;
  return encodeReplay(r);
};

test('each paused span is a mark on the seek bar track at its position and width over the replay', () => {
  assert.deepEqual(pauseMarks([], 9971), []);
  assert.deepEqual(pauseMarks([{ start: 1000, end: 3000 }, { start: 5000, end: 5000 }], 10000), [
    { left: 10, width: 20 }, { left: 50, width: 0 },
  ]);
  assert.deepEqual(pauseMarks([{ start: 0, end: 4000 }], 8000), [{ left: 0, width: 50 }]);
  assert.deepEqual(pauseMarks([{ start: 0, end: 0 }], 0), [{ left: 0, width: 0 }], 'a zero-length replay divides by nothing');
});

test('the seek bar\'s text alternative names the pauses: how many and how long in all; none says nothing', () => {
  assert.equal(pausesText([]), '');
  assert.equal(pausesText([{ start: 100, end: 1300 }]), 'Paused once, 1.2 s in all');
  assert.equal(pausesText([{ start: 0, end: 2000 }, { start: 3000, end: 5100 }]), 'Paused 2 times, 4.1 s in all');
});

test('a replay with pauses hands its spans to the view; playback runs through a paused span at the chosen speed', async () => {
  const spans = [{ start: 1100, end: 1300 }, { start: 5000, end: 6300 }]; // the won fixture has no action in either
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: pausedBlob(spans) });
  assert.equal(viewer.state.status, 'ready', 'the replay verifies with its pauses');
  assert.deepEqual(view.log[2], ['ready', { duration: 9971, kind: 'square', pauses: spans }]);
  viewer.seek(4960);
  const before = viewers.drawn.at(-1).index;
  viewer.command('toggle');
  viewer.tick(1000); // into the paused span
  assert.equal(view.last.time, 5960, 'the clock does not skip the pause');
  assert.equal(viewers.drawn.at(-1).changed.length, 0, 'the board stays as it was');
  assert.equal(viewers.drawn.at(-1).index, before);
  viewer.tick(500);
  assert.equal(view.last.time, 6460);
  assert.equal(viewers.drawn.at(-1).index, before + 1, 'the action after the pause plays at its time');
  // Previous and Next still step by action.
  viewer.command('next');
  assert.equal(view.last.time, 6900);
});

test('at the end the final board stays with the outcome and recorded time; play restarts from the beginning', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  viewer.setSpeed(4);
  viewer.command('toggle');
  for (let i = 0; i < 10; i++) viewer.tick(1000);
  assert.deepEqual([view.last.time, view.last.playing, view.last.ended], [9971, false, true]);
  assert.deepEqual(view.last.end, endLine(createSimulator(blobOf(WON)).replay.check));
  assert.equal(viewers.drawn.at(-1).phase, 'won');
  assert.deepEqual([view.last.figures.bbbv, view.last.figures.mines], ['15 / 15', '5']);
  const drawn = viewers.drawn.length;
  viewer.tick(1000);
  assert.equal(viewers.drawn.length, drawn, 'the final board stays');
  viewer.command('toggle');
  assert.deepEqual([view.last.time, view.last.playing, view.last.end], [0, true, null], 'play starts again from the beginning');
});

test('seek and step move the board to any point, stepping action by action', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  const times = createSimulator(blobOf(WON)).replay.actions.map((a) => a.time);
  viewer.command('next');
  assert.equal(view.last.time, times[1], 'next: the next action');
  viewer.command('next');
  assert.equal(view.last.time, times[2]);
  viewer.command('prev');
  assert.equal(view.last.time, times[1], 'previous: the action before');
  viewer.seek(5000);
  assert.equal(viewers.drawn.at(-1).index, times.filter((t) => t <= 5000).length);
  viewer.command('prev');
  assert.equal(view.last.time, times.filter((t) => t <= 5000).at(-2));
  viewer.command('end');
  assert.deepEqual([view.last.time, view.last.ended], [9971, true]);
  viewer.command('next');
  assert.equal(view.last.time, 9971, 'nothing after the end');
  viewer.command('start');
  assert.equal(view.last.time, 0);
  viewer.command('prev');
  assert.equal(view.last.time, 0, 'nothing before the start');
  viewer.command('toggle');
  viewer.command('next');
  assert.equal(view.last.playing, false, 'stepping pauses');
});

test('the seek bar steps 1% of the replay, never under its minimum, so any replay is crossed in a hundred steps', () => {
  assert.equal(SEEK_STEP_MIN_MS, 100);
  assert.equal(seekStep(0), 100);
  assert.equal(seekStep(9971), 100);
  assert.equal(seekStep(60000), 600);
  assert.equal(seekStep(3_600_000), 36000);
});

test('while paused each frame only re-places the pointer; nothing is drawn again', async () => {
  const placed = [];
  const viewers = fakeViewers();
  const square = viewers.square;
  viewers.square = (o) => ({ ...square(o), place: () => placed.push(1) });
  const { viewer } = viewerOver({ viewers });
  await viewer.show({ replay: blobOf(WON) });
  viewer.tick(16);
  viewer.tick(16);
  assert.deepEqual([placed.length, viewers.drawn.length], [2, 1]);
});

test('the controls are operable by keyboard and controller', async () => {
  assert.deepEqual(REPLAY_KEYS, {
    Space: 'toggle', KeyK: 'toggle', ArrowLeft: 'prev', ArrowRight: 'next', Home: 'start', End: 'end', Minus: 'slower', Equal: 'faster',
  });
  assert.deepEqual(REPLAY_PAD, [[BTN.START, 'toggle'], [BTN.Y, 'toggle'], [BTN.LB, 'prev'], [BTN.RB, 'next'], [BTN.LT, 'slower'], [BTN.RT, 'faster']]);
  const { viewer, view } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(viewer.key('Space'), true);
  assert.equal(view.last.playing, true);
  assert.equal(viewer.key('KeyQ'), false, 'other keys are not the viewer\'s');
  assert.equal(viewer.key('Equal'), true);
  assert.equal(view.last.speed, 2);
  const pressed = new Set([BTN.RB]);
  assert.equal(viewer.pad((b) => pressed.has(b)), true);
  assert.equal(view.last.playing, false);
  assert.ok(view.last.time > 0);
  assert.equal(viewer.pad(() => false), false, 'nothing pressed is left to menu navigation');
});

test('a lost replay ends on the loss view with its recorded time', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(LOST) });
  viewer.command('end');
  assert.equal(viewers.drawn.at(-1).phase, 'lost');
  assert.equal(view.last.end.text, 'Lost · 14.522 s');
  const sim = viewers.made[0].sim;
  assert.equal(sim.game.cellState(sim.game.explodedCell), CELL.EXPLODED);
});

test('the viewer is a shell screen, not a mode: no records, no sound, no pause', () => {
  for (const f of ['js/replay/viewer.js', 'js/replay/viewer-2d.js', 'js/replay/clock.js']) {
    const src = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /audio\.js|records\/store|records\/model|mode-host|pause\.js/, `${f} reaches no records, sound or pause`);
  }
  const clock = read('js/replay/clock.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(clock, /\bimport\b|document|window/, 'the clock is DOM-free and imports nothing');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');

test('the viewer screen is kit markup: the overlay, the board area, the message and the controls', () => {
  const at = INDEX.indexOf('<!-- Replay viewer -->');
  assert.ok(at > 0, 'index.html has the replay viewer section');
  const html = INDEX.slice(at, INDEX.indexOf('<!-- /Replay viewer -->'));
  for (const id of ['replay', 'rp-clock', 'rp-mines', 'rp-bbbv', 'rp-rate', 'rp-back', 'replay-board', 'replay-message', 'replay-message-text',
    'replay-message-back', 'replay-controls', 'rp-play', 'rp-prev', 'rp-next', 'rp-speed', 'rp-seek', 'rp-pauses', 'rp-pauses-text', 'replay-end']) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
  }
  assert.match(html, /class="ui-overlay-bar[^"]*"/);
  assert.match(html, /id="rp-speed" class="ui-segmented" role="radiogroup"/);
  for (const s of SPEEDS) assert.match(html, new RegExp(`role="radio"[^>]*data-value="${s}"`), `${s}× option`);
  assert.match(html, /id="rp-seek" class="ui-slider__input" type="range"[^>]*aria-describedby="rp-pauses-text"/, 'the seek bar names its pauses');
  assert.match(html, /id="rp-pauses" class="replay-pauses" aria-hidden="true"/, 'the marks are drawing only');
  assert.match(read('css/components.css'), /\.replay-pause \{[^}]*var\(--color-replay-pause\)/, 'the marks take their colour from a token');
  for (const b of html.match(/<button[^>]*>/g)) assert.match(b, /type="button"/);
  assert.match(read('css/components.css'), /Replay viewer \(index\.html #replay/, 'the catalogue lists the screen');
});

test('the shell registers the viewer under the Records screen\'s replay route and drives it every frame', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /\[REPLAY_SCREEN\]: \{/, 'registered as REPLAY_SCREEN');
  assert.equal(REPLAY_SCREEN, 'replay');
  assert.match(table, /back: \(\) => REPLAY_VIEWER\.back\(\)/);
  assert.match(MAIN, /if \(S\.mode === REPLAY_SCREEN\) REPLAY_VIEWER\.tick\(/);
  assert.match(MAIN, /replay: 'replay'/, 'its layer is in the controller layer table');
});

test('the shell offers the 3D viewer only with WebGL 2, and mounts the 2D one at the board scale setting', () => {
  assert.match(MAIN, /viewers: WEBGL2 \? \{ square: mountReplay2D, box: mountReplay3D \} : \{ square: mountReplay2D \}/);
  assert.match(MAIN, /function mountReplay2D\(options\) \{ return mountViewer2D\(\{ \.\.\.options, scale: SETTINGS\.get\('boardScale'\) \}\); \}/);
});

// ---------------------------------------------------------------- in a browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.msrp': 'application/octet-stream' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try { return await import(pathToFileURL(global).href); } catch { return null; }
  }
}
async function openBrowser(t) {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return null; }
  try {
    return await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return null;
  }
}

test('in a browser without WebGL 2, a 2D replay plays and a 3D replay says it needs WebGL 2', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return; }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer), null, 'no WebGL 2 here');
    const watch = (file) => page.evaluate(async (f) => {
      const bytes = new Uint8Array(await (await fetch(`/tests/fixtures/replays/${f}`)).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    }, file);

    await watch(WON);
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas').length), 1, 'the 2D board view is mounted');
    await page.click('#rp-speed [data-value="4"]');
    await page.click('#rp-play');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: 15000 });
    assert.equal(await page.evaluate(() => document.getElementById('replay-end').textContent), 'Won · 9.971 s');
    await page.click('#rp-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    await watch(CUBE);
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'failed');
    assert.equal(await page.evaluate(() => document.getElementById('replay-message-text').textContent), FAILURES.webgl2);
    assert.equal(await page.evaluate(() => document.getElementById('replay').classList.contains('replay--scene')), false, 'no 3D scene is let through');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'replay-message-back');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back works');
    assert.deepEqual(errors, []);
  } finally {
    server.close();
    await browser.close();
  }
});

test('in a browser, a recorded 2D replay plays from its fixture through to the end', async (t) => {
  const browser = await openBrowser(t);
  if (!browser) return;
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'replay');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'rp-play', 'focus on Play');
    assert.equal(await text('rp-clock'), '000');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas').length), 1, 'the board view is mounted');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#rp-pauses .replay-pause').length), 0, 'no pauses, no marks');
    assert.equal(await text('rp-pauses-text'), '');

    await page.click('#rp-speed [data-value="4"]');
    await page.click('#rp-play');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.playing && globalThis.__ms.replayViewer.state.time > 1000);
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#replay-board .replay-pointer')).display !== 'none'), true, 'the recorded pointer shows');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: 15000 });
    assert.equal(await text('replay-end'), 'Won · 9.971 s');
    assert.equal(await text('rp-clock'), '009');
    assert.equal(await text('rp-bbbv'), '15 / 15');
    assert.equal(await text('rp-mines'), '5');
    assert.equal(await page.evaluate(() => document.getElementById('replay-end').classList.contains('hidden')), false);

    // The keyboard: Home goes to the start, ArrowRight steps one action, Space plays.
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), 0);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), 298);
    // The seek bar moves by its step from the keyboard (the controller steps it the same way), and its end ends the replay.
    await page.focus('#rp-seek');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), 400, 'one step of 1% on');
    await page.keyboard.press('End');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.ended), true);
    // Back returns to the screen it came from.
    await page.click('#rp-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.equal(await page.evaluate(() => document.getElementById('replay').classList.contains('hidden')), true);

    // A replay with pauses marks each span on the seek bar and names them.
    await page.evaluate(async () => {
      const { decodeReplay, encodeReplay } = await import('/js/replay/format.js');
      const r = decodeReplay(new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer()));
      r.header.pauses = [{ start: 1000, end: 3000 }, { start: 5000, end: 8000 }]; // marks over the bar; the actions are the fixture's
      globalThis.__ms.watch({ replay: encodeReplay(r), returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    const marks = await page.evaluate(() => [...document.querySelectorAll('#rp-pauses .replay-pause')].map((m) => [m.style.left, m.style.width, getComputedStyle(m).backgroundColor]));
    assert.equal(marks.length, 2);
    assert.match(marks[0][0], /^10(\.\d+)?%$/);
    assert.match(marks[1][1], /^30(\.\d+)?%$/);
    assert.notEqual(marks[0][2], 'rgba(0, 0, 0, 0)', 'the mark is coloured');
    assert.equal(await text('rp-pauses-text'), 'Paused 2 times, 5.0 s in all');
    await page.click('#rp-back');

    // A replay that cannot be read says so, and Back still works.
    await page.evaluate(() => globalThis.__ms.watch({ replay: new Uint8Array([1, 2, 3]), returnTo: { screen: 'menu' } }));
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'failed');
    assert.match(await text('replay-message-text'), /cannot be read/);
    assert.equal(await page.evaluate(() => document.getElementById('replay-controls').classList.contains('hidden')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    server.close();
    await browser.close();
  }
});
