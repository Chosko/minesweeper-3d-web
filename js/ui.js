// DOM menus, HUD and overlays. No game rules here.
import { formatOverlayTime, formatMineCount, formatSliderValue } from './ui/components.js';

const $ = (id) => document.getElementById(id);
const LS_CUSTOM = 'ms3d.custom';
const LS_HINT_DONE = 'ms3d.hintH.done';
const LS_BEST = 'ms3d.best.'; // + XxYxZxmines
const LS_SENS = 'ms3d.lookSens';
const LS_INVERT = 'ms3d.invertY';
const LS_LAST_PRESET = 'ms3d.lastPreset';

export const DIM_MIN = 1, DIM_MAX = 100;

function lsGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

const randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1)); // inclusive

/** Random board, original formula (Menu.cs Random_Click), with guards for tiny boards. */
export function randomSettings() {
  const Z = randInt(1, 29);
  const Y = randInt(1, Math.max(1, 29 - Z));
  const X = Math.min(DIM_MAX, randInt(1, Math.max(1, 29 - (Z - Y))));
  const n = X * Y * Z;
  const mines = Math.min(n, randInt(1, Math.max(1, Math.floor(n / 5) - 1)));
  return { X, Y, Z, mines };
}

export function clampSettings(s) {
  const dim = (v) => Math.min(DIM_MAX, Math.max(DIM_MIN, Math.round(Number.isFinite(v) ? v : 1)));
  const X = dim(s.X), Y = dim(s.Y), Z = dim(s.Z);
  const n = X * Y * Z;
  const mines = Math.min(n, Math.max(1, Math.round(Number.isFinite(s.mines) ? s.mines : 1)));
  return { X, Y, Z, mines };
}

export const fmtDims = (s) => `${s.X} × ${s.Y} × ${s.Z}`;
export const fmtTime = (t) => t.toFixed(2);

// ---------- best times (per board size + mine count) ----------
const bestKey = (s) => `${LS_BEST}${s.X}x${s.Y}x${s.Z}x${s.mines}`;
export function getBest(s) {
  const v = parseFloat(lsGet(bestKey(s)));
  return Number.isFinite(v) && v >= 0 ? v : null;
}
/** Record a winning time; returns { best, prev, isNew }. */
export function recordBest(s, time) {
  const prev = getBest(s);
  const isNew = prev === null || time < prev;
  if (isNew) lsSet(bestKey(s), String(time));
  return { best: isNew ? time : prev, prev, isNew };
}

// ---------- look settings ----------
export function loadLookSettings() {
  let sens = parseFloat(lsGet(LS_SENS));
  if (!Number.isFinite(sens)) sens = 1;
  sens = Math.min(3, Math.max(0.25, sens));
  return { sensitivity: sens, invertY: lsGet(LS_INVERT) === '1' };
}

export const NO_MOUSE_MSG = 'Minesweeper 3D needs a mouse and keyboard — open it on a desktop browser.';

export class UI {
  constructor(cb) {
    this.cb = cb; // { onStart, onReadyClick, onReadyBack, onResume, onRestart, onMainMenu, onPause, onToggleSound, onLookSettings, onVolume }
    this.el = {
      hud: $('hud'), time: $('hud-time'), mines: $('hud-mines'), size: $('hud-size'), sound: $('hud-sound'),
      help: $('help'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      flash: $('flash'), menu: $('menu'), ready: $('ready'), readyBoard: $('ready-board'), readyMsg: $('ready-msg'),
      bannerRecord: $('banner-record'), crosshair: $('crosshair'), hintH: $('hint-h'),
      controlsModal: $('controls-modal'),
      pause: $('pause'), pauseTitle: $('pause-title'), pauseSub: $('pause-sub'),
      resume: $('p-resume'), restart: $('p-restart'), pauseMenu: $('p-menu'), pauseActions: $('pause-actions'),
      cx: $('c-x'), cy: $('c-y'), cz: $('c-z'), cm: $('c-m'), cinfo: $('c-info'),
      chipShift: $('chip-shift'), chipSpace: $('chip-space'), chipCtrl: $('chip-ctrl'),
    };
    this._last = { time: '', mines: '' };
    this._helpTimer = 0;
    this._helpByUser = false; // in-game help panel opened with H
    this._crossOn = null;

    document.querySelectorAll('[data-preset]').forEach((b) => {
      for (const kind of ['best', 'last']) {
        const line = document.createElement('span');
        line.className = 'ui-menu__detail hidden';
        line.dataset[kind] = '';
        if (kind === 'last') line.textContent = 'Last played';
        b.appendChild(line);
      }
      b.addEventListener('click', () => {
        const [X, Y, Z, mines] = b.dataset.preset.split(',').map(Number);
        lsSet(LS_LAST_PRESET, b.dataset.preset);
        cb.onStart({ X, Y, Z, mines });
      });
    });
    // custom
    const saved = this._loadCustom();
    this._setCustom(saved);
    for (const inp of [this.el.cx, this.el.cy, this.el.cz, this.el.cm]) {
      inp.addEventListener('input', () => this._updateCustomInfo());
      inp.addEventListener('change', () => this._clampCustomFields());
    }
    $('c-random').addEventListener('click', () => { this._setCustom(randomSettings()); });
    $('custom').addEventListener('submit', (e) => {
      e.preventDefault();
      const s = this._clampCustomFields();
      lsSet(LS_CUSTOM, JSON.stringify(s));
      lsSet(LS_LAST_PRESET, '');
      cb.onStart(s);
    });
    // Controls modal (main menu): a copy of the in-game help list
    $('controls-body').appendChild(this.el.help.querySelector('.controls').cloneNode(true));
    $('menu-help').addEventListener('click', () => this.openControls());
    $('controls-close').addEventListener('click', () => this.closeControls());
    this.el.controlsModal.addEventListener('click', (e) => { if (e.target === this.el.controlsModal) this.closeControls(); });
    $('ready-back').addEventListener('click', () => cb.onReadyBack?.());
    $('hint-h-close').addEventListener('click', () => this.dismissHint());
    $('menu-sound').addEventListener('click', () => cb.onToggleSound());
    $('p-sound').addEventListener('click', () => cb.onToggleSound());
    $('ready-btn').addEventListener('click', () => cb.onReadyClick());
    this.el.resume.addEventListener('click', () => cb.onResume());
    this.el.restart.addEventListener('click', () => cb.onRestart());
    $('p-menu').addEventListener('click', () => cb.onMainMenu());
    $('hud-pause').addEventListener('click', () => cb.onPause?.());

    // look settings
    const look = loadLookSettings();
    const sens = $('p-sens'), sensVal = $('p-sens-val'), inv = $('p-invert');
    sens.value = String(look.sensitivity); inv.checked = look.invertY;
    const showSens = () => { sensVal.textContent = formatSliderValue(sens.value, { format: 'multiplier', step: sens.step }); };
    showSens();
    sens.addEventListener('input', () => {
      showSens(); lsSet(LS_SENS, sens.value);
      cb.onLookSettings?.({ sensitivity: Number(sens.value), invertY: inv.checked });
    });
    inv.addEventListener('change', () => {
      lsSet(LS_INVERT, inv.checked ? '1' : '0');
      cb.onLookSettings?.({ sensitivity: Number(sens.value), invertY: inv.checked });
    });
    // keyboard on settings controls must not leak into game keys while paused (handled by mode)
    this.refreshBests();
  }

  /** Show the "needs mouse and keyboard" banner on the menu. */
  setNoMouse(on) { $('touch-note').classList.toggle('hidden', !on); }

  /** Volume controls (only shown when the audio module supports it). v in 0..1. */
  initVolume(v, onChange) {
    const sliders = [$('menu-vol'), $('p-vol')];
    const outs = [$('menu-vol-val'), $('p-vol-val')];
    const set = (val, from) => {
      for (const s of sliders) if (s !== from) s.value = String(Math.round(val * 100));
      for (const o of outs) o.textContent = formatSliderValue(val * 100, { format: 'percent' });
    };
    set(v, null);
    document.querySelectorAll('[data-volume]').forEach((e) => e.classList.remove('hidden'));
    for (const s of sliders) {
      s.addEventListener('input', () => { const val = Number(s.value) / 100; set(val, s); onChange(val); });
    }
  }

  refreshBests() {
    const last = lsGet(LS_LAST_PRESET);
    document.querySelectorAll('[data-preset]').forEach((b) => {
      const isLast = !!last && b.dataset.preset === last;
      b.toggleAttribute('data-last', isLast);
      b.querySelector('[data-last]')?.classList.toggle('hidden', !isLast);
      const [X, Y, Z, mines] = b.dataset.preset.split(',').map(Number);
      const best = getBest({ X, Y, Z, mines });
      const el = b.querySelector('[data-best]');
      if (!el) return;
      el.textContent = best === null ? '' : `Best ${fmtTime(best)} s`;
      el.classList.toggle('hidden', best === null);
    });
  }

  // ---------- controls modal ----------
  openControls() {
    this.el.controlsModal.classList.remove('hidden');
    $('controls-close').focus({ preventScroll: true });
  }
  closeControls() {
    if (this.el.controlsModal.classList.contains('hidden')) return false;
    this.el.controlsModal.classList.add('hidden');
    $('menu-help').focus({ preventScroll: true });
    return true;
  }
  isControlsOpen() { return !this.el.controlsModal.classList.contains('hidden'); }

  // ---------- custom panel ----------
  _loadCustom() {
    try {
      const v = JSON.parse(lsGet(LS_CUSTOM));
      if (v && typeof v === 'object') return clampSettings(v);
    } catch { /* ignore */ }
    return { X: 10, Y: 10, Z: 10, mines: 25 };
  }
  _readCustom() {
    const n = (el) => parseInt(el.value, 10);
    return { X: n(this.el.cx), Y: n(this.el.cy), Z: n(this.el.cz), mines: n(this.el.cm) };
  }
  _setCustom(s) {
    this.el.cx.value = s.X; this.el.cy.value = s.Y; this.el.cz.value = s.Z; this.el.cm.value = s.mines;
    for (const el of [this.el.cx, this.el.cy, this.el.cz, this.el.cm]) el.removeAttribute('data-adjusted');
    this._updateCustomInfo();
  }
  _clampCustomFields() {
    const raw = this._readCustom();
    const s = clampSettings(raw);
    const pairs = [[this.el.cx, raw.X, s.X], [this.el.cy, raw.Y, s.Y], [this.el.cz, raw.Z, s.Z], [this.el.cm, raw.mines, s.mines]];
    for (const [el, a, b] of pairs) {
      if (a !== b) { el.value = b; el.setAttribute('data-adjusted', ''); setTimeout(() => el.removeAttribute('data-adjusted'), 900); }
    }
    this._updateCustomInfo();
    return s;
  }
  _updateCustomInfo() {
    const raw = this._readCustom();
    const s = clampSettings(raw);
    const n = s.X * s.Y * s.Z;
    this.el.cm.max = String(n);
    let msg = `${n.toLocaleString('en-US')} cells · mine density ${((100 * s.mines) / n).toFixed(1)}%`;
    let warn = false;
    const bad = [raw.X, raw.Y, raw.Z].some((v) => !Number.isFinite(v) || v < DIM_MIN || v > DIM_MAX);
    if (bad) { msg = `Each dimension must be ${DIM_MIN}–${DIM_MAX}. ` + msg; warn = true; }
    else if (!Number.isFinite(raw.mines) || raw.mines < 1 || raw.mines > n) { msg = `Mines must be 1–${n.toLocaleString('en-US')}. ` + msg; warn = true; }
    else if (n > 250000) { msg += ' · very large board, may run slowly'; warn = true; }
    this.el.cinfo.textContent = msg;
    this.el.cinfo.classList.toggle('ui-text--warning', warn);
    this.el.cinfo.classList.toggle('ui-text--muted', !warn);
  }

  // ---------- screens ----------
  showMenu() {
    this.el.menu.classList.remove('hidden');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.banner.classList.add('hidden');
    this.el.help.classList.add('hidden');
    this.el.controlsModal.classList.add('hidden');
    this._helpByUser = false;
    this.refreshBests();
  }
  showReady(settings, msg = '') {
    this.el.menu.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.ready.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.readyBoard.textContent = `${fmtDims(settings)} · ${settings.mines} mines`;
    this.el.readyMsg.textContent = msg;
    this.el.banner.classList.remove('suppressed');
    this._syncHelp();
  }
  setReadyMessage(msg) { this.el.readyMsg.textContent = msg; }
  showPlaying() {
    this.el.menu.classList.add('hidden');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.banner.classList.remove('suppressed');
    this._syncHelp();
    this.el.hintH.classList.toggle('hidden', !!lsGet(LS_HINT_DONE));
  }
  _syncHelp() { if (!this._helpByUser) this.toggleHelp(false); }
  dismissHint() { lsSet(LS_HINT_DONE, '1'); this.el.hintH.classList.add('hidden'); }
  /** Crosshair feedback: on = a cell is targeted. Touches the DOM only on change. */
  setCrosshair(on) {
    if (on === this._crossOn) return;
    this._crossOn = on;
    this.el.crosshair.classList.toggle('on', on);
    this.el.crosshair.classList.toggle('off', !on);
  }
  showPause({ state, time, minesLeft, note = '' }) {
    const pn = $('pause-note');
    pn.textContent = note; pn.classList.toggle('hidden', !note);
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    const ended = state !== 'playing';
    this.el.banner.classList.add('suppressed');
    // The primary action leads: Resume while playing, Play again once the game ended.
    const [first, second] = ended ? [this.el.restart, this.el.resume] : [this.el.resume, this.el.restart];
    first.classList.replace('ui-button--secondary', 'ui-button--primary');
    second.classList.replace('ui-button--primary', 'ui-button--secondary');
    this.el.pauseActions.insertBefore(first, this.el.pauseMenu);
    this.el.pauseActions.insertBefore(second, this.el.pauseMenu);
    this.el.pauseTitle.textContent = state === 'won' ? 'You won!' : state === 'lost' ? 'Game over' : 'Paused';
    this.el.pauseSub.textContent = `Time ${fmtTime(time)} s · ${minesLeft} mine${minesLeft === 1 ? '' : 's'} left`;
    this.el.resume.textContent = ended ? 'Keep looking around' : 'Resume';
    this.el.restart.textContent = ended ? 'Play again' : 'Restart';
    (ended ? this.el.restart : this.el.resume).focus({ preventScroll: true });
  }
  isPauseVisible() { return !this.el.pause.classList.contains('hidden'); }

  // ---------- HUD ----------
  setBoard(settings) { this.el.size.textContent = fmtDims(settings); }
  /** Overlay bar readouts: the display formats clamp; `time` itself is never clamped. */
  updateHud(time, minesLeft) {
    const t = formatOverlayTime(time), m = formatMineCount(minesLeft);
    if (t !== this._last.time) { this.el.time.textContent = t; this._last.time = t; }
    if (m !== this._last.mines) {
      this.el.mines.textContent = m; this._last.mines = m;
      this.el.mines.classList.toggle('negative', minesLeft < 0);
    }
  }
  setModes(shift, space, ctrl) {
    this.el.chipShift.classList.toggle('on', shift);
    this.el.chipSpace.classList.toggle('on', space);
    this.el.chipCtrl.classList.toggle('on', ctrl);
  }
  /** Brief toast with the current cube spacing (mouse wheel). */
  showSpacing(v) {
    const c = $('chip-spacing');
    c.textContent = `Spacing ${v.toFixed(2)}`;
    c.classList.add('on');
    clearTimeout(this._spacingTimer);
    this._spacingTimer = setTimeout(() => c.classList.remove('on'), 1200);
  }
  setSound(muted) {
    const t = muted ? 'off' : 'on';
    this.el.sound.textContent = `sound ${t}`;
    $('menu-sound').textContent = `Sound: ${t}`;
    $('p-sound').textContent = `Sound: ${t}`;
  }
  toggleHelp(force) {
    clearTimeout(this._helpTimer);
    const show = force ?? this.el.help.classList.contains('hidden');
    this.el.help.classList.toggle('hidden', !show);
    return show;
  }
  /** H key in game: toggle the help panel; remembered so screen changes keep it open. */
  userToggleHelp() {
    this._helpByUser = this.toggleHelp();
    this.dismissHint();
  }

  /** Extra line under the end banner time (best-time info). */
  setBannerRecord(text, isNew = false) {
    const r = this.el.bannerRecord;
    r.textContent = text || '';
    r.classList.toggle('hidden', !text);
    r.classList.toggle('new', !!isNew);
  }
  showBanner(state, time) {
    const b = this.el.banner;
    b.classList.remove('hidden', 'won', 'lost', 'compact', 'suppressed');
    this.setBannerRecord('');
    b.classList.add(state);
    this.el.bannerTitle.textContent = state === 'won' ? 'You won!' : 'Game over';
    this.el.bannerSub.textContent = `Time ${fmtTime(time)} s`;
    // restart the entry animation
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.add('compact'), 4000);
  }
  /** Short global notice (e.g. "Controller connected"). */
  toast(msg, ms = 2200) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }

  /**
   * Controller hints. info = { glyphs, mapping } of the active pad, or null to hide them.
   * Fills the "Controller" section of the help panel and the controls modal, and the ready-card hint.
   */
  setPad(info) {
    const secs = [$('help-pad'), $('modal-pad')], ready = $('ready-pad');
    if (!info) {
      for (const el of [...secs, ready]) el.classList.add('hidden');
      return;
    }
    const g = info.glyphs;
    const k = (t) => `<kbd class="pad">${t}</kbd>`;
    const note = info.mapping !== 'standard'
      ? '<p class="pad-note">This controller does not report the standard layout, so some buttons may be unmapped.</p>' : '';
    const html = `<h3>Controller <span class="pad-name">· ${g.name}</span></h3>${note}
      <dl class="controls">
        <dt>Left / right stick</dt><dd>Fly / look around</dd>
        <dt>${k(g.rt)} / ${k(g.lt)}</dt><dd>Reveal / flag (on release)</dd>
        <dt>${k(g.lt)} + ${k(g.rt)}</dt><dd>Chord</dd>
        <dt>${k(g.a)} / ${k(g.b)}</dt><dd>Move up / down</dd>
        <dt>Hold ${k(g.lb)} ${k(g.rb)} ${k(g.y)}</dt><dd>Neighbours only / aim through numbers / show hidden</dd>
        <dt>D-pad ↑ ↓</dt><dd>Change spacing</dd>
        <dt>${k(g.x)}</dt><dd>Show / hide this panel</dd>
        <dt>${k(g.start)} / ${k(g.back)}</dt><dd>Pause / sound on-off</dd>
        <dt>Menus</dt><dd>D-pad or left stick to move, ${k(g.a)} select, ${k(g.b)} back</dd>
      </dl>`;
    for (const el of secs) { el.innerHTML = html; el.classList.remove('hidden'); }
    ready.innerHTML = `<b>Controller:</b> ${k(g.a)} play · ${k(g.rt)} reveal · ${k(g.lt)} flag · both chord · ${k(g.start)} pause${note ? '<br>' + note.replace('<p ', '<span ').replace('</p>', '</span>') : ''}`;
    ready.classList.remove('hidden');
  }

  hideBanner() { clearTimeout(this._bannerTimer); this.el.banner.classList.add('hidden'); }
  flash() {
    const f = this.el.flash;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
}
