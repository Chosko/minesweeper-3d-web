# Minesweeper 3D (web)

Minesweeper in two modes, both picked from the main menu:

- **Classic 2D** — flat Minesweeper on a square grid that plays like Minesweeper Online with its
  default options, with mouse, keyboard or controller.
- **3D** — Minesweeper in three dimensions. The board is a box of up to 100 × 100 × 100 cubes, and
  each cube has up to 26 neighbours. You fly through the board in first person and aim with a
  crosshair.

**Play it at https://minesweeper3d.chosko.com**

This is a browser port, built with three.js, of *Minesweeper 3D*, an XNA/C# game written in 2011 by
Chosko ([original repository](https://github.com/Chosko/minesweeper-3d)). There is no build step:
the site is a set of static files served by GitHub Pages from `main`.

## Classic 2D

Pick a board, switch **No-guess board** on or off, and play:

| Board | Size | Mines |
|---|---|---|
| Beginner | 9 × 9 | 10 |
| Intermediate | 16 × 16 | 40 |
| Expert | 30 × 16 | 99 |
| Custom | width and height 1–100 each | up to the board's limit, shown under the fields |

- The board starts closed. It is generated around your first click, so the first click is always
  safe, and the timer starts once the board is ready.
- **No-guess** boards can be solved from the first click by logic alone. If no such board is found,
  the game offers to try again or to play a standard board of the same size.
- A custom board takes as many mines as Minesweeper Online allows for its size, but always keeps
  one cell free for the first click.
- The board is scaled to fit the window. A board too large to fit scrolls: use the mouse wheel
  (`Shift` + wheel scrolls sideways) or drag with `Shift` held.
- Pausing hides the board while the timer keeps running; each game records its pauses. The board
  choice you made last is preselected next time.
- When the game ends, the board plays the 3D game's end effect for about a second — on a win a
  pulse spreading from your last click with confetti over the board and every mine shown flagged,
  on a loss a wave from the exploded mine showing where the mines were — then the results card
  shows over it, with **Play again** (or `Enter` or `R`). Any click, key or controller button
  skips the effect.

| Input | Action |
|---|---|
| Left or middle button | Reveal on release; on a revealed number, chord on release |
| Right button | Flag / unflag, on the press |
| Left + Right | Chord, on the left release |
| Drag to another cell before releasing | The action applies to the cell you release on; release off the board to cancel |
| Arrow keys | Move the cell cursor (hold to repeat) |
| `Space` / `Enter` | Reveal under the cursor |
| `F` | Flag / unflag under the cursor |
| `D` | Chord under the cursor |
| `Esc` | Pause |
| `F2` | Restart: a new board of the same choice |

**Swap clicks**, beside Pause on the board, trades the left and right buttons for presses that
start on a closed or flagged cell — left flags on the press, right reveals on the release — so
you can flag and chord with the left button alone. Revealed cells, the keyboard and the
controller keep their roles; the toggle lasts until the page reloads.

A press shows the cell (or, for a chord, its closed neighbours) pressed until you release. On a
controller, the D-pad or left stick moves the cursor, `A` or `RT` reveals, `X` or `LT` flags, `Y`
or `LT` + `RT` chords, `Start`, `B` or `Back` pauses, and `Y` pressed while `Start` is held
restarts.

## Records

Every Classic 2D and 3D game is recorded in the browser. **Records**, on the main menu or on the
screen shown after a game, opens the Records screen:

- Pick a mode with the **2D | 3D** switch, then a board: in 2D, Beginner, Intermediate and Expert,
  in 3D, the two first boxes and the four cube boards, each with and without no-guess, then the
  mode's **Daily** board, then every custom board of that mode you have played, the former double
  layer boards (8 × 8 × 2, 14 × 14 × 2, 25 × 16 × 2) and 12 × 12 × 8 · 130 among them. The screen opens on the board you played last, in its mode, or on the board of the game
  you just finished.
- For that board: the best time, best 3BV/s and best efficiency with their dates, games played,
  wins, win rate, and the current and longest winning streak. A restarted or abandoned game counts
  as a loss there; beside them, the win rate and the best streak over completed games (won or lost)
  leave those games out. The chosen mode's totals across every board are shown too; 2D and 3D are
  never added together.
- The board's averages of time, 3BV/s and efficiency over its last 10, last 50 and all won games,
  and its win rate over the last 50 games.
- A chart of 3BV/s and efficiency over your won games and a chart of your best time by date, each
  showing a point's values when you hover it (or tap it), and a list of your recent games, newest
  first, ten to a page, with each game's outcome, time, 3BV/s, efficiency and board code. The **Top 10** tab
  ranks your ten best won games on the board by time, 3BV/s or efficiency, the rank the screen
  after a game shows ("#4 of 57").
- Filters by period (all time, 12 months, 30 days, 7 days) and by outcome (all, won, lost,
  abandoned) narrow the history; the bests and counters stay all-time.
- **Export history (CSV)** saves every game of both modes as a spreadsheet table; **Export all
  (JSON)** saves the history and the list of kept replays as one file. The replay files themselves
  are not exported.

The screen updates as games are recorded and follows the theme. It works with the
mouse, the keyboard or a controller; `Esc` or `B` goes back.

## Daily boards and board codes

**Daily**, on the main menu, has two boards a day — Expert no-guess and the cube 8 × 8 × 8 · 40
no-guess — the same for everyone on that date (your local calendar date). Each starts on a marked
cell: the first click must go there (a click anywhere else does nothing and the mark pulses), and the
timer starts with it. You get one counted try per board per day: once a daily's first click is made,
leaving, restarting or closing the page counts as a loss. Dailies are recorded on their own **Daily**
board in Records, whose streak counts the days in a row you played, won or lost. The boards are
prepared in the background while the menu shows, so they open at once.

Every game has a **board code** that rebuilds its board exactly, such as `EN-20261011-184A` (a
daily) or `EN-9C41D07A-247-1486` (any game). The screen after a game, the Records rows and the replay
viewer show it with **Copy** and **Copy link**. Paste a code in a board choice's code field and press
**Play this board**, or open a link ending in `#board=<code>`, to play that board as a
**challenge**: it starts on the same marked cell, is kept in your history and games played, and is
not eligible for bests, win rate, streaks or the Top 10. Today's daily code opens the Daily screen
instead. A code from another version of the game's board generator is refused rather than opening a
different board.

## Replays

Every Classic 2D and 3D game you finish, or leave after its first click, is kept as a replay in the
browser: your personal bests and the replays you pin are always kept, along with your newest 100
others. **Watch replay** on the screen shown after a game plays that game again, and **Watch best**
beside it plays the board's fastest-time best when its replay is kept. On the Records screen, the
chosen board's replays are listed with **Watch**, **Download** and **Pin** / **Unpin**, and a best or
a recent game with a kept replay can be watched too.

A replay plays on the same board view as the game: in Classic 2D with your pointer (outlined, with a
short trail) and cursor, in 3D with the camera flying as you flew it. It opens on the closed board,
so the first click plays as the first action; every click shows a ring, coloured by button, and
each one is ticked on the seek bar in the same colour. The bar at the top shows the time (seconds
to the thousandth), mines left, 3BV solved and 3BV/s so far. A replay made by a newer version of the
game, or one that no longer plays out the same, is not played and the viewer says why.

| Keyboard | Controller | Action |
|---|---|---|
| `Space` / `K` | `Start` / `Y` | Play / pause; at the end, play again from the start |
| `←` / `→` | `LB` / `RB` | Previous / next action |
| `,` / `.` | | One frame back / on |
| `Home` / `End` | | Start / end of the replay |
| `-` / `=` | `LT` / `RT` | Slower / faster (0.25×, 0.5×, 1×, 2×, 4×) |
| `B` | | Show 3BV |
| `C` | | Free camera / Follow (3D) |
| `Esc` | `B` | Back to the screen you came from |

The seek bar moves to any point in the replay, and marks each stretch where the game was paused;
with the controller, focus it and the D-pad left / right steps it. Below it:

- **Show 3BV** paints the board's 3BV regions: each opening with the numbers around it in its own
  tint, each number outside every opening outlined on its own. A click on a region already solved
  is a wasted one.
- **Sound** plays the game's sounds for each click as it plays (off by default, kept until you close
  the game); seeking and speeds above 2× stay silent.
- **Free camera** (3D) lets you fly the camera with the game's controls — the movement keys, mouse
  look after clicking the scene (`Esc` lets go), the controller's sticks — while the replay plays on;
  **Follow** returns to the recorded camera.
- **Download** saves the replay as a `.msrp` file; **Open replay file** (here and in the Records
  screen's replays) plays one. An opened replay is checked like any other, is not kept, and files
  over 16 MB are refused.

## 3D: how to play

New to 3D? **Learn 3D**, first on the 3D board choice, walks you through a small 4 × 4 × 3 box:
start on the marked cube, then four prompts show what `Shift` and `Ctrl` reveal, which cube must be
a mine and how a chord opens cubes. It has no timer and keeps no records, and you can repeat it any
time; a win offers First box 1. Until you have finished a 3D game or won Learn 3D, the "Click to
play" card of every other 3D board offers it too.

The rules are classic Minesweeper with one more dimension:

- A revealed cube shows how many of its **26 neighbours** (the 3 × 3 × 3 block around it) hold a
  mine, so the number can be anything from 0 to 26.
- Revealing a 0 opens its neighbours automatically, and the cascade continues from there.
- Revealing a mine ends the game and shows the whole board.
- You win when every safe cube has been revealed, and no non-mine cube is flagged. You do not have
  to flag the mines.
- **Solved cells hide themselves.** Revealed zeros are invisible. A revealed number disappears once
  every neighbour is revealed or flagged and its flag count matches the number: it gives a short
  bright pulse, then fades out. This lets you see into the board. Removing a flag next to a hidden
  cell brings it back, and holding `Ctrl` shows every hidden cell as a see-through ghost.
- The box starts closed. The board is generated around your first click, so the first click is
  always safe, and the timer starts once the board is ready. Flags placed before that are kept.
- When the game ends, the board freezes while the end effect plays (the loss wave showing where
  the mines were, or the win confetti): a second on a small board, longer on a large one so the
  loss wave reaches the far side, never more than 2.5 seconds; any click, key or controller button
  skips it. Then the screen shown after a game appears over the dimmed board, as in Classic 2D:
  time (to the thousandth of a second), 3BV, 3BV/s, efficiency, your clicks, the game's rank on
  that board after a win, the time to beat next, your win rate and longest streak on that board
  each beside its figure over completed games, and your bests on that board (greyed after a loss,
  with the pace you were on), with **Play again** (or `Enter` or `R`), **Watch replay**, **Look at
  the board**, **Records** and **Main menu**. Play again with the mouse or the keyboard captures
  the mouse at once, with no "Click to play" card unless the browser refuses the capture.
- **Look at the board** (or `Esc` on that screen) hides it and lets you fly over the finished
  board — every mine shown, the exploded cube and wrong flags marked, or the solved board — with
  the usual flight controls, view-mode keys and spacing, but no clicks on the board. `Esc`, any
  mouse button or any controller button brings the screen back.

Pick a board and play:

| Board | Size | Mines |
|---|---|---|
| First box 1 | 4 × 4 × 3 | 4 |
| First box 2 | 5 × 5 × 3 | 6 |
| Cube Intro | 6 × 6 × 6 | 10 |
| Cube Beginner | 6 × 6 × 6 | 20 |
| Cube Intermediate | 8 × 8 × 8 | 40 |
| Cube Expert | 10 × 10 × 10 | 100 |
| Custom | each side 1–100 | up to one fewer than the cells |

- The two first boxes start with the cubes spread wider (spacing 1.5), so a small box reads layer
  by layer before the cubes.
- **Random** fills the custom fields with a random board.
- **No-guess board:** one switch under the presets applies to the preset you pick; the custom board
  has its own, available up to 8,000 cells (20 × 20 × 20) and shown disabled, with the reason, on a
  larger board or on one with a side of exactly 2 cells — two cells stacked along such a side share
  every neighbour, so a mine in one of them is always a guess. A no-guess board can be solved from
  the first click by logic alone; if none is found, the game offers to try again or to play a
  standard board of the same size.
- The board choice you made last is preselected next time.

## 3D controls

| Input | Action |
|---|---|
| Mouse | Look around (click "Click to play" to capture the mouse; where the browser blocks the capture, "Play with drag-to-look" turns the view while a button is held and dragged) |
| Arrow keys | Look around: a tap aims finely, a hold turns faster (Look sensitivity and Invert Y apply) |
| `W` `A` `S` `D` | Fly forward / left / back / right (forward follows the view direction) |
| `Q` / `E` | Move down / up |
| `Home` / `R` | Back to the start view |
| Left click | Reveal the aimed cube |
| Right click | Flag / unflag. On a number: flag all its closed neighbours; right-click it again to take back only those flags |
| Left + Right | Chord: when a number has the right count of flags around it, reveal its other neighbours |
| `Enter` | Reveal the aimed cube, as Left click |
| `'` | Flag / unflag, as Right click |
| `Enter` + `'` | Chord, as Left + Right |
| Mouse wheel | Change the spacing between cubes, 0.1 a notch, faster when you spin quickly; the camera moves with the cubes |
| `X` | Toggle the spacing between 1.1 and 2.0 |
| Hold `Shift` | Fade everything except the aimed cube and its neighbours, which draw on top |
| Hold `Space` | Aim through revealed numbers (they fade, the nearest least) |
| Hold `Ctrl` | Show hidden cells (zeros and solved numbers) as see-through ghosts |
| `H` | Show / hide the controls panel |
| `M` | Sound on / off |
| `F` | Fullscreen |
| `Esc` | Pause menu (releases the mouse) |
| `F2` | Restart: a new board of the same choice |

**Camera.** Settings → Controls → Camera chooses Fly (first-person flight, the default, as above) or
Orbit, which keeps the board centred: the camera always looks at the board's centre and turns around
it. In Orbit the inputs that move the camera change; everything else stays as above:

| Input (Orbit) | Action |
|---|---|
| Mouse / Arrow keys / `A` `D` | Rotate around the board |
| Mouse wheel / `W` `S` | Move in / out |
| `Q` / `E` | Unused: the board stays centred |
| `X` | Toggle the spacing between 1.1 and 2.0 (the wheel moves the camera in Orbit); the camera moves with the cubes |
| Controller right stick | Rotate around the board |
| Controller left stick ↑ ↓ | Move in / out (`A` / `B` unused) |

Actions fire when you **release** the mouse button or the key, as in the original. The timer starts
on the first reveal's release.

Some browsers do not let a page block `Ctrl+W`, so pressing W while holding Ctrl can close the tab.
In fullscreen (`F`), the game asks the browser to pass those keys to the page (Keyboard Lock), where
the browser supports it. During a game, the page also asks you to confirm before it closes.

### Touch

On a touch-only device (a tablet or a phone) 3D plays by touch. The ready card reads "Tap to play"
and lists the gestures; a tap starts, and the game never asks for pointer lock. Every action goes
through the same release rules as the mouse, and counts as the click it replaces.

| Gesture | Action |
|---|---|
| Left thumb, anywhere in the left half | A stick under the thumb: fly (up is forward, which follows the view; sideways strafes) |
| One-finger drag in the right half | Look around (Look sensitivity and Invert Y apply) |
| Tap in the right half | Reveal the aimed cube (on the lift; a drag of 8 px or more cancels it) |
| Long-press (400 ms) | Flag / unflag the aimed cube, with a short vibration. On a number: what a right click does |
| Two-finger tap | Chord, as Left + Right |
| Pinch | Change the spacing between cubes, one 0.1 step at a time; spreading the fingers makes it larger |
| `Shift` / `Space` / `Ctrl` buttons on the right | Latch a view mode on or off; it stays on through Pause and clears with the game |
| `Pause` (top bar) | Pause menu |

The crosshair aims, as with the mouse: look to aim, then tap. There is no up / down control: look
down and push the stick forward to descend. In Orbit the drag rotates around the board and the
stick's vertical axis moves in / out; tap, long-press, two-finger tap, pinch and the buttons stay as
above.

### Game controller

Controllers that the browser exposes with the standard layout work too (Xbox, PlayStation, Switch
Pro and most others). Press the controller's bottom face button on "Click to play" to start; no mouse
capture is needed. Labels below use Xbox names; the in-game help shows the labels of the connected
controller (✕ ○ □ △ / L1 R1 L2 R2 on PlayStation, for example).

| Input | Action |
|---|---|
| Left stick | Fly (analog, up to the same 50 units/s as the keys) |
| Right stick | Look around (uses the mouse sensitivity and invert-Y settings) |
| `RT` | Reveal (on release, like the left button) |
| `LT` | Flag / unflag (on release, like the right button) |
| `LT` on a number | Flag all its closed neighbours; `LT` on it again takes back only those flags |
| `LT` + `RT` | Chord (same rules as Left + Right) |
| `A` / `B` | Move up / down |
| Hold `LB` / `RB` / `Y` | Shift / Space / Ctrl view modes |
| D-pad up / down | Change the spacing between cubes by 0.1 (hold to repeat); the camera moves with the cubes |
| `X` | Show / hide the controls panel |
| `Start` (Menu) | Pause / resume |
| `Start` + `Y` | Restart: `Y` pressed while `Start` is held |
| `Back` (View) | Pause; in menus, back |

In menus, the D-pad or left stick moves the focus, `A` selects and `B` or `Back` goes back. On a slider, D-pad
left / right changes the value; on a custom-board field, `LB` / `RB` step the number. In Records,
`LB` / `RB` change the board and `LT` / `RT` switch 2D and 3D. The game pauses if the controller
disconnects during play. Where the browser supports it, the controller pulses when you press a
trigger on the board (its action comes on release), double-pulses when it places or removes a flag,
and rumbles on an explosion. Some browsers only start sound after a key press or a click.

## What's new compared to the original

- **Interface:** a main menu with presets and a custom-board form (cell count, mine limit and
  validation hints). The HUD shows time, mines left, clicks and board size, with indicators for the
  Shift/Space/Ctrl view modes. There is an in-game controls panel (`H`), and a results screen
  after every game.
- **Pause menu** (`Esc`): resume, go back to the start view (3D), restart or return to the main menu.
- **Settings:** mouse sensitivity (0.25×–3×), invert mouse Y, volume, the 3D neighbour count and
  the 3D field of view (45°–90°). They are saved in `localStorage`. The defaults match the original,
  except the 3D neighbour count, which is on, and the field of view, 60° (45° in the original, which
  a browser that already had settings keeps). The Data panel at the bottom of the Settings page
  offers the same two exports as the Records screen first; then "Reset all data" deletes the records, history, replays, settings, last board choices and first-use hints
  from this browser, after a confirmation, and starts the game again as a new player's.
- **Sound:** synthesized sound effects (Web Audio, no audio files) for revealing, flagging,
  chording, actions that change nothing, explosions and wins. They can be muted.
- **Visual polish:** procedurally drawn tiles with a distinct colour for each number from 1 to 26, a
  sky gradient, distance fog, per-face shading and crisp tile borders. The aimed cube gets a pulsing
  outline. Winning plays a pulse wave and confetti. Losing plays a reveal wave from the exploded
  cell, a screen flash and camera shake, and marks wrong flags. A slowly orbiting demo board is the
  main menu's 3D preview and sits behind the screens the menu opens.
- **Performance:**
  - *Instanced rendering:* every cube is drawn by two instanced meshes. Each cell's state is stored
    in a data texture, transparent cubes are depth-sorted with an exact O(n) counting sort, and a
    frame is only drawn when something changes. Large boards get an adaptive pixel ratio.
  - *DDA picking:* the crosshair ray walks the cube lattice (3D-DDA) and stops at the first cube it
    hits, instead of testing every cube.
  - *Incremental logic:* counters such as flagged neighbours, unrevealed cells and wrong flags are
    kept up to date as you play. Flood fill and chording use an explicit stack instead of recursion,
    and auto-hiding is only re-checked for the cells an action touched. This keeps 100³ boards
    responsive.

## Gameplay fidelity

The gameplay is the same as the original: rules, numbers, auto-hiding, the win
condition, picking, mouse-release actions and the view modes. [`docs/ORIGINAL_SPEC.md`](docs/ORIGINAL_SPEC.md) describes the original's behaviour, and the
rules engine is tested against a direct port of the original logic. The port changes these things
on purpose:

- **Safe first click:** mines are placed around the first click, so a board holds at most one
  fewer mine than cells, and a finished board takes no more clicks.
- **Crash fixes:** the Random button is guarded for tiny boards, a chord with nothing aimed does
  nothing, and flood fill is iterative, so huge boards cannot overflow the stack.
- **Re-centred grid:** the board stays centred when the spacing grows.
- **Fly through glass:** cubes within 1.5 cube spacings of the camera fade to glass and cannot be
  aimed at, so flying into the box never fills the screen with one cube, and the crosshair selects
  the first cube beyond them.
- **Forward follows the view:** `W` flies where you look, so looking straight down it moves straight
  down; the original kept full horizontal speed at any pitch. `Q` / `E` stay world down and up.
- **Spacing:** a wheel notch changes the spacing by 0.1 instead of 0.04, quick notches step further,
  `X` toggles between 1.1 and 2.0, and the camera moves with the cubes, so the view keeps its framing
  and the aimed cube stays aimed. The tools strip shows the spacing.
- **Field of view:** a setting from 45° to 90°, 60° by default, instead of the original's fixed 45°.
- **Framed start view:** a 3D game starts from a three-quarter view that fits the whole box, looking
  down onto it so three faces show, with the crosshair on the near face's centre cube, instead of
  the original's straight view level with the top row. `Home` / `R` and the pause menu's "Back to
  start" return there, an arrow on the crosshair points toward the box while it is out of view, and
  a faint ground grid lies below the box.
- **See-through hidden cells:** holding `Ctrl` draws hidden cells as faint ghosts instead of the
  original's opaque cubes, so they no longer wall off the numbers behind them.
- **"Solved" pulse:** a number that hides itself first gives a short bright pulse and fades out,
  instead of vanishing at once, so a solved cube reads as a reward. The cell is hidden and cannot be
  aimed at from the moment of the action.
- **A second right-click on a number takes back only its own flags:** a right-click on a revealed
  number still flags all its closed neighbours, but when they are all flagged it unflags only the
  flags that number's own right-clicks placed, never ones you placed by hand or another number
  placed; the original unflagged them all. The cubes it changes flash, even behind other cubes, and
  the flag sound grows with how many there were. Replays recorded before this change still play
  with the original rule.
- **`F2` and a pause menu instead of `F5` / `Esc`:** the original restarted with `F5` and quit with
  `Esc`. Here `F2` restarts at once (`R` on the screen shown after a game), and `Esc` opens a menu
  with resume, back to start (3D), restart and main menu. A restart of a started game counts as a
  loss, which the first restart of each visit says once; the **Always ask before restarting**
  setting asks before each one instead. Main menu always asks. The timer keeps running while the
  game is paused, and each game records its pauses.
- **Neighbour count at the crosshair:** while you aim at a revealed number in 3D, a small readout
  beside the crosshair shows how many of its neighbours are still unopened (flags included) and,
  when there are any, how many are flagged. The **3D neighbour count** setting turns it off.
- **Clearer view modes:** with `Shift` held, the aimed cube's neighbours always draw over the faded
  cubes, however many stand in front of them. With `Space` held, revealed numbers fade with their
  depth instead of all to the same level, so of two numbers in one screen column the nearer one is
  the brighter and the one to read.
- **Draw distance:** the far plane grows with the board instead of being clipped at 300 units.
- **Minor timing changes the player cannot see:** auto-hiding and the win check run right after each
  action instead of once per frame.
- **Touch:** Classic 2D plays by touch. A tap reveals, or flags while the overlay bar's Reveal / Flag
  switch (shown on a touch screen) is on Flag; a 400 ms long-press flags, with a short vibration; a
  tap on a number chords. One finger pans a board larger than the screen, two fingers pan and pinch
  to zoom between the smallest tile and the whole board. 3D plays by touch on a touch-only device
  too ([Touch](#touch)): a left-thumb stick, a look drag, tap, long-press and two-finger tap on the
  mouse's release rules, pinch for the spacing and a view-modes toolbar; the game never asks for
  pointer lock there. On a touch screen switches, sliders and the toolbar take a 44 px touch and the
  smallest labels grow to 12 px.

## Running locally

There is no build step. Serve the folder with any static web server, for example:

```sh
npx http-server -c-1
```

Then open the URL it prints (by default http://localhost:8080). The game does not work from
`file://`, because ES modules need a server.
3D needs WebGL 2; Classic 2D, Records and Settings run without it.

## Tests

The tests use Node's built-in test runner (no dependencies): unit tests for the rules engine and the
other DOM-free modules, and browser tests (each named "…in a browser…") that drive the game in
Chromium through Playwright and skip themselves when it is not installed. Three runs, from the repo
root:

```sh
.claude/external/run-fast-tests.sh      # every test except the browser ones — seconds
.claude/external/run-browser-tests.sh   # only the browser tests
.claude/external/run-full-tests.sh      # the whole suite, with a 3-minute limit per test
```

`.claude/external/run-affected-tests.sh [path...]` runs the tests covering the given changed files
(or, with none, the files `git` reports changed), found through each test file's imports. Set
`MS_SHOTS=1` to have the component kit's browser tests save their screenshots to a temporary
directory. Timing assertions get slack on a loaded machine: `MS_TIME_SLACK` multiplies their
budgets and wait timeouts (default 2, at least 1). Playwright is found as a local package or as a
global install beside the Node binary, on Windows and POSIX layouts alike.

## Project structure

```
index.html              Page markup: menu, HUD, overlays, pause menu, import map for three.js
css/style.css           Styles for menus, HUD and overlays
js/main.js              Entry point: wires the game, renderer, input and UI; frame loop; game flow
js/mode3d/              3D mode: board choice and no-guess switch, game session (first click, generation,
                        timer)
js/classic2d/           Classic 2D mode: board setup, game session and timer, Canvas board view and its
                        end-of-game effect, mouse, keyboard and controller input, tile skin
js/records/             Personal records: board identity, board codes and the daily boards, game summary,
                        bests and history, Records screen and its history chart
js/shell/               Game shell: screen router, mode host, menu, pause, the Daily screen and board-code
                        links
js/replay/              Replays: format, recording, the replay library, simulator and verifier, the replay
                        viewer with its 2D and 3D viewers
js/render.js            three.js instanced renderer, shaders, transparency sort, end-of-game effects
js/picking.js           Crosshair picking with a 3D-DDA through the cube lattice
js/input.js             Fly camera, pointer lock, keyboard/mouse state, release-to-act mouse logic
js/controls.js          Action layer: keyboard + controller view modes, controller move axes
js/gamepad.js           Controller polling, stick curve, trigger hysteresis, button labels, focus navigation
js/ui.js                Menus, HUD, pause menu, settings (DOM only, no game rules)
js/textures.js          Procedurally drawn tile textures (canvas 2D -> texture array)
js/audio.js             Synthesized sound effects (Web Audio)
tests/gamepad.test.mjs  Controller helpers, analog camera moves and trigger -> mouse-action sequences
docs/ORIGINAL_SPEC.md   Description of the original game's behaviour
vendor/three/           three.js r186, a single minified ES module, with its licence
CNAME, .nojekyll        GitHub Pages configuration (custom domain)
```

## Credits and licence

- Original game: *Minesweeper 3D* (XNA, 2011) by Chosko: https://github.com/Chosko/minesweeper-3d
- Rendering: [three.js](https://threejs.org), MIT licence (see [`vendor/three/LICENSE`](vendor/three/LICENSE)).
- All tile textures are drawn procedurally at runtime, and all sounds are synthesized. The port
  uses no assets from the original game and no Microsoft (XNA) assets.
