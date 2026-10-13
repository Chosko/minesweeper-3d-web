# Records screen — 2D | 3D switch, board picker, history chart, library view

## OVERVIEW

The Records screen (`records-screen`) shows the personal records
([records-store.md](records-store.md)) for Classic 2D or 3D through its
2D | 3D switch, with the chosen board's kept replays (`replay-library`'s
library view). `js/main.js` builds `RECORDS_PAGE` over the records store,
the replay library `REPLAYS`, the router and the `#records` view, shown on
the shell's `records` route from the main menu or the results screen
([app-shell.md](app-shell.md)).

- `js/records/screen.js` — content (`recordsContent`), controller and the
  `#records` binder; its head comment documents the content shape.
- `js/records/replay-list.js` — the library view and the `#records-replays`
  binder; its head comment documents the row shape. Imports `PIN_BEST`
  ([replay-library.md](replay-library.md)).
- `js/records/history-chart.js` — the history chart (canvas, no chart
  library) and the games list paging.

## PUBLIC API

Records screen (`js/records/screen.js`)
- `RECORDS_SCREEN` — `'records'`; `EMPTY_TEXT`; `RECORDS_MODES` — frozen
  `{ value, label, overallTitle }` for `classic-2d` and `3d`.
- `pickerBoards(records, mode?)` → `[{ key, label, board }]`: the mode's
  named boards (each without, then with no-guess), then its custom boards
  in `boardsPlayed(mode)` order.
- `lastBoardPlayed(records, mode?)` → key or null.
- `recordsContent(records, { mode?, boardKey?, notSaved?, page?, replays?,
  pinnedFirst?, canWatch?, replaysNotSaved? })` → the content. Never throws.
- `formatDate(iso)` → `"9 Oct 2026"`; `formatWinRate` (re-exported from
  `js/results/view.js`).
- `createRecordsScreen({ records, view, replays?, router? })` →
  `show({ mode, boardKey }?)`, `hide()`, `select(key)`, `setMode(mode)`,
  `showPage(n)`, `togglePin(id)`, `setPinnedFirst(on)`, `watch(id)`.
- `createRecordsView({ root, onSelect, onMode?, onBack, onPage, onWatch?,
  onTogglePin?, onPinnedFirst?, chart? })` → `show(content)`, `hide()`;
  the switch is `#records-mode`, the chart defaults to `#records-chart`.

Library view (`js/records/replay-list.js`)
- `REPLAY_SCREEN` — `'replay'`; `REPLAYS_EMPTY_TEXT`; `REPLAYS_NOT_SAVED`;
  `REPLAY_HEADERS`.
- `replayList(library, boardKey, opts)` → `{ rows, empty, emptyText,
  pinnedFirst, canWatch }`. Never throws.
- `pinState(pins)`, `togglePin(library, row)`, `watchRoute(replayId,
  returnTo)`, `createReplayListView({ root, onWatch, onTogglePin,
  onPinnedFirst })`.

History chart (`js/records/history-chart.js`)
- `chartPoints(history)`, `niceCeiling(v)`, `chartScale(points, size)`,
  `chartText(points)` / `NO_WON_GAMES`, `drawHistoryChart(ctx, opts)`,
  `CHART_TOKENS`, `createHistoryChart({ canvas, ... })` → `draw(points)`,
  `destroy()`.
- `pageOf(items, page, size = PAGE_SIZE)`; `PAGE_SIZE` — 10.

## INTERNAL PATTERNS

- **Opening mode and board.** `show({ mode, boardKey })` opens on the board
  asked for (the results screen passes its game's), whose key sets the mode;
  else on the mode asked for and its last board played; else on the last
  board played in either mode; a mode with nothing played opens on its first
  named board, and with nothing at all on Classic 2D's Beginner. A board
  asked for that is not in the picker joins it. Picker options are rebuilt
  only when the list changes, so focus stays.
- **The mode switch.** `setMode(mode)` shows that mode's last board played,
  or its first named board, with its picker and overall figures; no figure
  combines the two modes.
- **Live update.** While shown, the controller subscribes to the store's and
  the library's `onChange` and redraws on the same games page; `hide`
  unsubscribes. `show`, `select` and `setMode` start on page one. A rebuilt
  replay list keeps focus on the button of the replay that had it.
- **Never blocks.** Every store query is wrapped: unreadable records show
  the empty state, and Back always works. A board with no games hides the
  bests, counters and history. When `records.available()` is false, the
  session's first show carries the `notSaved` note; a library not saving
  adds `REPLAYS_NOT_SAVED` once per session after its load settles.
- **Formats are the results screen's** (`formatTime`, `formatRate`,
  `formatEfficiency` from `js/results/view.js`); the screen defines only
  date and win rate.
- **The chart is a picture; text carries the numbers.** The canvas is
  `role="img"` with `chartText` as its label; 3BV/s reads on the left axis,
  efficiency on the right (at least 100%); a missing value is a gap.
- **Chart colours are tokens.** Every colour and its font come through the
  token reader; it redraws on every theme change and canvas resize
  (`ResizeObserver`) at the device pixel ratio; a zero-size canvas is
  skipped.
- **Paged games list.** Newest first, `PAGE_SIZE` per page, past the end
  clamped; a pager button that ends while focused hands focus to the other.
- **The library view.** The board's kept replays (`forBoard`), newest first,
  or pinned first under the filter; Pin adds the hand pin, Unpin clears
  every reason.
- **Watch opens the viewer.** Watch shows only when the router registers
  `REPLAY_SCREEN`, and on a best or a game only when its replay is kept;
  `watch(id)` routes to the viewer ([replay-playback.md](replay-playback.md))
  with this screen on its board to return to.

## DOMAIN DEPENDENCIES

- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — content, picker, chart, recent games, live update, empty state.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 2D | 3D switch, the 3D picker, the mode the screen opens on.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the library view, pin state and filter, Watch.

## CROSS-REFERENCES

- [records-store.md](records-store.md) — the queries the screen reads.
- [records.md](records.md) — board labels and the summary stats.
- [replay-library.md](replay-library.md) — the library it lists and pins.
- [app-shell.md](app-shell.md) — `RECORDS_PAGE`;
  [app-shell-navigation.md](app-shell-navigation.md) — the `records` route,
  Back; [app-shell-results.md](app-shell-results.md) — the results formats
  and `NOTES`; [app-shell-kit.md](app-shell-kit.md) — the token reader, the
  `#records` markup.
- [testing.md](testing.md) — `tests/records-screen*.test.mjs`,
  `tests/records-history.test.mjs`, `tests/records-replays.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing what the screen shows or how it picks its mode and board: the
  head comment, `recordsContent` and `RECORDS_MODES` in `screen.js`; its
  markup is `#records` in `index.html`, catalogued in `css/components.css`.
- Changing the library view's rows, order or buttons: the head comment of
  `replay-list.js`; its composition, `createRecordsScreen` and
  `createRecordsView`.
- Changing the chart's drawing, scale or colours: `drawHistoryChart` and
  `chartScale` in `history-chart.js`.
