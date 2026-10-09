// Browser storage backend: the web build's implementation of the backend contract
// js/platform/storage.js runs over. Each document's text lives in Web Storage under one
// namespaced key, DOC_PREFIX + name; a corrupt document's text is kept aside under
// ASIDE_PREFIX + name. It never touches any other key, the legacy `ms3d.*` keys included.
//
// createBrowserBackend({ getStorage }?) → { read, write, keepAside, available }
//   getStorage() → the Storage object to use; defaults to the global localStorage. Called once,
//                  at creation. A getter that throws (storage blocked) or returns nothing means
//                  there is no storage: nothing is read and every write fails.
//   read(name)        → the stored text, or undefined when there is none or storage cannot be
//                       read (it then behaves as empty). Never throws.
//   write(name, text) → stores the text; throws when storage refuses it (blocked, quota full).
//   keepAside(name)   → copies the stored text to the aside key, replacing an earlier kept copy,
//                       then removes it from the document key. No-op when nothing is stored;
//                       throws, leaving the document in place, when the copy cannot be stored.
//   available()       → whether a write persists this session (a probe write and remove).

export const DOC_PREFIX = 'ms3d:doc:';
export const ASIDE_PREFIX = 'ms3d:aside:';
const PROBE_KEY = 'ms3d:probe';

function resolveStorage(getStorage) {
  try {
    return getStorage() ?? null;
  } catch {
    return null;
  }
}

export function createBrowserBackend({ getStorage = () => globalThis.localStorage } = {}) {
  const storage = resolveStorage(getStorage);

  function read(name) {
    if (!storage) return undefined;
    try {
      return storage.getItem(DOC_PREFIX + name) ?? undefined;
    } catch {
      return undefined;
    }
  }

  function write(name, text) {
    if (!storage) throw new Error('browser storage is unavailable');
    storage.setItem(DOC_PREFIX + name, text);
  }

  function keepAside(name) {
    const text = read(name);
    if (text === undefined) return;
    storage.setItem(ASIDE_PREFIX + name, text);
    storage.removeItem(DOC_PREFIX + name);
  }

  function available() {
    if (!storage) return false;
    try {
      storage.setItem(PROBE_KEY, '1');
      storage.removeItem(PROBE_KEY);
      return true;
    } catch {
      return false;
    }
  }

  return { read, write, keepAside, available };
}
