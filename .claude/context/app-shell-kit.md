# App shell — component kit: catalogue, gallery, selected state

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The kit's behaviour helpers (`js/ui/components.js`) are
[app-shell-kit-helpers.md](app-shell-kit-helpers.md); themes, tokens and
deploy files [app-shell-themes.md](app-shell-themes.md); the board module
and its hand-off [app-shell-board-module.md](app-shell-board-module.md). The
shared layout's components — icons, confirm box and notes, surfaces, the
screen frame, the message card — and the screens composed in the kit are
[app-shell-kit-layout.md](app-shell-kit-layout.md); the screens' markup is
[app-shell-markup.md](app-shell-markup.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the component kit's structure (base stylesheet): `ui-*` classes, layout, sizes, the hidden default of every decoration slot; its head comment is the catalogue (element, role, accessible name, markup pattern, states, focus contract, screens built from them) |
| `js/ui/kit-catalogue.js` | the kit catalogue as data (DOM-free): every component and composition, its parts, each interactive part's states as the selectors a theme styles, its decoration slots; `CONTRAST_ROLES`; `REQUIRED_TOKENS`, the token set every theme declares |
| `dev/components.html` | the kit gallery (development only), the theme's page beside the canvas's J-Components artboard: every catalogued component in every state (`data-force` previews) and every decoration slot, and every part J-Components draws, each marked `data-canvas="<part>"` — the quiet button, the go confirm button, the title bar's game logo and its Quit as a stop button, the board choice's panel toggle (unpinned and pinned) and its drawer (closed and open), Swap clicks and the Tap choice, the hint strip, the view chip and the HUD key strip (their text from `js/settings/bindings.js`, as the game's), the board status cards, the confirm box (with its heading, text only, and as a table row) and the notes, the H help card, the crosshair, aim readout and off-screen arrow on a still scene panel, the invalid field, the switch row, the icon set and a button of each size with its icon, the Settings theme list (`settingControlHtml`, bound to the applier: a pick switches the theme), the main menu buttons in their states (`data-canvas` `play-tile`, `small-entry`, `phone-row`; the Classic 2D tile's board by `mountTilePreviews`), and the scene panels the Daily screen and a 3D replay draw into — the Classic 2D demo board by `bindMenuPreview` and its board view, the 3D demo board by the 3D renderer on the panel's own canvas (the still panel without WebGL 2); the overlay's parts carry the ids the theme draws them by and the gallery's `<style>` lays them out as `css/style.css` does in the game. Beside them the parts the artboard does not draw stay as kit coverage (the menu list, the overlay bar, the board frame, the banner, the link, the columns, a counter without its icon, the forced states, the field's adjusted state), with the counters, the figures panel (with its progress bar and pace row, a board with no best's — its bar, no pace row —, and with its head bar) and the results layout `#g-results`; the cards sit apart in the page grid, so no part overlaps another; all under the theme picked in `#g-theme` or named by `?theme=<id>` (unknown → the default) |

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
(variant `ui-button--sm`; `chosen` while a latched toggle is on), the
primary button's colour variants `ui-button--go` and `ui-button--stop`,
the game logo `ui-logo` (`word`, `letter`), `ui-backdrop`, the plain stat tile `ui-stat--tile` (variant
`ui-stat--warm`), `ui-panel--muted`, the code chip `ui-code` (its one part
`value`), the pager `ui-pager` (`button`, `current`),
`ui-frame` (parts `head` — the title bar —, `back`, `logo`, the window
buttons `window`, `minimise`, `fullscreen` and `quit` — the stop button —,
`heading`, `title`, `action`, `body`, `foot`, `status`, `summary`; variant
`ui-frame__foot--action`, the white action foot; slot `window-chrome`), the
main menu buttons — `ui-play-tile`
(`tile`, `side`, `top`, `icon`, `text`, `label`, `reason`, `lock`,
`preview`, `art`, `badge`, `still`, `calendar`; variants
`ui-play-tile--row`, the phone row, and the preview's grounds
`ui-play-tile__preview--light` and `--locked`) and `ui-small-entry`
(`entry`, `icon`, `label`) —, `ui-option` (`option`,
`badge`, `line` — the name and a state chip, the Daily screen's, wrapping
under the name —, `name`, `chip`, `meta`, `size`, `density`, `check`; variant
`ui-option--learn`), the board choice panel `ui-drawer` (`bar` (`chosen`
while open), `label`, `chevron`, `body`), `ui-section-label`, `ui-key-hint`, `ui-chip`,
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
  or `<a>`. Buttons, menu entries, main menu buttons and board options have one
  selected state — hover and focus alike, no outline; *Joyful tiles* draws
  them raised at rest, level when selected, sunk when pressed, flat when
  disabled, except the quiet button, flat with a border ring and sunk in
  place when selected — and `bindSelectOnHover` keeps it on one control at
  a time. A board option's chosen state (`aria-pressed`, a fill and a
  check) is drawn apart from selected, and so is a latched toggle's — Swap
  clicks, the touch view modes, Show 3BV, Free camera, the board choice
  panel toggle: a quiet small button carrying `aria-pressed`, quiet while
  off and the pressed look while on, never a colour.
  The primary button is always a go (green: confirm or go forward) or a
  stop (red: the title bar's Quit), each resting in a stronger pastel and
  taking its full colour when selected; Pause is a secondary button, and
  a confirm button's key hint is `confirm`, never Enter. A key hint inside
  a button takes the button's own ink. A main menu button rests in a
  pastel of its colour on the pastel edge (a small entry the neutral raised
  surface) and takes its full colour selected (a small entry the stronger
  neutral), keeping its size; a locked one darkens. Every other
  control keeps its own hover,
  `:active`, `:focus-visible` (and `body.pad-nav :focus`) and disabled
  states, ringed from `--color-focus-ring` with the `--color-focus-halo`
  halo, which replaces a control's own inset border while it is focused. A
  board option is selected by a key's focus (`:focus-visible` outside
  `body.pointer-nav`), the controller's, or, while the pointer is in use,
  by being the focused option under it — so one its screen focuses when
  opened by the mouse keeps its resting look. The shell sets
  `pointer-nav` on mouse input and drops it on a key
  ([app-shell-ui.md](app-shell-ui.md) § Controller menus).
  `data-force` previews a state (gallery only). Only the selected segmented
  option is in the Tab order.
- **Shared layout.** The icon set, the confirm box and the notes, the
  surfaces, the slider's fill, the screen frame, the message card and the
  screens composed in the kit are
  [app-shell-kit-layout.md](app-shell-kit-layout.md).

## DOMAIN DEPENDENCIES

- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the kit catalogue and the per-theme gallery.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — component set, states, focus and controller contract, the kit-built
  screens.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the shared layout's components and the selected state.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the counter readouts, the figures panel and the in-game screens built
  from them.

## CROSS-REFERENCES

- [app-shell-kit-layout.md](app-shell-kit-layout.md) — the shared layout's
  components and the screens composed in them.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — the binders and
  formats behind the catalogued components.
- [app-shell-themes.md](app-shell-themes.md) — the theme stylesheets that
  style every catalogued part and state, `REQUIRED_TOKENS`' use.
- [app-shell-markup.md](app-shell-markup.md) — the screens built from the kit.
- [settings-page.md](settings-page.md) — the theme list's markup and binder
  the gallery shows; [app-shell-menu-preview.md](app-shell-menu-preview.md) — the play
  tiles' previews, the scene panel binder and the demo boards the gallery draws;
  [settings-bindings.md](settings-bindings.md) — the strips' text.
- [app-shell-hud.md](app-shell-hud.md) — the counters and the figures
  panels the in-game components show.
- [testing.md](testing.md) — `tests/theme-registry.test.mjs` (the kit
  catalogue), `tests/components.test.mjs` (kit, screens, contrast),
  `tests/components-game3d.test.mjs` (the 3D overlay in a browser).

## WHEN TO READ THE SOURCE

- Adding or changing a component or composition, or building a screen from
  the kit: the catalogue at the head of `css/components.css` and the
  gallery section in `dev/components.html`.
