// Behaviour helpers for the component kit (css/components.css): the slider's
// value display, the segmented choice's and the tabs' selection, the one selected control
// under a moving mouse, the key hints, the figures panel's live part, the pager, the code chip and the board code field. The logic is plain
// functions; the binders touch only the elements they are handed, so the
// module needs no document and runs under Node with stub elements.

// ---------------------------------------------------------------- logic

/** Number of decimals a range input's `step` implies ('0.05' → 2). */
export function decimalsOf(step) {
  const n = Number(step);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const [mantissa, exp] = String(step).toLowerCase().split('e');
  const frac = (mantissa.split('.')[1] ?? '').length;
  return Math.max(0, frac - Number(exp ?? 0));
}

/**
 * Text shown beside a slider for `value`.
 * format: 'number' (default) | 'percent' | 'multiplier'; unit: suffix text.
 * 'percent' reads a 0..1 range when max is 1 or less, else a 0..100 range.
 */
export function formatSliderValue(value, { format = 'number', step, max, unit = '' } = {}) {
  const v = Number(value);
  if (value === '' || !Number.isFinite(v)) return '';
  if (format === 'percent') {
    const pct = max !== undefined && Number(max) <= 1 ? v * 100 : v;
    return `${Math.round(pct)}%${unit}`;
  }
  const text = v.toFixed(decimalsOf(step));
  return format === 'multiplier' ? `${text}×${unit}` : `${text}${unit}`;
}

const STEP = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
const VERTICAL = new Set(['ArrowDown', 'ArrowUp']);

/**
 * Index a key moves a segmented choice to, skipping disabled options and
 * wrapping at the ends; null when the key is not a navigation key or no
 * other option can take the selection. A horizontal choice takes Left and
 * Right only, leaving Up and Down to the shell's focus moves.
 */
export function segmentedTargetIndex(disabled, current, key, { horizontal = false } = {}) {
  const n = disabled.length;
  const enabled = (i) => !disabled[i];
  if (key === 'Home' || key === 'End') {
    const order = [...Array(n).keys()];
    if (key === 'End') order.reverse();
    const i = order.find(enabled);
    return i === undefined ? null : i;
  }
  if (horizontal && VERTICAL.has(key)) return null;
  const d = STEP[key];
  if (!d) return null;
  for (let k = 1; k < n; k++) {
    const i = (((current + d * k) % n) + n) % n;
    if (enabled(i)) return i;
  }
  return null;
}

/** aria-checked and tab order for each option when `selected` is chosen. */
export function segmentedState(count, selected) {
  const tabbable = selected >= 0 && selected < count ? selected : 0;
  return Array.from({ length: count }, (_, i) => ({ checked: i === selected, tabIndex: i === tabbable ? 0 : -1 }));
}

/**
 * Overlay bar timer text: whole elapsed seconds, zero-padded to three digits
 * ('047'), stopping at '999'. Display only — the caller keeps the real time.
 */
export function formatOverlayTime(seconds) {
  const s = Number.isNaN(seconds) ? 0 : Math.min(999, Math.max(0, Math.floor(seconds)));
  return String(s).padStart(3, '0');
}

/** Overlay bar mine counter text: the real mines left, kept at -99 at the low end. */
export function formatMineCount(minesLeft) {
  return String(Math.max(-99, Math.trunc(minesLeft)));
}

/** Width of the mine counter, in digits, for a board of `mines` mines: its count's digits, at least three. */
export function mineCounterDigits(mines) {
  return Math.max(3, String(Math.max(0, Math.trunc(mines))).length);
}

/** The most numbered page buttons a pager shows at once, around the current page. */
export const PAGER_WINDOW = 5;

/**
 * A pager's buttons for page `page` (0-based, clamped) of `pages`: First, a run of at most
 * PAGER_WINDOW numbered pages around the current one, and Last. Hidden when one page holds
 * everything (or there is nothing). → { hidden, page, pages, first: { page, disabled },
 * last: { page, disabled }, numbers: [{ page, label, current }] }
 */
export function pagerState(page, pages) {
  const count = Math.max(1, Number.isInteger(pages) ? pages : 1);
  const p = Number.isInteger(page) ? Math.min(Math.max(page, 0), count - 1) : 0;
  const start = Math.min(Math.max(p - Math.floor(PAGER_WINDOW / 2), 0), Math.max(0, count - PAGER_WINDOW));
  const end = Math.min(count, start + PAGER_WINDOW);
  const numbers = [];
  for (let n = start; n < end; n++) numbers.push({ page: n, label: String(n + 1), current: n === p });
  return {
    hidden: count <= 1, page: p, pages: count,
    first: { page: 0, disabled: p === 0 },
    last: { page: count - 1, disabled: p === count - 1 },
    numbers,
  };
}

// ---------------------------------------------------------------- DOM binding

// CustomEvent exists in browsers and in Node 19+; the fallback keeps the
// event's shape where it does not.
const CustomEventShim = globalThis.CustomEvent ?? class {
  constructor(type, init = {}) { Object.assign(this, { type, bubbles: !!init.bubbles, detail: init.detail }); }
};

/** Keeps `.ui-slider__value` showing the formatted value of `.ui-slider__input`. Returns unbind. */
export function bindSlider(root) {
  const input = root.querySelector('.ui-slider__input');
  const output = root.querySelector('.ui-slider__value');
  if (!input || !output) return () => {};
  const show = () => {
    output.textContent = formatSliderValue(input.value, {
      format: input.getAttribute('data-format') ?? undefined,
      unit: input.getAttribute('data-unit') ?? undefined,
      step: input.getAttribute('step') ?? undefined,
      max: input.getAttribute('max') ?? undefined,
    });
  };
  show();
  input.addEventListener('input', show);
  return () => input.removeEventListener('input', show);
}

/**
 * Single selection over a `.ui-segmented` radiogroup of
 * `.ui-segmented__option` buttons: click or arrow keys select, disabled
 * options are skipped, and a change dispatches `change` on the group and
 * calls onChange(value, index); `horizontal` leaves Up and Down unhandled.
 * Returns unbind.
 */
export function bindSegmented(group, { onChange, horizontal = false } = {}) {
  return bindChoice(group, { item: '.ui-segmented__option', attr: 'aria-checked', onChange, horizontal });
}

/**
 * Single selection over a `.ui-tabs` tablist of `.ui-tabs__tab` buttons, as bindSegmented with
 * `horizontal` does it: click or Left / Right select (aria-selected), disabled tabs are skipped, the
 * selected tab alone is in the tab order, and a change dispatches `change` on the list and calls
 * onChange(value, index). Returns unbind.
 */
export function bindTabs(list, { onChange } = {}) {
  return bindChoice(list, { item: '.ui-tabs__tab', attr: 'aria-selected', onChange, horizontal: true });
}

function bindChoice(group, { item, attr, onChange, horizontal }) {
  const options = [...group.querySelectorAll(item)];
  // The selection is read from the markup (`attr`); it changes through
  // click and arrow keys here, which also keep the roving tab order in step.
  const current = () => options.findIndex((o) => o.getAttribute(attr) === 'true');

  const render = (selected) => {
    segmentedState(options.length, selected).forEach((s, i) => {
      options[i].setAttribute(attr, String(s.checked));
      options[i].tabIndex = s.tabIndex;
    });
  };
  const select = (i, focus) => {
    if (i === null || i === current() || options[i].disabled) return;
    render(i);
    if (focus) options[i].focus();
    const value = options[i].getAttribute('data-value');
    group.dispatchEvent(new CustomEventShim('change', { bubbles: true, detail: { value, index: i } }));
    onChange?.(value, i);
  };

  const handlers = options.map((o, i) => {
    const click = () => select(i, false);
    const keydown = (e) => {
      const target = segmentedTargetIndex(options.map((x) => x.disabled), i, e.key, { horizontal });
      if (target === null) return;
      e.preventDefault();
      select(target, true);
    };
    o.addEventListener('click', click);
    o.addEventListener('keydown', keydown);
    return { o, click, keydown };
  });
  render(current());
  return () => {
    for (const { o, click, keydown } of handlers) {
      o.removeEventListener('click', click);
      o.removeEventListener('keydown', keydown);
    }
  };
}

/**
 * Fills a `.ui-pager` nav with the buttons of pagerState(page, pages) — First, the numbered pages,
 * Last, each a secondary kit button carrying data-page (a number, or `first` / `last`) — and calls
 * onPage(page) on a click. The current page is aria-current="page" and aria-disabled, so it stays
 * focusable; First and Last are disabled on the first and last page; the nav is hidden on one page.
 * A focused button that becomes disabled, or goes, hands focus to the current page's button.
 * `name` ("games") goes into each button's accessible name. → { show(state) }
 */
export function bindPager(nav, { onPage, name = '' } = {}) {
  const doc = nav.ownerDocument;
  const of = name ? ` of ${name}` : '';
  const button = (key, text, label, page, { disabled = false, current = false } = {}) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'ui-button ui-button--secondary ui-pager__button';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    b.dataset.page = key;
    if (disabled) b.disabled = true;
    if (current) {
      b.setAttribute('aria-current', 'page');
      b.setAttribute('aria-disabled', 'true');
    }
    b.addEventListener('click', () => { if (!b.disabled && !current) onPage(page); });
    return b;
  };
  return {
    show(state) {
      const focused = nav.contains(doc.activeElement) ? doc.activeElement.dataset.page : null;
      nav.classList.toggle('hidden', state.hidden);
      nav.replaceChildren(
        button('first', 'First', `First page${of}`, state.first.page, { disabled: state.first.disabled }),
        ...state.numbers.map((n) => button(String(n.page), n.label, `Page ${n.label}${of}`, n.page, { current: n.current })),
        button('last', 'Last', `Last page${of}`, state.last.page, { disabled: state.last.disabled }),
      );
      if (focused === null || state.hidden) return;
      const again = [...nav.children].find((b) => b.dataset.page === focused && !b.disabled);
      (again ?? nav.querySelector('[aria-current="page"]'))?.focus({ preventScroll: true });
    },
  };
}

// ---------------------------------------------------------------- one selected control

/** The controls whose hover and focus are one selected state: buttons, menu entries, mode entries and board options. */
export const SELECT_ON_HOVER = '.ui-button, .ui-menu__item, .ui-mode-entry, .ui-option';

/**
 * Moving the mouse over an enabled button, menu entry, mode entry or board option focuses it (without
 * scrolling), and over a disabled mode entry too (aria-disabled: it stays selectable and opens nothing),
 * so the selected control is always the focused one; a control that never takes focus (data-no-focus:
 * the in-game toggles that leave the keys to the board) is left alone. One delegated listener on `root` (the document)
 * serves every such control, present and future. A mousemove that did not move the pointer (one a
 * browser sends when the page moves under a resting pointer) selects nothing, so after a key or
 * controller press moved the focus the control under the resting pointer stays unselected until the
 * mouse moves again. Returns the unbind.
 */
export function bindSelectOnHover(root) {
  let last = null;
  const onMove = (e) => {
    const at = `${e.clientX},${e.clientY}`;
    if (at === last) return;
    last = at;
    const el = e.target?.closest?.(SELECT_ON_HOVER);
    if (!el || el.disabled || el.hasAttribute('data-no-focus')) return;
    if (el.getAttribute('aria-disabled') === 'true' && !el.matches?.('.ui-mode-entry')) return;
    if (el.ownerDocument?.activeElement === el) return;
    el.focus({ preventScroll: true });
  };
  root.addEventListener('mousemove', onMove, true);
  return () => root.removeEventListener('mousemove', onMove, true);
}

/** Binds every slider, segmented choice and tablist under `root`. Returns unbind-all. */
export function initComponents(root) {
  const unbinds = [
    ...[...root.querySelectorAll('.ui-slider')].map((el) => bindSlider(el)),
    ...[...root.querySelectorAll('.ui-segmented')].map((el) => bindSegmented(el)),
    ...[...root.querySelectorAll('.ui-tabs')].map((el) => bindTabs(el)),
  ];
  return () => { for (const u of unbinds) u(); };
}

// ---------------------------------------------------------------- key hints

/**
 * Fills every `.ui-key-hint[data-action]` under `root` with the keys keysFor(action) gives — a list
 * of { text, pad }, the bindings source's keyHintKeys for the active device — as its
 * `.ui-key-hint__key` kbd elements, ahead of its label; a hint of controller buttons takes
 * `ui-key-hint--pad`, and a hint with no keys (touch) is hidden. Call it again on every change of the
 * active device.
 */
export function showKeyHints(root, keysFor) {
  for (const hint of root.querySelectorAll('.ui-key-hint[data-action]')) {
    const keys = keysFor(hint.getAttribute('data-action'));
    for (const old of hint.querySelectorAll('.ui-key-hint__key')) old.remove();
    const label = hint.querySelector('.ui-key-hint__label');
    for (const { text } of keys) {
      const kbd = hint.ownerDocument.createElement('kbd');
      kbd.className = 'ui-key-hint__key';
      kbd.textContent = text;
      hint.insertBefore(kbd, label);
    }
    hint.classList.toggle('ui-key-hint--pad', keys.length > 0 && keys.every((k) => k.pad));
    hint.classList.toggle('hidden', keys.length === 0);
  }
}

// ---------------------------------------------------------------- the figures panel

/** The shortest time between two writes of a figures panel's live part, in ms. */
export const LIVE_FIGURES_INTERVAL = 1000;

/**
 * The figures panel's live part (`.ui-figures__live`, a polite live region): announce(text) writes
 * it at once when the last write is a full interval old, else holds the text until then, a later
 * text replacing a held one; a text already written is not written again. stop() drops a held text.
 */
export function bindFiguresLive(panel, { interval = LIVE_FIGURES_INTERVAL } = {}) {
  const live = panel.querySelector('.ui-figures__live');
  let last = -Infinity;
  let held = null;
  let timer = null;
  const write = (text) => {
    if (text === live.textContent) return;
    live.textContent = text;
    last = Date.now();
  };
  const flush = () => {
    timer = null;
    const text = held;
    held = null;
    write(text);
  };
  return {
    announce(text) {
      if (timer !== null) { held = text; return; }
      if (text === live.textContent) return;
      const wait = last + interval - Date.now();
      if (wait <= 0) { write(text); return; }
      held = text;
      timer = setTimeout(flush, wait);
    },
    stop() {
      clearTimeout(timer);
      timer = null;
      held = null;
    },
  };
}

// ---------------------------------------------------------------- the code chip

/** The challenge link of a board code (js/records/board-code.js): <origin><path>#board=<code>. */
export function boardLink(code, { origin = '', pathname = '/' } = {}) {
  return `${origin}${pathname}#board=${code}`;
}

/** The toast when the clipboard refuses: the code text is selected instead. */
export const COPY_FALLBACK = 'Press Ctrl+C to copy';
/** The toasts of a copy that worked, by kind. */
export const COPIED = Object.freeze({ code: 'Board code copied', link: 'Challenge link copied' });

/**
 * Copy (kind 'code') writes the code, Copy link (kind 'link') its challenge link (boardLink at
 * `location`), through `clipboard` (navigator.clipboard). A refused or missing clipboard calls
 * select() — the chip selects its code text — and toasts COPY_FALLBACK. Promise of whether it copied.
 */
export async function copyBoardCode({ kind, code, clipboard, location, select = () => {}, toast = () => {} }) {
  const text = kind === 'link' ? boardLink(code, location) : code;
  try {
    if (typeof clipboard?.writeText !== 'function') throw new Error('no clipboard');
    await clipboard.writeText(text);
    toast(COPIED[kind] ?? COPIED.code);
    return true;
  } catch {
    select();
    toast(COPY_FALLBACK);
    return false;
  }
}

/**
 * A code chip (`.ui-code`): the board code with Copy and Copy link. createCodeChip(doc, { label?,
 * compact? }) builds one — label the visible label ('Board code'; none on a compact chip, the table
 * row's) — and bindCodeChip(root, { onCopy }) binds one in the markup or built: show(code) fills
 * it, null hides it; each button calls onCopy({ kind, code, select }), select() selecting the code
 * text for a refused clipboard (copyBoardCode). Both buttons are native buttons, named for what
 * they copy.
 */
export function createCodeChip(doc, { label = 'Board code', compact = false } = {}) {
  const root = doc.createElement('div');
  root.className = compact ? 'ui-code ui-code--compact' : 'ui-code';
  if (label && !compact) {
    const l = doc.createElement('span');
    l.className = 'ui-code__label';
    l.textContent = label;
    root.append(l);
  }
  const value = doc.createElement('code');
  value.className = 'ui-code__value';
  root.append(value);
  for (const [kind, text] of [['code', 'Copy'], ['link', 'Copy link']]) {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'ui-button ui-button--secondary';
    b.dataset.copy = kind;
    b.textContent = text;
    root.append(b);
  }
  return root;
}

export function bindCodeChip(root, { onCopy = () => {} } = {}) {
  const value = root.querySelector('.ui-code__value');
  const buttons = [...(root.querySelectorAll?.('[data-copy]') ?? [])];
  let code = null;
  const select = () => {
    const doc = root.ownerDocument;
    const selection = doc?.getSelection?.();
    if (!selection) return;
    selection.removeAllRanges?.();
    selection.selectAllChildren?.(value);
  };
  for (const b of buttons) {
    b.addEventListener('click', () => { if (code) onCopy({ kind: b.dataset.copy, code, select }); });
  }
  return {
    get code() { return code; },
    show(next) {
      code = typeof next === 'string' && next ? next : null;
      value.textContent = code ?? '';
      for (const b of buttons) {
        b.setAttribute('aria-label', b.dataset.copy === 'link' ? `Copy the challenge link of board ${code ?? ''}` : `Copy the board code ${code ?? ''}`);
      }
      root.classList.toggle('hidden', code === null);
    },
  };
}

/**
 * A board code field (a ui-field text input, a "Play this board" button and an info line), validated
 * live as the custom forms are: bindCodeField({ input, button, info, resolve, onPlay, prompt? }) →
 * { refresh(), clear() }. resolve(text) → { ok, reason?, text? } for the trimmed text: nothing typed
 * shows `prompt` and disables the button; a refused code shows its reason as a warning and disables
 * it; an accepted one shows its `text` and enables it. The button, or Enter in the field, calls
 * onPlay(text) for an accepted code.
 */
export function bindCodeField({ input, button, info, resolve, onPlay, prompt = '' }) {
  let accepted = false;
  const refresh = () => {
    const text = String(input.value ?? '').trim();
    const r = text ? resolve(text) : null;
    accepted = !!r?.ok;
    button.disabled = !accepted;
    const line = !r ? prompt : r.ok ? r.text ?? '' : r.reason;
    info.textContent = line;
    info.classList.toggle('ui-text--warning', !!r && !r.ok);
    info.classList.toggle('ui-text--muted', !r || r.ok);
  };
  const play = () => {
    refresh();
    if (accepted) onPlay(String(input.value).trim());
  };
  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    play();
  });
  button.addEventListener('click', play);
  refresh();
  return {
    refresh,
    clear() { input.value = ''; refresh(); },
  };
}
