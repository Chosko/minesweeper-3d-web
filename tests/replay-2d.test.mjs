// Classic 2D capture (js/replay/sampler-2d.js, js/classic2d/session.js, js/classic2d/mode.js) and
// the replay on the mode contract (js/shell/mode-host.js, js/shell/pause.js): the pointer in board
// coordinates, the sampler's schedule on the game clock, a recorded 2D game sealed through the
// session with a fake clock, a no-guess failure played standard, and the replay beside the summary
// in the finished and abandoned reports.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  boardPoint, createSampler2D, mountSampler2D, SAMPLE_INTERVAL_MS, SAMPLE_STEPS,
} from '../js/replay/sampler-2d.js';
import { boardLayout } from '../js/classic2d/board-view.js';
import { createSession } from '../js/classic2d/session.js';
import { createClassic2DMode } from '../js/classic2d/mode.js';
import { createModeHost } from '../js/shell/mode-host.js';
import { createPauseController } from '../js/shell/pause.js';
import { decodeReplay, cellStateDigest } from '../js/replay/format.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { boardKey } from '../js/records/board.js';

const settle = () => new Promise((r) => setTimeout(r, 0));

// Beginner, 9 × 9: the mines wall cell 0 in, so the first click at 80 opens the rest of the board
// and the game is won by revealing 0.
const MINES = [1, 2, 3, 9, 10, 11, 12, 18, 19, 20];
const BEGINNER = { size: 'beginner', noGuess: false };

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

// Answers every board request with MINES, or with the queued results first.
function fakeClient(queue = []) {
  return {
    requests: [],
    request(req) {
      this.requests.push(req);
      const next = queue.shift();
      return Promise.resolve(next ?? { ok: true, mines: MINES, seed: req.seed, generatorVersion: 1 });
    },
    cancel() {},
  };
}

function replayAgain(replay) {
  const { graph, profile, mines } = replay.header;
  const game = createGameWithMines({ graph: createSquareGrid(graph.width, graph.height).graph, profile: profile.id, version: profile.version, mines });
  for (const a of replay.actions) {
    if (a.kind === 'reveal') game.reveal(a.cell);
    else if (a.kind === 'flag') game.toggleFlag(a.cell);
    else game.chord(a.cell);
  }
  return game;
}

// ---------- board coordinates ----------

test('boardPoint: the pointer in cell units, quantised to 1/SAMPLE_STEPS of a cell, off the board too', () => {
  const layout = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  const { tile, offsetX, offsetY } = layout;
  assert.ok(offsetX > 0 && offsetY >= 0, 'a centred board');
  const at = (col, row, scroll = { x: 0, y: 0 }) => boardPoint(layout, scroll, offsetX + col * tile, offsetY + row * tile);
  assert.deepEqual(at(2.5, 3.5), [2.5 * SAMPLE_STEPS, 3.5 * SAMPLE_STEPS]);
  assert.deepEqual(at(0, 0), [0, 0]);
  assert.deepEqual(at(-1, 10), [-SAMPLE_STEPS, 10 * SAMPLE_STEPS], 'off the board');
  for (const v of at(1.013, 2.97)) assert.ok(Number.isInteger(v));

  const scrolled = boardLayout({ cols: 30, rows: 16, width: 400, height: 300 });
  assert.ok(scrolled.scrolls);
  const p = boardPoint(scrolled, { x: 3 * scrolled.tile, y: scrolled.tile }, scrolled.tile / 2, scrolled.tile / 2);
  assert.deepEqual(p, [3.5 * SAMPLE_STEPS, 1.5 * SAMPLE_STEPS], 'the scroll position counts');
});

// ---------- the sampler on a real session ----------

test('a recorded 2D game: actions, samples about 20 times a second and cursor moves on the game clock, sealed at the win', async () => {
  const clock = fakeClock();
  const session = createSession({ choice: BEGINNER, client: fakeClient(), clock, randomSeed: () => 7 });
  let pos = [0, 0];
  const sampler = createSampler2D({ session, point: () => pos });
  let finished = null;
  session.on('finished', (e) => { finished = e; });

  assert.equal(SAMPLE_INTERVAL_MS, 50);
  assert.equal(session.recording, false, 'not before the first click');
  sampler.tick();
  sampler.cursor(4);
  session.toggleFlag(1); // before the board: changes nothing, not recorded
  await session.reveal(80);
  assert.equal(session.recording, true);

  clock.advance(20); pos = [16, 32]; sampler.tick(); // t 20: a sample (and the cursor where it is)
  clock.advance(30); pos = [17, 32]; sampler.tick(); // t 50: too soon
  clock.advance(30); sampler.tick(); // t 80
  sampler.tick(); // the same time: nothing
  sampler.cursor(40); // t 80
  sampler.cursor(-1); // no cursor: nothing

  session.pause();
  assert.equal(session.recording, false, 'not while paused');
  clock.advance(5000); pos = [99, 99]; sampler.tick();
  sampler.cursor(41);
  session.resume();
  clock.advance(70); sampler.tick(); // t 150: the sample and the cursor moved while paused

  session.reveal(80); // t 150: changes nothing, still recorded
  clock.advance(100);
  session.reveal(0); // t 250: the win
  assert.ok(finished, 'finished');
  assert.equal(session.recording, false, 'not after the end');
  clock.advance(100); pos = [1, 1]; sampler.tick(); sampler.cursor(42);

  const { summary, replay } = finished;
  assert.equal(summary.outcome, 'won');
  assert.ok(replay && replay.blob instanceof Uint8Array);
  assert.equal(replay.listing.id, summary.id);
  assert.equal(replay.listing.outcome, 'won');
  assert.equal(replay.listing.elapsedMs, 250);
  assert.equal(session.replay(), replay, 'sealing again returns the same replay');

  const decoded = decodeReplay(replay.blob);
  assert.equal(decoded.header.id, summary.id);
  assert.equal(decoded.header.mode, 'classic-2d');
  assert.deepEqual(decoded.header.graph, { kind: 'square', width: 9, height: 9 });
  assert.equal(boardKey(decoded.header.board), boardKey(summary.board));
  assert.deepEqual(decoded.header.mines, MINES);
  assert.equal(decoded.header.seed, 7);
  assert.deepEqual(decoded.actions, [
    { time: 0, kind: 'reveal', cell: 80 },
    { time: 150, kind: 'reveal', cell: 80 },
    { time: 250, kind: 'reveal', cell: 0 },
  ]);
  assert.deepEqual(decoded.movement, [
    { time: 20, type: 'sample', values: [16, 32] },
    { time: 20, type: 'cursor', cell: 4 },
    { time: 80, type: 'sample', values: [17, 32] },
    { time: 80, type: 'cursor', cell: 40 },
    { time: 150, type: 'sample', values: [99, 99] },
    { time: 150, type: 'cursor', cell: 41 },
  ]);
  const again = replayAgain(decoded);
  assert.equal(cellStateDigest(again.state), decoded.check.digest);
  assert.deepEqual(again.summary().clicks, decoded.check.clicks);
  assert.equal(decoded.check.elapsedMs, 250);
});

test('a session left before its first click records and reports nothing; restart discards the recorder', async () => {
  const clock = fakeClock();
  const session = createSession({ choice: BEGINNER, client: fakeClient(), clock, randomSeed: () => 7 });
  const abandoned = [];
  session.on('abandoned', (e) => abandoned.push(e));
  session.toggleFlag(3);
  assert.equal(session.replay(), null);
  session.restart();
  assert.equal(abandoned.length, 0);

  await session.reveal(80);
  clock.advance(500);
  session.toggleFlag(1);
  session.restart(); // abandoned after the first click: a replay of the abandoned game
  assert.equal(abandoned.length, 1);
  const { summary, replay } = abandoned[0];
  assert.equal(summary.outcome, 'abandoned');
  assert.equal(replay.listing.outcome, 'abandoned');
  assert.equal(replay.listing.id, summary.id);
  const decoded = decodeReplay(replay.blob);
  assert.deepEqual(decoded.actions, [
    { time: 0, kind: 'reveal', cell: 80 },
    { time: 500, kind: 'flag', cell: 1 },
  ], 'the flag on the discarded closed board is not in it');
  assert.equal(cellStateDigest(replayAgain(decoded).state), decoded.check.digest);

  assert.equal(session.replay(), null, 'the new closed board has no replay');
  session.leave();
  assert.equal(abandoned.length, 1);
});

test('a no-guess board that failed and was played standard records the standard board, with its first reveal', async () => {
  const clock = fakeClock();
  const client = fakeClient([{ ok: false, reason: 'no board' }]);
  const session = createSession({ choice: { size: 'beginner', noGuess: true }, client, clock, randomSeed: () => 7 });
  const abandoned = [];
  session.on('abandoned', (e) => abandoned.push(e));
  session.toggleFlag(1);
  assert.equal(await session.reveal(80), null);
  assert.equal(session.state, 'failed');
  await session.playStandard();
  assert.equal(session.state, 'playing');
  clock.advance(300);
  session.leave();
  const { summary, replay } = abandoned[0];
  assert.equal(summary.board.noGuess, false);
  const decoded = decodeReplay(replay.blob);
  assert.equal(decoded.header.board.noGuess, false);
  assert.deepEqual(decoded.actions, [{ time: 0, kind: 'reveal', cell: 80 }]);
});

test('the sampler keeps to its schedule across frame jitter: 20 samples a second at 60 frames a second', () => {
  let t = 0;
  const times = [];
  const session = { recording: true, elapsedMs: () => Math.round(t), recordSample: () => times.push(Math.round(t)), recordCursor() {} };
  const sampler = createSampler2D({ session, point: () => [0, 0] });
  for (let frame = 0; frame <= 60; frame++) { t = frame * (1000 / 60); sampler.tick(); }
  assert.equal(times.length, 21, 'one sample at 0 and twenty in the second after it');
  t = 5000; sampler.tick(); // after a gap the schedule starts afresh
  t = 5040; sampler.tick();
  t = 5050; sampler.tick();
  assert.deepEqual(times.slice(-2), [5000, 5050]);
});

// ---------- the sampler's browser wiring ----------

test('mountSampler2D: the last pointer position over the page, read through the view at each tick', () => {
  const listeners = new Map();
  const win = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
  };
  const layout = boardLayout({ cols: 9, rows: 9, width: 600, height: 500 });
  const view = { layout, scroll: { x: 0, y: 0 }, canvas: { getBoundingClientRect: () => ({ left: 10, top: 20 }) } };
  let t = 0;
  const samples = [];
  const cursors = [];
  const session = {
    recording: true,
    elapsedMs: () => t,
    recordSample: (values) => samples.push([t, [...values]]),
    recordCursor: (cell) => cursors.push([t, cell]),
  };
  const m = mountSampler2D({ view, session, win });
  m.tick();
  assert.deepEqual(samples, [], 'no pointer seen yet');
  listeners.get('mousemove')({ clientX: 10 + layout.offsetX + 2 * layout.tile, clientY: 20 + layout.offsetY - layout.tile });
  m.tick();
  assert.deepEqual(samples, [[0, [2 * SAMPLE_STEPS, -SAMPLE_STEPS]]]);
  t = 60;
  m.cursor(7);
  assert.deepEqual(cursors, [[60, 7]]);
  m.destroy();
  assert.equal(listeners.has('mousemove'), false);
});

// ---------- the mode contract ----------

function mounts() {
  const log = { samplers: [] };
  const board = () => ({
    setGame() {}, update() {}, setHidden() {}, setPressed() {}, setCursor(c) { log.cursorSet = c; }, ensureVisible() {}, destroy() {},
  });
  const input = ({ view }) => ({ view, input: { reset() {} }, destroy() {}, pad() {} });
  const sampler = ({ view, session }) => {
    const s = { view, session, ticks: 0, cursors: [], destroyed: false };
    s.tick = () => { s.ticks += 1; };
    s.cursor = (c) => { s.cursors.push(c); };
    s.destroy = () => { s.destroyed = true; };
    log.samplers.push(s);
    return s;
  };
  const cursor = ({ view }) => { log.cursorView = view; return input({ view }); };
  return { log, mount: { board, pointer: input, cursor, sampler } };
}

function shell2D({ clock = fakeClock() } = {}) {
  const host = createModeHost();
  const pauser = createPauseController({ modes: host, showCard() {}, confirm: (_r, go) => go(), goMenu() {} });
  const handed = { finished: [], abandoned: [] };
  pauser.attach('finished', (summary, mode, replay) => handed.finished.push({ summary, mode, replay }));
  pauser.attach('abandoned', (summary, mode, replay) => handed.abandoned.push({ summary, mode, replay }));
  const { log, mount } = mounts();
  const flow = {
    openBoardChoice() {}, show() {}, container: () => ({}), hud() {}, board() {}, generating() {}, failed() {},
  };
  const lastChoice = { current: BEGINNER, save: () => Promise.resolve(), load: () => Promise.resolve() };
  const mode = host.register('classic-2d', (report) => createClassic2DMode(report, {
    flow, lastChoice, createClient: () => fakeClient(), mount, clock, randomSeed: () => 7,
  }));
  return { host, pauser, mode, handed, log, clock };
}

test('the mode: finished carries the replay beside the summary, through the host and the pause controller', async () => {
  const { host, mode, handed, log, clock } = shell2D();
  host.start('classic-2d', BEGINNER);
  const sampler = log.samplers[0];
  assert.equal(sampler.session.recording, false);
  mode.tick();
  assert.equal(sampler.ticks, 1, 'tick() drives the sampler');
  log.cursorView.setCursor(12);
  assert.deepEqual(sampler.cursors, [12], 'the cursor input\'s moves reach the sampler');
  assert.equal(log.cursorSet, 12, 'and the view still draws them');

  await sampler.session.reveal(80);
  clock.advance(400);
  sampler.session.reveal(0);
  await settle();
  assert.equal(handed.finished.length, 1);
  const { summary, replay, mode: id } = handed.finished[0];
  assert.equal(id, 'classic-2d');
  assert.equal(summary.outcome, 'won');
  assert.equal(replay.listing.id, summary.id);
  assert.equal(decodeReplay(replay.blob).check.elapsedMs, 400);
  host.leave();
  assert.equal(handed.abandoned.length, 0, 'a finished game is not abandoned');
  assert.equal(sampler.destroyed, true, 'the sampler goes with the board');
});

test('the mode: restart and leave report the abandoned game with its replay; before the first click nothing', async () => {
  const { host, handed, log, clock } = shell2D();
  host.start('classic-2d', BEGINNER);
  host.restart();
  assert.equal(handed.abandoned.length, 0, 'nothing before the first click');
  assert.equal(log.samplers[0].destroyed, true);

  const session = log.samplers[1].session;
  await session.reveal(80);
  clock.advance(1200);
  session.toggleFlag(1);
  host.restart();
  assert.equal(handed.abandoned.length, 1);
  let { summary, replay } = handed.abandoned[0];
  assert.equal(summary.outcome, 'abandoned');
  assert.equal(replay.listing.id, summary.id);
  assert.equal(replay.listing.outcome, 'abandoned');
  assert.equal(decodeReplay(replay.blob).actions.length, 2);

  const next = log.samplers[2].session;
  await next.reveal(80);
  clock.advance(100);
  host.leave();
  assert.equal(handed.abandoned.length, 2);
  ({ summary, replay } = handed.abandoned[1]);
  assert.notEqual(summary.id, handed.abandoned[0].summary.id);
  assert.equal(replay.listing.id, summary.id);
});

test('the host: a mode that passes no replay reports null beside its summary', () => {
  const host = createModeHost();
  const seen = [];
  host.on('finished', (e) => seen.push(['finished', e.replay]));
  host.on('abandoned', (e) => seen.push(['abandoned', e.replay]));
  let report;
  const summary = { id: 'g', outcome: 'abandoned' };
  host.register('3d', (r) => {
    report = r;
    return { openBoardChoice() {}, start() {}, pause() {}, resume() {}, restart() {}, leave() {}, summary: () => summary };
  });
  host.start('3d', {});
  report.started();
  host.restart();
  report.started();
  report.finished({ id: 'g', outcome: 'won' });
  assert.deepEqual(seen, [['abandoned', null], ['finished', null]]);
});
