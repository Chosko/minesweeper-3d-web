# Windowed fatal card on the window

## Goal
Windowed at the desktop host the root area is the display's work area and the window shows only the
measured screen frame, shifted by `--window-x` / `--window-y`. The fatal card's backdrop (`.fatal`, fixed,
inset 0) fills the root area, so its card centres in the work area, not the window: off-centre, and off the
window's edge before the first screen is measured (the window at its start-up size, shift 0) or when the
shown frame is not centred in the work area. Place the fatal card's backdrop on the window, as the toast is.

## Acceptance criteria
- Windowed at the desktop host (`:root[data-host="desktop"][data-window-state="windowed"]`), `.fatal`
  covers exactly the window: its corner at (`--window-x`, `--window-y`) in the root area, its size the
  viewport's (`100vw` × `100vh`), in its own rule block after the `.fatal` rules in `css/style.css`.
- The web, fullscreen, the no-JavaScript notice and the 404 page keep the base rule.
- `tests/components.test.mjs`'s viewport-unit check admits the windowed `.fatal` selector, in file order,
  and its title names it.
- A browser test in `tests/components-game-area.test.mjs`: on the desktop host windowed, with the viewport
  set to the reported content size, the fatal card shown fills the window and its card sits inside it,
  centred; it fails before the CSS change.
- The fatal card's catalogue entry (`css/components.css`) and the context lines naming what the windowed
  stylesheet places on the window say so.

## Decisions
- Place the backdrop on the window rather than make the fatal card a measured screen frame: the frame
  measurement (`SCREEN_FRAMES`, `bindScreenSize`) is not touched, and the card's width `min(560px, 100%)`
  already fits any window the page reports.

## Hints
- `css/style.css` (the windowed `.toast` rule near the top; the `.fatal, .noscript, .not-found` rule)
- `tests/components.test.mjs` (the viewport-unit allow-list test)
- `tests/components-game-area.test.mjs` (the windowed toast test's setup)
- `css/components.css` (catalogue entry "Fatal card")
- `.claude/context/platform.md` § The windowed window; `.claude/context/app-shell-kit-layout.md` § The root
  area; `.claude/context/testing.md` (components row)

## Drift
- `.claude/context/platform.md` § The windowed window — settles: the fatal card is placed on the window.
- `.claude/context/app-shell-kit-layout.md` § The root area — settles: the windowed fatal card joins the
  viewport-unit exceptions.
- `.claude/context/app-shell-stylesheet.md` § style.css row — settles: the message pages' entry gains the
  windowed fatal card's place (not edited here: the line carries another area's uncommitted change).
