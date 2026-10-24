# Joyful tiles compact large-button font and muted panel edge

## Goal
Two fixes from a design check of the build against the Claude Design canvas
"Minesweeper 3D Screens" (Joyful tiles). At the compact window step
(1366 × 768, 1024 × 768) the canvas draws every large button's label at
21 px (`.jt--compact .j-btn--lg`) where the build draws 24 px. And the canvas
draws the muted panel — the 3D ready card's "How 3D works", the Custom form,
the Records overall block, the pause card's settings — as a panel on the sunk
fill that keeps the panel's 2 px inset border and 6 px bottom edge, where the
build draws it flat.

## Acceptance criteria
- The theme's compact size step (`@media (max-width: 1439px), (max-height: 820px)`)
  sets `.ui-button--lg` to a 21 px font, for every large button at that step.
- The touch step's large go button keeps its own 19 px font, so a phone draws
  the 3D ready card's play button at 19 px; the desktop step keeps 24 px.
- The large go button's compact height and padding are unchanged (52 px,
  10px 28px).
- `.ui-panel--muted` keeps the sunk fill and no longer clears the panel's
  shadow: it draws the panel's 2 px inset border in `--color-border` and its
  `--edge-md` bottom edge in `--color-edge`.
- The kit catalogue's muted-panel entry (`css/components.css` head comment)
  describes the border and edge.
- The fast tier asserts both rules; the 3D ready card's browser test checks
  the play button's font at each card size and the "How 3D works" panel's
  border and edge.

## Decisions
- Only the large-button font is added at the compact step: the canvas's
  compact `min-height: 54px; padding: 12px 22px` for a non-go large button is
  outside this change (no non-go large button ships in the build).
- The muted panel takes the border and edge from `.ui-panel`'s own rule rather
  than repeating it, so the two stay one shape.

## Hints
- `themes/joyful-tiles/theme.css` (the surfaces' `.ui-panel--muted`; the
  frame's compact size step)
- `css/components.css` (the catalogue's `ui-panel` Muted entry)
- `tests/components.test.mjs` (the muted panel test; the frame's size steps test)
- `tests/components-ready.test.mjs` (the ready card at each size)

## Drift
- `.claude/domain/features/shared-screen-layout.md` § the kit's components (the muted panel) — diverges: says the muted panel is a sunk surface with no border and no drop; the change keeps the panel's border and drop edge.
- `.claude/context/app-shell-kit-layout.md` § The surfaces — diverges: says `ui-panel--muted` is a sunk panel with no border and no drop; the change keeps both.
- `.claude/domain/features/shared-screen-layout.md` § the frame size steps / Size steps — settles: the compact step's values include the large buttons' 21 px font.
- `.claude/context/app-shell-kit-layout.md` § Screen frame (window-size steps) — settles: the compact step's buttons include the large button's font.
