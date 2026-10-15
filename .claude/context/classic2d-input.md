# Classic 2D — pointer, button swap, touch and cursor input

## OVERVIEW

The Classic 2D board's inputs, each a state machine over the session's
actions plus a mount that wires it to the board view and the session. Every
input rule reads a profile marker, so a rule change is a profile change,
not a new state machine. The area overview is [classic2d.md](classic2d.md).

- `js/classic2d/pointer-input.js` — the mouse press-and-release state
  machine and `mountPointerInput`. DOM-free at import.
- `js/classic2d/button-swap.js` — the page's mouse button swap (off at
  creation, never saved) and its per-press translation. DOM-free.
- `js/classic2d/cursor-input.js` — the keyboard and controller cell cursor
  and `mountCursorInput`. DOM-free at import.
- `js/classic2d/touch-input.js` — the touch state machine (tap, long-press
  flag, Reveal / Flag switch, pan and pinch) and `mountTouchInput`.
  DOM-free at import.

## PUBLIC API

`js/classic2d/pointer-input.js`
- `BUTTON` (`LEFT` 0, `MIDDLE` 1, `RIGHT` 2).
- `pointerRules(profile?)` → frozen `{chordInputs, revealInputs,
  flagToggle, pressFeedback, releaseOffCell}`, the reference profile's by
  default ([engine.md](engine.md)).
- `createPointerInput({graph, game, onPress, onAction, rules?, active?})` →
  `{down(button, c), up(button, c), move(c), reset(), holding}` — `c` the
  cell under the pointer or -1; `onPress(cells)` on every change of the
  pressed set; `onAction(kind, c)` with `'reveal' | 'toggleFlag' | 'chord'`.
- `mountPointerInput({view, session, graph?, win?, rules?, swap?})` →
  `{input, destroy()}`.

`js/classic2d/button-swap.js`
- `createButtonSwap()` → `{on, toggle(), onChange(fn), press(button,
  closed), release(button), reset()}` — `press` trades `LEFT` and `RIGHT`
  only while on and `closed`, recording the result until `release(button)`
  returns it; a release with no recorded press passes through.

`js/classic2d/touch-input.js`
- `LONG_PRESS_MS` (400), `TAP_SLOP` (8 px), `VIBRATE_MS`, `TAP_MODES`
  (`reveal`, `flag`).
- `createTouchInput({graph, game, onPress, onAction, onPan?, onPinchStart?,
  onPinch?, scrolls?, flagMode?, vibrate?, clock?, rules?, active?})` →
  `{down(id, x, y, c), move(id, x, y, c), up(id, x, y, c), cancel(id),
  reset(), holding}` — `x, y` canvas CSS pixels; `onPinch(mid, ratio)`.
- `mountTouchInput({view, session, graph?, win?, rules?, flagMode?, clock?,
  onUserScroll?})` → `{input, destroy()}`.

`js/classic2d/cursor-input.js`
- `CURSOR_KEYS` (key code → `up`/`down`/`left`/`right`/`reveal`/`flag`/
  `chord`), `PAD_MAP` (`BTN` index → the same), `STICK_THRESHOLD`.
- `createCursorInput({grid, game, onPress, onAction, onCursor?, onUse?,
  onPadCue?, rules?, active?, delay?, interval?, start?})` → `{cell, setCell(c), move(dx, dy),
  hold(source, dir), let(source, dir), tick(now), down(source, button),
  up(source, button), pad(poll, now), reset(), holding, moving}` —
  `start` the cell the cursor starts on (0; a daily's or a challenge's
  forced start cell, through `mountCursorInput`'s `start`); `onUse()` before each cursor input the board takes;
  `onPadCue(kind)` a controller press the shell answers with a rumble — `'flag'` when X or LT placed or
  removed a flag, else `'press'` when RT or LT was pressed while the board takes input (keys, A and Y
  never report); `poll` a
  `GamepadReader` poll after the shell's held-button suppression
  ([input-controller.md](input-controller.md)).
- `mountCursorInput({view, session, grid?, win?, rules?, delay?,
  interval?, onPadCue?})` → `{input, pad(poll, now?), shown, destroy()}`.

## INTERNAL PATTERNS

- **Pointer input.** Reveal and chord act on the release of the last reveal
  button, a flag on the right press; a left + right gesture acts on the
  left release, as a chord only. The mount listens for `mousedown` on the
  canvas and `mousemove` / `mouseup` / `blur` on the page (a second button
  held during the first fires no `pointerdown`), suppresses the context
  menu, takes input only while the session is `ready` or `playing` and not
  paused, and leaves a `PAN_MODIFIER` + primary press on a scrolling board
  to the pan (read from the physical button).
- **Button swap.** It translates the physical button in front of the state
  machine, never the finished action, so a swapped left press on a closed
  cell flags at once and a swapped right press reveals on release, with the
  press feedback and chords of the button it stands for. The translation is
  chosen at the press (the cell's state read from `session.game`) and kept
  until that button's release; it is reset on blur and destroy. `main.js`
  creates one swap for the page and hands it to the mode
  ([app-shell-2d.md](app-shell-2d.md)); the cursor input never sees it.
- **Touch input.** Touch pointers only (`pointerType` `'touch'`); the
  mount cancels `pointerdown` and the canvas's `touchstart` / `touchmove` /
  `touchend`, so a tap fires no emulated mouse events and never reaches the
  pointer input or the 2D sampler. One finger: held `LONG_PRESS_MS` within
  `TAP_SLOP` it toggles a closed or flagged cell's flag while held (one
  `navigator.vibrate`), nothing on a revealed cell, and the lift does
  nothing; lifted sooner it acts on the touched cell — a number chords, a
  closed cell reveals or, while `flagMode()`, toggles its flag; moved
  `TAP_SLOP` or more it pans (`view.pan`) a board that scrolls, else acts on
  nothing. Press feedback reads `pressFeedback`, only for a tap that would
  reveal or chord. A second finger cancels the first's tap and starts the
  pinch: `view.zoom(tile at start × spread ratio, midpoint, board point
  under the start midpoint)`; lifting a finger ends the gesture. Input is
  taken while the session is `ready` or `playing` and not paused.
- **Cursor input.** Space / Enter and A / RT only reveal (nothing on a
  number), F and X / LT flag (on the press), D and Y only chord; reveal and
  flag held together are left + right, chording when `chordInputs` has
  `left+right`. B, Start and Back are the shell's and unmapped. Press
  feedback and a held press under a moving cursor read the same profile
  markers as the pointer input. Directions repeat through `Repeat`, the
  left stick through `stickCurve` past `STICK_THRESHOLD`; the mount ignores
  the system key repeat and ticks on animation frames while a direction key
  is held; the controller reaches it only through `pad(poll)`, called from
  the shell's poll through the mode.
- **Ring on demand.** None when the board opens; the first cursor input
  shows it on the cursor's cell, and a `mousedown`, or a `mousemove` with
  movement, on the canvas hides it, the cursor keeping its cell. While it
  shows, each move draws it on the new cell and calls `ensureVisible`.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the pointer and cursor inputs.

## CROSS-REFERENCES

- [classic2d-board-view.md](classic2d-board-view.md) — the view the mounts
  hit-test, press and scroll.
- [classic2d-mode.md](classic2d-mode.md) — the mode that mounts the inputs
  and hands in the swap.
- [engine.md](engine.md) — the input profile markers.
- [input-controller.md](input-controller.md) — `Repeat`, `stickCurve`, `BTN`, the
  `GamepadReader` poll and the shell's Back buttons left unmapped.
- [testing.md](testing.md) — `tests/classic2d-pointer.test.mjs`,
  `tests/classic2d-button-swap.test.mjs` (with the mount's use of it and
  the overlay bar's toggle), `tests/classic2d-cursor.test.mjs`,
  `tests/classic2d-fidelity.test.mjs` (the inputs against the fidelity
  observations), `tests/replay-2d.test.mjs` (the sampler).

## WHEN TO READ THE SOURCE

- Changing a pointer gesture or adding an input rule (`createPointerInput`,
  `pointerRules`, the profile markers in `js/engine/profiles.js`).
- Changing when the button swap trades buttons, or where it sits in the
  mouse path (`press` / `release` in `button-swap.js`; `onDown`, `onUp`
  and `closedAt` in `mountPointerInput`).
- Changing a key or controller binding, or the cursor's repeat
  (`CURSOR_KEYS`, `PAD_MAP`, `createCursorInput`).
