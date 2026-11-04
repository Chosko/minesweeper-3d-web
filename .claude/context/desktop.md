# Desktop host — Electron main process, window and closing

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

This file covers the main process, the window, the protocol, the crash log
and the closing sequence. The adapter, the bridge and the preload are
[desktop-steam.md](desktop-steam.md)'s; the file service and the build
[desktop-files.md](desktop-files.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `desktop/main.js` | The main process: the crash log, the game scheme and the overlay switches before ready; the single-instance lock (a second launch restores and focuses the window); Steam start-up before any window, exiting when Steam relaunches the game; on ready the protocol handler, the file service over the user-data directory, the window placed from its state file, the overlay repaint, the bridge — handed the file service's stored-theme reader — with the file service registered in its slots and attached, the window's close turned into the closing sequence. |
| `desktop/window.js` | The game window (`createGameWindow`, `windowOptions`): frameless, opaque on black, no shadow, not maximisable, resizable only while fullscreen, shown on its first frame; its actions (`windowActions`): `setContentSize`, `toggleFullscreen`, `minimise`, `isFullscreen`, `onFullscreenChange`; navigation locked to the game origin, no other window (`lockNavigation`); the windowed position and fullscreen state saved on every change. `DEFAULT_CONTENT_SIZE` before the page reports its own. |
| `desktop/window-state.js` | The window state file `WINDOW_STATE_FILE` in the user-data directory: position and fullscreen, never the size; parse, read, atomic write; `placeOnScreen` drops a position no display's work area shows any more, so the window is centred. |
| `desktop/protocol.js` | The game protocol `app://game/` (`GAME_URL`): the scheme registered privileged before ready, its handler serving only the top-level `GAME_ENTRIES` of the game root by GET or HEAD with their MIME type; anything else 404. |
| `desktop/closing.js` | The closing sequence (`createClosing`): the flush hook bounded by `FLUSH_TIMEOUT_MS`, the shutdown hook, exit; runs once however often asked. |
| `desktop/crash-log.js` | The local crash log `CRASH_LOG_FILE` in the user-data directory, rotated past `CRASH_LOG_MAX_BYTES`, keeping `CRASH_LOG_KEEP` old files, never uploaded; captures the main process's uncaught errors and rejections and the page's uncaught console errors, a renderer gone and a failing preload. Writing never throws. |

## PUBLIC API

The window's actions (`windowActions` in `desktop/window.js`) —
`setContentSize`, `toggleFullscreen`, `minimise`, `isFullscreen`,
`onFullscreenChange` — are what the bridge's `window.*` requests and the
`fullscreenChanged` event run on, and `createClosing` is what `quit.request`
runs ([desktop-steam.md](desktop-steam.md) § PUBLIC API).

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

## DOMAIN DEPENDENCIES

- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the host, the window's behaviour, quitting, the overlay settings.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the title bar whose buttons and drag region drive the window, the
  screen frame whose size the window takes.
- [../domain/technical-direction.md](../domain/technical-direction.md) —
  Electron, the Node binding, the narrow IPC surface.

## CROSS-REFERENCES

- [desktop-steam.md](desktop-steam.md) — the adapter `startSteam` selects,
  the bridge and the preload; [desktop-files.md](desktop-files.md) — the
  file service the main process builds, the pre-paint theme, the build and
  SteamPipe.
- [platform-host.md](platform-host.md) — the page's side: `findBridge`, the
  request client, the slots, the capability flags, `linkHost` and the quit
  flush; [platform-window.md](platform-window.md) — the desktop window
  driven from the page.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — `bindWindowButtons`,
  the title bar's Minimise, Fullscreen / Windowed and Quit.
- [app-shell-pause.md](app-shell-pause.md) — the overlay pause;
  [app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md) — the quit
  flush in the shell.
- [testing-files.md](testing-files.md) — the `desktop-` tests.

## WHEN TO READ THE SOURCE

- The window misplaced or mis-sized: `windowActions` in `window.js` and
  `placeOnScreen` in `window-state.js`.
- The overlay not drawing or not pausing: `OVERLAY_SWITCHES`, the repaint in
  `main.js`, and the overlay callback in `openSteamworks`
  ([desktop-steam.md](desktop-steam.md)).
- A game file not served: `GAME_ENTRIES` in `protocol.js`.
