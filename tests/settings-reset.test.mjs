import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { createReplayLibrary, LIBRARY_DOC } from '../js/replay/library.js';
import { LEGACY_KEYS } from '../js/settings/store.js';
import { createReset, RESET_KEYS, FIRST_USE_LEGACY_KEY } from '../js/settings/reset.js';

const raw = (version, data) => JSON.stringify({ version, data });
const bytes = (n) => new Uint8Array([n, n + 1, n + 2]);

// Every document the game keeps, and one this build does not know at a newer version.
const DOCUMENTS = {
  settings: raw(1, { theme: 'dark' }),
  records: raw(2, { bests: {} }),
  'records.history': raw(1, []),
  'records.inProgress': raw(1, { mode: '3d' }),
  'replays.library': raw(1, { entries: [] }),
  'shell.lastMode': raw(1, '3d'),
  'shell.firstUse': raw(1, { games: { '3d': 3 } }),
  'classic2d.lastChoice': raw(1, { size: 'expert' }),
  'mode3d.lastChoice': raw(1, { preset: 'medium' }),
  'some.later.document': raw(42, 'newer than this build'),
};
const UNREAD = { 'ms3d.custom': '{"X":5}', 'ms3d.best.10x10x10x99': '12.5', 'ms3d.lastPreset': 'medium' };

// A fake legacy key store over a Map: remove(key), with an optional key whose removal throws.
function fakeLegacy(initial, { failOn = null } = {}) {
  const map = new Map(Object.entries(initial));
  return {
    map,
    remove(key) {
      if (key === failOn) throw new Error('SecurityError');
      map.delete(key);
    },
  };
}

function fixture({ backend = {}, blobs = {}, legacy = {} } = {}) {
  const memory = createMemoryBackend({ initial: DOCUMENTS, ...backend });
  memory.aside.set('records', '{not json');
  const storage = createStorage({ backend: memory });
  const implementation = createMemoryBlobStore({ initial: { r1: bytes(1), r2: bytes(4), orphan: bytes(7) }, ...blobs });
  const blobStore = createBlobStore({ open: () => implementation, fallback: () => createMemoryBlobStore() });
  const keys = fakeLegacy({
    ...Object.fromEntries(Object.values(LEGACY_KEYS).map((k) => [k, '1'])),
    [FIRST_USE_LEGACY_KEY]: '1',
    ...UNREAD,
    'other-app': 'keep',
  }, legacy);
  const reloads = [];
  const reload = () => reloads.push({
    documents: memory.documents.size, aside: memory.aside.size, blobs: implementation.blobs.size, keys: [...keys.map.keys()],
  });
  return { memory, storage, implementation, blobStore, keys, reloads, reload };
}

test('the reset removes the four carried-over settings keys and the first-use key, and no other', () => {
  assert.deepEqual([...RESET_KEYS].sort(), [...Object.values(LEGACY_KEYS), 'ms3d.hintH.done'].sort());
  for (const key of Object.keys(UNREAD)) assert.ok(!RESET_KEYS.includes(key), `${key} stays`);
});

test('the reset clears every document, kept-aside copy, replay blob and legacy key, then reloads once', async () => {
  const f = fixture();
  const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
  assert.deepEqual(await reset.run(), { ok: true });
  assert.equal(f.reloads.length, 1, 'reloaded once');
  assert.deepEqual(f.reloads[0], {
    documents: 0, aside: 0, blobs: 0, keys: [...Object.keys(UNREAD), 'other-app'],
  }, 'everything was gone before the reload');
});

test('the reset waits for the replay library\'s start-up load before it clears', async () => {
  const f = fixture();
  let finishLoad;
  const libraryLoad = new Promise((resolve) => { finishLoad = resolve; });
  const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload, waitFor: () => libraryLoad });
  const running = reset.run();
  for (let i = 0; i < 10; i++) await Promise.resolve();
  assert.equal(f.memory.documents.size, Object.keys(DOCUMENTS).length, 'nothing cleared while the load runs');
  assert.equal(f.reloads.length, 0);
  // The library's reconciliation saves its index back as its load ends.
  await f.memory.write(LIBRARY_DOC, raw(1, { entries: [] }));
  finishLoad();
  assert.deepEqual(await running, { ok: true });
  assert.equal(f.memory.documents.has(LIBRARY_DOC), false, 'the index the load saved is cleared too');
});

test('a library load that fails does not stop the reset', async () => {
  const f = fixture();
  const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload, waitFor: () => Promise.reject(new Error('load')) });
  assert.deepEqual(await reset.run(), { ok: true });
  assert.equal(f.reloads.length, 1);
});

test('over a real replay library: its reconciliation cannot save the index back after the reset', async () => {
  const f = fixture();
  const library = createReplayLibrary({ storage: f.storage, blobStore: f.blobStore });
  library.load(); // the start-up load, not awaited, as js/main.js starts it
  const reset = createReset({
    storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload,
    waitFor: async () => { await library.load(); await library.settled(); },
  });
  assert.deepEqual(await reset.run(), { ok: true });
  await library.settled();
  assert.equal(f.memory.documents.size, 0);
  assert.equal(f.implementation.blobs.size, 0);
});

test('with storage unavailable for the session, the reset still clears what exists and reloads', async () => {
  const f = fixture({ backend: { available: false } });
  const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
  assert.deepEqual(await reset.run(), { ok: true });
  assert.equal(f.reloads.length, 1);
  assert.equal(f.memory.documents.size, 0);
});

test('documents that cannot be cleared: the failure is said, the rest is cleared, no reload', async () => {
  const f = fixture();
  const storage = { ...f.storage, clear: async () => ({ ok: false, reason: 'write-failed' }) };
  const reset = createReset({ storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
  const result = await reset.run();
  assert.equal(result.ok, false);
  assert.deepEqual(result.failed, ['documents']);
  assert.match(result.message, /^Records, game history, settings, last board choices and first-use hints could not be deleted\. The rest was deleted\.$/);
  assert.equal(f.reloads.length, 0);
  assert.equal(f.implementation.blobs.size, 0, 'the replays went');
  assert.deepEqual([...f.keys.map.keys()], [...Object.keys(UNREAD), 'other-app'], 'the keys went');
});

test('replays that cannot be listed or deleted: the failure is said, the rest is cleared, no reload', async () => {
  for (const blobs of [{ failReads: true }, { failWrites: true }]) {
    const f = fixture({ blobs });
    const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
    const result = await reset.run();
    assert.equal(result.ok, false);
    assert.deepEqual(result.failed, ['replays'], JSON.stringify(blobs));
    assert.equal(result.message, 'Replays could not be deleted. The rest was deleted.');
    assert.equal(f.reloads.length, 0);
    assert.equal(f.memory.documents.size, 0, 'the documents went');
  }
});

test('one blob that cannot be deleted is a failure; the others still go', async () => {
  const f = fixture();
  const blobStore = { list: () => f.blobStore.list(), delete: (name) => (name === 'r1' ? Promise.resolve({ ok: false, reason: 'write-failed' }) : f.blobStore.delete(name)) };
  const reset = createReset({ storage: f.storage, blobStore, legacy: f.keys, reload: f.reload });
  const result = await reset.run();
  assert.deepEqual(result.failed, ['replays']);
  assert.deepEqual([...f.implementation.blobs.keys()], ['r1']);
  assert.equal(f.reloads.length, 0);
});

test('a legacy key whose removal throws is a failure: the old settings stay, no reload', async () => {
  const f = fixture({ legacy: { failOn: 'ms3d.volume' } });
  const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
  const result = await reset.run();
  assert.deepEqual(result.failed, ['keys']);
  assert.equal(result.message, 'Old settings could not be deleted. The rest was deleted.');
  assert.equal(f.reloads.length, 0);
  assert.ok(!f.keys.map.has('ms3d.muted'), 'the other keys went');
});

test('when nothing could be deleted, the message names each part and claims nothing was', async () => {
  const f = fixture({ blobs: { failReads: true }, legacy: { failOn: 'ms3d.muted' } });
  const storage = { ...f.storage, clear: async () => ({ ok: false, reason: 'write-failed' }) };
  const reset = createReset({ storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
  const result = await reset.run();
  assert.deepEqual(result.failed, ['documents', 'replays', 'keys']);
  assert.doesNotMatch(result.message, /rest was deleted/);
  assert.equal(f.reloads.length, 0);
});

test('a second run can retry after a failure', async () => {
  const f = fixture({ legacy: { failOn: 'ms3d.volume' } });
  const reset = createReset({ storage: f.storage, blobStore: f.blobStore, legacy: f.keys, reload: f.reload });
  assert.equal((await reset.run()).ok, false);
  f.keys.remove = (key) => f.keys.map.delete(key);
  assert.deepEqual(await reset.run(), { ok: true });
  assert.equal(f.reloads.length, 1);
});

test('the default legacy remover touches only the given keys, and with no storage has nothing to remove', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const map = new Map([['ms3d.volume', '0.4'], ['ms3d.custom', 'x']]);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { removeItem: (k) => map.delete(k) } });
    const f = fixture();
    const reset = createReset({ storage: f.storage, blobStore: f.blobStore, reload: f.reload });
    assert.deepEqual(await reset.run(), { ok: true });
    assert.deepEqual([...map.keys()], ['ms3d.custom']);
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
    const g = fixture();
    assert.deepEqual(await createReset({ storage: g.storage, blobStore: g.blobStore, reload: g.reload }).run(), { ok: true });
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
});

test('the reset module is DOM-free apart from the default legacy remover', () => {
  const src = readFileSync(new URL('../js/settings/reset.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /\bwindow\b|\bdocument\.\w|\blocation\b/);
});
