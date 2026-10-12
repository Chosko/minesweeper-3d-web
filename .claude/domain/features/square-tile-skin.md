# Square tile skin

How a square-grid Classic 2D tile looks in every state — closed, pressed,
revealed, flagged, mine, exploded mine, wrong flag — and the colours of the
numbers 1 to 8, in the light and the dark theme, drawn on the Canvas 2D
board.

## Purpose

[product-design.md § Visual design system](../product-design.md#visual-design-system)
asks for the tiles and number colours every mode applies to its own board,
and holds them to the bar the current 3D look sets. Enthusiasts read a board
at speed, so the skin's first job is legibility: each state recognisable at
a glance and every number distinct from its neighbours, at every board size
Classic 2D offers.

## Scope and non-goals

In scope (m1-classic-2d):

- The square tile in each state, for both themes: closed, pressed (the
  feedback under a held click or chord), revealed empty, revealed number,
  flagged, mine, exploded mine and wrong flag after a loss.
- Number colours 1–8 for each theme, each meeting the contrast contract
  against its theme's revealed tile.
- The board frame and the gap between tiles.
- A drawing contract the Classic 2D renderer calls per tile, so the renderer
  owns layout and hit-testing while this feature owns appearance.
- Legibility down to the smallest tile size Classic 2D uses for an Expert or
  large custom board.
- The cube-face look, in both themes: each state is drawn from the recipe a
  3D cube face is drawn from — rim, bevel, highlight and border — with the
  3D number, flag and mine artwork, so both modes read as one game:
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

- The 3D cube tiles. The recipe is shared, but the 3D scene keeps its tile
  atlas, number colours and unthemed palette exactly as they are, under both
  themes ([rendering.md](../../context/rendering.md)).
- Hexagonal and triangle tiles, and Surface tiles — deferred to `m6-launch`.
- A colour-blind-safe number set, unless the base number colours already
  meet it — deferred to `m6-launch`.
- Board layout, zoom, scrolling and input — the Classic 2D feature.
- Win and loss animations beyond the static end-state tiles.

## Architecture

Built within the recorded technical direction — Canvas 2D for Classic 2D,
independent of three.js (see [technical-direction.md](../technical-direction.md)).
Colours come from `design-tokens-and-themes`; nothing here holds a second
palette.

- **Tile recipe.** One shared module draws the parts of a tile — the raised,
  sunken and revealed faces, the number, mine and flag glyphs and the
  wrong-flag cross — at any size, with every colour passed in by its caller.
  It is independent of three.js and of the token reader, so the 3D atlas
  draws through it with its own unthemed palette and the 2D painter with its
  tokens; the two modes share one drawing, not two copies. Its proportions
  scale with the tile, and at a 2D tile every rim, border and bevel band
  snaps to whole device pixels, never thinner than one.
- **Tile painter.** Draws one tile of a given state, number and size at a
  given position on a Canvas 2D context through the tile recipe, using tile
  tokens read through the token reader. It is stateless apart from a cache.
- **Tile cache.** Pre-renders each state and number at the current tile size
  and device pixel ratio to an offscreen image, so a full redraw of a large
  board is a sequence of image copies. Invalidated on tile-size change,
  pixel-ratio change and theme change.
- **Number palette.** Eight number colours per theme, defined as tokens.
  The light set starts from the current 3D number hues (blue, green, red,
  navy, maroon, teal, near-black, grey) so the two modes read alike; the
  dark set is a simple placeholder set chosen against the dark revealed
  tile. Both are checked against the contrast contract the way the 3D
  palette is today.

## Data and state

- Tile and number colours are tokens owned by `design-tokens-and-themes`.
- The tile cache is in memory only, keyed by tile size, pixel ratio and
  theme; nothing is persisted.
- The cell state the painter draws comes from the rules engine through the
  Classic 2D renderer; the skin never reads or changes game state.

## Interfaces and contracts

- **Paint call** — given a context, a position, a tile size and a cell's
  visual state (one of the states above, plus its number when revealed),
  paints that tile. An unknown state paints a visibly wrong placeholder
  rather than nothing.
- **Theme change** — the skin subscribes to the token reader's theme-change
  notification, drops its cache and asks its renderer for a redraw.
- **Contrast contract** — every number colour reaches at least 4.5:1 against
  every point of its theme's shaded revealed face, both ends of its shading,
  and closed and revealed tiles are distinguishable by more than colour
  alone (relief and border), in both themes.
- **Minimum size** — states and numbers stay legible down to the smallest
  tile size the Classic 2D renderer allows; that minimum is a shared
  constant both features respect.

## Dependencies

- `design-tokens-and-themes` — tile and number colour tokens, the token
  reader and theme-change notification.
- Classic 2D (m1-classic-2d) — the renderer that lays out the board and calls
  the paint call per tile.
- No external libraries.

## Minimum tile size

The minimum tile size is 26 px (`MIN_TILE_SIZE`): the readable floor a
Classic 2D board shrinks to before it scrolls, so that Expert (30 × 16) fits
any window 1024 px wide (`docs/UX_REVIEW.md` decision 10). Measured in the
Classic 2D screen's framed panel with 16 px window margins, Expert fits a
1024 px wide window at the floor from 520 px tall, and plays at 32 px in a
1024 × 768 window. Screenshots at 26 px, at device pixel ratios 1 and 2,
show every state and number of the cube-face look legible in both themes.
