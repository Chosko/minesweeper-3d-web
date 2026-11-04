// Steam achievements (steam-achievements) against a fake bridge client: the unlocker — the names
// already set read first, the rest set, then stored; a failed read, set or store left for the next
// catch-up —, the whole wired by createSteamAchievements — the end-of-game hook returning at once,
// catch-up over the records' history at start-up once Steam is available and on each logged-on
// event, offline unlocks left to the Steam client, nothing attempted with Steam unavailable or the
// achievements capability off —, the records store's games, the results flow's hand-off, the bridge
// client's achievement requests and the platform's Steam slot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBoardIdentity, STANDARD_BOARDS, PRESETS_3D } from '../js/records/board.js';
import { compactSummary } from '../js/records/model.js';
import { createRecordsStore } from '../js/records/store.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createCapabilities } from '../js/platform/capabilities.js';
import { createBridgeClient } from '../js/platform/bridge-client.js';
import { STEAM_SLOTS, selectPlatform } from '../js/platform/index.js';
import { createResultsFlow } from '../js/results/flow.js';
import { createUnlocker } from '../js/achievements/unlock.js';
import { createSteamAchievements } from '../js/achievements/index.js';

const classic = (name, noGuess = true) => {
  const b = STANDARD_BOARDS.find((s) => s.name === name);
  return createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: b.width, height: b.height, mines: b.mines, noGuess });
};
const cube = (name) => {
  const p = PRESETS_3D.find((s) => s.family === 'Cube' && s.name === name);
  return createBoardIdentity({ mode: '3d', width: p.width, height: p.height, depth: p.depth, mines: p.mines, noGuess: true });
};

// A slow, flagged game: a win earns only its board's own win achievement.
const game = (id, board, outcome = 'won') => ({
  id, board: { ...board }, outcome, elapsedMs: 10_000_000, pauses: 0, pausedMs: 0, bbbv: 150, bbbvSolved: outcome === 'won' ? 150 : 10,
  clicks: { reveal: { effective: 1000, wasted: 0 }, flag: { effective: 1, wasted: 0 }, chord: { effective: 0, wasted: 0 } },
  seed: 1, generatorVersion: 1, endedAt: '2026-11-04T12:00:00.000Z',
});

const ALL_ON = { identity: true, presence: true, achievements: true, leaderboards: true, sharedFiles: true, overlay: true };
const tick = () => new Promise((r) => { setTimeout(r, 0); });
const quiet = () => {};

/**
 * A fake bridge client over a fake Steam's achievements: `set` holds the names set, `stored` counts
 * the stores, `calls` every request in order. `fail` maps an operation ('read', 'set', 'store') to
 * the typed error code it rejects with until removed. `emit(state)` sends a Steam state change: the
 * capability flags follow it first, as the platform's host link does, then the listeners.
 */
function fakeSteam({ adapter = 'steam', loggedOn = true, capabilities = ALL_ON, set = [] } = {}) {
  const has = new Set(set);
  const calls = [];
  const fail = new Map();
  const listeners = new Set();
  let stored = 0;
  let state = { adapter, loggedOn, player: { steamId: '1', name: 'Ada' }, capabilities };
  const flags = createCapabilities({ desktopHost: true });
  const op = (name, fn) => (...args) => {
    calls.push([name, ...args]);
    if (fail.has(name)) return Promise.reject({ code: fail.get(name), message: fail.get(name) });
    return Promise.resolve().then(() => fn(...args));
  };
  const client = {
    achievementsSet: op('read', (names) => names.filter((n) => has.has(n))),
    setAchievement: op('set', (name) => { has.add(name); }),
    storeStats: op('store', () => { stored += 1; }),
    steamState: () => Promise.resolve(state),
    on(event, listener) {
      if (event !== 'steamStateChanged') return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return {
    client,
    capabilities: flags,
    calls,
    fail,
    set: has,
    get stored() { return stored; },
    /** The host's start-up answer: the flags take the current state. */
    ready() { flags.update(state); },
    emit(change) {
      state = { ...state, ...change };
      flags.update(state);
      for (const listener of [...listeners]) listener(state);
    },
  };
}

// ---------------------------------------------------------------- the unlocker

test('the unlocker reads which names are set, sets the rest and stores', async () => {
  const steam = fakeSteam({ set: ['A'] });
  const unlocker = createUnlocker({ client: steam.client, log: quiet });
  await unlocker.unlock(['A', 'B', 'C', 'B']);
  assert.deepEqual(steam.calls, [['read', ['A', 'B', 'C']], ['set', 'B'], ['set', 'C'], ['store']]);
  assert.deepEqual([...steam.set].sort(), ['A', 'B', 'C']);
});

test('names all set already are neither set again nor stored; no names reads nothing', async () => {
  const steam = fakeSteam({ set: ['A', 'B'] });
  const unlocker = createUnlocker({ client: steam.client, log: quiet });
  await unlocker.unlock(['A', 'B']);
  await unlocker.unlock([]);
  assert.deepEqual(steam.calls, [['read', ['A', 'B']]]);
  assert.equal(steam.stored, 0);
});

test('a failed read sets nothing; a failed set leaves that name, the others set and stored', async () => {
  const logged = [];
  const steam = fakeSteam();
  const unlocker = createUnlocker({ client: steam.client, log: (...args) => logged.push(args) });
  steam.fail.set('read', 'failed');
  await unlocker.unlock(['A', 'B']);
  assert.deepEqual(steam.calls, [['read', ['A', 'B']]]);
  steam.fail.clear();
  steam.calls.length = 0;
  const realSet = steam.client.setAchievement;
  steam.client.setAchievement = (name) => (name === 'A' ? Promise.reject({ code: 'failed', message: 'x' }) : realSet(name));
  await unlocker.unlock(['A', 'B']);
  assert.deepEqual([...steam.set], ['B']);
  assert.equal(steam.stored, 1);
  assert.equal(logged.length, 2, 'each failure is logged');
});

test('a failed store is stored again on the next unlock, even with nothing new to set', async () => {
  const steam = fakeSteam();
  const unlocker = createUnlocker({ client: steam.client, log: quiet });
  steam.fail.set('store', 'failed');
  await unlocker.unlock(['A']);
  assert.equal(steam.stored, 0);
  steam.fail.clear();
  steam.calls.length = 0;
  await unlocker.unlock(['A']);
  assert.deepEqual(steam.calls, [['read', ['A']], ['store']]);
  assert.equal(steam.stored, 1);
  await unlocker.unlock(['A']);
  assert.equal(steam.stored, 1, 'once stored, nothing more');
});

// ---------------------------------------------------------------- the end-of-game hook

test('onGameFinished returns at once and unlocks what the game earned in the background', async () => {
  const steam = fakeSteam();
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  assert.equal(achievements.onGameFinished(game('g1', classic('Expert', false))), undefined);
  assert.deepEqual(steam.calls, [], 'nothing before the call returns');
  await achievements.settled();
  assert.deepEqual([...steam.set].sort(), ['CLASSIC_EXPERT_HARD_WAY', 'CLASSIC_EXPERT_WIN']);
  assert.equal(steam.stored, 1);
});

test('a game that earns nothing asks Steam nothing: a loss, a custom board', async () => {
  const steam = fakeSteam();
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  achievements.onGameFinished(game('g1', classic('Beginner'), 'lost'));
  achievements.onGameFinished(game('g2', createBoardIdentity({ mode: 'classic-2d', grid: 'square', width: 9, height: 10, mines: 10, noGuess: true })));
  await achievements.settled();
  assert.deepEqual(steam.calls, []);
});

test('offline, the unlock is still set and stored: the Steam client keeps it and syncs it later', async () => {
  const steam = fakeSteam({ loggedOn: false });
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  achievements.onGameFinished(game('g1', cube('Beginner')));
  await achievements.settled();
  assert.deepEqual([...steam.set], ['CUBE_BEGINNER_WIN']);
  assert.equal(steam.stored, 1);
});

test('with Steam unavailable, or the achievements capability off, neither call attempts anything', async () => {
  for (const steam of [fakeSteam({ adapter: 'unavailable' }), fakeSteam({ capabilities: { ...ALL_ON, achievements: false } })]) {
    steam.ready();
    const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
    achievements.start({ history: () => [compactSummary(game('h1', classic('Beginner')))] });
    achievements.onGameFinished(game('g1', classic('Beginner')));
    await achievements.catchUp();
    await tick();
    await achievements.settled();
    assert.deepEqual(steam.calls, []);
  }
});

test('the web build has no achievements: the browser slot is null', () => {
  const browser = { storage: () => 's', blobStore: () => 'b', leaderboards: () => null, achievements: () => null };
  const platform = selectPlatform({ bridge: null, browser });
  assert.equal(platform.achievements, null);
  assert.equal(platform.capabilities.achievements, false);
});

// ---------------------------------------------------------------- catch-up

const HISTORY = [
  game('h1', classic('Beginner')),
  game('h2', classic('Beginner')),
  game('h3', classic('Intermediate'), 'lost'),
  game('h4', cube('Expert')),
].map(compactSummary);

test('catch-up evaluates every won game in the history and unlocks what is missing, setting and storing once', async () => {
  const steam = fakeSteam({ set: ['CLASSIC_BEGINNER_WIN'] });
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  achievements.start({ history: () => HISTORY });
  await tick();
  await achievements.settled();
  const reads = steam.calls.filter(([op]) => op === 'read');
  assert.ok(reads.length >= 1);
  for (const [, names] of reads) assert.deepEqual([...names].sort(), ['CLASSIC_BEGINNER_WIN', 'CUBE_EXPERT_WIN']);
  assert.deepEqual(steam.calls.filter(([op]) => op === 'set').map(([, n]) => n).sort(), ['CUBE_EXPERT_WIN']);
  assert.equal(steam.stored, 1);
});

test('catch-up is idempotent: a second run sets and stores nothing', async () => {
  const steam = fakeSteam();
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  achievements.start({ history: () => HISTORY });
  await tick();
  await achievements.settled();
  steam.calls.length = 0;
  await achievements.catchUp();
  assert.deepEqual(steam.calls.map(([op]) => op), ['read']);
  assert.equal(steam.stored, 1);
});

test('catch-up waits for Steam: none before the flags say achievements, one as soon as they do', async () => {
  const steam = fakeSteam();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  achievements.start({ history: () => HISTORY });
  await achievements.catchUp();
  assert.deepEqual(steam.calls.filter(([op]) => op === 'read'), [], 'the flags are off until the Steam state arrives');
  steam.ready();
  await tick();
  await achievements.settled();
  assert.ok(steam.set.has('CLASSIC_BEGINNER_WIN'));
});

test('before start there is no history: catch-up does nothing, the hook still unlocks', async () => {
  const steam = fakeSteam();
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  await achievements.catchUp();
  assert.deepEqual(steam.calls, []);
  achievements.onGameFinished(game('g1', classic('Beginner')));
  await achievements.settled();
  assert.ok(steam.set.has('CLASSIC_BEGINNER_WIN'));
});

test('a failed set or store is retried at the catch-up of the next logged-on event', async () => {
  const steam = fakeSteam({ loggedOn: false });
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  steam.fail.set('set', 'failed');
  achievements.start({ history: () => HISTORY });
  await tick();
  await achievements.settled();
  assert.equal(steam.set.size, 0);
  steam.fail.clear();
  steam.fail.set('store', 'failed');
  steam.emit({ loggedOn: true });
  await tick();
  await achievements.settled();
  assert.deepEqual([...steam.set].sort(), ['CLASSIC_BEGINNER_WIN', 'CUBE_EXPERT_WIN']);
  assert.equal(steam.stored, 0);
  steam.fail.clear();
  steam.emit({ loggedOn: false });
  steam.emit({ loggedOn: true });
  await tick();
  await achievements.settled();
  assert.equal(steam.stored, 1, 'the store left over is made at the next logged-on catch-up');
});

test('catch-up reads the records store\'s games, every board and mode, and nothing is saved for it', async () => {
  const storage = createStorage({ backend: createMemoryBackend() });
  const records = createRecordsStore({ storage });
  await records.load();
  records.record(game('r1', classic('Intermediate')));
  records.record(game('r2', cube('Beginner')));
  await records.settled();
  const games = records.games();
  assert.deepEqual(games.map((e) => e.id), ['r1', 'r2']);
  assert.ok(games.every((e) => typeof e.boardKey === 'string'), 'compact history entries');
  games.pop();
  assert.equal(records.games().length, 2, 'a copy');
  const steam = fakeSteam();
  steam.ready();
  const achievements = createSteamAchievements({ client: steam.client, capabilities: steam.capabilities, log: quiet });
  achievements.start({ history: () => records.games() });
  await tick();
  await achievements.settled();
  assert.deepEqual([...steam.set].sort(), ['CLASSIC_INTERMEDIATE_WIN', 'CUBE_BEGINNER_WIN']);
  assert.deepEqual(steam.calls.map(([op]) => op).filter((op) => !['read', 'set', 'store'].includes(op)), []);
});

// ---------------------------------------------------------------- the results flow's hand-off

const fakeRecords = (log) => ({
  record: (s) => { log.push(['record', s.id]); return null; },
  available: () => true, counters: () => null, history: () => [], winRate: () => null, completedWinRate: () => null, bests: () => null,
});
const fakeRouter = () => ({ has: () => false, go() {} });

test('the end-of-game hand-off calls onGameFinished after recording a finished game, never an abandoned one', () => {
  const log = [];
  const achievements = { onGameFinished: (s) => { log.push(['achievements', s.id]); } };
  const flow = createResultsFlow({ records: fakeRecords(log), achievements, router: fakeRouter(), restart() {}, goMenu() {} });
  flow.finished(game('g1', classic('Beginner')), 'classic-2d', null);
  flow.abandoned({ ...game('g2', classic('Beginner')), outcome: 'abandoned' }, 'classic-2d', null);
  assert.deepEqual(log, [['record', 'g1'], ['achievements', 'g1'], ['record', 'g2']]);
});

test('a throwing onGameFinished never interrupts the results flow; without achievements nothing is called', () => {
  const errors = console.error;
  const logged = [];
  console.error = (e) => logged.push(e);
  try {
    const achievements = { onGameFinished: () => { throw new Error('boom'); } };
    const flow = createResultsFlow({ records: fakeRecords([]), achievements, router: fakeRouter(), restart() {}, goMenu() {} });
    assert.equal(flow.finished(game('g1', classic('Beginner')), 'classic-2d', null).summary.id, 'g1');
    assert.deepEqual(logged.map((e) => e?.message), ['boom']);
    const bare = createResultsFlow({ records: fakeRecords([]), router: fakeRouter(), restart() {}, goMenu() {} });
    assert.equal(bare.finished(game('g2', classic('Beginner')), 'classic-2d', null).summary.id, 'g2');
  } finally {
    console.error = errors;
  }
});

// ---------------------------------------------------------------- the bridge client and the platform slot

test('the bridge client\'s achievement requests reach the bridge', async () => {
  const seen = [];
  const op = (name) => (...args) => { seen.push([name, ...args]); return Promise.resolve(name); };
  const host = { achievements: { read: op('read'), set: op('set'), store: op('store') }, events: {} };
  const client = createBridgeClient(host);
  assert.equal(await client.achievementsSet(['A']), 'read');
  await client.setAchievement('A');
  await client.storeStats();
  assert.deepEqual(seen, [['read', ['A']], ['set', 'A'], ['store']]);
});

test('the platform fills its achievements slot with the Steam achievements, on the selected flags', async () => {
  assert.equal(typeof STEAM_SLOTS.achievements, 'function');
  const steam = fakeSteam();
  const achievements = STEAM_SLOTS.achievements(steam.client, { capabilities: steam.capabilities });
  for (const call of ['start', 'catchUp', 'onGameFinished', 'settled']) assert.equal(typeof achievements[call], 'function');
  steam.ready();
  achievements.onGameFinished(game('g1', classic('Beginner')));
  await achievements.settled();
  assert.ok(steam.set.has('CLASSIC_BEGINNER_WIN'));
});
