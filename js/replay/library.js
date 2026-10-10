// The replay library: the one owner and only writer of the replay store (the platform blob store)
// and of the library index, a versioned document in platform storage listing every kept replay.
// It keeps every pinned replay and the newest RETAINED_UNPINNED unpinned ones across both modes.
// DOM-free.
//
// createReplayLibrary({ storage, blobStore, onNotSaved? }) → library
//   storage     the platform storage interface (js/platform/index.js's `storage`).
//   blobStore   the platform blob store (js/platform/index.js's `blobStore`).
//   onNotSaved  ({ reason }) — called at most once per library, the first time a blob write or an
//               index save fails; the library goes on in memory.
//
//   load()      → Promise, awaited at start-up; repeated calls return the first call's Promise.
//                 When both the index and the store persist, loads the index once and reconciles
//                 it with the store: a blob with no index entry is deleted, an entry with no blob
//                 is dropped and the index saved. A store that cannot list skips reconciliation,
//                 so a read failure never drops an entry. When either cannot persist, or the
//                 stored index is newer than this build, unreadable or corrupt, the session runs
//                 an in-memory library that saves nothing: the stored index and blobs are left
//                 untouched, so no pinned replay is lost to an index it could not read.
//   add(blob, listing, setBest) → Promise. blob is the sealed replay's bytes, listing its listing
//                 fields (js/replay/recorder.js). Writes the blob, then the index entry, then
//                 applies retention. setBest pins it with the reason PIN_BEST. Adding an id
//                 already added is a no-op. A failed blob write leaves no entry, is reported
//                 through onNotSaved and keeps the bytes for bytes() this session.
//   pin(id)     → Promise; adds the reason PIN_HAND.
//   unpin(id)   → Promise; clears every reason, then applies retention.
//                 pin and unpin of an id with no entry change nothing.
//   forBoard(boardKey) → the entries kept for the board, newest end date first. Each entry is a
//                 frozen { id, boardKey, mode, outcome, elapsedMs, bbbvPerSecond, efficiency,
//                 endedAt, size, pins }, pins the frozen list of its reasons.
//   has(id)     → whether the summary id has a kept replay (an index entry).
//   bytes(id)   → Promise of a kept replay's bytes, or of a replay kept only for the session after
//                 a failed write; undefined when there is none. Rejects when the store cannot read.
//   onChange(fn) → unsubscribe. fn(change) after each add { kind: 'add', id }, pin
//                 { kind: 'pin', id }, unpin { kind: 'unpin', id } and removal
//                 { kind: 'remove', ids } (oldest first).
//   available() → whether replays are saved this session.
//   settled()   → Promise that resolves once every operation queued so far has finished.
// add, pin and unpin before load() throw: that is a programming error.
//
// Retention: after each add and unpin, the unpinned entries beyond the newest RETAINED_UNPINNED by
// end date are removed from the index, the index is saved, then their blobs are deleted, oldest
// first. A blob whose delete fails is an orphan the next start-up's reconciliation deletes.
// Pinned replays are never removed by retention or by a storage failure.

export const LIBRARY_DOC = 'replays.library';
export const LIBRARY_VERSION = 1;
export const RETAINED_UNPINNED = 100;
export const PIN_BEST = 'best';
export const PIN_HAND = 'hand';

const REFUSING = new Set(['newer-version', 'unreadable', 'corrupt']);
const FIELDS = ['id', 'boardKey', 'mode', 'outcome', 'elapsedMs', 'bbbvPerSecond', 'efficiency', 'endedAt', 'size'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isEntry = (e) => isPlainObject(e) && typeof e.id === 'string' && e.id !== ''
  && typeof e.boardKey === 'string' && Array.isArray(e.pins) && e.pins.every((p) => typeof p === 'string');
const endTime = (e) => {
  const t = Date.parse(e.endedAt);
  return Number.isNaN(t) ? -Infinity : t;
};
const newestFirst = (a, b) => endTime(b) - endTime(a);

function entryOf(listing, pins) {
  const entry = {};
  for (const key of FIELDS) entry[key] = listing[key];
  entry.pins = [...pins];
  return entry;
}

const frozen = (entry) => Object.freeze({ ...entry, pins: Object.freeze([...entry.pins]) });

export function createReplayLibrary({ storage, blobStore, onNotSaved = () => {} }) {
  let refusedIndex = false; // the stored index is newer, unreadable or corrupt
  storage.register(LIBRARY_DOC, LIBRARY_VERSION, {}, {
    onIssue: (issue) => { if (REFUSING.has(issue.kind)) refusedIndex = true; },
  });

  const entries = new Map(); // id → entry, the index in memory
  const memory = new Map(); // id → bytes, the store of an in-memory library
  const sessionOnly = new Map(); // id → bytes whose blob write failed
  const known = new Set(); // every id added this session or loaded
  const listeners = new Set();
  let persists = false;
  let loading = null;
  let loaded = false;
  let reported = false;
  let queue = Promise.resolve();

  function report(reason) {
    if (reported) return;
    reported = true;
    try { onNotSaved({ reason }); } catch { /* reporting never fails the library */ }
  }

  function notify(change) {
    for (const fn of [...listeners]) {
      try { fn(change); } catch (err) { console.error(err); }
    }
  }

  // Operations run one after another, in the order they were asked for.
  function run(op) {
    const result = queue.then(op);
    queue = result.catch(() => {});
    return result;
  }

  const ready = () => { if (!loaded) throw new Error('replay library: used before load()'); };

  async function saveIndex() {
    if (!persists) return;
    const result = await storage.save(LIBRARY_DOC, { entries: [...entries.values()] });
    if (!result.ok) report(result.reason);
  }

  async function deleteBlob(id) {
    if (persists) await blobStore.delete(id);
    else memory.delete(id);
  }

  async function retain() {
    const unpinned = [...entries.values()].filter((e) => e.pins.length === 0).sort(newestFirst);
    const excess = unpinned.slice(RETAINED_UNPINNED).reverse();
    if (excess.length === 0) return;
    for (const e of excess) entries.delete(e.id);
    await saveIndex();
    for (const e of excess) await deleteBlob(e.id);
    notify({ kind: 'remove', ids: excess.map((e) => e.id) });
  }

  async function reconcile() {
    let names;
    try {
      names = new Set(await blobStore.list());
    } catch {
      return; // the store cannot read: nothing is dropped and nothing deleted
    }
    const dropped = [...entries.keys()].filter((id) => !names.has(id));
    for (const id of dropped) {
      entries.delete(id);
      known.delete(id);
    }
    for (const name of names) {
      if (!entries.has(name)) await blobStore.delete(name);
    }
    if (dropped.length > 0) await saveIndex();
  }

  async function doLoad() {
    if (storage.available() && await blobStore.available()) {
      const data = await storage.load(LIBRARY_DOC);
      if (!refusedIndex) {
        persists = true;
        const stored = isPlainObject(data) && Array.isArray(data.entries) ? data.entries : [];
        for (const e of stored) {
          if (!isEntry(e) || entries.has(e.id)) continue;
          entries.set(e.id, entryOf(e, e.pins));
          known.add(e.id);
        }
        await reconcile();
      }
    }
    loaded = true;
  }

  return {
    load() {
      loading ??= doLoad();
      return loading;
    },

    add(blob, listing, setBest) {
      ready();
      const { id } = listing;
      if (known.has(id)) return Promise.resolve();
      known.add(id);
      const bytes = new Uint8Array(blob);
      return run(async () => {
        if (persists) {
          const result = await blobStore.put(id, bytes);
          if (!result.ok) {
            sessionOnly.set(id, bytes);
            report(result.reason);
            return;
          }
        } else {
          memory.set(id, bytes);
        }
        entries.set(id, entryOf(listing, setBest ? [PIN_BEST] : []));
        await saveIndex();
        notify({ kind: 'add', id });
        await retain();
      });
    },

    pin(id) {
      ready();
      return run(async () => {
        const entry = entries.get(id);
        if (!entry || entry.pins.includes(PIN_HAND)) return;
        entry.pins = [...entry.pins, PIN_HAND];
        await saveIndex();
        notify({ kind: 'pin', id });
      });
    },

    unpin(id) {
      ready();
      return run(async () => {
        const entry = entries.get(id);
        if (!entry) return;
        entry.pins = [];
        await saveIndex();
        notify({ kind: 'unpin', id });
        await retain();
      });
    },

    forBoard(boardKey) {
      return [...entries.values()].filter((e) => e.boardKey === boardKey).sort(newestFirst).map(frozen);
    },

    has(id) { return entries.has(id); },

    async bytes(id) {
      if (entries.has(id)) {
        if (persists) return blobStore.get(id);
        const kept = memory.get(id);
        return kept && new Uint8Array(kept);
      }
      const kept = sessionOnly.get(id);
      return kept && new Uint8Array(kept);
    },

    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },

    available() { return persists; },

    settled() { return queue; },
  };
}
