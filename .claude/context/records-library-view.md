# Records screen — the library view and its remembered filter

## OVERVIEW

The Records screen's Replays tab ([records-screen.md](records-screen.md)):
the chosen board's kept replays from the replay library
([replay-library.md](replay-library.md)), paged, with Watch, Download, Pin /
Unpin and Delete per row, Open replay file, and the Pinned first filter
remembered in `records.view`.

- `js/records/replay-list.js` — the library view and the `#records-replays`
  binder; its head comment documents the row shape. Imports `PIN_BEST`
  ([replay-library.md](replay-library.md)).
- `js/records/view-prefs.js` — the remembered Pinned first checkbox, the
  `records.view` document.

## PUBLIC API

Library view (`js/records/replay-list.js`)
- `REPLAY_SCREEN` — `'replay'`; `REPLAYS_EMPTY_TEXT`; `REPLAYS_NOT_SAVED`;
  `REPLAY_HEADERS`; `CODE_HEADER`; `REPLAY_FILE_TYPE` — `'.msrp'`;
  `codeCell(doc, code)` — a table cell holding the code as plain
  monospace text (empty for none), shared by every Records row that names
  one game; `pinGlyph(doc, row)` — a row's pin state as the pin icon, named
  by `pinState`. A row's `code` is its listing's, or null.
- `replayFileName(boardKey, endedAt)` → `"minesweeper-<board key>-<end
  date>.msrp"` (to the second, characters a file name cannot hold replaced
  by `-`), also the replay viewer's download name.
- `replayList(library, boardKey, opts)` → `{ rows, empty, emptyText,
  pinnedFirst, canWatch, page, pages, label, pager }`, each row carrying its
  `file` name. Never throws.
- `pinState(pins)`, `deleteMessage({ date, outcome, pins })`,
  `togglePin(library, row)`, `watchRoute(replayId, returnTo)`,
  `createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst,
  onPage?, onDelete?, onDownload?, onOpenFile? })` → `show(list)`,
  `closeConfirm()`, `isConfirmOpen()`, `hide()`; Open replay file is
  `#records-replays-open`, shown while `list.canOpen`.

Remembered view (`js/records/view-prefs.js`)
- `VIEW_PREFS_DOC` — `'records.view'`, `VIEW_PREFS_VERSION` — 1.
- `createRecordsViewPrefs({ storage })` → `pinnedFirst`, `load()`,
  `setPinnedFirst(on)`.

## INTERNAL PATTERNS

- **The library view.** The board's kept replays (`forBoard`), newest first,
  or pinned first under the filter, remembered in `records.view` (loaded at
  start-up, saved on each change), `PAGE_SIZE` per page under a kit pager.
  A row's actions are quiet small buttons led by their icons — Watch,
  Download (its icon alone), Pin / Unpin, Delete (its trash icon alone),
  each named for its replay. Pin adds the hand pin, Unpin clears every reason. Delete opens
  `#records-replays-confirm`, a `ui-confirm--row`, in a table row under that
  replay's, one cell across every column, the list staying around it (focus
  on Cancel; another row's Delete moves it there); Cancel
  and Back (`RECORDS_PAGE.closeConfirm()` in `shellBack` / `historyBack`)
  return focus to that row's Delete; confirming calls `library.remove`, then
  focus goes to the Delete of the row in its place, else the previous row's,
  else the Pinned first checkbox. A rebuilt list keeps focus on the button of
  the replay that had it.
- **Watch opens the viewer.** Watch shows only when the router registers
  `REPLAY_SCREEN`, and on a best or a game only when its replay is kept;
  `watch(id)` routes to the viewer ([replay-viewer-screen.md](replay-viewer-screen.md))
  with the Records screen on its board to return to.
- **Files.** With the shell's `files` (`{save, pick}`), a row's Download
  saves the stored bytes (`library.bytes`) under its `file` name
  (`RECORDS_PAGE.downloadReplay`); with the viewer's route too, Open replay
  file picks a file and routes to the viewer with `{file, returnTo}`
  (`RECORDS_PAGE.openReplayFile`). An imported replay is watched, never
  added to the library.

## DOMAIN DEPENDENCIES

- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the library view, pin state and filter, Watch.
- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — replay file download and import.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the quiet icon row actions and the inline confirm row.

## CROSS-REFERENCES

- [records-screen.md](records-screen.md) — the screen that composes it and
  its controller's `downloadReplay` / `openReplayFile`.
- [replay-library.md](replay-library.md) — the library it lists and pins.
- [platform.md](platform.md) — the document interface `records.view` uses.
- [app-shell-replay.md](app-shell-replay.md) — the shell's replay files and
  the viewer route.
- [testing.md](testing.md) — `tests/records-replays.test.mjs`,
  `tests/records-view-prefs.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the library view's rows, order or buttons: the head comment of
  `replay-list.js`; its composition, `createRecordsScreen` and
  `createRecordsView` in `screen.js`.
