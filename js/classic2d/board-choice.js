// Classic 2D board choice screen: the board options (Beginner, Intermediate, Expert, Custom and
// Insert Board Code), the board choice panel to their right holding what the chosen one needs (the
// no-guess switch, the board's three bests and All records, the custom form with Random, or the
// board code field), and a foot holding Play alone. Opens on the last board choice. Touches only the
// elements it is handed.
//
// The board choice panel, one behaviour for every mode's board choice (bindChoicePanel below, which
// the 3D board choice and any flat mode on this binder share): open while the player has pinned it,
// or while an option whose content lives in it is chosen (PANEL_OPTIONS: Custom, Insert Board Code,
// Learn 3D), closed otherwise. The panel toggle pins and unpins it; on a phone the drawer's bar does
// the same. The pin is the shell's stored preference, handed in.
//
// Pure helpers:
//   CHOICE_SIZES             the standard sizes offered as board options, in order.
//   CUSTOM_HINT              Custom's meta line while it is not chosen: 'Width and height 1–100'.
//   boardLine(board)         '30 × 16 · 99 mines' for { width, height, mines }, the mines pluralised.
//   sizeLabel(size)          a standard size's board line.
//   mineDensity(board)       '20.6 % mines': mines ÷ cells, one decimal.
//   customStatus(custom)     { ok, field, max, text } for a custom { width, height, mines }, validated
//                            against CUSTOM_LIMITS (js/classic2d/board-setup.js validateCustom): a
//                            refusal's reason capitalised, with no final period, or the info line; `max` is the mine
//                            limit for that width and height (null while the size is invalid).
//   customInfo(custom)       the custom form's info line from its width and height: '480 cells · up to
//                            99 mines', '1 cell · no room for a mine', or '' while a side is invalid.
//   randomCustom(random?)    the Random fill: a random valid custom board, at most about one mine in
//                            five cells, as the 3D form's Random (js/mode3d/board-choice.js).
//   readChoice({ size, fields, noGuess }, fallbackCustom?)  the board choice the screen's fields
//                            describe, or null. A standard size keeps the fields' custom board
//                            when it is valid, else `fallbackCustom`; 'custom' needs valid fields.
//   densityHintShown(custom, noGuess)  whether the density hint shows for a custom board: no-guess
//                            on and a valid board above NOGUESS_DENSITY_HINT (board-setup.js).
//   PANEL_OPTIONS            the options that open the panel on their own: 'custom', 'code', 'learn'.
//   panelOpen(selected, pinned)  whether the panel is open: pinned, or a PANEL_OPTIONS option chosen.
//   panelLabel(selected)     the drawer's label: 'Board code', 'Learn 3D', else 'Board settings'.
//   bestsTitle({ selected, custom, noGuess })  'Intermediate · no-guess · your bests', or the custom
//                            board's line in place of the name.
//   showCodeLine(line, field, r)  draws the code field's line for code.resolve's answer r (below),
//                            on both board choice screens.
//
// bindChoicePanel({ root, pin }) → { draw(selected), destroy() }
//   root      the screen's element: the panel [data-panel] (data-open "true" while open), the rule
//             before it [data-panel-rule] (hidden while closed), the panel toggle [data-panel-toggle]
//             (aria-pressed while pinned) and the drawer's bar [data-drawer-bar] (aria-expanded while
//             open) with its label [data-drawer-label]. A click on the toggle or the bar flips the
//             pin; while an option of PANEL_OPTIONS is chosen the panel stays open, the click
//             changing only the stored preference.
//   pin       { pinned, setPinned(on) }: the stored pin (js/shell/returning.js createBoardPanelPin);
//             none reads as unpinned.
//   draw(selected)  redraws the panel for the chosen option and the pin as it stands.
//
// bindBoardChoice({ root, onStart, onBack, onRecords?, code?, bests?, pin? }) → { show, state, refresh, destroy }
//   root      the screen's element: the options [data-size] (beginner, intermediate, expert, custom,
//             code; aria-pressed marks the chosen one), Custom with its meta line
//             [data-custom-meta]; the board choice panel (bindChoicePanel); the settings [data-settings] with the
//             no-guess switch [data-noguess] and the density hint [data-density-hint]; the custom
//             form (form) with its inputs [data-field="width|height|mines"], the info line
//             [data-info], Random [data-random] and the refusal line [data-refusal]; the bests
//             [data-bests], titled [data-bests-title], one tile [data-best="<stat>"] per best; the
//             code panel [data-code-panel] with the field [data-code-field] and its line
//             [data-code-info]; All records [data-records] under the bests; the foot's Play
//             [data-play]; Back [data-back].
//             A click (a tap, the controller's A) chooses an option; Enter plays, on an option after
//             choosing it, and anywhere else in the screen but on another button. Play starts the
//             chosen board: onStart(choice) for a preset or a valid custom board, code.onPlay(text)
//             for an accepted code; it is disabled on a refused custom board and on an empty or
//             refused code. The settings show for a preset and Custom, the form for Custom, the bests
//             for both (for the board the fields and the switch name), the code panel alone for the
//             code, all in the panel. The info line, refusal line, density hint, bests and Play
//             follow the fields and the switch live; the hint never refuses a board, and Random fills
//             the fields with randomCustom and validates them.
//   show(choice, { held })  fills the fields and the switch from `choice`, chooses its size and marks
//             its option data-last, the screen's default focus, and draws the panel for the pin as
//             stored. `held` (a state() taken earlier) brings back the chosen option, fields, switch
//             and code text, the last board's mark staying with `choice`.
//   state()   → { selected, fields, noGuess, code }: what the screen holds.
//   refresh() redraws the bests (the shell's records changed).
//   onRecords(identity) All records: the chosen board's records identity (board-setup.js boardSetup),
//             or null with no board chosen (a code, a refused custom board).
//   code      { resolve, onPlay }: resolve(text) → { ok, reason?, otherMode?, text?, label? } validates
//             the code live — its line (showCodeLine) shows CODE_PROMPT while empty, a refused code's
//             reason (a code of the other mode's as a warn note, any other as an err note with the
//             field invalid) and an accepted one's `text`; onPlay(text) plays it.
//   bests     (identity) → [{ stat, label, value, note }]: the board's three bests as text, read
//             through the records' queries by the shell (js/shell/returning.js boardBests).
//   pin       the board choice panel's stored pin, as bindChoicePanel takes it.

import {
  STANDARD_SIZES, validateCustom, maxMines, normaliseChoice, aboveDensityHint, DENSITY_HINT_TEXT, boardSetup,
} from './board-setup.js';
import { CUSTOM_LIMITS } from '../engine/profiles.js';
import { setNote } from '../ui/components.js';

/** The code field's info line while nothing is typed, on both board choice screens. */
export const CODE_PROMPT = 'Paste a board code to play that exact board.';

export const CHOICE_SIZES = Object.freeze(['beginner', 'intermediate', 'expert']);

export const CUSTOM_HINT = `Width and height ${CUSTOM_LIMITS.minSide}–${CUSTOM_LIMITS.maxSide}`;

const NAMES = Object.freeze({ beginner: 'Beginner', intermediate: 'Intermediate', expert: 'Expert' });
const count = (v, noun) => `${v.toLocaleString('en-US')} ${v === 1 ? noun : `${noun}s`}`;
const side = (v) => Number.isInteger(v) && v >= CUSTOM_LIMITS.minSide && v <= CUSTOM_LIMITS.maxSide;
const ints = (b) => !!b && Number.isInteger(b.width) && Number.isInteger(b.height) && Number.isInteger(b.mines);

export function boardLine({ width, height, mines }) {
  return `${width} × ${height} · ${count(mines, 'mine')}`;
}

export function sizeLabel(size) {
  return boardLine(STANDARD_SIZES[size]);
}

export function mineDensity({ width, height, mines }) {
  return `${((mines / (width * height)) * 100).toFixed(1)} % mines`;
}

export function customInfo(custom) {
  const { width, height } = custom ?? {};
  if (!side(width) || !side(height)) return '';
  const max = maxMines(width, height);
  return `${count(width * height, 'cell')} · ${max < 1 ? 'no room for a mine' : `up to ${count(max, 'mine')}`}`;
}

export function customStatus(custom) {
  const { width, height } = custom ?? {};
  const v = validateCustom(custom);
  const max = side(width) && side(height) ? maxMines(width, height) : null;
  if (!v.ok) return { ok: false, field: v.field, max, text: `${v.reason[0].toUpperCase()}${v.reason.slice(1)}` };
  return { ok: true, field: null, max, text: customInfo(custom) };
}

export function randomCustom(random = Math.random) {
  const randInt = (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)); // inclusive
  const height = randInt(1, 24);
  let width = randInt(1, 30);
  if (width * height < 2) width = 2; // a one-cell board has no room for a mine
  const cells = width * height;
  const mines = Math.min(maxMines(width, height), randInt(1, Math.max(1, Math.floor(cells / 5) - 1)));
  return { width, height, mines };
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

const NO_GUESS = ' · no-guess';

export function bestsTitle({ selected, custom, noGuess }) {
  const name = selected === 'custom' ? (ints(custom) ? boardLine(custom) : 'Custom') : NAMES[selected];
  return `${name}${noGuess ? NO_GUESS : ''} · your bests`;
}

export const PANEL_OPTIONS = Object.freeze(['custom', 'code', 'learn']);

export const panelOpen = (selected, pinned) => !!pinned || PANEL_OPTIONS.includes(selected);

export const panelLabel = (selected) => (selected === 'code' ? 'Board code' : selected === 'learn' ? 'Learn 3D' : 'Board settings');

export function bindChoicePanel({ root, pin = null }) {
  const $ = (sel) => root.querySelector(sel);
  const panel = $('[data-panel]');
  const rule = $('[data-panel-rule]');
  const toggle = $('[data-panel-toggle]');
  const bar = $('[data-drawer-bar]');
  const label = $('[data-drawer-label]');
  let selected = null;
  const draw = (value = selected) => {
    selected = value;
    const pinned = !!pin?.pinned;
    const open = panelOpen(selected, pinned);
    panel?.setAttribute('data-open', String(open));
    rule?.classList.toggle('hidden', !open);
    toggle?.setAttribute('aria-pressed', String(pinned));
    bar?.setAttribute('aria-expanded', String(open));
    if (label) label.textContent = panelLabel(selected);
  };
  const flip = () => {
    if (pin) Promise.resolve(pin.setPinned(!pin.pinned)).catch(() => {}); // a failed save keeps the pin for the session
    draw();
  };
  toggle?.addEventListener('click', flip);
  bar?.addEventListener('click', flip);
  return {
    draw,
    destroy() {
      toggle?.removeEventListener('click', flip);
      bar?.removeEventListener('click', flip);
    },
  };
}

/**
 * The code field's line for `r`, code.resolve's answer (null while empty): CODE_PROMPT as a muted
 * line, an accepted code's text in the success colour, a code of the other mode a warn note, a
 * refused one an err note with the field marked invalid. Both board choice screens draw it.
 */
export function showCodeLine(line, field, r) {
  const refused = !!r && !r.ok && !r.otherMode;
  const tone = !r || r.ok ? null : r.otherMode ? 'warn' : 'err';
  setNote(line, !r ? CODE_PROMPT : r.ok ? r.text ?? '' : r.reason, { tone, icon: tone === 'warn' ? 'info' : tone ? 'warning' : null });
  line.classList.toggle('ui-text', !tone);
  line.classList.toggle('ui-text--muted', !r);
  line.classList.toggle('ui-text--success', !!r?.ok);
  if (!field) return;
  field.classList.toggle('is-invalid', refused);
  if (refused) field.setAttribute('aria-invalid', 'true');
  else field.removeAttribute('aria-invalid');
}

export function bindBoardChoice({ root, onStart, onBack, onRecords = null, code = null, bests = null, pin = null }) {
  const options = [...root.querySelectorAll('[data-size]')];
  const option = (size) => options.find((b) => b.dataset.size === size);
  const form = root.querySelector('form');
  const inputs = ['width', 'height', 'mines'].map((name) => root.querySelector(`[data-field="${name}"]`));
  const $ = (sel) => root.querySelector(sel);
  const info = $('[data-info]');
  const refusal = $('[data-refusal]');
  const hint = $('[data-density-hint]');
  const noGuess = $('[data-noguess]');
  const settings = $('[data-settings]');
  const bestsBox = $('[data-bests]');
  const codePanel = $('[data-code-panel]');
  const codeInput = $('[data-code-field]');
  const codeInfo = $('[data-code-info]');
  const play = $('[data-play]');
  const records = $('[data-records]');
  const random = $('[data-random]');
  const back = $('[data-back]');
  const customMeta = $('[data-custom-meta]');
  const panel = bindChoicePanel({ root, pin });
  setNote(hint, DENSITY_HINT_TEXT);
  let selected = 'beginner';
  let last = null;

  const fields = () => ({ width: inputs[0].value, height: inputs[1].value, mines: inputs[2].value });
  const custom = () => ({ width: int(inputs[0].value), height: int(inputs[1].value), mines: int(inputs[2].value) });
  const codeText = () => String(codeInput?.value ?? '').trim();
  const codeResult = () => (code && codeText() ? code.resolve(codeText()) : null);
  /** The chosen board's choice: a preset, a valid custom board, or null (a code, a refused custom board). */
  const chosen = () => (selected === 'code' ? null : readChoice({ size: selected, fields: fields(), noGuess: noGuess.checked }, last?.custom));

  const drawBests = () => {
    if (!bestsBox) return;
    $('[data-bests-title]').textContent = bestsTitle({ selected, custom: custom(), noGuess: noGuess.checked });
    const choice = chosen();
    const tiles = choice && bests ? bests(boardSetup(choice).identity) : [];
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
    info.textContent = customInfo(c);
    info.classList.toggle('hidden', !info.textContent);
    setNote(refusal, s.ok ? '' : s.text);
    refusal.classList.toggle('hidden', s.ok);
    if (s.max !== null) inputs[2].max = String(Math.max(1, s.max));
    for (const [i, name] of ['width', 'height', 'mines'].entries()) {
      inputs[i].classList.toggle('is-invalid', s.field === name);
      if (s.field === name) inputs[i].setAttribute('aria-invalid', 'true');
      else inputs[i].removeAttribute('aria-invalid');
    }
    hint.classList.toggle('hidden', !(isCustom && densityHintShown(c, noGuess.checked)));
    if (customMeta) {
      customMeta.textContent = isCustom && ints(c) ? (s.ok ? `${boardLine(c)} · ${mineDensity(c)}` : boardLine(c)) : CUSTOM_HINT;
    }
    const r = isCode ? codeResult() : null;
    if (codeInfo) showCodeLine(codeInfo, codeInput, r);
    settings.classList.toggle('hidden', isCode);
    form.classList.toggle('hidden', !isCustom);
    bestsBox?.classList.toggle('hidden', isCode);
    codePanel?.classList.toggle('hidden', !isCode);
    for (const b of options) b.setAttribute('aria-pressed', String(b.dataset.size === selected));
    panel.draw(selected);
    play.disabled = isCode ? !r?.ok : isCustom && !s.ok;
    drawBests();
    return s;
  };

  const choose = (size) => {
    if (!option(size)) return;
    selected = size;
    update();
  };
  const start = () => {
    if (selected === 'code') {
      const r = codeResult();
      if (r?.ok) code.onPlay(codeText());
      return;
    }
    const s = update();
    if (selected === 'custom' && !s.ok) {
      root.querySelector(`[data-field="${s.field}"]`)?.focus();
      return;
    }
    const choice = chosen();
    if (choice) onStart(choice);
  };

  const onOption = (event) => choose(event.currentTarget.dataset.size);
  const onKey = (event) => {
    if (event.key !== 'Enter' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    const opt = target?.closest?.('[data-size]');
    if (!opt && target?.closest?.('button')) return; // another button activates itself
    event.preventDefault();
    if (opt) choose(opt.dataset.size);
    start();
  };
  const onSubmit = (event) => event.preventDefault();
  const onRandom = () => {
    const b = randomCustom();
    inputs[0].value = String(b.width);
    inputs[1].value = String(b.height);
    inputs[2].value = String(b.mines);
    update();
  };
  const onRecordsClick = () => {
    const choice = chosen();
    onRecords?.(choice ? boardSetup(choice).identity : null);
  };
  const onBackClick = () => onBack?.();

  for (const b of options) b.addEventListener('click', onOption);
  for (const inp of inputs) inp.addEventListener('input', update);
  noGuess.addEventListener('change', update);
  codeInput?.addEventListener('input', update);
  form.addEventListener('submit', onSubmit);
  root.addEventListener('keydown', onKey);
  random?.addEventListener('click', onRandom);
  records?.addEventListener('click', onRecordsClick);
  play.addEventListener('click', start);
  back?.addEventListener('click', onBackClick);

  return {
    show(choice, { held = null } = {}) {
      last = choice;
      const f = held?.fields ?? { width: choice.custom.width, height: choice.custom.height, mines: choice.custom.mines };
      inputs[0].value = String(f.width);
      inputs[1].value = String(f.height);
      inputs[2].value = String(f.mines);
      noGuess.checked = held ? !!held.noGuess : !!choice.noGuess;
      if (codeInput) codeInput.value = held?.code ?? '';
      for (const b of options) b.toggleAttribute('data-last', b.dataset.size === choice.size);
      selected = option(held?.selected) ? held.selected : choice.size;
      update();
    },
    state() {
      return { selected, fields: fields(), noGuess: noGuess.checked, code: codeInput?.value ?? '' };
    },
    refresh() { drawBests(); },
    destroy() {
      for (const b of options) b.removeEventListener('click', onOption);
      for (const inp of inputs) inp.removeEventListener('input', update);
      noGuess.removeEventListener('change', update);
      codeInput?.removeEventListener('input', update);
      form.removeEventListener('submit', onSubmit);
      root.removeEventListener('keydown', onKey);
      random?.removeEventListener('click', onRandom);
      records?.removeEventListener('click', onRecordsClick);
      play.removeEventListener('click', start);
      back?.removeEventListener('click', onBackClick);
      panel.destroy();
    },
  };
}
