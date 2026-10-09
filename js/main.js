// Entry point: wires game logic, renderer, input and UI together.
import * as THREE from 'three';
import { Game, createGameFromMinePositions } from './logic.js';
import { BoardRenderer } from './render.js';
import { FlyCamera, MouseActions, Input, SPACING_MIN, SPACING_MAX, SPACING_START } from './input.js';
import { pickCell, pickCellBrute } from './picking.js';
import { UI, clampSettings, recordBest, fmtTime, NO_MOUSE_MSG } from './ui.js';
import * as audio from './audio.js';
import { Controls } from './controls.js';
import { GamepadReader, BTN, Repeat, stickCurve, padGlyphs, pickInDirection } from './gamepad.js';
import { createRouter } from './shell/router.js';
import { FOCUSABLE, topLayer, resolveFocus, isBackKey, backButtons, createHeldSuppressor } from './shell/navigation.js';
import { createModeHost } from './shell/mode-host.js';
import { create3DMode } from './shell/mode-3d.js';
import { createMenu, createLastMode } from './shell/menu.js';
import { createPauseController } from './shell/pause.js';
import { storage } from './platform/index.js';
import { createSettingsStore } from './settings/store.js';
import { createRecordsStore } from './records/store.js';
import { applySettings, pixelRatioFor } from './settings/appliers.js';
import { bindSettingControls } from './settings/page.js';
import { createClassic2DMode } from './classic2d/mode.js';
import { bindBoardChoice } from './classic2d/board-choice.js';
import { createLastChoice, DEFAULT_CHOICE } from './classic2d/board-setup.js';

const canvas = document.getElementById('scene');

function fatal(msg) {
  const d = document.createElement('div');
  d.className = 'fatal';
  d.innerHTML = `<div><h2 style="margin-top:0">Cannot start Minesweeper 3D</h2><p>${msg}</p></div>`;
  document.body.appendChild(d);
}

let renderer;
try {
  renderer = new BoardRenderer(canvas);
} catch (err) {
  console.error(err);
  fatal('This game needs WebGL 2. Please try an up-to-date browser, or enable hardware acceleration.');
  throw err;
}

const sfx = audio.sfx ?? new audio.Sfx();
const cam = new FlyCamera();

// Pointer lock / input device support
const LOCK_SUPPORTED = 'requestPointerLock' in Element.prototype;
const COARSE_ONLY = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches);
const NO_MOUSE = !LOCK_SUPPORTED || COARSE_ONLY;
// S.mode is the router's current screen: 'menu' | 'board-choice' | 'coming-soon' | 'classic-2d-choice' | 'settings' | 'ready' |
// 'playing' | 'classic-2d' | 'paused' | 'ctxlost' (defined below).
const S = {
  settings: null,
  game: null,
  demo: null,
  spacing: SPACING_START,
  selected: -1,
  started: false,
  time: 0,
  endState: null, // frozen { state, time, minesLeft } once the game is over
  pickKey: '',
  orbit: 0,
  lockless: false, // playing without pointer lock (controller session, or the debug hook)
};

// ---------- actions ----------
function hasSelection() { return S.selected >= 0 && S.game && S.mode === 'playing'; }
function onAction(type) {
  const g = S.game;
  if (!g || S.selected < 0) return;
  const before = g.state;
  const minesBefore = g.minesLeft; // original froze the HUD text from the frame before the final action
  const sel = S.selected;
  const v0 = g.version;
  if (type !== 'right') renderer.snapshotBeforeAction(); // lets the renderer show wrong flags + reveal wave on a loss
  if (type === 'left') {
    if (!S.started) { S.started = true; S.time = 0; mode3d.gameStarted(); }
    const r = g.leftClick(sel);
    if (r.exploded) boom();
    else if (r.revealed > 0) sfx.reveal(r.revealed);
  } else if (type === 'right') {
    const r = g.rightClick(sel);
    if (r.flagged || r.unflagged) sfx.flag(r.flagged >= r.unflagged, r.flagged + r.unflagged);
    if (padActing && (r.flagged || r.unflagged)) padRumble(PAD_TICK);
  } else if (type === 'chord') {
    const r = g.chord(sel);
    if (r.exploded) boom();
    else if (r.revealed > 0) sfx.chord(r.revealed);
  }
  if (g.version === v0 && before === 'playing' && g.state === 'playing' && typeof sfx.noop === 'function') sfx.noop(); // action changed nothing
  if (before === 'playing' && g.state !== 'playing') { endGame(minesBefore); afterEndGame(); }
}
/** Best-time bookkeeping after endGame (kept outside endGame, which the visuals code also touches). */
function afterEndGame() {
  const g = S.game;
  if (!g || g.state !== 'won' || !S.started) return;
  const r = recordBest(S.settings, S.time);
  if (r.isNew) ui.setBannerRecord(r.prev === null ? 'New record!' : `New record! (previous ${fmtTime(r.prev)} s)`, true);
  else ui.setBannerRecord(`Best ${fmtTime(r.best)} s`);
}
function boom() { sfx.explode(); ui.flash(); padRumble(PAD_BOOM); }
function endGame(minesLeft) {
  const g = S.game;
  S.endState = { state: g.state, time: S.time, minesLeft };
  if (g.state === 'won') sfx.win();
  ui.showBanner(g.state, S.time);
  mode3d.gameEnded();
}

const mouse = new MouseActions(onAction, hasSelection);
const input = new Input({
  canvas,
  mouse,
  isActive: () => S.mode === 'playing',
  onLook: (dx, dy) => cam.look(dx, dy),
  onWheel: (notches) => { setSpacing(S.spacing + notches * 0.04); ui.showSpacing(S.spacing); },
  onKey: (code, e) => {
    if (isBackKey(code)) { shellBack('key'); return; }
    if (S.mode !== 'playing' && S.mode !== 'paused' && S.mode !== 'ready') return;
    // don't steal keys typed into settings controls (e.g. arrow keys on a slider)
    if (e && e.target && e.target.closest && e.target.closest('input, select, textarea')) return;
    if (code === 'KeyH') ui.userToggleHelp();
    else if (code === 'KeyM') toggleSound();
    else if (code === 'KeyF') toggleFullscreen();
  },
  onLockChange: (locked) => {
    if (locked) {
      if (S.mode === 'ready' || S.mode === 'paused') enterPlaying();
    } else if (S.mode === 'playing' && !S.lockless) {
      PAUSE.pause('key'); // the browser's own Esc released the lock
    }
  },
  onLockError: () => {
    if (S.mode === 'paused' || S.mode === 'ready') {
      let msg;
      if (NO_MOUSE) msg = NO_MOUSE_MSG;
      else if (performance.now() - input.unlockedAt < 1500) msg = 'The browser needs a moment before locking the mouse again. Click once more.';
      else msg = 'Could not capture the mouse. Click once more.';
      SHELL.go('ready', { data: { msg } });
    }
  },
});
const controls = new Controls(input); // keyboard + controller view modes, controller move axes

// Fullscreen + Keyboard Lock (where supported) so Ctrl+W/Ctrl+S etc. reach the game instead of the browser.
const LOCK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'];
// The fullscreen setting's applier calls these; F flips the setting.
function enterFullscreen() {
  const d = document;
  const el = d.documentElement;
  if (!el.requestFullscreen) return Promise.reject(new Error('fullscreen is not supported'));
  return el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
    navigator.keyboard?.lock?.(LOCK_KEYS).catch(() => {});
    if (S.mode === 'playing' && !S.lockless && !d.pointerLockElement) input.requestLock();
  });
}
function exitFullscreen() { return document.exitFullscreen?.(); }
function toggleFullscreen() { SETTINGS.set('fullscreen', !document.fullscreenElement); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) navigator.keyboard?.unlock?.(); });

function setSpacing(s) { S.spacing = Math.min(SPACING_MAX, Math.max(SPACING_MIN, s)); }
function toggleSound() { SETTINGS.set('muted', !SETTINGS.get('muted')); }

// ---------- screens ----------
// Clicks made with the controller (A) are not user gestures for pointer lock: they enter lockless play.
const ui = new UI({
  onMenuEntry: (id) => MENU.open(id),
  onBack: () => shellBack('pointer'),
  onStart: (s) => { sfx.unlock(); MODES.start('3d', s); },
  onReadyClick: () => { sfx.unlock(); if (padGesture) padResume(); else input.requestLock(); },
  onResume: () => PAUSE.resume(padGesture ? 'pad' : 'pointer'),
  onRestart: () => PAUSE.restart(padGesture ? 'pad' : 'pointer'),
  onMainMenu: () => PAUSE.toMenu(),
  onPause: () => PAUSE.pause(padGesture ? 'pad' : 'button'),
  onReadyBack: () => readyBack(),
  onToggleSound: () => toggleSound(),
  onRetry2D: () => mode2d.retry(),
  onStandard2D: () => mode2d.playStandard(),
});
ui.setNoMouse(NO_MOUSE);

// ---------- settings ----------
// The store loads before the first screen shows; each setting's owner applies it by subscribing.
const SETTINGS = createSettingsStore({
  storage,
  onNotKept: () => ui.toast('Settings cannot be saved in this browser — changes last until you close the game.', 4000),
});
const settingsLoaded = SETTINGS.load();
applySettings(SETTINGS, {
  theme: globalThis.msTheme,
  sfx: typeof sfx.setVolume === 'function' ? sfx : null,
  camera: cam,
  resolution: () => applyPixelRatio(),
  fullscreen: { doc: document, enter: enterFullscreen, exit: exitFullscreen },
});
SETTINGS.onChange('muted', (m) => ui.setSound(m));
// Every setting control — the Settings page, the pause card's shortcuts, the menu's volume — is bound to the store.
bindSettingControls(document.querySelectorAll('[data-setting]'), SETTINGS, {
  onUserChange: (key) => { if (key === 'volume' || key === 'muted') sfx.unlock?.(); },
});

// ---------- screen router ----------
// Every screen change goes through SHELL; each screen declares its default focus and its Back.
const SHELL = createRouter({
  screens: {
    menu: { defaultFocus: '[data-entry][data-last]', show: () => { MODES.leave(); showMenuBackdrop(); ui.showMenu(); } },
    'board-choice': { defaultFocus: '[data-preset][data-last]', show: () => { MODES.leave(); showMenuBackdrop(); ui.showBoardChoice(); } },
    'coming-soon': { defaultFocus: '#coming-soon-back', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showComingSoon(d.title ?? 'This screen'); } },
    settings: { defaultFocus: '#set-lookSensitivity', show: () => { MODES.leave(); showMenuBackdrop(); ui.showSettings(); } },
    'classic-2d-choice': { defaultFocus: '[data-size][data-last]', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showBoardChoice2D(); showChoice2D(d.choice ?? LAST_CHOICE_2D.current); } },
    ready: { defaultFocus: '#ready-btn', show: (d = {}) => ui.showReady(S.settings, d.msg ?? ''), back: () => readyBack() },
    playing: { defaultFocus: null, show: (d = {}) => { setLockless(!!d.lockless); ui.showPlaying(); endIfDecided(); }, back: ({ source }) => PAUSE.pause(source === 'pointer' ? 'button' : source) },
    'classic-2d': { defaultFocus: null, show: () => ui.showClassic2D(), back: ({ source }) => PAUSE.pause(source === 'pointer' ? 'button' : source) },
    paused: { defaultFocus: () => (ui.isConfirmOpen() ? '#p-confirm-no' : gameOver() ? '#p-restart' : '#p-resume'), show: (d = {}) => { stopPlayInput(); setBoardHidden(true); ui.showPause(pauseInfo(d.note)); }, hide: () => setBoardHidden(false), back: ({ source }) => resumeFromPause(source) },
    ctxlost: { defaultFocus: '#ctx-lost-btn', show: () => showContextLost(), hide: () => hideContextLost(), back: () => showMainMenu() },
  },
  focus: (target, name) => focusScreen(target, name),
  onChange: () => { layerChanged(); needRender = true; },
});
// end of screen table
Object.defineProperty(S, 'mode', { get: () => SHELL.current, enumerable: true });

// ---------- mode host ----------
// The shell reaches a game only through MODES; the 3D game is registered through its adapter.
const MODES = createModeHost();
let contextLost = false;
const FLOW_3D = {
  openBoardChoice: () => SHELL.go('board-choice'), // the 3D presets and custom board
  start: (settings) => startGame(settings),
  pause: (note) => showPauseCard(note),
  resume: (source) => resumeGame(source),
  restart: (source) => { startGame(S.settings); if (source === 'pad') padResume(); else input.requestLock(); }, // entered as resume enters play
  leave: () => leaveGame(),
  snapshot: () => ({ settings: S.settings, started: S.started, time: S.time, endState: S.endState }),
  contextLost: () => contextLost,
};
// end of 3D flow
const mode3d = MODES.register('3d', (report) => create3DMode(FLOW_3D, report));
// Classic 2D: the mode drives its own board; the shell hands it the board area, the overlay bar and
// its screens. The last board choice is a platform-storage document.
const LAST_CHOICE_2D = createLastChoice({ storage });
const FLOW_2D = {
  openBoardChoice: (choice) => SHELL.go('classic-2d-choice', { data: { choice } }),
  show: () => SHELL.go('classic-2d'),
  container: () => document.getElementById('c2d-board'),
  hud: ({ seconds, minesLeft }) => ui.updateHud(seconds, minesLeft),
  board: ({ width, height }) => ui.setBoardText(`${width} × ${height}`),
  generating: (shown) => { board2d.generating = shown; ui.setBoardStatus(board2d); },
  failed: (failure) => {
    board2d.failure = failure;
    ui.setBoardStatus(board2d);
    if (failure) document.getElementById('c2d-retry').focus({ preventScroll: true });
  },
};
const board2d = { generating: false, failure: null };
const mode2d = MODES.register('classic-2d', (report) => createClassic2DMode(report, { flow: FLOW_2D, lastChoice: LAST_CHOICE_2D }));
/** The board choice on `choice`; the default choice of a player who never played is not "last played". */
function showChoice2D(choice) { CHOICE_2D.show(choice, { played: choice !== DEFAULT_CHOICE }); }
const CHOICE_2D = bindBoardChoice({
  root: document.getElementById('c2d-choice'),
  onStart: (choice) => { sfx.unlock(); MODES.start('classic-2d', choice); },
  onBack: () => shellBack('pointer'),
});
MODES.on('failed', ({ screen }) => SHELL.go(screen ?? 'menu'));

// ---------- pause controller ----------
// The one owner of pause, resume, restart and back to menu, and of the game hand-offs.
const PAUSE = createPauseController({
  modes: MODES,
  router: SHELL,
  showCard: ({ note }) => showPauseCard(note),
  isPaused: () => S.mode === 'paused',
  onBoard: () => S.mode === 'playing' || S.mode === 'classic-2d',
  confirm: (request, proceed) => { ui.showConfirm(request, proceed, () => SHELL.refocus()); SHELL.refocus(); },
  goMenu: () => showMainMenu(),
  guard: (on) => (on ? window.addEventListener('beforeunload', guardLeave) : window.removeEventListener('beforeunload', guardLeave)),
});
window.addEventListener('blur', () => PAUSE.pause('blur'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') PAUSE.pause('hidden'); });
window.addEventListener('pagehide', () => PAUSE.pageHide());

// ---------- personal records ----------
// The records store loads before the first screen, settling a game the last launch closed on, and
// keeps every abandoned game and the game in progress through the pause controller's hand-offs.
const RECORDS = createRecordsStore({
  storage,
  onNotSaved: () => ui.toast('Records cannot be saved in this browser — this session\'s games will not be kept.', 4000),
});
const recordsLoaded = RECORDS.load();
RECORDS.attach(PAUSE);

// ---------- main menu ----------
// Each entry is a route; the last mode played is kept through platform storage and marked on the menu.
const MENU = createMenu({ router: SHELL, modes: MODES });
const LAST_MODE = createLastMode({ storage, modes: MODES });
MODES.on('started', ({ mode }) => ui.setLastMode(mode));

/** Back from the keyboard (Esc) or the controller: the topmost layer first, then the router. */
function shellBack(source) {
  if (ui.closeControls() || ui.closeConfirm()) return;
  SHELL.back(source);
}
/** Back from the pause card: the controller resumes; the keyboard goes to the click-to-play card. */
function resumeFromPause(source) {
  if (source === 'pad') { padResume(); return; }
  if (performance.now() - input.unlockedAt < 500) return; // the Esc that released the pointer lock already meant Pause
  PAUSE.resume('key');
}
/** The 3D resume: a controller enters lockless play; otherwise the click-to-play card, which takes pointer lock. */
function resumeGame(source) {
  if (source === 'pad') { sfx.unlock(); enterPlaying(true); return; }
  SHELL.go('ready');
  if (source === 'pointer') input.requestLock();
}

/** Leave the ready screen: a fresh board goes back to the 3D board choice; a game in progress opens the pause menu. */
function readyBack() {
  if (S.mode !== 'ready') return;
  if (S.game && S.started) PAUSE.pause('key');
  else SHELL.go('board-choice');
}

/** The render resolution setting's pixel ratio for the board shown (n cells; Auto: big boards are fill/vertex heavy). */
let boardCells = 0;
function applyPixelRatio(n = boardCells) {
  boardCells = n;
  const pr = pixelRatioFor(SETTINGS.get('renderResolution'), window.devicePixelRatio, n);
  if (renderer.setPixelRatio(pr)) needRender = true;
}

function startGame(settings) {
  const s = clampSettings(settings);
  let g;
  if (settings.minePositions) g = createGameFromMinePositions(s.X, s.Y, s.Z, settings.minePositions);
  else g = new Game(s.X, s.Y, s.Z, s.mines);
  S.settings = { X: s.X, Y: s.Y, Z: s.Z, mines: g.mines };
  S.game = g;
  S.started = false;
  S.time = 0;
  S.endState = null;
  S.selected = -1;
  S.pickKey = '';
  S.spacing = SPACING_START;
  mouse.reset();
  renderer.setGame(g);
  applyPixelRatio(g.n);
  cam.reset(...startCameraPos(s.X, s.Y, s.Z));
  ui.hideBanner();
  ui.setBoard(S.settings);
  ui.updateHud(0, g.minesLeft);
  SHELL.go('ready', { data: { msg: NO_MOUSE ? NO_MOUSE_MSG : '' } });
  needRender = true;
}

/**
 * Start camera. Original: camera (0, 10, -8M), grid centre at s=1.1 is (0.2X-3.2, 0.2Y-3.2, 0.2Z-3.2)
 * (M = max(X,Y,Z)). The port centres the grid on the origin, so the camera is shifted by minus that
 * centre. No snapping: the start view must equal the original's, even if it isn't aimed at a cell.
 */
function startCameraPos(X, Y, Z) {
  const M = Math.max(X, Y, Z);
  return [3.2 - 0.2 * X, 13.2 - 0.2 * Y, -8 * M + 3.2 - 0.2 * Z];
}

function setLockless(on) { S.lockless = on; document.body.classList.toggle('lockless', on); }

/** The ready card hands over to play; resuming from the pause card unwinds back to play. */
function enterPlaying(lockless = false) {
  SHELL.go('playing', { data: { lockless }, replace: SHELL.current === 'ready' });
}
/** A board full of mines is won before the first click: run the end flow once. */
function endIfDecided() {
  const g = S.game;
  if (g && g.state !== 'playing' && !S.endState) { endGame(g.minesLeft); afterEndGame(); }
}

/** The pause card: pointer lock released, the card shown once. */
function showPauseCard(note = '') {
  input.exitLock();
  if (SHELL.current !== 'paused') SHELL.go('paused', { data: { note } });
}
/** While the pause card shows the board is hidden, in every mode. */
function setBoardHidden(on) {
  canvas.style.visibility = on ? 'hidden' : '';
  if (MODES.active === 'classic-2d') mode2d.hideBoard(on);
}
/** Whether the active game is over (the pause card then leads with Play again). */
function gameOver() {
  if (MODES.active === 'classic-2d') return mode2d.status()?.state !== 'playing';
  return !!S.game && S.game.state !== 'playing';
}
function stopPlayInput() {
  mouse.reset();
  controls.releasePad();
  document.body.classList.remove('lockless');
}
function pauseInfo(note = '') {
  if (MODES.active === 'classic-2d') return { ...mode2d.status(), note };
  const g = S.game;
  const e = S.endState;
  return { state: g.state, time: e ? e.time : S.time, minesLeft: e ? e.minesLeft : g.minesLeft, note };
}

function makeDemo() {
  const g = new Game(7, 7, 7, 30);
  // reveal a few safe cells on the outer shell and flag a few mines, purely decorative
  const shell = (idx) => {
    const [i, j, k] = g.coords(idx);
    return i === 0 || j === 0 || k === 0 || i === 6 || j === 6 || k === 6;
  };
  for (let t = 0; t < 400 && g.unpressedCount > g.n * 0.55; t++) {
    const idx = Math.floor(Math.random() * g.n);
    if (shell(idx) && g.number[idx] > 0 && !g.pressed[idx]) g.leftClick(idx);
  }
  let flags = 0;
  for (let idx = 0; idx < g.n && flags < 8; idx++) if (g.number[idx] === -1 && shell(idx) && Math.random() < 0.5) { g.rightClick(idx); flags++; }
  return g;
}

function showMainMenu() { SHELL.go('menu'); }
/** The menu screens show the decorative demo board behind them. */
const BACKDROP_SCREENS = new Set(['menu', 'board-choice', 'coming-soon', 'classic-2d-choice', 'settings']);
function onBackdrop() { return BACKDROP_SCREENS.has(S.mode); }
/** The 3D leave: drop the game and release pointer lock and lockless play. */
function leaveGame() {
  input.exitLock();
  setLockless(false);
  S.game = null;
  ui.hideBanner();
}
/** Put the decorative demo board behind the menu. */
function showMenuBackdrop() {
  if (!S.demo) S.demo = makeDemo();
  renderer.setGame(S.demo);
  applyPixelRatio(S.demo.n);
  renderer.setSelected(-1);
  S.spacing = 1.25;
}

window.addEventListener('resize', () => { renderer.resize(); needRender = true; });
let reloading = false;
/**
 * The leave-page guard, armed by the pause controller only during a started, unfinished game:
 * Ctrl is a game key, and Ctrl+W cannot be intercepted.
 */
function guardLeave(e) {
  if (reloading) return;
  e.preventDefault();
  e.returnValue = '';
}

// WebGL context loss: keep the page, offer a reload or the menu. In a 3D game it is the mode's failure.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  contextLost = true;
  if (MODES.active === '3d') mode3d.contextLost();
  else SHELL.go('ctxlost');
});
/** Dead canvas: leave every game mode (so lock changes/keys can't resume) and disable other overlays. */
function showContextLost() {
  mouse.reset();
  input.exitLock();
  for (const id of ['pause', 'ready', 'menu', 'board-choice', 'coming-soon', 'settings', 'c2d-choice', 'c2d', 'controls-modal']) {
    const el = document.getElementById(id);
    if (!el) continue;
    if (id !== 'menu') el.classList.add('hidden');
    el.inert = true;
  }
  document.getElementById('ctx-lost').classList.remove('hidden');
}
/** Leaving the context-lost screen (back to the menu): the other overlays are live again. */
function hideContextLost() {
  document.getElementById('ctx-lost').classList.add('hidden');
  for (const id of ['pause', 'ready', 'menu', 'board-choice', 'coming-soon', 'settings', 'c2d-choice', 'c2d', 'controls-modal']) {
    const el = document.getElementById(id);
    if (el) el.inert = false;
  }
}
document.getElementById('ctx-lost-btn').addEventListener('click', () => { reloading = true; location.reload(); });
document.getElementById('ctx-lost-menu').addEventListener('click', () => showMainMenu());

// ---------- game controller ----------
const PAD_BOOM = { duration: 400, strongMagnitude: 1, weakMagnitude: 0.6 };
const PAD_TICK = { duration: 40, strongMagnitude: 0, weakMagnitude: 0.25 };
let padGesture = false; // a UI click is being made with the controller
let padActing = false; // a MouseActions call is being made with the controller
const nav = createHeldSuppressor(); // buttons held through a screen change: ignored until released
const padRep = {
  up: new Repeat(), down: new Repeat(), left: new Repeat(), right: new Repeat(),
  inc: new Repeat(), dec: new Repeat(), spUp: new Repeat(), spDown: new Repeat(),
};
const pads = new GamepadReader({
  onConnect: () => { ui.toast('Controller connected'); updatePadUi(); },
  onActiveChange: () => updatePadUi(),
  onDisconnect: (info) => {
    updatePadUi();
    if (info.wasActive && (S.mode === 'playing' || S.mode === 'classic-2d')) PAUSE.pause('pad', { note: 'Controller disconnected' });
    else ui.toast('Controller disconnected');
  },
});
function updatePadUi() {
  const p = pads.activePad();
  ui.setPad(p ? { glyphs: padGlyphs(p.id), mapping: p.mapping } : null);
}
function padRumble(effect) {
  const a = pads.activePad()?.vibrationActuator;
  if (!a || typeof a.playEffect !== 'function') return;
  try {
    const r = a.playEffect('dual-rumble', effect);
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch { /* rumble unsupported */ }
}
/** Enter play without pointer lock (controller): from the ready card, or resume from the pause menu. */
function padResume() {
  if (S.mode === 'paused') { PAUSE.resume('pad'); return; }
  if (S.mode !== 'ready') return;
  sfx.unlock();
  enterPlaying(true);
}
function padClick(el) {
  padGesture = true;
  try { el.click(); } finally { padGesture = false; }
}

// Spatial focus navigation inside the topmost visible overlay (its screen, or the controls modal).
const LAYER_SCREEN = {
  'ctx-lost': 'ctxlost', 'controls-modal': null, pause: 'paused', ready: 'ready',
  'coming-soon': 'coming-soon', settings: 'settings', 'board-choice': 'board-choice', 'c2d-choice': 'classic-2d-choice', c2d: 'classic-2d', menu: 'menu',
};
const SCREEN_LAYER = Object.fromEntries(Object.entries(LAYER_SCREEN).filter(([, s]) => s).map(([l, s]) => [s, l]));
const MODAL_FOCUS = '#controls-close';
function layerOpen(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden') && !el.inert;
}
function padLayer() {
  const id = topLayer(Object.keys(LAYER_SCREEN), layerOpen);
  return id && document.getElementById(id);
}
function padFocusables(layer) {
  return [...layer.querySelectorAll(FOCUSABLE)].filter((el) => {
    if (el.disabled || el.type === 'hidden') return false;
    const closed = el.closest('details:not([open])');
    if (closed && el !== closed.querySelector('summary')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}
/** The layer's declared default target: its screen's (SHELL), or the controls modal's close button. */
function padDefault(layer, items) {
  const screen = LAYER_SCREEN[layer.id];
  const target = screen ? SHELL.defaultFocus(screen) : MODAL_FOCUS;
  return resolveFocus(target && layer.querySelector(target), items);
}
/** The router's focus hand-off: the screen's default target, or its layer's first control. */
function focusScreen(target, name) {
  const layer = document.getElementById(SCREEN_LAYER[name]);
  if (!target || !layer) return;
  const el = resolveFocus(layer.querySelector(target), padFocusables(layer));
  el?.focus({ preventScroll: true });
}
/** The screen or the topmost layer changed: drop held controller buttons and menu repeats. */
function layerChanged() {
  nav.screenChanged();
  for (const r of Object.values(padRep)) r.reset();
}
function padFocus(el) {
  if (!el) return;
  document.body.classList.add('pad-nav');
  el.focus({ preventScroll: true });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}
/** The focused control of the visible overlay, or null. */
function padCurrent(layer, items) {
  const cur = document.activeElement;
  return cur && layer.contains(cur) && items.includes(cur) ? cur : null;
}
function padStep(el, delta) {
  try { if (delta > 0) el.stepUp(delta); else el.stepDown(-delta); } catch { return; }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
function padNav(dir) {
  const layer = padLayer();
  if (!layer) return;
  const items = padFocusables(layer);
  const cur = padCurrent(layer, items);
  if (!cur) { padFocus(padDefault(layer, items)); return; }
  document.body.classList.add('pad-nav');
  if ((dir === 'left' || dir === 'right') && cur.type === 'range') { padStep(cur, dir === 'right' ? 1 : -1); return; }
  const from = cur.getBoundingClientRect();
  const next = pickInDirection(from, items.filter((e) => e !== cur).map((e) => ({ rect: e.getBoundingClientRect(), item: e })), dir);
  if (next) padFocus(next);
}
function padActivate() {
  const layer = padLayer();
  if (!layer) return;
  const items = padFocusables(layer);
  const cur = padCurrent(layer, items);
  if (cur) { document.body.classList.add('pad-nav'); padClick(cur); return; }
  if (layer.id === 'ready') padClick(document.getElementById('ready-btn'));
  else padFocus(padDefault(layer, items));
}
for (const t of ['mousedown', 'mousemove']) {
  window.addEventListener(t, () => { if (document.body.classList.contains('pad-nav')) document.body.classList.remove('pad-nav'); }, true);
}

/** One controller poll result -> game / menu actions. Runs once per frame. */
function handlePad(p, dt, now) {
  nav.update(p.held);
  const held = (b) => nav.held(p, b);
  const pressed = (b) => nav.pressed(p, b);
  if (p.active) needRender = true;
  const modal = ui.isControlsOpen();

  if (S.mode === 'playing') padPlaying(p, held, pressed, dt, now);
  else if (S.mode === 'classic-2d') padBoard2D(p, held, pressed, now);
  else padMenus(p, held, pressed, now);

  if (ui.isControlsOpen() !== modal) layerChanged(); // screen changes report through the router
}

function padPlaying(p, held, pressed, dt, now) {
  if (pressed(BTN.START)) { padClick(document.getElementById('hud-pause')); return; } // the overlay's pause button
  if (backButtons(S.mode).some(pressed)) { padClick(document.getElementById('hud-pause')); return; } // Back while playing = Pause
  if (pressed(BTN.X)) ui.userToggleHelp();
  // Triggers drive the same release-based state machine as the mouse (both = chord via its toggle).
  padActing = true;
  try {
    if (pressed(BTN.RT)) mouse.down(0);
    if (pressed(BTN.LT)) mouse.down(2);
    if (p.released[BTN.RT]) mouse.up(0);
    if (p.released[BTN.LT]) mouse.up(2);
  } finally { padActing = false; }
  controls.pad.shift = held(BTN.LB);
  controls.pad.space = held(BTN.RB);
  controls.pad.ctrl = held(BTN.Y);
  const [lx, ly] = stickCurve(p.ls[0], p.ls[1]);
  controls.axes.f = ly ? -ly : 0; // stick up = forward
  controls.axes.r = lx;
  controls.axes.u = (held(BTN.A) ? 1 : 0) - (held(BTN.B) ? 1 : 0);
  const [rx, ry] = stickCurve(p.rs[0], p.rs[1]);
  cam.lookAxes(dt, rx, ry);
  const notches = padRep.spUp.update(held(BTN.UP), now) - padRep.spDown.update(held(BTN.DOWN), now);
  if (notches) { setSpacing(S.spacing + notches * 0.04); ui.showSpacing(S.spacing); }
}

/**
 * The Classic 2D board: Start and the back buttons pause through the overlay's pause button, a
 * failed board's offer is a menu, and everything else goes to the board's cursor input.
 */
function padBoard2D(p, held, pressed, now) {
  controls.releasePad();
  if (pressed(BTN.START) || backButtons(S.mode).some(pressed)) { padClick(document.getElementById('hud-pause')); return; }
  if (board2d.failure) { padMenus(p, held, pressed, now); return; }
  mode2d.pad({ ...p, held: p.held.map((_, b) => held(b)) }, now);
}

function padMenus(p, held, pressed, now) {
  controls.releasePad();
  const modal = ui.isControlsOpen();
  if (pressed(BTN.START) && (S.mode === 'ready' || S.mode === 'paused') && !modal && !ui.isConfirmOpen()) { padResume(); return; }
  if (backButtons(S.mode).some(pressed)) { shellBack('pad'); return; }
  if (pressed(BTN.X)) {
    if (S.mode === 'menu') { if (modal) ui.closeControls(); else ui.openControls(); document.body.classList.add('pad-nav'); }
    else if (S.mode === 'ready' || S.mode === 'paused') ui.userToggleHelp();
    return;
  }
  if (pressed(BTN.A)) { padActivate(); return; }
  const [ax, ay] = p.ls, ver = Math.abs(ay) >= Math.abs(ax);
  const dirs = {
    up: held(BTN.UP) || (ver && ay < -0.5), down: held(BTN.DOWN) || (ver && ay > 0.5),
    left: held(BTN.LEFT) || (!ver && ax < -0.5), right: held(BTN.RIGHT) || (!ver && ax > 0.5),
  };
  for (const d of ['up', 'down', 'left', 'right']) {
    for (let n = padRep[d].update(dirs[d], now); n > 0; n--) padNav(d);
  }
  // LB / RB step a focused number field (custom board size)
  const step = padRep.inc.update(held(BTN.RB), now) - padRep.dec.update(held(BTN.LB), now);
  if (step) {
    const el = document.activeElement;
    if (el && el.tagName === 'INPUT' && (el.type === 'number' || el.type === 'range') && padLayer()?.contains(el)) padStep(el, step);
  }
}

// ---------- frame loop ----------
const tmpDir = new THREE.Vector3();

function updatePick() {
  const g = S.game, three = renderer.camera;
  const space = renderer.toggles.space;
  const key = `${cam.x},${cam.y},${cam.z},${cam.yaw},${cam.pitch},${S.spacing},${g.version},${space},${three.aspect}`;
  if (key === S.pickKey) return;
  S.pickKey = key;
  three.getWorldDirection(tmpDir);
  const n = three.near;
  const o = { x: three.position.x + tmpDir.x * n, y: three.position.y + tmpDir.y * n, z: three.position.z + tmpDir.z * n };
  S.selected = pickCell(g, S.spacing, o, tmpDir, space);
  renderer.setSelected(S.selected);
  ui.setCrosshair(S.selected >= 0);
}
/** Synchronous camera/pick refresh (used by the debug hook between frames). */
function refresh() {
  if (!S.game || onBackdrop()) return;
  cam.apply(renderer.camera);
  const playing = S.mode === 'playing';
  renderer.setToggles(playing && controls.shift, playing && controls.space, playing && controls.ctrl);
  renderer.setSpacing(S.spacing);
  updatePick();
}
let last = performance.now();
const fps = { frames: 0, acc: 0, value: 0 };
const stats = { renders: 0, skipped: 0 };

// Render on demand: skip the GL draw when nothing visible changed.
let needRender = true;
let lastSig = '';
let lastEnd = null;
let animUntil = 0; // keep drawing for a while after the game ends (end-of-game effects)
function rendererAnimating() {
  if (typeof renderer.needsAnimationFrame === 'function') return !!renderer.needsAnimationFrame();
  if (typeof renderer.isAnimating === 'function') return !!renderer.isAnimating();
  if (typeof renderer.isAnimating === 'boolean') return renderer.isAnimating;
  return null; // unknown
}
function shouldRender(now, synced) {
  if (onBackdrop() || needRender || synced) return true;
  if (S.endState !== lastEnd) { lastEnd = S.endState; if (S.endState) animUntil = now + 6000; return true; }
  const anim = rendererAnimating();
  if (anim === true) return true;
  if (anim === null) {
    // No animation hook from the renderer: assume time-based effects may be running.
    if (now < animUntil) return true;
    if (S.mode === 'playing' && S.selected >= 0) return true;
  }
  const t = renderer.toggles, c = renderer.camera;
  const sig = `${cam.x},${cam.y},${cam.z},${cam.yaw},${cam.pitch},${S.spacing},${t.shift},${t.space},${t.ctrl},${S.selected},${S.game ? S.game.version : -1},${c.aspect},${S.mode}`;
  if (sig !== lastSig) { lastSig = sig; return true; }
  return false;
}

function frame(now) {
  const rawDt = Math.max(0, (now - last) / 1000);
  const dt = Math.min(0.1, rawDt); // movement step (avoid huge jumps after a stall)
  last = now;
  fps.frames++; fps.acc += rawDt;
  if (fps.acc >= 0.5) { fps.value = fps.frames / fps.acc; fps.frames = 0; fps.acc = 0; }

  const pad = pads.poll();
  if (pad.pad || pad.active) handlePad(pad, dt, now);
  if (MODES.active === 'classic-2d') mode2d.tick();

  const three = renderer.camera;
  const playing = S.mode === 'playing';
  if (onBackdrop()) {
    S.orbit += dt * 0.12;
    const r = 62;
    three.position.set(Math.sin(S.orbit) * r, 24 + Math.sin(S.orbit * 0.7) * 10, Math.cos(S.orbit) * r);
    three.lookAt(0, 0, 0);
    three.updateMatrixWorld(true);
    renderer.setToggles(false, false, false);
  } else {
    if (playing) {
      cam.move(dt, input.move);
      if (controls.hasAxes) cam.moveAxes(dt, controls.axes.f, controls.axes.r, controls.axes.u);
    }
    cam.apply(three);
    const shift = playing && controls.shift, space = playing && controls.space, ctrl = playing && controls.ctrl;
    renderer.setToggles(shift, space, ctrl);
    ui.setModes(shift, space, ctrl);
  }
  renderer.setSpacing(S.spacing);
  const synced = renderer.sync();

  // picking: only when something relevant changed
  const g = S.game;
  if (g && !onBackdrop()) {
    updatePick();
    // timer: runs only while actually playing (not paused / not on overlays), frozen at the end
    if (playing && S.started && !S.endState) S.time += Math.min(rawDt, 1);
    const e = S.endState;
    ui.updateHud(e ? e.time : S.time, e ? e.minesLeft : g.minesLeft);
  }

  if (shouldRender(now, synced)) {
    needRender = false;
    renderer.render();
    stats.renders++;
  } else stats.skipped++;
  requestAnimationFrame(frame);
}

await Promise.all([settingsLoaded, recordsLoaded]);
showMainMenu();
mode2d.loadChoice();
const bootFocus = document.activeElement;
LAST_MODE.load().then((mode) => {
  ui.setLastMode(mode);
  if (SHELL.current === 'menu' && document.activeElement === bootFocus) SHELL.refocus(); // the player has not moved yet
});
requestAnimationFrame(frame);

// ---------- debug / test hook ----------
function cellCenter(idx) {
  const g = S.game, [i, j, k] = g.coords(idx), p = 4 * S.spacing;
  return [(i - (g.X - 1) / 2) * p, (j - (g.Y - 1) / 2) * p, (k - (g.Z - 1) / 2) * p];
}
window.__ms = {
  get state() { return S; },
  get game() { return S.game; },
  get renderer() { return renderer; },
  get camera() { return cam; },
  get fps() { return fps.value; },
  get frameStats() { return { ...stats }; },
  startCameraPos,
  THREE,
  start(X, Y, Z, mines, minePositions) { MODES.start('3d', { X, Y, Z, mines, minePositions }); },
  /** Enter playing mode without pointer lock (headless tests). */
  forcePlay() { enterPlaying(true); },
  get controls() { return controls; },
  get pads() { return pads; },
  pause() { PAUSE.pause('key'); },
  cellCenter,
  moveTo(x, y, z) { cam.x = x; cam.y = y; cam.z = z; refresh(); },
  look(yaw, pitch) { cam.yaw = yaw; cam.pitch = pitch; refresh(); },
  /** Point the crosshair at the centre of cell idx (or at a world point [x,y,z]). */
  aimAt(target) {
    const t = Array.isArray(target) ? target : cellCenter(target);
    let dx = t[0] - cam.x, dy = t[1] - cam.y, dz = t[2] - cam.z;
    const l = Math.hypot(dx, dy, dz); dx /= l; dy /= l; dz /= l;
    // three.js view dir = (cos(p) sin(yaw), -sin(p), -cos(p) cos(yaw))
    cam.pitch = Math.asin(-dy);
    cam.yaw = Math.atan2(dx, -dz);
    refresh();
    return S.selected;
  },
  mouseDown(b) { mouse.down(b); },
  mouseUp(b) { mouse.up(b); },
  click(type = 'left') {
    refresh();
    if (type === 'left') { mouse.down(0); mouse.up(0); }
    else if (type === 'right') { mouse.down(2); mouse.up(2); }
    else if (type === 'chord') { mouse.down(0); mouse.down(2); mouse.up(0); mouse.up(2); }
  },
  key(code, down = true) { if (down) input.keys.add(code); else input.keys.delete(code); refresh(); },
  wheel(notches) { setSpacing(S.spacing + notches * 0.04); refresh(); },
  selected() { refresh(); return S.selected; },
  pickBrute() {
    const three = renderer.camera; three.getWorldDirection(tmpDir);
    const o = { x: three.position.x + tmpDir.x, y: three.position.y + tmpDir.y, z: three.position.z + tmpDir.z };
    return pickCellBrute(S.game, S.spacing, o, tmpDir, renderer.toggles.space);
  },
  pickWith(o, d, space = false) { return [pickCell(S.game, S.spacing, o, d, space), pickCellBrute(S.game, S.spacing, o, d, space)]; },
  info() {
    const g = S.game;
    return {
      mode: S.mode, selected: S.selected, time: S.time, started: S.started, spacing: S.spacing,
      gameState: g?.state, minesLeft: g?.minesLeft, hud: [document.getElementById('hud-time').textContent, document.getElementById('hud-mines').textContent],
      cam: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch }, stats: { ...renderer.stats }, fps: fps.value,
    };
  },
  /** The mode host: start/pause/resume/restart/leave/summary and the mode reports (on). */
  get modes() { return MODES; },
  /** The pause controller: pause/resume/restart/toMenu/pageHide and the hand-offs (attach). */
  get pauser() { return PAUSE; },
  /** The settings store: get/set/onChange. */
  get settings() { return SETTINGS; },
  /** The records store: record/begin/checkpoint, the queries and onChange. */
  get records() { return RECORDS; },
};
