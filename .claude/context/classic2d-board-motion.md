# Classic 2D — board feedback and motion

## OVERVIEW

What the Classic 2D board view draws over its tiles: pressed feedback, the
focus ring and the marked start cell, the cell events it plays on the
motion layer, and the end effect's drawing. `js/classic2d/board-view.js`
holds the view's side of each; `js/classic2d/motion-layer.js` is the
motion layer the view plays cell motion on. Both DOM-free at import. The
view's layout, fit rule, scrolling, redraw and `mountBoardView` are
[classic2d-board-view.md](classic2d-board-view.md); the area overview is
[classic2d.md](classic2d.md).

## PUBLIC API

`js/classic2d/board-view.js` (the view's other members are
[classic2d-board-view.md](classic2d-board-view.md) `createBoardView`'s)
- `createBoardView`'s `layer` (the motion layer's canvas, none for no
  motion) and `onMotion({cell, event, before, after})` (each cell event
  started); `setPressed(cells, event = 'press')`, `pressed`,
  `dropMotion()`, `motion`, `setCursor(c)`, `cursor`, `setMark(c)`,
  `mark`, `pulseMark()` (the ring thickens and thins `MARK_PULSE_STEPS`
  times, `MARK_PULSE_MS` apart, on the `timers` option — a first reveal off
  a forced start cell), `markPulse`, `showEffect(effect, t)`, `effect`.
- Tokens: `START_MARK` (`--color-success`, the marked start cell's ring,
  under the cursor's); `CURSOR_RING` (`--color-tile-cursor`) only while the
  skin has no board module, whose `cursor` takes its place.
  `MOTION_LAYER_CLASS` (`board-motion`).

`js/classic2d/motion-layer.js`
- `changeEvent(state, pressed)` → `{event, before}` or null: the cell event
  of an engine change list's cell from its state after the change — reveal
  (from closed, pressed or flagged), flag, unflag.
- `createMotionLayer({canvas, place, paint, frames, clip?, onSettle?,
  now?, cap?})` → `{start(cell, event, before, after, description),
  drop(cell), has(cell), cells, frame(), dropAll() → cells, resize(width,
  height, pixelRatio), dispose()}` over the cell motion player
  ([classic2d-tile-motion.md](classic2d-tile-motion.md)).

## INTERNAL PATTERNS

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
- **End effect drawing.** Over the skin's static tiles: tiles from
  `shownState`, the pulse after each tile, the confetti after all tiles
  clipped to the view; a full repaint draws the same moment. Without an
  effect a won game's closed tiles are drawn as flags (`wonState`). The
  effect itself is in [classic2d-mode.md](classic2d-mode.md).

## DOMAIN DEPENDENCIES

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the cursor ring and the 2D motion layer.
- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — pressed feedback and the focus ring.

## CROSS-REFERENCES

- [classic2d-board-view.md](classic2d-board-view.md) — the view these
  draw on: layout, pitch, redraw, hiding and its other members.
- [classic2d-tile-motion.md](classic2d-tile-motion.md) — the cell motion
  player the layer drives; [classic2d-tile-skin.md](classic2d-tile-skin.md)
  — the tile cache and its depth steps the layer draws from.
- [classic2d-input.md](classic2d-input.md) — the inputs that drive the
  pressed set and the cursor.
- [classic2d-mode.md](classic2d-mode.md) — the end effect the view draws.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs` its
  end-effect drawing; `tests/classic2d-motion.test.mjs` the motion layer
  and its event sources.

## WHEN TO READ THE SOURCE

- Changing which cell events the board plays or how an animating cell is
  drawn (`animate`, `update`, `setPressed`, `drawCell`;
  `js/classic2d/motion-layer.js` `drawCell`).
- Changing how the end effect is drawn (`showEffect`, `drawCell`,
  `drawEffectLayer`).
- Changing the focus ring or the start mark's ring and pulse (`setCursor`,
  `setMark`, `pulseMark`).
