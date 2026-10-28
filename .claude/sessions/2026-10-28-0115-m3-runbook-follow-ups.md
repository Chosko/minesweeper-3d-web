# Session: 2026-10-28 01:15

Work: document .claude/runbooks/4-m3-tasks-implementation.md
Running: /runbook-run 4 --attended --no-dashboard — stopped by the user after step 6, closing report given

This handoff carries the closing report's follow-ups list of the runbook run, plus what the step agents learned on the real Steam client that lives in no document yet. The runbook body and `.claude/RUNBOOKS.md` are committed and current (`Steps: 16/41`, status `[PENDING]`, last commit `af375b1`).

## What we are building

Milestone m3-on-steam, through runbook 4 `m3-tasks-implementation`. This run finished steps 36–41, 4, 5 and 6: the desktop layout steps, Windows packaging and SteamPipe, the Steamworks binding spike (task 88) and the Steam adapter on steamworks-ffi-node (task 89). The run stopped before step 7 at the user's request. The closing report's follow-ups are the list to resume from; see "Exact next step".

## What worked (with evidence)

- Every step's `Done:` line in `.claude/runbooks/4-m3-tasks-implementation.md` names its commit and diffstat; commits `a7af289`, `9968800`, `18795db`, `5954e8f`, `66c3bbf`, `be4fb9c`, `6a41a20`, `321c54a`, `93cd785` are on `main` and pushed.
- Task 89's adapter passed the real Steam client check in two rounds (user's own report in chat): overlay opens on every Shift+Tab and pauses the game, going offline for ~30 s and back played on without errors, Alt+F4 and the taskbar's Close window ran the closing sequence and exited, launching `Minesweeper3D.exe` with Steam closed made Steam start and relaunch the game. No `%APPDATA%\Minesweeper 3D\crash.log` was written in any run.
- The spike (task 88) measured both bindings from a packaged build launched by Steam; the capability table exists only in step 5's report, summarised in step 7's `Context:` bullet of the runbook: steamworks-ffi-node 0.11.3 covers identity, presence, achievements, leaderboards (upload with details, global / friends / around / named players) and shared files (write, share, download, attach) plus the overlay event; steamworks.js 0.4.0 has only own identity and achievements.
- Full fast suite at step 6's commit: 2642 tests passing (agent's report).

## What did not work (and why)

- Overlay runs from the spike, by the user's notes (Launch Options in the Steam client, binding steamworks-ffi-node unless said):
  - default GPU mode: no overlay at all; Shift+Tab cycled the title bar's focus instead.
  - `in-process-gpu` + `disable-direct-composition`: overlay draws and the game pauses, but it flickers whenever the page redraws (the pause card's timer, for example).
  - steamworks.js: overlay draws, no flicker, game does not pause (no overlay event in that binding).
  - opaque window (`--probe-window=opaque`): no see-through, still flickers, and fullscreen sometimes drew only a top-left rectangle until focus left and came back; Electron left the opaque window at its windowed bounds on entering fullscreen.
  - ffi-node's own overlay window (`--probe-gpu=native`): no overlay, and dragging lagged at roughly 6–10 fps with a double image.
  - `use-angle=gl`: still flickers.
  - `ui-disable-partial-swap` (with the two switches above): no flicker. This is what ships in `desktop/main.js`. Cost: with the transparent window the page behind the overlay is semi-transparent; in 3D play only the pause panel stays opaque.
- The opaque window was never tested together with `ui-disable-partial-swap`.
- In the first task 89 build the overlay opened only once per launch: Steam draws its overlay and reacts to Shift+Tab only when the game draws a frame, and a paused game drew none. Fixed by keeping the page repainting while Steam runs (idle GPU cost).
- SteamCMD `SetLive "default"` from a script failed with "Failure" at step 4; the user set the placeholder build live through the web UI instead.
- A plain `npm install` in `desktop/` was refused by the permission check; `desktop/node_modules` was installed with `--ignore-scripts`. No lock file exists.
- The user's idea of freezing the timer while the overlay is open was judged unnecessary once `ui-disable-partial-swap` removed the flicker for every redraw.

## What has not been tried yet

- Opaque window with `ui-disable-partial-swap` and a fullscreen-bounds fix (`--probe-fullscreen-resizable` was in the H run's switches, but H ran without the partial-swap switch). The user prefers an opaque window.
- `--parallel 4` for the rest of the runbook. The user chose to keep it sequential for this run; the runbook header has no `Parallelism:` line and `runbook-run` ignores the project's `Parallel policy:`.
- Whether a toast stays inside the frame-sized desktop window (step 41's known gap); the user did not watch them all.

## Current state of files

| File | Status | Notes |
| --- | --- | --- |
| `.claude/runbooks/4-m3-tasks-implementation.md` | Complete | Steps 1–6 and 32–41 `[x]`; 7–31 `[ ]`; committed `af375b1` |
| `.claude/RUNBOOKS.md` | Complete | Runbook 4 `[PENDING]`, `Steps: 16/41` |
| `.claude/FEATURES.md` | In progress | `shared-screen-layout` and `in-game-layout` still `[PLANNED]` though every task is DONE; flip question unanswered |
| `.claude/domain/features/steam-desktop-host.md` | In progress | Lacks the overlay switches, the keep-repainting rule and the window decision; task 90 (step 7) or `/architect amend` adds them |
| `desktop/redist/steam_api64.dll` | Complete | Git-ignored; copied from the SDK by the step 6 agent; needed for a development run |
| `desktop/steampipe/config.json` | Complete | Git-ignored; branch `internal`, app 5517360, depot 5517361 |
| `desktop/out/` | Complete | Last packaged build and `steampipe/app_build.vdf`, both for task 89's second build; git-ignored |
| `css/components.css` | Complete | Stale head comment (replay viewer "inset on it at the canvas's size") |
| `tests/tile-skin.test.mjs` | Broken | "Expert at 1024 px wide keeps the fit rule…" fails on HEAD (triangle "1" glyph ink, fixture-dusk), likely since `a347cc1`; predates this run |

## Decisions made

- Binding: steamworks-ffi-node 0.11.3, no Rust build of steamworks.js — it already covers every capability (user: Q2 a).
- Overlay switches `in-process-gpu`, `disable-direct-composition`, `ui-disable-partial-swap` in `desktop/main.js`, and the page keeps repainting while Steam runs — the only combination where the overlay draws, pauses the game and does not flicker.
- Window stays transparent for now; the user said "I would prefer an opaque window" — recorded as input for `/architect amend feature=steam-desktop-host`, not applied.
- Desktop never gets the phone layout; the web keeps it on window-size media queries (step 36).
- Frame steps on width only, while the theme's compact title bar also switches at 820 px height — left as is (step 37).
- Steam: placeholder one-file build on `default` (BuildID 26249414), game builds on password-protected `internal`; the user runs SteamCMD and publishes partner-site changes after reading the pending list. User's constraints, verbatim: "make sure not to touch anything else and don't make anything public" and "I'd rather make you upload an empty build for default branch."
- Run kept sequential; stopped before step 7 by the user.

## Blockers and open questions

- Flip `shared-screen-layout` and `in-game-layout` to `[DONE]` in FEATURES.md? Unanswered.
- Transparent vs opaque window: open, user prefers opaque; needs `/architect amend feature=steam-desktop-host`.
- Quit: the title bar's Quit and the in-game quit do nothing on desktop; task 107 (step 24) owns the title bar button and waits on task 282 of another runbook. Confirm it also covers the in-game quit, else `/task-add`.
- Spike leftovers in Steamworks: achievement `SPIKE_PROBE` (unlocked on the user's account), leaderboard `SPIKE_PROBE`, and Cloud quota values the user set but did not record (step 10, task 93, checks them).
- Window glitches from installed runs with no task yet: bottom border radius wrong on most screens, square corners on in-game board windows, in-game results popup widening the window and showing the fullscreen background, a toast possibly outside the window.
- Whether to commit a `desktop/package-lock.json`.

## Exact next step

Answer the closing report's follow-ups (handles 1–10, verbatim in the last section of this file; a reply by number is `follow-ups-resolve`'s job): say which feature slugs to flip, then run `/architect amend feature=steam-desktop-host` for the window choice and overlay rules. Resume the runbook with `/runbook-run 4 --attended --no-dashboard`; add `--to 9` to run only the agent-only steps 7, 8 and 9 and stop before step 10 (task 93, needs the user at the partner site).

## Environment and setup notes

- SteamCMD: `C:\steamworks_sdk_165\sdk\tools\ContentBuilder\builder\steamcmd.exe`, cached login `choskoxteam`. Upload: `npm run package`, then `npm run steampipe` (writes `desktop/out/steampipe/app_build.vdf`), then the user runs `steamcmd +login choskoxteam +run_app_build "E:\projects\minesweeper-3d-web\desktop\out\steampipe\app_build.vdf" +quit`. Agents' permission check refuses SteamCMD as a production deploy; never route it through another session.
- Never type, store or ask for passwords or Steam Guard codes.
- `npm run package` writes the app id into the build as `resources/app/steam-app.json` from the git-ignored config; `npm run steampipe` refuses a build whose app id is missing or mismatched. A development run reads `desktop/steam_appid.txt`, written by `npm run appid`.
- The Steam client's Launch Options may still hold the spike's `--probe-…` switches; clear them before a normal run.
- Logs: `%APPDATA%\Minesweeper 3D\crash.log` (none written so far), spike logs `spike-probe.log` and `spike-probe-round1.log` beside it.
- Browser tests run only through `.claude/external/run-*.sh` scripts, one Chromium at a time.

## Follow-ups (verbatim from the run's closing report)

1. Flip to `[DONE]` in FEATURES.md? Candidates: `shared-screen-layout`, `in-game-layout`. Name the slugs, or say all / none.
2. `/architect amend feature=steam-desktop-host` — settle the window: transparent (page semi-transparent behind the overlay, corners kept) or opaque (user's preference; loses transparent corners, fullscreen sometimes keeps windowed bounds, never tested with `ui-disable-partial-swap`). Also document the overlay switches and the keep-repainting rule while Steam runs, which the feature doc lacks (task 90 may absorb the doc part).
3. Desktop window glitches from the installed runs, no task yet: bottom border radius wrong on most screens; in-game board windows square-cornered; in-game results popup widens the window and shows the fullscreen background; a toast can fall outside the frame-sized window. Likely `/task-add` under `in-game-layout` / `shared-screen-layout`.
4. Title bar Quit and in-game quit do nothing on desktop — task 107 (step 24) territory, waits on task 282 from another runbook; confirm it covers in-game quit too, else `/task-add`.
5. Steamworks leftovers from the spike: achievement `SPIKE_PROBE`, leaderboard `SPIKE_PROBE`, Cloud quota values unrecorded. Remove or keep the first two by hand; step 10 (task 93) checks the quota.
6. Pre-existing failing browser test `tests/tile-skin.test.mjs` "Expert at 1024 px wide keeps the fit rule…" (triangle "1" glyph ink, fixture-dusk), possibly from `a347cc1`.
7. Stale comment at the head of `css/components.css` (replay viewer "inset on it at the canvas's size").
8. Frame steps on width only vs the compact title bar switching on height — accept or `/architect amend feature=shared-screen-layout`.
9. `desktop/node_modules` installed with `--ignore-scripts`, no lock file; decide whether to commit a lock file.
10. Steps remaining: 7–35 (25 steps). Next agent-only steps 7, 8, 9; next agent+human step 10 (task 93). Resume with `/runbook-run 4 --attended --no-dashboard` (add `--to 9` to stop before step 10).
