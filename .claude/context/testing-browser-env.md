# Testing — the browser environment: Playwright, SwiftShader, the 3D backdrop, `__ms`

## OVERVIEW

The environment the Playwright tests (those named "in a browser") run in:
where Playwright is installed, WebGL 2 without a GPU, the menu screens' 3D
backdrop kept out of a test's way, and driving `window.__ms`. What earns a
browser test and how one is built are [testing-browser.md](testing-browser.md).

## PUBLIC API

`tests/helpers/browser.mjs`'s `SWIFTSHADER_ARGS` (the helper's API is
[testing-browser.md](testing-browser.md) § PUBLIC API); `index.html?still-backdrop`
and `window.__ms` ([app-shell.md](app-shell.md)).

## INTERNAL PATTERNS

Browser environment:
- Playwright is installed globally (`/opt/node22/lib/node_modules/playwright`,
  browsers in `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`); resolve it via
  `NODE_PATH` or an absolute import. Do not run `playwright install`.
- 3D needs WebGL 2 without a GPU: the run's one Chromium, which the runner
  launches and every browser test file shares, runs SwiftShader (the
  helper's `SWIFTSHADER_ARGS`, part of its launch flags in
  [testing.md](testing.md) § OVERVIEW); a test file passes no launch flags
  of its own. No-WebGL checks add an init script making
  `getContext('webgl2')` return null to their own page, so they share that
  browser.
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

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md): "Controls"
  (picking exclusions in the browser).

## CROSS-REFERENCES

- [testing-browser.md](testing-browser.md) — what earns a browser test, the
  shared helper, how a browser test is built.
- [testing.md](testing.md) — the runner that launches the shared Chromium.
- [app-shell.md](app-shell.md) — `window.__ms`, the surface Playwright
  drives, and the `still-backdrop` hook.

## WHEN TO READ THE SOURCE

- An `__ms` member not in [app-shell.md](app-shell.md): read the end of
  `js/main.js`.
