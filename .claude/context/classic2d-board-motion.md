# Classic 2D — board feedback and motion

## OVERVIEW

What the Classic 2D board view draws over and for its tiles: pressed
feedback, the focus ring on the ring layer and the marked start cell, the
cell events it plays on the motion layer, and the end effect's drawing. `js/classic2d/board-view.js`
holds the view's side of each; `js/classic2d/motion-layer.js` is the
motion layer the view plays cell motion on. Both DOM-free at import. The
view's layout and fit rule are
[classic2d-board-view.md](classic2d-board-view.md), its scrolling, redraw
and `mountBoardView` [classic2d-board-canvas.md](classic2d-board-canvas.md); the area overview is
[classic2d.md](classic2d.md).

## PUBLIC API

`js/classic2d/board-view.js` (the view's other members are
[classic2d-board-canvas.md](classic2d-board-canvas.md) `createBoardView`'s)
- `createBoardView`'s `layer` (the motion layer's canvas, none for no
  motion), `overlay` (the ring layer's canvas, none for no cursor ring)
  and `onMotion({cell, event, before, after})` (each cell event started);
  `setPressed(cells, event = 'press')`, `pressed`, `dropMotion()`,
  `motion`, `setCursor(c)`, `cursor`, `overlay`, `setMark(c)`, `mark`,
  `pulseMark()` (the mark's ring drawn twice as wide and back
  `MARK_PULSE_STEPS` times, `MARK_PULSE_MS` apart, on the `timers` option —
  a first reveal off a forced start cell), `markPulse`,
  `showEffect(effect, t)`, `effect`.
- Tokens: `CURSOR_RING` (`--color-tile-cursor`) only while the skin has no
  board module, whose `cursor` takes its place. `MOTION_LAYER_CLASS`
  (`board-motion`), `RING_LAYER_CLASS` (`board-ring`).

`js/classic2d/motion-layer.js`
- `changeEvent(state, pressed)` → `{event, before}` or null: the cell event
  of an engine change list's cell from its state after the change — reveal
  (from closed, pressed or flagged), flag, unflag.
- `createMotionLayer({canvas, place, paint, frames, clip?, onSettle?,
  now?, cap?})` (`place(cell)` → the tile `{x, y, size, width?, height?}`
  — its box's corner, the tile size and the box's size, `size` × `size`
  when absent — and its centre `cx, cy` from the geometry, the box's middle
  when absent; the cell is drawn with its box where it sits from that
  centre, scaled and offset round it, its brightness pass over the whole
  box) → `{start(cell, event, before, after, description),
  drop(cell), has(cell), cells, frame(), dropAll() → cells, resize(width,
  height, pixelRatio), dispose()}` over the cell motion player
  ([classic2d-tile-motion.md](classic2d-tile-motion.md)).

## INTERNAL PATTERNS

- **Pressed feedback.** `setPressed` redraws only cells that gain or lose
  the press; a pressed cell draws as `pressed` only while closed, and
  `setGame` clears the set.
- **Focus ring.** Drawn outside its tile on the ring layer, a canvas over
  the motion layer at the board canvas's size, so it covers none of the
  tile's face and moves without redrawing a cell: `setCursor` clears the
  layer and draws the ring at the new cell, and every full repaint (a
  scroll, a resize, a theme change, hiding the board) draws it again,
  clipped to the view on a board that scrolls and absent while the board
  is hidden or the cursor out of view. With a board module it is the
  module's `cursor` — the ring round its inner band, the band's outer edge
  `radius.px` outside the tile and its corners `radius.tile` × the tile
  plus `radius.px`; without one a square ring in `CURSOR_RING` just outside
  the tile. On a hexagon or triangle board either ring follows the cell's
  outline grown outward (`growOutline`, stroked through `outlinePath`,
  [tile-art.md](tile-art.md)) instead of the square: the module's band
  each edge's same distance out, its corners `radius.tile` × the outline's
  height plus `radius.px`; the fallback straight-cornered, half its width
  out.
- **Marked start cell.** While closed and not pressed the marked cell is
  drawn as the skin's `marked` tile — the module's marked face under its
  dashed ring ([classic2d-tile-skin.md](classic2d-tile-skin.md)) — in the
  game, the menu preview and the Daily preview alike, all through
  `setMark`; any other state draws as itself. During `pulseMark` the ring
  is drawn again over the tile, twice as wide, on the board canvas — in the
  cell's glyph box on a hexagon or triangle board.
- **Cell motion.** With a `layer`, the view plays the board module's cell
  motion on the motion layer: press or chord press for the cells gaining
  the pressed set and release for closed cells losing it, and reveal, flag
  and unflag for an `update`'s change list (`changeEvent`); a loss's change
  list starts none and drops any running on its cells, the end effect
  drawing them, and Classic 2D has no solved pulse. Only cells in view
  start an event. While a cell animates its slot is drawn as bare ground
  and the layer draws the cell from the tile cache — about its geometry's
  centre, a hexagon's or triangle's box placed from it,
  offset, scaled and turned per the player's values, the face its flip
  shows, at its opacity, its brightness a second pass over the painted cell
  alone (toward white above 1, toward black below), its depth the cache's
  nearest step (which the flat style draws no differently) — clipped to
  the view; when it settles the board draws it again. Nothing on the board canvas is redrawn per frame, and the layer
  requests frames only while a cell animates. Motion is visual only:
  hit-testing, the game and every input stay on the logical slot.
  `setGame`, hiding the board, a hand-off of board art and `dropMotion()`
  (a replay's seek) drop every animation; `update(changed, {motion:
  false})` starts none.
- **End effect drawing.** Over the skin's static tiles: each tile from
  `shownState`, drawn through `drawWave` with its `waveAt` from the skin's
  board module — scaled about its centre, its light clipped to the rounded
  tile; on a hexagon or triangle board `drawWave` takes the cell's outline,
  so the scale is about the geometry's centre and the light fills the
  outline rounded by the grid's corner radius × the outline's height — then
  the confetti in the module's colours after all tiles, clipped
  to the view; without a module the tiles alone. A full repaint draws the
  same moment. Without an
  effect a won game's closed tiles are drawn as flags (`wonState`). The
  effect itself is in [classic2d-end-effect.md](classic2d-end-effect.md).

## DOMAIN DEPENDENCIES

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the cursor ring and the 2D motion layer.
- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — pressed feedback and the focus ring.
- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — cell motion around the geometry's centre, the end effect over its extent.

## CROSS-REFERENCES

- [classic2d-board-view.md](classic2d-board-view.md) — the view these
  draw on: layout and pitch; [classic2d-board-canvas.md](classic2d-board-canvas.md)
  — redraw, hiding and its other members.
- [classic2d-tile-motion.md](classic2d-tile-motion.md) — the cell motion
  player the layer drives; [classic2d-tile-skin.md](classic2d-tile-skin.md)
  — the tile cache and its depth steps the layer draws from.
- [classic2d-input.md](classic2d-input.md) — the inputs that drive the
  pressed set and the cursor.
- [classic2d-end-effect.md](classic2d-end-effect.md) — the end effect the view draws.
- [geometry.md](geometry.md) — the cell centres and outlines the layers place by.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs` its
  end-effect drawing; `tests/classic2d-motion.test.mjs` the motion layer
  and its event sources.

## WHEN TO READ THE SOURCE

- Changing which cell events the board plays or how an animating cell is
  drawn (`animate`, `update`, `setPressed`, `drawCell`;
  `js/classic2d/motion-layer.js` `drawCell`).
- Changing how the end effect is drawn (`showEffect`, `drawCell`,
  `drawEffectLayer`).
- Changing the focus ring or the start mark and its pulse (`drawRing`,
  `setCursor`, `drawCell`, `setMark`, `pulseMark`).
