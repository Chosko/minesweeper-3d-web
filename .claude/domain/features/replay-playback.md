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
- Playback controls: play and pause, speed (0.25×, 0.5×, 1×, 2×, 4×), a
  seek bar marking each of the game's paused spans on its track and naming
  them in its text alternative and ticking every action at its time — left
  (reveal), right (flag) and chord each in its own colour —, step to the
  previous or next action, step one frame back or on (a frame is the
  replay's movement sampling interval), *Show 3BV*, a sound toggle, the
  *Free camera* toggle in 3D, *Download* and *Open replay file*, and back;
  operable by mouse, keyboard and controller. Playback runs through a
  paused span at the chosen speed with the board as it was.
- Playback opens on the closed board: a lead-in of 500 ms of replay time
  before game time 0, through which the board stays closed, then the
  time-0 actions — the first click — play as the first action. Every click
  playback reaches shows a press ring coloured by button, in the seek bar's
  tick colours.
- A playback overlay: the replay clock, mines left, 3BV solved of the
  board's 3BV, and 3BV/s so far; the clock and the position beside the seek
  bar read seconds to the thousandth.
- Entry from the results screen (*Watch replay*, for the game just played,
  and *Watch best* beside it), from the replay library, from the Daily
  screen's *Watch replay*, and from a replay file opened in the viewer or
  the library view.
- The game's board code with Copy and Copy link, in its game form, built
  from the header's board, seed and generator version and the first reveal
  in the action stream — no replay format change; an imported replay shows
  its code too.

Non-goals:

- Watching leaderboard replays, and verifying them on submission — deferred
  to `m3-on-steam`; they reuse the simulator and the viewer unchanged.
- Keeping, listing and pinning replays — `replay-library`.
- Editing or trimming replays, and taking over play from a point in a
  replay — in no milestone's slice. Exporting a replay as a file and
  importing one are in scope; sharing is not.
- A ghost compare of two replays of the same board, playing one over the
  other — a later follow-on, not part of this slice.
- Campaign, hexagonal, triangle and Surface replays — deferred with their
  modes. Daily replays play like any replay.

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
  fed by the simulator's changes, with the recorded pointer placed by the
  movement interpolation — a core in a contrasting outline from tokens,
  visible on any tile in every theme, trailing its last 150 ms of replay
  time while playing (no trail after a seek or while paused) —, a press
  ring on each click, on the recorded pointer when it was on the acted
  cell and else on the cell's centre, and the recorded
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
  movement interpolation, and the recorded view mode applied, while *Free
  camera* is off (the default). Turning *Free camera* on (C) detaches the
  camera at its pose and lets the viewer
  fly it with the game's flight controls — the movement keys, mouse look
  under pointer lock taken by clicking the scene, the controller sticks, and
  the Camera setting's orbit — while playback runs on and the recorded view
  mode still applies; turning it off returns to the recorded camera at the
  current time. No flight key is a replay key. After the point where a
  replay's movement was capped, the recorded camera holds its last recorded
  position. Through the lead-in the camera is the first recorded sample. A
  press ring sits on the acted cell's projected screen position, the
  crosshair while *Free camera* is off. While a 3D replay shows, the game's view chips and
  toasts are hidden and do not appear; the viewer shows its own key line of
  the replay keys and their controller buttons.
- **Show 3BV.** Paints the board's 3BV partition from the engine's 3BV
  definition (`cell-graph-rules-engine`), never recomputed in the view: each
  opening — its zeros and the numbers bordering it — in one tint from a
  small cycle of token colours, neighbouring openings differing, and each
  isolated number in its own mark; over the board view in 2D, as a cell tint
  in the renderer in 3D. Off by default, held across seeks; a press ring on
  a region already solved reads as a wasted click.
- **Sound.** Off by default and kept for the session, not a saved setting.
  When on, each action playback reaches going forward plays the cue the mode
  plays for that outcome, and the end of the game plays its explosion or win
  once; seeking, stepping past actions and speeds above 2× play nothing for
  the actions they skip. The master volume and mute apply as in play.
- **Replay files.** *Download* saves the replay's bytes, byte for byte the
  stored blob or the results hand-off's, as
  `minesweeper-<board key>-<end date>.msrp`. *Open replay file* picks a
  `.msrp` file, refused over 16 MB before it is read, and verifies it like
  any other replay; an imported replay is watched, not kept.
- **Playback controls and overlay.** Composed from `screen-components`;
  the overlay reads its figures from the simulator. The replay clock and the
  position read seconds to the thousandth (`13.342`, `13.342 / 47.120`),
  not split into minutes; the seek bar's text alternative keeps the results
  time format. The seek bar ticks each action in its button's colour, ticks
  closer than a pixel merging without hiding a different kind beside them,
  and the pause spans and ticks both show. While a replay loads or fails,
  nothing of a replay shown earlier stays in the bar.

## Data and state

- **Viewer state** — the decoded replay, the simulator and its snapshots,
  replay time, speed, playing or paused, *Show 3BV*, whether *Free camera*
  is on, and where the viewer was opened from. In memory only, for as
  long as the screen is open; the sound toggle lasts the session.
- Nothing is persisted. The viewer never writes records or replays.

## Interfaces and contracts

- **Simulate** — `simulate(replay, upTo)` → game state and changes; pure and
  deterministic, so the same replay always plays the same way in the
  browser and in Node.
- **Verify** — `verify(replay)` → reproduces, or the first check value that
  differs. DOM-free and headless.
- **Open** — the shell routes to the viewer with a replay, with a replay
  id the viewer fetches from `replay-library`, or with an imported replay
  file, and the screen to return to.
- **Watch replay** — the results screen gains this action, beside *Play
  again*, for the game it shows; the replay comes from the finished game's
  hand-off, so it plays even when it could not be saved. Back returns to the
  results screen.
- **Watch best** — beside *Watch replay*, when the board's fastest-time best
  has a replay kept in the library and that best is not the game shown; it
  opens the viewer on that replay by id. Back returns to the results screen.
- **End of replay** — the final board stays, with the outcome and the
  recorded time, shown in `results-screen`'s time format
  (§ Architecture, Results view); play restarts from the start position,
  Back leaves.
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
- `screen-components` — playback controls, overlay and messages.
- `results-screen` — hosts the *Watch replay* action, and its time format
  for the recorded time at the end of a replay.
- `game-shell` — routing, Back and controller navigation.
- No external libraries.

## Open questions

None.

## Snapshot interval

Measured on the largest 3D boards (100 × 100 × 100, at the presets' mine
densities): a backward seek costs about 25 ms of restoring a snapshot and
comparing every cell, plus 4 to 6 µs for each action replayed after it, and a
snapshot holds about 2 MB. A board of 8,000 cells or more keeps a snapshot
every 2,000 actions, which holds a backward seek there to about 40 ms; a
smaller board replays from the start, within about 15 ms. A game's snapshots
stay within 64 MB: a stream long enough to pass that spaces them further
apart, evenly.
