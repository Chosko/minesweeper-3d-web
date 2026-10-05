// Entry point: wires game logic, renderer, input and UI together.
import * as THREE from 'three';
import { Game, createGameFromMinePositions } from './logic.js';
import { BoardRenderer } from './render.js';
import { FlyCamera, MouseActions, Input, SPACING_MIN, SPACING_MAX, SPACING_START } from './input.js';
import { pickCell, pickCellBrute } from './picking.js';
import { UI, clampSettings, recordBest, getBest, fmtTime, loadLookSettings, NO_MOUSE_MSG } from './ui.js';
import * as audio from './audio.js';

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
Object.assign(cam, loadLookSettings());

// Pointer lock / input device support
const LOCK_SUPPORTED = 'requestPointerLock' in Element.prototype;
const COARSE_ONLY = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches);
const NO_MOUSE = !LOCK_SUPPORTED || COARSE_ONLY;
const S = {
  mode: 'menu', // 'menu' | 'ready' | 'playing' | 'paused'
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
  debugActive: false, // debug hook drives the game without pointer lock
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
    if (!S.started) { S.started = true; S.time = 0; }
    const r = g.leftClick(sel);
    if (r.exploded) boom();
    else if (r.revealed > 0) sfx.reveal(r.revealed);
  } else if (type === 'right') {
    const r = g.rightClick(sel);
    if (r.flagged || r.unflagged) sfx.flag(r.flagged >= r.unflagged, r.flagged + r.unflagged);
  } else if (type === 'chord') {
    const r = g.chord(sel);
    if (r.exploded) boom();
    else if (r.revealed > 0) sfx.chord(r.revealed);
  }
  if (g.version === v0 && typeof sfx.noop === 'function') sfx.noop(); // action changed nothing
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
function boom() { sfx.explode(); ui.flash(); }
function endGame(minesLeft) {
  const g = S.game;
  S.endState = { state: g.state, time: S.time, minesLeft };
  if (g.state === 'won') sfx.win();
  ui.showBanner(g.state, S.time);
}

const mouse = new MouseActions(onAction, hasSelection);
const input = new Input({
  canvas,
  mouse,
  isActive: () => S.mode === 'playing',
  onLook: (dx, dy) => cam.look(dx, dy),
  onWheel: (notches) => setSpacing(S.spacing + notches * 0.04),
  onKey: (code, e) => {
    if (code === 'Escape') {
      if (S.mode === 'menu') ui.closeControls();
      else if (S.mode === 'ready') readyBack();
      return;
    }
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
    } else if (S.mode === 'playing' && !S.debugActive) {
      pause();
    }
  },
  onLockError: () => {
    if (S.mode === 'paused' || S.mode === 'ready') {
      S.mode = 'ready';
      let msg;
      if (NO_MOUSE) msg = NO_MOUSE_MSG;
      else if (performance.now() - input.unlockedAt < 1500) msg = 'The browser needs a moment before locking the mouse again. Click once more.';
      else msg = 'Could not capture the mouse. Click once more.';
      ui.showReady(S.settings, msg);
    }
  },
});

// Fullscreen + Keyboard Lock (where supported) so Ctrl+W/Ctrl+S etc. reach the game instead of the browser.
const LOCK_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight'];
function toggleFullscreen() {
  const d = document;
  if (d.fullscreenElement) { d.exitFullscreen?.().catch(() => {}); return; }
  const el = d.documentElement;
  if (!el.requestFullscreen) return;
  el.requestFullscreen({ navigationUI: 'hide' }).then(() => {
    navigator.keyboard?.lock?.(LOCK_KEYS).catch(() => {});
    if (S.mode === 'playing' && !d.pointerLockElement) input.requestLock();
  }).catch(() => {});
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) navigator.keyboard?.unlock?.(); });

function setSpacing(s) { S.spacing = Math.min(SPACING_MAX, Math.max(SPACING_MIN, s)); }
function toggleSound() { ui.setSound(sfx.toggleMute()); }

// ---------- screens ----------
const ui = new UI({
  onStart: (s) => { sfx.unlock(); startGame(s); },
  onReadyClick: () => { sfx.unlock(); input.requestLock(); },
  onResume: () => { ui.showReady(S.settings); S.mode = 'ready'; input.requestLock(); },
  onRestart: () => { startGame(S.settings); input.requestLock(); },
  onMainMenu: () => showMainMenu(),
  onReadyBack: () => readyBack(),
  onToggleSound: () => toggleSound(),
  onLookSettings: (o) => { cam.sensitivity = o.sensitivity; cam.invertY = o.invertY; },
});
ui.setSound(sfx.muted);
ui.setNoMouse(NO_MOUSE);
if (typeof sfx.setVolume === 'function' && typeof sfx.getVolume === 'function') {
  ui.initVolume(sfx.getVolume(), (v) => { sfx.setVolume(v); sfx.unlock?.(); });
}

/** Leave the ready screen: a fresh board goes back to the menu; a game in progress opens the pause menu. */
function readyBack() {
  if (S.mode !== 'ready') return;
  if (S.game && S.started) pause();
  else showMainMenu();
}

/** Adaptive resolution: big boards are fill/vertex heavy. */
function applyPixelRatio(n) {
  const dpr = window.devicePixelRatio || 1;
  const cap = n > 50 ** 3 ? 1 : n > 20 ** 3 ? 1.5 : 2;
  const pr = Math.min(dpr, cap);
  if (renderer.renderer.getPixelRatio() !== pr) { renderer.renderer.setPixelRatio(pr); renderer.resize(); }
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
  S.mode = 'ready';
  ui.showReady(S.settings, NO_MOUSE ? NO_MOUSE_MSG : '');
  needRender = true;
}

/**
 * Start camera. Original: camera (0, 10, -8M), grid centre at s=1.1 is (0.2X-3.2, 0.2Y-3.2, 0.2Z-3.2)
 * (M = max(X,Y,Z)). The port centres the grid on the origin, so the camera is shifted by minus that
 * centre. x/y are then snapped to the nearest cell column so the crosshair starts on a cube.
 */
function startCameraPos(X, Y, Z) {
  const M = Math.max(X, Y, Z), p = 4 * SPACING_START;
  const snap = (v, N) => {
    const i = Math.min(N - 1, Math.max(0, Math.round(v / p + (N - 1) / 2)));
    return (i - (N - 1) / 2) * p;
  };
  return [snap(3.2 - 0.2 * X, X), snap(13.2 - 0.2 * Y, Y), -8 * M + 3.2 - 0.2 * Z];
}

function enterPlaying() {
  S.mode = 'playing';
  ui.showPlaying();
  // A board full of mines is won before the first click: run the end flow once.
  const g = S.game;
  if (g && g.state !== 'playing' && !S.endState) { endGame(g.minesLeft); afterEndGame(); }
}

function pause() {
  S.mode = 'paused';
  mouse.reset();
  const g = S.game;
  const e = S.endState;
  ui.showPause({ state: g.state, time: e ? e.time : S.time, minesLeft: e ? e.minesLeft : g.minesLeft });
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

function showMainMenu() {
  input.exitLock();
  S.mode = 'menu';
  S.debugActive = false;
  S.game = null;
  if (!S.demo) S.demo = makeDemo();
  renderer.setGame(S.demo);
  applyPixelRatio(S.demo.n);
  renderer.setSelected(-1);
  S.spacing = 1.25;
  ui.hideBanner();
  ui.showMenu();
}

window.addEventListener('resize', () => { renderer.resize(); needRender = true; });
let reloading = false;
window.addEventListener('beforeunload', (e) => {
  // Ctrl is a game key, and Ctrl+W cannot be intercepted: ask before leaving a game.
  if (!reloading && S.game && S.mode !== 'menu') {
    e.preventDefault();
    e.returnValue = '';
  }
});

// WebGL context loss: keep the page, offer a reload.
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  input.exitLock();
  document.getElementById('ctx-lost').classList.remove('hidden');
});
document.getElementById('ctx-lost-btn').addEventListener('click', () => { reloading = true; location.reload(); });

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
  if (!S.game || S.mode === 'menu') return;
  cam.apply(renderer.camera);
  const playing = S.mode === 'playing';
  renderer.setToggles(playing && input.shift, playing && input.space, playing && input.ctrl);
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
  if (S.mode === 'menu' || needRender || synced) return true;
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

  const three = renderer.camera;
  const playing = S.mode === 'playing';
  if (S.mode === 'menu') {
    S.orbit += dt * 0.12;
    const r = 62;
    three.position.set(Math.sin(S.orbit) * r, 24 + Math.sin(S.orbit * 0.7) * 10, Math.cos(S.orbit) * r);
    three.lookAt(0, 0, 0);
    three.updateMatrixWorld(true);
    renderer.setToggles(false, false, false);
  } else {
    if (playing) cam.move(dt, input.move);
    cam.apply(three);
    const shift = playing && input.shift, space = playing && input.space, ctrl = playing && input.ctrl;
    renderer.setToggles(shift, space, ctrl);
    ui.setModes(shift, space, ctrl);
  }
  renderer.setSpacing(S.spacing);
  const synced = renderer.sync();

  // picking: only when something relevant changed
  const g = S.game;
  if (g && S.mode !== 'menu') {
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

showMainMenu();
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
  start(X, Y, Z, mines, minePositions) { startGame({ X, Y, Z, mines, minePositions }); },
  /** Enter playing mode without pointer lock (headless tests). */
  forcePlay() { S.debugActive = true; enterPlaying(); },
  pause() { pause(); },
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
};
