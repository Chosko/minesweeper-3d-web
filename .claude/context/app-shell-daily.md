# App shell — Daily screen and board codes

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/daily.js` (the Daily screen listing every mode, a daily
board each for Classic 2D, Hexagon, Triangle and 3D, their pre-generated
boards and counted attempts), `js/shell/challenge.js` (board
codes typed into the board choices and `#board=` links, for every mode), and their wiring
in `js/main.js`. The main menu, its play tiles' previews and the board choices' wiring
are [app-shell-menu.md](app-shell-menu.md). The Daily screen's composition
is the head comment of `css/components.css` (*Daily*); its ids are
[app-shell-markup.md](app-shell-markup.md) § Screens.

## PUBLIC API

`js/shell/daily.js` (its head comment is the contract)
- `DAILY_SCREEN` = `'daily'`, `NOT_PLAYED`, `WON`, `LOST`; `dailyIdentity(id)`,
  `countedAttempt(records, id, date)` — the first daily game of that date
  on the row's Daily board.
- `dailyRows({records, replays?, now?, unavailable?})` → per daily board
  `{id, mode, label, board, line, date, dateLabel, code, state, result,
  time, current, longest, streak, canPlay, attempt, watch, reason}`;
  `result` a won row's time in the standard time format (`formatTime`, *Won
  48.213 s*), `time` that time alone (null unless won) — the screen shows
  the state chip (*Won*) and the time apart from it.
- `dailyModes({records, replays?, now?, unavailable?, entries?})` → one
  entry per mode of `MENU_ENTRIES` in menu order, `{mode, label, daily,
  line, title, summary, note, canPlay}`, `daily` null for a mode with no
  daily board — Surface, the one *Coming soon* row, its note saying it has
  no daily board yet —; `dailyPanel(entry, {missing?})` → its preview:
  `daily` with the row's `grid` and the entry and label of the card a
  failed mount shows (Classic 2D, Hexagon, Triangle), `scene` or `still`
  (3D), `badge` (*Coming soon*); `dailyPreview(now?, grid?)` → the closed
  daily board of the flat mode on grid kind `grid` (`'square'` by default,
  `'hex'`, `'tri'`; a grid with no daily board throws a `RangeError`)
  `{board, startCell, date, dateLabel, tag}`.
- `createDailyBoards({clients})` → `{prepare(records, now?), take(code),
  has(code)}`: today's unused boards pre-generated through each mode's
  client, held by code; `take` hands one over once.
- `bindDailyScreen({root, onPlay, onWatch, onBack, onCopy?, onSelect?})` →
  `{show(entries), select(mode), selected, defaultFocus()}` over `#daily`;
  the parts it fills are its head comment's.

`js/shell/challenge.js`
- `resolveCode(text, {today, mode?})` → `{kind: 'refused' | 'daily' |
  'challenge', …}`, a code of another mode refused with `otherMode` its
  mode; `otherModeHint(mode)`, naming the mode from `MODE_NAMES` (Classic
  2D, Hexagon, Triangle, 3D); `gameStart({board, seed,
  startCell, daily?, pregenerated?})` → `{mode, choice}` in the board's own
  mode (a flat mode's choice `fixed`, 3D `forced`); `freeStart(board)`; `boardHash(hash)`;
  `createChallengeLinks({location, history, onDaily, onChallenge,
  onRefused, started, unavailable?, toast?})` → `{start(), hashchange()}`;
  `STARTED_TOAST`.

## INTERNAL PATTERNS

- **Layout.** The Daily screen takes the Classic 2D board choice's placement
  and step rules in `css/style.css` (the window under the title bar, the window widths,
  the denser rows of the smaller desktop windows, the phone's full-bleed
  column with its pinned bar), with its own fixed-width mode column per
  size; a flat mode's daily board keeps the panel's proportions, the 3D
  scene and a card a fixed-height plain panel (`#daily-preview`,
  styled in the theme). Back and Play carry key hints (`#daily` is one of
  `js/ui.js`'s `showKeyHints` roots); the code chip is Daily's own markup
  under its "Board code" section label (`#daily-code-group`). The parts and
  their order are the composition comment in `css/components.css`
  (*Daily*).

- **Daily and challenges in `js/main.js`.** `DAILY_BOARDS_HELD` (clients:
  each mode's one warm client — `mode2d.client`, `HEX_MODE`'s and
  `TRI_MODE`'s, `GEN_3D` given WebGL 2) is prepared on every menu show and
  never waited for;
  `DAILY_VIEW` fills `#daily` on its router screen (`DAILY_SCREEN`, default
  focus the selected mode's entry, the first playable one on a first show);
  each selection shows `DAILY_PREVIEW` (`bindMenuPreview` over
  `#daily-preview`, [app-shell-menu-preview.md](app-shell-menu-preview.md)): a flat mode's
  closed daily board with its marked start cell, drawn by the flat board
  view over the row's grid (`boardOf(kind, grid)` → `dailyPreview(now,
  grid)`) in its board frame on the screen's body, the panel showing none
  of itself (`#daily-preview[data-shows="daily"]`) — one board view per
  grid, the mode's card when its view fails to mount —, and the 3D one
  puts today's closed cube with its marked start cube in the renderer
  (`showDailyScene`), drawn in front of the frame through its scene panel.
  `playDaily` refuses a used attempt, takes the held board (or generates
  it) and starts it in its own mode through `gameStart` and `startForced`
  (`MODES.start`, then `enterPlay3D` for 3D);
  `playChallenge` the same from a parsed code. A code names its mode:
  `parseBoardCode` reads a hexagon or triangle board from its `H` or `T`
  token ([records-board-code.md](records-board-code.md)), so a challenge
  starts in Classic 2D, Hexagon, Triangle or 3D through `gameStart`,
  whether typed into its board choice or opened as a `#board=` link, and a
  board choice refuses another mode's code with `otherModeHint`. A coded
  no-guess board that fails generation gets the failure offer with no
  replacement board. Every board choice's code field goes through
  `checkCode` / `playCode` (today's daily code routes to
  `daily`; an accepted challenge's line names its board through
  `codeBoardLine` and its marked start cell or cube, that board line its
  label for the summary), and `LINKS` follows `#board=` links. A daily or challenge saves
  no last choice; the results flow's Play again after one, once its mode
  was left, starts `freeStart(summary.board)`, whose 2D choice carries
  `remember: false`, so it saves none either. A challenge route's parse has
  no `daily`: another day's daily code is a challenge in its mode.

## DOMAIN DEPENDENCIES

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the Daily screen's layout.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  Daily entry and its route.

## CROSS-REFERENCES

- [app-shell-menu.md](app-shell-menu.md) — the main menu, the board
  choices whose code fields route here;
  [app-shell-menu-preview.md](app-shell-menu-preview.md) — the preview
  binder the Daily screen reuses.
- [records-board-code.md](records-board-code.md) — board codes, the daily
  seed and the daily boards.
- [records-store.md](records-store.md) — the history the Daily screen
  reads.
- [generation.md](generation.md) — the clients the daily boards are
  pre-generated through.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (daily — the
  Hexagon and Triangle rows, panels and previews, and today's Hexagon daily
  played in a browser among them —, challenge — a hexagon or triangle code
  and `#board=` link, today's and another day's Hexagon daily code among
  them).

## WHEN TO READ THE SOURCE

- Changing the Daily screen: the head comment of `js/shell/daily.js`.
- Changing what the Daily preview shows: `dailyPanel` and
  `dailyPreview`.
- Changing how a typed code or a `#board=` link starts a game
  (`resolveCode`, `gameStart`, `createChallengeLinks`).
