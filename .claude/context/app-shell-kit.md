# App shell — component kit, screens' markup, tokens, theme, static files

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the component kit: `ui-*` classes, states, compositions; its head comment is the catalogue (element, role, accessible name, markup pattern, states, focus contract, screens built from them) |
| `js/ui/components.js` | the kit's behaviour helpers; imports nothing, binders touch only the elements handed in, so it runs under Node with stub elements |
| `dev/components.html` | the kit gallery (development only): every component in every state, the overlay bar, the results layout `#g-results`, a Light/Dark switch, `?theme=dark` |
| `css/tokens.css` | every shared visual value: `--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--elevation-*`, `--duration-*`, `--easing-*`, `--z-*`; light on `:root`, dark under `:root[data-theme="dark"]` |
| `css/style.css` | shell styling: fixed layers, the Classic 2D board area and panel, the replay layer (`replay--scene` transparent over the 3D scene), Back rows (`.esc-row`, `[data-esc-hint]`), the menu-screen and translucent backdrops, the results scrim over the 3D scene, the look's hint (`.look-hint`), the ready/help/controls/ctx-lost overlays, HUD placement; declares no custom property |
| `js/theme.js` | classic script run before first paint: sets root `data-theme`, exposes `globalThis.msTheme` |
| `js/tokens.js` | token reader for consumers that cannot read stylesheets, chiefly Canvas |
| `js/shell/scene-palette.js` | the 3D scene's themed sky from the `--color-scene-*` tokens |
| `index.html` | every overlay as static markup toggled by `.hidden`; importmap `three` → `vendor/three/three.module.min.js` (r186, no build step); a module `onerror` shows `.fatal` |
| `404.html`, `CNAME`, `.nojekyll` | GitHub Pages: redirect to `/`, `minesweeper3d.chosko.com`, files served as-is |

`index.html` head order: `js/theme.js`, `css/tokens.css`,
`css/components.css`, `css/style.css`, then the module graph.

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
  `initComponents(root)` — each returns an unbind.
- `PAGER_WINDOW` (5), `pagerState(page, pages)` → `{hidden, page, pages,
  first, last, numbers: [{page, label, current}]}`; `bindPager(nav, {onPage,
  name?})` → `{show(state)}`: fills a `.ui-pager` with First, the numbered
  pages and Last (`data-page`), the current page `aria-current="page"` and
  `aria-disabled` (still focusable, so a pager button that becomes disabled
  hands focus to it).

`js/theme.js` — `globalThis.msTheme` (`createThemeApplier({root,
readStored?, onError?})` for tests): `current()`, `setTheme(theme)` (unknown
→ `light`, never throws; no-op when unchanged), `onChange(listener)` →
unsubscribe (a throwing listener does not stop the others).

`js/tokens.js` — `token(name)` (with or without `--`; unknown →
`FALLBACK_COLOR` `#ff00ff`, logged once only in development),
`onThemeChange(listener)`, `createTokenReader({root, getStyle, theme, dev?,
log?})`.

`js/shell/scene-palette.js` — `SCENE_TOKENS` (`{horizon, zenith, nadir}`),
`parseRgb(value)` (fallback `[255, 0, 255]`), `scenePalette(token)`,
`bindScenePalette({token, onThemeChange, renderer, onApplied?})` → calls
`renderer.setScenePalette` now and on every theme change (`js/main.js` sets
`needRender` in `onApplied`); returns the unsubscribe.

## INTERNAL PATTERNS

- **The catalogue is the contract.** A screen uses a component by its class
  and markup pattern exactly as catalogued; renaming either breaks every
  screen using it. A new component goes into the catalogue, the gallery
  (every state) and `COMPONENTS` in `tests/components.test.mjs`; a new
  composition into the catalogue and `COMPOSITIONS`.
- **Controls.** Every interactive control is a native `<button>`, `<input>`
  or `<a>` with hover, `:active`, `:focus-visible` (and `body.pad-nav
  :focus`) and disabled states; the `--color-focus-ring` outline outranks
  the controller ring. `data-force` previews a state (gallery only). Only
  the selected segmented option is in the Tab order.
- **Low fidelity.** No theme-specific rule and no literal colour; no
  animation; shadows and transitions only from tokens.
- **Styling values.** A new colour, size, radius, shadow, duration or
  z-index goes into `css/tokens.css` (a colour with a dark value) and is
  read by `var(--…)`; `tests/tokens.test.mjs` and
  `tests/components.test.mjs` reject a custom property declared in either
  other stylesheet or a read of an undeclared token. Fixed layers use the
  `--z-*` tokens (HUD 10, help 11, flash 15, overlays 20, controls modal 30,
  ctx-lost 40, toast 45, fatal 50).
- **Theme.** `js/theme.js` runs synchronously in `<head>`; `readStoredTheme`
  reads the settings document (`ms3d:doc:settings`, version 1) straight
  from `localStorage`, anything unusable applying Light. It never writes:
  the settings store owns the preference and drives `setTheme`. A theme
  switch is only the attribute change.
- **The 3D scene** (`js/render.js`, `js/textures.js`, `js/tile-art.js`)
  never reads tokens or subscribes to theme changes: sky, fog and clear
  colour come from `bindScenePalette`; tiles and effects keep one palette.
- **Screens** — each a `ui-card` (`ui-screen--wide` for the menu, both
  board choices, Records and Settings; Records and Settings add
  `ui-screen--columns` and lay out in `ui-columns`, the kit's one
  breakpoint, 1024 px, in `css/components.css`). Ids the shell wires:
  - main menu `#menu`: title row ending in Play again `#menu-again`, one
    `ui-menu` of `data-entry` items (`data-last`, "Last played" detail),
    session strip `#menu-strip`, footer (Controls, Sound, volume, credit);
  - board choices `#board-choice` ([mode3d.md](mode3d.md)) and
    `#c2d-choice` ([classic2d.md](classic2d.md)): `ui-menu` of `data-preset`
    / `data-size` items with `data-detail` lines, custom `ui-panel` of
    `ui-field`s, no-guess `ui-toggle`, Back;
  - placeholder `#coming-soon`; Records `#records` (the view and its ids:
    [records-screen.md](records-screen.md)); Settings `#settings` (`#settings-body` from
    `settingsPageHtml()`, Bindings `#settings-bindings`, Data
    `#settings-data`, sticky Back row `#settings-actions`,
    [settings-page.md](settings-page.md));
  - pause card `#pause-card`: status lines, `#pause-actions` (primary
    first; `#p-home` "Back to start" only for a 3D game in play),
    `#pause-confirm` (`#p-confirm-yes`, `#p-confirm-no`), `#pause-board`,
    `#pause-controls`, a Settings panel (3D look controls, Sound, volume)
    whose shortcuts carry `data-setting`;
  - results `#results`: banner, `#results-stats` (`rs-*`), `#results-figures`,
    `#results-next`, `#results-bests` (`rb-*`, `ui-panel--muted` on a
    loss), `#results-note`, actions `#r-again`, `#r-watch`, `#r-records`,
    `#r-menu`;
  - replay viewer `#replay` ([replay-playback.md](replay-playback.md)): figures bar with
    `#rp-back`, board area `#replay-board`, `#replay-message`,
    `#replay-controls`;
  - status cards `#c2d-status` (beside the board) and `#m3d-status`,
    stacked above the pause card: progress line, `ui-spinner`, Cancel and
    Play a standard board (`#…-wait`, `#…-wait-standard`), the offer
    (`#…-offer`).
  `#c2d` is the 2D board layer: `#c2d-board` holds the panel `#c2d-panel`
  behind the canvas; `#c2d.c2d--hint` gives the hint strip room below.
- **Coarse pointers.** Each stylesheet ends with one `@media (pointer:
  coarse)` block and nothing else depends on the pointer: the kit's gives
  `ui-toggle__input` a 44 px hit square (`::after`), `ui-slider__input` a
  44 px height and `ui-stat__label` 12 px; the shell's shows `#hud-tap` in
  Classic 2D at 44 px and keeps `kbd` at least 11 px. Every fine-pointer
  size stays as above (`tests/components.test.mjs` pins both).

## DOMAIN DEPENDENCIES

- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token categories, contrast contract, the theme preference's owner, the
  applier and reader contracts.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — component set, states, focus and controller contract, the kit-built
  screens.

## CROSS-REFERENCES

- [rendering.md](rendering.md) — `setScenePalette` and the unthemed atlas.
- [settings.md](settings.md) — the theme applier wiring and the settings
  document `readStoredTheme` reads.
- [testing.md](testing.md) — `tests/tokens.test.mjs`,
  `tests/theme.test.mjs`, `tests/components.test.mjs` (kit, helpers, screens,
  contrast).

## WHEN TO READ THE SOURCE

- Adding or changing a component or composition, or building a screen from
  the kit: the catalogue at the head of `css/components.css` and the
  gallery section in `dev/components.html`.
- Adding or renaming a token, or changing how start-up reads the stored
  theme (`readStoredTheme`, kept in step with the settings document's key
  and version).
- Changing deploy behaviour (custom domain, 404 redirect, vendored three.js
  path).
