# UX review drift audit

Audited against [docs/UX_REVIEW.md](UX_REVIEW.md) on 15 Oct 2026, at commit 2b5e99d. The build was played in headless
Chromium (SwiftShader WebGL 2) at 1024 × 768 to 1920 × 1080, on an emulated 390 × 844 phone and an 820 × 1180
tablet, with mouse, keyboard and touch, in both themes. The game was driven through its UI and the `__ms` hook. Code
was read where the tasks that closed each item touched it.

## Verdict

The review is essentially delivered. All 74 approved items exist in the build, and every decision and condition is
followed. Five items differ from their proposed solution, each for a recorded reason. Two are defective. The one
defect a player hits at once is that Classic 2D on a phone has no reachable Pause and no reachable Reveal / Flag
switch. Feature documents are consistent except for two passages.

| Group | Implemented as specified | Implemented with drift | Missing | Defective |
| --- | --- | --- | --- | --- |
| 1. Approved P-nn and I-nn items (74) | 67 | 5 | 0 | 2 |
| 2. Decisions taken (18) | 17 | 0 | 0 | 1 |
| 3. Approval conditions (5) | 5 | 0 | 0 | 0 |

Also found: 9 defects outside the numbered items and 2 inconsistent feature-document passages. Test suite: bare
`node --test` passes 1939 of 1942 tests (3 fail), and the project's full script passes 1940 of 1941 (1 fails). Every
failure is environmental or flaky; none is a reproducible product failure (§ Test suite).

Classification rule: a later decision or an approved condition that overrides a row's sketch counts as the
specification. A build that follows that decision is "as specified", and the evidence names the decision.

## Five most important findings

1. **Classic 2D on a phone has no reachable Pause or Reveal / Flag switch (P-37, decision 11).** At 390 px the overlay
   bar is 545 px wide, so the switch and Pause sit beyond the right edge. A touch player cannot pause, and cannot flag
   except by long-press.
2. **The Records best tiles are too narrow for their figures (P-68).** At every width from 1024 to 1920 px the
   best-time figure wraps its unit onto a second line, and "100.0%" spills past the tile border. The tables wrap times
   too, and their action buttons stack.
3. **The no-guess switch is no longer placed the same on both board choices (P-05).** Task 144's controller walk moved
   the Classic 2D switch below the custom form. In 3D it stays under the presets.
4. **P-45's larger text reaches touch screens only.** A mouse player at 1024 × 768 still gets 11 px HUD labels and
   10 px key caps. The approval condition allows this reading, but the low-vision half of the row is not delivered.
5. **The test suite has flaky browser tests and a review script inside the bare run.** `shell-pad-walk` (2 tests),
   the 3D generating-card test and the phone touch test each failed once under load and passed when rerun. Bare
   `node --test` also picks up `docs/ux-review/…/s7-hit-test.mjs`, which needs a server on port 8080.

## 1. Approved items

| Item | Status | Evidence | What to do |
| --- | --- | --- | --- |
| P-01 | as specified | Classic 2D pause card, H panel and Controls panel (Classic 2D \| 3D tabs) list the 2D rows; H and M work in 2D; look settings only on a 3D pause card (played) | — |
| P-02 | as specified | 3D ready card shows the three-line "How 3D works" block; one-time auto-hide toast in `js/shell/first-use.js` (tests/shell-first-use) | — |
| P-03 | as specified | Dark Controls panel: card rgba(22,34,58,.82), term ink rgb(230,237,248) (measured) | — |
| P-04 | as specified | Without WebGL 2 the menu shows "3D · Needs WebGL 2 — not available in this browser", the entry is disabled, and Classic 2D plays (played) | — |
| P-05 | drift | No-guess is on by default in both modes and has the helper line. Placement differs: the 2D switch sits **below** the custom form (index.html:52-53, moved there by task 144 for P-41), while the 3D switch sits under the presets (index.html:201). Task 121's AC put both under the presets | Decide which layout wins on both screens. Then move the 2D switch, or the 3D one, and keep P-41's D-pad walk passing |
| P-06 | as specified | Dark sky, fog, ground grid and menu backdrop (dark3d screenshot) | — |
| P-07 | as specified | Arrows move menu focus; "Esc: Back" beside every Back; Settings Back is `position: sticky` (played) | — |
| P-08 | as specified | Detail line per preset in both modes ("9.3 % mines · ~63 3BV · —"); switch says "separate records" | — |
| P-10 | as specified | "Sound: on" plus Volume on the menu, pause card and Settings; "Cube Beginner" on the preset; Back / Main menu split | — |
| P-11 | as specified | Spinner, Cancel, offer on top with Main menu, density hint (index.html `#c2d-status`, `#m3d-status`; tests/shell-mode-3d, classic2d-session) | — |
| P-12 | as specified | `js/shell/lock-fallback.js` offers drag-to-look after the second refusal (tests/shell-lock-fallback) | — |
| P-13 | as specified | `formatMineCount` has no 999 cap (js/ui/components.js:78-85) | — |
| P-14 | as specified | Expert tile 32 px at 1024 × 768 and 34 px at 1366 × 650, unclipped; Beginner capped at 48 px; framed panel; "2D board scale: Fit / 100 % / 125 %"; clipped-board hint | — |
| P-15 | as specified | No focus ring for a mouse player (cursor −1 until a key) | — |
| P-16 | as specified | 1 × 1 refused with the 3D wording; "from 1 to 1 on a 2 × 1 board"; "1 mine" singular (played) | — |
| P-17 | as specified | Standard 2D board started 14 ms after the click (main-thread placement) | — |
| P-20 | drift | Cube Beginner is 6 × 6 × 6 · 20, measured (opens 60.5 %, 3BV ≥ 40). The measured 3BV curve is 22 / 63 / 120 / 358 (js/records/typical-bbbv.js), so Beginner → Intermediate is ×1.9, below the row's ×2.5 to ×3. The shortfall is reported in task 152's Decisions | Director's call: accept ×1.9, or retune Intermediate (for example more mines on 8 × 8 × 8) |
| P-21 | as specified | Right-click on a 1 flagged its 4 closed neighbours, and a second right-click removed only those (played). `revealedUnflag: 'own-batch'` (js/engine/profiles.js:156); flash, count-scaled `flagVoice`, `#hud-mines.negative` tint, ready-card and help copy | — |
| P-22 | as specified | *Look at the board* (and Esc) hides the card; flight over the frozen board, actions inert; any mouse button or Esc returns to the card; Cube Expert loss reached results in 1.47 s (scaled delay) | — |
| P-23 | drift | Owner-approved in attended checkpoints (task 141): the readout reads "[cube] N - [flag] M" with no chord or certain-flag cue (js/readability.js:37-41); the wireframe (2) and depth shading (5) were dropped; Shift shows the block by draw order with no layer tint or ghosts (3); Space dims by depth (4) | None; recorded owner decisions |
| P-24 | as specified | Spawn pitch 15°, yaw 20° (js/input.js:161-163); all 8 box corners on screen; same pose after Home and Play again | — |
| P-25 | as specified | With the camera inside cell 0, picking skipped it (aimed 73) and 11 cubes drew as glass (fade, not half speed) | — |
| P-26 | as specified | W at pitch 1.0 / 1.3 / 1.55 rad moved along the view (horizontal : vertical = 0.64 / 0.28 / 0.02 = cot pitch); E moved straight up at 45° pitch; no new setting | — |
| P-27 | as specified | Home / R and the pause card's "Back to start" return to the spawn pose; off-screen arrow on the crosshair ring; ground grid | — |
| P-28 | as specified | Ready-card Space / Shift line; Space tap-toggle; one-time aim hint (first-use.js) | — |
| P-29 | as specified | Ctrl ghosts at `GHOST_ALPHA = 0.25` (js/render.js:34) | — |
| P-30 | as specified | Wheel 1.1 → 1.2 → 1.55 over 3 notches (accelerating); persistent "X spacing" readout; X toggles 1.1 / 2.0; the camera moves out with the spacing | — |
| P-31 | as specified | " · no-guess" on the ready card, HUD board readout and pause card, in both modes | — |
| P-32 | as specified | `fieldOfView` 45–90, default 60 (js/settings/schema.js:22); camera fov 60 | — |
| P-33 | as specified | Covered by P-46: one thousandths format off the live bar | — |
| P-34 | as specified | Background pre-generation for a marked start cell, plus a status card with a progress line and Cancel (tests/shell-mode-3d "generating card…") | — |
| P-35 | as specified | "Solved" pulse pass in js/render.js; ready-card line "Empty and solved cubes hide themselves" | — |
| P-36 | as specified | `escResumes` ignores only the Esc that released the lock (js/input.js:475) | — |
| P-37 | defective | Tap, 400 ms long-press flag and tap-chord work (played on a 390 × 844 phone). **But** the overlay bar is 545 px wide on a 390 px phone (`.hud-bar`, css/style.css:245), so `#hud-tap` (right edge 469 px) and `#hud-pause` (489–570 px) are off-screen. Steps: 390 × 844 touch emulation → Classic 2D → any size → the bar ends in a sliver at the screen edge; `page.tap('#hud-pause')` fails with "outside of the viewport". The mouse-only *Swap clicks* toggle also shows on touch | Let the 2D bar wrap or shrink at phone widths (stack the readouts, hide *Swap clicks* on coarse-only pointers), and add a viewport-containment assertion to tests/classic2d-touch.test.mjs |
| P-38 | as specified | One-finger pan, two-finger pan and pinch zoom on a scrolling board (tests/classic2d-touch, passes) | — |
| P-39 | as specified | Decision 11 and I-14 supersede the notice: the coarse-only ready card is "Tap to play" with the gestures, there is no pointer lock, and 3D Pause sits on-screen at 390 px (293–374 px) | — |
| P-40 | as specified | Arrows look (yaw −0.59 rad in 0.8 s), Enter reveals (started the game), `'` flags, Enter + `'` chords; free keys per decision 12 | — |
| P-41 | as specified | DOM-order fallback and the 2D form walk (tests/shell-pad-walk: 5/5 pass alone; 2 flaky under load, § Test suite) | — |
| P-42 | as specified | Pad glyphs in the HUD strip, hint and pause card while pad navigation is active (tests/shell-help) | — |
| P-43 | as specified | Tab stays inside the Controls modal and the pause card (played) | — |
| P-45 | drift | 44 px hit areas, 12 px labels and 11 px key caps are applied **only** under `(pointer: coarse)` (css/components.css:1030-1041, css/style.css:411-418). With a mouse at 1024 × 768 the HUD labels are 11 px and the key caps 10.14 px. This is the approval condition's reading (task 142 Decisions), but the low-vision text minimum is not delivered on desktop | Director's call: whether 12 px labels and 11 px key caps "degrade nothing" on fine pointers. If so, apply them unconditionally |
| P-46 | as specified | Thousandths everywhere outside the live bar: results, pause card ("Time 0.000 s"), Records, viewer ("00.000 / 02.724"); whole seconds on the HUD | — |
| P-47 | as specified | "Clicks 31 (L 31 · R 0 · D 0 · wasted 7)", "#1 of 1 on this board", a greyed loss comparison with Pace, and the board code. The row itself drops IOE | — |
| P-48 | as specified | Decision 7 form: the clock runs through the pause (HUD and pause card advance); `pauses` / `pausedMs` in the summary; pause marks on the seek bar (js/replay/viewer.js `pauseMarks`) | — |
| P-51 | as specified | Efficiency to one decimal ("61.3%", "−50.0%"), "= best" for ties | — |
| P-52 | as specified | ss.mmm clock, Previous / Next frame step, click ticks on the seek bar, pointer outline, ring only for keyboard replays, 3D chips hidden (viewer screenshot; tests/replay-viewer*) | — |
| P-53 | as specified | Date and time in both tables, a 3BV column, Delete behind a confirmation, Pinned first remembered (`records.view`) | — |
| P-54 | as specified | Menu strip "Beginner · no-guess · best — · today 2 games · streak 0" and "Play again: Beginner · no-guess" | — |
| P-55 | as specified | "Win rate, completed games" and "Best streak, completed games" beside the reference figures (Records, results) | — |
| P-61 | as specified | Browser Back: Records → menu; mid-game → pause; a paused game holds; menu Back leaves the site | — |
| P-62 | as specified | 2D plays the 3D cues on one sound instance with mute (tests/classic2d-mode "…calls the cues…") | — |
| P-63 | as specified | 2D tiles drawn through the cube-face recipe `js/tile-art.js` (bevel, highlight, border) | — |
| P-64 | as specified | 2D win and loss effects (js/classic2d/end-effect.js); results after about 1.09 s; any press skips | — |
| P-65 | as specified | The game's figures head the card; deltas coloured by `data-delta` (css/components.css:839-841); new-best banner ("New best time, 3BV/s and efficiency!") | — |
| P-66 | as specified | Replay opens on the closed board at 00.000 and plays the first click as an action; press rings | — |
| P-67 | as specified | Both lists page at ten rows with First / 1 / 2 / Last ("Games 1–10 of 12"); hidden when one page holds everything | — |
| P-68 | defective | Stat tiles exist, but at 1280, 1440 and 1920 px each tile is 130–135 px wide. "4.853 s" wraps its "s" onto a second line, and "96.0%" / "100.0%" overflow the tile's right border (records1920 screenshot). Steps: win any 2D board → Records at 1920 × 1080 | Give the tile row more width, or let the value shrink (`white-space: nowrap`, clamp the font size), and test the value's text box inside its tile |
| P-69 | as specified | Two columns above about 1024 px: picker, bests and averages beside history and lists | — |
| P-70 | as specified | Settings › Data › "Reset all data…" behind a confirmation, with CSV / JSON export offered first | — |
| I-01 | as specified | Learn 3D: fixed 4 × 4 × 3 · 4 board (decision 16), seed 75, start cell 26, no timer or records, prompt sequence starting "Click the marked cube to start" | — |
| I-02 | drift | First box 1 (4 × 4 × 3 · 4) and First box 2 (5 × 5 × 3 · 6) ship at spacing 1.5 in the three-quarter spawn. The sketch's "neighbourhood wireframe on" is absent, because P-23's wireframe was dropped | None, unless the wireframe is revived |
| I-03 | as specified | Daily screen with today's Expert no-guess and cube, marked start cell, one counted try, "Days in a row", board code "EN-20261015-18BE" and a link, pre-generated | — |
| I-04 | as specified | Code on results, Records and viewer with Copy and Copy link; "Play this board"; a `#board=` link starts a challenge labelled "Challenge · not eligible for bests" | — |
| I-05 | as specified | Records Top 10 tab; results "#1 of 1 on this board" | — |
| I-06 | as specified | F2 restarts at once and counts as a loss; toast names "Always ask before restarting"; Start + Y on a pad; R on results | — |
| I-07 | as specified | Any press skips the end delay; Enter or R plays again; Play again is the lock gesture (tests/results, mode3d-end) | — |
| I-08 | as specified | "Beat 0.003 s for a new best · streak 1"; "Streak ended at 2 · best 2" | — |
| I-09 | as specified | Averages over 10 / 50 / all, last-50 win rate, best-time-by-date chart, period and outcome filters, CSV / JSON export | — |
| I-10 | as specified | Seek-bar ticks, frame step, Show 3BV, 0.25×, Sound, Follow / Free (C) in 3D, Watch best, download and open replay files. The sketch defers ghost compare ("later") | — |
| I-11 | as specified | Warm worker on board choice, synchronous standard placement, background no-guess pre-generation (task 138, tests/generation-client) | — |
| I-14 | as specified | Left stick, right-half look, tap, long-press, two-finger chord, pinch, Shift / Space / Ctrl toolbar, Pause above the scene; no pointer lock (tests/shell-mode-3d touch tests pass) | — |
| I-15 | as specified | Settings › Camera Fly \| Orbit; orbit bindings; Look at the board follows it (tests, task 146) | — |
| I-17 | as specified | First-use hint strips: 3D "Left reveal · Right flag · Hold Space aim through · Hold Shift neighbours"; 2D strip on the first key or pad input | — |
| I-18 | as specified | LB / RB and LT / RT in Records with glyphs, seek-bar pad hint, trigger pulse and flag double pulse (tests/shell-pad-walk) | — |

## 2. Decisions taken

| Item | Status | Evidence | What to do |
| --- | --- | --- | --- |
| 1. Safe-cell-only 3D first click | as specified | `firstClick: 'safe-cell'` in the 3D profile (js/engine/profiles.js:124); no opening guarantee | — |
| 2. Cube presets may change | as specified | Intro / Beginner 20 / Intermediate / Expert 10³ · 100, plus two first boxes | — |
| 3. Keep flag-all, undo last batch, make it visible | as specified | See P-21 | — |
| 4. Look at the board | as specified | See P-22 | — |
| 5. Fix spawn and forward vector outright; FOV slider | as specified | No new setting for either; Q / E stay world up and down; FOV 45–90 | — |
| 6. No-guess on by default | as specified | Both switches checked on first launch | — |
| 7. Clock runs while paused; pauses recorded | as specified | See P-48 | — |
| 8. Restart is still a loss; completed-games stats | as specified | F2 abandons and records a loss; completed-games figures shown | — |
| 9. Records durability not this stage | as specified | No P-49 / P-50 / P-18 work in the build | — |
| 10. Expert fits 1024 px; ~26 px floor; board-scale setting | as specified | 32 px tiles at 1024 × 768 with no scroll; `boardScale` Fit / 100 / 125 | — |
| 11. Touch is a target | defective | 3D touch and the 2D gestures exist, but Classic 2D's Pause and Reveal / Flag switch are unreachable on a 390 px phone | Fix P-37's bar overflow |
| 12. Keyboard-only 3D on free keys | as specified | Arrows, Enter, `'`; D and F keep strafe and fullscreen; mouse play unchanged | — |
| 13. WebGL 2 not required | as specified | See P-04 | — |
| 14. At least one mine | as specified | See P-16 | — |
| 15. Daily and codes with a marked start cell | as specified | A reveal off the mark is refused; "Start on the marked cell" | — |
| 16. Tutorial; first box 4 × 4 × 3 with about 4 mines | as specified | First box 1 and Learn 3D are 4 × 4 × 3 · 4 | — |
| 17. Accessibility settings not now; P-44 waits | as specified | No reduce-motion, colour-blind, timer or rebinding settings in the schema | — |
| 18. No budget measurement; background generation and status card | as specified | See P-34 and I-11 | — |

## 3. Approval conditions

| Item | Status | Evidence | What to do |
| --- | --- | --- | --- |
| P-21 is undo-last-batch plus visibility, never a certainty gate | as specified | A right-click on a 1 flagged every closed neighbour with no certainty check; the second right-click removed only that batch | — |
| P-23 is built in attended iterations | as specified | Task 141 records five checkpoints with owner verdicts (approve / adjust / drop) | — |
| P-45 only where it degrades nothing on normal pointers | as specified | All P-45 sizes sit under `(pointer: coarse)`; a fine pointer keeps every size (see the P-45 drift above for what that leaves out) | — |
| P-25 is the fade, not half speed | as specified | Glass within `FLY_THROUGH_DIST`, unpickable; no speed change inside the box | — |
| P-26 changes the forward vector with no new setting; Q / E stay world up and down | as specified | Measured forward along the view; E pure +y; schema has no flight setting | — |

## Defects outside the numbered items

| Item | Status | Evidence | What to do |
| --- | --- | --- | --- |
| Clipped-board hint names the mouse wheel on touch | defective | On a 390 × 844 touch phone, Classic 2D Expert shows "Wheel scrolls · Shift+wheel sideways" (`scrollHint` has only keyboard and controller texts, js/settings/bindings.js:232) | Add a touch text ("Drag to pan · pinch to zoom") and pick it on coarse-only devices |
| Classic 2D lists no touch bindings | defective | `BINDINGS['classic-2d']` has no `touch` device (js/settings/bindings.js:151-153), so on a phone the 2D pause card, H panel and Settings › Bindings show mouse and keyboard rows; long-press, Reveal / Flag, tap-chord, pan and pinch are documented nowhere in the game | Add 2D touch rows to the bindings source |
| 3D ready card on touch names keys | defective | The touch ready card still reads "hold Ctrl to show them" (index.html:260) and "Esc: Back", though touch has a Ctrl toolbar button and no Esc | Swap the line for the device, as the controls rows already are |
| 3D results card's Esc hint says "Back" | defective | The 3D results card shows "Esc: Back" (index.html:530), but Esc opens *Look at the board* there | Show "Esc: Look at the board" on a 3D results card |
| Records tables wrap figures and stack actions | defective | At 1280 and 1920 px, times wrap ("4.853 / s"), board codes wrap, and the replay row's Watch / Download / Unpin / Delete stack into a column about 200 px tall | Keep times and codes on one line; lay the actions out as a row or a menu |
| Best-time chart ticks read as thousands | defective | The best-time chart's y-axis labels read "2.500 s" and "0 s" (the thousandths format applied to axis ticks) | Format axis ticks with the fewest decimals that tell them apart |
| Bare `node --test` runs a review script | defective | `docs/ux-review/ux-first-run/s7-hit-test.mjs` runs under bare `node --test` and fails with ERR_CONNECTION_REFUSED on 127.0.0.1:8080 | Rename the docs scripts so they do not match `*-test.mjs`, or move them out of the tree |
| Pad-walk tests flaky under load | defective | Under bare `node --test`, tests/shell-pad-walk.test.mjs:55 (3D walk read `bc-noguess` / `10,10,10,100` instead of `c-m … c-x`) and :139 (Up walk missed `records-replays-table:7`) failed; both pass alone (5/5) | Make the walk wait for each focus move to settle instead of relying on timing |
| 3D generating-card and phone touch tests flaky | defective | tests/shell-mode-3d.test.mjs:737 failed once in the full run with `'won' !== 'lost'`: the 5 × 5 × 1 · 4 no-guess first click can win outright, leaving no mine to click. tests/classic2d-touch.test.mjs:457 failed once alone. Both passed on rerun (3/3 and 1/1) | Fix the 3D test's board (seeded or fixed mines); find the touch test's race |

## Feature documents inconsistent with the code

| Item | Status | Evidence | What to do |
| --- | --- | --- | --- |
| `.claude/domain/features/classic-2d-square-play.md` lines 62-63 | defective | "Touch never reaches the mouse input, and the 3D mode takes no touch play." The 3D mode plays by touch (I-14, js/touch-3d.js; a 3D touch row set in Settings) | Drop the 3D clause, or cite `3d-play-flow` for 3D touch play |
| `.claude/domain/features/results-screen.md` lines 101-103 | defective | The replay viewer's playback clock "keep[s] the overlay's whole seconds". The viewer shows ss.mmm ("00.000 / 02.724"), as `replay-playback.md` line 154 says | Name only the in-game overlay timer as the whole-second exception |

## Test suite

- **`node --test` from the repository root** (as prescribed): 1942 tests, **1939 pass, 3 fail**, 431 s.
  - `docs/ux-review/ux-first-run/s7-hit-test.mjs` (a review script, not a suite test; needs a server on port 8080).
  - `in a browser, the D-pad walks every control of the 2D board choice and the 3D board choice as before`
    (tests/shell-pad-walk.test.mjs).
  - `in a browser, the Records walk stops on every Watch, Download, Pin and Delete, and Right from "Pinned first"
    enters the replays` (tests/shell-pad-walk.test.mjs).
  - Rerun alone, tests/shell-pad-walk.test.mjs passes 5 of 5.
- **`.claude/external/run-full-tests.sh`** (the project's full run, concurrency 2): 1941 tests, **1940 pass, 1 fail**,
  451 s.
  - `in a browser, the 3D generating card shows by its delay in pointer-locked play, with its progress line; Play
    again marks the start cell and the in-flight board shows it too` (tests/shell-mode-3d.test.mjs). It passed 3 of 3
    reruns alone.
