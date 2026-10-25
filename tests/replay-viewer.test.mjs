// Replay viewer (replay-playback): the playback clock (js/replay/clock.js), its displayed format and the
// end-of-replay line, the overlay figures, the 2D viewer's movement interpolation and drawing
// (js/replay/viewer-2d.js), the viewer screen's open, verify, failure, control, key and controller
// logic (js/replay/viewer.js) over fake views and a fake library, its markup and its wiring in
// js/main.js, and in a browser a recorded 2D replay from tests/fixtures/replays/ played through to the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SPEEDS, DEFAULT_SPEED, LEAD_IN_MS, createPlaybackClock } from '../js/replay/clock.js';
import { movementTrack, pointerAt, cursorAt, pointerPixel, createViewer2D, trailPoints, paintBbbv, replayGeometry, TRAIL_MS } from '../js/replay/viewer-2d.js';
import { createGeometry } from '../js/geometry/index.js';
import {
  FAILURES, COMMANDS, REPLAY_KEYS, REPLAY_PAD, REPLAY_KEY_LINE, SEEK_STEP_MIN_MS, MAX_REPLAY_FILE_BYTES, BBBV_TINTS, BBBV_TINT_TOKENS, seekStep, clockText, overlayFigures, endLine,
  pauseMarks, pausesText, seekTicks, actionCue, regionTints, prepareReplay, createReplayViewer, replayCode, replayTitle, replayFigures,
} from '../js/replay/viewer.js';
import { FIGURES, liveFigures, figuresLine } from '../js/shell/live-figures.js';
import { encodeBoardCode, parseBoardCode } from '../js/records/board-code.js';
import { replayFileName } from '../js/records/replay-list.js';
import { boardKey, createBoardIdentity } from '../js/records/board.js';
import { bbbvPartition } from '../js/engine/metrics.js';
import { createSimulator, REFUSAL } from '../js/replay/simulator.js';
import { decodeReplay, encodeReplay, cellStateDigest, REPLAY_FORMAT_VERSION } from '../js/replay/format.js';
import { createGameWithMines, PHASE } from '../js/engine/rules.js';
import { createHexGrid } from '../js/engine/hex-grid.js';
import { createTriGrid } from '../js/engine/tri-grid.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { formatOverlayTime, formatMineCount } from '../js/ui/components.js';
import { formatTime, DASH } from '../js/results/view.js';
import { REPLAY_SCREEN } from '../js/records/replay-list.js';
import { BTN } from '../js/gamepad.js';
import { CELL } from '../js/engine/rules.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const blobOf = (file) => new Uint8Array(readFileSync(new URL(file, FIXTURES)));
const WON = '2d-beginner-won.msrp';
const LOST = '2d-intermediate-lost.msrp';
const CUBE = '3d-cube-beginner-lost.msrp';

// ---------------------------------------------------------------- the playback clock

test('the clock offers 0.25×, 0.5×, 1×, 2× and 4× and starts paused at 0 at 1×', () => {
  assert.deepEqual(SPEEDS, [0.25, 0.5, 1, 2, 4]);
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
  assert.deepEqual(expected, [250, 750, 1750, 3750, 7750]);
  c.pause();
  c.advance(1000);
  assert.equal(c.time, 7750, 'pause stops the clock');
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
  assert.equal(c.speed, 0.25);
  c.faster();
  assert.equal(c.speed, 0.5);
  c.faster();
  assert.equal(c.speed, 1);
});

// ---------------------------------------------------------------- what the viewer shows

test('the replay clock reads seconds to the thousandth, not split into minutes', () => {
  assert.equal(clockText(0), '00.000');
  assert.equal(clockText(13342), '13.342');
  assert.equal(clockText(47120), '47.120');
  assert.equal(clockText(999.9), '00.999', 'truncated, never rounded');
  assert.equal(clockText(1_200_000), '1200.000', 'no minutes, no cap');
  assert.equal(formatOverlayTime(13.342), '013', 'the in-game overlay keeps its whole seconds for play');
});

test('the overlay reads mines left, 3BV solved of 3BV and 3BV/s so far from the frame', () => {
  const frame = { minesLeft: -3, bbbv: 20, bbbvSolved: 5 };
  assert.deepEqual(overlayFigures(frame, 2000), { clock: '02.000', mines: formatMineCount(-3), bbbv: '5 / 20', rate: '2.50' });
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

test('the seek bar names its place in the results time format, with no readout beside it; the clock reads ss.mmm', () => {
  const src = read('js/replay/viewer.js');
  assert.match(src, /aria-valuetext', `\$\{formatTime\(at\)\} of \$\{formatTime\(state\.duration\)\}`/);
  assert.doesNotMatch(src, /rp-position|el\.position/, 'no position readout');
  assert.match(src, /bindSliderFill\(el\.seek\)/, 'the played part follows the seek bar\'s value');
  assert.equal(formatTime(4321), '4.321 s');
  assert.equal(clockText(4321), '04.321');
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
  const layout = { tile: 40, pitch: 40, offsetX: 10, offsetY: 20 };
  assert.deepEqual(pointerPixel(layout, { x: 0, y: 0 }, [1.5, 2]), { x: 70, y: 100 });
  assert.deepEqual(pointerPixel(layout, { x: 30, y: 5 }, [1.5, 2]), { x: 40, y: 95 });
});

// A fake board view: records the game, updates and cursor, as js/classic2d/board-view.js is driven.
function fakeView() {
  const calls = { game: [], update: [], cursor: [], ensure: [] };
  return {
    calls,
    layout: { tile: 40, pitch: 40, offsetX: 0, offsetY: 0, scrolls: false, width: 360, height: 360 },
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
  view.setScale = (s) => { view.scales.push(s); view.layout = { ...view.layout, tile: 30, pitch: 30 }; };
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
  view.layout = { ...view.layout, tile: 50, pitch: 50, offsetX: 20 };
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
    failed(message, known = null) { log.push(['failed', message]); screen.known = known; },
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
  const pressed = [];
  const how = [];
  const calls = [];
  const board = (kind) => ({ container, sim }) => {
    made.push({ container, sim, kind });
    return {
      draw: (f, opts = {}) => { drawn.push(f); how.push(opts.playing === true); },
      press: (list) => pressed.push(list.map((a) => a.index)),
      still: () => calls.push('still'),
      showBbbv: (tints) => calls.push(['bbbv', tints]),
      setFree: (on) => calls.push(['free', on]),
      setScale: (scale) => made.push(['scale', scale]),
      destroy: () => made.push('destroyed'),
    };
  };
  return { drawn, made, pressed, how, calls, square: board('square'), hex: board('hex'), tri: board('tri'), box: board('box') };
}
function viewerOver({ library = fakeLibrary(), viewers = fakeViewers(), sound = null, files = null, bests } = {}) {
  const view = fakeScreen();
  const router = fakeRouter();
  const viewer = createReplayViewer({ library, router, view, viewers, sound, files, bests });
  return { viewer, view, router, viewers };
}
const RETURN = { screen: 'records', data: { boardKey: 'classic-2d:square:9x9:10:guess' } };

test('the viewer opens a replay, shows the start paused, and Back returns to the screen it came from', async () => {
  const { viewer, view, router, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON), returnTo: RETURN });
  assert.deepEqual(view.log.slice(0, 2), ['open', 'loading']);
  const [, info] = view.log[2];
  assert.deepEqual([info.duration, info.leadIn, info.kind, info.pauses], [9971, LEAD_IN_MS, 'square', []]);
  assert.equal(info.actions.length, 28, 'every action is handed over for the seek bar\'s ticks');
  assert.equal(viewers.made[0].container, view.container, 'the 2D viewer draws in the screen\'s board area');
  assert.equal(viewer.state.status, 'ready');
  assert.deepEqual([view.last.time, view.last.playing, view.last.speed, view.last.end], [-LEAD_IN_MS, false, 1, null]);
  assert.equal(view.last.figures.clock, '00.000');
  assert.equal(viewers.drawn.length, 1, 'the start is drawn');
  assert.equal(viewers.drawn[0].index, 0, 'on the closed board: no action applied');
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

test('the viewer shows the game\'s board code, built from the header and the first reveal, with no format change', async () => {
  for (const file of [WON, LOST, CUBE]) {
    const replay = decodeReplay(blobOf(file));
    const first = replay.actions.find((a) => a.kind === 'reveal');
    const code = replayCode(replay);
    assert.equal(code, encodeBoardCode({ board: replay.header.board, seed: replay.header.seed, generatorVersion: replay.header.generatorVersion, startCell: first.cell }), file);
    const parsed = parseBoardCode(code);
    assert.equal(parsed.ok, true, file);
    assert.equal(parsed.startCell, first.cell);
  }
  assert.equal(replayCode({ header: decodeReplay(blobOf(WON)).header, actions: [] }), null, 'no reveal, no code');
  const { viewer, view } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(view.log[2][1].code, replayCode(decodeReplay(blobOf(WON))));
  const html = read('index.html');
  const replayHtml = html.slice(html.indexOf('<section id="replay"'), html.indexOf('<!-- /Replay viewer -->'));
  assert.match(replayHtml, /<header class="ui-frame__head">[\s\S]*<button type="button" id="rp-back"[\s\S]*<\/header>[\s\S]*<div class="ui-counter-strip replay-bar"[\s\S]*<div id="rp-code" class="ui-code hidden">[\s\S]*<div id="replay-stage">/,
    'Back in the frame\'s head; the code chip in the strip, above the board area and taking no room from it');
  assert.match(read('js/main.js'), /onOpen: [^\n]+\n\s*onCopy: \(c\) => copyCode\(c\),/);
});

test('the frame is titled with the replay\'s mode and board; while a replay opens the frame\'s Back has focus', async () => {
  assert.equal(replayTitle(decodeReplay(blobOf(WON))), 'Replay · Classic 2D · Beginner');
  assert.equal(replayTitle(decodeReplay(blobOf(LOST))), 'Replay · Classic 2D · Intermediate');
  assert.match(replayTitle(decodeReplay(blobOf(CUBE))), /^Replay · 3D · Cube /);
  const { viewer, view } = viewerOver();
  const opening = viewer.show({ replay: blobOf(WON) });
  assert.equal(viewer.defaultFocus(), '#rp-back', 'nothing plays yet: the frame\'s Back');
  await opening;
  assert.equal(view.log[2][1].title, 'Replay · Classic 2D · Beginner', 'handed to the view with the replay');
  assert.equal(viewer.defaultFocus(), '#rp-play');
  await viewer.show({ replay: new Uint8Array([1, 2, 3]) });
  assert.equal(viewer.defaultFocus(), '#replay-message-back', 'a failure focuses its card\'s Back');
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

test('a replay whose header reads but cannot play keeps its frame title and timeline, and can still be downloaded', async () => {
  const saved = [];
  const files = { save: (bytes, name) => saved.push(name) };
  // No viewer for its board: the replay itself reads.
  const { viewer, view } = viewerOver({ viewers: {}, files });
  await viewer.show({ replay: blobOf(WON) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unsupported]);
  assert.equal(view.known.title, 'Replay · Classic 2D · Beginner', 'the frame keeps the replay\'s title');
  assert.deepEqual([view.known.duration, view.known.leadIn, view.known.pauses, view.known.actions.length], [9971, LEAD_IN_MS, [], 28], 'and its seek bar\'s ticks');
  assert.match(viewer.download(), /\.msrp$/, 'Download still saves the file');
  assert.equal(saved.length, 1);
  // A replay that does not reproduce: its header still reads.
  const tampered = decodeReplay(blobOf(WON));
  tampered.check.digest ^= 1;
  await viewer.show({ replay: encodeReplay(tampered) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unreproducible]);
  assert.equal(view.known.title, 'Replay · Classic 2D · Beginner');
  // A replay that does not read at all: nothing to keep.
  await viewer.show({ replay: new Uint8Array([9, 9]) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unreadable]);
  assert.equal(view.known, null);
  assert.equal(viewer.download(), null, 'nothing to download');
});

test('a 3D replay with no 3D viewer to offer (no WebGL 2) says why, Back still works, and a 2D replay still plays', async () => {
  assert.equal(FAILURES.webgl2, 'This 3D replay needs WebGL 2, which is not available in this browser.');
  const all = fakeViewers();
  const viewers = { drawn: all.drawn, made: all.made, square: all.square }; // no box viewer
  const { viewer, view, router } = viewerOver({ viewers });
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
  assert.equal(view.last.time, 0, 'the lead-in played through');
  viewer.setSpeed(2);
  viewer.tick(500);
  assert.equal(view.last.time, 1000);
  assert.equal(viewers.drawn.at(-1).time, 1000, 'the simulator is at the clock');
  assert.equal(viewers.drawn.length, 3);
  assert.deepEqual(viewers.how, [false, true, true], 'frames drawn by playback say so');
  const sim = createSimulator(blobOf(WON));
  const expected = sim.seek(1000);
  assert.deepEqual(view.last.figures, overlayFigures(expected, 1000));
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
  assert.deepEqual(view.log[2][1].pauses, spans);
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
  assert.deepEqual([view.last.figures.bbbv, view.last.figures.mines], ['15 / 15', '005']);
  const drawn = viewers.drawn.length;
  viewer.tick(1000);
  assert.equal(viewers.drawn.length, drawn, 'the final board stays');
  viewer.command('toggle');
  assert.deepEqual([view.last.time, view.last.playing, view.last.end], [-LEAD_IN_MS, true, null], 'play starts again from the start position');
  assert.equal(viewers.drawn.at(-1).index, 0);
});

test('seek and step move the board to any point, stepping action by action', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  const times = createSimulator(blobOf(WON)).replay.actions.map((a) => a.time);
  viewer.command('next');
  assert.equal(view.last.time, times[0], 'next from the start: the first action, applied');
  assert.equal(viewers.drawn.at(-1).index, 1);
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
  assert.equal(view.last.time, -LEAD_IN_MS, 'Home: the start position');
  assert.equal(viewers.drawn.at(-1).index, 0);
  viewer.command('prev');
  assert.equal(view.last.time, -LEAD_IN_MS, 'nothing before the start');
  viewer.command('next');
  viewer.command('prev');
  assert.equal(view.last.time, -LEAD_IN_MS, 'previous from the first action: the start position');
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
    Space: 'toggle', KeyK: 'toggle', ArrowLeft: 'prev', ArrowRight: 'next', Comma: 'framePrev', Period: 'frameNext',
    Home: 'start', End: 'end', Minus: 'slower', Equal: 'faster', KeyB: 'bbbv', KeyC: 'camera',
  });
  for (const name of Object.values(REPLAY_KEYS)) assert.ok(COMMANDS.includes(name), name);
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
  assert.equal(view.last.time, 0, 'RB from the start position: the first click, applied');
  assert.equal(viewer.pad(() => false), false, 'nothing pressed is left to menu navigation');
});

// ---------------------------------------------------------------- the live figures

test('the live figures follow the playback position, a seek back or forward included, from the frame\'s counts and the replay clock', async () => {
  const stored = { time: { value: 9000 }, bbbvPerSecond: { value: 2 } };
  const asked = [];
  const { viewer, view } = viewerOver({ bests: (board) => { asked.push(board); return stored; } });
  await viewer.show({ replay: blobOf(WON) });
  assert.deepEqual(asked, [createSimulator(blobOf(WON)).replay.header.board], 'the bests of the replay\'s board');
  const at = () => Object.fromEntries(FIGURES.map((name) => [name, view.last.live[name] && [view.last.live[name].text, view.last.live[name].detail]]));
  assert.deepEqual(at(), {
    bbbv: ['0 / 15', null], pace: null, rate: [DASH, 'PB 2.00'], clicks: ['0', `efficiency ${DASH}`], flags: ['0', '10 mines left'],
  }, 'the start position: nothing solved, no time elapsed');
  viewer.seek(5000);
  assert.deepEqual(at(), {
    bbbv: ['7 / 15', null], pace: ['+0.800 s', 'behind 9.000 s'], rate: ['1.40', 'PB 2.00'], clicks: ['19', 'efficiency 36.8%'], flags: ['3', '7 mines left'],
  }, '5 s in: behind the best\'s pace');
  assert.equal(view.last.live.bbbv.progress, 7 / 15);
  viewer.seek(3932);
  assert.deepEqual(at(), {
    bbbv: ['7 / 15', null], pace: ['\u22120.268 s', 'ahead of 9.000 s'], rate: ['1.78', 'PB 2.00'], clicks: ['15', 'efficiency 46.7%'], flags: ['2', '8 mines left'],
  }, 'a seek back: the figures of the earlier frame, ahead of the pace');
  assert.equal(view.last.live.pace.ahead, true);
  viewer.command('end');
  assert.deepEqual(at(), {
    bbbv: ['15 / 15', null], pace: ['+0.971 s', 'behind 9.000 s'], rate: ['1.50', 'PB 2.00'], clicks: ['28', 'efficiency 53.6%'], flags: ['5', '5 mines left'],
  }, 'a seek forward to the end');
  viewer.command('start');
  assert.equal(view.last.live.bbbv.text, '0 / 15', 'back at the start position');
});

test('the figures compare against the bests stored now, read each time a replay opens; a board with none shows no pace and no best', async () => {
  let stored = { time: null, bbbvPerSecond: null };
  const { viewer, view } = viewerOver({ bests: () => stored });
  await viewer.show({ replay: blobOf(WON) });
  viewer.seek(5000);
  assert.equal(view.last.live.pace, null, 'no best time, no pace');
  assert.equal(view.last.live.rate.detail, null, 'no best 3BV/s line');
  stored = { time: { value: 4000 }, bbbvPerSecond: { value: 3.5 } };
  await viewer.show({ replay: blobOf(WON) });
  viewer.seek(5000);
  assert.deepEqual([view.last.live.pace.detail, view.last.live.rate.detail], ['behind 4.000 s', 'PB 3.50'], 'the bests as they stand when the replay opens');
  const { viewer: plain, view: shown } = viewerOver({ bests: () => { throw new Error('no records'); } });
  await plain.show({ replay: blobOf(WON) });
  plain.seek(5000);
  assert.equal(shown.last.live.pace, null, 'records that cannot be read: no bests');
  const { viewer: bare, view: none } = viewerOver();
  await bare.show({ replay: blobOf(WON) });
  bare.seek(5000);
  assert.deepEqual([none.last.live.bbbv.text, none.last.live.pace], ['7 / 15', null], 'no bests source: the figures without the bests');
});

test('the replay\'s figures are the live figures model fed with the frame\'s counts and the game time', () => {
  const sim = createSimulator(blobOf(LOST));
  const frame = sim.seek(6826);
  const bests = { time: { value: 30000 }, bbbvPerSecond: { value: 1.5 } };
  assert.deepEqual(replayFigures(frame, 6826, bests), liveFigures({
    bbbv: 59, bbbvSolved: 12, clicks: frame.clicks, flags: 1, mines: 40, elapsedMs: 6826, bests,
  }));
  assert.equal(figuresLine(replayFigures(frame, 6826, bests)), '3BV 12 / 59, 39 mines left', 'the line the panel announces');
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

test('the viewer is a shell screen, not a mode: no records, no pause; its sound goes through the sink the shell hands in', () => {
  for (const f of ['js/replay/viewer.js', 'js/replay/viewer-2d.js', 'js/replay/clock.js']) {
    const src = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /audio\.js|records\/store|records\/model|mode-host|pause\.js/, `${f} reaches no records, sound module or pause`);
  }
  const clock = read('js/replay/clock.js').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(clock, /\bimport\b|document|window/, 'the clock is DOM-free and imports nothing');
});

// ---------------------------------------------------------------- markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');

test('the viewer screen is kit markup: a screen frame holding the overlay, the board area, the message and the controls', () => {
  const at = INDEX.indexOf('<!-- Replay viewer -->');
  assert.ok(at > 0, 'index.html has the replay viewer section');
  const html = INDEX.slice(at, INDEX.indexOf('<!-- /Replay viewer -->'));
  for (const id of ['replay', 'replay-frame', 'replay-title', 'replay-body', 'replay-main', 'replay-stage', 'rp-figures', 'rp-play-label', 'rp-clock', 'rp-mines', 'rp-bbbv', 'rp-rate', 'rp-back', 'replay-board', 'replay-message', 'replay-message-text',
    'replay-message-back', 'replay-controls', 'rp-play', 'rp-prev', 'rp-next', 'rp-speed', 'rp-seek', 'rp-pauses', 'rp-pauses-text', 'replay-end',
    'rp-ticks', 'rp-keys', 'rp-show-bbbv', 'rp-sound', 'rp-camera', 'rp-download', 'rp-open', 'replay-file', 'replay-scene-over', 'rp-free-note']) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
  }
  assert.match(html, /<section id="replay" class="ui-backdrop hidden" aria-label="Replay">\s*<section class="ui-frame" id="replay-frame" aria-labelledby="replay-title">/, 'a screen frame on the backdrop');
  assert.match(html, /<header class="ui-frame__head">\s*<div class="ui-frame__start"><button type="button" id="rp-back" class="ui-button ui-button--secondary ui-button--sm ui-frame__back" data-icon="arrow-left" aria-label="Back" title="Back"><\/button><\/div>\s*<h1 class="ui-logo ui-frame__logo" aria-label="Minesweeper 3D"><\/h1>/,
    'its title bar: Back its arrow alone, named Back, then the logo');
  assert.match(html, /<\/header>\s*<div class="ui-frame__heading">\s*<h2 class="ui-frame__title" id="replay-title">Replay<\/h2>/, 'the title its heading, over the body');
  assert.match(html, /<div class="ui-frame__body" id="replay-body">\s*<div class="ui-counter-strip replay-bar"[\s\S]*<div id="replay-main">\s*<div id="replay-stage">\s*<div id="replay-board"><\/div>\s*<section id="replay-message"[\s\S]*<section class="ui-figures" id="rp-figures"[\s\S]*<div id="replay-controls"/,
    'its body: the strip, the board area with the message over it and the figures panel beside it, then the controls');
  // The strip (J-Replay-xl): the clock, the mines left after a flag, 3BV and 3BV/s inline, no labels; the code chip after them.
  const strip = html.slice(html.indexOf('replay-bar'), html.indexOf('<div id="replay-main">'));
  assert.match(strip, /<div class="replay-figure replay-figure--clock" role="group" aria-label="Time"><span id="rp-clock">00\.000<\/span><\/div>\s*<div class="ui-counter replay-figure" role="group" aria-label="Mines left"><svg class="ui-counter__icon"[^>]*>[\s\S]*?<\/svg><span id="rp-mines" class="ui-counter__digits">000<\/span><\/div>\s*<div class="replay-figure" role="group" aria-label="3BV solved">3BV <span id="rp-bbbv">&mdash;<\/span><\/div>\s*<div class="replay-figure" role="group" aria-label="3BV per second">3BV\/s <span id="rp-rate">&mdash;<\/span><\/div>\s*<div id="rp-code"/,
    'the strip\'s figures inline, named but unlabelled');
  assert.doesNotMatch(strip, /ui-stat|replay-end/, 'no labelled stat tiles; the end line is in the tools row');
  // The controls: the seek bar alone on its row, no label and no readout; the tools row; the key line.
  const controls = html.slice(html.indexOf('<div id="replay-controls"'), html.indexOf('<input id="replay-file"'));
  assert.match(controls, /<div class="replay-seek">\s*<div id="rp-ticks" class="replay-ticks" aria-hidden="true"><\/div>\s*<div id="rp-pauses" class="replay-pauses" aria-hidden="true"><\/div>\s*<input id="rp-seek" class="ui-slider__input" type="range"[^>]*aria-label="Position"/,
    'the seek bar: its ticks above the track, its pause marks on it, the input over them, named Position');
  assert.doesNotMatch(controls, /ui-slider__label|rp-position|<output/, 'no Position label and no readout');
  const tools = controls.slice(controls.indexOf('replay-tools'), controls.indexOf('replay-foot'));
  const order = ['rp-prev', 'rp-play', 'rp-next', 'rp-speed', 'rp-show-bbbv', 'rp-sound', 'rp-camera', 'replay-end', 'rp-download', 'rp-open'].map((id) => tools.indexOf(`id="${id}"`));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), 'the tools row: transport, speed, the toggles, the end line, then the files');
  assert.match(tools, /<div class="ui-row replay-toggles">/, 'the toggles grouped, a row of their own on a phone');
  assert.match(tools, /<div class="ui-row replay-files">\s*<button type="button" id="rp-download"/, 'the files grouped at the end');
  for (const [id, icon] of [['rp-prev', 'skip-back'], ['rp-play', 'play'], ['rp-next', 'skip-forward'], ['rp-show-bbbv', 'grid'], ['rp-sound', 'speaker'], ['rp-camera', 'camera'], ['rp-download', 'download'], ['rp-open', 'upload']]) {
    assert.match(controls, new RegExp(`id="${id}"[^>]*data-icon="${icon}"`), `${id} leads with the ${icon} icon`);
  }
  assert.match(controls, /id="rp-prev" class="ui-button ui-button--secondary" aria-label="Previous action" data-icon="skip-back"><\/button>/, 'Previous: its icon alone, named');
  assert.match(controls, /<div class="ui-row replay-foot">\s*<div id="rp-keys" class="ui-key-hints replay-keys"><\/div>[\s\S]*id="rp-pauses-text"/, 'the key line, then the pauses\' line');
  // The free-camera notice over a 3D replay's scene, on a layer of its own above the scene.
  const over = INDEX.slice(INDEX.indexOf('<div id="replay-scene-over"'), INDEX.indexOf('<!-- /Replay viewer -->'));
  assert.match(over, /<div id="replay-scene-over" class="replay-over hidden" aria-hidden="false">\s*<p id="rp-free-note" class="replay-note hidden" role="status"><svg class="ui-icon"[^>]*>[\s\S]*?<\/svg>Free camera · fly with W A S D, click the scene for mouse look · C: Follow<\/p>/,
    'the canvas\'s free-camera notice');
  const panel = html.slice(html.indexOf('id="rp-figures"'), html.indexOf('</section>', html.indexOf('id="rp-figures"')));
  assert.match(html, /<section class="ui-figures" id="rp-figures" aria-label="Live figures">/, 'a figures panel named for its figures');
  for (const name of FIGURES) assert.match(panel, new RegExp(`<div class="ui-figure[^"]*"[^>]*data-figure="${name}"`), `the ${name} figure`);
  assert.match(panel, /data-figure="bbbv"[^>]*>[\s\S]*?class="ui-figure__bar" role="progressbar"/, '3BV with its progress bar');
  assert.match(panel, /<p class="ui-figures__live" role="status" aria-live="polite" aria-atomic="true"><\/p>/, 'its live part is the one polite region');
  assert.doesNotMatch(panel.replace(/<p class="ui-figures__live"[^>]*>/, ''), /aria-live/, 'no figure is a live region');
  const classes = [...panel.matchAll(/class="([^"]*)"/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
  for (const c of classes) assert.match(c, /^(ui-figures?(__[a-z]+)?(--[a-z]+)?|hidden)$/, `${c}: catalogued components only`);
  assert.match(html, /id="replay-message" class="ui-card hidden"[\s\S]*?<span id="replay-message-spinner" class="ui-spinner" aria-hidden="true"><\/span>/, 'opening shows the spinner');
  assert.match(html, /id="replay-message-back" class="ui-button ui-button--secondary">Back <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button>/, 'the failure card\'s Back with its key hint');
  assert.match(html, /id="rp-play" class="ui-button ui-button--primary ui-button--go" data-icon="play"><span id="rp-play-label">Play<\/span> <span class="ui-key-hint replay-key-hint" aria-hidden="true"><kbd class="ui-key-hint__key">Space<\/kbd><\/span><\/button>/,
    'Play carries its icon and its key, out of its name');
  assert.match(html, /<span id="replay-end" class="replay-end hidden" role="status"><span id="replay-end-outcome" class="ui-chip"><\/span> <span id="replay-end-time" class="replay-end__time"><\/span><\/span>/, 'the end line: the outcome as a chip, then the time');
  assert.match(html, /<div id="rp-keys" class="ui-key-hints replay-keys"><\/div>/, 'the key line is a row of key hints');
  assert.doesNotMatch(html, /data-esc-hint/, 'each Back carries its key hint; no text hint beside it');
  assert.match(html, /id="rp-speed" class="ui-segmented" role="radiogroup"/);
  for (const s of SPEEDS) assert.match(html, new RegExp(`role="radio"[^>]*data-value="${s}"`), `${s}× option`);
  assert.match(html, /id="rp-seek" class="ui-slider__input" type="range"[^>]*aria-describedby="rp-pauses-text"/, 'the seek bar names its pauses');
  assert.match(html, /id="rp-pauses" class="replay-pauses" aria-hidden="true"/, 'the marks are drawing only');
  assert.match(html, /id="rp-ticks" class="replay-ticks" aria-hidden="true"/, 'the ticks are decoration');
  for (const id of ['rp-show-bbbv', 'rp-sound', 'rp-camera']) assert.match(html, new RegExp(`id="${id}"[^>]*aria-pressed="false"`), `${id} is a toggle`);
  assert.match(html, /id="replay-file" type="file" accept="\.msrp"[^>]*hidden/, 'one hidden file input picks a replay file');
  assert.match(read('themes/joyful-tiles/theme.css'), /\.replay-pause \{[^}]*var\(--color-replay-pause\)/, 'the marks take their colour from a token');
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
  assert.match(MAIN, /const FLAT_REPLAY_VIEWERS = \{ square: mountReplay2D, hex: mountReplay2D, tri: mountReplay2D \};/, 'every flat graph kind on the 2D viewer');
  assert.match(MAIN, /viewers: WEBGL2 \? \{ \.\.\.FLAT_REPLAY_VIEWERS, box: mountReplay3D \} : FLAT_REPLAY_VIEWERS/);
  assert.match(MAIN, /function mountReplay2D\(options\) \{ return mountViewer2D\(\{ \.\.\.options, scale: SETTINGS\.get\('boardScale'\) \}\); \}/);
});

// ---------------------------------------------------------------- in a browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}
test('[slow] in a browser, a recorded 2D replay plays from its fixture through to the end', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: patience(5000) });
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    const text = (id) => page.evaluate((i) => document.getElementById(i).textContent, id);
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'replay');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'rp-play', 'focus on Play');
    assert.equal(await text('rp-clock'), '00.000');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas').length) >= 1, true, 'the board view is mounted');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#rp-ticks .replay-tick').length) > 0, true, 'the actions tick the seek bar');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#rp-pauses .replay-pause').length), 0, 'no pauses, no marks');
    assert.equal(await text('rp-pauses-text'), '');
    assert.equal(await text('replay-title'), 'Replay · Classic 2D · Beginner');
    assert.deepEqual(await page.evaluate(() => [document.getElementById('rp-back').innerText.trim(), document.getElementById('rp-back').getAttribute('aria-label')]), ['', 'Back'], 'the title bar\'s Back, its arrow alone, named Back');
    assert.ok(await page.evaluate(() => document.querySelectorAll('#rp-keys .ui-key-hint').length) > 0, 'a 2D replay shows the key line too');
    assert.equal(await page.evaluate(() => document.getElementById('rp-keys').checkVisibility()), true);
    const placed = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const [frame, board, bar, controls] = ['replay-frame', 'replay-board', 'rp-clock', 'replay-controls'].map(r);
      return { inside: board.left >= frame.left && board.right <= frame.right && board.top >= frame.top && board.bottom <= frame.bottom,
        below: board.top >= bar.bottom, above: board.bottom <= controls.top, room: board.width > 200 && board.height > 200 };
    });
    assert.deepEqual(placed, { inside: true, below: true, above: true, room: true }, 'the 2D board sits in the frame, between the figures and the controls');

    await page.click('#rp-speed [data-value="4"]');
    await page.click('#rp-play');
    assert.equal(await page.evaluate(() => document.querySelector('#rp-play > .ui-icon').getAttribute('data-icon')), 'pause', 'Pause with its icon while playing');
    assert.deepEqual(await page.evaluate(() => ['ui-button--secondary', 'ui-button--primary', 'ui-button--go'].map((c) => document.getElementById('rp-play').classList.contains(c))),
      [true, false, false], 'Pause is the white secondary button');
    // Past 1 s of replay time, playing or already at its end: at 4× the playing window is about 2.5 s,
    // which one stalled frame on a loaded machine can step past. The recorded pointer stays when it stops.
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.time > 1000, null, { timeout: patience(3000) });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#replay-board .replay-pointer')).display !== 'none'), true, 'the recorded pointer shows');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: patience(3000) });
    assert.equal(await text('replay-end'), 'Won 9.971 s');
    assert.equal(await page.evaluate(() => document.getElementById('replay-end-outcome').className), 'ui-chip ui-chip--won', 'the outcome as its chip');
    assert.equal(await text('rp-play-label'), 'Play again', 'at the end Play plays it again');
    assert.equal(await page.evaluate(() => document.querySelector('#rp-play > .ui-icon').getAttribute('data-icon')), 'restart', 'with the restart icon');
    assert.deepEqual(await page.evaluate(() => ['ui-button--secondary', 'ui-button--primary', 'ui-button--go'].map((c) => document.getElementById('rp-play').classList.contains(c))),
      [false, true, true], 'Play again is the green go button');
    assert.ok(await page.evaluate(() => { const e = document.getElementById('replay-end').getBoundingClientRect(), s = document.getElementById('rp-sound').getBoundingClientRect(); return e.left >= s.right && Math.abs(e.top + e.height / 2 - (s.top + s.height / 2)) < 10; }),
      'the end line in the tools row after Sound');
    assert.equal(await text('rp-clock'), '09.971');
    assert.equal(await text('rp-bbbv'), '15 / 15');
    assert.equal(await text('rp-mines'), '005', 'the three-digit mine counter');
    assert.equal(await page.evaluate(() => document.getElementById('replay-end').classList.contains('hidden')), false);

    // The keyboard: Home goes to the start, ArrowRight steps one action, Space plays.
    await page.keyboard.press('Home');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), -500);
    await page.evaluate(() => document.activeElement.blur());
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), 0, 'the first click, applied');
    const ring = await page.evaluate(() => {
      const r = document.querySelector('#replay-board .replay-ring--reveal');
      const b = document.getElementById('replay-board').getBoundingClientRect();
      if (!r) return null;
      const box = r.getBoundingClientRect();
      const x = box.left + box.width / 2, y = box.top + box.height / 2;
      return { inside: x >= b.left && x <= b.right && y >= b.top && y <= b.bottom, colour: getComputedStyle(r).borderTopColor };
    });
    assert.ok(ring?.inside, 'the first click shows its press ring on the board');
    assert.notEqual(ring.colour, 'rgba(0, 0, 0, 0)');
    await page.keyboard.press('KeyB');
    const painted = await page.evaluate(() => {
      const c = document.querySelector('#replay-board .replay-bbbv');
      if (!c || c.hidden) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    assert.ok(painted > 0, 'Show 3BV paints the board');
    await page.keyboard.press('KeyB');
    assert.equal(await page.evaluate(() => document.querySelector('#replay-board .replay-bbbv').hidden), true, 'and clears it');
    await page.keyboard.press('ArrowRight');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), 298);
    await page.keyboard.press('Period');
    assert.equal(await page.evaluate(() => globalThis.__ms.replayViewer.state.time), 348, 'one frame on');
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
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    const marks = await page.evaluate(() => [...document.querySelectorAll('#rp-pauses .replay-pause')].map((m) => [m.style.left, m.style.width, getComputedStyle(m).backgroundImage]));
    assert.equal(marks.length, 2);
    assert.match(marks[0][0], /^14\.3\d*%$/, 'placed after the lead-in');
    assert.match(marks[1][1], /^28\.6\d*%$/);
    assert.match(marks[0][2], /^repeating-linear-gradient\(45deg, rgb/, 'the mark is hatched in its colour');
    assert.equal(await text('rp-pauses-text'), 'Paused 2 times, 5.0 s in all');
    await page.click('#rp-back');

    // A replay that cannot be read says so, and Back still works.
    await page.evaluate(() => globalThis.__ms.watch({ replay: new Uint8Array([1, 2, 3]), returnTo: { screen: 'menu' } }));
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'failed', null, { timeout: patience(5000) });
    assert.match(await text('replay-message-text'), /cannot be read/);
    assert.equal(await page.evaluate(() => document.getElementById('replay-controls').classList.contains('hidden')), false, 'the controls stay in place, drawn disabled');
    assert.deepEqual(await page.evaluate(() => ['rp-prev', 'rp-play', 'rp-next', 'rp-seek', 'rp-show-bbbv', 'rp-camera', 'rp-download'].filter((id) => !document.getElementById(id).disabled)), [],
      'nothing that needs a replay can be used');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#rp-speed [role="radio"]')].every((o) => o.disabled)), true);
    assert.deepEqual(await page.evaluate(() => ['rp-sound', 'rp-open'].filter((id) => document.getElementById(id).disabled)), [], 'Sound and Open replay file still work');
    assert.deepEqual(await page.evaluate(() => ['rp-clock', 'rp-mines', 'rp-bbbv', 'rp-rate'].map((id) => document.getElementById(id).textContent)),
      [DASH, DASH, DASH, DASH], 'nothing of the replay played before');
    assert.deepEqual(await page.evaluate(() => [document.querySelectorAll('#rp-ticks .replay-tick, #rp-pauses .replay-pause').length,
      document.getElementById('replay-end').classList.contains('hidden')]), [0, true], 'the bar is cleared');
    // A replay that reads but does not reproduce keeps its title and timeline, and what still works stays enabled.
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const { decodeReplay, encodeReplay } = await import('/js/replay/format.js');
      const r = decodeReplay(new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer()));
      r.check.digest ^= 1;
      globalThis.__ms.watch({ replay: encodeReplay(r), returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'failed', null, { timeout: patience(5000) });
    assert.equal(await text('replay-title'), 'Replay · Classic 2D · Beginner', 'the frame keeps its title');
    assert.deepEqual(await page.evaluate(() => ['rp-show-bbbv', 'rp-download'].filter((id) => document.getElementById(id).disabled)), [], 'Show 3BV and Download stay enabled');
    assert.equal(await page.evaluate(() => [...document.querySelectorAll('#rp-speed [role="radio"]')].some((o) => o.disabled)), false, 'and the speed choice');
    assert.ok(await page.evaluate(() => document.querySelectorAll('#rp-ticks .replay-tick').length) > 0, 'the seek bar keeps its ticks');
    assert.deepEqual(await page.evaluate(() => ['rp-prev', 'rp-play', 'rp-next', 'rp-seek'].filter((id) => !document.getElementById(id).disabled)), [], 'playing it stays off');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('the viewer\'s composition is the canvas\'s: the strip, the body\'s padding and gaps, the seek bar, the end line\'s figures', () => {
  const style = read('css/style.css');
  const theme = read('themes/joyful-tiles/theme.css');
  assert.match(style, /#replay-frame \{ width: 1640px; height: 940px; margin-top: -8px; \}/, 'xl: inset on the backdrop like Settings, 1640 × 940');
  assert.match(style, /@media \(max-width: 1439px\) \{ #replay-frame \{ width: 1302px; height: 712px; \} \}/, 'l: 1302 × 712');
  assert.match(style, /@media \(max-width: 1199px\) \{ #replay-frame \{ width: 984px; height: 728px; \} \}/, 'm: 984 × 728');
  assert.match(style, /#replay-body \{ display: flex; flex-direction: column; gap: 12px; padding: 16px 22px; \}/, 'the body: padding 16 × 22, its parts 12 apart');
  assert.match(style, /@media \(max-width: 1439px\) \{\s*#replay-body \{ padding: 12px 16px; \}/, '12 × 16 at l and m');
  assert.match(style, /#replay-main \{ display: flex; flex: 1 1 auto; gap: 18px;/, 'the board area 18 from the panel');
  assert.match(style, /#rp-figures \{ flex: none; width: 280px; align-self: stretch;/, 'the panel down to the board area\'s bottom');
  assert.match(style, /\.replay-bar \{[^}]*justify-content: flex-start;[^}]*gap: 28px;[^}]*padding: 8px 14px;/, 'the strip across the body, its items 28 apart');
  assert.match(theme, /\.replay-figure \{\s*font-family: var\(--font-family-mono\);\s*font-size: 17px;\s*font-weight: var\(--font-weight-bold\);/, '3BV and 3BV/s in mono 17 px');
  assert.match(theme, /\.replay-figure--clock \{ font-size: 30px; \}/, 'the clock 30 px');
  assert.match(theme, /\.replay-bar \.ui-counter__digits \{ font-size: 20px; \}/, 'the mines at 20 px');
  // The seek bar: an 8 px track in the line colour, the played part in ink to the thumb, a 24 px thumb ringed in ink on a 3 px drop.
  assert.match(style, /\.replay-seek \{ position: relative; height: 30px; \}/);
  assert.match(style, /\.replay-ticks \{[^}]*top: 2px; height: 9px;/, 'the ticks above the track');
  assert.match(style, /\.replay-tick \{[^}]*width: 3px;/);
  assert.match(style, /\.replay-pauses \{[^}]*top: 11px; height: 8px;/, 'the pause marks on it');
  assert.match(theme, /\.replay-seek \.ui-slider__input::-webkit-slider-runnable-track \{ background: linear-gradient\(to right, var\(--color-ink\) calc\(12px \+ \(100% - 24px\) \* var\(--slider-fill\)\), transparent 0\); \}/, 'played in ink up to the thumb');
  assert.match(theme, /\.replay-seek \.ui-slider__input::-webkit-slider-thumb \{ box-shadow: inset 0 0 0 3px var\(--color-ink\), 0 3px 0 var\(--color-edge\); \}/);
  assert.match(style, /\.replay-seek \.ui-slider__input::-webkit-slider-thumb \{ width: 24px; height: 24px; margin-top: -8px; \}/, 'a 24 px thumb');
  assert.match(theme, /\.replay-pause \{ background: repeating-linear-gradient\(45deg, var\(--color-replay-pause\) 0 3px, transparent 3px 6px\); \}/, 'the pauses hatched');
  assert.match(theme, /\.replay-tick \{ border-radius: 2px; \}/);
  // The end line: the outcome's chip, then the time in mono 17 px.
  assert.match(theme, /\.replay-end__time \{ font-family: var\(--font-family-mono\); font-size: 17px; font-weight: var\(--font-weight-bold\); \}/);
});

test('in a browser, the viewer is the canvas\'s at every supported window size with no horizontal scroll; the code chip and key line give way on small windows', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: patience(5000) });
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-intermediate-lost.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    // [width, height, the frame's rectangle (J-Replay-xl, -l, -m; null full-bleed), the code chip shows, the key line shows,
    // the figures panel shows, the Intermediate board's tile it fits at under the heading (null the board area's to set),
    // the files' place]
    for (const [width, height, rect, code, keys, figures, tile, files] of [
      [1920, 1080, [140, 66, 1640, 940], true, true, true, 33, 'end'], [1366, 768, [32, 24, 1302, 712], true, true, true, 21, 'end'],
      [1024, 768, [20, 16, 984, 728], false, true, false, 19, 'row'], [390, 844, null, false, false, false, 19, 'phone'], [844, 390, null, false, false, false, null, 'sideways']]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const got = await page.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        const body = document.getElementById('replay-body');
        const [frame, board, play, panel, stage] = ['replay-frame', 'replay-board', 'rp-play', 'rp-figures', 'replay-stage'].map(r);
        const shows = (id) => document.getElementById(id).checkVisibility();
        return {
          figures: shows('rp-figures') && panel.left >= board.right && panel.right <= frame.right && Math.abs(panel.bottom - stage.bottom) <= 1,
          scroll: document.documentElement.scrollWidth <= innerWidth && body.scrollWidth <= body.clientWidth,
          frame: frame.left >= 0 && frame.right <= innerWidth && frame.top >= 0 && frame.bottom <= innerHeight,
          board: board.width > 100 && board.height > 100 && board.left >= frame.left && board.right <= frame.right,
          play: play.width > 0,
          code: shows('rp-code'),
          keys: shows('rp-keys'),
        };
      });
      assert.deepEqual(got, { scroll: true, frame: true, board: true, play: true, code, keys, figures }, `${width} × ${height}`);
      const parts = await page.evaluate(() => {
        const r = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { l: Math.round(b.left), t: Math.round(b.top), r: Math.round(b.right), b: Math.round(b.bottom), w: Math.round(b.width), h: Math.round(b.height) }; };
        const body = document.getElementById('replay-body');
        const cs = getComputedStyle(body);
        const shows = (sel) => document.querySelector(sel).checkVisibility();
        const keys = document.getElementById('rp-keys');
        return {
          frame: r('#replay-frame'), body: r('#replay-body'), pad: [cs.paddingTop, cs.paddingLeft], bar: r('.replay-bar'), board: r('#replay-board'),
          play: r('#rp-play'), speed: r('#rp-speed'), toggles: r('.replay-toggles'), download: r('#rp-download'), open: r('#rp-open'), keysBox: r('#rp-keys'),
          controls: r('#replay-controls'), seek: r('.replay-seek'),
          keysOneLine: keys.checkVisibility() ? keys.scrollWidth <= keys.clientWidth + 1 && keys.getBoundingClientRect().height < 30 : null,
          side: ['#rp-speed', '.replay-toggles', '.replay-files', '#rp-keys'].filter(shows),
          icon: document.querySelector('#rp-play > .ui-icon')?.getAttribute('data-icon'),
        };
      });
      const at = `${width} × ${height}`;
      if (rect) {
        assert.deepEqual([parts.frame.l, parts.frame.t, parts.frame.w, parts.frame.h], rect, `${at}: the frame inset on the backdrop`);
        assert.deepEqual(parts.pad, width >= 1440 ? ['16px', '22px'] : ['12px', '16px'], `${at}: the body's padding`);
      }
      assert.equal(parts.icon, 'play', `${at}: Play leads with its icon`);
      if (files !== 'sideways') {
        const inner = parts.body.r - parseFloat(parts.pad[1]);
        assert.ok(Math.abs(parts.bar.r - inner) <= 1 && Math.abs(parts.bar.l - (parts.body.l + parseFloat(parts.pad[1]))) <= 1, `${at}: the strip spans the body`);
        assert.ok(Math.abs(parts.seek.l - parts.bar.l) <= 1 && Math.abs(parts.seek.r - parts.bar.r) <= 1, `${at}: the seek bar spans it too`);
        assert.ok(Math.abs(parts.open.r - parts.controls.r) <= 1, `${at}: the files end on the right`);
      }
      if (files === 'end') assert.ok(Math.abs((parts.open.t + parts.open.b) / 2 - (parts.play.t + parts.play.b) / 2) <= 10, `${at}: the files at the end of the tools row`);
      if (files === 'row') assert.ok(parts.download.t >= parts.play.b && parts.open.b <= parts.keysBox.t, `${at}: the files a row of their own above the key line`);
      if (files === 'phone') {
        assert.ok(parts.speed.t >= parts.play.b && parts.toggles.t >= parts.speed.b && parts.download.t >= parts.toggles.b, `${at}: speed, toggles and files each a row`);
        assert.ok(parts.board.w >= parts.body.w - 2 * 14 - 2, `${at}: the board area fills the width`);
      }
      if (files === 'sideways') {
        assert.deepEqual(parts.side, [], `${at}: the right column holds only the strip, the seek bar and the transport`);
        assert.ok(parts.bar.l >= parts.board.r && parts.seek.l >= parts.board.r && parts.play.l >= parts.board.r, `${at}: beside the board`);
      }
      if (keys && width >= 1024) assert.equal(parts.keysOneLine, true, `${at}: the key line on one line`);
      // The whole board fits the board area, in its frame: no clipping, no scroll bars.
      const framed = await page.evaluate(() => {
        const el = document.querySelector('#replay-board > .ui-board-frame');
        const area = document.getElementById('replay-board').getBoundingClientRect();
        const r = el?.getBoundingClientRect();
        return el && {
          shown: !el.classList.contains('hidden') && r.width > 0,
          inside: r.left >= area.left - 0.5 && r.right <= area.right + 0.5 && r.top >= area.top - 0.5 && r.bottom <= area.bottom + 0.5,
          clipped: document.getElementById('replay-board').hasAttribute('data-board-clipped'),
          width: Math.round(r.width),
        };
      });
      assert.ok(framed, `${width} × ${height}: the board sits in the board frame`);
      assert.deepEqual([framed.shown, framed.inside, framed.clipped], [true, true, false], `${width} × ${height}: the whole board in its frame, nothing clipped`);
      if (tile !== null) {
        // The frame is 16 tiles, the 15 gaps between them and a gap either side: the tile it was laid out at.
        const at = Array.from({ length: 60 }, (_, t) => t + 1).find((t) => 16 * t + 17 * Math.round(t * 0.09) === framed.width);
        assert.ok(at && Math.abs(at - tile) <= 2, `${width} × ${height}: Intermediate at about ${tile} px (${at})`);
      }
    }
    // At its end, at l, the end line joins the tools row and the files keep its right end.
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.evaluate(() => globalThis.__ms.replayViewer.command('end'));
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const ended = await page.evaluate(() => {
      const r = (id) => document.getElementById(id).getBoundingClientRect();
      const [play, open, end, controls] = ['rp-play', 'rp-open', 'replay-end', 'replay-controls'].map(r);
      return { files: Math.abs((open.top + open.bottom) / 2 - (play.top + play.bottom) / 2) <= 10 && Math.abs(open.right - controls.right) <= 1, end: end.width > 0 && end.right <= open.left };
    });
    assert.deepEqual(ended, { files: true, end: true }, '1366 × 768 at the end: the end line after Sound, the files at the tools row\'s right end');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.evaluate(() => globalThis.__ms.replayViewer.seek(6826));
    const panel = await page.evaluate(() => {
      const text = (sel) => document.querySelector(`#rp-figures ${sel}`).textContent;
      return { bbbv: text('[data-figure="bbbv"] .ui-figure__value'), clicks: text('[data-figure="clicks"] .ui-figure__value'), flags: text('[data-figure="flags"] .ui-figure__detail') };
    });
    assert.deepEqual(panel, { bbbv: '12 / 59', clicks: '17', flags: '39 mines left' }, 'the panel follows a seek');
    await page.waitForFunction(() => document.querySelector('#rp-figures .ui-figures__live').textContent === '3BV 12 / 59, 39 mines left', null, { timeout: patience(3000) });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- the viewer as a study tool

const FIXTURE_FILES = ['2d-beginner-won.msrp', '2d-expert-abandoned.msrp', '2d-intermediate-lost.msrp',
  '3d-cube-beginner-lost.msrp', '3d-cube-intermediate-abandoned.msrp', '3d-double-beginner-won.msrp'];
const DOUBLE = '3d-double-beginner-won.msrp';

test('playback opens on the closed board with a lead-in before the first click, on replays an earlier build recorded, 2D and 3D', async () => {
  assert.equal(LEAD_IN_MS, 500);
  for (const file of FIXTURE_FILES) {
    const { viewer, view, viewers } = viewerOver();
    await viewer.show({ replay: blobOf(file) });
    const sim = viewers.made[0].sim;
    const zero = sim.replay.actions.filter((a) => a.time === 0).length;
    assert.ok(zero >= 1, `${file}: the first click is recorded at game time 0`);
    assert.deepEqual([view.last.time, viewers.drawn[0].index, view.last.figures.clock], [-LEAD_IN_MS, 0, '00.000'], `${file}: the start position`);
    viewer.command('toggle');
    viewer.tick(LEAD_IN_MS - 1);
    assert.deepEqual([viewers.drawn.at(-1).index, view.last.figures.clock], [0, '00.000'], `${file}: still closed through the lead-in`);
    viewer.tick(1);
    assert.equal(viewers.drawn.at(-1).index, zero, `${file}: the time-0 actions play as the first action`);
    assert.deepEqual(viewers.pressed.at(-1), Array.from({ length: zero }, (_, i) => i), `${file}: each with its press ring`);
    for (const t of [0, 1, sim.duration / 3, sim.duration / 2, sim.duration]) {
      viewer.seek(t);
      assert.equal(viewers.drawn.at(-1).index, sim.replay.actions.filter((a) => a.time <= t).length, `${file}: every action with time ≤ ${t}`);
    }
  }
  const { viewer, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(DOUBLE) });
  viewer.command('next');
  assert.equal(viewers.drawn.at(-1).index, 4, 'a 3D flag before the first reveal also carries 0, and plays with it');
});

test('Comma and Period step one sampling interval back and on, pausing first, clamped to the start and the end', async () => {
  for (const [file, frame] of [[WON, 50], [CUBE, 100]]) {
    const { viewer, view } = viewerOver();
    await viewer.show({ replay: blobOf(file) });
    viewer.command('toggle');
    assert.equal(viewer.key('Period'), true);
    assert.deepEqual([view.last.time, view.last.playing], [-LEAD_IN_MS + frame, false], `${file}: a frame on, paused`);
    viewer.key('Comma');
    viewer.key('Comma');
    assert.equal(view.last.time, -LEAD_IN_MS, `${file}: held at the start`);
    viewer.seek(1000);
    viewer.command('frameNext');
    assert.equal(view.last.time, 1000 + frame);
    viewer.command('framePrev');
    viewer.command('framePrev');
    assert.equal(view.last.time, 1000 - frame);
    viewer.command('end');
    viewer.command('frameNext');
    assert.equal(view.last.time, view.last.duration, `${file}: held at the end`);
  }
});

test('Minus reaches 0.25× from 0.5×; the default stays 1×', async () => {
  const { viewer, view } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(view.last.speed, 1);
  viewer.key('Minus');
  viewer.key('Minus');
  assert.equal(view.last.speed, 0.25);
  viewer.command('toggle');
  viewer.tick(1000);
  assert.equal(view.last.time, -LEAD_IN_MS + 250);
});

test('the seek bar ticks every action at its time, past the lead-in; ticks closer than a pixel merge within their kind only', () => {
  const actions = [
    { time: 0, kind: 'reveal' }, { time: 0, kind: 'flag' }, { time: 1, kind: 'reveal' }, { time: 500, kind: 'chord' }, { time: 1500, kind: 'reveal' },
  ];
  const ticks = seekTicks(actions, 1500, 500, 200); // 2000 ms over 200 px: 10 ms a pixel
  assert.deepEqual(ticks, [
    { left: 25, kind: 'reveal' }, { left: 25, kind: 'flag' }, { left: 50, kind: 'chord' }, { left: 100, kind: 'reveal' },
  ], 'the reveal 1 ms on merges with its neighbour; the flag beside it stays');
  assert.equal(seekTicks(actions, 1500, 500, 20000).length, 5, 'a wide bar keeps them all');
  assert.deepEqual(seekTicks([], 0, 500, 100), []);
});

test('a press ring for each action playback reaches going forward; a seek that crosses many shows none, a step to an action shows its own', async () => {
  const { viewer, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  const times = viewers.made[0].sim.replay.actions.map((a) => a.time);
  viewer.command('next'); // the first action
  assert.deepEqual(viewers.pressed, [[0]]);
  viewer.seek(5000);
  assert.equal(viewers.pressed.length, 1, 'skipped actions show no ring');
  viewer.seek(times[5]);
  assert.deepEqual(viewers.pressed.at(-1), [5], 'seeking to an action shows its ring once');
  viewer.command('prev');
  assert.deepEqual(viewers.pressed.at(-1), [4], 'stepping back to an action shows its ring');
  const before = viewers.pressed.length;
  viewer.command('toggle');
  viewer.tick(times[7] - times[4]);
  assert.deepEqual(viewers.pressed.slice(before).flat(), [5, 6, 7], 'playback rings every action it reaches');
  viewer.command('toggle');
  assert.ok(viewers.calls.includes('still'), 'a pause tells the board, which drops the trail');
});

test('each action\'s cue is the one the game plays for its outcome', () => {
  const o = (kind, changed, count, before, after) => actionCue(kind, { changed, count, before, after });
  assert.deepEqual(o('reveal', 10, 10, 'playing', 'playing'), [['reveal', 10]]);
  assert.deepEqual(o('chord', 3, 3, 'playing', 'playing'), [['chord', 3]]);
  assert.deepEqual(o('flag', 1, 1, 'playing', 'playing'), [['flag', true, 1]]);
  assert.deepEqual(o('flag', 3, 1, 'playing', 'playing'), [['flag', false, 3]], 'more flags off than on');
  assert.deepEqual(o('reveal', 0, 0, 'playing', 'playing'), [['noop']], 'an action that changed nothing');
  assert.deepEqual(o('reveal', 5, 0, 'playing', 'lost'), [['explode']]);
  assert.deepEqual(o('reveal', 4, 4, 'playing', 'won'), [['reveal', 4], ['win']], 'the end of the game plays win once');
  assert.deepEqual(o('reveal', 0, 0, 'won', 'won'), []);
});

function fakeSound() {
  const played = [];
  return new Proxy({ played }, { get: (t, k) => (k === 'played' ? played : (...args) => played.push([k, ...args])) });
}

test('sound on replays: off by default and kept for the session; playback plays each action\'s cue, seeks and fast speeds play none', async () => {
  const sound = fakeSound();
  const { viewer, view } = viewerOver({ sound });
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(view.last.sound, false, 'off by default');
  viewer.command('toggle');
  viewer.tick(LEAD_IN_MS + 600);
  assert.deepEqual(sound.played, [], 'silent while off');
  viewer.command('sound');
  assert.equal(view.last.sound, true);
  viewer.command('start');
  assert.equal(view.last.playing, true, 'Home keeps playing');
  viewer.tick(LEAD_IN_MS);
  assert.deepEqual(sound.played.map(([k]) => k), ['reveal'], 'the first click plays its cue');
  viewer.seek(6000);
  assert.equal(sound.played.length, 1, 'a seek plays nothing for what it skips');
  viewer.setSpeed(4);
  assert.equal(view.last.playing, true);
  viewer.tick(500);
  assert.equal(sound.played.length, 1, 'nothing above 2×');
  viewer.setSpeed(2);
  viewer.tick(100000);
  assert.deepEqual(sound.played.at(-1), ['win'], 'the end of the game plays win once');
  assert.equal(sound.played.filter(([k]) => k === 'win').length, 1);
  await viewer.show({ replay: blobOf(LOST) });
  assert.equal(view.last.sound, true, 'kept for the session');
  const before = sound.played.length;
  viewer.command('end');
  assert.deepEqual(sound.played.slice(before), [['explode']], 'End lands on the losing click: its cue alone, none for what it skips');
  viewer.command('prev');
  assert.equal(sound.played.length, before + 1, 'stepping back plays nothing');
  viewer.command('next');
  assert.deepEqual(sound.played.slice(before + 1), [['explode']], 'stepping on to the losing click plays it');
});

test('the 3BV partition comes from the engine: every opening with its border numbers, each isolated number on its own', () => {
  const sim = createSimulator(blobOf(LOST));
  const { graph } = sim.grid;
  const { mine, number } = sim.game.state;
  const p = bbbvPartition(graph, mine, number);
  assert.equal(p.openings + p.isolated, sim.replay.check.bbbv, 'as many regions as the board\'s 3BV');
  const tints = regionTints(p, graph, 6);
  for (let c = 0; c < graph.count; c++) {
    if (mine[c]) assert.equal(tints[c], -1);
    else if (p.label[c] >= p.openings) assert.equal(tints[c], 6, 'an isolated number takes the mark');
    else assert.ok(tints[c] >= 0 && tints[c] < 6);
  }
  for (let c = 0; c < graph.count; c++) {
    if (mine[c] || number[c] !== 0) continue;
    graph.forEachNeighbour(c, (nb) => {
      if (number[nb] === 0 && !mine[nb]) assert.equal(tints[nb], tints[c], 'one opening, one tint');
    });
  }
  // Two openings that share a border number differ.
  for (let c = 0; c < graph.count; c++) {
    if (mine[c] || number[c] === 0) continue;
    const around = new Set();
    graph.forEachNeighbour(c, (nb) => { if (!mine[nb] && number[nb] === 0) around.add(p.label[nb]); });
    const list = [...around];
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const zi = p.label.indexOf(list[i]), zj = p.label.indexOf(list[j]);
      assert.notEqual(tints[zi], tints[zj], 'neighbouring openings differ');
    }
  }
});

test('Show 3BV\'s tints are the canvas\'s: three confetti colours for the openings, nothing on an isolated number', () => {
  assert.equal(BBBV_TINTS, 3);
  assert.deepEqual(BBBV_TINT_TOKENS, ['--color-confetti-2', '--color-confetti-3', '--color-confetti-5']);
  const sim = createSimulator(blobOf(LOST));
  const tints = regionTints(bbbvPartition(sim.grid.graph, sim.game.state.mine, sim.game.state.number), sim.grid.graph);
  assert.ok(tints.every((k) => k >= -1 && k <= BBBV_TINTS), 'three tints and the isolated mark');
  // The 2D paint: a tile-sized square, its corners rounded 4 px, at .42 of the colour; an isolated number unpainted.
  const ops = [];
  const ctx = {
    set globalAlpha(v) { ops.push(['alpha', v]); }, set fillStyle(v) { ops.push(['fill', v]); },
    beginPath() { ops.push(['begin']); }, roundRect(...a) { ops.push(['round', ...a]); }, fill() { ops.push(['paint']); },
    strokeRect() { ops.push(['stroke']); }, fillRect() { ops.push(['rect']); },
  };
  paintBbbv(ctx, [{ x: 3, y: 3, size: 34, tint: 1 }, { x: 40, y: 3, size: 34, tint: BBBV_TINTS }], ['#a', '#b', '#c']);
  assert.deepEqual(ops, [['alpha', 0.42], ['fill', '#b'], ['begin'], ['round', 3, 3, 34, 34, 4], ['paint'], ['alpha', 1]]);
  assert.match(read('js/main.js'), /BBBV_TINT_TOKENS\.map\(\(name\) => parseRgb\(token\(name\)\)\)/, 'the 3D cubes take the same colours');
  assert.doesNotMatch(read('js/main.js') + read('js/replay/viewer-2d.js') + read('themes/joyful-tiles/theme.css'), /--color-replay-bbbv/, 'the replay palette is retired');
});

test('Show 3BV paints the partition over the board, off by default, and holds across seeks', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(LOST) });
  assert.equal(view.last.bbbv, false);
  viewer.key('KeyB');
  assert.equal(view.last.bbbv, true);
  const [name, tints] = viewers.calls.find((c) => c[0] === 'bbbv');
  assert.equal(name, 'bbbv');
  assert.equal(tints.length, viewers.made[0].sim.grid.graph.count);
  const shown = viewers.calls.length;
  viewer.seek(5000);
  viewer.command('end');
  assert.equal(viewers.calls.slice(shown).filter((c) => c[0] === 'bbbv').length, 0, 'seeking keeps it');
  viewer.command('bbbv');
  assert.deepEqual(viewers.calls.at(-1), ['bbbv', null]);
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(view.last.bbbv, false, 'off for the next replay');
});

test('Free camera with Follow, in 3D only: C detaches the camera, C again follows the recording', async () => {
  const { viewer, view, viewers } = viewerOver();
  await viewer.show({ replay: blobOf(WON) });
  assert.equal(view.last.camera, null, 'a 2D replay has no camera');
  viewer.key('KeyC');
  assert.equal(viewers.calls.some((c) => c[0] === 'free'), false);
  await viewer.show({ replay: blobOf(CUBE) });
  assert.equal(view.last.camera, 'follow', 'Follow by default');
  viewer.command('toggle');
  viewer.key('KeyC');
  assert.equal(view.last.camera, 'free');
  assert.deepEqual(viewers.calls.at(-1), ['free', true]);
  assert.equal(view.last.playing, true, 'playback runs on');
  viewer.command('camera');
  assert.deepEqual([view.last.camera, viewers.calls.at(-1)], ['follow', ['free', false]]);
  assert.equal(REPLAY_KEYS.Space, 'toggle', 'Space stays play / pause');
  for (const code of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE']) assert.equal(Object.hasOwn(REPLAY_KEYS, code), false, `${code} flies, it is no replay key`);
});

test('the key line is the canvas\'s: keyboard keys in lower case, C in 3D, Esc last; the controller\'s buttons only while a pad is connected', () => {
  const line = REPLAY_KEY_LINE.map((k) => [k.keys, k.pad, k.label]);
  assert.deepEqual(line, [
    ['Space', 'Start / Y', 'play / pause'], ['← / →', 'LB / RB', 'action'], [', / .', null, 'frame'],
    ['- / =', 'LT / RT', 'speed'], ['B', null, '3BV'], ['C', null, 'camera'], ['Esc', 'B', 'back'],
  ]);
  assert.equal(REPLAY_KEY_LINE.find((k) => k.keys === 'C').only, 'box', 'the camera key only in 3D');
  for (const k of REPLAY_KEY_LINE) for (const key of k.keys.split(' / ')) {
    const code = Object.keys(REPLAY_KEYS).find((c) => ({ Space: 'Space', '←': 'ArrowLeft', '→': 'ArrowRight', ',': 'Comma', '.': 'Period', '-': 'Minus', '=': 'Equal', B: 'KeyB', C: 'KeyC' })[key] === c);
    if (key !== 'Esc') assert.ok(code, `${key} is a replay key`);
  }
  const style = read('css/style.css');
  assert.match(style, /\.replay-key__pad \{ display: none; \}/, 'the controller\'s buttons hidden');
  assert.match(style, /body\.pad-connected \.replay-key__pad \{ display: inline-flex; \}/, 'shown while a pad is connected');
  assert.match(read('js/main.js'), /document\.body\.classList\.toggle\('pad-connected', !!p\)/, 'the shell marks a connected pad');
  assert.match(style, /\.replay-keys \{[^}]*flex-wrap: nowrap;[^}]*gap: 4px 14px;[^}]*font-size: 13px;/, 'one line at 13 px, 14 px apart');
});

test('a replay file is named for its board and end date, its bytes the stored blob', async () => {
  assert.equal(replayFileName('classic-2d:square:9x9:10:guess', '2026-10-09T10:00:00.000Z'), 'minesweeper-classic-2d-square-9x9-10-guess-2026-10-09T10-00-00.msrp');
  assert.doesNotMatch(replayFileName('a/b\\c*?"<>|', 'x'), /[\\/:*?"<>|]/);
  const saved = [];
  const files = { save: (bytes, name) => saved.push([bytes, name]) };
  const blob = blobOf(WON);
  const { viewer } = viewerOver({ files, library: fakeLibrary({ a: blob }) });
  assert.equal(viewer.download(), null, 'nothing to save before a replay plays');
  await viewer.show({ replayId: 'a' });
  const header = decodeReplay(blob).header;
  assert.equal(viewer.download(), replayFileName(boardKey(header.board), header.endedAt));
  assert.equal(saved[0][1], replayFileName(boardKey(header.board), header.endedAt));
  assert.deepEqual([...saved[0][0]], [...blob], 'byte for byte the stored blob');
  await viewer.show({ replay: { blob, listing: {} } });
  viewer.download();
  assert.deepEqual([...saved[1][0]], [...blob], 'or the hand-off\'s blob');
});

const fakeFile = (bytes, size = bytes.length) => {
  const file = { size, name: 'x.msrp', read: 0 };
  file.arrayBuffer = () => { file.read++; return Promise.resolve(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)); };
  return file;
};

test('an imported replay file is verified like any other, refused over 16 MB before it is read, and watched, not kept', async () => {
  assert.equal(MAX_REPLAY_FILE_BYTES, 16 * 1024 * 1024);
  const library = { ...fakeLibrary(), add: () => assert.fail('an imported replay is not kept'), pin: () => assert.fail('nor pinned') };
  const { viewer, view, router } = viewerOver({ library });
  await viewer.show({ file: fakeFile(blobOf(WON)), returnTo: RETURN });
  assert.equal(viewer.state.status, 'ready');
  viewer.back();
  assert.deepEqual(router.went.at(-1), ['records', { data: RETURN.data }], 'Back returns to where it was opened from');
  const big = fakeFile(blobOf(WON), MAX_REPLAY_FILE_BYTES + 1);
  await viewer.show({ file: big });
  assert.deepEqual([view.log.at(-1), big.read], [['failed', FAILURES.unreadable], 0], 'refused before it is read');
  await viewer.show({ file: fakeFile(new Uint8Array([7, 7, 7])) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unreadable]);
  const tampered = decodeReplay(blobOf(WON));
  tampered.check.digest ^= 1;
  await viewer.show({ file: fakeFile(encodeReplay(tampered)) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.unreproducible]);
  await viewer.show({ file: fakeFile(encodeReplay(decodeReplay(blobOf(WON)), { version: REPLAY_FORMAT_VERSION + 1 })) });
  assert.deepEqual(view.log.at(-1), ['failed', FAILURES.newer]);
  // Open replay file from the viewer: opened from where the viewer was opened from.
  await viewer.show({ replay: blobOf(WON), returnTo: RETURN });
  await viewer.openFile(fakeFile(blobOf(LOST)));
  assert.equal(viewer.state.end, null);
  viewer.back();
  assert.deepEqual(router.went.at(-1), ['records', { data: RETURN.data }]);
});

test('the 2D pointer leaves a trail of its last 150 ms while playing, none on a seek or while paused', () => {
  assert.equal(TRAIL_MS, 150);
  const track = movementTrack([
    { time: 0, type: 'sample', values: [0, 0] }, { time: 50, type: 'sample', values: [64, 0] }, { time: 100, type: 'sample', values: [128, 0] },
    { time: 150, type: 'sample', values: [192, 0] }, { time: 200, type: 'sample', values: [256, 0] },
  ], 50);
  const trail = trailPoints(track, 200);
  assert.ok(trail.length >= 3, 'a few points behind the pointer');
  for (const [x] of trail) assert.ok(x < 4 && x >= 4 * (200 - TRAIL_MS) / 200 - 1e-9, 'within the last 150 ms');
  assert.deepEqual(trailPoints(track, 0), [], 'nothing before the first sample');
  const sim = createSimulator(blobOf(WON));
  const pointer = { ...fakePointer(), trails: [], rings: [] };
  pointer.trail = (points) => pointer.trails.push(points.length);
  pointer.ring = (x, y, kind) => pointer.rings.push([x, y, kind]);
  const v = createViewer2D({ view: fakeView(), sim, pointer });
  v.draw(sim.seek(2000), { playing: true });
  assert.ok(pointer.trails.at(-1) > 0, 'playing: a trail');
  v.draw(sim.seek(5000));
  assert.equal(pointer.trails.at(-1), 0, 'a seek clears it');
  v.draw(sim.seek(5050), { playing: true });
  v.still();
  assert.equal(pointer.trails.at(-1), 0, 'paused: only the pointer');
});

test('a 2D press ring sits on the recorded pointer, or on the acted cell\'s centre when the pointer was not on it', () => {
  const replay = decodeReplay(blobOf(WON));
  const cell = replay.actions[3].cell;
  const col = cell % 9, row = Math.floor(cell / 9);
  replay.movement = [{ time: 0, type: 'cursor', cell: -1 }, { time: replay.actions[3].time, type: 'sample', values: [col * 64 + 16, row * 64 + 48] }];
  const sim = createSimulator(replay);
  const pointer = { ...fakePointer(), rings: [], trail() {} };
  pointer.ring = (x, y, kind) => pointer.rings.push([x, y, kind]);
  const v = createViewer2D({ view: fakeView(), sim, pointer });
  v.press([{ index: 3, ...replay.actions[3] }]);
  assert.deepEqual(pointer.rings.at(-1), [(col + 0.25) * 40, (row + 0.75) * 40, replay.actions[3].kind], 'on the pointer');
  const first = replay.actions[0];
  v.press([{ index: 0, ...first }]);
  assert.deepEqual(pointer.rings.at(-1), [(first.cell % 9 + 0.5) * 40, (Math.floor(first.cell / 9) + 0.5) * 40, 'reveal'], 'no pointer yet: the cell\'s centre');
});

// ---------------------------------------------------------------- the 2D viewer on the grid geometry

// A geometry `width` × `height` laid out transposed — cell c (column c % width, row c / width) at the
// square geometry's column row, row column — each tile's outline a triangle in its square's box: a
// board on which no square pitch arithmetic finds a cell, its centre or its tint's shape.
function transposedGeometry(width, height) {
  const base = createGeometry('square', height, width);
  const to = (c) => (Number.isInteger(c) && c >= 0 && c < width * height ? Math.floor(c / width) + height * (c % width) : -1);
  const from = (v) => (v < 0 ? -1 : Math.floor(v / height) + width * (v % height));
  return {
    kind: 'transposed', width, height, count: width * height, minTile: base.minTile, tileCap: base.tileCap,
    extent: (tile, gap) => base.extent(tile, gap),
    outline(c, tile, gap) {
      const o = base.outline(to(c), tile, gap);
      return o && { ...o, shape: 'triangle', orientation: 'up', points: [[o.x + o.width / 2, o.y], [o.x + o.width, o.y + o.height], [o.x, o.y + o.height]] };
    },
    centre: (c, tile, gap) => base.centre(to(c), tile, gap),
    glyphBox: (c, tile, gap) => base.glyphBox(to(c), tile, gap),
    cellAt: (x, y, tile, gap) => from(base.cellAt(x, y, tile, gap)),
    neighbour: () => -1,
  };
}

// A fake board view laid out with a gap: tile 40, pitch 44, the board's corner at 5, 7.
function gapView() {
  const view = fakeView();
  view.layout = { ...view.layout, tile: 40, pitch: 44, gap: 4, offsetX: 5, offsetY: 7 };
  return view;
}

test('the 2D viewer rebuilds its geometry from the replay\'s board, and refuses an unknown grid kind when it is made', () => {
  const { header } = decodeReplay(blobOf(WON));
  const square = replayGeometry(header.board);
  assert.deepEqual([square.kind, square.width, square.height], ['square', 9, 9]);
  const played = createSimulator(blobOf(WON));
  const { header: h } = played.replay;
  const sim = { grid: played.grid, game: played.game, replay: { ...played.replay, header: { ...h, board: { ...h.board, grid: 'nonagon' } } } };
  const view = fakeView();
  assert.throws(() => createViewer2D({ view, sim, pointer: fakePointer() }), RangeError, 'at setup, not at draw time');
  assert.deepEqual(view.calls.game, [], 'before the view is handed the game');
});

test('on another geometry the 2D viewer finds the pointer\'s cell, the press rings\' centres and the tints\' outlines through it', () => {
  const geometry = transposedGeometry(9, 9);
  const replay = decodeReplay(blobOf(WON));
  const act = replay.actions.find((a) => a.cell % 9 !== Math.floor(a.cell / 9));
  const t = act.time;
  const { x: cx, y: cy } = geometry.centre(act.cell, 40, 4);
  const values = [Math.round((cx / 44) * 64), Math.round((cy / 44) * 64)];
  replay.movement = [{ time: 0, type: 'cursor', cell: -1 }, { time: t, type: 'sample', values }];
  const sim = createSimulator(replay);
  const view = gapView();
  view.layout = { ...view.layout, scrolls: true };
  const rings = [];
  const pointer = { ...fakePointer(), trail() {}, ring: (x, y, kind) => rings.push([x, y, kind]) };
  let painted = null;
  const overlay = { paint: (rects) => { painted = rects; }, clear() {} };
  const v = createViewer2D({ view, sim, pointer, overlay, geometry });

  v.draw(sim.seek(t));
  assert.deepEqual(view.calls.ensure, [act.cell], 'a view that scrolls follows the geometry\'s cell under the pointer');
  const at = { x: 5 + (values[0] / 64) * 44, y: 7 + (values[1] / 64) * 44 };
  assert.deepEqual(pointer.at.at(-1), [at.x, at.y], 'the pointer in board units: the layout\'s pitch');
  v.press([{ index: 0, ...act }]);
  assert.deepEqual(rings.at(-1), [at.x, at.y, act.kind], 'the pointer is on the acted cell as the geometry hit-tests it');
  const other = replay.actions.find((a) => a.time < t && a.cell !== act.cell);
  if (other) {
    const c = geometry.centre(other.cell, 40, 4);
    v.press([{ index: 0, ...other }]);
    assert.deepEqual(rings.at(-1), [5 + c.x, 7 + c.y, other.kind], 'off the pointer: the geometry\'s centre of the cell');
  }
  const first = replay.actions[0];
  const c0 = geometry.centre(first.cell, 40, 4);
  v.press([{ index: 0, ...first }]);
  assert.deepEqual(rings.at(-1), [5 + c0.x, 7 + c0.y, first.kind], 'before the first sample: the cell\'s centre');

  const tints = new Array(81).fill(-1);
  tints[act.cell] = 1;
  v.showBbbv(tints);
  const o = geometry.outline(act.cell, 40, 4);
  assert.deepEqual(painted, [{
    x: 5 + o.x, y: 7 + o.y, size: 40, width: o.width, height: o.height, shape: 'triangle',
    points: o.points.map(([px, py]) => [5 + px, 7 + py]), tint: 1,
  }], 'the tint fills the tile\'s outline where the geometry puts it');
});

// A Hexagon or Triangle Beginner game won by a player who knows the mines: a first reveal, a flag,
// then every closed safe cell in index order, the recorded pointer on each acted cell (in board
// units at a 40 px tile and 4 px gap) and the cursor shown for one of them.
const FLAT_BOARDS = {
  hex: { mode: 'hexagon', width: 9, height: 9, mines: 13, build: createHexGrid },
  tri: { mode: 'triangle', width: 13, height: 7, mines: 8, build: createTriGrid },
};
function flatReplay(grid) {
  const { mode, width, height, mines: count, build } = FLAT_BOARDS[grid];
  const n = width * height;
  const mines = Array.from({ length: count }, (_, k) => (3 + 7 * k) % n).sort((a, b) => a - b);
  const geometry = createGeometry(grid, width, height);
  const game = createGameWithMines({ graph: build(width, height).graph, profile: REFERENCE_PROFILE, version: 1, mines });
  const actions = [], movement = [{ time: 0, type: 'cursor', cell: -1 }];
  let time = 0;
  const act = (kind, cell) => {
    const { x, y } = geometry.centre(cell, 40, 4);
    movement.push({ time, type: 'sample', values: [Math.round((x / 44) * 64), Math.round((y / 44) * 64)] });
    actions.push({ time, kind, cell });
    if (kind === 'reveal') game.reveal(cell); else game.toggleFlag(cell);
    time += 300;
  };
  act('reveal', 0);
  act('flag', mines[0]);
  for (let c = 0; c < n && game.phase === PHASE.PLAYING; c++) {
    if (!mines.includes(c) && game.cellState(c) === 'closed') {
      if (actions.length === 4) movement.push({ time, type: 'cursor', cell: c });
      act('reveal', c);
    }
  }
  const { bbbv, bbbvSolved, clicks } = game.counts();
  return decodeReplay(encodeReplay({
    header: {
      id: `${grid}-won`, mode, graph: { kind: grid, width, height },
      board: createBoardIdentity({ mode, grid, width, height, mines: count, noGuess: false }),
      mines, profile: { id: REFERENCE_PROFILE, version: 1 }, seed: 1, generatorVersion: 1,
      endedAt: '2026-10-24T12:00:00.000Z', movementEndedAt: null, pauses: [],
    },
    actions,
    movement,
    check: { outcome: game.phase === PHASE.WON ? 'won' : 'abandoned', elapsedMs: time - 300, bbbv, bbbvSolved, clicks: structuredClone(clicks), digest: cellStateDigest(game.state) },
  }));
}

test('a Hexagon and a Triangle replay draw through their grid\'s geometry: the pointer\'s cell, press rings, the cursor and tints in the tile\'s outline', () => {
  for (const grid of ['hex', 'tri']) {
    const replay = flatReplay(grid);
    assert.equal(replay.check.outcome, 'won', `${grid}: the game is won`);
    const { width, height } = FLAT_BOARDS[grid];
    const geometry = createGeometry(grid, width, height);
    const sim = createSimulator(replay);
    const view = gapView();
    view.layout = { ...view.layout, scrolls: true };
    const rings = [];
    const pointer = { ...fakePointer(), trail() {}, ring: (x, y, kind) => rings.push([x, y, kind]) };
    let painted = null;
    const v = createViewer2D({ view, sim, pointer, overlay: { paint: (rects) => { painted = rects; }, clear() {} } });
    assert.deepEqual(view.calls.game, [sim.game], `${grid}: the board view draws the simulator's game`);

    const act = replay.actions[4];
    const sample = replay.movement.find((e) => e.type === 'sample' && e.time === act.time);
    const frame = sim.seek(act.time);
    v.draw(frame, { playing: true });
    assert.deepEqual(view.calls.update.at(-1), [...frame.changed], `${grid}: the cells the frame changed are redrawn`);
    const at = [5 + (sample.values[0] / 64) * 44, 7 + (sample.values[1] / 64) * 44];
    assert.deepEqual(pointer.at.at(-1), at, `${grid}: the pointer in the geometry's board units`);
    assert.equal(view.calls.cursor.at(-1), act.cell, `${grid}: the recorded cursor's ring`);
    v.press([{ index: 4, ...act }]);
    assert.deepEqual(rings.at(-1), [...at, act.kind], `${grid}: the pointer is on the acted cell as the geometry hit-tests it`);
    const keyed = replay.actions[0];
    const c = geometry.centre(keyed.cell, 40, 4);
    v.press([{ index: 0, ...keyed, time: act.time }]);
    assert.deepEqual(rings.at(-1), [5 + c.x, 7 + c.y, keyed.kind], `${grid}: off the pointer, the ring sits on the cell's centre`);

    const tints = new Array(width * height).fill(-1);
    tints[act.cell] = 0;
    v.showBbbv(tints);
    const o = geometry.outline(act.cell, 40, 4);
    assert.notEqual(o.shape, 'square');
    assert.deepEqual(painted, [{ x: 5 + o.x, y: 7 + o.y, size: 40, width: o.width, height: o.height, shape: o.shape,
      points: o.points.map(([px, py]) => [5 + px, 7 + py]), tint: 0 }], `${grid}: the tint fills the tile's outline`);
    v.draw(sim.seek(sim.duration), { playing: false });
    assert.equal(sim.seek(sim.duration).phase, 'won');
    v.destroy();
  }
});

test('the viewer screen opens a Hexagon and a Triangle replay on their own viewer, titled and coded for the mode, and plays it to its end line', async () => {
  for (const [grid, name, token] of [['hex', 'Hexagon', 'H'], ['tri', 'Triangle', 'T']]) {
    const replay = flatReplay(grid);
    const { viewer, view, viewers } = viewerOver();
    await viewer.show({ replay: encodeReplay(replay) });
    assert.equal(viewer.state.status, 'ready', `${grid}: verified and ready`);
    const [, info] = view.log[2];
    assert.equal(info.kind, grid);
    assert.equal(viewers.made[0].kind, grid, `${grid}: the mode's own viewer mounts`);
    assert.equal(info.title, `Replay · ${name} · Beginner`, `${grid}: the title names the mode`);
    const parsed = parseBoardCode(info.code);
    assert.equal(parsed.ok, true, `${grid}: the strip's code chip carries the board code`);
    assert.equal(parsed.board.mode, FLAT_BOARDS[grid].mode, `${grid}: the code names the mode`);
    assert.ok(info.code.includes(token), `${grid}: with its token`);
    viewer.command('next');
    viewer.command('next');
    assert.equal(viewers.drawn.at(-1).index, 2, `${grid}: stepping applies its actions`);
    viewer.command('end');
    assert.deepEqual([view.last.ended, view.last.end], [true, endLine(replay.check)], `${grid}: the end line`);
    assert.equal(viewers.drawn.at(-1).phase, 'won');
    viewer.command('start');
    assert.equal(viewers.drawn.at(-1).index, 0, `${grid}: a seek back to the start`);
  }
});

test('Show 3BV fills an outline other than a square as its polygon, at the same alpha', () => {
  const ops = [];
  const ctx = {
    set globalAlpha(v) { ops.push(['alpha', v]); }, set fillStyle(v) { ops.push(['fill', v]); },
    beginPath() { ops.push(['begin']); }, roundRect(...a) { ops.push(['round', ...a]); }, fill() { ops.push(['paint']); },
    moveTo(...a) { ops.push(['move', ...a]); }, lineTo(...a) { ops.push(['line', ...a]); }, closePath() { ops.push(['close']); },
  };
  paintBbbv(ctx, [
    { x: 0, y: 0, size: 40, width: 40, height: 40, shape: 'triangle', points: [[20, 0], [40, 40], [0, 40]], tint: 2 },
    { x: 50, y: 0, size: 40, width: 40, height: 40, shape: 'square', points: [[50, 0], [90, 0], [90, 40], [50, 40]], tint: 0 },
  ], ['#a', '#b', '#c']);
  assert.deepEqual(ops, [
    ['alpha', 0.42], ['fill', '#c'], ['begin'], ['move', 20, 0], ['line', 40, 40], ['line', 0, 40], ['close'], ['paint'], ['alpha', 1],
    ['alpha', 0.42], ['fill', '#a'], ['begin'], ['round', 50, 0, 40, 40, 4], ['paint'], ['alpha', 1],
  ], 'a square keeps its rounded tile-sized square');
});

test('every 2D fixture draws its pointer, trail, press rings and tints where the square pitch arithmetic put them', () => {
  for (const name of ['2d-beginner-won', '2d-expert-abandoned', '2d-intermediate-lost']) {
    const sim = createSimulator(new Uint8Array(readFileSync(join(ROOT, `tests/fixtures/replays/${name}.msrp`))));
    const { width } = sim.grid;
    const view = gapView();
    const trails = [];
    const rings = [];
    const pointer = { ...fakePointer(), trail: (points) => trails.push(points), ring: (x, y, kind) => rings.push([x, y, kind]) };
    let painted = null;
    const v = createViewer2D({ view, sim, pointer, overlay: { paint: (rects) => { painted = rects; }, clear() {} } });
    const px = ([x, y]) => [5 + x * 44, 7 + y * 44];
    for (let t = 0; t <= sim.duration; t += Math.max(1, Math.floor(sim.duration / 40))) {
      v.draw(sim.seek(t), { playing: true });
      const p = pointerAt(v.track, t);
      assert.deepEqual(pointer.at.at(-1), p ? px(p) : null, `${name} at ${t}: the pointer`);
      if (p) assert.deepEqual(trails.at(-1), trailPoints(v.track, t).map(px), `${name} at ${t}: the trail`);
    }
    for (const a of sim.replay.actions) {
      v.press([{ index: 0, ...a }]);
      const p = pointerAt(v.track, a.time);
      const col = a.cell % width, row = Math.floor(a.cell / width);
      const on = p && Math.floor(p[0]) === col && Math.floor(p[1]) === row;
      assert.deepEqual(rings.at(-1), [...(on ? px(p) : [5 + col * 44 + 20, 7 + row * 44 + 20]), a.kind], `${name}: the ring of action at ${a.time}`);
    }
    const tints = Array.from({ length: sim.grid.graph.count }, (_, c) => (c % 5 === 4 ? -1 : c % 3));
    v.showBbbv(tints);
    const want = [];
    tints.forEach((tint, c) => { if (tint >= 0) want.push([5 + (c % width) * 44, 7 + Math.floor(c / width) * 44, 40, tint]); });
    assert.deepEqual(painted.map((r) => [r.x, r.y, r.size, r.tint]), want, `${name}: each tint on its tile`);
  }
});

test('the press rings take the canvas\'s look, 30 px in a 3 px border, the flag\'s at .6, and keep their expanding fade', () => {
  assert.match(read('css/style.css'), /\.replay-ring \{[^}]*width: 30px; height: 30px; margin: -15px 0 0 -15px;/);
  const theme = read('themes/joyful-tiles/theme.css');
  assert.match(theme, /@keyframes joyful-tiles-ring \{ from \{ transform: scale\(0\.35\); opacity: 1; \} to \{ transform: scale\(1\.4\); opacity: 0; \} \}/,
    'from .35 to 1.4 while fading');
  assert.match(theme, /\.replay-ring \{\s*border: 3px solid currentColor;/);
  assert.match(theme, /@keyframes joyful-tiles-ring-flag \{ from \{ transform: scale\(0\.35\); opacity: 0\.6; \} to \{ transform: scale\(1\.4\); opacity: 0; \} \}/, 'the flag ring from .6');
  assert.match(theme, /\.replay-ring--flag \{ color: var\(--color-replay-flag\); animation-name: joyful-tiles-ring-flag; \}/);
  // The recorded pointer and its trail stay the dot and the fading dots.
  assert.match(theme, /\.replay-pointer \{\s*border: 2px solid var\(--color-replay-pointer-outline\);\s*border-radius: 50%;/);
});
