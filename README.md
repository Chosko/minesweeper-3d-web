# Minesweeper 3D (web)

Minesweeper in three dimensions: a box of up to 100 × 100 × 100 cubes. Every cube has up to 26
neighbours. You fly through the board in first person and aim with a crosshair.

Play it at **https://minesweeper3d.chosko.com**

This is a browser port of *Minesweeper 3D*, an XNA/C# game written in 2011 by
[Chosko](https://github.com/Chosko/minesweeper-3d). Gameplay (rules, navigation and controls)
follows the original exactly, as described in [`docs/ORIGINAL_SPEC.md`](docs/ORIGINAL_SPEC.md).
The graphics, menus and sound are new.

## Controls

| Input | Action |
|---|---|
| Mouse | Look around (click the game to capture the mouse) |
| `W` `A` `S` `D` | Fly forward / left / back / right (forward follows the view direction) |
| `Q` / `E` | Move down / up |
| Left click | Reveal the aimed cube |
| Right click | Flag / unflag. On a revealed number: flag all its closed neighbours (or unflag them all if they are all flagged) |
| Left + Right | Chord: reveal the neighbours of a number whose flags are all placed |
| Mouse wheel | Change the spacing between cubes |
| Hold `Shift` | Fade everything except the aimed cube and its neighbours |
| Hold `Space` | Aim through revealed numbers (they fade) |
| Hold `Ctrl` | Show hidden cells (empty and completed ones) |
| `H` / `M` / `F` | Help panel / sound on-off / fullscreen |
| `Esc` | Pause menu (resume, restart, main menu) |

Mouse actions fire when the button is **released**, as in the original. There is no first-click
safety: mines are placed when the game starts. Some browsers do not let a page block `Ctrl+W`, so
holding Ctrl while pressing W can close the tab. Fullscreen (`F`) asks the browser to give those keys
to the game where it can, and the page asks for confirmation before it closes during a game.

## Running locally

There is no build step. Serve the folder with any static server, for example:

```sh
npx http-server -p 8080 -c-1
```

Then open http://localhost:8080. The game needs WebGL 2. Unit tests for the rules engine run with
`node --test`.

## Layout

- `index.html`, `css/style.css`: page, menus and HUD
- `js/logic.js`: rules engine (no DOM)
- `js/render.js`: three.js instanced renderer (one cube geometry, per-cell state texture, sorted transparency)
- `js/picking.js`: crosshair picking (3D-DDA through the cube lattice)
- `js/input.js`: fly camera, pointer lock, keyboard/mouse handling
- `js/textures.js`: procedurally drawn tiles
- `js/audio.js`: synthesized sound effects
- `js/ui.js`, `js/main.js`: screens and wiring
- `vendor/three/`: three.js r186 (MIT)

## Credits

- Original game: *Minesweeper 3D* (XNA, 2011) by Chosko.
- Rendering: [three.js](https://threejs.org) (MIT license, see `vendor/three/LICENSE`).
