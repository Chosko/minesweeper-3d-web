# Classic 2D mouse button swap

## Goal
A toggle on the Classic 2D game board swaps the left and right mouse buttons
for presses that start on a closed or flagged cell, so a player can flag and
chord with the left button alone — opening a cell then takes a deliberate
right click — and a touch tap (which the browser delivers as a left click)
flags instead of revealing. It is a separate layer that translates the
physical button before the existing press-and-release state machine sees it,
so the swapped buttons keep the exact press/release timing, pressed feedback
and chord gestures of the buttons they stand for.

## Acceptance criteria
- A new module holds the swap switch (off at page load, kept across games,
  never saved) and a per-press translator: at a button's press, while the
  switch is on and the cell under the pointer is closed or flagged, left (0)
  becomes right (2) and right becomes left; any other button, cell state or
  switch state passes the button through unchanged.
- The translation chosen at a press is kept for that button until its
  release, so the release goes to the same logical button even if the switch
  flips or the cell changes while it is held; a release with no recorded
  press passes through unchanged; `reset()` forgets every recorded press.
- `mountPointerInput` passes each mouse press and release through the
  translator when one is given, and resets it with the input on blur and
  destroy; without one, behaviour is unchanged. The shift + primary pan
  check reads the physical button.
- `createPointerInput`, the rule profiles, the cursor (keyboard and
  controller) input and the session are unchanged.
- With the switch on, on a closed cell a left press flags it at once and a
  right press shows it pressed and reveals it on release; on a revealed
  number a left release still chords.
- The Classic 2D overlay bar carries a toggle button beside Pause, shown only
  in Classic 2D while the game is not paused, reporting its state through
  `aria-pressed`; activating it flips the switch, and it never takes keyboard
  focus away from the board's cursor keys.
- The 3D mode is unchanged and shows no toggle.
- Tests cover the translator, the mount's use of it, and the toggle's
  visibility and state.

## Decisions
- Swap at the physical button, per press, not at the engine action — swapping
  finished actions would flag on a release and reveal on a press in Classic
  2D, which is unacceptable.
- Classic 2D only: 3D play under pointer lock cannot reach an on-board button.
- Mouse only: the keyboard and controller already have separate reveal and
  flag inputs.
- The switch lives for the page: it survives new games and resets on reload;
  it is not a setting.
- Flagged cells count as closed, so with the switch on a left press unflags.

## Hints
- `js/classic2d/pointer-input.js` (`mountPointerInput`: the one hook point)
- `js/classic2d/mode.js` (`mount.pointer({ view, session })`: hand the translator through)
- `js/main.js` (creates the mode and the UI callbacks; owns the switch for the page)
- `js/ui.js` (`showClassic2D`, `showPause`, `_hide2D`, the overlay bar's Pause wiring)
- `index.html` (`#hud .hud-bar`), `css/style.css` (`#hud.hud--2d` rules)
- `tests/classic2d-pointer.test.mjs`, `tests/classic2d-mode.test.mjs`

## Drift
- `README.md` § Classic 2D controls — settles: the mouse table lists the default button roles; the swap toggle is not mentioned.
- `docs/ORIGINAL_SPEC.md` § Timer — settles: the timer starts on the first reveal release, which with the swap on is a right-button release.
- `.claude/domain/features/classic-2d-square-play.md` § mouse input — settles: the board's mouse input gains an optional per-press button swap.
- `.claude/domain/features/input-rebinding.md` § Scope and non-goals — settles: the swap is not a binding; it translates buttons per press after the bindings, and the rebinding work must keep the translator in front of the pointer state machine.
- `.claude/domain/business-model.md` § audience — settles: touch players stay unserved; a tap flagging under the swap is a side effect, not touch support.
- `.claude/context/classic2d.md` § pointer input, `.claude/context/app-shell.md` § overlay bar — settles: the new module, the mount option and the overlay bar's toggle.
