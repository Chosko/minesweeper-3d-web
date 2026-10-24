# App shell — themes, stylesheets, tokens, deploy files

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The theme registry, each theme's folder, the base and theme stylesheets and
their head order, the structural tokens and the GitHub Pages files. The
pre-paint script, the run-time theme applier and the token reader are
[app-shell-theme-runtime.md](app-shell-theme-runtime.md); the board module
a theme carries and its hand-off to both boards are
[app-shell-board-module.md](app-shell-board-module.md); the component kit
the stylesheets style is [app-shell-kit.md](app-shell-kit.md).

| File | Responsibility |
| ---- | -------------- |
| `css/tokens.css` | the structural tokens only (base stylesheet): `--space-*`, `--z-*`, `--font-numeric-tabular`; nothing per-theme |
| `js/themes/registry.js` | the theme registry (DOM-free): `THEMES` in catalogue order, the default id, the lookup; the one place a theme is registered |
| `themes/<id>/` | one theme: `theme.css` (its stylesheet: tokens, every catalogued part and state, `@font-face`, DOM animation, every rule under `:root[data-theme="<id>"]`), `board.js` (its board module), `fonts/` (its `woff2` files and their licences) |
| `404.html`, `CNAME`, `.nojekyll` | GitHub Pages: the not-found page (the fatal card's composition, "Page not found." and a link to `/`; the base and default theme stylesheets from the site root, no script, no remote file), `minesweeper3d.chosko.com`, files served as-is |

## PUBLIC API

`js/themes/registry.js` — `THEMES` (frozen entries `{id, name, stylesheet,
boardModule, fonts: [{family, licence, files: [{weight, style, path}]}],
order, demo}`, paths from the site root), `DEFAULT_THEME_ID`
(`joyful-tiles`), `themeById(id)` (the default entry for an unknown or
absent id), `isRegisteredTheme(id)`; `registerTheme(entry)` is test-only — a
fixture theme found by the lookup and kept out of `THEMES`.

`js/theme.js`, `js/themes/applier.js`, `js/tokens.js` —
[app-shell-theme-runtime.md](app-shell-theme-runtime.md).

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
  `--color-board-frame`, `--color-number-1`…`-8`, no token for the 2D
  numbers past the square's) hold the board module's values, read only where a screen draws a board colour as a token (the 2D
  board view's ground and cursor ring, the aimed-cell readout's cube); the
  scene tokens (`--color-scene-zenith`, `-horizon`, `-nadir`, `-ink`) are
  the board module's sky stops and the ink on them, which the scene panel
  draws; its body sets the base text in `--font-weight-regular`. A board
  token the canvas lacks is not declared once nothing reads it; the
  scrolling board's marks, the replay pointer's outline, Show 3BV's tints
  and `--board-frame-radius` stay while the board view, the replay viewer
  and the board frame read them.
- **A board module from its canvas.** Each value in a theme's `board.js`
  carries a comment naming the canvas sheet it comes from. *Joyful tiles*'
  2D tiles, numbers and cell motion are J-BoardSheet's, the hexagon and
  triangle tiles' gap and corner radius J-HexSheet's and J-TriSheet's kept
  variant "B · Sharp", the 2D numbers past the square's J-TriSheet's, in
  the 3D hues of the same numbers, and the 3D cubes, sky and effects
  J-3DSheet's. `/theme-implement` brings a theme in from its canvas the
  same way: it reads the 2D, Hexagon and Triangle board sheets beside the
  tokens, components and 3D sheets, renders the hexagon and triangle tiles
  beside their sheets, and stops on a missing Hexagon or Triangle board
  sheet and on a hexagon or triangle tile that differs from the 2D board
  sheet's in anything but its gap and corner radius
  (`.claude/skills/theme-implement/`).
- **Head order.** `index.html` loads `css/tokens.css`,
  `css/components.css` and `css/style.css`, the gallery only the first two;
  each then runs `js/theme.js`, which appends the theme's `<link
  blocking="render" data-theme-sheet>` after them. No scripted page links a
  theme stylesheet itself; only what a page without JavaScript reads names
  the default theme — `index.html`'s root `data-theme`, which the script
  replaces, and the default's stylesheet inside its `<noscript>` — and
  `404.html`, which runs no script, links the base and default theme
  stylesheets.

## DOMAIN DEPENDENCIES

- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the registry, the theme contract, base and theme stylesheets, fonts,
  conformance tests, the Settings theme list and the component gallery
  per theme.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token names, the contrast contract.
- [../domain/features/hex-tri-board-art.md](../domain/features/hex-tri-board-art.md)
  — *Joyful tiles*' hexagon and triangle values;
  [../domain/features/theme-implement-skill.md](../domain/features/theme-implement-skill.md)
  — the sheets the theme skill reads.

## CROSS-REFERENCES

- [app-shell-board-module.md](app-shell-board-module.md) — the board
  module each theme folder's `board.js` holds.
- [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the
  pre-paint script and the applier that load these stylesheets, the token
  reader.
- [app-shell-kit.md](app-shell-kit.md) — the catalogue each theme
  stylesheet styles, `REQUIRED_TOKENS`, and the gallery that renders it
  under any registered theme, its theme list switching it through the
  applier.
- [settings-page.md](settings-page.md) — the theme list.
- [app-shell-markup.md](app-shell-markup.md) — `index.html`'s head and its
  `<noscript>`, the fatal card.
- [testing.md](testing.md) — `tests/theme-registry.test.mjs`,
  `tests/theme-conformance.test.mjs`, `tests/tokens.test.mjs`,
  the fixture themes under `tests/fixtures/themes/`.

## WHEN TO READ THE SOURCE

- Adding or renaming a token: the theme's `theme.css` and
  `REQUIRED_TOKENS`.
- Adding a theme: `/theme-implement` from its canvas, or by hand `THEMES`,
  the `STYLESHEETS` mirror in `js/theme.js` and the theme's folder; the
  conformance suite says what is missing.
- Changing deploy behaviour (custom domain, the not-found page, vendored
  three.js path).
