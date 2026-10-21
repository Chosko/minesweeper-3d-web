# Lighten the browser test tier: leftovers

## Goal
Apply the leftover candidates of the browser-test pruning passes against
`.claude/context/testing-browser.md` § "What earns a browser test": move a
timing check to the slow tier, keep the 3D backdrop out of 2D and screen tests
that load the page with it running, give the renderer's smoke set only files
that run untagged, and share one page per device across the window sizes in
`shell-menu` and `shell-daily`. Find why `records-screen`'s layout test could
not be merged into its first test.

## Acceptance criteria
- `classic2d-motion`'s flood-reveal frame-budget test is named `[slow] in a browser, …`,
  and `tests/affected-tests.test.mjs` pins that tag beside the other flavour checks.
- `classic2d-button-swap` and `records-screen-3d`'s 2D | 3D switch test load
  `index.html` with no 3D backdrop running (`removeWebGL2`, defined in the
  file); `shell-first-use`'s Classic 2D strip test, which ends by starting a
  3D game, loads `index.html?still-backdrop`; every other plain
  `index.html` load left is a 3D gameplay test, a page without the shell
  (no JavaScript, the module graph refused) or a file whose test already
  refuses WebGL 2.
- `RENDER_SMOKE` holds only `mode3d-end` (no browser file draws a 3D replay
  in an untagged test, and `replay-viewer-3d` does not reach `js/render.js`);
  `tests/affected-tests.test.mjs` pins that every smoke file holds a browser
  test that runs with `[slow]` skipped, and its `RENDER_SMOKE` pin follows.
  `.claude/context/testing.md`'s description of the set follows.
- `shell-menu`'s fit, previews, coarse-pointer and key-hints tests are one
  test on one mouse page resized through the desktop sizes and one touch page
  resized from the phone to the coarse-pointer sizes; every assertion keeps
  its message.
- `shell-daily`'s artboards test and Classic 2D preview test are one test on
  one mouse page resized through the desktop sizes, and one phone page;
  every assertion keeps its message.
- `records-screen`: the cause of the failed merge is found and written under
  Decisions; the tests are merged only if the cause is a test-state leak.
- No file under `js/`, `css/` or `index.html` changes. The fast tier and the
  touched browser files pass, and one all-browser run passes.

## Decisions
- `RENDER_SMOKE` drops `replay-viewer-3d` rather than swapping in another
  file: no browser file draws a 3D replay in an untagged test, and
  `mode3d-end` draws a 3D game through `js/render.js` to its end.
- `records-screen-3d`'s switch test takes `removeWebGL2`: it plays no 3D
  game; the 3D records are records, not a WebGL entry.
- `records-screen`'s failed merge was a test-state leak, so the tests are
  merged: the first part records a game on the custom 20 × 12 board ending
  later than every game the layout part records, and Records opens on the
  board whose latest game ended last (`lastBoardPlayed`), so it opened on the
  custom board, which holds no replay. The merged test picks Beginner, the
  replays' board, before opening the Replays tab.

## Hints
- `tests/classic2d-motion.test.mjs` (the frame-budget test)
- `tests/classic2d-button-swap.test.mjs`, `tests/shell-first-use.test.mjs`, `tests/records-screen-3d.test.mjs` (plain `index.html` loads)
- `.claude/external/affected-tests.mjs` (`RENDER_SMOKE`), `tests/affected-tests.test.mjs` (smoke and slow pins)
- `tests/shell-menu.test.mjs` (fit, previews, coarse pointer, key hints; `controllerPage`)
- `tests/shell-daily.test.mjs` (preview and artboards tests)
- `tests/records-screen.test.mjs` (first test; layout and Delete confirmation test)
- `.claude/context/testing-browser.md` § INTERNAL PATTERNS, `.claude/context/testing.md` § OVERVIEW

## Drift
- `.claude/context/testing.md` § OVERVIEW — diverges: describes `RENDER_SMOKE` as the files that draw a 3D game to its end and a 3D replay; the set keeps the 3D game only. Updated in the same commit.
- `.claude/context/testing.md` § OVERVIEW — diverges: the slow tier's flavour-check list does not name the Classic 2D flood's frame budget; the change tags it. Updated in the same commit.
- `.claude/context/testing-browser.md` § INTERNAL PATTERNS — settles: the backdrop rule and the one-page-per-device rule, which the change applies to the named files.
