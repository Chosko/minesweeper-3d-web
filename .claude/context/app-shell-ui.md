# App shell — `UI`, HUD, help surfaces, first-use hints, controller menus

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/ui.js` — DOM only, no game rules: class `UI`, board-settings
clamping and the board lines; it formats the overlay bar with the kit
helpers, fills the Settings page from `js/settings/page.js` and every help
surface from `js/settings/bindings.js` — and, in `js/main.js`, the HUD and
the controller's menu navigation. The help surfaces, the active device and
the first-use hints are [app-shell-help.md](app-shell-help.md).

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
  `onStandardWait3D`, `onMenuPlayAgain`, `onBackToStart`, `onResetAll`,
  `onLayer` — the Controls modal opened or closed, for the containment).
  Method groups:
  - screens: `showMenu`, `showBoardChoice`, `showBoardChoice2D`,
    `showComingSoon`, `showRecords`, `showSettings`, `showReady(board, msg,
    {rules, blocked})`, `setReadyPending`, `showPlaying`, `showClassic2D`,
    `showPause({state, time, minesLeft, note, mode})`, `updatePause`,
    `showReplay` / `hideReplay` (`body.replaying`: no HUD, view chips, tools
    strip, help, hint strip or toast shows or appears over the viewer),
    `replayRing(x, y, kind)` (a 3D replay's press ring on `#replay`);
  - Classic 2D: `setSwap`, `setTapMode('reveal' | 'flag')`, `panelFrame2D()` (`PANEL_INSET` 9 px,
    bar height + `PANEL_GAP` 8 px on top), `placePanel2D(rect)`,
    `setBoard2D`, `setBoardStatus`; 3D `setBoardStatus3D` (progress drawn by
    `progressLine`);
  - menu: `setLastMode`, `setReturning({strip, again})`,
    `setEntryUnavailable`;
  - confirmations: `showConfirm({message, confirmLabel}, onYes, onNo)`,
    `isConfirmOpen`, `closeConfirm`, `closeResetConfirm` (→ false when none
    is open);
  - HUD: `setBoard` ("Learn 3D" for the guided board), `setTimed(on)` (the
    overlay timer and the pause card's time, off on Learn 3D),
    `updateHud(time, minesLeft, clicks?)`, `setModes`,
    `setCrosshair`, `setArrow(angle|null)`, `setReadout(r|null)`,
    `setSpacing(v)` (the 3D tools strip's spacing readout), `setSound(muted)`;
  - Learn 3D: `showLearnEnd(won)` / `hideLearnEnd()` (the `#learn-end`
    card), `showReady`'s `learn` line;
  - help and hints: `toggleHelp`, `userToggleHelp`, `setHintStrip(on,
    {scroll, learn})` (`learn` a Learn 3D prompt's hint name, shown with no
    close button), `hint(name)` (a `HINT_TEXT` entry for the device
    `_bindDevice` gives), `dismissHint`, `setDevice`, `setPad` (also fills every
    `[data-pad-glyph]` slot, the Records screen's LB / RB and LT / RT hints),
    `setCamera('fly' | 'orbit')` (the 3D rows and the ready card's
    `[data-camera]` movement line follow the Camera setting), `flash`,
    `toast(msg, ms)`, `setNoMouse(on, touch)`, `setTouch3D(on)` (the touch ready card and the help's touch rows, `_bindDevice`), `setTouchModes(modes)`, `setStick(view|null)`, `openControls` / `closeControls` /
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
  `#hud:not(.hud--2d) #hud-swap`), never under `(pointer: coarse)`, and
  never takes focus (its `mousedown` is prevented), so Space and Enter keep
  playing. `#hud-tap` (the Reveal / Flag switch, "Tap: Reveal" /
  "Tap: Flag", `aria-pressed` on Flag) works the same way but shows only
  under `(pointer: coarse)` in Classic 2D, with a 44 px hit area; `main.js`
  flips `mode2d.setTapMode` and writes it back with `setTapMode`. Over the
  3D scene the bar has its own raised surface; in Classic 2D it is the top
  edge of the board's framed panel and wraps onto more rows inside the
  widest panel (`width: max-content`, `max-width` the board area less the
  panel inset), so a phone keeps every control on screen;
  `panelFrame2D` measures the height it is placed at, again at each refit.
- **Aimed-cell readout** `#aim-readout` sits below and right of the
  crosshair, clear of the off-screen arrow `#crosshair-arrow`: a cube icon
  and `#aim-cubes`, then `#aim-flag-part` only while there are flags.
- **Help surfaces, the active device and first-use hints** are
  [app-shell-help.md](app-shell-help.md).
- **Controller menus.** `LAYER_SCREEN` maps each overlay to its screen,
  topmost first; the topmost visible, non-inert one takes input
  (`topLayer`), focusing `SHELL.defaultFocus`. Every router change and
  controls-modal toggle calls `layerChanged`, which suppresses buttons held
  at the last poll until released and resets the menu repeats. The D-pad
  (`padNav`) and the arrow keys (`keyNav`) move focus through `navStep`
  ([app-shell-navigation.md](app-shell-navigation.md) § Focus walk); the
  arrows leave an arrow the focused control owns (`keepsArrow`) or handled
  (`defaultPrevented`), and focus through `keyFocus`, which drops
  `pad-nav` so `:focus-visible` shows.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the overlay bar's display formats.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  Settings page and the pause-card shortcuts.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  the controller's menus.

## CROSS-REFERENCES

- [app-shell-help.md](app-shell-help.md) — the help surfaces, active
  device and first-use hints these methods serve;
  [settings-page.md](settings-page.md) — Settings page markup and binder.
- [input-controller.md](input-controller.md) — the navigation layer;
  [app-shell-navigation.md](app-shell-navigation.md) — the focus walk.
- [testing.md](testing.md) — `tests/components.test.mjs` (overlay bar),
  `tests/settings-*.test.mjs`, `tests/shell-pad-walk.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a HUD element or overlay: markup, `UI.el`, a `--z-*` layer, a
  router screen and a `LAYER_SCREEN` entry.
- Changing controller mapping in menus: `padMenus`.
