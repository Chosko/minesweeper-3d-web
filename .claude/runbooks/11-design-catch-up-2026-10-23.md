# Runbook: design-catch-up-2026-10-23

Created: 2026-10-23 · Source: /design-catch-up (design changelog entries 2026-10-23 13:13 to 18:08) · Model: opus
Last step number: 9
Parallelism: 4

## [x] 1. Implement task 281 — Button colour rule: go and stop buttons

Depends on: none

Context: none

```prompt
/task-implement 281 --review
```

Done: 2026-10-23, commit `b8f936f` (27 files, +397/-144). Decision: controller glyphs kept through a new `confirm` key-hint action in `js/settings/bindings.js`; `createButton` now takes `go` or `stop` and refuses a plain `primary`.

## [x] 2. Implement task 282 — Window title bar and game logo on every screen

Depends on: 1

Context:
- 2026-10-23 (from step 1): the red stop button exists in the kit and gallery only; its one canvas use, the title bar's Quit, is this task's to wire.

```prompt
/task-implement 282 --review
```

Done: 2026-10-23, commit `c56346c` (26 files, +979/-395). Premise wrong: the platform layer had no capability flags; `capabilities` with `desktopHost: false` was added to `js/platform/index.js`.

## [x] 3. Implement task 283 — Main menu redesign: play tiles with their own previews

Depends on: 2

Context:
- 2026-10-23 (from step 2): the main menu now sits in a frame filling the page's height, named by the logo with no heading; the play-tile redesign is left to this task.

```prompt
/task-implement 283 --review
```

Done: 2026-10-24, commit `086eace` (41 files, +1163/-930). Decision: Quit is no longer a main menu entry — the title bar's Quit is the only one; the menu's two still images ship as PNGs under `assets/menu/`, outside the theme folder.

## [x] 4. Implement task 284 — Collapsible board choice panel, Classic 2D and 3D

Depends on: 2, 3

Context: none

```prompt
/task-implement 284 --review
```

Done: 2026-10-24, commit `8c37909` (28 files, +812/-416). Decision: the panel behaviour is `bindChoicePanel` in `js/classic2d/board-choice.js`, which the 3D binder imports; `choiceSummary` and `LEARN_SUMMARY` are removed and `show()` no longer takes `played`.

## [x] 5. Implement task 286 — Classic 2D game window: title bar with Pause, mode in the footer, collapsed live figures

Depends on: 1, 2, 4

Context:
- 2026-10-24 (from step 4): the board choice panels are `#c2d-choice-panel` and `#bc-choice-panel` (`#c2d-panel` is the game window's board frame); Up from the first board option walks to the panel toggle, then the title bar's Quit.
- 2026-10-23 (from step 2): two stopgaps for this task to remove — the in-game title bar still holds Swap clicks and Pause, so at 1366 and 1024 wide the game window takes the bar's width (board kept at the start), and the window's body heading is visually hidden.
- 2026-10-24 parked: Q1. During a Classic 2D game every controller input goes to the board: the D-pad and stick move the cursor, A/X/Y/LT/RT play, Start and B/Back pause. Nothing reaches the window's foot, so the criterion "keyboard and controller reach the toggle and Swap clicks in the footer" has no controller route yet. The keyboard reaches both by Tab, and Enter or Space presses them. How should the controller reach them?
    a) One free controller button toggles the live figures directly (RB, say), listed in the controls lists. Swap clicks stays unreachable by controller, since it only swaps mouse buttons. The same button can serve task 287's 3D toggle.
    b) A focus walk off the board: pushing the D-pad past the board's bottom edge leaves the cursor and walks the foot's controls (Swap clicks, the toggle), A presses, and Up goes back to the board.
    c) A "Live figures" switch on the pause card, which the controller already walks, sets the same stored preference. The foot's controls stay mouse and keyboard only.
    d) No controller route in this task: ship keyboard reach only and file a follow-up task for the controller.
    Recommendation: a. It is one binding, needs no new navigation mode, and can be reused in 3D.
- 2026-10-24 (from step 5's parked run): task 286's work is parked as `de780a6` on `park/task-286`. The step 2 stopgap holds in part: at 1366 and 1024 wide the title bar is still wider than Intermediate's board column, so the window takes its width. The taller foot makes the board one tile size smaller than the canvas draws (41 px at 1920×1080, 27 px at 1024×768).
- 2026-10-24 unparked with answer: Q1a — one free controller button (RB, say) toggles the live figures directly, listed in the controls lists; Swap clicks stays unreachable by controller; the same button can serve task 287's 3D toggle.

```prompt
/task-implement 286 --review
```

Done: 2026-10-24, commit `249ecd5` (28 files, +448/-179). Decision: RB toggles the live figures in a Classic 2D game, listed in its controller rows; Swap clicks has no controller button.

## [x] 6. Implement task 287 — 3D game overlay without a title: floating Pause and live-figures toggle

Depends on: 5

Context:
- 2026-10-24 (from step 5): the live figures' open state is the stored `shell.liveFigures` document, meant to be shared with the 3D overlay; RB is Classic 2D's live-figures button (listed in its controller rows), chosen so the same button can serve the 3D toggle.
- 2026-10-24 (from step 6's parked run): that premise is wrong — in 3D play RB is held for the Space view mode (`controls.pad.space = held(BTN.RB)` in `padPlaying`). Task 287's work is parked as `755c950` on `park/task-287`; still to do after the unpark: the controller wiring and its bindings row, the context-file updates, the full suite and the review round.
- 2026-10-24 parked: Q1. Which controller button should open and close the live figures in 3D play?
    a. D-pad Right — free in 3D play (D-pad Up and Down step the spacing); Classic 2D keeps RB.
    b. Right-stick click — free in 3D play, but harder to find; Classic 2D keeps RB.
    c. RB in both modes, moving the Space view mode to another button — a wider rebinding of 3D play.
    d. No controller button in 3D — the toggle by mouse, touch and keyboard only.
    Recommendation: a — it needs no rebinding, sits under the thumb and adds one row to the 3D controller bindings.
- 2026-10-24 unparked with answer: Q1 other — the View button (`BTN.BACK`, left of the Xbox button) shows or hides the live figures in every mode, Classic 2D and 3D alike; Classic 2D moves off RB, so RB stays the 3D Space view mode. Start is the only way to pause during play: View, and B in Classic 2D, no longer pause, and the controls lists say so. This step carries the Classic 2D rebinding too, since task 286 has landed.

```prompt
/task-implement 287 --review
```

Done: 2026-10-24, commit `9254c1d` (36 files, +343/-287). Decision: on the board-generation and failure cards View (and B over the Classic 2D card) still cancels or goes back; `backButtons` takes a `{ card }` option for that case.

## [x] 7. Implement task 285 — Update documentation for feature shared-screen-layout

Depends on: 1, 2, 3, 4

Context:
- 2026-10-23 (from step 2): several `.claude/context` files still describe the old large game title (`ui-wordmark`) and the old head layout.
- 2026-10-24 (from step 3): task 283's commit already updated the context files it made stale.
- 2026-10-24 (from step 4): task 284 left the context files alone; the entries for the board choices and the 3D mode still describe the old screens.

```prompt
/task-implement 285 --review
```

Done: 2026-10-24, commit `e1cac9f` (22 files, +247/-143). The stale wording reached past the task's file list, so eight more context files were updated; the feature document's other passages still carry the old wording, left for `/architect`.

## [~] 8. Implement task 288 — Update documentation for feature in-game-layout

Depends on: 5, 6

Context:
- 2026-10-24 (from step 5): task 286's commit already updated several `.claude/context` files to match its code.
- 2026-10-24 (from step 6): task 287's commit already updated `in-game-layout.md`, `game-shell.md` (Start the only pause in play; the back button means Back only off the board) and `classic-2d-square-play.md` (B never acts on the board).
- 2026-10-24 (from step 6's unpark): the controller binding changed after task 286 — View toggles the live figures in every mode and Start is the only pause during play; the docs record that, not step 5's RB.

```prompt
/task-implement 288 --review
```

## [x] 9. Update the Joyful tiles theme from its canvas

Depends on: 3, 4, 6

Context:
- 2026-10-24 (from step 6): whether the 3D ready card matches the J-Ready artboards is still unchecked against the canvas; task 287 did not touch the card.
- 2026-10-24 (from step 4): the kit catalogue has a `ui-drawer` component and a `panel` icon; the panel toggle is the quiet button with `aria-pressed`, not a component of its own.
- 2026-10-24 (from step 3): the seven menu accent pastels and the stronger neutral are already in Joyful tiles, pinned by a contrast test; the menu's still images live under `assets/menu/`, since the theme folder admits only font binaries.

```prompt
/theme-implement https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC joyful-tiles

This is an update of the registered Joyful tiles theme from the "Minesweeper 3D Screens" canvas, after tasks 281–288 built the kit parts the design changelog entries of 2026-10-23 (13:13 to 18:08) added: the go and stop button variants, the title bar and game logo, the main menu buttons, the board choice panel toggle and drawer, the live-figures toggle. The values those entries left to the theme are: the main menu buttons' pastel and stronger-neutral tokens (J-Tokens, "Menu entry pastels"), their smaller edge with no drop shadow, the slimmer large confirm buttons, and the go / stop colours resting in a stronger pastel and taking the full colour when selected (J-Components). When the canvas needs a part the contract cannot express, stop as the skill says and name the task needed.
```

Done: 2026-10-24, no commit — Joyful tiles already matched the canvas in every value the prompt lists; tasks 281–288 had written them. The 3D ready card is still unchecked against J-Ready.
