// Action layer: unions the held view modes (Shift / Space / Ctrl) from the keyboard, a game
// controller and the 3D touch toolbar's latched toggles, and carries the controller's analog move
// axes. With no controller input and no toggle on the result is exactly the keyboard state.

const MODES = ['shift', 'space', 'ctrl'];

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
