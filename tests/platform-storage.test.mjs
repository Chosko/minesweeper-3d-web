import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';

const raw = (version, data) => JSON.stringify({ version, data });

function setup({ initial, available } = {}) {
  const backend = createMemoryBackend({ initial, available });
  const storage = createStorage({ backend });
  const issues = [];
  const onIssue = (issue) => issues.push(issue);
  return { backend, storage, issues, onIssue };
}

// ---------------------------------------------------------------- registration

test('register declares a document; loading or saving an unregistered name throws', async () => {
  const { storage } = setup();
  assert.throws(() => storage.load('settings'), /not registered/);
  assert.throws(() => storage.save('settings', {}), /not registered/);
  storage.register('settings', 1, {});
  assert.equal(await storage.load('settings'), undefined);
  assert.deepEqual(await storage.save('settings', { a: 1 }), { ok: true });
});

test('register rejects malformed declarations', () => {
  const { storage } = setup();
  assert.throws(() => storage.register('', 1, {}), /name/);
  assert.throws(() => storage.register(42, 1, {}), /name/);
  assert.throws(() => storage.register('a', 0, {}), /version/);
  assert.throws(() => storage.register('a', 1.5, {}), /version/);
  assert.throws(() => storage.register('a', '2', {}), /version/);
  assert.throws(() => storage.register('a', 3, { 1: (d) => d }), /upgrade step from version 2/);
  assert.throws(() => storage.register('a', 2, { 1: 'nope' }), /upgrade step from version 1/);
  assert.throws(() => storage.register('a', 2, null), /upgrade step from version 1/);
});

test('a name is registered once', () => {
  const { storage } = setup();
  storage.register('records', 1, {});
  assert.throws(() => storage.register('records', 1, {}), /already registered/);
});

test('upgrades may be omitted for a version-1 document', async () => {
  const { storage } = setup({ initial: { last: raw(1, 'classic') } });
  storage.register('last', 1);
  assert.equal(await storage.load('last'), 'classic');
});

// ---------------------------------------------------------------- load and save

test('save writes { version, data } at the current version and load returns the data', async () => {
  const { storage, backend } = setup();
  storage.register('settings', 3, { 1: (d) => d, 2: (d) => d });
  const data = { theme: 'dark', volume: 0.5, list: [1, 2] };
  assert.deepEqual(await storage.save('settings', data), { ok: true });
  assert.deepEqual(JSON.parse(backend.documents.get('settings')), { version: 3, data });
  assert.deepEqual(await storage.load('settings'), data);
});

test('load and save are asynchronous', () => {
  const { storage } = setup();
  storage.register('a', 1, {});
  assert.ok(storage.load('a') instanceof Promise);
  assert.ok(storage.save('a', 1) instanceof Promise);
});

test('load returns nothing for a document that does not exist', async () => {
  const { storage, issues, onIssue } = setup();
  storage.register('a', 1, {}, { onIssue });
  assert.equal(await storage.load('a'), undefined);
  assert.deepEqual(issues, []);
});

test('save writes the whole document, replacing the previous one', async () => {
  const { storage } = setup();
  storage.register('a', 1, {});
  await storage.save('a', { x: 1, y: 2 });
  await storage.save('a', { z: 3 });
  assert.deepEqual(await storage.load('a'), { z: 3 });
});

test('falsy data round-trips', async () => {
  const { storage } = setup();
  for (const [i, v] of [0, false, '', null].entries()) {
    storage.register(`d${i}`, 1, {});
    assert.deepEqual(await storage.save(`d${i}`, v), { ok: true });
    assert.equal(await storage.load(`d${i}`), v);
  }
});

test('the storage layer caches nothing: every load reads the backend', async () => {
  const { storage, backend } = setup();
  storage.register('a', 1, {});
  await storage.save('a', { n: 1 });
  const first = await storage.load('a');
  first.n = 99;
  assert.deepEqual(await storage.load('a'), { n: 1 });
  backend.documents.set('a', raw(1, { n: 2 }));
  assert.deepEqual(await storage.load('a'), { n: 2 });
  backend.documents.delete('a');
  assert.equal(await storage.load('a'), undefined);
});

test('available() reports the backend availability', () => {
  assert.equal(setup().storage.available(), true);
  assert.equal(setup({ available: false }).storage.available(), false);
});

// ---------------------------------------------------------------- upgrades

const chain = {
  1: (d) => ({ ...d, v2: true, steps: [...d.steps, 1] }),
  2: (d) => ({ ...d, v3: true, steps: [...d.steps, 2] }),
  3: (d) => ({ ...d, v4: true, steps: [...d.steps, 3] }),
};

for (const from of [1, 2, 3]) {
  test(`a version-${from} document runs every later upgrade step in order and is saved back`, async () => {
    const { storage, backend, issues, onIssue } = setup({
      initial: { doc: raw(from, { steps: [] }) },
    });
    storage.register('doc', 4, chain, { onIssue });
    const expectedSteps = [1, 2, 3].filter((s) => s >= from);
    const loaded = await storage.load('doc');
    assert.deepEqual(loaded.steps, expectedSteps);
    for (let v = 2; v <= 4; v++) assert.equal(loaded[`v${v}`], v > from ? true : undefined);
    assert.deepEqual(JSON.parse(backend.documents.get('doc')), { version: 4, data: loaded });
    assert.deepEqual(issues, []);
    // A second load finds the current version and runs nothing.
    assert.deepEqual(await storage.load('doc'), loaded);
  });
}

test('a current-version document runs no upgrade and is not written', async () => {
  let writes = 0;
  const { storage, backend } = setup({ initial: { doc: raw(4, { steps: [] }) } });
  const write = backend.write;
  backend.write = (...a) => { writes++; return write(...a); };
  storage.register('doc', 4, chain);
  assert.deepEqual(await storage.load('doc'), { steps: [] });
  assert.equal(writes, 0);
});

test('upgrade steps may be asynchronous', async () => {
  const { storage } = setup({ initial: { doc: raw(1, 1) } });
  storage.register('doc', 3, { 1: async (d) => d + 1, 2: (d) => d * 10 });
  assert.equal(await storage.load('doc'), 20);
});

test('a failed save-back after an upgrade still returns the upgraded data and is reported', async () => {
  const { storage, backend, issues, onIssue } = setup({ initial: { doc: raw(1, 1) } });
  backend.write = async () => { throw new Error('quota'); };
  storage.register('doc', 2, { 1: (d) => d + 1 }, { onIssue });
  assert.equal(await storage.load('doc'), 2);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].name, 'doc');
  assert.equal(issues[0].kind, 'save-failed');
  assert.equal(JSON.parse(backend.documents.get('doc')).version, 1);
});

test('an upgrade step that throws makes the document unreadable: missing, kept aside', async () => {
  const stored = raw(1, { bad: true });
  const { storage, backend, issues, onIssue } = setup({ initial: { doc: stored } });
  storage.register('doc', 2, { 1: () => { throw new Error('boom'); } }, { onIssue });
  assert.equal(await storage.load('doc'), undefined);
  assert.equal(backend.documents.has('doc'), false);
  assert.equal(backend.aside.get('doc'), stored);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'corrupt');
});

// ---------------------------------------------------------------- newer version

test('a newer document than the game knows is refused, reported and left untouched', async () => {
  const stored = raw(5, { future: true });
  const { storage, backend, issues, onIssue } = setup({ initial: { doc: stored } });
  storage.register('doc', 2, { 1: (d) => d }, { onIssue });
  assert.equal(await storage.load('doc'), undefined);
  assert.equal(backend.documents.get('doc'), stored);
  assert.equal(backend.aside.has('doc'), false);
  assert.deepEqual(issues, [{ name: 'doc', kind: 'newer-version', storedVersion: 5, currentVersion: 2 }]);
});

test('saving over a newer document is refused and leaves it untouched', async () => {
  const stored = raw(5, { future: true });
  const { storage, backend } = setup({ initial: { doc: stored } });
  storage.register('doc', 2, { 1: (d) => d });
  const result = await storage.save('doc', { mine: true });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'newer-version');
  assert.equal(backend.documents.get('doc'), stored);
});

test('a newer-version refusal without an onIssue callback still resolves to nothing', async () => {
  const { storage } = setup({ initial: { doc: raw(9, 1) } });
  storage.register('doc', 1, {});
  assert.equal(await storage.load('doc'), undefined);
});

// ---------------------------------------------------------------- corrupt documents

const corruptCases = {
  'unparseable text': '{"version": 1, "data":',
  'not an object': '42',
  'null': 'null',
  'an array': '[1, 2]',
  'no version': JSON.stringify({ data: 1 }),
  'a version of zero': JSON.stringify({ version: 0, data: 1 }),
  'a fractional version': JSON.stringify({ version: 1.5, data: 1 }),
  'a string version': JSON.stringify({ version: '1', data: 1 }),
  'no data field': JSON.stringify({ version: 1 }),
};

for (const [label, text] of Object.entries(corruptCases)) {
  test(`a corrupt document (${label}) is reported as missing and kept aside`, async () => {
    const { storage, backend, issues, onIssue } = setup({ initial: { doc: text } });
    storage.register('doc', 1, {}, { onIssue });
    assert.equal(await storage.load('doc'), undefined);
    assert.equal(backend.aside.get('doc'), text);
    assert.equal(backend.documents.has('doc'), false);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].name, 'doc');
    assert.equal(issues[0].kind, 'corrupt');
  });
}

test('a document kept aside is not overwritten until the owner saves a new one', async () => {
  const text = 'garbage';
  const { storage, backend } = setup({ initial: { doc: text } });
  storage.register('doc', 1, {});
  assert.equal(await storage.load('doc'), undefined);
  assert.equal(await storage.load('doc'), undefined);
  assert.equal(backend.aside.get('doc'), text);
  assert.deepEqual(await storage.save('doc', { fresh: true }), { ok: true });
  assert.deepEqual(await storage.load('doc'), { fresh: true });
  assert.equal(backend.aside.get('doc'), text);
});

test('an unreadable document behaves as missing and is kept aside', async () => {
  const { storage, backend, issues, onIssue } = setup({ initial: { doc: raw(1, 1) } });
  backend.read = async () => { throw new Error('denied'); };
  storage.register('doc', 1, {}, { onIssue });
  assert.equal(await storage.load('doc'), undefined);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'unreadable');
  assert.equal(backend.aside.get('doc'), raw(1, 1));
  assert.equal(backend.documents.has('doc'), false);
  assert.deepEqual(await storage.save('doc', 2), { ok: true });
  assert.equal(backend.aside.get('doc'), raw(1, 1));
});

test('an onIssue callback that rejects does not cause an unhandled rejection', async () => {
  const { storage } = setup({ initial: { doc: 'garbage' } });
  storage.register('doc', 1, {}, { onIssue: async () => { throw new Error('owner bug'); } });
  assert.equal(await storage.load('doc'), undefined);
  await new Promise((r) => setTimeout(r, 0));
});

test('a failing keep-aside still reports the document as missing', async () => {
  const { storage, backend } = setup({ initial: { doc: 'garbage' } });
  backend.keepAside = async () => { throw new Error('nope'); };
  storage.register('doc', 1, {});
  assert.equal(await storage.load('doc'), undefined);
});

test('an onIssue callback that throws does not break load or save', async () => {
  const { storage, backend } = setup({ initial: { doc: 'garbage' } });
  storage.register('doc', 1, {}, { onIssue: () => { throw new Error('owner bug'); } });
  assert.equal(await storage.load('doc'), undefined);
  backend.write = async () => { throw new Error('full'); };
  assert.equal((await storage.save('doc', 1)).ok, false);
});

// ---------------------------------------------------------------- failed saves

test('a failed write is reported, never thrown', async () => {
  const { storage, backend, issues, onIssue } = setup();
  const error = new Error('QuotaExceededError');
  backend.write = async () => { throw error; };
  storage.register('doc', 1, {}, { onIssue });
  const result = await storage.save('doc', { a: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'write-failed');
  assert.equal(result.error, error);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].kind, 'save-failed');
});

test('a backend write that throws synchronously is reported, never thrown', async () => {
  const { storage, backend } = setup();
  backend.write = () => { throw new Error('sync'); };
  storage.register('doc', 1, {});
  assert.equal((await storage.save('doc', 1)).reason, 'write-failed');
});

test('data that cannot be serialised is a failed save', async () => {
  const { storage, backend } = setup();
  storage.register('doc', 1, {});
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal((await storage.save('doc', cyclic)).reason, 'not-serializable');
  assert.equal((await storage.save('doc', 10n)).reason, 'not-serializable');
  assert.equal((await storage.save('doc', undefined)).reason, 'not-serializable');
  assert.equal(backend.documents.has('doc'), false);
});

test('saving to an unavailable backend fails and is reported', async () => {
  const { storage } = setup({ available: false });
  storage.register('doc', 1, {});
  const result = await storage.save('doc', 1);
  assert.equal(result.ok, false);
  assert.equal(await storage.load('doc'), undefined);
});

// ---------------------------------------------------------------- memory backend

test('the memory backend implements read, write, keep-aside and available', async () => {
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
