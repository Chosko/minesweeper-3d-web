# Testing — unit tests, test scripts, browser verification

## OVERVIEW

Two layers in one suite: Node unit tests for the DOM-free modules, and
Playwright browser checks for what needs WebGL, the DOM or computed styles.
Each test file is self-explanatory; this file maps the suite, not the tests.

Running:
- `.claude/external/run-full-tests.sh` — `cd` to the repo root, then
  `node --test --test-concurrency=2 "tests/**/*.test.mjs"`. The glob keeps the
  `*-test.mjs` review scripts under `docs/` out of the run (bare `node --test`
  picks them up); the concurrency cap keeps the software-rendered browser
  tests from timing out on a 4-core box.
- `.claude/external/run-affected-tests.sh <test-file>...` — `node --test` on
  the given files; exits 2 with usage when called with no arguments.
- No `package.json`, no dependencies: Node 22's built-in runner (`node:test`,
  `node:assert/strict`).

Browser tests sit in their area's test file, mostly named `in a browser, …`.
Each loads Playwright by `import('playwright')`, falling back to the global
install beside `process.execPath`, and calls `t.skip` when Playwright is
missing or Chromium fails to launch, so the Node layer runs green without them.

Test files by name prefix:

| Prefix | Code area | Context file |
| ------ | --------- | ------------ |
| `engine-` | cell-graph engine, rule profiles, metrics; box graph, 3D profile, 3D state view | [engine.md](engine.md), [engine-3d.md](engine-3d.md) |
| `generation-` | seeded placer, solver, no-guess loop, worker and client | [generation.md](generation.md) |
| `platform-` | storage interface and backends, blob store, start-up selection | [platform.md](platform.md) |
| `classic2d-`, `tile-` | board setup; session; mode and end effect; board view; pointer and cursor input, button swap; the tile skin | [classic2d.md](classic2d.md), [classic2d-session.md](classic2d-session.md), [classic2d-mode.md](classic2d-mode.md), [classic2d-board-view.md](classic2d-board-view.md), [classic2d-input.md](classic2d-input.md), [classic2d-tile-skin.md](classic2d-tile-skin.md) |
| `mode3d-` | 3D board choice, no-guess limit; session, end sequence | [mode3d.md](mode3d.md), [mode3d-session.md](mode3d-session.md) |
| `records-` | board identity and key, summary; records model and store; Records screen, history chart, library view | [records.md](records.md), [records-store.md](records-store.md), [records-screen.md](records-screen.md) |
| `replay-` | format, recorder and samplers, determinism; library; simulator and verifier, viewers | [replay.md](replay.md), [replay-library.md](replay-library.md), [replay-playback.md](replay-playback.md) |
| `results` | results flow and screen, Watch replay | [app-shell-results.md](app-shell-results.md), [replay-playback.md](replay-playback.md) |
| `shell-` | mode host; router, history mirror; menu, returning player; pause, end skip; help, first-use hints; lock fallback; the 3D adapter (`shell-mode-3d`) | [app-shell.md](app-shell.md), [app-shell-navigation.md](app-shell-navigation.md), [app-shell-menu.md](app-shell-menu.md), [app-shell-pause.md](app-shell-pause.md), [app-shell-ui.md](app-shell-ui.md), [app-shell-3d.md](app-shell-3d.md), [mode3d-session.md](mode3d-session.md) |
| `settings-` | schema, store, appliers; page, Reset all data; bindings | [settings.md](settings.md), [settings-page.md](settings-page.md), [settings-bindings.md](settings-bindings.md) |
| `tokens`, `theme`, `components` | token sheet, theme applier and token reader, component kit and gallery | [app-shell-kit.md](app-shell-kit.md) |
| `render-`, `readability-` | 3D renderer, readability aids; feedback effects (pulse, flash) | [rendering.md](rendering.md), [rendering-effects.md](rendering-effects.md) |
| `gamepad`, `input-`, `camera-` | `FlyCamera`, `MouseActions`, drag-to-look, spawn pose; gamepad helpers, `Controls` | [input.md](input.md), [input-controller.md](input-controller.md) |
| `audio-` | sound voices over recorded primitives | [audio.md](audio.md) |

Data beside the tests:
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry
  per rule of Minesweeper Online with default options (date, source,
  confidence), cited by the reference profile's markers and the fidelity
  tests.
- `tests/fixtures/replays/` — recorded `.msrp` games listed in `index.json`,
  written only by `node dev/measure-replays.mjs --write-fixtures` when the
  format changes, never by a test.
- `dev/measure-*.mjs` — measurements, not tests, behind `NOGUESS_CELL_LIMIT`,
  `TYPICAL_BBBV` and the replay sampler constants; each head comment says how
  to read it.

## INTERNAL PATTERNS

- **Testing policy is full-tdd** (`CLAUDE.md` "Tasks implementation"): write
  or extend the failing test first, then implement, then run
  `run-full-tests.sh`.
- **Oracles are never edited to pass.** The code under test must match them,
  except where a feature document records a deliberate difference, which is
  then tested as the new rule.
  - `NaiveGame` in `tests/engine-3d-profile.test.mjs` is a direct port of the
    original `Cell.cs`/`Grid.cs`/`Minesweeper.cs` frame logic and the oracle
    for the 3D profile while a game is playing; randomized runs compare it
    cell by cell with the engine (`assertSame`). Extend it only when the
    original behaves that way.
  - `tests/fidelity/minesweeper-online.md` is the oracle for the reference
    profile (`engine-fidelity`) and for the Classic 2D inputs and custom
    limits (`classic2d-fidelity`). A failure is fixed in the engine, pointer
    input, board setup or profile markers — never in the file. A rule fix
    ships as a new rules version; every earlier version's tests keep passing.
  - Recorded replays in `tests/fixtures/replays/` must keep reproducing: fix
    the regression, or add a format version and its upgrade.
- **Randomness is injected and seeded.** Nothing reads `Math.random`; seeds
  are fixed integers. Generation tests pin exact outputs (seeded source,
  placed boards, accepted no-guess boards), so moving one is a generator
  change: bump `GENERATOR_VERSION` and re-pin, never re-pin alone.
  Deterministic boards come from `createGameWithMines` with an explicit mine
  set.
- **Boards from row strings** (`'*'` a mine, `'.'` safe, `'o'` a first
  click) over `createSquareGrid`; `cellGraphFromLists` for other graphs.
- **Fakes over browser globals**: the memory storage backend and blob store
  (`failWrites` / `failReads`), `FakeStorage`, recording Proxy canvas
  contexts, recording fake modes, routers and workers, `fakePad`.
- **Static checks read source as text** (`readFileSync`): CSS with comments
  stripped, `index.html`, `js/*.js`. Shell tests slice `js/main.js` and
  `index.html` between marker comments, so keep those markers when editing.
  `js/theme.js` runs in a `node:vm` context with a stub root; tests importing
  `js/render.js` register a resolve hook mapping `three` to `vendor/three/`.
- **Local static server**: each browser test file defines its own `serve()`
  — an in-process `node:http` server on a free port over the repo root (ES
  modules fail on `file://`) — and its own `loadPlaywright()`. Screenshots go
  to a `mkdtemp` directory.
- **Contrast** is checked from parsed tokens per theme (`tokens.test.mjs`)
  and in the page (`measureContrast` in `components.test.mjs`: 4.5:1, or 3:1
  for large text and accent labels, over each run's effective background).
- **Performance budgets** are asserted (e.g. 100×100×100, 1000 mines: < 1 s).
- Untested by Node beyond static and stub checks: most of `js/render.js`,
  `js/textures.js`, `js/picking.js`, `js/ui.js`, `js/main.js`, the WebAudio
  output — verify these in the browser.

Browser environment:
- Playwright is installed globally (`/opt/node22/lib/node_modules/playwright`,
  browsers in `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); resolve it via
  `NODE_PATH` or an absolute import. Do not run `playwright install`.
- 3D needs WebGL 2 without a GPU: launch Chromium with `--use-gl=angle
  --use-angle=swiftshader --enable-unsafe-swiftshader`. No-WebGL checks add an
  init script making `getContext('webgl2')` return null.
- 3D tests and ad-hoc scripts drive `window.__ms`. Headless has no pointer
  lock: `__ms.start(...)`, `__ms.forcePlay()`, then `aimAt` and `click`.
  Mutators refresh synchronously, so `selected()` / `info()` are valid at
  once; pixels need the next animation frame. `pickWith` compares DDA
  against brute-force picking.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original is the overriding rule; tests enforce it.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md): "Mines &
  numbers" (26-neighbourhood: box graph tests); "Rules" (`NaiveGame` and the
  3D profile tests; the timer rule in browser tests); "Controls"
  (`MouseActions` and `FlyCamera` tests; picking exclusions in the browser).
- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose
  acceptance criteria become the tests, and which record the deliberate
  differences from an oracle.

## CROSS-REFERENCES

- Each area's context file (table above) holds the contracts its tests pin;
  [app-shell.md](app-shell.md) holds `window.__ms`, the surface Playwright
  drives.

## WHEN TO READ THE SOURCE

- A fidelity failure: read the cited entry in
  `tests/fidelity/minesweeper-online.md` and the profile marker citing it,
  then fix the code.
- A randomized 3D-profile failure: read the `assertSame` output (seed,
  action, cell) and replay that seed against `NaiveGame`.
- A solver failure prints its seed: replay it with `solve()`.
- A measured constant's test fails (`NOGUESS_CELL_LIMIT`, recording
  constants, snapshot interval): re-run the matching `dev/measure-*.mjs` and
  read its head comment before moving the constant.
- A contrast failure: read `measureContrast` or the token parser and the
  saved screenshots before changing a token.
- An `__ms` member not in [app-shell.md](app-shell.md): read the end of
  `js/main.js`.
