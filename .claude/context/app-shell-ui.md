# App shell — `UI`, HUD, game window counters and live figures, controller menus

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/ui.js` — DOM only, no game rules: class `UI`, board-settings
clamping, the board lines and titles; it writes each mode's counters with
the kit helpers and its live figures through the live figures model, fills
the Settings page from `js/settings/page.js` and every help surface from
`js/settings/bindings.js` — and, in `js/main.js`, the HUD and the
controller's menu navigation. The help surfaces, the active device and
the first-use hints are [app-shell-help.md](app-shell-help.md).

## PUBLIC API

`js/ui.js` exports
- `DIM_MIN` / `DIM_MAX` (1/100, from `js/mode3d/board-choice.js`);
  `clampSettings(s)` → `{X,Y,Z,mines}` integers, mines 1..X*Y*Z − 1 (a
  1×1×1 board clamps to 0); `startGame` clamps with it.
- `fmtDims`, `pauseLine(time, minesLeft)`, `NO_MOUSE_MSG`, `TOUCH_MSG`,
  `boardLine3D(s, {mines?})` (`"6 × 6 × 6 · 10 mines · no-guess"`),
  `boardLine2D` (`"30 × 16 · no-guess"`); Classic 2D's `boardTitle2D`
  (`"Classic 2D · Expert"`) and foot line `boardFoot2D`; 3D's `boardTitle3D`
  (`"3D · Cube Intermediate"`) and `shortTitle3D` (`"3D"`);
  `figuresLine` (re-exported).
- `UI(cb)` — callbacks are named after the control they serve
  (`onMenuEntry`, `onBack`, `onReady*`, `onResume`, `onRestart`,
  `onMainMenu`, `onPause`, `onToggleSwap`, `onToggleTap`,
  `onDismissHint(mode, kind)`, `on{Retry,Standard,OfferMenu,Cancel}{2D,3D}`,
  `onStandardWait3D`, `onLearnEnd(won)`, `onLearnBack`, `onBackToStart`,
  `onResetAll`, `onLayer` — the Controls modal opened or closed, for the
  containment). Method groups:
  - screens: `showMenu`, `showBoardChoice`, `showBoardChoice2D`,
    `showComingSoon(title)`, `showDaily`, `showRecords`, `showSettings`, `showReady(board, msg,
    {rules, blocked})`, `setReadyPending`, `showPlaying`, `showClassic2D`,
    `showPause({state, time, minesLeft, note, mode})`, `updatePause`,
    `showReplay` / `hideReplay` (`body.replaying`: no HUD, view chips, tools
    strip, help, hint strip or toast shows or appears over the viewer),
    `replayRing(x, y, kind)` (a 3D replay's press ring on `#replay`);
  - Classic 2D: `setSwap`, `setTapMode('reveal' | 'flag')`,
    `placePanel2D(rect, radius)` (the board frame at `rect`, its corner radius set as `--board-frame-radius`; a null `rect` hides it),
    `setBoard2D`, `updateFigures2D(input, {tick, bests})`,
    `setBoardStatus` (the card centred on the board column `#c2d-main`,
    `_centreStatus2D`, again on every `placePanel2D`); 3D `setBoardStatus3D`
    (progress by `progressLine`); on either a failure offering nothing
    shows Back alone, with the arrow icon;
  - menu: `setLastMode` (the Last played chip), `setEntryUnavailable`,
    `setBuild` (the build label);
  - confirmations: `showConfirm({title, message, confirmLabel}, onYes, onNo)`,
    `isConfirmOpen`, `closeConfirm`, `closeResetConfirm` (→ false when none
    is open);
  - HUD: `setBoard` (the 3D title and the pause card's board line),
    `setTimed(on)` (off on Learn 3D), `updateHud(time, minesLeft,
    clicks?)`, `updateFigures3D(input, {tick, bests})`, `overlayBottom3D()`
    (the overlay's top row's bottom, for the touch zones), `setModes`,
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
    `toast(msg, ms)` (the text into `#toast-text`, the icon kept), `setNoMouse(on, touch)`, `setTouch3D(on)` (the touch ready card and the help's touch rows, `_bindDevice`), `setTouchModes(modes)`, `setStick(view|null)`, `openControls` / `closeControls` /
    `isControlsOpen`, `isPauseVisible`, `setReadyMessage`.
  HUD writes (`updateHud`, `updateFigures*`, `setArrow`, `setReadout`)
  touch the DOM only on change.

## INTERNAL PATTERNS

- **Counters.** Each mode's `ui-counter-strip`: mines left
  (`formatMineCount`, `data-negative` below zero, widened past three digits
  by `mineCounterDigits`), Restart (`#c2d-restart` / `#hud-restart`, never
  taking focus) and the timer (`formatOverlayTime`, stops at `999`).
  `updateHud` writes the Classic 2D window's (`#c2d-mines-left`,
  `#c2d-time`) while it shows, else the 3D overlay's (`#hud-mines`,
  `#hud-time`), and the Clicks figure (`#c2d-clicks`, `#hud-clicks`: counted
  clicks, wasted included).
- **Live figures.** `updateFigures2D` / `3D` run the live figures model
  (`liveFigures`, `js/shell/live-figures.js`: 3BV with its progress, pace vs
  PB, 3BV/s, clicks with efficiency, flags with mines left; the dash
  placeholder for a figure not yet computable) against the board's bests
  `js/main.js` reads once per game, and write the panel through
  `bindFigures`: on a count change each changed figure and the live part's
  `figuresLine` (`bindFiguresLive`), on the timer's second (`tick`) only
  pace and 3BV/s. Each panel's foot (`#c2d-reminder`, `#hud-reminder`) is
  the mode's `reminderKeys` for the active device.
- **Classic 2D window** (`#c2d`; `showClassic2D` marks `#hud` `hud--2d`,
  hiding the 3D overlay): `#hud-swap` (Swap clicks, `aria-pressed`, never
  under `(pointer: coarse)`, never taking focus), the title `#c2d-title` and
  Pause `#c2d-pause` in its head; `#hud-tap` under the board (the Reveal /
  Flag switch, "Tap: Reveal" / "Tap: Flag", only under `(pointer: coarse)`,
  a 44 px hit area; `main.js` flips `mode2d.setTapMode` and writes it back
  with `setTapMode`); the foot line `#c2d-size`. Its layout:
  [classic2d-mode.md](classic2d-mode.md) § Game window.
- **3D overlay** (`#hud-overlay`): the counter strip `#hud-counters` at the
  top centre, the figures panel `#hud-figures` on the right headed by the
  title `#hud-title` and Pause `#hud-pause`, each on its own surface over
  the sky. The title's full name is its tooltip and accessible name; it
  drops the board (`shortTitle3D`) when the name overflows its line —
  measured, refitted on resize and once the fonts load. Learn 3D hides the
  timer and, by `hud-figures--untimed`, pace and 3BV/s. START pauses through
  `#hud-pause` (`#c2d-pause` in Classic 2D). Layouts by window size:
  `css/components.css`'s head comment (*3D game overlay*).
- **Behind a card.** While the 3D ready card (not pending), the pause card
  or the results show, `#hud` is hidden — the 3D overlay, the key strip,
  the hint strip — and the Classic 2D window keeps its board and title
  alone; while the 3D board status card shows, `#hud` is hidden under its
  scrim. `css/style.css` does it from those screens' visibility
  (`body:has(…)`); `UI` toggles nothing for it.
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
  ([app-shell-focus.md](app-shell-focus.md) § Focus walk); the
  arrows leave an arrow the focused control owns (`keepsArrow`) or handled
  (`defaultPrevented`), and focus through `keyFocus`, which drops
  `pad-nav` so `:focus-visible` shows. Mouse input sets `body.pointer-nav`
  and drops `pad-nav`; any key drops `pointer-nav`, which the theme reads
  to draw a board option selected only by a key, the controller or the
  pointer over it.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the counters' display formats.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window, the 3D overlay and the live figures.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  Settings page and the pause-card shortcuts.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  the controller's menus.

## CROSS-REFERENCES

- [app-shell-help.md](app-shell-help.md) — the help surfaces, active
  device and first-use hints these methods serve;
  [settings-page.md](settings-page.md) — Settings page markup and binder.
- [input-controller.md](input-controller.md) — the navigation layer;
  [app-shell-focus.md](app-shell-focus.md) — the focus walk.
- [app-shell-kit.md](app-shell-kit.md) — the in-game components.
- [testing.md](testing.md) — `tests/components.test.mjs`,
  `tests/components-game3d.test.mjs`, `tests/live-figures.test.mjs`,
  `tests/settings-*.test.mjs`, `tests/shell-pad-walk.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a HUD element or overlay: markup, `UI.el`, a `--z-*` layer, a
  router screen and a `LAYER_SCREEN` entry.
- Changing a figure's wording or format: the head comment of
  `js/shell/live-figures.js`.
- Changing controller mapping in menus: `padMenus`.
