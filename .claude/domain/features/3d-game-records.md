# 3D game records

3D games in the shared records: a 3D board identity named by its X × Y × Z
size, mine count and no-guess setting, 3D summaries built by the same rules
as Classic 2D's, and 3D boards kept in the same personal bests, stats
history, win rate and streaks — per board and per mode, never combined with
Classic 2D.

## Purpose

The m2 exit criteria require 3D games to feed the same results screen,
personal bests and stats history as Classic 2D
([product-design.md § Results and records](../product-design.md#results-and-records)).
`game-summary` and `personal-records` were built for Classic 2D only; this
feature is their 3D extension — what "the same 3D board" means, how a 3D
game's summary is derived, and how 3D games enter the records without
disturbing the figures a 2D player tracks. 3D boards are much harder than
flat ones and have different win rates, so a 3D loss must never move a 2D
streak or win rate.

## Scope and non-goals

In scope (m2-3d-joins):

- The 3D board identity: mode 3D, X, Y and Z, mine count and the no-guess
  setting. Every exact combination is its own board, preset or custom; the
  six presets are recognised from their exact size and mine count.
- 3D display labels: "Cube Expert", "Double layer Beginner · no-guess",
  "10 × 10 × 10 · 80 mines".
- Building a summary from a 3D game: the engine's summary or counts, the
  3D session's elapsed time, its board choice, seed and generator version.
  3BV/s, efficiency and best eligibility follow `game-summary`'s rules
  unchanged.
- Recording 3D summaries in `personal-records`: the three bests per 3D
  board, the stats history, and win rate and streaks per 3D board and for
  the 3D mode as a whole.
- Mode separation: Classic 2D and 3D each keep their own overall counters,
  and no figure combines the two.
- The records format version step that adds the 3D overall counters, with
  the m1 records carried over unchanged.

Non-goals:

- Showing 3D results and 3D records — `3d-results-records-screens`.
- An overall figure across both modes — rejected: a combined win rate or
  streak would make the 2D figures meaningless to the player tracking them.
- Importing the old per-size 3D best times — `3d-play-flow` leaves them
  behind, unread and unshown.
- 3D campaign levels and the 3D daily board in records — deferred to
  `m4-campaigns` and `m5-core-complete`.
- Steam leaderboards and Steam Cloud sync of 3D records — deferred to
  `m3-on-steam`.
- Resetting or deleting records — no milestone's slice includes it.

## Architecture

Built within the recorded technical direction — DOM-free JavaScript ES
modules tested with Node's built-in runner, records persisted through the
platform layer (see [technical-direction.md](../technical-direction.md)).
It extends `game-summary` and `personal-records` in place; no new module
owns records.

- **3D board identity.** `game-summary`'s board identity gains the 3D form:
  mode 3D, width X, height Y, depth Z, mines and no-guess, with no grid
  field. Its key is derived the same way and carries the mode, so a 3D key
  never equals a 2D key; Classic 2D keys are unchanged. The label names a
  preset as "Double layer" or "Cube" followed by Beginner, Intermediate or
  Expert, recognised from the exact size and mine count `3d-play-flow`
  lists, and any other board by its size and mine count. A custom board
  that matches a preset exactly is that preset's board.
- **3D summary.** `game-summary`'s builder accepts the 3D board choice. The
  engine's counts over the box graph (`3d-board-graph`) give 3BV, 3BV
  solved and clicks by kind; 3BV/s, efficiency and best eligibility are the
  same derivations as Classic 2D's. The 3D mode's right-click on a revealed
  cell counts as whichever click kind the engine's 3D rule profile records
  it as.
- **Per-mode counters.** `personal-records`' counters become per board and
  per mode: the m1 Classic 2D overall counters stay as they are, and the 3D
  mode gets its own. Recording a summary updates its board's counters and
  its own mode's overall counters only. A win extends both current
  streaks it touches; a loss, or a 3D game abandoned after its first
  reveal, ends them.
- **Bests and comparison.** Unchanged in rule: three bests per 3D board
  from won games, strictly better replaces, a tie keeps the earlier holder,
  and every recorded 3D summary returns the comparison against the bests
  that stood before it.
- **Board listing.** The boards-played query takes a mode: for 3D, the six
  presets in the order double layer Beginner, Intermediate, Expert, then
  cube Beginner, Intermediate, Expert — each with and without no-guess —
  then custom 3D boards by last played.

## Data and state

- **Board identity, 3D** — mode, X, Y, Z, mines, no-guess. Its key indexes
  the records exactly as a 2D key does.
- **Summary record** — unchanged in fields; a 3D summary carries a 3D
  board identity.
- **Records document** — per board key as in m1, for 2D and 3D boards
  alike, plus overall counters per mode (Classic 2D and 3D). Its format
  version steps up once for the per-mode counters; loading an m1 document
  carries every board and the Classic 2D overall counters over unchanged
  and starts the 3D overall counters at zero.
- **History document** — unchanged in shape; 3D games are appended with
  their 3D board keys. It stays the source of truth, and rebuilding the
  records document from it rebuilds the per-mode counters too.

## Interfaces and contracts

- **Build** — `game-summary`'s build with a 3D board choice. Invalid 3D
  input (a dimension outside 1 to 100, mines outside 1 to cells minus one,
  counts that do not fit the board) throws a range error, as for 2D.
- **Board key** — the same 3D board fields always give the same key, in
  every build; the 3D key form is part of the stored records and changes
  only with a records format version.
- **Record** — `record(summary)` for 2D and 3D summaries alike; same
  idempotence and comparison as m1.
- **Queries** — boards played for a mode; a board's bests, counters, win
  rate and history; a mode's overall counters. There is no query across
  modes.
- **Abandoned 3D game** — a 3D game restarted, left, or ended by closing
  the window, the tab or the app after its first applied reveal is recorded
  with outcome abandoned and counts as a loss for its board and for the 3D
  mode; a closed game is recorded at the next launch from
  `personal-records`' game-in-progress marker. A 3D game left before its
  first reveal produces no summary.
- **Failure** — as `personal-records`: a refused newer records version
  leaves the stored documents untouched and runs the session with empty
  records that are not saved; an older build meeting the stepped-up format
  refuses it the same way.

## Dependencies

- `game-summary` — extended with the 3D board identity, key, label and
  builder input.
- `personal-records` — extended with per-mode counters, the mode-filtered
  board listing and the format version step.
- `3d-board-graph` — the engine's counts over the box graph and the 3D
  rule profile's click kinds.
- `3d-play-flow` — the 3D session's elapsed time, board choice, seed and
  generator version, its started, finished and abandoned reports, and its
  summary so far.
- `platform-storage` — the records format version step.
- No external libraries.

Consumed by `3d-results-records-screens`, and through `personal-records` by
`replay-library`, which pins a 3D replay that set a best exactly as a 2D
one.

## Open questions

- Which clicks efficiency counts is the engine's pinned reference
  observation from Classic 2D; 3D has no reference implementation to
  observe, so 3D efficiency applies the 2D rule to the 3D profile's
  actions. Whether the 3D right-click on a revealed cell should count as a
  click at all is undecided until the 2D rule is pinned. Blocks the 3D
  efficiency test, not the builder.
