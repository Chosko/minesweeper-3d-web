# Results screen

The end-of-game screen: whether the game was won or lost, its time, 3BV,
3BV/s, efficiency and clicks, its rank on the board, each figure's
comparison with the board's personal best, the next target, and *Play
again* one step away.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
puts the results screen at the centre of the enthusiast loop: the player
finishes a game, sees how it measured against their bests, and plays again
in one step. This feature is the screen's behaviour and content; its look
comes from `screen-components` and its numbers from `game-summary` and
`personal-records`.

## Scope and non-goals

In scope (m1-classic-2d):

- The screen shown after every won or lost Classic 2D game, one column
  reading top to bottom: a header with the outcome ("You won!", or "Game
  over"), the board label and, on a win, the game's rank by time among the
  board's won games as a chip ("#3 of 12 wins on this board"); four figure
  tiles, each carrying its own comparison; the details; the board code; the
  action bar. No separate new-best banner and no separate bests panel. The
  card shows no IOE.
- The figure tiles: on a win time, 3BV/s, efficiency and 3BV (the board's
  difficulty); on a loss time, 3BV solved out of the board's 3BV with a
  progress bar, 3BV/s and efficiency. Under each comparable figure, its
  comparison with the matching best — fastest time, best 3BV/s, best
  efficiency — as the standing best and the difference; when the game set
  that best, the line gives the best it replaced and the tile carries a
  "New best" badge. On a win each difference is coloured (better in the
  success colour, worse in the danger colour, "= best" in the muted ink;
  the sign and the "New best" text stay, so colour is never the only
  signal). On a loss no tile is eligible: the time tile says losses set no
  bests, and the 3BV/s and efficiency tiles show the standing best without
  a difference.
- The details, three labelled rows: *Clicks* — the counted clicks, then the
  reveal, flag and chord clicks and the wasted total; *Next target* after a
  win, *Streak* after a loss; *Win rate* — the board's standing counting
  this game, its win rate with its completed games' figure, and its longest
  streak (`personal-records`).
- The next-target row: after a win the board's best time as it stands after
  this game, to beat for a new best, and the board's current streak. The
  streak row after a loss that ended a streak: the streak ended and the
  board's longest; after any other loss, the board's best time to beat, or
  that winning sets a best when the board has none.
- The game's board code with Copy and Copy link, for won and lost games
  alike (a daily game's in its daily form, none for a game with no seed);
  Copy link writes `<origin><path>#board=<code>`, and a refused clipboard
  selects the code with a toast saying to press Ctrl+C.
- A challenge — a game started from a board code — shows the chip
  "Challenge · not eligible for bests" in place of the rank; it sets no
  best and no tile carries a badge, and its details row says it is kept in
  the history and sets no best and no rank: the board's ranking, here and
  in the Top 10, leaves challenges out. *Play again* after a challenge or a
  daily starts a fresh free-play board of the same size, mines and
  no-guess setting, never the same seed.
- The action bar: *Main menu* (with its `Esc` hint) on the left; on the
  right *Watch replay* (when the game handed over its replay —
  `replay-playback`), *Watch best* (after a win that set no new best, when
  the board's fastest-time best has a kept replay), *Records* (opens the records screen
  on this board) and *Play again* (default focus, and `Enter` or `R` on the
  keyboard). The bar stays one row: with *Watch best* present the secondary
  actions take their small size.
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
- **Results view.** One column sized to its content, arranged by
  `shared-screen-layout`: the header, the figure tiles with their
  comparisons and badges, the details, the board code, the action bar.
  Time is shown to the
  thousandth of a second, truncated rather than rounded (47 380 ms shows as
  47.380 s), while the stored time keeps its millisecond precision; this is
  the one format for every time the game shows except the in-game overlay's
  timer, which keeps whole seconds (`screen-components`), and the replay
  viewer's clock and position, which read the same truncated thousandths
  with no unit (`13.342`, `replay-playback`). 3BV/s is shown to
  two decimals; efficiency to one decimal (94.7%). A difference from a best
  shows the same precision with a sign, time truncated toward zero
  ("−1.270 s"); one that is zero at that precision reads "= best", with no
  sign and no number, and a new best whose difference is zero there reads
  "New best" alone. No precision setting exists. A stat that is not
  available shows a dash.
- **Rank panel.** In the Steam build, after a won game on a board with a
  leaderboard, the view carries `results-steam-rank`'s panel below the
  figure tiles; the flow starts it when the screen shows and stops it when
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
- **Watch best** — shown only after a win that set no new best, when the
  board's fastest-time best, as the records stand after this game, has a
  replay kept in `replay-library` and the shell has the replay viewer's route;
  asks the shell to open the viewer on that replay by id, returning to this
  screen.
- **Records** — asks the shell to route to `records-screen`, opened on this
  game's board.
- **Main menu** — asks the shell to return to the main menu.
- **Failure** — when recording fails, the screen still shows the game's own
  figures, without comparisons, a next-target or a win-rate row and with no
  rank chip, and says the result could not be saved.

## Dependencies

- `game-summary` — the summary, derived stats and board label.
- `personal-records` — recording and the comparison.
- `screen-components` — the results screen composition and its controls.
- `game-shell` — routing, the game-finished hand-off, navigation.
- No external libraries.
