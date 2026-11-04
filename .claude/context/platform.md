# Platform — document storage, backends, the Steam build's storage

## OVERVIEW

The platform layer's document storage: the one API the game persists its
documents through. Named documents of plain data, each stored as the text of
`{ version, data }`, over a backend chosen once at start-up; and the Steam
build's storage as a whole — documents and blobs as files the desktop host
keeps, and the save tracker the quit flush waits on. The blob store is
[platform-blobs.md](platform-blobs.md)'s; selection, the capability flags,
the host link and the desktop window are [platform-host.md](platform-host.md)'s.
DOM-free apart from the browser backend's default `localStorage` getter.

| File | Responsibility |
| ---- | -------------- |
| `js/platform/storage.js` | Storage interface (`createStorage`): registration, versioned load with upgrades, save, clear, availability, failure reporting. Header defines the backend contract. |
| `js/platform/browser-backend.js` | The web build's backend over Web Storage. |
| `js/platform/memory-backend.js` | In-memory backend for tests; reference implementation of the backend contract. |
| `js/platform/steam-storage.js` | The Steam build's backend (`createSteamBackend`): each document one file the desktop host's file service keeps, over the bridge client's document requests; the save tracker (`createSaveTracker`) the quit flush waits on. |

Document owners register here: the settings store's `settings` and
`settings.machine` ([settings-store.md](settings-store.md)),
`shell.lastMode` and the board choice panel's pin `shell.boardPanel` ([app-shell-menu.md](app-shell-menu.md)), the live figures panel's open state `shell.liveFigures` ([app-shell-2d.md](app-shell-2d.md)) and `shell.firstUse` ([app-shell-help.md](app-shell-help.md)), the
last Classic 2D and 3D board choices ([classic2d-board-setup.md](classic2d-board-setup.md),
[mode3d.md](mode3d.md)), the records store's three documents
([records-store.md](records-store.md)), the Records screen's `records.view`
([records-library-view.md](records-library-view.md)) and `replays.library`
([replay-library.md](replay-library.md)), and the
leaderboard outbox's `leaderboards.outbox`, with a blob store of its own
under the same name ([leaderboards-submit.md](leaderboards-submit.md)). The
machine settings document `settings.machine` is the one machine-local
document: on the Steam build its file lives in the machine prefs directory,
which never syncs, every other document's in the save directory
([desktop-files.md](desktop-files.md) § Saves). `js/theme.js`, a classic script that
cannot import, reads the settings document's browser key directly at
start-up on the web, and on the desktop host the theme id the host hands
over ([app-shell-theme-runtime.md](app-shell-theme-runtime.md)).

## PUBLIC API

Callers import `storage` and its methods by name from the platform module
([platform-host.md](platform-host.md)), never a backend.

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
  even when not available; Reset all data ([settings-reset.md](settings-reset.md)) is
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
- Steam backend: `createSteamBackend({ client, track? })`; `read` gives
  `undefined` for no file and rejects with the bridge's typed error when the
  disk refuses; `keepAside` is the file service's set-aside; `clear()` lists
  every document in both directories and deletes each one's file and
  kept-aside copies, rejecting only when an existing file cannot be deleted
  or the directories cannot be listed; `available()` is always true — a
  refused write is a `write-failed` save, never lost availability.
- Save tracker: `createSaveTracker()` → `{ track(promise), settled() }`;
  `settled()` resolves once nothing is in flight, including every request
  one in flight led to, and never rejects.

## INTERNAL PATTERNS

- **Document format.** `JSON.stringify({ version, data })`; text that does
  not parse or lacks an integer `version >= 1` or a `data` key is corrupt.
  Falsy data round-trips; `undefined` and non-JSON data are
  `not-serializable`.
- **No cache.** Every `load` goes to the backend; the owner's in-memory copy is the source of truth.
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
- **The Steam build's storage.** With the bridge, documents and blobs are
  files the desktop host's file service keeps — documents in the save
  directory or, for the machine-local one, the machine prefs directory;
  blobs in a directory per store in the save directory ([desktop-files.md](desktop-files.md)
  § Saves, [platform-blobs.md](platform-blobs.md)). The storage interface's
  loading, upgrades, refusal of a newer version and failure rules are
  unchanged; only where the text lives differs. Every Steam storage and
  blob request — reads included — goes through one save tracker
  (`STEAM_SAVES` in `index.js`), and its `settled()` is a flush hook
  ([platform-host.md](platform-host.md)), so the page answers the host's
  flush request only once every request in flight, and every request it
  led to, has settled, and Auto-Cloud's exit upload sees the final files.
  Nothing on the Steam build reads or writes browser storage that outlives
  the session: the pre-paint theme comes from the host, and the loose-key
  carry-over and removal are handed nothing there ([settings-store.md](settings-store.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the interface, versioning, failure contract, implementation selection.
- [../domain/features/steam-cloud-saves.md](../domain/features/steam-cloud-saves.md)
  — the Steam storage, the machine-local document, the quit flush's wait.

## CROSS-REFERENCES

- [platform-blobs.md](platform-blobs.md) — the blob store;
  [platform-host.md](platform-host.md) — the selector, the bridge client
  the Steam backend requests through, the flush hook.
- [desktop-files.md](desktop-files.md) — the file service keeping the Steam build's
  files: the save and machine prefs directories, safe writes.
- [testing-files.md](testing-files.md) — `tests/platform-storage.test.mjs`,
  `tests/platform-browser.test.mjs` (every platform browser test),
  `tests/platform-steam-storage.test.mjs` (the Steam storage and blob
  store, clear, the quit flush), `tests/helpers/platform-suites.mjs`.
- [app-shell.md](app-shell.md) — the `ms3d.*` keys nothing reads;
  [settings-store.md](settings-store.md) — the settings documents, the legacy keys
  carried over on the browser build, Reset all data.

## WHEN TO READ THE SOURCE

- A Steam save not waited for at quit: `STEAM_SAVES` in `index.js`,
  `createSaveTracker` in `steam-storage.js`.
- Adding a backend: the `storage.js` header's contract and
  `memory-backend.js`, then its slot ([platform-host.md](platform-host.md)).
- Changing the stored format or the failure rules: `storage.js`'s `parse`,
  `loadDocument` and `saveDocument`.
- A storage test failing on keys or quota: `browser-backend.js` and the
  `FakeStorage` helper in `tests/platform-browser.test.mjs`.
