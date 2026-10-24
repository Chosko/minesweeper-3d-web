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
| `js/themes/board-module.js` | the board module's shape (head comment: palette, the 2D and 3D number lists, font, sky, a drawing style per mode with the 2D gap and frame radius and the other flat grids' shape, cursor ring, 3D selection and start-cell tint, confetti colours, the Classic 2D end effect's waves, motion per cell event and the motion vocabulary) and the board conformance checks (DOM-free) |
| `js/shell/board-art.js` | the board art hand-off on the shell's side: the active board module to `BOARD_ART` ([classic2d-tile-skin.md](classic2d-tile-skin.md)) at start-up and on every theme change, once its number font has loaded |
| `js/shell/scene-palette.js` | the 3D scene's hand-off: the module `BOARD_ART` holds to the renderer's `setBoard` |

## PUBLIC API

`js/themes/board-module.js` — `CELL_EVENTS`, `MOTION_PROPERTIES`,
`NAMED_EASINGS`, `FACE_ENTRIES` (each face's recipe palette entries),
`BOARD_ENTRIES` (every entry's path), `GRID_NUMBERS` (`{square, hex, tri}`,
the highest number each flat grid shows: its most neighbours),
`contrast(a, b)`, `checkBoardModule(board, {fonts?, floors?})` → problems
`{check, subject}` (`palette`, `numbers`, `font`, `sky`, `style`, `relief`,
`legible`, `contrast`, `motion`), none when the module conforms; `floors`
(`{square, hex, tri}`, each in its grid's shape unit) overrides a flat
grid's floor, by default its geometry's.

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
  (`end2d`) among them; both number lists, `numbers2d` (to the highest
  `GRID_NUMBERS` entry, the 2D tiles' on every flat grid) and `numbers3d`
  (1–26, the 3D atlas'); the number font one of the theme's registered
  fonts; the sky; a shipped style with all its parameters per mode (the 2D
  one with its gap and frame radius, and the hexagon's and triangle's
  shape; a bevel side a shade or a `#rrggbb` colour); the closed face's
  relief above zero and at least a pixel at each flat grid's floor — the
  geometry's smallest tile in the unit its shape takes (the board view's
  `GRID_UNIT`, a triangle's height), each grid failing as its own subject —
  and the 3D relief at the square's; each number at least 4.5:1
  against its own mode's revealed face — a 3D number against every point of
  it, its border included, a 2D number against the face and its shade (the
  hairline round a flat 2D face holds no glyph);
  the cursor ring and selection outline at least 3:1 against the closed and
  revealed faces; and an entry for every cell event, a motion description
  built only from the vocabulary or `null`.
- **Per-grid shape.** `style2d.grids` holds the hexagon's and triangle's
  shape, `{hex: {gap, radius}, tri: {gap, radius}}`: the gap between tiles
  and the tile's corner radius, fractions of the hexagon's tile across the
  flats and of the triangle's height. The square's shape is the style's own
  `gap` and `radius`; every other 2D value — the style and its parameters,
  palette, faces, numbers, font, cursor ring, marked start cell, end effect
  and motion — is shared by the three flat grids, each grid showing the
  numbers up to its `GRID_NUMBERS`. The tile painter draws a hexagon or
  triangle in its grid's radius ([classic2d-tile-skin.md](classic2d-tile-skin.md))
  and the board view lays it out on its grid's gap
  ([classic2d-board-view.md](classic2d-board-view.md)). *Joyful tiles*
  takes them from its Hexagon and Triangle board sheets' kept variant, and
  its numbers past the square's from the Triangle board sheet.
- **Motion tracks.** A cell event's description keys the vocabulary's
  tracks — offset, scale, rotation and its flip, depth, brightness and
  opacity, each as the head comment of `js/themes/board-module.js` defines
  it — and the cell motion player
  ([classic2d-tile-motion.md](classic2d-tile-motion.md)) answers each per
  frame. How the 2D motion layer draws them is
  [classic2d-board-motion.md](classic2d-board-motion.md); the 3D motion
  mesh draws them all on the events it plays — reveal, flag, unflag and
  the solved pulse, never press, release or chord press, which the 3D game
  does not report ([rendering-effects.md](rendering-effects.md)).
  *Joyful tiles* keys J-BoardSheet's motion rows: press and chord press
  move, shrink and dim the closed face and cut to the pressed face as they
  end, release springs back from that pressed pose, reveal fades and lifts
  the cell open from it, flag and unflag add their brightness.
- **The board frame.** `ui-board-frame` is the kit's frame every Classic
  2D board sits in, padded by the module's gap; each theme stylesheet
  styles it, its corner radius the custom property `--board-frame-radius`,
  set from the board module, and gives a clipped board's viewport its
  radius (`--board-viewport-radius` on `[data-board-clipped]`) ([classic2d-board-view.md](classic2d-board-view.md)).
- **The Classic 2D end effect** (`js/classic2d/end-effect.js`) reads no
  token: its waves' scale and light are the module's `end2d`, its confetti
  `palette.confetti`, its light clipped to the `style2d` corner radius
  ([classic2d-end-effect.md](classic2d-end-effect.md)).
- **The 3D scene** (`js/render.js`, `js/textures.js`, `js/tile-art.js`)
  never reads tokens or subscribes to theme changes: its atlas, sky, fog,
  clear colour, selection, marked-cell tint, confetti colours and cell
  motion all come from the board module `bindScenePalette` hands it
  ([rendering.md](rendering.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/themed-board-art-and-motion.md](../domain/features/themed-board-art-and-motion.md)
  — the board module's shape, the board checks, the hand-off and the board
  frame.
- [../domain/features/hex-tri-board-art.md](../domain/features/hex-tri-board-art.md)
  — the per-grid shape, the 2D numbers every flat grid shows and the checks
  per grid.
- [../domain/features/theme-system.md](../domain/features/theme-system.md)
  — the theme contract the board module is part of.

## CROSS-REFERENCES

- [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the applier that imports
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
  `checkBoardModule`; a new flat grid also takes a `GRID_NUMBERS` entry and
  its shape in `style2d.grids`.
- Changing when a module reaches the boards (the font wait, an overtaken
  switch): `bindBoardArt` and `bindScenePalette`.
