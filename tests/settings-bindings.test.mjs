// The action catalogues, the bindings resolver and the bindings setting: the flat modes' and 3D's
// rebindable actions with their defaults, the player's overrides as one setting of the settings
// document, both directions of the resolver, bind with its swap, the reserved and last-binding
// refusals, reset, the fallback for invalid saved overrides, change notification, and the help
// surfaces reading the current bindings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { SCHEMA, DEFAULTS, isValid } from '../js/settings/schema.js';
import { createSettingsStore, SETTINGS_DOC, SETTINGS_VERSION } from '../js/settings/store.js';
import {
  CATALOGUES, INPUT_DEVICES, catalogueOf, isInput, isReserved, DEFAULT_CURRENT,
  helpListHtml, bindingsHtml, readyListHtml, hintStripHtml, hintText, keyHintKeys, reminderKeys,
} from '../js/settings/bindings.js';
import { createBindings, resolveBindings, OVERRIDES_KEY } from '../js/settings/resolver.js';
import { CURSOR_KEYS, PAD_MAP } from '../js/classic2d/cursor-input.js';
import { BTN, NUM_BUTTONS, GLYPHS } from '../js/gamepad.js';

const text = (html) => html.replace(/<[^>]+>/g, '').replace(/&#39;/g, '\'').replace(/&middot;/g, '·');

async function setup(stored) {
  const initial = stored === undefined ? undefined : { [SETTINGS_DOC]: JSON.stringify({ version: SETTINGS_VERSION, data: { ...stored } }) };
  const backend = createMemoryBackend({ initial });
  const store = createSettingsStore({ storage: createStorage({ backend }), legacy: null });
  await store.load();
  const bindings = createBindings({ store });
  const saved = () => JSON.parse(backend.documents.get(SETTINGS_DOC)).data[OVERRIDES_KEY];
  return { backend, store, bindings, saved };
}

const MODES = ['classic-2d', 'hexagon', 'triangle', '3d'];
const FLAT = ['classic-2d', 'hexagon', 'triangle'];

// ---------------------------------------------------------------- the catalogues

test('the 3D catalogue holds the six moves, the three held view modes, reveal and flag; the flat modes\' reveal, flag, chord and the four cursor moves', () => {
  assert.deepEqual(CATALOGUES['3d'].actions.map((a) => a.id), ['forward', 'back', 'left', 'right', 'down', 'up', 'neighbours', 'aimThrough', 'showHidden', 'reveal', 'flag']);
  assert.deepEqual(CATALOGUES.flat.actions.map((a) => a.id), ['reveal', 'flag', 'chord', 'up', 'down', 'left', 'right']);
  for (const mode of FLAT) assert.equal(catalogueOf(mode), 'flat', `${mode} plays on the flat modes' catalogue`);
  assert.equal(catalogueOf('3d'), '3d');
  assert.throws(() => catalogueOf('surface'), /unknown mode/);
  assert.deepEqual([...INPUT_DEVICES], ['keyboard', 'mouse', 'controller']);
  for (const catalogue of Object.values(CATALOGUES)) {
    for (const action of catalogue.actions) {
      assert.equal(typeof action.label, 'string', `${action.id} has a label`);
      assert.ok(['press', 'release', 'held'].includes(action.fires), `${action.id} fires on press, on release or while held`);
      for (const device of INPUT_DEVICES) {
        const inputs = action.defaults[device];
        assert.ok(Array.isArray(inputs) && inputs.length <= 2, `${action.id}: up to two ${device} defaults`);
        for (const input of inputs) assert.ok(isInput(device, input), `${action.id}: ${device} default ${input} is an input`);
      }
    }
    assert.ok(Object.isFrozen(catalogue) && Object.isFrozen(catalogue.actions));
  }
  const held3d = CATALOGUES['3d'].actions.filter((a) => a.fires === 'held').map((a) => a.id);
  assert.deepEqual(held3d, ['forward', 'back', 'left', 'right', 'down', 'up', 'neighbours', 'aimThrough', 'showHidden'], 'moves and view modes are held');
});

test('the defaults are today\'s bindings: the 3D keys and buttons, and Classic 2D\'s cursor keys and pad map', () => {
  const d = (cat, mode) => Object.fromEntries(CATALOGUES[cat].actions.map((a) => [a.id, a.defaults]));
  const three = d('3d');
  assert.deepEqual(['forward', 'left', 'back', 'right', 'down', 'up'].map((a) => three[a].keyboard), [['KeyW'], ['KeyA'], ['KeyS'], ['KeyD'], ['KeyQ'], ['KeyE']]);
  assert.deepEqual(three.up.controller, [BTN.A]);
  assert.deepEqual(three.down.controller, [BTN.B]);
  assert.deepEqual(three.neighbours, { keyboard: ['ShiftLeft', 'ShiftRight'], mouse: [], controller: [BTN.LB] }, 'Shift by default');
  assert.deepEqual(three.aimThrough, { keyboard: ['Space'], mouse: [], controller: [BTN.RB] }, 'Space by default');
  assert.deepEqual(three.showHidden, { keyboard: ['ControlLeft', 'ControlRight'], mouse: [], controller: [BTN.Y] }, 'Ctrl by default');
  assert.deepEqual(three.reveal, { keyboard: ['Enter'], mouse: [0], controller: [BTN.RT] });
  assert.deepEqual(three.flag, { keyboard: ['Quote'], mouse: [2], controller: [BTN.LT] });

  const flat = d('flat');
  assert.deepEqual(flat.reveal.mouse, [0, 1], 'the left and middle buttons reveal');
  assert.deepEqual(flat.flag.mouse, [2]);
  assert.deepEqual(flat.chord.mouse, [], 'the chord is Left + Right, not a button of its own');
  // Classic 2D's cursor keys and pad map (task 35), Numpad Enter read as Enter.
  for (const [code, what] of Object.entries(CURSOR_KEYS)) {
    assert.ok(flat[what].keyboard.includes(code === 'NumpadEnter' ? 'Enter' : code), `${code} → ${what}`);
  }
  for (const [button, what] of Object.entries(PAD_MAP)) assert.ok(flat[what].controller.includes(Number(button)), `pad ${button} → ${what}`);
  const count = (device) => CATALOGUES.flat.actions.reduce((n, a) => n + a.defaults[device].length, 0);
  assert.equal(count('keyboard'), Object.keys(CURSOR_KEYS).length - 1, 'no other key');
  assert.equal(count('controller'), Object.keys(PAD_MAP).length, 'no other button');
});

test('keys are KeyboardEvent codes, mouse buttons button numbers, controller buttons standard-mapping indices', () => {
  assert.ok(isInput('keyboard', 'KeyF') && isInput('keyboard', 'Digit1') && isInput('keyboard', 'Quote'));
  assert.ok(!isInput('keyboard', 70) && !isInput('keyboard', '') && !isInput('keyboard', 'Key F'));
  assert.ok(isInput('mouse', 0) && isInput('mouse', 4) && !isInput('mouse', 5) && !isInput('mouse', '0') && !isInput('mouse', 1.5));
  assert.ok(isInput('controller', 0) && isInput('controller', NUM_BUTTONS - 1) && !isInput('controller', NUM_BUTTONS) && !isInput('controller', -1));
  assert.ok(!isInput('touch', 0), 'touch is no rebinding device');
});

// ---------------------------------------------------------------- the setting

test('the overrides are one setting of the settings document, empty by default', async () => {
  assert.equal(OVERRIDES_KEY, 'bindings');
  assert.deepEqual(DEFAULTS.bindings, {});
  assert.ok(isValid('bindings', {}) && isValid('bindings', { flat: { keyboard: { flag: ['KeyG'] } } }));
  assert.ok(!isValid('bindings', null) && !isValid('bindings', []) && !isValid('bindings', 'x'));
  assert.equal(SCHEMA.bindings.key, 'bindings');
  const { bindings, saved, store } = await setup();
  assert.deepEqual(saved(), {}, 'a new document holds no override');
  const result = await bindings.bind('classic-2d', 'keyboard', 'flag', 0, 'KeyG');
  assert.equal(result.ok, true);
  assert.deepEqual(saved(), { flat: { keyboard: { flag: ['KeyG'] } } }, 'only the changed action, keyed by catalogue, device and action');
  assert.deepEqual(store.get('bindings'), saved());
  // Back to its default, the action leaves the overrides.
  await bindings.bind('classic-2d', 'keyboard', 'flag', 0, 'KeyF');
  assert.deepEqual(saved(), {});
});

test('saved overrides load with the settings document and apply at once', async () => {
  const { bindings } = await setup({ bindings: { '3d': { controller: { reveal: [BTN.A] , up: [BTN.RT] } } } });
  assert.deepEqual([...bindings.inputsFor('3d', 'controller', 'reveal')], [BTN.A]);
  assert.equal(bindings.actionFor('3d', 'controller', BTN.RT), 'up');
  assert.deepEqual([...bindings.inputsFor('3d', 'keyboard', 'reveal')], ['Enter'], 'the keyboard keeps its defaults');
});

// ---------------------------------------------------------------- resolve both ways

test('actionFor and inputsFor answer from the mode\'s catalogue; Hexagon and Triangle as Classic 2D', async () => {
  const { bindings } = await setup();
  assert.equal(bindings.actionFor('3d', 'keyboard', 'KeyW'), 'forward');
  assert.equal(bindings.actionFor('3d', 'keyboard', 'ShiftRight'), 'neighbours');
  assert.equal(bindings.actionFor('3d', 'mouse', 2), 'flag');
  assert.equal(bindings.actionFor('3d', 'controller', BTN.B), 'down', 'B moves down in 3D');
  assert.equal(bindings.actionFor('3d', 'keyboard', 'KeyF'), null, 'F is fullscreen in 3D, no catalogue action');
  assert.equal(bindings.actionFor('3d', 'keyboard', 'NumpadEnter'), null, '3D reveals on Enter alone, as today');
  for (const mode of FLAT) {
    assert.equal(bindings.actionFor(mode, 'keyboard', 'KeyF'), 'flag', `${mode}: F flags`);
    assert.equal(bindings.actionFor(mode, 'keyboard', 'NumpadEnter'), 'reveal', `${mode}: Numpad Enter is Enter`);
    assert.equal(bindings.actionFor(mode, 'mouse', 1), 'reveal', `${mode}: the middle button reveals`);
    assert.equal(bindings.actionFor(mode, 'controller', BTN.UP), 'up');
    assert.equal(bindings.actionFor(mode, 'controller', BTN.B), null, `${mode}: B is the shell's`);
    assert.deepEqual([...bindings.inputsFor(mode, 'keyboard', 'reveal')], ['Space', 'Enter'], 'in slot order');
    assert.deepEqual([...bindings.inputsFor(mode, 'controller', 'chord')], [BTN.Y]);
  }
  assert.throws(() => bindings.inputsFor('3d', 'keyboard', 'chord'), /unknown action/, 'chord is no 3D action');
  assert.throws(() => bindings.actionFor('3d', 'touch', 0), /unknown device/);
});

test('a rebinding made in one flat mode applies to all three, and follows without a restart', async () => {
  const { bindings } = await setup();
  await bindings.bind('hexagon', 'keyboard', 'chord', 0, 'KeyC');
  for (const mode of FLAT) {
    assert.equal(bindings.actionFor(mode, 'keyboard', 'KeyC'), 'chord', mode);
    assert.equal(bindings.actionFor(mode, 'keyboard', 'KeyD'), null, `${mode}: D no longer chords`);
  }
  assert.equal(bindings.actionFor('3d', 'keyboard', 'KeyD'), 'right', '3D keeps its own bindings');
});

// ---------------------------------------------------------------- bind, clear, reset

test('bind swaps a clash: the other action takes the replaced input, and the swap is reported', async () => {
  const { bindings, saved } = await setup();
  const result = await bindings.bind('classic-2d', 'keyboard', 'flag', 0, 'KeyD');
  assert.deepEqual(result, { ok: true, swapped: { action: 'chord', input: 'KeyF' } });
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'keyboard', 'flag')], ['KeyD']);
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'keyboard', 'chord')], ['KeyF'], 'chord takes F in D\'s place');
  // A second slot added to an action, from another action's inputs: that action keeps its other input.
  const second = await bindings.bind('classic-2d', 'controller', 'chord', 1, BTN.LT);
  assert.deepEqual(second, { ok: true, swapped: { action: 'flag', input: null } });
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'controller', 'chord')], [BTN.Y, BTN.LT]);
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'controller', 'flag')], [BTN.X]);
  // The same input in the action's other slot: the two slots trade places, nothing reported.
  const flat = await bindings.bind('classic-2d', 'keyboard', 'reveal', 0, 'Enter');
  assert.deepEqual(flat, { ok: true, swapped: null });
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'keyboard', 'reveal')], ['Enter', 'Space']);
  // An action's only input bound again into its empty second slot: nothing changes, nothing else is lost.
  await bindings.bind('3d', 'keyboard', 'reveal', 0, 'KeyG');
  assert.deepEqual(await bindings.bind('3d', 'keyboard', 'aimThrough', 1, 'Space'), { ok: true, swapped: null });
  assert.deepEqual([...bindings.inputsFor('3d', 'keyboard', 'aimThrough')], ['Space']);
  assert.deepEqual([...bindings.inputsFor('3d', 'keyboard', 'reveal')], ['KeyG'], 'the other rebinding kept');
  assert.deepEqual(saved()['3d'].keyboard, { reveal: ['KeyG'] });
  // Unbound input: no swap.
  assert.deepEqual(await bindings.bind('3d', 'keyboard', 'up', 1, 'KeyT'), { ok: true, swapped: null });
  assert.deepEqual([...bindings.inputsFor('3d', 'keyboard', 'up')], ['KeyE', 'KeyT']);
});

test('bind refuses a swap that would leave the other action with no input on its device', async () => {
  const { bindings } = await setup();
  // The controller's only Up button (A) taken into a new slot of Reveal would leave Up with none there.
  const r = await bindings.bind('3d', 'controller', 'reveal', 1, BTN.A);
  assert.deepEqual(r, { ok: false, reason: 'last', action: 'up' });
  assert.deepEqual([...bindings.inputsFor('3d', 'controller', 'up')], [BTN.A], 'nothing changed');
});

test('bind refuses every reserved input in every catalogue; Y stays bindable', async () => {
  const { bindings, saved } = await setup();
  const always = { keyboard: ['Escape', 'F2', 'KeyR', 'Tab', 'MetaLeft', 'MetaRight', 'F1', 'F5', 'F11', 'F12'], controller: [BTN.START, BTN.HOME] };
  const own = {
    'classic-2d': { keyboard: ['KeyH', 'KeyM'], controller: [BTN.B, BTN.BACK] },
    '3d': { keyboard: ['KeyH', 'KeyM', 'KeyF', 'KeyX', 'Home', 'ArrowUp', 'ArrowLeft'], controller: [BTN.X, BTN.BACK, BTN.UP, BTN.DOWN] },
  };
  for (const mode of MODES) {
    const extra = own[mode === '3d' ? '3d' : 'classic-2d'];
    for (const device of ['keyboard', 'controller']) {
      for (const input of [...always[device], ...extra[device]]) {
        assert.ok(isReserved(mode, device, input), `${mode}: ${input} is reserved`);
        assert.deepEqual(await bindings.bind(mode, device, 'reveal', 0, input), { ok: false, reason: 'reserved' }, `${mode}: ${device} ${input} refused`);
      }
    }
    assert.ok(!isReserved(mode, 'controller', BTN.Y), `${mode}: Y alone is no reserved input`);
  }
  assert.deepEqual(saved(), {}, 'nothing written');
  assert.ok(!isReserved('3d', 'controller', BTN.B), 'B is reserved in the flat modes only: it moves down in 3D');
  assert.equal((await bindings.bind('classic-2d', 'controller', 'flag', 0, BTN.Y)).ok, true, 'Y binds in the flat modes');
  assert.equal((await bindings.bind('3d', 'controller', 'flag', 0, BTN.Y)).ok, true, 'Y binds in 3D');
  assert.deepEqual(await bindings.bind('3d', 'keyboard', 'reveal', 0, 'Key F'), { ok: false, reason: 'unknown' }, 'no such input');
  assert.deepEqual(await bindings.bind('3d', 'keyboard', 'reveal', 2, 'KeyT'), { ok: false, reason: 'unknown' }, 'two slots only');
});

test('clear refuses an action\'s last input on keyboard and mouse together, or on the controller', async () => {
  const { bindings } = await setup();
  // 3D reveal: Enter on the keyboard, the left button on the mouse.
  assert.deepEqual(await bindings.clear('3d', 'keyboard', 'reveal', 0), { ok: true });
  assert.deepEqual(await bindings.clear('3d', 'mouse', 'reveal', 0), { ok: false, reason: 'last' }, 'the left button is its last on keyboard and mouse');
  assert.deepEqual([...bindings.inputsFor('3d', 'mouse', 'reveal')], [0]);
  assert.deepEqual(await bindings.clear('classic-2d', 'controller', 'chord', 0), { ok: false, reason: 'last' }, 'Y is chord\'s only button');
  assert.deepEqual(await bindings.clear('classic-2d', 'controller', 'reveal', 0), { ok: true }, 'reveal keeps RT');
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'controller', 'reveal')], [BTN.RT], 'the later slot moves up');
  assert.deepEqual(await bindings.clear('3d', 'controller', 'forward', 0), { ok: false, reason: 'empty' }, 'nothing in that slot');
});

test('reset restores one catalogue\'s defaults on one device', async () => {
  const { bindings, saved } = await setup();
  await bindings.bind('classic-2d', 'keyboard', 'flag', 0, 'KeyG');
  await bindings.bind('classic-2d', 'controller', 'flag', 0, BTN.LB);
  await bindings.bind('3d', 'keyboard', 'reveal', 0, 'KeyG');
  assert.deepEqual(await bindings.reset('triangle', 'keyboard'), { ok: true });
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'keyboard', 'flag')], ['KeyF']);
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'controller', 'flag')], [BTN.LB, BTN.LT], 'the controller keeps its rebinding');
  assert.deepEqual([...bindings.inputsFor('3d', 'keyboard', 'reveal')], ['KeyG'], '3D keeps its rebinding');
  assert.deepEqual(saved(), { flat: { controller: { flag: [BTN.LB, BTN.LT] } }, '3d': { keyboard: { reveal: ['KeyG'] } } });
});

// ---------------------------------------------------------------- invalid saved overrides

test('invalid saved overrides fall back to defaults for that catalogue and device; the rest are kept', () => {
  const good = { reveal: ['KeyG'] };
  const cases = [
    ['an unknown action', { jump: ['KeyG'] }],
    ['an unknown input', { reveal: ['not a key'] }],
    ['a clash', { reveal: ['KeyF'] }],
    ['F2', { reveal: ['F2'] }],
    ['R', { flag: ['KeyR'] }],
    ['three inputs', { reveal: ['KeyG', 'KeyH', 'KeyJ'] }],
    ['no list', { reveal: 'KeyG' }],
  ];
  for (const [what, bad] of cases) {
    const current = resolveBindings({ flat: { keyboard: bad, controller: { chord: [BTN.LB] } }, '3d': { keyboard: good } });
    assert.deepEqual(current.flat.keyboard, DEFAULT_CURRENT.flat.keyboard, `${what}: the flat keyboard falls back`);
    assert.deepEqual([...current.flat.controller.chord], [BTN.LB], `${what}: the flat controller is kept`);
    assert.deepEqual([...current['3d'].keyboard.reveal], ['KeyG'], `${what}: 3D is kept`);
  }
  const r3 = resolveBindings({ '3d': { controller: { reveal: [BTN.START] } } });
  assert.deepEqual(r3['3d'].controller, DEFAULT_CURRENT['3d'].controller, 'Start is refused');
  for (const garbage of [{ flat: 5 }, { flat: { keyboard: [] } }, { surface: {} }, { flat: { touch: {} } }]) {
    assert.deepEqual(resolveBindings(garbage), DEFAULT_CURRENT, JSON.stringify(garbage));
  }
});

test('a stored document with invalid overrides loads and keeps its valid part', async () => {
  const { bindings } = await setup({ bindings: { flat: { keyboard: { flag: ['F2'] }, mouse: { flag: [3] } } } });
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'keyboard', 'flag')], ['KeyF'], 'F2 refused: the keyboard falls back');
  assert.deepEqual([...bindings.inputsFor('classic-2d', 'mouse', 'flag')], [3], 'the mouse override kept');
});

// ---------------------------------------------------------------- change notification

test('the resolver notifies on every override change, from the store\'s own notification', async () => {
  const { bindings, store } = await setup();
  const seen = [];
  const off = bindings.onChange((current) => seen.push(current.flat.keyboard.flag[0]));
  await bindings.bind('classic-2d', 'keyboard', 'flag', 0, 'KeyG');
  await store.set('bindings', { flat: { keyboard: { flag: ['KeyV'] } } });
  off();
  await bindings.reset('classic-2d', 'keyboard');
  assert.deepEqual(seen, ['KeyG', 'KeyV'], 'once per change, none after unsubscribing');
  assert.equal(bindings.actionFor('classic-2d', 'keyboard', 'KeyF'), 'flag');
});

// ---------------------------------------------------------------- help surfaces

test('every help surface shows a rebinding from its next update', async () => {
  const { bindings } = await setup();
  assert.match(helpListHtml('classic-2d', 'keyboard', GLYPHS.xbox, 'fly', bindings), /<dt class="ui-controls__key">F<\/dt><dd class="ui-controls__action">Flag under the cursor<\/dd>/, 'the defaults first');
  await bindings.bind('classic-2d', 'keyboard', 'flag', 0, 'KeyG');
  await bindings.bind('classic-2d', 'controller', 'reveal', 0, BTN.LB);
  await bindings.bind('3d', 'keyboard', 'aimThrough', 0, 'KeyV');
  await bindings.bind('3d', 'mouse', 'reveal', 0, 1);
  assert.match(bindingsHtml('classic-2d', 'keyboard', GLYPHS.xbox, 'fly', bindings), /<dt class="ui-controls__key">G<\/dt><dd class="ui-controls__action">Flag<\/dd>/, 'the Settings page\'s list');
  assert.match(helpListHtml('classic-2d', 'keyboard', GLYPHS.xbox, 'fly', bindings), /<dt class="ui-controls__key">G<\/dt><dd class="ui-controls__action">Flag under the cursor<\/dd>/, 'the in-game help');
  assert.match(bindingsHtml('classic-2d', 'controller', GLYPHS.xbox, 'fly', bindings), /<dt class="ui-controls__key">LB \/ RT<\/dt><dd class="ui-controls__action">Reveal<\/dd>/);
  assert.match(helpListHtml('3d', 'keyboard', GLYPHS.xbox, 'fly', bindings), /Hold V<\/dt><dd class="ui-controls__action">Aim through numbers/);
  assert.match(text(readyListHtml('keyboard', GLYPHS.xbox, 'fly', bindings)), /Shift · V · Ctrl/, 'the ready card');
  assert.match(text(hintStripHtml('classic-2d', 'keyboard', GLYPHS.xbox, bindings)), /G flag/, 'the first-use hint strip');
  assert.match(text(hintStripHtml('3d', 'keyboard', GLYPHS.xbox, bindings)), /Middle reveal/);
  assert.equal(hintText('aimHint', 'keyboard', GLYPHS.xbox, bindings), 'Hold V to aim through numbers.', 'the one-time hint');
  // A key hint naming a catalogue action, and the controls reminder.
  assert.deepEqual(keyHintKeys('flag', 'keyboard', GLYPHS.xbox, { mode: 'hexagon', bindings }), [{ text: 'G', pad: false }]);
  assert.deepEqual(keyHintKeys('reveal', 'controller', GLYPHS.xbox, { mode: 'classic-2d', bindings }), [{ text: 'LB', pad: true }, { text: 'RT', pad: true }]);
  assert.deepEqual(keyHintKeys('reveal', 'keyboard', GLYPHS.xbox, { mode: 'classic-2d' }), [{ text: 'Space', pad: false }, { text: 'Enter', pad: false }], 'the defaults without a resolver');
  assert.throws(() => keyHintKeys('chord', 'keyboard', GLYPHS.xbox, { mode: '3d' }), /unknown action/);
  assert.deepEqual(reminderKeys('classic-2d', 'controller', GLYPHS.xbox, bindings)[0], { keys: [{ text: 'LB', pad: true }], label: 'reveal' }, 'the Classic 2D controls reminder');
  assert.deepEqual(reminderKeys('3d', 'keyboard', GLYPHS.xbox, bindings).map((r) => r.keys.map((k) => k.text).join('+')), ['Middle', 'Right', 'Middle+Right'], 'the 3D reminder');
});

test('the shell\'s key hints keep their reserved inputs, whatever the bindings', async () => {
  const { bindings } = await setup();
  await bindings.bind('3d', 'controller', 'reveal', 0, BTN.A);
  for (const [action, keys] of [['back', ['Esc']], ['restart', ['F2']]]) {
    assert.deepEqual(keyHintKeys(action, 'keyboard', GLYPHS.xbox, { mode: '3d', bindings }).map((k) => k.text), keys);
  }
});
