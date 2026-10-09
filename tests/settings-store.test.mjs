import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { SCHEMA, SETTING_KEYS, DEFAULTS, isValid } from '../js/settings/schema.js';
import {
  createSettingsStore, SETTINGS_DOC, SETTINGS_VERSION, LEGACY_KEYS,
} from '../js/settings/store.js';

const raw = (version, data) => JSON.stringify({ version, data });

// A legacy reader over a plain object of ms3d.* key → string, counting its reads.
function legacyOf(values = {}) {
  const reads = [];
  return {
    reads,
    get(key) { reads.push(key); return Object.hasOwn(values, key) ? values[key] : null; },
  };
}

function setup({ initial, available, legacy = legacyOf() } = {}) {
  const backend = createMemoryBackend({ initial, available });
  const storage = createStorage({ backend });
  const unsaved = [];
  const store = createSettingsStore({ storage, legacy, onNotKept: (info) => unsaved.push(info) });
  const stored = () => {
    const text = backend.documents.get(SETTINGS_DOC);
    return text === undefined ? undefined : JSON.parse(text);
  };
  return { backend, storage, store, legacy, unsaved, stored };
}

const EXPECTED_DEFAULTS = {
  lookSensitivity: 1,
  invertY: false,
  fullscreen: false,
  renderResolution: 'auto',
  theme: 'light',
  volume: 0.7,
  muted: false,
};

// ---------------------------------------------------------------- schema

test('the schema declares every setting with its type, range or values, and default', () => {
  assert.deepEqual([...SETTING_KEYS].sort(), Object.keys(EXPECTED_DEFAULTS).sort());
  assert.deepEqual({ ...DEFAULTS }, EXPECTED_DEFAULTS);
  assert.deepEqual(
    { type: SCHEMA.lookSensitivity.type, min: SCHEMA.lookSensitivity.min, max: SCHEMA.lookSensitivity.max },
    { type: 'number', min: 0.25, max: 3 },
  );
  assert.deepEqual({ type: SCHEMA.volume.type, min: SCHEMA.volume.min, max: SCHEMA.volume.max }, { type: 'number', min: 0, max: 1 });
  for (const key of ['invertY', 'fullscreen', 'muted']) assert.equal(SCHEMA[key].type, 'boolean');
  assert.equal(SCHEMA.renderResolution.type, 'choice');
  assert.deepEqual([...SCHEMA.renderResolution.values], ['auto', 'sharp', 'fast']);
  assert.equal(SCHEMA.theme.type, 'choice');
  assert.deepEqual([...SCHEMA.theme.values], ['light', 'dark']);
  for (const key of SETTING_KEYS) {
    assert.equal(SCHEMA[key].key, key);
    assert.equal(SCHEMA[key].default, EXPECTED_DEFAULTS[key]);
    assert.ok(isValid(key, SCHEMA[key].default), `${key} default is valid`);
  }
  assert.ok(Object.isFrozen(SCHEMA) && Object.isFrozen(SCHEMA.theme) && Object.isFrozen(DEFAULTS));
});

test('isValid checks type and range or values', () => {
  assert.ok(isValid('lookSensitivity', 0.25));
  assert.ok(isValid('lookSensitivity', 3));
  assert.ok(!isValid('lookSensitivity', 0.2));
  assert.ok(!isValid('lookSensitivity', 3.01));
  assert.ok(!isValid('lookSensitivity', NaN));
  assert.ok(!isValid('lookSensitivity', '1'));
  assert.ok(isValid('volume', 0));
  assert.ok(!isValid('volume', -0.1));
  assert.ok(!isValid('volume', Infinity));
  assert.ok(isValid('invertY', true));
  assert.ok(!isValid('invertY', 1));
  assert.ok(isValid('renderResolution', 'sharp'));
  assert.ok(!isValid('renderResolution', 'Sharp'));
  assert.ok(!isValid('theme', 'system'));
  assert.ok(!isValid('nope', 1));
});

// ---------------------------------------------------------------- load

test('load fills missing and invalid values with defaults', async () => {
  const { store } = setup({
    initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { lookSensitivity: 2, theme: 'purple', volume: 5, muted: true }) },
  });
  await store.load();
  assert.equal(store.get('lookSensitivity'), 2);
  assert.equal(store.get('muted'), true);
  assert.equal(store.get('theme'), 'light');
  assert.equal(store.get('volume'), 0.7);
  assert.equal(store.get('renderResolution'), 'auto');
});

test('a document that is not an object loads as every default', async () => {
  const { store } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, [1, 2]) } });
  await store.load();
  for (const key of SETTING_KEYS) assert.equal(store.get(key), EXPECTED_DEFAULTS[key]);
});

test('get returns a valid default before load, and throws on an unknown key', () => {
  const { store } = setup();
  for (const key of SETTING_KEYS) assert.equal(store.get(key), EXPECTED_DEFAULTS[key]);
  assert.throws(() => store.get('nope'), /unknown setting/);
  assert.throws(() => store.set('nope', 1), /unknown setting/);
  assert.throws(() => store.set('theme', 'dark'), /before load/);
  assert.throws(() => store.onChange('nope', () => {}), /unknown setting/);
});

// ---------------------------------------------------------------- set

test('set validates, saves the whole document and notifies', async () => {
  const { store, stored } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { ...EXPECTED_DEFAULTS }) } });
  await store.load();
  const seen = [];
  store.onChange('theme', (value, key) => seen.push([key, value]));
  seen.length = 0;
  const result = await store.set('theme', 'dark');
  assert.deepEqual(result, { ok: true });
  assert.equal(store.get('theme'), 'dark');
  assert.deepEqual(seen, [['theme', 'dark']]);
  assert.deepEqual(stored(), { version: SETTINGS_VERSION, data: { ...EXPECTED_DEFAULTS, theme: 'dark' } });
});

test('an invalid value is rejected, the old value kept and nothing saved or notified', async () => {
  const { store, backend } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { ...EXPECTED_DEFAULTS, volume: 0.4 }) } });
  await store.load();
  const before = backend.documents.get(SETTINGS_DOC);
  let writes = 0;
  const write = backend.write;
  backend.write = (...a) => { writes++; return write(...a); };
  let notified = 0;
  store.onChange('volume', () => notified++);
  notified = 0;
  for (const bad of [1.5, -1, '0.5', NaN, null, undefined]) {
    assert.deepEqual(await store.set('volume', bad), { ok: false, reason: 'invalid' });
  }
  assert.equal(store.get('volume'), 0.4);
  assert.equal(writes, 0);
  assert.equal(notified, 0);
  assert.equal(backend.documents.get(SETTINGS_DOC), before);
});

test('a set while load runs applies after the loaded values, keeping the stored ones', async () => {
  const { store, stored } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { ...EXPECTED_DEFAULTS, volume: 0.2, theme: 'dark' }) } });
  const loading = store.load();
  const pending = store.set('fullscreen', true);
  await loading;
  assert.deepEqual(await pending, { ok: true });
  assert.equal(store.get('fullscreen'), true);
  assert.equal(store.get('volume'), 0.2);
  assert.deepEqual(stored(), { version: SETTINGS_VERSION, data: { ...EXPECTED_DEFAULTS, volume: 0.2, theme: 'dark', fullscreen: true } });
});

test('setting the current value again neither saves nor notifies', async () => {
  const { store, backend } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { ...EXPECTED_DEFAULTS }) } });
  await store.load();
  let writes = 0;
  const write = backend.write;
  backend.write = (...a) => { writes++; return write(...a); };
  let notified = 0;
  store.onChange('muted', () => notified++);
  notified = 0;
  assert.deepEqual(await store.set('muted', false), { ok: true });
  assert.equal(writes, 0);
  assert.equal(notified, 0);
});

// ---------------------------------------------------------------- onChange

test('onChange fires once at start-up with the loaded value, then after each change', async () => {
  const { store } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { ...EXPECTED_DEFAULTS, lookSensitivity: 1.5 }) } });
  const seen = [];
  store.onChange('lookSensitivity', (v) => seen.push(v));
  assert.deepEqual(seen, [], 'nothing fires before load');
  await store.load();
  assert.deepEqual(seen, [1.5]);
  await store.set('lookSensitivity', 2);
  await store.set('invertY', true);
  assert.deepEqual(seen, [1.5, 2]);
});

test('a listener added after load fires at once with the current value', async () => {
  const { store } = setup();
  await store.load();
  const seen = [];
  store.onChange('renderResolution', (v) => seen.push(v));
  assert.deepEqual(seen, ['auto']);
});

test('onChange returns an unsubscribe; a throwing listener does not stop the others', async () => {
  const { store } = setup();
  await store.load();
  const seen = [];
  const off = store.onChange('volume', (v) => seen.push(['a', v]));
  store.onChange('volume', () => { throw new Error('boom'); });
  store.onChange('volume', (v) => seen.push(['b', v]));
  seen.length = 0;
  await store.set('volume', 0.2);
  off();
  await store.set('volume', 0.3);
  assert.deepEqual(seen, [['a', 0.2], ['b', 0.2], ['b', 0.3]]);
  assert.equal(store.get('volume'), 0.3);
});

// ---------------------------------------------------------------- legacy carry-over

test('with no settings document the legacy keys are read once and written into the new document', async () => {
  const legacy = legacyOf({ 'ms3d.lookSens': '2.5', 'ms3d.invertY': '1', 'ms3d.volume': '0.3', 'ms3d.muted': '1' });
  const { store, stored, backend } = setup({ legacy });
  await store.load();
  assert.deepEqual([...legacy.reads].sort(), [...Object.values(LEGACY_KEYS)].sort());
  assert.deepEqual(
    [...Object.values(LEGACY_KEYS)].sort(),
    ['ms3d.invertY', 'ms3d.lookSens', 'ms3d.muted', 'ms3d.volume'],
  );
  const expected = { ...EXPECTED_DEFAULTS, lookSensitivity: 2.5, invertY: true, volume: 0.3, muted: true };
  for (const key of SETTING_KEYS) assert.equal(store.get(key), expected[key]);
  assert.deepEqual(stored(), { version: SETTINGS_VERSION, data: expected });

  // A later start reads only the document, even when the legacy keys say otherwise.
  const legacy2 = legacyOf({ 'ms3d.lookSens': '0.5', 'ms3d.muted': '0' });
  const store2 = createSettingsStore({ storage: createStorage({ backend }), legacy: legacy2 });
  await store2.load();
  assert.deepEqual(legacy2.reads, []);
  assert.equal(store2.get('lookSensitivity'), 2.5);
  assert.equal(store2.get('muted'), true);
});

test('legacy values follow the old readers: sensitivity clamped, volume clamped, flags only on "1"', async () => {
  const legacy = legacyOf({ 'ms3d.lookSens': '9', 'ms3d.invertY': '0', 'ms3d.volume': '-2', 'ms3d.muted': 'yes' });
  const { store } = setup({ legacy });
  await store.load();
  assert.equal(store.get('lookSensitivity'), 3);
  assert.equal(store.get('invertY'), false);
  assert.equal(store.get('volume'), 0);
  assert.equal(store.get('muted'), false);
});

test('missing or garbage legacy values take the defaults', async () => {
  const legacy = legacyOf({ 'ms3d.lookSens': 'abc', 'ms3d.volume': '' });
  const { store, stored } = setup({ legacy });
  await store.load();
  for (const key of SETTING_KEYS) assert.equal(store.get(key), EXPECTED_DEFAULTS[key]);
  assert.deepEqual(stored(), { version: SETTINGS_VERSION, data: EXPECTED_DEFAULTS });
});

test('a legacy reader that throws is treated as no legacy values', async () => {
  const legacy = { get() { throw new Error('SecurityError'); } };
  const { store } = setup({ legacy });
  await store.load();
  for (const key of SETTING_KEYS) assert.equal(store.get(key), EXPECTED_DEFAULTS[key]);
});

// ---------------------------------------------------------------- failure

test('unreadable storage gives every default and carries nothing over', async () => {
  const legacy = legacyOf({ 'ms3d.lookSens': '2', 'ms3d.muted': '1' });
  const { store, backend } = setup({ legacy, initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { theme: 'dark' }) } });
  backend.read = async () => { throw new Error('denied'); };
  await store.load();
  for (const key of SETTING_KEYS) assert.equal(store.get(key), EXPECTED_DEFAULTS[key]);
  assert.deepEqual(legacy.reads, []);
});

test('a failed save keeps the change for the session and reports once that settings will not be kept', async () => {
  const { store, backend, unsaved } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { ...EXPECTED_DEFAULTS }) } });
  await store.load();
  backend.write = async () => { throw new Error('quota'); };
  const seen = [];
  store.onChange('theme', (v) => seen.push(v));
  seen.length = 0;
  const first = await store.set('theme', 'dark');
  assert.equal(first.ok, false);
  assert.equal(first.reason, 'write-failed');
  assert.equal(store.get('theme'), 'dark');
  assert.deepEqual(seen, ['dark']);
  await store.set('volume', 0.1);
  await store.set('muted', true);
  assert.equal(store.get('volume'), 0.1);
  assert.equal(unsaved.length, 1);
  assert.equal(unsaved[0].reason, 'write-failed');
});

test('storage that does not persist reports once, at the carry-over save', async () => {
  const { store, unsaved } = setup({ available: false });
  await store.load();
  assert.equal(unsaved.length, 1);
  await store.set('fullscreen', true);
  assert.equal(store.get('fullscreen'), true);
  assert.equal(unsaved.length, 1);
});

test('a newer settings document is left untouched; defaults apply and saving reports once', async () => {
  const newer = raw(SETTINGS_VERSION + 1, { theme: 'dark' });
  const { store, backend, unsaved } = setup({ initial: { [SETTINGS_DOC]: newer } });
  await store.load();
  assert.equal(store.get('theme'), 'light');
  const result = await store.set('theme', 'dark');
  assert.deepEqual(result, { ok: false, reason: 'newer-version' });
  assert.equal(store.get('theme'), 'dark');
  assert.equal(backend.documents.get(SETTINGS_DOC), newer);
  assert.equal(unsaved.length, 1);
});

test('the store registers its document with platform storage once', () => {
  const { storage } = setup();
  assert.throws(() => storage.register(SETTINGS_DOC, SETTINGS_VERSION), /already registered|registered/);
});
