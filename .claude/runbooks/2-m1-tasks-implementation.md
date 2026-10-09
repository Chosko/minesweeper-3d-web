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

## [ ] 19. Implement task 19 — Main menu, pause card and results layout from the kit

Depends on: 17, 18

Context:
- 2026-10-09 (from step 17): every kit class starts with `ui-` (e.g. `.ui-button--primary`, `.ui-menu__item`, `.ui-segmented__option`); `css/components.css` loads between `tokens.css` and `style.css`. Kit controls are native `<button>`/`<input>`, which controller navigation already picks up.
- 2026-10-09 (from step 17): `js/main.js` was not changed by the kit; a screen sets its default focus by giving a control an id and adding it to `padDefault`'s per-layer map — that wiring is this task's.
- 2026-10-09 (from step 18): the HUD hint panels (`.hud-tools`, `#hint-h`, `#help`) keep a see-through white background, so their text is hard to read over the sky in dark theme — this restyle could pick them up. `js/main.js` now holds the overlay pause handler and a Start → pause binding during play.

```prompt
/task-implement 19 --review
```

## [ ] 20. Implement task 20 — Update documentation for feature `screen-components`

Depends on: 17, 18, 19

Context:
- 2026-10-09 (from step 17): only the stylesheet-order line of `.claude/context/app-shell.md` was updated for `css/components.css`; `testing.md` and the rest of `app-shell.md` do not yet describe the kit's new files.
- 2026-10-09 (from step 18): `.claude/context/app-shell.md` does not yet describe the overlay bar, its `onPause` callback or the new timer format; the overlay's format helpers live in `js/ui/components.js` with tests in `tests/components.test.mjs`.

```prompt
/task-implement 20 --review
```

## [ ] 21. Implement task 21 — Tile and number colour tokens

Depends on: 1

Context: none

```prompt
/task-implement 21 --review
```

## [ ] 22. Implement task 22 — Tile painter, tile cache and minimum tile size

Depends on: 2, 5, 21

Context: none

```prompt
/task-implement 22 --review
```

## [ ] 23. Implement task 23 — Update documentation for feature `square-tile-skin`

Depends on: 21, 22

Context: none

```prompt
/task-implement 23 --review
```

## [ ] 24. Implement task 24 — Screen router and shell navigation

Depends on: 19

Context: none

```prompt
/task-implement 24 --review
```

## [ ] 25. Implement task 25 — Mode host contract and the 3D adapter

Depends on: 24

Context: none

```prompt
/task-implement 25 --review --rounds 2
```

## [ ] 26. Implement task 26 — Main menu entries and the last mode played

Depends on: 15, 24, 25

Context:
- 2026-10-09 (from step 15): storage callers import `storage`, `register`, `load`, `save`, `available` from `js/platform/index.js` only — a test fails if any other file under `js/` imports a backend directly.

```prompt
/task-implement 26 --review
```

## [ ] 27. Implement task 27 — Pause controller, restart, back to menu and game hand-offs

Depends on: 25

Context:
- 2026-10-09 (from step 18): the controller's Start button presses the overlay's pause button during play (binding in `js/main.js`); the overlay bar reports the press through an `onPause` callback.

```prompt
/task-implement 27 --review --rounds 2
```

## [ ] 28. Implement task 28 — Update documentation for feature `game-shell`

Depends on: 24, 25, 26, 27

Context: none

```prompt
/task-implement 28 --review
```

## [ ] 29. Implement task 29 — Board identity, board key and display label

Depends on: none

Context: none

```prompt
/task-implement 29 --review
```

## [ ] 30. Implement task 30 — Summary builder, derived stats and best eligibility

Depends on: 6, 29

Context: none

```prompt
/task-implement 30 --review
```

## [ ] 31. Implement task 31 — Update documentation for feature `game-summary`

Depends on: 29, 30

Context: none

```prompt
/task-implement 31 --review
```

## [ ] 32. Implement task 32 — Classic 2D board setup, game session and timer

Depends on: 5, 6, 12, 15, 30

Context:
- 2026-10-09 (from step 5): rules-engine actions return `{changed, ended, boardNeeded}`; `changed` is an `Int32Array` view of one buffer reused by every action, so read or copy it before the next action. The first reveal returns `boardNeeded: c` and the board is handed over with `supplyBoard(c, mines)`.
- 2026-10-09 (from step 6): `game.counts()` returns `{ bbbv, bbbvSolved, clicks }` at any time (`bbbv` is `null` until mines are placed); `game.summary()` is `null` until a win or loss. `createGame` takes an optional `dimensions` object (e.g. `{ width, height }`) for the summary.
- 2026-10-09 (from step 12): the page-side client is `createGenerationClient({ createWorker })` in `js/generation/client.js`, returning `{ request, cancel }`. `request` resolves with `generate`'s result or a failure (`rejected: true` for an impossible request) and rejects only if the worker itself fails; a new request cancels the one in flight; `cancel()` resolves the pending request with `{ ok: false, cancelled: true }` and terminates the worker. This task is the client's first caller.

```prompt
/task-implement 32 --review --rounds 2
```

## [ ] 33. Implement task 33 — Classic 2D Canvas board view

Depends on: 22, 32

Context: none

```prompt
/task-implement 33 --review
```

## [ ] 34. Implement task 34 — Classic 2D pointer input state machine

Depends on: 33

Context: none

```prompt
/task-implement 34 --review --rounds 2
```

## [ ] 35. Implement task 35 — Classic 2D keyboard and controller cursor

Depends on: 24, 33

Context: none

```prompt
/task-implement 35 --review
```

## [ ] 36. Implement task 36 — Classic 2D mode: board choice screen and shell integration

Depends on: 18, 26, 27, 32, 33

Context: none

```prompt
/task-implement 36 --review
```

## [x] 37. Implement task 37 — Classic 2D input fidelity tests

Depends on: 7, 34, 36

Needs: agent+human

Context: none

```prompt
/task-implement 37 --review
```
Done: struck — Task 37 no longer needs a person (it reads tests/fidelity/minesweeper-online.md); the prompt runs as step 52, without the Needs: agent+human line.

## [ ] 52. Implement task 37 — Classic 2D input fidelity tests

Depends on: 51, 34, 36

Context: none

```prompt
/task-implement 37 --review
```

## [ ] 38. Implement task 38 — Update documentation for feature `classic-2d-square-play`

Depends on: 32, 33, 34, 35, 36, 37

Context: none

```prompt
/task-implement 38 --review
```

## [ ] 39. Implement task 39 — Settings schema and store

Depends on: 15

Context:
- 2026-10-09 (from step 14): documents are registered with `register(name, currentVersion, upgrades, { onIssue }?)` — `upgrades[v]` brings v to v+1 and the chain must be complete at registration; `onIssue({ name, kind })` reports `newer-version`, `corrupt`, `unreadable`, `save-failed`. `save` returns `{ ok: true }` or `{ ok: false, reason }` (`not-serializable`, `write-failed`, `newer-version`); `load`/`save` on an unregistered name throw.
- 2026-10-09 (from step 15): storage callers import `storage`, `register`, `load`, `save`, `available` from `js/platform/index.js` only — a test fails if any other file under `js/` imports a backend directly.

```prompt
/task-implement 39 --review
```

## [ ] 40. Implement task 40 — Settings appliers: theme, audio, look, resolution, fullscreen

Depends on: 2, 39

Context:
- 2026-10-09 (from step 2): the theme applier is `js/theme.js`, a plain script run before stylesheets and exposed as `window.msTheme` (`current()`, `setTheme()`, `onChange()`, `createThemeApplier()`); `readStoredTheme()` there returns nothing for now and is the hook for the stored theme setting.

```prompt
/task-implement 40 --review
```

## [ ] 41. Implement task 41 — Settings page and pause-card shortcuts

Depends on: 26, 27, 39, 40

Context: none

```prompt
/task-implement 41 --review
```

## [ ] 42. Implement task 42 — Update documentation for feature `settings`

Depends on: 39, 40, 41

Context: none

```prompt
/task-implement 42 --review
```

## [ ] 43. Implement task 43 — Records model: bests, counters, history and comparison

Depends on: 30

Context: none

```prompt
/task-implement 43 --review --rounds 2
```

## [ ] 44. Implement task 44 — Records store: persistence, recovery and the abandoned-game hook

Depends on: 15, 27, 43

Context:
- 2026-10-09 (from step 14): documents are registered with `register(name, currentVersion, upgrades, { onIssue }?)` — `upgrades[v]` brings v to v+1 and the chain must be complete at registration; `onIssue({ name, kind })` reports `newer-version`, `corrupt`, `unreadable`, `save-failed`. `save` returns `{ ok: true }` or `{ ok: false, reason }` (`not-serializable`, `write-failed`, `newer-version`); `load`/`save` on an unregistered name throw.
- 2026-10-09 (from step 15): storage callers import `storage`, `register`, `load`, `save`, `available` from `js/platform/index.js` only — a test fails if any other file under `js/` imports a backend directly.

```prompt
/task-implement 44 --review --rounds 2
```

## [ ] 45. Implement task 45 — Update documentation for feature `personal-records`

Depends on: 43, 44

Context: none

```prompt
/task-implement 45 --review
```

## [ ] 46. Implement task 46 — Results flow and results view

Depends on: 19, 27, 36, 44

Context: none

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

Context: none

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
