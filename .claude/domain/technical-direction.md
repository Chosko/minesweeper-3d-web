# Technical direction — Minesweeper 3D

A single-player desktop game built with web technology: the existing
browser game's stack — plain JavaScript ES modules and three.js, with no
bundler — is the confirmed foundation, packaged with Electron for Steam. All
game logic runs on the player's machine; the only online services are
Steam's. The same code also runs as a plain web page on GitHub Pages, which
serves as the testing preview until the Steam release.

## Stack

- **Language:** JavaScript (ES modules), loaded directly by the runtime with
  no bundler or transpiler for game code.
- **3D rendering:** three.js (vendored) for the 3D mode and the Surface mode.
  Surface renders its tiles to look and feel exactly like Classic 2D; only
  the navigation around the object differs.
- **2D rendering:** Canvas 2D for Classic 2D (square, hexagonal and triangle
  grids), independent of three.js.
- **Desktop wrapper:** Electron, for the Steam build — its bundled Chromium
  keeps WebGL behaviour identical across machines and supports the Steam
  overlay. Required by the Steam features.
- **Steam integration:** a Node binding to Steamworks inside Electron. Which
  binding is open (see below).
- **Tooling:** a package manifest exists only for desktop packaging and
  development tools; the game code itself needs no install step.

## Topology / architecture

One client application, modular, with no server.

- **Rules engine** — one engine for every mode, over a graph of cells and
  their neighbours. Square, hexagonal, triangle, 3D and Surface boards differ
  only in the graph they supply; reveal, flag, chord, win/loss, no-guess
  checks and 3BV are implemented once. Classic 2D logic reproduces
  Minesweeper Online exactly.
- **Board generation** — a seeded, deterministic generator plus a no-guess
  solver, shared by free play, campaign levels (shape plus difficulty
  profile) and the daily board.
- **Mode front-ends** — Classic 2D (Canvas 2D), 3D (three.js) and Surface
  (three.js), each a renderer and input layer over the shared engine.
- **Game shell** — menus, settings, results, records, replays and the demo's
  locks, shared by every mode.
- **Platform layer** — the one boundary to Steam and to storage, with a
  Steam implementation (Electron) and a local implementation (web build).

The demo is the same application with its locks switched on, not a separate
code base.

## Data and storage

- **Steam build:** progress, records, settings and replays are files in the
  game's user-data directory, synced by Steam Cloud.
- **Web build:** the same data lives in browser storage.
- Every saved file and every replay carries a format version; each release
  reads every earlier version.
- **Leaderboards:** Steam leaderboards in the Steam build, with each entry's
  replay attached through Steam; local-only leaderboards in the web build.

## Async / queueing

Board generation (no-guess boards, campaign-profile boards, daily boards)
runs in a Web Worker so the game never freezes while a large board is
generated. Generation is deterministic: the same seed and generator version
produce the same board on every machine, which the daily board depends on;
a generator change bumps its version. Nothing else runs outside the game
loop.

## Hosting and deployment

- **Steam:** builds of the full game and of the demo are uploaded through
  SteamPipe. Windows at launch; Mac and Linux builds only if they come close
  to free; Steam Deck Verified is a stretch goal.
- **Web preview:** GitHub Pages serves the game from `main` as static files
  until the Steam release. Everything except Steam works there: Steam calls
  are stubbed and leaderboards are local-only.

## Inter-component protocols

- The game page talks to Electron's main process through a narrow, fixed IPC
  surface for Steam features (achievements, leaderboards with replay
  attachments, cloud, overlay); the page never touches Steamworks directly.
- The web build implements the same surface with local stand-ins.
- The rules engine and the generation worker exchange plain messages
  (settings and seed in, board out).
- No network protocol of the game's own: there is no server.

## Cross-cutting concerns

- **Identity:** none of the game's own; the Steam account identifies the
  player.
- **Observability:** no telemetry; at most a local crash log.
- **Testing:** Node's built-in test runner for the DOM-free modules, and
  Playwright-driven checks for anything that needs WebGL or the DOM. Tests
  cover rules fidelity against Minesweeper Online, deterministic generation
  (same seed and version, same board), and no-guess solver correctness.
- **Offline:** the full game works offline; Steam achievements and
  leaderboard submissions sync when a connection returns.

## Explicitly open decisions

- **Steamworks binding** — steamworks.js lacks a leaderboard API: either
  extend it with leaderboard and attachment calls, or adopt another binding.
  Decided by a spike before the Steam features are architected.
- **Mac and Linux builds, Steam Deck** — pending how cheap each turns out to
  be.
- **Early Access** — open in [business-model.md](./business-model.md); it
  affects the release path, not the stack.
