# Platform — storage interface, backends, start-up selection

## OVERVIEW

The storage half of the platform layer: the one API the game persists
through. It deals in named documents of plain data, each stored as the text
of `{ version, data }`, over a pluggable backend chosen once at start-up.
DOM-free apart from the browser backend's default `localStorage` getter.

- `js/platform/storage.js` — the storage interface (`createStorage`):
  registration, versioned load with upgrades, save, availability, failure
  reporting. Defines the backend contract.
- `js/platform/browser-backend.js` — the web build's backend over Web Storage.
- `js/platform/memory-backend.js` — the in-memory backend, for tests; the
  reference implementation of the backend contract.
- `js/platform/index.js` — the selector: builds the one `storage` over the
  browser backend when first evaluated and re-exports its methods.

Nothing in the app imports it yet; the persisting features (`settings`,
`personal-records`, `game-shell`, `classic-2d-square-play`) register their
documents here and replace the loose `localStorage` helpers in
`js/audio.js` and `js/ui.js` ([audio.md](audio.md), [app-shell.md](app-shell.md)).

## PUBLIC API

Platform module (`js/platform/index.js`) — what callers import:
- `storage` and its methods `register`, `load`, `save`, `available`, each
  re-exported by name.

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
- **Start-up selection.** `js/platform/index.js` is the only module that
  imports a backend; it selects the browser backend once, when first
  evaluated, and never follows a later change of the global. A test pins
  that no other file under `js/` imports `browser-backend.js` or
  `memory-backend.js`.

## DOMAIN DEPENDENCIES

- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the interface, versioning, failure contract and implementation
  selection.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  the platform layer as the one boundary to storage and Steam; format
  versions on every saved document.

## CROSS-REFERENCES

- [testing.md](testing.md) — `tests/platform-storage.test.mjs`,
  `tests/platform-browser.test.mjs`.
- [app-shell.md](app-shell.md), [audio.md](audio.md) — the `ms3d.*`
  `localStorage` helpers this layer replaces.

## WHEN TO READ THE SOURCE

- Adding a backend (the Steam implementation): read the backend contract in
  the `storage.js` header and `memory-backend.js`, then change the
  selection in `index.js` only.
- Changing the stored format or the failure rules: read `storage.js`'s
  `parse`, `loadDocument` and `saveDocument`.
- A storage test failing on keys or quota: read `browser-backend.js` and the
  `FakeStorage` helper in `tests/platform-browser.test.mjs`.
