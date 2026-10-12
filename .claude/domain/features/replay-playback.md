# Replay playback

Watching a game again: the replay viewer opens any replay, checks that it
still reproduces on the current build, and plays it back on the same board
view the mode uses — cells opening and flags appearing at their recorded
times, with the player's cursor moving in 2D and the camera flying in 3D —
with play, pause, speed and seeking.

## Purpose

[product-design.md § Replays](../product-design.md#replays) lets the player
watch any game back, and the results screen puts *Watch replay* one step
away ([§ Results and records](../product-design.md#results-and-records)).
A replay is the mines plus the actions, so watching one means replaying it
on the engine under the rules version it was recorded with. This feature is
that viewer and the headless check behind it, which `m3-on-steam` later
reuses to verify leaderboard replays.

## Scope and non-goals

In scope (m2-3d-joins):

- The replay simulator: a DOM-free replay of a replay on the engine, to any
  point in time, and the verification of its check values.
- The replay viewer screen for Classic 2D and 3D replays: the board drawn by
  the mode's own board view, the recorded 2D cursor drawn over it, the 3D
  camera driven by the recorded movement.
- Playback controls: play and pause, speed (0.5×, 1×, 2×, 4×), a seek bar
  marking each of the game's paused spans on its track and naming them in
  its text alternative, step to the previous or next action, and back;
  operable by mouse, keyboard and controller. Playback runs through a
  paused span at the chosen speed with the board as it was.
- A playback overlay: the replay clock, mines left, 3BV solved of the
  board's 3BV, and 3BV/s so far.
- Entry from the results screen (*Watch replay*, for the game just played)
  and from the replay library.

Non-goals:

- Watching leaderboard replays, and verifying them on submission — deferred
  to `m3-on-steam`; they reuse the simulator and the viewer unchanged.
- Keeping, listing and pinning replays — `replay-library`.
- Editing, trimming or exporting replays, and taking over play from a point
  in a replay — in no milestone's slice.
- Playing back sound effects — the viewer is silent; see Open questions.
- Campaign, daily, hexagonal, triangle and Surface replays — deferred with
  their modes.

## Architecture

Built within the recorded technical direction — the simulator as a DOM-free
ES module tested under Node, the viewer as a game-shell screen in plain DOM
over the Canvas 2D board and the three.js scene (see
[technical-direction.md](../technical-direction.md)). The viewer is a shell
screen, not a mode: it plays no game of its own, reports nothing to records,
and is never paused into hiding the board.

- **Replay decoder.** The format decoder shared with `replay-recording`:
  reads any known format version, upgrading older ones, and refuses a newer
  one. It gives each decoded replay its movement sampling interval — the
  recording constant for the replay's mode under its format version
  (`replay-recording` § Recording constants), since the header does not
  store it.
- **Replay simulator.** Builds the graph from the header, creates a game
  from the header's mine set under the recorded rule profile and rules
  version, and applies the action stream up to a requested time, returning
  the cells changed. Seeking backwards replays from the start; on large
  boards it keeps periodic snapshots of the engine state so a seek replays
  only from the nearest one.
- **Verifier.** Runs the simulator to the end, without drawing, and compares
  the result with the check values. Every replay is verified before the
  viewer plays it.
- **Playback clock.** Advances replay time at the chosen speed while
  playing, and drives the simulator and the movement interpolation once per
  frame.
- **Movement interpolation.** The recorder does not store a sample equal to
  the previous one, so a gap longer than the sampling interval is a still
  stretch. Between two stored samples, playback holds the earlier one until
  one sampling interval before the later one, then interpolates linearly to
  it; across a gap of one interval or less it interpolates throughout. The
  2D cursor cell and the 3D view mode are events and switch at their
  recorded times.
- **2D viewer.** The Classic 2D board view in a read-only configuration,
  fed by the simulator's changes, with the recorded pointer drawn as a
  cursor placed by the movement interpolation, and the recorded
  keyboard and controller cursor drawn as the focus ring only while the
  recorded player was using the cursor: a recording states the ring
  hidden with its cursor event's -1 (`replay-recording`), and a recording
  made before the ring could hide shows no ring until its first cursor
  event after its opening one. The ring at any seek position is the one
  straight playback shows there. The board fits the area between the
  overlay and the playback controls, both measured from their real sizes,
  with the same minimum tile, cap and board-scale setting as play
  (`classic-2d-square-play` § Architecture, "Board view") and no frame;
  the view follows the recorded pointer or cursor only on a board that
  does not fit, which shows the same shadows and scroll bars as in play,
  and never scrolls a board that fits.
- **3D viewer.** The 3D renderer over the simulator's 3D state view, with
  the camera placed from the recorded position and direction by the
  movement interpolation, and the recorded view mode applied. Player camera input
  is ignored. After the point where a replay's movement was capped, the
  camera holds its last recorded position.
- **Playback controls and overlay.** Composed from `screen-components`;
  the overlay reads its figures from the simulator. The replay clock is
  shown in the in-game overlay's timer format, as `screen-components`
  § Architecture (Overlay bar) defines it.

## Data and state

- **Viewer state** — the decoded replay, the simulator and its snapshots,
  replay time, speed, playing or paused, and where the viewer was opened
  from. In memory only, for as long as the screen is open.
- Nothing is persisted. The viewer never writes records or replays.

## Interfaces and contracts

- **Simulate** — `simulate(replay, upTo)` → game state and changes; pure and
  deterministic, so the same replay always plays the same way in the
  browser and in Node.
- **Verify** — `verify(replay)` → reproduces, or the first check value that
  differs. DOM-free and headless.
- **Open** — the shell routes to the viewer with a replay, or with a replay
  id the viewer fetches from `replay-library`, and the screen to return to.
- **Watch replay** — the results screen gains this action, beside *Play
  again*, for the game it shows; the replay comes from the finished game's
  hand-off, so it plays even when it could not be saved. Back returns to the
  results screen.
- **End of replay** — the final board stays, with the outcome and the
  recorded time, shown in `results-screen`'s time format
  (§ Architecture, Results view); play restarts from the beginning, Back
  leaves.
- **Failure** — a replay from a newer build, or one that names a rules
  version this build does not have, is not played and the viewer says it
  was made by a newer version; a replay that fails verification is not
  played and the viewer says it can no longer be reproduced; an unreadable
  replay says so. A 3D replay in a browser without WebGL 2 is not played —
  *Watch* stays offered in the library view — and the viewer says it needs
  WebGL 2, which this browser does not have; a 2D replay plays there as
  anywhere. A lost graphics context in the 3D viewer is reported as
  `game-shell` reports a mode's failure. In every case Back still works.

## Dependencies

- `replay-recording` — the format and its decoder.
- `replay-library` — fetching a stored replay by id.
- `cell-graph-rules-engine` and `3d-board-graph` — the engine, every frozen
  rules version, the square and box graphs and the 3D state view.
- `classic-2d-square-play` — the board view, reused read-only.
- `3d-play-flow` — the 3D scene and renderer, reused with the camera driven
  by the replay.
- `square-tile-skin` — tile painting, through the board view.
- `screen-components` — playback controls, overlay and messages, and the
  overlay's timer format for the replay clock.
- `results-screen` — hosts the *Watch replay* action, and its time format
  for the recorded time at the end of a replay.
- `game-shell` — routing, Back and controller navigation.
- No external libraries.

## Open questions

- Whether the 3D viewer lets the player detach the camera and look around
  freely while the replay plays. Blocks only that control; the viewer
  follows the recorded camera until it is settled.
- Whether playback plays the game's sound effects, derived from the actions.
  Blocks only audio in the viewer.

## Snapshot interval

Measured on the largest 3D boards (100 × 100 × 100, at the presets' mine
densities): a backward seek costs about 25 ms of restoring a snapshot and
comparing every cell, plus 4 to 6 µs for each action replayed after it, and a
snapshot holds about 2 MB. A board of 8,000 cells or more keeps a snapshot
every 2,000 actions, which holds a backward seek there to about 40 ms; a
smaller board replays from the start, within about 15 ms. A game's snapshots
stay within 64 MB: a stream long enough to pass that spaces them further
apart, evenly.
