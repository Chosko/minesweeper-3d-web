// The bindings source: each mode's controls per input device, as shown read-only by the Settings
// page (js/settings/page.js) and by the in-game help (js/ui.js). One table, so the two never
// disagree; rebinding is not offered here. DOM-free.
//
// A row is [input, action]. In either text, `[Key]` is a keyboard key and `{name}` a controller
// button, named by its position in the standard mapping (a, b, x, y, lb, rb, lt, rt, start,
// back) and drawn with the active controller's glyphs (js/gamepad.js GLYPHS).
//
// bindingRows(mode, device) → the rows; an unknown mode or device throws.
// bindingsListHtml(rows, glyphs?) → the <dt>/<dd> pairs of a `dl.controls` list, text escaped.

import { GLYPHS } from '../gamepad.js';

export const BINDING_MODES = Object.freeze([
  Object.freeze({ id: 'classic-2d', label: 'Classic 2D' }),
  Object.freeze({ id: '3d', label: '3D' }),
]);

export const BINDING_DEVICES = Object.freeze([
  Object.freeze({ id: 'keyboard', label: 'Keyboard and mouse' }),
  Object.freeze({ id: 'controller', label: 'Controller' }),
]);

const rows = (list) => Object.freeze(list.map((r) => Object.freeze(r)));

export const BINDINGS = Object.freeze({
  'classic-2d': Object.freeze({
    keyboard: rows([
      ['Left click', 'Reveal a cell; on a number, chord'],
      ['Middle click', 'Reveal a cell; on a number, chord'],
      ['Right click', 'Flag / unflag'],
      ['Left + Right', 'Chord: reveal the neighbours of a satisfied number'],
      ['Arrow keys', 'Move the cursor'],
      ['[Space] / [Enter]', 'Reveal at the cursor'],
      ['[F]', 'Flag / unflag at the cursor'],
      ['[D]', 'Chord at the cursor'],
      ['Wheel / [Shift] + drag', 'Scroll a board larger than the window'],
      ['[Esc]', 'Pause menu'],
    ]),
    controller: rows([
      ['D-pad / left stick', 'Move the cursor'],
      ['{a} / {rt}', 'Reveal'],
      ['{x} / {lt}', 'Flag / unflag'],
      ['{y}', 'Chord'],
      ['{lt} + {rt}', 'Chord'],
      ['{start} / {b} / {back}', 'Pause'],
    ]),
  }),
  '3d': Object.freeze({
    keyboard: rows([
      ['Mouse', 'Look around'],
      ['[W][A][S][D]', 'Fly forward / left / back / right'],
      ['[Q] [E]', 'Move down / up'],
      ['Left click', 'Reveal the aimed cube'],
      ['Right click', 'Flag / unflag (on a number: flag or unflag all its closed neighbours)'],
      ['Left + Right', 'Chord: reveal neighbours of a satisfied number'],
      ['Wheel', 'Change spacing between cubes'],
      ['Hold [Shift]', 'Fade everything except the aimed cube\'s neighbours'],
      ['Hold [Space]', 'Aim through revealed numbers (they fade)'],
      ['Hold [Ctrl]', 'Show hidden cells (empty and completed ones)'],
      ['[F] / [M]', 'Fullscreen / sound on-off'],
      ['[Esc]', 'Pause menu'],
    ]),
    controller: rows([
      ['Left / right stick', 'Fly / look around'],
      ['{rt} / {lt}', 'Reveal / flag (on release)'],
      ['{lt} + {rt}', 'Chord'],
      ['{a} / {b}', 'Move up / down'],
      ['Hold {lb} {rb} {y}', 'Neighbours only / aim through numbers / show hidden'],
      ['D-pad ↑ ↓', 'Change spacing'],
      ['{x}', 'Show / hide the controls help'],
      ['{start} / {back}', 'Pause'],
      ['Menus', 'D-pad or left stick to move, {a} select, {b} / {back} back'],
    ]),
  }),
});

export function bindingRows(mode, device) {
  const byDevice = Object.hasOwn(BINDINGS, mode) ? BINDINGS[mode] : null;
  if (!byDevice) throw new Error(`bindings: unknown mode "${mode}"`);
  if (!Object.hasOwn(byDevice, device)) throw new Error(`bindings: unknown device "${device}"`);
  return byDevice[device];
}

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function render(text, glyphs) {
  return text.split(/(\[[^\]]+\]|\{[a-z]+\})/).map((part) => {
    if (/^\[[^\]]+\]$/.test(part)) return `<kbd>${escape(part.slice(1, -1))}</kbd>`;
    if (/^\{[a-z]+\}$/.test(part)) {
      const name = part.slice(1, -1);
      return Object.hasOwn(glyphs, name) ? `<kbd class="pad">${escape(glyphs[name])}</kbd>` : escape(part);
    }
    return escape(part);
  }).join('');
}

export function bindingsListHtml(list, glyphs = GLYPHS.generic) {
  return list.map(([input, action]) => `<dt>${render(input, glyphs)}</dt><dd>${render(action, glyphs)}</dd>`).join('');
}
