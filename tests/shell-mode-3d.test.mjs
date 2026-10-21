import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createModeHost, MODE_METHODS, MODE_EVENTS } from '../js/shell/mode-host.js';
import { create3DMode, END_DELAY_MS, END_DELAY_MAX_MS, endDelayMs, waveStepS, WAVE_CELL_S, createFiguresFeed } from '../js/shell/mode-3d.js';
import { startCell } from '../js/generation/start-cell.js';
import { createSession } from '../js/mode3d/session.js';
import { LEARN_BOARD, learnChoice } from '../js/mode3d/learn.js';
import { generate } from '../js/generation/generate.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { createGameWithMines, PHASE, CELL } from '../js/engine/rules.js';
import { PROFILE_3D } from '../js/engine/profiles.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

// A fake 3D game session (js/mode3d/session.js): its board, seed and generator version, a settable
// clock, the engine's counts and summary, its events, and a record of the calls the adapter makes
// on it.
const CLICKS = Object.freeze({ reveal: { effective: 2, wasted: 0 }, flag: { effective: 1, wasted: 1 }, chord: { effective: 0, wasted: 0 } });
function fakeSession(board = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: false }) {
  const listeners = { generating: new Set(), started: new Set(), failed: new Set(), finished: new Set() };
  const s = {
    board,
    seed: 99,
    generatorVersion: 1,
    ms: 0,
    spans: [],
    outcome: null,
    calls: [],
    elapsedMs: () => s.ms,
    // the session's pause spans up to `until`, at most `count` of them, the open one clipped
    pauses: (until = s.ms, count = Infinity) => s.spans.filter((p) => p.start <= until).slice(0, count)
      .map((p) => ({ start: p.start, end: Math.min(p.end, until) })),
    counts: () => ({ bbbv: 10, bbbvSolved: 4, clicks: CLICKS }),
    engineSummary: () => (s.outcome
      ? { outcome: s.outcome, dimensions: { width: 4, height: 5, depth: 6 }, mineCount: 7, bbbv: 10, bbbvSolved: s.outcome === 'won' ? 10 : 4, clicks: CLICKS }
      : null),
    on(type, fn) { listeners[type].add(fn); return () => listeners[type].delete(fn); },
    emit(type, payload) {
      if (type === 'finished') s.outcome = payload.state;
      for (const fn of [...listeners[type]]) fn(payload);
    },
    listening: () => Object.values(listeners).reduce((n, set) => n + set.size, 0),
    state: 'ready',
    pause() { s.calls.push('pause'); },
    resume() { s.calls.push('resume'); },
    leave() { s.calls.push('leave'); },
    cancel() {
      s.calls.push('cancel');
      if (s.state !== 'generating') return false;
      s.state = 'ready';
      return true;
    },
  };
  return s;
}

// The summary the builder makes of the fake session's game, without its id and end time.
const BOARD_3D = { mode: '3d', width: 4, height: 5, depth: 6, mines: 7, noGuess: false };
const plain = (summary) => ({ ...summary, id: undefined, endedAt: undefined });
const expected = (outcome, elapsedMs, pauses = 0, pausedMs = 0) => {
  const bbbvSolved = outcome === 'won' ? 10 : 4;
  return {
    id: undefined, board: BOARD_3D, outcome, elapsedMs, pauses, pausedMs, bbbv: 10, bbbvSolved, clicks: CLICKS,
    bbbvPerSecond: elapsedMs === 0 ? null : bbbvSolved / (elapsedMs / 1000), efficiency: (100 * bbbvSolved) / 4,
    seed: 99, generatorVersion: 1, endedAt: undefined,
  };
};

// A clock whose timers fire when the test advances it (the end delay).
function fakeClock() {
  let now = 0;
  const timers = new Set();
  return {
    setTimeout(fn, ms) { const t = { at: now + ms, fn }; timers.add(t); return t; },
    clearTimeout(t) { timers.delete(t); },
    advance(ms) { now += ms; for (const t of [...timers]) if (t.at <= now) { timers.delete(t); t.fn(); } },
  };
}

// A fake shell flow: records every call; start and restart hand back a new fake session.
function fakeFlow(board) {
  const calls = [];
  const sessions = [];
  const handed = [];
  const next = (pregen = null, forced = null) => {
    const s = fakeSession(board);
    if (forced) { s.forced = forced; s.startCell = forced.startCell; }
    sessions.push(s);
    handed.push(pregen);
    return s;
  };
  const flow = {
    clock: fakeClock(),
    lost: false,
    sessions,
    handed,
    get session() { return sessions.at(-1); },
    contextLost: () => flow.lost,
    openBoardChoice: () => calls.push(['openBoardChoice']),
    start: (c, pregen) => { calls.push(['start', c]); return next(pregen, c?.forced ?? null); },
    pause: (note) => calls.push(['pause', note]),
    resume: (source) => calls.push(['resume', source]),
    restart: (source, pregen, forced) => { calls.push(['restart', source]); return next(pregen, forced ?? null); },
    leave: () => calls.push(['leave']),
  };
  return { flow, calls };
}

function setup({ board, client } = {}) {
  const host = createModeHost();
  const events = [];
  for (const t of MODE_EVENTS) host.on(t, (e) => events.push([t, e]));
  const { flow, calls } = fakeFlow(board);
  if (client) { flow.client = client; flow.randomSeed = () => 4242; }
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  const types = () => events.map(([t]) => t);
  return { host, events, types, flow, calls, mode };
}

const CHOICE = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: false };

// ---------------------------------------------------------------- the contract

test('the 3D adapter implements the contract over the shell flow, as today', () => {
  const { host, flow, calls, mode } = setup();
  for (const m of MODE_METHODS) assert.equal(typeof mode[m], 'function', m);
  assert.equal(mode.failureScreen, 'ctxlost');
  host.openBoardChoice('3d');
  host.start('3d', CHOICE);
  host.pause({ note: 'Controller disconnected' });
  host.resume({ source: 'pad' });
  host.resume();
  host.restart({ source: 'pad' });
  host.leave();
  assert.deepEqual(calls, [
    ['openBoardChoice'], ['start', CHOICE], ['pause', 'Controller disconnected'],
    ['resume', 'pad'], ['resume', 'pointer'], ['restart', 'pad'], ['leave'],
  ]);
  assert.equal(flow.sessions.length, 2, 'start and restart each open a session');
});

test('pause pauses the session, whose clock keeps running; a pending board request is not cancelled', () => {
  const { host, flow } = setup();
  host.start('3d', CHOICE);
  host.pause();
  assert.deepEqual(flow.session.calls, ['pause'], 'the session pauses and is not left');
  host.resume({ source: 'key' });
  assert.deepEqual(flow.session.calls, ['pause'], 'the pause ends with play, not with the click-to-play card');
});

test('the summaries carry the session\'s pauses: their count and total, the open one up to the summary\'s time', () => {
  const { host, events, flow, mode } = setup();
  host.start('3d', CHOICE);
  flow.session.emit('started', {});
  flow.session.spans = [{ start: 500, end: 1500 }, { start: 3000, end: Infinity }];
  flow.session.ms = 4200;
  assert.deepEqual(plain(mode.summary()), expected('abandoned', 4200, 2, 2200));
  flow.session.spans = [{ start: 500, end: 1500 }, { start: 3000, end: 4000 }];
  flow.session.ms = 9000;
  flow.session.emit('finished', { state: 'won' });
  flow.clock.advance(END_DELAY_MS);
  assert.deepEqual(plain(events.at(-1)[1].summary), expected('won', 9000, 2, 2000));
});

test('cancelGeneration cancels a board being generated through the session and reports nothing', () => {
  const { host, flow, mode, types } = setup();
  assert.equal(mode.cancelGeneration(), false, 'no game');
  host.start('3d', CHOICE);
  assert.equal(mode.cancelGeneration(), false, 'a closed box: nothing to cancel');
  flow.session.state = 'generating';
  assert.equal(mode.cancelGeneration(), true);
  assert.equal(flow.session.state, 'ready', 'back to the closed box');
  assert.ok(!flow.session.calls.includes('leave'), 'the session goes on');
  assert.deepEqual(types(), [], 'nothing started or abandoned');
  host.leave();
  assert.deepEqual(types(), [], 'a game left before its first applied reveal reports nothing');
});

// ---------------------------------------------------------------- the end delay

const box = (X, Y, Z) => ({ X, Y, Z });

test('the end delay is one function of the board\'s size: 1000 ms on small boards, growing with the diagonal, 2500 ms at 100³ and never above', () => {
  assert.equal(END_DELAY_MS, 1000, 'the floor');
  assert.equal(END_DELAY_MAX_MS, 2500, 'the cap');
  for (const b of [box(6, 6, 6), box(4, 5, 6), box(2, 2, 2), box(8, 1, 1), box(1, 1, 1)]) assert.equal(endDelayMs(b), 1000, `${b.X}×${b.Y}×${b.Z}`);
  assert.equal(endDelayMs(box(100, 100, 100)), 2500);
  let prev = 0;
  for (let n = 2; n <= 200; n += 3) {
    const d = endDelayMs(box(n, n, n));
    assert.ok(Number.isInteger(d), `${n}³: whole milliseconds`);
    assert.ok(d >= prev, `${n}³: never shorter for a larger board`);
    assert.ok(d >= 1000 && d <= 2500, `${n}³: ${d} ms`);
    prev = d;
  }
  assert.ok(endDelayMs(box(12, 12, 8)) > 1000, 'Cube Expert waits longer than Beginner');
  assert.ok(endDelayMs(box(30, 30, 30)) > endDelayMs(box(12, 12, 8)), 'and a larger box longer still');
  assert.equal(endDelayMs(box(400, 400, 400)), 2500);
});

test('the loss wave from any cube reaches the farthest cell, and that cell\'s reveal completes, before the end delay ends', () => {
  for (const b of [box(6, 6, 6), box(8, 8, 8), box(12, 12, 8), box(30, 16, 9), box(50, 50, 50), box(100, 100, 100), box(160, 3, 2)]) {
    const step = waveStepS(b);
    assert.ok(step > 0 && step <= 0.06, `${b.X}×${b.Y}×${b.Z}: ${step} s per cell`);
    // the farthest cell from a corner is the diagonal: the worst origin
    const far = Math.hypot(b.X - 1, b.Y - 1, b.Z - 1);
    const done = far * step + WAVE_CELL_S;
    assert.ok(done * 1000 <= endDelayMs(b), `${b.X}×${b.Y}×${b.Z}: the far cell is done at ${(done * 1000).toFixed(0)} ms, the delay is ${endDelayMs(b)} ms`);
  }
});

test('the renderer paces its waves from the same function, so the wave and the delay cannot drift apart', () => {
  const src = read('js/render.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.match(src, /import \{[^}]*\bwaveStepS\b[^}]*\bWAVE_CELL_S\b[^}]*\} from '\.\/shell\/mode-3d\.js'/);
  const setup = src.slice(src.indexOf('_waveSetup('), src.indexOf('_clearOldLayers()'));
  assert.match(setup, /const delay = waveStepS\(g\)/, 'the per-cell delay is the board\'s');
  assert.match(src, /local \/ \$\{glslFloat\(WAVE_CELL_S\)\}/, 'the shader\'s per-cell reveal lasts WAVE_CELL_S');
});

test('the adapter reports finished after the finished board\'s end delay on the clock, not after END_DELAY_MS', () => {
  const big = { X: 60, Y: 60, Z: 60, mines: 7, noGuess: false }; // the fake game's 7 mines
  const { host, flow, types } = setup({ board: big });
  host.start('3d', big);
  const engine = flow.session.engineSummary;
  flow.session.engineSummary = () => { const e = engine(); return e && { ...e, dimensions: { width: 60, height: 60, depth: 60 } }; };
  flow.session.emit('started', {});
  flow.session.emit('finished', { state: 'lost' });
  const wait = endDelayMs(big);
  assert.ok(wait > END_DELAY_MS);
  flow.clock.advance(END_DELAY_MS);
  assert.equal(types().includes('finished'), false, 'still in the end delay after one second');
  flow.clock.advance(wait - END_DELAY_MS - 1);
  assert.equal(types().includes('finished'), false);
  flow.clock.advance(1);
  assert.equal(types().at(-1), 'finished');
});

// ---------------------------------------------------------------- the reports

test('game started is reported at the first applied reveal, with can pause', () => {
  const { host, types, events, flow } = setup();
  host.start('3d', CHOICE);
  assert.deepEqual(types(), [], 'nothing while the box is closed or the board is generated');
  assert.equal(host.summary(), null, 'no summary before the first applied reveal');
  flow.session.ms = 1500;
  flow.session.emit('started', { changed: new Int32Array(0) });
  assert.deepEqual(types(), ['started', 'canPause']);
  assert.deepEqual(plain(events[0][1].summary), expected('abandoned', 1500), 'the builder\'s summary so far');
  assert.equal(host.state.canPause, true);
});

test('summary() is the started game\'s summary so far, outcome abandoned', () => {
  const { host, flow, mode } = setup();
  host.start('3d', CHOICE);
  assert.equal(mode.summary(), null);
  flow.session.emit('started', {});
  flow.session.ms = 4200;
  assert.deepEqual(plain(mode.summary()), expected('abandoned', 4200));
  assert.deepEqual(plain(host.summary()), plain(mode.summary()));
  assert.equal(host.summary().id, mode.summary().id, 'every summary of one game carries the same id');
});

test('game finished carries the outcome at a win or a loss, and the game can no longer pause', () => {
  for (const state of ['won', 'lost']) {
    const { host, types, events, flow, mode } = setup();
    host.start('3d', CHOICE);
    flow.session.emit('started', {});
    flow.session.ms = 9000;
    flow.session.emit('finished', { state });
    assert.deepEqual(types(), ['started', 'canPause', 'canPause'], 'pause stops at once; the end effect plays first');
    flow.clock.advance(END_DELAY_MS);
    assert.deepEqual(types(), ['started', 'canPause', 'canPause', 'finished']);
    assert.deepEqual(plain(events.at(-1)[1].summary), expected(state, 9000));
    assert.equal(events.at(-1)[1].summary.id, events[0][1].summary.id, 'the finished summary names the started game');
    flow.session.ms = 12000;
    assert.deepEqual(mode.summary(), events.at(-1)[1].summary, 'summary() after the end is the finished summary');
    assert.equal(host.state.canPause, false);
    host.leave();
    assert.equal(types().includes('abandoned'), false, 'a finished game is never abandoned');
  }
});

test('restart and leave of a started, unfinished game report game abandoned', () => {
  const { host, types, events, flow } = setup();
  host.start('3d', CHOICE);
  flow.session.emit('started', {});
  flow.session.ms = 2000;
  host.restart({ source: 'pointer' });
  assert.deepEqual(types(), ['started', 'canPause', 'abandoned', 'canPause']);
  assert.deepEqual(plain(events[2][1].summary), expected('abandoned', 2000));
  assert.deepEqual(flow.sessions[0].calls, ['leave'], 'the old session is left, cancelling a pending generation');
  assert.equal(host.summary(), null, 'the new board has not started');
  flow.session.emit('started', {});
  flow.session.ms = 500;
  host.leave();
  assert.deepEqual(types().slice(-2), ['abandoned', 'canPause']);
  assert.equal(events.at(-2)[1].summary.elapsedMs, 500);
  assert.notEqual(events.at(-2)[1].summary.id, events[2][1].summary.id, 'the restarted board is another game');
  assert.deepEqual(flow.sessions[1].calls, ['leave']);
});

test('a game left or restarted before its first applied reveal reports nothing', () => {
  const { host, types, flow } = setup();
  host.start('3d', CHOICE);
  host.restart({ source: 'pad' });
  host.leave();
  assert.deepEqual(types(), []);
  assert.deepEqual(flow.sessions.map((s) => s.calls), [['leave'], ['leave']], 'each session is left');
});

test('reports of a session the adapter no longer holds are ignored', () => {
  const { host, types, flow } = setup();
  host.start('3d', CHOICE);
  const old = flow.session;
  host.restart({ source: 'pointer' });
  assert.equal(old.listening(), 0, 'the adapter stops listening to the old session');
  old.emit('started', {});
  old.emit('finished', { state: 'won' });
  assert.deepEqual(types(), []);
  host.leave();
  flow.sessions[1].emit('started', {});
  assert.deepEqual(types(), []);
});

test('a lost graphics context is a start or play failure, and cancels a pending generation', () => {
  const { host, events, flow, calls, mode } = setup();
  flow.lost = true;
  host.start('3d', CHOICE);
  assert.deepEqual(calls, [], 'a dead canvas starts nothing');
  assert.deepEqual(events, [['failed', { mode: '3d', reason: 'graphics context lost', screen: 'ctxlost' }]]);
  flow.lost = false;
  host.start('3d', CHOICE);
  mode.contextLost();
  assert.deepEqual(events.at(-1), ['failed', { mode: '3d', reason: 'graphics context lost', screen: 'ctxlost' }]);
  assert.deepEqual(flow.session.calls, ['leave'], 'the session is left: its pending board request is cancelled');
});

// ---------------------------------------------------------------- pre-generation for Play again

// A generation client whose requests wait; cancel resolves the one in flight cancelled.
function holdingClient() {
  let pending = null;
  const c = {
    requests: [],
    cancels: 0,
    request(req) { c.requests.push(req); return new Promise((resolve) => { pending = resolve; }); },
    cancel() { c.cancels += 1; pending?.({ ok: false, cancelled: true, reason: 'cancelled' }); pending = null; },
  };
  return c;
}
const NG = { X: 4, Y: 5, Z: 6, mines: 7, noGuess: true }; // the fake session's game

test('a finished no-guess 3D game pre-generates the next box for its marked start cell; Play again hands it to the new session', () => {
  const client = holdingClient();
  const { host, flow } = setup({ board: NG, client });
  host.start('3d', NG);
  assert.equal(flow.handed[0], null, 'the first game has none');
  flow.session.emit('started');
  flow.session.emit('finished', { state: 'won' });
  assert.deepEqual(client.requests, [{ graph: { kind: 'box', X: 4, Y: 5, Z: 6 }, mineCount: 7, firstClick: startCell({ kind: 'box', X: 4, Y: 5, Z: 6 }), noGuess: true, seed: 4242 }]);
  flow.clock.advance(END_DELAY_MS);
  host.restart({ source: 'pointer' }); // Play again
  const handed = flow.handed.at(-1);
  assert.ok(handed, 'the new session gets the pre-generated board');
  assert.equal(handed.cell, startCell({ kind: 'box', X: 4, Y: 5, Z: 6 }));
  assert.equal(handed.seed, 4242);
  assert.equal(client.cancels, 0);
});

test('a 3D daily or challenge: the forced start reaches the session, the summary names the daily board and date, Play again is free', () => {
  const client = holdingClient();
  const { host, flow, mode, calls } = setup({ board: NG, client });
  host.start('3d', NG);
  flow.session.emit('started');
  flow.session.emit('finished', { state: 'won' });
  flow.clock.advance(END_DELAY_MS);
  const pg = { cell: 3, seed: 1, discard() {} };
  host.start('3d', { ...NG, forced: { startCell: 3, seed: 77, daily: '20261011' }, pregenerated: pg });
  assert.equal(client.cancels, 1, 'the board pre-generated after the last game is let go');
  assert.equal(flow.handed.at(-1), pg);
  assert.deepEqual(calls.at(-1), ['start', { ...NG, forced: { startCell: 3, seed: 77, daily: '20261011' } }]);
  assert.deepEqual(mode.forced, { startCell: 3, seed: 77, daily: '20261011' });
  host.restart({ source: 'key' });
  assert.deepEqual(flow.session.forced, { startCell: 3, seed: 77, daily: '20261011' }, 'not started: the restart stays forced');
  flow.session.emit('started');
  const summary = mode.summary();
  assert.equal(summary.board.daily, true);
  assert.equal(summary.daily, '20261011');
  assert.equal(summary.startCell, 3);
  flow.session.emit('finished', { state: 'lost' });
  flow.clock.advance(END_DELAY_MS);
  host.restart({ source: 'pointer' }); // Play again
  assert.equal(flow.session.forced, undefined, 'a free box');
  host.start('3d', { ...NG, forced: { startCell: 3, seed: 78, challenge: true } });
  flow.session.emit('started');
  assert.equal(mode.summary().challenge, true);
  assert.equal('daily' in mode.summary(), false);
});

test('the 3D pre-generation: the same board from the choice takes it, another board or the leave discards it; none for a standard or abandoned game', () => {
  let client = holdingClient();
  let t = setup({ board: NG, client });
  t.host.start('3d', NG);
  t.flow.session.emit('started');
  t.flow.session.emit('finished', { state: 'lost' });
  t.flow.clock.advance(END_DELAY_MS);
  t.mode.start(NG); // the mode's own start, as the host's would after its leave
  assert.ok(t.flow.handed.at(-1), 'the same board takes it over');

  client = holdingClient();
  t = setup({ board: NG, client });
  t.host.start('3d', NG);
  t.flow.session.emit('started');
  t.flow.session.emit('finished', { state: 'lost' });
  t.flow.clock.advance(END_DELAY_MS);
  t.mode.start({ ...NG, mines: 8 });
  assert.equal(t.flow.handed.at(-1), null);
  assert.equal(client.cancels, 1, 'another board discards it');

  client = holdingClient();
  t = setup({ board: NG, client });
  t.host.start('3d', NG);
  t.flow.session.emit('started');
  t.flow.session.emit('finished', { state: 'lost' });
  t.flow.clock.advance(END_DELAY_MS);
  t.host.leave();
  assert.equal(client.cancels, 1, 'the leave discards it');

  client = holdingClient();
  t = setup({ board: { ...NG, noGuess: false }, client });
  t.host.start('3d', { ...NG, noGuess: false });
  t.flow.session.emit('started');
  t.flow.session.emit('finished', { state: 'won' });
  assert.equal(client.requests.length, 0, 'a standard board is never pre-generated');

  client = holdingClient();
  t = setup({ board: NG, client });
  t.host.start('3d', NG);
  t.flow.session.emit('started');
  t.host.restart({});
  assert.equal(client.requests.length, 0, 'an abandoned game pre-generates nothing');
  assert.equal(t.flow.handed.at(-1), null);
});

// The guided board through the real session: what the shell's flow does with a start.
function learnSetup() {
  const host = createModeHost();
  const events = [];
  for (const t of MODE_EVENTS) host.on(t, (e) => events.push([t, e]));
  const sessions = [];
  const clock = fakeClock();
  const open = (board, forced) => {
    const { forced: _f, ...rest } = board;
    const s = createSession({ board: rest, client: { request() { throw new Error('no request'); }, cancel() {} }, forced });
    sessions.push(s);
    return s;
  };
  let last = null;
  const flow = {
    clock,
    contextLost: () => false,
    openBoardChoice() {},
    start: (c) => { last = c; return open(c, c.forced ?? null); },
    pause() {}, resume() {}, leave() {},
    restart: (source, pregen, forced) => open(last, forced ?? null),
    client: { request() { throw new Error('no request'); }, cancel() {} },
  };
  const mode = host.register('3d', (report) => create3DMode(flow, report));
  return { host, events, sessions, clock, mode, session: () => sessions.at(-1) };
}
const winLesson = (s) => {
  s.reveal(LEARN_BOARD.startCell);
  for (let c = 0; c < s.view.n; c++) if (!LEARN_BOARD.minePositions.includes(c) && !s.view.pressed[c]) s.reveal(c);
};

test('the Learn 3D guided game reports no summary and no replay at a win, a loss, a restart and a leave', () => {
  const t = learnSetup();
  const records = [];
  t.host.on('finished', ({ summary, replay }) => records.push(['finished', summary, replay]));
  t.host.on('abandoned', ({ summary, replay }) => records.push(['abandoned', summary, replay]));
  t.host.start('3d', learnChoice());
  assert.equal(t.mode.learn, true, 'the adapter knows the guided game');
  winLesson(t.session());
  assert.equal(t.session().state, 'won');
  assert.equal(t.host.summary(), null);
  t.clock.advance(END_DELAY_MS * 3);
  t.host.restart({ source: 'pointer' }); // Try again
  assert.equal(t.session().markedCell, LEARN_BOARD.startCell, 'the guided board again, from the closed box');
  assert.equal(t.mode.learn, true);
  t.session().reveal(LEARN_BOARD.startCell);
  t.session().reveal(LEARN_BOARD.lessonMine); // a loss
  assert.equal(t.session().state, 'lost');
  t.clock.advance(END_DELAY_MS * 3);
  t.host.restart({ source: 'pointer' });
  t.session().reveal(LEARN_BOARD.startCell);
  t.host.restart({ source: 'pointer' }); // a restart of a started game
  t.session().reveal(LEARN_BOARD.startCell);
  t.host.leave();
  assert.deepEqual(records.map(([k]) => k), ['finished', 'finished', 'abandoned', 'abandoned']);
  for (const [, summary, replay] of records) { assert.equal(summary, null); assert.equal(replay, null); }
  assert.equal(t.mode.learn, false, 'left');
});

test('the 3D adapter is DOM-free and imports at most the 3D session, the records\' summary and board, and the pre-generation', () => {
  const src = read('js/shell/mode-3d.js').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator)\b/, 'the 3D adapter touches no browser global');
  assert.doesNotMatch(src, /from ['"]three['"]/, 'the 3D adapter does not import three.js');
  for (const [, from] of read('js/shell/mode-3d.js').matchAll(/^import .* from '([^']+)';$/gm)) {
    assert.match(from, /^\.\.\/(mode3d\/session|records\/summary|records\/board|generation\/client|generation\/start-cell)\.js$/, `the 3D adapter imports only the 3D session, the records' summary and board, and the pre-generation (${from})`);
  }
});

test('js/main.js warms each mode\'s generation worker as its board choice opens, and hands the 3D adapter the page\'s client', () => {
  const main = read('js/main.js');
  const screen = (name) => main.match(new RegExp(`'${name}': \\{[^\\n]*show: \\([^)]*\\) => \\{([^\\n]*)\\} \\}`))?.[1] ?? '';
  assert.match(screen('board-choice'), /GEN_3D\.warm\(\)/, 'the 3D board choice warms the 3D client');
  assert.match(screen('classic-2d-choice'), /mode2d\.warm\(\)/, 'the Classic 2D board choice warms the mode\'s client');
  assert.match(main, /const GEN_3D = createGenerationClient\(\);/, 'one 3D client for the page');
  assert.match(main, /client: GEN_3D, \/\/ the pre-generated board/, 'the adapter pre-generates through it');
});

test('js/main.js hands the adapter each session and leaves the reports to it', () => {
  const main = read('js/main.js');
  assert.match(main, /MODES\.register\('3d', \(report\) => create3DMode\(FLOW_3D, report\)\)/);
  assert.doesNotMatch(main, /mode3d\.(gameStarted|gameEnded)\(/, 'the game\'s own flow no longer reports for the adapter');
  assert.doesNotMatch(main, /snapshot:/, 'the summary comes from the session, not a snapshot of the shell state');
});

test('the 3D live figures feed: the game\'s counts at once on a change, the time alone on a new second, nothing between', () => {
  const fed = [];
  const feed = createFiguresFeed((input, { tick }) => fed.push([tick, input]));
  const clicks = (reveal) => ({ reveal: { effective: reveal, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
  const at = (counts, flags, elapsedMs) => feed.push({ counts, flags, mines: 40, elapsedMs });
  at(null, 0, 0);
  assert.deepEqual(fed.pop(), [false, { bbbv: null, bbbvSolved: 0, clicks: clicks(0), flags: 0, mines: 40, elapsedMs: 0 }], 'before the board: no 3BV, no click');
  at(null, 1, 0);
  assert.deepEqual(fed.pop(), [false, { bbbv: null, bbbvSolved: 0, clicks: clicks(0), flags: 1, mines: 40, elapsedMs: 0 }], 'a flag before the first reveal');
  at({ bbbv: 90, bbbvSolved: 4, clicks: clicks(1) }, 1, 120);
  assert.deepEqual(fed.pop(), [false, { bbbv: 90, bbbvSolved: 4, clicks: clicks(1), flags: 1, mines: 40, elapsedMs: 120 }], 'the first reveal');
  at({ bbbv: 90, bbbvSolved: 4, clicks: clicks(1) }, 1, 900);
  assert.equal(fed.length, 0, 'nothing changed, the same second');
  at({ bbbv: 90, bbbvSolved: 4, clicks: clicks(1) }, 1, 1010);
  assert.deepEqual(fed.pop(), [true, { bbbv: 90, bbbvSolved: 4, clicks: clicks(1), flags: 1, mines: 40, elapsedMs: 1010 }], 'a new second: the time alone');
  at({ bbbv: 90, bbbvSolved: 4, clicks: clicks(2) }, 1, 1100);
  assert.equal(fed.pop()[0], false, 'a wasted click is a change');
  feed.reset();
  at({ bbbv: 90, bbbvSolved: 4, clicks: clicks(2) }, 1, 1100);
  assert.equal(fed.pop()[0], false, 'after a reset the next push feeds afresh');
});

test('js/main.js feeds the 3D figures panel every frame, frozen at the end, with the board\'s bests read once per game', () => {
  const main = read('js/main.js');
  assert.match(main, /const FIGURES_3D = createFiguresFeed\(\(input, \{ tick \}\) => ui\.updateFigures3D\(input, \{ tick, bests: bests3D \}\)\);/);
  assert.match(main, /FIGURES_3D\.push\(\{ counts: S\.play\?\.counts\(\) \?\? null, flags: S\.settings\.mines - \(e \? e\.minesLeft : g\.minesLeft\), mines: S\.settings\.mines, elapsedMs: \(e \? e\.time : S\.time\) \* 1000 \}\);/,
    'the counts, the flags and the time — the frozen end state\'s once the game ends');
  assert.match(main, /bests3D = board\.learn \? null : RECORDS\.bests\(identity3D\(board\)\);/, 'the bests read from the records store when the board is shown');
  assert.match(main, /function showBoard3D\(\) \{[\s\S]*?FIGURES_3D\.reset\(\);/, 'a new board feeds afresh');
});

test('js/main.js takes the scene\'s touches below the overlay\'s top row', () => {
  assert.match(read('js/main.js'), /touchZone\(x, y, \{ width: canvas\.clientWidth, top: ui\.overlayBottom3D\(\) \}\)/);
});

// ---------------------------------------------------------------- browser: the 3D game through the adapter

test('in a browser, the 3D game starts, pauses, resumes, restarts and leaves through the adapter', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await ms(() => {
      globalThis.__events = [];
      for (const type of ['started', 'finished', 'abandoned', 'canPause', 'failed']) {
        globalThis.__ms.modes.on(type, (e) => globalThis.__events.push([type, e]));
      }
    });
    const events = () => ms(() => globalThis.__events.map(([t]) => t));
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);

    // start: a row of five with the mine at the end, so cell 3 is a numbered cell that does not win
    const BOARD = { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] };
    // a game left before its first reveal reports nothing
    await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); globalThis.__ms.modes.leave(); }, BOARD);
    assert.deepEqual(await events(), [], 'nothing is reported for a board never revealed');

    await ms((b) => globalThis.__ms.modes.start('3d', b), BOARD);
    assert.equal(await mode(), 'ready');
    assert.equal(await ms(() => globalThis.__ms.modes.active), '3d');
    assert.equal(await ms(() => globalThis.__ms.modes.summary()), null, 'nothing before the first click');
    await ms(() => globalThis.__ms.forcePlay());
    assert.equal(await mode(), 'playing');
    assert.equal(await ms(() => globalThis.__ms.aimAt(3)), 3, 'the numbered cell is aimed at');
    await ms(() => globalThis.__ms.click('left'));
    assert.deepEqual(await events(), ['started', 'canPause']);
    assert.equal(await ms(() => globalThis.__ms.game.state), 'playing');
    await frames(10);

    // pause through the host: the pause card shows and the clock keeps running, on the card too
    await ms(() => globalThis.__ms.modes.pause());
    assert.equal(await mode(), 'paused');
    const t0 = await ms(() => globalThis.__ms.state.time);
    await page.waitForFunction((start) => globalThis.__ms.state.time >= start + 1
      && Number(document.getElementById('pause-sub').textContent.match(/^Time (\d+)\./)[1]) >= Math.floor(start) + 1, t0, { timeout: patience(5000) });
    assert.equal(await mode(), 'paused', 'still paused');
    const t1 = await ms(() => globalThis.__ms.state.time);
    assert.ok(t1 >= t0 + 1, `the clock runs while paused (${t0} → ${t1})`);
    const card = Number((await page.textContent('#pause-sub')).match(/^Time (\d+)\./)[1]);
    assert.ok(card >= Math.floor(t0) + 1, `the pause card shows the running time (${t0} → card ${card})`);
    assert.equal(await ms(() => globalThis.__ms.state.play.pauses().length), 1, 'one pause so far');
    assert.equal(await ms(() => globalThis.__ms.modes.summary()), null, 'a fixed board, which no generator made, has no summary');

    // resume from a controller enters lockless play, as today
    await ms(() => globalThis.__ms.modes.resume({ source: 'pad' }));
    assert.equal(await mode(), 'playing');
    assert.equal(await ms(() => globalThis.__ms.state.lockless), true);

    // resume with the mouse goes to the click-to-play card, which re-acquires pointer lock
    await ms(() => globalThis.__ms.modes.pause());
    await ms(() => globalThis.__ms.modes.resume({ source: 'pointer' }));
    await frames(5);
    const resumed = await ms(() => ({ mode: globalThis.__ms.state.mode, locked: !!document.pointerLockElement, lockless: globalThis.__ms.state.lockless }));
    assert.equal(resumed.lockless, false);
    assert.ok(resumed.mode === 'playing' ? resumed.locked : resumed.mode === 'ready',
      `play under pointer lock, or the click-to-play card when the browser refuses it (${JSON.stringify(resumed)})`);
    const r0 = await ms(() => globalThis.__ms.state.play.elapsedMs());
    await page.waitForFunction((start) => globalThis.__ms.state.play.elapsedMs() >= start + 300, r0, { timeout: patience(5000) });
    assert.ok(await ms(() => globalThis.__ms.state.play.elapsedMs()) >= r0 + 300, 'no screen change stops the clock, the click-to-play card neither');

    // restart from the pause card abandons the started game at once
    await ms(() => globalThis.__ms.pause());
    await ms(() => document.getElementById('p-restart').click());
    assert.ok(['ready', 'playing'].includes(await mode()), 'a new board, entered as resume enters play');
    assert.deepEqual(await events(), ['started', 'canPause', 'abandoned', 'canPause']);
    assert.equal(await ms(() => globalThis.__ms.state.started), false);

    // leave through the pause card's Main menu: the game is released
    await ms((b) => {
      globalThis.__ms.modes.start('3d', b);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(3);
      globalThis.__ms.click('left');
      globalThis.__ms.pause();
    }, BOARD);
    await ms(() => document.getElementById('p-menu').click());
    await ms(() => document.getElementById('p-confirm-yes').click());
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => globalThis.__ms.modes.active), null);
    assert.equal(await ms(() => globalThis.__ms.game), null);
    assert.equal(await ms(() => globalThis.__ms.state.lockless), false);
    assert.deepEqual((await events()).slice(-3), ['canPause', 'abandoned', 'canPause']);

    // a win reports game finished after the end delay — a fixed board with no summary, which ends on
    // the pause card — and leaving afterwards abandons nothing
    await ms((b) => {
      globalThis.__ms.modes.start('3d', b);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
    }, BOARD);
    assert.equal(await ms(() => globalThis.__ms.game.state), 'won');
    await page.waitForFunction(() => globalThis.__events.at(-1)[0] === 'finished', null, { timeout: patience(5000) });
    assert.equal(await mode(), 'paused', 'a fixed board, which has no results, ends on the pause card');
    const won = await ms(() => {
      const [type, e] = globalThis.__events.at(-1);
      globalThis.__ms.modes.leave();
      return { type, summary: e.summary, last: globalThis.__events.at(-1)[0] };
    });
    assert.deepEqual(won, { type: 'finished', summary: null, last: 'finished' });

    // a lost graphics context is the 3D mode's failure; its screen offers back to menu
    await ms(() => { globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }); globalThis.__ms.forcePlay(); });
    await ms(() => globalThis.__ms.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ctxlost');
    assert.equal((await events()).at(-1), 'failed');
    await ms(() => document.getElementById('ctx-lost-menu').click());
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => document.getElementById('menu').inert), false, 'the menu is usable again');
    assert.equal(await ms(() => document.getElementById('ctx-lost').classList.contains('hidden')), true);
    await ms(() => globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }));
    assert.equal(await mode(), 'ctxlost', 'a dead canvas cannot start a 3D game, and says so');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// The generating-card test's first board: the no-guess 5 × 5 × 1 · 4 box from seed 1 with its first
// click on cell 0 (mines at 4, 9, 12, 20), whose first click opens 12 of the 21 safe cells.
const FIRST_SEED = 1;

test('the generating-card test\'s fixed first board is not won by its first click, and keeps a mine to lose on', () => {
  const result = generate({ graph: { kind: 'box', X: 5, Y: 5, Z: 1 }, mineCount: 4, firstClick: 0, noGuess: true, seed: FIRST_SEED });
  assert.equal(result.ok, true);
  const game = createGameWithMines({ graph: createBoxGrid(5, 5, 1).graph, profile: PROFILE_3D, mines: result.mines });
  game.reveal(0);
  assert.equal(game.phase, PHASE.PLAYING, 'the first click does not win');
  assert.equal(Array.from({ length: 25 }, (_, c) => game.cellState(c)).filter((v) => v === CELL.REVEALED).length, 12);
  assert.ok(Array.from(result.mines).some((m) => game.cellState(m) === CELL.CLOSED), 'a closed mine is left to reveal');
});

test('in a browser, the 3D generating card shows by its delay in pointer-locked play, with its progress line; Play again marks the start cell and the in-flight board shows it too', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 640, height: 480 } }); // a small canvas: software GL draws its frames fast enough
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A slow worker for this test's 5 × 5 × 1 box: progress at once, the first board 4 s later and
    // every later one (the pre-generation) 12 s later, so it is still in flight after the loss and
    // Play again; the real generator behind it. The first board is a fixed one (FIRST_SEED, whose
    // first click opens 12 of the 21 safe cells and leaves the mines to lose on), since a random
    // no-guess board's first click can win outright. Any other request — the start-up's daily
    // pre-generation shares this worker — is answered at once with no board, so it never takes the
    // first board's slot.
    await page.route('**/js/generation/worker.js', (route) => route.fulfill({
      contentType: 'text/javascript',
      body: `import { handleMessage } from './worker-real.js';
        let boards = 0;
        globalThis.onmessage = ({ data }) => {
          if (data.warm) { globalThis.postMessage({ id: data.id, warm: true }); return; }
          const g = data.request.graph;
          if (!(g.kind === 'box' && g.X === 5 && g.Y === 5 && g.Z === 1)) {
            globalThis.postMessage({ id: data.id, result: { ok: false, reason: 'another board' } });
            return;
          }
          globalThis.postMessage({ id: data.id, progress: { candidates: 7 } });
          const first = boards++ === 0;
          const message = first ? { ...data, request: { ...data.request, seed: ${FIRST_SEED} } } : data;
          setTimeout(() => globalThis.postMessage(handleMessage(message)), first ? 4000 : 12000);
        };`,
    }));
    await page.route('**/js/generation/worker-real.js', (route) => route.fulfill({ contentType: 'text/javascript', body: read('js/generation/worker.js') }));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    // A real click at an element's centre: a user gesture, with no wait for the page to settle
    // (frames under pointer lock are long tasks in software GL).
    const press = async (selector) => {
      const r = await ms((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, selector);
      await page.mouse.click(r.x, r.y);
    };
    const lockAndPlay = async () => {
      if (await ms(() => globalThis.__ms.state.mode) === 'ready') await press('#ready-btn');
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing' && !!document.pointerLockElement, null, { timeout: patience(5000), polling: 100 });
    };
    // Click `cell` and measure, in the page, when the card loses its hidden class, and the main-thread
    // long tasks meanwhile: a timer cannot fire inside one (software GL makes frames long).
    const clickAndTime = (cell) => ms((c) => new Promise((resolve) => {
      const card = document.getElementById('m3d-status');
      const t0 = performance.now();
      let stall = 0;
      const tasks = new PerformanceObserver((list) => { for (const e of list.getEntries()) stall += e.duration; });
      tasks.observe({ type: 'longtask' });
      const seen = new MutationObserver(() => {
        if (card.classList.contains('hidden')) return;
        seen.disconnect();
        const after = performance.now() - t0;
        setTimeout(() => { tasks.disconnect(); resolve({ after, stall, state: globalThis.__ms.state.play.state, line: document.getElementById('m3d-progress').textContent }); }, 0);
      });
      seen.observe(card, { attributes: true, attributeFilter: ['class'] });
      if (globalThis.__ms.aimAt(c) !== c) { seen.disconnect(); resolve({ aimed: false }); return; }
      globalThis.__ms.click('left');
      if (globalThis.__ms.state.play.state !== 'generating') { seen.disconnect(); resolve({ state: globalThis.__ms.state.play.state }); }
    }), cell);

    // 5 x 5 x 1, no-guess: its marked start cell (2, 2, 0) is on the face the camera sees
    const BOX = { X: 5, Y: 5, Z: 1, mines: 4, noGuess: true };
    const MARK = 2 + 5 * 2;
    await ms((b) => globalThis.__ms.modes.start('3d', b), BOX);
    await lockAndPlay();
    const first = await clickAndTime(0);
    assert.equal(first.state, 'generating');
    assert.ok(first.after >= 200 - 5, `not before the delay (${first.after.toFixed(0)} ms)`);
    assert.ok(first.after <= 200 + first.stall + 250, `the card shows by the delay under pointer lock (${first.after.toFixed(0)} ms, long tasks ${first.stall.toFixed(0)} ms)`);
    assert.equal(await ms(() => !!document.pointerLockElement), true, 'still pointer-locked');
    assert.match(first.line, /^candidate \d+ · \d+ s$/, `the progress line shows with the card (${JSON.stringify(first)})`);
    await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: patience(4000), polling: 100 });
    assert.equal(await ms(() => document.getElementById('m3d-status').classList.contains('hidden')), true, 'the card goes with the board');
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), -1, 'no mark on a game with no pre-generated board');

    // lose at once: reveal a mine
    await ms(() => {
      const m = globalThis.__ms, g = m.game;
      for (let c = 0; c < g.n; c++) if (g.number[c] === -1 && m.aimAt(c) === c) { m.click('left'); return; }
    });
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results', null, { timeout: patience(5000), polling: 100 });

    // Play again: the closed box opens with its marked start cell tinted, the next board on its way
    await page.keyboard.press('Enter'); // Play again: a user gesture, which asks for pointer lock
    await page.waitForFunction(() => globalThis.__ms.state.mode !== 'results', null, { timeout: patience(5000), polling: 100 });
    await lockAndPlay();
    const marked = await ms(() => ({ tinted: globalThis.__ms.renderer.mark, cell: globalThis.__ms.state.play.markedCell, state: globalThis.__ms.state.play.state }));
    assert.deepEqual(marked, { tinted: MARK, cell: MARK, state: 'ready' }, 'the marked start cell is tinted');
    const again = await clickAndTime(MARK);
    assert.equal(again.state, 'generating', 'the pre-generated board is still in flight: the session waits for it');
    assert.ok(again.after <= 200 + again.stall + 250, `the card shows by the delay for the in-flight board (${again.after.toFixed(0)} ms, long tasks ${again.stall.toFixed(0)} ms)`);
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), -1, 'the mark goes at the first click');
    await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: patience(12000), polling: 100 });
    assert.equal(await ms((c) => globalThis.__ms.game.pressed[c], MARK), 1, 'the first click is applied on the board that arrived');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- touch: the coarse-only 3D start and touch play

const TABLET = { viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true };
const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 };

// Counts every pointer-lock request and fullscreen request, and records vibrations and mouse events.
function watchPage() {
  globalThis.__locks = 0;
  const request = Element.prototype.requestPointerLock;
  Element.prototype.requestPointerLock = function (...a) { globalThis.__locks += 1; return request?.apply(this, a); };
  globalThis.__vibrations = 0;
  navigator.vibrate = () => { globalThis.__vibrations += 1; return true; };
  globalThis.__mouse = 0;
  for (const type of ['mousedown', 'mouseup']) window.addEventListener(type, () => { globalThis.__mouse += 1; }, true);
}

// Touches through the DevTools protocol, so fingers can be held and moved together. A tap and a
// one-finger drag in the look are gestures the browser synthesizes itself, touch to lift: sent as
// separate touch events, the time between them is the test's round trip, which on a loaded machine
// passes the 400 ms long-press and turns a tap or a drag into a flag.
function fingers(cdp) {
  const send = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) });
  return {
    start: (points) => send('touchStart', points),
    move: (points) => send('touchMove', points),
    end: () => send('touchEnd', []),
    tap: ([x, y]) => cdp.send('Input.synthesizeTapGesture', { x, y, duration: 50, tapCount: 1, gestureSourceType: 'touch' }),
    drag: ([x, y], [dx, dy]) => cdp.send('Input.synthesizeScrollGesture', { x, y, xDistance: dx, yDistance: dy, speed: 2000, gestureSourceType: 'touch', preventFling: true }),
  };
}

async function openTouchPage(browser, base, device) {
  const context = await browser.newContext(device);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(watchPage);
  await page.goto(`${base}/index.html`);
  await page.waitForFunction(() => globalThis.__ms !== undefined);
  const ms = (fn, arg) => page.evaluate(fn, arg);
  const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
  return { context, page, errors, ms, frames, f: fingers(await context.newCDPSession(page)) };
}

test('in a browser with touch on a tablet, the 3D ready card is a start: Tap to play lists the gestures, and no path asks for pointer lock', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms } = await openTouchPage(browser, base, TABLET);
    const note = await ms(() => document.getElementById('touch-note').textContent);
    assert.match(note, /[Bb]oth modes play by touch/, 'the menu\'s note says 3D plays by touch too');
    await page.tap('#menu-entry-3d');
    await page.tap('#board-choice [data-preset="6,6,6,10"]');
    await page.tap('#bc-play');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    const card = await ms(() => {
      const shown = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
      const btn = document.getElementById('ready-btn');
      const ready = document.getElementById('ready');
      return {
        btn: shown(btn), title: btn.querySelector('.ready-title').textContent,
        keys: shown(ready.querySelector('.ready-keys')),
        list: [...ready.querySelectorAll('.ready-keys dt')].map((dt) => dt.textContent), back: shown(document.getElementById('ready-back')),
        notice: !!document.getElementById('ready-notice'),
        rules: shown(document.getElementById('ready-rules')) ? document.getElementById('ready-rules').innerText : '',
        escHint: shown(document.querySelector('#ready-back .ui-key-hint')),
      };
    });
    assert.match(card.rules, /hold the Ctrl button to show them/, 'the rules name the toolbar\'s Ctrl button');
    assert.doesNotMatch(card.rules, /hold Ctrl/, 'not the Ctrl key');
    assert.equal(card.escHint, false, 'no Esc key hint in the touch card\'s Back');
    assert.ok(card.btn, 'the ready card\'s play button shows');
    assert.equal(card.title, 'Tap to play');
    assert.ok(card.keys, 'the controls list shows');
    assert.deepEqual(card.list, ['Left thumb', 'Drag', 'Tap', 'Long-press', 'Two-finger tap', 'Pinch'], 'the touch gestures in place of the keys');
    assert.ok(card.back, 'Back stays');
    assert.equal(card.notice, false, 'no notice');
    await ms(() => globalThis.__ms.settings.set('fullscreen', true)).catch(() => {});
    await ms(() => new Promise((r) => setTimeout(r, 100)));
    await page.tap('#ready-btn');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    const play = await ms(() => ({ lockless: globalThis.__ms.state.lockless, touch: document.body.classList.contains('touch-play'), locks: globalThis.__locks }));
    assert.deepEqual(play, { lockless: true, touch: true, locks: 0 }, 'lockless touch play, no lock asked (fullscreen neither)');
    const bar = await ms(() => {
      const el = document.getElementById('touch-modes');
      const r = el.getBoundingClientRect();
      const b = [...el.querySelectorAll('button')].map((x) => x.getBoundingClientRect());
      return { shown: getComputedStyle(el).display !== 'none', right: innerWidth - r.right, min: Math.min(...b.flatMap((x) => [x.width, x.height])) };
    });
    assert.ok(bar.shown && bar.right < 40 && bar.min >= 44, `the toolbar on the right edge with 44 px buttons (${JSON.stringify(bar)})`);
    const clear = await ms(() => document.getElementById('hud-figures').getBoundingClientRect().bottom <= document.getElementById('touch-modes').getBoundingClientRect().top);
    assert.ok(clear, 'the figures panel ends above the toolbar');
    // Restart from the pause card and Look-free paths stay lockless.
    await ms(() => globalThis.__ms.pause());
    await page.tap('#p-restart');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing' || globalThis.__ms.state.mode === 'ready');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'playing', 'restart enters touch play at once');
    assert.equal(await ms(() => globalThis.__locks), 0, 'restart asks no lock');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser with touch on a phone, Learn 3D\'s prompt line speaks touch', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms } = await openTouchPage(browser, base, PHONE);
    await ms(() => globalThis.__ms.learn());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    await page.tap('#ready-btn');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'), null, { timeout: patience(2000) });
    assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), 'Aim at the marked cube and tap to start');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser with touch on a tablet, 3D plays by touch: stick, look, tap, long-press, two-finger chord, the toolbar, pinch, Pause and resume, and Orbit', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, frames, f } = await openTouchPage(browser, base, TABLET);
    const W = TABLET.viewport.width;
    const H = TABLET.viewport.height;
    const LOOK = [Math.round(W * 0.62), Math.round(H * 0.85)]; // below the figures panel, which takes its own touches
    const STICK = [Math.round(W * 0.25), Math.round(H * 0.7)];
    const camOf = () => ms(() => ({ ...globalThis.__ms.info().cam }));
    const counts = () => ms(() => globalThis.__ms.state.play.counts().clicks);
    // 5 × 1 × 1 with mines at 0 and 2: the tap at 4 opens 4 and 3 (a 1); revealing 1 wins.
    await ms(() => { globalThis.__ms.modes.start('3d', { X: 5, Y: 1, Z: 1, mines: 2, minePositions: [0, 2] }); });
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    await page.tap('#ready-btn');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');

    // The hint strip and the HUD strip speak touch: gestures and on-screen buttons, no key.
    const help = await ms(() => ({
      strip: document.getElementById('hint-strip-text').innerHTML,
      stripShown: !document.getElementById('hint-strip').classList.contains('hidden'),
      tools: document.getElementById('hud-tools').innerHTML,
      toolsShown: getComputedStyle(document.getElementById('hud-tools')).display !== 'none',
    }));
    assert.ok(help.stripShown, 'the first-use strip shows in the first games');
    assert.equal(help.strip, 'Tap reveal · Long-press flag · Two-finger tap chord');
    assert.doesNotMatch(help.strip + help.tools, /<kbd|Esc|Left|Right|Hold/, `no key named (${help.strip} | ${help.tools})`);
    assert.ok(help.toolsShown, 'the HUD strip keeps its spacing readout');
    assert.match(help.tools, /Pinch spacing/);

    // The stick flies; lifting it stops; it acts on nothing.
    const c0 = await camOf();
    await f.start([[...STICK, 1]]);
    await f.move([[STICK[0], STICK[1] - 70, 1]]);
    await frames(6);
    const held = await ms(() => document.getElementById('touch-stick').classList.contains('on'));
    assert.ok(held, 'the stick follows the thumb');
    await f.end();
    const c1 = await camOf();
    assert.ok(Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z) > 1, 'the stick moved the camera');
    await frames(4);
    assert.deepEqual(await camOf(), c1, 'lifted: it stops');
    assert.equal(await ms(() => document.getElementById('touch-stick').classList.contains('on')), false, 'and goes back to rest');

    // The look drag turns the camera and acts on nothing.
    await frames(4);
    await f.drag(LOOK, [60, 10]);
    assert.equal(await ms(() => globalThis.__vibrations), 0, 'a drag, not a long-press');
    const c2 = await camOf();
    assert.ok(Math.abs(c2.yaw - c1.yaw) > 0.1, 'the drag turned the view');
    assert.equal(await ms(() => globalThis.__ms.state.started), false, 'a drag reveals nothing');

    // Tap reveals the crosshair cube, once, with no emulated mouse event (from the start pose again).
    await ms((c) => globalThis.__ms.moveTo(c.x, c.y, c.z), c0);
    assert.equal(await ms(() => { globalThis.__mouse = 0; return globalThis.__ms.aimAt(4); }), 4);
    await f.tap(LOOK);
    await page.waitForFunction(() => globalThis.__ms.game.pressed[4] === 1);
    assert.equal((await counts()).reveal.effective, 1, 'one reveal counted');
    assert.equal(await ms(() => globalThis.__mouse), 0, 'no mouse listener saw the tap');

    // Two-finger tap chords on the 1 at 3 (nothing flagged yet: a wasted chord, counted).
    const chords = (await counts()).chord;
    assert.equal(await ms(() => globalThis.__ms.aimAt(3)), 3);
    await f.start([[LOOK[0], LOOK[1], 6], [LOOK[0] + 100, LOOK[1], 7]]);
    await f.move([[LOOK[0], LOOK[1], 6]]); // the second finger lifts first
    await f.end();
    const after = (await counts()).chord;
    assert.equal(after.effective + after.wasted, chords.effective + chords.wasted + 1, 'one chord');

    // Long-press flags while held, with one vibration.
    assert.equal(await ms(() => globalThis.__ms.aimAt(2)), 2, 'the mine at 2 is aimed at');
    await f.start([[...LOOK, 3]]);
    await page.waitForFunction(() => globalThis.__ms.game.flagged[2] === 1, null, { timeout: patience(2000) });
    await f.end();
    assert.equal(await ms(() => globalThis.__vibrations), 1);

    // The toolbar latches each mode into the renderer through Controls.
    for (const mode of ['shift', 'space', 'ctrl']) {
      await page.tap(`#touch-modes [data-mode="${mode}"]`);
      await frames(2);
      const on = await ms((m) => ({ pressed: document.querySelector(`#touch-modes [data-mode="${m}"]`).getAttribute('aria-pressed'), controls: globalThis.__ms.controls[m], renderer: globalThis.__ms.renderer.toggles[m] }), mode);
      assert.deepEqual(on, { pressed: 'true', controls: true, renderer: true }, `${mode} latched`);
      if (mode !== 'shift') await page.tap(`#touch-modes [data-mode="${mode}"]`);
    }
    assert.equal(await ms(() => globalThis.__ms.controls.space), false, 'cleared again');

    // Pinch spreads the spacing; it acts on nothing.
    const s0 = await ms(() => globalThis.__ms.state.spacing);
    await Promise.all([f.start([[LOOK[0] - 40, LOOK[1], 4], [LOOK[0] + 40, LOOK[1], 5]]), f.move([[LOOK[0] - 80, LOOK[1], 4], [LOOK[0] + 80, LOOK[1], 5]])]);
    await f.end();
    const s1 = await ms(() => globalThis.__ms.state.spacing);
    assert.ok(s1 > s0 + 0.25, `spread: larger spacing (${s0} → ${s1})`);
    assert.match(await ms(() => document.getElementById('hud-tools').textContent), new RegExp(`spacing ${s1.toFixed(1)}`), 'the readout follows');

    // Pause takes a tap above the scene; the toolbar's latch survives pause and resume to lockless touch play.
    const pauseBox = await page.locator('#hud-pause').boundingBox();
    const hit = await ms(([x, y]) => [-21, 0, 21].map((dy) => document.elementFromPoint(x, y + dy)?.id), [pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2]);
    assert.ok(pauseBox.width >= 44 && hit.every((id) => id === 'hud-pause'), `the pause button's 44 px hit area (${pauseBox.width} wide, ${hit})`);
    await page.touchscreen.tap(pauseBox.x + pauseBox.width / 2, pauseBox.y + pauseBox.height / 2);
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
    await page.tap('#p-resume');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    assert.deepEqual(await ms(() => ({ lockless: globalThis.__ms.state.lockless, shift: globalThis.__ms.controls.shift, locks: globalThis.__locks })),
      { lockless: true, shift: true, locks: 0 });

    // Orbit: the drag rotates around the centre, the stick dollies in.
    await ms(() => globalThis.__ms.settings.set('camera', 'orbit'));
    const dist = (c) => Math.hypot(c.x, c.y, c.z);
    const o0 = await camOf();
    await frames(4);
    await f.drag(LOOK, [80, 0]);
    const o1 = await camOf();
    assert.equal(await ms(() => globalThis.__vibrations), 1, 'a drag, not a long-press');
    assert.ok(Math.abs(o1.yaw - o0.yaw) > 0.1 && Math.abs(dist(o1) - dist(o0)) < 1e-6, 'rotated about the centre');
    await f.start([[...STICK, 9]]);
    await f.move([[STICK[0], STICK[1] - 70, 9]]);
    await frames(6);
    await f.end();
    assert.ok(dist(await camOf()) < dist(o1) - 1, 'stick up dollies in');
    await ms(() => globalThis.__ms.settings.set('camera', 'fly'));

    // Revealing 1 wins.
    await ms((c) => globalThis.__ms.moveTo(c.x, c.y, c.z), c0);
    assert.equal(await ms(() => globalThis.__ms.aimAt(1)), 1);
    await f.tap(LOOK);
    await page.waitForFunction(() => globalThis.__ms.game.state === 'won');
    assert.equal(await ms(() => globalThis.__locks), 0, 'no pointer lock asked, start to finish');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser with touch on a phone, the ready card starts touch play with the toolbar clear of the overlay\'s counters and title bar', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms } = await openTouchPage(browser, base, PHONE);
    await ms(() => { globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }); });
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    await page.tap('#ready-btn');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
    const layout = await ms(() => {
      const tb = document.getElementById('touch-modes').getBoundingClientRect();
      const apart = (el) => { const r = el.getBoundingClientRect(); return tb.top >= r.bottom || tb.bottom <= r.top || tb.left >= r.right || tb.right <= r.left; };
      return { overlap: !apart(document.getElementById('hud-counters')) || !apart(document.querySelector('#hud-figures .ui-figures__head')), locks: globalThis.__locks };
    });
    assert.deepEqual(layout, { overlap: false, locks: 0 });
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser with a mouse at 1280 × 800, 3D starts with pointer lock and shows no touch controls', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(watchPage);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    assert.equal(await ms(() => document.getElementById('touch-note').classList.contains('hidden')), true);
    await ms(() => { globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10 }); });
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    const card = await ms(() => ({ title: document.querySelector('#ready-btn .ready-title').textContent, keys: getComputedStyle(document.querySelector('#ready .ready-keys')).display, first: document.querySelector('#ready .ready-keys dt').textContent }));
    assert.deepEqual(card, { title: 'Click to play', keys: 'grid', first: 'Mouse' }, 'the keyboard and mouse rows');
    await page.click('#ready-btn');
    assert.equal(await ms(() => globalThis.__locks), 1, 'the click asks for pointer lock');
    await ms(() => globalThis.__ms.forcePlay());
    assert.equal(await ms(() => getComputedStyle(document.getElementById('touch-3d')).display), 'none', 'no touch layer');
    const help = await ms(() => ({ strip: document.getElementById('hint-strip-text').textContent, tools: document.getElementById('hud-tools').textContent }));
    assert.equal(help.strip, 'Left reveal Right flag Hold Space aim through Hold Shift neighbours', 'the keyboard\'s hint strip, every input a key box');
    assert.match(help.tools, /Esc menu/, 'the keyboard\'s HUD strip, as before');
    assert.equal(await ms(() => document.body.classList.contains('touch-play')), false);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser at 1024 × 768 with a mouse: a 3D game\'s pause card in two columns fits the window with its look settings, and with the restart confirmation in place of the actions', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  // The card's layout, measured in the page: its rectangle, the scroll of the card, its overlay and the
  // document, where its two panels sit, its key rows and the font size of each kind of text.
  const measure = () => {
    const c = document.getElementById('pause-card');
    const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const scrolls = (el) => el.scrollHeight > el.clientHeight;
    const size = (sel) => { const el = c.querySelector(sel); return el ? parseFloat(getComputedStyle(el).fontSize) : null; };
    const confirm = document.getElementById('pause-confirm');
    return {
      card: box(c),
      scrolls: { card: scrolls(c), overlay: scrolls(document.getElementById('pause')), document: scrolls(document.documentElement) },
      columns: c.classList.contains('ui-screen--wide') && !!c.querySelector('.ui-columns.ui-columns--two'),
      actions: box(confirm.classList.contains('hidden') ? document.getElementById('pause-actions') : confirm),
      confirm: !confirm.classList.contains('hidden'),
      list: box(document.getElementById('pause-controls').closest('.ui-panel')),
      settings: box(document.getElementById('p-settings-title').closest('.ui-panel')),
      look: ['p-sens', 'p-invert'].every((id) => document.getElementById(id).closest('[data-setting]').getBoundingClientRect().height > 0),
      innerRight: c.getBoundingClientRect().right - parseFloat(getComputedStyle(c).paddingRight) + 0.5,
      rows: [...c.querySelectorAll('#pause-controls dt')].map((dt) => {
        const range = document.createRange();
        range.selectNodeContents(dt);
        const lines = [...range.getClientRects()];
        return { right: Math.max(...lines.map((k) => k.right)), tops: lines.map((k) => k.top) };
      }),
      fonts: {
        title: size('#pause-title'), status: size('#pause-sub'), button: size('#p-menu'), slider: size('.ui-slider__label'),
        switch: size('.ui-switchrow__label'), heading: size('#p-settings-title'), list: size('#pause-controls dd'),
        keyName: size('#pause-controls dt'), kbd: size('#pause-controls kbd'), statLabel: size('.ui-stat__label'),
      },
    };
  };
  // The card's font sizes with a fine pointer, which its two columns leave as they are.
  const FONTS = { title: 34, status: 15, button: 17, slider: 16, switch: 16, heading: 13, list: 15, keyName: 15, kbd: null, statLabel: null };
  const fits = (m, at) => {
    assert.ok(m.columns, `${at}: the card composed with ui-screen--wide and a ui-columns--two`);
    assert.ok(m.card.top >= 0 && m.card.left >= 0 && m.card.right <= 1024 && m.card.bottom <= 768,
      `${at}: the whole pause card inside the viewport (${JSON.stringify(m.card)})`);
    assert.deepEqual(m.scrolls, { card: false, overlay: false, document: false }, `${at}: nothing scrolls`);
    assert.ok(m.list.left >= m.settings.right && m.list.left >= m.actions.right, `${at}: the controls list in the second column`);
    assert.ok(m.actions.bottom <= m.settings.top, `${at}: the first column runs the actions, then Settings`);
    assert.ok(m.rows.length > 0, `${at}: the controls list's keys`);
    for (const row of m.rows) {
      assert.ok(row.tops.every((y) => Math.abs(y - row.tops[0]) <= 2), `${at}: a key on one line`);
      assert.ok(row.right <= m.innerRight, `${at}: a key unclipped`);
    }
    assert.deepEqual(m.fonts, FONTS, `${at}: every font size on the card as it was`);
  };
  try {
    for (const theme of ['joyful-tiles']) {
      const at = `1024 × 768 ${theme}`;
      const page = await browser.newPage({ viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 });
      await page.goto(`${base}/index.html`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      const ms = (fn, arg) => page.evaluate(fn, arg);
      assert.ok(await ms(() => matchMedia('(pointer: fine)').matches), `${at}: a fine pointer`);
      await ms(() => {
        globalThis.__ms.settings.set('confirmRestart', true);
        globalThis.__ms.modes.start('3d', { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] });
        globalThis.__ms.forcePlay();
        globalThis.__ms.aimAt(3);
        globalThis.__ms.click('left');
        globalThis.__ms.pause();
      });
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused');
      const play = await ms(measure);
      assert.equal(play.look, true, `${at}: the look settings on a 3D game's card`);
      assert.equal(play.confirm, false);
      fits(play, `${at}, in play`);

      await page.click('#p-restart');
      const asking = await ms(measure);
      assert.equal(asking.confirm, true, `${at}: the restart confirmation shows`);
      fits(asking, `${at}, the restart confirmation`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
