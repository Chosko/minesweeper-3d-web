// The storage interface: the one API the game persists through. It deals in named documents of
// plain data, each stored as the text of { version, data }, over a pluggable backend. It caches
// nothing: every load reads the backend.
//
// createStorage({ backend }) → { register, load, save, available }
//   register(name, currentVersion, upgrades, { onIssue }?)
//       Declares a document before it is loaded. currentVersion is an integer >= 1; upgrades
//       maps every earlier version v (1 <= v < currentVersion) to a step data → data (or a
//       Promise of it) that brings a version-v document to v + 1. onIssue(issue) is told of
//       every problem with this document (below). A malformed declaration or a second
//       registration of the same name throws.
//   load(name) → Promise of the data, or undefined when there is none. An older document runs
//       every upgrade step in order and is saved back at the current version. A newer one than
//       currentVersion is refused (undefined), reported and left untouched. A corrupt or
//       unreadable document is reported as missing and kept aside until the owner saves a new
//       one. Never rejects.
//   save(name, data) → Promise of { ok: true } or { ok: false, reason, error? }; writes the whole
//       document at its current version. Reasons: 'not-serializable' (data is not JSON data),
//       'newer-version' (the stored document is newer than currentVersion; it is left
//       untouched), 'write-failed' (the backend refused). Never rejects.
//   available() → whether anything will persist this session (the backend's answer).
// load and save on an unregistered name throw synchronously: that is a programming error.
//
// Issues passed to onIssue, each { name, kind, ... }:
//   { kind: 'newer-version', storedVersion, currentVersion } — load refused the document;
//   { kind: 'corrupt', error? }    — the text is not a valid document, or an upgrade step threw;
//   { kind: 'unreadable', error }  — the backend read failed; the document behaves as missing
//                                    and is kept aside (best effort);
//   { kind: 'save-failed', reason, error? } — a save (or an upgrade's save-back) failed.
//
// Backend contract (js/platform/memory-backend.js is the reference): read(name) → text or
// undefined, write(name, text), keepAside(name), available() → boolean. read, write and
// keepAside may return Promises and may throw.

const isVersion = (v) => Number.isInteger(v) && v >= 1;

export function createStorage({ backend }) {
  const documents = new Map(); // name → { currentVersion, upgrades, onIssue }

  function register(name, currentVersion, upgrades = {}, { onIssue } = {}) {
    if (typeof name !== 'string' || name === '') {
      throw new TypeError('storage: a document name must be a non-empty string');
    }
    if (documents.has(name)) throw new Error(`storage: document "${name}" is already registered`);
    if (!isVersion(currentVersion)) {
      throw new TypeError(`storage: "${name}" needs an integer version >= 1`);
    }
    for (let v = 1; v < currentVersion; v++) {
      if (typeof upgrades?.[v] !== 'function') {
        throw new TypeError(`storage: "${name}" has no upgrade step from version ${v}`);
      }
    }
    documents.set(name, { currentVersion, upgrades, onIssue });
  }

  function declaration(name) {
    const doc = documents.get(name);
    if (!doc) throw new Error(`storage: document "${name}" is not registered`);
    return doc;
  }

  function report(name, doc, issue) {
    if (!doc.onIssue) return;
    try {
      Promise.resolve(doc.onIssue({ name, ...issue })).catch(() => {});
    } catch {
      // An owner's handler failing never stops the game.
    }
  }

  // The stored text parsed into { version, data }, or null when it is not a valid document.
  function parse(text) {
    let doc;
    try {
      doc = JSON.parse(text);
    } catch {
      return null;
    }
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) return null;
    if (!isVersion(doc.version) || !('data' in doc)) return null;
    return doc;
  }

  async function keepAside(name) {
    try {
      await backend.keepAside(name);
    } catch {
      // Best effort: the document is reported missing either way.
    }
  }

  async function write(name, doc, data) {
    let text;
    try {
      text = data === undefined ? undefined : JSON.stringify({ version: doc.currentVersion, data });
    } catch (error) {
      return { ok: false, reason: 'not-serializable', error };
    }
    if (text === undefined) return { ok: false, reason: 'not-serializable' };
    try {
      await backend.write(name, text);
    } catch (error) {
      return { ok: false, reason: 'write-failed', error };
    }
    return { ok: true };
  }

  async function loadDocument(name, doc) {
    let text;
    try {
      text = await backend.read(name);
    } catch (error) {
      await keepAside(name);
      report(name, doc, { kind: 'unreadable', error });
      return undefined;
    }
    if (text === undefined || text === null) return undefined;

    const stored = parse(text);
    if (!stored) {
      await keepAside(name);
      report(name, doc, { kind: 'corrupt' });
      return undefined;
    }
    if (stored.version > doc.currentVersion) {
      report(name, doc, {
        kind: 'newer-version',
        storedVersion: stored.version,
        currentVersion: doc.currentVersion,
      });
      return undefined;
    }
    if (stored.version === doc.currentVersion) return stored.data;

    let data = stored.data;
    try {
      for (let v = stored.version; v < doc.currentVersion; v++) data = await doc.upgrades[v](data);
    } catch (error) {
      await keepAside(name);
      report(name, doc, { kind: 'corrupt', error });
      return undefined;
    }
    const saved = await write(name, doc, data);
    if (!saved.ok) report(name, doc, { kind: 'save-failed', reason: saved.reason, error: saved.error });
    return data;
  }

  // The version of the stored document when it is valid and newer than the declared one.
  async function newerStoredVersion(name, doc) {
    try {
      const stored = parse(await backend.read(name));
      return stored && stored.version > doc.currentVersion ? stored.version : 0;
    } catch {
      return 0;
    }
  }

  async function saveDocument(name, doc, data) {
    const newer = await newerStoredVersion(name, doc);
    const result = newer
      ? { ok: false, reason: 'newer-version' }
      : await write(name, doc, data);
    if (!result.ok) report(name, doc, { kind: 'save-failed', reason: result.reason, error: result.error });
    return result;
  }

  function load(name) {
    return loadDocument(name, declaration(name));
  }

  function save(name, data) {
    return saveDocument(name, declaration(name), data);
  }

  function available() {
    try {
      return Boolean(backend.available());
    } catch {
      return false;
    }
  }

  return { register, load, save, available };
}
