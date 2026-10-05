# Minesweeper 3D (original XNA game): gameplay contract

This is the reference behaviour of the original XNA/C# game (read-only source in `Chosko/minesweeper-3d`).
**Gameplay** — how the grid is navigated and operated, and user-facing game rules — must be preserved exactly.
Everything else (UI, menus, graphics style, sound, performance, bugs) may be improved.

## Grid & geometry
- Board: true 3D box of X×Y×Z cells (world axes). Presets (X,Y,Z,mines):
  - 2D classic: Beginner (9,9,1,10), Intermediate (16,16,1,40), Expert (30,16,1,99)
  - Double layer: Beginner (8,8,2,10), Intermediate (14,14,2,60), Expert (25,16,2,130)
  - 3D: Beginner (6,6,6,10), Intermediate (8,8,8,40), Expert (12,12,8,130)
- Custom: each dimension integer 1..100, mines integer 1..X*Y*Z (default 10,10,10 / 25).
- Random button (fills fields, does not start): Z=rand[1,29], Y=rand[1,29-Z], X=rand[1,29-(Z-Y)], mines=rand[1, max(1,X*Y*Z/5 - 1)]. Guard tiny boards (original crashed).
- Cube edge = 4 world units. Cell (i,j,k) cube occupies [P-3, P+1] per axis where P = (4*s*i - 2X, 4*s*j - 2Y, 4*s*k - 2Z), s = spacing.
  (Original didn't centre the grid when spacing grows — fixing that is allowed.)
- Spacing s: initial 1.1, clamp [1,10]; mouse wheel: +0.04 per notch (120 delta units/3000), wheel up = larger spacing.
- Background RGB(200,225,255). Unlit textured cubes; every face shows the full cell texture.

## Mines & numbers
- Mines placed at game creation (NO first-click safety). For each mine: pick random (x,y,z); if occupied, linear probe i++ (wrap → i=0,j++; wrap → j=0,k++; wrap → k=0) until free.
- 26-neighbourhood (3×3×3 minus self, clipped). number = adjacent mine count (0..26), mines = -1. Fixed at creation.

## Cell state
pressed, flagged, unlinked, selected, nearSelected. No question marks.

## Rules
- **leftClick(c)**: if flagged → nothing. Else pressed=true; if number==0 → chord(c) (flood fill); if number==-1 → EXPLODE (lose).
- **chord(c)** ("leftRightClick"): only if c.pressed && checkMines(c) where checkMines = (#flagged neighbours == c.number) (always true for mines). Then leftClick every non-pressed neighbour (flagged ones are skipped by leftClick).
  - Flood fill = this mutual recursion. A zero cell with a flagged neighbour fails checkMines → cascade stops there. Use an iterative implementation.
- **rightClick(c)**:
  - unrevealed: toggle flag. Unflag also sets unlinked=false on all 26 neighbours.
  - revealed (any number): if any unrevealed neighbour is unflagged → flag ALL unrevealed neighbours; else (all already flagged) → unflag all of them (with the relink effect above).
  - Flags unlimited; mine counter = mines - flagCount may go negative.
- **Unlinking (auto-hide)**, evaluated continuously for cells that are pressed && !flagged && !unlinked:
  - number==0: unlinked = checkMines (i.e. no flagged neighbours).
  - number>0: if every neighbour is pressed or flagged or unlinked → unlinked = checkMines.
  - Unlinked cells are invisible (except with Ctrl) and unpickable. Only an unflag on a neighbour relinks them.
- **Win**: when not ended and (number of unpressed cells == mines) and no flagged non-mine exists → won. Flags not required. Timer and counter freeze.
- **Lose**: on explosion every cell becomes pressed, unflagged, linked → full board revealed (mines shown with mine graphic, numbers visible). Timer freezes.
- **Timer** starts on the first left-click release over a selected cell (even if it's flagged and nothing happens). Chords do not start it. Shown with up to 2 decimals.
- HUD: time, mines remaining (mines - flags), centre crosshair, end message (won / game over + options).

## Controls (must be preserved)
- Free-fly FPS camera (pointer lock). Start: position (0, 10, -8*max(X,Y,Z)) (adjust if grid is re-centred), pitch 0, looking toward +Z at the grid.
- Mouse look 0.2° per pixel, mouse right → turn right, mouse down → look down, pitch clamp ±90°.
- W forward along view direction, S back, A strafe left, D strafe right, Q world down, E world up; 50 units/s.
  - Original quirk: forward vector = normalize(sin(yaw'), sin(pitch), cos(yaw')) (no cos(pitch) on XZ). Keep it.
- Crosshair at screen centre; picking = ray from screen centre, nearest cube hit (AABB [P-3,P+1]).
  - Excluded from picking: unlinked cells; pressed cells while **Space** is held.
  - NOT excluded: revealed (linked) numbers, also when faded; revealed zeros that are not unlinked (invisible but pickable).
  - Selected cell → `selected`; its 26 neighbours → `nearSelected`.
- Mouse actions fire on **button release**:
  - Left release: if chord-toggle set → clear it, nothing else. Else if Right is held → set toggle, chord(selected). Else if a cell is selected → start timer if not started, leftClick(selected).
  - Right release: if toggle set → clear it. Else if Left held → set toggle, chord(selected) (guard no selection). Else if selected → rightClick(selected).
- Mouse wheel: spacing.
- **Left Shift held**: unrevealed and flagged cells fade to alpha 0.2 unless nearSelected or selected; revealed numbers fade to 0.2 unless selected ("show only cells adjacent to the aimed cell").
- **Space held**: crosshair passes through revealed cells; revealed numbers drawn at alpha 0.2.
- **Left Ctrl held**: hidden cells (revealed zeros + unlinked) drawn opaque with their number texture.
- Selected cell tinted (1, 0.8, 0.8) (pinkish).
- Esc / F5 in the original = exit / restart. Web port: pause menu instead (resume, restart, main menu).

## Drawing rules (per cell)
| State | Visual | Alpha |
|---|---|---|
| flagged | flag tile | 0.2 if Shift and not (nearSelected or selected) |
| unrevealed | blank closed tile | same as flagged |
| revealed number ≥1, linked | number tile | 0.2 if Space; else with Shift 0.2 unless selected |
| revealed mine (after loss) | mine tile | 1 |
| revealed zero, or unlinked | hidden | (shown opaque with number tile when Ctrl held) |

Original drew with no depth buffer, painter's order (far→near) + backface culling; transparency must look right (sort transparent cubes back-to-front).

## Cube face orientation (from Cube.cs)
Local corners for a cube spanning [-3,1]³: TLF(-3,1,-3) BLF(-3,-3,-3) TRF(1,1,-3) BRF(1,-3,-3) TLB(-3,1,1) TRB(1,1,1) BLB(-3,-3,1) BRB(1,-3,1).
UV: tTL=(1,0) tTR=(0,0) tBL=(1,1) tBR=(0,1) (v=0 is top of image).
- Front z=-3: TLF tTL, BLF tBL, TRF tTR | BLF tBL, BRF tBR, TRF tTR
- Back z=1: TLB tTR, TRB tTL, BLB tBR | BLB tBR, TRB tTL, BRB tBL
- Top y=1: TLF tBL, TRB tTR, TLB tTL | TLF tBL, TRF tBR, TRB tTR
- Bottom y=-3: BLF tTL, BLB tBL, BRB tBR | BLF tTL, BRB tBR, BRF tTR
- Left x=-3: TLF tTR, BLB tBL, BLF tBR | TLB tTL, BLB tBL, TLF tTR
- Right x=1: TRF tTL, BRF tBL, BRB tBR | TRB tTR, TRF tTL, BRB tBR
Note: XNA is right-handed like three.js but the start camera looks toward +Z; the visual requirement is simply that numbers read correctly (not mirrored) on faces seen from outside. Verify visually.
