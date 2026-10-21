# App shell — component kit: catalogue, gallery, screen frame

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The kit's behaviour helpers (`js/ui/components.js`) are
[app-shell-kit-helpers.md](app-shell-kit-helpers.md); themes, tokens and
deploy files [app-shell-themes.md](app-shell-themes.md); the board module
and its hand-off [app-shell-board-module.md](app-shell-board-module.md). The
screens' markup in `index.html` and the shell stylesheet are
[app-shell-markup.md](app-shell-markup.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the component kit's structure (base stylesheet): `ui-*` classes, layout, sizes, the hidden default of every decoration slot; its head comment is the catalogue (element, role, accessible name, markup pattern, states, focus contract, screens built from them) |
| `js/ui/kit-catalogue.js` | the kit catalogue as data (DOM-free): every component and composition, its parts, each interactive part's states as the selectors a theme styles, its decoration slots; `CONTRAST_ROLES`; `REQUIRED_TOKENS`, the token set every theme declares |
| `dev/components.html` | the kit gallery (development only), the theme's page beside the canvas's J-Components artboard: every catalogued component in every state (`data-force` previews) and every decoration slot, and every part J-Components draws, each marked `data-canvas="<part>"` — the quiet button, Swap clicks and the Tap choice, the hint strip, the view chip and the HUD key strip (their text from `js/settings/bindings.js`, as the game's), the board status cards, the confirm box (with its heading, text only, and as a table row) and the notes, the H help card, the crosshair, aim readout and off-screen arrow on a still scene panel, the invalid field, the switch row, the icon set and a button of each size with its icon, the Settings theme list (`settingControlHtml`, bound to the applier: a pick switches the theme), and the menu's previews in their scene panels — the Classic 2D demo board by `bindMenuPreview` and its board view, the 3D demo board by the 3D renderer on the panel's own canvas (the still panel without WebGL 2); the overlay's parts carry the ids the theme draws them by and the gallery's `<style>` lays them out as `css/style.css` does in the game. Beside them the parts the artboard does not draw stay as kit coverage (the menu list, the overlay bar, the wordmark, the board frame, the banner, the link, the columns, a counter without its icon, the forced states, the field's adjusted state), with the counters, the figures panel (with its progress bar and pace row, a board with no best's — its bar, no pace row —, and with its head bar) and the results layout `#g-results`; the cards sit apart in the page grid, so no part overlaps another; all under the theme picked in `#g-theme` or named by `?theme=<id>` (unknown → the default) |

## PUBLIC API

`js/ui/kit-catalogue.js` — `KIT_CATALOGUE` (frozen `{name, kind, className,
selector, base, variants, parts, slots}`; a part `{name, selector, optional,
interactive, states, as}`; a slot `{name, selector}`), `STATES` (a
selectable part's `default`, `selected`, `pressed`, `disabled`, and a board
option's or a latched toggle's `chosen`; every other control's `hover` and `focused`, `checked`,
and the number field's `invalid` — `is-invalid`, the refused value a board
choice's Custom form marks), `CONTRAST_ROLES` (`surfaces`, `bodyText`,
`largeText`), `REQUIRED_TOKENS` (with `--slider-fill`, the slider's filled
share the kit sets). Beside the m1 kit, the catalogue holds the switch row
`ui-switchrow` (`text`, `label`, `help`, optional, and `switch`, the kit's
switch: label and help on the left, the switch at the right edge, the label
inked while the switch is locked) and the shared layout's components: `ui-button--danger`, `ui-button--quiet`
(variant `ui-button--sm`; `chosen` while a latched toggle is on),
`ui-wordmark`, `ui-backdrop`, the plain stat tile `ui-stat--tile` (variant
`ui-stat--warm`), `ui-panel--muted`, the code chip `ui-code` (its one part
`value`), the pager `ui-pager` (`button`, `current`),
`ui-frame` (parts `head`, `back`, `title`, `action`, `body`, `foot`,
`status`, `summary`; variant `ui-frame__foot--action`, the white action
foot; slot `window-chrome`), `ui-mode-entry` (`entry`,
`icon`, `label`, `reason`, `last`, `lock`), `ui-option` (`option`,
`badge`, `line` — the name and its Last played chip, the chip wrapping
under the name —, `name`, `last`, `meta`, `size`, `density`, `check`; variant
`ui-option--learn`), `ui-section-label`, `ui-key-hint`, `ui-chip`,
`ui-list-row`, the controls list `ui-controls` (`key`, `action`: the key in
plain words, its action at the right edge, a rule over each row),
`ui-scene-panel` (`stage`, `tag`, `card`, `badge`, `name`,
`note`; variant `ui-scene-panel--live`), `ui-divider`, `ui-tabs`,
`ui-checkbox`, `ui-table` (`heading`, `label` — a `th scope="row"` —,
`cell`, `figure`, `rank`, `date`, `code`; variant `ui-table--recent`),
`ui-toast`, the confirm box `ui-confirm`
(`title`, optional, and `text`; variant `ui-confirm--row`), the note
`ui-note` (variants `ui-note--warn`, `ui-note--err`), a message `ui-card`'s `icon`, and
the compositions `ui-mode-list`, `ui-options`, `ui-key-hints`, `ui-list`;
and the in-game components: the counter readout `ui-counter` (`icon`,
optional, and `digits`; `data-negative` below zero), `ui-counter-strip`
(the counters at its ends, `restart` between them), the live figure
`ui-figure` (`label`, `value`, `detail`, `bar`, `fill`; variant
`ui-figure--progress`) and the figures panel `ui-figures` (`head`,
`title`, `action` — the optional head bar —, `body`, `foot` with the
controls reminder, `live`); the icon `ui-icon`, a composition the
control around it inks; and the overlay's own parts, laid out by
`css/style.css` and drawn by the theme by their classes and ids:
`hud-panel` (variant `hud-tools`, the HUD key strip; parts `hint`
`#hint-strip`, `step`, `dismiss` `.hint-close`, `help` `#help`, `title`
`#help-title`, `foot` `.help-foot`, all optional), the view chip `chip`,
`crosshair` and `crosshair-arrow` (`halo`, `line`), `aim-readout` (`sep`)
and `touch-stick` (`knob`).

## INTERNAL PATTERNS

- **The catalogue is the contract.** A screen uses a component by its class
  and markup pattern exactly as catalogued, and every theme styles it by the
  part and state selectors of `js/ui/kit-catalogue.js`; renaming either
  breaks every screen and every theme. A new component, part or slot goes
  into the head comment, `KIT_CATALOGUE`, every registered theme's
  stylesheet, the gallery (every state) and, for a kit component with its
  structure in the base, `COMPONENTS` in `tests/components.test.mjs`; a new
  composition into the catalogue and `COMPOSITIONS`. A part the canvas's
  J-Components artboard draws is also marked in the gallery and listed in
  that test file's `CANVAS_PARTS`; every class the gallery shows is
  catalogued or the gallery's own layout, a class no theme draws.
- **Controls.** Every interactive control is a native `<button>`, `<input>`
  or `<a>`. Buttons, menu entries, mode entries and board options have one
  selected state — hover and focus alike, no outline; *Joyful tiles* draws
  them raised at rest, level when selected, sunk when pressed, flat when
  disabled, except the quiet button, flat with a border ring and sunk in
  place when selected — and `bindSelectOnHover` keeps it on one control at
  a time. A board option's chosen state (`aria-pressed`, a fill and a
  check) is drawn apart from selected, and so is a latched toggle's: a
  quiet small button carrying `aria-pressed`, drawn as the primary button
  while on. A key hint inside a button takes the button's own ink. The
  selected mode entry is taller, with a bigger icon and label. Every other
  control keeps its own hover,
  `:active`, `:focus-visible` (and `body.pad-nav :focus`) and disabled
  states, ringed from `--color-focus-ring` with the `--color-focus-halo`
  halo, which replaces a control's own inset border while it is focused. A
  board option is selected by a key's focus (`:focus-visible` outside
  `body.pointer-nav`), the controller's, or, while the pointer is in use,
  by being the focused option under it — so one its screen focuses when
  opened by the mouse keeps its resting look. The shell sets
  `pointer-nav` on mouse input and drops it on a key
  ([app-shell-ui.md](app-shell-ui.md)).
  `data-force` previews a state (gallery only). Only the selected segmented
  option is in the Tab order.
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
  `index.html` (Restart, Pause, Swap clicks, the message cards' badges and
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
  may carry an inline Watch `ui-link`. `ui-panel--muted` is a sunk panel
  with no border and no drop. The table rules each full row, sets row
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
- **The screen frame.** Every non-game screen is a `ui-frame` on a
  `ui-backdrop`, sized to its content and never larger than the window: a
  head (Back with its back key hint, the title centred, an optional
  action), a body that scrolls vertically while head and foot stay in
  view, and a foot — a status line, or a bottom bar of the selection's
  summary beside the screen's actions; the `window-chrome` slot is hidden
  unless a theme draws it. The head and foot, their titles and the small
  buttons follow the window-size steps — desktop, compact for the smaller
  desktop windows, touch for a phone upright or sideways — whose values the
  theme stylesheet holds; the title stays on one line. A screen's bar of
  actions (the board choices, Daily, results) is the white action foot
  `ui-frame__foot--action`, a bottom bar on a phone (the results' in flow
  at the card's end); the Classic 2D game
  window keeps the head-coloured foot. A `ui-scene-panel` is a framed region a mode's
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
  each described, element by element and by window size, at the end of the
  head comment of `css/components.css`; the gallery shows the results
  layout. Their markup, the ids the shell wires and the pointer sizes are
  [app-shell-markup.md](app-shell-markup.md).

## DOMAIN DEPENDENCIES

- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the kit catalogue and the per-theme gallery.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — component set, states, focus and controller contract, the kit-built
  screens.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the shared layout's components, the selected state, the screen frame,
  the scene panel and every screen composed in them.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the counter readouts, the figures panel and the in-game screens built
  from them.

## CROSS-REFERENCES

- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — the binders and
  formats behind the catalogued components.
- [app-shell-themes.md](app-shell-themes.md) — the theme stylesheets that
  style every catalogued part and state, `REQUIRED_TOKENS`' use.
- [app-shell-markup.md](app-shell-markup.md) — the screens built from the kit.
- [settings-page.md](settings-page.md) — the theme list's markup and binder
  the gallery shows; [app-shell-menu.md](app-shell-menu.md) — the menu's
  preview binder and demo boards the gallery draws;
  [settings-bindings.md](settings-bindings.md) — the strips' text.
- [app-shell-ui.md](app-shell-ui.md) — the `UI` methods that feed the
  counters and the figures panels.
- [testing.md](testing.md) — `tests/theme-registry.test.mjs` (the kit
  catalogue), `tests/components.test.mjs` (kit, screens, contrast),
  `tests/components-game3d.test.mjs` (the 3D overlay in a browser).

## WHEN TO READ THE SOURCE

- Adding or changing a component or composition, or building a screen from
  the kit: the catalogue at the head of `css/components.css` and the
  gallery section in `dev/components.html`.
- A screen's composition by window size: the end of the head comment of
  `css/components.css`.
