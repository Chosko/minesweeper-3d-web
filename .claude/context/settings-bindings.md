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
  `controller`), `BINDINGS[mode][device]` — frozen `[input, action]` rows.
  Both modes list `[F2]` and `{start} + {y}` as Restart.
- `bindingRows(mode, device)` (throws on an unknown mode or device),
  `bindingsListHtml(rows, glyphs = GLYPHS.generic)` (`<dt>`/`<dd>` pairs,
  keys as `<kbd>`, buttons as `<kbd class="pad">`, text escaped),
  `bindingsHtml(mode, device, glyphs?)` — the bindings component.
- `HUD_STRIP`, `HINT_STRIP`, `hudStripHtml(mode, device, glyphs?, { muted,
  spacing })` (only the keys or buttons the mode binds on that device; F is
  not listed in Classic 2D, where it flags; 3D's first entry is the spacing
  readout, `X` spacing 1.1 to one decimal, D-pad on the controller),
  `hintStripHtml(mode, device, glyphs?)`.
- `HELP_FOOT`, `helpFootHtml(mode, device, glyphs?)` — the H panel's foot
  line, naming the release rule in 3D only.
- `HINT_TEXT` (`autoHide`, `aimHint`, `scrollHint`), `hintText(name, device,
  glyphs?)` — a one-time hint as plain text.
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
  the pause card, the H panel and the HUD strip show the active mode's rows
  for the active device, the main menu's Controls panel the rows of its
  Classic 2D | 3D tab for the active device, and the hint strip its mode's
  strip. A row's text is edited in `BINDINGS` (`HUD_STRIP`, `HINT_STRIP`,
  `HELP_FOOT`, `HINT_TEXT` for those surfaces), never in markup, so a later
  rebinding feature reaches every surface through this source.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  read-only bindings list on the page.

## CROSS-REFERENCES

- [settings-page.md](settings-page.md) — `bindingsSectionHtml`, the page's
  Bindings panel.
- [app-shell-ui.md](app-shell-ui.md) — mode-aware help and first-use hints: the
  surfaces that read this source and the active device.
- [input-controller.md](input-controller.md) — the controller glyphs (`js/gamepad.js` `GLYPHS`).
- [testing.md](testing.md) — `tests/shell-help.test.mjs`,
  `tests/shell-first-use.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a mode's listed bindings, a strip's or hint's words, or adding a
  mode or device: `BINDINGS`, the strip and hint tables and the row-text
  syntax in `bindings.js`.
