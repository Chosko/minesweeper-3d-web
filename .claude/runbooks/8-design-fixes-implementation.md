# Runbook: design-fixes-implementation

Created: 2026-10-20 · Source: /runbook-create interview · Model: opus
Last step number: 34

## [x] 1. Implement task 214 — Full test runs reliable again: the stale counter test, the random first click, the theme-switch flakes and the slow components file

Depends on: none

Context: none

```prompt
/task-implement 214 --review
```

Done: 2026-10-20, commit `b99a4b4` (13 files, +625/-399). Premise wrong: the slow tier is still not reliable — `render-3d-feedback`'s `[slow]` Ctrl-ghost test failed in both slow runs and `shell-focus-containment` timed out once, outside this task's files; only the classic2d mid-game theme-switch flake reproduced (fixed seed), the other two named theme-switch tests never failed and no product change was made for them.

## [x] 2. Implement task 215 — Settings page tests hold with more than one shipped theme

Depends on: 1

Context: none

```prompt
/task-implement 215 --review
```

Done: 2026-10-20, commit `c544e97` (4 files, +94/-58).

## [x] 3. Implement task 216 — Theme switch keeps every font weight the new theme declares loaded in Chromium

Depends on: 1

Context:
- 2026-10-20 (from step 1): task 214 found no cause for the `classic2d-view` large-scrolled and `theme.test.mjs` theme-switch flakes (never reproduced) and changed no product code for them; it did not cover the font unload.

```prompt
/task-implement 216 --review
```

Done: 2026-10-20, commit `504b397` (10 files, +247/-14). Decision: the applier re-loads the new theme's declared fonts after removing the old stylesheet, and a failed re-load goes to the error handler without undoing the switch; `tests/components-pause.test.mjs`'s contrast test is flaky on the base too.

## [x] 4. Implement task 217 — UX-review scripts follow the current board-choice markup

Depends on: 1

Context: none

```prompt
/task-implement 217 --review
```

Done: 2026-10-20, commit `f167ac2` (48 files, +92/-92). Premise wrong: the hint list missed many scripts; every Classic 2D preset click now also clicks Play. Scripts still stall on drift no task covers yet: custom boards the game now refuses, and `#hint-h`, `#p-restart`, the 2D `#hud-pause` and a removed 3D preset.

## [x] 5. Implement task 218 — Kit buttons: md size, key hint ink, quiet variant, latched toggles, danger variant

Depends on: 1

Context: none

```prompt
/task-implement 218 --review
```

Done: 2026-10-20, commit `e0548f7` (16 files, +298/-48). Premise wrong: the danger variant already existed; only Delete replay and Reset all data moved to it. Only the four named toggles became latched quiet toggles (their on state reuses the catalogue's `chosen`); Tap: Reveal/Flag and the replay's Sound stay secondary. Show 3BV keeps a stale `aria-pressed` into the next replay (pre-existing, no task).

## [x] 6. Implement task 219 — Kit form controls: switch, switch row, slider fill, number field, invalid state, focus halo

Depends on: 1

Context: none

```prompt
/task-implement 219 --review
```

Done: 2026-10-20, commits `f6d1394`, `0cd4696` (23 files, +563/-118). Premise wrong: styling the board option on `:focus-visible` alone does not work in Chromium after a mouse click; `js/main.js` now sets `body.pointer-nav` on mouse input and the theme keys the selected look on it. The focus halo is `!important`; `STATES` gains `invalid` and `REQUIRED_TOKENS` `--slider-fill`.

## [x] 7. Implement task 220 — Kit icon set and leading-icon slot

Depends on: 5

Context: none

```prompt
/task-implement 220 --review
```

Done: 2026-10-20, commit `b20dc22` (9 files, +411/-13). Decisions: one icon set, `ICONS` in `js/ui/components.js`, drawn from `data-icon` by `applyIcons(root)` or through `createButton`/`setButtonIcon`; nothing calls `applyIcons` yet; the code chip's icons are left to task 222.

## [x] 8. Implement task 221 — Kit feedback parts: confirm box, warn and err notes

Depends on: 5, 7

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.
- 2026-10-20: the run paused with this step mid-implementation (code and tests written, full suite and `--review` round not run). The work is a WIP commit on branch `wt/runbook-8-step-8` (pushed), with a handoff at `.claude/sessions/2026-10-20-runbook-8-step-8-task-221-handoff.md` on that branch. Resume from it: soft-reset the WIP commit, finish verification and the review round, then make the task's one commit.

```prompt
/task-implement 221 --review
```

Done: 2026-10-20, commit `788aeeb` (38 files, +594/-182). Decisions: `js/main.js` now calls `applyIcons(document.body)`; the Records delete confirmation keeps its `deleteMessage` wording; a board code from the other mode stays valid (only a refused code is invalid); the reset-failure line and `settings.md` changed together.

## [x] 9. Implement task 222 — Kit surfaces: plain stat tile, muted panel, tables, pager, code chip

Depends on: 5, 7

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`. The code chip's 14px icons were left to this task: `createCodeChip` adds none yet.
- 2026-10-20: the run paused with this step mid-implementation (code and tests written, full suite and `--review` round not run). The work is a WIP commit on branch `wt/runbook-8-step-9` (pushed), with a handoff at `.claude/sessions/2026-10-20-runbook-8-step-9-task-222-handoff.md` on that branch. Resume from it: soft-reset the WIP commit, finish verification and the review round, then make the task's one commit.

```prompt
/task-implement 222 --review
```

Done: 2026-10-20, commit `7aa48f0` (17 files, +465/-120). Decisions: the phone label-over-value stacking applies only to a `ui-table` without `thead`; a worse difference shows in muted ink (`results-screen.md` updated); `ui-code__label` styling is gone, so the Results and Daily chips' inline "Board code" label renders unstyled until tasks 237 and 229.

## [x] 10. Implement task 223 — Kit frames: head and foot steps, white action foot, message cards, scrims, status cards

Depends on: 5, 7

Context:
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.
- 2026-10-20: the run paused with this step mid-implementation (code and tests written, full suite and `--review` round not run). The work is a WIP commit on branch `wt/runbook-8-step-10` (pushed), with a handoff at `.claude/sessions/2026-10-20-runbook-8-step-10-task-223-handoff.md` on that branch. Resume from it: soft-reset the WIP commit, finish verification and the review round, then make the task's one commit.

```prompt
/task-implement 223 --review
```

Done: 2026-10-20, commit `da401db` (27 files, +485/-139). Decisions: the placeholder and replay-failure titles take the message card's type; `#hud-tap` hides behind the pause, ready and results cards; results-foot padding lives in the theme. Open: a failed replay clears its figures to "—" and the phone-landscape action-foot height are unchecked against the canvas.

## [x] 11. Implement task 224 — Board module: 2D numbers, 2D end effect from the module, theme token cleanup

Depends on: 1

Context: none

```prompt
/task-implement 224 --review
```

Done: 2026-10-20, commit `d43ceec` (29 files, +526/-214). Premises wrong: the canvas's 2D number colours fail the old every-point contrast rule, so the 2D list is now checked against the 2D revealed face and its shade only; the right bevel is not on the face–bevelDark line, so `tile-art.js` takes an exact bevel colour (Joyful's pressed 3D right slope becomes #92c2ff). The number list is split into `numbers2d`/`numbers3d` and a new `end2d` entry added.

## [x] 12. Implement task 225 — Board module motion tracks: opacity, flip, scale and brightness

Depends on: 11

Context: none

```prompt
/task-implement 225 --review
```

Done: 2026-10-20, commit `5921b67` (10 files, +201/-33). Premise wrong: the contract and player already had scale, flip, brightness and opacity; the change is brightness as a mix toward white/black in `motion-layer.js` plus Joyful keyframes. Press and chord press now cut to the pressed face at 90 ms, and a press held past 90 ms jumps back to rest (no task yet).

## [x] 13. Implement task 226 — 2D tile art: glyphs, hairline, start cell, flat widths and the cursor ring outside the tile

Depends on: 11

Context: none

```prompt
/task-implement 226 --review
```

Done: 2026-10-20, commit `f150d4d` (20 files, +627/-242). Decisions: the cursor ring sits on a third `board-ring` canvas passed as `createBoardView`'s `overlay` option; the start cell is a new `marked` tile state (a flagged or pressed start cell draws as flagged/pressed); flat `hairline` is now in CSS px; mine glyph proportions are the agent's own, since the canvas sprites could not be fetched.

## [x] 14. Implement task 227 — Board frame and framed previews

Depends on: 11

Context: none

```prompt
/task-implement 227 --review
```

Done: 2026-10-20, commits `4408553`, `f9e0595` (24 files, +405/-153). Decisions: previews and the replay viewer mount with `framed: true` and the view builds the frame; a scrolling board shows no frame and is clipped at `--board-viewport-radius`; the replay viewer always fits the whole board; the menu (1024×768) and replay (1920×1080) preview tile sizes are left unpinned for tasks 228 and 239.

## [x] 15. Implement task 228 — Main menu: mode entries, scene panel, per-size layout, build label and scroll

Depends on: 7, 10

Context:
- 2026-10-20 (from step 14): task 227 left the menu's preview tile size unpinned — at 1024×768 it draws 27 px where the criteria give 23, and the Daily focus 28 px / 933 px wide against 27 px / about 872 px; this task's layout should pin them.
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.
- 2026-10-20 (from step 10): `js/main.js` already calls `applyIcons(document.body)` (task 221), so the step-7 note's "must call it" is satisfied — do not add a second call.

```prompt
/task-implement 228 --review
```

Done: 2026-10-21, commit `14bbd95` (12 files, +356/-95). Decisions: the kit card badge is 102 px and the menu preview draws the canvas's large card (200 px badge, 100 px glyph); the 70 px rest height holds outside the menu only, menu entries flex with a 44 px floor; phone glyph 24 px per the criterion (the canvas draws 26); preview tiles are pinned per size; locked Quit shows no reason line.

## [x] 16. Implement task 229 — Daily screen to the canvas

Depends on: 9, 10, 14, 15

Context:
- 2026-10-20 (from step 9): task 222 removed the `ui-code__label` styling, so the inline "Board code" label inside this screen's chip in `index.html` renders unstyled until this task moves it out as a section label.
- 2026-10-21 (from step 17): task 230 resized the shared option rule (12px 18px padding, 64px min height, 14px gap), so Daily's mode options already take the new sizes; Daily keeps its own chip markup.
- 2026-10-21 (from step 15): task 228 pinned the menu's Daily preview at xl to a 27 px tile, 872 px wide, by insetting the preview's board layer per size; tests assert it.

```prompt
/task-implement 229 --review
```

Done: 2026-10-21, commit `850c3cc` (12 files, +344/-123). Decisions: Daily shares the board choices' placement selectors; the 3D panel is 280 px everywhere per the task body, though J-Daily-states draws 313 px at 1920 × 1080; option meta weight 500 applies to Daily only (the board choices still render 400).

## [x] 17. Implement task 230 — Board choice screens to the canvas

Depends on: 6, 8, 9, 10

Context: none

```prompt
/task-implement 230 --review
```

Done: 2026-10-21, commit `dfb4809` (16 files, +245/-143). Premise wrong: K11's Last played chip position contradicts the canvas; it follows the canvas (right after the name, a new `ui-option__line` kit part). The option sizes live in the shared option rule, so Daily's mode options take them too; the board-choice switch now sits at the right edge, changing pad-walk order.

## [x] 18. Implement task 231 — Classic 2D window layout and HUD density

Depends on: 10, 14

Context: none

```prompt
/task-implement 231 --review
```

Done: 2026-10-21, commit `a1f181a` (17 files, +456/-89). Decisions: the window fits its board through JavaScript (`js/ui.js`, `js/main.js`, `js/classic2d/mode.js`), which measures the chrome's room and sizes the board area; HUD sizes are documented in `app-shell-ui.md` § HUD density, not `app-shell-3d.md`. `tests/shell-menu.test.mjs` failed once in ten runs on a preview not yet mounted (load-dependent, unproven).

## [x] 19. Implement task 232 — First-use hint strip and the Tap: Reveal / Flag segmented choice

Depends on: 18

Context:
- 2026-10-21 (from step 18): task 231 sizes the Classic 2D window to its board in JavaScript (`js/ui.js`, `js/main.js`, `js/classic2d/mode.js`) and still keeps the hint strip's 64 px room around the board area; this task removes that room.

```prompt
/task-implement 232 --review
```

Done: 2026-10-21, commit `e658470` (22 files, +208/-122). Premise wrong: the strip's "bottom 32px of the board column" holds only at xl; it sits 10 px above the board's foot inside `#c2d-stage` at every size, as the canvas draws it. Touch strips keep the canvas's " · " separators; controller buttons are plain key boxes; the 3D touch strip drops Space and Shift.

## [x] 20. Implement task 233 — Controls and bindings lists as one ruled two-column part

Depends on: 10

Context:
- 2026-10-21 (from step 27): the user answered task 240's parked question with option a — the Settings criterion "at 1920 × 1080 everything fits without the body scrolling, with the 3D bindings shown" moves to task 233 (both amended through /pipeline-revise by step 27), since the overflow comes only from the long 3D keyboard rows this task shortens. Task 233's body may not carry the clause yet.

```prompt
/task-implement 233 --review
```

Done: 2026-10-21, commit `aef0c93` (27 files, +525/-354). Decisions: the xl fit with 3D bindings shown is built and tested here (`tests/settings-page.test.mjs`), but task 233's body does not carry the clause yet; `js/settings/bindings.js` now holds three lists — full, help (`helpListHtml`, pause card and H panel) and ready card (`readyListHtml`, formerly hard-coded in `index.html`); the list is a new `ui-controls` kit part. Following the canvas drops some working keys from every surface (3D Enter / ' and Home / R, 2D wheel-scroll and H / M).

## [x] 21. Implement task 234 — Pause card to the canvas

Depends on: 8, 20

Context:
- 2026-10-21 (from step 20): task 233 gives the pause card its own short help list, `helpRows`/`helpListHtml` in `js/settings/bindings.js`, rendered as the new `ui-controls` kit part.

```prompt
/task-implement 234 --review
```

Done: 2026-10-21, commit `491f6b5` (27 files, +300/-122). Decisions: "no game in progress" excludes a first-click board being generated (`status().pending` in `js/classic2d/mode.js`); an ended game shows the canvas's single not-started line and loses its final figures (owner to decide); the confirm box follows the task body ("Leave this game?", "Confirm") over the canvas; Back to start has no Home hint since the key does not work there. Back before the first click still resumes, against `game-shell.md` § Pause rules (pre-existing).

## [x] 22. Implement task 235 — 3D ready card, HUD readouts and the touch stick

Depends on: 7, 10, 20

Context:
- 2026-10-21 (from step 20): task 233 moved the ready card's controls list out of `index.html` into `readyRows`/`readyListHtml` in `js/settings/bindings.js`, rendered as the new `ui-controls` kit part.
- 2026-10-20 (from step 7): task 220's icons come from `ICONS` in `js/ui/components.js`; markup names one with `data-icon="<name>"` and `applyIcons(root)` draws it, script-built buttons use `createButton(doc, {label, icon, …})` or `setButtonIcon`. Nothing in the game calls `applyIcons` yet — the first screen task that adds `data-icon` to `index.html` must call it from `js/main.js`.
- 2026-10-20 (from step 10): `js/main.js` already calls `applyIcons(document.body)` (task 221), so the step-7 note's "must call it" is satisfied — do not add a second call.

```prompt
/task-implement 235 --review
```

Done: 2026-10-21, commit `3da5a58` (19 files, +282/-111). Decisions: the crosshair is hidden when no cell is targeted (per `in-game-layout.md`; the idle 0.4-opacity crosshair is gone); the off-screen arrow circles the crosshair about 50 px out; the ready overlay's margin is 12 px; the phone-landscape layout applies to any window under 500 px tall held sideways, touch or not.

## [x] 23. Implement task 236 — Learn 3D play layout and end cards

Depends on: 22

Context:
- 2026-10-21 (from step 22): task 235 hides the 3D crosshair when no cell is targeted, sets the ready overlay's margin to 12 px, and applies the phone-landscape ready layout to any window under 500 px tall held sideways (touch or not); `js/ui.js`'s `setTouch3D` and `setStick` changed with it.

```prompt
/task-implement 236 --review
```

Done: 2026-10-21, commit `3a5553b` (14 files, +155/-43). Decisions: Try again takes the canvas's restart icon (play on a win), against the task body; `UI.setTimed` became `UI.setLearn(on)` and `hud-figures--untimed` is gone; on phones Learn 3D keeps the existing phone layouts, which the canvas does not draw. The loss title stays "That cube was a mine." (the canvas says "That was a mine").

## [x] 24. Implement task 237 — Results screen to the canvas

Depends on: 9, 10

Context:
- 2026-10-20 (from step 9): task 222 removed the `ui-code__label` styling, so the inline "Board code" label inside this screen's chip in `index.html` renders unstyled until this task moves it out as a section label.

```prompt
/task-implement 237 --review
```

Done: 2026-10-21, commit `7159569` (24 files, +384/-177). Decisions: Watch replay takes the canvas's `film` icon, not the task's "grid"; a first-use toast is hidden (`toast--first-use`) while results show; a loss with no streak ended reads "beat <time>"; the 3D rank joins the board line; "Board code" is a section label outside the chip. Three feature documents were edited to match (`shared-screen-layout`, `results-screen`, `3d-results-records-screens`).

## [x] 25. Implement task 238 — Records screen to the canvas

Depends on: 8, 9

Context: none

```prompt
/task-implement 238 --review
```

Done: 2026-10-21, commit `9ab8099` (25 files, +741/-518). Decisions: Back reads "Main menu" only when it returns to the menu, else "Back" (the task asked for "← Main menu" always); the board code column shows at 1440 px and wider only, narrower tables scroll sideways; Download is icon-only; the phone has a second linked 2D | 3D switch; `records-screen.md` and `3d-results-records-screens.md` were edited to match.

## [x] 26. Implement task 239 — Replay viewer to the canvas

Depends on: 9, 10, 14

Context:
- 2026-10-20 (from step 14): task 227 left the replay viewer's tile size unpinned — at 1920×1080 it draws 40 px where the criteria give 34; the viewer always fits the whole board (down to a 1 px tile) and this task's layout should pin the size.
- 2026-10-20 (from step 10): task 223 leaves a failed replay's figures panel cleared to "—" (only ticks and pause marks stay) and keeps speed and Show 3BV enabled; check the figures against the canvas's J-Replay-states "Failure".

```prompt
/task-implement 239 --review
```

Done: 2026-10-21, commit `321a6f3` (25 files, +564/-306). Decisions: the viewer still fits the whole board, unpinned — 36 px at 1920 × 1080 (the canvas's own layout fits about 36; the criteria's 34 is off); a failed replay keeps task 223's "—" figures, the canvas's Failure state looking like placeholders; the `--color-replay-bbbv-*` tokens are gone. Between about 1200 and 1280 px wide the files still wrap onto their own row at a 2D replay's end and in 3D.

## [x] 27. Implement task 240 — Settings screen to the canvas

Depends on: 2, 6, 8

Context:
- 2026-10-21 parked: Q1. Task 240's Frame criterion says that at 1920 × 1080 everything fits without the body scrolling, with the 3D bindings shown. The shipped 3D keyboard list uses long sentence rows, and with it the body overflows by about 190 px. With the canvas's short rows, which task 233 owns and which have not landed, the page would fit. With the opening Classic 2D list it fits today, and the browser test asserts that. How should 240 close?
  a. Move the "fits with 3D bindings shown" clause to task 233 (amend both through /pipeline-revise) and land 240 as it is.
  b. Hold 240 until 233 lands, then assert the fit with 3D selected.
  c. Make the Bindings panel scroll its list inside the panel, so the page never scrolls whatever the list. The canvas does not draw this.
  Recommendation: a. The overflow comes only from the list's wording, and that wording is task 233's.
  (The work is on pushed branch `park/task-240`, commit 616236f; its unpark may conflict with task 223 on index.html, css/style.css, css/components.css.)
- 2026-10-21 unparked with answer: Q1 a
- 2026-10-21 (from step 20): task 233 landed the short rows and a browser test that the Settings page fits at 1920 × 1080 with the 3D bindings shown; task 233's body does not yet carry that clause, so the /pipeline-revise amendment of both tasks is still to make.
- 2026-10-21: the user chose to redo task 240 from scratch on the current base: the parked work was discarded (task back to `[MISSING]`, handoff removed); `park/task-240` (616236f) stays only as a reference for the Settings-specific changes, never to cherry-pick. Since task 233 landed the short rows, assert the Frame criterion's 3D fit as written; the Q1 a answer applies only if it still fails.

```prompt
/task-implement 240 --review
```

Done: 2026-10-21, commit `e17419a` (43 files, +536/-431). Redone from scratch. Premise wrong: the 3D fit was blocked by task 219's 36 px segmented-option minimum, not 233's rows; Settings alone drops it (40 px on a phone), so the Frame criterion holds as written and Q1 a was not used — other screens keep the minimum the canvas does not draw. The Controls action and its modal are gone (decision 14 a); sections are moved between columns by `SETTINGS_LAYOUTS` in `js/settings/page.js`.

## [x] 28. Implement task 241 — Other surfaces: placeholder, fatal card and toasts

Depends on: 10

Context: none

```prompt
/task-implement 241 --review
```

Done: 2026-10-21, commit `0e26273` (14 files, +227/-39). Decisions: leaving cards (ready, ctx-lost, learn-end, placeholder, pause and Settings confirm boxes) fade out over `--duration-slow` with clicks passing through, so a browser test measures a card only after its animations end and "gone" means `display: none` (now in `testing-browser.md`); Reset all data's Yes acts only while its confirmation is open (`js/settings/page.js`).

## [x] 29. Implement task 242 — Copy alignment with the canvas

Depends on: 17, 24

Context:
- 2026-10-21 (from step 24): task 237 set the Results loss row with no streak ended to "beat <time>" (no wording was given) and appended the 3D rank to the board line.

```prompt
/task-implement 242 --review
```

Done: 2026-10-21, commit `d6ca35d` (31 files, +153/-95). Decisions: the version refusal keeps two reasons (newer: "Reload the page to update." as text; older: "It cannot be played here."), where the canvas gives one; a cut-off code gets a new "incomplete" refusal; a pace exactly on the best reads "ahead of"; an accepted code's line now ends "· starts on the marked cell" ("cube" in 3D) instead of "not eligible for bests".

## [x] 30. Implement task 243 — Component gallery coverage and the theme list

Depends on: 5, 6, 7, 8, 9, 10

Context: none

```prompt
/task-implement 243 --review
```

Done: 2026-10-21, commit `d5a8a56` (13 files, +471/-59). Decisions: the kit catalogue now lists the 3D game's on-screen parts (hint strip, help card, key strip, view chip, crosshair, off-screen arrow, aim readout, touch stick); the 3D demo board builder moved from `makeDemo` in `js/main.js` to `demoBoard3D()` in `js/shell/menu-preview.js`, shared by menu and gallery. Deferred, no task yet: the hint strip's close button is a plain part, not a control with states.

## [x] 31. Implement task 244 — Update documentation for feature `shared-screen-layout`

Depends on: 5, 6, 7, 8, 9, 10, 15, 16, 17, 20, 21, 22, 24, 25, 26, 27, 28, 29

Context: none

```prompt
/task-implement 244 --review
```

Done: 2026-10-21, commit `3cc9fb5` (20 files, +71/-56).

## [x] 32. Implement task 245 — Update documentation for feature `in-game-layout`

Depends on: 18, 19, 23

Context: none

```prompt
/task-implement 245 --review
```

Done: 2026-10-21, commit `c378640` (10 files, +43/-33).

## [x] 33. Implement task 246 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 11, 12, 13, 14

Context:
- 2026-10-20 (from step 11): task 224 narrowed the 2D number contrast rule to the 2D revealed face and its shade only (the 3D list keeps every point of the revealed face); `themed-board-art-and-motion.md` still says "every point of its theme's revealed face" and must record it. It also split `numbers` into `numbers2d`/`numbers3d`, added the `end2d` module entry, and let a bevel side be an exact `#rrggbb`.
- 2026-10-20 (from step 13): task 226 added board-module entries `palette.faces2d.marked.ring`, `cursor.innerWidth` and flat-style `press`/`border`, changed flat `hairline` to CSS px, made the start cell a `marked` tile state, and moved the cursor ring to a `board-ring` overlay canvas.

```prompt
/task-implement 246 --review
```

Done: 2026-10-20, commit `a0771f1` (7 files, +41/-30).

## [~] 34. Implement task 247 — Update documentation for feature `theme-system`

Depends on: 30

Context:
- 2026-10-21 (from step 30): task 243 added the 3D game's on-screen parts to the kit catalogue and moved the 3D demo board builder to `demoBoard3D()` in `js/shell/menu-preview.js`; the gallery copies its layout rules rather than loading `css/style.css`.

```prompt
/task-implement 247 --review
```
