// The platform module: the one place a storage implementation is selected, once, when the
// module is first evaluated at start-up. Callers import the storage interface from here and
// never a backend: the web build selects the browser backend (js/platform/browser-backend.js).
//
// Exports `storage` and its methods `register`, `load`, `save`, `available` — the interface
// documented in js/platform/storage.js.

import { createStorage } from './storage.js';
import { createBrowserBackend } from './browser-backend.js';

export const storage = createStorage({ backend: createBrowserBackend() });
export const { register, load, save, available } = storage;
