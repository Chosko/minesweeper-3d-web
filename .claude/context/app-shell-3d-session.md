# App shell — the 3D game's session, Learn 3D and end sequence

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` runs a 3D game once started: the session it opens,
the board status card, Learn 3D's wiring and its end card's Play Cube
Intro, and the end sequence. The flow that leads into play — `FLOW_3D`,
entering play, the ready card, pointer lock and its fallback, the scene
panel — is [app-shell-3d.md](app-shell-3d.md); the play inputs and camera
are [app-shell-3d-play.md](app-shell-3d-play.md). The 3D session itself
(`create3DGame`, the board request) is
[mode3d-session.md](mode3d-session.md).

## PUBLIC API

`js/main.js` exports nothing; the 3D surface of `__ms` (`learn()`, fixed
mine positions) is listed in [app-shell.md](app-shell.md) § PUBLIC API.

## INTERNAL PATTERNS

- **Session.** `startGame(settings, pregenerated?)` leaves the previous
  session, opens one (`createSession` over `GEN_3D`; `__ms` mine positions
  give a fixed board; Learn 3D's `learnChoice()` a fixed board with its
  forced start), subscribes to its events (`mark` → `renderer.setMark`) and
  returns it. `S.play` is the session, `S.game` its 3D state view, which
  every board reader uses; `S.started` is set at the session's `started`.
  `board3dChoice`, the board a restart plays again, keeps the guided board's
  mine positions and `learn`.
- **Board status card.** `board3d` holds `{generating, failure, progress}`
  from the session's events and, each frame the card shows, its progress
  (`progress3D` redraws without moving focus). `showStatus3D` shows
  `#m3d-status` — on a scrim over the scene, the HUD hidden
  ([app-shell-ui.md](app-shell-ui.md) § Behind a card) — while `playing`,
  and a failure's offer while `paused` too;
  a failure exits lock and focuses the offer (`statusFocus`,
  [app-shell-2d.md](app-shell-2d.md)); the generating card focuses
  Cancel unless the focus is already on one of its buttons. `retry3D`
  answers the offer and re-enters play, from the pause card too;
  `standardFromWait3D` is the generating card's Play a standard board (the
  session's `playStandard()`); Main menu is `PAUSE.toMenu()`. While the card
  shows, the controller goes to `padStatus3D`.
- **Learn 3D.** `startLearn()` (the board choice's `onLearn`, the ready
  card's line, `__ms.learn()`) starts `learnChoice()` (`js/mode3d/learn.js`)
  and saves nothing. `S.learn` holds the guided game's prompt sequence
  (`createLearnPrompts`), null otherwise; `ui.setLearn(true)` gives the
  overlay Learn 3D's layout. `refreshHints` shows its prompt in the hint strip in play
  (`LEARN_HINTS`, after its step `#hint-strip-step` from `learnStepOf`, no
  close button); `learnAction` feeds flags and chords
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
  ([app-shell-end-delay.md](app-shell-end-delay.md) § End delay). A null summary
  ends the guided board on the `learn-end` screen (`#learn-end`, Play Cube
  Intro → `playCubeIntro`, an ordinary pick saved as the last choice, or Try
  again → `PAUSE.restart`; Back to board choice) and the debug hook's fixed
  board on the pause card.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  generating state, timer start, the 3D mode's reports.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 3D end sequence.

## CROSS-REFERENCES

- [app-shell-3d.md](app-shell-3d.md) — the flow, entering play and the
  ready card whose Learn 3D line starts the guided board.
- [mode3d.md](mode3d.md) — Learn 3D's guided board and prompts;
  [mode3d-session.md](mode3d-session.md) — the session these wire;
  [generation.md](generation.md) (`GEN_3D`).
- [app-shell-end-delay.md](app-shell-end-delay.md) — the end delay and its skip.
- [app-shell-help.md](app-shell-help.md) — the hint strip and first-use
  state Learn 3D drives.
- [rendering.md](rendering.md) — `setGame`, `setMark`, `sync`.
- [audio.md](audio.md) — the win sound.
- [testing.md](testing.md) — `tests/mode3d-*.test.mjs` (end sequence, the
  results over the scene and the look).

## WHEN TO READ THE SOURCE

- Changing the 3D end-of-game flow or the frozen HUD (`endGame`,
  `S.endState`, the `MODES.on('finished')` Learn 3D end card and fixed
  board's pause card),
  the board status card (`showStatus3D`, `retry3D`).
- Changing Learn 3D's wiring (`startLearn`, `learnAction`, `learnChanged`,
  `learnViews`).
