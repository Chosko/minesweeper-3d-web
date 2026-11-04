// Action layer: unions the held view modes (Shift / Space / Ctrl) from the keyboard, a game
// controller and the 3D touch toolbar's latched toggles, and carries the controller's analog move
// axes. With no controller input and no toggle on the result is exactly the keyboard state.
// padActions3D translates the controller's buttons through the 3D bindings before the union reads
// them; createStartChord keeps the Start + Y restart chord away from the bindings.

import { BTN, NUM_BUTTONS } from './gamepad.js';
import { defaultBindings } from './settings/resolver.js';

const MODES = ['shift', 'space', 'ctrl'];

/** The 3D actions a held controller button gives: the view modes, the moves (axis and sign) and the MouseActions buttons. */
const VIEW_MODE = Object.freeze({ neighbours: 'shift', aimThrough: 'space', showHidden: 'ctrl' });
const MOVE = Object.freeze({ forward: ['f', 1], back: ['f', -1], right: ['r', 1], left: ['r', -1], up: ['u', 1], down: ['u', -1] });
const ACTION_BUTTON = Object.freeze({ reveal: 0, flag: 2 });

/**
 * One controller poll's 3D actions through `bindings` (the defaults when none is given). held(b),
 * pressed(b) and released(b) read button b after the shell's held-button suppression. Returns
 * { modes: { shift, space, ctrl } held, move: { f, r, u } from the move buttons held (each -1..1),
 * press, release: the MouseActions buttons (0 reveal, 2 flag) pressed and released this poll, 0
 * first }. A button bound to no 3D action gives nothing.
 */
export function padActions3D({ held, pressed, released }, bindings = defaultBindings()) {
  const modes = { shift: false, space: false, ctrl: false };
  const move = { f: 0, r: 0, u: 0 };
  const press = [];
  const release = [];
  for (let b = 0; b < NUM_BUTTONS; b++) {
    const action = bindings.actionFor('3d', 'controller', b);
    if (!action) continue;
    if (Object.hasOwn(ACTION_BUTTON, action)) {
      if (pressed(b)) press.push(ACTION_BUTTON[action]);
      if (released(b)) release.push(ACTION_BUTTON[action]);
    } else if (held(b)) {
      if (Object.hasOwn(VIEW_MODE, action)) modes[VIEW_MODE[action]] = true;
      else if (Object.hasOwn(MOVE, action)) { const [axis, sign] = MOVE[action]; move[axis] += sign; }
    }
  }
  for (const axis of Object.keys(move)) move[axis] = Math.max(-1, Math.min(1, move[axis]));
  const order = (a, b) => a - b;
  return { modes, move, press: press.sort(order), release: release.sort(order) };
}

/**
 * The Start + Y restart chord, read ahead of the bindings: update(p, pressed, restarts = true) once
 * per poll, before any button is translated, → whether Y was pressed while Start is held (p.held the
 * raw buttons, pressed(b) after the held-button suppression). On a screen where the chord restarts
 * (`restarts`), from that press through the poll Y is released in, keeps(BTN.Y) is true: the caller reads Y as neither held nor released, so whatever action Y is
 * bound to, the chord's Y never produces it; Y pressed on its own does.
 */
export function createStartChord() {
  let kept = 0; // 0 free, 1 kept while held, 2 kept through the poll of its release
  return {
    update(p, pressed, restarts = true) {
      if (kept === 2) kept = 0;
      else if (kept === 1 && !p.held[BTN.Y]) kept = 2;
      const chord = Boolean(p.held[BTN.START]) && pressed(BTN.Y);
      if (chord && restarts) kept = 1;
      return chord;
    },
    keeps: (b) => kept > 0 && b === BTN.Y,
  };
}

export class Controls {
  /** @param keyboard object with boolean getters shift / space / ctrl (the DOM Input) */
  constructor(keyboard) {
    this.kb = keyboard;
    this.pad = { shift: false, space: false, ctrl: false };
    // the touch toolbar's toggles: latched through pause, cleared with the game (clearTouch)
    this.touch = { shift: false, space: false, ctrl: false };
    // controller move axes: forward (+ = forward), right (+ = right), up (+ = up), each -1..1
    this.axes = { f: 0, r: 0, u: 0 };
  }
  get shift() { return this.kb.shift || this.pad.shift || this.touch.shift; }
  get space() { return this.kb.space || this.pad.space || this.touch.space; }
  get ctrl() { return this.kb.ctrl || this.pad.ctrl || this.touch.ctrl; }
  get hasAxes() { const a = this.axes; return a.f !== 0 || a.r !== 0 || a.u !== 0; }
  /** Drop every controller-held state (pause, disconnect, leaving play). */
  releasePad() {
    this.pad.shift = this.pad.space = this.pad.ctrl = false;
    this.axes.f = this.axes.r = this.axes.u = 0;
  }
  /** Latch or clear one touch toolbar mode ('shift' | 'space' | 'ctrl'); returns whether it is now on. */
  toggle(mode) {
    if (!MODES.includes(mode)) throw new Error(`controls: unknown view mode "${mode}"`);
    this.touch[mode] = !this.touch[mode];
    return this.touch[mode];
  }
  /** Clear the touch toolbar's toggles (a new game, a restart, leaving play). */
  clearTouch() { this.touch.shift = this.touch.space = this.touch.ctrl = false; }
}
