// Behaviour helpers for the component kit (css/components.css): the slider's
// value display and the segmented choice's selection. The logic is plain
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

/**
 * Index a key moves a segmented choice to, skipping disabled options and
 * wrapping at the ends; null when the key is not a navigation key or no
 * other option can take the selection.
 */
export function segmentedTargetIndex(disabled, current, key) {
  const n = disabled.length;
  const enabled = (i) => !disabled[i];
  if (key === 'Home' || key === 'End') {
    const order = [...Array(n).keys()];
    if (key === 'End') order.reverse();
    const i = order.find(enabled);
    return i === undefined ? null : i;
  }
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

/** Overlay bar mine counter text: mines left clamped to -99 … 999. */
export function formatMineCount(minesLeft) {
  return String(Math.min(999, Math.max(-99, Math.trunc(minesLeft))));
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
 * calls onChange(value, index). Returns unbind.
 */
export function bindSegmented(group, { onChange } = {}) {
  const options = [...group.querySelectorAll('.ui-segmented__option')];
  // The selection is read from the markup (aria-checked); it changes through
  // click and arrow keys here, which also keep the roving tab order in step.
  const current = () => options.findIndex((o) => o.getAttribute('aria-checked') === 'true');

  const render = (selected) => {
    segmentedState(options.length, selected).forEach((s, i) => {
      options[i].setAttribute('aria-checked', String(s.checked));
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
      const target = segmentedTargetIndex(options.map((x) => x.disabled), i, e.key);
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

/** Binds every slider and segmented choice under `root`. Returns unbind-all. */
export function initComponents(root) {
  const unbinds = [
    ...[...root.querySelectorAll('.ui-slider')].map((el) => bindSlider(el)),
    ...[...root.querySelectorAll('.ui-segmented')].map((el) => bindSegmented(el)),
  ];
  return () => { for (const u of unbinds) u(); };
}
