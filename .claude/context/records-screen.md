# Records screen — 2D | 3D switch, board picker, content, filters

## OVERVIEW

The Records screen (`records-screen`) shows the personal records
([records-store.md](records-store.md)) for Classic 2D or 3D through its 2D |
3D switch, with the chosen board's kept replays. `js/main.js` builds
`RECORDS_PAGE` over the records store, `REPLAYS`, the router and `#records`,
on the shell's `records` route ([app-shell.md](app-shell.md)).

- `js/records/screen.js` — content (`recordsContent`) and controller; its
  head comment documents the content shape.

The `#records` binder, the screen's layout, the controller's buttons and
the export (`js/records/export.js`) are
[records-screen-view.md](records-screen-view.md). The history charts,
paging and stats (`history-chart.js`, `stats.js`) are
[records-history.md](records-history.md); the library view
(`replay-list.js`, `view-prefs.js`) is
[records-library-view.md](records-library-view.md).

## PUBLIC API

Records screen (`js/records/screen.js`)
- `RECORDS_SCREEN` — `'records'`; `EMPTY_TEXT`; `RECORDS_MODES` — frozen
  `{ value, label, overallTitle }` for `classic-2d` and `3d`.
- `pickerBoards(records, mode?)` → `[{ key, label, board }]`: the mode's
  named boards, every one without no-guess, then every one with it (for 3D
  the four cube presets, Cube Intro to Cube Expert), its Daily board
  (always listed, labelled `DAILY_OPTION`, "Daily"), then its custom boards
  in `boardsPlayed(mode)` order; a game played on a former First box preset
  is listed there as a custom board ([records.md](records.md)). The content's
  `board.label` is always the board's `boardLabel`.
- `lastBoardPlayed(records, mode?)` → key or null.
- `recordsContent(records, { mode?, boardKey?, notSaved?, page?, replays?,
  replayPage?, pinnedFirst?, canWatch?, canOpen?, replaysNotSaved?, period?,
  outcome?, tab?, topStat?, now?, exportable? })` → the content. Never throws. Every
  recent game and Top 10 row carries its `code` (`codeOf` over the history
  entry and the board, null for an entry from before codes); a Daily board's
  counters replace the streak pair with "Days in a row" and "Longest days
  in a row" (`daysInARow` as of `now`'s local date), each figure carrying
  its label; `overallLine` is the mode's overall figures as one sentence,
  `averages.winRate` the last-50 win rate line.
- `GAME_TABS` (Recent games, Top 10, Replays, Leaderboards, the first the
  default), `TOP_STATS`, `TOP_EMPTY_TEXT`, `TOP_EMPTY_PERIOD`,
  `GAMES_EMPTY_TEXT`, `WON_ONLY_TEXT`.
- `formatDate(iso)` → `"9 Oct 2026"` (the bests); `formatDateTime(iso)` →
  `"9 Oct 2026 14:32"` (local, 24-hour: the games and replays);
  `formatWinRate` (re-exported from `js/results/view.js`).
- `createRecordsScreen({ records, view, replays?, router?, viewPrefs?,
  exporter?, files?, now? })` → `show({ mode, boardKey }?)`, `hide()`,
  `select(key)`, `stepBoard(±1)` (the picker's previous / next board; false
  at either end), `setMode(mode)`, `showPage(n)`, `showReplayPage(n)`,
  `setPeriod(v)`, `setOutcome(v)`, `setTab(v)`, `setTopStat(v)`,
  `exportFile(format)`, `downloadReplay(id)`, `openReplayFile()`,
  `filters`, `togglePin(id)`, `deleteReplay(id)`, `setPinnedFirst(on)`,
  `watch(id)`, `closeConfirm()`, `confirmOpen`. `content.canOpen` offers
  Open replay file (the viewer's route and `files.pick`). `view` is
  `createRecordsView` ([records-screen-view.md](records-screen-view.md)).

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
  the empty state, and Back always works. A board with no games keeps every
  part: dashes for its bests and averages, 0 or a dash for its counters,
  each chart its empty line, the recent games the board's empty line
  (`EMPTY_TEXT`). When `records.available()` is false, the
  session's first show carries the `notSaved` note; a library not saving
  adds `REPLAYS_NOT_SAVED` once per session after its load settles.
- **Formats are the results screen's** (`formatTime`, `formatRate`,
  `formatEfficiency` from `js/results/view.js`); the screen defines only
  the date, the date and time, and the win rate.
- **History views and filters.** The choices are kit segmented choices
  whose options are in the markup. The period filters every history view,
  the outcome only the recent games; the bests, counters and overall row
  stay all-time. Filters, tab and stat are screen state, reset on each
  `show`; a filter change starts the recent games on page one.
- **Paged lists.** Both lists newest first, `PAGE_SIZE` per page
  (`pageOf`), past the end clamped, each under a kit pager (`bindPager`:
  First, five numbered pages, Last; hidden on one page) and a range caption.

## DOMAIN DEPENDENCIES

- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — content, picker, chart, recent games, live update, empty state.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 2D | 3D switch, the 3D picker, the mode the screen opens on.

## CROSS-REFERENCES

- [records-screen-view.md](records-screen-view.md) — the `#records`
  binder, layout, controller buttons and export.
- [records-store.md](records-store.md) — the queries the screen reads.
- [records.md](records.md) — board labels and the summary stats.
- [records-history.md](records-history.md) — the charts, paging and stats;
  [records-library-view.md](records-library-view.md) — the Replays tab.
- [app-shell.md](app-shell.md) — `RECORDS_PAGE`;
  [app-shell-navigation.md](app-shell-navigation.md) — the `records` route,
  Back; [app-shell-results.md](app-shell-results.md) — the results formats
  and `NOTES`; [app-shell-themes.md](app-shell-themes.md) — the token reader.
- [testing.md](testing.md) — `tests/records-screen*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing what the screen shows or how it picks its mode and board: the
  head comment, `recordsContent` and `RECORDS_MODES` in `screen.js`.
