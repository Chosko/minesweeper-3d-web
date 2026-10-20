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
import { movementTrack, pointerAt, cursorAt, pointerPixel, createViewer2D, trailPoints, TRAIL_MS } from '../js/replay/viewer-2d.js';
import {
  FAILURES, COMMANDS, REPLAY_KEYS, REPLAY_PAD, REPLAY_KEY_LINE, SEEK_STEP_MIN_MS, MAX_REPLAY_FILE_BYTES, seekStep, clockText, overlayFigures, endLine,
  pauseMarks, pausesText, seekTicks, actionCue, regionTints, prepareReplay, createReplayViewer, replayCode, replayTitle, replayFigures,
} from '../js/replay/viewer.js';
import { FIGURES, liveFigures, figuresLine } from '../js/shell/live-figures.js';
import { encodeBoardCode, parseBoardCode } from '../js/records/board-code.js';
import { replayFileName } from '../js/records/replay-list.js';
import { boardKey } from '../js/records/board.js';
import { bbbvPartition } from '../js/engine/metrics.js';
import { createSimulator, REFUSAL } from '../js/replay/simulator.js';
import { decodeReplay, encodeReplay, REPLAY_FORMAT_VERSION } from '../js/replay/format.js';
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

test('the seek bar names its place in the results time format; the clock and position read ss.mmm', () => {
  const src = read('js/replay/viewer.js');
  assert.match(src, /aria-valuetext', `\$\{formatTime\(at\)\} of \$\{formatTime\(state\.duration\)\}`/);
  assert.match(src, /set\('position', el\.position, `\$\{f\.clock\} \/ \$\{clockText\(state\.duration\)\}`\)/);
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
  return { drawn, made, pressed, how, calls, square: board('square'), box: board('box') };
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
  assert.match(replayHtml, /<header class="ui-frame__head">[\s\S]*<button type="button" id="rp-back"[\s\S]*<\/header>[\s\S]*<div class="ui-overlay-bar replay-bar"[\s\S]*<div id="rp-code" class="ui-code ui-code--compact hidden">[\s\S]*<div id="replay-stage">/,
    'Back in the frame\'s head; the code chip in the overlay bar, above the board area and taking no room from it');
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
    bbbv: ['0 / 15', null], pace: null, rate: [DASH, 'Best 2.00'], clicks: ['0', `Efficiency ${DASH}`], flags: ['0', '10 mines left'],
  }, 'the start position: nothing solved, no time elapsed');
  viewer.seek(5000);
  assert.deepEqual(at(), {
    bbbv: ['7 / 15', null], pace: ['+0.800 s', 'Best 9.000 s'], rate: ['1.40', 'Best 2.00'], clicks: ['19', 'Efficiency 36.8%'], flags: ['3', '7 mines left'],
  }, '5 s in: behind the best\'s pace');
  assert.equal(view.last.live.bbbv.progress, 7 / 15);
  viewer.seek(3932);
  assert.deepEqual(at(), {
    bbbv: ['7 / 15', null], pace: ['\u22120.268 s', 'Best 9.000 s'], rate: ['1.78', 'Best 2.00'], clicks: ['15', 'Efficiency 46.7%'], flags: ['2', '8 mines left'],
  }, 'a seek back: the figures of the earlier frame, ahead of the pace');
  assert.equal(view.last.live.pace.ahead, true);
  viewer.command('end');
  assert.deepEqual(at(), {
    bbbv: ['15 / 15', null], pace: ['+0.971 s', 'Best 9.000 s'], rate: ['1.50', 'Best 2.00'], clicks: ['28', 'Efficiency 53.6%'], flags: ['5', '5 mines left'],
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
  assert.deepEqual([view.last.live.pace.detail, view.last.live.rate.detail], ['Best 4.000 s', 'Best 3.50'], 'the bests as they stand when the replay opens');
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
    'rp-ticks', 'rp-keys', 'rp-show-bbbv', 'rp-sound', 'rp-camera', 'rp-download', 'rp-open', 'replay-file']) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id}`);
  }
  assert.match(html, /<section id="replay" class="ui-backdrop hidden" aria-label="Replay">\s*<section class="ui-frame" id="replay-frame" aria-labelledby="replay-title">/, 'a screen frame on the backdrop');
  assert.match(html, /<header class="ui-frame__head">\s*<div class="ui-frame__start"><button type="button" id="rp-back" class="ui-button ui-button--secondary ui-button--sm">Back <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button><\/div>\s*<h2 class="ui-frame__title" id="replay-title">Replay<\/h2>/,
    'its head: Back with its key hint, then the title');
  assert.match(html, /<div class="ui-frame__body" id="replay-body">\s*<div class="ui-overlay-bar replay-bar"[\s\S]*<div id="replay-main">\s*<div id="replay-stage">\s*<div id="replay-board"><\/div>\s*<section id="replay-message"[\s\S]*<section class="ui-figures" id="rp-figures"[\s\S]*<div id="replay-controls"/,
    'its body: the counters, the board area with the message over it and the figures panel beside it, then the controls');
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
  assert.match(html, /id="rp-play" class="ui-button ui-button--primary"><span id="rp-play-label">Play<\/span> <span class="ui-key-hint replay-key-hint" aria-hidden="true"><kbd class="ui-key-hint__key">Space<\/kbd><\/span><\/button>/,
    'Play carries its key, out of its name');
  assert.match(html, /<span id="replay-end" class="replay-end hidden" role="status"><span id="replay-end-outcome" class="ui-chip"><\/span> <span id="replay-end-time" class="ui-text"><\/span><\/span>/, 'the end line: the outcome as a chip, then the time');
  assert.match(html, /<div id="rp-keys" class="ui-key-hints replay-keys"><\/div>/, 'the key line is a row of key hints');
  assert.doesNotMatch(html, /data-esc-hint/, 'each Back carries its key hint; no text hint beside it');
  assert.match(html, /class="ui-overlay-bar[^"]*"/);
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
  assert.match(MAIN, /viewers: WEBGL2 \? \{ square: mountReplay2D, box: mountReplay3D \} : \{ square: mountReplay2D \}/);
  assert.match(MAIN, /function mountReplay2D\(options\) \{ return mountViewer2D\(\{ \.\.\.options, scale: SETTINGS\.get\('boardScale'\) \}\); \}/);
});

// ---------------------------------------------------------------- in a browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}
test('in a browser without WebGL 2, a 2D replay plays and a 3D replay says it needs WebGL 2', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: patience(5000) });
    assert.equal(await page.evaluate(() => globalThis.__ms.renderer), null, 'no WebGL 2 here');
    const watch = (file) => page.evaluate(async (f) => {
      const bytes = new Uint8Array(await (await fetch(`/tests/fixtures/replays/${f}`)).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    }, file);

    await watch(WON);
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready', null, { timeout: patience(5000) });
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas:not(.board-motion):not(.board-ring)').length), 1, 'the 2D board view is mounted');
    await page.click('#rp-speed [data-value="4"]');
    await page.click('#rp-play');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: patience(3000) });
    assert.equal(await page.evaluate(() => document.getElementById('replay-end').textContent), 'Won 9.971 s');
    await page.click('#rp-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    await watch(CUBE);
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'failed', null, { timeout: patience(5000) });
    assert.equal(await page.evaluate(() => document.getElementById('replay-message-text').textContent), FAILURES.webgl2);
    assert.equal(await page.evaluate(() => document.getElementById('replay').classList.contains('replay--scene')), false, 'no 3D scene is let through');
    assert.equal(await page.evaluate(() => document.activeElement?.id), 'replay-message-back');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back works');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

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
    assert.equal(await text('rp-position'), '00.000 / 09.971');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#replay-board canvas').length) >= 1, true, 'the board view is mounted');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#rp-ticks .replay-tick').length) > 0, true, 'the actions tick the seek bar');
    assert.equal(await page.evaluate(() => document.querySelectorAll('#rp-pauses .replay-pause').length), 0, 'no pauses, no marks');
    assert.equal(await text('rp-pauses-text'), '');
    assert.equal(await text('replay-title'), 'Replay · Classic 2D · Beginner');
    assert.equal(await page.evaluate(() => document.querySelector('#rp-back .ui-key-hint__key')?.textContent), 'Esc', 'the frame\'s Back carries its key hint');
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
    // Past 1 s of replay time, playing or already at its end: at 4× the playing window is about 2.5 s,
    // which one stalled frame on a loaded machine can step past. The recorded pointer stays when it stops.
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.time > 1000, null, { timeout: patience(3000) });
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('#replay-board .replay-pointer')).display !== 'none'), true, 'the recorded pointer shows');
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.ended, null, { timeout: patience(3000) });
    assert.equal(await text('replay-end'), 'Won 9.971 s');
    assert.equal(await page.evaluate(() => document.getElementById('replay-end-outcome').className), 'ui-chip ui-chip--won', 'the outcome as its chip');
    assert.equal(await text('rp-play-label'), 'Play again', 'at the end Play plays it again');
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
    const marks = await page.evaluate(() => [...document.querySelectorAll('#rp-pauses .replay-pause')].map((m) => [m.style.left, m.style.width, getComputedStyle(m).backgroundColor]));
    assert.equal(marks.length, 2);
    assert.match(marks[0][0], /^14\.3\d*%$/, 'placed after the lead-in');
    assert.match(marks[1][1], /^28\.6\d*%$/);
    assert.notEqual(marks[0][2], 'rgba(0, 0, 0, 0)', 'the mark is coloured');
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
    assert.deepEqual(await page.evaluate(() => [document.getElementById('rp-position').textContent, document.querySelectorAll('#rp-ticks .replay-tick, #rp-pauses .replay-pause').length,
      document.getElementById('replay-end').classList.contains('hidden')]), ['', 0, true], 'the bar is cleared');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the viewer fills its frame at every supported window size with no horizontal scroll; the code chip and key line give way on small windows', async (t) => {
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
    // [width, height, the code chip shows, the key line shows, the figures panel shows]
    for (const [width, height, code, keys, figures] of [[1920, 1080, true, true, true], [1366, 768, true, true, true], [1024, 768, false, true, false], [390, 844, false, false, false], [844, 390, false, false, false]]) {
      await page.setViewportSize({ width, height });
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const got = await page.evaluate(() => {
        const r = (id) => document.getElementById(id).getBoundingClientRect();
        const body = document.getElementById('replay-body');
        const [frame, board, play, panel] = ['replay-frame', 'replay-board', 'rp-play', 'rp-figures'].map(r);
        const shows = (id) => document.getElementById(id).checkVisibility();
        return {
          figures: shows('rp-figures') && panel.left >= board.right && panel.right <= frame.right && panel.bottom <= frame.bottom,
          scroll: document.documentElement.scrollWidth <= innerWidth && body.scrollWidth <= body.clientWidth,
          frame: frame.left >= 0 && frame.right <= innerWidth && frame.top >= 0 && frame.bottom <= innerHeight,
          board: board.width > 100 && board.height > 100 && board.left >= frame.left && board.right <= frame.right,
          play: play.width > 0,
          code: shows('rp-code'),
          keys: shows('rp-keys'),
        };
      });
      assert.deepEqual(got, { scroll: true, frame: true, board: true, play: true, code, keys, figures }, `${width} × ${height}`);
    }
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

test('the key line names the replay keys with their controller buttons where they have one', () => {
  const line = REPLAY_KEY_LINE.map((k) => [k.keys, k.pad, k.label]);
  assert.deepEqual(line, [
    ['Space / K', 'Start / Y', 'Play'], ['← / →', 'LB / RB', 'Action'], [', / .', null, 'Frame'], ['Home / End', null, 'Start / End'],
    ['− / =', 'LT / RT', 'Speed'], ['B', null, 'Show 3BV'], ['C', null, 'Free camera'],
  ]);
  assert.equal(REPLAY_KEY_LINE.find((k) => k.keys === 'C').only, 'box', 'Free camera only in 3D');
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
