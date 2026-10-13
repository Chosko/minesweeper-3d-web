// Classic 2D mouse button swap: the page's switch that trades the left and right mouse buttons on
// closed cells, and its per-press translation of the physical button, applied by the pointer
// wiring (js/classic2d/pointer-input.js mountPointerInput) before the press-and-release state
// machine sees the button — so a swapped button keeps the exact timing, pressed feedback and chord
// gestures of the button it stands for. DOM-free.
//
// createButtonSwap() → swap; the switch is off at creation and is never saved.
//   on              whether the switch is on.
//   toggle()        flips the switch, tells every listener, and returns the new state.
//   onChange(fn)    fn(on) after every flip; returns the unsubscribe function.
//   press(b, closed)  the button a press of physical button b stands for: left (0) and right (2)
//                   trade while the switch is on and the cell under the pointer is closed or
//                   flagged (`closed`); anything else passes through. Recorded until its release.
//   release(b)      the button the recorded press of b was translated to, so the switch or the
//                   cell changing while it is held never splits a press from its release; b
//                   itself when no press of b is recorded.
//   reset()         forgets every recorded press (focus loss, unmount).

const LEFT = 0;
const RIGHT = 2;
const TRADED = Object.freeze({ [LEFT]: RIGHT, [RIGHT]: LEFT });

export function createButtonSwap() {
  let on = false;
  const listeners = new Set();
  const pressed = new Map(); // physical button → the button its press was translated to

  return {
    get on() { return on; },

    toggle() {
      on = !on;
      for (const fn of [...listeners]) fn(on);
      return on;
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    press(button, closed) {
      const out = on && closed && button in TRADED ? TRADED[button] : button;
      pressed.set(button, out);
      return out;
    },

    release(button) {
      if (!pressed.has(button)) return button;
      const out = pressed.get(button);
      pressed.delete(button);
      return out;
    },

    reset() { pressed.clear(); },
  };
}
