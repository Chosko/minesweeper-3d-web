// The Electron main process: one game window loading the web game's files over the game protocol,
// a single-instance lock, the window state file, the crash log, the closing sequence, the Steam
// adapter, the page bridge and the save directory's file service behind it.
import { app, BrowserWindow, ipcMain, protocol, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_URL, handleGameProtocol, registerGameScheme } from './protocol.js';
import { WINDOW_STATE_FILE, placeOnScreen, readWindowState, writeWindowState } from './window-state.js';
import { captureMainErrors, capturePageErrors, createCrashLog } from './crash-log.js';
import { createClosing } from './closing.js';
import { DEFAULT_CONTENT_SIZE, createGameWindow } from './window.js';
import { createUnavailableAdapter } from './adapter/unavailable.js';
import { OVERLAY_SWITCHES, openSteamworks, resolveAppId, startSteam, steamLibraryPath } from './adapter/steam.js';
import { createBridge } from './bridge.js';
import { createFileService, registerFileService } from './file-service.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** How often the page is repainted while Steam runs, so its overlay can open and draw over a still page. */
const OVERLAY_REPAINT_MS = 1000 / 60;

/** The game files: packaged beside the app's resources, else the repository root the web preview serves. */
const gameRoot = () => (app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(HERE, '..'));

const crashLog = createCrashLog(app.getPath('userData'));
captureMainErrors(crashLog);
registerGameScheme(protocol);
for (const name of OVERLAY_SWITCHES) app.commandLine.appendSwitch(name);

/** The closing sequence; the bridge sets its flush and shutdown hooks. */
export const closing = createClosing({ exit: () => app.exit(0), onError: (error) => crashLog.write('main', error) });

/** The Steam adapter: the Steam implementation once Steam starts, the unavailable one otherwise. */
export let adapter = createUnavailableAdapter();

/** The game window and its actions, once created. */
export let game = null;

/** The page bridge, once the game window exists. */
export let bridge = null;

/** Starts Steam before any window: false when Steam relaunches the game through its client. */
function startSteamAdapter() {
  const packaged = app.isPackaged;
  const onError = (error) => crashLog.write('main', error);
  const started = startSteam({
    binding: openSteamworks({ libraryPath: steamLibraryPath({ packaged, exeDir: path.dirname(process.execPath), appDir: HERE }), onError }),
    appId: resolveAppId({ packaged, appDir: HERE }),
    packaged,
    onError,
  });
  adapter = started.adapter;
  return !started.relaunch;
}

/**
 * Keeps the page presenting frames whenever the overlay can open: Steam draws the overlay, and opens
 * it on its key, only on the game's own presents, which a paused, still page stops making.
 */
function repaintForOverlay(win) {
  if (!adapter.capabilities.overlay) return;
  const timer = setInterval(() => { if (!win.isDestroyed()) win.webContents.invalidate(); }, OVERLAY_REPAINT_MS);
  win.once('closed', () => clearInterval(timer));
}

if (!app.requestSingleInstanceLock()) {
  app.exit(0);
} else if (!startSteamAdapter()) {
  app.exit(0);
} else {
  app.on('second-instance', () => {
    if (!game) return;
    if (game.win.isMinimized()) game.win.restore();
    game.win.show();
    game.win.focus();
  });
  app.on('window-all-closed', () => closing.run());

  app.whenReady().then(() => {
    handleGameProtocol(protocol, gameRoot());
    const stateFile = path.join(app.getPath('userData'), WINDOW_STATE_FILE);
    const workAreas = screen.getAllDisplays().map((display) => display.workArea);
    const state = placeOnScreen(readWindowState(stateFile), workAreas, DEFAULT_CONTENT_SIZE);
    game = createGameWindow({
      BrowserWindow, state, screen, save: (next) => writeWindowState(stateFile, next), preload: path.join(HERE, 'preload.js'),
    });
    capturePageErrors(crashLog, game.win.webContents);
    repaintForOverlay(game.win);
    bridge = createBridge({ adapter, window: game.actions, closing });
    registerFileService(bridge, createFileService({ root: app.getPath('userData') }));
    bridge.attach({ ipcMain, webContents: game.win.webContents });
    game.win.on('close', (event) => {
      event.preventDefault();
      closing.run();
    });
    game.win.loadURL(GAME_URL);
  });
}
