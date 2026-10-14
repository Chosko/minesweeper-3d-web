# App shell — `UI`, HUD, help surfaces, first-use hints, controller menus

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/ui.js` — DOM only, no game rules: class `UI`, board-settings
clamping and the board lines; it formats the overlay bar with the kit
helpers, fills the Settings page from `js/settings/page.js` and every help
surface from `js/settings/bindings.js` — and, in `js/main.js`, the HUD,
the mode-aware help, the active device, the first-use hints
(`js/shell/first-use.js`, pure; its document and rules in its head comment)
and the controller's menu navigation.

## PUBLIC API

`js/ui.js` exports
- `DIM_MIN` / `DIM_MAX` (1/100, from `js/mode3d/board-choice.js`);
  `clampSettings(s)` → `{X,Y,Z,mines}` integers, mines 1..X*Y*Z − 1 (a
  1×1×1 board clamps to 0); `startGame` clamps with it.
- `fmtDims`, `pauseLine(time, minesLeft)`, `NO_MOUSE_MSG`, `TOUCH_MSG`,
  `boardLine3D(s, {mines?})` (`"6 × 6 × 6 · 10 mines · no-guess"`),
  `boardLine2D({width, height, noGuess})` (`"30 × 16 · no-guess"`).
- `UI(cb)` — callbacks are named after the control they serve
  (`onMenuEntry`, `onBack`, `onReady*`, `onResume`, `onRestart`,
  `onMainMenu`, `onPause`, `onToggleSwap`, `onToggleTap`, `onToggleSound`,
  `onDismissHint(mode, kind)`, `on{Retry,Standard,OfferMenu,Cancel}{2D,3D}`,
  `onStandardWait3D`, `onMenuPlayAgain`, `onBackToStart`, `onResetAll`).
  Method groups:
  - screens: `showMenu`, `showBoardChoice`, `showBoardChoice2D`,
    `showComingSoon`, `showRecords`, `showSettings`, `showReady(board, msg,
    {rules, blocked})`, `setReadyPending`, `showPlaying`, `showClassic2D`,
    `showPause({state, time, minesLeft, note, mode})`, `updatePause`,
    `showReplay`;
  - Classic 2D: `setSwap`, `setTapMode('reveal' | 'flag')`, `panelFrame2D()` (`PANEL_INSET` 9 px,
    bar height + `PANEL_GAP` 8 px on top), `placePanel2D(rect)`,
    `setBoard2D`, `setBoardStatus`; 3D `setBoardStatus3D` (progress drawn by
    `progressLine`);
  - menu: `setLastMode`, `setReturning({strip, again})`,
    `setEntryUnavailable`;
  - confirmations: `showConfirm({message, confirmLabel}, onYes, onNo)`,
    `isConfirmOpen`, `closeConfirm`, `closeResetConfirm` (→ false when none
    is open);
  - HUD: `setBoard`, `updateHud(time, minesLeft, clicks?)`, `setModes`,
    `setCrosshair`, `setArrow(angle|null)`, `setReadout(r|null)`,
    `setSpacing(v)` (the 3D tools strip's spacing readout), `setSound(muted)`;
  - help and hints: `toggleHelp`, `userToggleHelp`, `setHintStrip(on,
    {scroll})`, `dismissHint`, `setDevice`, `setPad`, `flash`,
    `toast(msg, ms)`, `setNoMouse(on, touch)`, `setNotice3D`, `openControls` / `closeControls` /
    `isControlsOpen`, `isPauseVisible`, `setReadyMessage`.
  HUD writes (`updateHud`, `setArrow`, `setReadout`) touch the DOM only on
  change.

## INTERNAL PATTERNS

- **Overlay bar** (`#hud .ui-overlay-bar.hud-bar`): `#hud-time`
  (`formatOverlayTime`, stops at `999` while `S.time` keeps counting),
  `#hud-mines` (`formatMineCount`, `.negative` below zero, widened past
  three digits by `mineCounterDigits`), `#hud-clicks` (counted clicks,
  wasted included: 2D from the `hud` feed, 3D from `clicks3D()` or the
  frozen `S.endState.clicks`), the board size, then `#hud-pause`. Its
  click and the controller's START/BACK in play (through `padClick`) all
  pause through that one control. `#hud-swap` ("Swap clicks",
  `aria-pressed`) shows only in Classic 2D (hidden by `showPause` and by
  `#hud:not(.hud--2d) #hud-swap`) and never takes focus (its `mousedown` is
  prevented), so Space and Enter keep playing. `#hud-tap` (the Reveal /
  Flag switch, "Tap: Reveal" / "Tap: Flag", `aria-pressed` on Flag) works
  the same way but shows only under `(pointer: coarse)` in Classic 2D, with
  a 44 px hit area; `main.js` flips `mode2d.setTapMode` and writes it back
  with `setTapMode`. Over the 3D scene the bar
  has its own raised surface; in Classic 2D it is the top edge of the
  board's framed panel.
- **Aimed-cell readout** `#aim-readout` sits below and right of the
  crosshair, clear of the off-screen arrow `#crosshair-arrow`: a cube icon
  and `#aim-cubes`, then `#aim-flag-part` only while there are flags.
- **One bindings source.** The help panel's list and foot line, the pause
  card's list, the HUD strip `#hud-tools`, the hint strip, the main menu's
  Controls panel (`#controls-tabs`, Classic 2D | 3D) and the Settings
  page's bindings are all drawn from `js/settings/bindings.js`
  ([settings-bindings.md](settings-bindings.md)); edit a binding's text in `BINDINGS` only.
  They show the mode the last screen method set (`showReady` /
  `showPlaying` 3D, `showClassic2D` 2D, `showPause`'s `mode`) for the
  device `setDevice` set, and every change of either, or of the pad's
  glyphs, redraws them.
- **Help panel.** `_helpByUser` keeps an H-opened panel open across
  screens; screen methods otherwise hide it. `H` toggles it and `M` sets
  `muted` in both modes; the store's `muted` subscription updates every
  Sound label (`ui.setSound`). `onKey` ignores H/M/F whose target is inside
  `input, select, textarea`; the arrow keys go to `keyNav` before that.
- **Active device.** `DEVICE` (`createActiveDevice`,
  [settings-bindings.md](settings-bindings.md)) is told of every keydown and
  mousedown/mousemove (capture listeners), every pad poll with a press or a
  stick off its deadzone (`padUsed`) and the pad's connection
  (`updatePadUi`); its change calls `ui.setDevice`.
- **First-use hints.** `FIRST_USE` (`createFirstUse` over storage and
  `RECORDS`) loads once the records have, seeding a new `shell.firstUse`
  from them. It counts a game at the host's `started` and a finished 3D game
  at `finished`. Strip eligibility is judged as the game begins (`hint3D`
  in `startGame`; `hint2D` at the 2D `board` report, not again for the
  standard-board offer); `refreshHints` shows the active mode's strip on
  every router change, at the first key or pad input of a 2D game
  (`used2D`) and at a dismissal; a scrolling 2D board (`clipped2D`) shows
  the one-time scroll hint instead until `FIRST_USE.once('scrollHint')`.
  The ready card shows "How 3D works" while `FIRST_USE.rules3D`.
  `noteAutoHide` gives the one-time toast at the first auto-hide; the
  frame loop's `aimHint` shows the aim hint once the crosshair rests
  `AIM_DWELL_MS` on a revealed number with a closed cube behind it. Hint
  words come from `hintText` in the active device's names.
- **Controller menus.** `LAYER_SCREEN` maps each overlay to its screen,
  topmost first; the topmost visible, non-inert one takes input
  (`topLayer`), focusing `SHELL.defaultFocus`. Every router change and
  controls-modal toggle calls `layerChanged`, which suppresses buttons held
  at the last poll until released and resets the menu repeats. The arrow
  keys (`keyNav`) take the same spatial step as the pad (`navStep`) on
  every screen but `KEY_NAV_OFF` (`playing`, `classic-2d`, `records`,
  `replay`), leave an arrow the focused control owns (`keepsArrow`) or
  handled (`defaultPrevented`), and focus through `keyFocus`, which drops
  `pad-nav` so `:focus-visible` shows.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the overlay bar's display formats.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  Settings page and the pause-card shortcuts.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  mode-aware help and first-use hints.

## CROSS-REFERENCES

- [settings-bindings.md](settings-bindings.md) — bindings source, active
  device; [settings-page.md](settings-page.md) — Settings page markup and
  binder.
- [input-controller.md](input-controller.md) — the navigation layer;
  [input.md](input.md) — Space's tap-toggle.
- [testing.md](testing.md) — `tests/shell-help.test.mjs`,
  `tests/shell-first-use.test.mjs`, `tests/components.test.mjs` (overlay
  bar), `tests/settings-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing what a help surface shows or when it follows the device: the
  `// ---------- bindings: the active mode and device ----------` block of
  `js/ui.js` and `// ---------- active device ----------` in `js/main.js`.
- Changing when a first-use hint shows: `js/shell/first-use.js` and the
  `// ---------- first-use hints ----------` block of `js/main.js`.
- Adding a HUD element or overlay: markup, `UI.el`, a `--z-*` layer, a
  router screen and a `LAYER_SCREEN` entry.
- Changing controller mapping in menus: `padMenus`.
