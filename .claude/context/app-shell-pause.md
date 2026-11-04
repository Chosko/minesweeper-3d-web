# App shell — pause, the pause card, confirmations

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the pause card and the pause controller (`js/shell/pause.js`: pause, resume, restart,
back to menu, confirmations) and their wiring in `js/main.js`. The module
is pure; its rules are documented in its head comment. The restart keys,
the game hand-offs, the leave-page guard and the quit flush are
[app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md). Both modes'
end delay and its skip are [app-shell-end-delay.md](app-shell-end-delay.md).

## PUBLIC API

`js/shell/pause.js`
- `PAUSE_SOURCES` (`key`, `pad`, `button`, `blur`, `hidden`), `AUTO_SOURCES`
  (`blur`, `hidden`), `HAND_OFFS` (`finished`, `abandoned`, `inProgress`),
  `CONFIRMATIONS` (`restart`, `menu`: `{action, title, message,
  confirmLabel}`, both asking the same),
  `RESTART_NOTICE`, `NO_GAME_LINE` (the card's status line before the first
  click), `ENDED_LINE` (its status line once the game is won or lost), `RESTART_SCREENS` (`playing`, `classic-2d`, `paused`).
- `restartInput`: [app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md).
- `createPauseController({modes, showCard, isPaused?, onBoard?, confirm,
  goMenu, guard?, cancelGeneration?, askRestart?, restarted?, unrecorded?})` →
  `inProgress`, `pause(source, {note})` → whether the card opened,
  `back(source)`, `resume(source)`, `restart(source)`, `toMenu()`,
  `pageHide()`, `attach(handOff, listener)` → detach, `dispose()`.
  `finished` / `abandoned` listeners receive `(summary, mode, replay)`
  (`replay` the sealed `{blob, listing}` or null); `inProgress` listeners
  `(summary, mode)`.

## INTERNAL PATTERNS

- **One owner.** `PAUSE` is the one owner of pause, resume, restart and back
  to menu. Every pause source goes through `pauseGame(source)` (nothing
  during an end delay, else `PAUSE.pause`): the overlay's pause button,
  controller disconnect (with a note), `blur` — the window's, and the
  overlay pause: the Steam overlay opening at the desktop host
  (`onOverlayActivated`, [platform-host.md](platform-host.md)) pauses as a window
  blur —, `visibilitychange` hidden, `__ms.pause()`. Esc on the board, the controller's back buttons over a
  board status card and pointer-lock loss go through
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
  `#pause-card`, [app-shell-markup-game.md](app-shell-markup-game.md) § Screens), at
  each window step's width in the *J-Pause* artboards, two equal columns
  from the kit breakpoint: its title block `#pause-head` holds the title,
  the full board line `#pause-board` (mode, board, size, mines, no-guess:
  the mode's board title, `boardTitle2D` or `boardTitle3D`, joined to the board's size
  line) and the status line `#pause-sub` in the mono face. Each action
  leads with its icon (Resume play, Back to start cube, Restart restart,
  Main menu arrow-left). `ui.showPause` takes `inProgress` from
  `pauseInfo`'s `gameInProgress()`: a started, unfinished game
  (`PAUSE.inProgress`), or a first click whose board is being generated or
  failed (Classic 2D's `status().pending`, the 3D session's state). During
  a game the status line is the
  running time and mines left and Resume, the go button (with its back
  key hint), leads, Restart and Main menu secondary;
  with no game in progress the status line is `NO_GAME_LINE` before the
  first click and `ENDED_LINE` after the end, which the running time never
  replaces,
  Restart leads as the go button and takes the focus, and Resume and
  "Back to start" are hidden. "Back to start" shows only for a 3D game in
  play; `#p-restart` reads Restart (with its restart key hint) or, once
  the game ended, Play again. Its Settings panel is muted and bound like
  the Settings page's controls (`data-setting`: Sound as a switch row,
  volume, then the look sensitivity and the invert Y switch row on a 3D
  game's card only) through `bindSettingControls`. Its Controls panel
  `#pause-list` (the inset border alone, no edge) holds the controls list
  `#pause-controls`: the active mode's help rows for the device
  ([app-shell-help.md](app-shell-help.md)).
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

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  pause rules, confirmations.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the pause card's and the confirmations' layout.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the overlay pause.

## CROSS-REFERENCES

- [app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md) — the
  restart keys, the hand-offs, the leave-page guard and the quit flush.
- [app-shell-end-delay.md](app-shell-end-delay.md) — the end delay, which
  stops pause, Back and restart while it runs.
- [testing-files.md](testing-files.md) — `tests/shell-*.test.mjs` (pause
  controller).

## WHEN TO READ THE SOURCE

- Changing pause rules or confirmations: `js/shell/pause.js` and the
  `PAUSE` wiring in `js/main.js`.
