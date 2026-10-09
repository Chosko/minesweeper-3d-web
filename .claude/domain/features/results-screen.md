# Results screen

The end-of-game screen: whether the game was won or lost, its time, 3BV,
3BV/s and efficiency, the comparison with the board's three personal bests,
and *Play again* one step away.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
puts the results screen at the centre of the enthusiast loop: the player
finishes a game, sees how it measured against their bests, and plays again
in one step. This feature is the screen's behaviour and content; its look
comes from `screen-components` and its numbers from `game-summary` and
`personal-records`.

## Scope and non-goals

In scope (m1-classic-2d):

- The screen shown after every won or lost Classic 2D game: outcome, board
  label, time, 3BV (and 3BV solved on a loss), 3BV/s and efficiency.
- On a win, the comparison with each of the three bests — fastest time,
  best 3BV/s, best efficiency — showing the standing best and the
  difference, and marking each new best.
- Actions: *Play again* (default focus), *Records* (opens the records
  screen on this board), *Back to menu*.
- Telling the player once when records are not being saved this session.
- Mouse, keyboard and controller operation, per the shell's navigation.

Non-goals:

- *Watch replay* — deferred to `m2-3d-joins`.
- 3D games on the results screen — deferred to `m2-3d-joins`.
- Steam global and friends rank — deferred to `m3-on-steam`.
- A results screen for abandoned games: restarting or leaving goes where
  the player asked, and the game is recorded without being shown.
- The screen's visual design — `screen-components`.

## Architecture

Built within the recorded technical direction — plain DOM in the game shell,
no framework (see [technical-direction.md](../technical-direction.md)),
composed from the `screen-components` kit.

- **Results flow.** On the shell's game-finished hand-off, records the
  summary with `personal-records`, then fills and shows the screen with the
  summary and the comparison. Recording happens before the screen shows, so
  the comparison is against the bests that stood before this game.
- **Results view.** The composition from `screen-components`: an outcome
  header, the stat readouts, the three best comparisons, the actions. Time
  is shown to the hundredth of a second; 3BV/s to two decimals; efficiency
  as a whole percentage. A stat that is not available shows a dash.
- **Board shown behind.** In Classic 2D the finished board stays visible
  behind the screen, as the mode left it, so a loss still shows where the
  mines were. Over 3D the screen is opaque and takes over, per
  `3d-results-records-screens`.

## Data and state

- No persisted state. The shown summary and comparison are held while the
  screen is open.

## Interfaces and contracts

- **Show** — from the game shell with a won or lost summary; the shell
  routes here and back.
- **Play again** — asks the shell to start the same board choice again.
- **Records** — asks the shell to route to `records-screen`, opened on this
  game's board.
- **Back to menu** — asks the shell to return to the main menu.
- **Failure** — when recording fails, the screen still shows the game's own
  stats, without a comparison, and says the result could not be saved.

## Dependencies

- `game-summary` — the summary, derived stats and board label.
- `personal-records` — recording and the comparison.
- `screen-components` — the results screen composition and its controls.
- `game-shell` — routing, the game-finished hand-off, navigation.
- No external libraries.
