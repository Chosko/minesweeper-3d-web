import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectPlatform, STEAM_SLOTS } from '../js/platform/index.js';
import { CAPABILITY_FLAGS, createCapabilities, deriveFlags } from '../js/platform/capabilities.js';
import { BRIDGE_GLOBAL, BRIDGE_EVENTS, findBridge, createBridgeClient, linkHost } from '../js/platform/bridge-client.js';
import { bindWindowActions, bindAvailableArea, bindAreaMedia, areaMatches, WINDOW_STATES, DRAG_REGION_CSS, SCREEN_FRAMES, WINDOW_OVER, WINDOW_INSIDE } from '../js/platform/window-actions.js';
import { BRIDGE_GLOBAL as HOST_GLOBAL, BRIDGE_EVENTS as HOST_EVENTS } from '../desktop/bridge.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const STEAM_STATE = Object.freeze({
  adapter: 'steam',
  loggedOn: true,
  player: { steamId: '76561198000000001', name: 'Ada' },
  capabilities: { identity: true, presence: true, achievements: true, leaderboards: true, sharedFiles: true, overlay: true },
});
const UNAVAILABLE_STATE = Object.freeze({
  adapter: 'unavailable',
  loggedOn: false,
  player: null,
  capabilities: { identity: false, presence: false, achievements: false, leaderboards: false, sharedFiles: false, overlay: false },
});

/** The page's side of desktop/preload.js: a promise per request, a subscribe function per event. */
function fakeBridge({ state = STEAM_STATE, fail = new Set() } = {}) {
  const listeners = new Map(BRIDGE_EVENTS.map((event) => [event, new Set()]));
  const calls = [];
  const request = (operation, value = null) => (...args) => {
    calls.push([operation, ...args]);
    return fail.has(operation) ? Promise.reject({ code: 'failed', message: 'Request failed' }) : Promise.resolve(value);
  };
  const host = {
    steam: { state: request('steam.state', state) },
    quit: { handshake: request('quit.handshake'), request: request('quit.request') },
    window: {
      minimise: request('window.minimise'),
      toggleFullscreen: request('window.toggleFullscreen'),
      setContentSize: request('window.setContentSize'),
    },
    events: Object.fromEntries(BRIDGE_EVENTS.map((event) => [event, (listener) => {
      listeners.get(event).add(listener);
      return () => listeners.get(event).delete(listener);
    }])),
  };
  const emit = (event, payload = null) => { for (const listener of [...listeners.get(event)]) listener(payload); };
  const count = (event) => listeners.get(event).size;
  return { host, calls, emit, count };
}

const BROWSER = {
  storage: () => 'browser storage',
  blobStore: () => 'browser blob store',
  leaderboards: () => 'local leaderboards',
  achievements: () => 'local achievements',
};

// ---------------------------------------------------------------- finding the bridge

test('the page looks for the bridge the preload exposes, under its one global and with its events', () => {
  assert.equal(BRIDGE_GLOBAL, HOST_GLOBAL);
  assert.deepEqual([...BRIDGE_EVENTS], [...HOST_EVENTS]);
  const { host } = fakeBridge();
  assert.equal(findBridge({ [BRIDGE_GLOBAL]: host }), host);
  assert.equal(findBridge({}), null, 'the web build has no bridge');
  assert.equal(findBridge(undefined), null);
  assert.equal(findBridge({ [BRIDGE_GLOBAL]: { events: {} } }), null, 'an object without the bridge\'s events is no bridge');
  assert.equal(findBridge({ [BRIDGE_GLOBAL]: 'yes' }), null);
});

// ---------------------------------------------------------------- selection

test('with the bridge the platform selects the Steam implementation of every slot a later feature fills, and the browser one of every other', () => {
  const { host } = fakeBridge();
  const steam = { ...STEAM_SLOTS, storage: (client) => ({ steam: 'storage', client }), achievements: () => 'steam achievements' };
  const platform = selectPlatform({ bridge: host, browser: BROWSER, steam });
  assert.equal(platform.host, 'desktop');
  assert.ok(platform.client, 'the bridge client');
  assert.equal(platform.storage.steam, 'storage');
  assert.equal(platform.storage.client, platform.client, 'a Steam implementation reaches the host through the bridge client');
  assert.equal(platform.achievements, 'steam achievements');
  assert.equal(platform.blobStore, 'browser blob store');
  assert.equal(platform.leaderboards, 'local leaderboards');
  assert.equal(platform.capabilities.desktopHost, true);
});

test('the Steam slots are the four the later features fill, and none is filled yet', () => {
  assert.deepEqual(Object.keys(STEAM_SLOTS), ['storage', 'blobStore', 'leaderboards', 'achievements']);
  assert.ok(Object.values(STEAM_SLOTS).every((slot) => slot === null));
  const { host } = fakeBridge();
  const platform = selectPlatform({ bridge: host, browser: BROWSER });
  assert.equal(platform.storage, 'browser storage');
  assert.equal(platform.blobStore, 'browser blob store');
});

test('without the bridge the platform selects the browser implementations and local stand-ins, and every flag is off', () => {
  const steam = { storage: () => 'steam storage', blobStore: () => 'steam blobs', leaderboards: () => 'steam boards', achievements: () => 'steam achievements' };
  const platform = selectPlatform({ bridge: null, browser: BROWSER, steam });
  assert.equal(platform.host, 'browser');
  assert.equal(platform.client, null);
  assert.deepEqual([platform.storage, platform.blobStore, platform.leaderboards, platform.achievements],
    ['browser storage', 'browser blob store', 'local leaderboards', 'local achievements']);
  assert.deepEqual(platform.capabilities.snapshot(), Object.fromEntries(CAPABILITY_FLAGS.map((f) => [f, false])));
});

test('js/platform/index.js selects once at start-up from the global the preload sets', () => {
  const index = read('js/platform/index.js');
  assert.match(index, /selectPlatform\(\{ bridge: findBridge\(globalThis\), browser: BROWSER \}\)/);
  assert.match(index, /export const capabilities = PLATFORM\.capabilities;/);
});

test('no module outside js/platform/ tests for Electron or the bridge', () => {
  const files = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.js') ? [path] : [];
  });
  const offenders = files(fileURLToPath(new URL('../js', import.meta.url)))
    .filter((path) => !/[\\/]js[\\/]platform[\\/]/.test(path))
    .filter((path) => /ms3dHost|electron|bridge-client|window-actions/i.test(readFileSync(path, 'utf8')));
  assert.deepEqual(offenders, []);
});

// ---------------------------------------------------------------- capability flags

test('the capability flags: desktop host, Steam present, achievements, leaderboards, shared files, cloud', () => {
  assert.deepEqual([...CAPABILITY_FLAGS], ['desktopHost', 'steam', 'achievements', 'leaderboards', 'sharedFiles', 'cloud']);
  assert.deepEqual(deriveFlags(), { desktopHost: false, steam: false, achievements: false, leaderboards: false, sharedFiles: false, cloud: false });
  assert.deepEqual(deriveFlags({ desktopHost: true }), { desktopHost: true, steam: false, achievements: false, leaderboards: false, sharedFiles: false, cloud: false });
  assert.deepEqual(deriveFlags({ desktopHost: true, steamState: UNAVAILABLE_STATE }),
    { desktopHost: true, steam: false, achievements: false, leaderboards: false, sharedFiles: false, cloud: false });
  assert.deepEqual(deriveFlags({ desktopHost: true, steamState: STEAM_STATE }),
    { desktopHost: true, steam: true, achievements: true, leaderboards: true, sharedFiles: true, cloud: true });
  const noBoards = { ...STEAM_STATE, capabilities: { ...STEAM_STATE.capabilities, leaderboards: false, sharedFiles: false } };
  assert.deepEqual(deriveFlags({ desktopHost: true, steamState: noBoards }),
    { desktopHost: true, steam: true, achievements: true, leaderboards: false, sharedFiles: false, cloud: true },
    'a capability the binding lacks is off');
  assert.equal(deriveFlags({ steamState: STEAM_STATE }).steam, false, 'no Steam without the desktop host');
});

test('the flags update from Steam state, keep the latest state and tell subscribers of a change only', () => {
  const capabilities = createCapabilities({ desktopHost: true });
  assert.equal(capabilities.steamState(), null);
  const seen = [];
  const off = capabilities.subscribe((flags) => seen.push(flags));
  assert.equal(capabilities.update(STEAM_STATE), true);
  assert.equal(capabilities.steam, true);
  assert.equal(capabilities.leaderboards, true);
  assert.deepEqual(capabilities.steamState(), STEAM_STATE);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].achievements, true);
  assert.ok(Object.isFrozen(seen[0]));
  // logged off: the flags stay, the state changes
  assert.equal(capabilities.update({ ...STEAM_STATE, loggedOn: false }), false);
  assert.equal(capabilities.steamState().loggedOn, false);
  assert.equal(seen.length, 1);
  capabilities.update(UNAVAILABLE_STATE);
  assert.equal(seen.length, 2);
  assert.equal(capabilities.steam, false);
  off();
  capabilities.update(STEAM_STATE);
  assert.equal(seen.length, 2);
  assert.equal(capabilities.update(null), false, 'a malformed state changes nothing');
  assert.ok(Object.isFrozen(capabilities));
  assert.throws(() => { capabilities.desktopHost = false; });
});

test('linking the host asks for the Steam state at start-up and follows its change events', async () => {
  const bridge = fakeBridge();
  const capabilities = createCapabilities({ desktopHost: true });
  const link = linkHost({ client: createBridgeClient(bridge.host), capabilities });
  assert.deepEqual(bridge.calls, [['steam.state']]);
  await tick();
  assert.equal(capabilities.steam, true);
  bridge.emit('steamStateChanged', UNAVAILABLE_STATE);
  assert.equal(capabilities.steam, false);
  link.dispose();
  assert.equal(bridge.count('steamStateChanged'), 0);
});

test('a start-up state that answers after a change event never replaces the newer state', async () => {
  let answer;
  const bridge = fakeBridge();
  bridge.host.steam.state = () => new Promise((resolve) => { answer = resolve; });
  const capabilities = createCapabilities({ desktopHost: true });
  linkHost({ client: createBridgeClient(bridge.host), capabilities });
  bridge.emit('steamStateChanged', UNAVAILABLE_STATE);
  answer(STEAM_STATE);
  await tick();
  assert.equal(capabilities.steamState().adapter, 'unavailable');
});

test('a refused start-up state request leaves the flags as selection set them', async () => {
  const bridge = fakeBridge({ fail: new Set(['steam.state']) });
  const capabilities = createCapabilities({ desktopHost: true });
  linkHost({ client: createBridgeClient(bridge.host), capabilities });
  await tick();
  assert.deepEqual(capabilities.snapshot(), deriveFlags({ desktopHost: true }));
});

// ---------------------------------------------------------------- the overlay

test('the overlay opening calls the overlay listeners; its closing does not', () => {
  const bridge = fakeBridge();
  const link = linkHost({ client: createBridgeClient(bridge.host), capabilities: createCapabilities({ desktopHost: true }) });
  let opened = 0;
  const off = link.onOverlayActivated(() => { opened += 1; });
  bridge.emit('overlayActivated', true);
  bridge.emit('overlayActivated', false);
  assert.equal(opened, 1);
  off();
  bridge.emit('overlayActivated', true);
  assert.equal(opened, 1);
});

test('the shell pauses on the overlay through the window blur\'s path', () => {
  const main = read('js/main.js');
  assert.match(main, /window\.addEventListener\('blur', \(\) => pauseGame\('blur'\)\);/);
  assert.match(main, /onOverlayActivated\(\(\) => pauseGame\('blur'\)\);/);
});

test('with no host, nothing is linked: no listener, no flush request ever comes', async () => {
  const link = linkHost({ client: null, capabilities: createCapabilities() });
  let called = 0;
  link.onOverlayActivated(() => { called += 1; });
  link.addFlushHook(() => { called += 1; });
  await tick();
  assert.equal(called, 0);
});

// ---------------------------------------------------------------- the quit flush

test('a flush request awaits every registered flush hook, then answers the host', async () => {
  const bridge = fakeBridge();
  const link = linkHost({ client: createBridgeClient(bridge.host), capabilities: createCapabilities({ desktopHost: true }) });
  const order = [];
  let release;
  link.addFlushHook(() => new Promise((resolve) => { release = () => { order.push('slow saved'); resolve(); }; }));
  link.addFlushHook(() => { order.push('quick saved'); });
  const removed = link.addFlushHook(() => { order.push('removed'); });
  removed();
  bridge.emit('flushRequested');
  await tick();
  assert.deepEqual(order, ['quick saved']);
  assert.ok(!bridge.calls.some(([op]) => op === 'quit.handshake'), 'no answer while a save is pending');
  release();
  await tick();
  assert.deepEqual(order, ['quick saved', 'slow saved']);
  assert.deepEqual(bridge.calls.filter(([op]) => op === 'quit.handshake'), [['quit.handshake']]);
});

test('a flush hook that throws or rejects still lets the flush answer', async () => {
  const bridge = fakeBridge();
  const link = linkHost({ client: createBridgeClient(bridge.host), capabilities: createCapabilities({ desktopHost: true }) });
  link.addFlushHook(() => { throw new Error('boom'); });
  link.addFlushHook(() => Promise.reject(new Error('refused')));
  bridge.emit('flushRequested');
  await tick();
  await tick();
  assert.equal(bridge.calls.filter(([op]) => op === 'quit.handshake').length, 1);
});

test('the shell registers its pending saves as a flush hook', () => {
  const main = read('js/main.js');
  assert.match(main, /addFlushHook\(/);
  assert.match(main, /RECORDS\.settled\(\)/);
  assert.match(main, /REPLAYS\.settled\(\)/);
});

test('the host waits for the page\'s flush answer, bounded by a short timeout', () => {
  const closing = read('desktop/closing.js');
  assert.match(closing, /export const FLUSH_TIMEOUT_MS = \d+;/);
  assert.match(closing, /Promise\.race\(\[Promise\.resolve\(\)\.then\(flushHook\), timeout\]\)/);
});

// ---------------------------------------------------------------- the desktop window

// An object with addEventListener / removeEventListener, its listeners kept by type and fired by emit(type).
function withListeners(target) {
  const listeners = new Map();
  return Object.assign(target, {
    listeners,
    addEventListener: (type, fn) => listeners.set(type, new Set([...(listeners.get(type) ?? []), fn])),
    removeEventListener: (type, fn) => listeners.get(type)?.delete(fn),
    emit: (type) => { for (const fn of [...(listeners.get(type) ?? [])]) fn(); },
  });
}

/**
 * A screen's frame laid out in the root area at `box` ({ left, top, width, height }), shown while
 * `shown`: the page reads it shifted by the root's `--window-x` / `--window-y`, as a browser does.
 */
function fakeFrame(root, box, shown = true, layer = null) {
  const shift = (name) => parseFloat(root.style[name] ?? '0') || 0;
  return {
    box,
    shown,
    closest(selector) { return selector === layer ? {} : null; },
    getClientRects() { return this.shown ? [this.box] : []; },
    getBoundingClientRect() {
      const left = this.box.left - shift('--window-x');
      const top = this.box.top - shift('--window-y');
      return { left, top, right: left + this.box.width, bottom: top + this.box.height, width: this.box.width, height: this.box.height };
    },
  };
}

function fakeDocument({ fullscreenButtons = 2, innerWidth = 1280, innerHeight = 800, screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 } } = {}) {
  const appended = [];
  const frames = [];
  const observers = [];
  class ResizeObserver {
    constructor(callback) { this.callback = callback; this.targets = new Set(); observers.push(this); }
    observe(target) { this.targets.add(target); }
    unobserve(target) { this.targets.delete(target); }
    disconnect() { this.targets.clear(); }
  }
  const resized = (frame) => { for (const o of observers) if (o.targets.has(frame)) o.callback([{ target: frame }]); };
  const style = {};
  Object.defineProperty(style, 'setProperty', { value: (name, value) => { style[name] = value; } });
  const button = () => {
    const attrs = new Map([['data-window', 'fullscreen'], ['data-icon', 'fullscreen'], ['aria-label', 'Fullscreen'], ['title', 'Fullscreen']]);
    return { attrs, getAttribute: (n) => attrs.get(n) ?? null, setAttribute: (n, v) => attrs.set(n, String(v)) };
  };
  const buttons = Array.from({ length: fullscreenButtons }, button);
  const doc = {
    documentElement: { dataset: {}, style },
    head: { append: (el) => appended.push(el) },
    createElement: (tag) => ({ tagName: tag.toUpperCase(), textContent: '' }),
    querySelectorAll: (selector) => {
      if (selector === '[data-window="fullscreen"]') return buttons;
      if (selector === SCREEN_FRAMES) return frames;
      return [];
    },
    defaultView: { innerWidth, innerHeight, screen: withListeners(screen), ResizeObserver, ...withListeners({}) },
  };
  const addFrame = (box, shown, layer) => { const frame = fakeFrame(doc.documentElement, box, shown, layer); frames.push(frame); return frame; };
  return { doc, buttons, appended, addFrame, resized };
}

test('the window buttons\' two looks: Fullscreen while windowed, Windowed while full screen', () => {
  assert.deepEqual(WINDOW_STATES, {
    windowed: { icon: 'fullscreen', label: 'Fullscreen' },
    fullscreen: { icon: 'windowed', label: 'Windowed' },
  });
});

test('on the desktop host Minimise and Fullscreen call the bridge\'s window actions', async () => {
  const bridge = fakeBridge();
  const { doc } = fakeDocument();
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  assert.deepEqual(Object.keys(win.actions).sort(), ['fullscreen', 'minimise'], 'Quit is not this feature\'s');
  win.actions.minimise();
  win.actions.fullscreen();
  await tick();
  assert.deepEqual(bridge.calls.filter(([op]) => op.startsWith('window.')), [['window.minimise'], ['window.toggleFullscreen']]);
});

test('a refused window action never throws into the page', async () => {
  const bridge = fakeBridge({ fail: new Set(['window.minimise', 'window.setContentSize']) });
  const { doc } = fakeDocument();
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  win.actions.minimise();
  win.reportSize(800, 600);
  await tick();
});

test('the Fullscreen button follows the fullscreen event: the Windowed icon while full screen, the Fullscreen icon otherwise', () => {
  const bridge = fakeBridge();
  const { doc, buttons } = fakeDocument();
  const icons = [];
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: (el, name) => icons.push([buttons.indexOf(el), name]) });
  assert.deepEqual(icons, [[0, 'fullscreen'], [1, 'fullscreen']], 'windowed at start-up');
  icons.length = 0;
  bridge.emit('fullscreenChanged', true);
  for (const b of buttons) {
    assert.equal(b.getAttribute('data-icon'), 'windowed');
    assert.equal(b.getAttribute('aria-label'), 'Windowed');
    assert.equal(b.getAttribute('title'), 'Windowed');
  }
  assert.deepEqual(icons, [[0, 'windowed'], [1, 'windowed']]);
  bridge.emit('fullscreenChanged', false);
  for (const b of buttons) {
    assert.equal(b.getAttribute('data-icon'), 'fullscreen');
    assert.equal(b.getAttribute('aria-label'), 'Fullscreen');
  }
  win.dispose();
  assert.equal(bridge.count('fullscreenChanged'), 0);
});

test('a window opened full screen shows the Windowed icon from the start', () => {
  const bridge = fakeBridge();
  const { doc, buttons } = fakeDocument({ innerWidth: 1920, innerHeight: 1080 });
  bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  assert.equal(buttons[0].getAttribute('data-icon'), 'windowed');
});

test('on the desktop host the title bar is marked as the window\'s drag region, its buttons excepted', () => {
  const bridge = fakeBridge();
  const { doc, appended } = fakeDocument();
  bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  assert.equal(doc.documentElement.dataset.host, 'desktop');
  assert.equal(appended.length, 1);
  assert.equal(appended[0].tagName, 'STYLE');
  assert.equal(appended[0].textContent, DRAG_REGION_CSS);
  assert.match(DRAG_REGION_CSS, /\.ui-frame__head\s*\{\s*-webkit-app-region: drag;/);
  assert.match(DRAG_REGION_CSS, /\.ui-frame__head :is\(button, a, input, select, \[tabindex\]\)\s*\{\s*-webkit-app-region: no-drag;/);
});

test('the page reports its content size to the host, whole pixels, once per change', async () => {
  const bridge = fakeBridge();
  const { doc } = fakeDocument();
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  win.reportSize(1302.4, 712);
  win.reportSize(1302.2, 712);
  win.reportSize(984, 728);
  win.reportSize(0, 728);
  await tick();
  assert.deepEqual(bridge.calls.filter(([op]) => op === 'window.setContentSize'),
    [['window.setContentSize', 1303, 712], ['window.setContentSize', 984, 728]]);
});

const sizeReports = (bridge) => bridge.calls.filter(([op]) => op === 'window.setContentSize').map(([, w, h]) => [w, h]);
const shiftOf = (doc) => [doc.documentElement.style['--window-x'], doc.documentElement.style['--window-y']];

test('windowed, the window is the shown screen\'s frame: its size reported on every screen change, the frame at the window\'s edges', async () => {
  const bridge = fakeBridge();
  const { doc, addFrame } = fakeDocument();
  const menu = addFrame({ left: 470, top: 44, width: 980, height: 952 });
  const choice = addFrame({ left: 360, top: 120, width: 1200, height: 800 }, false);
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  assert.equal(doc.documentElement.dataset.windowState, 'windowed');
  await tick();
  assert.deepEqual(sizeReports(bridge), [], 'nothing before the first screen shows');
  win.screenChanged();
  assert.deepEqual(shiftOf(doc), ['470px', '44px'], 'the frame moved to the window\'s top-left corner');
  menu.shown = false;
  choice.shown = true;
  win.screenChanged();
  assert.deepEqual(shiftOf(doc), ['360px', '120px']);
  await tick();
  assert.deepEqual(sizeReports(bridge), [[980, 952], [1200, 800]]);
});

test('a change of the frame\'s size is reported: the board choice panel opening, a board loading', async () => {
  const bridge = fakeBridge();
  const { doc, addFrame, resized } = fakeDocument();
  const game = addFrame({ left: 660, top: 220, width: 600, height: 600 });
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  win.screenChanged();
  game.box = { left: 560, top: 170, width: 800, height: 700 };
  resized(game);
  await tick();
  assert.deepEqual(sizeReports(bridge), [[600, 600], [800, 700]]);
  assert.deepEqual(shiftOf(doc), ['560px', '170px']);
});

test('a popup over the game window is the window alone while it shows, never both; the game window comes back after it', async () => {
  const bridge = fakeBridge();
  const { doc, addFrame, resized } = fakeDocument();
  addFrame({ left: 760, top: 270, width: 400, height: 500 });
  const results = addFrame({ left: 440, top: 300, width: 1040, height: 440 }, false, WINDOW_OVER);
  const pause = addFrame({ left: 500, top: 400, width: 920, height: 300 }, false, WINDOW_OVER);
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  win.screenChanged();
  results.shown = true;
  win.screenChanged();
  assert.deepEqual(shiftOf(doc), ['440px', '300px'], 'the results frame at the window\'s top-left corner');
  results.shown = false;
  win.screenChanged();
  assert.deepEqual(shiftOf(doc), ['760px', '270px'], 'the game window back at the window\'s edges');
  pause.shown = true;
  win.screenChanged();
  pause.box = { left: 500, top: 350, width: 920, height: 400 };
  resized(pause);
  pause.shown = false;
  win.screenChanged();
  await tick();
  assert.deepEqual(sizeReports(bridge), [[400, 500], [1040, 440], [400, 500], [920, 300], [920, 400], [400, 500]],
    'the popup\'s size alone — its confirm box growing it —, then the game window\'s');
});

test('a card inside the window never sizes it: the window stays the game window', async () => {
  const bridge = fakeBridge();
  const { doc, addFrame } = fakeDocument();
  addFrame({ left: 760, top: 270, width: 400, height: 500 });
  addFrame({ left: 720, top: 470, width: 480, height: 100 }, true, WINDOW_INSIDE);
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  win.screenChanged();
  await tick();
  assert.deepEqual(sizeReports(bridge), [[400, 500]]);
  assert.deepEqual(shiftOf(doc), ['760px', '270px']);
});

test('the layers shown over a game are marked as over the window, the board status card as inside it', () => {
  const html = read('index.html');
  for (const id of ['pause', 'results', 'ctx-lost', 'ready', 'learn-end']) {
    assert.match(html, new RegExp(`<section id="${id}" [^>]*\\bdata-window-over\\b`), `#${id} is a layer over the window`);
  }
  assert.match(html, /<section id="c2d-status" [^>]*\bdata-window-inside\b/, 'the board status card stays inside the game window');
  assert.match(read('css/style.css'), /:root\[data-host="desktop"\]\[data-window-state="windowed"\] #c2d-status \{ max-width: calc\(var\(--status-room, 100cqw\) - 2 \* var\(--space-4\)\); \}/,
    'windowed, the status card no wider than the game window\'s room about its centre');
  assert.match(read('js/ui.js'), /_centreStatus2D\(\) \{[\s\S]*?getBoundingClientRect\(\)[\s\S]*?- root\.left[\s\S]*?--status-room/,
    'the card placed in the root\'s own coordinates, its room the game frame\'s width about its centre');
  assert.equal(WINDOW_OVER, '[data-window-over]');
  assert.equal(WINDOW_INSIDE, '[data-window-inside]');
  assert.doesNotMatch(read('js/platform/window-actions.js'), /#(?:c2d|pause|results|ctx-lost)\b/, 'no shell id in the platform layer');
});

test('during 3D play the window is the whole work area', async () => {
  const bridge = fakeBridge();
  const { doc, addFrame } = fakeDocument();
  addFrame({ left: 470, top: 44, width: 980, height: 952 });
  let play = false;
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {}, fullArea: () => play });
  win.screenChanged();
  play = true;
  win.screenChanged();
  assert.deepEqual(shiftOf(doc), ['0px', '0px']);
  await tick();
  assert.deepEqual(sizeReports(bridge), [[980, 952], [1920, 1040]]);
});

test('fullscreen reports no size; leaving it restores the windowed size for the current screen', async () => {
  const bridge = fakeBridge();
  const { doc, addFrame } = fakeDocument();
  const menu = addFrame({ left: 470, top: 44, width: 980, height: 952 });
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  win.screenChanged();
  bridge.emit('fullscreenChanged', true);
  assert.equal(doc.documentElement.dataset.windowState, 'fullscreen');
  assert.equal(doc.documentElement.dataset.window, undefined, 'the root is never taken for a window button ([data-window])');
  menu.shown = false;
  addFrame({ left: 360, top: 120, width: 1200, height: 800 });
  win.screenChanged();
  await tick();
  assert.deepEqual(sizeReports(bridge), [[980, 952]], 'the frame on the backdrop, the window full screen');
  bridge.emit('fullscreenChanged', false);
  assert.equal(doc.documentElement.dataset.windowState, 'windowed');
  await tick();
  assert.deepEqual(sizeReports(bridge), [[980, 952], [1200, 800]]);
});

test('the shell tells the desktop window of every screen change, and 3D play takes the whole area', () => {
  const main = read('js/main.js');
  assert.match(main, /bindDesktopWindow\(\{ document, setIcon: setButtonIcon, fullArea: \(\) => /);
  assert.match(main, /onChange: \(\) => \{[^\n]*DESKTOP_WINDOW\.screenChanged\(\);/);
  const style = read('css/style.css');
  assert.match(style, /:root\[data-host="desktop"\]\[data-window-state="windowed"\] :is\(body, \.ui-backdrop\) \{ background: none; \}/,
    'windowed, the page draws no backdrop');
});

test('the web build: no window actions, nothing marked, no size reported', () => {
  const { doc, appended, buttons } = fakeDocument();
  const win = bindWindowActions({ client: null, document: doc, setIcon: () => { throw new Error('no icon change on the web'); } });
  assert.deepEqual(win.actions, {});
  win.reportSize(800, 600);
  win.screenChanged();
  win.dispose();
  assert.deepEqual(doc.documentElement.dataset, {});
  assert.deepEqual(doc.documentElement.style, {}, 'the root area stays the browser window');
  assert.equal(appended.length, 0);
  assert.equal(buttons[0].getAttribute('data-icon'), 'fullscreen');
});

test('on the desktop host the root area is the work area of the window\'s display, never the window, following its changes until disposed', () => {
  const bridge = fakeBridge();
  const { doc } = fakeDocument({ innerWidth: 1000, innerHeight: 700 });
  const win = bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  const root = doc.documentElement;
  assert.deepEqual([root.style.width, root.style.height], ['1920px', '1040px'], 'the work area, not the 1000 × 700 window');
  const { screen } = doc.defaultView;
  Object.assign(screen, { availWidth: 1366, availHeight: 728 });
  screen.emit('change');
  assert.deepEqual([root.style.width, root.style.height], ['1366px', '728px'], 'the window moved to another display');
  Object.assign(screen, { availWidth: 1366, availHeight: 768 });
  doc.defaultView.emit('resize');
  assert.deepEqual([root.style.width, root.style.height], ['1366px', '768px'], 'read again on a resize');
  win.dispose();
  assert.equal(screen.listeners.get('change').size + doc.defaultView.listeners.get('resize').size, 0, 'disposed, it stops following');
});

test('in desktop fullscreen the root area is the whole screen, the work area again once windowed', () => {
  const bridge = fakeBridge();
  const { doc } = fakeDocument();
  bindWindowActions({ client: createBridgeClient(bridge.host), document: doc, setIcon: () => {} });
  const root = doc.documentElement;
  bridge.emit('fullscreenChanged', true);
  assert.deepEqual([root.style.width, root.style.height], ['1920px', '1080px'], 'the screen, taskbar included');
  bridge.emit('fullscreenChanged', false);
  assert.deepEqual([root.style.width, root.style.height], ['1920px', '1040px'], 'the work area');
  const opened = fakeDocument({ innerWidth: 1920, innerHeight: 1080 });
  bindWindowActions({ client: createBridgeClient(fakeBridge().host), document: opened.doc, setIcon: () => {} });
  assert.deepEqual([opened.doc.documentElement.style.width, opened.doc.documentElement.style.height], ['1920px', '1080px'], 'a window opened full screen');
});

test('a window-size media query is settled by an area: the touch step\'s never holds for a desktop work area, its complement always does', () => {
  const desk = { width: 1920, height: 1040 };
  const TOUCH = '(max-width: 719px), (max-height: 500px) and (orientation: landscape)';
  assert.equal(areaMatches(TOUCH, desk), false);
  assert.equal(areaMatches('(max-width: 719px)', desk), false);
  assert.equal(areaMatches('(min-width: 720px) and (min-height: 501px), (min-width: 720px) and (orientation: portrait)', desk), true);
  assert.equal(areaMatches('(min-height: 501px) and (max-width: 719px), (orientation: portrait) and (max-width: 719px)', desk), false);
  assert.equal(areaMatches(TOUCH, { width: 390, height: 844 }), true, 'a phone-sized area would take it');
  assert.equal(areaMatches(TOUCH, { width: 844, height: 390 }), true, 'and sideways');
  assert.equal(areaMatches('(pointer: coarse)', desk), null, 'not the area\'s to decide');
  assert.equal(areaMatches('(prefers-reduced-motion: reduce)', desk), null);
  assert.equal(areaMatches('(max-width: 719px), (pointer: coarse)', desk), null);
});

test('the desktop host settles every window-size media rule against the area, keeps the others, and can settle again', () => {
  const rule = (mediaText) => ({ conditionText: mediaText, media: { mediaText } });
  const touch = rule('(max-width: 719px)');
  const wide = rule('(min-width: 720px)');
  const coarse = rule('(pointer: coarse)');
  const container = { conditionText: 'root (max-width: 1439px)' };
  const doc = { styleSheets: [{ cssRules: [touch, wide, coarse, container] }, { get cssRules() { throw new Error('cross-origin'); } }], head: {}, defaultView: {} };
  const media = bindAreaMedia(doc);
  assert.equal(touch.media.mediaText, '(max-width: 719px)', 'nothing settled before an area');
  media.settle({ width: 1920, height: 1040 });
  assert.deepEqual([touch.media.mediaText, wide.media.mediaText, coarse.media.mediaText], ['not all', 'all', '(pointer: coarse)']);
  media.settle({ width: 600, height: 900 });
  assert.deepEqual([touch.media.mediaText, wide.media.mediaText], ['all', 'not all'], 'settled again from each rule\'s own query');
  media.dispose();
});

test('the root area needs a screen to read: without one it is left as it is', () => {
  const doc = { documentElement: { style: {} }, defaultView: {} };
  bindAvailableArea(doc).dispose();
  assert.deepEqual(doc.documentElement.style, {});
});

test('the shell hands the title bar\'s window buttons the desktop window\'s actions', () => {
  const main = read('js/main.js');
  assert.match(main, /bindWindowButtons\(document\.body, \{ capabilities, actions: DESKTOP_WINDOW\.actions \}\);/);
});
