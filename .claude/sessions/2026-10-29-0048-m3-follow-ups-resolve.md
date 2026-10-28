# Session: 2026-10-29 00:48

Work: document .claude/runbooks/4-m3-tasks-implementation.md
Running: follow-ups-resolve on runbook 4's closing-report follow-ups (after /session-resume of m3-runbook-follow-ups)

This session worked through the follow-ups list left by runbook 4's stopped run. Most items are done and committed. Two questions are waiting for the user, and the runbook resumes after the first is answered. The working follow-ups list and the two questions are at the end of this file, verbatim as last printed.

## What we are building

Milestone m3-on-steam, through runbook 4 `m3-tasks-implementation`, stopped after step 6 (`Steps: 16/41`). This session cleared the run's follow-ups so that the run can resume at step 7 (task 90, which documents the desktop host).

## What worked (with evidence)

All commits are on `main` and **not pushed** (the only push of this save is the save commit itself):

- `1c97068`: `shared-screen-layout` and `in-game-layout` flipped to `[DONE]` in `.claude/FEATURES.md`.
- `abcc825`: replay viewer comments in `css/components.css` and `css/style.css` now say "at its natural size, centred" (task 290 `9968800` had moved every screen to natural size and left this wording behind).
- `9cb6660`: `desktop/package-lock.json`, generated with `npm install --package-lock-only --ignore-scripts`; locked electron 44.9.3 and steamworks-ffi-node 0.11.3 match `desktop/node_modules`.
- `9471186`: the tile-skin failure fixed in code, not the test. The painter in `js/classic2d/tile-skin.js` snapped only a shaped tile's glyph-box corner to device pixels. A triangle's box is side/√3 (25.4 px at the 44 px floor), so the "1" stem antialiased away: 18 ink pixels, 25 needed. The box's sides are now snapped too, and it keeps its centre. The "1" gets 27. Not caused by `a347cc1`: the test failed from `add9968` (task 264) on. `run-full-tests.sh`: 2643/2643 fast, 43/43 browser (agent's report).
- `77d363f`: `deploy-steam.sh` at the repo root (`--dry-run` prints the upload command instead of running it). It reads SteamCMD's path and login from the git-ignored `desktop/steampipe/deploy.env`. A dry run built and rendered correctly, and the user then deployed with it.
- `545f873`: the desktop window is opaque on black, and fullscreen takes the display's full bounds (resizable only while fullscreen; windowed bounds restored on leaving). The user checked it on the Steam client: overlay opens on every Shift+Tab and pauses, no flicker, fullscreen and windowed restore correct, relaunch in fullscreen correct, look acceptable. Fast suite 2643/2643.
- `9932480`: `/architect amend feature=steam-desktop-host` records the opaque window, the three overlay switches with the ruled-out options, and keep-repainting while Steam runs. Classified editorial; no task re-planned; task 90's body has nothing stale.
- Item "in-game quit" checked: the in-game Quit is the title bar's Quit on the game window. Task 107's criteria cover the title bar Quit on every desktop window, with the leave-game confirmation during a game, so no new task.
- Spike leftovers in code: none. Search of `js/` and `desktop/` (excluding `node_modules`/`out`) finds no `SPIKE_PROBE`, `--probe-` or steamworks.js.

## What did not work (and why)

- `!` commands typed by the user did not run: the user was on Remote Control, where the `!` prefix arrives as plain text. The user deployed from their own terminal instead.
- The first `deploy.env` written with `printf` lost its backslashes (`\t`, `\b`). It is written with forward slashes now. Keep paths in that file forward-slashed.
- This session never runs SteamCMD or `deploy-steam.sh` without `--dry-run`: it is a production deploy, the permission check refuses it, and SteamCMD may ask for the password or Steam Guard code.

## What has not been tried yet

- Toasts inside the frame-sized window: never deliberately tested. The user does not know how to trigger one and never saw one outside the window.
- `--parallel 4` for the rest of the runbook: still not used.

## Current state of files

| File | Status | Notes |
| --- | --- | --- |
| `.claude/runbooks/4-m3-tasks-implementation.md` | In progress | Step 7's context notes (and step 6's Done note) still say the window is transparent pending `/architect amend` and that the feature doc lacks the repainting rule. Out of date since `9932480`; follow-up 2 |
| `.claude/domain/features/steam-desktop-host.md` | Complete | Amended in `9932480` |
| `desktop/window.js` | Complete | Opaque window and fullscreen bounds, `545f873` |
| `desktop/steampipe/deploy.env` | Complete | Git-ignored; holds `STEAMCMD` and `STEAM_LOGIN` |
| `deploy-steam.sh` | Complete | `77d363f` |
| `desktop/out/` | Complete | Holds the build the user deployed to `internal` (opaque window); git-ignored |

## Decisions made

- Window: opaque. The user preferred it, and every check on the Steam client passed.
- The tile-skin test was right and the painter was wrong: `hex-tri-board-art.md` requires glyphs legible at each grid's floor. No tolerance loosened.
- `desktop/package-lock.json` is committed (user: "commit a lock file").
- Steam deployment credentials stay out of the repo, in a git-ignored `deploy.env`, like the app ids in `config.json`.
- Width-vs-height frame steps are kept for later, not fixed now (user).
- Hand removals in Steamworks are the user's, for later (user).
- The runbook resume (follow-up 1) waits for follow-up 2, so that step 7 does not read out-of-date notes.

## Blockers and open questions

The two questions last asked, unanswered:

1. Approve follow-up 2: a dated note in runbook 4's step 7 context, through `/pipeline-revise`, saying the amendment landed (`9932480`)? On approval the runbook resume starts after it.
2. Add the window-glitch tasks (follow-up 3) now through `/task-add`, each placed in runbook 4, or keep them for later?

## Exact next step

Ask the user the two questions in "Blockers and open questions", with the follow-ups list below. A reply by number goes to `follow-ups-resolve`. Once follow-up 2 is approved and done, run `/runbook-run 4 --attended --no-dashboard --to 9` (steps 7, 8, 9; stop before step 10, task 93, which needs the user at the partner site).

## Environment and setup notes

- Deploy: the user runs `./deploy-steam.sh` from their own Git Bash at the repo root (package, SteamPipe render, SteamCMD upload, live on `internal`). Never type, store or ask for passwords or Steam Guard codes.
- Commits in this repo carry no `Co-Authored-By` or `Claude-Session` lines (user's CLAUDE.md overrides the harness).
- Browser tests run only through `.claude/external/run-*.sh`, one Chromium at a time; don't run the runbook in parallel with another session's browser tests.

## Follow-ups (verbatim as last printed)

**Approved**

1. **Resume runbook 4:** `/runbook-run 4 --attended --no-dashboard --to 9`. Ready to start, but held for item 2.

**Awaiting approval**

2. **Out-of-date notes in runbook 4:** add a note to step 7's context saying the amendment has landed (`9932480`), so step 7 builds on the amended document. Steps 6 and 7 are recorded history, so this adds a note rather than rewriting them, done through `/pipeline-revise`.
3. **Desktop window glitches:**
   - the top and bottom corners are wrong
   - a popup during a game grows the whole window to fit both
   - the results popup widens the window
   - toasts are untested

   Add one task per glitch now with `/task-add`, each placed in runbook 4, or keep it for later.
4. **Width vs height, kept for later:** the game window shrinks in steps based on width only, but the title bar goes compact when the height drops below 820 px.
5. **Yours, by hand in Steamworks, later:** remove the achievement and the leaderboard named `SPIKE_PROBE`, and note down the Cloud quota you set.

Do you approve item 2, so the runbook starts once it's done? And should I add the glitch tasks in item 3 now, or keep them for later?
