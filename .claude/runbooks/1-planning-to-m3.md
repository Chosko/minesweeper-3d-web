# Runbook: planning-to-m3

Created: 2026-10-08 · Source: /product-roadmap conversation · Model: opus
Last step number: 17
Sequencing: /production-plan must see every architected feature, and tasks are written only after the plan orders them.

## [x] 1. Architect the visual design system slice for m1

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
- 2026-10-09 unparked with answer: Q1a — three documents: design-tokens-and-themes, square-tile-skin and screen-components. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Visual design system" m1-classic-2d

The product design leaves open how players choose between the light and dark themes and whether the 3D scene gets both; the roadmap defers that question to this design. Ask it rather than deciding it.
```
Done: 2026-10-09, commit `f76e17f` (6 files, +358/-5). Three documents written; the prompt's open theme question was already settled in Context, so nothing was asked.

## [x] 2. Architect the Classic 2D slice for m1

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
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Classic 2D" m1-classic-2d
```
Done: 2026-10-09, commit `419c404` (6 files, +477/-2). Board generation stays its own document. The rules are not yet observed: each one that could go two ways is a fidelity test needing one human observation of the live Minesweeper Online.

## [x] 3. Architect the main menu and game shell slice for m1

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
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Main menu and game shell" m1-classic-2d
```
Done: 2026-10-09, commit `d6e77d8` (6 files, +392/-0). Platform storage kept its own document. Decided by the agent, unasked: graphics settings are fullscreen plus a 3D render resolution of Auto (the current adaptive behaviour), Sharp or Fast.

## [x] 4. Architect the results and records slice for m1

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
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Results and records" m1-classic-2d
```
Done: 2026-10-09, commit `a33a66e` (12 files, +494/-30). game-summary kept its own document, and game-shell and classic-2d-square-play now report abandoned games. Decided by the agent, unasked: only wins set a best, a tie keeps the earlier best, and records cannot be reset. A game whose window is closed mid-play is not recorded until that question is settled.

## [x] 5. Architect the 3D mode slice for m2

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
- 2026-10-09 (from step 8, the user's answer): the three flat "2D" presets of 3D mode (9×9×1, 16×16×1, 30×16×1) are discarded as redundant with Classic 2D; 3D mode keeps 6 presets (double layer and cube).
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "3D mode" m2-3d-joins
```
Done: 2026-10-09, commit `624f3b5` (7 files, +348/-10). Two documents, with six 3D presets. Rule changes the draft did not spell out: a seed no longer reproduces an original board, a finished board ignores clicks, the timer starts on the first applied reveal, and flags placed before it are kept.

## [x] 6. Architect the replays slice for m2

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
- 2026-10-09 unparked with answer: Q2a — keep three documents: replay-recording, replay-playback, replay-library; Q3a — store the mine positions and the actions and replay them on the engine, each shipped rules version frozen and kept by the engine (step 2's engine design takes on this requirement). The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Replays" m2-3d-joins
```
Done: 2026-10-09, commit `233bb38` (8 files, +490/-15). The large-file replay store (IndexedDB) lives in replay-library, not in platform-storage. Decided by the agent, unasked: games abandoned after their first click are recorded too, and an auto-pinned personal-best replay stays pinned after the best is beaten.

## [ ] 7. Architect the results and records slice for m2

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
- 2026-10-09 unparked with answer: Q2a — keep two documents, the records data and the screens; Q3a — the 3D results screen appears after the end effect has played (about a second, input frozen), the loss wave being the player's only look at the mines. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Results and records" m2-3d-joins
```

## [ ] 8. Architect the Steam features slice for m3

Depends on: none

Context: none
- 2026-10-09 parked: approval gate — the m3 Steam architecture draft (five documents: steam-desktop-host, steam-cloud-saves, steam-leaderboards, leaderboard-screen, steam-achievements; open calls on merging leaderboard-screen into steam-leaderboards or steam-cloud-saves into steam-desktop-host) waits for approval when the step runs. It leaves the Steamworks binding to a spike behind a capability adapter, which must happen before the leaderboard tasks; leaderboard wins are verified by re-running their replay. With it, two design questions:
  Q1. Which 3D presets get Steam leaderboards? The 3D mode has nine presets: three flat "2D classic" boards (9×9×1, 16×16×1, 30×16×1), three double-layer boards and three cubes. Each preset would get two boards, with no-guess on and off.
    a. All nine presets, so 18 3D boards (24 boards in total with the six 2D ones).
    b. Only the six true 3D presets (double layer and cube), so 12 3D boards.
    c. Only the three cube presets, so 6 3D boards.
    Recommendation: a. The product design gives every standard free-play board a leaderboard. The flat presets played in 3D aren't comparable with Classic 2D times, because the controls are different.
  Q2. What kind of achievements go into the m3 set for Classic 2D and 3D?
    a. A small set of about 15–20 milestones: a first win on each board, Expert wins with no-guess off, 3BV/s and efficiency thresholds, a win without placing any flag, and wins on each 3D preset.
    b. Option a plus grind achievements: games played, win streaks and total cells cleared.
    c. Only a handful of firsts (first win in each mode and on each difficulty), with the rest left to m6.
    Recommendation: a. It gives enthusiasts goals they care about without padding, and m6 already brings the full set.
- 2026-10-09 unparked with answer: Q1 — in 3D mode the first three "2D" presets (9×9×1, 16×16×1, 30×16×1) must be discarded, because they are redundant with Classic 2D; the remaining 6 presets (double layer and cube) get leaderboards, 12 3D boards; Q2a — a small set of about 15–20 milestone achievements. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.
- 2026-10-09 (from step 6): replay-recording specifies a replay verifier that re-runs a replay on the engine without drawing anything, for leaderboard replay checks to reuse.

```prompt
/architect "Steam features" m3-on-steam

technical-direction.md leaves the Steamworks binding open, to be decided by a spike (steamworks.js lacks a leaderboard API: extend it, or adopt another binding). Do not pick the binding here; raise it as a question if the design cannot proceed around it.
```

## [ ] 9. Architect the main menu and game shell slice for m3

Depends on: none

Context: none
- 2026-10-09 parked: approval gate — the m3 main menu architecture draft (one document, leaderboards-menu-entry: the Leaderboards entry between Records and Settings in both builds, opening step 8's leaderboard-screen) waits for approval when the step runs. With it, two design questions:
  Q1. How is the m3 menu slice split from step 8's Steam work?
    a. One document here (`leaderboards-menu-entry`): it owns the menu entry and its navigation, and step 8's `leaderboard-screen` owns the screen.
    b. Write no document here. The Leaderboards entry is folded into step 8's `leaderboard-screen`. The catch: FEATURES.md would then record no feature for this menu slice, because a feature's Source can name only one section.
    c. Move the whole Leaderboards screen into this slice, since the technical direction puts screens in the game shell. Step 8 drops `leaderboard-screen` and keeps only the Steam data side (`steam-leaderboards`). This changes step 8's parked draft.
    Recommendation: a. It keeps the shell work and the Steam work in separate tasks, matches step 8's draft as it stands, and gives the roadmap slice its own entry in FEATURES.md.
  Q2. Where does Quit go? A fullscreen desktop build needs it, but no roadmap slice includes it.
    a. Add it to this m3 document, shown on the desktop build only (a web page cannot close itself). Then correct the m3 slice afterwards with /product-roadmap.
    b. Leave it as an open question in this document and settle it when the roadmap is revised.
    c. Put it in step 3's m1 game-shell instead, hidden on the web build until the desktop build exists.
    Recommendation: a. m3 is the first milestone with a desktop build, so it is the first place Quit is needed. Correcting the roadmap keeps the slice accurate.
- 2026-10-09 unparked with answer: Q1a — one document here (`leaderboards-menu-entry`) owning the menu entry and its navigation, step 8's `leaderboard-screen` owning the screen; Q2a — Quit goes in this m3 document, shown on the desktop build only, and the m3 slice is corrected afterwards with /product-roadmap. The architecture approval gate was not answered here: it is asked, with its draft, when the step runs.
- 2026-10-09 unparked with answer: approval gate — approved as drafted, unseen, by the user's standing decision; on each open call in the draft take the draft's recommendation. This supersedes any earlier bullet saying the gate is asked when the step runs. Park only on a real design question.

```prompt
/architect "Main menu and game shell" m3-on-steam
```

## [ ] 10. Architect the results and records slice for m3

Depends on: none

Context: none
- 2026-10-09 parked: approval gate — the m3 results and records architecture draft (one document, results-steam-rank: a global and friends rank panel after a won game on a standard board, filled in without blocking the screen, offline wins queued; it needs step 8's Steam link to return both ranks) waits for approval when the step runs. With it, four design questions:
  Q2. Steam keeps only each player's best entry per board. What does the panel show after a win that does not beat that best?
    a. The player's current standing rank, global and friends, labelled "your best". A move like #120 → #87 appears only when the win improved the entry.
    b. Where this game's time would have ranked, plus the standing rank. This needs extra leaderboard downloads to locate the time.
    c. No panel unless the win improved the entry.
    Recommendation: a. It is honest and cheap, and the leaderboard screen covers the rest.
  Q3. What does the rank panel show on the web preview, which has only local leaderboards?
    a. One "local" rank: this game among the player's own games on this board. No friends rank.
    b. No rank panel at all on the web build.
    Recommendation: b. A local rank just repeats the personal-best comparison already on the results screen, and the web preview is only a testing build.
  Q4. Should this be its own document, or fold into step 8's work?
    a. Its own document (`results-steam-rank`), so this roadmap slice gets its own entry in the feature index.
    b. Fold it into step 8's `steam-leaderboards`. The catch is that the feature index would then have no entry for this slice, because each entry can name only one source section.
    Recommendation: a. It matches step 9's answer for the same situation and keeps results-screen work separate from Steam work.
  Q5. How long does the panel wait for Steam before it gives up and shows the offline wording?
    a. About 5 seconds. A late answer still fills the panel in if the player is still on the results screen.
    b. No limit. It shows "ranking…" until the answer arrives or the player leaves the screen.
    Recommendation: a. It never leaves a spinner on a dead connection and still shows a slow answer.
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.
- 2026-10-09 unparked with answer: Q2a — after a win that does not beat the best, the panel shows the standing global and friends rank labelled "your best", the move shown only when the entry improved; Q3b — no rank panel on the web build; Q4a — its own document, results-steam-rank; Q5a — the panel waits about 5 seconds, a late answer still filling it in while the player is on the results screen. The approval gate is answered by the user's standing decision above.

```prompt
/architect "Results and records" m3-on-steam
```

## [ ] 11. Write the production plan

Depends on: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10

Context:
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.

```prompt
/production-plan
```

## [ ] 12. Write the m1 tasks

Depends on: 11

Context:
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.
- 2026-10-09 (from step 2): the Classic 2D documents pin each two-way rule (first-click guarantee, chording, what a loss shows, what counts as a click, the largest custom board) by a fidelity test that needs one human observation of the live Minesweeper Online, so those tasks need a person (Target claude+human).

```prompt
Write the backlog tasks for milestone m1-classic-2d.

Read .claude/PLAN.md first. For every feature it places under m1-classic-2d, in plan order, run:

/task-add feature=<slug>

The deliverable is the complete m1 backlog in .claude/TASKS.md: every m1-classic-2d feature planned. Do not add tasks for features of any other milestone.
```

## [ ] 13. Write the m2 tasks

Depends on: 11

Context:
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.

```prompt
Write the backlog tasks for milestone m2-3d-joins.

Read .claude/PLAN.md first. For every feature it places under m2-3d-joins, in plan order, run:

/task-add feature=<slug>

The deliverable is the complete m2 backlog in .claude/TASKS.md: every m2-3d-joins feature planned. Do not add tasks for features of any other milestone.
```

## [ ] 14. Write the m3 tasks

Depends on: 11

Context:
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.

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
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.

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
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.

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
- 2026-10-09 Decided by the user: every approval gate a skill in this step raises is approved as drafted, unseen; on each open call take the draft's own recommendation, and answer the gate from this bullet rather than parking. Park only on a real design question.

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
