# Classic 2D — keyboard and controller cursor

## OVERVIEW

The Classic 2D board's keyboard and controller cell cursor: a state machine
over the session's actions plus a mount that wires it to the board view and
the session. Every key and controller button means what the flat modes'
bindings say ([settings-bindings.md](settings-bindings.md)), which Hexagon
and Triangle read too. The mouse, button swap and touch inputs are
[classic2d-input.md](classic2d-input.md)'s; the area overview is
[classic2d.md](classic2d.md).

- `js/classic2d/cursor-input.js` — the keyboard and controller cell cursor
  and `mountCursorInput`. DOM-free at import.

## PUBLIC API

`js/classic2d/cursor-input.js`
- `CURSOR_KEYS` (the default key codes → `up`/`down`/`left`/`right`/
  `reveal`/`flag`/`chord`), `PAD_MAP` (the default `BTN` indices → the
  same), both derived from the flat catalogue's defaults; `STICK_THRESHOLD`.
- `createCursorInput({grid, geometry?, game, onPress, onAction, onCursor?, onUse?,
  onPadCue?, rules?, active?, delay?, interval?, start?, bindings?})` → `{cell, setCell(c), move(dx, dy),
  hold(source, dir), let(source, dir), tick(now), down(source, button),
  up(source, button), pad(poll, now), reset(), drop(), holding, moving}` — `drop()`
  as `reset()` but the controller buttons still held stay ignored until
  released and the stick's lean is kept (a change of the bindings);
  `start` the cell the cursor starts on (0; a daily's or a challenge's
  forced start cell, through `mountCursorInput`'s `start`); `onUse()` before each cursor input the board takes;
  `onPadCue(kind)` a controller press the shell answers with a rumble — `'flag'` when a controller button
  (X or LT by default) placed or removed a flag, else `'press'` when a trigger (RT or LT, whatever it
  is bound to) was pressed while the board takes input (keys never report; by default neither do A
  and Y); `poll` a
  `GamepadReader` poll after the shell's held-button suppression
  ([input-controller.md](input-controller.md)).
- `mountCursorInput({view, session, grid?, geometry?, win?, rules?, delay?,
  interval?, onPadCue?, start?, bindings?})` → `{input, pad(poll, now?), shown, destroy()}`.

## INTERNAL PATTERNS

- **Cursor input.** Keys and controller buttons are read through the
  bindings (`actionFor`), each meaning the action it had at its press until
  its release; a change of the bindings drops every held input. Reveal —
  Space / Enter (Numpad Enter as Enter) and A / RT by default — only
  reveals (nothing on a number), flag — F and X / LT — flags on the press,
  chord — D and Y — only chords; reveal and flag held together are left +
  right, chording when `chordInputs` has `left+right`. B, Start and Back
  are reserved, never bound: Start is the shell's pause, Back its
  live-figures toggle, and B does nothing on the board; the shell keeps the
  Start + Y chord's Y from the cursor. Press
  feedback and a held press under a moving cursor read the same profile
  markers as the pointer input. Each step up, down, left or right is the
  board's grid geometry's `neighbour` query (the square geometry of the
  grid's size when none is handed in; one of another size is a
  `RangeError`), and the cursor stops where it answers none. Directions repeat through `Repeat`, the
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
  — the cursor input.
- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — the cursor's steps by the geometry's neighbour.

## CROSS-REFERENCES

- [classic2d-input.md](classic2d-input.md) — the pointer, button swap and
  touch inputs, on the same profile markers.
- [classic2d-board-view.md](classic2d-board-view.md), [classic2d-board-canvas.md](classic2d-board-canvas.md)
  — the view the mount presses, rings and scrolls.
- [classic2d-mode.md](classic2d-mode.md) — the mode that mounts the input.
- [engine.md](engine.md) — the input profile markers.
- [geometry.md](geometry.md) — the `neighbour` query the cursor steps by.
- [input-controller.md](input-controller.md) — `Repeat`, `stickCurve`, `BTN`, the
  `GamepadReader` poll and the shell's Back buttons left unmapped.
- [testing-files.md](testing-files.md) — `tests/classic2d-cursor.test.mjs`,
  `tests/classic2d-fidelity.test.mjs` (the inputs against the fidelity
  observations).

## WHEN TO READ THE SOURCE

- Changing how a key or controller button reaches the cursor, or its
  repeat (`createCursorInput`, `mountCursorInput`); a default binding is
  the flat catalogue's ([settings-bindings.md](settings-bindings.md)).
