// DOM menus, HUD and overlays. No game rules here.
// Every help surface — the pause card, the Settings page's Controls panel, the H panel, the HUD strip,
// the hint strip and the main menu's key hints — is drawn from the bindings source
// (js/settings/bindings.js) for the active mode and the active device (the controller in the
// connected controller's glyphs).
import {
  formatOverlayTime, formatMineCount, mineCounterDigits, bindSegmented, segmentedState, showKeyHints, bindFigures, bindFiguresLive, setNote, setButtonIcon,
} from './ui/components.js';
import { GLYPHS } from './gamepad.js';
import { bindingsHtml, hudStripHtml, hintStripHtml, helpFootHtml, hintText, keyHintKeys, reminderKeys } from './settings/bindings.js';
import { settingsPageHtml, bindingsSectionHtml, bindResetPanel } from './settings/page.js';
import { DIM_MIN, DIM_MAX } from './mode3d/board-choice.js';
import { LEARN_TITLE, learnStepOf } from './mode3d/learn.js';
import { formatTime } from './results/view.js';
import { liveFigures, figuresLine } from './shell/live-figures.js';
import { standardBoard, preset3D, createBoardIdentity, MODE_3D } from './records/board.js';
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
/** The pause card's status line: the time and mines left, or mines left alone for a game with no timer (`timed` false: Learn 3D). */
export function pauseLine(time, minesLeft, { timed = true } = {}) {
  const mines = `${minesLeft} mine${minesLeft === 1 ? '' : 's'} left`;
  return timed ? `Time ${formatTime(Math.round(time * 1000))} · ${mines}` : mines;
}
const NO_GUESS = ' · no-guess';
/** A 3D board as the overlay bar, the ready card (with `mines`) and the pause card name it. */
export function boardLine3D(s, { mines = false } = {}) {
  const count = mines ? ` · ${s.mines} mine${s.mines === 1 ? '' : 's'}` : '';
  return `${fmtDims(s)}${count}${s.noGuess ? NO_GUESS : ''}`;
}
/** A Classic 2D board as the pause card names it. */
export const boardLine2D = (b) => `${b.width} × ${b.height}${b.noGuess ? NO_GUESS : ''}`;
/** The Classic 2D window's foot line: the board's size, mines and no-guess, never a cell ("16 × 16 · 40 mines · no-guess"). */
export const boardFoot2D = (b) => `${b.width} × ${b.height} · ${b.mines} mine${b.mines === 1 ? '' : 's'}${b.noGuess ? NO_GUESS : ''}`;
/** The Classic 2D window's title: the mode and the board — a standard board's name, a daily, or Custom. */
export function boardTitle2D(b) {
  const id = b.identity;
  const name = id?.daily ? 'Daily' : (id && standardBoard(id)?.name) || 'Custom';
  return `Classic 2D · ${name}`;
}
/**
 * The 3D overlay's title: the mode and the board — a cube preset's family and name, a daily, or
 * Custom ("3D · Cube Intermediate"); the guided board is "Learn 3D".
 */
export function boardTitle3D(s) {
  if (s.learn) return LEARN_TITLE;
  let preset = null;
  try { preset = !s.daily && preset3D(createBoardIdentity({ mode: MODE_3D, width: s.X, height: s.Y, depth: s.Z, mines: s.mines, noGuess: false })); } catch { /* a board no record can name: Custom */ }
  return `3D · ${s.daily ? 'Daily' : preset ? `${preset.family} ${preset.name}` : 'Custom'}`;
}
/** The title with the board dropped, the mode alone ("3D"), for a bar too narrow for the full name; a title with no board part is its own. */
export const shortTitle3D = (title) => title.split(' · ')[0];
/** What a figures panel's live part says when the game's counts change (js/shell/live-figures.js). */
export { figuresLine };

export const NO_MOUSE_MSG = 'Minesweeper 3D needs a mouse and keyboard — open it on a desktop browser.';
/** The menu's note on a coarse-only device, where both modes play by touch. */
export const TOUCH_MSG = 'Both modes play by touch: 3D and Classic 2D.';

export class UI {
  constructor(cb) {
    this.cb = cb; // { onMenuEntry, onBack, onReadyClick, onReadyDrag, onReadyBack, onReadyLearn, onLearnEnd, onLearnBack, onResume, onRestart, onMainMenu, onPause, onToggleSwap, onToggleTap, onDismissHint, onRetry2D, onStandard2D, onRetry3D, onStandard3D, onResetAll, onLayer, onTouchMode }
    this.el = {
      hud: $('hud'), time: $('hud-time'), mines: $('hud-mines'), clicks: $('hud-clicks'), hudTools: $('hud-tools'), hudSwap: $('hud-swap'), hudTap: $('hud-tap'),
      hudCounters: $('hud-counters'), hudFigures: $('hud-figures'), hudHead: $('hud-figures').querySelector('.ui-figures__head'), hudTitle: $('hud-title'),
      hudReminder: $('hud-reminder'),
      help: $('help'), helpList: $('help').querySelector('.controls'), helpFoot: $('help-foot'),
      hintStrip: $('hint-strip'), hintStripText: $('hint-strip-text'), hintStep: $('hint-strip-step'),
      readyRules: $('ready-rules'), pauseBoard: $('pause-board'), pauseControls: $('pause-controls'),
      controlsBody: $('controls-body'),
      flash: $('flash'), menu: $('menu'), ready: $('ready'), readyBoard: $('ready-board'), readyMsg: $('ready-msg'), readyBlocked: $('ready-blocked'),
      readyLearn: $('ready-learn'), hintClose: $('hint-strip-close'), timeStat: $('hud-time').closest('.ui-counter'),
      learnEnd: $('learn-end'), learnEndTitle: $('learn-end-title'), learnEndLine: $('learn-end-line'), learnEndPrimary: $('learn-end-primary'),
      learnEndPrimaryLabel: $('learn-end-primary-label'),
      boardChoice: $('board-choice'), comingSoon: $('coming-soon'), comingSoonTitle: $('coming-soon-title'),
      settings: $('settings'), settingsBindings: null, records: $('records'), daily: $('daily'),
      crosshair: $('crosshair'), crosshairArrow: $('crosshair-arrow'), aimReadout: $('aim-readout'), aimCubes: $('aim-cubes'), aimFlagPart: $('aim-flag-part'), aimFlags: $('aim-flags'),
      controlsModal: $('controls-modal'),
      pause: $('pause'), pauseTitle: $('pause-title'), pauseSub: $('pause-sub'),
      resume: $('p-resume'), home: $('p-home'), restart: $('p-restart'), restartLabel: $('p-restart').querySelector('[data-label]'), pauseMenu: $('p-menu'), pauseActions: $('pause-actions'),
      confirm: $('pause-confirm'), confirmTitle: $('pause-confirm-title'), confirmText: $('pause-confirm-text'), confirmYes: $('p-confirm-yes'),
      chipShift: $('chip-shift'), chipSpace: $('chip-space'), chipCtrl: $('chip-ctrl'),
      c2dChoice: $('c2d-choice'), c2d: $('c2d'), c2dBoard: $('c2d-board'), c2dPanel: $('c2d-panel'), c2dStatus: $('c2d-status'),
      c2dTitle: $('c2d-title'), c2dSize: $('c2d-size'), c2dMines: $('c2d-mines-left'), c2dTime: $('c2d-time'), c2dFigures: $('c2d-figures'),
      c2dReminder: $('c2d-reminder'),
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
    this._camera = 'fly'; // the Camera setting, whose 3D rows the bindings show: 'fly' | 'orbit'
    this._mapping = 'standard';
    this._muted = false;
    this._hint = false; // the hint strip shows
    this._controlsTab = 'classic-2d'; // the Controls panel's tab
    this._touch = false; // a coarse-only device: both modes play by touch, and every help surface speaks touch (`_bindDevice`)
    this._stick = ''; // the touch stick's place shown, '' while hidden
    this._boardText = '';
    this._learnHint = null; // the Learn 3D prompt the hint strip shows (js/mode3d/learn.js LEARN_HINTS), or null
    this._learnWon = false; // the Learn 3D end card's outcome
    this._timed = true; // the game shown has a timer (Learn 3D has none)

    // main menu entries: each a route (the shell decides where; a disabled entry opens nothing)
    document.querySelectorAll('#menu [data-entry]').forEach((b) => {
      b.addEventListener('click', () => { if (b.getAttribute('aria-disabled') !== 'true') cb.onMenuEntry?.(b.dataset.entry); });
    });
    for (const id of ['coming-soon-back', 'coming-soon-menu', 'settings-back']) $(id).addEventListener('click', () => cb.onBack?.());
    // The Settings page's controls are generated from the settings schema and bound by the shell.
    $('settings-body').innerHTML = settingsPageHtml();
    this.el.settingsBindings = $('settings-bindings');
    // Its bindings panel: one mode's list for one device, each picked by its choice; the device opens on the active one.
    this._settingsBind = { mode: 'classic-2d', device: 'keyboard' };
    bindSegmented($('set-bind-mode'), { horizontal: true, onChange: (mode) => { this._settingsBind.mode = mode; this._renderSettingsBindings(); } });
    bindSegmented($('set-bind-device'), { horizontal: true, onChange: (device) => { this._settingsBind.device = device; this._renderSettingsBindings(); } });
    // The Data panel's Reset all data, behind its confirmation; the shell runs the reset.
    this._reset = bindResetPanel({
      open: $('set-reset'), panel: $('set-reset-confirm'), yes: $('set-reset-yes'), no: $('set-reset-no'), note: $('set-reset-note'),
    }, { reset: () => cb.onResetAll?.() });
    // Controls panel (the Settings page's Controls action): Classic 2D and 3D tabs over the bindings component.
    bindSegmented($('controls-tabs'), { horizontal: true, onChange: (mode) => { this._controlsTab = mode; this._renderBindings(); } });
    this._renderBindings();
    $('set-controls').addEventListener('click', () => this.openControls());
    $('controls-close').addEventListener('click', () => this.closeControls());
    this.el.controlsModal.addEventListener('click', (e) => { if (e.target === this.el.controlsModal) this.closeControls(); });
    $('ready-back').addEventListener('click', () => cb.onReadyBack?.());
    $('hint-strip-close').addEventListener('click', () => this.dismissHint());
    $('ready-btn').addEventListener('click', () => cb.onReadyClick());
    $('ready-drag').addEventListener('click', () => cb.onReadyDrag?.());
    $('ready-learn-btn').addEventListener('click', () => cb.onReadyLearn?.());
    this.el.learnEndPrimary.addEventListener('click', () => cb.onLearnEnd?.(this._learnWon));
    $('learn-end-back').addEventListener('click', () => cb.onLearnBack?.());
    this.el.resume.addEventListener('click', () => cb.onResume());
    this.el.home.addEventListener('click', () => cb.onBackToStart?.());
    this.el.restart.addEventListener('click', () => cb.onRestart());
    $('p-menu').addEventListener('click', () => cb.onMainMenu());
    $('hud-pause').addEventListener('click', () => cb.onPause?.());
    $('c2d-pause').addEventListener('click', () => cb.onPause?.());
    // Restart in either mode's counter strip never takes focus, so Space and Enter keep playing.
    for (const id of ['c2d-restart', 'hud-restart']) {
      $(id).addEventListener('mousedown', (e) => e.preventDefault());
      $(id).addEventListener('click', () => cb.onRestartStrip?.());
    }
    // Each mode's counters and live figures: the Classic 2D window's, and the 3D overlay's.
    this._readouts2D = { time: this.el.c2dTime, mines: this.el.c2dMines, counter: this.el.c2dMines.closest('.ui-counter') };
    this._readouts3D = { time: this.el.time, mines: this.el.mines, counter: this.el.mines.closest('.ui-counter') };
    this._readouts = this._readouts3D; // the counters updateHud writes: the Classic 2D window's while it shows, else the 3D overlay's
    this._figures2D = bindFigures(this.el.c2dFigures);
    this._figuresLive2D = bindFiguresLive(this.el.c2dFigures);
    this._figures3D = bindFigures(this.el.hudFigures);
    this._figuresLive3D = bindFiguresLive(this.el.hudFigures);
    // The 3D title is refitted whenever its line changes width (the window, the panel, the fonts arriving).
    this._title3D = '';
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this._fitTitle3D()).observe(this.el.hudTitle);
    document.fonts?.ready.then(() => this._fitTitle3D());
    // The 3D touch toolbar: each button latches or clears its view mode; it never takes focus.
    for (const b of document.querySelectorAll('#touch-modes [data-mode]')) {
      b.addEventListener('mousedown', (e) => e.preventDefault());
      b.addEventListener('click', () => cb.onTouchMode?.(b.dataset.mode));
    }
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

  /** Show the "needs mouse and keyboard" banner on the menu; on a coarse-only device (`touch`) it says both modes play by touch. */
  setNoMouse(on, touch = false) {
    const note = $('touch-note');
    note.textContent = touch ? TOUCH_MSG : NO_MOUSE_MSG;
    note.classList.toggle('hidden', !on);
  }
  /**
   * On a coarse-only device both modes play by touch: the ready card reads "Tap to play" and lists the
   * touch gestures in place of the key list, its rules name the toolbar's Ctrl button and its Back shows
   * no key hint (the bindings source has none on touch), the help surfaces of either mode list its touch rows and
   * the clipped Classic 2D board's hint names the touch gestures.
   */
  setTouch3D(on) {
    this._touch = !!on;
    const btn = $('ready-btn');
    this.el.ready.classList.toggle('ready--touch', this._touch);
    btn.querySelector('.ready-title').textContent = this._touch ? 'Tap to play' : 'Click to play';
    this.el.ready.setAttribute('aria-label', this._touch ? 'Tap to play' : 'Click to play');
    this._renderBindings();
  }
  /** The touch toolbar's buttons show the latched view modes { shift, space, ctrl }. */
  setTouchModes(modes) {
    for (const b of document.querySelectorAll('#touch-modes [data-mode]')) b.setAttribute('aria-pressed', String(!!modes[b.dataset.mode]));
  }
  /** The touch stick under the thumb: { x0, y0, x, y } in scene pixels (base and knob), or null to hide it. */
  setStick(view) {
    const key = view ? `${view.x0},${view.y0},${view.x},${view.y}` : '';
    if (key === this._stick) return;
    this._stick = key;
    const el = $('touch-stick');
    el.classList.toggle('on', !!view);
    if (!view) return;
    el.style.transform = `translate(${view.x0}px, ${view.y0}px)`;
    $('touch-stick-knob').style.transform = `translate(${view.x - view.x0}px, ${view.y - view.y0}px)`;
  }

  /**
   * Disable main menu entry `id`, which cannot open here: aria-disabled, so it stays selectable and
   * its preview shows, its reason under its label and its lock shown; a click opens nothing.
   */
  setEntryUnavailable(id, reason) {
    const b = document.querySelector(`#menu [data-entry="${id}"]`);
    if (!b) return;
    b.setAttribute('aria-disabled', 'true');
    let line = b.querySelector('.ui-mode-entry__reason');
    if (!line) {
      line = document.createElement('span');
      line.className = 'ui-mode-entry__reason';
      b.querySelector('.ui-mode-entry__label').after(line);
    }
    line.textContent = reason;
  }

  /** Mark the main menu entry of the last mode played with the Last played chip (null: none). */
  setLastMode(mode) {
    document.querySelectorAll('#menu [data-entry]').forEach((b) => {
      const isLast = !!mode && b.dataset.entry === mode;
      b.toggleAttribute('data-last', isLast);
      b.querySelector('.ui-chip[data-last]')?.classList.toggle('hidden', !isLast);
    });
  }

  /** The main menu's build label. */
  setBuild(text) {
    $('menu-build').textContent = text;
  }

  // ---------- controls modal ----------
  /** Open the controls reference over the Settings page; closing it gives the focus back to what opened it. */
  openControls() {
    const opener = document.activeElement;
    this._controlsOpener = opener && opener !== document.body ? opener : null;
    this._renderBindings();
    this.el.controlsModal.classList.remove('hidden');
    this.cb.onLayer?.();
    $('controls-close').focus({ preventScroll: true });
  }
  /** Close the modal; the containment lifts before the control that opened it takes focus back. */
  closeControls() {
    if (this.el.controlsModal.classList.contains('hidden')) return false;
    this.el.controlsModal.classList.add('hidden');
    this.cb.onLayer?.();
    const back = this._controlsOpener?.isConnected ? this._controlsOpener : $('set-controls');
    this._controlsOpener = null;
    back.focus({ preventScroll: true });
    return true;
  }
  isControlsOpen() { return !this.el.controlsModal.classList.contains('hidden'); }

  // ---------- screens ----------
  /** Hide the menu screens (main menu, board choices, placeholder, records, settings) before another screen shows. */
  _hideMenus() {
    for (const el of [this.el.menu, this.el.boardChoice, this.el.comingSoon, this.el.records, this.el.c2dChoice, this.el.settings, this.el.daily]) el?.classList.add('hidden');
  }
  /** Hide the Classic 2D window and give the counters back to the 3D game's overlay. */
  _hide2D() {
    this.el.c2d.classList.add('hidden');
    this.el.hud.classList.remove('hud--2d');
    this._useReadouts(this._readouts3D);
    this._figuresLive2D.stop();
  }
  /** The counters updateHud writes from now on, each written afresh. */
  _useReadouts(readouts) {
    if (this._readouts === readouts) return;
    this._readouts = readouts;
    this._last = { time: '', mines: '', clicks: '' };
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
    this._figuresLive3D.stop();
  }
  /**
   * The replay viewer: none of the game's HUD, view chips, tools strip, help panel, hint strip or toast
   * shows over it, nor appears while it shows (body.replaying); hideReplay gives them back.
   */
  showReplay() {
    this._replaying = true;
    document.body.classList.add('replaying');
    this.el.hud.classList.add('hidden');
    this.el.help.classList.add('hidden');
    this._helpByUser = false;
    this.setHintStrip(false);
    clearTimeout(this._toastTimer);
    $('toast').classList.remove('on');
  }
  hideReplay() {
    this._replaying = false;
    document.body.classList.remove('replaying');
  }
  /** A 3D replay's press ring at x, y on the scene (CSS pixels), coloured by its action's kind; it expands and fades on its own. */
  replayRing(x, y, kind) {
    const ring = document.createElement('div');
    ring.className = `replay-ring replay-ring--${kind}`;
    ring.setAttribute('aria-hidden', 'true');
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    $('replay').append(ring);
    setTimeout(() => ring.remove(), 400);
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
    this.el.comingSoon.classList.remove('hidden');
  }
  /** The Daily screen over the menu backdrop; js/shell/daily.js fills its rows. */
  showDaily() {
    this.showMenu();
    this._hideMenus();
    this.el.daily.classList.remove('hidden');
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
    this._settingsBind.device = this._bindDevice(this._settingsBind.mode);
    this._renderSettingsBindings();
    this.el.settings.classList.remove('hidden');
  }
  /** The Settings page's bindings list for the mode and device its choices show. */
  _renderSettingsBindings() {
    const { mode, device } = this._settingsBind;
    for (const [id, value] of [['set-bind-mode', mode], ['set-bind-device', device]]) {
      const options = [...$(id).querySelectorAll('.ui-segmented__option')];
      segmentedState(options.length, options.findIndex((o) => o.dataset.value === value)).forEach((st, i) => {
        options[i].setAttribute('aria-checked', String(st.checked));
        options[i].tabIndex = st.tabIndex;
      });
    }
    this.el.settingsBindings.innerHTML = bindingsSectionHtml(this._glyphs, this._camera, { mode, device });
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
   * The Classic 2D game window: the head (Swap clicks, the title, Pause), the counter strip over the
   * board in its framed panel (placePanel2D), the live figures panel and the foot line; the 3D
   * overlay bar does not show over it.
   */
  showClassic2D() {
    this._hideMenus();
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this._setMode('classic-2d');
    this._syncHelp();
    this.el.hud.classList.add('hud--2d');
    this._useReadouts(this._readouts2D);
    this._figuresLive3D.stop();
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
   * The board's frame (the kit's ui-board-frame) at `rect` in the board area (board-view.js panelRect),
   * its corner radius `radius` CSS pixels, which the theme stylesheet reads as --board-frame-radius;
   * a null rect hides it (a clipped board has no frame).
   */
  placePanel2D(rect, radius = 0) {
    const panel = this.el.c2dPanel;
    if (!rect) { panel.classList.add('hidden'); this._centreStatus2D(); return; }
    Object.assign(panel.style, { left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    panel.style.setProperty('--board-frame-radius', `${radius}px`);
    panel.classList.remove('hidden');
    this._centreStatus2D(); // the board area moved or resized: the status card follows its column
  }
  /** The Classic 2D board the window's title and foot line and the pause card name; { width, height, mines, noGuess, identity }. */
  setBoard2D(board) { this._board2D(board); this._sizeMines(board.mines, this.el.c2dMines); }
  _board2D(board) {
    this._boardText = boardLine2D(board);
    this.el.c2dTitle.textContent = boardTitle2D(board);
    this.el.c2dSize.textContent = boardFoot2D(board);
  }
  /**
   * A mine counter as wide as a board's mine count past three digits, so it does not shift as it
   * falls; a board of up to 999 mines keeps the standard counter.
   */
  _sizeMines(mines, el = this.el.mines) {
    const digits = mineCounterDigits(mines);
    el.style.minWidth = digits > 3 ? `${digits}ch` : '';
  }
  /**
   * A mode's live figures (js/shell/live-figures.js) from the game's counts and the board's bests
   * read at the game's start: on a change every figure whose text changed and the live part's line;
   * on the timer's second (`tick`) only the figures that take the time. updateFigures2D writes the
   * Classic 2D window's panel, updateFigures3D the 3D overlay's.
   */
  updateFigures2D(input, { tick = false, bests = null } = {}) { this._showFigures(this._figures2D, this._figuresLive2D, input, tick, bests); }
  updateFigures3D(input, { tick = false, bests = null } = {}) { this._showFigures(this._figures3D, this._figuresLive3D, input, tick, bests); }
  _showFigures(panel, live, input, tick, bests) {
    const figures = liveFigures({ ...input, bests });
    panel.show(figures, tick ? ['pace', 'rate'] : null);
    if (!tick) live.announce(figuresLine(figures));
  }
  /** Classic 2D: the "generating" card of a slow first click, or a failed board and its offer. */
  setBoardStatus(status) { this._boardStatus('c2d', status); }
  /** 3D: the "generating" card of a slow first click, or a failed board and its offer, over the box. */
  setBoardStatus3D(status) { this._boardStatus('m3d', status); }
  /**
   * The generating card shows a progress line under its title ("candidate 14 · 6 s", from
   * `progress` { candidates, seconds }), a spinner, Cancel and Play a standard board; a failure
   * shows the offer — Retry, Play a standard board, Main menu; a failure offering nothing (a daily's or
   * a challenge's board, never replaced by another) says so and shows Back alone, with the arrow icon,
   * and while `forced` the generating card offers no standard board. Either card sits above the pause
   * card; the Classic 2D one is centred on the board column.
   */
  _boardStatus(prefix, { generating = false, failure = null, progress = null, forced = false } = {}) {
    const on = generating || !!failure;
    const el = (name) => this.el[`${prefix}${name}`];
    el('Status').classList.toggle('hidden', !on);
    const line = generating && !failure && progress ? progressLine(progress) : '';
    el('Progress').textContent = line;
    el('Progress').classList.toggle('hidden', !line);
    const fixed = !!failure && Array.isArray(failure.offers) && failure.offers.length === 0;
    el('StatusTitle').textContent = failure ? 'No board found' : 'Generating the board…';
    el('StatusText').textContent = !failure ? ''
      : fixed ? 'No no-guess board was found for this board code. It is never replaced by another board.'
        : 'No no-guess board was found for this first click. Try again, or play a standard board of the same size.';
    $(`${prefix}-retry`).classList.toggle('hidden', fixed);
    $(`${prefix}-standard`).classList.toggle('hidden', fixed);
    const menu = $(`${prefix}-offer-menu`);
    menu.textContent = fixed ? 'Back' : 'Main menu';
    setButtonIcon(menu, fixed ? 'arrow-left' : null);
    $(`${prefix}-wait-standard`).classList.toggle('hidden', !!forced); // a forced board is never swapped for a standard one
    el('StatusText').classList.toggle('hidden', !failure);
    el('Spinner').classList.toggle('hidden', !!failure);
    el('Wait').classList.toggle('hidden', !!failure);
    el('Offer').classList.toggle('hidden', !failure);
    if (prefix === 'c2d') this._centreStatus2D();
  }
  /** The Classic 2D status card centred on the board column (#c2d-main) while it shows; the stylesheet's window centre otherwise. */
  _centreStatus2D() {
    const card = this.el.c2dStatus;
    if (card.classList.contains('hidden')) return;
    const r = this.el.c2d.classList.contains('hidden') ? null : $('c2d-main')?.getBoundingClientRect();
    const placed = !!r && r.width > 0 && r.height > 0;
    card.style.left = placed ? `${r.left + r.width / 2}px` : '';
    card.style.top = placed ? `${r.top + r.height / 2}px` : '';
  }
  /**
   * The 3D ready card: its board, a message, the "How 3D works" block while `rules` is set, the
   * Learn 3D line while `learn` is set, and the drag-to-look and controller offer
   * while the browser blocks pointer lock (`blocked`). The guided board (`settings.learn`) is named
   * "Learn 3D".
   */
  showReady(settings, msg = '', { rules = false, blocked = false, learn = false } = {}) {
    this._hideMenus();
    this._hide2D();
    this._setMode('3d');
    this.el.pause.classList.add('hidden');
    this.el.ready.classList.remove('hidden', 'ready--pending');
    this.el.hud.classList.remove('hidden');
    this.el.readyBoard.textContent = settings.learn ? LEARN_TITLE : boardLine3D(settings, { mines: true });
    setNote(this.el.readyMsg, msg).classList.toggle('hidden', !msg);
    this.el.readyRules.classList.toggle('hidden', !rules);
    this.el.readyLearn.classList.toggle('hidden', !learn);
    this.el.readyBlocked.classList.toggle('hidden', !blocked);
    this._syncHelp();
    this._fitTitle3D();
  }
  /**
   * The ready card waits unseen (`ready--pending`) while a pointer-lock request the player's own
   * click or key made is answered: a granted lock enters play with no card shown; the next
   * showReady (a refusal's message) shows it.
   */
  setReadyPending(on) { this.el.ready.classList.toggle('ready--pending', !!on); }
  setReadyMessage(msg) { setNote(this.el.readyMsg, msg).classList.toggle('hidden', !msg); }
  showPlaying() {
    this._hideMenus();
    this._hide2D();
    this._setMode('3d');
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.hud.classList.remove('hidden');
    this._syncHelp();
    this._fitTitle3D();
  }
  _syncHelp() { if (!this._helpByUser) this.toggleHelp(false); }
  /**
   * The first-use hint strip of the shown mode, in the active device's names — or, with `scroll`,
   * the one-time hint beside a clipped Classic 2D board, or, with `learn`, a Learn 3D prompt (its
   * hint name in the bindings source) after its step ("1 / 4", the four steps only) and with no close
   * button; on the 2D board it takes room at the
   * bottom. It steps aside while the help panel is open.
   */
  setHintStrip(on, { scroll = false, learn = null } = {}) {
    this._hint = !!on;
    this._hintKind = on && learn ? 'learn' : on && scroll ? 'scroll' : 'mode';
    this._learnHint = on && learn ? learn : null;
    const step = on && learn ? learnStepOf(learn) : null;
    this.el.hintStep.textContent = step ?? '';
    this.el.hintStep.classList.toggle('hidden', !step);
    if (on) {
      if (learn) this.el.hintStripText.textContent = this.hint(learn);
      else {
        this.el.hintStripText.innerHTML = scroll ? hintText('scrollHint', this._bindDevice(this._mode), this._glyphs)
          : hintStripHtml(this._mode, this._bindDevice(this._mode), this._glyphs);
      }
    }
    this.el.hintClose.classList.toggle('hidden', this._hintKind === 'learn');
    this._showHint();
    this.el.c2d.classList.toggle('c2d--hint', this._hint && this._mode === 'classic-2d');
  }
  _showHint() { this.el.hintStrip.classList.toggle('hidden', !this._hint || !this.el.help.classList.contains('hidden')); }
  /** The hint strip's dismiss button (the shell keeps the dismissal for good). */
  dismissHint() {
    if (!this._hint || this._hintKind === 'learn') return;
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
    this.el.pauseSub.textContent = pauseLine(time, minesLeft, { timed: this._timed });
    this.el.pauseBoard.textContent = this._boardText;
    // The look settings only on a 3D game's pause card; volume and Sound in both modes.
    for (const key of ['lookSensitivity', 'invertY']) this.el.pause.querySelector(`[data-setting="${key}"]`).classList.toggle('hidden', mode !== '3d');
    this.el.resume.classList.toggle('hidden', ended);
    this.el.home.classList.toggle('hidden', ended || mode !== '3d'); // back to the 3D start view, while the box is in play
    this.el.restartLabel.textContent = ended ? 'Play again' : 'Restart';
  }
  /** The pause card's status line while it shows: the game's running time and mines left. */
  updatePause({ time, minesLeft }) {
    const line = pauseLine(time, minesLeft, { timed: this._timed });
    if (this.el.pauseSub.textContent !== line) this.el.pauseSub.textContent = line;
  }
  /**
   * The Learn 3D end card over the guided board's stopped scene, under its "Learn 3D" section label: on
   * a win "You cleared the box!", the line offering Cube Intro and Play Cube Intro, on a loss "That cube
   * was a mine." with Try again (its "Learn 3D" line hidden, the label carrying it); Back to board choice
   * on both, and no time.
   */
  showLearnEnd(won) {
    this._learnWon = !!won;
    this._hideMenus();
    this.el.ready.classList.add('hidden');
    this.el.pause.classList.add('hidden');
    this.el.learnEndTitle.textContent = won ? 'You cleared the box!' : 'That cube was a mine.';
    this.el.learnEndLine.textContent = won ? 'Ready for a real board? Cube Intro is a 6 × 6 × 6 box with 10 mines, a timer and records.' : 'Learn 3D';
    this.el.learnEndLine.classList.toggle('hidden', !won);
    this.el.learnEndPrimaryLabel.textContent = won ? 'Play Cube Intro' : 'Try again';
    this.el.learnEnd.classList.remove('hidden');
  }
  hideLearnEnd() { this.el.learnEnd.classList.add('hidden'); }
  isPauseVisible() { return !this.el.pause.classList.contains('hidden'); }
  /** Ask on the pause card, in place of its actions: onYes on confirm, onNo on Cancel or Back. */
  showConfirm({ title, message, confirmLabel }, onYes, onNo) {
    this._confirm = { onYes, onNo };
    this.el.confirmTitle.textContent = title;
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
  /**
   * The 3D board the overlay's title ("3D · Cube Intermediate", boardTitle3D) and the pause card
   * ("6 × 6 × 6 · no-guess") name; `daily` marks a daily's board.
   */
  setBoard(settings) {
    this._boardText = settings.learn ? LEARN_TITLE : boardLine3D(settings);
    this._setTitle3D(boardTitle3D(settings));
    this._sizeMines(settings.mines);
  }
  /** The overlay's title: the full name as its tooltip and accessible name, the text fitted to its line. */
  _setTitle3D(title) {
    this._title3D = title;
    this.el.hudTitle.setAttribute('title', title);
    this.el.hudTitle.setAttribute('aria-label', title);
    this._fitTitle3D();
  }
  /**
   * The title drops the board (shortTitle3D) when the full name does not fit on its one line in the
   * panel's bar — measured, so it follows the window; a title not laid out (hidden) keeps the full name.
   */
  _fitTitle3D() {
    const el = this.el.hudTitle;
    const full = this._title3D;
    if (!full) return;
    if (el.textContent !== full) el.textContent = full;
    if (el.clientWidth > 0 && el.scrollWidth > el.clientWidth) el.textContent = shortTitle3D(full);
  }
  /**
   * The bottom of the 3D overlay's top row: the counter strip, with the title bar when it sits at the
   * top too (a phone); a touch below it is the scene's.
   */
  overlayBottom3D() {
    const strip = this.el.hudCounters.getBoundingClientRect();
    const head = this.el.hudHead.getBoundingClientRect();
    return head.height > 0 && head.top <= strip.bottom ? Math.max(strip.bottom, head.bottom) : strip.bottom;
  }
  /** The 3D overlay's timer and the figures that take the time, shown unless the game has none (Learn 3D); the pause card follows it. */
  setTimed(on) {
    this._timed = !!on;
    this.el.timeStat.classList.toggle('hidden', !this._timed);
    this.el.hudFigures.classList.toggle('hud-figures--untimed', !this._timed);
  }
  /**
   * The counters: the display formats clamp (timer at 999, counter at -99); `time` itself is
   * never clamped. `clicks` is the game's counted clicks, wasted included; without it the readout
   * stays as it is. Each readout is written only when its text changes.
   */
  updateHud(time, minesLeft, clicks) {
    const el = this._readouts ?? this.el;
    const t = formatOverlayTime(time), m = formatMineCount(minesLeft);
    if (t !== this._last.time) { el.time.textContent = t; this._last.time = t; }
    if (m !== this._last.mines) {
      el.mines.textContent = m; this._last.mines = m;
      el.mines.classList.toggle('negative', minesLeft < 0);
      el.counter?.toggleAttribute('data-negative', minesLeft < 0);
    }
    if (Number.isFinite(clicks) && el.clicks) {
      const c = String(clicks);
      if (c !== this._last.clicks) { el.clicks.textContent = c; this._last.clicks = c; }
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
    this._muted = !!muted;
    this._renderHudStrip();
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
  /** The Camera setting ('fly' | 'orbit'): the 3D rows and the ready card's movement line follow it. */
  setCamera(camera) {
    if (camera === this._camera) return;
    this._camera = camera;
    for (const el of this.el.ready.querySelectorAll('[data-camera]')) el.classList.toggle('hidden', el.dataset.camera !== camera);
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
  /** A one-time hint's or Learn 3D prompt's text (js/settings/bindings.js HINT_TEXT) for the device the help surfaces speak for. */
  hint(name) {
    return hintText(name, this._bindDevice(this._mode), this._glyphs);
  }
  /** The device a help surface of `mode` speaks for: on a touch device, touch unless a controller is in use. */
  _bindDevice(mode) {
    return this._touch && this._device === 'keyboard' ? 'touch' : this._device;
  }
  _renderHelp() {
    this.el.helpList.innerHTML = bindingsHtml(this._mode, this._bindDevice(this._mode), this._glyphs, this._camera);
    this.el.helpFoot.innerHTML = `${helpFootHtml(this._mode, this._bindDevice(this._mode), this._glyphs)}${this._note()}`;
  }
  /** Each figures panel's controls reminder: its mode's main bindings for the active device. */
  _renderReminder() {
    const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    for (const [el, mode] of [[this.el.c2dReminder, 'classic-2d'], [this.el.hudReminder, '3d']]) {
      el.innerHTML = reminderKeys(mode, this._bindDevice(mode), this._glyphs).map(({ keys, label }) => {
        const caps = keys.map((k) => `<kbd class="ui-key-hint__key">${esc(k.text)}</kbd>`).join('+');
        return `<span class="ui-key-hint${keys.every((k) => k.pad) ? ' ui-key-hint--pad' : ''}">${caps}<span class="ui-key-hint__label">${esc(label)}</span></span>`;
      }).join('');
    }
  }
  /** The HUD strip; one with no entries (Classic 2D on touch) hides its panel. */
  _renderHudStrip() {
    const html = hudStripHtml(this._mode, this._bindDevice(this._mode), this._glyphs, { muted: this._muted, spacing: this._spacing });
    this.el.hudTools.innerHTML = html;
    this.el.hudTools.classList.toggle('hidden', !html);
  }
  /** Redraw every bindings surface for the active mode and device. */
  _renderBindings() {
    for (const id of ['menu-hints', 'c2d-choice', 'c2d', 'hud', 'board-choice', 'pause', 'coming-soon', 'results', 'records', 'settings', 'replay', 'ready', 'learn-end', 'ctx-lost']) showKeyHints($(id), (action) => keyHintKeys(action, this._bindDevice(this._mode), this._glyphs));
    this._renderReminder();
    this._renderHelp();
    this._renderHudStrip();
    this.el.controlsBody.innerHTML = bindingsHtml(this._controlsTab, this._bindDevice(this._controlsTab), this._glyphs, this._camera);
    this.el.pauseControls.innerHTML = bindingsHtml(this._mode, this._bindDevice(this._mode), this._glyphs, this._camera);
    if (this._hint) this.setHintStrip(true, { scroll: this._hintKind === 'scroll', learn: this._learnHint });
    if (!this.el.settings.classList.contains('hidden')) this._renderSettingsBindings();
  }

  /** Short global notice (e.g. "Controller connected") in the toast's text, its icon kept; none while the replay viewer shows. */
  toast(msg, ms = 2200) {
    if (this._replaying) return;
    const t = $('toast');
    $('toast-text').textContent = msg;
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
