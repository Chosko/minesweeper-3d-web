// The interface suites every implementation of the platform's storage and blob store passes: the
// document interface of js/platform/storage.js over a backend, and the blob store interface of
// js/platform/blob-store.js over an implementation. Each test file calls a suite with its own
// harness, so the in-memory and Steam implementations are held to the same tests.
//
// storageSuite(label, make) — make({ initial }?) → {
//   storage,            the interface over the implementation, `initial` ({ name: text }) stored;
//   stored(name),       the stored text of a document, or undefined;
//   seed(name, text),   stores a document's text behind the interface's back;
//   remove(name),       deletes a stored document behind the interface's back;
//   aside(name),        the text kept aside for a document, or undefined;
//   fail(op),           makes every later `op` ('read', 'write' or 'keepAside') fail;
// }
// blobStoreSuite(label, make) — make({ initial, failWrites, failReads }?) → {
//   store,              the interface, opened over the implementation with `initial` ({ name: bytes });
//   stored(name),       the stored bytes, or undefined;
//   names(),            every stored name;
// }
import { test } from 'node:test';
import assert from 'node:assert/strict';

const raw = (version, data) => JSON.stringify({ version, data });
const bytes = (...values) => new Uint8Array(values);

export function storageSuite(label, make) {
  const named = (title) => `${title} (${label})`;

  function setup(options) {
    const harness = make(options);
    const issues = [];
    return { ...harness, issues, onIssue: (issue) => issues.push(issue) };
  }

  // -------------------------------------------------------------- registration

  test(named('register declares a document; loading or saving an unregistered name throws'), async () => {
    const { storage } = setup();
    assert.throws(() => storage.load('settings'), /not registered/);
    assert.throws(() => storage.save('settings', {}), /not registered/);
    storage.register('settings', 1, {});
    assert.equal(await storage.load('settings'), undefined);
    assert.deepEqual(await storage.save('settings', { a: 1 }), { ok: true });
  });

  test(named('register rejects malformed declarations'), () => {
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

  test(named('a name is registered once'), () => {
    const { storage } = setup();
    storage.register('records', 1, {});
    assert.throws(() => storage.register('records', 1, {}), /already registered/);
  });

  test(named('upgrades may be omitted for a version-1 document'), async () => {
    const { storage } = setup({ initial: { last: raw(1, 'classic') } });
    storage.register('last', 1);
    assert.equal(await storage.load('last'), 'classic');
  });

  // -------------------------------------------------------------- load and save

  test(named('save writes { version, data } at the current version and load returns the data'), async () => {
    const { storage, stored } = setup();
    storage.register('settings', 3, { 1: (d) => d, 2: (d) => d });
    const data = { theme: 'dark', volume: 0.5, list: [1, 2] };
    assert.deepEqual(await storage.save('settings', data), { ok: true });
    assert.deepEqual(JSON.parse(stored('settings')), { version: 3, data });
    assert.deepEqual(await storage.load('settings'), data);
  });

  test(named('load and save are asynchronous'), async () => {
    const { storage } = setup();
    storage.register('a', 1, {});
    const loading = storage.load('a');
    const saving = storage.save('a', 1);
    assert.ok(loading instanceof Promise);
    assert.ok(saving instanceof Promise);
    await Promise.all([loading, saving]);
  });

  test(named('load returns nothing for a document that does not exist'), async () => {
    const { storage, issues, onIssue } = setup();
    storage.register('a', 1, {}, { onIssue });
    assert.equal(await storage.load('a'), undefined);
    assert.deepEqual(issues, []);
  });

  test(named('save writes the whole document, replacing the previous one'), async () => {
    const { storage } = setup();
    storage.register('a', 1, {});
    await storage.save('a', { x: 1, y: 2 });
    await storage.save('a', { z: 3 });
    assert.deepEqual(await storage.load('a'), { z: 3 });
  });

  test(named('falsy data round-trips'), async () => {
    const { storage } = setup();
    for (const [i, v] of [0, false, '', null].entries()) {
      storage.register(`d${i}`, 1, {});
      assert.deepEqual(await storage.save(`d${i}`, v), { ok: true });
      assert.equal(await storage.load(`d${i}`), v);
    }
  });

  test(named('the storage layer caches nothing: every load reads the implementation'), async () => {
    const { storage, seed, remove } = setup();
    storage.register('a', 1, {});
    await storage.save('a', { n: 1 });
    const first = await storage.load('a');
    first.n = 99;
    assert.deepEqual(await storage.load('a'), { n: 1 });
    seed('a', raw(1, { n: 2 }));
    assert.deepEqual(await storage.load('a'), { n: 2 });
    remove('a');
    assert.equal(await storage.load('a'), undefined);
  });

  // -------------------------------------------------------------- upgrades

  const chain = {
    1: (d) => ({ ...d, v2: true, steps: [...d.steps, 1] }),
    2: (d) => ({ ...d, v3: true, steps: [...d.steps, 2] }),
    3: (d) => ({ ...d, v4: true, steps: [...d.steps, 3] }),
  };

  for (const from of [1, 2, 3]) {
    test(named(`a version-${from} document runs every later upgrade step in order and is saved back`), async () => {
      const { storage, stored, issues, onIssue } = setup({ initial: { doc: raw(from, { steps: [] }) } });
      storage.register('doc', 4, chain, { onIssue });
      const expectedSteps = [1, 2, 3].filter((s) => s >= from);
      const loaded = await storage.load('doc');
      assert.deepEqual(loaded.steps, expectedSteps);
      for (let v = 2; v <= 4; v++) assert.equal(loaded[`v${v}`], v > from ? true : undefined);
      assert.deepEqual(JSON.parse(stored('doc')), { version: 4, data: loaded });
      assert.deepEqual(issues, []);
      // A second load finds the current version and runs nothing.
      assert.deepEqual(await storage.load('doc'), loaded);
    });
  }

  test(named('upgrade steps may be asynchronous'), async () => {
    const { storage } = setup({ initial: { doc: raw(1, 1) } });
    storage.register('doc', 3, { 1: async (d) => d + 1, 2: (d) => d * 10 });
    assert.equal(await storage.load('doc'), 20);
  });

  test(named('a failed save-back after an upgrade still returns the upgraded data and is reported'), async () => {
    const { storage, stored, fail, issues, onIssue } = setup({ initial: { doc: raw(1, 1) } });
    fail('write');
    storage.register('doc', 2, { 1: (d) => d + 1 }, { onIssue });
    assert.equal(await storage.load('doc'), 2);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].name, 'doc');
    assert.equal(issues[0].kind, 'save-failed');
    assert.equal(JSON.parse(stored('doc')).version, 1);
  });

  test(named('an upgrade step that throws makes the document unreadable: missing, kept aside'), async () => {
    const text = raw(1, { bad: true });
    const { storage, stored, aside, issues, onIssue } = setup({ initial: { doc: text } });
    storage.register('doc', 2, { 1: () => { throw new Error('boom'); } }, { onIssue });
    assert.equal(await storage.load('doc'), undefined);
    assert.equal(stored('doc'), undefined);
    assert.equal(aside('doc'), text);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, 'corrupt');
  });

  // -------------------------------------------------------------- newer version

  test(named('a newer document than the game knows is refused, reported and left untouched'), async () => {
    const text = raw(5, { future: true });
    const { storage, stored, aside, issues, onIssue } = setup({ initial: { doc: text } });
    storage.register('doc', 2, { 1: (d) => d }, { onIssue });
    assert.equal(await storage.load('doc'), undefined);
    assert.equal(stored('doc'), text);
    assert.equal(aside('doc'), undefined);
    assert.deepEqual(issues, [{ name: 'doc', kind: 'newer-version', storedVersion: 5, currentVersion: 2 }]);
  });

  test(named('saving over a newer document is refused and leaves it untouched'), async () => {
    const text = raw(5, { future: true });
    const { storage, stored } = setup({ initial: { doc: text } });
    storage.register('doc', 2, { 1: (d) => d });
    const result = await storage.save('doc', { mine: true });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'newer-version');
    assert.equal(stored('doc'), text);
  });

  test(named('a newer-version refusal without an onIssue callback still resolves to nothing'), async () => {
    const { storage } = setup({ initial: { doc: raw(9, 1) } });
    storage.register('doc', 1, {});
    assert.equal(await storage.load('doc'), undefined);
  });

  // -------------------------------------------------------------- corrupt documents

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

  for (const [kind, text] of Object.entries(corruptCases)) {
    test(named(`a corrupt document (${kind}) is reported as missing and kept aside`), async () => {
      const { storage, stored, aside, issues, onIssue } = setup({ initial: { doc: text } });
      storage.register('doc', 1, {}, { onIssue });
      assert.equal(await storage.load('doc'), undefined);
      assert.equal(aside('doc'), text);
      assert.equal(stored('doc'), undefined);
      assert.equal(issues.length, 1);
      assert.equal(issues[0].name, 'doc');
      assert.equal(issues[0].kind, 'corrupt');
    });
  }

  test(named('a document kept aside is not overwritten until the owner saves a new one'), async () => {
    const text = 'garbage';
    const { storage, aside } = setup({ initial: { doc: text } });
    storage.register('doc', 1, {});
    assert.equal(await storage.load('doc'), undefined);
    assert.equal(await storage.load('doc'), undefined);
    assert.equal(aside('doc'), text);
    assert.deepEqual(await storage.save('doc', { fresh: true }), { ok: true });
    assert.deepEqual(await storage.load('doc'), { fresh: true });
    assert.equal(aside('doc'), text);
  });

  test(named('an unreadable document behaves as missing and is kept aside'), async () => {
    const { storage, stored, aside, fail, issues, onIssue } = setup({ initial: { doc: raw(1, 1) } });
    fail('read');
    storage.register('doc', 1, {}, { onIssue });
    assert.equal(await storage.load('doc'), undefined);
    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, 'unreadable');
    assert.equal(aside('doc'), raw(1, 1));
    assert.equal(stored('doc'), undefined);
    assert.deepEqual(await storage.save('doc', 2), { ok: true });
    assert.equal(aside('doc'), raw(1, 1));
  });

  test(named('an onIssue callback that rejects does not cause an unhandled rejection'), async () => {
    const { storage } = setup({ initial: { doc: 'garbage' } });
    storage.register('doc', 1, {}, { onIssue: async () => { throw new Error('owner bug'); } });
    assert.equal(await storage.load('doc'), undefined);
    await new Promise((r) => setTimeout(r, 0));
  });

  test(named('a failing keep-aside still reports the document as missing'), async () => {
    const { storage, fail } = setup({ initial: { doc: 'garbage' } });
    fail('keepAside');
    storage.register('doc', 1, {});
    assert.equal(await storage.load('doc'), undefined);
  });

  test(named('an onIssue callback that throws does not break load or save'), async () => {
    const { storage, fail } = setup({ initial: { doc: 'garbage' } });
    storage.register('doc', 1, {}, { onIssue: () => { throw new Error('owner bug'); } });
    assert.equal(await storage.load('doc'), undefined);
    fail('write');
    assert.equal((await storage.save('doc', 1)).ok, false);
  });

  // -------------------------------------------------------------- failed saves

  test(named('a failed write is reported, never thrown, and the game goes on'), async () => {
    const { storage, stored, fail, issues, onIssue } = setup();
    fail('write');
    storage.register('doc', 1, {}, { onIssue });
    const result = await storage.save('doc', { a: 1 });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
    assert.ok(result.error, 'the failure is passed on');
    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, 'save-failed');
    assert.equal(stored('doc'), undefined);
  });

  test(named('data that cannot be serialised is a failed save'), async () => {
    const { storage, stored } = setup();
    storage.register('doc', 1, {});
    const cyclic = {};
    cyclic.self = cyclic;
    assert.equal((await storage.save('doc', cyclic)).reason, 'not-serializable');
    assert.equal((await storage.save('doc', 10n)).reason, 'not-serializable');
    assert.equal((await storage.save('doc', undefined)).reason, 'not-serializable');
    assert.equal(stored('doc'), undefined);
  });
}

export function blobStoreSuite(label, make) {
  const named = (title) => `${title} (${label})`;

  test(named('put, get, delete, list and available are all asynchronous'), async () => {
    const { store } = make();
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

  test(named('a blob put under a name is got back byte for byte'), async () => {
    const { store } = make();
    const blob = new Uint8Array(70_000).map((_, i) => (i * 31) & 0xff);
    assert.deepEqual(await store.put('replay-1', blob), { ok: true });
    const back = await store.get('replay-1');
    assert.ok(back instanceof Uint8Array);
    assert.deepEqual(back, blob);
  });

  test(named('an empty blob round-trips; a missing name gets undefined'), async () => {
    const { store } = make();
    await store.put('empty', new Uint8Array(0));
    assert.deepEqual(await store.get('empty'), new Uint8Array(0));
    assert.equal(await store.get('nothing'), undefined);
  });

  test(named('the store keeps its own copy: changing the bytes put or got changes nothing stored'), async () => {
    const { store } = make();
    const blob = bytes(1, 2, 3);
    await store.put('x', blob);
    blob[0] = 99;
    const got = await store.get('x');
    assert.deepEqual(got, bytes(1, 2, 3));
    got[1] = 99;
    assert.deepEqual(await store.get('x'), bytes(1, 2, 3));
  });

  test(named('a blob view onto part of a larger buffer stores only its own bytes'), async () => {
    const { store } = make();
    const buffer = new Uint8Array([9, 9, 1, 2, 3, 9]).buffer;
    await store.put('view', new Uint8Array(buffer, 2, 3));
    const got = await store.get('view');
    assert.deepEqual(got, bytes(1, 2, 3));
    assert.equal(got.byteLength, 3);
  });

  test(named('a second put under the same name replaces the blob'), async () => {
    const { store } = make();
    await store.put('x', bytes(1));
    await store.put('x', bytes(2, 2));
    assert.deepEqual(await store.get('x'), bytes(2, 2));
    assert.deepEqual(await store.list(), ['x']);
  });

  test(named('list names every stored blob once, in sorted order'), async () => {
    const { store } = make();
    assert.deepEqual(await store.list(), []);
    for (const name of ['c', 'a', 'b']) await store.put(name, bytes(1));
    assert.deepEqual(await store.list(), ['a', 'b', 'c']);
  });

  test(named('delete removes a blob; deleting a missing name is not an error'), async () => {
    const { store } = make();
    await store.put('a', bytes(1));
    await store.put('b', bytes(2));
    assert.deepEqual(await store.delete('a'), { ok: true });
    assert.equal(await store.get('a'), undefined);
    assert.deepEqual(await store.list(), ['b']);
    assert.deepEqual(await store.delete('a'), { ok: true });
  });

  test(named('a bad name or a value that is not bytes is a programming error, thrown at once'), () => {
    const { store } = make();
    for (const name of ['', undefined, null, 7, {}]) {
      assert.throws(() => store.put(name, bytes(1)), TypeError, String(name));
      assert.throws(() => store.get(name), TypeError, String(name));
      assert.throws(() => store.delete(name), TypeError, String(name));
    }
    for (const value of [undefined, null, 'text', [1, 2], new ArrayBuffer(2), new Uint16Array(2)]) {
      assert.throws(() => store.put('x', value), TypeError, String(value));
    }
  });

  test(named('a write the implementation refuses is reported, never thrown, and stores nothing'), async () => {
    const { store, names } = make({ failWrites: true });
    const result = await store.put('x', bytes(1));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'write-failed');
    assert.ok(result.error, 'the failure is passed on');
    assert.deepEqual(names(), []);
    const removed = await store.delete('x');
    assert.equal(removed.ok, false);
    assert.equal(removed.reason, 'write-failed');
  });

  test(named('a read the implementation fails rejects, so a failure is never mistaken for a missing blob'), async () => {
    const { store } = make({ initial: { a: bytes(1) }, failReads: true });
    await assert.rejects(store.get('a'));
    await assert.rejects(store.list());
  });

  test(named('a seeded blob is got back and a put one is stored in the implementation'), async () => {
    const { store, stored } = make({ initial: { seeded: bytes(4, 5) } });
    assert.deepEqual(await store.get('seeded'), bytes(4, 5));
    await store.put('new', bytes(6));
    assert.deepEqual(stored('new'), bytes(6));
  });

  test(named('the opened implementation is used and the store persists'), async () => {
    const { store, stored } = make();
    assert.equal(await store.available(), true);
    await store.put('x', bytes(1));
    assert.deepEqual(stored('x'), bytes(1));
  });
}
