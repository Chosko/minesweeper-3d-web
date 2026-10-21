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
  BINDING_MODES, BINDING_DEVICES, TOUCH_DEVICE, bindingDevices, BINDINGS, HELP_BINDINGS, READY_BINDINGS, bindingRows, helpRows, readyRows,
  bindingsListHtml, bindingsHtml, helpListHtml, readyListHtml,
} from '../js/settings/bindings.js';
import {
  SETTINGS_SECTIONS, SETTINGS_COLUMNS, SETTING_LABELS, SETTING_NOTES, CONTROLS_ACTION, settingControl, settingControlHtml, settingsPageHtml, bindingsSectionHtml,
  bindSettingControls, bindResetPanel, RESET_MESSAGE, SWATCH_TOKENS, themeSwatchColors, swatchBackground,
} from '../js/settings/page.js';
import { EXPORT_LINE } from '../js/records/export.js';
import { THEMES, DEFAULT_THEME_ID, registerTheme, themeById } from '../js/themes/registry.js';
import { FOCUSABLE } from '../js/shell/navigation.js';
import { FIXTURE_THEME } from './fixtures/themes/fixture-theme.js';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const tick = () => new Promise((r) => setTimeout(r, 0));

// The test-only second theme: a registered id the theme setting accepts.
registerTheme(FIXTURE_THEME);
const FIXTURE_ID = FIXTURE_THEME.id;
const DEFAULT_THEME = themeById(DEFAULT_THEME_ID);
// The theme lists the theme-list assertions hold for: the registry's, and two themes — the default
// and the fixture — standing in for a registry with a second shipped theme. THEMES stays as shipped.
const THEME_LISTS = [['the registry', THEMES], ['two themes', Object.freeze([DEFAULT_THEME, FIXTURE_THEME])]];

// The rows of a generated theme list, each [id, name, checked]; every row must carry its swatch.
const themeRows = (html) => [...html.matchAll(/<button type="button" role="radio" aria-checked="(true|false)" class="ui-segmented__option" data-value="([^"]+)">(<span class="ui-segmented__swatch" aria-hidden="true"><\/span>)?([^<]+)<\/button>/g)]
  .map((m) => { assert.ok(m[3], `${m[2]} leads with its swatch`); return [m[2], m[4], m[1] === 'true']; });
// What a theme list of `themes` showing `active` holds: one row per entry, in the list's order.
const expectedRows = (themes, active) => themes.map((t) => [t.id, t.name, t.id === active]);

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
  assert.throws(() => bindingRows('records', 'touch'), /unknown/);
  assert.throws(() => bindingRows('classic-2d', 'mouse'), /unknown/);
});

test('3D lists a touch device\'s rows: the stick, the look drag, tap, long-press, two-finger tap, pinch and the toolbar\'s three modes', () => {
  assert.deepEqual(TOUCH_DEVICE, { id: 'touch', label: 'Touch' });
  assert.deepEqual(bindingDevices('3d').map((d) => d.id), ['keyboard', 'controller', 'touch']);
  const rows = bindingRows('3d', 'touch');
  assert.equal(rows, BINDINGS['3d'].touch);
  const row = (input) => rows.find(([i]) => i === input);
  assert.equal(row('Left thumb')[1], 'Fly');
  assert.equal(row('Drag')[1], 'Look around');
  assert.equal(row('Tap')[1], 'Reveal');
  assert.equal(row('Long-press')[1], 'Flag / unflag');
  assert.equal(row('Two-finger tap')[1], 'Chord');
  assert.equal(row('Pinch')[1], 'Spacing');
  assert.equal(row('Shift button')[1], 'Neighbours only');
  assert.equal(row('Space button')[1], 'Aim through numbers');
  assert.equal(row('Ctrl button')[1], 'Show hidden');
  assert.equal(row('Pause button')[1], 'Pause');
  const orbit = bindingRows('3d', 'touch', 'orbit');
  const orow = (input) => orbit.find(([i]) => i === input);
  assert.equal(orow('Drag')[1], 'Rotate');
  assert.equal(orow('Left thumb ↑ ↓')[1], 'In / out');
  assert.equal(orow('Left thumb'), undefined);
  assert.deepEqual(orow('Pinch'), row('Pinch'), 'pinch changes the spacing in both cameras');
  assert.deepEqual(orow('Tap'), row('Tap'));
  assert.equal(bindingsSectionHtml(GLYPHS.xbox, 'fly', { mode: '3d', device: 'touch' }), `<dl class="ui-controls">${bindingsListHtml(rows, GLYPHS.xbox)}</dl>`, 'the Settings page lists them');
  assert.equal(helpRows('3d', 'touch'), rows, 'the help list shows the full touch rows');
  const ui = read('js/ui.js');
  assert.match(ui, /_bindDevice\(mode\)/, 'the help surfaces show the touch rows on a touch device');
});

test('Classic 2D lists a touch device\'s rows: tap, the 400 ms long-press, the tap chord, the Reveal / Flag switch, pan, pinch and Pause', () => {
  assert.deepEqual(bindingDevices('classic-2d').map((d) => d.id), ['keyboard', 'controller', 'touch']);
  const rows = bindingRows('classic-2d', 'touch');
  assert.equal(rows, BINDINGS['classic-2d'].touch);
  assert.equal(bindingRows('classic-2d', 'touch', 'orbit'), rows, 'the camera does not reach Classic 2D');
  const row = (input) => rows.find(([i]) => i === input);
  assert.equal(row('Tap')[1], 'Reveal (or flag on Tap: Flag)', 'a tap flags while the switch is on Flag');
  assert.equal(row('Long-press')[1], 'Flag / unflag');
  assert.equal(row('Tap a number')[1], 'Chord');
  assert.match(row('Tap: Reveal / Flag')[1], /[Ww]hat a tap does/);
  assert.equal(row('One finger')[1], 'Pan a large board');
  assert.equal(row('Pinch')[1], 'Zoom');
  assert.equal(row('Pause button')[1], 'Pause');
  for (const [input, action] of rows) assert.doesNotMatch(`${input} ${action}`, /\[|\{|[Cc]lick|[Ww]heel|[Mm]ouse/, 'no key, button or mouse in a touch row');
  assert.equal(bindingsSectionHtml(GLYPHS.xbox, 'fly', { mode: 'classic-2d', device: 'touch' }), `<dl class="ui-controls">${bindingsListHtml(rows, GLYPHS.xbox)}</dl>`, 'the Settings page lists them');
  // The pause card on a phone (J-Pause-p): the five gesture rows.
  assert.deepEqual(helpRows('classic-2d', 'touch').map((r) => r.join(' — ')),
    ['Tap — Reveal (or flag on Tap: Flag)', 'Long-press — Flag / unflag', 'Tap a number — Chord', 'One finger — Pan a large board', 'Pinch — Zoom']);
  const ui = read('js/ui.js');
  assert.match(ui, /_bindDevice\(mode\) \{\n    return this\._touch && this\._device === 'keyboard' \? 'touch' : this\._device;/,
    'on a touch device both modes\' help surfaces show the touch rows, unless a controller is in use');
});

test('the Classic 2D keyboard bindings name every key the cursor input acts on', () => {
  const text = bindingRows('classic-2d', 'keyboard').map((r) => r[0]).join(' ');
  const names = { Space: 'Space', Enter: 'Enter', KeyF: 'F', KeyD: 'D' };
  for (const [code, name] of Object.entries(names)) {
    assert.ok(code in CURSOR_KEYS, `${code} is a cursor key`);
    assert.ok(text.includes(`[${name}]`), `the bindings show ${name}`);
  }
});

// The canvas's short rows (J-Settings-states, J-Pause-xl, J-Game3D-states "H help panel", J-Ready-xl and J-Ready-p), as plain words.
const shown = (list) => list.map(([input, action]) => `${input.replace(/\[([^\]]+)\]/g, '$1')} — ${action}`);

test('the Settings bindings are the canvas\'s short rows: Classic 2D\'s and 3D\'s on the keyboard and mouse, no Middle click row', () => {
  assert.deepEqual(shown(bindingRows('classic-2d', 'keyboard')), [
    'Left / middle button — Reveal', 'Right button — Flag', 'Left + Right — Chord', 'Arrow keys — Move the cursor',
    'Space / Enter — Reveal', 'F — Flag', 'D — Chord', 'Esc · F2 — Pause · Restart',
  ]);
  assert.deepEqual(shown(bindingRows('3d', 'keyboard')), [
    'Mouse — Look around (click to capture)', 'Arrow keys — Look around', 'W A S D — Fly', 'Q / E — Down / up',
    'Left click — Reveal', 'Right click — Flag / unflag', 'Left + Right — Chord', 'Wheel — Spacing', 'X — Spacing 1.1 / 2.0',
    'Hold Shift / Space / Ctrl — View modes', 'H · M · F — Help · Sound · Fullscreen', 'Esc · F2 — Pause · Restart',
  ]);
  for (const mode of BINDING_MODES) {
    for (const device of bindingDevices(mode.id)) assert.ok(!bindingRows(mode.id, device.id).some(([input]) => /Middle click/.test(input)), `${mode.id} ${device.id}: no Middle click row`);
  }
});

test('the help list is the canvas\'s: the pause card\'s nine Classic 2D rows and the H panel\'s eleven 3D rows; the other pairs show their full rows', () => {
  assert.deepEqual(shown(helpRows('classic-2d', 'keyboard')), [
    'Left / middle button — Reveal', 'Right button — Flag / unflag', 'Left + Right — Chord', 'Arrow keys — Move the cursor',
    'Space / Enter — Reveal under the cursor', 'F — Flag under the cursor', 'D — Chord under the cursor', 'Esc — Pause', 'F2 — Restart',
  ]);
  assert.deepEqual(shown(helpRows('3d', 'keyboard')), [
    'Mouse — Look around', 'W A S D — Fly', 'Q / E — Down / up', 'Left click — Reveal', 'Right click — Flag / unflag', 'Left + Right — Chord',
    'Wheel — Spacing', 'Hold Shift — Neighbours only', 'Hold Space — Aim through numbers', 'Hold Ctrl — Show hidden', 'Esc — Pause',
  ]);
  assert.equal(helpRows('3d', 'keyboard'), HELP_BINDINGS['3d'].fly.keyboard);
  assert.deepEqual(shown(helpRows('3d', 'keyboard', 'orbit')).slice(0, 2), ['Mouse — Rotate', 'W / S — In / out'], 'Orbit\'s help rows rotate and dolly');
  for (const mode of BINDING_MODES) assert.equal(helpRows(mode.id, 'controller'), bindingRows(mode.id, 'controller'), `${mode.id}: the controller's full rows`);
  assert.equal(helpListHtml('3d', 'keyboard', GLYPHS.xbox), bindingsListHtml(helpRows('3d', 'keyboard'), GLYPHS.xbox));
});

test('the 3D ready card lists the canvas\'s six short rows on the keyboard and mouse and on touch, Orbit\'s following the camera', () => {
  assert.deepEqual(shown(readyRows('keyboard')), ['Mouse — look around', 'W A S D — fly', 'Q / E — down / up', 'Left / Right — reveal / flag', 'Wheel — spacing', 'Shift · Space · Ctrl — view modes']);
  assert.deepEqual(shown(readyRows('touch')), ['Left thumb — fly', 'Drag — look', 'Tap — reveal', 'Long-press — flag', 'Two-finger tap — chord', 'Pinch — spacing']);
  assert.equal(readyRows('keyboard'), READY_BINDINGS.fly.keyboard);
  assert.deepEqual(shown(readyRows('keyboard', 'orbit')), ['Mouse — rotate', 'W / S — in / out', 'Left / Right — reveal / flag', 'Wheel — in / out', 'Shift · Space · Ctrl — view modes']);
  assert.deepEqual(shown(readyRows('touch', 'orbit')).slice(0, 2), ['Left thumb ↑ ↓ — in / out', 'Drag — rotate']);
  assert.throws(() => readyRows('controller'), /unknown/);
  assert.throws(() => readyRows('keyboard', 'free'), /unknown/);
  assert.equal(readyListHtml('touch', GLYPHS.xbox, 'orbit'), bindingsListHtml(readyRows('touch', 'orbit'), GLYPHS.xbox));
  const index = read('index.html');
  const ready = index.slice(index.indexOf('<section id="ready"'), index.indexOf('<!-- Controls modal'));
  assert.match(ready, /<dl id="ready-keys" class="ui-controls ready-keys"><\/dl>/, 'the list is filled from the bindings source, not written in the markup');
  assert.doesNotMatch(ready, /data-camera=|class="ready-touch"/, 'no hard-coded key lines');
  assert.match(read('js/ui.js'), /this\.el\.readyKeys\.innerHTML = readyListHtml\(this\._touch \? 'touch' : 'keyboard', this\._glyphs, this\._camera\);/);
});

test('both modes list F2 as Restart on the keyboard and Start + Y on the controller', () => {
  for (const mode of BINDING_MODES) {
    const key = bindingRows(mode.id, 'keyboard').find(([input]) => input === '[Esc] · [F2]');
    assert.ok(key, `${mode.id} keyboard lists F2`);
    assert.equal(key[1], 'Pause · Restart');
    const pad = bindingRows(mode.id, 'controller').find(([input]) => input === '{start} + {y}');
    assert.ok(pad, `${mode.id} controller lists Start + Y`);
    assert.match(pad[1], /^Restart/);
  }
  assert.match(bindingsHtml('classic-2d', 'controller', GLYPHS.xbox), /<dt class="ui-controls__key">Menu \+ Y<\/dt><dd class="ui-controls__action">Restart<\/dd>/);
  for (const mode of BINDING_MODES) {
    assert.equal(bindingsSectionHtml(GLYPHS.xbox, 'fly', { mode: mode.id }).match(/>Esc · F2</g).length, 1, `the Settings bindings show F2 for ${mode.id}`);
  }
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

test('the 3D keyboard bindings name X, the spacing toggle, W A S D to fly and the wheel\'s spacing', () => {
  const rows = bindingRows('3d', 'keyboard');
  const x = rows.find(([input]) => input === '[X]');
  assert.deepEqual([...x], ['[X]', 'Spacing 1.1 / 2.0']);
  const wasd = rows.find(([input]) => input === '[W] [A] [S] [D]');
  assert.equal(wasd[1], 'Fly');
  const wheel = rows.find(([input]) => input === 'Wheel');
  assert.equal(wheel[1], 'Spacing');
  assert.equal(bindingRows('classic-2d', 'keyboard').some(([input]) => input === '[X]'), false, 'not in Classic 2D');
});

test('the 3D keyboard bindings list keyboard look on the arrows, beside mouse look', () => {
  const rows = bindingRows('3d', 'keyboard');
  const row = (input) => rows.find(([i]) => i === input);
  assert.deepEqual([...row('Arrow keys')], ['Arrow keys', 'Look around']);
  assert.ok(rows.indexOf(row('Arrow keys')) === rows.indexOf(row('Mouse')) + 1, 'beside mouse look');
  assert.match(bindingsSectionHtml(GLYPHS.xbox, 'fly', { mode: '3d' }), /<dt class="ui-controls__key">Arrow keys<\/dt><dd class="ui-controls__action">Look around<\/dd>/, 'the Settings page lists them');
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

test('the 3D bindings follow the Camera setting: Orbit rotates and dollies, from the one table', () => {
  assert.equal(bindingRows('3d', 'keyboard', 'fly'), BINDINGS['3d'].keyboard, 'Fly is the default rows');
  assert.equal(bindingRows('3d', 'keyboard'), bindingRows('3d', 'keyboard', 'fly'));
  const kb = bindingRows('3d', 'keyboard', 'orbit');
  const row = (rows, input) => rows.find(([i]) => i === input);
  assert.equal(row(kb, 'Mouse')[1], 'Rotate (click to capture)');
  assert.equal(row(kb, 'Arrow keys · [A] [D]')[1], 'Rotate');
  assert.equal(row(kb, '[W] / [S]')[1], 'In / out');
  assert.equal(row(kb, 'Wheel')[1], 'In / out');
  assert.equal(row(kb, '[Q] / [E]'), undefined, 'Q / E unused');
  assert.equal(row(kb, '[W] [A] [S] [D]'), undefined, 'no flight row');
  assert.match(row(kb, '[X]')[1], /Spacing/, 'spacing stays on X');
  for (const input of ['Left click', 'Right click', 'Left + Right', 'Hold [Shift] / [Space] / [Ctrl]', '[Esc] · [F2]']) {
    assert.deepEqual(row(kb, input), row(bindingRows('3d', 'keyboard'), input), `${input} as in Fly`);
  }
  const pad = bindingRows('3d', 'controller', 'orbit');
  assert.equal(row(pad, 'Right stick')[1], 'Rotate');
  assert.equal(row(pad, 'Left stick ↑ ↓')[1], 'In / out');
  assert.equal(row(pad, 'Left / right stick'), undefined);
  assert.equal(row(pad, '{a} / {b}'), undefined, 'A / B unused');
  assert.deepEqual(row(pad, '{rt} / {lt}'), row(bindingRows('3d', 'controller'), '{rt} / {lt}'), 'the triggers act as in Fly');
  assert.equal(row(pad, 'D-pad ↑ ↓')[1], 'Spacing');
  assert.equal(bindingRows('classic-2d', 'keyboard', 'orbit'), bindingRows('classic-2d', 'keyboard'), 'Classic 2D has no camera');
  assert.throws(() => bindingRows('3d', 'keyboard', 'free'), /unknown/);
  assert.equal(bindingsHtml('3d', 'keyboard', GLYPHS.generic, 'orbit'), bindingsListHtml(kb, GLYPHS.generic));
  const section = bindingsSectionHtml(GLYPHS.xbox, 'orbit', { mode: '3d' });
  assert.ok(section.includes(bindingsListHtml(kb, GLYPHS.xbox)), 'the Settings page lists the chosen camera\'s rows');
  assert.ok(!section.includes('>Fly<'));
  const ui = read('js/ui.js');
  assert.match(ui, /setCamera\(camera\)/, 'the help surfaces follow the setting');
  assert.match(ui, /bindingsSectionHtml\(this\._glyphs, this\._camera, \{ mode, device \}\)/);
});

test('bindingsListHtml renders keys in plain words, controller buttons as the pad\'s glyphs, no key caps, and escapes text', () => {
  const html = bindingsListHtml([['[W] [A] then Left & right', 'Fly <fast>'], ['{rt} / {lt}', 'Reveal with {a}']], GLYPHS.playstation);
  assert.equal(html,
    '<dt class="ui-controls__key">W A then Left &amp; right</dt><dd class="ui-controls__action">Fly &lt;fast&gt;</dd>'
    + '<dt class="ui-controls__key">R2 / L2</dt><dd class="ui-controls__action">Reveal with ✕</dd>');
  assert.match(bindingsListHtml([['{a}', 'x']]), /<dt class="ui-controls__key">A<\/dt>/, 'generic glyphs by default');
  for (const mode of BINDING_MODES) {
    for (const device of bindingDevices(mode.id)) assert.doesNotMatch(bindingsHtml(mode.id, device.id, GLYPHS.xbox) + helpListHtml(mode.id, device.id, GLYPHS.xbox), /<kbd/, `${mode.id} ${device.id}: no key caps`);
  }
});

test('the in-game help reads the same bindings source', () => {
  const index = read('index.html');
  const help = index.slice(index.indexOf('<aside id="help"'), index.indexOf('</aside>'));
  assert.match(help, /<dl class="ui-controls"><\/dl>/, 'the help list is filled from the bindings source, not written in the markup');
  const ui = read('js/ui.js');
  assert.match(ui, /from '\.\/settings\/bindings\.js'/);
  assert.match(ui, /helpListHtml\(this\._mode, this\._bindDevice\(this\._mode\), this\._glyphs, this\._camera\)/, 'the help panel shows the active mode\'s help rows for the active device (touch on a touch device) and camera');
  assert.match(ui, /helpFootHtml\(this\._mode, this\._bindDevice\(this\._mode\), this\._glyphs\)/, 'its foot line follows the same device');
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

test('the Theme section says Theme once: its list has no label of its own and is named by the heading', () => {
  const html = settingsPageHtml();
  const theme = html.slice(html.indexOf('id="set-sec-theme"'), html.indexOf('</section>', html.indexOf('id="set-sec-theme"')));
  assert.equal(theme.replace(/data-theme[a-z-]*/g, '').split('Theme').length - 1, 1, 'one visible Theme');
  assert.match(theme, /<div class="ui-segmented ui-segmented--list" role="radiogroup" aria-labelledby="set-sec-theme" data-setting="theme" id="set-theme">/);
  assert.ok(theme.includes(settingControlHtml('theme', undefined, { labelledBy: 'set-sec-theme' })), 'the section holds the generated list');
  for (const [name, themes] of THEME_LISTS) {
    const list = settingControlHtml('theme', undefined, { labelledBy: 'set-sec-theme', themes });
    assert.match(list, /^<div class="ui-segmented ui-segmented--list" role="radiogroup" aria-labelledby="set-sec-theme"/, `${name}: no label of its own`);
    assert.deepEqual(themeRows(list), expectedRows(themes, DEFAULT_THEME_ID), `${name}: its rows`);
  }
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
  assert.equal(settingControl('theme').list, true, 'the theme is a list of rows');
  for (const [name, themes] of THEME_LISTS) {
    const control = name === 'the registry' ? settingControl('theme') : settingControl('theme', { themes });
    assert.deepEqual(control.options, themes.map((t) => ({ value: t.id, label: t.name })), `${name}: one option per theme`);
  }
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
  for (const [name, themes] of THEME_LISTS) {
    const theme = settingControlHtml('theme', undefined, { themes });
    assert.match(theme, /^<p class="ui-text" id="set-theme-label">Theme<\/p><div class="ui-segmented ui-segmented--list" role="radiogroup" aria-labelledby="set-theme-label" data-setting="theme" id="set-theme">(<button [^>]+><span class="ui-segmented__swatch" aria-hidden="true"><\/span>[^<]+<\/button>)+<\/div>$/, `${name}: kit rows only`);
    assert.deepEqual(themeRows(theme), expectedRows(themes, DEFAULT_THEME_ID), `${name}: the default theme checked by default`);
  }
  const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((m) => m[1].split(/\s+/));
  for (const c of classes) assert.ok(c.startsWith('ui-') || c === 'hidden', `kit class only (and the shell's hidden), got ${c}`);
  for (const s of SETTINGS_SECTIONS) {
    assert.match(html, new RegExp(`<div class="ui-section-label"><h3 class="ui-section-label__text" id="set-sec-${s.id}">${s.title}</h3></div>`), `${s.title} under its section label`);
  }
  assert.doesNotMatch(html, /ui-heading/, 'section labels, not headings');
});

test('each setting is a row of its name and its control, the 3D-only ones noted as the canvas draws them', () => {
  const html = settingsPageHtml();
  assert.deepEqual(SETTING_NOTES, { lookSensitivity: '3D', camera: '3D', fieldOfView: '3D' });
  for (const key of SETTING_KEYS.filter((k) => k !== 'theme')) {
    const note = SETTING_NOTES[key] ? `<span class="ui-text ui-text--muted" id="set-${key}-note">${SETTING_NOTES[key]}</span>` : '';
    assert.ok(html.includes(`<div class="ui-row" data-setting-row="${key}">${settingControlHtml(key)}${note}</div>`), `${key}: one row`);
  }
  assert.doesNotMatch(html, /data-setting-row="theme"/, 'the theme list is the section\'s own rows');
});

test('the bindings panel picks a mode and a device and lists that one pair, in the pad\'s glyphs', () => {
  const html = settingsPageHtml();
  const panel = html.slice(html.lastIndexOf('<section', html.indexOf('id="set-sec-bindings"')), html.indexOf('id="settings-data"'));
  const choice = (id, label, options, checked) => `<div class="ui-segmented" role="radiogroup" aria-label="${label}" id="${id}">`
    + options.map((o) => `<button type="button" role="radio" aria-checked="${o.id === checked}" class="ui-segmented__option" data-value="${o.id}">${o.label}</button>`).join('')
    + '</div>';
  assert.ok(panel.includes(`<div class="ui-row" id="set-bind-choices">${choice('set-bind-mode', 'Mode', BINDING_MODES, 'classic-2d')}`
    + `${choice('set-bind-device', 'Device', [...BINDING_DEVICES, TOUCH_DEVICE], 'keyboard')}</div><div id="settings-bindings"></div>`), 'Mode, then Device (Touch included), then the list');
  for (const mode of BINDING_MODES) {
    assert.deepEqual(bindingDevices(mode.id).map((d) => d.id), ['keyboard', 'controller', 'touch'], `${mode.id} lists every device the choice offers`);
    for (const device of bindingDevices(mode.id)) {
      assert.equal(bindingsSectionHtml(GLYPHS.xbox, 'fly', { mode: mode.id, device: device.id }),
        `<dl class="ui-controls">${bindingsListHtml(bindingRows(mode.id, device.id), GLYPHS.xbox)}</dl>`, `${mode.id} / ${device.id}: that one list`);
    }
  }
  assert.equal(bindingsSectionHtml(GLYPHS.xbox, 'orbit', { mode: '3d', device: 'keyboard' }), `<dl class="ui-controls">${bindingsListHtml(bindingRows('3d', 'keyboard', 'orbit'), GLYPHS.xbox)}</dl>`, 'the Camera setting\'s rows');
  assert.equal(bindingsSectionHtml(GLYPHS.xbox), bindingsSectionHtml(GLYPHS.xbox, 'fly', { mode: 'classic-2d', device: 'keyboard' }), 'Classic 2D with the keyboard by default');
  assert.ok(bindingsSectionHtml(GLYPHS.playstation, 'fly', { mode: '3d', device: 'controller' }).includes('<dt class="ui-controls__key">R2 / L2</dt>'), 'the glyphs follow the controller');
});

// ---------------------------------------------------------------- the column layout

test('the page is one column composition generated from the sections, in the widest window\'s three columns', () => {
  const html = settingsPageHtml();
  assert.deepEqual(SETTINGS_COLUMNS, [['controls', 'audio'], ['graphics', 'theme'], ['bindings', 'data']]);
  assert.deepEqual(SETTINGS_COLUMNS.flat().sort(), [...SETTINGS_SECTIONS.map((s) => s.id), 'bindings', 'data'].sort(), 'every section in one column');
  assert.ok(html.startsWith('<div class="ui-columns" id="settings-columns"><div class="ui-column">'), 'the kit column composition');
  assert.ok(html.endsWith('</section></div></div>'), 'everything inside it');
  const columns = html.split('<div class="ui-column">').slice(1)
    .map((col) => [...col.matchAll(/<section class="[^"]*"[^>]* data-section="(\w+)" aria-labelledby="set-sec-\1"/g)].map((m) => m[1]));
  assert.deepEqual(columns, SETTINGS_COLUMNS, 'each column stacks its sections');
  assert.doesNotMatch(html, /ui-columns__span|ui-grid/, 'one composition, nothing across it');
  assert.doesNotMatch(read('js/settings/page.js'), /@media|1024/, 'no layout code of its own');
});

test('narrower windows regroup the sections by placement alone: two columns from 1024 px, then one in the phone\'s order', () => {
  const kit = read('css/components.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const block = kit.slice(kit.indexOf('@media (min-width: 1024px)'));
  assert.match(block.slice(0, block.indexOf('\n}')),
    /#settings-columns \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); grid-template-areas: "controls theme" "graphics data" "audio bindings"; \}/,
    'the canvas\'s two columns, inside the kit\'s one breakpoint');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /@media \(max-width: 1599px\) \{ #settings-columns > \.ui-column \{ display: contents; \} \}/, 'below the widest windows the columns let their sections be placed');
  assert.match(css, /@media \(min-width: 1600px\) \{ #settings-columns \{ grid-template-columns: repeat\(3, minmax\(0, 1fr\)\); grid-template-areas: none; \} \}/, 'three columns on the widest windows');
  assert.match(css, /@media \(max-width: 1023px\) \{[^}]*#settings-columns \{ grid-template-areas: "controls" "graphics" "theme" "audio" "bindings" "data"; \}/, 'one column in the phone\'s order');
  for (const id of SETTINGS_COLUMNS.flat()) assert.match(css, new RegExp(`#settings-columns \\[data-section="${id}"\\] \\{ grid-area: ${id}; \\}`), `${id} names its area`);
});

// ---------------------------------------------------------------- the Data panel and Reset all data

test('the page ends, after Bindings, with a Data panel: the export offered first, then one line and a "Reset all data…" kit button', () => {
  const html = settingsPageHtml();
  const bindings = html.indexOf('id="set-sec-bindings"');
  const data = html.indexOf('id="set-sec-data"');
  assert.ok(bindings > 0 && data > bindings, 'Data comes after Bindings');
  const panel = html.slice(html.lastIndexOf('<section', data));
  assert.match(panel, /^<section class="ui-panel ui-actions" id="settings-data" data-section="data" aria-labelledby="set-sec-data"><div class="ui-section-label"><h3 class="ui-section-label__text" id="set-sec-data">Data<\/h3><\/div>/);
  assert.match(panel, /<p class="ui-text ui-text--muted">[^<]*this browser[^<]*<\/p>/, 'one line saying what the action does');
  assert.match(panel, /<button type="button" class="ui-button ui-button--secondary" id="set-reset">Reset all data…<\/button>/);
  assert.match(panel, /<button type="button" class="ui-button ui-button--secondary" id="set-reset">Reset all data…<\/button><p class="ui-note ui-note--err hidden" id="set-reset-note" role="status" data-icon="warning"><span class="ui-note__text"><\/span><\/p>/,
    'the failure, an err note with its warning icon, under the Reset button');
  assert.ok(panel.trimEnd().endsWith('</section></div></div>'), 'the page ends with it, closing its column and the composition');
  assert.ok(panel.includes(`<p class="ui-text ui-text--muted" id="set-export-text">${EXPORT_LINE}</p>`), 'a line saying what the exports save');
  assert.match(EXPORT_LINE, /CSV/);
  assert.match(EXPORT_LINE, /JSON/);
  assert.match(panel, /<p class="ui-text ui-text--muted hidden" id="set-export-note" role="status"><\/p>/, 'the nothing-to-export line, hidden');
  const csv = panel.indexOf('<button type="button" class="ui-button ui-button--secondary" id="set-export-csv">Export history (CSV)</button>');
  const json = panel.indexOf('<button type="button" class="ui-button ui-button--secondary" id="set-export-json">Export all (JSON)</button>');
  const reset = panel.indexOf('id="set-reset"');
  assert.ok(csv > 0 && json > csv && reset > json, 'Export history (CSV), then Export all (JSON), then Reset all data…: an export is offered first');
  const rule = panel.indexOf('<hr class="ui-divider">');
  assert.ok(rule > json && rule < reset, 'a rule between the export and the reset');
});

test('the Settings export actions are bound to the one records export, refreshed each time the page shows', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const RECORDS_EXPORT = createRecordsExport\(\{ records: RECORDS, replays: REPLAYS \}\)/);
  assert.match(main, /const SETTINGS_EXPORT = bindExportActions\(\{[\s\S]*?set-export-csv[\s\S]*?set-export-json[\s\S]*?set-export-note[\s\S]*?\}, \{ onExport: \(format\) => RECORDS_EXPORT\.save\(format\) \}\)/);
  assert.match(main, /settings: \{[^\n]*SETTINGS_EXPORT\.show\(RECORDS_EXPORT\.hasGames\(\)\)/);
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
  assert.match(confirm, /<div class="ui-confirm hidden" id="set-reset-confirm" role="alertdialog" aria-labelledby="set-reset-text">/, 'a confirm box');
  assert.ok(confirm.includes(`<p class="ui-confirm__text" id="set-reset-text">${RESET_MESSAGE}</p>`));
  assert.match(confirm, /<div class="ui-actions ui-actions--row"><button type="button" class="ui-button ui-button--danger" id="set-reset-yes" data-icon="trash">Reset all data<\/button><button type="button" class="ui-button ui-button--secondary" id="set-reset-no">Cancel<\/button><\/div><\/div>/,
    'the danger md action with its trash icon beside Cancel');
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
    note: el('set-reset-note', 'ui-note ui-note--err hidden'),
  };
  // The note's text part, which the binder writes (setNote).
  els.note.text = { textContent: '' };
  els.note.querySelector = (sel) => (sel === ':scope > .ui-note__text' ? els.note.text : null);
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
  const results = [{ ok: false, failed: ['replays'], message: 'The data could not be deleted. Close other tabs of the game and try again.' }, { ok: true }];
  let runs = 0;
  const panel = bindResetPanel(els, { reset: async () => results[runs++] });
  els.open.click();
  els.yes.click();
  els.yes.click(); // a second press while it runs does nothing
  await tick();
  assert.equal(runs, 1);
  assert.equal(panel.isOpen(), false);
  assert.equal(els.note.hidden, false);
  assert.equal(els.note.text.textContent, 'The data could not be deleted. Close other tabs of the game and try again.');
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
  assert.equal(els.note.text.textContent, 'The data could not be deleted. Close other tabs of the game and try again.');
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
    const props = {};
    this.style = { setProperty: (n, v) => { props[n] = String(v); }, getPropertyValue: (n) => props[n] ?? '' };
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
  const store = await loadedStore({ lookSensitivity: 1.5, invertY: true, volume: 0.25, boardScale: '125' });
  const sens = slider('lookSensitivity', { step: '0.05', 'data-format': 'multiplier' });
  const vol = slider('volume', { step: '1', max: '100', 'data-format': 'percent', 'data-scale': '100' });
  const inv = toggle('invertY');
  const theme = segmented('boardScale', ['fit', '100', '125']);
  bindSettingControls([sens.root, vol.root, inv.root, theme.root], store);
  assert.equal(sens.input.value, '1.5');
  assert.equal(sens.output.textContent, '1.50×');
  assert.equal(vol.input.value, '25');
  assert.equal(vol.output.textContent, '25%');
  assert.equal(inv.input.checked, true);
  assert.deepEqual(theme.options.map((o) => [o.attrs['aria-checked'], o.tabIndex]), [['false', -1], ['false', -1], ['true', 0]]);

  // A change made elsewhere (the pause card, F, M) shows at once.
  await store.set('volume', 0.5);
  await store.set('boardScale', 'fit');
  await store.set('invertY', false);
  assert.equal(vol.input.value, '50');
  assert.equal(vol.output.textContent, '50%');
  assert.equal(vol.input.style.getPropertyValue('--slider-fill'), '0.5', 'the fill follows the store');
  assert.deepEqual(theme.options.map((o) => o.attrs['aria-checked']), ['true', 'false', 'false']);
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

test('a switch row binds like a toggle: its switch shows and writes the store', async () => {
  const store = await loadedStore({ invertY: true });
  const input = new FakeEl({ class: 'ui-toggle__input', type: 'checkbox' });
  const row = new FakeEl({ class: 'ui-switchrow', 'data-setting': 'invertY' }, [input]);
  bindSettingControls([row], store);
  assert.equal(input.checked, true);
  input.checked = false;
  input.fire('change');
  assert.equal(store.get('invertY'), false);
});

test('bindSettingControls refuses a control for an unknown setting', async () => {
  const store = await loadedStore();
  assert.throws(() => bindSettingControls([toggle('nope').root], store), /unknown/);
});

// ---------------------------------------------------------------- the theme list

// A theme list root as the page renders it: one row per id, each with its swatch.
const themeList = (ids) => {
  const rows = ids.map((id) => {
    const swatch = new FakeEl({ class: 'ui-segmented__swatch', 'aria-hidden': 'true' });
    swatch.style = { props: {}, setProperty(k, v) { this.props[k] = v; } };
    return { id, swatch, option: new FakeEl({ class: 'ui-segmented__option', 'data-value': id, 'aria-checked': 'false' }, [swatch]) };
  });
  return { root: new FakeEl({ class: 'ui-segmented ui-segmented--list', 'data-setting': 'theme' }, rows.map((r) => r.option)), rows };
};

// A theme applier double: current(), setTheme(id) settled by the test, onThemeChange.
function fakeApplier(active = DEFAULT_THEME_ID) {
  const listeners = new Set();
  const pending = [];
  return {
    calls: [],
    current: () => active,
    setTheme(id) {
      this.calls.push(id);
      return new Promise((resolve, reject) => pending.push({
        ok: () => { active = id; for (const l of listeners) l(id, {}); resolve(id); },
        fail: () => reject(new Error('theme files failed')),
      }));
    },
    onThemeChange: (l) => { listeners.add(l); return () => listeners.delete(l); },
    settle: (how) => pending.shift()[how](),
  };
}

const checked = (list) => list.rows.filter((r) => r.option.attrs['aria-checked'] === 'true').map((r) => r.id);

test('the theme list is the registry\'s themes in catalogue order, each a row with its name and a swatch, the stored one checked', () => {
  assert.deepEqual(THEMES, [...THEMES].sort((a, b) => a.order - b.order), 'the registry is in catalogue order');
  for (const [name, themes] of THEME_LISTS) {
    const html = name === 'the registry' ? settingControlHtml('theme', DEFAULT_THEME_ID) : settingControlHtml('theme', DEFAULT_THEME_ID, { themes });
    assert.deepEqual(themeRows(html), expectedRows(themes, DEFAULT_THEME_ID), `${name}: every theme, in order, by name, the stored one checked`);
    assert.equal(themeRows(html).filter((r) => r[2]).length, 1, `${name}: exactly one checked, named by its text to assistive technology`);
    for (const t of themes) {
      assert.deepEqual(themeRows(settingControlHtml('theme', t.id, { themes })), expectedRows(themes, t.id), `${name}: ${t.id} stored, ${t.id} checked`);
    }
    assert.doesNotMatch(html, /Light|Dark/);
  }
  assert.doesNotMatch(read('js/settings/page.js'), /joyful-tiles|Joyful tiles/, 'the page names no theme: the list reads the registry');
  assert.ok(Object.isFrozen(THEMES) && !THEMES.some((t) => t.id === FIXTURE_ID), 'the registry stays as shipped');
});

test('each theme row is a native button the keyboard and the controller reach; Up and Down move between rows, Left and Right step the choice', async () => {
  assert.ok(FOCUSABLE.split(',').map((x) => x.trim()).includes('button'), 'the controller\'s navigation collects buttons');
  for (const [name, themes] of THEME_LISTS) {
    const html = settingControlHtml('theme', DEFAULT_THEME_ID, { themes });
    assert.equal(html.match(/<button /g).length, themes.length, `${name}: every row a button`);
    assert.doesNotMatch(html, /disabled|tabindex="-1"[^>]*aria-checked="true"/);
  }

  const store = await loadedStore();
  const applier = fakeApplier(DEFAULT_THEME_ID);
  const list = themeList([DEFAULT_THEME_ID, FIXTURE_ID]);
  bindSettingControls([list.root], store, { theme: applier, themeSheet: async () => '' });
  const press = (row, key) => {
    let prevented = false;
    list.rows[row].option.fire('keydown', { key, preventDefault() { prevented = true; } });
    return prevented;
  };
  for (const [row, key] of [[0, 'ArrowDown'], [1, 'ArrowUp'], [0, 'ArrowUp'], [1, 'ArrowDown']]) {
    assert.equal(press(row, key), false, `${key} is left to the shell's focus move`);
  }
  assert.deepEqual(applier.calls, [], 'Up and Down pick nothing');
  assert.deepEqual(checked(list), [DEFAULT_THEME_ID]);
  assert.equal(press(0, 'ArrowRight'), true, 'Right steps the choice');
  assert.deepEqual(applier.calls, [FIXTURE_ID]);
});

test('the swatch reads its colours from the theme\'s own tokens, without applying the theme', () => {
  const css = read('themes/joyful-tiles/theme.css');
  const colors = themeSwatchColors(css, 'joyful-tiles');
  for (const token of SWATCH_TOKENS) assert.match(colors[token], /^#[0-9a-f]{6}$/i, `${token} from the token block`);
  assert.equal(colors['--color-ground'], '#fff6e8');
  assert.deepEqual(themeSwatchColors(css, 'fixture-dusk'), {}, 'another theme\'s scope reads nothing');
  const fixture = themeSwatchColors(read('tests/fixtures/themes/fixture-dusk/theme.css'), FIXTURE_ID);
  assert.equal(fixture['--color-surface'], '#1d2233');
  assert.equal(fixture['--color-ink'], '#f0e6d2');
  assert.deepEqual(themeSwatchColors(':root[data-theme="a"] .ui-card { --color-ink: #000000; }', 'a'), {}, 'only the token block, not a component rule');
});

test('a bound theme list fills each swatch once its theme\'s stylesheet is fetched', async () => {
  const store = await loadedStore();
  const list = themeList([DEFAULT_THEME_ID, FIXTURE_ID]);
  const fetched = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  bindSettingControls([list.root], store, {
    theme: fakeApplier(),
    themeSheet: async (entry) => { fetched.push(entry.stylesheet); await gate; return read(entry.stylesheet); },
  });
  assert.deepEqual(fetched, [DEFAULT_THEME.stylesheet, FIXTURE_THEME.stylesheet], 'each theme\'s own stylesheet');
  assert.deepEqual(list.rows[1].swatch.style.props, {}, 'nothing before the stylesheet arrives');
  release();
  await tick();
  await tick();
  assert.deepEqual(list.rows[0].swatch.style.props, { background: swatchBackground(themeSwatchColors(read(DEFAULT_THEME.stylesheet), DEFAULT_THEME_ID)) });
  assert.match(list.rows[1].swatch.style.props.background, /#1d2233/, 'the fixture\'s surface');
  assert.equal(swatchBackground({ '--color-ground': '#111111', '--color-ink': '#222222' }),
    'linear-gradient(90deg, #111111 0% 25%, transparent 25% 50%, transparent 50% 75%, #222222 75% 100%)', 'a stripe per token, in order, blank where undeclared');
  const failing = themeList([FIXTURE_ID]);
  assert.doesNotThrow(() => bindSettingControls([failing.root], store, { theme: fakeApplier(), themeSheet: () => Promise.reject(new Error('offline')) }));
  await tick();
  assert.deepEqual(failing.rows[0].swatch.style.props, {}, 'a stylesheet that cannot be fetched leaves the swatch blank');
});

test('picking a theme row applies it through the applier and saves it once the switch resolves', async () => {
  const store = await loadedStore();
  const applier = fakeApplier(DEFAULT_THEME_ID);
  const changed = [];
  const list = themeList([DEFAULT_THEME_ID, FIXTURE_ID]);
  bindSettingControls([list.root], store, { theme: applier, themeSheet: async () => '', onUserChange: (k) => changed.push(k) });
  assert.deepEqual(checked(list), [DEFAULT_THEME_ID], 'the active theme selected');
  list.rows[1].option.fire('click');
  assert.deepEqual(applier.calls, [FIXTURE_ID], 'the applier\'s setTheme, at once');
  assert.equal(store.get('theme'), DEFAULT_THEME_ID, 'not saved before the switch resolves');
  applier.settle('ok');
  await tick();
  await tick();
  assert.equal(store.get('theme'), FIXTURE_ID, 'saved once applied');
  assert.deepEqual(checked(list), [FIXTURE_ID]);
  assert.deepEqual(changed, ['theme']);
});

test('a failed switch leaves the selection on the current theme and saves nothing', async () => {
  const store = await loadedStore();
  const applier = fakeApplier(DEFAULT_THEME_ID);
  const list = themeList([DEFAULT_THEME_ID, FIXTURE_ID]);
  bindSettingControls([list.root], store, { theme: applier, themeSheet: async () => '' });
  list.rows[1].option.fire('click');
  assert.deepEqual(checked(list), [FIXTURE_ID], 'the pick shows while the switch runs');
  applier.settle('fail');
  await tick();
  await tick();
  assert.deepEqual(checked(list), [DEFAULT_THEME_ID], 'back on the current theme');
  assert.equal(list.rows[0].option.tabIndex, 0, 'which is the tab stop again');
  assert.equal(store.get('theme'), DEFAULT_THEME_ID);
});

test('the theme list follows the active theme: a switch made elsewhere moves the selection', async () => {
  const store = await loadedStore();
  const applier = fakeApplier(FIXTURE_ID);
  const list = themeList([DEFAULT_THEME_ID, FIXTURE_ID]);
  const unbind = bindSettingControls([list.root], store, { theme: applier, themeSheet: async () => '' });
  assert.deepEqual(checked(list), [FIXTURE_ID], 'the applier\'s active theme, whatever the store holds');
  applier.setTheme(DEFAULT_THEME_ID);
  applier.settle('ok');
  await tick();
  assert.deepEqual(checked(list), [DEFAULT_THEME_ID]);
  unbind();
  applier.setTheme(FIXTURE_ID);
  applier.settle('ok');
  await tick();
  assert.deepEqual(checked(list), [DEFAULT_THEME_ID], 'unbind stops following');
});

test('the shell hands the Settings page the theme applier', () => {
  assert.match(read('js/main.js'), /bindSettingControls\(document\.querySelectorAll\('\[data-setting\]'\), SETTINGS, \{[^}]*theme: THEME,/);
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));

test('index.html holds the Settings page in a screen frame on the backdrop, its body filled from the schema', () => {
  const page = between(INDEX, '<!-- Settings -->', '<!-- Records -->');
  assert.match(page, /<section id="settings" class="overlay ui-backdrop hidden" aria-label="Settings">\s*<section class="ui-frame" id="settings-frame" aria-labelledby="settings-title">/);
  assert.match(page, /<h2 class="ui-frame__title" id="settings-title">Settings<\/h2>/);
  assert.match(page, /<div class="ui-frame__body" id="settings-body"><\/div>/, 'the controls are generated, not written in the markup');
  assert.doesNotMatch(page, /ui-card|ui-frame__foot|data-esc-hint/, 'no card, no foot, no text hint');
  assert.match(read('js/ui.js'), /settingsPageHtml\(\)/);
});

test('Settings\' Back is the frame head\'s Main menu with its key hint, in view while the body scrolls', () => {
  const page = between(INDEX, '<!-- Settings -->', '<!-- Records -->');
  assert.match(page, /<div class="ui-frame__start" id="settings-actions"><button type="button" id="settings-back" class="ui-button ui-button--secondary ui-button--sm" data-back>Main menu <span class="ui-key-hint" data-action="back" aria-hidden="true"><\/span><\/button><\/div>/,
    'one Back, at the start of the head');
  assert.ok(page.indexOf('id="settings-back"') < page.indexOf('id="settings-body"'), 'the head comes before the body');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /#settings-actions|#settings \{[^}]*scroll-padding/, 'no sticky row of its own: the frame keeps its head in view');
  for (const t of THEMES) assert.doesNotMatch(read(t.stylesheet), /#settings-actions/, `${t.id} adds no row either`);
  assert.match(css, /#settings-frame \{ width: 1640px; height: 100%; \}/, 'the window at the canvas\'s size, bounded by the backdrop');
  assert.match(read('js/ui.js'), /for \(const id of \[[^\]]*'settings'[^\]]*\]\) showKeyHints\(/, 'its key hint follows the active device');
});

test('on a phone the frame is full-bleed and the bindings device choice spans the width, each option wrapping its label', () => {
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const phone = css.slice(css.indexOf('@media (max-width: 719px)', css.indexOf('#settings-frame')));
  const block = phone.slice(0, phone.indexOf('\n}'));
  assert.match(block, /#settings-frame \{ width: 100%; border-radius: 0; box-shadow: none; \}/);
  assert.match(block, /#set-bind-device \{ display: flex; width: 100%; \}/);
  assert.match(block, /#set-bind-device > \.ui-segmented__option \{ flex: 1 1 0; min-width: 0; padding-inline: var\(--space-2\); white-space: normal; \}/);
});

test('the Settings choices and the Controls panel\'s tabs take only Left and Right, so Up and Down move focus', () => {
  assert.match(read('js/settings/page.js'), /bindSegmented\(root, \{\s*horizontal: true,/);
  assert.match(read('js/ui.js'), /bindSegmented\(\$\('controls-tabs'\), \{ horizontal: true,/);
});

test('the pause card\'s sensitivity, invert Y and volume are bound to the store; the main menu holds no setting', () => {
  const pause = between(INDEX, '<section id="pause"', '<noscript>');
  assert.match(pause, /<div class="ui-slider" data-setting="lookSensitivity">/);
  assert.match(pause, /<div class="ui-switchrow" data-setting="invertY">/);
  assert.match(pause, /<div class="ui-slider" data-setting="volume">/);
  assert.doesNotMatch(between(INDEX, '<section id="menu"', '<!-- 3D board choice -->'), /data-setting|menu-sound|menu-vol/, 'sound and volume live on the Settings page');
  assert.match(MAIN, /bindSettingControls\(document\.querySelectorAll\('\[data-setting\]'\), SETTINGS/);
  assert.doesNotMatch(MAIN, /onLookSettings|initVolume/, 'no second path between those controls and the store');
  assert.doesNotMatch(read('js/ui.js'), /onLookSettings|initVolume|setLook\(/);
});

test('on the pause card Sound comes first, then Volume, and M still toggles it; the Settings audio section keeps both', () => {
  const audio = SETTINGS_SECTIONS.find((sec) => sec.id === 'audio');
  assert.deepEqual(audio.settings, ['muted', 'volume'], 'the Settings page: Sound, then Volume');
  assert.doesNotMatch(read('js/ui.js'), /menu-sound/);
  const pause = between(INDEX, '<section id="pause"', '<noscript>');
  assert.match(pause, /<div class="ui-switchrow" data-setting="muted"><span class="ui-switchrow__text"><label class="ui-switchrow__label" for="p-sound">Sound<\/label><\/span><input type="checkbox" role="switch" id="p-sound" class="ui-toggle__input"><\/div>/,
    'the pause card\'s Sound is the kit\'s switch row, bound to the store');
  assert.ok(pause.indexOf('id="p-sound"') < pause.indexOf('data-setting="volume"'), 'pause card: Sound, then Volume');
  assert.match(MAIN, /code === 'KeyM'\) toggleSound\(\)/);
});

test('the Controls section ends in the Controls action, which opens the controls reference and gives the focus back on close', () => {
  const html = settingsPageHtml();
  const controls = html.slice(html.indexOf('id="set-sec-controls"'), html.indexOf('id="set-sec-graphics"'));
  assert.match(controls, /data-setting="confirmRestart"[\s\S]*<button type="button" class="ui-button ui-button--secondary" id="set-controls">Controls<\/button><\/section>/,
    'after the section\'s settings');
  assert.equal(CONTROLS_ACTION, 'Controls');
  assert.equal([...html.matchAll(/id="set-controls"/g)].length, 1);
  const ui = read('js/ui.js');
  assert.match(ui, /\$\('set-controls'\)\.addEventListener\('click', \(\) => this\.openControls\(\)\)/);
  assert.match(ui.slice(ui.indexOf('  closeControls() {')), /this\._controlsOpener\?\.isConnected \? this\._controlsOpener : \$\('set-controls'\)/, 'the focus returns to what opened it');
  assert.doesNotMatch(ui, /menu-help/, 'the main menu has no Controls button');
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

test('in a browser: Settings from the menu, the theme list with its swatches, and a carried-over Dark starting on Joyful tiles after a reload', async (t) => {
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

    assert.equal(await theme(), DEFAULT_THEME_ID);
    await page.click('#menu-entry-settings');
    assert.equal(await mode(), 'settings');
    assert.equal(await active(), 'set-lookSensitivity', 'the declared default focus');
    assert.ok(await ms(() => !document.getElementById('settings').classList.contains('hidden')));
    assert.ok(await ms(() => document.getElementById('menu').classList.contains('hidden')));
    const headings = await ms(() => [...document.querySelectorAll('#settings-body h3')].map((h) => h.textContent));
    assert.deepEqual(headings, ['Controls', 'Audio', 'Graphics', 'Theme', 'Bindings', 'Data'], 'the columns\' sections, in order');
    assert.equal(await ms(() => document.querySelectorAll('#settings-body dl.ui-controls').length), 1, 'one bindings list');

    // The bindings panel: Classic 2D with the active device first; each pick lists that mode and device.
    const bindings = () => ms(() => ({
      mode: document.querySelector('#set-bind-mode [aria-checked="true"]').dataset.value,
      device: document.querySelector('#set-bind-device [aria-checked="true"]').dataset.value,
      list: document.querySelector('#settings-bindings dl.ui-controls').innerHTML,
    }));
    const listOf = (mode, device) => ms(([m, d]) => import('/js/settings/bindings.js').then((b) => b.bindingsHtml(m, d, undefined, globalThis.__ms.settings.get('camera'))), [mode, device]);
    assert.deepEqual(await bindings(), { mode: 'classic-2d', device: 'keyboard', list: await listOf('classic-2d', 'keyboard') });
    await page.click('#set-bind-mode [data-value="3d"]');
    assert.deepEqual(await bindings(), { mode: '3d', device: 'keyboard', list: await listOf('3d', 'keyboard') });
    await page.click('#set-bind-device [data-value="touch"]');
    assert.deepEqual(await bindings(), { mode: '3d', device: 'touch', list: await listOf('3d', 'touch') });
    await page.focus('#set-bind-device [data-value="touch"]');
    await page.keyboard.press('ArrowLeft');
    assert.equal((await bindings()).device, 'controller', 'Left steps the device choice');

    // The theme list: the registry's themes by name, the active one checked, each swatch drawn
    // from its theme's tokens once the stylesheet is fetched; a pick of a row applies and saves it.
    const rows = () => ms(() => [...document.querySelectorAll('#set-theme .ui-segmented__option')]
      .map((o) => [o.dataset.value, o.textContent, o.getAttribute('aria-checked')]));
    const shipped = THEMES.map((t) => [t.id, t.name, String(t.id === DEFAULT_THEME_ID)]);
    assert.deepEqual(await rows(), shipped);
    const defaultRow = `#set-theme [data-value="${DEFAULT_THEME_ID}"]`;
    const defaultSwatch = `${defaultRow} .ui-segmented__swatch`;
    await page.waitForFunction((sel) => getComputedStyle(document.querySelector(sel)).backgroundImage.includes('gradient'),
      defaultSwatch, { timeout: patience(5000) });
    const ground = themeSwatchColors(read(DEFAULT_THEME.stylesheet), DEFAULT_THEME_ID)['--color-ground'].match(/[0-9a-f]{2}/gi).map((h) => parseInt(h, 16));
    assert.ok((await ms((sel) => getComputedStyle(document.querySelector(sel)).backgroundImage, defaultSwatch)).startsWith(`linear-gradient(90deg, rgb(${ground.join(', ')}) 0%`), 'the ground colour first');
    assert.ok(await ms((sel) => document.querySelector(sel).getBoundingClientRect().width, defaultSwatch) > 0, 'the swatch is drawn');
    await page.click(defaultRow);
    assert.equal(await theme(), DEFAULT_THEME_ID);
    assert.equal(await setting('theme'), DEFAULT_THEME_ID);
    await page.focus(defaultRow);
    await page.keyboard.press('Enter');
    assert.deepEqual(await rows(), shipped, 'the keyboard picks a row too');

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
    assert.equal(await ms(() => document.getElementById('p-sound').checked), false, 'as the pause card shows');
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
    assert.equal(await ms(() => document.getElementById('set-volume').value), '40', 'the Settings page shows it too');
    await ms(() => globalThis.__ms.pauser.toMenu());

    // Reload: Joyful tiles is on the root before the menu is in the document, here from a stored
    // version-1 Dark, which the store then carries over.
    await page.waitForFunction(() => { // the saves settle
      const d = JSON.parse(localStorage.getItem('ms3d:doc:settings') ?? 'null')?.data;
      return d?.volume === 0.4;
    }, null, { timeout: patience(5000) });
    await ms(() => {
      const d = JSON.parse(localStorage.getItem('ms3d:doc:settings')).data;
      localStorage.setItem('ms3d:doc:settings', JSON.stringify({ version: 1, data: { ...d, theme: 'dark' } }));
    });
    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await ms(() => globalThis.__themeAtMenu), 'joyful-tiles', 'Joyful tiles before the menu shows');
    assert.equal(await theme(), 'joyful-tiles');
    assert.equal(await setting('theme'), 'joyful-tiles', 'Dark carried over');
    assert.equal(await setting('volume'), 0.4, 'everything else intact');
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
    await page.click('#c2d-play');
    const centres = await ms(() => {
      const r = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const L = globalThis.__ms.board2D.layout;
      return Array.from({ length: 81 }, (_, c) => ({
        x: r.left + L.offsetX + (c % 9) * L.pitch + 0.5 * L.tile, y: r.top + L.offsetY + Math.floor(c / 9) * L.pitch + 0.5 * L.tile,
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
      await globalThis.__ms.settings.set('camera', 'orbit');
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
    assert.equal(await ms(() => globalThis.__ms.settings.get('camera')), 'orbit', 'nothing changed');
    assert.equal(await blobCount(), 1);

    // Confirm: everything goes and the page reloads into a fresh profile.
    await page.click('#set-reset');
    await Promise.all([page.waitForEvent('load'), page.click('#set-reset-yes')]);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => document.documentElement.getAttribute('data-theme')), DEFAULT_THEME_ID);
    assert.equal(await ms(() => globalThis.__ms.settings.get('theme')), DEFAULT_THEME_ID);
    assert.equal(await ms(() => globalThis.__ms.settings.get('camera')), 'fly');
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

test('in a browser, the Settings page\'s Controls action opens the controls reference over it, and Esc gives the focus back', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    await page.click('#menu-entry-settings');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'settings');
    await page.click('#set-controls');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), false, 'the controls reference opens');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'controls-close');
    assert.ok(await page.evaluate(() => document.getElementById('controls-body').textContent.length > 50), 'each mode\'s bindings');
    assert.equal(await page.evaluate(() => document.getElementById('settings').inert), true, 'the page is inert behind it');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), true, 'Esc closes it');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'settings', 'and leaves the page as it was');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'set-controls', 'the focus returns to the action');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the Settings page takes the canvas\'s columns at each window size, never scrolls sideways, and its phone device choice wraps', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(removeWebGL2);
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    await page.click('#menu-entry-settings');
    // The sections grouped by their left edge, each group top to bottom; the boxes wider than their port.
    const layout = () => page.evaluate(() => {
      const columns = new Map();
      const sections = [...document.querySelectorAll('#settings-columns [data-section]')].map((e) => [e.dataset.section, e.getBoundingClientRect()]);
      for (const [id, r] of sections.sort((a, b) => a[1].top - b[1].top)) {
        const left = Math.round(r.left);
        if (!columns.has(left)) columns.set(left, []);
        columns.get(left).push(id);
      }
      const body = document.getElementById('settings-body');
      const wide = [document.documentElement, document.getElementById('settings'), document.getElementById('settings-frame'), body]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.id || e.tagName);
      return { columns: [...columns.entries()].sort((a, b) => a[0] - b[0]).map(([, ids]) => ids), wide, scrolls: getComputedStyle(body).overflowY };
    });
    const cases = [
      [1920, 1080, [['controls', 'audio'], ['graphics', 'theme'], ['bindings', 'data']]],
      [1366, 768, [['controls', 'graphics', 'audio'], ['theme', 'data', 'bindings']]],
      [1024, 768, [['controls', 'graphics', 'audio'], ['theme', 'data', 'bindings']]],
      [390, 844, [['controls', 'graphics', 'theme', 'audio', 'bindings', 'data']]],
    ];
    for (const [width, height, columns] of cases) {
      await page.setViewportSize({ width, height });
      const l = await layout();
      assert.deepEqual(l.columns, columns, `${width} × ${height}: the canvas's columns`);
      assert.deepEqual(l.wide, [], `${width} × ${height}: nothing scrolls sideways`);
      assert.equal(l.scrolls, 'auto', `${width} × ${height}: the frame's body scrolls vertically`);
    }
    // The largest window: everything fits without the body scrolling, the 3D bindings shown on each device.
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.click('#set-bind-mode [data-value="3d"]');
    for (const device of ['keyboard', 'controller', 'touch']) {
      await page.click(`#set-bind-device [data-value="${device}"]`);
      const fit = await page.evaluate(() => {
        const body = document.getElementById('settings-body');
        return { body: body.scrollHeight - body.clientHeight, page: document.documentElement.scrollHeight - document.documentElement.clientHeight };
      });
      assert.deepEqual(fit, { body: 0, page: 0 }, `1920 × 1080, 3D on ${device}: nothing scrolls`);
    }
    await page.click('#set-bind-device [data-value="keyboard"]');
    await page.click('#set-bind-mode [data-value="classic-2d"]');
    await page.setViewportSize({ width: 390, height: 844 });
    // The phone: the device choice spans the panel, "Keyboard and mouse" on two lines inside its option.
    await page.click('#set-bind-mode [data-value="3d"]');
    const device = await page.evaluate(() => {
      const group = document.getElementById('set-bind-device').getBoundingClientRect();
      const panel = document.querySelector('[data-section="bindings"]');
      const inner = panel.getBoundingClientRect().width - parseFloat(getComputedStyle(panel).paddingLeft) - parseFloat(getComputedStyle(panel).paddingRight);
      const options = [...document.querySelectorAll('#set-bind-device .ui-segmented__option')].map((o) => {
        const range = document.createRange();
        range.selectNodeContents(o);
        const lines = new Set([...range.getClientRects()].map((r) => Math.round(r.top)));
        const box = o.getBoundingClientRect();
        const text = range.getBoundingClientRect();
        return { label: o.textContent, lines: lines.size, inside: text.left >= box.left - 0.5 && text.right <= box.right + 0.5 };
      });
      return { width: group.width, inner, options };
    });
    assert.ok(Math.abs(device.width - device.inner) <= 1, `the device choice spans the panel (${device.width} of ${device.inner})`);
    assert.deepEqual(device.options.map((o) => [o.label, o.inside]), [['Keyboard and mouse', true], ['Controller', true], ['Touch', true]], 'each label inside its option');
    assert.equal(device.options[0].lines, 2, '"Keyboard and mouse" wraps onto two lines');
    assert.deepEqual((await layout()).wide, [], 'nothing overflows the screen');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
