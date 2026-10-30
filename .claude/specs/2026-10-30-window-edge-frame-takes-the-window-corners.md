# Window edge frame takes the window's corners

## Goal
Windowed at the desktop host the screen frame kept its theme radius (26 px) and drop edge, but the opaque
black window is cut to the frame's border box and Windows 11 rounds the frameless window itself (8 px): the
top corners showed black wedges, the bottom ones black and an amber crescent, and the drop edge was cut off.
The frame that is the window takes 8 px corners, matching Windows 11's window rounding, and its drop edge is
measured into the window so it is drawn inside it.

## Acceptance criteria
- `bindScreenSize().measure()` marks the measured frame that fills the window's box with `data-window-edge`
  (`WINDOW_EDGE`) and clears the mark on every other frame; a card inside the window (`WINDOW_INSIDE`) and,
  during 3D play, every frame stay unmarked.
- The reported height adds the edge frame's drop edge, `dropEdgeOf` of its computed `box-shadow`: the
  longest outer shadow with no blur and no side offset, offset plus spread; insets and blurred elevations
  never count. The shift stays the frame's corner.
- The page's host stylesheet carries `WINDOW_EDGE_CSS`, giving `[data-window-edge]` an 8 px radius only
  while the root is `data-window-state="windowed"`, over any theme's radius.
- `desktop/window.js` sets no `roundedCorners`: Electron's default keeps Windows' rounding.
- The window stays opaque; the web build and fullscreen are unchanged.

## Decisions
- 8 px is Windows 11's window corner (owner); rejected: a transparent window, a `setShape` region, square
  frame corners.
- The radius lives in the platform layer's host stylesheet with `!important`: the base stylesheets carry no
  radius value, and a theme's id rule (`#results-frame`) would otherwise outrank it.
- The drop edge is read from the computed `box-shadow`, not hard-coded: the theme has no drop-edge token
  for the frame's 10 px (its cards' is 8 px).

## Hints
- js/platform/window-actions.js (`bindScreenSize`, `WINDOW_EDGE`, `WINDOW_EDGE_CSS`, `dropEdgeOf`)
- themes/joyful-tiles/theme.css (`.ui-frame`, `.ui-card`, `#results-frame` box-shadows; read only)
- desktop/window.js (`windowOptions`; read only)
- tests/platform-selection.test.mjs

## Drift
- `.claude/domain/features/steam-desktop-host.md` § The desktop window — diverges: said the window's rounded corners show black; the edge frame takes Windows' 8 px corners with its drop edge inside the window (updated in this change, the owner's decision).
- `.claude/context/platform.md` § The windowed window — settles: the edge mark, the corners and the drop edge in the reported size (updated in this change).
- `.claude/context/app-shell-kit-layout.md` § The screen frame — settles: the windowed frame's corners and drop edge (updated in this change).
- `css/style.css` windowed comment — diverges: named a transparent window (updated in this change).
