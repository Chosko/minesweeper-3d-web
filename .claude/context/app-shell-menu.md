# App shell — main menu and last choices

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/menu.js` (the main menu's entries and routes, the
placeholder, the opening selection, the
last mode played and each mode's last board choice),
`js/shell/returning.js` (the board choices' bests, as text; pure, over the
records' queries it is handed), and their wiring in `js/main.js`. The
selected entry's preview (`menuPreview`, `js/shell/menu-preview.js`) is
[app-shell-menu-preview.md](app-shell-menu-preview.md). The Daily
screen and board codes (`js/shell/daily.js`, `js/shell/challenge.js`) are
[app-shell-daily.md](app-shell-daily.md). The screens' compositions are the
head comment of `css/components.css` (*Main menu*, *Coming soon*); their
ids are [app-shell-markup.md](app-shell-markup.md) § Screens.

## PUBLIC API

`js/shell/menu.js`
- `MENU_ENTRIES` — the entries in three blocks (`block` 0: `classic-2d`,
  `hexagon`, `triangle`, `surface`, `3d` (`needs: 'webgl2'`), each a mode;
  1: `daily`, `records`, `settings`, each a screen; 2: `quit`, `needs:
  'desktop'`). `UNAVAILABLE_REASONS` by missing feature (`webgl2`,
  `desktop`); `WEB_MISSING` (`['desktop']`, what the web build always
  lacks); `PLACEHOLDER_SCREEN` = `'coming-soon'`; `COMING_SOON`.
- `buildLabel(version)` → `'Web · v<version>'`, from `VERSION` in
  `js/version.js`, the one place the release version is written.
- `entryReason(entry, missing?)` → reason or null; `entryReasonLine(entry,
  missing?)` → the line its menu entry shows: the reason, but none for what
  the web build always lacks (`WEB_MISSING`: Quit shows its lock alone);
  `entryRoute(entry, {hasMode, hasScreen, missing?})` → null (unavailable),
  `{mode}`, `{screen}` or `{screen: 'coming-soon', data: {entry, title}}`.
- `createMenu({router, modes, entries?, missing?})` → `entries`, `route(id)`,
  `unavailable(id)`, `open(id)` (the route taken; null for an unavailable
  entry, which opens nothing).
- `openingEntry(lastMode, {entries?, missing?})` → the entry of the last
  mode played, else the first available entry.- `menuPreview(id, …)` — what the preview shows
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

## INTERNAL PATTERNS

- **Entries.** Each `ui-mode-entry` (`#menu-entry-<id>`, `data-entry`) is
  clicked through `onMenuEntry` → `MENU.open(id)`: a registered mode opens
  its board choice through the host, a registered screen is routed to
  (Records opens on the last board played and its mode), anything else —
  Hexagon, Triangle and Surface, whose modes are not registered — goes to
  `coming-soon`, titled with the entry's label. `MISSING` is `WEB_MISSING`
  plus `webgl2` without WebGL 2; each unavailable entry gets
  `ui.setEntryUnavailable(id, entryReasonLine(…))` (aria-disabled, the lock,
  and its reason line when it has one — 3D without WebGL 2, not Quit) and
  stays selectable so its preview shows, the preview's card noting the
  reason.
- **Opening selection.** `menuFocusEntry()` is the menu's default focus:
  the entry last opened from the menu (`menuOpened`, kept while Back
  returns to it, forgotten when a game starts), else
  `openingEntry(LAST_MODE.current)`. `LAST_MODE` records the mode of every
  started game but Learn 3D; `ui.setLastMode` puts the Last played chip on
  its entry, and at boot, once `LAST_MODE.load()` settles, the menu
  refocuses if the player has not moved yet. That mode's board choice opens
  on its last board, so Enter then Play replays it.
- **Layout.** `#menu` is a grid (`css/style.css`) holding each window
  size's fixed values from the J-Menu artboards — xl, and l, m and p at the
  shell's breakpoints: the wordmark in its band, the entries' column and
  the preview's column with the gap between them, the foot with the key
  hints and the build label. The columns centre in a window wider than the
  artboard and the preview narrows in a narrower one; the entries' row
  shrinks on a shorter window down to its entries' floor, below which the
  menu scrolls (`overflow-y: auto`). The entries and the preview share that
  row, so the `ui-mode-list` takes exactly the preview's height; every entry
  has `flex-basis: 0` and grows to an equal share, at least the entries' floor (a
  finger tall on any pointer), the selected one by a larger
  `flex-grow` and to a minimum height (the theme's at xl, the shell's per
  size below it); a block's first entry (`data-block-start`) sits a
  spacer further than the list's gap. Below xl the shell sizes the labels,
  icon boxes and glyphs at rest and selected; the theme rounds the icon box
  to match. The preview's inset per size:
  [app-shell-menu-preview.md](app-shell-menu-preview.md). At phone widths
  the preview goes and the entries fill the screen above a fixed foot band.
- **Board choices.** `showChoice2D` / `showChoice3D` show the last board
  choice (`LAST_CHOICE_2D`, `LAST_CHOICE_3D`); each binder's `bests` is
  `boardBests` over `RECORDS`, `RECORDS.onChange` refreshes both, and
  Records opens the Records screen on the chosen board, keeping the
  screen's `state()` (`held2D`, `held3D`) for the way back. The binders are
  [classic2d.md](classic2d.md) and [mode3d.md](mode3d.md); their code
  fields go through [app-shell-daily.md](app-shell-daily.md)'s `checkCode`
  / `playCode`.
- **Key hints and build label.** `#menu-hints` holds the move and select
  hints for the active device (no Back); `ui.setBuild(buildLabel(VERSION))`
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

- [app-shell-menu-preview.md](app-shell-menu-preview.md) — the preview
  panel beside the entries.
- [app-shell-daily.md](app-shell-daily.md) — the Daily screen, which
  reuses the preview binder, and board codes.
- [platform.md](platform.md) — the storage interface the last mode and last
  board choices save through.
- [records-store.md](records-store.md) — the bests the board choices read.
- [app-shell-kit.md](app-shell-kit.md) — the mode entry, scene panel and
  board option components.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (menu, returning).

## WHEN TO READ THE SOURCE

- Adding a menu entry: `MENU_ENTRIES` and `menuPreview`, plus its
  `ui-mode-entry` in `#menu`, a router screen and a `LAYER_SCREEN` entry
  ([app-shell-ui.md](app-shell-ui.md) § Controller menus); the
  `ui-mode-list` takes it with no change to the menu's composition.
