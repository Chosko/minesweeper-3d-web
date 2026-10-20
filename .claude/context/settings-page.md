# Settings — page, control binder, Reset all data

## OVERVIEW

The Settings page generated from the schema ([settings.md](settings.md)), the
binder that ties every setting control in the game to the store, and the
Data panel with Reset all data, which clears everything the game keeps and
reloads into a fresh profile. DOM-free: markup is returned as text and the
binders touch only the elements they are handed. `page.js`'s and
`reset.js`'s head comments state the full contracts.

| File | Responsibility |
| --- | --- |
| `js/settings/page.js` | page markup from the schema, the bindings section, the Data panel and its confirmation's binder, the control binder for the page and the pause card |
| `js/settings/reset.js` | Reset all data: clears every document, replay blob and reset key, then reloads; reports what could not be deleted |

## PUBLIC API

Page (`js/settings/page.js`)
- `SETTINGS_SECTIONS` — Controls (`lookSensitivity`, `invertY`, `camera`
  "Camera" Fly | Orbit, `confirmRestart`), Graphics (`fullscreen`,
  `renderResolution`, `boardScale` "2D board scale", `aimReadout` "3D
  neighbour count", `fieldOfView` "Field of view"), Theme (`theme`), Audio
  (`muted`, `volume`); `SETTING_LABELS` (`muted` reads Sound),
  `CHOICE_LABELS`; `SETTINGS_COLUMNS` — the widest window's columns, each a
  stack of section ids (Controls and Audio, Graphics and Theme, Bindings
  and Data); `SETTING_NOTES` — the settings noted "3D" under their name;
  `CONTROLS_ACTION`.
- `settingControl(key, { themes? })` → `{ key, kind: 'slider' | 'toggle' | 'segmented',
  label, … }` by schema type; `SLIDERS` adds a number's step, format,
  scale (volume shows 0–100 %) and unit (the field of view's `°`, carried
  as `data-unit`); a toggle in `INVERTED` (`muted`) shows on
  while its value is false; the theme is a segmented control with `list:
  true` and one option per entry of `themes` (default `THEMES`, the
  parameter a test feeds a longer list through), rendered as a
  `ui-segmented--list` whose options each lead with a
  `.ui-segmented__swatch`.
- `settingControlHtml(key, value?, { labelledBy?, themes? })` — the control's kit
  markup, root carrying `data-setting="<key>"`, ids `set-<key>`.
- `settingsPageHtml()` — one `ui-columns` (`#settings-columns`) of the
  `SETTINGS_COLUMNS`, each a `ui-column` stacking its sections (a
  `ui-panel` with `data-section`, under its `ui-section-label`; each
  setting a `ui-row` of its name and its control): the four setting
  sections, Controls ending in the Controls action `#set-controls` (it
  opens the controls reference), the Bindings panel (the Mode and Device
  choices `#set-bind-mode`, `#set-bind-device` over the list
  `#settings-bindings`, filled by `bindingsSectionHtml`), and the Data
  panel (`#settings-data`: first the export — its line
  `#set-export-text` (`EXPORT_LINE`), the nothing-to-export line
  `#set-export-note`, buttons `#set-export-csv` and `#set-export-json`,
  bound in `js/main.js` by `bindExportActions` over `RECORDS_EXPORT` and
  refreshed on each show of the page ([records-screen-view.md](records-screen-view.md))
  — then button `#set-reset`, under it the hidden err note `#set-reset-note`,
  and the hidden confirm box `#set-reset-confirm` with `#set-reset-yes`
  (its trash icon) beside `#set-reset-no`);
  `bindingsSectionHtml(glyphs?, camera?, {mode?, device?})` — the
  `dl.controls` of one mode for one device (default Classic 2D and the
  keyboard; a device the mode does not list falls back to its first), 3D's
  rows for the Camera setting's `camera`; `UI` redraws it on each Mode or
  Device change.
- `bindResetPanel({ open, panel, yes, no, note }, { reset })` → `{ isOpen,
  close, clear }`: the confirmation opens with focus on Cancel; confirming
  disables both buttons and calls `reset()` once, a failure closing the
  confirmation and writing its message in the err note (`setNote`); `close()` → false when
  closed, true and nothing done while the reset runs.
- `bindSettingControls(elements, store, { onUserChange?, theme?,
  themeSheet? })` → unbind. Each root carrying `data-setting` shows the
  store's value (loaded and every change made elsewhere) and writes the
  player's change at once; a slider's fill follows its value through the
  kit's `bindSliderFill`. Given the theme applier (`theme`), the theme list
  shows the active theme instead and a pick calls `setTheme(id)`, saving the
  setting once the switch resolves, a failed one putting the selection back;
  each swatch is filled from `themeSheet(entry)` → Promise of the
  stylesheet's text (default: fetched from the site root), a failure leaving
  it blank.
- `SWATCH_TOKENS` (ground, surface, accent fill, ink),
  `themeSwatchColors(cssText, id)` → `{ token: value }` from the theme's
  `:root[data-theme="<id>"]` token block, `swatchBackground(colors)` → a
  stripe per token.

Reset (`js/settings/reset.js`)
- `RESET_KEYS` — `LEGACY_KEYS`' four keys and `FIRST_USE_LEGACY_KEY`
  (`ms3d.hintH.done`); `ms3d.custom`, `ms3d.best.*` and `ms3d.lastPreset`
  stay.
- `createReset({ storage, blobStore, legacy?, waitFor?, reload })` →
  `{ run }`; `run()` → `{ ok: true }` after `reload()`, or `{ ok: false,
  failed, message }` (`failed` from `'documents'`, `'replays'`, `'keys'`)
  with no reload, `message` always `RESET_FAILURE`. Never rejects.

## INTERNAL PATTERNS

- **The page** (`css/components.css` head comment, *Settings page*) is a
  `ui-frame` on the backdrop, Back ("Main menu", `#settings-back`) in its
  head and no foot. The sections sit in three columns on the largest
  windows, two from the kit breakpoint and one below it, regrouped by
  placement alone (`css/style.css`); on a phone the Device choice spans the
  panel, each option wrapping its label.
- **Controls are bound by `data-setting`.** The page's generated controls
  and the pause card's Sound, volume, sensitivity and invert-Y shortcuts
  (the last two only on a 3D game's pause card) all carry `data-setting`,
  and one
  `bindSettingControls(document.querySelectorAll('[data-setting]'), …)` in
  `js/main.js` binds them, so every copy shows the same value. A slider's
  `data-scale` converts its units to the stored value.
- **Reset is clear, then reload.** `run()` awaits `waitFor()` (a rejection
  ignored), then clears storage, deletes every blob `blobStore.list()`
  names and removes `RESET_KEYS`, each part attempted whatever failed
  before it. The fresh profile comes from the reload: every owner loads its
  document at start-up, so no store has a reset of its own.
- **Reset wiring.** `js/main.js` builds `RESET` with `storage`, `blobStore`,
  `waitFor` the replay library's `load()` then `settled()` (so no owner
  saves a cleared document back), and a `reload` that sets the leave-page
  guard's `reloading` and calls `location.reload()`; `UI`'s `onResetAll`
  runs it.
- **Back closes the confirmation first.** `UI.closeResetConfirm()` (→ false
  when none is open, or the page is hidden) comes after `closeControls` and
  `closeConfirm` in `shellBack` and `historyBack`, so Esc, the controller's
  Back and the browser's Back close it before leaving the page;
  `showSettings` opens the page with it closed.

## DOMAIN DEPENDENCIES

- [../domain/features/settings.md](../domain/features/settings.md) — the
  page, its sections and the Data panel.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — clearing every document and the blob store.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the page in the frame and its phone arrangement.

## CROSS-REFERENCES

- [settings.md](settings.md) — the schema the page is generated from and the
  store the binder writes.
- [settings-bindings.md](settings-bindings.md) — the rows the Bindings panel
  shows.
- [app-shell-navigation.md](app-shell-navigation.md) — the Settings screen
  in the router; [app-shell-ui.md](app-shell-ui.md) — `UI.showSettings`, the
  pause-card shortcuts; [app-shell-pause.md](app-shell-pause.md) — the
  leave-page guard.
- [platform.md](platform.md) — `storage.clear()` and the blob store.
- [replay-library.md](replay-library.md) — the replay library `waitFor` waits on.
- [testing.md](testing.md) — `tests/settings-page.test.mjs`,
  `tests/settings-reset.test.mjs`.

## WHEN TO READ THE SOURCE

- A control not updating or not saving: the per-kind binders in `page.js`
  (`bindSlider`, `bindToggle`, `bindChoice`).
- Adding a control kind or a section, or changing the Data panel's markup.
- Adding something the game keeps outside platform storage and the blob
  store, which Reset all data must also delete: `RESET_KEYS` and `run` in
  `reset.js`.
