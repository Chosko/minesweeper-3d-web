// The replay format (js/replay/format.js): the versioned binary blob — header, delta-encoded
// action and movement streams, check values — its encoder, and the decoder replay-playback
// shares: exact round-trips for 2D and 3D replays, an empty and a capped movement stream, the
// per-version upgrade path, a newer version refused with its own error and a corrupt blob
// reported as unreadable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLAY_FORMAT_VERSION, ACTION_KINDS, MOVEMENT_TYPES, SAMPLE_ARITY,
  encodeReplay, decodeReplay, createReplayDecoder, cellStateDigest,
  ReplayNewerVersionError, ReplayUnreadableError,
} from '../js/replay/format.js';
import { createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { REFERENCE_PROFILE, PROFILE_3D } from '../js/engine/profiles.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';

const clicks = (r, f, c) => ({
  reveal: { effective: r, wasted: 0 }, flag: { effective: f, wasted: 1 }, chord: { effective: c, wasted: 2 },
});

const replay2D = (extra = {}) => ({
  header: {
    id: '6f1c2a40-1e2b-4c3d-8e9f-0a1b2c3d4e5f',
    mode: 'classic-2d',
    graph: { kind: 'square', width: 9, height: 9 },
    board: createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false }),
    mines: [3, 7, 12, 20, 33, 41, 55, 60, 72, 80],
    profile: { id: REFERENCE_PROFILE, version: 1 },
    seed: 4294967295,
    generatorVersion: 1,
    endedAt: '2026-10-10T12:34:56.789Z',
    movementEndedAt: null,
  },
  actions: [
    { time: 0, kind: 'reveal', cell: 40 },
    { time: 812, kind: 'flag', cell: 33 },
    { time: 812, kind: 'flag', cell: 33 },
    { time: 1500, kind: 'chord', cell: 32 },
    { time: 2210, kind: 'reveal', cell: 0 },
  ],
  movement: [
    { time: 0, type: 'sample', values: [160, 160] },
    { time: 50, type: 'sample', values: [158, 171] },
    { time: 100, type: 'sample', values: [-12, 300] },
    { time: 400, type: 'cursor', cell: 40 },
    { time: 450, type: 'cursor', cell: 31 },
    { time: 500, type: 'sample', values: [0, 0] },
  ],
  check: { outcome: 'won', elapsedMs: 2210, bbbv: 12, bbbvSolved: 12, clicks: clicks(3, 1, 1), digest: 0xdeadbeef },
  ...extra,
});

const replay3D = (extra = {}) => ({
  header: {
    id: 'g3-1',
    mode: MODE_3D,
    graph: { kind: 'box', x: 12, y: 12, z: 8 },
    board: createBoardIdentity({ mode: MODE_3D, width: 12, height: 12, depth: 8, mines: 3, noGuess: true }),
    mines: [1151, 0, 500],
    profile: { id: PROFILE_3D, version: 1 },
    seed: 0,
    generatorVersion: 2,
    endedAt: '2026-01-01T00:00:00.000Z',
    movementEndedAt: null,
  },
  actions: [
    { time: 0, kind: 'flag', cell: 0 },
    { time: 0, kind: 'reveal', cell: 600 },
    { time: 3000, kind: 'flag', cell: 601 },
  ],
  movement: [
    { time: 0, type: 'view', mode: 0 },
    { time: 0, type: 'sample', values: [60, 60, -40, 3600, -300] },
    { time: 100, type: 'sample', values: [61, 59, -38, 3590, -310] },
    { time: 200, type: 'view', mode: 5 },
    { time: 300, type: 'sample', values: [61, 59, -38, 0, 900] },
  ],
  check: { outcome: 'lost', elapsedMs: 3000, bbbv: 40, bbbvSolved: 7, clicks: clicks(1, 2, 0), digest: 0 },
  ...extra,
});

// ---------- round-trips ----------

test('a 2D replay round-trips exactly, mines given in any order come back ascending', () => {
  const r = replay2D();
  const bytes = encodeReplay(r);
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(decodeReplay(bytes), r);
});

test('a 3D replay round-trips exactly with its box graph, view-mode events and samples', () => {
  const r = replay3D();
  const back = decodeReplay(encodeReplay(r));
  assert.deepEqual(back, { ...r, header: { ...r.header, mines: [0, 500, 1151] } });
  assert.equal(back.header.graph.kind, 'box');
  assert.deepEqual(back.header.board, r.header.board);
});

test('an empty movement stream round-trips', () => {
  const r = replay2D({ movement: [] });
  assert.deepEqual(decodeReplay(encodeReplay(r)), r);
});

test('a game abandoned after its first reveal round-trips', () => {
  const r = replay2D({
    actions: [{ time: 0, kind: 'reveal', cell: 40 }],
    movement: [],
    check: { outcome: 'abandoned', elapsedMs: 0, bbbv: 12, bbbvSolved: 1, clicks: clicks(1, 0, 0), digest: 1 },
  });
  assert.deepEqual(decodeReplay(encodeReplay(r)), r);
});

test('a capped movement stream records where movement ended, actions continue after it', () => {
  const r = replay3D({
    header: { ...replay3D().header, mines: [0, 500, 1151], movementEndedAt: 300 },
    actions: [...replay3D().actions, { time: 90000, kind: 'reveal', cell: 2 }],
  });
  const back = decodeReplay(encodeReplay(r));
  assert.equal(back.header.movementEndedAt, 300);
  assert.deepEqual(back, r);
});

test('large times and long streams are delta-encoded compactly and round-trip', () => {
  const movement = [];
  for (let i = 0; i < 2000; i++) movement.push({ time: i * 100, type: 'sample', values: [100 + (i % 7), 50 - (i % 3), 0, i, 0 - i] });
  const r = replay3D({
    header: { ...replay3D().header, mines: [0, 500, 1151] },
    movement,
    check: { ...replay3D().check, elapsedMs: 3 * 3600 * 1000 },
  });
  const bytes = encodeReplay(r);
  assert.deepEqual(decodeReplay(bytes), r);
  assert.ok(bytes.length < movement.length * 12, `${bytes.length} bytes for ${movement.length} samples`);
});

test('the vocabularies: action kinds, movement types and the sample arity per graph kind', () => {
  assert.deepEqual(ACTION_KINDS, ['reveal', 'flag', 'chord']);
  assert.deepEqual(MOVEMENT_TYPES, ['sample', 'cursor', 'view']);
  assert.deepEqual(SAMPLE_ARITY, { square: 2, box: 5 });
  assert.equal(REPLAY_FORMAT_VERSION, 1);
});

// ---------- the encoder refuses what it cannot write ----------

test('the encoder refuses a malformed replay with a RangeError', () => {
  const bad = [
    (r) => { r.actions = [{ time: 10, kind: 'reveal', cell: 1 }, { time: 5, kind: 'reveal', cell: 2 }]; },
    (r) => { r.actions = [{ time: 0, kind: 'peek', cell: 1 }]; },
    (r) => { r.actions = [{ time: 0, kind: 'reveal', cell: 81 }]; },
    (r) => { r.movement = [{ time: 0, type: 'sample', values: [1, 2, 3] }]; },
    (r) => { r.movement = [{ time: 0, type: 'view', mode: 1 }]; },
    (r) => { r.movement = [{ time: 0, type: 'sample', values: [1.5, 2] }]; },
    (r) => { r.header.mines = [3, 3, 12, 20, 33, 41, 55, 60, 72, 80]; },
    (r) => { r.header.mines = [3, 7]; },
    (r) => { r.header.graph = { kind: 'square', width: 9, height: 8 }; },
    (r) => { r.header.graph = { kind: 'box', x: 9, y: 9, z: 1 }; },
    (r) => { r.header.mode = '3d'; },
    (r) => { r.header.endedAt = 'not a date'; },
    (r) => { r.header.endedAt = '1969-12-31T23:59:59.000Z'; },
    (r) => { r.header.seed = -1; },
    (r) => { r.check.outcome = 'draw'; },
    (r) => { r.check.digest = 2 ** 32; },
    (r) => { r.header.movementEndedAt = -1; },
  ];
  for (const mutate of bad) {
    const r = structuredClone(replay2D());
    mutate(r);
    assert.throws(() => encodeReplay(r), RangeError, mutate.toString());
  }
});

test('the 2D cursor event belongs to the square graph, the view-mode event to the box', () => {
  const r = replay3D({ movement: [{ time: 0, type: 'cursor', cell: 1 }] });
  assert.throws(() => encodeReplay(r), RangeError);
});

// ---------- versions ----------

test('a newer format version is refused with its own error, not as unreadable', () => {
  const bytes = encodeReplay(replay2D());
  const newer = createReplayDecoder({ current: 0, decoders: {}, upgrades: {} });
  assert.throws(() => newer(bytes), (e) => e instanceof ReplayNewerVersionError
    && !(e instanceof ReplayUnreadableError) && e.storedVersion === 1 && e.currentVersion === 0);
});

test('a blob stamped with a version above the current one is refused as newer by decodeReplay', () => {
  const bytes = encodeReplay(replay2D(), { version: REPLAY_FORMAT_VERSION + 1 });
  assert.throws(() => decodeReplay(bytes), (e) => e instanceof ReplayNewerVersionError
    && e.storedVersion === REPLAY_FORMAT_VERSION + 1 && e.currentVersion === REPLAY_FORMAT_VERSION);
});

test('an older version is decoded by its own decoder then upgraded step by step', () => {
  const bytes = encodeReplay(replay2D(), { version: 1 });
  const steps = [];
  const decode = createReplayDecoder({
    current: 3,
    decoders: { 1: () => ({ v: 1 }) },
    upgrades: {
      1: (r) => { steps.push(1); return { ...r, v: 2 }; },
      2: (r) => { steps.push(2); return { ...r, v: 3 }; },
    },
  });
  const out = decode(bytes);
  assert.equal(out.v, 3);
  assert.deepEqual(steps, [1, 2]);
});

test('an upgrade step that throws makes the blob unreadable', () => {
  const bytes = encodeReplay(replay2D(), { version: 1 });
  const decode = createReplayDecoder({
    current: 2,
    decoders: { 1: () => ({ v: 1 }) },
    upgrades: { 1: () => { throw new TypeError('bad step'); } },
  });
  assert.throws(() => decode(bytes), ReplayUnreadableError);
});

test('a known version with no decoder is unreadable', () => {
  const bytes = encodeReplay(replay2D());
  const decode = createReplayDecoder({ current: 2, decoders: {}, upgrades: {} });
  assert.throws(() => decode(bytes), ReplayUnreadableError);
});

// ---------- corrupt blobs ----------

test('a corrupt blob is reported as unreadable', () => {
  const good = encodeReplay(replay2D());
  const cases = [
    new Uint8Array(0),
    good.subarray(0, 3),
    good.subarray(0, good.length - 1),
    good.subarray(0, 20),
    Uint8Array.from(good, (b, i) => (i === good.length >> 1 ? b ^ 0xff : b)),
    Uint8Array.from(good, (b, i) => (i === 0 ? 0 : b)),
    Uint8Array.from(good, (b, i) => (i === 4 ? REPLAY_FORMAT_VERSION + 1 : b)),
    new Uint8Array([...good, 0]),
    'not bytes',
    null,
  ];
  for (const bytes of cases) {
    assert.throws(() => decodeReplay(bytes), ReplayUnreadableError);
  }
});

test('decodeReplay accepts an ArrayBuffer as well as a Uint8Array', () => {
  const bytes = encodeReplay(replay3D({ header: { ...replay3D().header, mines: [0, 500, 1151] } }));
  const copy = bytes.slice().buffer;
  assert.deepEqual(decodeReplay(copy), decodeReplay(bytes));
});

// ---------- the final-state digest ----------

test('cellStateDigest hashes the revealed, flagged and hidden state of every cell', () => {
  const g = createGameWithMines({ graph: createSquareGrid(3, 3).graph, profile: REFERENCE_PROFILE, version: 1, mines: [8] });
  const before = cellStateDigest(g.state);
  assert.ok(Number.isInteger(before) && before >= 0 && before < 2 ** 32);
  g.toggleFlag(8);
  const flagged = cellStateDigest(g.state);
  assert.notEqual(flagged, before);
  g.reveal(0);
  const after = cellStateDigest(g.state);
  assert.notEqual(after, flagged);
  assert.equal(cellStateDigest(g.state), after);
  const hidden = new Uint8Array(9);
  hidden[0] = 1;
  assert.notEqual(cellStateDigest({ ...g.state, hidden }), after);
  assert.equal(cellStateDigest({ revealed: g.state.revealed, flagged: g.state.flagged }), after);
});
