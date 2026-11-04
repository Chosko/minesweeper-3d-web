# Settings — bindings source: rows, strips, hints and key hints

## OVERVIEW

`js/settings/bindings.js` holds, beside the action catalogues
([settings-bindings.md](settings-bindings.md)), the bindings source: each
mode's controls per input device, in the canvas's short wording, read by the
Settings page's Bindings panel ([settings-page.md](settings-page.md)) and by
every help surface in `js/ui.js` — the pause card, the H panel, the 3D ready
card, the HUD strip, the first-use hint strips and the one-time hints, the
figures panels' controls reminders and the key hints. Every table is filled
from the current bindings the resolver gives
([settings-bindings.md](settings-bindings.md)). DOM-free; the module's head
comment lists every function, and the page shows the bindings read-only.

## PUBLIC API

- **Rows.** `BINDING_MODES` (`classic-2d`, `3d`), `BINDING_DEVICES`
  (`keyboard`, `controller`), `TOUCH_DEVICE` (`touch`, both modes),
  `bindingDevices(mode)`, `BINDINGS[mode][device]` — frozen `[input,
  action]` rows of the full list, 3D's being Fly's. `CAMERAS` (`fly`,
  `orbit`) and `BINDINGS_3D[camera][device]`. Both modes list F2 and
  `{start} + {y}` as Restart; both modes' controller rows list `{back}` as
  the live-figures toggle and `{start}` alone as Pause; 3D's keyboard rows
  list the arrow keys (look, or rotate in Orbit). `HELP_BINDINGS`,
  `READY_BINDINGS`, `HINT_STRIP`, `HINT_TEXT` and `REMINDER` likewise. Every
  exported table holds the rows filled with the defaults.
- `HELP_BINDINGS` — the help list where it differs from the full one:
  Classic 2D's keyboard (J-Pause-xl, plus the wheel and H · M) and touch
  (J-Pause-p) rows, and 3D's keyboard rows per camera (the H panel's, plus
  Enter / ' and Home / R, which no other list shows); `READY_BINDINGS
  [camera][keyboard | touch]` — the 3D ready card's rows.
- Each function below that shows a catalogue action takes the current
  bindings as its last argument (the resolver, or anything with its
  `current`; the defaults when omitted): `bindingRows(mode, device, camera =
  'fly', bindings?)` (throws on an unknown mode, device or camera),
  `helpRows`, `readyRows(device, camera?, bindings?)`,
  `bindingsListHtml(rows, glyphs = GLYPHS.generic)` (the `ui-controls__key`
  / `ui-controls__action` pairs of the kit's controls list, keys and buttons
  in plain words with no key caps, text escaped), `bindingsHtml`,
  `helpListHtml(mode, device, glyphs?, camera?, bindings?)`,
  `readyListHtml`.
- `HUD_STRIP`, `hudStripHtml(mode, device, glyphs?, { muted, spacing })`
  (only the keys, buttons or gestures the mode binds on that device, none a
  catalogue action; F is not listed in Classic 2D, where it flags; 3D's
  first entry is the spacing readout, `X` with the current spacing to one
  decimal ("spacing 1.1"), D-pad on the controller, Pinch on touch, its only
  touch entry; Classic 2D's touch strip is empty), `hintStripHtml(mode,
  device, glyphs?, bindings?)` (keyboard and controller: each row a
  `kbd-hint` holding its whole input in one `<kbd>` and its action, no
  separator between rows; touch: tap, long-press and the mode's chord
  gesture — a tap on a number in Classic 2D, the two-finger tap in 3D — as
  words between " · ").
- `HELP_FOOT`, `helpFootHtml(mode, device, glyphs?)` — the H panel's foot
  line in plain words, naming the key that hides the panel and, in 3D, that
  actions fire on release (on touch the release rule alone, the finger's
  lift; Classic 2D's touch foot is empty).
- `HINT_TEXT` (`autoHide`, `aimHint`, `scrollHint` and the Learn 3D
  prompts `learnStart`, `learnShift`, `learnCtrl`, `learnFlag`,
  `learnChord`, `learnRest`, each for the keyboard, the controller and
  touch — touch naming the 3D toolbar's buttons and the gestures, the chord
  the two-finger tap), `hintText(name, device, glyphs?, bindings?)` — a
  one-time hint or prompt as plain text, filled from 3D's bindings.
- `REMINDER`, `reminderKeys(mode, device, glyphs?, bindings?)` → `[{ keys:
  [{ text, pad }], label }]`: the figures panel's controls reminder.
- `KEY_HINTS` (`move`, `select`, `confirm` — a confirm button's, the
  controller's A alone —, `back`, `restart`, each per device, none on
  touch: the shell's reserved inputs), `keyHintKeys(action, device,
  glyphs?, { mode?, bindings? })` → `[{text, pad}]`: the keys or buttons a
  screen's `ui-key-hint` shows beside an action — a shell action's fixed
  keys, or a catalogue action of `mode` with its current inputs
  (`showKeyHints`, [app-shell-kit-helpers.md](app-shell-kit-helpers.md)).

## INTERNAL PATTERNS

- **Row-text syntax.** `[Key]` is a keyboard key and `{name}` a controller
  button by its standard-mapping name (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`,
  `rt`, `start`, `back`), drawn in the connected pad's glyphs
  (`js/gamepad.js` `GLYPHS`): plain words in the controls lists and the
  help foot, key caps in the HUD and hint strips. A catalogue action's
  inputs are a token, `<key:flag>`, `<mouse:reveal@1>`, `<pad:up down left
  right>`, filled from the current bindings into that syntax; its forms
  (nth input, several actions, the "Arrow keys" / "D-pad" names, `|Label`,
  `|lower`) are in the module's head comment. Inputs outside the catalogues
  — the shell's, help, sound, the wheel, the sticks — are written as they
  are, since they are reserved.
- **Filled once per bindings.** The tables are built from a template per
  current bindings and cached by its object (`tables`), so the defaults'
  tables are the exported constants and the same rows come back on every
  call until the bindings change.
- **Bindings are one source, three lists.** The Settings page shows one
  mode × device's full rows at a time, picked by its Mode and Device
  choices; the pause card and the H panel (with its foot
  line) show the active mode's help rows for the active device, and the HUD
  strip that mode's strip; the ready card its short rows, touch's on a
  coarse-only device; the hint strip its mode's strip — on a coarse-only
  device all of them touch's, unless a controller is in use
  (`UI._bindDevice`, [app-shell-help.md](app-shell-help.md)). A row's text
  is edited in the row templates (`ROWS_2D`, `ROWS_3D`, `HELP_3D`,
  `READY_3D`, `HINT_ROWS`, `HINT_TEMPLATES`, `REMINDER_ROWS`, `HUD_STRIP`,
  `HELP_FOOT`), never in markup.
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
  bindings list on the page.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the controls list every list is drawn in, in the canvas's short wording.

## CROSS-REFERENCES

- [settings-bindings.md](settings-bindings.md) — the catalogues, the
  resolver whose current bindings fill every table, the active device.
- [settings-page.md](settings-page.md) — `bindingsSectionHtml`, the page's
  Bindings panel.
- [settings.md](settings.md) — the `camera` setting the 3D rows follow.
- [app-shell-help.md](app-shell-help.md) — mode-aware help and first-use hints: the
  surfaces that read this source and the active device.
- [input-controller.md](input-controller.md) — the controller glyphs (`js/gamepad.js` `GLYPHS`, `BTN`).
- [testing-files.md](testing-files.md) — `tests/settings-bindings.test.mjs` (help
  surfaces after a rebinding), `tests/shell-help.test.mjs`,
  `tests/shell-first-use.test.mjs`, `tests/settings-page.test.mjs` (the
  camera-selected rows).

## WHEN TO READ THE SOURCE

- Changing a mode's listed bindings, a strip's or hint's words, or adding a
  mode or device: the row templates and the token syntax in `bindings.js`.
- Changing a 3D row for one camera, or adding a camera: `ROWS_3D`'s slots and
  `CAMERA_ROWS`.
