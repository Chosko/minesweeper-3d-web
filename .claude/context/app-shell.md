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
  Classic 2D board choice binder), `RECORDS` (the records store), `RESULTS`
  (the results flow), `RESULTS_VIEW` and `RECORDS_PAGE` (the Records
  screen's controller over its view, [records.md](records.md)); holds the
  single state object `S`; runs the `requestAnimationFrame` loop; exposes
  `window.__ms`. Also maps controller polls to game and menu actions
  (`handlePad`, `padPlaying`, `padMenus`).
- `js/shell/` — the game shell's DOM-free modules; `js/main.js` hands each
  its screens, elements and callbacks:
  - `router.js` — the screen router and back stack (`createRouter`,
    `SHELL_SCREENS`).
  - `navigation.js` — the shell navigation layer over the controller
    reader: topmost layer, default-focus fallback, Back inputs, held-button
    suppression (see [input.md](input.md)).
  - `mode-host.js` — the mode contract and the registry the shell reaches
    every mode through (`createModeHost`, `MODE_METHODS`, `MODE_EVENTS`); the
    contract is documented in its head comment.
  - `mode-3d.js` — the 3D adapter: the 3D game session behind the mode
    contract (`create3DMode`, `summary3d`; [mode3d.md](mode3d.md)).
  - `menu.js` — the main menu's entries and routes, the last mode played
    and each mode's last board choice (`MENU_ENTRIES`,
    `PLACEHOLDER_SCREEN`, `entryRoute`, `createMenu`, `createLastMode`,
    `createLastBoardChoice`).
  - `pause.js` — the pause controller: pause, resume, restart, back to menu,
    the confirmations, the game hand-offs and the leave-page guard
    (`createPauseController`); its rules are documented in its head comment.
- `js/results/` — the results screen (`results-screen`), DOM-free apart from
  the view's binder:
  - `flow.js` — the results flow on the `finished` hand-off: records the
    game, then routes to `results` (`createResultsFlow`, `RESULTS_SCREEN`).
  - `view.js` — the screen's content and its time, rate and efficiency
    formats (`resultsContent`, `formatTime`, …) and the binder that fills
    `#results` (`createResultsView`); the formats are documented in its head
    comment.
- `js/ui.js` — DOM only, no game rules: class `UI`, board-settings clamping
  and the help hint's `localStorage` flag. Formats the overlay bar with the
  kit helpers from `js/ui/components.js`; fills the Settings page and the help
  lists from `js/settings/page.js` and `js/settings/bindings.js`.
- `index.html` — every overlay is static markup toggled by the `.hidden` class;
  importmap maps `three` to `vendor/three/three.module.min.js` (vendored
  three.js r186, no build step); a module `onerror` shows a `.fatal` card.
  Head order: classic `js/theme.js`, then `css/tokens.css`, then
  `css/components.css`, then `css/style.css`, then the module graph. The HUD
  overlay bar, the main menu (`#menu`), the 3D board choice
  (`#board-choice`), the Classic 2D board choice (`#c2d-choice`), the
  placeholder screen (`#coming-soon`), the Records screen (`#records`), the
  Settings page (`#settings`, its controls generated into
  `#settings-body`), the results screen (`#results`) and the pause card (`#pause-card`) are kit markup
  (§ Component kit). `#c2d` is the Classic 2D board layer: the board area
  `#c2d-board` and the generating / failed-board card `#c2d-status`;
  `#m3d-status` is the same card over the 3D box.
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
  Classic 2D board layer and its board area below the overlay bar), the
  menu-screen backdrop shared by `#menu`, `#board-choice`, `#coming-soon`,
  `#c2d-choice`, `#settings` and `#records`,
  the translucent backdrop shared by `#pause`, `#ready` and `#results`,
  the ready/help/banner/controls/ctx-lost overlays and the HUD placement; the
  kit-built screens carry no one-off rules of their own, apart from the
  Records screen's chart box (`#records-chart`) and games table
  (`#records-games`). Declares no
  custom properties and reads only tokens from `css/tokens.css`. Layered
  fixed overlays use the `--z-*` tokens (HUD 10, help 11, banner 12, flash
  15, overlays 20, controls modal 30, ctx-lost 40, toast 45, fatal 50).
- `js/theme.js` — theme applier, a classic (non-module) script run before
  first paint: sets the root `data-theme` attribute (`light` | `dark`) from
  the saved settings document and exposes `globalThis.msTheme`.
- `js/tokens.js` — token reader (ES module) for consumers that cannot read
  stylesheet values directly, chiefly Canvas renderers.
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

`js/shell/mode-host.js`
- `MODE_METHODS` (`openBoardChoice`, `start`, `pause`, `resume`, `restart`,
  `leave`, `summary`), `MODE_EVENTS` (`started`, `finished`, `abandoned`,
  `canPause`, `failed`).
- `createModeHost()` → `register(id, (report) => mode)` (returns the mode;
  duplicate id, missing method or non-factory throws), `has(id)`, `ids`,
  `active`, `state` (`{mode, started, finished, canPause}`),
  `on(event, listener)` → unsubscribe, `openBoardChoice(id)`,
  `start(id, choice)`, `pause(opts)`, `resume(opts)`, `restart(opts)`,
  `leave()`, `summary()`. A mode reports through `report.started()`,
  `finished(summary)`, `canPause(bool)`, `failed(reason)`; it may declare
  `failureScreen`.

`js/shell/mode-3d.js` — `create3DMode(flow, report)` and `summary3d`, with
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
  goMenu, guard?})` → `inProgress`, `pause(source, {note})` →
  whether the card opened, `resume(source)`, `restart(source)`, `toMenu()`,
  `pageHide()`, `attach(handOff, listener)` → detach, `dispose()`. Hand-off
  listeners receive `(summary, mode)`.

`js/results/flow.js`
- `RESULTS_SCREEN` = `'results'`.
- `createResultsFlow({records, router, restart(source, current), goMenu})` →
  `attach(pauser)` → detach, `finished(summary, mode)` → the routed data
  `{summary, mode, comparison, saved, notSaved}` or null, `current` (the
  data last shown), `playAgain(source)`, `openRecords()`, `toMenu()`.

`js/results/view.js`
- `formatTime(ms)` (tenths, truncated: `"47.3 s"`), `formatTimeDifference`,
  `formatRate` / `formatRateDifference` (two decimals),
  `formatEfficiency` / `formatEfficiencyDifference` (whole percent); a
  missing value is `DASH`. `NOTES` (`notRecorded`, `notSaved`).
- `resultsContent({summary, comparison?, saved?, notSaved?})` → `{outcome,
  title, board, stats: [{key, label, value, shown}], bests: [{stat, label,
  best, difference, newBest}] | null, notes}`.
- `createResultsView({root, onPlayAgain, onRecords, onMenu})` → `show(content)`,
  `hide()`.

`js/ui.js` exports (consumed by `js/main.js`)
- `DIM_MIN`/`DIM_MAX` (1/100, re-exported from `js/mode3d/board-choice.js`);
  `clampSettings(s)` → `{X,Y,Z,mines}` integers, dims 1..100, mines
  1..X*Y*Z − 1, since the first click is safe (a 1×1×1 board clamps to 0
  mines). `startGame` clamps with it; the board choice validates first.
- `fmtDims(s)`, `fmtTime(t)` (2 decimals), `NO_MOUSE_MSG`.
- `UI` constructor `(cb)` with callbacks `onMenuEntry(id)`, `onBack` (the
  placeholder's and Settings page's Back buttons), `onReadyClick`,
  `onReadyBack`, `onResume`,
  `onRestart`, `onMainMenu`, `onPause` (the overlay bar's pause button),
  `onToggleSound`, `onRetry2D`, `onStandard2D` (the failed Classic 2D
  board's offer), `onRetry3D`, `onStandard3D` (the failed 3D board's
  offer). Methods: screens `showMenu`, `showBoardChoice`,
  `showBoardChoice2D`, `showComingSoon(title)`, `showRecords` (the menu
  backdrop with the other menu screens hidden; the records view fills and
  shows `#records`), `showSettings` (its bindings
  in the active controller's glyphs),
  `showReady(settings, msg)`, `showPlaying`, `showClassic2D` (positions
  `#c2d-board` 16 px below the overlay bar), `showPause({state,time,minesLeft,note})`;
  Classic 2D `setBoardText(text)`, `setBoardStatus({generating, failure})`;
  3D `setBoardStatus3D({generating, failure})` (`#m3d-status`); menu
  `setLastMode(mode|null)`; pause confirmation
  `showConfirm({message, confirmLabel}, onYes, onNo)`, `isConfirmOpen`,
  `closeConfirm` (→ false when none is open); HUD `setBoard`,
  `updateHud(time, minesLeft)` (overlay formats, DOM write only on change),
  `setModes`, `setCrosshair`, `showSpacing`, `setSound(muted)`; help
  `toggleHelp`, `userToggleHelp`, `dismissHint`; banner `showBanner(state,time)`,
  `setBannerRecord`, `hideBanner`; `flash`, `toast(msg, ms)`, `setPad(info|null)`,
  `setNoMouse`, `openControls`/`closeControls`
  (→ false when already closed)/`isControlsOpen`, `isPauseVisible`,
  `setReadyMessage`. `setPad` also redraws the Settings page's bindings
  while it shows.

`js/ui/components.js` exports
- `formatOverlayTime(seconds)` → whole seconds, three digits, stopping at
  `'999'`; `formatMineCount(minesLeft)` → clamped to -99 … 999. Display only.
- `formatSliderValue(value, {format: 'number'|'percent'|'multiplier', step, max, unit})`,
  `decimalsOf(step)`.
- `segmentedTargetIndex(disabled, current, key)` (arrows wrap, Home/End,
  disabled skipped), `segmentedState(count, selected)` (aria-checked, roving
  tab order).
- `bindSlider(root)`, `bindSegmented(group, {onChange})` (dispatches `change`
  with `{value, index}`), `initComponents(root)` — each returns an unbind.

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

`js/main.js` exports nothing; its surface is `window.__ms` (tests, Playwright):
- getters `state` (the live `S`), `game`, `renderer`, `camera`, `controls`,
  `pads`, `fps`, `frameStats` (`{renders, skipped}`), `modes` (the mode
  host), `pauser` (the pause controller), `settings` (the settings store),
  `records` (the records store);
  `THREE`, `startCameraPos`.
- `start(X, Y, Z, mines, minePositions?)` → `MODES.start('3d', …)`;
  `forcePlay()` enters lockless play; `pause()` → `PAUSE.pause('key')`.
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
  'classic-2d' | 'paused' | 'results' | 'ctxlost'`. In the 3D game only `playing` moves the
  camera, runs the timer and accepts actions (`hasSelection`,
  `Input.isActive`); the Classic 2D board takes input and runs its timer on
  `classic-2d`.
- **Back stack.** `go` stacks the screen it leaves; going to a screen already
  on the stack unwinds to it; `replace` swaps without stacking (the ready card
  hands over to `playing` that way). Back is the screen's own `back` when it
  declares one — `ready` → `readyBack` (board choice for a fresh board, pause
  for a started game), `playing` and `classic-2d` → pause, `paused` →
  `resumeFromPause`,
  `results` → menu, `ctxlost` → menu — else the stacked screen.
- **Back inputs.** `shellBack(source)` closes the controls modal or the pause
  confirmation first, then calls `SHELL.back`. Esc (`isBackKey`) reaches it
  through `Input`'s `onKey`; the board choice's, placeholder's and Settings
  page's Back buttons through `onBack`, the Records screen's Back
  (`#records-back`) through its view's `onBack`; the controller's back buttons through
  `padMenus` (on the Classic 2D board `padBoard2D` turns them into Pause
  through `#hud-pause`, as `padPlaying` does in 3D). In pointer-locked play the browser consumes Esc to release the
  lock, and `onLockChange` pauses instead; `resumeFromPause` ignores a
  keyboard Back within 500 ms of the unlock, so that Esc does not also resume.
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
  ended, else Resume; results Play again (`#r-again`); ctx-lost its reload
  button.
- **Mode host.** The shell reaches a game only through `MODES`: the menu's
  board choice, `start` (the board choices' `onStart`, `__ms.start`), pause/resume/restart
  (through the pause controller) and `leave`. Every menu screen's `show`
  calls `MODES.leave()`. The host keeps the active mode and its game state
  from the mode's reports, reports `abandoned` on the mode's behalf (restart,
  leave or a replacing start of a started, unfinished game), ignores reports
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
  enters play the way resume does; `leave` is `leaveGame` (leaves the
  session, releases lock and lockless play, hides `#m3d-status`). The
  adapter reports started, finished and abandoned from the session's own
  events; `js/main.js` calls nothing on it but `contextLost()`.
- **The Classic 2D mode.** `FLOW_2D` in `js/main.js` is the shell side
  handed to `createClassic2DMode` ([classic2d.md](classic2d.md)): board
  choice routes to `classic-2d-choice` with the last board choice (loaded at
  boot by `mode2d.loadChoice()`); `show` routes to `classic-2d`, whose Back
  pauses; the board area is `#c2d-board`; the overlay bar's timer and
  counter come from `hud`, fed by `mode2d.tick()` every frame. The paused
  screen's `setBoardHidden` also hides the 2D board, and `pauseInfo` /
  `gameOver` read `mode2d.status()`. On `classic-2d` the controller goes to
  `padBoard2D`: Start and B/Back pause through `#hud-pause`, a failed
  board's offer is navigated as a menu, and every other poll goes to
  `mode2d.pad` after held-button suppression.
- **Main menu.** Four kit entries (`data-entry`) clicked through `onMenuEntry`
  → `MENU.open(id)`: a registered mode opens its board choice through the
  host, a registered screen is routed to, anything else goes to
  `coming-soon` with the entry's title. Classic 2D and 3D open their board
  choices; Settings routes to the Settings page, Records to the Records
  screen (`records`, opening on the last board played). No current entry
  reaches the placeholder; it stays the route for an entry whose screen is
  not registered, and `tests/shell-menu.test.mjs` exercises it by serving
  a menu whose Records entry names an unregistered screen (the router
  itself throws on an unknown screen).
  `LAST_MODE` stores the mode of every started
  game in the platform-storage document `shell.lastMode`; at boot `load()`
  marks the entry and refocuses it if the player has not moved yet.
- **Pause controller.** `PAUSE` is the one owner of pause, resume, restart and
  back to menu. Every pause source goes through `PAUSE.pause(source)`: the
  overlay's pause button (`onPause`), Esc/Back in play, pointer-lock loss,
  controller disconnect (with a note), `blur` and `visibilitychange` hidden.
  A started, unfinished game pauses through the mode; before the first click
  or after the end an asked-for pause only opens the card, and an automatic
  one (blur, hidden) does nothing — nor while the board is not in play.
  Nothing pauses twice. While `paused` shows, the canvas is hidden and play
  input is dropped.
- **Confirmation.** Restart and back to menu during a started, unfinished game
  call `confirm`, which shows `ui.showConfirm` on the pause card (the
  `#pause-confirm` panel in place of `#pause-actions`) and refocuses; Back or
  Cancel closes it. Outside such a game they proceed at once.
- **Hand-offs.** `PAUSE.attach(name, listener)`: `finished` for every
  finished game, `abandoned` for every abandoned game, `inProgress` at game
  started, at every pause of a started, unfinished game and on `pagehide`.
  The controller routes nowhere itself. The records store attaches to all
  three (`RECORDS.attach(PAUSE)`, [records.md](records.md)) and the results
  flow to `finished` (`RESULTS.attach(PAUSE)`).
- **Results flow.** `RESULTS.finished(summary, mode)` records the summary
  with `RECORDS.record` first, so the comparison is against the bests that
  stood before this game, then routes to `results` with `{summary, mode,
  comparison, saved, notSaved}`. A summary that is not a record — the 3D
  adapter's `summary3d` — is ignored, so the 3D game keeps its own end flow
  (banner and pause card). A recording that throws still routes, with no
  comparison and `saved` false; `notSaved` is set on the first results
  screen of a session whose records store is unavailable. The screen shows
  over the finished Classic 2D board. Its actions: Play again →
  `RESULTS.playAgain` → `PAUSE.restart`, or `MODES.start('classic-2d',
  LAST_CHOICE_2D.current)` once the mode was left; Records →
  `openRecords` routes to the Records screen with this board's `boardKey`,
  so it opens on that board, and Back from it returns to `results`; Back to menu
  and Back → `showMainMenu`. Returning to `results` without data shows
  `RESULTS.current` again.
- **Leave-page guard.** `guardLeave` on `beforeunload` is armed by the pause
  controller at game started and removed when the game finishes, is
  abandoned or its mode fails, so it guards only a started, unfinished game
  (Ctrl is a game key and Ctrl+W cannot be intercepted). The context-lost
  reload sets `reloading` to bypass it.
- **Context loss.** `webglcontextlost` sets `contextLost`; in a 3D game the
  adapter reports `failed` and the host routes to `ctxlost`, otherwise the
  shell routes there directly; a later 3D `start` fails at once. The
  `ctxlost` screen exits lock, hides and `inert`s the other overlays (menu
  only inert) and shows `#ctx-lost`: `#ctx-lost-btn` reloads,
  `#ctx-lost-menu` ("Back to menu") routes to the menu and lifts the inert.

Game flow (`js/main.js`):
- 3D transitions: `startGame` → `ready`; pointer lock acquired
  (`onLockChange`) or `padResume` → `enterPlaying` → `playing`; pause →
  `paused`. A failed board releases pointer lock for its offer, and that
  release does not pause.
- Board status: `board3d` holds `{generating, failure}` from the session's
  `generating` and `failed` events; `showStatus3D` shows `#m3d-status` from
  it only while `playing`, and on a failure exits pointer lock and focuses
  Retry. `retry3D` answers the offer (`onRetry3D` / `onStandard3D`) and
  re-enters play. On a failed board the controller goes to `padFailed3D`:
  Start and the back buttons pause, the offer is navigated as a menu.
- `sync3D` runs on every router change: it resumes the session on
  `playing` and pauses it everywhere else, so the session's timer runs only
  in play, and refreshes the status card.
- `S.lockless`: play without pointer lock (controller, `forcePlay`). Mirrors
  `body.lockless`; when set, losing lock does not pause and Esc pauses directly.
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
  `sfx.noop` plays when `version` is unchanged in play. The end of the game
  comes through the session's `finished`, which runs `endGame`.
- End state freeze: `endGame` stores `S.endState = {state, time, minesLeft}`,
  with `time` the session's elapsed time and `minesLeft` taken from before
  the final action (original HUD froze on the previous frame). HUD, pause
  card and timer read `S.endState` once set; until then the frame loop
  reads `S.time` from `S.play.elapsedMs()` while `playing && started`.
- `startCameraPos(X,Y,Z)` = original `(0, 10, -8M)` shifted by minus the original
  grid centre at spacing 1.1, because the port centres the grid on the origin.
  No snapping to a cell. Spacing resets to `SPACING_START` per game; the menu
  screens' demo board (`makeDemo`, 7³/30, a random mine set through
  `create3DGame`, decorative) uses 1.25 and an
  orbiting camera.
- Render on demand: `shouldRender` draws when on a menu screen (`onBackdrop`), `needRender` is set,
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
- Fullscreen (`F`) sets the fullscreen setting, whose applier calls
  `enterFullscreen` (which also requests Keyboard Lock on
  WASD/QE/Space/Ctrl/Shift) or `exitFullscreen`. Sound (`M`, the Sound
  buttons) sets `muted`; the store's `muted` subscription updates the
  buttons' label (`ui.setSound`).
- Settings: `SETTINGS` loads before the first screen shows (`await
  Promise.all([settingsLoaded, recordsLoaded])` before `showMainMenu`);
  `applySettings` wires the theme, sound, camera, resolution and fullscreen
  owners, and one `bindSettingControls` binds every `[data-setting]`
  control — unlocking audio after a volume or mute change. A failed save
  toasts once that settings will not be kept.
- Records: `RECORDS` (`createRecordsStore`, [records.md](records.md)) loads
  beside the settings, settling a game the last launch closed on, and is
  attached to `PAUSE`. A failed records save toasts once that this
  session's games will not be kept.
- `onKey` ignores keys whose target is inside `input, select, textarea`, so
  settings sliders do not trigger H/M/F.
- Controller menus: `LAYER_SCREEN` maps each overlay to its screen, topmost
  first; the topmost visible, non-inert one takes input (`topLayer`), and its
  default focus is the screen's `SHELL.defaultFocus` (the controls modal's is
  its close button). Every router change and controls-modal toggle calls
  `layerChanged`, which suppresses the buttons held at the last poll until
  released (`nav`, a held suppressor) and resets the menu repeats.
- UI help panel: `_helpByUser` keeps an H-opened panel open across screens;
  screen methods otherwise hide it. Its controls list and the controller
  section are generated from the bindings source (`js/settings/bindings.js`),
  and the controls modal body is cloned from `#help .controls` at
  construction, so edit a binding's text in `BINDINGS` only.
- Banner goes `compact` after 4 s and is `suppressed` while the pause card shows.

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
  keeps counting), `#hud-mines` (`formatMineCount`, `.negative` below zero)
  and the board size, then `#hud-pause` (secondary button, `aria-label`
  "Pause game"). Its click calls `onPause` → `PAUSE.pause`; controller START
  and BACK in play click `#hud-pause` through `padClick`, so every input
  pauses through the same control. The bar has its own opaque raised
  surface, so it reads the same over the 3D scene as over a plain board.
- Main menu (`#menu`): a `ui-card ui-screen--wide` with the title row, one
  `ui-menu` of the four entries (`data-entry`; `UI` appends a "Last played"
  `ui-menu__detail` line and sets `data-last` on the last mode played) and a
  `ui-row` footer (Controls, Sound, volume `ui-slider`, credit `ui-link`).
- 3D board choice (`#board-choice`, bound by `bindBoardChoice` of
  `js/mode3d/board-choice.js`, [mode3d.md](mode3d.md)): a `ui-card
  ui-screen--wide` with one `ui-menu` per board family (Double layer, Cube)
  in a `ui-grid` (items carry `data-preset`; the binder appends a "Last
  played" `ui-menu__detail` line and sets `data-last` on the last board
  choice) and the presets' no-guess `ui-toggle` under it, the custom board
  as a `ui-panel` of `ui-field` entries with Random/Start in
  `ui-actions--row`, its info line (`ui-text--warning` on an invalid or very
  large board), the custom board's no-guess `ui-toggle` under the line
  giving the cell-count limit while it is disabled, and a Back button.
- Classic 2D board choice (`#c2d-choice`): a `ui-card ui-screen--wide` with
  one `ui-menu` of the standard sizes (`data-size`), the custom board as a
  `ui-panel` of `ui-field` entries with Start (`data-size="custom"`) and an
  info line (`ui-text--warning` on an invalid board), the no-guess
  `ui-toggle` and Back; `bindBoardChoice` marks the last board choice
  `data-last` with a "Last played" line once the player has played.
- Placeholder (`#coming-soon`): the one "coming soon" screen, a `ui-card
  ui-screen` whose title and text name the entry, with a primary Back.
- Records screen (`#records`, filled by `createRecordsView`,
  [records.md](records.md)): a `ui-card ui-screen--wide` with the board
  picker (`#records-picker`, a `ui-segmented` generated per board), the
  figures `ui-panel` (board label, empty state, `rec-*` bests and
  counters), the history `ui-panel` (`#records-history`: the chart canvas
  `#records-chart`, the `#records-games` table and the Newer / Older pager
  `#records-prev` / `#records-next`), the Classic 2D overall `ui-panel`
  (`ro-*`), the `#records-note` `ui-text--warning` line and a primary Back
  (`#records-back`). Its show and hide go through the router's `records`
  entry, which hands the asked-for `boardKey` to `RECORDS_PAGE.show`.
- Settings page (`#settings`): a `ui-card ui-screen--wide` whose
  `#settings-body` `UI` fills at construction with `settingsPageHtml()` — a
  `ui-grid` of Controls, Graphics, Theme and Audio `ui-panel` sections, one
  `data-setting` control per setting — and a Bindings panel
  (`#settings-bindings`) redrawn by `showSettings`; a primary Back.
- Pause card (`#pause-card`): a `ui-card ui-screen` with `ui-text` status
  lines, `#pause-actions` (`showPause` moves the primary action first —
  Resume while playing, Play again once ended — before Main menu), the
  confirmation panel `#pause-confirm` (`ui-panel ui-actions`, hidden until
  `showConfirm`: the message, `#p-confirm-yes` labelled with the action,
  `#p-confirm-no` Cancel), the controls list and a Settings `ui-panel` (look
  sensitivity and volume sliders, invert-Y toggle), then the Sound button.
  Those shortcuts and the main menu's volume slider carry `data-setting` and
  are bound to the settings store like the Settings page's controls.
- Results screen (`#results`, filled by `createResultsView`; the gallery's
  `#g-results` shows it with placeholder content): a `ui-card ui-screen`
  with the outcome title, the board line, a `ui-stat-row` of `rs-*` stats
  (`rs-bbbvSolved` only on a loss), the `#results-bests` `ui-panel` of `rb-*`
  bests on a win, each with a `ui-stat__detail` difference led by "New best"
  when set, the `#results-note` `ui-text--warning` line, and Play again
  (`#r-again`, primary), Records (`#r-records`), Back to menu (`#r-menu`).
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
- The 3D scene (`js/render.js`, `js/textures.js`) keeps its own palette: it
  never reads tokens and never subscribes to theme changes.
- `js/ui.js`'s one `localStorage` key is `ms3d.hintH.done`; access is
  try/catch-wrapped (`lsGet`/`lsSet`). Nothing reads, writes, shows or imports the
  `ms3d.custom`, `ms3d.best.*` (the per-size 3D best times) and
  `ms3d.lastPreset` keys left in browsers; they stay where they are. The last mode played (`shell.lastMode`), the
  last 3D board choice (`mode3d.lastChoice`) and the settings (`settings`)
  are platform-storage documents, not `ms3d.*` keys.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule.

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md):
  - "Grid & geometry" — spacing start/clamp/wheel step.
  - "Rules" — the timer freezing on win/loss, and HUD contents.
  - "Controls" — start camera position, Esc/F5 replaced by the pause menu.
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
- [../domain/features/results-screen.md](../domain/features/results-screen.md)
  — the results flow (record before show), the screen's content and time
  format, its actions and the failure note.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the Records screen: where it is opened from, its board, Back and focus.
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
  kit-built screens and their contrast; `tests/settings-*.test.mjs` pin the
  Settings screen's wiring and the pause-card shortcuts;
  `tests/results.test.mjs` pins the results flow, view and screen;
  `tests/records-screen.test.mjs` the `records` route's wiring.

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
- Changing the 3D end-of-game flow or the frozen HUD (`endGame`,
  `S.endState`), the board status card (`showStatus3D`, `retry3D`) or how
  the session's timer follows the screens (`sync3D`); the timer's start is
  the session's ([mode3d.md](mode3d.md)).
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
- Changing deploy behaviour (custom domain, 404 redirect, vendored three.js path).
- Adding or renaming a token, or changing how start-up reads the stored
  theme (`readStoredTheme` in `js/theme.js`, kept in step with the settings
  document's key and version).
- Adding a setting or a setting control: [settings.md](settings.md) first,
  then the `// ---------- settings ----------` block of `js/main.js`.
