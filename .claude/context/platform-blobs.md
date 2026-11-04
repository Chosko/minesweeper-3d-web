# Platform — blob store and its implementations

## OVERVIEW

The platform layer's blob store: named binary blobs too large for a
document — sealed replays, the leaderboard outbox's replays — over an
implementation opened once at start-up. The document storage beside it and
the Steam build's storage as a whole are [platform.md](platform.md)'s; which
implementation is opened is [platform-host.md](platform-host.md)'s. DOM-free
apart from the IndexedDB implementation's default `indexedDB` factory.

| File | Responsibility |
| ---- | -------------- |
| `js/platform/blob-store.js` | Blob store interface (`createBlobStore`), the fallback to memory. Header defines the blob implementation contract. |
| `js/platform/memory-blob-store.js` | In-memory blob implementation: the contract's reference, the fallback, what tests use. |
| `js/platform/indexeddb-blob-store.js` | The web build's blob implementation over IndexedDB. |
| `js/platform/steam-blob-store.js` | The Steam build's blob implementation (`openSteamBlobStore`): a named store, one file per blob in its directory of the save directory, over the bridge client's blob requests; `REPLAY_STORE`, the replay library's. |

## PUBLIC API

Callers import `blobStore` from the platform module
([platform-host.md](platform-host.md)), never an implementation.

Blob store interface (`js/platform/blob-store.js`)
- `createBlobStore({ open, fallback })` → `{ put, get, delete, list,
  available }`. `open()` that throws, rejects or gives nothing selects
  `fallback()`; calls made before selection settles wait for it.
- `put` and `delete` → `{ ok: true }` or `{ ok: false, reason:
  'write-failed', error }`, never reject; `get` → a copy of the bytes or
  `undefined`, `list` → sorted names, both reject when the implementation
  cannot read; `available()` → Promise, `false` over the fallback.
- A bad name or non-`Uint8Array` bytes throw a `TypeError` synchronously.

Blob implementation contract — `put`, `get`, `delete`, `list`; each may
return a Promise and may throw.

- Memory blob store: `createMemoryBlobStore({ initial, failWrites,
  failReads }?)` plus the `blobs` Map for tests.
- IndexedDB: `openIndexedDBBlobStore({ indexedDB }?)` → Promise of the
  contract, rejecting when there is no factory or the open fails or is
  blocked; `DB_NAME` `'ms3d-blobs'`, `STORE_NAME` `'blobs'`, its schema version `DB_VERSION`.
- Steam: `openSteamBlobStore({ client, name, track? })` → the contract for
  the store `name`, each call rejecting with the bridge's typed error —
  `failed` for a refusing disk, `invalid` for a name the save directory
  does not take; `REPLAY_STORE` `'replays'`, the replay library's store.
  Any other feature opens its own store by name beside it, as the
  leaderboard outbox does (`'leaderboards.outbox'`).

## INTERNAL PATTERNS

- **No cache.** Every blob call goes to the implementation; the owner's
  in-memory copy is the source of truth while the game runs.
- **Blob copies.** The interface copies bytes both ways, so neither side can
  change the other's; a failed write is reported, a failed read rejects, so
  a failure is never mistaken for a missing blob. A blob is never kept in
  `localStorage`.
- **IndexedDB.** One record per blob, one transaction per call; another
  tab's version change closes the connection, so later calls fail.
- **The Steam blob store** is files in a directory per store in the save
  directory, every request through the Steam saves' tracker
  ([platform.md](platform.md) § The Steam build's storage).

## DOMAIN DEPENDENCIES

- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the blob store's interface and failure contract.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store: named blobs, IndexedDB in the web build.
- [../domain/features/steam-cloud-saves.md](../domain/features/steam-cloud-saves.md)
  — the Steam blob store.

## CROSS-REFERENCES

- [platform.md](platform.md) — the document storage, the Steam build's
  storage and its save tracker.
- [platform-host.md](platform-host.md) — the selector that opens the
  implementation, the memory fallback standing in when IndexedDB refuses.
- [desktop.md](desktop.md) § Saves — the file service's blob operations.
- [replay-library.md](replay-library.md) — the replay store's user;
  [leaderboards.md](leaderboards.md) — the outbox's blob store.
- [testing.md](testing.md) — `tests/platform-blob-store.test.mjs`,
  `tests/platform-browser.test.mjs` (the IndexedDB blob store's round
  trip), `tests/platform-steam-storage.test.mjs` (the Steam blob stores)
  and the shared interface suites in `tests/helpers/platform-suites.mjs`.

## WHEN TO READ THE SOURCE

- Adding a blob implementation: the `blob-store.js` header and
  `memory-blob-store.js`, then its slot ([platform-host.md](platform-host.md)).
- A blob store failing in the browser: `indexeddb-blob-store.js`'s
  `openDatabase` and `run`.
- A new Steam store: `steamBlobStore` in `index.js` and
  `openSteamBlobStore`.
