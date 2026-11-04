# App shell — results flow and actions

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/results/flow.js` — the results screen's (`results`) DOM-free flow:
it records the game on the `finished` and `abandoned` hand-offs, routes a
finished one to `results`, hands the replay to the library and a finished
game to the leaderboards' `submit` and the achievements — and its
wiring in `js/main.js`, the screen's actions included. The screen's content,
binder, its place over the board and Look at the board are
[app-shell-results-view.md](app-shell-results-view.md); the replay viewer's
route and the 3D replay scene are [app-shell-replay.md](app-shell-replay.md);
the screen's markup is [app-shell-markup-game.md](app-shell-markup-game.md) § Screens.

## PUBLIC API

`js/results/flow.js`
- `RESULTS_SCREEN` = `'results'`.
- `createResultsFlow({records, replays?, leaderboards?, achievements?,
  router, restart(source, current), goMenu})` → `attach(pauser)` → detach,
  `finished(summary, mode, replay?)` → the routed data `{summary, mode,
  comparison, saved, notSaved, watch, watchBest, rank, streak, standing}`
  or null, `abandoned(summary, mode, replay?)`, `current`,
  `playAgain(source)`, `openRecords()`, `watch()`, `watchBest()`,
  `toMenu()`. Without `replays` no replay is kept and no best is watched;
  without `leaderboards` nothing is submitted; without `achievements`
  nothing is unlocked. `watch` is set when the game
  handed over a sealed replay and the router has the `replay` route; `watchBest` is, after a win that set
  no new best on any stat, the board's fastest-time best's id (after
  recording) when the library `has` its replay and it is not the game
  shown, else null. `rank` is
  null for a challenge (`gameRank` leaves challenges out). The shell's
  `restart(source, {mode, summary})` plays a daily's or a challenge's
  `freeStart(summary.board)` once its mode was left.

## INTERNAL PATTERNS

- **Record before show.** `RESULTS.finished` reads the board's counters
  (streak before), records with `RECORDS.record` — so the comparison is
  against the bests that stood before this game — then reads counters,
  history, `winRate` and `completedWinRate` (streak after, rank — the
  game's place by time from `gameRank`, `js/records/stats.js`, the ranking
  the Records Top 10 reads — `standing`;
  null when recording failed or a query threw) and routes to `results`, for
  either mode. A summary that is not a record (a fixed 3D board's null) is
  ignored. A throwing recording still routes, with no comparison and
  `saved` false; `notSaved` marks the first results screen of a session
  whose records store is unavailable.
- **Actions.** Play again (also `Enter`, `R`) → `RESULTS.playAgain` →
  `PAUSE.restart`, or, once the mode was left, a flat mode's
  `MODES.start(mode, <its last choice>.current)` (`FLAT_2D`,
  [app-shell-2d.md](app-shell-2d.md)) or `MODES.start('3d', board3dChoice)`
  through `enterPlay3D`. Records → `openRecords` routes to `records` with
  this board's `boardKey` when the Records screen lists its mode
  (`RECORDS_MODES`, [records-screen.md](records-screen.md)), else with no
  board, the screen opening on its last board played — a Hexagon or
  Triangle game's case until the Records screen lists those modes; Back
  returns to `results`. Watch replay →
  `RESULTS.watch()` routes to `replay` with `{replay, returnTo: {screen:
  'results'}}` — the game's own sealed replay, so it plays whether or not
  the library saved it. Watch best (only after a win that set no best) →
  `RESULTS.watchBest()` routes to `replay` with the best's `replayId`.
  Main menu and Back → `showMainMenu`. Returning to
  `results` without data shows `RESULTS.current` again.
- **Abandoned** games are recorded (a no-op when the store already did) and
  show nothing.
- **Library hand-off.** After either records, the sealed replay is added to
  `REPLAYS` once it has loaded, pinned as a best when the comparison shows a
  new best on any of the three stats ([replay-library.md](replay-library.md)); a throwing or
  rejecting library is logged and changes nothing else.
- **Leaderboards hand-off.** For a finished game only, once the summary is
  recorded and the replay's add has settled — whether or not either
  succeeded — the flow calls `leaderboards.submit(summary, replay)` (replay
  null when none was sealed); the shell passes the platform's
  `leaderboards`. Eligibility, verification and the outbox are
  [leaderboards.md](leaderboards.md)'s and [leaderboards-submit.md](leaderboards-submit.md)'s; a throwing submit is logged and
  changes nothing else.
- **Achievements hand-off.** For a finished game only, once the record call
  has returned — whether or not it succeeded — the flow calls
  `achievements.onGameFinished(summary)`; the shell passes the platform's
  `achievements`, null on the web build, so nothing is unlocked there. The
  catalogue, the evaluator and the unlocker are
  [achievements.md](achievements.md)'s; a throwing call is logged and
  changes nothing else.

## DOMAIN DEPENDENCIES

- [../domain/features/results-screen.md](../domain/features/results-screen.md)
  — record before show, actions, failure note.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — Records opened on a mode.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — where the Records screen is opened from, Back and focus.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the end-of-game hand-off, best pinning, the session-only replay.
- [../domain/features/steam-leaderboards.md](../domain/features/steam-leaderboards.md)
  — `submit` after the summary is recorded and the replay added.
- [../domain/features/steam-achievements.md](../domain/features/steam-achievements.md)
  — the end-of-game hook.

## CROSS-REFERENCES

- [app-shell-results-view.md](app-shell-results-view.md) — the screen the
  flow routes to, `resultsEnter`, Look at the board.
- [records.md](records.md) — board label and key;
  [records-store.md](records-store.md) — `record`, comparison;
  [records-screen.md](records-screen.md) — the Records screen;
  [records-library-view.md](records-library-view.md) — `REPLAY_SCREEN`;
  [records-history.md](records-history.md) — `gameRank`.
- [replay-library.md](replay-library.md) — library;
  [app-shell-replay.md](app-shell-replay.md) — the `replay` route Watch
  replay and Watch best open.
- [app-shell-pause-hand-offs.md](app-shell-pause-hand-offs.md) — the hand-offs the flow attaches
  to.
- [leaderboards-submit.md](leaderboards-submit.md) — `submit` and the submission state;
  [achievements.md](achievements.md) — `onGameFinished`.
- [platform-host.md](platform-host.md) — the `achievements` slot.
- [testing-files.md](testing-files.md) — `tests/results.test.mjs` (a flat-mode
  game's board line and Records route among them),
  `tests/results-watch.test.mjs` (fast only; the results' browser tests,
  Watch replay's among them, are in `tests/results.test.mjs`),
  `tests/replay-handoff.test.mjs`; `tests/leaderboards-submit.test.mjs`
  holds the leaderboards hand-off's tests,
  `tests/achievements-unlock.test.mjs` the achievements hand-off's.

## WHEN TO READ THE SOURCE

- Changing what the flow records, routes or hands to the library, the
  leaderboards or the achievements, or the
  screen's actions: the head comment of `js/results/flow.js` and the
  `results` wiring in `js/main.js`.
