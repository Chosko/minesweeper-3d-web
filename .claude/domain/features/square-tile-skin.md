# Square tile skin

How a square-grid Classic 2D tile looks in every state — closed, pressed,
revealed, flagged, mine, exploded mine, wrong flag — and the colours of the
numbers 1 to 8, in every theme, drawn on the Canvas 2D board.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
asks for the tiles and number colours every mode applies to its own board,
and holds them to the bar the current 3D look sets. Enthusiasts read a board
at speed, so the skin's first job is legibility: each state recognisable at
a glance and every number distinct from its neighbours, at every board size
Classic 2D offers.

## Scope and non-goals

In scope (m1-classic-2d):

- The square tile in each state, in every theme: closed, pressed (the
  feedback under a held click or chord), revealed empty, revealed number,
  flagged, mine, exploded mine and wrong flag after a loss.
- Number colours 1–8 for each theme — its board module's, per
  [themed-board-art-and-motion](./themed-board-art-and-motion.md) — each
  meeting the contrast contract against its theme's revealed tile.
- The board frame and the gap between tiles.
- A drawing contract the Classic 2D renderer calls per tile, so the renderer
  owns layout and hit-testing while this feature owns appearance.
- Legibility down to the smallest tile size Classic 2D uses for an Expert or
  large custom board.
- Each state's face and glyph, in every theme, drawn from the recipe a 3D
  cube face is drawn from, with the 3D number, flag and mine artwork, so
  both modes read as one game. Each theme's palette and Classic 2D drawing
  style set the look, per [themed-board-art-and-motion](./themed-board-art-and-motion.md); the
  cube-face look below is the bevel style's:
  - closed is the raised face (rim, bevel lit top-left and dark
    bottom-right, shaded face, gloss); flagged is the same face with the 3D
    flag;
  - pressed is the face sunk in: the bevel inverted (dark top-left, lit
    bottom-right), no gloss, a flat face in its own colour — 3D has no held
    press, so this look is the 2D board's own, reading as "about to open",
    unlike closed (raised) and revealed (flat);
  - revealed is the revealed face (rim, flat edge, shaded face), with the 3D
    number glyph — heavy weight, a darker outline of its own hue, a soft
    drop shadow — and no glyph for zero; mine is the revealed face with the
    3D mine, exploded the mine on the exploded face;
  - wrong flag is the 3D wrong-flag tile: the flag under a red cross on the
    revealed face — a flag that was not on a mine.

Non-goals:

- The 3D cube tiles. The recipe is shared; the 3D atlas, number colours
  and palette are `themed-board-art-and-motion`'s
  ([rendering-board-art.md](../../context/rendering-board-art.md)).
- Hexagonal and triangle tiles — `hex-tri-board-art` (`m2c-flat-grids`);
  Surface tiles — deferred to `m6-launch`.
- A colour-blind-safe number set, unless the base number colours already
  meet it — deferred to `m6-launch`.
- Board layout, zoom, scrolling and input — the Classic 2D feature.
- Win and loss animations beyond the static end-state tiles.

## Architecture

Built within the recorded technical direction — Canvas 2D for Classic 2D,
independent of three.js (see [technical-direction.md](../technical-direction.md)).
Colours, the drawing style and the number font come from the active theme's
board module, per [themed-board-art-and-motion](./themed-board-art-and-motion.md);
nothing here holds a palette.

- **Tile recipe.** One shared module draws the parts of a tile — the raised,
  sunken and revealed faces, the number, mine and flag glyphs and the
  wrong-flag cross — at any size, with every colour passed in by its caller.
  It is independent of three.js and of the token reader, and both the 3D
  atlas and the 2D painter draw through it in the theme's drawing styles
  from the theme's board module, per [themed-board-art-and-motion](./themed-board-art-and-motion.md);
  the two modes share one drawing, not two copies. Its proportions
  scale with the tile, and at a 2D tile every rim, border and bevel band
  snaps to whole device pixels, never thinner than one.
- **Tile painter.** Draws one tile of a given state, number and size at a
  given position on a Canvas 2D context through the tile recipe, from the
  active theme's board module ([themed-board-art-and-motion](./themed-board-art-and-motion.md)).
  It is stateless apart from a cache.
- **Tile cache.** Pre-renders each state and number at the current tile size
  and device pixel ratio to an offscreen image, so a full redraw of a large
  board is a sequence of image copies. Invalidated on tile-size change,
  pixel-ratio change and theme change.
- **Number palette.** Each theme's number colours are its board module's,
  Classic 2D drawing 1–8 of them, held to the contrast contract by the
  board conformance checks, per [themed-board-art-and-motion](./themed-board-art-and-motion.md).

## Data and state

- Tile and number colours are the theme's board module's, per
  [themed-board-art-and-motion](./themed-board-art-and-motion.md).
- The tile cache is in memory only, keyed by tile size, pixel ratio and
  theme; nothing is persisted.
- The cell state the painter draws comes from the rules engine through the
  Classic 2D renderer; the skin never reads or changes game state.

## Interfaces and contracts

- **Paint call** — given a context, a position, a tile size and a cell's
  visual state (one of the states above, plus its number when revealed),
  paints that tile. An unknown state paints a visibly wrong placeholder
  rather than nothing.
- **Theme change** — the skin takes the board module the shell hands over
  on every theme change, per [themed-board-art-and-motion](./themed-board-art-and-motion.md),
  drops its cache and asks its renderer for a redraw.
- **Contrast contract** — every number colour reaches at least 4.5:1 against
  every point of its theme's shaded revealed face, both ends of its shading,
  and closed and revealed tiles are distinguishable by more than colour
  alone (relief and border), in every theme.
- **Minimum size** — states and numbers stay legible down to the smallest
  tile size the Classic 2D renderer allows; that minimum is a shared
  constant both features respect.

## Dependencies

- `themed-board-art-and-motion` — the board module the tiles are drawn
  from, its drawing styles and its hand-off on theme change.
- Classic 2D (m1-classic-2d) — the renderer that lays out the board and calls
  the paint call per tile.
- No external libraries.

## Minimum tile size

The minimum tile size, `MIN_TILE_SIZE`, is the readable floor a Classic 2D
board shrinks to before it scrolls (`docs/UX_REVIEW.md` decision 10). The
board fits the game window's board area — the room the window's chrome
leaves — so Expert (30 × 16) fits unscrolled in the larger desktop windows,
and in the smaller ones keeps the floor and scrolls on the axis that
overflows. Screenshots at the floor, at device pixel ratios 1 and 2, show
every state and number of every theme's board module legible, per
[themed-board-art-and-motion](./themed-board-art-and-motion.md).
