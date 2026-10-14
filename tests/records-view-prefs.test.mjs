// The Records screen's remembered view (js/records/view-prefs.js): the Pinned first switch kept in
// its own platform-storage document, loaded before the screen first shows and saved on every change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { VIEW_PREFS_DOC, VIEW_PREFS_VERSION, createRecordsViewPrefs } from '../js/records/view-prefs.js';

const doc = (version, data) => JSON.stringify({ version, data });

function setup({ initial = {}, available = true, failWrites = false } = {}) {
  const backend = createMemoryBackend({ initial, available });
  if (failWrites) backend.write = async () => { throw new Error('refused'); };
  const storage = createStorage({ backend });
  return { backend, storage, prefs: createRecordsViewPrefs({ storage }) };
}

test('the document is records.view at version 1, registered by the preferences', () => {
  assert.equal(VIEW_PREFS_DOC, 'records.view');
  assert.equal(VIEW_PREFS_VERSION, 1);
  const { storage } = setup();
  assert.throws(() => storage.register(VIEW_PREFS_DOC, 1), /already|registered/i, 'registered once, by the preferences');
});

test('Pinned first is off before anything is stored', async () => {
  const { prefs } = setup();
  assert.equal(prefs.pinnedFirst, false);
  assert.equal(await prefs.load(), false);
  assert.equal(prefs.pinnedFirst, false);
});

test('a stored choice loads, and every change is saved', async () => {
  const { prefs, backend } = setup({ initial: { [VIEW_PREFS_DOC]: doc(1, { pinnedFirst: true }) } });
  assert.equal(await prefs.load(), true);
  assert.equal(prefs.pinnedFirst, true);
  await prefs.setPinnedFirst(false);
  assert.deepEqual(JSON.parse(backend.documents.get(VIEW_PREFS_DOC)), { version: 1, data: { pinnedFirst: false } });
  await prefs.setPinnedFirst(true);
  assert.deepEqual(JSON.parse(backend.documents.get(VIEW_PREFS_DOC)).data, { pinnedFirst: true });
  const again = setup({ initial: Object.fromEntries(backend.documents) });
  assert.equal(await again.prefs.load(), true, 'kept after a reload');
});

test('a malformed or newer document gives off', async () => {
  for (const text of [doc(1, { pinnedFirst: 'yes' }), doc(1, null), doc(1, [true]), 'not json', doc(2, { pinnedFirst: true })]) {
    const { prefs } = setup({ initial: { [VIEW_PREFS_DOC]: text } });
    assert.equal(await prefs.load(), false, text);
    assert.equal(prefs.pinnedFirst, false);
  }
});

test('a failed save keeps the choice for the session and never throws', async () => {
  for (const opts of [{ failWrites: true }, { available: false }]) {
    const { prefs } = setup(opts);
    await prefs.load();
    await prefs.setPinnedFirst(true);
    assert.equal(prefs.pinnedFirst, true);
  }
});

test('the preferences module is DOM-free', () => {
  const src = readFileSync(new URL('../js/records/view-prefs.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
});
