# App shell — main menu, last choices, the returning player's surfaces

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/menu.js` (the main menu's entries and routes, the
placeholder, the last mode played and each mode's last board choice),
`js/shell/returning.js` (the board choices' preset detail lines, the menu's
session strip and Play again, as text; pure, over the records' queries it is
handed — formats in its head comment) and their wiring in `js/main.js`.
The menu's markup is [app-shell-kit.md](app-shell-kit.md) § Screens.

## PUBLIC API

`js/shell/menu.js`
- `MENU_ENTRIES` — `classic-2d` (mode), `3d` (mode, `needs: 'webgl2'`),
  `records` (screen), `settings` (screen), in that order;
  `PLACEHOLDER_SCREEN` = `'coming-soon'`; `UNAVAILABLE_REASONS` by missing
  browser feature (`webgl2`).
- `entryReason(entry, missing?)` → reason or null.
- `entryRoute(entry, {hasMode, hasScreen, missing?})` → null (unavailable),
  `{mode}`, `{screen}` or `{screen: 'coming-soon', data: {entry, title}}`.
- `createMenu({router, modes, entries?, missing?})` → `entries`, `route(id)`,
  `unavailable(id)`, `open(id)` (the route taken; null for an unavailable
  entry).
- `LAST_MODE_DOC` = `'shell.lastMode'`, `LAST_MODE_VERSION` = 1;
  `createLastMode({storage, modes})` → `current`, `record(mode)`, `load()`
  (null for nothing or a malformed document), `dispose()`.
- `createLastBoardChoice({storage, doc, version?, normalise, fallback})` →
  `current` (`fallback` until loaded or saved), `played`, `load()`,
  `save(choice)` (`RangeError` on a choice `normalise` refuses); the 3D mode
  keeps `mode3d.lastChoice` with it.

`js/shell/returning.js`
- `densityText(board)` → `'7.8 % mines'`; `presetDetail(board, records)` →
  `'7.8 % mines · ~120 3BV · Best 48.213 s · 3 in a row'` (3BV from
  `typicalBbbv`, [records.md](records.md); `—` with no best).
- `CHOICE_ITEMS` — `{'classic-2d': {beginner, intermediate, expert}, '3d':
  {<preset id>}}`; `presetDetails(items, records)` → `{[item]: {guess,
  noGuess}}`, the `details` both board choice binders' `show` take.
- `lastBoard(mode, {[mode]: {choice, played}})` → `{mode, choice, board}` or
  null.
- `sessionStrip(board, records, now?)` → `'Expert · best 13.343 s · today 7
  games · streak 2'`; `playAgainLabel(board)` → `'Play again: Expert ·
  no-guess'`; `returningMenu({last, records, missing?, now?})` → `{strip,
  again}`, `again` null for a 3D board when `missing` holds `'webgl2'`.

## INTERNAL PATTERNS

- **Entries.** Four kit entries (`data-entry`) clicked through
  `onMenuEntry` → `MENU.open(id)`: a registered mode opens its board choice
  through the host, a registered screen is routed to (Records opens on the
  last board played and its mode), anything else goes to `coming-soon`.
  No current entry reaches the placeholder; `tests/shell-menu.test.mjs`
  exercises it with a menu whose Records entry names an unregistered
  screen (the router itself throws on an unknown screen).
- **Last mode.** `LAST_MODE` stores the mode of every started game; at boot
  `load()` marks the entry and refocuses it if the player has not moved yet.
- **Returning player.** `lastPlayed()` is `lastBoard` over `LAST_MODE`,
  `LAST_CHOICE_2D` (played once it is not `DEFAULT_CHOICE`) and
  `LAST_CHOICE_3D.played`. `showReturning()` hands `returningMenu(...)` to
  `ui.setReturning` on the menu's show, on every `RECORDS.onChange` and once
  `LAST_MODE.load()` and the 2D last choice have settled.
- **Play again from the menu.** `playAgainFromMenu(source)` (only on the
  menu) unlocks audio and starts the last board, saving nothing new:
  `MODES.start('classic-2d', choice)`, or, given `WEBGL2`,
  `MODES.start('3d', boardOf(choice))` then `enterPlay3D(source)`
  ([app-shell-3d.md](app-shell-3d.md)).
- Both board choices' `show` receive `presetDetails(CHOICE_ITEMS[mode],
  RECORDS)`; the binders themselves are [mode3d.md](mode3d.md) and
  [classic2d.md](classic2d.md).

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  main menu and its placeholder.

## CROSS-REFERENCES

- [platform.md](platform.md) — the storage interface the last mode and last
  board choices save through.
- [records.md](records.md) — `typicalBbbv`;
  [records-store.md](records-store.md) — counters, history and bests the
  returning surfaces read.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (menu, returning).

## WHEN TO READ THE SOURCE

- Adding a menu entry: `MENU_ENTRIES`, plus the markup, a router screen and
  a `LAYER_SCREEN` entry ([app-shell-ui.md](app-shell-ui.md) § Controller
  menus).
- Changing a returning surface's wording: the head comment of
  `js/shell/returning.js`.
