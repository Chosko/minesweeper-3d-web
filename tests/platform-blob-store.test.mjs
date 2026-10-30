import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { openIndexedDBBlobStore, DB_NAME, STORE_NAME } from '../js/platform/indexeddb-blob-store.js';
import { blobStoreSuite } from './helpers/platform-suites.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bytes = (...values) => new Uint8Array(values);

// ---------------------------------------------------------------- the interface suite

blobStoreSuite('in memory', (options) => {
  const impl = createMemoryBlobStore(options);
  const store = createBlobStore({ open: () => impl, fallback: () => createMemoryBlobStore() });
  return { store, stored: (name) => impl.blobs.get(name), names: () => [...impl.blobs.keys()] };
});

test('the in-memory implementation exposes its blobs for tests and can be seeded', () => {
  const impl = createMemoryBlobStore({ initial: { seeded: bytes(4, 5) } });
  assert.ok(impl.blobs instanceof Map);
  assert.deepEqual(impl.blobs.get('seeded'), bytes(4, 5));
});

// ---------------------------------------------------------------- start-up selection

for (const [label, open] of [
  ['open rejects', () => Promise.reject(new Error('refused'))],
  ['open throws', () => { throw new Error('refused'); }],
  ['open gives nothing', () => null],
]) {
  test(`when ${label}, the in-memory fallback is used and the store does not persist`, async () => {
    let fallbacks = 0;
    const store = createBlobStore({
      open,
      fallback: () => { fallbacks += 1; return createMemoryBlobStore(); },
    });
    assert.equal(await store.available(), false);
    assert.deepEqual(await store.put('x', bytes(1, 2)), { ok: true });
    assert.deepEqual(await store.get('x'), bytes(1, 2));
    assert.deepEqual(await store.list(), ['x']);
    assert.equal(fallbacks, 1);
  });
}

test('the implementation is opened once, at creation, and calls made meanwhile wait for it', async () => {
  let opens = 0;
  let resolveOpen;
  const impl = createMemoryBlobStore();
  const store = createBlobStore({
    open: () => { opens += 1; return new Promise((resolve) => { resolveOpen = resolve; }); },
    fallback: () => createMemoryBlobStore(),
  });
  assert.equal(opens, 1);
  const put = store.put('early', bytes(7));
  const list = store.list();
  resolveOpen(impl);
  assert.deepEqual(await put, { ok: true });
  assert.deepEqual(await list, ['early']);
  assert.ok(impl.blobs.has('early'));
  await store.get('early');
  assert.equal(opens, 1);
});

// ---------------------------------------------------------------- IndexedDB refusals (Node)

test('opening IndexedDB rejects where there is none', async () => {
  await assert.rejects(openIndexedDBBlobStore({ indexedDB: undefined }));
});

test('opening IndexedDB rejects when the factory throws (blocked by the browser)', async () => {
  const factory = { open() { throw new Error('SecurityError'); } };
  await assert.rejects(openIndexedDBBlobStore({ indexedDB: factory }));
});

// A factory whose open request fires the named event on the next tick.
function failingFactory(event) {
  return {
    open() {
      const request = { error: new Error(event) };
      setTimeout(() => request[`on${event}`]?.({ target: request }), 0);
      return request;
    },
  };
}

test('opening IndexedDB rejects when the open request fails or is blocked', async () => {
  await assert.rejects(openIndexedDBBlobStore({ indexedDB: failingFactory('error') }));
  await assert.rejects(openIndexedDBBlobStore({ indexedDB: failingFactory('blocked') }));
});

test('a blob store over a refused IndexedDB falls back to memory and does not persist', async () => {
  const store = createBlobStore({
    open: () => openIndexedDBBlobStore({ indexedDB: failingFactory('error') }),
    fallback: () => createMemoryBlobStore(),
  });
  assert.equal(await store.available(), false);
  await store.put('x', bytes(3));
  assert.deepEqual(await store.get('x'), bytes(3));
});

test('the database and object store names are fixed strings', () => {
  assert.equal(typeof DB_NAME, 'string');
  assert.equal(typeof STORE_NAME, 'string');
  assert.ok(DB_NAME.length > 0 && STORE_NAME.length > 0);
});

// ---------------------------------------------------------------- the platform module

test('the platform module selects the blob store at start-up and, without IndexedDB, keeps blobs in memory', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const writes = [];
  const fake = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: (k) => writes.push(k),
    removeItem: () => {},
  };
  try {
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    assert.equal(globalThis.indexedDB, undefined);
    const platform = await import('../js/platform/index.js?blob-store');
    const { blobStore } = platform;
    for (const fn of ['put', 'get', 'delete', 'list', 'available']) {
      assert.equal(typeof blobStore[fn], 'function', fn);
    }
    assert.equal(await blobStore.available(), false);
    const before = writes.length;
    assert.deepEqual(await blobStore.put('replay', bytes(1, 2, 3)), { ok: true });
    assert.deepEqual(await blobStore.get('replay'), bytes(1, 2, 3));
    assert.deepEqual(writes.slice(before), [], 'nothing goes to localStorage');
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
});

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return name.endsWith('.js') ? [path] : [];
  });
}

test('only js/platform/index.js imports a blob store implementation', () => {
  const selector = join(ROOT, 'js', 'platform', 'index.js');
  const implImport = /from\s+['"][^'"]*(memory|indexeddb)-blob-store\.js['"]|import\(\s*['"][^'"]*(memory|indexeddb)-blob-store\.js/;
  const offenders = jsFiles(join(ROOT, 'js'))
    .filter((file) => file !== selector)
    .filter((file) => implImport.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
  const src = readFileSync(selector, 'utf8');
  assert.match(src, /indexeddb-blob-store\.js/);
  assert.match(src, /memory-blob-store\.js/);
});

test('no blob store file touches localStorage; the interface and memory store are DOM-free', () => {
  for (const file of ['blob-store.js', 'memory-blob-store.js', 'indexeddb-blob-store.js']) {
    const src = readFileSync(join(ROOT, 'js', 'platform', file), 'utf8');
    assert.doesNotMatch(src, /\blocalStorage\b|\bsessionStorage\b/, file);
  }
  for (const file of ['blob-store.js', 'memory-blob-store.js']) {
    const src = readFileSync(join(ROOT, 'js', 'platform', file), 'utf8');
    assert.doesNotMatch(src, /\bwindow\b|\bdocument\.\w|\bindexedDB\b/, file);
  }
});

// The IndexedDB round trip across a page reload is tests/platform-browser.test.mjs's browser test.
