// The end delay's skip: during a game's end delay (either mode: the active mode's `ending`), a
// mouse button, a key or a controller button pressed ends the delay at once, and does nothing
// else. The press that skipped is consumed whole — its own event, its key's auto-repeat, its key's
// or button's release and the click that follows — so it never acts on the board, the shell or the
// results card the skip reveals: an Enter or R that ended the delay does not also play again; a
// fresh press does. A key already held when the game ended (its auto-repeat) neither ends the
// delay nor acts, until it is released. DOM-free: js/main.js feeds it the events from capturing
// listeners and swallows (preventDefault, stopImmediatePropagation) every event it reports
// consumed; a controller's held buttons are kept off the results card by the shell's held-button
// suppression on the screen change.
//
// createEndSkip({ ending: () => bool, skip: () => void }) → {
//   keyDown({ code, repeat }) → consumed     a key press, or its auto-repeat
//   keyUp({ code }) → consumed               the release of the key that skipped
//   press() → consumed                       a mouse button or pointer pressed
//   release({ buttons }) → consumed          a mouse button or pointer released; buttons still held
//   click({ isTrusted }) → consumed          click, auxclick, contextmenu: every one during the
//                                            delay; after it, the skipping gesture's own (trusted)
//                                            ones until the next press, key press or controller
//                                            press — a script's click (a controller's activation)
//                                            is never the gesture's
//   pad(pressed) → consumed                  a controller poll; pressed: whether any button was
//                                            newly pressed. Consumed during the delay only
//   lockLost() → whether it skipped          the pointer lock was released (the browser's Esc,
//                                            whose key press the page never sees)
//   reset()                                  the page lost focus or was hidden: the releases it
//                                            waits for may never come, so it forgets them
// }

export function createEndSkip({ ending, skip }) {
  const keys = new Map(); // code → true: the key that skipped (its release is consumed too); false: held from the game
  let gesture = 'none'; // the mouse gesture that skipped: 'held', 'released' (its clicks still to come), 'none'

  return {
    keyDown({ code, repeat }) {
      if (gesture === 'released') gesture = 'none'; // a key's own click (Enter on a button) is not the gesture's
      if (keys.has(code)) return true;
      if (!ending()) return false;
      if (repeat) { keys.set(code, false); return true; }
      keys.set(code, true);
      skip();
      return true;
    },
    keyUp({ code }) {
      const own = keys.get(code);
      keys.delete(code);
      return own === true;
    },
    press() {
      if (gesture === 'held') return true;
      gesture = 'none';
      if (!ending()) return false;
      gesture = 'held';
      skip();
      return true;
    },
    release({ buttons = 0 } = {}) {
      if (gesture === 'none') return ending();
      if (gesture === 'held' && !buttons) gesture = 'released';
      return true;
    },
    click({ isTrusted = true } = {}) { return ending() || (isTrusted && gesture !== 'none'); },
    pad(pressed) {
      if (pressed && gesture === 'released') gesture = 'none';
      if (!ending()) return false;
      if (pressed) skip();
      return true;
    },
    lockLost() {
      if (!ending()) return false;
      skip();
      return true;
    },
    reset() {
      keys.clear();
      gesture = 'none';
    },
  };
}
