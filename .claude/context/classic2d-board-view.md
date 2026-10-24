# Classic 2D — board view: layout

## OVERVIEW

`js/classic2d/board-view.js` lays the Classic 2D board out on the board's
grid geometry ([geometry.md](geometry.md)): the fit rule with its floor,
the board scale's cap and the board frame, the layout on the tile and the
board module's gap, the frame's rectangle, the board's extent and
hit-testing. DOM-free at import. The view itself — `createBoardView`,
per-cell redraw, scrolling and panning, the touch zoom, the hidden board
and `mountBoardView` — is [classic2d-board-canvas.md](classic2d-board-canvas.md);
what it draws over and for its tiles — pressed feedback, the cursor ring on
its own layer, the marked start cell, cell motion, the end effect — is
[classic2d-board-motion.md](classic2d-board-motion.md); the area overview
[classic2d.md](classic2d.md).

## PUBLIC API

- `fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max =
  Infinity, gap = 0, edges = 0)` — the largest whole tile at which the
  board, gaps included (and `edges` more gaps per axis, a frame's), fits, at
  most `max`, never below `min`; `gapPx(tile, gap)` the gap in whole pixels
  for a gap fraction.
- `BOARD_SCALES` (`fit`, `100`, `125` — the settings' `boardScale`),
  `DEFAULT_BOARD_SCALE` (`100`), `TILE_CAP`, `tileCap(scale)` → the square
  geometry's largest tile at a board scale: `TILE_CAP` at 100 %, scaled up
  at 125 %, `Infinity` at Fit.
- `BOARD_FRAME` (`{gaps: 1}`) — the board frame every Classic 2D board sits
  in: the module's gap on every side.
- `boardLayout({geometry, width, height, min, max, frame, gap,
  frameRadius})` (or `cols, rows` for a square board in place of
  `geometry`; `min` the geometry's floor by default) → frozen `{width, height, tile, gap, pitch, inset,
  frameRadius, boardWidth, boardHeight, viewX, viewY, viewWidth, viewHeight,
  offsetX, offsetY, maxScrollX, maxScrollY, scrolls}` — `frame` `{top,
  right, bottom, left, minWidth, gaps}` (a fixed part in pixels plus `gaps`
  of the gap), `gap` and `frameRadius` fractions of the tile, `pitch` the
  tile plus the gap in pixels, `inset` the frame's room on each side as laid
  out, `frameRadius` its corner radius in whole pixels, `boardWidth` and
  `boardHeight` the geometry's extent; the view rectangle
  is the board centred with its frame, or the area inside the frame's fixed
  part when it scrolls.
- `panelRect(layout, frame)` → `{x, y, width, height}` — the frame around
  the view, its `inset` on each side, at least `frame.minWidth` wide, never
  wider than the area.
- `boardExtent(layout)` → `{width, height}` — the room the layout's board
  takes of its area: the frame's rectangle of a board that fits, the view of
  one that scrolls; an area of exactly that size lays it out at the same
  tile with nothing left over.
- `cellAtLayout(layout, scroll, geometry, x, y)` (or `cols, rows` in place
  of `geometry` for a square board) → the geometry's cell at the board
  point, or -1 outside the view or the board.

## INTERNAL PATTERNS

- **Board module.** The view reads the skin's board module (`board()`):
  `style2d.params.gap`, `radius` and `frameRadius`, `palette.boardGround`,
  `cursor`, `end2d` and `motion`. A hand-off of a new module drops every animation, lays the
  board out again (its gap may change) and repaints it.
- **Geometry.** Every Classic 2D board — the game, the menu's and Daily
  previews — is mounted on the square geometry of its grid, and the replay
  viewer on the geometry rebuilt from its replay's board
  ([replay-viewers.md](replay-viewers.md)). The board's extent, each cell's
  outline and glyph box (asked once per tile and gap) and centre, the cell
  at a board point, the floor and the tile at each board scale are the
  geometry's; the view computes no column or row, and hands the skin each
  cell's outline and glyph box with every tile it draws, on the board and
  on the motion layer.
  A repaint walks the index span between the cells at the view's corners,
  widened by a row each way, and draws those in view.
- **Pitch.** On the square geometry tiles sit one pitch apart, the tile
  plus the gap in whole pixels (none without a gap), inside the view
  rectangle, filled with the module's ground. The fit rule counts the
  gaps; a cell's slot is its tile and the gap after it, so hit-testing maps
  a pointer in a gap to a cell. The board units — the wheel's line, the
  touch zoom's board point and, through `boardPoint`, the replay's pointer
  samples ([replay-samplers.md](replay-samplers.md)) — are pitches. A tile with a
  corner radius is laid on fresh ground when it is redrawn.
- **Fit rule.** The board fits the area less the frame at the largest whole
  tile up to the geometry's tile at the scale (`tileCap` on the square
  geometry), never below the geometry's floor (`MIN_TILE_SIZE` on the
  square geometry,
  [square-tile-skin.md § Minimum tile size](../domain/features/square-tile-skin.md)),
  or the view's `minTile` for a board shown and not played. A board that
  fits is centred with its frame and never scrolls; one that does not keeps
  the floor, fills the area with no frame, starts at its top-left corner
  and scrolls on the overflowing axis only, in a viewport — the view —
  rounded at the theme's `--board-viewport-radius` (set on
  `[data-board-clipped]`). In play the fit rule works in the room the game
  window's chrome — the head, the counter strip, the figures panel beside
  or under the board, the foot line — leaves, so a board that fits a bare
  window may scroll in it (Expert does in the smaller desktop windows);
  the window hugs its board, its board area `#c2d-stage` (which the view's
  container `#c2d-board` fills) sized to the board's extent in that room,
  so a board that fits sits at the area's corner with nothing to centre ([app-shell-2d.md](app-shell-2d.md)).
- **Board frame.** Every Classic 2D board — the game, the Daily preview
  and the replay viewer; not the main menu's Classic 2D tile, whose board
  is mounted unframed and cropped from its middle — sits in the kit's board frame
  component `ui-board-frame`, padded by the module's gap on every side
  (`BOARD_FRAME`, counted in the fit) and styled by the theme stylesheet
  with its corner radius `--board-frame-radius`, the module's
  `style2d.params.frameRadius` × the tile (`layout.frameRadius`). The game
  places its own frame `#c2d-panel` from each layout
  ([app-shell-ui.md](app-shell-ui.md) `placePanel2D`); every other board is
  mounted `framed`, the view placing its own. The window's composition and
  where its panel goes on a narrow window are
  [classic2d-mode.md](classic2d-mode.md) § Game window.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — fitting and hit-testing.
- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — the board view on the geometry.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md) — the minimum tile size.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the gap, the corner radius and the board frame.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window whose board area the fit rule works in.

## CROSS-REFERENCES

- [classic2d-board-canvas.md](classic2d-board-canvas.md) — the view built
  on this layout: its members, redraw, scrolling, zoom and mount.
- [classic2d-board-motion.md](classic2d-board-motion.md) — feedback,
  rings, cell motion and the end effect's drawing.
- [geometry.md](geometry.md) — the grid geometry the view lays out on;
  [engine.md](engine.md) — the square grid's index layout.
- [classic2d-tile-skin.md](classic2d-tile-skin.md) — `MIN_TILE_SIZE`.
- [app-shell-board-module.md](app-shell-board-module.md), [app-shell-2d.md](app-shell-2d.md) — the board module, the board frame
  component, the board tokens and the shell's panel frame;
  [app-shell-ui.md](app-shell-ui.md) — `placePanel2D`.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs` the view, pitch,
  the geometry it lays out on.

## WHEN TO READ THE SOURCE

- Changing the fit rule, the cap, the gap, the frame or the layout
  (`boardLayout`, `gapPx`, `panelRect`, `fitTileSize`).
