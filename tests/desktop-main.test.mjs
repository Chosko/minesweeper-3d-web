// The desktop host's main process (desktop/), driven over injected Electron stand-ins: the game
// protocol's path resolution and serving, the window's options and actions, the window state file,
// the crash log's rotation and capture, and the closing sequence. Electron itself is never loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GAME_ENTRIES, GAME_URL, SCHEME, mimeType, registerGameScheme, resolveGamePath, serveGameFile } from '../desktop/protocol.js';
import { DEFAULT_WINDOW_STATE, parseWindowState, placeOnScreen, readWindowState, writeWindowState } from '../desktop/window-state.js';
import { CRASH_LOG_FILE, captureMainErrors, capturePageErrors, createCrashLog } from '../desktop/crash-log.js';
import { createClosing } from '../desktop/closing.js';
import { DEFAULT_CONTENT_SIZE, createGameWindow, lockNavigation, windowActions, windowOptions } from '../desktop/window.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const tempDir = () => mkdtempSync(path.join(tmpdir(), 'ms3d-desktop-'));

// --- desktop/package.json ---------------------------------------------------------------------

test('the host has its own package: Electron as a dev dependency, a start script, ES modules', () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, 'desktop', 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.main, 'main.js');
  assert.ok(pkg.devDependencies?.electron, 'Electron is a dev dependency');
  assert.match(pkg.scripts?.start ?? '', /\belectron\b/);
  assert.ok(!existsSync(path.join(ROOT, 'package.json')), 'the web build at the root stays dependency-free');
});

// --- the game protocol --------------------------------------------------------------------------

test('the game protocol resolves the game files under the root, index.html at the top', () => {
  const root = path.join('C:', 'game');
  assert.equal(GAME_URL, `${SCHEME}://game/index.html`);
  assert.equal(resolveGamePath(root, GAME_URL), path.join(root, 'index.html'));
  assert.equal(resolveGamePath(root, `${SCHEME}://game/`), path.join(root, 'index.html'));
  assert.equal(resolveGamePath(root, `${SCHEME}://game/js/main.js`), path.join(root, 'js', 'main.js'));
  assert.equal(resolveGamePath(root, `${SCHEME}://game/js/generation/worker.js?v=1#x`), path.join(root, 'js', 'generation', 'worker.js'));
  assert.equal(resolveGamePath(root, `${SCHEME}://game/themes/joyful-tiles/theme.css`), path.join(root, 'themes', 'joyful-tiles', 'theme.css'));
  assert.equal(resolveGamePath(root, `${SCHEME}://game/assets/menu/a%20b.png`), path.join(root, 'assets', 'menu', 'a b.png'));
});

test('the game protocol refuses every request outside the game files', () => {
  const root = path.join('C:', 'game');
  for (const url of [
    `${SCHEME}://game/tests/desktop-main.test.mjs`,
    `${SCHEME}://game/desktop/main.js`,
    `${SCHEME}://game/.git/config`,
    `${SCHEME}://game/.claude/TASKS.md`,
    `${SCHEME}://game/CLAUDE.md`,
    `${SCHEME}://game/js/%2e%2e/%2e%2e/secret.txt`,
    `${SCHEME}://game/js/..%2f..%2fsecret.txt`,
    `${SCHEME}://game/js%5c..%5c..%5csecret.txt`,
    `${SCHEME}://game/index.html/x`,
    `${SCHEME}://other/index.html`,
    'file:///C:/game/index.html',
    'https://game/index.html',
    `${SCHEME}://game/js/%E0%A4%A`,
    'not a url',
  ]) assert.equal(resolveGamePath(root, url), null, url);
  assert.deepEqual([...GAME_ENTRIES].sort(), ['assets', 'css', 'index.html', 'js', 'themes', 'vendor']);
});

test('every file index.html, the modules and the worker load sits under a game entry', () => {
  const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const refs = [...html.matchAll(/\b(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
  assert.ok(refs.includes('js/main.js'));
  for (const ref of refs) {
    const file = resolveGamePath(ROOT, `${SCHEME}://game/${ref}`);
    assert.ok(file && existsSync(file), `${ref} is served`);
  }
  assert.ok(existsSync(resolveGamePath(ROOT, `${SCHEME}://game/js/generation/worker.js`)));
});

test('the game protocol serves a file with its type and answers 404 outside the game files', async () => {
  const root = tempDir();
  try {
    writeFileSync(path.join(root, 'index.html'), '<!doctype html>');
    const reads = [];
    const read = async (file) => { reads.push(file); return readFileSync(file); };
    const ok = await serveGameFile(root, new Request(GAME_URL), { read });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get('content-type'), 'text/html');
    assert.equal(await ok.text(), '<!doctype html>');
    const missing = await serveGameFile(root, new Request(`${SCHEME}://game/js/none.js`), { read });
    assert.equal(missing.status, 404);
    const outside = await serveGameFile(root, new Request(`${SCHEME}://game/desktop/main.js`), { read });
    assert.equal(outside.status, 404);
    assert.equal(reads.length, 2, 'a refused request reads nothing');
    const post = await serveGameFile(root, new Request(GAME_URL, { method: 'POST', body: 'x' }), { read });
    assert.equal(post.status, 405);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('modules load with a JavaScript type; the scheme is standard and secure so workers and fetch work', () => {
  assert.equal(mimeType('js/main.js'), 'text/javascript');
  assert.equal(mimeType('a.MJS'), 'text/javascript');
  assert.equal(mimeType('css/style.css'), 'text/css');
  assert.equal(mimeType('x.woff2'), 'font/woff2');
  assert.equal(mimeType('x.unknown'), 'application/octet-stream');
  const calls = [];
  registerGameScheme({ registerSchemesAsPrivileged: (list) => calls.push(list) });
  assert.equal(calls.length, 1);
  const [{ scheme, privileges }] = calls[0];
  assert.equal(scheme, SCHEME);
  for (const flag of ['standard', 'secure', 'supportFetchAPI', 'corsEnabled']) assert.equal(privileges[flag], true, flag);
});

// --- the window ---------------------------------------------------------------------------------

// A transparent window on Windows answers isFullScreen() false even while fullscreen, as this
// stand-in does: the host must follow the enter and leave events instead.
class FakeWindow extends EventEmitter {
  constructor(options = {}) {
    super();
    this.options = options;
    this.fullscreen = Boolean(options.fullscreen);
    this.minimised = false;
    this.position = [options.x ?? 100, options.y ?? 50];
    this.contentSize = [options.width, options.height];
    this.calls = [];
    this.webContents = new FakeContents();
  }
  isFullScreen() { return false; }
  setFullScreen(on) {
    this.calls.push(['setFullScreen', on]);
    if (on === this.fullscreen) return;
    this.fullscreen = on;
    this.emit(on ? 'enter-full-screen' : 'leave-full-screen');
  }
  isMinimized() { return this.minimised; }
  minimize() { this.calls.push(['minimize']); this.minimised = true; }
  setMovable(on) { this.movable = on; }
  setContentSize(w, h) { this.calls.push(['setContentSize', w, h]); this.contentSize = [w, h]; }
  getPosition() { return [...this.position]; }
  setPosition(x, y) { this.calls.push(['setPosition', x, y]); this.position = [x, y]; }
  getBounds() { return { x: this.position[0], y: this.position[1], width: this.contentSize[0], height: this.contentSize[1] }; }
  once(name, fn) { return super.once(name, fn); }
  show() { this.calls.push(['show']); }
}

class FakeContents extends EventEmitter {
  setWindowOpenHandler(fn) { this.openHandler = fn; }
}

test('the window is frameless, transparent, not resizable and isolated', () => {
  const o = windowOptions(DEFAULT_WINDOW_STATE, { preload: '/p.js' });
  assert.equal(o.frame, false);
  assert.equal(o.transparent, true);
  assert.equal(o.resizable, false);
  assert.equal(o.maximizable, false);
  assert.equal(o.useContentSize, true);
  assert.equal(o.width, DEFAULT_CONTENT_SIZE.width);
  assert.equal(o.height, DEFAULT_CONTENT_SIZE.height);
  assert.equal(o.fullscreen, false);
  assert.equal(o.center, true, 'no stored position: centred');
  assert.equal(o.x, undefined);
  assert.deepEqual(
    { ...o.webPreferences },
    { contextIsolation: true, nodeIntegration: false, sandbox: true, preload: '/p.js' },
  );
  assert.equal(windowOptions(DEFAULT_WINDOW_STATE).webPreferences.preload, undefined);
  const placed = windowOptions({ x: 40, y: 30, fullscreen: true });
  assert.equal(placed.center, false);
  assert.equal(placed.x, 40);
  assert.equal(placed.y, 30);
  assert.equal(placed.fullscreen, true);
});

test('window actions: content size, fullscreen toggle with its events, minimise', () => {
  const win = new FakeWindow({ width: 800, height: 600 });
  const actions = windowActions(win);
  const events = [];
  const off = actions.onFullscreenChange((on) => events.push(on));
  actions.setContentSize(640, 480);
  assert.deepEqual(win.contentSize, [640, 480]);
  assert.deepEqual(win.position, [100, 50], 'resizing keeps the window where it is');
  actions.toggleFullscreen();
  assert.equal(win.fullscreen, true);
  assert.equal(actions.isFullscreen(), true);
  assert.equal(win.movable, false, 'fullscreen cannot be dragged');
  actions.setContentSize(700, 500);
  assert.deepEqual(win.contentSize, [640, 480], 'no resize while fullscreen');
  actions.toggleFullscreen();
  assert.equal(win.fullscreen, false);
  assert.equal(win.movable, true, 'the floating window drags again');
  assert.deepEqual(win.contentSize, [700, 500], 'the size reported while fullscreen applies on leaving it');
  assert.deepEqual(events, [true, false]);
  off();
  actions.toggleFullscreen();
  assert.deepEqual(events, [true, false], 'an unsubscribed listener hears nothing');
  actions.minimise();
  assert.equal(win.isMinimized(), true);

  const opened = new FakeWindow({ fullscreen: true });
  const fromState = windowActions(opened, { fullscreen: true });
  assert.equal(fromState.isFullscreen(), true, 'a window opened fullscreen starts fullscreen');
  fromState.toggleFullscreen();
  assert.equal(opened.fullscreen, false);
});

// Two displays side by side, each with its work area; a window is on the display its centre is over.
const fakeScreen = (workAreas) => ({
  getDisplayMatching({ x, y, width, height }) {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const inside = (a) => cx >= a.x && cx < a.x + a.width && cy >= a.y && cy < a.y + a.height;
    return { workArea: workAreas.find(inside) ?? workAreas[0] };
  },
});

test('the host sizes the window to the reported size, never past the work area of the display it is on', () => {
  const win = new FakeWindow({ width: 1280, height: 800 });
  const screen = fakeScreen([{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1366, height: 728 }]);
  const actions = windowActions(win, { screen });
  actions.setContentSize(980, 952);
  assert.deepEqual(win.contentSize, [980, 952]);
  assert.deepEqual(win.position, [100, 50], 'inside the work area it keeps its place');
  actions.setContentSize(1920, 1040);
  assert.deepEqual(win.contentSize, [1920, 1040], 'the whole work area, as during 3D play');
  assert.deepEqual(win.position, [0, 0], 'moved into the work area, never past it');
  actions.setContentSize(2400, 1200);
  assert.deepEqual(win.contentSize, [1920, 1040], 'capped at the work area');
  actions.setContentSize(1200, 700);
  win.position = [1950, 20];
  win.emit('moved');
  assert.deepEqual(win.contentSize, [1200, 700], 'it fits the other display as it is');
  win.position = [300, 20];
  actions.setContentSize(1600, 900);
  win.position = [1500, 20];
  win.emit('moved');
  assert.deepEqual(win.contentSize, [1366, 728], 'moved to the smaller display, resized to its work area');
  assert.deepEqual(win.position, [1920, 0], 'and laid inside it');
});

test('a size reported while fullscreen is capped by the work area on leaving fullscreen', () => {
  const win = new FakeWindow({ width: 1280, height: 800 });
  const actions = windowActions(win, { screen: fakeScreen([{ x: 0, y: 0, width: 1366, height: 728 }]) });
  actions.toggleFullscreen();
  actions.setContentSize(1920, 1040);
  assert.deepEqual(win.contentSize, [1280, 800]);
  actions.toggleFullscreen();
  assert.deepEqual(win.contentSize, [1366, 728]);
  assert.deepEqual(win.position, [0, 0]);
});

test('the game window takes the display layout it is sized against', () => {
  let made = null;
  const BrowserWindow = function (options) { made = new FakeWindow(options); return made; };
  const { actions } = createGameWindow({ BrowserWindow, state: { x: 10, y: 20, fullscreen: false }, screen: fakeScreen([{ x: 0, y: 0, width: 800, height: 600 }]) });
  actions.setContentSize(1000, 700);
  assert.deepEqual(made.contentSize, [800, 600]);
  assert.match(readFileSync(path.join(ROOT, 'desktop/main.js'), 'utf8'), /createGameWindow\(\{[^}]*\bscreen\b/);
});

test('the game window loads nothing outside the game and opens no other window', () => {
  const contents = new FakeContents();
  lockNavigation(contents);
  let prevented = 0;
  const event = { preventDefault: () => { prevented += 1; } };
  contents.emit('will-navigate', event, `${SCHEME}://game/index.html#board=x`);
  assert.equal(prevented, 0);
  contents.emit('will-navigate', event, 'https://example.com/');
  assert.equal(prevented, 1);
  assert.deepEqual(contents.openHandler({ url: 'https://example.com/' }), { action: 'deny' });
});

test('the game window saves its position and fullscreen state as they change', () => {
  const saved = [];
  let made = null;
  const BrowserWindow = function (options) { made = new FakeWindow(options); return made; };
  const { win, actions } = createGameWindow({ BrowserWindow, state: { x: 10, y: 20, fullscreen: false }, save: (s) => saved.push(s) });
  assert.equal(win, made);
  win.emit('ready-to-show');
  assert.deepEqual(win.calls.at(-1), ['show']);
  win.position = [300, 200];
  win.emit('moved');
  assert.deepEqual(saved.at(-1), { x: 300, y: 200, fullscreen: false });
  actions.toggleFullscreen();
  win.position = [0, 0];
  assert.deepEqual(saved.at(-1), { x: 300, y: 200, fullscreen: true }, 'fullscreen keeps the windowed position');
  actions.toggleFullscreen();
  win.emit('moved');
  assert.deepEqual(saved.at(-1), { x: 0, y: 0, fullscreen: false });
});

// --- window state -------------------------------------------------------------------------------

test('window state: a missing or unreadable file falls back to a windowed window, centred', () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'nested', 'window-state.json');
    assert.deepEqual(readWindowState(file), DEFAULT_WINDOW_STATE);
    assert.deepEqual(DEFAULT_WINDOW_STATE, { fullscreen: false });
    assert.equal(writeWindowState(file, { x: 12, y: -40, fullscreen: true }), true);
    assert.deepEqual(readWindowState(file), { x: 12, y: -40, fullscreen: true });
    writeFileSync(file, '{ not json');
    assert.deepEqual(readWindowState(file), DEFAULT_WINDOW_STATE);
    for (const text of ['null', '[]', '{"x":1.5,"y":2,"fullscreen":false}', '{"x":"1","y":2}', '{"fullscreen":"yes"}', '{"version":99,"x":1,"y":2}']) {
      assert.deepEqual(parseWindowState(text), DEFAULT_WINDOW_STATE, text);
    }
    assert.deepEqual(parseWindowState('{"version":1,"fullscreen":true}'), { fullscreen: true });
    assert.deepEqual(parseWindowState('{"version":1,"x":5,"y":6}'), { x: 5, y: 6, fullscreen: false });
    assert.equal(readdirSync(path.dirname(file)).length, 1, 'no temporary file left behind');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('window state: the size is never stored', () => {
  const dir = tempDir();
  try {
    const file = path.join(dir, 'window-state.json');
    writeWindowState(file, { x: 1, y: 2, fullscreen: false, width: 900, height: 700 });
    const stored = JSON.parse(readFileSync(file, 'utf8'));
    assert.deepEqual(Object.keys(stored).sort(), ['fullscreen', 'version', 'x', 'y']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('window state: a position off every screen is dropped, so the window is centred', () => {
  const areas = [{ x: 0, y: 0, width: 1920, height: 1040 }, { x: 1920, y: 0, width: 1280, height: 1000 }];
  const size = { width: 800, height: 600 };
  assert.deepEqual(placeOnScreen({ x: 100, y: 100, fullscreen: false }, areas, size), { x: 100, y: 100, fullscreen: false });
  assert.deepEqual(placeOnScreen({ x: 2500, y: 10, fullscreen: true }, areas, size), { x: 2500, y: 10, fullscreen: true });
  assert.deepEqual(placeOnScreen({ x: 5000, y: 100, fullscreen: false }, areas, size), { fullscreen: false });
  assert.deepEqual(placeOnScreen({ x: 100, y: -500, fullscreen: true }, areas, size), { fullscreen: true });
  assert.deepEqual(placeOnScreen({ fullscreen: false }, areas, size), { fullscreen: false });
});

// --- crash log ----------------------------------------------------------------------------------

test('crash log: entries name the time, the process and the error', () => {
  const dir = tempDir();
  try {
    const log = createCrashLog(dir, { now: () => new Date('2026-10-25T10:00:00Z') });
    log.write('main', new Error('boom'));
    log.write('page', 'Uncaught TypeError: x');
    const text = readFileSync(path.join(dir, CRASH_LOG_FILE), 'utf8');
    assert.match(text, /^\[2026-10-25T10:00:00\.000Z\] \[main\] Error: boom\n/);
    assert.match(text, /\[page\] Uncaught TypeError: x\n$/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash log rotates past its size and keeps a bounded number of old files', () => {
  const dir = tempDir();
  try {
    const log = createCrashLog(dir, { maxBytes: 200, keep: 2 });
    for (let i = 0; i < 20; i += 1) log.write('main', `entry ${i} ${'x'.repeat(60)}`);
    const files = readdirSync(dir).sort();
    assert.deepEqual(files, ['crash.1.log', 'crash.2.log', 'crash.log']);
    for (const f of files) assert.ok(readFileSync(path.join(dir, f)).length <= 200, f);
    assert.match(readFileSync(path.join(dir, 'crash.log'), 'utf8'), /entry 19 /);
    assert.match(readFileSync(path.join(dir, 'crash.1.log'), 'utf8'), /entry 1[0-8] /);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash log never throws when it cannot write', () => {
  const dir = tempDir();
  try {
    const blocker = path.join(dir, 'file');
    writeFileSync(blocker, '');
    const log = createCrashLog(path.join(blocker, 'sub'));
    assert.doesNotThrow(() => log.write('main', new Error('x')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('crash log captures uncaught errors from the main process and the page', () => {
  const entries = [];
  const log = { write: (source, error) => entries.push([source, String(error?.message ?? error)]) };
  const proc = new EventEmitter();
  captureMainErrors(log, proc);
  proc.emit('uncaughtException', new Error('main boom'));
  proc.emit('unhandledRejection', new Error('main rejected'));
  const contents = new FakeContents();
  capturePageErrors(log, contents);
  contents.emit('console-message', { level: 'error', message: 'Uncaught Error: page boom', sourceId: 'app://game/js/main.js', lineNumber: 3 });
  contents.emit('console-message', { level: 'error', message: 'a handled error the game logged' });
  contents.emit('console-message', { level: 'info', message: 'Uncaught? no, an info line' });
  contents.emit('console-message', {}, 3, 'Uncaught (in promise) Error: legacy', 9, 'app://game/js/x.js');
  contents.emit('render-process-gone', {}, { reason: 'crashed', exitCode: 1 });
  contents.emit('preload-error', {}, '/p.js', new Error('preload boom'));
  assert.deepEqual(entries.map(([s]) => s), ['main', 'main', 'page', 'page', 'page', 'preload']);
  assert.match(entries[2][1], /Uncaught Error: page boom \(app:\/\/game\/js\/main\.js:3\)/);
  assert.match(entries[3][1], /legacy/);
  assert.match(entries[4][1], /crashed/);
});

// --- closing sequence ---------------------------------------------------------------------------

test('closing with no hooks simply exits, once however often it is asked', async () => {
  let exits = 0;
  const closing = createClosing({ exit: () => { exits += 1; } });
  const a = closing.run();
  const b = closing.run();
  assert.equal(a, b);
  await a;
  assert.equal(exits, 1);
  assert.equal(closing.running, true);
});

test('closing runs flush, then shutdown, then exit', async () => {
  const order = [];
  const closing = createClosing({ exit: () => order.push('exit') });
  closing.setFlushHook(async () => { order.push('flush'); });
  closing.setShutdownHook(() => { order.push('shutdown'); });
  await closing.run();
  assert.deepEqual(order, ['flush', 'shutdown', 'exit']);
});

test('closing bounds the flush by its timeout and survives failing hooks', async () => {
  const order = [];
  const errors = [];
  const closing = createClosing({ exit: () => order.push('exit'), timeoutMs: 20, onError: (e) => errors.push(e.message) });
  closing.setFlushHook(() => new Promise(() => {}));
  closing.setShutdownHook(() => { order.push('shutdown'); throw new Error('steam'); });
  const started = Date.now();
  await closing.run();
  assert.ok(Date.now() - started < 2000);
  assert.deepEqual(order, ['shutdown', 'exit']);
  assert.deepEqual(errors, ['steam']);

  const order2 = [];
  const failing = createClosing({ exit: () => order2.push('exit'), onError: () => order2.push('error') });
  failing.setFlushHook(async () => { throw new Error('flush'); });
  await failing.run();
  assert.deepEqual(order2, ['error', 'exit']);
});
