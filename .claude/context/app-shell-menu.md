# App shell — main menu and last choices

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/menu.js` (the main menu's entries and routes, the
placeholder, the opening selection, the
last mode played and each mode's last board choice),
`js/shell/returning.js` (the board choices' bests, as text, over the
records' queries it is handed, and the board choice panel's stored pin),
and their wiring in `js/main.js`. The
play tiles' previews (`menuPreview`, `js/shell/menu-preview.js`) are
[app-shell-menu-preview.md](app-shell-menu-preview.md). The Daily
screen and board codes (`js/shell/daily.js`, `js/shell/challenge.js`) are
[app-shell-daily.md](app-shell-daily.md). The screens' compositions are the
head comment of `css/components.css` (*Main menu*, *Coming soon*); their
ids are [app-shell-markup.md](app-shell-markup.md) § Screens.

## PUBLIC API

`js/shell/menu.js`
- `MENU_ENTRIES` — the entries in two blocks (`block` 0, the play tiles:
  `classic-2d`, `hexagon`, `triangle`, `surface`, `3d` (`needs:
  'webgl2'`), each a mode, and `daily`, a screen; 1, the small entries:
  `records`, `settings`, each a screen); no Quit, which is the title bar's.
  `UNAVAILABLE_REASONS` and `UNAVAILABLE_SHORT_REASONS` (a phone row's) by
  missing feature (`webgl2`); `PLACEHOLDER_SCREEN` = `'coming-soon'`;
  `COMING_SOON`.
- `buildLabel(version)` → `'Web · v<version>'`, from `VERSION` in
  `js/version.js`, the one place the release version is written.
- `entryReason(entry, missing?)` → reason or null; `entryShortReason(entry,
  missing?)` → its phone row's short reason or null;
  `entryRoute(entry, {hasMode, hasScreen, missing?})` → null (unavailable),
  `{mode}`, `{screen}` or `{screen: 'coming-soon', data: {entry, title}}`.
- `createMenu({router, modes, entries?, missing?})` → `entries`, `route(id)`,
  `unavailable(id)`, `open(id)` (the route taken; null for an unavailable
  entry, which opens nothing).
- `openingEntry(lastMode, {entries?, missing?})` → the entry of the last
  mode played, else the first available entry.
- `menuPreview(id, …)` — what a play tile's preview shows
  ([app-shell-menu-preview.md](app-shell-menu-preview.md)).
- `LAST_MODE_DOC` = `'shell.lastMode'`, `LAST_MODE_VERSION` = 1;
  `createLastMode({storage, modes})` → `current`, `record(mode)`, `load()`
  (null for nothing or a malformed document), `dispose()`.
- `createLastBoardChoice({storage, doc, version?, normalise, fallback})` →
  `current` (`fallback` until loaded or saved), `played`, `load()`,
  `save(choice)` (`RangeError` on a choice `normalise` refuses); the 3D mode
  keeps `mode3d.lastChoice` with it.

`js/shell/returning.js`
- `boardBests(board, records)` → `[{stat, label, value, note}]`: the
  board's best time, 3BV/s and efficiency in the results screen's formats,
  each noted with its date, or a dash and `NO_BEST` (`'no best yet'`); a
  board and its no-guess twin are separate boards. Both board choices'
  `bests`.
- `BOARD_PANEL_DOC` = `'shell.boardPanel'`, `BOARD_PANEL_VERSION`;
  `createBoardPanelPin({storage})` → `pinned`, `load()` (unpinned for a
  missing, malformed or newer document), `setPinned(on)` (kept in memory,
  then saved → the save's `{ok}`; a failed save keeps the pin for the
  session). The board choice panel's pin, one view preference every mode's
  board choice shares, in its own document as `records.view` is
  ([records-library-view.md](records-library-view.md)); Reset all data
  clears it with every document.

## INTERNAL PATTERNS

- **Entries.** Each button — a `ui-play-tile` or a `ui-small-entry`
  (`#menu-entry-<id>`, `data-entry`) — is clicked through `onMenuEntry` →
  `MENU.open(id)`: a registered mode opens its board choice through the
  host, a registered screen is routed to (Records opens on the last board
  played and its mode), anything else — Hexagon, Triangle and Surface,
  whose modes are not registered — goes to `coming-soon`, titled with the
  entry's label. `MISSING` is `webgl2` without WebGL 2; each unavailable
  tile gets `ui.setEntryUnavailable(id, entryReason(…),
  entryShortReason(…))` (aria-disabled, the lock, its reason twice — the
  long one and the phone row's — and its preview locked) and stays
  selectable.
- **Opening selection.** `menuFocusEntry()` is the menu's default focus:
  the entry last opened from the menu (`menuOpened`, kept while Back
  returns to it, forgotten when a game starts), else
  `openingEntry(LAST_MODE.current)`. `LAST_MODE` records the mode of every
  started game but Learn 3D; at boot, once `LAST_MODE.load()` settles, the
  menu refocuses if the player has not moved yet. That mode's board choice
  opens on its last board, so Enter then Play replays it.
- **Layout.** `#menu` (`css/style.css`) holds each window size's fixed
  values from the J-Menu artboards — xl, and l, m and p at the shell's
  breakpoints: the frame's width centred and its inset filling the page's
  height, the body's padding, the buttons' gaps, the preview square, each
  art's size, the tiles' and small entries' labels and icon boxes; the
  kit's base sizes are the largest window's. The `ui-mode-list` fills the
  body: its tiles grid shares the height left over by the small entries,
  every tile one height and never shorter than its content, below which
  the body scrolls. At phone widths every tile is a phone row in one
  column, its preview a strip pinned inside its right end.
- **Board choices.** `showChoice2D` / `showChoice3D` show the last board
  choice (`LAST_CHOICE_2D`, `LAST_CHOICE_3D`); each binder's `bests` is
  `boardBests` over `RECORDS`, `RECORDS.onChange` refreshes both, and
  *All records* in the panel opens the Records screen on the chosen board,
  keeping the screen's `state()` (`held2D`, `held3D`) for the way back.
  Both binders take the one `BOARD_PANEL` pin, loaded before the first
  screen, so pinning the panel on one board choice pins it on every one. The binders are
  [classic2d.md](classic2d.md) and [mode3d.md](mode3d.md); their code
  fields go through [app-shell-daily.md](app-shell-daily.md)'s `checkCode`
  / `playCode`.
- **Build label and touch note.** The foot holds no key hints;
  `ui.setBuild(buildLabel(VERSION))`
  fills `#menu-build`, drawn uppercase in the theme's mono caption style;
  `#touch-note` shows on a coarse-only device, one ink line after the hand
  icon (`ui.setNoMouse` through `setNote`), and on a device with no mouse
  and no touch as the needs-a-mouse warning, no icon.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  main menu's entries and routes, its placeholder and the last mode played.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the menu's and the board choices' layout.

## CROSS-REFERENCES

- [app-shell-menu-preview.md](app-shell-menu-preview.md) — the play
  tiles' previews.
- [app-shell-daily.md](app-shell-daily.md) — the Daily screen, which
  reuses the preview binder, and board codes.
- [platform.md](platform.md) — the storage interface the last mode and last
  board choices save through.
- [records-store.md](records-store.md) — the bests the board choices read.
- [app-shell-kit.md](app-shell-kit.md) — the play tile, the small entry and
  board option components.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (menu, returning).

## WHEN TO READ THE SOURCE

- Adding a menu entry: `MENU_ENTRIES` and `menuPreview`, plus its
  `ui-play-tile` in `#menu`'s `ui-mode-list__tiles`, a router screen and a
  `LAYER_SCREEN` entry ([app-shell-ui.md](app-shell-ui.md) § Controller
  menus); the two-column grid takes it with no change to the menu's
  composition.
