# Session: 2026-10-31 00:06

Work: document .claude/runbooks/4-m3-tasks-implementation.md
Running: /orchestrate-mode (on), with follow-ups-resolve on the /follow-ups list

This session ran in orchestrate mode. It fixed the four desktop-window glitches left by runbook 4's stopped run, caught the domain layer up, planned the leftovers as tasks inside runbook 4, and recorded the Steam Cloud quota. Runbook 4 stays paused on the owner's word: resume it only when the owner says so.

## What we are building

Milestone m3-on-steam through runbook 4 `m3-tasks-implementation` (Steps 16/43, paused). This session cleared the run's follow-ups so the runbook can resume.

## What worked (with evidence)

Everything is committed and pushed to origin/main.

- `3d3ec1b`: runbook 4 step 7 gets a context note: the steam-desktop-host amendment has landed (`9932480`).
- `90fd6a8`: the windowed desktop toast shows at the bottom of the window, centred on it and no wider than it. Before this it landed below the window. Covered by a new browser test in `tests/components-game-area.test.mjs` that fails without the fix. `32d6211` is its domain catch-up (`shared-screen-layout.md`).
- `3f70df8`: the windowed desktop fatal card fills the window and centres in it. `97a928e` is its catch-up.
- `f394166`: a popup over a flat game (pause, results, ctx-lost, ready, learn-end) is the window on its own, never the union with the game window. The markers are `data-window-over` and `data-window-inside` (`#c2d-status` stays inside the game window). This also fixed a `_centreStatus2D` offset bug. `1269076` is its catch-up, with a note on runbook step 7.
- `98b84be`: the window-edge frame takes 8 px corners matching Windows 11's own rounding (`WINDOW_EDGE_CSS`). The drop edge is read from the computed box-shadow (`dropEdgeOf`) and drawn inside the window. `2ee10b2` is its catch-up, with a note on step 7.
- The owner deployed and tested all of the above on Steam: "all good".
- `run-full-tests.sh` on the combined tree passed 2649/2649 fast.
- `70ea5fc`, `186e40f`, `e738737`: tasks 294 (frame steps follow height as well as width) and 295 (re-measure the window after a theme switch; check the failed-board card over the pause card). They are runbook 4 steps 42 and 43, placed to run next, before step 7.
- `c218343`, `2dd79db`, `4c18952`: the Steam Cloud quota (100 MB and 1000 files per user, set by the owner in Steamworks) is recorded in `steam-cloud-saves.md`. Task 93 is reconciled to a quota *fit check*, and runbook step 10 has a note saying so.
- The owner deleted the `SPIKE_PROBE` achievement and leaderboard in Steamworks.

## What did not work (and why)

- An `/architect amend feature=steam-desktop-host` for the quota was the wrong target: steam-desktop-host hands Steam Cloud to `steam-cloud-saves`. It also stopped because the amendment makes task 93 stale. It was re-run against steam-cloud-saves.
- Parallel agents sharing `css/style.css` once collided at commit: one agent committed another's uncommitted `.fatal` rule and amended its own commit to drop it. When agents share a file, stage only your own hunks.

## What has not been tried yet

- The before-and-after `/pipeline-check` around the step 10 `/pipeline-revise` was skipped. The drift checks for the earlier catch-ups ran through a read-only script, not through `/pipeline-check` itself.
- `--parallel 4` for the rest of runbook 4 is still unused.

## Current state of files

| File | Status | Notes |
| --- | --- | --- |
| `.claude/runbooks/4-m3-tasks-implementation.md` | In progress | Paused at 16/43. Steps 42 and 43 run next, then 7 to 9. Step 10 (task 93) needs the owner at the partner site. |
| `js/platform/window-actions.js` | Complete | `measure()` handles the popup rule, the edge frame and the drop edge |
| `css/style.css` | Complete | Windowed toast, fatal card and status-card rules |
| `.claude/domain/features/steam-cloud-saves.md` | Complete | Quota recorded |
| `.claude/tasks/93.md`, `294.md`, `295.md` | Not started | All `[MISSING]` |

## Decisions made

- Corners: the window-edge frame uses 8 px corners on desktop to match Windows 11, and the drop edge stays visible. The owner rejected a transparent window (it was moved away from for the overlay), `setShape` (jagged corners) and square corners.
- Popups: the window becomes the popup alone, the quick fix. The owner rejected a detached second window (a design-level change) and laying popups out inside the game window (no narrow results layout exists).
- Toasts: they show at the bottom of the window, over the bottom bar, for their 2 to 5 s.
- Always push every commit, the session's own and every agent's. This is an owner rule, saved to memory.
- Do not resume runbook 4 until the owner says so.

## Blockers and open questions

- One follow-up awaits the owner's approval: run `/pipeline-check`, which was skipped around the step 10 revise.
- Step 10's title still says "…configuration and quota". An amend cannot rename a step title.
- Two older specs (2026-10-21, 2026-10-25) still wait for their `/pipeline-revise --catch-up`. They are tracked on disk under `.claude/specs/`.

## Exact next step

Wait for the owner's word. When they say resume, run `/runbook-run 4 --attended --no-dashboard --to 9`: steps 42, 43, then 7, 8 and 9, stopping before step 10, which needs the owner at the partner site.

## Environment and setup notes

- Deploy: the owner runs `./deploy-steam.sh` from their own Git Bash. Never run it without `--dry-run`, and never handle Steam passwords or Steam Guard codes.
- Commits carry no `Co-Authored-By` or `Claude-Session` lines. Always push.
- Browser tests run only through the `.claude/external/run-*.sh` scripts, one Chromium at a time, behind a lock.
- The area handoffs are in this file's stem folder: `win-sizing` holds the window-sizing state; `win-toasts`, `win-fatal`, `domain-toast` and `runbook-notes` hold the rest; the `win-corners`, `win-popup-grow` and `win-results-widen` investigation notes are now carried by `win-sizing`.
