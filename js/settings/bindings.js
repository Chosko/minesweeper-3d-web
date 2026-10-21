// The bindings source: each mode's controls per input device, as shown read-only by the Settings
// page (js/settings/page.js) and by the in-game help surfaces (js/ui.js): the pause card, the main
// menu's Controls panel, the H panel, the 3D ready card, the HUD strip and the first-use hint strips.
// One source, so they never disagree; rebinding is not offered here. DOM-free.
//
// A row is [input, action], in the canvas's short wording. In either text, `[Key]` is a keyboard key
// and `{name}` a controller button, named by its position in the standard mapping (a, b, x, y, lb,
// rb, lt, rt, start, back) and drawn with the active controller's glyphs (js/gamepad.js GLYPHS).
// Three lists read the rows: the full list (the Settings page and the Controls panel), the help list
// (the pause card and the H panel: HELP_BINDINGS where it is shorter, otherwise the full rows) and the
// 3D ready card's (READY_BINDINGS).
//
// bindingRows(mode, device, camera = 'fly') → the full rows; 3D's for the Camera setting's camera
//   (Fly or Orbit), kept in one table whose camera slots fill from CAMERA_ROWS. Both modes also list
//   a touch device (TOUCH_DEVICE), the gestures of a coarse-only device; bindingDevices(mode) names
//   the devices a mode lists. An unknown mode, device or camera throws.
// helpRows(mode, device, camera?) → the help list's rows; readyRows(device, camera?) → the ready
//   card's, for 'keyboard' or 'touch'.
// bindingsListHtml(rows, glyphs?) → the <dt>/<dd> pairs of the controls list `dl.ui-controls`, each
//   key and button in plain words (no key caps), text escaped.
// bindingsHtml(mode, device, glyphs?, camera?) → the bindings component: that mode's full rows for
//   that device; helpListHtml(mode, device, glyphs?, camera?) and readyListHtml(device, glyphs?,
//   camera?) the other two lists.
// hudStripHtml(mode, device, glyphs?, { muted, spacing }) → the HUD strip: only the keys, buttons or
//   gestures the mode binds on that device (F flags in Classic 2D, so it is not listed there); 3D's
//   carries the spacing to one decimal. Touch lists only 3D's spacing; Classic 2D's is empty.
// hintStripHtml(mode, device, glyphs?) → the first-use hint strip of that mode, " · " between items.
// helpFootHtml(mode, device, glyphs?) → the H panel's foot line in plain words: the key that hides
//   the panel; on touch, 3D's release rule, and empty for Classic 2D.
// hintText(name, device, glyphs?) → a one-time hint's plain text (`autoHide`, `aimHint`, `scrollHint`),
//   or a Learn 3D prompt's (`learnStart`, `learnShift`, `learnCtrl`, `learnFlag`, `learnChord`, `learnRest`),
//   for the keyboard, the controller or touch.
// keyHintKeys(action, device, glyphs?) → the keys of a key hint (`move`, `select`, `back`) on that
//   device, each { text, pad }; none on touch. The kit's showKeyHints (js/ui/components.js) draws them.
// createActiveDevice({ onChange }) → the active device: the controller while the last input came
//   from a connected controller, otherwise the keyboard and mouse.

import { GLYPHS } from '../gamepad.js';
import { SPACING_START } from '../input.js';

export const BINDING_MODES = Object.freeze([
  Object.freeze({ id: 'classic-2d', label: 'Classic 2D' }),
  Object.freeze({ id: '3d', label: '3D' }),
]);

export const BINDING_DEVICES = Object.freeze([
  Object.freeze({ id: 'keyboard', label: 'Keyboard and mouse' }),
  Object.freeze({ id: 'controller', label: 'Controller' }),
]);
/** The touch device: each mode's gestures on a coarse-only device (js/touch-3d.js, js/classic2d/touch-input.js). */
export const TOUCH_DEVICE = Object.freeze({ id: 'touch', label: 'Touch' });

const rows = (list) => Object.freeze(list.map((r) => Object.freeze(r)));

// The 3D rows: a string entry is a slot, filled from CAMERA_ROWS for the Camera setting (js/settings/schema.js).
const ROWS_3D = Object.freeze({
  keyboard: [
    'look',
    'move',
    ['Left click', 'Reveal'],
    ['Right click', 'Flag / unflag'],
    ['Left + Right', 'Chord'],
    'wheel',
    ['[X]', 'Spacing 1.1 / 2.0'],
    ['Hold [Shift] / [Space] / [Ctrl]', 'View modes'],
    ['[H] · [M] · [F]', 'Help · Sound · Fullscreen'],
    ['[Esc] · [F2]', 'Pause · Restart'],
  ],
  controller: [
    'sticks',
    ['{rt} / {lt}', 'Reveal / flag'],
    ['{lt} + {rt}', 'Chord'],
    'buttons',
    ['Hold {lb} / {rb} / {y}', 'View modes'],
    ['D-pad ↑ ↓', 'Spacing'],
    ['{x}', 'Help'],
    ['{start} / {back}', 'Pause'],
    ['{start} + {y}', 'Restart'],
  ],
  touch: [
    'stick',
    'drag',
    ['Tap', 'Reveal'],
    ['Long-press', 'Flag / unflag'],
    ['Two-finger tap', 'Chord'],
    ['Pinch', 'Spacing'],
    ['Shift button', 'Neighbours only'],
    ['Space button', 'Aim through numbers'],
    ['Ctrl button', 'Show hidden'],
    ['Pause button', 'Pause'],
  ],
});

/** The 3D help list (the H panel and the pause card) on the keyboard; the other devices list their full rows. */
const HELP_3D = Object.freeze({
  keyboard: [
    'mouse',
    'move',
    ['Left click', 'Reveal'],
    ['Right click', 'Flag / unflag'],
    ['Left + Right', 'Chord'],
    'wheel',
    ['Hold [Shift]', 'Neighbours only'],
    ['Hold [Space]', 'Aim through numbers'],
    ['Hold [Ctrl]', 'Show hidden'],
    ['[Esc]', 'Pause'],
  ],
});

/** The 3D ready card's short list, on the keyboard and mouse and on touch. */
const READY_3D = Object.freeze({
  keyboard: ['readyLook', 'readyMove', ['Left / Right', 'reveal / flag'], 'readyWheel', ['[Shift] · [Space] · [Ctrl]', 'view modes']],
  touch: ['readyStick', 'readyDrag', ['Tap', 'reveal'], ['Long-press', 'flag'], ['Two-finger tap', 'chord'], ['Pinch', 'spacing']],
});

/** The 3D rows that change with the Camera setting, per camera and slot. */
const CAMERA_ROWS = Object.freeze({
  fly: {
    look: [['Mouse', 'Look around (click to capture)'], ['Arrow keys', 'Look around']],
    mouse: [['Mouse', 'Look around']],
    move: [['[W] [A] [S] [D]', 'Fly'], ['[Q] / [E]', 'Down / up']],
    wheel: [['Wheel', 'Spacing']],
    sticks: [['Left / right stick', 'Fly / look around']],
    buttons: [['{a} / {b}', 'Up / down']],
    stick: [['Left thumb', 'Fly']],
    drag: [['Drag', 'Look around']],
    readyLook: [['Mouse', 'look around']],
    readyMove: [['[W] [A] [S] [D]', 'fly'], ['[Q] / [E]', 'down / up']],
    readyWheel: [['Wheel', 'spacing']],
    readyStick: [['Left thumb', 'fly']],
    readyDrag: [['Drag', 'look']],
  },
  orbit: {
    look: [['Mouse', 'Rotate (click to capture)'], ['Arrow keys · [A] [D]', 'Rotate']],
    mouse: [['Mouse', 'Rotate']],
    move: [['[W] / [S]', 'In / out']],
    wheel: [['Wheel', 'In / out']],
    sticks: [['Right stick', 'Rotate'], ['Left stick ↑ ↓', 'In / out']],
    buttons: [],
    stick: [['Left thumb ↑ ↓', 'In / out']],
    drag: [['Drag', 'Rotate']],
    readyLook: [['Mouse', 'rotate']],
    readyMove: [['[W] / [S]', 'in / out']],
    readyWheel: [['Wheel', 'in / out']],
    readyStick: [['Left thumb ↑ ↓', 'in / out']],
    readyDrag: [['Drag', 'rotate']],
  },
});

/** The Camera setting's values the 3D rows are kept for. */
export const CAMERAS = Object.freeze(Object.keys(CAMERA_ROWS));

const fill = (list, camera) => rows(list.flatMap((r) => (typeof r === 'string' ? CAMERA_ROWS[camera][r] : [r])));
const threeD = (camera, device) => fill(ROWS_3D[device], camera);

export const BINDINGS = Object.freeze({
  'classic-2d': Object.freeze({
    keyboard: rows([
      ['Left / middle button', 'Reveal'],
      ['Right button', 'Flag'],
      ['Left + Right', 'Chord'],
      ['Arrow keys', 'Move the cursor'],
      ['[Space] / [Enter]', 'Reveal'],
      ['[F]', 'Flag'],
      ['[D]', 'Chord'],
      ['[Esc] · [F2]', 'Pause · Restart'],
    ]),
    controller: rows([
      ['D-pad / left stick', 'Move the cursor'],
      ['{a} / {rt}', 'Reveal'],
      ['{x} / {lt}', 'Flag / unflag'],
      ['{y} · {lt} + {rt}', 'Chord'],
      ['{start} / {b} / {back}', 'Pause'],
      ['{start} + {y}', 'Restart'],
    ]),
    touch: rows([
      ['Tap', 'Reveal (or flag on Tap: Flag)'],
      ['Long-press', 'Flag / unflag'],
      ['Tap a number', 'Chord'],
      ['Tap: Reveal / Flag', 'What a tap does'],
      ['One finger', 'Pan a large board'],
      ['Pinch', 'Zoom'],
      ['Pause button', 'Pause'],
    ]),
  }),
  '3d': Object.freeze({ keyboard: threeD('fly', 'keyboard'), controller: threeD('fly', 'controller'), touch: threeD('fly', 'touch') }),
});

/** The 3D rows per Camera setting and device, Fly's being BINDINGS['3d']'s. */
export const BINDINGS_3D = Object.freeze(Object.fromEntries(CAMERAS.map((camera) => [camera,
  camera === 'fly' ? BINDINGS['3d'] : Object.freeze({ keyboard: threeD(camera, 'keyboard'), controller: threeD(camera, 'controller'), touch: threeD(camera, 'touch') })])));

/**
 * The help list (the pause card and the H panel) where it is shorter than the full list, per mode and
 * device (3D's per camera); a mode and device not listed here shows its full rows.
 */
export const HELP_BINDINGS = Object.freeze({
  'classic-2d': Object.freeze({
    keyboard: rows([
      ['Left / middle button', 'Reveal'],
      ['Right button', 'Flag / unflag'],
      ['Left + Right', 'Chord'],
      ['Arrow keys', 'Move the cursor'],
      ['[Space] / [Enter]', 'Reveal under the cursor'],
      ['[F]', 'Flag under the cursor'],
      ['[D]', 'Chord under the cursor'],
      ['[Esc]', 'Pause'],
      ['[F2]', 'Restart'],
    ]),
    touch: rows(BINDINGS['classic-2d'].touch.filter(([input]) => ['Tap', 'Long-press', 'Tap a number', 'One finger', 'Pinch'].includes(input))),
  }),
  '3d': Object.freeze(Object.fromEntries(CAMERAS.map((camera) => [camera, Object.freeze({ keyboard: fill(HELP_3D.keyboard, camera) })]))),
});

/** The 3D ready card's rows per camera, on the keyboard and mouse and on touch. */
export const READY_BINDINGS = Object.freeze(Object.fromEntries(CAMERAS.map((camera) => [camera,
  Object.freeze({ keyboard: fill(READY_3D.keyboard, camera), touch: fill(READY_3D.touch, camera) })])));

/** The input devices a mode lists bindings for: the keyboard and the controller, and touch where the mode has touch rows. */
export function bindingDevices(mode) {
  return Object.hasOwn(BINDINGS, mode) && Object.hasOwn(BINDINGS[mode], 'touch') ? [...BINDING_DEVICES, TOUCH_DEVICE] : [...BINDING_DEVICES];
}

export function bindingRows(mode, device, camera = 'fly') {
  const byDevice = Object.hasOwn(BINDINGS, mode) ? BINDINGS[mode] : null;
  if (!byDevice) throw new Error(`bindings: unknown mode "${mode}"`);
  if (!Object.hasOwn(byDevice, device)) throw new Error(`bindings: unknown device "${device}"`);
  if (mode !== '3d') return byDevice[device];
  if (!Object.hasOwn(BINDINGS_3D, camera)) throw new Error(`bindings: unknown camera "${camera}"`);
  return BINDINGS_3D[camera][device];
}

/** The help list's rows: HELP_BINDINGS' where it holds the mode and device, otherwise the full rows. */
export function helpRows(mode, device, camera = 'fly') {
  const full = bindingRows(mode, device, camera);
  const help = mode === '3d' ? HELP_BINDINGS['3d'][camera] : HELP_BINDINGS[mode];
  return help && Object.hasOwn(help, device) ? help[device] : full;
}

/** The 3D ready card's rows for 'keyboard' (the keyboard and mouse) or 'touch', for the camera. */
export function readyRows(device, camera = 'fly') {
  if (!Object.hasOwn(READY_BINDINGS, camera)) throw new Error(`bindings: unknown camera "${camera}"`);
  if (!Object.hasOwn(READY_BINDINGS[camera], device)) throw new Error(`bindings: unknown ready card device "${device}"`);
  return READY_BINDINGS[camera][device];
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

/** A row text in plain words: a key by its name, a controller button by its glyph, no key caps. */
function words(text, glyphs) {
  return escape(text.replace(/\[([^\]]+)\]/g, '$1').replace(/\{([a-z]+)\}/g, (m, name) => (Object.hasOwn(glyphs, name) ? glyphs[name] : m)));
}

/** The controls list's rows (`dl.ui-controls`): each key in plain words, then its action. */
export function bindingsListHtml(list, glyphs = GLYPHS.generic) {
  return list.map(([input, action]) => `<dt class="ui-controls__key">${words(input, glyphs)}</dt><dd class="ui-controls__action">${words(action, glyphs)}</dd>`).join('');
}

/** The bindings component: the full rows of `mode` for `device` (3D's for `camera`), the controller drawn in `glyphs`. */
export function bindingsHtml(mode, device, glyphs = GLYPHS.generic, camera = 'fly') {
  return bindingsListHtml(bindingRows(mode, device, camera), glyphs);
}

/** The help list of the pause card and the H panel. */
export function helpListHtml(mode, device, glyphs = GLYPHS.generic, camera = 'fly') {
  return bindingsListHtml(helpRows(mode, device, camera), glyphs);
}

/** The 3D ready card's list. */
export function readyListHtml(device, glyphs = GLYPHS.generic, camera = 'fly') {
  return bindingsListHtml(readyRows(device, camera), glyphs);
}

const table = (byMode) => Object.freeze(Object.fromEntries(Object.entries(byMode).map(([mode, byDevice]) => [mode,
  Object.freeze(Object.fromEntries(Object.entries(byDevice).map(([device, list]) => [device, rows(list)])))])));
const pick = (t, mode, device, what) => {
  if (!Object.hasOwn(t, mode)) throw new Error(`${what}: unknown mode "${mode}"`);
  if (!Object.hasOwn(t[mode], device)) throw new Error(`${what}: unknown device "${device}"`);
  return t[mode][device];
};

/** The HUD strip per mode and device: only what the mode binds there. `sound` reads "sound on/off", `spacing` "spacing 1.1". */
export const HUD_STRIP = table({
  'classic-2d': {
    keyboard: [['[H]', 'help'], ['[M]', 'sound'], ['[Esc]', 'menu']],
    controller: [['{start}', 'menu']],
    touch: [],
  },
  '3d': {
    keyboard: [['[X]', 'spacing'], ['[H]', 'help'], ['[M]', 'sound'], ['[F]', 'fullscreen'], ['[Esc]', 'menu']],
    controller: [['D-pad ↑ ↓', 'spacing'], ['{x}', 'help'], ['{start}', 'menu']],
    touch: [['Pinch', 'spacing']],
  },
});

/** The first-use hint strip per mode and device. */
export const HINT_STRIP = table({
  'classic-2d': {
    keyboard: [['Arrows', 'move'], ['[Space]', 'reveal'], ['[F]', 'flag'], ['[D]', 'chord']],
    controller: [['D-pad', 'move'], ['{a}', 'reveal'], ['{x}', 'flag'], ['{y}', 'chord']],
    touch: [['Tap', 'reveal'], ['Long-press', 'flag'], ['Tap a number', 'chord']],
  },
  '3d': {
    keyboard: [['Left', 'reveal'], ['Right', 'flag'], ['Hold [Space]', 'aim through'], ['Hold [Shift]', 'neighbours']],
    controller: [['{rt}', 'reveal'], ['{lt}', 'flag'], ['Hold {rb}', 'aim through'], ['Hold {lb}', 'neighbours']],
    touch: [['Tap', 'reveal'], ['Long-press', 'flag'], ['Space button', 'aim through'], ['Shift button', 'neighbours']],
  },
});

/** The H panel's foot line: the key that hides it; on touch, 3D's release rule, and nothing in Classic 2D. */
export const HELP_FOOT = Object.freeze({
  'classic-2d': Object.freeze({ keyboard: '[H] hides this panel.', controller: '[H] hides this panel.', touch: '' }),
  '3d': Object.freeze({
    keyboard: '[H] hides this panel.',
    controller: '{x} hides this panel.',
    touch: 'Actions fire when your finger lifts.',
  }),
});

/** The one-time hints' and Learn 3D prompts' text per device; touch names the toolbar's buttons and the gestures (js/touch-3d.js). */
export const HINT_TEXT = Object.freeze({
  autoHide: Object.freeze({ keyboard: 'Solved cubes hide. Hold [Ctrl] to see them.', controller: 'Solved cubes hide. Hold {y} to see them.', touch: 'Solved cubes hide. Tap the Ctrl button to see them.' }),
  aimHint: Object.freeze({ keyboard: 'Hold [Space] to aim through numbers.', controller: 'Hold {rb} to aim through numbers.', touch: 'Tap the Space button to aim through numbers.' }),
  scrollHint: Object.freeze({ keyboard: 'Wheel scrolls · Shift+wheel sideways', controller: 'Wheel scrolls · Shift+wheel sideways', touch: 'Drag to pan · pinch to zoom' }),
  learnStart: Object.freeze({ keyboard: 'Click the marked cube to start', controller: 'Press {rt} on the marked cube to start', touch: 'Aim at the marked cube and tap to start' }),
  learnShift: Object.freeze({ keyboard: 'Hold [Shift] to see what this number counts', controller: 'Hold {lb} to see what this number counts', touch: 'Tap the Shift button to see what this number counts' }),
  learnCtrl: Object.freeze({ keyboard: 'Hold [Ctrl] to see the cubes you cleared', controller: 'Hold {y} to see the cubes you cleared', touch: 'Tap the Ctrl button to see the cubes you cleared' }),
  learnFlag: Object.freeze({ keyboard: 'Flag the one cube that must be a mine', controller: 'Press {lt} on the one cube that must be a mine', touch: 'Aim at the one cube that must be a mine and long-press to flag it' }),
  learnChord: Object.freeze({ keyboard: 'Press left and right together on the number to chord', controller: 'Press {lt} and {rt} together on the number to chord', touch: 'Aim at the number and tap two fingers together on the right half to chord' }),
  learnRest: Object.freeze({ keyboard: 'Clear the rest of the box', controller: 'Clear the rest of the box', touch: 'Clear the rest of the box' }),
});

export function hudStripHtml(mode, device, glyphs = GLYPHS.generic, { muted = false, spacing = SPACING_START } = {}) {
  return pick(HUD_STRIP, mode, device, 'HUD strip').map(([input, action]) => {
    const label = action === 'sound' ? `sound ${muted ? 'off' : 'on'}` : action === 'spacing' ? `spacing ${spacing.toFixed(1)}` : action;
    return `<span class="kbd-hint">${render(input, glyphs)} ${escape(label)}</span>`;
  }).join('');
}

export function hintStripHtml(mode, device, glyphs = GLYPHS.generic) {
  return pick(HINT_STRIP, mode, device, 'hint strip').map(([input, action]) => `${render(input, glyphs)} ${render(action, glyphs)}`).join(' &middot; ');
}

export function helpFootHtml(mode, device, glyphs = GLYPHS.generic) {
  return words(pick(HELP_FOOT, mode, device, 'help foot'), glyphs);
}

export function hintText(name, device, glyphs = GLYPHS.generic) {
  if (!Object.hasOwn(HINT_TEXT, name)) throw new Error(`hint text: unknown hint "${name}"`);
  const t = HINT_TEXT[name][device];
  if (t === undefined) throw new Error(`hint text: unknown device "${device}"`);
  return t.replace(/\[([^\]]+)\]/g, '$1').replace(/\{([a-z]+)\}/g, (m, name2) => (Object.hasOwn(glyphs, name2) ? glyphs[name2] : m));
}

/**
 * The figures panel's controls reminder per mode and device: the board's main bindings, each key
 * `[Key]`, a controller button `{name}`, two keys pressed together joined by `+`.
 */
export const REMINDER = table({
  'classic-2d': {
    keyboard: [['[Left]', 'reveal'], ['[Right]', 'flag'], ['[Left]+[Right]', 'chord']],
    controller: [['{a}', 'reveal'], ['{x}', 'flag'], ['{y}', 'chord']],
    touch: [['[Tap]', 'reveal'], ['[Long-press]', 'flag'], ['[Tap a number]', 'chord']],
  },
  '3d': {
    keyboard: [['[Left]', 'reveal'], ['[Right]', 'flag'], ['[Left]+[Right]', 'chord']],
    controller: [['{rt}', 'reveal'], ['{lt}', 'flag'], ['{lt}+{rt}', 'chord']],
    touch: [['[Tap]', 'reveal'], ['[Long-press]', 'flag'], ['[Two-finger tap]', 'chord']],
  },
});

/** The reminder's rows for `mode` and `device`: [{ keys: [{ text, pad }], label }], the controller's buttons in `glyphs`. */
export function reminderKeys(mode, device, glyphs = GLYPHS.generic) {
  return pick(REMINDER, mode, device, 'reminder').map(([input, label]) => ({
    keys: input.split('+').map((key) => {
      const b = key.match(/^\{([a-z]+)\}$/);
      if (b) return { text: Object.hasOwn(glyphs, b[1]) ? glyphs[b[1]] : b[1], pad: true };
      return { text: key.replace(/^\[(.+)\]$/, '$1'), pad: false };
    }),
    label,
  }));
}

/** The key hints shown beside an action, per device: `[Key]` a key, `{name}` a controller button, plain text a controller control. */
export const KEY_HINTS = Object.freeze({
  move: Object.freeze({ keyboard: Object.freeze(['[↑]', '[↓]']), controller: Object.freeze(['D-pad']), touch: Object.freeze([]) }),
  select: Object.freeze({ keyboard: Object.freeze(['[Enter]']), controller: Object.freeze(['{a}']), touch: Object.freeze([]) }),
  back: Object.freeze({ keyboard: Object.freeze(['[Esc]']), controller: Object.freeze(['{b}']), touch: Object.freeze([]) }),
  restart: Object.freeze({ keyboard: Object.freeze(['[F2]']), controller: Object.freeze(['{start}', '{y}']), touch: Object.freeze([]) }),
});

export function keyHintKeys(action, device, glyphs = GLYPHS.generic) {
  if (!Object.hasOwn(KEY_HINTS, action)) throw new Error(`key hint: unknown action "${action}"`);
  if (!Object.hasOwn(KEY_HINTS[action], device)) throw new Error(`key hint: unknown device "${device}"`);
  return KEY_HINTS[action][device].map((key) => {
    const k = key.match(/^\[(.+)\]$/);
    if (k) return { text: k[1], pad: false };
    const b = key.match(/^\{([a-z]+)\}$/);
    if (b) return { text: Object.hasOwn(glyphs, b[1]) ? glyphs[b[1]] : b[1], pad: true };
    return { text: key, pad: device === 'controller' };
  });
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
