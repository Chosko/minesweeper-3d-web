# App shell — the Classic 2D mode's wiring in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `FLOW_2D`, the shell side `js/main.js` hands to
`createClassic2DMode`, and the three flat modes built on it — Classic 2D,
Hexagon and Triangle; the mode, board view, input, board choice and flat
mode configuration themselves are [classic2d.md](classic2d.md).

## INTERNAL PATTERNS

- **Flat modes.** `mode2d` is Classic 2D's instance, over `CLASSIC_2D`
  with `LAST_CHOICE_2D` and `CHOICE_2D`. `flatMode(config, prefix)` builds
  Hexagon's and Triangle's (`HEX_MODE`, `TRI_MODE`): its own last board
  choice over its configuration, a mode instance registered under the
  configuration's id with `FLOW_2D` whose `openBoardChoice` routes to its
  own board choice, and the board choice binder over `#<prefix>-choice`
  with its code resolver and bests, keeping its `state()` for the way back
  from Records. `FLAT_2D` maps every flat mode's id to its mode and last
  choice; `flat2D()` is the active one, or null. Everything the window
  drives goes through `flat2D()` — the board area, status card and its
  offers, pause, the controller, the frame loop's `tick()`, the board
  scale, the results' Play again once the mode was left — so only one
  flat game is open at a time, in the one Classic 2D window and its
  screen `classic-2d`. The Tap choice's value is set on every flat mode at
  once. The pause card's help and the first-use hints are Classic 2D's for
  all three ([app-shell-help.md](app-shell-help.md)).
- **Button swap.** `BUTTON_SWAP` (`createButtonSwap`) is the page's one
  mouse button swap, handed as `buttonSwap`: kept across games, off again on
  reload, toggled by `onToggleSwap` (`#hud-swap` at the right of the game window's foot) and
  mirrored by `ui.setSwap`.
- **Routes.** Each flat mode's board choice is its own screen —
  `classic-2d-choice`, `hexagon-choice`, `triangle-choice` — opened on its
  last board choice (each loaded at boot by its mode's `loadChoice()`),
  its `show` warming that mode's generation client; `show` routes every
  flat game to `classic-2d`, whose Back is `backGame`.
- **Board area and panel.** The board area is `#c2d-stage`, filled by the
  view's container `#c2d-board`; the board opens at the `boardScale` setting (`scale`) inside the board frame (`frame`,
  `BOARD_FRAME`). The window hugs its board: `ui.sizeBoard2D` measures the
  room its chrome leaves in the available area — the root area, the work
  area at the desktop host, never the desktop window's own size — with the
  window filling it (`c2d--measure`) and sizes `#c2d-stage` to the view's `extent` there, giving back what
  the body or the board column then overflows (below the kit breakpoint the figures row under the board
  wraps at the board's width, never setting the window's), then fits the title
  bar to the board column (`ui.fitTitle2D`; again when a font loads) — at each fresh view
  before its first fit (`mounted`), on every change of `#c2d`'s size (a
  `ResizeObserver`), and a frame after each refit (`sizeSoon2D`, never
  inside the board's own resize callback). Each refit places the frame through `layout`
  (`panelRect`, `ui.placePanel2D` with the layout's `frameRadius`; none on a
  clipped board) and tells whether the board scrolls: the first clipped board shows the
  one-time scroll hint until dismissed or scrolled (`scrolled`), kept as
  `scrollHint` in `shell.firstUse` ([app-shell-help.md](app-shell-help.md)
  § First-use hints). A `boardScale` change reaches the open board and the
  replay viewer at once.
- **Live figures panel.** `LIVE_FIGURES` (`createFiguresPanel`,
  `js/shell/live-figures.js`) is the panel's open state, loaded before the
  first screen and handed to the window (`ui.setFigures2D`);
  `onToggleFigures` (`toggleFigures`) flips it, stores it and refits the
  board (`size2D`), the window shrinking to the board while closed.
- **Game window.** `board` names the board in the window's foot line, the
  title then the board line (`ui.setBoard2D`) and reads its bests once per game (`bests2D`,
  `RECORDS.bests(identity)`); the counters and clicks come from `hud`, the
  live figures from `figures` (`ui.updateFigures2D` against `bests2D`),
  both fed by the active flat mode's `tick()` every frame, which also drives the movement sampler
  ([replay-samplers.md](replay-samplers.md)) and draws the end effect during the 2D end delay
  (its `ending`, read through `endDelay()`).
- **Pause.** The paused screen's `setBoardHidden` hides the 2D board;
  `pauseInfo`, `gameInProgress` and `gameOver` read the active flat mode's
  `status()`.
- **Status card.** `board2d` holds `{generating, failure, progress}` from
  `FLOW_2D`; `showStatus2D` shows `#c2d-status` — the generating card on
  the board only, the offer there and over the pause card — and focuses the
  offer (`statusFocus`: Retry, or Play a standard board once
  `failure.count` shows a repeated failure). The generating card focuses Cancel unless
  the focus is already on its Cancel or Play a standard board;
  `FLOW_2D.progress` redraws it (`drawStatus2D`) without moving focus. An
  offer answered over the pause card resumes first (`answer2D`); Main menu
  is `PAUSE.toMenu()`.
- **Controller.** On `classic-2d` polls go to `padBoard2D`: Start alone
  pauses, through `#c2d-pause`; the status card is navigated as a menu,
  its B / View `backGame('pad')`; on the board View presses
  `#c2d-figures-toggle` while it shows (`padToggleFigures`; never on a
  phone, where it is hidden), and every other poll goes to the active flat
  mode's `pad` after held-button suppression.
- `F` flags in Classic 2D (fullscreen is 3D only); `M` and `H` act in both
  modes ([app-shell-help.md](app-shell-help.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the mode the wiring serves;
  [../domain/features/flat-grid-modes.md](../domain/features/flat-grid-modes.md)
  — Hexagon and Triangle on the same wiring.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  mode contract.

## CROSS-REFERENCES

- [classic2d-mode.md](classic2d-mode.md) — `createClassic2DMode`, end
  effect; [classic2d-board-view.md](classic2d-board-view.md) — board view;
  [classic2d-input.md](classic2d-input.md) — button swap.
- [app-shell-pause.md](app-shell-pause.md) — pause;
  [app-shell-end-delay.md](app-shell-end-delay.md) — end delay.
- [testing.md](testing.md) — Classic 2D session, board view and button swap
  tests; `tests/shell-router.test.mjs` the flat modes' registration and
  routes; `tests/flat-modes-play.test.mjs` Hexagon and Triangle games
  through the shell.

## WHEN TO READ THE SOURCE

- Changing the 2D wiring (board area, panel, status card, controller): the
  `FLOW_2D` block and `padBoard2D` in `js/main.js`.
- Registering a flat mode: `flatMode`, `FLAT_2D` and `flat2D` in
  `js/main.js`, plus its board choice's screen in `SHELL`
  ([app-shell-navigation.md](app-shell-navigation.md)) and markup
  ([app-shell-markup.md](app-shell-markup.md)).
