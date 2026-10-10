// In-memory blob store implementation: the reference for the implementation contract
// js/platform/blob-store.js runs over, the fallback when nothing persists, and the store tests use.
//
// createMemoryBlobStore({ initial, failWrites, failReads }?) → { put, get, delete, list, blobs }
//   put(name, bytes) → Promise; stores the bytes under the name, replacing any earlier blob.
//   get(name)        → Promise of the bytes, or undefined when there is none.
//   delete(name)     → Promise; removes the blob. No-op when there is none.
//   list()           → Promise of every stored name.
// `blobs` is the Map holding the bytes, exposed for tests to inspect and edit; `initial` is a
// { name: Uint8Array } object seeding it. `failWrites` makes put and delete reject and
// `failReads` makes get and list reject, as a failing persistent implementation does.

export function createMemoryBlobStore({ initial = {}, failWrites = false, failReads = false } = {}) {
  const blobs = new Map(Object.entries(initial));

  return {
    blobs,
    async put(name, bytes) {
      if (failWrites) throw new Error('memory blob store refuses writes');
      blobs.set(name, bytes);
    },
    async get(name) {
      if (failReads) throw new Error('memory blob store refuses reads');
      return blobs.get(name);
    },
    async delete(name) {
      if (failWrites) throw new Error('memory blob store refuses writes');
      blobs.delete(name);
    },
    async list() {
      if (failReads) throw new Error('memory blob store refuses reads');
      return [...blobs.keys()];
    },
  };
}
