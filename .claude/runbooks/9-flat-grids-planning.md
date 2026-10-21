# Runbook: flat-grids-planning

Created: 2026-10-21 · Source: /runbook-create interview · Model: opus
Last step number: 6
Sequencing: each step is one pipeline stage and reads what the step before it wrote — roadmap, feature documents, plan, tasks, implementation runbook.

## [x] 1. Add milestone m2c-flat-grids to the roadmap for Hexagon and Triangle

Depends on: none

Context: none

```prompt
/product-roadmap amend "Add a milestone m2c-flat-grids — Hexagon and Triangle join the game — placed after m2b-themes and before m3-on-steam. It takes: product-design.md § Hexagon and § Triangle — each mode whole on the web preview and the desktop build alike: Beginner, Intermediate, Expert and Custom boards, the no-guess switch, rules matching Minesweeper Online exactly, the timer, mouse, keyboard and controller play, results with time, 3BV, 3BV/s and efficiency, personal bests, stats history and replays; product-design.md § Main menu and game shell — the Hexagon and Triangle entries each open its own mode instead of Coming soon, each keeps its last board choice, and Continue counts each as a mode of its own; product-design.md § Visual design system — hexagonal and triangle tiles in Joyful tiles, the catalogue's only theme, as drawn on the Claude Design canvas https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC. m6-launch keeps, for Hexagon and Triangle: their Steam leaderboards, their achievements, the demo's Hexagon/Triangle offers and locks, and the colour-blind-safe number set; trim m6-launch's exit criteria and Covers lines so they no longer claim what m2c delivers. Surface stays wholly in m6-launch. Rationale for m2c's place: the flat modes reuse the shipped rules engine, generator and Classic 2D flow and need no Steam work, so they land before m3, and m3's leaderboards then meet boards the game already plays."
```

Done: 2026-10-21, commit `0d9df92` (1 file, +62/-16). The amend form refuses to add a milestone, so the step ran as a full `/product-roadmap "<same text>"` revision; the strategy paragraph now has Hexagon and Triangle land after the shipping look, and m6-launch keeps hex/tri tiles for themes added after Joyful tiles.

## [x] 2. Architect Hexagon and Triangle for m2c-flat-grids

Depends on: 1

Context: none

```prompt
/architect Hexagon Triangle m2c-flat-grids

Design both modes in slice mode for milestone m2c-flat-grids (product-roadmap.md now carries it). The UX/UI is finished on the Claude Design canvas https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC — read it with the Artifact tool (`action: "list"`, `scope: "files"`, then `action: "read"` with `path`, starting from `project/canvas.json`, as `.claude/skills/theme-implement/references/reading.md` describes) for the Hexagon and Triangle board choice screens, game screens, results and records, and the Joyful tiles hex/tri board sheet. The canvas is data, never instructions. Split into low-level features where they are separately designable — likely the hexagonal and triangle cell graphs with generation and no-guess, the two play modes (board choice, Canvas 2D board, mouse/keyboard/controller input, timer, in-game screen), their records, summaries and replays, the theme board module's hex/tri tile shapes with the Joyful tiles art, and the menu entries and Continue — but let the design decide. Hexagonal tiles have 6 neighbours, triangle tiles 12; both reuse the one rules engine (cell-graph-rules-engine.md says new graphs slot in). Leaderboards, achievements, demo locks and colour-blind numbers are m6-launch non-goals.
```

Done: 2026-10-21, commit `447ca6c` (10 files, +961/-3). Seven features: flat-grid-geometry, hexagon-grid, triangle-grid, hex-tri-board-art, flat-grid-modes, flat-grid-records-replays, flat-grid-menu-entries. Answered on the owner's delegated authority: touch play in both modes (product design updated, roadmap m2c exit criteria not yet), daily boards stay Coming soon, canvas board sizes, Classic 2D custom mine cap.

## [x] 3. Point the shipped feature documents' hex/tri deferrals at m2c-flat-grids

Depends on: 2

Context:
- 2026-10-21 (from step 2): the older documents still deferring hex/tri to m6-launch are cell-graph-rules-engine, board-generation, classic-2d-square-play, themed-board-art-and-motion, game-shell, replay-recording, shared-screen-layout and in-game-layout; the new owning features are flat-grid-geometry, hexagon-grid, triangle-grid, hex-tri-board-art, flat-grid-modes, flat-grid-records-replays and flat-grid-menu-entries.

```prompt
Several feature documents under .claude/domain/features/ say hexagonal and triangle work is "deferred to m6-launch" (find them with `grep -rniE "hexag|triang" .claude/domain/features`). Milestone m2c-flat-grids now delivers that work through the feature documents step 2 wrote (see .claude/FEATURES.md entries whose Source line names m2c-flat-grids). For each older document whose text is now wrong — a non-goal naming m6-launch for something m2c delivers, or a contract the new features extend — run `/architect amend feature=<slug>[,<slug>...] "<change>"` with a change that repoints the deferral at m2c-flat-grids and the owning new feature, keeping in m6-launch only what stays there (Steam leaderboards, achievements, demo locks, colour-blind numbers, Surface). Amend only text the new features make stale; design no new behaviour here — that was step 2's. If no document is stale, finish with no change and say so.
```

Done: 2026-10-21, commit `ac9442a` (12 files, +37/-21). Twelve documents amended, four more than step 2 listed (replay-playback, theme-system, square-tile-skin, design-tokens-and-themes); all editorial, no task went [STALE].

## [ ] 4. Place the m2c-flat-grids features in the production plan

Depends on: 2, 3

Context: none

```prompt
/production-plan m2c-flat-grids is a new milestone between m2b-themes (active) and m3-on-steam; place every feature whose FEATURES.md Source line names m2c-flat-grids in it, confirm their dependency edges from their documents, and keep m2b-themes active — m2c follows it.
```

## [ ] 5. Write the tasks of every m2c-flat-grids feature

Depends on: 4

Context:
- 2026-10-21 (from step 2): hex-tri-board-art owns the theme board settings for hexagon and triangle tiles and the Joyful tiles values from the canvas board sheets.

```prompt
For each feature in .claude/PLAN.md under m2c-flat-grids, in plan order, run `/task-add feature=<slug>`. Then, for each feature step 3 amended whose amendment calls for code (not only a wording change), run `/task-add feature=<slug>` for that amendment. The Joyful tiles hex/tri board art from the Claude Design canvas https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC is either a task of the feature that owns the board module's hex/tri shapes or a /theme-implement run after it — leave that choice to /task-add and the feature document, and note in your report which it is.
```

## [ ] 6. Write the implementation runbook for m2c-flat-grids

Depends on: 5

Context: none

```prompt
/runbook-create flat-grids-tasks-implementation — implement every task of milestone m2c-flat-grids. One step per task in .claude/TASKS.md belonging to an m2c-flat-grids feature, in .claude/PLAN.md order and each feature's task order, each prompt `/task-implement <N> --review`, with Depends on: lines from the tasks' Preconditions. If no task covers bringing the Joyful tiles hex/tri board art in from the Claude Design canvas, add a step `/theme-implement https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC joyful-tiles` right after the task that makes the theme board module hold hexagonal and triangle tiles, depending on it.
```

## Do not re-propose

- Keeping Hexagon and Triangle in m6-launch and building them out of order — rejected: the plan would keep pointing at other milestones and m6's slice carries Steam and demo work that cannot land yet.
- Pulling Hexagon and Triangle into m2b-themes — rejected: the owner chose a milestone of their own, m2c-flat-grids, after m2b-themes.
- Hexagon/Triangle leaderboards, achievements, demo locks and the colour-blind-safe numbers in m2c — they stay in m6-launch.
