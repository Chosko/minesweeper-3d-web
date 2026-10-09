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
- Low-fidelity drawing: every state drawn plainly — a flat fill, a simple
  edge and a plain glyph — with simple placeholder values wherever a colour
  is a visual-design judgement, the dark tile and number set among them,
  each still meeting the contrast contract.

Non-goals:

- High-fidelity visual dressing — a later pass from the approved designs.
  The designs under iteration are not an input to this feature's tasks.
- The 3D cube tiles. The 3D scene keeps its current tile atlas and number
  colours under both themes ([rendering.md](../../context/rendering.md)).
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

- **Tile painter.** Draws one tile of a given state, number and size at a
  given position on a Canvas 2D context, using tile tokens read through the
  token reader. It is stateless apart from a cache.
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
  its theme's revealed tile, and closed and revealed tiles are
  distinguishable by more than colour alone (relief, edge or texture), in
  both themes.
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

Settled by measurement: the minimum tile size is 41 px (`MIN_TILE_SIZE`),
the tile an Expert board (30 × 16) gets fitted below the overlay bar, with
16 px between the window edges, the bar and the board, in a 1366×768 window
and in a 1280×800 window standing in for the Steam Deck screen — 41 px in
both. Screenshots at that size show every state and number legible in both
themes.
