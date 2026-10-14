import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createSettingsStore } from '../js/settings/store.js';
import { SCHEMA, SETTING_KEYS } from '../js/settings/schema.js';
import { GLYPHS } from '../js/gamepad.js';
import { CURSOR_KEYS } from '../js/classic2d/cursor-input.js';
import {
  BINDING_MODES, BINDING_DEVICES, TOUCH_DEVICE, bindingDevices, BINDINGS, bindingRows, bindingsListHtml, bindingsHtml,
} from '../js/settings/bindings.js';
import {
  SETTINGS_SECTIONS, SETTING_LABELS, settingControl, settingControlHtml, settingsPageHtml, bindingsSectionHtml,
  bindSettingControls, bindResetPanel, RESET_MESSAGE,
} from '../js/settings/page.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

async function loadedStore(data) {
  const storage = createStorage({ backend: createMemoryBackend() });
  const store = createSettingsStore({ storage, legacy: { get: () => null } });
  await store.load();
  for (const [k, v] of Object.entries(data ?? {})) await store.set(k, v);
  return store;
}

// ---------------------------------------------------------------- the bindings source

test('the bindings source lists each mode\'s bindings for each input device', () => {
  assert.deepEqual(BINDING_MODES.map((m) => m.id), ['classic-2d', '3d']);
  assert.deepEqual(BINDING_DEVICES.map((d) => d.id), ['keyboard', 'controller']);
  for (const mode of BINDING_MODES) {
    for (const device of BINDING_DEVICES) {
      const rows = bindingRows(mode.id, device.id);
      assert.ok(rows.length >= 4, `${mode.id} / ${device.id} has its bindings`);
      for (const row of rows) {
        assert.equal(row.length, 2, 'each row is [input, action]');
        assert.ok(row[0] && row[1], 'neither half is empty');
      }
    }
  }
  assert.equal(bindingRows('3d', 'keyboard'), BINDINGS['3d'].keyboard);
  assert.throws(() => bindingRows('records', 'keyboard'), /unknown/);
  assert.throws(() => bindingRows('classic-2d', 'touch'), /unknown/, 'Classic 2D lists no touch rows');
});

test('3D lists a touch device\'s rows: the stick, the look drag, tap, long-press, two-finger tap, pinch and the toolbar\'s three modes', () => {
  assert.deepEqual(TOUCH_DEVICE, { id: 'touch', label: 'Touch' });
  assert.deepEqual(bindingDevices('3d').map((d) => d.id), ['keyboard', 'controller', 'touch']);
  assert.deepEqual(bindingDevices('classic-2d').map((d) => d.id), ['keyboard', 'controller']);
  const rows = bindingRows('3d', 'touch');
  assert.equal(rows, BINDINGS['3d'].touch);
  const row = (input) => rows.find(([i]) => i === input);
  assert.match(row('Left thumb: stick')[1], /^Fly/);
  assert.match(row('Right half: drag')[1], /Look around/);
  assert.match(row('Tap')[1], /Reveal the aimed cube/);
  assert.match(row('Long-press')[1], /Flag \/ unflag/);
  assert.match(row('Two-finger tap')[1], /Chord/);
  assert.match(row('Pinch')[1], /spacing/);
  assert.match(row('Shift button')[1], /neighbours/);
  assert.match(row('Space button')[1], /[Aa]im through/);
  assert.match(row('Ctrl button')[1], /hidden cells/);
  assert.match(row('Pause button')[1], /Pause/);
  const orbit = bindingRows('3d', 'touch', 'orbit');
  const orow = (input) => orbit.find(([i]) => i === input);
  assert.match(orow('Right half: drag')[1], /[Rr]otate around the board/);
  assert.match(orow('Left thumb: stick ↑ ↓')[1], /[Mm]ove in \/ out/);
  assert.equal(orow('Left thumb: stick'), undefined);
  assert.deepEqual(orow('Pinch'), row('Pinch'), 'pinch changes the spacing in both cameras');
  assert.deepEqual(orow('Tap'), row('Tap'));
  const section = bindingsSectionHtml(GLYPHS.xbox);
  assert.ok(section.includes('3D · Touch'), 'the Settings page lists them');
  assert.ok(section.includes(bindingsListHtml(rows, GLYPHS.xbox)));
  assert.ok(!section.includes('Classic 2D · Touch'));
  const ui = read('js/ui.js');
  assert.match(ui, /_bindDevice\(mode\)/, 'the help surfaces show the touch rows on a touch device');
});

test('the Classic 2D keyboard bindings name every key the cursor input acts on', () => {
  const text = bindingRows('classic-2d', 'keyboard').map((r) => r[0]).join(' ');
  const names = { Space: 'Space', Enter: 'Enter', KeyF: 'F', KeyD: 'D' };
  for (const [code, name] of Object.entries(names)) {
    assert.ok(code in CURSOR_KEYS, `${code} is a cursor key`);
    assert.ok(text.includes(`[${name}]`), `the bindings show ${name}`);
  }
});

test('the 3D keyboard bindings name Home and R, which return the camera to the start view', () => {
  const rows = bindingRows('3d', 'keyboard').filter(([input]) => input.includes('[Home]'));
  assert.equal(rows.length, 1, 'one row');
  assert.match(rows[0][0], /^\[Home\] \/ \[R\]$/);
  assert.match(rows[0][1], /[Bb]ack to the start view/);
  assert.equal(bindingRows('classic-2d', 'keyboard').some(([input]) => input.includes('[Home]')), false, 'not in Classic 2D');
});

test('both modes list F2 as Restart on the keyboard and Start + Y on the controller', () => {
  for (const mode of BINDING_MODES) {
    const key = bindingRows(mode.id, 'keyboard').find(([input]) => input === '[F2]');
    assert.ok(key, `${mode.id} keyboard lists F2`);
    assert.match(key[1], /^Restart/);
    const pad = bindingRows(mode.id, 'controller').find(([input]) => input === '{start} + {y}');
    assert.ok(pad, `${mode.id} controller lists Start + Y`);
    assert.match(pad[1], /^Restart/);
  }
  assert.match(bindingsHtml('classic-2d', 'controller', GLYPHS.xbox), /<kbd class="pad">Menu<\/kbd> \+ <kbd class="pad">Y<\/kbd>/);
  const html = bindingsSectionHtml(GLYPHS.xbox);
  assert.equal(html.match(/<kbd>F2<\/kbd>/g).length, 2, 'the Settings bindings section shows F2 for both modes');
});

test('the "Always ask before restarting" toggle sits in the Controls section, off by default', () => {
  assert.match(SETTING_LABELS.confirmRestart, /^Always ask before restarting/);
  const c = settingControl('confirmRestart');
  assert.equal(c.kind, 'toggle');
  assert.equal(c.inverted, undefined, 'on while the setting is on');
  const html = settingsPageHtml();
  const controls = html.slice(html.indexOf('id="set-sec-controls"'), html.indexOf('id="set-sec-graphics"'));
  assert.match(controls, /<label class="ui-toggle" data-setting="confirmRestart"><input type="checkbox" role="switch" id="set-confirmRestart" class="ui-toggle__input"><span class="ui-toggle__label">Always ask before restarting<\/span><\/label>/);
});

test('the 3D neighbour count is a toggle in the Graphics section, on by default', () => {
  assert.equal(SETTING_LABELS.aimReadout, '3D neighbour count');
  const c = settingControl('aimReadout');
  assert.equal(c.kind, 'toggle');
  assert.equal(c.inverted, undefined, 'on while the setting is on');
  const html = settingsPageHtml();
  const graphics = html.slice(html.indexOf('id="set-sec-graphics"'), html.indexOf('id="set-sec-theme"'));
  assert.match(graphics, /<label class="ui-toggle" data-setting="aimReadout"><input type="checkbox" role="switch" id="set-aimReadout" class="ui-toggle__input" checked><span class="ui-toggle__label">3D neighbour count<\/span><\/label>/);
});

test('the field of view is a degree slider in the Graphics section, 45 to 90 in steps of 1, at 60 by default', () => {
  assert.equal(SETTING_LABELS.fieldOfView, 'Field of view');
  const c = settingControl('fieldOfView');
  assert.equal(c.kind, 'slider');
  assert.deepEqual([c.min, c.max, c.step], [45, 90, 1]);
  const html = settingsPageHtml();
  const graphics = html.slice(html.indexOf('id="set-sec-graphics"'), html.indexOf('id="set-sec-theme"'));
  assert.match(graphics, /<div class="ui-slider" data-setting="fieldOfView"><label class="ui-slider__label" for="set-fieldOfView">Field of view<\/label><output class="ui-slider__value" id="set-fieldOfView-val" for="set-fieldOfView">60°<\/output><input type="range" id="set-fieldOfView" class="ui-slider__input" min="45" max="90" step="1" value="60" data-format="number" data-unit="°"><\/div>/);
});

test('the 3D keyboard bindings name X, the spacing toggle, and say that forward follows the view and the wheel carries the camera', () => {
  const rows = bindingRows('3d', 'keyboard');
  const x = rows.find(([input]) => input === '[X]');
  assert.deepEqual([...x], ['[X]', 'Toggle spacing 1.1 / 2.0']);
  const wasd = rows.find(([input]) => input === '[W][A][S][D]');
  assert.match(wasd[1], /forward follows the view/);
  const wheel = rows.find(([input]) => input === 'Wheel');
  assert.match(wheel[1], /spacing/);
  assert.match(wheel[1], /camera/);
  assert.equal(bindingRows('classic-2d', 'keyboard').some(([input]) => input === '[X]'), false, 'not in Classic 2D');
});

test('the 3D keyboard bindings list keyboard look on the arrows and Enter, \' and Enter + \' as reveal, flag and chord on release', () => {
  const rows = bindingRows('3d', 'keyboard');
  const row = (input) => rows.find(([i]) => i === input);
  assert.deepEqual([...row('Arrow keys')], ['Arrow keys', 'Look around']);
  assert.deepEqual([...row('[Enter]')], ['[Enter]', 'Reveal the aimed cube (on release)']);
  assert.deepEqual([...row('[\']')], ['[\']', 'Flag / unflag (on release)']);
  assert.deepEqual([...row('[Enter] + [\']')], ['[Enter] + [\']', 'Chord']);
  assert.ok(rows.indexOf(row('Arrow keys')) === rows.indexOf(row('Mouse')) + 1, 'beside mouse look');
  const html = bindingsHtml('3d', 'keyboard');
  assert.match(html, /<dt><kbd>Enter<\/kbd> \+ <kbd>'<\/kbd><\/dt><dd>Chord<\/dd>/);
  assert.match(bindingsSectionHtml(GLYPHS.xbox), /<dt>Arrow keys<\/dt><dd>Look around<\/dd>/, 'the Settings page lists them');
});

test('the Camera setting is a Fly | Orbit choice in the Controls section, after look sensitivity and invert Y', () => {
  assert.equal(SETTING_LABELS.camera, 'Camera');
  const c = settingControl('camera');
  assert.equal(c.kind, 'segmented');
  assert.deepEqual(c.options, [{ value: 'fly', label: 'Fly' }, { value: 'orbit', label: 'Orbit' }]);
  const html = settingsPageHtml();
  const controls = html.slice(html.indexOf('id="set-sec-controls"'), html.indexOf('id="set-sec-graphics"'));
  assert.ok(controls.includes(settingControlHtml('camera')), 'generated from the schema');
  assert.match(controls, /<button type="button" role="radio" aria-checked="true" class="ui-segmented__option" data-value="fly">Fly<\/button><button type="button" role="radio" aria-checked="false" class="ui-segmented__option" data-value="orbit">Orbit<\/button>/);
  const at = (k) => controls.indexOf(`data-setting="${k}"`);
  assert.ok(at('lookSensitivity') < at('camera') && at('invertY') < at('camera') && at('camera') < at('confirmRestart'));
});

test('the 3D bindings follow the Camera setting: Orbit rotates, dollies and leaves Q / E unused, from the one table', () => {
  assert.equal(bindingRows('3d', 'keyboard', 'fly'), BINDINGS['3d'].keyboard, 'Fly is the default rows');
  assert.equal(bindingRows('3d', 'keyboard'), bindingRows('3d', 'keyboard', 'fly'));
  const kb = bindingRows('3d', 'keyboard', 'orbit');
  const row = (rows, input) => rows.find(([i]) => i === input);
  assert.match(row(kb, 'Mouse')[1], /[Rr]otate around the board/);
  assert.match(row(kb, 'Arrow keys')[1], /[Rr]otate around the board/);
  assert.match(row(kb, '[A] [D]')[1], /[Rr]otate/);
  assert.match(row(kb, '[W] [S]')[1], /[Mm]ove in \/ out/);
  assert.match(row(kb, 'Wheel')[1], /[Mm]ove in \/ out/);
  assert.match(row(kb, '[Q] [E]')[1], /[Uu]nused/);
  assert.equal(row(kb, '[W][A][S][D]'), undefined, 'no flight row');
  assert.match(row(kb, '[X]')[1], /spacing/, 'spacing stays on X');
  for (const input of ['Left click', 'Right click', '[Enter]', "[']", '[Home] / [R]', 'Hold [Shift]', '[F2]']) {
    assert.deepEqual(row(kb, input), row(bindingRows('3d', 'keyboard'), input), `${input} as in Fly`);
  }
  const pad = bindingRows('3d', 'controller', 'orbit');
  assert.match(row(pad, 'Right stick')[1], /[Rr]otate around the board/);
  assert.match(row(pad, 'Left stick ↑ ↓')[1], /[Mm]ove in \/ out/);
  assert.equal(row(pad, 'Left / right stick'), undefined);
  assert.equal(row(pad, '{a} / {b}'), undefined, 'A / B unused');
  assert.deepEqual(row(pad, '{rt} / {lt}'), row(bindingRows('3d', 'controller'), '{rt} / {lt}'), 'the triggers act as in Fly');
  assert.match(row(pad, 'D-pad ↑ ↓')[1], /spacing/);
  assert.equal(bindingRows('classic-2d', 'keyboard', 'orbit'), bindingRows('classic-2d', 'keyboard'), 'Classic 2D has no camera');
  assert.throws(() => bindingRows('3d', 'keyboard', 'free'), /unknown/);
  assert.equal(bindingsHtml('3d', 'keyboard', GLYPHS.generic, 'orbit'), bindingsListHtml(kb, GLYPHS.generic));
  const section = bindingsSectionHtml(GLYPHS.xbox, 'orbit');
  assert.ok(section.includes(bindingsListHtml(kb, GLYPHS.xbox)), 'the Settings page lists the chosen camera\'s rows');
  assert.ok(!section.includes('Fly forward'));
  const ui = read('js/ui.js');
  assert.match(ui, /setCamera\(camera\)/, 'the help surfaces follow the setting');
  assert.match(ui, /bindingsSectionHtml\(this\._glyphs, this\._camera\)/);
  const index = read('index.html');
  const ready = index.slice(index.indexOf('<span class="ready-keys">'), index.indexOf('<span id="ready-pad"'));
  assert.match(ready, /data-camera="fly"/);
  assert.match(ready, /<span data-camera="orbit" class="hidden">/, 'the ready card\'s Orbit movement line, hidden in Fly');
});

test('the 3D bindings say what a right-click and {lt} on a number do, and that a second one takes back only those flags', () => {
  const right = bindingRows('3d', 'keyboard').find(([input]) => input === 'Right click');
  assert.deepEqual([...right], ['Right click', 'Flag / unflag. On a number: flag all its closed neighbours; right-click it again to take back only those flags']);
  const lt = bindingRows('3d', 'controller').find(([input]) => input === '{lt} on a number');
  assert.deepEqual([...lt], ['{lt} on a number', 'Flag all its closed neighbours; {lt} on it again takes back only those flags']);
  assert.ok(bindingRows('3d', 'controller').findIndex((r) => r === lt) > bindingRows('3d', 'controller').findIndex(([input]) => input === '{rt} / {lt}'), 'after the flag button\'s own row');
});

test('bindingsListHtml renders keys as <kbd>, controller buttons as the pad\'s glyphs, and escapes text', () => {
  const html = bindingsListHtml([['[W][A] then Left & right', 'Fly <fast>'], ['{rt} / {lt}', 'Reveal with {a}']], GLYPHS.playstation);
  assert.equal(html,
    '<dt><kbd>W</kbd><kbd>A</kbd> then Left &amp; right</dt><dd>Fly &lt;fast&gt;</dd>'
    + '<dt><kbd class="pad">R2</kbd> / <kbd class="pad">L2</kbd></dt><dd>Reveal with <kbd class="pad">✕</kbd></dd>');
  assert.match(bindingsListHtml([['{a}', 'x']]), /<kbd class="pad">A<\/kbd>/, 'generic glyphs by default');
});

test('the in-game help reads the same bindings source', () => {
  const index = read('index.html');
  const help = index.slice(index.indexOf('<aside id="help"'), index.indexOf('</aside>'));
  assert.match(help, /<dl class="controls"><\/dl>/, 'the help list is filled from the bindings source, not written in the markup');
  const ui = read('js/ui.js');
  assert.match(ui, /from '\.\/settings\/bindings\.js'/);
  assert.match(ui, /bindingsHtml\(this\._mode, this\._bindDevice\(this\._mode\), this\._glyphs, this\._camera\)/, 'the help panel shows the active mode\'s rows for the active device (touch on a touch device) and camera');
  assert.equal(bindingsHtml('3d', 'controller', GLYPHS.xbox), bindingsListHtml(bindingRows('3d', 'controller'), GLYPHS.xbox), 'the component is the source\'s rows');
});

// ---------------------------------------------------------------- the page, generated from the schema

test('the page has the controls, graphics, theme and audio sections, holding every setting once', () => {
  assert.deepEqual(SETTINGS_SECTIONS.map((s) => s.title), ['Controls', 'Graphics', 'Theme', 'Audio']);
  assert.deepEqual(SETTINGS_SECTIONS.map((s) => s.settings), [
    ['lookSensitivity', 'invertY', 'camera', 'confirmRestart'], ['fullscreen', 'renderResolution', 'boardScale', 'aimReadout', 'fieldOfView'], ['theme'], ['muted', 'volume'],
  ]);
  assert.deepEqual(SETTINGS_SECTIONS.flatMap((s) => s.settings).sort(), [...SETTING_KEYS].sort(), 'every schema entry has its control');
  for (const key of SETTING_KEYS) assert.ok(SETTING_LABELS[key], `${key} has a label`);
});

test('the audio on/off control reads Sound and comes before Volume; no Mute label remains', () => {
  assert.equal(SETTING_LABELS.muted, 'Sound');
  assert.equal(SETTING_LABELS.volume, 'Volume');
  assert.ok(!Object.values(SETTING_LABELS).includes('Mute'));
  const html = settingsPageHtml();
  assert.ok(html.indexOf('data-setting="muted"') < html.indexOf('data-setting="volume"'), 'Sound first, then Volume');
  assert.doesNotMatch(html, />Mute</);
  assert.doesNotMatch(read('index.html'), />Mute</, 'nor anywhere in the shell markup');
});

test('the Sound toggle shows on while sound plays: on is not muted', async () => {
  assert.match(settingControlHtml('muted', false), /class="ui-toggle__input" checked>/, 'not muted: on');
  assert.doesNotMatch(settingControlHtml('muted', true), /checked/, 'muted: off');
  assert.doesNotMatch(settingControlHtml('invertY', false), /checked/, 'other toggles show their value');
  assert.equal(SCHEMA.muted.default, false, 'the stored key and its default are unchanged');
  const store = await loadedStore();
  const sound = toggle('muted');
  bindSettingControls([sound.root], store);
  assert.equal(sound.input.checked, true, 'sound plays by default');
  sound.input.checked = false;
  sound.input.fire('change');
  assert.equal(store.get('muted'), true, 'switching Sound off mutes');
  await store.set('muted', false);
  assert.equal(sound.input.checked, true, 'unmuted elsewhere (M): Sound shows on');
});

test('the Theme section says Theme once: its control has no label of its own and is named by the heading', () => {
  const html = settingsPageHtml();
  const theme = html.slice(html.indexOf('id="set-sec-theme"'), html.indexOf('</section>', html.indexOf('id="set-sec-theme"')));
  assert.equal(theme.split('Theme').length - 1, 1, 'one visible Theme');
  assert.match(theme, /<div class="ui-segmented" role="radiogroup" aria-labelledby="set-sec-theme" data-setting="theme" id="set-theme">/);
  for (const s of SETTINGS_SECTIONS.filter((x) => x.id !== 'theme')) {
    for (const key of s.settings) assert.ok(html.includes(settingControlHtml(key)), `${key} keeps its label`);
  }
});

test('each control\'s kind and range come from its schema entry', () => {
  const sens = settingControl('lookSensitivity');
  assert.equal(sens.kind, 'slider');
  assert.deepEqual([sens.min, sens.max, sens.scale], [SCHEMA.lookSensitivity.min, SCHEMA.lookSensitivity.max, 1]);
  const vol = settingControl('volume');
  assert.equal(vol.kind, 'slider');
  assert.deepEqual([vol.min, vol.max, vol.scale, vol.format], [0, 100, 100, 'percent'], 'volume shows as a percentage');
  for (const key of ['invertY', 'fullscreen', 'muted']) assert.equal(settingControl(key).kind, 'toggle');
  assert.equal(settingControl('theme').kind, 'segmented');
  assert.deepEqual(settingControl('theme').options, [{ value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]);
  assert.deepEqual(settingControl('renderResolution').options.map((o) => o.value), SCHEMA.renderResolution.values);
  assert.deepEqual(settingControl('renderResolution').options.map((o) => o.label), ['Auto', 'Sharp', 'Fast']);
  const scale = settingControl('boardScale');
  assert.deepEqual([scale.kind, scale.label], ['segmented', '2D board scale']);
  assert.deepEqual(scale.options, [{ value: 'fit', label: 'Fit' }, { value: '100', label: '100 %' }, { value: '125', label: '125 %' }]);
  assert.throws(() => settingControl('nope'), /unknown/);
});

test('the page markup is kit components only, one bound control per setting', () => {
  const html = settingsPageHtml();
  for (const key of SETTING_KEYS) {
    assert.equal([...html.matchAll(new RegExp(`data-setting="${key}"`, 'g'))].length, 1, `${key} appears once`);
    if (key !== 'theme') assert.ok(html.includes(settingControlHtml(key)), `${key} uses its generated control`);
  }
  assert.match(settingControlHtml('lookSensitivity'),
    /^<div class="ui-slider" data-setting="lookSensitivity"><label class="ui-slider__label" for="set-lookSensitivity">[^<]+<\/label><output class="ui-slider__value" id="set-lookSensitivity-val" for="set-lookSensitivity">1\.00×<\/output><input type="range" id="set-lookSensitivity" class="ui-slider__input" min="0\.25" max="3" step="0\.05" value="1" data-format="multiplier"><\/div>$/);
  assert.match(settingControlHtml('volume'), /min="0" max="100" step="1" value="70" data-format="percent" data-scale="100"/);
  assert.match(settingControlHtml('invertY'),
    /^<label class="ui-toggle" data-setting="invertY"><input type="checkbox" role="switch" id="set-invertY" class="ui-toggle__input"><span class="ui-toggle__label">[^<]+<\/span><\/label>$/);
  const theme = settingControlHtml('theme');
  assert.match(theme, /<div class="ui-segmented" role="radiogroup" aria-labelledby="set-theme-label" data-setting="theme" id="set-theme">/);
  assert.match(theme, /<button type="button" role="radio" aria-checked="true" class="ui-segmented__option" data-value="light">Light<\/button>/);
  assert.match(theme, /<button type="button" role="radio" aria-checked="false" class="ui-segmented__option" data-value="dark">Dark<\/button>/);
  const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden', `kit class only (and the shell's hidden), got ${c}`);
  for (const s of SETTINGS_SECTIONS) assert.match(html, new RegExp(`<h3 class="ui-heading" id="set-sec-${s.id}">${s.title}</h3>`));
});

test('the bindings section shows each mode per input device with the pad\'s glyphs', () => {
  const html = bindingsSectionHtml(GLYPHS.xbox);
  for (const mode of BINDING_MODES) {
    for (const device of BINDING_DEVICES) {
      assert.ok(html.includes(`${mode.label} · ${device.label}`), `${mode.label} / ${device.label} heading`);
      assert.ok(html.includes(bindingsListHtml(bindingRows(mode.id, device.id), GLYPHS.xbox)), `${mode.id} / ${device.id} list`);
    }
  }
  assert.ok(bindingsSectionHtml(GLYPHS.playstation).includes('<kbd class="pad">R2</kbd>'), 'the glyphs follow the controller');
});

// ---------------------------------------------------------------- the column layout

test('the page is one column composition generated from the sections: each section a column, Bindings and Data across the width', () => {
  const html = settingsPageHtml();
  assert.ok(html.startsWith('<div class="ui-columns">'), 'the kit column composition');
  assert.ok(html.endsWith('</section></div>'), 'everything inside it');
  const sections = [...html.matchAll(/<section class="([^"]*)"[^>]*aria-labelledby="set-sec-(\w+)"/g)].map((m) => [m[2], m[1]]);
  assert.deepEqual(sections.map(([id]) => id), [...SETTINGS_SECTIONS.map((s) => s.id), 'bindings', 'data'], 'in the schema\'s order');
  for (const [id, cls] of sections) {
    const spans = cls.split(' ').includes('ui-columns__span');
    assert.equal(spans, id === 'bindings' || id === 'data', `${id}: ${cls}`);
  }
  assert.match(html, /<div id="settings-bindings" class="ui-columns"><\/div>/, 'the mode × device lists side by side in columns');
  assert.doesNotMatch(html, /ui-grid/, 'one composition, not two');
  assert.doesNotMatch(read('js/settings/page.js'), /@media|1024/, 'no layout code of its own');
});

// ---------------------------------------------------------------- the Data panel and Reset all data

test('the page ends, after Bindings, with a Data panel: one line and a "Reset all data…" kit button', () => {
  const html = settingsPageHtml();
  const bindings = html.indexOf('id="set-sec-bindings"');
  const data = html.indexOf('id="set-sec-data"');
  assert.ok(bindings > 0 && data > bindings, 'Data comes after Bindings');
  const panel = html.slice(html.lastIndexOf('<section', data));
  assert.match(panel, /^<section class="ui-panel ui-actions ui-columns__span" id="settings-data" aria-labelledby="set-sec-data"><h3 class="ui-heading" id="set-sec-data">Data<\/h3>/);
  assert.match(panel, /<p class="ui-text ui-text--muted">[^<]*this browser[^<]*<\/p>/, 'one line saying what the action does');
  assert.match(panel, /<button type="button" class="ui-button ui-button--secondary" id="set-reset">Reset all data…<\/button>/);
  assert.match(panel, /<p class="ui-text ui-text--warning hidden" id="set-reset-note" role="status"><\/p>/);
  assert.ok(panel.trimEnd().endsWith('</section></div>'), 'the page ends with it, closing the column composition');
  assert.doesNotMatch(panel, /export/i, 'no export control or wording yet (W-31)');
});

test('the confirmation names every kind of data that goes, says it cannot be undone, and offers Reset all data and Cancel', () => {
  for (const kind of ['records', 'game history', 'replays', 'settings', 'last board choices', 'first-use hints']) {
    assert.ok(RESET_MESSAGE.includes(kind), `the message names ${kind}`);
  }
  assert.match(RESET_MESSAGE, /from this browser/);
  assert.match(RESET_MESSAGE, /cannot be undone/);
  assert.doesNotMatch(RESET_MESSAGE, /export|loss/i);
  const html = settingsPageHtml();
  const confirm = html.slice(html.indexOf('id="set-reset-confirm"') - 60);
  assert.match(confirm, /<div class="ui-panel ui-actions hidden" id="set-reset-confirm" role="alertdialog" aria-labelledby="set-reset-text">/);
  assert.ok(confirm.includes(`<p class="ui-text" id="set-reset-text">${RESET_MESSAGE}</p>`));
  assert.match(confirm, /<button type="button" class="ui-button ui-button--primary" id="set-reset-yes">Reset all data<\/button>/);
  assert.match(confirm, /<button type="button" class="ui-button ui-button--secondary" id="set-reset-no">Cancel<\/button>/);
});

// A fake element with a class list and focus, for the Data panel's binder.
function panelFake() {
  let focused = null;
  const el = (id, cls = '') => {
    const classes = new Set(cls.split(' ').filter(Boolean));
    const listeners = {};
    return {
      id,
      textContent: '',
      disabled: false,
      classList: {
        contains: (c) => classes.has(c),
        toggle: (c, on) => { if (on ?? !classes.has(c)) classes.add(c); else classes.delete(c); },
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
      },
      addEventListener: (t, f) => { (listeners[t] ??= []).push(f); },
      focus() { focused = id; },
      click() { for (const f of listeners.click ?? []) f({ type: 'click', target: this }); },
      get hidden() { return classes.has('hidden'); },
    };
  };
  const els = {
    open: el('set-reset'), panel: el('set-reset-confirm', 'hidden'), yes: el('set-reset-yes'), no: el('set-reset-no'),
    note: el('set-reset-note', 'hidden'),
  };
  return { els, focused: () => focused };
}

test('"Reset all data…" opens the confirmation with focus on Cancel; Cancel closes it, changes nothing, and focus returns', async () => {
  const { els, focused } = panelFake();
  let runs = 0;
  const panel = bindResetPanel(els, { reset: async () => { runs++; return { ok: true }; } });
  assert.equal(panel.isOpen(), false);
  els.open.click();
  assert.equal(panel.isOpen(), true);
  assert.equal(els.panel.hidden, false);
  assert.equal(els.open.hidden, true, 'the confirmation shows in place of the button');
  assert.equal(focused(), 'set-reset-no', 'focus moves to Cancel');
  els.no.click();
  assert.equal(panel.isOpen(), false);
  assert.equal(els.panel.hidden, true);
  assert.equal(els.open.hidden, false);
  assert.equal(focused(), 'set-reset', 'focus returns to Reset all data…');
  assert.equal(runs, 0, 'Cancel changes nothing');
});

test('Back (close) closes the open confirmation first and returns focus; with none open it does nothing', () => {
  const { els, focused } = panelFake();
  const panel = bindResetPanel(els, { reset: async () => ({ ok: true }) });
  assert.equal(panel.close(), false, 'nothing to close: Back goes on to leave the page');
  els.open.click();
  assert.equal(panel.close(), true);
  assert.equal(panel.isOpen(), false);
  assert.equal(focused(), 'set-reset');
  els.open.click();
  panel.clear(); // leaving the page
  assert.equal(panel.isOpen(), false);
  assert.equal(els.note.hidden, true);
});

test('confirming runs the reset once; a failure replaces the confirmation with the warning and the action stays', async () => {
  const { els, focused } = panelFake();
  const results = [{ ok: false, failed: ['replays'], message: 'Replays could not be deleted. The rest was deleted.' }, { ok: true }];
  let runs = 0;
  const panel = bindResetPanel(els, { reset: async () => results[runs++] });
  els.open.click();
  els.yes.click();
  els.yes.click(); // a second press while it runs does nothing
  await tick();
  assert.equal(runs, 1);
  assert.equal(panel.isOpen(), false);
  assert.equal(els.note.hidden, false);
  assert.equal(els.note.textContent, 'Replays could not be deleted. The rest was deleted.');
  assert.equal(els.open.hidden, false, 'the action stays available');
  assert.equal(els.open.disabled, false);
  assert.equal(focused(), 'set-reset');
  els.open.click(); // try again
  assert.equal(els.note.hidden, true);
  els.yes.click();
  await tick();
  assert.equal(runs, 2);
});

test('a reset that throws is said as a failure, never left hanging', async () => {
  const { els } = panelFake();
  const panel = bindResetPanel(els, { reset: async () => { throw new Error('boom'); } });
  els.open.click();
  els.yes.click();
  await tick();
  assert.equal(panel.isOpen(), false);
  assert.equal(els.note.hidden, false);
  assert.match(els.note.textContent, /could not be deleted/);
});

test('the shell wires the reset: the replay library\'s load awaited, the reload flagged, Back closes the confirmation first', () => {
  const MAIN = read('js/main.js');
  assert.match(MAIN, /import \{ createReset \} from '\.\/settings\/reset\.js';/);
  const wiring = MAIN.slice(MAIN.indexOf('const RESET = createReset('));
  assert.match(wiring, /^const RESET = createReset\(\{\s*storage,\s*blobStore,/);
  assert.match(wiring.split('});')[0], /waitFor: async \(\) => \{ await REPLAYS\.load\(\); await REPLAYS\.settled\(\); \}/);
  assert.match(wiring.split('});')[0], /reload: \(\) => \{ reloading = true; location\.reload\(\); \}/);
  assert.match(MAIN, /onResetAll: \(\) => RESET\.run\(\)/);
  for (const fn of ['shellBack', 'historyBack']) {
    const body = MAIN.slice(MAIN.indexOf(`function ${fn}(`));
    assert.match(body.slice(0, body.indexOf('\n}')), /ui\.closeControls\(\) \|\| ui\.closeConfirm\(\) \|\| ui\.closeResetConfirm\(\)/, fn);
  }
  const UI = read('js/ui.js');
  assert.match(UI, /bindResetPanel\(/);
  assert.match(UI, /closeResetConfirm\(\)/);
});

// ---------------------------------------------------------------- binding to the store, on fakes

class FakeEl {
  constructor(attrs = {}, children = []) {
    this.attrs = { ...attrs };
    this.listeners = {};
    this.children = children;
    this.textContent = '';
    this.value = attrs.value ?? '';
    this.checked = false;
    this.disabled = false;
    this.tabIndex = 0;
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] ?? []).filter((x) => x !== f); }
  fire(t, ev = {}) { for (const f of this.listeners[t] ?? []) f({ type: t, target: this, preventDefault() {}, ...ev }); }
  dispatchEvent() { return true; }
  focus() {}
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const cls = sel.replace(/^\./, '');
    const all = [];
    const walk = (e) => { for (const c of e.children) { if ((c.attrs.class ?? '').split(' ').includes(cls)) all.push(c); walk(c); } };
    walk(this);
    return all;
  }
}

const slider = (key, attrs) => {
  const input = new FakeEl({ class: 'ui-slider__input', ...attrs });
  const output = new FakeEl({ class: 'ui-slider__value' });
  return { root: new FakeEl({ class: 'ui-slider', 'data-setting': key }, [input, output]), input, output };
};
const toggle = (key) => {
  const input = new FakeEl({ class: 'ui-toggle__input', type: 'checkbox' });
  return { root: new FakeEl({ class: 'ui-toggle', 'data-setting': key }, [input]), input };
};
const segmented = (key, values) => {
  const options = values.map((v) => new FakeEl({ class: 'ui-segmented__option', 'data-value': v, 'aria-checked': 'false' }));
  return { root: new FakeEl({ class: 'ui-segmented', 'data-setting': key }, options), options };
};

test('bound controls show the store\'s values, also the loaded ones', async () => {
  const store = await loadedStore({ lookSensitivity: 1.5, invertY: true, volume: 0.25, theme: 'dark' });
  const sens = slider('lookSensitivity', { step: '0.05', 'data-format': 'multiplier' });
  const vol = slider('volume', { step: '1', max: '100', 'data-format': 'percent', 'data-scale': '100' });
  const inv = toggle('invertY');
  const theme = segmented('theme', ['light', 'dark']);
  bindSettingControls([sens.root, vol.root, inv.root, theme.root], store);
  assert.equal(sens.input.value, '1.5');
  assert.equal(sens.output.textContent, '1.50×');
  assert.equal(vol.input.value, '25');
  assert.equal(vol.output.textContent, '25%');
  assert.equal(inv.input.checked, true);
  assert.deepEqual(theme.options.map((o) => [o.attrs['aria-checked'], o.tabIndex]), [['false', -1], ['true', 0]]);

  // A change made elsewhere (the pause card, F, M) shows at once.
  await store.set('volume', 0.5);
  await store.set('theme', 'light');
  await store.set('invertY', false);
  assert.equal(vol.input.value, '50');
  assert.equal(vol.output.textContent, '50%');
  assert.deepEqual(theme.options.map((o) => o.attrs['aria-checked']), ['true', 'false']);
  assert.equal(inv.input.checked, false);
});

test('a bound control writes the store at once, and reports the player\'s change', async () => {
  const store = await loadedStore();
  const changed = [];
  const sens = slider('lookSensitivity', { step: '0.05', 'data-format': 'multiplier' });
  const vol = slider('volume', { step: '1', max: '100', 'data-format': 'percent', 'data-scale': '100' });
  const full = toggle('fullscreen');
  const res = segmented('renderResolution', ['auto', 'sharp', 'fast']);
  const unbind = bindSettingControls([sens.root, vol.root, full.root, res.root], store, { onUserChange: (k) => changed.push(k) });

  sens.input.value = '2.25';
  sens.input.fire('input');
  assert.equal(store.get('lookSensitivity'), 2.25);
  assert.equal(sens.output.textContent, '2.25×');
  vol.input.value = '33';
  vol.input.fire('input');
  assert.equal(store.get('volume'), 0.33);
  full.input.checked = true;
  full.input.fire('change');
  assert.equal(store.get('fullscreen'), true);
  res.options[2].fire('click');
  assert.equal(store.get('renderResolution'), 'fast');
  assert.deepEqual(changed, ['lookSensitivity', 'volume', 'fullscreen', 'renderResolution']);

  unbind();
  vol.input.value = '90';
  vol.input.fire('input');
  assert.equal(store.get('volume'), 0.33, 'unbind stops writes');
  await store.set('volume', 0.8);
  await tick();
  assert.equal(vol.input.value, '90', 'and stops following the store');
});

test('bindSettingControls refuses a control for an unknown setting', async () => {
  const store = await loadedStore();
  assert.throws(() => bindSettingControls([toggle('nope').root], store), /unknown/);
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('index.html holds the Settings page as a kit card with a Back button, filled from the schema', () => {
  const page = between(INDEX, '<!-- Settings -->', '<!-- Pause / end menu -->');
  assert.match(page, /<section id="settings" class="overlay hidden" aria-label="Settings">/);
  assert.match(page, /class="ui-card ui-screen ui-screen--wide ui-screen--columns" aria-labelledby="settings-title"/);
  assert.match(page, /<div id="settings-body"><\/div>/, 'the controls are generated, not written in the markup');
  assert.match(page, /<button type="button" id="settings-back" class="ui-button ui-button--primary">Back<\/button>/);
  assert.match(read('js/ui.js'), /settingsPageHtml\(\)/);
});

test('Settings\' Back sits in a sticky action row at the bottom of the card\'s scroll area', () => {
  const page = between(INDEX, '<!-- Settings -->', '<!-- Pause / end menu -->');
  assert.match(page, /<div id="settings-actions" class="ui-actions ui-actions--row">\s*<button type="button" id="settings-back"/,
    'one Back, in the action row');
  assert.ok(page.indexOf('id="settings-actions"') > page.indexOf('id="settings-body"'), 'the row comes after the controls');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const rule = css.match(/#settings-actions\s*\{([^}]*)\}/);
  assert.ok(rule, 'css/style.css styles the row');
  assert.match(rule[1], /position:\s*sticky/);
  assert.match(rule[1], /bottom:\s*0/);
  assert.match(rule[1], /background:\s*var\(--color-surface-raised\)/, 'an opaque surface: the controls scroll under it');
  assert.match(css, /#settings\s*\{[^}]*scroll-padding-bottom:/, 'a focus move scrolls a control into view above the row');
});

test('the Settings choices and the Controls panel\'s tabs take only Left and Right, so Up and Down move focus', () => {
  assert.match(read('js/settings/page.js'), /bindSegmented\(root, \{\s*horizontal: true,/);
  assert.match(read('js/ui.js'), /bindSegmented\(\$\('controls-tabs'\), \{ horizontal: true,/);
});

test('the pause card\'s sensitivity, invert Y and volume, and the menu\'s volume, are bound to the store', () => {
  const pause = between(INDEX, '<section id="pause"', '<noscript>');
  assert.match(pause, /<div class="ui-slider" data-setting="lookSensitivity">/);
  assert.match(pause, /<label class="ui-toggle" data-setting="invertY">/);
  assert.match(pause, /<div class="ui-slider" data-setting="volume">/);
  assert.match(between(INDEX, '<section id="menu"', '<!-- 3D board choice -->'), /<div class="ui-slider" data-setting="volume">/);
  assert.match(MAIN, /bindSettingControls\(document\.querySelectorAll\('\[data-setting\]'\), SETTINGS/);
  assert.doesNotMatch(MAIN, /onLookSettings|initVolume/, 'no second path between those controls and the store');
  assert.doesNotMatch(read('js/ui.js'), /onLookSettings|initVolume|setLook\(/);
});

test('on the main menu and the pause card, Sound comes first, then Volume, and M still toggles it', () => {
  const menu = between(INDEX, '<section id="menu"', '<!-- 3D board choice -->');
  assert.match(menu, /<button type="button" id="menu-sound" class="ui-button ui-button--secondary">Sound: on<\/button>/);
  assert.ok(menu.indexOf('id="menu-sound"') < menu.indexOf('data-setting="volume"'), 'menu: Sound, then Volume');
  const pause = between(INDEX, '<section id="pause"', '<noscript>');
  assert.match(pause, /<button type="button" id="p-sound" class="ui-button ui-button--secondary">Sound: on<\/button>/);
  assert.ok(pause.indexOf('id="p-sound"') < pause.indexOf('data-setting="volume"'), 'pause card: Sound, then Volume');
  assert.match(read('js/ui.js'), /\$\('p-sound'\)\.textContent = `Sound: \$\{t\}`/);
  assert.match(MAIN, /code === 'KeyM'\) toggleSound\(\)/);
});

test('the main menu\'s Settings entry routes to the page, which declares its focus, Back and controller layer', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /\n\s+settings: \{ defaultFocus: '#set-lookSensitivity', show: /, 'the router has the settings screen');
  assert.doesNotMatch(table.match(/\n\s+settings: \{[^\n]*/)[0], /back:/, 'Back returns to the screen it was opened from');
  assert.match(MAIN, /settings: 'settings'/, 'the controller reaches the page');
  assert.match(MAIN, /BACKDROP_SCREENS = new Set\(\[[^\]]*'settings'/, 'the backdrop shows behind the page');
});

test('the catalogue documents the Settings page', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /Settings page \(index\.html #settings\)[\s\S]*?Default focus: the look sensitivity slider/);
});

// ---------------------------------------------------------------- browser

// A browser without WebGL 2, for a test where 3D is irrelevant: the menu screens keep no 3D backdrop
// redrawing under software rendering. Every canvas refuses a 'webgl2' context; the others are untouched.
function removeWebGL2() {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) { return type === 'webgl2' ? null : getContext.call(this, type, ...rest); };
}

test('in a browser: Settings from the menu, Dark chosen, and Dark applied before the menu shows after a reload', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // The theme on the root at the moment the main menu enters the document.
    await page.addInitScript(() => {
      new MutationObserver((_, obs) => {
        if (!document.getElementById('menu')) return;
        globalThis.__themeAtMenu = document.documentElement.getAttribute('data-theme');
        obs.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const theme = () => ms(() => document.documentElement.getAttribute('data-theme'));
    const setting = (key) => ms((k) => globalThis.__ms.settings.get(k), key);

    assert.equal(await theme(), 'light');
    await page.click('#menu-entry-settings');
    assert.equal(await mode(), 'settings');
    assert.equal(await active(), 'set-lookSensitivity', 'the declared default focus');
    assert.ok(await ms(() => !document.getElementById('settings').classList.contains('hidden')));
    assert.ok(await ms(() => document.getElementById('menu').classList.contains('hidden')));
    const headings = await ms(() => [...document.querySelectorAll('#settings-body h3')].map((h) => h.textContent));
    assert.deepEqual(headings.slice(0, 4), ['Controls', 'Graphics', 'Theme', 'Audio']);
    assert.ok(await ms(() => document.querySelectorAll('#settings-body dl.controls').length) >= 4, 'the bindings lists');

    // Mouse: Dark applies at once.
    await page.click('#set-theme [data-value="dark"]');
    assert.equal(await theme(), 'dark');
    assert.equal(await setting('theme'), 'dark');

    // Keyboard: arrows on the slider and the segmented choice, Space on a toggle.
    await page.focus('#set-lookSensitivity');
    await page.keyboard.press('ArrowRight');
    assert.equal(await setting('lookSensitivity'), 1.05);
    await page.focus('#set-renderResolution [data-value="auto"]');
    await page.keyboard.press('ArrowRight');
    assert.equal(await setting('renderResolution'), 'sharp');
    await page.focus('#set-muted');
    await page.keyboard.press('Space');
    assert.equal(await setting('muted'), true, 'Sound switched off mutes');
    assert.equal(await ms(() => document.getElementById('set-muted').checked), false, 'and shows off');
    assert.equal(await ms(() => document.getElementById('p-sound').textContent), 'Sound: off', 'as the pause card says');
    assert.equal(await ms(() => document.getElementById('p-invert').checked), false);
    await page.focus('#set-invertY');
    await page.keyboard.press('Space');
    assert.equal(await setting('invertY'), true);
    assert.equal(await ms(() => document.getElementById('p-invert').checked), true, 'the pause card shows the same value');

    // Esc is Back: the menu it was opened from.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    // The Back button too.
    await page.click('#menu-entry-settings');
    await page.click('#settings-back');
    assert.equal(await mode(), 'menu');

    // The pause card's shortcuts read and write the same store.
    await ms(() => { globalThis.__ms.start(9, 9, 1, 10); globalThis.__ms.forcePlay(); globalThis.__ms.pause(); });
    assert.equal(await mode(), 'paused');
    assert.equal(await ms(() => document.getElementById('p-sens').value), '1.05');
    await ms(() => { const s = document.getElementById('p-vol'); s.value = '40'; s.dispatchEvent(new Event('input', { bubbles: true })); });
    assert.equal(await setting('volume'), 0.4);
    assert.equal(await ms(() => document.getElementById('menu-vol').value), '40');
    await ms(() => globalThis.__ms.pauser.toMenu());

    // Reload: Dark is on the root before the menu is in the document.
    await page.waitForFunction(() => { // the saves settle
      const d = JSON.parse(localStorage.getItem('ms3d:doc:settings') ?? 'null')?.data;
      return d?.theme === 'dark' && d?.volume === 0.4;
    }, null, { timeout: patience(5000) });
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await ms(() => globalThis.__themeAtMenu), 'dark', 'Dark before the menu shows');
    assert.equal(await theme(), 'dark');
    assert.equal(await setting('theme'), 'dark');
    assert.equal(await mode(), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the Settings page is operable by controller', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fake standard-mapping controller whose buttons the test presses.
    await page.addInitScript(() => {
      const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
      const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
      navigator.getGamepads = () => [pad];
      globalThis.__pad = { press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
    });
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || document.activeElement?.getAttribute('data-value') || '');
    // The game polls the pad first thing in each animation frame, so a press held through one frame
    // is seen exactly once, short of the auto-repeat delay.
    const frames = (count) => ms((n) => new Promise((r) => { const f = () => (--n ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
    const tap = async (button) => {
      await ms((b) => globalThis.__pad.press(b, true), button);
      await frames(1);
      await ms((b) => globalThis.__pad.press(b, false), button);
      await frames(2);
    };
    const BTN = { A: 0, B: 1, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

    await ms(() => document.getElementById('menu-entry-settings').focus());
    await tap(BTN.A);
    assert.equal(await mode(), 'settings');
    assert.equal(await active(), 'set-lookSensitivity');
    await tap(BTN.RIGHT);
    assert.equal(await ms(() => globalThis.__ms.settings.get('lookSensitivity')), 1.05, 'left/right steps the slider');
    await tap(BTN.DOWN);
    assert.equal(await active(), 'set-invertY');
    await tap(BTN.A);
    assert.equal(await ms(() => globalThis.__ms.settings.get('invertY')), true, 'A switches the toggle');
    await tap(BTN.B);
    assert.equal(await mode(), 'menu', 'B is Back');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, Reset all data turns a played profile back into a new player\'s', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A fixed board: every board seed the session draws is 12345.
    await page.addInitScript(() => {
      const real = crypto.getRandomValues.bind(crypto);
      crypto.getRandomValues = (a) => { if (a instanceof Uint32Array && a.length === 1) { a[0] = 12345; return a; } return real(a); };
    });
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const active = () => ms(() => document.activeElement?.id || '');
    const visible = (id) => ms((i) => !document.getElementById(i).classList.contains('hidden'), id);
    const doc = (name) => ms((n) => JSON.parse(localStorage.getItem(`ms3d:doc:${n}`) ?? 'null'), name);
    const blobCount = () => ms(() => new Promise((resolve) => {
      const req = indexedDB.open('ms3d-blobs');
      req.onerror = () => resolve(-1);
      req.onsuccess = () => {
        const db = req.result;
        const count = db.transaction('blobs').objectStore('blobs').count();
        count.onsuccess = () => { db.close(); resolve(count.result); };
        count.onerror = () => { db.close(); resolve(-1); };
      };
    }));

    // A played profile: a lost Classic 2D game (records, history, a replay, the last mode and board
    // choice), Dark, a changed setting and the old carried-over keys.
    await page.click('#menu-entry-classic-2d');
    if (await page.isChecked('#c2d-noguess')) await page.click('#c2d-noguess');
    await page.click('#c2d-choice [data-size="beginner"]');
    const centres = await ms(() => {
      const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const L = globalThis.__ms.board2D.layout;
      return Array.from({ length: 81 }, (_, c) => ({
        x: r.left + L.offsetX + ((c % 9) + 0.5) * L.tile, y: r.top + L.offsetY + (Math.floor(c / 9) + 0.5) * L.tile,
      }));
    });
    const first = 40;
    const mines = await ms(async (fc) => {
      const { generate } = await import('/js/generation/generate.js');
      const r = generate({ graph: { kind: 'square', width: 9, height: 9 }, mineCount: 10, firstClick: fc, noGuess: false, seed: 12345 });
      return [...r.mines];
    }, first);
    await page.mouse.click(centres[first].x, centres[first].y);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    await page.mouse.click(centres[mines[0]].x, centres[mines[0]].y);
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'results');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'menu');
    await ms(async () => {
      await globalThis.__ms.settings.set('theme', 'dark');
      await globalThis.__ms.settings.set('lookSensitivity', 2);
      await globalThis.__ms.records.settled();
      for (const k of ['ms3d.lookSens', 'ms3d.volume', 'ms3d.muted', 'ms3d.invertY', 'ms3d.hintH.done', 'ms3d.custom']) localStorage.setItem(k, '1');
    });
    await page.waitForFunction(() => document.querySelector('[data-entry][data-last]') !== null);
    assert.ok((await doc('records.history')).data.length >= 1, 'the game is in the history');
    assert.ok(await doc('classic2d.lastChoice'), 'the board choice is kept');
    for (let i = 0; i < 50 && (await blobCount()) !== 1; i++) await page.waitForTimeout(20);
    assert.equal(await blobCount(), 1, 'its replay is kept');

    // The Data panel: open, Cancel, Esc — nothing changes and focus comes back.
    await page.click('#menu-entry-settings');
    assert.equal(await mode(), 'settings');
    assert.equal(await visible('set-reset-confirm'), false);
    await page.click('#set-reset');
    assert.equal(await visible('set-reset-confirm'), true);
    assert.equal(await active(), 'set-reset-no', 'focus moves to Cancel');
    await page.keyboard.press('Enter');
    assert.equal(await visible('set-reset-confirm'), false);
    assert.equal(await active(), 'set-reset', 'focus returns');
    await page.click('#set-reset');
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'settings', 'Esc closes the confirmation first and stays on the page');
    assert.equal(await visible('set-reset-confirm'), false);
    assert.equal(await active(), 'set-reset');
    await page.click('#set-reset');
    await page.goBack();
    assert.equal(await mode(), 'settings', 'the browser\'s Back closes it first too');
    assert.equal(await visible('set-reset-confirm'), false);
    assert.equal(await ms(() => document.documentElement.getAttribute('data-theme')), 'dark', 'nothing changed');
    assert.equal(await blobCount(), 1);

    // Confirm: everything goes and the page reloads into a fresh profile.
    await page.click('#set-reset');
    await Promise.all([page.waitForEvent('load'), page.click('#set-reset-yes')]);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => document.documentElement.getAttribute('data-theme')), 'light');
    assert.equal(await ms(() => globalThis.__ms.settings.get('theme')), 'light');
    assert.equal(await ms(() => globalThis.__ms.settings.get('lookSensitivity')), 1, 'every setting at its default: nothing carried over');
    assert.equal(await ms(() => document.querySelector('[data-entry][data-last]')), null, 'no Last played mark');
    const history = await doc('records.history');
    assert.ok(history === null || history.data.length === 0, 'an empty history');
    assert.equal(await doc('classic2d.lastChoice'), null);
    assert.equal(await doc('shell.lastMode'), null);
    for (const k of ['ms3d.lookSens', 'ms3d.volume', 'ms3d.muted', 'ms3d.invertY', 'ms3d.hintH.done']) {
      assert.equal(await ms((key) => localStorage.getItem(key), k), null, `${k} removed`);
    }
    assert.equal(await ms(() => localStorage.getItem('ms3d.custom')), '1', 'an unread old key stays');
    assert.equal(await blobCount(), 0, 'no replay left');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
