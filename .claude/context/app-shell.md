# App shell — game shell, game flow, frame loop, menus, HUD, component kit and theming

## OVERVIEW

The glue that turns the rules engine, renderer, input and audio into a game:
the game shell (screen router, mode host, main menu, pause controller), the
results flow and screen, the 3D game's wiring to the screens, renderer and
pointer lock (the 3D board choice, session and adapter themselves are
[mode3d.md](mode3d.md)), the per-frame loop, action dispatch, end of game,
menus/HUD/overlays, the DOM component kit the screens are built from, design
tokens and the light/dark theme, the debug hook, and the static-site files.

- `js/main.js` — entry module. Builds `BoardRenderer`, `FlyCamera`, `Input`,
  `MouseActions`, `Controls`, `GamepadReader`, `UI`, the settings store
  `SETTINGS` ([settings.md](settings.md)), and the shell objects
  `SHELL` (router), `MODES` (mode host, with the 3D adapter registered as
  `'3d'` and the Classic 2D mode as `'classic-2d'`), `PAUSE` (pause
  controller), `MENU`, `LAST_MODE`, `LAST_CHOICE_3D` and `CHOICE_3D` (the 3D
  board choice binder), `GEN_3D` (the 3D game's generation client),
  `LAST_CHOICE_2D` and `CHOICE_2D` (the
  Classic 2D board choice binder), `RECORDS` (the records store), `REPLAYS`
  (the replay library, [replay.md](replay.md)), `REPLAY_VIEWER` (the
  replay viewer, [replay.md](replay.md)) and `REPLAY_SCENE` (the 3D replay's
  scene and camera), `RESULTS`
  (the results flow), `RESULTS_VIEW` and `RECORDS_PAGE` (the Records
  screen's controller over its view, [records.md](records.md)); holds the
  single state object `S`; runs the `requestAnimationFrame` loop; exposes
  `window.__ms`. Also maps controller polls to game and menu actions
  (`handlePad`, `padPlaying`, `padMenus`, `padReplay`).
- `js/shell/` — the game shell's DOM-free modules; `js/main.js` hands each
  its screens, elements and callbacks:
  - `router.js` — the screen router and back stack (`createRouter`,
    `SHELL_SCREENS`).
  - `navigation.js` — the shell navigation layer over the controller
    reader: topmost layer, default-focus fallback, Back inputs, the arrow
    keys' focus moves, held-button suppression (see [input.md](input.md)).
  - `history.js` — the session-history mirror of the router's back stack,
    through which the browser's Back is a Back input (`createHistorySync`;
    its rules are documented in its head comment).
  - `mode-host.js` — the mode contract and the registry the shell reaches
    every mode through (`createModeHost`, `MODE_METHODS`, `MODE_EVENTS`); the
    contract is documented in its head comment.
  - `mode-3d.js` — the 3D adapter: the 3D game session behind the mode
    contract (`create3DMode`; [mode3d.md](mode3d.md)).
  - `menu.js` — the main menu's entries and routes, the last mode played
    and each mode's last board choice (`MENU_ENTRIES`,
    `PLACEHOLDER_SCREEN`, `entryRoute`, `createMenu`, `createLastMode`,
    `createLastBoardChoice`).
  - `lock-fallback.js` — the 3D ready card's pointer-lock refusal counter
    (`createLockFallback`, `LOCK_MESSAGES`, `RELOCK_COOLDOWN_MS`): which
    message a refusal shows and when the page counts as blocked; pure.
  - `pause.js` — the pause controller: pause, resume, restart, back to menu,
    the confirmations, the game hand-offs and the leave-page guard
    (`createPauseController`); its rules are documented in its head comment.
  - `first-use.js` — the first-use hints: the `shell.firstUse` document and
    the rules for when each hint shows (`createFirstUse`, `stripShown`,
    `hidCube`, `aimHintCell`, `createDwell`); the document and the rules are
    documented in its head comment.
- `js/results/` — the results screen (`results-screen`), DOM-free apart from
  the view's binder:
  - `flow.js` — the results flow on the `finished` and `abandoned`
    hand-offs: records the game, routes a finished one to `results`, then
    adds the game's replay to the replay library; *Watch replay* opens the
    replay viewer on that replay (`createResultsFlow`, `RESULTS_SCREEN`).
  - `view.js` — the screen's content and its time, rate and efficiency
    formats (`resultsContent`, `formatTime`, …) and the binder that fills
    `#results` (`createResultsView`); the formats are documented in its head
    comment.
- `js/ui.js` — DOM only, no game rules: class `UI`, board-settings clamping
  and the board lines. Formats the overlay bar with the kit helpers from
  `js/ui/components.js`; fills the Settings page from `js/settings/page.js`
  and every help surface from `js/settings/bindings.js`.
- `index.html` — every overlay is static markup toggled by the `.hidden` class;
  importmap maps `three` to `vendor/three/three.module.min.js` (vendored
  three.js r186, no build step); a module `onerror` shows a `.fatal` card.
  Head order: classic `js/theme.js`, then `css/tokens.css`, then
  `css/components.css`, then `css/style.css`, then the module graph. The HUD
  overlay bar, the main menu (`#menu`), the 3D board choice
  (`#board-choice`), the Classic 2D board choice (`#c2d-choice`), the
  placeholder screen (`#coming-soon`), the Records screen (`#records`), the
  Settings page (`#settings`, its controls generated into
  `#settings-body`), the results screen (`#results`), the replay viewer
  (`#replay`) and the pause card (`#pause-card`) are kit markup
  (§ Component kit). `#c2d` is the Classic 2D board layer, the board area
  `#c2d-board`; the generating / failed-board card `#c2d-status` sits beside
  it, and `#m3d-status` is the same card over the 3D box. Both cards are
  stacked above the pause card (`css/style.css`): the generating card holds
  a `ui-spinner` and Cancel (`#…-wait`), the offer Retry, Play a standard
  board and Main menu (`#…-offer`).
- `css/tokens.css` — the design tokens, the single source of every shared
  visual value: palette (`--color-*`), typography (`--font-*`), spacing
  (`--space-*`), radii (`--radius-*`), elevation (`--elevation-*`), motion
  (`--duration-*`, `--easing-*`) and z-layers (`--z-*`). Light values on
  `:root`, dark overrides under `:root[data-theme="dark"]`.
- `css/components.css` — the component kit: `ui-*` component classes, their
  states and the layout compositions screens are assembled from. Its head
  comment is the catalogue — each component's element, role, accessible
  name and markup pattern, the states and focus contract, the compositions
  and the screens built from them.
- `js/ui/components.js` — the kit's behaviour helpers (ES module, imports
  nothing): pure formatting/selection logic plus binders that touch only the
  elements they are handed, so it runs under Node with stub elements.
- `dev/components.html` — the kit gallery (development only, not linked from
  the game): every component in every state, the overlay bar and the results
  screen layout (`#g-results`), with a Light/Dark switch. Loads only
  `js/theme.js`, `css/tokens.css` and `css/components.css`; `?theme=dark`
  opens it in Dark.
- `css/style.css` — shell styling: positioning of the fixed layers (the
  Classic 2D board layer and its board area below the overlay bar, and the
  replay viewer's layer — opaque, or transparent over the 3D scene under
  `replay--scene` — its board area, controls and `.replay-pointer`), the
  Back rows (`.esc-row`, the `[data-esc-hint]` hint, Settings' sticky
  `#settings-actions`), the menu-screen backdrop shared by `#menu`, `#board-choice`, `#coming-soon`,
  `#c2d-choice`, `#settings` and `#records`,
  the translucent backdrop shared by `#pause`, `#ready` and `#results`, the
  results screen's opaque takeover surface over a 3D game
  (`#results.results--takeover`, `--color-backdrop` with no blur), the
  ready/help/controls/ctx-lost overlays and the HUD placement; the
  kit-built screens carry no one-off rules of their own, apart from the
  Records screen's chart box (`#records-chart`), games table
  (`#records-games`) and replays table (`#records-replays-table`). Declares no
  custom properties and reads only tokens from `css/tokens.css`. Layered
  fixed overlays use the `--z-*` tokens (HUD 10, help 11, flash 15,
  overlays 20, controls modal 30, ctx-lost 40, toast 45, fatal 50).
- `js/theme.js` — theme applier, a classic (non-module) script run before
  first paint: sets the root `data-theme` attribute (`light` | `dark`) from
  the saved settings document and exposes `globalThis.msTheme`.
- `js/tokens.js` — token reader (ES module) for consumers that cannot read
  stylesheet values directly, chiefly Canvas renderers.
- `js/shell/scene-palette.js` — the 3D scene's themed sky: reads the
  `--color-scene-*` tokens through the token reader and hands them to the
  renderer at start-up and on every theme change.
- `404.html` — redirects to `/` (GitHub Pages). `CNAME` = `minesweeper3d.chosko.com`;
  `.nojekyll` disables Jekyll processing so files are served as-is.

## PUBLIC API

`js/shell/router.js`
- `SHELL_SCREENS` — the feature's seven screens (`menu`, `board-choice`,
  `playing`, `paused`, `results`, `records`, `settings`); a shell registers
  the ones it has.
- `createRouter({screens, focus?, onChange?})` — `screens[name]` =
  `{ show(data, from), hide?(to), defaultFocus?: selector | null | () => selector,
  back?({router, source}) }`; `focus(target, name)` is the focus hand-off;
  `onChange({from, to})` runs after every change. Router: `current`, `stack`
  (copy), `has(name)`, `defaultFocus(name?)`, `go(name, {data, replace})`,
  `back(source)` → false when there is nowhere to go, `refocus()`. An unknown
  screen throws.

`js/shell/history.js`
- `HISTORY_KEY` (`'ms3d'`) — the state key every entry of this page carries,
  `{ms3d: <page load>, depth}`.
- `createHistorySync({router, history, onBack, session?, superseded?})` →
  `start(navigationType)` (stamps the current entry as the base, depth 0,
  superseding the page load it belonged to; false when it is an entry of a
  superseded load, and the page walks out instead), `sync()` (after every
  router change: push, replace or `history.go(-n)` until the depth equals
  `router.stack.length`), `popstate(state)`, `depth`, `pending`.
- `storedSet(getStorage, key, limit?)` → `{has(id), add(id)}`, the superseded
  page loads in the tab's session storage (`ms3d.history.superseded`, the
  newest 50); unusable storage reads as empty.

`js/shell/mode-host.js`
- `MODE_METHODS` (`openBoardChoice`, `start`, `pause`, `resume`, `restart`,
  `leave`, `summary`), `MODE_EVENTS` (`started`, `finished`, `abandoned`,
  `canPause`, `failed`).
- `createModeHost()` → `register(id, (report) => mode)` (returns the mode;
  duplicate id, missing method or non-factory throws), `has(id)`, `ids`,
  `active`, `state` (`{mode, started, finished, canPause}`),
  `on(event, listener)` → unsubscribe, `openBoardChoice(id)`,
  `start(id, choice)`, `pause(opts)`, `resume(opts)`, `restart(opts)`,
  `leave()`, `summary()`. A mode may also provide `replay(summary)`, the
  game's replay sealed with that summary ([replay.md](replay.md)), or null;
  a mode without it records no replays. A mode reports through
  `report.started()`, `finished(summary, replay)`, `canPause(bool)`,
  `failed(reason)`; it may declare `failureScreen`. Listeners of `finished`
  and `abandoned` receive `{mode, summary, replay}`, `replay` null when the
  mode passed none.

`js/shell/mode-3d.js` — `create3DMode(flow, report)`, with
the 3D board choice and session they sit on, are [mode3d.md](mode3d.md).

`js/shell/menu.js`
- `MENU_ENTRIES` — `classic-2d` (mode), `3d` (mode), `records` (screen),
  `settings` (screen), in that order; `PLACEHOLDER_SCREEN` = `'coming-soon'`.
- `entryRoute(entry, {hasMode, hasScreen})` → `{mode}`, `{screen}` or
  `{screen: 'coming-soon', data: {entry, title}}`.
- `createMenu({router, modes, entries?})` → `entries`, `route(id)`,
  `open(id)` (returns the route taken).
- `LAST_MODE_DOC` = `'shell.lastMode'`, `LAST_MODE_VERSION` = 1;
  `createLastMode({storage, modes})` → `current`, `record(mode)`, `load()`
  (null when nothing or a malformed document is stored), `dispose()`.
- `createLastBoardChoice({storage, doc, version?, normalise, fallback})` →
  `current` (`fallback` until loaded or saved), `played`, `load()`,
  `save(choice)` (a `RangeError` on a choice `normalise` refuses): a mode's
  last board choice in its own document; the 3D mode keeps
  `mode3d.lastChoice` with it.

`js/shell/pause.js`
- `PAUSE_SOURCES` (`key`, `pad`, `button`, `blur`, `hidden`), `AUTO_SOURCES`
  (`blur`, `hidden`), `HAND_OFFS` (`finished`, `abandoned`, `inProgress`),
  `CONFIRMATIONS` (`restart`, `menu`: `{action, message, confirmLabel}`).
- `createPauseController({modes, showCard, isPaused?, onBoard?, confirm,
  goMenu, guard?, cancelGeneration?})` → `inProgress`, `pause(source,
  {note})` → whether the card opened, `back(source)` — Back on the board:
  `cancelGeneration()` when a board is being generated, else `pause` —
  `resume(source)`, `restart(source)`, `toMenu()`,
  `pageHide()`, `attach(handOff, listener)` → detach, `dispose()`.
  `finished` and `abandoned` listeners receive `(summary, mode, replay)`,
  `replay` the sealed `{blob, listing}` or null; `inProgress` listeners
  `(summary, mode)`.

`js/results/flow.js`
- `RESULTS_SCREEN` = `'results'`.
- `createResultsFlow({records, replays?, router, restart(source, current),
  goMenu})` → `attach(pauser)` → detach (both hand-offs),
  `finished(summary, mode, replay?)` → the routed data `{summary, mode,
  comparison, saved, notSaved, watch}` or null, `abandoned(summary, mode,
  replay?)`, `current` (the data last shown), `playAgain(source)`,
  `openRecords()`, `watch()`, `toMenu()`. `replays` is the replay library;
  without it no replay is kept. `watch` is whether *Watch replay* is
  offered: the game handed over its sealed replay and the router has the
  replay viewer's route (`REPLAY_SCREEN`, [records.md](records.md)).

`js/results/view.js`
- `formatTime(ms)` (thousandths, truncated: `"47.380 s"`), `formatTimeDifference`,
  `formatRate` / `formatRateDifference` (two decimals),
  `formatEfficiency` / `formatEfficiencyDifference` (one decimal,
  `"94.7%"`); a difference zero at its precision is `EQUAL_BEST`
  (`"= best"`), a missing value is `DASH`. `formatClicks(clicks)` →
  `"Clicks 183 (L 183 · R 0 · D 0 · wasted 0)"`. `NOTES` (`notRecorded`,
  `notSaved`), `NOT_ELIGIBLE`, `FIRST_BEST`.
- `resultsContent({summary, comparison?, saved?, notSaved?, watch?, rank?,
  streak?})` → `{outcome, title, board, banner, stats: [{key, label, value,
  shown, newBest}], figures: {clicks, rank}, next, eligible, bestsNote,
  bests: [{stat, label, best, difference, newBest, direction, detail}] |
  null, notes, watch, takeover}`; the head comment documents each field
  (the loss comparison and its pace, the delta direction, the next-target
  forms); `takeover` is true for a 3D game's summary.
- `createResultsView({root, onPlayAgain, onWatch?, onRecords, onMenu})` →
  `show(content)`, `hide()`; `#r-watch` shows only while `content.watch`,
  the root carries `results--takeover` while `content.takeover`, the bests
  panel `ui-panel--muted` while not eligible, an improved stat
  `data-new-best` and a best's detail `data-delta`.

`js/ui.js` exports (consumed by `js/main.js`)
- `DIM_MIN`/`DIM_MAX` (1/100, re-exported from `js/mode3d/board-choice.js`);
  `clampSettings(s)` → `{X,Y,Z,mines}` integers, dims 1..100, mines
  1..X*Y*Z − 1, since the first click is safe (a 1×1×1 board clamps to 0
  mines). `startGame` clamps with it; the board choice validates first.
- `fmtDims(s)`, `pauseLine(time, minesLeft)` (the pause card's
  `"Time 11.643 s · 12 mines left"`, through `formatTime`), `NO_MOUSE_MSG`;
  `boardLine3D(s, {mines?})` (`"6 × 6 × 6 · 10 mines · no-guess"`, the mine
  count only with `mines`) and `boardLine2D({width, height, noGuess})`
  (`"30 × 16 · no-guess"`): " · no-guess" on a no-guess board.
- `UI` constructor `(cb)` with callbacks `onMenuEntry(id)`, `onBack` (the
  placeholder's and Settings page's Back buttons), `onReadyClick`,
  `onReadyDrag` (the ready card's "Play with drag-to-look"), `onReadyBack`, `onResume`,
  `onRestart`, `onMainMenu`, `onPause` (the overlay bar's pause button),
  `onToggleSound`, `onDismissHint(mode)` (the hint strip's ×),
  `onRetry2D`, `onStandard2D`, `onOfferMenu2D` (the failed Classic 2D
  board's offer), `onCancel2D` (its generating card), `onRetry3D`,
  `onStandard3D`, `onOfferMenu3D`, `onCancel3D` (the same over the 3D box).
  Methods: screens `showMenu`, `showBoardChoice`,
  `showBoardChoice2D`, `showComingSoon(title)`, `showRecords` (the menu
  backdrop with the other menu screens hidden; the records view fills and
  shows `#records`), `showSettings` (its bindings
  in the active controller's glyphs),
  `showReady(board, msg, {rules, blocked})` (the board line with its mines, the
  "How 3D works" block `#ready-rules` while `rules`, the drag-to-look and
  controller offer `#ready-blocked` while `blocked`), `showPlaying`,
  `showClassic2D` (positions `#c2d-board` 16 px below the overlay bar),
  `showPause({state,time,minesLeft,note,mode})` (the board line, the mode's
  bindings, the look settings only for `'3d'`, "Back to start" only for a 3D
  game in play), `updatePause({time, minesLeft})` (the card's status line,
  which the frame loop refreshes from `pauseInfo()` while the card shows, so
  its running time advances), `showReplay` (hides the
  game's HUD, help panel, hint strip and toast);
  Classic 2D `setBoard2D(board)`, `setBoardStatus({generating, failure})`;
  3D `setBoardStatus3D({generating, failure})` (`#m3d-status`); menu
  `setLastMode(mode|null)`; pause confirmation
  `showConfirm({message, confirmLabel}, onYes, onNo)`, `isConfirmOpen`,
  `closeConfirm` (→ false when none is open); HUD `setBoard(board)` (3D),
  `updateHud(time, minesLeft, clicks?)` (overlay formats and the click
  count, DOM write only on change; without `clicks` the readout stays),
  `setModes`, `setCrosshair`, `setArrow(angle|null)` (the off-screen arrow `#crosshair-arrow` beside
  the crosshair, turned to `angle`; DOM write only on change), `showSpacing`, `setSound(muted)` (also the HUD
  strip's sound label); help `toggleHelp`, `userToggleHelp`,
  `setHintStrip(on)` (the strip steps aside while the help panel is open),
  `dismissHint`,
  `setDevice('keyboard' | 'controller')`; `flash`, `toast(msg, ms)`,
  `setPad(info|null)` (the connected pad's glyphs and mapping, and the ready
  card's controller line),
  `setNoMouse`, `openControls`/`closeControls`
  (→ false when already closed)/`isControlsOpen`, `isPauseVisible`,
  `setReadyMessage`. The help surfaces show the mode the last screen method
  set (`showReady`/`showPlaying` 3D, `showClassic2D` Classic 2D,
  `showPause`'s `mode`) for the device `setDevice` set, and every change of
  either, or of the pad's glyphs, redraws them — the Settings page's
  bindings too while it shows.

`js/ui/components.js` exports
- `formatOverlayTime(seconds)` → whole seconds, three digits, stopping at
  `'999'`; `formatMineCount(minesLeft)` → the real count, kept at -99 at the low end. Display
  only. `mineCounterDigits(mines)` → the counter's width in digits for a board: its mine
  count's digits, at least 3; past 3, `UI.setBoard` / `setBoard2D` set `#hud-mines`' `min-width`
  to that many `ch` (tabular figures, `css/style.css`), so the bar does not shift as it falls,
  and clear it otherwise, so a board of up to 999 mines keeps the standard counter.
- `formatSliderValue(value, {format: 'number'|'percent'|'multiplier', step, max, unit})`,
  `decimalsOf(step)`.
- `segmentedTargetIndex(disabled, current, key, {horizontal?})` (arrows wrap,
  Home/End, disabled skipped; `horizontal` takes Left/Right only),
  `segmentedState(count, selected)` (aria-checked, roving tab order).
- `bindSlider(root)`, `bindSegmented(group, {onChange, horizontal?})`
  (dispatches `change` with `{value, index}`; `horizontal` leaves Up/Down
  unhandled for the shell's focus moves), `initComponents(root)` — each
  returns an unbind.

`js/theme.js` — `globalThis.msTheme` (also `createThemeApplier({root, readStored?, onError?})`,
the factory tests drive):
- `current()` → `'light' | 'dark'`; `setTheme(theme)` — an unknown value is
  `light`, never thrown; a no-op when unchanged.
- `onChange(listener)` → unsubscribe; listeners run after the attribute
  changes, and a throwing listener does not stop the others.

`js/tokens.js` exports
- `token(name)` → the token's computed value on the document root for the
  active theme (`name` with or without the leading `--`); an unknown token
  returns `FALLBACK_COLOR` (`#ff00ff`), logging once per name only in development (hostname
  localhost, 127.0.0.1, [::1] or empty).
- `onThemeChange(listener)` → unsubscribe (delegates to `msTheme.onChange`).
- `createTokenReader({root, getStyle, theme, dev?, log?})` — the factory behind both.

`js/shell/scene-palette.js` exports
- `SCENE_TOKENS` — `{horizon, zenith, nadir}` → the `--color-scene-*` token
  names of the sky gradient's stops.
- `parseRgb(value)` → `[r, g, b]` 0–255 from a hex or `rgb()`/`rgba()` token
  value; anything else is the fallback magenta `[255, 0, 255]`.
- `scenePalette(token)` → `{horizon, zenith, nadir}` for the active theme.
- `bindScenePalette({token, onThemeChange, renderer, onApplied?})` — calls
  `renderer.setScenePalette` now and on every theme change, then
  `onApplied` (`js/main.js` sets `needRender` there); returns the
  unsubscribe.

`js/main.js` exports nothing; its surface is `window.__ms` (tests, Playwright):
- getters `state` (the live `S`), `game`, `renderer`, `camera`, `controls`,
  `pads`, `fps`, `frameStats` (`{renders, skipped}`), `modes` (the mode
  host), `pauser` (the pause controller), `settings` (the settings store),
  `records` (the records store), `replayViewer` (`REPLAY_VIEWER`);
  `THREE`, `spawnPose(X, Y, Z)` (the spawn pose of that box at the current spacing, field of view
  and aspect).
- `watch(data)` → `SHELL.go('replay', {data})`, `data` the viewer route's
  `{replay | replayId, returnTo}`.
- `start(X, Y, Z, mines, minePositions?)` → `MODES.start('3d', …)`;
  `forcePlay()` enters lockless play; `pause()` → `pauseGame('key')`.
- camera/aim: `moveTo`, `look(yaw, pitch)`, `aimAt(idx | [x,y,z])` → selected idx,
  `cellCenter(idx)`; each calls the synchronous `refresh()` first.
- actions: `mouseDown(b)`, `mouseUp(b)`, `click('left'|'right'|'chord')`,
  `key(code, down)`, `wheel(notches)`; picking `selected()`, `pickBrute()`,
  `pickWith(o, d, space)` → `[dda, brute]`; `info()` → mode, time, HUD text, cam, stats.

## INTERNAL PATTERNS

Game shell (`js/shell/`, wired in `js/main.js`):
- **The router owns the screen.** Every screen change is `SHELL.go`; nothing
  else toggles a screen. `S.mode` is a getter over `SHELL.current`, so it is
  always the router's screen: `'menu' | 'board-choice' | 'coming-soon' |
  'records' | 'classic-2d-choice' | 'settings' | 'ready' | 'playing' |
  'classic-2d' | 'paused' | 'results' | 'replay' | 'ctxlost'`. In the 3D game only `playing` moves the
  camera, runs the timer and accepts actions (`hasSelection`,
  `Input.isActive`); the Classic 2D board takes input and runs its timer on
  `classic-2d`.
- **Back stack.** `go` stacks the screen it leaves; going to a screen already
  on the stack unwinds to it; `replace` swaps without stacking (the ready card
  hands over to `playing` that way). Back is the screen's own `back` when it
  declares one — `ready` → `readyBack` (board choice for a fresh board, pause
  for a started game; a keyboard Back within 500 ms of a pointer-lock
  release is ignored), `playing` and `classic-2d` → `backGame` (cancels a
  board being generated, else pause), `paused` →
  `resumeFromPause` (the main menu once the game has ended, else resume),
  `results` → menu, `replay` → its `returnTo` (the menu when none),
  `ctxlost` → menu — else the stacked screen.
- **Session history.** `HISTORY` (`createHistorySync` over `SHELL` and
  `window.history`) mirrors the back stack: every router change calls
  `HISTORY.sync()` from the router's `onChange`, the window's `popstate`
  goes to `HISTORY.popstate`, and `HISTORY.start` stamps the base entry at
  boot from the navigation entry's type. The URL never changes; a reload
  opens the main menu.
- **Back inputs.** `shellBack(source)` does nothing during the 3D end delay;
  otherwise it closes the controls modal or the pause confirmation first,
  then calls `SHELL.back`. Esc (`isBackKey`) reaches it
  through `Input`'s `onKey`; the board choice's, placeholder's and Settings
  page's Back buttons through `onBack`, the Records screen's Back
  (`#records-back`) through its view's `onBack`; the controller's back buttons through
  `padMenus` (on the Classic 2D board `padBoard2D`, and `padPlaying` in 3D,
  turn them into `backGame('pad')`). In pointer-locked play the browser
  consumes Esc to release the lock, and `onLockChange` calls
  `backGame('key')` instead — a lock lost with the window's focus pauses,
  and a release right after a cancelled 3D generation goes to the
  click-to-play card. On the pause card of a game in play every Esc resumes
  (`PAUSE.resume('key')`), however soon after the release, except the press
  that released the lock and a held Esc's auto-repeat: `resumeFromPause`
  asks `escResumes(input.lastKey)` ([input.md](input.md)). Chromium hands the
  page only the releasing press's `keyup` (its browser process takes the
  `keydown` to exit the lock), Firefox neither (both are chrome-only while
  the lock holds, and the lock goes on `keyup`), so no `keydown` of it reaches
  `onKey`; a browser that delivered one would do so with the lock still held,
  which `escResumes` refuses. The browser's
  Back (and a mouse's back button) is `historyBack`, run by `HISTORY` on a
  `popstate` back: nothing during the 3D end delay, the controls modal or
  confirmation closes first, the board (`playing`, `classic-2d`) pauses
  through `pauseGame('button')`, the pause card of an unfinished game and a
  started game's ready card hold the game, anything else is
  `SHELL.back('history')`; `HISTORY` then restores the consumed entry when
  the stack did not shrink. Each Back that Esc triggers carries an "Esc:
  Back" hint (`[data-esc-hint]`).
- **Focus.** Each screen declares `defaultFocus`; the router's `focus`
  hand-off (`focusScreen`) resolves it inside the screen's layer, falling back
  to its first focusable control. Defaults: menu the last mode played
  (`[data-entry][data-last]`), 3D board choice the last board choice
  (`[data-preset][data-last]`), Classic 2D board choice the last board
  choice (`[data-size][data-last]`), placeholder its Back, Records the
  chosen board in the picker (`#records-picker [aria-checked="true"]`),
  Settings the look
  sensitivity slider (`#set-lookSensitivity`), ready `#ready-btn`,
  pause Cancel while the confirmation shows, else Play again once the game
  ended, else Resume; results Play again (`#r-again`); replay viewer Play
  (`#rp-play`), or the message's Back (`#replay-message-back`) while a
  replay opens or cannot play; ctx-lost its reload button.
- **Mode host.** The shell reaches a game only through `MODES`: the menu's
  board choice, `start` (the board choices' `onStart`, `__ms.start`), pause/resume/restart
  (through the pause controller) and `leave`. Every menu screen's `show`
  calls `MODES.leave()`. The host keeps the active mode and its game state
  from the mode's reports, reports `abandoned` on the mode's behalf (restart,
  leave or a replacing start of a started, unfinished game) with the mode's
  `summary()` and `replay(summary)` — a `replay` that throws reports null —
  ignores reports
  from an inactive mode, and turns a throwing `start` into `failed`.
  `MODES.on('failed')` routes to the mode's `failureScreen`.
- **The 3D adapter.** `FLOW_3D` in `js/main.js` is the 3D game's own flow
  handed to `create3DMode` ([mode3d.md](mode3d.md)): board choice routes to
  `board-choice`, whose `show` fills `CHOICE_3D` from `LAST_CHOICE_3D`;
  `start` is `startGame`, which returns the new session; `pause` shows the
  pause card; `resume` is `resumeGame` (controller → lockless play,
  otherwise the click-to-play card, which requests pointer lock for a
  pointer resume); `restart` starts a session of the same board (with
  no-guess off once the player took the failed board's standard offer) and
  enters play the way resume does (`enterPlay3D`: a controller enters
  lockless play, otherwise pointer lock is asked for); `leave` is
  `leaveGame` (leaves the session, releases lock and lockless play, hides
  `#m3d-status`); `release` exits pointer lock before the results screen
  takes over. The adapter reports started, finished and abandoned from the
  session's own events, each `finished` and `abandoned` carrying the
  session's sealed replay, `finished` only after its end delay
  ([mode3d.md](mode3d.md)). `FLOW_3D.sampler` builds the session's camera
  sampler (`createSampler3D`, [replay.md](replay.md)) over the camera, the
  controls and `S.spacing`; `js/main.js` reads `mode3d.ending` and calls
  nothing on the adapter but `contextLost()`, `finishNow()`,
  `cancelGeneration()` and `mode3d.tick()`, which the frame loop calls every frame while the 3D mode
  is active to drive that sampler.
- **The Classic 2D mode.** `FLOW_2D` in `js/main.js` is the shell side
  handed to `createClassic2DMode` ([classic2d.md](classic2d.md)): board
  choice routes to `classic-2d-choice` with the last board choice (loaded at
  boot by `mode2d.loadChoice()`); `show` routes to `classic-2d`, whose Back
  is `backGame`; the board area is `#c2d-board`; the overlay bar names the board
  through `board` (`ui.setBoard2D`, with " · no-guess"); its timer and
  counter come from `hud`, fed by `mode2d.tick()` every frame, which also
  drives the mode's movement sampler ([replay.md](replay.md)). The paused
  screen's `setBoardHidden` also hides the 2D board, and `pauseInfo` /
  `gameOver` read `mode2d.status()`. `board2d` holds `{generating, failure}`
  from `FLOW_2D`; `showStatus2D` shows `#c2d-status` — the generating card on
  the board only, the offer there and over the pause card — and focuses the
  offer (`statusFocus`: Retry, or Play a standard board once `failure.count`
  is 2 or more); the generating card focuses Cancel when it shows. An offer
  answered over the pause card resumes first (`answer2D`); Main menu is
  `PAUSE.toMenu()`. On `classic-2d` the controller goes to `padBoard2D`:
  Start pauses through `#hud-pause`, B/Back is `backGame('pad')`, the status
  card is navigated as a menu, and every other poll goes to `mode2d.pad`
  after held-button suppression.
- **Main menu.** Four kit entries (`data-entry`) clicked through `onMenuEntry`
  → `MENU.open(id)`: a registered mode opens its board choice through the
  host, a registered screen is routed to, anything else goes to
  `coming-soon` with the entry's title. Classic 2D and 3D open their board
  choices; Settings routes to the Settings page, Records to the Records
  screen (`records`, opening on the last board played and its mode). No current entry
  reaches the placeholder; it stays the route for an entry whose screen is
  not registered, and `tests/shell-menu.test.mjs` exercises it by serving
  a menu whose Records entry names an unregistered screen (the router
  itself throws on an unknown screen).
  `LAST_MODE` stores the mode of every started
  game in the platform-storage document `shell.lastMode`; at boot `load()`
  marks the entry and refocuses it if the player has not moved yet.
- **Pause controller.** `PAUSE` is the one owner of pause, resume, restart and
  back to menu. Every pause source goes through `pauseGame(source)`, which
  opens nothing during the 3D end delay and otherwise calls
  `PAUSE.pause(source)`: the overlay's pause button (`onPause`), controller
  disconnect (with a note), `blur`, `visibilitychange` hidden and
  `__ms.pause()`. Esc/Back on the board and pointer-lock loss go through
  `backGame(source)` → `PAUSE.back(source)`, which first tries
  `cancelGeneration()` — the active mode's board being generated goes back
  to its closed board (a 3D game without lock or controller play to the
  click-to-play card) — and pauses otherwise.
  A started, unfinished game pauses through the mode; before the first click
  or after the end an asked-for pause only opens the card, and an automatic
  one (blur, hidden) does nothing — nor while the board is not in play.
  Nothing pauses twice. While `paused` shows, the canvas is hidden and play
  input is dropped. Esc on the card of a game in play: Back inputs above.
- **Confirmation.** Restart and back to menu during a started, unfinished game
  call `confirm`, which shows `ui.showConfirm` on the pause card (the
  `#pause-confirm` panel in place of `#pause-actions`) and refocuses; Back or
  Cancel closes it. Outside such a game they proceed at once.
- **Hand-offs.** `PAUSE.attach(name, listener)`: `finished` for every
  finished game, `abandoned` for every abandoned game, both with the game's
  sealed replay beside its summary, `inProgress` at game started, at every
  pause of a started, unfinished game and on `pagehide`. The controller
  routes nowhere itself. The records store attaches to all three
  (`RECORDS.attach(PAUSE)`, [records.md](records.md)) and the results flow
  to `finished` and `abandoned` (`RESULTS.attach(PAUSE)`); the results flow
  is the one listener that reads the replay.
- **Results flow.** `RESULTS.finished(summary, mode, replay)` reads the
  board's `counters` (the streak before), records the
  summary with `RECORDS.record`, so the comparison is against the bests that
  stood before this game, reads the board's `counters` and `history` (the
  streak after and a win's rank by time), then routes to `results` with
  `{summary, mode, comparison, saved, notSaved, watch, rank, streak}`, for a
  finished 3D game as for Classic 2D.
  A summary that is not a record — a fixed 3D board's null — is ignored, and
  `js/main.js` ends that game on the pause card instead. A recording that
  throws still routes, with no comparison and `saved` false; `notSaved` is
  set on the first results screen of a session whose records store is
  unavailable. The screen shows over the finished Classic 2D board; over a
  3D game it takes over on an opaque surface and the 3D scene stops
  rendering under it (`shouldRender`), and a finished 3D game is never
  returned to. Its actions: Play again → `RESULTS.playAgain` →
  `PAUSE.restart`, or, once the mode was left, `MODES.start('classic-2d',
  LAST_CHOICE_2D.current)` or `MODES.start('3d', board3dChoice)` entered
  through `enterPlay3D`; Records → `openRecords` routes to the Records
  screen with this board's `boardKey`, so it opens on that board and its
  mode, and Back from it returns to `results`; Watch
  replay (shown when the routed data's `watch` is set) → `RESULTS.watch()`
  routes to `replay` with `{replay, returnTo: {screen: 'results'}}`, the
  shown game's own sealed replay, so it plays whether or not the library
  saved it, and Back from the viewer returns to `results`; Main menu
  and Back → `showMainMenu`. Returning to `results` without data shows
  `RESULTS.current` again. `RESULTS.abandoned(summary, mode, replay)`
  records the summary (a no-op when the records store already recorded it) and
  shows nothing. After either records, the sealed replay, when there is
  one, is added to `REPLAYS` once it has loaded, pinned as a best when the
  comparison shows a new best on any of the board's three stats
  ([replay.md](replay.md)); a library that throws or rejects is logged and
  changes nothing else.
- **Replay viewer.** `REPLAY_VIEWER` (`createReplayViewer`,
  [replay.md](replay.md)) is the router's `replay` screen
  (`REPLAY_SCREEN`), over `REPLAYS` and `SHELL`, its view bound to
  `#replay`, its viewers `{square: mountViewer2D, box: mountReplay3D}`. It
  is opened by the results screen's Watch replay with the replay itself and
  by the Records screen's Watch with a replay id (`RECORDS_PAGE.watch`,
  [records.md](records.md)), each returning to the screen it came from;
  its Back buttons go through `shellBack`. The frame loop calls
  `REPLAY_VIEWER.tick` every frame while `replay` shows; before it, on a 3D
  replay whose time moved since the last frame (`replay3d.time`) — a seek, a
  step, Home / End — it calls `renderer.sync({ seek: true })`, so the
  renderer drops its "solved" pulses and starts none for the jump
  ([rendering.md](rendering.md)); on `replay` the
  controller goes to `padReplay`, which hands `REPLAY_PAD` buttons to the
  viewer and navigates the screen as a menu otherwise. `LAYER_SCREEN` maps
  `#replay` to `replay`. It is a shell screen, not a mode: it reaches no
  mode, records nothing and plays no sound; its `show` hides the game's
  HUD, help panel, hint strip and toast (`ui.showReplay`).
- **3D replay scene.** `mountReplay3D` mounts `createViewer3D` on
  `REPLAY_SCENE`, which hands the renderer the replay's 3D state view, drawn
  at `REPLAY_SPACING` (`SPACING_START`) with its own `FlyCamera`
  (`replayCam`) placed at the box's spawn pose until its first sample; each frame the loop applies
  the recorded camera and view mode in place of the player's and glows the
  recorded camera's aimed cell (`updateReplayPick`). Player input never
  moves it. `hide()` gives the renderer back the game or the menu demo it
  drew before. With the graphics context already lost, `mountReplay3D`
  routes to `ctxlost` and mounts nothing; a context lost during a replay
  routes there as on any non-3D-game screen.
- **Leave-page guard.** `guardLeave` on `beforeunload` is armed by the pause
  controller at game started and removed when the game finishes, is
  abandoned or its mode fails, so it guards only a started, unfinished game
  (Ctrl is a game key and Ctrl+W cannot be intercepted). The context-lost
  reload sets `reloading` to bypass it, and it does not guard a 3D game in
  its end delay, which `pagehide` finishes at once (`mode3d.finishNow()`)
  so it is recorded finished, not abandoned.
- **Context loss.** `webglcontextlost` sets `contextLost`; in a 3D game the
  adapter reports `failed` and the host routes to `ctxlost`, otherwise the
  shell routes there directly; a later 3D `start` fails at once. The
  `ctxlost` screen exits lock, hides and `inert`s the other overlays (menu
  only inert) and shows `#ctx-lost`: `#ctx-lost-btn` reloads,
  `#ctx-lost-menu` ("Main menu") routes to the menu and lifts the inert.

Game flow (`js/main.js`):
- 3D transitions: `startGame` → `ready`; pointer lock acquired
  (`onLockChange`), `padResume` or the ready card's drag-to-look
  (`enterDragLook`) → `enterPlaying` → `playing`; pause → `paused`. A failed
  board releases pointer lock for its offer, and that release does not
  pause.
- Pointer-lock refusals: `onLockError` on the ready or pause card asks
  `LOCK_FALLBACK` (`js/shell/lock-fallback.js`: `createLockFallback`,
  `LOCK_MESSAGES`, `RELOCK_COOLDOWN_MS`) for the ready card's message —
  `NO_MOUSE_MSG` without a mouse instead. A refusal within 1500 ms of a
  release says the browser needs a moment and is not counted; the first
  counted one says the mouse could not be captured; from the second the
  page is blocked for its session (an acquired lock, `LOCK_FALLBACK.locked()`,
  resets only the count). While blocked the router's `ready` entry shows the
  explanation (`readyMessage`) and `#ready-blocked` — `#ready-drag` and a
  line naming the controller's A — on every ready card.
- Board status: `board3d` holds `{generating, failure}` from the session's
  `generating` and `failed` events; `showStatus3D` shows `#m3d-status` from
  it while `playing`, and a failure's offer while `paused` too; on a failure
  it exits pointer lock and focuses the offer (`statusFocus`), and the
  generating card focuses Cancel when it shows. `retry3D` answers the offer
  (`onRetry3D` / `onStandard3D`) and re-enters play, from the pause card
  too; Main menu is `PAUSE.toMenu()`, Cancel `cancelGeneration()`. While
  the card shows the controller goes to `padStatus3D`: Start pauses, the
  back buttons are `backGame('pad')`, the card is navigated as a menu.
  `LAYER_SCREEN` puts both status cards above the pause card; their
  default focus is `statusFocus` (`STATUS_LAYERS`).
- `sync3D` runs on every router change: it resumes the session on
  `playing` and pauses it everywhere else, so board input runs only in play
  and each pause lasts until the return to play, while the session's clock
  runs throughout; it refreshes the status card.
- `S.lockless`: play without pointer lock (controller, drag-to-look,
  `forcePlay`). Mirrors `body.lockless`; when set, losing lock does not pause
  and Esc goes to `backGame` directly.
- `S.dragLook`: drag-to-look play, set by `enterDragLook` and cleared by
  `leaveGame`. With `S.lockless` it is the input's `isDragLook` (the mouse
  drags the view and acts through `DragLook`, [input.md](input.md)) and
  `body.drag-look` (the system cursor shows over `#scene`); `resumeGame` and
  `enterPlay3D` enter lockless play directly while it is set, so resume,
  restart and Play again stay in drag-to-look play.
  A UI click made with controller A sets `padGesture`, which routes resume/
  restart to lockless play because it is not a user gesture for pointer lock.
- `startGame(settings)` leaves the previous session and opens a new one
  (`createSession` over `GEN_3D`; the debug hook's `minePositions` give a
  fixed board), subscribes to its events, and returns it: `S.play` holds the
  session and `S.game` its 3D state view, which every reader of the board
  uses. `S.started` is set at the session's `started` — the first reveal
  applied to the generated board.
- `onAction(type)` is the only dispatcher to the game (wired as `MouseActions`'
  callback): `'left'` → `S.play.reveal`, `'right'` → `toggleFlag`,
  `'chord'` → `chord`. Calls `renderer.snapshotBeforeAction()` before
  left/chord and plays SFX from the result (`actionSounds`) — for the first
  reveal once its board has arrived, as the session answers it with a
  Promise; a null result (generating, failed, paused) does nothing, and
  `sfx.noop` plays when `version` is unchanged in play. A flag sound carries
  the count of cells the click changed (`sfx.flag(on, count)`), and a flag
  click on a revealed number — its flag-all or its undo — also hands the
  flag-changed cells of `r.changed` to `renderer.flash`; the replay viewer
  goes through neither. The end of the game
  comes through the session's `finished`, which runs `endGame`.
- End state freeze: `endGame` stores `S.endState = {state, time, minesLeft,
  clicks}`, with `time` the session's elapsed time, `minesLeft` taken from before
  the final action (original HUD froze on the previous frame) and `clicks`
  the engine's counted clicks (`clicks3D()`), and plays
  the win sound. HUD, pause card and timer read `S.endState` once set;
  until then the frame loop reads `S.time` from `S.play.elapsedMs()` once
  the game has started, paused or not.
- 3D end sequence: while the adapter's end delay runs (`ending3D()`, the 3D
  mode active and `mode3d.ending`) the end effect plays and every input is
  ignored — `Input.isActive` is false, so no board action or mouse look;
  the frame loop neither moves the camera nor changes the view mode
  (`setToggles`, `setModes`); `padPlaying` releases the pad's held controls
  and reads nothing; `shellBack` and `pauseGame` do nothing. After the
  delay the adapter releases pointer lock and reports finished, and the
  results flow routes to `results`.
- `placeAtSpawn()` puts the camera at the game's spawn pose (`spawnPose`, [input.md](input.md)) at
  the current spacing and the renderer camera's field of view and aspect: `startGame` (every new
  game, Play again, Restart, the debug hook's `start`), `retry3D` (the failure offer's Retry and
  standard board), and the return to start — `Home` / `R` in `onKey` while `Input.isActive` (so never
  paused or in the end delay), and the pause card's "Back to start" (`onBackToStart`, which then
  resumes as Resume does). The return is a jump the 3D sampler records as ordinary movement.
  In play the frame loop's `updateArrow` hands `ui.setArrow` the off-screen arrow's angle
  (`offscreenArrow`), keyed on the camera, spacing, box, field of view and aspect like
  `updatePick`, and null off play, while paused and during the end delay.
  Spacing resets to `SPACING_START` per game; the menu
  screens' demo board (`makeDemo`, 7³/30, a random mine set through
  `create3DGame`, decorative) uses 1.25 and an
  orbiting camera.
- Render on demand: `shouldRender` never draws while `results` shows a 3D
  game; otherwise it draws when on a menu screen (`onBackdrop`), `needRender` is set,
  `renderer.sync()` reported changes, `endState` changed, `renderer.isAnimating()`
  is true, or the signature string (camera, spacing, toggles, selection,
  `game.version`, aspect, mode) changed. The `animUntil` 6 s fallback applies
  only if the renderer exposes no animation hook. Set `needRender = true` after
  any change the signature does not capture; every router change sets it.
- Picking is cached by `S.pickKey` (camera, spacing, `version`, Space, aspect);
  ray origin is the camera position pushed to the near plane.
- `applyPixelRatio(n)` sets the renderer's pixel ratio from the render
  resolution setting for the board shown (`pixelRatioFor`, [settings.md](settings.md));
  `startGame` and the menu demo call it with their cell count.
- Fullscreen (`F`, in 3D only: F flags in Classic 2D) sets the fullscreen
  setting, whose applier calls `enterFullscreen` (which also requests
  Keyboard Lock on WASD/QE/Space/Ctrl/Shift) or `exitFullscreen`. Sound
  (`M` in both modes, the Sound buttons) sets `muted`; the store's `muted`
  subscription updates the buttons' and the HUD strip's label
  (`ui.setSound`). `H` toggles the help panel in both modes.
- Settings: `SETTINGS` loads before the first screen shows (`await
  Promise.all([settingsLoaded, recordsLoaded, firstUseLoaded, …])` before
  `showMainMenu`);
  `applySettings` wires the theme, sound, camera, resolution and fullscreen
  owners, and one `bindSettingControls` binds every `[data-setting]`
  control — unlocking audio after a volume or mute change. A failed save
  toasts once that settings will not be kept.
- Records: `RECORDS` (`createRecordsStore`, [records.md](records.md)) loads
  beside the settings, settling a game the last launch closed on, and is
  attached to `PAUSE`. A failed records save toasts once that this
  session's games will not be kept.
- Replays: `REPLAYS` (`createReplayLibrary` over `storage` and `blobStore`,
  [replay.md](replay.md)) loads in the background. A failed replay save
  toasts once that this session's replays will not be kept, and the replay
  stays watchable this session.
- `onKey` ignores H/M/F whose target is inside `input, select, textarea`, so
  settings sliders do not trigger them. The arrow keys go to `keyNav` before
  that check (see Controller menus).
- Active device: `DEVICE` (`createActiveDevice`, [settings.md](settings.md))
  is told of every keydown and mousedown/mousemove (capture listeners), of
  every controller poll with a press or a stick off its deadzone
  (`padUsed`), and of the pad's connection (`updatePadUi`); its change calls
  `ui.setDevice`, so every shown help surface follows it.
- First-use hints: `FIRST_USE` (`createFirstUse` over `storage` and
  `RECORDS`, `js/shell/first-use.js`) loads once the records have, seeding
  a new `shell.firstUse` document from them, before the first screen. It
  counts a game at the mode host's `started` and a finished 3D game at its
  `finished`. Each game's strip eligibility is judged as the game begins —
  `startGame` for 3D (`hint3D`), the 2D mode's `board` report for Classic 2D
  (`hint2D`, not again when the failed board's offer plays it standard) —
  and `refreshHints` shows the active mode's strip on every router change,
  at the first key or controller input of a Classic 2D game (`used2D`) and
  at a dismissal. The ready card shows the "How 3D works" block while
  `FIRST_USE.rules3D`. `actionSounds` passes every 3D action result to
  `noteAutoHide`, the one-time toast at the first auto-hide; in play the
  frame loop runs `aimHint`, which shows the one-time aim hint once the
  crosshair has rested `AIM_DWELL_MS` on a revealed number with a closed
  cube behind it (a second pick with Space's pass-through). Both hints'
  words come from `hintText` in the active device's names.
- Controller menus: `LAYER_SCREEN` maps each overlay to its screen, topmost
  first; the topmost visible, non-inert one takes input (`topLayer`), and its
  default focus is the screen's `SHELL.defaultFocus` (the controls modal's is
  its close button). Every router change and controls-modal toggle calls
  `layerChanged`, which suppresses the buttons held at the last poll until
  released (`nav`, a held suppressor) and resets the menu repeats. The arrow
  keys (`keyNav`, from `Input`'s `onKey` with the browser's key repeats) take
  the same spatial step (`navStep`, shared with `padNav`) in the topmost
  layer on every screen but `KEY_NAV_OFF` (`playing`, `classic-2d`,
  `records`, `replay`), leave an arrow the focused control owns
  (`keepsArrow`) or already handled (`defaultPrevented`), focus the layer's
  default when nothing is focused, and focus through `keyFocus`, which drops
  `pad-nav` so the kit's `:focus-visible` ring shows.
- UI help panel: `_helpByUser` keeps an H-opened panel open across screens;
  screen methods otherwise hide it. Its list and foot line, the pause card's
  list, the HUD strip, the hint strip and the main menu's Controls panel
  (its `#controls-tabs` Classic 2D | 3D `ui-segmented`, Classic 2D first)
  are all drawn from the bindings source (`js/settings/bindings.js`), so
  edit a binding's text in `BINDINGS` only.

Component kit (`css/components.css`, catalogue in its head comment):
- The catalogue is the contract: a screen uses a component by its class and
  markup pattern exactly as catalogued, and renaming either is a breaking
  change for every screen using it. Components: `ui-button--primary`,
  `ui-button--secondary`, `ui-menu` (items `ui-menu__item`, optional
  `ui-menu__label` + `ui-menu__detail` lines), `ui-card` / `ui-card__title`,
  `ui-panel`, `ui-toggle`, `ui-slider`, `ui-segmented`, `ui-stat`
  (optional `ui-stat__detail` line, `data-new-best` in bold ink),
  `ui-field` (number entry; `data-adjusted` marks a value just corrected),
  `ui-link`, `ui-overlay-bar`. Layout compositions: `ui-screen`
  (`--wide` for the main menu and the board choice), `ui-row`, `ui-grid`,
  `ui-heading`, `ui-text` (`--muted`, `--warning`), `ui-actions` (`--row`),
  `ui-stat-row`.
- Every interactive control is a native `<button>`, `<input>` or `<a>` with
  hover, pressed (`:active`), focused (`:focus-visible`, and
  `body.pad-nav :focus` for the controller) and disabled states; the focus
  ring is a solid `--color-focus-ring` outline that outranks the shell's
  controller ring. `data-force="hover|active|focus"` previews a state
  statically and is used only by the gallery. Only the selected segmented
  option is in the Tab order. A screen's default focus is the `defaultFocus`
  its router entry declares.
- Low fidelity: no theme-specific rule and no literal colour — both themes
  follow from the tokens; no animation, shadows and transitions only from
  tokens.
- A new component goes into the catalogue comment, the gallery (every state)
  and the `COMPONENTS` table in `tests/components.test.mjs`; a new
  composition into the catalogue and `COMPOSITIONS`.
- Overlay bar (`#hud .ui-overlay-bar.hud-bar`): `ui-stat` readouts `#hud-time`
  (`formatOverlayTime`, e.g. `047`, display stops at `999` while `S.time`
  keeps counting), `#hud-mines` (`formatMineCount`, `.negative` below zero, as wide as the
  board's mine count past three digits), `#hud-clicks` (the counted clicks,
  wasted included: Classic 2D's `hud` feed carries them, the 3D frame loop
  reads `clicks3D()` and the frozen `S.endState.clicks`; `updateHud`
  writes it only on change)
  and the board size, then `#hud-pause` (secondary button, `aria-label`
  "Pause game"). Its click calls `onPause` → `PAUSE.pause`; controller START
  and BACK in play click `#hud-pause` through `padClick`, so every input
  pauses through the same control. The bar has its own opaque raised
  surface, so it reads the same over the 3D scene as over a plain board.
  Beside it the HUD strip (`#hud-tools`) lists the keys, or the
  controller's buttons, the shown mode binds — in both modes — and the
  first-use hint strip (`#hint-strip`, its text `#hint-strip-text`, its ×
  `#hint-strip-close`) sits at the bottom left of the play area; on the
  Classic 2D board `#c2d.c2d--hint` gives it the room below the board.
- Main menu (`#menu`): a `ui-card ui-screen--wide` with the title row, one
  `ui-menu` of the four entries (`data-entry`; `UI` appends a "Last played"
  `ui-menu__detail` line and sets `data-last` on the last mode played) and a
  `ui-row` footer (Controls, Sound, volume `ui-slider`, credit `ui-link`).
- 3D board choice (`#board-choice`, bound by `bindBoardChoice` of
  `js/mode3d/board-choice.js`, [mode3d.md](mode3d.md)): a `ui-card
  ui-screen--wide` with one `ui-menu` (`aria-label="Presets"`) of the three
  cube presets, each labelled Cube Beginner, … (`presetTitle`; items carry
  `data-preset`; the binder appends a "Last
  played" `ui-menu__detail` line and sets `data-last` on the last board
  choice) and the presets' no-guess `ui-toggle` under it, the custom board
  as a `ui-panel` of `ui-field` entries with Random/Start in
  `ui-actions--row`, its info line (`ui-text--warning` on an invalid or very
  large board), the custom board's no-guess `ui-toggle` under the line
  giving its reason — a side of 2 cells or the cell-count limit — while it
  is disabled, and a Back button.
- Classic 2D board choice (`#c2d-choice`): a `ui-card ui-screen--wide` with
  one `ui-menu` of the standard sizes (`data-size`), the custom board as a
  `ui-panel` of `ui-field` entries with Start (`data-size="custom"`) and an
  info line (`ui-text--warning` on an invalid board), the no-guess
  `ui-toggle` and Back; `bindBoardChoice` marks the last board choice
  `data-last` with a "Last played" line once the player has played.
- Placeholder (`#coming-soon`): the one "coming soon" screen, a `ui-card
  ui-screen` whose title and text name the entry, with a primary Back.
- Records screen (`#records`, filled by `createRecordsView`,
  [records.md](records.md)): a `ui-card ui-screen--wide` with the 2D | 3D
  switch (`#records-mode`, a `ui-segmented` whose two options are in the
  markup), the board picker (`#records-picker`, a `ui-segmented` generated
  per board of the chosen mode), the
  figures `ui-panel` (board label, empty state, `rec-*` bests and
  counters), the history `ui-panel` (`#records-history`: the chart canvas
  `#records-chart`, the `#records-games` table and the Newer / Older pager
  `#records-prev` / `#records-next`, and the games table's Replay column
  `#records-games-replay`), the replays `ui-panel` (`#records-replays`: the
  Pinned first `ui-toggle` `#records-pinned-first`, the empty state
  `#records-replays-empty` and the `#records-replays-table` list with its
  Watch and Pin / Unpin buttons), the chosen mode's overall `ui-panel`
  (`ro-*`), the `#records-note` `ui-text--warning` line and a primary Back
  (`#records-back`). Its show and hide go through the router's `records`
  entry, which hands the asked-for `mode` and `boardKey` to
  `RECORDS_PAGE.show`; the switch calls `RECORDS_PAGE.setMode`.
  `RECORDS_PAGE` is handed `REPLAYS` and the router `SHELL`, which decides
  where Watch shows ([records.md](records.md)).
- Settings page (`#settings`): a `ui-card ui-screen--wide` whose
  `#settings-body` `UI` fills at construction with `settingsPageHtml()` — a
  `ui-grid` of Controls, Graphics, Theme and Audio `ui-panel` sections, one
  `data-setting` control per setting (Audio: Sound, then Volume) — and a Bindings panel
  (`#settings-bindings`) redrawn by `showSettings`; a primary Back in
  `#settings-actions`, a sticky row at the bottom of the card's scroll area
  (`css/style.css`), with `#settings`'s `scroll-padding-bottom` keeping a
  focused control above it.
- Pause card (`#pause-card`): a `ui-card ui-screen` with `ui-text` status
  lines, `#pause-actions` (`showPause` moves the primary action first —
  Resume while playing, Play again once ended, when Resume is hidden —
  before Main menu; `#p-home` "Back to start" follows Resume and shows only for a 3D game in play), the
  confirmation panel `#pause-confirm` (`ui-panel ui-actions`, hidden until
  `showConfirm`: the message, `#p-confirm-yes` labelled with the action,
  `#p-confirm-no` Cancel), the board line `#pause-board` (as the overlay bar
  names the board), the controls list `#pause-controls` (the active mode's
  bindings for the active device) and a Settings `ui-panel` (look
  sensitivity slider and invert-Y toggle — hidden unless the game is 3D —
  then the Sound button and the volume slider).
  Those shortcuts and the main menu's volume slider carry `data-setting` and
  are bound to the settings store like the Settings page's controls.
- Results screen (`#results`, filled by `createResultsView`; the gallery's
  `#g-results` shows it with placeholder content): a `ui-card ui-screen`
  with the outcome title, the board line, the `#results-banner` `ui-banner`
  (hidden without a new best), the `#results-stats` `ui-stat-row` of `rs-*`
  stats (`rs-bbbvSolved` only on a loss; the card's largest figures,
  `css/style.css`), the `#results-figures` second row, the `#results-next`
  line, the `#results-bests` `ui-panel` of `rb-*` bests whenever there is a
  comparison (on a loss `ui-panel--muted` under `#results-bests-note`), each
  with a `ui-stat__detail` line, the `#results-note` `ui-text--warning` line, and Play again
  (`#r-again`, primary), Watch replay (`#r-watch`, hidden until offered),
  Records (`#r-records`), Main menu (`#r-menu`).
- Replay viewer (`#replay`, filled by `createReplayView`,
  [replay.md](replay.md)): a `ui-overlay-bar` of the replay's figures —
  Time (`#rp-clock`, the overlay timer format), Mines (`#rp-mines`), 3BV
  solved / 3BV (`#rp-bbbv`), 3BV/s (`#rp-rate`) — with a secondary Back
  (`#rp-back`); the board area `#replay-board`; the `ui-card ui-screen`
  message `#replay-message` while a replay opens or when it cannot play,
  with a primary Back; and the `ui-panel` of controls `#replay-controls`:
  the end line `#replay-end`, Previous (`#rp-prev`), Play / Pause
  (`#rp-play`, primary), Next (`#rp-next`), the speed `ui-segmented`
  (`#rp-speed`: 0.5×, 1×, 2×, 4×) and the seek `ui-slider` (`#rp-seek`,
  its value `#rp-position`). A 3D replay marks `#replay` `replay--scene`,
  so the 3D scene shows behind it.
- Theme: `js/theme.js` runs synchronously in `<head>`, so the root
  `data-theme` attribute is set before any stylesheet paints. Its stored-theme
  getter (`readStoredTheme`) reads the theme of the settings document
  (`ms3d:doc:settings`, version 1) straight from `localStorage`; anything
  unusable applies Light. It never writes the preference: the settings
  store owns it and drives `setTheme` through its applier. Switching theme
  is only the attribute change — every shell colour follows through the
  `:root[data-theme="dark"]` overrides.
- Styling values: a new colour, size, radius, shadow, duration or z-index goes
  into `css/tokens.css` (with a dark value for a colour) and `css/style.css`
  or `css/components.css` reads it by `var(--…)`; `tests/tokens.test.mjs` and
  `tests/components.test.mjs` reject a custom property declared in either
  stylesheet or a read of an undeclared token.
- The 3D scene (`js/render.js`, `js/textures.js`) never reads tokens and
  never subscribes to theme changes: its sky, fog and clear colour come from
  `bindScenePalette`, and its tiles, numbers and effects keep one palette in
  both themes.
- `js/ui.js` keeps no `localStorage` key. Nothing reads, writes, shows or
  imports the `ms3d.custom`, `ms3d.best.*` (the per-size 3D best times),
  `ms3d.lastPreset` and `ms3d.hintH.done` keys left in browsers; they stay
  where they are. The last mode played (`shell.lastMode`), the first-use
  hints (`shell.firstUse`), the last 3D board choice (`mode3d.lastChoice`)
  and the settings (`settings`) are platform-storage documents, not
  `ms3d.*` keys.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule.

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md):
  - "Grid & geometry" — spacing start/clamp/wheel step.
  - "Rules" — the timer freezing on win/loss, and HUD contents.
  - "Controls" — the original's start pose with its web-port note (the framed spawn and the return
    to it), Esc/F5 replaced by the pause menu.
- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  the 3D presets, no-guess switch, generating state, timer start and the 3D
  mode's reports, which `js/main.js` wires ([mode3d.md](mode3d.md)).
- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  screens, router and Back rules, the mode contract, the main menu and its
  placeholder, the pause rules, confirmations, hand-offs and leave-page guard.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token categories, the contrast contract, the theme preference's owner
  (the settings feature) and the applier/reader contracts.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit's component set, states, focus and controller contract, the
  overlay bar's display formats and the screens composed from the kit.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  Settings page, the pause-card shortcuts and the start-up order.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the replay beside the summary in the mode contract's `game finished` and
  `game abandoned` reports.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the end-of-game hand-off to the library, best pinning, the session-only
  replay and the not-saved report.
- [../domain/features/results-screen.md](../domain/features/results-screen.md)
  — the results flow (record before show), the screen's content and time
  format, its actions and the failure note.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the Records screen: where it is opened from, its board, Back and focus.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 3D end sequence, the results screen's takeover of the 3D scene and
  the Records screen opened on a mode.
- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — the replay viewer screen, its entry points from the results screen and
  the library, Back, and a lost graphics context in the 3D viewer.
- [../domain/INDEX.md](../domain/INDEX.md) — product domain index.

## CROSS-REFERENCES

- [mode3d.md](mode3d.md) — the 3D board choice, the session `startGame`
  opens and the adapter `FLOW_3D` is handed to.
- [engine.md](engine.md) — the 3D state view, whose `state`, `minesLeft`
  and `version` main reads through the session's `view`.
- [generation.md](generation.md) — `createGenerationClient`, behind
  `GEN_3D`.
- [rendering.md](rendering.md) — main owns `BoardRenderer`: `setGame`, `setToggles`,
  `setSpacing`, `setSelected`, `sync`, `render`, `snapshotBeforeAction`, `isAnimating`.
- [input.md](input.md) — `FlyCamera`, `Input` callbacks (`onLook`, `onWheel`,
  `onKey`, `onLockChange`, `onLockError`), `MouseActions`, `Controls`,
  gamepad helpers, `pickCell`/`pickCellBrute`, and the shell navigation layer
  (`js/shell/navigation.js`).
- [platform.md](platform.md) — `createLastMode` registers and saves the
  `shell.lastMode` document through the storage interface.
- [audio.md](audio.md) — `sfx` calls: `unlock`, `reveal`, `flag`, `chord`,
  `explode`, `win`, `noop`; volume and mute reach it through the settings
  appliers.
- [settings.md](settings.md) — the settings store, appliers, the Settings
  page markup and binder, and the bindings source `js/ui.js` reads.
- [replay.md](replay.md) — the replay the mode contract and hand-offs carry,
  `createSampler3D`, which `FLOW_3D.sampler` builds, the replay library
  behind `REPLAYS`, and the viewer, 2D viewer and 3D viewer behind
  `REPLAY_VIEWER`.
- [records.md](records.md) — the records store the shell loads and attaches,
  whose `record` and comparison the results flow uses, the board label
  and key the results screen shows and routes with, and the Records screen
  (`js/records/screen.js`, `js/records/history-chart.js`) the `records`
  route shows.
- [testing.md](testing.md) — browser tests drive the game through `window.__ms`;
  `tests/shell-*.test.mjs` pin the router, navigation, mode host, 3D adapter,
  menu and pause controller; `tests/mode3d-*.test.mjs` the 3D board choice
  and session and their wiring here; `tests/tokens.test.mjs` and
  `tests/theme.test.mjs` pin the token sheet, the applier and the reader;
  `tests/components.test.mjs` pins the kit, its helpers, the overlay bar, the
  kit-built screens and their contrast; `tests/shell-help.test.mjs` the
  mode-aware help surfaces, the active device and Space's tap-toggle, and
  `tests/shell-first-use.test.mjs` the first-use hints and their document;
  `tests/settings-*.test.mjs` pin the
  Settings screen's wiring and the pause-card shortcuts;
  `tests/results.test.mjs` pins the results flow, view and screen;
  `tests/mode3d-end.test.mjs` the 3D end sequence and the results takeover;
  `tests/records-screen.test.mjs` and `tests/records-screen-3d.test.mjs` the
  `records` route's wiring and
  `tests/records-replays.test.mjs` the replays panel's markup and wiring;
  `tests/replay-2d.test.mjs` the replay on the mode host and the pause
  controller's hand-offs; `tests/replay-handoff.test.mjs` the results flow's
  hand-off to the replay library and `REPLAYS` in `js/main.js`;
  `tests/replay-viewer.test.mjs` and `tests/replay-viewer-3d.test.mjs` the
  `replay` route, its markup, `padReplay`, the frame-loop tick and the 3D
  replay scene; `tests/results-watch.test.mjs` Watch replay on the results
  screen.

## WHEN TO READ THE SOURCE

- Adding a screen or changing a transition (pause, ready, lockless, ctxlost):
  the router's screen table in `js/main.js` (`SHELL`), plus `LAYER_SCREEN`
  for controller navigation.
- Adding a mode: implement the contract in the head comment of
  `js/shell/mode-host.js`, register it on `MODES`, and read
  `js/shell/mode-3d.js` as the worked example.
- Attaching a feature to a game's end, abandonment or progress: the hand-offs
  in the head comment of `js/shell/pause.js`.
- Changing what the results screen shows, its formats or its actions: the
  head comments of `js/results/view.js` and `js/results/flow.js`, and the
  `results` wiring in `js/main.js`.
- Changing pause rules, confirmations or the leave-page guard: `js/shell/pause.js`
  and the `PAUSE` wiring in `js/main.js`.
- Changing what the browser's Back does or how the session history mirrors
  the back stack: the head comment of `js/shell/history.js` and
  `historyBack` in `js/main.js`.
- Changing the 3D end-of-game flow or the frozen HUD (`endGame`,
  `S.endState`, `ending3D`, `pauseGame`, the `MODES.on('finished')` pause
  card for a fixed board), the board status card (`showStatus3D`, `retry3D`) or how
  the session's timer follows the screens (`sync3D`); the timer's start is
  the session's ([mode3d.md](mode3d.md)).
- Changing how the replay viewer is wired — its route, viewers, the 3D
  replay scene and camera, or its controller mapping: the
  `// ---------- 3D replay ----------` and `// ---------- replay viewer
  ----------` blocks of `js/main.js`, `padReplay` and the frame loop.
- Adding a `__ms` hook method or changing what `info()` reports.
- Debugging frames that do not redraw (or never stop redrawing): `shouldRender`.
- Adding a menu entry, preset, HUD element or overlay (HTML
  + `UI.el` + CSS z-index layer + a router screen and `LAYER_SCREEN` entry
  for controller navigation; a menu entry also goes in `MENU_ENTRIES`).
- Adding or changing a kit component or composition, or building a new
  screen from the kit: read the catalogue comment at the head of
  `css/components.css` and the matching gallery section in
  `dev/components.html`.
- Changing controller button mapping in menus or play (`padPlaying`, `padMenus`).
- Changing what a help surface shows or when it follows the device: the
  `// ---------- bindings: the active mode and device ----------` block of
  `js/ui.js` and `// ---------- active device ----------` in `js/main.js`;
  when a first-use hint shows: `js/shell/first-use.js` and the
  `// ---------- first-use hints ----------` block of `js/main.js`.
- Changing deploy behaviour (custom domain, 404 redirect, vendored three.js path).
- Adding or renaming a token, or changing how start-up reads the stored
  theme (`readStoredTheme` in `js/theme.js`, kept in step with the settings
  document's key and version).
- Adding a setting or a setting control: [settings.md](settings.md) first,
  then the `// ---------- settings ----------` block of `js/main.js`.
