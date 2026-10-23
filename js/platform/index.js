// The platform module: the one place a storage implementation is selected, once, when the
// module is first evaluated at start-up. Callers import the storage interface and the blob store
// from here and never an implementation: the web build selects the browser backend
// (js/platform/browser-backend.js) for documents, and IndexedDB
// (js/platform/indexeddb-blob-store.js) for blobs, falling back to memory
// (js/platform/memory-blob-store.js) when IndexedDB is unavailable or refuses to open.
//
// Exports `storage` and its methods `register`, `load`, `save`, `clear`, `available` — the interface
// documented in js/platform/storage.js —, `blobStore`, the interface documented in
// js/platform/blob-store.js, and `capabilities`, the flags of what the host the page runs in offers:
// `desktopHost`, whether a desktop host gives the title bar's window buttons their actions. The web
// build has no host, so every flag is off.

import { createStorage } from './storage.js';
import { createBrowserBackend } from './browser-backend.js';
import { createBlobStore } from './blob-store.js';
import { openIndexedDBBlobStore } from './indexeddb-blob-store.js';
import { createMemoryBlobStore } from './memory-blob-store.js';

export const storage = createStorage({ backend: createBrowserBackend() });
export const { register, load, save, clear, available } = storage;

export const blobStore = createBlobStore({
  open: () => openIndexedDBBlobStore(),
  fallback: () => createMemoryBlobStore(),
});

export const capabilities = Object.freeze({ desktopHost: false });
