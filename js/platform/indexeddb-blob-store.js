// IndexedDB blob store implementation: the web build's persistent implementation of the contract
// js/platform/blob-store.js runs over. Each blob is one record in the STORE_NAME object store of
// the DB_NAME database, keyed by its name; nothing is kept anywhere else.
//
// openIndexedDBBlobStore({ indexedDB }?) → Promise of { put, get, delete, list }
//   indexedDB defaults to the global factory. The Promise rejects when there is none, when the
//   factory throws (storage blocked), or when the open request fails or is blocked: the caller
//   then falls back to memory.
//   put(name, bytes) → Promise; resolves once the write transaction has completed.
//   get(name)        → Promise of the bytes, or undefined when there is none.
//   delete(name)     → Promise; resolves once the delete transaction has completed.
//   list()           → Promise of every stored name.
// Every method rejects when its transaction fails (quota, a closed connection).

export const DB_NAME = 'ms3d-blobs';
export const STORE_NAME = 'blobs';
const DB_VERSION = 1;

function openDatabase(factory) {
  return new Promise((resolve, reject) => {
    if (!factory || typeof factory.open !== 'function') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = factory.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB refused to open'));
    request.onblocked = () => reject(new Error('IndexedDB open is blocked'));
  });
}

export async function openIndexedDBBlobStore({ indexedDB = globalThis.indexedDB } = {}) {
  const db = await openDatabase(indexedDB);
  // Another tab upgrading the database: let it, the store fails its later transactions.
  db.onversionchange = () => db.close();

  // Runs fn(store) in one transaction; resolves with the request's result once the transaction
  // has completed.
  function run(mode, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const request = fn(tx.objectStore(STORE_NAME));
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
      tx.onerror = () => reject(tx.error ?? request.error ?? new Error('IndexedDB transaction failed'));
    });
  }

  return {
    put: (name, bytes) => run('readwrite', (store) => store.put(bytes, name)).then(() => {}),
    get: (name) => run('readonly', (store) => store.get(name)),
    delete: (name) => run('readwrite', (store) => store.delete(name)).then(() => {}),
    list: () => run('readonly', (store) => store.getAllKeys()).then((keys) => keys.map(String)),
  };
}
