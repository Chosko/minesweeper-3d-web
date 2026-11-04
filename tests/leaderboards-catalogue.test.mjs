import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { REPLAY_FORMAT_VERSION } from '../js/replay/format.js';
import {
  createBoardIdentity, STANDARD_BOARDS, STANDARD_BOARDS_HEX, STANDARD_BOARDS_TRI, PRESETS_3D,
} from '../js/records/board.js';
import { buildSummary, bbbvPerSecond, efficiency } from '../js/records/summary.js';
import { CATALOGUE, leaderboardFor } from '../js/leaderboards/catalogue.js';
import {
  DETAILS_FORMAT_VERSION, scoreOf, encodeDetails, detailsFor, decodeDetails, statsOf,
} from '../js/leaderboards/details.js';
import { eligible } from '../js/leaderboards/eligibility.js';

const square = (b, noGuess, extra = {}) => ({
  mode: 'classic-2d', grid: 'square', width: b.width, height: b.height, mines: b.mines, noGuess, ...extra,
});
const cube = (p, noGuess, extra = {}) => ({
  mode: '3d', width: p.width, height: p.height, depth: p.depth, mines: p.mines, noGuess, ...extra,
});
const std = (name) => STANDARD_BOARDS.find((b) => b.name === name);
const preset = (name) => PRESETS_3D.find((p) => p.family === 'Cube' && p.name === name);

// ---------- catalogue ----------

// The published names: pinned here so they never change once the leaderboards exist on Steam.
const PINNED = [
  [square(std('Beginner'), false), 'classic-2d-beginner-guess'],
  [square(std('Beginner'), true), 'classic-2d-beginner-no-guess'],
  [square(std('Intermediate'), false), 'classic-2d-intermediate-guess'],
  [square(std('Intermediate'), true), 'classic-2d-intermediate-no-guess'],
  [square(std('Expert'), false), 'classic-2d-expert-guess'],
  [square(std('Expert'), true), 'classic-2d-expert-no-guess'],
  [cube(preset('Beginner'), false), '3d-cube-beginner-guess'],
  [cube(preset('Beginner'), true), '3d-cube-beginner-no-guess'],
  [cube(preset('Intermediate'), false), '3d-cube-intermediate-guess'],
  [cube(preset('Intermediate'), true), '3d-cube-intermediate-no-guess'],
  [cube(preset('Expert'), false), '3d-cube-expert-guess'],
  [cube(preset('Expert'), true), '3d-cube-expert-no-guess'],
];

test('leaderboardFor names each of the 12 catalogue boards by its pinned name', () => {
  for (const [board, name] of PINNED) assert.equal(leaderboardFor(board), name, JSON.stringify(board));
  assert.equal(new Set(PINNED.map(([, n]) => n)).size, 12);
});

test('the catalogue lists exactly the pinned boards and names, each name short enough for Steam', () => {
  assert.equal(CATALOGUE.length, 12);
  assert.deepEqual(
    CATALOGUE.map(({ name, board }) => [board, name]),
    PINNED.map(([board, name]) => [createBoardIdentity(board), name]),
  );
  for (const { name } of CATALOGUE) assert.ok(name.length <= 128 && /^[a-z0-9-]+$/.test(name), name);
  assert.ok(Object.isFrozen(CATALOGUE));
});

test('leaderboardFor names a catalogue board identity however it was built', () => {
  const built = createBoardIdentity(square(std('Expert'), true));
  assert.equal(leaderboardFor(built), 'classic-2d-expert-no-guess');
  assert.equal(leaderboardFor({ ...cube(preset('Expert'), false), daily: false }), '3d-cube-expert-guess');
});

test('leaderboardFor has none for custom boards', () => {
  assert.equal(leaderboardFor(square({ width: 20, height: 12, mines: 50 }, false)), null);
  assert.equal(leaderboardFor(square({ width: 30, height: 16, mines: 98 }, false)), null);
  assert.equal(leaderboardFor(square({ width: 9, height: 9, mines: 10 }, false, { grid: 'hex', mode: 'classic-2d' })), null);
  assert.equal(leaderboardFor(cube({ width: 7, height: 7, depth: 7, mines: 30 }, true)), null);
  assert.equal(leaderboardFor(cube({ width: 10, height: 10, depth: 10, mines: 80 }, false)), null);
});

test('leaderboardFor has none for the Cube Intro preset, the flat 3D presets and the former double-layer sizes', () => {
  for (const noGuess of [false, true]) {
    assert.equal(leaderboardFor(cube(preset('Intro'), noGuess)), null);
    for (const [w, h, m] of [[9, 9, 10], [16, 16, 40], [30, 16, 99]]) {
      assert.equal(leaderboardFor(cube({ width: w, height: h, depth: 1, mines: m }, noGuess)), null);
    }
    for (const [w, h, m] of [[8, 8, 10], [14, 14, 60], [25, 16, 130]]) {
      assert.equal(leaderboardFor(cube({ width: w, height: h, depth: 2, mines: m }, noGuess)), null);
    }
  }
});

test('leaderboardFor has none for the Hexagon and Triangle standard boards and any Daily board', () => {
  for (const noGuess of [false, true]) {
    for (const b of STANDARD_BOARDS_HEX) {
      assert.equal(leaderboardFor({ mode: 'hexagon', grid: 'hex', ...b, name: undefined, noGuess }), null);
    }
    for (const b of STANDARD_BOARDS_TRI) {
      assert.equal(leaderboardFor({ mode: 'triangle', grid: 'tri', ...b, name: undefined, noGuess }), null);
    }
  }
  for (const [board] of PINNED) assert.equal(leaderboardFor({ ...board, daily: true }), null);
});

test('leaderboardFor has none for anything that is not a board identity, and never throws', () => {
  for (const v of [undefined, null, 42, 'classic-2d', {}, { mode: 'classic-2d', grid: 'square', width: 9 }]) {
    assert.equal(leaderboardFor(v), null);
  }
});

// ---------- score and details ----------

const ENDED = new Date('2026-10-09T12:00:00.000Z');

// A won 3 × 3 game with a wasted reveal and a flag: 3BV 1, three counted clicks.
function wonSummary(elapsedMs) {
  const grid = createSquareGrid(3, 3);
  const game = createGameWithMines({
    graph: grid.graph, profile: REFERENCE_PROFILE, mines: [grid.index(0, 0)], dimensions: { width: 3, height: 3 },
  });
  game.toggleFlag(grid.index(0, 0));
  game.reveal(grid.index(2, 2));
  return buildSummary({
    engine: game.summary(), board: square({ width: 3, height: 3, mines: 1 }, false),
    elapsedMs, seed: 1, generatorVersion: 1, endedAt: ENDED, id: 'g-1',
  });
}

const CLICKS = Object.freeze({
  reveal: { effective: 140, wasted: 3 }, flag: { effective: 99, wasted: 7 }, chord: { effective: 41, wasted: 2 },
});

test('the score is the elapsed time in integer milliseconds', () => {
  assert.equal(scoreOf({ elapsedMs: 61234 }), 61234);
  assert.equal(scoreOf(wonSummary(4321)), 4321);
  assert.ok(Number.isInteger(scoreOf(wonSummary(1))));
});

test('details are an integer array: versions, 3BV, 3BV solved and clicks by kind', () => {
  const details = encodeDetails({
    replayFormatVersion: 3, rulesVersion: 2, bbbv: 187, bbbvSolved: 187, clicks: CLICKS,
  });
  assert.deepEqual(details, [DETAILS_FORMAT_VERSION, 3, 2, 187, 187, 140, 3, 99, 7, 41, 2]);
  assert.ok(details.every(Number.isInteger));
});

test('details round-trip through the decoder', () => {
  const fields = { replayFormatVersion: 3, rulesVersion: 1, bbbv: 30, bbbvSolved: 30, clicks: CLICKS };
  assert.deepEqual(decodeDetails(encodeDetails(fields)), { detailsVersion: DETAILS_FORMAT_VERSION, ...fields });
  const zero = { reveal: { effective: 0, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
  const none = { replayFormatVersion: 1, rulesVersion: 1, bbbv: 1, bbbvSolved: 0, clicks: zero };
  assert.deepEqual(decodeDetails(encodeDetails(none)), { detailsVersion: DETAILS_FORMAT_VERSION, ...none });
});

test('detailsFor takes a summary\'s 3BV and clicks, the current replay format and the given rules version', () => {
  const s = wonSummary(4000);
  const details = detailsFor(s, { rulesVersion: 1 });
  assert.deepEqual(decodeDetails(details), {
    detailsVersion: DETAILS_FORMAT_VERSION, replayFormatVersion: REPLAY_FORMAT_VERSION, rulesVersion: 1,
    bbbv: s.bbbv, bbbvSolved: s.bbbvSolved, clicks: s.clicks,
  });
  assert.deepEqual(decodeDetails(detailsFor(s, { rulesVersion: 2, replayFormatVersion: 2 })).replayFormatVersion, 2);
});

test('the encoder refuses fields that are not non-negative 32-bit integers', () => {
  const ok = { replayFormatVersion: 3, rulesVersion: 1, bbbv: 10, bbbvSolved: 10, clicks: CLICKS };
  for (const bad of [
    { bbbv: -1 }, { bbbv: 1.5 }, { bbbvSolved: 11 }, { rulesVersion: 0 }, { replayFormatVersion: undefined },
    { bbbv: 2 ** 31 }, { clicks: { ...CLICKS, chord: { effective: 1 } } }, { clicks: null },
  ]) {
    assert.throws(() => encodeDetails({ ...ok, ...bad }), RangeError, JSON.stringify(bad));
  }
});

test('the decoder returns null for details it cannot read', () => {
  const good = encodeDetails({ replayFormatVersion: 3, rulesVersion: 1, bbbv: 10, bbbvSolved: 10, clicks: CLICKS });
  assert.equal(decodeDetails(null), null);
  assert.equal(decodeDetails([]), null);
  assert.equal(decodeDetails(good.slice(0, -1)), null);
  assert.equal(decodeDetails([DETAILS_FORMAT_VERSION + 1, ...good.slice(1)]), null);
  assert.equal(decodeDetails([...good.slice(0, 3), 10, 11, ...good.slice(5)]), null); // solved above 3BV
  assert.equal(decodeDetails([...good.slice(0, 5), -1, ...good.slice(6)]), null);
  assert.equal(decodeDetails([...good.slice(0, 5), 0.5, ...good.slice(6)]), null);
  // Steam may pad the details array; trailing values are ignored.
  assert.deepEqual(decodeDetails([...good, 0, 0]), decodeDetails(good));
});

test('3BV/s and efficiency from decoded details match game-summary\'s derivations to the digit', () => {
  for (const elapsedMs of [1, 999, 4000, 61234, 3_599_999]) {
    const s = wonSummary(elapsedMs);
    const stats = statsOf(scoreOf(s), decodeDetails(detailsFor(s, { rulesVersion: 1 })));
    assert.equal(stats.bbbvPerSecond, s.bbbvPerSecond);
    assert.equal(stats.efficiency, s.efficiency);
  }
  for (const [elapsedMs, bbbv, clicks] of [
    [123457, 187, CLICKS],
    [7, 3, { reveal: { effective: 3, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } }],
    [98765, 121, { reveal: { effective: 77, wasted: 13 }, flag: { effective: 0, wasted: 1 }, chord: { effective: 29, wasted: 5 } }],
  ]) {
    const record = { elapsedMs, bbbvSolved: bbbv, clicks };
    const details = encodeDetails({ replayFormatVersion: 3, rulesVersion: 1, bbbv, bbbvSolved: bbbv, clicks });
    const stats = statsOf(elapsedMs, decodeDetails(details));
    assert.equal(stats.bbbvPerSecond, bbbvPerSecond(record));
    assert.equal(stats.efficiency, efficiency(record));
  }
});

test('a stat with a zero divisor is not available from details either', () => {
  const zero = { reveal: { effective: 0, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
  const d = decodeDetails(encodeDetails({ replayFormatVersion: 3, rulesVersion: 1, bbbv: 1, bbbvSolved: 0, clicks: zero }));
  assert.deepEqual(statsOf(0, d), { bbbvPerSecond: null, efficiency: null });
  assert.deepEqual(statsOf(60000, decodeDetails([99])), { bbbvPerSecond: null, efficiency: null });
});

// ---------- eligibility ----------

const EXPERT = createBoardIdentity(square(std('Expert'), true));
const winOn = (board, extra = {}) => ({ id: 'g-7', board, outcome: 'won', elapsedMs: 60000, ...extra });
const sealedFor = (summary) => ({ blob: new Uint8Array([77, 83, 82, 80, 3]), listing: { id: summary.id } });

test('eligible: a won game on a catalogue board with a sealed replay and no known best', () => {
  const s = winOn(EXPERT);
  assert.equal(eligible(s, sealedFor(s), null), true);
  assert.equal(eligible(s, sealedFor(s), undefined), true);
  assert.equal(eligible(s, sealedFor(s)), true);
  const c = winOn(createBoardIdentity(cube(preset('Intermediate'), false)));
  assert.equal(eligible(c, sealedFor(c), null), true);
});

test('eligible: only when the time beats the known Steam best', () => {
  const s = winOn(EXPERT);
  assert.equal(eligible(s, sealedFor(s), 60001), true);
  assert.equal(eligible(s, sealedFor(s), 60000), false);
  assert.equal(eligible(s, sealedFor(s), 59999), false);
});

test('not eligible: a lost or abandoned game', () => {
  for (const outcome of ['lost', 'abandoned']) {
    const s = winOn(EXPERT, { outcome });
    assert.equal(eligible(s, sealedFor(s), null), false);
  }
});

test('not eligible: a board outside the catalogue — custom, Cube Intro, Hexagon, Daily', () => {
  for (const board of [
    createBoardIdentity(square({ width: 20, height: 12, mines: 50 }, false)),
    createBoardIdentity(cube(preset('Intro'), false)),
    createBoardIdentity({ mode: 'hexagon', grid: 'hex', width: 30, height: 16, mines: 100, noGuess: false }),
    createBoardIdentity({ ...EXPERT, daily: true }),
  ]) {
    const s = winOn(board);
    assert.equal(eligible(s, sealedFor(s), null), false, JSON.stringify(board));
  }
});

test('not eligible: a challenge, a game started from a board code', () => {
  const s = winOn(EXPERT, { challenge: true });
  assert.equal(eligible(s, sealedFor(s), null), false);
});

test('not eligible: no sealed replay, or one that is not this game\'s', () => {
  const s = winOn(EXPERT);
  for (const replay of [
    null, undefined, {}, { blob: new Uint8Array(0), listing: { id: s.id } },
    { blob: [1, 2, 3], listing: { id: s.id } }, { blob: new Uint8Array([1]) },
    { blob: new Uint8Array([1]), listing: { id: 'another' } },
  ]) {
    assert.equal(eligible(s, replay, null), false, JSON.stringify(replay));
  }
});

test('not eligible, never thrown: a missing or malformed summary or known best', () => {
  const s = winOn(EXPERT);
  assert.equal(eligible(null, sealedFor(s), null), false);
  assert.equal(eligible({ ...s, board: { mode: 'classic-2d' } }, sealedFor(s), null), false);
  assert.equal(eligible({ ...s, elapsedMs: 1.5 }, sealedFor(s), null), false);
  assert.equal(eligible(s, sealedFor(s), 'fast'), false);
});
