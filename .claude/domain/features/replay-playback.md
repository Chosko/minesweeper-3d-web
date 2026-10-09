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
- Playback controls: play and pause, speed (0.5×, 1×, 2×, 4×), a seek bar,
  step to the previous or next action, and back; operable by mouse,
  keyboard and controller.
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
  one.
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
- **2D viewer.** The Classic 2D board view in a read-only configuration,
  fed by the simulator's changes, with the recorded pointer drawn as a
  cursor between samples by linear interpolation, and the recorded
  keyboard and controller cursor drawn as the focus ring.
- **3D viewer.** The 3D renderer over the simulator's 3D state view, with
  the camera placed from the recorded position and direction, interpolated
  between samples, and the recorded view mode applied. Player camera input
  is ignored. After the point where a replay's movement was capped, the
  camera holds its last recorded position.
- **Playback controls and overlay.** Composed from `screen-components`;
  the overlay reads its figures from the simulator.

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
  recorded time; play restarts from the beginning, Back leaves.
- **Failure** — a replay from a newer build, or one that names a rules
  version this build does not have, is not played and the viewer says it
  was made by a newer version; a replay that fails verification is not
  played and the viewer says it can no longer be reproduced; an unreadable
  replay says so. A lost graphics context in the 3D viewer is reported as
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
- `screen-components` — playback controls, overlay and messages.
- `results-screen` — hosts the *Watch replay* action.
- `game-shell` — routing, Back and controller navigation.
- No external libraries.

## Open questions

- Whether the 3D viewer lets the player detach the camera and look around
  freely while the replay plays. Blocks only that control; the viewer
  follows the recorded camera until it is settled.
- Whether playback plays the game's sound effects, derived from the actions.
  Blocks only audio in the viewer.
- How often the simulator snapshots a large 3D board so seeking stays quick
  without holding too much memory. Set by measurement on the largest boards.
