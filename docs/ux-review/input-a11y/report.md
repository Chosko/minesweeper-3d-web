# Input methods and accessibility — report

## Method

Played headless (Playwright, Chromium with SwiftShader WebGL) against
`http://127.0.0.1:8080/index.html`. Scripts, logs and screenshots are in this
folder (`k*.mjs` keyboard, `g*.mjs` controller, `t1.mjs` touch, `m1.mjs` mouse,
`z1.mjs` zoom / forced-colours / dark theme, `cb.mjs` colour-vision simulation).
Every screenshot named below was looked at.

- **Keyboard only, 1280×800**: launch → menu → Classic 2D board choice → Beginner
  (arrows, Space/Enter, F, D, Esc, held-arrow auto-repeat) → pause → resume →
  custom 2×1 board filled from the keyboard → win → results → Watch replay
  (Space, ←/→, Home/End, =/-, Esc) → Records (Tab, arrows on the 2D|3D switch) →
  Settings (Dark theme chosen with Enter) → Controls modal → Beginner lost by
  exhaustive reveal (results in dark theme). Then 3D: board choice → "Click to
  play" by Enter → fly with W, try to look with arrows, H, M, F, Esc pause →
  Resume by Enter → Main-menu confirmation → Esc. Eight 2D games and two 3D
  games in total.
- **Controller**: a fake standard-layout Xbox pad injected through
  `navigator.getGamepads` (the pattern of `tests/shell-menu.test.mjs`), later
  swapped for a PlayStation id. Menus, Settings, the 2D and 3D custom forms
  (LB/RB stepping, held RB), the No-guess switches, 2D play (D-pad and stick, A,
  X, Y, LT, RT, LT+RT chord, held A), results, Records, the replay viewer
  (Start, Y, LT/RT, LB/RB, seek), 3D play (sticks, dead zone, RT on release, LT,
  LB/RB/Y view modes, D-pad spacing, X panel, Start/Back/B pause, A held across
  Click-to-play → play, disconnect, reconnect).
- **Touch**: iPhone 13 portrait and landscape, iPad Pro 11 portrait and landscape
  (`hasTouch: true`; taps, plus raw CDP touch sequences for long-press, two-finger
  tap and swipe). Menu, both board choices, Beginner and Expert 2D, pause, the 3D
  "Click to play" card, Records, Settings, Controls modal; screenshots of each.
- **Mouse, 1280×800**: press vs release, release off the board, drag to another
  cell, right button on press, middle button, double click, both-button chord,
  context menu, wheel and Shift+wheel on a 60×60 board, Shift+drag pan, plain
  drag on a scrolling board, cursor shapes.
- **Vision**: colour-vision simulation (Machado protan/deutan/tritan matrices,
  CIE ΔE) of the 2D number tokens in both themes and of the 3D 1–26 palette as
  `js/textures.js` generates it; font census at 1024×768; 200 % zoom (640×400 at
  DPR 2); `forced-colors: active` and `prefers-reduced-motion: reduce`
  emulation; the repo's own contrast tests (`tests/components.test.mjs`, 37 of
  37 pass, `contrast-test.log`).
- **Semantics**: focus order, focus restore, focus containment, roles, names,
  live regions and landmarks read from the live DOM.

What the environment prevented or distorted: pointer lock is granted headless
even on the emulated phones, so the touch 3D finding below is what an
Android/Chromium tablet would do, not iOS Safari; no rumble hardware (the
dual-rumble call is confirmed in code only); no real screen reader (roles and
names read from the DOM); CPU contention from other reviewers' sessions slowed
rendering, so timings are approximate; keyboard-lock / Ctrl+W behaviour cannot
be observed headless.

## Problems

### Touch 2D has no way to flag
- Severity: major (a blocker for anyone playing on a phone or tablet — the
  product says touch is unsupported, but the 2D board is served and half works)
- Player path: phone / tablet player
- Where: Classic 2D board, any size
- What happens: a tap reveals (observed: the timer starts, cells open). A 700 ms
  long-press does nothing, a two-finger tap does nothing, and there is no flag
  button anywhere on the screen, so every game that needs a flag or a chord is
  lost. The menu's warning speaks of 3D ("needs a mouse and keyboard"), so the
  2D player is never told flags are missing.
- Evidence: observed — `ip-p-03-c2d-board.png`, `ip-p-04-c2d-tapped.png`,
  `ip-p-05-c2d-longpress.png`; `t1.log` ("long press 700ms: before 10 after …
  m: '10'", "two-finger tap … m: '10'")
- Proposed solution: on a coarse pointer, a ≈400 ms long-press toggles a flag
  (with `navigator.vibrate(20)` where available), and a **Reveal | Flag** mode
  switch (44 px tall) sits in the overlay bar so one-handed players can flag by
  tapping; a tap on a revealed number chords. Alternative: keep touch
  unsupported, but then say so on the 2D board choice and hide the custom form
  on coarse-only devices.

### Large 2D boards cannot be scrolled by touch
- Severity: blocker on phones for Expert and any board wider than the screen
- Player path: phone / tablet player on Expert or a custom board
- Where: Classic 2D board when it is larger than the view
- What happens: Expert on iPhone 13 portrait shows the top-left 9×14 cells at the
  minimum tile size; a swipe does nothing (identical screenshots before and
  after); there is no scrollbar, pinch or pan handle, so three quarters of the
  board can never be reached. On iPad Pro 11 portrait Expert fits at 27 px tiles
  (`ipad-p-07-expert.png`), so this bites phones and custom boards. (Mouse wheel
  and Shift+drag work on desktop — observed.)
- Evidence: observed — `ip-p-07-expert.png`, `ip-p-08-expert-swiped.png`
- Proposed solution: one-finger drag pans when the board scrolls (a touch that
  moves < 8 px stays a reveal), two-finger drag always pans, pinch zooms between
  the minimum tile size and fit-to-view. Alternative: fit the board to the
  screen and let the player pinch to zoom in.

### A touch player can enter 3D play and cannot get out
- Severity: major (a blocker on the devices it happens on; confirm on hardware)
- Player path: tablet / phone player who taps 3D → a board → "Click to play"
- Where: 3D ready card → play
- What happens: the ready card shows "Minesweeper 3D needs a mouse and keyboard —
  open it on a desktop browser" but stays a tappable button. In the emulated
  iPhone the tap acquired pointer lock and entered play: a tap in the scene
  reveals the aimed cube (observed — the timer started and cubes opened), a drag
  does not look (camera unchanged), and the overlay bar's **Pause** cannot be
  tapped because the scene canvas intercepts the touch (Playwright: "canvas#scene
  intercepts pointer events"). No Esc, no Back: the only way out is to reload,
  and the game is then recorded as a loss.
- Evidence: observed in Chromium touch emulation — `ip-p-10-3d-ready.png`,
  `ip-p-11b-3d-playing-phone.png`; `t1.log` ("tap Click to play → playing",
  "tap Pause → FAILED … canvas#scene intercepts pointer events"); reproduced on
  iPhone landscape and iPad portrait (`t1b.log`). Read: without
  `requestPointerLock` (iOS Safari) `onLockError` keeps the ready card with the
  message, so the trap is Android/Chromium-shaped.
- Proposed solution: on a coarse-only device make the ready card a non-button
  notice with one **Back** action and never request pointer lock; keep the
  overlay bar above the scene for input during lockless play so Pause is always
  tappable; or build the touch 3D controls listed under Improvements.

### Classic 2D never shows its own controls in game
- Severity: major
- Player path: first-time keyboard or controller player in 2D; anyone who pauses
  in 2D
- Where: 2D HUD, 2D pause card, main-menu Controls modal, the H and M keys
- What happens: in 2D the HUD hides the "H help · M sound · F fullscreen · Esc
  menu" strip, H does nothing, M does nothing, and the pause card shows the **3D**
  list (Mouse Look, WASD Fly, Wheel Spacing, Shift/Space/Ctrl view modes) with 3D
  settings (Look sensitivity, Invert look Y). The main-menu **Controls** modal is
  3D-only too. The only place Arrows / Space / Enter / F / D / middle click are
  written is Settings → Bindings, three screens away. The 3D list actively
  misleads a 2D player ("Space: aim through numbers").
- Evidence: observed — `k-05-c2d-paused.png`, `k6-2d-h.png`; `k6` run ("2D: H →
  help visible false", "M → muted false"); modal text in `k2b.log`
- Proposed solution: give the pause card and the Controls modal a per-mode list
  (2D: Left/Middle reveal · Right flag · Left+Right chord · Arrows cursor ·
  Space/Enter reveal · F flag · D chord · Esc pause, plus the controller row) and
  the 2D settings block (volume, sound) instead of look sensitivity; make H open
  the same help panel in 2D and M toggle sound in 2D; show a dismissable
  "Arrows move · Space reveal · F flag · D chord" strip on the 2D HUD the first
  time a keyboard or pad is used, like the 3D "H controls" hint.

### 3D is unplayable with a keyboard alone
- Severity: major
- Player path: keyboard-only player (motor impairment, broken trackpad, no
  controller)
- Where: 3D play
- What happens: Enter on "Click to play" works and WASD / QE fly, but there is no
  key to look and no key to reveal, flag or chord; arrow keys do nothing (yaw
  unchanged after holding ←). The crosshair points where the camera started, so
  the player flies into the board and sees sky, and can never act on a cube.
  Neither the Controls modal nor the ready card says a mouse or controller is
  required.
- Evidence: observed — `k3.log` ("cam after ArrowLeft … yaw unchanged"),
  `k3-06-after-w.png`
- Proposed solution: keyboard look on the arrow keys (or I/J/K/L) at a rate tied
  to Look sensitivity; Enter reveals, F flags, D chords the aimed cube (the 2D
  letters, so the modes agree); optionally a "step aim" mode where Tab /
  Shift+Tab cycle the crosshair through the closed cubes in view. Until then,
  write "3D needs a mouse or a controller" on the ready card.

### Controls modal is unreadable in the dark theme
- Severity: major
- Player path: any dark-theme player opening **Controls** from the main menu
- Where: main menu → Controls
- What happens: the modal card keeps a hard-coded white background
  (`rgba(255,255,255,0.95)` in `css/style.css`) while its text uses the
  dark-theme ink tokens, so the whole term column (Mouse, Left click, Right
  click, Left + Right, Wheel, Hold …) is pale grey on white and effectively
  invisible; the key caps turn into dark pills on white and the backdrop stays
  light blue. The in-game H panel and the pause card are themed correctly.
- Evidence: observed — `k5-modal-dark-5s.png` (compare `k5-modal-light-5s.png`)
- Proposed solution: build the modal card from the kit's surface tokens
  (`--color-surface-raised`, `--color-border`) and the backdrop from the theme's
  backdrop token, and add the modal to the contrast test's screen list.

### Controller D-pad walk skips controls (2D custom form, Records tables)
- Severity: major for controller-only players
- Player path: controller-only player setting a custom 2D board, or opening a
  replay from Records
- Where: Classic 2D board choice; Records; (Settings, mildly)
- What happens (observed walks with a fake pad):
  - 2D board choice, DOWN from Beginner: Intermediate → Expert → **Start** →
    **Mines** → Back. Width, Height and the **No-guess** switch are never visited
    going down; the switch is reached only by UP from Back, Width only by UP from
    the switch, Height only by RIGHT from Width.
  - Records, DOWN from the board picker: best-time **Watch** → Pinned first →
    Back. The recent-games **Watch** and the replay list's **Watch / Pin** are
    skipped; from "Pinned first", RIGHT lands on **Back** first, then Watch, then
    Unpin. A controller player who wants to rewatch a past game will not find it.
  - Settings, DOWN from Look sensitivity: Invert Y → Volume → Mute → Back; the
    Graphics and Theme columns need RIGHT (workable, not obvious).
  The 3D custom form walks fine because its switch sits between the presets and
  the fields.
- Evidence: observed — `g3.log`, `g2-05-records-pad.png`,
  `g3-01-records-walk.png`
- Proposed solution: when the spatial search finds nothing in the pressed
  direction's cone, fall back to the next / previous focusable in DOM order so
  every control is on the walk; or lay the custom forms out so DOWN from the
  last preset lands on the first field and DOWN from the fields lands on the
  switch; in Records make each table row's Watch a stop in the DOWN walk.

### Controller players see keyboard hints everywhere in 3D
- Severity: minor
- Player path: controller-only player
- Where: 3D HUD strip, the "H controls" hint, the 3D and 2D pause cards
- What happens: with a pad in use the HUD strip still reads "H help · M sound on
  · F fullscreen · Esc menu", the bottom-right hint says "H controls" (the pad
  opens it with X), and the pause card lists mouse and WASD only. The ready card
  does show "Controller: A play · RT reveal · LT flag · both chord · Menu pause",
  and the X panel shows the right glyphs for Xbox and PlayStation (observed).
- Evidence: observed — `g-06-playing-pad.png`, `g-10-pause-pad.png`,
  `g-07-help-xbox.png`, `g-13-help-ps.png`, `g4.log`
- Proposed solution: while `body.pad-nav` is set, swap the strip and hint to pad
  glyphs (X help · Menu pause) and show the pad rows on the pause card.

### Modal and overlay focus is not contained
- Severity: minor (major for screen-reader users)
- Player path: keyboard and screen-reader players
- Where: Controls modal, pause card, pause confirmation, results, replay viewer
- What happens: Tab from the modal's close button goes to the body and then to
  the blurred menu entries behind it (`aria-modal="true"` without `inert`). From
  the pause card and the results card, Tab reaches the HUD's Pause button
  blurred behind the overlay; in the replay viewer Tab from the seek slider lands
  on the hidden 2D HUD Pause button; in the "This game will count as a loss"
  alertdialog Tab from Cancel goes to the Look sensitivity slider under it. A
  keyboard player loses the focus ring behind a blur; a screen reader hears the
  whole page.
- Evidence: observed — Tab orders in `k2.log`, `k2b.log`, `k4.log`
- Proposed solution: set `inert` on every other top-level section while a modal
  overlay (controls modal, pause, results, confirmation) is open, or wrap Tab at
  the overlay's edges; while the confirmation shows, make the rest of the pause
  card inert.

### Results and state changes are silent for assistive tech
- Severity: minor (screen reader)
- Player path: screen-reader user
- Where: results screen, pause, replay viewer
- What happens: on a win or loss focus moves to **Play again** and nothing
  announces "You won!" / "Game over" or the time; the HUD is `aria-live="off"`
  (right for the timer) but no polite region carries events. The generation
  card, the replay end line and the toast do have `role="status"` (good).
- Evidence: observed — `k4.log` ("live regions []" on results)
- Proposed solution: focus the results heading (`tabindex="-1"` on
  `#results-title`) or add one polite live region fed with "You won — 47.3 s",
  "Game over", "Paused", "Resumed".

### The boards have no text alternative
- Severity: major for blind players (the game itself is unplayable with a screen
  reader); none for others
- Player path: screen-reader user
- Where: 2D board canvas, 3D scene canvas
- What happens: the 2D board is a bare `<canvas>` with no role, name or content;
  the 3D canvas has only `aria-label="3D minesweeper board"`. Menus, settings,
  Records and the replay controls are real buttons, radios and switches with
  names and headings, so a blind player reaches a board and then nothing.
- Evidence: observed — `k4.log` ("2D board canvas { role: null, label: null …}")
- Proposed solution (2D, realistic): an off-screen description plus a live
  region that speaks the cursor cell on every keyboard move ("row 3, column 5,
  closed" / "2" / "flag") and the effect of each action ("opened 12 cells"). 3D:
  at least label the canvas with board size and mines left and announce the
  aimed cube's number.

### Reduced motion is honoured by CSS only
- Severity: minor (major for vestibular-sensitive players)
- Player path: players with `prefers-reduced-motion`, or motion-sensitive players
  without an OS setting
- Where: menu background, 3D play, 3D win / loss, 2D loss flash
- What happens: with reduced motion the CSS kills transitions and keyframes, but
  the JS effects ignore it: the demo cube keeps orbiting behind every menu, the
  aimed-cube outline keeps pulsing, the loss plays the reveal wave with screen
  flash and camera shake, the win plays the pulse wave and confetti. No in-game
  "Reduce motion" setting exists. The loss flash is a single 0.9 s fade (no
  repeated flashing), so it is not a seizure hazard.
- Evidence: read (`js/` has no reduced-motion check; `css/style.css` has the
  media query); the orbiting demo observed in every menu screenshot
- Proposed solution: read `matchMedia('(prefers-reduced-motion: reduce)')` plus a
  **Reduce motion** setting (Settings → Graphics): freeze the demo board, replace
  waves / shake / confetti with instant reveals and a static tint, make the
  outline solid instead of pulsing.

### Number colours are not colour-blind safe
- Severity: minor (digits carry the value; colour is a secondary cue)
- Player path: protan / deutan / tritan players, mostly in 3D where 1–26 are
  scanned across many faces
- Where: 2D tiles, 3D cube faces
- What happens (simulation in `cb.log`): 2D light theme — protan and deutan
  bring 2/3 (ΔE 16–19), 3/5 (13–18) and 6/8 (10–17) close; tritan brings 2/6 to
  ΔE 6. The dark theme is worse: deutan 2/3 ΔE 6, 3/5 ΔE 6, 2/5 ΔE 8, 4/6 ΔE 8.
  3D 1–26: even with normal vision 6/24 (ΔE 3), 13/26 (4), 2/21 (6) and 13/21
  (9) are near-identical; under deuteranopia dozens of pairs fall under ΔE 10.
  Every number keeps ≥ 4.5:1 contrast against its tile (verified).
- Evidence: computed — `cb.log`; palettes read from `css/tokens.css` and
  `js/textures.js`
- Proposed solution: the colour-blind-safe set the design already defers
  (Settings → Accessibility): Okabe–Ito-based hues for 1–8 and, in 3D, hue plus
  a second cue (glyph weight or a corner mark pattern for 9–17 / 18–26). The
  digit stays the primary cue in both modes.

### No rebinding, no left-handed or one-handed option
- Severity: minor (major for left-handed mouse users in 3D)
- Player path: left-handed player (mouse on the left, WASD out of reach),
  one-handed player
- Where: Settings
- What happens: Settings → Bindings is a read-only list; the rebinding feature is
  PLANNED (`.claude/FEATURES.md`). WASD + Q/E + mouse is fixed. Keys are physical
  codes (`KeyW` …), which helps AZERTY but not a left-handed mouse player. Look
  sensitivity 0.25–3× and Invert Y exist and apply to the right stick too
  (observed).
- Evidence: read — `js/settings/schema.js`; observed — `k-19-settings.png`
- Proposed solution: ship the planned rebinding; until then a "Left-handed
  (arrows fly, Right Ctrl / Shift view modes)" preset and a "swap mouse buttons"
  toggle.

### Timer pressure cannot be switched off
- Severity: minor
- Player path: anxious or cognitively loaded players, learners
- Where: HUD in both modes
- What happens: the time counter is always on and prominent; nothing lets a
  player hide it or play untimed.
- Evidence: observed — every HUD screenshot
- Proposed solution: a **Show timer** toggle (records still count; the results
  screen shows the time afterwards).

### Esc after a pointer-lock release ignores a second press
- Severity: minor
- Player path: 3D mouse player who presses Esc twice quickly
- Where: 3D pause
- What happens: in 2D Esc toggles pause / resume (observed). In 3D the browser's
  Esc releases the lock and the game pauses, and a second Esc inside 500 ms is
  ignored by design, so a quick double Esc appears to do nothing and the player
  must click Resume. Enter on Resume re-locks the pointer in the same gesture
  (good, observed).
- Evidence: observed — `k3.log` ("Esc → paused", "Esc again → paused")
- Proposed solution: ignore only the Esc that caused the unlock, or print "Press
  Esc or click Resume" on the pause card so the state is clear.

### Small text and small targets
- Severity: minor
- Player path: low-vision players at 1024×768; touch players
- Where: HUD labels, pause-card key caps, switches, sliders, footer link
- What happens: at 1024×768 the HUD labels TIME / MINES / BOARD are 11 px, the
  pause card's key caps 10 px, menu detail lines and form labels 13 px. On touch
  the switch control is 44×24 (its label enlarges the hit area), the volume and
  sensitivity sliders are 28 px tall, the footer link 19 px, the hint close ×
  28 px. Browser zoom to 200 % works: every overlay scrolls, nothing is cut off,
  the Expert board scrolls (`z-07-expert-zoom200.png`, `z-08-pause-zoom200.png`).
- Evidence: observed — `z1.log`, "small targets" lines in `t1.log`
- Proposed solution: 12 px minimum for labels and 11 px for key caps; 44 px hit
  areas for switches and slider thumbs on coarse pointers.

### Forced-colours mode leaves the canvas boards in their own colours
- Severity: minor
- Player path: Windows High Contrast players
- Where: 2D board, 3D scene
- What happens: the DOM screens adapt well (borders and focus rings survive,
  `z-11-menu-forced-colors.png`), but the 2D board keeps its blue palette with a
  thin dark cursor ring, so the player's chosen colours never reach the board.
- Evidence: observed — `z-13-2d-forced-colors.png`
- Proposed solution: under `forced-colors: active` draw the 2D tiles from the
  system colours (`Canvas`, `CanvasText`, `Highlight`) and thicken the cursor
  ring to 4 px.

## Improvements

### Touch controls for 3D
- Player path served: tablet players (the box of cubes reads very well at iPad
  size; the menus already lay out perfectly at 834 px and 390 px)
- Why it matters: 3D is the product's identity and a whole device class is
  locked out by input alone.
- Sketch: left-thumb virtual stick to fly, one-finger drag on the right half to
  look, tap to reveal, long-press to flag, two-finger tap to chord, pinch for
  spacing, a view-modes toolbar (Shift / Space / Ctrl as toggles) and a Pause
  button that stays above the scene; pointer lock is never requested on coarse
  pointers.

### Orbit camera as an accessibility option
- Player path served: motion-sensitive players, keyboard-only players, newcomers
  who find first-person flight disorienting
- Why it matters: first-person flying is the biggest cognitive and vestibular
  cost of 3D; an orbit camera lets the board be examined without moving the
  player.
- Sketch: Settings → Controls → **Camera: Fly | Orbit**. Orbit keeps the board
  centred; drag / stick / arrows rotate around it, wheel / triggers dolly, the
  crosshair stays centred; keyboard look and keyboard actions (Enter / F / D)
  fall out of it naturally.

### A Settings → Accessibility panel
- Player path served: colour-blind, motion-sensitive, anxious and low-vision
  players
- Why it matters: the design already names "accessibility (colour-blind-safe
  numbers)" as a settings area; nothing of it exists yet.
- Sketch: Colour-blind-safe numbers, Reduce motion, Show timer, Large cursor
  ring, Left-handed preset.

### One help source per mode, shown everywhere
- Player path served: every new player
- Why it matters: `js/settings/bindings.js` already feeds the Settings list; the
  pause card, the Controls modal and the H panel should read it too.
- Sketch: the pause card and the modal render the active mode's list with the
  active device's glyphs; H opens the panel in both modes.

### Pad-aware Records and replay viewer
- Player path served: controller-only player
- Why it matters: "Records works with a controller" is true but the routes are
  hidden.
- Sketch: in Records LB / RB switch boards and LT / RT switch 2D | 3D; the
  table Watch buttons are in the DOWN walk; the replay seek slider shows the
  pad's left / right hint.

### Haptics as input feedback
- Player path served: controller and touch players
- Why it matters: release-to-act needs a press cue; today the pad rumbles only
  on an explosion (read, `js/main.js` `playEffect('dual-rumble')`).
- Sketch: a 10 ms pulse on RT / LT press, a short double pulse on a flag; on
  touch, `navigator.vibrate` on a long-press flag.

## What works well

- Every screen is fully operable by keyboard; Enter on "Click to play" captures
  the pointer; Esc / Back is consistent (results → menu, ready → board choice,
  Records / Settings → where you came from); focus is restored to the right
  control every time (Play again after Records, Resume after a cancelled
  confirmation, Cancel focused when the confirmation opens).
- Focus rings are strong in both themes, with a heavier ring for pad navigation;
  segmented controls use roving tabindex and arrow keys correctly.
- Controller support is thorough: 0.15 dead zone, reveal on RT release with
  press feedback, LT+RT chord shows the pressed neighbours, held buttons are
  suppressed across Click-to-play → play, disconnect pauses with a note,
  PlayStation glyphs are right, the ready card carries a pad hint.
- Mouse semantics are faithful and safe: press shows the pressed tile, release
  off the board cancels, right-click flags on press with the context menu
  suppressed, middle click reveals, both-button chord, Shift+drag and wheel
  scroll large boards, the keyboard cursor scrolls into view.
- Menus and forms are real buttons, switches, radiogroups and labelled fields;
  headings and labelled sections give landmarks; the Records chart has a spoken
  text alternative that updates ("3BV/s from 500.00 to 1000.00 …").
- Layouts survive phones, tablets and 200 % zoom without horizontal scroll; the
  dark theme is complete for every screen except the Controls modal; the
  overlay bar passes the repo's contrast tests in both themes.

## Open questions for the director

- Is touch a target at all for the web build? 2D is 80 % there (taps and
  layouts work); the flag affordance and panning are the missing 20 %.
- Should 3D promise keyboard-only play (keyboard look + Enter / F / D), or is
  "mouse or controller required" the accepted contract to state on the ready
  card?
- Is the planned rebinding feature (m3) the vehicle for left-handed and
  one-handed options, or should a simple preset toggle ship earlier?
- Where should accessibility settings live — a Settings → Accessibility panel as
  the product design suggests?
