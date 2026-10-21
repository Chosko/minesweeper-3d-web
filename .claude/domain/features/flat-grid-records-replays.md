# Hexagon and Triangle records and replays

Hexagon and Triangle games in the shared records and replays. Their boards
keep the three bests, stats history, win rate and streaks per board and per
mode, never combined with Classic 2D or 3D. The Records screen switches
between Classic 2D, Hexagon, Triangle and 3D. Every game is recorded as a
replay, pointer movement included, and plays back in the replay viewer on
its own grid.

## Purpose

The m2c exit criteria require a finished Hexagon or Triangle game to count
toward personal bests, stats history and replays
([product-design.md § Hexagon](../product-design.md#hexagon),
[§ Triangle](../product-design.md#triangle)). Win rate and streaks are kept
per board and per mode
([§ Results and records](../product-design.md#results-and-records)), and
each of the two is a mode of its own, so a hexagon loss must never move a
Classic 2D streak. The records and replay layers were built for the square
and box graphs. This feature extends them to the two new modes and grids,
as `3d-game-records` did for 3D.

## Scope and non-goals

In scope (m2c-flat-grids):

- **Summaries**: the shared builder over a hexagon or triangle board
  identity, with 3BV, 3BV/s, efficiency and best eligibility unchanged in
  rule.
- **Per-mode counters**: Hexagon and Triangle join the records' modes, each
  with its own overall counters and completed-game figures. A game counts
  on its board and its own mode's overall only.
- **The records format step** that adds the two modes' overall counters at
  zero, with every earlier document carried over unchanged.
- **Boards played by mode**: for each new mode, its standard boards without
  then with no-guess, then custom boards by last played. No Daily board is
  listed, since these modes have none.
- **The Records screen's mode switch**: Classic 2D, Hexagon, Triangle and
  3D, in menu order, as the canvas's Records artboards draw it. Records
  opens on the mode and board last played. The board picker, bests,
  counters, averages, history charts, Recent games, Top 10, the Replays
  tab, exports and the controller's LB / RB and LT / RT work per mode as
  they do for Classic 2D. The overall row is titled for the mode.
- **Replay recording**: the 2D recorder over the new graphs, with actions,
  pauses, the cursor stream, and pointer samples in the geometry's board
  units at Classic 2D's sampling interval. The board code goes into the
  listing.
- **The replay format version** steps up. The header's graph kind gains
  `hex` and `tri`, each sample with the 2D arity, so a build that predates
  them refuses such a replay as newer instead of failing to read it. Every
  earlier version still decodes through its own decoder and an upgrade
  step.
- **Playback**: the simulator, verifier and replay viewer over the new
  graphs, drawn by the 2D viewer through the grid's geometry: the pointer
  and trail, the cursor ring, press rings, cell motion on played frames,
  Show 3BV tints in the tile's outline, and the end line.
- **The replay library**: retention, best and hand pinning, and the
  library view, by board key as for every mode.

Non-goals:

- Hexagon and Triangle leaderboards, including the Records Leaderboards tab
  for these boards — deferred to `m6-launch`. The tab keeps its *coming
  soon* state for them.
- Achievements for these modes — deferred to `m6-launch`.
- Daily boards and their days in a row for these modes — not scheduled.
- A Surface option on the mode switch — deferred to `m6-launch`, when
  Surface is built. The canvas draws it; the switch lists built modes only.
- An overall figure across modes — rejected, as in `3d-game-records`.

## Architecture

Built within the recorded technical direction: DOM-free records and replay
modules tested with Node's runner, persisted through the platform layer,
every saved file and replay carrying a format version that each release
reads in all earlier versions (see
[technical-direction.md](../technical-direction.md)). It extends the shipped
records and replay layers in place ([records.md](../../context/records.md),
[records-store.md](../../context/records-store.md),
[records-screen.md](../../context/records-screen.md),
[replay.md](../../context/replay.md),
[replay-viewers.md](../../context/replay-viewers.md)).

- **Board identity and label** — the 2D form with mode and grid, as
  `hexagon-grid` and `triangle-grid` define them. The key format already
  carries both, so the board-key format version stays where it is. A
  standard board's label is its grid's standard name ("Expert ·
  no-guess"). Screens that show boards from several modes lead with the
  mode's name, as the results screen does for Classic 2D.
- **Records model** — its list of modes grows. Recording, comparison,
  rebuilding from history and the boards-played query all take the mode
  from the identity.
- **Records screen** — its modes table grows, and the switch is the kit's
  segmented control over it. The picker, content and controller read the
  chosen mode. The only mode-specific branch is that a mode without a daily
  board lists none.
- **Recorder and format** — the recorder takes the graph and its kind as it
  does for the square grid. The format's new version adds the two kinds and
  their sample arity; its decoder for the earlier version upgrades into it
  unchanged.
- **Viewer** — the 2D viewer mounts the board view over the replay's
  geometry, which it rebuilds from the header's graph description.

## Data and state

- **Records document** — per board key, plus overall counters per mode,
  now including `hexagon` and `triangle`. The format version steps up once
  for the two modes. History stays the source of truth, and rebuilding from
  it rebuilds the new counters.
- **History document** — unchanged in shape; new games are appended with
  their board keys.
- **Replay blob** — the new format version, whose header graph kind may be
  `hex` or `tri`. Pointer samples are in board units of that geometry.
- **Replay listing** — unchanged in fields; its board key and mode carry
  the new mode.

## Interfaces and contracts

- **Build and record** — as for every 2D board. An identity whose grid
  does not match its mode (a `hexagon` board on the `tri` grid) is a
  `RangeError`.
- **Load** — an earlier records document loads with the new counters at
  zero. A newer document is refused as today.
- **Decode** — every earlier replay version decodes and verifies. A replay
  of an unknown kind, or from a newer version, is refused with the newer
  version's reason.
- **Records screen** — `show` takes any of the four modes. An unknown mode
  opens Classic 2D.

## Dependencies

- `game-summary`, `personal-records` — identity, summary, bests, counters,
  history and the records format.
- `records-screen`, `3d-results-records-screens` — the screen and its mode
  switch.
- `replay-recording`, `replay-playback`, `replay-library` — format,
  recorder, simulator, viewer and library.
- `flat-grid-geometry` — board units and the 2D viewer's drawing.
- `hexagon-grid`, `triangle-grid` — the identities and graph descriptions.
- `flat-grid-modes` — the sessions that build the summaries and seal the
  replays.
