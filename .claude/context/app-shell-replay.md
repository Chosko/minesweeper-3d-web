# App shell — replay viewer route, replay files, 3D replay scene

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the replay viewer's wiring in `js/main.js`: the `replay` route and
its entry points, replay file download and import, the controller on the
viewer, the frame-loop tick, and the 3D replay scene with its recorded and
free cameras. The viewer itself is [replay-viewer-screen.md](replay-viewer-screen.md)
and its board viewers [replay-viewers.md](replay-viewers.md); the results
screen that opens it is [app-shell-results.md](app-shell-results.md).

## PUBLIC API

`js/main.js` exports nothing; `__ms.replayViewer` and `__ms.watch(data)`
are listed in [app-shell.md](app-shell.md) § PUBLIC API.

## INTERNAL PATTERNS

- **Replay viewer route.** `REPLAY_VIEWER` (`createReplayViewer` over
  `REPLAYS` and `SHELL`, `sound: sfx`, `files: REPLAY_FILES`, view bound to
  `#replay`, viewers `{square: mountReplay2D, box: mountReplay3D}` — box
  only with WebGL 2, else a 3D replay says why it cannot play) is the
  router's `replay` screen. It is opened by Watch replay (with the replay),
  the results screen's Watch best (`RESULTS.watchBest()`, a replay id), the
  Records screen's Watch best and library Watch (`RECORDS_PAGE.watch`,
  [records-screen.md](records-screen.md)) and Open replay file, each
  returning to the screen it came from; its Back buttons go through
  `shellBack`. It is a shell screen, not a mode: it reaches no mode and
  records nothing; its sound toggle plays the game's cues through the
  master volume. `ui.showReplay` hides the game's HUD, help, hint strip and
  toast. `LAYER_SCREEN` maps `#replay` to `replay`, one of the overlays that
  contain focus ([app-shell-focus.md](app-shell-focus.md)). The
  board scale setting reaches the viewer's 2D board (`setScale`), and
  `mountReplay2D` mounts at it.
- **Replay files.** `REPLAY_FILES` = `{save: saveReplayFile, pick:
  pickReplayFile}`: Download saves a replay's bytes as a `.msrp` file
  through a temporary link; Open replay file picks one from the hidden
  `#replay-file` input (null when the player picks none). The viewer's
  `#rp-open` opens the picked file in place (`openFile`), the Records
  screen's Open replay file through `RECORDS_PAGE.openReplayFile`. The code
  chip's Copy and Copy link go through `copyCode`.
- **Frame loop.** While `replay` shows the loop calls `REPLAY_VIEWER.tick`;
  before it, on a 3D replay whose time moved (`replay3d.time`: a seek, step,
  Home/End) it calls `renderer.sync({seek: true})`, which drops every
  running cell motion and starts none for the jump
  ([rendering-effects.md](rendering-effects.md)).
- **Controller.** On `replay` the controller goes to `padReplay`:
  `REPLAY_PAD` buttons to the viewer, the rest navigates the screen as a
  menu; with the free camera on, the left stick flies (it does not
  navigate) and the right stick looks.
- **3D replay scene.** `mountReplay3D` mounts `createViewer3D` on
  `REPLAY_SCENE`, which hands the renderer the replay's 3D state view at
  `REPLAY_SPACING` (`SPACING_START`) with its own `FlyCamera` (`replayCam`),
  at the box's spawn pose until the first sample; each frame applies the
  camera and the recorded view mode and glows the aimed cell
  (`updateReplayPick`). The scene draws in the viewer's board area: `show`
  syncs the scene panel, which takes `#replay-stage` once the viewer marks
  the replay `replay--scene` ([app-shell-3d.md](app-shell-3d.md) § Scene
  panel), and `hide` syncs it again. `ring(cell, kind)` projects a press
  ring through the replay camera and scales it to the board area
  (`ui.replayRing`, on the layer over the scene); `tint(tints)` hands Show
  3BV's tints to `renderer.setRegionTint` (`bbbvTint`, painted as
  [replay-viewers.md](replay-viewers.md) § Show 3BV says), again on a theme
  change. `hide()` gives the renderer
  back what it drew before. With the context already lost it routes to
  `ctxlost` and mounts nothing. `show` keeps the finished game's
  `renderer.wrongFlags()`, which `hide` gives back after `setGame`, so the
  loss's crossed flags survive the viewer.
- **Free camera.** `detach(true)` (the viewer's Free) sets `replay3d.free`:
  a click on `#replay-board` asks for pointer lock (never on a coarse-only
  device), mouse look turns `replayView()` — `replayOrbit` (an
  `OrbitCamera` over `replayCam`, entered on detach) under the Camera
  setting's Orbit, else `replayCam` — and `flyReplay` flies it each frame
  with the movement keys and the left stick (Orbit: W / S and the stick
  dolly). Follow and `hide()` exit the lock.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — the viewer screen, its entry points, Back, a lost context, the free
  camera, replay files.

## CROSS-REFERENCES

- [replay-viewer-screen.md](replay-viewer-screen.md) — `createReplayViewer`,
  `createReplayView`, `REPLAY_PAD`; [replay-viewers.md](replay-viewers.md)
  — `createViewer3D`'s scene contract, `mountViewer2D`.
- [replay-library.md](replay-library.md) — `REPLAYS`.
- [rendering.md](rendering.md), [rendering-effects.md](rendering-effects.md)
  — `setRegionTint`, `cellScreen`, `wrongFlags`, the seek sync.
- [input-camera.md](input-camera.md) — `FlyCamera`, `OrbitCamera`,
  `spawnPose`; [app-shell-3d-play.md](app-shell-3d-play.md) — the Camera
  setting's mode the free camera follows.
- [testing.md](testing.md) — `tests/replay-viewer.test.mjs`,
  `tests/replay-viewer-3d.test.mjs`, `tests/results-watch.test.mjs`,
  `tests/records-replays.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the replay viewer's wiring — route, viewers, 3D replay scene,
  free camera, controller mapping, files: the `// ---------- 3D replay ----------`,
  `// ---------- replay files ----------` and
  `// ---------- replay viewer ----------` blocks of `js/main.js`,
  `padReplay` and the frame loop.
