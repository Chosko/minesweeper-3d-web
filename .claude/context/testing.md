# Testing — running the suite, tiers, browser helper, where tests go

## OVERVIEW

Two layers in one suite: Node unit tests for the DOM-free modules, and
Playwright browser checks for what needs WebGL, the DOM or computed styles.
Each test file is self-explanatory; this file maps the suite, not the tests.

Tiers — the three `CLAUDE.md` § Tasks implementation defines, split on the
test's name alone:
- **fast** — every test not named "…in a browser…";
- **browser** — tests named "…in a browser…" (a test that launches a
  browser carries that name, and no other test does, so a misnamed browser
  test lands in the fast tier);
- **slow** — browser tests whose name starts with the tag `[slow] ` ahead of
  "in a browser": the long controller and focus walks (`shell-pad-walk`,
  `shell-focus-containment`, the menu's controller walk and the router's
  arrow-key walk) and the flavour checks of animation timing, frame counts
  and motion (the menu backdrop's frame count, the 3D loss wave, the flag
  flash, the pulse, the fixture replays played to the end). A functional
  browser check stays untagged. No test name outside the slow tier carries
  the tag, since the runners match it anywhere in a name;
  `tests/affected-tests.test.mjs` pins that every tagged test is a browser
  test.

Running — five scripts under `.claude/external/`, each `cd`s to the repo root
and passes extra arguments through to `node --test`; no `package.json`, no
dependencies (Node 22's `node:test`, `node:assert/strict`):
- `run-full-tests.sh` — the fast and browser tiers, every test except the
  `[slow]` ones (`--test-skip-pattern`), at concurrency 2 with a per-test
  timeout. Every script passes the `tests/**/*.test.mjs` glob, and no file
  outside `tests/` matches Node's default test patterns
  (`tests/affected-tests.test.mjs` pins this), so a bare `node --test` from the
  root finds the same files (and runs the slow tier too); the concurrency cap
  keeps the software-rendered browser tests from timing out on a 4-core box;
  the per-test timeout stops a hung test holding the run.
- `run-fast-tests.sh` — the fast tier; the regression tool to run after each
  change.
- `run-browser-tests.sh` — the browser tier less the `[slow]` tests, at
  concurrency 2.
- `run-slow-tests.sh` — the slow tier alone (`--test-name-pattern`), with the
  full run's concurrency and timeout: run when a change touches the code a
  slow test exercises, and in full before a milestone closes.
- `run-affected-tests.sh [path...]` — a `tests/*.test.mjs` argument runs as
  given; any other path is a changed file, mapped by `affected-tests.mjs` to
  every test file whose import closure reaches it (relative static imports
  and `import()` calls with a literal path, transitive). Those files run
  whole, `[slow]` tests included. Two rules add files the page loads rather
  than a test importing them, run with `[slow]` skipped unless the closure
  also reached them: a change to the page shell (`js/main.js`, `index.html`,
  `css/**`) selects the smoke set — one browser test file per screen, or the
  closest file that drives it, `SHELL_SMOKE` in `affected-tests.mjs` — and a
  change to `js/render.js` selects every browser test file. With no
  arguments the changed files are git's against `HEAD` (staged, unstaged,
  untracked). `tests/affected-tests.test.mjs` pins the scripts, the mapping
  and the smoke set.

Measured on the 4-core cloud box with no GPU: the fast tier takes seconds,
and the browser tier nearly all of the full run's wall time; the slow tier,
run apart, holds a large share of the browser time.

Browser tests, slow ones included, sit in their area's test file.
Every browser test file goes through the shared helper
`tests/helpers/browser.mjs` ([testing-browser.md](testing-browser.md)).

Test files by name prefix:

| Prefix | Code area | Context file |
| ------ | --------- | ------------ |
| `engine-` | cell-graph engine, rule profiles, metrics; the hexagon grid with the reference profile on it; box graph, 3D profile, 3D state view | [engine.md](engine.md), [engine-3d.md](engine-3d.md) |
| `generation-` | seeded placer, solver, no-guess loop, worker and client | [generation.md](generation.md) |
| `platform-` | storage interface and backends, blob store, start-up selection | [platform.md](platform.md) |
| `classic2d-`, `tile-` | board setup; the board choice screen, its composition at every window size in a browser (`classic2d-mode`); session; mode; the end effect's win and loss waves and confetti from the module's `end2d` and palette, timed by the grid geometry's cell centres over its extent (`classic2d-end-effect`); the game window, its figures feed and a few moves against a best in a browser (`classic2d-mode`); board view on the grid geometry (the square geometry's layout the grid's, a geometry's own placement, floor and caps, a mismatched size refused) with its pitch, ground, number list and marked start cell from the board module, the board frame padded by the module's gap, the board's extent, the end effect's drawing, and touch zoom (`classic2d-view`, with a browser theme switch mid-game); the module's cursor ring outside the tile on the ring layer, redrawing no cell, the cursor's steps by the grid geometry's neighbour query and the inputs' no-arithmetic greps (`classic2d-cursor`); cell motion — the motion layer, its event sources, its drops, motion on or off leaving game and replay identical, and the flood reveal within `MOTION_CAP`'s frame budget in a browser (`classic2d-motion`); pointer, touch and cursor input, button swap (`classic2d-touch` also holds the Playwright touch runs: Expert on a phone, the Tap choice's radiogroup with the hint strip clear of it, and the mouse pages unchanged); the tile recipe's drawing styles, depth, radius and fallback, the flat style's constant hairline and the glyphs — the knobbed mine, the wrong-flag cross, one- and two-digit numbers, the start cell's ring (`tile-art`); the tile skin from a board module, its cache keys and depth steps, the board art hand-off, the no-theme-import grep and every state legible at `MIN_TILE_SIZE` (`tile-skin`) | [classic2d.md](classic2d.md), [classic2d-session.md](classic2d-session.md), [classic2d-mode.md](classic2d-mode.md), [classic2d-board-view.md](classic2d-board-view.md), [classic2d-board-canvas.md](classic2d-board-canvas.md), [classic2d-board-motion.md](classic2d-board-motion.md), [classic2d-input.md](classic2d-input.md), [classic2d-tile-skin.md](classic2d-tile-skin.md) |
| `mode3d-` | 3D board choice and its four cube presets, no-guess limit, its composition laid out as the Classic 2D one at every window size in a browser (`mode3d-board-choice`); session, end sequence, results over the scene and the look; Learn 3D (`mode3d-learn`: the guided board, the prompts, its play layout and prompt strip, the Playwright lesson) | [mode3d.md](mode3d.md), [mode3d-learn.md](mode3d-learn.md), [mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md) |
| `records-` | board identity and key, board codes and the daily boards, a cut-off code refused as incomplete (`records-board-code`), summary; records model and store; Records screen and its layout — the bests as plain stat tiles and the counters as sunk tiles on the frame, the overall line in the muted panel, the bests on the largest window and the picker on a phone in a browser —, its tabs with the Leaderboards panel, Top 10, averages and filters, history and best-time charts, library view with its quiet row actions and inline confirm row (`records-replays`), remembered view (`records-view-prefs`), stats (`records-stats`), export, its actions with no note line on the Settings page (`records-export`) | [records.md](records.md), [records-board-code.md](records-board-code.md), [records-store.md](records-store.md), [records-screen.md](records-screen.md), [records-screen-view.md](records-screen-view.md), [records-history.md](records-history.md), [records-library-view.md](records-library-view.md) |
| `replay-` | format, recorder and samplers, determinism; library; simulator and verifier, viewer screen — its composition at every window size in a browser, the key line, the seek bar, the press rings, Show 3BV's confetti tints, a failed replay keeping its frame title and timeline — and its live figures at known frames, 2D and 3D viewers (the 2D board fitted whole in its board frame, a 3D replay's scene in the frame's board area) | [replay.md](replay.md), [replay-samplers.md](replay-samplers.md), [replay-library.md](replay-library.md), [replay-playback.md](replay-playback.md), [replay-viewer-screen.md](replay-viewer-screen.md), [replay-viewers.md](replay-viewers.md) |
| `results` | results flow and screen — the card by window size, the loss head, the tiles, the details' wording, the code row, the phone card, no first-use toast over it —, Watch replay and Watch best | [app-shell-results.md](app-shell-results.md), [app-shell-replay.md](app-shell-replay.md) |
| `shell-` | mode host; router, history mirror; the main menu — entries, routes, opening selection, the locked Quit with no reason line, previews — the Classic 2D and Daily boards whole in the board frame in a browser —, the 3D scene drawn into its panel, the entries' heights, the scroll on a short window, the build label and the touch note; the placeholder as J-Other draws it and its motion (`shell-menu`); the board choices' bests and the last board (`shell-returning`); the daily boards and the Daily screen, its key hints, its Classic 2D preview framed on the screen's body and its artboards at each size in a browser (`shell-daily`); board codes in the shell and `#board=` links (`shell-challenge`); pause — the confirm box, the card with no game in progress (`shell-pause`) —, end skip; help — the controls lists in the canvas's short rows (`shell-help`) —, first-use hints — the strips' key boxes and touch words, the Classic 2D strip over the board, which keeps its size (`shell-first-use`) —; lock fallback; the controller's walk and rumble (`shell-pad-walk`); overlay focus containment (`shell-focus-containment`); the 3D adapter and the 3D figures feed (`shell-mode-3d`, which also holds the Playwright 3D touch runs on a tablet and a phone, and the mouse at 1280 × 800) | [app-shell.md](app-shell.md), [app-shell-navigation.md](app-shell-navigation.md), [app-shell-focus.md](app-shell-focus.md), [app-shell-menu.md](app-shell-menu.md), [app-shell-daily.md](app-shell-daily.md), [app-shell-pause.md](app-shell-pause.md), [app-shell-ui.md](app-shell-ui.md), [app-shell-help.md](app-shell-help.md), [app-shell-3d.md](app-shell-3d.md), [app-shell-3d-session.md](app-shell-3d-session.md), [app-shell-3d-play.md](app-shell-3d-play.md), [mode3d-adapter.md](mode3d-adapter.md) |
| `settings-` | schema, store and its format step (the `light` / `dark` carry-over, an unknown theme id kept), the not-saved toast's words (`settings-store`), appliers (the theme through the theme applier); page — its frame by window step, the independent stacks, the ruled rows, the theme cards, the phone layout, no Controls action, in a browser at each window size too —, Reset all data and its one failure line; bindings in the canvas's short rows | [settings.md](settings.md), [settings-appliers.md](settings-appliers.md), [settings-page.md](settings-page.md), [settings-bindings.md](settings-bindings.md) |
| `tokens`, `theme`, `components` | *Joyful tiles*' tokens and their contrast — its board and scene tokens against the board module, its base text —, the structural token sheet, the retired board tokens (`tokens`); the pre-paint script, the theme applier and its failure contract, the token reader, the 3D scene's board module hand-off, its sky from the module and no scene token required, the theme stylesheet's scoping (`theme`); the component kit with the shared layout's components and the one selected control — the button sizes and the quiet, latched and danger buttons, the form controls, the icon set and its leading-icon slot, the confirm box and the notes, the plain and warm stat tiles, the muted panel, the ruled table, the pager and the code chip, the frame's size steps and its white action foot, the message and status cards, the scrim and the cards' motion, each also drawn by the gallery in a browser —, the base stylesheets' no-visual-value check, the gallery — loading no game stylesheet; beside J-Components: every part the components artboard draws, every class it shows catalogued (the overlay's own parts among them) or its own layout, which no theme draws, its demos laid out with gaps; in a browser no part overlapping another, every canvas part drawn, its theme list with the active theme chosen and its swatches filled, and both menu previews —, every screen's composition in the shared layout — frames, cards, confirmations, toasts, the fatal card, the no-JavaScript notice and the 404 page — at each window size, the in-game components, the board frame, the Classic 2D game window — hugging its board, its Tap choice, and in a browser at each artboard size with the hint strip over the board — and the 3D overlay's composition, the in-game readouts' size steps and the negative counter's danger colour (`components`); in a browser, the main menu and the screens it opens readable with the `__ms` hook's surface (`components-menu-screens`), the pause card, its confirmation, the board status card and the results layout (`components-pause`), the 3D ready card, its lock states and the context-lost card (`components-ready`) and the Learn 3D end cards (`components-learn-end`) at each card size; the 3D overlay in a browser at each of its artboard sizes, its readouts' contrast over the sky (`components-game3d`) | [app-shell-kit.md](app-shell-kit.md), [app-shell-kit-helpers.md](app-shell-kit-helpers.md), [app-shell-themes.md](app-shell-themes.md), [app-shell-board-module.md](app-shell-board-module.md), [app-shell-markup.md](app-shell-markup.md), [app-shell-ui.md](app-shell-ui.md) |
| `theme-registry`, `theme-conformance`, `board-module` | the theme registry and the kit catalogue (`theme-registry`); the conformance suite every registered theme passes, its board case included, proved against the broken fixture themes, and the per-theme gallery (`theme-conformance`); the board module's shape, its checks proved against broken board modules, *Joyful tiles*' board values (`board-module`) | [app-shell-kit.md](app-shell-kit.md), [app-shell-themes.md](app-shell-themes.md), [app-shell-board-module.md](app-shell-board-module.md) |
| `geometry-` | the flat grid geometry: the kind lookup and its `RangeError`, the square geometry against the board view's pitch arithmetic and the cursor input's steps (`geometry-square`), the hexagon geometry against its own arithmetic, the nearest-tile slot and the zig-zag cursor (`geometry-hex`), the floor and caps read from where they live, the one-cell-per-point property, DOM-free | [geometry.md](geometry.md) |
| `cell-motion` | the cell motion player: interpolation, easing, flip midpoint, restart, the cap, dropping | [classic2d-tile-motion.md](classic2d-tile-motion.md) |
| `render-`, `readability-` | 3D renderer, readability aids; feedback effects (the solved pulse, flash), the target rectangle, the atlas's layers, *Joyful tiles*' atlas, selection and confetti sampled in a browser and a theme switch in a 3D game (`render-3d-feedback`); cell motion — cell events, motion instances, the motion mesh, the solved pulse from the theme, the drops, motion on or off (`render-3d-motion`); the selection uniforms and confetti colours from the board module (`render-3d-selection`) | [rendering.md](rendering.md), [rendering-board-art.md](rendering-board-art.md), [rendering-effects.md](rendering-effects.md) |
| `gamepad`, `input-`, `camera-` | `FlyCamera`, `MouseActions`, drag-to-look, spawn pose (`camera-spawn`); keyboard-only 3D (`input-keyboard-3d`); the 3D touch gesture machine (`input-touch-3d`); flight (`camera-flight`: forward vector, spacing step, toggle and camera scaling, fly-through fade and pick rule); the orbit camera (`camera-orbit`); gamepad helpers, rumble, `Controls` | [input.md](input.md), [input-camera.md](input-camera.md), [input-controller.md](input-controller.md), [rendering.md](rendering.md) |
| `audio-` | sound voices over recorded primitives | [audio.md](audio.md) |
| `live-figures` | the live figures model: every figure and its note in the canvas's wording, a board with and without bests, the zero cases, pace ahead and behind, the efficiency against the game summary's, the change helper | [app-shell-ui.md](app-shell-ui.md) |
| `affected-tests` | the runner scripts, the `[slow]` tag, the affected-tests mapping and the smoke set (`.claude/external/`) | this file |
| `helpers` | the browser, timing and contrast helpers under `tests/helpers/` and the rule that browser files use them | this file, [testing-conventions.md](testing-conventions.md), [testing-browser.md](testing-browser.md) |

Data beside the tests:
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry
  per rule of Minesweeper Online with default options (date, source,
  confidence), cited by the reference profile's markers and the fidelity
  tests.
- `tests/fixtures/themes/` — test-only themes, never in the registry's
  `THEMES`, which the run-time switch tests register with `registerTheme`:
  `fixture-theme.js` holds the entry of `fixture-dusk/`, which declares no
  fonts, and of `fixture-fonts/`, which declares two weights of a font
  served from its own `fonts/` and borrows `fixture-dusk/`'s board module,
  for the switch's font loading; `broken-themes.js` lists the `broken/`
  themes, each one defect the conformance checks must catch.
- `tests/fixtures/replays/` — recorded `.msrp` games listed in `index.json`,
  written only by `node dev/measure-replays.mjs --write-fixtures` when the
  format changes, never by a test.
- `dev/measure-*.mjs` — measurements, not tests, behind `NOGUESS_CELL_LIMIT`,
  the Cube Beginner preset's mine count
  (`measure-first-box-3d.mjs`), the replay sampler constants and
  `MOTION_CAP` (`measure-cell-motion.mjs`), and the hexagon boards'
  no-guess timing against the attempt budget (`measure-noguess-hex.mjs`); each head
  comment says how to read it. `dev/find-learn-3d.mjs` is the search behind
  `LEARN_BOARD` (its `findLearnBoard` also used by `tests/mode3d-learn.test.mjs`).

## INTERNAL PATTERNS

- The conventions every test follows — oracles, seeded randomness, fakes,
  static checks, timing slack — are
  [testing-conventions.md](testing-conventions.md); the browser layer — the
  local server, the browser environment, inputs, `__ms` — is
  [testing-browser.md](testing-browser.md).

## DOMAIN DEPENDENCIES

- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose
  acceptance criteria become the tests.

## CROSS-REFERENCES

- Each area's context file (table above) holds the contracts its tests pin;
  [app-shell.md](app-shell.md) holds `window.__ms`, the surface Playwright
  drives; [testing-conventions.md](testing-conventions.md) the conventions
  and tripwires; [testing-browser.md](testing-browser.md) the browser layer.

## WHEN TO READ THE SOURCE

- A test that trips on an unrelated-looking change: the tripwires in
  [testing-conventions.md](testing-conventions.md) § WHEN TO READ THE
  SOURCE.
- Choosing where a new test goes: the prefix table above, then the area's
  existing file.
