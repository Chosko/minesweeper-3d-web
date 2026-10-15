# Touch wording for the one-time hints and Learn 3D prompts

## Goal
On a coarse-only (touch-only) device the auto-hide toast, the aim hint and
the Learn 3D prompts still name keys a phone player cannot press ("Hold Ctrl",
"Hold Space", "Click the marked cube"). Give each a touch text naming the 3D
touch toolbar's Ctrl / Space / Shift buttons and the tap / long-press /
two-finger tap gestures, and have the shell draw them for the device the
other help surfaces speak for (`UI._bindDevice`: touch on a coarse-only
device unless a controller is in use).

## Acceptance criteria
- `HINT_TEXT` in `js/settings/bindings.js` has a `touch` entry for `autoHide`,
  `aimHint`, `learnStart`, `learnShift`, `learnCtrl`, `learnFlag`,
  `learnChord` and `learnRest`; `hintText(name, 'touch')` returns it.
- No touch text names a key (Ctrl, Space, Shift only as "… button"), a
  controller glyph, "Hold" or "Click"; the button and gesture names it uses
  are inputs of the 3D touch binding rows.
- The touch texts: `autoHide` "Solved cubes hide. Tap the Ctrl button to see
  them."; `aimHint` "Tap the Space button to aim through numbers.";
  `learnStart` "Aim at the marked cube and tap to start"; `learnShift` "Tap
  the Shift button to see what this number counts"; `learnCtrl` "Tap the
  Ctrl button to see the cubes you cleared"; `learnFlag` "Aim at the one cube
  that must be a mine and long-press to flag it"; `learnChord` "Aim at the
  number and tap two fingers together on the right half to chord" (the
  second finger lands on the look half while the first is still a pending
  tap, `js/touch-3d.js`); `learnRest` "Clear the rest of the box".
- Keyboard and controller texts are unchanged.
- The Learn 3D prompt in the hint strip is drawn with
  `hintText(learn, this._bindDevice(this._mode), this._glyphs)`.
- The auto-hide toast and the aim hint are drawn through a `UI` method that
  uses the same `_bindDevice` rule; `js/main.js` no longer passes
  `DEVICE.current` to `hintText`.
- In a browser on a coarse-only device, Learn 3D's first prompt reads the
  touch `learnStart` text.
- `.claude/context/app-shell-help.md` and `.claude/context/settings-bindings.md`
  state that these texts follow the touch device too.

## Decisions
- Toolbar buttons are named with "Tap the … button", not "Hold": the touch
  toolbar latches (a tap turns each on or off).
- Tap, long-press and the two-finger tap act on the crosshair cube, so the
  prompts that act on a cube say "Aim at …".

## Hints
- `js/settings/bindings.js` (`HINT_TEXT`, `hintText`, the 3D touch rows)
- `js/ui.js` (`setHintStrip`, `_bindDevice`, `toast`)
- `js/main.js` (`noteAutoHide`, the frame loop's aim hint)
- `js/touch-3d.js` head comment (the chord gesture)
- `tests/shell-first-use.test.mjs`, `tests/mode3d-learn.test.mjs`,
  `tests/shell-help.test.mjs`, `tests/shell-mode-3d.test.mjs`
- `.claude/context/app-shell-help.md`, `.claude/context/settings-bindings.md`

## Drift
- `.claude/context/app-shell-help.md` § INTERNAL PATTERNS (First-use hints) — diverges: says the toast's, aim hint's and Learn 3D's words come from the active device's names, "never touch"; the change draws them for touch on a coarse-only device. Updated in this commit.
- `.claude/context/settings-bindings.md` § PUBLIC API (`HINT_TEXT`) — diverges: says only the scroll hint has a touch text; every hint and prompt now has one. Updated in this commit.
- `.claude/domain/features/3d-play-flow.md` § Learn 3D bullet — settles: the feature names the prompts as "hold Shift … hold Ctrl" without stating per-device wording; on touch they name the latched toolbar buttons the same feature describes.
