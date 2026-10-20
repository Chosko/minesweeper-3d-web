// The contrast measure browser tests run in the page (page.evaluate(measureContrast)): every shown
// text run with its contrast ratio against the background layers under it, composited down to the
// first opaque one (white when none is), and the minimum the contrast contract sets for its size —
// 3:1 for large text, 4.5:1 otherwise; plus the focus state of each [data-force~="focus"] control.
// focusShows reads one such focus state; checkCard asserts a card over the 3D scene readable and
// within the window.
import assert from 'node:assert/strict';

// A focused control's look: a button, menu entry or board option shows its selected state (moved level
// with the surface, no outline); any other control a focus ring.
export const focusShows = (f) => (f.selectable ? f.style === 'none' && f.transform !== 'none' : f.style !== 'none' && f.width >= 2);

/**
 * Asserts the card at `selector` in `page` readable — at least three of its own text runs measured,
 * none below the contrast contract — and never wider than the window, once two frames have drawn.
 */
export async function checkCard(page, selector, label) {
  const ms = (fn, arg) => page.evaluate(fn, arg);
  await ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const { runs } = await ms(measureContrast);
  const own = await ms((sel) => [...document.querySelectorAll(`${sel} *`)]
    .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((e) => e.textContent.trim().slice(0, 30)), selector);
  const mine = runs.filter((r) => own.includes(r.text));
  assert.ok(mine.length >= 3, `${label}: its text is measured (${mine.length})`);
  const failing = mine.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
  assert.deepEqual(failing, [], `${label}: text below the contrast contract`);
  const fit = await ms((sel) => {
    const box = document.querySelector(sel).getBoundingClientRect();
    return { page: document.documentElement.scrollWidth <= innerWidth, card: box.left >= 0 && box.right <= innerWidth + 0.5 };
  }, selector);
  assert.deepEqual(fit, { page: true, card: true }, `${label}: no sideways scroll`);
}

export function measureContrast() {
  const parse = (v) => {
    const m = v.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  };
  const over = (top, base) => [0, 1, 2].map((i) => top[i] * top[3] + base[i] * (1 - top[3])).concat(1);
  const lum = ([r, g, b]) => {
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const background = (el) => {
    const layers = [];
    for (let e = el; e; e = e.parentElement) {
      const c = parse(getComputedStyle(e).backgroundColor);
      if (c && c[3] > 0) layers.push(c);
      if (c && c[3] === 1) break;
    }
    let bg = [255, 255, 255, 1];
    for (const c of layers.reverse()) bg = over(c, bg);
    return bg;
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (el.closest('[aria-hidden="true"], script, style')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const s = getComputedStyle(el);
    const bg = background(el);
    const fg = over(parse(s.color), bg);
    const size = parseFloat(s.fontSize);
    const weight = Number(s.fontWeight);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    out.push({ text: n.textContent.trim().slice(0, 30), ratio: ratio(fg, bg), min: large ? 3 : 4.5 });
  }
  const focus = [...document.querySelectorAll('[data-force~="focus"]')].map((el) => {
    const s = getComputedStyle(el);
    return { cls: el.className, selectable: el.matches('.ui-button, .ui-menu__item, .ui-mode-entry, .ui-option'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), transform: s.transform };
  });
  return { runs: out, focus };
}
