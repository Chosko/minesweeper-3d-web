# App shell — pause, confirmations, restart, hand-offs, end delay

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the pause card and the pause controller (`js/shell/pause.js`: pause, resume, restart,
back to menu, confirmations, game hand-offs, leave-page guard), the end
delay's skip (`js/shell/end-skip.js`), and their wiring in `js/main.js`.
Both modules are pure; their rules are documented in their head comments.

## PUBLIC API

`js/shell/pause.js`
- `PAUSE_SOURCES` (`key`, `pad`, `button`, `blur`, `hidden`), `AUTO_SOURCES`
  (`blur`, `hidden`), `HAND_OFFS` (`finished`, `abandoned`, `inProgress`),
  `CONFIRMATIONS` (`restart`, `menu`: `{action, title, message,
  confirmLabel}`, both asking the same),
  `RESTART_NOTICE`, `RESTART_SCREENS` (`playing`, `classic-2d`, `paused`).
- `restartInput(input, {screen, blocked?})` → `'restart'` for `'F2'` or
  `'pad'` (Start + Y) on a `RESTART_SCREENS` screen, `'playAgain'` for
  `'KeyR'` on `results`, else null; null for anything while `blocked`.
- `createPauseController({modes, showCard, isPaused?, onBoard?, confirm,
  goMenu, guard?, cancelGeneration?, askRestart?, restarted?, unrecorded?})` →
  `inProgress`, `pause(source, {note})` → whether the card opened,
  `back(source)`, `resume(source)`, `restart(source)`, `toMenu()`,
  `pageHide()`, `attach(handOff, listener)` → detach, `dispose()`.
  `finished` / `abandoned` listeners receive `(summary, mode, replay)`
  (`replay` the sealed `{blob, listing}` or null); `inProgress` listeners
  `(summary, mode)`.

`js/shell/end-skip.js`
- `createEndSkip({ending, skip})` → `{keyDown({code, repeat}), keyUp({code}),
  press(), release({buttons}), click({isTrusted}), pad(pressed), lockLost(),
  reset()}`, each → whether the event is consumed (`lockLost` → whether it
  skipped). During `ending()` a fresh press calls `skip()` and every click is
  consumed; the skipping press stays consumed through its auto-repeat,
  release and trusted clicks; a key already repeating is consumed until its
  release.

## INTERNAL PATTERNS

- **One owner.** `PAUSE` is the one owner of pause, resume, restart and back
  to menu. Every pause source goes through `pauseGame(source)` (nothing
  during an end delay, else `PAUSE.pause`): the overlay's pause button,
  controller disconnect (with a note), `blur`, `visibilitychange` hidden,
  `__ms.pause()`. Esc/Back on the board and pointer-lock loss go through
  `backGame(source)` → `PAUSE.back`, which first cancels a board being
  generated (`cancelGeneration()`; a 3D game without lock or controller
  play goes to the click-to-play card) and pauses otherwise.
- **What pauses.** A started, unfinished game pauses through the mode;
  before the first click or after the end an asked-for pause only opens the
  card, and an automatic one (blur, hidden) does nothing — nor while the
  board is not in play. Nothing pauses twice. While `paused` shows, the
  canvas is hidden and play input is dropped.
- **Esc on the pause card** of a game in play resumes (`PAUSE.resume('key')`)
  however soon after the lock release, except the releasing press and a
  held Esc's auto-repeat: `resumeFromPause` asks `escResumes(input.lastKey)`
  ([input.md](input.md)). Browsers hand the page at most the releasing
  press's `keyup`, never its `keydown`, while the lock holds.
- **The card** (`css/components.css` head comment, *Pause card*;
  `#pause-card`, [app-shell-markup.md](app-shell-markup.md) § Screens):
  `ui.showPause` shows Resume (with its back key hint) only while the game
  is on, "Back to start" only for a 3D game in play, and labels
  `#p-restart` Restart (with its restart key hint) or, once the game ended,
  Play again. Its Settings panel is muted and bound like the Settings
  page's controls (`data-setting`: Sound, volume, then the look controls
  on a 3D game's card only) through `bindSettingControls`.
- **Confirmation.** Back to menu during a started, unfinished game calls
  `confirm` → `ui.showConfirm` on the pause card (`#pause-confirm`, a
  `ui-confirm` with its heading, in place of `#pause-actions`, its action
  `#p-confirm-yes` a `ui-button--danger`);
  Back or Cancel closes it. Restart of such a game
  proceeds at once, the page's first one toasting `RESTART_NOTICE`
  (`restarted`); under the `confirmRestart` setting (`askRestart`) it
  confirms too, pausing first. Outside such a game both proceed at once,
  and so does a game outside the records (`unrecorded`, the shell's
  `mode3d.learn`: the Learn 3D guided game), with no toast. The guided
  game's end goes to the Learn 3D end card (`learn-end`,
  [app-shell-3d-session.md](app-shell-3d-session.md)), not the results screen.
- **Restart keys.** `restartKey(code, e)` in `onKey` (after the 3D `Home` /
  `R` camera return), through `restartInput`, never with Ctrl/Alt/Meta:
  `F2` (default always prevented) → `PAUSE.restart('key')`; `R` on `results`
  → `RESULTS.playAgain('key')`. `Enter` on `results` is its own listener
  (`resultsEnter`, [app-shell-results.md](app-shell-results.md)). `handlePad`
  reads Start + Y after the end delay's skip: Y pressed while Start is held
  (read unsuppressed) → `PAUSE.restart('pad')`, then `layerChanged()`.
  `restartBlocked()` — an end delay, an open confirmation or the controls
  modal — stops all three.
- **Hand-offs.** `PAUSE.attach(name, listener)`: `finished` and `abandoned`
  with the sealed replay beside the summary; `inProgress` at game started,
  at every pause of a started, unfinished game and on `pagehide`. The
  controller routes nowhere itself. `RECORDS.attach(PAUSE)` takes all three
  ([records-store.md](records-store.md)); `RESULTS.attach(PAUSE)` takes `finished` and
  `abandoned` and is the one listener that reads the replay.
- **Leave-page guard.** `guardLeave` on `beforeunload` is armed at game
  started and removed when the game finishes, is abandoned or its mode
  fails (Ctrl is a game key and Ctrl+W cannot be intercepted). The
  context-lost reload and Reset all data's reload set `reloading` to bypass
  it. It does not guard a game in its end delay, which `pagehide` finishes
  at once (`activeMode().finishNow()`) so it is recorded finished.
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
  board ([app-shell-results.md](app-shell-results.md) § Look at the board).
  The finished report then routes to `results` at once. The 3D-specific
  freeze during the delay: [app-shell-3d-session.md](app-shell-3d-session.md) § End sequence.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  pause rules, confirmations, hand-offs, leave-page guard.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the end sequence and its skip.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the replay beside the summary in the finished and abandoned reports.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the pause card's and the confirmations' layout.

## CROSS-REFERENCES

- [records-store.md](records-store.md) — the records store attached to the hand-offs.
- [app-shell-results.md](app-shell-results.md) — the results flow on
  `finished` / `abandoned`.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (pause controller,
  end-delay skip), `tests/replay-2d.test.mjs` (replay on the mode host and
  the hand-offs).

## WHEN TO READ THE SOURCE

- Attaching a feature to a game's end, abandonment or progress: the
  hand-offs in the head comment of `js/shell/pause.js`.
- Changing pause rules, confirmations or the leave-page guard:
  `js/shell/pause.js` and the `PAUSE` wiring in `js/main.js`.
- Changing what a press during an end delay does: `js/shell/end-skip.js`
  and the end-delay block of `js/main.js` (`END_SKIP`, `endDelay`,
  `activeMode`).
