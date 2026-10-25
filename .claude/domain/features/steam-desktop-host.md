# Steam desktop host

The Windows desktop build of the game: an Electron application that loads
the same game code the web preview runs, owns the one connection to Steam
through a Steamworks capability adapter, exposes Steam to the game page over
a narrow fixed bridge, and is uploaded to Steam as a private build through
SteamPipe.

## Purpose

[product-design.md § Steam features](../product-design.md#steam-features)
puts the game on Steam with leaderboards, achievements and cloud saves, and
the m3-on-steam exit criteria require it to install and run from Steam on
Windows, fully playable offline, while the web preview keeps running
everything except Steam. Every other Steam feature needs a desktop process
that can talk to Steamworks, a fixed boundary through which the page reaches
it, and a way to choose between the Steam and the browser implementations of
the platform layer. This feature is that host. It also isolates the one
decision [technical-direction.md](../technical-direction.md) leaves open —
which Steamworks binding to use — behind an adapter, so the rest of the Steam
features are designed and built against the adapter, not the binding.

## Scope and non-goals

In scope (m3-on-steam):

- The Electron main process: one game window, its lifecycle, single-instance
  lock, window state, quitting with saves flushed, and a local crash log.
- The desktop window's behaviour: a frameless, transparent window drawn
  entirely by the game in its title bar's style, windowed by default,
  dragged by its title bar, sized by its content and never by the player,
  and its Fullscreen / Windowed and Minimise actions, which the title bar's
  buttons call.
- Serving the packaged game files to the window so ES modules and the
  generation worker load as they do on the web.
- The Steamworks capability adapter: the one interface the main process
  uses for Steam, with the capability list the chosen binding must satisfy,
  and an unavailable implementation used when Steam cannot start.
- The binding spike that chooses the adapter's Steam implementation —
  a prerequisite of every leaderboard task.
- The page bridge: the fixed set of Steam and file operations the page may
  call, and the events it may receive.
- Platform selection in the page: the Steam implementations when the bridge
  is present, the browser implementations otherwise, with capability flags
  the rest of the game reads.
- Steam presence: start-up through Steam, the logged-on and connection
  state, the overlay and its activation event.
- Windows packaging and the SteamPipe upload of a private build.

Non-goals:

- File-backed storage and Steam Cloud — `steam-cloud-saves`.
- Leaderboard logic and the leaderboard screen — `steam-leaderboards`,
  `leaderboard-screen`.
- Achievement definitions and unlocking — `steam-achievements`.
- The title bar and its buttons — `shared-screen-layout`; what Quit does —
  `leaderboards-menu-entry`, whose quit request this feature answers.
- Mac and Linux builds and Steam Deck — not now, per
  [product-roadmap.md § Not now](../product-roadmap.md#not-now).
- The demo build and its separate app — deferred to `m5-core-complete`.
- Store page, capsules and trailer — not now.

## Architecture

Built within the recorded technical direction — Electron for the Steam
build, a Node binding to Steamworks inside it, and a narrow fixed IPC surface
between the page and Electron's main process (see
[technical-direction.md](../technical-direction.md)). The game code is the
same ES modules the web preview serves; nothing in a mode, the shell or the
rules engine imports Electron or the binding.

- **Main process.** Starts the Steam adapter, creates the game window and
  routes bridge requests to the adapter or to the file services. Holds a
  single-instance lock, so a second launch focuses the running window.
  Remembers the window's position and fullscreen state in a small local
  file of its own, outside the cloud-synced save directory. Writes
  uncaught errors from both processes to a local crash log, never uploaded,
  as the direction's observability rule allows.
- **The desktop window.** The game window has no system title bar or
  frame and is transparent, so the game draws the whole window, rounded
  corners included, in its title bar's style; the page marks its title
  bar as the drag region, and the window is dragged by it like any other
  window. The player cannot resize it: windowed, there is no backdrop and
  the window is the screen's frame at its natural size, laid out against
  the work area of the display the window is on — never against the
  window's own size, which would feed back on itself — and the page reports
  that size over the bridge on every screen change and every change of the
  frame's size (the board choice window grows when its panel opens); the
  host resizes the window to it, never past the work area
  ([shared-screen-layout.md](./shared-screen-layout.md) § Architecture,
  **Screen frame**). It is windowed by default. Fullscreen renders the game
  full-screen on its backdrop, the frame at its natural size, as the canvas
  shows it, neither
  draggable nor resizable; the title bar's button then shows the Windowed
  icon, and pressing it returns to the floating window as it was, the
  button showing the Fullscreen icon again. Minimise minimises the game to
  the taskbar. Exact sizes and looks come from the canvas
  https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC, J-Components *Window
  title bar* and J-C2D-xl.
- **Game file serving.** The window loads the packaged game from a custom
  application protocol rather than plain file URLs, because ES modules and
  workers do not load from file URLs. The page runs with context isolation
  on, Node integration off and the sandbox on.
- **Steamworks capability adapter.** The only code that touches the
  binding. It exposes Steam as a set of capabilities, each available or not:
  - identity — the player's Steam id and persona name, and persona names of
    other players;
  - presence — logged on or not, and changes to it;
  - achievements — set an achievement, store stats, read which are set;
  - leaderboards — find a leaderboard by name; upload a score with an
    integer details array, keeping the best; download entries in a range for
    global, friends and around-the-player scopes and for given players;
  - shared files — write a file to Steam remote storage, share it, download
    a shared file by handle, and attach a shared file to the player's
    leaderboard entry;
  - overlay — the overlay renders in the window, and its activation events.
  The adapter runs the binding's callback pump on a timer in the main
  process. It has two implementations: the Steam one built on the binding
  the spike chooses, and an unavailable one, selected when Steam does not
  start, where every capability reports unavailable and every call fails
  with "Steam unavailable".
- **Binding spike.** Before the adapter's Steam implementation is built, a
  spike evaluates candidate bindings against the capability list above —
  extending steamworks.js with the leaderboard and shared-file calls, or
  adopting another binding — inside the packaged Electron build, including
  the overlay rendering and the native module building against Electron's
  runtime. Its outcome picks the Steam implementation only; the adapter
  interface does not change with it. A binding that lacks a capability
  leaves that capability reported unavailable rather than changing any
  caller.
- **Page bridge.** A preload script exposes one frozen object to the page
  with a fixed list of request operations — each a promise — and a fixed
  list of events. Requests are validated in the main process (operation
  name, argument types and sizes) before they reach the adapter or the
  disk. The bridge carries no general file or process access.
- **Platform selection.** At start-up the page's platform layer looks for
  the bridge: present, it selects the Steam implementations of storage, the
  replay store, leaderboards and achievements; absent, it selects the
  browser implementations and the local stand-ins. It publishes capability
  flags (desktop host, Steam present, achievements, leaderboards, shared
  files, cloud)
  that callers read instead of testing for the platform.
- **Steam start-up.** The packaged build asks Steam to relaunch it through
  the Steam client when started outside it; a development run uses a local
  app id file. When Steam still cannot initialise — client not running in a
  development run, an init failure — the host selects the unavailable
  adapter and the game plays fully with local saves.
- **Overlay.** The window is configured so the Steam overlay draws over the
  game. When the overlay opens, the host sends the page a focus-loss signal
  through the same path a window blur takes, so the shell's existing
  automatic pause applies unchanged.
- **Packaging and SteamPipe.** A packaging step produces an unpacked
  Windows x64 build containing Electron, the game files, the binding's
  native module and the Steam API library; a SteamPipe build script uploads
  it to the app's Windows depot and sets it live on a private branch.

## Data and state

- **Window state** — position and fullscreen, the size following the
  content; a small file in the user data directory, outside the save
  directory, so it stays per machine. Windowed when nothing is stored.
- **Crash log** — a rotating local text file in the user data directory,
  outside the save directory.
- **Steam state** — whether the adapter is the Steam or the unavailable
  implementation, the player's id and name, and logged-on state. Held by the
  main process in memory and pushed to the page on change; the page keeps
  the latest copy.
- **Capability flags** — derived once at start-up from platform selection
  and the adapter, then updated with logged-on state.
- No game data lives here; saves belong to `steam-cloud-saves`.

## Interfaces and contracts

- **Bridge requests** — a fixed list: Steam state; achievements (set,
  store, read); leaderboards (find, upload, download, attach); shared files
  (write and share, download); storage and blob-store file operations for
  `steam-cloud-saves`; the quit hand-shake; quit, which runs the same
  sequence as closing the window; and the window actions — minimise,
  toggle fullscreen, and the content size the window takes. Every request
  resolves with a result or rejects with a typed error — `unavailable`,
  `offline`, `not-found`, `invalid`, `failed` — and never throws into the
  page.
- **Bridge events** — Steam state changed (logged on or off), overlay
  activated, flush requested before quit, fullscreen entered or left — so
  the title bar's button shows the right icon.
- **Capability flags** — read by `steam-cloud-saves`, `steam-leaderboards`,
  `leaderboard-screen`, `steam-achievements` and `leaderboards-menu-entry`
  to choose behaviour; no caller tests for Electron or the bridge directly.
- **Quit** — closing the window, or the page's quit request, asks the page
  to flush pending saves; the host waits for the answer, bounded by a short
  timeout, then shuts Steam down and exits, so Steam Cloud's exit sync sees
  the final files.
- **Offline** — the game starts and plays with Steam offline or absent.
  Calls that need the Steam network reject with `offline`; callers queue or
  degrade as their own documents say.
- **Web build** — no bridge, no Electron; the same page selects the browser
  implementations and plays everything except Steam.

## Dependencies

- `platform-storage` and `replay-library` — the platform layer's start-up
  selection, which this feature extends with the Steam choice.
- `game-shell` — the automatic pause the overlay signal reuses, and the
  page-side flush the quit hand-shake calls.
- `shared-screen-layout` — the title bar whose drag region and Minimise and
  Fullscreen / Windowed buttons drive the window, and the content size the
  page reports.
- Electron — the desktop wrapper the direction requires; its Chromium keeps
  WebGL identical across machines and hosts the overlay.
- A Steamworks Node binding, chosen by the spike — the only way the main
  process reaches Steam.
- The Steamworks SDK's Steam API library and SteamPipe tools — runtime
  library shipped with the build, and the upload tool.
- An Electron packaging tool — produces the unpacked Windows build.

## Open questions

- Which Steamworks binding the adapter's Steam implementation uses —
  steamworks.js extended with leaderboard and shared-file calls, or another
  binding. Decided by the spike; blocks the Steam implementation of the
  adapter and therefore every leaderboard task, but none of the page-side
  design. The spike records the chosen binding in this document, in place
  of this question.
- Whether the Steam overlay renders reliably over the frameless,
  transparent Electron window on the chosen binding, and which window and
  GPU settings it needs. Checked
  by the spike; blocks the achievement exit criterion's "shows in Steam's
  overlay".
