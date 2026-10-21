# Area handoff — integration

Owner of rebuilding the lighter-browser-tests work on top of origin/main.
The harness, prune and docs rules are the handoffs in
`.claude/sessions/2026-10-21-1604-lighter-browser-tests/`; this file holds
only the integration's state.

## State

- Branch `integrate/lighter-tests` (no upstream set), tip `c94e8b8`, built
  on `origin/main` by cherry-pick. `main` untouched; nothing pushed.
- Picked in order: 6262bed (message rewritten: subject + blank line + body),
  063311d, 4e09bb8, 28f917e, 6aa8215, 5c5f5a2, 919d832, ccaacdb; then one
  commit fixing `SHELL_SMOKE`'s stale "results layout" comment.
- Skipped as obsolete: 3054808, 72bfdbc (tasks 233/240 resolved upstream).
- Fast tier: 2309 pass. All-browser run (`MS3D_ALL_BROWSER=1`): 49 files,
  112 tests, all pass, 173 s wall, one Chromium. Slow tier not run.

## Resolutions worth knowing

- Upstream moved the helper description to `testing-browser.md` § PUBLIC
  API; the shared-Chromium text lives there, `testing.md` points to it.
- `shell-menu.test.mjs`: upstream rewrote the menu fit and preview tests
  (task 228); local's one-page merge of fit + previews + coarse pointer +
  phone hints dropped, upstream's version kept whole.
- `records-screen`: 1920 × 1080 restored to the merged figures/averages
  test, since upstream shows the board code column only at ≥ 1440 px.
- `components-ready`: upstream's five card sizes kept (each its own card
  width); upstream's Learn 3D end-card line/icon checks folded in from the
  deleted `components-learn-end`.
- `components-game3d`: `l` stays dropped (same density as `m`), upstream's
  density arrays kept.
- `shell-mode-3d`: upstream's ready-card markup (`.ready-keys dt`, no
  `.ready-touch`) applied to the merged 1024 test; the title text checks
  stay dropped.
- `results.test.mjs`: Watch replay's Records title is `Beginner · Bests`.
- Dropped despite an upstream edit (same check, edit was markup/text only):
  `classic2d-mode` 1024 pause-card key rows, `classic2d-touch` phone hint
  strip text, `components` counter-strip/figures panel (size steps pinned
  by a fast test), `settings-page` Controls action (upstream removed it).

## Open

- `.claude/context/testing.md` is 156 lines, over the 150-line context
  cap; a `/context-update` split is due.
- Candidates against "What earns a browser test" (new or rewritten
  upstream, not pruned here): `shell-menu` fit/previews/coarse/key-hints
  (a context per size, four page loads for one screen);
  `shell-daily` artboards test and preview test (new page per size).
