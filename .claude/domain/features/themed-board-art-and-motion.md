# Themed board art and cell motion

Every board drawn in the chosen theme: the Classic 2D tiles in every state,
the 3D cubes in every state, the number colours in both modes, the 3D sky,
fog and background — and board cells that move as the theme describes each
cell event, in both modes, without ever touching the game.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
has every mode apply the chosen theme to its own board, so moving between
modes never feels like moving between games, and gives each theme its own
cell motion — one theme presses a cell down, another flips it. The boards are
not DOM: Classic 2D is a Canvas 2D painter over boards of up to 100 × 100
cells, and 3D is a WebGL scene of instanced cubes, so neither can be styled
or animated by a stylesheet. This feature gives both renderers one
description of a theme's board — palette, drawing style, motion — and one
player for that motion, so a theme is written once and both modes show it.

## Scope and non-goals

In scope (m2b-themes):

- **The theme board module's shape** — the part of the theme contract
  (`theme-system`) that styles boards: tile and cube palette, the Classic 2D
  number colours 1–8 and the 3D number colours 1–26 as separate lists,
  number font, sky and fog, tile drawing style and its parameters, the
  Classic 2D marked start cell, the Classic 2D end effect, cell motion per
  cell event.
- **Tile drawing styles** — the shared tile recipe grows from one fixed
  look into a small set of named drawing styles, each with parameters. This
  milestone ships two: **bevel** (a raised face framed by a thin edge and
  four sloped sides, each side its own shade so the face reads as lit from
  one corner, the edge and slope widths as parameters; the revealed face
  flat inside its edge, with no slope — the recipe's look today is one
  setting of it) and **flat** (a face with no slope: the closed face with a
  light top band and a dark bottom edge, the revealed face flush with a
  hairline of constant width in CSS pixels at every tile size, the pressed
  shade and the exploded tile's border as widths from the module). A theme
  picks one style for its Classic 2D tiles and one for its 3D cubes.
- **Classic 2D tiles** — the tile painter and its cache draw from the
  active theme's board module and style, and redraw on theme change. The
  module sets the tile's corner radius and the gap between tiles as
  fractions of the tile size, so both scale with it; the cursor ring's
  radius follows the tile's, and the board frame's radius scales with the
  tile too. The cursor ring draws outside the tile, covering none of its
  face, on a layer of its own, so it moves without redrawing a cell. The
  marked start cell is drawn from the module's marked face — in the game,
  the menu preview and the Daily preview.
- **The board frame** — a plain frame whose padding is the module's gap,
  around every Classic 2D board: the game, the menu preview, the Daily
  preview (on the screen's body, with no scene panel behind it) and the
  replay viewer, which fits the whole board in its board area. On a phone a
  board too large to fit scrolls in a rounded viewport with no frame.
- **3D cubes** — the tile atlas is generated from the active theme's
  palette and 3D style, every state and number 0–26 included, never shipped
  as a picture, and rebuilt on theme change; the selection outline, the
  glow line inside it and the selected face's tint, the marked start cell's
  tint and the confetti colours come from the board module. A painted slope is
  lit the same way on every face of a cube, top faces included.
- **Sky, fog and background** — from the board module, replacing the sky
  tokens. The theme stylesheet's scene tokens are named for the sky they
  match (zenith, horizon, nadir) and the scene's ink, and board tokens the
  canvas does not draw are retired once nothing reads them.
- **The Classic 2D end effect** — the win confetti, the win wave (each tile
  bumped in scale and lightened, clipped to its rounded face) and the loss
  wave (each tile snapping to its revealed face with an overshoot and a
  flash) take their colours and values from the board module, not from
  tokens.
- **Cell motion** — per theme, per cell event (press, release, reveal,
  flag, unflag, chord press, solved pulse), from the fixed motion
  vocabulary, played per cell by the 2D painter and per cube by the 3D
  renderer.
- **The *Joyful tiles* board module** — flat Classic 2D tiles and bevel 3D
  cubes, whose closed and flagged cubes take the slope and
  whose revealed cubes are flat inside their edge, so open and closed
  differ by relief as well as colour; its flag, and its numbers 1–8 in the
  glyph style and colours the game draws today in the light look (weight,
  outline, shadow), set in Rubik, the theme's self-hosted font; every value
  — palette, both number lists, sky and fog, both styles'
  parameters, the cursor ring and the marked start cell, the selection
  outline, its glow line and the selected face's tint, the confetti
  colours, the Classic 2D end effect, and the cell motion with the solved
  pulse, its press, release, reveal, flag, unflag and chord press keyframed
  on the opacity, flip, scale and brightness tracks as the canvas draws
  them — from the canvas's *J-BoardSheet* (2D) and *J-3DSheet* (3D)
  artboards, passing the board conformance checks unchanged.
- **The board conformance checks** that `theme-system`'s conformance tests
  run for every theme.

Non-goals:

- Animating cells as DOM elements with CSS — a 100 × 100 board is too heavy
  for one element per cell, and the 3D scene cannot use it.
- New motion ingredients beyond the vocabulary below, and motion for
  anything that is not a cell event: the end-of-game waves, confetti and
  shake, and the flash of the cubes a flag click on a number changes, keep
  their current behaviour, drawn in the theme's palette — the Classic 2D
  end effect reading it from the board module (**The Classic 2D end
  effect** above).
- Changing the 3D mode's controls, pick rules, view modes or rules.
- Hexagonal, triangle and Surface tiles, and the colour-blind-safe number
  set — deferred to `m6-launch`.
- A tile drawing style no theme in the catalogue uses yet — a later theme
  that needs one stops the theme skill and becomes a task
  (`theme-implement-skill`).
- DOM component motion — plain CSS in the theme stylesheet
  (`theme-system`).
- Reduced motion — `m7-after-launch` (`theme-system`); until then cell
  motion always plays, as the 2D and 3D game effects do, and the cell motion
  player reads no reduce-motion preference.

## Architecture

Built within the recorded technical direction — Canvas 2D for Classic 2D,
three.js for 3D, plain ES modules (see
[technical-direction.md](../technical-direction.md)). Per-theme drawing in
both renderers is not yet recorded there; see `theme-system`.

It extends the Classic 2D tile skin and the 3D renderer as built
([classic2d-tile-skin.md](../../context/classic2d-tile-skin.md), its cell
motion player [classic2d-tile-motion.md](../../context/classic2d-tile-motion.md);
[rendering.md](../../context/rendering.md), its board art
[rendering-board-art.md](../../context/rendering-board-art.md)), and keeps their division of
labour: the shell hands each renderer what it draws with, and no renderer
reads a stylesheet or imports a theme.

- **Tile recipe with drawing styles.** The shared recipe both modes draw
  through gains named drawing styles. Each style draws the same set of
  faces — closed, sunk (closed at full depth), revealed — and the same
  glyphs — number, flag, mine, exploded mine, wrong-flag cross — from the
  palette and parameters it is given, at any size, in both modes alike
  (the mine's spikes ending in round knobs, the wrong-flag cross in its own
  colour, a two-digit 3D number set at a single digit's height and
  narrowed to fit), and accepts a **depth**
  from 0 (flat) to 1 (fully raised) so the depth motion ingredient can draw
  in-between faces; a depth keyframe past 1 is an overshoot, drawn fully
  raised. The styles are the table `STYLES` of `js/tile-art.js` — `bevel`
  first, the one an unknown name falls back to, then `flat` — drawn through
  one entry point, `drawFace`. It reads no theme and no token: the caller
  passes everything.
- **Board art hand-off.** The shell subscribes to `theme-system`'s theme
  change, waits for the theme's number font, and hands the active board
  module to the Classic 2D tile skin and to the 3D renderer:
  `js/shell/board-art.js` sets the hand-off `BOARD_ART`
  (`js/classic2d/tile-skin.js`) that every tile skin reads, and
  `js/shell/scene-palette.js` passes each module it holds to the renderer's
  `setBoard`.
- **Classic 2D tile skin.** Paints each tile state through the recipe with
  the theme's style, palette and number font; its cache is keyed by theme as
  well as size and pixel ratio, and dropped on theme change. The board
  frame, its ground between tiles, the gap and the cursor ring's colour and
  radius come from the theme too — the frame as the kit component
  `ui-board-frame` styled by the theme stylesheet, its radius the custom
  property `--board-frame-radius`, set at every layout of the board to the
  2D style's `frameRadius` × the tile; the gap and the cursor ring from the board
  module. The board view lays tiles out on
  the tile size plus the gap, and hit-tests a cell's whole slot, gap
  included. The cursor ring draws on the ring layer, a canvas of its own
  (class `board-ring`) over the motion layer, taking no input; the marked start
  cell is a tile state of its own, the skin's `marked` tile.
- **3D tile atlas and scene.** The atlas is built from the board module's
  3D style —
  one layer per state and per number 0–26, plus the sunk closed face the
  depth ingredient blends towards (`L_SUNK`, after the others) — and
  rebuilt when the theme changes. The
  sky gradient, fog and clear colour come from the board module's sky; the
  ground grid keeps deriving its ink from the horizon. The selection
  outline, its inner glow line, the selected face's tint, the marked-cell
  tint and the confetti colours come from the board module.
- **Cell motion player.** One DOM-free module both renderers use. It holds
  the running cell animations: started by a cell event with the cell, the
  event, the visual state before and after, and the theme's description for
  that event; asked per frame for each animating cell's current values
  (scale, offset, rotation and which face shows, depth, brightness,
  opacity). It drops every animation on a new board, a seek, a pause hiding
  the board and a theme change, and it caps how many cells animate at once — past the cap a cell simply shows its new
  state — so a flood reveal on a 100 × 100 board costs nothing extra. The
  player is `js/cell-motion.js`; its interface is `start(cell, event,
  before, after, description)`, `valuesAt(time)`, `dropAll()` and
  `animating()`. The cap, `MOTION_CAP`, is measured by
  `dev/measure-cell-motion.mjs` on a flood reveal of a 100 × 100 board in
  both renderers, the heavier of the two — the 2D motion layer — deciding
  it; the module's head comment holds the measurement and the frame budget
  that picks it.
- **2D motion layer.** Animating cells are drawn on a layer above the board
  canvas from the cached tile images, transformed per the player's values;
  the board canvas shows the cell's slot empty for the animation's length,
  so a growing or moving cell overlaps its neighbours cleanly and nothing
  on the board canvas is redrawn per frame. Every track of the vocabulary
  draws there — offset, scale, flip, brightness and opacity in every
  style, the flat one included; the 3D motion mesh draws every track too,
  on the events the 3D game reports, which never include press, release
  or chord press. The layer is a second canvas
  (class `board-motion`) over the board canvas, taking no input. Depth
  draws from cached in-between faces at a few fixed steps — `DEPTH_STEPS`
  in `js/classic2d/tile-skin.js`, from flat to fully raised, the nearest
  step drawn. Frames run only while a cell animates.
- **3D motion mesh.** Animating cubes are drawn by one more instanced mesh,
  as the flash is, with per-instance scale, offset, rotation, brightness,
  opacity, the face shown and the depth blend; the cube's ordinary instance
  is hidden while it animates. The "solved" pulse is the solved-pulse cell
  event, played from the theme's description on the same motion mesh —
  there is no separate pulse mesh; its rules — visual only, the cube
  already hidden to picking, dropped on a loss and on a seek — are
  unchanged.
- **Event sources.** Each mode reports cell events from what it already
  knows: the Classic 2D pointer and cursor inputs' pressed set (press,
  release, chord press), the engine's change lists (reveal, flag, unflag),
  and the 3D renderer's own number-to-hidden detection (solved pulse). A
  replay plays the same events from its frames, as it plays the pulse today.
  Classic 2D has no solved pulse: its numbers never hide.

## Data and state

- **Board module (per theme, static)** — `themes/<id>/board.js`, exporting
  `BOARD`, in the shape the head comment of `js/themes/board-module.js`
  documents —
  - *palette*: closed face, closed edge and highlight, sunk face, revealed
    face and border, flag (pole and cloth), mine, exploded ground, wrong-flag
    cross, board ground, the confetti colours of both modes, and the
    Classic 2D faces the style does not derive, the marked start cell among
    them (`palette.faces2d.marked`, with its dashed ring's colour `ring`);
  - *cursor*, *selection*, *mark*: the Classic 2D cursor ring, drawn
    outside the tile round an inner band of its own colour and width; the
    3D selection outline, its inner glow line and the selected face's tint;
    the 3D marked-cell tint;
  - *numbers*: two lists — `numbers2d`, the Classic 2D colours 1 to 8, and
    `numbers3d`, the 3D colours 1 to 26; the number font family and weight;
  - *end2d*: the Classic 2D end effect's waves — the light a wave mixes a
    tile toward, the win wave's peak scale and mix, the loss wave's
    starting scale and flash — its confetti drawn from the palette's
    confetti colours;
  - *sky*: horizon, zenith and nadir, and the fog colour (the horizon when
    absent);
  - *drawing style*: per mode — Classic 2D tiles (`style2d`) and 3D cubes
    (`style3d`) — the style's name and its parameters, the Classic 2D one
    with the corner radius, the gap and the board frame's radius as
    fractions of the tile;
  - *motion*: one description per cell event — `press`, `release`,
    `reveal`, `flag`, `unflag`, `chordPress`, `solvedPulse` — or `null` for
    an event the theme leaves still.
- **Motion description** — a duration, an easing (a named curve or a cubic
  Bézier), and one or more tracks, each a property from the vocabulary with
  its keyframed values:
  - *scale* — uniform, 1 is the cell's size;
  - *offset* — in cell sizes; 2D uses x and y, 3D maps x and y to the
    camera's screen axes and z toward the camera;
  - *rotation* — an axis and an angle; a **flip** is a rotation that shows
    the state before the event until its midpoint and the state after it
    from then on;
  - *depth* — the drawing style's depth, 0 flat to 1 fully raised;
  - *brightness* — 1 the drawn colour; above 1 a lift toward white by the
    excess, below 1 a multiplier on the drawn colour;
  - *opacity*.
  A cell shows its state after the event once the animation ends, and at
  any point a flip passes its midpoint.
- **Running animations** — in memory in the player, per renderer; never
  persisted, never part of game state or a replay.
- **Caches** — the 2D tile cache (size, pixel ratio, theme) and its depth
  steps; the 3D atlas texture per theme. Rebuilt, never persisted.

## Interfaces and contracts

- **Recipe** — draw a face or glyph given a context, a size, a style, its
  parameters, the palette entries it uses and a depth. An unknown style is
  a conformance failure; at run time it draws the first shipped style rather
  than nothing.
- **Renderer hand-off** — the Classic 2D tile skin and the 3D renderer each
  take a board module, and redraw (2D) or rebuild their atlas and sky (3D)
  on receiving one. Neither imports a theme or reads a stylesheet.
- **Motion player** — start an animation for a cell event; current values
  for every animating cell at a time; drop all; whether anything is
  animating (the render-on-demand loops poll it).
- **Motion is visual only** — a cell event changes the game, the engine's
  state, the timer and the replay at once, exactly as with no motion. Hit
  testing and picking use the cell's logical slot, never its animated
  position. No input waits for an animation, and a second event on an
  animating cell restarts it from the new state.
- **Board conformance checks** (run by `theme-system`'s tests for every
  theme) — every palette entry, both number lists, a shipped style with all
  its parameters for each mode, an entry for every cell event — a motion description
  built only from the vocabulary with a positive duration, or none; each 3D
  number colour at least 4.5:1 against every point of the 3D revealed face,
  and each Classic 2D number against the 2D revealed face and its shade (the
  hairline round a flat face holds no glyph); closed and revealed
  faces distinguishable by more than colour (relief or border); the
  cursor ring and selection outline at least 3:1 against both faces.
- **Minimum size** — every state and number stays legible down to the
  Classic 2D minimum tile size, in every theme and style.
- **Values a theme's artboards leave undrawn** — derived by fixed rules, so
  every theme fills the contract the same way: numbers 9–26 from the 3D
  mode's reference hues, each adjusted in lightness until it passes the
  contrast check against the theme's revealed face; the mine and the
  wrong-flag cross in the theme's ink and danger colour; the pressed face as
  the theme's style at zero depth; the sky from the theme's 3D panel, or
  from its page backdrop when it has none; no motion for an event the
  artboards do not animate, except the solved pulse, which takes the
  reference pulse the 3D mode plays today, since the 3D design promises a
  pulse before a number hides.

## Dependencies

- `theme-system` — the registry, the board module's loading and hand-off,
  the theme-change notification and the conformance tests that run the
  board checks.
- `classic-2d-square-play` — the board view, inputs and per-cell redraw
  the 2D motion layer sits on.
- `3d-board-graph`, `3d-play-flow` — the 3D state view and the renderer's
  existing effect meshes.
- `replay-playback` — the 2D and 3D viewers, whose seeks drop motion.
- No new libraries.

