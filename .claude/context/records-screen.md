# Records screen — 2D | 3D switch, board picker, layout, filters, export

## OVERVIEW

The Records screen (`records-screen`) shows the personal records
([records-store.md](records-store.md)) for Classic 2D or 3D through its 2D |
3D switch, with the chosen board's kept replays. `js/main.js` builds
`RECORDS_PAGE` over the records store, `REPLAYS`, the router and `#records`,
on the shell's `records` route ([app-shell.md](app-shell.md)).

- `js/records/screen.js` — content (`recordsContent`), controller and the
  `#records` binder; its head comment documents the content shape.
- `js/records/export.js` — the CSV and JSON export of every game and the
  kept replays' listing, the injected download, and the export actions'
  binder shared with the Settings page's Data panel.

The history charts, paging and stats (`history-chart.js`, `stats.js`) are
[records-history.md](records-history.md); the library view
(`replay-list.js`, `view-prefs.js`) is
[records-library-view.md](records-library-view.md).

## PUBLIC API

Records screen (`js/records/screen.js`)
- `RECORDS_SCREEN` — `'records'`; `EMPTY_TEXT`; `RECORDS_MODES` — frozen
  `{ value, label, overallTitle }` for `classic-2d` and `3d`.
- `pickerBoards(records, mode?)` → `[{ key, label, board }]`: the mode's
  named boards (each without, then with no-guess — for 3D the four cube
  presets, Cube Intro to Cube Expert), its Daily board (always listed), then
  its custom boards in `boardsPlayed(mode)` order; a game played on a
  former First box preset is listed there as a custom board
  ([records.md](records.md)).
- `lastBoardPlayed(records, mode?)` → key or null.
- `recordsContent(records, { mode?, boardKey?, notSaved?, page?, replays?,
  replayPage?, pinnedFirst?, canWatch?, canOpen?, replaysNotSaved?, period?,
  outcome?, tab?, topStat?, now?, exportable? })` → the content. Never throws. Every
  recent game and Top 10 row carries its `code` (`codeOf` over the history
  entry and the board, null for an entry from before codes); a Daily board's
  counters replace the streak pair with "Days in a row" and "Longest days
  in a row" (`daysInARow` as of `now`'s local date), each figure carrying
  its label.
- `GAME_TABS` (Recent games, Top 10, Replays, Leaderboards, the first the
  default), `TOP_STATS`, `TOP_EMPTY_TEXT`, `TOP_EMPTY_PERIOD`,
  `GAMES_EMPTY_TEXT`, `WON_ONLY_TEXT`.
- `formatDate(iso)` → `"9 Oct 2026"` (the bests); `formatDateTime(iso)` →
  `"9 Oct 2026 14:32"` (local, 24-hour: the games and replays);
  `formatWinRate` (re-exported from `js/results/view.js`).
- `TRIGGER_MODES` — `{lt: 'classic-2d', rt: '3d'}`, the triggers' modes.
- `createRecordsScreen({ records, view, replays?, router?, viewPrefs?,
  exporter?, files?, now? })` → `show({ mode, boardKey }?)`, `hide()`,
  `select(key)`, `stepBoard(±1)` (the picker's previous / next board; false
  at either end), `setMode(mode)`, `showPage(n)`, `showReplayPage(n)`,
  `setPeriod(v)`, `setOutcome(v)`, `setTab(v)`, `setTopStat(v)`,
  `exportFile(format)`, `downloadReplay(id)`, `openReplayFile()`,
  `filters`, `togglePin(id)`, `deleteReplay(id)`, `setPinnedFirst(on)`,
  `watch(id)`, `closeConfirm()`, `confirmOpen`. `content.canOpen` offers
  Open replay file (the viewer's route and `files.pick`).
- `createRecordsView({ root, onSelect, onMode?, onBack, onPage, onWatch?,
  onTogglePin?, onPinnedFirst?, onReplayPage?, onDelete?, onPeriod?,
  onOutcome?, onTab?, onTopStat?, onExport?, onDownload?, onOpenFile?,
  onCopy?, chart?, bestChart? })` →
  `show(content)`, `hide()`, `closeConfirm()`, `isConfirmOpen()`; the
  switch is `#records-mode`, the chart defaults to `#records-chart`; the
  tabs `#records-tabs` are a kit tablist (`bindTabs`), each showing the
  panel its `aria-controls` names; the games, Top 10 and library tables
  gain a Board code column of compact code chips (`codeCell`) whose Copy
  and Copy link call `onCopy`, and a recent game or replay its outcome as a
  kit chip (`outcomeChip`, `js/records/replay-list.js`).

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
  start both lists on page one, toggling Pinned first the replays.
- **Never blocks.** Every store query is wrapped: unreadable records show
  the empty state, and Back always works. A board with no games hides the
  bests, counters and history. When `records.available()` is false, the
  session's first show carries the `notSaved` note; a library not saving
  adds `REPLAYS_NOT_SAVED` once per session after its load settles.
- **Formats are the results screen's** (`formatTime`, `formatRate`,
  `formatEfficiency` from `js/results/view.js`); the screen defines only
  the date, the date and time, and the win rate.
- **Layout** (`css/components.css` head comment, *Records*). `#records` is
  a `ui-frame` on the backdrop: Back and the 2D | 3D switch in its head,
  the picker at the top of its body, then a `ui-columns--two` — the
  board's figures (the bests as `ui-stat--tile`s, the counters), the
  averages panel, the mode's overall figures and under them the two export
  actions on one side; on the other the history panel — the period and
  outcome choices, both charts in a `ui-columns--pair`, then the Recent
  games | Top 10 | Replays | Leaderboards tabs, Leaderboards a coming-soon
  panel with no pager; one column below the kit breakpoint. An empty board
  hides the choices, the charts and the averages; the tabs stay. The
  bests' figures keep one line (the kit's `ui-stat--tile`). A table
  narrower than a row of its figures, board code and actions on one line —
  every width the two panels take — stacks each row's cells under their
  `data-label`, the board code and the actions each on a line of their own
  (`css/style.css`, a container query on the two panels); the averages
  table stacks the same way, each row a card headed by its label, in a
  panel narrower than its row of three-digit times (a container query on
  `#records-averages`, a table at 1024 px and wider); a time never wraps.
- **History views and filters.** The choices are kit segmented choices
  whose options are in the markup. The period filters every history view,
  the outcome only the recent games; the bests, counters and overall row
  stay all-time. Filters, tab and stat are screen state, reset on each
  `show`; a filter change starts the recent games on page one.
- **Export.** `js/main.js` builds one `RECORDS_EXPORT` over the store and
  the library; the screen's actions under the mode's overall figures and
  the Settings Data panel's both save through it, disabled with `NOTHING_TO_EXPORT` until a
  game is recorded.
- **Paged lists.** Both lists newest first, `PAGE_SIZE` per page
  (`pageOf`), past the end clamped, each under a kit pager (`bindPager`:
  First, five numbered pages, Last; hidden on one page) and a range caption.
- **Controller.** `padRecords` in `js/main.js` (off while a modal or a
  confirmation is open): LT / RT choose the mode (`TRIGGER_MODES`), LB / RB
  step the board (`stepBoard`); `[data-pad-glyph]` hints beside the switch
  and the picker show the active pad's glyphs (`UI.setPad`). The arrow keys
  do not walk Records; the D-pad walks it column by column
  ([app-shell-navigation.md](app-shell-navigation.md) § Focus walk).

## DOMAIN DEPENDENCIES

- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — content, picker, chart, recent games, live update, empty state.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 2D | 3D switch, the 3D picker, the mode the screen opens on.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the screen in the frame, the Leaderboards tab's coming-soon panel.

## CROSS-REFERENCES

- [records-store.md](records-store.md) — the queries the screen reads.
- [records.md](records.md) — board labels and the summary stats.
- [records-history.md](records-history.md) — the charts, paging and stats;
  [records-library-view.md](records-library-view.md) — the Replays tab.
- [app-shell.md](app-shell.md) — `RECORDS_PAGE`;
  [app-shell-navigation.md](app-shell-navigation.md) — the `records` route,
  Back; [app-shell-results.md](app-shell-results.md) — the results formats
  and `NOTES`; [app-shell-kit.md](app-shell-kit.md) — the token reader, the
  `#records` markup.
- [testing.md](testing.md) — `tests/records-screen*.test.mjs`,
  `tests/records-export.test.mjs`, `tests/shell-pad-walk.test.mjs` (the
  controller on Records).

## WHEN TO READ THE SOURCE

- Changing what the screen shows or how it picks its mode and board: the
  head comment, `recordsContent` and `RECORDS_MODES` in `screen.js`; its
  markup is `#records` in `index.html`, catalogued in `css/components.css`.
- Changing the export's columns or files: the head comment of `export.js`.
