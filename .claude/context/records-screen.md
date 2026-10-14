# Records screen — 2D | 3D switch, board picker, history charts, Top 10, filters, export, library view

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
  library) and `pageOf`, the paging of both lists.
- `js/records/view-prefs.js` — the remembered Pinned first switch, the
  `records.view` document.
- `js/records/stats.js` — pure figures over a board's history: the one
  ranking (also the results screen's rank), the Top 10, averages, the
  last-50 win rate, the period and outcome filters, the best time's steps.
- `js/records/export.js` — the CSV and JSON export of every game and the
  kept replays' listing, the injected download, and the export actions'
  binder shared with the Settings page's Data panel.

## PUBLIC API

Records screen (`js/records/screen.js`)
- `RECORDS_SCREEN` — `'records'`; `EMPTY_TEXT`; `RECORDS_MODES` — frozen
  `{ value, label, overallTitle }` for `classic-2d` and `3d`.
- `pickerBoards(records, mode?)` → `[{ key, label, board }]`: the mode's
  named boards (each without, then with no-guess), then its custom boards
  in `boardsPlayed(mode)` order.
- `lastBoardPlayed(records, mode?)` → key or null.
- `recordsContent(records, { mode?, boardKey?, notSaved?, page?, replays?,
  replayPage?, pinnedFirst?, canWatch?, replaysNotSaved?, period?, outcome?,
  tab?, topStat?, now?, exportable? })` → the content. Never throws.
- `GAME_TABS`, `TOP_STATS`, `TOP_EMPTY_TEXT`, `TOP_EMPTY_PERIOD`,
  `GAMES_EMPTY_TEXT`, `WON_ONLY_TEXT`.
- `formatDate(iso)` → `"9 Oct 2026"` (the bests); `formatDateTime(iso)` →
  `"9 Oct 2026 14:32"` (local, 24-hour: the games and replays);
  `formatWinRate` (re-exported from `js/results/view.js`).
- `createRecordsScreen({ records, view, replays?, router?, viewPrefs?,
  exporter?, now? })` → `show({ mode, boardKey }?)`, `hide()`, `select(key)`,
  `setMode(mode)`, `showPage(n)`, `showReplayPage(n)`, `setPeriod(v)`,
  `setOutcome(v)`, `setTab(v)`, `setTopStat(v)`, `exportFile(format)`,
  `filters`, `togglePin(id)`, `deleteReplay(id)`, `setPinnedFirst(on)`,
  `watch(id)`, `closeConfirm()`, `confirmOpen`.
- `createRecordsView({ root, onSelect, onMode?, onBack, onPage, onWatch?,
  onTogglePin?, onPinnedFirst?, onReplayPage?, onDelete?, onPeriod?,
  onOutcome?, onTab?, onTopStat?, onExport?, chart?, bestChart? })` →
  `show(content)`, `hide()`, `closeConfirm()`, `isConfirmOpen()`; the
  switch is `#records-mode`, the chart defaults to `#records-chart`.

Library view (`js/records/replay-list.js`)
- `REPLAY_SCREEN` — `'replay'`; `REPLAYS_EMPTY_TEXT`; `REPLAYS_NOT_SAVED`;
  `REPLAY_HEADERS`.
- `replayList(library, boardKey, opts)` → `{ rows, empty, emptyText,
  pinnedFirst, canWatch, page, pages, label, pager }`. Never throws.
- `pinState(pins)`, `deleteMessage({ date, outcome, pins })`,
  `togglePin(library, row)`, `watchRoute(replayId, returnTo)`,
  `createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst,
  onPage?, onDelete? })` → `show(list)`, `closeConfirm()`,
  `isConfirmOpen()`, `hide()`.

Remembered view (`js/records/view-prefs.js`)
- `VIEW_PREFS_DOC` — `'records.view'`, `VIEW_PREFS_VERSION` — 1.
- `createRecordsViewPrefs({ storage })` → `pinnedFirst`, `load()`,
  `setPinnedFirst(on)`.

History chart (`js/records/history-chart.js`)
- `chartPoints(history)`, `niceCeiling(v)`, `chartScale(points, size)`,
  `chartText(points, empty?)` / `NO_WON_GAMES`, `drawHistoryChart(ctx, opts)`,
  `CHART_TOKENS`; the best-time chart: `dateTicks`, `bestTimeScale`,
  `bestTimeText`, `drawBestTimeChart`; hover: `nearestIndex`,
  `rateReadout`, `bestReadout`; `formatDate`, `formatShortDate`;
  `createHistoryChart({ canvas, kind?: 'rate' | 'best', ... })` →
  `draw(data)`, `hoverAt(x)`, `leave()`, `readout`, `destroy()`.
- `pageOf(items, page, size = PAGE_SIZE)`; `PAGE_SIZE` — 10.

Stats (`js/records/stats.js`)
- `rankedGames(history, stat)`, `gameRank(history, summary, stat?)`,
  `topGames`, `averages`, `recentWinRate`, `filterHistory(history,
  { period, outcome }, now)`, `periodStart`, `bestTimeSteps`, `statValue`;
  `PERIODS`, `OUTCOME_FILTERS`, `AVERAGE_WINDOWS`, `TOP_SIZE`,
  `RECENT_GAMES`.

Export (`js/records/export.js`)
- `createRecordsExport({ records, replays?, now?, trigger?, objectUrl? })` →
  `hasGames()`, `csv()`, `json()`, `save(format)`; `exportCsv`,
  `exportJson`, `exportGames`, `csvField`, `dateStamp`, `CSV_HEADERS`,
  `EXPORT_FORMAT`, `EXPORT_LINE`, `NOTHING_TO_EXPORT`;
  `bindExportActions({ csv, json, note }, { onExport })` → `show(exportable)`.

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
  the library's `onChange` and redraws both lists on the same page, each
  clamped to its last; `hide` unsubscribes. `show`, `select` and `setMode`
  start both lists on page one, toggling Pinned first the replays. A rebuilt
  replay list keeps focus on the button of the replay that had it.
- **Never blocks.** Every store query is wrapped: unreadable records show
  the empty state, and Back always works. A board with no games hides the
  bests, counters and history. When `records.available()` is false, the
  session's first show carries the `notSaved` note; a library not saving
  adds `REPLAYS_NOT_SAVED` once per session after its load settles.
- **Formats are the results screen's** (`formatTime`, `formatRate`,
  `formatEfficiency` from `js/results/view.js`); the screen defines only
  the date, the date and time, and the win rate.
- **Layout.** `#records` is a `ui-columns--two`: switch, picker, the bests as
  `ui-stat--tile`s, the board's counters, the averages panel and the mode's
  overall row on one side; on the other the history panel — the period and
  outcome choices, both charts in a `ui-columns--pair` (side by side at the
  kit breakpoint), the Recent games | Top 10 tabs and the Top 10's stat
  choice — and the replays panel; one column below the kit's 1024 px
  breakpoint. Below the columns, Back and the two export actions. A table narrower than its columns (a phone, a
  half-width column) stacks each row's cells under their `data-label`
  (`css/style.css`, a container query on the two panels).
- **The chart is a picture; text carries the numbers.** The canvas is
  `role="img"` with `chartText` as its label; 3BV/s reads on the left axis,
  efficiency on the right (at least 100%); a missing value is a gap.
- **Chart colours are tokens.** Every colour and its font come through the
  token reader; it redraws on every theme change and canvas resize
  (`ResizeObserver`) at the device pixel ratio; a zero-size canvas is
  skipped.
- **History views and filters.** The choices are kit segmented choices
  whose options are in the markup. The period filters
  every history view, the outcome only the recent games; the bests,
  counters and overall row stay all-time. Filters, tab and stat are screen
  state, reset on each `show`; a filter change starts the recent games on
  page one.
- **Hover readouts.** Each chart marks the nearest point under a pointer
  (or a tap) and draws its values beside it, also on
  `canvas.dataset.readout`; no focus stop.
- **Export.** `js/main.js` builds one `RECORDS_EXPORT` over the store and
  the library; the screen's actions below the lists and the Settings Data
  panel's both save through it, disabled with `NOTHING_TO_EXPORT` until a
  game is recorded.
- **Paged lists.** Both lists newest first, `PAGE_SIZE` per page, past the
  end clamped, each under a kit pager (`bindPager`: First, five numbered
  pages, Last; hidden on one page) and a range caption.
- **The library view.** The board's kept replays (`forBoard`), newest first,
  or pinned first under the filter, remembered in `records.view` (loaded at
  start-up, saved on each change); Pin adds the hand pin, Unpin clears
  every reason. Delete opens `#records-replays-confirm` in place of the list
  (focus on Cancel); Cancel and Back (`RECORDS_PAGE.closeConfirm()` in
  `shellBack` / `historyBack`) return focus to that row's Delete; confirming
  calls `library.remove`, then focus goes to the Delete of the row in its
  place, else the previous row's, else the Pinned first switch.
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
- Changing a ranking, an average, a filter or the best time's steps: the
  head comment of `stats.js`; the export's columns or files: the head
  comment of `export.js`.
