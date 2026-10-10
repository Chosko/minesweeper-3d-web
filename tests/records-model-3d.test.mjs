// 3D boards in the personal records (js/records/model.js, js/records/store.js): bests and
// comparison on 3D boards, overall counters per mode with no figure spanning Classic 2D and 3D,
// the boards-played query by mode and its 3D order, the abandoned 3D game, the rebuild of the
// per-mode counters from the history, and the records format step that carries m1 records over.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBoardIdentity, boardKey, MODE_3D, PRESETS_3D } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createRecordsModel, rebuildRecords, emptyRecords, upgradeRecords } from '../js/records/model.js';
import { createRecordsStore, RECORDS_DOC, HISTORY_DOC, RECORDS_VERSION } from '../js/records/store.js';

const square = (width, height, mines, noGuess = false) =>
  createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const box = (width, height, depth, mines, noGuess = false) =>
  createBoardIdentity({ mode: MODE_3D, width, height, depth, mines, noGuess });
const preset = (family, name, noGuess = false) => {
  const p = PRESETS_3D.find((x) => x.family === family && x.name === name);
  return box(p.width, p.height, p.depth, p.mines, noGuess);
};

const BEGINNER_2D = square(9, 9, 10);
const DL_BEGINNER = preset('Double layer', 'Beginner');
const CUBE_EXPERT = preset('Cube', 'Expert');
const CUSTOM_3D_A = box(10, 10, 3, 20);
const CUSTOM_3D_B = box(5, 5, 5, 12, true);

const ZERO = { games: 0, wins: 0, currentStreak: 0, longestStreak: 0 };

let nextId = 1;
let clock = Date.parse('2026-10-01T00:00:00.000Z');

// A summary through the real builder; `clicks` the reveal count (efficiency = 100 × solved / clicks).
function game({ board = DL_BEGINNER, outcome = 'won', ms = 10000, bbbv = 20, clicks = 20, id } = {}) {
  const bbbvSolved = outcome === 'won' ? bbbv : Math.max(0, bbbv - 5);
  const engine = {
    bbbv, bbbvSolved,
    clicks: { reveal: { effective: clicks, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
  };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  clock += 60000;
  return buildSummary({ engine, elapsedMs: ms, board, seed: 7, generatorVersion: 1, endedAt: new Date(clock), id: id ?? `g3-${nextId++}` });
}

const doc = (version, data) => JSON.stringify({ version, data });
const stored = (backend, name) => {
  const text = backend.documents.get(name);
  return text === undefined ? undefined : JSON.parse(text);
};
function open(backend) {
  const store = createRecordsStore({ storage: createStorage({ backend }) });
  return { backend, store };
}

// ---------- bests and comparison ----------

test('3D bests: from won games only, strictly better replaces, a tie keeps the earlier holder', () => {
  const m = createRecordsModel();
  m.record(game({ outcome: 'lost', ms: 1000 }));
  m.record(game({ outcome: 'abandoned', ms: 500 }));
  assert.deepEqual(m.bests(DL_BEGINNER), { time: null, bbbvPerSecond: null, efficiency: null });
  const first = game({ ms: 8000, bbbv: 20, clicks: 25 });
  const c1 = m.record(first);
  assert.deepEqual([c1.time.newBest, c1.time.best, c1.time.value], [true, null, 8000]);
  const tie = game({ ms: 8000, bbbv: 20, clicks: 25 });
  const c2 = m.record(tie);
  assert.equal(c2.time.newBest, false);
  assert.deepEqual(c2.time.best, { id: first.id, value: 8000, endedAt: first.endedAt });
  assert.equal(c2.time.difference, 0);
  assert.equal(m.bests(DL_BEGINNER).time.id, first.id);
  const better = game({ ms: 7000, bbbv: 20, clicks: 20 });
  const c3 = m.record(better);
  assert.equal(c3.time.newBest, true);
  assert.equal(c3.time.best.value, 8000, 'compared against the best that stood before it');
  assert.equal(c3.time.difference, -1000);
  assert.deepEqual(m.bests(DL_BEGINNER).time, { id: better.id, value: 7000, endedAt: better.endedAt });
  assert.equal(m.bests(DL_BEGINNER).efficiency.id, better.id);
});

test('3D bests are per board: a 3D board and its no-guess twin and a 2D board keep their own', () => {
  const m = createRecordsModel();
  const a = game({ board: DL_BEGINNER, ms: 9000 });
  const b = game({ board: preset('Double layer', 'Beginner', true), ms: 5000 });
  const c = game({ board: BEGINNER_2D, ms: 3000 });
  for (const g of [a, b, c]) m.record(g);
  assert.equal(m.bests(DL_BEGINNER).time.id, a.id);
  assert.equal(m.bests(preset('Double layer', 'Beginner', true)).time.id, b.id);
  assert.equal(m.bests(BEGINNER_2D).time.id, c.id);
  assert.equal(m.history(DL_BEGINNER).length, 1);
});

// ---------- mode separation ----------

test('a summary updates its board and its own mode only: a 3D loss never moves a 2D streak', () => {
  const m = createRecordsModel();
  m.record(game({ board: BEGINNER_2D }));
  m.record(game({ board: BEGINNER_2D }));
  m.record(game({ board: DL_BEGINNER, outcome: 'lost' }));
  assert.deepEqual(m.overall('classic-2d'), { games: 2, wins: 2, currentStreak: 2, longestStreak: 2 });
  assert.equal(m.overallWinRate('classic-2d'), 1);
  assert.deepEqual(m.overall(MODE_3D), { games: 1, wins: 0, currentStreak: 0, longestStreak: 0 });
  assert.equal(m.overallWinRate(MODE_3D), 0);
  m.record(game({ board: BEGINNER_2D }));
  assert.deepEqual(m.overall('classic-2d'), { games: 3, wins: 3, currentStreak: 3, longestStreak: 3 });
  assert.deepEqual(m.counters(BEGINNER_2D), { games: 3, wins: 3, currentStreak: 3, longestStreak: 3 });
});

test('a 3D win extends the 3D streaks only; a 2D loss never moves a 3D streak', () => {
  const m = createRecordsModel();
  m.record(game({ board: DL_BEGINNER }));
  m.record(game({ board: CUBE_EXPERT }));
  m.record(game({ board: BEGINNER_2D, outcome: 'lost' }));
  m.record(game({ board: DL_BEGINNER }));
  assert.deepEqual(m.overall(MODE_3D), { games: 3, wins: 3, currentStreak: 3, longestStreak: 3 });
  assert.deepEqual(m.counters(DL_BEGINNER), { games: 2, wins: 2, currentStreak: 2, longestStreak: 2 });
  assert.deepEqual(m.counters(CUBE_EXPERT), { games: 1, wins: 1, currentStreak: 1, longestStreak: 1 });
  assert.deepEqual(m.overall('classic-2d'), { games: 1, wins: 0, currentStreak: 0, longestStreak: 0 });
});

test('a 3D game abandoned after its first reveal is a loss for its board and the 3D mode only', () => {
  const m = createRecordsModel();
  m.record(game({ board: BEGINNER_2D }));
  m.record(game({ board: CUBE_EXPERT }));
  m.record(game({ board: CUBE_EXPERT }));
  const abandoned = game({ board: CUBE_EXPERT, outcome: 'abandoned', ms: 100 });
  const c = m.record(abandoned);
  assert.equal(c.time.newBest, false);
  assert.deepEqual(m.counters(CUBE_EXPERT), { games: 3, wins: 2, currentStreak: 0, longestStreak: 2 });
  assert.deepEqual(m.overall(MODE_3D), { games: 3, wins: 2, currentStreak: 0, longestStreak: 2 });
  assert.deepEqual(m.overall('classic-2d'), { games: 1, wins: 1, currentStreak: 1, longestStreak: 1 });
  assert.equal(m.history(CUBE_EXPERT).at(-1).outcome, 'abandoned');
});

test('every mode has its own overall counters from the start, at zero', () => {
  const m = createRecordsModel();
  assert.deepEqual(m.overall('classic-2d'), ZERO);
  assert.deepEqual(m.overall(MODE_3D), ZERO);
  assert.equal(m.overallWinRate(MODE_3D), null);
  assert.deepEqual(emptyRecords().overall, { 'classic-2d': ZERO, [MODE_3D]: ZERO });
});

// ---------- boards played ----------

test('boards played for 3D: the six presets in menu order, without no-guess first, then custom by last played', () => {
  const m = createRecordsModel();
  const presets = PRESETS_3D.flatMap((p) => [false, true].map((ng) => box(p.width, p.height, p.depth, p.mines, ng)));
  const order = [CUSTOM_3D_A, ...[...presets].reverse(), BEGINNER_2D, CUSTOM_3D_B, CUSTOM_3D_A];
  for (const board of order) m.record(game({ board }));
  const keys = m.boardsPlayed(MODE_3D).map((b) => b.key);
  assert.deepEqual(keys, [...presets.map(boardKey), boardKey(CUSTOM_3D_A), boardKey(CUSTOM_3D_B)]);
  assert.deepEqual(PRESETS_3D.map((p) => `${p.family} ${p.name}`), [
    'Double layer Beginner', 'Double layer Intermediate', 'Double layer Expert',
    'Cube Beginner', 'Cube Intermediate', 'Cube Expert',
  ]);
  assert.deepEqual(m.boardsPlayed(MODE_3D).at(-1).board, { ...CUSTOM_3D_B });
});

test('boards played takes a mode and never lists another mode\'s boards; Classic 2D is the default', () => {
  const m = createRecordsModel();
  for (const board of [DL_BEGINNER, BEGINNER_2D, CUSTOM_3D_A]) m.record(game({ board }));
  assert.deepEqual(m.boardsPlayed('classic-2d').map((b) => b.key), [boardKey(BEGINNER_2D)]);
  assert.deepEqual(m.boardsPlayed().map((b) => b.key), [boardKey(BEGINNER_2D)]);
  assert.deepEqual(m.boardsPlayed(MODE_3D).map((b) => b.key), [boardKey(DL_BEGINNER), boardKey(CUSTOM_3D_A)]);
});

// ---------- rebuild ----------

test('rebuilding from the history rebuilds the per-mode counters', () => {
  const m = createRecordsModel();
  const games = [
    game({ board: BEGINNER_2D }), game({ board: DL_BEGINNER }), game({ board: DL_BEGINNER, outcome: 'abandoned' }),
    game({ board: BEGINNER_2D, outcome: 'lost' }), game({ board: CUBE_EXPERT }), game({ board: CUSTOM_3D_A }),
  ];
  for (const g of games) m.record(g);
  const { records, history } = m.documents();
  assert.deepEqual(rebuildRecords(history), records);
  const rebuilt = createRecordsModel({ history });
  assert.deepEqual(rebuilt.overall(MODE_3D), { games: 4, wins: 3, currentStreak: 2, longestStreak: 2 });
  assert.deepEqual(rebuilt.overall('classic-2d'), { games: 2, wins: 1, currentStreak: 0, longestStreak: 1 });
});

// ---------- the records format step ----------

// An m1 records document: Classic 2D boards and the Classic 2D overall counters only.
function m1Documents() {
  const m = createRecordsModel();
  for (const g of [game({ board: BEGINNER_2D, ms: 9000 }), game({ board: BEGINNER_2D, outcome: 'lost' }), game({ board: square(20, 12, 50) })]) m.record(g);
  const { records, history } = m.documents();
  return { records: { boards: records.boards, overall: { 'classic-2d': records.overall['classic-2d'] } }, history };
}

test('the records format steps up once from m1', () => {
  assert.equal(RECORDS_VERSION, 2);
});

test('the upgrade carries every m1 board and the Classic 2D counters over and starts 3D at zero', () => {
  const { records } = m1Documents();
  const before = structuredClone(records);
  const up = upgradeRecords(records);
  assert.deepEqual(records, before, 'the input is not changed');
  assert.deepEqual(up.boards, before.boards);
  assert.deepEqual(up.overall, { 'classic-2d': before.overall['classic-2d'], [MODE_3D]: ZERO });
});

test('the upgrade keeps 3D counters a records document already carries', () => {
  const m = createRecordsModel();
  m.record(game({ board: BEGINNER_2D }));
  m.record(game({ board: DL_BEGINNER }));
  const { records } = m.documents();
  assert.deepEqual(upgradeRecords(records), records);
});

test('the upgrade of an empty m1 document gives empty records', () => {
  assert.deepEqual(upgradeRecords({ boards: {}, overall: {} }), emptyRecords());
});

test('loading an m1 records document carries it over and saves it back at the new version', async () => {
  const { records, history } = m1Documents();
  const backend = createMemoryBackend({ initial: { [RECORDS_DOC]: doc(1, records), [HISTORY_DOC]: doc(1, history) } });
  const { store } = open(backend);
  await store.load();
  assert.equal(store.available(), true);
  assert.deepEqual(store.overall('classic-2d'), records.overall['classic-2d']);
  assert.deepEqual(store.overall(MODE_3D), ZERO);
  assert.deepEqual(store.counters(BEGINNER_2D), records.boards[boardKey(BEGINNER_2D)].counters);
  assert.deepEqual(store.bests(BEGINNER_2D), records.boards[boardKey(BEGINNER_2D)].bests);
  assert.deepEqual(store.boardsPlayed('classic-2d').map((b) => b.key).sort(), Object.keys(records.boards).sort());
  await store.settled();
  assert.deepEqual(stored(backend, RECORDS_DOC), { version: RECORDS_VERSION, data: upgradeRecords(records) });
  assert.deepEqual(stored(backend, HISTORY_DOC), { version: 1, data: history });
  store.record(game({ board: DL_BEGINNER }));
  assert.deepEqual(store.overall(MODE_3D), { games: 1, wins: 1, currentStreak: 1, longestStreak: 1 });
  assert.deepEqual(store.overall('classic-2d'), records.overall['classic-2d']);
});

test('a records document newer than this build is refused and left untouched', async () => {
  const { records, history } = m1Documents();
  const initial = { [RECORDS_DOC]: doc(RECORDS_VERSION + 1, upgradeRecords(records)), [HISTORY_DOC]: doc(1, history) };
  const backend = createMemoryBackend({ initial: { ...initial } });
  const { store } = open(backend);
  await store.load();
  assert.equal(store.available(), false);
  assert.deepEqual(store.boardsPlayed(), []);
  store.record(game({ board: DL_BEGINNER }));
  await store.settled();
  assert.deepEqual(Object.fromEntries(backend.documents), initial);
});

test('an m1 build meeting the stepped-up records document refuses it and never overwrites it', async () => {
  const m = createRecordsModel();
  m.record(game({ board: DL_BEGINNER }));
  const text = doc(RECORDS_VERSION, m.documents().records);
  const backend = createMemoryBackend({ initial: { [RECORDS_DOC]: text } });
  const issues = [];
  const older = createStorage({ backend });
  older.register(RECORDS_DOC, 1, {}, { onIssue: (i) => issues.push(i.kind) });
  assert.equal(await older.load(RECORDS_DOC), undefined);
  assert.deepEqual(await older.save(RECORDS_DOC, emptyRecords()), { ok: false, reason: 'newer-version' });
  assert.ok(issues.includes('newer-version'));
  assert.equal(backend.documents.get(RECORDS_DOC), text);
});
