# App shell — component kit, themes, board modules, tokens, deploy files

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The screens' markup in `index.html` and the shell stylesheet are
[app-shell-markup.md](app-shell-markup.md).

| File | Responsibility |
| ---- | -------------- |
| `css/components.css` | the component kit's structure (base stylesheet): `ui-*` classes, layout, sizes, the hidden default of every decoration slot; its head comment is the catalogue (element, role, accessible name, markup pattern, states, focus contract, screens built from them) |
| `js/ui/kit-catalogue.js` | the kit catalogue as data (DOM-free): every component and composition, its parts, each interactive part's states as the selectors a theme styles, its decoration slots; `CONTRAST_ROLES`; `REQUIRED_TOKENS`, the token set every theme declares |
| `js/ui/components.js` | the kit's behaviour helpers; imports nothing, binders touch only the elements handed in, so it runs under Node with stub elements |
| `dev/components.html` | the kit gallery (development only): every catalogued component in every state (`data-force` previews) and every decoration slot, the overlay bar, the counters and the figures panel (with and without its progress bar and pace row, and with its head bar), the results layout `#g-results`, under the theme picked in `#g-theme` or named by `?theme=<id>` (unknown → the default) |
| `css/tokens.css` | the structural tokens only (base stylesheet): `--space-*`, `--z-*`, `--font-numeric-tabular`; nothing per-theme |
| `js/themes/registry.js` | the theme registry (DOM-free): `THEMES` in catalogue order, the default id, the lookup; the one place a theme is registered |
| `js/themes/board-module.js` | the board module's shape (head comment: palette, numbers, font, sky, a drawing style per mode with the 2D gap and frame radius, cursor ring, 3D selection and start-cell tint, confetti colours, motion per cell event and the motion vocabulary) and the board conformance checks (DOM-free) |
| `themes/<id>/` | one theme: `theme.css` (its stylesheet: tokens, every catalogued part and state, `@font-face`, DOM animation, every rule under `:root[data-theme="<id>"]`), `board.js` (its board module), `fonts/` (its `woff2` files and their licences) |
| `js/theme.js` | classic pre-paint script: maps the stored theme, inserts its stylesheet render-blocking, sets root `data-theme`, exposes `globalThis.msThemeBoot` |
| `js/themes/applier.js` | the run-time theme applier: takes over from `js/theme.js`, loads and switches themes, hands the board module to subscribers |
| `js/tokens.js` | token reader for consumers that cannot read stylesheets, chiefly Canvas |
| `js/shell/board-art.js` | the board art hand-off on the shell's side: the active board module to `BOARD_ART` ([classic2d-tile-skin.md](classic2d-tile-skin.md)) at start-up and on every theme change, once its number font has loaded |
| `js/shell/scene-palette.js` | the 3D scene's hand-off: the module `BOARD_ART` holds to the renderer's `setBoard` |
| `404.html`, `CNAME`, `.nojekyll` | GitHub Pages: the not-found page (the fatal card's composition, "Page not found." and a link to `/`; the base and default theme stylesheets from the site root, no script, no remote file), `minesweeper3d.chosko.com`, files served as-is |

## PUBLIC API

`js/ui/components.js`
- `formatOverlayTime(seconds)` (three digits, stops at `'999'`),
  `formatMineCount(minesLeft)` (three digits, a negative count's minus in
  the first, kept at -99), `mineCounterDigits(mines)` (at least 3; past 3
  `UI.setBoard` / `setBoard2D` set the mine counter's digits' `min-width`
  in `ch`) — the formats of every counter readout and the replay viewer's
  bar.
- `formatSliderValue(value, {format, step, max, unit})`, `decimalsOf(step)`.
- `segmentedTargetIndex(disabled, current, key, {horizontal?})`,
  `segmentedState(count, selected)`.
- `bindSlider(root)`, `bindSegmented(group, {onChange, horizontal?})`
  (`horizontal` leaves Up/Down to the shell's focus moves),
  `bindTabs(list, {onChange})` (a `ui-tabs` tablist, Left / Right select,
  the selected tab alone in the Tab order), `bindSelectOnHover(root)` (the
  one selected control: a moving mouse focuses the enabled
  `SELECT_ON_HOVER` control under it — a button, menu entry, mode entry or
  board option — a disabled mode entry included),
  `initComponents(root)` (every slider, segmented choice and tablist) —
  each returns an unbind.
- `showKeyHints(root, keysFor)`: fills every `.ui-key-hint[data-action]`
  under `root` with the keys `keysFor(action)` gives (the bindings source's
  `keyHintKeys` for the active device), `ui-key-hint--pad` for controller
  buttons, hidden with none (touch); `UI` calls it on every device change
  ([app-shell-help.md](app-shell-help.md)).
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
- The figures panel: `bindFigures(panel)` → `{show(figures, names?)}`
  writes the panel's `.ui-figure[data-figure]` rows from the live figures
  model's `{text, detail, progress}` per figure (`js/shell/live-figures.js`
  `FIGURES`) — the named ones, or every one — each part only when its text
  changes; a null figure (pace with no best, or before the first 3BV) hides,
  a null detail hides its line, the progress bar's fill and
  `aria-valuenow` take the share solved. Its live part
  (`.ui-figures__live`, a polite live region the base hides; the figures
  themselves and the counter readouts are never live):
  `bindFiguresLive(panel, {interval?})` → `{announce(text), stop()}` writes
  it at most once per `LIVE_FIGURES_INTERVAL`, the latest held text
  winning, an unchanged text not written again. The Classic 2D window, the
  3D overlay and the replay viewer each bind their panel with both.

`js/themes/registry.js` — `THEMES` (frozen entries `{id, name, stylesheet,
boardModule, fonts: [{family, licence, files: [{weight, style, path}]}],
order, demo}`, paths from the site root), `DEFAULT_THEME_ID`
(`joyful-tiles`), `themeById(id)` (the default entry for an unknown or
absent id), `isRegisteredTheme(id)`; `registerTheme(entry)` is test-only — a
fixture theme found by the lookup and kept out of `THEMES`.

`js/themes/board-module.js` — `CELL_EVENTS`, `MOTION_PROPERTIES`,
`NAMED_EASINGS`, `FACE_ENTRIES` (each face's recipe palette entries),
`BOARD_ENTRIES` (every entry's path), `contrast(a, b)`,
`checkBoardModule(board, {fonts?, minTileSize?})` → problems `{check,
subject}` (`palette`, `numbers`, `font`, `sky`, `style`, `relief`, `legible`,
`contrast`, `motion`), none when the module conforms.

`js/ui/kit-catalogue.js` — `KIT_CATALOGUE` (frozen `{name, kind, className,
selector, base, variants, parts, slots}`; a part `{name, selector, optional,
interactive, states, as}`; a slot `{name, selector}`), `STATES` (a
selectable part's `default`, `selected`, `pressed`, `disabled`, and a board
option's `chosen`; every other control's `hover` and `focused`, and
`checked`), `CONTRAST_ROLES` (`surfaces`, `bodyText`, `largeText`),
`REQUIRED_TOKENS`. Beside the m1 kit, the catalogue holds the shared
layout's components: `ui-button--danger`, `ui-wordmark`, `ui-backdrop`,
`ui-frame` (parts `head`, `back`, `title`, `action`, `body`, `foot`,
`status`, `summary`; slot `window-chrome`), `ui-mode-entry` (`entry`,
`icon`, `label`, `reason`, `last`, `lock`), `ui-option` (`option`,
`badge`, `name`, `last`, `meta`, `size`, `density`, `check`; variant
`ui-option--learn`), `ui-section-label`, `ui-key-hint`, `ui-chip`,
`ui-list-row`, `ui-scene-panel` (`stage`, `tag`, `card`, `badge`, `name`,
`note`; variant `ui-scene-panel--live`), `ui-divider`, `ui-tabs`,
`ui-checkbox`, `ui-table`, `ui-toast`, a message `ui-card`'s `icon`, and
the compositions `ui-mode-list`, `ui-options`, `ui-key-hints`, `ui-list`;
and the in-game components: the counter readout `ui-counter` (`icon`,
optional, and `digits`; `data-negative` below zero), `ui-counter-strip`
(the counters at its ends, `restart` between them), the live figure
`ui-figure` (`label`, `value`, `detail`, `bar`, `fill`; variant
`ui-figure--progress`) and the figures panel `ui-figures` (`head`,
`title`, `action` — the optional head bar —, `body`, `foot` with the
controls reminder, `live`).

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

`js/shell/board-art.js` — `numberFontSpec(font)` (`<weight> 1em
"<family>"`), `bindBoardArt({applier, fonts, art?, onError?})` → hands the
applier's active module to `art` (`BOARD_ART` by default) at once when the
applier has started, then on every theme change, each only after
`fonts.load` resolves for its number font; a switch another overtakes
before its font loads is never handed over. Returns the unsubscribe.
`js/main.js` binds it before the applier starts.

`js/shell/scene-palette.js` — `parseRgb(value)` (`#rgb`, `#rrggbb`, `rgb()`
or `rgba()` as channels, fallback `[255, 0, 255]`),
`bindScenePalette({art?, renderer, onApplied?})` → calls
`renderer.setBoard` with the module `art` holds now, if any, and each one
handed over after it (`js/main.js` sets `needRender` in `onApplied`);
returns the unsubscribe.

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
  or `<a>`. Buttons, menu entries, mode entries and board options have one
  selected state — hover and focus alike, no outline; *Joyful tiles* draws
  them raised at rest, level when selected, sunk when pressed, flat when
  disabled — and `bindSelectOnHover` keeps it on one control at a time; a
  board option's chosen state (`aria-pressed`, a fill and a check) is
  drawn apart from selected, and the selected mode entry is taller, with a
  bigger icon and label; every other control keeps its own hover,
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
  (`document.fonts.load`), and only then flips `data-theme`, removes the old
  `<link>` and notifies; switches queue, each after the previous one
  settles; `setTheme` of the active theme does nothing.
- **Board module hand-off.** The applier imports the active theme's
  `board.js` (its export `BOARD`) at start-up and on every switch and
  hands it to `onThemeChange` listeners. `bindBoardArt` is the one
  listener that feeds the boards: it waits for the module's number font,
  then sets `BOARD_ART`, which the Classic 2D tile skins read and
  `bindScenePalette` passes to the 3D renderer's `setBoard`, so no tile or
  atlas is drawn in a fallback font. No renderer imports a theme, reads a
  stylesheet or subscribes to the applier.
- **The board module.** Everything both boards draw a theme with — its
  shape is the head comment of `js/themes/board-module.js`, its values each
  theme's `board.js`. `checkBoardModule` is the board case of the
  conformance suite (`tests/theme-conformance.test.mjs`) for every
  registered theme: every palette entry; 26 number colours; the number font
  one of the theme's registered fonts; the sky; a shipped style with all
  its parameters per mode (the 2D one with its gap and frame radius); the
  closed face's relief above zero and at least a pixel at `MIN_TILE_SIZE`;
  each number at least 4.5:1 against every point of both revealed faces;
  the cursor ring and selection outline at least 3:1 against the closed and
  revealed faces; and an entry for every cell event, a motion description
  built only from the vocabulary or `null`.
- **The board frame.** `ui-board-frame` is the kit's frame a Classic 2D
  board sits in; each theme stylesheet styles it, its corner radius the
  custom property `--board-frame-radius`, which the shell sets from the
  board module ([classic2d-board-view.md](classic2d-board-view.md)).
- **Failure contract.** A non-default theme that fails at start-up falls
  back to the default and `notice(START_FALLBACK)` tells the player once (a
  toast in `js/main.js`); a failed switch keeps the current theme, rejects
  and tells `SWITCH_FAILED` once; the default failing rejects `start()` and
  `js/main.js` shows index.html's `#fatal-card`.
- **The 3D scene** (`js/render.js`, `js/textures.js`, `js/tile-art.js`)
  never reads tokens or subscribes to theme changes: its atlas, sky, fog,
  clear colour, selection, marked-cell tint, confetti colours and cell
  motion all come from the board module `bindScenePalette` hands it
  ([rendering.md](rendering.md)).
- **The screen frame.** Every non-game screen is a `ui-frame` on a
  `ui-backdrop`, sized to its content and never larger than the window: a
  head (Back with its back key hint, the title centred, an optional
  action), a body that scrolls vertically while head and foot stay in
  view, and a foot — a status line, or a bottom bar of the selection's
  summary beside the screen's actions; the `window-chrome` slot is hidden
  unless a theme draws it. A `ui-scene-panel` is a framed region a mode's
  own renderer draws into: a Classic 2D board view, the 3D scene through
  the renderer's target rectangle while the panel is `--live`
  ([app-shell-3d.md](app-shell-3d.md) § Scene panel), or a card with an
  entry's badge.
- **Screens** composed in the kit — the main menu, both board choices,
  Daily, the placeholder, Records, Settings, the Classic 2D game window,
  the 3D game overlay, the board status cards, the pause card with its
  confirmation, the 3D ready card, the context-lost card, the Learn 3D end
  card, the results screen, the replay viewer, the toast, the fatal card,
  the no-JavaScript notice and the 404 page — are
  each described, element by element and by window size, at the end of the
  head comment of `css/components.css`; the gallery shows the results
  layout. Their markup, the ids the shell wires and the pointer sizes are
  [app-shell-markup.md](app-shell-markup.md).

## DOMAIN DEPENDENCIES

- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the registry, the theme contract, the kit catalogue, base and theme
  stylesheets, fonts, the applier and its failure contract, conformance
  tests and the per-theme gallery.
- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the board module's shape, the board checks, the hand-off and the board
  frame.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token names, the contrast contract, the token reader.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — component set, states, focus and controller contract, the kit-built
  screens.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the shared layout's components, the selected state, the screen frame,
  the scene panel and every screen composed in them.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the counter readouts, the figures panel and the in-game screens built
  from them.

## CROSS-REFERENCES

- [rendering.md](rendering.md) — `setBoard` and what the 3D scene draws from
  the module; [classic2d-tile-skin.md](classic2d-tile-skin.md) — `BOARD_ART`
  and the Classic 2D tile skin.
- [settings.md](settings.md) — the theme setting driving `setTheme`, the
  settings document `readStoredTheme` reads, the theme list.
- [app-shell-markup.md](app-shell-markup.md) — the screens built from the kit.
- [app-shell-ui.md](app-shell-ui.md) — the `UI` methods that feed the
  counters and the figures panels.
- [testing.md](testing.md) — `tests/theme-registry.test.mjs`,
  `tests/theme-conformance.test.mjs`, `tests/board-module.test.mjs`,
  `tests/tokens.test.mjs`, `tests/theme.test.mjs` (the applier and the 3D
  scene's hand-off), `tests/tile-skin.test.mjs` (`bindBoardArt`),
  `tests/components.test.mjs` (kit, helpers, screens,
  contrast), `tests/components-game3d.test.mjs` (the 3D overlay in a
  browser).

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
- Changing deploy behaviour (custom domain, the not-found page, vendored
  three.js path).
