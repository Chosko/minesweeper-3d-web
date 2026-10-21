# App shell — theme at run time: pre-paint, applier, token reader

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
How the active theme is chosen and changed while the page runs: the
pre-paint script that puts the stored theme on the first paint, the
run-time theme applier that takes over from it and switches themes, and
the token reader that hands Canvas code the active theme's tokens. The
registry, the theme folders and the stylesheets they load are
[app-shell-themes.md](app-shell-themes.md).

| File | Responsibility |
| ---- | -------------- |
| `js/theme.js` | classic pre-paint script: maps the stored theme, inserts its stylesheet render-blocking, sets root `data-theme`, exposes `globalThis.msThemeBoot` |
| `js/themes/applier.js` | the run-time theme applier: takes over from `js/theme.js`, loads and switches themes, hands the board module to subscribers |
| `js/tokens.js` | token reader for consumers that cannot read stylesheets, chiefly Canvas |

## PUBLIC API

`js/theme.js` — `globalThis.msThemeBoot` `{id, fellBackFrom, link, ready}`
(`ready` resolves once the active stylesheet loaded, rejects when the
default's fails); `globalThis.msThemePrePaint` for tests (`STYLESHEETS`,
`DEFAULT_THEME`, `themeIdOf`, `readStoredTheme`, `boot`).

`js/themes/applier.js` — `themeApplier()` (the page's one applier, over
`msThemeBoot`); `createThemeApplier({doc, boot, base?, importModule?,
lookup?, onError?})` → `current()`, `board()` (the active board module),
`start({notice?})`, `setTheme(value)`, `onThemeChange(listener)` →
unsubscribe, `listener(id, boardModule)` after start-up and after each
switch (a throwing listener does not stop the others); `themeIdFor(value)`
(a value the settings format step retires, or an unknown id → the default),
`SITE_ROOT`, `START_FALLBACK`, `SWITCH_FAILED`.

`js/tokens.js` — the active theme's computed tokens on the root, no copy
held: `token(name)` (with or without `--`; unknown →
`FALLBACK_COLOR`, logged once only in development),
`onThemeChange(listener)` (the applier's), `createTokenReader({root,
getStyle, theme, dev?, log?})`.

## INTERNAL PATTERNS

- **Pre-paint.** `js/theme.js` runs synchronously in `<head>`;
  `readStoredTheme` reads the settings document (`ms3d:doc:settings`, at
  any version the store has written) straight from `localStorage`, and
  `themeIdOf` maps it as `themeIdFor` does — a value the store's format
  step retires ([settings.md](settings.md)) or an unknown or absent id → the
  default. It cannot import the registry, so `STYLESHEETS` mirrors its
  id → stylesheet table (`tests/theme.test.mjs` keeps the two equal). A non-default
  stylesheet that fails falls back to the default here. It never writes:
  the settings store owns the preference.
- **Switching.** `js/main.js` calls `start()` once. A switch appends the new
  stylesheet, imports its board module and loads its fonts
  (`document.fonts.load`), and only then flips `data-theme` and removes the
  old `<link>`. Removing a stylesheet makes Chromium rebuild every
  `@font-face` face unloaded, so the switch loads every font file the new
  theme declares again, from the cache, and only then notifies — a failure
  of that second load goes to `onError` and the switch still completes.
  Switches queue, each after the previous one settles; `setTheme` of the
  active theme does nothing.
- **Failure contract.** A non-default theme that fails at start-up falls
  back to the default and `notice(START_FALLBACK)` tells the player once (a
  toast in `js/main.js`); a failed switch keeps the current theme, rejects
  and tells `SWITCH_FAILED` once; the default failing rejects `start()` and
  `js/main.js` shows index.html's `#fatal-card`.

## DOMAIN DEPENDENCIES

- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the applier and its failure contract.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the token reader.

## CROSS-REFERENCES

- [app-shell-themes.md](app-shell-themes.md) — the registry the applier
  looks themes up in, and the stylesheets it loads.
- [app-shell-board-module.md](app-shell-board-module.md) — the board
  module the applier imports and hands to its listeners.
- [settings.md](settings.md) — the theme setting driving `setTheme` and the
  settings document `readStoredTheme` reads;
  [settings-appliers.md](settings-appliers.md) — the theme applier's
  caller; [settings-page.md](settings-page.md) — the theme list.
- [testing.md](testing.md) — `tests/theme.test.mjs` (the pre-paint
  script, the applier, the token reader).

## WHEN TO READ THE SOURCE

- Changing how start-up reads the stored theme (`readStoredTheme`, kept in
  step with the settings document's key and versions), or the switch order
  and failure handling (`switchTo` and `start` in `js/themes/applier.js`).
