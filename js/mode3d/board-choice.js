// 3D board choice: the six presets, a custom board, the Random fill and the no-guess switch,
// preselected from the last 3D board choice. Touches only the elements it is handed.
//
// A board choice is { size, custom, noGuess }: `size` one of BOARD_SIZES (a preset id or
// 'custom'); `custom` the custom board's { X, Y, Z, mines }, kept with a preset so the custom
// fields reopen as the player left them; `noGuess` a boolean.
//
// Custom boards take each dimension DIM_MIN to DIM_MAX and 1 to cells − 1 mines: one cell stays
// free because the first click is always safe, so a one-cell board takes no mine count at all.
// No-guess is offered on every preset, and on a custom board of at most NOGUESS_CELL_LIMIT cells.
//
// Pure helpers:
//   PRESETS, FAMILIES        the presets in menu order, each { id, family, name, X, Y, Z, mines },
//                            and their families { id, label }.
//   presetKey(p) / presetByKey(key)   '6,6,6,10', the preset items' data-preset value.
//   presetLabel(p)           '8 × 8 × 2 · 10 mines'.
//   validateCustom(board)    { ok: true } or { ok: false, field, reason }; field 'X' | 'Y' | 'Z' | 'mines'.
//   customStatus(board)      { ok, field, max, text, warn? }: the info line under the custom fields;
//                            `max` the mine limit (null while the size is invalid).
//   noGuessAvailable(choice) whether the switch is offered for that choice.
//   noGuessReason()          the line shown above the disabled switch.
//   normaliseChoice(choice)  a valid choice as a plain copy, or null.
//   readChoice({ size, fields, noGuess }, fallbackCustom?)  the choice the fields describe, or null.
//   boardOf(choice)          { X, Y, Z, mines, noGuess } of the board to play.
//   randomBoard(random?)     the Random fill, the original formula, always a valid board.
//
// bindBoardChoice({ root, onStart, onBack }) → { show(choice, { played }), destroy() }
//   root      the screen's element: preset items [data-preset="X,Y,Z,mines"], the custom form
//             (form) with its submit button [data-preset="custom"], inputs
//             [data-field="X|Y|Z|mines"], Random [data-random], the info line [data-info], the
//             presets' no-guess switch [data-noguess="presets"], the custom board's no-guess
//             switch [data-noguess="custom"] — disabled above NOGUESS_CELL_LIMIT, its reason
//             line [data-noguess-reason] above it — and Back [data-back].
//   show(choice, { played })  fills the fields and the switch from `choice` and marks its item
//             data-last, the screen's default focus; the "Last played" line shows only when
//             `played` (default true).
//   onStart(choice) when a preset is picked or a valid custom board submitted; onBack() on Back.

export const DIM_MIN = 1;
export const DIM_MAX = 100;

/** The largest custom board, in cells, that offers no-guess. */
export const NOGUESS_CELL_LIMIT = 1000;

export const LAST_CHOICE_DOC = 'mode3d.lastChoice';
export const LAST_CHOICE_VERSION = 1;

const preset = (id, family, name, X, Y, Z, mines) => Object.freeze({ id, family, name, X, Y, Z, mines });
export const PRESETS = Object.freeze([
  preset('double-beginner', 'double', 'Beginner', 8, 8, 2, 10),
  preset('double-intermediate', 'double', 'Intermediate', 14, 14, 2, 60),
  preset('double-expert', 'double', 'Expert', 25, 16, 2, 130),
  preset('cube-beginner', 'cube', 'Beginner', 6, 6, 6, 10),
  preset('cube-intermediate', 'cube', 'Intermediate', 8, 8, 8, 40),
  preset('cube-expert', 'cube', 'Expert', 12, 12, 8, 130),
]);
export const FAMILIES = Object.freeze([
  Object.freeze({ id: 'double', label: 'Double layer' }),
  Object.freeze({ id: 'cube', label: 'Cube' }),
]);
export const BOARD_SIZES = Object.freeze([...PRESETS.map((p) => p.id), 'custom']);

export const DEFAULT_CHOICE = Object.freeze({
  size: 'double-beginner',
  custom: Object.freeze({ X: 10, Y: 10, Z: 10, mines: 25 }),
  noGuess: false,
});

export const presetKey = (p) => `${p.X},${p.Y},${p.Z},${p.mines}`;
export const presetByKey = (key) => PRESETS.find((p) => presetKey(p) === key) ?? null;
const presetById = (id) => PRESETS.find((p) => p.id === id) ?? null;
export const presetLabel = (p) => `${p.X} × ${p.Y} × ${p.Z} · ${p.mines} mines`;

const n = (v) => v.toLocaleString('en-US');
const dim = (v) => Number.isInteger(v) && v >= DIM_MIN && v <= DIM_MAX;
const FIELD_LABELS = Object.freeze({ X: 'Width', Y: 'Height', Z: 'Depth' });

export function validateCustom(board) {
  const { X, Y, Z, mines } = board ?? {};
  for (const [field, v] of [['X', X], ['Y', Y], ['Z', Z]]) {
    if (!dim(v)) return { ok: false, field, reason: `${FIELD_LABELS[field]} must be a whole number from ${DIM_MIN} to ${DIM_MAX}` };
  }
  const max = X * Y * Z - 1;
  if (max < 1) {
    return { ok: false, field: 'mines', reason: `A ${X} × ${Y} × ${Z} board has no room for a mine beside the safe first click — make it at least 2 cells` };
  }
  if (!Number.isInteger(mines) || mines < 1 || mines > max) {
    return { ok: false, field: 'mines', reason: `Mines must be a whole number from 1 to ${n(max)} on a ${X} × ${Y} × ${Z} board` };
  }
  return { ok: true };
}

const LARGE_BOARD = 250000;

export function customStatus(board) {
  const { X, Y, Z } = board ?? {};
  const v = validateCustom(board);
  const max = dim(X) && dim(Y) && dim(Z) ? X * Y * Z - 1 : null;
  if (!v.ok) return { ok: false, field: v.field, max, text: `${v.reason}.` };
  const cells = X * Y * Z;
  const status = { ok: true, field: null, max, text: `${n(cells)} cells · up to ${n(max)} mines` };
  if (cells > LARGE_BOARD) return { ...status, text: `${status.text} · very large board, may run slowly`, warn: true };
  return status;
}

export function noGuessAvailable(choice) {
  if (choice?.size !== 'custom') return true;
  const { X, Y, Z } = choice.custom ?? {};
  return dim(X) && dim(Y) && dim(Z) && X * Y * Z <= NOGUESS_CELL_LIMIT;
}

export const noGuessReason = () => `No-guess is available up to ${n(NOGUESS_CELL_LIMIT)} cells`;

export function normaliseChoice(choice) {
  if (!choice || typeof choice !== 'object') return null;
  if (!BOARD_SIZES.includes(choice.size) || typeof choice.noGuess !== 'boolean') return null;
  const custom = choice.custom ?? (choice.size === 'custom' ? null : DEFAULT_CHOICE.custom);
  if (!custom || !validateCustom(custom).ok) return null;
  const c = { size: choice.size, custom: { X: custom.X, Y: custom.Y, Z: custom.Z, mines: custom.mines }, noGuess: choice.noGuess };
  if (!noGuessAvailable(c)) c.noGuess = false;
  return c;
}

const int = (v) => (typeof v === 'number' ? v : /^\s*-?\d+\s*$/.test(String(v)) ? parseInt(v, 10) : NaN);
const readCustom = (fields) => ({ X: int(fields.X), Y: int(fields.Y), Z: int(fields.Z), mines: int(fields.mines) });

export function readChoice({ size, fields, noGuess }, fallbackCustom = null) {
  const custom = readCustom(fields);
  const valid = validateCustom(custom).ok;
  if (size === 'custom') return valid ? normaliseChoice({ size, custom, noGuess: !!noGuess }) : null;
  return normaliseChoice({ size, custom: valid ? custom : fallbackCustom ?? undefined, noGuess: !!noGuess });
}

export function boardOf(choice) {
  const c = normaliseChoice(choice);
  if (!c) throw new RangeError(`invalid 3D board choice: ${JSON.stringify(choice)}`);
  const { X, Y, Z, mines } = c.size === 'custom' ? c.custom : presetById(c.size);
  return { X, Y, Z, mines, noGuess: c.noGuess };
}

/** Random board, original formula (Menu.cs Random_Click), with guards for tiny boards. */
export function randomBoard(random = Math.random) {
  const randInt = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)); // inclusive
  const Z = randInt(1, 29);
  const Y = randInt(1, Math.max(1, 29 - Z));
  let X = Math.min(DIM_MAX, randInt(1, Math.max(1, 29 - (Z - Y))));
  if (X * Y * Z < 2) X = 2; // a one-cell board has no mine count
  const cells = X * Y * Z;
  const mines = Math.min(cells - 1, randInt(1, Math.max(1, Math.floor(cells / 5) - 1)));
  return { X, Y, Z, mines };
}

const FIELDS = Object.freeze(['X', 'Y', 'Z', 'mines']);

export function bindBoardChoice({ root, onStart, onBack }) {
  const items = [...root.querySelectorAll('[data-preset]')];
  const form = root.querySelector('form');
  const inputs = FIELDS.map((f) => root.querySelector(`[data-field="${f}"]`));
  const info = root.querySelector('[data-info]');
  const noGuessPresets = root.querySelector('[data-noguess="presets"]');
  const noGuess = root.querySelector('[data-noguess="custom"]');
  const reason = root.querySelector('[data-noguess-reason]');
  const random = root.querySelector('[data-random]');
  const back = root.querySelector('[data-back]');
  let last = null;
  let wanted = false; // the custom board's no-guess choice, kept while the board is above the limit

  for (const b of items) {
    if (!b.classList.contains('ui-menu__item')) continue;
    const line = b.ownerDocument.createElement('span');
    line.className = 'ui-menu__detail hidden';
    line.dataset.last = '';
    line.textContent = 'Last played';
    b.appendChild(line);
  }

  const fields = () => Object.fromEntries(FIELDS.map((f, i) => [f, inputs[i].value]));
  const update = () => {
    const custom = readCustom(fields());
    const s = customStatus(custom);
    info.textContent = s.text;
    const warn = !s.ok || !!s.warn;
    info.classList.toggle('ui-text--warning', warn);
    info.classList.toggle('ui-text--muted', !warn);
    if (s.max !== null) inputs[3].max = String(s.max);
    for (const [i, f] of FIELDS.entries()) inputs[i].toggleAttribute('data-adjusted', s.field === f);
    const available = s.max === null || noGuessAvailable({ size: 'custom', custom });
    noGuess.disabled = !available;
    noGuess.checked = available && wanted;
    reason.textContent = available ? '' : noGuessReason();
    reason.classList.toggle('hidden', available);
    return s;
  };
  const start = (size) => {
    const ng = size === 'custom' ? wanted : noGuessPresets.checked;
    const choice = readChoice({ size, fields: fields(), noGuess: ng }, last?.custom);
    if (choice) onStart(choice);
    return choice;
  };
  const sizeOf = (b) => (b.dataset.preset === 'custom' ? 'custom' : presetByKey(b.dataset.preset)?.id);

  const onItem = (event) => {
    const size = sizeOf(event.currentTarget);
    if (size && size !== 'custom') start(size);
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
  const onRandom = () => {
    const b = randomBoard();
    for (const [i, f] of FIELDS.entries()) inputs[i].value = String(b[f]);
    update();
  };
  const onNoGuess = () => { wanted = noGuess.checked; };
  const onBackClick = () => onBack?.();

  for (const b of items) b.addEventListener('click', onItem);
  for (const inp of inputs) inp.addEventListener('input', update);
  form.addEventListener('submit', onSubmit);
  random.addEventListener('click', onRandom);
  noGuess.addEventListener('change', onNoGuess);
  back?.addEventListener('click', onBackClick);

  return {
    show(choice, { played = true } = {}) {
      last = choice;
      for (const [i, f] of FIELDS.entries()) inputs[i].value = String(choice.custom[f]);
      wanted = !!choice.noGuess;
      noGuessPresets.checked = !!choice.noGuess;
      for (const b of items) {
        const isLast = sizeOf(b) === choice.size;
        b.toggleAttribute('data-last', isLast);
        b.querySelector('[data-last]')?.classList.toggle('hidden', !(isLast && played));
      }
      update();
    },
    destroy() {
      for (const b of items) b.removeEventListener('click', onItem);
      for (const inp of inputs) inp.removeEventListener('input', update);
      form.removeEventListener('submit', onSubmit);
      random.removeEventListener('click', onRandom);
      noGuess.removeEventListener('change', onNoGuess);
      back?.removeEventListener('click', onBackClick);
    },
  };
}
