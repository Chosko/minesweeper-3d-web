# Platform — start-up selection, capability flags, host link

## OVERVIEW

The platform layer's side that faces the desktop host: the one module
callers import from, which selects each slot's implementation once at
start-up; the capability flags; the page's link to the host (Steam state,
the overlay, the quit flush). The document storage and the Steam build's
storage are [platform.md](platform.md)'s, the blob store
[platform-blobs.md](platform-blobs.md)'s, the desktop window driven from
the page [platform-window.md](platform-window.md)'s. DOM-free.

| File | Responsibility |
| ---- | -------------- |
| `js/platform/index.js` | The selector (`selectPlatform`): looks for the page bridge once at start-up, fills each slot (storage, blob store, leaderboards, achievements) with its Steam implementation (`STEAM_SLOTS`) or the web build's (`BROWSER_SLOTS`); re-exports the storage methods; the capability flags, the host link with the Steam saves' flush hook, and the desktop window. |
| `js/platform/capabilities.js` | The capability flags (`CAPABILITY_FLAGS`, `deriveFlags`, `createCapabilities`) and the latest Steam state. |
| `js/platform/bridge-client.js` | The page's side of the page bridge: `findBridge`, the request client — document, blob, achievement, leaderboard and shared-file requests —, `linkHost` — Steam state into the flags, overlay listeners, the quit flush. |

## PUBLIC API

Platform module (`js/platform/index.js`) — what callers import, never an
implementation:
- `storage` and its methods `register`, `load`, `save`, `clear`,
  `available` by name ([platform.md](platform.md)); `blobStore`
  ([platform-blobs.md](platform-blobs.md)).
- `leaderboards` — on the desktop host the Steam leaderboards, on the web
  the local stand-in (`js/leaderboards/local.js`), both from
  `js/leaderboards/index.js` with one interface and a `local` flag telling
  them apart; the shell hands both the records and the replay library
  through `leaderboards.connect({ records, replays })`, which only the
  stand-in reads ([leaderboards-steam.md](leaderboards-steam.md)).
- `achievements` — on the desktop host the Steam achievements
  (`createSteamAchievements`, `js/achievements/index.js`), with
  `onGameFinished(summary)`, which the results flow calls
  ([app-shell-results.md](app-shell-results.md)), and `start({ history })`,
  which the shell calls with the records store's `games()` once the
  records have loaded ([records-store.md](records-store.md)); null on the
  web build.
- `capabilities`, the live flags of what the host offers, which callers
  read instead of testing for the platform — `desktopHost` (the bridge is
  present), `steam` (the host runs the Steam adapter, not the unavailable
  one), `achievements`, `leaderboards` and `sharedFiles` (Steam present and
  the adapter's capability of that name), `cloud` (Steam present) — with a
  getter per flag, `snapshot()`, `steamState()` and `subscribe(listener)`,
  derived at start-up from selection and again from every Steam state the
  host sends (`deriveFlags`; logged-on state never turns a flag off, since
  a call needing the Steam network rejects `offline`).
- `onOverlayActivated(listener)`, which the shell answers with the window
  blur's pause; `addFlushHook(hook)`, awaited before the page answers the
  host's flush request — with the bridge, every storage and blob request
  in flight is already one.
- `bindDesktopWindow(…)` — [platform-window.md](platform-window.md).
- The web build has no host: every flag is off, and no overlay, flush or
  window action ever happens.

## INTERNAL PATTERNS

- **Start-up selection.** `index.js` is the only module that imports a
  backend or blob implementation; it selects once, when first evaluated,
  from the page bridge (`findBridge(globalThis)`): with the bridge, each
  slot a Steam feature filled in `STEAM_SLOTS` takes that implementation,
  every other slot its `BROWSER_SLOTS` one — the memory blob store standing
  in when IndexedDB is missing or refuses, the local leaderboards stand-in
  for `leaderboards`, null for `achievements`; it never follows a later
  change of the globals. Slots are filled in order, so the Steam
  leaderboards are built over the selected storage and the capability
  flags, and open the outbox's blob store through the same save-tracked
  Steam blob store as the replays ([platform.md](platform.md) § The Steam
  build's storage). Tests pin that no other file under `js/` imports an
  implementation, and that no module outside `js/platform/` tests for
  Electron or the bridge.

## DOMAIN DEPENDENCIES

- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — platform selection with the bridge, the capability flags, the overlay
  pause, the quit flush.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  the platform layer as the one boundary to storage and Steam.
- [../domain/features/steam-leaderboards.md](../domain/features/steam-leaderboards.md)
  — the leaderboards selected per build, the local stand-in on the web.
- [../domain/features/steam-achievements.md](../domain/features/steam-achievements.md)
  — the achievements slot, the end-of-game hook and catch-up.

## CROSS-REFERENCES

- [platform.md](platform.md) — the backends the selector chooses between,
  the Steam storage's save tracker behind the flush hook, the documents'
  owners; [platform-blobs.md](platform-blobs.md) — the blob
  implementations; [platform-window.md](platform-window.md) — the desktop
  window.
- [desktop-steam.md](desktop-steam.md) — the host's side of the bridge: its request
  and event lists, the Steam state it sends, the closing sequence that
  sends the flush request ([desktop.md](desktop.md)).
- [leaderboards.md](leaderboards.md), [leaderboards-steam.md](leaderboards-steam.md) — the leaderboards slot's two
  implementations; [achievements.md](achievements.md) — the achievements
  slot's implementation; [app-shell-results.md](app-shell-results.md) — the
  achievements' end-of-game hand-off.
- [app-shell-pause.md](app-shell-pause.md) — the overlay pause;
  [app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md) — the
  quit flush's end of the game.
- [testing-files.md](testing-files.md) — `tests/platform-selection.test.mjs`
  (selection with a fake bridge, the flags, the host link); the
  leaderboards slot's selection is pinned in
  `tests/leaderboards-local.test.mjs` and
  `tests/leaderboards-steam.test.mjs`, the achievements slot's and the
  bridge client's achievement requests in
  `tests/achievements-unlock.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a Steam implementation of a slot: fill it in `index.js`'s
  `STEAM_SLOTS` only — a factory of the bridge client (`bridge-client.js`)
  and of what is selected before it — the capability flags and the earlier
  slots (`{ capabilities, storage, blobStore, … }`); a storage or blob
  implementation is written to [platform.md](platform.md)'s or
  [platform-blobs.md](platform-blobs.md)'s contract.
- A flag wrong after a Steam state change: `deriveFlags` in
  `capabilities.js` and `linkHost` in `bridge-client.js`.
