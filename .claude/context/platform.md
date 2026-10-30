# Platform — storage interface, backends, blob store, start-up selection, host link

## OVERVIEW

The platform layer: the one API the game persists through and the page's
one link to the desktop host. Named documents of plain data, each stored as
the text of `{ version, data }`, over a backend chosen once at start-up;
named binary blobs too large for a document — sealed replays — through the
blob store, over an implementation opened once at start-up; the capability
flags, the host link (Steam state, the overlay, the quit flush) and the
desktop window driven from the page. DOM-free apart from the browser
backend's default `localStorage` getter, the IndexedDB implementation's
default `indexedDB` factory and `window-actions.js`, which on the desktop
host marks the document, adds the drag region's style, sizes the page's
root area, settles the touch step's media queries and, windowed, shifts the
page to the shown screen's frame.

| File | Responsibility |
| ---- | -------------- |
| `js/platform/storage.js` | Storage interface (`createStorage`): registration, versioned load with upgrades, save, clear, availability, failure reporting. Header defines the backend contract. |
| `js/platform/browser-backend.js` | The web build's backend over Web Storage. |
| `js/platform/memory-backend.js` | In-memory backend for tests; reference implementation of the backend contract. |
| `js/platform/blob-store.js` | Blob store interface (`createBlobStore`), the fallback to memory. Header defines the blob implementation contract. |
| `js/platform/memory-blob-store.js` | In-memory blob implementation: the contract's reference, the fallback, what tests use. |
| `js/platform/indexeddb-blob-store.js` | The web build's blob implementation over IndexedDB. |
| `js/platform/index.js` | The selector (`selectPlatform`): looks for the page bridge once at start-up, fills each slot (`STEAM_SLOTS`: storage, blob store, leaderboards, achievements) with its Steam implementation or the browser one; re-exports the storage methods; the capability flags, the host link and the desktop window. |
| `js/platform/capabilities.js` | The capability flags (`CAPABILITY_FLAGS`, `deriveFlags`, `createCapabilities`) and the latest Steam state. |
| `js/platform/bridge-client.js` | The page's side of the page bridge: `findBridge`, the request client, `linkHost` — Steam state into the flags, overlay listeners, the quit flush. |
| `js/platform/window-actions.js` | The desktop window driven from the page: drag region, Minimise and Fullscreen / Windowed with its icon, the root area sized to the available area (`bindAvailableArea`), the window-size media queries settled against it (`areaMatches`, `bindAreaMedia`), the windowed window's size from the shown screen frames (`SCREEN_FRAMES`, `bindScreenSize`), `reportSize`. |

Document owners register here: settings ([settings.md](settings.md)),
`shell.lastMode` and the board choice panel's pin `shell.boardPanel` ([app-shell-menu.md](app-shell-menu.md)), the live figures panel's open state `shell.liveFigures` ([app-shell-2d.md](app-shell-2d.md)) and `shell.firstUse` ([app-shell-help.md](app-shell-help.md)), the
last Classic 2D and 3D board choices ([classic2d.md](classic2d.md),
[mode3d.md](mode3d.md)), the records store's three documents
([records-store.md](records-store.md)), the Records screen's `records.view`
([records-library-view.md](records-library-view.md)) and `replays.library`
([replay-library.md](replay-library.md)), the blob store's one user.
`js/theme.js`, a classic script that cannot import, reads the settings
document's browser key directly at start-up.

## PUBLIC API

Platform module (`js/platform/index.js`) — what callers import: `storage`
and its methods `register`, `load`, `save`, `clear`, `available` by name;
`blobStore`; `leaderboards` and `achievements` (null until their features
fill them); `capabilities`, the live flags of what the host offers —
`desktopHost`, `steam`, `achievements`, `leaderboards`, `sharedFiles`,
`cloud` — with a getter per flag, `snapshot()`, `steamState()` and
`subscribe(listener)`, updated from the host's Steam state events (logged-on
state never turns a flag off); `onOverlayActivated(listener)`, which the
shell answers with the window blur's pause; `addFlushHook(hook)`, awaited
before the page answers the host's flush request; `bindDesktopWindow({
document, setIcon, fullArea })` → `{ actions, reportSize, screenChanged,
dispose }`, the actions `bindWindowButtons`
([app-shell-kit-helpers.md](app-shell-kit-helpers.md)) presses;
`screenChanged()`, which the shell's router calls on every screen change,
reports the windowed window's size, `fullArea()` — a 3D game outside the
replay viewer — making it the whole work area. The web build has no host: every flag is off, and no
overlay, flush or window action ever happens.

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
  from the page bridge (`findBridge(globalThis)`): with the bridge, each
  slot a Steam feature filled in `STEAM_SLOTS` takes that implementation,
  every other slot the browser one, the memory blob store standing in when
  IndexedDB is missing or refuses; it never follows a later change of the
  globals. Tests pin that no other file under `js/` imports an
  implementation, and that no module outside `js/platform/` tests for
  Electron or the bridge.
- **The available area.** At the desktop host `bindDesktopWindow` sizes the
  page's root element — the size container every size step reads
  ([app-shell-kit-layout.md](app-shell-kit-layout.md) § The root area) —
  to the available area of the display the window is on: its work area
  (`screen.availWidth` × `screen.availHeight`) while windowed, the whole
  screen in fullscreen, again on every display change, window resize and
  fullscreen event (`bindAvailableArea`), so the layout never reads the
  window's own size. It then settles every window-size `@media` rule of the
  page's stylesheets — a query list made only of width, height and
  orientation features, the touch step's — against that area, rewriting
  each to `all` or `not all` and keeping its text to settle again, a
  stylesheet added later (a theme switch) once it loads (`areaMatches`,
  `bindAreaMedia`): a desktop work area is never phone-sized, so the
  desktop host never takes the phone layout. Any other media query (a
  pointer, a motion preference) is left to the browser. On the web none
  of this runs: the root area is the browser window and the touch step
  follows it.
- **The windowed window.** Windowed at the desktop host the window is the
  shown screen's frame (`bindScreenSize`): the screens lay out in the
  available area as everywhere, the box around the shown `SCREEN_FRAMES`
  elements is measured — only those inside a layer over the screen
  (`WINDOW_OVER`, `data-window-over` on `index.html`'s pause, results,
  context-lost, ready and Learn 3D end layers) while one shows, so a popup
  is the window alone and the game window's size comes back when it hides;
  a card inside the window (`WINDOW_INSIDE`, `data-window-inside`: the
  Classic 2D status card, which the shell fits inside the game window) is
  never measured —, the root
  element shifted by its corner (`--window-x`, `--window-y`, which
  `css/style.css` applies while the root carries `data-window-state="windowed"`,
  the 3D scene's canvas shifted back onto the window, the toast placed on
  it — centred, above its bottom edge, fitted to its width — and the fatal
  card filling it, no backdrop drawn)
  and its size sent through `reportSize`, deduplicated, on every screen
  change, every change of a frame's size (a `ResizeObserver`) and every
  change of the available area; during 3D play the size is the whole
  available area. Nothing is measured before the first screen change nor in
  fullscreen, where the frame sits on the backdrop; leaving fullscreen
  measures again. The host (`desktop/window.js`) caps the size at the work
  area of the display the window is on and moves the window inside it,
  again whenever the window is moved.

## DOMAIN DEPENDENCIES

- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the interface, versioning, failure contract, implementation selection.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store: named blobs, IndexedDB in the web build.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  the platform layer as the one boundary to storage and Steam.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — platform selection with the bridge, the capability flags, the overlay
  pause, the quit flush, the desktop window's actions.

## CROSS-REFERENCES

- [testing.md](testing.md) — `tests/platform-storage.test.mjs`,
  `tests/platform-browser.test.mjs` (every platform browser test, the
  IndexedDB blob store's round trip among them),
  `tests/platform-blob-store.test.mjs`, `tests/platform-selection.test.mjs`
  (selection with a fake bridge, the flags, the host link, the desktop
  window and its available area).
- [replay-library.md](replay-library.md) — the blob store's one user.
- [app-shell.md](app-shell.md) — the `ms3d.*` keys nothing reads.
- [settings.md](settings.md) — the settings document, the legacy keys it
  carries over, Reset all data.

## WHEN TO READ THE SOURCE

- Adding a Steam implementation: the backend contract in the `storage.js`
  header and `memory-backend.js` (a blob implementation likewise from the
  `blob-store.js` header and `memory-blob-store.js`), then fill its slot in
  `index.js`'s `STEAM_SLOTS` only — a factory of the bridge client
  (`bridge-client.js`).
- A blob store failing in the browser: `indexeddb-blob-store.js`'s
  `openDatabase` and `run`.
- Changing the stored format or the failure rules: `storage.js`'s `parse`,
  `loadDocument` and `saveDocument`.
- A storage test failing on keys or quota: `browser-backend.js` and the
  `FakeStorage` helper in `tests/platform-browser.test.mjs`.
