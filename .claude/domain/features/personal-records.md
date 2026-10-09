# Personal records

The player's local record of every game: three personal bests per board —
fastest time, best 3BV/s and best efficiency — the stats history of every
game played, and the win rate and win streaks derived from it, kept through
the platform storage layer and compared against each new game.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
makes local records the competitive backbone: personal bests per board and
stats history (3BV/s and efficiency over time, win rate, streaks). The
results screen needs a comparison against the bests the moment a game ends,
and the records screen needs every board's figures. This feature is the one
owner of that data, so the two screens and later the 3D mode, replays and
Steam all read the same records.

## Scope and non-goals

In scope (m1-classic-2d):

- Recording each summary from `game-summary`: appending it to the stats
  history, updating the board's bests, win rate and streaks, and returning
  the comparison against the bests that stood before it.
- Three separate bests per board, each from won games only: fastest time,
  best 3BV/s and best efficiency. Each exact board — standard or custom,
  with or without no-guess — has its own.
- Win rate and win streaks (current and longest) per board and across
  Classic 2D as a whole. A game abandoned after its first click — restarted,
  left for the menu, or ended by closing the window, the tab or the app —
  counts as a loss and breaks the streak.
- The game-in-progress marker through which a game ended by closing the
  window, the tab or the app is recorded at the next launch.
- Queries for the records screen: the boards played, each board's bests,
  counts, win rate, streaks and history.
- Persistence through `platform-storage`, with a versioned records format.

Non-goals:

- 3D boards and 3D games in records — deferred to `m2-3d-joins`. Their old
  per-size best times stay in browser storage untouched by this feature.
- Replays and the replay library — deferred to `m2-3d-joins`.
- Steam Cloud sync of records — deferred to `m3-on-steam`, through the
  Steam implementation of `platform-storage`.
- Leaderboards and Steam ranks — deferred to `m3-on-steam`.
- Resetting or deleting records — no milestone's slice includes it.
- Campaign and daily boards in records — deferred to `m4-campaigns` and
  `m5-core-complete`.

## Architecture

Built within the recorded technical direction — local records persisted
through the platform layer, the browser implementation on the web build (see
[technical-direction.md](../technical-direction.md)). The logic is a
DOM-free ES module tested in Node; storage is reached only through
`platform-storage`.

- **Records store.** Loads the records documents once at start-up, holds
  them in memory, and is the only writer. Recording a game updates memory
  first and then saves; a failed save leaves the in-memory records correct
  for the session and is reported once.
- **Bests.** Per board, the record-holding summary for each of the three
  bests. A won game replaces a best only when strictly better; a tie keeps
  the earlier holder.
- **Counters.** Per board and for Classic 2D as a whole: games, wins,
  current streak and longest streak. A win extends the current streak; a
  loss or an abandoned game ends it. Win rate is derived from games and
  wins, never stored.
- **History.** Every recorded summary, in the order played, kept in
  compact form: enough to redraw 3BV/s and efficiency over time and to
  list recent games.
- **Comparison.** For each new summary, the standing best for each of the
  three stats before this game, the difference from it, and whether this
  game set a new best — what the results screen shows.
- **Game-in-progress marker.** From the game shell's in-progress hook, the
  store saves a started game's summary so far, outcome abandoned, at its
  first click, and saves it again at every pause and when the page is
  hidden or unloaded. Recording that game's own summary — won, lost, or
  abandoned by restart or leave — clears the marker. At start-up, a marker
  left behind by a game the window, the tab or the app closed on is
  recorded as an abandoned game — a loss that ends the streak — and
  cleared, so its time and counts are those of its last save. A game closed
  before its first click leaves no marker.

## Data and state

- **Records document** — per board key: board identity, the three bests
  (each a reference to the holding summary's id, value and date), and the
  counters; plus the Classic 2D overall counters. Small; saved after every
  game.
- **History document** — the list of compact summaries (id, board key,
  outcome, time, 3BV, 3BV solved, clicks, end date), appended after every
  game. Grows with play.
- **Game-in-progress document** — at most one summary, the started game's
  summary so far; written at its first click and at each save after, and
  cleared when the game ends.
- All three documents are registered with `platform-storage` under their
  own names and format versions.
- **Source of truth** — the history document. Bests and counters are a
  cache derived from it: when the records document is missing or corrupt
  and the history is intact, they are rebuilt from the history.
- **In memory** — both documents, for the whole session.

## Interfaces and contracts

- **Record** — `record(summary)` → comparison. Called once per summary, for
  won, lost and abandoned games alike. Recording the same summary id twice
  is a no-op that returns the original comparison.
- **Queries** — boards played (standard boards first, then custom boards by
  last played), a board's bests, counters, win rate and history; the
  Classic 2D overall counters.
- **In progress** — `begin(summary)` and `checkpoint(summary)`, called
  through the game shell's in-progress hook, save the marker; recording the
  summary with the same id clears it. Settling a leftover marker at
  start-up goes through `record`, so a marker whose game was already
  recorded is a no-op.
- **Change notification** — subscribers are told after each recorded game,
  so an open records screen stays current.
- **Availability** — when `platform-storage` reports nothing will persist,
  records still work for the session and the records screen is told so it
  can say once that records are not being saved.
- **Failure** — a refused newer records version leaves the stored
  documents untouched and runs the session with empty records that are not
  saved, so a newer build's records are never overwritten by an older one.

## Dependencies

- `game-summary` — the summary record, board identity and key, derived
  stats and best eligibility.
- `platform-storage` — document registration, load, save, availability and
  failure reports.
- No external libraries.

Consumed by `results-screen` (comparison) and `records-screen` (queries and
change notification).

## Open questions

- How large the history grows before the web build's browser storage
  limit matters, and whether old entries are then thinned. Blocks nothing
  in m1; measured once real history exists.
