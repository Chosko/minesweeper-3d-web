# Game summary

The one description of a played game that every records consumer reads:
which board it was played on, how it ended, how long it took, and the stats
enthusiasts track — 3BV, 3BV/s and efficiency — derived the same way for
every game, whether it was won, lost or abandoned after the first click.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
promises time, 3BV, 3BV/s and efficiency for every game, and personal bests
per board. Those numbers are only comparable if they are derived once, by one
rule, from the engine's counts and the mode's elapsed time, and if "the same
board" means the same thing to the results screen, the personal records and
later the replays and leaderboards. This feature is that shared vocabulary:
the board identity, the summary record and the derived stats. It holds no
state and draws nothing.

## Scope and non-goals

In scope (m1-classic-2d):

- The board identity: mode, grid, width, height, mine count and the
  no-guess setting. Every exact combination is its own board, standard or
  custom.
- The summary record of one game: board identity, outcome (won, lost or
  abandoned), elapsed time, 3BV, 3BV solved, click counts, seed and
  generator version, the date it ended, and a unique id.
- The derived stats: 3BV/s and efficiency, with their rules for won, lost
  and abandoned games, and which games are eligible for a personal best.
- Building a summary from the Classic 2D square game: the engine's summary
  or its counts, plus the session's elapsed time and board choice.

Non-goals:

- Persisting summaries, personal bests, win rate and streaks —
  `personal-records`.
- Showing anything — `results-screen` and `records-screen`.
- Counting clicks and computing 3BV — `cell-graph-rules-engine`, whose
  fidelity tests pin what a click is.
- 3D board identities and 3D summaries — `m2-3d-joins`.
- Steam ranks and leaderboard eligibility — `m3-on-steam`.
- Replay data — `m2-3d-joins`; a replay links to its summary by the
  summary's id.

## Architecture

Built within the recorded technical direction — a DOM-free JavaScript ES
module tested with Node's built-in runner, beside the rules engine (see
[technical-direction.md](../technical-direction.md)).

- **Board identity.** A small value naming one board, with a canonical
  string key derived from its fields so records can be stored and looked up
  by it, and a display label ("Expert", "Expert · no-guess",
  "20 × 12 · 50 mines"). Beginner, Intermediate and Expert are recognised
  from their exact dimensions and mine count, never stored as a separate
  name, so a custom board that happens to match a standard size is that
  standard board.
- **Summary builder.** Takes the engine's game summary (or, for an
  abandoned game or a started game's summary so far, the engine's counts at
  that moment), the
  elapsed time in milliseconds, the board choice, the seed and generator
  version, and returns one summary record with the derived stats filled in.
- **Stat derivations.** One function per derived stat, shared by every
  caller:
  - **3BV/s** — 3BV solved divided by elapsed seconds. On a win, 3BV solved
    equals the board's 3BV.
  - **Efficiency** — 3BV solved divided by the click count, as a
    percentage, with the clicks that count decided by the engine's pinned
    reference rule.
  - A stat whose divisor is zero is reported as not available, never as
    zero or infinity.
- **Best eligibility.** Only won games are eligible for any personal best,
  and only stats that are available. Lost and abandoned games count in
  win rate, streaks and history, never in bests.

## Data and state

- **Summary record** — id, board identity, outcome, elapsed time (ms), 3BV,
  3BV solved, click counts by kind, 3BV/s, efficiency, seed, generator
  version, end date. Plain data, serialisable as it is.
- **Board identity** — mode, grid, width, height, mines, no-guess. Its key
  is the field records are indexed by.
- Nothing persisted here. A summary is handed on once and persisted by
  `personal-records`.

## Interfaces and contracts

- **Build** — summary from engine summary or counts, elapsed time, board
  choice, seed and generator version, and outcome. Invalid input (negative
  time, counts that do not fit the board) throws a range error rather than
  producing a summary that would poison the records.
- **Board key** — the same board fields always give the same key, in every
  build; the key format is part of the stored records and changes only with
  a records format version.
- **Derived stats** — pure functions of the summary's own fields, so any
  consumer can recompute them and get the same answer.
- **Abandoned game** — a game that had its first click and was then
  restarted, left, or ended by closing the window, the tab or the app
  before a win or loss is summarised with outcome abandoned. A game left
  before its first click produces no summary.

## Dependencies

- `cell-graph-rules-engine` — the game summary and counts (3BV, 3BV solved,
  clicks by kind).
- `classic-2d-square-play` — supplies the elapsed time, board choice, seed
  and generator version and calls the builder at the end of a game.
- No external libraries.

Consumed by `personal-records`, `results-screen` and `records-screen`.
