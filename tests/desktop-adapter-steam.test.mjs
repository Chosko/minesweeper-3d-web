// The desktop host's Steam adapter (desktop/adapter/steam.js) over a fake binding object: the
// capabilities a binding covers, the callback pump and logged-on changes, `offline` for the calls that
// need the Steam network, typed errors, the overlay event, shutdown, and Steam start-up — the
// relaunch through Steam, the app id and the fallback to the unavailable adapter. The real binding
// and the Steam client are the task's manual check; Electron is never loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { adapterProblems, CAPABILITIES } from '../desktop/adapter/interface.js';
import {
  BINDING_METHODS, DEV_APP_ID_FILE, OVERLAY_SWITCHES, PUMP_INTERVAL_MS, STEAM_API_LIBRARY, STEAM_APP_FILE,
  createSteamAdapter, decodeLeaderboardEntry, openSteamworks, resolveAppId, startSteam, steamLibraryPath,
} from '../desktop/adapter/steam.js';
import { createBridge } from '../desktop/bridge.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Timers the test ticks by hand. */
function fakeTimers() {
  const intervals = new Map();
  let next = 1;
  return {
    setInterval(fn, ms) { const id = next++; intervals.set(id, { fn, ms }); return id; },
    clearInterval(id) { intervals.delete(id); },
    tick() { for (const { fn } of [...intervals.values()]) fn(); },
    get count() { return intervals.size; },
    get delays() { return [...intervals.values()].map((i) => i.ms); },
  };
}

/** A binding object with every capability, recording its calls; `omit` drops methods. */
function fakeBinding({ omit = [], ...overrides } = {}) {
  const calls = [];
  const overlay = new Set();
  const binding = {
    calls,
    online: true,
    restartAppIfNecessary: (appId) => { calls.push(['restart', appId]); return false; },
    init: (appId) => { calls.push(['init', appId]); return true; },
    runCallbacks: () => calls.push(['runCallbacks']),
    shutdown: () => calls.push(['shutdown']),
    steamId: () => 76561198000000001n,
    personaName: () => 'Player',
    personaNameOf: (id) => ({ '76561198000000002': 'Friend' })[id] ?? '',
    loggedOn: () => binding.online,
    setAchievement: (name) => { calls.push(['set', name]); return name !== 'MISSING'; },
    achievement: (name) => name === 'WON',
    storeStats: () => { calls.push(['store']); return true; },
    findLeaderboard: async (name) => (name === 'none' ? null : 42n),
    uploadScore: async (handle, score, details) => {
      calls.push(['upload', handle, score, details]);
      return { changed: true, rankBefore: 0, rankAfter: 3 };
    },
    downloadEntries: async (handle, scope, start, end) => {
      calls.push(['download', handle, scope, start, end]);
      return { total: 7, entries: [{ steamId: 76561198000000002n, rank: 1, score: 9000, details: [1, 2, 3], fileHandle: 55n }] };
    },
    downloadEntriesForUsers: async (handle, ids) => {
      calls.push(['downloadUsers', handle, ids]);
      return { total: 7, entries: [{ steamId: ids[0], rank: 4, score: 12000, details: [], fileHandle: null }] };
    },
    writeAndShare: async (name, bytes) => { calls.push(['share', name, [...bytes]]); return 99n; },
    downloadShared: async (handle) => { calls.push(['fetch', handle]); return Buffer.from([1, 2, 3]); },
    attach: async (handle, file) => { calls.push(['attach', handle, file]); },
    onOverlayActivated: (listener) => { overlay.add(listener); return () => overlay.delete(listener); },
    overlay: (active) => { for (const l of overlay) l(active); },
    get overlayListeners() { return overlay.size; },
    ...overrides,
  };
  for (const method of omit) delete binding[method];
  return binding;
}

const open = (binding = fakeBinding(), extra = {}) => {
  const timers = fakeTimers();
  const errors = [];
  const adapter = createSteamAdapter({ binding, timers, onError: (e) => errors.push(e), ...extra });
  return { binding, timers, errors, adapter };
};

const rejectsWith = (promise, code) => assert.rejects(promise, (e) => e.name === 'HostError' && e.code === code);

// --- capabilities ---------------------------------------------------------------------------------

test('the Steam adapter meets the adapter interface, every capability available on a full binding', () => {
  const { adapter } = open();
  assert.deepEqual(adapterProblems(adapter), []);
  assert.equal(adapter.kind, 'steam');
  for (const capability of CAPABILITIES) assert.equal(adapter.capabilities[capability], true, capability);
  assert.deepEqual(Object.keys(BINDING_METHODS), [...CAPABILITIES]);
});

test('a capability the binding lacks reports unavailable and its calls reject with unavailable', async () => {
  const { adapter } = open(fakeBinding({ omit: ['downloadShared'] }));
  assert.deepEqual(adapterProblems(adapter), [], 'the interface is unchanged for callers');
  assert.equal(adapter.capabilities.sharedFiles, false);
  assert.equal(adapter.capabilities.leaderboards, true);
  await rejectsWith(adapter.writeAndShare('a.bin', new Uint8Array([1])), 'unavailable');
  await rejectsWith(adapter.attachToLeaderboard('42', '99'), 'unavailable');
  assert.equal(await adapter.findLeaderboard('board'), '42');

  const noOverlay = open(fakeBinding({ omit: ['onOverlayActivated'] })).adapter;
  assert.equal(noOverlay.capabilities.overlay, false);
  assert.equal(typeof noOverlay.onOverlayActivated(() => {}), 'function', 'subscribing still answers an unsubscribe');
});

// --- the pump and presence ------------------------------------------------------------------------

test('the adapter runs the binding\'s callback pump on a timer, and shutdown stops it and Steam once', async () => {
  const { adapter, binding, timers } = open();
  assert.equal(timers.count, 1);
  assert.deepEqual(timers.delays, [PUMP_INTERVAL_MS]);
  timers.tick();
  timers.tick();
  assert.equal(binding.calls.filter(([c]) => c === 'runCallbacks').length, 2);
  await adapter.shutdown();
  await adapter.shutdown();
  assert.equal(timers.count, 0);
  assert.equal(binding.calls.filter(([c]) => c === 'shutdown').length, 1);
  await rejectsWith(adapter.player(), 'unavailable');
});

test('logged-on changes reach presence listeners once per change', async () => {
  const { adapter, binding, timers } = open();
  const heard = [];
  const off = adapter.onPresenceChange((on) => heard.push(on));
  assert.equal(await adapter.loggedOn(), true);
  timers.tick();
  binding.online = false;
  timers.tick();
  timers.tick();
  binding.online = true;
  timers.tick();
  assert.deepEqual(heard, [false, true]);
  off();
  binding.online = false;
  timers.tick();
  assert.deepEqual(heard, [false, true], 'an unsubscribed listener hears nothing');
});

test('a throwing pump or listener is logged and the pump keeps running', () => {
  let fail = true;
  const { adapter, binding, timers, errors } = open(fakeBinding({ runCallbacks: () => { if (fail) throw new Error('pump'); } }));
  adapter.onPresenceChange(() => { throw new Error('listener'); });
  binding.online = false;
  timers.tick();
  fail = false;
  timers.tick();
  assert.deepEqual(errors.map((e) => e.message), ['pump', 'listener']);
});

// --- offline and errors ---------------------------------------------------------------------------

test('calls that need the Steam network reject with offline while Steam is not logged on', async () => {
  const { adapter, binding } = open();
  binding.online = false;
  await rejectsWith(adapter.findLeaderboard('board'), 'offline');
  await rejectsWith(adapter.uploadScore('42', 1000, [1]), 'offline');
  await rejectsWith(adapter.downloadScores('42', { scope: 'global', start: 1, end: 10 }), 'offline');
  await rejectsWith(adapter.downloadScoresForPlayers('42', ['1']), 'offline');
  await rejectsWith(adapter.writeAndShare('a.bin', new Uint8Array([1])), 'offline');
  await rejectsWith(adapter.downloadShared('99'), 'offline');
  await rejectsWith(adapter.attachToLeaderboard('42', '99'), 'offline');
  assert.ok(!binding.calls.some(([c]) => ['upload', 'download', 'downloadUsers', 'share', 'fetch', 'attach'].includes(c)),
    'nothing reaches the binding');
  await adapter.setAchievement('WON');
  await adapter.storeStats();
  assert.deepEqual(await adapter.player(), { steamId: '76561198000000001', name: 'Player' }, 'the client answers offline');
  assert.equal(await adapter.loggedOn(), false);
});

test('a network call that fails as Steam goes offline rejects with offline, otherwise with failed', async () => {
  const binding = fakeBinding({
    uploadScore: async () => { binding.online = false; throw new Error('lost'); },
    downloadShared: async () => { throw new Error('result 2'); },
  });
  const { adapter, errors } = open(binding);
  await rejectsWith(adapter.downloadShared('99'), 'failed');
  assert.deepEqual(errors.map((e) => e.message), ['result 2'], 'a failure is logged');
  await rejectsWith(adapter.uploadScore('42', 1, []), 'offline');
});

test('a missing leaderboard or achievement rejects with not-found; a failed store with failed', async () => {
  const { adapter } = open(fakeBinding({ storeStats: () => false }));
  await rejectsWith(adapter.findLeaderboard('none'), 'not-found');
  await rejectsWith(adapter.setAchievement('MISSING'), 'not-found');
  await rejectsWith(adapter.storeStats(), 'failed');
  const throwing = open(fakeBinding({ steamId: () => { throw new Error('client'); } })).adapter;
  await rejectsWith(throwing.player(), 'failed');
});

// --- the capabilities' calls ----------------------------------------------------------------------

test('identity and achievements answer from the Steam client, Steam ids as strings', async () => {
  const { adapter, binding } = open();
  assert.deepEqual(await adapter.player(), { steamId: '76561198000000001', name: 'Player' });
  assert.deepEqual(await adapter.personaNames(['76561198000000002', '3']), { '76561198000000002': 'Friend', 3: '' });
  await adapter.setAchievement('WON');
  await adapter.storeStats();
  assert.deepEqual(binding.calls.filter(([c]) => c === 'set' || c === 'store'), [['set', 'WON'], ['store']]);
  assert.deepEqual(await adapter.achievementsSet(['WON', 'OTHER']), ['WON']);
});

test('leaderboards: handles, ranks, entries and their details cross as the interface states', async () => {
  const { adapter, binding } = open();
  const handle = await adapter.findLeaderboard('board');
  assert.equal(handle, '42');
  assert.deepEqual(await adapter.uploadScore(handle, 61000, [1, 2]), { changed: true, rankBefore: null, rankAfter: 3 });
  assert.deepEqual(binding.calls.find(([c]) => c === 'upload'), ['upload', '42', 61000, [1, 2]]);
  for (const scope of ['global', 'friends', 'around']) {
    const result = await adapter.downloadScores(handle, { scope, start: -2, end: 2 });
    assert.deepEqual(result, { total: 7, entries: [{ steamId: '76561198000000002', rank: 1, score: 9000, details: [1, 2, 3], fileHandle: '55' }] });
    assert.deepEqual(binding.calls.at(-1), ['download', '42', scope, -2, 2]);
  }
  await rejectsWith(adapter.downloadScores(handle, { scope: 'players', start: 1, end: 2 }), 'invalid');
  assert.deepEqual(await adapter.downloadScoresForPlayers(handle, ['76561198000000003']),
    { total: 7, entries: [{ steamId: '76561198000000003', rank: 4, score: 12000, details: [], fileHandle: null }] });
});

test('a downloaded entry is read from Steam\'s entry layout, its details as consecutive integers', () => {
  const entry = Buffer.alloc(32);
  entry.writeBigUInt64LE(76561198000000002n, 0);
  entry.writeInt32LE(3, 8);
  entry.writeInt32LE(61000, 12);
  entry.writeInt32LE(4, 16);
  entry.writeBigUInt64LE(123456789012345n, 24);
  const details = Buffer.alloc(64 * 4);
  [1, -2, 300, 2 ** 31 - 1].forEach((v, i) => details.writeInt32LE(v, i * 4));
  assert.deepEqual(decodeLeaderboardEntry(entry, details),
    { steamId: '76561198000000002', rank: 3, score: 61000, details: [1, -2, 300, 2 ** 31 - 1], fileHandle: '123456789012345' });
  entry.writeBigUInt64LE(0xFFFFFFFFFFFFFFFFn, 24);
  entry.writeInt32LE(99, 16);
  const unattached = decodeLeaderboardEntry(entry, details);
  assert.equal(unattached.fileHandle, null, 'Steam\'s invalid handle is no attachment');
  assert.equal(unattached.details.length, 64, 'the details count is capped at Steam\'s maximum');
  entry.writeBigUInt64LE(0n, 24);
  entry.writeInt32LE(0, 16);
  assert.deepEqual(decodeLeaderboardEntry(entry, details).details, []);
  assert.equal(decodeLeaderboardEntry(entry, details).fileHandle, null);
});

test('shared files: write and share, download as bytes, attach to the player\'s entry', async () => {
  const { adapter, binding } = open();
  assert.equal(await adapter.writeAndShare('replay.bin', new Uint8Array([7, 8])), '99');
  const bytes = await adapter.downloadShared('99');
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes], [1, 2, 3]);
  await adapter.attachToLeaderboard('42', '99');
  assert.deepEqual(binding.calls.filter(([c]) => ['share', 'fetch', 'attach'].includes(c)),
    [['share', 'replay.bin', [7, 8]], ['fetch', '99'], ['attach', '42', '99']]);
});

test('overlay activation reaches the adapter\'s listeners until shutdown', async () => {
  const { adapter, binding } = open();
  const heard = [];
  const off = adapter.onOverlayActivated((active) => heard.push(active));
  binding.overlay(true);
  binding.overlay(false);
  off();
  binding.overlay(true);
  assert.deepEqual(heard, [true, false]);
  adapter.onOverlayActivated((active) => heard.push(active));
  await adapter.shutdown();
  binding.overlay(true);
  assert.deepEqual(heard, [true, false]);
  assert.equal(binding.overlayListeners, 0, 'the binding subscription is dropped');
});

test('through the bridge: Steam state, logged-on changes and the overlay reach the page', async () => {
  const { adapter, binding, timers } = open();
  const sent = [];
  const ipcMain = { on() {}, handle() {}, removeListener() {}, removeHandler() {} };
  const webContents = { isDestroyed: () => false, send: (_channel, event, payload) => sent.push([event, payload]) };
  const window = { onFullscreenChange: () => () => {} };
  const closing = { setFlushHook() {}, hooks: {}, setShutdownHook(fn) { this.hooks.shutdown = fn; } };
  const bridge = createBridge({ adapter, window, closing });
  bridge.attach({ ipcMain, webContents });
  const state = await bridge.steamState();
  assert.equal(state.adapter, 'steam');
  assert.equal(state.loggedOn, true);
  assert.deepEqual(state.player, { steamId: '76561198000000001', name: 'Player' });
  binding.online = false;
  timers.tick();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(sent.at(-1), ['steamStateChanged', { ...state, loggedOn: false }]);
  binding.overlay(true);
  assert.deepEqual(sent.at(-1), ['overlayActivated', true]);
  binding.online = false;
  const offline = await bridge.handle('leaderboards.find', ['board']);
  assert.deepEqual(offline, { ok: false, error: { code: 'offline', message: 'Steam offline' } });
  await closing.hooks.shutdown();
  assert.ok(binding.calls.some(([c]) => c === 'shutdown'), 'the closing sequence shuts Steam down');
});

// --- start-up -------------------------------------------------------------------------------------

test('a packaged build started outside Steam asks Steam to relaunch it and starts nothing', () => {
  const binding = fakeBinding({ restartAppIfNecessary: (id) => { binding.calls.push(['restart', id]); return true; } });
  const started = startSteam({ binding, appId: 480, packaged: true, timers: fakeTimers() });
  assert.equal(started.relaunch, true);
  assert.deepEqual(binding.calls, [['restart', 480]]);
});

test('a packaged build started by Steam initialises it and takes the Steam adapter', () => {
  const binding = fakeBinding();
  const started = startSteam({ binding, appId: 480, packaged: true, timers: fakeTimers() });
  assert.equal(started.relaunch, false);
  assert.equal(started.adapter.kind, 'steam');
  assert.deepEqual(binding.calls.slice(0, 2), [['restart', 480], ['init', 480]]);
});

test('a development run never asks for a relaunch; it initialises with the local app id', () => {
  const binding = fakeBinding();
  const started = startSteam({ binding, appId: 480, packaged: false, timers: fakeTimers() });
  assert.equal(started.adapter.kind, 'steam');
  assert.deepEqual(binding.calls.slice(0, 1), [['init', 480]]);
});

test('when Steam does not initialise, the host takes the unavailable adapter', () => {
  const errors = [];
  const cases = [
    { binding: null, appId: 480 },
    { binding: fakeBinding(), appId: null },
    { binding: fakeBinding({ init: () => false }), appId: 480 },
    { binding: fakeBinding({ init: () => { throw new Error('init'); } }), appId: 480 },
    { binding: fakeBinding({ restartAppIfNecessary: () => { throw new Error('restart'); } }), appId: 480 },
  ];
  for (const c of cases) {
    const started = startSteam({ ...c, packaged: true, onError: (e) => errors.push(e.message), timers: fakeTimers() });
    assert.equal(started.relaunch, false);
    assert.equal(started.adapter.kind, 'unavailable');
    assert.deepEqual(adapterProblems(started.adapter), []);
  }
  assert.deepEqual(errors, ['init', 'restart']);
});

test('the app id: the build\'s file when packaged, the local app id file in development, else Steam\'s', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ms3d-steam-'));
  try {
    assert.equal(resolveAppId({ packaged: true, appDir: dir, env: {} }), null);
    assert.equal(resolveAppId({ packaged: true, appDir: dir, env: { SteamAppId: '480' } }), 480);
    writeFileSync(path.join(dir, STEAM_APP_FILE), JSON.stringify({ appId: '5517360' }));
    assert.equal(resolveAppId({ packaged: true, appDir: dir, env: { SteamAppId: '480' } }), 5517360);
    assert.equal(resolveAppId({ packaged: false, appDir: dir, env: {} }), null, 'development ignores the build\'s file');
    writeFileSync(path.join(dir, DEV_APP_ID_FILE), '480\n');
    assert.equal(resolveAppId({ packaged: false, appDir: dir, env: {} }), 480);
    writeFileSync(path.join(dir, DEV_APP_ID_FILE), 'not an id');
    assert.equal(resolveAppId({ packaged: false, appDir: dir, env: { SteamAppId: '0' } }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the Steam API library: beside the packaged executable, under desktop/redist/ in development', () => {
  assert.equal(steamLibraryPath({ packaged: true, exeDir: 'C:/game', appDir: 'C:/game/resources/app' }), path.join('C:/game', STEAM_API_LIBRARY));
  assert.equal(steamLibraryPath({ packaged: false, exeDir: 'C:/electron', appDir: 'C:/repo/desktop' }), path.join('C:/repo/desktop', 'redist', STEAM_API_LIBRARY));
  let required = 0;
  const require = () => { required += 1; return {}; };
  assert.equal(openSteamworks({ libraryPath: path.join(tmpdir(), 'no-such', STEAM_API_LIBRARY), require }), null);
  assert.equal(required, 0, 'with no library, the binding is never loaded');
});

test('the main process starts Steam before its window, exits on a relaunch and sets the overlay switches', () => {
  const main = readFileSync(path.join(ROOT, 'desktop', 'main.js'), 'utf8');
  assert.deepEqual([...OVERLAY_SWITCHES], ['in-process-gpu', 'disable-direct-composition', 'ui-disable-partial-swap']);
  assert.match(main, /for \(const name of OVERLAY_SWITCHES\) app\.commandLine\.appendSwitch\(name\)/);
  assert.match(main, /startSteam\(/);
  assert.ok(main.indexOf('startSteamAdapter()) {') < main.indexOf('app.whenReady()'), 'Steam starts before the window');
  assert.match(main, /else if \(!startSteamAdapter\(\)\) \{\s*app\.exit\(0\);/);
  assert.match(main, /createBridge\(\{ adapter,/);
  assert.match(main, /if \(!adapter\.capabilities\.overlay\) return;\s*const timer = setInterval\(\(\) => \{[^}]*webContents\.invalidate\(\)/,
    'with Steam running, the page keeps presenting frames so the overlay opens over a still page');
});
