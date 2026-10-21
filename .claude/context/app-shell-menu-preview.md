# App shell — the main menu's preview

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers what the main menu's preview panel shows for the selected entry —
`menuPreview` in `js/shell/menu.js`, the data — and how it is drawn:
`js/shell/menu-preview.js` (the preview binder and its demo boards, its head
comment the contract), and their wiring in `js/main.js`. The Daily screen
reuses the binder ([app-shell-daily.md](app-shell-daily.md)). The menu
itself is [app-shell-menu.md](app-shell-menu.md).

## PUBLIC API

`js/shell/menu.js`
- `menuPreview(id, {entries?, missing?, hasMode?})` → what the preview
  shows, as data: `{kind: 'board' | 'scene' | 'still' | 'daily' | 'badge',
  …}` (its head comment); `DEMO_BOARD_3D`, the size of the 3D preview's
  and the backdrop's demo board.

`js/shell/menu-preview.js` (its head comment is the contract)
- `DEMO_SEED`; `demoBoard2D()` → `{grid, geometry, game}`, the Classic 2D
  preview's Intermediate board and its square geometry, the same on every
  load; `dailyBoard2D(daily)` → `{grid, geometry, game, mark}`, today's daily Expert board closed with its start
  cell; `demoBoard3D(random?)` → the 3D game of the menu's 3D preview and
  backdrop (a `DEMO_BOARD_3D` box, some shell cells revealed, a few mines
  flagged; `Math.random` by default, the gallery's seeded) and
  `DEMO_SPACING_3D`, the spacing it is drawn at.
- `bindMenuPreview({panel, stage, tag, iconOf, mountBoard, boardOf})` →
  `{show(preview), shown}` over a `ui-scene-panel`: a board view per board
  kind, mounted once (`mountBoard({container, grid, geometry})`) and kept in its own `[data-preview]` layer; the panel
  `ui-scene-panel--live` only for `scene` and carrying the kind as
  `data-shows`; a card (badge, name, note) for `badge`. The Daily screen
  reuses it.

## INTERNAL PATTERNS

- **Preview.** `MENU_PREVIEW` follows the focus among the entries
  (`focusin` → `showPreview`, the focused entry's or, with none focused,
  the opening entry's): `menuPreview` gives the kind and `previewOf` names
  the Daily preview's date. The Classic 2D boards are drawn by
  `mountBoardView`, `framed`: each whole board in its board frame inside
  the panel ([classic2d-board-canvas.md](classic2d-board-canvas.md));
  the 3D one is the demo board the renderer draws into the panel
  ([app-shell-3d.md](app-shell-3d.md) § Scene panel), drawn only while that
  preview shows.
- **Unavailable entries** stay selectable so their preview shows, its card
  noting the reason ([app-shell-menu.md](app-shell-menu.md) § Entries).
- **Inset per size.** The preview's board layer (`[data-preview]`) is inset
  per window size so the board view's fit lands on the artboard's tile, and
  its card is the large card (a bigger badge); at phone widths the preview
  goes.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  what the main menu's preview shows.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the scene panel the preview fills.

## CROSS-REFERENCES

- [app-shell-menu.md](app-shell-menu.md) — the entries whose focus the
  preview follows.
- [app-shell-daily.md](app-shell-daily.md) — the Daily screen's preview.
- [classic2d-board-canvas.md](classic2d-board-canvas.md) — `mountBoardView`
  framed; [geometry.md](geometry.md) — the demo boards' geometry.
- [app-shell-3d.md](app-shell-3d.md) § Scene panel — the 3D preview and
  backdrop.
- [app-shell-kit.md](app-shell-kit.md) — the gallery, which draws the
  previews through this binder.
- [testing.md](testing.md) — `tests/shell-menu.test.mjs` (previews).

## WHEN TO READ THE SOURCE

- Changing what a preview shows: `menuPreview` and the head comment of
  `js/shell/menu-preview.js`.
