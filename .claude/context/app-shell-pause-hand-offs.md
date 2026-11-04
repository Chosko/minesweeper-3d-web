# App shell — restart keys, game hand-offs, leave-page guard, quit flush

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers what the pause controller (`js/shell/pause.js`) does beyond the pause
card: the restart keys, the game hand-offs, the leave-page guard and the
flush before the desktop host quits, and their wiring in `js/main.js`. The
pause card, pause flow and confirmations, and the module's exports, are
[app-shell-pause.md](app-shell-pause.md). The module is pure; its rules are
documented in its head comment.

## PUBLIC API

`js/shell/pause.js` (the rest of its exports: [app-shell-pause.md](app-shell-pause.md) § PUBLIC API)
- `restartInput(input, {screen, blocked?})` → `'restart'` for `'F2'` or
  `'pad'` (Start + Y) on a `RESTART_SCREENS` screen, `'playAgain'` for
  `'KeyR'` on `results`, else null; null for anything while `blocked`.

## INTERNAL PATTERNS

- **Restart keys.** `restartKey(code, e)` in `onKey` (after the 3D `Home` /
  `R` camera return), through `restartInput`, never with Ctrl/Alt/Meta:
  `F2` (default always prevented) → `PAUSE.restart('key')`; `R` on `results`
  → `RESULTS.playAgain('key')`. `Enter` on `results` is its own listener
  (`resultsEnter`, [app-shell-results-view.md](app-shell-results-view.md)). `handlePad`
  reads Start + Y first, before any button reaches the bindings
  (`START_Y`, `createStartChord`, [input-controller.md](input-controller.md)),
  and acts on it after the end delay's skip: Y pressed while Start is held
  (Start read unsuppressed) → `PAUSE.restart('pad')`, then `layerChanged()`;
  on a `RESTART_SCREENS` screen the chord's Y reads as neither held nor
  released through its release, whatever it is bound to.
  `restartBlocked()` — an end delay or an open confirmation — stops all
  three ([app-shell-end-delay.md](app-shell-end-delay.md)). All three are
  reserved inputs, which no binding takes
  ([settings-bindings.md](settings-bindings.md)).
- **Hand-offs.** `PAUSE.attach(name, listener)`: `finished` and `abandoned`
  with the sealed replay beside the summary; `inProgress` at game started,
  at every pause of a started, unfinished game and on `pagehide`. The
  controller routes nowhere itself. `RECORDS.attach(PAUSE)` takes all three
  ([records-store.md](records-store.md)); `RESULTS.attach(PAUSE)` takes `finished` and
  `abandoned` and is the one listener that reads the replay.
- **Leave-page guard.** `guardLeave` on `beforeunload` is armed at game
  started and removed when the game finishes, is abandoned or its mode
  fails (Ctrl is a game key and Ctrl+W cannot be intercepted). The
  context-lost reload and Reset all data's reload set `reloading` to bypass
  it. It does not guard a game in its end delay, which `pagehide` finishes
  at once (`activeMode().finishNow()`) so it is recorded finished.
- **Quit flush.** Before the desktop host quits it asks the page to flush
  ([desktop.md](desktop.md) § Closing); the shell's flush hook
  (`addFlushHook`, [platform-host.md](platform-host.md)) ends the game as closing the
  page does — a game in its end delay finished, then `PAUSE.pageHide()` —
  and awaits the records store's and the replay library's `settled()`
  before the page answers, the host's own timeout bounding the wait.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  restart, hand-offs, leave-page guard.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the replay beside the summary in the finished and abandoned reports.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the flush before quitting.

## CROSS-REFERENCES

- [app-shell-pause.md](app-shell-pause.md) — the pause card, pause flow and
  confirmations.
- [app-shell-end-delay.md](app-shell-end-delay.md) — the end delay, which
  stops restart while it runs.
- [records-store.md](records-store.md) — the records store attached to the hand-offs.
- [app-shell-results.md](app-shell-results.md) — the results flow on
  `finished` / `abandoned`.
- [testing-files.md](testing-files.md) — `tests/shell-*.test.mjs` (pause controller),
  `tests/replay-2d.test.mjs` (replay on the mode host and
  the hand-offs).

## WHEN TO READ THE SOURCE

- Attaching a feature to a game's end, abandonment or progress: the
  hand-offs in the head comment of `js/shell/pause.js`.
- Changing the restart keys or the leave-page guard: `js/shell/pause.js`
  and the `PAUSE` wiring in `js/main.js`.
