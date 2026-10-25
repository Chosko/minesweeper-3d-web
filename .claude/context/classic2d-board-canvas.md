# Classic 2D — board view: the view and its mount

## OVERVIEW

The board view `js/classic2d/board-view.js` builds on its layout
([classic2d-board-view.md](classic2d-board-view.md)): `createBoardView` —
per-cell redraw from the engine's change lists, scrolling and panning with
a clipped board's shadows and scroll bars, the touch zoom, the hidden board
while paused — and `mountBoardView`, the browser wiring around it.
DOM-free at import. The view's feedback, ring, motion and effect members
are [classic2d-board-motion.md](classic2d-board-motion.md); the area
overview [classic2d.md](classic2d.md).

## PUBLIC API

- `createBoardView({canvas, grid, geometry, createSkin, token, scale, frame,
  minTile, onLayout, layer, overlay, frames, now, onMotion, timers})` (`frame` an object, or a
  function measured again at every refit) → `{resize(width, height,
  pixelRatio), setScale(scale), scale, setGame(game), update(changed,
  {motion}), repaint(), cellAt(x, y), cellRect(c), scroll, scrollTo,
  scrollBy, pan(dx, dy), wheel(event) → taken, ensureVisible(c) →
  scrolled, setHidden(hidden), hidden, layout, extent(width, height),
  pixelRatio, canvas, dispose}` (`extent` the `boardExtent` of the fit
  rule's layout in a width × height area, a touch zoom aside) plus the feedback, ring, motion and effect members of
  [classic2d-board-motion.md](classic2d-board-motion.md); `grid` the
  square grid ([engine.md](engine.md)), `geometry` its grid geometry — the
  square geometry of the grid's size when not given; a geometry built for
  another size than the grid is a `RangeError` at creation —, `minTile` the
  geometry's floor by default; `cellRect(c)` the box of the cell's outline;
  `createSkin` defaults to
  `createTileSkin`, `token` to the token reader. Positions are canvas CSS
  pixels.
- Touch zoom: `zoomRange` → `{min, max}` (the geometry's floor and the
  fit-to-view tile, the whole board inside the frame, whichever is larger),
  `boardPoint(x, y)` → `{u, v}` in the geometry's board units (pitches on
  the square geometry) from the board's top-left corner,
  `zoom(tile, x, y, point?)` → changed.
- `clipMarks(layout, scroll)` → `{left, right, top, bottom, barX, barY}`;
  `SHADOW_DEPTH`, `SCROLLBAR` (`{thickness, inset}`).
- Tokens: `BOARD_SHADOW`, `BOARD_SCROLLBAR`; `BOARD_BACKGROUND`
  (`--color-board-frame`) only while the skin has no board module, whose
  `palette.boardGround` takes its place. `PAN_MODIFIER` (`shiftKey`).
- `mountBoardView({container, grid, geometry, win, onUserScroll, framed, onMount,
  ...})` → the view plus `destroy()`: `onMount(view)` first, before the
  first fit, so the page can size the container to the board; a canvas filling `container`, then the motion
  layer's canvas (`.board-motion`) and the ring layer's (`.board-ring`)
  right after it, each over it at the same place and size and taking no
  input, refitted on container resize and
  device-pixel-ratio change, scrolled by the wheel and panned by a
  primary-button drag with `PAN_MODIFIER` held; while the board scrolls
  the container carries `data-board-clipped` and its canvases are clipped
  to the view, rounded at the theme's `--board-viewport-radius`.
  `framed` mounts the view's own `ui-board-frame` first in the container,
  lays the board out in `BOARD_FRAME` and places the frame at `panelRect`
  with its radius at every layout, hidden while the board scrolls.

## INTERNAL PATTERNS

- **The engine is the source.** The view keeps no cell state; every tile is
  read from the game (`cellState` / `cellNumber`) when drawn.
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
  — scrolling or panning, per-cell redraw, the board hidden while paused.

## CROSS-REFERENCES

- [classic2d-board-view.md](classic2d-board-view.md) — the layout, fit
  rule, pitch, geometry and board frame the view draws on.
- [classic2d-board-motion.md](classic2d-board-motion.md) — the view's
  feedback, ring, motion and effect members.
- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the skin the view
  draws through.
- [classic2d-input.md](classic2d-input.md) — the inputs that drive the
  pressed set, the cursor and the pan.
- [engine-rules.md](engine-rules.md) — `changed` lists.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the marks or what triggers a full repaint (`clipMarks`,
  `repaint`, `resize`, `setScale`).
- Adding board input that competes with panning (`mountBoardView`'s pointer
  and wheel listeners, `PAN_MODIFIER`).
