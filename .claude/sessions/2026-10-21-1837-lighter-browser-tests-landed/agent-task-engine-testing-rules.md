# Area handoff: task-engine-testing-rules

Global skills under `C:\Users\chosk\.claude\skills\` (not a git repo of this
project). Generic pipeline rules that decide how many tests an implementing
agent runs, and how parallel units share the machine.

## Files and regions owned

- `task-engine/references/testing-policy.md` — header authority line;
  § *Affected tests*; § *The full test suite* (authority for what "the full
  test suite" means); per-consumer note for `/task-implement`.
- `task-engine/references/tests-first.md` — § Step 5 (cites testing-policy).
- `task-engine/references/worktree.md` — header authority line; intro
  sentence on scheduling; § *The agent integrates* step 4 (re-verify after a
  rebase); § *The machine is shared* (authority: `max` = 3 units, heavy test
  runs only through the project's runner); `/task-implement` per-consumer
  note's re-verify sentence.
- `task-engine/SKILL.md` — index rows for testing-policy.md and worktree.md.
- `runbook-run/references/parallel.md` — § The parallelism (`max` bullet);
  § Scheduling (select-every bullet); § Wait and handle (stopping-a-step
  bullet: kill only processes whose command line holds the step's worktree
  path); WORKTREE RULES block (machine-shared bullet).
- `runbook-run/references/parallel-schema.md` — § The header line (`max`).
- `runbook-run/references/parallel-authoring.md` — § Step prompts share the
  machine.
- `task-implement/parallel-runs.md` — § Resolving PARALLEL (`max`);
  § The scheduler step 2; § The agent prompt (quoted sentence's last line).

## Current rules (one place each)

- Full test suite of a unit = the suite the project's CLAUDE.md (or cited
  testing context) defines for one task; every test only when none is
  defined; occasion-reserved tiers (milestone close, etc.) join only on that
  occasion. Runs once per unit, again only per worktree.md step 4.
- After a rebase: affected tests always; full suite only when the incoming
  commits changed files the unit's tests reach (project mapping decides).
- `max` parallelism = 3 (worktree.md § The machine is shared). Explicit
  integers are taken as given.
- Units run one test process at a time and heavy runs only through the
  project's serialising script, never the underlying runner directly.
- Other files cite these by path; "full test suite" elsewhere
  (task-implement SKILL.md GOAL/Steps 2–5, review-rounds.md, task-review
  SKILL.md) is left as a term citing the definition, unchanged.

## Rejected by owner

- None recorded.

## Pitfalls

- `runbook-create` SKILL.md is not under the skills dir; its phase numbers
  could not be checked, so parallel-authoring.md's new section has no
  PHASE label.
- Explicit integers above 3 (flag, header, `Parallel policy:` line) are not
  capped — a guess at intent; cap them in worktree.md if the owner wants.
- No skill text said anything about TaskStop before; the rule lives only in
  runbook-run parallel.md. `/task-implement` parallel runs have no such rule.
- Do not touch `skills/pipeline-dashboard/**`, `statusline/**`, or anything
  in the project except this handoff.
