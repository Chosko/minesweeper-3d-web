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
- 2026-10-09 unparked with answer: Q1a — the 3D scene keeps its one current look under both themes; only the menus, the in-game overlay and the results screen around it follow the chosen theme.
- 2026-10-09 parked: approval gate — the architecture draft for the m1 visual design system (three documents: design-tokens-and-themes, square-tile-skin, screen-components; the open call is whether the component kit merges into tokens-and-themes) waits for approval when the step runs. It carries Q1a above. It leaves the Settings page out, so step 3's settings feature must store a theme value and show a theme control. With it, one design question:
  Q2. Which theme does a player see on first launch, before they pick one in Settings?
    a. The operating system's light or dark preference, until the player picks one. Settings offers Light, Dark and "Match system".
    b. Light, which matches today's look. Settings offers Light and Dark only.
    c. Dark. Settings offers Light and Dark only.
    Recommendation: a. It costs one extra option, it respects the player's system choice, and the Electron build reads the same preference as the browser.
- 2026-10-09 unparked with answer: Q2b — the first-launch theme is Light; Settings offers Light and Dark only, with no "Match system" option. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 parked: approval gate — the m1 visual design system architecture draft, now carrying Q1a and Q2b (Light the default and the fallback, the theme switched by one root attribute applied before first paint; step 3's settings stores 'light' or 'dark'), waits for approval when the step runs. With it, one design question on the split:
  Q1. How should the visual design system be split into documents?
    a. Three documents: design-tokens-and-themes, square-tile-skin and screen-components.
    b. Two documents, with the component kit merged into design-tokens-and-themes.
    Recommendation: a. The tokens feed both the Canvas board and the DOM screens, and only the screens need the kit, so the 2D board can be built without waiting for it.

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
- 2026-10-09 unparked with answer: Q2a — Minesweeper Online with its default options is the reference, each rule pinned by a fidelity test; Q3a — with no-guess on, the board is generated when the first click lands. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 parked: approval gate — the Classic 2D architecture draft, now carrying the Q2a and Q3a answers (three documents: cell-graph-rules-engine, board-generation, classic-2d-square-play; the open call is whether board generation folds into the rules engine), waits for approval when the step runs.

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
- 2026-10-09 unparked with answer: Q2a — no rebinding in m1 (sensitivity, invert Y and a read-only bindings list; rebinding is a non-goal with no milestone yet); Q3a — the board is hidden while paused, in every mode. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 (from step 1): the visual design system draft leaves the Settings page out, so the settings feature must store the theme value and show the light/dark theme control (the user's decision: the theme is chosen on the Settings page).
- 2026-10-09 parked: approval gate — the m1 main menu and game shell architecture draft, now carrying the Q2a and Q3a answers and the theme control (three documents: game-shell, settings, platform-storage; the open call is whether platform storage folds into settings), waits for approval when the step runs. The draft records two open points: the theme control's values wait on step 1's first-launch theme question, and Quit is in no milestone's slice though the m3 Electron build needs it.
- 2026-10-09 (from step 1): the user answered the first-launch theme question — Light by default, and the theme control offers Light and Dark only, no "Match system".

```prompt
/architect "Main menu and game shell" m1-classic-2d
```

## [P] 4. Architect the results and records slice for m1

Depends on: none

Context:
- 2026-10-09 parked: approval gate — the architecture draft for the m1 results and records slice (four documents: game-summary, personal-records, results-screen, records-screen; the open call is whether game-summary folds into personal-records) waits for approval when the step runs. With it, three design questions:
  Q2. Which personal bests are kept for each board?
    a. Three separate bests per board: fastest time, best 3BV/s and best efficiency. The results screen compares the game against each one.
    b. Fastest time only. 3BV/s and efficiency appear only in stats history.
    Recommendation: a. This is what Minesweeper Online keeps, and it is what enthusiasts grind for. 3BV/s matters most on boards where the time alone says little.
  Q3. Do custom boards get personal bests?
    a. Yes. Each exact width, height, mine count and no-guess setting counts as its own board, with its own bests and history.
    b. No. Custom games appear only in stats history and win rate.
    Recommendation: a. Enthusiasts do play fixed custom sizes, and the current 3D game already keeps a best time for every exact size. Leaderboards still skip custom boards, as the product design says.
  Q4. A game is started (first click made) but then restarted or left for the menu before it is won or lost. Does it count in win rate and streaks?
    a. Yes, as a loss. It also breaks the win streak.
    b. No. The game is not recorded at all.
    Recommendation: a. Otherwise a player can protect a streak or a win rate by restarting a game that is going badly. A game abandoned before the first click is never counted.
- 2026-10-09 unparked with answer: Q2a — three separate bests per board (fastest time, best 3BV/s, best efficiency), each compared on the results screen; Q3a — custom boards get personal bests, each exact width, height, mine count and no-guess setting its own board; Q4a — a game started (first click made) and then restarted or left counts as a loss and breaks the win streak. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 parked: approval gate — the m1 results and records architecture draft, now carrying the Q2a, Q3a and Q4a answers (four documents: game-summary, personal-records, results-screen, records-screen; the open call is whether game-summary folds into personal-records), waits for approval when the step runs. It records two open points: whether closing the window mid-game counts as a loss, and who owns the shared storage interface (step 3's draft gives it to platform-storage).

```prompt
/architect "Results and records" m1-classic-2d
```

## [P] 5. Architect the 3D mode slice for m2

Depends on: none

Context:
- 2026-10-09 parked: approval gate — the architecture draft for the m2 3D mode slice (two documents: 3d-board-graph, putting the 3D box on the shared rules engine and retiring js/logic.js; 3d-play-flow, covering the deferred safe first click, the no-guess switch and the shared results; the open call is whether they fold into one) waits for approval when the step runs. The draft builds on the m1 designs of steps 2 and 4, still unapproved, and uses provisional names for them. With it, three design questions:
  Q2. With 26 neighbours, how safe is the 3D first click?
    a. Same rule as Classic 2D. If that rule is "always an opening", the clicked cell and all its neighbours are mine-free. On a board too dense to leave room, only the clicked cell is.
    b. Only the clicked cell is guaranteed safe.
    Recommendation: a. It keeps one rule across modes. An opening also matters more in 3D, where a lone number tells the player almost nothing.
  Q3. Is no-guess offered on every 3D board, including custom boards up to 100×100×100?
    a. Every preset, plus custom boards up to a cell-count limit the design sets from measured generation time. Above it, the switch is shown but disabled, with the reason.
    b. Every board, with no limit, behind a "generating" pause the player can cancel.
    Recommendation: a. A no-guess solver on a million-cell 3D board could run for minutes. A shown limit is better than a pause the player cannot predict.
  Q4. The current 3D game keeps a best time per exact board size in browser storage. What happens to those times?
    a. Leave them behind. 3D records start fresh under the new rules.
    b. Import them as fastest-time personal bests, with no 3BV or efficiency.
    Recommendation: a. Those times were set without a safe first click, so they are not comparable with new games. Only the web preview has them.
- 2026-10-09 unparked with answer: Q2a — the 3D first click follows the same rule as Classic 2D (an opening when that rule says so, only the clicked cell on a board too dense); Q3a — no-guess on every preset and on custom boards up to a cell-count limit set from measured generation time, the switch shown disabled with the reason above it; Q4a — the current 3D best times are left behind and 3D records start fresh. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 parked: approval gate — the m2 3D mode architecture draft, now carrying the Q2a, Q3a and Q4a answers (two documents: 3d-board-graph with a 3D rule profile on the shared engine, js/logic.js retired; 3d-play-flow; the open call is whether they fold into one), waits for approval when the step runs. Consequences it names: the custom-board mine cap drops to every cell but one, and seeded boards no longer match the original game's.

```prompt
/architect "3D mode" m2-3d-joins
```

## [P] 6. Architect the replays slice for m2

Depends on: none

Context:
- 2026-10-09 parked: approval gate — the architecture draft for the m2 replays slice (three documents: replay-recording, replay-playback, replay-library; the open call is whether recording and playback merge into one) waits for approval when the step runs. The draft builds on the unapproved m1 and m2 designs of steps 2–5 and uses provisional names for them. With it, two design questions:
  Q2. Besides the actions, what does a replay record?
    a. Movement too: the mouse cursor path in 2D and the camera position and view direction in 3D, sampled several times a second. Watching a replay then looks like watching the player.
    b. Actions only, with their times. Playback shows cells opening and flags appearing, with no cursor or camera movement.
    Recommendation: a. The replay viewers enthusiasts already use (Minesweeper Online, Arbiter) show cursor movement, and much of what makes a fast game impressive is the movement between clicks. Sampled movement stays small for 2D. For very long 3D games the design would set a sampling rate and say how big a replay can get.
  Q3. Which replays does the library keep?
    a. The most recent games, up to a fixed count, plus pinned replays that are never removed. A personal-best game is pinned automatically, and the player can pin any replay by hand.
    b. Every replay, forever. Storage grows without limit.
    c. Only replays the player chooses to save. Everything else is gone once the results screen closes.
    Recommendation: a. This keeps "every game is recorded" without unbounded growth on the web build's limited browser storage and, later, in Steam Cloud. Records that matter can never be lost to the rolling limit.
- 2026-10-09 unparked with answer: Q2a — replays record movement too (the 2D cursor path, the 3D camera position and view direction, sampled several times a second); Q3a — the library keeps the most recent games up to a fixed count plus pinned replays, a personal-best game pinned automatically and any replay pinnable by hand. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 parked: approval gate — the m2 replays architecture draft, now carrying Q2a and Q3a (the mine positions stored in the header, movement sampled about 20/s in 2D and 10/s in 3D, retention of the newest 100 unpinned plus pinned replays), waits for approval when the step runs. It puts two requirements on other steps: step 2's rules engine keeps every shipped rules version frozen, and step 3's storage gains a large-binary store (IndexedDB on the web). With it, two design questions:
  Q2. Should recording and playback merge into one document, or stay separate beside the library?
    a. Keep three documents: replay-recording, replay-playback, replay-library.
    b. Merge recording and playback into one, beside the library.
    Recommendation: a. Recording runs inside live play and owns the format, while playback is a separate read-only mode. Merging them would mix two different runtime settings into one set of tasks.
  Q3. How do replays keep playing correctly after game updates?
    a. Store the mine positions and the actions, and replay them on the engine. Each shipped version of the rules is frozen: any rule change ships as a new version and the engine keeps the old ones. Replays stay small, and step 2's engine design takes on this requirement.
    b. Store what each action changed on the board, so the replay plays without the engine. Old replays never depend on old rule versions, but they get larger and the format is harder to keep stable.
    Recommendation: a. It keeps replays small, and the check values in the format catch any replay that can no longer be reproduced.

```prompt
/architect "Replays" m2-3d-joins
```

## [P] 7. Architect the results and records slice for m2

Depends on: none

Context:
- 2026-10-09 parked: approval gate — the architecture draft for the m2 results and records slice (two documents: 3d-game-records, 3d-results-records-screens; the open call is whether they merge into one) waits for approval when the step runs. The draft extends step 4's unapproved m1 design and defers the old 3D best-time question to step 5's Q4. With it, two design questions:
  Q2. Once 3D games count in records, how are win rate and win streaks kept?
    a. Separately for each mode, and within each mode for each board. A 3D loss never breaks a 2D streak, and the two are never combined.
    b. One overall win rate and one overall streak across both modes, plus per-board figures.
    Recommendation: a. 3D boards are much harder and have different win rates. Combining them would make a 2D streak or win rate meaningless to an enthusiast tracking it.
  Q3. Today, when a 3D game ends, a short banner appears and the player can keep flying around the finished board to see where the mines were. How does the new results screen fit with that?
    a. The results screen opens as a panel over the scene. The player can close it to fly around the finished board and open it again with one key or button. Play again and Watch replay stay one step away.
    b. The results screen takes over completely when the game ends, and flying around the finished board is no longer possible.
    c. Keep the banner, and show the full results only from the pause menu.
    Recommendation: a. It keeps the 3D mode's current feel, which the product design says to keep, and still gives 3D the same results screen as 2D.
- 2026-10-09 unparked with answer: Q2a — win rate and streaks are kept per mode and per board, never combined; Q3b — the results screen takes over completely when a 3D game ends, and flying around the finished board is no longer possible. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 parked: approval gate — the m2 results and records architecture draft, now carrying Q2a and Q3b (3D boards identified by X×Y×Z, mines and no-guess; the results screen takes over and the end banner and finished-board flying go; the Records screen gains a 2D | 3D switch; product-design.md § 3D mode and § Results and records edited to match), waits for approval when the step runs. With it, two design questions:
  Q2. Should the two documents merge into one?
    a. Keep two: the records data and the screens.
    b. Merge them into one document.
    Recommendation: a. The records part is plain logic that can be tested without a browser. The screens part needs browser tests and depends on the menu and results screen designs from m1. Keeping them apart gives cleaner task boundaries.
  Q3. Today a 3D game ends with an effect: on a loss, a wave spreads across the board and shows where the mines were, and the camera shakes; on a win, confetti. With the results screen taking over completely, when does it appear?
    a. After the effect has played (about a second, with input frozen). The loss wave is now the player's only look at where the mines were.
    b. Straight away. The effect is cut.
    Recommendation: a. It keeps the moment that shows the player why they lost, at the cost of a short delay.

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
