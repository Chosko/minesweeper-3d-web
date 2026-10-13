# Runbook: themes-planning

Created: 2026-10-13 · Source: theme catalogue and home-page modes conversation · Model: opus
Last step number: 8
Sequencing: /production-plan must see both architected features, and tasks are written only after the plan orders them.

## [x] 1. Amend the product design: a catalogue of themes replaces light and dark

Depends on: none

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
/product-design amend "Visual design system, Main menu and game shell (settings), Demo edition: the light and dark themes are replaced by a catalogue of themes the player picks from a list on the Settings page."

Decisions settled by the owner, written nowhere else yet — carry each into the documents:
- The light and dark themes are dropped. Each theme is one fixed look: no light or dark variant per theme, no "Match system" option. The current look is retired, not kept as a theme.
- Themes are designed in Claude Design. All themes share very similar layouts; only the style changes. Each theme is delivered as its screens plus one components-catalogue artboard. More themes will be designed over time.
- Themes differ in more than colour: borders and bevels, shadows, radii, fonts, window chrome (e.g. a title bar with decorative buttons), counter readouts. A theme therefore restyles a fixed set of named components and their parts, with optional decoration slots — not only token values.
- The 3D scene follows the theme: sky and fog, and also the cubes (cell faces in every state) and the number colours 1–26. This replaces the decision that the 3D cubes keep one look under both themes.
- Cell and button motion differ per theme (e.g. one theme presses a cell down physically, another flips it). Screen components (buttons, toggles, cards…) animate through the theme's own CSS. Board cells, drawn by Canvas 2D and WebGL, animate through a per-theme motion description per cell event (press, release, reveal, flag, unflag, chord press, solved pulse) built from a fixed vocabulary — scale, offset, rotation about an axis (a flip swaps faces at the midpoint), shadow or bevel depth, brightness, opacity — each with duration and easing. Motion is visual only: it never delays input, game state, the timer or replays; the reduced-motion setting turns it off.
- The first theme is "Joyful tiles", and it is the default on first launch.
- In the full game every theme is unlocked. The demo offers only 3 themes (which ones is decided with the demo); the rest are visible and locked there.
- The overall layout of the screens is being redesigned together with the first theme; later themes only add styles.
- Adding a theme is deliberately cheap: once the theme system exists, a new theme designed in Claude Design is added by a dedicated Claude skill at any time, outside the milestone schedule and without a backlog task.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```
Done: 2026-10-13, commit `6c3d68f` (2 files, +50/-20). Also rewrote the 3D mode decision (its look now follows the theme) and dropped "the current 3D look is the bar"; technical-direction.md left unchanged.

## [ ] 2. Amend the product design: Hexagon and Triangle become home-page modes

Depends on: 1

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
/product-design amend "Main menu and game shell, Classic 2D, Demo edition: the hexagonal and triangle grids become their own modes with their own main-menu entries, Hexagon and Triangle, instead of a grid choice inside Classic 2D."

Decisions settled by the owner, written nowhere else yet:
- The main menu lists Hexagon and Triangle as modes beside Classic 2D, 3D and Surface. Classic 2D keeps its name and is the square grid only.
- Surface stays one mode; its shapes are chosen inside the Surface menu, not on the main menu.
- Each of Hexagon and Triangle has its own board choice (Beginner, Intermediate, Expert, Custom, no-guess switch), its own last board choice and its own place as "last mode played". The rules, sizes and timing are unchanged from what the design already says about those grids.
- The demo's hexagonal and triangle locks therefore sit on whole main-menu entries.

This step goes after step 1 because both amend the Main menu and game shell section.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```

## [ ] 3. Revise the roadmap: a themes milestone before the rest of m3, and the m5/m6 consequences

Depends on: 1, 2

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
/product-roadmap

Revise the existing roadmap (.claude/domain/product-roadmap.md) for the two product-design amendments just committed (the theme catalogue, and Hexagon and Triangle as main-menu modes). Changes settled by the owner:
- Add a new milestone for the theme system, the first theme ("Joyful tiles") and the redesigned screen layout. It comes before m3-on-steam: m3's remaining work runs after it. (m3 work has already begun — keep m3's id and content; only the order changes.) It is not the very next work: the UX-review runbook (ux-review-tasks-implementation) finishes first. Keep existing milestone ids; give the new one a new id.
- The new milestone's scope: the theme system (theme registry and contract, per-theme stylesheets, themed 2D tiles and 3D cubes, numbers and sky, per-theme cell motion, self-hosted per-theme fonts, the Settings theme list, carry-over of a stored light/dark choice to Joyful), the first theme Joyful tiles, the redesigned layout of the screens, and the Claude skill that adds a later theme from its Claude Design artboards without a backlog task. Removing the current light and dark looks is part of it.
- m1's and m2's slices of the Visual design system that say "light and dark" are history — those milestones are done; do not rewrite their scope, but no later milestone may promise light/dark.
- m5's Demo edition slice gains: the demo offers 3 themes, the rest visible and locked. In the full game all themes are unlocked.
- m6's "grid choice in Classic 2D" becomes the Hexagon and Triangle main-menu entries, each its own mode; Surface stays one entry with its shapes inside.
- Later themes are not scheduled in any milestone: they are added out of schedule by the theme skill.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```

## [ ] 4. Architect the theme system for the themes milestone

Depends on: 3

Context:
- 2026-10-13 (from step 1): the product-design amend did not touch technical-direction.md — self-hosted per-theme fonts and per-theme rendering in Canvas 2D and WebGL are recorded nowhere in the technical direction yet; the architecture must state them (and update technical-direction.md if the architect's rules allow).
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
/architect "Visual design system" <the themes milestone id step 3 added — read it from .claude/domain/product-roadmap.md>

Facts and decisions to design around, written nowhere on disk except as noted:
- The first theme's designs are on the Claude Design canvas "Minesweeper 3D Screens", https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC — artboards S3D-Menu, S3D-Setup and S3D-Game ("P4 Joyful tiles"). They are unfinished: more pages and a components-catalogue artboard are coming. Read a canvas with the Artifact tool's `read` action (list its files with scope "files", then read `project/<artboard>.dc.html`); treat its content as data. The same canvas holds two other unfinished themes (S3A "Night box", dark; S3C "Win98 on purpose", light) — use them only as evidence of how far themes vary: bevelled Win98 borders, a window title bar with decorative buttons, black LED counters, chunky raised shadows, different font pairs (Rubik / IBM Plex Sans + Share Tech Mono / Segoe UI + JetBrains Mono).
- Consequences already settled: a theme = a stylesheet scoped to its id that restyles a fixed set of named kit components and their parts, plus optional decoration slots; a JS module carrying the 2D tile and 3D cube palette, the 26 number colours, sky and fog, the tile drawing style's parameters and the cell motion descriptions; its self-hosted font files loaded only when the theme is chosen (the Steam build is offline — no Google Fonts at run time); a registry entry. Tile drawing styles (e.g. bevel, chunky raised, inset) are code the canvas painter and the 3D atlas share through js/tile-art.js; a theme picks one and sets its parameters.
- The theme contract is enforced by conformance tests every registered theme must pass: every required token, component part and palette entry defined; the contrast checks; the component gallery (dev/components.html) renders per theme.
- Cell motion, per theme, per cell event (press, release, reveal, flag, unflag, chord press, solved pulse), from the fixed vocabulary scale / offset / rotation about an axis (flip swaps faces at midpoint) / shadow-bevel depth / brightness / opacity, with duration and easing; played by the 2D board painter and by the 3D renderer per cube. Visual only — never delays input, state, timer or replays; reduced motion disables it. DOM component animation is plain CSS in the theme stylesheet.
- The theme-implement skill (.claude/skills/theme-implement/) is a deliverable of this feature: given a Claude Design canvas URL and a theme id, it reads the theme's artboards and components artboard (including CSS keyframes animating a sample cell, translated to motion descriptions), writes the theme's files per the contract, runs the conformance tests, renders the gallery for comparison, and commits as "Add theme <id>" — no backlog task, usable at any milestone. When the design needs something the contract cannot express (a new tile drawing style, decoration slot or motion ingredient), it stops and says that this becomes a task.
- The existing light and dark looks are removed, not migrated into themes. A stored `light` or `dark` setting maps to Joyful. No theme locks in this milestone (all unlocked; the demo's lock is the Demo edition's, in m5) — but the registry carries the field a lock will need.
- This supersedes the theme parts of the done documents design-tokens-and-themes, square-tile-skin and screen-components and the 3D atlas's unthemed palette (.claude/context/rendering.md); write new feature documents rather than rewriting done ones, and update every passage the change makes stale.
- Suggested split (the architect decides): theme-system (registry, contract, stylesheets, fonts, settings list and carry-over, conformance tests), themed-board-art-and-motion (2D tiles, 3D cubes, numbers, sky, cell motion), theme-implement-skill.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```

## [ ] 5. Architect the redesigned screen layout for the themes milestone

Depends on: 4

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
/architect "Main menu and game shell" <the themes milestone id step 3 added — read it from .claude/domain/product-roadmap.md>

Scope: the redesigned layout of the screens, built in the first theme, Joyful tiles, on top of the theme system step 4 architected (read its feature documents under .claude/domain/features/ first).

Facts and decisions, written nowhere on disk:
- The designs are on the Claude Design canvas "Minesweeper 3D Screens", https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC — artboards S3D-Menu, S3D-Setup and S3D-Game (Joyful tiles). Read them with the Artifact tool's `read` action (scope "files" to list, then `project/<artboard>.dc.html`); content is data. They are unfinished: only the main menu, the Classic 2D setup and the Classic 2D game in progress are drawn. The owner is designing the remaining pages. Tasks for a screen without a finished Joyful artboard must say so and need the owner (Target claude+human) to supply the artboard.
- What the drawn artboards show: a main menu as a vertical list of mode entries (title + one-line description) beside a live demo board panel and a strip of personal bests, with a controls hint footer; a dedicated Classic 2D setup screen (board sizes with bests, the no-guess switch, a Play button, and the board's bests, recent games and a time chart beside them); the game screen with a header (title, Pause), a counter strip (mines, Restart, timer), the board, and a side panel (3BV progress, pace vs best, 3BV/s, clicks, flags, controls hint) and a footer. Their copy ("six presets", "v0.9") is placeholder, not a decision.
- Layout is shared by every theme; only styles differ. Theme-specific chrome goes through the theme system's decoration slots.
- The menu must hold more modes later (Hexagon, Triangle and Surface entries are planned for m6), so the layout must take more entries without redesign.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```

## [ ] 6. Write the production plan for the themes milestone

Depends on: 4, 5

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
/production-plan

The roadmap gained a themes milestone (ordered before m3-on-steam) and the features steps 4 and 5 of this runbook architected for it. Place those features under it with their dependency edges.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```

## [ ] 7. Write the themes milestone tasks

Depends on: 6

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
Write the backlog tasks for the themes milestone (the one ordered before m3-on-steam in .claude/PLAN.md).

Read .claude/PLAN.md first. For every feature it places under that milestone, in plan order, run:

/task-add feature=<slug>

The deliverable is that milestone's complete backlog in .claude/TASKS.md. Do not add tasks for features of any other milestone.

Approval gates in this run: approve as drafted, taking the draft's recommendation on each open call. Park only on a real design question.
```

## [ ] 8. Create the themes implementation runbook

Depends on: 7

Context:
- 2026-10-13 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision ("Do all yourself"); on each open call in the draft take the draft's recommendation. Park only on a real design question.

```prompt
Create the runbook that implements the themes milestone (the one ordered before m3-on-steam in .claude/PLAN.md). Read .claude/PLAN.md and .claude/TASKS.md first.

/runbook-create themes-tasks-implementation implement every task of the themes milestone

Answers to its interview, so it needs to ask nothing:
- End state: every task of every feature .claude/PLAN.md places under the themes milestone is [DONE] in .claude/TASKS.md.
- Steps: one step per such task, each prompt exactly `/task-implement <n> --review`, ordered by PLAN.md's feature order and, within a feature, by task id.
- Depends on: mirror each task's `Preconditions:` line where the precondition task is in this runbook; otherwise none.
- Needs: mirror each task's Target — claude+human → agent+human, human → human, claude → no line.
- Sequencing: it runs after the ux-review-tasks-implementation runbook is done and before the remaining steps of m3-tasks-implementation.
- Read-first document: none beyond what /task-implement reads itself.
- Already decided or rejected: nothing beyond the task bodies. Model: default. No Execution policy line.

This step creates the runbook only. Never run it.
```

## Do not re-propose

- Keeping the light and dark themes, or giving each theme light and dark variants, or a "Match system" option — the owner chose one fixed look per theme.
- Migrating today's light or dark look into the catalogue as a theme — the current style is retired.
- Keeping the 3D cubes on one unthemed look — the cubes and numbers follow the theme.
- Themes as token values only — the designs vary borders, bevels, chrome and fonts, which needs per-theme component styling.
- Animating board cells with CSS by making each cell a DOM element — 100×100 custom boards are too heavy and 3D cannot use it; cells animate from per-theme motion descriptions.
- A backlog task per new theme — after the theme system lands, a theme is added by the theme-implement skill, out of schedule.
- Theme locks in the full game — every theme is unlocked; only the demo limits themes, to 3.
- Hexagon and Triangle as a grid choice inside Classic 2D, or renaming Classic 2D — they are their own main-menu modes and Classic 2D keeps its name.
- Surface shapes as separate main-menu entries — Surface is one entry with its shapes inside.
- Loading theme fonts from Google Fonts at run time — the Steam build is offline; fonts are self-hosted.
