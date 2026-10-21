# Area handoff — browser-test-prune

Owner of the browser tier's content: which "in a browser" tests exist and what
each proves. How tests run (runner, lock, hook, mapping) is the test-harness
area's (`agent-test-harness.md`); the tiers are `.claude/context/testing.md`'s.

## Files and regions owned

- `tests/**/*.test.mjs`, including the file-name pins in
  `tests/affected-tests.test.mjs` and `tests/helpers.test.mjs` (only to follow
  renamed, merged or deleted files).
- `SHELL_SMOKE` / `RENDER_SMOKE` in `.claude/external/affected-tests.mjs`.

## Rules the owner set

- Drop a browser test that is trivial (presence/class/text only) or redundant
  (another browser or fast test proves it); drop string assertions fast tests
  pin when they cost a page load or navigation.
- A DOM-free assertion inside a browser test moves to the fast tier.
- Merge near-duplicates into one page load, each fact keeping its own
  assertion message; delete a file only when all its tests moved.
- Trim size loops to the sizes that differ in layout; one page resized where
  the device flags (touch, mobile) are the same.
- Keep each screen's user flow, each feature's acceptance behaviour once,
  WebGL/render checks and the slow flavour checks.

## Pins that constrain pruning (in files this area does not own)

- `tests/affected-tests.test.mjs`: each smoke set smaller than an eighth of
  the browser files (49 files: at most 6); a shell change selects under a
  quarter of them; `components-ready`, `-menu-screens`, `-pause` stay browser
  files; the named `[slow]` tests keep the tag.
- `tests/helpers.test.mjs`: a file with a browser test imports the helper; a
  file losing its last browser test drops its `browserSuite` import.

## State (working tree, uncommitted)

- 49 browser files, 96 browser test declarations, 12 `[slow]`; fast tier
  2206, green. All-browser run (non-slow): 95 tests green, 155 s wall.
- `SHELL_SMOKE`: components-menu-screens, components-pause, results,
  mode3d-end, replay-viewer. `RENDER_SMOKE`: mode3d-end, replay-viewer-3d.
- Files with no browser test left: `classic2d-pointer`, `tile-art`,
  `shell-mode-host`, `platform-blob-store`, `results-watch`,
  `shell-returning`. Deleted: `components-learn-end`.
- Where merged facts live now: Watch replay in `results`; Learn 3D end cards
  in `components-ready`; the 3D adapter's reports, pointer resume and context
  loss in `shell-pause`'s 3D test; the phone toolbar layout and Learn 3D's
  touch prompt in `shell-pause`'s phone test; the 3D mouse ready card in
  `shell-mode-3d`'s 1024 pause-card test; the blob round trip in
  `platform-browser`; Averages in `records-screen`'s one-line-figures test;
  last mode / last board in `classic2d-mode`'s first test; the seek bar
  hint in `shell-pad-walk`'s rumble test; Settings by controller in
  `settings-page`'s first test; motion on/off in `render-3d-motion`'s one.
- A 3D game played to its end through the shell: `mode3d-end` only;
  `mode3d-session` keeps the no-guess worker board with a flag before it and
  the failed board's offer.

## Rejected / not done

- Merging `records-screen`'s layout + Delete-confirmation test into its
  first test: tried, failed ("ten replays a page" got 0 after the first
  test's records); reverted, cause not found.
- Merging `theme`'s two switch tests (both build a `themeApplier()` on the
  gallery page; a second `start()` on one page untested).

## Candidates left on purpose

- `classic2d-motion`'s frame-budget test is a timing check; could carry
  `[slow]`.
- Plain `index.html` loads on 2D/menu subjects (`classic2d-touch` ×3,
  `classic2d-button-swap`, `shell-daily`, `shell-first-use`) could take
  `removeWebGL2` / `?still-backdrop` if they need no 3D entry.
- `RENDER_SMOKE`'s `replay-viewer-3d` holds only a `[slow]` test, so the
  smoke run (slow skipped) runs nothing from it.
- `classic2d-mode`'s first test waits ~2 s on the clock through a pause.

## Pitfalls

- Browser files only through `.claude/external/run-affected-tests.sh
  <files>`; the hook denies a bare `node --test` on them.
- Never put `[slow]` in a name outside the slow tier.
- Setting `fullscreen` in a test resizes the headless window; turn it off
  before touch gestures at fixed coordinates (`shell-mode-3d`'s tablet test).
- Bash heredocs here collapse `\\` to `\`; write edit scripts with the
  Write tool when they carry `\'`.
