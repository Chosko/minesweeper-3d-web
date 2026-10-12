// Entry point: wires game logic, renderer, input and UI together.
import * as THREE from 'three';
import { BoardRenderer } from './render.js';
import { FlyCamera, MouseActions, Input, SPACING_MIN, SPACING_MAX, SPACING_START, spawnPose, offscreenArrow, escResumes } from './input.js';
import { pickCell, pickCellBrute } from './picking.js';
import { UI, clampSettings, NO_MOUSE_MSG } from './ui.js';
import * as audio from './audio.js';
import { Controls } from './controls.js';
import { GamepadReader, BTN, Repeat, stickCurve, padGlyphs, pickInDirection, GLYPHS, STICK_DEADZONE } from './gamepad.js';
import { createRouter } from './shell/router.js';
import { FOCUSABLE, topLayer, resolveFocus, isBackKey, arrowDirection, keepsArrow, backButtons, createHeldSuppressor } from './shell/navigation.js';
import { createHistorySync, storedSet } from './shell/history.js';
import { createModeHost } from './shell/mode-host.js';
import { create3DMode } from './shell/mode-3d.js';
import { createSession, create3DGame } from './mode3d/session.js';
import { createSampler3D } from './replay/sampler-3d.js';
import { createGenerationClient } from './generation/client.js';
import { createMenu, createLastMode, createLastBoardChoice } from './shell/menu.js';
import { createFirstUse, stripShown, hidCube, aimHintCell, createDwell, AIM_DWELL_MS } from './shell/first-use.js';
import { createActiveDevice, hintText } from './settings/bindings.js';
import { createPauseController } from './shell/pause.js';
import { createLockFallback } from './shell/lock-fallback.js';
import { bindScenePalette } from './shell/scene-palette.js';
import { token, onThemeChange } from './tokens.js';
import { storage, blobStore } from './platform/index.js';
import { createSettingsStore } from './settings/store.js';
import { createRecordsStore } from './records/store.js';
import { countedClicks } from './records/summary.js';
import { createResultsFlow } from './results/flow.js';
import { createReplayLibrary } from './replay/library.js';
import { createReplayViewer, createReplayView } from './replay/viewer.js';
import { mountViewer2D } from './replay/viewer-2d.js';
import { createViewer3D } from './replay/viewer-3d.js';
import { REPLAY_SCREEN } from './records/replay-list.js';
import { createResultsView, resultsContent } from './results/view.js';
import { createRecordsScreen, createRecordsView } from './records/screen.js';
import { applySettings, pixelRatioFor } from './settings/appliers.js';
import { bindSettingControls } from './settings/page.js';
import { createClassic2DMode } from './classic2d/mode.js';
import { bindBoardChoice } from './classic2d/board-choice.js';
import { createLastChoice, DEFAULT_CHOICE } from './classic2d/board-setup.js';
import {
  bindBoardChoice as bindBoardChoice3D, boardOf, normaliseChoice as normaliseChoice3D, DEFAULT_CHOICE as DEFAULT_CHOICE_3D,
  LAST_CHOICE_DOC as LAST_CHOICE_DOC_3D, LAST_CHOICE_VERSION as LAST_CHOICE_VERSION_3D,
} from './mode3d/board-choice.js';

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
// S.mode is the router's current screen: 'menu' | 'board-choice' | 'coming-soon' | 'records' | 'classic-2d-choice' | 'settings' | 'ready' |
// 'playing' | 'classic-2d' | 'paused' | 'results' | 'ctxlost' (defined below).
const S = {
  settings: null,
  game: null, // the 3D state view of the game shown (its session's view), or null
  play: null, // that game's session (js/mode3d/session.js): actions, timer, board request
  demo: null,
  spacing: SPACING_START,
  selected: -1,
  started: false, // the first reveal has been applied to the generated board
  time: 0, // the session's timer in seconds, read once per frame while it runs
  endState: null, // frozen { state, time, minesLeft } once the game is over
  pickKey: '',
  arrowKey: '', // the off-screen arrow's inputs when last drawn
  orbit: 0,
  lockless: false, // playing without pointer lock (controller session, drag-to-look, or the debug hook)
  dragLook: false, // drag-to-look play: the browser blocks pointer lock; ends when the game is left
};

// ---------- actions ----------
function hasSelection() { return S.selected >= 0 && S.game && S.mode === 'playing'; }
let minesBefore = 0; // the HUD's mines left before the last action (the original froze it from the frame before the final action)
/**
 * The only dispatcher to the 3D game: the session takes the action, or refuses it (null) while the
 * board is generated. The first reveal answers once its board has arrived; the end of the game
 * comes through the session's `finished`.
 */
function onAction(type) {
  const g = S.game, play = S.play;
  if (!g || S.selected < 0) return;
  const before = g.state;
  minesBefore = g.minesLeft;
  const sel = S.selected;
  const v0 = g.version;
  const onNumber = type === 'right' && g.pressed[sel] === 1; // a flag click on a revealed number: its flag-all or its undo
  if (type !== 'right') renderer.snapshotBeforeAction(); // lets the renderer show wrong flags + reveal wave on a loss
  const r = type === 'left' ? play.reveal(sel) : type === 'right' ? play.toggleFlag(sel) : play.chord(sel);
  if (r && typeof r.then === 'function') {
    r.then((res) => { if (res && S.play === play) actionSounds(type, res); });
    return;
  }
  if (!r) return;
  actionSounds(type, r, onNumber);
  if (g.version === v0 && before === 'playing' && g.state === 'playing' && typeof sfx.noop === 'function') sfx.noop(); // action changed nothing
}
/** The live feedback of an action: its sound, rumble, and the flash of the cubes a flag click on a number changed. */
function actionSounds(type, r, onNumber = false) {
  noteAutoHide(r);
  if (type === 'right') {
    if (r.flagged || r.unflagged) sfx.flag(r.flagged >= r.unflagged, r.flagged + r.unflagged); // the sound grows with the count
    if (onNumber && (r.flagged || r.unflagged)) renderer.flash(Array.from(r.changed).filter((c) => !S.game.pressed[c]));
    if (padActing && (r.flagged || r.unflagged)) padRumble(PAD_TICK);
  } else if (r.exploded) boom();
  else if (r.revealed > 0) {
    if (type === 'left') sfx.reveal(r.revealed);
    else sfx.chord(r.revealed);
  }
}
function boom() { sfx.explode(); ui.flash(); padRumble(PAD_BOOM); }
/** The first time auto-hide hides a cube in any 3D game, a toast says so; once per browser. */
function noteAutoHide(r) {
  if (FIRST_USE.shown('autoHideToast') || !S.game || !hidCube(S.game, r.changed)) return;
  if (FIRST_USE.once('autoHideToast')) ui.toast(hintText('autoHide', DEVICE.current, activeGlyphs()), 4000);
}
/**
 * The end of the 3D game: the HUD freezes and the end effect plays; the 3D mode's end delay then
 * hands over to the results screen. Until then input is ignored (ending3D).
 */
function endGame() {
  const g = S.game;
  S.time = S.play.elapsedMs() / 1000;
  S.endState = { state: g.state, time: S.time, minesLeft: minesBefore, clicks: clicks3D() };
  if (g.state === 'won') sfx.win();
}
/** The 3D game's counted clicks so far, wasted included — the engine's counts; 0 before its board arrives. */
function clicks3D() {
  const counts = S.play?.counts();
  return counts ? countedClicks(counts.clicks) : 0;
}
/** The 3D game's end delay is running: no board action, camera movement, view-mode key, Back or pause. */
function ending3D() { return MODES.active === '3d' && mode3d.ending; }
/** Every pause goes through here: none is offered while the 3D end delay runs. */
function pauseGame(source, opts) { return ending3D() ? false : PAUSE.pause(source, opts); }
/** Back on the board (Esc, the controller's back button): cancels a board being generated, else pauses. */
function backGame(source) { return ending3D() ? false : PAUSE.back(source === 'pointer' ? 'button' : source); }
let cancelledAt = -Infinity; // performance.now() of the last cancelled 3D generation
/**
 * Cancel the active mode's board being generated, back to its closed board; whether there was one.
 * A 3D game without pointer lock or controller play goes back to the click-to-play card.
 */
function cancelGeneration() {
  if (MODES.active === 'classic-2d') return mode2d.cancelGeneration();
  if (MODES.active !== '3d' || !mode3d.cancelGeneration()) return false;
  cancelledAt = performance.now();
  if (S.mode === 'playing' && !S.lockless && !document.pointerLockElement) SHELL.go('ready', { replace: true });
  return true;
}

const mouse = new MouseActions(onAction, hasSelection);
// The ready card's pointer-lock refusals: from the second, it offers drag-to-look and the controller.
const LOCK_FALLBACK = createLockFallback();
const input = new Input({
  canvas,
  mouse,
  isActive: () => S.mode === 'playing' && !ending3D(),
  isDragLook: () => S.dragLook && S.lockless,
  onLook: (dx, dy) => cam.look(dx, dy),
  onWheel: (notches) => { setSpacing(S.spacing + notches * 0.04); ui.showSpacing(S.spacing); },
  onKey: (code, e) => {
    if (isBackKey(code)) { shellBack('key'); return; }
    if ((code === 'Home' || code === 'KeyR') && input.o.isActive()) { placeAtSpawn(); return; } // back to the start view, in 3D play only
    if (S.mode === 'classic-2d') used2D(); // the first key of a Classic 2D game brings its hint strip
    const dir = arrowDirection(code);
    if (dir) { keyNav(dir, e); return; }
    if (S.mode !== 'playing' && S.mode !== 'paused' && S.mode !== 'ready' && S.mode !== 'classic-2d') return;
    // don't steal keys typed into settings controls (e.g. arrow keys on a slider)
    if (e && e.target && e.target.closest && e.target.closest('input, select, textarea')) return;
    if (code === 'KeyH') ui.userToggleHelp(); // both modes
    else if (code === 'KeyM') toggleSound(); // both modes
    else if (code === 'KeyF' && MODES.active === '3d') toggleFullscreen(); // F flags in Classic 2D
  },
  onLockChange: (locked) => {
    if (locked) {
      LOCK_FALLBACK.locked();
      if (S.mode === 'ready' || S.mode === 'paused') enterPlaying();
    } else if (S.mode === 'playing' && !S.lockless && !board3d.failure) { // a failed board released the lock for its offer
      if (performance.now() - cancelledAt < 500) SHELL.go('ready', { replace: true }); // the Esc that cancelled the board
      else if (!document.hasFocus()) pauseGame('key'); // the window lost focus
      else backGame('key'); // the browser's own Esc released the lock: Back, which cancels a board being generated
    }
  },
  onLockError: () => {
    if (S.mode === 'paused' || S.mode === 'ready') {
      const msg = NO_MOUSE ? NO_MOUSE_MSG : LOCK_FALLBACK.refused(performance.now(), input.unlockedAt);
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
  onReadyClick: () => { sfx.unlock(); if (padGesture) padResume(); else input.requestLock(); },
  onReadyDrag: () => enterDragLook(),
  onResume: () => PAUSE.resume(padGesture ? 'pad' : 'pointer'),
  onBackToStart: () => { placeAtSpawn(); PAUSE.resume(padGesture ? 'pad' : 'pointer'); }, // a 3D game in play: resumes as Resume does
  onRestart: () => PAUSE.restart(padGesture ? 'pad' : 'pointer'),
  onMainMenu: () => PAUSE.toMenu(),
  onPause: () => pauseGame(padGesture ? 'pad' : 'button'),
  onReadyBack: () => readyBack(),
  onToggleSound: () => toggleSound(),
  onDismissHint: (mode) => { FIRST_USE.dismiss(mode); refreshHints(); },
  onRetry2D: () => answer2D(() => mode2d.retry()),
  onStandard2D: () => answer2D(() => { standard2D = true; try { mode2d.playStandard(); } finally { standard2D = false; } }),
  onCancel2D: () => mode2d.cancelGeneration(),
  onOfferMenu2D: () => PAUSE.toMenu(),
  onRetry3D: () => retry3D('retry'),
  onStandard3D: () => retry3D('standard'),
  onCancel3D: () => cancelGeneration(),
  onOfferMenu3D: () => PAUSE.toMenu(),
});
ui.setNoMouse(NO_MOUSE);

// ---------- active device ----------
// The controller while the last input came from a connected controller, else the keyboard and
// mouse; every help surface follows it.
const DEVICE = createActiveDevice({ onChange: (d) => ui.setDevice(d) });
window.addEventListener('keydown', () => DEVICE.input('keyboard'), true);
/** The glyphs of the connected controller, for the hints' button names. */
function activeGlyphs() { const p = pads.activePad(); return p ? padGlyphs(p.id) : GLYPHS.generic; }
/** A poll with a press or a stick off its deadzone: the controller is in use. */
function padUsed(p) {
  return p.pressed.some(Boolean) || Math.hypot(p.ls[0], p.ls[1]) > STICK_DEADZONE || Math.hypot(p.rs[0], p.rs[1]) > STICK_DEADZONE;
}

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
    'board-choice': { defaultFocus: '[data-preset][data-last]', show: () => { MODES.leave(); showMenuBackdrop(); ui.showBoardChoice(); CHOICE_3D.show(LAST_CHOICE_3D.current, { played: LAST_CHOICE_3D.played }); } },
    'coming-soon': { defaultFocus: '#coming-soon-back', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showComingSoon(d.title ?? 'This screen'); } },
    records: { defaultFocus: '#records-picker [aria-checked="true"]', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showRecords(); RECORDS_PAGE.show({ mode: d.mode, boardKey: d.boardKey }); }, hide: () => RECORDS_PAGE.hide() },
    settings: { defaultFocus: '#set-lookSensitivity', show: () => { MODES.leave(); showMenuBackdrop(); ui.showSettings(); } },
    'classic-2d-choice': { defaultFocus: '[data-size][data-last]', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showBoardChoice2D(); showChoice2D(d.choice ?? LAST_CHOICE_2D.current); } },
    ready: { defaultFocus: '#ready-btn', show: (d = {}) => ui.showReady(board3dChoice ?? S.settings, LOCK_FALLBACK.readyMessage(d.msg), { rules: FIRST_USE.rules3D, blocked: LOCK_FALLBACK.blocked }), back: ({ source }) => { if (source !== 'key' || performance.now() - input.unlockedAt >= 500) readyBack(); } }, // the Esc that released the pointer lock already meant Back
    playing: { defaultFocus: null, show: (d = {}) => { setLockless(!!d.lockless); ui.showPlaying(); }, back: ({ source }) => backGame(source) },
    'classic-2d': { defaultFocus: null, show: () => ui.showClassic2D(), back: ({ source }) => backGame(source) },
    paused: { defaultFocus: () => (ui.isConfirmOpen() ? '#p-confirm-no' : gameOver() ? '#p-restart' : '#p-resume'), show: (d = {}) => { stopPlayInput(); setBoardHidden(true); ui.showPause(pauseInfo(d.note)); }, hide: () => setBoardHidden(false), back: ({ source }) => resumeFromPause(source) },
    results: { defaultFocus: '#r-again', show: (d) => RESULTS_VIEW.show(resultsContent(d ?? RESULTS.current)), hide: () => RESULTS_VIEW.hide(), back: () => RESULTS.toMenu() },
    [REPLAY_SCREEN]: { defaultFocus: () => REPLAY_VIEWER.defaultFocus(), show: (d = {}) => { ui.showReplay(); REPLAY_VIEWER.show(d); }, hide: () => REPLAY_VIEWER.hide(), back: () => REPLAY_VIEWER.back() },
    ctxlost: { defaultFocus: '#ctx-lost-btn', show: () => showContextLost(), hide: () => hideContextLost(), back: () => showMainMenu() },
  },
  focus: (target, name) => focusScreen(target, name),
  onChange: () => { layerChanged(); needRender = true; sync3D(); showStatus2D(); refreshHints(); HISTORY.sync(); },
});
// end of screen table
Object.defineProperty(S, 'mode', { get: () => SHELL.current, enumerable: true });

// ---------- browser history ----------
// The back stack is mirrored as one same-URL session-history entry per stacked screen, so the
// browser's Back (and a mouse's back button) is a Back input; only the main menu lets it leave.
// The page loads a reload or a return through the history superseded are kept for the tab's life.
const HISTORY = createHistorySync({ router: SHELL, history: window.history, onBack: () => historyBack(),
  superseded: storedSet(() => window.sessionStorage, 'ms3d.history.superseded') });
window.addEventListener('popstate', (e) => HISTORY.popstate(e.state));
HISTORY.start(performance.getEntriesByType?.('navigation')[0]?.type);

// ---------- mode host ----------
// The shell reaches a game only through MODES; the 3D game is registered through its adapter.
const MODES = createModeHost();
let contextLost = false;
const FLOW_3D = {
  openBoardChoice: () => SHELL.go('board-choice'), // the 3D presets and custom board
  start: (settings) => startGame(settings),
  pause: (note) => showPauseCard(note),
  resume: (source) => resumeGame(source),
  restart: (source) => { // entered as resume enters play
    const play = startGame(board3dChoice);
    enterPlay3D(source);
    return play;
  },
  leave: () => leaveGame(),
  release: () => input.exitLock(), // the results screen takes over
  contextLost: () => contextLost,
  sampler: (session) => createSampler3D({ session, camera: cam, controls, spacing: () => S.spacing }),
};
// end of 3D flow
const mode3d = MODES.register('3d', (report) => create3DMode(FLOW_3D, report));
// The 3D board choice; the last 3D choice is a platform-storage document kept by the shell.
const LAST_CHOICE_3D = createLastBoardChoice({ storage, doc: LAST_CHOICE_DOC_3D, version: LAST_CHOICE_VERSION_3D, normalise: normaliseChoice3D, fallback: DEFAULT_CHOICE_3D });
const CHOICE_3D = bindBoardChoice3D({
  root: document.getElementById('board-choice'),
  onStart: (choice) => { sfx.unlock(); LAST_CHOICE_3D.save(choice).catch(() => {}); MODES.start('3d', boardOf(choice)); }, // storage never stops a game
  onBack: () => shellBack('pointer'),
});
// Classic 2D: the mode drives its own board; the shell hands it the board area, the overlay bar and
// its screens. The last board choice is a platform-storage document.
const LAST_CHOICE_2D = createLastChoice({ storage });
const FLOW_2D = {
  openBoardChoice: (choice) => SHELL.go('classic-2d-choice', { data: { choice } }),
  show: () => SHELL.go('classic-2d'),
  container: () => document.getElementById('c2d-board'),
  hud: ({ seconds, minesLeft, clicks }) => ui.updateHud(seconds, minesLeft, clicks),
  board: (b) => { ui.setBoard2D(b); if (!standard2D) newGame2D(); }, // once per game, and again when played standard
  generating: (shown) => { board2d.generating = shown; showStatus2D(); },
  failed: (failure) => { board2d.failure = failure; showStatus2D(); },
};
const board2d = { generating: false, failure: null };
/**
 * The Classic 2D board status card: the generating card on the board, and a failed board's offer
 * there and over the pause card, taking the focus.
 */
function showStatus2D() {
  const on = MODES.active === 'classic-2d';
  const generating = board2d.generating && S.mode === 'classic-2d';
  ui.setBoardStatus(on ? { generating, failure: board2d.failure } : {});
  if (on && (board2d.failure || generating)) focusStatus('c2d', board2d);
}
/**
 * A board status card's default focus: Cancel while generating; on the failure offer Retry, or
 * Play a standard board after a second failure in a row.
 */
function statusFocus(prefix, { failure }) {
  if (!failure) return `#${prefix}-cancel`;
  return failure.count >= 2 ? `#${prefix}-standard` : `#${prefix}-retry`;
}
/** Focus the card's default target; the generating card's Cancel is left alone while it holds the focus. */
function focusStatus(prefix, status) {
  const target = document.querySelector(statusFocus(prefix, status));
  if (target && target !== document.activeElement) target.focus({ preventScroll: true });
}
/** A failed 2D board's offer answered over the pause card: the game resumes with the answer. */
function answer2D(answer) {
  if (S.mode === 'paused') PAUSE.resume(padGesture ? 'pad' : 'pointer');
  answer();
}
const mode2d = MODES.register('classic-2d', (report) => createClassic2DMode(report, { flow: FLOW_2D, lastChoice: LAST_CHOICE_2D }));
/** The board choice on `choice`; the default choice of a player who never played is not "last played". */
function showChoice2D(choice) { CHOICE_2D.show(choice, { played: choice !== DEFAULT_CHOICE }); }
const CHOICE_2D = bindBoardChoice({
  root: document.getElementById('c2d-choice'),
  onStart: (choice) => { sfx.unlock(); MODES.start('classic-2d', choice); },
  onBack: () => shellBack('pointer'),
});
MODES.on('failed', ({ screen }) => SHELL.go(screen ?? 'menu'));
// A 3D game with no summary (the debug hook's fixed board) has no results screen: it ends on the pause card.
MODES.on('finished', ({ mode, summary }) => { if (mode === '3d' && !summary) showPauseCard(); });

// ---------- pause controller ----------
// The one owner of pause, resume, restart and back to menu, and of the game hand-offs.
const PAUSE = createPauseController({
  modes: MODES,
  showCard: ({ note }) => showPauseCard(note),
  isPaused: () => S.mode === 'paused',
  onBoard: () => S.mode === 'playing' || S.mode === 'classic-2d',
  confirm: (request, proceed) => { ui.showConfirm(request, proceed, () => SHELL.refocus()); SHELL.refocus(); },
  goMenu: () => showMainMenu(),
  guard: (on) => (on ? window.addEventListener('beforeunload', guardLeave) : window.removeEventListener('beforeunload', guardLeave)),
  cancelGeneration: () => cancelGeneration(),
});
window.addEventListener('blur', () => pauseGame('blur'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pauseGame('hidden'); });
window.addEventListener('pagehide', () => { if (ending3D()) mode3d.finishNow(); PAUSE.pageHide(); }); // a game in its end delay is finished, not lost

// ---------- personal records ----------
// The records store loads before the first screen, settling a game the last launch closed on, and
// keeps every abandoned game and the game in progress through the pause controller's hand-offs.
const RECORDS = createRecordsStore({
  storage,
  onNotSaved: () => ui.toast('Records cannot be saved in this browser — this session\'s games will not be kept.', 4000),
});
const recordsLoaded = RECORDS.load();
RECORDS.attach(PAUSE);

// ---------- first-use hints ----------
// What a new player has been taught, in the platform-storage document shell.firstUse, seeded from
// the records once they load. A game counts when its mode reports game started; the hint strips
// show during each mode's first three games (judged as each game begins) until dismissed.
const FIRST_USE = createFirstUse({ storage, records: RECORDS });
const firstUseLoaded = recordsLoaded.then(() => FIRST_USE.load(), () => FIRST_USE.load());
MODES.on('finished', ({ mode }) => FIRST_USE.gameFinished(mode));
const hint3D = { eligible: false };
const hint2D = { eligible: false, used: false };
let standard2D = false; // the failed 2D board's offer is playing it standard: the same game
function newGame2D() {
  hint2D.eligible = FIRST_USE.inFirstGames('classic-2d');
  hint2D.used = false;
  refreshHints(); // the router already drew the strip from the previous game's state
}
/** A key or the controller was used in this Classic 2D game. */
function used2D() {
  if (MODES.active !== 'classic-2d' || hint2D.used) return;
  hint2D.used = true;
  refreshHints();
}
/** The hint strip of the active mode, on its play screen. */
function refreshHints() {
  const mode = MODES.active;
  if (mode !== '3d' && mode !== 'classic-2d') { ui.setHintStrip(false); return; }
  const h = mode === '3d' ? hint3D : hint2D;
  ui.setHintStrip(stripShown({ mode, screen: S.mode, eligible: h.eligible, used: h.used, dismissed: FIRST_USE.dismissed(mode) }));
}
// The aim hint: the crosshair rests about a second on a revealed number with a closed cube behind it.
const AIM_DWELL = createDwell(AIM_DWELL_MS);
function aimHint(g, now) {
  if (FIRST_USE.shown('aimHint')) return;
  const sel = S.selected;
  const cell = !controls.space && sel >= 0 && g.pressed[sel] && g.number[sel] > 0 ? aimHintCell(g, sel, aimedCell(g, S.spacing, true)) : null;
  if (AIM_DWELL.update(cell, now) && FIRST_USE.once('aimHint')) ui.toast(hintText('aimHint', DEVICE.current, activeGlyphs()), 4000);
}

// ---------- replay library ----------
// Every kept replay; loads in the background, and the results flow waits for it before adding one.
// A replay that cannot be saved stays watchable this session; the Records screen also says so once.
const REPLAYS = createReplayLibrary({
  storage,
  blobStore,
  onNotSaved: () => ui.toast('Replays cannot be saved in this browser — this session\'s replays will not be kept.', 4000),
});
REPLAYS.load();

// ---------- 3D replay ----------
// A 3D replay draws on the renderer with its own camera, placed from the recording each frame; player
// input never moves it. Leaving the replay gives the renderer back the board it drew before.
const REPLAY_SPACING = SPACING_START;
const replayCam = new FlyCamera();
const replay3d = { view: null, toggles: { shift: false, space: false, ctrl: false }, pickKey: '', time: 0 };
const REPLAY_SCENE = {
  show(view) {
    replay3d.view = view;
    replay3d.pickKey = '';
    replayCam.place(spawnPose(view, REPLAY_SPACING, renderer.camera.fov, renderer.camera.aspect)); // until its first sample
    renderer.setGame(view);
    applyPixelRatio(view.n);
    needRender = true;
  },
  camera(pose, toggles) {
    if (pose) Object.assign(replayCam, pose);
    replay3d.toggles = toggles;
    needRender = true;
  },
  hide() {
    replay3d.view = null;
    const g = S.game ?? S.demo;
    if (g) { renderer.setGame(g); applyPixelRatio(g.n); }
    S.pickKey = '';
    needRender = true;
  },
};
/** The replay viewer's box viewer; with the graphics context gone it is a mode's failure, and nothing mounts. */
function mountReplay3D({ sim }) {
  if (contextLost) { SHELL.go('ctxlost'); return { draw() {}, destroy() {} }; }
  return createViewer3D({ sim, scene: REPLAY_SCENE, spacing: REPLAY_SPACING });
}

// ---------- replay viewer ----------
// A shell screen over the replay library: it verifies the replay, then plays it on its own board
// view; it reports nothing to records, plays no sound and never pauses. Back is the screen it came from.
const REPLAY_VIEWER = createReplayViewer({
  library: REPLAYS,
  router: SHELL,
  view: createReplayView({
    root: document.getElementById('replay'),
    onCommand: (name) => REPLAY_VIEWER.command(name),
    onSpeed: (speed) => REPLAY_VIEWER.setSpeed(speed),
    onSeek: (ms) => REPLAY_VIEWER.seek(ms),
    onBack: () => shellBack('pointer'),
  }),
  viewers: { square: mountViewer2D, box: mountReplay3D },
});

// ---------- results ----------
// A finished game is recorded, then the results screen shows over the finished Classic 2D board,
// or takes over the 3D scene, which stops rendering under it. Every finished and abandoned game's
// replay is then added to the replay library.
// Play again restarts the finished game's board choice, or starts it again once the mode was left
// (back from Records); a 3D game is entered as resume enters play. Watch replay plays the game just
// finished from its own replay; Back returns to the results screen.
const RESULTS = createResultsFlow({
  records: RECORDS,
  replays: REPLAYS,
  router: SHELL,
  restart: (source, { mode }) => {
    if (MODES.active) PAUSE.restart(source);
    else if (mode === 'classic-2d') MODES.start(mode, LAST_CHOICE_2D.current);
    else if (mode === '3d' && board3dChoice) { MODES.start(mode, board3dChoice); enterPlay3D(source); }
  },
  goMenu: () => showMainMenu(),
});
RESULTS.attach(PAUSE);
const RESULTS_VIEW = createResultsView({
  root: document.getElementById('results'),
  onPlayAgain: () => RESULTS.playAgain(padGesture ? 'pad' : 'pointer'),
  onWatch: () => RESULTS.watch(),
  onRecords: () => RESULTS.openRecords(),
  onMenu: () => RESULTS.toMenu(),
});

// ---------- records screen ----------
// The board picker, the chosen board's figures, history and kept replays, redrawn live while open;
// Watch shows once the replay viewer's route is registered; Back is the back stack.
const RECORDS_PAGE = createRecordsScreen({ records: RECORDS, replays: REPLAYS, router: SHELL,
  view: createRecordsView({
    root: document.getElementById('records'),
    onSelect: (key) => RECORDS_PAGE.select(key),
    onMode: (mode) => RECORDS_PAGE.setMode(mode),
    onPage: (page) => RECORDS_PAGE.showPage(page),
    onWatch: (id) => RECORDS_PAGE.watch(id),
    onTogglePin: (id) => RECORDS_PAGE.togglePin(id),
    onPinnedFirst: (on) => RECORDS_PAGE.setPinnedFirst(on),
    onBack: () => shellBack('pointer'),
  }),
});

// ---------- main menu ----------
// Each entry is a route; the last mode played is kept through platform storage and marked on the menu.
const MENU = createMenu({ router: SHELL, modes: MODES });
const LAST_MODE = createLastMode({ storage, modes: MODES });
MODES.on('started', ({ mode }) => { ui.setLastMode(mode); FIRST_USE.gameStarted(mode); });

/** Back from the keyboard (Esc) or the controller: the topmost layer first, then the router. */
function shellBack(source) {
  if (ending3D()) return;
  if (ui.closeControls() || ui.closeConfirm()) return;
  SHELL.back(source);
}
/**
 * The browser's Back (a mouse's back button too): Back as Esc means it, except that during a game it
 * never resumes and never leaves — the board pauses as an asked-for pause, the pause card and a
 * started game's ready card keep the game where it is, the 3D end delay ignores it. The history
 * sync restores the entry it consumed whenever the screen stays.
 */
function historyBack() {
  if (ending3D()) return;
  if (ui.closeControls() || ui.closeConfirm()) return;
  if (S.mode === 'playing' || S.mode === 'classic-2d') { pauseGame('button'); return; }
  if (S.mode === 'paused' && !gameOver()) return;
  if (S.mode === 'ready' && S.game && S.started) return;
  SHELL.back('history');
}
/**
 * Back from the pause card: an ended game goes to the menu; the controller resumes; the keyboard goes to
 * the click-to-play card on every Esc but the one that released the pointer lock (escResumes).
 */
function resumeFromPause(source) {
  if (gameOver()) { PAUSE.toMenu(); return; }
  if (source === 'pad') { padResume(); return; }
  if (source === 'key' && !escResumes(input.lastKey)) return; // the Esc that released the pointer lock already meant Pause
  PAUSE.resume('key');
}
/**
 * The 3D resume: a controller enters lockless play, and so does drag-to-look play; otherwise the
 * click-to-play card, which takes pointer lock.
 */
function resumeGame(source) {
  if (source === 'pad' || S.dragLook) { sfx.unlock(); enterPlaying(true); return; }
  SHELL.go('ready');
  if (source === 'pointer') input.requestLock();
}

/** Leave the ready screen: a fresh board goes back to the 3D board choice; a game in progress opens the pause menu. */
function readyBack() {
  if (S.mode !== 'ready') return;
  if (S.game && S.started) pauseGame('key');
  else SHELL.go('board-choice');
}

/** The render resolution setting's pixel ratio for the board shown (n cells; Auto: big boards are fill/vertex heavy). */
let boardCells = 0;
function applyPixelRatio(n = boardCells) {
  boardCells = n;
  const pr = pixelRatioFor(SETTINGS.get('renderResolution'), window.devicePixelRatio, n);
  if (renderer.setPixelRatio(pr)) needRender = true;
}

// The 3D game asks the generation worker for its boards; one client, released by each session's leave.
const GEN_3D = createGenerationClient();
const board3d = { generating: false, failure: null }; // the 3D board status card: a slow first click, a failed board
let board3dChoice = null; // the board a restart plays again: S.settings and the no-guess switch

function startGame(settings) {
  const s = clampSettings(settings);
  S.play?.leave();
  const noGuess = !!settings.noGuess;
  // a mine set is the debug hook's fixed board
  const play = createSession({ board: { ...s, noGuess, minePositions: settings.minePositions }, client: GEN_3D });
  play.on('generating', ({ shown }) => { if (S.play === play) { board3d.generating = shown; showStatus3D(); } });
  play.on('failed', (failure) => { if (S.play === play) { board3d.failure = failure; showStatus3D(); } });
  play.on('started', () => { if (S.play === play) S.started = true; });
  play.on('finished', () => { if (S.play === play) endGame(); });
  const g = play.view;
  S.settings = { X: s.X, Y: s.Y, Z: s.Z, mines: play.mines };
  board3dChoice = { ...S.settings, noGuess };
  hint3D.eligible = FIRST_USE.inFirstGames('3d');
  S.play = play;
  S.game = g;
  S.started = false;
  S.time = 0;
  S.endState = null;
  S.selected = -1;
  S.pickKey = '';
  S.spacing = SPACING_START;
  board3d.generating = false;
  board3d.failure = null;
  mouse.reset();
  renderer.setGame(g);
  applyPixelRatio(g.n);
  placeAtSpawn();
  ui.setBoard(board3dChoice);
  ui.updateHud(0, g.minesLeft, 0);
  SHELL.go('ready', { data: { msg: NO_MOUSE ? NO_MOUSE_MSG : '' } });
  needRender = true;
  return play; // the adapter reports from it, after the listeners above
}

/**
 * The 3D game is paused whenever its board is not in play, and resumed on the return to play; every
 * screen change keeps it in step. Its clock runs through every pause.
 */
function sync3D() {
  const play = S.play;
  if (!play) return;
  if (S.mode === 'playing') play.resume();
  else play.pause();
  if (S.started && !S.endState) S.time = play.elapsedMs() / 1000;
  showStatus3D();
}
/**
 * The 3D board status card shows over the box in play, and a failed board's offer over the pause
 * card too, taking the focus; a failed board releases pointer lock for its offer.
 */
function showStatus3D() {
  const on = !!S.play && (S.mode === 'playing' || (S.mode === 'paused' && !!board3d.failure));
  ui.setBoardStatus3D(on ? board3d : {});
  if (on && board3d.failure) input.exitLock();
  if (on && (board3d.failure || board3d.generating)) focusStatus('m3d', board3d);
}
/** The failed board's offer: Retry with a new seed, or the same size with no-guess off; over the pause card it resumes play. */
function retry3D(kind) {
  const play = S.play;
  if (!play || !board3d.failure) return;
  board3d.failure = null;
  const r = kind === 'retry' ? play.retry() : play.playStandard();
  if (kind === 'standard') { board3dChoice = { ...board3dChoice, noGuess: false }; ui.setBoard(board3dChoice); } // a restart keeps the standard board
  placeAtSpawn();
  showStatus3D();
  if (padGesture || S.lockless) {
    if (S.mode === 'paused') PAUSE.resume('pad');
    else setLockless(true);
  } else input.requestLock(); // from the pause card too: the lock enters play
  r?.then((res) => { if (res && S.play === play) actionSounds('left', res); });
}

/**
 * The camera at the game's spawn pose (js/input.js spawnPose): the whole box framed from three
 * quarters, at the current spacing and the window's field of view and aspect. Every start and the
 * return to start (Home, R, the pause card's "Back to start") come through here.
 */
function placeAtSpawn() {
  if (!S.game) return;
  const three = renderer.camera;
  cam.place(spawnPose(S.game, S.spacing, three.fov, three.aspect));
  needRender = true;
}

function setLockless(on) {
  S.lockless = on;
  document.body.classList.toggle('lockless', on);
  document.body.classList.toggle('drag-look', on && S.dragLook); // the system cursor shows
}
/**
 * A new 3D board entered as resume enters play: a controller, or drag-to-look play, enters lockless
 * play; otherwise pointer lock is asked for.
 */
function enterPlay3D(source) {
  if (S.dragLook) enterPlaying(true);
  else if (source === 'pad') padResume();
  else input.requestLock();
}
/** The ready card's "Play with drag-to-look": lockless play the mouse drives by dragging, until the game is left. */
function enterDragLook() {
  if (S.mode !== 'ready') return;
  sfx.unlock();
  S.dragLook = true;
  enterPlaying(true);
}

/** The ready card hands over to play; resuming from the pause card unwinds back to play. */
function enterPlaying(lockless = false) {
  SHELL.go('playing', { data: { lockless }, replace: SHELL.current === 'ready' });
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
  input.spaceToggle.reset(); // a tapped-on aim-through is dropped like a held key
  controls.releasePad();
  input.drag.reset();
  document.body.classList.remove('lockless', 'drag-look');
}
function pauseInfo(note = '') {
  if (MODES.active === 'classic-2d') return { ...mode2d.status(), note, mode: MODES.active };
  const g = S.game;
  const e = S.endState;
  return { state: g.state, time: e ? e.time : S.time, minesLeft: e ? e.minesLeft : g.minesLeft, note, mode: '3d' };
}

function makeDemo() {
  const mines = new Set();
  while (mines.size < 30) mines.add(Math.floor(Math.random() * 343));
  const play = create3DGame({ X: 7, Y: 7, Z: 7, minePositions: [...mines] });
  const g = play.view;
  // reveal a few safe cells on the outer shell and flag a few mines, purely decorative
  const shell = (idx) => {
    const [i, j, k] = g.coords(idx);
    return i === 0 || j === 0 || k === 0 || i === 6 || j === 6 || k === 6;
  };
  const closed = () => { let c = 0; for (let idx = 0; idx < g.n; idx++) c += !g.pressed[idx]; return c; };
  for (let t = 0; t < 400 && closed() > g.n * 0.55; t++) {
    const idx = Math.floor(Math.random() * g.n);
    if (shell(idx) && g.number[idx] > 0 && !g.pressed[idx]) play.reveal(idx);
  }
  let flags = 0;
  for (let idx = 0; idx < g.n && flags < 8; idx++) if (g.number[idx] === -1 && shell(idx) && Math.random() < 0.5) { play.toggleFlag(idx); flags++; }
  return g;
}

function showMainMenu() { SHELL.go('menu'); }
/** The menu screens show the decorative demo board behind them. */
const BACKDROP_SCREENS = new Set(['menu', 'board-choice', 'coming-soon', 'records', 'classic-2d-choice', 'settings']);
function onBackdrop() { return BACKDROP_SCREENS.has(S.mode); }
/** The 3D leave: drop the game and release pointer lock, lockless play and drag-to-look play. */
function leaveGame() {
  input.exitLock();
  S.dragLook = false;
  setLockless(false);
  S.play?.leave();
  S.game = null;
  S.play = null;
  board3d.generating = false;
  board3d.failure = null;
  ui.setBoardStatus3D({});
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
  if (reloading || ending3D()) return; // a game in its end delay is over: nothing to lose
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
  for (const id of ['pause', 'ready', 'menu', 'board-choice', 'coming-soon', 'records', 'settings', 'c2d-choice', 'c2d', 'c2d-status', 'm3d-status', 'controls-modal']) {
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
  for (const id of ['pause', 'ready', 'menu', 'board-choice', 'coming-soon', 'records', 'settings', 'c2d-choice', 'c2d', 'c2d-status', 'm3d-status', 'controls-modal']) {
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
    if (info.wasActive && (S.mode === 'playing' || S.mode === 'classic-2d')) pauseGame('pad', { note: 'Controller disconnected' });
    else ui.toast('Controller disconnected');
  },
});
function updatePadUi() {
  const p = pads.activePad();
  DEVICE.connected(!!p);
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
// The board status cards sit above the pause card, and take their default focus from the card.
const LAYER_SCREEN = {
  'ctx-lost': 'ctxlost', 'controls-modal': null, 'c2d-status': null, 'm3d-status': null, replay: 'replay', pause: 'paused', ready: 'ready', results: 'results',
  'coming-soon': 'coming-soon', records: 'records', settings: 'settings', 'board-choice': 'board-choice', 'c2d-choice': 'classic-2d-choice', c2d: 'classic-2d', menu: 'menu',
};
const SCREEN_LAYER = Object.fromEntries(Object.entries(LAYER_SCREEN).filter(([, s]) => s).map(([l, s]) => [s, l]));
const MODAL_FOCUS = '#controls-close';
const STATUS_LAYERS = { 'c2d-status': ['c2d', board2d], 'm3d-status': ['m3d', board3d] };
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
/** The layer's declared default target: its screen's (SHELL), a board status card's, or the controls modal's close button. */
function padDefault(layer, items) {
  const screen = LAYER_SCREEN[layer.id];
  const status = STATUS_LAYERS[layer.id];
  const target = status ? statusFocus(...status) : screen ? SHELL.defaultFocus(screen) : MODAL_FOCUS;
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
/** The control the spatial search picks from `cur` in `dir` inside the layer, or null. */
function navStep(layer, items, cur, dir) {
  return pickInDirection(cur.getBoundingClientRect(), items.filter((e) => e !== cur).map((e) => ({ rect: e.getBoundingClientRect(), item: e })), dir);
}
function padNav(dir) {
  const layer = padLayer();
  if (!layer) return;
  const items = padFocusables(layer);
  const cur = padCurrent(layer, items);
  if (!cur) { padFocus(padDefault(layer, items)); return; }
  document.body.classList.add('pad-nav');
  if ((dir === 'left' || dir === 'right') && cur.type === 'range') { padStep(cur, dir === 'right' ? 1 : -1); return; }
  const next = navStep(layer, items, cur, dir);
  if (next) padFocus(next);
}
// The arrow keys walk every layer the D-pad walks, except the boards, Records and the replay viewer,
// which have arrow handling of their own.
const KEY_NAV_OFF = new Set(['playing', 'classic-2d', 'records', REPLAY_SCREEN]);
/** Keyboard focus: the kit's keyboard ring (:focus-visible), never the controller's. */
function keyFocus(el) {
  if (!el) return;
  document.body.classList.remove('pad-nav');
  el.focus({ preventScroll: true, focusVisible: true });
  el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
}
/**
 * An arrow key: the D-pad's focus move in the topmost layer, unless the focused control owns the
 * arrow or already handled it; with nothing focused, the layer's default focus.
 */
function keyNav(dir, e) {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || KEY_NAV_OFF.has(S.mode)) return;
  const layer = padLayer();
  if (!layer) return;
  const items = padFocusables(layer);
  const cur = padCurrent(layer, items);
  if (cur && keepsArrow(cur, dir)) return;
  e.preventDefault();
  keyFocus(cur ? navStep(layer, items, cur, dir) : padDefault(layer, items));
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
  window.addEventListener(t, () => {
    DEVICE.input('pointer');
    if (document.body.classList.contains('pad-nav')) document.body.classList.remove('pad-nav');
  }, true);
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
  else if (S.mode === REPLAY_SCREEN) padReplay(p, held, pressed, now);
  else padMenus(p, held, pressed, now);

  if (ui.isControlsOpen() !== modal) layerChanged(); // screen changes report through the router
}

function padPlaying(p, held, pressed, dt, now) {
  if (ending3D()) { controls.releasePad(); return; } // the end delay: Start, Back, triggers and sticks are ignored
  if (board3d.failure || board3d.generating) { padStatus3D(p, held, pressed, now); return; }
  if (pressed(BTN.START)) { padClick(document.getElementById('hud-pause')); return; } // the overlay's pause button
  if (backButtons(S.mode).some(pressed)) { backGame('pad'); return; } // Back while playing = Pause, or cancels a board being generated
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
 * The Classic 2D board: Start pauses through the overlay's pause button and the back buttons are
 * Back (Pause, or cancelling a board being generated); the board status card is a menu, and
 * everything else goes to the board's cursor input.
 */
function padBoard2D(p, held, pressed, now) {
  controls.releasePad();
  if (padUsed(p)) used2D();
  if (pressed(BTN.START)) { padClick(document.getElementById('hud-pause')); return; }
  if (backButtons(S.mode).some(pressed)) { backGame('pad'); return; }
  if (board2d.failure || board2d.generating) { padMenus(p, held, pressed, now); return; }
  mode2d.pad({ ...p, held: p.held.map((_, b) => held(b)) }, now);
}

/** The replay viewer: Start / Y play and pause, LB / RB step, LT / RT change speed; the rest is menu navigation. */
function padReplay(p, held, pressed, now) {
  controls.releasePad();
  if (!REPLAY_VIEWER.pad(pressed)) padMenus(p, held, pressed, now);
}

/**
 * The 3D board status card over the box: Start pauses, the back buttons are Back (cancelling a
 * board being generated, else Pause); the card is navigated as a menu.
 */
function padStatus3D(p, held, pressed, now) {
  controls.releasePad();
  if (pressed(BTN.START)) { padClick(document.getElementById('hud-pause')); return; }
  if (backButtons(S.mode).some(pressed)) { backGame('pad'); return; }
  padMenus(p, held, pressed, now);
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

/** The cell under the crosshair of the renderer's camera, on `g` drawn at `spacing`. */
function aimedCell(g, spacing, space) {
  const three = renderer.camera;
  three.getWorldDirection(tmpDir);
  const n = three.near;
  const o = { x: three.position.x + tmpDir.x * n, y: three.position.y + tmpDir.y * n, z: three.position.z + tmpDir.z * n };
  return pickCell(g, spacing, o, tmpDir, space);
}
function updatePick() {
  const g = S.game, three = renderer.camera;
  const space = renderer.toggles.space;
  const key = `${cam.x},${cam.y},${cam.z},${cam.yaw},${cam.pitch},${S.spacing},${g.version},${space},${three.aspect}`;
  if (key === S.pickKey) return;
  S.pickKey = key;
  S.selected = aimedCell(g, S.spacing, space);
  renderer.setSelected(S.selected);
  ui.setCrosshair(S.selected >= 0);
}
/** The off-screen arrow on the crosshair ring, toward the box while none of it is in view; only in 3D play. */
function updateArrow(on) {
  const g = S.game, three = renderer.camera;
  const key = on ? `${cam.x},${cam.y},${cam.z},${cam.yaw},${cam.pitch},${S.spacing},${g.X},${g.Y},${g.Z},${three.fov},${three.aspect}` : '';
  if (key === S.arrowKey) return;
  S.arrowKey = key;
  ui.setArrow(on ? offscreenArrow(cam, g, S.spacing, three.fov, three.aspect) : null);
}
/** A 3D replay aims as its player did: the recorded camera's cell glows. */
function updateReplayPick() {
  const v = replay3d.view, c = replayCam;
  const space = renderer.toggles.space;
  const key = `${c.x},${c.y},${c.z},${c.yaw},${c.pitch},${v.version},${space},${renderer.camera.aspect}`;
  if (key === replay3d.pickKey) return;
  replay3d.pickKey = key;
  renderer.setSelected(aimedCell(v, REPLAY_SPACING, space));
}
/** Synchronous camera/pick refresh (used by the debug hook between frames). */
function refresh() {
  if (!S.game || onBackdrop()) return;
  cam.apply(renderer.camera);
  const playing = S.mode === 'playing';
  if (!ending3D()) renderer.setToggles(playing && controls.shift, playing && controls.space, playing && controls.ctrl);
  renderer.setSpacing(S.spacing);
  updatePick();
}
let last = performance.now();
const fps = { frames: 0, acc: 0, value: 0 };
const stats = { renders: 0, skipped: 0 };

// Render on demand: skip the GL draw when nothing visible changed.
let needRender = true;
// The 3D scene's sky, fog and background follow the theme: the active theme's palette is handed to the
// renderer now and on every theme change, so the demo board, a game, the pause card and the 3D replay
// all switch at once.
bindScenePalette({ token, onThemeChange, renderer, onApplied: () => { needRender = true; } });
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
  if (S.mode === 'results' && RESULTS.current?.mode === '3d') return false; // the results screen takes over the 3D scene
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
  if (pad.pad && padUsed(pad)) DEVICE.input('pad');
  if (pad.pad || pad.active) handlePad(pad, dt, now);
  if (MODES.active === 'classic-2d') mode2d.tick();
  // A 3D replay moved since the last frame by something other than its playback (the seek bar, a step,
  // Home / End) was seeked: the renderer takes that without pulses.
  const replayed = S.mode === REPLAY_SCREEN && replay3d.view !== null;
  if (replayed && REPLAY_VIEWER.state.time !== replay3d.time) renderer.sync({ seek: true });
  if (S.mode === REPLAY_SCREEN) REPLAY_VIEWER.tick(rawDt * 1000);
  if (replayed) replay3d.time = REPLAY_VIEWER.state.time;

  const three = renderer.camera;
  const playing = S.mode === 'playing';
  if (onBackdrop()) {
    S.orbit += dt * 0.12;
    const r = 62;
    three.position.set(Math.sin(S.orbit) * r, 24 + Math.sin(S.orbit * 0.7) * 10, Math.cos(S.orbit) * r);
    three.lookAt(0, 0, 0);
    three.updateMatrixWorld(true);
    renderer.setToggles(false, false, false);
  } else if (replay3d.view) {
    replayCam.apply(three); // the recorded camera and view mode
    const t = replay3d.toggles;
    renderer.setToggles(t.shift, t.space, t.ctrl);
  } else {
    const frozen = ending3D(); // the end delay: the camera and the view mode stay as the game ended
    if (playing && !frozen) {
      cam.move(dt, input.move);
      if (controls.hasAxes) cam.moveAxes(dt, controls.axes.f, controls.axes.r, controls.axes.u);
    }
    cam.apply(three);
    if (!frozen) {
      const shift = playing && controls.shift, space = playing && controls.space, ctrl = playing && controls.ctrl;
      renderer.setToggles(shift, space, ctrl);
      ui.setModes(shift, space, ctrl);
    }
  }
  if (MODES.active === '3d') mode3d.tick(); // the replay's camera sampler
  renderer.setSpacing(replay3d.view ? REPLAY_SPACING : S.spacing);
  const synced = renderer.sync();

  // picking: only when something relevant changed
  const g = S.game;
  if (replay3d.view) updateReplayPick();
  else if (g && !onBackdrop()) {
    updatePick();
    updateArrow(playing && !ending3D());
    // the timer is the session's: it runs through pauses, frozen at the end
    if (S.play && S.started && !S.endState) S.time = S.play.elapsedMs() / 1000;
    const e = S.endState;
    ui.updateHud(e ? e.time : S.time, e ? e.minesLeft : g.minesLeft, e ? e.clicks : clicks3D());
    if (playing && !ending3D()) aimHint(g, now);
    else AIM_DWELL.reset();
  }

  // the running time on the pause card while it shows
  if (S.mode === 'paused' && (MODES.active === 'classic-2d' ? mode2d.status() : S.game)) ui.updatePause(pauseInfo());

  if (shouldRender(now, synced)) {
    needRender = false;
    renderer.render();
    stats.renders++;
  } else stats.skipped++;
  requestAnimationFrame(frame);
}

await Promise.all([settingsLoaded, recordsLoaded, firstUseLoaded, LAST_CHOICE_3D.load().catch(() => {})]);
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
  /** The spawn pose of an X × Y × Z box at the current spacing, field of view and aspect. */
  spawnPose: (X, Y, Z) => spawnPose({ X, Y, Z }, S.spacing, renderer.camera.fov, renderer.camera.aspect),
  THREE,
  start(X, Y, Z, mines, minePositions) { MODES.start('3d', { X, Y, Z, mines, minePositions }); },
  /** Enter playing mode without pointer lock (headless tests). */
  forcePlay() { enterPlaying(true); },
  get controls() { return controls; },
  get pads() { return pads; },
  pause() { pauseGame('key'); },
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
  get replayViewer() { return REPLAY_VIEWER; },
  /** Opens the replay viewer: `data` is its route's { replay | replayId, returnTo }. */
  watch: (data) => SHELL.go(REPLAY_SCREEN, { data }),
};
