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
| `js/settings/page.js` | page markup from the schema, the bindings section, the Data panel and its confirmation's binder, the control binder for the page, pause card and main menu |
| `js/settings/reset.js` | Reset all data: clears every document, replay blob and reset key, then reloads; reports what could not be deleted |

## PUBLIC API

Page (`js/settings/page.js`)
- `SETTINGS_SECTIONS` — Controls (`lookSensitivity`, `invertY`,
  `confirmRestart`), Graphics (`fullscreen`, `renderResolution`,
  `boardScale` "2D board scale", `aimReadout` "3D neighbour count",
  `fieldOfView` "Field of view"), Theme
  (`theme`), Audio (`muted`, `volume`); `SETTING_LABELS` (`muted` reads
  Sound), `CHOICE_LABELS`.
- `settingControl(key)` → `{ key, kind: 'slider' | 'toggle' | 'segmented',
  label, … }` by schema type; `SLIDERS` adds a number's step, format,
  scale (volume shows 0–100 %) and unit (the field of view's `°`, carried
  as `data-unit`); a toggle in `INVERTED` (`muted`) shows on
  while its value is false.
- `settingControlHtml(key, value?, { labelledBy? })` — the control's kit
  markup, root carrying `data-setting="<key>"`, ids `set-<key>`.
- `settingsPageHtml()` — one `ui-columns` composition: the four sections,
  each a column, then across the width (`ui-columns__span`) the Bindings
  panel, whose empty `#settings-bindings` is itself a `ui-columns`, and the
  Data panel (`#settings-data`: warning line
  `#set-reset-note`, button `#set-reset`, hidden confirmation
  `#set-reset-confirm` with `#set-reset-yes` / `#set-reset-no`);
  `bindingsSectionHtml(glyphs?)` — one `dl.controls` per mode and device.
- `bindResetPanel({ open, panel, yes, no, note }, { reset })` → `{ isOpen,
  close, clear }`: the confirmation opens with focus on Cancel; confirming
  disables both buttons and calls `reset()` once, a failure's message
  replacing the confirmation on the warning line; `close()` → false when
  closed, true and nothing done while the reset runs.
- `bindSettingControls(elements, store, { onUserChange? })` → unbind. Each
  root carrying `data-setting` shows the store's value (loaded and every
  change made elsewhere) and writes the player's change at once.

Reset (`js/settings/reset.js`)
- `RESET_KEYS` — `LEGACY_KEYS`' four keys and `FIRST_USE_LEGACY_KEY`
  (`ms3d.hintH.done`); `ms3d.custom`, `ms3d.best.*` and `ms3d.lastPreset`
  stay.
- `createReset({ storage, blobStore, legacy?, waitFor?, reload })` →
  `{ run }`; `run()` → `{ ok: true }` after `reload()`, or `{ ok: false,
  failed, message }` (`failed` from `'documents'`, `'replays'`, `'keys'`)
  with no reload. Never rejects. `failureMessage(failed)` — that message.

## INTERNAL PATTERNS

- **Controls are bound by `data-setting`.** The page's generated controls,
  the pause card's sensitivity, invert-Y and volume shortcuts (the first two
  only on a 3D game's pause card) and the main menu's volume slider all
  carry `data-setting`, and one
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
