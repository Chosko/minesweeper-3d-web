// Classic 2D board choice screen: Beginner, Intermediate, Expert, a custom board and the no-guess
// switch, preselected from the last board choice. Touches only the elements it is handed.
//
// Pure helpers:
//   CHOICE_SIZES             the standard sizes offered as menu items, in order.
//   sizeLabel(size)          '30 × 16 · 99 mines'.
//   customStatus(custom)     { ok, field, max, text } for a custom { width, height, mines }: the info
//                            line under the custom fields, validated against CUSTOM_LIMITS
//                            (js/classic2d/board-setup.js validateCustom) — a refusal's reason as a
//                            sentence, or '2 cells · up to 1 mine' with both counts pluralised;
//                            `max` is the mine limit for that width and height (null while the size
//                            is invalid).
//   readChoice({ size, fields, noGuess }, fallbackCustom?)  the board choice the screen's fields
//                            describe, or null. A standard size keeps the fields' custom board
//                            when it is valid, else `fallbackCustom`; 'custom' needs valid fields.
//   densityHintShown(custom, noGuess)  whether the density hint shows for a custom board: no-guess
//                            on and a valid board above NOGUESS_DENSITY_HINT (board-setup.js).
//
// bindBoardChoice({ root, onStart, onBack }) → { show(choice), destroy() }
//   root      the screen's element: items [data-size] (the standard sizes, and the custom form's
//             submit button as data-size="custom"), the custom form (form), inputs
//             [data-field="width|height|mines"], the info line [data-info] and the density hint
//             [data-density-hint] under it, the no-guess switch [data-noguess] (under the sizes,
//             for every board) and the Back button [data-back]. The info line and the density hint
//             follow the fields and the switch live; the hint never refuses a board.
//   show(choice, { played, details })  fills the fields and the switch from `choice` and marks its
//             size with data-last, the screen's default focus; its "Last played" detail line shows
//             only when `played` (default true) — not for the default choice of a player who never
//             played. `details` ({ [size]: { guess, noGuess } }, the shell's from
//             js/shell/returning.js) fills each size's detail line [data-detail], under its size line,
//             for the position of the no-guess switch, and again whenever the switch changes; a size
//             without one shows no detail line.
//   onStart(choice) when a size is picked or a valid custom board submitted; onBack() on Back.

import {
  STANDARD_SIZES, validateCustom, maxMines, normaliseChoice, aboveDensityHint, DENSITY_HINT_TEXT,
} from './board-setup.js';
import { CUSTOM_LIMITS } from '../engine/profiles.js';

export const CHOICE_SIZES = Object.freeze(['beginner', 'intermediate', 'expert']);

export function sizeLabel(size) {
  const { width, height, mines } = STANDARD_SIZES[size];
  return `${width} × ${height} · ${mines} mines`;
}

const side = (v) => Number.isInteger(v) && v >= CUSTOM_LIMITS.minSide && v <= CUSTOM_LIMITS.maxSide;
const count = (v, noun) => `${v.toLocaleString('en-US')} ${v === 1 ? noun : `${noun}s`}`;

export function customStatus(custom) {
  const { width, height } = custom ?? {};
  const v = validateCustom(custom);
  const max = side(width) && side(height) ? maxMines(width, height) : null;
  if (!v.ok) return { ok: false, field: v.field, max, text: `${v.reason[0].toUpperCase()}${v.reason.slice(1)}.` };
  const cells = width * height;
  return { ok: true, field: null, max, text: `${count(cells, 'cell')} · up to ${count(max, 'mine')}` };
}

const int = (v) => (typeof v === 'number' ? v : /^\s*-?\d+\s*$/.test(String(v)) ? parseInt(v, 10) : NaN);

export function readChoice({ size, fields, noGuess }, fallbackCustom = null) {
  const custom = { width: int(fields.width), height: int(fields.height), mines: int(fields.mines) };
  const valid = validateCustom(custom).ok;
  if (size === 'custom') return valid ? normaliseChoice({ size, custom, noGuess: !!noGuess }) : null;
  return normaliseChoice({ size, custom: valid ? custom : fallbackCustom ?? undefined, noGuess: !!noGuess });
}

export function densityHintShown(custom, noGuess) {
  if (!noGuess || !validateCustom(custom).ok) return false;
  return aboveDensityHint(custom.mines, custom.width * custom.height);
}

export function bindBoardChoice({ root, onStart, onBack }) {
  const items = [...root.querySelectorAll('[data-size]')];
  const form = root.querySelector('form');
  const field = (name) => root.querySelector(`[data-field="${name}"]`);
  const inputs = ['width', 'height', 'mines'].map(field);
  const info = root.querySelector('[data-info]');
  const hint = root.querySelector('[data-density-hint]');
  const noGuess = root.querySelector('[data-noguess]');
  const back = root.querySelector('[data-back]');
  hint.textContent = DENSITY_HINT_TEXT;
  let last = null;
  let details = {};

  for (const b of items) {
    if (!b.classList.contains('ui-menu__item')) continue;
    const detail = b.ownerDocument.createElement('span');
    detail.className = 'ui-menu__detail hidden';
    detail.dataset.detail = '';
    b.appendChild(detail);
    const line = b.ownerDocument.createElement('span');
    line.className = 'ui-menu__detail hidden';
    line.dataset.last = '';
    line.textContent = 'Last played';
    b.appendChild(line);
  }
  const fillDetails = () => {
    for (const b of items) {
      const line = b.querySelector('[data-detail]');
      if (!line) continue;
      const text = details[b.dataset.size]?.[noGuess.checked ? 'noGuess' : 'guess'] ?? '';
      line.textContent = text;
      line.classList.toggle('hidden', !text);
    }
  };
  const onNoGuess = () => { fillDetails(); update(); };

  const fields = () => ({ width: inputs[0].value, height: inputs[1].value, mines: inputs[2].value });
  const custom = () => ({ width: int(inputs[0].value), height: int(inputs[1].value), mines: int(inputs[2].value) });
  const update = () => {
    const s = customStatus(custom());
    info.textContent = s.text;
    info.classList.toggle('ui-text--warning', !s.ok);
    info.classList.toggle('ui-text--muted', s.ok);
    if (s.max !== null) inputs[2].max = String(s.max);
    for (const [i, name] of ['width', 'height', 'mines'].entries()) {
      inputs[i].toggleAttribute('data-adjusted', s.field === name);
    }
    hint.classList.toggle('hidden', !densityHintShown(custom(), noGuess.checked));
    return s;
  };
  const start = (size) => {
    const choice = readChoice({ size, fields: fields(), noGuess: noGuess.checked }, last?.custom);
    if (choice) onStart(choice);
    return choice;
  };

  const onItem = (event) => {
    const size = event.currentTarget.dataset.size;
    if (size !== 'custom') start(size);
  };
  const onSubmit = (event) => {
    event.preventDefault();
    const s = update();
    if (!s.ok) {
      root.querySelector(`[data-field="${s.field}"]`)?.focus();
      return;
    }
    start('custom');
  };
  const onBackClick = () => onBack?.();

  for (const b of items) b.addEventListener('click', onItem);
  for (const inp of inputs) inp.addEventListener('input', update);
  noGuess.addEventListener('change', onNoGuess);
  form.addEventListener('submit', onSubmit);
  back?.addEventListener('click', onBackClick);

  return {
    show(choice, { played = true, details: lines = {} } = {}) {
      last = choice;
      details = lines;
      inputs[0].value = String(choice.custom.width);
      inputs[1].value = String(choice.custom.height);
      inputs[2].value = String(choice.custom.mines);
      noGuess.checked = !!choice.noGuess;
      for (const b of items) {
        const isLast = b.dataset.size === choice.size;
        b.toggleAttribute('data-last', isLast);
        b.querySelector('[data-last]')?.classList.toggle('hidden', !(isLast && played));
      }
      fillDetails();
      update();
    },
    destroy() {
      for (const b of items) b.removeEventListener('click', onItem);
      for (const inp of inputs) inp.removeEventListener('input', update);
      noGuess.removeEventListener('change', onNoGuess);
      form.removeEventListener('submit', onSubmit);
      back?.removeEventListener('click', onBackClick);
    },
  };
}
