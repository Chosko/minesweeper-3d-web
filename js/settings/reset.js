// Reset all data: deletes everything the game keeps in this browser, then reloads into a new
// player's profile. Every owner loads its document at start-up and holds its own copy, so the
// fresh profile is reached through a reload rather than a reset on each store. DOM-free apart from
// the default legacy remover.
//
// createReset({ storage, blobStore, legacy?, waitFor?, reload }) → { run }
//   storage    the platform storage interface: its clear() removes every document and kept-aside
//              copy.
//   blobStore  the platform blob store: every blob its list() names is deleted.
//   legacy     { remove(key) } over the loose ms3d.* keys; defaults to the global localStorage,
//              where blocked or missing storage has nothing to remove. A remove that throws is a
//              failure.
//   waitFor    () → Promise awaited before anything is cleared (the replay library's start-up load
//              and queued work), so no owner saves a cleared document back; a rejection is ignored.
//   reload     () → called once, after everything was cleared.
//
//   run() → Promise of { ok: true } once reload() was called, or { ok: false, failed, message }
//           where failed lists what could not be deleted ('documents', 'replays', 'keys') and
//           message says so for the player. Every part is attempted whatever fails before it, and
//           nothing reloads after a failure, so the player can try again. Never rejects.

import { LEGACY_KEYS } from './store.js';

/** The pre-platform first-use flag of the H hint. */
export const FIRST_USE_LEGACY_KEY = 'ms3d.hintH.done';

/**
 * The loose keys a reset removes: the four the settings store carries over, which would otherwise
 * re-import the old settings at the next start, and the first-use flag. The other ms3d.* keys are
 * read by nothing and stay.
 */
export const RESET_KEYS = Object.freeze([...Object.values(LEGACY_KEYS), FIRST_USE_LEGACY_KEY]);

const FAILURE_LINES = Object.freeze({
  documents: 'Records, game history, settings, last board choices and first-use hints could not be deleted.',
  replays: 'Replays could not be deleted.',
  keys: 'Old settings could not be deleted.',
});

const browserLegacy = {
  remove(key) {
    let local = null;
    try {
      local = globalThis.localStorage ?? null;
    } catch {
      return; // blocked storage: nothing to remove
    }
    local?.removeItem(key);
  },
};

export function failureMessage(failed) {
  const lines = failed.map((part) => FAILURE_LINES[part]);
  if (failed.length < Object.keys(FAILURE_LINES).length) lines.push('The rest was deleted.');
  return lines.join(' ');
}

export function createReset({ storage, blobStore, legacy = browserLegacy, waitFor = () => {}, reload }) {
  async function clearDocuments() {
    try {
      return (await storage.clear()).ok === true;
    } catch {
      return false;
    }
  }

  async function clearReplays() {
    let names;
    try {
      names = await blobStore.list();
    } catch {
      return false;
    }
    let ok = true;
    for (const name of names) {
      try {
        if ((await blobStore.delete(name)).ok !== true) ok = false;
      } catch {
        ok = false;
      }
    }
    return ok;
  }

  function clearKeys() {
    let ok = true;
    for (const key of RESET_KEYS) {
      try {
        legacy.remove(key);
      } catch {
        ok = false;
      }
    }
    return ok;
  }

  async function run() {
    try {
      await waitFor();
    } catch {
      // A library that failed to load saves nothing back either.
    }
    const failed = [];
    if (!(await clearDocuments())) failed.push('documents');
    if (!(await clearReplays())) failed.push('replays');
    if (!clearKeys()) failed.push('keys');
    if (failed.length > 0) return { ok: false, failed, message: failureMessage(failed) };
    reload();
    return { ok: true };
  }

  return { run };
}
