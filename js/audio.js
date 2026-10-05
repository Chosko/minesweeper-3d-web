// Synthesized sound effects (WebAudio, no assets).
//
// ---------------------------------------------------------------------------
// Exported API
// ---------------------------------------------------------------------------
// class Sfx                       Singleton: `new Sfx()` always returns the same
//                                 shared instance (also exported as `sfx`), so the
//                                 class methods and the free functions below share
//                                 one AudioContext / mute / volume state.
//   .muted                        boolean (persisted in localStorage 'ms3d.muted')
//   .unlock()                     create/resume the AudioContext; call from a user
//                                 gesture (e.g. the "Click to play" click). Also done
//                                 automatically on the first pointerdown/keydown.
//   .setMuted(m: boolean)         persisted
//   .toggleMute() -> boolean      returns the new muted state
//   .setVolume(v: number)         0..1, persisted in localStorage 'ms3d.volume' (default 0.7)
//   .getVolume() -> number        0..1
//   .reveal(count = 1)            cell(s) opened; scales with log(count), whoosh/cascade for floods
//   .flag(on = true, count = 1)   flag placed (on) / removed (!on); count > 1 = mass flag (richer)
//   .chord(count = 0)             chord action (middle/both click on a number); count = cells revealed
//   .noop()                       soft muted "thunk" for actions that do nothing
//   .explode()                    loss: boom + debris tail
//   .win()                        ~1.5 s arpeggio jingle
//
// Free functions (all operate on the shared instance):
//   unlock(), setMuted(m), isMuted(), toggleMute(), setVolume(v), getVolume(),
//   playReveal(count = 1), playFlag(on = true, count = 1), playChord(count = 0),
//   playNoop(), playExplode(), playWin()
//
// Signal chain: voices -> bus -> DynamicsCompressor -> master (volume) -> destination.
// ---------------------------------------------------------------------------

const LS_MUTE = 'ms3d.muted';
const LS_VOL = 'ms3d.volume';
const DEFAULT_VOLUME = 0.7;
const MAX_VOICES = 48;

const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const jitter = (amt) => 1 + (Math.random() * 2 - 1) * amt; // ±amt multiplicative

let instance = null;

export class Sfx {
  constructor() {
    if (instance) return instance;
    instance = this;
    this.ctx = null;
    this.bus = null;
    this.comp = null;
    this.master = null;
    this.noiseBuf = null;
    this.voices = 0;
    this._last = Object.create(null); // per-sound throttle timestamps (ctx time)
    try { this.muted = localStorage.getItem(LS_MUTE) === '1'; } catch { this.muted = false; }
    let v = DEFAULT_VOLUME;
    try {
      const s = localStorage.getItem(LS_VOL);
      if (s !== null && s !== '' && Number.isFinite(+s)) v = clamp(+s, 0, 1);
    } catch { /* ignore */ }
    this.volume = v;
    this._installAutoUnlock();
  }

  // ---- context / chain ----------------------------------------------------
  _installAutoUnlock() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const h = () => {
      this.unlock();
      if (this.ctx) {
        window.removeEventListener('pointerdown', h, true);
        window.removeEventListener('keydown', h, true);
      }
    };
    window.addEventListener('pointerdown', h, true);
    window.addEventListener('keydown', h, true);
  }

  _masterGain() {
    // Perceptual-ish curve; 0.7 -> ~0.49.
    return this.muted ? 0 : this.volume * this.volume;
  }

  /** Build the processing chain on a given (possibly offline) context. */
  _setContext(c) {
    this.ctx = c;
    this.bus = c.createGain();
    this.bus.gain.value = 1.4;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 6;
    comp.attack.value = 0.002;
    comp.release.value = 0.18;
    this.comp = comp;
    this.master = c.createGain();
    this.master.gain.value = this._masterGain();
    this.bus.connect(comp); comp.connect(this.master); this.master.connect(c.destination);
    // Shared 2 s white-noise buffer (avoids allocating per sound).
    const len = Math.floor(c.sampleRate * 2);
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.voices = 0;
    this._last = Object.create(null);
  }

  _ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended' && this.ctx.resume) this.ctx.resume().catch(() => {});
      return true;
    }
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return false;
    try {
      this._setContext(new AC({ latencyHint: 'interactive' }));
      // Warm up the audio thread with a silent blip so the first real sound is instant.
      const s = this.ctx.createBufferSource();
      s.buffer = this.ctx.createBuffer(1, 1, this.ctx.sampleRate);
      s.connect(this.ctx.destination); s.start();
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return true;
    } catch { this.ctx = null; return false; }
  }

  /** Call from a user gesture to create/resume audio (avoids a hitch on first sound). */
  unlock() { if (!this.muted) this._ensure(); }

  _applyGain() {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(this._masterGain(), t, 0.015);
  }

  setMuted(m) {
    this.muted = !!m;
    try { localStorage.setItem(LS_MUTE, this.muted ? '1' : '0'); } catch { /* ignore */ }
    if (!this.muted) this._ensure(); // toggling is a user gesture: good time to unlock
    this._applyGain();
  }
  toggleMute() { this.setMuted(!this.muted); return this.muted; }

  setVolume(v) {
    v = Number(v);
    if (!Number.isFinite(v)) return;
    this.volume = clamp(v, 0, 1);
    try { localStorage.setItem(LS_VOL, String(this.volume)); } catch { /* ignore */ }
    this._applyGain();
  }
  getVolume() { return this.volume; }

  _ok() { return !this.muted && this._ensure(); }

  /** Returns false if `key` fired less than `gap` seconds ago. */
  _throttle(key, gap) {
    const t = this.ctx.currentTime, last = this._last[key];
    if (last !== undefined && t - last < gap) return false;
    this._last[key] = t;
    return true;
  }

  _track(node, endTime) {
    this.voices++;
    node.onended = () => { this.voices = Math.max(0, this.voices - 1); };
    node.stop(endTime);
  }

  // ---- primitives ---------------------------------------------------------
  _tone(freq, dur, { type = 'sine', gain = 0.3, delay = 0, slideTo = null, attack = 0.006, dest = null, detune = 0 } = {}) {
    if (this.voices >= MAX_VOICES) return;
    const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (detune) o.detune.setValueAtTime(detune, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || this.bus);
    o.start(t); this._track(o, t + dur + 0.03);
  }

  _noise(dur, { gain = 0.5, freq = 800, q = 0.7, delay = 0, type = 'lowpass', freqEnd = null, attack = 0.002, dest = null } = {}) {
    if (this.voices >= MAX_VOICES) return;
    const c = this.ctx, t = c.currentTime + delay;
    const src = c.createBufferSource(); src.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(dest || this.bus);
    const off = Math.random() * Math.max(0, this.noiseBuf.duration - dur - 0.05);
    src.start(t, off); this._track(src, t + dur + 0.03);
  }

  /** Bell-ish voice: fundamental + soft octave + slightly detuned double. */
  _bell(freq, dur, { gain = 0.1, delay = 0 } = {}) {
    this._tone(freq, dur, { type: 'sine', gain, delay, attack: 0.004 });
    this._tone(freq, dur * 0.9, { type: 'triangle', gain: gain * 0.35, delay, detune: 7, attack: 0.004 });
    this._tone(freq * 2, dur * 0.45, { type: 'sine', gain: gain * 0.22, delay, attack: 0.003 });
  }

  // ---- sounds -------------------------------------------------------------
  reveal(count = 1) {
    if (!this._ok()) return;
    count = Math.max(1, count | 0);
    const L = Math.log2(count);              // 0 .. ~10
    const k = clamp(L / 7, 0, 1);            // 0 (single) .. 1 (≈128+ cells)
    // Throttle: single clicks can repeat fast, but don't let them stack harshly.
    if (!this._throttle('reveal', count > 1 ? 0.06 : 0.035)) return;
    const det = jitter(0.03);
    const base = 520 * (1 + 0.35 * k) * det;
    // Soft tick + pitched blip.
    this._noise(0.035 + 0.02 * k, { gain: 0.32, freq: 2400 + 1600 * k, q: 1.1, type: 'bandpass' });
    this._tone(base, 0.07 + 0.05 * k, { type: 'triangle', gain: 0.24, slideTo: base * (1.12 + 0.4 * k) });
    if (count >= 6) {
      // Whoosh: band-passed noise sweeping upward, longer/brighter for bigger floods.
      const wd = 0.18 + 0.32 * k;
      this._noise(wd, { gain: 0.1 + 0.07 * k, freq: 350, freqEnd: 2200 + 2600 * k, q: 0.8, type: 'bandpass', attack: wd * 0.4 });
      // Cascade: quick ascending pentatonic sparkle.
      const pent = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2, 9 / 4, 5 / 2];
      const n = Math.min(pent.length, 2 + Math.round(L));
      const step = 0.028 + 0.012 * (1 - k);
      for (let i = 0; i < n; i++) {
        this._tone(base * pent[i] * jitter(0.01), 0.09 + 0.04 * k, {
          type: 'sine', gain: 0.12 * (1 - i / (n + 2)), delay: 0.03 + i * step,
        });
      }
    }
  }

  flag(on = true, count = 1) {
    if (!this._ok()) return;
    if (!this._throttle('flag', 0.04)) return;
    const det = jitter(0.02);
    if (on) {
      // Crisp "plant": woody click + rising two-step.
      this._noise(0.025, { gain: 0.252, freq: 3200, q: 2, type: 'bandpass' });
      this._tone(740 * det, 0.06, { type: 'square', gain: 0.063 });
      this._tone(1110 * det, 0.09, { type: 'triangle', gain: 0.162, delay: 0.045 });
      if (count > 1) {
        // Mass flag: extra stacked steps + a little shimmer.
        const extra = Math.min(3, count - 1);
        const ratios = [4 / 3, 3 / 2, 2];
        for (let i = 0; i < extra; i++) {
          this._tone(1110 * det * ratios[i], 0.1, { type: 'triangle', gain: 0.108, delay: 0.085 + i * 0.035 });
        }
        this._tone(2220 * det, 0.22, { type: 'sine', gain: 0.045, delay: 0.09 + extra * 0.035 });
      }
    } else {
      // Softer "pluck out": falling, duller.
      this._noise(0.03, { gain: 0.144, freq: 1400, q: 1.2, type: 'bandpass' });
      this._tone(620 * det, 0.11, { type: 'triangle', gain: 0.22, slideTo: 360 * det });
      if (count > 1) this._tone(420 * det, 0.12, { type: 'triangle', gain: 0.09, delay: 0.05, slideTo: 260 * det });
    }
  }

  chord(count = 0) {
    if (!this._ok()) return;
    if (!this._throttle('chord', 0.05)) return;
    // Quick strummed triad with a percussive "knock" — distinct from a plain reveal.
    const det = jitter(0.02);
    this._noise(0.04, { gain: 0.216, freq: 900, q: 1.5, type: 'bandpass' });
    this._tone(180 * det, 0.08, { type: 'sine', gain: 0.216, slideTo: 120 });
    const triad = [392, 493.88, 587.33]; // G4 B4 D5
    triad.forEach((f, i) => this._tone(f * det, 0.16, { type: 'triangle', gain: 0.126, delay: 0.012 + i * 0.018 }));
    if (count > 0) this.reveal(count);
  }

  noop() {
    if (!this._ok()) return;
    if (!this._throttle('noop', 0.08)) return;
    // Soft muted thunk: low lowpassed sine + a dull felt tap.
    const det = jitter(0.03);
    this._tone(150 * det, 0.09, { type: 'sine', gain: 0.28, slideTo: 95 * det, attack: 0.004 });
    this._noise(0.05, { gain: 0.12, freq: 420, q: 0.7, type: 'lowpass' });
  }

  explode() {
    if (!this._ok()) return;
    if (!this._throttle('explode', 0.3)) return;
    // Transient crack.
    this._noise(0.06, { gain: 0.35, freq: 2500, q: 0.5, type: 'highpass', attack: 0.001 });
    // Body: lowpassed noise sweeping down.
    this._noise(0.9, { gain: 0.42, freq: 1600, freqEnd: 70, q: 0.6, attack: 0.003 });
    // Low boom + sub.
    this._tone(95, 0.75, { type: 'sine', gain: 0.5, slideTo: 32, attack: 0.004 });
    this._tone(58, 1.0, { type: 'sine', gain: 0.32, slideTo: 28, attack: 0.01 });
    // Debris: scattered small bursts over a fading tail.
    for (let i = 0; i < 14; i++) {
      const d = 0.15 + Math.pow(Math.random(), 0.8) * 1.2;
      this._noise(0.03 + Math.random() * 0.07, {
        gain: 0.09 * (1 - d / 1.5), freq: 900 + Math.random() * 3000, q: 1.5 + Math.random() * 3,
        type: 'bandpass', delay: d, attack: 0.002,
      });
    }
    // Rumble tail.
    this._noise(1.6, { gain: 0.1, freq: 260, freqEnd: 60, q: 0.5, delay: 0.1, attack: 0.15 });
  }

  win() {
    if (!this._ok()) return;
    if (!this._throttle('win', 0.5)) return;
    // Rising arpeggio (C major add9) then a sustained bell chord.
    const arp = [523.25, 659.25, 783.99, 987.77, 1174.66, 1567.98];
    arp.forEach((f, i) => this._bell(f, 0.42, { gain: 0.052, delay: i * 0.085 }));
    const t0 = arp.length * 0.085 + 0.04;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._bell(f, 0.95, { gain: 0.043, delay: t0 + i * 0.012 }));
    this._tone(261.63, 1.0, { type: 'triangle', gain: 0.045, delay: t0, attack: 0.02 });
    // Sparkle on top.
    this._tone(2093, 0.5, { type: 'sine', gain: 0.019, delay: t0 + 0.08 });
  }
}

export const sfx = new Sfx();

export function unlock() { sfx.unlock(); }
export function setMuted(m) { sfx.setMuted(m); }
export function isMuted() { return sfx.muted; }
export function toggleMute() { return sfx.toggleMute(); }
export function setVolume(v) { sfx.setVolume(v); }
export function getVolume() { return sfx.getVolume(); }
export function playReveal(count = 1) { sfx.reveal(count); }
export function playFlag(on = true, count = 1) { sfx.flag(on, count); }
export function playChord(count = 0) { sfx.chord(count); }
export function playNoop() { sfx.noop(); }
export function playExplode() { sfx.explode(); }
export function playWin() { sfx.win(); }
