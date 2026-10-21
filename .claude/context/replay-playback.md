# Replay playback — simulator, verifier, clock

## OVERVIEW

The replay viewer verifies a replay ([replay.md](replay.md)) and plays it
back on the engine as a tool to study a game. This file covers the pieces
under the screen: the simulator that plays a replay to any time, the
verifier and the playback clock. The viewer screen is
[replay-viewer-screen.md](replay-viewer-screen.md); the 2D and 3D board
viewers [replay-viewers.md](replay-viewers.md).

- `js/replay/simulator.js` — a replay played on the engine to any time, with
  engine-state snapshots for backward seeks and each applied action's
  outcome; `openReplay`. Head comment is the authority for the frame.
- `js/replay/verify.js` — runs the simulator to the end, compares checks.
- `js/replay/clock.js` — replay time at the chosen speed; the lead-in.

## PUBLIC API

- `SNAPSHOT_MIN_CELLS` (8000), `SNAPSHOT_INTERVAL` (2000 actions),
  `SNAPSHOT_MEMORY` (64 MB); `REFUSAL` (`NEWER`, `UNREADABLE`);
  `ReplayRefusedError`.
- `openReplay(input)` → `{ok: true, replay}` or `{ok: false, reason,
  message}` (`NEWER` for a newer format, profile or rules version).
- `createSimulator(input, opts?)` → `{replay, grid, game, duration, length,
  seek(t), seekIndex(i), indexAt(t), outcome(i), stats()}`; `game`
  read-only, always the same object. A frame is `{time, index, phase,
  minesLeft, explodedCell, bbbv, bbbvSolved, clicks, state, game,
  changed}`, `changed` an ascending `Int32Array`. `outcome(i)` →
  `{changed, count, before, after}` once playback applied action `i`
  (null before): cells changed, how many it left flagged or revealed, the
  phase before and after. `simulate(input, upTo)`.
- `verify(input)` → `{ok: true, result: 'reproduces'}`, `{ok: false,
  result: 'differs', field, expected, actual}` or `{ok: false, result:
  'refused', reason, message}`.
- `SPEEDS` (`[0.25, 0.5, 1, 2, 4]`), `DEFAULT_SPEED`, `LEAD_IN_MS` (500);
  `createPlaybackClock({duration, speed?})`.

## INTERNAL PATTERNS

- **Seeking.** Forwards, the simulator applies the actions in between;
  backwards, it restores the nearest engine-state snapshot (`snapshot()` /
  `restore()`, [engine-rules.md](engine-rules.md)) and replays from there. The start is
  always kept; a board of `SNAPSHOT_MIN_CELLS` or more keeps one every
  `SNAPSHOT_INTERVAL` actions, spread further when they would pass
  `SNAPSHOT_MEMORY`. The verifier keeps only the start.
- **The cell look.** The simulator tracks each cell's drawn look, so
  `changed` holds exactly the cells to redraw; after a restore it compares
  every cell.
- **The clock.** It runs over the duration plus `LEAD_IN_MS`; game time is
  the clock's time less the lead-in, so the start position sits at game
  time -500 ([replay-viewer-screen.md](replay-viewer-screen.md) § The
  timeline).

## DOMAIN DEPENDENCIES

- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — simulator, verifier, failure contracts, the measured snapshot interval.

## CROSS-REFERENCES

- [replay-viewer-screen.md](replay-viewer-screen.md) — the screen that
  verifies, seeks and clocks a replay.
- [replay.md](replay.md) — the format, decoder and sampling intervals.
- [engine-rules.md](engine-rules.md) — `createGameWithMines`, `snapshot()` /
  `restore()`.
- [testing.md](testing.md) — `tests/replay-simulator.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing seeking, the snapshot constants or what a frame reports: the head
  comment of `simulator.js` and `goTo` / `changedCells`; the constants come
  from feature replay-playback § Snapshot interval.
- Changing a speed or the lead-in: `clock.js`.
