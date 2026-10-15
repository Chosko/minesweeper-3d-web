# Settings — bindings source and active device

## OVERVIEW

`js/settings/bindings.js` is the one table of each mode's controls per input
device, read by the Settings page's Bindings panel
([settings-page.md](settings-page.md)) and by every help surface in
`js/ui.js` — the pause card, the main menu's Controls panel, the H panel,
the HUD strip, the first-use hint strips and the one-time hints — plus the
active device those surfaces follow. DOM-free; rebinding is not offered.
The module's head comment lists every function.

## PUBLIC API

- `BINDING_MODES` (`classic-2d`, `3d`), `BINDING_DEVICES` (`keyboard`,
  `controller`), `TOUCH_DEVICE` (`touch`, both modes), `bindingDevices(mode)`
  (the devices a mode lists), `BINDINGS[mode][device]` — frozen
  `[input, action]` rows, 3D's being Fly's. `CAMERAS` (`fly`, `orbit`) and
  `BINDINGS_3D[camera][device]` — the 3D rows per Camera setting.
  Both modes list `[F2]` and `{start} + {y}` as Restart; 3D's keyboard rows
  list the arrow keys (look, or rotate in Orbit) and Enter / ' (reveal /
  flag on release, together a chord).
- `bindingRows(mode, device, camera = 'fly')` (3D's for that camera; throws
  on an unknown mode, device or camera),
  `bindingsListHtml(rows, glyphs = GLYPHS.generic)` (`<dt>`/`<dd>` pairs,
  keys as `<kbd>`, buttons as `<kbd class="pad">`, text escaped),
  `bindingsHtml(mode, device, glyphs?, camera?)` — the bindings component.
- `HUD_STRIP`, `HINT_STRIP`, `hudStripHtml(mode, device, glyphs?, { muted,
  spacing })` (only the keys, buttons or gestures the mode binds on that
  device; F is not listed in Classic 2D, where it flags; 3D's first entry is
  the spacing readout, `X` spacing 1.1 to one decimal, D-pad on the
  controller, Pinch on touch, its only touch entry; Classic 2D's touch strip
  is empty), `hintStripHtml(mode, device, glyphs?)` (touch: tap, long-press,
  the tap chord in Classic 2D, the Space and Shift buttons in 3D).
- `HELP_FOOT`, `helpFootHtml(mode, device, glyphs?)` — the H panel's foot
  line, naming the release rule in 3D only (on touch, the finger's lift;
  Classic 2D's touch foot is empty).
- `HINT_TEXT` (`autoHide`, `aimHint`, `scrollHint` and the Learn 3D
  prompts `learnStart`, `learnShift`, `learnCtrl`, `learnFlag`,
  `learnChord`, `learnRest`, each for the keyboard, the controller and
  touch — touch naming the 3D toolbar's buttons and the gestures, the chord
  the two-finger tap), `hintText(name, device, glyphs?)` — a one-time hint
  or prompt as plain text.
- `createActiveDevice({ onChange })` → `current` (`'keyboard'` |
  `'controller'`), `input('pad' | 'keyboard' | 'pointer')`,
  `connected(on)`: the controller while the last input came from a
  connected controller, otherwise the keyboard and mouse (also on
  disconnect); `onChange(device)` once per change.

## INTERNAL PATTERNS

- **Row-text syntax.** `[Key]` is a keyboard key and `{name}` a controller
  button by its standard-mapping name (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`,
  `rt`, `start`, `back`), drawn in the connected pad's glyphs
  (`js/gamepad.js` `GLYPHS`).
- **Bindings are one table.** The Settings page shows every mode × device;
  the pause card, the H panel with its foot line and the HUD strip show the
  active mode's rows for the active device, the main menu's Controls panel
  the rows of its Classic 2D | 3D tab for the active device, and the hint
  strip its mode's strip — on a coarse-only device all of them touch's,
  unless a controller is in use (`UI._bindDevice`,
  [app-shell-help.md](app-shell-help.md)). A row's text is edited in `BINDINGS` (`HUD_STRIP`, `HINT_STRIP`,
  `HELP_FOOT`, `HINT_TEXT` for those surfaces), never in markup, so a later
  rebinding feature reaches every surface through this source.
- **Camera-selected rows.** 3D's rows are one table per device (`ROWS_3D`)
  whose string entries are slots — `look`, `move`, `wheel` (keyboard),
  `sticks`, `buttons` (controller), `stick`, `drag` (touch) — filled from
  `CAMERA_ROWS[camera]`, so a row that does not change with the camera is
  written once. Every 3D surface passes the Camera setting's value
  (`UI.setCamera`, [app-shell-ui.md](app-shell-ui.md)); Classic 2D ignores
  `camera`.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  read-only bindings list on the page.

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
  mode or device: `BINDINGS`, the strip and hint tables and the row-text
  syntax in `bindings.js`.
- Changing a 3D row for one camera, or adding a camera: `ROWS_3D`'s slots and
  `CAMERA_ROWS`.
