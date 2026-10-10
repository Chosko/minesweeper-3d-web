// The recorder and sealer (js/replay/recorder.js): feeding actions and movement on the game
// clock, de-duplicating samples, the movement cap, sealing a won, lost and abandoned 2D game and
// a 3D game into a replay that decodes and reproduces, and a failure that drops the replay
// without interrupting play.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startRecording, MOVEMENT_CAP_BYTES } from '../js/replay/recorder.js';
import { decodeReplay, cellStateDigest } from '../js/replay/format.js';
import { createBoardIdentity, boardKey, MODE_3D } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { REFERENCE_PROFILE, PROFILE_3D } from '../js/engine/profiles.js';
import { createGame, createGameWithMines, PHASE } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createBoxGrid } from '../js/engine/box-grid.js';

const MINES_2D = [5, 10];
const board2D = createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 4, height: 4, mines: 2, noGuess: false });
const fields2D = () => ({ mode: 'classic-2d', graph: { kind: 'square', width: 4, height: 4 }, board: board2D, profile: { id: REFERENCE_PROFILE, version: 1 } });

// A session in miniature: the recorder hears every action at the point the engine gets it.
function session2D(options) {
  const failures = [];
  const rec = startRecording(fields2D(), { onFailure: (err) => failures.push(err), ...options });
  const game = createGame({ graph: createSquareGrid(4, 4).graph, profile: REFERENCE_PROFILE, version: 1, mineCount: 2, dimensions: { width: 4, height: 4 } });
  const act = (kind, cell, time) => {
    rec.action(kind, cell, time);
    if (kind === 'reveal') {
      const r = game.reveal(cell);
      if (r.boardNeeded >= 0) {
        rec.boardArrived({ mines: MINES_2D, seed: 1234, generatorVersion: 1 });
        game.supplyBoard(cell, MINES_2D);
      }
    } else if (kind === 'flag') game.toggleFlag(cell);
    else game.chord(cell);
  };
  return { rec, game, act, failures };
}

const summaryOf = (game, elapsedMs, id = 'game-1') => buildSummary({
  engine: game.summary() ?? game.counts(), elapsedMs, board: board2D, seed: 1234, generatorVersion: 1,
  endedAt: new Date('2026-10-10T10:00:00.000Z'), id,
});

function playToWin(s) {
  s.act('flag', 5, 0); // before the timer starts: time 0, order kept
  s.act('reveal', 0, 0);
  s.act('flag', 5, 300);
  s.act('flag', 5, 300); // changes the flag back: still recorded
  for (let c = 0, t = 400; c < 16; c++) {
    if (!MINES_2D.includes(c) && s.game.phase === PHASE.PLAYING) { s.act('reveal', c, t); t += 100; }
  }
}

test('feeding: every action handed to the engine is recorded with its time, in order', () => {
  const s = session2D();
  s.act('reveal', 0, 0);
  s.act('reveal', 0, 120); // a revealed cell: changes nothing, still recorded
  s.act('flag', 5, 250.7);
  s.act('chord', 4, 900);
  const sealed = s.rec.seal(summaryOf(s.game, 1000), s.game);
  const replay = decodeReplay(sealed.blob);
  assert.deepEqual(replay.actions, [
    { time: 0, kind: 'reveal', cell: 0 },
    { time: 120, kind: 'reveal', cell: 0 },
    { time: 250, kind: 'flag', cell: 5 },
    { time: 900, kind: 'chord', cell: 4 },
  ]);
  assert.equal(s.failures.length, 0);
});

test('feeding: the board arriving adds the mines, seed and generator version to the header', () => {
  const s = session2D();
  playToWin(s);
  const replay = decodeReplay(s.rec.seal(summaryOf(s.game, 1500), s.game).blob);
  const h = replay.header;
  assert.equal(h.id, 'game-1');
  assert.equal(h.mode, 'classic-2d');
  assert.deepEqual(h.graph, { kind: 'square', width: 4, height: 4 });
  assert.deepEqual(h.board, board2D);
  assert.deepEqual(h.mines, MINES_2D);
  assert.deepEqual(h.profile, { id: REFERENCE_PROFILE, version: 1 });
  assert.equal(h.seed, 1234);
  assert.equal(h.generatorVersion, 1);
  assert.equal(h.endedAt, '2026-10-10T10:00:00.000Z');
  assert.equal(h.movementEndedAt, null);
  assert.deepEqual(replay.actions.slice(0, 4), [
    { time: 0, kind: 'flag', cell: 5 },
    { time: 0, kind: 'reveal', cell: 0 },
    { time: 300, kind: 'flag', cell: 5 },
    { time: 300, kind: 'flag', cell: 5 },
  ]);
});

test('feeding: a time earlier than the previous one is held at the previous one', () => {
  const s = session2D();
  s.act('reveal', 0, 500);
  s.act('flag', 5, 400);
  s.rec.sample([1, 1], 300);
  s.rec.sample([2, 2], 200);
  const replay = decodeReplay(s.rec.seal(summaryOf(s.game, 600), s.game).blob);
  assert.deepEqual(replay.actions.map((a) => a.time), [500, 500]);
  assert.deepEqual(replay.movement.map((e) => e.time), [300, 300]);
});

test('de-duplication: a sample equal to the previous one is not stored', () => {
  const s = session2D();
  s.act('reveal', 0, 0);
  const v = [10, 20]; // one array the sampler reuses: the recorder copies, never keeps it
  s.rec.sample(v, 0);
  s.rec.sample(v, 50);
  v[0] = 11; s.rec.sample(v, 100);
  v[0] = 10; s.rec.sample(v, 150); // equal to an earlier sample, not to the previous one
  s.rec.sample(v, 200);
  s.rec.cursor(3, 210);
  s.rec.cursor(3, 220);
  s.rec.cursor(7, 230);
  const replay = decodeReplay(s.rec.seal(summaryOf(s.game, 300), s.game).blob);
  assert.deepEqual(replay.movement, [
    { time: 0, type: 'sample', values: [10, 20] },
    { time: 100, type: 'sample', values: [11, 20] },
    { time: 150, type: 'sample', values: [10, 20] },
    { time: 210, type: 'cursor', cell: 3 },
    { time: 230, type: 'cursor', cell: 7 },
  ]);
});

test('recording keeps its events in typed buffers that grow, through thousands of events', () => {
  const s = session2D();
  s.act('reveal', 0, 0);
  for (let i = 0; i < 5000; i++) { s.rec.sample([i, -i], i * 50); s.rec.action('flag', 15, i * 50); }
  const stats = s.rec.stats();
  assert.equal(stats.actions, 5001);
  assert.equal(stats.movement, 5000);
  const replay = decodeReplay(s.rec.seal(summaryOf(s.game, 250000), s.game).blob);
  assert.equal(replay.actions.length, 5001);
  assert.equal(replay.movement.length, 5000);
  assert.deepEqual(replay.movement[4999], { time: 4999 * 50, type: 'sample', values: [4999, -4999] });
});

test('the cap: movement stops growing at the cap, the header marks where, actions go on', () => {
  const s = session2D({ movementCap: 64 });
  s.act('reveal', 0, 0);
  let t = 0;
  for (let i = 0; i < 100; i++) { t = i * 50; s.rec.sample([i * 7, i * 3], t); }
  const stats = s.rec.stats();
  assert.ok(stats.movementBytes <= 64, `movement bytes ${stats.movementBytes}`);
  assert.ok(stats.movement > 0 && stats.movement < 100);
  const endedAt = stats.movement * 50; // the first sample that did not fit
  s.rec.cursor(4, t + 10);
  s.act('flag', 5, t + 20);
  s.act('flag', 5, t + 30);
  const replay = decodeReplay(s.rec.seal(summaryOf(s.game, t + 40), s.game).blob);
  assert.equal(replay.header.movementEndedAt, endedAt);
  assert.equal(replay.movement.length, stats.movement);
  assert.ok(replay.movement.every((e) => e.time < endedAt));
  assert.deepEqual(replay.actions.map((a) => a.kind), ['reveal', 'flag', 'flag']);
});

test('the cap defaults to 2 MB of movement', () => {
  assert.equal(MOVEMENT_CAP_BYTES, 2 * 1024 * 1024);
});

test('sealing a won game: check values from the engine final state, listing fields, size', () => {
  const s = session2D();
  playToWin(s);
  assert.equal(s.game.phase, PHASE.WON);
  const summary = summaryOf(s.game, 1500);
  const sealed = s.rec.seal(summary, s.game);
  const replay = decodeReplay(sealed.blob);
  assert.deepEqual(replay.check, {
    outcome: 'won', elapsedMs: 1500, bbbv: summary.bbbv, bbbvSolved: summary.bbbvSolved,
    clicks: summary.clicks, digest: cellStateDigest(s.game.state),
  });
  assert.deepEqual(sealed.listing, {
    id: 'game-1', boardKey: boardKey(board2D), mode: 'classic-2d', outcome: 'won', elapsedMs: 1500,
    bbbvPerSecond: summary.bbbvPerSecond, efficiency: summary.efficiency,
    endedAt: '2026-10-10T10:00:00.000Z', size: sealed.blob.length,
  });
});

test('sealing twice returns the same replay; nothing is recorded after the seal', () => {
  const s = session2D();
  playToWin(s);
  const first = s.rec.seal(summaryOf(s.game, 1500), s.game);
  s.rec.action('reveal', 0, 2000);
  s.rec.sample([1, 2], 2000);
  const second = s.rec.seal(summaryOf(s.game, 9999, 'other'), s.game);
  assert.equal(second, first);
  assert.equal(decodeReplay(second.blob).header.id, 'game-1');
  assert.equal(s.failures.length, 0);
});

test('a sealed loss and abandon reproduce their check values when the actions are replayed', () => {
  for (const ending of ['lost', 'abandoned']) {
    const s = session2D();
    s.act('reveal', 0, 0);
    s.act('reveal', 0, 100); // wasted
    s.act('flag', 15, 200);
    if (ending === 'lost') s.act('reveal', MINES_2D[0], 300);
    const summary = summaryOf(s.game, 400);
    assert.equal(summary.outcome, ending);
    const replay = decodeReplay(s.rec.seal(summary, s.game).blob);
    const again = createGameWithMines({ graph: createSquareGrid(4, 4).graph, profile: replay.header.profile.id, version: replay.header.profile.version, mines: replay.header.mines });
    for (const a of replay.actions) {
      if (a.kind === 'reveal') again.reveal(a.cell);
      else if (a.kind === 'flag') again.toggleFlag(a.cell);
      else again.chord(a.cell);
    }
    const counts = again.summary() ?? again.counts();
    assert.equal(replay.check.outcome, ending);
    assert.equal(cellStateDigest(again.state), replay.check.digest);
    assert.equal(counts.bbbvSolved, replay.check.bbbvSolved);
    assert.deepEqual(counts.clicks, replay.check.clicks);
  }
});

test('a game left before its first click seals to nothing, and reports no failure', () => {
  const s = session2D();
  assert.equal(s.rec.seal(null, s.game), null);
  assert.equal(s.failures.length, 0);
});

test('a 3D game: camera samples, view-mode changes and the hidden state in the digest', () => {
  const X = 3, Y = 3, Z = 2, mines = [17];
  const board = createBoardIdentity({ mode: MODE_3D, width: X, height: Y, depth: Z, mines: 1, noGuess: false });
  const failures = [];
  const rec = startRecording({ mode: MODE_3D, graph: { kind: 'box', x: X, y: Y, z: Z }, board, profile: { id: PROFILE_3D, version: 1 } }, { onFailure: (e) => failures.push(e) });
  const box = createBoxGrid(X, Y, Z);
  const game = createGame({ graph: box.graph, profile: PROFILE_3D, mineCount: 1, dimensions: { X, Y, Z } });
  rec.action('reveal', 0, 0);
  game.reveal(0);
  rec.boardArrived({ mines, seed: 7, generatorVersion: 1 });
  game.supplyBoard(0, mines);
  rec.sample([0, 0, -30, 900, -100], 0);
  rec.sample([0, 0, -30, 900, -100], 100);
  rec.view(1, 120);
  rec.view(1, 130);
  rec.sample([1, 2, -29, 905, -98], 200);
  const summary = buildSummary({ engine: game.summary() ?? game.counts(), elapsedMs: 250, board, seed: 7, generatorVersion: 1, endedAt: new Date('2026-10-10T11:00:00.000Z'), id: 'g3' });
  const sealed = rec.seal(summary, game);
  const replay = decodeReplay(sealed.blob);
  assert.deepEqual(replay.header.graph, { kind: 'box', x: X, y: Y, z: Z });
  assert.deepEqual(replay.movement, [
    { time: 0, type: 'sample', values: [0, 0, -30, 900, -100] },
    { time: 120, type: 'view', mode: 1 },
    { time: 200, type: 'sample', values: [1, 2, -29, 905, -98] },
  ]);
  assert.equal(replay.check.digest, cellStateDigest(game.state));
  assert.equal(sealed.listing.mode, MODE_3D);
  assert.equal(sealed.listing.boardKey, boardKey(board));
  assert.equal(failures.length, 0);
});

test('failure: a bad feed drops the replay, is reported once, and never throws into play', () => {
  const s = session2D();
  s.act('reveal', 0, 0);
  assert.doesNotThrow(() => s.rec.action('jump', 0, 10));
  assert.doesNotThrow(() => s.rec.sample([1, 2, 3], 20));
  assert.doesNotThrow(() => s.rec.action('reveal', 99, 30));
  assert.equal(s.rec.failed, true);
  assert.equal(s.rec.seal(summaryOf(s.game, 100), s.game), null);
  assert.equal(s.failures.length, 1);
});

test('failure: a seal that cannot encode drops the replay and reports once', () => {
  const s = session2D();
  s.rec.action('reveal', 0, 0); // the board never arrives: no mines to seal
  const game = createGameWithMines({ graph: createSquareGrid(4, 4).graph, profile: REFERENCE_PROFILE, mines: MINES_2D });
  game.reveal(0);
  let sealed;
  assert.doesNotThrow(() => { sealed = s.rec.seal(summaryOf(game, 100), game); });
  assert.equal(sealed, null);
  assert.equal(s.rec.seal(summaryOf(game, 100), game), null);
  assert.equal(s.failures.length, 1);
});

test('failure: a summary for another board drops the replay', () => {
  const s = session2D();
  playToWin(s);
  const other = buildSummary({ engine: { ...s.game.summary(), dimensions: undefined }, elapsedMs: 10, board: { ...board2D, noGuess: true }, seed: 1, generatorVersion: 1, id: 'x' });
  assert.equal(s.rec.seal(other, s.game), null);
  assert.equal(s.failures.length, 1);
});

test('failure: header fields that cannot be recorded give a dead recorder, not a throw', () => {
  const failures = [];
  let rec;
  assert.doesNotThrow(() => { rec = startRecording({ mode: 'classic-2d', graph: { kind: 'hex' }, board: board2D, profile: { id: REFERENCE_PROFILE, version: 1 } }, { onFailure: (e) => failures.push(e) }); });
  assert.doesNotThrow(() => { rec.action('reveal', 0, 0); rec.sample([1, 1], 0); });
  assert.equal(rec.seal(null, null), null);
  assert.equal(failures.length, 1);
});
