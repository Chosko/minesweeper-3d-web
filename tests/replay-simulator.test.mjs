// The replay simulator and verifier (feature replay-playback § Architecture, § Interfaces and
// contracts): simulate(replay, upTo) at several times against a game played to that time, seeks
// forwards and backwards with the cells changed between them, the periodic engine-state snapshots
// on large boards and the rules engine's snapshot and restore behind them, verify() on the recorded
// games of tests/fixtures/replays/, a tampered replay, each refusal, and the measured snapshot
// constants.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  simulate, createSimulator, openReplay, ReplayRefusedError, REFUSAL,
  SNAPSHOT_INTERVAL, SNAPSHOT_MIN_CELLS, SNAPSHOT_MEMORY,
} from '../js/replay/simulator.js';
import { verify } from '../js/replay/verify.js';
import { decodeReplay, encodeReplay, cellStateDigest } from '../js/replay/format.js';
import { createGameWithMines, PHASE } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { PROFILE_3D, REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { createBoardIdentity, MODE_3D } from '../js/records/board.js';

const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', FIXTURES), 'utf8'));
const blobOf = (file) => new Uint8Array(readFileSync(new URL(file, FIXTURES)));
const fixture = (file) => decodeReplay(blobOf(file));

const gridOf = (graph) => (graph.kind === 'square' ? createSquareGrid(graph.width, graph.height) : createBoxGrid(graph.x, graph.y, graph.z));

function apply(game, a) {
  if (a.kind === 'reveal') return game.reveal(a.cell);
  if (a.kind === 'flag') return game.toggleFlag(a.cell);
  return game.chord(a.cell);
}

// A game created from the header and played through the first `count` actions.
function reference(replay, count) {
  const { graph, profile, mines } = replay.header;
  const game = createGameWithMines({ graph: gridOf(graph).graph, profile: profile.id, version: profile.version, mines });
  for (const a of replay.actions.slice(0, count)) apply(game, a);
  return game;
}

const countUpTo = (replay, t) => replay.actions.filter((a) => a.time <= t).length;

// One value per cell for everything a board view draws: the cell state and the hidden flag.
function looks(game) {
  const out = [];
  for (let c = 0; c < game.graph.count; c++) out.push(`${game.cellState(c)}${game.state.hidden[c] ? '/h' : ''}`);
  return out;
}

const diff = (a, b) => a.flatMap((v, c) => (v === b[c] ? [] : [c]));
const sorted = (changed) => Array.from(changed).sort((x, y) => x - y);

function assertFrame(frame, replay, count, name) {
  const game = reference(replay, count);
  assert.equal(frame.index, count, `${name}: actions applied`);
  assert.equal(frame.phase, game.phase, `${name}: phase`);
  assert.equal(frame.minesLeft, game.minesLeft, `${name}: mines left`);
  assert.equal(frame.explodedCell, game.explodedCell, `${name}: exploded cell`);
  const counts = game.counts();
  assert.equal(frame.bbbv, counts.bbbv, `${name}: 3BV`);
  assert.equal(frame.bbbvSolved, counts.bbbvSolved, `${name}: 3BV solved`);
  assert.deepEqual(frame.clicks, counts.clicks, `${name}: clicks`);
  assert.equal(cellStateDigest(frame.state), cellStateDigest(game.state), `${name}: cell states`);
  return game;
}

// ---------- a large synthetic 3D game ----------

function lcg(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 2 ** 32; };
}

// A replay of a game on an x × y × z box played by a player who knows the mines: it reveals the
// closed safe cells in index order, flags some mines on the way and chords now and then, so the
// stream holds every kind, wasted clicks, auto-hide and, with `lose`, a loss at the end.
function syntheticReplay({ x, y, z, density = 0.12, seed = 7, lose = false }) {
  const rnd = lcg(seed);
  const box = createBoxGrid(x, y, z);
  const n = box.graph.count;
  const mines = [];
  for (let c = 1; c < n; c++) if (rnd() < density) mines.push(c);
  const game = createGameWithMines({ graph: box.graph, profile: PROFILE_3D, version: 1, mines });
  const actions = [];
  let time = 0;
  const act = (kind, cell) => { time += 40 + Math.floor(rnd() * 400); actions.push({ time, kind, cell }); apply(game, { kind, cell }); };
  const isMine = new Uint8Array(n);
  for (const m of mines) isMine[m] = 1;
  const stop = lose ? Math.floor(n * 0.7) : n;
  for (let c = 0; c < stop && game.phase === PHASE.PLAYING; c++) {
    if (isMine[c]) { if (rnd() < 0.3) act('flag', c); continue; }
    if (game.state.revealed[c]) { if (rnd() < 0.05) act('chord', c); continue; }
    act('reveal', c);
    if (rnd() < 0.02) act('reveal', c); // wasted
  }
  if (lose && game.phase === PHASE.PLAYING) {
    const m = mines.find((c) => !game.state.flagged[c]);
    act('reveal', m);
  }
  const outcome = game.phase === PHASE.WON ? 'won' : game.phase === PHASE.LOST ? 'lost' : 'abandoned';
  const { bbbv, bbbvSolved, clicks } = game.counts();
  const replay = {
    header: {
      id: `synthetic-${x}x${y}x${z}`,
      mode: MODE_3D,
      graph: { kind: 'box', x, y, z },
      board: createBoardIdentity({ mode: MODE_3D, width: x, height: y, depth: z, mines: mines.length, noGuess: false }),
      mines,
      profile: { id: PROFILE_3D, version: 1 },
      seed,
      generatorVersion: 1,
      endedAt: '2026-10-10T12:00:00.000Z',
      movementEndedAt: null,
    },
    actions,
    movement: [],
    check: { outcome, elapsedMs: time, bbbv, bbbvSolved, clicks: structuredClone(clicks), digest: cellStateDigest(game.state) },
  };
  return decodeReplay(encodeReplay(replay));
}

// ---------- the rules engine's snapshots ----------

test('a game snapshot restores the state, counts, phase and action stream, and play goes on as from that point', () => {
  const replay = syntheticReplay({ x: 10, y: 10, z: 6, lose: true });
  const half = Math.floor(replay.actions.length / 2);
  const game = reference(replay, half);
  const snap = game.snapshot();
  const at = { digest: cellStateDigest(game.state), counts: game.counts(), phase: game.phase, minesLeft: game.minesLeft, actions: game.actions(), number: game.state.number.slice() };
  for (const a of replay.actions.slice(half)) apply(game, a);
  assert.equal(game.phase, PHASE.LOST, 'the game went on to its loss');
  game.restore(snap);
  assert.equal(cellStateDigest(game.state), at.digest, 'revealed, flagged and hidden restored');
  assert.deepEqual(game.counts(), at.counts, '3BV solved and clicks restored');
  assert.equal(game.phase, at.phase);
  assert.equal(game.minesLeft, at.minesLeft);
  assert.equal(game.explodedCell, -1, 'the loss is undone');
  assert.deepEqual(game.actions(), at.actions, 'the action stream is the snapshot\'s');
  assert.deepEqual(game.state.number, at.number, 'numbers unchanged');
  // Playing on reaches exactly the game played straight through, twice over from the same snapshot.
  for (let round = 0; round < 2; round++) {
    for (const a of replay.actions.slice(half)) apply(game, a);
    const straight = reference(replay, replay.actions.length);
    assert.equal(cellStateDigest(game.state), cellStateDigest(straight.state), `round ${round}: same final state`);
    assert.deepEqual(game.counts(), straight.counts(), `round ${round}: same counts`);
    assert.deepEqual(game.actions(), straight.actions(), `round ${round}: same action stream`);
    assert.equal(game.explodedCell, straight.explodedCell);
    game.restore(snap);
  }
});

test('a snapshot taken later in the stream survives a restore to an earlier one and play from there', () => {
  const replay = syntheticReplay({ x: 8, y: 8, z: 8, seed: 3 });
  const a = Math.floor(replay.actions.length / 3), b = 2 * a;
  const game = reference(replay, a);
  const early = game.snapshot();
  for (const act of replay.actions.slice(a, b)) apply(game, act);
  const late = game.snapshot();
  const lateActions = game.actions();
  game.restore(early);
  apply(game, { kind: 'flag', cell: 0 }); // a different action where the late snapshot's stream goes on
  game.restore(late);
  assert.deepEqual(game.actions(), lateActions, 'the later snapshot keeps its own action stream');
  assert.equal(cellStateDigest(game.state), cellStateDigest(reference(replay, b).state));
});

test('a snapshot from another game is refused', () => {
  const replay = fixture(index[0].file);
  const one = reference(replay, 1), two = reference(replay, 1);
  assert.throws(() => one.restore(two.snapshot()), RangeError);
  assert.throws(() => one.restore({}), RangeError);
});

// ---------- simulate ----------

for (const { file, note } of index) {
  test(`simulate on the recorded game ${file} (${note}) at several times`, () => {
    const replay = fixture(file);
    const end = replay.check.elapsedMs;
    const start = looks(reference(replay, 0));
    for (const t of [0, Math.floor(end / 4), Math.floor(end / 2), end - 1, end, end + 5000]) {
      const frame = simulate(replay, t);
      const game = assertFrame(frame, replay, countUpTo(replay, t), `${file} at ${t}`);
      assert.deepEqual(sorted(frame.changed), diff(start, looks(game)), `${file} at ${t}: the cells changed from the start`);
    }
    const last = simulate(replay, end);
    assert.equal(last.index, replay.actions.length, 'the whole stream by the end');
    assert.equal(cellStateDigest(last.state), replay.check.digest);
  });
}

test('simulate is pure and deterministic: the same replay and time give the same frame, and blob or replay alike', () => {
  const file = index.find((e) => e.file.startsWith('3d-')).file;
  const replay = fixture(file);
  const t = Math.floor(replay.check.elapsedMs / 2);
  const a = simulate(replay, t), b = simulate(replay, t), c = simulate(blobOf(file), t);
  for (const f of [b, c]) {
    assert.equal(f.index, a.index);
    assert.deepEqual(f.clicks, a.clicks);
    assert.equal(cellStateDigest(f.state), cellStateDigest(a.state));
    assert.deepEqual(sorted(f.changed), sorted(a.changed));
  }
  assert.deepEqual(replay, fixture(file), 'the replay is not changed');
});

// ---------- seeking ----------

function walk(sim, replay, times, name) {
  let prev = looks(reference(replay, 0));
  let prevCount = 0;
  for (const t of times) {
    const frame = sim.seek(t);
    const count = countUpTo(replay, t);
    const game = assertFrame(frame, replay, count, `${name} → ${t}`);
    if (count < prevCount) assert.deepEqual(sim.stats().lastSeek, { from: 'snapshot', applied: count }, `${name} → ${t}: replayed from the start`);
    prevCount = count;
    const now = looks(game);
    assert.deepEqual(sorted(frame.changed), diff(prev, now), `${name} → ${t}: the cells changed since the previous seek`);
    prev = now;
  }
}

test('seeking forwards and backwards on a small board replays from the start, with the cells changed between seeks', () => {
  for (const { file } of index) {
    const replay = fixture(file);
    const sim = createSimulator(replay);
    const e = replay.check.elapsedMs;
    walk(sim, replay, [e / 2, e, e / 4, 0, e, e * 3 / 4, e / 3, e / 3], file);
    assert.equal(sim.stats().snapshots, 1, `${file}: a small board keeps only the start`);
  }
});

test('seekIndex steps action by action, forwards and back', () => {
  const replay = fixture(index.find((e) => e.file.startsWith('2d-')).file);
  const sim = createSimulator(replay);
  for (const i of [1, 2, 3, 2, 1, 0, 5, 4]) {
    const frame = sim.seekIndex(i);
    assertFrame(frame, replay, i, `index ${i}`);
    assert.equal(frame.time, i === 0 ? 0 : replay.actions[i - 1].time, 'the frame is at that action\'s time');
  }
  assert.equal(sim.seekIndex(replay.actions.length + 10).index, replay.actions.length, 'clamped to the stream');
  assert.equal(sim.seekIndex(-3).index, 0);
});

test('on a large board the simulator keeps periodic snapshots and a backward seek replays only from the nearest one', () => {
  const replay = syntheticReplay({ x: 14, y: 14, z: 10, lose: true });
  const interval = 50;
  const sim = createSimulator(replay, { snapshotInterval: interval, snapshotMinCells: 1000 });
  const total = replay.actions.length;
  assert.ok(total > 6 * interval, `a long stream (${total} actions)`);
  const end = replay.check.elapsedMs;
  sim.seek(end);
  assert.equal(sim.stats().snapshots, Math.floor(total / interval) + 1, 'one at the start and one every interval');
  assert.ok(sim.stats().snapshotBytes > 0);
  const times = [end, replay.actions[Math.floor(total / 2)].time, replay.actions[interval * 3 + 7].time, 0, end, replay.actions[interval * 2].time];
  let prev = looks(reference(replay, total));
  let prevCount = total;
  for (const t of times) {
    const frame = sim.seek(t);
    const count = countUpTo(replay, t);
    const game = assertFrame(frame, replay, count, `large → ${t}`);
    const { lastSeek } = sim.stats();
    if (count < prevCount) {
      assert.equal(lastSeek.from, 'snapshot', `large → ${t}: backwards from a snapshot`);
      assert.ok(lastSeek.applied < interval, `large → ${t}: replayed ${lastSeek.applied} actions, less than one interval`);
    }
    prevCount = count;
    const now = looks(game);
    assert.deepEqual(sorted(frame.changed), diff(prev, now), `large → ${t}: the cells changed`);
    prev = now;
  }
  assert.equal(sim.stats().snapshots, Math.floor(total / interval) + 1, 'snapshots are kept, not taken again');
});

test('by default, snapshots start at the measured board size and come every measured interval', () => {
  const small = syntheticReplay({ x: 19, y: 20, z: 21 });
  assert.ok(19 * 20 * 21 < SNAPSHOT_MIN_CELLS);
  const sim = createSimulator(small);
  sim.seek(small.check.elapsedMs);
  assert.equal(sim.stats().snapshots, 1, 'only the start');
  assert.equal(sim.stats().interval, null);
  const big = syntheticReplay({ x: 20, y: 20, z: 20, density: 0.16, seed: 11 });
  assert.ok(big.actions.length > 2 * SNAPSHOT_INTERVAL, `${big.actions.length} actions`);
  const bigSim = createSimulator(big);
  bigSim.seek(big.check.elapsedMs);
  assert.equal(bigSim.stats().interval, SNAPSHOT_INTERVAL);
  assert.equal(bigSim.stats().snapshots, Math.floor(big.actions.length / SNAPSHOT_INTERVAL) + 1);
});

test('a stream whose snapshots would pass the memory budget spaces them out to stay within it', () => {
  const replay = syntheticReplay({ x: 14, y: 14, z: 10, seed: 5 });
  const perSnapshot = createSimulator(replay, { snapshotMinCells: 0 }).stats().snapshotBytes;
  const budget = perSnapshot * 6;
  const sim = createSimulator(replay, { snapshotInterval: 10, snapshotMinCells: 0, snapshotMemory: budget });
  const { interval } = sim.stats();
  assert.ok(interval > 10, `the interval grew to ${interval}`);
  sim.seek(replay.check.elapsedMs);
  assert.ok(sim.stats().snapshots <= 6, `${sim.stats().snapshots} snapshots`);
  assert.ok(sim.stats().snapshotBytes <= budget * 1.05, 'within the budget');
  for (const i of [replay.actions.length - 3, 5, Math.floor(replay.actions.length / 2)]) {
    assertFrame(sim.seekIndex(i), replay, i, `budgeted → ${i}`);
  }
  sim.seekIndex(replay.actions.length);
  sim.seekIndex(replay.actions.length - 3);
  assert.equal(sim.stats().lastSeek.from, 'snapshot');
  assert.ok(sim.stats().lastSeek.applied < interval, 'a backward seek replays less than one interval');
});

test('the snapshot constants are the measured ones (feature replay-playback § Snapshot interval)', () => {
  assert.equal(SNAPSHOT_MIN_CELLS, 8000);
  assert.equal(SNAPSHOT_INTERVAL, 2000);
  assert.equal(SNAPSHOT_MEMORY, 64 * 1024 * 1024);
});

// ---------- verify ----------

for (const { file, note } of index) {
  test(`verify: the recorded game ${file} (${note}) reproduces`, () => {
    assert.deepEqual(verify(blobOf(file)), { ok: true, result: 'reproduces' });
    assert.deepEqual(verify(fixture(file)), { ok: true, result: 'reproduces' });
  });
}

test('verify: a large synthetic game, won and lost, reproduces', () => {
  for (const lose of [false, true]) {
    const replay = syntheticReplay({ x: 12, y: 12, z: 8, lose });
    assert.equal(replay.check.outcome, lose ? 'lost' : 'won');
    assert.deepEqual(verify(encodeReplay(replay)), { ok: true, result: 'reproduces' });
  }
});

test('verify: a tampered replay reports the first check value that differs', () => {
  const file = index.find((e) => e.note.includes('wasted') && e.file.startsWith('2d-')).file;
  const base = fixture(file);
  const tamper = (fn) => { const r = structuredClone(base); fn(r); return verify(encodeReplay(r)); };

  // The last action removed: the game no longer ends the way it was recorded.
  const cut = tamper((r) => { r.actions.pop(); });
  assert.equal(cut.ok, false);
  assert.equal(cut.result, 'differs');
  assert.equal(cut.field, 'outcome');
  assert.equal(cut.expected, base.check.outcome);

  // A wasted reveal added at the end on an opened cell — same outcome, the clicks differ first.
  const extra = tamper((r) => {
    const last = r.actions.at(-1);
    const opened = reference(base, 1).state.revealed.findIndex((v) => v === 1);
    r.actions.splice(r.actions.length - 1, 0, { time: last.time, kind: 'reveal', cell: opened });
  });
  assert.equal(extra.field, 'clicks.reveal.wasted');
  assert.equal(extra.expected, base.check.clicks.reveal.wasted);
  assert.equal(extra.actual, base.check.clicks.reveal.wasted + 1);

  // Check values edited, in check order: the first one edited is the one reported.
  assert.deepEqual(tamper((r) => { r.check.digest = (r.check.digest + 1) >>> 0; r.check.bbbvSolved += 1; }),
    { ok: false, result: 'differs', field: 'bbbvSolved', expected: base.check.bbbvSolved + 1, actual: base.check.bbbvSolved });
  assert.deepEqual(tamper((r) => { r.check.digest = (r.check.digest + 1) >>> 0; }),
    { ok: false, result: 'differs', field: 'digest', expected: (base.check.digest + 1) >>> 0, actual: base.check.digest });
  assert.deepEqual(tamper((r) => { r.check.bbbv += 2; }),
    { ok: false, result: 'differs', field: 'bbbv', expected: base.check.bbbv + 2, actual: base.check.bbbv });
  // A game's time is never before its last action's, finished or not.
  const lastTime = base.actions.at(-1).time;
  assert.deepEqual(tamper((r) => { r.check.elapsedMs = lastTime - 1; }),
    { ok: false, result: 'differs', field: 'elapsedMs', expected: lastTime - 1, actual: lastTime });
});

test('verify: a game\'s time may run past its last action, never before it, finished or abandoned', () => {
  for (const note of ['abandoned', 'won', 'lost']) {
    const base = fixture(index.find((e) => e.note.includes(note)).file);
    // A session stamps the action before the engine applies it and stops its timer after.
    const later = structuredClone(base); later.check.elapsedMs += note === 'abandoned' ? 5000 : 3;
    assert.deepEqual(verify(encodeReplay(later)), { ok: true, result: 'reproduces' }, note);
    const earlier = structuredClone(base); earlier.check.elapsedMs = base.actions.at(-1).time - 1;
    assert.equal(verify(encodeReplay(earlier)).field, 'elapsedMs', note);
  }
});

// ---------- refusals ----------

const newerFormat = () => encodeReplay(fixture(index[0].file), { version: 2 });
const withProfile = (profile) => { const r = fixture(index[0].file); r.header.profile = profile; return encodeReplay(r); };

const REFUSED = [
  ['a newer format version', newerFormat, REFUSAL.NEWER],
  ['a rules version this build does not have', () => withProfile({ id: REFERENCE_PROFILE, version: 99 }), REFUSAL.NEWER],
  ['a rule profile this build does not have', () => withProfile({ id: 'minesweeper-hex', version: 1 }), REFUSAL.NEWER],
  ['a damaged blob', () => { const b = blobOf(index[0].file).slice(); b[20] ^= 0xff; return b; }, REFUSAL.UNREADABLE],
  ['bytes that are not a replay', () => new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), REFUSAL.UNREADABLE],
  ['something that is not a replay at all', () => ({ header: {} }), REFUSAL.UNREADABLE],
];

for (const [name, make, reason] of REFUSED) {
  test(`refused: ${name}`, () => {
    const input = make();
    const opened = openReplay(input);
    assert.equal(opened.ok, false);
    assert.equal(opened.reason, reason);
    assert.equal(typeof opened.message, 'string');
    assert.ok(opened.message.length > 0);
    if (reason === REFUSAL.NEWER) assert.match(opened.message, /made by a newer version/);
    const v = verify(input);
    assert.deepEqual(v, { ok: false, result: 'refused', reason, message: opened.message });
    assert.throws(() => simulate(input, 0), (err) => err instanceof ReplayRefusedError && err.reason === reason);
    assert.throws(() => createSimulator(input), (err) => err instanceof ReplayRefusedError && err.reason === reason);
  });
}

test('openReplay hands back the decoded replay', () => {
  const opened = openReplay(blobOf(index[0].file));
  assert.equal(opened.ok, true);
  assert.deepEqual(opened.replay, fixture(index[0].file));
  assert.deepEqual(openReplay(fixture(index[0].file)).replay, fixture(index[0].file));
});

test('the simulator and the verifier are DOM-free', () => {
  for (const f of ['simulator.js', 'verify.js']) {
    const src = readFileSync(new URL(`../js/replay/${f}`, import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(src, /\b(document|window|navigator|requestAnimationFrame|HTMLElement)\b/, f);
  }
});
