# Area handoff: runbook-notes

## Owns
- `.claude/runbooks/4-m3-tasks-implementation.md` — `Context:` lines of pending steps only, written through `/pipeline-revise` (arm: `runbook-run/references/step-amend.md`).
- Nothing under `desktop/`, `js/`, `css/`, `index.html`, `tests/`.

## Current state
- Step 7 (task 90, document `steam-desktop-host`) carries a 2026-10-30 (amend) fact: the `/architect amend` landed in `9932480`, the window is opaque in code (`545f873`), and step 7 documents from the amended feature document; the older notes calling the window transparent are out of date. Committed as `3d3ec1b` (not pushed).
- Runbook 4 is `[PENDING]`, Steps 16/41; task 90 is `[MISSING]`.

## Owner rules
- Steps 6 and 7 notes are recorded history: add a dated note, never rewrite an existing `Context:` bullet or `Done:` line.
- Changes to planned work go through `/pipeline-revise`; interaction policy `unattended`.
- Do not run or resume the runbook (`/runbook-run`).
- Commits: repo style, no Co-Authored-By / Claude-Session lines; do not push.

## Rejected by owner
- Rewriting step 6's `Done:` line or step 7's existing notes.

## Verification recipe
- `git show 3d3ec1b` touches only the runbook body, one added `Context:` bullet under step 7.
- `.claude/RUNBOOKS.md` block 4 unchanged (a context fact changes no index line).

## Pitfalls
- step-amend only edits pending `[ ]` steps; `[x]` steps (like 6) are never edited.
- The prompt block is immutable; a wrong prompt is struck and re-inserted.
- Other agents share the tree: stage by explicit path only.
