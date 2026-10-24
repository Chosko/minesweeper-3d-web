# Settings — bindings source and active device

## OVERVIEW

`js/settings/bindings.js` is the one source of each mode's controls per
input device, in the canvas's short wording, read by the Settings page's
Bindings panel ([settings-page.md](settings-page.md)) and by every help
surface in `js/ui.js` — the pause card, the H panel, the 3D ready card, the HUD strip, the first-use hint
strips and the one-time hints — plus the active device those surfaces
follow. DOM-free; rebinding is not offered. The module's head comment lists
every function.

## PUBLIC API

- `BINDING_MODES` (`classic-2d`, `3d`), `BINDING_DEVICES` (`keyboard`,
  `controller`), `TOUCH_DEVICE` (`touch`, both modes), `bindingDevices(mode)`
  (the devices a mode lists), `BINDINGS[mode][device]` — frozen
  `[input, action]` rows of the full list, 3D's being Fly's. `CAMERAS`
  (`fly`, `orbit`) and `BINDINGS_3D[camera][device]` — the 3D rows per
  Camera setting. Both modes list F2 and `{start} + {y}` as Restart;
  Classic 2D's controller rows list `{rb}` as the live-figures toggle; 3D's
  keyboard rows list the arrow keys (look, or rotate in Orbit).
- `HELP_BINDINGS` — the help list where it differs from the full one:
  Classic 2D's keyboard (J-Pause-xl, plus the wheel and H · M) and touch
  (J-Pause-p) rows, and 3D's keyboard rows per camera (the H panel's, plus
  Enter / ' and Home / R, which no other list shows); `READY_BINDINGS
  [camera][keyboard | touch]` — the 3D ready card's rows.
- `bindingRows(mode, device, camera = 'fly')` (the full rows, 3D's for that
  camera; throws on an unknown mode, device or camera),
  `helpRows(mode, device, camera?)` (`HELP_BINDINGS`' rows where it holds
  the pair, the full rows otherwise), `readyRows(device, camera?)`;
  `bindingsListHtml(rows, glyphs = GLYPHS.generic)` (the
  `ui-controls__key` / `ui-controls__action` pairs of the kit's controls
  list, keys and buttons in plain words with no key caps, text escaped),
  `bindingsHtml(mode, device, glyphs?, camera?)` — the bindings component,
  the full rows — `helpListHtml(mode, device, glyphs?, camera?)` and
  `readyListHtml(device, glyphs?, camera?)`.
- `HUD_STRIP`, `HINT_STRIP`, `hudStripHtml(mode, device, glyphs?, { muted,
  spacing })` (only the keys, buttons or gestures the mode binds on that
  device; F is not listed in Classic 2D, where it flags; 3D's first entry is
  the spacing readout, `X` spacing 1.1 to one decimal, D-pad on the
  controller, Pinch on touch, its only touch entry; Classic 2D's touch strip
  is empty), `hintStripHtml(mode, device, glyphs?)` (keyboard and controller:
  each row a `kbd-hint` holding its whole input in one `<kbd>` and its
  action, no separator between rows; touch: tap, long-press and the mode's
  chord gesture — a tap on a number in Classic 2D, the two-finger tap in 3D —
  as words between " · ").
- `HELP_FOOT`, `helpFootHtml(mode, device, glyphs?)` — the H panel's foot
  line in plain words, naming the key that hides the panel and, in 3D, that
  actions fire on release (on touch the release rule alone, the finger's
  lift; Classic 2D's touch foot is empty).
- `HINT_TEXT` (`autoHide`, `aimHint`, `scrollHint` and the Learn 3D
  prompts `learnStart`, `learnShift`, `learnCtrl`, `learnFlag`,
  `learnChord`, `learnRest`, each for the keyboard, the controller and
  touch — touch naming the 3D toolbar's buttons and the gestures, the chord
  the two-finger tap), `hintText(name, device, glyphs?)` — a one-time hint
  or prompt as plain text.
- `KEY_HINTS` (`move`, `select`, `confirm` — a confirm button's, the
  controller's A alone —, `back`, `restart`, each per device, none on
  touch), `keyHintKeys(action, device, glyphs?)` → `[{text, pad}]`: the
  keys or buttons a screen's `ui-key-hint` shows beside an action
  (`showKeyHints`, [app-shell-kit-helpers.md](app-shell-kit-helpers.md)).
- `createActiveDevice({ onChange })` → `current` (`'keyboard'` |
  `'controller'`), `input('pad' | 'keyboard' | 'pointer')`,
  `connected(on)`: the controller while the last input came from a
  connected controller, otherwise the keyboard and mouse (also on
  disconnect); `onChange(device)` once per change.

## INTERNAL PATTERNS

- **Row-text syntax.** `[Key]` is a keyboard key and `{name}` a controller
  button by its standard-mapping name (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`,
  `rt`, `start`, `back`), drawn in the connected pad's glyphs
  (`js/gamepad.js` `GLYPHS`): plain words in the controls lists and the
  help foot, key caps in the HUD and hint strips.
- **Bindings are one source, three lists.** The Settings page shows one
  mode × device's full rows at a time, picked by its Mode and Device
  choices; the pause card and the H panel (with its foot
  line) show the active mode's help rows for the active device, and the HUD
  strip that mode's strip; the ready card its short rows, touch's on a
  coarse-only device; the hint strip its mode's strip — on a coarse-only
  device all of them touch's, unless a controller is in use
  (`UI._bindDevice`, [app-shell-help.md](app-shell-help.md)). A row's text
  is edited in `BINDINGS`, `HELP_BINDINGS` or `READY_BINDINGS` (`HUD_STRIP`,
  `HINT_STRIP`, `HELP_FOOT`, `HINT_TEXT` for those surfaces), never in
  markup, so a later rebinding feature reaches every surface through this
  source.
- **Camera-selected rows.** 3D's rows are one table per device and list
  (`ROWS_3D`, `HELP_3D`, `READY_3D`) whose string entries are slots —
  `look`, `mouse`, `move`, `wheel` (keyboard), `sticks`, `buttons`
  (controller), `stick`, `drag` (touch), the `ready…` ones for the ready
  card — filled from `CAMERA_ROWS[camera]`, so a row that does not change
  with the camera is written once. Every 3D surface passes the Camera setting's value
  (`UI.setCamera`, [app-shell-ui.md](app-shell-ui.md)); Classic 2D ignores
  `camera`.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  read-only bindings list on the page.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the controls list every list is drawn in, in the canvas's short wording.

## CROSS-REFERENCES

- [settings-page.md](settings-page.md) — `bindingsSectionHtml`, the page's
  Bindings panel.
- [app-shell-help.md](app-shell-help.md) — mode-aware help and first-use hints: the
  surfaces that read this source and the active device.
- [input-controller.md](input-controller.md) — the controller glyphs (`js/gamepad.js` `GLYPHS`).
- [settings.md](settings.md) — the `camera` setting the 3D rows follow.
- [testing.md](testing.md) — `tests/shell-help.test.mjs`,
  `tests/shell-first-use.test.mjs`, `tests/settings-page.test.mjs` (the
  camera-selected rows).

## WHEN TO READ THE SOURCE

- Changing a mode's listed bindings, a strip's or hint's words, or adding a
  mode or device: `BINDINGS`, `HELP_BINDINGS`, `READY_BINDINGS`, the strip
  and hint tables and the row-text syntax in `bindings.js`.
- Changing a 3D row for one camera, or adding a camera: `ROWS_3D`'s slots and
  `CAMERA_ROWS`.
