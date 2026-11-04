// The leaderboard outbox: the submissions waiting to be sent, at most one per leaderboard, kept
// across sessions (no DOM). The one owner of the OUTBOX_DOC document in platform storage and of the
// blob store opened under the same name, which holds the pending replays apart from the replay
// library's, so the library's retention and reconciliation never touch them.
//
// The document's data is { entries: { <leaderboard name>: { id, score, details, replay } } }: the
// pending game's summary id, its score and details (js/leaderboards/details.js) and the name of its
// replay's blob, which is the summary id.
//
// createOutbox({ storage, openBlobStore }) → outbox
//   storage        the platform storage interface (js/platform/storage.js); the outbox registers
//                  OUTBOX_DOC at OUTBOX_VERSION on it.
//   openBlobStore  (name) → a blob store (js/platform/blob-store.js) opened under that name; called
//                  once, with OUTBOX_DOC.
//
//   load()      → Promise, once: reads the document, then deletes every blob no entry names (a
//                 store that cannot list is left as it is). A missing, corrupt or newer document
//                 is an empty outbox; one the storage refused — newer than this build, unreadable
//                 or corrupt — leaves every blob as it is, so a pending replay is never lost to a
//                 document this session could not read. Repeated calls return the first call's
//                 Promise.
//   entries()   → [{ leaderboard, id, score, details }], the pending games.
//   has(id)     → whether a summary id is pending.
//   offer(leaderboard, { id, score, details }, bytes) → Promise of { queued, replaced }: queued
//                 false when the leaderboard already holds a game of an equal or better (lower)
//                 score; otherwise the replay is written, the entry saved, and the game it
//                 replaced, if any, has its blob deleted and is named by its id in replaced (else
//                 null). A replay whose write fails is kept in memory for the session.
//   replay(leaderboard) → Promise of the pending game's replay bytes, or undefined when it has
//                 none. Rejects when the store cannot read.
//   remove(leaderboard) → Promise; takes the entry out, saves, then deletes its replay.
// Saves and blob writes never reject; offer, replay and remove before load() has settled are
// the caller's to order (js/leaderboards/submit.js runs them one after another).

export const OUTBOX_DOC = 'leaderboards.outbox';
export const OUTBOX_VERSION = 1;

const REFUSING = new Set(['newer-version', 'unreadable', 'corrupt']);

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isEntry = (e) => isPlainObject(e) && typeof e.id === 'string' && e.id !== '' && Number.isInteger(e.score)
  && Array.isArray(e.details) && typeof e.replay === 'string' && e.replay !== '';

export function createOutbox({ storage, openBlobStore }) {
  let refused = false; // the stored document is newer, unreadable or corrupt
  storage.register(OUTBOX_DOC, OUTBOX_VERSION, {}, {
    onIssue: (issue) => { if (REFUSING.has(issue.kind)) refused = true; },
  });
  const blobs = openBlobStore(OUTBOX_DOC);
  const entries = new Map(); // leaderboard → { id, score, details, replay }
  const memory = new Map(); // blob name → bytes whose write failed
  let loading = null;

  const save = () => storage.save(OUTBOX_DOC, { entries: Object.fromEntries(entries) });

  async function deleteBlob(name) {
    memory.delete(name);
    await blobs.delete(name);
  }

  async function reconcile() {
    let names;
    try {
      names = await blobs.list();
    } catch {
      return;
    }
    const kept = new Set([...entries.values()].map((e) => e.replay));
    for (const name of names) if (!kept.has(name)) await blobs.delete(name);
  }

  async function read() {
    const data = await storage.load(OUTBOX_DOC);
    if (isPlainObject(data) && isPlainObject(data.entries)) {
      for (const [leaderboard, e] of Object.entries(data.entries)) {
        if (isEntry(e)) entries.set(leaderboard, { id: e.id, score: e.score, details: [...e.details], replay: e.replay });
      }
    }
    if (!refused) await reconcile();
  }

  return {
    load() {
      loading ??= read();
      return loading;
    },
    entries: () => [...entries].map(([leaderboard, e]) => ({ leaderboard, id: e.id, score: e.score, details: [...e.details] })),
    has: (id) => [...entries.values()].some((e) => e.id === id),
    async offer(leaderboard, { id, score, details }, bytes) {
      const held = entries.get(leaderboard);
      if (held && held.score <= score) return { queued: false, replaced: null };
      const put = await blobs.put(id, bytes);
      if (!put.ok) memory.set(id, bytes);
      entries.set(leaderboard, { id, score, details: [...details], replay: id });
      await save();
      if (held) await deleteBlob(held.replay);
      return { queued: true, replaced: held ? held.id : null };
    },
    async replay(leaderboard) {
      const e = entries.get(leaderboard);
      if (!e) return undefined;
      return memory.get(e.replay) ?? blobs.get(e.replay);
    },
    async remove(leaderboard) {
      const e = entries.get(leaderboard);
      if (!e) return;
      entries.delete(leaderboard);
      await save();
      await deleteBlob(e.replay);
    },
  };
}
