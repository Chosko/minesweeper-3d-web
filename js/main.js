// Entry point: wires game logic, renderer, input and UI together.
import * as THREE from 'three';
import { BoardRenderer } from './render.js';
import { FlyCamera, OrbitCamera, orbitRange, MouseActions, Input, KeyLook, SPACING_MIN, SPACING_MAX, SPACING_START, spacingStep, spacingToggle, spawnPose, offscreenArrow, escResumes } from './input.js';
import { pickCell, pickCellBrute } from './picking.js';
import { UI, clampSettings, NO_MOUSE_MSG } from './ui.js';
import * as audio from './audio.js';
import { Controls } from './controls.js';
import { createTouch3D, mountTouch3D, applyTouchStick, touchZone, VIBRATE_MS } from './touch-3d.js';
import { GamepadReader, BTN, Repeat, stickCurve, padGlyphs, pickInDirection, STICK_DEADZONE, PAD_PRESS, PAD_FLAG, PAD_BOOM, padPulse } from './gamepad.js';
import { createRouter } from './shell/router.js';
import { FOCUSABLE, topLayer, resolveFocus, focusMove, inertSections, tabWrap, isBackKey, arrowDirection, keepsArrow, backButtons, createHeldSuppressor } from './shell/navigation.js';
import { createHistorySync, storedSet } from './shell/history.js';
import { createModeHost } from './shell/mode-host.js';
import { create3DMode, createFiguresFeed } from './shell/mode-3d.js';
import { createSession, create3DGame } from './mode3d/session.js';
import { createSampler3D } from './replay/sampler-3d.js';
import { createGenerationClient } from './generation/client.js';
import { createMenu, createLastMode, createLastBoardChoice, openingEntry, menuPreview, entryReasonLine, buildLabel, DEMO_BOARD_3D, UNAVAILABLE_REASONS, WEB_MISSING } from './shell/menu.js';
import { VERSION } from './version.js';
import { bindMenuPreview, demoBoard2D, dailyBoard2D } from './shell/menu-preview.js';
import { boardBests } from './shell/returning.js';
import { aimReadout } from './readability.js';
import { createFirstUse, stripShown, hidCube, aimHintCell, createDwell, AIM_DWELL_MS } from './shell/first-use.js';
import { createActiveDevice } from './settings/bindings.js';
import { createPauseController, restartInput, RESTART_NOTICE } from './shell/pause.js';
import { createLockFallback } from './shell/lock-fallback.js';
import { createEndSkip } from './shell/end-skip.js';
import { bindScenePalette, parseRgb } from './shell/scene-palette.js';
import { token, onThemeChange } from './tokens.js';
import { themeApplier } from './themes/applier.js';
import { bindBoardArt } from './shell/board-art.js';
import { BOARD_ART } from './classic2d/tile-skin.js';
import { storage, blobStore } from './platform/index.js';
import { createSettingsStore } from './settings/store.js';
import { createRecordsStore } from './records/store.js';
import { countedClicks } from './records/summary.js';
import { createResultsFlow } from './results/flow.js';
import { createReplayLibrary } from './replay/library.js';
import { createReplayViewer, createReplayView } from './replay/viewer.js';
import { mountViewer2D } from './replay/viewer-2d.js';
import { panelRect, mountBoardView, BOARD_FRAME } from './classic2d/board-view.js';
import { createViewer3D } from './replay/viewer-3d.js';
import { REPLAY_SCREEN } from './records/replay-list.js';
import { createResultsView, resultsContent, resultsEnter, LOOK_REFUSED } from './results/view.js';
import { copyBoardCode, applyIcons } from './ui/components.js';
import { DAILY_SCREEN, dailyModes, dailyPanel, createDailyBoards, bindDailyScreen, countedAttempt, dailyPreview } from './shell/daily.js';
import { resolveCode, gameStart, freeStart, createChallengeLinks } from './shell/challenge.js';
import { dailyGame, dateText } from './records/board-code.js';
import { boardLabel, boardKey, createBoardIdentity, MODE_3D } from './records/board.js';
import { createRecordsScreen, createRecordsView, TRIGGER_MODES } from './records/screen.js';
import { createRecordsViewPrefs } from './records/view-prefs.js';
import { createRecordsExport, bindExportActions } from './records/export.js';
import { applySettings, pixelRatioFor } from './settings/appliers.js';
import { bindSettingControls } from './settings/page.js';
import { createReset } from './settings/reset.js';
import { createClassic2DMode } from './classic2d/mode.js';
import { createButtonSwap } from './classic2d/button-swap.js';
import { bindBoardChoice } from './classic2d/board-choice.js';
import { createLastChoice, DEFAULT_CHOICE } from './classic2d/board-setup.js';
import {
  bindBoardChoice as bindBoardChoice3D, boardOf, normaliseChoice as normaliseChoice3D, DEFAULT_CHOICE as DEFAULT_CHOICE_3D,
  LAST_CHOICE_DOC as LAST_CHOICE_DOC_3D, LAST_CHOICE_VERSION as LAST_CHOICE_VERSION_3D,
} from './mode3d/board-choice.js';
import { LEARN_BOARD, LEARN_HINTS, learnChoice, createLearnPrompts, closedAround } from './mode3d/learn.js';

const canvas = document.getElementById('scene');

/**
 * The 3D renderer, or null in a browser without WebGL 2: three.js's WebGLRenderer needs it and
 * throws without it. three.js's own report of that refusal is expected and kept off the console;
 * anything else it reports while the renderer is made is passed on.
 */
function createRenderer() {
  const held = [];
  const before = THREE.getConsoleFunction();
  THREE.setConsoleFunction((level, ...args) => held.push([level, args]));
  let made = null;
  let failure = null;
  try {
    made = new BoardRenderer(canvas);
  } catch (err) {
    failure = err;
  } finally {
    THREE.setConsoleFunction(before);
  }
  const refused = !!failure && /Error creating WebGL context/.test(failure.message);
  for (const [level, args] of held) {
    if (refused && level === 'error') continue;
    if (before) before(level, ...args);
    else console[level === 'error' || level === 'warn' ? level : 'log'](...args);
  }
  if (failure && !refused) console.error(failure);
  return made;
}
const renderer = createRenderer();
/**
 * Whether the 3D game can run: the one flag every 3D-only path reads. Without WebGL 2 the shell
 * starts all the same — Classic 2D, Records and Settings run, the menu screens show a static
 * background, the 3D entry is disabled with its reason and a 3D replay says why it cannot play.
 */
const WEBGL2 = renderer !== null;
document.body.classList.toggle('no-webgl2', !WEBGL2);

const sfx = audio.sfx ?? new audio.Sfx();
const cam = new FlyCamera();
// The Camera setting's Orbit drives the same camera around the board centre; setCameraMode is its one writer.
const orbitCam = new OrbitCamera(cam);
let cameraMode = 'fly';
/** What the 3D camera inputs turn: the orbit while the Camera setting is Orbit, else the flight camera. */
const view3D = () => (cameraMode === 'orbit' ? orbitCam : cam);

// Pointer lock / input device support
const LOCK_SUPPORTED = 'requestPointerLock' in Element.prototype;
const COARSE_ONLY = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches);
const NO_MOUSE = !LOCK_SUPPORTED || COARSE_ONLY;
/**
 * Every pointer-lock request of the 3D game: none on a coarse-only device, which plays 3D lockless by
 * touch (js/touch-3d.js) or with a controller; whether one was made.
 */
function requestLock3D() {
  if (COARSE_ONLY) return false;
  input.requestLock();
  return true;
}
// S.mode is the router's current screen: 'menu' | 'board-choice' | 'coming-soon' | 'records' | 'classic-2d-choice' | 'settings' | 'ready' |
// 'playing' | 'classic-2d' | 'paused' | 'results' | 'ctxlost' (defined below).
const S = {
  settings: null,
  game: null, // the 3D state view of the game shown (its session's view), or null
  play: null, // that game's session (js/mode3d/session.js): actions, timer, board request
  demo: null,
  spacing: SPACING_START,
  selected: -1,
  readout: null, // the aimed cell's readout (updatePick), or null; shown by updateReadout
  started: false, // the first reveal has been applied to the generated board
  time: 0, // the session's timer in seconds, read once per frame while it runs
  endState: null, // frozen { state, time, minesLeft } once the game is over
  pickKey: '',
  arrowKey: '', // the off-screen arrow's inputs when last drawn
  orbit: 0,
  lockless: false, // playing without pointer lock (controller session, drag-to-look, or the debug hook)
  dragLook: false, // drag-to-look play: the browser blocks pointer lock; ends when the game is left
  learn: null, // the Learn 3D prompt sequence while the guided board is the game (js/mode3d/learn.js), else null
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
  if (!g || S.selected < 0 || looking()) return;
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
  if (S.learn) learnAction(type, sel, r);
  actionSounds(type, r, onNumber);
  if (g.version === v0 && before === 'playing' && g.state === 'playing' && typeof sfx.noop === 'function') sfx.noop(); // action changed nothing
}
/** The live feedback of an action: its sound, rumble, and the flash of the cubes a flag click on a number changed. */
function actionSounds(type, r, onNumber = false) {
  noteAutoHide(r);
  if (type === 'right') {
    if (r.flagged || r.unflagged) sfx.flag(r.flagged >= r.unflagged, r.flagged + r.unflagged); // the sound grows with the count
    if (onNumber && (r.flagged || r.unflagged)) renderer.flash(Array.from(r.changed).filter((c) => !S.game.pressed[c]));
    if (padActing && (r.flagged || r.unflagged)) padRumble(PAD_FLAG);
  } else if (r.exploded) boom();
  else if (r.revealed > 0) {
    if (type === 'left') sfx.reveal(r.revealed);
    else sfx.chord(r.revealed);
  }
}
function boom() { sfx.explode(); ui.flash(); padRumble(PAD_BOOM); }
/** The first time auto-hide hides a cube in any 3D game, a toast says so; once per browser. */
function noteAutoHide(r) {
  if (S.learn || FIRST_USE.shown('autoHideToast') || !S.game || !hidCube(S.game, r.changed)) return;
  if (FIRST_USE.once('autoHideToast')) ui.toast(ui.hint('autoHide'), 4000);
}
/**
 * The end of the 3D game: the HUD freezes and the end effect plays; the 3D mode's end delay then
 * hands over to the results screen. Until then a press ends the delay and nothing else acts (endDelay).
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
/** The mode whose game the shell is hosting (js/shell/mode-3d.js or js/classic2d/mode.js), or null. */
function activeMode() { return MODES.active === '3d' ? mode3d : MODES.active === 'classic-2d' ? mode2d : null; }
/**
 * The active game's end delay is running, in either mode: the game is over and its results screen
 * not yet shown. No board action, camera movement, view-mode key, Back or pause; a press ends it
 * (END_SKIP).
 */
function endDelay() { return !!activeMode()?.ending; }
/** Every pause goes through here: none is offered while an end delay runs, nor in the look at a finished 3D board. */
function pauseGame(source, opts) { return endDelay() || looking() ? false : PAUSE.pause(source, opts); }
/** The look at the finished 3D board (Look at the board on its results card): read-only free flight. */
const LOOK_SCREEN = 'look';
function looking() { return S.mode === LOOK_SCREEN; }
/** Back on the board (Esc, the controller's back button): cancels a board being generated, else pauses. */
function backGame(source) { return endDelay() ? false : PAUSE.back(source === 'pointer' ? 'button' : source); }
/** F2, Start + Y and R do nothing during an end delay or while a confirmation or the controls modal shows. */
function restartBlocked() { return endDelay() || ui.isConfirmOpen() || ui.isControlsOpen(); }
/**
 * F2 (in play and on the pause card: restart) and R (on the results screen: Play again), without
 * Ctrl, Alt or Meta; whether the key acted. F2's browser default is always prevented.
 */
function restartKey(code, e) {
  if (e?.ctrlKey || e?.altKey || e?.metaKey) return false;
  if (code === 'F2') e?.preventDefault();
  const action = restartInput(code, { screen: S.mode, blocked: restartBlocked() });
  if (action === 'restart') PAUSE.restart('key');
  else if (action === 'playAgain') RESULTS.playAgain('key');
  return action !== null;
}
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
  isActive: () => (S.mode === 'playing' && !endDelay()) || looking(), // the look flies with mouse look, keys and wheel; its presses are LOOK_END's
  isDragLook: () => S.dragLook && S.lockless,
  // Enter / ' act where the mouse buttons and the triggers act on the board; the arrows look where the mouse looks
  canAct: () => S.mode === 'playing' && !endDelay() && !board3d.failure && (input.locked || S.lockless),
  canLook: () => (S.mode === 'playing' && !endDelay() && !board3d.failure) || looking(),
  onLook: (dx, dy) => view3D().look(dx, dy),
  onWheel: (notches) => wheel3D(notches),
  onKey: (code, e) => {
    if (isBackKey(code)) { shellBack('key'); return; }
    if ((code === 'Home' || code === 'KeyR') && input.o.isActive()) { placeAtSpawn(); return; } // back to the start view, in 3D play only
    if (code === 'KeyX' && input.o.isActive()) { setSpacing(spacingToggle(S.spacing)); return; } // spacing 1.1 / 2.0, in 3D play only
    if (restartKey(code, e)) return; // F2 restarts in play and on the pause card; R plays again on the results screen
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
      else if (lookPending && S.mode === 'results') { lookPending = false; SHELL.go(LOOK_SCREEN); } // Look at the board's own lock
    } else if (END_SKIP.lockLost()) { // the browser's Esc, whose key press the page never sees, ends the end delay
    } else if (LOOK_END.lockLost()) { // the browser's Esc releasing the look's lock: back to the results card
    } else if (S.mode === 'playing' && !S.lockless && !board3d.failure) { // a failed board released the lock for its offer
      if (performance.now() - cancelledAt < 500) SHELL.go('ready', { replace: true }); // the Esc that cancelled the board
      else if (!document.hasFocus()) pauseGame('key'); // the window lost focus
      else backGame('key'); // the browser's own Esc released the lock: Back, which cancels a board being generated
    }
  },
  onLockError: () => {
    if (lookPending) { lookPending = false; if (S.mode === 'results') refusedLook(); } // the card stays, with its note
    else if (S.mode === 'paused' || S.mode === 'ready') {
      const msg = NO_MOUSE ? NO_MOUSE_MSG : LOCK_FALLBACK.refused(performance.now(), input.unlockedAt);
      SHELL.go('ready', { data: { msg } });
    }
  },
});
const controls = new Controls(input); // keyboard + controller view modes, controller move axes, touch toolbar toggles
// Touch play in 3D, on a coarse-only device: the gestures drive the mouse's own MouseActions, the camera
// look, the spacing and (through the frame loop) the stick's move; a tap in the look at a finished board
// brings the results card back, as a mouse press does there.
const touch3D = createTouch3D({
  mouse,
  canAct: () => input.canAct(),
  canMove: () => input.o.isActive(),
  onLook: (dx, dy) => view3D().look(dx, dy),
  onSpacing: (n) => setSpacing(spacingStep({ spacing: S.spacing }, n).spacing),
  onTap: () => { if (looking()) endLook(); },
  vibrate: () => { try { navigator.vibrate?.(VIBRATE_MS); } catch { /* no vibration */ } },
});
/** The scene's touch zones: the left half the stick, the right half the look, below the overlay's top row. */
function touchZone3D(x, y) {
  return touchZone(x, y, { width: canvas.clientWidth, top: ui.overlayBottom3D() });
}
if (COARSE_ONLY) mountTouch3D({ canvas, touch: touch3D, zone: touchZone3D });
/** Touch play shows the toolbar and the stick: a coarse-only device in 3D play or the look at its finished board. */
function syncTouch3D() {
  const on = COARSE_ONLY && MODES.active === '3d' && (S.mode === 'playing' || looking());
  document.body.classList.toggle('touch-play', on);
  if (!on) { touch3D.reset(); ui.setStick(null); }
}
/** The touch toolbar's view modes latch until the game ends: a new game, a restart and the leave clear them. */
function clearTouchModes() {
  controls.clearTouch();
  ui.setTouchModes(controls.touch);
}
const keyLook = new KeyLook(); // the arrows' look, ramped from each press

// Fullscreen + Keyboard Lock (where supported) so Ctrl+W/Ctrl+S etc. reach the game instead of the browser.
const LOCK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'];
// The fullscreen setting's applier calls these; F flips the setting.
function enterFullscreen() {
  const d = document;
  const el = d.documentElement;
  if (!el.requestFullscreen) return Promise.reject(new Error('fullscreen is not supported'));
  return el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
    navigator.keyboard?.lock?.(LOCK_KEYS).catch(() => {});
    if (S.mode === 'playing' && !S.lockless && !d.pointerLockElement) requestLock3D();
  });
}
function exitFullscreen() { return document.exitFullscreen?.(); }
function toggleFullscreen() { SETTINGS.set('fullscreen', !document.fullscreenElement); }
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) navigator.keyboard?.unlock?.(); });

/**
 * Every spacing change in play (the wheel, the D-pad, X, the debug hook): the camera's position scales
 * about the board centre with it, so it keeps its place among the cells (the aimed cube, the framing,
 * the replay sampler's cell-unit sample), and the tools strip shows it.
 */
function setSpacing(s) {
  const next = Math.min(SPACING_MAX, Math.max(SPACING_MIN, s));
  if (next !== S.spacing) {
    const ratio = next / S.spacing;
    cam.rescale(ratio);
    if (cameraMode === 'orbit' && S.game) orbitCam.rescale(ratio, orbitRangeAt(next)); // the orbit distance follows, within its range
  }
  S.spacing = next;
  ui.setSpacing(next);
}
let wheelRun = { spacing: SPACING_START }; // the wheel's run of notches (spacingStep), for its acceleration
/** Wheel notches (fractional on a trackpad), timed on arrival: quick notches step further. */
function wheelSpacing(notches) {
  wheelRun = spacingStep({ ...wheelRun, spacing: S.spacing }, notches, performance.now());
  setSpacing(wheelRun.spacing);
}
/** The wheel in 3D play and the look: the spacing in Fly, the orbit's dolly in Orbit (spacing stays on X and the D-pad). */
function wheel3D(notches) {
  if (cameraMode === 'orbit') orbitCam.wheel(notches);
  else wheelSpacing(notches);
}
/** The orbit's dolly range for the 3D game at `spacing`, at the window's field of view and aspect. */
function orbitRangeAt(spacing) {
  return orbitRange(S.game, spacing, renderer.camera.fov, renderer.camera.aspect);
}
/**
 * The Camera setting's applier (js/settings/appliers.js applyCamera) — the only writer of the 3D camera's
 * mode, also mid-game: Fly to Orbit keeps yaw and pitch, takes the distance to the board centre within
 * the dolly range and re-aims at the centre; Orbit to Fly keeps the pose. The help surfaces follow it.
 */
function setCameraMode(mode) {
  if (mode === cameraMode) return;
  cameraMode = mode;
  if (mode === 'orbit' && S.game) { orbitCam.setRange(orbitRangeAt(S.spacing)); orbitCam.enter(); }
  ui.setCamera(mode);
  needRender = true;
}
function toggleSound() { SETTINGS.set('muted', !SETTINGS.get('muted')); }

// ---------- screens ----------
// Clicks made with the controller (A) are not user gestures for pointer lock: they enter lockless play.
// The Classic 2D mouse button swap: one switch for the page, kept across games, off again on reload.
const BUTTON_SWAP = createButtonSwap();
const ui = new UI({
  onMenuEntry: (id) => onMenuEntry(id),
  onBack: () => shellBack('pointer'),
  onReadyClick: () => { sfx.unlock(); if (COARSE_ONLY) enterPlaying(true); else if (padGesture) padResume(); else requestLock3D(); }, // a coarse-only device: lockless touch play
  onReadyDrag: () => enterDragLook(),
  onReadyLearn: () => startLearn(),
  onLearnEnd: (won) => (won ? playCubeIntro() : PAUSE.restart(padGesture ? 'pad' : 'pointer')), // Try again restarts the guided board
  onLearnBack: () => SHELL.go('board-choice'),
  onResume: () => PAUSE.resume(padGesture ? 'pad' : 'pointer'),
  onBackToStart: () => { placeAtSpawn(); PAUSE.resume(padGesture ? 'pad' : 'pointer'); }, // a 3D game in play: resumes as Resume does
  onRestart: () => PAUSE.restart(padGesture ? 'pad' : 'pointer'),
  onRestartStrip: () => { if (restartInput('F2', { screen: S.mode, blocked: restartBlocked() })) PAUSE.restart('pointer'); }, // either counter strip's Restart: F2's restart
  onMainMenu: () => PAUSE.toMenu(),
  onPause: () => pauseGame(padGesture ? 'pad' : 'button'),
  onReadyBack: () => readyBack(),
  onToggleSwap: () => BUTTON_SWAP.toggle(),
  onTapMode: (value) => { mode2d.setTapMode(value); ui.setTapMode(mode2d.tapMode); }, // the Tap choice's option: what a tap on a closed cell does
  onResetAll: () => RESET.run(),
  onDismissHint: (mode, kind) => { if (kind === 'scroll') FIRST_USE.once('scrollHint'); else FIRST_USE.dismiss(mode); refreshHints(); },
  onRetry2D: () => answer2D(() => mode2d.retry()),
  onStandard2D: () => answer2D(() => { standard2D = true; try { mode2d.playStandard(); } finally { standard2D = false; } }),
  onCancel2D: () => mode2d.cancelGeneration(),
  onOfferMenu2D: () => PAUSE.toMenu(),
  onRetry3D: () => retry3D('retry'),
  onStandard3D: () => retry3D('standard'),
  onCancel3D: () => cancelGeneration(),
  onStandardWait3D: () => standardFromWait3D(),
  onOfferMenu3D: () => PAUSE.toMenu(),
  onLayer: () => applyContainment(), // the Controls modal opened or closed: the menu is inert behind it, live before it takes focus back
  onTouchMode: (mode) => { controls.toggle(mode); ui.setTouchModes(controls.touch); needRender = true; },
});
ui.setNoMouse(NO_MOUSE, COARSE_ONLY);
ui.setTouch3D(COARSE_ONLY);
// The icons the screens' markup names (data-icon), the Settings page's included once the UI built it.
applyIcons(document.body);

// ---------- active device ----------
// The controller while the last input came from a connected controller, else the keyboard and
// mouse; every help surface follows it.
const DEVICE = createActiveDevice({ onChange: (d) => ui.setDevice(d) });
window.addEventListener('keydown', () => {
  DEVICE.input('keyboard');
  document.body.classList.remove('pointer-nav');
}, true);
/** A poll with a press or a stick off its deadzone: the controller is in use. */
function padUsed(p) {
  return p.pressed.some(Boolean) || Math.hypot(p.ls[0], p.ls[1]) > STICK_DEADZONE || Math.hypot(p.rs[0], p.rs[1]) > STICK_DEADZONE;
}

// ---------- theme ----------
// The theme applier takes over from the pre-paint script: the active theme's board module and fonts
// load, a theme that failed falls back with a notice, and the default failing shows the fatal card.
// The fatal card is index.html's #fatal-card template, the one the page shows when main.js fails to load.
function showFatal() {
  document.body.append(document.getElementById('fatal-card').content.cloneNode(true));
}
const THEME = themeApplier();
// The Classic 2D tile skin and the 3D scene draw from the active board module, handed over once its number font loads.
bindBoardArt({ applier: THEME, fonts: document.fonts });
THEME.start({ notice: (text) => ui.toast(text, 4000) }).catch(() => showFatal());

// ---------- settings ----------
// The store loads before the first screen shows; each setting's owner applies it by subscribing.
const SETTINGS = createSettingsStore({
  storage,
  onNotKept: () => ui.toast('Settings cannot be saved in this browser — changes last until you close the game.', 4000),
});
const settingsLoaded = SETTINGS.load();
applySettings(SETTINGS, {
  theme: THEME,
  sfx: typeof sfx.setVolume === 'function' ? sfx : null,
  camera: cam,
  cameraMode: (mode) => setCameraMode(mode),
  resolution: () => applyPixelRatio(),
  fullscreen: { doc: document, enter: enterFullscreen, exit: exitFullscreen },
  fieldOfView: WEBGL2 ? { camera: renderer.camera, redraw: () => { needRender = true; } } : null,
});
SETTINGS.onChange('muted', (m) => ui.setSound(m));
BUTTON_SWAP.onChange((on) => ui.setSwap(on));
// Every setting control — the Settings page, the pause card's shortcuts, the menu's volume — is bound to the store;
// the page's theme list picks through the theme applier.
bindSettingControls(document.querySelectorAll('[data-setting]'), SETTINGS, {
  theme: THEME,
  onUserChange: (key) => { if (key === 'volume' || key === 'muted') sfx.unlock?.(); },
});

// The 3D game asks the generation worker for its no-guess boards: one client for the page, warmed
// when the 3D board choice opens; a session's leave cancels its request.
const GEN_3D = createGenerationClient();

// ---------- screen router ----------
// Every screen change goes through SHELL; each screen declares its default focus and its Back.
const SHELL = createRouter({
  screens: {
    menu: { defaultFocus: () => `#menu-entry-${menuFocusEntry()}`, show: () => { MODES.leave(); showMenuBackdrop(); ui.showMenu(); showPreview(); DAILY_BOARDS_HELD.prepare(RECORDS); } },
    [DAILY_SCREEN]: { defaultFocus: () => DAILY_VIEW.defaultFocus(), show: () => { MODES.leave(); showMenuBackdrop(); ui.showDaily(); showDaily(); } },
    'board-choice': { defaultFocus: '[data-preset][aria-pressed="true"]', show: (d = {}, from) => { MODES.leave(); GEN_3D.warm(); showMenuBackdrop(); ui.showBoardChoice(); showChoice3D(from); } },
    'coming-soon': { defaultFocus: '#coming-soon-back', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showComingSoon(d.title ?? 'This screen'); } },
    records: { defaultFocus: '#records-picker [aria-checked="true"]', show: (d = {}) => { MODES.leave(); showMenuBackdrop(); ui.showRecords(); RECORDS_PAGE.show({ mode: d.mode, boardKey: d.boardKey }); }, hide: () => RECORDS_PAGE.hide() },
    settings: { defaultFocus: '#set-lookSensitivity', show: () => { MODES.leave(); showMenuBackdrop(); ui.showSettings(); SETTINGS_EXPORT.show(RECORDS_EXPORT.hasGames()); } },
    'classic-2d-choice': { defaultFocus: '[data-size][aria-pressed="true"]', show: (d = {}, from) => { MODES.leave(); mode2d.warm(); showMenuBackdrop(); ui.showBoardChoice2D(); showChoice2D(d.choice ?? LAST_CHOICE_2D.current, from); } },
    ready: { defaultFocus: '#ready-btn', show: (d = {}) => ui.showReady(board3dChoice ?? S.settings, LOCK_FALLBACK.readyMessage(d.msg), { rules: FIRST_USE.rules3D && !S.learn, blocked: LOCK_FALLBACK.blocked, learn: FIRST_USE.rules3D && !S.learn && !S.started }), back: ({ source }) => { if (source !== 'key' || performance.now() - input.unlockedAt >= 500) readyBack(); } }, // the Esc that released the pointer lock already meant Back
    playing: { defaultFocus: null, show: (d = {}) => { setLockless(!!d.lockless); ui.showPlaying(); }, back: ({ source }) => backGame(source) },
    'classic-2d': { defaultFocus: null, show: () => ui.showClassic2D(), back: ({ source }) => backGame(source) },
    paused: { defaultFocus: () => (ui.isConfirmOpen() ? '#p-confirm-no' : gameInProgress() ? '#p-resume' : '#p-restart'), show: (d = {}) => { stopPlayInput(); setBoardHidden(true); ui.showPause(pauseInfo(d.note)); }, hide: () => setBoardHidden(false), back: ({ source }) => resumeFromPause(source) },
    'learn-end': { defaultFocus: '#learn-end-primary', show: (d = {}) => ui.showLearnEnd(!!d.won), hide: () => ui.hideLearnEnd(), back: () => SHELL.go('board-choice') },
    results: { defaultFocus: '#r-again', show: (d) => showResults(d ?? RESULTS.current), hide: () => { lookPending = false; RESULTS_VIEW.hide(); }, back: ({ source }) => resultsBack(source) },
    look: { defaultFocus: null, show: () => showLook(true), hide: () => showLook(false), back: () => endLook() },
    [REPLAY_SCREEN]: { defaultFocus: () => REPLAY_VIEWER.defaultFocus(), show: (d = {}) => { ui.showReplay(); REPLAY_VIEWER.show(d); }, hide: () => { REPLAY_VIEWER.hide(); ui.hideReplay(); }, back: () => REPLAY_VIEWER.back() },
    ctxlost: { defaultFocus: '#ctx-lost-btn', show: () => showContextLost(), hide: () => hideContextLost(), back: () => showMainMenu() },
  },
  focus: (target, name) => focusScreen(target, name),
  onChange: () => { layerChanged(); needRender = true; syncScenePanel(); sync3D(); syncTouch3D(); showStatus2D(); refreshHints(); HISTORY.sync(); },
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
if (!WEBGL2) { // no route starts a 3D game without a renderer: the board choice, Play again, the debug hook
  const start = MODES.start;
  MODES.start = (id, choice) => { if (id !== '3d') start(id, choice); };
}
let contextLost = false;
const FLOW_3D = {
  openBoardChoice: () => { if (WEBGL2) SHELL.go('board-choice'); }, // the 3D presets and custom board
  start: (settings, pregenerated) => startGame(settings, pregenerated),
  pause: (note) => showPauseCard(note),
  resume: (source) => resumeGame(source),
  restart: (source, pregenerated, forced = null) => { // entered as resume enters play; a daily or a challenge not yet started stays forced
    const play = startGame(forced ? { ...board3dChoice, forced } : board3dChoice, pregenerated);
    enterPlay3D(source);
    return play;
  },
  leave: () => leaveGame(),
  release: () => input.exitLock(), // the results screen shows
  contextLost: () => contextLost,
  client: GEN_3D, // the pre-generated board of Play again is asked of it
  sampler: (session) => createSampler3D({ session, camera: cam, controls, spacing: () => S.spacing }),
};
// end of 3D flow
const mode3d = MODES.register('3d', (report) => create3DMode(FLOW_3D, report));
// The 3D board choice; the last 3D choice is a platform-storage document kept by the shell.
const LAST_CHOICE_3D = createLastBoardChoice({ storage, doc: LAST_CHOICE_DOC_3D, version: LAST_CHOICE_VERSION_3D, normalise: normaliseChoice3D, fallback: DEFAULT_CHOICE_3D });
/** The records identity of a 3D board as boardOf gives it. */
const identity3D = ({ X, Y, Z, mines, noGuess, daily }) => createBoardIdentity({ mode: MODE_3D, width: X, height: Y, depth: Z, mines, noGuess, daily });
/** The board choice on the last 3D choice; back from the Records screen it opened, what the screen held then. */
let held3D = null;
function showChoice3D(from) {
  const held = from === 'records' ? held3D : null;
  held3D = null;
  CHOICE_3D.show(LAST_CHOICE_3D.current, { played: LAST_CHOICE_3D.played, held });
}
// The bests are read through the records store's queries, and redrawn on its change notification.
const CHOICE_3D = bindBoardChoice3D({
  root: document.getElementById('board-choice'),
  onStart: (choice) => { sfx.unlock(); LAST_CHOICE_3D.save(choice).catch(() => {}); MODES.start('3d', boardOf(choice)); }, // storage never stops a game
  onLearn: () => startLearn(),
  onBack: () => shellBack('pointer'),
  onRecords: (board) => {
    held3D = CHOICE_3D.state();
    SHELL.go('records', { data: { mode: MODE_3D, boardKey: board ? boardKey(identity3D(board)) : null } });
  },
  code: { resolve: (text) => checkCode(text, '3d'), onPlay: (text) => playCode(text, '3d') },
  bests: (board) => boardBests(identity3D(board), RECORDS),
});
// ---------- Learn 3D ----------
// The guided board (js/mode3d/learn.js): a fixed board with a forced, marked start cell, played
// through the 3D mode with no timer and no summary, so nothing reaches the records or the replay
// library, nothing is saved as the last mode or board choice, and the pause controller asks
// nothing before a restart or back to menu (unrecorded). Its four prompts show in the hint strip,
// in the active device's names, with the start-cell tint on the cell the prompt points at; it ends
// on the Learn 3D end card in place of the results screen. Nothing else teaches meanwhile: no
// first-use hint strip, "How 3D works" block, auto-hide toast or aim hint, and it counts toward
// no first-use window; its win marks the rules block seen, and its second prompt the auto-hide
// toast shown.
/** Start the guided board, any number of times; never saved as the last 3D choice. */
function startLearn() {
  if (!WEBGL2) return;
  sfx.unlock();
  MODES.start('3d', learnChoice());
}
/** The Learn 3D game's terms for the first-use state, or undefined for any other game. */
function learnGame() {
  return MODES.active === '3d' && S.learn ? { learn: true, won: S.game?.state === 'won' } : undefined;
}
/** The Learn 3D win's Play Cube Intro: an ordinary pick of Cube Intro with the presets' no-guess switch as remembered, saved as the last choice. */
function playCubeIntro() {
  const last = LAST_CHOICE_3D.current;
  const choice = { size: 'cube-intro', custom: { ...last.custom }, noGuess: !!last.noGuess };
  sfx.unlock();
  LAST_CHOICE_3D.save(choice).catch(() => {});
  MODES.start('3d', boardOf(choice));
}
/** The prompt line changed: the hint strip and the tint follow it. */
function learnChanged() {
  refreshHints();
  if (S.learn && S.started && renderer.setMark(S.learn.tinted)) needRender = true;
}
/**
 * A board action in the guided game: a flag on the lesson mine, a chord on the lesson number, and,
 * after any action while the game is on, the lesson number's closed, unflagged neighbours — none
 * left skips the chord prompt.
 */
function learnAction(type, cell, r) {
  const L = S.learn;
  let changed = false;
  if (type === 'right') changed = L.flagged(Array.from(r.changed).filter((c) => S.game.flagged[c]));
  else if (type !== 'left') changed = L.chorded(cell, r.revealed);
  if (S.game.state === 'playing') changed = L.lessonClosed(closedAround(S.game, LEARN_BOARD.lessonNumber)) || changed;
  if (changed) learnChanged();
}
/** The view modes held in the guided game: Shift on the lesson number, Ctrl anywhere (which marks the auto-hide toast shown). */
function learnViews(shift, ctrl) {
  const L = S.learn;
  if (!L || !S.started || S.endState) return;
  let changed = false;
  if (shift) changed = L.shift(S.selected) || changed;
  if (ctrl && !L.done('ctrl')) { changed = L.ctrl() || changed; FIRST_USE.once('autoHideToast'); }
  if (changed) learnChanged();
}
// Classic 2D: the mode drives its own board; the shell hands it the board area, the game window and
// its screens. The last board choice is a platform-storage document; the board's bests, which the
// live figures compare against, are read from the records store once per game.
const LAST_CHOICE_2D = createLastChoice({ storage });
let bests2D = null;
const FLOW_2D = {
  openBoardChoice: (choice) => SHELL.go('classic-2d-choice', { data: { choice } }),
  show: () => SHELL.go('classic-2d'),
  container: () => document.getElementById('c2d-board'),
  scale: () => SETTINGS.get('boardScale'),
  frame: () => BOARD_FRAME,
  mounted: (view) => ui.sizeBoard2D((width, height) => view.extent(width, height)),
  layout: (layout) => { ui.placePanel2D(layout.scrolls ? null : panelRect(layout), layout.frameRadius); clipped2D(layout.scrolls); sizeSoon2D(); },
  scrolled: () => scrolled2D(),
  hud: ({ seconds, minesLeft, clicks }) => ui.updateHud(seconds, minesLeft, clicks),
  figures: (input, { tick }) => ui.updateFigures2D(input, { tick, bests: bests2D }),
  board: (b) => { // once per game, and again when played standard
    bests2D = RECORDS.bests(b.identity);
    ui.setBoard2D(b);
    if (!standard2D) newGame2D();
  },
  generating: (shown) => { board2d.generating = shown; showStatus2D(); },
  progress: (p) => { board2d.progress = p; drawStatus2D(); }, // the progress line, without moving the focus
  failed: (failure) => { board2d.failure = failure; showStatus2D(); },
  hint: (text) => ui.toast(text, 2500), // a first reveal off a daily's or a challenge's marked start cell
  padCue: (kind) => padRumble(kind === 'flag' ? PAD_FLAG : PAD_PRESS), // a trigger's press cue, a flag's double pulse
};
// The game window hugs its board (UI.sizeBoard2D): its board area is sized as each board view
// opens, whenever the window's room changes, and a frame after a refit, which may change the
// board's extent (a board scale, a theme's gap) — never inside the board's own resize callback.
const size2D = () => { const v = mode2d.boardView; if (v) ui.sizeBoard2D((width, height) => v.extent(width, height)); };
let sizing2D = 0;
function sizeSoon2D() {
  if (!sizing2D) sizing2D = requestAnimationFrame(() => { sizing2D = 0; size2D(); });
}
new ResizeObserver(size2D).observe(document.getElementById('c2d'));
const board2d = { generating: false, failure: null, progress: null };
/** The Classic 2D board status card as it stands; whether it shows. */
function drawStatus2D() {
  const on = MODES.active === 'classic-2d';
  const generating = board2d.generating && S.mode === 'classic-2d';
  ui.setBoardStatus(on ? { generating, failure: board2d.failure, progress: board2d.progress, forced: !!mode2d.fixed } : {});
  return on && (!!board2d.failure || generating);
}
/**
 * The Classic 2D board status card: the generating card on the board, and a failed board's offer
 * there and over the pause card, taking the focus.
 */
function showStatus2D() {
  if (drawStatus2D()) focusStatus('c2d', board2d);
}
/**
 * A board status card's default focus: Cancel while generating; on the failure offer Retry, or
 * Play a standard board after a second failure in a row, or Back when it offers nothing else.
 */
function statusFocus(prefix, { failure }) {
  if (!failure) return `#${prefix}-cancel`;
  if (Array.isArray(failure.offers) && failure.offers.length === 0) return `#${prefix}-offer-menu`; // a daily's or a challenge's board: Back alone
  return failure.count >= 2 ? `#${prefix}-standard` : `#${prefix}-retry`;
}
/** Focus the card's default target; on the generating card, a focus already on its Cancel or Play a standard board is left alone. */
function focusStatus(prefix, status) {
  const active = document.activeElement;
  if (!status.failure && active?.closest?.(`#${prefix}-wait`) && !active.closest('.hidden')) return;
  const target = document.querySelector(statusFocus(prefix, status));
  if (target && target !== active) target.focus({ preventScroll: true });
}
/** A failed 2D board's offer answered over the pause card: the game resumes with the answer. */
function answer2D(answer) {
  if (S.mode === 'paused') PAUSE.resume(padGesture ? 'pad' : 'pointer');
  answer();
}
const mode2d = MODES.register('classic-2d', (report) => createClassic2DMode(report, { flow: FLOW_2D, lastChoice: LAST_CHOICE_2D, sound: sfx, buttonSwap: BUTTON_SWAP }));
/**
 * The board choice on `choice`; the default choice of a player who never played is not "last
 * played". Back from the Records screen it opened brings back what the screen held then.
 */
let held2D = null;
function showChoice2D(choice, from) {
  const held = from === 'records' ? held2D : null;
  held2D = null;
  CHOICE_2D.show(choice, { played: choice !== DEFAULT_CHOICE, held });
}
// The bests are read through the records store's queries, and redrawn on its change notification.
const CHOICE_2D = bindBoardChoice({
  root: document.getElementById('c2d-choice'),
  onStart: (choice) => { sfx.unlock(); MODES.start('classic-2d', choice); },
  onBack: () => shellBack('pointer'),
  onRecords: (identity) => {
    held2D = CHOICE_2D.state();
    SHELL.go('records', { data: { mode: 'classic-2d', boardKey: identity ? boardKey(identity) : null } });
  },
  code: { resolve: (text) => checkCode(text, 'classic-2d'), onPlay: (text) => playCode(text, 'classic-2d') },
  bests: (identity) => boardBests(identity, RECORDS),
});

// ---------------------------------------------------------------- daily boards and board codes
// The daily boards: each mode's warm client pre-generates today's unused ones when the main menu
// shows, a daily starts on its forced, marked start cell with that board, and the Daily screen shows
// every mode with its state. A board code — typed in a board choice or carried by a #board= link —
// starts a challenge in its mode; today's daily code opens the Daily screen instead
// (js/shell/challenge.js).
const DAILY_BOARDS_HELD = createDailyBoards({ clients: { 'classic-2d': () => mode2d.client, '3d': () => (WEBGL2 ? GEN_3D : null) } });
// The Daily screen's panel shows the selected mode's board: today's Expert closed with its start cell
// marked, drawn by a Classic 2D board view; today's cube drawn live by the 3D renderer
// (showDailyScene); or a coming-soon mode's colour badge.
const DAILY_PREVIEW = bindMenuPreview({
  panel: document.getElementById('daily-preview'),
  stage: document.getElementById('daily-preview-stage'),
  tag: document.getElementById('daily-preview-tag'),
  iconOf: (entry) => document.querySelector(`#menu-entry-${entry} .ui-mode-entry__icon > svg`),
  mountBoard: ({ container, grid }) => mountBoardView({ container, grid, minTile: 1, framed: true }),
  boardOf: () => {
    const daily = dailyPreview();
    return { key: daily.date, ...dailyBoard2D(daily) };
  },
});
const DAILY_VIEW = bindDailyScreen({
  root: document.getElementById('daily'),
  onPlay: (id) => playDaily(id, padGesture ? 'pad' : 'pointer'),
  onWatch: (replayId) => SHELL.go(REPLAY_SCREEN, { data: { replayId, returnTo: { screen: DAILY_SCREEN } } }),
  onBack: () => shellBack('pointer'),
  onCopy: (c) => copyCode(c),
  onSelect: (entry) => {
    const panel = dailyPanel(entry, { missing: MISSING });
    DAILY_PREVIEW.show(panel);
    if (panel.kind === 'scene') showDailyScene();
    syncScenePanel();
    needRender = true;
  },
});
const UNAVAILABLE_MODES = WEBGL2 ? {} : { '3d': UNAVAILABLE_REASONS.webgl2 };
function showDaily() { DAILY_VIEW.show(dailyModes({ records: RECORDS, replays: REPLAYS, unavailable: UNAVAILABLE_MODES })); }
/** Today's daily cube in the renderer, closed, its start cube marked: the Daily screen's 3D preview. */
let dailyCube = null; // { date, view, mark }
function showDailyScene() {
  if (!WEBGL2) return;
  const date = dateText();
  if (dailyCube?.date !== date) {
    const { board, startCell } = dailyGame('cube', date);
    dailyCube = { date, view: create3DGame({ X: board.width, Y: board.height, Z: board.depth, mines: board.mines }).view, mark: startCell };
  }
  renderer.setGame(dailyCube.view);
  renderer.setMark(dailyCube.mark);
  applyPixelRatio(dailyCube.view.n);
  renderer.setSelected(-1);
}
/** Start a forced game — a daily or a challenge — in its mode; a 3D one enters play as Play again does. */
function startForced(start, source) {
  if (start.mode === '3d' && !WEBGL2) return;
  sfx.unlock();
  MODES.start(start.mode, start.choice);
  if (start.mode === '3d') enterPlay3D(source);
}
/** Play today's daily `id` while its counted attempt is unused, with its pre-generated board when it is held. */
function playDaily(id, source) {
  const date = dateText();
  const game = dailyGame(id, date);
  if (countedAttempt(RECORDS, id, date)) { showDaily(); return; }
  startForced(gameStart({ board: game.board, seed: game.seed, startCell: game.startCell, daily: date, pregenerated: DAILY_BOARDS_HELD.take(game.code) }), source);
}
function playChallenge({ board, seed, startCell }, source) { startForced(gameStart({ board, seed, startCell }), source); }
/** A board choice's code field, validated live: the reason a code is refused, or what it opens. */
function checkCode(text, mode) {
  const r = resolveCode(text, { mode });
  if (r.kind === 'refused') return { ok: false, reason: r.reason, otherMode: !!r.otherMode };
  if (r.kind === 'daily') return { ok: true, text: 'Today\'s daily board — it opens the Daily screen.', label: 'Today\'s daily board' };
  return { ok: true, text: `${boardLabel(r.parsed.board)} · a challenge, not eligible for bests`, label: boardLabel(r.parsed.board) };
}
function playCode(text, mode) {
  const r = resolveCode(text, { mode });
  if (r.kind === 'daily') SHELL.go(DAILY_SCREEN);
  else if (r.kind === 'challenge') playChallenge(r.parsed, padGesture ? 'pad' : 'pointer');
}
const LINKS = createChallengeLinks({
  location: window.location,
  history: window.history,
  onDaily: () => SHELL.go(DAILY_SCREEN),
  onChallenge: (parsed) => playChallenge(parsed, 'pointer'),
  onRefused: (reason) => { showMainMenu(); ui.toast(reason, 5000); },
  started: () => MODES.state.started && !MODES.state.finished,
  unavailable: (mode) => UNAVAILABLE_MODES[mode] ?? null,
  toast: (text) => ui.toast(text, 4000),
});
MODES.on('failed', ({ screen }) => SHELL.go(screen ?? 'menu'));
// A 3D game with no summary has no results screen: the guided board ends on the Learn 3D end card,
// the debug hook's fixed board on the pause card.
MODES.on('finished', ({ mode, summary }) => {
  if (mode !== '3d' || summary) return;
  if (S.learn) SHELL.go('learn-end', { data: { won: S.game?.state === 'won' } });
  else showPauseCard();
});

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
  askRestart: () => SETTINGS.get('confirmRestart'), // "Always ask before restarting"
  restarted: () => ui.toast(RESTART_NOTICE, 5000), // once per session
  unrecorded: () => MODES.active === '3d' && mode3d.learn, // Learn 3D: nothing it abandons counts
});
window.addEventListener('blur', () => pauseGame('blur'));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') pauseGame('hidden'); });
window.addEventListener('pagehide', () => { if (endDelay()) activeMode().finishNow(); PAUSE.pageHide(); }); // a game in its end delay is finished, not lost

// ---------- the end delay's skip ----------
// A mouse button, key or controller button pressed during either mode's end delay ends it at once
// (the mode's finishNow: the results flow records, then shows, the results card) and does nothing
// else: END_SKIP (js/shell/end-skip.js) consumes the press with its release, auto-repeat and click,
// swallowed here before any other listener sees them. The controller's is read in handlePad.
const END_SKIP = createEndSkip({ ending: () => endDelay(), skip: () => activeMode()?.finishNow() });
const swallow = (e) => { e.preventDefault(); e.stopImmediatePropagation(); };
// The look at a finished 3D board ends the same way on Esc, any mouse button or any controller
// button (LOOK_END, the same skip over the look): the press brings the results card back and does
// nothing else. The flight and view-mode keys are not presses here: only Esc ends the look. Outside
// the look every key reaches LOOK_END, so a fresh key press ends a mouse press's click window.
const LOOK_END = createEndSkip({ ending: () => looking(), skip: () => endLook() });
window.addEventListener('keydown', (e) => { if (END_SKIP.keyDown(e) || ((isBackKey(e.code) || !looking()) && LOOK_END.keyDown(e))) swallow(e); }, true);
window.addEventListener('keyup', (e) => { if ([END_SKIP.keyUp(e), LOOK_END.keyUp(e)].some(Boolean)) swallow(e); }, true);
// In the look on a coarse-only device a touch on the scene is the stick or the look drag, its tap bringing the card back
// (touch3D's onTap), and a tap on the touch toolbar toggles its view mode: neither is LOOK_END's.
const lookTouch = (e) => COARSE_ONLY && looking() && ((e.pointerType === 'touch' && e.target === canvas) || !!e.target?.closest?.('#touch-modes'));
for (const type of ['pointerdown', 'mousedown']) window.addEventListener(type, (e) => { if (END_SKIP.press() || (!lookTouch(e) && LOOK_END.press())) swallow(e); }, true);
for (const type of ['pointerup', 'mouseup']) window.addEventListener(type, (e) => { if (END_SKIP.release(e) || (!lookTouch(e) && LOOK_END.release(e))) swallow(e); }, true);
for (const type of ['click', 'auxclick', 'contextmenu']) window.addEventListener(type, (e) => { if (END_SKIP.click(e) || (!lookTouch(e) && LOOK_END.click(e))) swallow(e); }, true);
window.addEventListener('blur', () => { END_SKIP.reset(); LOOK_END.reset(); }); // releases that land elsewhere are never seen
document.addEventListener('visibilitychange', () => { if (document.hidden) { END_SKIP.reset(); LOOK_END.reset(); } });

// ---------- personal records ----------
// The records store loads before the first screen, settling a game the last launch closed on, and
// keeps every abandoned game and the game in progress through the pause controller's hand-offs.
const RECORDS = createRecordsStore({
  storage,
  onNotSaved: () => ui.toast('Records cannot be saved in this browser — this session\'s games will not be kept.', 4000),
});
const recordsLoaded = RECORDS.load();
RECORDS.attach(PAUSE);
RECORDS.onChange(() => { CHOICE_2D.refresh(); CHOICE_3D.refresh(); });

// ---------- first-use hints ----------
// What a new player has been taught, in the platform-storage document shell.firstUse, seeded from
// the records once they load. A game counts when its mode reports game started; the hint strips
// show during each mode's first three games (judged as each game begins) until dismissed.
const FIRST_USE = createFirstUse({ storage, records: RECORDS });
const firstUseLoaded = recordsLoaded.then(() => FIRST_USE.load(), () => FIRST_USE.load());
MODES.on('finished', ({ mode }) => FIRST_USE.gameFinished(mode, learnGame()));
const hint3D = { eligible: false };
const hint2D = { eligible: false, used: false, clipped: false };
let standard2D = false; // the failed 2D board's offer is playing it standard: the same game
function newGame2D() {
  hint2D.eligible = FIRST_USE.inFirstGames('classic-2d');
  hint2D.used = false;
  hint2D.clipped = false;
  refreshHints(); // the router already drew the strip from the previous game's state
}
/** A key or the controller was used in this Classic 2D game. */
function used2D() {
  if (MODES.active !== 'classic-2d' || hint2D.used) return;
  hint2D.used = true;
  refreshHints();
}
/** Whether this Classic 2D game's board scrolls: the first time one does, the scroll hint shows. */
function clipped2D(on) {
  if (hint2D.clipped === on) return;
  hint2D.clipped = on;
  refreshHints();
}
/** The player scrolled the Classic 2D board: the scroll hint has done its job. */
function scrolled2D() {
  if (FIRST_USE.once('scrollHint')) refreshHints();
}
/**
 * The hint strip of the active mode, on its play screen; on a clipped Classic 2D board, the scroll
 * hint until it is dismissed or the board is scrolled.
 */
function refreshHints() {
  const mode = MODES.active;
  if (mode !== '3d' && mode !== 'classic-2d') { ui.setHintStrip(false); return; }
  if (mode === '3d' && S.learn) { ui.setHintStrip(S.mode === 'playing', { learn: LEARN_HINTS[S.learn.current] }); return; } // the Learn 3D prompt line
  if (mode === 'classic-2d' && S.mode === 'classic-2d' && hint2D.clipped && !FIRST_USE.shown('scrollHint')) {
    ui.setHintStrip(true, { scroll: true });
    return;
  }
  const h = mode === '3d' ? hint3D : hint2D;
  ui.setHintStrip(stripShown({ mode, screen: S.mode, eligible: h.eligible, used: h.used, dismissed: FIRST_USE.dismissed(mode), touchOnly: COARSE_ONLY }));
}
// The aim hint: the crosshair rests about a second on a revealed number with a closed cube behind it.
const AIM_DWELL = createDwell(AIM_DWELL_MS);
function aimHint(g, now) {
  if (S.learn || FIRST_USE.shown('aimHint')) return;
  const sel = S.selected;
  const cell = !controls.space && sel >= 0 && g.pressed[sel] && g.number[sel] > 0 ? aimHintCell(g, sel, aimedCell(g, S.spacing, true)) : null;
  if (AIM_DWELL.update(cell, now) && FIRST_USE.once('aimHint')) ui.toast(ui.hint('aimHint'), 4000);
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

// ---------- reset all data ----------
// The Settings page's Reset all data: every document, replay and carried-over key goes once the
// replay library has settled, then a reload starts the game as a new player's.
const RESET = createReset({
  storage,
  blobStore,
  waitFor: async () => { await REPLAYS.load(); await REPLAYS.settled(); },
  reload: () => { reloading = true; location.reload(); },
});

// ---------- 3D replay ----------
// A 3D replay draws on the renderer with its own camera, placed from the recording each frame on
// Follow; on Free the viewer flies it with the game's flight controls (flyReplay: the movement keys,
// mouse look under the pointer lock a click on the scene takes, the controller sticks; the Camera
// setting's Orbit turns it about the board centre), while playback runs on. Leaving the replay gives
// the renderer back the board it drew before.
const REPLAY_SPACING = SPACING_START;
const replayCam = new FlyCamera();
const replayOrbit = new OrbitCamera(replayCam);
const replay3d = { view: null, toggles: { shift: false, space: false, ctrl: false }, pickKey: '', time: 0, wrong: [], free: false, tints: null };
/** What the free replay camera's look and dolly turn: the orbit under the Camera setting's Orbit, else the flight. */
const replayView = () => (cameraMode === 'orbit' ? replayOrbit : replayCam);
/** Show 3BV's cube tints from the tokens (js/replay/viewer.js regionTints indices), 4 bytes a cell. */
const BBBV_TOKENS = ['--color-replay-bbbv-1', '--color-replay-bbbv-2', '--color-replay-bbbv-3', '--color-replay-bbbv-4', '--color-replay-bbbv-5',
  '--color-replay-bbbv-6', '--color-replay-bbbv-isolated'];
function bbbvTint(tints) {
  const colours = BBBV_TOKENS.map((name) => parseRgb(token(name)));
  const rgba = new Uint8Array(tints.length * 4);
  for (let c = 0; c < tints.length; c++) {
    const k = tints[c];
    if (k < 0) continue;
    rgba.set(colours[k], c * 4);
    rgba[c * 4 + 3] = k === BBBV_TOKENS.length - 1 ? 180 : 130;
  }
  return rgba;
}
const REPLAY_SCENE = {
  show(view) {
    if (!replay3d.view) replay3d.wrong = renderer.wrongFlags(); // the finished game's crossed flags, drawn again on the way back
    replay3d.view = view;
    replay3d.pickKey = '';
    replay3d.free = false;
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
  detach(on) {
    replay3d.free = on;
    if (on && cameraMode === 'orbit') { replayOrbit.setRange(orbitRange(replay3d.view, REPLAY_SPACING, renderer.camera.fov, renderer.camera.aspect)); replayOrbit.enter(); }
    if (!on && document.pointerLockElement === canvas) input.exitLock();
    needRender = true;
  },
  /** A press ring on the acted cell's projection: through the replay camera, the crosshair on Follow. */
  ring(cell, kind) {
    replayCam.apply(renderer.camera);
    renderer.setSpacing(REPLAY_SPACING);
    const at = renderer.cellScreen(cell);
    if (at) ui.replayRing(at.x, at.y, kind);
  },
  tint(tints) {
    replay3d.tints = tints;
    renderer.setRegionTint(tints ? bbbvTint(tints) : null);
    needRender = true;
  },
  hide() {
    if (replay3d.free && document.pointerLockElement === canvas) input.exitLock();
    replay3d.free = false;
    replay3d.tints = null;
    renderer.setRegionTint(null);
    replay3d.view = null;
    const g = S.game ?? S.demo;
    if (g) { renderer.setGame(g); applyPixelRatio(g.n); }
    if (g && g === S.game && replay3d.wrong.length) renderer.setWrongFlags(replay3d.wrong);
    replay3d.wrong = [];
    S.pickKey = '';
    needRender = true;
  },
};
/** The free replay camera, once a frame: the movement keys and the controller's left stick fly it (Orbit: W / S and the stick dolly). */
function flyReplay(dt) {
  const keys = input.move;
  if (keys.w || keys.a || keys.s || keys.d || keys.q || keys.e || controls.hasAxes) needRender = true; // a paused replay draws on demand
  if (cameraMode === 'orbit') {
    const v = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) + (controls.hasAxes ? controls.axes.f : 0);
    replayOrbit.dollyAxis(dt, Math.max(-1, Math.min(1, v)));
    return;
  }
  replayCam.move(dt, input.move);
  if (controls.hasAxes) replayCam.moveAxes(dt, controls.axes.f, controls.axes.r, controls.axes.u);
}
// Mouse look on the free replay camera, under the pointer lock a click on the replay's scene takes.
document.addEventListener('mousemove', (e) => {
  if (!replay3d.free || document.pointerLockElement !== canvas) return;
  const dx = e.movementX || 0, dy = e.movementY || 0;
  if (Math.abs(dx) > 400 || Math.abs(dy) > 400) return; // a bogus spike right after locking
  replayView().look(dx, dy);
  needRender = true;
});
document.getElementById('replay-board').addEventListener('click', () => {
  if (replay3d.free && !COARSE_ONLY && document.pointerLockElement !== canvas) input.requestLock();
});

// ---------- replay files ----------
// Download saves a replay's bytes as a .msrp file; Open replay file picks one from the hidden input.
function saveReplayFile(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/octet-stream' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
const REPLAY_FILE_INPUT = document.getElementById('replay-file');
/** The replay file the player picks, or null when they pick none. */
function pickReplayFile() {
  return new Promise((resolve) => {
    const done = (file) => { REPLAY_FILE_INPUT.removeEventListener('change', onChange); REPLAY_FILE_INPUT.removeEventListener('cancel', onCancel); resolve(file); };
    const onChange = () => done(REPLAY_FILE_INPUT.files?.[0] ?? null);
    const onCancel = () => done(null);
    REPLAY_FILE_INPUT.value = '';
    REPLAY_FILE_INPUT.addEventListener('change', onChange);
    REPLAY_FILE_INPUT.addEventListener('cancel', onCancel);
    REPLAY_FILE_INPUT.click();
  });
}
const REPLAY_FILES = { save: saveReplayFile, pick: pickReplayFile };

// Show 3BV takes the new theme's tints at once.
onThemeChange(() => { if (replay3d.view && replay3d.tints) REPLAY_SCENE.tint(replay3d.tints); });

/** The replay viewer's 2D viewer, at the board scale setting. */
function mountReplay2D(options) { return mountViewer2D({ ...options, scale: SETTINGS.get('boardScale') }); }
/** The replay viewer's box viewer; with the graphics context gone it is a mode's failure, and nothing mounts. */
function mountReplay3D({ sim }) {
  if (contextLost) { SHELL.go('ctxlost'); return { draw() {}, destroy() {} }; }
  return createViewer3D({ sim, scene: REPLAY_SCENE, spacing: REPLAY_SPACING });
}

// ---------- replay viewer ----------
// A shell screen over the replay library: it verifies the replay, then plays it on its own board
// view; it reports nothing to records — its live figures read the board's bests as stored now —,
// keeps nothing in the library and never pauses; its sound toggle plays the game's cues through the
// master volume. Back is the screen it came from.
const REPLAY_VIEWER = createReplayViewer({
  library: REPLAYS,
  router: SHELL,
  sound: sfx,
  files: REPLAY_FILES,
  bests: (board) => RECORDS.bests(board),
  view: createReplayView({
    root: document.getElementById('replay'),
    onCommand: (name) => REPLAY_VIEWER.command(name),
    onSpeed: (speed) => REPLAY_VIEWER.setSpeed(speed),
    onSeek: (ms) => REPLAY_VIEWER.seek(ms),
    onBack: () => shellBack('pointer'),
    onDownload: () => REPLAY_VIEWER.download(),
    onOpen: () => pickReplayFile().then((file) => { if (file && S.mode === REPLAY_SCREEN) REPLAY_VIEWER.openFile(file); }),
    onCopy: (c) => copyCode(c),
  }),
  viewers: WEBGL2 ? { square: mountReplay2D, box: mountReplay3D } : { square: mountReplay2D }, // a 3D replay then says why it cannot play
});
// The board scale setting reaches an open Classic 2D board and the replay viewer's 2D board at once.
SETTINGS.onChange('boardScale', (scale) => { mode2d.setScale(scale); REPLAY_VIEWER.setScale(scale); });

// ---------- results ----------
// A finished game is recorded, then the results screen shows over the finished Classic 2D board,
// or over the finished 3D board, drawn dimmed behind it on demand (shouldRender). Every finished
// and abandoned game's replay is then added to the replay library.
// Play again restarts the finished game's board choice, or starts it again once the mode was left
// (back from Records); a 3D game is entered as resume enters play. Watch replay plays the game just
// finished from its own replay; Back returns to the results screen.
/** Copy and Copy link of every code chip: the board code or its challenge link; a refused clipboard selects the code. */
function copyCode({ kind, code, select }) {
  return copyBoardCode({ kind, code, select, clipboard: navigator.clipboard, location: window.location, toast: (text) => ui.toast(text, 2500) });
}
const RESULTS = createResultsFlow({
  records: RECORDS,
  replays: REPLAYS,
  router: SHELL,
  restart: (source, { mode, summary }) => {
    if (MODES.active) PAUSE.restart(source);
    else if (summary?.daily || summary?.challenge) { const free = freeStart(summary.board); startForced(free, source); } // never the same seed
    else if (mode === 'classic-2d') MODES.start(mode, LAST_CHOICE_2D.current);
    else if (mode === '3d' && WEBGL2 && board3dChoice) { MODES.start(mode, board3dChoice); enterPlay3D(source); }
  },
  goMenu: () => showMainMenu(),
});
RESULTS.attach(PAUSE);
const RESULTS_VIEW = createResultsView({
  root: document.getElementById('results'),
  onPlayAgain: () => RESULTS.playAgain(padGesture ? 'pad' : 'pointer'),
  onWatch: () => RESULTS.watch(),
  onWatchBest: () => RESULTS.watchBest(),
  onRecords: () => RESULTS.openRecords(),
  onMenu: () => RESULTS.toMenu(),
  onLook: () => openLook(padGesture ? 'pad' : 'pointer'),
  onCopy: (c) => copyCode(c),
});

// ---------- look at the board ----------
// A 3D game's results card offers Look at the board, and Back on it (Esc, the controller's back
// buttons) means the same: the card hides and the player flies over the frozen finished board from
// the pose the game ended with — mouse look, the flight and view-mode keys and the wheel, or the
// controller's sticks — read-only: no board action (onAction), no pause (pauseGame), nothing
// recorded. Esc, any mouse button or any controller button brings the card back (LOOK_END), the
// press doing nothing else. A click or key asks for pointer lock and the look opens once it is
// granted; a refusal leaves the card up with a note, and a fresh press tries again. A controller's
// look is lockless. The finished board stays the renderer's while the mode is active, so the look
// is offered only then: after Records the mode was left and the board is gone.
let lookPending = false; // Look at the board asked for pointer lock and waits for the answer
/** Whether the finished 3D board behind the results card can be looked at. */
function lookable() {
  return WEBGL2 && !contextLost && MODES.active === '3d' && RESULTS.current?.mode === '3d' && !!S.game && S.game.state !== 'playing';
}
/**
 * The results screen: its content, Look at the board offered and the board drawn dimmed behind it
 * only while the finished 3D board can be looked at; once it is gone, the ordinary results surface.
 */
function showResults(data) {
  const content = resultsContent(data);
  const board = lookable();
  RESULTS_VIEW.show({ ...content, look: content.look && board, over3d: content.over3d && board });
}
/** The look's pointer lock was refused: the card notes it, and focus goes to Look at the board so Enter retries (Esc grants no activation). */
function refusedLook() {
  RESULTS_VIEW.noteLook(LOOK_REFUSED);
  keyFocus(document.getElementById('r-look'));
}
/** Back on the results card: the look over a 3D game's board, else the main menu; the browser's Back keeps the menu. */
function resultsBack(source) {
  if (source === 'history' || !lookable()) { RESULTS.toMenu(); return; }
  if (source === 'key' && performance.now() - input.unlockedAt < 500) return; // the Esc that released the look's lock already meant Back
  openLook(source);
}
/** Look at the board: a controller's look is lockless; a click or key is the pointer-lock gesture. */
function openLook(source) {
  if (S.mode !== 'results' || !lookable()) return;
  if (source === 'pad' || COARSE_ONLY) { SHELL.go(LOOK_SCREEN); return; } // lockless, as a controller looks
  lookPending = true;
  requestLock3D();
}
/** Esc, a mouse button, a controller button or the lock's release in the look: the results card again. */
function endLook() {
  if (!looking()) return;
  input.exitLock();
  SHELL.go('results');
}
/** The look shows its one-line hint over the board; leaving it drops the held controls. */
function showLook(on) {
  document.getElementById('look').classList.toggle('hidden', !on);
  if (on) document.activeElement?.blur?.(); // the hidden card's focus: Space and Enter belong to the look
  else { controls.releasePad(); input.spaceToggle.reset(); }
}
// Enter on the results screen is Play again while the focus is on Play again or on no action; on
// another action it activates that one, as a button does; its auto-repeat does nothing.
window.addEventListener('keydown', (e) => {
  if (S.mode !== 'results' || (e.code !== 'Enter' && e.code !== 'NumpadEnter') || e.ctrlKey || e.altKey || e.metaKey) return;
  const action = resultsEnter({ focused: document.activeElement?.id || null, repeat: e.repeat });
  if (!action) return;
  e.preventDefault();
  if (action === 'playAgain') RESULTS.playAgain('key');
});

// ---------- records export ----------
// One export of every game and the kept replays' listing, offered first in the Settings page's Data
// panel and below the Records screen's lists; both give the same files.
const RECORDS_EXPORT = createRecordsExport({ records: RECORDS, replays: REPLAYS });
const SETTINGS_EXPORT = bindExportActions({
  csv: document.getElementById('set-export-csv'), json: document.getElementById('set-export-json'), note: document.getElementById('set-export-note'),
}, { onExport: (format) => RECORDS_EXPORT.save(format) });

// ---------- records screen ----------
// The board picker, the chosen board's figures, history and kept replays, redrawn live while open;
// Watch shows once the replay viewer's route is registered; Back closes a Delete confirmation, else
// is the back stack. The Pinned first switch is remembered in its own document, loaded at start-up.
const RECORDS_VIEW_PREFS = createRecordsViewPrefs({ storage });
const RECORDS_PAGE = createRecordsScreen({ records: RECORDS, replays: REPLAYS, router: SHELL, viewPrefs: RECORDS_VIEW_PREFS,
  exporter: RECORDS_EXPORT, files: REPLAY_FILES,
  view: createRecordsView({
    root: document.getElementById('records'),
    onSelect: (key) => RECORDS_PAGE.select(key),
    onMode: (mode) => RECORDS_PAGE.setMode(mode),
    onPage: (page) => RECORDS_PAGE.showPage(page),
    onWatch: (id) => RECORDS_PAGE.watch(id),
    onTogglePin: (id) => RECORDS_PAGE.togglePin(id),
    onPinnedFirst: (on) => RECORDS_PAGE.setPinnedFirst(on),
    onReplayPage: (page) => RECORDS_PAGE.showReplayPage(page),
    onDelete: (id) => RECORDS_PAGE.deleteReplay(id),
    onPeriod: (period) => RECORDS_PAGE.setPeriod(period),
    onOutcome: (outcome) => RECORDS_PAGE.setOutcome(outcome),
    onTab: (tab) => RECORDS_PAGE.setTab(tab),
    onTopStat: (stat) => RECORDS_PAGE.setTopStat(stat),
    onExport: (format) => RECORDS_PAGE.exportFile(format),
    onDownload: (id) => RECORDS_PAGE.downloadReplay(id),
    onOpenFile: () => RECORDS_PAGE.openReplayFile(),
    onBack: () => shellBack('pointer'),
  }),
});

// ---------- main menu ----------
// Each entry is a route; the last mode played is kept through platform storage and marked on the menu.
// An entry that cannot open here (3D without WebGL 2, Quit on the web) is disabled with its reason line (none for Quit).
const MISSING = [...WEB_MISSING, ...(WEBGL2 ? [] : ['webgl2'])];
const MENU = createMenu({ router: SHELL, modes: MODES, missing: MISSING });
for (const entry of MENU.entries) {
  if (MENU.unavailable(entry.id)) ui.setEntryUnavailable(entry.id, entryReasonLine(entry, MISSING));
}
// The guided board is never the last mode played: its game started is not passed on.
const LAST_MODE = createLastMode({ storage, modes: { on: (type, fn) => MODES.on(type, (e) => { if (!learnGame()) fn(e); }) } });
MODES.on('started', ({ mode }) => { if (!learnGame()) ui.setLastMode(mode); FIRST_USE.gameStarted(mode, learnGame()); menuOpened = null; });

/**
 * The menu's selection: the entry last opened from it while Back returns to the menu (a coming-soon
 * mode's placeholder, Daily, Records, Settings or a board choice left without a game), else the
 * last mode played's entry, else the first available one; a game started forgets the entry opened.
 */
let menuOpened = null;
function onMenuEntry(id) {
  const route = MENU.open(id);
  if (route) menuOpened = id;
}
function menuFocusEntry() {
  return menuOpened ?? openingEntry(LAST_MODE.current, { missing: MISSING });
}

// The preview of the selected entry (js/shell/menu-preview.js): a Classic 2D board drawn by its board
// view, the 3D demo board drawn into the panel, today's daily Expert board, or the entry's card. It
// follows the focus among the entries; the 3D scene draws only while its preview shows.
const DEMO_2D = demoBoard2D();
const MENU_PREVIEW = bindMenuPreview({
  panel: document.getElementById('menu-preview'),
  stage: document.getElementById('menu-preview-stage'),
  tag: document.getElementById('menu-preview-tag'),
  iconOf: (entry) => document.querySelector(`#menu-entry-${entry} .ui-mode-entry__icon > svg`),
  mountBoard: ({ container, grid }) => mountBoardView({ container, grid, minTile: 1, framed: true }),
  boardOf: (kind) => {
    if (kind === 'board') return { key: 'demo', ...DEMO_2D };
    const daily = dailyPreview();
    return { key: daily.date, ...dailyBoard2D(daily) };
  },
});
function previewOf(id) {
  const p = menuPreview(id, { missing: MISSING, hasMode: (m) => MODES.has(m) });
  return p.kind === 'daily' ? { ...p, tag: dailyPreview().tag } : p;
}
/** Show the preview of the focused entry, or of the entry the menu opens on while none has the focus. */
function showPreview() {
  const focused = document.activeElement?.closest?.('#menu [data-entry]');
  const id = focused?.dataset.entry ?? menuFocusEntry();
  if (MENU_PREVIEW.shown?.id === id) return;
  MENU_PREVIEW.show({ ...previewOf(id), id });
  syncScenePanel();
  needRender = true;
}
document.getElementById('menu-entries').addEventListener('focusin', () => showPreview());
/** The menu shows its 3D preview: the 3D scene draws into its panel; on every other preview the menu shows no 3D scene. */
function menuSceneShown() {
  return MENU_PREVIEW.shown?.kind === 'scene';
}
ui.setBuild(buildLabel(VERSION));

/** Back from the keyboard (Esc) or the controller: the topmost layer first, then the router. */
function shellBack(source) {
  if (endDelay()) return;
  if (ui.closeControls() || ui.closeConfirm() || ui.closeResetConfirm() || RECORDS_PAGE.closeConfirm()) return;
  SHELL.back(source);
}
/**
 * The browser's Back (a mouse's back button too): Back as Esc means it, except that during a game it
 * never resumes and never leaves — the board pauses as an asked-for pause, the pause card and a
 * started game's ready card keep the game where it is, the 3D end delay ignores it. The history
 * sync restores the entry it consumed whenever the screen stays.
 */
function historyBack() {
  if (endDelay()) return;
  if (ui.closeControls() || ui.closeConfirm() || ui.closeResetConfirm() || RECORDS_PAGE.closeConfirm()) return;
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
 * The 3D resume: a controller enters lockless play, and so do drag-to-look play and a coarse-only
 * device's touch play; otherwise the click-to-play card, which takes pointer lock.
 */
function resumeGame(source) {
  if (source === 'pad' || S.dragLook || COARSE_ONLY) { sfx.unlock(); enterPlaying(true); return; }
  SHELL.go('ready');
  if (source === 'pointer') requestLock3D();
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
  if (!WEBGL2) return; // the setting is kept for a visit with WebGL 2
  boardCells = n;
  const pr = pixelRatioFor(SETTINGS.get('renderResolution'), window.devicePixelRatio, n);
  if (renderer.setPixelRatio(pr)) needRender = true;
}

const board3d = { generating: false, failure: null, progress: null }; // the 3D board status card: a slow first click, a failed board
let board3dChoice = null; // the board a restart plays again: S.settings and the no-guess switch
// The 3D overlay's live figures, fed every frame from the session's counts; the board's bests, which
// they compare against, are read from the records store when the board is shown.
let bests3D = null;
const FIGURES_3D = createFiguresFeed((input, { tick }) => ui.updateFigures3D(input, { tick, bests: bests3D }));
/** The open 3D board in the overlay's title and the pause card, and its bests read for the figures. */
function showBoard3D() {
  const board = { ...board3dChoice, daily: !!S.play?.forced?.daily };
  ui.setBoard(board);
  try { bests3D = board.learn ? null : RECORDS.bests(identity3D(board)); } catch { bests3D = null; } // the guided board, and a board no record can name, have no bests
  FIGURES_3D.reset();
}

function startGame(settings, pregenerated = null) {
  const s = clampSettings(settings);
  S.play?.leave();
  const noGuess = !!settings.noGuess;
  // a mine set is the debug hook's fixed board; a pre-generated board waits for its marked start cell;
  // a daily or a challenge forces its start cell, and a first reveal elsewhere pulses the tint with a hint
  const play = createSession({ board: { ...s, noGuess, minePositions: settings.minePositions }, client: GEN_3D, pregenerated, forced: settings.forced ?? null });
  play.on('refused', ({ hint }) => { if (S.play === play) { if (renderer.pulseMark()) needRender = true; ui.toast(hint, 2500); } });
  play.on('generating', ({ shown }) => { if (S.play === play) { board3d.generating = shown; board3d.progress = shown ? play.progress : null; showStatus3D(); } });
  play.on('failed', (failure) => { if (S.play === play) { board3d.failure = failure; showStatus3D(); } });
  play.on('mark', ({ cell }) => { if (S.play === play && renderer.setMark(cell)) needRender = true; });
  play.on('started', () => { if (S.play !== play) return; S.started = true; if (S.learn?.started()) learnChanged(); });
  play.on('finished', () => { if (S.play === play) endGame(); });
  const g = play.view;
  const learn = !!settings.learn; // the Learn 3D guided board: its restart plays it again
  S.learn = learn ? createLearnPrompts(LEARN_BOARD) : null;
  S.settings = { X: s.X, Y: s.Y, Z: s.Z, mines: play.mines, ...(learn ? { learn } : {}) };
  board3dChoice = { ...S.settings, noGuess, ...(learn ? { minePositions: settings.minePositions } : {}) };
  hint3D.eligible = !learn && FIRST_USE.inFirstGames('3d');
  ui.setTimed(!learn);
  S.play = play;
  S.game = g;
  S.started = false;
  S.time = 0;
  S.endState = null;
  S.selected = -1;
  S.pickKey = '';
  S.spacing = SPACING_START;
  ui.setSpacing(S.spacing);
  board3d.generating = false;
  board3d.failure = null;
  board3d.progress = null;
  mouse.reset();
  clearTouchModes();
  renderer.setGame(g);
  renderer.setMark(play.markedCell);
  applyPixelRatio(g.n);
  placeAtSpawn();
  showBoard3D();
  ui.updateHud(0, g.minesLeft, 0);
  SHELL.go('ready', { data: { msg: NO_MOUSE && !COARSE_ONLY ? NO_MOUSE_MSG : '' } });
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
  const on = drawStatus3D();
  if (on && board3d.failure) { input.exitLock(); touch3D.reset(); } // held touches are dropped as held buttons are
  if (on && (board3d.failure || board3d.generating)) focusStatus('m3d', board3d);
}
/** The 3D board status card as it stands, without moving the focus; whether it shows. */
function drawStatus3D() {
  const on = !!S.play && (S.mode === 'playing' || (S.mode === 'paused' && !!board3d.failure));
  ui.setBoardStatus3D(on ? { ...board3d, forced: !!S.play?.forced } : {});
  return on;
}
/** The generating card's progress line, each frame it shows: drawn again when the count or the seconds change. */
function progress3D() {
  const p = board3d.generating ? S.play?.progress ?? null : null;
  const was = board3d.progress;
  if (p === was || (p && was && p.candidates === was.candidates && p.seconds === was.seconds)) return;
  board3d.progress = p;
  drawStatus3D();
}
/** The generating card's Play a standard board: the no-guess request cancelled, a standard board of the same size at once. */
function standardFromWait3D() {
  const play = S.play;
  if (!play || play.state !== 'generating') return;
  const r = play.playStandard();
  board3dChoice = { ...board3dChoice, noGuess: false }; // a restart keeps the standard board
  showBoard3D();
  showStatus3D();
  if (r && S.play === play) actionSounds('left', r);
}
/** The failed board's offer: Retry with a new seed, or the same size with no-guess off; over the pause card it resumes play. */
function retry3D(kind) {
  const play = S.play;
  if (!play || !board3d.failure) return;
  board3d.failure = null;
  const r = kind === 'retry' ? play.retry() : play.playStandard();
  if (kind === 'standard') { board3dChoice = { ...board3dChoice, noGuess: false }; showBoard3D(); } // a restart keeps the standard board
  placeAtSpawn();
  showStatus3D();
  if (padGesture || S.lockless || COARSE_ONLY) { // a coarse-only device answers in lockless touch play
    if (S.mode === 'paused') PAUSE.resume('pad');
    else setLockless(true);
  } else requestLock3D(); // from the pause card too: the lock enters play
  Promise.resolve(r).then((res) => { if (res && S.play === play) actionSounds('left', res); }); // a standard board is placed at once
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
  if (cameraMode === 'orbit') { orbitCam.setRange(orbitRangeAt(S.spacing)); orbitCam.enter(); } // the spawn's yaw, pitch and distance, aimed at the centre
  needRender = true;
}

function setLockless(on) {
  S.lockless = on;
  document.body.classList.toggle('lockless', on);
  document.body.classList.toggle('drag-look', on && S.dragLook); // the system cursor shows
}
/**
 * A new 3D board entered as resume enters play: a controller, drag-to-look play or a coarse-only
 * device's touch play enters lockless play; otherwise the click or key that asked is the pointer-lock
 * gesture: the ready card waits unseen, so a granted lock enters play with no card shown, and a
 * refused one shows it with its message (onLockError).
 */
function enterPlay3D(source) {
  if (S.dragLook || COARSE_ONLY) enterPlaying(true);
  else if (source === 'pad') padResume();
  else { ui.setReadyPending(true); requestLock3D(); }
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
/** While the pause card shows the board is hidden, in every mode, and the 3D cell motion is dropped. */
function setBoardHidden(on) {
  canvas.style.visibility = on ? 'hidden' : '';
  if (on) renderer?.dropMotion();
  if (MODES.active === 'classic-2d') mode2d.hideBoard(on);
}
/** Whether the active game is over (Back on the pause card then goes to the menu). */
function gameOver() {
  if (MODES.active === 'classic-2d') return mode2d.status()?.state !== 'playing';
  return !!S.game && S.game.state !== 'playing';
}
function stopPlayInput() {
  mouse.reset();
  input.actions.reset(); // a held Enter / ' is dropped like a held button
  input.spaceToggle.reset(); // a tapped-on aim-through is dropped like a held key
  controls.releasePad();
  input.drag.reset();
  touch3D.reset(); // held touches are dropped; the toolbar's latched modes stay
  document.body.classList.remove('lockless', 'drag-look');
}
/**
 * Whether the pause card has a game in progress to resume: a started, unfinished game, or a first
 * click whose board is being generated or failed. With none, the card says so and leads with Restart.
 */
function gameInProgress() {
  if (PAUSE.inProgress) return true;
  if (MODES.active === 'classic-2d') return !!mode2d.status()?.pending;
  return ['generating', 'failed'].includes(S.play?.state);
}
function pauseInfo(note = '') {
  const inProgress = gameInProgress();
  if (MODES.active === 'classic-2d') return { ...mode2d.status(), inProgress, note, mode: MODES.active };
  const g = S.game;
  const e = S.endState;
  return { state: g.state, time: e ? e.time : S.time, minesLeft: e ? e.minesLeft : g.minesLeft, inProgress, note, mode: '3d' };
}

function makeDemo() {
  const mines = new Set();
  const { X, Y, Z } = DEMO_BOARD_3D;
  while (mines.size < 30) mines.add(Math.floor(Math.random() * X * Y * Z));
  const play = create3DGame({ ...DEMO_BOARD_3D, minePositions: [...mines] });
  const g = play.view;
  // reveal a few safe cells on the outer shell and flag a few mines, purely decorative
  const shell = (idx) => {
    const [i, j, k] = g.coords(idx);
    return i === 0 || j === 0 || k === 0 || i === X - 1 || j === Y - 1 || k === Z - 1;
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
/** The menu screens orbit the camera about the board behind them or in their scene panel (the decorative demo board, the Daily screen's cube); without WebGL 2, the page's static background. */
const BACKDROP_SCREENS = new Set(['menu', 'board-choice', 'coming-soon', 'records', 'classic-2d-choice', 'settings', 'daily']);
function onBackdrop() { return BACKDROP_SCREENS.has(S.mode); }
/** Test hook: `?still-backdrop` in the page's address draws the backdrop when it changes instead of orbiting it every frame. */
const STILL_BACKDROP = new URLSearchParams(location.search).has('still-backdrop');
/** The 3D leave: drop the game and release pointer lock, lockless play and drag-to-look play. */
function leaveGame() {
  input.exitLock();
  S.dragLook = false;
  setLockless(false);
  clearTouchModes();
  S.play?.leave();
  S.game = null;
  S.play = null;
  S.learn = null;
  ui.setTimed(true);
  board3d.generating = false;
  board3d.failure = null;
  board3d.progress = null;
  ui.setBoardStatus3D({});
}
/** Put the decorative demo board behind the menu; without WebGL 2 there is none to put. */
function showMenuBackdrop() {
  if (!WEBGL2) return;
  if (!S.demo) S.demo = makeDemo();
  renderer.setGame(S.demo);
  applyPixelRatio(S.demo.n);
  renderer.setSelected(-1);
  S.spacing = 1.25;
}

/**
 * The shown screen's live scene panel (ui-scene-panel--live) takes the 3D scene: its stage's rectangle
 * is the renderer's target, set on every screen change, window resize and change of the panel's box,
 * and the canvas is clipped to the panel's rounded corners; with no live panel shown (a 3D game, the
 * replay viewer, even over the menu it was opened from, every screen without one) the scene draws
 * full-window. On the main menu it draws only
 * into its 3D preview: on any other preview the canvas is hidden and nothing is drawn.
 */
let scenePanel = null;
const SCENE_PANEL_OBSERVER = WEBGL2 && typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncScenePanel()) : null;
function syncScenePanel() {
  if (!WEBGL2) return;
  const stage = S.mode === REPLAY_SCREEN ? null
    : [...document.querySelectorAll('.ui-scene-panel--live .ui-scene-panel__stage')].find((el) => el.getClientRects().length > 0) ?? null;
  if (stage !== scenePanel) {
    if (scenePanel) SCENE_PANEL_OBSERVER?.unobserve(scenePanel);
    if (stage) SCENE_PANEL_OBSERVER?.observe(stage);
    scenePanel = stage;
  }
  const box = stage?.getBoundingClientRect();
  const round = box ? getComputedStyle(stage.closest('.ui-scene-panel')).borderTopLeftRadius : '';
  // A panel inside a screen frame (the Daily screen's) is drawn in front of the frame, clipped to the
  // part of the panel the frame's scrolling body shows.
  const body = stage?.closest('.ui-frame__body')?.getBoundingClientRect();
  const clip = box && body
    ? { top: Math.max(box.top, body.top), right: Math.min(box.right, body.right), bottom: Math.min(box.bottom, body.bottom), left: Math.max(box.left, body.left) }
    : box;
  renderer.renderer.domElement.style.clipPath = clip
    ? `inset(${clip.top}px ${window.innerWidth - clip.right}px ${window.innerHeight - clip.bottom}px ${clip.left}px round ${round})` : '';
  document.body.classList.toggle('scene-front', !!body);
  document.body.classList.toggle('scene-off', sceneOff());
  if (renderer.setTarget(box ? { x: box.left, y: box.top, width: box.width, height: box.height } : null)) needRender = true;
}
/**
 * The main menu shows a preview other than its 3D one, the Daily screen no 3D panel in view, or a
 * board choice its own backdrop: no 3D scene shows or draws.
 */
function sceneOff() {
  return (S.mode === 'menu' && !menuSceneShown()) || S.mode === 'classic-2d-choice' || S.mode === 'board-choice'
    || (S.mode === DAILY_SCREEN && !(DAILY_PREVIEW.shown?.kind === 'scene' && scenePanel));
}
if (WEBGL2) window.addEventListener('resize', () => syncScenePanel()); // the panel may move with the window
if (WEBGL2) document.getElementById('daily-body').addEventListener('scroll', () => syncScenePanel(), { passive: true }); // or with its frame's body
if (WEBGL2) window.addEventListener('resize', () => { renderer.resize(); needRender = true; });
// The orbit's dolly range follows the new aspect; the camera stays where it is.
if (WEBGL2) window.addEventListener('resize', () => { if (cameraMode === 'orbit' && S.game) orbitCam.setRange(orbitRangeAt(S.spacing)); });
let reloading = false;
/**
 * The leave-page guard, armed by the pause controller only during a started, unfinished game:
 * Ctrl is a game key, and Ctrl+W cannot be intercepted.
 */
function guardLeave(e) {
  if (reloading || endDelay()) return; // a game in its end delay is over: nothing to lose
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
const CTX_LOST_INERT = ['pause', 'ready', 'menu', 'board-choice', 'coming-soon', 'records', 'settings', 'c2d-choice', 'c2d', 'c2d-status', 'm3d-status', 'controls-modal'];
/** Dead canvas: leave every game mode (so lock changes/keys can't resume) and disable other overlays. */
function showContextLost() {
  mouse.reset();
  input.exitLock();
  const els = CTX_LOST_INERT.map((id) => document.getElementById(id)).filter(Boolean);
  for (const el of els) if (el.id !== 'menu') el.classList.add('hidden');
  holdInert('ctxlost', els);
  document.getElementById('ctx-lost').classList.remove('hidden');
}
/** Leaving the context-lost screen (back to the menu): the other overlays are live again. */
function hideContextLost() {
  document.getElementById('ctx-lost').classList.add('hidden');
  holdInert('ctxlost', []);
}
document.getElementById('ctx-lost-btn').addEventListener('click', () => { reloading = true; location.reload(); });
document.getElementById('ctx-lost-menu').addEventListener('click', () => showMainMenu());

// ---------- game controller ----------
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
/** Every rumble: a pulse pattern of js/gamepad.js on the active pad. */
function padRumble(steps) { padPulse(pads.activePad(), steps); }
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
  'ctx-lost': 'ctxlost', 'controls-modal': null, 'c2d-status': null, 'm3d-status': null, replay: 'replay', pause: 'paused', ready: 'ready', 'learn-end': 'learn-end', results: 'results', look: 'look',
  'coming-soon': 'coming-soon', daily: 'daily', records: 'records', settings: 'settings', 'board-choice': 'board-choice', 'c2d-choice': 'classic-2d-choice', c2d: 'classic-2d', menu: 'menu',
};
const SCREEN_LAYER = Object.fromEntries(Object.entries(LAYER_SCREEN).filter(([, s]) => s).map(([l, s]) => [s, l]));
const MODAL_FOCUS = '#controls-close';
const STATUS_LAYERS = { 'c2d-status': ['c2d', board2d], 'm3d-status': ['m3d', board3d] };
function layerOpen(id) {
  const el = document.getElementById(id);
  return !!el && !el.classList.contains('hidden') && !isInert(el);
}

// The one owner of `inert`: each holder (the context-lost screen, the open overlay, the pause
// confirmation) names the elements it needs inert, and an element is inert while any holder names it,
// so one holder letting go never lifts what another still holds. Where the browser has no `inert`,
// the same set still bounds the controller's walk and the Tab wrap keeps keyboard focus inside.
const INERT_HOLDS = { ctxlost: [], overlay: [], confirm: [] };
let inertNow = new Set();
function holdInert(holder, els) {
  INERT_HOLDS[holder] = els;
  const want = new Set(Object.values(INERT_HOLDS).flat());
  for (const el of inertNow) if (!want.has(el)) el.inert = false;
  for (const el of want) if (!inertNow.has(el)) el.inert = true;
  inertNow = want;
}
/** Whether `el` sits inside an element the containment or the context-lost screen holds inert. */
function isInert(el) {
  for (const held of inertNow) if (held.contains(el)) return true;
  return false;
}
/** The overlays that contain focus while they are the topmost visible layer. */
const CONTAINED = new Set(['controls-modal', 'pause', 'learn-end', 'results', 'replay']);
/** Top-level elements that are not page content, never made inert by an overlay. */
const NOT_SECTIONS = new Set(['SCRIPT', 'NOSCRIPT', 'TEMPLATE']);
/** The open overlay that contains focus (the topmost visible layer, when it is one of CONTAINED), or null. */
function containedLayer() {
  const id = topLayer(Object.keys(LAYER_SCREEN), (l) => {
    const el = document.getElementById(l);
    return !!el && !el.classList.contains('hidden');
  });
  return CONTAINED.has(id) ? document.getElementById(id) : null;
}
/** Where Tab stays: the pause confirmation while it shows on the pause card, else the open overlay. */
function containedArea(layer) {
  const confirm = document.getElementById('pause-confirm');
  return layer?.id === 'pause' && !confirm.classList.contains('hidden') ? confirm : layer;
}
/**
 * Re-apply the containment: every other top-level section inert behind the open overlay (the toast
 * kept live), and the rest of the pause card inert behind its confirmation. Runs on every router
 * change and focus hand-off, on the Controls modal's toggle, and on any overlay's show or hide.
 */
function applyContainment() {
  const layer = containedLayer();
  const sections = [...document.body.children].filter((el) => el.id && !NOT_SECTIONS.has(el.tagName));
  holdInert('overlay', inertSections(sections, layer, [document.getElementById('toast')]));
  const area = containedArea(layer);
  holdInert('confirm', area && area !== layer ? cardBeside(area) : []);
}
/** Everything on the pause card beside `area`: its siblings, and its column's siblings up to the card. */
function cardBeside(area) {
  const card = document.getElementById('pause-card');
  const beside = [];
  for (let el = area; el !== card; el = el.parentElement) beside.push(...inertSections([...el.parentElement.children], el, []));
  return beside;
}
new MutationObserver(() => applyContainment()).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
/** Tab at the open overlay's edges wraps inside it, only where the browser has no `inert`. */
window.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || e.altKey || e.ctrlKey || e.metaKey || 'inert' in HTMLElement.prototype) return;
  const area = containedArea(containedLayer());
  if (!area) return;
  const items = padFocusables(area, TABBABLE).filter((el) => el.tabIndex >= 0);
  const cur = document.activeElement;
  if (area.contains(cur) && !items.includes(cur)) return;
  const to = tabWrap(items, cur, e.shiftKey);
  if (!to) return;
  e.preventDefault();
  to.focus();
});
function padLayer() {
  const id = topLayer(Object.keys(LAYER_SCREEN), layerOpen);
  return id && document.getElementById(id);
}
/** What the browser's Tab order can stop on: the native controls and anything with a tabindex. */
const TABBABLE = `${FOCUSABLE}, textarea, [tabindex]`;
/** The layer's visible, enabled controls outside any inert subtree, in DOM order. */
function padFocusables(layer, selector = FOCUSABLE) {
  return [...layer.querySelectorAll(selector)].filter((el) => {
    if (el.disabled || el.type === 'hidden' || isInert(el)) return false;
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
  applyContainment(); // the screen just shown is live before it takes focus
  const layer = document.getElementById(SCREEN_LAYER[name]);
  if (!target || !layer) return;
  const el = resolveFocus(layer.querySelector(target), padFocusables(layer));
  el?.focus({ preventScroll: true });
}
/** The screen or the topmost layer changed: drop held controller buttons and menu repeats. */
function layerChanged() {
  applyContainment();
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
/**
 * The control a focus move from `cur` in `dir` lands on inside the layer, or null: on Down / Up a
 * table's or a menu's controls in DOM order, else the spatial search, else the next or previous
 * control in DOM order. Up and down, the search treats a board choice's row of custom fields as one
 * control, starting from the whole row past its own controls, and aims at a table's buttons by their
 * row, so a table is entered from above or below wherever its buttons sit in the row, and at a switch
 * row's switch or a slider by its whole row, so a switch at its row's end and a slider short of it are
 * above or below each other. In a column
 * layout (a ui-columns of ui-column), a move from outside into the columns enters them at their first
 * control (Down) or last (Up); inside, Up and Down search only the column `cur` is in while it is laid
 * out as one (Records; not Settings' columns below its widest windows, whose sections are placed one
 * by one), so the walk leaves a column at its ends in DOM order. Up and Down into a radio group land
 * on its one stop, the checked option.
 */
const laidOutColumn = (el) => (el && getComputedStyle(el).display !== 'contents' ? el : null);
function navStep(layer, items, cur, dir) {
  const vertical = dir === 'up' || dir === 'down';
  const found = focusMove(items, cur, dir, {
    spatial: (d) => {
      const row = vertical && cur.closest('form .ui-row');
      const column = vertical && laidOutColumn(cur.closest('.ui-column'));
      const box = (e) => (vertical && (e.closest('tr') || e.closest('.ui-switchrow') || e.closest('.ui-slider'))) || e;
      const from = (row || cur).getBoundingClientRect();
      const cands = items.filter((e) => e !== cur && !(row && row.contains(e)) && (!column || column.contains(e)));
      const pick = pickInDirection(from, cands.map((e) => ({ rect: box(e).getBoundingClientRect(), item: e })), d);
      const columns = vertical && !cur.closest('.ui-column') && pick?.closest('.ui-column')?.parentElement;
      if (!columns) return pick;
      const inside = items.filter((e) => columns.contains(e));
      return d === 'down' ? inside[0] : inside[inside.length - 1];
    },
    groupOf: (el) => el.closest('table, .ui-menu'),
  });
  const group = vertical && found?.getAttribute('role') === 'radio' ? found.closest('[role="radiogroup"]') : null;
  if (!group || group.contains(cur)) return found;
  return items.find((e) => group.contains(e) && e.tabIndex === 0) ?? found;
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
const KEY_NAV_OFF = new Set(['playing', 'classic-2d', 'records', REPLAY_SCREEN, LOOK_SCREEN]);
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
    // A screen opened by the pointer focuses its default control without drawing a board option selected.
    if (!document.body.classList.contains('pointer-nav')) document.body.classList.add('pointer-nav');
  }, true);
}

/** One controller poll result -> game / menu actions. Runs once per frame. */
function handlePad(p, dt, now) {
  nav.update(p.held);
  const held = (b) => nav.held(p, b);
  const pressed = (b) => nav.pressed(p, b);
  if (p.active) needRender = true;
  // An end delay: a button pressed ends it and does nothing else; the held ones stay off the results card.
  const anyPressed = p.pressed.some((_, b) => pressed(b));
  if (END_SKIP.pad(anyPressed)) { controls.releasePad(); return; }
  // The look: a button pressed brings the results card back and does nothing else; the sticks fly.
  if (LOOK_END.pad(anyPressed)) { if (looking()) padLook(p, dt); else controls.releasePad(); return; }
  const modal = ui.isControlsOpen();
  // Start + Y: Y pressed while Start is held restarts, in play and on the pause card. Start's own
  // press already paused (or resumed), so Start is read unsuppressed; the buttons still held are
  // suppressed so Y does not act on the new board.
  if (p.held[BTN.START] && pressed(BTN.Y) && restartInput('pad', { screen: S.mode, blocked: restartBlocked() })) {
    PAUSE.restart('pad');
    layerChanged();
    return;
  }

  if (S.mode === 'playing') padPlaying(p, held, pressed, dt, now);
  else if (S.mode === 'classic-2d') padBoard2D(p, held, pressed, now);
  else if (S.mode === REPLAY_SCREEN) padReplay(p, held, pressed, dt, now);
  else padMenus(p, held, pressed, now);

  if (ui.isControlsOpen() !== modal) layerChanged(); // screen changes report through the router
}

function padPlaying(p, held, pressed, dt, now) {
  if (board3d.failure || board3d.generating) { padStatus3D(p, held, pressed, now); return; }
  if (pressed(BTN.START)) { padClick(document.getElementById('hud-pause')); return; } // the overlay's pause button
  if (backButtons(S.mode).some(pressed)) { backGame('pad'); return; } // Back while playing = Pause, or cancels a board being generated
  if (pressed(BTN.X)) ui.userToggleHelp();
  // Triggers drive the same release-based state machine as the mouse (both = chord via its toggle);
  // a trigger's press pulses, the cue that its action comes on release.
  if (pressed(BTN.RT) || pressed(BTN.LT)) padRumble(PAD_PRESS);
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
  padSticks(p, dt);
  controls.axes.u = cameraMode === 'orbit' ? 0 : (held(BTN.A) ? 1 : 0) - (held(BTN.B) ? 1 : 0); // unused in Orbit: the board stays centred
  const notches = padRep.spUp.update(held(BTN.UP), now) - padRep.spDown.update(held(BTN.DOWN), now);
  if (notches) setSpacing(spacingStep({ spacing: S.spacing }, notches).spacing); // one step a press and a repeat
}

/** The sticks: the left one moves (up = forward; in Orbit its vertical axis alone dollies, up = in), the right one looks. */
function padSticks(p, dt) {
  const [lx, ly] = stickCurve(p.ls[0], p.ls[1]);
  controls.axes.f = ly ? -ly : 0; // stick up = forward
  controls.axes.r = cameraMode === 'orbit' ? 0 : lx;
  controls.axes.u = 0;
  const [rx, ry] = stickCurve(p.rs[0], p.rs[1]);
  view3D().lookAxes(dt, rx, ry);
}

/** The look at a finished 3D board: the sticks alone fly; every button brings the results card back (LOOK_END). */
function padLook(p, dt) {
  controls.pad.shift = false;
  controls.pad.space = false;
  controls.pad.ctrl = false;
  padSticks(p, dt);
}

/**
 * The Classic 2D board: Start pauses through the window's Pause and the back buttons are
 * Back (Pause, or cancelling a board being generated); the board status card is a menu, and
 * everything else goes to the board's cursor input.
 */
function padBoard2D(p, held, pressed, now) {
  controls.releasePad();
  if (padUsed(p)) used2D();
  if (pressed(BTN.START)) { padClick(document.getElementById('c2d-pause')); return; }
  if (backButtons(S.mode).some(pressed)) { backGame('pad'); return; }
  if (board2d.failure || board2d.generating) { padMenus(p, held, pressed, now); return; }
  mode2d.pad({ ...p, held: p.held.map((_, b) => held(b)) }, now);
}

/** The replay viewer: Start / Y play and pause, LB / RB step, LT / RT change speed; the rest is menu navigation. On a free 3D camera the sticks fly it. */
function padReplay(p, held, pressed, dt, now) {
  controls.releasePad();
  if (!REPLAY_VIEWER.pad(pressed)) padMenus(replay3d.free ? { ...p, ls: [0, 0] } : p, held, pressed, now); // a free camera's stick flies, it does not navigate
  if (!replay3d.free) return;
  const [lx, ly] = stickCurve(p.ls[0], p.ls[1]);
  controls.axes.f = ly ? -ly : 0;
  controls.axes.r = cameraMode === 'orbit' ? 0 : lx;
  controls.axes.u = 0;
  const [rx, ry] = stickCurve(p.rs[0], p.rs[1]);
  replayView().lookAxes(dt, rx, ry);
  if (rx || ry) needRender = true;
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
    if (modal) ui.closeControls();
    else if (S.mode === 'ready' || S.mode === 'paused') ui.userToggleHelp();
    return;
  }
  if (pressed(BTN.A)) { padActivate(); return; }
  if (S.mode === 'records' && !modal && !ui.isConfirmOpen() && !RECORDS_PAGE.confirmOpen && padRecords(pressed)) return;
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

/**
 * Records: LB / RB the previous / next board of the picker, LT / RT the 2D / 3D mode, each as its
 * click does. Focus stays on its control while that still shows, else goes to the chosen board.
 */
function padRecords(pressed) {
  const step = (pressed(BTN.RB) ? 1 : 0) - (pressed(BTN.LB) ? 1 : 0);
  const mode = pressed(BTN.LT) ? TRIGGER_MODES.lt : pressed(BTN.RT) ? TRIGGER_MODES.rt : null;
  if (!step && !mode) return false;
  if (step) RECORDS_PAGE.stepBoard(step);
  if (mode) RECORDS_PAGE.setMode(mode);
  const layer = document.getElementById('records');
  if (!padCurrent(layer, padFocusables(layer))) padFocus(layer.querySelector('#records-picker [aria-checked="true"]'));
  return true;
}

// ---------- frame loop ----------
const tmpDir = new THREE.Vector3();

/** The cell under the crosshair of the renderer's camera, on `g` drawn at `spacing`. */
function aimedCell(g, spacing, space) {
  const three = renderer.camera;
  three.getWorldDirection(tmpDir);
  return pickCell(g, spacing, three.position, tmpDir, space); // from the camera, as the fly-through fade measures
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
  S.readout = aimReadout(g, S.selected);
}
/** The aimed-cell readout beside the crosshair: the setting aimReadout (on by default) turns it off; shown only in 3D play, never paused or in the end delay. */
function updateReadout() {
  const on = SETTINGS.get('aimReadout') && S.mode === 'playing' && MODES.active === '3d' && !endDelay() && !onBackdrop() && !replay3d.view;
  ui.setReadout(on ? S.readout : null);
}
/** The off-screen arrow beside the crosshair, toward the box while none of it is in view; only in 3D play. */
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
  if (!endDelay()) renderer.setToggles(playing && controls.shift, playing && controls.space, playing && controls.ctrl);
  renderer.setSpacing(S.spacing);
  updatePick();
  updateReadout();
}
let last = performance.now();
const fps = { frames: 0, acc: 0, value: 0 };
const stats = { renders: 0, skipped: 0 };

// Render on demand: skip the GL draw when nothing visible changed.
let needRender = true;
// The 3D scene follows the theme: the active board module — atlas, sky, fog and background — is handed to
// the renderer once its number font has loaded, and again on every theme change, so the demo board, a
// game, the pause card and the 3D replay all switch at once.
if (WEBGL2) bindScenePalette({ art: BOARD_ART, renderer, onApplied: () => { needRender = true; } });
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
  if (S.mode === 'results' && RESULTS.current?.mode === '3d') return needRender || synced || rendererAnimating() === true; // behind the card: on demand only
  if (needRender || synced) return true;
  if (onBackdrop()) return !STILL_BACKDROP && !sceneOff();
  if (S.endState !== lastEnd) { lastEnd = S.endState; if (S.endState) animUntil = now + 6000; return true; }
  const anim = rendererAnimating();
  if (anim === true) return true;
  if (anim === null) {
    // No animation hook from the renderer: assume time-based effects may be running.
    if (now < animUntil) return true;
    if (S.mode === 'playing' && S.selected >= 0) return true;
  }
  const t = renderer.toggles, c = renderer.camera;
  const sig = `${cam.x},${cam.y},${cam.z},${cam.yaw},${cam.pitch},${S.spacing},${t.shift},${t.space},${t.ctrl},${S.selected},${S.game ? S.game.version : -1},${c.aspect},${c.fov},${S.mode}`;
  if (sig !== lastSig) { lastSig = sig; return true; }
  return false;
}

/** The running time on the pause card while it shows. */
function showPauseTime() {
  if (S.mode === 'paused' && (MODES.active === 'classic-2d' ? mode2d.status() : S.game)) ui.updatePause(pauseInfo());
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
  if (!WEBGL2) { // no renderer: the controller, the 2D board and the replay viewer only
    showPauseTime();
    stats.skipped++;
    requestAnimationFrame(frame);
    return;
  }

  const three = renderer.camera;
  const playing = S.mode === 'playing';
  const looking3D = looking();
  const orbiting = cameraMode === 'orbit';
  const moving = (playing && !endDelay()) || looking3D; // the flight keys and sticks act (Orbit: rotate and dolly)
  const arrows = input.canLook() ? input.lookKeys : { x: 0, y: 0 }; // keyboard look, beside mouse look
  const keys = input.move;
  const turn = orbiting && moving ? Math.sign(arrows.x + keys.d - keys.a) : arrows.x; // Orbit: A / D rotate as the arrows do
  keyLook.update(view3D(), dt, turn, arrows.y);
  if (onBackdrop()) {
    if (!STILL_BACKDROP) S.orbit += dt * 0.12;
    const r = 62;
    three.position.set(Math.sin(S.orbit) * r, 24 + Math.sin(S.orbit * 0.7) * 10, Math.cos(S.orbit) * r);
    three.lookAt(0, 0, 0);
    three.updateMatrixWorld(true);
    renderer.setToggles(false, false, false);
  } else if (replay3d.view) {
    if (replay3d.free) flyReplay(dt);
    replayCam.apply(three); // the recorded camera, or the free one, and the recorded view mode
    const t = replay3d.toggles;
    renderer.setToggles(t.shift, t.space, t.ctrl);
  } else {
    const frozen = endDelay(); // the end delay: the camera and the view mode stay as the game ended
    const flying = playing || looking3D; // the look flies over the finished board as play does
    if (orbiting) { // W / S and the left stick's vertical axis dolly; Q / E and A / B do nothing
      const v = (keys.w ? 1 : 0) - (keys.s ? 1 : 0) + (controls.hasAxes ? controls.axes.f : 0);
      if (moving) orbitCam.dollyAxis(dt, Math.max(-1, Math.min(1, v)));
      if (moving) applyTouchStick({ cam, dt, stick: touch3D.stick, orbit: orbitCam }); // the touch stick's vertical axis dollies
    } else if ((playing && !frozen) || looking3D) {
      cam.move(dt, input.move);
      if (controls.hasAxes) cam.moveAxes(dt, controls.axes.f, controls.axes.r, controls.axes.u);
      applyTouchStick({ cam, dt, stick: touch3D.stick, orbit: null }); // the touch stick flies as the controller's left stick
    }
    if (COARSE_ONLY) ui.setStick(touch3D.stickView);
    cam.apply(three);
    if (!frozen) {
      const shift = flying && controls.shift, space = flying && controls.space, ctrl = flying && controls.ctrl;
      renderer.setToggles(shift, space, ctrl);
      ui.setModes(shift, space, ctrl);
      if (S.learn && playing) learnViews(shift, ctrl);
    }
  }
  if (MODES.active === '3d') mode3d.tick(); // the replay's camera sampler
  progress3D();
  renderer.setSpacing(replay3d.view ? REPLAY_SPACING : S.spacing);
  const synced = renderer.sync();

  // picking: only when something relevant changed
  const g = S.game;
  if (replay3d.view) updateReplayPick();
  else if (g && !onBackdrop()) {
    updatePick();
    updateArrow((playing && !endDelay()) || looking3D);
    // the timer is the session's: it runs through pauses, frozen at the end
    if (S.play && S.started && !S.endState) S.time = S.play.elapsedMs() / 1000;
    const e = S.endState;
    ui.updateHud(e ? e.time : S.time, e ? e.minesLeft : g.minesLeft, e ? e.clicks : clicks3D());
    FIGURES_3D.push({ counts: S.play?.counts() ?? null, flags: S.settings.mines - (e ? e.minesLeft : g.minesLeft), mines: S.settings.mines, elapsedMs: (e ? e.time : S.time) * 1000 });
    if (playing && !endDelay()) aimHint(g, now);
    else AIM_DWELL.reset();
  }
  updateReadout();

  showPauseTime();

  if (shouldRender(now, synced)) {
    needRender = false;
    renderer.render();
    stats.renders++;
  } else stats.skipped++;
  requestAnimationFrame(frame);
}

await Promise.all([settingsLoaded, recordsLoaded, firstUseLoaded, LAST_CHOICE_3D.load().catch(() => {}), RECORDS_VIEW_PREFS.load().catch(() => {})]);
showMainMenu();
LINKS.start(); // a #board= link: its challenge or daily over the menu, so Back leads to the menu
window.addEventListener('hashchange', () => LINKS.hashchange());
mode2d.loadChoice().catch(() => {}); // the Classic 2D board choice opens on the last board
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
  spawnPose: (X, Y, Z) => spawnPose({ X, Y, Z }, S.spacing, renderer?.camera.fov, renderer?.camera.aspect),
  THREE,
  start(X, Y, Z, mines, minePositions) { if (!WEBGL2) throw new Error(UNAVAILABLE_REASONS.webgl2); MODES.start('3d', { X, Y, Z, mines, minePositions }); },
  /** Start the Learn 3D guided board, as its board choice entry does. */
  learn() { startLearn(); },
  /** The guided board (js/mode3d/learn.js LEARN_BOARD) and the open game's prompt sequence, or null. */
  get learnBoard() { return LEARN_BOARD; },
  get learnPrompts() { return S.learn; },
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
  key(code, down = true) { // a held key; Enter and ' press and release as their key would
    if (down) { input.keys.add(code); input.actions.down(code); } else { input.keys.delete(code); input.actions.up(code); }
    refresh();
  },
  wheel(notches) { wheel3D(notches); refresh(); },
  selected() { refresh(); return S.selected; },
  pickBrute() {
    const three = renderer.camera; three.getWorldDirection(tmpDir);
    return pickCellBrute(S.game, S.spacing, three.position, tmpDir, renderer.toggles.space);
  },
  pickWith(o, d, space = false) { return [pickCell(S.game, S.spacing, o, d, space), pickCellBrute(S.game, S.spacing, o, d, space)]; },
  info() {
    const g = S.game;
    return {
      mode: S.mode, selected: S.selected, time: S.time, started: S.started, spacing: S.spacing,
      gameState: g?.state, minesLeft: g?.minesLeft, hud: [document.getElementById('hud-time').textContent, document.getElementById('hud-mines').textContent], readout: ui.readout,
      cam: { x: cam.x, y: cam.y, z: cam.z, yaw: cam.yaw, pitch: cam.pitch }, stats: { ...renderer?.stats }, fps: fps.value,
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
  /** The replay library: load/add/pin/unpin/forBoard/entries/settled. */
  get replays() { return REPLAYS; },
  /** The open Classic 2D board view (js/classic2d/board-view.js): its layout, scroll, cursor and scale. */
  get board2D() { return mode2d.boardView; },
  /** The open Classic 2D board's engine game: cellState, cellNumber, snapshot. */
  get game2D() { return mode2d.boardGame; },
  /** Opens the replay viewer: `data` is its route's { replay | replayId, returnTo }. */
  watch: (data) => SHELL.go(REPLAY_SCREEN, { data }),
  /** The daily boards pre-generated when the menu shows (js/shell/daily.js): has(code), take(code). */
  get daily() { return DAILY_BOARDS_HELD; },
};
