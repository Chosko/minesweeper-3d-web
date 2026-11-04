// The web build's local leaderboards (steam-leaderboards' local stand-in) over a fake records
// history and a fake replay library: the ranking of the player's own wins, the standing, the
// no-op submit, the replay linking, and the platform's selection of the stand-in without the bridge.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeReplay } from '../js/replay/format.js';
import { boardKey, createBoardIdentity, MODE_3D } from '../js/records/board.js';
import { MODE_CLASSIC_2D } from '../js/records/model.js';
import { rankedGames } from '../js/records/stats.js';
import { leaderboardFor } from '../js/leaderboards/catalogue.js';
import { DETAILS_FORMAT_VERSION, statsOf } from '../js/leaderboards/details.js';
import { REPLAY_REASONS } from '../js/leaderboards/replay-fetch.js';
import { SUBMISSION } from '../js/leaderboards/state.js';
import { createLocalLeaderboards, LOCAL_PLAYER } from '../js/leaderboards/local.js';
import { createLocalLeaderboards as fromIndex, createSteamLeaderboards } from '../js/leaderboards/index.js';
import { selectPlatform, BROWSER_SLOTS, STEAM_SLOTS, leaderboards as selected } from '../js/platform/index.js';
import { BRIDGE_EVENTS } from '../js/platform/bridge-client.js';

const REPLAY_BYTES = new Uint8Array(readFileSync(new URL('./fixtures/replays/2d-beginner-won.msrp', import.meta.url)));
const REPLAY = decodeReplay(REPLAY_BYTES);

const BEGINNER = createBoardIdentity({ mode: MODE_CLASSIC_2D, grid: 'square', width: 9, height: 9, mines: 10, noGuess: false });
const BEGINNER_NG = createBoardIdentity({ ...BEGINNER, noGuess: true });
const EXPERT = createBoardIdentity({ mode: MODE_CLASSIC_2D, grid: 'square', width: 30, height: 16, mines: 99, noGuess: false });
const CUSTOM = createBoardIdentity({ mode: MODE_CLASSIC_2D, grid: 'square', width: 10, height: 10, mines: 12, noGuess: false });
const CUBE = createBoardIdentity({ mode: MODE_3D, width: 5, height: 5, depth: 5, mines: 10, noGuess: false });

const CLICKS = Object.freeze({ reveal: { effective: 20, wasted: 2 }, flag: { effective: 5, wasted: 1 }, chord: { effective: 3, wasted: 0 } });

/** A history entry as the records model keeps it (compactSummary). */
const entry = (id, board, elapsedMs, { outcome = 'won', endedAt = '2026-10-01T10:00:00.000Z', ...over } = {}) => ({
  id, boardKey: boardKey(board), outcome, elapsedMs, pauses: 0, pausedMs: 0, bbbv: 30, bbbvSolved: outcome === 'won' ? 30 : 12,
  clicks: CLICKS, endedAt, ...over,
});

/** The records store's history query over a fixed list of entries. */
const fakeRecords = (entries) => ({ history: (board) => entries.filter((e) => e.boardKey === boardKey(board)).map((e) => structuredClone(e)) });

/** The replay library's has and bytes over the ids it keeps; `failing` ids reject on read. */
function fakeReplays(kept, { failing = [], bytes = REPLAY_BYTES } = {}) {
  const ids = new Set(kept);
  return {
    has: (id) => ids.has(id),
    bytes: async (id) => {
      if (failing.includes(id)) throw new Error('read failed');
      return ids.has(id) ? bytes : undefined;
    },
  };
}

const HISTORY = [
  entry('slow', BEGINNER, 41000, { endedAt: '2026-10-01T10:00:00.000Z' }),
  entry('lost', BEGINNER, 3000, { outcome: 'lost' }),
  entry('abandoned', BEGINNER, 2000, { outcome: 'abandoned' }),
  entry('fast', BEGINNER, 12000, { endedAt: '2026-10-03T10:00:00.000Z' }),
  entry('tie-earlier', BEGINNER, 20000, { endedAt: '2026-10-04T10:00:00.000Z' }),
  entry('tie-later', BEGINNER, 20000, { endedAt: '2026-10-05T10:00:00.000Z' }),
  entry('challenge', BEGINNER, 1000, { challenge: true, seed: 7, generatorVersion: 1 }),
  entry('no-guess', BEGINNER_NG, 15000),
  entry('custom', CUSTOM, 5000),
];

const local = (history = HISTORY, kept = ['fast', 'tie-earlier']) => createLocalLeaderboards({
  records: fakeRecords(history), replays: fakeReplays(kept),
});

const reason = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err.reason;
  }
  return 'resolved';
};

// ---------------------------------------------------------------- entries

test('entries rank the player\'s own wins on the board by time in the records\' one ranking, the earlier game first on a tie', async () => {
  const boardHistory = HISTORY.filter((e) => e.boardKey === boardKey(BEGINNER));
  assert.deepEqual((await local().entries(BEGINNER, 'friends')).entries.map((e) => e.score), rankedGames(boardHistory, 'time').map((e) => e.elapsedMs));
  const { total, entries } = await local().entries(BEGINNER, 'global', { start: 1, end: 10 });
  assert.equal(total, 4);
  assert.deepEqual(entries.map((e) => [e.rank, e.score]), [[1, 12000], [2, 20000], [3, 20000], [4, 41000]]);
  assert.deepEqual(entries.map((e) => e.replay === null ? null : e.replay), ['fast', 'tie-earlier', null, null]);
  for (const e of entries) {
    assert.equal(e.leaderboard, leaderboardFor(BEGINNER));
    assert.equal(e.playerId, LOCAL_PLAYER.id);
    assert.equal(e.playerName, LOCAL_PLAYER.name, 'every entry is named as the player');
  }
});

test('losses, abandoned games, challenges and other boards are left out; the no-guess board is its own list', async () => {
  const lb = local();
  const ids = async (board) => (await lb.entries(board, 'global', { start: 1, end: 10 })).entries.map((e) => e.score);
  assert.deepEqual(await ids(BEGINNER), [12000, 20000, 20000, 41000]);
  assert.deepEqual(await ids(BEGINNER_NG), [15000]);
  assert.deepEqual(await lb.entries(EXPERT, 'global', { start: 1, end: 10 }), { total: 0, entries: [] });
});

test('every scope returns the player\'s list; global keeps to its rank range', async () => {
  const lb = local();
  const all = (await lb.entries(BEGINNER, 'global', { start: 1, end: 10 })).entries;
  assert.deepEqual((await lb.entries(BEGINNER, 'friends')).entries, all);
  assert.deepEqual((await lb.entries(BEGINNER, 'around', { start: -5, end: 5 })).entries, all);
  const page = await lb.entries(BEGINNER, 'global', { start: 2, end: 3 });
  assert.equal(page.total, 4, 'the total is the whole list\'s');
  assert.deepEqual(page.entries.map((e) => e.rank), [2, 3]);
  assert.deepEqual((await lb.entries(BEGINNER, 'global')).entries, all, 'no range is the whole list');
});

test('an entry\'s details carry its 3BV and clicks, so the screen derives 3BV/s and efficiency', async () => {
  const [first] = (await local().entries(BEGINNER, 'global', { start: 1, end: 1 })).entries;
  assert.equal(first.details.detailsVersion, DETAILS_FORMAT_VERSION);
  assert.equal(first.details.bbbv, 30);
  assert.equal(first.details.bbbvSolved, 30);
  assert.deepEqual(first.details.clicks, CLICKS);
  const stats = statsOf(first.score, first.details);
  assert.ok(stats.bbbvPerSecond > 0 && stats.efficiency > 0);
});

test('a board outside the catalogue, an unknown scope and an unconnected stand-in reject with a reason', async () => {
  const lb = local();
  assert.equal(await reason(lb.entries(CUSTOM, 'global', { start: 1, end: 10 })), 'no-leaderboard');
  assert.equal(await reason(lb.entries(CUBE, 'global', { start: 1, end: 10 })), 'no-leaderboard');
  assert.equal(await reason(lb.entries({ nonsense: true }, 'global')), 'no-leaderboard');
  assert.equal(await reason(lb.entries(BEGINNER, 'everyone')), 'invalid');
  assert.equal(await reason(lb.standing(CUSTOM)), 'no-leaderboard');
  const bare = createLocalLeaderboards();
  assert.equal(await reason(bare.entries(BEGINNER, 'global')), 'unavailable');
  assert.equal(await reason(bare.standing(BEGINNER)), 'unavailable');
});

test('a history that cannot be read rejects as failed, never throws', async () => {
  const lb = createLocalLeaderboards({ records: { history: () => { throw new Error('boom'); } }, replays: fakeReplays([]) });
  assert.equal(await reason(lb.entries(BEGINNER, 'global')), 'failed');
});

test('connect hands a stand-in the records and the replay library later', async () => {
  const lb = createLocalLeaderboards();
  lb.connect({ records: fakeRecords(HISTORY), replays: fakeReplays(['fast']) });
  const { entries } = await lb.entries(BEGINNER, 'friends');
  assert.deepEqual(entries.map((e) => e.replay), ['fast', null, null, null]);
});

test('entries read the history and the library at each query, so a new win or a replay retention dropped shows', async () => {
  const history = [entry('a', BEGINNER, 30000)];
  const kept = new Set(['a']);
  const lb = createLocalLeaderboards({
    records: fakeRecords(history),
    replays: { has: (id) => kept.has(id), bytes: async () => undefined },
  });
  assert.deepEqual((await lb.entries(BEGINNER, 'friends')).entries.map((e) => [e.score, e.replay]), [[30000, 'a']]);
  history.push(entry('b', BEGINNER, 25000));
  kept.delete('a');
  assert.deepEqual((await lb.entries(BEGINNER, 'friends')).entries.map((e) => [e.score, e.replay]), [[25000, null], [30000, null]]);
});

// ---------------------------------------------------------------- standing

test('standing is the player\'s best time and its local rank, or null without a win', async () => {
  const lb = local();
  assert.deepEqual(await lb.standing(BEGINNER), { score: 12000, globalRank: 1, friendsRank: null });
  assert.equal(await lb.standing(EXPERT), null);
});

// ---------------------------------------------------------------- submit

test('submit is a no-op that reports not eligible for Steam', async () => {
  const lb = local();
  const seen = [];
  lb.onChange((id, state) => seen.push([id, state.status]));
  const summary = { id: 'new', outcome: 'won', elapsedMs: 9000, board: BEGINNER };
  assert.equal(lb.submit(summary, { blob: REPLAY_BYTES, listing: { id: 'new' } }), false);
  assert.equal(lb.submit(summary, null), false);
  assert.equal(lb.state('new').status, SUBMISSION.NOT_ELIGIBLE);
  assert.equal(lb.state('never'), null);
  assert.deepEqual(seen, [['new', SUBMISSION.NOT_ELIGIBLE], ['new', SUBMISSION.NOT_ELIGIBLE]]);
  assert.equal(lb.submit(null, null), false, 'nothing throws');
  await lb.started;
  await lb.flush();
  await lb.settled();
  assert.equal((await lb.entries(BEGINNER, 'friends')).total, 4, 'the history already holds the game');
});

// ---------------------------------------------------------------- replays

test('replayFor returns the library\'s replay, or no replay attached', async () => {
  const lb = local();
  const { entries } = await lb.entries(BEGINNER, 'friends');
  const got = await lb.replayFor(entries[0]);
  assert.equal(got.ok, true);
  assert.deepEqual(got.replay.header, REPLAY.header);
  assert.deepEqual(await lb.replayFor(entries[3]), { ok: false, reason: REPLAY_REASONS.NO_REPLAY });
  assert.deepEqual(await lb.replayFor(null), { ok: false, reason: REPLAY_REASONS.NO_REPLAY });
  assert.deepEqual(await lb.replayFor({ ...entries[3], replay: 'slow' }), { ok: false, reason: REPLAY_REASONS.NO_REPLAY }, 'a replay the library no longer keeps');
});

test('replayFor reports a replay the library cannot read, or bytes that are no replay', async () => {
  const failing = createLocalLeaderboards({ records: fakeRecords(HISTORY), replays: fakeReplays(['fast'], { failing: ['fast'] }) });
  assert.deepEqual(await failing.replayFor({ replay: 'fast' }), { ok: false, reason: REPLAY_REASONS.DOWNLOAD_FAILED });
  const garbage = createLocalLeaderboards({ records: fakeRecords(HISTORY), replays: fakeReplays(['fast'], { bytes: new Uint8Array([1, 2, 3]) }) });
  assert.deepEqual(await garbage.replayFor({ replay: 'fast' }), { ok: false, reason: REPLAY_REASONS.UNREADABLE });
});

// ---------------------------------------------------------------- selection

/** The page's side of the preload, enough for the Steam leaderboards to be created over it. */
function fakeBridge() {
  const pending = () => new Promise(() => {});
  const host = {
    steam: { state: pending },
    storage: { load: pending, save: pending, list: pending, remove: pending, keepAside: pending, clear: pending },
    blobs: { put: pending, get: pending, delete: pending, list: pending },
    events: Object.fromEntries(BRIDGE_EVENTS.map((event) => [event, () => () => {}])),
  };
  return host;
}

test('the platform selects the local stand-in without the bridge and the Steam leaderboards with it; callers use one module', () => {
  assert.equal(fromIndex, createLocalLeaderboards, 'both implementations come from js/leaderboards/index.js');
  const web = selectPlatform({ bridge: null, browser: BROWSER_SLOTS });
  assert.equal(web.host, 'browser');
  assert.equal(web.leaderboards.local, true);
  const desktop = selectPlatform({ bridge: fakeBridge(), browser: BROWSER_SLOTS, steam: { ...STEAM_SLOTS, storage: null, blobStore: null } });
  assert.equal(desktop.host, 'desktop');
  assert.equal(desktop.leaderboards.local, false);
  assert.equal(typeof createSteamLeaderboards, 'function');
  for (const lb of [web.leaderboards, desktop.leaderboards]) {
    for (const name of ['submit', 'state', 'onChange', 'flush', 'entries', 'standing', 'replayFor', 'settled', 'connect']) {
      assert.equal(typeof lb[name], 'function', `${name} on both builds`);
    }
    assert.ok(lb.started instanceof Promise);
  }
  assert.equal(selected.local, true, 'Node has no bridge: the module\'s own selection is the stand-in');
});

test('the selected stand-in ranks the history it is connected to', async () => {
  const web = selectPlatform({ bridge: null, browser: BROWSER_SLOTS });
  web.leaderboards.connect({ records: fakeRecords(HISTORY), replays: fakeReplays(['fast']) });
  assert.deepEqual(await web.leaderboards.standing(BEGINNER), { score: 12000, globalRank: 1, friendsRank: null });
});
