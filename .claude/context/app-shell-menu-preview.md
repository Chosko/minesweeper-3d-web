# App shell — the menu screens' previews

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers what each main menu play tile's own preview shows — `menuPreview` in
`js/shell/menu.js`, the data — and how the menu screens draw previews:
`js/shell/menu-preview.js` (the tiles' board view mount, the scene panel
binder the Daily screen shows its selected mode in, and the demo boards,
its head comment the contract), and their wiring in `js/main.js`. The
Daily screen's use of the binder is
[app-shell-daily.md](app-shell-daily.md); the menu itself is
[app-shell-menu.md](app-shell-menu.md).

## PUBLIC API

`js/shell/menu.js`
- `menuPreview(id, {entries?, missing?})` → what play tile `id` shows, as
  data: `{kind: 'board' | 'still' | 'icon' | 'locked', ground, grid?,
  still?}` (its head comment) — a board names its grid kind —, null for a
  small entry; `DEMO_BOARD_3D`,
  the size of the backdrop's demo board, the one the 3D still shows.

`js/shell/menu-preview.js` (its head comment is the contract)
- `DEMO_SEED`; `demoBoard2D(grid = 'square')` → `{grid, geometry, game}`,
  the Intermediate game in progress of the flat mode on that grid kind
  (`js/flat-modes.js`) and its geometry — the Classic 2D, Hexagon or
  Triangle tile's —, the same on every load; `dailyBoard2D(daily)` → `{grid, geometry, game, mark}`,
  `daily` the shell's `dailyPreview(now, grid)`: a flat mode's daily board
  of today on its own grid, closed with its start cell; `demoBoard3D(random?)`
  → the 3D game of the menu screens' backdrop (a `DEMO_BOARD_3D` box, some
  shell cells revealed, a few mines flagged; `Math.random` by default, the
  gallery's seeded) and `DEMO_SPACING_3D`, the spacing it is drawn at.
- `mountTilePreviews({tiles, previewOf, mountBoard, boardOf})` → the board
  views mounted, by entry: each tile whose preview is a board gets its own
  board view at once in its `ui-play-tile__art`, over the board
  `boardOf(kind, grid)` gives for its preview's grid, handed its game; a
  mount that throws leaves the preview its plain ground (`data-failed`).
- `bindMenuPreview({panel, stage, tag, iconOf, mountBoard, boardOf})` →
  `{show(preview), shown}` over a `ui-scene-panel`: a board view per board
  kind and grid, mounted once (`mountBoard({container, grid, geometry})`)
  over `boardOf(kind, grid)` and kept in its own `[data-preview]` layer
  (`data-grid` its grid kind); the panel `ui-scene-panel--live` only for
  `scene` and carrying the kind shown as `data-shows`; a card (badge, name,
  note) for `badge`, and for a board preview whose view fails to mount —
  the card of the preview's `entry` and `label`. The Daily screen uses
  it.

## INTERNAL PATTERNS

- **Every tile its own preview, at once.** None follows the selection:
  the Classic 2D, Hexagon and Triangle tiles' art is the flat board view
  (`mountBoardView`, unframed,
  [classic2d-board-canvas.md](classic2d-board-canvas.md)) over the mode's
  demo board, laid out on a box larger than the tile's preview — square
  for Classic 2D, the board's own proportions for Hexagon and Triangle
  (sized per entry in the stylesheets) — so the board is cropped from its
  middle with no edge showing; Surface and 3D show
  still images (`assets/menu/`: the canvas's torus and a still of the demo
  board cut out on a transparent background); Daily a calendar icon in
  the markup. The menu shows no 3D scene: `sceneOff()` holds on the menu
  ([app-shell-3d.md](app-shell-3d.md) § Scene panel).
- **Unavailable tiles.** `ui.setEntryUnavailable` locks the preview: the
  locked ground and the lock in place of its art
  ([app-shell-menu.md](app-shell-menu.md) § Entries).
- **Sizes per window.** The preview square and each art's size are the
  window step's ([app-shell-menu.md](app-shell-menu.md) § Layout); a phone
  row's preview is a strip.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  each mode's play tile showing its own preview.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the menu previews and the scene panel.

## CROSS-REFERENCES

- [app-shell-menu.md](app-shell-menu.md) — the play tiles the previews sit
  in.
- [app-shell-daily.md](app-shell-daily.md) — the Daily screen's preview.
- [classic2d-board-canvas.md](classic2d-board-canvas.md) — `mountBoardView`;
  [geometry.md](geometry.md) — the demo boards' geometry.
- [app-shell-3d.md](app-shell-3d.md) § Scene panel — the backdrop and the
  Daily screen's cube.
- [app-shell-kit.md](app-shell-kit.md) — the gallery, which draws the tiles
  and the scene panels through these.
- [testing.md](testing.md) — `tests/shell-menu.test.mjs` (previews).

## WHEN TO READ THE SOURCE

- Changing what a preview shows: `menuPreview` and the head comment of
  `js/shell/menu-preview.js`, and the tile's art in `index.html`.
