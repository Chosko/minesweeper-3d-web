// Free-fly camera (CameraInput.cs), pointer lock, keyboard/mouse state and the original
// "act on button release" + chord-toggle logic (Minesweeper.cs LeftButtonDown/RightButtonDown).

const DEG = Math.PI / 180;
export const MOVE_SPEED = 50; // units / s
export const LOOK_DEG_PER_PX = 0.2;
export const PAD_LOOK_DEG_PER_S = 180; // controller right stick at full deflection (x sensitivity)
export const SPACING_MIN = 1, SPACING_MAX = 10, SPACING_START = 1.1;

export class FlyCamera {
  constructor() {
    this.sensitivity = 1; // multiplier on the original 0.2°/px (UI setting; 1 = original)
    this.invertY = false; // UI setting; false = original
    this.reset(0, 0, 0);
  }
  reset(x, y, z) {
    this.x = x; this.y = y; this.z = z;
    this.pitch = 0; // angle.X : + = looking down
    this.yaw = Math.PI; // angle.Y : PI = looking toward +Z
  }
  look(dxPx, dyPx) {
    const k = LOOK_DEG_PER_PX * DEG * this.sensitivity;
    this.pitch += (this.invertY ? -dyPx : dyPx) * k;
    if (this.pitch > Math.PI / 2) this.pitch = Math.PI / 2;
    if (this.pitch < -Math.PI / 2) this.pitch = -Math.PI / 2;
    this.yaw += dxPx * k;
  }
  /** keys: {w,a,s,d,q,e} booleans */
  move(dt, keys) {
    // Original quirk: forward = normalize(sin(-yaw), sin(pitch), cos(-yaw)) (no cos(pitch) on XZ)
    let fx = Math.sin(-this.yaw), fy = Math.sin(this.pitch), fz = Math.cos(-this.yaw);
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    const lx = Math.cos(this.yaw), lz = Math.sin(this.yaw);
    const v = MOVE_SPEED * dt;
    if (keys.w) { this.x -= fx * v; this.y -= fy * v; this.z -= fz * v; }
    if (keys.s) { this.x += fx * v; this.y += fy * v; this.z += fz * v; }
    if (keys.a) { this.x -= lx * v; this.z -= lz * v; }
    if (keys.d) { this.x += lx * v; this.z += lz * v; }
    if (keys.q) this.y -= v;
    if (keys.e) this.y += v;
  }
  /**
   * Analog move (controller): f forward, r right, u up, each -1..1. Same forward / right vectors as
   * move() (including the original's forward-vector quirk); the speed is capped at MOVE_SPEED.
   */
  moveAxes(dt, f, r, u) {
    if (!f && !r && !u) return;
    let fx = Math.sin(-this.yaw), fy = Math.sin(this.pitch), fz = Math.cos(-this.yaw);
    const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
    const lx = Math.cos(this.yaw), lz = Math.sin(this.yaw);
    let vx = -fx * f + lx * r, vy = -fy * f + u, vz = -fz * f + lz * r;
    const len = Math.hypot(vx, vy, vz);
    if (len > 1) { vx /= len; vy /= len; vz /= len; }
    const v = MOVE_SPEED * dt;
    this.x += vx * v; this.y += vy * v; this.z += vz * v;
  }
  /** Analog look (controller): x/y in -1..1 = fraction of PAD_LOOK_DEG_PER_S; uses sensitivity + invertY. */
  lookAxes(dt, x, y) {
    if (!x && !y) return;
    const px = (PAD_LOOK_DEG_PER_S * dt) / LOOK_DEG_PER_PX;
    this.look(x * px, y * px);
  }
  /** Apply to a THREE.PerspectiveCamera (rotation.order must be 'YXZ'). View = T(-p)·RotY(yaw)·RotX(pitch). */
  apply(cam) {
    cam.position.set(this.x, this.y, this.z);
    cam.rotation.set(-this.pitch, -this.yaw, 0, 'YXZ');
    cam.updateMatrixWorld(true);
  }
}

/**
 * Mouse action state machine: actions fire on button release.
 * onAction(type) with type 'left' | 'right' | 'chord'. hasSelection() -> bool.
 */
export class MouseActions {
  constructor(onAction, hasSelection) {
    this.onAction = onAction;
    this.hasSelection = hasSelection;
    this.left = false; this.right = false; this.toggle = false;
  }
  down(button) {
    if (button === 0) this.left = true;
    else if (button === 2) this.right = true;
  }
  up(button) {
    if (button === 0) {
      if (!this.left) return;
      if (this.toggle) this.toggle = false;
      else if (this.right) { this.toggle = true; if (this.hasSelection()) this.onAction('chord'); }
      else if (this.hasSelection()) this.onAction('left');
      this.left = false;
    } else if (button === 2) {
      if (!this.right) return;
      if (this.toggle) this.toggle = false;
      else if (this.left) { this.toggle = true; if (this.hasSelection()) this.onAction('chord'); }
      else if (this.hasSelection()) this.onAction('right');
      this.right = false;
    }
  }
  /** Forget held buttons without firing (focus loss / pause). */
  reset() { this.left = false; this.right = false; this.toggle = false; }
}

/** A Space press shorter than this is a tap: it toggles aim-through instead of holding it. */
export const SPACE_TAP_MS = 250;

/**
 * Space as tap-toggle as well as hold. A short tap (released within `tapMs`) turns `on` until the
 * next press, whose release turns it off; a longer hold leaves nothing on after its release. A
 * press made outside play (`active` false, e.g. the ready card's Space) is ignored. reset() drops
 * the toggle without firing anything, as held state is dropped.
 */
export class TapToggle {
  constructor(tapMs = SPACE_TAP_MS) {
    this.tapMs = tapMs;
    this.on = false;
    this._down = null; // { at, wasOn } of the press being held, made in play
  }
  down(now, active) {
    this._down = active ? { at: now, wasOn: this.on } : null;
  }
  up(now) {
    const d = this._down;
    this._down = null;
    if (!d) return;
    if (d.wasOn) this.on = false;
    else if (now - d.at < this.tapMs) this.on = true;
  }
  reset() {
    this.on = false;
    this._down = null;
  }
}

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space',
  'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']);
// The arrow keys reach onKey on every keydown, the browser's key repeats included: they move menu focus.
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * DOM input: keyboard state, pointer lock, mouse buttons/look/wheel.
 * opts: { canvas, isActive(): bool (playing & locked), onLook(dx,dy), onWheel(notches),
 *         mouse: MouseActions, onKey(code) (non-held keys e.g. H/M), onLockChange(locked) }
 */
export class Input {
  constructor(opts) {
    this.o = opts;
    this.keys = new Set();
    this.spaceToggle = new TapToggle(); // Space: tap-toggle as well as hold
    this.locked = false;
    this.unlockedAt = -Infinity; // performance.now() of the last pointer-lock release
    const doc = document;
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) {
        if (this.o.isActive()) e.preventDefault();
        this.keys.add(e.code);
      } else if (e.ctrlKey && this.o.isActive()) {
        // Ctrl is the "show hidden cells" key: swallow Ctrl+<key> browser shortcuts where allowed
        e.preventDefault();
      }
      if (e.code === 'Space' && !e.repeat) this.spaceToggle.down(performance.now(), this.o.isActive());
      if (!e.repeat || ARROW_KEYS.has(e.code)) this.o.onKey?.(e.code, e);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'Space') this.spaceToggle.up(performance.now());
      if (GAME_KEYS.has(e.code) && this.o.isActive()) e.preventDefault();
    });
    window.addEventListener('blur', () => this.releaseAll());
    doc.addEventListener('visibilitychange', () => { if (doc.hidden) this.releaseAll(); });

    doc.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = doc.pointerLockElement === this.o.canvas;
      if (!this.locked) { this.releaseAll(); if (was) this.unlockedAt = performance.now(); }
      this.o.onLockChange?.(this.locked);
    });
    doc.addEventListener('pointerlockerror', () => this.o.onLockError?.());

    doc.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.o.isActive()) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      // ignore occasional bogus spikes reported by some browsers right after locking
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      this.o.onLook(dx, dy);
    });
    doc.addEventListener('mousedown', (e) => {
      if (!this.locked || !this.o.isActive()) return;
      e.preventDefault();
      this.o.mouse.down(e.button);
    });
    doc.addEventListener('mouseup', (e) => {
      if (!this.locked || !this.o.isActive()) return;
      e.preventDefault();
      this.o.mouse.up(e.button);
    });
    doc.addEventListener('contextmenu', (e) => {
      if (e.target === this.o.canvas || this.locked) e.preventDefault();
    });
    window.addEventListener('wheel', (e) => {
      if (!this.o.isActive()) return;
      e.preventDefault();
      // Original: +120 per notch / 3000 = 0.04 per notch; wheel up = larger spacing.
      // Browsers turn Shift+wheel into horizontal scrolling (deltaX); Shift is a game key here.
      const wd = (e.deltaY === 0 && e.shiftKey) ? e.deltaX : e.deltaY;
      let notches;
      if (e.deltaMode === 1) notches = -wd / 3; // lines
      else if (e.deltaMode === 2) notches = -wd; // pages
      else notches = -wd / 100; // pixels (~100 per notch in Chromium)
      this.o.onWheel(notches);
    }, { passive: false });
  }

  releaseAll() {
    this.keys.clear();
    this.spaceToggle.reset();
    this.o.mouse.reset();
  }

  has(code) { return this.keys.has(code); }
  get shift() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'); }
  get ctrl() { return this.keys.has('ControlLeft') || this.keys.has('ControlRight'); }
  get space() { return this.keys.has('Space') || this.spaceToggle.on; }
  get move() {
    const k = this.keys;
    return { w: k.has('KeyW'), a: k.has('KeyA'), s: k.has('KeyS'), d: k.has('KeyD'), q: k.has('KeyQ'), e: k.has('KeyE') };
  }

  get lockSupported() { return typeof Element !== 'undefined' && 'requestPointerLock' in Element.prototype; }
  requestLock() {
    const c = this.o.canvas;
    if (!this.lockSupported) { this.o.onLockError?.(); return; }
    try {
      const r = c.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => this.o.onLockError?.());
    } catch {
      this.o.onLockError?.();
    }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
