// The replay format (js/replay/format.js): the versioned binary blob — header, delta-encoded
// action and movement streams, check values — its encoder, and the decoder replay-playback
// shares: exact round-trips for 2D square, hexagon, triangle and 3D replays, an empty and a capped
// movement stream, the movement sampling interval the decoder gives each replay by mode and format
// version, the per-version upgrade path, a newer version or an unknown graph kind refused with the
// newer version's error and a corrupt blob reported as unreadable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLAY_FORMAT_VERSION, ACTION_KINDS, MOVEMENT_TYPES, SAMPLE_ARITY,
  encodeReplay, decodeReplay, createReplayDecoder, cellStateDigest, sampleIntervalMs,
  ReplayNewerVersionError, ReplayUnreadableError,
} from '../js/replay/format.js';
import { SAMPLE_INTERVAL_MS as INTERVAL_2D } from '../js/replay/sampler-2d.js';
import { SAMPLE_INTERVAL_MS as INTERVAL_3D } from '../js/replay/sampler-3d.js';
import { createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { REFERENCE_PROFILE, PROFILE_3D } from '../js/engine/profiles.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createHexGrid } from '../js/engine/hex-grid.js';
import { createTriGrid } from '../js/engine/tri-grid.js';
import { createGeometry } from '../js/geometry/index.js';
import { readFileSync } from 'node:fs';

const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const fixture = (name) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));
const FIXTURE_NAMES = JSON.parse(readFileSync(new URL('index.json', FIXTURES), 'utf8')).map((f) => f.file);

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
    pauses: [],
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
    pauses: [],
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

// A Hexagon or Triangle replay: its graph kind is the board's grid, its samples and cursor 2D.
const replayFlat = (mode, grid, width, height, mines, extra = {}) => replay2D({
  header: {
    ...replay2D().header,
    id: `${grid}-1`,
    mode,
    graph: { kind: grid, width, height },
    board: createBoardIdentity({ mode, grid, width, height, mines: mines.length, noGuess: false }),
    mines,
    pauses: [{ start: 900, end: 1400 }],
  },
  ...extra,
});
const replayHex = (extra) => replayFlat('hexagon', 'hex', 9, 9, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], extra);
const replayTri = (extra) => replayFlat('triangle', 'tri', 13, 7, [0, 1, 2, 3, 4, 5, 6, 7], extra);

// The blob with its graph kind byte (after the envelope, an empty pause list, the id and the mode)
// set to `kind`, its checksum made good again.
function withGraphKind(bytes, replay, kind) {
  const out = bytes.slice(0, bytes.length - 4);
  const at = 4 + 1 + 1 + 1 + replay.header.id.length + 1 + replay.header.mode.length;
  out[at] = kind;
  let c = 0xffffffff;
  for (const b of out) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  const blob = new Uint8Array(out.length + 4);
  blob.set(out);
  new DataView(blob.buffer).setUint32(out.length, (c ^ 0xffffffff) >>> 0, true);
  return blob;
}

// ---------- round-trips ----------

test('a 2D replay round-trips exactly, mines given in any order come back ascending', () => {
  const r = replay2D();
  const bytes = encodeReplay(r);
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual(decodeReplay(bytes), { ...r, sampleIntervalMs: 50 });
});

test('a 3D replay round-trips exactly with its box graph, view-mode events and samples', () => {
  const r = replay3D();
  const back = decodeReplay(encodeReplay(r));
  assert.deepEqual(back, { ...r, header: { ...r.header, mines: [0, 500, 1151] }, sampleIntervalMs: 100 });
  assert.equal(back.header.graph.kind, 'box');
  assert.deepEqual(back.header.board, r.header.board);
});

test('an empty movement stream round-trips', () => {
  const r = replay2D({ movement: [] });
  assert.deepEqual(decodeReplay(encodeReplay(r)), { ...r, sampleIntervalMs: 50 });
});

test('a game abandoned after its first reveal round-trips', () => {
  const r = replay2D({
    actions: [{ time: 0, kind: 'reveal', cell: 40 }],
    movement: [],
    check: { outcome: 'abandoned', elapsedMs: 0, bbbv: 12, bbbvSolved: 1, clicks: clicks(1, 0, 0), digest: 1 },
  });
  assert.deepEqual(decodeReplay(encodeReplay(r)), { ...r, sampleIntervalMs: 50 });
});

test('a capped movement stream records where movement ended, actions continue after it', () => {
  const r = replay3D({
    header: { ...replay3D().header, mines: [0, 500, 1151], movementEndedAt: 300 },
    actions: [...replay3D().actions, { time: 90000, kind: 'reveal', cell: 2 }],
  });
  const back = decodeReplay(encodeReplay(r));
  assert.equal(back.header.movementEndedAt, 300);
  assert.deepEqual(back, { ...r, sampleIntervalMs: 100 });
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
  assert.deepEqual(decodeReplay(bytes), { ...r, sampleIntervalMs: 100 });
  assert.ok(bytes.length < movement.length * 12, `${bytes.length} bytes for ${movement.length} samples`);
});

test('the vocabularies: action kinds, movement types and the sample arity per graph kind', () => {
  assert.deepEqual(ACTION_KINDS, ['reveal', 'flag', 'chord']);
  assert.deepEqual(MOVEMENT_TYPES, ['sample', 'cursor', 'view']);
  assert.deepEqual(SAMPLE_ARITY, { square: 2, box: 5, hex: 2, tri: 2 });
  assert.equal(REPLAY_FORMAT_VERSION, 3);
});

// ---------- the hex and tri graph kinds ----------

test('a Hexagon and a Triangle replay round-trip exactly, with 2D samples, cursor events and pauses', () => {
  for (const r of [replayHex(), replayTri()]) {
    const bytes = encodeReplay(r);
    assert.equal(bytes[4], REPLAY_FORMAT_VERSION, 'written at the current version');
    const back = decodeReplay(bytes);
    assert.deepEqual(back, { ...r, sampleIntervalMs: 50 }, r.header.graph.kind);
    assert.equal(back.sampleIntervalMs, sampleIntervalMs(REPLAY_FORMAT_VERSION, 'classic-2d'), 'Classic 2D\'s sampling interval');
    assert.deepEqual(encodeReplay(back), bytes, 're-encodes to the same bytes');
  }
});

test('the header\'s graph description rebuilds the graph and the geometry of the board it was played on', () => {
  const builders = { hex: createHexGrid, tri: createTriGrid };
  for (const r of [replayHex(), replayTri()]) {
    const { graph, board } = decodeReplay(encodeReplay(r)).header;
    assert.deepEqual(Object.keys(graph), ['kind', 'width', 'height']);
    assert.equal(graph.kind, board.grid);
    const grid = builders[graph.kind](graph.width, graph.height);
    assert.equal(grid.graph.count, board.width * board.height);
    const geometry = createGeometry(graph.kind, graph.width, graph.height);
    assert.deepEqual([geometry.kind, geometry.width, geometry.height, geometry.count], [graph.kind, board.width, board.height, grid.graph.count]);
  }
});

test('a hex or tri graph must be the board\'s grid and size; anything else is refused', () => {
  const bad = [
    (r) => { r.header.graph = { kind: 'hex', width: 9, height: 8 }; },
    (r) => { r.header.graph = { kind: 'tri', width: 9, height: 9 }; },
    (r) => { r.header.graph = { kind: 'square', width: 9, height: 9 }; },
    (r) => { r.header.graph = { kind: 'box', x: 9, y: 9, z: 1 }; },
    (r) => { r.movement = [{ time: 0, type: 'view', mode: 1 }]; },
    (r) => { r.movement = [{ time: 0, type: 'sample', values: [1, 2, 3, 4, 5] }]; },
  ];
  for (const mutate of bad) {
    const r = structuredClone(replayHex());
    mutate(r);
    assert.throws(() => encodeReplay(r), RangeError, mutate.toString());
  }
  const square = structuredClone(replay2D());
  square.header.graph = { kind: 'hex', width: 9, height: 9 };
  assert.throws(() => encodeReplay(square), RangeError, 'a hex graph on a square-grid board');
});

test('version 2 cannot hold a hex or tri graph: its writer refuses one', () => {
  for (const r of [replayHex(), replayTri()]) {
    assert.throws(() => encodeReplay(r, { version: 2 }), RangeError, r.header.graph.kind);
    assert.throws(() => encodeReplay(r, { version: 1 }), RangeError, r.header.graph.kind);
  }
});

test('a graph kind this build does not know is refused as from a newer version, not as unreadable', () => {
  const r = replayHex({ header: { ...replayHex().header, pauses: [] } });
  const bytes = encodeReplay(r);
  assert.deepEqual(decodeReplay(withGraphKind(bytes, r, 2)).header.graph.kind, 'hex', 'the patch lands on the kind byte');
  assert.throws(() => decodeReplay(withGraphKind(bytes, r, 9)), (e) => e instanceof ReplayNewerVersionError
    && !(e instanceof ReplayUnreadableError) && e.currentVersion === REPLAY_FORMAT_VERSION);
});

test('a version 2 replay decodes by its own decoder and upgrades unchanged; its graph kinds are square and box', () => {
  for (const r of [replay2D({ header: { ...replay2D().header, pauses: [{ start: 10, end: 20 }] } }), replay3D()]) {
    const bytes = encodeReplay(r, { version: 2 });
    assert.equal(bytes[4], 2, 'stamped version 2');
    const back = decodeReplay(bytes);
    assert.deepEqual(back.header.graph, r.header.graph);
    assert.deepEqual(back.header.pauses, r.header.pauses);
    assert.deepEqual(back.actions, r.actions);
    assert.equal(back.sampleIntervalMs, sampleIntervalMs(2, r.header.mode));
  }
  const r = replay2D();
  assert.throws(() => decodeReplay(withGraphKind(encodeReplay(r, { version: 2 }), r, 2)), ReplayUnreadableError,
    'version 2 had no third graph kind');
});

// ---------- the pause spans ----------

test('the header\'s pause spans round-trip, and an action after a pause carries the paused span in its time', () => {
  const r = replay2D();
  r.header.pauses = [{ start: 900, end: 1400 }, { start: 1500, end: 1500 }, { start: 2000, end: 2210 }];
  const back = decodeReplay(encodeReplay(r));
  assert.deepEqual(back, { ...r, sampleIntervalMs: 50 });
  assert.deepEqual(back.header.pauses, r.header.pauses);
  const r3 = replay3D({ header: { ...replay3D().header, mines: [0, 500, 1151], pauses: [{ start: 0, end: 3000 }] } });
  assert.deepEqual(decodeReplay(encodeReplay(r3)), { ...r3, sampleIntervalMs: 100 });
});

test('the pause spans are ascending, non-overlapping game-clock times within the elapsed time; anything else is refused', () => {
  const bad = [
    [{ start: -1, end: 5 }], [{ start: 5, end: 4 }], [{ start: 0, end: 2211 }], [{ start: 1.5, end: 2 }],
    [{ start: 100, end: 300 }, { start: 200, end: 400 }], [{ start: 500, end: 600 }, { start: 100, end: 200 }],
    [null], 'none', 7,
  ];
  for (const pauses of bad) {
    const r = structuredClone(replay2D());
    r.header.pauses = pauses;
    assert.throws(() => encodeReplay(r), RangeError, JSON.stringify(pauses));
  }
});

test('a version 1 replay decodes by its own decoder and upgrades to no pauses, at version 1\'s sampling intervals', () => {
  const { pauses, ...v1Header } = replay2D().header;
  const v1 = { ...replay2D(), header: v1Header };
  const bytes = encodeReplay(v1, { version: 1 });
  assert.equal(bytes[4], 1, 'stamped version 1');
  assert.deepEqual(decodeReplay(bytes), { ...v1, header: { ...v1Header, pauses: [] }, sampleIntervalMs: 50 });
  const { pauses: p3, ...h3 } = replay3D().header;
  const back3 = decodeReplay(encodeReplay({ ...replay3D(), header: h3 }, { version: 1 }));
  assert.deepEqual(back3.header.pauses, []);
  assert.equal(back3.sampleIntervalMs, 100);
  assert.deepEqual(pauses, []);
  assert.deepEqual(p3, []);
});

test('every version 1 fixture decodes with no pauses; the fixtures stay version 1 files', () => {
  assert.ok(FIXTURE_NAMES.length >= 6, 'the fixtures are listed');
  for (const name of FIXTURE_NAMES) {
    const bytes = fixture(name);
    assert.equal(bytes[4], 1, `${name} is a version 1 file`);
    const r = decodeReplay(bytes);
    assert.deepEqual(r.header.pauses, [], name);
    assert.equal(r.sampleIntervalMs, sampleIntervalMs(1, r.header.mode), name);
  }
});

// ---------- the movement sampling interval ----------

test('the decoder gives each replay its movement sampling interval: 2D 50 ms, 3D 100 ms under versions 1 to 3', () => {
  assert.equal(decodeReplay(encodeReplay(replay2D())).sampleIntervalMs, 50);
  assert.equal(decodeReplay(encodeReplay(replay3D())).sampleIntervalMs, 100);
  for (const v of [1, 2, 3]) {
    assert.equal(sampleIntervalMs(v, 'classic-2d'), 50);
    assert.equal(sampleIntervalMs(v, MODE_3D), 100);
  }
  for (const mode of ['hexagon', 'triangle']) assert.equal(sampleIntervalMs(3, mode), 50, mode);
  assert.equal(sampleIntervalMs(REPLAY_FORMAT_VERSION + 1, MODE_3D), undefined, 'no interval for an unknown version');
});

test('the current version\'s intervals are the samplers\' recording constants', () => {
  assert.equal(sampleIntervalMs(REPLAY_FORMAT_VERSION, 'classic-2d'), INTERVAL_2D);
  assert.equal(sampleIntervalMs(REPLAY_FORMAT_VERSION, MODE_3D), INTERVAL_3D);
});

test('the interval is not stored: a decoded replay re-encodes to the same bytes', () => {
  const bytes = encodeReplay(replay3D());
  assert.deepEqual(encodeReplay(decodeReplay(bytes)), bytes);
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

test('a cursor event carries -1 while the 2D ring is hidden, with no new movement type or format version', () => {
  const movement = [
    { time: 0, type: 'cursor', cell: -1 },
    { time: 100, type: 'cursor', cell: 40 },
    { time: 200, type: 'cursor', cell: -1 },
    { time: 300, type: 'cursor', cell: 0 },
  ];
  const back = decodeReplay(encodeReplay(replay2D({ movement })));
  assert.deepEqual(back.movement, movement);
  assert.deepEqual(MOVEMENT_TYPES, ['sample', 'cursor', 'view']);
  for (const cell of [-2, 81]) {
    assert.throws(() => encodeReplay(replay2D({ movement: [{ time: 0, type: 'cursor', cell }] })), RangeError, `cell ${cell}`);
  }
});

// ---------- versions ----------

test('a newer format version is refused with its own error, not as unreadable', () => {
  const bytes = encodeReplay(replay2D());
  const newer = createReplayDecoder({ current: 0, decoders: {}, upgrades: {} });
  assert.throws(() => newer(bytes), (e) => e instanceof ReplayNewerVersionError
    && !(e instanceof ReplayUnreadableError) && e.storedVersion === REPLAY_FORMAT_VERSION && e.currentVersion === 0);
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
  const decode = createReplayDecoder({ current: REPLAY_FORMAT_VERSION, decoders: {}, upgrades: {} });
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
