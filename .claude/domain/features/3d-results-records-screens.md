# 3D results and records screens

The results screen and the Records screen for 3D games: when a 3D game ends,
the end effect plays for an end delay that grows with the board and then
the same results screen as Classic 2D shows over the dimmed 3D scene, from
which the player can choose to look at the finished board; the Records
screen gains a 2D | 3D switch that shows the 3D boards' bests, win rate,
streaks and history.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
gives every finished game one results screen with *Play again* and *Watch
replay* one step away, and the m2 exit criteria require 3D games to feed
it. Today a 3D game ends with a banner over the scene and the player keeps
flying around the finished board. This feature replaces that end with the
shared results screen, keeps the end effect as the moment that shows why
the game was lost, and opens the Records screen to 3D boards. The screens'
contents and look stay `results-screen`'s, `records-screen`'s and
`screen-components`'; this feature is what changes for 3D.

## Scope and non-goals

In scope (m2-3d-joins):

- The 3D end of game: the end effect plays — the loss wave showing where
  the mines were with the camera shake, or the win confetti — then the
  results screen; any click, key or controller button during the effect
  shows the results screen at once and does nothing else.
- The results screen for won and lost 3D games: the same contents and
  actions as Classic 2D's (`results-screen`), plus *Look at the board*.
  Over the scene the header carries *Look at the board* with its `Esc`
  hint, the rank moves under the title, and *Main menu* drops its `Esc`
  hint.
- The results screen shown over the dimmed 3D scene; the end banner is
  removed.
- *Look at the board*: a read-only free flight over the frozen finished
  board, chosen from the results screen, until the player brings the
  screen back.
- The Records screen's 2D | 3D switch, the 3D board picker, and the chosen
  mode's overall figures.

Non-goals:

- Changing the look of the end effects or of any other part of the 3D
  scene — kept, per the m2 slice. The end effects' pacing follows the end
  delay (§ Architecture).
- The 3D board choice's bests — `shared-screen-layout`.
- A combined 2D and 3D view in Records — `3d-game-records` keeps the modes
  apart.
- The replay library view and the replay viewer — `replay-library` and
  `replay-playback`; they follow the board and mode the screens show.
- Steam ranks on the results screen and the Leaderboards entry — deferred
  to `m3-on-steam`.

## Architecture

Built within the recorded technical direction — plain DOM in the game
shell, no framework, composed from the `screen-components` kit, over the 3D
front-end in three.js (see [technical-direction.md](../technical-direction.md)).
It extends `results-screen`, `records-screen` and the 3D mode's end of game
from `3d-play-flow`; the existing banner, end-state freeze and effects are
described in [app-shell.md](../../context/app-shell.md) and
[rendering.md](../../context/rendering.md).

- **3D end sequence.** At a win or loss the 3D session stops the timer,
  freezes the HUD's end state as today, and stops accepting board actions
  and camera movement. The renderer plays the end effect.
  After the end delay — or at once, when the player presses any mouse
  button, key or controller button during it — the mode releases pointer
  lock and reports `game finished(summary)` to the shell. The delay is one
  function of the board's dimensions, shared by win and loss: it grows with
  the board's diagonal so that the loss wave from the exploded cube reaches
  the farthest cell and that cell's reveal completes before it ends, never
  below one second nor above 2.5 seconds; the renderer's wave pacing is
  derived from the same function.
- **Results over the scene.** `results-screen` shows over 3D on a dimmed
  translucent surface in the chosen theme, with the finished 3D scene drawn
  behind it on demand — a resize, an end effect still running, the first
  frame after the screen shows — and no frame drawn while nothing changes.
  Its flow — record first, then show the summary and the comparison — is
  `results-screen`'s, unchanged.
- **Look at the board.** The 3D results screen's *Look at the board* hides
  the screen and opens a free flight over the frozen finished board,
  starting from the camera pose the game ended with, with the 3D flight
  controls, the view-mode keys and spacing — or, when the Camera setting is
  Orbit, orbiting the board with Orbit play's controls. It is read-only: no board
  action, no pause, no timer, nothing recorded. The board is drawn in its
  end state — on a loss every mine shown, the exploded cube marked and
  wrong flags crossed; on a win the solved board with unflagged mines shown
  as flags — the same after *Watch replay* and Back.
- **Banner retirement.** The 3D mode's end banner, its compact form and its
  best-time line go, with the old best-time recording `3d-play-flow`
  already retires. After the results screen a 3D game is never returned
  to: *Play again* starts a new one, the other actions leave it, and the
  look is a view of the finished board, not a return to the game.
- **Records mode switch.** `records-screen` gains a 2D | 3D segmented
  choice above its board picker. The picker lists the chosen mode's boards
  from `3d-game-records`' mode-filtered listing; 3D boards use the 3D
  labels. The figures panel shows the chosen board's figures, and under
  them the chosen mode's overall figures as a row of their own, titled for
  the mode ("Classic 2D overall", "3D overall") and never mixed with the
  board's, the completed games' win rate and best streak among both as in
  2D. Each mode's picker lists its Daily board after its named boards and
  before its custom boards, and game rows show the board code
  (`records-screen`). The history chart and recent games list are
  unchanged, read for the chosen board.

## Data and state

- No persisted state. The chosen mode and board are Records screen state;
  the end delay's countdown and the frozen end state are 3D session state.
- The Records screen opens on the mode and board it was asked for,
  otherwise on the mode and board of the last game played.

## Interfaces and contracts

- **Game finished, 3D** — reported once, after the end delay, with the won
  or lost summary. Nothing during the delay can restart or leave the game,
  so a finished 3D game is never reported abandoned.
- **Input during the delay** — any click, key or controller button ends
  the delay at once and shows the results screen; that input does nothing
  else — no board action, pause, Back or restart — and neither its release,
  its auto-repeat nor a held button reaches the results screen. Camera
  movement and view-mode keys are ignored; pause is not offered, since the
  game's timer has stopped.
- **Hidden tab** — when the tab is hidden during the delay, the results
  screen is shown when it returns; the summary is recorded at the end of
  the delay whatever the tab's visibility.
- **Play again** — asks the shell to start the same 3D board choice; with
  a pointer or the keyboard, its activation is the pointer-lock gesture, so
  play starts with no click-to-play card when the lock is granted, and the
  card stays the fallback, with its message, when it is refused; a
  controller enters lockless play.
- **Records** — opens `records-screen` on 3D and on this game's board.
- **Watch replay** — `replay-playback`'s action, unchanged; Back returns to
  the results screen.
- **Watch best** — `results-screen`'s action, beside *Watch replay*, on the
  3D board's fastest-time best; Back returns to the results screen.
- **Look at the board** — the 3D results screen's action, and Back on that
  screen (`Esc`, the controller's back buttons): with a pointer or the
  keyboard its activation is the pointer-lock gesture, and when the lock is
  refused the screen stays with a one-line note and a fresh press tries
  again; a controller's look is lockless and flies with the sticks alone.
  `Esc`, any mouse button or any controller button — and the browser's
  release of the lock — ends the look and shows the results screen again
  with focus on *Play again*; that press does nothing else, and neither
  its release, its auto-repeat nor a held button reaches the screen. A
  one-line hint on the look names the way back. *Main menu* keeps its
  meaning.
- **Open Records** — `records-screen`'s Open takes an optional mode beside
  the optional board key; a board key carries its mode, so a key alone
  also sets the switch.
- **Failure** — as `results-screen`: when recording fails, the screen still
  shows the game's own stats without a comparison and says the result
  could not be saved. A lost graphics context during the delay is reported
  as `game-shell` reports a mode's failure, and the summary is still
  recorded.

## Dependencies

- `3d-game-records` — 3D board labels, per-mode counters and the
  mode-filtered board listing.
- `results-screen` — the screen, its flow and its actions, shown for 3D.
- `records-screen` — the screen the mode switch and 3D picker extend.
- `3d-play-flow` — the 3D session's end of game and its mode adapter.
- `game-shell` — routing, the game-finished hand-off and navigation.
- `screen-components` — the segmented choice and the overlay surfaces.
- `replay-playback` and `replay-library` — *Watch replay* and the library
  view, which follow the board shown.
- No external libraries.
