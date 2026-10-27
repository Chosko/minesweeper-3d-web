// The Electron main process: one game window loading the web game's files over the game protocol,
// a single-instance lock, the window state file, the crash log, the closing sequence, the Steam
// adapter and the page bridge.
import { app, BrowserWindow, ipcMain, protocol, screen } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_URL, handleGameProtocol, registerGameScheme } from './protocol.js';
import { WINDOW_STATE_FILE, placeOnScreen, readWindowState, writeWindowState } from './window-state.js';
import { captureMainErrors, capturePageErrors, createCrashLog } from './crash-log.js';
import { createClosing } from './closing.js';
import { DEFAULT_CONTENT_SIZE, createGameWindow } from './window.js';
import { createUnavailableAdapter } from './adapter/unavailable.js';
import { createBridge } from './bridge.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** The game files: packaged beside the app's resources, else the repository root the web preview serves. */
const gameRoot = () => (app.isPackaged ? path.join(process.resourcesPath, 'game') : path.join(HERE, '..'));

const crashLog = createCrashLog(app.getPath('userData'));
captureMainErrors(crashLog);
registerGameScheme(protocol);

/** The closing sequence; the bridge sets its flush and shutdown hooks. */
export const closing = createClosing({ exit: () => app.exit(0), onError: (error) => crashLog.write('main', error) });

/** The Steam adapter: the unavailable implementation until the Steam implementation exists. */
export const adapter = createUnavailableAdapter();

/** The game window and its actions, once created. */
export let game = null;

/** The page bridge, once the game window exists. */
export let bridge = null;

if (!app.requestSingleInstanceLock()) {
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
    bridge = createBridge({ adapter, window: game.actions, closing });
    bridge.attach({ ipcMain, webContents: game.win.webContents });
    game.win.on('close', (event) => {
      event.preventDefault();
      closing.run();
    });
    game.win.loadURL(GAME_URL);
  });
}
