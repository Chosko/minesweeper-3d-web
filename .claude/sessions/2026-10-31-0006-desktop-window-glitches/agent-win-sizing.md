# Agent handoff — win-sizing (desktop window sizing and corners)

Absorbs the investigations in `agent-win-popup-grow.md`, `agent-win-results-widen.md`
and `agent-win-corners.md` (left in place). Both owner-decided changes are committed,
not pushed. No Electron run, no deploy, no SteamCMD.

## Change 1 — a popup over a flat game is the window alone (f394166)

- `js/platform/window-actions.js` `bindScreenSize().measure()`: shown `SCREEN_FRAMES`,
  minus those inside `WINDOW_INSIDE` (`[data-window-inside]`); if any shown frame is inside
  `WINDOW_OVER` (`[data-window-over]`) only those are measured, else all. No shell ids.
- `index.html`: `data-window-over` on `#pause`, `#results`, `#ctx-lost`, `#ready`,
  `#learn-end`; `data-window-inside` on `#c2d-status`.
- `js/ui.js` `_centreStatus2D`: card placed in the root's own coordinates (subtracts the root's
  `getBoundingClientRect()` offset — the windowed root is shifted, so viewport coords alone were
  off by `--window-x/-y`) and sets `--status-room` = game frame width about the card centre.
- `css/style.css`: windowed `#c2d-status { max-width: calc(var(--status-room, 100cqw) - 2 * var(--space-4)) }`.
- `--status-room` added to the page-set lists in `tests/theme-conformance.test.mjs` and
  `tests/tokens.test.mjs`.
- Docs: domain `steam-desktop-host.md` § The desktop window (popup rule), context
  `platform.md` § The windowed window, `app-shell-ui.md`, `app-shell-markup.md`,
  `app-shell-stylesheet.md`. Spec `.claude/specs/2026-10-30-a-popup-over-the-game-is-the-window-alone.md`.
- Consequence (owner-accepted): pausing a Beginner game resizes the window to the pause card
  (wider); the board is not visible behind results/pause while windowed. Host keeps the
  top-left, so the window grows right/down (re-centring out of scope).
- Edge, not handled: the failed-board offer (`#c2d-status`) over the pause card is centred on
  the board column, while the window is the pause card; both centre on the root area, so it
  should sit inside — unverified.

## Change 2 — the window edge frame's corners and drop edge (98b84be)

- `measure()` marks the measured frame whose box fills the window box (all four sides within
  1 px) with `data-window-edge` (`WINDOW_EDGE`), clears it elsewhere, clears all in 3D full area.
- `dropEdgeOf(boxShadow)`: longest outer shadow with blur 0 and x 0, y + spread. Reads the
  computed `box-shadow` (theme has no token for the frame's 10 px; cards/results use 8 px).
  Reported height += drop; shift unchanged.
- `WINDOW_EDGE_CSS` appended to the host `<style>` with `DRAG_REGION_CSS`:
  `:root[data-window-state="windowed"] [data-window-edge] { border-radius: 8px !important; }`.
  `!important` because base stylesheets may carry no radius (components.test visual check) and
  `#results-frame`'s theme id rule would outrank a class-level rule.
- `desktop/window.js` untouched: `roundedCorners` stays Electron's default (true).
- Docs: domain "rounded corners show black" superseded; `platform.md`, `app-shell-kit-layout.md`
  § The screen frame, `css/style.css` top comment. Spec
  `.claude/specs/2026-10-30-window-edge-frame-takes-the-window-corners.md`.

## Tests

- Fast tier 2649/2649 after change 2; `tests/platform-selection.test.mjs` 43 tests (fake
  document frames gained `closest`, `toggleAttribute`, `hasAttribute`, `boxShadow`; the
  fake view `getComputedStyle`).
- Affected browser files passed. One timing flake seen once and passed on rerun:
  `mode3d-end.test.mjs` "the results screen waits for the end delay (979.5 ms)" — unrelated.

## Owner's check on the Steam build (windowed, Windows 11)

1. Classic 2D Beginner: pause → the window is the pause card only; confirm box grows it;
   Resume → the game window's size returns. Same for Hexagon and Triangle.
2. Finish a flat game → window is the results card only; Play again/menu → back to size.
3. A slow no-guess first click (large custom board): generating card sits inside the game
   window, no wider than it; window does not change size.
4. Corners on the menu, a board choice, the 2D game, pause card, results: all four corners
   one 8 px curve, no black wedges; the amber drop edge visible along the bottom, its bottom
   corners meeting Windows' rounding. Repeat after a fullscreen round-trip.
5. 3D play still fills the work area.

## Guessed / unverified

- Windows 11 corner radius taken as 8 px (owner's figure); Chrome's computed `box-shadow`
  format (`rgb(...) 0px 10px 0px 0px`, `inset` last) assumed by `dropEdgeOf` — covered by the
  fast test with that format, not by a browser test.
- A theme switch changes the drop edge without a resize; the window catches up on the next
  screen change.

## Out of scope / rejected (owner)

- Window stays opaque; no transparent window, no `setShape`, no square corners; no detached
  popup window; no popups laid out inside the game window's size; no re-centring on resize.
- Width-vs-height frame steps (compact title bar below 820 px height) kept for later.
- Neither commit pushed. Follow-up: `/pipeline-revise --catch-up` on both specs.
