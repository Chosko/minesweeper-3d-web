// The Steam build's storage (`steam-cloud-saves`): the document backend and the blob stores over the
// bridge's storage and blob requests, run against a fake bridge over the real file service of
// desktop/file-service.js in a temporary directory, and held to the same interface suites as the
// in-memory and browser implementations; the platform's selection of them and the quit flush.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStorage } from '../js/platform/storage.js';
import { createSteamBackend, createSaveTracker } from '../js/platform/steam-storage.js';
import { openSteamBlobStore, REPLAY_STORE } from '../js/platform/steam-blob-store.js';
import { selectPlatform, STEAM_SLOTS } from '../js/platform/index.js';
import { BRIDGE_GLOBAL, createBridgeClient } from '../js/platform/bridge-client.js';
import { BRIDGE_EVENTS, BRIDGE_REQUESTS, createBridge } from '../desktop/bridge.js';
import { createFileService, documentFile, storeDir } from '../desktop/file-service.js';
import { MACHINE_SETTINGS_DOC, MACHINE_SETTINGS_VERSION, SETTINGS_DOC } from '../js/settings/store.js';
import { storageSuite, blobStoreSuite } from './helpers/platform-suites.mjs';

const raw = (version, data) => JSON.stringify({ version, data });
const bytes = (...values) => new Uint8Array(values);
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const roots = [];
after(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** A fresh save directory: the file service over a temporary user-data directory. */
function saveDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'ms3d-steam-saves-'));
  roots.push(root);
  const files = createFileService({ root });
  mkdirSync(files.dir, { recursive: true });
  return files;
}

/**
 * The page's side of desktop/preload.js over the real bridge with the file service in its slots: a
 * promise per request rejecting with the typed error, a subscribe function per event. Requests in
 * `refuse` fail as a disk that refuses does; `hold(operation)` may delay a request.
 */
function fakeHost(files, { refuse = new Set(), hold = () => null } = {}) {
  const bridge = createBridge({ adapter: { kind: 'unavailable', capabilities: {} }, window: {}, closing: {} });
  for (const [operation, handler] of Object.entries({
    'storage.read': (name) => files.read(name),
    'storage.write': (name, text) => files.write(name, text),
    'storage.setAside': (name) => files.setAside(name),
    'storage.delete': (name) => files.deleteDocument(name),
    'storage.list': () => files.listDocuments(),
    'blobs.put': (store, key, data) => files.put(store, key, data),
    'blobs.get': (store, key) => files.get(store, key),
    'blobs.delete': (store, key) => files.delete(store, key),
    'blobs.list': (store) => files.list(store),
  })) bridge.register(operation, handler);
  const calls = [];
  const send = (operation) => async (...args) => {
    calls.push(operation);
    await hold(operation);
    if (refuse.has(operation)) throw { code: 'failed', message: 'Request failed' };
    const reply = await bridge.handle(operation, args);
    if (reply.ok) return reply.value;
    throw reply.error;
  };
  const host = {};
  for (const operation of Object.keys(BRIDGE_REQUESTS)) {
    const [group, name] = operation.split('.');
    host[group] ??= {};
    host[group][name] = send(operation);
  }
  const listeners = new Map(BRIDGE_EVENTS.map((event) => [event, new Set()]));
  host.events = Object.fromEntries(BRIDGE_EVENTS.map((event) => [event, (listener) => {
    listeners.get(event).add(listener);
    return () => listeners.get(event).delete(listener);
  }]));
  const emit = (event, payload = null) => { for (const listener of [...listeners.get(event)]) listener(payload); };
  return { host, calls, emit };
}

const textOf = (file) => (existsSync(file) ? readFileSync(file, 'utf8') : undefined);
const asideOf = (dir, name) => readdirSync(dir).filter((entry) => entry.startsWith(`${documentFile(name)}.aside-`)).sort();

// ---------------------------------------------------------------- the interface suites

storageSuite('Steam', ({ initial = {} } = {}) => {
  const files = saveDirectory();
  const docPath = (name) => join(files.dir, documentFile(name));
  for (const [name, text] of Object.entries(initial)) writeFileSync(docPath(name), text);
  const refuse = new Set();
  const { host } = fakeHost(files, { refuse });
  const requests = { read: 'storage.read', write: 'storage.write', keepAside: 'storage.setAside' };
  return {
    storage: STEAM_SLOTS.storage(createBridgeClient(host)),
    stored: (name) => textOf(docPath(name)),
    seed: (name, text) => writeFileSync(docPath(name), text),
    remove: (name) => rmSync(docPath(name)),
    aside: (name) => {
      const [first] = asideOf(files.dir, name);
      return first === undefined ? undefined : textOf(join(files.dir, first));
    },
    fail: (op) => refuse.add(requests[op]),
  };
});

blobStoreSuite('Steam', ({ initial = {}, failWrites = false, failReads = false } = {}) => {
  const files = saveDirectory();
  const folder = join(files.dir, storeDir(REPLAY_STORE));
  mkdirSync(folder, { recursive: true });
  for (const [name, data] of Object.entries(initial)) writeFileSync(join(folder, name), data);
  const refuse = new Set([
    ...(failWrites ? ['blobs.put', 'blobs.delete'] : []),
    ...(failReads ? ['blobs.get', 'blobs.list'] : []),
  ]);
  const { host } = fakeHost(files, { refuse });
  return {
    store: STEAM_SLOTS.blobStore(createBridgeClient(host)),
    stored: (name) => (existsSync(join(folder, name)) ? new Uint8Array(readFileSync(join(folder, name))) : undefined),
    names: () => readdirSync(folder),
  };
});

// ---------------------------------------------------------------- files in the save directory

test('each document is one text file of its version and data, and each blob one file in its store\'s directory', async () => {
  const files = saveDirectory();
  const client = createBridgeClient(fakeHost(files).host);
  const storage = STEAM_SLOTS.storage(client);
  storage.register('records.history', 2, { 1: (d) => d });
  assert.deepEqual(await storage.save('records.history', { games: [1] }), { ok: true });
  assert.equal(textOf(join(files.dir, 'records.history.json')), raw(2, { games: [1] }));

  const blobs = STEAM_SLOTS.blobStore(client);
  const id = '0f8e2c1a-5b7d-4e3f-9a6c-2d1b0e9f8a7c';
  assert.deepEqual(await blobs.put(id, bytes(1, 2, 3)), { ok: true });
  assert.deepEqual(new Uint8Array(readFileSync(join(files.dir, 'replays.blobs', id))), bytes(1, 2, 3));
  assert.deepEqual(readdirSync(files.dir).sort(), ['records.history.json', 'replays.blobs']);
});

test('a document file that will not parse is renamed aside with a dated suffix and loads as missing', async () => {
  const files = saveDirectory();
  writeFileSync(join(files.dir, 'settings.json'), '{"version": 1, "da');
  const storage = createStorage({ backend: createSteamBackend({ client: createBridgeClient(fakeHost(files).host) }) });
  const issues = [];
  storage.register('settings', 1, {}, { onIssue: (issue) => issues.push(issue) });
  assert.equal(await storage.load('settings'), undefined);
  assert.deepEqual(issues.map((issue) => issue.kind), ['corrupt']);
  const [aside, ...more] = asideOf(files.dir, 'settings');
  assert.match(aside, /^settings\.json\.aside-\d{8}-\d{6}$/);
  assert.deepEqual(more, []);
  assert.equal(existsSync(join(files.dir, 'settings.json')), false);
});

test('blob stores are opened by name, each a directory of its own, and the replay library\'s is the replay store', async () => {
  const files = saveDirectory();
  const client = createBridgeClient(fakeHost(files).host);
  const replays = openSteamBlobStore({ client, name: REPLAY_STORE });
  const outbox = openSteamBlobStore({ client, name: 'leaderboards.outbox' });
  await replays.put('same', bytes(1));
  await outbox.put('same', bytes(2));
  assert.deepEqual(await replays.get('same'), bytes(1));
  assert.deepEqual(await outbox.get('same'), bytes(2));
  assert.deepEqual(await outbox.list(), ['same']);
  await outbox.delete('same');
  assert.deepEqual(await outbox.list(), []);
  assert.deepEqual(await replays.list(), ['same']);
  assert.equal(await replays.get('missing'), undefined);
  assert.ok(existsSync(join(files.dir, storeDir(REPLAY_STORE), 'same')));
  assert.ok(existsSync(join(files.dir, storeDir('leaderboards.outbox'))));
});

// ---------------------------------------------------------------- availability and failure

test('documents and blobs persist without Steam, and a refused write is reported without turning availability off', async () => {
  const files = saveDirectory();
  const refuse = new Set();
  const client = createBridgeClient(fakeHost(files, { refuse }).host);
  const storage = STEAM_SLOTS.storage(client);
  const blobs = STEAM_SLOTS.blobStore(client);
  storage.register('doc', 1, {});
  assert.equal(storage.available(), true, 'the bridge\'s adapter is the unavailable one: Steam is not running');
  assert.equal(await blobs.available(), true);

  refuse.add('storage.write');
  const failed = await storage.save('doc', 1);
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'write-failed');
  assert.equal(failed.error.code, 'failed');
  assert.equal(storage.available(), true, 'a transient refusal never stops the owners saving');

  refuse.delete('storage.write');
  assert.deepEqual(await storage.save('doc', 2), { ok: true });
  assert.equal(await storage.load('doc'), 2, 'the next save reaches the disk');
});

test('a name the save directory refuses fails as a save, not as an unwritable directory', async () => {
  const files = saveDirectory();
  const storage = STEAM_SLOTS.storage(createBridgeClient(fakeHost(files).host));
  storage.register('con', 1, {});
  const result = await storage.save('con', 1);
  assert.equal(result.reason, 'write-failed');
  assert.equal(result.error.code, 'invalid');
  assert.equal(storage.available(), true);
});

test('the machine settings document is a file in the machine prefs directory, every other document one in the save directory', async () => {
  const files = saveDirectory();
  const storage = STEAM_SLOTS.storage(createBridgeClient(fakeHost(files).host));
  storage.register(MACHINE_SETTINGS_DOC, MACHINE_SETTINGS_VERSION);
  storage.register(SETTINGS_DOC, 2, { 1: (d) => d });
  assert.deepEqual(await storage.save(MACHINE_SETTINGS_DOC, { renderResolution: 1 }), { ok: true });
  assert.deepEqual(await storage.save(SETTINGS_DOC, { theme: 'joyful-tiles' }), { ok: true });
  assert.equal(textOf(join(files.prefsDir, documentFile(MACHINE_SETTINGS_DOC))), raw(MACHINE_SETTINGS_VERSION, { renderResolution: 1 }));
  assert.equal(existsSync(join(files.dir, documentFile(MACHINE_SETTINGS_DOC))), false, 'never in the synced save directory');
  assert.equal(textOf(join(files.dir, documentFile(SETTINGS_DOC))), raw(2, { theme: 'joyful-tiles' }));
  assert.deepEqual(await storage.load(MACHINE_SETTINGS_DOC), { renderResolution: 1 });
});

test('clear deletes every document file and kept-aside copy in both directories, and resolves ok', async () => {
  const files = saveDirectory();
  const { host, calls } = fakeHost(files);
  const storage = STEAM_SLOTS.storage(createBridgeClient(host));
  assert.deepEqual(await storage.clear(), { ok: true }, 'nothing to clear');
  writeFileSync(join(files.dir, 'settings.json'), raw(2, { a: 1 }));
  writeFileSync(join(files.dir, 'settings.json.aside-20261031-140509'), '{bad');
  writeFileSync(join(files.dir, 'records.json'), raw(1, {}));
  writeFileSync(join(files.dir, 'unregistered.json'), raw(1, {}));
  mkdirSync(files.prefsDir, { recursive: true });
  writeFileSync(join(files.prefsDir, documentFile(MACHINE_SETTINGS_DOC)), raw(1, {}));
  writeFileSync(join(files.prefsDir, `${documentFile(MACHINE_SETTINGS_DOC)}.aside-20261031-140509`), '{bad');
  mkdirSync(join(files.dir, storeDir(REPLAY_STORE)), { recursive: true });
  writeFileSync(join(files.dir, storeDir(REPLAY_STORE), 'r1'), 'replay');
  assert.deepEqual(await storage.clear(), { ok: true });
  assert.deepEqual(readdirSync(files.dir), [storeDir(REPLAY_STORE)], 'the replay store is the blob store\'s to clear');
  assert.deepEqual(readdirSync(files.prefsDir), []);
  assert.ok(calls.includes('storage.list') && calls.includes('storage.delete'));
});

test('clear fails only when an existing file cannot be deleted', async () => {
  const files = saveDirectory();
  writeFileSync(join(files.dir, 'settings.json'), raw(1, { a: 1 }));
  const refuse = new Set(['storage.delete']);
  const storage = STEAM_SLOTS.storage(createBridgeClient(fakeHost(files, { refuse }).host));
  const result = await storage.clear();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
  assert.equal(textOf(join(files.dir, 'settings.json')), raw(1, { a: 1 }));
  refuse.delete('storage.delete');
  assert.deepEqual(await storage.clear(), { ok: true });
  assert.equal(existsSync(join(files.dir, 'settings.json')), false);
});

test('the bridge client lists and deletes documents over the bridge\'s document requests', async () => {
  const files = saveDirectory();
  const client = createBridgeClient(fakeHost(files).host);
  await client.writeDocument('records', raw(1, {}));
  assert.deepEqual(await client.listDocuments(), ['records']);
  assert.equal(await client.deleteDocument('records'), null);
  assert.deepEqual(await client.listDocuments(), []);
});

// ---------------------------------------------------------------- selection

test('with the bridge the platform fills its storage and replay store slots with the Steam implementations', async () => {
  const files = saveDirectory();
  const { host } = fakeHost(files);
  const refused = () => { throw new Error('the browser implementation is not selected'); };
  const platform = selectPlatform({
    bridge: host,
    browser: { storage: refused, blobStore: refused, leaderboards: () => 'local leaderboards', achievements: () => 'local achievements' },
  });
  for (const fn of ['register', 'load', 'save', 'clear', 'available']) assert.equal(typeof platform.storage[fn], 'function', fn);
  platform.storage.register('shell.lastMode', 1);
  assert.deepEqual(await platform.storage.save('shell.lastMode', '3d'), { ok: true });
  assert.equal(textOf(join(files.dir, 'shell.lastMode.json')), raw(1, '3d'));
  assert.deepEqual(await platform.blobStore.put('r1', bytes(9)), { ok: true });
  assert.deepEqual(await platform.blobStore.list(), ['r1']);
  assert.ok(existsSync(join(files.dir, 'replays.blobs', 'r1')));
  assert.equal(platform.leaderboards, 'local leaderboards');
});

// ---------------------------------------------------------------- the quit flush

test('the save tracker settles once every request in flight, and every one it led to, has settled', async () => {
  const tracker = createSaveTracker();
  await tracker.settled();
  let release;
  const first = tracker.track(new Promise((resolve) => { release = resolve; }));
  let second;
  first.then(() => { second = tracker.track(Promise.reject(new Error('refused'))); second.catch(() => {}); });
  let done = false;
  const settling = tracker.settled().then(() => { done = true; });
  await tick();
  assert.equal(done, false);
  release();
  await settling;
  assert.ok(second, 'the request the first one led to was tracked before the tracker settled');
  assert.equal(await first, undefined, 'track hands the request back unchanged');
});

test('the host\'s flush request waits for a document save in flight before the page answers', async () => {
  const files = saveDirectory();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { host, calls, emit } = fakeHost(files, { hold: (operation) => (operation === 'storage.write' ? gate : null) });
  globalThis[BRIDGE_GLOBAL] = host;
  let platform;
  try {
    platform = await import('../js/platform/index.js?steam-flush');
  } finally {
    delete globalThis[BRIDGE_GLOBAL];
  }
  platform.register('flush.doc', 1);
  const saving = platform.save('flush.doc', { n: 1 });
  emit('flushRequested');
  for (let i = 0; i < 5; i += 1) await tick();
  assert.ok(calls.includes('storage.write'), 'the save reached its write');
  assert.equal(calls.includes('quit.handshake'), false, 'the page has not answered while the write is in flight');
  release();
  assert.deepEqual(await saving, { ok: true });
  for (let i = 0; i < 20 && !calls.includes('quit.handshake'); i += 1) await tick();
  assert.equal(calls.filter((op) => op === 'quit.handshake').length, 1);
  assert.equal(textOf(join(files.dir, 'flush.doc.json')), raw(1, { n: 1 }));
});

test('the host\'s flush request waits for a replay being stored', async () => {
  const files = saveDirectory();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const { host, calls, emit } = fakeHost(files, { hold: (operation) => (operation === 'blobs.put' ? gate : null) });
  globalThis[BRIDGE_GLOBAL] = host;
  let platform;
  try {
    platform = await import('../js/platform/index.js?steam-flush-blob');
  } finally {
    delete globalThis[BRIDGE_GLOBAL];
  }
  const putting = platform.blobStore.put('replay-9', bytes(4, 2));
  emit('flushRequested');
  for (let i = 0; i < 5; i += 1) await tick();
  assert.equal(calls.includes('quit.handshake'), false);
  release();
  assert.deepEqual(await putting, { ok: true });
  for (let i = 0; i < 20 && !calls.includes('quit.handshake'); i += 1) await tick();
  assert.ok(calls.includes('quit.handshake'));
});
