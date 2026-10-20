# App shell — Daily screen and board codes

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/shell/daily.js` (the Daily screen listing every mode, its
pre-generated boards and counted attempts), `js/shell/challenge.js` (board
codes typed into the board choices and `#board=` links), and their wiring
in `js/main.js`. The main menu, its preview and the board choices' wiring
are [app-shell-menu.md](app-shell-menu.md). The Daily screen's composition
is the head comment of `css/components.css` (*Daily*); its ids are
[app-shell-markup.md](app-shell-markup.md) § Screens.

## PUBLIC API

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
  'challenge', …}`, a code of the other mode refused with `otherMode` its
  mode; `otherModeHint(mode)`; `gameStart({board, seed,
  startCell, daily?, pregenerated?})` → `{mode, choice}` (2D `fixed`, 3D
  `forced`); `freeStart(board)`; `boardHash(hash)`;
  `createChallengeLinks({location, history, onDaily, onChallenge,
  onRefused, started, unavailable?, toast?})` → `{start(), hashchange()}`;
  `STARTED_TOAST`.

## INTERNAL PATTERNS

- **Daily and challenges in `js/main.js`.** `DAILY_BOARDS_HELD` (clients:
  `mode2d.client`, `GEN_3D` given WebGL 2) is prepared on every menu show;
  `DAILY_VIEW` fills `#daily` on its router screen (`DAILY_SCREEN`, default
  focus the selected mode's entry, the first playable one on a first show);
  each selection shows `DAILY_PREVIEW` (`bindMenuPreview` over
  `#daily-preview`, [app-shell-menu.md](app-shell-menu.md)): the Classic 2D
  board in its board frame on the screen's body, the panel showing none of
  itself (`#daily-preview[data-shows="daily"]`), and the 3D one
  puts today's closed cube with its marked start cube in the renderer
  (`showDailyScene`), drawn in front of the frame through its scene panel.
  `playDaily` refuses a used attempt, takes the held board and starts
  through `startForced` (`MODES.start`, then `enterPlay3D` for 3D);
  `playChallenge` the same from a parsed code. Both board choices' code
  fields go through `checkCode` / `playCode` (today's daily code routes to
  `daily`), and `LINKS` follows `#board=` links. A daily or challenge saves
  no last choice; the results flow's Play again after one, once its mode
  was left, starts `freeStart(summary.board)`, whose 2D choice carries
  `remember: false`, so it saves none either. A challenge route's parse has
  no `daily`: another day's daily code is a challenge.

## DOMAIN DEPENDENCIES

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the Daily screen's layout.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  Daily entry and its route.

## CROSS-REFERENCES

- [app-shell-menu.md](app-shell-menu.md) — the main menu, the preview
  binder the Daily screen reuses, the board choices whose code fields route
  here.
- [records-board-code.md](records-board-code.md) — board codes, the daily
  seed and the daily boards.
- [records-store.md](records-store.md) — the history the Daily screen
  reads.
- [generation.md](generation.md) — the clients the daily boards are
  pre-generated through.
- [testing.md](testing.md) — `tests/shell-*.test.mjs` (daily, challenge).

## WHEN TO READ THE SOURCE

- Changing the Daily screen: the head comment of `js/shell/daily.js`.
- Changing what the Daily preview shows: `dailyPanel`.
- Changing how a typed code or a `#board=` link starts a game
  (`resolveCode`, `gameStart`, `createChallengeLinks`).
