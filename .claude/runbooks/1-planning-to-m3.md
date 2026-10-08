# Runbook: planning-to-m3

Created: 2026-10-08 · Source: /product-roadmap conversation · Model: opus
Last step number: 17
Sequencing: /production-plan must see every architected feature, and tasks are written only after the plan orders them.

## [ ] 1. Architect the visual design system slice for m1

Depends on: none

Context: none

```prompt
/architect "Visual design system" m1-classic-2d

The product design leaves open how players choose between the light and dark themes and whether the 3D scene gets both; the roadmap defers that question to this design. Ask it rather than deciding it.
```

## [ ] 2. Architect the Classic 2D slice for m1

Depends on: none

Context: none

```prompt
/architect "Classic 2D" m1-classic-2d
```

## [ ] 3. Architect the main menu and game shell slice for m1

Depends on: none

Context: none

```prompt
/architect "Main menu and game shell" m1-classic-2d
```

## [ ] 4. Architect the results and records slice for m1

Depends on: none

Context: none

```prompt
/architect "Results and records" m1-classic-2d
```

## [ ] 5. Architect the 3D mode slice for m2

Depends on: none

Context: none

```prompt
/architect "3D mode" m2-3d-joins
```

## [ ] 6. Architect the replays slice for m2

Depends on: none

Context: none

```prompt
/architect "Replays" m2-3d-joins
```

## [ ] 7. Architect the results and records slice for m2

Depends on: none

Context: none

```prompt
/architect "Results and records" m2-3d-joins
```

## [ ] 8. Architect the Steam features slice for m3

Depends on: none

Context: none

```prompt
/architect "Steam features" m3-on-steam

technical-direction.md leaves the Steamworks binding open, to be decided by a spike (steamworks.js lacks a leaderboard API: extend it, or adopt another binding). Do not pick the binding here; raise it as a question if the design cannot proceed around it.
```

## [ ] 9. Architect the main menu and game shell slice for m3

Depends on: none

Context: none

```prompt
/architect "Main menu and game shell" m3-on-steam
```

## [ ] 10. Architect the results and records slice for m3

Depends on: none

Context: none

```prompt
/architect "Results and records" m3-on-steam
```

## [ ] 11. Write the production plan

Depends on: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

Context: none

```prompt
/production-plan
```

## [ ] 12. Write the m1 tasks

Depends on: 11

Context: none

```prompt
Write the backlog tasks for milestone m1-classic-2d.

Read .claude/PLAN.md first. For every feature it places under m1-classic-2d, in plan order, run:

/task-add feature=<slug>

The deliverable is the complete m1 backlog in .claude/TASKS.md: every m1-classic-2d feature planned. Do not add tasks for features of any other milestone.
```

## [ ] 13. Write the m2 tasks

Depends on: 11

Context: none

```prompt
Write the backlog tasks for milestone m2-3d-joins.

Read .claude/PLAN.md first. For every feature it places under m2-3d-joins, in plan order, run:

/task-add feature=<slug>

The deliverable is the complete m2 backlog in .claude/TASKS.md: every m2-3d-joins feature planned. Do not add tasks for features of any other milestone.
```

## [ ] 14. Write the m3 tasks

Depends on: 11

Context: none

```prompt
Write the backlog tasks for milestone m3-on-steam.

Read .claude/PLAN.md first. For every feature it places under m3-on-steam, in plan order, run:

/task-add feature=<slug>

The deliverable is the complete m3 backlog in .claude/TASKS.md: every m3-on-steam feature planned. Do not add tasks for features of any other milestone.
```

## [ ] 15. Create the m1-tasks-implementation runbook

Depends on: 12

Context: none

```prompt
Create the runbook that implements milestone m1-classic-2d. Read .claude/PLAN.md and .claude/TASKS.md first.

/runbook-create m1-tasks-implementation implement every task of milestone m1-classic-2d

Answers to its interview, so it needs to ask nothing:
- End state: every task of every feature .claude/PLAN.md places under m1-classic-2d is [DONE] in .claude/TASKS.md.
- Steps: one step per such task, each prompt exactly `/task-implement <n>`, ordered by PLAN.md's feature order and, within a feature, by task id.
- Depends on: mirror each task's `Preconditions:` line where the precondition task is in this runbook; otherwise none.
- Needs: mirror each task's Target — claude+human → agent+human, human → human, claude → no line.
- Read-first document: none beyond what /task-implement reads itself.
- Already decided or rejected: nothing beyond the task bodies. Model: default. No Execution policy line.

This step creates the runbook only. Never run it.
```

## [ ] 16. Create the m2-tasks-implementation runbook

Depends on: 13

Context: none

```prompt
Create the runbook that implements milestone m2-3d-joins. Read .claude/PLAN.md and .claude/TASKS.md first.

/runbook-create m2-tasks-implementation implement every task of milestone m2-3d-joins

Answers to its interview, so it needs to ask nothing:
- End state: every task of every feature .claude/PLAN.md places under m2-3d-joins is [DONE] in .claude/TASKS.md.
- Steps: one step per such task, each prompt exactly `/task-implement <n>`, ordered by PLAN.md's feature order and, within a feature, by task id.
- Depends on: mirror each task's `Preconditions:` line where the precondition task is in this runbook; otherwise none.
- Needs: mirror each task's Target — claude+human → agent+human, human → human, claude → no line.
- Read-first document: none beyond what /task-implement reads itself.
- Already decided or rejected: nothing beyond the task bodies. Model: default. No Execution policy line.

This step creates the runbook only. Never run it.
```

## [ ] 17. Create the m3-tasks-implementation runbook

Depends on: 14

Context: none

```prompt
Create the runbook that implements milestone m3-on-steam. Read .claude/PLAN.md and .claude/TASKS.md first.

/runbook-create m3-tasks-implementation implement every task of milestone m3-on-steam

Answers to its interview, so it needs to ask nothing:
- End state: every task of every feature .claude/PLAN.md places under m3-on-steam is [DONE] in .claude/TASKS.md.
- Steps: one step per such task, each prompt exactly `/task-implement <n>`, ordered by PLAN.md's feature order and, within a feature, by task id.
- Depends on: mirror each task's `Preconditions:` line where the precondition task is in this runbook; otherwise none.
- Needs: mirror each task's Target — claude+human → agent+human, human → human, claude → no line.
- Read-first document: none beyond what /task-implement reads itself.
- Already decided or rejected: nothing beyond the task bodies. Model: default. No Execution policy line.

This step creates the runbook only. Never run it.
```
