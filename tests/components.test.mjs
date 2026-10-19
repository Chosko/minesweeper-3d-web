import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  decimalsOf, formatSliderValue, segmentedTargetIndex, segmentedState,
  bindSlider, bindSegmented, bindTabs, initComponents, formatOverlayTime, formatMineCount, mineCounterDigits, pagerState, PAGER_WINDOW,
  boardLink, copyBoardCode, bindCodeChip, COPY_FALLBACK, COPIED, bindCodeField, bindSelectOnHover, SELECT_ON_HOVER,
  bindFiguresLive, LIVE_FIGURES_INTERVAL,
} from '../js/ui/components.js';
import { KIT_CATALOGUE } from '../js/ui/kit-catalogue.js';
import { KEY_HINTS, keyHintKeys } from '../js/settings/bindings.js';
import { GLYPHS } from '../js/gamepad.js';
import { UI } from '../js/ui.js';
import { FOCUSABLE } from '../js/shell/navigation.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const RAW = read('css/components.css');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');
const GALLERY = read('dev/components.html');
const THEME_RAW = read('themes/joyful-tiles/theme.css');
const THEME_CSS = THEME_RAW.replace(/\/\*[\s\S]*?\*\//g, '');
const SCOPE = ':root[data-theme="joyful-tiles"]';
const TOKENS = new Set([...`${read('css/tokens.css')}\n${THEME_RAW}`.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// The catalogue: every component the kit ships, its root class, and whether
// it is interactive (so it owns the five states and the focus contract).
const COMPONENTS = {
  'ui-button--primary': { interactive: true, selectable: true, control: '.ui-button.ui-button--primary' },
  'ui-button--secondary': { interactive: true, selectable: true, control: '.ui-button.ui-button--secondary' },
  'ui-menu': { interactive: true, selectable: true, control: '.ui-menu__item' },
  'ui-card': { interactive: false },
  'ui-panel': { interactive: false },
  'ui-toggle': { interactive: true, control: '.ui-toggle__input' },
  'ui-slider': { interactive: true, control: '.ui-slider__input' },
  'ui-segmented': { interactive: true, control: '.ui-segmented__option' },
  'ui-stat': { interactive: false },
  'ui-overlay-bar': { interactive: false },
  'ui-field': { interactive: true, control: '.ui-field__input' },
  'ui-link': { interactive: true, control: '.ui-link' },
  'ui-spinner': { interactive: false },
  'ui-banner': { interactive: false },
  'ui-stat--tile': { interactive: false },
  'ui-pager': { interactive: false },
  'ui-code': { interactive: false },
  // the shared layout's components
  'ui-button--danger': { interactive: true, selectable: true, control: '.ui-button.ui-button--danger' },
  'ui-backdrop': { interactive: false },
  'ui-frame': { interactive: false },
  'ui-mode-entry': { interactive: true, selectable: true, control: '.ui-mode-entry' },
  'ui-option': { interactive: true, selectable: true, control: '.ui-option' },
  'ui-section-label': { interactive: false },
  'ui-key-hint': { interactive: false },
  'ui-chip': { interactive: false },
  'ui-list-row': { interactive: false },
  'ui-scene-panel': { interactive: false },
  'ui-wordmark': { interactive: false },
  'ui-divider': { interactive: false },
  'ui-tabs': { interactive: true, control: '.ui-tabs__tab' },
  'ui-checkbox': { interactive: true, control: '.ui-checkbox__input' },
  'ui-table': { interactive: false },
  'ui-toast': { interactive: false },
  // the in-game components
  'ui-counter': { interactive: false },
  'ui-counter-strip': { interactive: false },
  'ui-figure': { interactive: false },
  'ui-figures': { interactive: false },
};
// Screen compositions: layout-only classes the screens are assembled with.
const COMPOSITIONS = ['ui-screen', 'ui-row', 'ui-grid', 'ui-heading', 'ui-text', 'ui-actions', 'ui-stat-row', 'ui-columns',
  'ui-mode-list', 'ui-options', 'ui-key-hints', 'ui-list'];
// The controls whose hover and focus are one selected state.
const SELECTABLE = '.ui-button, .ui-menu__item, .ui-mode-entry, .ui-option';
const STATES = ['hover', 'active', 'focus', 'disabled'];

// css rules as [selector, body] pairs (top level and inside @media).
function rules(css) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([m[1].trim(), m[2]]);
  return out;
}
const RULES = rules(CSS);
const rulesFor = (needle) => RULES.filter(([sel]) => sel.includes(needle));
// The theme's rules, each selector list with the theme's scope taken off its selectors.
const THEME_RULES = rules(THEME_CSS).filter(([sel]) => sel.includes(SCOPE)).map(([sel, body]) => [sel.split(SCOPE).join('').trim(), body]);
const themeRulesFor = (needle) => THEME_RULES.filter(([sel]) => sel.includes(needle));

// ---------------------------------------------------------------- tokens only

test('components.css declares no custom properties and reads only declared tokens', () => {
  assert.doesNotMatch(CSS, /(^|[;{\s])--[\w-]+\s*:/, 'components.css declares a custom property');
  const reads = [...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  assert.ok(reads.length > 20, 'components read their values from tokens');
  for (const name of reads) assert.ok(TOKENS.has(name), `components.css reads undeclared ${name}`);
});

// The base stylesheets carry structure only: no colour, font family, border style or colour, radius,
// shadow, transition or animation value, outside the shipped reduced-motion rule.
const REDUCED_MOTION = '@media (prefers-reduced-motion: reduce) {\n  *, *::before, *::after { animation: none !important; transition: none !important; }\n}';
const VISUAL = /^(color|background(-color|-image)?|border(-(top|right|bottom|left))?(-(color|style))?|border-style|border-color|outline(-color|-style)?|border(-[a-z-]+)?-radius|box-shadow|text-shadow|filter|backdrop-filter|-webkit-backdrop-filter|font-family|font|transition[\w-]*|animation[\w-]*|fill|stroke|caret-color|accent-color|text-decoration-color|-webkit-tap-highlight-color)$/;

function visualValues(file) {
  let css = read(file).replace(/\/\*[\s\S]*?\*\//g, '');
  if (file === 'css/style.css') {
    assert.ok(css.includes(REDUCED_MOTION), 'css/style.css keeps its reduced-motion rule unchanged');
    css = css.replace(REDUCED_MOTION, '');
  }
  const found = [];
  if (/@keyframes/.test(css)) found.push('@keyframes');
  if (/data-theme|prefers-color-scheme|prefers-reduced-motion/.test(css)) found.push('a theme-specific or motion-preference rule');
  for (const [sel, body] of rules(css)) {
    for (const d of body.split(';')) {
      const i = d.indexOf(':');
      if (i < 0) continue;
      const prop = d.slice(0, i).trim();
      const value = d.slice(i + 1).trim();
      if (prop.startsWith('--')) continue;
      if (/#[0-9a-f]{3,8}\b|\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|color-mix)\(|\b(white|black|transparent|currentcolor)\b/i.test(value)) found.push(`${sel} { ${prop}: ${value} }`);
      if (VISUAL.test(prop) && !/^(none|0)$/.test(value)) found.push(`${sel} { ${prop}: ${value} }`);
      if (/var\(--(color|font-family|radius|elevation|duration|easing|edge|highlight|veil|shade)/.test(value)) found.push(`${sel} { ${prop}: ${value} }`);
    }
  }
  return found;
}

test('the base stylesheets carry no colour, font family, border, radius, shadow, transition or animation value outside the reduced-motion rule', () => {
  for (const f of ['css/tokens.css', 'css/components.css', 'css/style.css']) assert.deepEqual(visualValues(f), [], f);
});

test('the base check bites: a colour, a radius, a shadow, a transition, an animation and a font family are each caught', () => {
  const caught = (css) => {
    const found = [];
    for (const [sel, body] of rules(css)) {
      for (const d of body.split(';')) {
        const i = d.indexOf(':');
        if (i > 0 && VISUAL.test(d.slice(0, i).trim()) && !/^(none|0)$/.test(d.slice(i + 1).trim())) found.push(sel);
      }
    }
    return found.length;
  };
  for (const decl of ['color: red', 'background: var(--color-ink)', 'border-radius: 4px', 'box-shadow: 0 1px 0 x', 'transition: color 1s', 'animation: spin 1s', 'font-family: serif', 'border: 1px solid']) {
    assert.equal(caught(`.x { ${decl}; }`), 1, decl);
  }
  assert.equal(caught('.x { border: 0; outline: none; background: none; }'), 0, 'a reset is structure');
});

test('the theme draws the code chip as the canvas does: a sunk pill with an inset border, compact too', () => {
  const chip = themeRulesFor('.ui-code').filter(([sel]) => sel === '.ui-code').map(([, b]) => b).join(';');
  assert.match(chip, /background:\s*var\(--color-surface-sunk\)/);
  assert.match(chip, /box-shadow:\s*inset 0 0 0 2px var\(--color-border\)/);
  assert.match(chip, /border-radius:\s*var\(--radius-md\)/);
  assert.ok(themeRulesFor('.ui-code--compact').length > 0, 'the compact chip has its own size');
});

test('the theme carries the spinner\'s turn, timed from a motion token, and the kit\'s colours', () => {
  const spinner = themeRulesFor('.ui-spinner').map(([, b]) => b).join(';');
  assert.match(spinner, /animation: [\w-]+ calc\(var\(--duration-\w+\) \* \d+\) linear infinite/, 'its pace comes from a motion token');
  assert.match(spinner, /border[\w-]*:[^;]*var\(--color-/, 'its colours come from tokens');
});

// ---------------------------------------------------------------- catalogue

test('the stylesheet head documents every component as the catalogue', () => {
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//);
  assert.ok(head, 'components.css opens with a catalogue comment');
  const text = head[1];
  for (const name of Object.keys(COMPONENTS)) {
    const at = text.indexOf(name);
    assert.ok(at >= 0, `catalogue documents ${name}`);
  }
  for (const word of ['Element', 'Role', 'Name']) assert.match(text, new RegExp(word), `catalogue states each component's ${word}`);
  assert.match(text, /defaultFocus/, 'catalogue states how a screen declares its default focus target');
  for (const name of Object.keys(COMPONENTS)) {
    const own = new RegExp(`\\.(${name}|${name.split('--')[0]})(?![\\w-])`);
    assert.ok(RULES.some(([sel]) => own.test(sel)), `${name} has its structure in the base`);
    assert.ok(themeRulesFor(`.${name}`).length > 0, `${name} is styled by the theme`);
  }
});

test('every interactive component has its states in the theme: buttons, menu entries and board options a selected state and no hover of their own', () => {
  for (const [name, c] of Object.entries(COMPONENTS)) {
    if (!c.interactive) continue;
    const own = themeRulesFor(c.control.split('.').pop()).map(([sel]) => sel).join('\n');
    assert.match(own, /:active/, `${name} pressed`);
    assert.match(own, /body\.pad-nav [^,]*:focus\b/, `${name} controller focus`);
    assert.match(own, /:disabled|\[aria-disabled="true"\]/, `${name} disabled`);
    if (c.selectable) {
      const cls = c.control.split('.').pop();
      assert.match(own, new RegExp(`(^|\\s)\\.${cls}:focus,`), `${name} selected while focused, by any input`);
      assert.doesNotMatch(own, /:hover/, `${name} has no hover look of its own`);
    } else {
      assert.match(own, /:hover/, `${name} hover`);
      assert.match(own, /:focus-visible/, `${name} keyboard focus`);
    }
  }
});

test('buttons, menu entries and board options draw no outline: the selected state is their focus cue; the other controls ring from --color-focus-ring', () => {
  const focus = THEME_RULES.filter(([sel]) => /:focus/.test(sel));
  assert.ok(focus.length > 0);
  for (const [sel, body] of focus) {
    if (/ui-button|ui-menu__item|ui-mode-entry|ui-option\b/.test(sel) && !/ui-toggle/.test(sel)) {
      assert.doesNotMatch(body, /outline\s*:(?!\s*none)/, `${sel} draws no outline`);
      assert.doesNotMatch(body, /--color-focus-halo/, `${sel} draws no halo`);
    }
  }
  const ring = focus.filter(([sel]) => /ui-toggle__input, \.ui-slider__input/.test(sel)).map(([, b]) => b).join(';');
  assert.match(ring, /outline\s*:\s*[^;]*var\(--color-focus-ring\)/, 'the other controls draw the focus ring');
});

// ---------------------------------------------------------------- pages

test('index.html loads tokens, then the component kit, then the shell stylesheet, then the theme applier that inserts the theme', () => {
  const html = read('index.html');
  const t = html.indexOf('href="css/tokens.css"');
  const c = html.indexOf('href="css/components.css"');
  const s = html.indexOf('href="css/style.css"');
  const j = html.indexOf('src="js/theme.js"');
  assert.ok(t >= 0 && c > t && s > c && j > s, 'tokens.css < components.css < style.css < theme.js');
});

test('the gallery loads only the token sheet and the kit, then the theme applier that inserts the theme', () => {
  const theme = GALLERY.indexOf('src="../js/theme.js"');
  const t = GALLERY.indexOf('href="../css/tokens.css"');
  const c = GALLERY.indexOf('href="../css/components.css"');
  assert.ok(t >= 0 && c > t && theme > c, 'tokens.css < components.css < theme.js');
  assert.doesNotMatch(GALLERY, /css\/style\.css/);
  const inline = [...GALLERY.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(inline, /#[0-9a-f]{3,8}\b|\brgba?\(|var\(--color-|border-radius|box-shadow|font-family/i, 'the gallery lays out; the theme styles');
});

// Minimal parse of the gallery: each tag with its attributes.
function tags(html) {
  const out = [];
  for (const m of html.matchAll(/<([a-z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/gi)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
    out.push({ tag: m[1].toLowerCase(), attrs, index: m.index, end: m.index + m[0].length });
  }
  return out;
}
const TAGS = tags(GALLERY);
const hasClasses = (t, selector) => selector.split('.').filter(Boolean).every((c) => (t.attrs.class ?? '').split(/\s+/).includes(c));

test('the gallery renders every component, and every interactive one in every state', () => {
  for (const [name, c] of Object.entries(COMPONENTS)) {
    const sel = c.control ?? `.${name}`;
    const found = TAGS.filter((t) => hasClasses(t, sel));
    assert.ok(found.length > 0, `gallery shows ${name}`);
    if (!c.interactive) continue;
    const forced = new Set(found.map((t) => t.attrs['data-force']).filter(Boolean));
    for (const s of c.selectable ? ['active', 'focus'] : ['hover', 'active', 'focus']) assert.ok(forced.has(s), `${name} shown ${s}`);
    if (c.selectable) assert.ok(!forced.has('hover'), `${name}: hover is its selected state, shown once`);
    const off = (t) => 'disabled' in t.attrs || t.attrs['aria-disabled'] === 'true';
    assert.ok(found.some(off), `${name} shown disabled`);
    assert.ok(found.some((t) => !off(t) && !t.attrs['data-force']), `${name} shown at rest`);
  }
});

test('the gallery preview hooks mirror the real pseudo-classes', () => {
  for (const s of ['hover', 'active', 'focus']) {
    const pseudo = s === 'focus' ? ':focus' : `:${s}`;
    for (const [sel] of THEME_RULES.filter(([x]) => x.includes(`[data-force~="${s}"]`))) {
      assert.ok(sel.includes(pseudo), `${sel} pairs the ${s} hook with ${pseudo}`);
    }
    assert.ok(THEME_RULES.some(([x]) => x.includes(`[data-force~="${s}"]`)), `a rule previews ${s}`);
  }
  assert.doesNotMatch(CSS, /data-force/, 'the base previews nothing: it draws no state');
});

// The shell's controller navigation collects these elements.
const PAD_SELECTOR = FOCUSABLE;
const PAD_TAGS = PAD_SELECTOR.split(',').map((s) => s.trim());

function accessibleName(t, src = GALLERY, all = TAGS) {
  if (t.attrs['aria-label']) return t.attrs['aria-label'];
  if (t.attrs['aria-labelledby']) {
    const ids = t.attrs['aria-labelledby'].split(/\s+/);
    for (const id of ids) assert.ok(all.some((x) => x.attrs.id === id), `aria-labelledby target #${id} exists`);
    return ids.join(' ');
  }
  if (t.attrs.id && all.some((x) => x.tag === 'label' && x.attrs.for === t.attrs.id)) return 'label[for]';
  if (t.tag === 'button' || t.tag === 'a') {
    const close = src.indexOf(`</${t.tag}>`, t.end);
    const text = src.slice(t.end, close).replace(/<[^>]+>/g, '').trim();
    if (text) return text;
  }
  // a wrapping <label>
  const before = src.slice(0, t.index);
  if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) return 'wrapping label';
  return '';
}

test('every interactive control is reachable by the controller layer and has an accessible name', () => {
  for (const [name, c] of Object.entries(COMPONENTS)) {
    if (!c.interactive) continue;
    for (const t of TAGS.filter((x) => hasClasses(x, c.control))) {
      if (t.tag === 'a' && !('href' in t.attrs)) {
        assert.equal(t.attrs['aria-disabled'], 'true', `${name} without href is the disabled link`);
        continue;
      }
      const kind = t.tag === 'a' ? 'a[href]' : t.tag;
      assert.ok(PAD_TAGS.includes(kind), `${name} is a <${t.tag}>, which padFocusables (${PAD_SELECTOR}) collects`);
      assert.ok(accessibleName(t), `${name} <${t.tag}> has an accessible name`);
      if (t.tag === 'button') assert.equal(t.attrs.type, 'button', `${name} button is type=button`);
    }
  }
  for (const t of TAGS.filter((x) => hasClasses(x, '.ui-toggle__input'))) assert.equal(t.attrs.role, 'switch');
  for (const t of TAGS.filter((x) => hasClasses(x, '.ui-segmented__option'))) {
    assert.equal(t.attrs.role, 'radio');
    assert.ok(['true', 'false'].includes(t.attrs['aria-checked']), 'segmented option carries aria-checked');
  }
  for (const t of TAGS.filter((x) => hasClasses(x, '.ui-segmented'))) {
    assert.equal(t.attrs.role, 'radiogroup');
    assert.ok(t.attrs['aria-label'] || t.attrs['aria-labelledby'], 'segmented group is named');
  }
  for (const t of TAGS.filter((x) => hasClasses(x, '.ui-stat'))) {
    assert.equal(t.attrs.role, 'group');
    assert.ok(t.attrs['aria-labelledby'], 'stat readout is named by its label');
  }
});

// ---------------------------------------------------------------- helpers: logic

test('decimalsOf counts the decimals of a step', () => {
  assert.equal(decimalsOf('1'), 0);
  assert.equal(decimalsOf('0.05'), 2);
  assert.equal(decimalsOf('0.1'), 1);
  assert.equal(decimalsOf('any'), 0);
  assert.equal(decimalsOf(undefined), 0);
  assert.equal(decimalsOf('1e-3'), 3);
});

test('formatSliderValue formats numbers, percentages and multipliers', () => {
  assert.equal(formatSliderValue('7', {}), '7');
  assert.equal(formatSliderValue('0.5', { step: '0.05' }), '0.50');
  assert.equal(formatSliderValue('40', { format: 'percent' }), '40%');
  assert.equal(formatSliderValue('0.4', { format: 'percent', step: '0.01', max: '1' }), '40%');
  assert.equal(formatSliderValue('1.25', { format: 'multiplier', step: '0.05' }), '1.25×');
  assert.equal(formatSliderValue('3', { unit: ' s' }), '3 s');
  assert.equal(formatSliderValue('abc', {}), '');
});

test('segmentedTargetIndex moves with arrows, wraps and skips disabled options', () => {
  const on = [false, false, false, false];
  assert.equal(segmentedTargetIndex(on, 0, 'ArrowRight'), 1);
  assert.equal(segmentedTargetIndex(on, 0, 'ArrowDown'), 1);
  assert.equal(segmentedTargetIndex(on, 0, 'ArrowLeft'), 3);
  assert.equal(segmentedTargetIndex(on, 3, 'ArrowRight'), 0);
  assert.equal(segmentedTargetIndex(on, 2, 'ArrowUp'), 1);
  assert.equal(segmentedTargetIndex(on, 2, 'Home'), 0);
  assert.equal(segmentedTargetIndex(on, 1, 'End'), 3);
  assert.equal(segmentedTargetIndex(on, 1, 'Enter'), null);
  const dis = [false, true, false, true];
  assert.equal(segmentedTargetIndex(dis, 0, 'ArrowRight'), 2);
  assert.equal(segmentedTargetIndex(dis, 2, 'ArrowRight'), 0);
  assert.equal(segmentedTargetIndex(dis, 0, 'End'), 2);
  assert.equal(segmentedTargetIndex([true, false, true], 1, 'Home'), 1);
  assert.equal(segmentedTargetIndex([true, true], 0, 'ArrowRight'), null);
});

test('a horizontal segmented choice takes only Left and Right, leaving Up and Down to focus moves', () => {
  const on = [false, false, false];
  const h = { horizontal: true };
  assert.equal(segmentedTargetIndex(on, 0, 'ArrowRight', h), 1);
  assert.equal(segmentedTargetIndex(on, 0, 'ArrowLeft', h), 2);
  assert.equal(segmentedTargetIndex(on, 1, 'Home', h), 0);
  assert.equal(segmentedTargetIndex(on, 1, 'End', h), 2);
  assert.equal(segmentedTargetIndex(on, 0, 'ArrowDown', h), null);
  assert.equal(segmentedTargetIndex(on, 1, 'ArrowUp', h), null);
});

test('segmentedState checks one option and keeps only it in the tab order', () => {
  assert.deepEqual(segmentedState(3, 1), [
    { checked: false, tabIndex: -1 }, { checked: true, tabIndex: 0 }, { checked: false, tabIndex: -1 },
  ]);
  assert.deepEqual(segmentedState(2, -1).map((s) => s.tabIndex), [0, -1], 'nothing selected: the first is tabbable');
});

// ---------------------------------------------------------------- overlay bar

test('formatOverlayTime shows whole elapsed seconds, three digits, stopping at 999', () => {
  assert.equal(formatOverlayTime(0), '000');
  assert.equal(formatOverlayTime(0.99), '000');
  assert.equal(formatOverlayTime(1), '001');
  assert.equal(formatOverlayTime(47.8), '047');
  assert.equal(formatOverlayTime(123.4), '123');
  assert.equal(formatOverlayTime(998.999), '998');
  assert.equal(formatOverlayTime(999), '999');
  assert.equal(formatOverlayTime(999.6), '999');
  assert.equal(formatOverlayTime(1000), '999', 'the display stops at 999');
  assert.equal(formatOverlayTime(86400), '999');
  assert.equal(formatOverlayTime(Infinity), '999');
  assert.equal(formatOverlayTime(-3), '000');
  assert.equal(formatOverlayTime(NaN), '000');
});

test('formatMineCount shows the real mines left, kept at -99 at the low end', () => {
  assert.equal(formatMineCount(0), '0');
  assert.equal(formatMineCount(10), '10');
  assert.equal(formatMineCount(-12), '-12');
  assert.equal(formatMineCount(-99), '-99');
  assert.equal(formatMineCount(-100), '-99', 'below -99');
  assert.equal(formatMineCount(-5000), '-99');
  assert.equal(formatMineCount(999), '999');
  assert.equal(formatMineCount(1000), '1000', 'no upper clamp');
  assert.equal(formatMineCount(2480), '2480', 'a large board shows its real count');
  assert.equal(formatMineCount(250000), '250000');
});

test('the mine counter is as wide as the board\'s mine count, at least three digits', () => {
  assert.equal(mineCounterDigits(10), 3, 'standard boards keep three');
  assert.equal(mineCounterDigits(99), 3);
  assert.equal(mineCounterDigits(999), 3);
  assert.equal(mineCounterDigits(1000), 4);
  assert.equal(mineCounterDigits(2480), 4);
  assert.equal(mineCounterDigits(999999), 6);
  assert.equal(mineCounterDigits(0), 3);
});

test('UI.setBoard and setBoard2D size the mine counter to the board\'s digits', () => {
  const fake = { _setBoardText() {}, _sizeMines: UI.prototype._sizeMines, el: { mines: { style: {} } } };
  UI.prototype.setBoard.call(fake, { X: 20, Y: 20, Z: 20, mines: 2480 });
  assert.equal(fake.el.mines.style.minWidth, '4ch');
  UI.prototype.setBoard2D.call(fake, { width: 9, height: 9, mines: 10 });
  assert.equal(fake.el.mines.style.minWidth, '', 'a standard board looks as it does today');
  UI.prototype.setBoard.call(fake, { X: 12, Y: 12, Z: 8, mines: 130 });
  assert.equal(fake.el.mines.style.minWidth, '', 'up to 999 mines: no width of its own');
  assert.doesNotMatch(read('css/style.css'), /#hud-mines\s*\{[^}]*text-align/, 'the count stays left-aligned under its label');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /#hud-mines\s*\{[^}]*font-variant-numeric:\s*var\(--font-numeric-tabular\)/, 'tabular figures, so the bar does not shift');
});

test('the overlay formats copy the reference game displays the fidelity file records', () => {
  const file = read('tests/fidelity/minesweeper-online.md');
  const entry = file.split(/^### /m).find((part) => part.startsWith('Overlay time and mine displays'));
  assert.ok(entry, 'tests/fidelity/minesweeper-online.md records the overlay displays');
  assert.match(entry, /999/);
  assert.match(entry, /−99/);
});

test('the overlay bar is documented with its stats and its pause button', () => {
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  const doc = head.slice(head.indexOf('ui-overlay-bar'));
  for (const part of ['ui-stat', 'ui-stat__value', 'ui-overlay-bar__pause', 'aria-label', 'formatOverlayTime', 'formatMineCount']) {
    assert.ok(doc.includes(part), `overlay bar pattern names ${part}`);
  }
  const bar = themeRulesFor('.ui-overlay-bar').find(([sel]) => sel === '.ui-overlay-bar');
  assert.ok(bar, '.ui-overlay-bar is styled');
  assert.match(bar[1], /background\s*:\s*var\(--color-surface\)/, 'the bar carries its own surface');
});

test('the overlay surface is opaque, so the scene behind it never shows through', () => {
  const value = THEME_CSS.match(/--color-surface\s*:\s*([^;]+);/)[1].trim();
  assert.match(value, /^#[0-9a-f]{6}$|^rgb\(/i, `--color-surface is opaque (${value})`);
});

// The in-game HUD in index.html, parsed with the gallery's tag reader.
const INDEX = read('index.html');
const HUD = INDEX.slice(INDEX.indexOf('<div id="hud"'), INDEX.indexOf('<div id="crosshair"'));
const HUD_TAGS = tags(HUD);

test('the 3D HUD renders through the overlay bar: timer, mine counter, click counter and a named pause button', () => {
  const bar = HUD_TAGS.find((t) => hasClasses(t, '.ui-overlay-bar'));
  assert.ok(bar, '#hud holds a .ui-overlay-bar');
  const at = [];
  for (const id of ['hud-time', 'hud-mines', 'hud-clicks', 'hud-size']) {
    const value = HUD_TAGS.find((t) => t.attrs.id === id);
    assert.ok(value && hasClasses(value, '.ui-stat__value'), `#${id} is a stat value`);
    assert.ok(value.index > bar.index, `#${id} sits in the overlay bar`);
    at.push(value.index);
  }
  assert.deepEqual([...at].sort((a, b) => a - b), at, 'Time, Mines, Clicks, then the board');
  assert.match(HUD, /<span class="ui-stat__label" id="hud-clicks-label">Clicks<\/span><span id="hud-clicks" class="ui-stat__value">0<\/span>/);
  assert.ok(HUD_TAGS.filter((t) => hasClasses(t, '.ui-stat')).every((t) => t.attrs.role === 'group' && t.attrs['aria-labelledby']));
  const pause = HUD_TAGS.find((t) => hasClasses(t, '.ui-overlay-bar__pause'));
  assert.ok(pause, 'the overlay bar has a pause button');
  assert.equal(pause.tag, 'button');
  assert.equal(pause.attrs.type, 'button');
  assert.ok(pause.attrs.id, 'the pause button has an id for the shell to wire');
  assert.match(pause.attrs['aria-label'] ?? '', /pause/i, 'the pause button is named');
  assert.equal(HUD.match(/id="hud-time"[^>]*>([^<]*)</)[1], '000', 'the timer starts in the overlay format');
  assert.doesNotMatch(HUD, /class="stat\b|hud-stats/, 'the one-off HUD stat markup is gone');
});

test('in Classic 2D the overlay bar is the top edge of the board\'s framed panel, drawn in theme tokens', () => {
  const style = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(style, /\.c2d-panel \{ position: absolute; \}/, 'the base places the panel');
  const panel = themeRulesFor('.c2d-panel').map(([, b]) => b).join(';');
  assert.match(panel, /box-shadow\s*:\s*inset 0 0 0 2px var\(--color-border\)/, 'its frame');
  assert.match(panel, /background\s*:\s*var\(--color-surface\)/, 'the overlay\'s surface, opaque');
  assert.match(style, /#hud\.hud--2d \.hud-bar \{ padding: 0; \}/);
  assert.match(THEME_CSS, /#hud\.hud--2d \.hud-bar \{ border: 0; background: none; box-shadow: none; \}/, 'the bar sits on the panel with no surface of its own');
  assert.match(INDEX, /<div id="c2d-board"><div id="c2d-panel" class="c2d-panel hidden" aria-hidden="true"><\/div><\/div>/);
  const ui = read('js/ui.js');
  assert.match(ui, /export const PANEL_INSET = 9;/, 'the frame: 1 px border and --space-2 inside it');
  assert.match(ui, /placePanel2D\(rect\)/, 'the shell places the panel and the bar on its edge');
});

test('the gallery shows the overlay bar with its pause button in every state', () => {
  const bars = TAGS.filter((t) => hasClasses(t, '.ui-overlay-bar'));
  assert.ok(bars.length > 0, 'gallery shows the overlay bar');
  const pauses = TAGS.filter((t) => hasClasses(t, '.ui-overlay-bar__pause'));
  for (const p of pauses) assert.ok(hasClasses(p, '.ui-button.ui-button--secondary'), 'the pause button is a secondary button');
  const forced = new Set(pauses.map((t) => t.attrs['data-force']).filter(Boolean));
  for (const s of ['active', 'focus']) assert.ok(forced.has(s), `pause shown ${s}`);
  assert.ok(pauses.some((t) => 'disabled' in t.attrs), 'pause shown disabled');
});

test('UI.updateHud writes the overlay formats and keeps the negative mine flag', () => {
  const cls = new Set();
  const fake = {
    _last: { time: '', mines: '' },
    el: {
      time: { textContent: '' },
      mines: { textContent: '', classList: { toggle: (c, on) => (on ? cls.add(c) : cls.delete(c)) } },
    },
  };
  UI.prototype.updateHud.call(fake, 47.83, 10);
  assert.equal(fake.el.time.textContent, '047');
  assert.equal(fake.el.mines.textContent, '10');
  UI.prototype.updateHud.call(fake, 1234.5, -150);
  assert.equal(fake.el.time.textContent, '999');
  assert.equal(fake.el.mines.textContent, '-99');
  assert.ok(cls.has('negative'));
  UI.prototype.updateHud.call(fake, 0, 1200);
  assert.equal(fake.el.mines.textContent, '1200', 'the real count past 999');
  assert.ok(!cls.has('negative'));
});

test('UI.updateHud writes the click count, only when it changes', () => {
  let writes = 0;
  let shown = '';
  const fake = {
    _last: { time: '', mines: '', clicks: '' },
    el: {
      time: { textContent: '' },
      mines: { textContent: '', classList: { toggle() {} } },
      clicks: { get textContent() { return shown; }, set textContent(v) { writes++; shown = v; } },
    },
  };
  UI.prototype.updateHud.call(fake, 0, 10, 0);
  assert.equal(shown, '0', 'no click before the first');
  UI.prototype.updateHud.call(fake, 1, 10, 0);
  assert.equal(writes, 1, 'the same count is not written again');
  UI.prototype.updateHud.call(fake, 1, 9, 183);
  assert.deepEqual([shown, writes], ['183', 2]);
  UI.prototype.updateHud.call(fake, 2, 9);
  assert.deepEqual([shown, writes], ['183', 2], 'a feed without a count leaves the readout as it is');
});

test('both modes feed the overlay\'s click counter from the engine\'s counts', () => {
  const main = read('js/main.js');
  assert.match(main, /hud: \(\{ seconds, minesLeft, clicks \}\) => ui\.updateHud\(seconds, minesLeft, clicks\)/, 'Classic 2D through its hud feed');
  assert.match(main, /ui\.updateHud\(e \? e\.time : S\.time, e \? e\.minesLeft : g\.minesLeft, e \? e\.clicks : clicks3D\(\)\)/,
    'the 3D frame loop, frozen with the timer at the end');
  assert.match(main, /S\.endState = \{[^}]*clicks: clicks3D\(\)/, 'the 3D end state freezes the count');
  assert.match(read('dev/components.html'), /<div class="ui-overlay-bar"[\s\S]*?>Clicks<\/span>[\s\S]*?ui-overlay-bar__pause/, 'the gallery\'s overlay bar shows it');
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head.slice(head.indexOf('ui-overlay-bar')), /Clicks/, 'the overlay bar pattern names the click counter');
});

test('the shell wires the overlay pause button to pause the game', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /hud-pause[\s\S]*onPause/, 'js/ui.js calls onPause from the pause button');
  assert.match(read('js/main.js'), /onPause\s*:/, 'js/main.js handles onPause');
});

test('the controller pauses through the overlay pause button', () => {
  const main = read('js/main.js');
  const playing = main.slice(main.indexOf('function padPlaying'), main.indexOf('function padMenus'));
  assert.match(playing, /pressed\(BTN\.START\)\)\s*\{\s*padClick\(document\.getElementById\('hud-pause'\)\)/,
    'START in play activates #hud-pause, the same control keyboard and mouse use');
  assert.match(main, /function padClick\(el\)[\s*\S]*?el\.click\(\)/, 'padClick activates the element');
});

// ---------------------------------------------------------------- screens composed from the kit

const section = (src, start, end) => src.slice(src.indexOf(start), src.indexOf(end));
const SCREENS = {
  menu: section(INDEX, '<section id="menu"', '<!-- 3D board choice -->'),
  'board-choice': section(INDEX, '<section id="board-choice"', '<!-- Coming soon -->'),
  pause: section(INDEX, '<section id="pause"', '<noscript>'),
};
const RESULTS = section(GALLERY, '<!-- composition: results -->', '<!-- /composition: results -->');
const classesOf = (t) => (t.attrs.class ?? '').split(/\s+/).filter(Boolean);
const STYLE = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');

test('the catalogue documents the screen compositions and the kit styles them', () => {
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  for (const name of COMPOSITIONS) {
    assert.ok(head.includes(name), `catalogue documents ${name}`);
    assert.ok(rulesFor(`.${name}`).length > 0, `${name} is styled in components.css`);
  }
  for (const screen of ['Main menu', 'Pause card', 'Results screen', '3D ready card', 'Context lost', 'Learn 3D end card']) assert.ok(head.includes(screen), `catalogue documents the ${screen} composition`);
  assert.doesNotMatch(head, /First box/, 'the catalogue names no First box');
  assert.doesNotMatch(head, /data-esc-hint|"Esc: Back"/, 'and no text Esc hint');
});

test('the main menu, the 3D board choice and the pause card are built only from kit classes', () => {
  // Allowed besides ui-*: the shell's visibility utility and the shared controls list of the help panel.
  const allowed = new Set(['hidden', 'controls', 'compact']);
  for (const [name, html] of Object.entries(SCREENS)) {
    assert.ok(html.length > 200, `${name} found in index.html`);
    const [root, ...inner] = tags(html);
    assert.deepEqual(classesOf(root).filter((c) => c !== 'hidden'), name === 'board-choice' ? ['overlay', 'ui-backdrop'] : ['overlay'], `#${name} is a shell overlay layer`);
    if (name === 'board-choice') {
      // The board choice sits on the page's backdrop: the wordmark over a screen frame, no card.
      for (const cls of ['ui-wordmark', 'ui-frame', 'ui-option', 'ui-key-hint']) assert.ok(inner.some((t) => classesOf(t).includes(cls)), `#${name} uses ${cls}`);
      assert.ok(!inner.some((t) => classesOf(t).includes('ui-card')), `#${name} holds no card`);
    } else if (name === 'menu') {
      // The main menu sits on the page's backdrop with no card: the wordmark, the entries, the preview, the hints.
      assert.ok(root.attrs['aria-label'], '#menu is named');
      for (const cls of ['ui-wordmark', 'ui-mode-list', 'ui-mode-entry', 'ui-scene-panel', 'ui-key-hints', 'ui-key-hint', 'ui-chip', 'ui-text']) {
        assert.ok(inner.some((t) => classesOf(t).includes(cls)), `#menu uses ${cls}`);
      }
      assert.ok(!inner.some((t) => classesOf(t).includes('ui-card')), '#menu holds no card');
    } else {
      const card = inner.find((t) => classesOf(t).includes('ui-card'));
      assert.ok(card, `#${name} holds a ui-card`);
      assert.ok(card.attrs['aria-labelledby'], `#${name} card is named by its title`);
    }
    for (const t of inner) {
      for (const c of classesOf(t)) assert.ok(c.startsWith('ui-') || allowed.has(c), `#${name} <${t.tag} class="${c}"> is not a kit class`);
    }
  }
});

test('the shell stylesheet keeps none of the one-off menu and pause rules', () => {
  const gone = ['.menu-card', '.pause-card', '.preset', '.btn', '.custom', '.menu-head', '.menu-foot', '.subtitle', '.logo',
    '.pause-buttons', '.pause-help', '.pause-settings', '.pause-sub', '.pause-note', '.settings-grid', '.set-ctl', '.vol',
    '.touch-note', '.p-name', '.p-dims', '.p-best', '#pause-title', '.sep'];
  const selectors = rules(STYLE).map(([sel]) => sel);
  for (const g of gone) {
    const re = new RegExp(`${g.replace(/[.#]/g, '\\$&')}(?![\\w-])`);
    assert.ok(!selectors.some((sel) => re.test(sel)), `css/style.css still styles ${g}`);
  }
  assert.ok(!selectors.some((sel) => /(^|[\s,])h[12]\b/.test(sel)), 'css/style.css still styles headings globally');
});

test('every control on the menu and the pause card is named and reachable by keyboard and controller', () => {
  for (const [name, html] of Object.entries(SCREENS)) {
    const all = tags(html);
    const controls = all.filter((t) => ['button', 'input', 'select', 'summary'].includes(t.tag) || (t.tag === 'a' && 'href' in t.attrs));
    assert.ok(controls.length >= 4, `#${name} has its controls`);
    for (const t of controls) {
      const kind = t.tag === 'a' ? 'a[href]' : t.tag;
      assert.ok(PAD_TAGS.includes(kind), `#${name} <${t.tag}> is collected by padFocusables`);
      assert.ok(!('tabindex' in t.attrs) || Number(t.attrs.tabindex) >= 0, `#${name} <${t.tag}> stays in the tab order`);
      assert.ok(accessibleName(t, html, all), `#${name} <${t.tag} id="${t.attrs.id ?? ''}"> has an accessible name`);
      if (t.tag === 'button') assert.ok(['button', 'submit'].includes(t.attrs.type), `#${name} button declares its type`);
      const kit = classesOf(t).some((c) => c.startsWith('ui-'));
      const wrapped = t.tag === 'input' && /ui-(toggle|slider|field)__input/.test(t.attrs.class ?? '');
      assert.ok(kit || wrapped, `#${name} <${t.tag} id="${t.attrs.id ?? ''}"> is a kit control`);
    }
  }
  const main = read('js/main.js');
  const line = (name) => main.match(new RegExp(`'?\\b${name}'?: \\{[^\\n]*defaultFocus: ([^\\n]*)`))[1];
  assert.match(line('paused'), /'#p-resume'/, 'the pause card focuses Resume by default');
  assert.ok(SCREENS.pause.includes('id="p-resume"') && SCREENS.pause.includes('id="p-restart"'));
  assert.match(SCREENS.pause, /id="p-resume"[^\n]*\n\s*<button id="p-home" class="ui-button ui-button--secondary" type="button">Back to start<\/button>/, 'Back to start follows Resume');
  assert.doesNotMatch(read('js/ui.js'), /Keep looking around/, 'an ended game offers no look-around resume');
  assert.match(line('menu'), /^\(\) => `#menu-entry-\$\{menuFocusEntry\(\)\}`/, 'the menu focuses its selection by default');
  assert.match(line('board-choice'), /^'[^']*data-preset/, 'the 3D board choice focuses the last played board by default');
});

test('the gallery holds the results screen composition with placeholder content', () => {
  assert.ok(RESULTS.length > 200, 'dev/components.html marks the results composition');
  const all = tags(RESULTS);
  const frame = all.find((t) => classesOf(t).includes('ui-frame'));
  assert.ok(frame && frame.attrs['aria-labelledby'], 'a named screen frame');
  assert.ok(all.some((t) => classesOf(t).includes('ui-frame__title') && t.attrs.id === frame.attrs['aria-labelledby']), 'its title names it');
  assert.ok(all.some((t) => classesOf(t).includes('ui-chip')), 'the rank chip');
  const row = all.find((t) => classesOf(t).includes('ui-stat-row--tiles'));
  assert.ok(row, 'the figure tiles sit in a ui-stat-row--tiles');
  assert.equal(all.filter((t) => classesOf(t).includes('ui-stat--tile')).length, 4, 'four figure tiles');
  assert.ok(all.some((t) => classesOf(t).includes('ui-chip--best')), 'a New best badge');
  for (const d of ['better', 'worse', 'equal']) assert.ok(all.some((t) => t.attrs['data-delta'] === d), `a ${d} comparison`);
  assert.ok(all.some((t) => classesOf(t).includes('ui-table')), 'the detail rows');
  const actions = all.find((t) => classesOf(t).includes('ui-actions'));
  assert.ok(actions, 'the actions sit in ui-actions');
  const buttons = all.filter((t) => t.tag === 'button' && t.index > actions.index);
  assert.ok(buttons.some((t) => classesOf(t).includes('ui-button--primary')), 'a primary action');
  assert.ok(buttons.some((t) => classesOf(t).includes('ui-button--secondary')), 'a secondary action');
  for (const t of all) for (const c of classesOf(t)) assert.ok(c.startsWith('ui-'), `results composition uses kit class ${c} only`);
});

// ---------------------------------------------------------------- helpers: DOM binding on fakes

class FakeEl {
  constructor(attrs = {}) {
    this.attrs = { ...attrs };
    this.listeners = {};
    this.children = [];
    this.textContent = '';
    this.value = attrs.value ?? '';
    this.disabled = 'disabled' in attrs;
    this.tabIndex = 0;
    this.dispatched = [];
    this.focused = false;
  }
  getAttribute(n) { return n in this.attrs ? this.attrs[n] : null; }
  setAttribute(n, v) { this.attrs[n] = String(v); }
  hasAttribute(n) { return n in this.attrs; }
  addEventListener(t, f) { (this.listeners[t] ??= []).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] ?? []).filter((x) => x !== f); }
  fire(t, ev = {}) { for (const f of this.listeners[t] ?? []) f({ type: t, target: this, preventDefault() { ev.prevented = true; }, ...ev }); return ev; }
  dispatchEvent(e) { this.dispatched.push(e); return true; }
  focus() { this.focused = true; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] ?? null; }
  querySelectorAll(sel) {
    const cls = sel.replace(/^\./, '');
    const all = [];
    const walk = (e) => { for (const c of e.children) { if ((c.attrs.class ?? '').split(' ').includes(cls)) all.push(c); walk(c); } };
    walk(this);
    return all;
  }
}

test('code chip: the challenge link, Copy and Copy link through the clipboard, a refusal selecting the code', async () => {
  const location = { origin: 'https://minesweeper3d.chosko.com', pathname: '/' };
  assert.equal(boardLink('EN-20261011-184A', location), 'https://minesweeper3d.chosko.com/#board=EN-20261011-184A');
  const written = [];
  const toasts = [];
  let selected = 0;
  const clipboard = { writeText: async (t) => { written.push(t); } };
  const base = { code: 'EN-20261011-184A', clipboard, location, select: () => { selected += 1; }, toast: (t) => toasts.push(t) };
  assert.equal(await copyBoardCode({ ...base, kind: 'code' }), true);
  assert.equal(await copyBoardCode({ ...base, kind: 'link' }), true);
  assert.deepEqual(written, ['EN-20261011-184A', 'https://minesweeper3d.chosko.com/#board=EN-20261011-184A']);
  assert.deepEqual(toasts, [COPIED.code, COPIED.link]);
  const refused = { writeText: async () => { throw new Error('NotAllowedError'); } };
  assert.equal(await copyBoardCode({ ...base, kind: 'code', clipboard: refused }), false);
  assert.equal(await copyBoardCode({ ...base, kind: 'link', clipboard: undefined }), false);
  assert.equal(selected, 2);
  assert.deepEqual(toasts.slice(2), [COPY_FALLBACK, COPY_FALLBACK]);
  assert.equal(COPY_FALLBACK, 'Press Ctrl+C to copy');

  const el = (data = {}) => {
    const e = {
      dataset: data, attrs: {}, listeners: {}, textContent: '', hidden: false,
      setAttribute(n, v) { e.attrs[n] = v; },
      addEventListener(t, f) { (e.listeners[t] ??= []).push(f); },
      classList: { toggle(c, on) { if (c === 'hidden') e.hidden = on; } },
      click() { for (const f of e.listeners.click ?? []) f(); },
    };
    return e;
  };
  const value = el();
  const copy = el({ copy: 'code' });
  const link = el({ copy: 'link' });
  const root = el();
  root.querySelector = (sel) => (sel === '.ui-code__value' ? value : null);
  root.querySelectorAll = (sel) => (sel === '[data-copy]' ? [copy, link] : []);
  const calls = [];
  const chip = bindCodeChip(root, { onCopy: (c) => calls.push([c.kind, c.code, typeof c.select]) });
  chip.show(null);
  assert.equal(root.hidden, true, 'no code: the chip is hidden');
  copy.click();
  assert.deepEqual(calls, []);
  chip.show('B-00000000-40-1ABC');
  assert.equal(root.hidden, false);
  assert.equal(value.textContent, 'B-00000000-40-1ABC');
  assert.equal(copy.attrs['aria-label'], 'Copy the board code B-00000000-40-1ABC');
  assert.equal(link.attrs['aria-label'], 'Copy the challenge link of board B-00000000-40-1ABC');
  copy.click();
  link.click();
  assert.deepEqual(calls, [['code', 'B-00000000-40-1ABC', 'function'], ['link', 'B-00000000-40-1ABC', 'function']]);
});

test('code field: validated live as the custom forms are; Play and Enter play an accepted code only', () => {
  const node = () => {
    const n = { value: '', textContent: '', disabled: false, classes: new Set(), listeners: {} };
    n.classList = { toggle: (c, on) => { if (on) n.classes.add(c); else n.classes.delete(c); } };
    n.addEventListener = (t, f) => { (n.listeners[t] ??= []).push(f); };
    n.fire = (t, ev = {}) => { for (const f of n.listeners[t] ?? []) f({ preventDefault() { ev.prevented = true; }, ...ev }); return ev; };
    return n;
  };
  const [input, button, info] = [node(), node(), node()];
  const played = [];
  const field = bindCodeField({
    input, button, info, prompt: 'Paste a code',
    resolve: (t) => (t === 'GOOD' ? { ok: true, text: 'Beginner' } : { ok: false, reason: 'Not a code.' }),
    onPlay: (t) => played.push(t),
  });
  assert.deepEqual([info.textContent, button.disabled, info.classes.has('ui-text--warning')], ['Paste a code', true, false]);
  input.value = ' bad ';
  input.fire('input');
  assert.deepEqual([info.textContent, button.disabled, info.classes.has('ui-text--warning')], ['Not a code.', true, true]);
  button.fire('click');
  assert.deepEqual(played, [], 'a refused code does not play');
  input.value = 'GOOD ';
  input.fire('input');
  assert.deepEqual([info.textContent, button.disabled, info.classes.has('ui-text--muted')], ['Beginner', false, true]);
  button.fire('click');
  assert.equal(input.fire('keydown', { key: 'Enter' }).prevented, true);
  input.fire('keydown', { key: 'a' });
  assert.deepEqual(played, ['GOOD', 'GOOD']);
  field.clear();
  assert.deepEqual([input.value, info.textContent, button.disabled], ['', 'Paste a code', true]);
});

test('bindSlider shows the formatted value and follows input', () => {
  const root = new FakeEl({ class: 'ui-slider' });
  const input = new FakeEl({ class: 'ui-slider__input', value: '0.5', step: '0.05', 'data-format': 'multiplier' });
  const output = new FakeEl({ class: 'ui-slider__value' });
  root.children.push(input, output);
  const unbind = bindSlider(root);
  assert.equal(output.textContent, '0.50×');
  input.value = '0.75';
  input.fire('input');
  assert.equal(output.textContent, '0.75×');
  unbind();
  input.value = '1';
  input.fire('input');
  assert.equal(output.textContent, '0.75×', 'unbind stops updates');
});

test('bindSegmented selects on click and arrow keys, skips disabled options and reports changes', () => {
  const group = new FakeEl({ class: 'ui-segmented', role: 'radiogroup' });
  const opts = ['s', 'm', 'l'].map((v, i) => new FakeEl({
    class: 'ui-segmented__option', role: 'radio', 'data-value': v, 'aria-checked': i === 0 ? 'true' : 'false',
    ...(i === 1 ? { disabled: '' } : {}),
  }));
  group.children.push(...opts);
  const seen = [];
  bindSegmented(group, { onChange: (value, index) => seen.push([value, index]) });
  assert.deepEqual(opts.map((o) => [o.attrs['aria-checked'], o.tabIndex]), [['true', 0], ['false', -1], ['false', -1]]);

  opts[2].fire('click');
  assert.deepEqual(opts.map((o) => o.attrs['aria-checked']), ['false', 'false', 'true']);
  assert.deepEqual(seen, [['l', 2]]);
  assert.equal(group.dispatched.at(-1).type, 'change');

  opts[1].fire('click');
  assert.deepEqual(seen, [['l', 2]], 'a disabled option is not selectable');

  opts[2].fire('click');
  assert.deepEqual(seen, [['l', 2]], 'reselecting the current option reports nothing');

  const ev = opts[2].fire('keydown', { key: 'ArrowRight' });
  assert.ok(ev.prevented);
  assert.deepEqual(opts.map((o) => o.attrs['aria-checked']), ['true', 'false', 'false']);
  assert.ok(opts[0].focused, 'arrow keys move focus with the selection');
  assert.deepEqual(seen.at(-1), ['s', 0]);
});

test('bindSegmented with horizontal leaves Up and Down unhandled', () => {
  const group = new FakeEl({ class: 'ui-segmented', role: 'radiogroup' });
  const opts = ['a', 'b'].map((v, i) => new FakeEl({ class: 'ui-segmented__option', 'data-value': v, 'aria-checked': String(i === 0) }));
  group.children.push(...opts);
  const seen = [];
  bindSegmented(group, { onChange: (value) => seen.push(value), horizontal: true });
  const down = opts[0].fire('keydown', { key: 'ArrowDown' });
  assert.equal(down.prevented, undefined, 'Down is not taken: the shell moves focus with it');
  assert.deepEqual(seen, []);
  const right = opts[0].fire('keydown', { key: 'ArrowRight' });
  assert.ok(right.prevented);
  assert.deepEqual(seen, ['b']);
});

// ---------------------------------------------------------------- the back key hint inside every Back

// Each button Esc triggers carries its back key hint inside it; the pause card's Main menu has none (Esc
// resumes there), and no text "Esc: Back" hint remains.
test('each Back that Esc triggers holds its back key hint, and no "Esc: Back" text hint remains', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /data-esc-hint|Esc: Back/, 'no text hint');
  assert.doesNotMatch(read('css/style.css'), /data-esc-hint|\.esc-row/);
  assert.doesNotMatch(THEME_RAW, /data-esc-hint|\.esc-row/);
  assert.match(html, /id="p-menu"[^>]*>Main menu<\/button>/, 'none in the pause card\'s Main menu, where Esc resumes');
  for (const id of ['c2d-choice-back', 'board-choice-back', 'daily-back', 'coming-soon-menu', 'r-menu', 'settings-back', 'ctx-lost-menu']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>Main menu <span class="ui-key-hint" data-action="back" aria-hidden="true"></span></button>`), `the Back holds its key hint (#${id})`);
  }
  for (const id of ['coming-soon-back', 'records-back', 'rp-back', 'replay-message-back', 'ready-back']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>Back <span class="ui-key-hint" data-action="back" aria-hidden="true"></span></button>`), `so does a Back that returns one step (#${id})`);
  }
  assert.match(read('js/ui.js'), /for \(const id of \[[^\]]*'ready', 'learn-end', 'ctx-lost'[^\]]*\]\) showKeyHints\(/, 'the ready, Learn 3D end and context-lost cards\' key hints follow the device');
});

test('one vocabulary: Back returns one step, Main menu goes to the menu, and no Back to menu label remains', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /Back to menu/);
  for (const id of ['c2d-offer-menu', 'm3d-offer-menu', 'p-menu']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>Main menu</button>`), `#${id} reads Main menu`);
  }
  assert.match(html, /id="ctx-lost-menu"[^>]*>Main menu </, '#ctx-lost-menu reads Main menu');
  assert.match(html, /id="r-menu"[^>]*>Main menu </, '#r-menu reads Main menu');
  for (const f of ['js/ui.js', 'js/main.js', 'js/settings/bindings.js', 'js/settings/page.js', 'js/shell/pause.js', 'js/results/view.js', 'dev/components.html']) {
    assert.doesNotMatch(read(f), /Back to menu/, `${f} says Main menu`);
  }
});

test('Restart discards an unfinished game; Play again starts the same choice once it ended; the help names only the restart keys', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /this\.el\.restartLabel\.textContent = ended \? 'Play again' : 'Restart';/, 'the pause card swaps them on the moment');
  assert.match(read('js/shell/pause.js'), /message: 'Restart this game\? It will count as a loss\.', confirmLabel: 'Restart'/);
  assert.match(read('js/shell/pause.js'), /'Leave this game for the main menu\? It will count as a loss\.'/);
  assert.match(read('index.html'), /id="r-again"[^>]*>Play again </);
  const lines = read('js/settings/bindings.js').split('\n').filter((l) => /Restart|Play again|New game/.test(l));
  assert.ok(lines.length > 0 && lines.every((l) => /^\s*\['(\[F2\]|\{start\} \+ \{y\})', 'Restart: a new board of the same choice'\],$/.test(l)),
    'only the F2 and Start + Y rows name a restart; no help line names Play again or a new game');
});

test('in a browser, every Back that Esc triggers shows its Esc key hint, and no text hint shows', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    // Each board choice's frame carries its key hint inside its Back, a kit key hint, and no text hint.
    for (const [entry, back] of [['classic-2d', 'c2d-choice-back'], ['3d', 'board-choice-back']]) {
      await page.click(`#menu-entry-${entry}`);
      assert.equal(await page.evaluate((id) => document.querySelector(`#${id} .ui-key-hint__key`)?.textContent, back), 'Esc');
      assert.equal((await page.evaluate(measureContrast)).runs.filter((r) => r.text === 'Esc: Back').length, 0);
      if (entry === 'classic-2d') await page.keyboard.press('Escape');
    }
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'ready');
    assert.equal(await page.evaluate(() => document.querySelector('#ready-back .ui-key-hint__key')?.textContent), 'Esc', 'the ready card\'s Back carries its key hint');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    await page.click('#menu-entry-settings');
    assert.equal(await page.evaluate(() => document.querySelector('#settings-back .ui-key-hint__key')?.textContent), 'Esc', 'Settings\' frame carries its key hint inside its Back');
    assert.equal((await page.evaluate(measureContrast)).runs.filter((r) => r.text === 'Esc: Back').length, 0);
    await page.keyboard.press('Escape');
    await page.click('#menu-entry-records');
    assert.equal(await page.evaluate(() => document.querySelector('#records-back .ui-key-hint__key')?.textContent), 'Esc', 'Records\' frame carries its key hint inside its Back');
    assert.equal((await page.evaluate(measureContrast)).runs.filter((r) => r.text === 'Esc: Back').length, 0);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- one selected control

test('one selected control: a moving mouse focuses the enabled button, menu entry or board option under it, without scrolling', () => {
  assert.equal(SELECT_ON_HOVER, SELECTABLE);
  const doc = { activeElement: null };
  const control = (attrs = {}) => {
    const el = new FakeEl(attrs);
    el.ownerDocument = doc;
    el.closest = (sel) => (sel === SELECT_ON_HOVER ? el : null);
    el.focus = (opts) => { el.focusedWith = opts; doc.activeElement = el; };
    return el;
  };
  const a = control({ class: 'ui-button' });
  const b = control({ class: 'ui-menu__item' });
  const off = control({ class: 'ui-button', disabled: '' });
  const current = control({ class: 'ui-button', 'aria-disabled': 'true' });
  const toggle = control({ class: 'ui-button', 'data-no-focus': '' });
  const plain = { closest: () => null };
  const root = new FakeEl();
  const unbind = bindSelectOnHover(root);
  assert.equal(root.listeners.mousemove.length, 1, 'one delegated listener on the root');
  const move = (target, x, y) => root.fire('mousemove', { target, clientX: x, clientY: y });

  move(a, 10, 10);
  assert.equal(doc.activeElement, a, 'the mouse moving over a button focuses it');
  assert.deepEqual(a.focusedWith, { preventScroll: true }, 'without scrolling the page');
  doc.activeElement = b; // a key or controller press moves the focus on
  move(a, 10, 10);
  assert.equal(doc.activeElement, b, 'a move that did not move the pointer selects nothing: the resting pointer\'s control stays unselected');
  move(a, 11, 10);
  assert.equal(doc.activeElement, a, 'the next real move re-selects the control under the pointer');
  move(b, 12, 40);
  assert.equal(doc.activeElement, b, 'a menu entry or board option too');
  move(off, 13, 70);
  move(current, 14, 70);
  move(toggle, 15, 70);
  move(plain, 16, 70);
  assert.equal(doc.activeElement, b, 'a disabled control, a control that never takes focus, or no control, takes none');
  const entryOff = control({ class: 'ui-mode-entry', 'aria-disabled': 'true' });
  entryOff.matches = (sel) => sel === '.ui-mode-entry';
  move(entryOff, 17, 90);
  assert.equal(doc.activeElement, entryOff, 'a disabled mode entry is still selected: it shows its preview and opens nothing');
  unbind();
  assert.equal(root.listeners.mousemove.length, 0, 'unbound');
});

test('the page and the gallery install the one listener once; no screen wires it itself', () => {
  const install = /import \{ bindSelectOnHover \} from '\.{1,2}\/js\/ui\/components\.js';\s*bindSelectOnHover\(document\);/;
  assert.match(read('index.html'), install, 'index.html installs it on the document');
  assert.match(GALLERY, /bindSelectOnHover\(document\)/, 'the gallery installs it on the document');
  const callers = ['js/main.js', 'js/ui.js', 'js/shell/router.js', 'js/shell/menu.js', 'js/records/screen.js', 'js/settings/page.js', 'js/mode3d/board-choice.js']
    .filter((f) => /bindSelectOnHover|mouseenter|mouseover/.test(read(f)));
  assert.deepEqual(callers, [], 'no screen moves the focus on hover itself');
});

test('in a browser, the mouse selects a button by focusing it, keys move the selection away from a resting pointer, and pressed differs from selected', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    const [first, second] = ['#g-results .ui-actions:last-child button:nth-child(1)', '#g-results .ui-actions:last-child button:nth-child(2)'];
    await page.locator(first).scrollIntoViewIfNeeded();
    const look = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      const c = getComputedStyle(el);
      return { focused: document.activeElement === el, transform: c.transform, shadow: c.boxShadow, outline: c.outlineStyle };
    }, sel);
    const settle = () => page.waitForTimeout(250);
    const box = await page.locator(first).boundingBox();
    const rest = await look(first);
    assert.equal(rest.focused, false);

    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await settle();
    const selected = await look(first);
    assert.equal(selected.focused, true, 'moving the mouse over a button focuses it');
    assert.notEqual(selected.transform, rest.transform, 'it shows the selected look');
    assert.equal(selected.outline, 'none', 'no outline is drawn');

    await page.keyboard.press('Tab');
    await settle();
    const moved = await look(second);
    assert.equal(moved.focused, true, 'Tab moves the focus to the next button');
    assert.equal(moved.transform, selected.transform, 'which shows the selected look');
    assert.equal(moved.outline, 'none', 'no outline is drawn');
    const left = await look(first);
    assert.equal(left.focused, false);
    assert.equal(left.transform, rest.transform, 'the button under the resting pointer no longer looks selected');
    assert.equal(left.shadow, rest.shadow);

    await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2);
    await settle();
    assert.equal((await look(first)).focused, true, 'moving the mouse again re-selects the button under it');
    assert.equal((await look(second)).transform, rest.transform, 'one control looks selected at a time');

    await page.mouse.down();
    await settle();
    const pressed = await look(first);
    assert.notDeepEqual([pressed.transform, pressed.shadow], [selected.transform, selected.shadow], 'pressed differs from selected');
    assert.equal(pressed.outline, 'none');
    await page.mouse.up();
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('initComponents binds every slider and segmented group under a root', () => {
  const root = new FakeEl();
  const slider = new FakeEl({ class: 'ui-slider' });
  const input = new FakeEl({ class: 'ui-slider__input', value: '3' });
  const output = new FakeEl({ class: 'ui-slider__value' });
  slider.children.push(input, output);
  const group = new FakeEl({ class: 'ui-segmented' });
  const opt = new FakeEl({ class: 'ui-segmented__option', 'aria-checked': 'true', 'data-value': 'a' });
  group.children.push(opt);
  root.children.push(slider, group);
  const unbind = initComponents(root);
  assert.equal(output.textContent, '3');
  assert.equal(opt.tabIndex, 0);
  assert.equal(typeof unbind, 'function');
});

// ---------------------------------------------------------------- pager, stat tile and columns

const numbersOf = (state) => state.numbers.map((n) => n.page);

test('pagerState: First, at most five numbered pages around the current one, Last; hidden on one page', () => {
  assert.equal(PAGER_WINDOW, 5);
  for (const pages of [0, 1]) assert.equal(pagerState(0, pages).hidden, true, `${pages} page(s): no pager`);
  const three = pagerState(0, 3);
  assert.equal(three.hidden, false);
  assert.deepEqual(numbersOf(three), [0, 1, 2]);
  assert.deepEqual(three.numbers.map((n) => [n.label, n.current]), [['1', true], ['2', false], ['3', false]]);
  assert.deepEqual([three.first, three.last], [{ page: 0, disabled: true }, { page: 2, disabled: false }]);
  assert.deepEqual(numbersOf(pagerState(5, 20)), [3, 4, 5, 6, 7], 'centred on the current page');
  assert.deepEqual(numbersOf(pagerState(0, 20)), [0, 1, 2, 3, 4]);
  assert.deepEqual(numbersOf(pagerState(1, 20)), [0, 1, 2, 3, 4], 'held at the start');
  assert.deepEqual(numbersOf(pagerState(19, 20)), [15, 16, 17, 18, 19], 'held at the end');
  const end = pagerState(19, 20);
  assert.deepEqual([end.first.disabled, end.last.disabled], [false, true]);
  assert.equal(end.numbers.find((n) => n.current).page, 19);
  assert.equal(pagerState(25, 20).page, 19, 'a page past the end is the last');
  assert.equal(pagerState(-3, 20).page, 0);
  assert.ok(pagerState(50, 100).numbers.length <= PAGER_WINDOW, 'a long history keeps one pager row');
});

test('the stat tile, the pager and the column composition are laid out from the spacing tokens and styled by the theme', () => {
  const tile = rulesFor('.ui-stat--tile').map(([, b]) => b).join('');
  assert.match(tile, /padding:\s*var\(--space-/);
  assert.match(themeRulesFor('.ui-stat--tile').map(([, b]) => b).join(''), /(background|box-shadow)[^;]*var\(--color-/, 'the theme draws the tile');
  const figure = rulesFor('.ui-stat--tile .ui-stat__value').map(([, b]) => b).join('');
  assert.match(figure, /font-size:[^;]*var\(--font-size-[^;]*var\(--font-size-/, 'the figure scales between two token sizes');
  assert.match(figure, /white-space:\s*nowrap/, 'the figure keeps one line');
  assert.match(tile, /min-width:\s*max-content/, 'a tile never narrows past its figure');
  for (const m of (tile + figure + rulesFor('.ui-stat-row--tiles').map(([, b]) => b).join('')).matchAll(/(padding|gap|font-size|min-width)\s*:\s*([^;]+)/g)) {
    assert.doesNotMatch(m[2], /\d+(px|rem|em)\b/, `${m[1]}: ${m[2]} — tile sizes come from the tokens`);
  }
  const current = themeRulesFor('.ui-pager').filter(([sel]) => sel.includes('aria-current="page"'));
  assert.ok(current.length > 0, 'the current page has its own styling');
  assert.ok(rulesFor('.ui-columns').some(([, b]) => /gap:\s*var\(--space-/.test(b)), 'column spacing from the tokens');
});

test('the column composition has one breakpoint, 1024 px, stated once, used by Records and Settings', () => {
  const breakpoints = [...CSS.matchAll(/@media[^{]*min-width:\s*(\d+)px/g)].map((m) => m[1]);
  assert.deepEqual(breakpoints, ['1024'], 'one breakpoint block in the kit');
  assert.doesNotMatch(read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, ''), /min-width:\s*1024px/, 'no second copy in the shell stylesheet');
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-columns[\s\S]*1024 px/, 'the catalogue states the breakpoint');
  assert.match(INDEX, /<section class="ui-frame" id="records-frame" aria-labelledby="records-title">[\s\S]*?<div class="ui-columns ui-columns--two" id="records-columns">/);
  const block = CSS.slice(CSS.indexOf('@media (min-width: 1024px)'));
  assert.match(block.slice(0, block.indexOf('\n}')), /#records-columns \{ grid-template-columns: [^}]+ auto [^}]+; \}/, 'Records\' rule between its columns, inside the one breakpoint');
  assert.match(INDEX, /<section class="ui-frame" id="settings-frame" aria-labelledby="settings-title">[\s\S]*?<div class="ui-frame__body" id="settings-body"><\/div>/);
  assert.match(block.slice(0, block.indexOf('\n}')), /#settings-columns \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/, 'Settings\' two columns, inside the one breakpoint');
});

test('the gallery shows the stat tile, the pager in each state and the column composition', () => {
  assert.ok(TAGS.some((t) => hasClasses(t, '.ui-stat.ui-stat--tile')), 'a stat tile');
  const tiles = section(GALLERY, '<!-- component: stat tile -->', '<!-- /component: stat tile -->');
  assert.match(tiles, /ui-stat__detail[\s\S]*Watch/, 'a tile with its date and Watch');
  assert.match(tiles, /&mdash;/, 'a best not yet set');
  assert.match(tiles, /999\.999 s[\s\S]*99\.99[\s\S]*100\.0%/, 'the longest figures');
  const pagers = section(GALLERY, '<!-- component: pager -->', '<!-- /component: pager -->');
  for (const state of ['First page', 'Middle page', 'Last page', 'Long history']) assert.ok(pagers.includes(state), `pager: ${state}`);
  assert.match(pagers, /aria-current="page"/);
  assert.match(pagers, /<button type="button" class="ui-button ui-button--secondary ui-pager__button"[^>]* disabled>First<\/button>/);
  assert.ok(TAGS.some((t) => hasClasses(t, '.ui-columns')), 'the column composition');
  assert.ok(TAGS.some((t) => hasClasses(t, '.ui-columns.ui-columns--pair')), 'the column composition in an equal pair');
});

test('the equal pair of columns sits inside the one breakpoint and is catalogued; Records lays its two charts in it', () => {
  const block = CSS.slice(CSS.indexOf('@media (min-width: 1024px)'));
  assert.match(block.slice(0, block.indexOf('\n}')), /\.ui-columns--pair \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); \}/);
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-columns--pair in\s+two equal ones/);
  assert.match(INDEX, /<div id="records-charts" class="ui-columns ui-columns--pair">\s*<canvas id="records-chart"[^>]*>[^<]*<\/canvas>\s*<canvas id="records-best-chart"/);
});

test('the helper module keeps DOM access out of its logic and imports nothing', () => {
  const src = read('js/ui/components.js');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /\b(document|window)\./, 'DOM is reached only through the elements passed in');
});

// ---------------------------------------------------------------- browser: screenshots and contrast

// The element screenshots are artefacts for a person to look at: taken only with MS_SHOTS=1 set.
// ---------------------------------------------------------------- coarse pointers

// The bodies of the stylesheet's (pointer: coarse) media blocks, comments stripped.
function coarseBlocks(css) {
  const out = [];
  const re = /@media\s*\(pointer:\s*coarse\)\s*\{/g;
  let m;
  while ((m = re.exec(css))) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < css.length && depth; i++) depth += css[i] === '{' ? 1 : css[i] === '}' ? -1 : 0;
    out.push(css.slice(re.lastIndex, i - 1));
  }
  return out.join('\n');
}
// The rules outside every @media block.
function topLevel(css) {
  let out = '';
  let depth = 0;
  let inMedia = 0;
  for (let i = 0; i < css.length; i++) {
    if (css.startsWith('@media', i) && depth === 0) inMedia = 1;
    const ch = css[i];
    if (ch === '{') depth += 1;
    if (!inMedia) out += ch;
    if (ch === '}') { depth -= 1; if (depth === 0) inMedia = 0; }
  }
  return out;
}

test('coarse pointers get 44 px switch and slider targets inside (pointer: coarse) only; 12 px labels and 11 px key caps sit in the top-level rules', () => {
  const coarse = rules(coarseBlocks(CSS));
  const has = (needle, prop) => coarse.some(([sel, body]) => sel.includes(needle) && body.includes(prop));
  assert.ok(has('.ui-toggle__input', '44px'), 'a 44 px switch hit area');
  assert.ok(has('.ui-slider__input', '44px'), 'a 44 px slider');
  assert.ok(has('::-webkit-slider-thumb', '44px') || has('.ui-slider__input', 'height: 44px'), 'a 44 px slider thumb hit area');
  assert.ok(!coarse.some(([sel]) => sel.includes('.ui-stat__label')), 'the label size is no coarse-only rule');
  const label = rules(topLevel(CSS)).filter(([s]) => s.trim() === '.ui-stat__label').map(([, b]) => b).join(';');
  assert.match(label, /font-size:\s*12px/, 'labels at 12 px on every pointer');
  const styleCoarse = rules(coarseBlocks(STYLE));
  assert.ok(!styleCoarse.some(([sel]) => /\bkbd\b/.test(sel)), 'the key cap size is no coarse-only rule');
  const kbd = rules(topLevel(STYLE)).filter(([s]) => s.trim() === 'kbd').map(([, b]) => b).join(';');
  assert.match(kbd, /font(-size)?:[^;]*max\(11px,\s*0\.78em\)/, 'key caps at 11 px or more on every pointer');
  assert.ok(styleCoarse.some(([sel, body]) => sel.includes('#hud-tap') && body.includes('44px')), 'the Reveal / Flag switch\'s 44 px hit area');
  assert.ok(styleCoarse.some(([sel, body]) => sel.trim() === '#hud-swap' && /display:\s*none/.test(body)), 'no Swap clicks on a coarse-only device');
});

test('the Classic 2D overlay bar wraps inside the widest panel, whatever its place; Swap clicks hides only under the coarse rule', () => {
  const top = rules(topLevel(STYLE));
  const bar = top.filter(([s]) => s.trim() === '#hud.hud--2d .hud-bar').map(([, b]) => b).join(';');
  assert.match(bar, /flex-wrap:\s*wrap/);
  assert.match(bar, /width:\s*max-content/, 'its width never depends on its left offset');
  assert.match(bar, /max-width:\s*calc\(100vw - 2 \* var\(--space-4\) - 18px\)/, 'the board area less the panel inset on each side');
  const hides = top.filter(([s, b]) => s.includes('#hud-swap') && /display:\s*none/.test(b)).map(([s]) => s.trim());
  assert.deepEqual(hides, ['#hud:not(.hud--2d) #hud-swap'], 'a fine pointer still shows it in Classic 2D');
});

test('on a fine pointer every hit area the coarse rules touch is as it was', () => {
  const top = rules(topLevel(CSS));
  const body = (sel) => top.filter(([s]) => s === sel).map(([, b]) => b).join(';');
  assert.match(body('.ui-toggle__input'), /width: 44px;[\s\S]*height: 24px;/);
  assert.match(body('.ui-slider__input'), /height: 28px;/);
  assert.match(body('.ui-slider__input::-webkit-slider-thumb'), /width: 20px;[\s\S]*height: 20px;/);
  assert.doesNotMatch(topLevel(CSS), /\.ui-toggle__input::after\s*\{/, 'the 44 px switch square only under the coarse rule');
  assert.doesNotMatch(topLevel(STYLE), /#hud-tap[^{]*\{[^}]*display:\s*(inline-)?(flex|block)/, 'the switch shows only under the coarse rule');
  assert.doesNotMatch(topLevel(STYLE), /#touch-modes \.ui-button[^{]*\{[^}]*44px/, 'the touch toolbar keeps its fine-pointer size');
});

// The 3D touch-controls layer in index.html: the view-modes toolbar and the stick.
const TOUCH = INDEX.slice(INDEX.indexOf('<div id="touch-3d"'), INDEX.indexOf('<!-- end of touch controls -->'));

test('the 3D touch toolbar: three toggle buttons of the kit, Shift, Space and Ctrl, each with aria-pressed, inside the HUD', () => {
  assert.ok(TOUCH.length > 0, 'index.html holds the touch-controls layer');
  assert.ok(INDEX.indexOf('<div id="touch-3d"') > INDEX.indexOf('<div id="hud"') && INDEX.indexOf('<div id="touch-3d"') < INDEX.indexOf('<!-- Controls help'), 'inside the HUD, under the overlay bar\'s pause');
  const t = tags(TOUCH);
  const bar = t.find((x) => x.attrs.id === 'touch-modes');
  assert.ok(bar && bar.attrs.role === 'toolbar' && bar.attrs['aria-label'], 'a named toolbar');
  const buttons = t.filter((x) => x.tag === 'button');
  assert.deepEqual(buttons.map((b) => b.attrs['data-mode']), ['shift', 'space', 'ctrl']);
  for (const b of buttons) {
    assert.ok(hasClasses(b, '.ui-button.ui-button--secondary'), 'a kit button');
    assert.equal(b.attrs.type, 'button');
    assert.equal(b.attrs['aria-pressed'], 'false', 'a toggle, off at first');
  }
  assert.match(TOUCH, />Shift</); assert.match(TOUCH, />Space</); assert.match(TOUCH, />Ctrl</);
  const stick = t.find((x) => x.attrs.id === 'touch-stick');
  assert.ok(stick && stick.attrs['aria-hidden'] === 'true', 'the stick is decoration');
  assert.ok(t.some((x) => x.attrs.id === 'touch-stick-knob'));
});

test('touch play: the toolbar and the stick show only in touch play, the toolbar\'s buttons 44 px on a coarse pointer, its pressed state visible', () => {
  const style = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const top = rules(topLevel(style));
  const body = (needle) => top.filter(([sel]) => sel.includes(needle)).map(([, b]) => b).join(';');
  assert.match(body('#touch-3d'), /display:\s*none/, 'hidden unless in touch play');
  assert.match(style, /body\.touch-play #touch-3d\s*\{[^}]*display:\s*block/, 'shown in touch play');
  assert.match(themeRulesFor('.ui-button--secondary[aria-pressed="true"]').map(([, b]) => b).join(';'), /background:\s*var\(--color-blue\)/, 'the pressed state is visible');
  assert.match(style, /body\.touch-play #scene\s*\{[^}]*touch-action:\s*none/, 'no browser scroll or zoom on the scene in touch play');
  assert.match(style, /body\.touch-play #scene\s*\{[^}]*user-select:\s*none/, 'no text selection');
  assert.match(style, /body\.touch-play #scene\s*\{[^}]*-webkit-touch-callout:\s*none/, 'no long-press menu');
  assert.match(body('#touch-stick'), /pointer-events:\s*none/, 'the stick takes no touch');
  const coarse = rules(coarseBlocks(style));
  assert.ok(coarse.some(([sel, b]) => sel.includes('#touch-modes .ui-button') && /min-width:\s*44px/.test(b) && /min-height:\s*44px/.test(b)), 'the toolbar\'s 44 px hit areas');
  assert.ok(coarse.some(([sel, b]) => sel.includes('#hud-pause::after') && /height:\s*44px/.test(b)), 'the pause button takes a touch in a 44 px band, the bar\'s layout unchanged');
  assert.doesNotMatch(topLevel(style), /#hud-pause[^{]*\{[^}]*44px/, 'a fine pointer keeps the pause button\'s size');
});

test('the gallery shows the touch toolbar, a toggle pressed, and the stick', () => {
  const bar = TAGS.find((t) => t.attrs.class?.split(/\s+/).includes('touch-modes'));
  assert.ok(bar, 'the gallery shows the toolbar');
  const buttons = TAGS.filter((t) => t.tag === 'button' && t.index > bar.index && t.attrs['data-mode']);
  assert.ok(buttons.length >= 3);
  assert.ok(buttons.some((b) => b.attrs['aria-pressed'] === 'true'), 'a latched mode');
  assert.ok(TAGS.some((t) => t.attrs.class?.split(/\s+/).includes('touch-stick')), 'the gallery shows the stick');
});

test('in a browser with touch, switches, sliders, labels and key caps reach their coarse sizes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true });
    const page = await context.newPage();
    await page.goto(`${base}/dev/components.html`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const sizes = await page.evaluate(() => {
      // The hit area: whether the control is the element under each point 21 px from its centre,
      // on a switch standing alone (the gallery stacks its states closer than a finger).
      const alone = document.createElement('label');
      alone.className = 'ui-toggle';
      alone.style.cssText = 'position: fixed; left: 100px; top: 100px; z-index: 99';
      alone.innerHTML = '<input type="checkbox" role="switch" class="ui-toggle__input" id="alone-switch"><span class="ui-toggle__label">Alone</span>';
      document.body.append(alone);
      const reach = (sel) => {
        const e = document.querySelector(sel);
        const r = e.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        return [[cx, cy - 21], [cx, cy + 21], [cx - 21, cy], [cx + 21, cy]].every(([x, y]) => document.elementFromPoint(x, y) === e);
      };
      return {
        toggle: reach('#alone-switch'),
        slider: document.querySelector('.ui-slider__input').getBoundingClientRect().height,
        label: parseFloat(getComputedStyle(document.querySelector('.ui-stat__label')).fontSize),
      };
    });
    assert.ok(sizes.toggle, 'the switch takes a touch anywhere in a 44 px square around its centre');
    assert.ok(sizes.slider >= 44, `slider ${sizes.slider}`);
    assert.ok(sizes.label >= 12, `label ${sizes.label}`);
    await page.goto(`${base}/index.html?still-backdrop`);
    const kbd = await page.evaluate(() => {
      const k = document.createElement('kbd');
      k.textContent = 'H';
      document.getElementById('pause').append(k);
      return parseFloat(getComputedStyle(k).fontSize);
    });
    assert.ok(kbd >= 11, `key cap ${kbd}`);
  } finally {
    await browser.close();
  }
});

test('in a browser with a mouse, labels and key caps reach their minimum sizes and the hit areas keep their fine sizes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
    await page.goto(`${base}/dev/components.html`);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const sizes = await page.evaluate(() => ({
      fine: matchMedia('(pointer: fine)').matches,
      label: parseFloat(getComputedStyle(document.querySelector('.ui-stat__label')).fontSize),
      slider: document.querySelector('.ui-slider__input').getBoundingClientRect().height,
      toggleHit: getComputedStyle(document.querySelector('.ui-toggle__input'), '::after').content,
    }));
    assert.ok(sizes.fine, 'a fine pointer');
    assert.equal(sizes.label, 12, `label ${sizes.label}`);
    assert.equal(sizes.slider, 28, `slider ${sizes.slider}`);
    assert.equal(sizes.toggleHit, 'none', 'no 44 px switch square');
    await page.goto(`${base}/index.html?still-backdrop`);
    const kbd = await page.evaluate(() => {
      const k = document.createElement('kbd');
      k.textContent = 'H';
      document.getElementById('pause').append(k);
      return { size: parseFloat(getComputedStyle(k).fontSize), tap: getComputedStyle(document.getElementById('hud-tap')).display };
    });
    assert.ok(kbd.size >= 11, `key cap ${kbd.size}`);
    assert.equal(kbd.tap, 'none', 'no Reveal / Flag switch for a mouse');
  } finally {
    await browser.close();
  }
});

const SHOTS = process.env.MS_SHOTS === '1';

// Runs in the page: every visible text run with its colour composited over
// its effective background, and the contract threshold it must meet.
function measureContrast() {
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

// A focused control's look: a button, menu entry or board option shows its selected state (moved level
// with the surface, no outline); any other control a focus ring.
const focusShows = (f) => (f.selectable ? f.style === 'none' && f.transform !== 'none' : f.style !== 'none' && f.width >= 2);

test('in a browser, the gallery renders in Joyful tiles, with its fonts, and its text meets the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-components-')) : null;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    const failed = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('requestfailed', (r) => failed.push(r.url()));
    await page.goto(`${base}/dev/components.html`);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'joyful-tiles');
    await page.evaluate(() => document.fonts.ready);
    const fonts = await page.evaluate(() => ['500 16px Rubik', '800 16px Rubik', '700 16px "JetBrains Mono"'].map((f) => document.fonts.check(f)));
    assert.deepEqual(fonts, [true, true, true], 'Rubik and JetBrains Mono load from the theme\'s files');
    assert.match(await page.evaluate(() => getComputedStyle(document.body).fontFamily), /^Rubik/);
    if (SHOTS) await page.screenshot({ path: join(shots, 'components-joyful-tiles.png'), fullPage: true });
    const { runs, focus } = await page.evaluate(measureContrast);
    assert.ok(runs.length > 40, `the gallery shows its text (${runs.length} runs)`);
    const failing = runs.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
    assert.deepEqual(failing, [], 'text below the contrast contract');
    assert.ok(focus.length >= 6, 'every interactive component is shown focused');
    for (const f of focus) assert.ok(focusShows(f), `${f.cls} shows its focused state (${f.style} ${f.width} ${f.transform})`);
    assert.deepEqual(failed, [], 'no file fails to load');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the overlay bar over the 3D scene meets the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-overlay-')) : null;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.evaluate(() => { globalThis.__ms.start(9, 9, 9, 10); globalThis.__ms.forcePlay(); });
    // A running time past the display limit: the overlay stops at 999, the game keeps the real time.
    await page.evaluate(() => { globalThis.__ms.state.time = 1234.5; });
    await page.waitForFunction(() => document.getElementById('hud-time').textContent === '999');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.time), 1234.5);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (SHOTS) {
      await page.locator('#hud .ui-overlay-bar').screenshot({ path: join(shots, 'overlay.png') });
      await page.screenshot({ path: join(shots, 'overlay-scene.png') });
    }
    const background = await page.evaluate(() => getComputedStyle(document.querySelector('#hud .ui-overlay-bar')).backgroundColor);
    assert.match(background, /^rgb\(/, `the overlay surface is opaque (${background})`);
    const { runs: text } = await page.evaluate(measureContrast);
    const own = await page.evaluate(() => [...document.querySelectorAll('#hud .ui-overlay-bar *')]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => e.textContent.trim().slice(0, 30)));
    const barRuns = text.filter((r) => own.includes(r.text));
    assert.ok(barRuns.length >= 4, `the overlay shows its labels and values (${barRuns.length})`);
    const failing = barRuns.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
    assert.deepEqual(failing, [], 'overlay text below the contrast contract');
    // The pause button pauses the game.
    await page.click('#hud-pause');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// The cards over the 3D scene (J-Ready-xl, -m, -p, -ls and J-Ready-states): readable on their surface and never
// wider than the window, at the large and small desktop sizes and on a phone held either way.
test('in a browser, the 3D ready card, its lock states, the Learn 3D end cards and the context-lost card fit every window size without a sideways scroll and meet the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const SIZES = [
    ['xl', { viewport: { width: 1920, height: 1080 } }],
    ['m', { viewport: { width: 1024, height: 768 } }],
    ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
    ['ls', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }],
  ];
  try {
    for (const [size, device] of SIZES) {
      const context = await browser.newContext(device);
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (e) => errors.push(e.message));
        // Every pointer-lock request refused, so the lock states show.
        await page.addInitScript(() => {
          Element.prototype.requestPointerLock = function requestPointerLock() {
            setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
            return Promise.reject(new Error('blocked'));
          };
        });
        await page.goto(`${base}/index.html?still-backdrop`);
        await page.waitForFunction(() => globalThis.__ms !== undefined);
        const ms = (fn, arg) => page.evaluate(fn, arg);
        const check = async (selector, label) => {
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
        };
        const touch = !!device.hasTouch;
  
        await ms(() => globalThis.__ms.modes.start('3d', { X: 8, Y: 8, Z: 8, mines: 40 }));
        await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
        assert.equal(await ms(() => document.querySelector('#ready-btn .ready-title').textContent), touch ? 'Tap to play' : 'Click to play');
        assert.equal(await ms(() => !document.getElementById('ready-rules').classList.contains('hidden')), true, 'the first-use card');
        await check('#ready .ui-card', `ready-${size}`);
        if (!touch) {
          await ms(() => document.getElementById('ready-btn').click());
          await page.waitForFunction(() => document.getElementById('ready-msg').textContent !== '');
          await page.waitForTimeout(50);
          await check('#ready .ui-card', `ready-refused-${size}`);
          await ms(() => document.getElementById('ready-btn').click());
          await page.waitForFunction(() => !document.getElementById('ready-blocked').classList.contains('hidden'));
          await check('#ready .ui-card', `ready-blocked-${size}`);
        }
  
        // The Learn 3D end cards: a lost lesson, then a won one.
        for (const won of [false, true]) {
          await ms(() => { globalThis.__ms.learn(); globalThis.__ms.forcePlay(); });
          await ms(() => globalThis.__ms.state.play.reveal(globalThis.__ms.learnBoard.startCell));
          await page.waitForFunction(() => globalThis.__ms.state.started);
          await ms((w) => {
            const g = globalThis.__ms.game;
            const mines = [...globalThis.__ms.learnBoard.minePositions];
            if (!w) globalThis.__ms.state.play.reveal(mines[0]);
            else for (let c = 0; c < g.n; c++) if (!mines.includes(c) && !g.pressed[c]) globalThis.__ms.state.play.reveal(c);
          }, won);
          await page.waitForFunction(() => globalThis.__ms.state.mode === 'learn-end', null, { timeout: 15000 });
          assert.equal(await ms(() => document.getElementById('learn-end-primary-label').textContent), won ? 'Play Cube Intro' : 'Try again');
          await check('#learn-end .ui-card', `learn-end-${won ? 'won' : 'lost'}-${size}`);
        }
  
        // The context-lost card, last: the canvas does not come back.
        await ms(() => { globalThis.__ms.modes.start('3d', { X: 3, Y: 3, Z: 3, mines: 1 }); globalThis.__ms.forcePlay(); });
        await ms(() => globalThis.__ms.renderer.renderer.getContext().getExtension('WEBGL_lose_context').loseContext());
        await page.waitForFunction(() => globalThis.__ms.state.mode === 'ctxlost');
        await check('#ctx-lost .ui-card', `ctx-lost-${size}`);
        assert.deepEqual(errors, []);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

// The debug hook's surface, pinned so the screen rebuild leaves it unchanged.
const MS_HOOK = ['state', 'game', 'renderer', 'camera', 'fps', 'frameStats', 'spawnPose', 'THREE', 'start', 'learn', 'learnBoard', 'learnPrompts', 'forcePlay',
  'controls', 'pads', 'pause', 'cellCenter', 'moveTo', 'look', 'aimAt', 'mouseDown', 'mouseUp', 'click', 'key', 'wheel',
  'selected', 'pickBrute', 'pickWith', 'info', 'modes', 'pauser', 'settings', 'records', 'replayViewer', 'replays', 'board2D', 'game2D', 'watch', 'daily'];

test('in a browser, the menu, the pause card and the results layout meet the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-screens-')) : null;
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Contrast of the text inside one element, and the focus ring a keyboard focus draws there.
  const check = async (page, selector, label, minRuns = 5) => {
    await frames(page);
    if (SHOTS) await page.locator(selector).screenshot({ path: join(shots, `${label}.png`) });
    const { runs } = await page.evaluate(measureContrast);
    const own = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => e.textContent.trim().slice(0, 30)), selector);
    const mine = runs.filter((r) => own.includes(r.text));
    assert.ok(mine.length >= minRuns, `${label}: its text is measured (${mine.length})`);
    const failing = mine.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
    assert.deepEqual(failing, [], `${label}: text below the contrast contract`);
  };
  // The focused control's look once its move has settled.
  const ring = async (page) => {
    await page.waitForTimeout(250);
    return page.evaluate(() => {
      const el = document.activeElement;
      const s = getComputedStyle(el);
      return { id: el.id, selectable: el.matches('.ui-button, .ui-menu__item, .ui-mode-entry, .ui-option'), style: s.outlineStyle, width: parseFloat(s.outlineWidth), transform: s.transform };
    });
  };
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // A stand-in generation worker: one that never answers, then one that fails at once.
    let worker = 'hang';
    const WORKERS = {
      hang: 'self.onmessage = () => {};',
      fail: "self.onmessage = (e) => self.postMessage({ id: e.data.id, result: { ok: false, reason: 'budget', generatorVersion: 1 } });",
    };
    await page.route('**/js/generation/worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKERS[worker] }));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    assert.deepEqual(await page.evaluate(() => Object.keys(globalThis.__ms)), MS_HOOK, 'the __ms hook is unchanged');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    await check(page, '#menu', 'menu');
    // Keyboard focus shows its focused state on every control of the menu, in tab order.
    const menuControls = await page.evaluate(() => [...document.querySelectorAll('#menu button, #menu input, #menu a[href]')]
      .filter((e) => e.getBoundingClientRect().width > 0).length);
    // The menu opens with its default target focused: start the Tab walk from the menu layer's top instead.
    await page.mouse.click(2, 2);
    for (let i = 0; i < menuControls; i++) {
      await page.keyboard.press('Tab');
      const f = await ring(page);
      assert.ok(focusShows(f), `menu control #${f.id || i} shows its focused state (${f.style} ${f.width} ${f.transform})`);
    }

    // Each preview of the menu, readable: the cards' names and notes on the panel, the daily board's tag.
    for (const id of ['hexagon', 'records', 'quit', 'daily']) {
      await page.focus(`#menu-entry-${id}`);
      await check(page, '#menu-preview', `menu-preview-${id}`, 1);
    }

    // The Settings page in its frame, then its Controls panel: the theme's surface on its scrim, readable.
    await page.click('#menu-entry-settings');
    await check(page, '#settings-frame', 'settings');
    // The replay viewer in its frame: the figures, the board area and the controls, readable.
    await page.keyboard.press('Escape');
    await page.evaluate(async () => {
      const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer());
      globalThis.__ms.watch({ replay: bytes, returnTo: { screen: 'menu' } });
    });
    await page.waitForFunction(() => globalThis.__ms.replayViewer.state.status === 'ready');
    await check(page, '#replay-frame', 'replay');
    await page.evaluate(() => globalThis.__ms.replayViewer.command('end'));
    await check(page, '#replay-controls', 'replay-end');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    await page.click('#menu-entry-settings');
    await page.click('#set-controls');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), false);
    await check(page, '#controls-modal .modal-card', 'controls');
    await page.click('#controls-close');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), true);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The Records screen over a won and a lost game: its frame, figures, muted overall row and the outcome chips in
    // the games table, then the Leaderboards tab's coming-soon panel.
    await page.evaluate(() => {
      const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
      const board = { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false };
      for (const [id, outcome, endedAt] of [['c1', 'won', '2026-10-08T12:00:00.000Z'], ['c2', 'lost', '2026-10-09T12:00:00.000Z']]) {
        globalThis.__ms.records.record({ id, board, outcome, elapsedMs: 40000, bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 5, clicks,
          bbbvPerSecond: 0.5, efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      }
    });
    await page.click('#menu-entry-records');
    await check(page, '#records', 'records');
    await page.click('#records-tab-leaderboards');
    await check(page, '#records-leaderboards', 'records-leaderboards', 2);
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The Daily screen: its mode options with their chips and board lines, the selected mode's state, code chip and
    // bottom bar, then a coming-soon mode's card, readable.
    await page.click('#menu-entry-daily');
    await check(page, '#daily', 'daily');
    await page.click('#daily-entry-hexagon');
    await check(page, '#daily', 'daily-coming-soon');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The Classic 2D board choice in each of its selections, readable, its options showing their focused state.
    await page.click('#menu-entry-classic-2d');
    await check(page, '#c2d-choice', 'c2d-choice');
    await page.keyboard.press('ArrowDown');
    const opt = await ring(page);
    assert.ok(opt.selectable && focusShows(opt), `a board option shows its focused state (${opt.style} ${opt.transform})`);
    await page.click('#c2d-choice [data-size="custom"]');
    await page.fill('#c2d-mines', '999');
    await check(page, '#c2d-choice', 'c2d-choice-custom');
    await page.click('#c2d-choice [data-size="code"]');
    await page.fill('#c2d-code', 'nonsense');
    await check(page, '#c2d-choice', 'c2d-choice-code');
    await page.click('#c2d-choice-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // The placeholder in its frame, readable: Back focused, its key hint and the head's beside it.
    await page.click('#menu-entry-hexagon');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'coming-soon');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'coming-soon-back');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#coming-soon .ui-key-hint__key')].map((k) => k.textContent)), ['Esc', 'Esc']);
    await check(page, '#coming-soon', 'coming-soon', 3);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no horizontal scroll');
    await page.click('#coming-soon-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'the head\'s Main menu goes back');

    // The menu's demo board: the shell hands the renderer the theme's sky.
    const sky = await page.evaluate(() => globalThis.__ms.renderer.scenePalette);
    assert.deepEqual(sky.horizon, [0x2b, 0x3f, 0x8a], 'Joyful tiles\' sky');
    // The menu screens sit on the scene with no hard-coded tint.
    assert.equal(await page.evaluate(() => getComputedStyle(document.getElementById('menu')).backgroundColor), 'rgba(0, 0, 0, 0)');

    // The 3D board choice in each of its selections, readable, Learn 3D's option showing its focused state.
    await page.click('#menu-entry-3d');
    await check(page, '#board-choice', 'board-choice');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    const learnOpt = await ring(page);
    assert.equal(learnOpt.id, 'bc-learn');
    assert.ok(learnOpt.selectable && focusShows(learnOpt), `Learn 3D shows its focused state (${learnOpt.style} ${learnOpt.transform})`);
    await page.click('#bc-learn');
    await check(page, '#board-choice', 'board-choice-learn');
    await page.click('#board-choice [data-preset="custom"]');
    await page.fill('#c-y', '2');
    await page.fill('#c-m', '9999');
    await check(page, '#board-choice', 'board-choice-custom');
    await page.click('#board-choice [data-preset="code"]');
    await page.fill('#bc-code', 'nonsense');
    await check(page, '#board-choice', 'board-choice-code');
    await page.click('#board-choice-back');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');

    // menu → 3D board choice → ready → playing → pause, as before.
    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="6,6,6,10"]');
    await page.click('#bc-play');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'ready');
    await page.evaluate(() => globalThis.__ms.forcePlay());
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'playing');
    await page.click('#hud-pause');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-resume', 'Resume takes the focus');
    assert.ok(await page.evaluate(() => document.getElementById('p-resume').classList.contains('ui-button--primary')), 'Resume is the primary action');
    await check(page, '#pause-card', 'pause');
    await page.keyboard.press('Tab');
    const f = await ring(page);
    assert.ok(focusShows(f), `pause control #${f.id} shows its focused state`);
    // A 3D game's card, its longest controls list, fits the smallest desktop window unscrolled, and a phone with no horizontal scroll.
    for (const [width, height, fits] of [[1024, 768, true], [390, 844, false]]) {
      await page.setViewportSize({ width, height });
      const box = await page.evaluate(() => { const o = document.getElementById('pause'); return { sh: o.scrollHeight, ch: o.clientHeight, sw: document.documentElement.scrollWidth, w: innerWidth }; });
      if (fits) assert.ok(box.sh <= box.ch, `the pause card fits ${width} × ${height} (${box.sh} > ${box.ch})`);
      assert.ok(box.sw <= box.w, `no horizontal scroll at ${width} × ${height}`);
    }
    await page.setViewportSize({ width: 1100, height: 900 });
    assert.deepEqual(await page.evaluate(() => ['p-resume', 'p-home', 'p-restart', 'p-menu'].map((id) => document.querySelector(`#${id} .ui-key-hint__key`)?.textContent ?? null)),
      ['Esc', null, 'F2', null], 'Resume and Restart show the keys that work on the card');
    await page.click('#p-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Main menu returns to the menu');

    // A started game's Main menu asks first: the confirmation in place of the actions, readable.
    await page.evaluate(() => {
      globalThis.__ms.modes.start('3d', { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] });
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(3);
      globalThis.__ms.click('left');
      globalThis.__ms.pause();
    });
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    await page.click('#p-menu');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-confirm-no', 'Cancel takes the focus');
    assert.equal(await page.evaluate(() => document.getElementById('pause-actions').classList.contains('hidden')), true);
    await check(page, '#pause-confirm', 'pause-confirm', 3);
    await page.click('#p-confirm-yes');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'confirmed, the game is left');

    // The board status card: the generating card with its progress line, spinner, Cancel and Play a
    // standard board, then the failure offer with its three buttons, readable. Only a
    // no-guess board is generated by the worker.
    const firstClick = () => page.evaluate(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    await page.evaluate(() => { globalThis.__ms.modes.start('3d', { X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }); globalThis.__ms.forcePlay(); });
    await firstClick();
    await page.waitForFunction(() => !document.getElementById('m3d-status').classList.contains('hidden'));
    assert.equal(await page.evaluate(() => document.getElementById('m3d-spinner').getBoundingClientRect().width > 0), true, 'the spinner shows');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'm3d-cancel', 'Cancel takes the focus');
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#m3d-wait button')].map((b) => b.textContent)),
      ['Cancel', 'Play a standard board']);
    await page.waitForFunction(() => /^candidate \d+ · \d+ s$/.test(document.getElementById('m3d-progress').textContent));
    assert.equal(await page.evaluate(() => document.getElementById('m3d-progress').classList.contains('ui-text--muted')), true, 'the progress line is muted text');
    // The second button is reachable by keyboard, and shows the focus ring.
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'm3d-wait-standard', 'Play a standard board is the next control');
    const fs = await ring(page);
    assert.ok(focusShows(fs), 'Play a standard board shows its selected state');
    await check(page, '#m3d-status', 'generating', 4);
    worker = 'fail';
    await page.click('#m3d-cancel');
    assert.equal(await page.evaluate(() => document.getElementById('m3d-status').classList.contains('hidden')), true, 'Cancel closes the card');
    await firstClick();
    await page.waitForFunction(() => !document.getElementById('m3d-offer').classList.contains('hidden'));
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#m3d-offer button')].map((b) => b.textContent)),
      ['Retry', 'Play a standard board', 'Main menu']);
    await check(page, '#m3d-status', 'offer');
    await page.click('#m3d-offer-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Main menu from the offer');

    // An ended game: the pause card leads with Play again.
    await page.evaluate(() => {
      globalThis.__ms.start(3, 3, 1, 1, [0]);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
    });
    // a fixed board has no results screen: after the end delay it ends on the pause card
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: 5000 });
    assert.equal(await page.evaluate(() => globalThis.__ms.game.state), 'lost');
    const order = await page.evaluate(() => [...document.querySelectorAll('#pause .ui-actions button')].map((b) => [b.id, b.className]));
    assert.equal(order[0][0], 'p-restart', 'Play again comes first once the game ended');
    assert.match(order[0][1], /ui-button--primary/);
    assert.equal(await page.evaluate(() => document.getElementById('p-resume').offsetParent), null, 'an ended game has nothing to resume');
    assert.equal(await page.evaluate(() => document.querySelector('#p-restart [data-label]').textContent), 'Play again');
    assert.equal(await page.evaluate(() => document.querySelector('#p-restart .ui-key-hint__key')?.textContent), 'F2', 'its key hint stays');
    // Back on an ended game's card goes to the main menu, asking nothing.
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back leaves an ended game for the menu');

    const results = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    results.on('pageerror', (e) => errors.push(e.message));
    await results.goto(`${base}/dev/components.html`);
    await check(results, '#g-results', 'results');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- the shared layout's components

const LAYOUT = section(GALLERY, '<!-- components: shared layout -->', '<!-- /components: shared layout -->');
const LAYOUT_TAGS = tags(LAYOUT);
const within = (list, sel) => list.filter((t) => hasClasses(t, sel));
// The tags between an element's start and the close of its own tag name, at the same depth.
function inside(html, all, t) {
  let depth = 0;
  const re = new RegExp(`<(/?)${t.tag}\\b[^>]*>`, 'gi');
  re.lastIndex = t.index;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return all.filter((x) => x.index > t.index && x.index < m.index);
  }
  return [];
}
const textOf = (html, t) => {
  let depth = 0;
  const re = new RegExp(`<(/?)${t.tag}\\b[^>]*>`, 'gi');
  re.lastIndex = t.index;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(t.end, m.index).replace(/<svg[\s\S]*?<\/svg>/g, '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  return '';
};
const MODE_ENTRIES = ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily', 'records', 'settings', 'quit'];

test('the gallery marks the shared layout\'s components; the main menu, both board choices, the Daily screen, the placeholder, the pause card, the results, the Records screen, the Settings page, the replay viewer, the 3D ready card, the context-lost card, the Learn 3D end card, the fatal card and the no-JavaScript notice are the screens built from them so far', () => {
  assert.ok(LAYOUT.length > 1000, 'dev/components.html holds the shared layout\'s components');
  const screens = INDEX.replace(/<!--[\s\S]*?-->/g, '');
  const menu = SCREENS.menu;
  const choice = screens.slice(screens.indexOf('<section id="c2d-choice"'), screens.indexOf('<section id="c2d"'));
  const choice3d = screens.slice(screens.indexOf('<section id="board-choice"'), screens.indexOf('<section id="coming-soon"'));
  const soon = screens.slice(screens.indexOf('<section id="coming-soon"'), screens.indexOf('<section id="ready"'));
  const pause = screens.slice(screens.indexOf('<section id="pause"'), screens.indexOf('<noscript>'));
  const results = screens.slice(screens.indexOf('<section id="results"'), screens.indexOf('<section id="daily"'));
  const daily = screens.slice(screens.indexOf('<section id="daily"'), screens.indexOf('<section id="learn-end"'));
  const records = screens.slice(screens.indexOf('<section id="records"'), screens.indexOf('<section id="replay"'));
  const settings = screens.slice(screens.indexOf('<section id="settings"'), screens.indexOf('<section id="records"'));
  const replay = screens.slice(screens.indexOf('<section id="replay"'), screens.indexOf('<section id="results"'));
  const ready = screens.slice(screens.indexOf('<section id="ready"'), screens.indexOf('<section id="controls-modal"'));
  const ctxLost = screens.slice(screens.indexOf('<section id="ctx-lost"'), screens.indexOf('<section id="settings"'));
  const learnEnd = screens.slice(screens.indexOf('<section id="learn-end"'), screens.indexOf('<section id="pause"'));
  const noscript = screens.slice(screens.indexOf('<noscript>'), screens.indexOf('</noscript>'));
  const fatal = screens.slice(screens.indexOf('<template id="fatal-card">'), screens.indexOf('</template>'));
  for (const html of [noscript, fatal]) for (const cls of ['ui-backdrop', 'ui-card', 'ui-card__icon', 'ui-card__title']) assert.match(html, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the message cards use ${cls}`);
  for (const cls of ['ui-card', 'ui-screen', 'ui-button--lg', 'ui-button--sm', 'ui-key-hint', 'ui-section-label', 'ui-panel--muted', 'ui-banner', 'ui-text--warning']) {
    assert.match(ready, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the 3D ready card uses ${cls}`);
  }
  for (const cls of ['ui-card', 'ui-screen', 'ui-card__title', 'ui-actions--row', 'ui-key-hint']) {
    assert.match(ctxLost, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the context-lost card uses ${cls}`);
  }
  for (const cls of ['ui-card', 'ui-screen', 'ui-section-label', 'ui-card__title', 'ui-button--lg', 'ui-key-hint']) {
    assert.match(learnEnd, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Learn 3D end card uses ${cls}`);
  }
  for (const card of [ready, ctxLost, learnEnd]) assert.doesNotMatch(card, /class="[^"]*\b(ready-card|link-btn|esc-row)\b/, 'no one-off card or link button');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hint', 'ui-key-hints', 'ui-chip', 'ui-spinner', 'ui-overlay-bar', 'ui-code', 'ui-segmented', 'ui-slider']) {
    assert.match(replay, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the replay viewer uses ${cls}`);
  }
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hint']) assert.match(settings, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Settings page uses ${cls}`);
  assert.doesNotMatch(settings, /class="[^"]*\bui-card(?![\w-])/, 'the Settings page holds no card');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hint', 'ui-divider', 'ui-tabs', 'ui-checkbox', 'ui-table', 'ui-panel--muted', 'ui-stat--tile']) {
    assert.match(records, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Records screen uses ${cls}`);
  }
  assert.doesNotMatch(records, /class="[^"]*\bui-card(?![\w-])/, 'the Records screen holds no card');
  for (const cls of ['ui-frame', 'ui-key-hint', 'ui-chip', 'ui-chip--best', 'ui-stat--tile', 'ui-table']) assert.match(results, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the results screen uses ${cls}`);
  assert.doesNotMatch(results, /class="[^"]*\bui-card(?![\w-])/, 'the results screen holds no card');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hint']) assert.match(soon, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the placeholder uses ${cls}`);
  assert.doesNotMatch(soon, /class="[^"]*\bui-card(?![\w-])/, 'the placeholder holds no card');
  for (const cls of ['ui-section-label', 'ui-button--danger', 'ui-key-hint', 'ui-panel--muted']) assert.match(pause, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the pause card uses ${cls}`);
  const others = screens.replace(menu, '').replace(choice, '').replace(choice3d, '').replace(daily, '').replace(soon, '').replace(pause, '').replace(results, '').replace(records, '').replace(settings, '').replace(replay, '')
    .replace(ready, '').replace(ctxLost, '').replace(learnEnd, '').replace(noscript, '').replace(fatal, '');
  for (const cls of ['ui-wordmark', 'ui-mode-entry', 'ui-key-hint', 'ui-chip', 'ui-scene-panel']) {
    assert.match(menu, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the main menu uses ${cls}`);
  }
  for (const [name, html] of [['Classic 2D', choice], ['3D', choice3d]]) {
    for (const cls of ['ui-backdrop', 'ui-wordmark', 'ui-frame', 'ui-option', 'ui-section-label', 'ui-divider', 'ui-key-hint', 'ui-chip', 'ui-stat--tile']) {
      assert.match(html, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the ${name} board choice uses ${cls}`);
    }
  }
  assert.match(choice3d, /class="ui-option ui-option--learn"/, 'the 3D board choice uses ui-option--learn');
  for (const cls of ['ui-backdrop', 'ui-wordmark', 'ui-frame', 'ui-option', 'ui-section-label', 'ui-divider', 'ui-key-hint', 'ui-chip', 'ui-scene-panel', 'ui-code']) {
    assert.match(daily, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Daily screen uses ${cls}`);
  }
  assert.doesNotMatch(daily, /class="[^"]*\bui-card(?![\w-])/, 'the Daily screen holds no card');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-option', 'ui-section-label', 'ui-list-row', 'ui-divider', 'ui-tabs', 'ui-checkbox',
    'ui-table', 'ui-button--danger', 'ui-mode-entry', 'ui-scene-panel']) {
    assert.doesNotMatch(others, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `no other screen uses ${cls} yet`);
  }
});

test('screen frame: a named section on the backdrop with its head (back with its key hint, title, action), body, foot and the window-chrome slot', () => {
  const backdrop = within(LAYOUT_TAGS, '.ui-backdrop')[0];
  assert.ok(backdrop, 'a page backdrop');
  const frames = within(inside(LAYOUT, LAYOUT_TAGS, backdrop), '.ui-frame');
  assert.ok(frames.length >= 2, 'frames sit on the backdrop: one with a status line, one with a bottom bar');
  for (const frame of frames) {
    assert.equal(frame.tag, 'section');
    const parts = inside(LAYOUT, LAYOUT_TAGS, frame);
    const title = within(parts, '.ui-frame__title')[0];
    assert.ok(title && /^h[1-6]$/.test(title.tag), 'the title is a heading');
    assert.equal(frame.attrs['aria-labelledby'], title.attrs.id, 'the frame is named by its title');
    const head = within(parts, '.ui-frame__head')[0];
    assert.equal(head.tag, 'header');
    const chrome = within(parts, '.ui-frame__chrome')[0];
    assert.ok(chrome, 'the window-chrome slot is in the markup');
    assert.equal(chrome.attrs['data-slot'], 'window-chrome');
    assert.equal(chrome.attrs['aria-hidden'], 'true', 'decoration only');
    assert.ok(chrome.index < head.index, 'the chrome slot opens the frame, above its head');
    const start = within(inside(LAYOUT, LAYOUT_TAGS, head), '.ui-frame__start')[0];
    assert.ok(start && within(inside(LAYOUT, LAYOUT_TAGS, head), '.ui-frame__end').length === 1, 'the head\'s start and end cells');
    const back = within(inside(LAYOUT, LAYOUT_TAGS, start), '.ui-button.ui-button--secondary')[0];
    assert.ok(back, 'the head\'s start holds the screen\'s Back');
    const hint = within(inside(LAYOUT, LAYOUT_TAGS, back), '.ui-key-hint')[0];
    assert.ok(hint && hint.attrs['data-action'] === 'back' && hint.attrs['aria-hidden'] === 'true', 'Back carries its key hint, out of its name');
    assert.equal(within(parts, '.ui-frame__body').length, 1, 'one body');
    const foot = within(parts, '.ui-frame__foot')[0];
    assert.equal(foot.tag, 'footer');
  }
  const feet = frames.map((f) => inside(LAYOUT, LAYOUT_TAGS, f));
  assert.ok(feet.some((p) => within(p, '.ui-frame__status').length === 1), 'a foot as a status line');
  assert.ok(feet.some((p) => within(p, '.ui-frame__summary').length === 1 && within(p, '.ui-actions.ui-actions--row').length === 1), 'a foot as a bottom bar: the summary beside the actions');
});

test('mode entry: a native button with its icon, label, accent by entry, the Last played chip, and a disabled entry with its reason and lock', () => {
  const list = within(LAYOUT_TAGS, '.ui-mode-list')[0];
  assert.ok(list && list.attrs.role === 'group' && list.attrs['aria-label'], 'the entries sit in a named group');
  const entries = within(inside(LAYOUT, LAYOUT_TAGS, list), '.ui-mode-entry');
  assert.deepEqual([...new Set(entries.map((e) => e.attrs['data-entry']))].sort(), [...MODE_ENTRIES].sort(), 'every entry the menu draws, each its own accent');
  for (const e of entries) {
    assert.equal(e.tag, 'button');
    assert.equal(e.attrs.type, 'button');
    const parts = inside(LAYOUT, LAYOUT_TAGS, e);
    assert.equal(within(parts, '.ui-mode-entry__icon')[0]?.attrs['aria-hidden'], 'true', 'the icon is decoration');
    assert.ok(textOf(LAYOUT, within(parts, '.ui-mode-entry__label')[0]), 'the label names it');
    assert.equal(within(parts, '.ui-mode-entry__lock')[0]?.attrs['aria-hidden'], 'true', 'the lock is decoration');
  }
  const last = entries.filter((e) => within(inside(LAYOUT, LAYOUT_TAGS, e), '.ui-chip').some((c) => textOf(LAYOUT, c) === 'Last played'));
  assert.ok(last.length >= 1, 'an entry carries the Last played chip');
  assert.ok(!entries.some((e) => 'disabled' in e.attrs), 'no entry uses the native disabled: a disabled entry stays selectable');
  const off = entries.filter((e) => e.attrs['aria-disabled'] === 'true');
  assert.ok(off.length >= 1, 'a disabled entry');
  for (const e of off) {
    const reason = within(inside(LAYOUT, LAYOUT_TAGS, e), '.ui-mode-entry__reason')[0];
    assert.ok(reason && textOf(LAYOUT, reason), 'a disabled entry shows its reason line');
    assert.match(textOf(LAYOUT, e), new RegExp(textOf(LAYOUT, reason)), 'the reason is part of its name');
  }
  for (const e of entries.filter((x) => x.attrs['aria-disabled'] !== 'true')) {
    assert.equal(within(inside(LAYOUT, LAYOUT_TAGS, e), '.ui-mode-entry__reason').length, 0, 'an enabled entry has no reason line');
  }
  assert.ok(entries.some((e) => e.attrs['data-force'] === 'focus') && entries.some((e) => e.attrs['data-force'] === 'active'), 'shown selected and pressed');
  assert.doesNotMatch(LAYOUT, /data-entry="[^"]*"[^>]*data-locked|ui-mode-entry--locked/, 'no locked state for a mode entry');
});

test('board option: a native button with its name, size line, density, Last played chip beside the name, and its chosen state apart from selected', () => {
  const list = within(LAYOUT_TAGS, '.ui-options')[0];
  assert.ok(list && list.attrs.role === 'group' && list.attrs['aria-label'], 'the options sit in a named group');
  const options = within(inside(LAYOUT, LAYOUT_TAGS, list), '.ui-option');
  assert.ok(options.length >= 6);
  for (const o of options) {
    assert.equal(o.tag, 'button');
    assert.equal(o.attrs.type, 'button');
    assert.ok(['true', 'false'].includes(o.attrs['aria-pressed']), 'its chosen state is aria-pressed');
    const parts = inside(LAYOUT, LAYOUT_TAGS, o);
    assert.ok(textOf(LAYOUT, within(parts, '.ui-option__name')[0]), 'a name');
    assert.equal(within(parts, '.ui-option__check')[0]?.attrs['aria-hidden'], 'true', 'the check is decoration');
    assert.doesNotMatch(textOf(LAYOUT, o), /3BV|[Bb]est/, 'no 3BV and no best on an option');
  }
  const sized = options.filter((o) => within(inside(LAYOUT, LAYOUT_TAGS, o), '.ui-option__size').length === 1);
  assert.ok(sized.length >= 4, 'presets carry their size line');
  for (const o of sized) assert.equal(within(inside(LAYOUT, LAYOUT_TAGS, o), '.ui-option__density').length, 1, 'and their mine density');
  const described = options.filter((o) => {
    const p = inside(LAYOUT, LAYOUT_TAGS, o);
    return within(p, '.ui-option__size').length === 0 && within(p, '.ui-option__density').length === 0 && within(p, '.ui-option__meta').length === 1;
  });
  assert.ok(described.length >= 1, 'an option carrying a one-line description instead (Insert Board Code)');
  const chosen = options.filter((o) => o.attrs['aria-pressed'] === 'true');
  assert.ok(chosen.some((o) => !o.attrs['data-force']) && chosen.some((o) => o.attrs['data-force'] === 'focus'), 'chosen, and chosen and selected');
  assert.ok(options.some((o) => o.attrs['aria-pressed'] === 'false' && o.attrs['data-force'] === 'focus'), 'selected but not chosen');
  const last = options.find((o) => within(inside(LAYOUT, LAYOUT_TAGS, o), '.ui-chip').length === 1);
  assert.ok(last, 'an option with the Last played chip');
  const lp = inside(LAYOUT, LAYOUT_TAGS, last);
  assert.ok(within(lp, '.ui-chip')[0].index > within(lp, '.ui-option__name')[0].index && within(lp, '.ui-chip')[0].index < within(lp, '.ui-option__meta')[0].index, 'the chip sits beside the name, before the size line');
  const learn = options.find((o) => hasClasses(o, '.ui-option.ui-option--learn'));
  assert.ok(learn && within(inside(LAYOUT, LAYOUT_TAGS, learn), '.ui-option__badge')[0]?.attrs['aria-hidden'] === 'true', 'Learn 3D with its badge');
});

test('section label, key hints, stat tile badge, chips, list rows, scene panel, tabs, checkbox, divider and table in their markup patterns', () => {
  const label = within(LAYOUT_TAGS, '.ui-section-label')[0];
  const lp = inside(LAYOUT, LAYOUT_TAGS, label);
  assert.ok(/^h[2-6]$/.test(within(lp, '.ui-section-label__text')[0].tag), 'the label is a heading');
  assert.equal(within(lp, '.ui-section-label__aside').length, 1, 'with its aside');

  const hints = within(LAYOUT_TAGS, '.ui-key-hint');
  assert.ok(hints.some((h) => !hasClasses(h, '.ui-key-hint--pad')) && hints.some((h) => hasClasses(h, '.ui-key-hint.ui-key-hint--pad')), 'keyboard and controller hints');
  for (const h of hints) {
    assert.ok(['move', 'select', 'back'].includes(h.attrs['data-action']), 'a hint names the action whose keys it shows');
    const keys = within(inside(LAYOUT, LAYOUT_TAGS, h), '.ui-key-hint__key');
    assert.ok(keys.length >= 1 && keys.every((k) => k.tag === 'kbd'), 'its keys are kbd');
  }
  assert.ok(within(LAYOUT_TAGS, '.ui-key-hints').length >= 2, 'hints in a row');

  const tile = within(LAYOUT_TAGS, '.ui-stat.ui-stat--tile').find((t) => within(inside(LAYOUT, LAYOUT_TAGS, t), '.ui-chip').length === 1);
  assert.ok(tile && tile.attrs.role === 'group' && tile.attrs['aria-labelledby'], 'a stat tile with its badge');

  const chips = within(LAYOUT_TAGS, '.ui-chip');
  for (const v of ['', 'ui-chip--won', 'ui-chip--lost', 'ui-chip--muted', 'ui-chip--best']) {
    assert.ok(chips.some((c) => (v ? hasClasses(c, `.${v}`) : classesOf(c).length === 1)), `a chip ${v || 'plain'}`);
  }
  assert.ok(chips.some((c) => textOf(LAYOUT, c) === 'Coming soon'), 'the Coming soon chip');

  const list = within(LAYOUT_TAGS, '.ui-list')[0];
  assert.ok(list.tag === 'ul' && list.attrs['aria-label'], 'a named list');
  const rows = within(inside(LAYOUT, LAYOUT_TAGS, list), '.ui-list-row');
  assert.ok(rows.length >= 3 && rows.every((r) => r.tag === 'li'));
  for (const r of rows) {
    const p = inside(LAYOUT, LAYOUT_TAGS, r);
    for (const part of ['.ui-list-row__date', '.ui-list-row__figure', '.ui-chip']) assert.equal(within(p, part).length, 1, `a row's ${part}`);
  }
  for (const outcome of ['Won', 'Lost', 'Abandoned']) assert.ok(rows.some((r) => within(inside(LAYOUT, LAYOUT_TAGS, r), '.ui-chip').some((c) => textOf(LAYOUT, c) === outcome)), outcome);

  const panels = within(LAYOUT_TAGS, '.ui-scene-panel');
  assert.ok(panels.length >= 2);
  for (const panel of panels) {
    assert.equal(panel.tag, 'figure');
    const p = inside(LAYOUT, LAYOUT_TAGS, panel);
    const tag = within(p, '.ui-scene-panel__tag')[0];
    assert.equal(tag.tag, 'figcaption');
    assert.equal(panel.attrs['aria-labelledby'], tag.attrs.id, 'the panel is named by its tag');
    assert.equal(within(p, '.ui-scene-panel__stage').length, 1, 'the stage the renderer draws into');
  }

  const tablist = within(LAYOUT_TAGS, '.ui-tabs')[0];
  assert.ok(tablist.attrs.role === 'tablist' && tablist.attrs['aria-label']);
  const tabs = within(LAYOUT_TAGS, '.ui-tabs__tab');
  for (const tab of tabs) {
    assert.equal(tab.attrs.role, 'tab');
    assert.ok(['true', 'false'].includes(tab.attrs['aria-selected']));
  }
  for (const box of within(LAYOUT_TAGS, '.ui-checkbox__input')) assert.equal(box.attrs.type, 'checkbox');
  assert.ok(within(LAYOUT_TAGS, '.ui-divider').some((d) => d.tag === 'hr'), 'a divider');
  const table = within(LAYOUT_TAGS, '.ui-table')[0];
  assert.equal(table.tag, 'table');
  assert.ok(within(inside(LAYOUT, LAYOUT_TAGS, table), '.ui-table__figure').length >= 2, 'figures in their own cells');
});

test('the base gives the frame, backdrop and slots their structure: the frame bounded by the window, its body scrolling between head and foot, every slot hidden', () => {
  const body = (sel) => RULES.filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, b]) => b).join(';');
  assert.match(body('.ui-backdrop'), /display:\s*flex/);
  assert.match(body('.ui-backdrop'), /height:\s*100%/, 'the backdrop fills the window');
  const frame = body('.ui-frame');
  assert.match(frame, /flex-direction:\s*column/);
  assert.match(frame, /max-height:\s*100%/, 'never taller than the window');
  assert.match(frame, /max-width:\s*100%/, 'never wider than the window');
  assert.match(body('.ui-frame__body'), /overflow-y:\s*auto/, 'the body scrolls');
  assert.match(body('.ui-frame__body'), /min-height:\s*0/);
  for (const part of ['.ui-frame__head', '.ui-frame__foot']) assert.match(body(part), /flex:\s*none/, `${part} stays in view`);
  assert.match(body('[data-slot]'), /display:\s*none/, 'a decoration slot is hidden unless a theme styles it into view');
  assert.match(body('.ui-mode-entry:not([aria-disabled="true"]) .ui-mode-entry__lock'), /display:\s*none/, 'the lock shows only on a disabled entry');
  assert.match(body('.ui-option:not([aria-pressed="true"]) .ui-option__check > *'), /visibility:\s*hidden/, 'the check shows only on the chosen option');
});

test('the theme draws the mode entry taller when selected, the chosen board option as a fill and check apart from selected, and no hover on either', () => {
  const focusRules = (cls) => THEME_RULES.filter(([sel]) => sel.includes(`.${cls}:focus,`) && sel.includes(`.${cls}[data-force~="focus"]`)).map(([, b]) => b).join(';');
  assert.match(focusRules('ui-mode-entry'), /flex-grow:\s*1\.45/, 'the selected entry takes a larger share of the list');
  assert.match(focusRules('ui-mode-entry'), /min-height:/, 'and is taller');
  assert.ok(THEME_RULES.some(([sel, b]) => sel.includes('.ui-mode-entry:focus .ui-mode-entry__label') && /font-size:\s*var\(--font-size-2xl\)/.test(b)), 'with a bigger label');
  assert.ok(THEME_RULES.some(([sel, b]) => sel.includes('.ui-mode-entry:focus .ui-mode-entry__icon') && /width:/.test(b)), 'and a bigger icon');
  const chosen = THEME_RULES.filter(([sel]) => sel === '.ui-option[aria-pressed="true"]').map(([, b]) => b).join(';');
  assert.match(chosen, /background:\s*var\(--color-blue\)/, 'the chosen option is a blue fill');
  assert.match(focusRules('ui-option'), /transform:\s*translateY/, 'the selected option sits level with the surface');
  assert.doesNotMatch(focusRules('ui-option'), /background:/, 'selecting an option does not change its fill');
  for (const cls of ['ui-mode-entry', 'ui-option']) assert.ok(!THEME_RULES.some(([sel]) => sel.includes(`.${cls}:hover`)), `${cls} has no hover rule`);
  for (const entry of MODE_ENTRIES.filter((e) => !['records', 'settings', 'quit'].includes(e))) {
    assert.ok(THEME_RULES.some(([sel, b]) => sel === `.ui-mode-entry[data-entry="${entry}"]` && /--f:\s*var\(--color-/.test(b)), `${entry} has its accent`);
  }
  const backdrop = THEME_RULES.filter(([sel]) => sel === '.ui-backdrop').map(([, b]) => b).join(';');
  assert.match(backdrop, /radial-gradient\(circle, var\(--color-ground-dot\)/, 'the dotted paper');
  assert.match(THEME_RULES.filter(([sel]) => sel === '.ui-frame__head').map(([, b]) => b).join(';'), /background:\s*var\(--color-head\)/, 'the yellow head');
});

test('keyHintKeys: the keys of move, select, back and restart for each device, the controller\'s in its glyphs, none on touch', () => {
  assert.deepEqual(Object.keys(KEY_HINTS), ['move', 'select', 'back', 'restart']);
  assert.deepEqual(keyHintKeys('restart', 'keyboard'), [{ text: 'F2', pad: false }]);
  assert.deepEqual(keyHintKeys('restart', 'controller', GLYPHS.xbox), [{ text: GLYPHS.xbox.start, pad: true }, { text: GLYPHS.xbox.y, pad: true }], 'Start + Y');
  assert.deepEqual(keyHintKeys('move', 'keyboard'), [{ text: '↑', pad: false }, { text: '↓', pad: false }]);
  assert.deepEqual(keyHintKeys('select', 'keyboard'), [{ text: 'Enter', pad: false }]);
  assert.deepEqual(keyHintKeys('back', 'keyboard'), [{ text: 'Esc', pad: false }]);
  assert.deepEqual(keyHintKeys('move', 'controller'), [{ text: 'D-pad', pad: true }]);
  assert.deepEqual(keyHintKeys('select', 'controller', GLYPHS.xbox), [{ text: GLYPHS.xbox.a, pad: true }]);
  assert.deepEqual(keyHintKeys('back', 'controller', GLYPHS.playstation), [{ text: GLYPHS.playstation.b, pad: true }]);
  for (const action of Object.keys(KEY_HINTS)) assert.deepEqual(keyHintKeys(action, 'touch'), []);
  assert.throws(() => keyHintKeys('jump', 'keyboard'), /unknown action/);
  assert.throws(() => keyHintKeys('move', 'mouse'), /unknown device/);
});

test('bindTabs selects on click and Left / Right, skips disabled tabs, keeps one tab in the tab order and reports changes', () => {
  const list = new FakeEl({ class: 'ui-tabs', role: 'tablist' });
  const tabs = ['recent', 'top', 'replays'].map((v, i) => new FakeEl({
    class: 'ui-tabs__tab', role: 'tab', 'data-value': v, 'aria-selected': String(i === 0), ...(i === 1 ? { disabled: '' } : {}),
  }));
  list.children.push(...tabs);
  const seen = [];
  bindTabs(list, { onChange: (value, index) => seen.push([value, index]) });
  assert.deepEqual(tabs.map((t) => [t.attrs['aria-selected'], t.tabIndex]), [['true', 0], ['false', -1], ['false', -1]]);
  tabs[2].fire('click');
  assert.deepEqual(tabs.map((t) => t.attrs['aria-selected']), ['false', 'false', 'true']);
  assert.deepEqual(seen, [['replays', 2]]);
  assert.equal(list.dispatched.at(-1).type, 'change');
  tabs[1].fire('click');
  assert.deepEqual(seen, [['replays', 2]], 'a disabled tab is not selectable');
  const down = tabs[2].fire('keydown', { key: 'ArrowDown' });
  assert.equal(down.prevented, undefined, 'Up and Down are left to the shell\'s focus moves');
  const right = tabs[2].fire('keydown', { key: 'ArrowRight' });
  assert.ok(right.prevented);
  assert.ok(tabs[0].focused, 'the arrow moves focus with the selection');
  assert.deepEqual(seen.at(-1), ['recent', 0]);
});

test('in a browser, the shared layout\'s components: a mouse-selected mode entry loses the selection to a key, options tell chosen from selected, the frame scrolls its body, key hints follow the device', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    await page.evaluate(() => globalThis.galleryReady);
    const settle = () => page.waitForTimeout(250);
    const look = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      const c = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return { focused: document.activeElement === el, transform: c.transform, shadow: c.boxShadow, outline: c.outlineStyle, background: c.backgroundColor, height: r.height };
    }, sel);

    // A mode entry the mouse moved onto is selected; a key moving focus away leaves it unselected under the resting pointer.
    const entry = '#g-entry-classic';
    const next = '#g-entry-hexagon';
    await page.locator(entry).scrollIntoViewIfNeeded();
    const rest = await look(entry);
    const box = await page.locator(entry).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await settle();
    const selected = await look(entry);
    assert.equal(selected.focused, true, 'moving the mouse over a mode entry focuses it');
    assert.notEqual(selected.transform, rest.transform, 'it shows the selected look');
    assert.equal(selected.outline, 'none', 'no outline');
    await page.keyboard.press('Tab');
    await settle();
    assert.equal((await look(next)).focused, true, 'Tab moves the focus to the next entry');
    // The list's layout moves as the next entry grows: let the entry's own transition finish.
    await page.waitForFunction(([s, want]) => getComputedStyle(document.querySelector(s)).transform === want, [entry, rest.transform], { timeout: 3000 }).catch(() => {});
    const left = await look(entry);
    assert.equal(left.focused, false, 'the entry under the resting pointer is no longer selected');
    assert.equal(left.transform, rest.transform, 'nor looks it');
    const forced = await look('#g-modes [data-force="focus"]');
    const atRest = await look('#g-modes .ui-mode-entry:not([data-force]):not([aria-disabled="true"])');
    assert.ok(forced.height > atRest.height * 1.2, `the selected entry is taller (${forced.height} vs ${atRest.height})`);

    // The disabled entry: still selectable, so its preview can show, drawn flat with its reason and lock.
    const off = await page.evaluate(() => {
      const e = document.querySelector('#g-modes .ui-mode-entry[aria-disabled="true"]');
      e.focus();
      const shown = (sel) => { const x = e.querySelector(sel); return !!x && x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden'; };
      const enabledLock = document.querySelector('#g-modes .ui-mode-entry:not([aria-disabled="true"]) .ui-mode-entry__lock');
      return { focused: document.activeElement === e, reason: shown('.ui-mode-entry__reason'), lock: shown('.ui-mode-entry__lock'), enabledLock: enabledLock.getBoundingClientRect().width };
    });
    assert.deepEqual(off, { focused: true, reason: true, lock: true, enabledLock: 0 }, 'a disabled entry takes the selection and shows its reason and lock; an enabled one shows no lock');

    // A chosen board option and a selected one read apart: fill and check against level with the surface.
    const option = (sel) => page.evaluate((s) => {
      const el = document.querySelector(s);
      const c = getComputedStyle(el);
      const check = el.querySelector('.ui-option__check > svg');
      return { background: c.backgroundColor, transform: c.transform, outline: c.outlineStyle, check: !!check && getComputedStyle(check).visibility === 'visible' };
    }, sel);
    const plain = await option('#g-option-rest');
    const focused = await option('#g-option-focus');
    const chosen = await option('#g-option-chosen');
    assert.equal(focused.background, plain.background, 'selected keeps the option\'s fill');
    assert.notEqual(focused.transform, plain.transform, 'selected sits level with the surface');
    assert.notEqual(chosen.background, plain.background, 'chosen is a fill of its own');
    assert.notEqual(chosen.background, focused.background, 'chosen and selected read apart');
    assert.deepEqual([plain.check, focused.check, chosen.check], [false, false, true], 'only the chosen option shows its check');
    assert.equal(focused.outline, 'none', 'no outline on a selected option');

    // The frame at a short window: the body scrolls, head and foot stay in view.
    await page.setViewportSize({ width: 1100, height: 360 });
    const frame = await page.evaluate(() => {
      const backdrop = document.getElementById('g-backdrop');
      // The window is the backdrop's layer, as a screen's is: the gallery's fixed demo height is lifted.
      backdrop.style.cssText = 'position: fixed; inset: 0; height: 100%; z-index: 99';
      const f = backdrop.querySelector('.ui-frame');
      const rect = (sel) => f.querySelector(sel).getBoundingClientRect();
      const body = f.querySelector('.ui-frame__body');
      return {
        frameBottom: f.getBoundingClientRect().bottom, height: innerHeight,
        head: rect('.ui-frame__head').top >= 0, foot: rect('.ui-frame__foot').bottom <= innerHeight,
        scrolls: body.scrollHeight > body.clientHeight, overflow: getComputedStyle(body).overflowY,
        chrome: getComputedStyle(f.querySelector('[data-slot="window-chrome"]')).display,
        pageScrollX: document.documentElement.scrollWidth <= innerWidth,
      };
    });
    assert.ok(frame.frameBottom <= frame.height, 'the frame fits the window');
    assert.deepEqual([frame.head, frame.foot, frame.scrolls, frame.overflow], [true, true, true, 'auto'], 'head and foot in view, the body scrolling');
    assert.equal(frame.chrome, 'none', 'Joyful tiles draws no window chrome');
    await page.setViewportSize({ width: 1100, height: 900 });

    // Key hints follow the active device through the bindings source.
    const hints = await page.evaluate(async () => {
      const { showKeyHints } = await import('/js/ui/components.js');
      const { keyHintKeys } = await import('/js/settings/bindings.js');
      const { GLYPHS } = await import('/js/gamepad.js');
      const root = document.getElementById('g-hints-live');
      const read = () => [...root.querySelectorAll('.ui-key-hint')].map((h) => ({
        keys: [...h.querySelectorAll('.ui-key-hint__key')].map((k) => k.textContent),
        pad: h.classList.contains('ui-key-hint--pad'), label: h.querySelector('.ui-key-hint__label')?.textContent ?? null, hidden: h.classList.contains('hidden'),
      }));
      showKeyHints(root, (action) => keyHintKeys(action, 'controller', GLYPHS.xbox));
      const pad = read();
      showKeyHints(root, (action) => keyHintKeys(action, 'keyboard'));
      const keyboard = read();
      showKeyHints(root, (action) => keyHintKeys(action, 'touch'));
      return { pad, keyboard, touch: read(), a: GLYPHS.xbox.a, b: GLYPHS.xbox.b };
    });
    assert.deepEqual(hints.pad, [
      { keys: ['D-pad'], pad: true, label: 'Move', hidden: false },
      { keys: [hints.a], pad: true, label: 'Select', hidden: false },
      { keys: [hints.b], pad: true, label: 'Back', hidden: false },
    ]);
    assert.deepEqual(hints.keyboard, [
      { keys: ['↑', '↓'], pad: false, label: 'Move', hidden: false },
      { keys: ['Enter'], pad: false, label: 'Select', hidden: false },
      { keys: ['Esc'], pad: false, label: 'Back', hidden: false },
    ]);
    assert.ok(hints.touch.every((h) => h.hidden && h.keys.length === 0), 'no key hints on touch');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- messages: the toast, the fatal card, the no-JavaScript notice, the 404 page

const NOT_FOUND = read('404.html');
const FATAL = section(INDEX, '<template id="fatal-card">', '</template>');
const NOSCRIPT = section(INDEX, '<noscript>', '</noscript>');
// A message card on the backdrop, as J-Other-states draws it: the danger badge, the title, then its line and action.
const messageCard = (html, id, title) => {
  assert.match(html, new RegExp(`<section class="ui-card" role="alert" aria-labelledby="${id}"><span class="ui-card__icon" aria-hidden="true"><svg\\b`), `${id}: a ui-card alert opening with its badge`);
  assert.match(html, new RegExp(`<h([12]) class="ui-card__title" id="${id}">${title.replace(/\./g, '\\.')}</h\\1>`), `${id}: its title`);
};

test('the toast, the fatal card, the no-JavaScript notice and the 404 page are composed from catalogued components, keeping their text, live regions and actions', () => {
  // The toast: polite, its info icon out of its text.
  assert.match(INDEX, /<div id="toast" class="toast ui-toast" role="status" aria-live="polite"><svg class="ui-toast__icon" aria-hidden="true"[^>]*>[\s\S]*?<\/svg><span class="ui-toast__text" id="toast-text"><\/span><\/div>/);
  // The fatal card: on the backdrop, an alert with Reload.
  assert.match(FATAL, /^<template id="fatal-card"><div class="fatal ui-backdrop">/);
  messageCard(FATAL, 'fatal-title', 'Cannot start Minesweeper 3D');
  assert.match(FATAL, /<p class="ui-text">The game files failed to load\. Check your connection and reload the page\.<\/p>/);
  assert.match(FATAL, /<div class="ui-actions ui-actions--row"><button type="button" class="ui-button ui-button--primary" onclick="location\.reload\(\)" autofocus><svg\b[^>]*aria-hidden="true"[\s\S]*?<\/svg>Reload<\/button><\/div>/);
  // The no-JavaScript notice: the theme stylesheet it needs, linked where only a page without JavaScript reads it.
  assert.match(NOSCRIPT, /^<noscript><link rel="stylesheet" href="themes\/joyful-tiles\/theme\.css"><div class="noscript ui-backdrop">/);
  messageCard(NOSCRIPT, 'noscript-title', 'Minesweeper 3D needs JavaScript.');
  assert.equal((INDEX.match(/<noscript>/g) ?? []).length, 1, 'one no-JavaScript block');
  assert.match(INDEX.match(/<html\b[^>]*>/)[0], /data-theme="joyful-tiles"/, 'without JavaScript the page is in the default theme');
  // The 404 page: the same card, its one action a link home.
  assert.match(NOT_FOUND, /<main class="not-found ui-backdrop">/);
  messageCard(NOT_FOUND, 'not-found-title', 'Page not found.');
  assert.match(NOT_FOUND, /<div class="ui-actions ui-actions--row"><a class="ui-button ui-button--primary" href="\/">Go to Minesweeper 3D<\/a><\/div>/);
  // Nothing but kit classes and each surface's placement class.
  const allowed = new Set(['toast', 'fatal', 'noscript', 'not-found']);
  for (const [name, html] of [['toast', section(INDEX, '<div id="toast"', '</div>')], ['fatal', FATAL], ['noscript', NOSCRIPT], ['404', NOT_FOUND]]) {
    for (const t of tags(html)) for (const c of classesOf(t)) assert.ok(c.startsWith('ui-') || allowed.has(c), `${name}: ${c} is a kit class`);
  }
  assert.doesNotMatch(STYLE, /\.fatal div|\.noscript \{[^}]*font-size/, 'no one-off card styling remains');
});

test('the toast writes its text into its text part, keeping its icon, and hides after its time; none while the replay viewer shows', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const classes = new Set();
  const els = {
    toast: { classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }, textContent: '' },
    'toast-text': { textContent: '' },
  };
  const saved = globalThis.document;
  globalThis.document = { getElementById: (id) => els[id] };
  try {
    const ui = { _replaying: false };
    UI.prototype.toast.call(ui, 'Controller connected');
    assert.equal(els['toast-text'].textContent, 'Controller connected');
    assert.equal(els.toast.textContent, '', 'the toast itself is not overwritten: its icon stays');
    assert.ok(classes.has('on'));
    t.mock.timers.tick(2199);
    assert.ok(classes.has('on'), 'shown for its time');
    t.mock.timers.tick(1);
    assert.ok(!classes.has('on'), 'then hidden');
    UI.prototype.toast.call({ _replaying: true }, 'Hidden');
    assert.equal(els['toast-text'].textContent, 'Controller connected', 'none while the replay viewer shows');
  } finally {
    globalThis.document = saved;
  }
});

test('the 404 page loads only local files: the base and theme stylesheets, whose fonts are the theme\'s own; no script, no redirect, no remote resource', () => {
  assert.doesNotMatch(NOT_FOUND, /<script\b|http-equiv="refresh"|location\./i, 'no script and no redirect');
  assert.doesNotMatch(NOT_FOUND, /\b(https?:)?\/\/[\w.-]/i, 'no remote URL');
  assert.match(NOT_FOUND.match(/<html\b[^>]*>/)[0], /data-theme="joyful-tiles"/, 'the default theme, with no theme switch');
  const refs = [...NOT_FOUND.matchAll(/\b(?:href|src)="([^"]*)"/g)].map((m) => m[1]);
  const sheets = [...NOT_FOUND.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((m) => m[1]);
  assert.deepEqual(sheets, ['/css/tokens.css', '/css/components.css', '/css/style.css', '/themes/joyful-tiles/theme.css'],
    'the base stylesheets, then the theme, from the site root so any missing path finds them');
  for (const ref of refs) {
    if (ref === '/') continue;
    assert.match(ref, /^\/[\w./-]+$/, `${ref} is a local path`);
    assert.doesNotThrow(() => read(ref.slice(1)), `${ref} exists`);
  }
  const fonts = [...read('themes/joyful-tiles/theme.css').matchAll(/@font-face \{[^}]*src: url\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(fonts.length > 0 && fonts.every((f) => /^fonts\/[\w.-]+\.woff2$/.test(f)), 'the theme stylesheet brings its self-hosted fonts');
});

test('the toast and the message card\'s badge are catalogued, structured in the base and drawn by the theme from contrast-checked pairs', () => {
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  for (const doc of ['ui-toast', 'ui-toast__icon', 'ui-toast__text', 'ui-card__icon', 'Toast (index.html #toast)', 'Fatal card (index.html #fatal-card',
    'No-JavaScript notice (index.html <noscript>)', '404 page (404.html)']) assert.ok(head.includes(doc), `the catalogue documents ${doc}`);
  const toast = themeRulesFor('.ui-toast').filter(([sel]) => /^\.ui-toast$/.test(sel)).map(([, b]) => b).join(';');
  assert.match(toast, /background: var\(--color-ink\)/);
  assert.match(toast, /color: var\(--color-ink-inverse\)/, 'inverse ink on ink, a pair the token tests hold to 4.5:1');
  const icon = themeRulesFor('.ui-card__icon').map(([, b]) => b).join(';');
  assert.match(icon, /background: var\(--color-danger-fill\)/);
  assert.match(icon, /color: var\(--color-danger\)/, 'danger on its fill, a pair the token tests hold to 4.5:1');
  assert.ok(rulesFor('.ui-toast').length > 0 && rulesFor('.ui-card__icon').length > 0, 'their structure is in the base');
  // Placement: each message fills the page above everything; a card at most 560 px wide, 12 px from a phone's edges.
  const place = STYLE.match(/\.fatal, \.noscript, \.not-found \{([^}]*)\}/);
  assert.ok(place, 'one placement rule for the three message pages');
  assert.match(place[1], /position: fixed; inset: 0;/);
  assert.match(place[1], /z-index: var\(--z-fatal\);/);
  assert.match(place[1], /padding: 12px;/);
  assert.match(STYLE, /:is\(\.fatal, \.noscript, \.not-found\) > \.ui-card \{ width: min\(560px, 100%\); \}/);
  assert.match(STYLE, /\.toast \{[^}]*width: max-content; max-width: min\(640px, calc\(100vw - 32px\)\);/, 'the toast wraps inside a phone');
});

test('in a browser, the 404 page, the no-JavaScript notice and the fatal card show on the backdrop in Joyful tiles at every window size, with its fonts, no remote file, and the contrast contract met', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const SIZES = [
    ['xl', { viewport: { width: 1920, height: 1080 } }],
    ['m', { viewport: { width: 1024, height: 768 } }],
    ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }],
  ];
  const look = (page, card) => page.locator(card).evaluate((el) => {
    const box = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const backdrop = getComputedStyle(el.parentElement);
    return {
      theme: document.documentElement.dataset.theme,
      surface: s.backgroundColor, radius: s.borderTopLeftRadius,
      dots: /radial-gradient/.test(backdrop.backgroundImage),
      fits: box.left >= 0 && box.right <= innerWidth + 0.5 && box.top >= 0 && box.bottom <= innerHeight + 0.5 && document.documentElement.scrollWidth <= innerWidth,
      width: Math.round(box.width), font: getComputedStyle(el.querySelector('.ui-card__title')).fontFamily,
    };
  });
  const contrast = async (page, label) => {
    const { runs } = await page.evaluate(measureContrast);
    assert.ok(runs.length >= 1, `${label}: its text is measured`);
    assert.deepEqual(runs.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1`), [], `${label}: text below the contrast contract`);
  };
  try {
    for (const [size, device] of SIZES) {
      const width = Math.min(560, device.viewport.width - 24);
      // The 404 page.
      let context = await browser.newContext(device);
      try {
        const page = await context.newPage();
        const remote = [];
        const failed = [];
        page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('data:')) remote.push(r.url()); });
        page.on('requestfailed', (r) => failed.push(r.url()));
        await page.goto(`${base}/404.html`);
        await page.evaluate(() => document.fonts.ready);
        const got = await look(page, '.not-found > .ui-card');
        assert.equal(got.theme, 'joyful-tiles');
        assert.ok(got.dots, `404-${size}: on the dotted backdrop`);
        assert.equal(got.surface, 'rgb(255, 255, 255)', `404-${size}: the card's surface`);
        assert.equal(got.radius, '22px');
        assert.ok(got.fits, `404-${size}: fits without a scroll`);
        assert.equal(got.width, width, `404-${size}: the card's width`);
        assert.match(got.font, /^Rubik/);
        assert.ok(await page.evaluate(() => [...document.fonts].some((f) => f.family.replace(/"/g, '') === 'Rubik' && f.status === 'loaded')), 'Rubik loads from the theme\'s files');
        assert.equal(await page.textContent('.not-found .ui-card__title'), 'Page not found.');
        assert.equal(await page.getAttribute('.not-found a.ui-button', 'href'), '/');
        assert.equal(await page.evaluate(() => document.scripts.length), 0);
        await contrast(page, `404-${size}`);
        assert.deepEqual(remote, [], 'no remote resource');
        assert.deepEqual(failed, [], 'every file loads');
      } finally {
        await context.close();
      }
      // The no-JavaScript notice.
      context = await browser.newContext({ ...device, javaScriptEnabled: false });
      try {
        const page = await context.newPage();
        await page.goto(`${base}/index.html`);
        const got = await look(page, '.noscript > .ui-card');
        assert.ok(got.dots && got.surface === 'rgb(255, 255, 255)' && got.radius === '22px', `noscript-${size}: styled with JavaScript off`);
        assert.ok(got.fits, `noscript-${size}: fits`);
        assert.equal(got.width, width);
        assert.equal(await page.textContent('.noscript .ui-card__title'), 'Minesweeper 3D needs JavaScript.');
        await contrast(page, `noscript-${size}`);
      } finally {
        await context.close();
      }
      // The fatal card, the module graph failing to load.
      context = await browser.newContext(device);
      try {
        const page = await context.newPage();
        let blocked = true;
        await page.route('**/js/main.js', (r) => (blocked ? r.abort() : r.continue()));
        await page.goto(`${base}/index.html`);
        await page.waitForSelector('.fatal .ui-card');
        const got = await look(page, '.fatal > .ui-card');
        assert.ok(got.dots && got.surface === 'rgb(255, 255, 255)', `fatal-${size}: on the backdrop`);
        assert.ok(got.fits, `fatal-${size}: fits`);
        assert.equal(got.width, width);
        assert.equal(await page.textContent('.fatal .ui-button'), 'Reload');
        await contrast(page, `fatal-${size}`);
        blocked = false;
        await Promise.all([page.waitForEvent('load'), page.click('.fatal .ui-button')]);
        await page.waitForFunction(() => globalThis.__ms !== undefined);
        assert.equal(await page.evaluate(() => document.querySelector('.fatal')), null, 'Reload loads the game again');
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- in game: the counter readout and the figures panel

const IN_GAME = section(GALLERY, '<!-- components: in-game -->', '<!-- /components: in-game -->');
const IN_GAME_TAGS = tags(IN_GAME);
const kit = (name) => KIT_CATALOGUE.find((c) => c.name === name);
const kitPart = (name, part) => kit(name).parts.find((p) => p.name === part);
// The selector list a theme rule names, its scope taken off: whether one of them is exactly `sel`.
const themeBody = (sel) => THEME_RULES.filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, b]) => b).join(';');
const baseBody = (sel) => RULES.filter(([s]) => s.split(',').map((x) => x.trim()).includes(sel)).map(([, b]) => b).join(';');

test('the counter readout, the counter strip, the live figure and the figures panel are catalogued with their parts, the optional ones marked', () => {
  assert.deepEqual(kit('ui-counter').parts.map((p) => [p.name, p.selector, p.optional]), [
    ['icon', '.ui-counter__icon', true],
    ['digits', '.ui-counter__digits', false],
  ], 'the counter\'s digits, and an icon a theme may hide');
  assert.equal(kitPart('ui-counter-strip', 'restart').as, 'ui-button--secondary', 'Restart in the strip is a secondary button');
  assert.deepEqual(kit('ui-figure').variants, ['ui-figure--progress']);
  assert.deepEqual(kit('ui-figure').parts.map((p) => [p.name, p.optional]), [
    ['label', false], ['value', false], ['detail', true], ['bar', true], ['fill', true],
  ], 'a figure\'s label and value, its detail line and progress bar optional');
  assert.deepEqual(kit('ui-figures').parts.map((p) => [p.name, p.optional]), [
    ['head', true], ['title', true], ['action', true], ['body', false], ['foot', true], ['live', false],
  ], 'the panel\'s optional head bar (title and an action), its body, its controls-reminder foot and its live part');
  assert.equal(kitPart('ui-figures', 'action').as, 'ui-button--primary', 'the head bar\'s action is a primary button');
  for (const name of ['ui-counter', 'ui-counter-strip', 'ui-figure', 'ui-figures']) {
    assert.equal(kit(name).kind, 'component');
    assert.ok(kit(name).parts.every((p) => !p.interactive), `${name} has no interactive part of its own`);
  }
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  for (const doc of ['ui-counter__icon', 'ui-counter__digits', 'data-negative', 'ui-counter-strip', 'ui-figure__label', 'ui-figure__value',
    'ui-figure__detail', 'ui-figure__bar', 'ui-figure__fill', 'ui-figure--progress', 'ui-figures__head', 'ui-figures__title', 'ui-figures__body',
    'ui-figures__live', 'ui-figures__foot', 'bindFiguresLive']) assert.ok(head.includes(doc), `the catalogue documents ${doc}`);
});

test('in-game markup: counters named and never live, the strip holding Restart between them, figures named by their label, a labelled progress bar, and one polite live part per panel', () => {
  assert.ok(IN_GAME.length > 1000, 'dev/components.html holds the in-game components');
  const counters = within(IN_GAME_TAGS, '.ui-counter');
  assert.ok(counters.length >= 4);
  for (const c of counters) {
    assert.equal(c.attrs.role, 'group', 'a counter is a named group');
    assert.ok(['Mines left', 'Time'].includes(c.attrs['aria-label']), `named by what it counts (${c.attrs['aria-label']})`);
    assert.ok(!('aria-live' in c.attrs) && c.attrs.role !== 'status', 'a counter is not announced on every change');
    const parts = inside(IN_GAME, IN_GAME_TAGS, c);
    assert.equal(within(parts, '.ui-counter__digits').length, 1, 'its digits');
    assert.match(textOf(IN_GAME, within(parts, '.ui-counter__digits')[0]), /^(-\d{2}|\d{3})$/, 'three characters, as the overlay formats them');
    for (const icon of within(parts, '.ui-counter__icon')) assert.ok(icon.tag === 'svg' && icon.attrs['aria-hidden'] === 'true', 'the icon is decoration');
  }
  assert.ok(counters.some((c) => within(inside(IN_GAME, IN_GAME_TAGS, c), '.ui-counter__icon').length === 0), 'a counter without its icon');
  assert.ok(counters.some((c) => 'data-negative' in c.attrs && /^-/.test(textOf(IN_GAME, within(inside(IN_GAME, IN_GAME_TAGS, c), '.ui-counter__digits')[0]))), 'a negative mine counter');
  const strips = within(IN_GAME_TAGS, '.ui-counter-strip');
  assert.ok(strips.length >= 2);
  for (const strip of strips) {
    assert.ok(strip.attrs.role === 'group' && strip.attrs['aria-label'], 'the strip is a named group');
    assert.ok(!('aria-live' in strip.attrs));
    const parts = inside(IN_GAME, IN_GAME_TAGS, strip);
    const [mines, time] = within(parts, '.ui-counter');
    const restart = within(parts, '.ui-button.ui-button--secondary.ui-button--sm')[0];
    assert.ok(mines && time && restart, 'mines left, Restart and the timer');
    assert.ok(mines.index < restart.index && restart.index < time.index, 'Restart between the counters');
    assert.equal(mines.attrs['aria-label'], 'Mines left');
    assert.equal(time.attrs['aria-label'], 'Time');
    const tp = inside(IN_GAME, IN_GAME_TAGS, time);
    assert.ok(within(tp, '.ui-counter__digits')[0].index < within(tp, '.ui-counter__icon')[0].index, 'the timer\'s icon after its digits');
    assert.match(textOf(IN_GAME, restart), /^Restart/);
    const hint = within(inside(IN_GAME, IN_GAME_TAGS, restart), '.ui-key-hint')[0];
    assert.ok(hint && hint.attrs['data-action'] === 'restart' && hint.attrs['aria-hidden'] === 'true', 'Restart carries its key hint, out of its name');
  }

  const panels = within(IN_GAME_TAGS, '.ui-figures');
  assert.ok(panels.length >= 3);
  const shapes = panels.map((panel) => {
    assert.equal(panel.tag, 'section');
    const parts = inside(IN_GAME, IN_GAME_TAGS, panel);
    const head = within(parts, '.ui-figures__head')[0];
    if (head) {
      const title = within(parts, '.ui-figures__title')[0];
      assert.ok(/^h[2-6]$/.test(title.tag), 'the head\'s title is a heading');
      assert.equal(panel.attrs['aria-labelledby'], title.attrs.id, 'a panel with a head is named by its title');
      assert.ok(title.attrs.title, 'the title keeps the full name as its tooltip');
      const action = within(inside(IN_GAME, IN_GAME_TAGS, head), '.ui-figures__action')[0];
      assert.ok(action && hasClasses(action, '.ui-button.ui-button--primary') && action.tag === 'button' && action.attrs.type === 'button', 'the head\'s action is a primary button');
    } else {
      assert.equal(panel.attrs['aria-label'], 'Live figures', 'a panel without a head is named');
    }
    const body = within(parts, '.ui-figures__body');
    assert.equal(body.length, 1, 'one body');
    const figures = within(parts, '.ui-figure');
    assert.ok(figures.length >= 3);
    for (const f of figures) {
      const fp = inside(IN_GAME, IN_GAME_TAGS, f);
      const label = within(fp, '.ui-figure__label')[0];
      assert.equal(f.attrs.role, 'group');
      assert.equal(f.attrs['aria-labelledby'], label.attrs.id, 'a figure is named by its label');
      assert.ok(textOf(IN_GAME, within(fp, '.ui-figure__value')[0]), 'its figure');
      const bar = within(fp, '.ui-figure__bar')[0];
      if (bar) {
        assert.ok(hasClasses(f, '.ui-figure.ui-figure--progress'), 'a figure with a bar is the progress figure');
        assert.equal(bar.attrs.role, 'progressbar');
        assert.equal(bar.attrs['aria-labelledby'], label.attrs.id, 'the bar is named by the figure\'s label');
        const [min, max, now] = ['aria-valuemin', 'aria-valuemax', 'aria-valuenow'].map((a) => Number(bar.attrs[a]));
        assert.ok(min === 0 && now >= min && now <= max, 'the bar states its value');
        const fill = within(fp, '.ui-figure__fill')[0];
        assert.match(fill.attrs.style, new RegExp(`width: ${Math.round((now / max) * 100)}%`), 'the fill as wide as the share solved');
      }
    }
    const live = within(parts, '.ui-figures__live');
    assert.equal(live.length, 1, 'one live part');
    assert.equal(live[0].attrs.role, 'status');
    assert.equal(live[0].attrs['aria-live'], 'polite', 'a polite live region');
    assert.equal(live[0].attrs['aria-atomic'], 'true');
    assert.equal(textOf(IN_GAME, live[0]), '', 'empty until bindFiguresLive writes it');
    assert.ok(parts.filter((t) => 'aria-live' in t.attrs || t.attrs.role === 'status').every((t) => t === live[0]), 'nothing else in the panel is live');
    const foot = within(parts, '.ui-figures__foot')[0];
    if (foot) {
      const hints = within(inside(IN_GAME, IN_GAME_TAGS, foot), '.ui-key-hint');
      assert.ok(hints.length >= 3 && hints.every((h) => within(inside(IN_GAME, IN_GAME_TAGS, h), '.ui-key-hint__label').length === 1), 'the controls reminder: keys and what they do');
    }
    const labels = figures.map((f) => textOf(IN_GAME, within(inside(IN_GAME, IN_GAME_TAGS, f), '.ui-figure__label')[0]));
    return { head: Boolean(head), bar: within(parts, '.ui-figure__bar').length === 1, pace: labels.includes('Pace vs PB'), foot: Boolean(foot), labels };
  });
  assert.ok(shapes.some((s) => s.bar && s.pace && s.foot && !s.head), 'the panel with its progress bar and pace row');
  assert.ok(shapes.some((s) => !s.bar && !s.pace), 'the panel without its progress bar and pace row');
  assert.ok(shapes.some((s) => s.head), 'the panel with its head bar, as the 3D game\'s');
  for (const s of shapes) assert.deepEqual(s.labels.filter((l) => l !== 'Pace vs PB'), ['3BV', '3BV/s', 'Clicks', 'Flags'], 'the live figures in their order');
});

test('the base lays the in-game components out and hides the live part; Joyful tiles draws every part as J-Components does', () => {
  assert.match(baseBody('.ui-counter-strip'), /display: flex/);
  assert.match(baseBody('.ui-counter-strip'), /justify-content: space-between/);
  assert.match(baseBody('.ui-counter'), /display: inline-flex/);
  assert.match(baseBody('.ui-counter__digits'), /font-variant-numeric: var\(--font-numeric-tabular\)/);
  assert.match(baseBody('.ui-figure'), /flex-direction: column/);
  assert.match(baseBody('.ui-figure--progress'), /display: grid/);
  assert.match(baseBody('.ui-figure__fill'), /display: block/);
  assert.match(baseBody('.ui-figures'), /flex-direction: column/);
  assert.match(baseBody('.ui-figures__foot'), /margin-top: auto/, 'the controls reminder at the panel\'s foot');
  const live = baseBody('.ui-figures__live');
  for (const d of ['position: absolute', 'width: 1px', 'height: 1px', 'overflow: hidden', 'clip-path: inset\\(50%\\)']) assert.match(live, new RegExp(d), `the live part is read, not shown: ${d}`);

  const strip = themeBody('.ui-counter-strip');
  assert.match(strip, /background: var\(--color-surface\)/);
  assert.match(strip, /border-radius: var\(--radius-lg\)/);
  assert.match(strip, /box-shadow: inset 0 4px 0 var\(--shade-soft\), inset 0 0 0 2px var\(--color-border\)/);
  assert.match(themeBody('.ui-counter__icon'), /color: var\(--color-ink-muted\)/, 'the icon in muted ink');
  const digits = themeBody('.ui-counter__digits');
  assert.match(digits, /font-family: var\(--font-family-mono\)/);
  assert.match(digits, /font-size: 34px/);
  assert.match(digits, /color: var\(--color-ink\)/);
  assert.match(themeBody('.ui-counter[data-negative] .ui-counter__digits'), /color: var\(--color-danger\)/, 'a negative count in danger');
  assert.match(themeBody('.ui-figure'), /border-top: 1px solid var\(--color-line\)/, 'figures ruled apart');
  assert.match(themeBody('.ui-figure:first-child'), /border-top: 0/);
  assert.match(themeBody('.ui-figure__label'), /color: var\(--color-accent\)/);
  assert.match(themeBody('.ui-figure__label'), /text-transform: uppercase/);
  const value = themeBody('.ui-figure__value');
  assert.match(value, /font-family: var\(--font-family-mono\)/);
  assert.match(value, /font-size: 28px/);
  assert.match(value, /color: var\(--color-figure\)/);
  assert.match(themeBody('.ui-figure--progress .ui-figure__value'), /color: var\(--color-ink\)/, 'the 3BV figure small, in ink');
  assert.match(themeBody('.ui-figure__detail'), /color: var\(--color-ink-muted\)/);
  const bar = themeBody('.ui-figure__bar');
  assert.match(bar, /background: var\(--color-line\)/);
  assert.match(bar, /border-radius: 6px/);
  assert.match(themeBody('.ui-figure__fill'), /background: var\(--color-teal-edge\)/);
  const panel = themeBody('.ui-figures');
  assert.match(panel, /background: var\(--color-surface\)/);
  assert.match(panel, /border-radius: var\(--radius-xl\)/);
  const head = themeBody('.ui-figures__head');
  assert.match(head, /background: var\(--color-head\)/);
  assert.match(head, /border-bottom: 2px solid var\(--color-head-edge\)/);
  assert.match(themeBody('.ui-figures__foot'), /border-top: 1px solid var\(--color-line\)/);
  for (const [, body] of themeRulesFor('.ui-figures__live')) assert.doesNotMatch(body, /position|width|height|clip|display|overflow/, 'the theme leaves the live part hidden');
});

test('bindFiguresLive writes the panel\'s live part at most once a second, the latest text winning, and stops', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 });
  assert.equal(LIVE_FIGURES_INTERVAL, 1000);
  const live = { textContent: '' };
  const panel = { querySelector: (sel) => (sel === '.ui-figures__live' ? live : null) };
  const writes = [];
  Object.defineProperty(live, 'textContent', { get() { return writes.at(-1) ?? ''; }, set(v) { writes.push(v); } });
  const figures = bindFiguresLive(panel);
  figures.announce('3BV 1 of 118');
  assert.deepEqual(writes, ['3BV 1 of 118'], 'the first announcement is written at once');
  t.mock.timers.tick(200);
  figures.announce('3BV 2 of 118');
  t.mock.timers.tick(300);
  figures.announce('3BV 3 of 118');
  assert.deepEqual(writes, ['3BV 1 of 118'], 'nothing more within the second');
  t.mock.timers.tick(499);
  assert.equal(writes.length, 1);
  t.mock.timers.tick(1);
  assert.deepEqual(writes, ['3BV 1 of 118', '3BV 3 of 118'], 'a second after the last write, only the latest text');
  t.mock.timers.tick(5000);
  assert.equal(writes.length, 2, 'nothing waits');
  figures.announce('3BV 3 of 118');
  assert.equal(writes.length, 2, 'an unchanged text is not announced again');
  figures.announce('3BV 4 of 118');
  assert.equal(writes.at(-1), '3BV 4 of 118', 'a second after the last write, written at once');
  figures.announce('3BV 5 of 118');
  figures.stop();
  t.mock.timers.tick(5000);
  assert.equal(writes.at(-1), '3BV 4 of 118', 'stop drops the waiting text');
});

test('in a browser, the counter strip and the figures panel draw in Joyful tiles: mono digits, the fill as wide as its share, the live part read but not shown, and the contrast contract met', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    await page.evaluate(() => document.fonts.ready);
    const got = await page.evaluate(() => {
      const q = (sel) => document.querySelector(`#g-in-game ${sel}`);
      const s = (sel) => getComputedStyle(q(sel));
      const bar = q('.ui-figure__bar').getBoundingClientRect();
      const fill = q('.ui-figure__fill').getBoundingClientRect();
      const live = q('.ui-figures__live').getBoundingClientRect();
      return {
        digits: s('.ui-counter__digits').fontFamily, size: s('.ui-counter__digits').fontSize,
        negative: s('.ui-counter[data-negative] .ui-counter__digits').color, danger: getComputedStyle(document.documentElement).getPropertyValue('--color-danger').trim(),
        strip: s('.ui-counter-strip').backgroundColor, value: s('.ui-figure__value').fontFamily,
        share: Math.round((fill.width / bar.width) * 100), live: [live.width, live.height],
      };
    });
    assert.match(got.digits, /^"?JetBrains Mono/);
    assert.equal(got.size, '34px');
    assert.equal(got.negative, 'rgb(180, 42, 42)', `a negative count in danger (${got.danger})`);
    assert.equal(got.strip, 'rgb(255, 255, 255)', 'the strip on the surface');
    assert.match(got.value, /^"?JetBrains Mono/);
    assert.equal(got.share, 46, 'the fill as wide as the share solved');
    assert.deepEqual(got.live, [1, 1], 'the live part is read, not shown');
    const { runs } = await page.evaluate(measureContrast);
    const own = await page.evaluate(() => [...document.querySelectorAll('#g-in-game :is(.ui-counter-strip, .ui-figures) *')]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => e.textContent.trim().slice(0, 30)));
    const inGame = runs.filter((r) => own.includes(r.text));
    assert.ok(inGame.length >= 20, `the in-game components show their text (${inGame.length})`);
    assert.deepEqual(inGame.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`), [], 'in-game text below the contrast contract');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
