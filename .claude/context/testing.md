# Testing — running the suite, tiers, browser helper, where tests go

## OVERVIEW

Two layers in one suite: Node unit tests for the DOM-free modules, and
Playwright browser checks for what needs WebGL, the DOM or computed styles.
Each test file is self-explanatory; this file maps the suite, not the tests.

Running — four scripts under `.claude/external/`, each `cd`s to the repo root
and passes extra arguments through to `node --test`; no `package.json`, no
dependencies (Node 22's `node:test`, `node:assert/strict`):
- `run-full-tests.sh` — the whole suite:
  `node --test --test-concurrency=2 --test-timeout=180000 "tests/**/*.test.mjs"`.
  Every script passes the `tests/**/*.test.mjs` glob, and no file outside
  `tests/` matches Node's default test patterns
  (`tests/affected-tests.test.mjs` pins this), so a bare `node --test` from the
  root finds the same files; the concurrency cap keeps the
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
| `mode3d-` | 3D board choice, no-guess limit; session, end sequence, results over the scene and the look; Learn 3D (`mode3d-learn`: the guided board, the prompts, the Playwright lesson) | [mode3d.md](mode3d.md), [mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md) |
| `records-` | board identity and key, board codes and the daily boards (`records-board-code`), summary; records model and store; Records screen and its layout, Top 10, averages and filters, history and best-time charts, library view, remembered view (`records-view-prefs`), stats (`records-stats`), export (`records-export`) | [records.md](records.md), [records-board-code.md](records-board-code.md), [records-store.md](records-store.md), [records-screen.md](records-screen.md), [records-history.md](records-history.md), [records-library-view.md](records-library-view.md) |
| `replay-` | format, recorder and samplers, determinism; library; simulator and verifier, viewer screen, 2D and 3D viewers | [replay.md](replay.md), [replay-samplers.md](replay-samplers.md), [replay-library.md](replay-library.md), [replay-playback.md](replay-playback.md), [replay-viewers.md](replay-viewers.md) |
| `results` | results flow and screen, Watch replay and Watch best | [app-shell-results.md](app-shell-results.md), [app-shell-replay.md](app-shell-replay.md) |
| `shell-` | mode host; router, history mirror; menu, returning player; the daily boards and the Daily screen (`shell-daily`); board codes in the shell and `#board=` links (`shell-challenge`); pause, end skip; help, first-use hints; lock fallback; the controller's walk and rumble (`shell-pad-walk`); overlay focus containment (`shell-focus-containment`); the 3D adapter (`shell-mode-3d`, which also holds the Playwright 3D touch runs on a tablet and a phone, and the mouse at 1280 × 800) | [app-shell.md](app-shell.md), [app-shell-navigation.md](app-shell-navigation.md), [app-shell-menu.md](app-shell-menu.md), [app-shell-pause.md](app-shell-pause.md), [app-shell-ui.md](app-shell-ui.md), [app-shell-help.md](app-shell-help.md), [app-shell-3d.md](app-shell-3d.md), [app-shell-3d-play.md](app-shell-3d-play.md), [mode3d-adapter.md](mode3d-adapter.md) |
| `settings-` | schema, store and its format step (the `light` / `dark` carry-over, an unknown theme id kept), appliers (the theme through the theme applier); page with its theme list, Reset all data; bindings | [settings.md](settings.md), [settings-page.md](settings-page.md), [settings-bindings.md](settings-bindings.md) |
| `tokens`, `theme`, `components` | *Joyful tiles*' tokens and their contrast, the structural token sheet (`tokens`); the pre-paint script, the theme applier and its failure contract, the token reader, the scene palette, the theme stylesheet's scoping (`theme`); the component kit, the base stylesheets' no-visual-value check, the gallery, the screens' markup (`components`) | [app-shell-kit.md](app-shell-kit.md), [app-shell-markup.md](app-shell-markup.md) |
| `theme-registry`, `theme-conformance`, `board-module` | the theme registry and the kit catalogue (`theme-registry`); the conformance suite every registered theme passes, its board case included, proved against the broken fixture themes, and the per-theme gallery (`theme-conformance`); the board module's shape, its checks proved against broken board modules, *Joyful tiles*' board values (`board-module`) | [app-shell-kit.md](app-shell-kit.md) |
| `render-`, `readability-` | 3D renderer, readability aids; feedback effects (pulse, flash) | [rendering.md](rendering.md), [rendering-effects.md](rendering-effects.md) |
| `gamepad`, `input-`, `camera-` | `FlyCamera`, `MouseActions`, drag-to-look, spawn pose (`camera-spawn`); keyboard-only 3D (`input-keyboard-3d`); the 3D touch gesture machine (`input-touch-3d`); flight (`camera-flight`: forward vector, spacing step, toggle and camera scaling, fly-through fade and pick rule); the orbit camera (`camera-orbit`); gamepad helpers, rumble, `Controls` | [input.md](input.md), [input-camera.md](input-camera.md), [input-controller.md](input-controller.md), [rendering.md](rendering.md) |
| `audio-` | sound voices over recorded primitives | [audio.md](audio.md) |
| `affected-tests` | the runner scripts and the affected-tests mapping (`.claude/external/`) | this file |
| `helpers` | the browser and timing helpers under `tests/helpers/` and the rule that browser files use them | this file |

Data beside the tests:
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry
  per rule of Minesweeper Online with default options (date, source,
  confidence), cited by the reference profile's markers and the fidelity
  tests.
- `tests/fixtures/themes/` — test-only themes, never in the registry's
  `THEMES`: `fixture-theme.js` is the entry of `fixture-dusk/`, which the
  run-time switch tests register with `registerTheme`; `broken-themes.js` lists the `broken/` themes, each one
  defect the conformance checks must catch.
- `tests/fixtures/replays/` — recorded `.msrp` games listed in `index.json`,
  written only by `node dev/measure-replays.mjs --write-fixtures` when the
  format changes, never by a test.
- `dev/measure-*.mjs` — measurements, not tests, behind `NOGUESS_CELL_LIMIT`,
  `TYPICAL_BBBV`, the mine counts of the First box 1 and Cube Beginner presets
  (`measure-first-box-3d.mjs`) and the replay sampler constants; each head
  comment says how to read it. `dev/find-learn-3d.mjs` is the search behind
  `LEARN_BOARD` (its `findLearnBoard` also used by `tests/mode3d-learn.test.mjs`).

## INTERNAL PATTERNS

- The conventions every test follows — oracles, seeded randomness, fakes,
  static checks, timing slack, the browser environment — are
  [testing-conventions.md](testing-conventions.md).

## DOMAIN DEPENDENCIES

- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose
  acceptance criteria become the tests.

## CROSS-REFERENCES

- Each area's context file (table above) holds the contracts its tests pin;
  [app-shell.md](app-shell.md) holds `window.__ms`, the surface Playwright
  drives; [testing-conventions.md](testing-conventions.md) the conventions
  and tripwires.

## WHEN TO READ THE SOURCE

- A test that trips on an unrelated-looking change: the tripwires in
  [testing-conventions.md](testing-conventions.md) § WHEN TO READ THE
  SOURCE.
- Choosing where a new test goes: the prefix table above, then the area's
  existing file.
