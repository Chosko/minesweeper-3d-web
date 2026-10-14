// DOM menus, HUD and overlays. No game rules here.
// Every help surface — the pause card, the main menu's Controls panel, the H panel, the HUD strip
// and the hint strip — is drawn from the bindings source (js/settings/bindings.js) for the active
// mode and the active device (the controller in the connected controller's glyphs).
import { formatOverlayTime, formatMineCount, mineCounterDigits, bindSegmented } from './ui/components.js';
import { GLYPHS } from './gamepad.js';
import { bindingsHtml, hudStripHtml, hintStripHtml, helpFootHtml, hintText } from './settings/bindings.js';
import { settingsPageHtml, bindingsSectionHtml, bindResetPanel } from './settings/page.js';
import { DIM_MIN, DIM_MAX } from './mode3d/board-choice.js';
import { formatTime } from './results/view.js';
import { readoutText } from './readability.js';

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
/** The generating card's progress line: the worker's candidates tried so far and the whole seconds since the click. */
export const progressLine = ({ candidates, seconds }) => `candidate ${candidates} · ${seconds} s`;

/** The pause card's status line, its time (seconds) in the results time format: "Time 11.643 s · 12 mines left". */
export const pauseLine = (time, minesLeft) => `Time ${formatTime(Math.round(time * 1000))} · ${minesLeft} mine${minesLeft === 1 ? '' : 's'} left`;
const NO_GUESS = ' · no-guess';
/**
 * The Classic 2D panel's frame: its 1 px border and the --space-2 (8 px) inside it, around the
 * board and around the overlay readouts on its top edge, with --space-2 between the readouts and
 * the board.
 */
export const PANEL_INSET = 9;
export const PANEL_GAP = 8;
/** A 3D board as the overlay bar, the ready card (with `mines`) and the pause card name it. */
export function boardLine3D(s, { mines = false } = {}) {
  const count = mines ? ` · ${s.mines} mine${s.mines === 1 ? '' : 's'}` : '';
  return `${fmtDims(s)}${count}${s.noGuess ? NO_GUESS : ''}`;
}
/** A Classic 2D board as the overlay bar and the pause card name it. */
export const boardLine2D = (b) => `${b.width} × ${b.height}${b.noGuess ? NO_GUESS : ''}`;

export const NO_MOUSE_MSG = 'Minesweeper 3D needs a mouse and keyboard — open it on a desktop browser.';
/** The menu's note on a coarse-only device, where Classic 2D plays by touch. */
export const TOUCH_MSG = 'Minesweeper 3D needs a mouse and keyboard — Classic 2D plays by touch.';

export class UI {
  constructor(cb) {
    this.cb = cb; // { onMenuEntry, onMenuPlayAgain, onBack, onReadyClick, onReadyDrag, onReadyBack, onResume, onRestart, onMainMenu, onPause, onToggleSwap, onToggleTap, onToggleSound, onDismissHint, onRetry2D, onStandard2D, onRetry3D, onStandard3D, onResetAll, onLayer }
    this.el = {
      hud: $('hud'), time: $('hud-time'), mines: $('hud-mines'), clicks: $('hud-clicks'), size: $('hud-size'), hudTools: $('hud-tools'), hudSwap: $('hud-swap'), hudTap: $('hud-tap'),
      help: $('help'), helpList: $('help').querySelector('.controls'), helpFoot: $('help-foot'),
      hintStrip: $('hint-strip'), hintStripText: $('hint-strip-text'),
      readyRules: $('ready-rules'), pauseBoard: $('pause-board'), pauseControls: $('pause-controls'),
      controlsBody: $('controls-body'),
      flash: $('flash'), menu: $('menu'), ready: $('ready'), readyBoard: $('ready-board'), readyMsg: $('ready-msg'), readyBlocked: $('ready-blocked'),
      boardChoice: $('board-choice'), comingSoon: $('coming-soon'), comingSoonTitle: $('coming-soon-title'),
      settings: $('settings'), settingsBindings: null, records: $('records'),
      comingSoonText: $('coming-soon-text'),
      crosshair: $('crosshair'), crosshairArrow: $('crosshair-arrow'), aimReadout: $('aim-readout'), aimCubes: $('aim-cubes'), aimFlagPart: $('aim-flag-part'), aimFlags: $('aim-flags'),
      controlsModal: $('controls-modal'),
      pause: $('pause'), pauseTitle: $('pause-title'), pauseSub: $('pause-sub'),
      resume: $('p-resume'), home: $('p-home'), restart: $('p-restart'), pauseMenu: $('p-menu'), pauseActions: $('pause-actions'),
      confirm: $('pause-confirm'), confirmText: $('pause-confirm-text'), confirmYes: $('p-confirm-yes'),
      chipShift: $('chip-shift'), chipSpace: $('chip-space'), chipCtrl: $('chip-ctrl'),
      c2dChoice: $('c2d-choice'), c2d: $('c2d'), c2dBoard: $('c2d-board'), c2dPanel: $('c2d-panel'), c2dStatus: $('c2d-status'),
      hudBar: $('hud').querySelector('.hud-bar'),
      c2dStatusTitle: $('c2d-status-title'), c2dStatusText: $('c2d-status-text'), c2dOffer: $('c2d-offer'),
      c2dSpinner: $('c2d-spinner'), c2dWait: $('c2d-wait'), c2dProgress: $('c2d-progress'),
      m3dStatus: $('m3d-status'), m3dStatusTitle: $('m3d-status-title'), m3dStatusText: $('m3d-status-text'), m3dOffer: $('m3d-offer'),
      m3dSpinner: $('m3d-spinner'), m3dWait: $('m3d-wait'), m3dProgress: $('m3d-progress'),
    };
    this._last = { time: '', mines: '', clicks: '' };
    this._helpTimer = 0;
    this._helpByUser = false; // in-game help panel opened with H
    this._crossOn = null;
    this._arrow = null; // the off-screen arrow's angle shown, or null while hidden
    this._readout = ''; // the aimed-cell readout's text shown, '' while hidden
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
    // the menu's Play again: the last board played, started in one step (the shell decides how)
    $('menu-again').addEventListener('click', () => cb.onMenuPlayAgain?.());
    for (const id of ['coming-soon-back', 'settings-back']) $(id).addEventListener('click', () => cb.onBack?.());
    // The Settings page's controls are generated from the settings schema and bound by the shell.
    $('settings-body').innerHTML = settingsPageHtml();
    this.el.settingsBindings = $('settings-bindings');
    // The Data panel's Reset all data, behind its confirmation; the shell runs the reset.
    this._reset = bindResetPanel({
      open: $('set-reset'), panel: $('set-reset-confirm'), yes: $('set-reset-yes'), no: $('set-reset-no'), note: $('set-reset-note'),
    }, { reset: () => cb.onResetAll?.() });
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
    $('ready-drag').addEventListener('click', () => cb.onReadyDrag?.());
    this.el.resume.addEventListener('click', () => cb.onResume());
    this.el.home.addEventListener('click', () => cb.onBackToStart?.());
    this.el.restart.addEventListener('click', () => cb.onRestart());
    $('p-menu').addEventListener('click', () => cb.onMainMenu());
    $('hud-pause').addEventListener('click', () => cb.onPause?.());
    // The swap toggle never takes focus, so the board's cursor keys (Space, Enter) keep playing.
    this.el.hudSwap.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.hudSwap.addEventListener('click', () => cb.onToggleSwap?.());
    this.el.hudTap.addEventListener('mousedown', (e) => e.preventDefault());
    this.el.hudTap.addEventListener('click', () => cb.onToggleTap?.());
    $('c2d-retry').addEventListener('click', () => cb.onRetry2D?.());
    $('c2d-standard').addEventListener('click', () => cb.onStandard2D?.());
    $('c2d-cancel').addEventListener('click', () => cb.onCancel2D?.());
    $('c2d-wait-standard').addEventListener('click', () => cb.onStandard2D?.());
    $('c2d-offer-menu').addEventListener('click', () => cb.onOfferMenu2D?.());
    $('m3d-retry').addEventListener('click', () => cb.onRetry3D?.());
    $('m3d-standard').addEventListener('click', () => cb.onStandard3D?.());
    $('m3d-cancel').addEventListener('click', () => cb.onCancel3D?.());
    $('m3d-wait-standard').addEventListener('click', () => cb.onStandardWait3D?.());
    $('m3d-offer-menu').addEventListener('click', () => cb.onOfferMenu3D?.());
    this._confirm = null; // { onYes, onNo } while the pause card's confirmation is open
    this.el.confirmYes.addEventListener('click', () => this._closeConfirm('onYes'));
    $('p-confirm-no').addEventListener('click', () => this._closeConfirm('onNo'));
  }

  /** Show the "needs mouse and keyboard" banner on the menu; on a coarse-only device (`touch`) it says Classic 2D plays by touch. */
  setNoMouse(on, touch = false) {
    const note = $('touch-note');
    note.textContent = touch ? TOUCH_MSG : NO_MOUSE_MSG;
    note.classList.toggle('hidden', !on);
  }
  /** On a coarse-only device the 3D ready card is a notice with one Back action, not a button. */
  setNotice3D(on) {
    $('ready-btn').classList.toggle('hidden', !!on);
    $('ready-notice').classList.toggle('hidden', !on);
  }

  /**
   * Disable main menu entry `id`, which this browser cannot run: its reason shows under its label
   * in place of its detail line; mouse, keyboard, controller and shell navigation pass it by.
   */
  setEntryUnavailable(id, reason) {
    const b = document.querySelector(`[data-entry="${id}"]`);
    if (!b) return;
    b.disabled = true;
    const detail = b.querySelector('.ui-menu__detail:not([data-last])');
    if (detail) detail.textContent = reason;
  }

  /** Mark the main menu entry of the last mode played (null: none). */
  setLastMode(mode) {
    document.querySelectorAll('[data-entry]').forEach((b) => {
      const isLast = !!mode && b.dataset.entry === mode;
      b.toggleAttribute('data-last', isLast);
      b.querySelector('[data-last]')?.classList.toggle('hidden', !isLast);
    });
  }

  /**
   * The main menu's returning-player surfaces over the last board played: the session strip under
   * the entries and Play again in the title row, each hidden when its text is null.
   */
  setReturning({ strip = null, again = null } = {}) {
    const line = $('menu-strip');
    const button = $('menu-again');
    line.textContent = strip ?? '';
    line.classList.toggle('hidden', !strip);
    button.textContent = again ?? 'Play again';
    button.classList.toggle('hidden', !again);
  }

  // ---------- controls modal ----------
  openControls() {
    this._renderBindings();
    this.el.controlsModal.classList.remove('hidden');
    this.cb.onLayer?.();
    $('controls-close').focus({ preventScroll: true });
  }
  /** Close the modal; the containment lifts before the menu's Controls button takes focus back. */
  closeControls() {
    if (this.el.controlsModal.classList.contains('hidden')) return false;
    this.el.controlsModal.classList.add('hidden');
    this.cb.onLayer?.();
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
    this.el.hudBar.style.left = '';
    this.el.hudBar.style.top = '';
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
    this._reset.clear(); // left with its confirmation open: it opens closed
    this.el.settingsBindings.innerHTML = bindingsSectionHtml(this._glyphs);
    this.el.settings.classList.remove('hidden');
  }
  /** Close the Settings page's Reset all data confirmation (Back); false when none is open. */
  closeResetConfirm() {
    if (this.el.settings.classList.contains('hidden')) return false;
    return this._reset.close();
  }
  /** The Classic 2D board choice, over the menu backdrop. */
  showBoardChoice2D() {
    this.showMenu();
    this._hideMenus();
    this.el.c2dChoice.classList.remove('hidden');
  }
  /**
   * The Classic 2D board: the board area fills the window with --space-4 (16 px) margins, and the
   * board sits in a framed panel there whose top edge carries the overlay readouts (time, mines,
   * clicks, board, Pause) — the overlay bar, without the 3D tools, placed by placePanel2D.
   */
  showClassic2D() {
    this._hideMenus();
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this._setMode('classic-2d');
    this._syncHelp();
    this.el.hud.classList.add('hud--2d');
    this.el.hud.classList.remove('hidden');
    this.el.hudSwap.classList.remove('hidden');
    this.el.hudTap.classList.remove('hidden');
    this.el.c2d.classList.remove('hidden');
  }
  /** The Classic 2D mouse button swap's toggle: pressed while the swap is on. */
  setSwap(on) { this.el.hudSwap.setAttribute('aria-pressed', on ? 'true' : 'false'); }
  /** The Reveal / Flag switch (coarse pointers only, by the stylesheet): pressed while a tap flags. */
  setTapMode(mode) {
    const flag = mode === 'flag';
    this.el.hudTap.setAttribute('aria-pressed', flag ? 'true' : 'false');
    this.el.hudTap.textContent = flag ? 'Tap: Flag' : 'Tap: Reveal';
  }
  /**
   * The room the panel's frame takes around the board (js/classic2d/board-view.js frame): the
   * readouts and the gap above it, the inset on every side, and at least the readouts' width.
   */
  panelFrame2D() {
    const bar = this.el.hudBar.getBoundingClientRect();
    return {
      top: PANEL_INSET + Math.ceil(bar.height) + PANEL_GAP,
      right: PANEL_INSET,
      bottom: PANEL_INSET,
      left: PANEL_INSET,
      minWidth: Math.ceil(bar.width) + 2 * PANEL_INSET,
    };
  }
  /** The panel at `rect` in the board area (board-view.js panelRect), its readouts on its top edge. */
  placePanel2D(rect) {
    const panel = this.el.c2dPanel;
    Object.assign(panel.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    panel.classList.remove('hidden');
    const area = this.el.c2dBoard.getBoundingClientRect();
    this.el.hudBar.style.left = `${Math.round(area.left + rect.x + PANEL_INSET)}px`;
    this.el.hudBar.style.top = `${Math.round(area.top + rect.y + PANEL_INSET)}px`;
  }
  /** The Classic 2D board the overlay bar and the pause card name ("30 × 16 · no-guess"). */
  setBoard2D(board) { this._setBoardText(boardLine2D(board)); this._sizeMines(board.mines); }
  _setBoardText(text) { this._boardText = text; this.el.size.textContent = text; }
  /**
   * The mine counter as wide as a board's mine count past three digits, so the bar does not shift
   * as it falls; a board of up to 999 mines keeps today's counter.
   */
  _sizeMines(mines) {
    const digits = mineCounterDigits(mines);
    this.el.mines.style.minWidth = digits > 3 ? `${digits}ch` : '';
  }
  /** Classic 2D: the "generating" card of a slow first click, or a failed board and its offer. */
  setBoardStatus(status) { this._boardStatus('c2d', status); }
  /** 3D: the "generating" card of a slow first click, or a failed board and its offer, over the box. */
  setBoardStatus3D(status) { this._boardStatus('m3d', status); }
  /**
   * The generating card shows a progress line under its title ("candidate 14 · 6 s", from
   * `progress` { candidates, seconds }), a spinner, Cancel and Play a standard board; a failure
   * shows the offer — Retry, Play a standard board, Main menu. Either card sits above the pause card.
   */
  _boardStatus(prefix, { generating = false, failure = null, progress = null } = {}) {
    const on = generating || !!failure;
    const el = (name) => this.el[`${prefix}${name}`];
    el('Status').classList.toggle('hidden', !on);
    const line = generating && !failure && progress ? progressLine(progress) : '';
    el('Progress').textContent = line;
    el('Progress').classList.toggle('hidden', !line);
    el('StatusTitle').textContent = failure ? 'No board found' : 'Generating the board…';
    el('StatusText').textContent = failure ? 'No no-guess board was found for this first click. Try again, or play a standard board of the same size.' : '';
    el('StatusText').classList.toggle('hidden', !failure);
    el('Spinner').classList.toggle('hidden', !!failure);
    el('Wait').classList.toggle('hidden', !!failure);
    el('Offer').classList.toggle('hidden', !failure);
  }
  /**
   * The 3D ready card: its board, a message, the "How 3D works" block while `rules` is set, and
   * the drag-to-look and controller offer while the browser blocks pointer lock (`blocked`).
   */
  showReady(settings, msg = '', { rules = false, blocked = false } = {}) {
    this._hideMenus();
    this._hide2D();
    this._setMode('3d');
    this.el.pause.classList.add('hidden');
    this.el.ready.classList.remove('hidden', 'ready--pending');
    this.el.hud.classList.remove('hidden');
    this.el.readyBoard.textContent = boardLine3D(settings, { mines: true });
    this.el.readyMsg.textContent = msg;
    this.el.readyRules.classList.toggle('hidden', !rules);
    this.el.readyBlocked.classList.toggle('hidden', !blocked);
    this._syncHelp();
  }
  /**
   * The ready card waits unseen (`ready--pending`) while a pointer-lock request the player's own
   * click or key made is answered: a granted lock enters play with no card shown; the next
   * showReady (a refusal's message) shows it.
   */
  setReadyPending(on) { this.el.ready.classList.toggle('ready--pending', !!on); }
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
   * The first-use hint strip of the shown mode, in the active device's names — or, with `scroll`,
   * the one-time hint beside a clipped Classic 2D board; on the 2D board it takes room at the
   * bottom. It steps aside while the help panel is open.
   */
  setHintStrip(on, { scroll = false } = {}) {
    this._hint = !!on;
    this._hintKind = on && scroll ? 'scroll' : 'mode';
    if (on) {
      this.el.hintStripText.innerHTML = scroll ? hintText('scrollHint', this._device, this._glyphs)
        : hintStripHtml(this._mode, this._device, this._glyphs);
    }
    this._showHint();
    this.el.c2d.classList.toggle('c2d--hint', this._hint && this._mode === 'classic-2d');
  }
  _showHint() { this.el.hintStrip.classList.toggle('hidden', !this._hint || !this.el.help.classList.contains('hidden')); }
  /** The hint strip's dismiss button (the shell keeps the dismissal for good). */
  dismissHint() {
    if (!this._hint) return;
    const kind = this._hintKind;
    this.setHintStrip(false);
    this.cb.onDismissHint?.(this._mode, kind);
  }
  /** Crosshair feedback: on = a cell is targeted. Touches the DOM only on change. */
  setCrosshair(on) {
    if (on === this._crossOn) return;
    this._crossOn = on;
    this.el.crosshair.classList.toggle('on', on);
    this.el.crosshair.classList.toggle('off', !on);
  }
  /**
   * The off-screen arrow on the crosshair ring: `angle` in radians on screen (0 = right, PI/2 = up)
   * toward the box, or null to hide it. Touches the DOM only on change.
   */
  setArrow(angle) {
    if (angle === this._arrow) return;
    this._arrow = angle;
    const el = this.el.crosshairArrow;
    el.classList.toggle('hidden', angle === null);
    if (angle !== null) el.style.transform = `rotate(${-angle}rad)`;
  }
  /**
   * The aimed-cell readout beside the crosshair: `r` from readability.js's aimReadout, or null to hide
   * it. Touches the DOM only on change.
   */
  setReadout(r) {
    const text = readoutText(r);
    if (text === this._readout) return;
    this._readout = text;
    this.el.aimReadout.classList.toggle('hidden', !r);
    if (!r) return;
    this.el.aimCubes.textContent = String(r.closed + r.flags);
    this.el.aimFlagPart.classList.toggle('hidden', !(r.flags > 0));
    this.el.aimFlags.textContent = String(r.flags);
  }
  /** The readout's text while it shows, '' while hidden. */
  get readout() { return this._readout; }
  showPause({ state, time, minesLeft, note = '', mode = this._mode }) {
    this._setMode(mode);
    this._resetConfirm();
    const pn = $('pause-note');
    pn.textContent = note; pn.classList.toggle('hidden', !note);
    this._hideMenus();
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.remove('hidden');
    this.el.hud.classList.remove('hidden');
    this.el.hudSwap.classList.add('hidden'); // on the board only while it plays
    this.el.hudTap.classList.add('hidden');
    const ended = state !== 'playing';
    // The primary action leads: Resume while playing, Play again once the game ended, which has nothing to resume.
    const [first, second] = ended ? [this.el.restart, this.el.resume] : [this.el.resume, this.el.restart];
    first.classList.replace('ui-button--secondary', 'ui-button--primary');
    second.classList.replace('ui-button--primary', 'ui-button--secondary');
    this.el.pauseActions.insertBefore(first, this.el.pauseMenu);
    this.el.pauseActions.insertBefore(this.el.home, this.el.pauseMenu);
    this.el.pauseActions.insertBefore(second, this.el.pauseMenu);
    this.el.pauseTitle.textContent = state === 'won' ? 'You won!' : state === 'lost' ? 'Game over' : 'Paused';
    this.el.pauseSub.textContent = pauseLine(time, minesLeft);
    this.el.pauseBoard.textContent = this._boardText;
    // The look settings only on a 3D game's pause card; volume and Sound in both modes.
    for (const key of ['lookSensitivity', 'invertY']) this.el.pause.querySelector(`[data-setting="${key}"]`).classList.toggle('hidden', mode !== '3d');
    this.el.resume.classList.toggle('hidden', ended);
    this.el.home.classList.toggle('hidden', ended || mode !== '3d'); // back to the 3D start view, while the box is in play
    this.el.restart.textContent = ended ? 'Play again' : 'Restart';
  }
  /** The pause card's status line while it shows: the game's running time and mines left. */
  updatePause({ time, minesLeft }) {
    const line = pauseLine(time, minesLeft);
    if (this.el.pauseSub.textContent !== line) this.el.pauseSub.textContent = line;
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
  setBoard(settings) { this._setBoardText(boardLine3D(settings)); this._sizeMines(settings.mines); }
  /**
   * Overlay bar readouts: the display formats clamp (timer at 999, counter at -99); `time` itself is
   * never clamped. `clicks` is the game's counted clicks, wasted included; without it the readout
   * stays as it is. Each readout is written only when its text changes.
   */
  updateHud(time, minesLeft, clicks) {
    const t = formatOverlayTime(time), m = formatMineCount(minesLeft);
    if (t !== this._last.time) { this.el.time.textContent = t; this._last.time = t; }
    if (m !== this._last.mines) {
      this.el.mines.textContent = m; this._last.mines = m;
      this.el.mines.classList.toggle('negative', minesLeft < 0);
    }
    if (Number.isFinite(clicks)) {
      const c = String(clicks);
      if (c !== this._last.clicks) { this.el.clicks.textContent = c; this._last.clicks = c; }
    }
  }
  setModes(shift, space, ctrl) {
    this.el.chipShift.classList.toggle('on', shift);
    this.el.chipSpace.classList.toggle('on', space);
    this.el.chipCtrl.classList.toggle('on', ctrl);
  }
  /** The cube spacing the 3D tools strip shows, to one decimal. */
  setSpacing(v) {
    if (v.toFixed(1) === this._spacing?.toFixed(1)) return;
    this._spacing = v;
    this._renderHudStrip();
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
    this.el.hudTools.innerHTML = hudStripHtml(this._mode, this._device, this._glyphs, { muted: this._muted, spacing: this._spacing });
  }
  /** Redraw every bindings surface for the active mode and device. */
  _renderBindings() {
    this._renderHelp();
    this._renderHudStrip();
    this.el.controlsBody.innerHTML = bindingsHtml(this._controlsTab, this._device, this._glyphs);
    this.el.pauseControls.innerHTML = bindingsHtml(this._mode, this._device, this._glyphs);
    if (this._hint) this.setHintStrip(true, { scroll: this._hintKind === 'scroll' });
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
   * connected. Its glyphs draw every controller binding shown and every [data-pad-glyph] slot (the
   * Records screen's LB / RB and LT / RT hints); the ready card gains its hint.
   */
  setPad(info) {
    const ready = $('ready-pad');
    this._glyphs = info ? info.glyphs : GLYPHS.generic;
    this._mapping = info ? info.mapping : 'standard';
    this._renderBindings();
    for (const el of document.querySelectorAll('[data-pad-glyph]')) el.textContent = this._glyphs[el.dataset.padGlyph];
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
