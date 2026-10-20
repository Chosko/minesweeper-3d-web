# Classic 2D — board view

## OVERVIEW

`js/classic2d/board-view.js` lays the Classic 2D board out and draws it:
the fit rule with its floor, the board scale's cap and a page's frame, the
layout on the tile and the board module's gap, the panel's rectangle,
hit-testing, per-cell redraw from the engine's change lists, scrolling and
panning with a clipped board's shadows and scroll bars, the touch zoom,
the hidden board while paused, and `mountBoardView`, the browser wiring
around it. DOM-free at import. What it draws over and for its tiles —
pressed feedback, the cursor ring on its own layer, the marked start cell,
cell motion, the end effect — is
[classic2d-board-motion.md](classic2d-board-motion.md); the area overview
[classic2d.md](classic2d.md).

## PUBLIC API

- `fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max =
  Infinity, gap = 0)` — the largest whole tile at which the board, gaps
  included, fits, at most `max`, never below `min`; `gapPx(tile, gap)` the
  gap in whole pixels for a gap fraction.
- `BOARD_SCALES` (`fit`, `100`, `125` — the settings' `boardScale`),
  `DEFAULT_BOARD_SCALE` (`100`), `TILE_CAP` (48), `tileCap(scale)` → 48 at
  100 %, 60 at 125 %, `Infinity` at Fit.
- `boardLayout({cols, rows, width, height, min, max, frame, gap})` →
  frozen `{width, height, tile, gap, pitch, boardWidth, boardHeight, viewX,
  viewY, viewWidth, viewHeight, offsetX, offsetY, maxScrollX, maxScrollY,
  scrolls}` — `frame` `{top, right, bottom, left, minWidth}`, `gap` a
  fraction of the tile, `pitch` the tile plus the gap in pixels; the view
  rectangle is the board centred with its frame, or the area inside the
  frame when it scrolls.
- `panelRect(layout, frame)` → `{x, y, width, height}` — the frame around
  the view, at least `frame.minWidth` wide, never wider than the area.
- `clipMarks(layout, scroll)` → `{left, right, top, bottom, barX, barY}`;
  `SHADOW_DEPTH` (12), `SCROLLBAR` (`{thickness: 4, inset: 2}`).
- `cellAtLayout(layout, scroll, cols, rows, x, y)` → cell index or -1.
- Tokens: `BOARD_SHADOW`, `BOARD_SCROLLBAR`; `BOARD_BACKGROUND`
  (`--color-board-frame`) only while the skin has no board module, whose
  `palette.boardGround` takes its place. `PAN_MODIFIER` (`shiftKey`).
- `createBoardView({canvas, grid, createSkin, token, scale, frame, minTile,
  onLayout, layer, overlay, frames, now, onMotion, timers})` (`frame` an object, or a
  function measured again at every refit) → `{resize(width, height,
  pixelRatio), setScale(scale), scale, setGame(game), update(changed,
  {motion}), repaint(), cellAt(x, y), cellRect(c), scroll, scrollTo,
  scrollBy, pan(dx, dy), wheel(event) → taken, ensureVisible(c) →
  scrolled, setHidden(hidden), hidden, layout, pixelRatio, canvas,
  dispose}` plus the feedback, ring, motion and effect members of
  [classic2d-board-motion.md](classic2d-board-motion.md); `grid` the
  square grid ([engine.md](engine.md)); `createSkin` defaults to
  `createTileSkin`, `token` to the token reader. Positions are canvas CSS
  pixels.
- Touch zoom: `zoomRange` → `{min, max}` (`MIN_TILE_SIZE` and the
  fit-to-view tile, the whole board inside the frame, whichever is larger),
  `boardPoint(x, y)` → `{u, v}` in pitches, `zoom(tile, x, y, point?)` →
  changed.
- `mountBoardView({container, grid, win, onUserScroll, ...})` → the view
  plus `destroy()`: a canvas filling `container`, then the motion layer's
  canvas (`.board-motion`) and the ring layer's (`.board-ring`) right after
  it, each over it at the same place and size and taking no input, refitted on container resize and
  device-pixel-ratio change, scrolled by the wheel and panned by a
  primary-button drag with `PAN_MODIFIER` held.

## INTERNAL PATTERNS

- **The engine is the source.** The view keeps no cell state; every tile is
  read from the game (`cellState` / `cellNumber`) when drawn.
- **Board module.** The view reads the skin's board module (`board()`):
  `style2d.params.gap` and `radius`, `palette.boardGround`, `cursor` and
  `motion`. A hand-off of a new module drops every animation, lays the
  board out again (its gap may change) and repaints it.
- **Pitch.** Tiles sit one pitch apart, the tile plus the gap in whole
  pixels (none without a gap), inside the view rectangle, filled with the
  module's ground. The fit rule counts the gaps; a cell's slot is its tile
  and the gap after it, so hit-testing maps a pointer in a gap to a cell,
  and scrolling, the wheel's line, the touch zoom's board point and the
  replay's pointer samples ([replay-samplers.md](replay-samplers.md)) are
  in pitches. A tile with a corner radius is laid on fresh ground when it
  is redrawn.
- **Fit rule.** The board fits the area less the frame at the largest whole
  tile up to the scale's cap, never below `MIN_TILE_SIZE`
  ([square-tile-skin.md § Minimum tile size](../domain/features/square-tile-skin.md)).
  A board that fits is centred with its frame and never scrolls; one that
  does not keeps `MIN_TILE_SIZE`, fills the area inside the frame, starts
  at its top-left corner and scrolls on the overflowing axis only. In play
  the area is the game window's board area `#c2d-board`: the room its
  chrome — the head, the counter strip, the figures panel beside or under
  the board, the foot line — leaves, so the window reduces the space the
  fit rule works in and a board that fits a bare window may scroll in it
  (Expert does in the smaller desktop windows); the frame is the kit's
  board frame component `ui-board-frame`, an inset on every side (the
  shell's `panelFrame2D`), styled by the theme stylesheet with its corner
  radius `--board-frame-radius`, which the shell sets to the module's
  `style2d.params.frameRadius` × the tile at every layout
  ([app-shell-ui.md](app-shell-ui.md) `placePanel2D`). The
  replay viewer's area is its stage, with no frame. The window's
  composition and where its panel goes on a narrow window are
  [classic2d-mode.md](classic2d-mode.md) § Game window.
- **Redraw.** `update(changed)` draws only the listed cells in view,
  through the skin's `drawTile`. A full repaint happens on a new size or
  pixel ratio, a scale change, `setGame`, a scroll, showing a hidden board
  and a theme change (the skin's `redraw` callback). On a scrolling board
  drawing is clipped to the view, and a redrawn tile under a shadow or bar
  gets its part of them back. The canvas is sized in device pixels with a
  `setTransform(ratio…)`, the ring layer sized with it; all drawing is in
  CSS pixels.
- **Scrolling.** Whole CSS pixels clamped to `0..maxScroll`, re-clamped on
  resize. The wheel scrolls only a board that overflows (a line is a tile,
  a page is the view, shift turns vertical horizontal); `ensureVisible`
  scrolls the least that shows a cell's whole tile. Each edge with hidden
  cells beyond gets an inset shadow, each overflowing axis a thin bar
  whose length and place are the visible part's.
- **Touch zoom.** `zoom` replaces the fit rule's tile with a whole tile
  clamped to `zoomRange` for the view's life (kept through a resize,
  clamped to the new range), puts the board point under the anchor and
  clamps the scroll, then repaints and reports the layout. The mode mounts
  a fresh view per game, so every game opens at the fit rule.
- **Hidden.** While hidden (the game paused) a repaint draws the
  background only and `update` draws nothing.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — fitting, scrolling or panning, hit-testing, per-cell redraw, the board
  hidden while paused.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md) — the minimum tile size.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the gap, the corner radius and the board frame.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window whose board area the fit rule works in.

## CROSS-REFERENCES

- [classic2d-board-motion.md](classic2d-board-motion.md) — feedback,
  rings, cell motion and the end effect's drawing.
- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the skin the view
  draws through and `MIN_TILE_SIZE`.
- [classic2d-input.md](classic2d-input.md) — the inputs that drive the
  pressed set, the cursor and the pan.
- [engine.md](engine.md) — the square grid's index layout, `changed` lists.
- [app-shell-board-module.md](app-shell-board-module.md), [app-shell-2d.md](app-shell-2d.md) — the board module, the board frame
  component, the board tokens and the shell's panel frame;
  [app-shell-ui.md](app-shell-ui.md) — `panelFrame2D` and `placePanel2D`.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs` the view, pitch.

## WHEN TO READ THE SOURCE

- Changing the fit rule, the cap, the gap, the frame, the layout, the
  marks or what triggers a full repaint (`boardLayout`, `gapPx`,
  `panelRect`, `clipMarks`, `repaint`, `resize`, `setScale`).
- Adding board input that competes with panning (`mountBoardView`'s pointer
  and wheel listeners, `PAN_MODIFIER`).
