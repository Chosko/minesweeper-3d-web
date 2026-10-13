# Platform — storage interface, backends, blob store, start-up selection

## OVERVIEW

The storage half of the platform layer: the one API the game persists
through. Named documents of plain data, each stored as the text of
`{ version, data }`, over a backend chosen once at start-up; and named
binary blobs too large for a document — sealed replays — through the blob
store, over an implementation opened once at start-up. DOM-free apart from
the browser backend's default `localStorage` getter and the IndexedDB
implementation's default `indexedDB` factory.

| File | Responsibility |
| ---- | -------------- |
| `js/platform/storage.js` | Storage interface (`createStorage`): registration, versioned load with upgrades, save, clear, availability, failure reporting. Header defines the backend contract. |
| `js/platform/browser-backend.js` | The web build's backend over Web Storage. |
| `js/platform/memory-backend.js` | In-memory backend for tests; reference implementation of the backend contract. |
| `js/platform/blob-store.js` | Blob store interface (`createBlobStore`), the fallback to memory. Header defines the blob implementation contract. |
| `js/platform/memory-blob-store.js` | In-memory blob implementation: the contract's reference, the fallback, what tests use. |
| `js/platform/indexeddb-blob-store.js` | The web build's blob implementation over IndexedDB. |
| `js/platform/index.js` | The selector: builds the one `storage` and the one `blobStore`; re-exports the storage methods. |

Document owners register here: settings ([settings.md](settings.md)),
`shell.lastMode` ([app-shell-menu.md](app-shell-menu.md)) and `shell.firstUse` ([app-shell-ui.md](app-shell-ui.md)), the
last Classic 2D and 3D board choices ([classic2d.md](classic2d.md),
[mode3d.md](mode3d.md)), the records store's three documents
([records-store.md](records-store.md)) and `replays.library`
([replay-library.md](replay-library.md)), the blob store's one user.
`js/theme.js`, a classic script that cannot import, reads the settings
document's browser key directly at start-up.

## PUBLIC API

Platform module (`js/platform/index.js`) — what callers import: `storage`
and its methods `register`, `load`, `save`, `clear`, `available` by name;
`blobStore`.

Storage interface (`js/platform/storage.js`)
- `createStorage({ backend })` → `{ register, load, save, clear, available }`.
- `register(name, currentVersion, upgrades = {}, { onIssue }?)` —
  `upgrades[v]` (`data → data`, or a Promise) for every `1 <= v <
  currentVersion`. Throws on an empty name, a bad version, a missing step,
  or a second registration.
- `load(name)` → Promise of the data or `undefined`. Never rejects.
- `save(name, data)` → Promise of `{ ok: true }` or `{ ok: false, reason,
  error? }`, reason `'not-serializable'`, `'newer-version'` or
  `'write-failed'`. Never rejects.
- `clear()` → every document, registered or not, and every kept-aside copy,
  even when not available; Reset all data ([settings-page.md](settings-page.md)) is
  its caller. Never rejects.
- `available()` → whether anything persists; `false` if the backend throws.
- `load` / `save` on an unregistered name throw synchronously.
- Issues to `onIssue`, each `{ name, kind, ... }`: `newer-version`,
  `corrupt`, `unreadable`, `save-failed`.

Backend contract — `read(name)`, `write(name, text)`, `keepAside(name)`,
`clear()`, `available()`; all but `available` may return Promises and throw.

- Browser backend: `createBrowserBackend({ getStorage }?)`; `DOC_PREFIX`
  `'ms3d:doc:'`, `ASIDE_PREFIX` `'ms3d:aside:'`; `available()` probes with
  `ms3d:probe`.
- Memory backend: `createMemoryBackend({ initial, available }?)` plus the
  `documents` and `aside` Maps for tests.

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
  blocked; `DB_NAME` `'ms3d-blobs'`, `STORE_NAME` `'blobs'`, version 1.

## INTERNAL PATTERNS

- **Document format.** `JSON.stringify({ version, data })`; text that does
  not parse or lacks an integer `version >= 1` or a `data` key is corrupt.
  Falsy data round-trips; `undefined` and non-JSON data are
  `not-serializable`.
- **No cache.** Every `load` and every blob call goes to the backend; the
  owner's in-memory copy is the source of truth while the game runs.
- **Upgrades.** An older document runs every step from its version up and
  is saved back at the current version; a failed save-back still returns the
  upgraded data and reports `save-failed`.
- **Failure rules** — the game goes on in every case:
  - a read that throws: `unreadable`, kept aside (best effort), loads as
    missing;
  - corrupt text or a throwing upgrade step: `corrupt`, kept aside, loads as
    missing, so the owner's next save writes a fresh document;
  - a document newer than `currentVersion`: `load` refuses it and `save`
    refuses to overwrite it; it is left untouched;
  - a write that throws: `write-failed`, reported, never thrown; a throwing
    `onIssue` is swallowed.
- **Browser backend keys.** One key per document, the kept-aside copy beside
  it. It never touches any other key — the legacy `ms3d.*` keys are their
  owners' to carry over and Reset all data's to remove.
- **Blob copies.** The interface copies bytes both ways, so neither side can
  change the other's; a failed write is reported, a failed read rejects, so
  a failure is never mistaken for a missing blob. A blob is never kept in
  `localStorage`.
- **IndexedDB.** One record per blob, one transaction per call; another
  tab's version change closes the connection, so later calls fail.
- **Start-up selection.** `index.js` is the only module that imports a
  backend or blob implementation; it selects once, when first evaluated,
  falling back to the memory blob store when IndexedDB is missing or
  refuses, and never follows a later change of the globals. Tests pin that
  no other file under `js/` imports them.

## DOMAIN DEPENDENCIES

- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the interface, versioning, failure contract, implementation selection.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store: named blobs, IndexedDB in the web build.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  the platform layer as the one boundary to storage and Steam.

## CROSS-REFERENCES

- [testing.md](testing.md) — `tests/platform-storage.test.mjs`,
  `tests/platform-browser.test.mjs`, `tests/platform-blob-store.test.mjs`.
- [replay-library.md](replay-library.md) — the blob store's one user.
- [app-shell.md](app-shell.md) — the `ms3d.*` keys nothing reads.
- [settings.md](settings.md) — the settings document, the legacy keys it
  carries over, Reset all data.

## WHEN TO READ THE SOURCE

- Adding a backend (the Steam implementation): the backend contract in the
  `storage.js` header and `memory-backend.js`, then change the selection in
  `index.js` only; a blob implementation likewise from the `blob-store.js`
  header and `memory-blob-store.js`.
- A blob store failing in the browser: `indexeddb-blob-store.js`'s
  `openDatabase` and `run`.
- Changing the stored format or the failure rules: `storage.js`'s `parse`,
  `loadDocument` and `saveDocument`.
- A storage test failing on keys or quota: `browser-backend.js` and the
  `FakeStorage` helper in `tests/platform-browser.test.mjs`.
