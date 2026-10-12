# Settings — schema, store, appliers, Settings page, bindings source

## OVERVIEW

The player's settings: one schema declaring every setting, one store holding
the validated values and persisting them through platform storage, the
appliers that carry each value to its owner, and the Settings page with the
read-only bindings list. Every module is DOM-free; `js/main.js` wires them
([app-shell.md](app-shell.md)).

- `js/settings/schema.js` — the schema: each setting's key, type, range or
  values, and default. The store's validation and the page's controls are
  both driven from it, so a setting is added here and nowhere else.
- `js/settings/store.js` — the store: load at start-up, validated writes,
  whole-document saves, change notification, the one-time carry-over of the
  legacy `ms3d.*` keys. Knows none of the appliers.
- `js/settings/appliers.js` — each setting's effect, applied by its owner
  subscribing to the store; the render-resolution pixel-ratio rule.
- `js/settings/page.js` — the Settings page markup generated from the schema,
  the bindings section, and the binder that ties any setting control (page,
  pause card, main menu) to the store.
- `js/settings/bindings.js` — the bindings source: each mode's controls per
  input device, the HUD strip, the first-use hint strips, the help panel's
  foot line and the one-time hints' text, read by the Settings page and by
  every help surface in `js/ui.js`; and the active device.

| Setting | Type | Range / values | Default | Applied to |
| --- | --- | --- | --- | --- |
| `lookSensitivity` | number | 0.25–3 | 1 | 3D camera `sensitivity` |
| `invertY` | boolean | | false | 3D camera `invertY` |
| `fullscreen` | boolean | | false | browser fullscreen |
| `renderResolution` | choice | `auto`, `sharp`, `fast` | `auto` | 3D renderer pixel ratio |
| `theme` | choice | `light`, `dark` | `light` | `msTheme.setTheme` |
| `volume` | number | 0–1 | 0.7 | `sfx.setVolume` |
| `muted` | boolean | | false | `sfx.setMuted`, the Sound buttons' label, the Settings page's Sound toggle (on while false) |

## PUBLIC API

Schema (`js/settings/schema.js`)
- `SCHEMA` — frozen `{ key, type: 'number' | 'boolean' | 'choice', min?,
  max?, values?, default }` per setting; `SETTING_KEYS`, `DEFAULTS`.
  `confirmRestart` (boolean, default off) is "Always ask before
  restarting", read by the pause controller's `askRestart`
  ([app-shell.md](app-shell.md)); it has no legacy key.
- `isValid(key, value)` — number finite and inside `min..max` inclusive,
  boolean a boolean, choice one of `values`; false for an unknown key.

Store (`js/settings/store.js`)
- `SETTINGS_DOC` = `'settings'`, `SETTINGS_VERSION` = 1; `LEGACY_KEYS` —
  `lookSensitivity` `ms3d.lookSens`, `invertY` `ms3d.invertY`, `volume`
  `ms3d.volume`, `muted` `ms3d.muted`.
- `createSettingsStore({ storage, legacy?, onNotKept? })` → `{ load, get,
  set, onChange }`. `legacy` is `{ get(key) }` over the old keys (default the
  global `localStorage`); `onNotKept({ reason })` runs at most once per store,
  at the first failed save.
- `load()` → Promise (the same one on every call). Fills a missing or invalid
  value with its default; with no settings document, carries the legacy
  values over once and saves; unreadable storage, a corrupt or a newer
  document gives every default and carries nothing over. Fires every
  listener once with the loaded value.
- `get(key)` → the current value, always valid (the default before load).
- `set(key, value)` → Promise of `{ ok: true }` or `{ ok: false, reason }` —
  `'invalid'` (old value kept, nothing saved or notified) or the save's own
  reason (the change still holds for the session). Re-setting the current
  value does nothing; a set during `load()` applies after it; a set before
  `load()` is called throws.
- `onChange(key, fn)` → unsubscribe; `fn(value, key)` after each change and
  once with the loaded value — at load, or at once when added after it. A
  throwing listener does not stop the others. An unknown key throws in
  `get`, `set` and `onChange`.

Appliers (`js/settings/appliers.js`) — each returns its unsubscribe
- `pixelRatioFor(resolution, devicePixelRatio, cells)` — `auto`: the device
  ratio capped at 2, at 1.5 above 20³ cells and at 1 above 50³; `sharp`: the
  full device ratio; `fast`: 1.
- `applyTheme(store, theme)`, `applyAudio(store, sfx)`,
  `applyLook(store, camera)`, `applyResolution(store, apply)` (`apply(value)`
  re-derives the owner's ratio), `applyFullscreen(store, { doc, enter, exit })`.
- `applySettings(store, { theme?, sfx?, camera?, resolution?, fullscreen? })`
  — every owner given, one unsubscribe for all.

Page (`js/settings/page.js`)
- `SETTINGS_SECTIONS` — Controls (`lookSensitivity`, `invertY`,
  `confirmRestart`), Graphics
  (`fullscreen`, `renderResolution`), Theme (`theme`), Audio (`muted`,
  `volume`); `SETTING_LABELS` (`muted` reads Sound), `CHOICE_LABELS`.
- `settingControl(key)` → `{ key, kind: 'slider' | 'toggle' | 'segmented',
  label, … }`: a number is a `ui-slider` (with `min`, `max`, `step`,
  `format`, `scale` — volume shows 0–100 %), a boolean a `ui-toggle`, a choice
  a `ui-segmented` of its `options`. A toggle in `INVERTED` (`muted`) carries
  `inverted: true` and shows on while its value is false — Sound is on while
  not muted; `bindToggle` flips both ways.
- `settingControlHtml(key, value?, { labelledBy? })` — the control's kit
  markup, root carrying `data-setting="<key>"`, ids `set-<key>`; with
  `labelledBy` a choice shows no label of its own and is named by that
  element.
- `settingsPageHtml()` — the four sections in a `ui-grid` (a control whose
  label is its section's title, Theme, is named by the section heading) and
  an empty Bindings panel (`#settings-bindings`); `bindingsSectionHtml(glyphs?)` — one
  `dl.controls` per mode and input device.
- `bindSettingControls(elements, store, { onUserChange? })` → unbind. Each
  element is a control root carrying `data-setting`; it shows the store's
  value (the loaded one and every change made elsewhere) and writes the
  player's change at once, then calls `onUserChange(key)`. An unknown setting
  or a root that is no slider, toggle or segmented throws.

Bindings (`js/settings/bindings.js`)
- `BINDING_MODES` (`classic-2d`, `3d`), `BINDING_DEVICES` (`keyboard`,
  `controller`), `BINDINGS[mode][device]` — frozen `[input, action]` rows.
  In row text `[Key]` is a keyboard key and `{name}` a controller button by
  its standard-mapping name (`a`, `b`, `x`, `y`, `lb`, `rb`, `lt`, `rt`,
  `start`, `back`). Both modes list `[F2]` and `{start} + {y}` as Restart.
- `bindingRows(mode, device)` — throws on an unknown mode or device.
- `bindingsListHtml(rows, glyphs = GLYPHS.generic)` — `<dt>`/`<dd>` pairs,
  keys as `<kbd>`, buttons as `<kbd class="pad">` in the given glyphs, text
  escaped.
- `bindingsHtml(mode, device, glyphs?)` — the bindings component: that
  mode's rows for that device.
- `HUD_STRIP`, `HINT_STRIP` — `[mode][device]` rows in the same syntax;
  `hudStripHtml(mode, device, glyphs?, { muted })` — one `.kbd-hint` per key
  or button the mode binds on that device (`sound` reads "sound on" /
  "sound off"; F is not listed in Classic 2D, where it flags);
  `hintStripHtml(mode, device, glyphs?)` — the first-use strip, items joined
  by " · ".
- `HELP_FOOT[mode][device]`, `helpFootHtml(mode, device, glyphs?)` — the H
  panel's foot line, naming the release rule in 3D only.
- `HINT_TEXT` (`autoHide`, `aimHint`), `hintText(name, device, glyphs?)` —
  a one-time hint as plain text, keys and buttons by name.
- `createActiveDevice({ onChange })` → `current` (`'keyboard'` |
  `'controller'`), `input('pad' | 'keyboard' | 'pointer')`,
  `connected(on)`: the controller while the last input came from a
  connected controller, otherwise the keyboard and mouse (also on
  disconnect); `onChange(device)` once per change.

## INTERNAL PATTERNS

- **Start-up order.** `js/theme.js` runs before first paint and reads the
  theme straight from the saved document (`localStorage` key
  `ms3d:doc:settings`, `{ version, data }`, version 1 only), so a Dark player
  never sees Light. `js/main.js` then creates the store, starts `load()`,
  calls `applySettings` and `bindSettingControls`, and awaits the load before
  `showMainMenu()`; the load's notification applies every value once.
- **One owner per value.** The store is the only holder: the sound module
  starts at its own defaults and keeps no copy anywhere, the camera's fields
  are written only by `applyLook`, and the theme script reads the document
  but never writes it.
- **Fullscreen follows the browser.** Setting it calls `enter()` / `exit()`
  synchronously, inside the gesture that set it, only when the browser is in
  the other state. On `fullscreenchange`, and when `enter()` or `exit()`
  throws or rejects, the store is set to whether `doc.fullscreenElement` is
  set. F in play sets the setting; `js/main.js`'s `enterFullscreen` also
  takes Keyboard Lock.
- **Resolution.** `js/main.js`'s `applyPixelRatio(n)` remembers the cell
  count of the board shown (game or menu demo) and calls `pixelRatioFor`
  with the current setting; the resolution applier re-runs it on change.
- **Carry-over.** Only when `storage.load` returns no document and reported
  no load trouble: each legacy key is read the old owner's way (sensitivity
  `parseFloat`, volume `Number`, both clamped; booleans true only on `'1'`;
  a throwing reader counts as no value), then the whole document is saved.
  The legacy keys themselves are never written or deleted.
- **Controls are bound by `data-setting`.** The page's generated controls,
  the pause card's sensitivity, invert-Y and volume shortcuts (the first two
  shown only on a 3D game's pause card) and the main menu's volume slider
  all carry `data-setting`, and one
  `bindSettingControls(document.querySelectorAll('[data-setting]'), …)` in
  `js/main.js` binds them, so every copy shows the same value. A slider's
  `data-scale` converts its units to the stored value.
- **Bindings are one table.** The Settings page shows every mode × device;
  the pause card, the H panel and the HUD strip show the active mode's rows
  for the active device, the main menu's Controls panel the rows of its
  Classic 2D | 3D tab for the active device, and the hint strip its mode's
  strip — controller buttons always in the connected pad's glyphs. A row's
  text is edited in `BINDINGS` (`HUD_STRIP`, `HINT_STRIP`, `HELP_FOOT`,
  `HINT_TEXT` for those surfaces), never in markup, so the later rebinding
  feature reaches every surface through this source.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  settings, their ranges and defaults, the store's read/write/subscribe and
  failure contracts, the start-up order, the carry-over and the page.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the theme applier the theme setting drives.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioned document the store saves.

## CROSS-REFERENCES

- [app-shell.md](app-shell.md) — wiring in `js/main.js`, the Settings screen
  in the router, `UI.showSettings`, the pause-card shortcuts, the theme
  script.
- [platform.md](platform.md) — `register`/`load`/`save` and the browser key
  format `js/theme.js` reads.
- [audio.md](audio.md) — `setVolume`, `setMuted`, the defaults the module
  starts with.
- [rendering.md](rendering.md) — `BoardRenderer.setPixelRatio`.
- [input.md](input.md) — `FlyCamera.sensitivity` / `invertY`; the controller
  glyphs (`js/gamepad.js` `GLYPHS`) the bindings list draws.
- [testing.md](testing.md) — `tests/settings-store.test.mjs`,
  `tests/settings-appliers.test.mjs`, `tests/settings-page.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding a setting: add it to `SCHEMA`, a section in `SETTINGS_SECTIONS`, a
  label, its applier, and a `SLIDERS` entry in `page.js` for a number; a
  setting that must change the stored shape bumps `SETTINGS_VERSION` with an
  upgrade step.
- Changing load, carry-over or save-failure behaviour: `doLoad`,
  `readLegacy` and `persist` in `store.js`.
- Fullscreen state drifting from the browser: `applyFullscreen` and the
  `enterFullscreen` / `exitFullscreen` pair in `js/main.js`.
- A control not updating or not saving: the per-kind binders in `page.js`
  (`bindSlider`, `bindToggle`, `bindChoice`).
- Changing a mode's listed bindings, a strip's or hint's words, or adding a
  mode or device: `BINDINGS`, the strip and hint tables and the row-text
  syntax in `bindings.js`.
