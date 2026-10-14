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
  generator version, the first click's cell, the date it ended, and a
  unique id; a daily game's adds its daily date and a challenge's its
  challenge flag, so every summary carries what its board code needs.
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
  standard board. A daily game's identity carries the daily flag: the
  mode's Daily board, a board of its own keyed `daily:<board key>` and
  labelled "Daily · Expert · no-guess" or "Daily · 8 × 8 × 8 · 40 mines ·
  no-guess" (a 3D board by its dimensions, as its code names it).
- **Board code.** One DOM-free module encodes and parses the text that
  rebuilds a board exactly from its board, seed, start cell and generator
  version, uppercase on output and read case-insensitively with
  surrounding whitespace ignored. The board token is `B`, `I` or `E` for
  the three 2D standard boards, `<w>X<h>M<mines>` for any other 2D board
  and `<x>X<y>X<z>M<mines>` for every 3D board (presets included, so a
  preset re-tune changes no code), with a trailing `N` when no-guess. A
  daily code is `<board>-<YYYYMMDD>-<check>` (seed: the 32-bit FNV-1a hash
  of `daily-<YYYYMMDD>-<token>`; start: the marked start cell); a game code
  is `<board>-<seed as 8 hex digits>-<start cell in decimal>-<check>`. The
  check is the generator version in decimal followed by 3 hex digits, the
  low 12 bits of the FNV-1a hash of `<board>-<payload>[-<start>]-<version>`,
  so a typo is caught before anything is generated. Parsing never throws:
  it refuses malformed text or a failed check, a board outside its mode's
  custom limits, a 3D no-guess board the 3D board choice refuses, a start
  cell outside the board, and any generator version but this build's — a
  newer one says to reload the page, an older one that the code can no
  longer be rebuilt — so a code never opens a board other than the one it
  names. The grammar, the hash and the daily seed are frozen; a later
  change is a new code shape. A code shown for a game carries that game's
  recorded generator version, a daily game's in its daily form.
- **Summary builder.** Takes the engine's game summary (or, for an
  abandoned game or a started game's summary so far, the engine's counts at
  that moment), the
  elapsed time in milliseconds, the game's pause spans, the board choice,
  the seed and generator version, and returns one summary record with the
  derived stats filled in.
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
  win rate, streaks and history, never in bests. A challenge — a game
  started from a board code — is never eligible (`personal-records`).

## Data and state

- **Summary record** — id, board identity, outcome, elapsed time (ms), the
  pause count and total paused time (ms), 3BV, 3BV solved, click counts by
  kind, 3BV/s, efficiency, seed, generator version, start cell (the first
  click's), end date, and for a daily its `daily` date (YYYYMMDD), for a
  challenge `challenge: true`. The game clock
  runs through pauses, so the elapsed time includes the paused time, which
  is never more than it. Plain data, serialisable as it is.
- **Board identity** — mode, grid, width, height, mines, no-guess, and the
  daily flag on a Daily board only. Its key is the field records are
  indexed by.
- Nothing persisted here. A summary is handed on once and persisted by
  `personal-records`.

## Interfaces and contracts

- **Build** — summary from engine summary or counts, elapsed time, pause
  spans, board choice, seed and generator version, and outcome. Invalid input (negative
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
