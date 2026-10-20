# Records screen — view, layout, controller and export

## OVERVIEW

The Records screen's page side: the `#records` binder and the screen's
layout in its frame, the controller's buttons on it, and the export of
every game. The screen's content, controller (`createRecordsScreen`),
opening mode and board, live update and filters are
[records-screen.md](records-screen.md).

- `js/records/screen.js` — the `#records` binder (`createRecordsView`).
- `js/records/export.js` — the CSV and JSON export of every game and the
  kept replays' listing, the injected download, and the export actions'
  binder shared with the Settings page's Data panel.

## PUBLIC API

Records view (`js/records/screen.js`)
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
- `TRIGGER_MODES` — `{lt: 'classic-2d', rt: '3d'}`, the triggers' modes.

Export (`js/records/export.js`)
- `createRecordsExport({ records, replays?, now?, trigger?, objectUrl? })` →
  `hasGames()`, `csv()`, `json()`, `save(format)`; `exportCsv`,
  `exportJson`, `exportGames`, `csvField`, `dateStamp`, `CSV_HEADERS`,
  `EXPORT_FORMAT`, `EXPORT_LINE`, `NOTHING_TO_EXPORT`;
  `bindExportActions({ csv, json, note }, { onExport })` → `show(exportable)`.

## INTERNAL PATTERNS

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
- **Export.** `js/main.js` builds one `RECORDS_EXPORT` over the store and
  the library; the screen's actions under the mode's overall figures and
  the Settings Data panel's both save through it, disabled with `NOTHING_TO_EXPORT` until a
  game is recorded.
- **Controller.** `padRecords` in `js/main.js` (off while a modal or a
  confirmation is open): LT / RT choose the mode (`TRIGGER_MODES`), LB / RB
  step the board (`stepBoard`); `[data-pad-glyph]` hints beside the switch
  and the picker show the active pad's glyphs (`UI.setPad`). The arrow keys
  do not walk Records; the D-pad walks it column by column
  ([app-shell-focus.md](app-shell-focus.md) § Focus walk).

## DOMAIN DEPENDENCIES

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the screen in the frame, the Leaderboards tab's coming-soon panel.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the export.

## CROSS-REFERENCES

- [records-screen.md](records-screen.md) — the content the view shows and
  the controller its callbacks reach.
- [records-library-view.md](records-library-view.md) — `outcomeChip` and
  the Replays tab.
- [settings-page.md](settings-page.md) — the Data panel's export actions.
- [app-shell-focus.md](app-shell-focus.md) — the focus walk;
  [app-shell-kit.md](app-shell-kit.md) — the frame, columns, stat tile and
  tabs; [app-shell-markup.md](app-shell-markup.md) — the `#records` markup.
- [testing.md](testing.md) — `tests/records-screen*.test.mjs`,
  `tests/records-export.test.mjs`, `tests/shell-pad-walk.test.mjs` (the
  controller on Records).

## WHEN TO READ THE SOURCE

- Changing the screen's layout: its markup is `#records` in `index.html`,
  catalogued in `css/components.css`; the stacking tables are
  `css/style.css`'s container queries.
- Changing the export's columns or files: the head comment of `export.js`.
