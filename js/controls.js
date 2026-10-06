// Action layer: unions the held view modes (Shift / Space / Ctrl) from the keyboard and a game
// controller, and carries the controller's analog move axes. With no controller input the result is
// exactly the keyboard state.

export class Controls {
  /** @param keyboard object with boolean getters shift / space / ctrl (the DOM Input) */
  constructor(keyboard) {
    this.kb = keyboard;
    this.pad = { shift: false, space: false, ctrl: false };
    // controller move axes: forward (+ = forward), right (+ = right), up (+ = up), each -1..1
    this.axes = { f: 0, r: 0, u: 0 };
  }
  get shift() { return this.kb.shift || this.pad.shift; }
  get space() { return this.kb.space || this.pad.space; }
  get ctrl() { return this.kb.ctrl || this.pad.ctrl; }
  get hasAxes() { const a = this.axes; return a.f !== 0 || a.r !== 0 || a.u !== 0; }
  /** Drop every controller-held state (pause, disconnect, leaving play). */
  releasePad() {
    this.pad.shift = this.pad.space = this.pad.ctrl = false;
    this.axes.f = this.axes.r = this.axes.u = 0;
  }
}
