# Game design — report

## Method

Played in headless Chromium (SwiftShader WebGL, 1280 × 800) through Playwright, driving the 3D
game with the `__ms` hook (aim, click, keys, wheel, camera) and the 2D game with real mouse
clicks on the canvas. Every screenshot named below was looked at.

- 3D: Cube Beginner standard (lost on purpose), Cube Beginner / Intermediate / Expert with
  no-guess (first click, Shift / Space / Ctrl, spacing wheel, right-click on a number, pause,
  leave), a custom 4 × 4 × 4 · 3 mines no-guess played to two wins and a loss, a reload mid-game,
  a custom 5 × 5 × 5 · 90 mines no-guess (failure offer), chord on a satisfied number, flag-all
  spam until the mine counter went negative, the replay viewer of a lost game, Play again.
  14 3D games started in all.
- Classic 2D: Beginner / Intermediate / Expert, standard and no-guess (first click), a
  Beginner no-guess game lost on purpose, restart and leave confirmations, a 9 × 9 · 31 mines
  no-guess (failure offer, Retry, Play a standard board), a 2 × 2 · 0 mines win. 10 2D games.
- Screens on the path: main menu, both board choices, Click to play, HUD, pause card, results
  (win and loss), Records (2D and 3D, empty and filled), Settings, replay viewer.
- Measured offline with the game's own engine, generator and solver under Node
  (`measure-openings.mjs`, `measure-candidates.mjs`, outputs `openings.txt`,
  `candidates.txt`): 100 seeds per preset and first-click spot, 60 per candidate preset. These
  numbers are the game's real distributions, not estimates.

What the headless environment prevented: pointer lock (the 3D "Click to play" → captured
mouse feel, sensitivity), sound, real frame rates (0.6–40 fps here, so every wall-clock timing
in the browser — end delay, generation wait — is unreliable; where it matters I quote the Node
measurement instead), and controller or touch play (not in my remit). I could not win a
Classic 2D preset board (the 2D engine is not exposed to the hook), so the 2D win path was
checked on a 2 × 2 board and the 3D win path on 4 × 4 × 4.

### The numbers the findings rest on (measured)

| Preset | Cells / mines | Density | Mines per interior neighbourhood | P(zero cell) | 3BV (median) | Standard first click opens | Standard board solvable by logic alone |
|---|---|---|---|---|---|---|---|
| 2D Beginner | 81 / 10 | 12.3 % | 0.99 of 8 | 35 % | 16 | 35 % centre · 59 % corner | 32–51 % |
| 2D Intermediate | 256 / 40 | 15.6 % | 1.25 | 26 % | 65 | 26 % · 62 % | 17–35 % |
| 2D Expert | 480 / 99 | 20.6 % | 1.65 | 16 % | 174 | 18 % · 49 % | 3–7 % |
| Cube Beginner | 216 / 10 | 4.6 % | 1.20 of 26 | 29 % | 24 | 49 % face · 25 % centre | 25–71 % |
| Cube Intermediate | 512 / 40 | 7.8 % | 2.03 | 12 % | 124 | 23 % · 13 % | 13–42 % |
| Cube Expert | 1152 / 130 | 11.3 % | 2.93 | 4.4 % | 502 | 15 % · 7 % | 4–27 % |

With no-guess on, the first click opened in 100 % of seeds on every preset, and revealed
(median) 2D: 46 / 63 / 37 cells; 3D: 182 of 206 safe cells on Cube Beginner (88 %), 251 of 472
on Intermediate (53 %), 125 of 1022 on Expert (12 %). Numbers above 13 never occurred; the
median highest number on a board is 4 / 6 / 8 for the three cubes. No-guess generation (Node,
this machine): Cube Beginner 0.3 ms median, Intermediate 1–13 ms (worst 119 ms), Expert 7 ms
median from a face cell, 128 ms median and 849 ms worst from the centre; 2D Expert 6 ms median,
40 ms worst; zero failures in 100 seeds per preset.

## Problems

### Standard 3D boards open on a lone number, then force a blind guess
- Severity: major
- Player path: first-time 3D player (no-guess is off by default); any player on a standard cube
- Where: 3D game, right after the first click
- What happens: the 3D first click uses Classic 2D's pinned reference rule — the clicked cell is
  safe, not an opening. In 3D that means a single number surrounded by 17 (face) or 26 closed
  cubes, with nothing to deduce. Observed on Cube Beginner: the first click gave a "1" with 17
  closed neighbours (05-after-first-click.png); the only move is a guess, or a restart that
  counts as a loss. Measured: a standard first click from the face opens only 49 % / 23 % / 15 %
  of the time on the three cubes, 7 % from the centre of Expert. In 2D the same rule is accepted
  because the player knows it and a lone number still bounds 8 cells; in 3D it bounds 26 and the
  board tells the player nothing about where to go next.
- Evidence: observed (05-after-first-click.png) + measured (`openings.txt`)
- Proposed solution: in 3D, make the first click an opening (place no mines in the 26
  neighbours of the first click). The 3D mode is "the existing game, made one mode among
  several", not the reference implementation, so it is free to differ from Minesweeper Online
  here; Cube Beginner stays comparable because every player gets the same rule. Alternative: make
  no-guess the 3D default (next finding), which produces an opening in practice anyway.

### No-guess is off by default in both modes
- Severity: major
- Player path: first-time player; newcomer to 3D
- Where: Classic 2D and 3D board choice (both switches observed unchecked on a fresh profile,
  02-3d-board-choice.png, 30-2d-choice.png)
- What happens: at preset densities a standard board is solvable by logic alone in only 3–7 %
  (2D Expert) to 4–27 % (Cube Expert) of cases; most games end in a forced guess, which a
  newcomer reads as "I lost for no reason". The product calls no-guess core, the roadmap calls
  it the exit criterion of m1, yet the newcomer has to find a small toggle below the presets. The
  switch is remembered, so an enthusiast who wants standard boards pays nothing for a different
  default.
- Evidence: observed + measured
- Proposed solution: no-guess on by default in 3D (every preset) and on for a first-launch 2D
  profile, remembered thereafter. If Classic 2D must keep Minesweeper Online's default for
  comparability, keep it off there but show the switch's effect in one line under it ("Boards
  that never need a guess · separate records"). Serves the newcomer; costs the enthusiast one
  click once.

### Cube Beginner is over at the first click; the cube curve is 1 : 5 : 21
- Severity: major
- Player path: newcomer using Beginner as the on-ramp; enthusiast moving up
- Where: 3D board choice and the first seconds of each preset
- What happens: Cube Beginner has 1.2 mines per 26-cell neighbourhood (P(zero) 29 %). With
  no-guess, the first click reveals a median 182 of 206 safe cells (observed 196 of 216 in play,
  20-Beginner-noguess-first-click.png) and the board's 3BV is 24: a 10-second game that teaches
  nothing about reading depth. Intermediate then jumps to 2.0 mines per neighbourhood, P(zero)
  12 %, 3BV 124 (×5), and Expert to 2.9, P(zero) 4.4 %, 3BV 502 (×4 again, ×21 Beginner). Classic
  2D's steps are ×4 and ×2.7. The Expert step is the 3D on-ramp's cliff: 500 required clicks,
  each needing a fly-and-aim, at a density where cascades practically never happen — a
  20-minute game where one misread at minute 18 is a loss and a broken streak.
- Evidence: measured (`openings.txt`, `candidates.txt`) + observed first clicks
- Proposed solution: re-tune so each step is ×2.5–3 in 3BV and the first step already has
  something to deduce. Measured candidates: Beginner 6 × 6 × 6 · 16 mines (7.4 %, P(zero)
  ≈ 14 %, 3BV ≈ 47; first no-guess click opens ~60 % of the board instead of 88 %), Intermediate
  8 × 8 × 8 · 40 as is (3BV 124), Expert 10 × 10 × 10 · 100 (10 %, 3BV ≈ 350) or 12 × 12 × 8 · 100
  (3BV ≈ 330) instead of 130 mines (3BV 502). Keep 6 × 6 × 6 · 10 as a labelled "Intro" board if the
  one-click board is wanted as a first touch. Records already key on exact size and mines, so old
  Beginner records simply stay on their board. Serves both players.

### Right-click on a number flags every closed neighbour, right or wrong
- Severity: major
- Player path: every 3D player; worst for the newcomer whose crosshair rests on numbers
- Where: 3D play, right button on a revealed number
- What happens: observed on Expert, a right-click on a "2" with 10 closed neighbours placed 10
  flags and took the mine counter from 130 to 120 (23-Expert-rightclick-number.png); 45
  right-clicks on numbers drove it to −5 (57-3d-negative-mines.png). The action is only correct
  when the number's closed neighbours are exactly its remaining mines, which is the one thing a
  3D player cannot see (26 cells, three layers deep). A second right-click unflags all of them,
  including flags the player placed by hand earlier. The original game had it, and it is listed
  in the help, but as a mechanic it rewards the player who does not understand it with up to 26
  wrong flags that hide the board's information and must be removed one by one.
- Evidence: observed
- Proposed solution: make it the mirror of the chord: right-click on a number flags its closed
  neighbours only when their count equals the number minus its flags (a certain deduction);
  otherwise nothing happens, with the same "nothing" sound as a failed chord. That turns a trap
  into the 3D player's best tool (the "anti-chord"), and a satisfied number then auto-hides at
  once, which is exactly the cleanup the 3D board needs. Keep "unflag all" only when every flag
  around the number was placed by this action. Serves everyone; small effort (the engine already
  keeps closed and flagged counts per cell).

### A lost 3D game vanishes before the player can see why
- Severity: major
- Player path: newcomer (learning), enthusiast (post-mortem of a 20-minute Expert run)
- Where: 3D end of game → results screen
- What happens: after the ~1 s loss wave the results card takes the whole window
  (14-loss-effect.png, 15-results-loss.png); the board is gone. In 2D the revealed board is at
  least behind the card, blurred (36-2d-loss-results.png). The player never sees which cube was
  the mine, what the number next to it said, or whether the guess was forced. "Watch replay" →
  End does show the revealed board with mines (61-replay-viewer-3d-end.png), but from the
  recorded camera, after two extra clicks, and nothing on the results card says so.
- Evidence: observed
- Proposed solution: add "Review board" to the results actions (3D: free flight over the
  revealed, frozen board with the exploded cube and wrong flags marked, timer stopped, no
  actions; 2D: the board un-blurred under a slim bar). The design decision "the finished board
  is not flown around afterwards" was about the end sequence, not about a review the player asks
  for. Cheaper stand-in: keep the 3D scene revealed behind the results card at low blur, and on
  a loss make the card wait for a click or 3 s before covering it. Medium effort.

### Which 26 cells a number means is left to the player's imagination
- Severity: major
- Player path: every 3D player from the second click on
- Where: 3D play; Shift view mode
- What happens: Shift fades everything but the aimed cube's neighbours
  (06-shift-mode.png, 11-inside-shift.png), but the near 3 × 3 layer hides the middle and far
  layers, nothing says how many of the 26 are closed or flagged, and hidden zero cells leave
  gaps the player has to remember as "already safe". Deduction in 3D is counting: "this 2 has
  five closed neighbours, one flag, so four candidates for one mine" — today that count is done
  by flying around the cube and tallying three layers by eye. Numbers at different depths also
  stack in the same screen column (22-Expert-noguess-framed.png: "2 / 2 / 3" down one column),
  so a number read from the outside is often not the number the player thinks it is.
- Evidence: observed
- Proposed solution (design-level, not rendering for its own sake):
  1. An aimed-cell readout in the HUD or beside the crosshair: "2 · 5 closed · 1 flag" (so
     "1 mine among 5"); when closed equals remaining mines, or remaining is 0, say so — those
     are the two moments the player acts (flag-all / chord). Small effort; the counts exist.
  2. In Shift mode, separate the three layers along the view direction (an exploded view of the
     3 × 3 × 3 block) or tint them near / mid / far, and draw hidden zero cells as ghost outlines
     so the block always shows 26 positions. Medium.
  3. Make Space (aim through numbers) also dim numbers by depth so a read number is the front
     one. Small.
  Serves the enthusiast most: it is the difference between deducing and brute-forcing.

### The abandon-as-loss rule bites hardest where the rules force it
- Severity: major (as a combination), minor alone
- Player path: newcomer on a standard cube; enthusiast closing the tab on a long game
- Where: pause → Restart / Main menu; closing or reloading the page
- What happens: the rule is sound for records (no first-click rerolls), the confirmation says
  it ("Restart this game? It will count as a loss.", 35-2d-restart-confirm.png), and the
  in-progress marker works: after a reload mid-game Records showed "Abandoned 3.2 s", current
  streak 0 (53-records-3d.png). But on a standard cube the first click gives a lone number half
  the time, so the honest move — restart — is punished, and a 20-minute Cube Expert game has no
  way back after a reload or a crash: the marker records a loss, nothing offers to resume.
- Evidence: observed
- Proposed solution: fix the cause (opening first click / no-guess default) and add "Resume
  game" on the main menu when the in-progress marker is found at launch, restoring the board
  from the engine snapshot the replay system already keeps, with the clock where it stopped; only
  a declined resume records the loss. Medium effort. Keep the rule itself.

### Pause card teaches 3D controls to a Classic 2D player
- Severity: minor
- Player path: first-time Classic 2D player who presses Esc
- Where: pause card during a 2D game
- What happens: the card lists "Mouse — Look · WASD QE — Fly · Wheel — Spacing · Shift —
  Neighbours only · Space — Aim through numbers · Ctrl — Show hidden" (32-2d-pause.png), none of
  which exists in 2D; the 2D keys (arrows, Space, F, D) are not shown. A player who takes the
  pause card as the rules learns the wrong game.
- Evidence: observed
- Proposed solution: a per-mode controls panel on the pause card, from the bindings source the
  Settings page already renders for Classic 2D. Small.

### Classic 2D Beginner tiles are 139 px
- Severity: minor
- Player path: enthusiast grinding Beginner / Intermediate
- Where: 2D board at a desktop viewport
- What happens: the board scales to fill the window: 9 × 9 at 1280 × 800 gives 139 px tiles
  (31-2d-beginner-standard-first-click.png), 16 × 16 gives 78 px. Mouse travel across a Beginner
  board is then enormous; the players who grind Beginner play at 24–40 px tiles and their times
  depend on it.
- Evidence: observed
- Proposed solution: a maximum tile size (default around 48 px) with the board centred, and a
  tile-size setting (or a zoom with the wheel) remembered per profile. Small.

### A 0-mine custom board produces absurd records
- Severity: minor
- Player path: curious player poking the custom form
- Where: Classic 2D custom, mines 0
- What happens: 2 × 2 · 0 mines is accepted; one click wins in 0.0 s and records "3BV/s
  1000.00", "best time 0.0 s" (55-2d-results-win.png). 3D custom already requires at least one
  mine.
- Evidence: observed
- Proposed solution: require at least 1 mine in 2D too, or exclude 0-mine boards from bests.
  Small.

### The start camera frames the top of the box
- Severity: minor
- Player path: every 3D game start
- Where: 3D "Click to play" and the first seconds of play
- What happens: the camera sits level with the top row and close to the face: on Cube Beginner
  only four of six rows are in view and the aimed cube is a top-edge cube (04-closed-box.png).
  The player's first act is to look down and back off; the first click lands on an edge cube by
  default, which is also the worst place to start a 3D deduction.
- Evidence: observed
- Proposed solution: start the camera centred on the near face at a distance that fits the
  whole face with a margin, aimed at the face centre. Small.

### Picking a 3D preset tells the player nothing about what they are choosing
- Severity: minor
- Player path: newcomer to 3D; returning player
- Where: 3D board choice
- What happens: "6 × 6 × 6 · 10 mines" is the whole description; nothing says how long a game
  takes, that Expert is a 500-click board, that no-guess splits the records into a separate
  board (Records lists "Cube Beginner" and "Cube Beginner · no-guess" side by side,
  53-records-3d.png), or what the player's best on each is.
- Evidence: observed
- Proposed solution: one detail line per preset: density, typical 3BV, and the player's best
  time / streak on it ("Best 48.2 s · 3 in a row"); the no-guess switch's label says "separate
  records". Small; the data is in the records store.

## Improvements

### Daily board as a seeded start
- Player path served: returning player (both modes); enthusiast comparing with friends
- Why it matters: today nothing calls the player back on a given day; bests only move rarely.
  The generator is deterministic from a seed (read: board-generation.md), so a daily needs no
  server. The one design gap is the first click: the board is generated around it, so a daily
  must mark a start cell (as Minesweeper Online's no-guess does, noted in the design docs as a
  deliberate difference) and generate from the date and that cell.
- Sketch: menu entry "Daily" → today's 2D Expert-no-guess and today's cube (Intermediate size),
  a highlighted start cell, one attempt per day counted, a "Daily" board in Records with its own
  streak ("days played in a row"). Medium.

### A guided first 3D board
- Player path served: newcomer to 3D (the product's weakest on-ramp without the campaign)
- Why it matters: the design routes 3D newcomers through a campaign that does not exist; the
  web build drops them on Cube Beginner, which either opens 88 % of the board or gives a lone
  "1". Two concepts have to be taught: a number counts 26 cells in three layers, and solved
  cells disappear.
- Sketch: "Learn 3D" on the 3D board choice: a fixed 4 × 4 × 4 · 3 mines no-guess board with a
  fixed seed and start cell, and four prompts on the HUD in sequence ("Hold Shift: these are
  the cubes this 1 is counting", "Hold Ctrl: the empty cubes you cleared", "Flag the one cube
  that must be a mine", "Left + Right on the 1: chord"). No records, no timer, repeatable.
  Medium.

### Next target on the results card
- Player path served: enthusiast loop
- Why it matters: the comparison with bests is already there and good
  (51-results-win-second.png); what is missing is the pull forward.
- Sketch: one line under the stats: "Beat 48.2 s for a new best · streak 3" and, on a loss,
  "Streak ended at 3 · best 7". Small.

### Faster loop: skip the end delay, Play again without the Click to play card
- Player path served: enthusiast grinding short boards
- Why it matters: per 10-second Beginner game the loop costs the end delay, the results card,
  Play again and (3D) another "Click to play" click to retake the pointer. Observed in code
  (read): every 3D start routes through the ready card; in headless lockless mode Play again
  went straight to play.
- Sketch: any click or key during the end delay ends it; Enter / R on the results card is Play
  again; Play again's click is a user gesture, so 3D requests pointer lock from it and skips the
  card; the card remains the fallback when lock is refused. Small.

### Density guard on no-guess custom boards
- Player path served: curious player on custom boards
- Why it matters: the failure path works and is clear (41-3d-noguess-failure-offer.png: "No
  board found … Retry / Play a standard board"; 2D 9 × 9 · 31 failed in ~0.5 s, Retry failed
  again), but on a hopeless density the player can loop Retry forever; on 5 × 5 × 5 · 90 the
  "Generating the board…" card sat for several seconds in headless before failing.
- Sketch: under the custom no-guess switch, a hint when density exceeds ~25 % ("no-guess boards
  are rarely found at this density"), and on a second consecutive failure the offer defaults the
  focus to "Play a standard board". Small.

### Expose "what the auto-hide just hid"
- Player path served: newcomer to 3D
- Why it matters: solved numbers vanish silently; a newcomer sees cubes disappear after a flag
  and does not know whether that was a reward or a mistake. (Checked: a number can only hide
  when its flags equal its number and every other neighbour is revealed, so hiding is always a
  correct resolution — worth saying to the player.)
- Sketch: a short "solved" pulse on the number before it fades, and the help line "a number
  disappears once it is solved — that is good". Small.

### Build order (what I would do first)
1. Right-click-on-number as a certain-only "anti-chord" — small, removes the biggest trap,
   gives 3D its signature tool.
2. Aimed-cell readout (number · closed · flags) — small, turns 3D from counting into deducing.
3. 3D opening first click and no-guess default on in 3D — small, fixes the newcomer's first
   minute.
4. Preset re-tune (6 × 6 × 6 · 16 / 8 × 8 × 8 · 40 / 10 × 10 × 10 · 100) — small to change, needs
   a decision because records are keyed on it.
5. Review board after a loss — medium, the learning loop.
6. Daily board with a marked start cell — medium, the retention hook the roadmap wants and the
   generator already supports.

## What works well

- The no-guess generator is fast enough to be invisible on every preset (milliseconds), never
  failed in 600 preset boards, and always yields a real opening; the failure offer when it does
  fail is clear and offers the right two choices.
- Auto-hide is sound: it only ever hides a correctly resolved number, un-hides when a flag is
  removed, and Ctrl shows everything. Together with Space (aim through numbers) the 3D board
  stays enterable deep into a game.
- The results card's three-way best comparison ("New best · −0.9 s", "−1.11") and the Records
  screen (bests with dates and Watch, win rate, streaks, history chart, replays with pinning,
  per-mode totals) are exactly what an enthusiast expects, and they updated correctly through
  wins, a loss and a reload.
- The abandon rules are consistent and honest: restart, leave and a closed tab all record a
  loss, the confirmations say so, and a game left before its first click records nothing.
- Flags before the first reveal are kept; chord, flag and reveal all fire on release as the
  original did; the mine counter turns red below zero.
- The replay's end state shows the whole revealed board with mines and wrong flags — a review
  tool already exists, it only needs a door from the results card.

## Open questions for the director

- Is the 3D mode bound to Classic 2D's "safe but not an opening" first-click rule, or may it
  open? The design text lists only two rule changes for 3D (safe first click, no-guess), so an
  opening first click would be a third.
- May the three cube presets change size or mines now, before any leaderboard exists, or are
  6 × 6 × 6 · 10 / 8 × 8 × 8 · 40 / 12 × 12 × 8 · 130 fixed for continuity with the original?
- Is right-click-on-a-number's flag-all considered part of the original's "feel" that must be
  kept, or a rule that may change like the first click did?
- Does "the finished board is not flown around afterwards" rule out an explicit, player-chosen
  review of a lost board?
- For a web-build daily: is a marked start cell acceptable (the design records generating at
  the first click as a deliberate difference from Minesweeper Online's marked cell)?
