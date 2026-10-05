// Small synthesized sound effects (WebAudio, no assets). Kept subtle.
const LS_KEY = 'ms3d.muted';

export class Sfx {
  constructor() {
    this.ctx = null;
    this.master = null;
    try { this.muted = localStorage.getItem(LS_KEY) === '1'; } catch { this.muted = false; }
  }
  _ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.35;
      this.master.connect(this.ctx.destination);
      return true;
    } catch { return false; }
  }
  /** Call from a user gesture to unlock audio. */
  unlock() { if (!this.muted) this._ensure(); }
  setMuted(m) {
    this.muted = m;
    try { localStorage.setItem(LS_KEY, m ? '1' : '0'); } catch { /* ignore */ }
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  _tone(freq, dur, { type = 'sine', gain = 0.3, delay = 0, slideTo = null } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  _noise(dur, { gain = 0.5, freq = 800, q = 0.7, delay = 0, type = 'lowpass', freqEnd = null } = {}) {
    const c = this.ctx, t = c.currentTime + delay;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  }
  _ok() { return !this.muted && this._ensure(); }

  reveal(count = 1) {
    if (!this._ok()) return;
    this._noise(0.05, { gain: 0.35, freq: 2500, q: 1.2, type: 'bandpass' });
    this._tone(count > 1 ? 660 : 520, 0.07, { type: 'triangle', gain: 0.12, slideTo: count > 1 ? 990 : 600 });
  }
  flag(on = true) {
    if (!this._ok()) return;
    this._tone(on ? 700 : 500, 0.06, { type: 'square', gain: 0.05 });
    this._tone(on ? 1050 : 380, 0.08, { type: 'square', gain: 0.05, delay: 0.05 });
  }
  explode() {
    if (!this._ok()) return;
    this._noise(1.1, { gain: 0.9, freq: 1800, freqEnd: 60, q: 0.5 });
    this._tone(110, 0.6, { type: 'sine', gain: 0.5, slideTo: 35 });
  }
  win() {
    if (!this._ok()) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._tone(f, 0.28, { type: 'triangle', gain: 0.16, delay: i * 0.1 }));
  }
}
