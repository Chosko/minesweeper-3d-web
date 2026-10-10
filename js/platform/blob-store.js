// The blob store interface: the one API the game keeps large binary data through — named blobs
// of bytes, such as sealed replays, too large for the document storage of js/platform/storage.js.
// It runs over a pluggable implementation opened once, at creation.
//
// createBlobStore({ open, fallback }) → { put, get, delete, list, available }
//   open()     → the persistent implementation, or a Promise of it. One that throws, rejects or
//                gives nothing (the implementation is unavailable or refuses to open) means
//                nothing persists this session: fallback() is used instead.
//   fallback() → the in-memory implementation used when open fails.
//   Calls made before the implementation is settled wait for it.
//
//   put(name, bytes) → Promise of { ok: true } or { ok: false, reason: 'write-failed', error };
//       stores a copy of the bytes under the name, replacing any earlier blob. Never rejects.
//   get(name)        → Promise of a copy of the bytes, or undefined when there is none. Rejects
//       when the implementation cannot read, so a failure is never mistaken for a missing blob.
//   delete(name)     → Promise of { ok: true } or { ok: false, reason: 'write-failed', error };
//       deleting a name with no blob is { ok: true }. Never rejects.
//   list()           → Promise of every stored name, sorted. Rejects when the implementation
//       cannot read.
//   available()      → Promise of whether blobs persist this session: true over the opened
//       implementation, false over the fallback.
// A name that is not a non-empty string, or bytes that are not a Uint8Array, throw a TypeError
// synchronously: that is a programming error.
//
// Implementation contract (js/platform/memory-blob-store.js is the reference): put(name, bytes),
// get(name) → bytes or undefined, delete(name), list() → names. Each may return a Promise and
// may throw. The interface hands an implementation its own copy of the bytes and copies what
// get returns, so neither side can change the other's.

function checkName(name) {
  if (typeof name !== 'string' || name === '') {
    throw new TypeError('blob store: a blob name must be a non-empty string');
  }
}

const copy = (bytes) => new Uint8Array(bytes);

export function createBlobStore({ open, fallback }) {
  const selected = (async () => {
    try {
      const impl = await open();
      if (impl) return { impl, persists: true };
    } catch {
      // Unavailable or refused: nothing persists this session.
    }
    return { impl: fallback(), persists: false };
  })();

  async function write(action) {
    const { impl } = await selected;
    try {
      await action(impl);
    } catch (error) {
      return { ok: false, reason: 'write-failed', error };
    }
    return { ok: true };
  }

  function put(name, bytes) {
    checkName(name);
    if (!(bytes instanceof Uint8Array)) {
      throw new TypeError('blob store: a blob must be a Uint8Array');
    }
    const own = copy(bytes);
    return write((impl) => impl.put(name, own));
  }

  function get(name) {
    checkName(name);
    return selected.then(async ({ impl }) => {
      const bytes = await impl.get(name);
      return bytes === undefined || bytes === null ? undefined : copy(bytes);
    });
  }

  function remove(name) {
    checkName(name);
    return write((impl) => impl.delete(name));
  }

  function list() {
    return selected.then(async ({ impl }) => [...(await impl.list())].sort());
  }

  function available() {
    return selected.then(({ persists }) => persists);
  }

  return { put, get, delete: remove, list, available };
}
