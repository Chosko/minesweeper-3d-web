# App shell — end delay and its skip

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers both modes' end delay — the pause between a won or lost game's last
action and its finished report — and its skip: `js/shell/end-skip.js`, pure,
its rules documented in its head comment, and its wiring in `js/main.js`.
The pause controller it holds back is [app-shell-pause.md](app-shell-pause.md).

## PUBLIC API

`js/shell/end-skip.js`
- `createEndSkip({ending, skip})` → `{keyDown({code, repeat}), keyUp({code}),
  press(), release({buttons}), click({isTrusted}), pad(pressed), lockLost(),
  reset()}`, each → whether the event is consumed (`lockLost` → whether it
  skipped). During `ending()` a fresh press calls `skip()` and every click is
  consumed; the skipping press stays consumed through its auto-repeat,
  release and trusted clicks; a key already repeating is consumed until its
  release.

## INTERNAL PATTERNS

- **End delay.** Both modes end a won or lost game with an end delay before
  reporting finished; `endDelay()` is `activeMode()`'s `ending`. While it
  runs no board action, pause, Back or restart is offered. `END_SKIP`
  (skipping with `activeMode()?.finishNow()`) is fed by capturing
  `keydown`/`keyup`, `pointerdown`/`mousedown`, `pointerup`/`mouseup` and
  `click`/`auxclick`/`contextmenu` listeners on `window`, which swallow
  (`preventDefault`, `stopImmediatePropagation`) every event it reports
  consumed; `handlePad` hands it each poll first; `onLockChange` hands it a
  lock released during the delay; `blur` and the tab hiding call `reset()`.
  The same listeners feed `LOOK_END`, which ends the look at a finished 3D
  board ([app-shell-results-view.md](app-shell-results-view.md) § Look at the board).
  The finished report then routes to `results` at once. The 3D-specific
  freeze during the delay: [app-shell-3d-session.md](app-shell-3d-session.md) § End sequence.
- **Nothing else waits.** `restartBlocked()` is true during the delay
  ([app-shell-pause.md](app-shell-pause.md) § Restart keys), and
  `pauseGame` does nothing; `pagehide` finishes a game in its delay at once
  (`activeMode().finishNow()`) so it is recorded finished.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the end sequence and its skip.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  what the shell offers while a game ends.

## CROSS-REFERENCES

- [app-shell-pause.md](app-shell-pause.md) — the pause controller, restart
  keys and the leave-page guard the delay suspends.
- [app-shell-3d-session.md](app-shell-3d-session.md) § End sequence — the
  3D freeze during the delay; [classic2d-mode.md](classic2d-mode.md) and
  [mode3d-adapter.md](mode3d-adapter.md) — each mode's `ending` and
  `finishNow`.
- [app-shell-results-view.md](app-shell-results-view.md) § Look at the
  board — `LOOK_END`, a second end skip on the same listeners.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (end-delay skip).

## WHEN TO READ THE SOURCE

- Changing what a press during an end delay does: `js/shell/end-skip.js`
  and the end-delay block of `js/main.js` (`END_SKIP`, `endDelay`,
  `activeMode`).
