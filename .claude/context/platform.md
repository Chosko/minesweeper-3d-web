# Platform — storage interface, backends, blob store, start-up selection

## OVERVIEW

The storage half of the platform layer: the one API the game persists
through. It deals in named documents of plain data, each stored as the text
of `{ version, data }`, over a pluggable backend chosen once at start-up, and
in named binary blobs too large for a document — sealed replays — through
the blob store, over an implementation opened once at start-up. DOM-free
apart from the browser backend's default `localStorage` getter and the
IndexedDB implementation's default `indexedDB` factory.

- `js/platform/storage.js` — the storage interface (`createStorage`):
  registration, versioned load with upgrades, save, availability, failure
  reporting. Defines the backend contract.
- `js/platform/browser-backend.js` — the web build's backend over Web Storage.
- `js/platform/memory-backend.js` — the in-memory backend, for tests; the
  reference implementation of the backend contract.
- `js/platform/blob-store.js` — the blob store interface
  (`createBlobStore`): put, get, delete, list, availability, the fallback
  to memory. Defines the blob implementation contract.
- `js/platform/memory-blob-store.js` — the in-memory blob implementation:
  the reference for the contract, the fallback when nothing persists, and
  what tests use.
- `js/platform/indexeddb-blob-store.js` — the web build's blob
  implementation over IndexedDB.
- `js/platform/index.js` — the selector: builds the one `storage` over the
  browser backend and the one `blobStore` over IndexedDB (memory when it
  cannot open) when first evaluated, and re-exports the storage methods.

The settings store (`settings`, [settings.md](settings.md)), the last mode
played (`shell.lastMode`), the last Classic 2D and 3D board choices
(`mode3d.lastChoice`, [mode3d.md](mode3d.md)) and the records
store (`records`, `records.history`, `records.inProgress`,
[records.md](records.md)) and the replay library's index
(`replays.library`, [replay.md](replay.md)) register their documents here;
the replay library is the blob store's one user. The loose
`localStorage` helpers left in `js/ui.js` keep one key, the help hint's
`ms3d.hintH.done`; the `ms3d.*` keys nothing reads are listed in
[app-shell.md](app-shell.md).
`js/theme.js`, a classic script that cannot import, reads the settings
document's browser key directly at start-up.

## PUBLIC API

Platform module (`js/platform/index.js`) — what callers import:
- `storage` and its methods `register`, `load`, `save`, `available`, each
  re-exported by name.
- `blobStore` — the blob store interface over the selected implementation.

Storage interface (`js/platform/storage.js`)
- `createStorage({ backend })` → `{ register, load, save, available }`.
- `register(name, currentVersion, upgrades = {}, { onIssue }?)` — declares a
  document before it is loaded. `currentVersion` an integer `>= 1`;
  `upgrades[v]` for every `1 <= v < currentVersion`, a step `data → data`
  (or a Promise of it) bringing version `v` to `v + 1`. Throws on an empty
  name, a bad version, a missing step, or a second registration of a name.
- `load(name)` → Promise of the data, or `undefined` when there is none.
  Never rejects.
- `save(name, data)` → Promise of `{ ok: true }` or `{ ok: false, reason,
  error? }`, reason `'not-serializable'`, `'newer-version'` or
  `'write-failed'`. Writes the whole document at its current version. Never
  rejects.
- `available()` → the backend's answer to whether anything persists this
  session; `false` if it throws.
- `load` / `save` on an unregistered name throw synchronously — a
  programming error.
- Issues passed to `onIssue`, each `{ name, kind, ... }`: `newer-version`
  (`storedVersion`, `currentVersion`), `corrupt` (`error?`), `unreadable`
  (`error`), `save-failed` (`reason`, `error?`).

Backend contract — `read(name)` → text or `undefined`; `write(name, text)`;
`keepAside(name)`; `available()` → boolean. `read`, `write` and `keepAside`
may return Promises and may throw.

Browser backend (`js/platform/browser-backend.js`)
- `createBrowserBackend({ getStorage }?)` → `{ read, write, keepAside,
  available }`. `getStorage` defaults to the global `localStorage`, called
  once at creation; one that throws or returns nothing means no storage.
- `DOC_PREFIX` — `'ms3d:doc:'`, the document key prefix; `ASIDE_PREFIX` —
  `'ms3d:aside:'`, the kept-aside copy's prefix. `available()` probes with
  a write and remove of `ms3d:probe`.

Memory backend (`js/platform/memory-backend.js`)
- `createMemoryBackend({ initial = {}, available = true }?)` → the contract
  plus the `documents` and `aside` Maps, exposed for tests to inspect and
  edit; `initial` seeds `documents`.

Blob store interface (`js/platform/blob-store.js`)
- `createBlobStore({ open, fallback })` → `{ put, get, delete, list,
  available }`. `open()` → the persistent implementation or a Promise of
  it; one that throws, rejects or gives nothing selects `fallback()`, the
  in-memory implementation. Calls made before the selection settles wait
  for it.
- `put(name, bytes)` → Promise of `{ ok: true }` or `{ ok: false, reason:
  'write-failed', error }`; replaces an earlier blob. Never rejects.
- `get(name)` → Promise of a copy of the bytes, or `undefined` when there is
  none. Rejects when the implementation cannot read.
- `delete(name)` → Promise of `{ ok: true }` (a missing name too) or
  `{ ok: false, reason: 'write-failed', error }`. Never rejects.
- `list()` → Promise of every stored name, sorted. Rejects when the
  implementation cannot read.
- `available()` → Promise of `true` over the opened implementation, `false`
  over the fallback.
- A name that is not a non-empty string, or bytes that are not a
  `Uint8Array`, throw a `TypeError` synchronously — a programming error.

Blob implementation contract — `put(name, bytes)`, `get(name)` → bytes or
`undefined`, `delete(name)`, `list()` → names; each may return a Promise and
may throw.

Memory blob store (`js/platform/memory-blob-store.js`)
- `createMemoryBlobStore({ initial = {}, failWrites = false, failReads =
  false }?)` → the contract plus the `blobs` Map, exposed for tests to
  inspect and edit; `initial` seeds it. `failWrites` makes `put` and
  `delete` reject, `failReads` makes `get` and `list` reject.

IndexedDB blob store (`js/platform/indexeddb-blob-store.js`)
- `openIndexedDBBlobStore({ indexedDB }?)` → Promise of the contract;
  `indexedDB` defaults to the global factory. Rejects when there is none,
  when the factory throws, or when the open request fails or is blocked.
- `DB_NAME` — `'ms3d-blobs'`; `STORE_NAME` — `'blobs'`; database version 1.

## INTERNAL PATTERNS

- **Document format.** The stored text is `JSON.stringify({ version, data })`.
  A text that does not parse, is not a plain object, or lacks an integer
  `version >= 1` or a `data` key is corrupt. Falsy data round-trips;
  `undefined` and non-JSON data are `not-serializable`.
- **No cache.** Every `load` reads the backend; the owner's in-memory copy
  is the source of truth while the game runs.
- **Upgrades.** An older document runs every step from its version up, in
  order, and is saved back at the current version; a failed save-back still
  returns the upgraded data and reports `save-failed`. A current-version
  document runs nothing and is not written.
- **Failure rules** — the game goes on in every case:
  - a backend read that throws: `unreadable`, kept aside (best effort),
    loads as missing;
  - corrupt text or an upgrade step that throws: `corrupt`, kept aside,
    loads as missing; a kept-aside copy stays until the next keep-aside of
    the same name, so the owner's next save writes a fresh document;
  - a document newer than `currentVersion`: `load` refuses it (`undefined`,
    `newer-version` issue) and `save` refuses to overwrite it; it is left
    untouched;
  - a write that throws, synchronously or not: `write-failed`, reported,
    never thrown; an `onIssue` that throws or rejects is swallowed.
- **Browser backend.** One key per document (`DOC_PREFIX + name`), the
  kept-aside copy under `ASIDE_PREFIX + name`. Unreadable storage reads as
  empty; blocked, missing or full storage refuses writes and is not
  available. It never reads, writes or deletes any other key — the legacy
  `ms3d.*` keys stay for their owners to carry over once.
- **Blob store.** The interface hands an implementation its own copy of the
  bytes and copies what `get` returns, so neither side can change the
  other's. A write that fails is reported, never thrown; a read that fails
  rejects, so a failure is never mistaken for a missing blob. Nothing is
  cached: every call goes to the implementation.
- **IndexedDB implementation.** Each blob is one record in the `blobs`
  object store of the `ms3d-blobs` database, keyed by its name; each call is
  one transaction and resolves once it completes, rejecting when it aborts
  or fails (quota, a closed connection). Another tab's version change closes
  the connection, so later calls fail. A blob is never kept in
  `localStorage`.
- **Start-up selection.** `js/platform/index.js` is the only module that
  imports a backend or a blob implementation; it selects the browser
  backend and opens IndexedDB once, when first evaluated, falling back to
  the memory blob store when IndexedDB is missing or refuses to open, and
  never follows a later change of the globals. Tests pin that no other file
  under `js/` imports `browser-backend.js`, `memory-backend.js` or a blob
  implementation.

## DOMAIN DEPENDENCIES

- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the interface, versioning, failure contract and implementation
  selection.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store: named blobs beside the document interface, IndexedDB
  in the web build, never `localStorage`.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  the platform layer as the one boundary to storage and Steam; format
  versions on every saved document.

## CROSS-REFERENCES

- [testing.md](testing.md) — `tests/platform-storage.test.mjs`,
  `tests/platform-browser.test.mjs`, `tests/platform-blob-store.test.mjs`.
- [replay.md](replay.md) — the replay library: what it keeps in the blob
  store and its `replays.library` document.
- [app-shell.md](app-shell.md) — the `ms3d.*` `localStorage` helpers this
  layer replaces.
- [settings.md](settings.md) — the settings document and the legacy keys it
  carries over once.

## WHEN TO READ THE SOURCE

- Adding a backend (the Steam implementation): read the backend contract in
  the `storage.js` header and `memory-backend.js`, then change the
  selection in `index.js` only. A blob implementation the same way: the
  contract in the `blob-store.js` header and `memory-blob-store.js`.
- A blob store failing in the browser: read `indexeddb-blob-store.js`'s
  `openDatabase` and `run`.
- Changing the stored format or the failure rules: read `storage.js`'s
  `parse`, `loadDocument` and `saveDocument`.
- A storage test failing on keys or quota: read `browser-backend.js` and the
  `FakeStorage` helper in `tests/platform-browser.test.mjs`.
