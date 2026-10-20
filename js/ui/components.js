// Behaviour helpers for the component kit (css/components.css): the slider's
// value display and fill, the segmented choice's and the tabs' selection, the one selected control
// under a moving mouse, the key hints, the figures panel's live part, the pager, the icon set with
// the button's and the note's leading icon, the note's text, and the code chip. The logic is plain
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

/**
 * The share of a range input's range from its minimum to `value`, 0 to 1 (four decimals), clamped;
 * an absent min or max is the native range's 0 or 100, and an empty range is unfilled.
 */
export function sliderFill(value, min, max) {
  const lo = min === null || min === undefined || min === '' ? 0 : Number(min);
  const hi = max === null || max === undefined || max === '' ? 100 : Number(max);
  const v = Number(value);
  if (!(hi > lo) || !Number.isFinite(v)) return 0;
  return Math.round(Math.min(1, Math.max(0, (v - lo) / (hi - lo))) * 10000) / 10000;
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

/**
 * Mine counter text: the real mines left in at least three digits ('024'), a negative count's minus
 * in the first digit ('-05'), kept at '-99' at the low end. Display only, as formatOverlayTime.
 */
export function formatMineCount(minesLeft) {
  const n = Math.max(-99, Math.trunc(minesLeft) || 0);
  return n < 0 ? `-${String(-n).padStart(2, '0')}` : String(n).padStart(3, '0');
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

/**
 * Keeps a `.ui-slider__input`'s fill in step with its value: sets `--slider-fill` (sliderFill) on the
 * input, which the theme draws the track's fill from, on every input event and on every value a
 * script sets. Returns unbind.
 */
export function bindSliderFill(input) {
  const update = () => {
    input.style.setProperty('--slider-fill', String(sliderFill(input.value, input.getAttribute('min'), input.getAttribute('max'))));
  };
  // A script's `input.value = …` fires no event: the input's own value property hands it on.
  let owner = input;
  let desc;
  while (owner && !(desc = Object.getOwnPropertyDescriptor(owner, 'value'))) owner = Object.getPrototypeOf(owner);
  let held = input.value;
  const get = desc?.get ? () => desc.get.call(input) : () => held;
  const set = desc?.set ? (v) => desc.set.call(input, v) : (v) => { held = v; };
  Object.defineProperty(input, 'value', { configurable: true, enumerable: true, get, set(v) { set(v); update(); } });
  input.addEventListener('input', update);
  update();
  return () => {
    input.removeEventListener('input', update);
    if (desc?.get) delete input.value;
    else Object.defineProperty(input, 'value', { configurable: true, enumerable: true, writable: true, value: held });
  };
}

/** Keeps `.ui-slider__value` showing the formatted value of `.ui-slider__input`, and its fill. Returns unbind. */
export function bindSlider(root) {
  const input = root.querySelector('.ui-slider__input');
  const output = root.querySelector('.ui-slider__value');
  if (!input || !output) return () => {};
  const unfill = bindSliderFill(input);
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
  return () => { input.removeEventListener('input', show); unfill(); };
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
 * A figures panel's figures (.ui-figure[data-figure="<name>"], js/shell/live-figures.js FIGURES):
 * show(figures, names?) writes the named figures — every one the panel holds when not given — from
 * liveFigures' { text, detail, progress } per figure. A null figure (pace with no best or no 3BV
 * solved yet) hides, a null detail hides its line, and a progress bar's fill takes the share solved;
 * each part is written only when its text changes.
 */
export function bindFigures(panel) {
  const parts = [...panel.querySelectorAll('.ui-figure[data-figure]')].map((root) => ({
    name: root.dataset.figure, root, shown: {},
    value: root.querySelector('.ui-figure__value'), detail: root.querySelector('.ui-figure__detail'),
    bar: root.querySelector('.ui-figure__bar'), fill: root.querySelector('.ui-figure__fill'),
  }));
  const write = (p, key, value, apply) => { if (p.shown[key] !== value) { p.shown[key] = value; apply(value); } };
  return {
    show(figures, names = null) {
      for (const p of parts) {
        if (names && !names.includes(p.name)) continue;
        const f = figures[p.name] ?? null;
        write(p, 'hidden', !f, (hidden) => p.root.classList.toggle('hidden', hidden));
        if (!f) continue;
        write(p, 'text', f.text, (text) => { p.value.textContent = text; });
        if (p.detail) {
          write(p, 'detail', f.detail ?? '', (detail) => { p.detail.textContent = detail; p.detail.classList.toggle('hidden', !detail); });
        }
        if (p.fill && typeof f.progress === 'number') {
          write(p, 'progress', Math.round(Math.min(1, Math.max(0, f.progress)) * 100), (pct) => {
            p.fill.style.width = `${pct}%`;
            p.bar?.setAttribute('aria-valuenow', String(pct));
          });
        }
      }
    },
  };
}

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

// ---------------------------------------------------------------- the icon set

const icon = (stroke, ...shapes) => Object.freeze({
  stroke,
  shapes: Object.freeze(shapes.map(([tag, attrs]) => Object.freeze([tag, Object.freeze(attrs)]))),
});
const p = (d) => ['path', { d }];

/**
 * The kit's one icon source: the canvas's stroke icons on a 24 px grid, path for path, by name —
 * { stroke (the stroke width), shapes: [[tag, attrs], …] }. Every icon draws in currentColor.
 */
export const ICONS = Object.freeze({
  'arrow-left': icon(2.3, p('M19 12H5M11 6l-6 6 6 6')),
  play: icon(2.3, p('M7 4l12 8-12 8z')),
  pause: icon(2.3, ['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }], ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }]),
  restart: icon(2.3, p('M3 12a9 9 0 1 0 3-6.7'), p('M3 4v5h5')),
  refresh: icon(2.3, p('M21 12a9 9 0 1 1-3-6.7'), p('M21 4v5h-5')),
  'skip-back': icon(2.3, p('M6 5v14M19 5l-10 7 10 7z')),
  'skip-forward': icon(2.3, p('M18 5v14M5 5l10 7-10 7z')),
  copy: icon(2.3, ['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }], p('M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3')),
  link: icon(2.3, p('M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1'), p('M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1')),
  chart: icon(2.3, p('M3 3v18h18'), p('M7 15l4-5 3 3 5-7')),
  shuffle: icon(2.3, p('M3 6h4l10 12h4M3 18h4l3-3.6M14 9.6L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3')),
  grid: icon(2.3, ['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }], p('M9 3v18M15 3v18M3 9h18M3 15h18')),
  cube: icon(2.3, p('M12 2l9 5v10l-9 5-9-5V7z'), p('M12 12l9-5M12 12v10M12 12L3 7')),
  film: icon(2.3, ['rect', { x: '3', y: '4', width: '18', height: '16', rx: '2' }], p('M3 9h18M3 15h18M8 4v16M16 4v16')),
  trophy: icon(2.3, p('M8 21h8M12 17v4M7 4h10v4a5 5 0 0 1-10 0z'), p('M7 6H4a2 2 0 0 0 0 4h3M17 6h3a2 2 0 0 1 0 4h-3')),
  eye: icon(2.3, p('M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z'), ['circle', { cx: '12', cy: '12', r: '3' }]),
  swap: icon(2.3, p('M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7')),
  speaker: icon(2.3, p('M4 9h4l5-4v14l-5-4H4z'), p('M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12')),
  camera: icon(2.3, p('M4 8h3l2-3h6l2 3h3v11H4z'), ['circle', { cx: '12', cy: '13', r: '3.5' }]),
  download: icon(2.3, p('M12 3v12M7 10l5 5 5-5M4 21h16')),
  upload: icon(2.3, p('M4 20h16M12 16V4M7 9l5-5 5 5')),
  trash: icon(2.3, p('M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3')),
  pin: icon(2.3, p('M9 3h6l-1 6 4 4H6l4-4z'), p('M12 13v8')),
  mouse: icon(2.3, ['rect', { x: '6', y: '3', width: '12', height: '18', rx: '6' }], p('M12 7v4')),
  hand: icon(2.3, p('M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 16a1.6 1.6 0 0 1 2.4-2.1L8 16')),
  check: icon(3, p('M5 12l5 5 9-10')),
  close: icon(2.6, p('M6 6l12 12M18 6L6 18')),
  info: icon(2.3, ['circle', { cx: '12', cy: '12', r: '9' }], p('M12 11v6M12 7.5v.5')),
  warning: icon(2.3, p('M12 3l10 18H2z'), p('M12 10v5M12 18v.5')),
});

const SVG_NS = 'http://www.w3.org/2000/svg';

function iconOf(name) {
  const found = Object.hasOwn(ICONS, name) ? ICONS[name] : null;
  if (!found) throw new Error(`no icon named ${name}`);
  return found;
}

// The svg element's attributes: the slot's class, hidden from assistive technology, the button's ink.
const iconAttrs = (name, { stroke }) => [
  ['class', 'ui-icon'], ['data-icon', name], ['aria-hidden', 'true'], ['focusable', 'false'], ['viewBox', '0 0 24 24'],
  ['fill', 'none'], ['stroke', 'currentColor'], ['stroke-width', String(stroke)], ['stroke-linecap', 'round'], ['stroke-linejoin', 'round'],
];

/** The icon `name` as svg markup. */
export function iconMarkup(name) {
  const found = iconOf(name);
  const attrs = (list) => list.map(([k, v]) => ` ${k}="${v}"`).join('');
  return `<svg${attrs(iconAttrs(name, found))}>${found.shapes.map(([tag, a]) => `<${tag}${attrs(Object.entries(a))}/>`).join('')}</svg>`;
}

/** The icon `name` as an svg element of `doc`. */
export function createIcon(doc, name) {
  const found = iconOf(name);
  const svg = doc.createElementNS(SVG_NS, 'svg');
  for (const [k, v] of iconAttrs(name, found)) svg.setAttribute(k, v);
  for (const [tag, attrs] of found.shapes) {
    const shape = doc.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) shape.setAttribute(k, v);
    svg.append(shape);
  }
  return svg;
}

/**
 * The leading-icon slot: puts the icon `name` before `button`'s label — or a note's text — replacing
 * the icon it led with, or removes it (name null). The label stays the button's name. Returns the
 * icon or null.
 */
export function setButtonIcon(button, name) {
  for (const old of button.querySelectorAll(':scope > .ui-icon')) old.remove();
  if (name === null || name === undefined) return null;
  const svg = createIcon(button.ownerDocument, name);
  button.prepend(svg);
  return svg;
}

/** Fills every `.ui-button[data-icon]` and `.ui-note[data-icon]` under `root` that has no icon yet with its leading icon. */
export function applyIcons(root) {
  for (const button of root.querySelectorAll('.ui-button[data-icon], .ui-note[data-icon]')) {
    if (button.querySelector(':scope > .ui-icon')) continue;
    setButtonIcon(button, button.getAttribute('data-icon'));
  }
}

/** The note tones: ui-note--warn (a refusal, a hint) and ui-note--err (a refused code, a failure). */
export const NOTE_TONES = Object.freeze(['warn', 'err']);

/**
 * A note's text: setNote(el, text, { tone?, icon? }) writes `text` into el's .ui-note__text, after its
 * leading icon (made on first use, in place of any plain text el held). `tone` ('warn' | 'err' |
 * null) makes el that note, or a plain line again with null; `icon` (a name or null) sets its leading
 * icon and data-icon. Either left out keeps what el has.
 */
export function setNote(el, text, { tone, icon } = {}) {
  let span = el.querySelector(':scope > .ui-note__text');
  if (!span) {
    span = el.ownerDocument.createElement('span');
    span.className = 'ui-note__text';
    el.textContent = '';
    for (const old of el.querySelectorAll(':scope > .ui-icon')) old.remove();
    el.append(span);
    if (icon === undefined && el.getAttribute('data-icon')) setButtonIcon(el, el.getAttribute('data-icon'));
  }
  span.textContent = text;
  if (tone !== undefined) {
    el.classList.toggle('ui-note', !!tone);
    for (const t of NOTE_TONES) el.classList.toggle(`ui-note--${t}`, tone === t);
  }
  if (icon !== undefined) {
    if (icon) el.setAttribute('data-icon', icon);
    else el.removeAttribute('data-icon');
    setButtonIcon(el, icon);
  }
  return el;
}

/**
 * A kit button: createButton(doc, { label, icon?, variant ('primary' | 'secondary' (default) |
 * 'quiet' | 'danger'), size ('sm' | 'lg'; none is md), iconOnly? }). The icon leads the label; an
 * icon-only button shows no text and is named by aria-label.
 */
export function createButton(doc, { label, icon: name = null, variant = 'secondary', size = null, iconOnly = false }) {
  if (iconOnly && !label) throw new Error('an icon-only button needs a label for its name');
  const b = doc.createElement('button');
  b.type = 'button';
  b.className = `ui-button ui-button--${variant}${size ? ` ui-button--${size}` : ''}`;
  if (iconOnly) b.setAttribute('aria-label', label);
  else b.append(label);
  if (name) setButtonIcon(b, name);
  return b;
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
