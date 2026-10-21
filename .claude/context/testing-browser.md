# Testing — the browser layer: helper, server, environment, inputs, `__ms`

## OVERVIEW

How the Playwright tests (those named "in a browser") are written: the
shared helper every browser test file goes through, the local server, the browser environment they run in, the 3D backdrop kept out
of their way, inputs a round trip cannot stretch, fixed boards for a game
state, and `window.__ms`. Conventions every test follows, and the
tripwires, are [testing-conventions.md](testing-conventions.md); where
tests go and how the suite runs is [testing.md](testing.md).

## PUBLIC API

`tests/helpers/browser.mjs` — `browserSuite`, `serveRoot`,
`SWIFTSHADER_ARGS`.

Every browser test file goes through this helper and launches no browser
and runs no server of its own (`tests/helpers.test.mjs` pins this). `const suite = browserSuite()` at
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

## INTERNAL PATTERNS

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
  auto-repeat never fires (`shell-pad-walk`, `shell-menu`); a touch tap or
  one-finger drag is a gesture the browser synthesizes
  (`Input.synthesizeTapGesture`, `Input.synthesizeScrollGesture`), so the
  400 ms long-press never sees it (`classic2d-touch`, the 3D look in
  `shell-mode-3d`).
- **A card is measured once it has settled.** A card pops in and a
  closing layer or confirm box stays displayed while it fades out
  ([app-shell-stylesheet.md](app-shell-stylesheet.md)), so a check of a card's size
  waits until its `getAnimations()` have finished, and a check that a layer
  has gone waits for its `display: none`.
- **A browser test that needs a game state plays a fixed board** — fixed
  mines or a fixed seed that reaches it (a loss, not a first-click win),
  pinned by a fast test beside it; a stubbed generation worker answers only
  the test's own board, so the start-up's daily pre-generation never takes
  its place (`shell-mode-3d`).

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

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md): "Rules" (the
  timer rule in browser tests); "Controls" (picking exclusions in the
  browser).

## CROSS-REFERENCES

- [testing-conventions.md](testing-conventions.md) — the conventions every
  test follows, timing slack and the tripwires.
- [testing.md](testing.md) — running the suite, the tiers, the shared
  browser helper, where each test goes.
- [app-shell.md](app-shell.md) — `window.__ms`, the surface Playwright
  drives, and the `still-backdrop` hook.

## WHEN TO READ THE SOURCE

- An `__ms` member not in [app-shell.md](app-shell.md): read the end of
  `js/main.js`.
