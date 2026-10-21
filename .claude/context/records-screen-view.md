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
  chart?, bestChart? })` →
  `show(content)`, `hide()`, `closeConfirm()`, `isConfirmOpen()`; the
  switch is `#records-mode` in the head and `#records-mode-touch`, the
  phone's bar, both bound; the charts default to `#records-chart` and
  `#records-best-chart`, drawn on every show; the tabs `#records-tabs` are
  a kit tablist (`bindTabs`), each showing the panel its `aria-controls`
  names; a best's Watch is an inline `ui-link` in its tile's note, a list
  row's a quiet small button led by the film icon; the games, Top 10 and
  library tables gain a Board code column of plain text (`codeCell`), and
  a recent game or replay its outcome as a kit chip (`outcomeChip`,
  `js/records/replay-list.js`).
- `TRIGGER_MODES` — `{lt: 'classic-2d', rt: '3d'}`, the triggers' modes.

Export (`js/records/export.js`)
- `createRecordsExport({ records, replays?, now?, trigger?, objectUrl? })` →
  `hasGames()`, `csv()`, `json()`, `save(format)`; `exportCsv`,
  `exportJson`, `exportGames`, `csvField`, `dateStamp`, `CSV_HEADERS`,
  `EXPORT_FORMAT`, `EXPORT_LINE`, `NOTHING_TO_EXPORT`;
  `bindExportActions({ csv, json, note }, { onExport })` → `show(exportable)`.

## INTERNAL PATTERNS

- **Layout** (`css/components.css` head comment, *Records*; `css/style.css`
  places it). `#records` is a `ui-frame` inset on the backdrop at each
  window step's canvas size (J-Records-xl, -l, -m), not full height: Back
  ("Main menu", "Back" on a phone) and the 2D | 3D switch in its head, the
  picker one line across the top of its body, scrolling sideways under a
  fade, then a `ui-columns--two` — the left column at a fixed width per
  window step, its sections on the frame under section labels (the bests
  as three `ui-stat--tile`s across at every size, each figure shrinking
  with its tile to stay on one line; the counters as a grid of sunk tiles,
  two across on a phone; the averages table and the win rate line), the
  overall line in the one muted panel, the export actions; the right
  column the history with no panel or heading — the period and outcome
  choices on one row, both charts in a `ui-columns--pair` (stacked in the
  narrowest two-column step), then the Recent games | Top 10 | Replays |
  Leaderboards tabs, Leaderboards a coming-soon panel with no pager. From
  the kit breakpoint each column scrolls on its own; below it one column
  and the body scrolls. A board with no games keeps every part, figures
  and averages showing dashes and both charts their empty line; only the
  win rate line hides. Each table keeps one line per row, scrolling
  sideways in its own box (`#records-games-scroll`, `#records-top-scroll`,
  `#records-replays-scroll`) when narrower, and shows its Board code column
  on the largest window step only. On a phone the frame is full-bleed, the
  head holds Back and the title, `#records-mode-touch` is the full-width
  switch under it and each averages row is a card; a time never wraps.
- **Export.** `js/main.js` builds one `RECORDS_EXPORT` over the store and
  the library; the screen's actions under the mode's overall figures and
  the Settings Data panel's both save through it, disabled until a game is
  recorded — the screen's with `NOTHING_TO_EXPORT` in its note line, the
  Settings panel's with no line.
- **Controller.** `padRecords` in `js/main.js` (off while a
  confirmation is open): LT / RT choose the mode (`TRIGGER_MODES`), LB / RB
  step the board (`stepBoard`); `[data-pad-glyph]` hints beside the switch
  and the picker show the active pad's glyphs (`UI.setPad`). The arrow keys
  do not walk Records; the D-pad walks it column by column
  ([app-shell-focus.md](app-shell-focus.md) § Focus walk). The glyphs take
  no room while hidden.

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
  [app-shell-kit.md](app-shell-kit.md) — the columns and tabs;
  [app-shell-kit-layout.md](app-shell-kit-layout.md) — the frame and stat tile; [app-shell-markup.md](app-shell-markup.md) — the `#records` markup.
- [testing.md](testing.md) — `tests/records-screen*.test.mjs`,
  `tests/records-export.test.mjs`, `tests/shell-pad-walk.test.mjs` (the
  controller on Records).

## WHEN TO READ THE SOURCE

- Changing the screen's layout: its markup is `#records` in `index.html`,
  catalogued in `css/components.css`; its placement per window step is
  `css/style.css`'s Records block, its colours `themes/<id>/theme.css`.
- Changing the export's columns or files: the head comment of `export.js`.
