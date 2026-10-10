# Replay recording

How every finished Classic 2D and 3D game becomes a replay: while the player
plays, a recorder captures each action with its time and the player's
movement — the mouse cursor in 2D, the camera in 3D — and at the end of the
game seals them, with the board's mines and the rules version it was played
under, into one compact, versioned replay that plays back the same way after
any game update.

## Purpose

[product-design.md § Replays](../product-design.md#replays) records every
finished game, and the m2 exit criteria require every 2D and 3D game to be
recorded in a form that survives game updates. Enthusiasts judge a fast game
as much by the movement between clicks as by the clicks, so a replay carries
the movement too, as the replay viewers they already use do. This feature
owns the replay format and its capture during live play; watching is
`replay-playback`, keeping is `replay-library`.

## Scope and non-goals

In scope (m2-3d-joins):

- The replay format: a header describing the board, its mines and the rules
  it was played under, an action stream, a movement stream, and check values
  that prove a replay still reproduces.
- Capture in Classic 2D on the square grid and in the 3D mode, for every
  game that ends in play — won, lost, or abandoned by restart or leave after
  its first click. A game ended by closing the window, the tab or the app
  has no replay: its recording is lost with the page, and only its summary
  is recorded at the next launch.
- Movement capture: the 2D pointer position and the keyboard and controller
  cell cursor, sampled about 20 times a second; the 3D camera position, view
  direction and view mode, sampled about 10 times a second.
- A size limit on the movement stream, so a very long 3D game cannot produce
  an unbounded replay.
- Sealing the replay at the end of the game and handing it on with the
  game's summary.

Non-goals:

- Attaching replays to leaderboard entries, and uploading or downloading
  them — deferred to `m3-on-steam`.
- Replays of campaign levels and daily boards — deferred to `m4-campaigns`
  and `m5-core-complete`; the header's board description is what they will
  extend.
- Hexagonal, triangle and Surface boards — deferred to `m6-launch`; the
  header names the graph kind, so they add a kind rather than a format.
- Recording press feedback, sounds or effects. Playback derives them from
  the actions.
- Exporting a replay to a file or sharing it — in no milestone's slice.

## Architecture

Built within the recorded technical direction — DOM-free JavaScript ES
modules run unchanged under Node's test runner, beside the rules engine (see
[technical-direction.md](../technical-direction.md)). Replays store the
mines and the actions and are replayed on the engine, so the engine keeps
every shipped rules version (`cell-graph-rules-engine`); nothing in a replay
depends on the generator.

- **Recorder.** One per game session, created by the mode's session when the
  board opens and discarded with it. It is told about each action the
  session hands to the engine and about each movement sample, and keeps them
  in growable typed buffers so recording never allocates per event. It
  follows the game clock: its time is the game timer's elapsed time, so
  paused time is absent from a replay, as it is from the timer.
- **Movement samplers.** Each mode provides one, reading its own input state
  on the recorder's schedule:
  - **2D** — the pointer position in board coordinates (cell units,
    quantised to a fraction of a cell), so a replay plays at any window size
    and zoom, or "off the board"; and the keyboard and controller cursor's
    cell whenever it moves.
  - **3D** — the camera position, in cell units, and its yaw and pitch,
    quantised; and the view mode (Shift, Space, Ctrl) whenever it changes,
    since it decides what the player could see.
  A sample equal to the previous one is not stored.
- **Encoder.** Writes the sealed replay as one compact binary blob: a
  versioned header, then the action and movement streams as delta-encoded
  times and values. Its counterpart decoder is shared with
  `replay-playback`. Each format version has a decoder that every later
  release keeps, and an older replay is upgraded on read, as
  [technical-direction.md](../technical-direction.md) requires of every
  saved file.
- **Sealer.** At a win, a loss or an abandon, closes the streams, computes
  the check values from the engine's final state, stamps the replay with the
  summary's id, and hands it on.

The mode sessions (`classic-2d-square-play`, `3d-play-flow`) are extended:
each creates a recorder, feeds it, and reports the sealed replay beside the
summary in the game shell's `game finished` and `game abandoned` reports.

## Data and state

- **Header** — format version; replay id (the summary's id); mode and graph
  description (square: width, height; box: X, Y, Z); the board identity from
  `game-summary`; the mine set as cell indices; the rule profile and its
  rules version; the seed and generator version, for reference only; the
  date the game ended.
- **Action stream** — per action: time (ms on the game clock), kind (reveal,
  toggle flag, chord) and cell index. Every action the session hands to the
  engine while the game accepts actions is recorded, including those that
  change nothing, because wasted clicks count in efficiency. Actions before
  the timer starts — the first reveal, and in 3D any flags placed before it
  — carry time 0 and keep their order.
- **Movement stream** — per sample: time and the mode's sample values, plus
  the 2D cursor-cell and 3D view-mode change events.
- **Check values** — outcome, elapsed time, 3BV, 3BV solved, click counts by
  kind, and a digest of the final per-cell state (revealed, flagged, hidden).
- **Size** — a 2D Expert game is a few kilobytes; a 3D game about 100 KB per
  20 minutes. The movement stream stops growing at a fixed cap (of the order
  of 2 MB); the rest of the game is recorded as actions only and the header
  marks where movement ended. Actions are never dropped.
- In memory only while the game runs; a sealed replay is persisted by
  `replay-library`.

## Interfaces and contracts

- **Start** — `startRecording(header fields known at board open)`; the mine
  set, seed and generator version are added when the board arrives.
- **Feed** — `action(kind, cell, time)` from the session at the point it
  calls the engine; `sample(values, time)` from the mode's sampler while the
  game is started, unpaused and unfinished.
- **Seal** — `seal(summary, engine final state)` → the replay blob and its
  listing fields (id, board key, mode, outcome, time, 3BV/s, efficiency, end
  date, size). Sealing twice returns the same replay.
- **Mode contract extension** — `game finished(summary, replay)` and
  `game abandoned(summary, replay)`. A game left before its first click
  reports nothing and records nothing.
- **Determinism** — applying the action stream to a game created from the
  header's graph, mine set, profile and rules version reproduces the check
  values exactly. A Node test asserts this for recorded 2D and 3D games,
  including a loss, an abandon and a game with wasted clicks.
- **Failure** — a recorder that fails (an encoding error, the movement cap)
  never interrupts play: on an error the replay is dropped and the failure
  reported once; the game's summary and records are unaffected.

## Dependencies

- `cell-graph-rules-engine` — rule profiles with frozen, versioned rules,
  the game's final state and counts.
- `game-summary` — the summary id the replay is keyed by, the board
  identity and the listing stats.
- `classic-2d-square-play` and `3d-play-flow` — the sessions that own a
  recorder and the movement samplers.
- `3d-board-graph` — the box graph description and the 3D profile's hidden
  state, part of the final-state digest.
- `game-shell` — the mode contract the sealed replay travels on.
- No external libraries.

Consumed by `replay-library`, which keeps the sealed replay, and
`replay-playback`, which decodes it.

## Recording constants

Set by measuring simulated games played through the mode sessions
(`dev/measure-replays.mjs`):

- **2D sampling** — the pointer every 50 ms of game time, in 1/64 of a
  cell.
- **3D sampling** — the camera every 100 ms of game time: its position in
  1/16 of a cell, its yaw and pitch in 1/8192 of a turn.
- **Movement cap** — 2 MB (2 × 1024 × 1024 bytes) of encoded movement,
  about 9 hours of the busiest measured 3D game.
- **Compression** — none: format version 1 stores the blob as encoded. The
  platform's compression stream saves 20 to 40 % on replays of a few to a
  few tens of kilobytes, and would make sealing and decoding asynchronous.
