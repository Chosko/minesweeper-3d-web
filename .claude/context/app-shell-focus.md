# App shell — default focus, focus containment and the focus walk

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers how `js/main.js` places and moves focus over the screens: each
screen's default focus, the open overlay's focus containment (the one
owner of `inert`, the Tab wrap) and the focus walk (`navStep`) the D-pad
and the arrow keys share. The screen router, back stack, session history
and Back inputs are [app-shell-navigation.md](app-shell-navigation.md);
the shell navigation layer over the controller (`js/shell/navigation.js`)
is [input-controller.md](input-controller.md); the controller's menu
layers are [app-shell-ui.md](app-shell-ui.md) § Controller menus.

## PUBLIC API

`js/main.js` exports nothing. The router's `defaultFocus` and `refocus()`
are [app-shell-navigation.md](app-shell-navigation.md)'s; `focusMove`,
`inertSections`, `tabWrap` and `pickInDirection` are
[input-controller.md](input-controller.md)'s.

## INTERNAL PATTERNS

- **Focus.** Each router entry declares `defaultFocus`; the `focus`
  hand-off (`focusScreen`) resolves it inside the screen's layer, falling
  back to its first focusable control. Defaults: menu the last mode played
  (`[data-entry][data-last]`); 3D board choice `[data-preset][data-last]`;
  Classic 2D board choice `[data-size][data-last]`; placeholder its Back;
  Records the chosen board (`#records-picker [aria-checked="true"]`);
  Settings `#set-lookSensitivity`; ready `#ready-btn`; pause Cancel while
  confirming, else Play again once ended, else Resume; results `#r-again`;
  replay `REPLAY_VIEWER.defaultFocus()`; Learn 3D's end card
  `#learn-end-primary`; the Daily screen `DAILY_VIEW.defaultFocus()`;
  ctx-lost its reload button; the status cards `statusFocus`.
- **Focus containment.** `holdInert(holder, els)` is the one owner of
  `inert`: each holder (`ctxlost`, `overlay`, `confirm` in `INERT_HOLDS`)
  names its elements, and an element is inert while any holder names it,
  so one holder letting go never lifts another's. `applyContainment()`
  (every router change and focus hand-off, and any `class` change through
  a `MutationObserver`) makes every other top-level section inert behind
  the open overlay — the topmost visible layer when it is one of
  `CONTAINED` (`controls-modal`, `pause`, `learn-end`, `results`, `replay`),
  the toast kept live — and the rest of the pause card inert behind its
  confirmation (`cardBeside`: the confirmation's siblings and its column's,
  up to the card). The walk (`padFocusables`) skips inert subtrees, and a layer
  inside one is not open. Where the browser has no `inert`, Tab at the
  overlay's (or the confirmation's) edges wraps through `tabWrap`.
- **Focus walk.** `navStep(layer, items, cur, dir)` is the D-pad's and the
  arrow keys' move, `focusMove` ([input-controller.md](input-controller.md))
  with tables and `.ui-menu`s as groups, so their controls step in page
  order on Up / Down. Its spatial search (`pickInDirection`, the 45° rule):
  Up / Down treat a board choice's row of custom fields (`form .ui-row`) as
  one control, measured from the whole row and skipping its own controls;
  aim at a table's buttons by their row (`tr`), so a table is entered from
  above or below wherever its buttons sit; and a move from outside a column
  layout (`.ui-column`) enters the columns at their first control (Down) or
  last (Up), while inside one laid out as a column (Records; not Settings'
  columns below its widest windows, whose sections are placed one by one)
  it searches only `cur`'s column, so the walk leaves a column at its ends
  in page order. Up / Down into a radio group land on its one stop, the
  checked option. Left / Right on a range input step its value. The arrow keys do not walk on `playing`,
  `classic-2d`, `records`, the replay viewer or the look (`KEY_NAV_OFF`),
  which handle arrows of their own.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  screens' focus and controller navigation.

## CROSS-REFERENCES

- [app-shell-navigation.md](app-shell-navigation.md) — the router whose
  changes and focus hand-off run containment.
- [input-controller.md](input-controller.md) — the navigation layer
  (`focusMove`, `inertSections`, `tabWrap`, `pickInDirection`).
- [app-shell-ui.md](app-shell-ui.md) — the controller menus' layers.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (navigation;
  `shell-pad-walk` the walk over every screen, `shell-focus-containment`
  the inert set and Tab wrap).

## WHEN TO READ THE SOURCE

- Adding an overlay that should hold focus, or a new holder of `inert`:
  `CONTAINED`, `applyContainment` and `holdInert` in `js/main.js`.
- A control the D-pad or the arrows skip or reach in the wrong order:
  `navStep` and `padFocusables` in `js/main.js`.
- Changing a screen's default focus: its router entry's `defaultFocus`.
