import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { storageSuite } from './helpers/platform-suites.mjs';

const raw = (version, data) => JSON.stringify({ version, data });

function setup({ initial, available } = {}) {
  const backend = createMemoryBackend({ initial, available });
  const storage = createStorage({ backend });
  const issues = [];
  const onIssue = (issue) => issues.push(issue);
  return { backend, storage, issues, onIssue };
}

// ---------------------------------------------------------------- the interface suite

storageSuite('in memory', ({ initial } = {}) => {
  const backend = createMemoryBackend({ initial });
  const failing = async () => { throw new Error('refused'); };
  return {
    storage: createStorage({ backend }),
    stored: (name) => backend.documents.get(name),
    seed: (name, text) => backend.documents.set(name, text),
    remove: (name) => backend.documents.delete(name),
    aside: (name) => backend.aside.get(name),
    fail: (op) => { backend[op] = failing; },
  };
});

// ---------------------------------------------------------------- the memory backend under the interface

test('available() reports the backend availability', () => {
  assert.equal(setup().storage.available(), true);
  assert.equal(setup({ available: false }).storage.available(), false);
});

const chain = { 1: (d) => d, 2: (d) => d, 3: (d) => d };

test('a current-version document runs no upgrade and is not written', async () => {
  let writes = 0;
  const { storage, backend } = setup({ initial: { doc: raw(4, { steps: [] }) } });
  const write = backend.write;
  backend.write = (...a) => { writes++; return write(...a); };
  storage.register('doc', 4, chain);
  assert.deepEqual(await storage.load('doc'), { steps: [] });
  assert.equal(writes, 0);
});

test('a failed write passes on the error the backend threw', async () => {
  const { storage, backend } = setup();
  const error = new Error('QuotaExceededError');
  backend.write = async () => { throw error; };
  storage.register('doc', 1, {});
  assert.equal((await storage.save('doc', { a: 1 })).error, error);
});

test('a backend write that throws synchronously is reported, never thrown', async () => {
  const { storage, backend } = setup();
  backend.write = () => { throw new Error('sync'); };
  storage.register('doc', 1, {});
  assert.equal((await storage.save('doc', 1)).reason, 'write-failed');
});

test('saving to an unavailable backend fails and is reported', async () => {
  const { storage } = setup({ available: false });
  storage.register('doc', 1, {});
  const result = await storage.save('doc', 1);
  assert.equal(result.ok, false);
  assert.equal(await storage.load('doc'), undefined);
});

// ---------------------------------------------------------------- clear

test('clear() removes every document the backend holds: registered, unregistered, kept aside and newer', async () => {
  const { storage, backend, onIssue } = setup({
    initial: { registered: raw(1, 'a'), unregistered: raw(1, 'b'), newer: raw(9, 'c'), bad: '{not json' },
  });
  storage.register('registered', 1, {}, { onIssue });
  storage.register('newer', 1, {}, { onIssue });
  storage.register('bad', 1, {}, { onIssue });
  await storage.load('bad'); // kept aside
  assert.equal(backend.aside.has('bad'), true);
  assert.deepEqual(await storage.clear(), { ok: true });
  assert.equal(backend.documents.size, 0);
  assert.equal(backend.aside.size, 0);
  assert.equal(await storage.load('registered'), undefined);
  assert.equal(await storage.load('newer'), undefined);
  assert.deepEqual(await storage.save('newer', 'fresh'), { ok: true }, 'nothing newer is left to refuse a save');
});

test('clear() on an empty backend succeeds', async () => {
  const { storage } = setup();
  assert.deepEqual(await storage.clear(), { ok: true });
});

test('clear() still clears what exists when the backend is unavailable for the session', async () => {
  const { storage, backend } = setup({ initial: { a: raw(1, 1) }, available: false });
  assert.deepEqual(await storage.clear(), { ok: true });
  assert.equal(backend.documents.size, 0);
});

test('a backend whose clear throws gives { ok: false } and clear() never rejects', async () => {
  for (const clear of [() => { throw new Error('sync'); }, async () => { throw new Error('async'); }]) {
    const backend = { ...createMemoryBackend(), clear };
    const storage = createStorage({ backend });
    const result = await storage.clear();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
    assert.ok(result.error instanceof Error);
  }
});

// ---------------------------------------------------------------- memory backend

test('the memory backend implements read, write, keep-aside, clear and available', async () => {
  const b = createMemoryBackend({ initial: { a: 'x' } });
  assert.equal(await b.read('a'), 'x');
  assert.equal(await b.read('missing'), undefined);
  await b.write('b', 'y');
  assert.equal(await b.read('b'), 'y');
  await b.keepAside('a');
  assert.equal(await b.read('a'), undefined);
  assert.equal(b.aside.get('a'), 'x');
  assert.equal(b.available(), true);
  await b.keepAside('missing');
  assert.equal(b.aside.has('missing'), false);
  await b.clear();
  assert.equal(b.documents.size, 0);
  assert.equal(b.aside.size, 0);
});

test('an unavailable memory backend reads nothing and refuses writes', async () => {
  const b = createMemoryBackend({ initial: { a: 'x' }, available: false });
  assert.equal(b.available(), false);
  assert.equal(await b.read('a'), undefined);
  await assert.rejects(b.write('a', 'y'));
});

test('separate storages over separate backends do not share documents', async () => {
  const a = setup();
  const b = setup();
  a.storage.register('doc', 1, {});
  b.storage.register('doc', 1, {});
  await a.storage.save('doc', 'A');
  assert.equal(await b.storage.load('doc'), undefined);
});

test('js/platform is DOM-free', () => {
  for (const file of ['storage.js', 'memory-backend.js']) {
    const src = readFileSync(new URL(`../js/platform/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /\blocalStorage\b|\bwindow\b|\bdocument\.\w/, file);
  }
});
