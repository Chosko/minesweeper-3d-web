// Classic 2D board setup (js/classic2d/board-setup.js) and game session (js/classic2d/session.js):
// board choice → board request, custom limits, the last board choice document, the session from
// closed board to result over a fake generation client and a fake clock, and the timer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  BOARD_SIZES, STANDARD_SIZES, DEFAULT_CHOICE, customMineCap, maxMines, validateCustom, boardSetup,
  normaliseChoice, LAST_CHOICE_DOC, LAST_CHOICE_VERSION, createLastChoice,
} from '../js/classic2d/board-setup.js';
import {
  createSession, createTimer, SESSION_STATE, FAILURE_OFFERS, GENERATING_DELAY_MS, START_HINT,
} from '../js/classic2d/session.js';
import { CUSTOM_LIMITS, getRuleProfile, REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { generate } from '../js/generation/generate.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { pregenerate } from '../js/generation/client.js';
import { startCell } from '../js/generation/start-cell.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { boardKey } from '../js/records/board.js';
import { decodeReplay } from '../js/replay/format.js';
import { handleMessage } from '../js/generation/worker.js';

const handleWorker = (request) => handleMessage({ id: 1, request }).result;

// ---------- fakes ----------

function fakeClock(start = 1000) {
  let t = start;
  let nextHandle = 1;
  const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const h = nextHandle++; timers.set(h, { at: t + ms, fn }); return h; },
    clearTimeout(h) { timers.delete(h); },
    advance(ms) {
      t += ms;
      for (const [h, timer] of [...timers]) {
        if (timer.at <= t) { timers.delete(h); timer.fn(); }
      }
    },
    get pending() { return timers.size; },
  };
}

// A generation client whose requests wait until the test answers them.
function fakeClient() {
  const requests = [];
  let inFlight = null;
  const client = {
    requests,
    cancels: 0,
    request(req, opts = {}) {
      if (inFlight) client.cancel();
      return new Promise((resolve, reject) => {
        inFlight = { req, resolve, reject, opts };
        requests.push(inFlight);
      });
    },
    /** The worker's progress for the request in flight. */
    progress(candidates) { inFlight?.opts.onProgress?.({ candidates }); },
    cancel() {
      client.cancels += 1;
      const p = inFlight;
      inFlight = null;
      p?.resolve({ ok: false, cancelled: true, reason: 'cancelled' });
    },
    get last() { return requests[requests.length - 1]; },
    // Answer the request in flight with what the worker would send (generate() run in Node).
    answer(result) {
      const p = inFlight;
      inFlight = null;
      p.resolve(result === undefined ? generate(p.req) : result);
    },
    fail(error) {
      const p = inFlight;
      inFlight = null;
      p.reject(error);
    },
  };
  return client;
}

const tick = () => new Promise((r) => setImmediate(r));

// The session's standard placement on the main thread: generate() itself, or the mine set a test
// queued (`board.mines`) for the next placement. Every placement request is kept in `placed`.
function placer() {
  const placed = [];
  const board = { mines: null };
  const place = (req) => {
    placed.push(req);
    const mines = board.mines;
    board.mines = null;
    return mines ? { ok: true, mines: Int32Array.from(mines), seed: req.seed, generatorVersion: GENERATOR_VERSION } : generate(req);
  };
  return { place, placed, board };
}

function session(choice = { size: 'beginner', noGuess: true }, opts = {}) {
  const clock = opts.clock ?? fakeClock();
  const client = opts.client ?? fakeClient();
  const pl = placer();
  let seed = 41;
  const s = createSession({ choice, client, clock, randomSeed: () => ++seed, place: pl.place, ...opts.extra });
  const events = [];
  for (const type of ['generating', 'started', 'changed', 'failed', 'finished', 'abandoned', 'mark']) {
    s.on(type, (payload) => events.push({ type, payload }));
  }
  return { s, clock, client, placed: pl.placed, board: pl.board, events, of: (type) => events.filter((e) => e.type === type) };
}

// Supplies a board for the first reveal at `cell`: a standard board is placed with `mines` at once,
// a no-guess one is answered with `mines` through the fake client.
async function startWith(h, cell, mines) {
  if (!h.s.setup.noGuess) {
    h.board.mines = mines;
    return h.s.reveal(cell);
  }
  const done = h.s.reveal(cell);
  h.client.answer({ ok: true, mines: Int32Array.from(mines), seed: h.client.last.req.seed, generatorVersion: GENERATOR_VERSION });
  return done;
}

// ---------- board setup ----------

test('board setup: the standard sizes and the no-guess switch map to the square graph and the generation options', () => {
  assert.deepEqual([...BOARD_SIZES], ['beginner', 'intermediate', 'expert', 'custom']);
  const expect = { beginner: [9, 9, 10], intermediate: [16, 16, 40], expert: [30, 16, 99] };
  for (const [size, [w, h, m]] of Object.entries(expect)) {
    assert.deepEqual({ ...STANDARD_SIZES[size] }, { width: w, height: h, mines: m });
    for (const noGuess of [false, true]) {
      const b = boardSetup({ size, noGuess });
      assert.equal(b.width, w);
      assert.equal(b.height, h);
      assert.equal(b.mines, m);
      assert.equal(b.noGuess, noGuess);
      assert.equal(b.grid.width, w);
      assert.equal(b.grid.height, h);
      assert.equal(b.grid.graph.count, w * h);
      assert.deepEqual(b.request(5, 77), {
        graph: { kind: 'square', width: w, height: h }, mineCount: m, firstClick: 5, noGuess, seed: 77,
      });
      assert.equal(boardKey(b.identity), `classic-2d:square:${w}x${h}:${m}:${noGuess ? 'no-guess' : 'guess'}`);
    }
  }
  const c = boardSetup({ size: 'custom', custom: { width: 20, height: 12, mines: 50 }, noGuess: true });
  assert.deepEqual([c.width, c.height, c.mines, c.noGuess], [20, 12, 50, true]);
  assert.equal(boardKey(c.identity), 'classic-2d:square:20x12:50:no-guess');
  assert.ok(Object.isFrozen(c));
});

test('board setup: a malformed choice or an invalid custom board throws', () => {
  assert.throws(() => boardSetup({ size: 'huge', noGuess: false }), RangeError);
  assert.throws(() => boardSetup({ size: 'beginner' }), RangeError);
  assert.throws(() => boardSetup({ size: 'custom', noGuess: false }), RangeError);
  assert.throws(() => boardSetup({ size: 'custom', custom: { width: 101, height: 10, mines: 5 }, noGuess: false }), RangeError);
  assert.throws(() => boardSetup({ size: 'custom', custom: { width: 9, height: 9, mines: 32 }, noGuess: false }), RangeError);
});

test('custom limits: CUSTOM_LIMITS is the reference profile marker citing the largest custom board entry', () => {
  const p = getRuleProfile(REFERENCE_PROFILE);
  assert.equal(CUSTOM_LIMITS, p.customLimits);
  assert.equal(p.fidelity.customLimits, 'Largest custom board');
  assert.equal(CUSTOM_LIMITS.minSide, 1);
  assert.equal(CUSTOM_LIMITS.maxSide, 100);
  assert.equal(CUSTOM_LIMITS.everyCellUpTo, 36);
  assert.deepEqual(CUSTOM_LIMITS.mineCaps.map((p) => [...p]), [
    [49, 19], [64, 24], [81, 31], [100, 38], [256, 96], [400, 140], [480, 168],
    [2500, 712], [6400, 1659], [8100, 2051], [10000, 2480],
  ]);
  assert.ok(Object.isFrozen(CUSTOM_LIMITS));
});

test('custom limits: the site cap is measured at the recorded boards and interpolated by cell count between them', () => {
  // Measured points.
  assert.equal(customMineCap(7, 7), 19);
  assert.equal(customMineCap(9, 9), 31);
  assert.equal(customMineCap(30, 16), 168);
  assert.equal(customMineCap(16, 30), 168);
  assert.equal(customMineCap(100, 100), 2480);
  // Up to 36 cells the site takes a mine in every cell.
  assert.equal(customMineCap(6, 6), 36);
  assert.equal(customMineCap(1, 1), 1);
  assert.equal(customMineCap(36, 1), 36);
  // Interpolated: 40 × 40 = 1600 cells, between 480 → 168 and 2500 → 712.
  assert.equal(customMineCap(40, 40), Math.floor(168 + (1600 - 480) * (712 - 168) / (2500 - 480)));
  // Between 36 cells (every cell) and 49 → 19.
  assert.equal(customMineCap(6, 7), Math.floor(36 + (42 - 36) * (19 - 36) / (49 - 36)));
  // Monotonic between measured points of growing size.
  for (let rows = 1; rows < 100; rows += 1) {
    assert.ok(customMineCap(100, rows) <= customMineCap(100, rows + 1), `100 × ${rows}`);
  }
});

test('custom limits: the mine count is capped at the smaller of the site cap and the cell count minus one', () => {
  assert.equal(maxMines(6, 6), 35); // the site takes 36; one cell stays free for the first click
  assert.equal(maxMines(1, 1), 0);
  assert.equal(maxMines(2, 1), 1);
  assert.equal(maxMines(9, 9), 31);
  assert.equal(maxMines(100, 100), 2480);
  assert.deepEqual(validateCustom({ width: 9, height: 9, mines: 31 }), { ok: true });
  assert.deepEqual(validateCustom({ width: 6, height: 6, mines: 35 }), { ok: true });
  assert.deepEqual(validateCustom({ width: 100, height: 100, mines: 2480 }), { ok: true });
  const bad = [
    [{ width: 0, height: 9, mines: 1 }, 'width'],
    [{ width: 101, height: 9, mines: 1 }, 'width'],
    [{ width: 9.5, height: 9, mines: 1 }, 'width'],
    [{ width: 9, height: 0, mines: 1 }, 'height'],
    [{ width: 9, height: 101, mines: 1 }, 'height'],
    [{ width: 9, height: 9, mines: 32 }, 'mines'],
    [{ width: 6, height: 6, mines: 36 }, 'mines'],
    [{ width: 9, height: 9, mines: -1 }, 'mines'],
    [{ width: 9, height: 9, mines: '10' }, 'mines'],
  ];
  for (const [custom, field] of bad) {
    const v = validateCustom(custom);
    assert.equal(v.ok, false, JSON.stringify(custom));
    assert.equal(v.field, field, JSON.stringify(custom));
    assert.equal(typeof v.reason, 'string');
  }
});

test('custom limits: a custom board takes at least one mine, so the smallest is 1 × 2 or 2 × 1 with 1 mine', () => {
  assert.deepEqual(validateCustom({ width: 1, height: 2, mines: 1 }), { ok: true });
  assert.deepEqual(validateCustom({ width: 2, height: 1, mines: 1 }), { ok: true });
  assert.deepEqual(validateCustom({ width: 9, height: 9, mines: 0 }), {
    ok: false, field: 'mines', reason: 'Mines must be a whole number from 1 to 31 on a 9 × 9 board',
  });
  assert.deepEqual(validateCustom({ width: 100, height: 100, mines: 0 }), {
    ok: false, field: 'mines', reason: 'Mines must be a whole number from 1 to 2,480 on a 100 × 100 board',
  });
  assert.equal(validateCustom({ width: 2, height: 1, mines: 0 }).reason, 'Mines must be a whole number from 1 to 1 on a 2 × 1 board');
  const noRoom = 'A 1 × 1 board has no room for a mine beside the safe first click — make it at least 2 cells';
  for (const mines of [0, 1, -1, NaN]) {
    assert.deepEqual(validateCustom({ width: 1, height: 1, mines }), { ok: false, field: 'mines', reason: noRoom }, `1 × 1 with ${mines}`);
  }
  // The side checks run first: a refused side is never reported as no room.
  assert.equal(validateCustom({ width: 0, height: 1, mines: 0 }).field, 'width');
  assert.equal(validateCustom({ width: 1, height: 0, mines: 0 }).field, 'height');
  // The upper bound is unchanged.
  assert.equal(maxMines(1, 1), 0);
  assert.equal(maxMines(1, 2), 1);
  assert.equal(validateCustom({ width: 1, height: 2, mines: 2 }).field, 'mines');
});

test('custom limits: a 0-mine or 1 × 1 custom choice is no choice — no board setup, no session', () => {
  for (const custom of [{ width: 9, height: 9, mines: 0 }, { width: 1, height: 1, mines: 0 }, { width: 1, height: 1, mines: 1 }]) {
    const choice = { size: 'custom', custom, noGuess: false };
    assert.equal(normaliseChoice(choice), null, JSON.stringify(custom));
    assert.equal(normaliseChoice({ ...choice, size: 'expert' }), null, `a standard size with ${JSON.stringify(custom)}`);
    assert.throws(() => boardSetup(choice), RangeError, JSON.stringify(custom));
    assert.throws(() => createSession({ choice, client: fakeClient(), clock: fakeClock() }), RangeError, JSON.stringify(custom));
  }
  assert.doesNotThrow(() => boardSetup({ size: 'custom', custom: { width: 1, height: 2, mines: 1 }, noGuess: false }));
});

test('custom limits: a dense custom board keeps the no-guess switch — nothing refuses it up front', () => {
  const b = boardSetup({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  assert.equal(b.noGuess, true);
});

test('board setup: normaliseChoice keeps a valid stored choice and turns anything else into none', () => {
  assert.deepEqual(normaliseChoice({ size: 'expert', noGuess: true }), { size: 'expert', custom: DEFAULT_CHOICE.custom, noGuess: true });
  const custom = { size: 'custom', custom: { width: 20, height: 12, mines: 50 }, noGuess: false };
  assert.deepEqual(normaliseChoice(custom), custom);
  // A standard size keeps the custom dimensions the player last entered.
  assert.deepEqual(normaliseChoice({ size: 'beginner', custom: { width: 20, height: 12, mines: 50 }, noGuess: false }),
    { size: 'beginner', custom: { width: 20, height: 12, mines: 50 }, noGuess: false });
  for (const bad of [null, 7, 'beginner', {}, { size: 'huge', noGuess: false }, { size: 'expert', noGuess: 'yes' },
    { size: 'custom', custom: { width: 200, height: 12, mines: 5 }, noGuess: false }]) {
    assert.equal(normaliseChoice(bad), null, JSON.stringify(bad));
  }
  assert.doesNotThrow(() => boardSetup(DEFAULT_CHOICE));
});

// ---------- last board choice ----------

test('last choice: a classic2d.lastChoice document in platform storage, read when the mode opens', async () => {
  assert.equal(LAST_CHOICE_DOC, 'classic2d.lastChoice');
  assert.equal(LAST_CHOICE_VERSION, 1);
  const backend = createMemoryBackend();
  const storage = createStorage({ backend });
  const last = createLastChoice({ storage });
  assert.deepEqual(await last.load(), DEFAULT_CHOICE); // none stored yet
  const choice = { size: 'custom', custom: { width: 20, height: 12, mines: 50 }, noGuess: true };
  assert.deepEqual(await last.save(choice), { ok: true });
  assert.deepEqual(last.current, choice);
  assert.deepEqual(JSON.parse(backend.documents.get(LAST_CHOICE_DOC)), { version: 1, data: choice });

  // A new mode opening reads it back.
  const again = createLastChoice({ storage: createStorage({ backend }) });
  assert.deepEqual(await again.load(), choice);
  assert.deepEqual(again.current, choice);
});

test('last choice: a profile with no stored choice opens with no-guess on; a stored choice is kept as stored, no-guess off included', async () => {
  assert.equal(DEFAULT_CHOICE.noGuess, true);
  assert.equal(boardSetup(DEFAULT_CHOICE).noGuess, true);
  const backend = createMemoryBackend();
  const last = createLastChoice({ storage: createStorage({ backend }) });
  assert.equal(last.current.noGuess, true, 'before the load');
  assert.equal((await last.load()).noGuess, true, 'nothing stored');
  const off = { size: 'expert', custom: DEFAULT_CHOICE.custom, noGuess: false };
  await last.save(off);
  const again = createLastChoice({ storage: createStorage({ backend }) });
  assert.deepEqual(await again.load(), off, 'a stored no-guess off survives');
});

test('last choice: a malformed document reads as the default; an invalid choice is not saved', async () => {
  const backend = createMemoryBackend({ initial: { [LAST_CHOICE_DOC]: JSON.stringify({ version: 1, data: { size: 'huge' } }) } });
  const last = createLastChoice({ storage: createStorage({ backend }) });
  assert.deepEqual(await last.load(), DEFAULT_CHOICE);
  await assert.rejects(last.save({ size: 'custom', custom: { width: 0, height: 1, mines: 1 }, noGuess: false }), RangeError);
});

test('last choice: a stored 0-mine or 1 × 1 custom choice reads as the default and is never saved', async () => {
  for (const custom of [{ width: 9, height: 9, mines: 0 }, { width: 1, height: 1, mines: 0 }]) {
    const stored = { size: 'custom', custom, noGuess: false };
    const backend = createMemoryBackend({ initial: { [LAST_CHOICE_DOC]: JSON.stringify({ version: 1, data: stored }) } });
    const last = createLastChoice({ storage: createStorage({ backend }) });
    assert.deepEqual(await last.load(), DEFAULT_CHOICE, JSON.stringify(custom));
    await assert.rejects(last.save(stored), RangeError, JSON.stringify(custom));
    assert.deepEqual(last.current, DEFAULT_CHOICE);
  }
});

// ---------- timer ----------

test('timer: measures from start through pauses, stops, whole seconds for display and milliseconds for the result', () => {
  const clock = fakeClock(500);
  const t = createTimer({ now: clock.now });
  assert.equal(t.elapsedMs(), 0);
  clock.advance(1000);
  assert.equal(t.elapsedMs(), 0); // not started
  t.start();
  clock.advance(1499.6);
  assert.equal(t.elapsedMs(), 1500);
  assert.equal(t.seconds(), 1);
  t.pause();
  assert.equal(t.paused, true);
  assert.equal(t.running, true, 'the clock runs through a pause');
  clock.advance(10000);
  assert.equal(t.elapsedMs(), 11500);
  t.pause(); // a second pause changes nothing
  t.resume();
  assert.equal(t.paused, false);
  clock.advance(600);
  assert.equal(t.elapsedMs(), 12100);
  assert.equal(t.seconds(), 12);
  assert.deepEqual(t.pauses(), [{ start: 1500, end: 11500 }]);
  t.stop();
  clock.advance(5000);
  assert.equal(t.elapsedMs(), 12100);
  t.resume(); // a stopped timer stays stopped
  t.pause();
  clock.advance(5000);
  assert.equal(t.elapsedMs(), 12100);
  assert.deepEqual(t.pauses(), [{ start: 1500, end: 11500 }], 'nothing pauses after the stop');
  assert.ok(Number.isInteger(t.elapsedMs()));
});

test('timer: the pause spans — an open one ends now, one at the stop ends there, one before the start counts from 0', () => {
  const clock = fakeClock();
  const t = createTimer({ now: clock.now });
  t.pause(); // before the start: counts from the start if still paused then
  clock.advance(3000);
  assert.deepEqual(t.pauses(), []);
  t.start();
  clock.advance(400);
  assert.deepEqual(t.pauses(), [{ start: 0, end: 400 }], 'the open span ends at the current time');
  t.resume();
  clock.advance(1000);
  t.pause();
  clock.advance(250);
  assert.deepEqual(t.pauses(), [{ start: 0, end: 400 }, { start: 1400, end: 1650 }]);
  assert.deepEqual(t.pauses(1500), [{ start: 0, end: 400 }, { start: 1400, end: 1500 }], 'spans up to a time, the open one clipped');
  assert.deepEqual(t.pauses(1650, 1), [{ start: 0, end: 400 }], 'at most `count` spans');
  t.stop();
  clock.advance(900);
  assert.deepEqual(t.pauses(), [{ start: 0, end: 400 }, { start: 1400, end: 1650 }], 'the stop closes the open span');
  // A pause that ends before the start is no pause.
  const u = createTimer({ now: clock.now });
  u.pause();
  clock.advance(100);
  u.resume();
  u.start();
  clock.advance(100);
  assert.deepEqual(u.pauses(), []);
});

// ---------- session ----------

test('session: opens a closed board; the first reveal goes to the generation client with that cell', async () => {
  const h = session({ size: 'expert', noGuess: true });
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.s.game.phase, 'awaiting-first-click');
  assert.equal(h.s.summary(), null);
  assert.equal(h.client.requests.length, 0);
  const done = h.s.reveal(37);
  assert.ok(done instanceof Promise);
  assert.equal(h.s.state, SESSION_STATE.GENERATING);
  assert.equal(h.client.requests.length, 1);
  assert.deepEqual(h.client.last.req, {
    graph: { kind: 'square', width: 30, height: 16 }, mineCount: 99, firstClick: 37, noGuess: true, seed: 42,
  });
  h.client.answer();
  const result = await done;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.s.game.phase, 'playing');
  assert.ok(h.s.game.state.revealed[37]);
  assert.equal(h.s.seed, 42);
  assert.equal(h.s.generatorVersion, GENERATOR_VERSION);
  assert.ok(result.changed.length >= 1);
  assert.equal(h.of('started').length, 1);
  assert.deepEqual([...h.of('started')[0].payload.changed], [...result.changed]);
});

test('session: the "generating" state shows only when the answer takes longer than the threshold', async () => {
  assert.ok(Number.isFinite(GENERATING_DELAY_MS) && GENERATING_DELAY_MS > 0);
  // Fast answer: never shown.
  const fast = session();
  const p1 = fast.s.reveal(0);
  fast.clock.advance(GENERATING_DELAY_MS - 1);
  fast.client.answer();
  await p1;
  fast.clock.advance(GENERATING_DELAY_MS * 10);
  assert.equal(fast.of('generating').length, 0);
  assert.equal(fast.s.generatingShown, false);
  assert.equal(fast.clock.pending, 0);
  // Slow answer: shown at the threshold, hidden when the board arrives.
  const slow = session();
  const p2 = slow.s.reveal(0);
  slow.clock.advance(GENERATING_DELAY_MS);
  assert.equal(slow.s.generatingShown, true);
  assert.deepEqual(slow.of('generating').map((e) => e.payload), [{ shown: true }]);
  slow.client.answer();
  await p2;
  assert.equal(slow.s.generatingShown, false);
  assert.deepEqual(slow.of('generating').map((e) => e.payload), [{ shown: true }, { shown: false }]);
});

test('session: the timer starts once the board is ready, not at the click', async () => {
  const h = session();
  const p = h.s.reveal(40);
  h.clock.advance(3000); // a slow generation
  assert.equal(h.s.elapsedMs(), 0);
  h.client.answer();
  await p;
  assert.equal(h.s.elapsedMs(), 0);
  h.clock.advance(2500);
  assert.equal(h.s.elapsedMs(), 2500);
  assert.equal(h.s.seconds(), 2);
});

test('session: actions after the first reveal are applied to the engine and reported as changed', async () => {
  // 3 × 3 Beginner-like custom board with one mine in the corner.
  const h = session({ size: 'custom', custom: { width: 3, height: 3, mines: 1 }, noGuess: false });
  await startWith(h, 4, [0]); // the centre is a 1: only it opens
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  const before = h.of('changed').length;
  const flag = h.s.toggleFlag(0);
  assert.ok(flag.changed.length === 1);
  assert.equal(h.s.minesLeft, 0);
  assert.equal(h.of('changed').length, before + 1);
  const chord = h.s.chord(4);
  assert.equal(chord.ended, true);
  assert.equal(h.s.state, SESSION_STATE.WON);
});

test('session: a win stops the timer and emits game finished with a summary built by buildSummary', async () => {
  const h = session({ size: 'custom', custom: { width: 3, height: 1, mines: 1 }, noGuess: false });
  await startWith(h, 0, [2]); // [0][1][*]: cell 0 is a zero, opens 0 and 1 → a win at the first reveal
  assert.equal(h.s.state, SESSION_STATE.WON);
  const [finished] = h.of('finished');
  assert.ok(finished);
  const sum = finished.payload.summary;
  assert.equal(sum.outcome, 'won');
  assert.equal(sum.elapsedMs, 0);
  assert.deepEqual(sum.board, { mode: 'classic-2d', grid: 'square', width: 3, height: 1, mines: 1, noGuess: false });
  assert.equal(sum.seed, 42);
  assert.equal(sum.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(h.s.summary(), sum);
  h.clock.advance(5000);
  assert.equal(h.s.elapsedMs(), 0);
});

test('session: a loss stops the timer and emits game finished; the elapsed time is the board-ready time', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  // [0][1][*][x]: reveal 0 opens 0 and 1; then reveal 2 loses.
  await startWith(h, 0, [2]);
  h.clock.advance(1234.4);
  const r = h.s.reveal(2);
  assert.equal(r.ended, true);
  assert.equal(h.s.state, SESSION_STATE.LOST);
  const [finished] = h.of('finished');
  assert.equal(finished.payload.summary.outcome, 'lost');
  assert.equal(finished.payload.summary.elapsedMs, 1234);
  h.clock.advance(1000);
  assert.equal(h.s.elapsedMs(), 1234);
  // After the end, actions and pause change nothing.
  assert.equal(h.s.reveal(3), null);
  h.s.pause();
  assert.equal(h.s.paused, false);
  assert.equal(h.of('finished').length, 1);
});

test('session: pause stops board input while the timer keeps running; resume continues; each pause is a span', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  h.s.pause(); // before the first click: nothing
  assert.equal(h.s.paused, false);
  assert.deepEqual(h.s.pauses(), []);
  await startWith(h, 0, [2]);
  h.clock.advance(1000);
  h.s.pause();
  assert.equal(h.s.paused, true);
  assert.equal(h.s.recording, false);
  h.clock.advance(60000);
  assert.equal(h.s.elapsedMs(), 61000, 'the clock runs through the pause');
  assert.equal(h.s.seconds(), 61);
  assert.equal(h.s.reveal(3), null); // input refused while paused
  assert.equal(h.s.game.state.revealed[3], 0);
  assert.deepEqual(h.s.pauses(), [{ start: 1000, end: 61000 }]);
  h.s.resume();
  assert.equal(h.s.paused, false);
  h.clock.advance(500);
  assert.equal(h.s.elapsedMs(), 61500);
  h.s.pause();
  h.s.pause(); // a second pause is the same pause
  h.clock.advance(200);
  h.s.resume();
  assert.deepEqual(h.s.pauses(), [{ start: 1000, end: 61000 }, { start: 61500, end: 61700 }]);
  const sum = h.s.summary();
  assert.equal(sum.elapsedMs, 61700);
  assert.equal(sum.pauses, 2);
  assert.equal(sum.pausedMs, 60200);
});

test('session: a pause while generating counts from the board arriving; one ended before it is no pause', async () => {
  const h = session();
  const p = h.s.reveal(0);
  h.s.pause();
  h.clock.advance(300);
  h.client.answer();
  await p;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  h.clock.advance(4000);
  assert.equal(h.s.elapsedMs(), 4000, 'the clock starts with the board, paused or not');
  h.s.resume();
  h.clock.advance(700);
  assert.equal(h.s.elapsedMs(), 4700);
  assert.deepEqual(h.s.pauses(), [{ start: 0, end: 4000 }]);

  const k = session();
  const q = k.s.reveal(0);
  k.s.pause();
  k.clock.advance(100);
  k.s.resume();
  k.client.answer();
  await q;
  k.clock.advance(100);
  assert.deepEqual(k.s.pauses(), []);
  assert.equal(k.s.summary().pauses, 0);
  assert.equal(k.s.summary().pausedMs, 0);
});

test('session: a game abandoned while paused ends its open pause at the end; the summaries carry the pauses', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  await startWith(h, 0, [2]);
  h.clock.advance(800);
  h.s.pause();
  h.clock.advance(1200);
  const inProgress = h.s.summary();
  assert.equal(inProgress.elapsedMs, 2000);
  assert.equal(inProgress.pauses, 1);
  assert.equal(inProgress.pausedMs, 1200);
  h.clock.advance(300);
  h.s.restart();
  const [abandoned] = h.of('abandoned');
  assert.equal(abandoned.payload.summary.elapsedMs, 2300);
  assert.equal(abandoned.payload.summary.pauses, 1);
  assert.equal(abandoned.payload.summary.pausedMs, 1500);
  assert.equal(h.s.summary(), null);
  assert.deepEqual(h.s.pauses(), [], 'the new board has no pauses');

  // A finished game: the pauses it had, and nothing after the end.
  const w = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  await startWith(w, 0, [2]);
  w.clock.advance(100);
  w.s.pause();
  w.clock.advance(400);
  w.s.resume();
  w.clock.advance(100);
  w.s.reveal(3); // the last safe cell: a win
  assert.equal(w.s.state, SESSION_STATE.WON);
  const [finished] = w.of('finished');
  assert.equal(finished.payload.summary.elapsedMs, 600);
  assert.equal(finished.payload.summary.pauses, 1);
  assert.equal(finished.payload.summary.pausedMs, 400);
  w.s.pause();
  w.clock.advance(1000);
  assert.deepEqual(w.s.pauses(), [{ start: 100, end: 500 }]);
});

test('session: a no-guess failure shows the failure with Retry and Play a standard board; the timer never starts', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const p = h.s.reveal(40);
  h.client.answer({ ok: false, reason: 'no board within the attempt budget', seed: 42, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.FAILED);
  assert.deepEqual([...FAILURE_OFFERS], ['retry', 'standard']);
  const [failed] = h.of('failed');
  assert.deepEqual(failed.payload, { reason: 'no board within the attempt budget', offers: ['retry', 'standard'], count: 1 });
  assert.deepEqual(h.s.failure, failed.payload);
  h.clock.advance(5000);
  assert.equal(h.s.elapsedMs(), 0);
  assert.equal(h.s.summary(), null);
  assert.equal(h.of('started').length, 0);
  // Nothing else is accepted on a failed board.
  assert.equal(h.s.reveal(3), null);
  assert.equal(h.s.toggleFlag(3), null);
});

test('session: Retry asks again for the same cell with a new seed', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const p = h.s.reveal(40);
  h.client.answer({ ok: false, reason: 'budget', seed: 42, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  await p;
  const retry = h.s.retry();
  assert.equal(h.s.state, SESSION_STATE.GENERATING);
  assert.deepEqual(h.client.last.req, {
    graph: { kind: 'square', width: 9, height: 9 }, mineCount: 31, firstClick: 40, noGuess: true, seed: 43,
  });
  h.client.answer({ ok: true, mines: Int32Array.from(generate({ ...h.client.last.req, noGuess: false }).mines), seed: 43, generatorVersion: GENERATOR_VERSION });
  await retry;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.s.seed, 43);
  assert.equal(h.s.failure, null);
  assert.equal(h.s.choice.noGuess, true);
});

test('session: Play a standard board keeps the size and turns no-guess off, placed at once', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const p = h.s.reveal(40);
  h.client.answer({ ok: false, reason: 'budget', seed: 42, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  await p;
  const r = h.s.playStandard();
  assert.equal(r instanceof Promise, false, 'the standard board is placed in the same call');
  assert.equal(h.client.requests.length, 1, 'no request goes to the worker');
  assert.deepEqual(h.placed.at(-1), {
    graph: { kind: 'square', width: 9, height: 9 }, mineCount: 31, firstClick: 40, noGuess: false, seed: 43,
  });
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.ok(h.s.game.state.revealed[40]);
  assert.deepEqual(h.s.choice, { size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: false });
  assert.equal(h.s.setup.identity.noGuess, false);
  h.s.restart();
  h.s.reveal(0);
  assert.equal(h.placed.at(-1).noGuess, false); // the switched choice stays for this session
  assert.equal(h.client.requests.length, 1);
});

test('session: Retry does nothing unless the board failed; Play a standard board unless it failed or is generating', () => {
  const h = session();
  assert.equal(h.s.retry(), null);
  assert.equal(h.s.playStandard(), null);
  assert.equal(h.client.requests.length, 0);
  assert.equal(h.placed.length, 0);
});

test('session: a worker failure is a generation failure with the same offer', async () => {
  const h = session();
  const p = h.s.reveal(0);
  h.client.fail(new Error('worker crashed'));
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.FAILED);
  assert.deepEqual(h.of('failed')[0].payload, { reason: 'worker crashed', offers: ['retry', 'standard'], count: 1 });
});

test('session: failures in a row are counted on the failure; a board, a cancel or a restart starts the count again', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const fail = async (p) => { h.client.answer({ ok: false, reason: 'budget', seed: 1, generatorVersion: GENERATOR_VERSION, candidates: 2000 }); await p; };
  await fail(h.s.reveal(40));
  assert.equal(h.s.failure.count, 1);
  await fail(h.s.retry());
  assert.equal(h.s.failure.count, 2, 'a Retry that fails again is the second failure in a row');
  assert.equal(h.of('failed').at(-1).payload.count, 2);
  const crashed = h.s.retry();
  h.client.fail(new Error('worker crashed'));
  await crashed;
  assert.equal(h.s.failure.count, 3);
  const retry = h.s.retry();
  h.client.answer(generate({ ...h.client.last.req, noGuess: false }));
  await retry;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.s.failure, null);

  // A cancel back to the closed board, and a restart, start the count again.
  const k = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const failK = async (p) => { k.client.answer({ ok: false, reason: 'budget', seed: 1, generatorVersion: GENERATOR_VERSION, candidates: 2000 }); await p; };
  await failK(k.s.reveal(40));
  const again = k.s.retry();
  assert.equal(k.s.cancel(), true);
  await again;
  await failK(k.s.reveal(40));
  assert.equal(k.s.failure.count, 1, 'after a cancel');
  k.s.restart();
  await failK(k.s.reveal(40));
  assert.equal(k.s.failure.count, 1, 'after a restart');
});

test('session: cancel while generating goes back to the closed board; nothing is reported and the next first click asks afresh', async () => {
  const h = session();
  const p = h.s.reveal(10);
  const pending = h.client.last;
  h.clock.advance(GENERATING_DELAY_MS);
  assert.equal(h.s.generatingShown, true);
  assert.equal(h.s.cancel(), true);
  assert.equal(h.client.cancels, 1, 'the pending generation is cancelled through the client');
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.s.generatingShown, false);
  assert.deepEqual(h.of('generating').map((e) => e.payload.shown), [true, false]);
  assert.equal(h.s.game.phase, 'awaiting-first-click');
  assert.equal(h.s.failure, null);
  assert.equal(h.s.seed, null);
  assert.equal(h.s.summary(), null);
  assert.equal(h.s.replay(), null);
  assert.equal(h.clock.pending, 0);
  for (const type of ['started', 'changed', 'failed', 'finished', 'abandoned']) assert.equal(h.of(type).length, 0, type);
  // A late answer for the cancelled request changes nothing.
  pending.resolve(generate(pending.req));
  await tick();
  assert.equal(h.s.state, SESSION_STATE.READY);
  // The next first click asks for a fresh board around its own cell.
  const next = h.s.reveal(20);
  assert.equal(h.client.requests.length, 2);
  assert.equal(h.client.last.req.firstClick, 20);
  h.client.answer();
  await next;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.of('started').length, 1);
  h.s.leave();
  assert.equal(h.of('abandoned').length, 1, 'the game played after the cancel is the one reported');
});

test('session: cancel before the "generating" card shows also goes back, and does nothing outside generation', async () => {
  const h = session();
  const p = h.s.reveal(10);
  assert.equal(h.s.generatingShown, false);
  assert.equal(h.s.cancel(), true);
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.of('generating').length, 0);
  assert.equal(h.clock.pending, 0);

  assert.equal(h.s.cancel(), false, 'ready: nothing to cancel');
  const q = h.s.reveal(10);
  h.client.answer({ ok: false, reason: 'budget', seed: 1, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  await q;
  assert.equal(h.s.cancel(), false, 'failed: the offer answers it');
  assert.equal(h.s.state, SESSION_STATE.FAILED);
  const r = h.s.retry();
  h.client.answer();
  await r;
  assert.equal(h.s.cancel(), false, 'playing: nothing to cancel');
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.client.cancels, 1);
});

test('session: restart after the first click emits game abandoned with its summary first, then opens a new closed board', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  await startWith(h, 0, [2]);
  h.clock.advance(800);
  const inProgress = h.s.summary();
  assert.equal(inProgress.outcome, 'abandoned');
  assert.equal(inProgress.elapsedMs, 800);
  const oldGame = h.s.game;
  h.s.restart();
  const [abandoned] = h.of('abandoned');
  assert.equal(abandoned.payload.summary.outcome, 'abandoned');
  assert.equal(abandoned.payload.summary.elapsedMs, 800);
  assert.equal(abandoned.payload.summary.seed, 42);
  assert.notEqual(h.s.game, oldGame);
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.s.game.phase, 'awaiting-first-click');
  assert.equal(h.s.elapsedMs(), 0);
  assert.equal(h.s.summary(), null);
});

test('session: every summary of one game carries the same id, and the next game a new one', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  await startWith(h, 0, [2]);
  const first = h.s.summary();
  assert.equal(typeof first.id, 'string');
  h.clock.advance(300);
  assert.equal(h.s.summary().id, first.id);
  h.s.restart();
  assert.equal(h.of('abandoned')[0].payload.summary.id, first.id);
  await startWith(h, 0, [2]);
  const second = h.s.summary();
  assert.notEqual(second.id, first.id);
  h.s.reveal(2);
  assert.equal(h.of('finished')[0].payload.summary.id, second.id);
});

test('session: leave after the first click emits game abandoned; after leaving nothing is accepted', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  await startWith(h, 0, [2]);
  h.s.leave();
  assert.equal(h.of('abandoned').length, 1);
  assert.equal(h.s.state, SESSION_STATE.LEFT);
  assert.equal(h.s.reveal(3), null);
  h.s.leave();
  assert.equal(h.of('abandoned').length, 1);
});

test('session: before the first click, restart and leave report nothing', () => {
  const h = session();
  h.s.restart();
  h.s.leave();
  assert.equal(h.of('abandoned').length, 0);
  assert.equal(h.of('finished').length, 0);
});

test('session: a finished game is not abandoned by restart or leave', async () => {
  const h = session({ size: 'custom', custom: { width: 3, height: 1, mines: 1 }, noGuess: false });
  await startWith(h, 0, [2]);
  assert.equal(h.s.state, SESSION_STATE.WON);
  h.s.restart();
  h.s.leave();
  assert.equal(h.of('abandoned').length, 0);
  assert.equal(h.of('finished').length, 1);
});

test('session: restart cancels a pending generation, whose late answer is dropped, and reports nothing', async () => {
  const h = session();
  const p = h.s.reveal(10);
  const pending = h.client.last;
  h.clock.advance(GENERATING_DELAY_MS);
  assert.equal(h.s.generatingShown, true);
  h.s.restart();
  assert.equal(h.client.cancels, 1);
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.s.generatingShown, false);
  assert.equal(h.of('abandoned').length, 0);
  assert.equal(h.clock.pending, 0);
  // A late answer for the cancelled request would change nothing.
  pending.resolve(generate(pending.req));
  await tick();
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.s.game.phase, 'awaiting-first-click');
  assert.equal(h.of('started').length, 0);
});

test('session: leave cancels a pending generation', async () => {
  const h = session();
  const p = h.s.reveal(10);
  h.s.leave();
  assert.equal(h.client.cancels, 1);
  assert.equal(await p, null);
  assert.equal(h.of('failed').length, 0);
});

test('session: reveal and flag while generating are ignored; one request per first click', async () => {
  const h = session();
  const p = h.s.reveal(10);
  assert.equal(h.s.reveal(11), null);
  assert.equal(h.s.toggleFlag(11), null);
  assert.equal(h.client.requests.length, 1);
  h.client.answer();
  await p;
});

test('session: flags and chords before the first reveal follow the engine (nothing happens)', () => {
  const h = session();
  assert.equal(h.s.toggleFlag(3).changed.length, 0);
  assert.equal(h.s.chord(3).changed.length, 0);
  assert.equal(h.client.requests.length, 0);
  assert.equal(h.s.state, SESSION_STATE.READY);
});

test('session: an invalid choice throws at creation', () => {
  assert.throws(() => createSession({ choice: { size: 'custom', custom: { width: 0, height: 1, mines: 1 }, noGuess: false }, client: fakeClient(), clock: fakeClock() }), RangeError);
});

test('session: the session and board setup are DOM-free; standard boards go through generate(), no-guess ones through the client', () => {
  for (const file of ['session.js', 'board-setup.js']) {
    const src = readFileSync(new URL(`../js/classic2d/${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(document|window|localStorage|HTMLElement|requestAnimationFrame)\b/, file);
    assert.doesNotMatch(src, /from '\.\.\/generation\/(placer|solver|worker)\.js'/, file);
    assert.doesNotMatch(src, /logic\.js/, file);
  }
  const session = readFileSync(new URL('../js/classic2d/session.js', import.meta.url), 'utf8');
  assert.match(session, /from '\.\.\/generation\/generate\.js'/, 'the standard placement is the worker\'s own code path');
});

// ---------- synchronous standard boards ----------

test('session: a standard first click places the board at once — no request, no generating, the reveal in the same call', () => {
  const clock = fakeClock();
  const client = fakeClient();
  const h = session({ size: 'expert', noGuess: false }, { clock, client });
  const r = h.s.reveal(37);
  assert.equal(r instanceof Promise, false, 'the first reveal is applied in the same call');
  assert.ok(r.changed.length >= 1);
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(client.requests.length, 0, 'no request goes to the worker');
  assert.equal(h.of('generating').length, 0);
  assert.equal(clock.pending, 0, 'no status card timer');
  assert.equal(h.of('started').length, 1);
  // the same request, seed and code path the worker runs
  const req = { graph: { kind: 'square', width: 30, height: 16 }, mineCount: 99, firstClick: 37, noGuess: false, seed: 42 };
  assert.deepEqual(h.placed, [req]);
  assert.equal(h.s.seed, 42);
  assert.equal(h.s.generatorVersion, GENERATOR_VERSION);
  const worker = generate(req);
  const summary = h.s.summary();
  assert.equal(summary.seed, worker.seed);
  assert.equal(summary.generatorVersion, worker.generatorVersion);
});

test('session: the default placement is generate() itself: the mines equal the worker\'s answer to the same request', () => {
  const client = fakeClient();
  let seed = 900;
  const s = createSession({ choice: { size: 'intermediate', noGuess: false }, client, clock: fakeClock(), randomSeed: () => seed });
  s.reveal(100);
  const req = { graph: { kind: 'square', width: 16, height: 16 }, mineCount: 40, firstClick: 100, noGuess: false, seed };
  const worker = handleWorker(req);
  const replay = decodeReplay(s.replay(s.summary()).blob);
  assert.deepEqual(replay.header.mines, [...worker.mines]);
  assert.equal(replay.header.seed, worker.seed);
  assert.equal(replay.header.generatorVersion, worker.generatorVersion);
  assert.equal(client.requests.length, 0);
});

test('session: a standard board starts the timer at the first click itself', () => {
  const h = session({ size: 'beginner', noGuess: false });
  h.clock.advance(5000);
  h.s.reveal(40);
  assert.equal(h.s.elapsedMs(), 0);
  h.clock.advance(1500);
  assert.equal(h.s.elapsedMs(), 1500);
});

// ---------- pre-generated boards ----------

const BEGINNER_NG = { size: 'beginner', noGuess: true };
const MARK = startCell({ kind: 'square', width: 9, height: 9 });
function withPregen({ answered = true, result } = {}) {
  const client = fakeClient();
  const req = boardSetup(BEGINNER_NG).request(MARK, 777);
  const pg = pregenerate(client, req);
  if (answered) client.answer(result);
  const h = session(BEGINNER_NG, { client, extra: { pregenerated: pg } });
  return { h, client, req, pg };
}

test('session: a pre-generated board, arrived, is the game\'s board on a click on the mark — at once, with its seed', async () => {
  const { h, client, req } = withPregen();
  await tick();
  assert.equal(h.s.markedCell, MARK, 'the marked start cell shows while the board waits');
  const r = h.s.reveal(MARK);
  assert.equal(r instanceof Promise, false, 'applied in the same call');
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.of('generating').length, 0);
  assert.equal(client.requests.length, 1, 'only the pre-generation was asked');
  assert.equal(h.s.seed, 777);
  assert.equal(h.s.markedCell, -1);
  assert.deepEqual(h.of('mark').map((e) => e.payload), [{ cell: -1 }], 'the mark goes at the first click');
  const expected = generate(req);
  const replay = decodeReplay(h.s.replay(h.s.summary()).blob);
  assert.deepEqual(replay.header.mines, [...expected.mines], 'the recorded seed rebuilds the board exactly');
  assert.equal(replay.header.seed, 777);
  assert.equal(h.s.summary().seed, 777);
  assert.deepEqual([...generate({ ...req, seed: replay.header.seed }).mines], replay.header.mines);
  assert.equal(h.s.elapsedMs(), 0, 'the timer starts at the click');
});

test('session: a pre-generated board still in flight is waited for on a click on the mark, with the card\'s normal rules', async () => {
  const { h, client } = withPregen({ answered: false });
  const p = h.s.reveal(MARK);
  assert.ok(p instanceof Promise);
  assert.equal(h.s.state, SESSION_STATE.GENERATING);
  assert.equal(client.requests.length, 1, 'the same request, not a new one');
  client.progress(14);
  h.clock.advance(GENERATING_DELAY_MS);
  assert.equal(h.s.generatingShown, true, 'the card shows by the delay');
  h.clock.advance(6000);
  assert.deepEqual(h.s.progress, { candidates: 14, seconds: 6 });
  client.answer();
  await p;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.s.seed, 777);
  assert.equal(h.s.generatingShown, false);
  assert.equal(h.s.progress, null);
  assert.equal(h.s.elapsedMs(), 0, 'the timer starts when the board arrives');
});

test('session: a click elsewhere discards the pre-generated board and generates around the clicked cell with a fresh seed', async () => {
  const pending = withPregen({ answered: false });
  const p = pending.h.s.reveal(0);
  assert.equal(pending.client.cancels, 1, 'the in-flight pre-generation is cancelled');
  assert.equal(pending.client.requests.length, 2);
  assert.deepEqual(pending.client.last.req, { graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: 0, noGuess: true, seed: 42 });
  pending.client.answer();
  await p;
  assert.equal(pending.h.s.seed, 42);
  assert.equal(pending.h.s.state, SESSION_STATE.PLAYING);

  const ready = withPregen();
  await tick();
  const q = ready.h.s.reveal(1);
  assert.equal(ready.client.cancels, 0, 'an arrived board needs no cancel');
  assert.equal(ready.client.last.req.firstClick, 1);
  ready.client.answer();
  await q;
  assert.equal(ready.h.s.seed, 42);
});

test('session: a failed pre-generation leads to a fresh request at the click, and unmarks its cell', async () => {
  const { h, client } = withPregen({ result: { ok: false, reason: 'budget', seed: 777, generatorVersion: GENERATOR_VERSION, candidates: 2000 } });
  await tick();
  await tick();
  assert.equal(h.s.markedCell, -1);
  assert.deepEqual(h.of('mark').map((e) => e.payload), [{ cell: -1 }]);
  const p = h.s.reveal(MARK);
  assert.equal(client.requests.length, 2, 'asked afresh');
  assert.equal(client.last.req.firstClick, MARK);
  assert.equal(client.last.req.seed, 42);
  client.answer();
  await p;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
});

test('session: restart and leave discard a pre-generated board not taken over', () => {
  const a = withPregen({ answered: false });
  a.h.s.leave();
  assert.equal(a.client.cancels, 1);
  const b = withPregen({ answered: false });
  b.h.s.restart();
  assert.equal(b.client.cancels, 1);
  assert.equal(b.h.s.markedCell, -1);
});

test('session: cancel while waiting on a pre-generated board discards it; the next first click asks afresh', async () => {
  const { h, client } = withPregen({ answered: false });
  const p = h.s.reveal(MARK);
  assert.equal(h.s.cancel(), true);
  assert.equal(await p, null);
  assert.equal(h.s.markedCell, -1);
  const q = h.s.reveal(MARK);
  assert.equal(client.requests.length, 2);
  client.answer();
  await q;
  assert.equal(h.s.seed, 42);
});

// ---------- a forced, marked start cell (the daily and a challenge) ----------

const EXPERT_NG = { size: 'expert', noGuess: true };
const EXPERT_MARK = startCell({ kind: 'square', width: 30, height: 16 });
function forced(fixed, opts = {}) {
  const h = session(opts.choice ?? EXPERT_NG, { client: opts.client, extra: { fixed, pregenerated: opts.pregenerated ?? null } });
  const refused = [];
  h.s.on('refused', (p) => refused.push(p));
  return { ...h, refused };
}

test('session: a forced start cell is marked, and a first reveal elsewhere changes nothing, records nothing and hints', async () => {
  const h = forced({ startCell: EXPERT_MARK, seed: 0x9c41d07a, challenge: true });
  assert.equal(h.s.markedCell, EXPERT_MARK, 'marked even with no pre-generated board');
  assert.equal(h.s.fixed.startCell, EXPERT_MARK);
  assert.equal(h.s.reveal(0), null);
  assert.equal(h.s.state, SESSION_STATE.READY);
  assert.equal(h.client.requests.length, 0, 'nothing is generated');
  assert.deepEqual(h.refused, [{ cell: 0, hint: START_HINT }]);
  assert.equal(START_HINT, 'Start on the marked cell');
  assert.equal(h.s.game.state.revealed.every((v) => !v), true);
  assert.equal(h.s.toggleFlag(3).changed !== undefined, true, 'a flag before the first reveal behaves as the mode treats it');
  const p = h.s.reveal(EXPERT_MARK);
  assert.deepEqual(h.client.last.req, boardSetup(EXPERT_NG).request(EXPERT_MARK, 0x9c41d07a), 'the code\'s seed and start cell');
  h.clock.advance(3000);
  h.client.answer();
  await p;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.s.elapsedMs(), 0, 'the timer starts at the first click on the mark');
  const expected = generate(boardSetup(EXPERT_NG).request(EXPERT_MARK, 0x9c41d07a));
  const replay = decodeReplay(h.s.replay(h.s.summary()).blob);
  assert.deepEqual(replay.header.mines, [...expected.mines], 'the board is generate() for the code');
  assert.deepEqual(replay.actions.filter((a) => a.kind === 'reveal').map((a) => a.cell), [EXPERT_MARK], 'the refused reveal is not recorded');
  const summary = h.s.summary();
  assert.equal(summary.startCell, EXPERT_MARK);
  assert.equal(summary.challenge, true);
  assert.equal(summary.seed, 0x9c41d07a);
  assert.equal(h.s.markedCell, -1);
});

test('session: a daily takes its pre-generated board on the mark, and its summaries carry the daily board and date', async () => {
  const client = fakeClient();
  const req = boardSetup(EXPERT_NG).request(EXPERT_MARK, 4242);
  const pg = pregenerate(client, req);
  client.answer();
  const h = forced({ startCell: EXPERT_MARK, seed: 4242, daily: '20261011' }, { client, pregenerated: pg });
  await tick();
  const r = h.s.reveal(EXPERT_MARK);
  assert.equal(r instanceof Promise, false);
  const summary = h.s.summary();
  assert.equal(summary.daily, '20261011');
  assert.equal(summary.board.daily, true);
  assert.equal(boardKey(summary.board), 'daily:classic-2d:square:30x16:99:no-guess');
  assert.equal('challenge' in summary, false);
  assert.equal(h.s.replay(summary).listing.boardKey, 'daily:classic-2d:square:30x16:99:no-guess');
});

test('session: a forced standard board is placed with the code\'s seed; a failed one offers Back only', async () => {
  const std = forced({ startCell: 40, seed: 99, challenge: true }, { choice: { size: 'beginner', noGuess: false } });
  std.s.reveal(40);
  assert.equal(std.placed[0].seed, 99);
  assert.equal(std.placed[0].firstClick, 40);
  assert.equal(std.s.state, SESSION_STATE.PLAYING);

  const h = forced({ startCell: EXPERT_MARK, seed: 5, challenge: true });
  const p = h.s.reveal(EXPERT_MARK);
  h.client.answer({ ok: false, reason: 'no board in budget', seed: 5, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  await p;
  assert.equal(h.s.state, SESSION_STATE.FAILED);
  assert.deepEqual(h.s.failure.offers, [], 'never another board');
  assert.equal(h.s.retry(), null);
  assert.equal(h.s.playStandard(), null);
});

test('session: restart after a forced game started plays free; before its first reveal it stays forced', async () => {
  const h = forced({ startCell: 40, seed: 99, challenge: true }, { choice: { size: 'beginner', noGuess: false } });
  h.s.restart();
  assert.equal(h.s.markedCell, 40, 'not started: still the same board');
  h.s.reveal(40);
  h.s.restart();
  assert.equal(h.s.fixed, null);
  assert.equal(h.s.markedCell, -1);
  h.s.reveal(3);
  assert.equal(h.s.state, SESSION_STATE.PLAYING, 'a free first click');
  assert.equal('challenge' in h.s.summary(), false);
  assert.equal(h.s.summary().startCell, 3);
});

// ---------- progress and Play a standard board from the card ----------

test('session: progress while generating is the worker\'s candidates and the whole seconds since the click', async () => {
  const h = session();
  assert.equal(h.s.progress, null);
  const p = h.s.reveal(10);
  assert.deepEqual(h.s.progress, { candidates: 0, seconds: 0 });
  h.clock.advance(1200);
  h.client.progress(9);
  assert.deepEqual(h.s.progress, { candidates: 9, seconds: 1 });
  h.client.answer();
  await p;
  assert.equal(h.s.progress, null);
});

test('session: Play a standard board while generating cancels the request and plays a standard board at once', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const p = h.s.reveal(40);
  h.clock.advance(GENERATING_DELAY_MS);
  assert.equal(h.s.generatingShown, true);
  h.clock.advance(3000);
  const r = h.s.playStandard();
  assert.equal(h.client.cancels, 1, 'the no-guess request is cancelled through the client');
  assert.equal(r instanceof Promise, false);
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.equal(h.s.generatingShown, false);
  assert.equal(await p, null, 'the cancelled request delivers nothing');
  assert.equal(h.s.choice.noGuess, false);
  assert.equal(h.s.elapsedMs(), 0, 'the wait stays off the clock');
  assert.deepEqual(h.placed.at(-1), { graph: { kind: 'square', width: 9, height: 9 }, mineCount: 31, firstClick: 40, noGuess: false, seed: 43 });
  const summary = h.s.summary();
  assert.equal(summary.board.noGuess, false, 'played and recorded as a standard board');
  const replay = decodeReplay(h.s.replay(summary).blob);
  assert.equal(replay.header.board.noGuess, false);
  assert.deepEqual(replay.actions, [{ time: 0, kind: 'reveal', cell: 40 }]);
});
