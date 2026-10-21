# App shell — themes, stylesheets, tokens, deploy files

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The theme registry, each theme's folder, the base and theme stylesheets and
their head order, the pre-paint script, the run-time theme applier, the
token reader and the GitHub Pages files. The board module a theme carries
and its hand-off to both boards are
[app-shell-board-module.md](app-shell-board-module.md); the component kit
the stylesheets style is [app-shell-kit.md](app-shell-kit.md).

| File | Responsibility |
| ---- | -------------- |
| `css/tokens.css` | the structural tokens only (base stylesheet): `--space-*`, `--z-*`, `--font-numeric-tabular`; nothing per-theme |
| `js/themes/registry.js` | the theme registry (DOM-free): `THEMES` in catalogue order, the default id, the lookup; the one place a theme is registered |
| `themes/<id>/` | one theme: `theme.css` (its stylesheet: tokens, every catalogued part and state, `@font-face`, DOM animation, every rule under `:root[data-theme="<id>"]`), `board.js` (its board module), `fonts/` (its `woff2` files and their licences) |
| `js/theme.js` | classic pre-paint script: maps the stored theme, inserts its stylesheet render-blocking, sets root `data-theme`, exposes `globalThis.msThemeBoot` |
| `js/themes/applier.js` | the run-time theme applier: takes over from `js/theme.js`, loads and switches themes, hands the board module to subscribers |
| `js/tokens.js` | token reader for consumers that cannot read stylesheets, chiefly Canvas |
| `404.html`, `CNAME`, `.nojekyll` | GitHub Pages: the not-found page (the fatal card's composition, "Page not found." and a link to `/`; the base and default theme stylesheets from the site root, no script, no remote file), `minesweeper3d.chosko.com`, files served as-is |

## PUBLIC API

`js/themes/registry.js` — `THEMES` (frozen entries `{id, name, stylesheet,
boardModule, fonts: [{family, licence, files: [{weight, style, path}]}],
order, demo}`, paths from the site root), `DEFAULT_THEME_ID`
(`joyful-tiles`), `themeById(id)` (the default entry for an unknown or
absent id), `isRegisteredTheme(id)`; `registerTheme(entry)` is test-only — a
fixture theme found by the lookup and kept out of `THEMES`.

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

- **Base and theme stylesheets.** The base stylesheets (`css/tokens.css`,
  `css/components.css`, `css/style.css`) carry structure only: no colour,
  font family, border, radius, shadow, transition or animation value, the
  `@media (prefers-reduced-motion: reduce)` rule in `css/style.css` the one
  exception. Every visual value is the theme stylesheet's, every rule of it
  scoped to `:root[data-theme="<id>"]`, with no `prefers-reduced-motion`
  rule and no `!important` animation or transition, and fonts only from the
  theme's own files.
- **Styling values.** A new colour, font, radius, shadow or motion value is
  a token each registered theme declares in its `theme.css`, read by
  `var(--…)`; one read outside the theme stylesheet — the base stylesheets,
  or a script through the token reader, like the replay viewer's
  `--color-replay-*` — joins `REQUIRED_TOKENS`
  ([app-shell-kit.md](app-shell-kit.md)). A new spacing step or z-layer
  goes into `css/tokens.css`. `tests/tokens.test.mjs`,
  `tests/components.test.mjs` and `tests/theme-conformance.test.mjs` reject
  a custom property declared in another base stylesheet, a read of an
  undeclared token and a required token a theme lacks. Fixed layers use the
  `--z-*` tokens.
- ***Joyful tiles*' tokens** are its canvas's J-Tokens block, values
  included (`tests/tokens.test.mjs`): the board tokens (`--color-tile-*`,
  `--color-board-frame`, `--color-number-1`…`-8`) hold the board module's
  values, read only where a screen draws a board colour as a token (the 2D
  board view's ground and cursor ring, the aimed-cell readout's cube); the
  scene tokens (`--color-scene-zenith`, `-horizon`, `-nadir`, `-ink`) are
  the board module's sky stops and the ink on them, which the scene panel
  draws; its body sets the base text in `--font-weight-regular`. A board
  token the canvas lacks is not declared once nothing reads it; the
  scrolling board's marks, the replay pointer's outline, Show 3BV's tints
  and `--board-frame-radius` stay while the board view, the replay viewer
  and the board frame read them.
- **Head order.** `index.html` loads `css/tokens.css`,
  `css/components.css` and `css/style.css`, the gallery only the first two;
  each then runs `js/theme.js`, which appends the theme's `<link
  blocking="render" data-theme-sheet>` after them. No scripted page links a
  theme stylesheet itself; only what a page without JavaScript reads names
  the default theme — `index.html`'s root `data-theme`, which the script
  replaces, and the default's stylesheet inside its `<noscript>` — and
  `404.html`, which runs no script, links the base and default theme
  stylesheets.
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
  — the registry, the theme contract, base and theme stylesheets, fonts,
  the applier and its failure contract, conformance tests, the Settings
  theme list and the component gallery per theme.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token names, the contrast contract, the token reader.

## CROSS-REFERENCES

- [app-shell-board-module.md](app-shell-board-module.md) — the board
  module the applier imports and hands to its listeners.
- [app-shell-kit.md](app-shell-kit.md) — the catalogue each theme
  stylesheet styles, `REQUIRED_TOKENS`, and the gallery that renders it
  under any registered theme, its theme list switching it through the
  applier.
- [settings.md](settings.md) — the theme setting driving `setTheme` and the
  settings document `readStoredTheme` reads;
  [settings-page.md](settings-page.md) — the theme list.
- [app-shell-markup.md](app-shell-markup.md) — `index.html`'s head and its
  `<noscript>`, the fatal card.
- [testing.md](testing.md) — `tests/theme-registry.test.mjs`,
  `tests/theme-conformance.test.mjs`, `tests/tokens.test.mjs`,
  `tests/theme.test.mjs` (the pre-paint script, the applier, the token
  reader), the fixture themes under `tests/fixtures/themes/`.

## WHEN TO READ THE SOURCE

- Adding or renaming a token: the theme's `theme.css` and
  `REQUIRED_TOKENS`.
- Adding a theme: `THEMES`, the `STYLESHEETS` mirror in `js/theme.js` and
  the theme's folder; the conformance suite says what is missing.
- Changing how start-up reads the stored theme (`readStoredTheme`, kept in
  step with the settings document's key and versions), or the switch order
  and failure handling (`switchTo` and `start` in `js/themes/applier.js`).
- Changing deploy behaviour (custom domain, the not-found page, vendored
  three.js path).
