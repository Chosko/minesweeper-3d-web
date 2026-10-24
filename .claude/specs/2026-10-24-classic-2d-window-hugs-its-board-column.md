# Classic 2D window hugs its board column

## Goal
The Classic 2D game window is exactly as wide as its board column: the title bar
no longer widens it. Where the title bar's Pause, logo and window buttons do not
fit that width, the logo scales down to fit, as the canvas's J-Game2D-l and -m
artboards draw it. Pause and the window buttons keep their size. The tile sizes
are unchanged.

## Acceptance criteria
- With the live figures closed, the window's width is its board column's width:
  498 px at 1366 × 768 and 494 px at 1024 × 768 with Intermediate, 768 px at
  1920 × 1080. It never takes the title bar's width.
- The title bar keeps its `1fr auto 1fr` grid. In a window too narrow for equal
  sides, Pause's side shrinks first, so the logo sits between Pause and the
  window buttons, off-centre. This is the artboards' layout.
- The logo's scale is the largest tenth (1, 0.9, 0.8 …) that fits the room
  between Pause and the window buttons, never above 1. Intermediate at 1366 ×
  768 and at 1024 × 768 gets 0.7, as the artboards draw it. Intermediate at
  1920 × 1080 keeps 1.
- The scale has a floor of 0.5. A board column too narrow for the logo at 0.5
  hides the logo, and the window still hugs the board.
- Only when Pause and the window buttons alone do not fit the board column does
  the window widen to them. The board column is then centred in the window.
- Nothing in the title bar overflows the window or is clipped by it.
- The tile sizes are unchanged: 41 px at 1920 × 1080, 27 px at 1366 × 768 and
  1024 × 768.
- The logo fit is a DOM-free step function, `logoScale(room, natural)` in
  `js/ui/components.js`, with a fast test. The browser tests in
  `tests/components.test.mjs` assert the window widths, the logo scales, the
  hidden logo and the widened window.

## Decisions
- **The canvas's layout (user decision).** The logo scales down in the
  `1fr auto 1fr` title bar and sits off-centre. The user picked this over
  equal sides.
- **The floor and the hidden logo (user decision).** Below the floor the logo
  hides, the way the phone hides the window buttons. The window widens only
  when Pause and the window buttons alone don't fit.
- **Tenth steps.** Scaling in tenths reproduces the artboards' 0.7 at both
  compact sizes, where a continuous fit would give about 0.77. Everywhere
  else it still shrinks only to the largest step that fits.
- **Floor 0.5.** The smallest scale a standard board needs is 0.6 (Beginner at
  1920 × 1080). At 0.5 the logo is about 182 px wide with 18 px letters at the
  compact sizes, and about 226 px with 22 px letters at 1920.
- The fit sets the logo's inline CSS `zoom`, which scales its
  outline and extrusion with it, as the artboards' `zoom: 0.7` does.

## Hints
- `css/style.css` § Classic 2D game window (the `justify-self: start` stopgap
  goes; the head no longer sizes the window)
- `css/components.css` § the screen frame's head and the game logo
- `js/ui/components.js` (the logo fit beside `drawLogo`)
- `js/ui.js` `sizeBoard2D` (fits the title bar once the board area is sized)
- `tests/components.test.mjs` (`ARTBOARDS_2D` and its window test, the fast
  test for `logoScale`)
- canvas J-Game2D-l and -m (the head's markup: `zoom: 0.7` on the lettering)

## Drift
- `.claude/domain/features/in-game-layout.md` § Architecture, **Game window
  composition** — settles: the window hugs the board. It is the board
  column's width, and the title bar never widens it.
- `.claude/domain/features/shared-screen-layout.md` § the title bar (the
  logo in the centre) — diverges: the logo is centred between Back and the
  window buttons. In the Classic 2D window a narrow board column shrinks
  Pause's side first, which moves the logo off-centre. The logo also scales
  down in tenths to a 0.5 floor and hides below it.
- `.claude/context/app-shell-2d.md` § Board area and panel — settles: after
  sizing the board area, `sizeBoard2D` fits the title bar's logo.
- `.claude/context/app-shell-kit-layout.md` § the screen frame (the logo in
  the centre) — diverges, as `shared-screen-layout.md` above.
- `.claude/context/classic2d-mode.md` and `.claude/context/app-shell-hud.md`
  § the game window's title bar — settles: the logo fits the board column.
- `.claude/context/app-shell-stylesheet.md` § `css/style.css` (the Classic 2D
  game window) — settles: the head is contained, so it does not set the
  window's width.
