# App shell — component kit: shared layout, icons, screen frame

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
How the catalogued components of the shared layout behave and look: the
icon set and the button's leading-icon slot, the confirm box and the
notes, the surfaces (stat tile, muted panel, table, pager, code chip), the
slider's fill, the root area every screen is laid out in, the screen frame
with its title bar and the game logo, the
board choice panel and its drawer, the scene panel, the message card and
its scrim, and the screens composed in the kit. The catalogue itself, its
data, the gallery and the selected-state contract are
[app-shell-kit.md](app-shell-kit.md); the helpers that build and bind these
parts are [app-shell-kit-helpers.md](app-shell-kit-helpers.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the root area (the root element as the size container `root`), the base structure and metrics of each component below; the end of its head comment composes every screen |

## PUBLIC API

None of its own: the components' classes and parts are `KIT_CATALOGUE`'s
([app-shell-kit.md](app-shell-kit.md) § PUBLIC API); their builders and
binders (`ICONS`, `setNote`, `createCodeChip`, `bindSliderFill`) are
[app-shell-kit-helpers.md](app-shell-kit-helpers.md)'s.

## INTERNAL PATTERNS

- **The icon set and the leading-icon slot.** Every icon comes from one
  source, `ICONS` in `js/ui/components.js`
  ([app-shell-kit-helpers.md](app-shell-kit-helpers.md)), the canvas's
  stroke icons path for path, drawn in `currentColor` so the button's ink
  colours them. A button's icon sits before its label, set off by the
  button's gap; the slot's sizes by button size (sm and md, lg, a code
  chip's buttons) are the base's `.ui-icon` rules. The icon is
  `aria-hidden` and the label stays the name; an icon-only button carries
  `aria-label`. The helpers that draw an icon into a button are
  [app-shell-kit-helpers.md](app-shell-kit-helpers.md)'s; a button in
  `index.html` names its set icon with `data-icon`. The icons inline in
  `index.html` (the 3D overlay's Restart and Pause, Swap clicks, the message cards' badges and
  the fatal card's Reload) are svg outside the set.
- **The confirm box and the notes.** Every confirmation is a `ui-confirm`
  — the danger fill, an optional heading, its text, then a
  `ui-actions--row` of the danger action beside Cancel: the pause card's,
  Settings' Reset all data, and the Records replay delete as a
  `ui-confirm--row` filling a table row's one cell. A refusal, a hint or a
  notice is a `ui-note--warn`, a refused value or a failure a
  `ui-note--err`, each led by an icon of the set named by its `data-icon`
  (the info icon for a notice, the warning icon for a refusal or a
  failure) in the note's ink; a script writes its text with `setNote`
  ([app-shell-kit-helpers.md](app-shell-kit-helpers.md)), which also turns
  the board code field's line between a plain line and a note. An
  accepted code's line is `ui-text--success`.
- **The surfaces.** The stat tile `ui-stat--tile` is plain by default
  (white, its border, no drop) with `ui-stat--warm` the cream tile on its
  edge; `data-new-best` rings it inside in the head colour, and its note
  may carry an inline Watch `ui-link`. `ui-panel--muted` is the panel on
  the sunk fill, keeping the panel's border and drop edge. The table rules each full row, sets row
  labels bold and their values in the monospace face, and on a phone
  stacks a details table's labels (a table with no `thead`) over their values. The pager's buttons are
  lighter than the kit's buttons, the current page an ink fill. The code chip has
  one shape for every caller, built by `createCodeChip`
  ([app-shell-kit-helpers.md](app-shell-kit-helpers.md)): no inline label,
  its *Board code* label a `ui-section-label` outside it, running the full
  width on a phone. Their metrics live in the base and the theme stylesheets.
- **The slider's fill.** The theme draws a slider's track filled from its
  start to the thumb by `--slider-fill`, which the kit's fill updater
  (`bindSliderFill`, [app-shell-kit-helpers.md](app-shell-kit-helpers.md))
  sets on the input; the kit's slider binder and the Settings and pause
  controls' binder both install it.
- **The root area.** Every screen is laid out in the available area: the
  page's root element is the size container `root` (`css/components.css`),
  the browser window on the web and, at the desktop host, the work area of
  the display the window is on — the whole screen in fullscreen — which
  `bindAvailableArea` sizes it to ([platform.md](platform.md)). The desktop
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
  inside the window ([platform.md](platform.md) § The windowed window). Its head is the game's title bar on every one but
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
  [platform.md](platform.md)). A phone's head holds only Back and the
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
- **The board choice panel.** A board choice's settings, Custom form, code
  field and bests sit in a `ui-drawer` beside the Board list, behind a
  `ui-divider--vertical` shown only while it is open; the window widens
  for it and stays centred. On a desktop window the drawer's bar is hidden
  and the panel toggle in the heading pins it, drawn sunk while pinned; on
  a phone the toggle is gone and the drawer is a full-width raised bar
  under the Board list that, open, lies flat on a cream band ending with a
  line, its label naming what it holds. Its behaviour is
  [classic2d.md](classic2d.md) § Board choice panel.
- **Scene panels.** A `ui-scene-panel` is a framed region a mode's
  own renderer draws into: a Classic 2D board view, the 3D scene through
  the renderer's target rectangle while the panel is `--live`
  ([app-shell-3d.md](app-shell-3d.md) § Scene panel), or a card with an
  entry's badge.
- **The message card.** A `ui-card` is a column, its badge, title, line and
  actions an even gap apart; the title and line directly in it take the
  message card's type, the line in ink. The cards over the game sit on one
  scrim, the theme's backdrop colour unblurred, over 2D and 3D alike.
- **Screens** composed in the kit — the main menu, both board choices,
  Daily, the placeholder, Records, Settings, the Classic 2D game window,
  the 3D game overlay, the board status cards, the pause card with its
  confirmation, the 3D ready card, the context-lost card, the Learn 3D end
  card, the results screen, the replay viewer, the toast, the fatal card,
  the no-JavaScript notice and the 404 page — are
  each described, element by element and by size step, at the end of the
  head comment of `css/components.css`; the gallery shows the results
  layout. Their markup, the ids the shell wires and the pointer sizes are
  [app-shell-markup.md](app-shell-markup.md).

## DOMAIN DEPENDENCIES

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the shared layout's components, the screen frame, the scene panel and
  every screen composed in them.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit-built screens.

## CROSS-REFERENCES

- [app-shell-kit.md](app-shell-kit.md) — the catalogue these components are
  entries of, and the gallery that shows them.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — the icon set,
  `setNote`, the code chip and the slider's fill updater.
- [app-shell-markup.md](app-shell-markup.md) — the screens' markup;
  [app-shell-stylesheet.md](app-shell-stylesheet.md) — their placement.
- [app-shell-3d.md](app-shell-3d.md) § Scene panel — the 3D scene in a
  panel.
- [testing.md](testing.md) — `tests/components.test.mjs` (kit, screens,
  contrast).

## WHEN TO READ THE SOURCE

- A screen's composition by size step: the end of the head comment of
  `css/components.css`; the root area, its paragraph there.
- A component's metrics by size step: the base and the theme stylesheets.
- How the desktop host sizes the root area and settles the touch step's
  queries: `bindAvailableArea` and `bindAreaMedia` in
  `js/platform/window-actions.js`.
