// The action catalogues and the bindings source. DOM-free.
//
// The catalogues (CATALOGUES): every rebindable action of the flat modes — Classic 2D, Hexagon and
// Triangle share one catalogue, `flat` — and of 3D, each with its id, label, when it fires ('press',
// 'release' or 'held') and up to two default inputs per device (INPUT_DEVICES: keyboard, mouse,
// controller). A key is its KeyboardEvent.code, a mouse button its button number, a controller button
// its standard-mapping index (js/gamepad.js BTN). catalogueOf(mode) → the mode's catalogue id;
// catalogueAction(catalogue, id) → its action or null; isInput(device, input); isReserved(mode,
// device, input) — the inputs no binding may take (RESERVED); canonicalInput(catalogue, device,
// input) reads Numpad Enter as Enter in the flat catalogue, as Classic 2D's cursor keys do; keyName(code) → a key's shown name. DEFAULT_CURRENT is the current bindings
// with no override, in the shape the resolver (js/settings/resolver.js) derives: per catalogue,
// device and action, its inputs in slot order.
//
// The bindings source: each mode's controls per input device, as shown by the Settings page
// (js/settings/page.js) and by the in-game help surfaces (js/ui.js): the pause card, the H panel, the
// 3D ready card, the HUD strip, the first-use hint strips and hints, the controls reminder and the
// key hints. One source, so they never disagree. Every function that shows a catalogue action's
// inputs takes the current bindings last — the resolver, or anything carrying its `current` — and
// answers from them on each call, the defaults when none is given.
//
// A row is [input, action], in the canvas's short wording. In either text, `[Key]` is a keyboard key
// and `{name}` a controller button, named by its position in the standard mapping (a, b, x, y, lb,
// rb, lt, rt, start, back) and drawn with the active controller's glyphs (js/gamepad.js GLYPHS).
// A catalogue action's inputs are written `<device:action>` (device `key`, `mouse` or `pad`) and
// filled from the current bindings into that syntax: a key as `[Name]`, a mouse button by its name,
// a controller button as `{name}` (in words when it has no glyph), several inputs joined by " / ", a
// later mouse button's name in lower case, and "—" for none. `<device:action@n>` takes the nth input
// alone; `<device:a b c d>` writes each action's inputs in turn, the four arrow keys as "Arrow keys"
// and the d-pad as "D-pad"; a `|Label` suffix names those four instead, and `|lower` writes the
// whole in lower case. Inputs outside the catalogues — the shell's, help, sound, the wheel, the
// sticks — are written as they are.
// Three lists read the rows: the full list (the Settings page), the help list
// (the pause card and the H panel: HELP_BINDINGS where it is shorter, otherwise the full rows) and the
// 3D ready card's (READY_BINDINGS). The exported tables are the rows filled with the defaults.
//
// bindingRows(mode, device, camera = 'fly', bindings?) → the full rows; 3D's for the Camera setting's
//   camera (Fly or Orbit), kept in one table whose camera slots fill from CAMERA_ROWS. Both modes also
//   list a touch device (TOUCH_DEVICE), the gestures of a coarse-only device; bindingDevices(mode)
//   names the devices a mode lists. An unknown mode, device or camera throws.
// helpRows(mode, device, camera?, bindings?) → the help list's rows; readyRows(device, camera?,
//   bindings?) → the ready card's, for 'keyboard' or 'touch'.
// bindingsListHtml(rows, glyphs?) → the <dt>/<dd> pairs of the controls list `dl.ui-controls`, each
//   key and button in plain words (no key caps), text escaped.
// bindingsHtml(mode, device, glyphs?, camera?, bindings?) → the bindings component: that mode's full
//   rows for that device; helpListHtml(mode, device, glyphs?, camera?, bindings?) and
//   readyListHtml(device, glyphs?, camera?, bindings?) the other two lists.
// hudStripHtml(mode, device, glyphs?, { muted, spacing }) → the HUD strip: only the keys, buttons or
//   gestures the mode binds on that device (F flags in Classic 2D, so it is not listed there); 3D's
//   carries the spacing to one decimal. Touch lists only 3D's spacing; Classic 2D's is empty.
// hintStripHtml(mode, device, glyphs?, bindings?) → the first-use hint strip of that mode: on the
//   keyboard and the controller each input whole in one key box before its action, with no
//   separator; on touch the gestures as words, " · " between items.
// helpFootHtml(mode, device, glyphs?) → the H panel's foot line in plain words: the key that hides
//   the panel and 3D's release rule; on touch, the release rule alone, and empty for Classic 2D.
// hintText(name, device, glyphs?, bindings?) → a one-time hint's plain text (`autoHide`, `aimHint`,
//   `scrollHint`), or a Learn 3D prompt's (`learnStart`, `learnShift`, `learnCtrl`, `learnFlag`,
//   `learnChord`, `learnRest`), for the keyboard, the controller or touch.
// reminderKeys(mode, device, glyphs?, bindings?) → the figures panel's controls reminder.
// keyHintKeys(action, device, glyphs?, { mode?, bindings? }) → the keys of a key hint on that device,
//   each { text, pad }: a shell action's (`move`, `select`, `confirm`, `back`, `restart`), whose
//   inputs are reserved and so fixed — none on touch, and a confirm button's (`confirm`) only the
//   controller's A, never Enter —, or a catalogue action of `mode` (default Classic 2D) with its
//   current inputs: on 'keyboard' its keys, or its mouse buttons when it has no key. The kit's
//   showKeyHints (js/ui/components.js) draws them.
// createActiveDevice({ onChange }) → the active device: the controller while the last input came
//   from a connected controller, otherwise the keyboard and mouse.

import { GLYPHS, BTN, NUM_BUTTONS } from '../gamepad.js';
import { SPACING_START } from '../input.js';

// ---------------------------------------------------------------- the action catalogues

/** The devices a binding is made for; the help surfaces' 'keyboard' is the keyboard and the mouse together. */
export const INPUT_DEVICES = Object.freeze(['keyboard', 'mouse', 'controller']);

const action = (id, label, fires, { keyboard = [], mouse = [], controller = [] } = {}) => Object.freeze({
  id,
  label,
  fires,
  defaults: Object.freeze({ keyboard: Object.freeze(keyboard), mouse: Object.freeze(mouse), controller: Object.freeze(controller) }),
});

/** Each catalogue's rebindable actions and their default inputs: today's bindings, which reproduce the spec. */
export const CATALOGUES = Object.freeze({
  flat: Object.freeze({
    id: 'flat',
    label: 'Classic 2D, Hexagon and Triangle',
    actions: Object.freeze([
      action('reveal', 'Reveal', 'release', { keyboard: ['Space', 'Enter'], mouse: [0, 1], controller: [BTN.A, BTN.RT] }),
      action('flag', 'Flag / unflag', 'press', { keyboard: ['KeyF'], mouse: [2], controller: [BTN.X, BTN.LT] }),
      action('chord', 'Chord', 'release', { keyboard: ['KeyD'], controller: [BTN.Y] }),
      action('up', 'Cursor up', 'press', { keyboard: ['ArrowUp'], controller: [BTN.UP] }),
      action('down', 'Cursor down', 'press', { keyboard: ['ArrowDown'], controller: [BTN.DOWN] }),
      action('left', 'Cursor left', 'press', { keyboard: ['ArrowLeft'], controller: [BTN.LEFT] }),
      action('right', 'Cursor right', 'press', { keyboard: ['ArrowRight'], controller: [BTN.RIGHT] }),
    ]),
  }),
  '3d': Object.freeze({
    id: '3d',
    label: '3D',
    actions: Object.freeze([
      action('forward', 'Forward', 'held', { keyboard: ['KeyW'] }),
      action('back', 'Back', 'held', { keyboard: ['KeyS'] }),
      action('left', 'Left', 'held', { keyboard: ['KeyA'] }),
      action('right', 'Right', 'held', { keyboard: ['KeyD'] }),
      action('down', 'Down', 'held', { keyboard: ['KeyQ'], controller: [BTN.B] }),
      action('up', 'Up', 'held', { keyboard: ['KeyE'], controller: [BTN.A] }),
      action('neighbours', 'Neighbours only', 'held', { keyboard: ['ShiftLeft', 'ShiftRight'], controller: [BTN.LB] }),
      action('aimThrough', 'Aim through numbers', 'held', { keyboard: ['Space'], controller: [BTN.RB] }),
      action('showHidden', 'Show hidden', 'held', { keyboard: ['ControlLeft', 'ControlRight'], controller: [BTN.Y] }),
      action('reveal', 'Reveal', 'release', { keyboard: ['Enter'], mouse: [0], controller: [BTN.RT] }),
      action('flag', 'Flag / unflag', 'release', { keyboard: ['Quote'], mouse: [2], controller: [BTN.LT] }),
    ]),
  }),
});

const CATALOGUE_OF_MODE = Object.freeze({ 'classic-2d': 'flat', hexagon: 'flat', triangle: 'flat', '3d': '3d' });

/** The catalogue a mode plays on: 'flat' for Classic 2D, Hexagon and Triangle, '3d' for 3D. An unknown mode throws. */
export function catalogueOf(mode) {
  if (!Object.hasOwn(CATALOGUE_OF_MODE, mode)) throw new Error(`bindings: unknown mode "${mode}"`);
  return CATALOGUE_OF_MODE[mode];
}

/** The action `id` of catalogue `catalogue`, or null. */
export function catalogueAction(catalogue, id) {
  return CATALOGUES[catalogue].actions.find((a) => a.id === id) ?? null;
}

/** The mouse buttons a binding takes: left, middle, right, back and forward. */
const MOUSE_BUTTONS = 5;

/** Whether `input` is an input of `device`: a key code, a mouse button number, a standard-mapping button index. */
export function isInput(device, input) {
  switch (device) {
    case 'keyboard': return typeof input === 'string' && /^[A-Z][A-Za-z0-9]{0,31}$/.test(input);
    case 'mouse': return Number.isInteger(input) && input >= 0 && input < MOUSE_BUTTONS;
    case 'controller': return Number.isInteger(input) && input >= 0 && input < NUM_BUTTONS;
    default: return false;
  }
}

/** The input a binding of `catalogue` holds for `input`: in the flat catalogue Numpad Enter is Enter; 3D's reveal takes Enter alone. */
export function canonicalInput(catalogue, device, input) {
  return catalogue === 'flat' && device === 'keyboard' && input === 'NumpadEnter' ? 'Enter' : input;
}

const FUNCTION_KEYS = Array.from({ length: 12 }, (_, i) => `F${i + 1}`);
const ARROW_CODES = Object.freeze(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const DPAD = Object.freeze([BTN.UP, BTN.DOWN, BTN.LEFT, BTN.RIGHT]);

/**
 * The inputs no binding may take, per catalogue and device: in every catalogue Esc, F2 and the other
 * function keys, R (play again on the results screen), Tab, the Meta keys, and the controller's Start
 * and home buttons; then each mode's inputs its play gives to something outside its catalogue — the
 * flat modes' H, M, Shift (pan and sideways scroll) and the controller's B and Back; 3D's H, M, F, X,
 * Home, the arrow keys (look) and the controller's X, Back and d-pad ↑ ↓ (spacing). Start + Y is a
 * chord the input layers keep from the bindings: Y alone stays bindable.
 */
export const RESERVED = Object.freeze(Object.fromEntries(Object.entries({
  flat: { keyboard: ['KeyH', 'KeyM', 'ShiftLeft', 'ShiftRight'], controller: [BTN.B, BTN.BACK] },
  '3d': { keyboard: ['KeyH', 'KeyM', 'KeyF', 'KeyX', 'Home', ...ARROW_CODES], controller: [BTN.X, BTN.BACK, BTN.UP, BTN.DOWN] },
}).map(([catalogue, own]) => [catalogue, Object.freeze({
  keyboard: Object.freeze(['Escape', ...FUNCTION_KEYS, 'KeyR', 'Tab', 'MetaLeft', 'MetaRight', 'OSLeft', 'OSRight', ...own.keyboard]),
  mouse: Object.freeze([]),
  controller: Object.freeze([BTN.START, BTN.HOME, ...own.controller]),
})])));

/** Whether `input` is reserved on `device` in `mode`'s catalogue. */
export function isReserved(mode, device, input) {
  const catalogue = catalogueOf(mode);
  const byDevice = RESERVED[catalogue];
  return Object.hasOwn(byDevice, device) && byDevice[device].includes(canonicalInput(catalogue, device, input));
}

/** The current bindings with no override: per catalogue, device and action, its inputs in slot order. */
export const DEFAULT_CURRENT = Object.freeze(Object.fromEntries(Object.values(CATALOGUES).map((c) => [c.id,
  Object.freeze(Object.fromEntries(INPUT_DEVICES.map((device) => [device,
    Object.freeze(Object.fromEntries(c.actions.map((a) => [a.id, a.defaults[device]])))])))])));

const currentOf = (bindings) => bindings?.current ?? DEFAULT_CURRENT;

// ---------------------------------------------------------------- input names

const KEY_NAMES = Object.freeze({
  Space: 'Space', Enter: 'Enter', NumpadEnter: 'Enter', Tab: 'Tab', Backspace: 'Backspace', Escape: 'Esc',
  Delete: 'Del', Insert: 'Ins', Home: 'Home', End: 'End', PageUp: 'PgUp', PageDown: 'PgDn', CapsLock: 'Caps Lock', ContextMenu: 'Menu',
  ShiftLeft: 'Shift', ShiftRight: 'Shift', ControlLeft: 'Ctrl', ControlRight: 'Ctrl', AltLeft: 'Alt', AltRight: 'Alt',
  ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
  Quote: '\'', Semicolon: ';', Comma: ',', Period: '.', Slash: '/', Backslash: '\\', IntlBackslash: '\\', Backquote: '`',
  Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  NumpadAdd: 'Num +', NumpadSubtract: 'Num -', NumpadMultiply: 'Num *', NumpadDivide: 'Num /', NumpadDecimal: 'Num .',
});
const MOUSE_NAMES = Object.freeze(['Left', 'Middle', 'Right', 'Back', 'Forward']);
/** Controller buttons by standard-mapping index: a glyph name, or words for a button without a glyph. */
const PAD_NAMES = Object.freeze(['{a}', '{b}', '{x}', '{y}', '{lb}', '{rb}', '{lt}', '{rt}', '{back}', '{start}',
  'Left stick press', 'Right stick press', 'D-pad ↑', 'D-pad ↓', 'D-pad ←', 'D-pad →', 'Home']);

/** A key's shown name: the letter or digit of a letter or digit key, a symbol or a short word; else its code. */
export function keyName(code) {
  if (Object.hasOwn(KEY_NAMES, code)) return KEY_NAMES[code];
  const letter = /^(?:Key|Digit)(.)$/.exec(code);
  if (letter) return letter[1];
  const pad = /^Numpad(\d)$/.exec(code);
  return pad ? `Num ${pad[1]}` : code;
}

/** An input in the row-text syntax: a key as `[Name]`, a mouse button by name, a controller button as `{name}` or in words. */
function inputText(device, input) {
  if (device === 'keyboard') return `[${keyName(input)}]`;
  if (device === 'mouse') return MOUSE_NAMES[input] ?? `Button ${input}`;
  return PAD_NAMES[input] ?? `Button ${input}`;
}

const TOKEN_DEVICES = Object.freeze({ key: 'keyboard', mouse: 'mouse', pad: 'controller' });
const TOKEN = /<(key|mouse|pad):([A-Za-z ]+?)(?:@(\d))?(?:\|([^>]+))?>/g;
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/** `text` with each `<device:action>` filled from `current` for `mode`'s catalogue (see the head comment). */
function fillText(text, mode, current) {
  if (!text.includes('<')) return text;
  const byDevice = current[catalogueOf(mode)];
  return text.replace(TOKEN, (match, tag, names, nth, suffix) => {
    const device = TOKEN_DEVICES[tag];
    const ids = names.split(' ');
    const lists = ids.map((id) => {
      if (!Object.hasOwn(byDevice[device], id)) throw new Error(`bindings: unknown action "${id}" in "${text}"`);
      const all = byDevice[device][id];
      return nth && all.length ? [all[Math.min(Number(nth), all.length) - 1]] : [...all];
    });
    const label = suffix && suffix !== 'lower' ? suffix : null;
    const singles = ids.length === 4 && lists.every((l) => l.length === 1) ? lists.map((l) => l[0]) : null;
    let out;
    if (singles && device === 'keyboard' && same(singles, ARROW_CODES)) out = label ?? 'Arrow keys';
    else if (singles && device === 'controller' && same(singles, DPAD)) out = label ?? 'D-pad';
    else {
      out = lists.map((list) => {
        const shown = [...new Set(list.map((input) => inputText(device, input)))];
        if (!shown.length) return '—';
        return shown.map((t, i) => (device === 'mouse' && i > 0 ? t.toLowerCase() : t)).join(' / ');
      }).join(' ');
    }
    return suffix === 'lower' ? out.toLowerCase() : out;
  });
}

const rows = (list) => Object.freeze(list.map((r) => Object.freeze(r)));
/** Rows with each text filled for `mode` from `current`. */
const fillRows = (list, mode, current) => rows(list.map(([input, act]) => [fillText(input, mode, current), fillText(act, mode, current)]));

// ---------------------------------------------------------------- the rows

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

// The 3D rows: a string entry is a slot, filled from CAMERA_ROWS for the Camera setting (js/settings/schema.js).
const ROWS_3D = Object.freeze({
  keyboard: [
    'look',
    'move',
    ['<mouse:reveal> click', 'Reveal'],
    ['<mouse:flag> click', 'Flag / unflag'],
    ['<mouse:reveal@1> + <mouse:flag@1>', 'Chord'],
    'wheel',
    ['[X]', 'Spacing 1.1 / 2.0'],
    ['Hold <key:neighbours> / <key:aimThrough> / <key:showHidden>', 'View modes'],
    ['[H] · [M] · [F]', 'Help · Sound · Fullscreen'],
    ['[Esc] · [F2]', 'Pause · Restart'],
  ],
  controller: [
    'sticks',
    ['<pad:reveal> / <pad:flag>', 'Reveal / flag'],
    ['<pad:flag@1> + <pad:reveal@1>', 'Chord'],
    'buttons',
    ['Hold <pad:neighbours> / <pad:aimThrough> / <pad:showHidden>', 'View modes'],
    ['D-pad ↑ ↓', 'Spacing'],
    ['{x}', 'Help'],
    ['{back}', 'Show / hide live figures'],
    ['{start}', 'Pause'],
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
    ['<mouse:reveal> click', 'Reveal'],
    ['<mouse:flag> click', 'Flag / unflag'],
    ['<mouse:reveal@1> + <mouse:flag@1>', 'Chord'],
    ['<key:reveal> / <key:flag>', 'Reveal / flag'],
    'wheel',
    ['Hold <key:neighbours>', 'Neighbours only'],
    ['Hold <key:aimThrough>', 'Aim through numbers'],
    ['Hold <key:showHidden>', 'Show hidden'],
    ['[Home] / [R]', 'Back to the start view'],
    ['[Esc]', 'Pause'],
  ],
});

/** The 3D ready card's short list, on the keyboard and mouse and on touch. */
const READY_3D = Object.freeze({
  keyboard: ['readyLook', 'readyMove', ['<mouse:reveal@1> / <mouse:flag@1>', 'reveal / flag'], 'readyWheel', ['<key:neighbours> · <key:aimThrough> · <key:showHidden>', 'view modes']],
  touch: ['readyStick', 'readyDrag', ['Tap', 'reveal'], ['Long-press', 'flag'], ['Two-finger tap', 'chord'], ['Pinch', 'spacing']],
});

const FLY_MOVE = [['<key:forward left back right>', 'Fly'], ['<key:down> / <key:up>', 'Down / up']];

/** The 3D rows that change with the Camera setting, per camera and slot. */
const CAMERA_ROWS = Object.freeze({
  fly: {
    look: [['Mouse', 'Look around (click to capture)'], ['Arrow keys', 'Look around']],
    mouse: [['Mouse', 'Look around']],
    move: FLY_MOVE,
    wheel: [['Wheel', 'Spacing']],
    sticks: [['Left / right stick', 'Fly / look around']],
    buttons: [['<pad:up> / <pad:down>', 'Up / down']],
    stick: [['Left thumb', 'Fly']],
    drag: [['Drag', 'Look around']],
    readyLook: [['Mouse', 'look around']],
    readyMove: FLY_MOVE.map(([input, act]) => [input, act.toLowerCase()]),
    readyWheel: [['Wheel', 'spacing']],
    readyStick: [['Left thumb', 'fly']],
    readyDrag: [['Drag', 'look']],
  },
  orbit: {
    look: [['Mouse', 'Rotate (click to capture)'], ['Arrow keys · <key:left right>', 'Rotate']],
    mouse: [['Mouse', 'Rotate']],
    move: [['<key:forward> / <key:back>', 'In / out']],
    wheel: [['Wheel', 'In / out']],
    sticks: [['Right stick', 'Rotate'], ['Left stick ↑ ↓', 'In / out']],
    buttons: [],
    stick: [['Left thumb ↑ ↓', 'In / out']],
    drag: [['Drag', 'Rotate']],
    readyLook: [['Mouse', 'rotate']],
    readyMove: [['<key:forward> / <key:back>', 'in / out']],
    readyWheel: [['Wheel', 'in / out']],
    readyStick: [['Left thumb ↑ ↓', 'in / out']],
    readyDrag: [['Drag', 'rotate']],
  },
});

/** The Camera setting's values the 3D rows are kept for. */
export const CAMERAS = Object.freeze(Object.keys(CAMERA_ROWS));

const slots = (list, camera) => list.flatMap((r) => (typeof r === 'string' ? CAMERA_ROWS[camera][r] : [r]));

const ROWS_2D = Object.freeze({
  keyboard: [
    ['<mouse:reveal> button', 'Reveal'],
    ['<mouse:flag> button', 'Flag'],
    ['<mouse:reveal@1> + <mouse:flag@1>', 'Chord'],
    ['<key:up down left right>', 'Move the cursor'],
    ['<key:reveal>', 'Reveal'],
    ['<key:flag>', 'Flag'],
    ['<key:chord>', 'Chord'],
    ['[Esc] · [F2]', 'Pause · Restart'],
  ],
  controller: [
    ['<pad:up down left right> / left stick', 'Move the cursor'],
    ['<pad:reveal>', 'Reveal'],
    ['<pad:flag>', 'Flag / unflag'],
    ['<pad:chord> · <pad:flag@2> + <pad:reveal@2>', 'Chord'],
    ['{back}', 'Show / hide live figures'],
    ['{start}', 'Pause'],
    ['{start} + {y}', 'Restart'],
  ],
  touch: [
    ['Tap', 'Reveal (or flag on Tap: Flag)'],
    ['Long-press', 'Flag / unflag'],
    ['Tap a number', 'Chord'],
    ['Tap: Reveal / Flag', 'What a tap does'],
    ['One finger', 'Pan a large board'],
    ['Pinch', 'Zoom'],
    ['Pause button', 'Pause'],
  ],
});

/** Classic 2D's help list on the keyboard, and the touch gestures it keeps from the full rows. */
const HELP_2D_KEYBOARD = Object.freeze([
  ['<mouse:reveal> button', 'Reveal'],
  ['<mouse:flag> button', 'Flag / unflag'],
  ['<mouse:reveal@1> + <mouse:flag@1>', 'Chord'],
  ['Wheel · [Shift] + wheel', 'Scroll a large board · sideways'],
  ['<key:up down left right>', 'Move the cursor'],
  ['<key:reveal>', 'Reveal under the cursor'],
  ['<key:flag>', 'Flag under the cursor'],
  ['<key:chord>', 'Chord under the cursor'],
  ['[H] · [M]', 'Help · Sound'],
  ['[Esc]', 'Pause'],
  ['[F2]', 'Restart'],
]);
const HELP_2D_TOUCH = Object.freeze(['Tap', 'Long-press', 'Tap a number', 'One finger', 'Pinch']);

/** The first-use hint strip per mode and device; a keyboard or controller row's whole input is drawn as one key box. */
const HINT_ROWS = Object.freeze({
  'classic-2d': {
    keyboard: [['<key:up down left right|Arrows>', 'move'], ['<key:reveal@1>', 'reveal'], ['<key:flag@1>', 'flag'], ['<key:chord@1>', 'chord']],
    controller: [['<pad:up down left right>', 'move'], ['<pad:reveal@1>', 'reveal'], ['<pad:flag@1>', 'flag'], ['<pad:chord@1>', 'chord']],
    touch: [['Tap', 'reveal'], ['Long-press', 'flag'], ['Tap a number', 'to chord']],
  },
  '3d': {
    keyboard: [['<mouse:reveal@1>', 'reveal'], ['<mouse:flag@1>', 'flag'], ['Hold <key:aimThrough@1>', 'aim through'], ['Hold <key:neighbours@1>', 'neighbours']],
    controller: [['<pad:reveal@1>', 'reveal'], ['<pad:flag@1>', 'flag'], ['Hold <pad:aimThrough@1>', 'aim through'], ['Hold <pad:neighbours@1>', 'neighbours']],
    touch: [['Tap', 'reveal'], ['Long-press', 'flag'], ['Two-finger tap', 'chord']],
  },
});

/** The one-time hints' and Learn 3D prompts' text per device, filled from 3D's bindings; touch names the toolbar's buttons and the gestures (js/touch-3d.js). */
const HINT_TEMPLATES = Object.freeze({
  autoHide: { keyboard: 'Solved cubes hide. Hold <key:showHidden@1> to see them.', controller: 'Solved cubes hide. Hold <pad:showHidden@1> to see them.', touch: 'Solved cubes hide. Tap the Ctrl button to see them.' },
  aimHint: { keyboard: 'Hold <key:aimThrough@1> to aim through numbers.', controller: 'Hold <pad:aimThrough@1> to aim through numbers.', touch: 'Tap the Space button to aim through numbers.' },
  scrollHint: { keyboard: 'Wheel scrolls · Shift+wheel sideways', controller: 'Wheel scrolls · Shift+wheel sideways', touch: 'Drag to pan · pinch to zoom' },
  learnStart: { keyboard: 'Click the marked cube to start', controller: 'Press <pad:reveal@1> on the marked cube to start', touch: 'Aim at the marked cube and tap to start' },
  learnShift: { keyboard: 'Hold <key:neighbours@1> to see what this number counts', controller: 'Hold <pad:neighbours@1> to see what this number counts', touch: 'Tap the Shift button to see what this number counts' },
  learnCtrl: { keyboard: 'Hold <key:showHidden@1> to see the cubes you cleared', controller: 'Hold <pad:showHidden@1> to see the cubes you cleared', touch: 'Tap the Ctrl button to see the cubes you cleared' },
  learnFlag: { keyboard: 'Flag the one cube that must be a mine', controller: 'Press <pad:flag@1> on the one cube that must be a mine', touch: 'Aim at the one cube that must be a mine and long-press to flag it' },
  learnChord: { keyboard: 'Press <mouse:reveal@1|lower> and <mouse:flag@1|lower> together on the number to chord', controller: 'Press <pad:flag@1> and <pad:reveal@1> together on the number to chord', touch: 'Aim at the number and tap two fingers together on the right half to chord' },
  learnRest: { keyboard: 'Clear the rest of the box', controller: 'Clear the rest of the box', touch: 'Clear the rest of the box' },
});

/**
 * The figures panel's controls reminder per mode and device: the board's main bindings, each key
 * `[Key]`, a controller button `{name}`, two inputs pressed together joined by `+`.
 */
const REMINDER_ROWS = Object.freeze({
  'classic-2d': {
    keyboard: [['[<mouse:reveal@1>]', 'reveal'], ['[<mouse:flag@1>]', 'flag'], ['[<mouse:reveal@1>]+[<mouse:flag@1>]', 'chord']],
    controller: [['<pad:reveal@1>', 'reveal'], ['<pad:flag@1>', 'flag'], ['<pad:chord@1>', 'chord']],
    touch: [['[Tap]', 'reveal'], ['[Long-press]', 'flag'], ['[Tap a number]', 'chord']],
  },
  '3d': {
    keyboard: [['[<mouse:reveal@1>]', 'reveal'], ['[<mouse:flag@1>]', 'flag'], ['[<mouse:reveal@1>]+[<mouse:flag@1>]', 'chord']],
    controller: [['<pad:reveal@1>', 'reveal'], ['<pad:flag@1>', 'flag'], ['<pad:flag@1>+<pad:reveal@1>', 'chord']],
    touch: [['[Tap]', 'reveal'], ['[Long-press]', 'flag'], ['[Two-finger tap]', 'chord']],
  },
});

const freezeAll = (o) => Object.freeze(Object.fromEntries(Object.entries(o).map(([k, v]) => [k, Object.freeze(v)])));
const byModeDevice = (table, current) => freezeAll(Object.fromEntries(Object.entries(table).map(([mode, byDevice]) => [mode,
  Object.fromEntries(Object.entries(byDevice).map(([device, list]) => [device, fillRows(list, mode, current)]))])));

/** Every table of rows filled from `current`. */
function buildTables(current) {
  const threeD = (camera) => Object.freeze(Object.fromEntries(Object.keys(ROWS_3D).map((device) => [device, fillRows(slots(ROWS_3D[device], camera), '3d', current)])));
  const bindings3d = Object.freeze(Object.fromEntries(CAMERAS.map((camera) => [camera, threeD(camera)])));
  const twoD = Object.freeze(Object.fromEntries(Object.keys(ROWS_2D).map((device) => [device, fillRows(ROWS_2D[device], 'classic-2d', current)])));
  const bindings = Object.freeze({ 'classic-2d': twoD, '3d': bindings3d.fly });
  return Object.freeze({
    bindings,
    bindings3d,
    help: Object.freeze({
      'classic-2d': Object.freeze({
        keyboard: fillRows(HELP_2D_KEYBOARD, 'classic-2d', current),
        touch: rows(twoD.touch.filter(([input]) => HELP_2D_TOUCH.includes(input))),
      }),
      '3d': Object.freeze(Object.fromEntries(CAMERAS.map((camera) => [camera, Object.freeze({ keyboard: fillRows(slots(HELP_3D.keyboard, camera), '3d', current) })]))),
    }),
    ready: Object.freeze(Object.fromEntries(CAMERAS.map((camera) => [camera,
      Object.freeze({ keyboard: fillRows(slots(READY_3D.keyboard, camera), '3d', current), touch: fillRows(slots(READY_3D.touch, camera), '3d', current) })]))),
    hintStrip: byModeDevice(HINT_ROWS, current),
    hintText: freezeAll(Object.fromEntries(Object.entries(HINT_TEMPLATES).map(([name, byDevice]) => [name,
      Object.fromEntries(Object.entries(byDevice).map(([device, t]) => [device, fillText(t, '3d', current)]))]))),
    reminder: byModeDevice(REMINDER_ROWS, current),
  });
}

const TABLES = new WeakMap();
/** The tables for the current bindings `current`, built once per bindings. */
function tables(bindings) {
  const current = currentOf(bindings);
  let t = TABLES.get(current);
  if (!t) { t = buildTables(current); TABLES.set(current, t); }
  return t;
}

const DEFAULT_TABLES = tables(null);

/** The full rows per mode and device with the default bindings, 3D's being Fly's. */
export const BINDINGS = DEFAULT_TABLES.bindings;

/** The 3D rows per Camera setting and device, Fly's being BINDINGS['3d']'s. */
export const BINDINGS_3D = DEFAULT_TABLES.bindings3d;

/**
 * The help list (the pause card and the H panel) where it is shorter than the full list, per mode and
 * device (3D's per camera); a mode and device not listed here shows its full rows.
 */
export const HELP_BINDINGS = DEFAULT_TABLES.help;

/** The 3D ready card's rows per camera, on the keyboard and mouse and on touch. */
export const READY_BINDINGS = DEFAULT_TABLES.ready;

/** The input devices a mode lists bindings for: the keyboard and the controller, and touch where the mode has touch rows. */
export function bindingDevices(mode) {
  return Object.hasOwn(BINDINGS, mode) && Object.hasOwn(BINDINGS[mode], 'touch') ? [...BINDING_DEVICES, TOUCH_DEVICE] : [...BINDING_DEVICES];
}

export function bindingRows(mode, device, camera = 'fly', bindings = null) {
  const t = tables(bindings);
  const byDevice = Object.hasOwn(t.bindings, mode) ? t.bindings[mode] : null;
  if (!byDevice) throw new Error(`bindings: unknown mode "${mode}"`);
  if (!Object.hasOwn(byDevice, device)) throw new Error(`bindings: unknown device "${device}"`);
  if (mode !== '3d') return byDevice[device];
  if (!Object.hasOwn(t.bindings3d, camera)) throw new Error(`bindings: unknown camera "${camera}"`);
  return t.bindings3d[camera][device];
}

/** The help list's rows: HELP_BINDINGS' where it holds the mode and device, otherwise the full rows. */
export function helpRows(mode, device, camera = 'fly', bindings = null) {
  const full = bindingRows(mode, device, camera, bindings);
  const all = tables(bindings).help;
  const help = mode === '3d' ? all['3d'][camera] : all[mode];
  return help && Object.hasOwn(help, device) ? help[device] : full;
}

/** The 3D ready card's rows for 'keyboard' (the keyboard and mouse) or 'touch', for the camera. */
export function readyRows(device, camera = 'fly', bindings = null) {
  const ready = tables(bindings).ready;
  if (!Object.hasOwn(ready, camera)) throw new Error(`bindings: unknown camera "${camera}"`);
  if (!Object.hasOwn(ready[camera], device)) throw new Error(`bindings: unknown ready card device "${device}"`);
  return ready[camera][device];
}

const escape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A key in row text: `[Name]`, the name `]` included.
const KEY = /\[(\]|[^\]]+)\]/g;
const KEY_PART = /^\[(?:\]|[^\]]+)\]$/;

/** Row text as plain text: a key's name, a controller button's glyph. */
const plainText = (text, glyphs) => text.replace(KEY, '$1').replace(/\{([a-z]+)\}/g, (m, name) => (Object.hasOwn(glyphs, name) ? glyphs[name] : m));

function render(text, glyphs) {
  return text.split(/(\[(?:\]|[^\]]+)\]|\{[a-z]+\})/).map((part) => {
    if (KEY_PART.test(part)) return `<kbd>${escape(part.slice(1, -1))}</kbd>`;
    if (/^\{[a-z]+\}$/.test(part)) {
      const name = part.slice(1, -1);
      return Object.hasOwn(glyphs, name) ? `<kbd class="pad">${escape(glyphs[name])}</kbd>` : escape(part);
    }
    return escape(part);
  }).join('');
}

/** A row text in plain words: a key by its name, a controller button by its glyph, no key caps. */
function words(text, glyphs) {
  return escape(plainText(text, glyphs));
}

/** The controls list's rows (`dl.ui-controls`): each key in plain words, then its action. */
export function bindingsListHtml(list, glyphs = GLYPHS.generic) {
  return list.map(([input, act]) => `<dt class="ui-controls__key">${words(input, glyphs)}</dt><dd class="ui-controls__action">${words(act, glyphs)}</dd>`).join('');
}

/** The bindings component: the full rows of `mode` for `device` (3D's for `camera`), the controller drawn in `glyphs`. */
export function bindingsHtml(mode, device, glyphs = GLYPHS.generic, camera = 'fly', bindings = null) {
  return bindingsListHtml(bindingRows(mode, device, camera, bindings), glyphs);
}

/** The help list of the pause card and the H panel. */
export function helpListHtml(mode, device, glyphs = GLYPHS.generic, camera = 'fly', bindings = null) {
  return bindingsListHtml(helpRows(mode, device, camera, bindings), glyphs);
}

/** The 3D ready card's list. */
export function readyListHtml(device, glyphs = GLYPHS.generic, camera = 'fly', bindings = null) {
  return bindingsListHtml(readyRows(device, camera, bindings), glyphs);
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

/** The first-use hint strip per mode and device with the default bindings. */
export const HINT_STRIP = DEFAULT_TABLES.hintStrip;

/** The H panel's foot line: the key that hides it, and 3D's release rule (on touch, the release rule alone; nothing in Classic 2D). */
export const HELP_FOOT = Object.freeze({
  'classic-2d': Object.freeze({ keyboard: '[H] hides this panel.', controller: '[H] hides this panel.', touch: '' }),
  '3d': Object.freeze({
    keyboard: '[H] hides this panel. Actions fire on release.',
    controller: '{x} hides this panel. Actions fire on release.',
    touch: 'Actions fire when your finger lifts.',
  }),
});

/** The one-time hints' and Learn 3D prompts' text per device with the default bindings. */
export const HINT_TEXT = DEFAULT_TABLES.hintText;

export function hudStripHtml(mode, device, glyphs = GLYPHS.generic, { muted = false, spacing = SPACING_START } = {}) {
  return pick(HUD_STRIP, mode, device, 'HUD strip').map(([input, act]) => {
    const label = act === 'sound' ? `sound ${muted ? 'off' : 'on'}` : act === 'spacing' ? `spacing ${spacing.toFixed(1)}` : act;
    return `<span class="kbd-hint">${render(input, glyphs)} ${escape(label)}</span>`;
  }).join('');
}

export function hintStripHtml(mode, device, glyphs = GLYPHS.generic, bindings = null) {
  const list = pick(tables(bindings).hintStrip, mode, device, 'hint strip');
  if (device === TOUCH_DEVICE.id) return list.map(([input, act]) => `${escape(input)} ${escape(act)}`).join(' &middot; ');
  return list.map(([input, act]) => `<span class="kbd-hint"><kbd>${escape(plainText(input, glyphs))}</kbd> ${escape(act)}</span>`).join(' ');
}

export function helpFootHtml(mode, device, glyphs = GLYPHS.generic) {
  return words(pick(HELP_FOOT, mode, device, 'help foot'), glyphs);
}

export function hintText(name, device, glyphs = GLYPHS.generic, bindings = null) {
  const all = tables(bindings).hintText;
  if (!Object.hasOwn(all, name)) throw new Error(`hint text: unknown hint "${name}"`);
  const t = all[name][device];
  if (t === undefined) throw new Error(`hint text: unknown device "${device}"`);
  return plainText(t, glyphs);
}

/** The figures panel's controls reminder per mode and device with the default bindings. */
export const REMINDER = DEFAULT_TABLES.reminder;

/** One key of a key hint or the reminder from row text: `[Key]` a key, `{name}` a button in `glyphs`, else words. */
function hintKey(key, device, glyphs) {
  const k = key.match(/^\[(.+)\]$/);
  if (k) return { text: k[1], pad: false };
  const b = key.match(/^\{([a-z]+)\}$/);
  if (b) return { text: Object.hasOwn(glyphs, b[1]) ? glyphs[b[1]] : b[1], pad: true };
  return { text: key, pad: device === 'controller' };
}

/** The reminder's rows for `mode` and `device`: [{ keys: [{ text, pad }], label }], the controller's buttons in `glyphs`. */
export function reminderKeys(mode, device, glyphs = GLYPHS.generic, bindings = null) {
  return pick(tables(bindings).reminder, mode, device, 'reminder').map(([input, label]) => ({
    keys: input.split(/(?<=[\]}])\+(?=[[{])/).map((key) => hintKey(key, device, glyphs)),
    label,
  }));
}

/** The key hints of the shell's actions, per device: `[Key]` a key, `{name}` a controller button, plain text a controller control. */
export const KEY_HINTS = Object.freeze({
  move: Object.freeze({ keyboard: Object.freeze(['[↑]', '[↓]']), controller: Object.freeze(['D-pad']), touch: Object.freeze([]) }),
  select: Object.freeze({ keyboard: Object.freeze(['[Enter]']), controller: Object.freeze(['{a}']), touch: Object.freeze([]) }),
  confirm: Object.freeze({ keyboard: Object.freeze([]), controller: Object.freeze(['{a}']), touch: Object.freeze([]) }),
  back: Object.freeze({ keyboard: Object.freeze(['[Esc]']), controller: Object.freeze(['{b}']), touch: Object.freeze([]) }),
  restart: Object.freeze({ keyboard: Object.freeze(['[F2]']), controller: Object.freeze(['{start}', '{y}']), touch: Object.freeze([]) }),
});

const HINT_DEVICES = Object.freeze(['keyboard', 'controller', 'touch']);

export function keyHintKeys(act, device, glyphs = GLYPHS.generic, { mode = 'classic-2d', bindings = null } = {}) {
  if (Object.hasOwn(KEY_HINTS, act)) {
    if (!Object.hasOwn(KEY_HINTS[act], device)) throw new Error(`key hint: unknown device "${device}"`);
    return KEY_HINTS[act][device].map((key) => hintKey(key, device, glyphs));
  }
  const catalogue = catalogueOf(mode);
  if (!catalogueAction(catalogue, act)) throw new Error(`key hint: unknown action "${act}"`);
  if (!HINT_DEVICES.includes(device)) throw new Error(`key hint: unknown device "${device}"`);
  if (device === 'touch') return [];
  const byDevice = currentOf(bindings)[catalogue];
  const from = device === 'controller' ? 'controller' : byDevice.keyboard[act].length ? 'keyboard' : 'mouse';
  return [...new Set(byDevice[from][act].map((input) => inputText(from, input)))]
    .map((t) => (from === 'mouse' ? { text: t, pad: false } : hintKey(t, device, glyphs)));
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
