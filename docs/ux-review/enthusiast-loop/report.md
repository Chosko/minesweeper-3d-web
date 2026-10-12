# Competitive Minesweeper enthusiast / live-ops & retention — report

All paths below are relative to
`/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/enthusiast-loop/`.
Scripts: `01-grind-2d.mjs`, `02-noguess-2d.mjs`, `03-input-feel.mjs`, `04-grind-3d.mjs`,
`05-records.mjs`, `06-replay.mjs`, `06b-replay-2d.mjs`, `07-returning.mjs`, `07b-keyboard-kill.mjs`,
`08-viewport.mjs` (shared helpers `lib.mjs`, `play2d.mjs`).

## Method

One persistent Chromium profile (`profile/`) across every script, so records and replays
accumulated like a returning player's. I forced the board seed through `crypto.getRandomValues`
(the trick the project's own Playwright tests use), computed the mine set in Node with the game's
own `generate()`, and computed 3BV and the click plan independently, so every figure on the
results screen could be checked by hand.

Played, at 1280 × 800 unless stated:

- **Classic 2D Expert, standard:** 5 games to the end (4 won — one NF 100 %, one with deliberate
  wasted clicks, one finished with flags + a left+right chord — 1 lost), 1 abandoned from the pause
  card, 1 closed mid-game with the tab (leave guard), 1 pause-and-resume game. First click with the
  real mouse; bulk clicks as DOM mouse events 60–90 ms apart (Playwright's real clicks took ~1.4 s
  each under software rendering).
- **Classic 2D Expert, no-guess:** 3 games won, Play again (Enter) between them.
- **Classic 2D Beginner:** 6 games (keyboard-only play, pause integrity, hard-kill experiments).
- **Input feel (Expert, real Playwright mouse and keyboard):** press feedback, drag-to-cell,
  release off the board, flag timing, left+right chord, 1.5-click, middle button, right on a number,
  left on a flag, right-while-left-held, arrows / Space / F / D.
- **3D Cube Expert:** 3 won, 1 lost, 1 abandoned by restart, 2 abandoned by browser kill; **Cube
  Expert no-guess:** 1 won, 1 abandoned by kill. Driven through `__ms.aimAt()` / `__ms.click()`
  (pointer lock is unavailable headless), from six outside camera positions plus an inside fallback.
- **Records** screen in both modes, **replay viewer** for a won 2D Expert, an abandoned 2D Expert and
  a won 3D game, the failure card, and the viewer at 1280 × 800, 1366 × 650, 1366 × 768, 1920 × 1080.

What the headless environment prevented or distorted: no pointer lock, so 3D cadence and the 3D
camera replay were not observed as a human would play them (the recorded camera is my scripted
teleport path); SwiftShader rendering made every frame slow — the 3D end effect took 10–20 s to
hand over to the results screen instead of the coded 1 s, 3D replay frames took seconds, and the
first-click latencies below are upper bounds; no controller; no sound.

## Problems

### Times shown to a tenth of a second, truncated
- Severity: major
- Player path: enthusiast on any board, every results screen, Records, replay end line
- Where: results screen `TIME`, Records bests and lists, replay end line
- What happens: the results screen shows `13.3 s` while its own 3BV/s (13.64 for 3BV 182) means
  13.34 s; a 47.38 game shows as 47.3. The stored value is milliseconds, the pause card shows
  `Time 5.85 s` (two decimals), the overlay and the replay position show whole seconds. Minesweeper
  Online shows hundredths, Arbiter / Viennasweeper thousandths; a competitive player comparing
  with their records elsewhere, or two of their own games 40 ms apart, cannot. Deltas against the
  best are also tenths (`+0.3 s`).
- Evidence: observed — `01-std1-results.png`, `01-std3-results.png`, `03-pause-card.png`,
  `06b-2d-end.png`; the format rule is also in `results-screen.md`
- Proposed solution: one time format everywhere outside the in-game overlay: three decimals
  (`13.343 s`), deltas to the same precision; keep the overlay's whole seconds during play. If the
  tenth is a design choice for casual readers, make it a setting (`Precision: 0.1 s / 0.001 s`) and
  default enthusiasts' boards (Expert, no-guess) to thousandths.

### The results screen lacks the figures a competitive player reads first
- Severity: major
- Player path: enthusiast on Expert / Cube Expert after every game
- Where: results screen
- What happens: it shows time, 3BV, 3BV/s, efficiency and the three best comparisons, nothing
  else. Missing: click counts (left / right / chord, effective vs wasted — the engine tracks them
  and they are in the stored summary), IOE (3BV / clicks), RQP, the position of this game among the
  player's own games on the board, the board's seed, and on a loss how far along the player was in
  time terms. A loss shows no comparison at all, so a 90 % loss on a PB pace is indistinguishable
  from a first-click death.
- Evidence: observed — `01-std1-results.png`, `01-std4-loss-results.png`, `04-e1-results.png`;
  summary fields read in `game-summary.md` and `__ms.modes.summary()` output in the logs
- Proposed solution: add a second stat row: `CLICKS 183 (L 183 · R 0 · D 0 · wasted 0)`, `IOE
  0.99`, and on wins `#3 of 12 on this board`. Keep the comparison on losses with the pace shown
  (`3BV/s 15.87 — your best 13.64`), greyed, labelled "not eligible". Show the seed as a short
  board code (see Improvements) so a board can be shared or replayed.

### Pause stops the clock and leaves no trace
- Severity: major
- Player path: enthusiast chasing bests; anyone looking at a leaderboard later
- Where: Esc / Pause button / focus loss during a started game; the results and records after it
- What happens: a Beginner game with a 3 s pause in the middle: wall time from board arrival 7.29 s,
  results show `3.7 s` and nothing on the results screen, in Records or in the replay says the game
  was paused. A player can pause on every hard decision and set clean bests; the replay still plays
  back as if continuous. The reference (Minesweeper Online, Arbiter) has no pause that stops the
  clock. Automatic pauses on blur / hidden tab make this unavoidable as a mechanic, so the fix is
  on the recording side.
- Evidence: observed — `07-returning.mjs` part D log line; `07-results-dark.png`
- Proposed solution: record pause count and total paused time in the summary and replay header. A
  game paused after its first click is not eligible for bests (shown as `Paused · not eligible for
  bests` on the results screen and as a marker in the lists), or, alternative: keep the clock
  running while paused on standard boards (the board is hidden, the timer is not) and only stop it
  on automatic pauses, which are then marked. Either way the replay viewer shows the pauses on the
  seek bar.

### A browser kill turns a won game into a loss
- Severity: major (confidence: medium — observed only in headless Chromium)
- Player path: anyone whose browser crashes, is killed by the OS, or loses power; the enthusiast
  whose new PB vanishes and whose streak breaks
- Where: records at the next launch
- What happens: records live in `localStorage` while replays live in IndexedDB. Three experiments:
  win a Beginner game, wait 0.5 s / 6 s / 20 s on the results screen, `SIGKILL` the browser,
  relaunch. In all three the won game was gone from the records; in two of them the game-in-progress
  marker (written earlier, at the first click) had survived, so the won game was then settled as
  **Abandoned 0.0 s** — a loss that ended the streak. The same thing explains three Expert wins
  that disappeared after an earlier crashed test run. Graceful close (`context.close()`) kept
  everything. Chromium commits `localStorage` to disk lazily; IndexedDB writes are transactional.
- Evidence: observed — `07-returning.mjs` part A and `07b-keyboard-kill.mjs` parts G, H log lines;
  `05-records-2d.png` (the `Abandoned 0.0 s · 100 %` rows are exactly these games)
- Proposed solution: keep the three records documents (or at least `records.history` and the
  in-progress marker) in IndexedDB like the replays, written through the same transaction as the
  replay blob. Independently, at start-up before settling a leftover marker as a loss, check the
  replay library for a sealed won/lost replay with the same id and record that instead; a marker
  whose last checkpoint is at 0.0 s and whose game cannot be found should be dropped as
  "unknown" rather than counted as a loss.

### Expert does not fit a laptop window; the replay viewer fits it even less
- Severity: major
- Player path: enthusiast on Expert on a 13–15" laptop; anyone watching an Expert replay below 1080p
- Where: Classic 2D board, replay viewer
- What happens: the minimum tile is 41 px, so an Expert board needs 1230 × 656 px of board area
  plus the overlay bar. At a 1366 × 650 viewport (a 768-px laptop screen with browser chrome) the
  game board scrolls vertically — three rows are off-screen and the player must wheel mid-game; at
  1366 × 768 it fits with 0 px to spare. The replay viewer puts its controls below the board, so an
  Expert replay scrolls even at 1366 × 768 and 1280 × 800 and the view jumps to follow the pointer.
  Only 1920 × 1080 fitted both. A speed player will not play a board that scrolls.
- Evidence: observed — `08-viewport.mjs` log, `08-expert-1366x650.png` (rows cut at the bottom),
  `08-replay-1366x768.png`, `06b-2d-playing-a.png`, `06b-2d-end.png`; `MIN_TILE_SIZE = 41` read in
  `js/classic2d/tile-skin.js`
- Proposed solution: let the board shrink to fit down to a readable minimum (24–28 px; the skin
  already draws crisp digits) and offer a board-scale setting (`Fit / 100 % / 125 %`) for people
  who want big tiles and scrolling. In the viewer, fit the board above the controls at that smaller
  tile or float the controls over the bottom of the board; never auto-scroll a board that could fit.

### First click opens late, and the first game of a session later still
- Severity: minor (major for feel if the real-hardware figure is above ~80 ms)
- Player path: speed player on any board
- Where: the first click of every game
- What happens: the board is requested from the generation worker on the first click; the opening
  is drawn and the timer starts when the answer comes back. Measured click-release → board: 49, 64,
  97, 116, 289 ms on Expert standard (519–565 ms on the first game of a page load while the worker
  starts), 219–343 ms on no-guess Expert, 98–283 ms in 3D (one 4.5 s outlier while the page was
  busy). Timing is fair (the wait is not on the clock) but the first opening visibly lags the
  click, which is the one thing a speed player feels most; the reference opens the first click on
  the same frame. These figures come from a software-rendered headless browser and are upper
  bounds; the worker round trip itself is real.
- Evidence: observed — `[stdN] first click → board arrived` lines in the logs of `01`, `02`, `04`
- Proposed solution: generate standard boards synchronously on the main thread (a placer call is
  microseconds) and keep the worker for no-guess; or spawn and warm the worker when the board
  choice opens, and pre-generate the next no-guess board for a marked start cell (see "Board of
  the day") so the player's first click is instant.

### No-guess Cube Expert takes ~20 s to generate
- Severity: major for the 3D no-guess loop
- Player path: 3D enthusiast with No-guess on, Cube Expert
- What happens: the first click on a no-guess 12 × 12 × 8 board waited 19.3 s for the worker
  (observed once; 2D no-guess Expert took 0.2–0.7 s; Node measurements of 2D by seed: 7–674 ms).
  At 300 ms after the click the `#m3d-status` "Generating the board…" card was still hidden,
  although by the docs it should appear after 200 ms; I could not tell whether it appeared later.
  Twenty seconds of nothing between Play again and the first opening is the end of a grind session.
- Evidence: observed — `[ng1] first click → board arrived: 19294 ms` in `04` log,
  `04-ng1-generating.png`; limit rationale read in `3d-play-flow.md`
- Proposed solution: generate the next no-guess board in the background while the results screen
  shows (fix the start cell and mark it, as the reference does for no-guess), show a progress line
  ("candidate 14 · 6 s") with Cancel → standard board, and measure the Cube Expert budget on a
  typical laptop before shipping the preset with no-guess enabled by default.

### The 2D pause card is the 3D pause card
- Severity: minor
- Player path: any Classic 2D player who presses Esc
- Where: pause card during a Classic 2D game
- What happens: under Resume / Restart / Main menu it lists `Mouse Look · WASD QE Fly · Wheel
  Spacing · Shift Neighbours only · Space Aim through numbers · Ctrl Show hidden` and a `Look
  sensitivity` slider — none of which exist in 2D.
- Evidence: observed — `03-pause-card.png`
- Proposed solution: per-mode pause content: in 2D show the 2D bindings (the Settings page already
  has the right table) and no look settings.

### A crash records "Abandoned 0.0 s"
- Severity: minor
- Player path: returning player after a crash or kill
- Where: Records lists
- What happens: the in-progress marker is checkpointed only at the first click, at pauses and on
  `pagehide`, so a game cut off any other way is recorded with the time of the first click:
  `Abandoned · 0.0 s · — · 100 %` (efficiency 100 % from one click). Closing the tab normally did
  capture the real time (`Abandoned 9.4 s · 80 %`).
- Evidence: observed — `05-records-2d.png`, `07-records-after-closed-tab.png`
- Proposed solution: checkpoint the marker every few seconds of play (or every N actions) and
  do not derive efficiency for an abandoned game with fewer than, say, three clicks.

### "New best · +0 %" and "0 %" deltas
- Severity: minor
- Where: results comparison
- What happens: efficiency is shown as a whole percentage, so a 94.7 % → 95.0 % improvement reads
  `New best · +0 %`, and an equal value reads `0 %` rather than "= best".
- Evidence: observed — `[b4]` results in the `07b` log; `[ng2]`/`[ng3]` in the `02` log
- Proposed solution: one decimal on efficiency everywhere (`95.0 %`), `= best` for ties, and
  `−` / `+` only for real differences.

### Replay viewer: whole-second position, stale overlay on failure, no markers
- Severity: minor
- Player path: enthusiast studying a replay
- Where: replay viewer
- What happens: the position reads `003 / 013` and the clock `003`, so a 13.34 s game cannot be
  scrubbed to a moment; Previous / Next step by action (good) but there is no frame step, no click
  markers on the seek bar, no 3BV path. When a replay fails to load, the overlay bar keeps the
  previous replay's figures (`026 · 130 · 501 / 501 · 18.68`) above "This replay cannot be read."
  The recorded pointer is a 14 px black dot that is easy to lose on a busy board; the keyboard
  focus ring sits at cell 0 for the whole replay when the player never used the keyboard.
- Evidence: observed — `06-failure.png`, `06b-2d-playing-a.png`, `06b-2d-pointer-zoom.png`
- Proposed solution: clock and position in `ss.mmm`; `,` / `.` frame step; click ticks (left /
  right / chord in three colours) on the seek bar; a pointer with a contrasting outline and a short
  trail; hide the cursor ring unless the replay has keyboard actions; clear the overlay when a
  replay fails.

### Replay library rows all read "11 Oct 2026"
- Severity: minor
- Player path: grinder with 30 games in a day
- Where: Records → Replays, bests, recent games
- What happens: the date has no time, so a day's games are told apart only by time and 3BV/s; the
  recent-games list has no 3BV, no date and no board code; there is no delete, only Unpin, and
  "Pinned first" is off by default.
- Evidence: observed — `05-records-scrolled-1.png`
- Proposed solution: `11 Oct · 14:32` in both tables, a 3BV column in recent games, Delete behind
  a confirmation, and remember the Pinned-first switch.

### Nothing on the main menu for a returning player
- Severity: minor
- Player path: returning player
- Where: main menu after a relaunch
- What happens: the only state shown is `Last played` under one entry; no last result, today's
  best, current streak or Continue. The player has to go to Records to know where they stand.
- Evidence: observed — `01-menu-returning.png`, `07-menu-after-closed-tab.png`
- Proposed solution: a one-line strip under the entries: `Expert · best 13.34 s · today 7 games ·
  streak 2`, and the `Last played` entry carrying the last board (`Expert · no-guess`) so Enter from
  the menu starts it.

### Focus ring at cell 0 during mouse play
- Severity: minor
- Where: every Classic 2D board from the first frame, and in replays
- What happens: the keyboard cursor is drawn at the top-left cell even when the player only uses
  the mouse, which reads as a selected or odd cell.
- Evidence: observed — `01-expert-closed.png`, `01-std1-results.png`, `06b-2d-end.png`
- Proposed solution: show the ring only after a cursor key or controller input and hide it on the
  next mouse action.

## Improvements

Ranked by expected effect on games per session and sessions per week for this audience, with a
rough effort.

### Instant restart from the board (small)
- Player path served: speed player on Expert who restarts a bad opening dozens of times an hour
- Why it matters: today a restart is Esc → Restart → confirm (three inputs and a modal); every
  restart costs more than the game it replaces. Minesweeper Online players restart with one key.
- Sketch: `F2` (and `R` on the results screen, `Start` + `Y` on a controller) starts a new board of
  the same choice at once; it still counts as a loss, said once in a toast with an `Always ask`
  setting. Keep the confirmation only for Back to menu.

### Board of the day with a shareable code (medium)
- Player path served: anyone who wants a reason to come back daily; friends comparing
- Why it matters: the generator is deterministic from (board, start cell, seed, generator
  version), so a static site can offer one 2D and one 3D board per day with a fixed, marked start
  cell. Dailies are the single strongest sessions-per-week driver in the design document and the
  pieces are already built.
- Sketch: seed = hash(date, board); the board is pre-generated for the marked start cell when the
  menu opens; `Daily` entry on the menu with today's board and your result; a board code
  `E-20261011-7F3A` and a `#board=` link that opens the same board; results screen shows the code
  with Copy. Keep a separate Records board for dailies.

### Challenge links and board codes for any game (small, after the above)
- Player path served: enthusiasts sharing a board or a PB to beat
- Sketch: every summary already stores seed and generator version; show them as a code on the
  results screen, Records and the replay viewer, and accept the code in the custom-board form
  (`Play this board`). Because standard boards are generated around the first click, a challenge
  fixes the start cell and marks it, as the daily does.

### Local leaderboards per board (small)
- Player path served: the grinder who wants to see "my top 10 Expert times" and the gap to #1
- Why it matters: every leaderboard-screen feature in the design depends on Steam; the data for a
  personal top-N is already in the history, and a sorted list with Watch buttons is the stand-in
  that keeps the loop going on the web.
- Sketch: in Records, a `Top 10` tab per board: by time, 3BV/s and efficiency, each row with date,
  3BV, clicks and Watch; the results screen says `#4 of 57`.

### Richer results and Records figures (small)
- Player path served: every enthusiast
- Sketch: see the two "results screen" problems above; in Records add averages (last 10 / 50 /
  all) for time, 3BV/s and efficiency, win rate over the last 50, a PB progression chart (best time
  by date) next to the 3BV/s chart, an x-axis with dates and hover values, filters by period and by
  outcome, and a CSV / JSON export.

### Replay sharing and import (small)
- Player path served: enthusiasts posting a PB, friends verifying it
- Sketch: `Download .msrp` and `Open a replay file` in the viewer and the library; the verifier
  already refuses a replay that does not reproduce, so an imported file is safe to watch. Later: a
  compare mode playing two replays of the same board side by side or as a ghost.

### Background generation and a warm worker (medium)
- Player path served: speed players (first-click lag) and 3D no-guess players (20 s waits)
- Sketch: see the two generation problems above.

### Session summary and Continue on the main menu (small)
- Player path served: returning player
- Sketch: see the main-menu problem above; `Continue` reopens the last board choice directly.

### Replay viewer for study (medium)
- Player path served: enthusiasts improving efficiency
- Sketch: click markers on the seek bar, frame step, a `Show 3BV` overlay that paints each opening
  and isolated number so wasted clicks are visible, a speed of 0.25×, sound on replays, a follow /
  free camera toggle in 3D, and `Watch best` next to `Watch replay` on the results screen for a
  direct comparison.

### Streak and win-rate rules that do not punish restarting (small)
- Player path served: grinders
- Why it matters: with restart = loss, a player who restarts bad openings has a 20 % win rate and
  no streak, so the two figures stop meaning anything to the people who look at them most, and some
  will avoid starting rather than "spoil" a streak.
- Sketch: keep the rule (it matches Minesweeper Online) but add a `Completed-games win rate` and a
  `Best streak of finished games`, and let the player see both.

## What works well

- Input fidelity is right, and verified against the reference's conventions: flag on right press,
  reveal and chord on release, left+right chord on the left release with the right still held,
  1.5-click chords, middle button = left, right on a number does nothing and costs nothing, left on
  a flag does nothing, release off the board cancels, drag moves the press, press feedback on cells
  and chord previews. Keyboard play (arrows, Space, F, D) works fully, including a first click by
  Space.
- 3BV, click counting and efficiency match hand computation in every game (NF 182/183 = 99 %,
  146/149 with wasted chord and flag/unflag = 98 %, flags + chord 184/186 = 99 %, 3D 495/516 = 96 %);
  the timer excludes the generation wait; no-guess boards are separate boards with their own bests
  (`Expert · no-guess`).
- The loop is tight: results appear within ~30 ms of the last release in 2D, Play again has
  default focus and Enter puts a closed board on screen in 13–170 ms; the best comparison with
  deltas and `New best` is exactly what you want to glance at.
- Replays: every game is kept, bests are pinned automatically, Watch is one click from results,
  bests, recent games and the library; verification and the failure wording are clear; Space/K,
  arrows, Home/End, speeds and the seek bar all work; the end line (`Won · 13.3 s`,
  `Abandoned · 5.8 s`) is right.
- Returning-player basics hold: the leave guard fires on closing the tab mid-game and the game is
  recorded with its real time; theme and the last board choice persist across relaunches; Records
  update live and open on the board you just played; restart and back-to-menu say "It will count
  as a loss" before they do it.
- Dark theme is complete on every screen on the path, including the finished board behind the
  results.

## Open questions for the director

- Is a pause that stops the clock a deliberate concession for casual play? If so, which of the two
  fixes above (ineligible for bests, or the clock keeps running on standard boards) fits the
  product's promise to enthusiasts?
- Should restart-after-first-click keep counting as a loss (reference behaviour) now that the
  shell makes restarting a three-step action? If a one-key restart ships, the stats rule needs a
  decision at the same time.
- How durable must records be on the web build? If "a crash loses the last game" is acceptable,
  the start-up settlement should at least not turn it into a loss; if not, the records documents
  should move to IndexedDB.
- Minimum tile size: is 41 px a readability rule from the design system, or a default that can
  drop to ~26 px so Expert fits a laptop?
- Should the daily board / challenge links wait for Steam leaderboards, or ship on the web first as
  the static-site stand-in described above?
- The 3D no-guess budget: was the Cube Expert generation time measured on a laptop-class CPU? The
  19 s observed here may be this machine, but the loop needs a figure.
