# App shell — help surfaces, active device, first-use hints

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers the mode-aware help — every surface `js/ui.js` draws from the
bindings source `js/settings/bindings.js` — the help panel, the active
device those surfaces follow, and the first-use hints
(`js/shell/first-use.js`, pure; its `shell.firstUse` document and rules in
its head comment) with their wiring in `js/main.js`. The `UI` class's API,
the counters, live figures and the controller menus are [app-shell-ui.md](app-shell-ui.md).

## PUBLIC API

`js/shell/first-use.js` — `createFirstUse` (its head comment lists the
document and every query). The `UI` methods these surfaces use (`setDevice`,
`setPad`, `setCamera`, `setTouch3D`, `setHintStrip`, `hint`, `dismissHint`,
`toggleHelp`, `userToggleHelp`, `toast`) are listed in
[app-shell-ui.md](app-shell-ui.md) § PUBLIC API.

## INTERNAL PATTERNS

- **One bindings source.** The help panel's list and foot line, the pause
  card's list, the HUD strip `#hud-tools`, the hint strip, the main menu's
  Controls panel (`#controls-tabs`, Classic 2D | 3D) and the Settings
  page's bindings are all drawn from `js/settings/bindings.js`
  ([settings-bindings.md](settings-bindings.md)); edit a binding's text in `BINDINGS` only.
  They show the mode the last screen method set (`showReady` /
  `showPlaying` 3D, `showClassic2D` 2D, `showPause`'s `mode`) for the
  device `setDevice` set (touch in either mode on a coarse-only device
  unless a controller is in use, `_bindDevice`, which every one of these
  surfaces follows — the lists, the help foot, the HUD strip, the hint strip,
  the scroll hint, the one-time hints, Learn 3D's prompts and every screen's
  key hints, filled by `showKeyHints`) and the camera `setCamera` set, and every change of
  any of them, or of the pad's glyphs, redraws them. A HUD strip with no
  entries (Classic 2D on touch) hides `#hud-tools`.
- **Help panel.** `_helpByUser` keeps an H-opened panel open across
  screens; screen methods otherwise hide it. `H` toggles it and `M` sets
  `muted` in both modes; the store's `muted` subscription updates the HUD
  strip (`ui.setSound`), and the Sound switches follow through their
  `data-setting` binding. `onKey` ignores H/M/F whose target is inside
  `input, select, textarea`; the arrow keys go to `keyNav` before that.
- **Active device.** `DEVICE` (`createActiveDevice`,
  [settings-bindings.md](settings-bindings.md)) is told of every keydown and
  mousedown/mousemove (capture listeners), every pad poll with a press or a
  stick off its deadzone (`padUsed`) and the pad's connection
  (`updatePadUi`); its change calls `ui.setDevice`.
- **First-use hints.** `FIRST_USE` (`createFirstUse` over storage and
  `RECORDS`) loads once the records have, seeding a new `shell.firstUse`
  from them. It counts a game at the host's `started` and a finished 3D game
  at `finished`, a Learn 3D game toward no window and only its win as
  finished (`learnGame()`). Strip eligibility is judged as the game begins (`hint3D`
  in `startGame`; `hint2D` at the 2D `board` report, not again for the
  standard-board offer); `refreshHints` redraws the active mode's strip on
  every router change, at the first key or pad input of a 2D game
  (`used2D`) and at a dismissal. A 2D game's strip shows from its board on
  a coarse-only device (`COARSE_ONLY`, passed as `stripShown`'s
  `touchOnly`), and otherwise once `used2D` is set; a
  scrolling 2D board (`clipped2D`) shows the one-time scroll hint instead
  until `FIRST_USE.once('scrollHint')`.
  The ready card shows "How 3D works" and the Learn 3D line while
  `FIRST_USE.rules3D` (its hidden-cubes line names the Ctrl key, or the
  touch toolbar's Ctrl button under `#ready.ready--touch`), except on the
  guided board, during which no
  first-use strip, auto-hide toast or aim hint shows.
  `noteAutoHide` gives the one-time toast at the first auto-hide; the
  frame loop's `aimHint` shows the aim hint once the crosshair rests
  `AIM_DWELL_MS` on a revealed number with a closed cube behind it. The
  toast's, the aim hint's and Learn 3D's words come from `ui.hint`, in the
  names of the device the other help surfaces follow (`_bindDevice`): on
  touch, the toolbar's buttons and the gestures.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  mode-aware help and first-use hints.
- [../domain/features/settings.md](../domain/features/settings.md) — the
  pause-card shortcuts.

## CROSS-REFERENCES

- [app-shell-ui.md](app-shell-ui.md) — the `UI` methods and the HUD.
- [settings-bindings.md](settings-bindings.md) — bindings source, active
  device, hint texts.
- [platform.md](platform.md) — the `shell.firstUse` document's storage.
- [app-shell-3d.md](app-shell-3d.md) — Learn 3D's prompts in the hint strip.
- [input.md](input.md) — Space's tap-toggle the hints name.
- [testing.md](testing.md) — `tests/shell-help.test.mjs`,
  `tests/shell-first-use.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing what a help surface shows or when it follows the device: the
  `// ---------- bindings: the active mode and device ----------` block of
  `js/ui.js` and `// ---------- active device ----------` in `js/main.js`.
- Changing when a first-use hint shows: `js/shell/first-use.js` and the
  `// ---------- first-use hints ----------` block of `js/main.js`.
