# Game UX / first-run and casual player — report

## Method

Played with Playwright in headless Chromium (SwiftShader WebGL) against
`http://127.0.0.1:8080/index.html`, mouse and keyboard only, in fresh
contexts (brand-new player) and in one long-lived context per flow
(returning player). Scripts `s1`–`s24*.mjs` and every screenshot named below
are in this folder.

What I played and looked at:

- Main menu, Controls panel, Settings, light and dark theme, at 1280×800,
  1920×1080 and 1024×768.
- Classic 2D board choice: the three presets, the custom form at 1×1, 0 mines,
  5×5 with 24/25 mines, 100×100 with blank/9999/2480 mines, width 0 and 101,
  empty fields; the No-guess switch; a 100×100 no-guess custom board to
  provoke the generating state and the "No board found" offer; what the
  screen remembers on return.
- 3D board choice: presets, the custom form at 1×1×1, 100×100×100, side of 2,
  21×20×20 and 20×20×20, Random ×4, the disabled no-guess reasons, a 20³
  no-guess custom board to its ready card.
- Classic 2D games: 9 Beginner games (6 abandoned, 2 lost to the results
  screen, 1 restart), one Expert start, a 1×1 zero-mine custom game (won),
  keyboard-only play (Enter, arrows, Space), pause/resume, restart and
  back-to-menu confirmations, the leave-page guard, Play again.
- 3D games: Cube Beginner entered 7 times through "Click to play" (pointer
  lock did work headless), the H panel, Esc pause, Restart/Main menu with and
  without a started game, resume, one loss to the results screen, Watch
  replay, Records from results, Play again, the leave-page guard, a 2×2×2 and
  a 3×3×3 custom game.
- Empty and error states: Records with no games (2D and 3D), replays none
  kept, IndexedDB + localStorage blocked, pointer lock refused, WebGL 2
  unavailable.
- Keyboard navigation (Tab, arrows, Enter, Esc) on every menu screen.

What the environment prevented: I did not reach a 3D win (the driven clicks
on tiny custom boards did not register as actions through the debug hook, and
a real 6×6×6 win is not feasible blind), so the 3D win results screen is
known from the README only. The box was under heavy load (load average
~20), so the one-second 3D end effect was never caught in a screenshot and
timings in my logs are unreliable; one dedicated run confirmed the 2D timer
follows wall-clock time. Fullscreen (F) and Keyboard Lock cannot be judged
headless. Sound was not heard.

## Problems

### The pause card shows 3D controls and 3D settings inside a Classic 2D game
- Severity: major
- Player path: first-time and casual Classic 2D player (the first entry on the
  menu), every time they press Esc
- Where: Classic 2D game, pause card (Esc or the Pause button)
- What happens: the card lists "Mouse Look · WASD QE Fly · Wheel Spacing ·
  Shift Neighbours only · Space Aim through numbers · Ctrl Show hidden" and a
  Settings block with "Look sensitivity" and "Invert look Y". None of it
  applies to the flat board; a newcomer who paused to find out how to flag
  (F) or chord (D) is told about flying. The same card is under the restart
  confirmation and under the no-guess failure offer.
- Evidence: observed — `22-c2d-paused.png`, `26-c2d-restart-confirm.png`,
  `15-c2d-ng-failure-offer.png`, `82-c2d-paused-dark.png`
- Proposed solution: the pause card takes its bindings block from the active
  mode (Classic 2D: Left reveal/chord · Right flag · Arrows cursor · Space
  reveal · F flag · D chord · Shift+wheel scroll) and hides the look
  sensitivity/invert rows outside 3D. Alternative: drop the bindings and
  settings from the pause card entirely and keep one "Controls" link that
  opens the mode's section of Settings.

### The main menu "Controls" button only explains 3D
- Severity: major
- Player path: brand-new player who opens Controls before choosing a mode,
  or after picking Classic 2D
- Where: main menu, "Controls" button → CONTROLS panel
- What happens: the panel is the 3D list (Mouse look, WASD, Q/E, Shift/
  Space/Ctrl, F/M, Esc). Nothing about the flat board: no F for flag, D for
  chord, arrows, Shift+wheel. A newcomer closes it believing the game needs
  WASD. The full two-mode table exists, but only inside Settings at the
  bottom of a 1,400 px page.
- Evidence: observed — `02-menu-controls-panel.png`, `03-settings.png`,
  `03b-settings-bottom.png`
- Proposed solution: make the panel the same two-section table as Settings
  (Classic 2D | 3D tabs, keyboard+mouse and controller columns), or rename
  the button "3D controls" and add the 2D keys to the Classic 2D board choice
  screen. Also add `H` to the 3D list: the in-game chip says "H help" but the
  panel never mentions H.

### Without WebGL 2 the whole game refuses, Classic 2D included
- Severity: major
- Player path: player on a locked-down or old browser, remote desktop, or a
  GPU-blocklisted machine
- Where: start-up
- What happens: a "Cannot start Minesweeper 3D — This game needs WebGL 2"
  card sits on top of a dead menu. The Classic 2D entry is visible but does
  nothing; Records and Settings do nothing. The 2D board is Canvas 2D and
  does not need WebGL.
- Evidence: observed — `43-no-webgl.png` (WebGL contexts stubbed to null)
- Proposed solution: start the shell without the demo scene when WebGL 2 is
  missing; keep Classic 2D, Records and Settings working; disable the 3D
  entry with the reason under it ("Needs WebGL 2 — not available in this
  browser") and show the current card only when the player picks 3D.

### After a 3D game ends, the board vanishes behind the results card
- Severity: major
- Player path: first-time 3D player who just lost and wants to see why
- Where: 3D game → results screen
- What happens: about a second after the explosion the results card takes
  the whole window on a plain sky-blue background; the cube, the mines, the
  wrong flags are gone, and nothing on the card brings them back. In Classic
  2D the same card sits over the blurred board with every mine visible, which
  is exactly what a learner needs. The 3D player gets one second of a wave
  effect and then "Game over" with numbers they cannot relate to anything.
- Evidence: observed — `73-3d-results.png` vs `24-c2d-results.png`,
  `94-c2d-loss-moment.png`; the one-second window is from the README (the
  effect never fit in a screenshot under load)
- Proposed solution: keep the 3D scene drawn behind the results card, dimmed
  like the 2D one, and add a "Look at the board" action (or Esc) that hides
  the card and lets the player fly around the revealed board until they press
  Esc again. Alternative: delay the card until the first click or key after
  the end effect.

### A first-time 3D player is never told the rules that make 3D different
- Severity: major
- Player path: first-time 3D player
- Where: "Click to play" card and the first minute of play
- What happens: the card lists inputs only (Left reveal · Right flag · Shift/
  Space/Ctrl view modes · Mouse look · WASD fly). It does not say that a
  number counts 26 neighbours, that the first click is safe, that revealed
  zeros and satisfied numbers disappear, or that Ctrl shows them again. After
  the first reveal, cubes vanish and holes appear in the box; a newcomer reads
  this as a bug or as something they did. The only hint is "Hold Ctrl — Show
  hidden cells (empty and completed ones)" in the H panel.
- Evidence: observed — `50-3d-ready.png`, `54-3d-after-first-reveal.png`,
  `71-3d-after-resume.png` (holes where zeros vanished); rules from the README
- Proposed solution: a three-line "How 3D works" block on the ready card,
  shown until the player has finished one 3D game: "A number counts the 26
  cubes around it. Empty and solved cubes hide themselves so you can see
  inside — hold Ctrl to show them. Your first click is safe." Alternative: a
  one-time in-game toast at the first auto-hide ("Solved cubes hide. Hold
  Ctrl to see them.").

### Dark theme leaves the page background and the 3D sky light
- Severity: minor
- Player path: anyone who switches to Dark
- Where: every screen
- What happens: cards, HUD and the 2D board turn dark; the sky gradient
  behind the menus and the 3D scene stays pale blue, so a dark card floats on
  a light page and the 3D game is a dark HUD on a light sky. The switch looks
  half-applied.
- Evidence: observed — `01-landing-dark.png`, `83-c2d-choice-dark.png`,
  `84-3d-playing-dark.png`, `86-3d-paused-dark.png` (2D is fine:
  `82-c2d-expert-dark.png`)
- Proposed solution: give the sky gradient, fog and demo-scene background a
  dark token pair and switch them with the theme.

### Arrow keys do nothing in menus; only Tab moves the focus
- Severity: minor
- Player path: keyboard-only player; also any player who tries the arrows
  because the controller help says "D-pad or left stick to move"
- Where: main menu, both board choice screens, pause card, settings
- What happens: ArrowUp/Down leave the focus where it is. Tab works and the
  focus ring is good, but the Classic 2D screen has 8 stops between Beginner
  and Back. The Records board picker does move with arrows, so the behaviour
  is inconsistent between screens. The Settings "Back" button is 1,423 px
  below the top of an 800 px window (Esc works, but nothing says so).
- Evidence: observed — `s14-keyboard-nav.mjs` / `s16-kbd-redo.mjs` logs
- Proposed solution: map ArrowUp/Down (and Left/Right across a row) to the
  same focus moves the D-pad uses; show "Esc — Back" next to every Back
  button; make the Settings Back button sticky or add one at the top.

### "No-guess board" is a bare switch with no explanation, placed differently in 2D and 3D
- Severity: minor
- Player path: first-time and casual player
- Where: Classic 2D and 3D board choice screens
- What happens: in Classic 2D one switch sits below the custom panel and
  applies to presets and custom alike; in 3D a "No-guess board" switch sits
  under the presets and a second "No-guess custom board" inside the custom
  panel. Nothing says what no-guess means, that a big board may take seconds
  to generate, or that it may fail. The player first learns this from the "No
  board found" dialog after the first click.
- Evidence: observed — `10-c2d-choice.png`, `30-3d-choice.png`,
  `12-c2d-choice-noguess-on.png`
- Proposed solution: one helper line under the switch: "Solvable by logic
  alone — no 50/50 guesses. Large boards take longer to prepare." Use the same
  placement in both screens (3D's "one switch per section" is the clearer of
  the two; 2D could adopt it, or 3D could fold both into one).

### A 1×1 board with 0 mines gives an instant recorded win
- Severity: minor (records integrity)
- Player path: curious player poking the custom form
- Where: Classic 2D custom form → results → Records
- What happens: the 2D form accepts 1×1 with 0 mines ("1 cells · up to 0
  mines"); the first click wins in 0.0 s with 3BV/s 1000.00 and efficiency
  100%, the result says "New best" three times, the replay is auto-pinned as a
  best, and the game adds a win and a streak to "Classic 2D overall". The 3D
  form refuses the same board with a good message ("A 1 × 1 × 1 board has no
  room for a mine beside the safe first click — make it at least 2 cells").
  The two forms also disagree on the minimum mines (2D: 0, 3D: 1).
- Evidence: observed — `91-c2d-1x1-win-results.png`,
  `92-records-after-1x1-win.png`, `11-c2d-custom-1x1.png`
- Proposed solution: require at least 1 mine in Classic 2D with the 3D
  wording, so the smallest board is 1×2 with 1 mine. Also fix the 1×1 copy
  ("Mines must be a whole number from 0 to 0 on a 1 × 1 board.") and "1
  cells".

### "Generating the board…" cannot be cancelled and fights with the pause card
- Severity: minor
- Player path: player who starts a large no-guess custom board
- Where: Classic 2D and 3D, after the first click on a no-guess board
- What happens: the banner has no spinner, no estimate and no Cancel. Esc
  during generation opens the pause card over the banner; when generation
  then fails, the "No board found" dialog appears underneath the pause card,
  blurred, and the player sees "Paused · Time 0.00 s · 2480 mines left" with
  Resume/Restart/Main menu and must Resume to find the offer. On a Beginner
  board the banner can flash for a frame on every first click.
- Evidence: observed — `14-c2d-100x100-ng-generating.png`,
  `14b-c2d-generating-esc.png`, `15-c2d-ng-failure-offer.png`,
  `60-c2d-keyboard-first-reveal.png`
- Proposed solution: show the banner only after ~300 ms, with a spinner and a
  Cancel that returns to the closed board; while it shows, Esc cancels
  generation instead of pausing; the failure offer always renders above the
  pause card. Add "Back to menu" to the "No board found" offer, which today
  only has Retry and Play a standard board.

### The mines counter caps at 999
- Severity: minor
- Player path: custom-board player (2D allows 2,480 mines, 3D 999,999)
- Where: in-game overlay bar, both modes
- What happens: a 100×100 board with 2,480 mines shows "MINES 999" while the
  pause card says "2480 mines left"; counting down from 999 means the counter
  is wrong until 999 flags are placed.
- Evidence: observed — `13-c2d-100x100-ng-before-click.png`,
  `15-c2d-ng-failure-offer.png`, `34-3d-ready-card-20cubed.png`
- Proposed solution: let the field grow to the digits the board needs (the
  board label already varies in width) or show "2.4k" with the full number in
  a title.

### Expert does not fit a 1024×768 window and the clipped board gives no scroll cue
- Severity: minor
- Player path: laptop and small-window players on Expert; anyone on a
  custom board larger than the window
- Where: Classic 2D board
- What happens: at 1024×768 only 24 of the 30 Expert columns are visible; the
  board is cut flush at the right edge with no scrollbar, no shadow, no
  "scroll with the wheel" hint. At 1280×800 and 1920×1080 Expert fits. A
  100×100 board scrolls with the wheel as the README says, but nothing on
  screen tells the player where they are or that there is more.
- Evidence: observed — `81-c2d-expert-1024.png`, `81-c2d-expert-1280.png`,
  `17-c2d-100x100-scrolled.png`
- Proposed solution: allow tiles to shrink to a smaller floor before
  scrolling kicks in, so Expert fits any window ≥ 1024 px; when a board is
  clipped, draw an inset shadow on the clipped edges and a thin scroll
  position bar, and show a one-time "Wheel scrolls · Shift+wheel sideways"
  hint.

### The keyboard cursor is drawn on the top-left cell for mouse players
- Severity: minor
- Player path: first-time mouse player on Classic 2D
- Where: every fresh Classic 2D board
- What happens: cell (0,0) carries a thick dark outline before any key is
  pressed; it looks like a marked or special cell and draws the first click.
- Evidence: observed — `20-c2d-beginner-fresh.png`, `81-c2d-expert-1920.png`
- Proposed solution: show the cursor only after the first arrow-key press
  and hide it again after a mouse press.

### Pointer-lock refusal is a dead end
- Severity: minor (rare, but no way out)
- Player path: player whose browser refuses pointer lock (an iframe embed,
  a policy, some privacy settings)
- Where: 3D ready card
- What happens: "Could not capture the mouse. Click once more." and the same
  on every further click. No alternative is offered.
- Evidence: observed — `42-pointerlock-denied.png`,
  `42b-pointerlock-denied-2nd.png` (lock stubbed to reject)
- Proposed solution: after the second failure, explain ("Your browser is
  blocking mouse capture") and offer "Play with drag-to-look" or point to the
  controller; keep Back visible.

### The replay viewer keeps the game's HUD chips and the "H controls" toast
- Severity: minor
- Player path: player who presses Watch replay after a 3D game
- Where: 3D replay viewer
- What happens: the replay bar (TIME · MINES · 3BV · 3BV/s · Back) is correct,
  but the game's top-right chips "H help · M sound on · F fullscreen · Esc
  menu" and the bottom-right "H controls ×" toast stay on screen; none of
  them apply to a replay.
- Evidence: observed — `74-3d-replay.png`
- Proposed solution: hide the game chips and toast on the replay screen;
  show the replay keys instead (Space play/pause · ←/→ step · −/= speed).

### The landing copy talks only about 3D while Classic 2D is the first, preselected entry
- Severity: minor
- Player path: brand-new player
- Where: main menu
- What happens: the tagline is "Fly through a cube of cubes. Every cell has
  up to 26 neighbours." and the 3D entry repeats "Fly through a cube of cubes".
  The focused entry is Classic 2D. Nothing says which to pick first, that a
  preset click starts a game immediately, or that Beginner is the place to
  start. The footer "Web port of the 2011 XNA game…" is fine.
- Evidence: observed — `01-landing-1280.png`, `01-landing-1024.png`
- Proposed solution: tagline "Classic Minesweeper — and Minesweeper in three
  dimensions." Subtitles: "Classic 2D — The game you know, Beginner to
  Expert" and "3D — Fly through a box of cubes; numbers count 26
  neighbours". Keep the "Last played" badge (it works and is useful).

### Small wording and consistency slips
- Severity: minor
- Player path: everyone
- Where: across screens
- What happens (all observed):
  - Settings: a "THEME" section heading with a "Theme" label right under it.
  - Audio lives in three places with three vocabularies: menu "Sound: on" +
    Volume slider, Settings "Volume" + "Mute", pause card "Volume" + "Sound:
    on".
  - 3D presets are "Beginner / Intermediate / Expert" under a "CUBE" heading
    on the choice screen but "Cube Beginner" on results and Records.
  - Back buttons: "Back" (choice screens, Records, Settings), "Main menu"
    (pause), "Back to menu" (results).
  - Restart confirmation: "Restart this game? It will count as a loss." with
    a primary "Restart" button, while the results screen calls the same thing
    "Play again".
- Evidence: `03-settings.png`, `01-landing-1280.png`, `30-3d-choice.png`,
  `73-3d-results.png`, `26-c2d-restart-confirm.png`
- Proposed solution: one vocabulary: "Sound" everywhere (on/off + volume),
  "Back" for one step back and "Main menu" for the menu, "Cube Beginner" on
  the preset too (or drop "Cube" everywhere).

## Improvements

### A guided first 3D game
- Player path served: first-time 3D player
- Why it matters: the product design counts on a campaign as the 3D on-ramp;
  the web build has none, so the ready card is the only teacher and it
  teaches keys, not the game.
- Sketch: a "Learn 3D" entry on the 3D choice screen that starts a 4×4×4,
  3-mine board with three timed toasts: after lock ("Move the mouse to look,
  W to fly closer"), after the first reveal ("Numbers count all 26 neighbours
  — solved cubes hide; hold Ctrl to see them"), after the first flag ("Right
  click flags; left+right reveals around a satisfied number").

### Mode-aware help everywhere
- Player path served: casual player who forgets a key
- Why it matters: three help surfaces (menu Controls, pause card, H panel)
  disagree on content; two of them are 3D-only.
- Sketch: one bindings component fed by the active mode, used by the menu
  panel (with mode tabs), the pause card and the H panel.

### Quick play from the menu
- Player path served: returning casual player
- Why it matters: the "Last played" badge already knows the board; getting
  back to it takes Classic 2D → preset (2 clicks) or 3D → preset → Click to
  play (3 clicks).
- Sketch: a "Play again: Beginner 9×9" button in the menu header that starts
  the last board directly (3D still needs the click for pointer lock, which
  can be that click).

### Show progress on the presets
- Player path served: returning player choosing a board
- Why it matters: Records is a separate trip; the choice screen is where the
  decision is made.
- Sketch: under each preset, "Best 48.2 s · 12 wins / 30" in muted text,
  from the records store; "—" when none.

### Let a loss teach
- Player path served: first-time player in both modes
- Why it matters: the loss state is the moment of learning; the 2D results
  card hides the exploded cell's area and the 3D one hides everything.
- Sketch: results card docked to the side (or dismissable with Esc to reveal
  the board), the exploded cell and wrong flags highlighted, and a "Replay
  the last 10 s" shortcut.

### Scale cues on big 2D boards
- Player path served: custom-board and small-window players
- Why it matters: a clipped board looks like a bug.
- Sketch: edge shadows when clipped, a mini-map or scroll thumb, Ctrl+wheel
  zoom between the min tile size and fit-to-window.

## What works well

- The whole path to a game is short and predictable: Classic 2D → Beginner →
  click (2 clicks + the first move); 3D → Beginner → Click to play (3 clicks).
  Esc backs out of every screen, and from Records or the replay it returns to
  the screen you came from.
- The "Click to play" card: board size, mines, every key in three lines, the
  Ctrl+W tip, a Back button; Enter on the card also starts play.
- The in-game chips (H help · M sound · F fullscreen · Esc menu) and the H
  panel with the "actions fire on release" note.
- Confirmations are right-sized: Restart and Main menu ask only once a game
  has started, Cancel has the focus, Esc cancels, the wording says what is
  lost ("It will count as a loss."). The leave-page guard is armed in both
  modes.
- Custom-form validation is live, specific and never blocks typing; the 3D
  messages for 1×1×1, >8,000 cells and a side of 2 are model copy, and the
  disabled no-guess switch comes back on when the board shrinks again.
- The last choice is remembered precisely (preset focus, custom fields,
  no-guess), with a "Last played" badge on the menu entry and the preset.
- Results and Records are clear, Play again has the focus, the 2D results keep
  the board and the mines visible behind the card. Empty states ("No games on
  this board yet", "No replays kept for this board yet") and storage failure
  notices ("Settings cannot be saved in this browser…", "Records are not being
  saved this session.") are honest and unobtrusive.
- The no-guess failure dialog explains itself and offers a sensible fallback.

## Open questions for the director

- Is the full-window takeover after a 3D game intended to survive into the
  Steam build, or should 3D match 2D and keep the board visible behind the
  card?
- Should Classic 2D (and Records, Settings) be playable when WebGL 2 is
  missing, or is WebGL 2 a hard requirement for the product?
- Should a 0-mine board exist at all, and should degenerate custom boards
  (0 mines, 1 safe cell) count toward overall wins and streaks?
- Is the Classic 2D keyboard cursor meant to be visible from the first frame
  for mouse players?
- What is the smallest window Expert must fit without scrolling? Today it is
  somewhere between 1024 and 1280 px wide.
- The web build has no 3D on-ramp (no campaign). Is a built-in tutorial board
  in scope for the web, or is the ready-card text the whole budget?
