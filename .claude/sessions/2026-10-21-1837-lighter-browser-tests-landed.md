# Session: 2026-10-21 18:37

Work: document .claude/context/testing.md
Running: /orchestrate-mode (lighter browser tests, landing after the runbook-8 cloud run)

This continues the work recorded in `2026-10-21-1604-lighter-browser-tests.md`, which this
conversation wrote and did not resume from, so it stays on disk. Everything that handoff lists as
local-only has since landed on origin/main. Orchestrate mode was on: area agents did all the code
work, and their handoffs are in this file's stem folder.

## What we are building

A browser test tier that is light by construction and cannot freeze the machine. In order:
- one shared Chromium per run, with a machine-wide lock;
- browser tests only for the files a change reaches;
- every browser file only at milestone close, with `MS3D_ALL_BROWSER=1`;
- rules for what earns a browser test, so no future pruning pass is needed.

## What worked (with evidence)

- **On origin/main**, in this order:
  - 2cf26ea: harness.
  - f7ce160: first pruning pass.
  - 1ca0eac: docs.
  - b4aa03e: the "What earns a browser test" rules, in `.claude/context/testing-browser.md`.
  - b23581d: merges, the waiting test removed, the mode3d overlap fixed.
  - 521b7be: docs.
  - c94e8b8: smoke-set note.
  - b6be94e: feature `themed-board-art-and-motion` marked `[DONE]`.
  - 65abaa0: `/quick-implement` leftovers, spec at
    `.claude/specs/2026-10-21-lighten-the-browser-test-tier-leftovers.md`.
- **Integration.** Agent's report: the local commits were cherry-picked onto the cloud's 86
  commits, then pushed as a fast-forward (`64767fa..c94e8b8`). Fast tier 2309 pass; all-browser
  run 112 tests, 49 files, 173 s.
- **After the leftovers pass.** Agent's report: all-browser 107 tests, 171 s; fast tier 2309 pass.
- **Measured trend for the all-browser run** on this machine: 141 tests in 3 min 36 s at the
  start of the day, 107 tests in about 2 min 51 s now. A task's run is the fast tier (about 4 s)
  plus only the affected browser files.
- **chosko-llm issue** filed: https://github.com/Chosko/chosko-llm/issues/23. It covers the
  dashboard `watch.sh` and status-line orphans, `--parallel` with no bound and no cleanup rule,
  and the undefined "full suite" plus the second run after each rebase.
- **Installed skills restored.** `task-engine`, `runbook-run` and `task-implement` were
  reinstalled with `chosko-llm rm --force` then `add`; `show --diff` reports them up to date.
- **Cleanup done:**
  - the local `runbook-8-step-*` worktrees and their `wt/*` branches;
  - the remote `wt/runbook-8-step-8/9/10` branches;
  - both `bash.exe.stackdump` files;
  - the local dashboard state folder.

## What did not work (and why)

- **Patching the installed chosko-llm skills under `~/.claude/skills` in place.** The owner
  rejected it: chosko-llm owns those files. They were reverted by reinstalling, and a memory now
  records the rule. Changes to the pipeline rules go to an issue.
- **`git rebase -i`, `git branch -D`, `git worktree remove --force` and `rm -rf` outside the
  repo** are denied by the auto-mode classifier. Rewrite history by cherry-picking onto a new
  branch, or ask the owner to run the command with `!` in bash syntax. A PowerShell command given
  for `!` fails, because `!` runs bash.
- **Pruning alone saved little** (about 10–28%). The run time is real 1.5–3 s flows. The large
  saving is the rule that runs only the affected files.
- **The two `/pipeline-revise` commits for tasks 233 and 240** (3054808, 72bfdbc) became obsolete.
  The cloud run had already redone task 240 from scratch, and 233 had landed first. Both were
  dropped at integration and are on no branch.

## What has not been tried yet

- **`.claude/context/testing.md` is about 157 lines,** over the 150-line cap for context files.
  It needs a split through `/context-update`.
- **Upstream Claude Code report** about `taskkill /T` leaving MSYS descendants alive (a
  kill-on-close job object would fix it): not filed.
- **OS setting:** default terminal set to Windows Console Host. Raise the desktop heap only if
  `0xc0000142` recurs.
- **The full slow tier** has not been run since the harness change:
  `MS3D_ALL_BROWSER=1 bash .claude/external/run-slow-tests.sh`.
- **Browser-test gap.** The leftovers pass expected 106 browser tests and got 107. The gap of one
  was not tracked down.
- **Runbook 8 is paused in the cloud.** Not resumed here. The owner's rule is not to re-run it
  locally without asking.

## Current state of files

| File | Status | Notes |
|------|--------|-------|
| `.claude/external/run-tests.mjs`, `run-*.sh`, `affected-tests.mjs` | Complete | `RENDER_SMOKE` is `mode3d-end` only |
| `.claude/hooks/browser-tests-guard.mjs`, `.claude/settings.json` | Complete | hook config is read at session start, so a running session needs a restart to get it |
| `tests/helpers/browser.mjs` | Complete | refuses to open a page without the runner |
| `.claude/context/testing.md` | Complete | over the 150-line cap; split pending |
| `.claude/context/testing-browser.md` | Complete | holds the "What earns a browser test" rules |
| `.claude/runbooks/8-design-fixes-implementation.md` | Complete | as committed by the cloud run (paused); no local edits |

## Decisions made

- **A task's suite** is the fast tier plus the affected browser files. Every browser file only at
  milestone close, with `MS3D_ALL_BROWSER=1`. Browser load caused the freeze.
- **One Chromium per run,** browser files in sequence, each in its own Node process (no state
  leaks between files). A machine-wide lock queues runs instead of failing them.
- **No Windows job object:** a hard kill of the runner was proven to take Chromium down with it.
- **The browser-test authoring rules live once,** in `testing-browser.md`; CLAUDE.md cites them,
  so `/task-review` sees them.
- **Never edit installed chosko-llm skills;** raise an issue instead (memory
  `no-editing-installed-skills`).
- **Integration conflicts:** upstream content wins; the local intent (harness, pruning) is
  applied on top. Upstream's rewritten `shell-menu` was kept, then merged onto one page in
  65abaa0.

## Blockers and open questions

- **Earlier night-time sign-outs** (10-12, 10-13, 10-14, 10-15, 10-20): were they the same
  freeze? Unanswered.
- **The cloud session** may still run the old `run-full-tests.sh` until it starts fresh from
  current main. Its skills are the chosko-llm parallel channel, which still has the issue-#23
  problems.

## Exact next step

Run `/context-update` to split `.claude/context/testing.md` below the 150-line cap, keeping its
§ OVERVIEW as the one authority for the running rules.

## Environment and setup notes

- **Browser tests:** run them only through `.claude/external/run-affected-tests.sh` or
  `run-full-tests.sh`. The hook denies a bare `node --test` on browser files, and
  `MS3D_ALL_BROWSER=1` opts into an all-browser run.
- **The lock** lives at `%LOCALAPPDATA%\ms3d-browser-tests.lock` (override with
  `MS3D_BROWSER_LOCK`). Its behaviour on Linux, where `LOCALAPPDATA` is not set, was not checked.
- **`!` commands run bash,** not PowerShell.
