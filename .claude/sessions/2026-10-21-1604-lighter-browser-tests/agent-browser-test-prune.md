# Area handoff — browser-test-prune

Owner of the browser tier's content: which "in a browser" tests exist and what
each proves. How tests run (runner, lock, hook, mapping) is the test-harness
area's (`agent-test-harness.md`); the tiers are `.claude/context/testing.md`'s.

## Files and regions owned

- `tests/**/*.test.mjs`, except `tests/affected-tests.test.mjs` and
  `tests/helpers.test.mjs` (there: file names in the smoke-set pins only).
- `SHELL_SMOKE` / `RENDER_SMOKE` in `.claude/external/affected-tests.mjs`,
  only when a file in them is deleted or renamed.

## Rules the owner set

- Drop a browser test that is trivial (only presence/class/text, no
  behaviour) or redundant (another browser or fast test proves it).
- A DOM-free assertion inside a browser test moves to the fast tier, then
  the browser copy goes.
- Merge near-duplicates in one file into one page load when the failure
  message stays clear. Keep each screen's user flow, each feature's
  acceptance behaviour, WebGL/render checks and slow flavour checks.
- When in doubt, keep and list as a candidate.

## Pins that constrain pruning (in files this area does not own)

- `tests/affected-tests.test.mjs`: each smoke set is smaller than an eighth
  of the browser files, a shell change selects under a quarter of them;
  `components-ready`, `-learn-end`, `-menu-screens`, `-pause` must stay
  browser files; the named `[slow]` tests (pad walk, focus containment,
  backdrop frames, loss wave, flag flash, 2D fixture replay) keep the tag.
- `tests/helpers.test.mjs`: a file with a browser test imports the helper.
  A file losing its last browser test drops its `browserSuite` import too.

## State

The prune is done, in the working tree, uncommitted:
- 53 browser files, 118 browser test declarations, 12 `[slow]` declarations;
  fast tier 2208 tests, green.
- One all-browser run (`run-browser-tests.sh`, non-slow): 124 tests green in
  199 s, measured before the last drop (replay-viewer's no-WebGL test,
  about 3.5 s).
- Files whose browser part is gone: `classic2d-pointer`, `tile-art`,
  `shell-mode-host`.

## Candidates left on purpose (not done)

- `shell-mode-3d` generating-card test: the longest browser test (about
  17 s), almost all the stub worker's 12 s pre-generation delay; shortening
  it risks the in-flight board arriving before the second click.
- Merges that save a page load each: `results-watch` into `results`'s win;
  `components-learn-end` into `components-ready` (pinned as separate files);
  `shell-mode-3d` adapter test into `shell-pause`'s 3D pause test (keep its
  pointer-resume and context-loss parts); `records-screen` Averages test
  into its one-line-figures test; the render-3d-feedback pixel tests onto
  one page; `platform-browser` + `platform-blob-store`.
- `mode3d-session`'s worker game to its end: redundant with `mode3d-end`,
  but named in both smoke sets.
- String checks inside kept tests that fast tests already pin (summaries,
  bests titles, strip texts).

## Known failure, not this area's

- The former `[slow]` pulse test in `render-3d-feedback` failed on this
  machine at HEAD; its timing part is gone (the motion test's frozen clock
  covers the pulse), the Ctrl-ghost part is a plain browser test now.

## Pitfalls

- Run browser files only through `.claude/external/run-affected-tests.sh
  <files>`; the hook denies a bare `node --test` on them.
- Test names are matched by the runners: never put `[slow]` in a name
  outside the slow tier.
