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
| `dev/components.html` | the kit gallery (development only): every catalogued component in every state (`data-force` previews) and every decoration slot, the overlay bar, the counters and the figures panel (with and without its progress bar and pace row, and with its head bar), the results layout `#g-results`, under the theme picked in `#g-theme` or named by `?theme=<id>` (unknown → the default) |

## PUBLIC API

`js/ui/kit-catalogue.js` — `KIT_CATALOGUE` (frozen `{name, kind, className,
selector, base, variants, parts, slots}`; a part `{name, selector, optional,
interactive, states, as}`; a slot `{name, selector}`), `STATES` (a
selectable part's `default`, `selected`, `pressed`, `disabled`, and a board
option's `chosen`; every other control's `hover` and `focused`, `checked`,
and the number field's `invalid` — `is-invalid`, the refused value a board
choice's Custom form marks), `CONTRAST_ROLES` (`surfaces`, `bodyText`,
`largeText`), `REQUIRED_TOKENS` (with `--slider-fill`, the slider's filled
share the kit sets). Beside the m1 kit, the catalogue holds the switch row
`ui-switchrow` (`text`, `label`, `help`, optional, and `switch`, the kit's
switch: label and help on the left, the switch at the right edge, the label
inked while the switch is locked) and the shared layout's components: `ui-button--danger`, `ui-wordmark`, `ui-backdrop`,
`ui-frame` (parts `head`, `back`, `title`, `action`, `body`, `foot`,
`status`, `summary`; slot `window-chrome`), `ui-mode-entry` (`entry`,
`icon`, `label`, `reason`, `last`, `lock`), `ui-option` (`option`,
`badge`, `name`, `last`, `meta`, `size`, `density`, `check`; variant
`ui-option--learn`), `ui-section-label`, `ui-key-hint`, `ui-chip`,
`ui-list-row`, `ui-scene-panel` (`stage`, `tag`, `card`, `badge`, `name`,
`note`; variant `ui-scene-panel--live`), `ui-divider`, `ui-tabs`,
`ui-checkbox`, `ui-table`, `ui-toast`, a message `ui-card`'s `icon`, and
the compositions `ui-mode-list`, `ui-options`, `ui-key-hints`, `ui-list`;
and the in-game components: the counter readout `ui-counter` (`icon`,
optional, and `digits`; `data-negative` below zero), `ui-counter-strip`
(the counters at its ends, `restart` between them), the live figure
`ui-figure` (`label`, `value`, `detail`, `bar`, `fill`; variant
`ui-figure--progress`) and the figures panel `ui-figures` (`head`,
`title`, `action` — the optional head bar —, `body`, `foot` with the
controls reminder, `live`).

## INTERNAL PATTERNS

- **The catalogue is the contract.** A screen uses a component by its class
  and markup pattern exactly as catalogued, and every theme styles it by the
  part and state selectors of `js/ui/kit-catalogue.js`; renaming either
  breaks every screen and every theme. A new component, part or slot goes
  into the head comment, `KIT_CATALOGUE`, every registered theme's
  stylesheet, the gallery (every state) and `COMPONENTS` in
  `tests/components.test.mjs`; a new composition into the catalogue and
  `COMPOSITIONS`.
- **Controls.** Every interactive control is a native `<button>`, `<input>`
  or `<a>`. Buttons, menu entries, mode entries and board options have one
  selected state — hover and focus alike, no outline; *Joyful tiles* draws
  them raised at rest, level when selected, sunk when pressed, flat when
  disabled — and `bindSelectOnHover` keeps it on one control at a time; a
  board option's chosen state (`aria-pressed`, a fill and a check) is
  drawn apart from selected, and the selected mode entry is taller, with a
  bigger icon and label; every other control keeps its own hover,
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
  unless a theme draws it. A `ui-scene-panel` is a framed region a mode's
  own renderer draws into: a Classic 2D board view, the 3D scene through
  the renderer's target rectangle while the panel is `--live`
  ([app-shell-3d.md](app-shell-3d.md) § Scene panel), or a card with an
  entry's badge.
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
