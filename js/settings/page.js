// The Settings page: its sections and their controls, generated from the settings schema
// (js/settings/schema.js), the read-only bindings list (js/settings/bindings.js), and the binder
// that ties any setting control — on the page, the pause card or the main menu — to the store
// (js/settings/store.js). DOM-free: markup is returned as text, and the binder touches only the
// elements it is handed.
//
// A setting's control follows its schema type: a number is a ui-slider over its range, a boolean a
// ui-toggle, a choice a ui-segmented of its values. SLIDERS adds a number's step, display format
// and scale (the slider's units per stored unit: volume 0–1 shows as 0–100%).
//
// A toggle in INVERTED shows on while its boolean is false: Sound is on while `muted` is false.
//
// settingControl(key)          → { key, kind: 'slider' | 'toggle' | 'segmented', label, inverted?, … }.
// settingControlHtml(key, v?, { labelledBy? }) → the control's kit markup showing v (default: the
//                                schema default), carrying data-setting="key"; ids are `set-<key>`.
//                                With labelledBy, a choice shows no label of its own and takes its
//                                name from that element.
// settingsPageHtml()           → the four sections (SETTINGS_SECTIONS), an empty bindings panel
//                                (#settings-bindings) for bindingsSectionHtml, and the Data panel
//                                (#settings-data): its line, the "Reset all data…" button, the
//                                hidden confirmation (RESET_MESSAGE, Reset all data, Cancel) and the
//                                hidden warning line. A control whose label is its section's title
//                                is named by the section heading.
// bindingsSectionHtml(glyphs?) → each mode's bindings per input device, controller buttons in
//                                `glyphs`.
// bindSettingControls(elements, store, { onUserChange? }) → unbind. Each element is a control
//   root carrying data-setting: it shows the store's value (also the loaded one, and every change
//   made elsewhere) and writes the player's change to the store at once; onUserChange(key) follows
//   each such write. An unknown setting throws.
// bindResetPanel({ open, panel, yes, no, note }, { reset }) → { isOpen, close, clear }. The Data
//   panel's elements: `open` shows the confirmation `panel` in its place with focus on Cancel
//   (`no`); Cancel or close() hides it and focuses `open` again. Confirming (`yes`) calls reset()
//   once → Promise of { ok } (the page reloads) or { ok: false, message }, which replaces the
//   confirmation by the warning line `note`; the action stays available. close() → false when
//   nothing is open; clear() closes it and the warning, without moving focus.

import { SCHEMA } from './schema.js';
import { BINDING_MODES, BINDING_DEVICES, bindingRows, bindingsListHtml } from './bindings.js';
import { formatSliderValue, decimalsOf, segmentedState, bindSegmented } from '../ui/components.js';

export const SETTINGS_SECTIONS = Object.freeze([
  Object.freeze({ id: 'controls', title: 'Controls', settings: Object.freeze(['lookSensitivity', 'invertY', 'confirmRestart']) }),
  Object.freeze({ id: 'graphics', title: 'Graphics', settings: Object.freeze(['fullscreen', 'renderResolution', 'boardScale']) }),
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
});

/** Toggles shown on while their stored boolean is false. */
const INVERTED = new Set(['muted']);

export const CHOICE_LABELS = Object.freeze({
  auto: 'Auto', sharp: 'Sharp', fast: 'Fast', light: 'Light', dark: 'Dark', fit: 'Fit', 100: '100 %', 125: '125 %',
});

const SLIDERS = Object.freeze({
  lookSensitivity: Object.freeze({ step: 0.05, format: 'multiplier', scale: 1 }),
  volume: Object.freeze({ step: 1, format: 'percent', scale: 100 }),
});

const KINDS = { number: 'slider', boolean: 'toggle', choice: 'segmented' };

const entryOf = (key) => {
  if (!Object.hasOwn(SCHEMA, key)) throw new Error(`settings page: unknown setting "${key}"`);
  return SCHEMA[key];
};

export function settingControl(key) {
  const entry = entryOf(key);
  const control = { key, kind: KINDS[entry.type], label: SETTING_LABELS[key] ?? key };
  if (entry.type === 'boolean' && INVERTED.has(key)) control.inverted = true;
  if (entry.type === 'number') {
    const { step = 0.01, format = 'number', scale = 1 } = SLIDERS[key] ?? {};
    return { ...control, min: entry.min * scale, max: entry.max * scale, step, format, scale };
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
    const shown = formatSliderValue(v, { format: c.format, step: c.step, max: c.max });
    const scale = c.scale === 1 ? '' : ` data-scale="${c.scale}"`;
    return `<div class="ui-slider" data-setting="${key}"><label class="ui-slider__label" for="${id}">${c.label}</label>`
      + `<output class="ui-slider__value" id="${id}-val" for="${id}">${shown}</output>`
      + `<input type="range" id="${id}" class="ui-slider__input" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}" data-format="${c.format}"${scale}></div>`;
  }
  if (c.kind === 'toggle') {
    const on = c.inverted ? !value : !!value;
    return `<label class="ui-toggle" data-setting="${key}"><input type="checkbox" role="switch" id="${id}" class="ui-toggle__input"${on ? ' checked' : ''}>`
      + `<span class="ui-toggle__label">${c.label}</span></label>`;
  }
  const options = c.options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === value}" class="ui-segmented__option" data-value="${o.value}">${o.label}</button>`);
  const label = labelledBy ? '' : `<p class="ui-text" id="${id}-label">${c.label}</p>`;
  return `${label}<div class="ui-segmented" role="radiogroup" aria-labelledby="${labelledBy ?? `${id}-label`}" data-setting="${key}" id="${id}">${options.join('')}</div>`;
}

export function settingsPageHtml() {
  const sections = SETTINGS_SECTIONS.map((s) => `<section class="ui-panel ui-actions" aria-labelledby="set-sec-${s.id}">`
    + `<h3 class="ui-heading" id="set-sec-${s.id}">${s.title}</h3>`
    + `${s.settings.map((k) => settingControlHtml(k, undefined, { labelledBy: SETTING_LABELS[k] === s.title ? `set-sec-${s.id}` : null })).join('')}</section>`);
  return `<div class="ui-grid">${sections.join('')}</div>`
    + '<section class="ui-panel" aria-labelledby="set-sec-bindings"><h3 class="ui-heading" id="set-sec-bindings">Bindings</h3>'
    + '<div id="settings-bindings" class="ui-grid"></div></section>'
    + dataPanelHtml();
}

export const RESET_MESSAGE = 'Delete your records, game history, replays, settings, last board choices (Classic 2D and 3D) '
  + 'and first-use hints from this browser? This cannot be undone.';

// The Data panel: the place of everything about the player's stored data.
function dataPanelHtml() {
  return '<section class="ui-panel ui-actions" id="settings-data" aria-labelledby="set-sec-data">'
    + '<h3 class="ui-heading" id="set-sec-data">Data</h3>'
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

export function bindingsSectionHtml(glyphs) {
  return BINDING_MODES.flatMap((mode) => BINDING_DEVICES.map((device) => '<div>'
    + `<h4 class="ui-heading">${mode.label} · ${device.label}</h4>`
    + `<dl class="controls">${bindingsListHtml(bindingRows(mode.id, device.id), glyphs)}</dl></div>`)).join('');
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

function bindChoice(root, key, store, changed) {
  const options = [...root.querySelectorAll('.ui-segmented__option')];
  const unbind = bindSegmented(root, {
    horizontal: true, // Up and Down move focus off the choice
    onChange: (value) => {
      store.set(key, value);
      changed(key);
    },
  });
  const off = store.onChange(key, (v) => {
    const states = segmentedState(options.length, options.findIndex((o) => o.getAttribute('data-value') === v));
    states.forEach((s, i) => {
      options[i].setAttribute('aria-checked', String(s.checked));
      options[i].tabIndex = s.tabIndex;
    });
  });
  return () => { off(); unbind(); };
}

export function bindSettingControls(elements, store, { onUserChange = () => {} } = {}) {
  const changed = (key) => { try { onUserChange(key); } catch { /* reporting never blocks a change */ } };
  const unbinds = [...elements].map((el) => {
    const key = el.getAttribute('data-setting');
    entryOf(key);
    if (hasClass(el, 'ui-slider')) return bindSlider(el, key, store, changed);
    if (hasClass(el, 'ui-toggle')) return bindToggle(el, key, store, changed);
    if (hasClass(el, 'ui-segmented')) return bindChoice(el, key, store, changed);
    throw new Error(`settings page: no control for "${key}"`);
  });
  return () => { for (const u of unbinds) u(); };
}
