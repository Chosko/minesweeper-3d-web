# Hexagon and triangle board art

Hexagonal and triangle tiles in the theme: the board module gains what a
theme needs to draw the two new grids, the shared tile recipe draws its
styles in hexagon and triangle outlines, the board checks hold every theme
to the same legibility and contrast contract on them, and *Joyful tiles*
gets the values drawn on its Hexagon and Triangle board sheets.

## Purpose

Every mode applies the chosen theme to its own board, so moving between
modes never feels like moving between games
([product-design.md § Visual design system](../product-design.md#visual-design-system)).
The m2c slice asks for hexagonal and triangle tiles in *Joyful tiles*, the
only theme in the catalogue, as its Claude Design canvas draws them. Today
the board module describes square tiles and numbers 1–8 only. This feature
extends the module and the recipe so the two new grids are drawn the way the
square board is: from the theme's own values, with no colour held by a
renderer.

## Scope and non-goals

In scope (m2c-flat-grids):

- **Per-grid 2D tile shape** in the board module: for the hexagon and the
  triangle grid, the gap and corner radius as fractions of the tile, beside
  the square's. Every other 2D value is shared by the three grids: the
  drawing style and its parameters, palette, faces, number font, cursor
  ring, marked start cell, end effect and cell motion.
- **Numbers to 12** for Classic 2D-style boards. The 2D number list runs
  1–12: a hexagon shows 1–6, a square 1–8 and a triangle 1–12.
- **Outlines in the tile recipe.** Each drawing style (`flat`, `bevel`)
  draws its closed, sunk and revealed faces clipped to a hexagon, or to a
  triangle pointing up or down, at any size and depth. The top band and
  bottom edge sit inside the outline. A bevel's sloped sides follow the
  outline's edges, each shaded by the way it faces. The glyphs (numbers,
  flag, mine, wrong-flag cross, start-cell ring) are drawn in the
  geometry's glyph box: a hexagon's box is its size across the flats, a
  triangle's is 0.55 of its side, centred on its centroid.
- **Board checks** extended to the new grids: every entry present; each
  number at least 4.5:1 against the revealed face and its shade; the cursor
  ring at least 3:1 against the closed and revealed faces; the closed face's
  relief at least a pixel; every number and glyph legible at each grid's own
  floor (`hexagon-grid`, `triangle-grid`).
- **Joyful tiles' values**, from the canvas's Hexagon and Triangle board
  sheets and the kept variant "B · Sharp": hexagon gap 6 % and radius 5 %
  of the tile across the flats; triangle gap 6 % and radius 6 % of the tile
  height; numbers 9–12 in the 3D hues of the same numbers, so a number has
  one colour in every mode. The cell motion is the Classic 2D motion,
  unchanged, played around the tile's centre.
- **The theme skill** reads a theme's Hexagon and Triangle board sheets
  beside its 2D board sheet, so a later theme can supply these values from
  its canvas.

Non-goals:

- Hexagonal and triangle tiles in themes added after *Joyful tiles* —
  deferred to `m6-launch`. The contract this feature adds is what those
  themes fill.
- The colour-blind-safe number set — deferred to `m6-launch`.
- Surface tiles — deferred to `m6-launch`.
- Where tiles go, hit-testing and the floor — `flat-grid-geometry` and the
  two grid features.
- A solved pulse on flat boards. None of the three flat grids plays one.

## Architecture

Built within the recorded technical direction: a theme is a stylesheet plus
a board module; the Canvas 2D painter draws through the one shared tile
recipe, `js/tile-art.js`, whose named drawing styles take the palette and
parameters they are given (see
[technical-direction.md](../technical-direction.md)). It extends
`themed-board-art-and-motion` in place
([app-shell-board-module.md](../../context/app-shell-board-module.md),
[classic2d-tile-skin.md](../../context/classic2d-tile-skin.md)).

- **Board module shape** — the 2D style gains its per-grid shape entries,
  and the 2D number list extends to 12. The 3D style and number list are
  untouched.
- **Tile recipe** — the drawing styles take an outline (square, hexagon,
  triangle up, triangle down) along with size, depth and palette. The
  square outline draws exactly what it draws today, so the 3D atlas and
  Classic 2D tiles do not change.
- **Painter and cache** — the Classic 2D tile painter draws a cell through
  its geometry's outline and the grid's shape entries. The cache key gains
  the outline, so a triangle board caches both orientations.
- **Board checks** — `checkBoardModule` runs its legibility and contrast
  checks per grid, at that grid's floor and with that grid's numbers. A
  module missing a grid's entries fails the conformance suite.
- **Hand-off** — unchanged. The active module reaches every flat board
  through `BOARD_ART` once its number font has loaded.

## Data and state

- **Board module** (per theme, a plain ES module): the 2D style's shape per
  grid, gap and radius for each of square, hexagon and triangle; the 2D
  number colours 1–12. Nothing is persisted. The module is the theme's
  source of truth, and the checks hold it to the contract.

## Interfaces and contracts

- **Recipe** — draws a face of a style in an outline at a size and depth;
  draws each glyph in a glyph box. Every colour and parameter is an argument,
  and the recipe holds no literal colour.
- **Painter** — paints a state, number and depth for a cell of a geometry.
  A number outside its grid's range, an unknown state or a missing module
  paints the visible placeholder, as today.
- **Checks** — return problems by check and subject, none when the module
  conforms. A theme that fails them is not registered by the theme skill.

## Dependencies

- `themed-board-art-and-motion` — the board module, tile recipe, painter,
  cache, checks and hand-off this extends.
- `theme-system` — the conformance suite and the theme contract.
- `flat-grid-geometry` — the outlines and glyph boxes the painter asks for.
- `hexagon-grid`, `triangle-grid` — each grid's floor and number range.
- `theme-implement-skill` — the skill that brings a theme's sheet values in.
- The Claude Design canvas (https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC),
  Joyful tiles · Hexagon board sheet and · Triangle board sheet — the values,
  read as data.
