# Windowed toast on the window

## Goal
Windowed at the desktop host the toast (`#toast.toast`) is fixed to the root area — the display's work area,
`contain: layout` on the root — not the window, so on nearly every screen it lands below the window and is never
seen, and its width follows the work area. Place it on the window instead: at the window's bottom, centred on it,
fitted to its width. Fullscreen, the web and 3D play keep their placement.

## Acceptance criteria
- Windowed at the desktop host, a shown toast's bottom edge is 28 px above the window's bottom edge.
- It is centred horizontally on the window and its width is at most min(640 px, window width - 32 px).
- Fullscreen, on the web and during 3D play the toast's placement is unchanged (the 3D HUD rule still wins).
- Clicks pass through the toast (its `pointer-events: none` is unchanged).
- A browser test on the desktop host harness shows the longest toast inside the window, at its bottom, centred.
- The static viewport-unit check admits the windowed toast rule beside the 3D scene's canvas.

## Decisions
- The toast covers the window's bottom bar for its time (owner's choice over a top placement).
- The rule reads viewport units: windowed, they are the window's own size, which no CSS variable carries;
  the toast is not one of `SCREEN_FRAMES`, so reading the window's size cannot feed back into it.

## Hints
- css/style.css (the windowed desktop rules at the top; the base `.toast` rule)
- css/components.css (the catalogue's Toast entry)
- tests/components-game-area.test.mjs (desktop host harness), tests/components.test.mjs (viewport-unit check)
- js/platform/window-actions.js (`bindScreenSize`, `--window-x`, `--window-y`; read only)

## Drift
- `.claude/context/app-shell-kit-layout.md` § The root area — diverges: said the 3D scene's canvas alone keeps the window's size; the windowed toast also reads it (updated in this change).
- `.claude/context/testing.md` § components row — diverges: no viewport unit but the scene's canvas (updated in this change).
- `.claude/context/platform.md` § The windowed window — settles: where the toast sits windowed (updated in this change).
- `.claude/context/app-shell-stylesheet.md` § files table — settles: the toast's windowed place (updated in this change).
- `.claude/domain/features/shared-screen-layout.md` § toasts — settles: "centred at the bottom of the page" — windowed at the desktop host the page shown is the window.
