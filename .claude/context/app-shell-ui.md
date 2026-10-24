# App shell — `UI`, behind a card, controller menus

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers `js/ui.js` — DOM only, no game rules: class `UI`, board-settings
clamping, the board lines and titles; it writes each mode's counters with
the kit helpers and its live figures through the live figures model, fills
the Settings page from `js/settings/page.js` and every help surface from
`js/settings/bindings.js` — and, in `js/main.js`, the HUD and the
controller's menu navigation. The help surfaces, the active device and
the first-use hints are [app-shell-help.md](app-shell-help.md).
Each mode's counters, live figures, the Classic 2D window's and the 3D
overlay's parts and the aimed-cell readout are
[app-shell-hud.md](app-shell-hud.md).

## PUBLIC API

`js/ui.js` exports
- `DIM_MIN` / `DIM_MAX` (from `js/mode3d/board-choice.js`);
  `clampSettings(s)` → `{X,Y,Z,mines}` integers, mines 1..X*Y*Z − 1 (a
  1×1×1 board clamps to 0); `startGame` clamps with it.
- `fmtDims`, `pauseLine(time, minesLeft)`, `NO_MOUSE_MSG`, `TOUCH_MSG`,
  `boardLine3D(s, {mines?})` (`"6 × 6 × 6 · 10 mines · no-guess"`);
  Classic 2D's `boardTitle2D`
  (`"Classic 2D · Expert"`), its size line `boardLine2D` and foot line
  `boardFoot2D` (the size line with *No-guess* capitalised); 3D's
  `boardTitle3D` (`"3D · Cube Intermediate"`) and `shortTitle3D` (`"3D"`);
  `figuresLine` (re-exported). The pause card's board line joins a mode's
  title to its size line (`boardLine2D`, `boardLine3D` with mines).
- `UI(cb)` — callbacks are named after the control they serve
  (`onMenuEntry`, `onBack`, `onReady*`, `onResume`, `onRestart`,
  `onMainMenu`, `onPause`, `onToggleSwap`, `onTapMode`,
  `onDismissHint(mode, kind)`, `on{Retry,Standard,OfferMenu,Cancel}{2D,3D}`,
  `onStandardWait3D`, `onLearnEnd(won)`, `onLearnBack`, `onBackToStart`,
  `onResetAll`). Method groups:
  - screens: `showMenu`, `showBoardChoice`, `showBoardChoice2D`,
    `showComingSoon(title)`, `showDaily`, `showRecords`, `showSettings`, `showReady(board, msg,
    {rules, blocked})`, `setReadyPending`, `showPlaying`, `showClassic2D`,
    `showPause({state, time, minesLeft, note, mode})`, `updatePause`,
    `showReplay` / `hideReplay` (`body.replaying`: no HUD, view chips, tools
    strip, help, hint strip or toast shows or appears over the viewer),
    `replayRing(x, y, kind)` (a 3D replay's press ring on the layer over its scene, `#replay-scene-over`, at x, y in the board area);
  - Classic 2D: `setSwap`, `setTapMode('reveal' | 'flag')`,
    `placePanel2D(rect, radius)` (the board frame at `rect`, its corner radius set as `--board-frame-radius`; a null `rect` hides it),
    `sizeBoard2D(extent)` (the board area `#c2d-stage` at the board's extent in the room the window's chrome leaves, measured under `#c2d.c2d--measure`; → whether it changed),
    `setBoard2D`, `updateFigures2D(input, {tick, bests})`,
    `setBoardStatus` (the card centred on the board column `#c2d-main`,
    `_centreStatus2D`, again on every `placePanel2D`); 3D `setBoardStatus3D`
    (progress by `progressLine`); on either a failure offering nothing
    shows Back alone, with the arrow icon;
  - menu: `setEntryUnavailable` (a play tile's reason, long and short, its
    lock and its locked preview), `setBuild` (the build label);
  - confirmations: `showConfirm({title, message, confirmLabel}, onYes, onNo)`,
    `isConfirmOpen`, `closeConfirm`, `closeResetConfirm` (→ false when none
    is open);
  - HUD: `setBoard` (the 3D title and the pause card's full board line),
    `setLearn(on)` (Learn 3D's overlay), `updateHud(time, minesLeft,
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
    `setCamera('fly' | 'orbit')` (the 3D rows, the ready card's among
    them, follow the Camera setting), `flash`,
    `toast(msg, ms, { firstUse })` (the text into `#toast-text`, the icon kept; `firstUse` marks a first-use hint's toast `toast--first-use`, never shown over the results), `setNoMouse(on, touch)`, `setTouch3D(on)` (the touch ready card and the help's touch rows, `_bindDevice`), `setTouchModes(modes)`, `setStick(view|null)`, `isPauseVisible`, `setReadyMessage`.
  HUD writes (`updateHud`, `updateFigures*`, `setArrow`, `setReadout`)
  touch the DOM only on change.

## INTERNAL PATTERNS

- **In-game readouts** — counters, live figures, the Classic 2D window, HUD
  density, the 3D overlay, the aimed-cell readout — are
  [app-shell-hud.md](app-shell-hud.md).
- **Behind a card.** While the 3D ready card (not pending), the pause card
  or the results show, `#hud` is hidden — the 3D overlay, the key strip,
  the hint strip — and the Classic 2D window keeps its board and title
  alone; while the 3D board status card shows, `#hud` is hidden under its
  scrim. `css/style.css` does it from those screens' visibility
  (`body:has(…)`); `UI` toggles nothing for it.
- **Help surfaces, the active device and first-use hints** are
  [app-shell-help.md](app-shell-help.md).
- **Controller menus.** `LAYER_SCREEN` maps each overlay to its screen,
  topmost first; the topmost visible, non-inert one takes input
  (`topLayer`), focusing `SHELL.defaultFocus`. Every router change
  calls `layerChanged`, which suppresses buttons held
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

- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the confirmations, the board status cards and the scrim behind a card.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  Settings page and the pause-card shortcuts.
- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  the controller's menus.

## CROSS-REFERENCES

- [app-shell-hud.md](app-shell-hud.md) — the in-game readouts the HUD
  methods write.
- [app-shell-help.md](app-shell-help.md) — the help surfaces, active
  device and first-use hints these methods serve;
  [settings-page.md](settings-page.md) — Settings page markup and binder.
- [input-controller.md](input-controller.md) — the navigation layer;
  [app-shell-focus.md](app-shell-focus.md) — the focus walk.
- [app-shell-kit.md](app-shell-kit.md) — the in-game components.
- [testing.md](testing.md) — `tests/components.test.mjs`,
  `tests/settings-*.test.mjs`, `tests/shell-pad-walk.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a HUD element or overlay: markup, `UI.el`, a `--z-*` layer, a
  router screen and a `LAYER_SCREEN` entry.
- Changing controller mapping in menus: `padMenus`.
