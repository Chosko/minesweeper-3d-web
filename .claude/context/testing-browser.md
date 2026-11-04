# Testing — the browser layer: what earns a browser test, helper, server, inputs

## OVERVIEW

How the Playwright tests (those named "in a browser") are written: what
earns a test a place in the browser tier, the shared helper every browser
test file goes through, the local server, inputs a round trip cannot
stretch, a board measured after the board art hand-off, and fixed boards
for a game state. The browser environment they run in, the 3D backdrop kept
out of their way and `window.__ms` are
[testing-browser-env.md](testing-browser-env.md). Conventions every test
follows, and the tripwires, are [testing-conventions.md](testing-conventions.md);
how the suite runs is [testing.md](testing.md) and where tests go
[testing-files.md](testing-files.md).

## PUBLIC API

`tests/helpers/browser.mjs` — `browserSuite`, `serveRoot`,
`launchSharedBrowser`, `SHARED_BROWSER_ARGS`, `SWIFTSHADER_ARGS`.

Every browser test file goes through this helper and launches or connects
to no browser and runs no server of its own (`tests/helpers.test.mjs` pins
this). The runner ([testing.md](testing.md) § OVERVIEW) launches the run's
Chromium with `launchSharedBrowser` (`SHARED_BROWSER_ARGS`:
`SWIFTSHADER_ARGS` for WebGL 2, and the 2D canvas rasterised in software)
and hands its endpoint to each test file in `SHARED_BROWSER_ENV`.
`const suite = browserSuite()` at the top of a file connects it to that
Chromium and starts one static server on the first test that calls
`suite.open(t)`, and disconnects and closes them after the file's last test;
`open` returns `{ browser, base }`, where `browser.newPage(options)` and
`browser.newContext(options)` open fresh contexts that the test's
`browser.close()` closes, and `base` is the server's URL. `open` throws
outside the runner, so a browser test never launches a browser of its own,
and calls `t.skip` and returns null when Playwright is missing or Chromium
fails to launch, so the Node layer runs green without them. Playwright loads
by `import('playwright')`, falling back to a global install beside
`process.execPath` in the Windows layout (`node_modules` in the binary's
directory) or the POSIX one (`../lib/node_modules`). `pages` maps a path to
an HTML string the server returns in place of a file.

## INTERNAL PATTERNS

What earns a browser test — the rules every new or extended browser test
meets, so the tier stays light:
- **A test is a browser test only when it needs a real browser**: real
  layout and computed geometry, WebGL or canvas pixels, real input events
  and focus, a user flow across screens, a platform API. Pure logic, string
  and state computation, markup and CSS rules are pinned in the fast tier
  (static checks, [testing-conventions.md](testing-conventions.md)), and a
  browser test never re-asserts what a fast test pins: a DOM-free assertion
  goes to the fast tier.
- **Every browser test proves behaviour.** A test that only finds an element
  present or visible, a class set or a text shown is not written.
- **Each behaviour is proven once in the tier.** A user flow — a game played
  to its end, a screen's main flow — has one walk across the whole suite; a
  new check on a flow already walked extends the file that walks it.
- **One page load per file where the facts allow**: facts about the same
  page go in one test or share its page, each assertion with its own message
  naming what failed.
- **A window-size loop covers only the sizes whose layout differs** (the
  breakpoints), not a spread of sizes.
- **A state is reached by driving it** — the `__ms` hook, a fixed board, a
  stub that answers at once — never by a fixed wait or a stub's delay; waits
  follow [testing-conventions.md](testing-conventions.md)'s timing slack. A
  check that can only be written by waiting stays out of the suite.
- **`[slow]` takes only the long walks and flavour checks of timing and
  motion** that [testing.md](testing.md) § OVERVIEW's tiers name, one
  flavour check per behaviour.
- **A new browser test file reaches its code through its import closure**,
  so the affected-tests mapping ([testing.md](testing.md) § OVERVIEW) runs
  it only when a change reaches that code. The smoke sets stay the fewest
  files and change only in `affected-tests.mjs`, which defines them.

How a browser test is built:
- **Local static server**: the helper's `serveRoot()` — an in-process
  `node:http` server on a free port over the repo root (ES modules fail on
  `file://`). Artefact
  screenshots (`components.test.mjs`) are taken only with `MS_SHOTS=1` set,
  into a `mkdtemp` directory; without it a theme's look is compared through
  computed colours, and the contrast checks run either way.
- **Input that a round trip cannot stretch.** An input whose meaning
  depends on how long it is held is completed inside the browser, never
  across a test-to-page round trip, which on a loaded machine passes any
  threshold: a faked controller's tap is pressed and released in the page
  within one animation frame (the shell's frame loop polls first), so menu
  auto-repeat never fires (`shell-pad-walk`, `shell-menu`, `settings-page`); a touch tap or
  one-finger drag is a gesture the browser synthesizes
  (`Input.synthesizeTapGesture`, `Input.synthesizeScrollGesture`), so the
  long-press (`LONG_PRESS_MS`) never sees it (`classic2d-touch`, the 3D look in
  `shell-mode-3d`).
- **A Classic 2D board is measured once the board art hand-off has
  happened** (`BOARD_ART.current()`,
  [classic2d-tile-skin-cache.md](classic2d-tile-skin-cache.md)): until the theme's
  number font loads the skin has no board module, and the board is laid out,
  steadily, with no gap (`classic2d-mode`, `classic2d-view`, the menu
  previews in `shell-menu`).
- **A card is measured once it has settled.** A card pops in and a
  closing layer or confirm box stays displayed while it fades out
  ([app-shell-stylesheet.md](app-shell-stylesheet.md)), so a check of a card's size
  waits until its `getAnimations()` have finished, and a check that a layer
  has gone waits for its `display: none`.
- **A browser test that needs a game state plays a fixed board** — fixed
  mines or a fixed seed that reaches it (a loss, not a first-click win),
  pinned by a fast test beside it; a stubbed generation worker answers only
  the test's own board, so the start-up's daily pre-generation never takes
  its place.

## DOMAIN DEPENDENCIES

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md): "Rules" (the
  timer rule in browser tests).

## CROSS-REFERENCES

- [testing-browser-env.md](testing-browser-env.md) — the browser
  environment: Playwright, SwiftShader, the 3D backdrop kept out of the way,
  driving `window.__ms`.
- [testing-conventions.md](testing-conventions.md) — the conventions every
  test follows, timing slack and the tripwires.
- [testing.md](testing.md) — running the suite, the tiers, the runner;
  [testing-files.md](testing-files.md) — where each test goes.
- [app-shell.md](app-shell.md) — `window.__ms`, the surface Playwright
  drives.

## WHEN TO READ THE SOURCE

- A browser test that needs a helper option `browserSuite` lacks:
  `tests/helpers/browser.mjs`.
