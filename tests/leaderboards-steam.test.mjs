// Steam leaderboards (steam-leaderboards) against a fake bridge client: the Steam submitter — the
// replay shared under its leaderboard's file name, the upload keeping the best, the attach after an
// improved upload, a beaten score dropped, offline and failed left for the next flush, a missing
// leaderboard dropped and logged once —, the best cache, the reader's entries and own standing, the
// replay fetcher's checks, the whole wired by createSteamLeaderboards with its own outbox store and
// its flush on logging on, the bridge client's leaderboard requests and the platform's Steam slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeReplay, encodeReplay } from '../js/replay/format.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { createCapabilities } from '../js/platform/capabilities.js';
import { createBridgeClient } from '../js/platform/bridge-client.js';
import { STEAM_SLOTS } from '../js/platform/index.js';
import { CATALOGUE, leaderboardFor } from '../js/leaderboards/catalogue.js';
import { decodeDetails, detailsFor } from '../js/leaderboards/details.js';
import { OUTBOX_DOC } from '../js/leaderboards/outbox.js';
import { SUBMISSION } from '../js/leaderboards/state.js';
import { createSteamSubmitter, replayFileName } from '../js/leaderboards/steam-submitter.js';
import { createBestCache } from '../js/leaderboards/best-cache.js';
import { createFinder, createReader } from '../js/leaderboards/reader.js';
import { createReplayFetcher, REPLAY_REASONS } from '../js/leaderboards/replay-fetch.js';
import { createSteamLeaderboards, watchLoggedOn } from '../js/leaderboards/index.js';

const FIXTURES = new URL('./fixtures/replays/', import.meta.url);
const WON = decodeReplay(new Uint8Array(readFileSync(new URL('2d-beginner-won.msrp', FIXTURES))));
const BOARD = { ...WON.header.board, noGuess: false };
const BEGINNER = leaderboardFor(BOARD);
const ME = '76561198000000001';
const ALL_ON = { identity: true, presence: true, achievements: true, leaderboards: true, sharedFiles: true, overlay: true };

// A won game from the recorded replay at a given time: its summary and sealed { blob, listing }.
function game(id, { elapsedMs = WON.check.elapsedMs, board = BOARD } = {}) {
  const r = structuredClone(WON);
  r.header.id = id;
  r.header.board = { ...board };
  r.check.elapsedMs = elapsedMs;
  const { bbbv, bbbvSolved, clicks } = WON.check;
  const summary = { id, outcome: 'won', elapsedMs, board: { ...board }, bbbv, bbbvSolved, clicks };
  return { summary, replay: { blob: encodeReplay(r), listing: { id } } };
}

const DETAILS = detailsFor(WON.check, { rulesVersion: WON.header.profile.version });

/**
 * A fake bridge client over a fake Steam: the catalogue's leaderboards, each a table of rows by
 * Steam id ranked by score; uploads keep the best and clear the entry's attachment when they
 * improve it; shared files get a new handle on every share. `fail` maps an operation to the typed
 * error code it rejects with until removed.
 */
function fakeSteam({ me = ME, loggedOn = true, capabilities = ALL_ON, friends = [], names = {} } = {}) {
  const handles = new Map(CATALOGUE.map(({ name }, i) => [name, String(100 + i)]));
  const rows = new Map([...handles.values()].map((h) => [h, new Map()]));
  const files = new Map();
  const shared = [];
  const fail = new Map();
  const calls = [];
  const listeners = new Set();
  let nextFile = 9001;
  let state = { adapter: 'steam', loggedOn, player: { steamId: me, name: 'Ada' }, capabilities };
  const ranked = (h) => [...rows.get(h)].map(([steamId, r]) => ({ steamId, ...r }))
    .sort((a, b) => a.score - b.score).map((e, i) => ({ ...e, rank: i + 1 }));
  const op = (name, fn) => (...args) => {
    calls.push([name, ...args]);
    if (fail.has(name)) return Promise.reject({ code: fail.get(name), message: fail.get(name) });
    return Promise.resolve().then(() => fn(...args));
  };
  const entry = (e) => ({ steamId: e.steamId, rank: e.rank, score: e.score, details: [...e.details], fileHandle: e.fileHandle });
  const client = {
    findLeaderboard: op('find', (name) => (handles.has(name) ? handles.get(name) : Promise.reject({ code: 'not-found', message: 'Not found' }))),
    uploadScore: op('upload', (h, score, details) => {
      const before = ranked(h).find((e) => e.steamId === me);
      if (before && before.score <= score) return { changed: false, rankBefore: before.rank, rankAfter: before.rank };
      rows.get(h).set(me, { score, details: [...details], fileHandle: null });
      return { changed: true, rankBefore: before?.rank ?? null, rankAfter: ranked(h).find((e) => e.steamId === me).rank };
    }),
    downloadScores: op('download', (h, q) => {
      const all = ranked(h);
      let picked;
      if (q.scope === 'players') picked = all.filter((e) => q.players.includes(e.steamId));
      else if (q.scope === 'global') picked = all.filter((e) => e.rank >= q.start && e.rank <= q.end);
      else if (q.scope === 'friends') picked = all.filter((e) => e.steamId === me || friends.includes(e.steamId));
      else {
        const mine = all.find((e) => e.steamId === me);
        picked = mine ? all.filter((e) => e.rank >= mine.rank + q.start && e.rank <= mine.rank + q.end) : [];
      }
      return { total: all.length, entries: picked.map(entry) };
    }),
    attachToLeaderboard: op('attach', (h, file) => { rows.get(h).get(me).fileHandle = file; }),
    writeAndShare: op('share', (name, bytes) => {
      const handle = String(nextFile++);
      files.set(handle, new Uint8Array(bytes));
      shared.push({ name, handle });
      return handle;
    }),
    downloadShared: op('fetch', (handle) => (files.has(handle) ? new Uint8Array(files.get(handle)) : Promise.reject({ code: 'failed', message: 'x' }))),
    personaNames: op('names', (ids) => Object.fromEntries(ids.map((id) => [id, names[id] ?? '']))),
    steamState: op('state', () => state),
    on: (event, fn) => {
      if (event !== 'steamStateChanged') return () => {};
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
  return {
    client,
    calls,
    fail,
    files,
    shared,
    handleOf: (name) => handles.get(name),
    row: (name, steamId = me) => rows.get(handles.get(name)).get(steamId) ?? null,
    put(name, steamId, score, { details = DETAILS, fileHandle = null } = {}) {
      rows.get(handles.get(name)).set(steamId, { score, details: [...details], fileHandle });
    },
    get state() { return state; },
    setState(change) {
      state = { ...state, ...change };
      for (const fn of [...listeners]) fn(state);
    },
    ops: () => calls.map(([name]) => name),
  };
}

const flags = (state = { adapter: 'steam', loggedOn: true, player: { steamId: ME, name: 'Ada' }, capabilities: ALL_ON }) => {
  const capabilities = createCapabilities({ desktopHost: true });
  capabilities.update(state);
  return capabilities;
};

function submitterFor(steam, options = {}) {
  const logs = [];
  const submitter = createSteamSubmitter({
    client: steam.client, find: createFinder(steam.client), playerId: () => ME, log: (...a) => logs.push(a), ...options,
  });
  return { submitter, logs };
}

const pending = (score = 1000, id = 'g1', leaderboard = BEGINNER) => ({ leaderboard, id, score, details: DETAILS, replay: new Uint8Array([1, 2, 3]) });

// ---------------------------------------------------------------- the Steam submitter

test('the submitter shares the replay under its leaderboard\'s file name, uploads score and details, and attaches the file on an improvement', async () => {
  const steam = fakeSteam();
  const { submitter } = submitterFor(steam);
  const answer = await submitter.submit(pending(1000));
  assert.deepEqual(answer, { result: 'submitted', rankBefore: null, rankAfter: 1 }, 'a first entry has no rank before');
  assert.deepEqual(steam.ops(), ['find', 'share', 'upload', 'attach']);
  assert.equal(steam.shared[0].name, replayFileName(BEGINNER));
  assert.equal(replayFileName(BEGINNER), `${BEGINNER}.msrp`);
  assert.deepEqual(steam.files.get(steam.shared[0].handle), new Uint8Array([1, 2, 3]));
  const row = steam.row(BEGINNER);
  assert.equal(row.score, 1000);
  assert.deepEqual(row.details, DETAILS);
  assert.equal(row.fileHandle, steam.shared[0].handle, 'the entry carries the shared replay');
});

test('an improved upload re-attaches under the same file name with a new handle, and reports the global rank before and after', async () => {
  const steam = fakeSteam();
  steam.put(BEGINNER, '2', 500);
  steam.put(BEGINNER, '3', 900);
  steam.put(BEGINNER, ME, 1200, { fileHandle: '42' });
  const { submitter } = submitterFor(steam);
  assert.deepEqual(await submitter.submit(pending(800)), { result: 'submitted', rankBefore: 3, rankAfter: 2 });
  assert.equal(steam.shared[0].name, replayFileName(BEGINNER));
  assert.equal(steam.row(BEGINNER).fileHandle, steam.shared[0].handle);
  assert.notEqual(steam.row(BEGINNER).fileHandle, '42');
});

test('a leaderboard\'s handle is found once and shared by every later call', async () => {
  const steam = fakeSteam();
  const { submitter } = submitterFor(steam);
  await submitter.submit(pending(1000, 'g1'));
  await submitter.submit(pending(900, 'g2'));
  assert.equal(steam.ops().filter((o) => o === 'find').length, 1);
});

test('a score Steam already beat is dropped and nothing is attached', async () => {
  const steam = fakeSteam();
  steam.put(BEGINNER, ME, 700, { fileHandle: '42' });
  const { submitter } = submitterFor(steam);
  assert.deepEqual(await submitter.submit(pending(800)), { result: 'dropped', reason: 'beaten' });
  assert.ok(!steam.ops().includes('attach'));
  assert.equal(steam.row(BEGINNER).fileHandle, '42', 'the better entry keeps its replay');
});

test('a known best that beats the score drops it before anything is written', async () => {
  const steam = fakeSteam();
  const best = { get: (lb) => (lb === BEGINNER ? 700 : null), record() {} };
  const { submitter } = submitterFor(steam, { bestCache: best });
  assert.deepEqual(await submitter.submit(pending(800)), { result: 'dropped', reason: 'beaten' });
  assert.deepEqual(steam.ops(), []);
});

test('offline or failed at any step leaves the entry for the next flush', async () => {
  for (const step of ['find', 'share', 'upload', 'attach']) {
    for (const code of ['offline', 'failed', 'unavailable']) {
      const steam = fakeSteam();
      steam.fail.set(step, code);
      const { submitter } = submitterFor(steam);
      assert.deepEqual(await submitter.submit(pending(1000)), { result: 'retry', reason: code }, `${step} ${code}`);
    }
  }
});

test('an attach that failed after an improved upload is made on the next flush', async () => {
  const steam = fakeSteam();
  const best = createBestCache({ client: steam.client, find: createFinder(steam.client), playerId: () => ME });
  const { submitter } = submitterFor(steam, { bestCache: best });
  steam.fail.set('attach', 'offline');
  assert.equal((await submitter.submit(pending(1000))).result, 'retry');
  assert.equal(steam.row(BEGINNER).score, 1000);
  assert.equal(steam.row(BEGINNER).fileHandle, null, 'the improved upload cleared the attachment');
  steam.fail.delete('attach');
  assert.deepEqual(await submitter.submit(pending(1000)), { result: 'submitted', rankBefore: 1, rankAfter: 1 });
  assert.ok(steam.row(BEGINNER).fileHandle, 'the replay is attached');
});

test('an unchanged upload whose entry already has the same score and a replay is submitted without a second attach', async () => {
  const steam = fakeSteam();
  steam.put(BEGINNER, '2', 500);
  steam.put(BEGINNER, ME, 1000, { fileHandle: '42' });
  const { submitter } = submitterFor(steam);
  assert.deepEqual(await submitter.submit(pending(1000)), { result: 'submitted', rankBefore: 2, rankAfter: 2 });
  assert.ok(!steam.ops().includes('attach'));
  assert.equal(steam.row(BEGINNER).fileHandle, '42', 'the entry keeps its replay');
});

test('a leaderboard missing from Steamworks drops the entry and is logged once', async () => {
  const steam = fakeSteam();
  steam.fail.set('find', 'not-found');
  const { submitter, logs } = submitterFor(steam);
  assert.deepEqual(await submitter.submit(pending(1000, 'g1')), { result: 'dropped', reason: 'not-found' });
  assert.deepEqual(await submitter.submit(pending(900, 'g2')), { result: 'dropped', reason: 'not-found' });
  assert.equal(logs.length, 1);
  assert.match(String(logs[0].join(' ')), new RegExp(BEGINNER));
});

test('a successful upload updates the best cache', async () => {
  const steam = fakeSteam();
  const best = createBestCache({ client: steam.client, find: createFinder(steam.client), playerId: () => ME });
  const { submitter } = submitterFor(steam, { bestCache: best });
  await submitter.submit(pending(1000));
  assert.equal(best.get(BEGINNER), 1000);
});

// ---------------------------------------------------------------- the best cache

test('the best cache reads the player\'s score on every catalogue leaderboard, once each', async () => {
  const steam = fakeSteam();
  const expert = CATALOGUE.find((c) => c.name === 'classic-2d-expert-no-guess').name;
  steam.put(BEGINNER, ME, 4000);
  steam.put(expert, ME, 90000);
  steam.put(expert, '2', 80000);
  const best = createBestCache({ client: steam.client, find: createFinder(steam.client), playerId: () => ME });
  assert.equal(best.get(BEGINNER), null, 'nothing known before it loads');
  await best.load();
  assert.equal(best.get(BEGINNER), 4000);
  assert.equal(best.get(expert), 90000);
  assert.equal(best.get('3d-cube-expert-guess'), null, 'no entry, no best');
  const downloads = steam.calls.filter(([o]) => o === 'download');
  assert.equal(downloads.length, CATALOGUE.length);
  assert.ok(downloads.every(([, , q]) => q.scope === 'players' && q.players.length === 1 && q.players[0] === ME));
  await best.load();
  assert.equal(steam.calls.filter(([o]) => o === 'download').length, CATALOGUE.length, 'a loaded leaderboard is not read again');
});

test('the best cache keeps the lower score, reads again a leaderboard that failed, and reads nothing without a player', async () => {
  const steam = fakeSteam();
  steam.put(BEGINNER, ME, 4000);
  let player = null;
  const best = createBestCache({ client: steam.client, find: createFinder(steam.client), playerId: () => player });
  await best.load();
  assert.equal(steam.calls.length, 0, 'no player, nothing read');
  player = ME;
  steam.fail.set('download', 'offline');
  await best.load();
  assert.equal(best.get(BEGINNER), null);
  steam.fail.delete('download');
  await best.load();
  assert.equal(best.get(BEGINNER), 4000);
  best.record(BEGINNER, 5000);
  assert.equal(best.get(BEGINNER), 4000, 'a worse score never replaces the best');
  best.record(BEGINNER, 3000);
  assert.equal(best.get(BEGINNER), 3000);
});

// ---------------------------------------------------------------- the reader

function readerFor(steam, capabilities = flags()) {
  return createReader({ client: steam.client, find: createFinder(steam.client), capabilities, playerId: () => ME });
}

test('entries returns rank, player id and name, score, details and replay handle, and the total, for global, friends and around me', async () => {
  const steam = fakeSteam({ friends: ['3'], names: { 2: 'Bo', 3: 'Cy', [ME]: 'Ada' } });
  steam.put(BEGINNER, '2', 500, { fileHandle: '71' });
  steam.put(BEGINNER, '3', 600);
  steam.put(BEGINNER, ME, 700, { fileHandle: '73' });
  steam.put(BEGINNER, '4', 800);
  const reader = readerFor(steam);
  const global = await reader.entries(BOARD, 'global', { start: 1, end: 2 });
  assert.equal(global.total, 4);
  assert.deepEqual(global.entries, [
    { leaderboard: BEGINNER, rank: 1, playerId: '2', playerName: 'Bo', score: 500, details: decodeDetails(DETAILS), replay: '71' },
    { leaderboard: BEGINNER, rank: 2, playerId: '3', playerName: 'Cy', score: 600, details: decodeDetails(DETAILS), replay: null },
  ]);
  const friends = await reader.entries(BOARD, 'friends');
  assert.deepEqual(friends.entries.map((e) => e.playerId), ['3', ME]);
  const around = await reader.entries(BOARD, 'around', { start: -1, end: 1 });
  assert.deepEqual(around.entries.map((e) => [e.rank, e.playerName]), [[2, 'Cy'], [3, 'Ada'], [4, '']]);
});

test('an entry whose details are not readable has none, and names that fail to load leave the names empty', async () => {
  const steam = fakeSteam();
  steam.put(BEGINNER, '2', 500, { details: [99, 1] });
  steam.fail.set('names', 'failed');
  const { entries } = await readerFor(steam).entries(BOARD, 'global', { start: 1, end: 10 });
  assert.equal(entries[0].details, null);
  assert.equal(entries[0].playerName, null);
});

test('the names of more friends than one request takes are asked in chunks and all read', async () => {
  const many = Array.from({ length: 150 }, (_, i) => String(100 + i));
  const steam = fakeSteam({ friends: many, names: Object.fromEntries(many.map((id) => [id, `p${id}`])) });
  many.forEach((id, i) => steam.put(BEGINNER, id, 1000 + i));
  const { entries } = await readerFor(steam).entries(BOARD, 'friends');
  assert.equal(entries.length, 150);
  assert.ok(entries.every((e) => e.playerName === `p${e.playerId}`));
  const asks = steam.calls.filter(([o]) => o === 'names');
  assert.ok(asks.length > 1 && asks.every(([, ids]) => ids.length <= 100), 'no request names more ids than the bridge takes');
});

test('standing returns the player\'s score and global and friends rank, or none', async () => {
  const steam = fakeSteam({ friends: ['4'] });
  steam.put(BEGINNER, '2', 500);
  steam.put(BEGINNER, '3', 600);
  steam.put(BEGINNER, '4', 650);
  steam.put(BEGINNER, ME, 700);
  const reader = readerFor(steam);
  assert.deepEqual(await reader.standing(BOARD), { score: 700, globalRank: 4, friendsRank: 2 });
  assert.equal(await reader.standing({ ...BOARD, noGuess: true }), null, 'no entry on that leaderboard');
});

test('queries reject with a reason: the capability off, offline, a board with no leaderboard', async () => {
  const steam = fakeSteam();
  const off = flags({ adapter: 'steam', loggedOn: true, player: null, capabilities: { ...ALL_ON, leaderboards: false } });
  await assert.rejects(readerFor(steam, off).entries(BOARD, 'global', { start: 1, end: 10 }), { reason: 'unavailable' });
  await assert.rejects(readerFor(steam, off).standing(BOARD), { reason: 'unavailable' });
  await assert.rejects(readerFor(steam, createCapabilities({ desktopHost: true })).standing(BOARD), { reason: 'unavailable' },
    'no Steam state yet');
  assert.equal(steam.calls.length, 0);
  steam.fail.set('download', 'offline');
  await assert.rejects(readerFor(steam).entries(BOARD, 'global', { start: 1, end: 10 }), { reason: 'offline' });
  await assert.rejects(readerFor(steam).entries({ ...BOARD, width: 5 }, 'global', { start: 1, end: 10 }), { reason: 'no-leaderboard' });
});

// ---------------------------------------------------------------- the replay fetcher

async function attachedEntry(steam, { blob, score, leaderboard = BEGINNER }) {
  const handle = await steam.client.writeAndShare('x.msrp', blob);
  return { leaderboard, rank: 1, playerId: '2', playerName: 'Bo', score, details: null, replay: handle };
}

test('replayFor downloads, decodes and checks the replay against its entry', async () => {
  const steam = fakeSteam();
  const fetcher = createReplayFetcher({ client: steam.client, capabilities: flags() });
  const { replay: { blob } } = game('e1', { elapsedMs: 5000 });
  const result = await fetcher.replayFor(await attachedEntry(steam, { blob, score: 5000 }));
  assert.equal(result.ok, true);
  assert.equal(result.replay.header.id, 'e1');
  assert.equal(result.replay.check.elapsedMs, 5000);
});

test('replayFor answers why it has no replay: none attached, download failed, unreadable, does not match', async () => {
  const steam = fakeSteam();
  const fetcher = createReplayFetcher({ client: steam.client, capabilities: flags() });
  const { replay: { blob } } = game('e1', { elapsedMs: 5000 });
  assert.deepEqual(REPLAY_REASONS, { NO_REPLAY: 'no-replay', DOWNLOAD_FAILED: 'download-failed', UNREADABLE: 'unreadable', MISMATCH: 'mismatch' });
  const entry = await attachedEntry(steam, { blob, score: 5000 });
  assert.deepEqual(await fetcher.replayFor({ ...entry, replay: null }), { ok: false, reason: 'no-replay' });
  assert.deepEqual(await fetcher.replayFor({ ...entry, replay: '1' }), { ok: false, reason: 'download-failed' });
  const junk = await attachedEntry(steam, { blob: new Uint8Array([1, 2, 3, 4]), score: 5000 });
  assert.deepEqual(await fetcher.replayFor(junk), { ok: false, reason: 'unreadable' });
  assert.deepEqual(await fetcher.replayFor({ ...entry, score: 5001 }), { ok: false, reason: 'mismatch' }, 'another time');
  assert.deepEqual(await fetcher.replayFor({ ...entry, leaderboard: 'classic-2d-expert-guess' }), { ok: false, reason: 'mismatch' }, 'another board');
  steam.fail.set('fetch', 'offline');
  assert.deepEqual(await fetcher.replayFor(entry), { ok: false, reason: 'download-failed' });
});

test('replayFor rejects with unavailable when the capability is off', async () => {
  const steam = fakeSteam();
  const off = flags({ adapter: 'steam', loggedOn: true, player: null, capabilities: { ...ALL_ON, leaderboards: false } });
  const fetcher = createReplayFetcher({ client: steam.client, capabilities: off });
  await assert.rejects(fetcher.replayFor({ leaderboard: BEGINNER, score: 1, replay: '5' }), { reason: 'unavailable' });
  assert.equal(steam.calls.length, 0);
});

// ---------------------------------------------------------------- the whole, wired

function wired(steam, { capabilities = flags(steam.state), backend = createMemoryBackend(), impls = new Map() } = {}) {
  const opened = [];
  const openBlobStore = (name) => {
    opened.push(name);
    if (!impls.has(name)) impls.set(name, createMemoryBlobStore());
    return createBlobStore({ open: () => impls.get(name), fallback: () => createMemoryBlobStore() });
  };
  const lb = createSteamLeaderboards({
    client: steam.client, capabilities, storage: createStorage({ backend }), openBlobStore, log: () => {},
  });
  return { lb, opened, backend, impls };
}

test('createSteamLeaderboards starts the submission over an outbox of its own: a win is uploaded with its replay attached', async () => {
  const steam = fakeSteam();
  const { lb, opened } = wired(steam);
  await lb.started;
  assert.deepEqual(opened, [OUTBOX_DOC], 'the outbox opens its own store, never the replay library\'s');
  const { summary, replay } = game('w1', { elapsedMs: 12000 });
  assert.equal(lb.submit(summary, replay), true);
  await lb.settled();
  assert.deepEqual(lb.state('w1'), { status: SUBMISSION.SUBMITTED, rankBefore: null, rankAfter: 1 });
  const row = steam.row(BEGINNER);
  assert.equal(row.score, 12000);
  assert.deepEqual(steam.files.get(row.fileHandle), replay.blob, 'the attached file is the game\'s replay');
});

test('the best cache is read once logged on and feeds eligibility', async () => {
  const steam = fakeSteam();
  steam.put(BEGINNER, ME, 15000);
  const { lb } = wired(steam);
  await lb.started;
  await lb.settled();
  const slower = game('w2', { elapsedMs: 16000 });
  assert.equal(lb.submit(slower.summary, slower.replay), false, 'Steam\'s best already beats it');
  const faster = game('w3', { elapsedMs: 14000 });
  assert.equal(lb.submit(faster.summary, faster.replay), true);
  await lb.settled();
  assert.equal(lb.state('w3').status, SUBMISSION.SUBMITTED);
});

test('offline, a win waits in the outbox and is sent when Steam reports it is logged on', async () => {
  const steam = fakeSteam({ loggedOn: false });
  for (const o of ['find', 'share', 'upload', 'attach', 'download']) steam.fail.set(o, 'offline');
  const { lb } = wired(steam);
  await lb.started;
  const { summary, replay } = game('w4', { elapsedMs: 12000 });
  assert.equal(lb.submit(summary, replay), true);
  await lb.settled();
  assert.equal(lb.state('w4').status, SUBMISSION.PENDING);
  steam.fail.clear();
  steam.setState({ loggedOn: true });
  await new Promise((r) => { setTimeout(r, 0); });
  await lb.settled();
  assert.equal(lb.state('w4').status, SUBMISSION.SUBMITTED);
  assert.ok(steam.row(BEGINNER).fileHandle);
});

test('a pending win kept in the outbox is sent at the next start-up', async () => {
  const backend = createMemoryBackend();
  const impls = new Map();
  const offline = fakeSteam();
  offline.fail.set('find', 'offline');
  const first = wired(offline, { backend, impls });
  await first.lb.started;
  const { summary, replay } = game('w5', { elapsedMs: 12000 });
  first.lb.submit(summary, replay);
  await first.lb.settled();
  assert.equal(first.lb.state('w5').status, SUBMISSION.PENDING);
  const steam = fakeSteam();
  const second = wired(steam, { backend, impls });
  await second.lb.started;
  await second.lb.settled();
  assert.equal(second.lb.state('w5').status, SUBMISSION.SUBMITTED);
});

test('with the leaderboards capability off, queries reject with that reason and submissions wait in the outbox', async () => {
  const steam = fakeSteam({ capabilities: { ...ALL_ON, leaderboards: false, sharedFiles: false } });
  for (const o of ['find', 'share', 'upload', 'attach', 'download', 'fetch']) steam.fail.set(o, 'unavailable');
  const { lb } = wired(steam);
  await lb.started;
  await assert.rejects(lb.entries(BOARD, 'global', { start: 1, end: 10 }), { reason: 'unavailable' });
  await assert.rejects(lb.standing(BOARD), { reason: 'unavailable' });
  await assert.rejects(lb.replayFor({ leaderboard: BEGINNER, score: 1, replay: '5' }), { reason: 'unavailable' });
  const { summary, replay } = game('w6', { elapsedMs: 12000 });
  assert.equal(lb.submit(summary, replay), true);
  await lb.settled();
  assert.equal(lb.state('w6').status, SUBMISSION.PENDING);
});

test('the wired interface reads entries, standing and a replay through Steam', async () => {
  const steam = fakeSteam();
  const { lb } = wired(steam);
  await lb.started;
  const { summary, replay } = game('w7', { elapsedMs: 12000 });
  lb.submit(summary, replay);
  await lb.settled();
  const { total, entries } = await lb.entries(BOARD, 'global', { start: 1, end: 10 });
  assert.equal(total, 1);
  assert.equal(entries[0].playerId, ME);
  assert.deepEqual(await lb.standing(BOARD), { score: 12000, globalRank: 1, friendsRank: 1 });
  const fetched = await lb.replayFor(entries[0]);
  assert.equal(fetched.ok, true);
  assert.equal(fetched.replay.header.id, 'w7');
});

test('watchLoggedOn calls its listeners each time Steam goes from not logged on to logged on', async () => {
  const steam = fakeSteam({ loggedOn: false });
  const onLoggedOn = watchLoggedOn(steam.client);
  let count = 0;
  const off = onLoggedOn(() => { count += 1; });
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(count, 0);
  steam.setState({ loggedOn: true });
  steam.setState({ loggedOn: true });
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(count, 1);
  steam.setState({ loggedOn: false });
  steam.setState({ loggedOn: true });
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(count, 2);
  off();
  steam.setState({ loggedOn: false });
  steam.setState({ loggedOn: true });
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(count, 2);
  const already = fakeSteam({ loggedOn: true });
  let first = 0;
  watchLoggedOn(already.client)(() => { first += 1; });
  await new Promise((r) => { setTimeout(r, 0); });
  assert.equal(first, 1, 'logged on at start-up counts');
});

// ---------------------------------------------------------------- the bridge client and the platform slot

test('the bridge client\'s leaderboard, shared-file and name requests reach the bridge', async () => {
  const seen = [];
  const op = (name) => (...args) => { seen.push([name, ...args]); return Promise.resolve(name); };
  const host = {
    leaderboards: { find: op('find'), upload: op('upload'), download: op('download'), attach: op('attach') },
    sharedFiles: { writeAndShare: op('writeAndShare'), download: op('download shared') },
    identity: { names: op('names') },
    events: {},
  };
  const client = createBridgeClient(host);
  const bytes = new Uint8Array([1]);
  await client.findLeaderboard('b');
  await client.uploadScore('7', 10, [1]);
  await client.downloadScores('7', { scope: 'global', start: 1, end: 5 });
  await client.attachToLeaderboard('7', '8');
  await client.writeAndShare('f.msrp', bytes);
  await client.downloadShared('8');
  await client.personaNames(['1']);
  assert.deepEqual(seen, [
    ['find', 'b'], ['upload', '7', 10, [1]], ['download', '7', { scope: 'global', start: 1, end: 5 }], ['attach', '7', '8'],
    ['writeAndShare', 'f.msrp', bytes], ['download shared', '8'], ['names', ['1']],
  ]);
});

test('the platform\'s Steam leaderboards slot is filled', () => {
  assert.equal(typeof STEAM_SLOTS.leaderboards, 'function');
});
