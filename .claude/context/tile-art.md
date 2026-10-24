# Tile art — the shared tile recipe

## OVERVIEW

How a tile is drawn, on either board: the recipe both the Classic 2D tile
skin ([classic2d-tile-skin.md](classic2d-tile-skin.md)) and the 3D tile
atlas ([rendering-board-art.md](rendering-board-art.md)) draw through, from
the active theme's board module, which hands it every colour and parameter.

- `js/tile-art.js` — the shared tile recipe both boards draw through (the
  3D atlas, [rendering.md](rendering.md), and every Classic 2D tile): the
  named drawing styles (`STYLES`) that draw the closed, sunk and revealed
  faces at any size and depth in an outline — the square, the hexagon, the
  triangle pointing up or down —, and the number, mine and flag glyphs, the
  wrong-flag cross and the start cell's ring in a glyph box, every colour
  and parameter an argument. It imports nothing and touches no DOM.

## PUBLIC API

`js/tile-art.js`
- `STYLES` — the drawing styles, `bevel` first (the one an unknown name
  falls back to) and `flat`, each with its default `params`.
- `drawFace(ctx, size, face, {style, params, palette, depth, px, outline})`
  — one of `FACES` (`closed`, `sunk`, `revealed`) in a style, its parameters
  filling the style's defaults, at a depth from 0 (flat) to 1 (fully
  raised), in `outline` (the square by default, an unknown one the square),
  its box at the context's origin; `px` one device pixel, to snap every
  band.
- `OUTLINES` (`square`, `hexagon`, `triangle-up`, `triangle-down`),
  `outlineBox(outline, size)` → `{width, height}` and
  `outlinePoints(outline, size)` → its corners clockwise in that box, at a
  tile `size`: a square's side, a flat-top hexagon's size across its flats,
  a triangle's side.
- `glyphBox(outline, size)` → `{x, y, width, height}` in the outline's box:
  the square's whole tile, a hexagon's size across the flats centred on it,
  a triangle's a square on its centroid, its side the recipe's fraction of
  the triangle's side (`TRIANGLE_GLYPH`); `inGlyphBox(ctx, box, draw)` calls
  `draw(S)` with the context moved to a square of the box's smaller side,
  centred in it, so any glyph draws in it.
- `explodedParams(params)` — a style's parameters for the exploded tile's
  revealed face: its `border` as the hairline, unchanged for a style
  without one.
- `drawNumberGlyph(ctx, S, n, {color, shadow, font?})`, `drawMineGlyph`,
  `drawFlagGlyph`, `drawCross`, `drawMarkRing(ctx, S, {color, width?})`;
  `NUMBER_FONT` (the fallback stack behind a theme's number font), `shade`,
  `mix`, `roundRect`, `tileBands`.

## INTERNAL PATTERNS

- **Drawing styles.** `bevel` is a raised face inside a thin edge framed
  by four sloped sides, each side its own shade from the face toward
  `bevelLight` or `bevelDark` or an exact `#rrggbb` colour (`sides`), the
  slope's width scaled by the depth, so depth 0 is flat; a sunk face turns
  each shade over (a colour mirrored through the face), and the
  revealed face is flat inside its edge. `flat` is a face with a light top
  band and a dark bottom edge (fractions of the size), the sunk face an
  inset shade along its top (`press`, a fraction of the size) and the
  revealed face flush inside a hairline whose width, like the exploded
  tile's `border`, is in drawing units — CSS pixels on a Classic 2D tile, so
  constant at every tile size; depth changes nothing it draws. Either style
  takes a corner radius (a fraction of the size) that clips the tile to a
  rounded square. An unknown style draws the first one with its own
  parameters and is reported once in development.
- **Outlines.** The square outline draws exactly what a face given no
  outline draws, so neither the 3D atlas nor square Classic 2D tiles change
  with it. A hexagon or triangle face is clipped to the outline, its corners
  rounded by the style's radius; the style's fractions and its radius are
  measured against the outline's height (the tile size for the square and
  the hexagon). A flat face keeps its top band and bottom edge inside the
  outline. A bevel's edge, slopes and face are the outline inset from every
  edge, the slope along each edge shaded by the way it faces: an edge facing
  straight up, down, left or right takes that side's shade, an angled one
  blends its two neighbouring sides' shades by its facing, and one between a
  shade and an exact colour takes the side it faces more.
- **Glyphs.** The mine is a round body with eight spikes ending in round
  knobs, three quarters of the tile from knob to knob, under its highlight;
  the wrong-flag cross two butt-ended strokes in its own colour over a
  wider outline; a number of one or two digits is set at the same height,
  a wide one narrowed to fit; the start cell's ring a dashed circle inside
  the tile. Their proportions are the recipe's, their colours the
  caller's.
- **No palette.** The recipe holds no literal colour; every colour,
  parameter and the number font are its caller's, from the board module.

## DOMAIN DEPENDENCIES

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the drawing styles and the glyphs.
- [../domain/features/hex-tri-board-art.md](../domain/features/hex-tri-board-art.md)
  — the hexagon and triangle outlines and glyph boxes.

## CROSS-REFERENCES

- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the Classic 2D
  painter, which picks a face and glyph for each state.
- [rendering-board-art.md](rendering-board-art.md) — the 3D tile atlas,
  drawn in the module's 3D style.
- [app-shell-board-module.md](app-shell-board-module.md) — the board
  module's `style2d` / 3D style parameters and the checks that read each
  style's parameters.
- [geometry.md](geometry.md) — the cell outlines and glyph boxes a
  Classic 2D board hands the painter, which draws in the recipe's outline
  and sets its glyphs in the geometry's glyph box.
- [testing.md](testing.md) — `tests/tile-art.test.mjs` the drawing styles,
  outlines and glyph boxes.

## WHEN TO READ THE SOURCE

- Adding a drawing style or a parameter (`STYLES`; the board checks read
  each style's parameters and its relief entries in
  `js/themes/board-module.js`).
- Any change to `js/tile-art.js` changes both boards, which
  `tests/tile-art.test.mjs` and `tests/render-3d-feedback.test.mjs` pin.
