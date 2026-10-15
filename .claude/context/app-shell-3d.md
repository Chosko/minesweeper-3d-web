# App shell — the 3D game's wiring in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` runs the 3D game's flow: the adapter's flow
`FLOW_3D`, entering play, the ready card and its pointer-lock fallback
(`js/shell/lock-fallback.js`, pure), lockless and drag-to-look play, the
board status card, the session, Learn 3D's wiring and the end sequence. The
play inputs and the camera — action dispatch, keyboard-only and touch play,
the controller in play, the Camera setting's Fly and Orbit, the camera
aids, spacing and render on demand — are
[app-shell-3d-play.md](app-shell-3d-play.md). The 3D board choice, session
and adapter (`js/shell/mode-3d.js`) themselves are [mode3d.md](mode3d.md).

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
  ([replay-samplers.md](replay-samplers.md)) over camera, controls and `S.spacing`.
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
  A sets `padGesture`, routing resume/restart to lockless play. A
  coarse-only device never asks for the lock
  ([app-shell-3d-play.md](app-shell-3d-play.md) § touch play).
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
  give a fixed board; Learn 3D's `learnChoice()` a fixed board with its
  forced start), subscribes to its events (`mark` → `renderer.setMark`) and
  returns it. `S.play` is the session, `S.game` its 3D state view, which
  every board reader uses; `S.started` is set at the session's `started`.
  `board3dChoice`, the board a restart plays again, keeps the guided board's
  mine positions and `learn`.
- **Ready card.** `showReady` gets `rules` (the "How 3D works" block) and
  `learn` (the `#ready-learn` line "New to 3D? Learn 3D walks you through a
  small box." with `#ready-learn-btn` → `startLearn`, outside the card's own
  button) while `FIRST_USE.rules3D`; neither on the guided board's own card,
  and the line only before the game started.
- **Learn 3D.** `startLearn()` (the board choice's `onLearn`, the ready
  card's line, `__ms.learn()`) starts `learnChoice()` (`js/mode3d/learn.js`)
  and saves nothing. `S.learn` holds the guided game's prompt sequence
  (`createLearnPrompts`), null otherwise; `ui.setTimed(false)` hides the
  timer. `refreshHints` shows its prompt in the hint strip in play
  (`LEARN_HINTS`, no close button); `learnAction` feeds flags and chords
  from `onAction`, and after every action while the game is on L's closed,
  unflagged neighbour count (`closedAround`), which skips the chord prompt
  at 0; `learnViews` the Shift and Ctrl the frame loop reads (Ctrl also
  `FIRST_USE.once('autoHideToast')`), and `learnChanged` redraws the
  strip and puts the start-cell tint (`renderer.setMark`) on the prompt's
  cell. `noteAutoHide`, `aimHint` and the 3D first-use strip stay quiet.
  `learnGame()` gives the first-use state its `{learn, won}` and keeps the
  game out of `LAST_MODE` and the menu's last-mode mark.
- **End sequence.** The session's `finished` runs `endGame`, which freezes
  `S.endState = {state, time, minesLeft, clicks}` (`minesLeft` from before
  the final action, as the original froze; `clicks` from `clicks3D()`) and
  plays the win sound; HUD, pause card and timer read it once set (until
  then `S.time` is `S.play.elapsedMs()`). During the end delay nothing else
  acts: `Input.isActive`, `canAct` and `canLook` are false, the frame loop moves no camera and
  changes no view mode, `handlePad` only releases held controls. After it
  the adapter releases lock and reports finished
  ([app-shell-pause.md](app-shell-pause.md) § End delay). A null summary
  ends the guided board on the `learn-end` screen (`#learn-end`, Play First
  box 1 → `playFirstBox`, an ordinary pick saved as the last choice, or Try
  again → `PAUSE.restart`; Back to board choice) and the debug hook's fixed
  board on the pause card.
## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  presets, generating state, timer start, the 3D mode's reports.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 3D end sequence, the results over the scene and the look.
- ORIGINAL_SPEC "Controls" — the start pose and the return to it.

## CROSS-REFERENCES

- [mode3d.md](mode3d.md), [engine-3d.md](engine-3d.md) (the 3D state view),
  [generation.md](generation.md) (`GEN_3D`).
- [app-shell-3d-play.md](app-shell-3d-play.md) — the play inputs, camera
  and render on demand.
- [rendering.md](rendering.md) — `setGame`, `setMark`, `sync`.
- [input.md](input.md) — `Input`'s lock callbacks and `isDragLook`.
- [audio.md](audio.md) — the win sound.
- [testing.md](testing.md) — `tests/mode3d-*.test.mjs` (wiring, end
  sequence, the results over the scene and the look), the pointer-lock fallback tests.

## WHEN TO READ THE SOURCE

- Changing the 3D end-of-game flow or the frozen HUD (`endGame`,
  `S.endState`, the `MODES.on('finished')` Learn 3D end card and fixed
  board's pause card),
  the board status card (`showStatus3D`, `retry3D`) or how the session's
  timer follows the screens (`sync3D`).
- Changing the ready card, the lock refusal messages or lockless entry:
  `showReady`, `LOCK_FALLBACK`, `enterPlay3D`, `enterDragLook`.
