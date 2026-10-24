# Generation — seeded board generation, solver, no-guess loop, worker

## OVERVIEW

Where every board's mines come from: a seeded, deterministic generator that
places mines around the first click and, with no-guess on, a logic-only
solver that accepts only boards it clears from the first click. No-guess
boards are built in a Web Worker the page talks to through a client; the game
sessions place standard boards themselves on the main thread with the same
`generate()`. DOM-free (except `client.js`'s `new Worker`), independent of
the rules engine's game state — it reuses only the cell graph and its
providers ([engine.md](engine.md)). Each module's head comment states its
full contract.

| File | Responsibility |
| --- | --- |
| `js/generation/random.js` | the seeded source (mulberry32) |
| `js/generation/placer.js` | the standard placer and `GENERATOR_VERSION` |
| `js/generation/solver.js` | the logic-only solver and its deduction stages |
| `js/generation/generate.js` | the request entry point, graph descriptions, the no-guess loop and its attempt budget |
| `js/generation/start-cell.js` | the marked start cell of a graph description |
| `js/generation/worker.js` | the module worker and its message handler |
| `js/generation/client.js` | the page-side client: one request in flight, cancellation, warm-up, progress, `pregenerate` |

Two callers need a board at a game's first reveal: the Classic 2D session
(`js/classic2d/session.js`), which hands the mine set back with the engine's
`supplyBoard`, and the 3D session (`js/mode3d/session.js`,
[mode3d-session.md](mode3d-session.md)), which plays a new game built from the mine set.
Each places a standard board with `generate()` in the click's own call and
asks its mode's client for a no-guess one; each mode keeps one client for
the page, warmed when its board choice opens, and pre-generates the next
no-guess board for the marked start cell when a no-guess game finishes.
A daily or a challenge asks for its board with the code's seed and forced
start cell instead of a fresh seed, and the shell pre-generates today's
daily boards through each mode's client when the main menu shows
(`js/shell/daily.js`); the daily seed and the board code grammar are the
records layer's ([records-board-code.md](records-board-code.md)), the generator serves them
unchanged.

## PUBLIC API

- `createSeededSource(seed)` → `{ next(), int(n) }`; `seed` an integer
  `0 .. 2^32 - 1`; `int(n)` unbiased by rejection sampling. Never reads
  `Math.random`.
- `GENERATOR_VERSION` (`1`, recorded with every board);
  `placeMines({ graph, mineCount, firstClick, source })` → ascending
  `Int32Array` over any cell graph. Only the first-click cell is excluded:
  safe first click, not always an opening — the reference rule.
- `solve({ graph, mines, firstClick })` → `{ cleared, unresolved,
  deductions: { single, subset, global } }`; `solveFrom({ graph, mineCount,
  firstClick, open, groupBudget? })` — the solver proper, learning the board
  only through `open(c)`.
- `generate({ graph, mineCount, firstClick, noGuess, seed }, { onProgress?,
  now? })` → `{ ok: true, mines, seed, generatorVersion, candidates? }` or,
  no-guess budget exhausted, `{ ok: false, reason, seed, generatorVersion,
  candidates }`; a malformed or impossible request throws `RangeError`.
  `onProgress({ candidates })` at most every `PROGRESS_INTERVAL_MS` (250);
  it never changes the result.
- `graph` is a description, `{ kind: 'square', width, height }`,
  `{ kind: 'hex', width, height }`, `{ kind: 'tri', width, height }` or
  `{ kind: 'box', X, Y, Z }`, built by `boardGraph(description)`.
  `ATTEMPT_BUDGET` — 2000 candidates.
- `startCell(description)` → the centre cell of each side (⌊side / 2⌋) as an
  index in the provider's order. A request input like any first click: no
  generator change.
- Worker protocol (structured-clone, one reply per request): page → worker
  `{ id, request }` or `{ id, warm: true }`; worker → page `{ id, progress }`
  (no-guess, before the result), `{ id, result }` (a rejected request answers
  `{ ok: false, rejected: true, reason, generatorVersion }`), `{ id, error }`
  (a bug, not a request problem). `handleMessage(message, post?, { now? })`
  is importable in Node; `onmessage` is installed only in a
  `WorkerGlobalScope`.
- `createGenerationClient({ createWorker? })` → `{ request, cancel, warm }`,
  one per mode; tests pass a fake worker. `request(req, { onProgress? })`
  resolves with the worker's result, success or failure alike, and rejects
  only when the worker itself fails. `cancel()` resolves the request in
  flight `{ ok: false, cancelled: true, reason: 'cancelled' }`. `warm()` →
  true once the worker answered its warm-up.
- `pregenerate(client, request)` → `{ cell, seed, request, promise,
  settled, result, listen(fn), discard() }`: the board a session takes over
  on its marked start cell; a worker failure resolves `{ ok: false, reason
  }`.

## INTERNAL PATTERNS

- **Determinism.** A board is a function of (request, seed,
  `GENERATOR_VERSION`): the same in the worker and in Node. The version
  covers the seeded algorithm and seeding, how `int(n)` maps outputs, the
  placer's draw order (partial Fisher–Yates over the ascending pool), the
  solver's verdicts and the no-guess loop — changing any of them changes
  boards and requires bumping `GENERATOR_VERSION`. Each provider's
  neighbour order feeds the solver too ([engine.md](engine.md)).
- **No-guess loop.** One seeded source per request; candidates are drawn
  from it one after another with `placeMines`, and the first one `solve`
  clears is the board — so the candidate sequence is part of the output. A
  standard board is the placer's first draw.
- **Attempt budget.** 2000 candidates, set from a measurement of Expert
  no-guess generation recorded beside the constant and in the feature
  document's § Attempt budget and timing. Hexagon Expert's mine count is the
  one at which every seed `dev/measure-noguess-hex.mjs` measures meets the
  budget, and `tests/generation-noguess.test.mjs` holds it to that; every
  triangle standard board, Expert included, meets it on every seed
  `dev/measure-noguess-tri.mjs` measures, and the same test file holds
  triangle Expert to it.
- **Solver soundness.** It never sees the mine set: it learns a number only
  by opening a deduced-safe cell, and runs single, subset and global stages
  in a fixed order, back to the first after every deduction (`solver.js`'s
  head comment). A frontier group over its node budget is treated as
  unconstrained: it can only lose deductions, never make a wrong one.
- **Worker is stateless.** Each reply is a function of its message alone; a
  rejected request is a result message, never a throw.
- **Client imports no generation code.** Replies are matched by `id`; a late
  reply or progress for a superseded or cancelled id is dropped. A new
  request cancels the one in flight. Cancellation terminates the worker
  rather than interrupting the synchronous `generate()`, and a worker
  `error` or `messageerror` detaches it too, so the next request or warm-up
  starts a fresh one.

## DOMAIN DEPENDENCIES

- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the request/result shape, the determinism contract, the first-click
  guarantee, timing, failure, cancel and solver-correctness contracts, and
  the attempt budget's measurement.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the cell graph, the square-grid provider and the first-click hand-off.
- [../domain/features/hexagon-grid.md](../domain/features/hexagon-grid.md)
  — the `hex` description and its Expert no-guess timing.
- [../domain/features/triangle-grid.md](../domain/features/triangle-grid.md)
  — the `tri` description and its Expert no-guess timing.
- `tests/fidelity/minesweeper-online.md` — "First-click guarantee", the
  reference rule the placer honours.

## CROSS-REFERENCES

- [engine.md](engine.md) — the cell graph and the square, hexagon and
  triangle grids generation runs over, and `supplyBoard`, which takes the mine set;
  [engine-3d.md](engine-3d.md) — the box graph.
- [classic2d-session.md](classic2d-session.md), [mode3d-session.md](mode3d-session.md) — the sessions'
  board requests, generating state and failure offer.
- [testing.md](testing.md) — `tests/generation-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing anything the generator version covers (see Determinism) — read
  the module header first; it states what forces a bump.
- Adding a deduction to the solver, or a solver-correctness failure:
  `solver.js` stages 1–3 and `enumerate`.
- Adding a graph description kind to `boardGraph`.
- Changing the attempt budget: re-measure as the comment beside
  `ATTEMPT_BUDGET` records.
- Wiring the client into a game: `client.js` for the in-flight and cancel
  semantics beyond the API above.
