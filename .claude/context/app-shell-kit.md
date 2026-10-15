# App shell — component kit, tokens, theme, scene palette, deploy files

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The screens' markup in `index.html` and the shell stylesheet are
[app-shell-markup.md](app-shell-markup.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the component kit: `ui-*` classes, states, compositions; its head comment is the catalogue (element, role, accessible name, markup pattern, states, focus contract, screens built from them) |
| `js/ui/components.js` | the kit's behaviour helpers; imports nothing, binders touch only the elements handed in, so it runs under Node with stub elements |
| `dev/components.html` | the kit gallery (development only): every component in every state, the overlay bar, the results layout `#g-results`, a Light/Dark switch, `?theme=dark` |
| `css/tokens.css` | every shared visual value: `--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--elevation-*`, `--duration-*`, `--easing-*`, `--z-*`; light on `:root`, dark under `:root[data-theme="dark"]` |
| `js/theme.js` | classic script run before first paint: sets root `data-theme`, exposes `globalThis.msTheme` |
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
  read by `var(--…)` — the replay viewer's colours too (`--color-replay-*`:
  the action marks by button, the recorded pointer, Show 3BV's tint cycle
  and isolated mark, read by `js/main.js` for the 3D tints); `tests/tokens.test.mjs` and
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
- **Screens** are built from the kit as catalogued; their markup, the ids
  the shell wires and the coarse-pointer sizes are
  [app-shell-markup.md](app-shell-markup.md).

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
- [app-shell-markup.md](app-shell-markup.md) — the screens built from the kit.
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
