// The desktop host's file service (desktop/file-service.js): the save directory under the user-data
// directory, documents and blob stores in it, names checked against a fixed pattern, writes through a
// temporary file renamed over the old one, set-aside with a dated suffix, typed errors — and its
// registration in the bridge's storage and blob slots. Runs on a temporary directory; Electron is
// never loaded.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as realFs from 'node:fs/promises';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import path from 'node:path';

import { ERROR_MESSAGES, HostError } from '../desktop/adapter/interface.js';
import { createUnavailableAdapter } from '../desktop/adapter/unavailable.js';
import { SLOT_REQUESTS, createBridge } from '../desktop/bridge.js';
import {
  SAVE_DIR, checkName, createFileService, documentFile, registerFileService, storeDir,
} from '../desktop/file-service.js';

const MAIN = fileURLToPath(new URL('../desktop/main.js', import.meta.url));

function tempRoot(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'ms3d-files-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

const fixedNow = () => new Date(2026, 9, 31, 14, 5, 9);

async function rejectsWith(promise, code) {
  await assert.rejects(promise, (error) => error instanceof HostError && error.code === code);
}

/** The node:fs/promises API with the named operations failing as `code`, every call recorded. */
function failingFs(code, failing) {
  const calls = [];
  const fs = {};
  for (const op of ['mkdir', 'open', 'readFile', 'readdir', 'rename', 'unlink', 'rm', 'stat']) {
    fs[op] = async (...args) => {
      calls.push([op, ...args]);
      if (failing.includes(op)) throw Object.assign(new Error(`${op} refused`), { code });
      return realFs[op](...args);
    };
  }
  return { fs, calls };
}

// --- the save directory ---------------------------------------------------------------------------

test('the save directory sits under the user-data directory and holds a file per document and a directory per store', async (t) => {
  const root = tempRoot(t);
  writeFileSync(path.join(root, 'window-state.json'), '{}');
  writeFileSync(path.join(root, 'crash.log'), '');
  const files = createFileService({ root });
  assert.equal(files.dir, path.join(root, SAVE_DIR));
  await files.write('settings', '{"version":1}');
  await files.write('shell.boardPanel', '{}');
  await files.put('replays', 'a1b2', new Uint8Array([1, 2, 3]));
  const dir = path.join(root, SAVE_DIR);
  assert.deepEqual(readdirSync(dir).sort(), [documentFile('settings'), documentFile('shell.boardPanel'), storeDir('replays')].sort());
  assert.deepEqual(readdirSync(path.join(dir, storeDir('replays'))), ['a1b2']);
  assert.deepEqual(readdirSync(root).sort(), ['crash.log', SAVE_DIR, 'window-state.json'].sort(),
    'window state and the crash log stay outside the save directory');
});

test('no document file, blob-store directory or temporary file can take another\'s name', () => {
  for (const name of ['records', 'records.json', 'replays', 'replays.blobs']) {
    assert.notEqual(documentFile(name), storeDir(name));
    assert.notEqual(path.extname(documentFile(name)), path.extname(storeDir(name)));
    assert.throws(() => checkName(`~${documentFile(name)}`), HostError, 'a temporary file\'s mark is never a name');
  }
});

// --- documents ------------------------------------------------------------------------------------

test('a document reads back what was written, and reads null when there is none', async (t) => {
  const files = createFileService({ root: tempRoot(t) });
  assert.equal(await files.read('settings'), null);
  await files.write('settings', '{"version":2,"data":{"volume":0.5}}');
  assert.equal(await files.read('settings'), '{"version":2,"data":{"volume":0.5}}');
  await files.write('settings', '');
  assert.equal(await files.read('settings'), '');
  await files.write('settings', 'é ✓');
  assert.equal(await files.read('settings'), 'é ✓');
});

test('writes go through a temporary file renamed over the old one, and none is left behind', async (t) => {
  const root = tempRoot(t);
  const { fs, calls } = failingFs('EIO', []);
  const files = createFileService({ root, fs });
  await files.write('records', 'one');
  await files.write('records', 'two');
  const renames = calls.filter(([op]) => op === 'rename');
  assert.equal(renames.length, 2);
  for (const [, from, to] of renames) {
    assert.equal(to, path.join(root, SAVE_DIR, documentFile('records')));
    assert.notEqual(from, to);
    assert.equal(path.dirname(from), path.dirname(to), 'the temporary file sits beside the document');
  }
  assert.deepEqual(readdirSync(path.join(root, SAVE_DIR)), [documentFile('records')]);
  assert.equal(await files.read('records'), 'two');
});

test('an interrupted write leaves the old document whole and no partial file', async (t) => {
  const root = tempRoot(t);
  await createFileService({ root }).write('records', 'old');
  for (const failing of [['rename'], ['open']]) {
    const { fs } = failingFs('EIO', failing);
    const files = createFileService({ root, fs });
    await rejectsWith(files.write('records', 'new'), 'failed');
    assert.equal(await createFileService({ root }).read('records'), 'old', `${failing} failing`);
    assert.deepEqual(readdirSync(path.join(root, SAVE_DIR)), [documentFile('records')], `${failing} failing`);
  }
});

test('a crash mid-write leaves only a temporary file, which is never read or listed and is swept away', async (t) => {
  const root = tempRoot(t);
  const dir = path.join(root, SAVE_DIR);
  await createFileService({ root }).write('records', 'old');
  await createFileService({ root }).put('replays', 'k1', new Uint8Array([1]));
  // What a process killed between the write and the rename leaves: a temporary file, half written.
  const { fs } = failingFs('EIO', []);
  let reached;
  const bothReached = new Promise((resolve) => { let n = 0; reached = () => { n += 1; if (n === 2) resolve(); }; });
  const crashed = createFileService({ root, fs: { ...fs, rename: () => { reached(); return new Promise(() => {}); } } });
  crashed.write('records', 'new, half');
  crashed.put('replays', 'k2', new Uint8Array([2]));
  await bothReached;
  const leftovers = readdirSync(dir).filter((f) => f !== documentFile('records') && f !== storeDir('replays'));
  assert.equal(leftovers.length, 1, 'the document\'s temporary file');

  const files = createFileService({ root });
  assert.equal(await files.read('records'), 'old');
  assert.deepEqual(await files.list('replays'), ['k1']);
  assert.equal(await files.get('replays', 'k2'), null);
  assert.deepEqual(readdirSync(dir).sort(), [documentFile('records'), storeDir('replays')].sort());
  assert.deepEqual(readdirSync(path.join(dir, storeDir('replays'))), ['k1']);
});

test('concurrent writes of one document land in the order they were made', async (t) => {
  const files = createFileService({ root: tempRoot(t) });
  await Promise.all(['1', '2', '3', '4', '5'].map((v) => files.write('history', v)));
  assert.equal(await files.read('history'), '5');
});

test('set-aside renames the document with a dated suffix, keeps every earlier one, and reads null after', async (t) => {
  const root = tempRoot(t);
  const files = createFileService({ root, now: fixedNow });
  assert.equal(await files.setAside('records'), null, 'nothing to set aside');
  await files.write('records', '{not json');
  const first = await files.setAside('records');
  assert.equal(first, `${documentFile('records')}.aside-20261031-140509`);
  assert.equal(await files.read('records'), null);
  await files.write('records', '{again');
  const second = await files.setAside('records');
  assert.notEqual(second, first, 'a second set-aside in the same second keeps the first');
  assert.match(second, /^records\.json\.aside-20261031-140509-\d+$/);
  const dir = path.join(root, SAVE_DIR);
  assert.equal(readFileSync(path.join(dir, first), 'utf8'), '{not json');
  assert.equal(readFileSync(path.join(dir, second), 'utf8'), '{again');
  assert.equal(await files.read('records'), null);
});

// --- blobs ----------------------------------------------------------------------------------------

test('a blob store puts, gets, deletes and lists its blobs in its own directory', async (t) => {
  const files = createFileService({ root: tempRoot(t) });
  assert.deepEqual(await files.list('replays'), []);
  assert.equal(await files.get('replays', 'b'), null);
  await files.put('replays', 'b', new Uint8Array([9, 8, 7]));
  await files.put('replays', 'a', new Uint8Array([]));
  await files.put('pending', 'b', new Uint8Array([1]));
  const bytes = await files.get('replays', 'b');
  assert.ok(bytes instanceof Uint8Array);
  assert.deepEqual([...bytes], [9, 8, 7]);
  assert.deepEqual([...await files.get('replays', 'a')], []);
  assert.deepEqual(await files.list('replays'), ['a', 'b']);
  assert.deepEqual(await files.list('pending'), ['b']);
  await files.put('replays', 'b', new Uint8Array([6]));
  assert.deepEqual([...await files.get('replays', 'b')], [6]);
  assert.equal(await files.delete('replays', 'b'), null);
  assert.equal(await files.delete('replays', 'b'), null, 'deleting a missing blob succeeds');
  assert.equal(await files.delete('nowhere', 'b'), null);
  assert.deepEqual(await files.list('replays'), ['a']);
  assert.deepEqual([...await files.get('pending', 'b')], [1], 'stores are separate');
});

// --- names ----------------------------------------------------------------------------------------

test('names follow the fixed pattern: letters, digits, dot, dash and underscore, no device names', () => {
  for (const ok of ['settings', 'shell.boardPanel', 'records.history', 'replays', '0f8fad5b-d9cb-469f-a165-70867728950e', 'a', 'A_b-c.d']) {
    assert.equal(checkName(ok), ok);
  }
  const bad = ['', '.', '..', '../x', '..\\x', 'a/b', 'a\\b', '/abs', 'C:', 'C:\\x', '.hidden', 'trailing.', 'sp ace',
    '~tmp', 'a\0b', 'é', 'CON', 'con', 'nul.json', 'Com1', 'LPT9.x', 'x'.repeat(129), 5, null, undefined, {}];
  for (const name of bad) {
    assert.throws(() => checkName(name), (e) => e instanceof HostError && e.code === 'invalid', String(name));
  }
});

test('a request with a bad name rejects with invalid and reaches nothing outside the save directory', async (t) => {
  const root = tempRoot(t);
  writeFileSync(path.join(root, 'window-state.json'), 'outside');
  const { fs, calls } = failingFs('EIO', []);
  const files = createFileService({ root, fs });
  const traversals = ['..', '../window-state', '..\\window-state', `..${path.sep}..${path.sep}etc`, path.join(root, 'x'), 'a/../../b'];
  for (const name of traversals) {
    await rejectsWith(files.read(name), 'invalid');
    await rejectsWith(files.write(name, 'x'), 'invalid');
    await rejectsWith(files.setAside(name), 'invalid');
    await rejectsWith(files.put(name, 'k', new Uint8Array(1)), 'invalid');
    await rejectsWith(files.put('replays', name, new Uint8Array(1)), 'invalid');
    await rejectsWith(files.get(name, 'k'), 'invalid');
    await rejectsWith(files.get('replays', name), 'invalid');
    await rejectsWith(files.delete('replays', name), 'invalid');
    await rejectsWith(files.list(name), 'invalid');
  }
  assert.deepEqual(calls, [], 'no bad name touches the disk');
  assert.equal(readFileSync(path.join(root, 'window-state.json'), 'utf8'), 'outside');
  assert.equal(existsSync(path.join(root, SAVE_DIR)), false);
});

test('every path the service touches is inside the save directory', async (t) => {
  const root = tempRoot(t);
  const { fs, calls } = failingFs('EIO', []);
  const files = createFileService({ root, fs, now: fixedNow });
  await files.write('settings', '{}');
  await files.read('settings');
  await files.setAside('settings');
  await files.put('replays', 'k', new Uint8Array([1]));
  await files.get('replays', 'k');
  await files.list('replays');
  await files.delete('replays', 'k');
  const dir = path.join(root, SAVE_DIR);
  for (const [op, ...args] of calls) {
    const paths = args.filter((a) => typeof a === 'string' && path.isAbsolute(a));
    assert.ok(paths.length > 0, `${op} names its path`);
    for (const arg of paths) {
      assert.ok(arg === dir || arg.startsWith(dir + path.sep), `${op} ${arg} stays inside the save directory`);
    }
  }
});

test('bad arguments other than names reject with invalid', async (t) => {
  const files = createFileService({ root: tempRoot(t) });
  await rejectsWith(files.write('settings', 5), 'invalid');
  await rejectsWith(files.put('replays', 'k', 'not bytes'), 'invalid');
});

// --- failures -------------------------------------------------------------------------------------

test('a disk that cannot be written rejects with failed, and nothing throws', async (t) => {
  const root = tempRoot(t);
  await createFileService({ root }).write('settings', 'kept');
  await createFileService({ root }).put('replays', 'k', new Uint8Array([1]));
  // A read-only save directory: every write refused as the file system refuses it.
  const { fs } = failingFs('EROFS', ['mkdir', 'open', 'rename', 'unlink', 'rm']);
  const files = createFileService({ root, fs, now: fixedNow });
  await rejectsWith(files.write('settings', 'lost'), 'failed');
  await rejectsWith(files.setAside('settings'), 'failed');
  await rejectsWith(files.put('replays', 'k2', new Uint8Array([2])), 'failed');
  await rejectsWith(files.delete('replays', 'k'), 'failed');
  assert.equal(await files.read('settings'), 'kept', 'reads still work');
  assert.deepEqual(await files.list('replays'), ['k']);
});

test('a save directory that cannot be created rejects writes with failed and reads with failed or null', async (t) => {
  const root = tempRoot(t);
  writeFileSync(path.join(root, SAVE_DIR), 'a file where the directory should be');
  const files = createFileService({ root });
  await rejectsWith(files.write('settings', '{}'), 'failed');
  await rejectsWith(files.put('replays', 'k', new Uint8Array(1)), 'failed');
  for (const op of [() => files.read('settings'), () => files.get('replays', 'k'), () => files.list('replays')]) {
    try {
      const value = await op();
      assert.ok(value === null || (Array.isArray(value) && value.length === 0));
    } catch (error) {
      assert.ok(error instanceof HostError && error.code === 'failed');
    }
  }
});

test('a read the disk refuses rejects with failed, never as a missing document', async (t) => {
  const root = tempRoot(t);
  const { fs } = failingFs('EIO', ['readFile', 'readdir']);
  const files = createFileService({ root, fs });
  await rejectsWith(files.read('settings'), 'failed');
  await rejectsWith(files.get('replays', 'k'), 'failed');
  await rejectsWith(files.list('replays'), 'failed');
});

test('a read-only save directory on disk rejects writes with failed', { skip: process.platform === 'win32' && 'Windows ignores a directory\'s read-only mode' }, async (t) => {
  const root = tempRoot(t);
  const files = createFileService({ root });
  await files.write('settings', 'kept');
  const dir = path.join(root, SAVE_DIR);
  await realFs.chmod(dir, 0o555);
  t.after(() => realFs.chmod(dir, 0o755));
  await rejectsWith(files.write('settings', 'lost'), 'failed');
  await rejectsWith(files.put('replays', 'k', new Uint8Array(1)), 'failed');
  assert.equal(await files.read('settings'), 'kept');
});

test('a read-only document on a Windows disk refuses the write with failed and keeps its text', { skip: process.platform !== 'win32' && 'a file\'s read-only mode guards renames only on Windows' }, async (t) => {
  const root = tempRoot(t);
  const files = createFileService({ root });
  await files.write('settings', 'kept');
  const file = path.join(root, SAVE_DIR, documentFile('settings'));
  await realFs.chmod(file, 0o444);
  await rejectsWith(files.write('settings', 'lost'), 'failed');
  assert.equal(await files.read('settings'), 'kept');
  assert.deepEqual(readdirSync(path.join(root, SAVE_DIR)), [documentFile('settings')]);
});

// --- the bridge -----------------------------------------------------------------------------------

test('the file service fills every storage and blob slot of the bridge', async (t) => {
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: {}, closing: {} });
  const files = createFileService({ root: tempRoot(t), now: fixedNow });
  registerFileService(bridge, files);
  const ok = (value) => ({ ok: true, value });
  assert.deepEqual(await bridge.handle('storage.read', ['settings']), ok(null));
  assert.deepEqual(await bridge.handle('storage.write', ['settings', '{"v":1}']), ok(null));
  assert.deepEqual(await bridge.handle('storage.read', ['settings']), ok('{"v":1}'));
  assert.deepEqual(await bridge.handle('storage.setAside', ['settings']), ok(`${documentFile('settings')}.aside-20261031-140509`));
  assert.deepEqual(await bridge.handle('blobs.put', ['replays', 'k', new Uint8Array([4, 5])]), ok(null));
  const got = await bridge.handle('blobs.get', ['replays', 'k']);
  assert.equal(got.ok, true);
  assert.deepEqual([...got.value], [4, 5]);
  assert.deepEqual(await bridge.handle('blobs.list', ['replays']), ok(['k']));
  assert.deepEqual(await bridge.handle('blobs.delete', ['replays', 'k']), ok(null));
  assert.deepEqual(await bridge.handle('blobs.list', ['replays']), ok([]));
  assert.deepEqual(await bridge.handle('storage.read', ['../window-state']),
    { ok: false, error: { code: 'invalid', message: ERROR_MESSAGES.invalid } });
  assert.deepEqual(await bridge.handle('blobs.get', ['replays', '..']),
    { ok: false, error: { code: 'invalid', message: ERROR_MESSAGES.invalid } });
  const registered = [];
  registerFileService({ register: (op) => registered.push(op) }, files);
  assert.deepEqual(registered.sort(), [...SLOT_REQUESTS].sort());
});

test('a disk failure reaches the page as a failed reply', async (t) => {
  const bridge = createBridge({ adapter: createUnavailableAdapter(), window: {}, closing: {} });
  const { fs } = failingFs('EACCES', ['open', 'mkdir']);
  registerFileService(bridge, createFileService({ root: tempRoot(t), fs }));
  assert.deepEqual(await bridge.handle('storage.write', ['settings', '{}']),
    { ok: false, error: { code: 'failed', message: ERROR_MESSAGES.failed } });
});

test('the main process registers the file service over the user-data directory before the page loads', () => {
  const source = readFileSync(MAIN, 'utf8');
  assert.match(source, /registerFileService\(bridge, createFileService\(\{ root: app\.getPath\('userData'\) \}\)\)/);
  assert.ok(source.indexOf('registerFileService(') < source.indexOf('loadURL('));
});
