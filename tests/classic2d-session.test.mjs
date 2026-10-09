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
  createSession, createTimer, SESSION_STATE, FAILURE_OFFERS, GENERATING_DELAY_MS,
} from '../js/classic2d/session.js';
import { CUSTOM_LIMITS, getRuleProfile, REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { generate } from '../js/generation/generate.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { boardKey } from '../js/records/board.js';

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
    request(req) {
      if (inFlight) client.cancel();
      return new Promise((resolve, reject) => {
        inFlight = { req, resolve, reject };
        requests.push(inFlight);
      });
    },
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

function session(choice = { size: 'beginner', noGuess: false }, opts = {}) {
  const clock = opts.clock ?? fakeClock();
  const client = opts.client ?? fakeClient();
  let seed = 41;
  const s = createSession({ choice, client, clock, randomSeed: () => ++seed, ...opts.extra });
  const events = [];
  for (const type of ['generating', 'started', 'changed', 'failed', 'finished', 'abandoned']) {
    s.on(type, (payload) => events.push({ type, payload }));
  }
  return { s, clock, client, events, of: (type) => events.filter((e) => e.type === type) };
}

// Supplies a board through the fake client: the first reveal at `cell`, answered with `mines`.
async function startWith(h, cell, mines) {
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
  assert.deepEqual(validateCustom({ width: 1, height: 1, mines: 0 }), { ok: true });
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

test('last choice: a malformed document reads as the default; an invalid choice is not saved', async () => {
  const backend = createMemoryBackend({ initial: { [LAST_CHOICE_DOC]: JSON.stringify({ version: 1, data: { size: 'huge' } }) } });
  const last = createLastChoice({ storage: createStorage({ backend }) });
  assert.deepEqual(await last.load(), DEFAULT_CHOICE);
  await assert.rejects(last.save({ size: 'custom', custom: { width: 0, height: 1, mines: 0 }, noGuess: false }), RangeError);
});

// ---------- timer ----------

test('timer: measures from start, pauses, stops, whole seconds for display and milliseconds for the result', () => {
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
  clock.advance(10000);
  assert.equal(t.elapsedMs(), 1500);
  t.pause(); // a second pause changes nothing
  t.resume();
  clock.advance(600);
  assert.equal(t.elapsedMs(), 2100);
  assert.equal(t.seconds(), 2);
  t.stop();
  clock.advance(5000);
  assert.equal(t.elapsedMs(), 2100);
  t.resume(); // a stopped timer stays stopped
  clock.advance(5000);
  assert.equal(t.elapsedMs(), 2100);
  assert.ok(Number.isInteger(t.elapsedMs()));
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

test('session: pause freezes the timer and board input; resume continues', async () => {
  const h = session({ size: 'custom', custom: { width: 4, height: 1, mines: 1 }, noGuess: false });
  h.s.pause(); // before the first click: nothing
  assert.equal(h.s.paused, false);
  await startWith(h, 0, [2]);
  h.clock.advance(1000);
  h.s.pause();
  assert.equal(h.s.paused, true);
  h.clock.advance(60000);
  assert.equal(h.s.elapsedMs(), 1000);
  assert.equal(h.s.reveal(3), null); // input refused while paused
  assert.equal(h.s.game.state.revealed[3], 0);
  h.s.resume();
  assert.equal(h.s.paused, false);
  h.clock.advance(500);
  assert.equal(h.s.elapsedMs(), 1500);
});

test('session: a pause while generating starts the timer paused once the board arrives', async () => {
  const h = session();
  const p = h.s.reveal(0);
  h.s.pause();
  h.client.answer();
  await p;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  h.clock.advance(4000);
  assert.equal(h.s.elapsedMs(), 0);
  h.s.resume();
  h.clock.advance(700);
  assert.equal(h.s.elapsedMs(), 700);
});

test('session: a no-guess failure shows the failure with Retry and Play a standard board; the timer never starts', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const p = h.s.reveal(40);
  h.client.answer({ ok: false, reason: 'no board within the attempt budget', seed: 42, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.FAILED);
  assert.deepEqual([...FAILURE_OFFERS], ['retry', 'standard']);
  const [failed] = h.of('failed');
  assert.deepEqual(failed.payload, { reason: 'no board within the attempt budget', offers: ['retry', 'standard'] });
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

test('session: Play a standard board keeps the size and turns no-guess off', async () => {
  const h = session({ size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: true });
  const p = h.s.reveal(40);
  h.client.answer({ ok: false, reason: 'budget', seed: 42, generatorVersion: GENERATOR_VERSION, candidates: 2000 });
  await p;
  const standard = h.s.playStandard();
  assert.deepEqual(h.client.last.req, {
    graph: { kind: 'square', width: 9, height: 9 }, mineCount: 31, firstClick: 40, noGuess: false, seed: 43,
  });
  h.client.answer();
  await standard;
  assert.equal(h.s.state, SESSION_STATE.PLAYING);
  assert.deepEqual(h.s.choice, { size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: false });
  assert.equal(h.s.setup.identity.noGuess, false);
  h.s.restart();
  h.s.reveal(0);
  assert.equal(h.client.last.req.noGuess, false); // the switched choice stays for this session
});

test('session: Retry and Play a standard board do nothing unless the board failed', () => {
  const h = session();
  assert.equal(h.s.retry(), null);
  assert.equal(h.s.playStandard(), null);
  assert.equal(h.client.requests.length, 0);
});

test('session: a worker failure is a generation failure with the same offer', async () => {
  const h = session();
  const p = h.s.reveal(0);
  h.client.fail(new Error('worker crashed'));
  assert.equal(await p, null);
  assert.equal(h.s.state, SESSION_STATE.FAILED);
  assert.deepEqual(h.of('failed')[0].payload, { reason: 'worker crashed', offers: ['retry', 'standard'] });
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
  assert.throws(() => createSession({ choice: { size: 'custom', custom: { width: 0, height: 1, mines: 0 }, noGuess: false }, client: fakeClient(), clock: fakeClock() }), RangeError);
});

test('session: the session and board setup are DOM-free and talk to generation only through the client', () => {
  for (const file of ['session.js', 'board-setup.js']) {
    const src = readFileSync(new URL(`../js/classic2d/${file}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(document|window|localStorage|HTMLElement|requestAnimationFrame)\b/, file);
    assert.doesNotMatch(src, /from '\.\.\/generation\/(generate|placer|solver|worker)\.js'/, file);
    assert.doesNotMatch(src, /logic\.js/, file);
  }
});
