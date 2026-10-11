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
- Pausing hides the board. The board choice you made last is preselected next time.

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

A press shows the cell (or, for a chord, its closed neighbours) pressed until you release. On a
controller, the D-pad or left stick moves the cursor, `A` or `RT` reveals, `X` or `LT` flags, `Y`
or `LT` + `RT` chords, and `Start`, `B` or `Back` pauses.

## Records

Every Classic 2D game is recorded in the browser. **Records**, on the main menu or on the screen
shown after a game, opens the Records screen:

- Pick a board: Beginner, Intermediate and Expert, each with and without no-guess, then every custom
  board you have played. The screen opens on the board you played last, or on the board of the game
  you just finished.
- For that board: the best time, best 3BV/s and best efficiency with their dates, games played,
  wins, win rate, and the current and longest winning streak. The Classic 2D totals across every
  board are shown too.
- A chart of 3BV/s and efficiency over your won games, and a list of your recent games, newest
  first, ten to a page, with each game's outcome, time, 3BV/s and efficiency.

The screen updates as games are recorded and follows the Light / Dark theme. It works with the
mouse, the keyboard or a controller; `Esc` or `B` goes back.

## Replays

Every Classic 2D and 3D game you finish, or leave after its first click, is kept as a replay in the
browser: your personal bests and the replays you pin are always kept, along with your newest 100
others. **Watch replay** on the screen shown after a game plays that game again; on the Records
screen, the chosen board's replays are listed with **Watch** and **Pin** / **Unpin**, and a best or a
recent game with a kept replay can be watched too.

A replay plays on the same board view as the game: in Classic 2D with your pointer and cursor, in 3D
with the camera flying as you flew it. The bar at the top shows the time, mines left, 3BV solved
and 3BV/s so far. A replay made by a newer version of the game, or one that no longer plays out the
same, is not played and the viewer says why.

| Keyboard | Controller | Action |
|---|---|---|
| `Space` / `K` | `Start` / `Y` | Play / pause; at the end, play again from the start |
| `←` / `→` | `LB` / `RB` | Previous / next action |
| `Home` / `End` | | Start / end of the replay |
| `-` / `=` | `LT` / `RT` | Slower / faster (0.5×, 1×, 2×, 4×) |
| `Esc` | `B` | Back to the screen you came from |

The seek bar moves to any point in the replay.

## 3D: how to play

The rules are classic Minesweeper with one more dimension:

- A revealed cube shows how many of its **26 neighbours** (the 3 × 3 × 3 block around it) hold a
  mine, so the number can be anything from 0 to 26.
- Revealing a 0 opens its neighbours automatically, and the cascade continues from there.
- Revealing a mine ends the game and shows the whole board.
- You win when every safe cube has been revealed, and no non-mine cube is flagged. You do not have
  to flag the mines.
- **Solved cells hide themselves.** Revealed zeros are invisible. A revealed number disappears once
  every neighbour is revealed or flagged and its flag count matches the number. This lets you see
  into the board. Removing a flag next to a hidden cell brings it back, and holding `Ctrl` shows
  every hidden cell.
- The box starts closed. The board is generated around your first click, so the first click is
  always safe, and the timer starts once the board is ready. Flags placed before that are kept.

Pick a board and play:

| Board | Size | Mines |
|---|---|---|
| Double layer Beginner | 8 × 8 × 2 | 10 |
| Double layer Intermediate | 14 × 14 × 2 | 60 |
| Double layer Expert | 25 × 16 × 2 | 130 |
| Cube Beginner | 6 × 6 × 6 | 10 |
| Cube Intermediate | 8 × 8 × 8 | 40 |
| Cube Expert | 12 × 12 × 8 | 130 |
| Custom | each side 1–100 | up to one fewer than the cells |

- **Random** fills the custom fields with a random board.
- **No-guess board:** one switch under the presets applies to the preset you pick; the custom board
  has its own, available up to 8,000 cells (20 × 20 × 20) and shown disabled, with that limit, on a
  larger board. A no-guess board can be solved from the first click by logic alone; if none is
  found, the game offers to try again or to play a standard board of the same size.
- The board choice you made last is preselected next time.

## 3D controls

| Input | Action |
|---|---|
| Mouse | Look around (click "Click to play" to capture the mouse) |
| `W` `A` `S` `D` | Fly forward / left / back / right (forward follows the view direction) |
| `Q` / `E` | Move down / up |
| Left click | Reveal the aimed cube |
| Right click | Flag / unflag. On a revealed number: flag all its closed neighbours, or unflag them all if they are all already flagged |
| Left + Right | Chord: when a number has the right count of flags around it, reveal its other neighbours |
| Mouse wheel | Change the spacing between cubes |
| Hold `Shift` | Fade everything except the aimed cube and its neighbours |
| Hold `Space` | Aim through revealed numbers (they fade) |
| Hold `Ctrl` | Show hidden cells (zeros and solved numbers) |
| `H` | Show / hide the controls panel |
| `M` | Sound on / off |
| `F` | Fullscreen |
| `Esc` | Pause menu (releases the mouse) |

Mouse actions fire when you **release** the button, as in the original. The timer starts on the
first left-click release.

Some browsers do not let a page block `Ctrl+W`, so pressing W while holding Ctrl can close the tab.
In fullscreen (`F`), the game asks the browser to pass those keys to the page (Keyboard Lock), where
the browser supports it. During a game, the page also asks you to confirm before it closes.

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
| `LT` + `RT` | Chord (same rules as Left + Right) |
| `A` / `B` | Move up / down |
| Hold `LB` / `RB` / `Y` | Shift / Space / Ctrl view modes |
| D-pad up / down | Change the spacing between cubes (hold to repeat) |
| `X` | Show / hide the controls panel |
| `Start` (Menu) | Pause / resume |
| `Back` (View) | Pause; in menus, back |

In menus, the D-pad or left stick moves the focus, `A` selects and `B` or `Back` goes back. On a slider, D-pad
left / right changes the value; on a custom-board field, `LB` / `RB` step the number. The game pauses
if the controller disconnects during play, and the controller rumbles on an explosion where the
browser supports it. Some browsers only start sound after a key press or a click.

## What's new compared to the original

- **Interface:** a main menu with presets and a custom-board form (cell count, mine limit and
  validation hints). The HUD shows time, mines left and board size, with indicators for the
  Shift/Space/Ctrl view modes. There is an in-game controls panel (`H`) and an end-of-game banner
  that lets you keep flying around the board.
- **Pause menu** (`Esc`): resume, restart or return to the main menu. After a game ends, it offers
  "Play again" and "Keep looking around".
- **Settings:** mouse sensitivity (0.25×–3×), invert mouse Y and volume. They are saved in
  `localStorage`. The defaults match the original.
- **Sound:** synthesized sound effects (Web Audio, no audio files) for revealing, flagging,
  chording, actions that change nothing, explosions and wins. They can be muted.
- **Visual polish:** procedurally drawn tiles with a distinct colour for each number from 1 to 26, a
  sky gradient, distance fog, per-face shading and crisp tile borders. The aimed cube gets a pulsing
  outline. Winning plays a pulse wave and confetti. Losing plays a reveal wave from the exploded
  cell, a screen flash and camera shake, and marks wrong flags. A slowly orbiting demo board sits
  behind the main menu.
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
condition, camera movement (including its quirks), picking, mouse-release actions and the view
modes. [`docs/ORIGINAL_SPEC.md`](docs/ORIGINAL_SPEC.md) describes the original's behaviour, and the
rules engine is tested against a direct port of the original logic. The port changes these things
on purpose:

- **Safe first click:** mines are placed around the first click, so a board holds at most one
  fewer mine than cells, and a finished board takes no more clicks.
- **Crash fixes:** the Random button is guarded for tiny boards, a chord with nothing aimed does
  nothing, and flood fill is iterative, so huge boards cannot overflow the stack.
- **Re-centred grid:** the board stays centred when the spacing grows. The start camera moves to
  match and lines up with a column of cubes.
- **Pause menu instead of `F5` / `Esc`:** the original restarted with `F5` and quit with `Esc`. Here
  `Esc` opens a menu with resume, restart and main menu.
- **Draw distance:** the far plane grows with the board instead of being clipped at 300 units.
- **Minor timing changes the player cannot see:** auto-hiding and the win check run right after each
  action instead of once per frame, and the timer stops while the game is paused.
- **Touch devices are not supported:** the game needs a mouse and keyboard (with Pointer Lock) or a
  game controller. On a touch-only device, the menu says so.

## Running locally

There is no build step. Serve the folder with any static web server, for example:

```sh
npx http-server -c-1
```

Then open the URL it prints (by default http://localhost:8080). The game needs WebGL 2 and does not
work from `file://`, because ES modules need a server.

## Tests

The rules engine and the controller helpers have unit tests that use Node's built-in test runner
(no dependencies):

```sh
node --test
```

## Project structure

```
index.html              Page markup: menu, HUD, overlays, pause menu, import map for three.js
css/style.css           Styles for menus, HUD and overlays
js/main.js              Entry point: wires the game, renderer, input and UI; frame loop; game flow
js/mode3d/              3D mode: board choice and no-guess switch, game session (first click, generation,
                        timer)
js/classic2d/           Classic 2D mode: board setup, game session and timer, Canvas board view, mouse,
                        keyboard and controller input, tile skin
js/records/             Personal records: board identity, game summary, bests and history, Records screen
                        and its history chart
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
