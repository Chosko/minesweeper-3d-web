# Settings — page and control binder

## OVERVIEW

The Settings page generated from the schema ([settings.md](settings.md)) and
the binder that ties every setting control in the game to the store.
DOM-free: markup is returned as text and the binders touch only the
elements they are handed. `page.js`'s head comment states the full
contract. The Data panel's Reset all data is
[settings-reset.md](settings-reset.md).

| File | Responsibility |
| --- | --- |
| `js/settings/page.js` | page markup from the schema, the bindings section, the Data panel, the control binder for the page, the pause card and the component gallery's theme list |

## PUBLIC API

Page (`js/settings/page.js`)
- `SETTINGS_SECTIONS` — Controls (`lookSensitivity`, `invertY`, `camera`
  "Camera" Fly | Orbit, `confirmRestart`), Graphics (`fullscreen`,
  `renderResolution`, `boardScale` "2D board scale", `aimReadout` "3D
  neighbour count", `fieldOfView` "Field of view"), Theme (`theme`), Audio
  (`muted`, `volume`); `SETTING_LABELS` (`muted` reads Sound),
  `CHOICE_LABELS`; `SETTINGS_COLUMNS` — the widest window's columns, each a
  stack of section ids (Controls and Audio, Graphics and Theme, Bindings
  and Data); `SETTINGS_LAYOUTS` — the columns by window size, widest
  first, each `{ media, columns }` (three stacks on the widest windows,
  Controls, Graphics, Audio beside Theme, Data, Bindings from the kit
  breakpoint, one stack in the phone's order below it);
  `SETTING_NOTES` — the settings noted "3D" under their name.
- `settingControl(key, { themes? })` → `{ key, kind: 'slider' | 'toggle' | 'segmented',
  label, … }` by schema type; `SLIDERS` adds a number's step, format,
  scale (volume shows 0–100 %) and unit (the field of view's `°`, carried
  as `data-unit`); a toggle in `INVERTED` (`muted`) shows on
  while its value is false; the theme is a segmented control with `list:
  true` and one option per entry of `themes` (default `THEMES`, the
  parameter a test feeds a longer list through), rendered as a
  `ui-segmented--list` of cards, each leading with a
  `.ui-segmented__swatch` and ending in the `check` icon the chosen card
  shows.
- `settingControlHtml(key, value?, { labelledBy?, themes? })` — the control's kit
  markup, root carrying `data-setting="<key>"`, ids `set-<key>`.
- `settingsPageHtml()` — one `ui-columns` (`#settings-columns`) of the
  `SETTINGS_COLUMNS`, each a `ui-column` stacking its sections (a
  `ui-panel` with `data-section`, under its `ui-section-label`; each
  setting a `ui-row` of its name and its control): the four setting
  sections, the Bindings panel (the Mode and Device
  choices `#set-bind-mode`, `#set-bind-device` over the list
  `#settings-bindings`, filled by `bindingsSectionHtml`), and the Data
  panel (`#settings-data`, its parts stacked in `#set-data-body`: first
  the export — its muted line `#set-export-text` (`EXPORT_LINE`) and the
  small buttons `#set-export-csv` and `#set-export-json` with their
  download icons in `#set-export-actions`, bound in `js/main.js` by
  `bindExportActions` (no note line) over `RECORDS_EXPORT` and
  refreshed on each show of the page ([records-screen-view.md](records-screen-view.md))
  — then button `#set-reset` with its trash icon, under it the hidden err note `#set-reset-note`,
  and the hidden confirm box `#set-reset-confirm` with `#set-reset-yes`
  (its trash icon) beside `#set-reset-no`);
  `bindingsSectionHtml(glyphs?, camera?, {mode?, device?})` — the
  controls list `dl.ui-controls` of one mode's full rows for one device (default Classic 2D and the
  keyboard; a device the mode does not list falls back to its first), 3D's
  rows for the Camera setting's `camera`; `UI` redraws it on each Mode or
  Device change.
- `settingsColumnsFor(matches)` → the columns of the first
  `SETTINGS_LAYOUTS` entry whose media `matches(media)` holds;
  `placeSettingsSections(root, columns)` moves `#settings-columns`'s
  sections into one `ui-column` per stack (a section none lists joins the
  last; a focused control keeps the focus); `bindSettingsLayout(root, {
  matchMedia? })` → unbind places them for the window now and on every
  change of a layout's media — `UI` binds it once the page is generated.
- `bindResetPanel` — the Data panel's confirmation
  ([settings-reset.md](settings-reset.md)).
- `bindSettingControls(elements, store, { onUserChange?, theme?,
  themeSheet? })` → unbind. Each root carrying `data-setting` shows the
  store's value (loaded and every change made elsewhere) and writes the
  player's change at once; a slider's fill follows its value through the
  kit's `bindSliderFill`. Given the theme applier (`theme`), the theme list
  shows the active theme instead and a pick calls `setTheme(id)`, saving the
  setting once the switch resolves, a failed one putting the selection back;
  each swatch is filled from `themeSheet(entry)` → Promise of the
  stylesheet's text (default: fetched from the site root), a failure leaving
  it blank. The component gallery shows the theme list through
  `settingControlHtml` and this binder with the applier and a store that
  saves nothing ([app-shell-kit.md](app-shell-kit.md)).
- `SWATCH_TOKENS` (ground, head, accent fill, blue, teal),
  `themeSwatchColors(cssText, id)` → `{ token: value }` from the theme's
  `:root[data-theme="<id>"]` token block, `swatchBackground(colors)` → a
  stripe per token.

## INTERNAL PATTERNS

- **The page** (`css/components.css` head comment, *Settings page*) is a
  `ui-frame` inset on the backdrop at each window step's canvas size
  (`css/style.css`), Back (`#settings-back`, "Main menu", "Back" on a
  phone) in its head and no foot. The sections stand in independent
  stacks, one `ui-column` each, placed for the window by
  `bindSettingsLayout`, so no section shares a grid row with its
  neighbour; each setting row is ruled above by the theme. On a phone the
  Device choice spans the panel, each option wrapping its label, and the
  exports stack.
- **Controls are bound by `data-setting`.** The page's generated controls
  and the pause card's Sound, volume, sensitivity and invert-Y shortcuts
  (the last two only on a 3D game's pause card) all carry `data-setting`,
  and one
  `bindSettingControls(document.querySelectorAll('[data-setting]'), …)` in
  `js/main.js` binds them (a `ui-switchrow` like a `ui-toggle`), so every
  copy shows the same value. A slider's
  `data-scale` converts its units to the stored value.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  page, its sections and the Data panel.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the page in the frame and its phone arrangement.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme list, and its place in the component gallery.

## CROSS-REFERENCES

- [settings.md](settings.md) — the schema the page is generated from and the
  store the binder writes.
- [settings-bindings.md](settings-bindings.md) — the rows the Bindings panel
  shows.
- [app-shell-navigation.md](app-shell-navigation.md) — the Settings screen
  in the router; [app-shell-ui.md](app-shell-ui.md) — `UI.showSettings`, the
  pause-card shortcuts.
- [settings-reset.md](settings-reset.md) — Reset all data behind the Data
  panel.
- [app-shell-kit.md](app-shell-kit.md) — the component gallery, which shows
  the theme list.
- [testing.md](testing.md) — `tests/settings-page.test.mjs`.

## WHEN TO READ THE SOURCE

- A control not updating or not saving: the per-kind binders in `page.js`
  (`bindSlider`, `bindToggle`, `bindChoice`).
- Adding a control kind or a section, or changing the Data panel's markup.
