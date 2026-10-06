// Game controller support (Gamepad API, "standard" mapping).
// Pure helpers (stick curve, trigger hysteresis, auto-repeat, glyphs, spatial focus search) plus a
// per-frame reader that tracks the most recently used pad and reports button edges.
// No DOM access at import time, so the helpers are unit-testable in Node.

/** Standard-mapping button indices. */
export const BTN = {
  A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9,
  LS: 10, RS: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, HOME: 16,
};
export const NUM_BUTTONS = 17;

export const STICK_DEADZONE = 0.15;
export const STICK_EXPONENT = 2;
export const TRIGGER_ON = 0.5; // pressed when value > 0.5
export const TRIGGER_OFF = 0.3; // released when value < 0.3

/**
 * Radial deadzone, rescaled to 0..1 outside it, then an exponent curve. Keeps the direction.
 * Returns [x, y] with magnitude in 0..1.
 */
export function stickCurve(x, y, dz = STICK_DEADZONE, exp = STICK_EXPONENT) {
  x = Number.isFinite(x) ? x : 0; y = Number.isFinite(y) ? y : 0;
  const m = Math.hypot(x, y);
  if (!(m > dz)) return [0, 0];
  const t = Math.min(1, (m - dz) / (1 - dz));
  const k = Math.pow(t, exp) / m;
  return [x * k, y * k];
}

/** Analog trigger with hysteresis: pressed when value > on, released when value < off. */
export function triggerHeld(wasHeld, value, on = TRIGGER_ON, off = TRIGGER_OFF) {
  const v = Number.isFinite(value) ? value : 0;
  return wasHeld ? !(v < off) : v > on;
}

/** Auto-repeat for a held digital input: fires once on press, then after `delay` every `interval` ms. */
export class Repeat {
  constructor(delay = 380, interval = 60) { this.delay = delay; this.interval = interval; this.next = null; }
  /** Returns how many times the action should fire this tick. */
  update(held, now) {
    if (!held) { this.next = null; return 0; }
    if (this.next === null) { this.next = now + this.delay; return 1; }
    let n = 0;
    while (now >= this.next && n < 4) { n++; this.next += this.interval; }
    if (now >= this.next) this.next = now + this.interval; // after a stall: don't burst
    return n;
  }
  reset() { this.next = null; }
}

// ---------- pad family + glyphs ----------
/** 'playstation' | 'xbox' | 'nintendo' | 'generic', from Gamepad.id (Chrome or Firefox format). */
export function padFamily(id) {
  const s = String(id || '').toLowerCase();
  // vendor id: Chrome "... Vendor: 054c Product: 0ce6)", Firefox "054c-0ce6-Name"
  const vendor = (v) => new RegExp(`(?:vendor:\\s*|^)${v}\\b`).test(s);
  if (vendor('054c') || /dualsense|dualshock|playstation/.test(s)) return 'playstation';
  if (vendor('045e') || /xbox|xinput/.test(s)) return 'xbox';
  if (vendor('057e') || /nintendo|joy-con|switch pro/.test(s)) return 'nintendo';
  return 'generic';
}

/** Button labels by family. Keys are positions in the standard mapping (a = bottom face button). */
export const GLYPHS = {
  playstation: { name: 'PlayStation controller', a: '✕', b: '○', x: '□', y: '△', lb: 'L1', rb: 'R1', lt: 'L2', rt: 'R2', start: 'Options', back: 'Share' },
  xbox: { name: 'Xbox controller', a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', start: 'Menu', back: 'View' },
  // Nintendo pads in the standard mapping are positional: bottom = B, right = A, left = Y, top = X
  nintendo: { name: 'Nintendo controller', a: 'B', b: 'A', x: 'Y', y: 'X', lb: 'L', rb: 'R', lt: 'ZL', rt: 'ZR', start: '+', back: '−' },
  generic: { name: 'Controller', a: 'A', b: 'B', x: 'X', y: 'Y', lb: 'LB', rb: 'RB', lt: 'LT', rt: 'RT', start: 'Start', back: 'Select' },
};
export function padGlyphs(id) { return GLYPHS[padFamily(id)]; }

// ---------- spatial focus navigation ----------
/**
 * Pick the candidate nearest to `from` in direction dir ('up'|'down'|'left'|'right').
 * Rects are {left, top, right, bottom}. cands: [{ rect, item }]. Returns the item or null.
 * Score = gap along the direction + 2 x perpendicular gap (0 when the rects overlap on that axis),
 * with the centre distance as a tie-break.
 */
export function pickInDirection(from, cands, dir) {
  const fcx = (from.left + from.right) / 2, fcy = (from.top + from.bottom) / 2;
  const horiz = dir === 'left' || dir === 'right';
  const sgn = dir === 'right' || dir === 'down' ? 1 : -1;
  let best = null, bestScore = Infinity;
  for (const c of cands) {
    const r = c.rect;
    const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
    const d = horiz ? (cx - fcx) * sgn : (cy - fcy) * sgn;
    if (d <= 1) continue; // not in that direction
    let gap = horiz ? (sgn > 0 ? r.left - from.right : from.left - r.right) : (sgn > 0 ? r.top - from.bottom : from.top - r.bottom);
    gap = Math.max(0, gap);
    const perp = horiz
      ? Math.max(0, r.top - from.bottom, from.top - r.bottom)
      : Math.max(0, r.left - from.right, from.left - r.right);
    const score = gap + 2 * perp + 0.001 * Math.hypot(cx - fcx, cy - fcy);
    if (score < bestScore) { bestScore = score; best = c.item; }
  }
  return best;
}

// ---------- reader ----------
const isPadInput = (p) => {
  for (const b of p.buttons) if (b && (b.pressed || b.value > 0.5)) return true;
  for (const a of p.axes) if (Math.abs(a) > 0.5) return true;
  return false;
};

/**
 * Polls navigator.getGamepads() once per frame. Follows the most recently active pad and keeps
 * one processed button state (triggers with hysteresis) across pad switches, so switching pads or
 * unplugging one releases whatever was held.
 * opts: { getGamepads(), onConnect(pad), onDisconnect({ index, id, wasActive }), onActiveChange(pad|null) }
 */
export class GamepadReader {
  constructor(opts = {}) {
    this.o = opts;
    this.known = new Map(); // index -> id
    this.activeIndex = -1;
    this.held = new Array(NUM_BUTTONS).fill(false);
    this.busy = new Map(); // index -> had input last poll
  }
  _list() {
    try {
      const g = this.o.getGamepads ? this.o.getGamepads() : (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []);
      return g ? Array.from(g) : [];
    } catch { return []; }
  }
  /** The active Gamepad object (fresh from getGamepads), or null. */
  activePad() {
    if (this.activeIndex < 0) return null;
    const p = this._list()[this.activeIndex];
    return p && p.connected !== false ? p : null;
  }
  get connected() { return this.known.size > 0; }

  /**
   * Returns { pad, held, pressed, released, ls, rs, active } where held/pressed/released are boolean
   * arrays indexed by BTN, ls/rs are raw [x, y] stick values and active = any input or edge this frame.
   */
  poll() {
    const list = this._list();
    const present = new Map();
    for (const p of list) if (p && p.connected !== false) present.set(p.index, p);
    // disconnects first (so the active pad's held buttons are released below)
    for (const [index, id] of [...this.known]) {
      const p = present.get(index);
      if (!p || p.id !== id) {
        this.known.delete(index);
        const wasActive = index === this.activeIndex;
        if (wasActive) this.activeIndex = -1;
        this.o.onDisconnect?.({ index, id, wasActive });
      }
    }
    let activeChanged = false;
    for (const [index, p] of present) {
      if (!this.known.has(index)) {
        this.known.set(index, p.id);
        if (this.activeIndex < 0) { this.activeIndex = index; activeChanged = true; }
        this.o.onConnect?.(p);
      }
    }
    // most recently active pad wins: switch when another pad starts giving input
    const busy = new Map();
    for (const [index, p] of present) {
      const b = isPadInput(p);
      busy.set(index, b);
      if (b && !this.busy.get(index) && index !== this.activeIndex) { this.activeIndex = index; activeChanged = true; }
    }
    this.busy = busy;
    if (this.activeIndex < 0 && present.size) { this.activeIndex = present.keys().next().value; activeChanged = true; }
    const pad = this.activeIndex >= 0 ? present.get(this.activeIndex) || null : null;
    if (activeChanged) this.o.onActiveChange?.(pad);

    const held = new Array(NUM_BUTTONS).fill(false);
    let ls = [0, 0], rs = [0, 0];
    if (pad) {
      const bs = pad.buttons || [];
      for (let i = 0; i < NUM_BUTTONS; i++) {
        const b = bs[i];
        if (!b) continue;
        const value = typeof b === 'number' ? b : (Number.isFinite(b.value) ? b.value : (b.pressed ? 1 : 0));
        if (i === BTN.LT || i === BTN.RT) held[i] = triggerHeld(this.held[i], value);
        else held[i] = !!(b.pressed || value > 0.5);
      }
      const ax = pad.axes || [];
      ls = [ax[0] || 0, ax[1] || 0];
      rs = [ax[2] || 0, ax[3] || 0];
    }
    const pressed = held.map((h, i) => h && !this.held[i]);
    const released = held.map((h, i) => !h && this.held[i]);
    this.held = held;
    const active = pressed.some(Boolean) || released.some(Boolean) || held.some(Boolean)
      || Math.hypot(ls[0], ls[1]) > STICK_DEADZONE || Math.hypot(rs[0], rs[1]) > STICK_DEADZONE;
    return { pad, held, pressed, released, ls, rs, active };
  }
}
