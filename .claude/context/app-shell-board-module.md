# App shell — the board module and its hand-off to both boards

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
The board module is everything both boards draw a theme with; each theme's
`board.js` holds its values ([app-shell-themes.md](app-shell-themes.md)).
This file covers its shape and conformance checks, the board frame, and the
hand-off from the theme applier to the Classic 2D tile skin and the 3D
renderer.

| File | Responsibility |
| ---- | -------------- |
| `js/themes/board-module.js` | the board module's shape (head comment: palette, the 2D and 3D number lists, font, sky, a drawing style per mode with the 2D gap and frame radius, cursor ring, 3D selection and start-cell tint, confetti colours, the Classic 2D end effect's waves, motion per cell event and the motion vocabulary) and the board conformance checks (DOM-free) |
| `js/shell/board-art.js` | the board art hand-off on the shell's side: the active board module to `BOARD_ART` ([classic2d-tile-skin.md](classic2d-tile-skin.md)) at start-up and on every theme change, once its number font has loaded |
| `js/shell/scene-palette.js` | the 3D scene's hand-off: the module `BOARD_ART` holds to the renderer's `setBoard` |

## PUBLIC API

`js/themes/board-module.js` — `CELL_EVENTS`, `MOTION_PROPERTIES`,
`NAMED_EASINGS`, `FACE_ENTRIES` (each face's recipe palette entries),
`BOARD_ENTRIES` (every entry's path), `contrast(a, b)`,
`checkBoardModule(board, {fonts?, minTileSize?})` → problems `{check,
subject}` (`palette`, `numbers`, `font`, `sky`, `style`, `relief`, `legible`,
`contrast`, `motion`), none when the module conforms.

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
  registered theme: every palette entry, the Classic 2D end effect's values
  (`end2d`) among them; both number lists, `numbers2d` (1–8, the Classic 2D
  tiles') and `numbers3d` (1–26, the 3D atlas'); the number font one of the
  theme's registered fonts; the sky; a shipped style with all its
  parameters per mode (the 2D one with its gap and frame radius; a bevel
  side a shade or a `#rrggbb` colour); the closed face's relief above zero
  and at least a pixel at `MIN_TILE_SIZE`; each number at least 4.5:1
  against its own mode's revealed face — a 3D number against every point of
  it, its border included, a 2D number against the face and its shade (the
  hairline round a flat 2D face holds no glyph);
  the cursor ring and selection outline at least 3:1 against the closed and
  revealed faces; and an entry for every cell event, a motion description
  built only from the vocabulary or `null`.
- **The board frame.** `ui-board-frame` is the kit's frame a Classic 2D
  board sits in; each theme stylesheet styles it, its corner radius the
  custom property `--board-frame-radius`, which the shell sets from the
  board module ([classic2d-board-view.md](classic2d-board-view.md)).
- **The Classic 2D end effect** (`js/classic2d/end-effect.js`) reads no
  token: its waves' scale and light are the module's `end2d`, its confetti
  `palette.confetti`, its light clipped to the `style2d` corner radius
  ([classic2d-mode.md](classic2d-mode.md)).
- **The 3D scene** (`js/render.js`, `js/textures.js`, `js/tile-art.js`)
  never reads tokens or subscribes to theme changes: its atlas, sky, fog,
  clear colour, selection, marked-cell tint, confetti colours and cell
  motion all come from the board module `bindScenePalette` hands it
  ([rendering.md](rendering.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the board module's shape, the board checks, the hand-off and the board
  frame.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme contract the board module is part of.

## CROSS-REFERENCES

- [app-shell-themes.md](app-shell-themes.md) — the applier that imports
  the module and notifies `bindBoardArt`.
- [rendering-board-art.md](rendering-board-art.md) — `setBoard` and what the 3D scene draws from
  the module; [classic2d-tile-skin.md](classic2d-tile-skin.md) — `BOARD_ART`
  and the Classic 2D tile skin.
- [classic2d-board-view.md](classic2d-board-view.md) — the board frame's
  radius and the gap on the pitch.
- [testing.md](testing.md) — `tests/board-module.test.mjs`,
  `tests/theme-conformance.test.mjs` (the board case),
  `tests/theme.test.mjs` (the 3D scene's hand-off),
  `tests/tile-skin.test.mjs` (`bindBoardArt`).

## WHEN TO READ THE SOURCE

- Adding a board module entry, a cell event or a motion property: the head
  comment of `js/themes/board-module.js`, every theme's `board.js` and
  `checkBoardModule`.
- Changing when a module reaches the boards (the font wait, an overtaken
  switch): `bindBoardArt` and `bindScenePalette`.
