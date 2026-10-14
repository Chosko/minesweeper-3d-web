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
  boardScale: '100',
  theme: 'light',
  volume: 0.7,
  muted: false,
  confirmRestart: false,
  aimReadout: true,
  fieldOfView: 60,
  camera: 'fly',
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
  for (const key of ['invertY', 'fullscreen', 'muted', 'confirmRestart', 'aimReadout']) assert.equal(SCHEMA[key].type, 'boolean');
  assert.equal(SCHEMA.renderResolution.type, 'choice');
  assert.deepEqual([...SCHEMA.renderResolution.values], ['auto', 'sharp', 'fast']);
  assert.equal(SCHEMA.boardScale.type, 'choice');
  assert.deepEqual([...SCHEMA.boardScale.values], ['fit', '100', '125'], 'the 2D board scale: Fit, 100 % and 125 %');
  assert.equal(SCHEMA.theme.type, 'choice');
  assert.deepEqual([...SCHEMA.theme.values], ['light', 'dark']);
  assert.deepEqual(
    { type: SCHEMA.fieldOfView.type, min: SCHEMA.fieldOfView.min, max: SCHEMA.fieldOfView.max },
    { type: 'number', min: 45, max: 90 },
    'the field of view: 45 to 90 degrees',
  );
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
  assert.ok(isValid('boardScale', 'fit') && isValid('boardScale', '125'));
  assert.ok(!isValid('boardScale', 100), 'the scale is stored as its name');
  assert.ok(!isValid('boardScale', '150'));
  assert.ok(!isValid('theme', 'system'));
  assert.ok(!isValid('nope', 1));
});

test('"Always ask before restarting" is a boolean, off by default, validated and saved like any setting, with no legacy key', async () => {
  assert.equal(SCHEMA.confirmRestart.type, 'boolean');
  assert.equal(DEFAULTS.confirmRestart, false);
  assert.ok(isValid('confirmRestart', true));
  assert.ok(!isValid('confirmRestart', 'yes'));
  assert.ok(!isValid('confirmRestart', 1));
  assert.ok(!Object.hasOwn(LEGACY_KEYS, 'confirmRestart'), 'no legacy carry-over');
  const { store, stored } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, { confirmRestart: 'on' }) } });
  await store.load();
  assert.equal(store.get('confirmRestart'), false, 'an invalid stored value reads as the default');
  assert.deepEqual(await store.set('confirmRestart', 1), { ok: false, reason: 'invalid' });
  assert.deepEqual(await store.set('confirmRestart', true), { ok: true });
  assert.equal(store.get('confirmRestart'), true);
  assert.equal(stored().data.confirmRestart, true);
});

test('the Camera setting is a choice of Fly and Orbit, Fly by default; an invalid value is refused; a document without it loads as Fly with no version bump', async () => {
  assert.equal(SCHEMA.camera.type, 'choice');
  assert.deepEqual([...SCHEMA.camera.values], ['fly', 'orbit']);
  assert.equal(DEFAULTS.camera, 'fly');
  assert.ok(isValid('camera', 'orbit') && isValid('camera', 'fly'));
  assert.ok(!isValid('camera', 'Orbit') && !isValid('camera', 'free') && !isValid('camera', 1));
  assert.ok(!Object.hasOwn(LEGACY_KEYS, 'camera'), 'no legacy carry-over');
  const before = { lookSensitivity: 2, invertY: true, theme: 'dark', fieldOfView: 70 };
  const { store, stored } = setup({ initial: { [SETTINGS_DOC]: raw(SETTINGS_VERSION, before) } });
  await store.load();
  assert.equal(SETTINGS_VERSION, 1, 'the settings version is kept');
  assert.equal(store.get('camera'), 'fly', 'a document from before the setting reads Fly');
  assert.equal(store.get('fieldOfView'), 70, 'the rest as stored');
  assert.deepEqual(await store.set('camera', 'free'), { ok: false, reason: 'invalid' });
  assert.equal(store.get('camera'), 'fly');
  assert.deepEqual(await store.set('camera', 'orbit'), { ok: true });
  assert.equal(stored().data.camera, 'orbit', 'saved with the other settings');
  assert.equal(stored().version, 1);
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

test('the board scale is saved with the other settings: a document from before it reads 100 %, with no version bump', async () => {
  assert.equal(SETTINGS_VERSION, 1);
  const before = { lookSensitivity: 2, invertY: true, fullscreen: false, renderResolution: 'fast', theme: 'dark', volume: 0.5, muted: false, confirmRestart: true };
  const { store, backend, stored } = setup({ initial: { [SETTINGS_DOC]: raw(1, before) } });
  await store.load();
  assert.equal(store.get('boardScale'), '100');
  assert.equal(store.get('renderResolution'), 'fast', 'the rest as stored');
  const seen = [];
  store.onChange('boardScale', (v) => seen.push(v));
  assert.deepEqual(await store.set('boardScale', 'fit'), { ok: true });
  assert.deepEqual(await store.set('boardScale', '150'), { ok: false, reason: 'invalid' });
  assert.deepEqual(seen, ['100', 'fit'], 'the value at subscription, then the change');
  assert.equal(stored().data.boardScale, 'fit');
  const again = createSettingsStore({ storage: createStorage({ backend }), legacy: legacyOf(), onNotKept: () => {} });
  await again.load();
  assert.equal(again.get('boardScale'), 'fit', 'remembered for the profile');
});

test('the field of view: 60 for a new install, 45 for a stored document without it, with no version bump', async () => {
  assert.equal(SETTINGS_VERSION, 1);
  const fresh = setup();
  await fresh.store.load();
  assert.equal(fresh.store.get('fieldOfView'), 60, 'a new install');
  assert.equal(fresh.stored().data.fieldOfView, 60);
  const before = { lookSensitivity: 2, invertY: true, theme: 'dark', volume: 0.5 };
  const old = setup({ initial: { [SETTINGS_DOC]: raw(1, before) } });
  await old.store.load();
  assert.equal(old.store.get('fieldOfView'), 45, 'an existing install keeps 45');
  assert.equal(old.store.get('lookSensitivity'), 2, 'the rest as stored');
  assert.deepEqual(await old.store.set('volume', 0.4), { ok: true });
  assert.equal(old.stored().data.fieldOfView, 45, 'written by the next save');
  const kept = setup({ initial: { [SETTINGS_DOC]: raw(1, { ...before, fieldOfView: 72 }) } });
  await kept.store.load();
  assert.equal(kept.store.get('fieldOfView'), 72, 'a stored value is kept');
  assert.ok(isValid('fieldOfView', 45) && isValid('fieldOfView', 90) && isValid('fieldOfView', 61));
  assert.ok(!isValid('fieldOfView', 44) && !isValid('fieldOfView', 91) && !isValid('fieldOfView', '60'));
});

test('the field of view: 45 for a first start that carries over a legacy value, 60 when storage is unusable', async () => {
  const carried = setup({ legacy: legacyOf({ 'ms3d.invertY': '0' }) });
  await carried.store.load();
  assert.equal(carried.store.get('fieldOfView'), 45, 'a legacy carry-over is an existing player');
  const none = setup({ legacy: legacyOf({ 'ms3d.lookSens': 'abc' }) });
  await none.store.load();
  assert.equal(none.store.get('fieldOfView'), 60, 'nothing carried over: a new install');
  for (const initial of [{ [SETTINGS_DOC]: '{not json' }, { [SETTINGS_DOC]: raw(SETTINGS_VERSION + 1, {}) }]) {
    const bad = setup({ initial, legacy: legacyOf({ 'ms3d.lookSens': '2' }) });
    await bad.store.load();
    assert.equal(bad.store.get('fieldOfView'), 60, 'a corrupt or newer document');
  }
  const unreadable = setup({ legacy: legacyOf({ 'ms3d.lookSens': '2' }) });
  unreadable.backend.read = async () => { throw new Error('denied'); };
  await unreadable.store.load();
  assert.equal(unreadable.store.get('fieldOfView'), 60, 'unreadable storage');
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
  const expected = { ...EXPECTED_DEFAULTS, lookSensitivity: 2.5, invertY: true, volume: 0.3, muted: true, fieldOfView: 45 };
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
