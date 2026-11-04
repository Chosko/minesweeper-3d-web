# App shell — component kit: root area and screen frame

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
How the root area every screen is laid out in and the screen frame with its
title bar and the game logo behave and look. The kit's other shared layout
components are [app-shell-kit-layout.md](app-shell-kit-layout.md); the
catalogue, its data and the gallery are [app-shell-kit.md](app-shell-kit.md);
the helpers that build and bind these parts are
[app-shell-kit-helpers.md](app-shell-kit-helpers.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the root area (the root element as the size container `root`), the screen frame's base structure and metrics |

## PUBLIC API

None of its own: the frame's classes and parts are `KIT_CATALOGUE`'s
([app-shell-kit.md](app-shell-kit.md) § PUBLIC API); their helpers
(`matchRootArea`, `fitTitleBar`, `applyLogos`, `bindWindowButtons`) are
[app-shell-kit-helpers.md](app-shell-kit-helpers.md)'s.

## INTERNAL PATTERNS

- **The root area.** Every screen is laid out in the available area: the
  page's root element is the size container `root` (`css/components.css`),
  the browser window on the web and, at the desktop host, the work area of
  the display the window is on — the whole screen in fullscreen — which
  `bindAvailableArea` sizes it to ([platform-window.md](platform-window.md)). The desktop
  and compact size steps and every rule sized from the window resolve
  against it as `@container root` queries and container units, never as
  window queries or viewport units — the 3D scene's canvas and the toast
  and the fatal card placed on the window while windowed at the desktop
  host alone read the window's size. The touch step (a phone upright or sideways) keeps its
  `@media` queries on the browser window; at the desktop host
  `bindAreaMedia` settles them against the work area, so the desktop host
  never takes the phone layout. A script that picks a layout by size reads
  the root area through `matchRootArea`
  ([app-shell-kit-helpers.md](app-shell-kit-helpers.md)).
- **The screen frame.** Every non-game screen and the Classic 2D game
  window is a `ui-frame` on a `ui-backdrop`, centred at its natural size —
  the size its artboard draws at the size step, or its content's —,
  shrinking to fit a smaller root area and never growing past it on a
  larger one; windowed at the desktop host no backdrop is drawn and the
  window is the frame, its corners the window's own and its drop edge
  inside the window ([platform-window.md](platform-window.md) § The windowed window). Its head is the game's title bar on every one but
  the results card, which keeps a head of its own: Back at the start as
  its arrow icon alone (none on the main menu; the game window holds its
  own controls there, [app-shell-hud.md](app-shell-hud.md)), the game logo
  `ui-logo` between (centred while both sides fit equal; a head fitted to
  its width, the game window's, gives Back's side up first, then scales the
  logo down to a floor and hides it, `fitTitleBar`) — MINESWEEPER a game colour per letter and 3D in
  yellow, a white outline and a short darker extrusion, drawn by
  `applyLogos` — and at the end the window buttons Minimise, Fullscreen /
  Windowed and Quit (the stop button), each icon-only with a tooltip and
  an accessible name. On the web they press and do nothing; a desktop host
  the platform layer's `capabilities` report attaches their actions
  (`bindWindowButtons`, [app-shell-kit-helpers.md](app-shell-kit-helpers.md);
  [platform-window.md](platform-window.md)). A phone's head holds only Back and the
  logo. The screen's name is the body heading `ui-frame__heading`, with the
  screen's control at its right in `ui-frame__action` (Records' mode
  switch, a board choice's panel toggle); the main menu has none. Then a
  body that scrolls vertically while head, heading and foot stay in view,
  and a foot — a status line, or a bar of the screen's actions; the
  `window-chrome` slot is hidden unless a theme draws it. The head, the
  logo, the heading and foot, their titles and the small and large
  buttons follow the size steps — desktop, compact for the smaller
  available areas, touch for a phone upright or sideways — read from the
  root area, whose values the theme stylesheet holds; the title stays on
  one line. A screen's bar of actions
  (the board choices, Daily, results) is the white action foot
  `ui-frame__foot--action`, a bottom bar on a phone (the results' in flow
  at the card's end); the Classic 2D game window keeps the head-coloured
  foot.

## DOMAIN DEPENDENCIES

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the screen frame, its title bar and the size steps.

## CROSS-REFERENCES

- [app-shell-kit-layout.md](app-shell-kit-layout.md) — the kit's other
  shared layout components and the screens composed in the kit.
- [app-shell-kit.md](app-shell-kit.md) — the catalogue the frame is an entry
  of, and the gallery that shows it.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — `matchRootArea`,
  the logo, `fitTitleBar` and the window buttons' binder.
- [platform-window.md](platform-window.md) — the desktop window: the root
  area sized to the work area, the windowed window.
- [app-shell-hud.md](app-shell-hud.md) — the game window's own controls.
- [testing-files.md](testing-files.md) — `tests/components.test.mjs` (kit, screens,
  contrast).

## WHEN TO READ THE SOURCE

- The root area: its paragraph in the head comment of `css/components.css`.
- The frame's metrics by size step: the base and the theme stylesheets.
- How the desktop host sizes the root area and settles the touch step's
  queries: `bindAvailableArea` and `bindAreaMedia` in
  `js/platform/window-actions.js`.
