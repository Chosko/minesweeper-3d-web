# Drop the recipe's triangle glyph box

## Goal
A triangle tile's glyphs are set in the triangle geometry's glyph box — the
square around the inscribed circle, side / √3 (`js/geometry/tri.js`
`glyphBox`) — which the Classic 2D tile painter already takes from the
geometry. The tile recipe's own `glyphBox(outline, size)` still sets a
triangle's box at 0.55 of the side (`TRIANGLE_GLYPH`) and has no caller
outside its tests. Remove it, so the geometry's glyph box is the one source.

## Acceptance criteria
- `js/tile-art.js` exports no `glyphBox` and defines no `TRIANGLE_GLYPH`;
  `inGlyphBox(ctx, box, draw)` stays, unchanged.
- No production module imports `glyphBox` from `js/tile-art.js`.
- `tests/tile-art.test.mjs` drops the recipe glyph-box test, guards that the
  recipe exports no glyph box of its own, and its `inGlyphBox` test draws
  each glyph in boxes that do not come from the recipe (a triangle box at
  side / √3 among them).
- `.claude/context/tile-art.md` no longer names `glyphBox` or
  `TRIANGLE_GLYPH` among the recipe's exports and says glyph boxes come from
  the board's geometry.
- The fast tier and the browser tests the change reaches pass.

## Decisions
- Remove the recipe's glyph box rather than re-deriving side / √3 in it:
  nothing outside its tests calls it, and the painter takes its box from the
  geometry, so removal leaves one source of truth with the least code.

## Hints
- js/tile-art.js (`TRIANGLE_GLYPH`, `glyphBox`, `inGlyphBox`)
- js/geometry/tri.js (`glyphBox` — side / √3 on the centroid)
- js/classic2d/tile-skin.js, js/classic2d/board-view.js (take `glyphBox` from the geometry, `inGlyphBox` from the recipe)
- tests/tile-art.test.mjs (the glyph-box test and the `inGlyphBox` test)
- .claude/context/tile-art.md (the exports list)
- .claude/domain/features/hex-tri-board-art.md § Scope and non-goals

## Drift
- `.claude/domain/features/hex-tri-board-art.md` § Scope and non-goals — settles: glyphs are drawn in the geometry's glyph box, a triangle's the square around its inscribed circle (side / √3); the recipe keeps no box of its own.
- `.claude/context/tile-art.md` § exports — diverges: lists `glyphBox(outline, size)` with a triangle box at `TRIANGLE_GLYPH` of the side; the change removes both (updated in this commit).
