# Session: 2026-10-21 16:04

Work: document .claude/context/testing.md
Running: /orchestrate-mode (lockup investigation, then lighter browser tests)

Runbook 8 (`design-fixes-implementation`) froze this Windows machine overnight when run locally with
`--parallel 4`/`8`. This session investigated the freeze, without re-running the runbook (a cloud
session owns the run now), and made the browser test tier light and gated. Orchestrate mode was on:
all code work was done by area agents, whose handoffs sit in this file's stem folder.

## What we are building

A test setup that cannot take the machine down and does not run browser tests a change does not
need. Also, feedback on the parallel channel of the chosko-llm commands and skills, filed as an
issue by the owner.

## What worked (with evidence)

- **Lockup root cause.** Report at
  `C:\Users\chosk\AppData\Local\Temp\claude\E--projects-minesweeper-3d-web\23358ba7-c427-415a-89b8-0aff0dc313a5\scratchpad\lockup-investigation.md`
  (scratchpad; it may be cleaned):
  - Phase 1: CPU starvation from up to 8 parallel all-browser runs.
  - Phase 2: orphaned `watch.sh`, status-line and test-runner processes. Claude Code's
    `taskkill /T` misses MSYS descendants, and each console program an orphan starts opens a
    Windows Terminal window; together these exhausted the desktop heap.
- **Commit 6262bed (harness):**
  - One shared Chromium per run (`.claude/external/run-tests.mjs`); browser files run in sequence.
  - A machine-wide lock at `%LOCALAPPDATA%\ms3d-browser-tests.lock`.
  - `run-full-tests.sh` = fast tier + affected browser files only. The all-browser scripts need
    `MS3D_ALL_BROWSER=1`.
  - A PreToolUse hook, `.claude/hooks/browser-tests-guard.mjs`.
  - A narrower `SHELL_SMOKE` and a new `RENDER_SMOKE`.
  - The agent measured: all-browser run 56 files in 3 min 36 s, with 0 Chromium processes left
    afterwards; 5 affected files in 14.5 s.
- **Commit 063311d (pruning):** browser tests 141 → 123, files 56 → 53; the all-browser run is green
  in about 199 s.
- **Commit 4e09bb8 (docs):** README, `testing-browser.md` and INDEX updated; `testing.md`'s two stale
  lines fixed (they rode in 6262bed).
- **Quick check by the orchestrator** after the batch: `run-fast-tests.sh` reported 2208 pass,
  0 fail.
- **Global skills patched locally** under `C:\Users\chosk\.claude\skills\` (not a git repo, no
  version bump):
  - task-engine: `testing-policy.md` § The full test suite; `tests-first.md` Step 5; `worktree.md`
    step 4 and § The machine is shared (`max` = 3).
  - runbook-run: `parallel.md`, `parallel-schema.md`, `parallel-authoring.md`.
  - task-implement: `parallel-runs.md`.
- **Issue text for chosko-llm**, written and sent to the owner:
  `...\scratchpad\issue-parallel-channel-machine-lockup.md` (same scratchpad folder).

## What did not work (and why)

- **Killing processes by image name** (all bash/node/chrome) killed this session itself (exit 137).
  Kill only PIDs you started, or match the worktree path in the command line.
- **TaskStop on step agents left orphans running.** Only signing out recovered the desktop.
- **Pruning gave only about 10%** of the all-browser time back: the cost is real 1.5–3 s flows,
  not per-file overhead. The big saving is the affected-only rule.
- **Fixing commit 6262bed's message failed.** The subject and body are on one line because the
  PowerShell here-string lacked a blank line. The fix needs a rebase-reword, which the auto-mode
  classifier denied as "Git Destructive". It is unpushed, so the owner can reword it.

## What has not been tried yet

Not tried:
- Pruning candidates the agent kept:
  - Merges: `results-watch` into `results`, `components-learn-end` into `components-ready`,
    `shell-mode-3d`'s adapter test into `shell-pause`, and the `records-screen` Averages test into
    its one-line-figures test.
  - Putting the `render-3d-feedback` pixel tests on one page.
  - Merging `platform-browser` with `platform-blob-store`.
  - `shell-mode-3d`'s generating-card test: 17 s, of which a 12 s stub delay.
- Fixes outside this repo:
  - Dashboard `watch.sh` removal or self-termination.
  - A fork-free `session-statusline.sh`.
  - Capping explicit `--parallel N` at 3.
  - The task-implement TaskStop cleanup rule.
  - OS: default terminal set to Console Host; desktop heap raised only if 0xc0000142 recurs.
  - The upstream Claude Code report about `taskkill /T` and job objects.
- The slow tier was not run in full after the changes.

## Current state of files

| File | Status | Notes |
|------|--------|-------|
| `.claude/external/run-tests.mjs`, `run-*.sh`, `affected-tests.mjs` | Complete | commit 6262bed |
| `.claude/hooks/browser-tests-guard.mjs`, `.claude/settings.json` | Complete | the hook is live for every session and subagent |
| `tests/helpers/browser.mjs` | Complete | throws when the runner's endpoint is missing |
| pruned `tests/*.test.mjs` | Complete | commit 063311d |
| `.claude/runbooks/8-design-fixes-implementation.md` | In progress | local `[~]` markers from the stopped local run; the cloud run owns the runbook; not committed |
| `bash.exe.stackdump` (repo root, also `E:\projects\NeonSiege`) | Not started | leftover crash dumps; delete |
| `.claude/worktrees/runbook-8-step-{15,17,18,20,24,25,26,28}` | In progress | uncommitted work of stopped local steps; leave until the cloud run finishes |

## Decisions made

- **A task's suite** is the fast tier plus the affected browser files. Every browser file runs only at
  milestone close, with `MS3D_ALL_BROWSER=1`: browser load was the freeze's cause.
- **One Chromium per run, files in sequence, each file in its own Node process.**
  `--test-isolation=none` was rejected because state leaks between files.
- **Machine-wide lock, waiting rather than failing,** so parallel agents queue instead of erroring.
- **No Windows job object.** A hard kill of the runner was proven to take Chromium down through the
  Playwright pipe.
- **Nothing pushed** while the cloud runbook run is active. The three commits are local on `main`.
- **Not re-running runbook 8 locally**, by the owner's instruction.

## Blockers and open questions

- Asked the owner, unanswered: pursue the kept pruning candidates (merges, shortening the 17 s
  test), or stop here?
- Runbook 8 P1 (task 240, the Settings overflow at 1920×1080 with 3D bindings shown) is unanswered.
  The recommendation is (a): move the "fits with 3D bindings" clause to task 233 via
  /pipeline-revise.
- Whether the owner's earlier night-time sign-outs (10-12 to 10-20) were the same freeze.
- The feature `themed-board-art-and-motion` has all its tasks DONE but is still `[PLANNED]` in
  FEATURES.md; flipping it was never decided.
- Explicit `--parallel N` above 3 is still uncapped; the owner will raise it in the chosko-llm
  issue.

## Exact next step

When the cloud run of runbook 8 finishes:
1. `git pull --rebase` on `main` to bring the three local commits on top.
2. Reword 6262bed's message into a subject plus a body.
3. Push.
4. Remove the local `runbook-8-step-*` worktrees and the remote `wt/runbook-8-step-8/9/10`
   branches, and revert the local runbook-file markers to the cloud's state.

## Environment and setup notes

- **Browser tests:** run only through `.claude/external/run-affected-tests.sh` or `run-full-tests.sh`.
  The hook denies a bare `node --test` on browser files; `MS3D_ALL_BROWSER=1` opts into an
  all-browser run.
- **Pre-existing failure:** the `[slow]` `render-3d-feedback` pulse test failed on a clean HEAD on
  this machine. It has since been removed by the pruning.
- **The local skill patches will be overwritten** by the next parallel-channel update unless
  upstreamed.
