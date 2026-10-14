# App shell — the 3D game's wiring in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` wires the 3D game to the screens, renderer, camera
and pointer lock: the adapter's flow `FLOW_3D`, the ready card and its
pointer-lock fallback (`js/shell/lock-fallback.js`, pure), the board status
card, action dispatch, the end sequence, the camera aids and the frame
loop's render-on-demand. The 3D board choice, session and adapter
(`js/shell/mode-3d.js`) themselves are [mode3d.md](mode3d.md).

## PUBLIC API

`js/shell/lock-fallback.js`
- `createLockFallback`, `LOCK_MESSAGES`, `RELOCK_COOLDOWN_MS` — which
  message a pointer-lock refusal shows and when the page counts as blocked.

`js/main.js` exports nothing; the 3D surface of `__ms` is listed in
[app-shell.md](app-shell.md) § PUBLIC API.

## INTERNAL PATTERNS

- **Adapter flow.** `FLOW_3D` is handed to `create3DMode`: board choice
  routes to `board-choice` (filled from `LAST_CHOICE_3D`); `start` is
  `startGame`; `pause` shows the pause card; `resume` is `resumeGame`;
  `restart` starts a session of the same board (no-guess off once the
  player took the failed board's standard offer) and enters play through
  `enterPlay3D`; `leave` is `leaveGame` (leaves the session, releases lock
  and lockless play, hides `#m3d-status`); `release` exits pointer lock
  before the results screen shows; `sampler` builds `createSampler3D`
  ([replay.md](replay.md)) over camera, controls and `S.spacing`.
  `js/main.js` reads `mode3d.ending` (via `endDelay()`) and calls only
  `contextLost()`, `finishNow()`, `cancelGeneration()` and `mode3d.tick()`
  (every frame while the 3D mode is active, driving the sampler).
- **Entering play.** `startGame` → `ready`; pointer lock acquired
  (`onLockChange`), `padResume` or the ready card's drag-to-look
  (`enterDragLook`) → `enterPlaying` → `playing`. `enterPlay3D` (restart,
  Play again): a controller or drag-to-look play enters lockless play;
  otherwise the click or key that asked is the lock gesture — the ready
  card waits unseen (`ui.setReadyPending(true)`, `#ready.ready--pending`),
  a granted lock enters play with no card shown, and a refusal's
  `onLockError` shows it with its message. A UI click made with controller
  A sets `padGesture`, routing resume/restart to lockless play.
- **Coarse-only devices.** Every lock request goes through
  `requestLock3D()`, which makes none while `COARSE_ONLY` (coarse and no
  fine pointer): the ready card, resume, restart and Play again
  (`enterPlay3D`, which then leaves the card shown), the failed board's
  Retry and standard offer, fullscreen and Look at the board (lockless
  there, as a controller's). `ui.setNotice3D(COARSE_ONLY)` swaps
  `#ready-btn` for `#ready-notice` (3D needs a mouse and keyboard, or a
  controller); Back and the controller's A and Start still work.
- **Pointer lock.** In locked play the browser consumes Esc to release the
  lock; `onLockChange` calls `backGame('key')` instead — during the end
  delay the release ends it (`END_SKIP.lockLost()`), a lock lost with the
  window's focus pauses, and a release right after a cancelled generation
  goes to the click-to-play card. A failed board releases lock for its
  offer without pausing.
- **Refusals.** `onLockError` on the ready or pause card asks `LOCK_FALLBACK`
  for the message (`NO_MOUSE_MSG` without a mouse). A refusal within
  1500 ms of a release is not counted; the first counted one says the mouse
  could not be captured; from the second the page is blocked for its
  session (an acquired lock resets only the count). While blocked every
  ready card shows the explanation and `#ready-blocked` (`#ready-drag` and
  the controller's A).
- **Lockless and drag-to-look.** `S.lockless` (controller, drag-to-look,
  `forcePlay`) mirrors `body.lockless`: losing lock does not pause and Esc
  goes to `backGame` directly. `S.dragLook` (set by `enterDragLook`, cleared
  by `leaveGame`) is the input's `isDragLook` ([input.md](input.md)) and
  `body.drag-look`; while set, resume, restart and Play again stay in
  drag-to-look play.
- **Board status card.** `board3d` holds `{generating, failure, progress}`
  from the session's events and, each frame the card shows, its progress
  (`progress3D` redraws without moving focus). `showStatus3D` shows
  `#m3d-status` while `playing`, and a failure's offer while `paused` too;
  a failure exits lock and focuses the offer (`statusFocus`,
  [app-shell-2d.md](app-shell-2d.md)); the generating card focuses
  Cancel unless the focus is already on one of its buttons. `retry3D`
  answers the offer and re-enters play, from the pause card too;
  `standardFromWait3D` is the generating card's Play a standard board (the
  session's `playStandard()`); Main menu is `PAUSE.toMenu()`. While the card
  shows, the controller goes to `padStatus3D`.
- **`sync3D`** (every router change) resumes the session on `playing` and
  pauses it elsewhere, so board input runs only in play; it refreshes the
  status card.
- **Session.** `startGame(settings, pregenerated?)` leaves the previous
  session, opens one (`createSession` over `GEN_3D`; `__ms` mine positions
  give a fixed board), subscribes to its events (`mark` →
  `renderer.setMark`) and returns it. `S.play` is the session, `S.game` its
  3D state view, which every board reader uses; `S.started` is set at the
  session's `started`.
- **Actions.** `onAction(type)` is the only dispatcher (`MouseActions`'
  callback): `left` → `S.play.reveal`, `right` → `toggleFlag`, `chord` →
  `chord`. `renderer.snapshotBeforeAction()` precedes left/chord;
  `actionSounds` plays SFX from the result (awaiting a no-guess board's
  first reveal; null does nothing; `sfx.noop` when `version` is unchanged);
  a flag sound carries the changed-cell count and a flag click on a number
  hands `r.changed` to `renderer.flash`.
- **End sequence.** The session's `finished` runs `endGame`, which freezes
  `S.endState = {state, time, minesLeft, clicks}` (`minesLeft` from before
  the final action, as the original froze; `clicks` from `clicks3D()`) and
  plays the win sound; HUD, pause card and timer read it once set (until
  then `S.time` is `S.play.elapsedMs()`). During the end delay nothing else
  acts: `Input.isActive` is false, the frame loop moves no camera and
  changes no view mode, `handlePad` only releases held controls. After it
  the adapter releases lock and reports finished
  ([app-shell-pause.md](app-shell-pause.md) § End delay). A fixed board's
  null summary ends the game on the pause card instead.
- **Camera aids.** `placeAtSpawn()` puts the camera at `spawnPose`
  ([input.md](input.md)): every `startGame`, `retry3D`, and the return to
  start (`Home` / `R` while `Input.isActive`, the pause card's "Back to
  start" `onBackToStart`, which then resumes). In play `updateArrow` hands
  `ui.setArrow` the off-screen arrow's angle; `updatePick` keeps
  `S.readout` (`aimReadout`, `js/readability.js`) and `updateReadout` shows
  it only under the `aimReadout` setting in 3D play. Picking is cached by
  `S.pickKey`. Spacing resets to `SPACING_START` per game; the menu demo
  (`makeDemo`, 7³/30, decorative) uses 1.25 and an orbiting camera.
- **Spacing.** Every change in play goes through `setSpacing(s)`: clamped
  to [1, 10], the camera rescaled about the board centre by new / old
  (`FlyCamera.rescale`, yaw and pitch kept), `ui.setSpacing` for the tools
  strip's readout. The wheel (`wheelSpacing`, its run held in `wheelRun`)
  and the debug hook's `wheel` step through `spacingStep` timed by
  `performance.now()`; the D-pad's presses and repeats take one untimed
  step each; `X` while `Input.isActive` sets `spacingToggle`
  ([input.md](input.md)).
- **Render on demand.** While `results` shows a 3D game `shouldRender`
  draws only on `needRender`, a sync or a running effect; otherwise it draws when `needRender` is set or
  `renderer.sync()` reported changes, on every frame of a menu screen (the
  orbiting demo, except under the `?still-backdrop` hook,
  [app-shell.md](app-shell.md) § PUBLIC API), `endState` changed,
  `renderer.isAnimating()`, or the signature (camera, spacing, toggles,
  selection, `game.version`, aspect, field of view, mode) changed; the field
  of view applier also sets `needRender`. Set `needRender = true`
  after any change the signature does not capture.
- `applyPixelRatio(n)` follows the render resolution setting
  (`pixelRatioFor`, [settings.md](settings.md)) for the board's cell count.
  `F` (3D only) sets the fullscreen setting, whose applier also requests
  Keyboard Lock.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  presets, generating state, timer start, the 3D mode's reports.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 3D end sequence, the results over the scene and the look.
- ORIGINAL_SPEC "Controls" — the start pose and the return to it.

## CROSS-REFERENCES

- [mode3d.md](mode3d.md), [engine-3d.md](engine-3d.md) (the 3D state view),
  [generation.md](generation.md) (`GEN_3D`).
- [rendering.md](rendering.md) — `setGame`, `setToggles`, `setSpacing`,
  `setSelected`, `sync`, `render`, `snapshotBeforeAction`, `isAnimating`.
- [input.md](input.md) — `Input` callbacks, picking, spawn pose.
- [audio.md](audio.md) — the `sfx` calls.
- [testing.md](testing.md) — `tests/mode3d-*.test.mjs` (wiring, end
  sequence, the results over the scene and the look), the pointer-lock fallback tests.

## WHEN TO READ THE SOURCE

- Changing the 3D end-of-game flow or the frozen HUD (`endGame`,
  `S.endState`, the `MODES.on('finished')` pause card for a fixed board),
  the board status card (`showStatus3D`, `retry3D`) or how the session's
  timer follows the screens (`sync3D`).
- Debugging frames that do not redraw, or never stop: `shouldRender`.
- Changing controller mapping in play: `padPlaying`, `padStatus3D`.
