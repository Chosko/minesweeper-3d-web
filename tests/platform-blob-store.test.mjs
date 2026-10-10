import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { openIndexedDBBlobStore, DB_NAME, STORE_NAME } from '../js/platform/indexeddb-blob-store.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bytes = (...values) => new Uint8Array(values);

// A blob store over a fresh in-memory implementation, opened at once.
function setup(options) {
  const impl = createMemoryBlobStore(options);
  const store = createBlobStore({ open: () => impl, fallback: () => createMemoryBlobStore() });
  return { impl, store };
}

// ---------------------------------------------------------------- the interface

test('put, get, delete, list and available are all asynchronous', async () => {
  const { store } = setup();
  const calls = [
    store.put('a', bytes(1)),
    store.get('a'),
    store.list(),
    store.delete('a'),
    store.available(),
  ];
  for (const call of calls) assert.ok(call instanceof Promise);
  await Promise.all(calls);
});

test('a blob put under a name is got back byte for byte', async () => {
  const { store } = setup();
  const blob = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff);
  assert.deepEqual(await store.put('replay-1', blob), { ok: true });
  const back = await store.get('replay-1');
  assert.ok(back instanceof Uint8Array);
  assert.deepEqual(back, blob);
});

test('an empty blob round-trips; a missing name gets undefined', async () => {
  const { store } = setup();
  await store.put('empty', new Uint8Array(0));
  assert.deepEqual(await store.get('empty'), new Uint8Array(0));
  assert.equal(await store.get('nothing'), undefined);
});

test('the store keeps its own copy: changing the bytes put or got changes nothing stored', async () => {
  const { store } = setup();
  const blob = bytes(1, 2, 3);
  await store.put('x', blob);
  blob[0] = 99;
  const got = await store.get('x');
  assert.deepEqual(got, bytes(1, 2, 3));
  got[1] = 99;
  assert.deepEqual(await store.get('x'), bytes(1, 2, 3));
});

test('a blob view onto part of a larger buffer stores only its own bytes', async () => {
  const { store } = setup();
  const buffer = new Uint8Array([9, 9, 1, 2, 3, 9]).buffer;
  await store.put('view', new Uint8Array(buffer, 2, 3));
  const got = await store.get('view');
  assert.deepEqual(got, bytes(1, 2, 3));
  assert.equal(got.byteLength, 3);
});

test('a second put under the same name replaces the blob', async () => {
  const { store } = setup();
  await store.put('x', bytes(1));
  await store.put('x', bytes(2, 2));
  assert.deepEqual(await store.get('x'), bytes(2, 2));
  assert.deepEqual(await store.list(), ['x']);
});

test('list names every stored blob once, in sorted order', async () => {
  const { store } = setup();
  assert.deepEqual(await store.list(), []);
  for (const name of ['c', 'a', 'b']) await store.put(name, bytes(1));
  assert.deepEqual(await store.list(), ['a', 'b', 'c']);
});

test('delete removes a blob; deleting a missing name is not an error', async () => {
  const { store } = setup();
  await store.put('a', bytes(1));
  await store.put('b', bytes(2));
  assert.deepEqual(await store.delete('a'), { ok: true });
  assert.equal(await store.get('a'), undefined);
  assert.deepEqual(await store.list(), ['b']);
  assert.deepEqual(await store.delete('a'), { ok: true });
});

test('a bad name or a value that is not bytes is a programming error, thrown at once', () => {
  const { store } = setup();
  for (const name of ['', undefined, null, 7, {}]) {
    assert.throws(() => store.put(name, bytes(1)), TypeError, String(name));
    assert.throws(() => store.get(name), TypeError, String(name));
    assert.throws(() => store.delete(name), TypeError, String(name));
  }
  for (const value of [undefined, null, 'text', [1, 2], new ArrayBuffer(2), new Uint16Array(2)]) {
    assert.throws(() => store.put('x', value), TypeError, String(value));
  }
});

test('a write the implementation refuses is reported, never thrown, and stores nothing', async () => {
  const { impl, store } = setup({ failWrites: true });
  const result = await store.put('x', bytes(1));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
  assert.ok(result.error instanceof Error);
  assert.equal(impl.blobs.size, 0);
  const removed = await store.delete('x');
  assert.equal(removed.ok, false);
  assert.equal(removed.reason, 'write-failed');
});

test('a read the implementation fails rejects, so a failure is never mistaken for a missing blob', async () => {
  const { store } = setup({ initial: { a: bytes(1) }, failReads: true });
  await assert.rejects(store.get('a'));
  await assert.rejects(store.list());
});

test('the in-memory implementation exposes its blobs for tests and can be seeded', async () => {
  const impl = createMemoryBlobStore({ initial: { seeded: bytes(4, 5) } });
  assert.ok(impl.blobs instanceof Map);
  const store = createBlobStore({ open: () => impl, fallback: () => createMemoryBlobStore() });
  assert.deepEqual(await store.get('seeded'), bytes(4, 5));
  await store.put('new', bytes(6));
  assert.deepEqual(impl.blobs.get('new'), bytes(6));
});

// ---------------------------------------------------------------- start-up selection

test('the opened implementation is used and the store persists', async () => {
  const { impl, store } = setup();
  assert.equal(await store.available(), true);
  await store.put('x', bytes(1));
  assert.ok(impl.blobs.has('x'));
});

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

// ---------------------------------------------------------------- browser: IndexedDB round trip

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>blob store</title>');
      return;
    }
    const path = normalize(join(ROOT, url.pathname));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

test('in a browser, a blob round-trips through IndexedDB across a page reload', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const saved = await page.evaluate(async () => {
      const { blobStore } = await import('/js/platform/index.js');
      const blob = new Uint8Array(100_000).map((_, i) => (i * 7) & 0xff);
      return {
        available: await blobStore.available(),
        put: await blobStore.put('replay-1', blob),
        other: await blobStore.put('replay-2', new Uint8Array([1, 2])),
      };
    });
    assert.deepEqual(saved, { available: true, put: { ok: true }, other: { ok: true } });

    await page.reload();
    const after = await page.evaluate(async ({ dbName, storeName }) => {
      const { blobStore } = await import('/js/platform/index.js');
      const got = await blobStore.get('replay-1');
      let intact = got instanceof Uint8Array && got.length === 100_000;
      for (let i = 0; intact && i < got.length; i++) intact = got[i] === ((i * 7) & 0xff);
      const listed = await blobStore.list();
      const deleted = await blobStore.delete('replay-2');
      const records = await new Promise((resolve, reject) => {
        const open = indexedDB.open(dbName);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          const count = db.transaction(storeName).objectStore(storeName).count();
          count.onsuccess = () => { db.close(); resolve(count.result); };
          count.onerror = () => reject(count.error);
        };
      });
      return {
        available: await blobStore.available(),
        intact,
        listed,
        deleted,
        remaining: await blobStore.list(),
        records,
        localStorageKeys: localStorage.length,
      };
    }, { dbName: DB_NAME, storeName: STORE_NAME });
    assert.deepEqual(after, {
      available: true,
      intact: true,
      listed: ['replay-1', 'replay-2'],
      deleted: { ok: true },
      remaining: ['replay-1'],
      records: 1,
      localStorageKeys: 0,
    });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
