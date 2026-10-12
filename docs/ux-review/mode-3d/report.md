# First-person 3D game UX — report

## Method

Played the 3D mode in headless Chromium (swiftshader WebGL) at 1280×800, with
spot checks at 640×400 (end-effect frames), 1024×768 and 1920×1080, light and
dark theme. Path covered: main menu → 3D board choice → Click to play → spawn →
first click → flying (W/A/S/D/Q/E held through the frame loop) → aiming,
reveal, right-click, chord with real mouse buttons → Shift / Space / Ctrl →
wheel spacing → Esc pause / Resume / Restart / Main menu confirmations →
loss (end wave → results) → Watch replay (play, seek, End) → win (confetti →
results with bests) → Records 3D → returning player board choice.

Games: ~60 board starts through the `__ms` hook (first-click statistics on all
three presets, standard and no-guess, 8 each), 6 games played through the real
UI buttons and mouse, 2 finished games (one loss, one win) on real generated
Cube Beginner boards, 1 replay of each watched.

Headless limits: pointer lock DID engage (`page.click('#ready-btn')` locked the
canvas), but Playwright's `mouse.move` carries no `movementX` under lock, so
mouse look was driven with synthetic `mousemove` events (verified: 100 px =
20.0°) and with `__ms.look`. Fullscreen (`F`) flips the setting but no
`fullscreenElement` appears headless, so Keyboard Lock is unverified. Sound
cannot be heard; sound findings are read from `.claude/context/audio.md` and
`js/main.js` call sites. Controller play is out of my scope. Frame rate under
swiftshader (2–50 fps) says nothing about real GPUs; I did not judge
performance. Screenshots of the end effects were read back from the WebGL
canvas (no DOM overlays) because a full-page screenshot takes longer than the
1 s end delay. All screenshots are in this folder.

## Problems

### Spawn view cuts the box in half and reads as a flat wall
- Severity: major
- Player path: every player, every game; worst for the first-time player
- Where: the first frame after "Click to play" (and after Play again / Resume)
- What happens: the camera spawns 10 units above the box centre, looking
  level, at the original's distance. On Cube Beginner only 4 of the box's 8
  corners project on screen (NDC y from −1.83 to +0.07): the lower half of the
  front face is cut off by the bottom edge, the upper half of the screen is
  empty sky, and the crosshair rests on the top row. The box is seen dead-on,
  so no side face is visible: the first thing a new player sees is a 2D wall of
  36 identical blue tiles with no hint that it is 6 deep. Expert (12×12×8) and
  Intermediate are the same (6/8 corners, bottom rows cut). A player who has
  never flown has to work out "I am above it, looking straight ahead" from
  nothing.
- Evidence: observed — `05-spawn-view.png`, `48-expert-spawn.png`,
  `49-intermediate-spawn.png`, `03-ready-card.png` (the card over the same
  half-cut view); numbers from `boardOnScreen` in `s1-onramp.mjs`.
- Proposed solution: frame the spawn so the whole box fits — distance from the
  bounding sphere and the vertical FOV, crosshair on the box centre — and offset
  the camera up and to one side (a classic 3/4 view, pitch ≈ −15°, yaw ≈ 20°)
  so three faces are visible and the box reads as a solid. Fidelity note: the
  original's start pose is pinned by `docs/ORIGINAL_SPEC.md`; the replay and
  the picking do not depend on it, so this is a product decision, not a rules
  change. Alternative, if the pose must stay: a 0.8 s automatic fly-in from a
  3/4 orbit position to the original pose when the game starts, which shows
  the depth once and lands on the pinned pose.

### The standard first click usually opens nothing; the no-guess first click opens most of Beginner
- Severity: major
- Player path: first-time player on Cube Beginner (standard); enthusiast on
  no-guess Beginner
- Where: the first left release
- What happens: with 26 neighbours a cascade is all or nothing. On standard
  boards the first click opened a single lone number in 3 of 8 Beginner games,
  4 of 8 Intermediate and 5 of 8 Expert games: the player stands in front of
  215 closed cubes with one "1" and no deduction possible — the second click
  is a blind guess, which Minesweeper players hate and new players do not even
  recognise as a guess. With no-guess ON, the first click on Beginner opened
  160–200 of 216 cells every time (8/8): the board is 80–90 % solved after one
  click and the remaining 10 mines are mostly isolated singletons. Cube
  Beginner at 10 mines / 216 cells is therefore either a coin flip or trivial;
  it does not teach anything.
- Evidence: observed — output of `s2-firstclick-stats.mjs` (opened counts per
  click), `07-after-first-click.png` (a lone "1" on a closed wall),
  `20-press-turn-release.png` (a 184-cell cascade).
- Proposed solution: (1) make the 3D first click an opening (a zero) on every
  board, as Minesweeper Online does for its default option — `board-generation`
  already generates around the click, so only the region rule changes; with
  that rule the no-guess solver has the same start as today. (2) Re-tune the
  presets' densities so an opening on Beginner leaves work to do: for a 6³ box
  that means more mines, not fewer (try 6×6×6 with 18–22 mines, or 5×5×5 with
  12–15, and measure the opened fraction with `s2-firstclick-stats.mjs`-style
  runs). (3) Until then, show "No-guess board" as the recommended default on
  the 3D board choice — today it is off, and the standard first click is the
  worse experience.

### A number's depth cannot be read from the front
- Severity: major
- Player path: every player once the first region is open; the whole game for
  a learning player
- What happens: after the first cascade the board is a cloud of "1" cubes. A
  "1" in layer 0 and a "1" in layer 2 are the same size, colour and brightness
  from the spawn (perspective is weak at 46 units with a 45° FOV; the fog starts
  at `distance − 0.25 × radius`, so on Beginner it never tints anything). There
  is no shading by layer, no shadow, no ground, and the gaps between cubes
  (0.4 units at spacing 1.1) are too thin to show columns. The player has to fly
  to the side, or widen the spacing, before they can tell which cubes are a
  number's neighbours — and the whole game is about the 3×3×3 neighbourhood.
- Evidence: observed — `40-fixed-spawn-normal.png`, `20-press-turn-release.png`
  (same board at 24° yaw: still ambiguous), `43-spacing-2.png` (readable only
  once spread apart), `82-top-down.png` (from above the top layer reads fine).
- Proposed solution, in order of fit with the first-person identity:
  1. Highlight the aimed number's 3×3×3 neighbourhood with a thin wireframe box
     (or a coloured edge glow on its 26 cells) at all times, not only under
     Shift — the Shift fade already singles out the cells, the box adds the
     shape and the depth.
  2. Depth shading by lattice distance from the camera in the vertex shader —
     a few percent darker per layer — gives the "wall" relief without fog.
  3. Default spacing 1.5 instead of 1.1 for presets up to Intermediate (gaps of
     2 units show columns; the DDA and replay already carry spacing).
  4. A layer-slice mode as a held key (e.g. hold `X`: only the aimed cube's
     layer along the view axis is drawn) — a stronger tool, still first-person.

### Flying through cubes fills the screen with clipped faces
- Severity: major
- Player path: first-time player (the first W press); anyone approaching a
  cube
- Where: any time the camera enters the box at default spacing
- What happens: cubes are 4 units with 0.4-unit gaps, the camera has no
  collision and the near plane is 1 unit, so W at 50 u/s carries the camera
  into a cube in under a second. The screen becomes one or two giant clipped
  slabs of colour — inside a revealed "2" it is a pink screen with a 2 the size
  of the window. Picking still works from inside (the ray hits the next cube),
  so a click in that state acts on a cube the player cannot identify. One
  second of W from the spawn goes from z = −46 to z = −19.6, two seconds to
  z = +8 — inside the box.
- Evidence: observed — `08-after-W-1s.png`, `09-after-W-2s.png`,
  `10-inside-look-right.png`, `11-inside-look-fwd.png`,
  `47-inside-cube-default.png` (`selected` = 166 while inside cube (4,0,0)).
- Proposed solution: keep free flight (it is the identity) but fade cubes
  whose centre is within ~1.5 pitches of the camera to 20–30 % alpha and make
  them unpickable, so the player flies "through glass" and always aims at
  something they can see; the same shader path as the Shift fade. Alternative:
  a slower speed inside the box (25 u/s when the camera is within the bounding
  box) so entering it is deliberate. A hard collision would fight the
  original's feel and the spacing-1.1 gaps are too thin to navigate.

### W does not go where you look
- Severity: major (with a fidelity caveat)
- Player path: first-time player; anyone trying to approach a cube
- What happens: the forward vector keeps full horizontal speed at any pitch
  (the original's quirk, pinned in `.claude/context/input.md`). Looking straight
  down and pressing W moves 17.7 units down AND 17.7 units forward in 0.5 s;
  at 45° pitch W moves at 43 u/s along a direction 20° off the view ray; A/D
  strafe stays horizontal. In practice the cube under the crosshair slides out
  from under it while you fly at it, and approaching a lower layer needs Q
  instead of looking down.
- Evidence: observed — numbers from `s7-edges.mjs` ("W while looking straight
  down", "W at pitch 45").
- Proposed solution: a Settings → Controls switch "Fly where you look" (true
  forward vector, 50 u/s along the view ray), default ON for new installs; the
  replay records positions, not inputs, so replays are unaffected. If fidelity
  must win, keep the quirk as the default and offer the switch.

### Nothing in the world but the box: easy to lose it, no way back
- Severity: major
- Player path: first-time player who holds W or S for a few seconds; anyone
  who turns around at speed
- What happens: the scene is a sky gradient with no horizon, ground or
  reference. Looking anywhere but at the box shows a flat gradient and the
  crosshair dims (`22-looking-at-sky.png`). Eight seconds of S puts the box
  400 units away, a 60-px blob (`81-far-400.png`); at 1500 units it is a
  speck (`80-far-1500.png`). There is no indicator of where the box is when it
  is off-screen, no "return to start" key, and no speed limit on leaving.
- Evidence: observed — screenshots above.
- Proposed solution: (1) a `Home`/`R` key (and a pause-card button) "Back to
  start" that resets the camera to the spawn pose; (2) an off-screen arrow on
  the crosshair ring pointing to the box centre while the box is not in view;
  (3) a faint ground grid or horizon line below the box for orientation. Each
  keeps first-person flight intact.

### Right-click on a number mass-flags out of sight and pushes the counter negative
- Severity: major
- Player path: every player coming from 2D Minesweeper (where right-click on a
  number does nothing); any player whose right-release lands on a number
- Where: right button released while the crosshair is on a revealed number
- What happens: the 3D rule flags ALL closed neighbours of the number,
  ungated by its value. On a "3" with 15 closed neighbours one right-click
  placed 15 flags and the mine counter went from 10 to −5; 14 of those flags
  were behind the front face, invisible from where I stood. Since actions fire
  on release, a right press that drifts onto a number while turning does this
  by accident. Undo is a second right-click on the same number — if the player
  realises what happened.
- Evidence: observed — `95-mass-flag-result.png` (MINES −5 in red, one visible
  flag), output of `s10-massflag.mjs`.
- Proposed solution: gate the mass flag on the count (flag all closed
  neighbours only when closed + flagged == number, the "reverse chord" every
  2D player expects; otherwise play the no-op sound and pulse the neighbourhood
  outline). This is a rules change against `docs/ORIGINAL_SPEC.md`; the 3D
  profile already diverges on the safe first click. Alternative: keep the rule
  but show it — flash the 26-cell box and play the mass-flag sound at a volume
  proportional to the count, and clamp the counter display with a "too many
  flags" tint.

### Space (aim through numbers) is the tool the game needs and nobody tells the player
- Severity: major
- Player path: first-time player; every player on their first closed cube
  behind an open region
- What happens: once a region is open, the closed cubes that matter sit behind
  revealed numbers; the crosshair picks the number in front, left-click on it
  is a no-op, right-click is the mass flag above. Only holding Space lets the
  ray pass through numbers (verified: aiming at mine (2,2,3) selected the "1"
  in front until Space was held). The ready card says only
  "Shift / Space / Ctrl view modes"; the names appear on the chips only while
  the key is held; the H panel calls it "Aim through revealed numbers (they
  fade)", which is right but is one line among twelve.
- Evidence: observed — `41-aim-number.png` vs `42-mode-space.png`,
  `03-ready-card.png`, `25-help-panel.png`, `s6-endgame.mjs` output ("aim at
  mine → 86 (want 122)").
- Proposed solution: (1) on the ready card replace the view-modes line with
  "Hold Space to aim through numbers · Shift to see a number's neighbours";
  (2) a one-time contextual hint when the crosshair has rested on a number for
  1 s and a closed cube is behind it: "Hold Space to aim through"; (3) consider
  Space as a toggle (tap) as well as a hold — holding it while flying with
  W/A/S/D and the mouse is three-hand work.

### The lost board disappears after one second
- Severity: major
- Player path: learning player (the loss is the only lesson); enthusiast
  checking a 50/50
- Where: loss → end wave → results takeover
- What happens: the loss wave reveals the mines and ghosts the numbers for
  ~1 s, then the opaque results card covers the scene and the game "is never
  returned to". The only way to see the mines again is Watch replay → End,
  where the camera is the recorded one and cannot be moved. On a win the
  solved board is likewise gone. The feature doc rejects a closable panel on
  purpose; from the player's seat the rejection removes the one moment that
  teaches 3D reading.
- Evidence: observed — `60-loss-30ms.png`, `60-loss-500ms.png`,
  `60-loss-950ms.png`, `61-results-loss.png` (opaque), `64-replay-later.png`
  (the lost board, fixed camera); `.claude/domain/features/3d-results-records-screens.md`
  (read).
- Proposed solution: a secondary action "Look at the board" on the 3D results
  card that hides the card and re-enters free flight on the frozen board, read
  only (no timer, no actions, Esc or any button brings the card back). It does
  not touch records or replays, and the results screen stays the default end.
  Alternative: make the 3D results surface translucent with the scene paused
  behind — weaker, the card still hides the centre.

### Ctrl "show hidden" hides everything else
- Severity: minor
- Player path: anyone who tries Ctrl
- What happens: hidden cells (zeros and completed numbers) are drawn as opaque
  blank white cubes, so holding Ctrl from the front turns the view into a solid
  white wall covering every number and closed cube. It answers "where are the
  solved cells" only from outside the box.
- Evidence: observed — `42-mode-ctrl.png`.
- Proposed solution: draw hidden cells under Ctrl as 25 % ghosts (same alpha
  path as Shift), so the structure shows without covering the live cells.

### Spacing wheel: tiny steps, the chip is the only readout, the camera does not follow
- Severity: minor
- Player path: anyone who discovers the wheel; enthusiasts who want 2.0
- What happens: one notch = 0.04, so spacing 2.0 is 23 notches; the "Spacing
  2.14" chip shows only while scrolling and fades after ~2 s; the camera stays
  put, so at spacing 2 the box already spills off the spawn view and at 4+ the
  camera is inside the exploded board. Shift + wheel also changes spacing.
- Evidence: observed — `91-wheel-26-notches.png`, `43-spacing-2.png`,
  `43-spacing-4.png`, `s9-choice-wheel.mjs` output.
- Proposed solution: 0.1 per notch with acceleration on fast scrolls; a small
  persistent "Spacing 1.1×" readout in the top-right tools strip; a tap key
  (e.g. `X`) that toggles between 1.1 and 2.0; keep the camera's distance to
  the box centre proportional to the pitch while the wheel is turning.

### No-guess is invisible once chosen
- Severity: minor
- Player path: returning player, enthusiast comparing records
- What happens: with "No-guess board" on, the ready card still reads
  "6 × 6 × 6 · 10 mines", the HUD "6 × 6 × 6", the pause card "10 mines left".
  The player cannot tell which of the two Records boards ("Cube Beginner" vs
  "Cube Beginner · no-guess") this game will count on.
- Evidence: observed — `86-ready-noguess.png`, `s7-edges.mjs` output.
- Proposed solution: append "· no-guess" to the ready card's board line, the
  HUD board readout and the pause card, with the same label Records uses.

### Three time formats on one path
- Severity: minor
- Player path: every player
- What happens: HUD "011" (whole seconds), pause card "Time 11.64 s"
  (hundredths), results "4.6 s" (tenths), replay bar "004".
- Evidence: observed — `23-pause-card.png`, `61-results-loss.png`,
  `62-replay-start.png`.
- Proposed solution: tenths everywhere a precise time is shown (pause card and
  results), whole seconds on the live overlay bar only.

### Narrow FOV, no FOV setting
- Severity: minor
- Player path: players prone to motion sickness; wide monitors
- What happens: the camera FOV is 45° vertical (≈ 67° horizontal at 16:10), a
  "zoomed" view for a first-person game, combined with 50 u/s flight and
  0.2°/px look (100 px = 20°, verified). The sensitivity and invert-Y settings
  exist; FOV does not. Fog and sky are gentle; the real sickness risks are the
  speed, the clipping above and the lack of a horizon.
- Evidence: observed (look rate), read (`fov 45` in `.claude/context/rendering.md`).
- Proposed solution: a Settings → Graphics FOV slider 45–90 (default 60 for
  new installs, 45 kept for fidelity on request); the DDA ray is from the
  camera so picking is unaffected.

### End delay is a flat second on every board size
- Severity: minor
- Player path: Expert and custom-board players
- What happens: the loss wave spreads by lattice distance; on a 12×12×8 or
  20³ board it has not reached the far side when the results card takes over.
  The feature doc lists this as open. Not observed on a large board (headless
  frame rate too low to judge the wave).
- Evidence: read — `.claude/domain/features/3d-results-records-screens.md`
  "Open questions"; `END_DELAY_MS = 1000` in `js/shell/mode-3d.js`.
- Proposed solution: delay = max(1 s, wave duration for the board's diagonal),
  capped at 2.5 s; or the "Look at the board" action above, which makes the
  cut harmless.

## Improvements

### A real Beginner: a board that teaches depth
- Player path served: first-time 3D player
- Why it matters: the product design says the 3D on-ramp is the campaign,
  which is not built; today the on-ramp is "Cube Beginner", which (see above)
  is a coin flip or a one-click solve, seen as a flat wall.
- Sketch: ship one "First box" preset before Beginner: 4×4×2 with 3 mines, or
  5×5×3 with 6 — two or three layers, so every number's neighbourhood is
  visibly a slab, spawned in 3/4 view at spacing 1.5 with the neighbourhood
  wireframe on. Three such boards (2 layers, 3 layers, 4 layers) in a row
  would be the campaign's first chapter in miniature and cost one preset
  table entry each. Keep the first click an opening on them.

### Camera presets and an outside orbit, without leaving first person
- Player path served: enthusiast on Expert who wants speed; learner who is
  lost
- Why it matters: most of the time in 3D is spent repositioning. Expert
  players will want to snap to the six face views and the four 3/4 views
  rather than fly there.
- Sketch: number keys 1–6 (or the numpad) fly the camera in 0.3 s to the six
  face views at a fitting distance, `0` to the 3/4 spawn; `Home` returns to
  where you were. Flight stays free in between. Record the presets in the
  replay as ordinary camera samples (they already are).

### Aimed number's neighbourhood on the HUD
- Player path served: every player
- Why it matters: the aimed number's closed/flagged/needed counts are the
  whole deduction, and in 3D they are hidden behind the number.
- Sketch: a small readout next to the crosshair while a number is aimed:
  "3 · 2 flags · 7 closed" (number, flags around, closed around), which also
  tells the player when a chord would fire. The engine already keeps these
  counters per cell.

### Snap-to-cube aiming at distance
- Player path served: Expert at spawn distance (front cubes are 50 px wide at
  1280×800; 20³ cubes ~35 px)
- Why it matters: at distance a 2-px look movement crosses a cube; release-to-
  act makes slips cheap but not free.
- Sketch: a small angular magnetism on the aimed cube (hysteresis: the
  selection sticks until the ray leaves the cube by ~15 % of its size). Keep
  it off while Space is held so aim-through stays precise.

### Dock the controls panel next to the chips
- Player path served: first-time player
- Why it matters: the first-game hint is one word ("H controls") bottom-right;
  the panel lists twelve rows top-right; the chips name modes at the bottom
  centre only while held.
- Sketch: on the first three games show a compact 3-line strip at the bottom
  centre (Left reveal · Right flag · Hold Space aim through · Hold Shift
  neighbours), dismissable, replacing the "H controls" pill.

### Replay viewer: let the watcher look around
- Player path served: enthusiast reviewing a loss or a best
- Why it matters: in 3D the recorded camera is the player's; watching from the
  same eyes is faithful but the viewer often wants to see what the player
  missed.
- Sketch: a "Free camera" toggle in the replay controls that detaches the
  camera (mouse look + WASD) while the board plays, with "Follow" to snap back.
  Playback comfort is otherwise fine: held samples then interpolation looked
  smooth at 1× in the screenshots (`63-replay-playing.png`,
  `67c-win-replay-end.png`).

## What works well

- Release-to-act with drag-to-cancel feels right: pressing on one cube,
  turning, and releasing on another acts on the release cube (verified), so
  slips cost nothing.
- Esc → pause card → Resume re-captures the mouse in one click; the pause card
  hides the board, shows the controls and the three settings that matter
  (sensitivity, invert Y, volume). Restart / Main menu confirmations say
  "It will count as a loss".
- The aimed-cube outline and pink tint are unmistakable at any distance; the
  crosshair dims when nothing is aimed; the Shift and Space fades are readable
  and the chips name them.
- Numbers 1–26 are distinct and legible at 46 units; the tile atlas is crisp
  face-on and at angle.
- The HUD bar and help panel are legible over the scene in both themes and at
  1024×768 and 1920×1080; the dark theme only touches the overlays, the
  scene keeps its one look.
- End effects are clear: the exploded cube turns red, mines appear as the wave
  passes, the win puts flags on the mines and throws confetti; results show
  the three bests with "New best".
- Ctrl+W is prevented at the page level, the leave guard arms on a started
  game, the H hint is remembered after dismissal, the last preset is marked
  "Last played" and takes focus on return (Enter starts it).
- Generation is instant (≈ 20–60 ms, no-guess Expert included), so the
  "Generating the board…" card never shows in practice.

## Open questions for the director

- Fidelity line: the forward-vector quirk, the ungated right-click mass flag,
  the start pose and the 45° FOV are all pinned to the 2011 original. Which of
  them is the product willing to put behind a setting (or change outright for
  new installs) now that the 3D mode is "one mode among several" aimed at
  Minesweeper enthusiasts?
- Is "the finished board is not flown around afterwards" a hard decision, or
  can a read-only "Look at the board" action live on the 3D results card?
- Should the 3D first click be an opening (a zero), as the 2D reference's
  default option, or stay "safe cell only"? The answer sets Beginner's
  density.
- Is a "First box" preset (two to three layers) acceptable before the campaign
  exists, or does the on-ramp wait for `m4-campaigns`?
- Should no-guess be the default switch state for the 3D presets, given the
  standard first-click statistics above?
