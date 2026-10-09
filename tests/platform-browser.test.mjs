import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createStorage } from '../js/platform/storage.js';
import { createBrowserBackend, DOC_PREFIX, ASIDE_PREFIX } from '../js/platform/browser-backend.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const raw = (version, data) => JSON.stringify({ version, data });

// A fake Web Storage object: getItem/setItem/removeItem/key/length over a Map, with an optional
// quota (total characters of keys and values) past which setItem throws a QuotaExceededError,
// and a call log so tests can see which keys were touched.
class FakeStorage {
  constructor(initial = {}, { quota = Infinity } = {}) {
    this.map = new Map(Object.entries(initial));
    this.quota = quota;
    this.calls = [];
  }
  get length() { return this.map.size; }
  key(i) { return [...this.map.keys()][i] ?? null; }
  size() {
    let n = 0;
    for (const [k, v] of this.map) n += k.length + v.length;
    return n;
  }
  getItem(k) {
    this.calls.push(['getItem', k]);
    return this.map.has(k) ? this.map.get(k) : null;
  }
  setItem(k, v) {
    this.calls.push(['setItem', k]);
    v = String(v);
    const old = this.map.has(k) ? k.length + this.map.get(k).length : 0;
    if (this.size() - old + k.length + v.length > this.quota) {
      const error = new Error('The quota has been exceeded.');
      error.name = 'QuotaExceededError';
      throw error;
    }
    this.map.set(k, v);
  }
  removeItem(k) {
    this.calls.push(['removeItem', k]);
    this.map.delete(k);
  }
  clear() { this.map.clear(); }
}

// Every method throws, as storage blocked by the browser's privacy settings does.
const throwingStorage = {
  get length() { throw new Error('SecurityError'); },
  key() { throw new Error('SecurityError'); },
  getItem() { throw new Error('SecurityError'); },
  setItem() { throw new Error('SecurityError'); },
  removeItem() { throw new Error('SecurityError'); },
};

function setup(fake) {
  const backend = createBrowserBackend({ getStorage: () => fake });
  const storage = createStorage({ backend });
  const issues = [];
  const onIssue = (issue) => issues.push(issue);
  return { backend, storage, issues, onIssue };
}

const LEGACY = {
  'ms3d.muted': '1',
  'ms3d.volume': '0.4',
  'ms3d.custom': '{"X":5}',
  'ms3d.best.10x10x10x99': '12.5',
};

// ---------------------------------------------------------------- namespaced keys

test('each document lives under one namespaced key, separate from the legacy ms3d.* keys', () => {
  assert.equal(typeof DOC_PREFIX, 'string');
  assert.equal(typeof ASIDE_PREFIX, 'string');
  assert.notEqual(DOC_PREFIX, ASIDE_PREFIX);
  for (const prefix of [DOC_PREFIX, ASIDE_PREFIX]) {
    assert.ok(prefix.length > 0);
    assert.ok(!prefix.startsWith('ms3d.'), `${prefix} would collide with the legacy keys`);
  }
});

test('write stores the text under the document key and read returns it', async () => {
  const fake = new FakeStorage();
  const { backend } = setup(fake);
  assert.equal(await backend.read('settings'), undefined);
  await backend.write('settings', 'hello');
  assert.equal(fake.map.get(DOC_PREFIX + 'settings'), 'hello');
  assert.equal(await backend.read('settings'), 'hello');
  await backend.write('settings', 'again');
  assert.equal(await backend.read('settings'), 'again');
  assert.deepEqual([...fake.map.keys()], [DOC_PREFIX + 'settings']);
});

test('a document is stored as the text of { version, data } through the storage interface', async () => {
  const fake = new FakeStorage();
  const { storage } = setup(fake);
  storage.register('records', 2, { 1: (d) => d });
  assert.deepEqual(await storage.save('records', { best: [1, 2] }), { ok: true });
  assert.deepEqual(JSON.parse(fake.map.get(DOC_PREFIX + 'records')), { version: 2, data: { best: [1, 2] } });
  assert.deepEqual(await storage.load('records'), { best: [1, 2] });
});

test('an older stored document is upgraded and saved back under its key', async () => {
  const fake = new FakeStorage({ [DOC_PREFIX + 'settings']: raw(1, { vol: 5 }) });
  const { storage } = setup(fake);
  storage.register('settings', 2, { 1: (d) => ({ volume: d.vol / 10 }) });
  assert.deepEqual(await storage.load('settings'), { volume: 0.5 });
  assert.equal(fake.map.get(DOC_PREFIX + 'settings'), raw(2, { volume: 0.5 }));
});

test('the legacy ms3d.* keys are never read, written or deleted', async () => {
  const fake = new FakeStorage({ ...LEGACY, [DOC_PREFIX + 'bad']: '{not json' });
  const { storage, backend, onIssue } = setup(fake);
  storage.register('settings', 1, {}, { onIssue });
  storage.register('bad', 1, {}, { onIssue });
  await storage.load('settings');
  await storage.save('settings', { a: 1 });
  await storage.load('settings');
  await storage.load('bad');
  await storage.save('bad', 'fresh');
  backend.available();
  for (const [k, v] of Object.entries(LEGACY)) assert.equal(fake.map.get(k), v, k);
  for (const [method, key] of fake.calls) {
    assert.ok(!key.startsWith('ms3d.'), `${method}(${key}) touched a legacy key`);
  }
});

// ---------------------------------------------------------------- unavailable storage

test('storage whose every call throws reads as empty, refuses writes and is not available', async () => {
  const { backend, storage, issues, onIssue } = setup(throwingStorage);
  assert.equal(backend.available(), false);
  assert.equal(await backend.read('settings'), undefined);
  await assert.rejects(async () => backend.write('settings', 'x'));
  await backend.keepAside('settings'); // nothing to keep; must not throw

  storage.register('settings', 1, {}, { onIssue });
  assert.equal(storage.available(), false);
  assert.equal(await storage.load('settings'), undefined);
  assert.deepEqual(issues, []); // behaves as empty, not as a corrupt document
  const result = await storage.save('settings', { a: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'save-failed');
});

test('blocked or missing storage (the getter throws, or there is none) behaves the same', async () => {
  const getters = [
    () => { throw new Error('SecurityError: access denied'); },
    () => undefined,
    () => null,
  ];
  for (const getStorage of getters) {
    const backend = createBrowserBackend({ getStorage });
    assert.equal(backend.available(), false);
    assert.equal(await backend.read('settings'), undefined);
    await assert.rejects(async () => backend.write('settings', 'x'));
    await backend.keepAside('settings');
    const storage = createStorage({ backend });
    storage.register('settings', 1, {});
    assert.equal(await storage.load('settings'), undefined);
    assert.equal((await storage.save('settings', 1)).reason, 'write-failed');
  }
});

test('the default backend reads the global localStorage, and a blocked one reads as unavailable', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const fake = new FakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: fake, configurable: true, writable: true });
    const backend = createBrowserBackend();
    assert.equal(backend.available(), true);
    await backend.write('a', 'x');
    assert.equal(fake.map.get(DOC_PREFIX + 'a'), 'x');

    Object.defineProperty(globalThis, 'localStorage', {
      get() { throw new Error('SecurityError'); },
      configurable: true,
    });
    const blocked = createBrowserBackend();
    assert.equal(blocked.available(), false);
    assert.equal(await blocked.read('a'), undefined);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
});

test('available() reports whether a write persists, and leaves no probe behind', () => {
  const fake = new FakeStorage(LEGACY);
  const { backend } = setup(fake);
  assert.equal(backend.available(), true);
  assert.deepEqual(Object.fromEntries(fake.map), LEGACY);
});

// ---------------------------------------------------------------- full storage

test('a write past the quota is reported as a failed save and changes nothing', async () => {
  const fake = new FakeStorage({}, { quota: 80 });
  const { storage, issues, onIssue } = setup(fake);
  storage.register('small', 1, {}, { onIssue });
  storage.register('big', 1, {}, { onIssue });
  assert.deepEqual(await storage.save('small', 'ok'), { ok: true });
  const result = await storage.save('big', 'x'.repeat(200));
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
  assert.equal(result.error.name, 'QuotaExceededError');
  assert.deepEqual(issues.map((i) => [i.name, i.kind, i.reason]), [['big', 'save-failed', 'write-failed']]);
  assert.equal(fake.map.has(DOC_PREFIX + 'big'), false);
  assert.equal(await storage.load('small'), 'ok');
});

test('full storage is not available', () => {
  const fake = new FakeStorage({ k: 'v' }, { quota: 2 });
  const { backend } = setup(fake);
  assert.equal(backend.available(), false);
  assert.deepEqual(Object.fromEntries(fake.map), { k: 'v' });
});

// ---------------------------------------------------------------- corrupt documents

test('a corrupt document is reported missing and its text kept aside under a separate key', async () => {
  const fake = new FakeStorage({ [DOC_PREFIX + 'settings']: '{not json' });
  const { storage, issues, onIssue } = setup(fake);
  storage.register('settings', 1, {}, { onIssue });
  assert.equal(await storage.load('settings'), undefined);
  assert.deepEqual(issues.map((i) => i.kind), ['corrupt']);
  assert.equal(fake.map.get(ASIDE_PREFIX + 'settings'), '{not json');
  assert.equal(fake.map.has(DOC_PREFIX + 'settings'), false);

  // Loading again finds nothing and leaves the kept text alone.
  assert.equal(await storage.load('settings'), undefined);
  assert.equal(fake.map.get(ASIDE_PREFIX + 'settings'), '{not json');

  // The owner's new document goes under the document key; the kept text is not overwritten.
  assert.deepEqual(await storage.save('settings', { fresh: true }), { ok: true });
  assert.equal(fake.map.get(DOC_PREFIX + 'settings'), raw(1, { fresh: true }));
  assert.equal(fake.map.get(ASIDE_PREFIX + 'settings'), '{not json');
  assert.deepEqual(await storage.load('settings'), { fresh: true });
});

test('keepAside with nothing stored is a no-op', async () => {
  const fake = new FakeStorage({ [ASIDE_PREFIX + 'a']: 'earlier' });
  const { backend } = setup(fake);
  await backend.keepAside('a');
  assert.deepEqual(Object.fromEntries(fake.map), { [ASIDE_PREFIX + 'a']: 'earlier' });
});

test('keepAside that cannot store the copy leaves the document where it is', async () => {
  const text = '{corrupt but long ' + 'x'.repeat(40);
  const fake = new FakeStorage({ [DOC_PREFIX + 'a']: text }, { quota: 70 });
  const { backend, storage } = setup(fake);
  await assert.rejects(async () => backend.keepAside('a'));
  assert.equal(fake.map.get(DOC_PREFIX + 'a'), text);
  storage.register('a', 1, {});
  assert.equal(await storage.load('a'), undefined); // still reported missing, never thrown
  assert.equal(fake.map.get(DOC_PREFIX + 'a'), text);
});

// ---------------------------------------------------------------- start-up selection

test('the platform module exposes the storage interface over the browser backend', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    const first = new FakeStorage();
    Object.defineProperty(globalThis, 'localStorage', { value: first, configurable: true, writable: true });
    const platform = await import('../js/platform/index.js?selection');
    for (const fn of ['register', 'load', 'save', 'available']) {
      assert.equal(typeof platform[fn], 'function', fn);
      assert.equal(platform.storage[fn], platform[fn], fn);
    }
    assert.equal(platform.available(), true);
    platform.register('selection-test', 1, {});
    assert.deepEqual(await platform.save('selection-test', 7), { ok: true });
    assert.equal(first.map.get(DOC_PREFIX + 'selection-test'), raw(1, 7));

    // Selected once, at start-up: a later change of the global is not followed.
    Object.defineProperty(globalThis, 'localStorage', { value: new FakeStorage(), configurable: true, writable: true });
    assert.equal(await platform.load('selection-test'), 7);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
    else delete globalThis.localStorage;
  }
});

test('the platform module keeps the game going where there is no storage', async () => {
  const saved = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  try {
    delete globalThis.localStorage;
    const platform = await import('../js/platform/index.js?no-storage');
    assert.equal(platform.available(), false);
    platform.register('x', 1, {});
    assert.equal(await platform.load('x'), undefined);
    assert.equal((await platform.save('x', 1)).ok, false);
  } finally {
    if (saved) Object.defineProperty(globalThis, 'localStorage', saved);
  }
});

function jsFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return jsFiles(path);
    return name.endsWith('.js') ? [path] : [];
  });
}

test('no caller imports a backend directly: only js/platform/index.js selects one', () => {
  const selector = join(ROOT, 'js', 'platform', 'index.js');
  const backendImport = /from\s+['"][^'"]*(browser|memory)-backend\.js['"]|import\(\s*['"][^'"]*(browser|memory)-backend\.js/;
  const offenders = jsFiles(join(ROOT, 'js'))
    .filter((file) => file !== selector)
    .filter((file) => backendImport.test(readFileSync(file, 'utf8')));
  assert.deepEqual(offenders, []);
  const src = readFileSync(selector, 'utf8');
  assert.match(src, /browser-backend\.js/);
  assert.doesNotMatch(src, /memory-backend\.js/);
});

// ---------------------------------------------------------------- browser: survives a reload

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><title>storage</title>');
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

test('in a browser, a saved document survives a page reload', async (t) => {
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
    const origin = `http://127.0.0.1:${server.address().port}/`;
    await page.goto(origin);
    await page.evaluate(() => localStorage.setItem('ms3d.muted', '1'));
    const saved = await page.evaluate(async () => {
      const platform = await import('/js/platform/index.js');
      platform.register('reload-test', 1, {});
      return { available: platform.available(), result: await platform.save('reload-test', { n: 42 }) };
    });
    assert.deepEqual(saved, { available: true, result: { ok: true } });

    await page.reload();
    const after = await page.evaluate(async () => {
      const platform = await import('/js/platform/index.js');
      platform.register('reload-test', 1, {});
      return { data: await platform.load('reload-test'), legacy: localStorage.getItem('ms3d.muted') };
    });
    assert.deepEqual(after, { data: { n: 42 }, legacy: '1' });
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
