# App shell — results screen view, over the board, Look at the board

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the results screen's page side — `js/results/view.js` (the screen's
content, its formats — documented in its head comment — and the binder that
fills `#results`) — the screen over the finished board, and Look at the board
in `js/main.js`. The flow that records the game and routes to the screen, and
the screen's actions, are [app-shell-results.md](app-shell-results.md); the
screen's markup is [app-shell-markup.md](app-shell-markup.md) § Screens.

## PUBLIC API

`js/results/view.js`
- `formatTime(ms)` (thousandths, truncated: `"47.380 s"`),
  `formatTimeDifference`, `formatRate` / `formatRateDifference`,
  `formatEfficiency` / `formatEfficiencyDifference`, `formatClicks`,
  `formatWinRate` (re-exported by the Records screen); `EQUAL_BEST`, `DASH`,
  `NOTES`, `FIRST_BEST`, `CHALLENGE_LABEL` ("Challenge · not
  eligible for bests"), `CHALLENGE_NOTE`.
- `resultsContent({summary, comparison?, saved?, notSaved?, watch?, rank?,
  streak?, standing?, watchBest?, swapped?})` → `{outcome, title, board, rank, label,
  tiles, details, code, notes, watch, watchBest, compact, look, over3d}`
  (fields in the head comment): `board` the mode and the board's label,
  `rank` the chip on a ranked win, `label` a
  challenge's chip in its place; `tiles` the four figure tiles (a win's
  time, 3BV/s, efficiency and 3BV; a loss's time, 3BV solved with its
  progress, 3BV/s and efficiency), each with its comparison and `newBest`;
  `details` the Clicks (left and right, or reveal and flag while
  `swapped` — the shell's `BUTTON_SWAP.on` for a Classic 2D game), next
  target, streak or challenge, and win rate rows (a loss's without the
  longest streak), in the canvas's lower-case wording; `compact` the small secondary actions beside Watch best; `look`
  and `over3d` true for a 3D summary. `BOARD_DIFFICULTY`, `LOSS_NO_BESTS`.
- `createResultsView({root, onPlayAgain, onWatch?, onWatchBest?, onRecords, onMenu, onLook?, onCopy?})` →
  `show(content)`, `hide()`, `noteLook(text)`; `LOOK_REFUSED`. It fills
  `#results-frame`'s head (the trophy tile on a win, the title, the board
  line, the rank or challenge chip — the rank at the end of the board line
  over the 3D scene), the tiles `#rs-<key>`, the detail rows `#rd-<key>`
  and `#results-code-group` — the "Board code" section label and the
  `#results-code` chip, hidden without a code — whose Copy and Copy link
  call `onCopy` (the shell's `copyCode`). `data-outcome` on the frame gives
  a loss its neutral head (`css/style.css`, the theme).
  The screen's composition is the head comment of `css/components.css`
  (*Results screen*).
- `RESULTS_ACTIONS` (`r-again`, `r-watch`, `r-watch-best`, `r-look`,
  `r-records`, `r-menu`);
  `resultsEnter({focused, repeat})` → `'playAgain'` (focus on Play again or
  on no action), null (another action's own activation), `'ignore'`
  (auto-repeat).

## INTERNAL PATTERNS

- **Over the board.** The screen shows on the scrim over the finished
  board, the same over both modes, with only the board or the scene behind
  it ([app-shell-ui.md](app-shell-ui.md) § Behind a card); over a 3D game
  the scene is drawn on demand only (`shouldRender`) while `lookable()`; a
  finished 3D game is never returned to. Its card takes the canvas's width
  by window size and, on a phone, sits at the window's top and scrolls with
  the page, its action bar in flow at its end (`css/style.css` § results).
  A first-use toast never draws over it.
- **Look at the board** (the `look` screen, `#look` its hint line). A 3D
  card's *Look at the board* (`openLook`) and Back on it (`resultsBack`;
  the browser's Back still goes to the menu) are offered while `lookable()`
  — the 3D mode still holds the finished board, so not after Records; the
  frame's head then shows `#r-look` with the back key hint, and Main menu
  shows none (`#results.results--look`). A
  controller opens it lockless; a click or key asks for pointer lock
  (`lookPending`) and `onLockChange` opens it once granted, `onLockError`
  leaves the card with `LOOK_REFUSED` and focus on Look at the board (`refusedLook`), so Enter retries. In the look `Input.isActive` is
  true (mouse look, flight and view-mode keys, wheel), the frame loop
  flies the camera, `padLook` flies with the sticks, `onAction` and
  `pauseGame` refuse. `LOOK_END` (a second `createEndSkip`, fed by the same
  capturing listeners as `END_SKIP`, keys only Esc in the look and every key outside it) ends it on Esc,
  any mouse button, any controller button or the lock's release
  (`endLook` → back to `results`, focus on Play again), consuming the
  press whole; the Esc that released the look's lock does not reopen it.

## DOMAIN DEPENDENCIES

- [../domain/features/results-screen.md](../domain/features/results-screen.md)
  — content, time format, failure note.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the results over the 3D scene, Look at the board.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the results screen's one-column layout and its phone arrangement.

## CROSS-REFERENCES

- [app-shell-results.md](app-shell-results.md) — the flow that hands the
  screen its data, and the actions its buttons run.
- [app-shell-ui.md](app-shell-ui.md) § Behind a card — the scrim over the
  board.
- [app-shell-end-delay.md](app-shell-end-delay.md) — `createEndSkip`, whose
  listeners feed `LOOK_END`.
- [app-shell-kit-layout.md](app-shell-kit-layout.md) — the results screen's composition
  in the catalogue.
- [testing.md](testing.md) — `tests/results.test.mjs`,
  `tests/mode3d-end.test.mjs` (the look).

## WHEN TO READ THE SOURCE

- Changing what the results screen shows or its formats: the head comment of
  `js/results/view.js`.
- Changing Look at the board, its pointer-lock request or how it ends: the
  `look` wiring in `js/main.js`.
