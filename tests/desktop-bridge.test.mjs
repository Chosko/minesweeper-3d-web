// The desktop host's Steam boundary (desktop/): the Steamworks capability adapter interface and its
// unavailable implementation, the page bridge's request validation and typed errors in the main
// process, and the preload's frozen object with its event fan-out — over a fake IPC that joins the
// preload to the bridge. Electron itself is never loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

import {
  ADAPTER_OPERATIONS, CAPABILITIES, ERROR_CODES, ERROR_MESSAGES, HostError, adapterProblems, toTypedError,
} from '../desktop/adapter/interface.js';
import { createUnavailableAdapter } from '../desktop/adapter/unavailable.js';
import {
  BRIDGE_EVENTS, BRIDGE_GLOBAL, BRIDGE_REQUESTS, EVENT_CHANNEL, LIMITS, PRE_PAINT_GLOBAL, REQUEST_CHANNEL, SLOT_REQUESTS,
  SPEC_CHANNEL, bridgeSpec, createBridge, validateRequest,
} from '../desktop/bridge.js';

const PRELOAD = fileURLToPath(new URL('../desktop/preload.js', import.meta.url));
const MAIN = fileURLToPath(new URL('../desktop/main.js', import.meta.url));

// --- fakes ---------------------------------------------------------------------------------------

/** A Steam adapter stand-in: every capability available, each call recorded and answered by `answers`. */
function fakeAdapter(answers = {}, { capabilities = {} } = {}) {
  const calls = [];
  const presence = new Set();
  const overlay = new Set();
  const adapter = {
    kind: 'steam',
    capabilities: Object.freeze(Object.fromEntries(CAPABILITIES.map((c) => [c, capabilities[c] ?? true]))),
    onPresenceChange(listener) { presence.add(listener); return () => presence.delete(listener); },
    onOverlayActivated(listener) { overlay.add(listener); return () => overlay.delete(listener); },
    shutdown: async () => { calls.push(['shutdown']); },
    firePresence(on) { for (const l of presence) l(on); },
    fireOverlay(on) { for (const l of overlay) l(on); },
    calls,
  };
  for (const ops of Object.values(ADAPTER_OPERATIONS)) {
    for (const op of ops) {
      if (adapter[op]) continue;
      adapter[op] = async (...args) => {
        calls.push([op, ...args]);
        const answer = answers[op];
        return typeof answer === 'function' ? answer(...args) : answer;
      };
    }
  }
  return adapter;
}

/** The window actions stand-in (task 84's `game.actions`). */
function fakeWindow() {
  const calls = [];
  const listeners = new Set();
  return {
    calls,
    minimise() { calls.push(['minimise']); },
    toggleFullscreen() { calls.push(['toggleFullscreen']); },
    setContentSize(w, h) { calls.push(['setContentSize', w, h]); },
    isFullscreen: () => false,
    onFullscreenChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    fire(on) { for (const l of listeners) l(on); },
  };
}

function fakeClosing() {
  const closing = { runs: 0, flushHook: null, shutdownHook: null };
  closing.setFlushHook = (hook) => { closing.flushHook = hook; };
  closing.setShutdownHook = (hook) => { closing.shutdownHook = hook; };
  closing.run = () => { closing.runs += 1; return Promise.resolve(); };
  return closing;
}

/** ipcMain, the game window's webContents and the preload's ipcRenderer, joined like Electron joins them. */
function fakeIpc() {
  const onHandlers = new Map();
  const invokeHandlers = new Map();
  const rendererListeners = new Map();
  const sent = [];
  const webContents = {
    destroyed: false,
    isDestroyed() { return this.destroyed; },
    send(channel, ...args) {
      sent.push([channel, ...args]);
      for (const l of rendererListeners.get(channel) ?? []) l({ sender: null }, ...args);
    },
  };
  const ipcMain = {
    on(channel, handler) { onHandlers.set(channel, handler); },
    handle(channel, handler) { invokeHandlers.set(channel, handler); },
    removeListener(channel, handler) { if (onHandlers.get(channel) === handler) onHandlers.delete(channel); },
    removeHandler(channel) { invokeHandlers.delete(channel); },
  };
  const ipcRenderer = {
    sender: webContents,
    sendSync(channel, ...args) {
      const event = { sender: this.sender, returnValue: undefined };
      onHandlers.get(channel)?.(event, ...args);
      return event.returnValue;
    },
    invoke(channel, ...args) {
      structuredClone(args);
      const handler = invokeHandlers.get(channel);
      if (!handler) return Promise.reject(new Error(`No handler registered for '${channel}'`));
      return Promise.resolve().then(() => handler({ sender: this.sender }, ...args));
    },
    on(channel, listener) {
      if (!rendererListeners.has(channel)) rendererListeners.set(channel, new Set());
      rendererListeners.get(channel).add(listener);
    },
  };
  return { ipcMain, ipcRenderer, webContents, sent, onHandlers, invokeHandlers };
}

/**
 * Runs desktop/preload.js against `ipcRenderer`, returning what it exposed by name. Its timers run
 * at once, an error thrown in one collected into `thrown` — the page's uncaught-error path.
 */
function runPreload(ipcRenderer, thrown = []) {
  const exposed = {};
  const contextBridge = { exposeInMainWorld(name, api) { exposed[name] = api; } };
  const require = (id) => {
    if (id !== 'electron') throw new Error(`the preload may require only electron, not ${id}`);
    return { contextBridge, ipcRenderer };
  };
  const timer = (fn) => { try { fn(); } catch (error) { thrown.push(error); } };
  const run = vm.compileFunction(readFileSync(PRELOAD, 'utf8'), ['require', 'setTimeout'], { filename: PRELOAD });
  run(require, timer);
  return exposed;
}

/** A bridge attached to a fake IPC, its preload run: the page's object and every stand-in. */
function connected({ adapter = fakeAdapter(), window = fakeWindow(), closing = fakeClosing() } = {}) {
  const ipc = fakeIpc();
  const bridge = createBridge({ adapter, window, closing });
  bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
  const thrown = [];
  const host = runPreload(ipc.ipcRenderer, thrown)[BRIDGE_GLOBAL];
  return { ipc, bridge, host, adapter, window, closing, thrown };
}

const call = (host, operation, ...args) => operation.split('.').reduce((o, k) => o[k], host)(...args);
const rejection = (promise) => promise.then(
  (value) => assert.fail(`resolved with ${JSON.stringify(value)}`),
  (error) => error,
);

// --- the adapter interface ------------------------------------------------------------------------

test('the adapter interface names six capabilities and the operations each carries', () => {
  assert.deepEqual([...CAPABILITIES], ['identity', 'presence', 'achievements', 'leaderboards', 'sharedFiles', 'overlay']);
  assert.deepEqual(Object.keys(ADAPTER_OPERATIONS), [...CAPABILITIES]);
  assert.ok(Object.isFrozen(CAPABILITIES) && Object.isFrozen(ADAPTER_OPERATIONS));
  for (const ops of Object.values(ADAPTER_OPERATIONS)) assert.ok(Object.isFrozen(ops) && ops.length > 0);
  assert.deepEqual([...ADAPTER_OPERATIONS.identity], ['player', 'personaNames']);
  assert.deepEqual([...ADAPTER_OPERATIONS.presence], ['loggedOn', 'onPresenceChange']);
  assert.deepEqual([...ADAPTER_OPERATIONS.achievements], ['setAchievement', 'storeStats', 'achievementsSet']);
  assert.deepEqual([...ADAPTER_OPERATIONS.leaderboards], ['findLeaderboard', 'uploadScore', 'downloadScores', 'downloadScoresForPlayers']);
  assert.deepEqual([...ADAPTER_OPERATIONS.sharedFiles], ['writeAndShare', 'downloadShared', 'attachToLeaderboard']);
  assert.deepEqual([...ADAPTER_OPERATIONS.overlay], ['onOverlayActivated']);
});

test('the typed errors: five codes, each a HostError carrying its code; anything else reads as failed', () => {
  assert.deepEqual([...ERROR_CODES], ['unavailable', 'offline', 'not-found', 'invalid', 'failed']);
  assert.equal(ERROR_MESSAGES.unavailable, 'Steam unavailable');
  for (const code of ERROR_CODES) {
    const error = new HostError(code);
    assert.ok(error instanceof Error);
    assert.equal(error.code, code);
    assert.equal(error.message, ERROR_MESSAGES[code]);
    assert.deepEqual(toTypedError(error), { code, message: ERROR_MESSAGES[code] });
  }
  assert.deepEqual(toTypedError(new HostError('offline', 'no network')), { code: 'offline', message: 'no network' });
  assert.deepEqual(toTypedError(new Error('boom')), { code: 'failed', message: ERROR_MESSAGES.failed });
  assert.deepEqual(toTypedError(Object.assign(new Error('x'), { code: 'ENOENT' })), { code: 'failed', message: ERROR_MESSAGES.failed });
  assert.deepEqual(toTypedError('nope'), { code: 'failed', message: ERROR_MESSAGES.failed });
  assert.throws(() => new HostError('weird'), /typed error/);
});

test('adapterProblems names what an adapter lacks', () => {
  assert.deepEqual(adapterProblems(fakeAdapter()), []);
  const broken = fakeAdapter();
  delete broken.uploadScore;
  assert.deepEqual(adapterProblems({ ...broken, capabilities: { ...broken.capabilities, overlay: 'yes' } }),
    ['uploadScore is not a function', 'capability overlay is not a boolean']);
  assert.ok(adapterProblems({}).includes('kind is not a string'));
});

// --- the unavailable adapter ----------------------------------------------------------------------

test('the unavailable adapter reports every capability unavailable and rejects every call with unavailable', async () => {
  const adapter = createUnavailableAdapter();
  assert.deepEqual(adapterProblems(adapter), []);
  assert.equal(adapter.kind, 'unavailable');
  assert.ok(Object.isFrozen(adapter) && Object.isFrozen(adapter.capabilities));
  assert.deepEqual({ ...adapter.capabilities }, Object.fromEntries(CAPABILITIES.map((c) => [c, false])));
  for (const ops of Object.values(ADAPTER_OPERATIONS)) {
    for (const op of ops) {
      if (op.startsWith('on')) continue;
      const error = await rejection(adapter[op]('x'));
      assert.ok(error instanceof HostError, op);
      assert.equal(error.code, 'unavailable', op);
      assert.equal(error.message, 'Steam unavailable', op);
    }
  }
  const off = adapter.onPresenceChange(() => assert.fail('never fires'));
  assert.equal(typeof off, 'function');
  off();
  assert.equal(typeof adapter.onOverlayActivated(() => {}), 'function');
  assert.equal(await adapter.shutdown(), undefined);
});

// --- the request list and validation --------------------------------------------------------------

test('the bridge carries exactly the document\'s requests and events, and no general file or process access', () => {
  assert.deepEqual(Object.keys(BRIDGE_REQUESTS), [
    'steam.state',
    'achievements.set', 'achievements.store', 'achievements.read',
    'leaderboards.find', 'leaderboards.upload', 'leaderboards.download', 'leaderboards.attach',
    'sharedFiles.writeAndShare', 'sharedFiles.download',
    'storage.read', 'storage.write', 'storage.setAside', 'storage.delete', 'storage.list',
    'blobs.put', 'blobs.get', 'blobs.delete', 'blobs.list',
    'quit.handshake', 'quit.request',
    'window.minimise', 'window.toggleFullscreen', 'window.setContentSize',
  ]);
  assert.deepEqual([...SLOT_REQUESTS], [
    'storage.read', 'storage.write', 'storage.setAside', 'storage.delete', 'storage.list',
    'blobs.put', 'blobs.get', 'blobs.delete', 'blobs.list',
  ]);
  assert.deepEqual([...BRIDGE_EVENTS], ['steamStateChanged', 'overlayActivated', 'flushRequested', 'fullscreenChanged']);
  assert.ok(Object.isFrozen(BRIDGE_REQUESTS) && Object.isFrozen(BRIDGE_EVENTS) && Object.isFrozen(SLOT_REQUESTS));
  const spec = bridgeSpec();
  assert.deepEqual(spec, {
    global: BRIDGE_GLOBAL,
    channels: { request: REQUEST_CHANNEL, event: EVENT_CHANNEL },
    requests: Object.keys(BRIDGE_REQUESTS),
    events: [...BRIDGE_EVENTS],
    prePaint: { global: PRE_PAINT_GLOBAL, theme: null },
  });
  assert.deepEqual(bridgeSpec({ prePaintTheme: 'joyful-tiles' }).prePaint, { global: PRE_PAINT_GLOBAL, theme: 'joyful-tiles' });
  for (const name of spec.requests) assert.doesNotMatch(name, /\b(fs|file|path|exec|spawn|process|shell|require|eval)\b/i);
});

test('validation refuses an unknown operation, a wrong argument count, wrong types and oversized values', () => {
  const invalid = (operation, args) => assert.throws(() => validateRequest(operation, args),
    (e) => e instanceof HostError && e.code === 'invalid', `${operation} ${JSON.stringify(args)}`);
  invalid('fs.readFile', ['C:/x']);
  invalid('__proto__', []);
  invalid('constructor', []);
  invalid('toString', []);
  invalid(42, []);
  invalid('steam.state', ['extra']);
  invalid('steam.state', 'not an array');
  invalid('achievements.set', []);
  invalid('achievements.set', [7]);
  invalid('achievements.set', ['']);
  invalid('achievements.set', ['a'.repeat(LIMITS.name + 1)]);
  invalid('achievements.read', ['WIN']);
  invalid('achievements.read', [[1]]);
  invalid('achievements.read', [Array(LIMITS.names + 1).fill('A')]);
  invalid('leaderboards.upload', ['123', 1.5, []]);
  invalid('leaderboards.upload', ['123', 2 ** 31, []]);
  invalid('leaderboards.upload', ['123', 10, Array(LIMITS.details + 1).fill(0)]);
  invalid('leaderboards.upload', ['123', 10, ['1']]);
  invalid('leaderboards.upload', ['', 10, []]);
  invalid('leaderboards.download', ['123', { scope: 'everyone', start: 1, end: 10 }]);
  invalid('leaderboards.download', ['123', { scope: 'global', start: 0, end: 10 }]);
  invalid('leaderboards.download', ['123', { scope: 'global', start: 10, end: 1 }]);
  invalid('leaderboards.download', ['123', { scope: 'global', start: 1, end: LIMITS.entries + 1 }]);
  invalid('leaderboards.download', ['123', { scope: 'global', start: 1, end: 10, extra: 1 }]);
  invalid('leaderboards.download', ['123', { scope: 'players', players: ['abc'] }]);
  invalid('leaderboards.download', ['123', { scope: 'players', players: Array(LIMITS.players + 1).fill('1') }]);
  invalid('leaderboards.download', ['123', null]);
  invalid('sharedFiles.writeAndShare', ['replay.bin', 'text']);
  invalid('sharedFiles.writeAndShare', ['replay.bin', new Uint8Array(LIMITS.sharedFileBytes + 1)]);
  invalid('storage.write', ['settings', 5]);
  invalid('storage.write', ['settings', 'x'.repeat(LIMITS.documentChars + 1)]);
  invalid('storage.delete', []);
  invalid('storage.delete', [5]);
  invalid('storage.delete', ['']);
  invalid('storage.list', ['settings']);
  invalid('blobs.put', ['replays', 'k', new Uint8Array(LIMITS.blobBytes + 1)]);
  invalid('window.setContentSize', [0, 600]);
  invalid('window.setContentSize', [800, -1]);
  invalid('window.setContentSize', [800.5, 600]);
  invalid('window.setContentSize', ['800', 600]);
  invalid('window.setContentSize', [LIMITS.contentSize + 1, 600]);
  invalid('window.setContentSize', [800]);
});

test('validation passes well-formed requests through', () => {
  assert.deepEqual(validateRequest('steam.state', []), []);
  assert.deepEqual(validateRequest('achievements.read', [['A', 'B']]), [['A', 'B']]);
  assert.deepEqual(validateRequest('leaderboards.upload', ['123', -5, [1, 2, 3]]), ['123', -5, [1, 2, 3]]);
  assert.deepEqual(validateRequest('leaderboards.download', ['9', { scope: 'around', start: -4, end: 5 }]),
    ['9', { scope: 'around', start: -4, end: 5 }]);
  assert.deepEqual(validateRequest('leaderboards.download', ['9', { scope: 'players', players: ['76561197960287930'] }]),
    ['9', { scope: 'players', players: ['76561197960287930'] }]);
  assert.deepEqual(validateRequest('storage.write', ['settings', '']), ['settings', '']);
  assert.deepEqual(validateRequest('storage.delete', ['settings']), ['settings']);
  assert.deepEqual(validateRequest('storage.list', []), []);
  const bytes = new Uint8Array([1, 2, 3]);
  assert.deepEqual(validateRequest('blobs.put', ['replays', 'k', bytes]), ['replays', 'k', bytes]);
  assert.deepEqual(validateRequest('window.setContentSize', [1, LIMITS.contentSize]), [1, LIMITS.contentSize]);
});

// --- the bridge in the main process ---------------------------------------------------------------

test('every request resolves with its result or a typed error, and an adapter that throws still answers', async () => {
  const adapter = fakeAdapter({
    findLeaderboard: (name) => (name === 'missing' ? Promise.reject(new HostError('not-found')) : '77'),
    uploadScore: () => { throw new Error('binding blew up'); },
    downloadScores: () => Promise.reject(new HostError('offline')),
  });
  const bridge = createBridge({ adapter, window: fakeWindow(), closing: fakeClosing() });
  assert.deepEqual(await bridge.handle('leaderboards.find', ['Classic Expert']), { ok: true, value: '77' });
  assert.deepEqual(await bridge.handle('leaderboards.find', ['missing']),
    { ok: false, error: { code: 'not-found', message: ERROR_MESSAGES['not-found'] } });
  assert.deepEqual(await bridge.handle('leaderboards.upload', ['77', 100, []]),
    { ok: false, error: { code: 'failed', message: ERROR_MESSAGES.failed } });
  assert.deepEqual(await bridge.handle('leaderboards.download', ['77', { scope: 'global', start: 1, end: 10 }]),
    { ok: false, error: { code: 'offline', message: ERROR_MESSAGES.offline } });
  assert.deepEqual(await bridge.handle('nope', []), { ok: false, error: { code: 'invalid', message: ERROR_MESSAGES.invalid } });
  assert.deepEqual(await bridge.handle('achievements.set', [42]),
    { ok: false, error: { code: 'invalid', message: ERROR_MESSAGES.invalid } });
  assert.ok(!adapter.calls.some(([op]) => op === 'setAchievement'), 'an invalid request never reaches the adapter');
});

test('requests reach the adapter operation they name', async () => {
  const adapter = fakeAdapter({ achievementsSet: ['A'], downloadScores: [], downloadScoresForPlayers: [], downloadShared: new Uint8Array([9]) });
  const bridge = createBridge({ adapter, window: fakeWindow(), closing: fakeClosing() });
  const bytes = new Uint8Array([1, 2]);
  await bridge.handle('achievements.set', ['WIN']);
  await bridge.handle('achievements.store', []);
  assert.deepEqual(await bridge.handle('achievements.read', [['A', 'B']]), { ok: true, value: ['A'] });
  await bridge.handle('leaderboards.upload', ['77', 100, [1]]);
  await bridge.handle('leaderboards.download', ['77', { scope: 'friends', start: 1, end: 20 }]);
  await bridge.handle('leaderboards.download', ['77', { scope: 'players', players: ['5'] }]);
  await bridge.handle('leaderboards.attach', ['77', '88']);
  await bridge.handle('sharedFiles.writeAndShare', ['r.bin', bytes]);
  assert.deepEqual(await bridge.handle('sharedFiles.download', ['88']), { ok: true, value: new Uint8Array([9]) });
  assert.deepEqual(adapter.calls, [
    ['setAchievement', 'WIN'],
    ['storeStats'],
    ['achievementsSet', ['A', 'B']],
    ['uploadScore', '77', 100, [1]],
    ['downloadScores', '77', { scope: 'friends', start: 1, end: 20 }],
    ['downloadScoresForPlayers', '77', ['5']],
    ['attachToLeaderboard', '77', '88'],
    ['writeAndShare', 'r.bin', bytes],
    ['downloadShared', '88'],
  ]);
});

test('a capability the adapter reports unavailable rejects with unavailable without calling it', async () => {
  const adapter = fakeAdapter({}, { capabilities: { leaderboards: false } });
  const bridge = createBridge({ adapter, window: fakeWindow(), closing: fakeClosing() });
  assert.deepEqual(await bridge.handle('leaderboards.find', ['x']),
    { ok: false, error: { code: 'unavailable', message: 'Steam unavailable' } });
  assert.equal(adapter.calls.length, 0);
});

test('the Steam state: the unavailable adapter, and a logged-on player', async () => {
  const off = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing() });
  assert.deepEqual(await off.handle('steam.state', []), {
    ok: true,
    value: { adapter: 'unavailable', loggedOn: false, player: null, capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c, false])) },
  });
  const on = createBridge({
    adapter: fakeAdapter({ loggedOn: true, player: { steamId: '7', name: 'Ann' } }),
    window: fakeWindow(), closing: fakeClosing(),
  });
  assert.deepEqual(await on.steamState(), {
    adapter: 'steam', loggedOn: true, player: { steamId: '7', name: 'Ann' },
    capabilities: Object.fromEntries(CAPABILITIES.map((c) => [c, true])),
  });
  const failing = createBridge({
    adapter: fakeAdapter({ loggedOn: () => { throw new Error('x'); }, player: () => Promise.reject(new Error('y')) }),
    window: fakeWindow(), closing: fakeClosing(),
  });
  const state = await failing.steamState();
  assert.equal(state.loggedOn, false);
  assert.equal(state.player, null);
});

test('the storage and blob slots reject with unavailable until a handler is registered, and only they register', async () => {
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing() });
  for (const operation of SLOT_REQUESTS) {
    const args = { 'storage.write': ['settings', '{}'], 'storage.list': [], 'blobs.put': ['replays', 'k', new Uint8Array(1)] }[operation]
      ?? (operation.startsWith('blobs.') && operation !== 'blobs.list' ? ['replays', 'k'] : ['settings']);
    assert.deepEqual(await bridge.handle(operation, args),
      { ok: false, error: { code: 'unavailable', message: ERROR_MESSAGES.unavailable } }, operation);
  }
  const seen = [];
  bridge.register('storage.read', async (name) => { seen.push(name); return '{"a":1}'; });
  assert.deepEqual(await bridge.handle('storage.read', ['settings']), { ok: true, value: '{"a":1}' });
  assert.deepEqual(await bridge.handle('storage.read', ['../x'.repeat(100)]),
    { ok: false, error: { code: 'invalid', message: ERROR_MESSAGES.invalid } });
  assert.deepEqual(seen, ['settings']);
  bridge.register('blobs.get', () => { throw new HostError('not-found'); });
  assert.deepEqual(await bridge.handle('blobs.get', ['replays', 'k']),
    { ok: false, error: { code: 'not-found', message: ERROR_MESSAGES['not-found'] } });
  assert.throws(() => bridge.register('steam.state', () => {}), /slot/);
  assert.throws(() => bridge.register('fs.read', () => {}), /slot/);
  assert.throws(() => bridge.register('storage.read', 'not a function'), /function/);
});

test('the window actions call the game window, a content size as two bounded positive integers', async () => {
  const window = fakeWindow();
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window, closing: fakeClosing() });
  assert.deepEqual(await bridge.handle('window.minimise', []), { ok: true, value: null });
  assert.deepEqual(await bridge.handle('window.toggleFullscreen', []), { ok: true, value: null });
  assert.deepEqual(await bridge.handle('window.setContentSize', [960, 640]), { ok: true, value: null });
  assert.equal((await bridge.handle('window.setContentSize', [960, 0])).error.code, 'invalid');
  assert.deepEqual(window.calls, [['minimise'], ['toggleFullscreen'], ['setContentSize', 960, 640]]);
});

test('quit over the bridge runs the closing sequence; the hand-shake answers a flush request', async () => {
  const ipc = fakeIpc();
  const closing = fakeClosing();
  const adapter = fakeAdapter();
  const bridge = createBridge({ adapter, window: fakeWindow(), closing });
  bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
  assert.deepEqual(await bridge.handle('quit.request', []), { ok: true, value: null });
  assert.equal(closing.runs, 1);

  assert.equal(typeof closing.flushHook, 'function', 'the bridge sets the closing flush hook');
  let flushed = false;
  const flush = closing.flushHook().then(() => { flushed = true; });
  assert.deepEqual(ipc.sent.at(-1), [EVENT_CHANNEL, 'flushRequested', null]);
  await new Promise((r) => setImmediate(r));
  assert.equal(flushed, false, 'the flush waits for the page');
  assert.deepEqual(await bridge.handle('quit.handshake', []), { ok: true, value: null });
  await flush;
  assert.equal(flushed, true);
  assert.deepEqual(await bridge.handle('quit.handshake', []), { ok: true, value: null }, 'a stray hand-shake is harmless');

  await closing.shutdownHook();
  assert.deepEqual(adapter.calls.at(-1), ['shutdown'], 'shutting down shuts the adapter down');

  ipc.webContents.destroyed = true;
  const sent = ipc.sent.length;
  await closing.flushHook();
  assert.equal(ipc.sent.length, sent, 'with the window gone there is no page to flush');
});

test('the main process answers only the game window, and never throws to it', async () => {
  const ipc = fakeIpc();
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing() });
  bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
  const request = ipc.invokeHandlers.get(REQUEST_CHANNEL);
  assert.deepEqual(await request({ sender: {} }, 'steam.state', []),
    { ok: false, error: { code: 'invalid', message: ERROR_MESSAGES.invalid } });
  const event = { sender: {}, returnValue: 'unset' };
  ipc.onHandlers.get(SPEC_CHANNEL)(event);
  assert.equal(event.returnValue, null, 'another sender gets no bridge');
  assert.equal((await request({ sender: ipc.webContents }, 'steam.state', [])).ok, true);
  assert.equal((await request({ sender: ipc.webContents }, 'steam.state', undefined)).error.code, 'invalid');
});

test('attach wires events to the page and detach removes every handler', async () => {
  const { ipc, bridge, adapter, window } = connected();
  window.fire(true);
  adapter.fireOverlay(true);
  adapter.firePresence(false);
  await new Promise((r) => setImmediate(r));
  const events = ipc.sent.filter(([c]) => c === EVENT_CHANNEL).map(([, name, payload]) => [name, payload]);
  assert.deepEqual(events.slice(0, 2), [['fullscreenChanged', true], ['overlayActivated', true]]);
  assert.equal(events[2][0], 'steamStateChanged');
  assert.equal(events[2][1].adapter, 'steam');
  bridge.detach();
  assert.equal(ipc.invokeHandlers.size, 0);
  assert.equal(ipc.onHandlers.size, 0);
  const before = ipc.sent.length;
  window.fire(false);
  adapter.fireOverlay(false);
  assert.equal(ipc.sent.length, before);
  ipc.webContents.destroyed = true;
  bridge.emit('overlayActivated', true);
  assert.equal(ipc.sent.length, before, 'nothing is sent to a destroyed window');
  assert.throws(() => bridge.emit('somethingElse', 1), /event/);
});

// --- the preload ----------------------------------------------------------------------------------

test('the preload exposes one deeply frozen object with exactly the request list and the events', () => {
  const ipc = fakeIpc();
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing() });
  bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
  const exposed = runPreload(ipc.ipcRenderer);
  assert.deepEqual(Object.keys(exposed), [BRIDGE_GLOBAL, PRE_PAINT_GLOBAL]);
  const host = exposed[BRIDGE_GLOBAL];
  assert.ok(Object.isFrozen(host));
  const requests = [];
  for (const [group, members] of Object.entries(host)) {
    assert.ok(Object.isFrozen(members), group);
    if (group === 'events') continue;
    for (const [name, fn] of Object.entries(members)) {
      assert.equal(typeof fn, 'function');
      requests.push(`${group}.${name}`);
    }
  }
  assert.deepEqual(requests, Object.keys(BRIDGE_REQUESTS));
  assert.deepEqual(Object.keys(host.events), [...BRIDGE_EVENTS]);
});

test('the preload hands the page the theme id the main process read, frozen beside the bridge, or null for none', () => {
  const handOver = (prePaintTheme) => {
    const ipc = fakeIpc();
    const bridge = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing(), prePaintTheme });
    bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
    return runPreload(ipc.ipcRenderer)[PRE_PAINT_GLOBAL];
  };
  for (const theme of ['joyful-tiles', null]) {
    const prePaint = handOver(() => theme);
    assert.deepEqual(prePaint, { theme });
    assert.ok(Object.isFrozen(prePaint));
  }
  assert.deepEqual(handOver(() => 42), { theme: null }, 'anything but a string hands over none');
  assert.deepEqual(handOver(() => { throw new Error('unreadable'); }), { theme: null }, 'a reader that throws hands over none');
});

test('every page load reads the stored theme afresh, so a reload paints in the file\'s current theme', () => {
  const ipc = fakeIpc();
  let stored = 'joyful-tiles';
  let reads = 0;
  const prePaintTheme = () => { reads += 1; return stored; };
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing(), prePaintTheme });
  bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
  assert.equal(reads, 0, 'nothing is read before the page asks');
  assert.deepEqual(runPreload(ipc.ipcRenderer)[PRE_PAINT_GLOBAL], { theme: 'joyful-tiles' });
  stored = null; // Reset all data removed the settings document, then reloaded
  assert.deepEqual(runPreload(ipc.ipcRenderer)[PRE_PAINT_GLOBAL], { theme: null });
  assert.equal(reads, 2);
});

test('the preload exposes nothing when the main process offers no bridge', () => {
  const ipc = fakeIpc();
  assert.deepEqual(runPreload(ipc.ipcRenderer), {});
});

test('the preload\'s requests resolve with values and reject with typed errors, never throwing', async () => {
  const adapter = fakeAdapter({ findLeaderboard: '77', achievementsSet: () => Promise.reject(new HostError('offline')) });
  const { host, window } = connected({ adapter });
  assert.equal(await call(host, 'leaderboards.find', 'Classic Expert'), '77');
  assert.deepEqual(await rejection(call(host, 'achievements.read', ['A'])), { code: 'offline', message: ERROR_MESSAGES.offline });
  assert.deepEqual(await rejection(call(host, 'achievements.set', 7)), { code: 'invalid', message: ERROR_MESSAGES.invalid });
  assert.deepEqual(await rejection(call(host, 'achievements.set', () => {})), { code: 'failed', message: ERROR_MESSAGES.failed },
    'an argument IPC cannot carry rejects instead of throwing');
  assert.equal(await call(host, 'window.setContentSize', 1024, 700), null);
  assert.deepEqual(window.calls, [['setContentSize', 1024, 700]]);
  assert.equal((await call(host, 'steam.state')).adapter, 'steam');
});

test('the preload rejects with failed when the main process stops answering', async () => {
  const ipc = fakeIpc();
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: fakeWindow(), closing: fakeClosing() });
  bridge.attach({ ipcMain: ipc.ipcMain, webContents: ipc.webContents });
  const host = runPreload(ipc.ipcRenderer)[BRIDGE_GLOBAL];
  bridge.detach();
  assert.deepEqual(await rejection(host.steam.state()), { code: 'failed', message: ERROR_MESSAGES.failed });
});

test('the preload fans each event out to its listeners, a throwing listener sparing the others', async () => {
  const { host, adapter, window, bridge, thrown } = connected();
  const got = [];
  const offA = host.events.fullscreenChanged((on) => got.push(['a', on]));
  host.events.fullscreenChanged(() => { throw new Error('page bug'); });
  host.events.fullscreenChanged((on) => got.push(['b', on]));
  host.events.overlayActivated((on) => got.push(['overlay', on]));
  host.events.flushRequested((payload) => got.push(['flush', payload]));
  host.events.steamStateChanged((state) => got.push(['state', state.adapter]));
  window.fire(true);
  offA();
  window.fire(false);
  adapter.fireOverlay(true);
  bridge.requestFlush();
  adapter.firePresence(true);
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(got, [['a', true], ['b', true], ['b', false], ['overlay', true], ['flush', null], ['state', 'steam']]);
  assert.deepEqual(thrown.map((e) => e.message), ['page bug', 'page bug'], 'a throwing listener is reported, not swallowed');
  assert.equal(typeof host.events.overlayActivated('not a function'), 'function');
});

test('the preload ignores events outside the fixed list', () => {
  const { host, ipc } = connected();
  const got = [];
  host.events.overlayActivated((v) => got.push(v));
  ipc.webContents.send(EVENT_CHANNEL, 'shell', 'rm -rf');
  ipc.webContents.send(EVENT_CHANNEL, 'overlayActivated', true);
  assert.deepEqual(got, [true]);
});

// --- main.js wiring --------------------------------------------------------------------------------

test('the main process selects the unavailable adapter, loads the preload and attaches the bridge', () => {
  const source = readFileSync(MAIN, 'utf8');
  assert.match(source, /createUnavailableAdapter\(\)/);
  assert.match(source, /preload: path\.join\(HERE, 'preload\.js'\)/);
  assert.match(source, /createBridge\(\{[^}]*adapter[^}]*window: game\.actions[^}]*closing[^}]*\}\)/s);
  assert.match(source, /\.attach\(\{ ipcMain, webContents: game\.win\.webContents \}\)/);
  assert.ok(source.indexOf('.attach(') < source.indexOf('loadURL('), 'the bridge is attached before the page loads');
});
