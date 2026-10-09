// Shell navigation: which layer takes input, default focus fallback, Back inputs and the
// suppression of controller buttons held across a screen change. DOM-free: the shell hands in
// elements, visibility tests and poll results.
import { BTN } from '../gamepad.js';

/** The native controls the shell's keyboard and controller navigation collect. */
export const FOCUSABLE = 'button, input, summary, a[href], select';

/** The first layer of `order` (topmost first) that `isOpen(id)` reports visible and live, or null. */
export function topLayer(order, isOpen) {
  for (const id of order) if (isOpen(id)) return id;
  return null;
}

/** The declared default target when it is focusable, else the first focusable item, else null. */
export function resolveFocus(target, items) {
  return target && items.includes(target) ? target : items[0] ?? null;
}

/** Esc means Back (or Pause while playing) on every screen. */
export function isBackKey(code) { return code === 'Escape'; }

/** Controller buttons that mean Back on a screen: the back button always, B off the board. */
export function backButtons(screen) {
  return screen === 'playing' ? [BTN.BACK] : [BTN.B, BTN.BACK];
}

/**
 * Buttons held when the screen changes are ignored until released.
 * Call update(held) once per poll before acting, and screenChanged() on every change of screen
 * or topmost layer; it suppresses what was held at the latest poll.
 */
export function createHeldSuppressor() {
  const suppressed = new Set();
  let last = [];
  return {
    update(held) {
      for (const b of suppressed) if (!held[b]) suppressed.delete(b);
      last = held.slice();
    },
    screenChanged() {
      for (let b = 0; b < last.length; b++) if (last[b]) suppressed.add(b);
    },
    has: (b) => suppressed.has(b),
    held: (p, b) => !!p.held[b] && !suppressed.has(b),
    pressed: (p, b) => !!p.pressed[b] && !suppressed.has(b),
  };
}
