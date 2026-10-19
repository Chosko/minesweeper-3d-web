// The Settings page: its sections and their controls, generated from the settings schema
// (js/settings/schema.js), the read-only bindings list (js/settings/bindings.js), and the binder
// that ties any setting control — on the page or the pause card — to the store
// (js/settings/store.js). DOM-free: markup is returned as text, and the binder touches only the
// elements it is handed.
//
// A setting's control follows its schema type: a number is a ui-slider over its range, a boolean a
// ui-toggle, a choice a ui-segmented of its values. SLIDERS adds a number's step, display format
// scale (the slider's units per stored unit: volume 0–1 shows as 0–100%) and unit (a suffix: the field of
// view shows as 60°).
//
// A toggle in INVERTED shows on while its boolean is false: Sound is on while `muted` is false.
//
// The theme is a list (ui-segmented--list): one row per theme of the registry (js/themes/registry.js
// THEMES, in catalogue order), its display name after a swatch drawn from that theme's own tokens.
// The swatch's colours are read from the theme's stylesheet text (themeSwatchColors) without
// applying it, so a theme not in use shows its swatch once its stylesheet is fetched.
//
// settingControl(key)          → { key, kind: 'slider' | 'toggle' | 'segmented', label, inverted?, list?, … }.
// settingControlHtml(key, v?, { labelledBy? }) → the control's kit markup showing v (default: the
//                                schema default), carrying data-setting="key"; ids are `set-<key>`.
//                                With labelledBy, a choice shows no label of its own and takes its
//                                name from that element.
// settingsPageHtml()           → one kit column composition (ui-columns, #settings-columns) of the
//                                SETTINGS_COLUMNS, each a ui-column stacking its sections (ui-panel,
//                                data-section naming it, under its ui-section-label): a section per
//                                SETTINGS_SECTIONS entry, each setting a ui-row of its control and,
//                                for a SETTING_NOTES entry, its muted note — the Controls section
//                                ending in the Controls action (#set-controls, CONTROLS_ACTION),
//                                which opens the controls reference — the bindings panel (the Mode
//                                and Device choices, #set-bind-mode and #set-bind-device, then the
//                                list, #settings-bindings, filled by bindingsSectionHtml) and the
//                                Data panel (#settings-data): first the export — its line
//                                (EXPORT_LINE), the hidden nothing-to-export line and "Export history
//                                (CSV)" and "Export all (JSON)" (bound by bindExportActions,
//                                js/records/export.js) — then a rule, the reset's line, the "Reset
//                                all data…" button, the hidden confirmation (RESET_MESSAGE, Reset all
//                                data, Cancel) and the hidden warning line. A control whose label is
//                                its section's title is named by the section label. The columns are
//                                the widest window's; narrower windows regroup the sections by
//                                placement alone (css/style.css), and a section SETTINGS_COLUMNS does
//                                not list joins the last column.
// bindingsSectionHtml(glyphs?, camera?, { mode?, device? }) → the bindings list (dl.controls) of one
//                                mode (default Classic 2D) for one input device (default the keyboard;
//                                one the mode does not list falls back to its first), controller
//                                buttons in `glyphs`, 3D's for the Camera setting's `camera`.
// bindSettingControls(elements, store, { onUserChange?, theme?, themeSheet? }) → unbind. Each element
//   is a control root carrying data-setting: it shows the store's value (also the loaded one, and
//   every change made elsewhere) and writes the player's change to the store at once; onUserChange(key)
//   follows each such write. An unknown setting throws. Given the theme applier (`theme`,
//   js/themes/applier.js), the theme list shows the active theme instead and a pick calls its
//   setTheme(id), saving the setting once the switch resolves; a failed switch puts the selection back
//   on the active theme. Each row's swatch is filled from themeSheet(entry) → Promise of the
//   stylesheet's text (default: fetched from the site root); one that fails leaves it blank.
// themeSwatchColors(cssText, id) → { token: value } for each SWATCH_TOKENS entry the theme's token
//   block (the rule whose selector is :root[data-theme="<id>"]) declares; swatchBackground(colors) →
//   the swatch's background, a stripe per token.
// bindResetPanel({ open, panel, yes, no, note }, { reset }) → { isOpen, close, clear }. The Data
//   panel's elements: `open` shows the confirmation `panel` in its place with focus on Cancel
//   (`no`); Cancel or close() hides it and focuses `open` again. Confirming (`yes`) calls reset()
//   once → Promise of { ok } (the page reloads) or { ok: false, message }, which replaces the
//   confirmation by the warning line `note`; the action stays available. close() → false when
//   nothing is open; clear() closes it and the warning, without moving focus.

import { SCHEMA } from './schema.js';
import { THEMES, themeById } from '../themes/registry.js';
import { SITE_ROOT } from '../themes/applier.js';
import { BINDING_MODES, bindingDevices, bindingRows, bindingsListHtml } from './bindings.js';
import { formatSliderValue, decimalsOf, segmentedState, bindSegmented } from '../ui/components.js';
import { EXPORT_LINE } from '../records/export.js';

export const SETTINGS_SECTIONS = Object.freeze([
  Object.freeze({ id: 'controls', title: 'Controls', settings: Object.freeze(['lookSensitivity', 'invertY', 'camera', 'confirmRestart']) }),
  Object.freeze({ id: 'graphics', title: 'Graphics', settings: Object.freeze(['fullscreen', 'renderResolution', 'boardScale', 'aimReadout', 'fieldOfView']) }),
  Object.freeze({ id: 'theme', title: 'Theme', settings: Object.freeze(['theme']) }),
  Object.freeze({ id: 'audio', title: 'Audio', settings: Object.freeze(['muted', 'volume']) }),
]);

export const SETTING_LABELS = Object.freeze({
  lookSensitivity: 'Look sensitivity',
  invertY: 'Invert look Y',
  fullscreen: 'Fullscreen',
  renderResolution: '3D resolution',
  boardScale: '2D board scale',
  theme: 'Theme',
  volume: 'Volume',
  muted: 'Sound',
  confirmRestart: 'Always ask before restarting',
  aimReadout: '3D neighbour count',
  fieldOfView: 'Field of view',
  camera: 'Camera',
});

/** Toggles shown on while their stored boolean is false. */
const INVERTED = new Set(['muted']);

export const CHOICE_LABELS = Object.freeze({
  auto: 'Auto', sharp: 'Sharp', fast: 'Fast', fit: 'Fit', 100: '100 %', 125: '125 %', fly: 'Fly', orbit: 'Orbit',
});

const SLIDERS = Object.freeze({
  lookSensitivity: Object.freeze({ step: 0.05, format: 'multiplier', scale: 1 }),
  volume: Object.freeze({ step: 1, format: 'percent', scale: 100 }),
  fieldOfView: Object.freeze({ step: 1, format: 'number', scale: 1, unit: '°' }),
});

const KINDS = { number: 'slider', boolean: 'toggle', choice: 'segmented' };

/** The page's columns on the widest window, each a stack of section ids. */
export const SETTINGS_COLUMNS = Object.freeze([
  Object.freeze(['controls', 'audio']),
  Object.freeze(['graphics', 'theme']),
  Object.freeze(['bindings', 'data']),
]);

/** A setting's muted note beside its name: the settings only the 3D game uses. */
export const SETTING_NOTES = Object.freeze({ lookSensitivity: '3D', camera: '3D', fieldOfView: '3D' });

/** The tokens a theme's swatch shows, in stripe order: its ground, surface, accent and ink. */
export const SWATCH_TOKENS = Object.freeze(['--color-ground', '--color-surface', '--color-accent-fill', '--color-ink']);

export function themeSwatchColors(cssText, id) {
  const scope = `:root[data-theme="${id}"]`;
  const css = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const colors = {};
  for (const [, selectors, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectors.split(',').some((sel) => sel.trim() === scope)) continue;
    for (const [, name, value] of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+)/g)) {
      if (SWATCH_TOKENS.includes(name)) colors[name] = value.trim();
    }
  }
  return colors;
}

/** The swatch's background: one equal stripe per SWATCH_TOKENS entry, transparent where the theme declares none. */
export function swatchBackground(colors) {
  const step = 100 / SWATCH_TOKENS.length;
  const stops = SWATCH_TOKENS.map((t, i) => `${colors[t] ?? 'transparent'} ${i * step}% ${(i + 1) * step}%`);
  return `linear-gradient(90deg, ${stops.join(', ')})`;
}

const fetchSheet = (entry) => fetch(new URL(entry.stylesheet, SITE_ROOT)).then((r) => (r.ok ? r.text() : Promise.reject(new Error(`${r.status}`))));

const entryOf = (key) => {
  if (!Object.hasOwn(SCHEMA, key)) throw new Error(`settings page: unknown setting "${key}"`);
  return SCHEMA[key];
};

export function settingControl(key) {
  const entry = entryOf(key);
  const control = { key, kind: KINDS[entry.type], label: SETTING_LABELS[key] ?? key };
  if (entry.type === 'boolean' && INVERTED.has(key)) control.inverted = true;
  if (entry.type === 'number') {
    const { step = 0.01, format = 'number', scale = 1, unit = '' } = SLIDERS[key] ?? {};
    return { ...control, min: entry.min * scale, max: entry.max * scale, step, format, scale, unit };
  }
  if (key === 'theme') {
    return { ...control, list: true, options: THEMES.map((t) => ({ value: t.id, label: t.name })) };
  }
  if (entry.type === 'choice') {
    return { ...control, options: entry.values.map((value) => ({ value, label: CHOICE_LABELS[value] ?? value })) };
  }
  return control;
}

const sliderValue = (c, v) => String(Number((v * c.scale).toFixed(decimalsOf(c.step))));

export function settingControlHtml(key, value = SCHEMA[key]?.default, { labelledBy = null } = {}) {
  const c = settingControl(key);
  const id = `set-${key}`;
  if (c.kind === 'slider') {
    const v = sliderValue(c, value);
    const shown = formatSliderValue(v, { format: c.format, step: c.step, max: c.max, unit: c.unit });
    const scale = c.scale === 1 ? '' : ` data-scale="${c.scale}"`;
    const unit = c.unit ? ` data-unit="${c.unit}"` : '';
    return `<div class="ui-slider" data-setting="${key}"><label class="ui-slider__label" for="${id}">${c.label}</label>`
      + `<output class="ui-slider__value" id="${id}-val" for="${id}">${shown}</output>`
      + `<input type="range" id="${id}" class="ui-slider__input" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" data-format="${c.format}"${scale}${unit}></div>`;
  }
  if (c.kind === 'toggle') {
    const on = c.inverted ? !value : !!value;
    return `<label class="ui-toggle" data-setting="${key}"><input type="checkbox" role="switch" id="${id}" class="ui-toggle__input"${on ? ' checked' : ''}>`
      + `<span class="ui-toggle__label">${c.label}</span></label>`;
  }
  const swatch = c.list ? '<span class="ui-segmented__swatch" aria-hidden="true"></span>' : '';
  const options = c.options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === value}" class="ui-segmented__option" data-value="${o.value}">${swatch}${o.label}</button>`);
  const label = labelledBy ? '' : `<p class="ui-text" id="${id}-label">${c.label}</p>`;
  const cls = c.list ? 'ui-segmented ui-segmented--list' : 'ui-segmented';
  return `${label}<div class="${cls}" role="radiogroup" aria-labelledby="${labelledBy ?? `${id}-label`}" data-setting="${key}" id="${id}">${options.join('')}</div>`;
}

/** The Controls section's action: the controls reference, each mode's bindings, in a panel over the page. */
export const CONTROLS_ACTION = 'Controls';

const sectionLabel = (id, title) => `<div class="ui-section-label"><h3 class="ui-section-label__text" id="set-sec-${id}">${title}</h3></div>`;
const sectionOpen = (id, extra = '') => `<section class="ui-panel ui-actions"${extra} data-section="${id}" aria-labelledby="set-sec-${id}">`;

// One setting's row: its control and, for a SETTING_NOTES entry, the note.
function settingRowHtml(key) {
  const note = SETTING_NOTES[key] ? `<span class="ui-text ui-text--muted" id="set-${key}-note">${SETTING_NOTES[key]}</span>` : '';
  return `<div class="ui-row" data-setting-row="${key}">${settingControlHtml(key)}${note}</div>`;
}

const choiceHtml = (id, label, options, checked) => `<div class="ui-segmented" role="radiogroup" aria-label="${label}" id="${id}">`
  + options.map((o) => `<button type="button" role="radio" aria-checked="${o.id === checked}" class="ui-segmented__option" data-value="${o.id}">${o.label}</button>`).join('')
  + '</div>';

// The devices the Device choice offers: every device a mode lists, in their order.
const choiceDevices = () => [...new Map(BINDING_MODES.flatMap((m) => bindingDevices(m.id)).map((d) => [d.id, d])).values()];

function bindingsPanelHtml() {
  return `${sectionOpen('bindings')}${sectionLabel('bindings', 'Bindings')}`
    + `<div class="ui-row" id="set-bind-choices">${choiceHtml('set-bind-mode', 'Mode', BINDING_MODES, BINDING_MODES[0].id)}`
    + `${choiceHtml('set-bind-device', 'Device', choiceDevices(), choiceDevices()[0].id)}</div>`
    + '<div id="settings-bindings"></div></section>';
}

export function settingsPageHtml() {
  const action = (id) => (id === 'controls'
    ? `<button type="button" class="ui-button ui-button--secondary" id="set-controls">${CONTROLS_ACTION}</button>` : '');
  const panels = new Map(SETTINGS_SECTIONS.map((s) => [s.id, `${sectionOpen(s.id)}${sectionLabel(s.id, s.title)}`
    + `${s.settings.map((k) => (SETTING_LABELS[k] === s.title
      ? settingControlHtml(k, undefined, { labelledBy: `set-sec-${s.id}` }) : settingRowHtml(k))).join('')}${action(s.id)}</section>`]));
  panels.set('bindings', bindingsPanelHtml());
  panels.set('data', dataPanelHtml());
  const listed = new Set(SETTINGS_COLUMNS.flat());
  const columns = SETTINGS_COLUMNS.map((ids, i) => [...ids, ...(i === SETTINGS_COLUMNS.length - 1 ? [...panels.keys()].filter((id) => !listed.has(id)) : [])]);
  return `<div class="ui-columns" id="settings-columns">${columns.map((ids) => `<div class="ui-column">${ids.map((id) => panels.get(id)).join('')}</div>`).join('')}</div>`;
}

export const RESET_MESSAGE = 'Delete your records, game history, replays, settings, last board choices (Classic 2D and 3D) '
  + 'and first-use hints from this browser? This cannot be undone.';

// The Data panel: the place of everything about the player's stored data.
function dataPanelHtml() {
  return `${sectionOpen('data', ' id="settings-data"')}${sectionLabel('data', 'Data')}`
    + `<p class="ui-text ui-text--muted" id="set-export-text">${EXPORT_LINE}</p>`
    + '<p class="ui-text ui-text--muted hidden" id="set-export-note" role="status"></p>'
    + '<div class="ui-actions ui-actions--row">'
    + '<button type="button" class="ui-button ui-button--secondary" id="set-export-csv">Export history (CSV)</button>'
    + '<button type="button" class="ui-button ui-button--secondary" id="set-export-json">Export all (JSON)</button>'
    + '</div><hr class="ui-divider">'
    + '<p class="ui-text ui-text--muted">Delete everything the game keeps in this browser and start over as a new player.</p>'
    + '<p class="ui-text ui-text--warning hidden" id="set-reset-note" role="status"></p>'
    + '<button type="button" class="ui-button ui-button--secondary" id="set-reset">Reset all data…</button>'
    + '<div class="ui-panel ui-actions hidden" id="set-reset-confirm" role="alertdialog" aria-labelledby="set-reset-text">'
    + `<p class="ui-text" id="set-reset-text">${RESET_MESSAGE}</p>`
    + '<button type="button" class="ui-button ui-button--primary" id="set-reset-yes">Reset all data</button>'
    + '<button type="button" class="ui-button ui-button--secondary" id="set-reset-no">Cancel</button>'
    + '</div></section>';
}

export function bindResetPanel({ open, panel, yes, no, note }, { reset }) {
  let busy = false;
  const show = (el, on) => el.classList.toggle('hidden', !on);
  const isOpen = () => !panel.classList.contains('hidden');

  function close({ focus = true } = {}) {
    if (!isOpen()) return false;
    if (busy) return true; // the reset is running: Back waits for its answer
    show(panel, false);
    show(open, true);
    if (focus) open.focus();
    return true;
  }

  open.addEventListener('click', () => {
    show(note, false);
    show(open, false);
    show(panel, true);
    no.focus();
  });
  no.addEventListener('click', () => close());
  yes.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    yes.disabled = true;
    no.disabled = true;
    let result;
    try {
      result = await reset();
    } catch {
      result = null;
    }
    busy = false;
    yes.disabled = false;
    no.disabled = false;
    if (result?.ok) return; // the page reloads
    note.textContent = result?.message ?? 'Your data could not be deleted.';
    show(note, true);
    close();
  });

  return {
    isOpen,
    close,
    clear() {
      close({ focus: false });
      show(note, false);
      note.textContent = '';
    },
  };
}

export function bindingsSectionHtml(glyphs, camera, { mode = BINDING_MODES[0].id, device = 'keyboard' } = {}) {
  const devices = bindingDevices(mode);
  const shown = devices.some((d) => d.id === device) ? device : devices[0].id;
  return `<dl class="controls">${bindingsListHtml(bindingRows(mode, shown, camera), glyphs)}</dl>`;
}

const hasClass = (el, cls) => (el.getAttribute('class') ?? '').split(/\s+/).includes(cls);

function bindSlider(root, key, store, changed) {
  const input = root.querySelector('.ui-slider__input');
  const output = root.querySelector('.ui-slider__value');
  const scale = Number(input.getAttribute('data-scale') ?? 1) || 1;
  const step = input.getAttribute('step') ?? undefined;
  const show = () => {
    output.textContent = formatSliderValue(input.value, {
      format: input.getAttribute('data-format') ?? undefined,
      unit: input.getAttribute('data-unit') ?? undefined,
      step,
      max: input.getAttribute('max') ?? undefined,
    });
  };
  const onInput = () => {
    show();
    store.set(key, Number(input.value) / scale);
    changed(key);
  };
  input.addEventListener('input', onInput);
  const off = store.onChange(key, (v) => {
    input.value = String(Number((v * scale).toFixed(decimalsOf(step))));
    show();
  });
  return () => { off(); input.removeEventListener('input', onInput); };
}

function bindToggle(root, key, store, changed) {
  const input = root.querySelector('.ui-toggle__input');
  const shown = INVERTED.has(key) ? (v) => !v : (v) => !!v; // the same flip both ways
  const onChange = () => {
    store.set(key, shown(input.checked));
    changed(key);
  };
  input.addEventListener('change', onChange);
  const off = store.onChange(key, (v) => { input.checked = shown(v); });
  return () => { off(); input.removeEventListener('change', onChange); };
}

function showChoice(options, v) {
  const states = segmentedState(options.length, options.findIndex((o) => o.getAttribute('data-value') === v));
  states.forEach((s, i) => {
    options[i].setAttribute('aria-checked', String(s.checked));
    options[i].tabIndex = s.tabIndex;
  });
}

function bindChoice(root, key, store, changed) {
  const options = [...root.querySelectorAll('.ui-segmented__option')];
  const unbind = bindSegmented(root, {
    horizontal: true, // Up and Down move focus off the choice
    onChange: (value) => {
      store.set(key, value);
      changed(key);
    },
  });
  const off = store.onChange(key, (v) => showChoice(options, v));
  return () => { off(); unbind(); };
}

// The theme list bound to the theme applier: it shows the active theme, and a pick is saved only once
// the applier has switched to it.
function bindThemeList(root, store, changed, theme, themeSheet) {
  const options = [...root.querySelectorAll('.ui-segmented__option')];
  let live = true;
  const unbind = bindSegmented(root, {
    horizontal: true, // Up and Down move focus from row to row
    onChange: (value) => {
      let switching;
      try { switching = Promise.resolve(theme.setTheme(value)); } catch (e) { switching = Promise.reject(e); }
      switching.then(() => {
          store.set('theme', value);
          changed('theme');
        }, () => { if (live) showChoice(options, theme.current()); });
    },
  });
  const off = theme.onThemeChange((id) => showChoice(options, id));
  showChoice(options, theme.current());
  for (const option of options) {
    const swatch = option.querySelector('.ui-segmented__swatch');
    if (!swatch) continue;
    const id = option.getAttribute('data-value');
    let sheet;
    try { sheet = Promise.resolve(themeSheet(themeById(id))); } catch (e) { sheet = Promise.reject(e); }
    sheet.then((css) => {
      if (!live) return;
      swatch.style.setProperty('background', swatchBackground(themeSwatchColors(css, id)));
    }, () => { /* no swatch: the row still names its theme */ });
  }
  return () => { live = false; off(); unbind(); };
}

export function bindSettingControls(elements, store, { onUserChange = () => {}, theme = null, themeSheet = fetchSheet } = {}) {
  const changed = (key) => { try { onUserChange(key); } catch { /* reporting never blocks a change */ } };
  const unbinds = [...elements].map((el) => {
    const key = el.getAttribute('data-setting');
    entryOf(key);
    if (hasClass(el, 'ui-slider')) return bindSlider(el, key, store, changed);
    if (hasClass(el, 'ui-toggle')) return bindToggle(el, key, store, changed);
    if (hasClass(el, 'ui-segmented') && key === 'theme' && theme) return bindThemeList(el, store, changed, theme, themeSheet);
    if (hasClass(el, 'ui-segmented')) return bindChoice(el, key, store, changed);
    throw new Error(`settings page: no control for "${key}"`);
  });
  return () => { for (const u of unbinds) u(); };
}
