# Input — controller, view-mode layer and shell navigation

## OVERVIEW

Controller polling and its pure helpers, the view-mode layer that joins the
keyboard's and the controller's held modes, and the shell navigation layer
between the controller reader and every action. The camera, mouse and
picking side is [input.md](input.md).

| File | Implements |
| --- | --- |
| `js/controls.js` | `Controls`: union of keyboard and controller view modes + controller move axes |
| `js/gamepad.js` | Gamepad API reader, stick curve, trigger hysteresis, auto-repeat, pad glyphs, spatial menu focus search |
| `js/shell/navigation.js` | Topmost layer, default-focus fallback, Back inputs, the arrow keys' focus moves, held-button suppression across screen changes |

Which pad button maps to what (`handlePad`) and menu focus navigation live
in `js/main.js` ([app-shell.md](app-shell.md)).

## PUBLIC API

**js/controls.js**
- `Controls(keyboard)` — getters `shift`, `space`, `ctrl` = keyboard OR `pad.*` OR `touch.*`; `hasAxes`.
  Fields `pad` (`{shift, space, ctrl}`) and `axes` (`{f, r, u}`) are written by the caller each frame;
  `releasePad()` zeroes both. `touch` holds the 3D touch toolbar's latched modes: `toggle(mode)`
  flips one, `clearTouch()` clears them (a new game, the leave); `releasePad` leaves them.

**js/gamepad.js** (no DOM access at import; Node-testable)
- `BTN` (standard-mapping indices A..HOME), `NUM_BUTTONS` (17), `STICK_DEADZONE`,
  `STICK_EXPONENT`, `TRIGGER_ON`, `TRIGGER_OFF`.
- `stickCurve(x, y, dz?, exp?)` → `[x, y]`; `triggerHeld(wasHeld, value, on?, off?)`;
  `Repeat(delay = 380, interval = 60)` — `update(held, now)` → fire count, `reset()`.
- `padFamily(id)` → `'playstation' | 'xbox' | 'nintendo' | 'generic'`; `GLYPHS`; `padGlyphs(id)`.
- `pickInDirection(from, cands, dir)` — spatial focus step over `[{rect, item}]`.
- `GamepadReader({getGamepads?, onConnect?, onDisconnect?, onActiveChange?})` — `poll()` →
  `{pad, held, pressed, released, ls, rs, active}` (button arrays indexed by `BTN`);
  `activePad()`, `connected`.

**js/shell/navigation.js** (DOM-free; the shell hands in elements, visibility tests and polls)
- `FOCUSABLE` (`button, input, summary, a[href], select`); `topLayer(order, isOpen)`;
  `resolveFocus(target, items)` → `target` if in `items`, else `items[0]`, else null.
- `isBackKey(code)` — Esc is Back on every screen (Pause while playing);
  `backButtons(screen)` → `[BTN.BACK]` on `'playing'`, else `[BTN.B, BTN.BACK]`.
- `arrowDirection(code)`; `keepsArrow(control, dir)` — range, number and text inputs and a
  textarea keep Left/Right, a select every arrow.
- `createHeldSuppressor()` → `update(held)` (once per poll, before acting), `screenChanged()`,
  `has(b)`, `held(p, b)`, `pressed(p, b)`.

## INTERNAL PATTERNS

- **Controls with no pad input and no toolbar toggle equal the keyboard exactly** — keep `pad` /
  `axes` zeroed when the controller is not driving play.
- **GamepadReader** follows the most recently active pad (a rising edge on another pad switches);
  one shared `held` array, so a switch or disconnect yields `released` edges. Disconnects are
  processed before connects. LT/RT use `triggerHeld`. All helpers tolerate NaN / missing fields.
- **Shell navigation sits between the reader and every action.** `handlePad` calls
  `nav.update(p.held)` each poll and reads buttons only through `nav.held` / `nav.pressed`; every
  screen change and controls-modal toggle calls `screenChanged()`, so a button held through the
  change is ignored until released. Back is `isBackKey` from the keyboard and `backButtons(screen)`
  from the controller (B is Back only off the board, where it moves down); both, and the
  browser's Back, resolve through the router ([app-shell-navigation.md](app-shell-navigation.md)). The arrow keys take
  the D-pad's spatial step off the boards, Records and the replay viewer, unless the focused
  control `keepsArrow`.
- **Repeat** fires once on press, then after `delay` every `interval`, at most 4 per tick, and
  resynchronizes after a stall instead of bursting.

## DOMAIN DEPENDENCIES

Controller support is a web-port addition [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md)
permits; it must not alter any rule [input.md](input.md) enforces.

## CROSS-REFERENCES

- [input.md](input.md) — the `MouseActions` the triggers drive (RT = button 0, LT = button 2) and
  the `FlyCamera.moveAxes` / `lookAxes` the sticks feed.
- [app-shell.md](app-shell.md) — `handlePad`; [app-shell-ui.md](app-shell-ui.md) — menu focus
  navigation with `pickInDirection` / `Repeat`; [app-shell-navigation.md](app-shell-navigation.md),
  [app-shell-pause.md](app-shell-pause.md) — the router and pause controller Back resolves through.
- [rendering.md](rendering.md) — the renderer toggles `Controls.shift/space/ctrl` feed.
- [classic2d-input.md](classic2d-input.md) — the Classic 2D cursor input reuses `BTN`, `Repeat`
  and `stickCurve` and reads `GamepadReader` polls; B, Start and Back stay the shell's there too.
- [testing.md](testing.md) — `tests/gamepad.test.mjs` covers the gamepad helpers, `GamepadReader`
  and `Controls`; `tests/shell-router.test.mjs` the shell navigation helpers.

## WHEN TO READ THE SOURCE

- Supporting a new controller family or mislabelled glyph (`padFamily`, `GLYPHS`).
- Changing which input means Back, which arrow a control keeps, or a button that fires on the screen after the one it was pressed on (`js/shell/navigation.js`).
- Tuning deadzone, trigger thresholds or repeat timing, or a pad that switches / sticks unexpectedly (`GamepadReader.poll`).
