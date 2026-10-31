// The Steam build's document storage (`steam-cloud-saves`): the backend js/platform/storage.js runs
// over, each document one text file the desktop host's file service keeps (desktop/file-service.js)
// — the machine settings document's in the machine prefs directory, every other in the save
// directory, the file service choosing by name — reached through the bridge client's document
// requests. Loading, upgrades, refusing a newer version and the failure contract stay the storage
// interface's; only where the text lives changes. A file that will not parse is renamed aside by the
// file service with a dated suffix, so it reads as missing.
//
// createSteamBackend({ client, track? }) → the backend contract of js/platform/storage.js:
//   read(name)        → Promise of the text, or undefined when there is none; rejects with the
//                       bridge's typed error { code, message } when the disk refuses.
//   write(name, text) → Promise; replaces the file safely (a temporary file renamed over it).
//   keepAside(name)   → Promise; renames the file aside, so the name reads as missing.
//   clear()           → Promise; lists every document in both directories and deletes each one's
//                       file and kept-aside copies; rejects only when an existing file cannot be
//                       deleted (or the directories cannot be listed).
//   available()       → true: the save directory is the game's own and persists whether or not
//                       Steam runs; a write the disk refuses is reported through save's failure
//                       contract, never by turning availability off, so no owner stops saving.
//   `track(promise)` is told of every request, so the quit flush can wait for it.
//
// createSaveTracker() → { track(promise), settled() }: the storage and blob requests in flight.
//   track(promise) → the promise, unchanged, held until it settles.
//   settled()      → Promise resolved once nothing is in flight — waiting too for every request one
//                    in flight led to, since a save's write follows its read — never rejecting.

export function createSaveTracker() {
  const pending = new Set();
  const nextTurn = () => new Promise((resolve) => { setTimeout(resolve, 0); });

  return {
    track(promise) {
      const held = Promise.resolve(promise).then(() => {}, () => {});
      pending.add(held);
      held.then(() => { pending.delete(held); });
      return promise;
    },
    async settled() {
      for (;;) {
        await nextTurn();
        if (pending.size === 0) return;
        await Promise.all([...pending]);
      }
    },
  };
}

export function createSteamBackend({ client, track = (promise) => promise }) {
  return {
    async read(name) {
      const text = await track(client.readDocument(name));
      return text ?? undefined;
    },
    async write(name, text) {
      await track(client.writeDocument(name, text));
    },
    async keepAside(name) {
      await track(client.setDocumentAside(name));
    },
    async clear() {
      const names = await track(client.listDocuments());
      for (const name of names) await track(client.deleteDocument(name));
    },
    available: () => true,
  };
}
