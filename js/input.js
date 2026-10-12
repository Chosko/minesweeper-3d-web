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
  /** Take a pose { x, y, z, yaw, pitch } (spawnPose's). */
  place({ x, y, z, yaw, pitch }) {
    this.x = x; this.y = y; this.z = z;
    this.yaw = yaw; this.pitch = pitch;
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

// ---------- the spawn pose and the off-screen arrow (pure) ----------
// A box is { X, Y, Z } drawn as the renderer and picking draw it: cell (i,j,k) centre
// (i - (X-1)/2) * 4s, cube edge 4, so its bounding box is ±((side-1) * 4s / 2 + 2) on each axis.

/** The spawn looks down onto the box by this much (FlyCamera pitch, + = down). */
export const SPAWN_PITCH_DEG = 15;
/** The spawn is turned this much around the vertical from the original's straight view toward +Z. */
export const SPAWN_YAW_DEG = 20;
/** Fraction of the view kept clear on each side of the framed box, horizontally and vertically. */
export const SPAWN_MARGIN = 0.1;
/**
 * The spawn camera lies beyond the near, top and side face planes by at least this fraction of the
 * box's half size on that axis, so the three faces are seen, not grazed.
 */
export const SPAWN_FACE_CLEARANCE = 0.1;

/** The camera's forward, right and up unit vectors for a FlyCamera yaw and pitch (apply()'s rotation). */
function viewBasis(yaw, pitch) {
  const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
  return {
    f: [cp * sy, -sp, -cp * cy],
    r: [cy, 0, sy],
    u: [sp * sy, cp, -sp * cy],
  };
}
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function halfSize(X, Y, Z, spacing) {
  const p = 4 * spacing;
  return [((X - 1) * p) / 2 + 2, ((Y - 1) * p) / 2 + 2, ((Z - 1) * p) / 2 + 2];
}

/**
 * The pose a 3D game starts from: a three-quarter view down onto the box (SPAWN_PITCH_DEG, and
 * SPAWN_YAW_DEG off the original's view toward +Z), the screen centre on the centre of the near face's
 * centre cube (index floor(side / 2) across and up), from the closest distance that keeps all eight
 * corners inside the view with SPAWN_MARGIN on each side at this vertical field of view (degrees) and
 * aspect — or further out when the camera would not yet see the top and side faces
 * (SPAWN_FACE_CLEARANCE). Returns { x, y, z, yaw, pitch } in FlyCamera's convention.
 */
export function spawnPose({ X, Y, Z }, spacing, fovDeg, aspect) {
  const p = 4 * spacing;
  const [hx, hy, hz] = halfSize(X, Y, Z, spacing);
  const t = [(Math.floor(X / 2) - (X - 1) / 2) * p, (Math.floor(Y / 2) - (Y - 1) / 2) * p, -((Z - 1) / 2) * p];
  const yaw = Math.PI - SPAWN_YAW_DEG * DEG, pitch = SPAWN_PITCH_DEG * DEG;
  const { f, r, u } = viewBasis(yaw, pitch);
  const lim = 1 - 2 * SPAWN_MARGIN;
  const tanV = Math.tan((fovDeg * DEG) / 2) * lim, tanH = tanV * aspect;
  // A corner at offset d from the aim point projects inside the margin once its depth d·f + D covers
  // its sideways offsets: D >= |d·r| / tanH - d·f and D >= |d·u| / tanV - d·f.
  let dist = 0;
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const d = [sx * hx - t[0], sy * hy - t[1], sz * hz - t[2]];
    const depth = dot(d, f);
    dist = Math.max(dist, Math.abs(dot(d, r)) / tanH - depth, Math.abs(dot(d, u)) / tanV - depth);
  }
  // Seeing the top face and the side face the yaw turns toward: the camera clears their planes.
  const k = 1 + SPAWN_FACE_CLEARANCE;
  dist = Math.max(dist, (hy * k - t[1]) / -f[1], (hx * k + t[0]) / f[0], (hz * k + t[2]) / f[2]);
  return { x: t[0] - dist * f[0], y: t[1] - dist * f[1], z: t[2] - dist * f[2], yaw, pitch };
}

/**
 * The off-screen arrow: null while any part of the box's bounding box is inside the view (the
 * frustum of this vertical field of view, in degrees, and aspect, from the camera's position on);
 * otherwise the screen angle toward the box centre, in radians, 0 = right and PI/2 = up. A centre
 * behind the camera gives the way the shortest turn toward it goes. `pose` is { x, y, z, yaw, pitch }.
 */
export function offscreenArrow(pose, { X, Y, Z }, spacing, fovDeg, aspect) {
  const { f, r, u } = viewBasis(pose.yaw, pose.pitch);
  const [hx, hy, hz] = halfSize(X, Y, Z, spacing);
  const tanV = Math.tan((fovDeg * DEG) / 2), tanH = tanV * aspect;
  const local = (x, y, z) => {
    const d = [x - pose.x, y - pose.y, z - pose.z];
    return [dot(d, r), dot(d, u), dot(d, f)];
  };
  const c = [];
  for (let n = 0; n < 8; n++) c.push(local(n & 1 ? hx : -hx, n & 2 ? hy : -hy, n & 4 ? hz : -hz));
  // The frustum as half-spaces in camera space (a·p >= 0); a box face clipped against all of them that
  // keeps any area means that part of the box is in view. The frustum has no far side, so a box that
  // meets it always does so through a face.
  const planes = [[0, 0, 1], [1, 0, tanH], [-1, 0, tanH], [0, 1, tanV], [0, -1, tanV]];
  const faces = [[0, 2, 3, 1], [4, 5, 7, 6], [0, 1, 5, 4], [2, 6, 7, 3], [0, 4, 6, 2], [1, 3, 7, 5]];
  for (const face of faces) {
    let poly = face.map((n) => c[n]);
    for (const pl of planes) {
      const out = [];
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = dot(pl, a), db = dot(pl, b);
        if (da >= 0) out.push(a);
        if ((da >= 0) !== (db >= 0)) {
          const s = da / (da - db);
          out.push([a[0] + (b[0] - a[0]) * s, a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s]);
        }
      }
      poly = out;
      if (!poly.length) break;
    }
    if (poly.length >= 3) return null;
  }
  const [cx, cy] = local(0, 0, 0);
  return Math.atan2(cy, cx);
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

/** Movement, in pixels, a held mouse button makes before drag-to-look turns it into a drag. */
export const DRAG_LOOK_THRESHOLD_PX = 6;

/**
 * Drag-to-look: play without pointer lock, the system cursor shown. A press goes to the mouse
 * actions as in locked play; once a held button has moved past `threshold` pixels the gesture is a
 * drag: the held buttons are dropped without acting (drag-to-cancel), the movement so far and every
 * later one turns the camera through onLook(dx, dy), and nothing pressed or released acts until
 * every button is up. reset() drops the gesture without acting.
 */
export class DragLook {
  constructor({ mouse, onLook, threshold = DRAG_LOOK_THRESHOLD_PX }) {
    this.mouse = mouse;
    this.onLook = onLook;
    this.threshold = threshold;
    this.reset();
  }
  down(button) {
    if (!this.held.size) { this.dragging = false; this.dx = 0; this.dy = 0; }
    this.held.add(button);
    if (!this.dragging) this.mouse.down(button);
  }
  move(dx, dy) {
    if (!this.held.size) return;
    if (this.dragging) { this.onLook(dx, dy); return; }
    this.dx += dx; this.dy += dy;
    if (Math.hypot(this.dx, this.dy) < this.threshold) return;
    this.dragging = true;
    this.mouse.reset();
    this.onLook(this.dx, this.dy);
  }
  up(button) {
    if (!this.held.delete(button)) return;
    if (!this.dragging) this.mouse.up(button);
    if (!this.held.size) this.dragging = false;
  }
  reset() {
    this.held = new Set();
    this.dragging = false;
    this.dx = 0; this.dy = 0;
  }
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
// Back to the start view (onKey): the browser's own Home scrolling is stopped while play is active.
const RETURN_KEYS = new Set(['Home', 'KeyR']);

/**
 * Whether an Esc press resumes from the pause card of a game in play: every press does, however soon
 * after the pointer lock was released, except the press that released it, which already meant Pause,
 * and a held Esc's auto-repeat. Chromium and Firefox keep the releasing press's keydown from the page;
 * a browser that delivers it does so while the lock still holds.
 * press: { repeat, locked } — the keydown's repeat flag and whether the pointer was locked when it came.
 */
export function escResumes(press) { return !press.repeat && !press.locked; }

/**
 * DOM input: keyboard state, pointer lock, mouse buttons/look/wheel.
 * opts: { canvas, isActive(): bool (playing & locked), onLook(dx,dy), onWheel(notches),
 *         mouse: MouseActions, onKey(code) (non-held keys e.g. H/M), onLockChange(locked),
 *         isDragLook(): bool (drag-to-look play: the mouse acts and looks without pointer lock) }
 */
export class Input {
  constructor(opts) {
    this.o = opts;
    this.keys = new Set();
    this.spaceToggle = new TapToggle(); // Space: tap-toggle as well as hold
    this.drag = new DragLook({ mouse: opts.mouse, onLook: (dx, dy) => this.o.onLook(dx, dy) });
    this.locked = false;
    this.unlockedAt = -Infinity; // performance.now() of the last pointer-lock release
    this.lastKey = { code: '', repeat: false, locked: false }; // the last key press, as escResumes reads it
    this._lockPending = false; // a lock request whose failure has not been reported yet
    const doc = document;
    window.addEventListener('keydown', (e) => {
      if (GAME_KEYS.has(e.code)) {
        if (this.o.isActive()) e.preventDefault();
        this.keys.add(e.code);
      } else if (RETURN_KEYS.has(e.code) && this.o.isActive()) e.preventDefault();
      else if (e.ctrlKey && this.o.isActive()) {
        // Ctrl is the "show hidden cells" key: swallow Ctrl+<key> browser shortcuts where allowed
        e.preventDefault();
      }
      if (e.code === 'Space' && !e.repeat) this.spaceToggle.down(performance.now(), this.o.isActive());
      this.lastKey = { code: e.code, repeat: e.repeat, locked: this.locked };
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
      if (this.locked) this._lockPending = false;
      if (!this.locked) { this.releaseAll(); if (was) this.unlockedAt = performance.now(); }
      this.o.onLockChange?.(this.locked);
    });
    // A refusal can come both as this event and as the request's rejected promise: reported once.
    doc.addEventListener('pointerlockerror', () => this._lockFailed());

    doc.addEventListener('mousemove', (e) => {
      if (!this.o.isActive() || !(this.locked || this.dragLook)) return;
      let dx = e.movementX || 0, dy = e.movementY || 0;
      // ignore occasional bogus spikes reported by some browsers right after locking
      if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return;
      if (this.locked) this.o.onLook(dx, dy);
      else this.drag.move(dx, dy);
    });
    doc.addEventListener('mousedown', (e) => {
      if (!this.o.isActive()) return;
      if (this.locked) {
        e.preventDefault();
        this.o.mouse.down(e.button);
      } else if (this.dragLook && e.target === this.o.canvas) { // a press on the overlay bar is the bar's
        e.preventDefault();
        this.drag.down(e.button);
      }
    });
    doc.addEventListener('mouseup', (e) => {
      if (!this.o.isActive()) return;
      if (this.locked) {
        e.preventDefault();
        this.o.mouse.up(e.button);
      } else if (this.dragLook) this.drag.up(e.button);
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
    this.drag.reset();
  }

  /** Drag-to-look play is on, and the pointer is not locked. */
  get dragLook() { return !this.locked && !!this.o.isDragLook?.(); }

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
    this._lockPending = true;
    try {
      const r = c.requestPointerLock();
      if (r && typeof r.catch === 'function') r.catch(() => this._lockFailed());
    } catch {
      this._lockFailed();
    }
  }
  /** The pending lock request failed: onLockError once per request, whichever signal comes first. */
  _lockFailed() {
    if (!this._lockPending) return;
    this._lockPending = false;
    this.o.onLockError?.();
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }
}
