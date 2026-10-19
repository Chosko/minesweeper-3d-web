# App shell — main menu, its preview, last choices, Daily and board codes

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/menu.js` (the main menu's entries and routes, the
placeholder, the opening selection, what each entry's preview shows, the
last mode played and each mode's last board choice),
`js/shell/menu-preview.js` (the preview binder and its Classic 2D boards),
`js/shell/returning.js` (the board choices' bests, as text; pure, over the
records' queries it is handed), `js/shell/daily.js` and
`js/shell/challenge.js`, and their wiring in `js/main.js`. The screens'
compositions are the head comment of `css/components.css` (*Main menu*,
*Daily*, *Coming soon*); their ids are
[app-shell-markup.md](app-shell-markup.md) § Screens.

## PUBLIC API

`js/shell/menu.js`
- `MENU_ENTRIES` — nine entries in three blocks (`block` 0: `classic-2d`,
  `hexagon`, `triangle`, `surface`, `3d` (`needs: 'webgl2'`), each a mode;
  1: `daily`, `records`, `settings`, each a screen; 2: `quit`, `needs:
  'desktop'`). `UNAVAILABLE_REASONS` by missing feature (`webgl2`,
  `desktop`); `WEB_MISSING` (`['desktop']`, what the web build always
  lacks); `PLACEHOLDER_SCREEN` = `'coming-soon'`; `COMING_SOON`.
- `buildLabel(version)` → `'Web · v<version>'`, from `VERSION` in
  `js/version.js`, the one place the release version is written.
- `entryReason(entry, missing?)` → reason or null;
  `entryRoute(entry, {hasMode, hasScreen, missing?})` → null (unavailable),
  `{mode}`, `{screen}` or `{screen: 'coming-soon', data: {entry, title}}`.
- `createMenu({router, modes, entries?, missing?})` → `entries`, `route(id)`,
  `unavailable(id)`, `open(id)` (the route taken; null for an unavailable
  entry, which opens nothing).
- `openingEntry(lastMode, {entries?, missing?})` → the entry of the last
  mode played, else the first available entry.
- `menuPreview(id, {entries?, missing?, hasMode?})` → what the preview
  shows, as data: `{kind: 'board' | 'scene' | 'still' | 'daily' | 'badge',
  …}` (its head comment); `DEMO_BOARD_3D`, the size of the 3D preview's
  and the backdrop's demo board.
- `LAST_MODE_DOC` = `'shell.lastMode'`, `LAST_MODE_VERSION` = 1;
  `createLastMode({storage, modes})` → `current`, `record(mode)`, `load()`
  (null for nothing or a malformed document), `dispose()`.
- `createLastBoardChoice({storage, doc, version?, normalise, fallback})` →
  `current` (`fallback` until loaded or saved), `played`, `load()`,
  `save(choice)` (`RangeError` on a choice `normalise` refuses); the 3D mode
  keeps `mode3d.lastChoice` with it.

`js/shell/menu-preview.js` (its head comment is the contract)
- `DEMO_SEED`; `demoBoard2D()` → `{grid, game}`, the Classic 2D preview's
  Intermediate board, the same on every load; `dailyBoard2D(daily)` →
  `{grid, game, mark}`, today's daily Expert board closed with its start
  cell.
- `bindMenuPreview({panel, stage, tag, iconOf, mountBoard, boardOf})` →
  `{show(preview), shown}` over a `ui-scene-panel`: a board view per board
  kind, mounted once and kept in its own `[data-preview]` layer; the panel
  `ui-scene-panel--live` only for `scene`; a card (badge, name, note) for
  `badge`. The Daily screen reuses it.

`js/shell/returning.js`
- `boardBests(board, records)` → `[{stat, label, value, note}]`: the
  board's best time, 3BV/s and efficiency in the results screen's formats,
  each noted with its date, or a dash and `NO_BEST` (`'no best yet'`); a
  board and its no-guess twin are separate boards. Both board choices'
  `bests`.

`js/shell/daily.js` (its head comment is the contract)
- `DAILY_SCREEN` = `'daily'`, `NOT_PLAYED`, `LOST`; `dailyIdentity(id)`,
  `countedAttempt(records, id, date)` — the first daily game of that date
  on the row's Daily board.
- `dailyRows({records, replays?, now?, unavailable?})` → per daily board
  `{id, mode, label, board, line, date, dateLabel, code, state, result,
  current, longest, streak, canPlay, attempt, watch, reason}`; `result` a
  won row's time in the standard time format (`formatTime`, *Won 48.213 s*).
- `dailyModes({records, replays?, now?, unavailable?, entries?})` → one
  entry per mode of `MENU_ENTRIES` in menu order, `{mode, label, daily,
  line, title, summary, note, canPlay}`, `daily` null (*Coming soon*) for a
  mode with no daily board; `dailyPanel(entry, {missing?})` → its preview
  (`daily`, `scene`, `still` or `badge`); `dailyPreview(now?)` → the menu's
  Daily preview `{board, startCell, date, dateLabel, tag}`.
- `createDailyBoards({clients})` → `{prepare(records, now?), take(code),
  has(code)}`: today's unused boards pre-generated through each mode's
  client, held by code; `take` hands one over once.
- `bindDailyScreen({root, onPlay, onWatch, onBack, onCopy?, onSelect?})` →
  `{show(entries), select(mode), selected, defaultFocus()}` over `#daily`.

`js/shell/challenge.js`
- `resolveCode(text, {today, mode?})` → `{kind: 'refused' | 'daily' |
  'challenge', …}`; `otherModeHint(mode)`; `gameStart({board, seed,
  startCell, daily?, pregenerated?})` → `{mode, choice}` (2D `fixed`, 3D
  `forced`); `freeStart(board)`; `boardHash(hash)`;
  `createChallengeLinks({location, history, onDaily, onChallenge,
  onRefused, started, unavailable?, toast?})` → `{start(), hashchange()}`;
  `STARTED_TOAST`.

## INTERNAL PATTERNS

- **Entries.** Each `ui-mode-entry` (`#menu-entry-<id>`, `data-entry`) is
  clicked through `onMenuEntry` → `MENU.open(id)`: a registered mode opens
  its board choice through the host, a registered screen is routed to
  (Records opens on the last board played and its mode), anything else —
  Hexagon, Triangle and Surface, whose modes are not registered — goes to
  `coming-soon`, titled with the entry's label. `MISSING` is `WEB_MISSING`
  plus `webgl2` without WebGL 2; each unavailable entry gets
  `ui.setEntryUnavailable(id, reason)` (aria-disabled, its reason line, the
  lock) and stays selectable so its preview shows.
- **Opening selection.** `menuFocusEntry()` is the menu's default focus:
  the entry last opened from the menu (`menuOpened`, kept while Back
  returns to it, forgotten when a game starts), else
  `openingEntry(LAST_MODE.current)`. `LAST_MODE` records the mode of every
  started game but Learn 3D; `ui.setLastMode` puts the Last played chip on
  its entry, and at boot, once `LAST_MODE.load()` settles, the menu
  refocuses if the player has not moved yet. That mode's board choice opens
  on its last board, so Enter then Play replays it.
- **Layout.** `#menu` is a grid (`css/style.css`): the wordmark over the
  entries (left) and the preview (right), the key hints and the build label
  under them. The entries and the preview share one grid row, so the
  `ui-mode-list` takes exactly the preview's height; every entry has
  `flex-basis: 0` and grows to an equal share, the selected one by the
  theme's larger `flex-grow`, and a gap opens before each block's first
  entry (`data-block-start`). With a coarse pointer every entry is at least
  the coarse-pointer touch target tall. At phone widths the preview goes and
  the entries fill the screen.
- **Preview.** `MENU_PREVIEW` follows the focus among the entries
  (`focusin` → `showPreview`, the focused entry's or, with none focused,
  the opening entry's): `menuPreview` gives the kind and `previewOf` names
  the Daily preview's date. The Classic 2D boards are drawn by
  `mountBoardView` ([classic2d-board-view.md](classic2d-board-view.md));
  the 3D one is the demo board the renderer draws into the panel
  ([app-shell-3d.md](app-shell-3d.md) § Scene panel), drawn only while that
  preview shows.
- **Daily and challenges in `js/main.js`.** `DAILY_BOARDS_HELD` (clients:
  `mode2d.client`, `GEN_3D` given WebGL 2) is prepared on every menu show;
  `DAILY_VIEW` fills `#daily` on its router screen (`DAILY_SCREEN`, default
  focus the selected mode's entry, the first playable one on a first show);
  each selection shows `DAILY_PREVIEW` (`bindMenuPreview` over
  `#daily-preview`), and the 3D one puts today's closed cube with its marked
  start cube in the renderer (`showDailyScene`), drawn in front of the frame
  through its scene panel. `playDaily` refuses a used attempt, takes the
  held board and starts through `startForced` (`MODES.start`, then
  `enterPlay3D` for 3D); `playChallenge` the same from a parsed code. Both
  board choices' code fields go through `checkCode` / `playCode` (today's
  daily code routes to `daily`), and `LINKS` follows `#board=` links. A
  daily or challenge saves no last choice; the results flow's Play again
  after one, once its mode was left, starts `freeStart(summary.board)`,
  whose 2D choice carries `remember: false`, so it saves none either. A
  challenge route's parse has no `daily`: another day's daily code is a
  challenge.
- **Board choices.** `showChoice2D` / `showChoice3D` show the last board
  choice (`LAST_CHOICE_2D`, `LAST_CHOICE_3D`); each binder's `bests` is
  `boardBests` over `RECORDS`, `RECORDS.onChange` refreshes both, and
  Records opens the Records screen on the chosen board, keeping the
  screen's `state()` (`held2D`, `held3D`) for the way back. The binders are
  [classic2d.md](classic2d.md) and [mode3d.md](mode3d.md).
- **Key hints and build label.** `#menu-hints` holds the move and select
  hints for the active device (no Back); `ui.setBuild(buildLabel(VERSION))`
  fills `#menu-build`; `#touch-note` shows on a coarse-only device.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  main menu's entries and routes, its placeholder and the last mode played.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the menu's, the board choices' and the Daily screen's layout.

## CROSS-REFERENCES

- [platform.md](platform.md) — the storage interface the last mode and last
  board choices save through.
- [records-store.md](records-store.md) — the bests and the history the
  board choices and the Daily screen read.
- [app-shell-kit.md](app-shell-kit.md) — the mode entry, scene panel and
  board option components.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (menu, returning,
  daily, challenge).

## WHEN TO READ THE SOURCE

- Adding a menu entry: `MENU_ENTRIES` and `menuPreview`, plus its
  `ui-mode-entry` in `#menu`, a router screen and a `LAYER_SCREEN` entry
  ([app-shell-ui.md](app-shell-ui.md) § Controller menus); the
  `ui-mode-list` takes it with no change to the menu's composition.
- Changing what a preview shows: `menuPreview`, `dailyPanel` and the head
  comment of `js/shell/menu-preview.js`.
- Changing the Daily screen: the head comment of `js/shell/daily.js`.
