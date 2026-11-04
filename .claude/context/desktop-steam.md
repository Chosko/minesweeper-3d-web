# Desktop host — Steamworks capability adapter and page bridge

## OVERVIEW

The desktop host's one connection to Steam, the Steamworks capability
adapter, and the page bridge it answers the page over — a fixed list of
requests and events, validated in the main process. The main process, the
window and the closing sequence are [desktop.md](desktop.md)'s; the file
service and the build [desktop-files.md](desktop-files.md)'s. Nothing under
`js/` imports Electron or the binding; the page's side of the bridge,
platform selection and the capability flags are
[platform-host.md](platform-host.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `desktop/adapter/interface.js` | The capability adapter's interface in its head comment: `CAPABILITIES`, `ADAPTER_OPERATIONS` per capability, the typed errors (`ERROR_CODES`, `ERROR_MESSAGES`, `HostError`, `toTypedError`), `adapterProblems` — what an adapter lacks. |
| `desktop/adapter/unavailable.js` | The unavailable adapter: every capability false, every call rejects `unavailable` ("Steam unavailable"), no event fires. |
| `desktop/adapter/steam.js` | The Steam adapter and start-up: `openSteamworks`, the only code that touches the binding; `createSteamAdapter` over any binding object; `startSteam`, `resolveAppId`, `steamLibraryPath`; `OVERLAY_SWITCHES`, `PUMP_INTERVAL_MS`, the file names `STEAM_APP_FILE`, `DEV_APP_ID_FILE`, `STEAM_API_LIBRARY`. |
| `desktop/bridge.js` | The page bridge's main-process side: `BRIDGE_REQUESTS` (validators, the capability each needs, what it runs), `SLOT_REQUESTS`, `BRIDGE_EVENTS`, `LIMITS`, the globals (`PRE_PAINT_GLOBAL` beside the bridge's) and channels, `bridgeSpec`, `validateRequest`, `createBridge`. The one authority of the request and event lists. |
| `desktop/preload.js` | The sandboxed preload: reads the lists and the pre-paint theme from the main process and exposes one deeply frozen object, the page's global `ms3dHost`, and beside it the frozen `ms3dPrePaint` `{ theme }`. |
| `dev/steam/create-boards.mjs` | Creates the catalogue's leaderboards from the client; how the leaderboards are made and how Steam Cloud is tested before release (`dev/steam/README.md`). |
| `dev/steam/read-board.mjs` | Prints the named leaderboards' top entries; writes nothing. |
| `dev/steam/probe-upload.mjs` | Uploads one score to an existing leaderboard and reads it back, behind `--yes`. |
| `dev/steam/probe-control.mjs` | The same upload to a throwaway leaderboard the client creates, behind `--yes`. |
| `dev/steam/probe-steam.mjs` | The probes' shared Steam session over `openSteamworks`: app id, callback pump, shutdown. |

## PUBLIC API

Adapter (`desktop/adapter/interface.js`) — six capabilities, each reported
in `adapter.capabilities` as a boolean, plus `kind` (`'steam'` or
`'unavailable'`) and `shutdown()`:
- `identity` — `player()` → `{ steamId, name }`, `personaNames(steamIds)`;
- `presence` — `loggedOn()`, `onPresenceChange(listener)`;
- `achievements` — `setAchievement(name)`, `storeStats()`,
  `achievementsSet(names)`;
- `leaderboards` — `findLeaderboard(name)`, `uploadScore(handle, score,
  details)` keeping the best, `downloadScores(handle, { scope, start, end })`
  for `global`, `friends`, `around`, `downloadScoresForPlayers(handle,
  steamIds)`;
- `sharedFiles` — `writeAndShare(name, bytes)`, `downloadShared(fileHandle)`,
  `attachToLeaderboard(handle, fileHandle)`;
- `overlay` — `onOverlayActivated(listener(active))`.
Calls are async and reject with a `HostError` whose code is one of
`unavailable`, `offline`, `not-found`, `invalid`, `failed`; the `on…`
subscriptions return their unsubscribe. Steam ids and handles cross as
decimal strings.

Bridge (`desktop/bridge.js`) — the page's `ms3dHost` holds a promise
function per request, grouped `<group>.<request>`, and under `events` a
subscribe function per event returning its unsubscribe:
- requests: `steam.state` → `{ adapter, loggedOn, player, capabilities }`;
  `identity.names` (other players' persona names); `achievements.set` / `store` / `read`; `leaderboards.find` / `upload` /
  `download` (a rank range in a scope, or named players) / `attach`;
  `sharedFiles.writeAndShare` / `download`; the slots `storage.read` /
  `write` / `setAside` / `delete` / `list` and `blobs.put` / `get` /
  `delete` / `list`, run by the handler the file service registers
  (`bridge.register`), `unavailable` until one does; `quit.handshake`,
  `quit.request` (the closing sequence);
  `window.minimise`, `window.toggleFullscreen`, `window.setContentSize`;
- events: `steamStateChanged`, `overlayActivated`, `flushRequested`,
  `fullscreenChanged`;
- every request resolves with its value or rejects with `{ code, message }`
  and never throws into the page.

`createBridge({ adapter, window, closing, prePaintTheme? })` → `{ handle,
register, steamState, emit, requestFlush, attach, detach }`; `attach({
ipcMain, webContents })` answers that one window only and fills the closing
sequence's hooks — the page's flush and the adapter's shutdown.
`bridgeSpec({ prePaintTheme })` is what the preload reads synchronously as
the page loads: the request and event lists, the channels, and `prePaint:
{ global, theme }`, the theme a string or null.

## INTERNAL PATTERNS

- **The binding layer.** `openSteamworks` wraps steamworks-ffi-node as a
  flat binding object (its shape is the head comment of `steam.js`),
  declaring on the binding's own library handle the Steam API calls the
  binding lacks — the remote storage share, the shared-file download, the
  overlay activation callback — and decoding a downloaded entry's details
  itself (`decodeLeaderboardEntry`). It returns null when the library or the
  binding does not load. Why this binding is
  [steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  § Binding and overlay settings.
- **The Steam adapter.** A capability is available when the binding object
  carries every method `BINDING_METHODS` lists for it. A pump on a timer
  runs Steam's callbacks and reads the logged-on state, telling presence
  listeners on a change. Calls on the client alone reject `failed` when
  Steam fails them; calls that need the Steam network — leaderboards and
  shared files — reject `offline` while Steam is not logged on. Every call
  after `shutdown` rejects `unavailable`.
- **Request validation.** `validateRequest` checks the operation is listed,
  the argument count, and each argument's type and bound against `LIMITS`;
  anything else is `invalid`. A request whose capability the adapter lacks
  is `unavailable` before it runs. A sender other than the game window's
  contents is refused. Any non-`HostError` becomes `failed`.
- **Steam state.** `steam.state` and `steamStateChanged` carry the adapter's
  kind, logged-on state, the player and the capability booleans; the bridge
  re-reads them on every presence change. The page derives its capability
  flags from them ([platform-host.md](platform-host.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the adapter's capabilities, the bridge, the binding and overlay settings.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  Electron, the Node binding, the narrow IPC surface.

## CROSS-REFERENCES

- [desktop.md](desktop.md) — the main process that starts Steam, the window
  the bridge's window requests drive, the closing sequence `quit.request`
  runs; [desktop-files.md](desktop-files.md) — the file service the slot
  requests run on and the pre-paint theme `bridgeSpec` hands over.
- [platform-host.md](platform-host.md) — the page's side: `findBridge`, the
  request client, the slots, the capability flags, `linkHost` and the quit
  flush; [platform.md](platform.md) and [platform-blobs.md](platform-blobs.md)
  — the Steam storage and blob store over the bridge.
- [testing-files.md](testing-files.md) — the `desktop-` tests.

## WHEN TO READ THE SOURCE

- Adding a bridge request or event: `BRIDGE_REQUESTS` / `BRIDGE_EVENTS` in
  `bridge.js`, then the page's copy of the event list and the client in
  `js/platform/bridge-client.js`.
- Adding an adapter operation: the head comments of `adapter/interface.js`
  and `adapter/steam.js`, then `openSteamworks` for the binding call.
- The overlay not drawing: the overlay callback in `openSteamworks`, and
  [desktop.md](desktop.md) for the switches and the repaint.
