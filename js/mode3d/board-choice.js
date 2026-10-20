// 3D board choice screen, the Classic 2D one's composition (js/classic2d/board-choice.js): the board
// options (Learn 3D, the four cube presets, Custom and Insert Board Code) on the left, what the
// chosen one needs on the right (how 3D works for Learn 3D, the no-guess switch and the board's three
// bests, the custom form with Random, or the board code field), and a bottom bar with the choice
// summarised, Records and Play. Opens on the last 3D board choice. Touches only the elements it is
// handed.
//
// A board choice is { size, custom, noGuess }: `size` one of BOARD_SIZES (a preset id or
// 'custom'); `custom` the custom board's { X, Y, Z, mines }, kept with a preset so the custom
// fields reopen as the player left them; `noGuess` a boolean. DEFAULT_CHOICE, the choice of a
// player with no last 3D choice stored and the fallback for one that does not normalise, has
// no-guess on.
//
// Custom boards take each dimension DIM_MIN to DIM_MAX and 1 to cells − 1 mines: one cell stays
// free because the first click is always safe, so a one-cell board takes no mine count at all.
// No-guess is offered on every preset, and on a custom board of at most NOGUESS_CELL_LIMIT cells with
// no side of exactly 2 cells: two cells stacked along such a side share every neighbour, so a mine in
// one of them is always a guess.
//
// Pure helpers:
//   PRESETS, FAMILIES        the presets in menu order, each { id, family, name, X, Y, Z, mines },
//                            and their families { id, label }.
//   presetKey(p) / presetByKey(key)   '6,6,6,10', the preset items' data-preset value.
//   presetTitle(p)           'Cube Beginner': family and name, the preset item's label,
//                            as results and Records name the board.
//   boxLine(board) / presetLabel(p)   '10 × 10 × 10 · 2,000 mines' for { X, Y, Z, mines }, the mines
//                            pluralised; a preset's size line.
//   mineDensity(board)       '7.8 % mines': mines ÷ cells, one decimal.
//   CUSTOM_HINT              Custom's meta line while it is not chosen: 'Each side 1–100'.
//   LEARN_SUMMARY            the bottom bar's summary of Learn 3D: 'Learn 3D · guided 4 × 4 × 3 box · no timer'.
//   validateCustom(board)    { ok: true } or { ok: false, field, reason }; field 'X' | 'Y' | 'Z' | 'mines'.
//   customInfo(board)        the custom form's info line from its size: '1,000 cells · up to 999 mines'
//                            (with a warning past the very large board), '1 cell · no room for a
//                            mine', or '' while a side is invalid.
//   customStatus(board)      { ok, field, max, text, warn? }: a refusal's reason as a sentence, or the
//                            info line; `max` the mine limit (null while the size is invalid).
//   noGuessAvailable(choice) whether the switch is offered for that choice.
//   noGuessReason(choice?)   the line shown above the disabled switch: the side-of-2 line when a
//                            side is 2, else the cell-limit line.
//   densityHintShown(custom, noGuess)  whether the density hint shows under the custom board's
//                            switch: no-guess on and offered, and a valid board above
//                            NOGUESS_DENSITY_HINT (js/classic2d/board-setup.js).
//   normaliseChoice(choice)  a valid choice as a plain copy, or null.
//   readChoice({ size, fields, noGuess }, fallbackCustom?)  the choice the fields describe, or null.
//   boardOf(choice)          { X, Y, Z, mines, noGuess } of the board to play.
//   randomBoard(random?)     the Random fill, the original formula, always a valid board.
//   choiceSummary({ selected, custom, noGuess, code })  the bottom bar's summary of the chosen
//                            option (`selected` 'learn', a preset id, 'custom' or 'code'): 'Cube
//                            Intermediate · 8 × 8 × 8 · 40 mines · no-guess', 'Custom · 10 × 10 × 10 ·
//                            120 mines', LEARN_SUMMARY, 'Board code · <code.label>' for an accepted
//                            code, else 'Board code · paste a code to play'.
//   bestsTitle({ selected, custom, noGuess })  'Cube Intermediate · no-guess · your bests', or the
//                            custom board's line in place of the name.
//
// bindBoardChoice({ root, onStart, onLearn, onBack, onRecords?, code?, bests? })
//   → { show, state, refresh, destroy }
//   root      the screen's element: the options [data-preset] — Learn 3D ('learn', also [data-learn];
//             js/mode3d/learn.js), the presets ('X,Y,Z,mines'), 'custom' and 'code';
//             aria-pressed marks the chosen one — each preset and Custom with its Last played chip
//             [data-last], Custom with its meta line [data-custom-meta]; Learn 3D's panel
//             [data-learn-panel]; the settings [data-settings] holding the presets' no-guess switch
//             [data-noguess="presets"] in [data-preset-settings] and, in [data-custom-settings], the
//             custom board's no-guess switch [data-noguess="custom"] — disabled above
//             NOGUESS_CELL_LIMIT or on a side of 2 cells, its reason line [data-noguess-reason] above
//             it, the density hint [data-density-hint] under it, which follows the fields and the
//             switch live and never disables it; the custom form (form) with its inputs
//             [data-field="X|Y|Z|mines"], the info line [data-info], Random [data-random] and the
//             refusal line [data-refusal]; the bests [data-bests], titled [data-bests-title], one
//             tile [data-best="<stat>"] per best; the code panel [data-code-panel] with the field
//             [data-code-field] and its line [data-code-info]; the bottom bar's summary
//             [data-summary], Records [data-records] and Play [data-play]; Back [data-back].
//             A click (a tap, the controller's A) chooses an option; Enter plays, on an option after
//             choosing it, and anywhere else in the screen but on another button. Play starts the
//             chosen board: onLearn() for Learn 3D, onStart(choice) for a preset or a valid custom
//             board, code.onPlay(text) for an accepted code; it is disabled on a refused custom board
//             and on an empty or refused code. Learn 3D shows its panel alone; a preset the settings
//             with the presets' switch, Custom with its own switch and the form; both the bests (for
//             the board the fields and the switch name); the code its panel alone. The info line,
//             refusal line, switch, density hint, bests, summary and Play follow the fields and the
//             switches live; Random fills the fields with randomBoard.
//   show(choice, { played, held })  fills the fields and the switches from `choice`, chooses its
//             size and marks its option data-last, the screen's default focus; its Last played chip
//             shows only when `played` (default true). `held` (a state() taken earlier) brings back
//             the chosen option, fields, switches and code text, the last board's mark staying with
//             `choice`.
//   state()   → { selected, fields, noGuess, customNoGuess, code }: what the screen holds.
//   refresh() redraws the bests (the shell's records changed).
//   onRecords(board) Records: the chosen board as boardOf gives it, or null with no board chosen
//             (Learn 3D, a code, a refused custom board).
//   code      { resolve, onPlay }: resolve(text) → { ok, reason?, text?, label? } validates the code
//             live, as Classic 2D's.
//   bests     (board) → [{ stat, label, value, note }]: the board's ({ X, Y, Z, mines, noGuess })
//             three bests as text, read through the records' queries by the shell
//             (js/shell/returning.js boardBests).

import { aboveDensityHint, DENSITY_HINT_TEXT } from '../classic2d/board-setup.js';
import { CODE_PROMPT } from '../classic2d/board-choice.js';
import { LEARN_BOARD, LEARN_TITLE } from './learn.js';

export const DIM_MIN = 1;
export const DIM_MAX = 100;

/** The largest custom board, in cells, that offers no-guess: 20 × 20 × 20, where the slowest no-guess
 *  request at the presets' densities takes about half a second (dev/measure-noguess-3d.mjs). */
export const NOGUESS_CELL_LIMIT = 8000;

export const LAST_CHOICE_DOC = 'mode3d.lastChoice';
export const LAST_CHOICE_VERSION = 1;

// The presets in menu order. The cube steps aim at about ×2.5 to ×3 in 3BV; measured ×2.9, ×1.9 and
// ×3.0 (dev/measure-typical-bbbv.mjs). Cube Beginner's mine count is measured by
// dev/measure-first-box-3d.mjs (no-guess, the first click on the marked start cell, 100 seeds a count):
//   Cube Beginner, 20 mines — of 16 to 20 (every seed generates, median 3BV left at least 40), the one
//     whose first click opens nearest 60 % of the safe cells: 60.5 %, median 3BV left 57.
// Preset ids name the tier, so a remembered choice follows it to the tier's current board; one naming
// a preset no longer offered does not normalise and opens on DEFAULT_CHOICE.
const preset = (id, family, name, X, Y, Z, mines) => Object.freeze({ id, family, name, X, Y, Z, mines });
export const PRESETS = Object.freeze([
  preset('cube-intro', 'cube', 'Intro', 6, 6, 6, 10),
  preset('cube-beginner', 'cube', 'Beginner', 6, 6, 6, 20),
  preset('cube-intermediate', 'cube', 'Intermediate', 8, 8, 8, 40),
  preset('cube-expert', 'cube', 'Expert', 10, 10, 10, 100),
]);
export const FAMILIES = Object.freeze([
  Object.freeze({ id: 'cube', label: 'Cube' }),
]);
export const BOARD_SIZES = Object.freeze([...PRESETS.map((p) => p.id), 'custom']);

export const DEFAULT_CHOICE = Object.freeze({
  size: 'cube-beginner',
  custom: Object.freeze({ X: 10, Y: 10, Z: 10, mines: 25 }),
  noGuess: true,
});

export const presetKey = (p) => `${p.X},${p.Y},${p.Z},${p.mines}`;
export const presetByKey = (key) => PRESETS.find((p) => presetKey(p) === key) ?? null;
export const presetTitle = (p) => `${FAMILIES.find((f) => f.id === p.family).label} ${p.name}`;
const presetById = (id) => PRESETS.find((p) => p.id === id) ?? null;

const n = (v) => v.toLocaleString('en-US');
const count = (v, noun) => `${n(v)} ${v === 1 ? noun : `${noun}s`}`;
const dim = (v) => Number.isInteger(v) && v >= DIM_MIN && v <= DIM_MAX;
const ints = (b) => !!b && [b.X, b.Y, b.Z, b.mines].every(Number.isInteger);

export const boxLine = ({ X, Y, Z, mines }) => `${X} × ${Y} × ${Z} · ${count(mines, 'mine')}`;
export const presetLabel = (p) => boxLine(p);
export const mineDensity = ({ X, Y, Z, mines }) => `${((mines / (X * Y * Z)) * 100).toFixed(1)} % mines`;
export const CUSTOM_HINT = `Each side ${DIM_MIN}–${DIM_MAX}`;
export const LEARN_SUMMARY = `${LEARN_TITLE} · guided ${LEARN_BOARD.X} × ${LEARN_BOARD.Y} × ${LEARN_BOARD.Z} box · no timer`;
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

export function customInfo(board) {
  const { X, Y, Z } = board ?? {};
  if (!dim(X) || !dim(Y) || !dim(Z)) return '';
  const cells = X * Y * Z;
  const max = cells - 1;
  const text = `${count(cells, 'cell')} · ${max < 1 ? 'no room for a mine' : `up to ${count(max, 'mine')}`}`;
  return cells > LARGE_BOARD ? `${text} · very large board, may run slowly` : text;
}

export function customStatus(board) {
  const { X, Y, Z } = board ?? {};
  const v = validateCustom(board);
  const max = dim(X) && dim(Y) && dim(Z) ? X * Y * Z - 1 : null;
  if (!v.ok) return { ok: false, field: v.field, max, text: `${v.reason}.` };
  const status = { ok: true, field: null, max, text: customInfo(board) };
  return X * Y * Z > LARGE_BOARD ? { ...status, warn: true } : status;
}

const sideOf2 = (choice) => choice?.size === 'custom' && [choice.custom?.X, choice.custom?.Y, choice.custom?.Z].includes(2);

export function noGuessAvailable(choice) {
  if (choice?.size !== 'custom') return true;
  const { X, Y, Z } = choice.custom ?? {};
  return dim(X) && dim(Y) && dim(Z) && !sideOf2(choice) && X * Y * Z <= NOGUESS_CELL_LIMIT;
}

export function densityHintShown(custom, noGuess) {
  if (!noGuess || !validateCustom(custom).ok || !noGuessAvailable({ size: 'custom', custom })) return false;
  return aboveDensityHint(custom.mines, custom.X * custom.Y * custom.Z);
}

export const noGuessReason = (choice) => (sideOf2(choice)
  ? 'No-guess isn\'t available when a side is 2 cells'
  : `No-guess is available up to ${n(NOGUESS_CELL_LIMIT)} cells`);

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

const NO_GUESS = ' · no-guess';

export function choiceSummary({ selected, custom, noGuess, code = null }) {
  if (selected === 'learn') return LEARN_SUMMARY;
  if (selected === 'code') return `Board code · ${code?.ok && code.label ? code.label : 'paste a code to play'}`;
  const ng = noGuess ? NO_GUESS : '';
  if (selected === 'custom') return ints(custom) ? `Custom · ${boxLine(custom)}${ng}` : 'Custom';
  const p = presetById(selected);
  return `${presetTitle(p)} · ${boxLine(p)}${ng}`;
}

export function bestsTitle({ selected, custom, noGuess }) {
  const name = selected === 'custom' ? (ints(custom) ? boxLine(custom) : 'Custom') : presetTitle(presetById(selected));
  return `${name}${noGuess ? NO_GUESS : ''} · your bests`;
}

const FIELDS = Object.freeze(['X', 'Y', 'Z', 'mines']);
/** An option's value: a preset's id for its key, else 'learn', 'custom' or 'code'. */
const optionOf = (b) => presetByKey(b.dataset.preset)?.id ?? b.dataset.preset;
const large = (b) => dim(b.X) && dim(b.Y) && dim(b.Z) && b.X * b.Y * b.Z > LARGE_BOARD;

export function bindBoardChoice({ root, onStart, onLearn, onBack, onRecords = null, code = null, bests = null }) {
  const $ = (sel) => root.querySelector(sel);
  const options = [...root.querySelectorAll('[data-preset]')];
  const option = (value) => options.find((b) => optionOf(b) === value);
  const form = $('form');
  const inputs = FIELDS.map((f) => $(`[data-field="${f}"]`));
  const info = $('[data-info]');
  const refusal = $('[data-refusal]');
  const noGuessPresets = $('[data-noguess="presets"]');
  const noGuess = $('[data-noguess="custom"]');
  const reason = $('[data-noguess-reason]');
  const hint = $('[data-density-hint]');
  const learnPanel = $('[data-learn-panel]');
  const settings = $('[data-settings]');
  const presetSettings = $('[data-preset-settings]');
  const customSettings = $('[data-custom-settings]');
  const bestsBox = $('[data-bests]');
  const codePanel = $('[data-code-panel]');
  const codeInput = $('[data-code-field]');
  const codeInfo = $('[data-code-info]');
  const summary = $('[data-summary]');
  const play = $('[data-play]');
  const records = $('[data-records]');
  const random = $('[data-random]');
  const back = $('[data-back]');
  const customMeta = $('[data-custom-meta]');
  hint.textContent = DENSITY_HINT_TEXT;
  let selected = DEFAULT_CHOICE.size;
  let last = null;
  let wanted = false; // the custom board's no-guess choice, kept while the board does not offer it

  const fields = () => Object.fromEntries(FIELDS.map((f, i) => [f, inputs[i].value]));
  const custom = () => readCustom(fields());
  const codeText = () => String(codeInput?.value ?? '').trim();
  const codeResult = () => (code && codeText() ? code.resolve(codeText()) : null);
  const isBoard = () => selected === 'custom' || !!presetById(selected);
  /** The position of the switch that governs the chosen board: the custom board's, or the presets'. */
  const switchOn = () => (selected === 'custom' ? noGuess.checked : noGuessPresets.checked);
  /** The chosen board's choice: a preset, a valid custom board, or null (Learn 3D, a code, a refused custom board). */
  const chosen = () => (isBoard()
    ? readChoice({ size: selected, fields: fields(), noGuess: selected === 'custom' ? wanted : noGuessPresets.checked }, last?.custom)
    : null);

  const drawBests = () => {
    if (!bestsBox || !isBoard()) return;
    $('[data-bests-title]').textContent = bestsTitle({ selected, custom: custom(), noGuess: switchOn() });
    const choice = chosen();
    const tiles = choice && bests ? bests(boardOf(choice)) : [];
    for (const tile of bestsBox.querySelectorAll('[data-best]')) {
      const t = tiles.find((x) => x.stat === tile.dataset.best);
      tile.querySelector('.ui-stat__value').textContent = t?.value ?? '—';
      tile.querySelector('.ui-stat__detail').textContent = t?.note ?? 'no best yet';
    }
  };

  const update = () => {
    const c = custom();
    const s = customStatus(c);
    const isCustom = selected === 'custom';
    const isCode = selected === 'code';
    const isLearn = selected === 'learn';
    info.textContent = customInfo(c);
    info.classList.toggle('hidden', !info.textContent);
    info.classList.toggle('ui-text--warning', large(c));
    info.classList.toggle('ui-text--muted', !large(c));
    refusal.textContent = s.ok ? '' : s.text;
    refusal.classList.toggle('hidden', s.ok);
    if (s.max !== null) inputs[3].max = String(Math.max(1, s.max));
    for (const [i, f] of FIELDS.entries()) {
      inputs[i].toggleAttribute('data-adjusted', s.field === f);
      if (s.field === f) inputs[i].setAttribute('aria-invalid', 'true');
      else inputs[i].removeAttribute('aria-invalid');
    }
    const board = { size: 'custom', custom: c };
    const available = s.max === null || noGuessAvailable(board);
    noGuess.disabled = !available;
    noGuess.checked = available && wanted;
    reason.textContent = available ? '' : noGuessReason(board);
    reason.classList.toggle('hidden', available);
    hint.classList.toggle('hidden', !densityHintShown(c, noGuess.checked));
    if (customMeta) customMeta.textContent = isCustom && ints(c) ? (s.ok ? `${boxLine(c)} · ${mineDensity(c)}` : boxLine(c)) : CUSTOM_HINT;
    const r = isCode ? codeResult() : null;
    if (codeInfo) {
      codeInfo.textContent = !r ? CODE_PROMPT : r.ok ? r.text ?? '' : r.reason;
      codeInfo.classList.toggle('ui-text--warning', !!r && !r.ok);
      codeInfo.classList.toggle('ui-text--muted', !r || r.ok);
    }
    learnPanel?.classList.toggle('hidden', !isLearn);
    settings.classList.toggle('hidden', !isBoard());
    presetSettings?.classList.toggle('hidden', isCustom);
    customSettings?.classList.toggle('hidden', !isCustom);
    form.classList.toggle('hidden', !isCustom);
    bestsBox?.classList.toggle('hidden', !isBoard());
    codePanel?.classList.toggle('hidden', !isCode);
    for (const b of options) b.setAttribute('aria-pressed', String(optionOf(b) === selected));
    summary.textContent = choiceSummary({ selected, custom: c, noGuess: switchOn(), code: r });
    play.disabled = isCode ? !r?.ok : isCustom && !s.ok;
    drawBests();
    return s;
  };

  const choose = (value) => {
    if (!option(value)) return;
    selected = value;
    update();
  };
  const start = () => {
    if (selected === 'learn') {
      onLearn?.();
      return;
    }
    if (selected === 'code') {
      const r = codeResult();
      if (r?.ok) code.onPlay(codeText());
      return;
    }
    const s = update();
    if (selected === 'custom' && !s.ok) {
      $(`[data-field="${s.field}"]`)?.focus();
      return;
    }
    const choice = chosen();
    if (choice) onStart(choice);
  };

  const onOption = (event) => choose(optionOf(event.currentTarget));
  const onKey = (event) => {
    if (event.key !== 'Enter' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    const opt = target?.closest?.('[data-preset]');
    if (!opt && target?.closest?.('button')) return; // another button activates itself
    event.preventDefault();
    if (opt) choose(optionOf(opt));
    start();
  };
  const onSubmit = (event) => event.preventDefault();
  const onRandom = () => {
    const b = randomBoard();
    for (const [i, f] of FIELDS.entries()) inputs[i].value = String(b[f]);
    update();
  };
  const onNoGuess = () => { wanted = noGuess.checked; update(); };
  const onRecordsClick = () => {
    const choice = chosen();
    onRecords?.(choice ? boardOf(choice) : null);
  };
  const onBackClick = () => onBack?.();

  for (const b of options) b.addEventListener('click', onOption);
  for (const inp of inputs) inp.addEventListener('input', update);
  noGuess.addEventListener('change', onNoGuess);
  noGuessPresets.addEventListener('change', update);
  codeInput?.addEventListener('input', update);
  form.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', onKey);
  random.addEventListener('click', onRandom);
  records?.addEventListener('click', onRecordsClick);
  play.addEventListener('click', start);
  back?.addEventListener('click', onBackClick);

  return {
    show(choice, { played = true, held = null } = {}) {
      last = choice;
      const f = held?.fields ?? choice.custom;
      for (const [i, k] of FIELDS.entries()) inputs[i].value = String(f[k]);
      noGuessPresets.checked = held ? !!held.noGuess : !!choice.noGuess;
      wanted = held ? !!held.customNoGuess : !!choice.noGuess;
      if (codeInput) codeInput.value = held?.code ?? '';
      for (const b of options) {
        const isLast = optionOf(b) === choice.size;
        b.toggleAttribute('data-last', isLast);
        b.querySelector('[data-last]')?.classList.toggle('hidden', !(isLast && played));
      }
      selected = option(held?.selected) ? held.selected : choice.size;
      update();
    },
    state() {
      return { selected, fields: fields(), noGuess: noGuessPresets.checked, customNoGuess: wanted, code: codeInput?.value ?? '' };
    },
    refresh() { drawBests(); },
    destroy() {
      for (const b of options) b.removeEventListener('click', onOption);
      for (const inp of inputs) inp.removeEventListener('input', update);
      noGuess.removeEventListener('change', onNoGuess);
      noGuessPresets.removeEventListener('change', update);
      codeInput?.removeEventListener('input', update);
      form.removeEventListener('submit', onSubmit);
      root.removeEventListener('keydown', onKey);
      random.removeEventListener('click', onRandom);
      records?.removeEventListener('click', onRecordsClick);
      play.removeEventListener('click', start);
      back?.removeEventListener('click', onBackClick);
    },
  };
}
