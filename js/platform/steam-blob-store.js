// The Steam build's blob stores (`steam-cloud-saves`): the implementation contract
// js/platform/blob-store.js runs over, each blob one binary file in its store's directory of the save
// directory the desktop host's file service keeps (desktop/file-service.js), reached through the
// bridge client's blob requests. A store is opened by name: the replay library's is REPLAY_STORE,
// and another feature opens its own beside it.
//
// openSteamBlobStore({ client, name, track? }) → { put, get, delete, list } for the store `name`:
//   put(key, bytes) → Promise; replaces the blob's file safely (a temporary file renamed over it).
//   get(key)        → Promise of the bytes, or undefined when there is none.
//   delete(key)     → Promise; deleting a missing blob succeeds.
//   list()          → Promise of every key in the store; none when the store has no directory yet.
// Each rejects with the bridge's typed error { code, message } — `failed` when the disk refuses,
// `invalid` for a name the save directory does not take —, which the blob store interface reports as
// a failed write or passes on as a failed read. `track(promise)` is told of every request, so the
// quit flush can wait for it.

/** The replay library's store. */
export const REPLAY_STORE = 'replays';

export function openSteamBlobStore({ client, name, track = (promise) => promise }) {
  return {
    async put(key, bytes) {
      await track(client.putBlob(name, key, bytes));
    },
    async get(key) {
      const bytes = await track(client.getBlob(name, key));
      return bytes ?? undefined;
    },
    async delete(key) {
      await track(client.deleteBlob(name, key));
    },
    list: () => track(client.listBlobs(name)),
  };
}
