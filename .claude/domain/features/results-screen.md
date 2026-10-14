# Results screen

The end-of-game screen: whether the game was won or lost, its time, 3BV,
3BV/s, efficiency and clicks, its rank on the board, the comparison with the
board's three personal bests, the next target, and *Play again* one step
away.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
puts the results screen at the centre of the enthusiast loop: the player
finishes a game, sees how it measured against their bests, and plays again
in one step. This feature is the screen's behaviour and content; its look
comes from `screen-components` and its numbers from `game-summary` and
`personal-records`.

## Scope and non-goals

In scope (m1-classic-2d):

- The screen shown after every won or lost Classic 2D game, reading top to
  bottom: outcome and board label; a banner naming the bests the game set
  ("New best time and 3BV/s!"); the game's own stats — time, 3BV (and 3BV
  solved on a loss), 3BV/s and efficiency — as the card's largest figures,
  each one that set a best highlighted; a second row with the clicks
  ("Clicks 183 (L 183 · R 0 · D 0 · wasted 0)": the counted clicks, then the
  reveal, flag and chord clicks and the wasted total) and, on a win, the
  game's rank by time among the board's won games ("#3 of 12 on this
  board"); the next-target line; the board's standing counting this game —
  its win rate and longest streak, each with its completed games' figure
  beside it ("Win rate 67% (completed games 80%) · Longest streak 4
  (completed games 5)", `personal-records`); then the bests panel. The
  card shows no IOE.
- The comparison with each of the three bests — fastest time, best 3BV/s,
  best efficiency — showing the standing best and the difference. On a win
  each difference is coloured (better in the success colour, worse in the
  danger colour, "= best" in the muted ink; the sign and the "New best"
  text stay, so colour is never the only signal) and each new best is
  marked. On a loss the panel is greyed and labelled "Not eligible — only
  won games set bests": each standing best with the game's difference from
  it, never "New best", and for time the pace — the time at this game's
  rate, elapsed × 3BV ÷ 3BV solved ("Pace 47.912 s") — with its difference
  from the best time.
- The next-target line: after a win "Beat 48.213 s for a new best · streak
  3" (the board's best time as it stands after this game and the board's
  current streak); after a loss that ended a streak "Streak ended at 3 ·
  best 7" (the streak ended and the board's longest); after any other loss
  "Beat 48.213 s for a new best", or "Win this board to set a best" when
  the board has no best time.
- Actions: *Play again* (default focus, and `Enter` or `R` on the keyboard;
  the screen's hint names `R`), *Watch replay* (when the game handed over its
  replay — `replay-playback`), *Records* (opens the records screen on this
  board), *Main menu*.
- Telling the player once when records are not being saved this session.
- Mouse, keyboard and controller operation, per the shell's navigation.

Non-goals:

- 3D games on the results screen — deferred to `m2-3d-joins`.
- Steam global and friends rank — `results-steam-rank`, in `m3-on-steam`.
- A results screen for abandoned games: restarting or leaving goes where
  the player asked, a game ended by closing the game is recorded at the
  next launch, and neither is shown.
- The screen's visual design — `screen-components`.

## Architecture

Built within the recorded technical direction — plain DOM in the game shell,
no framework (see [technical-direction.md](../technical-direction.md)),
composed from the `screen-components` kit.

- **Results flow.** On the shell's game-finished hand-off, reads the
  board's current streak from `personal-records`, records the summary, then
  reads the board's counters, history, win rate and completed win rate, and
  fills and shows the screen with the summary, the comparison, the streak,
  the standing and the rank. Recording
  happens before the screen shows, so the comparison is against the bests
  that stood before this game. The rank is 1 + the board's earlier won
  games whose time is at or below this game's (a tie ranks the earlier game
  first), out of the board's won games including this one; a no-guess board
  ranks only among its own games. The records model and its documents are
  unchanged by it.
- **Results view.** The composition from `screen-components`: an outcome
  header, the banner, the stat readouts, the second row, the next-target
  line, the three best comparisons, the actions. Time is shown to the
  thousandth of a second, truncated rather than rounded (47 380 ms shows as
  47.380 s), while the stored time keeps its millisecond precision; this is
  the one format for every time the game shows except the in-game overlay's
  timer and the replay viewer's playback clock, which keep the overlay's
  whole seconds (`screen-components`, `replay-playback`). 3BV/s is shown to
  two decimals; efficiency to one decimal (94.7%). A difference from a best
  shows the same precision with a sign, time truncated toward zero
  ("−1.270 s"); one that is zero at that precision reads "= best", with no
  sign and no number, and a new best whose difference is zero there reads
  "New best" alone. No precision setting exists. A stat that is not
  available shows a dash.
- **Rank panel.** In the Steam build, after a won game on a board with a
  leaderboard, the view carries `results-steam-rank`'s panel below the
  comparison; the flow starts it when the screen shows and stops it when
  the screen is left. In the same build, after any game on a board with a
  leaderboard, the actions carry `results-steam-rank`'s *Leaderboard*
  action, which opens the leaderboard screen on this game's board.
- **Board shown behind.** In Classic 2D the finished board stays visible
  behind the screen, as the mode left it, so a loss still shows where the
  mines were. Over 3D the finished board is drawn dimmed behind the screen,
  and the 3D screen carries a *Look at the board* action, per
  `3d-results-records-screens`.

## Data and state

- No persisted state. The shown summary, comparison, streak, standing and
  rank are held while the screen is open.

## Interfaces and contracts

- **Show** — from the game shell with a won or lost summary; the shell
  routes here and back.
- **Play again** — asks the shell to start the same board choice again,
  from the button, `Enter` or `R`; `Enter` is Play again while the focus
  is on Play again or on no action, and on another focused action
  activates that action; key repeats do nothing. The game has ended, so
  nothing counts as a loss.
- **Watch replay** — shown only when the finished game handed over a sealed
  replay and the shell has the replay viewer's route; asks the shell to open
  `replay-playback`'s viewer with that replay, returning to this screen. It
  plays the game's own replay even when the library could not save it.
- **Records** — asks the shell to route to `records-screen`, opened on this
  game's board.
- **Main menu** — asks the shell to return to the main menu.
- **Failure** — when recording fails, the screen still shows the game's own
  stats, without a comparison, a next-target line or the standing line and
  with the rank as a dash, and says the result could not be saved.

## Dependencies

- `game-summary` — the summary, derived stats and board label.
- `personal-records` — recording and the comparison.
- `screen-components` — the results screen composition and its controls.
- `game-shell` — routing, the game-finished hand-off, navigation.
- No external libraries.
