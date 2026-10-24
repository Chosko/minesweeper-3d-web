# Replay — movement samplers

## OVERVIEW

The player's movement in a replay: the Classic 2D pointer and cursor
sampler and the 3D camera and view-mode sampler, each feeding its session's
recorder on the game clock. The format, the recorder and the replay layer's
map are in [replay.md](replay.md). DOM-free apart from the 2D sampler's
browser wiring.

| File | Responsibility |
| ---- | -------------- |
| `js/replay/sampler-2d.js` | Classic 2D pointer and cursor sampler; `mountSampler2D` browser wiring. |
| `js/replay/sampler-3d.js` | 3D camera and view-mode sampler. |

Wiring: the modes own their sampler — Classic 2D mounts `mountSampler2D`
([classic2d-mode.md](classic2d-mode.md)), the 3D adapter's `flow.sampler`
builds `createSampler3D` ([mode3d-adapter.md](mode3d-adapter.md),
[app-shell-3d.md](app-shell-3d.md)).

## PUBLIC API

Samplers
- `sampler-2d.js`: `SAMPLE_INTERVAL_MS`, `SAMPLE_STEPS`,
  `boardPoint(view, x, y, steps?)` (a canvas position in the board view's
  board units from the board's top-left corner, through the view's
  `boardPoint` — pitches on the square geometry, so the whole part is the
  cell under it in any theme — in steps of 1/`SAMPLE_STEPS`),
  `createSampler2D({session, point, interval?})`,
  `mountSampler2D({view, session, win?, interval?})`.
- `sampler-3d.js`: `SAMPLE_INTERVAL_MS`, `POSITION_STEPS`,
  `ANGLE_STEPS`, `VIEW_MODE` (`shift` 1, `space` 2, `ctrl` 4),
  `cameraSample`, `viewMode`, `createSampler3D({session, camera, controls,
  spacing, interval?, steps?})` (`spacing` a getter). A spacing change
  scales the camera with it (`FlyCamera.rescale`), so its cell-unit sample
  stays the same and adds no movement sample.

## INTERNAL PATTERNS

- **The schedule.** Samplers keep to the interval of game time across frame
  jitter; the 2D cursor and 3D view mode are offered every tick and stored
  on change.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — sampling and the measured recording constants.
- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — the 2D pointer samples in the geometry's board units.

## CROSS-REFERENCES

- [replay.md](replay.md) — the session's `recordSample` / `recordCursor` /
  `recordView` the samplers go through, the sampling intervals in
  `format.js`.
- [replay-viewers.md](replay-viewers.md) — the viewers that invert the
  samples; [classic2d-board-canvas.md](classic2d-board-canvas.md) — the
  view's `boardPoint` the 2D sampler reads.
- [classic2d-mode.md](classic2d-mode.md), [mode3d-adapter.md](mode3d-adapter.md),
  [app-shell-3d.md](app-shell-3d.md) — who mounts and ticks the samplers.
- [input-camera.md](input-camera.md) — `FlyCamera` and its `rescale`.
- [geometry.md](geometry.md) — the grid geometry whose board units the 2D samples are in.
- [testing.md](testing.md) — `tests/replay-2d.test.mjs`,
  `tests/replay-3d.test.mjs`, `dev/measure-replays.mjs`.

## WHEN TO READ THE SOURCE

- Changing a sampling interval or a quantisation step: the rule is in
  [replay.md](replay.md) § WHEN TO READ THE SOURCE.
