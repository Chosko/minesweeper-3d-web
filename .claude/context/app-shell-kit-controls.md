# App shell — component kit: controls and the selected state

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
How the kit's interactive controls behave and look: the one selected state,
a board option's and a latched toggle's chosen state, the go and stop
primary buttons, the main menu buttons' states, focus rings and the
pointer's and keys' share of the selected state. The catalogue that lists
every control's states is [app-shell-kit.md](app-shell-kit.md); the binder
that keeps the selected state on one control is
[app-shell-kit-helpers.md](app-shell-kit-helpers.md)'s.

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | each control's base states; the theme stylesheets draw them |
| `js/ui/kit-catalogue.js` | `STATES`: the selector of each state a theme styles |

## PUBLIC API

None of its own: the states are `STATES` in `js/ui/kit-catalogue.js`
([app-shell-kit.md](app-shell-kit.md) § PUBLIC API); `bindSelectOnHover` is
[app-shell-kit-helpers.md](app-shell-kit-helpers.md)'s.

## INTERNAL PATTERNS

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

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — component states, focus and controller contract.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the selected state.

## CROSS-REFERENCES

- [app-shell-kit.md](app-shell-kit.md) — the catalogue and its `STATES`, the
  gallery's forced states.
- [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — `bindSelectOnHover`
  and the segmented binder.
- [app-shell-ui.md](app-shell-ui.md) § Controller menus — `pointer-nav` and
  `pad-nav`.
- [app-shell-themes.md](app-shell-themes.md) — the theme stylesheets that
  draw every state.
- [testing-files.md](testing-files.md) — `tests/components.test.mjs` (kit, screens,
  contrast).

## WHEN TO READ THE SOURCE

- Changing a control's states or its focus ring: the base rules in
  `css/components.css` and the theme stylesheet; the selector a theme styles
  is `STATES` in `js/ui/kit-catalogue.js`.
