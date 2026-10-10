// The end-of-game hand-off to the replay library (js/results/flow.js): a finished or abandoned
// game's summary is recorded first, then its sealed replay is added to the library, pinned when the
// comparison shows a new best; a dropped replay adds nothing; a replay that cannot be saved stays
// available for the session. Over fakes, and over the real library on in-memory platform storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createResultsFlow } from '../js/results/flow.js';
import { createBoardIdentity } from '../js/records/board.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { createReplayLibrary, PIN_BEST } from '../js/replay/library.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

const BEGINNER = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const KEY = 'classic-2d:square:9x9:10:guess';
const clicks = (n) => ({ reveal: { effective: n, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } });
const summary = (over = {}) => ({
  id: 'g1', board: { ...BEGINNER }, outcome: 'won', elapsedMs: 47380, bbbv: 120, bbbvSolved: 120, clicks: clicks(138),
  bbbvPerSecond: 120 / 47.38, efficiency: (100 * 120) / 138, seed: 1, generatorVersion: 1, endedAt: '2026-10-09T10:00:00.000Z',
  ...over,
});
const stat = (newBest) => ({ best: null, value: 1, difference: null, newBest });
const comparisonOf = ({ time = false, rate = false, efficiency = false } = {}) => ({
  time: stat(time), bbbvPerSecond: stat(rate), efficiency: stat(efficiency),
});
const sealed = (s = summary()) => {
  const blob = new Uint8Array([7, 8, 9]);
  return {
    blob,
    listing: {
      id: s.id, boardKey: KEY, mode: 'classic-2d', outcome: s.outcome, elapsedMs: s.elapsedMs,
      bbbvPerSecond: s.bbbvPerSecond, efficiency: s.efficiency, endedAt: s.endedAt, size: blob.length,
    },
  };
};

function fakeRecords(log, { comparison = comparisonOf(), fail = false } = {}) {
  return {
    record(s) { log.push(['record', s.id]); if (fail) throw new RangeError('broken'); return comparison; },
    available() { return true; },
  };
}
function fakeLibrary(log, { failAdd = false, rejectAdd = false } = {}) {
  return {
    load() { log.push(['load']); return Promise.resolve(); },
    add(blob, listing, setBest) {
      log.push(['add', listing.id, setBest, blob]);
      if (failAdd) throw new Error('add refused');
      return rejectAdd ? Promise.reject(new Error('add rejected')) : Promise.resolve();
    },
  };
}
function fakeRouter() {
  const routes = [];
  return { routes, has: () => true, go: (n, o) => routes.push([n, o?.data]) };
}
function fakePauser() {
  const hooks = {};
  return {
    hooks,
    attach(name, fn) { (hooks[name] ??= new Set()).add(fn); return () => hooks[name].delete(fn); },
    fire(name, ...args) { for (const fn of hooks[name] ?? []) fn(...args); },
  };
}
const flowOver = (log, { records = {}, library = {} } = {}) => {
  const router = fakeRouter();
  const flow = createResultsFlow({
    records: fakeRecords(log, records), replays: fakeLibrary(log, library), router, restart() {}, goMenu() {},
  });
  return { flow, router };
};

// ---------------------------------------------------------------- order and pinning

test('a finished game is recorded first, then its replay is added with its listing fields', async () => {
  const log = [];
  const { flow, router } = flowOver(log);
  const pauser = fakePauser();
  flow.attach(pauser);
  const s = summary();
  const r = sealed(s);
  pauser.fire('finished', s, 'classic-2d', r);
  await tick();
  assert.deepEqual(log.map((e) => e[0]), ['record', 'load', 'add']);
  assert.deepEqual(log[2], ['add', 'g1', false, r.blob]);
  assert.equal(router.routes.length, 1, 'the results screen still shows');
  assert.equal(router.routes[0][1].summary, s);
});

test('an abandoned game is recorded first, then its replay is added; no results screen shows', async () => {
  const log = [];
  const { flow, router } = flowOver(log);
  const pauser = fakePauser();
  flow.attach(pauser);
  const s = summary({ id: 'g2', outcome: 'abandoned' });
  pauser.fire('abandoned', s, 'classic-2d', sealed(s));
  await tick();
  assert.deepEqual(log.map((e) => e.slice(0, 3)), [['record', 'g2'], ['load'], ['add', 'g2', false]]);
  assert.deepEqual(router.routes, []);
});

test('the replay is pinned as a best when the comparison shows any of the board\'s three bests was set', async () => {
  for (const [set, expected] of [
    [{}, false], [{ time: true }, true], [{ rate: true }, true], [{ efficiency: true }, true],
    [{ time: true, rate: true, efficiency: true }, true],
  ]) {
    const log = [];
    const { flow } = flowOver(log, { records: { comparison: comparisonOf(set) } });
    flow.finished(summary(), 'classic-2d', sealed());
    await tick();
    assert.equal(log.find((e) => e[0] === 'add')[2], expected, JSON.stringify(set));
  }
});

test('a recording that throws still adds the replay, unpinned', async () => {
  const log = [];
  const { flow, router } = flowOver(log, { records: { fail: true } });
  const data = flow.finished(summary(), 'classic-2d', sealed());
  await tick();
  assert.deepEqual(log.map((e) => e.slice(0, 3)), [['record', 'g1'], ['load'], ['add', 'g1', false]]);
  assert.deepEqual([data.comparison, data.saved], [null, false]);
  assert.equal(router.routes.length, 1);
});

test('attach hooks both hand-offs and its detach removes both', () => {
  const { flow } = flowOver([]);
  const pauser = fakePauser();
  const detach = flow.attach(pauser);
  assert.equal(pauser.hooks.finished.size, 1);
  assert.equal(pauser.hooks.abandoned.size, 1);
  detach();
  assert.equal(pauser.hooks.finished.size, 0);
  assert.equal(pauser.hooks.abandoned.size, 0);
});

// ---------------------------------------------------------------- what adds nothing

test('a dropped replay adds nothing and leaves the summary and the records as they are', async () => {
  const log = [];
  const { flow, router } = flowOver(log);
  const s = summary();
  const data = flow.finished(s, 'classic-2d', null);
  flow.abandoned(summary({ id: 'g2', outcome: 'abandoned' }), 'classic-2d', null);
  await tick();
  assert.deepEqual(log, [['record', 'g1'], ['record', 'g2']]);
  assert.deepEqual(router.routes, [['results', { summary: s, mode: 'classic-2d', comparison: comparisonOf(), saved: true, notSaved: false }]]);
  assert.equal(data.summary, s);
});

test('a summary that is not a record (a fixed 3D board\'s null) adds nothing', async () => {
  const log = [];
  const { flow, router } = flowOver(log);
  assert.equal(flow.finished(null, '3d', sealed()), null);
  flow.abandoned(null, '3d', sealed());
  await tick();
  assert.deepEqual(log, []);
  assert.deepEqual(router.routes, []);
});

test('a library that throws or rejects does not affect the summary, the records or the screen', async () => {
  for (const library of [{ failAdd: true }, { rejectAdd: true }]) {
    const log = [];
    const { flow, router } = flowOver(log, { library });
    const errors = [];
    const original = console.error;
    console.error = (e) => errors.push(e);
    try {
      const data = flow.finished(summary(), 'classic-2d', sealed());
      assert.equal(data.saved, true);
      flow.abandoned(summary({ id: 'g2', outcome: 'abandoned' }), 'classic-2d', sealed(summary({ id: 'g2' })));
      await tick();
      await tick();
    } finally {
      console.error = original;
    }
    assert.deepEqual(log.filter((e) => e[0] === 'record').map((e) => e[1]), ['g1', 'g2']);
    assert.equal(router.routes.length, 1);
    assert.equal(errors.length, 2, 'each failure is logged');
  }
});

test('a flow with no library records and routes as before', () => {
  const log = [];
  const router = fakeRouter();
  const flow = createResultsFlow({ records: fakeRecords(log), router, restart() {}, goMenu() {} });
  assert.equal(flow.finished(summary(), 'classic-2d', sealed()).saved, true);
  flow.abandoned(summary({ id: 'g2' }), 'classic-2d', sealed());
  assert.deepEqual(log, [['record', 'g1'], ['record', 'g2']]);
});

// ---------------------------------------------------------------- over the real library

async function realLibrary({ storageAvailable = true, failWrites = false } = {}) {
  const storage = createStorage({ backend: createMemoryBackend({ available: storageAvailable }) });
  const blobStore = createBlobStore({
    open: () => createMemoryBlobStore({ failWrites }),
    fallback: () => createMemoryBlobStore(),
  });
  const notices = [];
  const library = createReplayLibrary({ storage, blobStore, onNotSaved: (n) => notices.push(n) });
  return { library, notices };
}

test('over the real library, a best game\'s replay is kept and pinned as a best, even before load() finished', async () => {
  const { library } = await realLibrary();
  const flow = createResultsFlow({
    records: fakeRecords([], { comparison: comparisonOf({ time: true }) }), replays: library,
    router: fakeRouter(), restart() {}, goMenu() {},
  });
  flow.finished(summary(), 'classic-2d', sealed());
  await library.load();
  await tick();
  await library.settled();
  assert.equal(library.available(), true);
  assert.equal(library.has('g1'), true);
  assert.deepEqual(library.forBoard(KEY).map((e) => [e.id, [...e.pins]]), [['g1', [PIN_BEST]]]);
  assert.deepEqual(await library.bytes('g1'), new Uint8Array([7, 8, 9]));
});

test('a session where nothing persists keeps the just-finished replay for the session', async () => {
  const { library } = await realLibrary({ storageAvailable: false });
  await library.load();
  const flow = createResultsFlow({ records: fakeRecords([]), replays: library, router: fakeRouter(), restart() {}, goMenu() {} });
  flow.finished(summary(), 'classic-2d', sealed());
  await tick();
  await library.settled();
  assert.equal(library.available(), false);
  assert.deepEqual(await library.bytes('g1'), new Uint8Array([7, 8, 9]), 'the results screen can play it');
});

test('a replay that could not be saved stays playable for the session', async () => {
  const { library, notices } = await realLibrary({ failWrites: true });
  await library.load();
  const flow = createResultsFlow({ records: fakeRecords([]), replays: library, router: fakeRouter(), restart() {}, goMenu() {} });
  flow.finished(summary(), 'classic-2d', sealed());
  await tick();
  await library.settled();
  assert.equal(library.has('g1'), false, 'nothing was kept');
  assert.equal(notices.length, 1, 'the failure is reported once');
  assert.deepEqual(await library.bytes('g1'), new Uint8Array([7, 8, 9]), 'the results screen can play it');
});

// ---------------------------------------------------------------- wiring

test('the shell creates the replay library over platform storage and the blob store and hands it to the results flow', () => {
  const main = read('js/main.js');
  assert.match(main, /import \{ storage, blobStore \} from '\.\/platform\/index\.js'/);
  assert.match(main, /const REPLAYS = createReplayLibrary\(\{\s*storage,\s*blobStore/);
  assert.match(main, /REPLAYS\.load\(\)/);
  const flowBlock = main.slice(main.indexOf('createResultsFlow({'), main.indexOf('});', main.indexOf('createResultsFlow({')));
  assert.match(flowBlock, /replays: REPLAYS/);
  assert.doesNotMatch(read('js/results/flow.js'), /document|window/, 'the flow stays DOM-free');
});
