// DOM menus, HUD and overlays. No game rules here.
// Every help surface — the pause card, the main menu's Controls panel, the H panel, the HUD strip
// and the hint strip — is drawn from the bindings source (js/settings/bindings.js) for the active
// mode and the active device (the controller in the connected controller's glyphs).
import { formatOverlayTime, formatMineCount, bindSegmented } from './ui/components.js';
import { GLYPHS } from './gamepad.js';
import { bindingsHtml, hudStripHtml, hintStripHtml, helpFootHtml } from './settings/bindings.js';
import { settingsPageHtml, bindingsSectionHtml } from './settings/page.js';
import { DIM_MIN, DIM_MAX } from './mode3d/board-choice.js';

const $ = (id) => document.getElementById(id);

export { DIM_MIN, DIM_MAX };

export function clampSettings(s) {
  const dim = (v) => Math.min(DIM_MAX, Math.max(DIM_MIN, Math.round(Number.isFinite(v) ? v : 1)));
  const X = dim(s.X), Y = dim(s.Y), Z = dim(s.Z);
  const n = X * Y * Z;
  const mines = Math.min(n - 1, Math.max(1, Math.round(Number.isFinite(s.mines) ? s.mines : 1))); // the first click is safe
  return { X, Y, Z, mines };
}

export const fmtDims = (s) => `${s.X} × ${s.Y} × ${s.Z}`;
export const fmtTime = (t) => t.toFixed(2);
const NO_GUESS = ' · no-guess';
/** A 3D board as the overlay bar, the ready card (with `mines`) and the pause card name it. */
export function boardLine3D(s, { mines = false } = {}) {
  const count = mines ? ` · ${s.mines} mine${s.mines === 1 ? '' : 's'}` : '';
  return `${fmtDims(s)}${count}${s.noGuess ? NO_GUESS : ''}`;
}
/** A Classic 2D board as the overlay bar and the pause card name it. */
export const boardLine2D = (b) => `${b.width} × ${b.height}${b.noGuess ? NO_GUESS : ''}`;

export const NO_MOUSE_MSG = 'Minesweeper 3D needs a mouse and keyboard — open it on a desktop browser.';

export class UI {
  constructor(cb) {
    this.cb = cb; // { onMenuEntry, onBack, onReadyClick, onReadyBack, onResume, onRestart, onMainMenu, onPause, onToggleSound, onDismissHint, onRetry2D, onStandard2D, onRetry3D, onStandard3D }
    this.el = {
      hud: $('hud'), time: $('hud-time'), mines: $('hud-mines'), size: $('hud-size'), hudTools: $('hud-tools'),
      help: $('help'), helpList: $('help').querySelector('.controls'), helpFoot: $('help-foot'),
      hintStrip: $('hint-strip'), hintStripText: $('hint-strip-text'),
      readyRules: $('ready-rules'), pauseBoard: $('pause-board'), pauseControls: $('pause-controls'),
      controlsBody: $('controls-body'),
      flash: $('flash'), menu: $('menu'), ready: $('ready'), readyBoard: $('ready-board'), readyMsg: $('ready-msg'),
      boardChoice: $('board-choice'), comingSoon: $('coming-soon'), comingSoonTitle: $('coming-soon-title'),
      settings: $('settings'), settingsBindings: null, records: $('records'),
      comingSoonText: $('coming-soon-text'),
      crosshair: $('crosshair'),
      controlsModal: $('controls-modal'),
      pause: $('pause'), pauseTitle: $('pause-title'), pauseSub: $('pause-sub'),
      resume: $('p-resume'), restart: $('p-restart'), pauseMenu: $('p-menu'), pauseActions: $('pause-actions'),
      confirm: $('pause-confirm'), confirmText: $('pause-confirm-text'), confirmYes: $('p-confirm-yes'),
      chipShift: $('chip-shift'), chipSpace: $('chip-space'), chipCtrl: $('chip-ctrl'),
      c2dChoice: $('c2d-choice'), c2d: $('c2d'), c2dBoard: $('c2d-board'), c2dStatus: $('c2d-status'),
      c2dStatusTitle: $('c2d-status-title'), c2dStatusText: $('c2d-status-text'), c2dOffer: $('c2d-offer'),
      c2dSpinner: $('c2d-spinner'), c2dWait: $('c2d-wait'),
      m3dStatus: $('m3d-status'), m3dStatusTitle: $('m3d-status-title'), m3dStatusText: $('m3d-status-text'), m3dOffer: $('m3d-offer'),
      m3dSpinner: $('m3d-spinner'), m3dWait: $('m3d-wait'),
    };
    this._last = { time: '', mines: '' };
    this._helpTimer = 0;
    this._helpByUser = false; // in-game help panel opened with H
    this._crossOn = null;
    this._mode = '3d'; // the game mode the help surfaces show: 'classic-2d' | '3d'
    this._device = 'keyboard'; // the active device: 'keyboard' (and mouse) | 'controller'
    this._glyphs = GLYPHS.generic; // the active controller's, for the bindings shown
    this._mapping = 'standard';
    this._muted = false;
    this._hint = false; // the hint strip shows
    this._controlsTab = 'classic-2d'; // the Controls panel's tab
    this._boardText = '';

    // main menu entries: each a route (the shell decides where); the last mode played is marked
    document.querySelectorAll('[data-entry]').forEach((b) => {
      const line = document.createElement('span');
      line.className = 'ui-menu__detail hidden';
      line.dataset.last = '';
      line.textContent = 'Last played';
      b.appendChild(line);
      b.addEventListener('click', () => cb.onMenuEntry?.(b.dataset.entry));
    });
    for (const id of ['coming-soon-back', 'settings-back']) $(id).addEventListener('click', () => cb.onBack?.());
    // The Settings page's controls are generated from the settings schema and bound by the shell.
    $('settings-body').innerHTML = settingsPageHtml();
    this.el.settingsBindings = $('settings-bindings');
    // Controls panel (main menu): Classic 2D and 3D tabs over the bindings component.
    bindSegmented($('controls-tabs'), { horizontal: true, onChange: (mode) => { this._controlsTab = mode; this._renderBindings(); } });
    this._renderBindings();
    $('menu-help').addEventListener('click', () => this.openControls());
    $('controls-close').addEventListener('click', () => this.closeControls());
    this.el.controlsModal.addEventListener('click', (e) => { if (e.target === this.el.controlsModal) this.closeControls(); });
    $('ready-back').addEventListener('click', () => cb.onReadyBack?.());
    $('hint-strip-close').addEventListener('click', () => this.dismissHint());
    $('menu-sound').addEventListener('click', () => cb.onToggleSound());
    $('p-sound').addEventListener('click', () => cb.onToggleSound());
    $('ready-btn').addEventListener('click', () => cb.onReadyClick());
    this.el.resume.addEventListener('click', () => cb.onResume());
    this.el.restart.addEventListener('click', () => cb.onRestart());
    $('p-menu').addEventListener('click', () => cb.onMainMenu());
    $('hud-pause').addEventListener('click', () => cb.onPause?.());
    $('c2d-retry').addEventListener('click', () => cb.onRetry2D?.());
    $('c2d-standard').addEventListener('click', () => cb.onStandard2D?.());
    $('c2d-cancel').addEventListener('click', () => cb.onCancel2D?.());
    $('c2d-offer-menu').addEventListener('click', () => cb.onOfferMenu2D?.());
    $('m3d-retry').addEventListener('click', () => cb.onRetry3D?.());
    $('m3d-standard').addEventListener('click', () => cb.onStandard3D?.());
    $('m3d-cancel').addEventListener('click', () => cb.onCancel3D?.());
    $('m3d-offer-menu').addEventListener('click', () => cb.onOfferMenu3D?.());
    this._confirm = null; // { onYes, onNo } while the pause card's confirmation is open
    this.el.confirmYes.addEventListener('click', () => this._closeConfirm('onYes'));
    $('p-confirm-no').addEventListener('click', () => this._closeConfirm('onNo'));
  }

  /** Show the "needs mouse and keyboard" banner on the menu. */
  setNoMouse(on) { $('touch-note').classList.toggle('hidden', !on); }

  /** Mark the main menu entry of the last mode played (null: none). */
  setLastMode(mode) {
    document.querySelectorAll('[data-entry]').forEach((b) => {
      const isLast = !!mode && b.dataset.entry === mode;
      b.toggleAttribute('data-last', isLast);
      b.querySelector('[data-last]')?.classList.toggle('hidden', !isLast);
    });
  }

  // ---------- controls modal ----------
  openControls() {
    this._renderBindings();
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

  // ---------- screens ----------
  /** Hide the menu screens (main menu, board choices, placeholder, records, settings) before another screen shows. */
  _hideMenus() {
    for (const el of [this.el.menu, this.el.boardChoice, this.el.comingSoon, this.el.records, this.el.c2dChoice, this.el.settings]) el.classList.add('hidden');
  }
  /** Hide the Classic 2D board layer and give the overlay bar back to the 3D game. */
  _hide2D() {
    this.el.c2d.classList.add('hidden');
    this.el.hud.classList.remove('hud--2d');
  }
  showMenu() {
    this._hideMenus();
    this._hide2D();
    this.el.menu.classList.remove('hidden');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.add('hidden');
    this.el.help.classList.add('hidden');
    this.el.controlsModal.classList.add('hidden');
    this._helpByUser = false;
    this.setHintStrip(false);
  }
  /** The replay viewer: none of the game's HUD, help panel, hint strip or toast shows over it. */
  showReplay() {
    this.el.hud.classList.add('hidden');
    this.el.help.classList.add('hidden');
    this._helpByUser = false;
    this.setHintStrip(false);
    clearTimeout(this._toastTimer);
    $('toast').classList.remove('on');
  }
  /** The 3D board choice: the presets and the custom board, over the menu backdrop. */
  showBoardChoice() {
    this.showMenu();
    this._hideMenus();
    this.el.boardChoice.classList.remove('hidden');
  }
  /** The placeholder for an entry whose screen has not landed yet. */
  showComingSoon(title) {
    this.showMenu();
    this._hideMenus();
    this.el.comingSoonTitle.textContent = title;
    this.el.comingSoonText.textContent = `${title} is coming soon.`;
    this.el.comingSoon.classList.remove('hidden');
  }
  /** The records screen's place over the menu backdrop; the records view fills and shows #records. */
  showRecords() {
    this.showMenu();
    this._hideMenus();
  }
  /** The Settings page, over the menu backdrop; its bindings in the active controller's glyphs. */
  showSettings() {
    this.showMenu();
    this._hideMenus();
    this.el.settingsBindings.innerHTML = bindingsSectionHtml(this._glyphs);
    this.el.settings.classList.remove('hidden');
  }
  /** The Classic 2D board choice, over the menu backdrop. */
  showBoardChoice2D() {
    this.showMenu();
    this._hideMenus();
    this.el.c2dChoice.classList.remove('hidden');
  }
  /**
   * The Classic 2D board: the overlay bar without the 3D tools, and the board area filling the
   * window below it with --space-4 (16 px) margins.
   */
  showClassic2D() {
    this._hideMenus();
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this._setMode('classic-2d');
    this._syncHelp();
    this.el.hud.classList.add('hud--2d');
    this.el.hud.classList.remove('hidden');
    this.el.c2d.classList.remove('hidden');
    const bar = this.el.hud.querySelector('.ui-overlay-bar').getBoundingClientRect();
    this.el.c2dBoard.style.top = `${Math.round(bar.bottom) + 16}px`;
  }
  /** The Classic 2D board the overlay bar and the pause card name ("30 × 16 · no-guess"). */
  setBoard2D(board) { this._setBoardText(boardLine2D(board)); }
  _setBoardText(text) { this._boardText = text; this.el.size.textContent = text; }
  /** Classic 2D: the "generating" card of a slow first click, or a failed board and its offer. */
  setBoardStatus(status) { this._boardStatus('c2d', status); }
  /** 3D: the "generating" card of a slow first click, or a failed board and its offer, over the box. */
  setBoardStatus3D(status) { this._boardStatus('m3d', status); }
  /**
   * The generating card shows a spinner and Cancel; a failure shows the offer — Retry, Play a
   * standard board, Back to menu. Either card sits above the pause card.
   */
  _boardStatus(prefix, { generating = false, failure = null } = {}) {
    const on = generating || !!failure;
    const el = (name) => this.el[`${prefix}${name}`];
    el('Status').classList.toggle('hidden', !on);
    el('StatusTitle').textContent = failure ? 'No board found' : 'Generating the board…';
    el('StatusText').textContent = failure ? 'No no-guess board was found for this first click. Try again, or play a standard board of the same size.' : '';
    el('StatusText').classList.toggle('hidden', !failure);
    el('Spinner').classList.toggle('hidden', !!failure);
    el('Wait').classList.toggle('hidden', !!failure);
    el('Offer').classList.toggle('hidden', !failure);
  }
  /** The 3D ready card: its board, a message, and the "How 3D works" block while `rules` is set. */
  showReady(settings, msg = '', { rules = false } = {}) {
    this._hideMenus();
    this._hide2D();
    this._setMode('3d');
    this.el.pause.classList.add('hidden');
    this.el.ready.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.readyBoard.textContent = boardLine3D(settings, { mines: true });
    this.el.readyMsg.textContent = msg;
    this.el.readyRules.classList.toggle('hidden', !rules);
    this._syncHelp();
  }
  setReadyMessage(msg) { this.el.readyMsg.textContent = msg; }
  showPlaying() {
    this._hideMenus();
    this._hide2D();
    this._setMode('3d');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this._syncHelp();
  }
  _syncHelp() { if (!this._helpByUser) this.toggleHelp(false); }
  /**
   * The first-use hint strip of the shown mode, in the active device's names; on the 2D board it
   * takes room at the bottom. It steps aside while the help panel is open.
   */
  setHintStrip(on) {
    this._hint = !!on;
    if (on) this.el.hintStripText.innerHTML = hintStripHtml(this._mode, this._device, this._glyphs);
    this._showHint();
    this.el.c2d.classList.toggle('c2d--hint', this._hint && this._mode === 'classic-2d');
  }
  _showHint() { this.el.hintStrip.classList.toggle('hidden', !this._hint || !this.el.help.classList.contains('hidden')); }
  /** The hint strip's dismiss button (the shell keeps the dismissal for good). */
  dismissHint() {
    if (!this._hint) return;
    this.setHintStrip(false);
    this.cb.onDismissHint?.(this._mode);
  }
  /** Crosshair feedback: on = a cell is targeted. Touches the DOM only on change. */
  setCrosshair(on) {
    if (on === this._crossOn) return;
    this._crossOn = on;
    this.el.crosshair.classList.toggle('on', on);
    this.el.crosshair.classList.toggle('off', !on);
  }
  showPause({ state, time, minesLeft, note = '', mode = this._mode }) {
    this._setMode(mode);
    this._resetConfirm();
    const pn = $('pause-note');
    pn.textContent = note; pn.classList.toggle('hidden', !note);
    this._hideMenus();
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    const ended = state !== 'playing';
    // The primary action leads: Resume while playing, Play again once the game ended, which has nothing to resume.
    const [first, second] = ended ? [this.el.restart, this.el.resume] : [this.el.resume, this.el.restart];
    first.classList.replace('ui-button--secondary', 'ui-button--primary');
    second.classList.replace('ui-button--primary', 'ui-button--secondary');
    this.el.pauseActions.insertBefore(first, this.el.pauseMenu);
    this.el.pauseActions.insertBefore(second, this.el.pauseMenu);
    this.el.pauseTitle.textContent = state === 'won' ? 'You won!' : state === 'lost' ? 'Game over' : 'Paused';
    this.el.pauseSub.textContent = `Time ${fmtTime(time)} s · ${minesLeft} mine${minesLeft === 1 ? '' : 's'} left`;
    this.el.pauseBoard.textContent = this._boardText;
    // The look settings only on a 3D game's pause card; volume and Sound in both modes.
    for (const key of ['lookSensitivity', 'invertY']) this.el.pause.querySelector(`[data-setting="${key}"]`).classList.toggle('hidden', mode !== '3d');
    this.el.resume.classList.toggle('hidden', ended);
    this.el.restart.textContent = ended ? 'Play again' : 'Restart';
  }
  isPauseVisible() { return !this.el.pause.classList.contains('hidden'); }
  /** Ask on the pause card, in place of its actions: onYes on confirm, onNo on Cancel or Back. */
  showConfirm({ message, confirmLabel }, onYes, onNo) {
    this._confirm = { onYes, onNo };
    this.el.confirmText.textContent = message;
    this.el.confirmYes.textContent = confirmLabel;
    this.el.pauseActions.classList.add('hidden');
    this.el.confirm.classList.remove('hidden');
  }
  isConfirmOpen() { return this._confirm !== null && this.isPauseVisible(); }
  /** Cancel an open confirmation (Back); false when none is open. */
  closeConfirm() {
    if (!this.isConfirmOpen()) return false;
    this._closeConfirm('onNo');
    return true;
  }
  _closeConfirm(answer) {
    const c = this._confirm;
    this._resetConfirm();
    c?.[answer]?.();
  }
  _resetConfirm() {
    this._confirm = null;
    this.el.confirm.classList.add('hidden');
    this.el.pauseActions.classList.remove('hidden');
  }

  // ---------- HUD ----------
  /** The 3D board the overlay bar and the pause card name ("6 × 6 × 6 · no-guess"). */
  setBoard(settings) { this._setBoardText(boardLine3D(settings)); }
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
    this._muted = !!muted;
    this._renderHudStrip();
    $('menu-sound').textContent = `Sound: ${t}`;
    $('p-sound').textContent = `Sound: ${t}`;
  }
  toggleHelp(force) {
    clearTimeout(this._helpTimer);
    const show = force ?? this.el.help.classList.contains('hidden');
    if (show) this._renderHelp();
    this.el.help.classList.toggle('hidden', !show);
    this._showHint();
    return show;
  }
  /** H key (the controller's X in 3D) in game: toggle the help panel; remembered so screen changes keep it open. */
  userToggleHelp() {
    this._helpByUser = this.toggleHelp();
  }

  // ---------- bindings: the active mode and device ----------
  /** The active device ('keyboard' | 'controller'); every shown surface follows it. */
  setDevice(device) {
    if (device === this._device) return;
    this._device = device;
    this._renderBindings();
  }
  _setMode(mode) {
    if (mode === this._mode) return;
    this._mode = mode;
    this._renderBindings();
  }
  _note() {
    return this._device === 'controller' && this._mapping !== 'standard'
      ? ' <span class="pad-note">This controller does not report the standard layout, so some buttons may be unmapped.</span>' : '';
  }
  _renderHelp() {
    this.el.helpList.innerHTML = bindingsHtml(this._mode, this._device, this._glyphs);
    this.el.helpFoot.innerHTML = `${helpFootHtml(this._mode, this._device, this._glyphs)}${this._note()}`;
  }
  _renderHudStrip() {
    this.el.hudTools.innerHTML = hudStripHtml(this._mode, this._device, this._glyphs, { muted: this._muted });
  }
  /** Redraw every bindings surface for the active mode and device. */
  _renderBindings() {
    this._renderHelp();
    this._renderHudStrip();
    this.el.controlsBody.innerHTML = bindingsHtml(this._controlsTab, this._device, this._glyphs);
    this.el.pauseControls.innerHTML = bindingsHtml(this._mode, this._device, this._glyphs);
    if (this._hint) this.el.hintStripText.innerHTML = hintStripHtml(this._mode, this._device, this._glyphs);
    if (!this.el.settings.classList.contains('hidden')) this.el.settingsBindings.innerHTML = bindingsSectionHtml(this._glyphs);
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
   * The connected controller. info = { glyphs, mapping } of the active pad, or null when none is
   * connected. Its glyphs draw every controller binding shown; the ready card gains its hint.
   */
  setPad(info) {
    const ready = $('ready-pad');
    this._glyphs = info ? info.glyphs : GLYPHS.generic;
    this._mapping = info ? info.mapping : 'standard';
    this._renderBindings();
    if (!info) {
      ready.classList.add('hidden');
      return;
    }
    const g = info.glyphs;
    const k = (t) => `<kbd class="pad">${t}</kbd>`;
    const note = info.mapping !== 'standard'
      ? '<span class="pad-note">This controller does not report the standard layout, so some buttons may be unmapped.</span>' : '';
    ready.innerHTML = `<b>Controller:</b> ${k(g.a)} play · ${k(g.rt)} reveal · ${k(g.lt)} flag · both chord · ${k(g.start)} pause${note ? '<br>' + note : ''}`;
    ready.classList.remove('hidden');
  }

  flash() {
    const f = this.el.flash;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');
  }
}
