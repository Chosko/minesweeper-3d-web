# Testing — unit tests, test scripts, browser verification

## OVERVIEW

Two layers: Node unit tests for the DOM-free modules, and Playwright-driven
browser checks for everything that needs WebGL or the DOM.

- `tests/logic.test.mjs` — 3D rules engine (`js/logic.js`): geometry, placement,
  flood fill, chord, right-click, unlinking, win/loss, dirty tracking, a
  randomized comparison against a naive port of the original, a performance test.
- `tests/engine-graph.test.mjs` — the cell graph (`js/engine/graph.js`) and the
  square-grid provider (`js/engine/square-grid.js`): construction from lists
  and flat arrays, immutability, invalid input, index/colRow round-trip,
  neighbour counts and the pinned neighbour order, symmetry, large-board build
  time, and that `js/engine/` is DOM-free and independent of `js/logic.js`.
- `tests/engine-rules.test.mjs` — the rules engine (`js/engine/rules.js`,
  `js/engine/profiles.js`): the profile table, creation from a mine count or a
  mine set, the first-click hand-off, reveal/flood fill, flags, chord, the loss
  view, actions outside playing, iterative flood fill on 1000 × 1000, the
  cell-state vocabulary, the shared `changed` buffer, the action stream,
  determinism, and play over a non-square graph.
- `tests/engine-metrics.test.mjs` — 3BV, 3BV solved, effective/wasted click
  counts (`js/engine/metrics.js` and through the engine), `counts()` mid-game
  and `summary()` at a win or a loss.
- `tests/engine-fidelity.test.mjs` — the reference ruleset (profile
  `minesweeper-online`, version 1) against `tests/fidelity/minesweeper-online.md`;
  each test cites an entry by heading, and one test checks that every engine
  entry in the file is pinned and every profile marker cites an entry.
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry per
  rule of Minesweeper Online with default options, each with its date, source
  (client code, help, live play) and confidence, and the tasks it serves.
- `tests/generation-placer.test.mjs` — the seeded source
  (`js/generation/random.js`: pinned first outputs, seed range, `int(n)`
  range, no `Math.random`) and the placer (`js/generation/placer.js`):
  distinct ascending cells never on the first click, the pinned Expert board,
  every other cell reachable (neighbours included), the densest legal board,
  impossible and malformed requests, a non-square graph, the rules engine
  accepting the mine set, and the version-bump rule stated in the module
  headers.
- `tests/generation-solver.test.mjs` — the solver (`js/generation/solver.js`)
  on hand-built boards with a known answer (single-cell only, the 1-2-1 wall
  through the subset stage, the remaining-mine count through the global
  stage, exactly one guess, a guess only at the end), agreement with an
  exhaustive reference on random small square boards and a 4 × 4 torus, that
  it learns the board only through `open()` on deduced-safe cells, that a
  group over its enumeration budget only loses deductions, an Expert board
  within a second.
- `tests/generation-noguess.test.mjs` — `generate()`
  (`js/generation/generate.js`): a standard board is the placer's first
  draw, the pinned no-guess board, candidates drawn one after another from
  one source, every accepted Beginner/Intermediate/Expert no-guess board
  (300/150/60 seeds) clearing with the solver, the exhausted-budget failure,
  rejected requests, the recorded attempt budget, DOM-free and independent
  of `js/logic.js`.
- `tests/generation-client.test.mjs` — the worker handler
  (`js/generation/worker.js::handleMessage`: reply per id, agreement with
  Node `generate()`, structured-clone data, rejected requests as failure
  messages, no state between requests) and the client
  (`js/generation/client.js`) over a fake worker: lazy worker reuse,
  cancellation, one request in flight, stale replies ignored, worker errors,
  the module-worker default, and no generation import on the main thread.
- `tests/platform-storage.test.mjs` — the storage interface
  (`js/platform/storage.js`) over the memory backend: registration and its
  malformed declarations, `{ version, data }` round-trips, no cache, every
  upgrade path saved back, async steps, a failed save-back, newer documents
  refused on load and save, corrupt and unreadable documents kept aside,
  failing `onIssue` handlers, failed and non-serialisable saves, the memory
  backend itself, and that `js/platform/` is DOM-free.
- `tests/platform-browser.test.mjs` — the browser backend
  (`js/platform/browser-backend.js`) over a `FakeStorage` with an optional
  quota: namespaced keys, the legacy `ms3d.*` keys never touched, blocked,
  throwing, missing and full storage, the kept-aside copy, the platform
  module's start-up selection (`js/platform/index.js`), that no other module
  imports a backend, and one Playwright test that a saved document survives
  a page reload (skipped when Playwright or chromium is unavailable).
- `tests/gamepad.test.mjs` — controller helpers (`js/gamepad.js`), analog camera
  (`js/input.js::FlyCamera`), `js/controls.js::Controls`, and trigger sequences
  through `js/input.js::MouseActions`.
- `tests/tokens.test.mjs` — the token sheet (`css/tokens.css`, parsed as text):
  full token set on `:root`, semantic (non-hue) names, a dark value for every
  colour token, z-layer order, WCAG contrast per theme (4.5:1 body text, 3:1
  large text and essential glyphs, on every surface), `css/style.css` declaring
  no variables and reading only declared tokens, `index.html` loading
  `css/tokens.css` before `css/style.css`, and the 3D scene not reading tokens.
- `tests/theme.test.mjs` — the theme applier (`js/theme.js`, run in a `node:vm`
  context against a stub root) and the token reader (`js/tokens.js`): Light
  before first paint, stored-getter fallback (missing, unknown, throwing),
  `setTheme` normalisation and listener order/isolation, `index.html` running
  the applier as a classic script before the stylesheets and module graph,
  `token()` values per theme, `onThemeChange` timing, the visible fallback
  colour and its development-only log, no copy of token values in
  `js/tokens.js`, and the 3D renderer never subscribing to theme changes.
- `.claude/external/run-full-tests.sh` — `cd` to repo root, `exec node --test`.
- `.claude/external/run-affected-tests.sh <test-file>...` — `node --test` on the
  given files; exits 2 with usage when called with no arguments.
- Browser verification: ad-hoc Playwright scripts drive `window.__ms`,
  defined at the end of `js/main.js`; the one browser test in the suite is
  the reload test in `tests/platform-browser.test.mjs`.

No `package.json`, no dependencies: Node 22 built-in runner (`node:test`,
`node:assert/strict`). `node --test` with no arguments discovers
`tests/*.test.mjs`.

## PUBLIC API

Tests consume, and so pin, these contracts:
- `js/logic.js::Game` (`new Game(X, Y, Z, mines, rng)`) and
  `js/logic.js::createGameFromMinePositions(X, Y, Z, mineIdxList)`; members
  `n`, `idx`, `coords`, `neighbors`, `number`, `pressed`/`flagged`/`unlinked`
  (0/1 arrays), `leftClick`/`chord` → `{exploded, revealed}`, `rightClick` →
  `{flagged, unflagged}`, `state`, `explodedIdx`, `flagCount`, `minesLeft`,
  `unpressedCount`, `version`, `dirty`, `consumeDirty()`.
- `js/gamepad.js::stickCurve`, `triggerHeld`, `Repeat`, `padFamily`,
  `padGlyphs`, `pickInDirection`, `GamepadReader` (injected `getGamepads`,
  `onConnect`, `onDisconnect`, `onActiveChange`; `poll()` →
  `{pad, pressed, held, released}`), `BTN`, `STICK_DEADZONE`.
- `js/input.js::FlyCamera.move`/`moveAxes`/`lookAxes`, `MouseActions`
  (`down(b)`/`up(b)`, callback receives `'left'|'right'|'chord'`), `MOVE_SPEED`,
  `LOOK_DEG_PER_PX`, `PAD_LOOK_DEG_PER_S`; `js/controls.js::Controls`
  (`shift`/`space`/`ctrl` union, `pad`, `axes`, `hasAxes`, `releasePad()`).
- `js/engine/graph.js::createCellGraph`, `cellGraphFromLists`;
  `js/engine/square-grid.js::createSquareGrid` (index layout and neighbour
  order); `js/engine/profiles.js::PROFILES`, `REFERENCE_PROFILE`,
  `getRuleProfile` and every marker's `fidelity` heading;
  `js/engine/rules.js::createGame`, `createGameWithMines`, `PHASE`, `CELL` and
  the game's actions, queries, `counts()`, `summary()`, `actions()`;
  `js/engine/metrics.js::createBoardMetrics`, `createClickCounts`,
  `CLICK_KINDS`. Full list in [engine.md](engine.md).
- `js/generation/random.js::createSeededSource` (its pinned output stream);
  `js/generation/placer.js::placeMines`, `GENERATOR_VERSION`;
  `js/generation/solver.js::solve`, `solveFrom`;
  `js/generation/generate.js::generate`, `boardGraph`, `ATTEMPT_BUDGET`;
  `js/generation/worker.js::handleMessage` and the `{ id, request }` /
  `{ id, result | error }` messages; `js/generation/client.js::
  createGenerationClient`, `createModuleWorker`. Full list in
  [generation.md](generation.md).
- `css/tokens.css` token names and values (`:root` and
  `:root[data-theme="dark"]`); `js/theme.js::createThemeApplier`
  (`{root, readStored, onError}` → `apply`, `current`, `setTheme`, `onChange`)
  and the `globalThis.msTheme` it installs; `js/tokens.js::createTokenReader`
  (`{root, getStyle, theme, dev, log}` → `token`, `onThemeChange`),
  `FALLBACK_COLOR`; the `<head>` order in `index.html`.
- `js/platform/storage.js::createStorage` (`register`, `load`, `save`,
  `available`, the issue kinds and save reasons);
  `js/platform/browser-backend.js::createBrowserBackend`, `DOC_PREFIX`,
  `ASIDE_PREFIX`; `js/platform/memory-backend.js::createMemoryBackend`;
  `js/platform/index.js` exports. Full list in [platform.md](platform.md).

Browser hook `js/main.js::window.__ms` (full list in [app-shell.md](app-shell.md)):
- getters `state`, `game`, `renderer`, `camera`, `controls`, `pads`, `fps`,
  `frameStats`; `THREE`, `startCameraPos`.
- `start(X, Y, Z, mines, minePositions?)`, `forcePlay()`, `pause()`.
- `moveTo(x,y,z)`, `look(yaw,pitch)`, `aimAt(idx | [x,y,z])` → selected idx,
  `cellCenter(idx)`.
- `mouseDown(b)`, `mouseUp(b)`, `click('left'|'right'|'chord')`,
  `key(code, down)`, `wheel(notches)`.
- `selected()`, `pickBrute()`, `pickWith(o, d, space)` → `[dda, brute]`,
  `info()` → mode, selected, time, started, spacing, gameState, minesLeft, HUD
  text, camera, renderer stats, fps.

## INTERNAL PATTERNS

- **Testing policy is full-tdd** (`CLAUDE.md` "Tasks implementation"): every
  task runs tests first — write/extend the failing test, then implement, then
  run `.claude/external/run-full-tests.sh`.
- Determinism: randomness is injected. `mulberry32(seed)` for seeded runs,
  `seq([...])` for exact rng values; deterministic boards via
  `createGameFromMinePositions` (helper `G`).
- `NaiveGame` in `tests/logic.test.mjs` is the fidelity oracle for
  `js/logic.js`: a direct port of the original
  `Cell.cs`/`Grid.cs`/`Minesweeper.cs` frame logic (recursive click,
  exception-based explosion, full unlink passes until stable). `naivePlace`
  mirrors `Grid.cs` linear-probe placement. Never "fix" the oracle to match
  the engine; the engine must match the oracle.
- The fidelity observation, not the engine, is the oracle for the
  cell-graph engine: `tests/engine-fidelity.test.mjs` parses
  `tests/fidelity/minesweeper-online.md`, and a failure there is fixed in the
  engine against the file, never by editing the file, unless a feature
  document records the difference as deliberate. The fix ships as a new
  rules version; every earlier version's tests stay and keep passing.
- Generation determinism: the same request, seed and `GENERATOR_VERSION`
  give the same board. The generation tests pin exact outputs — the seeded
  source's first values, a placed Expert board, an accepted no-guess board —
  so a change that moves any of them is a generator change: bump
  `GENERATOR_VERSION` and re-pin, never re-pin alone. Seeds are fixed
  integers; nothing reads `Math.random`.
- Solver tests build boards from row strings (`'*'` a mine, `'o'` the first
  click, `'.'` safe) and check the solver against an exhaustive reference;
  the client tests drive a fake worker that answers through `handleMessage`
  after a macrotask (or on `flush()` when held).
- Engine tests build boards from row strings (`'*'` a mine) over
  `createSquareGrid`, and use `cellGraphFromLists` for non-square graphs.
- The randomized test runs 400 seeds × 40 actions and asserts per-cell
  equality via `assertSame` plus `minesLeft == mines - flagCount`; it requires
  `actions > 5000`, so do not make the action generator skip more often.
- Performance budget: 100×100×100 / 1000 mines construct < 1 s, construct +
  zero-region click < 2 s; mines == n on 10^6 cells < 2 s.
- Storage tests inject the backend: the memory backend (its `documents` /
  `aside` Maps edited directly) for the interface, a `FakeStorage` passed
  through `getStorage` for the browser backend. The platform-module tests
  swap `globalThis.localStorage` and import `js/platform/index.js` with a
  distinct query string, so each import evaluates the selection afresh.
- Gamepad tests use a `fakePad` object (17 buttons, 4 axes, `mapping: 'standard'`)
  and a mutable `list` returned by `getGamepads`; no browser globals needed.
- `FlyCamera.moveAxes` is tested for exact equality with `move()` under keys,
  so the original forward-vector quirk is covered there.
- Static-file tests read `css/*.css`, `index.html` and `js/*.js` as text with
  `readFileSync`; CSS comments are stripped before parsing. Classic scripts
  (`js/theme.js`) run in a `node:vm` context whose global carries a stub
  `document.documentElement`; DOM-free factories take stub roots and
  `getStyle` functions instead of browser globals.
- Untested by Node: `js/render.js`, `js/textures.js`, `js/picking.js`,
  `js/ui.js`, `js/main.js`, `js/audio.js` — verify in the browser. Computed
  styles and the rendered theme are browser-only too.

Browser verification (Playwright):
- Playwright 1.56 is installed globally (`/opt/node22/lib/node_modules/playwright`,
  CLI `/opt/node22/bin/playwright`); resolve it via `NODE_PATH` or an absolute
  import, not a local install. Browsers live in `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
  (chromium build 1194). Do not run `playwright install`.
- WebGL 2 is required and there is no GPU: launch chromium with SwiftShader,
  e.g. `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Serve over HTTP (ES modules fail on `file://`), e.g. globally installed
  `http-server` or `serve` from the repo root.
- Headless has no pointer lock: call `__ms.start(...)` then `__ms.forcePlay()`
  (lockless play) before driving actions; aim with `aimAt`, act with `click`.
- Every hook mutator calls the synchronous `refresh()` (camera, toggles,
  spacing, picking), so `selected()`/`info()` are valid immediately; rendered
  pixels need a following animation frame. `pickWith` compares DDA against
  brute-force picking — use it for picking regressions.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original is the overriding rule; tests are where it
is enforced.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md):
  - "Mines & numbers" — linear-probe placement, 26-neighbourhood, no
    first-click safety (placement tests, `naivePlace`).
  - "Rules" — leftClick/chord/rightClick/unlinking/win/lose semantics
    (`NaiveGame`, rule tests); timer start rule (browser only).
  - "Controls" — release-to-act chord state machine (`MouseActions` test),
    50 u/s movement, look rates, pitch clamp (`FlyCamera` tests); picking
    exclusions (browser `pickWith`/`aimAt`).
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the engine behaviours, 3BV and click-count definitions and the fidelity
  rule the `engine-*` tests encode.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the determinism, failure, cancel and solver-correctness contracts the
  `generation-*` tests encode.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the contrast contract and applier/reader contracts `tokens.test.mjs` and
  `theme.test.mjs` encode.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioning and failure contracts the `platform-*` tests encode.
- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose acceptance
  criteria become tests.

## CROSS-REFERENCES

- [logic.md](logic.md) — `tests/logic.test.mjs` pins the engine API and checks it against the naive port.
- [engine.md](engine.md) — `tests/engine-*.test.mjs` pin the cell-graph engine; the fidelity test checks it against the observation file.
- [generation.md](generation.md) — `tests/generation-*.test.mjs` pin the seeded generator, solver, no-guess loop, worker and client.
- [platform.md](platform.md) — `tests/platform-*.test.mjs` pin the storage interface, backends and start-up selection.
- [input.md](input.md) — `tests/gamepad.test.mjs` covers gamepad helpers, `FlyCamera`, `Controls`, `MouseActions`.
- [app-shell.md](app-shell.md) — owns `window.__ms`, the surface Playwright drives,
  and the token sheet, theme applier and token reader the token/theme tests pin.
- [rendering.md](rendering.md) — no unit tests; verified visually via Playwright screenshots.
- [audio.md](audio.md) — no unit tests; WebAudio only checkable in a browser.

## WHEN TO READ THE SOURCE

- Adding a rule change to the 3D engine: extend `NaiveGame` only if the original
  behaves that way, then add a focused test next to the matching section.
- A fidelity-test failure: read the cited entry in
  `tests/fidelity/minesweeper-online.md` and the profile marker that cites
  it, then fix the engine.
- A randomized-test failure: read `assertSame` output (seed, action, cell) and
  replay that seed with both engines.
- A pinned generation output fails: decide whether the change is a generator
  change (bump `GENERATOR_VERSION`, re-pin) or a regression; a solver
  failure prints the seed — replay it with `solve()` and read
  `js/generation/solver.js`.
- Changing placement or rng use in `Game` (seed streams must stay aligned with
  `naivePlace`).
- Adding a gamepad family, button mapping or trigger threshold (`padFamily`
  cases, `fakePad`, `press`).
- Writing a Playwright script that needs a hook method not listed above, or
  changing `__ms` (read the end of `js/main.js`).
- Investigating a perf-test timeout on slower hardware.
- A contrast failure in `tests/tokens.test.mjs`: the message names the theme,
  token pair and ratio; read the colour parser there before changing a value
  format in `css/tokens.css`.
