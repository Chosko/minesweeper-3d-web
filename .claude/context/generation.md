# Generation — seeded board generation, solver, no-guess loop, worker

## OVERVIEW

Where every Classic 2D board's mines come from: a seeded, deterministic
generator that places mines around the first click and, with no-guess on,
a logic-only solver that accepts only boards it clears from the first
click. All of it runs in a Web Worker; the page talks to it through a
client. DOM-free (except `client.js`'s `new Worker`), independent of
`js/logic.js` and of the rules engine's game state — it reuses only the cell
graph and the square-grid provider ([engine.md](engine.md)).

- `js/generation/random.js` — the seeded source (mulberry32).
- `js/generation/placer.js` — the standard placer and `GENERATOR_VERSION`.
- `js/generation/solver.js` — the logic-only solver.
- `js/generation/generate.js` — the request entry point, the no-guess loop
  and its attempt budget.
- `js/generation/worker.js` — the module worker and its message handler.
- `js/generation/client.js` — the page-side client: one request in flight,
  cancellation.

Its caller is the Classic 2D game session (`js/classic2d/session.js`), which
asks for a board when the engine's first reveal returns "board needed at c"
and hands the mine set back with the engine's `supplyBoard`.

## PUBLIC API

Seeded source (`js/generation/random.js`)
- `createSeededSource(seed)` → frozen `{ next(), int(n) }`. `seed` an
  integer `0 .. 2^32 - 1`, else `RangeError`. `next()` the next 32-bit
  output; `int(n)` an unbiased `0 .. n - 1` by rejection sampling
  (`1 <= n <= 2^32`). Never reads `Math.random`.

Placer (`js/generation/placer.js`)
- `GENERATOR_VERSION` — `1`; recorded with every board.
- `placeMines({ graph, mineCount, firstClick, source })` → ascending
  `Int32Array` of mine cells over any cell graph. The first-click cell alone
  is excluded; its neighbours may hold mines (safe first click, not always
  an opening — the reference rule). Draw order: pool = every cell but the
  first click, ascending; partial Fisher–Yates swapping `pool[i]` with
  `pool[i + source.int(pool.length - i)]` for `i < mineCount`; the first
  `mineCount` entries, sorted. `RangeError` on a malformed request, and on
  an impossible one (`mineCount > count - 1`) with the reason.

Solver (`js/generation/solver.js`)
- `solve({ graph, mines, firstClick })` → `{ cleared, unresolved,
  deductions }`. `unresolved` an ascending `Int32Array` of cells neither
  opened nor deduced mines (empty when cleared); `deductions` `{ single,
  subset, global }`, cells resolved per stage (first click not counted).
  `RangeError` on a malformed request or a mine on the first click.
- `solveFrom({ graph, mineCount, firstClick, open, groupBudget? })` — the
  solver proper, with the board behind `open(c)` → the number of a safe
  cell; called only on deduced-safe cells, each at most once. `groupBudget`
  overrides the global stage's per-group enumeration budget (default
  200 000 nodes).

Generate (`js/generation/generate.js`)
- `generate({ graph, mineCount, firstClick, noGuess, seed })`. `graph` is a
  description: `{ kind: 'square', width, height }` (the only kind; the box
  graph arrives with the 3D mode). `noGuess` must be a boolean.
  - success `{ ok: true, mines, seed, generatorVersion }`, plus
    `candidates` (tried, the accepted one included) for no-guess;
  - budget exhausted (no-guess only) `{ ok: false, reason, seed,
    generatorVersion, candidates: ATTEMPT_BUDGET }`;
  - malformed or impossible request: throws `RangeError`.
- `boardGraph(description)` → the cell graph of a description.
- `ATTEMPT_BUDGET` — `2000` candidates.

Worker protocol (`js/generation/worker.js`) — plain structured-clone
messages, one reply per request:
- page → worker `{ id, request }`, `request` as `generate()` takes it.
- worker → page `{ id, result }` — `generate()`'s result; a request
  `generate()` rejects (`RangeError`) answers `{ ok: false, rejected: true,
  reason, generatorVersion }`.
- worker → page `{ id, error }` — any other exception: a bug, not a request
  problem.
- `handleMessage({ id, request })` → that reply; the worker installs
  `onmessage` only inside a `WorkerGlobalScope`, so Node can import it.

Client (`js/generation/client.js`)
- `createGenerationClient({ createWorker? })` → `{ request, cancel }`, one
  per game. `createWorker` defaults to `createModuleWorker()` (module worker
  on `worker.js`); tests pass a fake with `postMessage`, `terminate`,
  `onmessage`, `onerror`.
- `request(req)` → Promise of the worker's result, success or failure
  alike; rejects only when the worker itself fails (load error, `error`
  reply). A new request cancels the one in flight.
- `cancel()` — the request in flight resolves `{ ok: false, cancelled:
  true, reason: 'cancelled' }` and never delivers its result; the worker is
  terminated and the next request starts a fresh one. Harmless when idle.

## INTERNAL PATTERNS

- **Determinism.** A board is a function of (request, seed,
  `GENERATOR_VERSION`): same in the worker and in Node. The version covers
  the seeded algorithm and seeding, how `int(n)` maps outputs, the placer's
  draw order, the solver's verdicts and the no-guess loop — changing any of
  them changes boards and requires bumping `GENERATOR_VERSION`. The square
  grid's neighbour order feeds the solver too ([engine.md](engine.md)).
- **No-guess loop.** One seeded source per request; candidates are drawn
  from it one after another with `placeMines`, and the first one `solve`
  clears from the first click is the board — so the candidate sequence is
  part of the output. A standard board is the placer's first draw.
- **Attempt budget.** 2000 candidates, set from a measurement of Expert
  no-guess generation recorded beside the constant in `generate.js` and in
  the feature document's § Attempt budget and timing.
- **Solver.** It never sees the mine set: it learns a number only by
  opening a deduced-safe cell through `open(c)`, and knows a mine only once
  deduced. Deduction runs in a fixed order, back to stage 1 after every
  deduction:
  1. single — a number whose deduced mines equal it opens its other closed
     neighbours; one equal to deduced mines plus closed neighbours marks
     them all mines;
  2. subset — pairs of numbers sharing closed neighbours bound the mines in
     the shared and unshared cells (subset and overlap reasoning);
  3. global — each connected frontier group is enumerated exhaustively and
     the groups' totals are combined with the remaining-mine count and the
     closed cells off the frontier. A group over its node budget is treated
     as unconstrained: it can only lose deductions, never make a wrong one.
- **Worker.** Holds no state between requests; each reply is a function of
  its message alone. A rejected request is a result message, never a throw.
- **Client.** Imports no generation code, so generation never runs on the
  main thread. Replies are matched by `id`; a late reply for a superseded or
  cancelled id is dropped. Cancellation terminates the worker rather than
  interrupting `generate()`, which is synchronous.

## DOMAIN DEPENDENCIES

- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the request/result shape, the determinism contract, the first-click
  guarantee, timing, failure, cancel and solver-correctness contracts, and
  the attempt budget's measurement.
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the cell graph, the square-grid provider and the first-click hand-off.
- `tests/fidelity/minesweeper-online.md` — "First-click guarantee", the
  reference rule the placer honours.

## CROSS-REFERENCES

- [engine.md](engine.md) — the cell graph and square grid generation runs
  over, and `supplyBoard`, which takes the mine set.
- [testing.md](testing.md) — `tests/generation-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing anything the generator version covers (see Determinism) — read
  the module header first; it states what forces a bump.
- Adding a deduction to the solver, or a solver-correctness failure: read
  `solver.js` stages 1–3 and `enumerate`.
- Adding a graph description kind (the 3D box graph) to `boardGraph`.
- Changing the attempt budget: re-measure as the comment beside
  `ATTEMPT_BUDGET` records.
- Wiring the client into a game (`classic-2d-square-play`): read
  `client.js` for the in-flight and cancel semantics beyond the API above.
