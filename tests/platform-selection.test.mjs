import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { selectPlatform, STEAM_SLOTS } from '../js/platform/index.js';
import { CAPABILITY_FLAGS, createCapabilities, deriveFlags } from '../js/platform/capabilities.js';
import { BRIDGE_GLOBAL, BRIDGE_EVENTS, findBridge, createBridgeClient, linkHost } from '../js/platform/bridge-client.js';
import { bindWindowActions, bindAvailableArea, bindAreaMedia, areaMatches, WINDOW_STATES, DRAG_REGION_CSS } from '../js/platform/window-actions.js';
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

function fakeDocument({ fullscreenButtons = 2, innerWidth = 1280, innerHeight = 800, screen = { width: 1920, height: 1080, availWidth: 1920, availHeight: 1040 } } = {}) {
  const appended = [];
  const button = () => {
    const attrs = new Map([['data-window', 'fullscreen'], ['data-icon', 'fullscreen'], ['aria-label', 'Fullscreen'], ['title', 'Fullscreen']]);
    return { attrs, getAttribute: (n) => attrs.get(n) ?? null, setAttribute: (n, v) => attrs.set(n, String(v)) };
  };
  const buttons = Array.from({ length: fullscreenButtons }, button);
  const doc = {
    documentElement: { dataset: {}, style: {} },
    head: { append: (el) => appended.push(el) },
    createElement: (tag) => ({ tagName: tag.toUpperCase(), textContent: '' }),
    querySelectorAll: (selector) => (selector === '[data-window="fullscreen"]' ? buttons : []),
    defaultView: { innerWidth, innerHeight, screen: withListeners(screen), ...withListeners({}) },
  };
  return { doc, buttons, appended };
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

test('the web build: no window actions, nothing marked, no size reported', () => {
  const { doc, appended, buttons } = fakeDocument();
  const win = bindWindowActions({ client: null, document: doc, setIcon: () => { throw new Error('no icon change on the web'); } });
  assert.deepEqual(win.actions, {});
  win.reportSize(800, 600);
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
