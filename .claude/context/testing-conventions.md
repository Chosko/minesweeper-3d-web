# Testing — conventions, oracles, browser environment, tripwires

## OVERVIEW

How the suite's tests are written and what they must not be bent to pass:
the testing policy, the oracles, seeded randomness, fakes, static checks,
the local server, contrast and timing slack, and the browser environment
the Playwright layer runs in — plus the tests that an unrelated-looking
change trips. Where tests go and how the suite runs is
[testing.md](testing.md).

## PUBLIC API

`tests/helpers/timing.mjs` — `timed(budget, fn)`, `patience(ms)`,
`TIME_SLACK`; `tests/helpers/browser.mjs` — `browserSuite`, `serveRoot`,
`SWIFTSHADER_ARGS` ([testing.md](testing.md) describes their use).

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
- **Contrast** is checked from parsed tokens for every registered theme
  (`theme-conformance.test.mjs`) and for *Joyful tiles*' own pairs
  (`tokens.test.mjs`)
  and in the page (`measureContrast`, `tests/helpers/contrast.mjs`, run
  through `page.evaluate`: 4.5:1, or 3:1 for large text and accent labels,
  over each run's effective background).
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
- **Input that a round trip cannot stretch.** An input whose meaning
  depends on how long it is held is completed inside the browser, never
  across a test-to-page round trip, which on a loaded machine passes any
  threshold: a faked controller's tap is pressed and released in the page
  within one animation frame (the shell's frame loop polls first), so menu
  auto-repeat never fires (`shell-pad-walk`, `shell-menu`); a touch tap or
  one-finger drag is a gesture the browser synthesizes
  (`Input.synthesizeTapGesture`, `Input.synthesizeScrollGesture`), so the
  400 ms long-press never sees it (`classic2d-touch`, the 3D look in
  `shell-mode-3d`).
- **A browser test that needs a game state plays a fixed board** — fixed
  mines or a fixed seed that reaches it (a loss, not a first-click win),
  pinned by a fast test beside it; a stubbed generation worker answers only
  the test's own board, so the start-up's daily pre-generation never takes
  its place (`shell-mode-3d`).
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

- [testing.md](testing.md) — running the suite, the tiers, the shared
  browser helper, where each test goes.
- [app-shell.md](app-shell.md) — `window.__ms`, the surface Playwright
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
- `tests/shell-pad-walk.test.mjs` walks the board choices and Records
  control by control with a faked controller: moving, adding or hiding a
  control on those screens, or changing `navStep` / `pickInDirection`,
  trips it.
- `tests/shell-focus-containment.test.mjs` pins which sections are inert
  behind each overlay: a new top-level section or overlay in `index.html`
  trips it.
- `tests/input-keyboard-3d.test.mjs` pins that no 3D key changes meaning
  and that the mouse, triggers and `FlyCamera.look` give the same streams
  as before: rebinding a 3D key or touching `MouseActions` trips it.
