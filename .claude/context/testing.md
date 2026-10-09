# Testing — unit tests, test scripts, browser verification

## OVERVIEW

Two layers: Node unit tests for the DOM-free modules, and Playwright-driven
browser checks for everything that needs WebGL or the DOM.

- `tests/logic.test.mjs` — 3D rules engine (`js/logic.js`): geometry, placement,
  flood fill, chord, right-click, unlinking, win/loss, dirty tracking, a
  randomized comparison against a naive port of the original, a performance test.
- `tests/engine-graph.test.mjs` — the cell graph (`js/engine/graph.js`) and the
  square-grid provider (`js/engine/square-grid.js`): construction from lists
  and flat arrays, immutability, invalid input, index/colRow round-trip,
  neighbour counts and the pinned neighbour order, symmetry, large-board build
  time, and that `js/engine/` is DOM-free and independent of `js/logic.js`.
- `tests/engine-rules.test.mjs` — the rules engine (`js/engine/rules.js`,
  `js/engine/profiles.js`): the profile table, creation from a mine count or a
  mine set, the first-click hand-off, reveal/flood fill, flags, chord, the loss
  view, actions outside playing, iterative flood fill on 1000 × 1000, the
  cell-state vocabulary, the shared `changed` buffer, the action stream,
  determinism, and play over a non-square graph.
- `tests/engine-metrics.test.mjs` — 3BV, 3BV solved, effective/wasted click
  counts (`js/engine/metrics.js` and through the engine), `counts()` mid-game
  and `summary()` at a win or a loss.
- `tests/engine-fidelity.test.mjs` — the reference ruleset (profile
  `minesweeper-online`, version 1) against `tests/fidelity/minesweeper-online.md`;
  each test cites an entry by heading, and one test checks that every engine
  entry in the file is pinned and every profile marker cites an entry.
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry per
  rule of Minesweeper Online with default options, each with its date, source
  (client code, help, live play) and confidence, and the tasks it serves.
- `tests/generation-placer.test.mjs` — the seeded source
  (`js/generation/random.js`: pinned first outputs, seed range, `int(n)`
  range, no `Math.random`) and the placer (`js/generation/placer.js`):
  distinct ascending cells never on the first click, the pinned Expert board,
  every other cell reachable (neighbours included), the densest legal board,
  impossible and malformed requests, a non-square graph, the rules engine
  accepting the mine set, and the version-bump rule stated in the module
  headers.
- `tests/generation-solver.test.mjs` — the solver (`js/generation/solver.js`)
  on hand-built boards with a known answer (single-cell only, the 1-2-1 wall
  through the subset stage, the remaining-mine count through the global
  stage, exactly one guess, a guess only at the end), agreement with an
  exhaustive reference on random small square boards and a 4 × 4 torus, that
  it learns the board only through `open()` on deduced-safe cells, that a
  group over its enumeration budget only loses deductions, an Expert board
  within a second.
- `tests/generation-noguess.test.mjs` — `generate()`
  (`js/generation/generate.js`): a standard board is the placer's first
  draw, the pinned no-guess board, candidates drawn one after another from
  one source, every accepted Beginner/Intermediate/Expert no-guess board
  (300/150/60 seeds) clearing with the solver, the exhausted-budget failure,
  rejected requests, the recorded attempt budget, DOM-free and independent
  of `js/logic.js`.
- `tests/generation-client.test.mjs` — the worker handler
  (`js/generation/worker.js::handleMessage`: reply per id, agreement with
  Node `generate()`, structured-clone data, rejected requests as failure
  messages, no state between requests) and the client
  (`js/generation/client.js`) over a fake worker: lazy worker reuse,
  cancellation, one request in flight, stale replies ignored, worker errors,
  the module-worker default, and no generation import on the main thread.
- `tests/platform-storage.test.mjs` — the storage interface
  (`js/platform/storage.js`) over the memory backend: registration and its
  malformed declarations, `{ version, data }` round-trips, no cache, every
  upgrade path saved back, async steps, a failed save-back, newer documents
  refused on load and save, corrupt and unreadable documents kept aside,
  failing `onIssue` handlers, failed and non-serialisable saves, the memory
  backend itself, and that `js/platform/` is DOM-free.
- `tests/platform-browser.test.mjs` — the browser backend
  (`js/platform/browser-backend.js`) over a `FakeStorage` with an optional
  quota: namespaced keys, the legacy `ms3d.*` keys never touched, blocked,
  throwing, missing and full storage, the kept-aside copy, the platform
  module's start-up selection (`js/platform/index.js`), that no other module
  imports a backend, and one Playwright test that a saved document survives
  a page reload (skipped when Playwright or chromium is unavailable).
- `tests/records-board.test.mjs` — the board identity (`js/records/board.js`):
  the six frozen fields and the impossible values that throw, the standard
  boards, the key pinned for the standard and custom boards, the same fields
  giving the same key and every field taking part, the labels (standard,
  custom, a custom board matching a standard size, standard sizes only on
  the square grid), and the module DOM-free, importing nothing and
  documenting its key format.
- `tests/records-summary.test.mjs` — the summary builder
  (`js/records/summary.js`) over real engine games: won, lost and abandoned
  records with every field, no summary before the first click, a stated
  outcome agreeing with the engine, default id and end date, counted clicks,
  3BV/s and efficiency, zero divisors as not available, the built record's
  stats matching the exported functions, best eligibility, the invalid
  inputs that throw, and the module DOM-free and independent of
  `js/logic.js`.
- `tests/gamepad.test.mjs` — controller helpers (`js/gamepad.js`), analog camera
  (`js/input.js::FlyCamera`), `js/controls.js::Controls`, and trigger sequences
  through `js/input.js::MouseActions`.
- `tests/tokens.test.mjs` — the token sheet (`css/tokens.css`, parsed as text):
  full token set on `:root`, semantic (non-hue) names, a dark value for every
  colour token, z-layer order, WCAG contrast per theme (4.5:1 body text, 3:1
  large text and essential glyphs, on every surface), the tile tokens (every
  tile state, the board frame and gap, numbers 1–8, opaque, in both themes;
  eight distinct light number colours, each 4.5:1 on the revealed tile),
  `css/style.css` declaring
  no variables and reading only declared tokens, `index.html` loading
  `css/tokens.css` before `css/style.css`, and the 3D scene not reading tokens.
- `tests/theme.test.mjs` — the theme applier (`js/theme.js`, run in a `node:vm`
  context against a stub root) and the token reader (`js/tokens.js`): Light
  before first paint, stored-getter fallback (missing, unknown, throwing),
  `setTheme` normalisation and listener order/isolation, `index.html` running
  the applier as a classic script before the stylesheets and module graph,
  `token()` values per theme, `onThemeChange` timing, the visible fallback
  colour and its development-only log, no copy of token values in
  `js/tokens.js`, and the 3D renderer never subscribing to theme changes.
- `tests/components.test.mjs` — the component kit (`css/components.css`,
  `js/ui/components.js`, `dev/components.html`): tokens only, no literal
  colour, no theme-specific rule, no animation; the head-comment catalogue
  documents every component and composition; every interactive component's
  states and focus ring; the `<head>` order of `index.html` and the gallery;
  the gallery showing every component in every state, the overlay bar and
  the results layout; controller reachability and accessible names; the
  helpers (`decimalsOf`, `formatSliderValue`, `segmentedTargetIndex`,
  `segmentedState`, `formatOverlayTime`, `formatMineCount`, the binders over
  stub elements); the HUD overlay bar markup, `UI.updateHud`'s formats and
  the pause wiring (`onPause`, controller START); the main menu and pause
  card built only from kit classes with no one-off rules left in
  `css/style.css`. Three Playwright tests check the WCAG contrast contract
  in both themes on rendered pages: the gallery (plus a visible focus ring
  on every forced-focus control), the overlay bar over the running 3D scene
  (opaque surface, timer pinned at `999`, pause through the button), and the
  menu, pause card and results layout (plus focus rings and an unchanged
  `__ms` key list); each skips when Playwright or chromium is unavailable.
- `tests/tile-skin.test.mjs` — the Classic 2D tile skin
  (`js/classic2d/tile-skin.js`) over a recording fake Canvas 2D context and
  the token maps parsed from `css/tokens.css` per theme: the states are the
  engine cell states plus `pressed`, each state's own tile tokens in both
  themes, a number's digit in its own colour and no glyph for zero, the edge
  that tells closed from revealed, plain drawing (no gradients, shadows or
  patterns), the placeholder for an unknown state or number, `paintTile`
  reading through the token reader, the cache (every state and number
  pre-rendered once, a redraw only image copies, keyed by size, pixel ratio
  and theme, dropped on a theme change before the renderer's redraw,
  `dispose` unsubscribing), `MIN_TILE_SIZE` a positive integer, and the
  module DOM-free at import with no literal colour and no three.js. One
  Playwright test measures the Expert tile below the overlay bar at
  1366×768 and 1280×800, checks it equals `MIN_TILE_SIZE`, and checks every
  state and number shows its glyph at that size in both themes (skipped
  when Playwright or chromium is unavailable).
- `tests/classic2d-view.test.mjs` — the Classic 2D board view
  (`js/classic2d/board-view.js`) over a fake canvas and a recording fake
  skin, with real engine games: the fit rule (Expert below the overlay bar
  gets `MIN_TILE_SIZE`, never smaller), centred and scrolling layouts,
  `cellAt` in a fitted and a scrolled board, `cellRect`, the canvas sized at
  the pixel ratio, the background token, only changed cells redrawn after
  an action, full repaints on resize, pixel ratio and the skin's theme
  redraw, only visible tiles drawn, clamped scrolling, the wheel, panning,
  `ensureVisible`, the hidden board, and the module DOM-free with no
  literal colour. One Playwright test mounts the view below a 64 px bar
  with 16 px margins and checks tile size and pixel colours of Beginner and
  Expert in both themes, a theme-change repaint, a 100 × 100 board scrolled
  by wheel, shift-drag and `ensureVisible`, and a refit on window resize,
  with screenshots (skipped when Playwright or chromium is unavailable).
- `tests/classic2d-pointer.test.mjs` — the Classic 2D pointer input
  (`js/classic2d/pointer-input.js`) over real engine games: the profile's
  input markers and their fidelity entries, pressed feedback, reveal,
  middle as left, chord on a number, left + right through the left
  release, the flag on the right press (also under a held left), moving and
  releasing off the board, inactive boards and `reset`, rules other than
  the reference; the board view's `setPressed`; the mounted wiring over
  `EventTarget` fakes (context menu, shift-pan presses ignored, blur,
  `destroy`); DOM-free. One Playwright test plays a fixed Beginner board by
  mouse to a win (skipped when Playwright or chromium is unavailable).
- `tests/classic2d-cursor.test.mjs` — the Classic 2D cursor input
  (`js/classic2d/cursor-input.js`) over real engine games: moving and
  clamping, auto-repeat of held directions, Space / Enter / F / D and the
  controller buttons (A / RT, X / LT, Y, both triggers; B, Start and Back
  unmapped) through `pad(poll)` with poll-shaped `held` arrays, the d-pad
  and the left stick, pressed feedback, press-follows-cursor, inactive
  boards and `reset`; the board view's focus ring (`setCursor`,
  `CURSOR_RING`); the mounted wiring over `EventTarget` fakes with a fake
  `requestAnimationFrame` (system key repeat ignored, modified keys and Esc
  left alone, blur, `destroy`); DOM-free and reusing `Repeat` /
  `stickCurve`. One Playwright test plays a fixed Beginner board by
  keyboard to a win (skipped when Playwright or chromium is unavailable).
- `tests/shell-router.test.mjs` — the screen router (`js/shell/router.js`:
  the seven feature screens, one screen shown per change with its data, the
  back stack, unwinding, `replace`, default focus declared or computed, a
  screen's own Back and the input that asked) and shell navigation
  (`js/shell/navigation.js`: topmost layer, focus fallback, the focusable
  selector, held-button suppression across screen changes, Esc and the
  controller Back buttons); both DOM-free; static checks that every screen
  change in `js/main.js` goes through the router, each shown screen declares
  a default focus and Back always resolves through the router. One
  Playwright test walks menu → screen → Back by keyboard with the default
  focus on each.
- `tests/shell-mode-host.test.mjs` — the mode host (`js/shell/mode-host.js`)
  over a recording fake mode: registration and its refusals, board choice,
  start/pause/resume/restart/leave, game state from the reports, `summary()`
  before and after the first click, `abandoned` on restart, leave and a
  replacing start, reports from an inactive mode ignored, failures (reported
  or thrown) with the failure screen, listeners; and the 3D adapter
  (`js/shell/mode-3d.js`): `summary3d`, the contract over a fake flow, its
  reports and a lost graphics context; both DOM-free, the contract
  documented in the module, and the shell reaching the 3D game only through
  the host. One Playwright test starts, pauses, resumes, restarts and leaves
  the 3D game through the adapter.
- `tests/shell-menu.test.mjs` — the main menu (`js/shell/menu.js`): the four
  entries in order, each route (mode board choice, screen, or the shared
  placeholder), the last mode played as a platform-storage document over the
  memory backend (recorded on game started, read back at start-up, a
  malformed document read as none, storage that does not persist never
  stopping a game); DOM-free; the menu, board-choice and placeholder markup
  in `index.html`, their router entries and default focus, and their
  catalogue entries. One Playwright test opens each entry and returns with
  Back.
- `tests/shell-pause.test.mjs` — the pause controller (`js/shell/pause.js`)
  over a real mode host, a fake mode and a recording shell: every pause
  source, automatic pauses only in play, no pause before the first click or
  after the end beyond the card, resume through the mode, the restart and
  back-to-menu confirmations, the `finished` / `abandoned` / `inProgress`
  hand-offs, routing to `results` once it exists, the leave-page guard armed
  only during a started, unfinished game; DOM-free; static checks that every
  pause source in `js/main.js` goes through the controller, that the guard is
  a listener it arms, and that the confirmation is kit markup. One Playwright
  test pauses, resumes, restarts and goes back to menu in the 3D game.
- `.claude/external/run-full-tests.sh` — `cd` to repo root, `exec node --test`.
- `.claude/external/run-affected-tests.sh <test-file>...` — `node --test` on the
  given files; exits 2 with usage when called with no arguments.
- Browser verification: ad-hoc Playwright scripts drive `window.__ms`,
  defined at the end of `js/main.js`; the suite's browser tests are the
  reload test in `tests/platform-browser.test.mjs`, the contrast tests in
  `tests/components.test.mjs`, the minimum-tile-size test in
  `tests/tile-skin.test.mjs`, the board test in
  `tests/classic2d-view.test.mjs`, the mouse game in
  `tests/classic2d-pointer.test.mjs`, the keyboard game in
  `tests/classic2d-cursor.test.mjs` and one flow test in each `tests/shell-*.test.mjs`.

No `package.json`, no dependencies: Node 22 built-in runner (`node:test`,
`node:assert/strict`). `node --test` with no arguments discovers
`tests/*.test.mjs`.

## PUBLIC API

Tests consume, and so pin, these contracts:
- `js/logic.js::Game` (`new Game(X, Y, Z, mines, rng)`) and
  `js/logic.js::createGameFromMinePositions(X, Y, Z, mineIdxList)`; members
  `n`, `idx`, `coords`, `neighbors`, `number`, `pressed`/`flagged`/`unlinked`
  (0/1 arrays), `leftClick`/`chord` → `{exploded, revealed}`, `rightClick` →
  `{flagged, unflagged}`, `state`, `explodedIdx`, `flagCount`, `minesLeft`,
  `unpressedCount`, `version`, `dirty`, `consumeDirty()`.
- `js/gamepad.js::stickCurve`, `triggerHeld`, `Repeat`, `padFamily`,
  `padGlyphs`, `pickInDirection`, `GamepadReader` (injected `getGamepads`,
  `onConnect`, `onDisconnect`, `onActiveChange`; `poll()` →
  `{pad, pressed, held, released}`), `BTN`, `STICK_DEADZONE`.
- `js/input.js::FlyCamera.move`/`moveAxes`/`lookAxes`, `MouseActions`
  (`down(b)`/`up(b)`, callback receives `'left'|'right'|'chord'`), `MOVE_SPEED`,
  `LOOK_DEG_PER_PX`, `PAD_LOOK_DEG_PER_S`; `js/controls.js::Controls`
  (`shift`/`space`/`ctrl` union, `pad`, `axes`, `hasAxes`, `releasePad()`).
- `js/engine/graph.js::createCellGraph`, `cellGraphFromLists`;
  `js/engine/square-grid.js::createSquareGrid` (index layout and neighbour
  order); `js/engine/profiles.js::PROFILES`, `REFERENCE_PROFILE`,
  `getRuleProfile` and every marker's `fidelity` heading;
  `js/engine/rules.js::createGame`, `createGameWithMines`, `PHASE`, `CELL` and
  the game's actions, queries, `counts()`, `summary()`, `actions()`;
  `js/engine/metrics.js::createBoardMetrics`, `createClickCounts`,
  `CLICK_KINDS`. Full list in [engine.md](engine.md).
- `js/generation/random.js::createSeededSource` (its pinned output stream);
  `js/generation/placer.js::placeMines`, `GENERATOR_VERSION`;
  `js/generation/solver.js::solve`, `solveFrom`;
  `js/generation/generate.js::generate`, `boardGraph`, `ATTEMPT_BUDGET`;
  `js/generation/worker.js::handleMessage` and the `{ id, request }` /
  `{ id, result | error }` messages; `js/generation/client.js::
  createGenerationClient`, `createModuleWorker`. Full list in
  [generation.md](generation.md).
- `css/tokens.css` token names and values (`:root` and
  `:root[data-theme="dark"]`); `js/theme.js::createThemeApplier`
  (`{root, readStored, onError}` → `apply`, `current`, `setTheme`, `onChange`)
  and the `globalThis.msTheme` it installs; `js/tokens.js::createTokenReader`
  (`{root, getStyle, theme, dev, log}` → `token`, `onThemeChange`),
  `FALLBACK_COLOR`; the `<head>` order in `index.html`.
- The kit's class names and markup patterns as catalogued in
  `css/components.css`, the gallery's coverage of them, the
  `js/ui/components.js` exports, the HUD ids (`#hud-time`, `#hud-mines`,
  `#hud-pause`) and `UI.prototype.updateHud`. Full list in
  [app-shell.md](app-shell.md).
- `js/classic2d/tile-skin.js::paintTile`, `paintTileWith`, `createTileSkin`
  (`drawTile`, `invalidate`, `cacheKey`, `dispose`), `TILE_STATES`,
  `MIN_TILE_SIZE`; `js/classic2d/board-view.js::fitTileSize`,
  `boardLayout`, `cellAtLayout`, `createBoardView`, `BOARD_BACKGROUND`,
  `CURSOR_RING`, `PAN_MODIFIER`; `js/classic2d/pointer-input.js::BUTTON`,
  `pointerRules`, `createPointerInput`, `mountPointerInput`;
  `js/classic2d/cursor-input.js::CURSOR_KEYS`, `PAD_MAP`, `STICK_THRESHOLD`,
  `createCursorInput`, `mountCursorInput`. Full list in [classic2d.md](classic2d.md).
- `js/platform/storage.js::createStorage` (`register`, `load`, `save`,
  `available`, the issue kinds and save reasons);
  `js/platform/browser-backend.js::createBrowserBackend`, `DOC_PREFIX`,
  `ASIDE_PREFIX`; `js/platform/memory-backend.js::createMemoryBackend`;
  `js/platform/index.js` exports. Full list in [platform.md](platform.md).
- `js/records/board.js::createBoardIdentity`, `boardKey` (its pinned
  format), `boardLabel`, `standardBoard`, `STANDARD_BOARDS`,
  `BOARD_KEY_FORMAT`; `js/records/summary.js::buildSummary` and the record's
  shape, `countedClicks`, `bbbvPerSecond`, `efficiency`, `isBestEligible`,
  `BEST_STATS`, `OUTCOMES`. Full list in [records.md](records.md).
- `js/shell/router.js::createRouter`, `SHELL_SCREENS`;
  `js/shell/navigation.js::FOCUSABLE`, `topLayer`, `resolveFocus`,
  `isBackKey`, `backButtons`, `createHeldSuppressor`;
  `js/shell/mode-host.js::createModeHost`, `MODE_METHODS`, `MODE_EVENTS`;
  `js/shell/mode-3d.js::create3DMode`, `summary3d`;
  `js/shell/menu.js::MENU_ENTRIES`, `PLACEHOLDER_SCREEN`, `entryRoute`,
  `createMenu`, `createLastMode`, `LAST_MODE_DOC`;
  `js/shell/pause.js::createPauseController`, `PAUSE_SOURCES`,
  `AUTO_SOURCES`, `HAND_OFFS`, `CONFIRMATIONS`. Full list in
  [app-shell.md](app-shell.md).

Browser hook `js/main.js::window.__ms` (full list in [app-shell.md](app-shell.md)):
- getters `state`, `game`, `renderer`, `camera`, `controls`, `pads`, `fps`,
  `frameStats`, `modes` (the mode host), `pauser` (the pause controller);
  `THREE`, `startCameraPos`; `state.mode` is the router's current screen.
- `start(X, Y, Z, mines, minePositions?)`, `forcePlay()`, `pause()`.
- `moveTo(x,y,z)`, `look(yaw,pitch)`, `aimAt(idx | [x,y,z])` → selected idx,
  `cellCenter(idx)`.
- `mouseDown(b)`, `mouseUp(b)`, `click('left'|'right'|'chord')`,
  `key(code, down)`, `wheel(notches)`.
- `selected()`, `pickBrute()`, `pickWith(o, d, space)` → `[dda, brute]`,
  `info()` → mode, selected, time, started, spacing, gameState, minesLeft, HUD
  text, camera, renderer stats, fps.

## INTERNAL PATTERNS

- **Testing policy is full-tdd** (`CLAUDE.md` "Tasks implementation"): every
  task runs tests first — write/extend the failing test, then implement, then
  run `.claude/external/run-full-tests.sh`.
- Determinism: randomness is injected. `mulberry32(seed)` for seeded runs,
  `seq([...])` for exact rng values; deterministic boards via
  `createGameFromMinePositions` (helper `G`).
- `NaiveGame` in `tests/logic.test.mjs` is the fidelity oracle for
  `js/logic.js`: a direct port of the original
  `Cell.cs`/`Grid.cs`/`Minesweeper.cs` frame logic (recursive click,
  exception-based explosion, full unlink passes until stable). `naivePlace`
  mirrors `Grid.cs` linear-probe placement. Never "fix" the oracle to match
  the engine; the engine must match the oracle.
- The fidelity observation, not the engine, is the oracle for the
  cell-graph engine: `tests/engine-fidelity.test.mjs` parses
  `tests/fidelity/minesweeper-online.md`, and a failure there is fixed in the
  engine against the file, never by editing the file, unless a feature
  document records the difference as deliberate. The fix ships as a new
  rules version; every earlier version's tests stay and keep passing.
- Generation determinism: the same request, seed and `GENERATOR_VERSION`
  give the same board. The generation tests pin exact outputs — the seeded
  source's first values, a placed Expert board, an accepted no-guess board —
  so a change that moves any of them is a generator change: bump
  `GENERATOR_VERSION` and re-pin, never re-pin alone. Seeds are fixed
  integers; nothing reads `Math.random`.
- Solver tests build boards from row strings (`'*'` a mine, `'o'` the first
  click, `'.'` safe) and check the solver against an exhaustive reference;
  the client tests drive a fake worker that answers through `handleMessage`
  after a macrotask (or on `flush()` when held).
- Engine tests build boards from row strings (`'*'` a mine) over
  `createSquareGrid`, and use `cellGraphFromLists` for non-square graphs.
  The summary tests reuse the pattern (`playing(rows)`) to play real engine
  games and feed their `summary()` / `counts()` to the builder, with a fixed
  `endedAt` and `id`.
- The randomized test runs 400 seeds × 40 actions and asserts per-cell
  equality via `assertSame` plus `minesLeft == mines - flagCount`; it requires
  `actions > 5000`, so do not make the action generator skip more often.
- Performance budget: 100×100×100 / 1000 mines construct < 1 s, construct +
  zero-region click < 2 s; mines == n on 10^6 cells < 2 s.
- Storage tests inject the backend: the memory backend (its `documents` /
  `aside` Maps edited directly) for the interface, a `FakeStorage` passed
  through `getStorage` for the browser backend. The platform-module tests
  swap `globalThis.localStorage` and import `js/platform/index.js` with a
  distinct query string, so each import evaluates the selection afresh.
- Gamepad tests use a `fakePad` object (17 buttons, 4 axes, `mapping: 'standard'`)
  and a mutable `list` returned by `getGamepads`; no browser globals needed.
- `FlyCamera.moveAxes` is tested for exact equality with `move()` under keys,
  so the original forward-vector quirk is covered there.
- Static-file tests read `css/*.css`, `index.html` and `js/*.js` as text with
  `readFileSync`; CSS comments are stripped before parsing. Classic scripts
  (`js/theme.js`) run in a `node:vm` context whose global carries a stub
  `document.documentElement`; DOM-free factories take stub roots and
  `getStyle` functions instead of browser globals.
- Kit tests parse markup and CSS as text: `COMPONENTS` (component → root
  class, interactive control) and `COMPOSITIONS` are the catalogue's mirror,
  so a new kit piece is added there too; `UI` methods are called through
  `UI.prototype.<method>.call(fake)` with a fake `el`, since `js/ui.js`
  imports without a DOM. The Playwright tests serve the repo root from an
  in-process `node:http` server on a free port, load Playwright by
  `import('playwright')` falling back to the global install, measure contrast
  in the page (`measureContrast`: every visible text run composited over its
  effective background, 4.5:1 or 3:1 for large text and accent labels) and
  write screenshots to a `mkdtemp` directory.
- Shell tests drive the DOM-free modules with fakes: a recording `fakeMode`
  whose `play` helper reports a first click, an end or a failure, a recording
  router and shell callbacks, and the memory storage backend. Their static
  checks read `js/main.js` and `index.html` as text and slice them between
  markers — `const SHELL = createRouter(` … `// end of screen table`,
  `const FLOW_3D = {` … `// end of 3D flow`, and the `index.html` section
  comments (`<!-- 3D board choice -->`, `<!-- Coming soon -->`,
  `<!-- Click to play -->`) — so keep those markers when editing. The
  Playwright flow tests reuse the in-process server and drive the screens'
  buttons and keys, the mode-host and pause tests also `__ms.modes` /
  `__ms.pauser`.
- Tile-skin tests paint onto `fakeContext()`, a Proxy that records every
  call with the fill and stroke style in force, and build skins with an
  injected token function, theme source and canvas factory, so the painter
  and cache run in Node; the browser test reuses the in-process server and
  counts glyph-coloured pixels per tile.
- Board-view tests build the view with a fake canvas (a recording Proxy
  context) and a `createSkin` that records every `drawTile` and hands back
  the `redraw` callback, so layout, hit-testing and redraw run in Node; the
  browser test mounts it in `dev/components.html` with `mountBoardView`
  and keeps it on `globalThis.__view` for `page.evaluate`.
- Untested by Node beyond the static and stub checks above: `js/render.js`,
  `js/textures.js`, `js/picking.js`, `js/ui.js`, `js/main.js`, `js/audio.js`
  — verify in the browser. Computed styles and the rendered theme are
  browser-only too.

Browser verification (Playwright):
- Playwright 1.56 is installed globally (`/opt/node22/lib/node_modules/playwright`,
  CLI `/opt/node22/bin/playwright`); resolve it via `NODE_PATH` or an absolute
  import, not a local install. Browsers live in `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
  (chromium build 1194). Do not run `playwright install`.
- WebGL 2 is required and there is no GPU: launch chromium with SwiftShader,
  e.g. `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
- Serve over HTTP (ES modules fail on `file://`), e.g. globally installed
  `http-server` or `serve` from the repo root.
- Headless has no pointer lock: call `__ms.start(...)` then `__ms.forcePlay()`
  (lockless play) before driving actions; aim with `aimAt`, act with `click`.
- Every hook mutator calls the synchronous `refresh()` (camera, toggles,
  spacing, picking), so `selected()`/`info()` are valid immediately; rendered
  pixels need a following animation frame. `pickWith` compares DDA against
  brute-force picking — use it for picking regressions.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original is the overriding rule; tests are where it
is enforced.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md):
  - "Mines & numbers" — linear-probe placement, 26-neighbourhood, no
    first-click safety (placement tests, `naivePlace`).
  - "Rules" — leftClick/chord/rightClick/unlinking/win/lose semantics
    (`NaiveGame`, rule tests); timer start rule (browser only).
  - "Controls" — release-to-act chord state machine (`MouseActions` test),
    50 u/s movement, look rates, pitch clamp (`FlyCamera` tests); picking
    exclusions (browser `pickWith`/`aimAt`).
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the engine behaviours, 3BV and click-count definitions and the fidelity
  rule the `engine-*` tests encode.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the determinism, failure, cancel and solver-correctness contracts the
  `generation-*` tests encode.
- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — the identity, key, summary, derivation and best-eligibility contracts
  the `records-*` tests encode.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the contrast contract and applier/reader contracts `tokens.test.mjs` and
  `theme.test.mjs` encode.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioning and failure contracts the `platform-*` tests encode.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit, state, focus, overlay and contrast contracts
  `components.test.mjs` encodes.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the drawing, cache, contrast and minimum-size contracts
  `tile-skin.test.mjs` encodes.
- [../domain/features/game-shell.md](../domain/features/game-shell.md)
  — the router, Back, mode contract, menu and pause contracts the
  `shell-*` tests encode.
- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose acceptance
  criteria become tests.

## CROSS-REFERENCES

- [logic.md](logic.md) — `tests/logic.test.mjs` pins the engine API and checks it against the naive port.
- [engine.md](engine.md) — `tests/engine-*.test.mjs` pin the cell-graph engine; the fidelity test checks it against the observation file.
- [generation.md](generation.md) — `tests/generation-*.test.mjs` pin the seeded generator, solver, no-guess loop, worker and client.
- [platform.md](platform.md) — `tests/platform-*.test.mjs` pin the storage interface, backends and start-up selection.
- [records.md](records.md) — `tests/records-*.test.mjs` pin the board identity and key, the summary builder and its derived stats.
- [input.md](input.md) — `tests/gamepad.test.mjs` covers gamepad helpers, `FlyCamera`, `Controls`, `MouseActions`.
- [app-shell.md](app-shell.md) — owns `window.__ms`, the surface Playwright drives,
  the token sheet, theme applier and token reader the token/theme tests pin,
  the component kit and kit-built screens `components.test.mjs` pins, and
  the game shell (`js/shell/`) the `shell-*` tests pin.
- [classic2d.md](classic2d.md) — `tests/classic2d-view.test.mjs` pins the board view; `tests/tile-skin.test.mjs` the tile painter, cache and `MIN_TILE_SIZE`.
- [rendering.md](rendering.md) — no unit tests of the drawing (only the static not-themed checks); verified visually via Playwright screenshots.
- [audio.md](audio.md) — no unit tests; WebAudio only checkable in a browser.

## WHEN TO READ THE SOURCE

- Adding a rule change to the 3D engine: extend `NaiveGame` only if the original
  behaves that way, then add a focused test next to the matching section.
- A fidelity-test failure: read the cited entry in
  `tests/fidelity/minesweeper-online.md` and the profile marker that cites
  it, then fix the engine.
- A randomized-test failure: read `assertSame` output (seed, action, cell) and
  replay that seed with both engines.
- A pinned generation output fails: decide whether the change is a generator
  change (bump `GENERATOR_VERSION`, re-pin) or a regression; a solver
  failure prints the seed — replay it with `solve()` and read
  `js/generation/solver.js`.
- Changing placement or rng use in `Game` (seed streams must stay aligned with
  `naivePlace`).
- Adding a gamepad family, button mapping or trigger threshold (`padFamily`
  cases, `fakePad`, `press`).
- Writing a Playwright script that needs a hook method not listed above, or
  changing `__ms` (read the end of `js/main.js`).
- Investigating a perf-test timeout on slower hardware.
- A contrast failure in `tests/tokens.test.mjs`: the message names the theme,
  token pair and ratio; read the colour parser there before changing a value
  format in `css/tokens.css`.
- A browser contrast failure in `tests/components.test.mjs`: the message lists
  the failing text runs per theme; read `measureContrast` there and the
  screenshots it saved before changing a token or a kit rule.
