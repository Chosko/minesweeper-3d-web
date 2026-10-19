# App shell — component kit, themes, tokens, scene palette, deploy files

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The screens' markup in `index.html` and the shell stylesheet are
[app-shell-markup.md](app-shell-markup.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the component kit's structure (base stylesheet): `ui-*` classes, layout, sizes, the hidden default of every decoration slot; its head comment is the catalogue (element, role, accessible name, markup pattern, states, focus contract, screens built from them) |
| `js/ui/kit-catalogue.js` | the kit catalogue as data (DOM-free): every component and composition, its parts, each interactive part's states as the selectors a theme styles, its decoration slots; `CONTRAST_ROLES`; `REQUIRED_TOKENS`, the token set every theme declares |
| `js/ui/components.js` | the kit's behaviour helpers; imports nothing, binders touch only the elements handed in, so it runs under Node with stub elements |
| `dev/components.html` | the kit gallery (development only): every catalogued component in every state (`data-force` previews) and every decoration slot, the overlay bar, the results layout `#g-results`, under the theme picked in `#g-theme` or named by `?theme=<id>` (unknown → the default) |
| `css/tokens.css` | the structural tokens only (base stylesheet): `--space-*`, `--z-*`, `--font-numeric-tabular`; nothing per-theme |
| `js/themes/registry.js` | the theme registry (DOM-free): `THEMES` in catalogue order, the default id, the lookup; the one place a theme is registered |
| `themes/<id>/` | one theme: `theme.css` (its stylesheet: tokens, every catalogued part and state, `@font-face`, DOM animation, every rule under `:root[data-theme="<id>"]`), `board.js` (its board module), `fonts/` (its `woff2` files and their licences) |
| `js/theme.js` | classic pre-paint script: maps the stored theme, inserts its stylesheet render-blocking, sets root `data-theme`, exposes `globalThis.msThemeBoot` |
| `js/themes/applier.js` | the run-time theme applier: takes over from `js/theme.js`, loads and switches themes, hands the board module to subscribers |
| `js/tokens.js` | token reader for consumers that cannot read stylesheets, chiefly Canvas |
| `js/shell/scene-palette.js` | the 3D scene's themed sky from the `--color-scene-*` tokens |
| `404.html`, `CNAME`, `.nojekyll` | GitHub Pages: redirect to `/`, `minesweeper3d.chosko.com`, files served as-is |

## PUBLIC API

`js/ui/components.js`
- `formatOverlayTime(seconds)` (three digits, stops at `'999'`),
  `formatMineCount(minesLeft)` (kept at -99), `mineCounterDigits(mines)`
  (at least 3; past 3 `UI.setBoard` / `setBoard2D` set `#hud-mines`'
  `min-width` in `ch`).
- `formatSliderValue(value, {format, step, max, unit})`, `decimalsOf(step)`.
- `segmentedTargetIndex(disabled, current, key, {horizontal?})`,
  `segmentedState(count, selected)`.
- `bindSlider(root)`, `bindSegmented(group, {onChange, horizontal?})`
  (`horizontal` leaves Up/Down to the shell's focus moves),
  `bindSelectOnHover(root)` (the one selected control: a moving mouse
  focuses the enabled `SELECT_ON_HOVER` control under it),
  `initComponents(root)` — each returns an unbind.
- `PAGER_WINDOW` (5), `pagerState(page, pages)` → `{hidden, page, pages,
  first, last, numbers: [{page, label, current}]}`; `bindPager(nav, {onPage,
  name?})` → `{show(state)}`: fills a `.ui-pager` with First, the numbered
  pages and Last (`data-page`), the current page `aria-current="page"` and
  `aria-disabled` (still focusable, so a pager button that becomes disabled
  hands focus to it).
- The code chip (`.ui-code`, `ui-code--compact` in a table row):
  `boardLink(code, location)` → `<origin><path>#board=<code>`;
  `copyBoardCode({kind, code, clipboard, location, select, toast})` →
  Promise of whether it copied (a refusal selects the code and toasts
  `COPY_FALLBACK`, else `COPIED[kind]`); `createCodeChip(doc, {label,
  compact})`; `bindCodeChip(root, {onCopy})` → `{show(code | null), code}`.
- `bindCodeField({input, button, info, resolve, onPlay, prompt?})` →
  `{refresh(), clear()}`: the board choices' code field, validated live.

`js/themes/registry.js` — `THEMES` (frozen entries `{id, name, stylesheet,
boardModule, fonts: [{family, licence, files: [{weight, style, path}]}],
order, demo}`, paths from the site root), `DEFAULT_THEME_ID`
(`joyful-tiles`), `themeById(id)` (the default entry for an unknown or
absent id), `isRegisteredTheme(id)`; `registerTheme(entry)` is test-only — a
fixture theme found by the lookup and kept out of `THEMES`.

`js/ui/kit-catalogue.js` — `KIT_CATALOGUE` (frozen `{name, kind, className,
selector, base, variants, parts, slots}`; a part `{name, selector, optional,
interactive, states, as}`), `STATES`, `CONTRAST_ROLES` (`surfaces`,
`bodyText`, `largeText`), `REQUIRED_TOKENS`.

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

`js/shell/scene-palette.js` — `SCENE_TOKENS` (`{horizon, zenith, nadir}`),
`parseRgb(value)` (fallback `[255, 0, 255]`), `scenePalette(token)`,
`bindScenePalette({token, onThemeChange, renderer, onApplied?})` → calls
`renderer.setScenePalette` now and on every theme change (`js/main.js` sets
`needRender` in `onApplied`); returns the unsubscribe.

## INTERNAL PATTERNS

- **The catalogue is the contract.** A screen uses a component by its class
  and markup pattern exactly as catalogued, and every theme styles it by the
  part and state selectors of `js/ui/kit-catalogue.js`; renaming either
  breaks every screen and every theme. A new component, part or slot goes
  into the head comment, `KIT_CATALOGUE`, every registered theme's
  stylesheet, the gallery (every state) and `COMPONENTS` in
  `tests/components.test.mjs`; a new composition into the catalogue and
  `COMPOSITIONS`.
- **Controls.** Every interactive control is a native `<button>`, `<input>`
  or `<a>`. Buttons, menu entries and board options have one selected
  state — hover and focus alike, no outline — and `bindSelectOnHover` keeps
  it on one control at a time; every other control keeps its own hover,
  `:active`, `:focus-visible` (and `body.pad-nav :focus`) and disabled
  states, ringed from `--color-focus-ring`. `data-force` previews a state
  (gallery only). Only the selected segmented option is in the Tab order.
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
  `--color-replay-*` — joins `REQUIRED_TOKENS`. A new spacing step or
  z-layer goes into `css/tokens.css`. `tests/tokens.test.mjs`,
  `tests/components.test.mjs` and `tests/theme-conformance.test.mjs` reject
  a custom property declared in another base stylesheet, a read of an
  undeclared token and a required token a theme lacks. Fixed layers use the
  `--z-*` tokens.
- **Head order.** `index.html` loads `css/tokens.css`,
  `css/components.css` and `css/style.css`, the gallery only the first two;
  each then runs `js/theme.js`, which appends the theme's `<link
  blocking="render" data-theme-sheet>` after them. No page links a theme
  stylesheet itself.
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
  (`document.fonts.load`), and only then flips `data-theme`, removes the old
  `<link>` and notifies; switches queue, each after the previous one
  settles; `setTheme` of the active theme does nothing.
- **Board module hand-off.** The applier imports the active theme's
  `board.js` at start-up and on every switch and hands it to
  `onThemeChange` listeners; no renderer imports a theme.
- **Failure contract.** A non-default theme that fails at start-up falls
  back to the default and `notice(START_FALLBACK)` tells the player once (a
  toast in `js/main.js`); a failed switch keeps the current theme, rejects
  and tells `SWITCH_FAILED` once; the default failing rejects `start()` and
  `js/main.js` shows index.html's `#fatal-card`.
- **The 3D scene** (`js/render.js`, `js/textures.js`, `js/tile-art.js`)
  never reads tokens or subscribes to theme changes: sky, fog and clear
  colour come from `bindScenePalette`; tiles and effects keep one palette.
- **Screens** are built from the kit as catalogued; their markup, the ids
  the shell wires and the pointer sizes are
  [app-shell-markup.md](app-shell-markup.md).

## DOMAIN DEPENDENCIES

- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the registry, the theme contract, the kit catalogue, base and theme
  stylesheets, fonts, the applier and its failure contract, conformance
  tests and the per-theme gallery.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token names, the contrast contract, the token reader.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — component set, states, focus and controller contract, the kit-built
  screens.

## CROSS-REFERENCES

- [rendering.md](rendering.md) — `setScenePalette` and the unthemed atlas.
- [settings.md](settings.md) — the theme setting driving `setTheme`, the
  settings document `readStoredTheme` reads, the theme list.
- [app-shell-markup.md](app-shell-markup.md) — the screens built from the kit.
- [testing.md](testing.md) — `tests/theme-registry.test.mjs`,
  `tests/theme-conformance.test.mjs`, `tests/tokens.test.mjs`,
  `tests/theme.test.mjs`, `tests/components.test.mjs` (kit, helpers, screens,
  contrast).

## WHEN TO READ THE SOURCE

- Adding or changing a component or composition, or building a screen from
  the kit: the catalogue at the head of `css/components.css` and the
  gallery section in `dev/components.html`.
- Adding or renaming a token: the theme's `theme.css` and
  `REQUIRED_TOKENS`.
- Adding a theme: `THEMES`, the `STYLESHEETS` mirror in `js/theme.js` and
  the theme's folder; the conformance suite says what is missing.
- Changing how start-up reads the stored theme (`readStoredTheme`, kept in
  step with the settings document's key and versions), or the switch order
  and failure handling (`switchTo` and `start` in `js/themes/applier.js`).
- Changing deploy behaviour (custom domain, 404 redirect, vendored three.js
  path).
