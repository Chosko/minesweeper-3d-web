# 3D results and records screens

The results screen and the Records screen for 3D games: when a 3D game ends,
the end effect plays for about a second and then the same results screen as
Classic 2D takes over completely; the Records screen gains a 2D | 3D switch
that shows the 3D boards' bests, win rate, streaks and history.

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

- The 3D end of game: input frozen while the end effect plays — the loss
  wave showing where the mines were with the camera shake, or the win
  confetti — then the results screen.
- The results screen for won and lost 3D games: the same contents and
  actions as Classic 2D's — outcome, board label, time, 3BV (and 3BV solved
  on a loss), 3BV/s, efficiency, the three-best comparison on a win, *Play
  again*, *Watch replay*, *Records* and *Back to menu*.
- The results screen covering the 3D scene completely; the end banner and
  flying around the finished board are removed.
- The Records screen's 2D | 3D switch, the 3D board picker, and the chosen
  mode's overall figures.

Non-goals:

- A results panel the player can close to fly around the finished board —
  rejected: the results screen takes over, and the end effect is the
  player's look at the finished board.
- Changing the end effects themselves, or any other part of the 3D scene's
  look — kept, per the m2 slice.
- Showing bests on the 3D board choice — no mode's board choice shows
  bests; they are on the Records screen.
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
  and camera movement. The renderer plays the end effect it plays today.
  After a fixed end delay of about one second the mode releases pointer
  lock and reports `game finished(summary)` to the shell. The delay is one
  constant shared by win and loss.
- **Results takeover.** `results-screen` shows over 3D on an opaque surface
  in the chosen theme; the 3D scene is not visible behind it and stops
  rendering while it shows. Its flow — record first, then show the summary
  and the comparison — is `results-screen`'s, unchanged.
- **Banner retirement.** The 3D mode's end banner, its compact form and its
  best-time line go, with the old best-time recording `3d-play-flow`
  already retires. After the results screen a 3D game is never returned
  to: *Play again* starts a new one, the other actions leave it.
- **Records mode switch.** `records-screen` gains a 2D | 3D segmented
  choice above its board picker. The picker lists the chosen mode's boards
  from `3d-game-records`' mode-filtered listing; 3D boards use the 3D
  labels. The figures panel shows the chosen board's figures and the chosen
  mode's overall figures. The history chart and recent games list are
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
- **Input during the delay** — board actions, camera movement and view-mode
  keys are ignored; pause is not offered, since the game's timer has
  stopped; Esc and the controller's Start are ignored until the results
  screen shows.
- **Hidden tab** — when the tab is hidden during the delay, the results
  screen is shown when it returns; the summary is recorded at the end of
  the delay whatever the tab's visibility.
- **Play again** — asks the shell to start the same 3D board choice; the
  3D mode re-acquires pointer lock, or enters lockless play from a
  controller, as its start does today.
- **Records** — opens `records-screen` on 3D and on this game's board.
- **Watch replay** — `replay-playback`'s action, unchanged; Back returns to
  the results screen.
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
- `screen-components` — the segmented choice and the opaque surface.
- `replay-playback` and `replay-library` — *Watch replay* and the library
  view, which follow the board shown.
- No external libraries.

## Open questions

- The end delay's exact length. About one second is the target; on large
  boards the loss wave spreads for longer than that, so whether the delay
  grows with the board or the wave is cut where it stands is settled by
  watching real games. Blocks the constant, not the flow.
