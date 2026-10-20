# Runbook: themes-tasks-implementation

Created: 2026-10-13 · Source: /runbook-create interview (runbook themes-planning step 8) · Model: opus
Last step number: 81

## [x] 1. Implement task 157 — Theme registry, kit catalogue and the Joyful tiles theme folder

Depends on: none

Context: none

```prompt
/task-implement 157 --review
```

Done: 2026-10-19, commit `2d774b9` (15 files, +561/-3). The two OFL licence files ship with their URL lines removed (copyright notices and licence text kept), so the theme folder holds no remote URL; buttons and menu entries carry default/selected/pressed/disabled, with hover and focus merged into selected.

## [x] 2. Implement task 158 — Base stylesheet and the Joyful tiles theme stylesheet; retire light and dark

Depends on: 1

Context:
- 2026-10-13 (amend): Task 158 keeps the shipped `@media (prefers-reduced-motion: reduce)` rule in `css/style.css` unchanged — it is exempt from the no-animation-values test, and no theme stylesheet may override it (no `prefers-reduced-motion` rule, no `!important` animation or transition). Cell motion and the 2D/3D game effects ignore the preference; the full reduced-motion feature is `m7-after-launch`'s.

```prompt
/task-implement 158 --review
```

Done: 2026-10-19, commit `ca8a74a` (29 files, +1959/-1527). The four tile tokens shared with the 2D tile skin keep the skin's values; the canvas spacing scale is not used; font sizes come from the canvas. The body's premise that the canvas draws every component in every state was wrong — the theme gives slider, segmented choice, field and link the switch's focus ring.

## [x] 3. Implement task 159 — Registry-driven theme applier with run-time switch and board module hand-off

Depends on: 1, 2

Context:
- 2026-10-19 (from step 2): `setTheme` is a no-op after task 158, and the `classic2d-view` browser check that the board repaints after a theme switch was removed; task 159 should restore it.

```prompt
/task-implement 159 --review
```

Done: 2026-10-19, commit `2b6ba85` (18 files, +810/-123). The importable switcher is a new `js/themes/applier.js` (`themeApplier()`); `globalThis.msTheme` is gone and `js/theme.js` stays the pre-paint classic script.

## [x] 4. Implement task 160 — Settings theme list and light/dark carry-over

Depends on: 3

Context:
- Task 160 adds no reduced-motion setting, settings field, root marker, accessibility section or preference read: the shipped `prefers-reduced-motion` rule in `css/style.css`, which task 158 keeps, is the game's one reduced-motion behaviour until `m7-after-launch`.
- 2026-10-19 (from step 2): the Settings page still offers Light / Dark after task 158, and choosing one changes nothing.
- 2026-10-19 (from step 3): the run-time switcher is `themeApplier()` in `js/themes/applier.js`; `globalThis.msTheme` no longer exists. A saved theme that fails at start-up shows the fallback notice once and is not retried when settings load.

```prompt
/task-implement 160 --review
```

Done: 2026-10-19, commit `fdc5b69` (15 files, +520/-99). The settings document is version 2; the theme setting accepts any id the registry knows (`isRegisteredTheme`). The swatch reads four colours from each theme stylesheet (`themeSwatchColors`), since a preview element scoped by theme id cannot work.

## [x] 5. Implement task 161 — Theme conformance tests and the component gallery per theme

Depends on: 1, 2, 3

Context:
- 2026-10-19 (from step 1): the OFL licence files in `themes/joyful-tiles/` had their URL lines stripped so no theme file references a remote URL; the no-URL check need not exclude `OFL-*.txt` unless that is reverted. `themes/joyful-tiles/board.js` uses a `/* */` header comment so a `//` scan does not trip on it; its export is `BOARD`. Catalogue selectors are each component's own single class, with a shared class in a `base` field.
- 2026-10-19 (from step 2): the canvas draws a focus state only for the switch and no hover/focus for the slider, segmented choice, field or link; the Joyful tiles theme gives those the switch's ring with a halo. Five buttons (swap clicks, Tap: Reveal/Flag, the three 3D touch view-mode buttons) carry `data-no-focus` and are skipped by hover-to-focus.

```prompt
/task-implement 161 --review
```

Done: 2026-10-19, commit `d6c6d81` (16 files, +659/-8). The required token list is `REQUIRED_TOKENS` in `js/ui/kit-catalogue.js`; a decoration slot is an element marked `data-slot="<name>"`. The premise that `tests/tokens.test.mjs` and `tests/components.test.mjs` export contrast helpers was wrong — the conformance file carries its own.

## [x] 6. Implement task 162 — Update documentation for feature `theme-system`

Depends on: 1, 2, 3, 4, 5

Context:
- 2026-10-19 (from step 3): `.claude/context/app-shell-kit.md` and `.claude/context/settings.md` still describe `globalThis.msTheme` and light/dark; the switcher now lives in `js/themes/applier.js` (`themeApplier()`), with a test-only `registerTheme` and a fixture theme under `tests/fixtures/themes/`.
- 2026-10-19 (from step 4): the settings document is version 2 (`js/theme.js` reads 1 and 2); the Settings theme list is a `ui-segmented--list` variant with a per-theme swatch; `--color-accent-fill` joined `REQUIRED_TOKENS`.

```prompt
/task-implement 162 --review
```

Done: 2026-10-19, commit `2fba8f2` (14 files, +287/-164).

## [x] 7. Implement task 163 — Layout kit components: backdrop, screen frame, mode entry, board option, stat tile and the rest

Depends on: 2, 5

Context:
- 2026-10-19 (from step 5): a decoration slot is an element marked `data-slot="<name>"`; the conformance check flags any `[data-slot=…]` a theme styles that the kit catalogue (`js/ui/kit-catalogue.js`) does not list — task 163 picks the slot names. A catalogue part can carry `as`, naming the component whose rules draw it.

```prompt
/task-implement 163 --review
```

Done: 2026-10-19, commit `841d1ff` (10 files, +1540/-50). Disabled mode entries use `aria-disabled="true"` (focusable) rather than native `disabled`; the board option's chosen state is `aria-pressed="true"`. Counter strip and figures panel are left to task 175.

## [x] 8. Implement task 164 — 3D scene drawn into a screen's scene panel

Depends on: 7

Context: none

```prompt
/task-implement 164 --review
```

Done: 2026-10-19, commit `2613bb8` (5 files, +160/-5). The renderer draws into the visible `.ui-scene-panel__stage` (`setTarget(rect)`), found without a list of screens; a screen with no visible panel draws full-window.

## [x] 9. Implement task 165 — Main menu in the shared layout

Depends on: 7, 8

Context:
- 2026-10-19 (amend): Task 165 is rebuilt from the J-Menu artboards: nine entries (Hexagon, Triangle and Surface enabled, opening the Coming soon page), no Leaderboards entry, no Play again or session strip, the menu opening on the last mode played.

```prompt
/task-implement 165 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 160, which edits the same files; replaced by step 53.

## [x] 53. Implement task 165 — Main menu in the shared layout

Depends on: 4, 7, 8

Context:
- 2026-10-19 (from step 7): disabled mode entries are marked `aria-disabled="true"`, not native `disabled`, so they stay focusable for the "Desktop build only" / "no WebGL 2" previews; the screen's click handler must stop them opening anything.
- 2026-10-19 parked: The main menu's build label must show "the game's real version", but the game has no version anywhere — no version constant, no build step (GitHub Pages serves `main` as it is) and no tags; the artboards' "WEB · BUILD 0B437AA" is placeholder text. Where should the label's version come from?
  a. One file, `js/version.js`, holding a release version bumped by hand (0.2.0 suggested); the label reads "Web · v0.2.0".
  b. The deployed commit's short hash, written into a generated `js/build-info.js` by a new GitHub Actions deploy step (the site gains a build step).
  c. The latest commit of `main`, fetched from the GitHub API at run time (a network call on every load, no label offline).
  d. "Web" alone until the game has release versions.
  Recommendation: a — no build step, one file to bump, nothing fetched. The implementation is on `park/task-165` (task 165 `[PARKED]`); the review round runs after unparking.
- 2026-10-19 unparked with answer: Q1a — the build label reads its version from one file, `js/version.js`, holding a release version bumped by hand, starting at 0.2.0; the label reads "Web · v0.2.0".

```prompt
/task-implement 165 --review
```

Done: 2026-10-19, commit `3135e53` (26 files, +1137/-548). The release version lives in a hand-bumped `js/version.js` (0.2.0); the menu shows "Web · v0.2.0".

## [x] 10. Implement task 166 — Classic 2D board choice screen with its records panel

Depends on: 7

Context:
- 2026-10-19 (amend): Task 166 is retitled "Classic 2D board choice screen with its bests, Insert Board Code and Custom Random" and rebuilt from the J-C2D artboards: no records panel; the board code is a board option played with Play; Custom gains Random.

```prompt
/task-implement 166 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 165, which edits the same files; replaced by step 54.

## [x] 54. Implement task 166 — Classic 2D board choice screen with its bests, Insert Board Code and Custom Random

Depends on: 7, 53

Context: none

```prompt
/task-implement 166 --review
```

Done: 2026-10-19, commit `be6cee0` (25 files, +808/-249). A board option click only chooses it and Play (`#c2d-play`) starts it; the custom Start and code "Play this board" buttons are gone. Classic 2D options no longer show detail lines.

## [x] 38. Implement task 207 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: none

Context: none

```prompt
/task-implement 207 --review
```

Done: struck — task 207 skipped, replaced by task 212 in feature shared-screen-layout (step 52), placed before steps 40, 43 and 47, whose tasks wait on it.

## [x] 39. Implement task 208 — Update documentation for feature `3d-play-flow`

Depends on: 38

Context: none

```prompt
/task-implement 208 --review
```

Done: struck — task 208 skipped; task 173 (step 49) documents task 212.

## [x] 52. Implement task 212 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: none

Context: none

```prompt
/task-implement 212 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 166, which edit the same files; replaced by step 55.

## [x] 55. Implement task 212 — 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Depends on: 54

Context: none

```prompt
/task-implement 212 --review
```

Done: 2026-10-19, commit `e9b6523` (26 files, +218/-200). Start spacing is removed entirely (`startSpacing` and preset `spacing` gone): every 3D game, the Learn 3D lesson included, starts at `SPACING_START`.

## [x] 11. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10

Needs: agent+human

Context: none

```prompt
/task-implement 167 --review
```

Done: struck — task 167 now also waits on task 207 (First box presets removed) and needs no human, its artboards being drawn; replaced by step 40.

## [x] 40. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 10, 38

Context: none

```prompt
/task-implement 167 --review
```

Done: struck — for a parallel run its Depends on named struck step 38; lacked the edge to task 212, its precondition; replaced by step 56.

## [x] 56. Implement task 167 — 3D board choice screen in the shared layout

Depends on: 54, 55

Context:
- 2026-10-19 (from step 54): on the Classic 2D board choice, a click/tap/A on a board option only chooses it (`aria-pressed="true"`) and Play starts it; Enter on an option chooses and plays. Bests come from `boardBests(board, records)` in `js/shell/returning.js`. The 2D options dropped their detail lines; the 3D board choice keeps them.
- 2026-10-19 (from step 55): the First box 1 and 2 presets and `startSpacing` are gone; an old `box-1`/`box-2` choice fails `normaliseChoice` and opens on Cube Beginner with no-guess on.

```prompt
/task-implement 167 --review
```

Done: 2026-10-19, commit `d622b1d` (18 files, +907/-450). A 3D option click only chooses it and Play (`#bc-play`) starts it; `presetDetail(s)`, `CHOICE_ITEMS` and `densityText` are gone from `js/shell/returning.js`, and options show a static density.

## [x] 12. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 168 --review
```

Done: struck — task 168 needs no human, its artboards being drawn; replaced by step 41.

## [x] 41. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 168 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 167, 212, which edit the same files; replaced by step 57.

## [x] 57. Implement task 168 — Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Depends on: 7, 56

Context: none

```prompt
/task-implement 168 --review
```

Done: 2026-10-19, commit `a335002` (15 files, +251/-104). The pause card keeps the kit's uneven 2fr/3fr columns (the canvas's equal columns make a 3D game's controls list scroll at 1024 × 768); its Sound control is the Settings switch bound to `muted`. Premise wrong: the placeholder line does not name the mode, only the frame title does.

## [x] 13. Implement task 169 — Results screen in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 169 --review
```

Done: struck — task 169 needs no human, its artboards being drawn; replaced by step 42.

## [x] 42. Implement task 169 — Results screen redesigned in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 169 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 168, which edits the same files; replaced by step 58.

## [x] 58. Implement task 169 — Results screen redesigned in the shared layout

Depends on: 7, 57

Context:
- 2026-10-19 (from step 7): the kit has no quiet button variant or plain white stat tile; if the results screen needs one, it cannot add it itself (kit files are not in its `Files:`) — record a follow-up instead.

```prompt
/task-implement 169 --review
```

Done: 2026-10-19, commit `1d695b3` (12 files, +662/-453). The "neutral band on a loss" criterion stays unmet: the kit has no neutral header variant, so a lost game keeps the yellow band (the frame carries `data-outcome`); the 3BV solved bar is a plain browser progress bar. Watch best is offered only after a win that set no best.

## [x] 14. Implement task 170 — Records screen in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 170 --review
```

Done: struck — task 170 now also waits on task 207 and needs no human, its artboards being drawn; replaced by step 43.

## [x] 43. Implement task 170 — Records screen in the shared layout, with its Leaderboards tab

Depends on: 7, 38

Context: none

```prompt
/task-implement 170 --review
```

Done: struck — for a parallel run its Depends on named struck step 38; lacked the edge to task 212, its precondition; lacked the order against task 169, which edits the same files; replaced by step 59.

## [x] 59. Implement task 170 — Records screen in the shared layout, with its Leaderboards tab

Depends on: 7, 55, 58

Context:
- 2026-10-19 (from step 7): the kit has no quiet button variant or plain white stat tile; if Records needs one, it cannot add it itself (kit files are not in its `Files:`) — record a follow-up instead. Tabs, table, chip and list row are kit components.

```prompt
/task-implement 170 --review
```

Done: 2026-10-19, commit `d869374` (15 files, +424/-251). Back is labelled "Back" (Records returns one step through the back stack), not the artboard's "Main menu"; Replays is now a tab. Records tables still render as stacked cards at desktop sizes, unlike J-Records-xl — left for its own task.

## [x] 15. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7

Needs: agent+human

Context: none

```prompt
/task-implement 171 --review
```

Done: struck — task 171 needs no human, its artboards being drawn; replaced by step 44.

## [x] 44. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7

Context: none

```prompt
/task-implement 171 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 170, which edit the same files; replaced by step 60.

## [x] 60. Implement task 171 — Settings page in the shared layout

Depends on: 4, 7, 59

Context: none

```prompt
/task-implement 171 --review
```

Done: 2026-10-19, commit `243c528` (13 files, +428/-170). Back is "Main menu" in the window header; the `#set-controls` button is kept (every id survives) though the Bindings panel may make it redundant. Arrow/D-pad moves into a choice now land on its checked option on every screen.

## [x] 16. Implement task 172 — Replay viewer in the shared layout

Depends on: 7

Needs: agent+human

Context: none

```prompt
/task-implement 172 --review
```

Done: struck — task 172 needs no human, its artboards being drawn; replaced by step 45.

## [x] 45. Implement task 172 — Replay viewer in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 172 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 171, which edits the same files; replaced by step 61.

## [x] 61. Implement task 172 — Replay viewer in the shared layout

Depends on: 7, 60

Context: none

```prompt
/task-implement 172 --review
```

Done: 2026-10-19, commit `dfd5fc7` (12 files, +386/-165). Premise wrong: the 3D scene did not stay full-window when the viewer opens over the main menu; `syncScenePanel` now ignores scene panels on the replay screen. Some controls sit off their artboard places so Expert fits at 1024 × 768.

## [x] 36. Implement task 206 — Daily screen won time in the standard time format

Depends on: none

Context: none

```prompt
/task-implement 206 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 165, which edits the same files; replaced by step 62.

## [x] 62. Implement task 206 — Daily screen won time in the standard time format

Depends on: 53

Context: none

```prompt
/task-implement 206 --review
```

Done: 2026-10-19, commit `61354da` (3 files, +15/-10).

## [x] 46. Implement task 209 — Daily screen in the board-choice layout, listing every mode

Depends on: 7, 8, 10, 36

Context: none

```prompt
/task-implement 209 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 168, 172, which edit the same files; replaced by step 63.

## [x] 63. Implement task 209 — Daily screen in the board-choice layout, listing every mode

Depends on: 7, 8, 54, 61, 62

Context: none

```prompt
/task-implement 209 --review
```

Done: 2026-10-19, commit `03f9e06` (11 files, +556/-170). The Daily 3D entry without WebGL 2 uses native `disabled`, not the artboard's selected `aria-disabled` state (the kit has no disabled-but-selectable `ui-option`); a live scene panel inside a window raises the 3D canvas in front (`body.scene-front`).

## [x] 47. Implement task 210 — 3D ready card, lock states and Learn 3D cards in the shared layout

Depends on: 7, 38

Context: none

```prompt
/task-implement 210 --review
```

Done: struck — for a parallel run its Depends on named struck step 38; lacked the edge to task 212, its precondition; lacked the order against tasks 168, 209, which edit the same files; replaced by step 64.

## [x] 64. Implement task 210 — 3D ready card, lock states and Learn 3D cards in the shared layout

Depends on: 7, 55, 63

Context:
- 2026-10-19 (from step 55): the Learn 3D end card's text line has id `learn-end-line` (a win shows the Cube Intro line, a loss "Learn 3D"); the lesson board is `LESSON_BOX` (4 × 4 × 3, 4 mines) and starts at `SPACING_START` like every 3D game.
- 2026-10-19 (from step 63): `ui-option` has no disabled-but-selectable state in the kit or theme; the Daily 3D entry without WebGL 2 uses native `disabled` with its reason as the second line. A live scene panel inside a window raises the 3D canvas in front of it (`body.scene-front`, in `syncScenePanel`).

```prompt
/task-implement 210 --review
```

Done: 2026-10-19, commit `03021c8` (17 files, +339/-206). The Learn 3D loss card keeps task 212's copy, not the artboard's; the "Esc: Back" text hint (`.link-btn`, `.esc-row`) is gone from the kit, replaced by the back key hint inside the button.

## [x] 48. Implement task 211 — Toasts, fatal card, no-JavaScript notice and 404 page in the shared layout

Depends on: 7

Context: none

```prompt
/task-implement 211 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 210, which edit the same files; replaced by step 65.

## [x] 65. Implement task 211 — Toasts, fatal card, no-JavaScript notice and 404 page in the shared layout

Depends on: 7, 64

Context: none

```prompt
/task-implement 211 --review
```

Done: 2026-10-19, commit `124a60c` (17 files, +332/-51). Premise wrong: the old fatal card had no Reload, so Reload is new. The 404 page no longer redirects to `/`; it shows a themed "Page not found." card. `index.html` carries a fixed `data-theme="joyful-tiles"` for the no-JavaScript path.

## [x] 17. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16

Context: none

```prompt
/task-implement 173 --review
```

Done: struck — task 173 waits on task 206, and its step lacked the edge to step 36; replaced by step 37.

## [x] 37. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 36

Context: none

```prompt
/task-implement 173 --review
```

Done: struck — task 173 now also waits on tasks 209, 210 and 211; replaced by step 49.

## [x] 49. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 7, 8, 9, 10, 36, 40, 41, 42, 43, 44, 45, 46, 47, 48

Context: none

```prompt
/task-implement 173 --review
```

Done: struck — for a parallel run its Depends on lacked the edge to task 212, its precondition; lacked the order against task 162, which edits the same files; replaced by step 66.

## [x] 66. Implement task 173 — Update documentation for feature `shared-screen-layout`

Depends on: 6, 7, 8, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65

Context:
- 2026-10-19 (from step 54): `.claude/context/` files (e.g. `classic2d.md`, `app-shell-menu.md`) still describe the old Classic 2D board choice API; task 173 owns that update.
- 2026-10-19 (from step 56): `.claude/context/mode3d.md` and `app-shell-menu.md` still describe the old 3D board choice (removed ids `c-start`, `bc-code-play`; `presetDetail(s)`); task 173 owns that update.
- 2026-10-19 (from step 58): `.claude/context/app-shell-results.md` still describes the old results screen and Watch best rule; `.claude/domain/features/replay-playback.md` (around lines 184–186) still states the old Watch best rule — Watch best is now offered only after a win that set no best.
- 2026-10-19 (from step 59): `.claude/context/records-screen.md` still describes the old Records layout (Replays is now a tab; exports sit under the mode's overall figures).
- 2026-10-19 (from step 60): `.claude/context/app-shell-markup.md` and `settings-page.md` still describe the old Settings layout (Back is now "Main menu" in the header; three/two/one columns by width).
- 2026-10-19 (from step 65): the kit gained `ui-toast` and an optional card badge part `ui-card__icon`; the 404 page no longer redirects (it shows a themed card linking to `/`); `index.html`'s root carries a fixed `data-theme="joyful-tiles"` for the no-JavaScript path.

```prompt
/task-implement 173 --review
```

Done: 2026-10-19, commit `4ccc319` (25 files, +592/-304).

## [x] 18. Implement task 174 — Live figures model: 3BV progress, pace vs PB, 3BV/s, clicks and flags

Depends on: none

Context: none

```prompt
/task-implement 174 --review
```

Done: 2026-10-19, commit `d0d5dce` (4 files, +214/-2). Mines left stays signed (over-flagging shows "-2 mines left"), matching the overlay counter and pause card; `MINUS` is now exported from `js/results/view.js` and shared.

## [x] 19. Implement task 175 — Counter readout and figures panel kit components

Depends on: 7

Context: none

```prompt
/task-implement 175 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 211, which edit the same files; replaced by step 67.

## [x] 67. Implement task 175 — Counter readout and figures panel kit components

Depends on: 7, 65

Context: none

```prompt
/task-implement 175 --review
```

Done: 2026-10-19, commit `aefe406` (9 files, +578/-4). The counters and figures are not live regions (unlike J-Components); each figures panel has one hidden polite live part, `.ui-figures__live`, written only by `bindFiguresLive` at most every `LIVE_FIGURES_INTERVAL`.

## [x] 20. Implement task 176 — Classic 2D game window: counter strip, side panel and foot line

Depends on: 7, 18, 19

Context: none

```prompt
/task-implement 176 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 165, 166, 211, which edit the same files; replaced by step 68.

## [x] 68. Implement task 176 — Classic 2D game window: counter strip, side panel and foot line

Depends on: 7, 18, 67

Context:
- 2026-10-19 (from step 67): kit components are `ui-counter` (`data-negative` below zero), `ui-counter-strip`, `ui-figure` (`ui-figure--progress`) and `ui-figures` (head, body, foot, live). Announce figures only through `bindFiguresLive(panel).announce(text)` in `js/ui/components.js`; never put `aria-live` on counters or figures — this task decides the announced text.

```prompt
/task-implement 176 --review
```

Done: 2026-10-19, commit `736cd4a` (24 files, +861/-263). Expert no longer fits a 1024 px window (the canvas draws it clipped); the mine counter always shows three digits (`010`, `-05`) everywhere; the live region announces "3BV <solved> / <total>, <n> mines left" on count changes only.

## [x] 21. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 20

Needs: agent+human

Context: none

```prompt
/task-implement 177 --review
```

Done: struck — task 177 needs no human, its artboards being drawn; replaced by step 50.

## [x] 50. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 20

Context: none

```prompt
/task-implement 177 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 210, which edits the same files; replaced by step 69.

## [x] 69. Implement task 177 — 3D game overlay in the in-game layout

Depends on: 68

Context:
- 2026-10-19 (from step 67): announce figures only through `bindFiguresLive(panel).announce(text)` (`js/ui/components.js`); never put `aria-live` on the counters or figures — this task decides the announced text.
- 2026-10-19 (from step 68): the `hud-*` overlay bar is now 3D only and hidden in Classic 2D — this task rebuilds it. The mine counter format is three digits everywhere (`010`, `-05`, ASCII hyphen). Classic 2D announces "3BV <solved> / <total>, <n> mines left" through `bindFiguresLive` on count changes only, never on a timer tick.

```prompt
/task-implement 177 --review
```

Done: 2026-10-19, commit `481e9c5` (20 files, +689/-236). `#hud-size` is replaced by the panel title `#hud-title`; the board line lives only on the pause card. The aim readout keeps its +40/+28 offset (the artboard's falls inside the off-screen arrow's ring). The 3D overlay's per-size browser tests moved to `tests/components-game3d.test.mjs`.

## [x] 22. Implement task 178 — Live figures in the replay viewer

Depends on: 16, 18, 19

Needs: agent+human

Context: none

```prompt
/task-implement 178 --review
```

Done: struck — task 178 needs no human, its artboards being drawn, and waits on the re-added step 45; replaced by step 51.

## [x] 51. Implement task 178 — Live figures in the replay viewer

Depends on: 16, 18, 19, 45

Context: none

```prompt
/task-implement 178 --review
```

Done: struck — for a parallel run its Depends on named struck step 16; lacked the order against task 177, which edits the same files; replaced by step 70.

## [x] 70. Implement task 178 — Live figures in the replay viewer

Depends on: 18, 61, 67, 69

Context:
- 2026-10-19 (from step 61): the replay viewer's end line (outcome chip plus time, e.g. "Won 9.971 s") sits in the figures bar; Download and Open replay file sit beside the key line; Expert must fit at 1024 × 768 with tiles of at least 26 px (`tests/classic2d-mode.test.mjs`).
- 2026-10-19 (from step 67): announce figures only through `bindFiguresLive(panel).announce(text)` (`js/ui/components.js`); never put `aria-live` on the counters or figures — this task decides the announced text.
- 2026-10-19 (from step 68): the mine counter format is three digits everywhere (`010`, `-05`); Classic 2D announces "3BV <solved> / <total>, <n> mines left" on count changes only. Figures detail wording follows task 174 ("Best 48.213 s", "Efficiency 88.5%").
- 2026-10-19 (from step 69): `ui-overlay-bar` is now used only by the replay viewer. The 3D panel announces "3BV <solved> / <total>, <n> mines left" through `bindFiguresLive`, like Classic 2D; Learn 3D hides timer, pace and 3BV/s.

```prompt
/task-implement 178 --review
```

Done: 2026-10-20, commit `ffaf336` (10 files, +226/-49). The replay figures panel shows from 1200 px wide only (hidden at 1024 × 768 and on phones), as the artboards draw; `figuresLine` moved to `js/shell/live-figures.js`. A pre-existing flaky test in `tests/classic2d-mode.test.mjs` ("a few moves on a board with a best") fails on `main` too.

## [x] 23. Implement task 179 — Update documentation for feature `in-game-layout`

Depends on: 18, 19, 20, 21, 22

Context: none

```prompt
/task-implement 179 --review
```

Done: struck — for a parallel run its Depends on named struck steps 21, 22; lacked the edges to tasks 177, 178, its preconditions; lacked the order against task 173, which edits the same files; replaced by step 71.

## [x] 71. Implement task 179 — Update documentation for feature `in-game-layout`

Depends on: 18, 66, 67, 68, 69, 70

Context:
- 2026-10-19 (from step 68): the Classic 2D window ids are `c2d-time`, `c2d-mines-left`, `c2d-clicks`, `c2d-size` (foot line) and `c2d-pause`; `hud-swap`/`hud-tap` moved into the window; Expert scrolls below 1280 × 800. Context files for the Classic 2D window were left for this task.
- 2026-10-19 (from step 69): `.claude/context/app-shell-ui.md`, `mode3d-session.md` and `testing.md` still describe the old 3D overlay bar; `#hud-size` is now `#hud-title`, and `measureContrast` moved to `tests/helpers/contrast.mjs`.
- 2026-10-20 (from step 70): `.claude/context/replay-playback.md` does not yet mention `#replay-main` or `#rp-figures`; `figuresLine` now lives in `js/shell/live-figures.js` (re-exported from `js/ui.js`).

```prompt
/task-implement 179 --review
```

Done: 2026-10-20, commit `d4783dd` (18 files, +278/-153). Premise wrong: the feature document's Open questions section was already gone, so there were no artboards to drop from it.

## [x] 24. Implement task 180 — Tile recipe drawing styles: flat and bevel, with corner radius and depth

Depends on: none

Context:
- *Joyful tiles* draws flat 2D tiles with a corner radius that scales with the tile and bevel 3D cubes with four lit sides (J-BoardSheet, J-3DSheet).

```prompt
/task-implement 180 --review
```

Done: 2026-10-19, commit `eb90d70` (5 files, +675/-87). The sunk tile is a face of its own (`closed | sunk | revealed`), not a depth value; depth (0–1) scales the bevel slope on closed and sunk faces.

## [x] 25. Implement task 181 — Board module shape, the Joyful tiles board module and the board conformance checks

Depends on: 5, 24

Context: none

```prompt
/task-implement 181 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 157, 163, which edit the same files; replaced by step 72.

## [x] 72. Implement task 181 — Board module shape, the Joyful tiles board module and the board conformance checks

Depends on: 5, 7, 24

Context:
- 2026-10-19 (from step 24): bevel side shades are numbers from −1 (`bevelDark`) to 1 (`bevelLight`); an in-between shade mixes colours and works only with `#rrggbb` palette values, so task 181's palettes must use that form. Flat reuses bevel's palette keys (`bevelLight`, `bevelDark`, `rim`), and flat's built-in values are placeholders for task 181 to set.

```prompt
/task-implement 181 --review
```

Done: 2026-10-19, commit `a65f170` (10 files, +612/-14). Classic 2D numbers 1–8 use J-3DSheet's 3D colours (one number list; the 2D colours fail 4.5:1 against the hairline). Mid-animation face changes are zero-angle flips; the solved pulse's "toward white" is a brightness multiplier (×1.25/×1.45).

## [x] 26. Implement task 182 — Classic 2D tiles drawn from the active theme's board module

Depends on: 3, 25

Context: none

```prompt
/task-implement 182 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 175, 176, 177, 180, which edit the same files; replaced by step 73.

## [x] 73. Implement task 182 — Classic 2D tiles drawn from the active theme's board module

Depends on: 3, 69, 72

Context:
- 2026-10-19 (from step 72): the flat style has no separate width settings, so the pressed tile's top shade is 0.1 of the tile (J-BoardSheet: 0.08) and the exploded tile's border is 1 px (sheet: 2 px); accept the difference or record a follow-up. Classic 2D numbers 1–8 come from the board module's single (3D-sheet) number list.

```prompt
/task-implement 182 --review
```

Done: 2026-10-20, commit `abbafb7` (33 files, +932/-518). Boards gain a `gap` and `pitch` (tile + gap); fit, replay samples and pointer maths count in pitches, so Joyful boards are slightly smaller and Expert scrolls at 1366 × 650. The frame is a new kit component `ui-board-frame`. Premise wrong: the fidelity tests could not pass unchanged — their measurement helpers moved onto the pitch (assertions unchanged).

## [x] 27. Implement task 183 — 3D cubes, numbers and sky drawn from the active theme's board module

Depends on: 3, 25

Context: none

```prompt
/task-implement 183 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 158, 164, 180, 182, which edit the same files; replaced by step 74.

## [x] 74. Implement task 183 — 3D cubes, numbers and sky drawn from the active theme's board module

Depends on: 3, 72, 73

Context:
- 2026-10-20 (from step 73): the Classic 2D tiles no longer read the `--color-tile-*` tokens or `--color-number-8`; they are still declared in the theme and pinned by `tests/tokens.test.mjs` (its `SKIN_KEPT` comment is now stale) — retire them here if this task edits those files. The board art hand-off lives in `js/shell/board-art.js`; the fixture theme `fixture-dusk` has a complete board module.

```prompt
/task-implement 183 --review
```

Done: 2026-10-20, commit `82548ed` (15 files, +375/-407). The renderer takes the module through `setBoard(board)` via the board art hand-off, so the 3D scene, like Classic 2D, waits for the number font; the unread `--color-tile-*` tokens, `--color-number-8` and `--color-scene-*` are retired (the scene panel now reads `--color-panel-*`).

## [x] 28. Implement task 184 — Cell motion player

Depends on: 4, 25

Context: none

```prompt
/task-implement 184 --review
```

Done: struck — for a parallel run its Depends on waited on task 160, which neither a precondition nor a shared file needs; replaced by step 75.

## [x] 75. Implement task 184 — Cell motion player

Depends on: 72

Context: none

```prompt
/task-implement 184 --review
```

Done: 2026-10-19, commit `6674cc0` (8 files, +547/-4). `MOTION_CAP` is 256, measured on stand-ins for the 2D motion layer and 3D motion mesh (tasks 185/186 not yet built) with `dev/measure-cell-motion.mjs`. Easing applies per keyframe segment.

## [x] 29. Implement task 185 — Classic 2D cell motion: motion layer and event sources

Depends on: 26, 28

Context: none

```prompt
/task-implement 185 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 172, 176, which edit the same files; replaced by step 76.

## [x] 76. Implement task 185 — Classic 2D cell motion: motion layer and event sources

Depends on: 73, 75

Context:
- 2026-10-19 (from step 75): `MOTION_CAP` (256) was measured on a stand-in 2D motion layer with `dev/measure-cell-motion.mjs`; the player has an injectable `now()` clock, and a `null` description or a cell past the cap drops any running animation on that cell.
- 2026-10-20 (from step 73): Classic 2D boards have a `gap` and a `pitch` (tile + gap); a cell's slot is its tile plus the gap after it, and replay samples, `boardPoint` and `pointerPixel` count in pitches. The cursor ring is drawn inside its tile.

```prompt
/task-implement 185 --review
```

Done: 2026-10-20, commit `9866320` (17 files, +937/-60). The motion layer is a second canvas (`board-motion`) after the board canvas, so `#c2d-board canvas` matches two elements; depth steps 0/0.25/0.5/0.75/1 are cached in `js/classic2d/tile-skin.js`; a loss starts no motion. Premise wrong: the fidelity tests could not pass unchanged — their sampling waits for motion to finish (assertions unchanged).

## [x] 30. Implement task 186 — 3D cell motion: motion mesh, event sources and the solved pulse as a cell event

Depends on: 27, 28

Context: none

```prompt
/task-implement 186 --review
```

Done: struck — for a parallel run its Depends on lacked the order against tasks 172, 177, which edit the same files; replaced by step 77.

## [x] 77. Implement task 186 — 3D cell motion: motion mesh, event sources and the solved pulse as a cell event

Depends on: 74, 75

Context:
- 2026-10-19 (from step 72): the board module writes the solved pulse's "toward white" 25 % / 45 % as brightness ×1.25 / ×1.45, which saturates a number glyph rather than whitening it; handle this when replaying the pulse.
- 2026-10-19 (from step 75): `MOTION_CAP` (256) was measured on a stand-in 3D mesh; re-run `node dev/measure-cell-motion.mjs` against the real motion mesh and adjust the cap if the 3D side is heavier than the stand-in.
- 2026-10-20 (from step 74): the renderer takes the board module through `setBoard(board)` (atlas, sky, fog, clear colour, selection outline, start-cell tint); the atlas gains a sunk-face layer `L_SUNK` at the end; the end waves and flag flash still mix toward white per J-3DSheet.

```prompt
/task-implement 186 --review
```

Done: 2026-10-20, commit `4889948` (6 files, +592/-128). Brightness above 1 is drawn as a lift toward white by the excess (below 1 it multiplies), departing from the feature document's "multiplier"; the solved pulse now plays through the one motion mesh. Premise wrong: the event sources live in the renderer (`BoardRenderer.sync()`), so `js/shell/mode-3d.js` and `js/replay/viewer-3d.js` are unchanged. `MOTION_CAP` stays 256 after re-measuring.

## [~] 78. Implement task 213 — 3D selection glow line, selected-face tint and confetti colours drawn from the board module

Depends on: 72, 74, 77

Context:
- 2026-10-20 (from step 77): animating cubes are hidden by a per-cell flag (the state texture's B channel); the solved pulse plays through the motion mesh; brightness above 1 is a lift toward white by the excess.

```prompt
/task-implement 213 --review
```

## [x] 31. Implement task 187 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 24, 25, 26, 27, 28, 29, 30

Context: none

```prompt
/task-implement 187 --review
```

Done: struck — for a parallel run its Depends on lacked the edge to task 213, its precondition; lacked the order against tasks 173, 179, which edit the same files; replaced by step 79.

## [ ] 79. Implement task 187 — Update documentation for feature `themed-board-art-and-motion`

Depends on: 24, 71, 72, 73, 74, 75, 76, 77, 78

Context:
- 2026-10-19 (from step 6): `.claude/domain/features/theme-system.md` records the placeholder board module and the to-do board-check test; remove those two sentences once `themed-board-art-and-motion` replaces them.
- 2026-10-20 (from step 73): context files `classic2d-tile-skin.md`, `classic2d-board-view.md` and `app-shell-kit.md` still describe the pre-module design; also document the pitch units in `js/replay/sampler-2d.js` and drop the `js/classic2d/tile-skin.js` comment claiming Expert fits 1024 px. `palette.faces2d.marked` is unused (the start cell is still a `--color-success` ring).
- 2026-10-20 (from step 74): `.claude/context/rendering.md`, `app-shell-kit.md` and `INDEX.md` still describe `setScenePalette` and the unthemed atlas; the renderer now has `setBoard(board)` and the atlas gains an `L_SUNK` layer at the end.
- 2026-10-20 (from step 76): record the Classic 2D depth steps (0, 0.25, 0.5, 0.75, 1, cached in `js/classic2d/tile-skin.js`), the `board-motion` second canvas, and that what depth means on a bevel-style 2D pressed face is undecided (Joyful uses flat).
- 2026-10-20 (from step 77): record the brightness contract — above 1 is a lift toward white by the excess, below 1 a multiplier — in the feature document and `js/themes/board-module.js`'s vocabulary comment; the solved pulse is merged into the one motion mesh (`pulseEnvelope`, `PULSE_*` and `_pulses` are gone), which `.claude/context/rendering-effects.md` still describes.

```prompt
/task-implement 187 --review
```

## [x] 32. Implement task 188 — The theme-implement skill

Depends on: 5, 7, 19, 25

Context: none

```prompt
/task-implement 188 --review
```

Done: struck — the steps its Depends on names are re-added for a parallel run; replaced by step 80.

## [x] 80. Implement task 188 — The theme-implement skill

Depends on: 5, 7, 67, 72

Context: none

```prompt
/task-implement 188 --review
```

Done: 2026-10-19, commit `8d30ac6` (8 files, +605/-1). Premise wrong: the canvas draws cell motion as labelled frame strips, not CSS keyframes (the skill accepts both). The dry run showed two blockers for a real second theme: `tests/settings-page.test.mjs` assumes one theme, and a theme switch in Chromium unloads font faces the page has not drawn.

## [x] 33. Implement task 189 — Update documentation for feature `theme-implement-skill`

Depends on: 32

Context: none

```prompt
/task-implement 189 --review
```

Done: struck — for a parallel run its Depends on lacked the order against task 187, which edits the same files; replaced by step 81.

## [ ] 81. Implement task 189 — Update documentation for feature `theme-implement-skill`

Depends on: 79, 80

Context:
- 2026-10-19 (from step 80): the skill's write scope includes the theme-list mirror in `js/theme.js`; only derived number colours are adjusted for contrast (a drawn number that fails is a question/stop); fetched font licences have their URLs stripped; motion may be given as frame strips or CSS keyframes.

```prompt
/task-implement 189 --review
```

## [x] 34. Implement task 204 — Daily screen won time in the standard time format

Depends on: none

Context: none

```prompt
/task-implement 204 --review
```

Done: struck — task 204 replaced by task 206, step 36, placed before step 17 because task 173 waits on it.

## [x] 35. Implement task 205 — Update documentation for feature `game-shell`

Depends on: 34

Context: none

```prompt
/task-implement 205 --review
```

Done: struck — task 205 dropped; task 173 documents the Daily won time.
