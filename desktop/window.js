// The game window: frameless and transparent, so the page draws the whole window in its title bar's
// style; moved by the drag region the page marks; never resized by the player — it takes the
// content size the page reports, never past the work area of the display it is on. The window
// actions here are what the page bridge calls.
import { GAME_ORIGIN } from './protocol.js';

/** The content size the window opens at, before the page reports its own. */
export const DEFAULT_CONTENT_SIZE = Object.freeze({ width: 1280, height: 800 });

export function windowOptions(state, { preload } = {}) {
  const placed = Number.isInteger(state.x) && Number.isInteger(state.y);
  return {
    title: 'Minesweeper 3D',
    width: DEFAULT_CONTENT_SIZE.width,
    height: DEFAULT_CONTENT_SIZE.height,
    useContentSize: true,
    ...(placed ? { x: state.x, y: state.y } : {}),
    center: !placed,
    fullscreen: Boolean(state.fullscreen),
    fullscreenable: true,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      ...(preload ? { preload } : {}),
    },
  };
}

/**
 * The window actions: set the content size, toggle fullscreen, minimise, and listen to fullscreen
 * changes. A content size never goes past the work area of the display the window is on (`screen`,
 * Electron's, finds it; without one the size is taken as given): it is capped there and the window
 * moved inside it, again whenever the window is moved — to another display, it is laid out against
 * that one's work area. A size reported while fullscreen applies on leaving it. The fullscreen state
 * follows the window's enter and leave events, never `isFullScreen()`, which a transparent window on
 * Windows always answers false.
 */
export function windowActions(win, { fullscreen = false, screen = null } = {}) {
  const listeners = new Set();
  let isFullscreen = Boolean(fullscreen);
  let size = null;
  const notify = (on) => { for (const listener of listeners) listener(on); };
  const fit = () => {
    if (!size || isFullscreen) return;
    const area = screen?.getDisplayMatching(win.getBounds()).workArea;
    if (!area) {
      win.setContentSize(...size);
      return;
    }
    const width = Math.min(size[0], area.width);
    const height = Math.min(size[1], area.height);
    win.setContentSize(width, height);
    const [x, y] = win.getPosition();
    const inside = [
      Math.min(Math.max(x, area.x), area.x + area.width - width),
      Math.min(Math.max(y, area.y), area.y + area.height - height),
    ];
    if (inside[0] !== x || inside[1] !== y) win.setPosition(...inside);
  };
  win.on('enter-full-screen', () => {
    isFullscreen = true;
    win.setMovable(false);
    notify(true);
  });
  win.on('leave-full-screen', () => {
    isFullscreen = false;
    win.setMovable(true);
    fit();
    notify(false);
  });
  if (screen) win.on('moved', fit);
  return {
    setContentSize(width, height) {
      size = [Math.round(width), Math.round(height)];
      fit();
    },
    toggleFullscreen() { win.setFullScreen(!isFullscreen); },
    minimise() { win.minimize(); },
    isFullscreen() { return isFullscreen; },
    onFullscreenChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Keeps the page on the game origin and opens no other window. */
export function lockNavigation(webContents) {
  webContents.on('will-navigate', (event, url) => {
    if (!String(url).startsWith(`${GAME_ORIGIN}/`)) event.preventDefault();
  });
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

/** Saves the windowed position and the fullscreen state whenever either changes. */
function trackState(win, actions, initial, save) {
  let state = { ...initial };
  const update = () => {
    const fullscreen = actions.isFullscreen();
    if (!fullscreen && !win.isMinimized()) {
      const [x, y] = win.getPosition();
      state = { x, y, fullscreen };
    } else {
      state = { ...state, fullscreen };
    }
    save(state);
  };
  win.on('moved', update);
  win.on('enter-full-screen', update);
  win.on('leave-full-screen', update);
}

/** Creates the game window from the stored state, sized against `screen`'s work areas; shown once its first frame is ready. */
export function createGameWindow({ BrowserWindow, state, save = () => {}, preload, screen = null }) {
  const win = new BrowserWindow(windowOptions(state, { preload }));
  const actions = windowActions(win, { fullscreen: state.fullscreen, screen });
  trackState(win, actions, state, save);
  lockNavigation(win.webContents);
  win.once('ready-to-show', () => win.show());
  return { win, actions };
}
