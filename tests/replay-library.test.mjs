// The replay library (js/replay/library.js) over platform storage on the in-memory backend and the
// blob store on the in-memory implementation: the versioned index document, add, the newest-100
// retention, best and hand pinning, the queries, change notification, start-up reconciliation and
// the failure rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createBlobStore } from '../js/platform/blob-store.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import {
  createReplayLibrary, LIBRARY_DOC, LIBRARY_VERSION, RETAINED_UNPINNED, PIN_BEST, PIN_HAND,
} from '../js/replay/library.js';

const BOARD = 'classic-2d:square:9x9:10:standard';
const OTHER = 'classic-2d:square:16x16:40:standard';

let clock = Date.parse('2026-10-01T00:00:00.000Z');
let nextId = 1;

// A sealed replay: its blob and its listing fields, one minute after the previous one unless an
// end date is given.
function replay({ id = `r-${nextId++}`, boardKey = BOARD, endedAt, outcome = 'won' } = {}) {
  clock += 60000;
  const blob = new Uint8Array([nextId & 255, 1, 2, 3]);
  return {
    blob,
    listing: {
      id, boardKey, mode: 'classic-2d', outcome, elapsedMs: 12345, bbbvPerSecond: 1.5,
      efficiency: 0.9, endedAt: endedAt ?? new Date(clock).toISOString(), size: blob.length,
    },
  };
}

const doc = (version, data) => JSON.stringify({ version, data });
const stored = (backend) => {
  const text = backend.documents.get(LIBRARY_DOC);
  return text === undefined ? undefined : JSON.parse(text);
};

// A library over fresh in-memory storage and blob store. `log` records every persistent write in
// order: `blob:put:<id>`, `blob:delete:<id>`, `index`.
async function setup({
  initialDocs = {}, initialBlobs = {}, storageAvailable = true, failIndexWrites = false, failIndexReads = false,
  blobOptions = {}, blobOpens = true, load = true, onNotSaved,
} = {}) {
  const log = [];
  const backend = createMemoryBackend({ initial: initialDocs, available: storageAvailable });
  const write = backend.write;
  backend.write = async (name, text) => {
    if (failIndexWrites && name === LIBRARY_DOC) throw new Error('index refused');
    await write(name, text);
    if (name === LIBRARY_DOC) log.push('index');
  };
  const read = backend.read;
  backend.read = async (name) => {
    if (failIndexReads && name === LIBRARY_DOC) throw new Error('index unreadable');
    return read(name);
  };
  const storage = createStorage({ backend });
  const impl = createMemoryBlobStore({ initial: initialBlobs, ...blobOptions });
  const put = impl.put;
  impl.put = async (name, bytes) => { await put(name, bytes); log.push(`blob:put:${name}`); };
  const del = impl.delete;
  impl.delete = async (name) => { await del(name); log.push(`blob:delete:${name}`); };
  const blobStore = createBlobStore({
    open: () => { if (!blobOpens) throw new Error('no IndexedDB'); return impl; },
    fallback: () => createMemoryBlobStore(),
  });
  const notices = [];
  const library = createReplayLibrary({
    storage, blobStore, onNotSaved: onNotSaved ?? ((notice) => notices.push(notice)),
  });
  if (load) await library.load();
  return { library, backend, impl, log, notices };
}

async function addAll(library, replays, setBest = false) {
  for (const r of replays) await library.add(r.blob, r.listing, setBest);
  await library.settled();
}

// ---------------------------------------------------------------- the index document

test('the index is a registered document with its own format version', async () => {
  const { library, backend } = await setup();
  const r = replay();
  await library.add(r.blob, r.listing, false);
  await library.settled();
  const saved = stored(backend);
  assert.equal(saved.version, LIBRARY_VERSION);
  assert.equal(LIBRARY_VERSION, 1);
  assert.equal(LIBRARY_DOC, 'replays.library');
  assert.deepEqual(saved.data.entries, [{ ...r.listing, pins: [] }]);
});

test('an index entry carries every listing field and its pin reasons', async () => {
  const { library } = await setup();
  const r = replay({ outcome: 'lost' });
  await library.add(r.blob, r.listing, true);
  const [entry] = library.forBoard(BOARD);
  for (const key of ['id', 'boardKey', 'mode', 'outcome', 'elapsedMs', 'bbbvPerSecond', 'efficiency', 'endedAt', 'size']) {
    assert.equal(entry[key], r.listing[key], key);
  }
  assert.deepEqual(entry.pins, [PIN_BEST]);
});

test('the library loads a stored index once', async () => {
  const r = replay();
  const { library } = await setup({
    initialDocs: { [LIBRARY_DOC]: doc(1, { entries: [{ ...r.listing, pins: [PIN_HAND] }] }) },
    initialBlobs: { [r.listing.id]: r.blob },
  });
  assert.equal(library.load(), library.load());
  assert.equal(library.has(r.listing.id), true);
  assert.deepEqual(library.forBoard(BOARD)[0].pins, [PIN_HAND]);
});

test('add, pin and unpin before load() throw', async () => {
  const { library } = await setup({ load: false });
  const r = replay();
  assert.throws(() => library.add(r.blob, r.listing, false), /before load/);
  assert.throws(() => library.pin(r.listing.id), /before load/);
  assert.throws(() => library.unpin(r.listing.id), /before load/);
});

// ---------------------------------------------------------------- add

test('add writes the blob, then the index entry, then applies retention', async () => {
  const replays = Array.from({ length: RETAINED_UNPINNED }, () => replay());
  const { library, log } = await setup();
  await addAll(library, replays);
  log.length = 0;
  const r = replay();
  await library.add(r.blob, r.listing, false);
  await library.settled();
  const oldest = replays[0].listing.id;
  assert.equal(log[0], `blob:put:${r.listing.id}`);
  const indexAt = log.indexOf('index');
  const deleteAt = log.indexOf(`blob:delete:${oldest}`);
  assert.ok(indexAt > 0, 'the index is saved after the blob');
  assert.ok(deleteAt > indexAt, 'retention runs after the entry is saved');
});

test('the blob is stored under the replay id with its bytes', async () => {
  const { library, impl } = await setup();
  const r = replay();
  await library.add(r.blob, r.listing, false);
  assert.deepEqual(impl.blobs.get(r.listing.id), r.blob);
  assert.deepEqual(await library.bytes(r.listing.id), r.blob);
});

test('adding the same id twice is a no-op', async () => {
  const { library, log } = await setup();
  const r = replay();
  const changes = [];
  library.onChange((change) => changes.push(change));
  await library.add(r.blob, r.listing, false);
  await library.settled();
  const writes = log.length;
  await library.add(r.blob, r.listing, true);
  await library.settled();
  assert.equal(log.length, writes);
  assert.equal(changes.length, 1);
  assert.equal(library.forBoard(BOARD).length, 1);
  assert.deepEqual(library.forBoard(BOARD)[0].pins, []);
});

test('the same id added twice at once is written once', async () => {
  const { library, log } = await setup();
  const r = replay();
  await Promise.all([library.add(r.blob, r.listing, false), library.add(r.blob, r.listing, false)]);
  await library.settled();
  assert.equal(log.filter((s) => s.startsWith('blob:put')).length, 1);
  assert.equal(library.forBoard(BOARD).length, 1);
});

test('a game that set a best is pinned with the reason "best"', async () => {
  const { library, backend } = await setup();
  const best = replay();
  const plain = replay();
  await library.add(best.blob, best.listing, true);
  await library.add(plain.blob, plain.listing, false);
  await library.settled();
  const pins = Object.fromEntries(stored(backend).data.entries.map((e) => [e.id, e.pins]));
  assert.deepEqual(pins[best.listing.id], [PIN_BEST]);
  assert.deepEqual(pins[plain.listing.id], []);
});

// ---------------------------------------------------------------- retention

test('retention keeps the newest 100 unpinned replays across both modes, deleting the oldest first', async () => {
  assert.equal(RETAINED_UNPINNED, 100);
  const replays = Array.from({ length: 105 }, (_, i) => {
    const r = replay({ boardKey: i % 2 ? BOARD : OTHER });
    if (i % 3 === 0) r.listing.mode = 'minesweeper-3d';
    return r;
  });
  const { library, impl, log } = await setup();
  await addAll(library, replays);
  const kept = new Set([...library.forBoard(BOARD), ...library.forBoard(OTHER)].map((e) => e.id));
  assert.equal(kept.size, 100);
  for (const r of replays.slice(0, 5)) {
    assert.equal(library.has(r.listing.id), false);
    assert.equal(impl.blobs.has(r.listing.id), false);
  }
  for (const r of replays.slice(5)) assert.equal(library.has(r.listing.id), true);
  const deletes = log.filter((s) => s.startsWith('blob:delete')).map((s) => s.slice('blob:delete:'.length));
  assert.deepEqual(deletes, replays.slice(0, 5).map((r) => r.listing.id));
});

test('retention orders by end date, not by the order replays were added', async () => {
  const replays = Array.from({ length: 100 }, () => replay());
  const late = replay({ endedAt: '2020-01-01T00:00:00.000Z' });
  const { library } = await setup();
  await addAll(library, replays);
  await library.add(late.blob, late.listing, false);
  await library.settled();
  assert.equal(library.has(late.listing.id), false);
  assert.equal(library.has(replays[0].listing.id), true);
});

test('pinned replays are never deleted by retention', async () => {
  const pinned = Array.from({ length: 3 }, () => replay());
  const handPinned = replay();
  const rest = Array.from({ length: 110 }, () => replay());
  const { library, impl } = await setup();
  await addAll(library, pinned, true);
  await library.add(handPinned.blob, handPinned.listing, false);
  await library.pin(handPinned.listing.id);
  await addAll(library, rest);
  for (const r of [...pinned, handPinned]) {
    assert.equal(library.has(r.listing.id), true);
    assert.equal(impl.blobs.has(r.listing.id), true);
  }
  const unpinned = library.forBoard(BOARD).filter((e) => e.pins.length === 0);
  assert.equal(unpinned.length, 100);
});

// ---------------------------------------------------------------- pinning

test('pin sets the hand-pin reason and keeps an existing best reason', async () => {
  const { library, backend } = await setup();
  const a = replay();
  const b = replay();
  await library.add(a.blob, a.listing, false);
  await library.add(b.blob, b.listing, true);
  await library.pin(a.listing.id);
  await library.pin(b.listing.id);
  await library.pin(b.listing.id);
  await library.settled();
  const pins = Object.fromEntries(stored(backend).data.entries.map((e) => [e.id, e.pins]));
  assert.deepEqual(pins[a.listing.id], [PIN_HAND]);
  assert.deepEqual(pins[b.listing.id], [PIN_BEST, PIN_HAND]);
});

test('unpin clears every reason and applies retention', async () => {
  const old = replay();
  const rest = Array.from({ length: 100 }, () => replay());
  const { library, impl, backend } = await setup();
  await library.add(old.blob, old.listing, true);
  await library.pin(old.listing.id);
  await addAll(library, rest);
  assert.equal(library.has(old.listing.id), true);
  await library.unpin(old.listing.id);
  await library.settled();
  assert.equal(library.has(old.listing.id), false);
  assert.equal(impl.blobs.has(old.listing.id), false);
  assert.equal(stored(backend).data.entries.some((e) => e.id === old.listing.id), false);
});

test('unpin of a replay within the newest 100 keeps it, with no reasons', async () => {
  const { library } = await setup();
  const r = replay();
  await library.add(r.blob, r.listing, true);
  await library.pin(r.listing.id);
  await library.unpin(r.listing.id);
  assert.deepEqual(library.forBoard(BOARD)[0].pins, []);
});

test('pin and unpin of an unknown id change nothing', async () => {
  const { library, log } = await setup();
  const changes = [];
  library.onChange((c) => changes.push(c));
  await library.pin('missing');
  await library.unpin('missing');
  await library.settled();
  assert.deepEqual(changes, []);
  assert.deepEqual(log, []);
});

// ---------------------------------------------------------------- queries and notification

test('forBoard lists the replays kept for one board key, newest first', async () => {
  const { library } = await setup();
  const a = replay();
  const other = replay({ boardKey: OTHER });
  const b = replay();
  await addAll(library, [a, other, b]);
  assert.deepEqual(library.forBoard(BOARD).map((e) => e.id), [b.listing.id, a.listing.id]);
  assert.deepEqual(library.forBoard(OTHER).map((e) => e.id), [other.listing.id]);
  assert.deepEqual(library.forBoard('nothing'), []);
});

test('the listed entries are copies the caller cannot change the library through', async () => {
  const { library } = await setup();
  const r = replay();
  await library.add(r.blob, r.listing, false);
  const [entry] = library.forBoard(BOARD);
  try { entry.pins.push(PIN_HAND); } catch { /* frozen */ }
  try { entry.id = 'other'; } catch { /* frozen */ }
  assert.deepEqual(library.forBoard(BOARD)[0].pins, []);
  assert.equal(library.forBoard(BOARD)[0].id, r.listing.id);
});

test('has tells whether a summary id has a kept replay; bytes gives its bytes', async () => {
  const { library } = await setup();
  const r = replay();
  assert.equal(library.has(r.listing.id), false);
  assert.equal(await library.bytes(r.listing.id), undefined);
  await library.add(r.blob, r.listing, false);
  assert.equal(library.has(r.listing.id), true);
  assert.deepEqual(await library.bytes(r.listing.id), r.blob);
});

test('subscribers are told after each add, pin, unpin and removal', async () => {
  const first = replay();
  const rest = Array.from({ length: 100 }, () => replay());
  const { library } = await setup();
  const changes = [];
  const off = library.onChange((change) => changes.push(change));
  await library.add(first.blob, first.listing, false);
  assert.deepEqual(changes, [{ kind: 'add', id: first.listing.id }]);
  await library.pin(first.listing.id);
  assert.deepEqual(changes.at(-1), { kind: 'pin', id: first.listing.id });
  await library.unpin(first.listing.id);
  assert.deepEqual(changes.at(-1), { kind: 'unpin', id: first.listing.id });
  changes.length = 0;
  await addAll(library, rest);
  assert.deepEqual(changes.at(-2), { kind: 'add', id: rest.at(-1).listing.id });
  assert.deepEqual(changes.at(-1), { kind: 'remove', ids: [first.listing.id] });
  off();
  const after = replay();
  await library.add(after.blob, after.listing, false);
  assert.equal(changes.at(-1).kind, 'remove');
});

test('a subscriber that throws does not stop the others', async () => {
  const { library } = await setup();
  const seen = [];
  const error = console.error;
  console.error = () => {};
  try {
    library.onChange(() => { throw new Error('bad subscriber'); });
    library.onChange((c) => seen.push(c.kind));
    const r = replay();
    await library.add(r.blob, r.listing, false);
  } finally {
    console.error = error;
  }
  assert.deepEqual(seen, ['add']);
});

// ---------------------------------------------------------------- start-up reconciliation

test('at start-up a blob with no index entry is deleted', async () => {
  const kept = replay();
  const orphan = replay();
  const { library, impl } = await setup({
    initialDocs: { [LIBRARY_DOC]: doc(1, { entries: [{ ...kept.listing, pins: [] }] }) },
    initialBlobs: { [kept.listing.id]: kept.blob, [orphan.listing.id]: orphan.blob },
  });
  assert.equal(impl.blobs.has(orphan.listing.id), false);
  assert.equal(impl.blobs.has(kept.listing.id), true);
  assert.equal(library.has(kept.listing.id), true);
});

test('at start-up an index entry with no blob is dropped and the index saved', async () => {
  const kept = replay();
  const lost = replay();
  const { library, backend } = await setup({
    initialDocs: { [LIBRARY_DOC]: doc(1, { entries: [{ ...kept.listing, pins: [] }, { ...lost.listing, pins: [PIN_BEST] }] }) },
    initialBlobs: { [kept.listing.id]: kept.blob },
  });
  await library.settled();
  assert.equal(library.has(lost.listing.id), false);
  assert.deepEqual(stored(backend).data.entries.map((e) => e.id), [kept.listing.id]);
});

test('a store that cannot list at start-up drops no entry and deletes no blob', async () => {
  const kept = replay();
  const { library, backend, log } = await setup({
    initialDocs: { [LIBRARY_DOC]: doc(1, { entries: [{ ...kept.listing, pins: [PIN_BEST] }] }) },
    blobOptions: { failReads: true },
  });
  await library.settled();
  assert.equal(library.has(kept.listing.id), true);
  assert.deepEqual(log, []);
  assert.deepEqual(stored(backend).data.entries.map((e) => e.id), [kept.listing.id]);
});

test('a missing or malformed index loads as an empty library', async () => {
  for (const data of [undefined, null, { entries: 'x' }, { entries: [{ id: 3 }] }]) {
    const initialDocs = data === undefined ? {} : { [LIBRARY_DOC]: doc(1, data) };
    const { library } = await setup({ initialDocs });
    assert.deepEqual(library.forBoard(BOARD), []);
  }
});

// ---------------------------------------------------------------- failure rules

test('when the replay store cannot persist, the library works in memory and reports it', async () => {
  const kept = replay();
  const index = doc(1, { entries: [{ ...kept.listing, pins: [] }] });
  const { library, backend } = await setup({ blobOpens: false, initialDocs: { [LIBRARY_DOC]: index } });
  assert.equal(library.available(), false);
  const r = replay();
  await library.add(r.blob, r.listing, true);
  await library.settled();
  assert.equal(library.has(r.listing.id), true);
  assert.deepEqual(await library.bytes(r.listing.id), r.blob);
  assert.equal(backend.documents.get(LIBRARY_DOC), index, 'the stored index is left untouched');
});

test('when the index cannot persist, the library works in memory and reports it', async () => {
  const { library, impl } = await setup({ storageAvailable: false });
  assert.equal(library.available(), false);
  const r = replay();
  await library.add(r.blob, r.listing, false);
  await library.settled();
  assert.equal(library.has(r.listing.id), true);
  assert.deepEqual(await library.bytes(r.listing.id), r.blob);
  assert.equal(impl.blobs.size, 0, 'nothing is written to the store');
});

test('retention applies to an in-memory library too', async () => {
  const replays = Array.from({ length: 102 }, () => replay());
  const { library } = await setup({ blobOpens: false });
  await addAll(library, replays);
  assert.equal(library.has(replays[0].listing.id), false);
  assert.equal(await library.bytes(replays[0].listing.id), undefined);
  assert.equal(library.has(replays[2].listing.id), true);
});

test('a failed blob write leaves no entry, is reported once and keeps the replay for the session', async () => {
  const { library, backend, notices } = await setup({ blobOptions: { failWrites: true } });
  const a = replay();
  const b = replay();
  const changes = [];
  library.onChange((c) => changes.push(c));
  await library.add(a.blob, a.listing, true);
  await library.add(b.blob, b.listing, false);
  await library.settled();
  assert.equal(library.has(a.listing.id), false);
  assert.deepEqual(library.forBoard(BOARD), []);
  assert.equal(stored(backend), undefined);
  assert.deepEqual(notices, [{ reason: 'write-failed' }]);
  assert.deepEqual(await library.bytes(a.listing.id), a.blob);
  assert.deepEqual(await library.bytes(b.listing.id), b.blob);
  assert.deepEqual(changes, []);
});

test('a failed index save is reported once and the library goes on in memory', async () => {
  const { library, notices } = await setup({ failIndexWrites: true });
  const a = replay();
  const b = replay();
  await library.add(a.blob, a.listing, false);
  await library.add(b.blob, b.listing, false);
  await library.settled();
  assert.deepEqual(notices, [{ reason: 'write-failed' }]);
  assert.equal(library.has(a.listing.id), true);
  assert.equal(library.has(b.listing.id), true);
});

test('a newer index version leaves stored data untouched and saves nothing', async () => {
  const known = replay();
  const orphan = replay();
  const newer = doc(LIBRARY_VERSION + 1, { entries: [{ ...known.listing, pins: [] }], extra: true });
  const { library, backend, impl, log } = await setup({
    initialDocs: { [LIBRARY_DOC]: newer },
    initialBlobs: { [known.listing.id]: known.blob, [orphan.listing.id]: orphan.blob },
  });
  assert.equal(library.available(), false);
  assert.equal(library.has(known.listing.id), false);
  const r = replay();
  await library.add(r.blob, r.listing, true);
  await library.pin(r.listing.id);
  await library.unpin(r.listing.id);
  await library.settled();
  assert.equal(library.has(r.listing.id), true);
  assert.deepEqual(await library.bytes(r.listing.id), r.blob);
  assert.equal(backend.documents.get(LIBRARY_DOC), newer);
  assert.deepEqual(log, []);
  assert.deepEqual([...impl.blobs.keys()].sort(), [known.listing.id, orphan.listing.id].sort());
});

test('an unreadable or corrupt index deletes no blob and saves nothing', async () => {
  for (const { label, options } of [
    { label: 'corrupt', options: { initialDocs: { [LIBRARY_DOC]: '{not json' } } },
    { label: 'unreadable', options: { failIndexReads: true } },
  ]) {
    const pinned = replay();
    const { library, impl, log } = await setup({
      ...options, initialBlobs: { [pinned.listing.id]: pinned.blob },
    });
    assert.equal(library.available(), false, label);
    const r = replay();
    await library.add(r.blob, r.listing, false);
    await library.settled();
    assert.equal(library.has(r.listing.id), true, label);
    assert.deepEqual(log, [], label);
    assert.deepEqual([...impl.blobs.keys()], [pinned.listing.id], label);
  }
});

test('a storage failure never deletes a pinned replay', async () => {
  const pinned = replay();
  const { library, impl } = await setup({
    initialDocs: { [LIBRARY_DOC]: doc(1, { entries: [{ ...pinned.listing, pins: [PIN_HAND] }] }) },
    initialBlobs: { [pinned.listing.id]: pinned.blob },
    failIndexWrites: true,
  });
  const rest = Array.from({ length: 102 }, () => replay());
  await addAll(library, rest);
  assert.equal(library.has(pinned.listing.id), true);
  assert.equal(impl.blobs.has(pinned.listing.id), true);
});

test('the library module is DOM-free', () => {
  const source = readFileSync(new URL('../js/replay/library.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\b(document|window|localStorage|indexedDB)\b\./);
  assert.doesNotMatch(source, /from '\.\.\/platform\/(memory|indexeddb|browser)/);
});
