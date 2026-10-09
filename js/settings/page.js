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
// settingControl(key)          → { key, kind: 'slider' | 'toggle' | 'segmented', label, … }.
// settingControlHtml(key, v?)  → the control's kit markup showing v (default: the schema default),
//                                carrying data-setting="key"; ids are `set-<key>`.
// settingsPageHtml()           → the four sections (SETTINGS_SECTIONS) and an empty bindings panel
//                                (#settings-bindings) for bindingsSectionHtml.
// bindingsSectionHtml(glyphs?) → each mode's bindings per input device, controller buttons in
//                                `glyphs`.
// bindSettingControls(elements, store, { onUserChange? }) → unbind. Each element is a control
//   root carrying data-setting: it shows the store's value (also the loaded one, and every change
//   made elsewhere) and writes the player's change to the store at once; onUserChange(key) follows
//   each such write. An unknown setting throws.

import { SCHEMA } from './schema.js';
import { BINDING_MODES, BINDING_DEVICES, bindingRows, bindingsListHtml } from './bindings.js';
import { formatSliderValue, decimalsOf, segmentedState, bindSegmented } from '../ui/components.js';

export const SETTINGS_SECTIONS = Object.freeze([
  Object.freeze({ id: 'controls', title: 'Controls', settings: Object.freeze(['lookSensitivity', 'invertY']) }),
  Object.freeze({ id: 'graphics', title: 'Graphics', settings: Object.freeze(['fullscreen', 'renderResolution']) }),
  Object.freeze({ id: 'theme', title: 'Theme', settings: Object.freeze(['theme']) }),
  Object.freeze({ id: 'audio', title: 'Audio', settings: Object.freeze(['volume', 'muted']) }),
]);

export const SETTING_LABELS = Object.freeze({
  lookSensitivity: 'Look sensitivity',
  invertY: 'Invert look Y',
  fullscreen: 'Fullscreen',
  renderResolution: '3D resolution',
  theme: 'Theme',
  volume: 'Volume',
  muted: 'Mute',
});

export const CHOICE_LABELS = Object.freeze({
  auto: 'Auto', sharp: 'Sharp', fast: 'Fast', light: 'Light', dark: 'Dark',
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

export function settingControlHtml(key, value = SCHEMA[key]?.default) {
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
    return `<label class="ui-toggle" data-setting="${key}"><input type="checkbox" role="switch" id="${id}" class="ui-toggle__input"${value ? ' checked' : ''}>`
      + `<span class="ui-toggle__label">${c.label}</span></label>`;
  }
  const options = c.options.map((o) => `<button type="button" role="radio" aria-checked="${o.value === value}" class="ui-segmented__option" data-value="${o.value}">${o.label}</button>`);
  return `<p class="ui-text" id="${id}-label">${c.label}</p>`
    + `<div class="ui-segmented" role="radiogroup" aria-labelledby="${id}-label" data-setting="${key}" id="${id}">${options.join('')}</div>`;
}

export function settingsPageHtml() {
  const sections = SETTINGS_SECTIONS.map((s) => `<section class="ui-panel ui-actions" aria-labelledby="set-sec-${s.id}">`
    + `<h3 class="ui-heading" id="set-sec-${s.id}">${s.title}</h3>${s.settings.map((k) => settingControlHtml(k)).join('')}</section>`);
  return `<div class="ui-grid">${sections.join('')}</div>`
    + '<section class="ui-panel" aria-labelledby="set-sec-bindings"><h3 class="ui-heading" id="set-sec-bindings">Bindings</h3>'
    + '<div id="settings-bindings" class="ui-grid"></div></section>';
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
  const onChange = () => {
    store.set(key, !!input.checked);
    changed(key);
  };
  input.addEventListener('change', onChange);
  const off = store.onChange(key, (v) => { input.checked = v; });
  return () => { off(); input.removeEventListener('change', onChange); };
}

function bindChoice(root, key, store, changed) {
  const options = [...root.querySelectorAll('.ui-segmented__option')];
  const unbind = bindSegmented(root, {
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
