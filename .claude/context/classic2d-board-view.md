# Classic 2D — board view

## OVERVIEW

`js/classic2d/board-view.js` lays the Classic 2D board out and draws it:
the fit rule with its floor, the board scale's cap and a page's frame, the
layout and the panel's rectangle, hit-testing, per-cell redraw from the
engine's change lists, scrolling and panning with a clipped board's shadows
and scroll bars, the hidden board while paused, pressed feedback, the focus
ring, the marked start cell, the end effect's drawing, and
`mountBoardView`, the browser wiring around it. DOM-free at import. The
area overview is [classic2d.md](classic2d.md).

## PUBLIC API

- `fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max =
  Infinity)` — the largest whole tile at which the board fits, at most
  `max`, never below `min`.
- `BOARD_SCALES` (`fit`, `100`, `125` — the settings' `boardScale`),
  `DEFAULT_BOARD_SCALE` (`100`), `TILE_CAP` (48), `tileCap(scale)` → 48 at
  100 %, 60 at 125 %, `Infinity` at Fit.
- `boardLayout({cols, rows, width, height, min, max, frame})` → frozen
  `{width, height, tile, boardWidth, boardHeight, viewX, viewY, viewWidth,
  viewHeight, offsetX, offsetY, maxScrollX, maxScrollY, scrolls}` — `frame`
  `{top, right, bottom, left, minWidth}`; the view rectangle is the board
  centred with its frame, or the area inside the frame when it scrolls.
- `panelRect(layout, frame)` → `{x, y, width, height}` — the frame around
  the view, at least `frame.minWidth` wide, never wider than the area.
- `clipMarks(layout, scroll)` → `{left, right, top, bottom, barX, barY}`;
  `SHADOW_DEPTH` (12), `SCROLLBAR` (`{thickness: 4, inset: 2}`).
- `cellAtLayout(layout, scroll, cols, rows, x, y)` → cell index or -1.
- Tokens: `BOARD_BACKGROUND` (`--color-board-frame`), `BOARD_SHADOW`,
  `BOARD_SCROLLBAR`, `CURSOR_RING` (`--color-tile-cursor`, board-only,
  distinct from the rim and lit bevel it covers; the shell's focus outlines
  keep `--color-focus-ring`), `START_MARK` (`--color-success`, the marked
  start cell's ring, under the cursor's). `PAN_MODIFIER` (`shiftKey`).
- `createBoardView({canvas, grid, createSkin, token, scale, frame,
  onLayout})` → `{resize(width, height, pixelRatio), setScale(scale),
  scale, setGame(game), update(changed), repaint(), cellAt(x, y),
  cellRect(c), scroll, scrollTo, scrollBy, pan(dx, dy), wheel(event) →
  taken, ensureVisible(c) → scrolled, setHidden(hidden), hidden,
  setPressed(cells), pressed, setCursor(c), cursor, setMark(c), mark,
  showEffect(effect, t), effect, layout, pixelRatio, canvas, dispose}` —
  `grid` the square grid ([engine.md](engine.md)); `createSkin` defaults to
  `createTileSkin`, `token` to the token reader. Positions are canvas CSS
  pixels.
- `mountBoardView({container, grid, win, onUserScroll, ...})` → the view
  plus `destroy()`: a canvas filling `container`, refitted on container
  resize and device-pixel-ratio change, scrolled by the wheel and panned by
  a primary-button drag with `PAN_MODIFIER` held.

## INTERNAL PATTERNS

- **The engine is the source.** The view keeps no cell state; every tile is
  read from the game (`cellState` / `cellNumber`) when drawn.
- **Fit rule.** The board fits the area less the frame at the largest whole
  tile up to the scale's cap, never below `MIN_TILE_SIZE`
  ([square-tile-skin.md § Minimum tile size](../domain/features/square-tile-skin.md)).
  A board that fits is centred with its frame and never scrolls; one that
  does not keeps `MIN_TILE_SIZE`, fills the area inside the frame, starts
  at its top-left corner and scrolls on the overflowing axis only. In play
  the frame is the panel's (the shell's `panelFrame2D`); the replay viewer
  has none.
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
- **Pressed feedback.** `setPressed` redraws only cells that gain or lose
  the press; a pressed cell draws as `pressed` only while closed, and
  `setGame` clears the set.
- **Focus ring.** Stroked inside its own tile after the tile, so a cell
  redraw moves or hides it; `setCursor` redraws only the cells it leaves
  and enters.
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

## CROSS-REFERENCES

- [classic2d-tile-skin.md](classic2d-tile-skin.md) — the skin the view
  draws through and `MIN_TILE_SIZE`.
- [classic2d-input.md](classic2d-input.md) — the inputs that drive the
  pressed set, the cursor and the pan.
- [engine.md](engine.md) — the square grid's index layout and the
  `changed` lists.
- [app-shell-kit.md](app-shell-kit.md), [app-shell-2d.md](app-shell-2d.md) — the board tokens and the shell's panel
  frame.
- [testing.md](testing.md) — `tests/classic2d-view.test.mjs` the board view
  and its end-effect drawing.

## WHEN TO READ THE SOURCE

- Changing the fit rule, the cap, the frame, the layout, the marks or what
  triggers a full repaint (`boardLayout`, `panelRect`, `clipMarks`,
  `repaint`, `resize`, `setScale`).
- Changing how the end effect is drawn (`showEffect`, `drawCell`,
  `drawEffectLayer`).
- Adding board input that competes with panning (`mountBoardView`'s pointer
  and wheel listeners, `PAN_MODIFIER`).
