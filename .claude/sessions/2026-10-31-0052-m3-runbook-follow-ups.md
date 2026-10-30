# Session: 2026-10-31 00:52

Work: document .claude/runbooks/4-m3-tasks-implementation.md
Running: /runbook-run 4 --unattended --no-dashboard (parallel 4), stopped by the user after the in-flight steps landed

The runbook body and index hold where the run stopped (23/43, `[PENDING]`, no `[~]` step, no worktree left). This handoff exists for what they do not hold: the run's open follow-ups and how the user wants the next run driven.

## What we are building

Milestone m3-on-steam, by running runbook `m3-tasks-implementation` (`.claude/runbooks/4-m3-tasks-implementation.md`) to its end.

## What worked (with evidence)

- Steps 7, 8, 12, 42, 43, 13 and 9 landed and pushed; their `Done:` lines in the runbook body carry the shas (`9a18812`, `dd70f98`, `0ef75db`, `8ebee81`, `1931379`, `4669c60`, `4626abc`). Final bookkeeping commit `7113b8d`.
- Parallel 4 with one worktree per step (`.claude/worktrees/runbook-4-step-<n>`) and fast-forward landings worked; step 9 needed one extra rebase round when step 13 landed first.
- Facts the reports produced were propagated into the `Context:` of steps 9, 11, 13, 14, 15 and 16 — read them there, not here.

## What did not work (and why)

- Nothing failed or parked.
- The first launch carried `--to 9` by mistake; the user dropped the bound mid-run.

## What has not been tried yet

- No `agent+human` step ran this session, so the user's run-shape rule below has not been exercised yet.

## Current state of files

| File | Status | Notes |
|---|---|---|
| `.claude/runbooks/4-m3-tasks-implementation.md` | Complete | All committed; step 15 was set back to `[ ]` before it was spawned. |
| `.claude/RUNBOOKS.md` | Complete | `[PENDING]`, `Steps: 23/43`. |
| `.claude/context/platform.md` | In progress | Stale: does not list the two Steam storage modules and still calls the Steam slots empty (step 9). Step 11 (task 94) carries the note. |
| `.claude/context/app-shell-results.md` | In progress | Stale: the results flow's new `leaderboards` option is undescribed (step 13). Step 16 (task 99) carries the note. |

## Decisions made

- **How the user wants the runbook driven:** parallel 4 and unattended for `agent` steps. When an `agent+human` step (10, 14, 19, 21, 26, 30) comes up, finish the steps already running, run that step alone in the main tree under the **attended** policy, then go back to parallel and unattended after its commit. Why: those steps need the user present, and a parked human step would stall everything that depends on it.
- Parallelism 4 comes from the project's `Parallel policy: 4`. The runbook header carries no `Parallelism:` line, so pass `--parallel 4` explicitly.

## Blockers and open questions

The run's open follow-ups, none of them on disk anywhere else:

1. Every task of feature `steam-desktop-host` (tasks 90, 294, 295) is `[DONE]`; FEATURES.md still says `[PLANNED]`. Flip it to `[DONE]`? Not answered yet.
2. **Reset all data fails on the Steam build.** The bridge and the file service cannot list or delete documents, so the Steam storage's `clear()` reports `write-failed`: Reset deletes every replay file, keeps the documents and shows the "close other tabs" failure line. No task exists. Suggested: `/architect amend feature=steam-cloud-saves "Reset all data on the Steam build: a document clear request in the bridge and file service"`.
3. **Theme before first paint on the Steam build.** `js/theme.js` reads the settings document from `localStorage`, which the Steam build no longer writes. Harmless while one theme ships; with a second theme the Steam build would start on the default theme until settings load. Add a task before a second theme ships? Not answered yet.

## Exact next step

Run `/runbook-run 4 --unattended --parallel 4 --no-dashboard`, telling it to switch to sequential and attended for each `agent+human` step and back afterwards (Decisions made). Step 10 (`agent+human`, depends on 4 and 9, both done) is the first selectable step in list order, so the run opens with it alone and attended; steps 15, 17 and 28 start in parallel after its commit.

## Environment and setup notes

- A parallel run on this machine once locked up the Windows desktop (`issue-parallel-channel-machine-lockup.md` in an earlier session's scratchpad). Keep parallelism at 4 or below. Step agents are told to run heavy work only through the project's test scripts, which run browser tests one at a time across the machine.
- `.claude/worktrees/` is already in `.git/info/exclude`.
