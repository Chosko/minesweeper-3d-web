// The page's side of the page bridge (desktop/preload.js, desktop/bridge.js): finding the bridge the
// desktop host exposes, the requests the page makes over it, and the link that keeps the page in
// step with the host — the Steam state into the capability flags, the overlay's activation to the
// shell's listeners, and the flush the host asks for before quitting. Only js/platform/ uses it.
//
// Every request is a promise that may reject with the bridge's typed error { code, message }; it
// never throws synchronously.

/** The global the preload exposes, and the events it carries (desktop/bridge.js's lists). */
export const BRIDGE_GLOBAL = 'ms3dHost';
export const BRIDGE_EVENTS = Object.freeze(['steamStateChanged', 'overlayActivated', 'flushRequested', 'fullscreenChanged']);

/** The bridge under `scope`, or null when there is none (the web build). */
export function findBridge(scope = globalThis) {
  const host = scope?.[BRIDGE_GLOBAL];
  if (!host || typeof host !== 'object' || !host.events) return null;
  return BRIDGE_EVENTS.every((event) => typeof host.events[event] === 'function') ? host : null;
}

const call = (run) => new Promise((resolve) => { resolve(run()); });

/** The requests and events the page uses, over the bridge `host`. */
export function createBridgeClient(host) {
  return Object.freeze({
    steamState: () => call(() => host.steam.state()),
    handshake: () => call(() => host.quit.handshake()),
    minimise: () => call(() => host.window.minimise()),
    toggleFullscreen: () => call(() => host.window.toggleFullscreen()),
    setContentSize: (width, height) => call(() => host.window.setContentSize(width, height)),
    /**
     * The documents of the save directory and the machine prefs directory (desktop/file-service.js):
     * text, or null when there is none.
     */
    readDocument: (name) => call(() => host.storage.read(name)),
    writeDocument: (name, text) => call(() => host.storage.write(name, text)),
    /** Renames the document aside; resolves the new file name, or null when there was none. */
    setDocumentAside: (name) => call(() => host.storage.setAside(name)),
    /** Removes the document's file and every kept-aside copy of it. */
    deleteDocument: (name) => call(() => host.storage.delete(name)),
    /** Every document with a file or a kept-aside copy, by name, sorted. */
    listDocuments: () => call(() => host.storage.list()),
    /** The save directory's blob stores, each by name: bytes, or null when there is none. */
    putBlob: (store, key, bytes) => call(() => host.blobs.put(store, key, bytes)),
    getBlob: (store, key) => call(() => host.blobs.get(store, key)),
    deleteBlob: (store, key) => call(() => host.blobs.delete(store, key)),
    listBlobs: (store) => call(() => host.blobs.list(store)),
    /** Subscribes to one of BRIDGE_EVENTS; returns the unsubscribe. */
    on: (event, listener) => host.events[event](listener),
  });
}

/**
 * Links the page to the host through `client` (null on the web: nothing is linked): asks for the
 * Steam state at start-up and feeds it and every change to `capabilities`; calls the overlay
 * listeners when the overlay opens; answers a flush request once every flush hook has settled — a
 * hook that throws or rejects is passed over —, the host bounding its wait by its own timeout.
 * Returns { onOverlayActivated(listener), addFlushHook(hook), dispose() }, each registration
 * returning its removal.
 */
export function linkHost({ client, capabilities }) {
  const overlayListeners = new Set();
  const flushHooks = new Set();
  const unlink = [];
  const register = (set) => (fn) => {
    set.add(fn);
    return () => set.delete(fn);
  };

  if (client) {
    let changed = false;
    unlink.push(client.on('steamStateChanged', (state) => {
      changed = true;
      capabilities.update(state);
    }));
    unlink.push(client.on('overlayActivated', (active) => {
      if (active !== true) return;
      for (const listener of [...overlayListeners]) listener();
    }));
    unlink.push(client.on('flushRequested', () => {
      Promise.allSettled([...flushHooks].map((hook) => call(hook)))
        .then(() => client.handshake())
        .catch(() => {});
    }));
    client.steamState().then((state) => { if (!changed) capabilities.update(state); }, () => {});
  }

  return {
    onOverlayActivated: register(overlayListeners),
    addFlushHook: register(flushHooks),
    dispose() {
      for (const off of unlink.splice(0)) off();
    },
  };
}
