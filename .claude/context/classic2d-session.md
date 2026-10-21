# Classic 2D — game session and timer

## OVERVIEW

`js/classic2d/session.js` owns one Classic 2D game from closed board to
result: the first click's board, the slow-answer "generating" state and its
progress, the failure offer, actions, pause, win or loss, restart and leave
with their summaries and replays, the game's replay recorder, and the game
clock. DOM-free. The 3D session reuses its timer, offers and first-click
flow ([mode3d-session.md](mode3d-session.md)). The area overview is
[classic2d.md](classic2d.md).

## PUBLIC API

- `SESSION_STATE` (`ready`, `generating`, `playing`, `failed`, `won`,
  `lost`, `left`), `FAILURE_OFFERS` (`retry`, `standard`),
  `GENERATING_DELAY_MS` (200), `SESSION_EVENTS` (`generating`, `started`,
  `changed`, `failed`, `finished`, `abandoned`, `mark`, `refused`),
  `START_HINT` ('Start on the marked cell').
- `createTimer({now})` → `{start, pause, resume, stop, elapsedMs(),
  seconds(), pauses(until?, count?), started, running, stopped, paused}` —
  `pauses` the pause spans `[{start, end}]` begun by `until`, at most
  `count`, the open one clipped to `until`.
- `createSession({choice, client, clock?, randomSeed?, generatingDelayMs?,
  place?, pregenerated?, fixed?})` → `{state, choice, fixed, identity, setup, game, seed,
  generatorVersion, generatingShown, paused, failure, minesLeft,
  markedCell, progress, elapsedMs(), seconds(), pauses(), clicks(),
  on(type, fn) → off, reveal(c), toggleFlag(c), chord(c), retry(),
  playStandard(), cancel(), pause(), resume(), restart(), leave(),
  summary(), recording, recordSample(values), recordCursor(cell),
  replay(summary?)}` — `client` the generation client `{request, cancel}`,
  asked for no-guess boards only; `place` the standard placement
  (`generate` by default); `pregenerated` a `pregenerate()` board
  ([generation.md](generation.md)); `clock` `{now, setTimeout,
  clearTimeout}`; `progress` `{candidates, seconds}` while generating, else
  null; `clicks()` the engine's counted clicks, wasted included. `finished`
  and `abandoned` carry `{summary, replay}`; `replay(summary = summary())`
  is `{blob, listing}` or null ([replay.md](replay.md)). `fixed` `{startCell,
  seed, daily?, challenge?}` — a daily or a challenge — forces the start
  cell: marked until the first reveal, a reveal elsewhere refused
  (`refused` `{cell, hint}`, nothing recorded), the board the pre-generated
  one or the one generated for that cell with that seed, a failure offering
  `[]`; summaries carry `startCell` always and `daily` (with the Daily board
  identity) or `challenge`; `restart()` once the board arrived drops it.
  The module head comment is the contract.

## INTERNAL PATTERNS

- **First click.** A session opens a closed board (`ready`). Before the
  first reveal a flag or chord goes straight to the engine, with no request
  and no event. The first reveal of a standard board places it at once
  with `place` and a fresh seed, in the same call; on a no-guess board it
  sends the board request for its cell (`generating`), and actions are
  ignored until the answer. A pre-generated board marks its start cell
  (`markedCell`, `mark` events) until the first reveal: on that cell it is
  taken over (at once when arrived, else waited for, asked afresh when it
  failed); anywhere else it is discarded.
- **Generating and failure.** The "generating" event shows only after
  `GENERATING_DELAY_MS` and hides when the answer arrives. A failure — no
  no-guess board found, or the worker failing — emits `failed` with both
  offers and its `count` of failures in a row; the timer never starts.
  `retry` asks again with a new seed; `playStandard` — after a failure or
  while generating, which cancels the request — places the same size with
  no-guess off for the same first cell. `cancel` while generating goes back
  to `ready` on the same closed board, with a fresh recorder and nothing
  reported. A request token drops a late answer after `cancel`, `restart`
  or `leave`, which all cancel the client.
- **Board arrival and end.** A board starts the timer and emits `started`
  then `changed` (`playing`). Win or loss stops the timer and emits
  `finished`; `restart` and `leave` after the first click and before the
  end emit `abandoned` first. Every summary is `buildSummary`
  ([records.md](records.md)) over the engine's counts, the elapsed time and
  pause spans, the board identity, seed, generator version and the game's
  id — one `crypto.randomUUID()` drawn when the board arrives, so the
  in-progress and final summaries name the same game.
- **Recording.** Each closed board opens a recorder (`startRecording`,
  [replay.md](replay.md)); `restart` and `leave` discard it after sealing
  the abandoned game's replay. The first reveal is recorded at time 0 (a
  flag or chord before it changes nothing and is not recorded), every later
  action at the timer's elapsed time, wasted ones included. Mines, seed and
  generator version are added when the board arrives; a board played
  standard after a failure starts a new recording. `recording` is true
  while the game is started, unpaused and unfinished, and only then do
  `recordSample` and `recordCursor` record.
- **Timer.** The game clock starts when the board is ready, runs through
  pauses and keeps its time once stopped; `seconds()` is whole seconds for
  the overlay, `elapsedMs()` whole milliseconds for the result. A pause is
  marked from `pause()` to `resume()`, or to `stop()` when the game ends
  paused; one begun while generating counts from the start, and one ended
  before it does not count.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the game session, timer and failure offer.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — what the 2D session records.

## CROSS-REFERENCES

- [classic2d.md](classic2d.md) — `boardSetup`, the choice the session plays.
- [classic2d-mode.md](classic2d-mode.md) — the mode that holds the session.
- [engine-rules.md](engine-rules.md) — the game the session holds and its `changed`
  lists.
- [generation.md](generation.md) — the client, request and `pregenerate`.
- [records.md](records.md) — `buildSummary` and the board identity.
- [replay.md](replay.md) — the recorder the session feeds and seals.
- [testing.md](testing.md) — `tests/classic2d-session.test.mjs` the timer
  and session; `tests/replay-2d.test.mjs` the session's recording.

## WHEN TO READ THE SOURCE

- Changing a session state, event or the first-click flow (`createSession`
  and its head comment in `session.js`).
