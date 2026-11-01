# Session: 2026-11-01 01:01

Work: document .claude/runbooks/4-m3-tasks-implementation.md
Running: /runbook-run 4 (paused at step 14, task 97, attended), then /follow-ups-resolve and free-form debugging of Steam leaderboard uploads

The run is still paused at step 14. Task 97's code is uncommitted in the main tree. Its private-build check fails: Steam refuses every score upload. This session narrowed that to the Steamworks leaderboard configuration, not the game's code. The follow-ups approved last session are partly done; the rest wait on task 97 landing.

## What we are building

Milestone m3-on-steam, by running runbook `m3-tasks-implementation` to its end. The immediate goal is closing step 14 (task 97, Steam leaderboards): the user's manual checks must pass, then task 97 is committed.

## What worked (with evidence)

- Follow-up 5 is done: the two finished spec files were deleted in commit `a297a1e`, which was pushed.
- Follow-up 1 is done: feature `settings` is `[DONE]` in `.claude/FEATURES.md`, in commit `b76d60a`, which was pushed.
- Follow-up 4 is closed: the user confirmed the split. Only render resolution and look sensitivity stay on one PC. Fullscreen, field of view and board scale sync.
- Q1, step 14 checkpoint 1: the user created the 12 leaderboards in Steamworks and published them. Steam finds them: the probe got handle `21472085` for `classic-2d-beginner-no-guess`.
- Q3 answer: b, no console message when a queued offline score is sent.
- The game's submission path works up to Steam. The won game was verified and queued in `%APPDATA%/Minesweeper 3D/saves/leaderboards.outbox.json` (entry `classic-2d-beginner-no-guess`, score 10488, 11 details integers). Its replay blob is in `saves/leaderboards.outbox.blobs/`. The find call and the replay share succeeded.
- The binding itself uploaded with details successfully during the spike: `%APPDATA%/Minesweeper 3D/spike-probe-round1.log` shows `"success":true` uploads to `SPIKE_PROBE`.

## What did not work (and why)

- Every score upload is refused by Steam. `%APPDATA%/Minesweeper 3D/crash.log` has `Error: the upload failed` at 23:39, 23:55 and 23:57 (UTC, 2026-10-31), raised by `desktop/adapter/steam.js:433`.
- The probe `scratchpad/probe-upload.mjs` called the binding directly outside the game. That file is in the scratchpad of the previous conversation, not the repo: re-create it if needed. The probe imports `openSteamworks` from `desktop/adapter/steam.js` with `desktop/redist/steam_api64.dll`, sets `SteamAppId=5517360` and runs `runCallbacks` every 50 ms. It printed the binding's line `[Steamworks] Score upload was not successful`. That means `LeaderboardScoreUploaded_t.m_bSuccess` was 0: the call was made and Steam answered, but refused the score. The leaderboard has 0 entries.
- Unticking "Writes Trusted" on all 12 leaderboards did not fix it, at least not yet. The user has not confirmed they re-published the Steamworks settings after unticking it.
- `SPIKE_PROBE` is deleted (find returns null), so there is no known-good leaderboard to compare against.
- A second, slower Classic 2D Beginner no-guess win was not queued, by design: the queue keeps only the faster pending score per leaderboard.

## What has not been tried yet

- Re-running the probe after the user confirms the Steamworks change is published.
- Reading the leaderboard's Writes and Community Visibility columns in Steamworks: asked, not answered.
- Uploading without details, or creating a client-side leaderboard with `FindOrCreateLeaderboard` as a control. Skipped because both pollute real leaderboards. They are not ruled out.
- The offline half of checkpoint 2: win offline, reconnect, check both entries appear.

## Current state of files

| File | Status | Notes |
|---|---|---|
| `js/leaderboards/{steam-submitter,best-cache,reader,replay-fetch,index}.js`, `tests/leaderboards-steam.test.mjs` | In progress | Task 97 code, staged but uncommitted. Unchanged this session. |
| `desktop/bridge.js`, `js/platform/{bridge-client,index}.js`, `tests/{desktop-bridge,platform-selection,platform-steam-storage}.test.mjs` | In progress | Task 97, uncommitted. |
| `.claude/TASKS.md`, `.claude/context/{desktop,platform}.md`, `.claude/domain/features/steam-desktop-host.md` | In progress | Task 97's `[IN PROGRESS]` status and its doc touches, uncommitted. |
| `.claude/runbooks/4-m3-tasks-implementation.md` | Complete | Committed with step 14 `[~]`, and no worktree behind it. |
| `.claude/RUNBOOKS.md` | Complete | Committed `[RUNNING]`, `Steps: 29/49`. |

## Decisions made

- Q3: no console message when a queued submission is sent. Why: the user chose b.
- Follow-up 2 (Data panel line saying "this browser" on Steam) belongs to feature `steam-desktop-host`, not `settings`, so `settings` could be marked done. Why: it is a Steam-build problem.
- Follow-up 3: the history-superseded set in `sessionStorage` (`js/main.js:533`) is an allowed exception to the Steam no-browser-storage rule, because that storage is wiped when the window closes. It needs writing into the storage rule, with no code change.
- Follow-up 6: archive the finished tasks with `/task-clean` rather than accept the 34 warnings.
- Commits made while task 97 is uncommitted use explicit pathspecs (`git commit -- <paths>`), so the staged task 97 files are never swept in.

## Blockers and open questions

- **Blocker:** Steam refuses every score upload (`m_bSuccess` 0). It is most likely the leaderboards' trusted-writes setting, not yet published. The open questions to the user:
  1. Was the Steamworks change re-published after unticking "Trusted"?
  2. What do the Writes and Community Visibility columns show for `classic-2d-beginner-no-guess`?
- **Q2 (step 14, checkpoint 2)** stays open until uploads work. After that, both the online and offline paths need checking. The replay attachment can't be seen in the game yet.
- **Follow-ups, approved and waiting until task 97 commits.** They touch the same uncommitted files: `TASKS.md` and `steam-desktop-host.md`.
  1. `/architect amend feature=steam-desktop-host` for the Steam Data panel wording, then `/task-add`. Then a companion item placing the new task in runbook 4, via `/runbook-create --append`, which needs approval.
  2. Write the closes-with-the-window session-storage exception into the Steam storage rule.
  3. Run `/task-clean` to archive the finished tasks.

## Exact next step

Ask the user whether the Steamworks leaderboard change (Writes Trusted off) was published, and what the Writes column shows for `classic-2d-beginner-no-guess`. Once it is published, close the game and re-run the upload probe (re-create it per *What did not work*), sending score 10488 with details `[1,3,1,10,10,1,0,10,0,8,1]` to `classic-2d-beginner-no-guess`. If the probe reports success, have the user relaunch the game through Steam so the queued entry flushes. Then finish checkpoint 2 (offline win, reconnect, both entries visible). Then reset step 14's `[~]` to `[ ]` and the index `Status:` to `[PENDING]`, committed. Re-run step 14 (`/task-implement 97 --review --rounds 2`) in the main tree, keeping the uncommitted work, with answers Q1 a, Q2 per the result, Q3 b.

## Environment and setup notes

- The game's user data is in `%APPDATA%/Minesweeper 3D/`: `crash.log`, `saves/` (synced documents and the leaderboard outbox), and `prefs/`. `crash.log` records only uncaught errors. The binding's `[Steamworks]` console lines are not saved anywhere, so the probe is how to see Steam's answer.
- App id `5517360` (`desktop/steampipe/config.json`). The installed private build is at `E:/SteamLibrary/steamapps/common/Minesweeper 3D/`.
- The queued outbox entry is resent only at game start and when Steam logs on again, never on a timer.
- Keep parallelism at 4 or below.
