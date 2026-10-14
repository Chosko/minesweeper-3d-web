# App shell — results flow and screen, replay viewer route, 3D replay scene

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/results/` — the results screen (`results`), DOM-free apart from
the view's binder: `flow.js` (records the game on the `finished` and
`abandoned` hand-offs, routes a finished one to `results`, hands the replay
to the library) and `view.js` (the screen's content, its formats — documented
in its head comment — and the binder that fills `#results`) — plus the
replay viewer's route and the 3D replay scene in `js/main.js`. The viewer
itself is [replay-playback.md](replay-playback.md); the screen's markup is
[app-shell-kit.md](app-shell-kit.md) § Screens.

## PUBLIC API

`js/results/flow.js`
- `RESULTS_SCREEN` = `'results'`.
- `createResultsFlow({records, replays?, router, restart(source, current),
  goMenu})` → `attach(pauser)` → detach, `finished(summary, mode, replay?)`
  → the routed data `{summary, mode, comparison, saved, notSaved, watch,
  rank, streak, standing}` or null, `abandoned(summary, mode, replay?)`,
  `current`, `playAgain(source)`, `openRecords()`, `watch()`, `toMenu()`.
  Without `replays` no replay is kept. `watch` is set when the game handed
  over a sealed replay and the router has the `replay` route.

`js/results/view.js`
- `formatTime(ms)` (thousandths, truncated: `"47.380 s"`),
  `formatTimeDifference`, `formatRate` / `formatRateDifference`,
  `formatEfficiency` / `formatEfficiencyDifference`, `formatClicks`,
  `formatWinRate` (re-exported by the Records screen); `EQUAL_BEST`, `DASH`,
  `NOTES`, `NOT_ELIGIBLE`, `FIRST_BEST`.
- `resultsContent({summary, comparison?, saved?, notSaved?, watch?, rank?,
  streak?, standing?})` → `{outcome, title, board, banner, stats, figures,
  next, standing, eligible, bestsNote, bests, notes, watch, look, over3d}`
  (fields in the head comment; `look` and `over3d` true for a 3D summary).
- `createResultsView({root, onPlayAgain, onWatch?, onRecords, onMenu, onLook?})` →
  `show(content)`, `hide()`, `noteLook(text)`; `LOOK_REFUSED`.
- `RESULTS_ACTIONS` (`r-again`, `r-watch`, `r-look`, `r-records`, `r-menu`);
  `resultsEnter({focused, repeat})` → `'playAgain'` (focus on Play again or
  on no action), null (another action's own activation), `'ignore'`
  (auto-repeat).

## INTERNAL PATTERNS

- **Record before show.** `RESULTS.finished` reads the board's counters
  (streak before), records with `RECORDS.record` — so the comparison is
  against the bests that stood before this game — then reads counters,
  history, `winRate` and `completedWinRate` (streak after, rank, `standing`;
  null when recording failed or a query threw) and routes to `results`, for
  either mode. A summary that is not a record (a fixed 3D board's null) is
  ignored. A throwing recording still routes, with no comparison and
  `saved` false; `notSaved` marks the first results screen of a session
  whose records store is unavailable.
- **Over the board.** The screen shows over the finished Classic 2D board;
  over a 3D game on a dimmed translucent scrim (`#results.results--over3d`)
  with the 3D scene drawn behind it on demand only (`shouldRender`) while
  `lookable()`, else the ordinary blurred surface; a
  finished 3D game is never returned to.
- **Look at the board** (the `look` screen, `#look` its hint line). A 3D
  card's *Look at the board* (`openLook`) and Back on it (`resultsBack`;
  the browser's Back still goes to the menu) are offered while `lookable()`
  — the 3D mode still holds the finished board, so not after Records. A
  controller opens it lockless; a click or key asks for pointer lock
  (`lookPending`) and `onLockChange` opens it once granted, `onLockError`
  leaves the card with `LOOK_REFUSED` and focus on Look at the board (`refusedLook`), so Enter retries. In the look `Input.isActive` is
  true (mouse look, flight and view-mode keys, wheel), the frame loop
  flies the camera, `padLook` flies with the sticks, `onAction` and
  `pauseGame` refuse. `LOOK_END` (a second `createEndSkip`, fed by the same
  capturing listeners as `END_SKIP`, keys only Esc in the look and every key outside it) ends it on Esc,
  any mouse button, any controller button or the lock's release
  (`endLook` → back to `results`, focus on Play again), consuming the
  press whole; an Esc within 500 ms of the lock's release does not reopen
  it.
- **Actions.** Play again (also `Enter`, `R`) → `RESULTS.playAgain` →
  `PAUSE.restart`, or, once the mode was left, `MODES.start('classic-2d',
  LAST_CHOICE_2D.current)` or `MODES.start('3d', board3dChoice)` through
  `enterPlay3D`. Records → `openRecords` routes to `records` with this
  board's `boardKey`; Back returns to `results`. Watch replay →
  `RESULTS.watch()` routes to `replay` with `{replay, returnTo: {screen:
  'results'}}` — the game's own sealed replay, so it plays whether or not
  the library saved it. Main menu and Back → `showMainMenu`. Returning to
  `results` without data shows `RESULTS.current` again.
- **Abandoned** games are recorded (a no-op when the store already did) and
  show nothing.
- **Library hand-off.** After either records, the sealed replay is added to
  `REPLAYS` once it has loaded, pinned as a best when the comparison shows a
  new best on any of the three stats ([replay-library.md](replay-library.md)); a throwing or
  rejecting library is logged and changes nothing else.
- **Replay viewer route.** `REPLAY_VIEWER` (`createReplayViewer` over
  `REPLAYS` and `SHELL`, view bound to `#replay`, viewers `{square:
  mountViewer2D, box: mountReplay3D}`) is the router's `replay` screen. It
  is opened by Watch replay (with the replay) and by the Records screen's
  Watch (with a replay id, `RECORDS_PAGE.watch`, [records-screen.md](records-screen.md)),
  each returning to the screen it came from; its Back buttons go through
  `shellBack`. It is a shell screen, not a mode: it reaches no mode, records
  nothing, plays no sound; `ui.showReplay` hides the game's HUD, help,
  hint strip and toast. `LAYER_SCREEN` maps `#replay` to `replay`.
- **Frame loop.** While `replay` shows the loop calls `REPLAY_VIEWER.tick`;
  before it, on a 3D replay whose time moved (`replay3d.time`: a seek, step,
  Home/End) it calls `renderer.sync({seek: true})` so no "solved" pulse
  starts for the jump ([rendering-effects.md](rendering-effects.md)). On `replay` the
  controller goes to `padReplay`: `REPLAY_PAD` buttons to the viewer, the
  rest navigates the screen as a menu.
- **3D replay scene.** `mountReplay3D` mounts `createViewer3D` on
  `REPLAY_SCENE`, which hands the renderer the replay's 3D state view at
  `REPLAY_SPACING` (`SPACING_START`) with its own `FlyCamera` (`replayCam`),
  at the box's spawn pose until the first sample; each frame applies the
  recorded camera and view mode and glows the recorded aimed cell
  (`updateReplayPick`). Player input never moves it; `hide()` gives the
  renderer back what it drew before. With the context already lost it
  routes to `ctxlost` and mounts nothing. `show` keeps the finished game's
  `renderer.wrongFlags()`, which `hide` gives back after `setGame`, so the
  loss's crossed flags survive the viewer.

## DOMAIN DEPENDENCIES

- [../domain/features/results-screen.md](../domain/features/results-screen.md)
  — record before show, content, time format, actions, failure note.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the results over the 3D scene, Look at the board, Records opened on a mode.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — where the Records screen is opened from, Back and focus.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the end-of-game hand-off, best pinning, the session-only replay.
- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — the viewer screen, its entry points, Back, a lost context.

## CROSS-REFERENCES

- [records.md](records.md) — board label and key;
  [records-store.md](records-store.md) — `record`, comparison;
  [records-screen.md](records-screen.md) — the Records screen and `REPLAY_SCREEN`.
- [replay-library.md](replay-library.md) — library;
  [replay-playback.md](replay-playback.md) — viewer, 2D and 3D viewers.
- [app-shell-pause.md](app-shell-pause.md) — the hand-offs the flow attaches
  to.
- [testing.md](testing.md) — `tests/results.test.mjs`,
  `tests/results-watch.test.mjs`, `tests/replay-handoff.test.mjs`,
  `tests/replay-viewer.test.mjs`, `tests/replay-viewer-3d.test.mjs`,
  `tests/records-screen*.test.mjs`, `tests/records-replays.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing what the results screen shows, its formats or actions: the head
  comments of `js/results/view.js` and `js/results/flow.js`, and the
  `results` wiring in `js/main.js`.
- Changing the replay viewer's wiring — route, viewers, 3D replay scene,
  controller mapping: the `// ---------- 3D replay ----------` and
  `// ---------- replay viewer ----------` blocks of `js/main.js`,
  `padReplay` and the frame loop.
