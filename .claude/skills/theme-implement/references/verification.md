# Verifying the theme

Read at step 6. Resolve how tests run per
`../../task-engine/references/testing-policy.md`; this project names its
runners in `.claude/context/testing.md`.

## The conformance tests, then the full suite

1. Run the theme tests: `tests/theme-conformance.test.mjs` (every registered
   theme's files, fonts, scope, motion rule, tokens, parts and states, slots,
   contrast, board module and its checks on every flat grid, and its gallery
   in a browser),
   `tests/theme-registry.test.mjs` and `tests/theme.test.mjs` (the registry
   and its pre-paint mirror).
2. A failure in the theme's own files is fixed there — the value it names
   re-read from the artboard, or derived by its rule — and the tests run
   again, until they pass. A fix never changes a test, the catalogue, the
   board module's shape or any file outside the theme's folder and its
   registry entry (`./files.md`).
3. Run the full suite. A failure caused by the theme's own files is fixed
   the same way; a failure that needs any other file is a stop
   (`./stops.md`).

## Rendering beside the artboards

Once both pass, render with Playwright, through a script written to the
scratchpad — never the repository — that takes `loadPlaywright` and
`serveRoot` from `tests/helpers/browser.mjs`:

- **The gallery** — `dev/components.html?theme=<id>`, full page.
- **The screens** — each screen artboard the run can reproduce: a screen it
  can reach from start-up through the page's own controls or the `__ms`
  debug hook (`.claude/context/app-shell.md`), with the theme stored as the
  settings document's theme before load (the document `js/theme.js`
  `readStoredTheme` reads), at the artboard's window size. A screen it cannot
  reach is named as not compared.
- **The hexagon and triangle tiles** — every state, and every number the
  grid shows, painted by `paintTileWith` (`js/classic2d/tile-skin.js`) from
  the theme's board module through cells of `createGeometry('hex', …)` and
  `createGeometry('tri', …)` (`js/geometry/index.js`), the triangle in both
  orientations, on a scratchpad page at the sheet's tile size and gap, for
  the Hexagon and Triangle board sheets.
- **The artboards** — the saved artboard files, rendered at their board size
  with JavaScript disabled and every request that is not a local file
  aborted, so the canvas's content runs nothing and fetches nothing.

Show each render beside its artboard — a comparison page in the scratchpad
placing each pair side by side, captured and viewed — and compare them part
by part. A difference in a value the run mapped is fixed in the theme's
files and the tests run again; a difference that comes from the shared
layout, a component the gallery draws in another state or size, or fonts the
artboard render could not load, is named in the report as not closed, with
its cause.
