# Runbook: planning-to-m3

Created: 2026-10-08 · Source: /product-roadmap conversation · Model: opus
Last step number: 17
Sequencing: /production-plan must see every architected feature, and tasks are written only after the plan orders them.

## [P] 1. Architect the visual design system slice for m1

Depends on: none

Context:
- 2026-10-09 Decided by the user: players choose the light or dark theme on the Settings page. Whether the 3D scene gets both themes is still open — ask it.
- 2026-10-09 parked: Background: the design system gives every mode and screen a light and a dark theme. The 3D mode is the existing 3D game, and the product design says its look is kept. That look is light: a pale sky-blue background with fog, and number colours tuned against light revealed cubes. In m1 the roadmap says the 3D mode keeps its current look, and in m2 it rules out any visual redesign of the 3D scene. So the open point is what the 3D scene shows when a player has chosen the dark theme.
  Q1. Does the 3D scene get both themes?
    a. No. The 3D scene keeps its one current look under both themes. Only the menus, the in-game overlay and the results screen around it follow the chosen theme.
    b. Yes, eventually. This design defines a dark variant of the scene's colours (sky, fog, cube and number tints) as theme colours. It is applied later, outside m1, at a milestone the roadmap would then name.
    c. Yes, now. The 3D scene follows the theme already in m1. This contradicts the m1 slice ("the 3D mode keeps its current look"), so the roadmap would need revising first.
    Recommendation: a. The product design says the 3D look is kept and is the bar for every mode, and the roadmap keeps the scene untouched through m2. The overlay drawn over the 3D board still follows the theme, so the switch between modes stays consistent.

```prompt
/architect "Visual design system" m1-classic-2d

The product design leaves open how players choose between the light and dark themes and whether the 3D scene gets both; the roadmap defers that question to this design. Ask it rather than deciding it.
```

## [P] 2. Architect the Classic 2D slice for m1

Depends on: none

Context:
- 2026-10-09 parked: approval gate — the architecture draft for the Classic 2D slice (three documents: cell-graph-rules-engine, board-generation, classic-2d-square-play) waits for approval when the step runs. With it, two design questions:
  Q2. "Matches Minesweeper Online on every action" needs one fixed reference, because that site lets players change several options. Which configuration is the reference?
    a. Minesweeper Online with its default options. Each rule and limit gets pinned by a fidelity test written against the live site: what the first click guarantees (just safe, or always an opening), whether a left click on a satisfied number chords, what happens to wrong flags on a loss, and the largest custom board allowed.
    b. A specific configuration you name.
    Recommendation: a. The defaults are what most enthusiasts play, and each pinned value becomes a test instead of a guess in the design.
  Q3. With no-guess on, when is the board generated?
    a. When the first click lands. The board is built around that cell in the worker. Expert may show a short "generating" pause, and the timer starts once the board is ready.
    b. In advance, with a marked starting cell the player must open first. There's no wait, but the opening is forced.
    Recommendation: a. The player keeps a free first click and it matches the safe-first-click flow. If Minesweeper Online's no-guess mode turns out to do b, choosing a here is a deliberate difference from the reference, recorded in the document.

```prompt
/architect "Classic 2D" m1-classic-2d
```

## [P] 3. Architect the main menu and game shell slice for m1

Depends on: none

Context:
- 2026-10-09 parked: approval gate — the architecture draft for the m1 main menu and game shell slice (three documents: game-shell, settings, platform-storage; the open call is whether platform storage stays its own document or folds into settings) waits for approval when the step runs. With it, two design questions:
  Q2. Should the controls settings let players rebind keys, mouse buttons and controller buttons in m1?
    a. No. m1 keeps look sensitivity and invert Y plus a read-only list of the bindings. Rebinding is a non-goal with no milestone named yet.
    b. Yes. Rebinding for keyboard, mouse and controller in both modes is part of m1.
    Recommendation: a. The roadmap's m1 slice only asks for "settings for controls", and the current game has no rebinding. Rebinding across two modes and three input devices is a sizeable piece that does not affect the m1 exit criteria.
  Q3. While a game is paused, is the board hidden?
    a. Yes, in every mode. The pause screen covers the board while the timer is stopped. For 3D this changes current behaviour, where the scene stays visible behind the pause card.
    b. Only in Classic 2D. 3D keeps its current pause.
    c. No. The board stays visible behind the pause menu in both modes.
    Recommendation: a. Times feed personal bests, and later Steam leaderboards. A visible board with a stopped clock would let a player study it for free, and treating every mode the same keeps records comparable.

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

Context:
- 2026-10-09 Correction from the user: every task gets a review/iterate round — each step's prompt is `/task-implement <n> --review`, not the bare `/task-implement <n>`.

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

Context:
- 2026-10-09 Correction from the user: every task gets a review/iterate round — each step's prompt is `/task-implement <n> --review`, not the bare `/task-implement <n>`.

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

Context:
- 2026-10-09 Correction from the user: every task gets a review/iterate round — each step's prompt is `/task-implement <n> --review`, not the bare `/task-implement <n>`.

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
