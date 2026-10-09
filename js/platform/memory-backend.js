// In-memory storage backend, for tests: the backend contract js/platform/storage.js runs over.
//
// createMemoryBackend({ initial, available }) → { read, write, keepAside, available, documents, aside }
//   read(name)        → Promise of the stored text, or undefined when there is none (or the
//                       backend is unavailable).
//   write(name, text) → Promise; replaces the stored text. Rejects when unavailable.
//   keepAside(name)   → Promise; moves the stored text out of the way (into `aside`), so the
//                       next read finds nothing and the text is kept until replaced by another
//                       keep-aside of the same name. No-op when nothing is stored.
//   available()       → whether writes persist.
// `documents` and `aside` are the Maps holding the text, exposed for tests to inspect and edit.
// `initial` is a { name: text } object seeding `documents`.

export function createMemoryBackend({ initial = {}, available = true } = {}) {
  const documents = new Map(Object.entries(initial));
  const aside = new Map();

  return {
    documents,
    aside,
    available: () => available,
    async read(name) {
      if (!available) return undefined;
      return documents.get(name);
    },
    async write(name, text) {
      if (!available) throw new Error('memory backend unavailable');
      documents.set(name, text);
    },
    async keepAside(name) {
      if (!available || !documents.has(name)) return;
      aside.set(name, documents.get(name));
      documents.delete(name);
    },
  };
}
