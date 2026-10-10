// Replay determinism (feature replay-recording § Interfaces and contracts): applying a replay's
// action stream to a game created from its header's graph, mine set, profile and rules version
// reproduces its check values exactly — outcome, 3BV, 3BV solved, click counts by kind and the
// final-state digest.
//
// Asserted on the recorded games kept under tests/fixtures/replays/ (index.json lists them; they
// are written by `node dev/measure-replays.mjs --write-fixtures` and never rewritten by a test), so
// a replay recorded by an earlier build keeps reproducing; and on games recorded now through the
// real sessions, samplers and recorder by the measurement's simulated player.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

import { decodeReplay, cellStateDigest, REPLAY_FORMAT_VERSION } from '../js/replay/format.js';
import { MOVEMENT_CAP_BYTES } from '../js/replay/recorder.js';
import { SAMPLE_INTERVAL_MS as INTERVAL_2D, SAMPLE_STEPS } from '../js/replay/sampler-2d.js';
import { SAMPLE_INTERVAL_MS as INTERVAL_3D, POSITION_STEPS, ANGLE_STEPS } from '../js/replay/sampler-3d.js';
import { createGameWithMines, PHASE } from '../js/engine/rules.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { CLICK_KINDS } from '../js/engine/metrics.js';
import { FIXTURE_GAMES, playGame2D, playGame3D } from '../dev/measure-replays.mjs';

const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const index = JSON.parse(readFileSync(new URL('index.json', FIXTURES), 'utf8'));
const load = (file) => decodeReplay(new Uint8Array(readFileSync(new URL(file, FIXTURES))));

// The check values the action stream reproduces on a fresh game from the header.
function reproduce(replay) {
  const { graph, profile, mines } = replay.header;
  const cells = graph.kind === 'square' ? createSquareGrid(graph.width, graph.height) : createBoxGrid(graph.x, graph.y, graph.z);
  const game = createGameWithMines({ graph: cells.graph, profile: profile.id, version: profile.version, mines });
  for (const a of replay.actions) {
    if (a.kind === 'reveal') game.reveal(a.cell);
    else if (a.kind === 'flag') game.toggleFlag(a.cell);
    else game.chord(a.cell);
  }
  const outcome = game.phase === PHASE.WON ? 'won' : game.phase === PHASE.LOST ? 'lost' : 'abandoned';
  const { bbbv, bbbvSolved, clicks } = game.counts();
  return { outcome, bbbv, bbbvSolved, clicks: structuredClone(clicks), digest: cellStateDigest(game.state) };
}

function assertReproduces(replay, name) {
  const { outcome, bbbv, bbbvSolved, clicks, digest } = replay.check;
  assert.deepEqual(reproduce(replay), { outcome, bbbv, bbbvSolved, clicks, digest }, `${name} reproduces its check values`);
  let t = 0;
  for (const a of replay.actions) { assert.ok(a.time >= t, `${name}: action times never decrease`); t = a.time; }
  if (replay.check.outcome === 'abandoned') assert.ok(t <= replay.check.elapsedMs, `${name}: the last action is within the game's time`);
  else assert.equal(t, replay.check.elapsedMs, `${name}: the action that ends the game stops its time`);
}

const wasted = (clicks) => CLICK_KINDS.reduce((n, k) => n + clicks[k].wasted, 0);

// ---------- the measured constants ----------

test('the recording constants are the measured ones (dev/measure-replays.mjs), and the blob is not compressed', () => {
  assert.equal(INTERVAL_2D, 50);
  assert.equal(SAMPLE_STEPS, 64);
  assert.equal(INTERVAL_3D, 100);
  assert.equal(POSITION_STEPS, 16);
  assert.equal(ANGLE_STEPS, 8192);
  assert.equal(MOVEMENT_CAP_BYTES, 2 * 1024 * 1024);
  assert.equal(REPLAY_FORMAT_VERSION, 1, 'format version 1: the blob as encoded, not compressed');
  const blob = readFileSync(new URL(index[0].file, FIXTURES));
  assert.equal(blob.subarray(0, 4).toString('latin1'), 'MSRP', 'the envelope is the first bytes of the stored blob');
});

// ---------- the recorded games ----------

test('the recorded games: 2D and 3D, each with a win, a loss, an abandon and wasted clicks', () => {
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith('.msrp')).sort();
  assert.deepEqual(index.map((e) => e.file).sort(), files, 'index.json lists every recorded game');
  for (const kind of ['square', 'box']) {
    const games = index.map((e) => load(e.file)).filter((r) => r.header.graph.kind === kind);
    for (const outcome of ['won', 'lost', 'abandoned']) {
      assert.ok(games.some((r) => r.check.outcome === outcome), `a ${kind} game ${outcome}`);
    }
    assert.ok(games.some((r) => wasted(r.check.clicks) > 0), `a ${kind} game with wasted clicks`);
    assert.ok(games.every((r) => r.movement.length > 0 && r.header.movementEndedAt === null), `${kind} games carry their movement, uncapped`);
  }
  const box = index.map((e) => load(e.file)).filter((r) => r.header.graph.kind === 'box');
  assert.ok(box.some((r) => r.actions[0].kind === 'flag' && r.actions[0].time === 0), 'a 3D game with flags placed before the first reveal, at time 0');
});

for (const { file, note } of index) {
  test(`recorded game ${file} (${note}): its action stream reproduces its check values`, () => {
    assertReproduces(load(file), file);
  });
}

// ---------- games recorded now ----------

for (const spec of FIXTURE_GAMES) {
  test(`a ${spec.kind} game recorded now (${spec.note}): its action stream reproduces its check values`, async () => {
    const play = spec.kind === '2d' ? playGame2D : playGame3D;
    const game = await play(spec);
    assert.equal(game.summary.outcome, spec.outcome);
    const replay = decodeReplay(game.replay.blob);
    assert.equal(replay.check.outcome, spec.outcome);
    if (spec.waste) assert.ok(wasted(replay.check.clicks) > 0, 'wasted clicks recorded');
    if (spec.preFlags) assert.equal(replay.actions[0].kind, 'flag', 'flags before the first reveal come first');
    assert.ok(replay.movement.length > 0, 'movement recorded');
    assert.equal(replay.header.movementEndedAt, null, 'under the movement cap');
    assertReproduces(replay, spec.note);
  });
}
