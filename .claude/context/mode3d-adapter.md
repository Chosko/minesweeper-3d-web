# 3D mode — mode adapter

## OVERVIEW

The adapter puts the 3D game session ([mode3d-session.md](mode3d-session.md))
behind the game shell's mode contract: the end delay, the summaries, the
sealed replays, the movement sampler and pre-generation for Play again.
Board choice and the file table are in [mode3d.md](mode3d.md).

| File | Responsibility |
| ---- | -------------- |
| `js/shell/mode-3d.js` | The adapter (`create3DMode`), `endDelayMs` and `waveStepS`. DOM-free; imports `buildSummary`, `MODE_3D`, `pregenerate` and `startCell`. |

## PUBLIC API

`js/shell/mode-3d.js`
- `create3DMode(flow, report)` — the contract over `flow` (`openBoardChoice`,
  `start(choice, pregenerated)` → session, `pause(note)`, `resume(source)`,
  `restart(source, pregenerated, forced?)` → session, `leave`, `contextLost`,
  `client`, optional `randomSeed`, optional `sampler(session)` → `{tick(),
  destroy?()}` (without it no movement is recorded), optional `release()`
  (releases pointer lock before the results screen), optional `clock`
  `{setTimeout, clearTimeout}`); `failureScreen: 'ctxlost'`; plus
  `contextLost()`, `replay(summary)`, `tick()` (drives the sampler, every
  frame), `ending`, `finishNow()`, `cancelGeneration()` and `forced`. A
  daily or a challenge starts with `start({ ...board, forced, pregenerated?
  })`, Learn 3D with `learnChoice()` (`forced.learn`, whose forced start
  every restart keeps; `learn` is true while it is the game): the board pre-generated after a game is discarded, a restart keeps
  `forced` until the game started, and the summaries carry the Daily board
  and `daily`, or `challenge`, and `startCell`.
- `endDelayMs({X, Y, Z})` — how long the end effect plays before the game
  is reported finished, win and loss alike: grows with the board's diagonal
  so the loss wave from any cube reaches the farthest cell and its reveal
  (`WAVE_CELL_S`) completes, between `END_DELAY_MS` and
  `END_DELAY_MAX_MS`; `waveStepS({X, Y, Z})` — the wave's seconds
  per cell of distance the renderer paces it with, derived from it.
  `WAVE_STEP_MAX_S`, `END_MARGIN_S`.

## INTERNAL PATTERNS

- **The adapter** listens only to the session it holds. At `started` it
  reports `started` and `canPause(true)`. At `finished` — after the
  listeners `js/main.js` added have started the end effect — it builds the
  summary (`buildSummary` over the elapsed time and pause spans), reports
  `canPause(false)` and runs the end delay (`ending`): a `pause()` is
  ignored, and after `endDelayMs(session.board)` on `flow.clock` — frames drawn or not —
  it calls `flow.release()` and reports `finished(summary, replay)` once.
  `restart` and `leave` cancel the delay; `js/main.js` offers neither while
  `ending`, and `finishNow()` reports at once, so a game in its end delay
  is never reported abandoned. `summary()` is the started, unfinished
  game's summary (outcome `abandoned`), from which with `replay(summary)`
  the host reports `abandoned`; before the first applied reveal there is
  none. Summaries carry the 3D board identity — mode `3d`, X, Y, Z as
  width, height, depth ([records.md](records.md)) — null throughout on a
  fixed board (the debug hook's, Learn 3D's), which has no seed. A lost graphics context — at `start` or
  through `contextLost()` — reports `failed` and leaves the session; during
  the end delay the game is reported finished first.
- **Pre-generation.** A finished no-guess game with a seed asks
  `flow.client` for the next box (`pregenerate`, its `startCell`, a fresh
  seed); the next `start` with the same board, or `restart`, hands it to
  `flow.start` / `flow.restart`; another board, `leave` and
  `contextLost()` discard it.
- **No old best times.** The mode keeps no best times of its own; the
  rule for the `ms3d.best.*` keys is [app-shell.md](app-shell.md)'s.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the mode contract's reports, pause and failure.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the end delay, input during it and the finished report after it.
- [../domain/features/3d-game-records.md](../domain/features/3d-game-records.md)
  — the 3D summaries and the board identity they carry.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  mode contract.

## CROSS-REFERENCES

- [mode3d-session.md](mode3d-session.md) — the session the adapter holds.
- [app-shell-3d.md](app-shell-3d.md) — `FLOW_3D` in `js/main.js`;
  [app-shell.md](app-shell.md) — the mode host.
- [rendering-effects.md](rendering-effects.md) — the end effect paced by
  `endDelayMs` and `waveStepS`.
- [replay-samplers.md](replay-samplers.md) — the camera sampler
  `flow.sampler` builds.
- [records.md](records.md) — `buildSummary`, `MODE_3D` and the 3D identity.
- [testing.md](testing.md) — `tests/shell-mode-3d.test.mjs`,
  `tests/mode3d-end.test.mjs`, `tests/records-summary-3d.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing what the 3D mode reports to the shell or the end delay
  (`create3DMode`, `endDelayMs` and the head comment in
  `js/shell/mode-3d.js`).
