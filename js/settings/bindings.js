// The bindings source: each mode's controls per input device, as shown read-only by the Settings
// page (js/settings/page.js) and by the in-game help surfaces (js/ui.js): the pause card, the main
// menu's Controls panel, the H panel, the HUD strip and the first-use hint strips. One table, so
// they never disagree; rebinding is not offered here. DOM-free.
//
// A row is [input, action]. In either text, `[Key]` is a keyboard key and `{name}` a controller
// button, named by its position in the standard mapping (a, b, x, y, lb, rb, lt, rt, start,
// back) and drawn with the active controller's glyphs (js/gamepad.js GLYPHS).
//
// bindingRows(mode, device) → the rows; an unknown mode or device throws.
// bindingsListHtml(rows, glyphs?) → the <dt>/<dd> pairs of a `dl.controls` list, text escaped.
// bindingsHtml(mode, device, glyphs?) → the bindings component: that mode's rows for that device.
// hudStripHtml(mode, device, glyphs?, { muted }) → the HUD strip: only the keys or buttons the
//   mode binds on that device (F flags in Classic 2D, so it is not listed there).
// hintStripHtml(mode, device, glyphs?) → the first-use hint strip of that mode, " · " between items.
// helpFootHtml(mode, device, glyphs?) → the H panel's foot line; the release rule only in 3D.
// hintText(name, device, glyphs?) → a one-time hint's plain text (`autoHide`, `aimHint`).
// createActiveDevice({ onChange }) → the active device: the controller while the last input came
//   from a connected controller, otherwise the keyboard and mouse.

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
      ['[H] / [M]', 'Help / sound on-off'],
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
      ['[Home] / [R]', 'Back to the start view'],
      ['Left click', 'Reveal the aimed cube'],
      ['Right click', 'Flag / unflag (on a number: flag or unflag all its closed neighbours)'],
      ['Left + Right', 'Chord: reveal neighbours of a satisfied number'],
      ['Wheel', 'Change spacing between cubes'],
      ['Hold [Shift]', 'Fade everything except the aimed cube\'s neighbours'],
      ['Hold or tap [Space]', 'Aim through revealed numbers (they fade); a tap keeps it on until the next tap'],
      ['Hold [Ctrl]', 'Show hidden cells (empty and completed ones)'],
      ['[H] / [M] / [F]', 'Help / sound on-off / fullscreen'],
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

/** The bindings component: the rows of `mode` for `device`, the controller drawn in `glyphs`. */
export function bindingsHtml(mode, device, glyphs = GLYPHS.generic) {
  return bindingsListHtml(bindingRows(mode, device), glyphs);
}

const table = (byMode) => Object.freeze(Object.fromEntries(Object.entries(byMode).map(([mode, byDevice]) => [mode,
  Object.freeze(Object.fromEntries(Object.entries(byDevice).map(([device, list]) => [device, rows(list)])))])));
const pick = (t, mode, device, what) => {
  if (!Object.hasOwn(t, mode)) throw new Error(`${what}: unknown mode "${mode}"`);
  if (!Object.hasOwn(t[mode], device)) throw new Error(`${what}: unknown device "${device}"`);
  return t[mode][device];
};

/** The HUD strip per mode and device: only what the mode binds there. `sound` reads "sound on/off". */
export const HUD_STRIP = table({
  'classic-2d': {
    keyboard: [['[H]', 'help'], ['[M]', 'sound'], ['[Esc]', 'menu']],
    controller: [['{start}', 'menu']],
  },
  '3d': {
    keyboard: [['[H]', 'help'], ['[M]', 'sound'], ['[F]', 'fullscreen'], ['[Esc]', 'menu']],
    controller: [['{x}', 'help'], ['{start}', 'menu']],
  },
});

/** The first-use hint strip per mode and device. */
export const HINT_STRIP = table({
  'classic-2d': {
    keyboard: [['Arrows', 'move'], ['[Space]', 'reveal'], ['[F]', 'flag'], ['[D]', 'chord']],
    controller: [['D-pad', 'move'], ['{a}', 'reveal'], ['{x}', 'flag'], ['{y}', 'chord']],
  },
  '3d': {
    keyboard: [['Left', 'reveal'], ['Right', 'flag'], ['Hold [Space]', 'aim through'], ['Hold [Shift]', 'neighbours']],
    controller: [['{rt}', 'reveal'], ['{lt}', 'flag'], ['Hold {rb}', 'aim through'], ['Hold {lb}', 'neighbours']],
  },
});

/** The H panel's foot line: the release rule only in the mode that has it (3D). */
export const HELP_FOOT = Object.freeze({
  'classic-2d': Object.freeze({ keyboard: '[H] hides this panel.', controller: '[H] hides this panel.' }),
  '3d': Object.freeze({
    keyboard: 'Actions fire when the mouse button is released. [H] hides this panel.',
    controller: 'Actions fire when the trigger is released. {x} hides this panel.',
  }),
});

/** The one-time hints' text per device. */
export const HINT_TEXT = Object.freeze({
  autoHide: Object.freeze({ keyboard: 'Solved cubes hide. Hold [Ctrl] to see them.', controller: 'Solved cubes hide. Hold {y} to see them.' }),
  aimHint: Object.freeze({ keyboard: 'Hold [Space] to aim through numbers.', controller: 'Hold {rb} to aim through numbers.' }),
});

export function hudStripHtml(mode, device, glyphs = GLYPHS.generic, { muted = false } = {}) {
  return pick(HUD_STRIP, mode, device, 'HUD strip').map(([input, action]) => {
    const label = action === 'sound' ? `sound ${muted ? 'off' : 'on'}` : action;
    return `<span class="kbd-hint">${render(input, glyphs)} ${escape(label)}</span>`;
  }).join('');
}

export function hintStripHtml(mode, device, glyphs = GLYPHS.generic) {
  return pick(HINT_STRIP, mode, device, 'hint strip').map(([input, action]) => `${render(input, glyphs)} ${render(action, glyphs)}`).join(' &middot; ');
}

export function helpFootHtml(mode, device, glyphs = GLYPHS.generic) {
  return render(pick(HELP_FOOT, mode, device, 'help foot'), glyphs);
}

export function hintText(name, device, glyphs = GLYPHS.generic) {
  if (!Object.hasOwn(HINT_TEXT, name)) throw new Error(`hint text: unknown hint "${name}"`);
  const t = HINT_TEXT[name][device];
  if (t === undefined) throw new Error(`hint text: unknown device "${device}"`);
  return t.replace(/\[([^\]]+)\]/g, '$1').replace(/\{([a-z]+)\}/g, (m, name2) => (Object.hasOwn(glyphs, name2) ? glyphs[name2] : m));
}

const DEVICE_OF_INPUT = Object.freeze({ pad: 'controller', keyboard: 'keyboard', pointer: 'keyboard' });

/**
 * The active device: 'controller' while the last input (`input('pad')`) came from a connected
 * controller, otherwise 'keyboard' (the keyboard and mouse: `input('keyboard' | 'pointer')`, or the
 * controller disconnected). `onChange(device)` runs once per change.
 */
export function createActiveDevice({ onChange = () => {} } = {}) {
  let current = 'keyboard';
  let connected = false;
  const set = (d) => { if (d !== current) { current = d; onChange(d); } };
  return {
    get current() { return current; },
    input(source) {
      if (!Object.hasOwn(DEVICE_OF_INPUT, source)) throw new Error(`active device: unknown input "${source}"`);
      const d = DEVICE_OF_INPUT[source];
      if (d === 'controller' && !connected) return;
      set(d);
    },
    connected(on) {
      connected = !!on;
      if (!connected) set('keyboard');
    },
  };
}
