# Session: 2026-10-21 10:34

Work: document .claude/runbooks/8-design-fixes-implementation.md
Running: /runbook-run (runbook 8, parallel 2, unattended, spawn relay), now closed

Runbook 8 `design-fixes-implementation` is `[DONE]` (34/34). Its steps ran tasks
214–247; every step's `Done:` line in the runbook body records the commit and
the decisions taken. This handoff holds only what the run's closing report left
open: nine follow-ups, each with the context a fresh session needs to act on
it. They are numbered as in that report, so a reply by number still works.

## What we are building

Nothing new: closing out the design-fix pass (tasks 214–247) that matched the
game's screens to the Joyful tiles canvas. What remains is bookkeeping, owner
decisions the run surfaced, and small cleanups no task covers yet.

## What worked (with evidence)

- All 34 steps landed on `ccr-7aa8970b-yklh6v`, pushed; the last commit of the
  run is `2ae10d9` ("Runbook design-fixes-implementation: step 34 done,
  runbook done"). `.claude/RUNBOOKS.md` block 8 reads `Status: [DONE]`,
  `Steps: 34/34`.
- The final full suite reported by the step agents: 2372 tests, 0 failures
  (step 30, task 243, after its rebase).
- Task 240 (Settings) was redone from scratch after its parked work proved
  unmergeable; it landed as `e17419a` and its Frame criterion holds as
  written (fits at 1920 × 1080 with the 3D bindings shown).

## What did not work (and why)

- **Unparking task 240 by cherry-pick.** `park/task-240` (commit `616236f`,
  41 files) was branched at step 8, before tasks 223, 233, 234 and 237–239
  rewrote the same areas; `git cherry-pick -n` conflicted in 14 files. The task
  was reset to `[MISSING]` (commit `7be5ed3`) and rebuilt fresh. Do not try to
  revive that branch.
- **Deleting the remote branch `park/task-240` from this cloud session.**
  `git push origin --delete park/task-240` failed twice with "send-pack:
  unexpected disconnect … the remote end hung up unexpectedly"; the session's
  git proxy appears to refuse branch deletes. The local branch is gone.

## What has not been tried yet

Every follow-up below is untried. The nine items:

1. **Flip three features to `[DONE]` in `.claude/FEATURES.md`.** Step agents
   reported every task of `shared-screen-layout`, `in-game-layout` and
   `theme-system` `[DONE]`, while FEATURES.md still lists them `[PLANNED]`.
   The owner has not answered "flip which: all / none / named". Verify each
   with `/production-status` or `/task-list` before flipping.
2. **Delete the remote `park/task-240` branch by hand**:
   `git push origin --delete park/task-240` from a machine with full GitHub
   access, or in the GitHub UI. Task 240 is `[DONE]`; the branch is obsolete.
3. **Five open design questions**, each a `/pipeline-revise` if the owner
   wants a change (none is a bug; each step chose a default and recorded it):
   - **Pause card after a finished game (task 234).** The canvas draws one "No
     game (before the first click / ended)" frame, so an ended game now reads
     "No game in progress: the board is not started yet." and loses its final
     time and mines left. Title (You won! / Game over) and Play again stay.
     Choose: own line for an ended game, keep the final figures, or leave it.
   - **Daily 3D panel height (task 229).** Built at the task body's 280 px
     everywhere; the J-Daily-states artboard draws 313 px at 1920 × 1080
     (280 at 1024 and on the Hexagon card). Amend the task/feature doc if the
     canvas value is meant.
   - **3D loss title (task 236).** The shipped title stays "That cube was a
     mine."; the canvas says "That was a mine". The task only named the loss
     line.
   - **"Hold" vs "tap" Ctrl on touch (task 235).** The touch rules line says
     "hold the Ctrl button to show them", matching task and canvas, but the
     toolbar's Ctrl button is a toggle that stays on until tapped again.
   - **Keys dropped from every surface (task 233).** Following the canvas's
     short lists, these still work but appear nowhere: 3D Enter / ' (reveal,
     flag, chord on release) and Home / R (back to start view), Classic 2D
     wheel-scroll and H / M rows, and the 3D help foot's release rule. A
     keyboard-only 3D player cannot discover them.
4. **Kit-wide segmented-option minimum height (from task 240).** Task 219's
   kit rule gives every segmented option a 36 px minimum height; the canvas
   draws them at text height on desktop and 40 px on touch. Task 240 dropped
   the minimum on the Settings page only (it was what overflowed the xl page
   by 4 px). Every other screen keeps the undrawn 36 px. Candidate
   `/task-add` against task 219's area.
5. **Hint strip close button as a stateful control (from task 243, review
   finding R1-1, deferred).** The kit catalogue lists the hint strip's close
   button as a plain part, so a future theme is not required to draw its hover
   and focus looks (Joyful tiles already does). Candidate `/task-add`: list it
   as a control with states in every theme and previews in the gallery.
6. **Duplicate text conversion in `js/settings/bindings.js`.** Task 233 inlined
   a plain-text conversion in its plain-words renderer (around line 267);
   task 232 added `plainText` (around line 252). The inline copy can call
   `plainText`. `/quick-implement`-sized.
7. **Stale UX-review scripts.** Scripts under `docs/ux-review/` still read
   `#rp-position`, which task 239 removed from the replay viewer. Task 217
   also noted these scripts stall on drift no task covers (refused custom
   boards, `#hint-h`, `#p-restart`, the 2D `#hud-pause`, a removed 3D preset).
   `/quick-implement` or `/task-add`.
8. **Flaky tests seen during the run** (each passed alone or on re-run):
   - `tests/render-3d-feedback.test.mjs` `[slow]` "Ctrl draws hidden cells as
     transparent ghosts and a hidden number pulses" — fails on the unchanged
     base too (steps 1, 19, 28);
   - `tests/shell-menu.test.mjs` — a menu preview's tile size read before it
     mounted, about 1 in 10 runs (step 18);
   - "the Settings page is operable by controller" — once under load (step 16);
   - `tests/components.test.mjs` "the mouse selects a button by focusing it…"
     — once in a concurrent run (step 28);
   - `tests/input-keyboard-3d.test.mjs` — a 180 s timeout in a full run
     (step 26).
   Candidate `/task-add` to make them deterministic; never skip them.
9. **Pause rules mismatch in `game-shell.md`.** § Pause rules says Back before
   the first click goes to the main menu; the game still resumes. Pre-existing,
   but visible now because the pause card no longer shows Resume before the
   first click (task 234). `/pipeline-revise` the document, or a task to make
   the code follow it.

## Current state of files

| File | Status | Notes |
|---|---|---|
| `.claude/runbooks/8-design-fixes-implementation.md` | Complete | All steps `[x]` with `Done:` lines. |
| `.claude/RUNBOOKS.md` | Complete | Block 8 `[DONE]`, 34/34. |
| `.claude/FEATURES.md` | Not started | Follow-up 1: three features still `[PLANNED]`. |
| `.claude/domain/features/game-shell.md` | Not started | Follow-up 9. |
| `js/settings/bindings.js` | Not started | Follow-up 6. |
| `docs/ux-review/` | Not started | Follow-up 7. |

## Decisions made

- **Task 240 redone from scratch, not merged** — the parked commit was far
  wider than its 6-file task and predated the tasks that rewrote those areas;
  resolving 14 conflicts would have been a redo biased by stale code.
- **The Q1 a answer for task 240 was not applied** — moving the "fits with 3D
  bindings shown" clause to task 233 proved unnecessary once task 240 dropped
  the segmented-option minimum on Settings; no `/pipeline-revise` of tasks
  233/240 is owed.
- **Each design question in follow-up 3 was left at the step's default** —
  the run was unattended and none blocked a task's criteria; the owner decides.

## Blockers and open questions

- Follow-up 1 needs the owner's answer: flip all three features, none, or name
  them.
- Follow-up 3 needs the owner's five design calls.
- Follow-up 2 needs an environment allowed to delete remote branches.

## Exact next step

Ask the owner follow-up 1's question — "Flip `shared-screen-layout`,
`in-game-layout` and `theme-system` to `[DONE]` in FEATURES.md? Name the
features, or say all / none." — after confirming with `/production-status`
that each has every task `[DONE]`/`[SKIP]`; then put follow-up 3's five
questions in the same message, and handle the rest by number with the
`follow-ups-resolve` skill.

## Environment and setup notes

- Work happened on branch `ccr-7aa8970b-yklh6v` in a cloud session; it is
  pushed and up to date with `origin`.
- Tests: fast tier is every test not named "in a browser"; browser and
  `[slow]` tiers per `.claude/context/testing.md` and its runner scripts.
