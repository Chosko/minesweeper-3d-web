# Testing — unit tests, test scripts, browser verification

## OVERVIEW

Two layers in one suite: Node unit tests for the DOM-free modules, and
Playwright browser checks for what needs WebGL, the DOM or computed styles.
Each test file is self-explanatory; this file maps the suite, not the tests.

Running — four scripts under `.claude/external/`, each `cd`s to the repo root
and passes extra arguments through to `node --test`; no `package.json`, no
dependencies (Node 22's `node:test`, `node:assert/strict`):
- `run-full-tests.sh` — the whole suite:
  `node --test --test-concurrency=2 --test-timeout=180000 "tests/**/*.test.mjs"`.
  The glob keeps the `*-test.mjs` review scripts under `docs/` out of the run
  (bare `node --test` picks them up); the concurrency cap keeps the
  software-rendered browser tests from timing out on a 4-core box; the
  per-test timeout stops a hung test holding the run.
- `run-fast-tests.sh` — the fast tier, every test not named "in a browser"
  (`--test-skip-pattern`); the regression tool to run after each change.
- `run-browser-tests.sh` — the browser tier, only the tests named "in a
  browser" (`--test-name-pattern`), at concurrency 2.
- `run-affected-tests.sh [path...]` — a `tests/*.test.mjs` argument runs as
  given; any other path is a changed file, mapped by `affected-tests.mjs` to
  every test file whose import closure reaches it (relative static imports
  and `import()` calls with a literal path, transitive); `js/main.js`, `index.html`, `css/**` and `js/render.js` also
  select every browser test file, since the page loads them rather than a
  test importing them. With no arguments the changed files are git's against
  `HEAD` (staged, unstaged, untracked). `tests/affected-tests.test.mjs` pins
  the scripts and the mapping.

Measured on the 4-core cloud box with no GPU: the fast tier about 7 s wall
(about 1500 tests); the full run about 4 minutes wall, nearly all of it the
browser tier, which alone takes about as long.

Browser tests sit in their area's test file. The tier convention: a test
that launches a browser is named "…in a browser…", and no other test is —
the two tiers split on that name alone, so a misnamed browser test lands in
the fast tier.
Every browser test file goes through the shared helper
`tests/helpers/browser.mjs` and launches no browser and runs no server of its
own (`tests/helpers.test.mjs` pins this). `const suite = browserSuite()` at
the top of the file gives it one Chromium and one static server, started by
the first test that calls `suite.open(t)` and closed once after the file's
last test; `open` returns `{ browser, base }`, where `browser.newPage(options)`
and `browser.newContext(options)` open fresh contexts that the test's
`browser.close()` closes, and `base` is the server's URL. `open` calls
`t.skip` and returns null when Playwright is missing or Chromium fails to
launch, so the Node layer runs green without them. Playwright loads by
`import('playwright')`, falling back to a global install beside
`process.execPath` in the Windows layout (`node_modules` in the binary's
directory) or the POSIX one (`../lib/node_modules`). The launch flags default
to `SWIFTSHADER_ARGS`; a file whose tests need no WebGL passes
`browserSuite({ args: [] })`, and `pages` maps a path to an HTML string the
server returns in place of a file.

Test files by name prefix:

| Prefix | Code area | Context file |
| ------ | --------- | ------------ |
| `engine-` | cell-graph engine, rule profiles, metrics; box graph, 3D profile, 3D state view | [engine.md](engine.md), [engine-3d.md](engine-3d.md) |
| `generation-` | seeded placer, solver, no-guess loop, worker and client | [generation.md](generation.md) |
| `platform-` | storage interface and backends, blob store, start-up selection | [platform.md](platform.md) |
| `classic2d-`, `tile-` | board setup; session; mode and end effect; board view and touch zoom; pointer, touch and cursor input, button swap (`classic2d-touch` also holds the Playwright touch runs: Expert on a phone and the mouse pages unchanged); the tile skin | [classic2d.md](classic2d.md), [classic2d-session.md](classic2d-session.md), [classic2d-mode.md](classic2d-mode.md), [classic2d-board-view.md](classic2d-board-view.md), [classic2d-input.md](classic2d-input.md), [classic2d-tile-skin.md](classic2d-tile-skin.md) |
| `mode3d-` | 3D board choice, no-guess limit; session, end sequence, results over the scene and the look; Learn 3D (`mode3d-learn`: the guided board, the prompts, the Playwright lesson) | [mode3d.md](mode3d.md), [mode3d-session.md](mode3d-session.md) |
| `records-` | board identity and key, board codes and the daily boards (`records-board-code`), summary; records model and store; Records screen and its layout, Top 10, averages and filters, history and best-time charts, library view, remembered view (`records-view-prefs`), stats (`records-stats`), export (`records-export`) | [records.md](records.md), [records-store.md](records-store.md), [records-screen.md](records-screen.md) |
| `replay-` | format, recorder and samplers, determinism; library; simulator and verifier, viewers | [replay.md](replay.md), [replay-library.md](replay-library.md), [replay-playback.md](replay-playback.md) |
| `results` | results flow and screen, Watch replay | [app-shell-results.md](app-shell-results.md), [replay-playback.md](replay-playback.md) |
| `shell-` | mode host; router, history mirror; menu, returning player; the daily boards and the Daily screen (`shell-daily`); board codes in the shell and `#board=` links (`shell-challenge`); pause, end skip; help, first-use hints; lock fallback; the 3D adapter (`shell-mode-3d`, which also holds the Playwright 3D touch runs on a tablet and a phone, and the mouse at 1280 × 800) | [app-shell.md](app-shell.md), [app-shell-navigation.md](app-shell-navigation.md), [app-shell-menu.md](app-shell-menu.md), [app-shell-pause.md](app-shell-pause.md), [app-shell-ui.md](app-shell-ui.md), [app-shell-3d.md](app-shell-3d.md), [mode3d-session.md](mode3d-session.md) |
| `settings-` | schema, store, appliers; page, Reset all data; bindings | [settings.md](settings.md), [settings-page.md](settings-page.md), [settings-bindings.md](settings-bindings.md) |
| `tokens`, `theme`, `components` | token sheet, theme applier and token reader, component kit and gallery | [app-shell-kit.md](app-shell-kit.md) |
| `render-`, `readability-` | 3D renderer, readability aids; feedback effects (pulse, flash) | [rendering.md](rendering.md), [rendering-effects.md](rendering-effects.md) |
| `gamepad`, `input-`, `camera-` | `FlyCamera`, `MouseActions`, drag-to-look, spawn pose; the 3D touch gesture machine (`input-touch-3d`); flight (`camera-flight`: forward vector, spacing step, toggle and camera scaling, fly-through fade and pick rule); gamepad helpers, `Controls` | [input.md](input.md), [input-controller.md](input-controller.md), [rendering.md](rendering.md) |
| `audio-` | sound voices over recorded primitives | [audio.md](audio.md) |
| `affected-tests` | the runner scripts and the affected-tests mapping (`.claude/external/`) | this file |
| `helpers` | the browser and timing helpers under `tests/helpers/` and the rule that browser files use them | this file |

Data beside the tests:
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry
  per rule of Minesweeper Online with default options (date, source,
  confidence), cited by the reference profile's markers and the fidelity
  tests.
- `tests/fixtures/replays/` — recorded `.msrp` games listed in `index.json`,
  written only by `node dev/measure-replays.mjs --write-fixtures` when the
  format changes, never by a test.
- `dev/measure-*.mjs` — measurements, not tests, behind `NOGUESS_CELL_LIMIT`,
  `TYPICAL_BBBV`, the mine counts of the First box 1 and Cube Beginner presets
  (`measure-first-box-3d.mjs`) and the replay sampler constants; each head
  comment says how to read it. `dev/find-learn-3d.mjs` is the search behind
  `LEARN_BOARD` (its `findLearnBoard` also used by `tests/mode3d-learn.test.mjs`).

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
- **Local static server**: the helper's `serveRoot()` — an in-process
  `node:http` server on a free port over the repo root (ES modules fail on
  `file://`). Artefact
  screenshots (`components.test.mjs`) are taken only with `MS_SHOTS=1` set,
  into a `mkdtemp` directory; without it a theme's look is compared through
  computed colours, and the contrast checks run either way.
- **Contrast** is checked from parsed tokens per theme (`tokens.test.mjs`)
  and in the page (`measureContrast` in `components.test.mjs`: 4.5:1, or 3:1
  for large text and accent labels, over each run's effective background).
- **Timing slack** (`tests/helpers/timing.mjs`): a performance budget
  (e.g. 100×100×100, 1000 mines: build and open < 2 s) is asserted through
  `timed(budget, fn)` — up to three attempts, the fastest counting, against
  the budget × `TIME_SLACK`, so work several times over its budget still
  fails. A frame-bound upper bound multiplies only its frame slop by
  `TIME_SLACK`; a lower bound stays exact. A wait for a state polls
  (`waitForFunction`) with a timeout of `patience(ms)`; a fixed window is for
  proving something does not happen. Two short settle sleeps remain, in
  `shell-history` (Back's entries settling) and `shell-lock-fallback` (the
  refusal's second signal).
  `MS_TIME_SLACK` sets the factor (default 2, at least 1).
- Untested by Node beyond static and stub checks: most of `js/render.js`,
  `js/textures.js`, `js/picking.js`, `js/ui.js`, `js/main.js`, the WebAudio
  output — verify these in the browser.

Browser environment:
- Playwright is installed globally (`/opt/node22/lib/node_modules/playwright`,
  browsers in `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); resolve it via
  `NODE_PATH` or an absolute import. Do not run `playwright install`.
- 3D needs WebGL 2 without a GPU: Chromium launches with `--use-gl=angle
  --use-angle=swiftshader --enable-unsafe-swiftshader` (the helper's
  `SWIFTSHADER_ARGS`). No-WebGL checks add an init script making
  `getContext('webgl2')` return null to their own page, so they share the
  file's flagged browser.
- The menu screens' orbiting 3D backdrop redraws every frame and drops
  SwiftShader to about 10 fps, slowing every `requestAnimationFrame` wait,
  screenshot and `browser.close()`. A browser test that loads `index.html`
  for a 2D, screen or menu subject keeps it out of the way: where 3D is
  irrelevant it adds the WebGL-2-refusing init script (`removeWebGL2`,
  defined in each such file); where it needs WebGL 2 present (it opens the
  3D board choice, starts a 3D game or asserts on the 3D entry) it loads
  `index.html?still-backdrop` (the hook in [app-shell.md](app-shell.md)),
  which draws the backdrop once per change. The 3D gameplay test files, the
  no-WebGL path's own tests and the backdrop's own test (`shell-menu`) load
  the page as a player does.
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
