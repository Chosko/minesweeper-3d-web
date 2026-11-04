# Desktop host — Electron main process, Steam adapter, page bridge, file service, packaging

## OVERVIEW

The Windows desktop build under `desktop/`: an Electron application with
its own `package.json` (Electron a dev dependency, the Steamworks binding
`steamworks-ffi-node` its one runtime dependency), separate from the web
game, which has none. The main process loads the same game files the web
preview serves over a custom protocol into one frameless, opaque game
window, owns the one connection to Steam through the Steamworks capability
adapter, and answers the page over the page bridge — a fixed list of
requests and events, validated in the main process. The file service keeps
the game's saves as files under the user-data directory — the save
directory, which Steam Auto-Cloud syncs, and the machine prefs directory
beside it, which stays on the machine — and hands the page the stored theme
id before first paint. Nothing under `js/` imports Electron or the binding;
the page's side of the bridge, platform selection and the capability flags
are [platform-host.md](platform-host.md)'s, the Steam storage and blob
store over the bridge [platform.md](platform.md)'s and
[platform-blobs.md](platform-blobs.md)'s, the desktop window driven from
the page [platform-window.md](platform-window.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `desktop/main.js` | The main process: the crash log, the game scheme and the overlay switches before ready; the single-instance lock (a second launch restores and focuses the window); Steam start-up before any window, exiting when Steam relaunches the game; on ready the protocol handler, the file service over the user-data directory, the window placed from its state file, the overlay repaint, the bridge — handed the file service's stored-theme reader — with the file service registered in its slots and attached, the window's close turned into the closing sequence. |
| `desktop/window.js` | The game window (`createGameWindow`, `windowOptions`): frameless, opaque on black, no shadow, not maximisable, resizable only while fullscreen, shown on its first frame; its actions (`windowActions`): `setContentSize`, `toggleFullscreen`, `minimise`, `isFullscreen`, `onFullscreenChange`; navigation locked to the game origin, no other window (`lockNavigation`); the windowed position and fullscreen state saved on every change. `DEFAULT_CONTENT_SIZE` before the page reports its own. |
| `desktop/window-state.js` | The window state file `WINDOW_STATE_FILE` in the user-data directory: position and fullscreen, never the size; parse, read, atomic write; `placeOnScreen` drops a position no display's work area shows any more, so the window is centred. |
| `desktop/protocol.js` | The game protocol `app://game/` (`GAME_URL`): the scheme registered privileged before ready, its handler serving only the top-level `GAME_ENTRIES` of the game root by GET or HEAD with their MIME type; anything else 404. |
| `desktop/closing.js` | The closing sequence (`createClosing`): the flush hook bounded by `FLUSH_TIMEOUT_MS`, the shutdown hook, exit; runs once however often asked. |
| `desktop/file-service.js` | The file service (`createFileService`, `registerFileService`): the save directory `SAVE_DIR` and the machine prefs directory `PREFS_DIR` under the user-data directory, the machine-local documents `MACHINE_DOCUMENTS`, names checked against `NAME_PATTERN`; safe writes, reads, set-aside, document delete and list, blob put, get, delete and list; `storedTheme()`, the settings document's (`SETTINGS_DOCUMENT`, at `SETTINGS_VERSIONS`) theme id for the first paint. |
| `desktop/crash-log.js` | The local crash log `CRASH_LOG_FILE` in the user-data directory, rotated past `CRASH_LOG_MAX_BYTES`, keeping `CRASH_LOG_KEEP` old files, never uploaded; captures the main process's uncaught errors and rejections and the page's uncaught console errors, a renderer gone and a failing preload. Writing never throws. |
| `desktop/adapter/interface.js` | The capability adapter's interface in its head comment: `CAPABILITIES`, `ADAPTER_OPERATIONS` per capability, the typed errors (`ERROR_CODES`, `ERROR_MESSAGES`, `HostError`, `toTypedError`), `adapterProblems` — what an adapter lacks. |
| `desktop/adapter/unavailable.js` | The unavailable adapter: every capability false, every call rejects `unavailable` ("Steam unavailable"), no event fires. |
| `desktop/adapter/steam.js` | The Steam adapter and start-up: `openSteamworks`, the only code that touches the binding; `createSteamAdapter` over any binding object; `startSteam`, `resolveAppId`, `steamLibraryPath`; `OVERLAY_SWITCHES`, `PUMP_INTERVAL_MS`, the file names `STEAM_APP_FILE`, `DEV_APP_ID_FILE`, `STEAM_API_LIBRARY`. |
| `desktop/bridge.js` | The page bridge's main-process side: `BRIDGE_REQUESTS` (validators, the capability each needs, what it runs), `SLOT_REQUESTS`, `BRIDGE_EVENTS`, `LIMITS`, the globals (`PRE_PAINT_GLOBAL` beside the bridge's) and channels, `bridgeSpec`, `validateRequest`, `createBridge`. The one authority of the request and event lists. |
| `desktop/preload.js` | The sandboxed preload: reads the lists and the pre-paint theme from the main process and exposes one deeply frozen object, the page's global `ms3dHost`, and beside it the frozen `ms3dPrePaint` `{ theme }`. |
| `desktop/build/package.mjs` | The build path behind `npm run package`, `npm run steampipe` and `npm run appid`. |
| `desktop/steampipe/` | The SteamPipe app and depot build script templates, `config.example.json` beside the git-ignored `config.json`. |
| `deploy-steam.sh` | Package, render and upload in one go (repository root). |
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

File service (`desktop/file-service.js`) — `createFileService({ root, fs?,
readFileSync?, now? })`, `root` the user-data directory, → `{ dir,
prefsDir, read, write, setAside, deleteDocument, listDocuments,
storedTheme, put, get, delete, list }`:
- documents by name: `read(name)` → the text or null; `write(name, text)`;
  `setAside(name)` → the kept-aside file name or null; `deleteDocument(name)`
  removes the file and every kept-aside copy in both directories;
  `listDocuments()` → every name with a file or a kept-aside copy in
  either, sorted;
- blobs by store and key: `put(store, key, bytes)`, `get` → the bytes or
  null, `delete`, `list(store)` → the sorted keys;
- `storedTheme()` → the theme id or null, synchronous, never throws;
- every other call rejects with a `HostError`: `invalid` for a bad name or
  argument, `failed` for a disk that refuses.
`registerFileService(bridge, files)` fills every slot request with it.

Build (`desktop/build/package.mjs`, run from `desktop/`):
- `npm run package` (`buildWindows`) → `desktop/out/win-x64/`: Electron's
  distribution with the executable renamed `EXE_NAME`, the host under
  `resources/app` with its runtime packages and theirs (optional ones only
  for win32 x64), the game's `GAME_ENTRIES` under `resources/game`, the app
  id as `resources/app/steam-app.json` when the local Steam config is
  present, `steam_api64.dll` beside the executable when
  `desktop/redist/` holds it; any development app id file removed.
- `npm run steampipe` (`writeSteamPipeScripts`) → the app and depot build
  scripts under `desktop/out/steampipe/`, refused when there is no build or
  its app id is not the config's (`builtAppIdProblem`); prints the SteamCMD
  upload command.
- `npm run appid` (`writeDevAppId`) → `desktop/steam_appid.txt` for a
  development run.
- The local Steam config `desktop/steampipe/config.json`
  (`STEAM_CONFIG_KEYS`: `appId`, `depotId`, `branch`, `description`;
  `parseSteamConfig`), git-ignored: an empty branch uploads without setting
  the build live, `default` is refused.
- `./deploy-steam.sh [--dry-run]` packages, renders and uploads with
  SteamCMD, whose path and builder account come from the git-ignored
  `desktop/steampipe/deploy.env` (`STEAMCMD`, `STEAM_LOGIN`) or the
  environment; the dry run prints the upload command instead.

## INTERNAL PATTERNS

- **Start-up order.** Before ready: the crash log captures the main
  process, the scheme is registered, the overlay switches are appended.
  Then the single-instance lock, then `startSteam`: a packaged build started
  outside Steam asks Steam to relaunch it and exits; no binding, no app id
  or a failed init selects the unavailable adapter, and the game plays with
  local saves. The app id: the packaged build's `steam-app.json`, a
  development run's `desktop/steam_appid.txt`, either falling back to
  Steam's `SteamAppId`. The Steam API library: beside the executable when
  packaged, `desktop/redist/steam_api64.dll` in development.
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
- **The window.** Frameless and opaque on a black background, so the page
  draws the whole window; the page marks its title bars as the drag region.
  Windowed it is never resizable: `setContentSize` takes the size the page
  reports, capped at the work area of the display the window is on, and
  moves the window inside it, again whenever the window is moved. Entering
  fullscreen makes it resizable, saves its windowed bounds and sets the
  display's full bounds itself; leaving restores the bounds and applies the
  last reported size. The fullscreen state follows the window's enter and
  leave events; `fullscreenChanged` tells the page, whose title bar button
  swaps its icon. The page side — the drag region, the available area, the
  reported size, the popup sizing and the frame's corners — is
  [platform-window.md](platform-window.md) § The windowed window and § The
  available area.
- **The overlay.** `OVERLAY_SWITCHES` run Chromium's GPU work in the main
  process so Steam can draw its overlay; while the adapter has the overlay
  capability, the main process invalidates the page on a timer, so Steam,
  which draws and opens its overlay only on the game's own frames, can do
  so over a still page. The overlay's activation reaches the page as
  `overlayActivated`, which the shell answers as a window blur
  ([app-shell-pause.md](app-shell-pause.md)).
- **Closing.** Closing the window, every window closed and `quit.request`
  all run the one closing sequence: `flushRequested` to the page, which
  answers `quit.handshake` once its saves are written (the timeout bounds
  the wait, and with no page it settles at once), then the adapter's
  `shutdown`, then exit — so Steam Cloud's exit sync sees the final files.
- **Saves.** The file service owns two directories under the user-data
  directory. The save directory (`saves/`) holds one `<name>.json` per
  document and a `<store>.blobs/` directory per blob store — the replay
  library's `replays` and the leaderboard outbox's among them — with one
  file per blob, nothing else. It is the Steam Auto-Cloud root, set in the
  Steamworks app settings (OS "All OSes", every file beneath it,
  recursively), so all of it syncs at launch and exit; how to make an
  unreleased app sync is `dev/steam/README.md` § Testing Steam Cloud before
  release. The machine prefs directory (`prefs/`) beside it holds the
  `MACHINE_DOCUMENTS` — the machine settings document — in the same format
  and never syncs, like the window state file and the crash log. A
  document's directory is chosen by its name alone. Every name is checked
  against `NAME_PATTERN` and the Windows device names before a path is
  built, so no request reaches outside the two directories.
- **Safe writes.** A write goes to a `~`-marked temporary file in the same
  directory, flushed and renamed over the old file; writes and deletes of
  one file run in call order; a crash mid-write leaves the old file whole,
  and its temporary file is swept the first time the directory is used.
  Set-aside renames a document with a dated `.aside-` suffix, never
  overwriting an earlier copy, so its name reads as missing.
- **Pre-paint theme.** Every time the page loads, the preload's synchronous
  spec request makes the main process read the settings document's file
  (`storedTheme`) and hand its theme id over as `ms3dPrePaint`, before any
  page script runs; an absent, unreadable or newer file hands over null.
  `js/theme.js` takes it instead of browser storage
  ([app-shell-theme-runtime.md](app-shell-theme-runtime.md)).
- **What the build carries.** The host's top-level `.js` files, `adapter/`
  (`APP_DIRS`) and `package.json`; the game files the protocol serves; the
  app id and Steam API library only when present locally. The depot script
  excludes the development app id file and debug symbols. The ids live only
  in the git-ignored config and the build made from it.

## DOMAIN DEPENDENCIES

- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the host, the window's behaviour, the adapter's capabilities, the bridge,
  quitting, the binding and overlay settings, packaging and SteamPipe.
- [../domain/features/steam-cloud-saves.md](../domain/features/steam-cloud-saves.md)
  — the file service, the save and machine prefs directories, the pre-paint
  theme, the Auto-Cloud configuration and quota.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the title bar whose buttons and drag region drive the window, the
  screen frame whose size the window takes.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  Electron, the Node binding, the narrow IPC surface.

## CROSS-REFERENCES

- [platform-host.md](platform-host.md) — the page's side: `findBridge`, the
  request client, the slots, the capability flags, `linkHost` and the quit
  flush; [platform.md](platform.md) and [platform-blobs.md](platform-blobs.md)
  — the Steam storage and blob store over the bridge;
  [platform-window.md](platform-window.md) — the desktop window driven from
  the page.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — `bindWindowButtons`,
  the title bar's Minimise, Fullscreen / Windowed and Quit.
- [app-shell-pause.md](app-shell-pause.md) — the overlay pause and the quit
  flush in the shell.
- [testing.md](testing.md) — the `desktop-` tests.

## WHEN TO READ THE SOURCE

- Adding a bridge request or event: `BRIDGE_REQUESTS` / `BRIDGE_EVENTS` in
  `bridge.js`, then the page's copy of the event list and the client in
  `js/platform/bridge-client.js`.
- Adding an adapter operation: the head comments of `adapter/interface.js`
  and `adapter/steam.js`, then `openSteamworks` for the binding call.
- A save in the wrong directory, or a name refused: `MACHINE_DOCUMENTS`,
  `NAME_PATTERN` and `documentOf` in `file-service.js` (`MACHINE_DOCUMENTS`
  is kept in step with `js/settings/store.js`'s `MACHINE_SETTINGS_DOC` by
  `tests/desktop-file-service.test.mjs`).
- The first paint in the wrong theme on the desktop host: `storedTheme` and
  `SETTINGS_VERSIONS` in `file-service.js`, `bridgeSpec` and `attach` in
  `bridge.js`.
- The window misplaced or mis-sized: `windowActions` in `window.js` and
  `placeOnScreen` in `window-state.js`.
- The overlay not drawing or not pausing: `OVERLAY_SWITCHES`, the repaint in
  `main.js`, and the overlay callback in `openSteamworks`.
- A packaged build missing a file: `buildWindows` and `runtimePackages` in
  `build/package.mjs`.
