# Classic 2D — board view

## OVERVIEW

`js/classic2d/board-view.js` lays the Classic 2D board out and draws it:
the fit rule with its floor, the board scale's cap and a page's frame, the
layout on the tile and the board module's gap, the panel's rectangle,
hit-testing, per-cell redraw from the engine's change lists, scrolling and
panning with a clipped board's shadows and scroll bars, the hidden board
while paused, pressed feedback, the focus ring, the marked start cell, the
cell events it plays, the end effect's drawing, and `mountBoardView`, the
browser wiring around it. `js/classic2d/motion-layer.js` is the motion
layer the view plays cell motion on. Both DOM-free at import. The area
overview is [classic2d.md](classic2d.md).

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
- Tokens: `BOARD_SHADOW`, `BOARD_SCROLLBAR`, `START_MARK`
  (`--color-success`, the marked start cell's ring, under the cursor's);
  `BOARD_BACKGROUND` (`--color-board-frame`) and `CURSOR_RING`
  (`--color-tile-cursor`) only while the skin has no board module, whose
  `palette.boardGround` and `cursor` take their place. `PAN_MODIFIER`
  (`shiftKey`), `MOTION_LAYER_CLASS` (`board-motion`).
- `createBoardView({canvas, grid, createSkin, token, scale, frame, minTile,
  onLayout, layer, frames, now, onMotion})` (`frame` an object, or a
  function measured again at every refit; `layer` the motion layer's
  canvas, none for no motion; `onMotion({cell, event, before, after})` each
  cell event started) → `{resize(width, height, pixelRatio),
  setScale(scale), scale, setGame(game), update(changed, {motion}),
  repaint(), cellAt(x, y), cellRect(c), scroll, scrollTo, scrollBy, pan(dx,
  dy), wheel(event) → taken, ensureVisible(c) → scrolled,
  setHidden(hidden), hidden, setPressed(cells, event = 'press'), pressed,
  dropMotion(), motion, setCursor(c), cursor, setMark(c), mark,
  pulseMark() (the ring thickens and thins `MARK_PULSE_STEPS` times,
  `MARK_PULSE_MS` apart, on the `timers` option — a first reveal off a
  forced start cell), markPulse,
  showEffect(effect, t), effect, layout, pixelRatio, canvas, dispose}` —
  `grid` the square grid ([engine.md](engine.md)); `createSkin` defaults to
  `createTileSkin`, `token` to the token reader. Positions are canvas CSS
  pixels.
- Touch zoom: `zoomRange` → `{min, max}` (`MIN_TILE_SIZE` and the
  fit-to-view tile, the whole board inside the frame, whichever is larger),
  `boardPoint(x, y)` → `{u, v}` in pitches, `zoom(tile, x, y, point?)` →
  changed.
- `mountBoardView({container, grid, win, onUserScroll, ...})` → the view
  plus `destroy()`: a canvas filling `container` and the motion layer's
  canvas (`.board-motion`) right after it, over it at the same place and
  size and taking no input, refitted on container resize and
  device-pixel-ratio change, scrolled by the wheel and panned by a
  primary-button drag with `PAN_MODIFIER` held.

`js/classic2d/motion-layer.js`
- `changeEvent(state, pressed)` → `{event, before}` or null: the cell event
  of an engine change list's cell from its state after the change — reveal
  (from closed, pressed or flagged), flag, unflag.
- `createMotionLayer({canvas, place, paint, frames, clip?, onSettle?,
  now?, cap?})` → `{start(cell, event, before, after, description),
  drop(cell), has(cell), cells, frame(), dropAll() → cells, resize(width,
  height, pixelRatio), dispose()}` over the cell motion player
  ([classic2d-tile-skin.md](classic2d-tile-skin.md)).

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
  `setTransform(ratio…)`; all drawing is in CSS pixels.
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
- **Pressed feedback.** `setPressed` redraws only cells that gain or lose
  the press; a pressed cell draws as `pressed` only while closed, and
  `setGame` clears the set.
- **Focus ring.** Stroked inside its own tile after the tile, so a cell
  redraw moves or hides it; `setCursor` redraws only the cells it leaves
  and enters. With a board module it is the module's ring — its colour,
  width and inner hairline, its corners following the tile's radius;
  without one a square ring in `CURSOR_RING`. The marked start cell's ring
  takes the same shape in `START_MARK`, without the hairline.
- **Cell motion.** With a `layer`, the view plays the board module's cell
  motion on the motion layer: press or chord press for the cells gaining
  the pressed set and release for closed cells losing it, and reveal, flag
  and unflag for an `update`'s change list (`changeEvent`); a loss's change
  list starts none and drops any running on its cells, the end effect
  drawing them, and Classic 2D has no solved pulse. Only cells in view
  start an event. While a cell animates its slot is drawn as bare ground
  and the layer draws the cell from the tile cache — centred on its tile,
  offset, scaled and turned per the player's values, at its opacity, its
  brightness a lighter or darker second pass, its depth the cache's
  nearest step — clipped to the view; when it settles the board draws it
  again. Nothing on the board canvas is redrawn per frame, and the layer
  requests frames only while a cell animates. Motion is visual only:
  hit-testing, the game and every input stay on the logical slot.
  `setGame`, hiding the board, a hand-off of board art and `dropMotion()`
  (a replay's seek) drop every animation; `update(changed, {motion:
  false})` starts none.
- **Hidden.** While hidden (the game paused) a repaint draws the
  background only and `update` draws nothing.
- **End effect drawing.** Over the skin's static tiles: tiles from
  `shownState`, the pulse after each tile, the confetti after all tiles
  clipped to the view; a full repaint draws the same moment. Without an
  effect a won game's closed tiles are drawn as flags (`wonState`). The
  effect itself is in [classic2d-mode.md](classic2d-mode.md).

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — fitting, scrolling or panning, hit-testing, per-cell redraw, the board
  hidden while paused.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the minimum tile size.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the gap, the corner radius, the board frame, the cursor ring and the
  2D motion layer.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window whose board area the fit rule works in.

## CROSS-REFERENCES

- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the skin the view
  draws through, its depth steps, `MIN_TILE_SIZE` and the cell motion
  player the layer drives.
- [classic2d-input.md](classic2d-input.md) — the inputs that drive the
  pressed set, the cursor and the pan.
- [engine.md](engine.md) — the square grid's index layout and the
  `changed` lists.
- [app-shell-board-module.md](app-shell-board-module.md), [app-shell-2d.md](app-shell-2d.md) — the board module, the board frame
  component, the board tokens and the shell's panel frame;
  [app-shell-ui.md](app-shell-ui.md) — `panelFrame2D` and `placePanel2D`.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs` the board view,
  its pitch and its end-effect drawing; `tests/classic2d-motion.test.mjs`
  the motion layer and its event sources.

## WHEN TO READ THE SOURCE

- Changing the fit rule, the cap, the gap, the frame, the layout, the
  marks or what triggers a full repaint (`boardLayout`, `gapPx`,
  `panelRect`, `clipMarks`, `repaint`, `resize`, `setScale`).
- Changing which cell events the board plays or how an animating cell is
  drawn (`animate`, `update`, `setPressed`, `drawCell`;
  `js/classic2d/motion-layer.js` `drawCell`).
- Changing how the end effect is drawn (`showEffect`, `drawCell`,
  `drawEffectLayer`).
- Adding board input that competes with panning (`mountBoardView`'s pointer
  and wheel listeners, `PAN_MODIFIER`).
