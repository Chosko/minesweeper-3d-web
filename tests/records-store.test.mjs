// The records store (js/records/store.js): the records, history and game-in-progress documents
// over platform storage on the in-memory backend — load once, record then save, recovery from the
// history, unavailable storage, a refused newer format, the shell's abandoned-game and in-progress
// hooks, and a game closed mid-game settled by a second store load.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createModeHost } from '../js/shell/mode-host.js';
import { createPauseController } from '../js/shell/pause.js';
import { createBoardIdentity } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createRecordsModel } from '../js/records/model.js';
import {
  createRecordsStore, RECORDS_DOC, HISTORY_DOC, IN_PROGRESS_DOC, RECORDS_VERSION, HISTORY_VERSION,
  IN_PROGRESS_VERSION,
} from '../js/records/store.js';

const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });

let nextId = 1;
let clock = Date.parse('2026-10-01T00:00:00.000Z');

function game({ outcome = 'won', ms = 10000, bbbv = 20, clicks = 20, id } = {}) {
  const bbbvSolved = outcome === 'won' ? bbbv : bbbv - 5;
  const engine = {
    bbbv, bbbvSolved,
    clicks: { reveal: { effective: clicks, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
  };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  clock += 60000;
  return buildSummary({ engine, elapsedMs: ms, board: BEGINNER, seed: 7, generatorVersion: 1, endedAt: new Date(clock), id: id ?? `g-${nextId++}` });
}

const doc = (version, data) => JSON.stringify({ version, data });
const stored = (backend, name) => {
  const text = backend.documents.get(name);
  return text === undefined ? undefined : JSON.parse(text);
};

// A store over a fresh storage on `backend` — a new storage per call, as a new launch would make.
function open(backend = createMemoryBackend(), opts = {}) {
  const storage = createStorage({ backend });
  const notSaved = [];
  const store = createRecordsStore({ storage, onNotSaved: (r) => notSaved.push(r), ...opts });
  return { backend, storage, store, notSaved };
}

// A pauser stand-in: records attachments and lets a test fire a hand-off.
function fakePauser() {
  const listeners = { finished: new Set(), abandoned: new Set(), inProgress: new Set() };
  return {
    listeners,
    attach(name, fn) { listeners[name].add(fn); return () => listeners[name].delete(fn); },
    fire(name, summary, mode = 'classic-2d') { for (const fn of listeners[name]) fn(summary, mode); },
  };
}

// ---------- registration and load ----------

test('the three documents are registered under their own names at version 1', () => {
  const names = [];
  const storage = { register: (name, version) => names.push([name, version]), load: async () => undefined, save: async () => ({ ok: true }), available: () => true };
  createRecordsStore({ storage });
  assert.deepEqual(names.sort(), [[HISTORY_DOC, 1], [IN_PROGRESS_DOC, 1], [RECORDS_DOC, 1]].sort());
  assert.equal(new Set([RECORDS_DOC, HISTORY_DOC, IN_PROGRESS_DOC]).size, 3);
  assert.deepEqual([RECORDS_VERSION, HISTORY_VERSION, IN_PROGRESS_VERSION], [1, 1, 1]);
});

test('load reads each document once, however often it is called', async () => {
  const loads = [];
  const backend = createMemoryBackend();
  const real = createStorage({ backend });
  const storage = { ...real, load: (n) => { loads.push(n); return real.load(n); } };
  const store = createRecordsStore({ storage });
  const p = store.load();
  assert.equal(store.load(), p);
  await p;
  await store.load();
  assert.deepEqual(loads.sort(), [HISTORY_DOC, IN_PROGRESS_DOC, RECORDS_DOC].sort());
});

test('record and the hooks before load throw', () => {
  const { store } = open();
  assert.throws(() => store.record(game()), /before load/);
  assert.throws(() => store.begin(game({ outcome: 'abandoned' })), /before load/);
});

test('a fresh install has empty records and writes nothing at load', async () => {
  const { store, backend } = open();
  await store.load();
  assert.deepEqual(store.boardsPlayed(), []);
  assert.deepEqual(store.overall(), { games: 0, wins: 0, currentStreak: 0, longestStreak: 0 });
  await store.settled();
  assert.equal(backend.documents.size, 0);
});

// ---------- record ----------

test('record updates memory first, then saves both documents', async () => {
  const { store, backend } = open();
  await store.load();
  const g = game({ ms: 9000 });
  const comparison = store.record(g);
  assert.equal(comparison.time.newBest, true);
  assert.equal(store.bests(BEGINNER).time.value, 9000); // in memory before any save has landed
  await store.settled();
  const model = createRecordsModel();
  model.record(g);
  assert.deepEqual(stored(backend, RECORDS_DOC), { version: 1, data: model.documents().records });
  assert.deepEqual(stored(backend, HISTORY_DOC), { version: 1, data: model.documents().history });
});

test('recorded games survive a reload; the same id recorded twice is a no-op', async () => {
  const first = open();
  await first.store.load();
  const g = game({ ms: 8000 });
  const c1 = first.store.record(g);
  first.store.record(game({ outcome: 'lost' }));
  await first.store.settled();
  const again = open(first.backend);
  await again.store.load();
  assert.deepEqual(again.store.counters(BEGINNER), { games: 2, wins: 1, currentStreak: 0, longestStreak: 1 });
  let changes = 0;
  again.store.onChange(() => changes++);
  assert.deepEqual(again.store.record(g), c1);
  assert.equal(changes, 0);
  assert.equal(again.store.counters(BEGINNER).games, 2);
});

test('onChange fires after each recorded game, and stops after unsubscribe', async () => {
  const { store } = open();
  await store.load();
  const seen = [];
  const off = store.onChange((c) => seen.push(store.counters(BEGINNER).games));
  store.record(game());
  store.record(game({ outcome: 'lost' }));
  off();
  store.record(game());
  assert.deepEqual(seen, [1, 2]);
});

test('a throwing listener does not stop the others or the record', async () => {
  const { store } = open();
  await store.load();
  let reached = false;
  store.onChange(() => { throw new Error('boom'); });
  store.onChange(() => { reached = true; });
  assert.doesNotThrow(() => store.record(game()));
  assert.equal(reached, true);
});

test('a failed save keeps the session records correct and is reported once', async () => {
  const backend = createMemoryBackend();
  backend.write = async () => { throw new Error('quota'); };
  const { store, notSaved } = open(backend);
  await store.load();
  store.record(game({ ms: 7000 }));
  store.record(game({ ms: 6000 }));
  await store.settled();
  assert.equal(store.bests(BEGINNER).time.value, 6000);
  assert.equal(store.counters(BEGINNER).games, 2);
  assert.equal(notSaved.length, 1);
  assert.equal(notSaved[0].reason, 'write-failed');
});

// ---------- recovery ----------

for (const [label, records] of [['missing', undefined], ['corrupt', '{not json']]) {
  test(`a ${label} records document is rebuilt from an intact history`, async () => {
    const model = createRecordsModel();
    const games = [game({ ms: 9000 }), game({ outcome: 'lost' }), game({ ms: 8000 }), game({ ms: 8500 })];
    for (const g of games) model.record(g);
    const { history, records: expected } = model.documents();
    const initial = { [HISTORY_DOC]: doc(1, history) };
    if (records !== undefined) initial[RECORDS_DOC] = records;
    const { store, backend } = open(createMemoryBackend({ initial }));
    await store.load();
    assert.deepEqual(store.bests(BEGINNER), model.bests(BEGINNER));
    assert.deepEqual(store.counters(BEGINNER), { games: 4, wins: 3, currentStreak: 2, longestStreak: 2 });
    assert.deepEqual(store.overall(), model.overall());
    await store.settled();
    assert.deepEqual(stored(backend, RECORDS_DOC), { version: 1, data: expected });
  });
}

// ---------- availability ----------

test('when storage will not persist, records work for the session and available() says so', async () => {
  const { store, notSaved } = open(createMemoryBackend({ available: false }));
  await store.load();
  assert.equal(store.available(), false);
  store.record(game({ ms: 5000 }));
  await store.settled();
  assert.equal(store.bests(BEGINNER).time.value, 5000);
  assert.equal(store.counters(BEGINNER).games, 1);
  assert.equal(notSaved.length, 0);
});

test('available() is true over working storage', async () => {
  const { store } = open();
  await store.load();
  assert.equal(store.available(), true);
});

// ---------- newer format ----------

for (const name of [RECORDS_DOC, HISTORY_DOC]) {
  test(`a newer ${name} document is left untouched and the session runs on empty, unsaved records`, async () => {
    const model = createRecordsModel();
    model.record(game());
    const { records, history } = model.documents();
    const marker = game({ outcome: 'abandoned' });
    const initial = {
      [RECORDS_DOC]: doc(name === RECORDS_DOC ? 2 : 1, records),
      [HISTORY_DOC]: doc(name === HISTORY_DOC ? 2 : 1, history),
      [IN_PROGRESS_DOC]: doc(1, marker),
    };
    const backend = createMemoryBackend({ initial: { ...initial } });
    const { store } = open(backend);
    await store.load();
    assert.deepEqual(store.boardsPlayed(), []);
    assert.equal(store.available(), false);
    store.record(game());
    store.begin(game({ outcome: 'abandoned' }));
    assert.equal(store.counters(BEGINNER).games, 1);
    await store.settled();
    assert.deepEqual(Object.fromEntries(backend.documents), initial);
  });
}

// ---------- the shell hooks ----------

test('attach: the abandoned-game hook records the summary', async () => {
  const { store } = open();
  await store.load();
  const pauser = fakePauser();
  store.attach(pauser);
  pauser.fire('abandoned', game({ outcome: 'abandoned' }));
  assert.deepEqual(store.counters(BEGINNER), { games: 1, wins: 0, currentStreak: 0, longestStreak: 0 });
});

test('attach: the in-progress hook begins the marker, then checkpoints it; detach stops both hooks', async () => {
  const { store, backend } = open();
  await store.load();
  const pauser = fakePauser();
  const detach = store.attach(pauser);
  const calls = [];
  const { begin, checkpoint } = store;
  store.begin = (s) => { calls.push(['begin', s.elapsedMs]); return begin(s); };
  store.checkpoint = (s) => { calls.push(['checkpoint', s.elapsedMs]); return checkpoint(s); };
  const a = game({ outcome: 'abandoned', ms: 100, id: 'live' });
  pauser.fire('inProgress', a);
  pauser.fire('inProgress', { ...a, elapsedMs: 900 });
  await store.settled();
  assert.deepEqual(calls, [['begin', 100], ['checkpoint', 900]]);
  assert.equal(stored(backend, IN_PROGRESS_DOC).data.elapsedMs, 900);
  detach();
  pauser.fire('inProgress', { ...a, elapsedMs: 1500 });
  pauser.fire('abandoned', a);
  assert.equal(calls.length, 2);
  assert.equal(store.counters(BEGINNER).games, 0);
});

test('attach: a summary that is not a record (a fixed 3D board\'s null) is ignored by both hooks', async () => {
  const { store, backend } = open();
  await store.load();
  const pauser = fakePauser();
  store.attach(pauser);
  assert.doesNotThrow(() => pauser.fire('inProgress', null, '3d'));
  assert.doesNotThrow(() => pauser.fire('abandoned', null, '3d'));
  await store.settled();
  assert.equal(store.counters(BEGINNER).games, 0);
  assert.equal(backend.documents.has(IN_PROGRESS_DOC), false);
});

for (const outcome of ['won', 'lost', 'abandoned']) {
  test(`recording the summary with the marker's id (${outcome}) clears the marker`, async () => {
    const { store, backend } = open();
    await store.load();
    store.begin(game({ outcome: 'abandoned', id: 'live' }));
    await store.settled();
    assert.equal(stored(backend, IN_PROGRESS_DOC).data.id, 'live');
    store.record(game({ outcome, id: 'live' }));
    await store.settled();
    assert.equal(stored(backend, IN_PROGRESS_DOC).data, null);
  });
}

test('recording another game leaves the marker in place', async () => {
  const { store, backend } = open();
  await store.load();
  store.begin(game({ outcome: 'abandoned', id: 'live' }));
  store.record(game({ id: 'other' }));
  await store.settled();
  assert.equal(stored(backend, IN_PROGRESS_DOC).data.id, 'live');
});

test('a checkpoint after the game was recorded does not bring the marker back', async () => {
  const { store, backend } = open();
  await store.load();
  const g = game({ outcome: 'abandoned', id: 'live' });
  store.begin(g);
  store.record(g);
  store.checkpoint({ ...g, elapsedMs: 99999 });
  await store.settled();
  assert.equal(stored(backend, IN_PROGRESS_DOC).data, null);
});

// ---------- start-up settlement ----------

test('no marker at start-up records nothing', async () => {
  const { store } = open();
  let changes = 0;
  store.onChange(() => changes++);
  await store.load();
  assert.equal(changes, 0);
  assert.equal(store.overall().games, 0);
});

test('a leftover marker is recorded as an abandoned game that ends the streak, and cleared', async () => {
  const model = createRecordsModel();
  model.record(game());
  model.record(game());
  const { records, history } = model.documents();
  const marker = game({ outcome: 'abandoned', ms: 4321, id: 'closed' });
  const backend = createMemoryBackend({
    initial: { [RECORDS_DOC]: doc(1, records), [HISTORY_DOC]: doc(1, history), [IN_PROGRESS_DOC]: doc(1, marker) },
  });
  const { store } = open(backend);
  await store.load();
  assert.deepEqual(store.counters(BEGINNER), { games: 3, wins: 2, currentStreak: 0, longestStreak: 2 });
  const last = store.history(BEGINNER).at(-1);
  assert.equal(last.id, 'closed');
  assert.equal(last.outcome, 'abandoned');
  assert.equal(last.elapsedMs, 4321);
  await store.settled();
  assert.equal(stored(backend, IN_PROGRESS_DOC).data, null);
  assert.equal(stored(backend, HISTORY_DOC).data.at(-1).id, 'closed');
});

test('a leftover marker whose game was already recorded is a no-op', async () => {
  const model = createRecordsModel();
  const g = game({ id: 'done' });
  model.record(g);
  const { records, history } = model.documents();
  const backend = createMemoryBackend({
    initial: {
      [RECORDS_DOC]: doc(1, records), [HISTORY_DOC]: doc(1, history),
      [IN_PROGRESS_DOC]: doc(1, { ...g, outcome: 'abandoned' }),
    },
  });
  const { store } = open(backend);
  await store.load();
  assert.deepEqual(store.counters(BEGINNER), { games: 1, wins: 1, currentStreak: 1, longestStreak: 1 });
  assert.equal(store.history(BEGINNER).length, 1);
});

test('a game closed mid-game through the real shell is settled as a loss by a second store load', async () => {
  // Launch 1: a fake Classic 2D mode behind the real mode host and pause controller.
  const backend = createMemoryBackend();
  const first = open(backend);
  await first.store.load();
  first.store.record(game()); // a won game first: the streak is 1
  const modes = createModeHost();
  let report;
  let live = null;
  modes.register('classic-2d', (r) => {
    report = r;
    return {
      openBoardChoice() {}, start() {}, pause() {}, resume() {}, restart() {}, leave() {},
      summary: () => live,
    };
  });
  const pauser = createPauseController({ modes, showCard() {}, confirm: (_, go) => go(), goMenu() {} });
  first.store.attach(pauser);
  modes.start('classic-2d', {});
  live = game({ outcome: 'abandoned', ms: 100, id: 'closed-tab' });
  report.started();
  report.canPause(true);
  live = { ...live, elapsedMs: 2500 };
  pauser.pause('key');
  live = { ...live, elapsedMs: 3100 };
  pauser.pageHide(); // the tab closes here: nothing else runs
  await first.store.settled();
  assert.equal(first.store.counters(BEGINNER).games, 1);

  // Launch 2: a new storage and store over the same backend.
  const second = open(backend);
  await second.store.load();
  assert.deepEqual(second.store.counters(BEGINNER), { games: 2, wins: 1, currentStreak: 0, longestStreak: 1 });
  const closed = second.store.history(BEGINNER).at(-1);
  assert.equal(closed.id, 'closed-tab');
  assert.equal(closed.outcome, 'abandoned');
  assert.equal(closed.elapsedMs, 3100);
  await second.store.settled();
  assert.equal(stored(backend, IN_PROGRESS_DOC).data, null);

  // Launch 3: nothing left to settle.
  const third = open(backend);
  await third.store.load();
  assert.equal(third.store.counters(BEGINNER).games, 2);
});

test('restart through the real shell records the abandoned game and clears its marker', async () => {
  const backend = createMemoryBackend();
  const { store } = open(backend);
  await store.load();
  const modes = createModeHost();
  let report;
  let live = null;
  modes.register('classic-2d', (r) => {
    report = r;
    return {
      openBoardChoice() {}, start() {}, pause() {}, resume() {}, leave() {},
      restart() { live = null; },
      summary: () => live,
    };
  });
  const pauser = createPauseController({ modes, showCard() {}, confirm: (_, go) => go(), goMenu() {} });
  store.attach(pauser);
  modes.start('classic-2d', {});
  live = game({ outcome: 'abandoned', ms: 700, id: 'restarted' });
  report.started();
  pauser.restart('key');
  await store.settled();
  assert.equal(store.counters(BEGINNER).games, 1);
  assert.equal(store.history(BEGINNER)[0].id, 'restarted');
  assert.equal(stored(backend, IN_PROGRESS_DOC).data, null);
});

test('a game finished through the real shell clears its marker, so the next launch records no loss', async () => {
  const backend = createMemoryBackend();
  const first = open(backend);
  await first.store.load();
  const modes = createModeHost();
  let report;
  let live = null;
  modes.register('classic-2d', (r) => {
    report = r;
    return { openBoardChoice() {}, start() {}, pause() {}, resume() {}, restart() {}, leave() {}, summary: () => live };
  });
  const pauser = createPauseController({ modes, showCard() {}, confirm: (_, go) => go(), goMenu() {} });
  first.store.attach(pauser);
  modes.start('classic-2d', {});
  live = game({ outcome: 'abandoned', ms: 100, id: 'won-game' });
  report.started();
  await first.store.settled();
  assert.equal(stored(backend, IN_PROGRESS_DOC).data.id, 'won-game');
  live = { ...live, outcome: 'won', bbbvSolved: live.bbbv };
  report.finished(live);
  await first.store.settled();
  assert.equal(stored(backend, IN_PROGRESS_DOC).data, null);
  const second = open(backend);
  await second.store.load();
  assert.equal(second.store.counters(BEGINNER).games, 0);
  assert.deepEqual(second.store.history(BEGINNER), []);
});

for (const [label, entries] of [['an empty object', [{}]], ['null', [null]]]) {
  test(`a history holding ${label} loads as empty, unsaved records and is left untouched`, async () => {
    const model = createRecordsModel();
    model.record(game());
    for (const records of [undefined, model.documents().records]) {
      const initial = { [HISTORY_DOC]: doc(1, entries), [IN_PROGRESS_DOC]: doc(1, game({ outcome: 'abandoned' })) };
      if (records) initial[RECORDS_DOC] = doc(1, records);
      const backend = createMemoryBackend({ initial: { ...initial } });
      const { store } = open(backend);
      await store.load();
      assert.deepEqual(store.boardsPlayed(), []);
      assert.equal(store.available(), false);
      store.record(game());
      assert.equal(store.counters(BEGINNER).games, 1);
      await store.settled();
      assert.deepEqual(Object.fromEntries(backend.documents), initial);
    }
  });
}

// ---------- queries ----------

test('the queries read the model: boards played, bests, counters, win rate, history, overall', async () => {
  const { store } = open();
  await store.load();
  store.record(game({ ms: 9000 }));
  store.record(game({ outcome: 'lost' }));
  assert.deepEqual(store.boardsPlayed().map((b) => b.key), ['classic-2d:square:9x9:10:guess']);
  assert.equal(store.winRate(BEGINNER), 0.5);
  assert.equal(store.history('classic-2d:square:9x9:10:guess').length, 2);
  assert.equal(store.overallWinRate(), 0.5);
  assert.equal(store.bests(BEGINNER).time.value, 9000);
});
