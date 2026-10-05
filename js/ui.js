// DOM menus, HUD and overlays. No game rules here.
const $ = (id) => document.getElementById(id);
const LS_CUSTOM = 'ms3d.custom';
const LS_HELP_SEEN = 'ms3d.helpSeen';

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

export class UI {
  constructor(cb) {
    this.cb = cb; // { onStart(settings), onReadyClick(), onResume(), onRestart(), onMainMenu(), onToggleSound() }
    this.el = {
      hud: $('hud'), time: $('hud-time'), mines: $('hud-mines'), size: $('hud-size'), sound: $('hud-sound'),
      help: $('help'), banner: $('banner'), bannerTitle: $('banner-title'), bannerSub: $('banner-sub'),
      flash: $('flash'), menu: $('menu'), ready: $('ready'), readyBoard: $('ready-board'), readyMsg: $('ready-msg'),
      pause: $('pause'), pauseCard: document.querySelector('.pause-card'), pauseTitle: $('pause-title'), pauseSub: $('pause-sub'),
      resume: $('p-resume'), restart: $('p-restart'),
      cx: $('c-x'), cy: $('c-y'), cz: $('c-z'), cm: $('c-m'), cinfo: $('c-info'),
      chipShift: $('chip-shift'), chipSpace: $('chip-space'), chipCtrl: $('chip-ctrl'),
    };
    this._last = { time: '', mines: '' };
    this._helpTimer = 0;

    document.querySelectorAll('.preset').forEach((b) => {
      b.addEventListener('click', () => {
        const [X, Y, Z, mines] = b.dataset.preset.split(',').map(Number);
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
      cb.onStart(s);
    });
    $('menu-help').addEventListener('click', () => this.toggleHelp());
    $('menu-sound').addEventListener('click', () => cb.onToggleSound());
    $('p-sound').addEventListener('click', () => cb.onToggleSound());
    $('ready-btn').addEventListener('click', () => cb.onReadyClick());
    this.el.resume.addEventListener('click', () => cb.onResume());
    this.el.restart.addEventListener('click', () => cb.onRestart());
    $('p-menu').addEventListener('click', () => cb.onMainMenu());

    if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) {
      $('touch-note').classList.remove('hidden');
    }
  }

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
    for (const el of [this.el.cx, this.el.cy, this.el.cz, this.el.cm]) el.classList.remove('clamped');
    this._updateCustomInfo();
  }
  _clampCustomFields() {
    const raw = this._readCustom();
    const s = clampSettings(raw);
    const pairs = [[this.el.cx, raw.X, s.X], [this.el.cy, raw.Y, s.Y], [this.el.cz, raw.Z, s.Z], [this.el.cm, raw.mines, s.mines]];
    for (const [el, a, b] of pairs) {
      if (a !== b) { el.value = b; el.classList.add('clamped'); setTimeout(() => el.classList.remove('clamped'), 900); }
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
    this.el.cinfo.classList.toggle('warn', warn);
  }

  // ---------- screens ----------
  showMenu() {
    this.el.menu.classList.remove('hidden');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.banner.classList.add('hidden');
    this.el.help.classList.add('hidden');
  }
  showReady(settings, msg = '') {
    this.el.menu.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.ready.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.readyBoard.textContent = `${fmtDims(settings)} · ${settings.mines} mines`;
    this.el.readyMsg.textContent = msg;
  }
  setReadyMessage(msg) { this.el.readyMsg.textContent = msg; }
  showPlaying() {
    this.el.menu.classList.add('hidden');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
  }
  showPause({ state, time, minesLeft }) {
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    const ended = state !== 'playing';
    this.el.pauseCard.classList.toggle('won', state === 'won');
    this.el.pauseCard.classList.toggle('lost', state === 'lost');
    this.el.pauseTitle.textContent = state === 'won' ? 'You won!' : state === 'lost' ? 'Game over' : 'Paused';
    this.el.pauseSub.textContent = `Time ${fmtTime(time)} s · ${minesLeft} mine${minesLeft === 1 ? '' : 's'} left`;
    this.el.resume.textContent = ended ? 'Keep looking around' : 'Resume';
    this.el.restart.textContent = ended ? 'Play again' : 'Restart';
    (ended ? this.el.restart : this.el.resume).focus({ preventScroll: true });
  }
  isPauseVisible() { return !this.el.pause.classList.contains('hidden'); }

  // ---------- HUD ----------
  setBoard(settings) { this.el.size.textContent = fmtDims(settings); }
  updateHud(time, minesLeft) {
    const t = fmtTime(time), m = String(minesLeft);
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
  }
  /** Show the help panel for a few seconds the first time a player starts a game. */
  maybeIntroHelp() {
    if (lsGet(LS_HELP_SEEN)) return;
    lsSet(LS_HELP_SEEN, '1');
    this.toggleHelp(true);
    this._helpTimer = setTimeout(() => this.el.help.classList.add('hidden'), 9000);
  }

  showBanner(state, time) {
    const b = this.el.banner;
    b.classList.remove('hidden', 'won', 'lost', 'compact');
    b.classList.add(state);
    this.el.bannerTitle.textContent = state === 'won' ? 'You won!' : 'Game over';
    this.el.bannerSub.textContent = `Time ${fmtTime(time)} s`;
    // restart the entry animation
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(this._bannerTimer);
    this._bannerTimer = setTimeout(() => b.classList.add('compact'), 4000);
  }
  hideBanner() { clearTimeout(this._bannerTimer); this.el.banner.classList.add('hidden'); }
  flash() {
    const f = this.el.flash;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
}
