# Testing — conventions, oracles, tripwires

## OVERVIEW

How the suite's tests are written and what they must not be bent to pass:
the testing policy, the oracles, seeded randomness, fakes, static checks,
contrast and timing slack — plus the tests that an unrelated-looking change
trips. The browser layer — the local server, the environment Playwright runs
in, inputs and fixed boards, `__ms` — is
[testing-browser.md](testing-browser.md); where tests go and how the suite
runs is [testing.md](testing.md).

## PUBLIC API

`tests/helpers/timing.mjs` — `timed(budget, fn)`, `patience(ms)`,
`TIME_SLACK` ([testing.md](testing.md) describes their use); the browser
helper is [testing-browser.md](testing-browser.md)'s.

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
- Untested by Node beyond static and stub checks: most of `js/render.js`,
  `js/textures.js`, `js/picking.js`, `js/ui.js`, `js/main.js`, the WebAudio
  output — verify these in the browser.

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
- [testing-browser.md](testing-browser.md) — the local server, the
  browser environment, `window.__ms`.

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
