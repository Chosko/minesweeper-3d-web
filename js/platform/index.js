// The platform module: the one place the platform's implementations are selected, once, when the
// module is first evaluated at start-up. It looks for the page bridge the desktop host exposes
// (js/platform/bridge-client.js): present, each slot takes its Steam implementation (STEAM_SLOTS,
// which the Steam features fill — storage and the replay store from steam-cloud-saves, files in the
// save directory (js/platform/steam-storage.js, js/platform/steam-blob-store.js), leaderboards,
// achievements); absent, or for a slot no Steam feature has filled, the browser implementation or
// local stand-in. Callers import what is selected from here and never an implementation, nor test
// for Electron or the bridge: the web build's storage is the browser backend
// (js/platform/browser-backend.js) for documents, and IndexedDB (js/platform/indexeddb-blob-store.js)
// for blobs, falling back to memory (js/platform/memory-blob-store.js) when IndexedDB is unavailable
// or refuses to open; leaderboards and achievements have no local stand-in yet (null).
//
// Exports `storage` and its methods `register`, `load`, `save`, `clear`, `available` — the interface
// documented in js/platform/storage.js —, `blobStore`, the interface documented in
// js/platform/blob-store.js, `leaderboards`, `achievements`, and `capabilities`, the flags of what
// the host offers (js/platform/capabilities.js), with the latest Steam state. From the host link
// (linkHost, js/platform/bridge-client.js): `onOverlayActivated(listener)`, called when the Steam
// overlay opens, and `addFlushHook(hook)`, a hook the host's flush before quitting awaits — with
// the bridge, every storage and blob request in flight is already one; and
// `bindDesktopWindow({ document, setIcon, fullArea })`, the desktop window driven from the page
// (js/platform/window-actions.js). The web build has no host: every flag is off, no overlay or
// flush ever comes, and the desktop window does nothing.

import { createStorage } from './storage.js';
import { createBrowserBackend } from './browser-backend.js';
import { createBlobStore } from './blob-store.js';
import { openIndexedDBBlobStore } from './indexeddb-blob-store.js';
import { createMemoryBlobStore } from './memory-blob-store.js';
import { createSteamBackend, createSaveTracker } from './steam-storage.js';
import { openSteamBlobStore, REPLAY_STORE } from './steam-blob-store.js';
import { createCapabilities } from './capabilities.js';
import { findBridge, createBridgeClient, linkHost } from './bridge-client.js';
import { bindWindowActions } from './window-actions.js';

/** Every storage and blob request the Steam implementations have in flight, for the quit flush. */
const STEAM_SAVES = createSaveTracker();

/** The Steam implementation of each slot, a factory of the bridge client; null keeps the browser one. */
export const STEAM_SLOTS = Object.freeze({
  storage: (client) => createStorage({ backend: createSteamBackend({ client, track: STEAM_SAVES.track }) }),
  blobStore: (client) => createBlobStore({
    open: () => openSteamBlobStore({ client, name: REPLAY_STORE, track: STEAM_SAVES.track }),
    fallback: () => createMemoryBlobStore(),
  }),
  leaderboards: null,
  achievements: null,
});

/** The web build's implementation of each slot. */
const BROWSER = Object.freeze({
  storage: () => createStorage({ backend: createBrowserBackend() }),
  blobStore: () => createBlobStore({
    open: () => openIndexedDBBlobStore(),
    fallback: () => createMemoryBlobStore(),
  }),
  leaderboards: () => null,
  achievements: () => null,
});

/**
 * Selects every slot for `bridge` (the preload's object, or null) → { host: 'desktop' | 'browser',
 * client (the bridge client or null), storage, blobStore, leaderboards, achievements, capabilities }.
 */
export function selectPlatform({ bridge, browser, steam = STEAM_SLOTS }) {
  const client = bridge ? createBridgeClient(bridge) : null;
  const pick = (slot) => (client && typeof steam[slot] === 'function' ? steam[slot](client) : browser[slot]());
  return {
    host: client ? 'desktop' : 'browser',
    client,
    storage: pick('storage'),
    blobStore: pick('blobStore'),
    leaderboards: pick('leaderboards'),
    achievements: pick('achievements'),
    capabilities: createCapabilities({ desktopHost: client !== null }),
  };
}

const PLATFORM = selectPlatform({ bridge: findBridge(globalThis), browser: BROWSER });

export const storage = PLATFORM.storage;
export const { register, load, save, clear, available } = storage;
export const blobStore = PLATFORM.blobStore;
export const leaderboards = PLATFORM.leaderboards;
export const achievements = PLATFORM.achievements;
export const capabilities = PLATFORM.capabilities;

export const { onOverlayActivated, addFlushHook } = linkHost({ client: PLATFORM.client, capabilities });
if (PLATFORM.client) addFlushHook(() => STEAM_SAVES.settled());

/** The desktop window driven from the page; nothing on the web. */
export function bindDesktopWindow({ document, setIcon, fullArea }) {
  return bindWindowActions({ client: PLATFORM.client, document, setIcon, fullArea });
}
