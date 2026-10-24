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
  flash, the fixture replays played to the end, the Classic 2D flood's
  frame budget). A functional
  browser check stays untagged. No test name outside the slow tier carries
  the tag, since the runners match it anywhere in a name;
  `tests/affected-tests.test.mjs` pins that every tagged test is a browser
  test.

Running — the scripts under `.claude/external/`; each `cd`s to the repo
root, and an argument starting with `--` passes through to `node --test`. No
`package.json`, no dependencies (Node 22's `node:test`,
`node:assert/strict`). Browser tests run only where a change reaches them:
- `run-fast-tests.sh` — the fast tier over `tests/**/*.test.mjs`, in
  parallel; the regression tool to run after each change.
- `run-affected-tests.sh [path...]` — the tests covering the changed files
  (git's changes against `HEAD`, staged, unstaged and untracked, when no
  path is given): the selected files' fast tests, then their browser tests.
- `run-full-tests.sh [path...]` — a task's full test suite: the whole fast
  tier, then the browser tests `run-affected-tests.sh` would run.
- `run-browser-tests.sh` (every browser test less `[slow]`) and
  `run-slow-tests.sh` (every `[slow]` test) — milestone close only; both
  refuse to run unless `MS3D_ALL_BROWSER=1` is set.

Every script but the fast one ends by `exec`-ing the runner
`run-tests.mjs` in its mode. The runner runs the fast part as one parallel
`node --test`, with no lock, and the browser part as `node --test` with
concurrency 1 and a per-test timeout, so browser test files run strictly one
after another, all on ONE Chromium the runner launches and closes. Before
launching it the runner takes the machine-wide browser lock — a directory
under `%LOCALAPPDATA%` (else the temp directory) holding the owner's pid,
shared by every worktree and agent of the user, reclaimed when its pid is
dead — and waits for it, so one browser run at a time runs on the machine.
The Chromium never outlives its run: the runner closes it on exit, a
signal or an uncaught error, stops itself and its test processes when its
parent process dies, and a hard kill of the runner closes Playwright's pipe,
which ends Chromium.

`.claude/hooks/browser-tests-guard.mjs`, a PreToolUse hook on Bash and
PowerShell in `.claude/settings.json`, denies an agent's `node --test` that
may reach a browser test (no file named, a glob or directory, or a browser
test file) unless it skips them (`--test-skip-pattern="in a browser"`), and
the all-browser runs without `MS3D_ALL_BROWSER=1`, naming the script to use.

The affected-tests mapping (`affected-tests.mjs`): a `tests/*.test.mjs`
argument is selected as given; any other path is a changed file, mapped to
every test file whose import closure reaches it (relative static imports and
`import()` calls with a literal path, transitive). Those files run whole,
`[slow]` tests included. Two rules add the files the page loads rather than
a test importing them, run with `[slow]` skipped unless the closure also
reached them: a change to the page shell (`js/main.js`, `index.html`,
`css/**`) selects `SHELL_SMOKE` — the fewest browser files that open every
screen and play a game of each mode to its end — and a change to
`js/render.js` selects `RENDER_SMOKE` — the fewest browser files that draw a
3D game to its end; `affected-tests.mjs` lists both sets, each file holding
a test that runs with `[slow]` skipped.
No file outside `tests/` matches Node's default test patterns, so
a bare `node --test` from the root finds the suite's files.
`tests/affected-tests.test.mjs` pins the scripts, the runner's modes, the
lock, the hook, the mapping and the smoke sets.

Browser tests, slow ones included, sit in their area's test file.
Every browser test file goes through the shared helper
`tests/helpers/browser.mjs` ([testing-browser.md](testing-browser.md)).

Test files by name prefix:

| Prefix | Code area | Context file |
| ------ | --------- | ------------ |
| `engine-` | cell-graph engine, rule profiles, metrics; the hexagon and triangle grids with the reference profile on them; box graph, 3D profile, 3D state view | [engine.md](engine.md), [engine-rules.md](engine-rules.md), [engine-3d.md](engine-3d.md) |
| `generation-` | seeded placer, solver, no-guess loop, worker and client; the `hex` and `tri` descriptions, their start cells and Hexagon and Triangle Expert no-guess meeting the attempt budget on every seed run (`generation-noguess`), the solver's starved node budget on the triangle grid (`generation-solver`) | [generation.md](generation.md) |
| `platform-` | storage interface and backends, blob store, start-up selection | [platform.md](platform.md) |
| `classic2d-`, `tile-` | board setup; the board choice screen — the window under its title bar, the Board list and Play in the foot, the board choice panel opening for Custom and the code or while pinned and closing on a preset, the pin stored —, its composition at every window size, narrow and widened by the panel, and the last mode and board remembered in a browser (`classic2d-mode`); session; mode; the end effect's win and loss waves and confetti from the module's `end2d` and palette, timed by the grid geometry's cell centres over its extent (`classic2d-end-effect`); the game window, its figures feed and a few moves against a best in a browser (`classic2d-mode`); board view on the grid geometry (the square geometry's layout the grid's, a geometry's own placement, floor and caps, a mismatched size refused) with its pitch, ground, number list and marked start cell from the board module, the board frame padded by the module's gap, the board's extent, the end effect's drawing, and touch zoom (`classic2d-view`, with a browser theme switch mid-game); the module's cursor ring outside the tile on the ring layer, redrawing no cell, the cursor's steps by the grid geometry's neighbour query and the inputs' no-arithmetic greps (`classic2d-cursor`); cell motion — the motion layer, its event sources, its drops, motion on or off leaving game and replay identical, and the flood reveal within `MOTION_CAP`'s frame budget in a browser (`classic2d-motion`); pointer, touch and cursor input, button swap (`classic2d-touch` also holds the Playwright touch runs: Expert on a phone, the Tap choice's radiogroup with the hint strip clear of it, and the mouse pages unchanged); the tile recipe's drawing styles, depth, radius and fallback, the flat style's constant hairline and the glyphs — the knobbed mine, the wrong-flag cross, one- and two-digit numbers, the start cell's ring (`tile-art`); the tile skin from a board module, its cache keys and depth steps, the board art hand-off, the no-theme-import grep and every state legible at `MIN_TILE_SIZE` (`tile-skin`) | [classic2d.md](classic2d.md), [classic2d-session.md](classic2d-session.md), [classic2d-mode.md](classic2d-mode.md), [classic2d-end-effect.md](classic2d-end-effect.md), [classic2d-board-view.md](classic2d-board-view.md), [classic2d-board-canvas.md](classic2d-board-canvas.md), [classic2d-board-motion.md](classic2d-board-motion.md), [classic2d-input.md](classic2d-input.md), [classic2d-tile-skin.md](classic2d-tile-skin.md), [tile-art.md](tile-art.md) |
| `mode3d-` | 3D board choice and its four cube presets, no-guess limit, its board choice panel opening for Learn 3D, Custom and the code or while pinned, *All records* and back, its composition laid out as the Classic 2D one at every window size, the drawer on a phone, in a browser (`mode3d-board-choice`); session, end sequence, results over the scene and the look; Learn 3D (`mode3d-learn`: the guided board, the prompts, its play layout and prompt strip, the Playwright lesson) | [mode3d.md](mode3d.md), [mode3d-learn.md](mode3d-learn.md), [mode3d-session.md](mode3d-session.md), [mode3d-adapter.md](mode3d-adapter.md) |
| `records-` | board identity and key, the hexagon identity and its standard boards (`records-board`), board codes and the daily boards, the `H` token with the hex graph and the hexagon limits, every earlier code keeping its meaning (`records-board-code`), a cut-off code refused as incomplete (`records-board-code`), summary; records model and store; Records screen and its layout — the frame with Back in its title bar and the 2D \| 3D switch at its heading's right, the bests as plain stat tiles and the counters as sunk tiles on the frame, the overall line in the muted panel, the bests on the largest window and the picker on a phone in a browser —, its tabs with the Leaderboards panel, Top 10, averages and filters, history and best-time charts, library view with its quiet row actions and inline confirm row (`records-replays`), remembered view (`records-view-prefs`), stats (`records-stats`), export, its actions with no note line on the Settings page (`records-export`) | [records.md](records.md), [records-board-code.md](records-board-code.md), [records-store.md](records-store.md), [records-screen.md](records-screen.md), [records-screen-view.md](records-screen-view.md), [records-history.md](records-history.md), [records-library-view.md](records-library-view.md) |
| `replay-` | format, recorder and samplers, determinism; library; simulator and verifier, viewer screen — its composition at every window size in a browser, the key line, the seek bar, the press rings, Show 3BV's confetti tints, a failed replay keeping its frame title and timeline — and its live figures at known frames, 2D and 3D viewers (the 2D board fitted whole in its board frame, a 3D replay's scene in the frame's board area) | [replay.md](replay.md), [replay-samplers.md](replay-samplers.md), [replay-library.md](replay-library.md), [replay-playback.md](replay-playback.md), [replay-viewer-screen.md](replay-viewer-screen.md), [replay-viewer-view.md](replay-viewer-view.md), [replay-viewers.md](replay-viewers.md) |
| `results` | results flow and screen — the card by window size, the loss head, the tiles, the details' wording, the code row, the phone card, no first-use toast over it —, Watch replay and Watch best | [app-shell-results.md](app-shell-results.md), [app-shell-results-view.md](app-shell-results-view.md), [app-shell-replay.md](app-shell-replay.md) |
| `shell-` | mode host; router, history mirror, Esc and the controller back button as Back with neither View nor B Back on the board, the focus move's row rule in a window's title bar (`shell-router`); the main menu — entries, routes, opening selection, each play tile's own preview, the tiles' and small entries' sizes and looks at each window size in a browser —, the 3D scene drawn into a panel, the scroll on a short window, the build label and the touch note; the placeholder as J-Other draws it and its motion (`shell-menu`); the board choices' bests, the board choice panel's pin — the `shell.boardPanel` document, unpinned when nothing or a malformed or newer document is stored, one pin loaded before the first screen for both board choices — and the last board (`shell-returning`); the daily boards and the Daily screen, its key hints, its Classic 2D preview framed on the screen's body and its artboards at each size in a browser (`shell-daily`); board codes in the shell — another mode's code, a hexagon one among them, refused by a board choice — and `#board=` links (`shell-challenge`); pause — the confirm box, the card with no game in progress, with the phone's 3D touch toolbar and Learn 3D's touch prompt in a browser (`shell-pause`) —, end skip; help — the controls lists in the canvas's short rows (`shell-help`) —, first-use hints — the strips' key boxes and touch words, the Classic 2D strip over the board, which keeps its size (`shell-first-use`) —; lock fallback; the controller's walk — both board choices, their panel toggle and the title bar's window buttons among its stops — and rumble (`shell-pad-walk`); overlay focus containment (`shell-focus-containment`); the 3D adapter and the 3D figures feed (`shell-mode-3d`, which also holds the Playwright 3D touch play on a tablet, its ready card included, and the mouse at 1024 × 768 with the 3D pause card) | [app-shell.md](app-shell.md), [app-shell-navigation.md](app-shell-navigation.md), [app-shell-focus.md](app-shell-focus.md), [app-shell-menu.md](app-shell-menu.md), [app-shell-menu-preview.md](app-shell-menu-preview.md), [app-shell-daily.md](app-shell-daily.md), [app-shell-pause.md](app-shell-pause.md), [app-shell-end-delay.md](app-shell-end-delay.md), [app-shell-ui.md](app-shell-ui.md), [app-shell-hud.md](app-shell-hud.md), [app-shell-help.md](app-shell-help.md), [app-shell-3d.md](app-shell-3d.md), [app-shell-3d-session.md](app-shell-3d-session.md), [app-shell-3d-play.md](app-shell-3d-play.md), [app-shell-3d-camera.md](app-shell-3d-camera.md), [mode3d-adapter.md](mode3d-adapter.md) |
| `settings-` | schema, store and its format step (the `light` / `dark` carry-over, an unknown theme id kept), the not-saved toast's words (`settings-store`), appliers (the theme through the theme applier); page — its frame by window step, the independent stacks, the ruled rows, the theme cards, the phone layout, no Controls action, in a browser at each window size too —, Reset all data and its one failure line; bindings in the canvas's short rows | [settings.md](settings.md), [settings-appliers.md](settings-appliers.md), [settings-page.md](settings-page.md), [settings-reset.md](settings-reset.md), [settings-bindings.md](settings-bindings.md) |
| `tokens`, `theme`, `components` | *Joyful tiles*' tokens and their contrast — its board and scene tokens against the board module, its base text —, the structural token sheet, the retired board tokens (`tokens`); the pre-paint script, the theme applier and its failure contract, the token reader, the 3D scene's board module hand-off, its sky from the module and no scene token required, the theme stylesheet's scoping (`theme`); the component kit with the shared layout's components and the one selected control — the button sizes, the go and stop buttons and the button colour rule across every screen, no confirm button with an Enter key label, the quiet, latched and danger buttons, the form controls, the icon set and its leading-icon slot, the confirm box and the notes, the plain and warm stat tiles, the muted panel, the ruled table, the pager and the code chip, the screen frame — its title bar (Back as its arrow, the game logo drawn letter by letter, the window buttons inert with no desktop host, `bindWindowButtons`), each screen's name its body heading —, the title bar's and the frame's size steps and its white action foot, the main menu buttons and the board option with no Last played chip, the panel toggle and the drawer, the message and status cards, the scrim and the cards' motion, each also drawn by the gallery in a browser —, the base stylesheets' no-visual-value check, the gallery — loading no game stylesheet; beside J-Components: every part the components artboard draws, every class it shows catalogued (the overlay's own parts among them) or its own layout, which no theme draws, its demos laid out with gaps; in a browser no part overlapping another, every canvas part drawn, its theme list with the active theme chosen and its swatches filled, and both menu previews —, every screen's composition in the shared layout — frames, cards, confirmations, toasts, the fatal card, the no-JavaScript notice and the 404 page — at each window size, the in-game components, the board frame, the Classic 2D game window — its title bar with Pause and no heading, the icon-only Restart, the foot led by the mode and board with Swap clicks and the live-figures toggle at its right, hugging its board with the live figures closed or open, its Tap choice, and in a browser at each artboard size, the live figures closed and then open, with the hint strip over the board — and the 3D overlay's composition with no title — Pause floating, the toggle and the panel it opens, `setFigures3D`, `overlayBottom3D` —, the pause card's 3D board title, the in-game readouts' size steps and the negative counter's danger colour (`components`); in a browser, the main menu and the screens it opens readable with the `__ms` hook's surface, and the title bar — the logo in its colours, the window buttons doing nothing on the web, the keys reaching each, only Back and the logo on a phone (`components-menu-screens`), the pause card, its confirmation and the board status card (`components-pause`), the 3D ready card, its lock states, the Learn 3D end cards and the context-lost card at each card size (`components-ready`); the 3D overlay in a browser at each of its artboard sizes — no title, Pause floating at the top left, the counters at the top centre, the live-figures toggle and its panel on the right, none on a phone —, its readouts' contrast over the sky (`components-game3d`) | [app-shell-kit.md](app-shell-kit.md), [app-shell-kit-layout.md](app-shell-kit-layout.md), [app-shell-kit-helpers.md](app-shell-kit-helpers.md), [app-shell-themes.md](app-shell-themes.md), [app-shell-theme-runtime.md](app-shell-theme-runtime.md), [app-shell-board-module.md](app-shell-board-module.md), [app-shell-markup.md](app-shell-markup.md), [app-shell-stylesheet.md](app-shell-stylesheet.md), [app-shell-ui.md](app-shell-ui.md), [app-shell-hud.md](app-shell-hud.md) |
| `theme-registry`, `theme-conformance`, `board-module` | the theme registry and the kit catalogue (`theme-registry`); the conformance suite every registered theme passes, its board case included, proved against the broken fixture themes, the contrast of the go and stop buttons and of the main menu buttons' ink on every pastel, and the per-theme gallery (`theme-conformance`); the board module's shape, its checks proved against broken board modules, *Joyful tiles*' board values (`board-module`) | [app-shell-kit.md](app-shell-kit.md), [app-shell-themes.md](app-shell-themes.md), [app-shell-board-module.md](app-shell-board-module.md) |
| `hexagon-` | the Hexagon board setup: mode and grid, the standard boards and their equality with the records' `STANDARD_BOARDS_HEX`, the custom limits and mine cap in Classic 2D's refusal shape (`hexagon-board-setup`) | [classic2d.md](classic2d.md), [records.md](records.md) |
| `geometry-` | the flat grid geometry: the kind lookup and its `RangeError`, the square geometry against the board view's pitch arithmetic and the cursor input's steps (`geometry-square`), the hexagon geometry against its own arithmetic, the nearest-tile slot and the zig-zag cursor (`geometry-hex`), the floor and caps read from where they live, the one-cell-per-point property, DOM-free | [geometry.md](geometry.md) |
| `cell-motion` | the cell motion player: interpolation, easing, flip midpoint, restart, the cap, dropping | [classic2d-tile-motion.md](classic2d-tile-motion.md) |
| `render-`, `readability-` | 3D renderer, readability aids; feedback effects (the solved pulse, flash), the target rectangle, the atlas's layers, *Joyful tiles*' atlas, selection and confetti sampled in a browser and a theme switch in a 3D game (`render-3d-feedback`); cell motion — cell events, motion instances, the motion mesh, the solved pulse from the theme, the drops, motion on or off (`render-3d-motion`); the selection uniforms and confetti colours from the board module (`render-3d-selection`) | [rendering.md](rendering.md), [rendering-board-art.md](rendering-board-art.md), [rendering-effects.md](rendering-effects.md) |
| `gamepad`, `input-`, `camera-` | `FlyCamera`, `MouseActions`, drag-to-look, spawn pose (`camera-spawn`); keyboard-only 3D (`input-keyboard-3d`); the 3D touch gesture machine (`input-touch-3d`); flight (`camera-flight`: forward vector, spacing step, toggle and camera scaling, fly-through fade and pick rule); the orbit camera (`camera-orbit`); gamepad helpers, rumble, `Controls` | [input.md](input.md), [input-camera.md](input-camera.md), [input-controller.md](input-controller.md), [app-shell-3d-camera.md](app-shell-3d-camera.md), [rendering.md](rendering.md) |
| `audio-` | sound voices over recorded primitives | [audio.md](audio.md) |
| `live-figures` | the live figures model: every figure and its note in the canvas's wording, a board with and without bests, the zero cases, pace ahead and behind, the efficiency against the game summary's, the change helper, the panel's stored open state — the `shell.liveFigures` document, closed when nothing or a malformed or newer document is stored, a failed save kept for the session, one state loaded before the first screen for both modes' panels and toggles — and the controller's View button toggling it in both modes | [app-shell-hud.md](app-shell-hud.md) |
| `affected-tests` | the runner scripts and `run-tests.mjs`'s modes, the browser lock, the guard hook, the `[slow]` tag, the affected-tests mapping and the smoke sets (`.claude/external/`, `.claude/hooks/`) | this file |
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
  `MOTION_CAP` (`measure-cell-motion.mjs`), and the hexagon and
  triangle boards' no-guess timing against the attempt budget
  (`measure-noguess-hex.mjs`, `measure-noguess-tri.mjs`); each head
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
- Choosing where a new test goes: its tier by
  [testing-browser.md](testing-browser.md)'s rules for what earns a browser
  test, then the prefix table above, then the area's existing file.
