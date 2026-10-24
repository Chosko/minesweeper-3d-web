# App shell — the Classic 2D mode's wiring in `js/main.js`

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `FLOW_2D`, the shell side `js/main.js` hands to
`createClassic2DMode`; the mode, board view, input and board choice
themselves are [classic2d.md](classic2d.md).

## INTERNAL PATTERNS

- **Button swap.** `BUTTON_SWAP` (`createButtonSwap`) is the page's one
  mouse button swap, handed as `buttonSwap`: kept across games, off again on
  reload, toggled by `onToggleSwap` (`#hud-swap` at the right of the game window's foot) and
  mirrored by `ui.setSwap`.
- **Routes.** Board choice routes to `classic-2d-choice` with the last
  board choice (loaded at boot by `mode2d.loadChoice()`); `show` routes to
  `classic-2d`, whose Back is `backGame`.
- **Board area and panel.** The board area is `#c2d-stage`, filled by the
  view's container `#c2d-board`; the board opens at the `boardScale` setting (`scale`) inside the board frame (`frame`,
  `BOARD_FRAME`). The window hugs its board: `ui.sizeBoard2D` measures the
  room its chrome leaves with the window at its largest (`c2d--measure`)
  and sizes `#c2d-stage` to the view's `extent` there, giving back what
  the body then overflows (below the kit breakpoint the figures row under the board
  wraps at the board's width, never setting the window's) — at each fresh view
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
  both fed by `mode2d.tick()` every frame, which also drives the movement sampler
  ([replay-samplers.md](replay-samplers.md)) and draws the end effect during the 2D end delay
  (`mode2d.ending`, read through `endDelay()`).
- **Pause.** The paused screen's `setBoardHidden` hides the 2D board;
  `pauseInfo`, `gameInProgress` and `gameOver` read `mode2d.status()`.
- **Status card.** `board2d` holds `{generating, failure, progress}` from
  `FLOW_2D`; `showStatus2D` shows `#c2d-status` — the generating card on
  the board only, the offer there and over the pause card — and focuses the
  offer (`statusFocus`: Retry, or Play a standard board once
  `failure.count` is 2 or more). The generating card focuses Cancel unless
  the focus is already on its Cancel or Play a standard board;
  `FLOW_2D.progress` redraws it (`drawStatus2D`) without moving focus. An
  offer answered over the pause card resumes first (`answer2D`); Main menu
  is `PAUSE.toMenu()`.
- **Controller.** On `classic-2d` polls go to `padBoard2D`: Start pauses
  through `#c2d-pause`, B/Back is `backGame('pad')`, the status card is
  navigated as a menu, every other poll goes to `mode2d.pad` after
  held-button suppression.
- `F` flags in Classic 2D (fullscreen is 3D only); `M` and `H` act in both
  modes ([app-shell-help.md](app-shell-help.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the mode the wiring serves.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  mode contract.

## CROSS-REFERENCES

- [classic2d-mode.md](classic2d-mode.md) — `createClassic2DMode`, end
  effect; [classic2d-board-view.md](classic2d-board-view.md) — board view;
  [classic2d-input.md](classic2d-input.md) — button swap.
- [app-shell-pause.md](app-shell-pause.md) — pause;
  [app-shell-end-delay.md](app-shell-end-delay.md) — end delay.
- [testing.md](testing.md) — Classic 2D session, board view and button swap
  tests.

## WHEN TO READ THE SOURCE

- Changing the 2D wiring (board area, panel, status card, controller): the
  `FLOW_2D` block and `padBoard2D` in `js/main.js`.
