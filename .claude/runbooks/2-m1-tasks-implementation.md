# Runbook: m1-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 15) · Model: opus
Last step number: 52

## [x] 1. Implement task 1 — Token sheet with light and dark values

Depends on: none

Context: none

```prompt
/task-implement 1 --review
```

Done: 2026-10-09, commit `b310c42` (6 files, +386/-120). Dark values sit under `:root[data-theme="dark"]`; token names carry no hue words (heaviest weight is `--font-weight-ultra`). Many light-only colours in `css/style.css` stay hard-coded, so dark theme is incomplete until `screen-components` moves them to tokens; `--color-focus-ring` is defined but not yet used.

## [x] 2. Implement task 2 — Theme applier and token reader

Depends on: 1

Context:
- 2026-10-09 (from step 1): the token sheet's colour tokens are `--color-backdrop/-highlight/-shade`, `--color-surface`, `-surface-border`, `-surface-raised`, `-surface-sunken`, `--color-border`, `--color-ink`, `-ink-muted`, `--color-accent`, `-accent-strong`, `-accent-soft`, `-accent-ink`, `--color-success`, `-danger`, `-warning`, `--color-focus-ring`; the rest are `--font-*`, `--space-*`, `--radius-*`, `--elevation-1..3`, `--duration-*`, `--easing-*`, `--z-*`. Dark values are under `:root[data-theme="dark"]`. The token reader should use these names.

```prompt
/task-implement 2 --review
```

Done: 2026-10-09, commit `fbbe64d` (5 files, +314/-1). `readStoredTheme()` in `js/theme.js` returns nothing, so the page always starts Light — that function is where settings hooks its stored theme; the applier is exposed as `window.msTheme` (`current`, `setTheme`, `onChange`, `createThemeApplier`).

## [x] 3. Implement task 3 — Update documentation for feature `design-tokens-and-themes`

Depends on: 1, 2

Context: none

```prompt
/task-implement 3 --review
```

Done: 2026-10-09, commit `3f1bd9b` (4 files, +94/-13).

## [x] 4. Implement task 4 — Cell graph and square-grid provider

Depends on: none

Context: none

```prompt
/task-implement 4 --review
```

Done: 2026-10-09, commit `ab088b4` (4 files, +294/-1). Graph arrays are private: callers read through `degree(i)`, `neighbour(i, k)`, `forEachNeighbour(i, fn)` (or `neighbours(i)`, a copy); neighbours run in reading order, ascending by index; neighbour symmetry is not enforced.

## [x] 5. Implement task 5 — Rules engine: game state, actions and the first-click hand-off

Depends on: 4

Context: none

```prompt
/task-implement 5 --review --rounds 2
```

Done: 2026-10-09, commit `115752d` (4 files, +753/-1). Every action returns `{changed, ended, boardNeeded}`; `changed` is an `Int32Array` view of one reused buffer, so callers must read or copy it before the next action. A chord opening several mines explodes only the first in neighbour order.

## [x] 6. Implement task 6 — Board metrics, click counts and the game summary

Depends on: 5

Context:
- 2026-10-09 (from step 5): a flag toggle on a revealed cell is still recorded in the rules engine's action stream as a no-op; the reference never counts a right click on a revealed cell, so the click counts must not count it (or must drop it from the stream).

```prompt
/task-implement 6 --review --rounds 2
```

Done: 2026-10-09, commit `0d737e1` (5 files, +522/-16). A flag toggle on a revealed cell is dropped from the action stream, so every action is one counted click. `createGame`/`createGameWithMines` take an optional `dimensions` (e.g. `{ width, height }`, default `{ cells: <count> }`) since the engine sees only a cell graph.

## [x] 7. Implement task 7 — Fidelity tests for the reference ruleset

Depends on: 5, 6

Needs: agent+human

Context: none

```prompt
/task-implement 7 --review
```
Done: struck — Task 7 no longer needs a person (it reads tests/fidelity/minesweeper-online.md); the prompt runs as step 51, without the Needs: agent+human line.

## [x] 51. Implement task 7 — Fidelity tests for the reference ruleset

Depends on: 5, 6

Context:
- 2026-10-09 (from step 5): each reference behaviour is a marker on the `minesweeper-online` profile, cited through `profile.fidelity` to its heading in `tests/fidelity/minesweeper-online.md`; the engine acts only on `flagRevealedCell`, the other markers are descriptive and left for this task to pin.
- 2026-10-09 (from step 6): the wasted-click rule is recorded on the profile as `clickCounting` (fidelity heading "What counts as a click for efficiency") but built into the engine, not read at run time — pin it here. Wasted: a reveal that opens nothing; a flag removal; a chord with a wrong flag count, nothing to open, or on a closed cell. A reveal or chord that opens a mine is effective. An opening counts as 3BV-solved only when every zero cell in it is open.

```prompt
/task-implement 7 --review --rounds 2
```

Done: 2026-10-09, commit `08b9578` (2 files, +318/-1). The task body expected engine corrections; none were needed — every fidelity test passed against the engine as it stood. A coverage test now requires one fidelity test per "task 7" entry in the observation file and that every profile `fidelity` marker cites an existing heading.

## [x] 8. Implement task 8 — Update documentation for feature `cell-graph-rules-engine`

Depends on: 4, 5, 6, 7

Context: none

```prompt
/task-implement 8 --review
```

Done: 2026-10-09, commit `9fa13ed` (5 files, +236/-11).

## [x] 9. Implement task 9 — Seeded source and standard mine placer

Depends on: 4, 5

Context: none

```prompt
/task-implement 9 --review
```

Done: 2026-10-09, commit `2fa1e77` (4 files, +255/-1). The random source is mulberry32; `GENERATOR_VERSION` (1, in `js/generation/placer.js`) must be bumped on any change to the algorithm or draw order.

## [x] 10. Implement task 10 — Logic-only solver

Depends on: 4

Context: none

```prompt
/task-implement 10 --review --rounds 2
```

Done: 2026-10-09, commit `432f20a` (3 files, +691/-1). A frontier group whose layout listing exceeds its search budget is treated as unconstrained — the solver may miss deductions but never makes a wrong one.

## [x] 11. Implement task 11 — No-guess generation loop and attempt budget

Depends on: 9, 10

Context:
- 2026-10-09 (from step 9): the placer is `placeMines({ graph, mineCount, firstClick, source })` in `js/generation/placer.js`, returning an ascending `Int32Array` that `supplyBoard` accepts directly; impossible or malformed requests throw `RangeError`. The source is mulberry32 seeded with a 0..2^32−1 integer; `GENERATOR_VERSION` is exported from the placer.
- 2026-10-09 (from step 10): the solver is `solve({ graph, mines, firstClick })` in `js/generation/solver.js`, returning `{ cleared, unresolved, deductions: { single, subset, global } }`; `solveFrom({ graph, mineCount, firstClick, open, groupBudget? })` learns numbers only through `open(c)`. An Expert solve takes about 12 ms typically, about 50 ms at worst.

```prompt
/task-implement 11 --review --rounds 2
```

Done: 2026-10-09, commit `f7ebe74` (4 files, +208/-4). `generate` takes a graph description (`{ kind: 'square', width, height }`), not a graph object. `ATTEMPT_BUDGET` is 2000 candidates; Expert needs 23 at the median and 433 at worst (2 ms median, 42 ms worst), so the "generating" state is not needed for Expert. `GENERATOR_VERSION` stays 1.

## [x] 12. Implement task 12 — Generation worker and message protocol

Depends on: 11

Context:
- 2026-10-09 (from step 11): `generate({ graph, mineCount, firstClick, noGuess, seed })` is in `js/generation/generate.js`; `graph` is a description `{ kind: 'square', width, height }` (box rejected with `RangeError` for now), and `boardGraph(description)` is exported. Success: `{ ok: true, mines, seed, generatorVersion }` (+ `candidates` when no-guess); budget exhausted: `{ ok: false, reason, seed, generatorVersion, candidates }`. A malformed or impossible request throws `RangeError` — the worker must turn that into a message.

```prompt
/task-implement 12 --review --rounds 2
```

Done: 2026-10-09, commit `fdb56e5` (4 files, +347/-1). The worker turns a `RangeError` from `generate` into a failure result `{ ok: false, rejected: true, reason, generatorVersion }` rather than an error; the client does not handle `messageerror`.

## [x] 13. Implement task 13 — Update documentation for feature `board-generation`

Depends on: 9, 10, 11, 12

Context:
- 2026-10-09 (from step 11): `.claude/context/testing.md` does not yet mention the generation tests added by task 11; `board-generation.md`'s Timing contract still says Expert "may" need the generating state although the new "Attempt budget and timing" section says it does not (true only for large custom boards).
- 2026-10-09 (from step 12): `.claude/context/testing.md` does not yet list `tests/generation-client.test.mjs`; the worker/client message protocol is documented only in the headers of `js/generation/worker.js` and `client.js`.

```prompt
/task-implement 13 --review
```

Done: 2026-10-09, commit `8a02e54` (5 files, +219/-9). Also corrected `board-generation.md`'s Timing contract: only large custom no-guess boards may need the "generating" state.

## [x] 14. Implement task 14 — Storage interface and document versioning

Depends on: none

Context: none

```prompt
/task-implement 14 --review --rounds 2
```

Done: 2026-10-09, commit `55a3412` (4 files, +576/-1). The backend contract deals in text (`read`/`write`/`keepAside`/`available`, sync or async, may throw); `storage.js` owns the `{ version, data }` JSON. Saving over a stored document newer than the game knows is refused; a backend read that throws is kept aside like a corrupt document.

## [x] 15. Implement task 15 — Browser storage implementation and start-up selection

Depends on: 14

Context:
- 2026-10-09 (from step 14): a backend implements `read(name)` → stored text or undefined, `write(name, text)`, `keepAside(name)` and `available()` (do writes persist); methods may be sync or async and may throw. `storage.js` does the `{ version, data }` JSON serialisation, so the backend stores plain text.

```prompt
/task-implement 15 --review
```

Done: 2026-10-09, commit `4e53023` (4 files, +480/-1). Documents live under `ms3d:doc:<name>` and corrupt text is kept aside under `ms3d:aside:<name>`, clear of the old `ms3d.*` keys. Kept-aside text is not deleted by the owner's next save.

## [x] 16. Implement task 16 — Update documentation for feature `platform-storage`

Depends on: 14, 15

Context: none

```prompt
/task-implement 16 --review
```

Done: 2026-10-09, commit `ba52e5b` (4 files, +159/-4). Also corrected `testing.md`'s "no browser test file" claim: `tests/platform-browser.test.mjs` runs a Playwright reload check.

## [x] 17. Implement task 17 — Component kit: styles, markup patterns and focus contract

Depends on: 1, 2

Context:
- 2026-10-09 (from step 1): many light-only colours in `css/style.css` (translucent card, panel and banner backgrounds, chips, toast) are still hard-coded, so the dark theme looks wrong there until this feature moves them to tokens. `--color-focus-ring` (opaque `#3f78e0`, chosen to pass 3:1) is defined but `style.css` does not use it yet. White text on the primary button is 4.22:1, tested at the 3:1 bold-label threshold.

```prompt
/task-implement 17 --review
```

Done: 2026-10-09, commit `883e5d5` (7 files, +1209/-2). Kit classes carry a `ui-` prefix to avoid clashing with `style.css`'s `.btn`/`.stat`; `css/components.css` loads between `tokens.css` and `style.css`. `js/main.js` was left untouched — default-focus wiring via `padDefault` falls to task 19.

## [x] 18. Implement task 18 — In-game overlay bar component

Depends on: 17

Context:
- 2026-10-09 (from step 17): every kit class starts with `ui-` (e.g. `.ui-button--primary`, `.ui-menu__item`, `.ui-segmented__option`); `css/components.css` loads between `tokens.css` and `style.css`. Kit controls are native `<button>`/`<input>`, which controller navigation already picks up.

```prompt
/task-implement 18 --review
```

Done: 2026-10-09, commit `806b2a0` (9 files, +269/-15). The controller's Start button now presses the overlay's pause button during play (it never focuses it). The old `.stat`/`.hud-stats` rules are removed from `style.css`.

## [x] 19. Implement task 19 — Main menu, pause card and results layout from the kit

Depends on: 17, 18

Context:
- 2026-10-09 (from step 17): every kit class starts with `ui-` (e.g. `.ui-button--primary`, `.ui-menu__item`, `.ui-segmented__option`); `css/components.css` loads between `tokens.css` and `style.css`. Kit controls are native `<button>`/`<input>`, which controller navigation already picks up.
- 2026-10-09 (from step 17): `js/main.js` was not changed by the kit; a screen sets its default focus by giving a control an id and adding it to `padDefault`'s per-layer map — that wiring is this task's.
- 2026-10-09 (from step 18): the HUD hint panels (`.hud-tools`, `#hint-h`, `#help`) keep a see-through white background, so their text is hard to read over the sky in dark theme — this restyle could pick them up. `js/main.js` now holds the overlay pause handler and a Start → pause binding during play.

```prompt
/task-implement 19 --review
```

Done: 2026-10-09, commit `52d4788` (8 files, +540/-242). The results layout exists only in the gallery (`dev/components.html#g-results`) — `index.html` has no results screen yet. New kit pieces were added (`ui-field`, `ui-link`, `ui-menu__detail`, layout classes). The pause card's Settings section is now always open; it still uses the shell's `.controls.compact` key list.

## [x] 20. Implement task 20 — Update documentation for feature `screen-components`

Depends on: 17, 18, 19

Context:
- 2026-10-09 (from step 17): only the stylesheet-order line of `.claude/context/app-shell.md` was updated for `css/components.css`; `testing.md` and the rest of `app-shell.md` do not yet describe the kit's new files.
- 2026-10-09 (from step 18): `.claude/context/app-shell.md` does not yet describe the overlay bar, its `onPause` callback or the new timer format; the overlay's format helpers live in `js/ui/components.js` with tests in `tests/components.test.mjs`.
- 2026-10-09 (from step 19): task 19 added kit pieces `ui-field`, `ui-link`, `ui-menu__detail` and layout classes (`ui-screen`, `ui-row`, `ui-grid`, `ui-heading`, `ui-text`, `ui-actions`, `ui-stat-row`), catalogued in `css/components.css` and shown in the gallery; the results layout lives at `dev/components.html#g-results`.

```prompt
/task-implement 20 --review
```

Done: 2026-10-09, commit `b801916` (4 files, +161/-25).

## [x] 21. Implement task 21 — Tile and number colour tokens

Depends on: 1

Context: none

```prompt
/task-implement 21 --review
```

Done: 2026-10-09, commit `84f8fc5` (3 files, +81/-1). Tokens carry the sheet's `--color-` prefix (`--color-tile-*`, `--color-board-frame`, `--color-board-gap`, `--color-number-1`…`-8`), not the task body's bare `tile-closed`/`number-3`. Light numbers 3 and 6 are darker than the 3D hues to pass 4.5:1.

## [x] 22. Implement task 22 — Tile painter, tile cache and minimum tile size

Depends on: 2, 5, 21

Context:
- 2026-10-09 (from step 21): tile tokens are `--color-tile-*` (a fill per state plus `tile-edge`, `tile-flag`, `tile-mine-glyph`, `tile-wrong-flag-mark`), `--color-board-frame`, `--color-board-gap` and `--color-number-1`…`--color-number-8` — note the `--color-` prefix, not the task body's bare names.

```prompt
/task-implement 22 --review
```

Done: 2026-10-09, commit `3dd3839` (4 files, +664/-6). `MIN_TILE_SIZE` is 41 px, measured for Expert fitting below a 64 px overlay bar with 16 px gaps in the full viewport (bar height taken from the gallery page) — the Classic 2D board view must use the same fit rule or re-measure it.

## [x] 23. Implement task 23 — Update documentation for feature `square-tile-skin`

Depends on: 21, 22

Context: none

```prompt
/task-implement 23 --review
```

Done: 2026-10-09, commit `c9b5043` (5 files, +145/-7).

## [x] 24. Implement task 24 — Screen router and shell navigation

Depends on: 19

Context: none

```prompt
/task-implement 24 --review
```

Done: 2026-10-09, commit `54b3c86` (9 files, +627/-72). The controller's Back button no longer toggles sound: it means Back in menus and pauses in play. Esc on the pause card goes to the "Click to play" card, since a key press cannot re-grab pointer lock. `S.mode` now reads the router's current screen.

## [x] 25. Implement task 25 — Mode host contract and the 3D adapter

Depends on: 24

Context:
- 2026-10-09 (from step 24): the 3D shell registers router screens `menu`, `ready`, `playing`, `paused`, `ctxlost`; `board-choice`, `results`, `records`, `settings` are only named in `SHELL_SCREENS` until their tasks build them. Screens declare their own default focus (see the catalogue comment in `css/components.css`); the controller Back button means Back in menus and Pause in play.

```prompt
/task-implement 25 --review --rounds 2
```

Done: 2026-10-09, commit `9655f20` (7 files, +762/-18). The host, not the mode, reports `game abandoned` (from the mode's `summary()`) before `restart()`, `leave()` or a replacing `start()`; a mode only reports `started`, `finished`, `canPause`, `failed`. The context-lost screen gained a "Back to menu" button.

## [x] 26. Implement task 26 — Main menu entries and the last mode played

Depends on: 15, 24, 25

Context:
- 2026-10-09 (from step 15): storage callers import `storage`, `register`, `load`, `save`, `available` from `js/platform/index.js` only — a test fails if any other file under `js/` imports a backend directly.
- 2026-10-09 (from step 24): the 3D shell registers router screens `menu`, `ready`, `playing`, `paused`, `ctxlost`; `board-choice`, `results`, `records`, `settings` are only named in `SHELL_SCREENS` until their tasks build them. Screens declare their own default focus (see the catalogue comment in `css/components.css`); the controller Back button means Back in menus and Pause in play.
- 2026-10-09 (from step 25): the mode host exposes `start`, `pause`, `resume`, `restart`, `leave`, `summary`, `on`, `active`, `state` (also as `window.__ms.modes` for Playwright). The host reports `game abandoned` itself from the mode's `summary()` before `restart()`, `leave()` or a replacing `start()`; a mode reports only `started`, `finished`, `canPause`, `failed`. `resume`/`restart` take `{ source: 'pointer' | 'key' | 'pad' }`. Until board choice exists, the 3D mode's "open board choice" goes to the main menu.

```prompt
/task-implement 26 --review
```

Done: 2026-10-09, commit `36779e9` (10 files, +566/-46). `shell.lastMode` is saved on the mode host's `started` (first click), not on opening a board. The 3D presets moved off `#menu` to a new `board-choice` router screen; Classic 2D, Records and Settings point to a shared `coming-soon` placeholder until their screens exist.

## [x] 27. Implement task 27 — Pause controller, restart, back to menu and game hand-offs

Depends on: 25

Context:
- 2026-10-09 (from step 18): the controller's Start button presses the overlay's pause button during play (binding in `js/main.js`); the overlay bar reports the press through an `onPause` callback.
- 2026-10-09 (from step 24): the 3D shell registers router screens `menu`, `ready`, `playing`, `paused`, `ctxlost`; `board-choice`, `results`, `records`, `settings` are only named in `SHELL_SCREENS` until their tasks build them. Screens declare their own default focus (see the catalogue comment in `css/components.css`); the controller Back button means Back in menus and Pause in play.
- 2026-10-09 (from step 25): the mode host exposes `start`, `pause`, `resume`, `restart`, `leave`, `summary`, `on`, `active`, `state` (also as `window.__ms.modes` for Playwright). The host reports `game abandoned` itself from the mode's `summary()` before `restart()`, `leave()` or a replacing `start()`; a mode reports only `started`, `finished`, `canPause`, `failed`. `resume`/`restart` take `{ source: 'pointer' | 'key' | 'pad' }`. Until board choice exists, the 3D mode's "open board choice" goes to the main menu.
- 2026-10-09 (from step 26): the 3D mode's "open board choice" now goes to the `board-choice` router screen (`#board-choice`), not the main menu; Back from a fresh board's click-to-play card returns there.

```prompt
/task-implement 27 --review --rounds 2
```

Done: 2026-10-09, commit `48f2301` (11 files, +707/-35). Every pause goes through `js/shell/pause.js` (`window.__ms.pauser`); a finished game routes to the `results` screen only once that screen is registered, and the 3D end banner stays until then. The board is hidden whenever the pause card shows; the leave-page guard is live only while a game is in progress.

## [x] 28. Implement task 28 — Update documentation for feature `game-shell`

Depends on: 24, 25, 26, 27

Context:
- 2026-10-09 (from step 24): `.claude/context/app-shell.md` and `.claude/context/input.md` still describe the old Esc handling and the `padSuppress`/`padDefault` wiring the router replaced.
- 2026-10-09 (from step 25): `app-shell.md` and `testing.md` do not yet describe the mode host, the 3D adapter, `window.__ms.modes` or the context-lost "Back to menu" button (`#ctx-lost-menu`).
- 2026-10-09 (from step 26): `app-shell.md` and `testing.md` still describe `#menu` holding the 3D presets; they now live on the `board-choice` screen, and `coming-soon` is the shared placeholder screen.
- 2026-10-09 (from step 27): `app-shell.md` and `testing.md` do not yet describe the pause controller (`js/shell/pause.js`, `__ms.pauser`), its hand-offs, the confirmation panel or the in-progress-only leave-page guard.

```prompt
/task-implement 28 --review
```

Done: 2026-10-09, commit `b350387` (5 files, +357/-76).

## [x] 29. Implement task 29 — Board identity, board key and display label

Depends on: none

Context: none

```prompt
/task-implement 29 --review
```

Done: 2026-10-09, commit `d67a6cd` (3 files, +216/-1). Board key is `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>` (`BOARD_KEY_FORMAT = 1`). A 3D board (no grid field, per `game-summary`) is currently rejected, so the 3D records work must extend the module.

## [x] 30. Implement task 30 — Summary builder, derived stats and best eligibility

Depends on: 6, 29

Context:
- 2026-10-09 (from step 29): the board key is `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>` (e.g. `classic-2d:square:30x16:99:no-guess`, `BOARD_KEY_FORMAT = 1`), in `js/records/`; Beginner/Intermediate/Expert are recognised only on the square grid; custom labels read like "20 × 12 · 50 mines" (+ " · no-guess"). A 3D board identity (no grid field) is currently rejected.
- 2026-10-09 (from step 6): the rules engine's `game.counts()` returns `{ bbbv, bbbvSolved, clicks }` (`bbbv` null until mines are placed) and `game.summary()` is null until a win or loss; every action in the engine's stream is exactly one counted click (flag toggles on revealed cells are dropped). `createGame` takes an optional `dimensions` object (e.g. `{ width, height }`).

```prompt
/task-implement 30 --review
```

Done: 2026-10-09, commit `279a4ab` (3 files, +365/-1). Passing `counts()` before the first click (`bbbv` null) returns `null` rather than throwing. The stored summary holds a plain copy of the board identity, not the board key; `bbbvPerSecond` and `efficiency` are unrounded, or `null` when their divisor is zero.

## [x] 31. Implement task 31 — Update documentation for feature `game-summary`

Depends on: 29, 30

Context:
- 2026-10-09 (from step 29): `.claude/context/` has no entry yet for `js/records/` (board identity, key and label) or its test file.
- 2026-10-09 (from step 30): `buildSummary({ engine, outcome?, elapsedMs, board, seed, generatorVersion, endedAt?, id? })` is in `js/records/summary.js`; `engine` is the engine's `summary()` (won/lost) or `counts()` (abandoned), and `counts()` before the first click returns `null`. The summary stores a plain board-identity copy (not the key), an ISO `endedAt`, and unrounded `bbbvPerSecond`/`efficiency` (null when the divisor is zero). `isBestEligible(summary, stat)` takes one of `BEST_STATS = ['time', 'bbbvPerSecond', 'efficiency']`.

```prompt
/task-implement 31 --review
```

Done: 2026-10-09, commit `31e0488` (4 files, +141/-2).

## [x] 32. Implement task 32 — Classic 2D board setup, game session and timer

Depends on: 5, 6, 12, 15, 30

Context:
- 2026-10-09 (from step 5): rules-engine actions return `{changed, ended, boardNeeded}`; `changed` is an `Int32Array` view of one buffer reused by every action, so read or copy it before the next action. The first reveal returns `boardNeeded: c` and the board is handed over with `supplyBoard(c, mines)`.
- 2026-10-09 (from step 6): `game.counts()` returns `{ bbbv, bbbvSolved, clicks }` at any time (`bbbv` is `null` until mines are placed); `game.summary()` is `null` until a win or loss. `createGame` takes an optional `dimensions` object (e.g. `{ width, height }`) for the summary.
- 2026-10-09 (from step 12): the page-side client is `createGenerationClient({ createWorker })` in `js/generation/client.js`, returning `{ request, cancel }`. `request` resolves with `generate`'s result or a failure (`rejected: true` for an impossible request) and rejects only if the worker itself fails; a new request cancels the one in flight; `cancel()` resolves the pending request with `{ ok: false, cancelled: true }` and terminates the worker. This task is the client's first caller.
- 2026-10-09 (from step 30): `buildSummary({ engine, outcome?, elapsedMs, board, seed, generatorVersion, endedAt?, id? })` is in `js/records/summary.js`; `engine` is the engine's `summary()` (won/lost) or `counts()` (abandoned), and `counts()` before the first click returns `null`. The summary stores a plain board-identity copy (not the key), an ISO `endedAt`, and unrounded `bbbvPerSecond`/`efficiency` (null when the divisor is zero). `isBestEligible(summary, stat)` takes one of `BEST_STATS = ['time', 'bbbvPerSecond', 'efficiency']`.
- 2026-10-09 (from step 29): board identity, key and label live in `js/records/`; the key is `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>` (e.g. `classic-2d:square:30x16:99:no-guess`).

```prompt
/task-implement 32 --review --rounds 2
```

Done: 2026-10-09, commit `752e280` (9 files, +1079/-14). Custom limits live as a `customLimits` setting on rule profile v1 (no rules-version bump); mine caps for unmeasured 37–48-cell boards are interpolated, so the cap falls as the board grows there. Custom boards accept 0 mines. The first reveal returns a Promise; the last board choice is saved but nothing loads it yet.

## [x] 33. Implement task 33 — Classic 2D Canvas board view

Depends on: 22, 32

Context:
- 2026-10-09 (from step 22): `MIN_TILE_SIZE` (41 px) assumes the board fits the full viewport below the 64 px overlay bar with 16 px between window edges, bar and board — use that fit rule or re-measure. The skin exports `paintTile`, `paintTileWith(token, …)`, `TILE_STATES` (engine cell states plus `pressed`) and `createTileSkin({ token, onThemeChange, currentTheme, createCanvas, redraw })` → `{ drawTile(ctx, x, y, size, state, number, pixelRatio), cacheKey, invalidate, dispose }`.
- 2026-10-09 (from step 23): `.claude/context/classic2d.md` exists and describes only the tile skin, saying the board renderer is still to be built — update it when the renderer lands.
- 2026-10-09 (from step 32): the session's first reveal returns a Promise of its result (`null` if the board failed or the request was cancelled); every other action returns the engine's result at once. `createLastChoice` saves/loads the last board choice, but nothing calls `load()` when the mode opens — that wiring is task 36's. Choosing "Play a standard board" after a failed no-guess board turns no-guess off for the rest of the session.

```prompt
/task-implement 33 --review
```

Done: 2026-10-09, commit `ea4b341` (6 files, +933/-20). The view fits whatever area its container gives it, so the mode screen must supply the viewport below the 64 px bar with 16 px margins (Expert = 41 px there). Drag-pan is Shift + primary drag (`PAN_MODIFIER = 'shiftKey'`). `mountBoardView`, `ensureVisible` and `setHidden` exist but nothing calls them yet.

## [x] 34. Implement task 34 — Classic 2D pointer input state machine

Depends on: 33

Context:
- 2026-10-09 (from step 33): drag-panning is Shift + primary-button drag (`PAN_MODIFIER = 'shiftKey'`) — pointer input must ignore shift-drag presses on a board that scrolls. `createBoardView` is DOM-free; browser wiring is `mountBoardView`.

```prompt
/task-implement 34 --review --rounds 2
```

Done: 2026-10-09, commit `122f2f1` (9 files, +1000/-15). Input behaviour is read from four new profile markers (`revealInputs`, `flagToggle`, `pressFeedback`, `releaseOffCell`) plus `chordInputs`. Left+right on a closed cell acts only on the left release, as a chord on a revealed number — unrecorded in the reference, so an implementer's choice. Input uses mouse events, not pointer events.

## [x] 35. Implement task 35 — Classic 2D keyboard and controller cursor

Depends on: 24, 33

Context:
- 2026-10-09 (from step 24): the controller Back button (`BTN.BACK`) means Back in menus and Pause in play (it no longer toggles sound); an Esc within 500 ms of pointer-lock release is ignored because that Esc already meant Pause.
- 2026-10-09 (from step 33): the board view provides `ensureVisible(c)` for the cursor follow; nothing calls it yet.
- 2026-10-09 (from step 34): pointer input is `mountPointerInput` and uses mouse events; the view now has `setPressed` for press feedback.

```prompt
/task-implement 35 --review
```

Done: 2026-10-09, commit `d9997f5` (9 files, +1137/-17). Unlike the mouse, keyboard/controller reveal inputs (A, RT, Space, Enter) never chord a revealed number; chording is Y, D, or both triggers held together. The cursor ring is always visible, starting top-left.

## [x] 36. Implement task 36 — Classic 2D mode: board choice screen and shell integration

Depends on: 18, 26, 27, 32, 33

Context:
- 2026-10-09 (from step 25): the mode host exposes `start`, `pause`, `resume`, `restart`, `leave`, `summary`, `on`, `active`, `state` (also as `window.__ms.modes` for Playwright). The host reports `game abandoned` itself from the mode's `summary()` before `restart()`, `leave()` or a replacing `start()`; a mode reports only `started`, `finished`, `canPause`, `failed`. `resume`/`restart` take `{ source: 'pointer' | 'key' | 'pad' }`. Until board choice exists, the 3D mode's "open board choice" goes to the main menu.
- 2026-10-09 (from step 26): Classic 2D, Records and Settings menu entries go to a shared `coming-soon` router screen (`#coming-soon`, not in `SHELL_SCREENS`) and switch over by themselves once their mode is registered or the router has their screen. The 3D presets live on a `board-choice` router screen (`#board-choice`); the menu module is `js/shell/menu.js`, and `shell.lastMode` (v1, `{ mode }`) is saved on the host's `started`.
- 2026-10-09 (from step 27): the pause controller `js/shell/pause.js` (`window.__ms.pauser`) owns every pause and offers `pause(source, {note})`, `resume`, `restart`, `toMenu`, `pageHide`, `inProgress` and `attach(name, fn)` for the hand-offs `finished`, `abandoned`, `inProgress` — records and results hook in through `attach`. A finished game routes to the router screen `results` with `{ summary, mode }` once that screen is registered. Restart/Main-menu confirmation is a panel in the pause card (`#pause-confirm`, `UI.showConfirm`/`closeConfirm`/`isConfirmOpen`).
- 2026-10-09 (from step 32): the session's first reveal returns a Promise of its result (`null` if the board failed or the request was cancelled); every other action returns the engine's result at once. `createLastChoice` saves/loads the last board choice, but nothing calls `load()` when the mode opens — that wiring is task 36's. Choosing "Play a standard board" after a failed no-guess board turns no-guess off for the rest of the session.
- 2026-10-09 (from step 33): the board view fits whatever area its container gives it — the mode screen must give it the window below the 64 px overlay bar with 16 px margins (where `MIN_TILE_SIZE` = 41 px was measured). `mountBoardView` (resize, DPR, wheel, shift-drag wiring) and `setHidden(bool)` for pause exist but nothing calls them yet.
- 2026-10-09 (from step 34): `mountPointerInput` (mousedown on the canvas, mousemove/mouseup/blur on the page) sends actions to the session and pressed cells to the view's `setPressed`; redrawing the view when the session reports changes is not wired — this task must do it.
- 2026-10-09 (from step 35): keyboard/controller cursor is `mountCursorInput`; the controller reaches it only through its `pad(poll)` — this task must call it from the shell's controller poll, mount/unmount it and reset it on pause, or the controller does nothing on the board. The view has `setCursor` for the ring.

```prompt
/task-implement 36 --review
```

Done: 2026-10-09, commit `590582b` (14 files, +1167/-38). Classic 2D uses its own router screens `classic-2d-choice` (`#c2d-choice`) and `classic-2d` (`#c2d`), not `board-choice`/`playing`. Until the results screen exists, a finished 2D board stays on screen and the pause card offers Play again. Added a generation-failure card (Retry / Play a standard board), not in the task body. The cursor ring was not visible in a screenshot — possibly the focus-ring and tile-edge tokens share #3f78e0.

## [x] 37. Implement task 37 — Classic 2D input fidelity tests

Depends on: 7, 34, 36

Needs: agent+human

Context: none

```prompt
/task-implement 37 --review
```
Done: struck — Task 37 no longer needs a person (it reads tests/fidelity/minesweeper-online.md); the prompt runs as step 52, without the Needs: agent+human line.

## [x] 52. Implement task 37 — Classic 2D input fidelity tests

Depends on: 51, 34, 36

Context:
- 2026-10-09 (from step 32): custom-board mine caps for 37–48-cell boards were never measured and are interpolated between 36 cells (a mine in every cell) and 7×7's 19, so the cap falls as the board grows in that range (6×7 allows 28); the limits live in the `customLimits` setting of rule profile v1, linked to "Largest custom board". Confirm or replace them here.
- 2026-10-09 (from step 34): pointer behaviour reads profile markers `revealInputs`, `flagToggle`, `pressFeedback`, `releaseOffCell` and `chordInputs` in `js/engine/profiles.js`, each citing its fidelity entry — pin these here. Left+right on a closed cell acts only on the left release, as a chord on a revealed number, never a reveal; the reference does not record this case.
- 2026-10-09 (from step 35): keyboard/controller reveal inputs (A, RT, Space, Enter) never chord a revealed number; chording is Y, D, or both triggers held (LT flags on press; the release chord follows the profile's left+right rule, while Y and D chord regardless).
- 2026-10-09 (from step 36): in a screenshot after an arrow-key move the Classic 2D cursor ring was not visible; unverified cause — `--color-focus-ring` and `--color-tile-edge` are both `#3f78e0`. The mode wiring is in place (screens `classic-2d-choice`, `classic-2d`).

```prompt
/task-implement 37 --review
```

Done: 2026-10-09, commit `818648d` (2 files, +562/-1). No production fix was needed: the input markers, pointer state machine and `customLimits` already match the fidelity file. Step 32's interpolated 37–48-cell mine caps are confirmed (the file says to interpolate). The cursor-ring visibility question from step 36 was not addressed.

## [x] 38. Implement task 38 — Update documentation for feature `classic-2d-square-play`

Depends on: 32, 33, 34, 35, 36, 37

Context:
- 2026-10-09 (from step 32): `classic2d.md` and its INDEX row still say `js/classic2d/` holds only the tile skin; `engine.md` (limits setting) and `generation.md` (session as the client's caller) were already updated by task 32.
- 2026-10-09 (from step 33): `classic2d.md` and `testing.md` now describe the board view but not `session.js`/`board-setup.js` (task 32), and `testing.md` does not list `tests/classic2d-session.test.mjs`.
- 2026-10-09 (from step 36): task 36 already fixed two stale passages in `.claude/context/`; the mode adds router screens `classic-2d-choice`/`classic-2d`, a `#c2d-status` generating/failure card, and updated `tests/shell-menu.test.mjs`.
- 2026-10-09 (from step 52): `.claude/context/testing.md` does not yet list `tests/classic2d-fidelity.test.mjs`.

```prompt
/task-implement 38 --review
```

Done: 2026-10-09, commit `9604d25` (5 files, +213/-24). Also corrected the README input table: releasing on another cell moves the action there; only releasing off the board cancels it.

## [x] 39. Implement task 39 — Settings schema and store

Depends on: 15

Context:
- 2026-10-09 (from step 14): documents are registered with `register(name, currentVersion, upgrades, { onIssue }?)` — `upgrades[v]` brings v to v+1 and the chain must be complete at registration; `onIssue({ name, kind })` reports `newer-version`, `corrupt`, `unreadable`, `save-failed`. `save` returns `{ ok: true }` or `{ ok: false, reason }` (`not-serializable`, `write-failed`, `newer-version`); `load`/`save` on an unregistered name throw.
- 2026-10-09 (from step 15): storage callers import `storage`, `register`, `load`, `save`, `available` from `js/platform/index.js` only — a test fails if any other file under `js/` imports a backend directly.

```prompt
/task-implement 39 --review
```

Done: 2026-10-09, commit `acc9a17` (4 files, +488/-1). The store takes its storage by injection, so nothing uses it yet. Old `ms3d.*` keys are migrated only when no settings document exists and loading reported no trouble. `set()` before `load()` throws; a `set()` during `load()` waits for it.

## [x] 40. Implement task 40 — Settings appliers: theme, audio, look, resolution, fullscreen

Depends on: 2, 39

Context:
- 2026-10-09 (from step 2): the theme applier is `js/theme.js`, a plain script run before stylesheets and exposed as `window.msTheme` (`current()`, `setTheme()`, `onChange()`, `createThemeApplier()`); `readStoredTheme()` there returns nothing for now and is the hook for the stored theme setting.
- 2026-10-09 (from step 39): `createSettingsStore({ storage, legacy?, onNotKept? })` takes storage by injection and nothing creates it yet — this task must create it in `js/main.js` from the platform `storage` and await `load()` before the first screen. `set()` before `load()` throws; a `set()` during `load()` waits for it.

```prompt
/task-implement 40 --review
```

Done: 2026-10-09, commit `2b2c638` (9 files, +527/-56). Auto resolution keeps the existing board-size cap (2 → 1.5 above 20³ → 1 above 50³), not the task's plain `min(devicePixelRatio, 2)`. `js/theme.js` reads `ms3d:doc:settings` v1 straight from localStorage at start-up. A saved "fullscreen on" is reset to off at start-up, since browsers refuse fullscreen without a gesture.

## [x] 41. Implement task 41 — Settings page and pause-card shortcuts

Depends on: 26, 27, 39, 40

Context:
- 2026-10-09 (from step 26): Classic 2D, Records and Settings menu entries go to a shared `coming-soon` router screen (`#coming-soon`, not in `SHELL_SCREENS`) and switch over by themselves once their mode is registered or the router has their screen. The 3D presets live on a `board-choice` router screen (`#board-choice`); the menu module is `js/shell/menu.js`, and `shell.lastMode` (v1, `{ mode }`) is saved on the host's `started`.
- 2026-10-09 (from step 27): the pause controller `js/shell/pause.js` (`window.__ms.pauser`) owns every pause and offers `pause(source, {note})`, `resume`, `restart`, `toMenu`, `pageHide`, `inProgress` and `attach(name, fn)` for the hand-offs `finished`, `abandoned`, `inProgress` — records and results hook in through `attach`. A finished game routes to the router screen `results` with `{ summary, mode }` once that screen is registered. Restart/Main-menu confirmation is a panel in the pause card (`#pause-confirm`, `UI.showConfirm`/`closeConfirm`/`isConfirmOpen`).
- 2026-10-09 (from step 36): Classic 2D's router screens are `classic-2d-choice` (`#c2d-choice`) and `classic-2d` (`#c2d`, board area `#c2d-board`); the pause controller's "board in play" check covers both `playing` and `classic-2d`. Until the `results` screen is registered, a finished 2D board stays on screen and the pause card ("You won!"/"Game over") offers Play again with the same board choice.
- 2026-10-09 (from step 39): the settings store's `onNotKept({ reason })` fires at most once per store, on the first failed save — connect it to the "settings will not be kept" message.
- 2026-10-09 (from step 40): `js/main.js` creates the settings store and awaits `load()` before the first screen; F and M change the stored setting and the appliers act on it; `window.__ms.settings` is the test hook. A saved fullscreen-on is reset to off at start-up.

```prompt
/task-implement 41 --review
```

Done: 2026-10-09, commit `8bdfd88` (10 files, +815/-93). Every setting control (page, pause card, menu volume) carries `data-setting` and is bound by one `bindSettingControls(...)`; the old `onLookSettings`/`UI.setLook`/`UI.initVolume` path is gone. The page is generated from the schema by `js/settings/page.js`, and one bindings table (`js/settings/bindings.js`) feeds every help surface.

## [x] 42. Implement task 42 — Update documentation for feature `settings`

Depends on: 39, 40, 41

Context:
- 2026-10-09 (from step 40): `.claude/context/app-shell.md` still mentions `loadLookSettings`, and `audio.md` still says volume/mute are saved under `ms3d.*` keys; `js/theme.js` now reads `ms3d:doc:settings` v1 at start-up, and Auto resolution keeps the board-size cap (2 → 1.5 above 20³ → 1 above 50³).
- 2026-10-09 (from step 41): `app-shell.md` still describes the Settings placeholder, `onLookSettings` and `initVolume`, all now gone: controls carry `data-setting` and one `bindSettingControls(...)` in `js/main.js` binds them; `js/settings/page.js` generates the page into `#settings-body`; `js/settings/bindings.js` feeds the in-game help, controls modal, controller help and the page's bindings list.

```prompt
/task-implement 42 --review
```

Done: 2026-10-09, commit `8e1889b` (8 files, +374/-81). Also updated `platform.md`, which still said nothing used platform storage.

## [x] 43. Implement task 43 — Records model: bests, counters, history and comparison

Depends on: 30

Context:
- 2026-10-09 (from step 29): the board key is `<mode>:<grid>:<width>x<height>:<mines>:<guess|no-guess>` (e.g. `classic-2d:square:30x16:99:no-guess`, `BOARD_KEY_FORMAT = 1`), in `js/records/`; Beginner/Intermediate/Expert are recognised only on the square grid; custom labels read like "20 × 12 · 50 mines" (+ " · no-guess"). A 3D board identity (no grid field) is currently rejected.
- 2026-10-09 (from step 30): `buildSummary({ engine, outcome?, elapsedMs, board, seed, generatorVersion, endedAt?, id? })` is in `js/records/summary.js`; `engine` is the engine's `summary()` (won/lost) or `counts()` (abandoned), and `counts()` before the first click returns `null`. The summary stores a plain board-identity copy (not the key), an ISO `endedAt`, and unrounded `bbbvPerSecond`/`efficiency` (null when the divisor is zero). `isBestEligible(summary, stat)` takes one of `BEST_STATS = ['time', 'bbbvPerSecond', 'efficiency']`.

```prompt
/task-implement 43 --review --rounds 2
```

Done: 2026-10-09, commit `f9b6329` (5 files, +557/-1). Added `parseBoardKey` to `js/records/board.js` so bests and counters can be rebuilt from the history alone. Overall counters are kept per mode (`records.overall[mode]`). Recording the same id twice recomputes the original comparison from the earlier history.

## [x] 44. Implement task 44 — Records store: persistence, recovery and the abandoned-game hook

Depends on: 15, 27, 43

Context:
- 2026-10-09 (from step 14): documents are registered with `register(name, currentVersion, upgrades, { onIssue }?)` — `upgrades[v]` brings v to v+1 and the chain must be complete at registration; `onIssue({ name, kind })` reports `newer-version`, `corrupt`, `unreadable`, `save-failed`. `save` returns `{ ok: true }` or `{ ok: false, reason }` (`not-serializable`, `write-failed`, `newer-version`); `load`/`save` on an unregistered name throw.
- 2026-10-09 (from step 15): storage callers import `storage`, `register`, `load`, `save`, `available` from `js/platform/index.js` only — a test fails if any other file under `js/` imports a backend directly.
- 2026-10-09 (from step 25): the mode host exposes `start`, `pause`, `resume`, `restart`, `leave`, `summary`, `on`, `active`, `state` (also as `window.__ms.modes` for Playwright). The host reports `game abandoned` itself from the mode's `summary()` before `restart()`, `leave()` or a replacing `start()`; a mode reports only `started`, `finished`, `canPause`, `failed`. `resume`/`restart` take `{ source: 'pointer' | 'key' | 'pad' }`. Until board choice exists, the 3D mode's "open board choice" goes to the main menu.
- 2026-10-09 (from step 27): the pause controller `js/shell/pause.js` (`window.__ms.pauser`) owns every pause and offers `pause(source, {note})`, `resume`, `restart`, `toMenu`, `pageHide`, `inProgress` and `attach(name, fn)` for the hand-offs `finished`, `abandoned`, `inProgress` — records and results hook in through `attach`. A finished game routes to the router screen `results` with `{ summary, mode }` once that screen is registered. Restart/Main-menu confirmation is a panel in the pause card (`#pause-confirm`, `UI.showConfirm`/`closeConfirm`/`isConfirmOpen`).
- 2026-10-09 (from step 36): Classic 2D's router screens are `classic-2d-choice` (`#c2d-choice`) and `classic-2d` (`#c2d`, board area `#c2d-board`); the pause controller's "board in play" check covers both `playing` and `classic-2d`. Until the `results` screen is registered, a finished 2D board stays on screen and the pause card ("You won!"/"Game over") offers Play again with the same board choice.
- 2026-10-09 (from step 43): `js/records/model.js` exports `createRecordsModel({ records?, history? })` (rebuilds records from history when only history is given) with `record(summary)` → comparison, `documents()` → `{ records, history }`, and queries `boardsPlayed()`, `bests(board)`, `counters(board)`, `winRate(board)`, `history(board)`, `overall(mode = 'classic-2d')`, `overallWinRate(mode)` (board as identity or key); standalone `rebuildRecords(history)`, `compactSummary(summary)`, `emptyRecords()`. Comparison per stat is `{ best, value, difference, newBest }` (value/difference null for a lost or abandoned game). Use `parseBoardKey` from `js/records/board.js` rather than parsing keys.

```prompt
/task-implement 44 --review --rounds 2
```

Done: 2026-10-09, commit `681482b` (7 files, +725/-5). Wrong premise fixed: `js/classic2d/session.js` minted a new id on every `summary()` call, so the in-progress marker never matched; each game now has one id. Won and lost games are not recorded yet — recording a result is left to task 46's results flow. `js/shell/pause.js` was left unchanged: the store tells new games from continuing ones by id.

## [ ] 45. Implement task 45 — Update documentation for feature `personal-records`

Depends on: 43, 44

Context:
- 2026-10-09 (from step 43): `.claude/context/records.md` and `testing.md` do not yet describe `js/records/model.js`, `parseBoardKey` or the new model tests.
- 2026-10-09 (from step 44): the records store (documents `records`, `records.history`, `records.inProgress` v1, `settled()`, `__ms.records`) and the per-game session id fix in `js/classic2d/session.js` are not yet in the context layer; finished games are recorded by the results flow (task 46), not the store.

```prompt
/task-implement 45 --review
```

## [ ] 46. Implement task 46 — Results flow and results view

Depends on: 19, 27, 36, 44

Context:
- 2026-10-09 (from step 19): the results layout exists only in the kit gallery (`dev/components.html`, `#g-results`, placeholder content); `index.html` has no results screen yet. Layout classes available: `ui-screen`, `ui-row`, `ui-grid`, `ui-heading`, `ui-text`, `ui-actions`, `ui-stat-row`.
- 2026-10-09 (from step 27): the pause controller `js/shell/pause.js` (`window.__ms.pauser`) owns every pause and offers `pause(source, {note})`, `resume`, `restart`, `toMenu`, `pageHide`, `inProgress` and `attach(name, fn)` for the hand-offs `finished`, `abandoned`, `inProgress` — records and results hook in through `attach`. A finished game routes to the router screen `results` with `{ summary, mode }` once that screen is registered. Restart/Main-menu confirmation is a panel in the pause card (`#pause-confirm`, `UI.showConfirm`/`closeConfirm`/`isConfirmOpen`).
- 2026-10-09 (from step 36): Classic 2D's router screens are `classic-2d-choice` (`#c2d-choice`) and `classic-2d` (`#c2d`, board area `#c2d-board`); the pause controller's "board in play" check covers both `playing` and `classic-2d`. Until the `results` screen is registered, a finished 2D board stays on screen and the pause card ("You won!"/"Game over") offers Play again with the same board choice.
- 2026-10-09 (from step 43): `js/records/model.js` exports `createRecordsModel({ records?, history? })` (rebuilds records from history when only history is given) with `record(summary)` → comparison, `documents()` → `{ records, history }`, and queries `boardsPlayed()`, `bests(board)`, `counters(board)`, `winRate(board)`, `history(board)`, `overall(mode = 'classic-2d')`, `overallWinRate(mode)` (board as identity or key); standalone `rebuildRecords(history)`, `compactSummary(summary)`, `emptyRecords()`. Comparison per stat is `{ best, value, difference, newBest }` (value/difference null for a lost or abandoned game). Use `parseBoardKey` from `js/records/board.js` rather than parsing keys.
- 2026-10-09 (from step 44): the records store is created in `js/main.js` (loaded with settings before the first screen), attached to the pause controller and exposed as `window.__ms.records`; it only clears the in-progress marker when a game finishes — recording a won/lost result is this task's job. Documents are `records`, `records.history`, `records.inProgress` (v1); `settled()` awaits queued saves; `available()` is false when stored records were refused.

```prompt
/task-implement 46 --review
```

## [ ] 47. Implement task 47 — Update documentation for feature `results-screen`

Depends on: 46

Context: none

```prompt
/task-implement 47 --review
```

## [ ] 48. Implement task 48 — Records view: board picker and figures

Depends on: 26, 44, 46

Context:
- 2026-10-09 (from step 26): Classic 2D, Records and Settings menu entries go to a shared `coming-soon` router screen (`#coming-soon`, not in `SHELL_SCREENS`) and switch over by themselves once their mode is registered or the router has their screen. The 3D presets live on a `board-choice` router screen (`#board-choice`); the menu module is `js/shell/menu.js`, and `shell.lastMode` (v1, `{ mode }`) is saved on the host's `started`.
- 2026-10-09 (from step 43): `js/records/model.js` exports `createRecordsModel({ records?, history? })` (rebuilds records from history when only history is given) with `record(summary)` → comparison, `documents()` → `{ records, history }`, and queries `boardsPlayed()`, `bests(board)`, `counters(board)`, `winRate(board)`, `history(board)`, `overall(mode = 'classic-2d')`, `overallWinRate(mode)` (board as identity or key); standalone `rebuildRecords(history)`, `compactSummary(summary)`, `emptyRecords()`. Comparison per stat is `{ best, value, difference, newBest }` (value/difference null for a lost or abandoned game). Use `parseBoardKey` from `js/records/board.js` rather than parsing keys.
- 2026-10-09 (from step 44): the records store is created in `js/main.js` (loaded with settings before the first screen), attached to the pause controller and exposed as `window.__ms.records`; it only clears the in-progress marker when a game finishes — recording a won/lost result is this task's job. Documents are `records`, `records.history`, `records.inProgress` (v1); `settled()` awaits queued saves; `available()` is false when stored records were refused.

```prompt
/task-implement 48 --review
```

## [ ] 49. Implement task 49 — Records history chart and recent games list

Depends on: 2, 48

Context: none

```prompt
/task-implement 49 --review
```

## [ ] 50. Implement task 50 — Update documentation for feature `records-screen`

Depends on: 48, 49

Context: none

```prompt
/task-implement 50 --review
```
