// The file service behind the bridge's storage and blob requests (`steam-cloud-saves`): the save
// directory under the user-data directory — one file per document and a directory per blob store,
// nothing else, so Steam Auto-Cloud syncs exactly it while the window state file and the crash log
// stay outside. Every name is checked against NAME_PATTERN before any path is built, so no request
// reaches outside the save directory. A write goes to a temporary file in the same directory, flushed
// and renamed over the old one, so a crash mid-write leaves the old file whole; leftover temporary
// files are swept the first time their directory is used. Every operation resolves or rejects with
// a HostError — `invalid` for a bad name or argument, `failed` for a disk that refuses — and never
// throws anything else into the bridge.
import * as nodeFs from 'node:fs/promises';
import path from 'node:path';

import { HostError } from './adapter/interface.js';

/** The save directory's name under the user-data directory. */
export const SAVE_DIR = 'saves';

/**
 * A document, blob-store or blob name: letters, digits, dot, dash and underscore, starting with a
 * letter or digit and not ending with a dot — no separator, no `..`, no leading `~` (the temporary
 * files' mark) — and short enough to stay a valid file name with its suffixes.
 */
export const NAME_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/;

/** Windows device names, reserved with or without an extension. */
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i;

const DOCUMENT_EXT = '.json';
const STORE_EXT = '.blobs';
const ASIDE_MARK = '.aside-';
const TEMP_MARK = '~';
const TEMP_EXT = '.tmp';

/** `name`, when it is a valid name; throws HostError('invalid') otherwise. */
export function checkName(name) {
  if (typeof name !== 'string' || !NAME_PATTERN.test(name) || DEVICE_NAME.test(name)) throw new HostError('invalid');
  return name;
}

/** A document's file name in the save directory. */
export const documentFile = (name) => `${name}${DOCUMENT_EXT}`;

/** A blob store's directory name in the save directory. */
export const storeDir = (name) => `${name}${STORE_EXT}`;

const failed = () => new HostError('failed');
const missing = (error) => error?.code === 'ENOENT';
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/**
 * The file service over `<root>/saves`, `root` being the user-data directory. `fs` is the
 * node:fs/promises API and `now` the clock, both replaceable for tests.
 */
export function createFileService({ root, fs = nodeFs, now = () => new Date() }) {
  const dir = path.join(root, SAVE_DIR);
  const sweeps = new Map();
  const queues = new Map();
  let serial = 0;

  /** Runs `job` after every earlier job on `file`, so writes to one file land in call order. */
  function serialise(file, job) {
    const run = (queues.get(file) ?? Promise.resolve()).then(job, job);
    const tail = run.catch(() => {});
    queues.set(file, tail);
    tail.then(() => { if (queues.get(file) === tail) queues.delete(file); });
    return run;
  }

  /**
   * Removes the temporary files a crash mid-write left in `folder`, once per folder and before any
   * write there makes its own; best-effort.
   */
  function sweep(folder) {
    if (!sweeps.has(folder)) {
      sweeps.set(folder, (async () => {
        let entries;
        try {
          entries = await fs.readdir(folder);
        } catch {
          return;
        }
        for (const entry of entries) {
          if (!entry.startsWith(TEMP_MARK) || !entry.endsWith(TEMP_EXT)) continue;
          try {
            await fs.unlink(path.join(folder, entry));
          } catch {
            // left for the next start
          }
        }
      })());
    }
    return sweeps.get(folder);
  }

  /** Writes `data` to `file` through a flushed temporary file renamed over it. */
  async function writeSafely(file, data) {
    const folder = path.dirname(file);
    try {
      await fs.mkdir(folder, { recursive: true });
    } catch {
      throw failed();
    }
    await sweep(folder);
    serial += 1;
    const temp = path.join(folder, `${TEMP_MARK}${path.basename(file)}.${process.pid}-${serial}${TEMP_EXT}`);
    try {
      const handle = await fs.open(temp, 'w');
      try {
        await handle.writeFile(data);
        await handle.sync();
      } finally {
        await handle.close();
      }
      await fs.rename(temp, file);
    } catch {
      try {
        await fs.unlink(temp);
      } catch {
        // never created, or already gone
      }
      throw failed();
    }
  }

  /** The file's contents (`encoding` given: text), or null when there is none. */
  async function readFile(file, encoding) {
    await sweep(path.dirname(file));
    try {
      return await fs.readFile(file, encoding);
    } catch (error) {
      if (missing(error)) return null;
      throw failed();
    }
  }

  const documentPath = (name) => path.join(dir, documentFile(checkName(name)));
  const storePath = (store) => path.join(dir, storeDir(checkName(store)));
  const blobPath = (store, key) => path.join(storePath(store), checkName(key));

  return {
    dir,

    /** The document's text, or null when there is none. */
    async read(name) {
      return readFile(documentPath(name), 'utf8');
    },

    /** Replaces the document's text. */
    async write(name, text) {
      const file = documentPath(name);
      if (typeof text !== 'string') throw new HostError('invalid');
      await serialise(file, () => writeSafely(file, text));
      return null;
    },

    /**
     * Renames the document aside with a dated suffix, so its name reads as missing; resolves the
     * new file name, or null when there was no document.
     */
    async setAside(name) {
      const file = documentPath(name);
      return serialise(file, async () => {
        const base = `${path.basename(file)}${ASIDE_MARK}${stamp(now())}`;
        try {
          for (let n = 1; ; n += 1) {
            const aside = n === 1 ? base : `${base}-${n}`;
            try {
              await fs.stat(path.join(dir, aside));
            } catch (error) {
              if (!missing(error)) throw error;
              await fs.rename(file, path.join(dir, aside));
              return aside;
            }
          }
        } catch (error) {
          if (missing(error)) return null;
          throw failed();
        }
      });
    },

    /** Stores the bytes under `key` in the named store, replacing any earlier blob. */
    async put(store, key, bytes) {
      const file = blobPath(store, key);
      if (!(bytes instanceof Uint8Array)) throw new HostError('invalid');
      await serialise(file, () => writeSafely(file, bytes));
      return null;
    },

    /** The blob's bytes, or null when there is none. */
    async get(store, key) {
      const file = blobPath(store, key);
      const data = await serialise(file, () => readFile(file));
      return data === null ? null : new Uint8Array(data);
    },

    /** Removes the blob; removing one that is not there succeeds. */
    async delete(store, key) {
      const file = blobPath(store, key);
      await serialise(file, async () => {
        try {
          await fs.unlink(file);
        } catch (error) {
          if (!missing(error)) throw failed();
        }
      });
      return null;
    },

    /** Every blob key in the named store, sorted. */
    async list(store) {
      const folder = storePath(store);
      await sweep(folder);
      let entries;
      try {
        entries = await fs.readdir(folder);
      } catch (error) {
        if (missing(error)) return [];
        throw failed();
      }
      return entries.filter((entry) => NAME_PATTERN.test(entry) && !DEVICE_NAME.test(entry)).sort();
    },
  };
}

/** Fills the bridge's storage and blob slots (desktop/bridge.js) with the file service. */
export function registerFileService(bridge, files) {
  bridge.register('storage.read', (name) => files.read(name));
  bridge.register('storage.write', (name, text) => files.write(name, text));
  bridge.register('storage.setAside', (name) => files.setAside(name));
  bridge.register('blobs.put', (store, key, bytes) => files.put(store, key, bytes));
  bridge.register('blobs.get', (store, key) => files.get(store, key));
  bridge.register('blobs.delete', (store, key) => files.delete(store, key));
  bridge.register('blobs.list', (store) => files.list(store));
}
