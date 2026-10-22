# Show the unlisted keys in the help panels

## Goal
Some keys work in play but appear on no screen. List them in the help
list — the H panel and the pause card, which read the same help rows — and
nowhere else: the ready card, the rules block, the HUD and hint strips and
the Settings page's full rows stay as they are.

## Acceptance criteria
- 3D's keyboard help rows (`HELP_3D` in `js/settings/bindings.js`), for both
  cameras, list `[Enter] / [']` as Reveal / flag and `[Home] / [R]` as Back to
  the start view.
- 3D's help foot on the keyboard and on the controller states that actions
  fire on release, beside the key that hides the panel; the touch foot is
  unchanged.
- Classic 2D's keyboard help rows (`HELP_BINDINGS['classic-2d'].keyboard`)
  list `[H] · [M]` as Help · Sound and the wheel (with Shift for sideways) as
  scrolling a large board.
- `BINDINGS`, `READY_BINDINGS`, `HUD_STRIP`, `HINT_STRIP` and the Classic 2D
  help foot are unchanged.
- The H panel shows every row unclipped at the 3D overlay's desktop sizes
  and the Classic 2D game window's desktop sizes.
- `.claude/context/settings-bindings.md` describes the help foot as it now
  reads.

## Decisions
- The rows go into the help list, which the pause card shares with the H
  panel — the code's one help list; splitting it would be a new list.
- Classic 2D's H row is a row of its own beside M, as 3D's full rows join
  them, although the foot line already names H as the key that hides the panel.

## Hints
- `js/settings/bindings.js` (`HELP_3D`, `HELP_BINDINGS`, `HELP_FOOT`)
- `js/input.js` (`ACTION_KEYS`, `RETURN_KEYS`), `js/main.js` `onKey` (H and M in both modes, Home and R in 3D play)
- `js/classic2d/board-view.js` `wheel` (Shift turns a vertical wheel sideways)
- `tests/shell-help.test.mjs`, `tests/components-game3d.test.mjs`, `tests/components.test.mjs` (the help panel's layout)
- `.claude/context/settings-bindings.md`

## Drift
- `.claude/context/settings-bindings.md` § PUBLIC API — diverges: `HELP_FOOT` names the release rule on touch only; the change states it on the keyboard and controller too (updated in this commit).
- `.claude/context/settings-bindings.md` § PUBLIC API — settles: `HELP_BINDINGS` is "the help list where the canvas draws it shorter"; the Classic 2D and 3D keyboard help rows now carry rows the canvas does not draw.
- `.claude/domain/features/game-shell.md` § Restart — settles: `R` and `Home` return the camera to the start view in 3D play; the help list now names them.
- `.claude/domain/features/classic-2d-square-play.md` § Board view — settles: the one-time scroll hint names the wheel; the help list now names it too.
- `.claude/domain/features/shared-screen-layout.md` § controls list — settles: the controls list is fed in the canvas's short wording; the new rows follow that wording.
