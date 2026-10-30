# A popup over the game is the window alone

## Goal
Windowed at the desktop host, during a Classic 2D, Hexagon or Triangle game, the pause card (with its
confirm box), the results screen and the context-lost card made the window grow to the union of the game
window and the card. While such a popup shows, the window is that popup's frame alone; when it hides, the
game window's size comes back. The board status card shown while a board generates stays inside the game
window instead of sizing it.

## Acceptance criteria
- `bindScreenSize().measure()` measures only the shown frames inside a `[data-window-over]` layer while one
  shows, else every shown screen frame; it never measures a frame inside `[data-window-inside]`.
- `index.html` marks `#pause`, `#results`, `#ctx-lost`, `#ready` and `#learn-end` with `data-window-over` and
  `#c2d-status` with `data-window-inside`; `js/platform/` names no shell id.
- Showing a popup reports its size and shifts the root by its corner; hiding it reports the game window's
  size again; a popup's change of size (the confirm box) is reported.
- `UI._centreStatus2D` places `#c2d-status` in the root's own coordinates and sets `--status-room` to the game
  frame's width about the card's centre; windowed at the desktop host the card's `max-width` is that room less
  two `--space-4`.
- No re-centring of the window on resize; the web build and 3D's full-area window are unchanged.

## Decisions
- The quick fix (owner): the popup is the window, never both; rejected — a detached popup window, and keeping
  the game window's size with popups laid out inside it.
- The status card stays inside the game window rather than becoming the window (owner).
- Generic markers (`data-window-over`, `data-window-inside`) keep shell ids out of `js/platform/`.
- `_centreStatus2D` subtracts the root's own offset: the root is shifted by `--window-x/-y` and is the fixed
  card's containing block, so viewport coordinates alone misplaced the card while windowed.

## Hints
- js/platform/window-actions.js (`bindScreenSize`, `WINDOW_OVER`, `WINDOW_INSIDE`)
- index.html (the overlay layers, `#c2d-status`)
- js/ui.js (`_centreStatus2D`), css/style.css (the board status card rule)
- tests/platform-selection.test.mjs (the fake document's frames, `closest`)

## Drift
- `.claude/domain/features/steam-desktop-host.md` § The desktop window — settles: said the window is the screen's frame and nothing of a popup over it; states the popup rule (updated in this change).
- `.claude/context/platform.md` § The windowed window — diverges: said a card over the game window widens it (updated in this change).
- `.claude/context/app-shell-ui.md` § UI — settles: the status card's coordinates and room (updated in this change).
- `.claude/context/app-shell-markup.md` § status cards — settles: `data-window-inside` (updated in this change).
- `.claude/context/app-shell-stylesheet.md` § css/style.css row — settles: the windowed status card's width (updated in this change).
