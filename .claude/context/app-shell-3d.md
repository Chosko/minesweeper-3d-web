# App shell — the 3D game's wiring in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` leads the 3D game into play: the adapter's flow
`FLOW_3D`, entering play, the ready card and its pointer-lock fallback
(`js/shell/lock-fallback.js`, pure), lockless and drag-to-look play, the
scene panel and `sync3D`. The session, the board status card, Learn 3D's
wiring and the end sequence are
[app-shell-3d-session.md](app-shell-3d-session.md). The play inputs —
action dispatch, keyboard-only and touch play, the controller in play —
are [app-shell-3d-play.md](app-shell-3d-play.md); the camera — the Camera
setting's Fly and Orbit, the camera aids, spacing and render on demand —
is [app-shell-3d-camera.md](app-shell-3d-camera.md). The 3D
board choice, session and adapter (`js/shell/mode-3d.js`) themselves are
[mode3d.md](mode3d.md).

## PUBLIC API

`js/shell/lock-fallback.js`
- `createLockFallback`, `LOCK_MESSAGES`, `RELOCK_COOLDOWN_MS` — which
  message a pointer-lock refusal shows and when the page counts as blocked.

`js/main.js` exports nothing; the 3D surface of `__ms` is listed in
[app-shell.md](app-shell.md) § PUBLIC API.

## INTERNAL PATTERNS

- **Adapter flow.** `FLOW_3D` is handed to `create3DMode`: board choice
  routes to `board-choice` (filled from `LAST_CHOICE_3D`; Learn 3D, the
  four cube presets, Custom and Insert Board Code, a First box size played
  as a custom board — [mode3d.md](mode3d.md)); `start` is
  `startGame` ([app-shell-3d-session.md](app-shell-3d-session.md));
  `pause` shows the pause card; `resume` is `resumeGame`;
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
  for the message (`NO_MOUSE_MSG` without a mouse), which the card shows
  in its warn note `#ready-msg`. A refusal within
  `RELOCK_COOLDOWN_MS` of a release is not counted; the first counted one says the mouse
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
- **Scene panel.** `syncScenePanel` (every router change, window resize,
  the Daily body's scroll, and a `ResizeObserver` on the panel's stage)
  hands `renderer.setTarget` the rectangle of the shown screen's live
  scene panel (`.ui-scene-panel--live`: the Daily screen's cube) or, on the replay viewer, a 3D replay's board area
  (`#replay.replay--scene #replay-stage`; the viewer opening or a 2D
  replay has none), and null — the full window — everywhere else
  ([rendering.md](rendering.md) § Internal patterns, *Target rectangle*). The
  canvas is clipped to the panel's rounded corners; a panel inside a
  frame's body draws in front of the frame (`body.scene-front`), clipped
  to the part the body shows. Over a replay's board area the layer
  `#replay-scene-over` (`REPLAY_OVER`) takes the same rectangle and shows
  while it does: the free-camera notice and the press rings sit on it,
  above the canvas.
  `body.scene-off` hides the canvas where no scene shows: the main menu
  (its 3D tile a still), the board choices, the Daily screen with no 3D
  panel in view. The menu screens behind them hold the demo board
  (`showMenuBackdrop`), orbiting.
- **`sync3D`** (every router change) resumes the session on `playing` and
  pauses it elsewhere, so board input runs only in play; it refreshes the
  status card.
- **Ready card.** The HUD is hidden behind it
  ([app-shell-ui.md](app-shell-ui.md) § Behind a card). `showReady` gets
  `rules` (the "How 3D works" block, Ctrl named as plain text) and
  `learn` (the `#ready-learn` line "New to 3D? Learn 3D walks you through a
  small box." on the success fill, with `#ready-learn-btn` → `startLearn`,
  outside the Click to play button) while `FIRST_USE.rules3D`; neither on
  the guided board's own card, and the line only before the game started.
  The card's width follows the window's size step (J-Ready-xl, -l, -m,
  -p), its board line in the mono face; its buttons carry the canvas's
  icons (Back the arrow, Click to play the mouse — `ui.setTouch3D` swaps
  in the hand for Tap to play —, Learn 3D the cube, drag-to-look the
  hand), and the blocked offer's controller line names A as text. On a
  phone held sideways (J-Ready-ls) there is no Back and no "How 3D works":
  the title `#ready-heading`, the board line, the play button and the
  Learn line sit in the left column, the controls list alone in the
  right.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  presets, the ready card, pointer lock and its fallback.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the results over the scene and the look.
- ORIGINAL_SPEC "Controls" — the start pose and the return to it.

## CROSS-REFERENCES

- [app-shell-3d-session.md](app-shell-3d-session.md) — the session,
  board status card, Learn 3D and end sequence.
- [mode3d.md](mode3d.md), [engine-3d.md](engine-3d.md) (the 3D state view),
  [generation.md](generation.md) (`GEN_3D`).
- [app-shell-3d-play.md](app-shell-3d-play.md) — the play inputs;
  [app-shell-3d-camera.md](app-shell-3d-camera.md) — camera and render on demand.
- [rendering.md](rendering.md) — `setTarget`, `setGame`, `sync`.
- [input.md](input.md) — `Input`'s lock callbacks and `isDragLook`.
- [testing.md](testing.md) — `tests/mode3d-*.test.mjs` (wiring), the
  pointer-lock fallback tests.

## WHEN TO READ THE SOURCE

- Changing how the session's timer follows the screens (`sync3D`).
- Changing the ready card, the lock refusal messages or lockless entry:
  `showReady`, `LOCK_FALLBACK`, `enterPlay3D`, `enterDragLook`.
- Changing where the scene draws on a screen with a scene panel:
  `syncScenePanel`, `sceneOff`.
