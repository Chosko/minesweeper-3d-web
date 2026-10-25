import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  decimalsOf, formatSliderValue, segmentedTargetIndex, segmentedState,
  bindSlider, bindSliderFill, sliderFill, bindSegmented, bindTabs, initComponents, formatOverlayTime, formatMineCount, mineCounterDigits, pagerState, PAGER_WINDOW,
  boardLink, copyBoardCode, createCodeChip, bindCodeChip, COPY_FALLBACK, COPIED, bindSelectOnHover, SELECT_ON_HOVER,
  bindFiguresLive, LIVE_FIGURES_INTERVAL, bindFigures, ICONS, iconMarkup, createIcon, setButtonIcon, createButton, applyIcons,
  setNote, NOTE_TONES, LOGO_WORDS, drawLogo, applyLogos, LOGO_STEP, LOGO_FLOOR, logoScale, WINDOW_BUTTONS, bindWindowButtons,
} from '../js/ui/components.js';
import { KIT_CATALOGUE, REQUIRED_TOKENS } from '../js/ui/kit-catalogue.js';
import { KEY_HINTS, keyHintKeys, reminderKeys } from '../js/settings/bindings.js';
import { GLYPHS } from '../js/gamepad.js';
import { UI, boardTitle3D, figuresLine } from '../js/ui.js';
import { FOCUSABLE } from '../js/shell/navigation.js';
import { browserSuite } from './helpers/browser.mjs';
import { measureContrast, focusShows } from './helpers/contrast.mjs';
import { patience } from './helpers/timing.mjs';

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
  'ui-switchrow': { interactive: false },
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
  'ui-button--quiet': { interactive: true, selectable: true, control: '.ui-button.ui-button--quiet' },
  'ui-button--go': { interactive: true, selectable: true, control: '.ui-button.ui-button--primary.ui-button--go' },
  'ui-button--stop': { interactive: true, selectable: true, control: '.ui-button.ui-button--primary.ui-button--stop' },
  'ui-backdrop': { interactive: false },
  'ui-frame': { interactive: false },
  'ui-play-tile': { interactive: true, selectable: true, control: '.ui-play-tile' },
  'ui-small-entry': { interactive: true, selectable: true, control: '.ui-small-entry' },
  'ui-option': { interactive: true, selectable: true, control: '.ui-option' },
  'ui-section-label': { interactive: false },
  'ui-key-hint': { interactive: false },
  'ui-chip': { interactive: false },
  'ui-list-row': { interactive: false },
  'ui-scene-panel': { interactive: false },
  'ui-logo': { interactive: false },
  'ui-divider': { interactive: false },
  'ui-board-frame': { interactive: false },
  'ui-tabs': { interactive: true, control: '.ui-tabs__tab' },
  'ui-checkbox': { interactive: true, control: '.ui-checkbox__input' },
  'ui-table': { interactive: false },
  'ui-toast': { interactive: false },
  'ui-confirm': { interactive: false },
  'ui-note': { interactive: false },
  // the in-game components
  'ui-counter': { interactive: false },
  'ui-counter-strip': { interactive: false },
  'ui-figure': { interactive: false },
  'ui-figures': { interactive: false },
};
// Screen compositions: layout-only classes the screens are assembled with.
const COMPOSITIONS = ['ui-screen', 'ui-row', 'ui-grid', 'ui-heading', 'ui-text', 'ui-actions', 'ui-stat-row', 'ui-columns',
  'ui-mode-list', 'ui-options', 'ui-key-hints', 'ui-list', 'ui-icon'];
// The controls whose hover and focus are one selected state.
const SELECTABLE = '.ui-button, .ui-menu__item, .ui-play-tile, .ui-small-entry, .ui-option';
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

test('the code chip draws as the canvas does: a 40 px sunk pill with an inset border, 15 px bold code, quiet compact buttons', () => {
  const chip = themeRulesFor('.ui-code').filter(([sel]) => sel === '.ui-code').map(([, b]) => b).join(';');
  assert.match(chip, /background:\s*var\(--color-surface-sunk\)/);
  assert.match(chip, /box-shadow:\s*inset 0 0 0 2px var\(--color-border\)/);
  assert.match(chip, /border-radius:\s*var\(--radius-md\)/);
  assert.match(chip, /padding:\s*5px 5px 5px 12px/);
  const base = (sel) => RULES.filter(([x]) => x === sel).map(([, b]) => b).join(';');
  assert.match(base('.ui-code'), /min-height:\s*40px/);
  assert.match(base('.ui-code'), /gap:\s*6px/);
  assert.match(base('.ui-code__value'), /font-size:\s*15px/);
  assert.match(base('.ui-code__value'), /font-weight:\s*var\(--font-weight-bold\)/);
  const buttons = base('.ui-code .ui-button');
  assert.match(buttons, /min-height:\s*30px/);
  assert.match(buttons, /padding:\s*4px 10px/);
  assert.match(buttons, /font-size:\s*13px/);
  assert.match(themeRulesFor('.ui-code .ui-button').filter(([sel]) => sel === '.ui-code .ui-button').map(([, b]) => b).join(';'), /border-radius:\s*9px/);
  assert.equal(rulesFor('.ui-code--compact').length + themeRulesFor('.ui-code--compact').length, 0, 'one shape: no compact variant');
  assert.equal(rulesFor('.ui-code__label').length + themeRulesFor('.ui-code__label').length, 0, 'no inline label: the section label sits outside');
  assert.deepEqual(KIT_CATALOGUE.find((c) => c.name === 'ui-code').variants, []);
  assert.deepEqual(KIT_CATALOGUE.find((c) => c.name === 'ui-code').parts.map((p) => p.name), ['value']);
  // on a phone the chip runs the full width and wraps
  const phone = CSS.slice(CSS.indexOf('@media (max-width: 719px), (max-height: 500px) and (orientation: landscape)'));
  assert.match(phone.slice(0, phone.indexOf('\n}')), /\.ui-code \{[^}]*width: 100%/);
});

test('createCodeChip builds the one chip shape for every caller: the code, then quiet small Copy and Copy link with their icons, no label', () => {
  const doc = stubDocument();
  const chip = createCodeChip(doc);
  assert.equal(chip.className, 'ui-code');
  assert.deepEqual(chip.children.map((c) => c.className), ['ui-code__value', 'ui-button ui-button--quiet ui-button--sm', 'ui-button ui-button--quiet ui-button--sm']);
  assert.equal(chip.children[0].localName, 'code');
  const [, copy, link] = chip.children;
  assert.deepEqual([copy.getAttribute('data-copy'), copy.textContent, copy.children[0].attrs['data-icon']], ['code', 'Copy', 'copy']);
  assert.deepEqual([link.getAttribute('data-copy'), link.textContent, link.children[0].attrs['data-icon']], ['link', 'Copy link', 'link']);
  assert.equal(copy.type, 'button');
  assert.equal(createCodeChip(doc, { compact: true, label: 'Board code' }).className, 'ui-code', 'no variant and no inline label, whatever a caller asks');
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
      if (cls === 'ui-option') {
        // A board option opened by pointer keeps its resting look: selected on keyboard focus only.
        assert.match(own, /(^|\s)\.ui-option:focus-visible,/, `${name} selected on keyboard focus`);
        const plain = own.split(/,|\n/).map((s) => s.trim()).filter((s) => /^\.ui-option\S*:focus$/.test(s));
        assert.deepEqual(plain, [], `${name} is not selected by a pointer's focus`);
        assert.match(own, /body:not\(\.pointer-nav\) \.ui-option:focus-visible,/, `${name}: a key's focus selects it outside pointer use`);
        assert.match(own, /body\.pointer-nav \.ui-option:focus:hover,/, `${name}: the mouse selects the option it focused, under the pointer`);
      } else assert.match(own, new RegExp(`(^|\\s)\\.${cls}:focus,`), `${name} selected while focused, by any input`);
      assert.doesNotMatch(own.replace(/:focus:hover/g, ''), /:hover/, `${name} has no hover look of its own`);
    } else {
      assert.match(own, /:hover/, `${name} hover`);
      assert.match(own, /:focus-visible/, `${name} keyboard focus`);
    }
  }
});

test('buttons, menu entries, main menu buttons and board options draw no outline: the selected state is their focus cue; the other controls ring from --color-focus-ring', () => {
  const focus = THEME_RULES.filter(([sel]) => /:focus/.test(sel));
  assert.ok(focus.length > 0);
  for (const [sel, body] of focus) {
    if (/ui-button|ui-menu__item|ui-play-tile|ui-small-entry|ui-option\b/.test(sel) && !/ui-toggle/.test(sel)) {
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

test('formatMineCount shows the real mines left in three digits, a negative count\'s minus in the first, kept at -99 at the low end', () => {
  assert.equal(formatMineCount(0), '000');
  assert.equal(formatMineCount(7), '007');
  assert.equal(formatMineCount(10), '010');
  assert.equal(formatMineCount(-5), '-05', 'the minus takes the first digit');
  assert.equal(formatMineCount(-1), '-01');
  assert.equal(formatMineCount(-12), '-12');
  assert.equal(formatMineCount(-99), '-99');
  assert.equal(formatMineCount(NaN), '000');
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
  const fake = { _setTitle3D() {}, _sizeMines: UI.prototype._sizeMines, el: { mines: { style: {} } } };
  UI.prototype.setBoard.call(fake, { X: 20, Y: 20, Z: 20, mines: 2480 });
  assert.equal(fake.el.mines.style.minWidth, '4ch');
  const fake2D = {
    _sizeMines: UI.prototype._sizeMines, _board2D() {},
    el: { c2dMines: { style: {} }, c2dTitle: { textContent: '' }, c2dSize: { textContent: '' } },
  };
  UI.prototype.setBoard2D.call(fake2D, { width: 100, height: 100, mines: 2480 });
  assert.equal(fake2D.el.c2dMines.style.minWidth, '4ch', 'the Classic 2D counter too');
  UI.prototype.setBoard2D.call(fake2D, { width: 9, height: 9, mines: 10 });
  assert.equal(fake2D.el.c2dMines.style.minWidth, '', 'a standard board looks as it does today');
  UI.prototype.setBoard.call(fake, { X: 12, Y: 12, Z: 8, mines: 130 });
  assert.equal(fake.el.mines.style.minWidth, '', 'up to 999 mines: no width of its own');
  assert.match(CSS, /\.ui-counter__digits\s*\{[^}]*font-variant-numeric:\s*var\(--font-numeric-tabular\)/, 'tabular figures, so the counter does not shift');
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

const byIdHud = (id) => HUD_TAGS.find((t) => t.attrs.id === id);

test('the 3D game overlay is built from catalogued components with no title: Pause floating first, the counter strip with mines left, the icon-only Restart and the timer, the figures panel with no head bar holding the live figures and the controls reminder, and the live-figures toggle', () => {
  const overlay = byIdHud('hud-overlay');
  assert.ok(overlay, '#hud holds the overlay');
  const parts = inside(HUD, HUD_TAGS, overlay);
  // Besides the kit: the shell's visibility utility and the overlay's own placement hooks.
  const allowed = new Set(['hidden', 'hud-overlay', 'hud-pause', 'hud-counters', 'hud-figures', 'hud-figures-toggle']);
  for (const t of parts) for (const c of classesOf(t)) assert.ok(c.startsWith('ui-') || allowed.has(c), `#hud-overlay <${t.tag} class="${c}"> is not a kit class`);
  assert.ok(!HUD_TAGS.some((t) => hasClasses(t, '.ui-overlay-bar')), 'the 3D game shows no overlay bar');

  const strip = byIdHud('hud-counters');
  assert.ok(hasClasses(strip, '.ui-counter-strip') && strip.attrs.role === 'group' && strip.attrs['aria-label'], 'the counter strip, a named group');
  const sp = inside(HUD, HUD_TAGS, strip);
  const [mines, time] = within(sp, '.ui-counter');
  const restart = byIdHud('hud-restart');
  assert.ok(mines.index < restart.index && restart.index < time.index, 'mines left, Restart, the timer');
  assert.deepEqual([mines.attrs['aria-label'], time.attrs['aria-label']], ['Mines left', 'Time']);
  for (const c of [mines, time]) assert.ok(c.attrs.role === 'group' && !('aria-live' in c.attrs), 'a counter is never live');
  for (const [id, counter] of [['hud-mines', mines], ['hud-time', time]]) {
    assert.ok(hasClasses(byIdHud(id), '.ui-counter__digits') && inside(HUD, HUD_TAGS, counter).includes(byIdHud(id)), `#${id} is its counter's digits`);
    assert.equal(textOf(HUD, byIdHud(id)), '000', `#${id} starts in the counter format`);
  }
  assert.ok(hasClasses(restart, '.ui-button.ui-button--secondary.ui-button--sm') && restart.tag === 'button' && restart.attrs.type === 'button');
  assert.equal(textOf(HUD, restart).trim(), '', 'Restart is icon-only, with no text and no key hint');
  assert.deepEqual([restart.attrs['data-icon'], restart.attrs['aria-label'], restart.attrs.title], ['restart', 'Restart', 'Restart'], 'its restart icon, named and tooltipped Restart');
  assert.ok('data-no-focus' in restart.attrs, 'Restart never takes the game\'s keys');

  const pause = byIdHud('hud-pause');
  assert.ok(parts.includes(pause) && pause.index < strip.index, 'Pause floats first, over the scene, in no panel');
  assert.ok(hasClasses(pause, '.ui-button.ui-button--secondary.ui-button--sm.hud-pause') && pause.tag === 'button' && pause.attrs.type === 'button');
  assert.deepEqual([pause.attrs['data-icon'], pause.attrs['aria-label'], pause.attrs.title], ['pause', 'Pause game', 'Pause'], 'the pause icon alone, named');
  assert.equal(textOf(HUD, pause).trim(), '', 'no text and no key hint');

  const panel = byIdHud('hud-figures');
  assert.ok(hasClasses(panel, '.ui-figures') && panel.tag === 'section' && panel.attrs['aria-label'] === 'Live figures', 'the figures panel, named Live figures');
  const pp = inside(HUD, HUD_TAGS, panel);
  assert.equal(within(pp, '.ui-figures__head').length, 0, 'no head bar: no title and no Pause in the panel');
  assert.ok(!HUD_TAGS.some((t) => t.attrs.id === 'hud-title'), 'no mode or difficulty label anywhere in the overlay');

  const toggle = byIdHud('hud-figures-toggle');
  assert.ok(parts.includes(toggle) && hasClasses(toggle, '.ui-button.ui-button--quiet.ui-button--sm.hud-figures-toggle') && toggle.tag === 'button' && toggle.attrs.type === 'button', 'the toggle, floating over the scene');
  assert.deepEqual([toggle.attrs['data-icon'], toggle.attrs['aria-label'], toggle.attrs.title, toggle.attrs['aria-pressed'], toggle.attrs['aria-controls']],
    ['panel', 'Live figures', 'Live figures', 'false', 'hud-figures'], 'Classic 2D\'s live-figures toggle: the panel icon, named, latched, controlling the panel');
  assert.ok('data-panel-toggle' in toggle.attrs && 'data-no-focus' in toggle.attrs, 'the panel toggle that never takes the focus from the mouse');
  const figures = within(pp, '.ui-figure');
  assert.deepEqual(figures.map((f) => f.attrs['data-figure']), ['bbbv', 'pace', 'rate', 'clicks', 'flags'], 'the live figures in their order');
  for (const f of figures) {
    const label = within(inside(HUD, HUD_TAGS, f), '.ui-figure__label')[0];
    assert.ok(f.attrs.role === 'group' && f.attrs['aria-labelledby'] === label.attrs.id, 'a figure named by its label');
  }
  assert.ok(hasClasses(figures[0], '.ui-figure--progress'), '3BV with its progress bar');
  assert.ok(classesOf(figures[1]).includes('hidden'), 'pace hidden until a best and a first 3BV');
  assert.ok(hasClasses(byIdHud('hud-clicks'), '.ui-figure__value') && inside(HUD, HUD_TAGS, figures[3]).includes(byIdHud('hud-clicks')), 'the click count is the clicks figure');
  assert.ok(inside(HUD, HUD_TAGS, within(pp, '.ui-figures__foot')[0]).some((t) => t.attrs.id === 'hud-reminder' && hasClasses(t, '.ui-key-hints')), 'the controls reminder at the panel\'s foot');
  const live = within(pp, '.ui-figures__live');
  assert.equal(live.length, 1);
  assert.ok(parts.filter((t) => 'aria-live' in t.attrs || t.attrs.role === 'status').every((t) => t === live[0]), 'only the panel\'s live part is live');
});

// The Classic 2D game window in index.html.
const WINDOW_2D = INDEX.slice(INDEX.indexOf('<section id="c2d"'), INDEX.indexOf('<section id="c2d-status"'));
const WINDOW_2D_TAGS = tags(WINDOW_2D);
const byId2D = (id) => WINDOW_2D_TAGS.find((t) => t.attrs.id === id);

test('the Classic 2D game window is built from catalogued components: the title bar with Pause in Back\'s place and no title; the counter strip with the icon-only Restart; the board; the figures panel; the foot line led by the mode and board, Swap clicks and the live-figures toggle at its right', () => {
  const [root, ...inner] = WINDOW_2D_TAGS;
  assert.deepEqual(classesOf(root).filter((c) => c !== 'hidden'), ['ui-backdrop'], '#c2d is the window\'s backdrop');
  // Besides the kit: the shell's visibility utility and the board's themed frame drawn behind the canvas.
  const allowed = new Set(['hidden']);
  for (const t of inner) for (const c of classesOf(t)) assert.ok(c.startsWith('ui-') || allowed.has(c), `#c2d <${t.tag} class="${c}"> is not a kit class`);
  const frame = byId2D('c2d-frame');
  assert.ok(hasClasses(frame, '.ui-frame') && frame.tag === 'section' && frame.attrs['aria-labelledby'] === 'c2d-title', 'a screen frame named by the mode and board');
  assert.equal(within(inner, '.ui-frame__heading').length, 0, 'no heading in the body');
  assert.equal(within(inner, '.ui-frame__title').length, 0, 'no title anywhere');
  const head = within(inner, '.ui-frame__head')[0];
  const parts = inside(WINDOW_2D, WINDOW_2D_TAGS, head);
  const start = within(parts, '.ui-frame__start')[0];
  const pause = byId2D('c2d-pause');
  assert.deepEqual(inside(WINDOW_2D, WINDOW_2D_TAGS, start).filter((t) => t.tag === 'button'), [pause], 'Pause alone at the head\'s start, in Back\'s place');
  assert.ok(hasClasses(pause, '.ui-button.ui-button--secondary.ui-button--sm.ui-frame__back') && pause.tag === 'button' && pause.attrs.type === 'button', 'the title bar\'s small secondary icon button');
  assert.equal(pause.attrs['data-icon'], 'pause', 'the pause icon alone');
  assert.equal(textOf(WINDOW_2D, pause), '', 'no text and no key label');
  assert.ok(!('data-back' in pause.attrs), 'Pause pauses: it is no Back');
  assert.equal(pause.attrs['aria-label'], 'Pause game', 'Pause is named');
  assert.equal(pause.attrs.title, 'Pause');
  assert.ok(within(parts, '.ui-frame__logo').length === 1, 'the logo in the centre');
  const end = within(parts, '.ui-frame__end')[0];
  assert.deepEqual(inside(WINDOW_2D, WINDOW_2D_TAGS, end).filter((t) => t.tag === 'button').map((b) => b.attrs['data-window']), ['minimise', 'fullscreen', 'quit'], 'only the window buttons at its end');
  assert.ok(!parts.some((t) => t.attrs.id === 'hud-swap' || t.attrs.id === 'c2d-title'), 'no Swap clicks and no mode or difficulty in the title bar');

  const strip = byId2D('c2d-counters');
  assert.ok(hasClasses(strip, '.ui-counter-strip') && strip.attrs.role === 'group' && strip.attrs['aria-label'], 'the counter strip, a named group');
  const sp = inside(WINDOW_2D, WINDOW_2D_TAGS, strip);
  const [mines, time] = within(sp, '.ui-counter');
  const restart = byId2D('c2d-restart');
  assert.ok(mines.index < restart.index && restart.index < time.index, 'mines left, Restart, the timer');
  assert.deepEqual([mines.attrs['aria-label'], time.attrs['aria-label']], ['Mines left', 'Time']);
  for (const c of [mines, time]) assert.ok(c.attrs.role === 'group' && !('aria-live' in c.attrs), 'a counter is never live');
  assert.ok(hasClasses(byId2D('c2d-mines-left'), '.ui-counter__digits') && inside(WINDOW_2D, WINDOW_2D_TAGS, mines).includes(byId2D('c2d-mines-left')));
  assert.ok(hasClasses(byId2D('c2d-time'), '.ui-counter__digits') && inside(WINDOW_2D, WINDOW_2D_TAGS, time).includes(byId2D('c2d-time')));
  assert.equal(textOf(WINDOW_2D, byId2D('c2d-time')), '000');
  assert.ok(hasClasses(restart, '.ui-button.ui-button--secondary.ui-button--sm') && restart.attrs.type === 'button');
  assert.equal(restart.attrs['data-icon'], 'restart', 'Restart is icon-only');
  assert.equal(textOf(WINDOW_2D, restart), '', 'with no text and no F2 label');
  assert.deepEqual([restart.attrs['aria-label'], restart.attrs.title], ['Restart', 'Restart'], 'its accessible name and tooltip');
  assert.ok('data-no-focus' in restart.attrs, 'Restart never takes the board\'s keys');
  assert.match(WINDOW_2D, /<div id="c2d-board"><div id="c2d-panel" class="ui-board-frame hidden" aria-hidden="true"><\/div><\/div>/, 'the board area holds the board\'s frame');
  const tapChoice = byId2D('hud-tap');
  assert.ok(tapChoice && hasClasses(tapChoice, '.ui-segmented') && tapChoice.attrs.role === 'radiogroup' && tapChoice.attrs['aria-label'], 'the Tap choice sits in the window, a named segmented radiogroup');
  const tapOptions = within(inside(WINDOW_2D, WINDOW_2D_TAGS, tapChoice), '.ui-segmented__option');
  assert.deepEqual(tapOptions.map((o) => [o.attrs.role, o.attrs['data-value'], o.attrs['aria-checked'], textOf(WINDOW_2D, o)]),
    [['radio', 'reveal', 'true', 'Tap: Reveal'], ['radio', 'flag', 'false', 'Tap: Flag']], 'two options, Reveal chosen');
  assert.ok(tapOptions.every((o) => 'data-no-focus' in o.attrs), 'neither option takes the board\'s keys');

  const panel = byId2D('c2d-figures');
  assert.ok(hasClasses(panel, '.ui-figures') && panel.tag === 'section' && panel.attrs['aria-label'] === 'Live figures', 'the figures panel');
  const pp = inside(WINDOW_2D, WINDOW_2D_TAGS, panel);
  const figures = within(pp, '.ui-figure');
  assert.deepEqual(figures.map((f) => f.attrs['data-figure']), ['bbbv', 'pace', 'rate', 'clicks', 'flags'], 'the live figures in their order');
  for (const f of figures) {
    const label = within(inside(WINDOW_2D, WINDOW_2D_TAGS, f), '.ui-figure__label')[0];
    assert.ok(f.attrs.role === 'group' && f.attrs['aria-labelledby'] === label.attrs.id, 'a figure named by its label');
  }
  assert.ok(hasClasses(figures[0], '.ui-figure--progress'), '3BV with its progress bar');
  const bar = within(inside(WINDOW_2D, WINDOW_2D_TAGS, figures[0]), '.ui-figure__bar')[0];
  assert.ok(bar.attrs.role === 'progressbar' && bar.attrs['aria-labelledby'], 'a labelled progress bar');
  assert.ok(classesOf(figures[1]).includes('hidden'), 'pace hidden until a best and a first 3BV');
  assert.ok(hasClasses(byId2D('c2d-clicks'), '.ui-figure__value'), 'the click count is the clicks figure');
  const live = within(pp, '.ui-figures__live');
  assert.equal(live.length, 1);
  assert.ok(WINDOW_2D_TAGS.filter((t) => 'aria-live' in t.attrs || t.attrs.role === 'status').every((t) => t === live[0]), 'only the panel\'s live part is live');
  assert.ok(inside(WINDOW_2D, WINDOW_2D_TAGS, within(pp, '.ui-figures__foot')[0]).some((t) => t.attrs.id === 'c2d-reminder' && hasClasses(t, '.ui-key-hints')), 'the controls reminder at the panel\'s foot');

  assert.equal(panel.attrs.id, 'c2d-figures');
  const foot = within(inner, '.ui-frame__foot')[0];
  const fp = inside(WINDOW_2D, WINDOW_2D_TAGS, foot);
  const line = byId2D('c2d-line');
  assert.ok(fp.includes(line) && hasClasses(line, '.ui-frame__status'), 'the foot line');
  const title = byId2D('c2d-title');
  const size = byId2D('c2d-size');
  assert.ok(title.tag === 'span' && size.tag === 'span' && inside(WINDOW_2D, WINDOW_2D_TAGS, line).includes(title) && title.index < size.index, 'the mode and difficulty lead it, then the board line');
  assert.match(WINDOW_2D, /<span id="c2d-title">Classic 2D<\/span> · <span id="c2d-size"><\/span>/, 'joined by a dot');
  const tools = byId2D('c2d-tools');
  assert.ok(fp.includes(tools) && hasClasses(tools, '.ui-actions.ui-actions--row') && line.index < tools.index, 'its tools at its right');
  const toolButtons = inside(WINDOW_2D, WINDOW_2D_TAGS, tools).filter((t) => t.tag === 'button');
  assert.deepEqual(toolButtons.map((b) => b.attrs.id), ['hud-swap', 'c2d-figures-toggle'], 'Swap clicks, then the live-figures toggle');
  const toggle = byId2D('c2d-figures-toggle');
  assert.ok(hasClasses(toggle, '.ui-button.ui-button--quiet.ui-button--sm') && 'data-panel-toggle' in toggle.attrs && toggle.attrs['data-icon'] === 'panel', 'the latched icon-only panel toggle');
  assert.deepEqual([toggle.attrs['aria-label'], toggle.attrs.title, toggle.attrs['aria-pressed'], toggle.attrs['aria-controls']], ['Live figures', 'Live figures', 'false', 'c2d-figures'], 'named Live figures, its pressed state exposed, closed at first');
  assert.ok('data-no-focus' in toggle.attrs && 'data-no-focus' in byId2D('hud-swap').attrs, 'neither takes the focus from the mouse');
  assert.ok(!HUD.includes('id="c2d-'), 'the window is not part of the 3D overlay');
});

test('every Classic 2D board sits in the board frame: white, a 2 px inner border and no edge, padded by the module\'s gap, its radius following the tile; a clipped board scrolls in a rounded viewport; the 3D game\'s overlay stays the 3D game\'s', () => {
  const style = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(CSS, /\.ui-board-frame \{ position: absolute; \}/, 'the base places the board frame');
  const panel = themeRulesFor('.ui-board-frame').map(([, b]) => b).join(';');
  assert.match(panel, /box-shadow\s*:\s*inset 0 0 0 2px var\(--color-border\)\s*(;|$)/, 'its frame: the 2 px inner border alone, no drop edge and no elevation');
  assert.match(panel, /background\s*:\s*var\(--color-board-frame\)/, 'white, the board frame\'s colour');
  assert.match(panel, /border-radius\s*:\s*var\(--board-frame-radius\)/, 'its corners the radius the shell sets from the board module');
  assert.doesNotMatch(panel, /padding/, 'its padding is the layout\'s, the module\'s gap');
  assert.match(read('js/ui.js'), /setProperty\('--board-frame-radius', `\$\{radius\}px`\)/, 'placePanel2D sets it');
  assert.match(read('js/classic2d/board-view.js'), /setProperty\('--board-frame-radius', `\$\{layout\.frameRadius\}px`\)/, 'a mounted frame sets it too');
  const clipped = themeRulesFor('[data-board-clipped]').map(([, b]) => b).join(';');
  assert.match(clipped, /--board-viewport-radius\s*:\s*14px/, 'a clipped board: a radius-14 viewport');
  assert.match(read('js/classic2d/board-view.js'), /round var\(--board-viewport-radius, 0px\)/, 'the view rounds its clip at it');
  assert.match(style, /#hud\.hud--2d #hud-overlay \{ display: none; \}/, 'the 3D game\'s overlay never shows over the Classic 2D window');
  const ui = read('js/ui.js');
  assert.doesNotMatch(ui, /PANEL_INSET|panelFrame2D/, 'no fixed inset: the frame\'s padding comes from the board module');
});

test('bindFigures writes each figure only when its text changes, hides a figure the model cannot give and a missing detail, and fills the progress bar', () => {
  const el = (cls) => {
    const classes = new Set(cls ? [cls] : []);
    let text = '';
    const node = {
      writes: 0, attrs: {}, style: {},
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c), toggle: (c, on) => (on ? classes.add(c) : classes.delete(c)) },
      get textContent() { return text; }, set textContent(v) { node.writes += 1; text = v; },
      setAttribute(n, v) { node.attrs[n] = String(v); },
    };
    return node;
  };
  const figure = (name, { detail = true, bar = false } = {}) => {
    const parts = { '.ui-figure__value': el(), '.ui-figure__detail': detail ? el() : null, '.ui-figure__bar': bar ? el() : null, '.ui-figure__fill': bar ? el() : null };
    const root = el();
    root.dataset = { figure: name };
    root.querySelector = (sel) => parts[sel] ?? null;
    root.parts = parts;
    return root;
  };
  const roots = [figure('bbbv', { detail: false, bar: true }), figure('pace'), figure('rate'), figure('clicks'), figure('flags')];
  const panel = { querySelectorAll: (sel) => (sel === '.ui-figure[data-figure]' ? roots : []) };
  const [bbbv, pace, rate, clicks] = roots;
  const shown = bindFigures(panel);
  const figures = {
    bbbv: { text: '54 / 118', detail: null, progress: 54 / 118 },
    pace: null,
    rate: { text: '2.70', detail: null },
    clicks: { text: '61', detail: 'efficiency 88.5%' },
    flags: { text: '16', detail: '24 mines left' },
  };
  shown.show(figures);
  assert.equal(bbbv.parts['.ui-figure__value'].textContent, '54 / 118');
  assert.equal(bbbv.parts['.ui-figure__fill'].style.width, '46%', 'the fill as wide as the share solved');
  assert.equal(bbbv.parts['.ui-figure__bar'].attrs['aria-valuenow'], '46');
  assert.equal(pace.classList.contains('hidden'), true, 'no pace: hidden');
  assert.equal(rate.parts['.ui-figure__detail'].classList.contains('hidden'), true, 'no best 3BV/s: no detail line');
  assert.equal(clicks.parts['.ui-figure__detail'].textContent, 'efficiency 88.5%');
  const writes = roots.map((r) => r.parts['.ui-figure__value'].writes);
  shown.show(figures);
  assert.deepEqual(roots.map((r) => r.parts['.ui-figure__value'].writes), writes, 'the same text is not written again');
  shown.show({ ...figures, pace: { text: '−2.063 s', detail: 'ahead of 48.213 s', ahead: true }, rate: { text: '2.71', detail: 'PB 2.91' } }, ['pace', 'rate']);
  assert.equal(pace.classList.contains('hidden'), false, 'pace shows once the model gives it');
  assert.equal(pace.parts['.ui-figure__value'].textContent, '−2.063 s');
  assert.equal(rate.parts['.ui-figure__detail'].textContent, 'PB 2.91');
  assert.equal(rate.parts['.ui-figure__detail'].classList.contains('hidden'), false);
  assert.equal(clicks.parts['.ui-figure__value'].writes, writes[3], 'a figure not named is left alone');
});

test('reminderKeys: the board\'s main bindings for the active device from the bindings source, the controller\'s in its glyphs', () => {
  assert.deepEqual(reminderKeys('classic-2d', 'keyboard').map((r) => [r.keys.map((k) => k.text), r.label]),
    [[['Left'], 'reveal'], [['Right'], 'flag'], [['Left', 'Right'], 'chord']]);
  const pad = reminderKeys('classic-2d', 'controller', GLYPHS.xbox);
  assert.deepEqual(pad.map((r) => [r.keys.map((k) => [k.text, k.pad]), r.label]), [[[['A', true]], 'reveal'], [[['X', true]], 'flag'], [[['Y', true]], 'chord']]);
  assert.deepEqual(reminderKeys('classic-2d', 'touch').map((r) => r.label), ['reveal', 'flag', 'chord']);
  assert.throws(() => reminderKeys('classic-2d', 'mouse'), /unknown device/);
  assert.deepEqual(reminderKeys('3d', 'keyboard').map((r) => [r.keys.map((k) => k.text), r.label]),
    [[['Left'], 'reveal'], [['Right'], 'flag'], [['Left', 'Right'], 'chord']], 'the 3D panel\'s reminder, as J-Game3D draws it');
  assert.deepEqual(reminderKeys('3d', 'controller', GLYPHS.xbox).map((r) => [r.keys.map((k) => k.text), r.label]), [[['RT'], 'reveal'], [['LT'], 'flag'], [['LT', 'RT'], 'chord']]);
  assert.deepEqual(reminderKeys('3d', 'touch').map((r) => r.keys[0].text), ['Tap', 'Long-press', 'Two-finger tap']);
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
  assert.equal(fake.el.mines.textContent, '010');
  UI.prototype.updateHud.call(fake, 1234.5, -150);
  assert.equal(fake.el.time.textContent, '999');
  assert.equal(fake.el.mines.textContent, '-99');
  assert.ok(cls.has('negative'));
  const counter = { attrs: new Set(), toggleAttribute(n, on) { if (on) counter.attrs.add(n); else counter.attrs.delete(n); } };
  const fake2D = {
    _last: { time: '', mines: '' },
    _readouts: { time: { textContent: '' }, mines: { textContent: '', classList: { toggle() {} } }, counter },
    el: fake.el,
  };
  UI.prototype.updateHud.call(fake2D, 3, -5);
  assert.deepEqual([fake2D._readouts.time.textContent, fake2D._readouts.mines.textContent], ['003', '-05'], 'in Classic 2D the window\'s counters');
  assert.ok(counter.attrs.has('data-negative'), 'the counter marks a count below zero');
  UI.prototype.updateHud.call(fake2D, 3, 2);
  assert.ok(!counter.attrs.has('data-negative'));
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

test('the pause card\'s 3D board title names the mode and the board', () => {
  assert.equal(boardTitle3D({ X: 8, Y: 8, Z: 8, mines: 40 }), '3D · Cube Intermediate');
  assert.equal(boardTitle3D({ X: 6, Y: 6, Z: 6, mines: 10, noGuess: true }), '3D · Cube Intro');
  assert.equal(boardTitle3D({ X: 7, Y: 5, Z: 3, mines: 12 }), '3D · Custom');
  assert.equal(boardTitle3D({ X: 8, Y: 8, Z: 8, mines: 40, daily: true }), '3D · Daily');
  assert.equal(boardTitle3D({ X: 4, Y: 4, Z: 4, mines: 6, learn: true }), 'Learn 3D');
});

test('the 3D overlay shows no title: no title-fitting rule, and setBoard names the board for the pause card alone', () => {
  const ui = read('js/ui.js');
  assert.doesNotMatch(ui, /_fitTitle3D|shortTitle3D|hud-title/, 'the title and its fitting rule are gone');
  const fake = { _sizeMines: () => {} };
  UI.prototype.setBoard.call(fake, { X: 8, Y: 8, Z: 8, mines: 40 });
  assert.match(fake._boardText, /^3D · Cube Intermediate · 8 × 8 × 8/, 'the pause card\'s board line');
});

test('UI.setFigures3D opens or closes the 3D panel through #hud and latches its toggle; the shell shows both modes\' panels from the one stored state', () => {
  const attrs = {};
  const fake = { el: { hud: { dataset: {} }, hudFiguresToggle: { setAttribute: (n, v) => { attrs[n] = v; } } } };
  UI.prototype.setFigures3D.call(fake, true);
  assert.deepEqual([fake.el.hud.dataset.figures, attrs['aria-pressed']], ['open', 'true']);
  UI.prototype.setFigures3D.call(fake, false);
  assert.deepEqual(['figures' in fake.el.hud.dataset, attrs['aria-pressed']], [false, 'false']);
  const main = read('js/main.js');
  assert.match(main, /function toggleFigures\(\) \{\s*LIVE_FIGURES\.setOpen\(!LIVE_FIGURES\.open\);\s*ui\.setFigures2D\(LIVE_FIGURES\.open\);\s*ui\.setFigures3D\(LIVE_FIGURES\.open\);/, 'either toggle flips the one stored state, both panels following it');
  assert.match(main, /LIVE_FIGURES\.load\(\)[^\n]*\]\);\nui\.setFigures2D\(LIVE_FIGURES\.open\);\nui\.setFigures3D\(LIVE_FIGURES\.open\);\n/, 'both panels as stored before the first screen');
  const ui = read('js/ui.js');
  assert.match(ui, /this\.el\.hudFiguresToggle\.addEventListener\('click', \(\) => cb\.onToggleFigures\?\.\(\)\)/, 'the 3D toggle calls the shell\'s toggle');
  assert.match(ui, /this\.el\.hudFiguresToggle\.addEventListener\('mousedown', \(e\) => e\.preventDefault\(\)\)/, 'never taking the focus from the mouse');
  assert.match(ui, /this\.el\.hudFiguresToggle\.addEventListener\('keydown', \(e\) => \{ if \(PRESS_KEYS\.has\(e\.code\)\) e\.stopPropagation\(\); \}\)/, 'Enter or Space on it never reaches the scene');
  const style = read('css/style.css');
  assert.match(style, /#hud:not\(\[data-figures="open"\]\) \.hud-figures \{ display: none; \}/, 'hidden by default');
});

test('UI.overlayBottom3D is the lowest of the counter strip, Pause and the toggle where they show', () => {
  const rect = (bottom, height = 40) => ({ getBoundingClientRect: () => ({ bottom, height }) });
  assert.equal(UI.prototype.overlayBottom3D.call({ el: { hudCounters: rect(78), hudPause: rect(62), hudFiguresToggle: rect(62) } }), 78);
  assert.equal(UI.prototype.overlayBottom3D.call({ el: { hudCounters: rect(116), hudPause: rect(52), hudFiguresToggle: rect(0, 0) } }), 116, 'a phone: Pause over the strip, no toggle');
});

test('UI.updateFigures3D writes the 3D figures panel and announces the 3BV solved and mines left on a count change only', () => {
  const shown = [];
  const said = [];
  const fake = { _figures3D: { show: (f, names) => shown.push(names) }, _figuresLive3D: { announce: (t) => said.push(t) }, _showFigures: UI.prototype._showFigures };
  const input = { bbbv: 40, bbbvSolved: 10, clicks: { reveal: { effective: 12, wasted: 0 }, flag: { effective: 3, wasted: 0 }, chord: { effective: 0, wasted: 0 } }, flags: 3, mines: 40, elapsedMs: 12000 };
  UI.prototype.updateFigures3D.call(fake, input, { bests: null });
  UI.prototype.updateFigures3D.call(fake, { ...input, elapsedMs: 13000 }, { tick: true, bests: null });
  assert.deepEqual(shown, [null, ['pace', 'rate']], 'every figure on a change, only the timed ones on a tick');
  assert.deepEqual(said, ['3BV 10 / 40, 37 mines left'], 'no announcement on a timer tick');
  assert.equal(said[0], figuresLine({ bbbv: { text: '10 / 40' }, flags: { detail: '37 mines left' } }), 'the same line as Classic 2D');
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
      // The board choice sits on the page's backdrop: a screen frame under its title bar, no card.
      for (const cls of ['ui-logo', 'ui-frame', 'ui-option', 'ui-key-hint']) assert.ok(inner.some((t) => classesOf(t).includes(cls)), `#${name} uses ${cls}`);
      assert.ok(!inner.some((t) => classesOf(t).includes('ui-card')), `#${name} holds no card`);
    } else if (name === 'menu') {
      // The main menu sits on the page's backdrop in a screen frame, no card: the title bar, the main menu buttons, the build label.
      assert.ok(root.attrs['aria-label'], '#menu is named');
      for (const cls of ['ui-frame', 'ui-logo', 'ui-mode-list', 'ui-play-tile', 'ui-small-entry', 'ui-text']) {
        assert.ok(inner.some((t) => classesOf(t).includes(cls)), `#menu uses ${cls}`);
      }
      for (const cls of ['ui-scene-panel', 'ui-key-hints', 'ui-chip']) assert.ok(!inner.some((t) => classesOf(t).includes(cls)), `#menu uses no ${cls}`);
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
  assert.match(SCREENS.pause, /id="p-resume"[^\n]*\n\s*<button id="p-home" class="ui-button ui-button--secondary" type="button" data-icon="cube">Back to start<\/button>/, 'Back to start follows Resume');
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
    const props = {};
    this.style = { setProperty: (n, v) => { props[n] = String(v); }, getPropertyValue: (n) => props[n] ?? '' };
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

test('sliderFill: the share of the range from its minimum to the value, clamped, the native 0–100 range by default', () => {
  assert.equal(sliderFill('25', '0', '100'), 0.25);
  assert.equal(sliderFill('1', '0.25', '3'), 0.2727);
  assert.equal(sliderFill('70', null, null), 0.7, 'a range input is 0–100 by default');
  assert.equal(sliderFill('-5', '0', '10'), 0);
  assert.equal(sliderFill('12', '0', '10'), 1);
  assert.equal(sliderFill('3', '3', '3'), 0, 'an empty range is unfilled');
});

test('the slider fill: the kit sets --slider-fill on the input and keeps it in step on input and on a value set by a script', () => {
  const input = new FakeEl({ class: 'ui-slider__input', value: '0.5', min: '0', max: '1', step: '0.05' });
  const unbind = bindSliderFill(input);
  assert.equal(input.style.getPropertyValue('--slider-fill'), '0.5');
  input.value = '0.75';
  assert.equal(input.style.getPropertyValue('--slider-fill'), '0.75', 'a value set by a script moves the fill');
  assert.equal(input.value, '0.75', 'and is still the value');
  input.style.setProperty('--slider-fill', 'stale');
  input.fire('input');
  assert.equal(input.style.getPropertyValue('--slider-fill'), '0.75', 'an input event redraws it');
  unbind();
  input.value = '0.1';
  assert.equal(input.value, '0.1', 'unbind leaves the value working');
  assert.equal(input.style.getPropertyValue('--slider-fill'), '0.75', 'unbind stops updates');
  // The kit's slider binder and the Settings controls' binder both keep the fill.
  const root = new FakeEl({ class: 'ui-slider' });
  const ranged = new FakeEl({ class: 'ui-slider__input', value: '30', min: '0', max: '100' });
  root.children.push(ranged, new FakeEl({ class: 'ui-slider__value' }));
  bindSlider(root);
  assert.equal(ranged.style.getPropertyValue('--slider-fill'), '0.3');
  assert.match(read('js/settings/page.js'), /bindSliderFill\(input\)/, 'the Settings and pause sliders fill too');
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
  for (const id of ['r-menu']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>Main menu <span class="ui-key-hint" data-action="back" aria-hidden="true"></span></button>`), `the Back holds its key hint (#${id})`);
  }
  // The title bar's Back shows its arrow alone: named, with its tooltip, and no key hint.
  for (const id of ['c2d-choice-back', 'board-choice-back', 'daily-back', 'records-back', 'coming-soon-menu', 'settings-back', 'rp-back']) {
    assert.match(html, new RegExp(`<button type="button" id="${id}" class="ui-button ui-button--secondary ui-button--sm ui-frame__back"[^>]* data-icon="arrow-left" aria-label="Back(?: to Main menu)?" title="Back"></button>`),
      `the title bar's Back is its arrow alone, named, with its tooltip (#${id})`);
  }
  assert.doesNotMatch(html, /data-label="(wide|phone)"/, 'no Back reads one label on a wide window and another on a phone');
  for (const id of ['coming-soon-back', 'replay-message-back', 'ready-back']) {
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
  assert.match(html, /id="ctx-lost-menu"[^>]*>Main menu</, '#ctx-lost-menu reads Main menu');
  assert.match(html, /id="r-menu"[^>]*>Main menu </, '#r-menu reads Main menu');
  for (const f of ['js/ui.js', 'js/main.js', 'js/settings/bindings.js', 'js/settings/page.js', 'js/shell/pause.js', 'js/results/view.js', 'dev/components.html']) {
    assert.doesNotMatch(read(f), /Back to menu/, `${f} says Main menu`);
  }
});

test('Restart discards an unfinished game; Play again starts the same choice once it ended; the help names only the restart keys', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /this\.el\.restartLabel\.textContent = ended \? 'Play again' : 'Restart';/, 'the pause card swaps them on the moment');
  assert.match(read('js/shell/pause.js'), /restart: Object\.freeze\(\{ action: 'restart', \.\.\.ASK \}\)/);
  assert.match(read('js/shell/pause.js'), /const ASK = \{ title: 'Leave this game\?', message: 'This game will count as a loss\.', confirmLabel: 'Confirm' \};/);
  assert.match(read('index.html'), /id="r-again"[^>]*>Play again </);
  const lines = read('js/settings/bindings.js').split('\n').filter((l) => /Restart|Play again|New game/.test(l));
  assert.ok(lines.length > 0 && lines.every((l) => /^\s*\['(\[F2\]|\[Esc\] · \[F2\]|\{start\} \+ \{y\})', '(Pause · )?Restart'\],$/.test(l)),
    'only the F2 and Start + Y rows name a restart; no help line names Play again or a new game');
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
  const entryOff = control({ class: 'ui-play-tile', 'aria-disabled': 'true' });
  entryOff.matches = (sel) => sel === '.ui-play-tile';
  move(entryOff, 17, 90);
  assert.equal(doc.activeElement, entryOff, 'a disabled play tile is still selected: it shows its reason and opens nothing');
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

// The base rule bodies of a selector exactly, and the theme's.
const baseRule = (sel) => RULES.filter(([x]) => x === sel).map(([, b]) => b).join(';');
const themeRule = (sel) => THEME_RULES.filter(([x]) => x.split(',').map((y) => y.trim()).includes(sel)).map(([, b]) => b).join(';');
const PHONE = (() => {
  const block = CSS.slice(CSS.indexOf('@media (max-width: 719px), (max-height: 500px) and (orientation: landscape)'));
  return block.slice(0, block.indexOf('\n}'));
})();

test('the stat tile is plain by default: white, a 2 px inset border, no drop, radius 16, 14 × 16 padding; warm is a variant', () => {
  assert.match(baseRule('.ui-stat--tile'), /padding:\s*14px var\(--space-4\)/);
  assert.match(baseRule('.ui-stat--tile'), /gap:\s*var\(--space-1\)/);
  assert.match(baseRule('.ui-stat--tile'), /min-width:\s*max-content/, 'a tile never narrows past its figure');
  const figure = baseRule('.ui-stat--tile .ui-stat__value');
  assert.match(figure, /font-size:[^;]*var\(--font-size-[^;]*var\(--font-size-/, 'the figure scales between two token sizes');
  assert.match(figure, /white-space:\s*nowrap/, 'the figure keeps one line');
  const plain = themeRule('.ui-stat--tile');
  assert.match(plain, /background:\s*var\(--color-surface\);/);
  assert.match(plain, /box-shadow:\s*inset 0 0 0 2px var\(--color-border\);/, 'its border, and no drop');
  assert.match(plain, /border-radius:\s*var\(--radius-lg\)/);
  const warm = themeRule('.ui-stat--warm');
  assert.match(warm, /background:\s*var\(--color-surface-raised\)/, 'cream');
  assert.match(warm, /0 var\(--edge-md\) 0 var\(--color-edge\)/, 'on its 6 px edge');
  assert.deepEqual(KIT_CATALOGUE.find((c) => c.name === 'ui-stat--tile').variants, ['ui-stat--warm']);
  // on a phone: a 24 px figure and 12 px padding
  assert.match(PHONE, /\.ui-stat--tile \{ padding: var\(--space-3\); \}/);
  assert.match(PHONE, /\.ui-stat--tile \.ui-stat__value \{ font-size: var\(--font-size-xl\); \}/);
});

test('the stat tile\'s label is 14 px bold muted in sentence case, its note 13 px bold sans; a better note in success, a worse one muted; a new best a 3 px head-colour ring', () => {
  const label = baseRule('.ui-stat--tile .ui-stat__label');
  assert.match(label, /font-size:\s*var\(--font-size-sm\)/);
  assert.match(label, /text-transform:\s*none/);
  assert.match(label, /letter-spacing:\s*normal/);
  assert.match(baseRule('.ui-stat__label'), /font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(themeRule('.ui-stat__label'), /color:\s*var\(--color-ink-muted\)/);
  const note = baseRule('.ui-stat--tile .ui-stat__detail');
  assert.match(note, /font-size:\s*13px/);
  assert.match(note, /font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(themeRule('.ui-stat--tile .ui-stat__detail'), /font-family:\s*var\(--font-family-sans\)/, 'Rubik, not the mono face');
  assert.match(themeRule('.ui-stat__detail[data-delta="better"]'), /color:\s*var\(--color-success\)/);
  assert.match(themeRule('.ui-stat__detail[data-delta="worse"]'), /color:\s*var\(--color-ink-muted\)/, 'a worse difference is muted, not red');
  const best = themeRule('.ui-stat--tile[data-new-best]');
  assert.match(best, /box-shadow:\s*inset 0 0 0 3px var\(--color-head\)/);
  assert.match(best, /outline:\s*none/);
  assert.match(best, /border-radius:\s*var\(--radius-lg\)/, 'it keeps the tile\'s radius');
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-stat--warm/, 'the catalogue documents the warm variant');
  assert.match(head, /ui-stat__detail[^]*ui-link[^]*Watch/, 'and a note\'s inline Watch link');
});

test('the muted panel: the sunk fill, 14 × 16 padding, an 8 px gap, the panel\'s 2 px border, its 6 px edge and its radius', () => {
  const base = baseRule('.ui-panel--muted');
  assert.match(base, /padding:\s*14px var\(--space-4\)/);
  assert.match(base, /display:\s*flex/);
  assert.match(base, /flex-direction:\s*column/);
  assert.match(base, /gap:\s*var\(--space-2\)/);
  const theme = themeRule('.ui-panel--muted');
  assert.match(theme, /background:\s*var\(--color-surface-sunk\)/);
  assert.doesNotMatch(theme, /box-shadow/, 'the panel\'s border and edge kept');
  assert.match(themeRule('.ui-panel'), /box-shadow:\s*inset 0 0 0 2px var\(--color-border\), 0 var\(--edge-md\) 0 var\(--color-edge\)/, 'the 2 px inset border and the 6 px edge');
  assert.match(THEME_CSS, /--edge-md: 6px;/);
  assert.match(themeRule('.ui-panel'), /border-radius:\s*var\(--radius-xl\)/, '20, as the Records overall block draws it');
});

test('the ruled table: 12 px uppercase headers, bold ink row labels, mono right-aligned values, 8 px cells, a rule across the whole row, a rank column; a recent-games variant', () => {
  assert.match(baseRule('.ui-table th'), /font-size:\s*var\(--font-size-xs\)/);
  assert.match(baseRule('.ui-table th'), /text-transform:\s*uppercase/);
  assert.match(baseRule('.ui-table th'), /letter-spacing:\s*0\.1em/);
  assert.match(baseRule('.ui-table th'), /padding:\s*var\(--space-2\)/);
  assert.match(baseRule('.ui-table td'), /padding:\s*var\(--space-2\)/);
  const label = baseRule('.ui-table th[scope="row"]');
  assert.match(label, /font-size:\s*inherit/);
  assert.match(label, /text-transform:\s*none/);
  assert.match(label, /letter-spacing:\s*normal/);
  assert.match(themeRule('.ui-table th[scope="row"]'), /color:\s*var\(--color-ink\)/);
  assert.match(baseRule('.ui-table .ui-table__figure, .ui-table th[scope="row"] ~ td'), /text-align:\s*right/);
  assert.match(themeRule('.ui-table__figure'), /font-family:\s*var\(--font-family-mono\)/);
  assert.match(themeRule('.ui-table th[scope="row"] ~ td'), /font-family:\s*var\(--font-family-mono\)/);
  assert.match(themeRule('.ui-table tbody tr'), /border-top:\s*1px solid var\(--color-line\)/, 'the rule spans the row');
  assert.doesNotMatch(themeRule('.ui-table td'), /border/, 'not the value cell alone');
  assert.match(baseRule('.ui-table__rank'), /font-size:\s*var\(--font-size-sm\)/);
  assert.match(themeRule('.ui-table__rank'), /color:\s*var\(--color-ink-muted\)[^]*font-family:\s*var\(--font-family-mono\)/);
  assert.match(baseRule('.ui-table__date'), /font-size:\s*13px/);
  assert.match(baseRule('.ui-table__date'), /white-space:\s*nowrap/);
  assert.match(themeRule('.ui-table--recent .ui-table__date'), /color:\s*var\(--color-ink-muted\)[^]*font-family:\s*var\(--font-family-mono\)/);
  assert.match(baseRule('.ui-table__code'), /font-size:\s*13px/);
  assert.match(themeRule('.ui-table__code'), /font-family:\s*var\(--font-family-mono\)/);
  assert.match(PHONE, /\.ui-table:not\(:has\(thead\)\) tr:has\(> th\[scope="row"\]\) \{ display: flex; flex-direction: column; gap: 2px; \}/, 'a details table (no thead) stacks label over value on a phone, a headed table keeps its columns');
  const table = KIT_CATALOGUE.find((c) => c.name === 'ui-table');
  assert.deepEqual(table.variants, ['ui-table--recent']);
  for (const p of ['heading', 'label', 'cell', 'figure', 'rank', 'date', 'code']) assert.ok(table.parts.some((x) => x.name === p), `the table's ${p}`);
});

test('the pager: 38 px buttons, radius 10, bold, a 3 px edge, 6 px apart; the current page an ink fill and the disabled ones locked, neither with an edge', () => {
  assert.match(baseRule('.ui-pager'), /gap:\s*6px/);
  const button = baseRule('.ui-pager__button');
  assert.match(button, /min-height:\s*38px/);
  assert.match(button, /min-width:\s*38px/);
  assert.match(button, /padding:\s*0 10px/);
  const rest = themeRule('.ui-pager .ui-pager__button');
  assert.match(rest, /border-radius:\s*10px/);
  assert.match(rest, /font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(rest, /box-shadow:\s*0 3px 0 var\(--color-edge\)/);
  const current = themeRule('.ui-pager .ui-pager__button[aria-current="page"]');
  assert.match(current, /background:\s*var\(--color-ink\)/);
  assert.match(current, /box-shadow:\s*none/);
  const disabled = themeRule('.ui-pager .ui-pager__button:disabled');
  assert.match(disabled, /background:\s*var\(--color-locked\)/);
  assert.match(disabled, /box-shadow:\s*none/);
  assert.match(themeRule('.ui-pager .ui-pager__button:focus'), /transform:\s*translateY\(3px\)/, 'selected: level, down its 3 px edge');
  assert.ok(rulesFor('.ui-columns').some(([, b]) => /gap:\s*var\(--space-/.test(b)), 'column spacing from the tokens');
});

test('the column composition has one breakpoint, 1024 px, stated once, used by Records and Settings', async () => {
  const breakpoints = [...CSS.matchAll(/@media[^{]*min-width:\s*(\d+)px/g)].map((m) => m[1]);
  assert.deepEqual(breakpoints, ['1024'], 'one breakpoint block in the kit');
  assert.doesNotMatch(read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, ''), /min-width:\s*1024px/, 'no second copy in the shell stylesheet');
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-columns[\s\S]*1024 px/, 'the catalogue states the breakpoint');
  assert.match(INDEX, /<section class="ui-frame" id="records-frame" aria-labelledby="records-title">[\s\S]*?<div class="ui-columns ui-columns--two" id="records-columns">/);
  const block = CSS.slice(CSS.indexOf('@media (min-width: 1024px)'));
  assert.match(block.slice(0, block.indexOf('\n}')), /#records-columns \{ grid-template-columns: [^}]+ auto [^}]+; \}/, 'Records\' rule between its columns, inside the one breakpoint');
  assert.match(INDEX, /<section class="ui-frame" id="settings-frame" aria-labelledby="settings-title">[\s\S]*?<div class="ui-frame__body" id="settings-body"><\/div>/);
  const { SETTINGS_LAYOUTS } = await import('../js/settings/page.js');
  assert.equal(SETTINGS_LAYOUTS.find((l) => l.columns.length === 2).media, `(min-width: ${breakpoints[0]}px)`, 'Settings places its two stacks from the same breakpoint');
});

test('the gallery shows the stat tile, the pager in each state and the column composition', () => {
  assert.ok(TAGS.some((t) => hasClasses(t, '.ui-stat.ui-stat--tile')), 'a stat tile');
  const tiles = section(GALLERY, '<!-- component: stat tile -->', '<!-- /component: stat tile -->');
  assert.match(tiles, /ui-stat__detail[\s\S]*Watch/, 'a tile with its date and Watch');
  assert.match(tiles, /&mdash;/, 'a best not yet set');
  assert.match(tiles, /999\.999 s[\s\S]*99\.99[\s\S]*100\.0%/, 'the longest figures');
  const tileTags = tags(tiles);
  assert.ok(tileTags.some((t) => hasClasses(t, '.ui-stat--tile.ui-stat--warm')), 'the warm variant');
  assert.ok(tileTags.some((t) => hasClasses(t, '.ui-stat--tile') && 'data-new-best' in t.attrs), 'a new best');
  assert.match(tiles, /<span class="ui-stat__detail">[^<]*<a [^>]*class="ui-link"[^>]*>Watch<\/a><\/span>/, 'a note with its inline Watch link');
  assert.match(tiles, /data-delta="better">was /, 'a "was …" note');
  assert.match(tiles, /data-delta="worse"/, 'a worse note');
  const chip = section(GALLERY, '<!-- component: code chip -->', '<!-- /component: code chip -->');
  assert.match(chip, /<div class="ui-section-label"><h3 class="ui-section-label__text"[^>]*>Board code<\/h3><\/div><div class="ui-code">/, 'the label sits outside the chip');
  assert.doesNotMatch(chip, /ui-code__label|ui-code--compact/);
  assert.match(chip, /class="ui-button ui-button--quiet ui-button--sm" data-copy="code"/, 'quiet compact buttons');
  const tables = section(GALLERY, '<!-- component: table -->', '<!-- /component: table -->');
  assert.match(tables, /class="ui-table__rank"/, 'a rank column');
  assert.match(tables, /<table class="ui-table ui-table--recent">[\s\S]*Date[\s\S]*Outcome[\s\S]*Time[\s\S]*class="ui-table__date"[\s\S]*ui-chip--won/, 'the recent-games variant');
  assert.match(tables, /<th scope="row">/, 'a details table of row labels');
  assert.match(tables, /class="ui-table__code"/, 'a board code as plain text');
  const muted = section(GALLERY, '<!-- component: muted panel -->', '<!-- /component: muted panel -->');
  assert.match(muted, /class="ui-panel ui-panel--muted"/, 'the muted panel');
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
  assert.ok(styleCoarse.some(([sel, body]) => sel.trim() === '#hud-tap' && /height:\s*48px/.test(body)), 'the Tap choice 48 px tall');
  assert.ok(styleCoarse.some(([sel, body]) => sel.trim() === '#hud-swap' && /display:\s*none/.test(body)), 'no Swap clicks on a coarse-only device');
});

// The bodies of the rules of `css` whose selector is exactly `sel`: at the top level, or in every @media block of exactly `query`.
const ruleIn = (css, query = null) => {
  const list = query ? mediaRules(css, query) : rules(topLevel(css)).map(([x, body]) => [x.split(SCOPE).join('').trim(), body]);
  return (sel) => list.filter(([x]) => x === sel).map(([, body]) => body).join(';');
};

test('the Classic 2D window hugs its content: the board column alone while the live figures are closed, a 2 px divider and the flat figures column 300 / 260 / 232 px wide while open, the board area the board\'s extent 12 px under the counter strip, measured with the window at its largest; under the board below 1024 px, hidden with its toggle on a phone; the foot line never widens the window; Swap clicks hides only under the coarse rule', () => {
  const top = ruleIn(STYLE);
  assert.match(top('#c2d'), /padding:\s*33px var\(--space-4\) 83px/, 'centred in the room above the HUD strip');
  assert.doesNotMatch(top('#c2d-frame'), /width|height/, 'no fill-the-viewport width or height, no max-width');
  assert.doesNotMatch(STYLE, /#c2d-frame \{[^}]*max-width:\s*1600px/, 'no 1600 px cap');
  assert.match(top('#c2d-body'), /grid-template-columns:\s*minmax\(auto, 1fr\) auto 300px/, 'open, the board column as wide as its board, the divider, the figures column');
  assert.match(top('#c2d:not([data-figures="open"]) :is(#c2d-divider, #c2d-figures)'), /display:\s*none/, 'closed, neither the divider nor the panel');
  assert.match(top('#c2d:not([data-figures="open"]) #c2d-body'), /grid-template-columns:\s*minmax\(auto, 1fr\);/, 'closed, the board column alone: the window shrinks to the board');
  assert.match(top('#c2d.c2d--measure:not([data-figures="open"]) #c2d-body'), /grid-template-columns:\s*minmax\(0, 1fr\);/, 'and is measured so');
  assert.equal(top('#c2d-frame > .ui-frame__head').trim(), 'contain: inline-size;', 'the title bar is the kit\'s, never setting the window\'s width');
  assert.match(top('#c2d:not(.c2d--measure) #c2d-main'), /justify-self:\s*center/, 'a window widened to its title bar centres the board column');
  assert.match(read('js/ui.js'), /this\.fitTitle2D\(\);\n\s*return stage\.style\.width/, 'the title bar fitted each time the board area is sized');
  assert.doesNotMatch(STYLE, /#c2d-frame > \.ui-frame__heading/, 'no heading to hide');
  // The foot line: the mode and board ellipsised in the room its tools leave, never setting the window's width.
  assert.match(top('#c2d-frame > .ui-frame__foot'), /flex-wrap:\s*nowrap/);
  assert.match(top('#c2d-line'), /flex:\s*1 1 0;\s*width:\s*0;\s*min-width:\s*0/, 'no width of its own to give the window');
  assert.match(top('#c2d-line'), /text-overflow:\s*ellipsis/);
  assert.match(top('#c2d-tools'), /flex:\s*none/);
  assert.match(top('#c2d-tools'), /gap:\s*var\(--space-2\)/, 'Swap clicks 8 px from the toggle');
  assert.match(top('#c2d-main'), /gap:\s*var\(--space-3\)/, 'the board 12 px under the counter strip');
  assert.match(top('#c2d-main'), /padding:\s*22px/);
  assert.match(top('#c2d-stage'), /flex:\s*none/, 'the board area is sized, never stretched');
  assert.match(top('#c2d-stage'), /align-self:\s*flex-start/, 'left-aligned under the strip');
  assert.match(top('#c2d-divider'), /width:\s*2px/);
  assert.match(top('#c2d-figures'), /contain:\s*size/, 'the figures column never sets the window\'s height');
  assert.match(top('#c2d-figures .ui-figures__body'), /padding:\s*22px 26px/);
  // Measuring: the window at its largest, the board area taking the room the chrome leaves.
  assert.match(top('#c2d.c2d--measure #c2d-frame'), /width:\s*100%;\s*height:\s*100%/);
  assert.match(top('#c2d.c2d--measure #c2d-body'), /grid-template-columns:\s*minmax\(0, 1fr\) auto 300px/);
  assert.match(top('#c2d.c2d--measure #c2d-stage'), /flex:\s*1 1 auto;\s*align-self:\s*stretch/);
  // The size steps: J-Game2D-l (the compact step) and -m.
  const compact = ruleIn(STYLE, COMPACT_STEP);
  assert.match(compact('#c2d-body'), /grid-template-columns:\s*minmax\(auto, 1fr\) auto 260px/);
  assert.match(compact('#c2d-main'), /padding:\s*var\(--space-4\)/, 'main padding 16 at l');
  assert.match(compact('#c2d-figures .ui-figures__body'), /padding:\s*var\(--space-4\) var\(--space-5\)/, 'figures padding 16px 20px at l');
  const m = ruleIn(STYLE, '(max-width: 1199px)');
  assert.match(m('#c2d-body'), /grid-template-columns:\s*minmax\(auto, 1fr\) auto 232px/);
  assert.match(m('#c2d-main'), /padding:\s*14px/, 'main padding 14 at m');
  assert.match(m('#c2d-figures .ui-figures__body'), /padding:\s*14px 18px/);
  assert.match(ruleIn(STYLE, '(max-height: 820px)')('#c2d'), /padding-top:\s*13px;\s*padding-bottom:\s*64px/);
  assert.doesNotMatch(STYLE, /#c2d-counters \{[^}]*padding-block/, 'the counter strip keeps the kit\'s 8px 14px');
  assert.match(STYLE, /@media \(max-width: 1023px\) \{[^@]*#c2d-body, #c2d\.c2d--measure #c2d-body \{[^}]*grid-template-columns:\s*minmax\(0, 1fr\)/, 'one column below the kit\'s breakpoint: the panel under the board');
  // A phone: full-bleed, no figures; held sideways the board at the left, then mines, time, Restart and the switch.
  const phone = ruleIn(STYLE, TOUCH_QUERY);
  assert.match(phone('#c2d-figures, #c2d-divider, #c2d-figures-toggle, #hud.hud--2d .hud-tools'), /display:\s*none/, 'a phone hides the panel and its toggle so the board keeps its room');
  assert.match(phone('#c2d-frame'), /width:\s*100%;\s*height:\s*100%/, 'full-bleed');
  assert.match(phone('#c2d-main'), /padding:\s*var\(--space-3\) var\(--space-4\)/, 'the board viewport 358 px wide at 390 px');
  const side = ruleIn(STYLE, '(max-height: 500px) and (orientation: landscape)');
  assert.match(side('#c2d-main'), /grid-template-columns:\s*auto minmax\(0, 1fr\)/, 'the board as wide as its extent, the column the rest');
  assert.match(side('#c2d.c2d--measure #c2d-main'), /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(side('#c2d-counters > .ui-counter:last-child'), /order:\s*1;\s*flex-direction:\s*row-reverse/, 'the time under the mines, its clock first');
  assert.match(side('#c2d-restart'), /order:\s*2/, 'Restart after both counters');
  const hides = rules(topLevel(STYLE)).filter(([sel, b]) => sel.includes('#hud-swap') && /display:\s*none/.test(b)).map(([sel]) => sel.trim());
  assert.deepEqual(hides, [], 'a fine pointer shows it on the Classic 2D window');
});

test('the in-game readouts follow the frame\'s size steps in Joyful tiles, in the Classic 2D window and the 3D overlay alike: counter digits 34 / 28 / 26 px, figure values 23 px and figures padded 8px 0 when compact, the figures title 17 / 15 / 16 px; the Classic 2D figures column flat; the negative counter red', () => {
  const compact = ruleIn(THEME_CSS, COMPACT_STEP);
  const phone = ruleIn(THEME_CSS, TOUCH_QUERY);
  assert.match(themeRulesFor('.ui-counter__digits').map(([, b]) => b).join(';'), /font-size:\s*34px/);
  assert.match(compact('.ui-counter__digits'), /font-size:\s*28px/);
  assert.match(phone('.ui-counter__digits'), /font-size:\s*26px/);
  assert.match(compact(':is(.ui-figure__value, .ui-figure--progress .ui-figure__value)'), /font-size:\s*23px/, 'the 3BV value too');
  assert.match(compact('.ui-figure'), /padding:\s*8px 0/);
  assert.match(compact('.ui-figures__title'), /font-size:\s*15px/);
  assert.match(phone('.ui-figures__title'), /font-size:\s*16px/);
  // The steps come after the rules they step, so they win at equal weight.
  const at = (needle) => THEME_CSS.indexOf(needle);
  assert.ok(at(`@media ${COMPACT_STEP} {\n  :root[data-theme="joyful-tiles"] .ui-counter__digits`) > at(':root[data-theme="joyful-tiles"] .ui-figure--progress .ui-figure__value {'), 'the readouts\' steps after the readouts');
  assert.doesNotMatch(STYLE, /\.ui-counter__digits \{[^}]*font-size/, 'no counter size of the page\'s own');
  assert.doesNotMatch(STYLE, /\.hud-figures \.ui-figures__title \{[^}]*font-size/, 'no title size of the page\'s own');
  assert.match(themeRulesFor('#c2d-figures').map(([, b]) => b).join(';'), /background:\s*none;\s*box-shadow:\s*none/, 'the Classic 2D figures column has no surface of its own');
  assert.match(themeRulesFor('.ui-counter[data-negative] .ui-counter__digits').map(([, b]) => b).join(';'), /color:\s*var\(--color-danger\)/, 'a negative mine counter in the danger colour');
});

test('on a fine pointer every hit area the coarse rules touch is as it was', () => {
  const top = rules(topLevel(CSS));
  const body = (sel) => top.filter(([s]) => s === sel).map(([, b]) => b).join(';');
  assert.match(body('.ui-toggle__input'), /width: 60px;[\s\S]*height: 34px;/);
  assert.match(body('.ui-slider__input'), /height: 28px;/);
  assert.match(body('.ui-slider__input::-webkit-slider-thumb'), /width: 26px;[\s\S]*height: 26px;/);
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
    assert.ok(hasClasses(b, '.ui-button.ui-button--quiet.ui-button--sm'), 'a latched toggle: a quiet small button');
    assert.equal(b.attrs.type, 'button');
    assert.equal(b.attrs['aria-pressed'], 'false', 'a toggle, off at first');
  }
  assert.match(TOUCH, />Shift</); assert.match(TOUCH, />Space</); assert.match(TOUCH, />Ctrl</);
  const stick = t.find((x) => x.attrs.id === 'touch-stick');
  assert.ok(stick && stick.attrs['aria-hidden'] === 'true', 'the stick is decoration');
  assert.ok(t.some((x) => x.attrs.id === 'touch-stick-knob'));
});

test('touch play: the toolbar and the stick show only in touch play, the toolbar\'s buttons 76 × 44 px on a coarse pointer, its pressed state visible', () => {
  const style = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const top = rules(topLevel(style));
  const body = (needle) => top.filter(([sel]) => sel.includes(needle)).map(([, b]) => b).join(';');
  assert.match(body('#touch-3d'), /display:\s*none/, 'hidden unless in touch play');
  assert.match(style, /body\.touch-play #touch-3d\s*\{[^}]*display:\s*block/, 'shown in touch play');
  assert.match(themeRulesFor('.ui-button--quiet[aria-pressed="true"]').map(([, b]) => b).join(';'), /box-shadow:\s*inset 0 3px 0 var\(--shade-press\)/, 'the pressed state is visible');
  assert.match(style, /body\.touch-play #scene\s*\{[^}]*touch-action:\s*none/, 'no browser scroll or zoom on the scene in touch play');
  assert.match(style, /body\.touch-play #scene\s*\{[^}]*user-select:\s*none/, 'no text selection');
  assert.match(style, /body\.touch-play #scene\s*\{[^}]*-webkit-touch-callout:\s*none/, 'no long-press menu');
  assert.match(body('#touch-stick'), /pointer-events:\s*none/, 'the stick takes no touch');
  const coarse = rules(coarseBlocks(style));
  assert.ok(coarse.some(([sel, b]) => sel.includes('#touch-modes .ui-button') && /min-width:\s*76px/.test(b) && /min-height:\s*44px/.test(b)), 'the toolbar\'s 76 × 44 px buttons');
  assert.ok(coarse.some(([sel, b]) => sel.includes('#hud-pause::after') && /width:\s*44px/.test(b) && /height:\s*44px/.test(b)), 'the floating pause button takes a touch in a 44 px square, its layout unchanged');
  assert.doesNotMatch(topLevel(style), /#hud-pause[^{]*\{[^}]*44px/, 'a fine pointer keeps the pause button\'s size');
});

test('the gallery shows the touch toolbar, a toggle pressed, and the stick', () => {
  const bar = TAGS.find((t) => t.attrs.class?.split(/\s+/).includes('touch-modes'));
  assert.ok(bar, 'the gallery shows the toolbar');
  const buttons = TAGS.filter((t) => t.tag === 'button' && t.index > bar.index && t.attrs['data-mode']);
  assert.ok(buttons.length >= 3);
  assert.ok(buttons.some((b) => b.attrs['aria-pressed'] === 'true'), 'a latched mode');
  assert.ok(TAGS.some((t) => t.attrs.class?.split(/\s+/).includes('touch-stick')), 'the gallery shows the stick');
  assert.match(GALLERY, /\.stick-box \.touch-stick \{[^}]*width: 130px; height: 130px;/, 'the gallery\'s stick at the game\'s 130 px');
  assert.match(GALLERY, /\.stick-box \.touch-stick__knob \{[^}]*width: 56px; height: 56px;/, 'its 56 px knob');
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

// ---------------------------------------------------------------- buttons: md size, key hints, quiet, latched toggles, danger

const buttonBase = (sel) => RULES.filter(([x]) => x === sel).map(([, b]) => b).join(';');
const buttonTheme = (sel) => THEME_RULES.filter(([x]) => x.split(',').map((y) => y.trim()).includes(sel)).map(([, b]) => b).join(';');

test('the default button is the canvas\'s md size, and every size takes its gap and line height', () => {
  const md = buttonBase('.ui-button');
  assert.match(md, /font-size:\s*17px/);
  assert.match(md, /padding:\s*10px 18px/);
  assert.match(md, /min-height:\s*46px/);
  assert.match(md, /gap:\s*10px/);
  assert.match(md, /line-height:\s*1\.1\b/);
  assert.match(buttonTheme('.ui-button'), /font-weight:\s*var\(--font-weight-heavy\)/, 'weight 800');
  for (const size of ['.ui-button--sm', '.ui-button--lg']) {
    assert.doesNotMatch(buttonBase(size), /gap|line-height/, `${size} keeps the md gap and line height`);
  }
  assert.match(buttonBase('.ui-button--sm'), /min-height:\s*38px;\s*padding:\s*7px 13px;\s*font-size:\s*15px/, 'sm keeps its size');
  assert.match(buttonBase('.ui-button--lg'), /min-height:\s*62px;\s*padding:\s*15px 28px/, 'lg keeps its size');
  const speed = rules(STYLE).filter(([sel]) => sel === '#rp-speed .ui-segmented__option').map(([, b]) => b).join(';');
  assert.match(speed, /font-size:\s*15px/, 'the replay speed options are 15 px');
  assert.match(speed, /padding:\s*7px 14px/);
});

test('a key hint inside a button takes the button\'s own ink, its key a current-colour border and max(11px, .72em)', () => {
  assert.match(buttonBase('.ui-button .ui-key-hint__key'), /font-size:\s*max\(11px,\s*0?\.72em\)/);
  assert.match(buttonTheme('.ui-button .ui-key-hint'), /color:\s*(currentColor|inherit)/, 'the hint is not muted inside a button');
  const key = buttonTheme('.ui-button .ui-key-hint__key');
  assert.match(key, /color:\s*inherit/);
  assert.match(key, /border-color:\s*currentColor/);
  assert.match(buttonTheme('.ui-key-hint__key'), /border:\s*1\.5px solid currentColor/);
});

test('the quiet button: a white surface ringed by the border, no drop edge; selected sunk with no lift; pressed 2 px down', () => {
  const rest = buttonTheme('.ui-button--quiet');
  assert.match(rest, /background:\s*var\(--color-surface\)/);
  assert.match(rest, /color:\s*var\(--color-ink\)/);
  assert.match(rest, /box-shadow:\s*inset 0 0 0 2px var\(--color-border\)\s*(;|$)/, 'a ring and no drop edge');
  const selected = buttonTheme('.ui-button--quiet:focus');
  assert.match(selected, /transform:\s*none/, 'no lift');
  assert.match(selected, /background:\s*var\(--color-surface-sunk\)/);
  assert.match(selected, /box-shadow:\s*inset 0 0 0 2px var\(--color-edge\)/);
  assert.match(buttonTheme('.ui-button--quiet[data-force~="active"]'), /transform:\s*translateY\(2px\)/);
  assert.match(buttonTheme('.ui-button--quiet:disabled'), /color:\s*var\(--color-locked-ink\)/);
  assert.match(buttonTheme('.ui-button--quiet[aria-pressed="true"]:disabled'), /background:\s*var\(--color-locked\)/, 'a disabled toggle draws locked, latched on or off');
  const q = KIT_CATALOGUE.find((c) => c.name === 'ui-button--quiet');
  assert.ok(q, 'the catalogue declares the quiet button');
  assert.deepEqual(q.variants, ['ui-button--sm']);
  assert.deepEqual(Object.keys(q.parts[0].states), ['default', 'selected', 'pressed', 'disabled', 'chosen'], 'its latched state is chosen');
  assert.equal(q.parts[0].states.chosen, '.ui-button--quiet[aria-pressed="true"]');
  const shown = TAGS.filter((t) => hasClasses(t, '.ui-button.ui-button--quiet'));
  for (const sm of [false, true]) {
    const sized = shown.filter((t) => hasClasses(t, '.ui-button--sm') === sm && t.attrs['aria-pressed'] === undefined);
    const tag = sm ? 'sm' : 'md';
    assert.ok(sized.some((t) => !t.attrs['data-force'] && !('disabled' in t.attrs)), `the gallery shows a quiet ${tag} at rest`);
    for (const f of ['focus', 'active']) assert.ok(sized.some((t) => t.attrs['data-force'] === f), `the gallery shows a quiet ${tag} ${f}`);
    assert.ok(sized.some((t) => 'disabled' in t.attrs), `the gallery shows a quiet ${tag} disabled`);
  }
});

test('a latched toggle is a quiet small button off and shows the pressed look on: Swap clicks, the live-figures toggle, the touch view modes, Show 3BV and Free camera', () => {
  for (const sel of ['.ui-button--quiet[aria-pressed="true"]', '.ui-button--quiet[aria-pressed="true"]:focus']) {
    const on = buttonTheme(sel);
    assert.match(on, /transform:\s*translateY\(2px\)/, `${sel}: sunk in place`);
    assert.match(on, /background:\s*var\(--color-surface-sunk\)/, `${sel}: the sunk surface`);
    assert.match(on, /box-shadow:\s*inset 0 3px 0 var\(--shade-press\), inset 0 0 0 2px var\(--color-edge\)/, `${sel}: its top edge showing inside`);
  }
  const lit = THEME_RULES.filter(([sel]) => /\[aria-pressed="true"\]/.test(sel) && /ui-button--(quiet|secondary)/.test(sel)).map(([, b]) => b).join(';');
  assert.doesNotMatch(lit, /--color-(accent|danger|blue)/, 'never red, nor any fill, when on');
  const sound = buttonTheme('.ui-button--secondary[aria-pressed="true"]');
  assert.match(sound, /transform:\s*translateY\(calc\(var\(--edge-sm\) \+ 2px\)\)/, 'a latched secondary button (the replay\'s Sound) pressed when on');
  assert.match(sound, /box-shadow:\s*inset 0 4px 0 var\(--shade-press\), inset 0 0 0 1px var\(--shade-soft\)/);
  const idx = tags(INDEX);
  const toggle = (pred, label) => {
    const found = idx.filter(pred);
    assert.ok(found.length > 0, `index.html holds ${label}`);
    for (const b of found) {
      assert.ok(hasClasses(b, '.ui-button.ui-button--quiet.ui-button--sm'), `${label} is a quiet small button`);
      assert.ok(!hasClasses(b, '.ui-button--secondary'), `${label} is no secondary button`);
      assert.equal(b.attrs['aria-pressed'], 'false', `${label} is a toggle, off at first`);
    }
  };
  toggle((t) => t.attrs.id === 'hud-swap', 'Swap clicks');
  toggle((t) => t.attrs.id === 'c2d-figures-toggle', 'the live-figures toggle');
  toggle((t) => t.tag === 'button' && ['shift', 'space', 'ctrl'].includes(t.attrs['data-mode']), 'the touch view modes');
  toggle((t) => t.attrs.id === 'rp-show-bbbv', 'Show 3BV');
  toggle((t) => t.attrs.id === 'rp-camera', 'Free camera');
  const latched = TAGS.filter((t) => hasClasses(t, '.ui-button.ui-button--quiet.ui-button--sm') && t.attrs['aria-pressed']);
  assert.ok(latched.some((t) => t.attrs['aria-pressed'] === 'true'), 'the gallery shows a toggle latched on');
  assert.ok(latched.some((t) => t.attrs['aria-pressed'] === 'false'), 'and one off');
});

test('the danger button: the danger fill, white text, a dark-red drop edge; Delete replay and Reset all data confirm with it', () => {
  const rest = buttonTheme('.ui-button--danger');
  assert.match(rest, /background:\s*var\(--color-danger\)/);
  assert.match(rest, /color:\s*var\(--color-ink-inverse\)/);
  assert.match(rest, /0 var\(--edge-sm\) 0 var\(--color-danger-edge\)/);
  const html = tags(INDEX);
  const yes = html.find((t) => t.attrs.id === 'records-replays-yes');
  assert.ok(yes && hasClasses(yes, '.ui-button.ui-button--danger') && !hasClasses(yes, '.ui-button--primary'), 'Delete replay is a danger button');
  assert.match(read('js/settings/page.js'), /class="ui-button ui-button--danger" id="set-reset-yes"/, 'Reset all data is a danger button');
});

test('the go and stop buttons: primary variants resting in a stronger pastel on its edge, their full colour when selected or pressed', () => {
  for (const [name, rest, restEdge, full, ink] of [
    ['ui-button--go', '--color-green-rest', '--color-green-rest-edge', '--color-green', '--color-green-on'],
    ['ui-button--stop', '--color-accent-rest', '--color-accent-rest-edge', '--color-accent-fill', '--color-accent-on'],
  ]) {
    const c = KIT_CATALOGUE.find((x) => x.name === name);
    assert.ok(c, `the catalogue declares ${name}`);
    assert.equal(c.base, 'ui-button');
    assert.deepEqual(Object.keys(c.parts[0].states), ['default', 'selected', 'pressed', 'disabled'], `${name}: the button's states`);
    for (const t of [rest, restEdge, full, ink]) assert.ok(TOKENS.has(t), `${t} is declared`);
    const atRest = buttonTheme(`.${name}`);
    assert.match(atRest, new RegExp(`background:\\s*var\\(${rest}\\)`), `${name} rests in the stronger pastel`);
    assert.match(atRest, /color:\s*var\(--color-ink\)/, `${name}: ink on the pastel`);
    assert.match(atRest, new RegExp(`0 var\\(--edge-sm\\) 0 var\\(${restEdge}\\)`), `${name}: the pastel's edge`);
    for (const state of [`.${name}:focus`, `.${name}[data-force~="focus"]`, `.${name}:active:not(:disabled)`, `.${name}[data-force~="active"]`]) {
      const look = buttonTheme(state);
      assert.match(look, new RegExp(`background:\\s*var\\(${full}\\)`), `${state}: its full colour`);
      assert.match(look, new RegExp(`color:\\s*var\\(${ink}\\)`), `${state}: its ink`);
    }
    assert.match(buttonTheme(`.${name}:disabled`), /background:\s*var\(--color-locked\)/, `${name} disabled is locked`);
  }
  assert.match(buttonTheme('.ui-button--lg.ui-button--go'), /0 7px 0 var\(--color-green-rest-edge\)/, 'the large go button keeps the large edge');
  assert.match(buttonBase('.ui-button--lg.ui-button--go'), /min-height:\s*52px;\s*padding:\s*10px 28px/, 'the large confirm button is slimmer than the large primary');
  for (const size of ['', '.ui-button--sm', '.ui-button--lg']) {
    assert.ok(TAGS.some((t) => hasClasses(t, `.ui-button.ui-button--primary.ui-button--go${size}`) && !t.attrs['data-force']), `the gallery shows a go button ${size || 'md'}`);
  }
  assert.ok(TAGS.some((t) => hasClasses(t, '.ui-button.ui-button--primary.ui-button--stop') && t.attrs['aria-label'] === 'Quit'), 'the gallery shows the title bar\'s Quit, an icon-only stop button');
});

// The button colour rule on every screen: the buttons that confirm or go forward, by id.
const GO_BUTTONS = ['c2d-play', 'bc-play', 'daily-play', 'r-again', 'p-resume', 'c2d-retry', 'm3d-retry', 'ready-btn', 'ready-drag',
  'ctx-lost-btn', 'learn-end-primary', 'rp-play'];

test('the button colour rule: every button that confirms or goes forward is green, red only for the destructive confirmations, Pause the white secondary', () => {
  const html = tags(INDEX);
  for (const id of GO_BUTTONS) {
    const b = html.find((t) => t.attrs.id === id);
    assert.ok(b, `#${id} exists`);
    assert.ok(hasClasses(b, '.ui-button.ui-button--primary.ui-button--go'), `#${id} is a go button`);
  }
  const fatal = INDEX.slice(INDEX.indexOf('<template id="fatal-card">'));
  assert.match(fatal, /<button type="button" class="ui-button ui-button--primary ui-button--go" onclick="location\.reload\(\)">/, 'the fatal card\'s Reload is a go button');
  for (const [where, list] of [['index.html', html], ['the gallery', TAGS]]) {
    for (const t of list.filter((x) => hasClasses(x, '.ui-button--primary'))) {
      assert.ok(hasClasses(t, '.ui-button--go') || hasClasses(t, '.ui-button--stop'), `${where} #${t.attrs.id}: a primary button is go or stop`);
    }
  }
  assert.deepEqual(html.filter((x) => hasClasses(x, '.ui-button--danger')).map((t) => t.attrs.id), ['records-replays-yes', 'p-confirm-yes'],
    'red only for the destructive confirmations: deleting a replay, leaving or restarting the game (and Settings\' Reset all data)');
  for (const id of ['c2d-pause', 'hud-pause']) {
    const b = html.find((t) => t.attrs.id === id);
    assert.ok(hasClasses(b, '.ui-button.ui-button--secondary') && !hasClasses(b, '.ui-button--primary'), `#${id}: Pause is the white secondary button`);
  }
  const ui = read('js/ui.js');
  const pause = ui.slice(ui.indexOf('  showPause('), ui.indexOf('  updatePause('));
  assert.match(pause, /classList\.add\('ui-button--primary', 'ui-button--go'\)/, 'the pause card\'s leading action, Resume or Restart, is green');
  assert.match(pause, /classList\.remove\('ui-button--primary', 'ui-button--go'\)/, 'the other one secondary');
  const viewer = read('js/replay/viewer.js');
  assert.match(viewer, /el\.play\.classList\.toggle\('ui-button--primary', !state\.playing\)/, 'the replay viewer\'s Play green');
  assert.match(viewer, /el\.play\.classList\.toggle\('ui-button--go', !state\.playing\)/);
  assert.match(viewer, /el\.play\.classList\.toggle\('ui-button--secondary', state\.playing\)/, 'its Pause the white secondary button');
});

test('no confirm button carries an Enter key label; Esc on Resume, Space on the replay controls and the controller glyphs stay', () => {
  const html = tags(INDEX);
  for (const [src, list] of [[INDEX, html], [GALLERY, TAGS]]) {
    for (const t of list.filter((x) => x.tag === 'button')) {
      const inner = src.slice(t.end, src.indexOf('</button>', t.end));
      assert.doesNotMatch(inner, /data-action="select"/, `#${t.attrs.id}: no Enter label`);
      assert.doesNotMatch(inner, />Enter</, `#${t.attrs.id}: no Enter label`);
    }
  }
  for (const id of ['c2d-play', 'bc-play', 'daily-play', 'r-again', 'learn-end-primary']) {
    const b = html.find((t) => t.attrs.id === id);
    assert.match(INDEX.slice(b.end, INDEX.indexOf('</button>', b.end)), /<span class="ui-key-hint" data-action="confirm" aria-hidden="true"><\/span>/, `#${id}: its controller glyph`);
  }
  const resume = html.find((t) => t.attrs.id === 'p-resume');
  assert.match(INDEX.slice(resume.end, INDEX.indexOf('</button>', resume.end)), /data-action="back"/, 'Esc on Resume');
  const play = html.find((t) => t.attrs.id === 'rp-play');
  assert.match(INDEX.slice(play.end, INDEX.indexOf('</button>', play.end)), /<kbd class="ui-key-hint__key">Space<\/kbd>/, 'Space on the replay\'s Play');
});

const SHOTS = process.env.MS_SHOTS === '1';

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

// ---------------------------------------------------------------- the icon set and the leading-icon slot

// The canvas's stroke icons, path for path (J-Components and the screens draw them).
const CANVAS_ICONS = {
  'arrow-left': [['path', { d: 'M19 12H5M11 6l-6 6 6 6' }]],
  play: [['path', { d: 'M7 4l12 8-12 8z' }]],
  pause: [['rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }], ['rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }]],
  restart: [['path', { d: 'M3 12a9 9 0 1 0 3-6.7' }], ['path', { d: 'M3 4v5h5' }]],
  refresh: [['path', { d: 'M21 12a9 9 0 1 1-3-6.7' }], ['path', { d: 'M21 4v5h-5' }]],
  copy: [['rect', { x: '8', y: '8', width: '12', height: '12', rx: '2' }], ['path', { d: 'M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3' }]],
  link: [['path', { d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1' }], ['path', { d: 'M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1' }]],
  chart: [['path', { d: 'M3 3v18h18' }], ['path', { d: 'M7 15l4-5 3 3 5-7' }]],
  shuffle: [['path', { d: 'M3 6h4l10 12h4M3 18h4l3-3.6M14 9.6L17 6h4M18 3l3 3-3 3M18 15l3 3-3 3' }]],
  grid: [['rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }], ['path', { d: 'M9 3v18M15 3v18M3 9h18M3 15h18' }]],
  speaker: [['path', { d: 'M4 9h4l5-4v14l-5-4H4z' }], ['path', { d: 'M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12' }]],
  camera: [['path', { d: 'M4 8h3l2-3h6l2 3h3v11H4z' }], ['circle', { cx: '12', cy: '13', r: '3.5' }]],
  download: [['path', { d: 'M12 3v12M7 10l5 5 5-5M4 21h16' }]],
  upload: [['path', { d: 'M4 20h16M12 16V4M7 9l5-5 5 5' }]],
  trash: [['path', { d: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' }]],
  mouse: [['rect', { x: '6', y: '3', width: '12', height: '18', rx: '6' }], ['path', { d: 'M12 7v4' }]],
  hand: [['path', { d: 'M8 13V5a1.5 1.5 0 0 1 3 0v6M11 11V4a1.5 1.5 0 0 1 3 0v7M14 11V5.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.6-2.2L3 16a1.6 1.6 0 0 1 2.4-2.1L8 16' }]],
  cube: [['path', { d: 'M12 2l9 5v10l-9 5-9-5V7z' }], ['path', { d: 'M12 12l9-5M12 12v10M12 12L3 7' }]],
  pin: [['path', { d: 'M9 3h6l-1 6 4 4H6l4-4z' }], ['path', { d: 'M12 13v8' }]],
  check: [['path', { d: 'M5 12l5 5 9-10' }]],
  // the title bar's window buttons
  minimise: [['path', { d: 'M6 17h12' }]],
  fullscreen: [['path', { d: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5' }]],
  windowed: [['path', { d: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5' }]],
  info: [['circle', { cx: '12', cy: '12', r: '9' }], ['path', { d: 'M12 11v6M12 7.5v.5' }]],
  warning: [['path', { d: 'M12 3l10 18H2z' }], ['path', { d: 'M12 10v5M12 18v.5' }]],
};

// A document of stub elements: enough of the DOM for the icon and button helpers under Node.
function stubDocument() {
  const doc = {};
  const element = (ns, tag) => {
    const el = {
      namespaceURI: ns, localName: tag, ownerDocument: doc, attrs: {}, children: [], parentNode: null, textContent: '',
      classList: {
        contains: (c) => (el.attrs.class ?? '').split(/\s+/).includes(c),
        toggle: (c, on) => {
          const list = (el.attrs.class ?? '').split(/\s+/).filter((x) => x && x !== c);
          el.attrs.class = (on ? [...list, c] : list).join(' ');
        },
      },
      setAttribute(k, v) { el.attrs[k] = String(v); },
      getAttribute(k) { return el.attrs[k] ?? null; },
      hasAttribute(k) { return k in el.attrs; },
      removeAttribute(k) { delete el.attrs[k]; },
      append(...nodes) { for (const n of nodes) { if (typeof n === 'string') { el.textContent += n; continue; } n.parentNode = el; el.children.push(n); } },
      prepend(n) { n.parentNode = el; el.children.unshift(n); },
      remove() { const p = el.parentNode; if (p) p.children.splice(p.children.indexOf(el), 1); el.parentNode = null; },
      querySelector(sel) { return el.querySelectorAll(sel)[0] ?? null; },
      querySelectorAll(sel) {
        const out = [];
        const match = (n) => (sel === ':scope > .ui-icon' ? n.parentNode === el && n.classList.contains('ui-icon')
          : sel === ':scope > .ui-logo__word' ? n.parentNode === el && n.classList.contains('ui-logo__word')
          : sel === '.ui-logo' ? n.classList.contains('ui-logo')
          : sel === ':scope > .ui-note__text' ? n.parentNode === el && n.classList.contains('ui-note__text')
            : sel === '.ui-button[data-icon], .ui-note[data-icon]' ? (n.classList.contains('ui-button') || n.classList.contains('ui-note')) && 'data-icon' in n.attrs : false);
        const walk = (n) => { for (const c of n.children) { if (match(c)) out.push(c); walk(c); } };
        walk(el);
        return out;
      },
      get firstChild() { return el.children[0] ?? null; },
    };
    Object.defineProperty(el, 'className', { get: () => el.attrs.class ?? '', set: (v) => { el.attrs.class = v; } });
    Object.defineProperty(el, 'type', { get: () => el.attrs.type ?? '', set: (v) => { el.attrs.type = v; } });
    Object.defineProperty(el, 'dataset', { get: () => new Proxy({}, { get: (_, k) => el.attrs[`data-${String(k)}`] }) });
    return el;
  };
  doc.createElement = (tag) => element('http://www.w3.org/1999/xhtml', tag);
  doc.createElementNS = (ns, tag) => element(ns, tag);
  return doc;
}
const SVG_NS = 'http://www.w3.org/2000/svg';

test('the icon set holds the canvas\'s stroke icons path for path, each drawn in currentColor on a 24 px grid', () => {
  for (const [name, shapes] of Object.entries(CANVAS_ICONS)) {
    assert.ok(ICONS[name], `the set holds ${name}`);
    assert.deepEqual(ICONS[name].shapes.map(([tag, attrs]) => [tag, { ...attrs }]), shapes, `${name} is the canvas's, path for path`);
  }
  assert.ok(Object.isFrozen(ICONS) && Object.values(ICONS).every((i) => Object.isFrozen(i)), 'the set is frozen data');
  for (const [name, icon] of Object.entries(ICONS)) {
    assert.equal(icon.stroke, name === 'check' ? 3 : name === 'close' ? 2.6 : ['minimise', 'fullscreen', 'windowed'].includes(name) ? 2.4 : 2.3, `${name}'s stroke is the canvas's`);
    const svg = iconMarkup(name);
    assert.match(svg, /^<svg class="ui-icon" data-icon="[\w-]+" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="[\d.]+" stroke-linecap="round" stroke-linejoin="round">/, `${name} draws in currentColor`);
    assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|rgb|width="\d+px"/i, `${name} carries no colour of its own`);
  }
  assert.equal(iconMarkup('arrow-left'), '<svg class="ui-icon" data-icon="arrow-left" aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>');
  assert.throws(() => iconMarkup('nope'), /no icon named nope/);
});

test('createIcon builds an icon in the SVG namespace, hidden from assistive technology', () => {
  const doc = stubDocument();
  const svg = createIcon(doc, 'pause');
  assert.equal(svg.namespaceURI, SVG_NS);
  assert.equal(svg.localName, 'svg');
  assert.deepEqual(svg.attrs, { class: 'ui-icon', 'data-icon': 'pause', 'aria-hidden': 'true', focusable: 'false', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.3', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
  assert.deepEqual(svg.children.map((c) => [c.namespaceURI, c.localName, c.attrs]), [
    [SVG_NS, 'rect', { x: '6', y: '4', width: '4', height: '16', rx: '1' }],
    [SVG_NS, 'rect', { x: '14', y: '4', width: '4', height: '16', rx: '1' }],
  ]);
  assert.throws(() => createIcon(doc, 'nope'), /no icon named nope/);
});

test('a button takes a leading icon before its label and keeps the label as its name; an icon-only button is named by aria-label', () => {
  const doc = stubDocument();
  const play = createButton(doc, { label: 'Play', icon: 'play', variant: 'go', size: 'lg' });
  assert.equal(play.localName, 'button');
  assert.equal(play.type, 'button');
  assert.equal(play.className, 'ui-button ui-button--primary ui-button--go ui-button--lg', 'the primary button in its green');
  assert.throws(() => createButton(doc, { label: 'Play', variant: 'primary' }), /unknown variant/, 'a primary button always takes go or stop');
  assert.equal(play.children[0].attrs['data-icon'], 'play', 'the icon leads');
  assert.equal(play.children[0].attrs['aria-hidden'], 'true');
  assert.equal(play.textContent, 'Play', 'the label is the name');
  assert.equal(play.getAttribute('aria-label'), null, 'a labelled button needs no aria-label');
  assert.equal(createButton(doc, { label: 'Records' }).className, 'ui-button ui-button--secondary', 'secondary md by default, no icon');
  assert.equal(createButton(doc, { label: 'Records' }).children.length, 0);
  const trash = createButton(doc, { label: 'Delete replay', icon: 'trash', variant: 'quiet', size: 'sm', iconOnly: true });
  assert.equal(trash.getAttribute('aria-label'), 'Delete replay', 'an icon-only button is named');
  assert.equal(trash.textContent, '', 'and shows no text');
  assert.equal(trash.children.length, 1);
  assert.throws(() => createButton(doc, { label: '', icon: 'trash', iconOnly: true }), /needs a label/);
  // setButtonIcon replaces the leading icon, or removes it.
  const swap = setButtonIcon(play, 'restart');
  assert.equal(play.children.length, 1, 'one leading icon');
  assert.equal(play.children[0], swap);
  assert.equal(swap.attrs['data-icon'], 'restart');
  assert.equal(setButtonIcon(play, null), null);
  assert.equal(play.children.length, 0, 'no icon');
  // applyIcons fills every .ui-button[data-icon] in markup, once.
  const root = doc.createElement('div');
  const marked = doc.createElement('button');
  marked.className = 'ui-button ui-button--secondary';
  marked.setAttribute('data-icon', 'chart');
  marked.append('Records');
  root.append(marked);
  applyIcons(root);
  applyIcons(root);
  assert.deepEqual(marked.children.map((c) => c.attrs['data-icon']), ['chart'], 'its icon, once');
  assert.equal(marked.textContent, 'Records');
});

test('the leading-icon slot: 18 px before the label with the button\'s 10 px gap, 24 px on a large button, 14 px on a code chip\'s buttons', () => {
  const slot = (sel) => RULES.filter(([x]) => x === sel).map(([, b]) => b).join(';');
  assert.match(slot('.ui-icon'), /flex:\s*none/);
  assert.match(slot('.ui-icon'), /width:\s*18px;\s*height:\s*18px/);
  assert.match(slot('.ui-button--lg > .ui-icon'), /width:\s*24px;\s*height:\s*24px/);
  assert.match(slot('.ui-code .ui-button > .ui-icon'), /width:\s*14px;\s*height:\s*14px/);
  assert.match(slot('.ui-button'), /gap:\s*10px/, 'the button\'s own gap sets the icon off its label');
  assert.match(slot('.ui-button'), /align-items:\s*center/);
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-icon — the icon set/, 'the catalogue documents the icon set');
  for (const name of Object.keys(ICONS)) assert.ok(head.includes(name), `the catalogue names ${name}`);
  const icon = KIT_CATALOGUE.find((c) => c.name === 'ui-icon');
  assert.ok(icon, 'the kit catalogue declares the icon');
  assert.equal(icon.kind, 'composition', 'drawn in its control\'s ink, so no theme rule of its own');
});

test('the gallery shows the icon set, a button of each size with its icon, a code chip\'s icons and an icon-only button', () => {
  assert.match(GALLERY, /import \{[^}]*\bICONS\b[^}]*\bapplyIcons\b[^}]*\} from '\.\.\/js\/ui\/components\.js'/, 'the gallery draws from the one icon source');
  assert.ok(TAGS.some((t) => t.attrs.id === 'g-icon-set'), 'the set has its place');
  const iconed = TAGS.filter((t) => hasClasses(t, '.ui-button') && t.attrs['data-icon']);
  for (const [size, pred] of [['sm', (t) => hasClasses(t, '.ui-button--sm')], ['md', (t) => !hasClasses(t, '.ui-button--sm') && !hasClasses(t, '.ui-button--lg')], ['lg', (t) => hasClasses(t, '.ui-button--lg')]]) {
    assert.ok(iconed.some(pred), `a ${size} button with an icon`);
  }
  const chip = section(GALLERY, '<!-- component: code chip -->', '<!-- /component: code chip -->');
  assert.match(chip, /data-copy="code"[^>]*data-icon="copy"/, 'Copy carries the copy icon');
  assert.match(chip, /data-copy="link"[^>]*data-icon="link"/, 'Copy link the link icon');
  const only = iconed.filter((t) => t.attrs['data-icon'] === 'trash' && t.attrs['aria-label']);
  assert.ok(only.length > 0, 'an icon-only button, named');
});

// ---------------------------------------------------------------- the feedback parts: the confirm box and the notes

test('the confirm box: the danger fill, radius 16, 16px 18px padding, a 12 px gap, no border and no drop; 17 px bold ink text, a 24 px heading, its actions side by side', () => {
  assert.match(baseRule('.ui-confirm'), /display:\s*flex;\s*flex-direction:\s*column/);
  assert.match(baseRule('.ui-confirm'), /gap:\s*var\(--space-3\)/);
  assert.match(baseRule('.ui-confirm'), /padding:\s*var\(--space-4\) 18px/);
  assert.match(baseRule('.ui-confirm__text'), /font-size:\s*17px;\s*font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(baseRule('.ui-confirm__title'), /font-size:\s*24px/);
  assert.match(baseRule('.ui-confirm .ui-actions'), /gap:\s*10px/, 'the danger action beside Cancel, 10 px apart');
  assert.match(baseRule('.ui-confirm--row'), /flex-direction:\s*row;\s*flex-wrap:\s*wrap;\s*align-items:\s*center/, 'the row variant lays its text and actions on one line');
  assert.match(baseRule('.ui-table td:has(> .ui-confirm--row)'), /padding:\s*0/, 'the row variant fills its table cell');
  const box = themeRule('.ui-confirm');
  assert.match(box, /background:\s*var\(--color-danger-fill\)/);
  assert.match(box, /border-radius:\s*var\(--radius-lg\)/);
  assert.doesNotMatch(box, /box-shadow|border:/, 'no border and no drop');
  for (const part of ['.ui-confirm__title', '.ui-confirm__text']) assert.match(themeRulesFor(part).map(([, b]) => b).join(';'), /color:\s*var\(--color-ink\)/, part);
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-confirm — /, 'the catalogue documents the confirm box');
  const confirm = KIT_CATALOGUE.find((c) => c.name === 'ui-confirm');
  assert.deepEqual(confirm.variants, ['ui-confirm--row']);
  assert.deepEqual(confirm.parts.map((p) => [p.name, p.optional]), [['title', true], ['text', false]]);
  assert.match(themeRule('.ui-confirm--row'), /border-radius:\s*0/, 'a table row of the fill, square');
});

test('the warn and err notes: radius 8, 6px 10px padding, 14 px bold, a 16 px leading icon; warn in the warning ink on its fill, err in the danger colour on its fill', () => {
  assert.match(baseRule('.ui-note'), /display:\s*flex/);
  assert.match(baseRule('.ui-note'), /gap:\s*var\(--space-2\)/);
  assert.match(baseRule('.ui-note'), /padding:\s*6px 10px/);
  assert.match(baseRule('.ui-note'), /font-size:\s*14px;\s*font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(baseRule('.ui-note > .ui-icon'), /width:\s*16px;\s*height:\s*16px/);
  assert.match(themeRule('.ui-note'), /border-radius:\s*var\(--radius-sm\)/);
  assert.match(themeRule('.ui-note--warn'), /background:\s*var\(--color-warning-fill\);\s*color:\s*var\(--color-warning\)/);
  assert.match(themeRule('.ui-note--err'), /background:\s*var\(--color-danger-fill\);\s*color:\s*var\(--color-danger\)/);
  assert.match(baseRule('.ui-text--success'), /font-weight:\s*var\(--font-weight-bold\)/, 'a valid code\'s line is bold');
  assert.match(themeRule('.ui-text--success'), /color:\s*var\(--color-success\)/, 'in the success colour');
  const note = KIT_CATALOGUE.find((c) => c.name === 'ui-note');
  assert.deepEqual(note.variants, ['ui-note--warn', 'ui-note--err']);
  assert.deepEqual(note.parts, [], 'its icon is the kit\'s, in the note\'s ink; its text is plain');
  assert.deepEqual(KIT_CATALOGUE.find((c) => c.name === 'ui-text').variants, ['ui-text--muted', 'ui-text--warning', 'ui-text--success']);
  assert.deepEqual(NOTE_TONES, ['warn', 'err']);
});

test('setNote writes a note\'s text after its leading icon and sets its tone and icon; applyIcons draws a marked note\'s icon', () => {
  const doc = stubDocument();
  const line = doc.createElement('p');
  line.className = 'ui-text ui-text--muted';
  line.textContent = 'Paste a board code to play that exact board.';
  setNote(line, 'This is a 3D board code.', { tone: 'warn', icon: 'info' });
  assert.equal(line.className, 'ui-text ui-text--muted ui-note ui-note--warn', 'the line becomes a warn note');
  assert.deepEqual(line.children.map((c) => c.attrs.class), ['ui-icon', 'ui-note__text'], 'its icon leads its text');
  assert.equal(line.children[0].attrs['data-icon'], 'info');
  assert.equal(line.getAttribute('data-icon'), 'info');
  assert.equal(line.children[1].textContent, 'This is a 3D board code.');
  setNote(line, 'This code is incomplete.', { tone: 'err', icon: 'warning' });
  assert.equal(line.className, 'ui-text ui-text--muted ui-note ui-note--err');
  assert.deepEqual(line.children.map((c) => c.attrs['data-icon'] ?? c.attrs.class), ['warning', 'ui-note__text'], 'one icon, replaced');
  setNote(line, 'A valid code.', { tone: null, icon: null });
  assert.equal(line.className, 'ui-text ui-text--muted', 'a plain line again');
  assert.deepEqual(line.children.map((c) => c.attrs.class), ['ui-note__text'], 'with no icon');
  assert.equal(line.getAttribute('data-icon'), null);
  // A marked note in markup keeps its tone and icon; only its text changes.
  const root = doc.createElement('div');
  const refusal = doc.createElement('p');
  refusal.className = 'ui-note ui-note--warn';
  refusal.setAttribute('data-icon', 'warning');
  root.append(refusal);
  applyIcons(root);
  assert.deepEqual(refusal.children.map((c) => c.attrs['data-icon']), ['warning'], 'applyIcons draws a note\'s icon');
  setNote(refusal, 'Mines must be a whole number from 1 to 99.');
  assert.deepEqual(refusal.children.map((c) => c.attrs['data-icon'] ?? c.attrs.class), ['warning', 'ui-note__text']);
  setNote(refusal, 'Height must be a whole number.');
  assert.equal(refusal.children.length, 2, 'the text part is reused');
  assert.equal(refusal.children[1].textContent, 'Height must be a whole number.');
  assert.equal(refusal.className, 'ui-note ui-note--warn');
  assert.match(read('js/main.js'), /applyIcons\(document\.body\)/, 'the game draws the icons its markup names');
});

test('the gallery shows the confirm box, with and without its heading and as a table row, and both notes with their icons', () => {
  const part = section(GALLERY, '<!-- component: feedback -->', '<!-- /component: feedback -->');
  assert.ok(part.length > 0, 'the gallery has the feedback parts');
  const t = tags(part);
  const boxes = t.filter((x) => hasClasses(x, '.ui-confirm'));
  assert.ok(boxes.some((x) => !hasClasses(x, '.ui-confirm--row')), 'a confirm box');
  assert.ok(boxes.some((x) => hasClasses(x, '.ui-confirm--row')), 'the row variant');
  assert.ok(t.some((x) => hasClasses(x, '.ui-confirm__title')), 'a heading');
  assert.match(part, /<td colspan="\d+"><div class="ui-confirm ui-confirm--row"/, 'the row variant in a table row');
  assert.match(part, /<div class="ui-actions ui-actions--row"><button type="button" class="ui-button ui-button--danger">Confirm<\/button><button type="button" class="ui-button ui-button--secondary">Cancel<\/button><\/div>/, 'Confirm, then Cancel');
  for (const [tone, icon] of [['warn', 'info'], ['warn', 'warning'], ['err', 'warning']]) {
    assert.ok(t.some((x) => hasClasses(x, `.ui-note.ui-note--${tone}`) && x.attrs['data-icon'] === icon), `a ${tone} note with the ${icon} icon`);
  }
  assert.ok(t.some((x) => hasClasses(x, '.ui-text.ui-text--success')), 'a valid code\'s line');
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
const PLAY_TILES = ['classic-2d', 'hexagon', 'triangle', 'surface', '3d', 'daily'];

test('the gallery marks the shared layout\'s components; the main menu, both board choices, the Daily screen, the placeholder, the pause card, the results, the Records screen, the Settings page, the replay viewer, the 3D ready card, the context-lost card, the Learn 3D end card, the Classic 2D game window, the fatal card and the no-JavaScript notice are the screens built from them so far', () => {
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
  const ready = screens.slice(screens.indexOf('<section id="ready"'), screens.indexOf('<section id="ctx-lost"'));
  const ctxLost = screens.slice(screens.indexOf('<section id="ctx-lost"'), screens.indexOf('<section id="settings"'));
  const learnEnd = screens.slice(screens.indexOf('<section id="learn-end"'), screens.indexOf('<section id="pause"'));
  const noscript = screens.slice(screens.indexOf('<noscript>'), screens.indexOf('</noscript>'));
  const fatal = screens.slice(screens.indexOf('<template id="fatal-card">'), screens.indexOf('</template>'));
  const game2d = screens.slice(screens.indexOf('<section id="c2d"'), screens.indexOf('<section id="c2d-status"'));
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hints', 'ui-counter-strip', 'ui-counter', 'ui-figures', 'ui-figure', 'ui-divider', 'ui-actions']) {
    assert.match(game2d, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Classic 2D game window uses ${cls}`);
  }
  for (const html of [noscript, fatal]) for (const cls of ['ui-backdrop', 'ui-card', 'ui-card__icon', 'ui-card__title']) assert.match(html, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the message cards use ${cls}`);
  for (const cls of ['ui-card', 'ui-screen', 'ui-button--lg', 'ui-button--sm', 'ui-key-hint', 'ui-section-label', 'ui-panel--muted', 'ui-note--warn']) {
    assert.match(ready, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the 3D ready card uses ${cls}`);
  }
  assert.doesNotMatch(ready, /class="[^"]*\bui-banner\b/, 'the Learn 3D line is a plain success line, not a banner');
  for (const cls of ['ui-card', 'ui-screen', 'ui-card__title', 'ui-actions--row']) {
    assert.match(ctxLost, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the context-lost card uses ${cls}`);
  }
  for (const cls of ['ui-card', 'ui-screen', 'ui-section-label', 'ui-card__title', 'ui-button--lg', 'ui-key-hint']) {
    assert.match(learnEnd, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Learn 3D end card uses ${cls}`);
  }
  for (const card of [ready, ctxLost, learnEnd]) assert.doesNotMatch(card, /class="[^"]*\b(ready-card|link-btn|esc-row)\b/, 'no one-off card or link button');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hint', 'ui-key-hints', 'ui-chip', 'ui-spinner', 'ui-counter-strip', 'ui-counter', 'ui-code', 'ui-segmented', 'ui-slider__input', 'ui-figures']) {
    assert.match(replay, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the replay viewer uses ${cls}`);
  }
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-logo']) assert.match(settings, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Settings page uses ${cls}`);
  assert.doesNotMatch(settings, /class="[^"]*\bui-card(?![\w-])/, 'the Settings page holds no card');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-logo', 'ui-divider', 'ui-tabs', 'ui-checkbox', 'ui-table', 'ui-panel--muted', 'ui-stat--tile']) {
    assert.match(records, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Records screen uses ${cls}`);
  }
  assert.doesNotMatch(records, /class="[^"]*\bui-card(?![\w-])/, 'the Records screen holds no card');
  for (const cls of ['ui-frame', 'ui-key-hint', 'ui-chip', 'ui-chip--best', 'ui-stat--tile', 'ui-table']) assert.match(results, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the results screen uses ${cls}`);
  assert.doesNotMatch(results, /class="[^"]*\bui-card(?![\w-])/, 'the results screen holds no card');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-key-hint']) assert.match(soon, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the placeholder uses ${cls}`);
  assert.doesNotMatch(soon, /class="[^"]*\bui-card(?![\w-])/, 'the placeholder holds no card');
  for (const cls of ['ui-section-label', 'ui-button--danger', 'ui-key-hint', 'ui-panel--muted']) assert.match(pause, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the pause card uses ${cls}`);
  const others = screens.replace(menu, '').replace(choice, '').replace(choice3d, '').replace(daily, '').replace(soon, '').replace(pause, '').replace(results, '').replace(records, '').replace(settings, '').replace(replay, '')
    .replace(ready, '').replace(ctxLost, '').replace(learnEnd, '').replace(noscript, '').replace(fatal, '').replace(game2d, '');
  for (const cls of ['ui-frame', 'ui-logo', 'ui-play-tile', 'ui-small-entry']) {
    assert.match(menu, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the main menu uses ${cls}`);
  }
  for (const [name, html] of [['Classic 2D', choice], ['3D', choice3d]]) {
    for (const cls of ['ui-backdrop', 'ui-logo', 'ui-frame', 'ui-option', 'ui-section-label', 'ui-divider', 'ui-key-hint', 'ui-stat--tile', 'ui-button--quiet', 'ui-drawer']) {
      assert.match(html, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the ${name} board choice uses ${cls}`);
    }
    assert.doesNotMatch(html, /class="[^"]*\bui-chip(?![\w-])/, `the ${name} board choice carries no chip`);
  }
  assert.match(choice3d, /class="ui-option ui-option--learn"/, 'the 3D board choice uses ui-option--learn');
  for (const cls of ['ui-backdrop', 'ui-logo', 'ui-frame', 'ui-option', 'ui-section-label', 'ui-divider', 'ui-key-hint', 'ui-chip', 'ui-scene-panel', 'ui-code']) {
    assert.match(daily, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `the Daily screen uses ${cls}`);
  }
  assert.doesNotMatch(daily, /class="[^"]*\bui-card(?![\w-])/, 'the Daily screen holds no card');
  for (const cls of ['ui-backdrop', 'ui-frame', 'ui-option', 'ui-section-label', 'ui-list-row', 'ui-divider', 'ui-tabs', 'ui-checkbox',
    'ui-table', 'ui-button--danger', 'ui-play-tile', 'ui-small-entry', 'ui-scene-panel']) {
    assert.doesNotMatch(others, new RegExp(`class="[^"]*\\b${cls}(?![\\w-])`), `no other screen uses ${cls} yet`);
  }
});

test('screen frame: a named section on the backdrop with its title bar (Back, the logo, the window buttons), its heading (the title, the action), body, foot and the window-chrome slot', () => {
  const backdrop = within(LAYOUT_TAGS, '.ui-backdrop')[0];
  assert.ok(backdrop, 'a page backdrop');
  const frames = within(inside(LAYOUT, LAYOUT_TAGS, backdrop), '.ui-frame');
  assert.ok(frames.length >= 2, 'frames sit on the backdrop: one with a status line, one with a bottom bar');
  for (const frame of frames) {
    assert.equal(frame.tag, 'section');
    const parts = inside(LAYOUT, LAYOUT_TAGS, frame);
    const heading = within(parts, '.ui-frame__heading')[0];
    const title = within(parts, '.ui-frame__title')[0];
    assert.ok(title && /^h[1-6]$/.test(title.tag), 'the title is a heading');
    assert.ok(heading && inside(LAYOUT, LAYOUT_TAGS, heading).includes(title), 'the title sits in the heading over the body');
    assert.equal(frame.attrs['aria-labelledby'], title.attrs.id, 'the frame is named by its title');
    const head = within(parts, '.ui-frame__head')[0];
    assert.equal(head.tag, 'header');
    assert.ok(head.index < heading.index && heading.index < within(parts, '.ui-frame__body')[0].index, 'the title bar, then the heading, then the body');
    const chrome = within(parts, '.ui-frame__chrome')[0];
    assert.ok(chrome, 'the window-chrome slot is in the markup');
    assert.equal(chrome.attrs['data-slot'], 'window-chrome');
    assert.equal(chrome.attrs['aria-hidden'], 'true', 'decoration only');
    assert.ok(chrome.index < head.index, 'the chrome slot opens the frame, above its head');
    const inHead = inside(LAYOUT, LAYOUT_TAGS, head);
    const start = within(inHead, '.ui-frame__start')[0];
    assert.ok(start && within(inHead, '.ui-frame__end').length === 1, 'the head\'s start and end cells');
    const back = within(inside(LAYOUT, LAYOUT_TAGS, start), '.ui-button.ui-button--secondary.ui-frame__back')[0];
    assert.ok(back && back.attrs['data-icon'] === 'arrow-left' && back.attrs['aria-label'] && back.attrs.title === 'Back', 'the head\'s start holds Back: its arrow, named, with its tooltip');
    assert.equal(within(inside(LAYOUT, LAYOUT_TAGS, back), '.ui-key-hint').length, 0, 'the title bar\'s Back shows its icon alone');
    const logo = within(inHead, '.ui-logo.ui-frame__logo')[0];
    assert.ok(logo && logo.tag === 'h1' && logo.attrs['aria-label'] === 'Minesweeper 3D', 'the logo in the centre, named');
    const windowButtons = within(inHead, '.ui-frame__window .ui-button'.split(' ')[1]).filter((t) => 'data-window' in t.attrs);
    assert.deepEqual(windowButtons.map((t) => t.attrs['data-window']), WINDOW_BUTTONS, 'Minimise, Fullscreen and Quit at the end');
    assert.equal(within(parts, '.ui-frame__body').length, 1, 'one body');
    const foot = within(parts, '.ui-frame__foot')[0];
    assert.equal(foot.tag, 'footer');
  }
  const feet = frames.map((f) => inside(LAYOUT, LAYOUT_TAGS, f));
  assert.ok(feet.some((p) => within(p, '.ui-frame__status').length === 1), 'a foot as a status line');
  assert.ok(feet.some((p) => within(p, '.ui-frame__summary').length === 1 && within(p, '.ui-actions.ui-actions--row').length === 1), 'a foot as a bottom bar: the summary beside the actions');
  assert.ok(feet.some((p) => within(p, '.ui-frame__action').some((a) => p.some((t) => t.index > a.index && hasClasses(t, '.ui-button')))), 'a heading with its control at the right');
});

// The desktop windows whose head is the title bar, by frame id, with their Back's id (none on the main menu).
const TITLE_BARS = {
  'menu-frame': null, 'c2d-choice-frame': 'c2d-choice-back', 'hex-choice-frame': 'hex-choice-back', 'tri-choice-frame': 'tri-choice-back', 'board-choice-frame': 'board-choice-back', 'daily-frame': 'daily-back',
  'records-frame': 'records-back', 'settings-frame': 'settings-back', 'replay-frame': 'rp-back', 'coming-soon-frame': 'coming-soon-menu',
  'c2d-frame': null,
};
const INDEX_TAGS = tags(INDEX);
const frameParts = (id) => inside(INDEX, INDEX_TAGS, INDEX_TAGS.find((t) => t.attrs.id === id));

test('the title bar on every desktop window: Back as its arrow alone (none on the main menu), the logo in the centre, Minimise, Fullscreen and Quit at the end, each icon-only, named, with its tooltip', () => {
  for (const [id, backId] of Object.entries(TITLE_BARS)) {
    const parts = frameParts(id);
    assert.ok(parts.length > 0, `#${id} is in index.html`);
    const head = within(parts, '.ui-frame__head')[0];
    const inHead = inside(INDEX, INDEX_TAGS, head);
    const cells = inHead.filter((t) => hasClasses(t, '.ui-frame__start') || hasClasses(t, '.ui-frame__logo') || hasClasses(t, '.ui-frame__end'));
    assert.deepEqual(cells.map((t) => classesOf(t).find((c) => /^ui-frame__(start|logo|end)$/.test(c))), ['ui-frame__start', 'ui-frame__logo', 'ui-frame__end'], `#${id}: Back's cell, the logo, the end`);
    const logo = cells[1];
    assert.ok(logo.tag === 'h1' && hasClasses(logo, '.ui-logo') && logo.attrs['aria-label'] === 'Minesweeper 3D', `#${id}: the game logo, named`);
    const start = inside(INDEX, INDEX_TAGS, cells[0]).filter((t) => t.tag === 'button');
    if (backId) {
      assert.deepEqual(start.map((t) => t.attrs.id), [backId], `#${id}: Back at the start`);
      const back = start[0];
      assert.ok(hasClasses(back, '.ui-button.ui-button--secondary.ui-button--sm.ui-frame__back') && back.attrs['data-icon'] === 'arrow-left', `#${id}: Back is the arrow icon`);
      assert.ok(back.attrs['aria-label'] && back.attrs.title === 'Back', `#${id}: Back named, with its tooltip`);
      assert.equal(inside(INDEX, INDEX_TAGS, back).length, 0, `#${id}: Back shows its icon alone`);
    } else if (id === 'menu-frame') {
      assert.equal(start.length, 0, 'no Back on the main menu');
    }
    const group = within(inHead, '.ui-frame__window')[0];
    assert.ok(group && group.attrs.role === 'group' && group.attrs['aria-label'] === 'Window', `#${id}: the window buttons in a named group`);
    const buttons = inside(INDEX, INDEX_TAGS, group).filter((t) => t.tag === 'button');
    assert.deepEqual(buttons.map((t) => [t.attrs['data-window'], t.attrs['aria-label'], t.attrs.title, t.attrs['data-icon']]),
      [['minimise', 'Minimise', 'Minimise', 'minimise'], ['fullscreen', 'Fullscreen', 'Fullscreen', 'fullscreen'], ['quit', 'Quit', 'Quit', 'close']], `#${id}: Minimise, Fullscreen, Quit`);
    for (const b of buttons) assert.equal(inside(INDEX, INDEX_TAGS, b).length, 0, `#${id}: ${b.attrs['data-window']} shows its icon alone`);
    assert.ok(hasClasses(buttons[2], '.ui-button.ui-button--primary.ui-button--stop.ui-button--sm'), `#${id}: Quit is the stop button`);
    assert.ok(buttons.slice(0, 2).every((b) => hasClasses(b, '.ui-button.ui-button--secondary.ui-button--sm')), `#${id}: Minimise and Fullscreen secondary`);
  }
  // The window buttons' icons are the set's; Quit the close cross.
  for (const name of ['minimise', 'fullscreen', 'windowed', 'close']) assert.ok(ICONS[name], `the set holds ${name}`);
  assert.equal((INDEX.match(/data-window="quit"/g) ?? []).length, Object.keys(TITLE_BARS).length, 'one Quit per title bar, none elsewhere');
});

test('every screen\'s name is the heading at the top of its window\'s body, its control at the heading\'s right; the main menu and the Classic 2D game window have none', () => {
  const headings = { 'c2d-choice-frame': 'c2d-choice-title', 'board-choice-frame': 'board-choice-title', 'daily-frame': 'daily-title', 'records-frame': 'records-title',
    'settings-frame': 'settings-title', 'replay-frame': 'replay-title', 'coming-soon-frame': 'coming-soon-title' };
  for (const [id, titleId] of Object.entries(headings)) {
    const parts = frameParts(id);
    const frame = INDEX_TAGS.find((t) => t.attrs.id === id);
    const heading = within(parts, '.ui-frame__heading')[0];
    assert.ok(heading, `#${id} has its heading`);
    const head = within(parts, '.ui-frame__head')[0];
    const body = within(parts, '.ui-frame__body')[0];
    assert.ok(head.index < heading.index && heading.index < body.index, `#${id}: the heading between the title bar and the body`);
    const title = inside(INDEX, INDEX_TAGS, heading).find((t) => hasClasses(t, '.ui-frame__title'));
    assert.ok(title && title.tag === 'h2' && title.attrs.id === titleId, `#${id}: its title #${titleId} in the heading`);
    assert.equal(frame.attrs['aria-labelledby'], titleId, `#${id}: named by its heading`);
    assert.equal(within(inside(INDEX, INDEX_TAGS, head), '.ui-frame__title').length, 0, `#${id}: no title in the title bar`);
  }
  // Records' 2D | 3D switch sits at the right of its heading; the board choices keep the slot their panel toggle takes.
  const action = (id) => inside(INDEX, INDEX_TAGS, within(frameParts(id), '.ui-frame__action')[0]);
  assert.ok(action('records-frame').some((t) => t.attrs.id === 'records-mode'), 'Records\' mode switch at its heading\'s right');
  for (const id of ['c2d-choice-frame', 'board-choice-frame']) assert.ok(within(frameParts(id), '.ui-frame__action').length === 1, `#${id}: the heading's action slot`);
  assert.equal(within(frameParts('menu-frame'), '.ui-frame__heading').length, 0, 'the main menu has no heading: the logo names it');
  assert.equal(INDEX_TAGS.find((t) => t.attrs.id === 'menu-frame').attrs['aria-labelledby'], 'menu-title', 'the menu\'s window is named by its logo');
  assert.equal(within(frameParts('c2d-frame'), '.ui-frame__heading').length, 0, 'the game window has no heading: its foot line names it');
});

test('no large game title remains: the wordmark is gone from every screen, the kit and the gallery; the logo is catalogued in its place', () => {
  for (const [f, src] of [['index.html', INDEX], ['css/components.css', RAW], ['css/style.css', read('css/style.css')], ['theme.css', THEME_RAW], ['dev/components.html', GALLERY]]) {
    assert.doesNotMatch(src, /ui-wordmark|-wordmark"|#(c2d-choice|board-choice|daily)-top\b/, `${f} carries no wordmark`);
  }
  assert.equal(KIT_CATALOGUE.find((c) => c.name === 'ui-wordmark'), undefined, 'the wordmark leaves the catalogue');
  const logo = KIT_CATALOGUE.find((c) => c.name === 'ui-logo');
  assert.deepEqual(logo.parts.map((x) => [x.name, x.selector]), [['word', '.ui-logo__word'], ['letter', '.ui-logo__letter']]);
  const frame = KIT_CATALOGUE.find((c) => c.name === 'ui-frame');
  assert.deepEqual(frame.parts.map((x) => x.name), ['head', 'back', 'logo', 'window', 'minimise', 'fullscreen', 'quit', 'heading', 'title', 'action', 'body', 'foot', 'status', 'summary']);
  assert.equal(frame.parts.find((x) => x.name === 'quit').as, 'ui-button--stop', 'Quit is the stop button');
  assert.ok(GALLERY_BODY_TAGS.some((t) => hasClasses(t, '.ui-logo') && t.attrs['data-canvas'] === 'title-bar-logo'), 'the gallery shows the logo');
  assert.match(GALLERY, /applyLogos\(document\)/, 'and draws it as the page does');
  assert.match(read('js/main.js'), /applyLogos\(document\.body\);/, 'the page draws every title bar\'s logo');
});

test('drawLogo draws MINESWEEPER and 3D letter by letter, hidden from assistive technology, once; applyLogos draws every logo', () => {
  assert.deepEqual(LOGO_WORDS, ['MINESWEEPER', '3D']);
  const doc = stubDocument();
  const logo = doc.createElement('h1');
  logo.setAttribute('class', 'ui-logo');
  logo.setAttribute('aria-label', 'Minesweeper 3D');
  drawLogo(logo);
  assert.deepEqual(logo.children.map((w) => [w.attrs.class, w.attrs['aria-hidden'], w.children.map((l) => l.textContent).join('')]),
    [['ui-logo__word', 'true', 'MINESWEEPER'], ['ui-logo__word', 'true', '3D']]);
  assert.ok(logo.children.every((w) => w.children.every((l) => l.attrs.class === 'ui-logo__letter' && l.textContent.length === 1)), 'one letter per box');
  drawLogo(logo);
  assert.equal(logo.children.length, 2, 'a drawn logo is left as it is');
  const root = doc.createElement('div');
  const a = doc.createElement('h1');
  a.setAttribute('class', 'ui-logo ui-frame__logo');
  root.append(a);
  applyLogos(root);
  assert.equal(a.children.length, 2, 'applyLogos draws every logo under the root');
});

test('logoScale: the largest tenth of the logo that fits its room, never above full size; under the 0.5 floor, hidden', () => {
  assert.deepEqual([LOGO_STEP, LOGO_FLOOR], [0.1, 0.5]);
  assert.equal(logoScale(500, 364.3), 1, 'room to spare: full size');
  assert.equal(logoScale(364.3, 364.3), 1, 'an exact fit: full size');
  // J-Game2D-l and -m: Intermediate's 498 and 494 px board columns leave 282 and 278 px between Pause and the window buttons.
  assert.equal(logoScale(282, 364.3), 0.7, '1366 × 768: 70 %, as J-Game2D-l draws it');
  assert.equal(logoScale(278, 364.3), 0.7, '1024 × 768: 70 %, as J-Game2D-m draws it');
  assert.equal(logoScale(296, 451.8), 0.6, 'Beginner at 1920 × 1080: 60 %');
  assert.equal(logoScale(0.5 * 364.3, 364.3), 0.5, 'the floor itself');
  assert.equal(logoScale(0.49 * 364.3, 364.3), 0, 'under the floor: hidden');
  assert.equal(logoScale(-12, 364.3), 0, 'no room at all: hidden');
  assert.equal(logoScale(100, 0), 1, 'an undrawn logo is left at full size');
});

test('the logo in Joyful tiles: MINESWEEPER a game colour per letter — blue, coral, teal, violet, green, orange, repeating — 3D in yellow; a white outline and a short darker extrusion, sized with the frame\'s steps', () => {
  assert.match(THEME_RAW, /--color-logo-blue: #6f9ff7;/);
  assert.match(THEME_RAW, /--color-logo-violet: #a084f5;/);
  const letter = bodyOf(THEME_RULES, '.ui-logo__letter');
  assert.match(letter, /--f: var\(--color-logo-blue\);\s*--e: var\(--color-blue\);\s*color: var\(--f\);/, 'the first letter blue');
  assert.match(letter, /text-shadow:\s*var\(--logo-x\) var\(--logo-y\) 0 color-mix\(in srgb, var\(--e\) 62%, var\(--color-ink\)\),\s*calc\(var\(--logo-x\) \* 2\) calc\(var\(--logo-y\) \* 2\) 0 color-mix\(in srgb, var\(--e\) 62%, var\(--color-ink\)\)/, 'a two-step extrusion of the edge a third towards the ink');
  assert.equal((letter.match(/var\(--color-surface\)/g) ?? []).length, 32, 'a white outline around the letter and around the extrusion\'s end');
  const colour = (n) => bodyOf(THEME_RULES, `.ui-logo__word:first-child > .ui-logo__letter:nth-child(${n})`);
  assert.match(colour('6n + 2'), /--f: var\(--color-accent-fill\); --e: var\(--color-accent-edge\);/, 'coral');
  assert.match(colour('6n + 3'), /--f: var\(--color-teal\); --e: var\(--color-teal-edge\);/, 'teal');
  assert.match(colour('6n + 4'), /--f: var\(--color-logo-violet\); --e: var\(--color-violet\);/, 'violet');
  assert.match(colour('6n + 5'), /--f: var\(--color-green\); --e: var\(--color-green-edge\);/, 'green');
  assert.match(colour('6n'), /--f: var\(--color-orange\); --e: var\(--color-orange-edge\);/, 'orange');
  assert.match(bodyOf(THEME_RULES, '.ui-logo__word:last-child > .ui-logo__letter'), /--f: var\(--color-yellow\); --e: var\(--color-yellow-edge\);/, '3D yellow');
  assert.match(bodyOf(THEME_RULES, '.ui-logo'), /--logo-x: 0\.9px;\s*--logo-y: 2px;\s*--logo-o: 3px;\s*gap: 20px;\s*font-size: 44px;\s*font-weight: 900;/, 'desktop: 44 px');
  assert.match(bodyOf(mediaRules(THEME_CSS, COMPACT_STEP), '.ui-logo'), /--logo-x: 0\.7px;\s*--logo-y: 1\.6px;\s*--logo-o: 2px;\s*gap: 16px;\s*font-size: 36px;/, 'compact: 36 px');
  assert.match(bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), '.ui-logo'), /--logo-x: 0\.4px;\s*--logo-y: 1\.2px;\s*--logo-o: 2px;\s*gap: 8px;\s*font-size: 20px;/, 'touch: 20 px');
  const base = bodyOf(RULES, '.ui-logo');
  assert.match(base, /display: flex;/);
  assert.match(base, /white-space: nowrap;/, 'one line');
});

test('the title bar follows the canvas\'s steps: 68 / 60 / 52 px, 38 px square buttons with 20 px icons (40 px Back on a phone), 8 px apart; the heading 30 / 26 / 24 px black; a phone hides the window buttons', () => {
  const bar = '.ui-frame__head:has(> .ui-frame__logo)';
  assert.match(bodyOf(THEME_RULES, bar), /min-height: 68px;\s*padding: 10px 14px 14px;/, 'desktop');
  assert.match(bodyOf(mediaRules(THEME_CSS, COMPACT_STEP), bar), /min-height: 60px;\s*padding: 8px 12px 12px;/, 'compact');
  assert.match(bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), bar), /min-height: 52px;\s*padding: 4px 10px 10px;/, 'touch');
  const square = ':is(.ui-frame__back, .ui-frame__window > .ui-button)';
  assert.match(bodyOf(THEME_RULES, square), /width: 38px;\s*height: 38px;\s*min-height: 38px;\s*border-radius: var\(--radius-md\);/);
  assert.match(bodyOf(THEME_RULES, `${square} > .ui-icon`), /width: 20px; height: 20px;/);
  assert.match(bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), square), /width: 40px; height: 40px; min-height: 40px;/);
  assert.match(bodyOf(THEME_RULES, '.ui-frame__window'), /gap: 8px;/);
  assert.match(bodyOf(RULES, ':is(.ui-frame__back, .ui-frame__window > .ui-button)'), /padding: 0;/, 'icon-only: no label padding');
  assert.match(bodyOf(THEME_RULES, '.ui-frame__heading'), /padding: 22px 26px 0;/);
  assert.match(bodyOf(THEME_RULES, '.ui-frame__heading > .ui-frame__title'), /font-size: 30px; font-weight: 900; line-height: 1\.1;/);
  assert.match(bodyOf(mediaRules(THEME_CSS, COMPACT_STEP), '.ui-frame__heading > .ui-frame__title'), /font-size: 26px;/);
  assert.match(bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), '.ui-frame__heading > .ui-frame__title'), /font-size: 24px;/);
  assert.match(bodyOf(RULES, '.ui-frame__heading'), /display: flex;[\s\S]*justify-content: space-between;/, 'the control at the heading\'s right');
  assert.match(bodyOf(mediaRules(CSS, TOUCH_QUERY), '.ui-frame__window'), /display: none;/, 'a phone shows only Back and the logo');
});

test('bindWindowButtons: with no desktop host a window button presses and does nothing; a host the capability flags report gets its action', () => {
  const listeners = {};
  const root = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
  const press = (name) => listeners.click({ target: { closest: (sel) => (sel === '[data-window]' ? { getAttribute: () => name } : null) } });
  const calls = [];
  const actions = Object.fromEntries(WINDOW_BUTTONS.map((n) => [n, () => calls.push(n)]));
  const unbind = bindWindowButtons(root, { capabilities: { desktopHost: false }, actions });
  for (const n of WINDOW_BUTTONS) press(n);
  assert.deepEqual(calls, [], 'no action without a host: no message, no confirmation, no lock');
  unbind();
  assert.equal(listeners.click, undefined, 'unbinds');
  bindWindowButtons(root, { capabilities: { desktopHost: true }, actions });
  for (const n of WINDOW_BUTTONS) press(n);
  assert.deepEqual(calls, ['minimise', 'fullscreen', 'quit'], 'the host attaches each action');
  listeners.click({ target: { closest: () => null } });
  assert.equal(calls.length, 3, 'a press elsewhere is not a window button');
  bindWindowButtons(root, { capabilities: { desktopHost: true } });
  press('quit');
  assert.equal(calls.length, 3, 'a host without that action does nothing');
  assert.match(read('js/platform/index.js'), /\nexport const capabilities = Object\.freeze\(\{ desktopHost: false \}\);/, 'the web build reports no desktop host');
  assert.match(read('js/main.js'), /bindWindowButtons\(document\.body, \{ capabilities \}\);/, 'the shell binds every title bar\'s window buttons to the platform\'s flags');
});

test('main menu buttons: the play tile a native button with its icon, label, lock and own preview, a disabled one with its reason and its preview locked; the small entry its icon and label; the phone row; no Last played chip', () => {
  const list = LAYOUT_TAGS.find((t) => t.attrs.id === 'g-modes');
  assert.ok(list && list.attrs.role === 'group' && list.attrs['aria-label'], 'the buttons sit in a named group');
  const own = inside(LAYOUT, LAYOUT_TAGS, list);
  const tiles = within(own, '.ui-play-tile');
  assert.ok(tiles.length >= 6);
  for (const e of tiles) {
    assert.equal(e.tag, 'button');
    assert.equal(e.attrs.type, 'button');
    assert.ok(PLAY_TILES.includes(e.attrs['data-entry']), `${e.attrs['data-entry']} is a play tile's mode`);
    const parts = inside(LAYOUT, LAYOUT_TAGS, e);
    assert.equal(within(parts, '.ui-play-tile__icon')[0]?.attrs['aria-hidden'], 'true', 'the icon is decoration');
    assert.ok(textOf(LAYOUT, within(parts, '.ui-play-tile__label')[0]), 'the label names it');
    assert.equal(within(parts, '.ui-play-tile__lock')[0]?.attrs['aria-hidden'], 'true', 'the lock is decoration');
    const preview = within(parts, '.ui-play-tile__preview')[0];
    assert.equal(preview?.attrs['aria-hidden'], 'true', 'the preview is decoration');
    assert.ok(['board', 'badge', 'still', 'icon', 'locked'].includes(preview.attrs['data-preview']), 'it names what it shows');
    assert.equal(within(parts, '.ui-play-tile__art').length, 1, 'its art');
  }
  assert.ok(!tiles.some((e) => 'disabled' in e.attrs), 'no tile uses the native disabled: a disabled tile stays selectable');
  const off = tiles.filter((e) => e.attrs['aria-disabled'] === 'true');
  assert.ok(off.length >= 2, 'a disabled tile and a disabled phone row');
  for (const e of off) {
    const parts = inside(LAYOUT, LAYOUT_TAGS, e);
    const reason = within(parts, '.ui-play-tile__reason')[0];
    const long = inside(LAYOUT, LAYOUT_TAGS, reason).find((t) => t.attrs['data-reason'] === 'long');
    const short = inside(LAYOUT, LAYOUT_TAGS, reason).find((t) => t.attrs['data-reason'] === 'short');
    assert.deepEqual([textOf(LAYOUT, long), textOf(LAYOUT, short)], ['Needs WebGL 2 — not available in this browser', 'Needs WebGL 2'], 'its reason, and the phone row\'s short one');
    const preview = within(parts, '.ui-play-tile__preview')[0];
    assert.equal(preview.attrs['data-preview'], 'locked');
    assert.ok(classesOf(preview).includes('ui-play-tile__preview--locked'), 'its preview locked');
  }
  for (const e of tiles.filter((x) => x.attrs['aria-disabled'] !== 'true')) {
    assert.equal(within(inside(LAYOUT, LAYOUT_TAGS, e), '.ui-play-tile__reason').length, 0, 'an enabled tile has no reason line');
  }
  assert.ok(tiles.some((e) => e.attrs['data-force'] === 'focus') && tiles.some((e) => e.attrs['data-force'] === 'active'), 'shown selected and pressed');
  assert.ok(within(own, '.ui-play-tile__preview--light').length >= 1, 'a light preview');
  const rows = tiles.filter((e) => classesOf(e).includes('ui-play-tile--row'));
  assert.ok(rows.length >= 3 && rows.some((e) => e.attrs['data-force'] === 'focus') && rows.some((e) => e.attrs['aria-disabled'] === 'true'), 'the phone rows: at rest, selected, disabled');
  const small = within(own, '.ui-small-entry');
  assert.deepEqual([...new Set(small.map((e) => e.attrs['data-entry']))], ['records', 'settings'], 'the small entries');
  for (const e of small) {
    assert.equal(e.tag, 'button');
    const parts = inside(LAYOUT, LAYOUT_TAGS, e);
    assert.equal(within(parts, '.ui-small-entry__icon')[0]?.attrs['aria-hidden'], 'true');
    assert.ok(textOf(LAYOUT, within(parts, '.ui-small-entry__label')[0]));
  }
  assert.ok(small.some((e) => e.attrs['data-force'] === 'focus'), 'a small entry selected');
  assert.equal(within(own, '.ui-chip').length, 0, 'no main menu button carries a Last played chip');
});

test('board option: a native button with its name, size line, density, no Last played chip, and its chosen state apart from selected', () => {
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
  assert.ok(options.every((o) => within(inside(LAYOUT, LAYOUT_TAGS, o), '.ui-chip').length === 0), 'no board option carries a Last played chip');
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
    assert.ok(['move', 'select', 'confirm', 'back'].includes(h.attrs['data-action']), 'a hint names the action whose keys it shows');
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
  assert.match(body('.ui-play-tile:not([aria-disabled="true"]) .ui-play-tile__lock'), /display:\s*none/, 'the lock shows only on a disabled tile');
  assert.match(body('.ui-option:not([aria-pressed="true"]) .ui-option__check > *'), /visibility:\s*hidden/, 'the check shows only on the chosen option');
});

test('the theme draws the main menu buttons a pastel at rest and their full colour selected, no button growing, the chosen board option as a fill and check apart from selected, and no hover on any', () => {
  const focusRules = (cls) => THEME_RULES.filter(([sel]) => /:focus(-visible)?,/.test(sel) && sel.includes(`.${cls}:focus`) && sel.includes(`.${cls}[data-force~="focus"]`)).map(([, b]) => b).join(';');
  for (const cls of ['ui-play-tile', 'ui-small-entry']) {
    assert.match(focusRules(cls), /background:\s*var\(--f\)/, `${cls} selected: its full colour`);
    assert.match(focusRules(cls), /transform:\s*translateY\(var\(--edge-sm\)\)/, `${cls} selected: level with the surface`);
    assert.match(focusRules(cls), /box-shadow:\s*inset 0 3px 0 var\(--highlight\);/, `${cls} selected: its bottom edge gone`);
    assert.doesNotMatch(focusRules(cls), /flex-grow|min-height|padding|font-size|width/, `${cls} selected keeps its size`);
  }
  const rest = THEME_RULES.filter(([sel]) => sel.split(',').map((x) => x.trim()).includes('.ui-play-tile')).map(([, b]) => b).join(';');
  assert.match(rest, /background:\s*var\(--fs\)/, 'at rest the pastel');
  assert.match(rest, /box-shadow:\s*inset 0 3px 0 var\(--highlight\), 0 var\(--edge-sm\) 0 var\(--es\);/, 'on its pastel edge, the smaller one, no drop shadow');
  assert.doesNotMatch(rest, /elevation/, 'no drop shadow');
  assert.ok(!THEME_RULES.some(([sel, b]) => /ui-play-tile|ui-small-entry/.test(sel) && /flex-grow|min-height/.test(b)), 'no menu button grows when selected');
  const chosen = THEME_RULES.filter(([sel]) => sel === '.ui-option[aria-pressed="true"]').map(([, b]) => b).join(';');
  assert.match(chosen, /background:\s*var\(--color-blue\)/, 'the chosen option is a blue fill');
  assert.match(focusRules('ui-option'), /transform:\s*translateY/, 'the selected option sits level with the surface');
  assert.doesNotMatch(focusRules('ui-option'), /background:/, 'selecting an option does not change its fill');
  for (const cls of ['ui-play-tile', 'ui-small-entry', 'ui-option']) assert.ok(!THEME_RULES.some(([sel]) => sel.includes(`.${cls}:hover`)), `${cls} has no hover rule`);
  for (const entry of PLAY_TILES) {
    const accent = THEME_RULES.filter(([sel]) => sel === `.ui-play-tile[data-entry="${entry}"]`).map(([, b]) => b).join(';');
    assert.match(accent, /--f:\s*var\(--color-[\w-]+\);[\s\S]*?--fs:\s*var\(--color-[\w-]+-soft\);\s*--es:\s*var\(--color-[\w-]+-soft-edge\)/, `${entry} has its colour and its pastel`);
  }
  const backdrop = THEME_RULES.filter(([sel]) => sel === '.ui-backdrop').map(([, b]) => b).join(';');
  assert.match(backdrop, /radial-gradient\(circle, var\(--color-ground-dot\)/, 'the dotted paper');
  assert.match(THEME_RULES.filter(([sel]) => sel === '.ui-frame__head').map(([, b]) => b).join(';'), /background:\s*var\(--color-head\)/, 'the yellow head');
});

test('keyHintKeys: the keys of move, select, confirm, back and restart for each device, the controller\'s in its glyphs, none on touch', () => {
  assert.deepEqual(Object.keys(KEY_HINTS), ['move', 'select', 'confirm', 'back', 'restart']);
  assert.deepEqual(keyHintKeys('confirm', 'keyboard'), [], 'a confirm button carries no Enter label');
  assert.deepEqual(keyHintKeys('confirm', 'controller', GLYPHS.xbox), [{ text: GLYPHS.xbox.a, pad: true }], 'its controller glyph stays');
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

test('in a browser, the shared layout\'s components: a mouse-selected play tile loses the selection to a key, options tell chosen from selected, the frame scrolls its body, key hints follow the device', async (t) => {
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

    // A play tile the mouse moved onto is selected; a key moving focus away leaves it unselected under the resting pointer.
    const entry = '#g-tile-classic';
    const next = '#g-tile-hexagon';
    await page.locator(entry).scrollIntoViewIfNeeded();
    const rest = await look(entry);
    const box = await page.locator(entry).boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await settle();
    const selected = await look(entry);
    assert.equal(selected.focused, true, 'moving the mouse over a play tile focuses it');
    assert.notEqual(selected.transform, rest.transform, 'it shows the selected look');
    assert.notEqual(selected.background, rest.background, 'its full colour');
    assert.equal(selected.outline, 'none', 'no outline');
    assert.equal(selected.height, rest.height, 'and keeps its height');
    await page.keyboard.press('Tab');
    await settle();
    assert.equal((await look(next)).focused, true, 'Tab moves the focus to the next tile');
    await page.waitForFunction(([s, want]) => getComputedStyle(document.querySelector(s)).transform === want, [entry, rest.transform], { timeout: patience(1500) }).catch(() => {});
    const left = await look(entry);
    assert.equal(left.focused, false, 'the tile under the resting pointer is no longer selected');
    assert.equal(left.transform, rest.transform, 'nor looks it');

    // The disabled tile: still selectable, drawn locked with its reason and lock, its preview locked; no move.
    const off = await page.evaluate(() => {
      const e = document.getElementById('g-tile-3d-off');
      const before = getComputedStyle(e).transform;
      e.focus();
      const shown = (sel) => { const x = e.querySelector(sel); return !!x && x.getBoundingClientRect().width > 0 && getComputedStyle(x).visibility !== 'hidden'; };
      const enabledLock = document.querySelector('#g-tile-classic .ui-play-tile__lock');
      return {
        focused: document.activeElement === e, reason: e.querySelector('.ui-play-tile__reason').innerText.trim(), lock: shown('.ui-play-tile__lock'),
        preview: shown('.ui-play-tile__preview--locked svg'), enabledLock: enabledLock.getBoundingClientRect().width, moved: getComputedStyle(e).transform !== before,
      };
    });
    assert.deepEqual(off, { focused: true, reason: 'Needs WebGL 2 — not available in this browser', lock: true, preview: true, enabledLock: 0, moved: false },
      'a disabled tile takes the selection, shows its reason, its lock and its locked preview, and does not move; an enabled one shows no lock');

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
  assert.match(FATAL, /<div class="ui-actions ui-actions--row"><button type="button" class="ui-button ui-button--primary ui-button--go" onclick="location\.reload\(\)"><svg\b[^>]*aria-hidden="true"[\s\S]*?<\/svg>Reload<\/button><\/div>/);
  // Reload takes focus when the card appears: autofocus does nothing on a clone appended after load.
  assert.doesNotMatch(FATAL, /autofocus/);
  assert.match(INDEX, /<script type="module" src="js\/main\.js" onerror="document\.body\.append\(document\.getElementById\('fatal-card'\)\.content\.cloneNode\(true\)\); document\.querySelector\('\.fatal \.ui-button'\)\.focus\(\)"><\/script>/,
    'the module failing to load shows the card and focuses Reload');
  assert.match(read('js/main.js'), /function showFatal\(\) \{\n  document\.body\.append\(document\.getElementById\('fatal-card'\)\.content\.cloneNode\(true\)\);\n  document\.querySelector\('\.fatal \.ui-button'\)\.focus\(\);\n\}/,
    'so does the default theme failing');
  // The no-JavaScript notice: the theme stylesheet it needs, linked where only a page without JavaScript reads it.
  assert.match(NOSCRIPT, /^<noscript><link rel="stylesheet" href="themes\/joyful-tiles\/theme\.css"><div class="noscript ui-backdrop">/);
  messageCard(NOSCRIPT, 'noscript-title', 'Minesweeper 3D needs JavaScript.');
  assert.equal((INDEX.match(/<noscript>/g) ?? []).length, 1, 'one no-JavaScript block');
  assert.match(INDEX.match(/<html\b[^>]*>/)[0], /data-theme="joyful-tiles"/, 'without JavaScript the page is in the default theme');
  // The 404 page: the same card, its one action a link home.
  assert.match(NOT_FOUND, /<main class="not-found ui-backdrop">/);
  messageCard(NOT_FOUND, 'not-found-title', 'Page not found.');
  assert.match(NOT_FOUND, /<div class="ui-actions ui-actions--row"><a class="ui-button ui-button--primary ui-button--go" href="\/">Go to Minesweeper 3D<\/a><\/div>/);
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
  assert.match(STYLE, /\.toast \{[^}]*width: max-content; max-width: min\(640px, calc\(100vw - 32px\)\);/, 'the toast at most 640 px, wrapping inside a phone');
  assert.match(STYLE, /\.toast \{\s*position: fixed; left: 50%; bottom: 28px;/, 'centred 28 px above the page\'s bottom, under a window\'s foot');
});

// Every card animates in and out over --duration-slow (J-Tokens' Motion table), respecting reduced motion.
const CARD_LAYERS = ':is(#ready, #ctx-lost, #learn-end, #coming-soon)';
test('every card animates in and out over the slow duration: the cards over the scene, the placeholder\'s window, the fatal card and the confirmations', () => {
  const T = ':root\\[data-theme="joyful-tiles"\\] ';
  const esc = (x) => x.replace(/[()[\].#|]/g, (c) => `\\${c}`);
  assert.match(THEME_CSS, /@keyframes joyful-tiles-pop \{ from \{ opacity: 0; transform: translateY\(8px\) scale\(0\.985\); \} to \{ opacity: 1; transform: none; \} \}/);
  // In: each card pops in as it shows.
  assert.match(THEME_CSS, new RegExp(`${T}${esc(CARD_LAYERS.replace(')', ', .fatal)'))} > :is\\(\\.ui-card, \\.ui-frame\\),\\s*${T}\\.ui-confirm \\{ animation: joyful-tiles-pop var\\(--duration-slow\\) var\\(--easing-out\\); \\}`),
    'the ready, context-lost and Learn 3D end cards, the placeholder\'s window, the fatal card and the confirm boxes pop in');
  // Out: the layer fades with its card sinking, kept on screen until it has, and lets clicks through meanwhile.
  assert.match(THEME_CSS, new RegExp(`${T}${esc(CARD_LAYERS.replace(')', ', .ui-confirm)'))} \\{\\s*transition: opacity var\\(--duration-slow\\) var\\(--easing-out\\), display var\\(--duration-slow\\) allow-discrete;\\s*\\}`),
    'a layer or a confirm box leaving stays shown over the slow duration while it fades');
  assert.match(THEME_CSS, new RegExp(`${T}${esc(CARD_LAYERS)} > :is\\(\\.ui-card, \\.ui-frame\\) \\{ transition: transform var\\(--duration-slow\\) var\\(--easing-out\\); \\}`));
  assert.match(THEME_CSS, new RegExp(`${T}${esc(CARD_LAYERS.replace(')', ', .ui-confirm)'))}\\.hidden \\{ opacity: 0; pointer-events: none; \\}`));
  assert.match(THEME_CSS, new RegExp(`${T}${esc(CARD_LAYERS)}\\.hidden > :is\\(\\.ui-card, \\.ui-frame\\) \\{ transform: translateY\\(8px\\) scale\\(0\\.985\\); \\}`));
  // Reduced motion: no animation and no transition, the display switch among them.
  assert.match(STYLE, /@media \(prefers-reduced-motion: reduce\) \{\s*\*, \*::before, \*::after \{ animation: none !important; transition: none !important; \}/);
});

test('in a browser, the 404 page, the no-JavaScript notice and the fatal card show on the backdrop in Joyful tiles on a desktop and a phone, with its fonts, no remote file, and the contrast contract met', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const SIZES = [
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
        // Measured once the card has popped in.
        await page.waitForFunction(() => document.querySelector('.fatal > .ui-card').getAnimations().every((a) => a.playState !== 'running'), null, { timeout: patience(2000) });
        const got = await look(page, '.fatal > .ui-card');
        assert.ok(got.dots && got.surface === 'rgb(255, 255, 255)', `fatal-${size}: on the backdrop`);
        assert.ok(got.fits, `fatal-${size}: fits`);
        assert.equal(got.width, width);
        assert.equal(await page.textContent('.fatal .ui-button'), 'Reload');
        assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('.fatal .ui-button')), true, `fatal-${size}: Reload is focused`);
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
  assert.equal(kitPart('ui-figures', 'action').as, 'ui-button--secondary', 'the head bar\'s action, Pause, is a secondary button');
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
      assert.ok(action && hasClasses(action, '.ui-button.ui-button--secondary') && action.tag === 'button' && action.attrs.type === 'button', 'the head\'s action, Pause, is a secondary button');
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
  assert.ok(shapes.some((s) => s.bar && !s.pace && !s.head), 'the panel of a board with no best: its progress bar, no pace row');
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

// The Classic 2D game window at each artboard size where its layout changes: the panel beside (at
// its narrowest desktop size; the large one, J-Game2D-xl, lays it out the same with more room),
// under or hidden.
const WINDOW_SIZES = [
  ['m', { viewport: { width: 1024, height: 768 } }, 'beside'],
  ['tablet', { viewport: { width: 800, height: 1024 } }, 'under'],
  ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, 'hidden'],
  ['ls', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, 'hidden'],
];
const noWebGL = () => {
  const get = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function getContext(type, ...rest) { return type === 'webgl2' ? null : get.call(this, type, ...rest); };
};
for (const [size, device, place] of WINDOW_SIZES) {
  test(`in a browser, the Classic 2D game window at ${size} (${device.viewport.width} × ${device.viewport.height}) and in its states: the panel ${place}, no sideways scroll with an Expert board, and the contrast contract met`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser } = env;
    const { base } = env;
    const context = await browser.newContext({ ...device, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(noWebGL);
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      const ms = (fn, arg) => page.evaluate(fn, arg);
      const frames = () => ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const check = async (label, { min = 8 } = {}) => {
        await frames();
        const { runs } = await ms(measureContrast);
        const own = await ms(() => [...document.querySelectorAll('#c2d *, #c2d-status *, #hud *')]
          .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .map((e) => e.textContent.trim().slice(0, 30)));
        const mine = runs.filter((r) => own.includes(r.text));
        assert.ok(mine.length >= min, `${label}: its text is measured (${mine.length})`);
        assert.deepEqual(mine.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`), [], `${label}: text below the contrast contract`);
        assert.equal(await ms(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), true, `${label}: no sideways scroll`);
      };
      const geometry = () => ms(() => {
        const box = (id) => { const r = document.getElementById(id).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        return {
          frame: box('c2d-frame'), board: box('c2d-board'), strip: box('c2d-counters'), panel: box('c2d-figures'), foot: box('c2d-size'),
          panelShown: getComputedStyle(document.getElementById('c2d-figures')).display !== 'none',
          title: document.getElementById('c2d-title').textContent, size: document.getElementById('c2d-size').textContent,
        };
      });
      const touch = !!device.hasTouch;
      // A click (a tap on a touch screen) on cell c of the open board, scrolled into view first.
      const press = async (c) => {
        const at = await ms((i) => {
          const v = globalThis.__ms.board2D;
          v.ensureVisible(i);
          const r = v.cellRect(i);
          const box = v.canvas.getBoundingClientRect();
          return { x: box.x + r.x + r.size / 2, y: box.y + r.y + r.size / 2 };
        }, c);
        if (touch) await page.touchscreen.tap(at.x, at.y); else await page.mouse.click(at.x, at.y);
      };

      await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'expert', noGuess: false }));
      await page.waitForFunction(() => globalThis.__ms.board2D);
      assert.equal((await geometry()).panelShown, false, `${size}: the live figures closed at first`);
      if (!touch) {
        await page.click('#c2d-figures-toggle');
        await frames();
      }
      const g = await geometry();
      assert.equal(g.title, 'Classic 2D · Expert', `${size}: the foot line opens with the mode and the board`);
      assert.equal(g.size, '30 × 16 · 99 mines', `${size}: then the board line, never a cell`);
      assert.equal(await ms(() => document.getElementById('c2d-line').textContent), 'Classic 2D · Expert · 30 × 16 · 99 mines', `${size}: one foot line`);
      assert.ok(g.foot.bottom <= g.frame.bottom + 0.5, `${size}: the foot line inside the window`);
      assert.ok(g.frame.right <= device.viewport.width + 0.5 && g.frame.x >= -0.5, `${size}: the window inside the screen`);
      if (size === 'ls') assert.ok(g.strip.x >= g.board.right - 0.5, `${size}: held sideways, the counter strip beside the board`);
      else assert.ok(g.strip.bottom <= g.board.y + 0.5, `${size}: the counter strip above the board`);
      if (place === 'beside') assert.ok(g.panelShown && g.panel.x >= g.board.right - 0.5 && g.panel.y < g.board.bottom, `${size}: the panel beside the board`);
      if (place === 'under') assert.ok(g.panelShown && g.panel.y >= g.board.bottom - 0.5, `${size}: the panel under the board`);
      if (place === 'hidden') assert.equal(g.panelShown, false, `${size}: no panel on a phone`);
      assert.equal(await ms(() => getComputedStyle(document.getElementById('hud-overlay')).display), 'none', `${size}: no 3D game overlay`);
      assert.equal(await ms(() => getComputedStyle(document.getElementById('hud-swap')).display !== 'none'), !touch, `${size}: Swap clicks on a fine pointer only`);
      assert.equal(await ms(() => getComputedStyle(document.getElementById('hud-tap')).display !== 'none'), touch, `${size}: the Reveal / Flag switch on a coarse pointer only`);
      const view = await ms(() => ({ ...globalThis.__ms.board2D.layout }));
      assert.ok(view.tile >= 26, `${size}: never below the minimum tile`);
      await check(`${size} Expert`, { min: touch ? 5 : 10 });

      // A negative mine counter, red and three characters.
      await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'intermediate', noGuess: false }));
      await page.waitForFunction(() => globalThis.__ms.board2D);
      await press(120);
      await page.waitForFunction(() => globalThis.__ms.modes.state.started);
      await ms(() => {
        const g = globalThis.__ms.game2D;
        let flags = 0;
        for (let c = 0; c < 256 && flags < 45; c++) if (g.cellState(c) === 'closed') { g.toggleFlag(c); flags += 1; }
      });
      await page.waitForFunction(() => document.getElementById('c2d-mines-left').textContent === '-05');
      assert.equal(await ms(() => document.getElementById('c2d-mines-left').closest('.ui-counter').hasAttribute('data-negative')), true, `${size}: the counter marks a negative count`);
      assert.equal(await ms(() => getComputedStyle(document.getElementById('c2d-mines-left')).color), 'rgb(180, 42, 42)', `${size}: a negative counter stays red`);
      await check(`${size} negative counter`, { min: touch ? 5 : 10 });

      // A clipped board's scroll hint, worded for the device.
      await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'custom', custom: { width: 100, height: 60, mines: 600 }, noGuess: false }));
      await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'));
      assert.equal(await ms(() => document.getElementById('hint-strip-text').textContent), touch ? 'Drag to pan · pinch to zoom' : 'Wheel scrolls · Shift+wheel sideways');
      assert.deepEqual(await ms(() => [document.getElementById('c2d-panel').classList.contains('hidden'), /round 14px\)$/.test(getComputedStyle(globalThis.__ms.board2D.canvas).clipPath)]),
        [true, true], `${size}: a clipped board scrolls in a radius-14 viewport with no frame`);
      await check(`${size} scroll hint`, { min: 5 });

      // Intermediate in play.
      await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'intermediate', noGuess: false }));
      await page.waitForFunction(() => globalThis.__ms.board2D);
      await press(120);
      await page.waitForFunction(() => globalThis.__ms.modes.state.started);
      const framed = await ms(() => {
        const v = globalThis.__ms.board2D;
        const p = document.getElementById('c2d-panel');
        const r = p.getBoundingClientRect();
        const c = v.canvas.getBoundingClientRect();
        return { l: { ...v.layout }, hidden: p.classList.contains('hidden'), x: r.x - c.x, y: r.y - c.y, width: r.width, height: r.height, radius: getComputedStyle(p).borderTopLeftRadius, clip: v.canvas.style.clipPath, round: /round 14px\)$/.test(getComputedStyle(v.canvas).clipPath) };
      });
      if (!framed.l.scrolls) {
        const pad = framed.l.gap;
        assert.deepEqual([framed.hidden, framed.x, framed.y, framed.width, framed.height], [false, framed.l.viewX - pad, framed.l.viewY - pad, framed.l.viewWidth + 2 * pad, framed.l.viewHeight + 2 * pad],
          `${size}: Intermediate in its frame, padded by the module's gap`);
        assert.equal(framed.radius, `${Math.round(framed.l.tile * 0.3)}px`, `${size}: the frame's radius is the tile × .3`);
      } else {
        // A board clipped on one axis or both: the viewport is the view itself, rounded, with no frame.
        const { viewX, viewY, viewWidth, viewHeight, width, height } = framed.l;
        assert.deepEqual([framed.hidden, framed.clip, framed.round], [true, `inset(${viewY}px ${width - viewX - viewWidth}px ${height - viewY - viewHeight}px ${viewX}px round var(--board-viewport-radius, 0px))`, true],
          `${size}: Intermediate clipped in a radius-14 viewport, the view's own rectangle`);
      }
      if (!touch) {
        // The H help panel beside the window.
        await page.keyboard.press('KeyH');
        await page.waitForFunction(() => !document.getElementById('help').classList.contains('hidden'));
        await check(`${size} help panel`);
        assert.ok(await ms(() => { const h = document.getElementById('help'); return h.scrollHeight <= h.clientHeight; }), `${size}: every help row and the foot line show unclipped`);
        await page.keyboard.press('KeyH');
      }
      assert.deepEqual(errors, [], `${size}: no page errors`);
    } finally {
      await context.close();
    }
  });
}

// J-Game2D-xl, -l, -m, -p and -ls: Intermediate in the game window, as the artboards draw it.
const ARTBOARDS_2D = [
  // Each artboard's window is short of its own board under its title bar and its foot of 38 px buttons, so the
  // fit rule leaves the board a tile step smaller: 41 px at 1920 × 1080, 27 px at 1366 and 1024 wide.
  ['xl', { viewport: { width: 1920, height: 1080 } }, { window: [425, 1070, 964], column: 768, logo: 1, board: 724, tile: [41, 4], figures: 300, padding: '22px 26px', digits: '34px', value: '28px', bbbv: '16px', figure: '11px' }],
  ['l', { viewport: { width: 1366, height: 768 } }, { window: [303, 760, 680], column: 498, logo: 0.7, board: 466, tile: [27, 2], figures: 260, padding: '16px 20px', digits: '28px', value: '23px', bbbv: '23px', figure: '8px' }],
  ['m', { viewport: { width: 1024, height: 768 } }, { window: [148, 728, 676], column: 494, logo: 0.7, board: 466, tile: [27, 2], figures: 232, padding: '14px 18px', digits: '28px', value: '23px', bbbv: '23px', figure: '8px' }],
  ['narrow', { viewport: { width: 1000, height: 700 } }, { digits: '28px', under: true }],
  ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, { digits: '26px' }],
  ['ls', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, { digits: '26px' }],
];
for (const [size, device, want] of ARTBOARDS_2D) {
  test(`in a browser, the Classic 2D window at ${size} (${device.viewport.width} × ${device.viewport.height}) ${want.under ? 'below the 1024 px step, no artboard' : `as J-Game2D-${size} and its states draw it`}: Intermediate under the counter strip, the window hugging it, the live figures closed and then open`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    const context = await browser.newContext({ ...device, deviceScaleFactor: 1 });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.addInitScript(noWebGL);
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      const ms = (fn, arg) => page.evaluate(fn, arg);
      // The window settles once its board area holds still across two frames.
      const settle = () => page.waitForFunction(() => {
        const now = JSON.stringify([document.getElementById('c2d-stage').getBoundingClientRect(), globalThis.__ms.board2D?.layout]);
        const same = globalThis.__lastStage === now;
        globalThis.__lastStage = now;
        return same && !!globalThis.__ms.board2D;
      }, null, { polling: 'raf' });
      await ms(async () => {
        const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
        while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
        await document.fonts.ready;
        globalThis.__ms.modes.start('classic-2d', { size: 'intermediate', noGuess: false });
      });
      await settle();
      // The first-use hint strips (a clipped board's scroll hint, the touch hint), which the artboards do not draw
      // here, dismissed one after the other.
      for (let i = 0; i < 4 && await ms(() => !document.getElementById('hint-strip').classList.contains('hidden')); i++) {
        await ms(() => document.getElementById('hint-strip-close').click());
        await ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      }
      await settle();
      const desktop = !device.hasTouch && !want.under;
      // The title bar's least width: Pause, the logo as scaled and the window buttons, with its gaps and padding.
      const headWidth = () => ms(() => {
        const h = document.getElementById('c2d-frame').querySelector('.ui-frame__head');
        const c = getComputedStyle(h);
        const side = (sel) => [...h.querySelector(sel).querySelectorAll('.ui-button')].filter((e) => e.getClientRects().length > 0)
          .reduce((sum, e, i) => sum + e.getBoundingClientRect().width + (i ? 8 : 0), 0);
        return side('.ui-frame__start') + side('.ui-frame__end') + h.querySelector('.ui-frame__logo').getBoundingClientRect().width
          + 2 * parseFloat(c.columnGap) + parseFloat(c.paddingLeft) + parseFloat(c.paddingRight);
      });
      const near = (a, b, slack = 1) => Math.abs(a - b) <= slack;
      // The title bar's parts and the logo's scale.
      const titleBar = () => ms(() => {
        const box = (el) => el.getBoundingClientRect().toJSON();
        const f = document.getElementById('c2d-frame');
        const h = f.querySelector('.ui-frame__head');
        const logo = h.querySelector('.ui-frame__logo');
        return { frame: box(f), pause: box(document.getElementById('c2d-pause')), logo: box(logo), end: box(h.querySelector('.ui-frame__window')),
          scale: logo.offsetWidth === 0 ? 0 : Number(getComputedStyle(logo).zoom), hidden: h.dataset.logo === 'hidden', overflow: h.scrollWidth > h.clientWidth };
      });
      const toggle = () => ms(() => {
        const b = document.getElementById('c2d-figures-toggle');
        return { shown: getComputedStyle(b).display !== 'none', pressed: b.getAttribute('aria-pressed'), panel: getComputedStyle(document.getElementById('c2d-figures')).display !== 'none' };
      });
      // Closed, as J-Game2D draws it: no panel, the window shrunk to its board column and centred.
      assert.deepEqual(await toggle(), { shown: !device.hasTouch, pressed: 'false', panel: false }, `${size}: the live figures closed at first, the toggle on a desktop only`);
      if (want.window) {
        const closed = await ms(() => ({ frame: document.getElementById('c2d-frame').getBoundingClientRect().toJSON(), main: document.getElementById('c2d-main').getBoundingClientRect().toJSON(), stage: document.getElementById('c2d-stage').getBoundingClientRect().toJSON(), tile: globalThis.__ms.board2D.layout.tile }));
        const head = await headWidth();
        // The window is its board column's width; the title bar fits inside it, its logo scaled down as the artboards draw it.
        assert.ok(near(closed.main.width, want.column) && near(closed.main.x, closed.frame.x), `${size}: closed, the board column ${want.column} px at the window's start (${closed.main.width})`);
        assert.ok(near(closed.frame.width, want.column) && near(closed.frame.x, (device.viewport.width - want.column) / 2), `${size}: closed, the window as wide as its board column and centred (${closed.frame.x}, ${closed.frame.width})`);
        assert.equal(closed.tile, want.tile[0], `${size}: the board's tile closed as open`);
        const bar = await titleBar();
        assert.equal(bar.scale, want.logo, `${size}: the logo at ${want.logo * 100} %`);
        assert.ok(head <= bar.frame.width + 0.5 && !bar.overflow && !bar.hidden, `${size}: the title bar fits the window, nothing overflowing (${head}, ${bar.frame.width})`);
        assert.ok(bar.pause.x >= bar.frame.x && bar.pause.right <= bar.logo.x && bar.logo.right <= bar.end.x && bar.end.right <= bar.frame.right, `${size}: Pause, the logo and the window buttons in a row inside the window`);
        assert.deepEqual([bar.pause.width, bar.end.width], [38, 130], `${size}: Pause and the window buttons keep their size`);
        if (want.logo < 1) assert.ok(bar.logo.x + bar.logo.width / 2 < bar.frame.x + bar.frame.width / 2 - 20, `${size}: the logo off-centre, between Pause and the window buttons`);
      }
      if (desktop) {
        await page.click('#c2d-figures-toggle');
        assert.notEqual(await ms(() => document.activeElement?.id), 'c2d-figures-toggle', `${size}: the toggle leaves the keys to the board`);
        await settle();
        assert.deepEqual(await toggle(), { shown: true, pressed: 'true', panel: true }, `${size}: the toggle opens the panel, pressed`);
        assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.liveFigures') ?? 'null')?.data?.open), true, `${size}: stored open`);
        if (size === 'xl') {
          // The keyboard reaches both foot controls in the Tab order and presses them with Enter or Space, the board taking none of those keys.
          await ms(() => document.getElementById('hud-swap').focus());
          await page.keyboard.press('Tab');
          assert.equal(await ms(() => document.activeElement?.id), 'c2d-figures-toggle', `${size}: Tab from Swap clicks reaches the toggle`);
          await page.keyboard.press('Enter');
          assert.equal((await toggle()).pressed, 'false', `${size}: Enter closes the panel`);
          await page.keyboard.press('Space');
          assert.equal((await toggle()).pressed, 'true', `${size}: Space opens it again`);
          await page.keyboard.press('Shift+Tab');
          assert.equal(await ms(() => document.activeElement?.id), 'hud-swap', `${size}: Shift+Tab back to Swap clicks`);
          await page.keyboard.press('Enter');
          assert.equal(await ms(() => document.getElementById('hud-swap').getAttribute('aria-pressed')), 'true', `${size}: Enter presses Swap clicks`);
          await page.keyboard.press('Space');
          assert.equal(await ms(() => document.getElementById('hud-swap').getAttribute('aria-pressed')), 'false', `${size}: and Space releases it`);
          assert.equal(await ms(() => globalThis.__ms.modes.state.started), false, `${size}: no key reached the board`);
          await ms(() => document.activeElement.blur());
          await settle();
        }
      } else if (want.under) {
        await ms(() => document.getElementById('c2d-figures-toggle').click());
        await settle();
      }
      const g = await ms(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const $ = (id) => document.getElementById(id);
        const style = (el, prop) => getComputedStyle(el)[prop];
        const counters = [...$('c2d-counters').querySelectorAll('.ui-counter')];
        return {
          frame: box($('c2d-frame')), main: box($('c2d-main')), strip: box($('c2d-counters')), stage: box($('c2d-stage')), panel: box($('c2d-panel')),
          figures: box($('c2d-figures')), divider: box($('c2d-divider')), restart: box($('c2d-restart')), tap: box($('hud-tap')), foot: box($('c2d-size')),
          mines: box(counters[0]), time: box(counters[1]), clock: box(counters[1].querySelector('.ui-counter__icon')), timeDigits: box($('c2d-time')),
          layout: { ...globalThis.__ms.board2D.layout },
          padding: style($('c2d-figures').querySelector('.ui-figures__body'), 'padding'),
          surface: [style($('c2d-figures'), 'backgroundColor'), style($('c2d-figures'), 'boxShadow')],
          line: [style($('c2d-divider'), 'backgroundColor'), getComputedStyle(document.documentElement).getPropertyValue('--color-line').trim()],
          digits: style($('c2d-time'), 'fontSize'),
          value: style(document.querySelector('#c2d-figures [data-figure="rate"] .ui-figure__value'), 'fontSize'),
          bbbv: style(document.querySelector('#c2d-figures [data-figure="bbbv"] .ui-figure__value'), 'fontSize'),
          figure: style(document.querySelector('#c2d-figures [data-figure="rate"]'), 'paddingTop'),
        };
      });
      g.head = await headWidth();
      assert.equal(g.digits, want.digits, `${size}: the counter digits`);
      if (size !== 'ls') assert.ok(near(g.stage.y, g.strip.bottom + 12, 0.5), `${size}: the board 12 px under the counter strip (${g.stage.y}, ${g.strip.bottom})`);
      if (want.window) {
        const [left, width, height] = want.window;
        // Open, as the states board's second frame draws it: the window hugs its board and figures.
        assert.ok(near(g.frame.x, left) && near(g.frame.width, width), `${size}: the window ${width} px wide at ${left} (${g.frame.x}, ${g.frame.width})`);
        assert.ok(g.frame.height <= height + 1 && g.frame.height >= height - 16, `${size}: the window hugs its content, about ${height} px tall (${g.frame.height})`);
        assert.ok(near(g.frame.y + g.frame.height / 2, (device.viewport.height - 50) / 2, 2), `${size}: centred in the room above the HUD strip (${g.frame.y})`);
        assert.ok(near(g.main.width, want.column) && near(g.main.x, g.frame.x), `${size}: the board column ${want.column} px at the window's start (${g.main.width})`);
        assert.equal(g.layout.scrolls, false, `${size}: Intermediate fits`);
        assert.deepEqual([g.stage.width, g.stage.height, g.panel.width, g.panel.x, g.panel.y], [want.board, want.board, want.board, g.strip.x, g.stage.y], `${size}: the board fills the column, left-aligned at the strip's width`);
        assert.ok(near(g.strip.width, want.board), `${size}: the strip as wide as the board`);
        assert.ok(near(g.divider.width, 2, 0) && g.line[0] !== 'rgba(0, 0, 0, 0)', `${size}: a 2 px divider in the line colour`);
        assert.ok(near(g.figures.width, want.figures) && near(g.figures.x, g.divider.right) && near(g.figures.right, g.frame.right), `${size}: the figures column the ${want.figures} px remainder (${g.figures.width})`);
        assert.equal(g.padding, want.padding, `${size}: the figures column's padding`);
        assert.deepEqual(g.surface, ['rgba(0, 0, 0, 0)', 'none'], `${size}: the figures column flat, no surface`);
        assert.deepEqual([g.value, g.bbbv, g.figure], [want.value, want.bbbv, want.figure], `${size}: the figures' values and spacing`);
        assert.deepEqual([g.restart.width, g.restart.height], [38, 38], `${size}: Restart a 38 px icon square`);
      } else if (want.under) {
        // Below 1024 px the figures row wraps under the board: the board column still sets the window's width.
        assert.ok(g.figures.y >= g.stage.bottom - 0.5, `${size}: the figures under the board`);
        assert.ok(near(g.frame.width, g.main.width) && g.frame.width <= g.stage.width + 28 + 1, `${size}: the window as wide as its board column, never its figures row or its head (${g.frame.width}, ${g.stage.width}, ${g.head})`);
        assert.ok(g.frame.bottom <= device.viewport.height && g.foot.bottom <= g.frame.bottom + 0.5, `${size}: the window whole on the screen`);
      } else if (size === 'p') {
        assert.deepEqual([g.frame.x, g.frame.y, g.frame.width, g.frame.height], [0, 0, 390, 844], `${size}: the window full-bleed`);
        assert.deepEqual([g.stage.x, g.stage.width], [16, 358], `${size}: the board viewport across the window`);
        assert.equal(g.stage.height, g.layout.boardHeight, `${size}: as tall as the board, scrolling sideways (${g.stage.height})`);
        assert.ok(g.layout.scrolls && g.layout.maxScrollY === 0, `${size}: Intermediate scrolls sideways only`);
        assert.ok(near(g.tap.y, g.stage.bottom + 12, 0.5), `${size}: the Tap switch right under the board`);
        assert.ok(g.foot.y - g.tap.bottom > 60, `${size}: spare room at the bottom (${g.foot.y - g.tap.bottom})`);
        assert.deepEqual([g.restart.width, g.restart.height], [38, 38], `${size}: Restart a 38 px icon square, as J-Game2D-p draws it`);
      } else {
        assert.deepEqual([g.frame.width, g.frame.height], [844, 390], `${size}: the window full-bleed`);
        assert.ok(near(g.stage.x, 12, 0) && g.stage.width === g.layout.boardWidth && g.stage.y === g.strip.y, `${size}: the board viewport at the left edge, as wide as the board (${g.stage.x}, ${g.stage.width})`);
        assert.ok(g.layout.scrolls && g.layout.maxScrollX === 0, `${size}: Intermediate scrolls down only`);
        assert.ok(near(g.strip.x, g.stage.right + 12) && near(g.strip.right, 844 - 12) && g.strip.width > 340, `${size}: the right column fills the rest (${g.strip.width})`);
        assert.ok(g.mines.bottom <= g.time.y && g.time.bottom <= g.restart.y, `${size}: the mines, then the time, then Restart`);
        assert.ok(g.clock.right <= g.timeDigits.x, `${size}: the clock icon before the digits`);
        assert.ok(near(g.restart.x, g.strip.x + 12), `${size}: Restart at the column's start (${g.restart.x})`);
        assert.ok(g.tap.y >= g.strip.bottom && near(g.tap.x, g.strip.x), `${size}: the Tap switch under them`);
        assert.deepEqual([g.restart.width, g.restart.height], [38, 38], `${size}: Restart a 38 px icon square, as J-Game2D-ls draws it`);
      }
      if (!device.hasTouch) {
        // A key brings the mode's hint strip: laid over the board column, the board keeps its size, and
        // under the board it never reaches the figures row.
        await page.keyboard.press('ArrowRight');
        await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'));
        await settle();
        const h = await ms(() => {
          const box = (el) => el.getBoundingClientRect().toJSON();
          const el = document.getElementById('hint-strip');
          return { strip: box(el), parent: el.parentElement.id, stage: box(document.getElementById('c2d-stage')), main: box(document.getElementById('c2d-main')), figures: box(document.getElementById('c2d-figures')), tile: globalThis.__ms.board2D.layout.tile, gap: globalThis.__ms.board2D.layout.gap };
        });
        assert.deepEqual([h.stage.width, h.stage.height, h.tile], [g.stage.width, g.stage.height, g.layout.tile], `${size}: the board keeps its size with the strip shown`);
        if (want.window) assert.deepEqual([h.tile, h.gap], want.tile, `${size}: the tile and gap as without the strip`);
        assert.equal(h.parent, 'c2d-stage', `${size}: the strip in the board area`);
        assert.ok(near(h.stage.bottom - h.strip.bottom, 10, 0.5) && h.strip.top >= h.stage.y, `${size}: over the board, 10 px above its foot`);
        if (size === 'xl') assert.ok(near(h.main.bottom - h.strip.bottom, 32, 0.5), `${size}: 32 px off the board column's foot, as J-Game2D-states draws it`);
        if (want.under) assert.ok(h.strip.bottom <= h.figures.y, `${size}: clear of the figures row under the board`);
      }
      assert.deepEqual(errors, [], `${size}: no page errors`);
    } finally {
      await context.close();
    }
  });
}

// The narrow boards at 1366 × 768: the window still hugs its board column, the logo scaling down in tenths to its floor,
// hidden under it; only a board column narrower than Pause and the window buttons widens the window, the column centred.
test('in a browser, the Classic 2D window at 1366 × 768 hugs a narrow board: Beginner and custom 8, 6 and 2 columns wide, the logo scaled, then hidden, then the window widened to Pause and the window buttons', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  try {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.addInitScript(noWebGL);
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await ms(async () => {
      const { BOARD_ART } = await import('/js/classic2d/tile-skin.js');
      while (!BOARD_ART.current()) await new Promise((r) => setTimeout(r, 20));
      await document.fonts.ready;
    });
    const near = (a, b, slack = 1) => Math.abs(a - b) <= slack;
    const boards = [
      ['Beginner', { size: 'beginner' }, 0.7],
      ['8 × 9', { size: 'custom', custom: { width: 8, height: 9, mines: 10 } }, 0.6],
      ['6 × 9', { size: 'custom', custom: { width: 6, height: 9, mines: 10 } }, 0],
      ['2 × 9', { size: 'custom', custom: { width: 2, height: 9, mines: 3 } }, 0],
    ];
    for (const [name, choice, scale] of boards) {
      await ms((c) => { globalThis.__lastStage = null; globalThis.__ms.modes.start('classic-2d', { ...c, noGuess: false }); }, choice);
      await page.waitForFunction(() => {
        const now = JSON.stringify([document.getElementById('c2d-stage').getBoundingClientRect(), document.getElementById('c2d-frame').getBoundingClientRect(), globalThis.__ms.board2D?.layout]);
        const same = globalThis.__lastStage === now;
        globalThis.__lastStage = now;
        return same && !!globalThis.__ms.board2D;
      }, null, { polling: 'raf' });
      const g = await ms(() => {
        const box = (el) => el.getBoundingClientRect().toJSON();
        const f = document.getElementById('c2d-frame');
        const h = f.querySelector('.ui-frame__head');
        const logo = h.querySelector('.ui-frame__logo');
        return { frame: box(f), main: box(document.getElementById('c2d-main')), stage: box(document.getElementById('c2d-stage')), pause: box(document.getElementById('c2d-pause')),
          logo: box(logo), end: box(h.querySelector('.ui-frame__window')), hidden: h.dataset.logo === 'hidden', zoom: Number(getComputedStyle(logo).zoom),
          overflow: h.scrollWidth > h.clientWidth, pad: parseFloat(getComputedStyle(h).paddingLeft), gap: parseFloat(getComputedStyle(h).columnGap) };
      });
      const least = g.pad * 2 + g.gap * 2 + g.pause.width + g.end.width;
      assert.deepEqual([g.pause.width, g.end.width], [38, 130], `${name}: Pause and the window buttons keep their size`);
      assert.ok(!g.overflow && g.pause.x >= g.frame.x && g.end.right <= g.frame.right + 0.5, `${name}: nothing in the title bar overflows the window`);
      if (scale) {
        assert.ok(near(g.frame.width, g.main.width), `${name}: the window as wide as its board column (${g.frame.width}, ${g.main.width})`);
        assert.deepEqual([g.hidden, g.zoom], [false, scale], `${name}: the logo at ${scale * 100} %`);
        assert.ok(g.pause.right <= g.logo.x && g.logo.right <= g.end.x, `${name}: the logo between Pause and the window buttons`);
      } else {
        assert.equal(g.hidden, true, `${name}: under the floor, the logo hidden`);
        assert.equal(g.logo.width, 0, `${name}: the hidden logo takes no room`);
        if (g.main.width >= least) assert.ok(near(g.frame.width, g.main.width), `${name}: the window still hugs its board column (${g.frame.width}, ${g.main.width})`);
        else {
          assert.ok(near(g.frame.width, least), `${name}: the window widened to Pause and the window buttons (${g.frame.width}, ${least})`);
          assert.ok(near(g.stage.x - g.frame.x, g.frame.right - g.stage.right), `${name}: the board centred in the window`);
        }
      }
    }
    assert.deepEqual(errors, [], 'no page errors');
  } finally {
    await context.close();
  }
});

// ---------------------------------------------------------------- form controls as J-Components draws them

// The touch step: the phone sizes, held upright or sideways.
const TOUCH_STEP = '@media (max-width: 719px), (max-height: 500px) and (orientation: landscape)';
const touchStep = (css) => [...css.matchAll(/@media \(max-width: 719px\), \(max-height: 500px\) and \(orientation: landscape\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n');
// Every kit control whose focus is a ring rather than a selected state.
const RINGED = ['.ui-toggle__input', '.ui-slider__input', '.ui-segmented__option', '.ui-field__input', '.ui-link', '.ui-tabs__tab', '.ui-checkbox__input'];

test('the switch: 60 × 34 with a 24 px knob at 5 px, at 31 px when on; 64 × 38 with a 28 px knob at the touch step', () => {
  const top = rules(topLevel(CSS));
  const body = (sel) => top.filter(([s]) => s === sel).map(([, b]) => b).join(';');
  assert.match(body('.ui-toggle__input'), /width: 60px;[\s\S]*height: 34px;/);
  assert.match(body('.ui-toggle__input::before'), /top: 5px;[\s\S]*left: 5px;[\s\S]*width: 24px;[\s\S]*height: 24px;/);
  assert.match(body('.ui-toggle__input:checked::before'), /left: 31px;/);
  assert.ok(CSS.includes(TOUCH_STEP), 'the base names the touch step');
  const touch = rules(touchStep(CSS));
  const tb = (sel) => touch.filter(([s]) => s === sel).map(([, b]) => b).join(';');
  assert.match(tb('.ui-toggle__input'), /width: 64px;[\s\S]*height: 38px;/);
  assert.match(tb('.ui-toggle__input::before'), /width: 28px;[\s\S]*height: 28px;/);
});

test('the switch row: the label over its help line on the left, the switch at the right edge; catalogued, styled and in the gallery, its label inked when the switch is locked', () => {
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-switchrow — /, 'the head documents the switch row');
  const row = kit('ui-switchrow');
  assert.ok(row && row.kind === 'component', 'the catalogue holds the switch row');
  assert.deepEqual(row.parts.map((p) => [p.name, p.optional]), [['text', false], ['label', false], ['help', true], ['switch', false]]);
  assert.equal(kitPart('ui-switchrow', 'switch').as, 'ui-toggle', 'its switch is the kit\'s switch');
  assert.match(baseBody('.ui-switchrow'), /display:\s*flex/);
  assert.match(baseBody('.ui-switchrow'), /justify-content:\s*space-between/, 'the switch at the right edge');
  assert.match(baseBody('.ui-switchrow__text'), /flex-direction:\s*column/, 'the label over its help line');
  assert.match(baseBody('.ui-switchrow__label'), /font-size:\s*18px/);
  assert.match(baseBody('.ui-switchrow__label'), /font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(baseBody('.ui-switchrow__help'), /font-size:\s*14px/);
  assert.match(themeBody('.ui-switchrow__label'), /color:\s*var\(--color-ink\)/);
  assert.match(themeBody('.ui-switchrow__help'), /color:\s*var\(--color-ink-muted\)/);
  assert.ok(!THEME_RULES.some(([sel, b]) => sel.includes('ui-switchrow') && /--color-locked-ink/.test(b)), 'a locked switch leaves its row\'s label inked');
  const rows = within(LAYOUT_TAGS, '.ui-switchrow');
  assert.ok(rows.length >= 2, 'the gallery shows the switch row');
  const parts = rows.map((r) => inside(LAYOUT, LAYOUT_TAGS, r));
  for (const p of parts) {
    const label = within(p, '.ui-switchrow__label')[0];
    const input = within(p, '.ui-toggle__input')[0];
    assert.ok(label.tag === 'label' && input && label.attrs.for === input.attrs.id, 'the label names the switch');
    assert.equal(input.attrs.role, 'switch');
    const help = within(p, '.ui-switchrow__help')[0];
    if (help) assert.equal(input.attrs['aria-describedby'], help.attrs.id, 'the help line describes the switch');
  }
  assert.ok(parts.some((p) => within(p, '.ui-toggle__input').some((i) => 'disabled' in i.attrs)), 'a row with its switch locked');
  assert.ok(parts.some((p) => within(p, '.ui-switchrow__help').length === 0), 'a row with no help line');
});

test('the slider: an 8 px track filled in the teal edge from the start to the thumb by --slider-fill, a 26 px thumb, the value after the track under the label', () => {
  for (const track of ['::-webkit-slider-runnable-track', '::-moz-range-track']) {
    const body = themeBody(`.ui-slider__input${track}`);
    assert.match(body, /linear-gradient\(to right, var\(--color-teal-edge\) [^,]*var\(--slider-fill\)[^,]*, var\(--color-line\)/, `${track}: the fill, then the line`);
    assert.match(baseBody(`.ui-slider__input${track}`), /height: 8px/);
  }
  assert.match(THEME_RAW, /--slider-fill:\s*0;/, 'the theme declares the fill before the kit sets it');
  assert.ok(REQUIRED_TOKENS.includes('--slider-fill'), 'every theme declares it');
  assert.match(baseBody('.ui-slider__input::-moz-range-thumb'), /width: 26px; height: 26px;/);
  const slider = baseBody('.ui-slider');
  assert.match(slider, /grid-template-columns:\s*minmax\(0, 1fr\) auto/);
  assert.match(slider, /column-gap:\s*14px/);
  assert.match(baseBody('.ui-slider__label'), /grid-column:\s*1 \/ -1/, 'the label over the row');
  assert.match(baseBody('.ui-slider__input'), /grid-area:\s*2 \/ 1/, 'the track first on the row');
  const value = baseBody('.ui-slider__value');
  assert.match(value, /grid-area:\s*2 \/ 2/, 'the value after it');
  assert.match(value, /min-width:\s*64px/);
  assert.match(value, /text-align:\s*right/);
  assert.match(value, /font-size:\s*16px/);
  assert.match(read('js/ui/components.js'), /setProperty\('--slider-fill'/, 'the kit sets it');
});

test('the number field: 48 px high, 0 14 px padding, 19 px mono bold, radius 12, a 2 px border; refused, is-invalid in the danger colour with its fill as a halo', () => {
  const input = baseBody('.ui-field__input');
  assert.match(input, /height:\s*48px/);
  assert.match(input, /padding:\s*0 14px/);
  assert.match(input, /font-size:\s*19px/);
  assert.match(input, /font-weight:\s*var\(--font-weight-bold\)/);
  const drawn = themeBody('.ui-field__input');
  assert.match(drawn, /border:\s*2px solid var\(--color-field-border\)/);
  assert.match(drawn, /border-radius:\s*var\(--radius-md\)/);
  const invalid = themeBody('.ui-field__input.is-invalid');
  assert.match(invalid, /border-color:\s*var\(--color-danger\)/);
  assert.match(invalid, /box-shadow:\s*0 0 0 3px var\(--color-danger-fill\)/);
  assert.equal(kitPart('ui-field', 'input').states.invalid, '.ui-field__input.is-invalid', 'the catalogue holds the invalid state');
  const shown = TAGS.filter((t) => hasClasses(t, '.ui-field__input.is-invalid'));
  assert.ok(shown.length > 0 && shown.every((t) => t.attrs['aria-invalid'] === 'true'), 'the gallery shows it, marked aria-invalid');
  for (const f of ['css/components.css', 'themes/joyful-tiles/theme.css', 'dev/components.html', 'js/classic2d/board-choice.js', 'js/mode3d/board-choice.js']) {
    assert.doesNotMatch(read(f), /data-adjusted/, `${f}: no adjusted state`);
  }
  for (const f of ['js/classic2d/board-choice.js', 'js/mode3d/board-choice.js']) {
    assert.match(read(f), /classList\.toggle\('is-invalid', /, `${f} marks the refused field is-invalid`);
  }
});

test('the small controls: segmented option, checkbox, badge, tab and section heading at J-Components\' metrics, no strike-through on a locked option or tab', () => {
  const option = baseBody('.ui-segmented__option');
  assert.match(option, /padding:\s*7px 14px/);
  assert.match(option, /font-size:\s*15px/);
  assert.match(option, /font-weight:\s*var\(--font-weight-bold\)/);
  assert.match(themeBody('.ui-segmented__option'), /border-radius:\s*10px/);
  for (const sel of ['.ui-segmented__option:disabled', '.ui-tabs__tab:disabled']) {
    assert.match(themeBody(sel), /color:\s*var\(--color-locked-ink\)/, `${sel} in the locked ink`);
    assert.doesNotMatch(themeBody(sel), /line-through/, `${sel} is not struck through`);
  }
  const box = baseBody('.ui-checkbox');
  assert.match(box, /gap:\s*8px/);
  assert.match(box, /font-size:\s*15px/);
  assert.match(box, /font-weight:\s*var\(--font-weight-bold\)/);
  const chip = baseBody('.ui-chip');
  assert.match(chip, /padding:\s*3px 8px/);
  assert.match(chip, /gap:\s*6px/);
  assert.match(themeBody('.ui-chip'), /letter-spacing:\s*0\.06em/);
  assert.match(baseBody('.ui-tabs__tab'), /padding:\s*9px 14px/);
  const selected = themeBody('.ui-tabs__tab[aria-selected="true"]');
  assert.match(selected, /color:\s*var\(--color-ink\)/);
  assert.match(selected, /border-bottom-color:\s*var\(--color-accent\)/);
  assert.match(themeBody('.ui-tabs__tab'), /border-bottom:\s*3px solid transparent/, 'a 3 px underline');
  assert.doesNotMatch(selected, /background/, 'no fill on the selected tab');
  assert.match(baseBody('.ui-heading'), /font-size:\s*13px/);
  assert.match(themeBody('.ui-heading'), /letter-spacing:\s*0\.2em/);
});

test('the focus ring: every ringed control takes the switch\'s — a 3 px navy outline at offset 4 and the 10 px yellow halo, no inset border while focused', () => {
  for (const cls of RINGED) {
    const ring = THEME_RULES.filter(([sel]) => sel.split(',').map((s) => s.trim()).includes(`${cls}:focus-visible`)).map(([, b]) => b).join(';');
    assert.match(ring, /outline:\s*3px solid var\(--color-focus-ring\)/, `${cls}: the outline`);
    assert.match(ring, /outline-offset:\s*4px/, `${cls}: at offset 4`);
    assert.match(ring, /box-shadow:\s*0 0 0 10px var\(--color-focus-halo\) !important\s*(;|$)/, `${cls}: the halo alone, over its hover and pressed looks`);
    for (const sel of [`body.pad-nav ${cls}:focus`, `${cls}[data-force~="focus"]`]) {
      assert.ok(THEME_RULES.some(([s, b]) => s.split(',').map((x) => x.trim()).includes(sel) && /--color-focus-halo/.test(b)), `${sel} shows it too`);
    }
  }
  assert.ok(!THEME_RULES.some(([sel, b]) => /:focus|data-force~="focus"/.test(sel) && /9px var\(--color-focus-halo\)/.test(b)), 'no 9 px halo remains');
});

test('in a browser, a board choice opened by the mouse keeps its chosen option at rest; a key\'s focus, or the pointer over it, selects it', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => document.getElementById('menu-entry-classic-2d')?.getBoundingClientRect().width > 0, null, { timeout: patience(20000) });
    await page.click('#menu-entry-classic-2d');
    await page.waitForFunction(() => document.activeElement?.classList.contains('ui-option'), null, { timeout: patience(10000) });
    // Let the option's own transition finish before reading its look.
    const look = async () => { await page.waitForTimeout(400); return page.evaluate(() => { const e = document.activeElement; return { chosen: e.getAttribute('aria-pressed'), transform: getComputedStyle(e).transform }; }); };
    const opened = await look();
    assert.deepEqual(opened, { chosen: 'true', transform: 'none' }, 'opened by the mouse, the chosen option keeps its resting drop');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowUp');
    const keyed = await look();
    assert.notEqual(keyed.transform, 'none', 'a key\'s focus selects the option');
    const box = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(box.x, box.y);
    await page.mouse.move(box.x + 2, box.y);
    const hovered = await look();
    assert.notEqual(hovered.transform, 'none', 'the mouse over the focused option selects it');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// ---------------------------------------------------------------- kit frames: size steps, the white action foot, message cards, scrims, status cards

// The canvas's window-size steps: compact for the smaller desktop windows (1366 × 768, 1024 × 768),
// touch for the phone sizes upright or sideways.
const COMPACT_STEP = '(max-width: 1439px), (max-height: 820px)';
const TOUCH_QUERY = TOUCH_STEP.slice('@media '.length);
// The rules of every @media block of exactly `query` in `css`, as [selector, body] pairs, the theme's scope taken off.
function mediaRules(css, query) {
  const out = [];
  const opener = `@media ${query} {`;
  for (let i = css.indexOf(opener); i >= 0; i = css.indexOf(opener, i + 1)) {
    let depth = 1;
    let j = i + opener.length;
    for (; depth > 0 && j < css.length; j++) {
      if (css[j] === '{') depth++;
      else if (css[j] === '}') depth--;
    }
    out.push(...rules(css.slice(i + opener.length, j - 1)));
  }
  return out.map(([sel, body]) => [sel.split(SCOPE).join('').trim(), body]);
}
// The bodies of the rules whose selector list holds `sel` whole.
const bodyOf = (list, sel) => list.filter(([s]) => splitTop(s, ',').map((x) => x.trim()).includes(sel)).map(([, b]) => b).join(';');
function splitTop(s, sep) {
  const out = [];
  let depth = 0;
  let from = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') depth--;
    else if (s[i] === sep && depth === 0) { out.push(s.slice(from, i)); from = i + 1; }
  }
  out.push(s.slice(from));
  return out;
}
const footOf = (id) => {
  const start = INDEX.indexOf(`<section id="${id}"`);
  const at = INDEX.indexOf('<footer', start);
  return INDEX.slice(at, INDEX.indexOf('>', at) + 1);
};

test('the frame\'s head and foot follow the canvas\'s size steps — desktop, compact, touch — their values in the theme', () => {
  const head = bodyOf(THEME_RULES, '.ui-frame__head');
  assert.match(head, /min-height: 64px;/);
  assert.match(head, /padding: 10px 16px;/);
  assert.match(bodyOf(THEME_RULES, '.ui-frame__end'), /gap: 10px;/, 'the head\'s actions 10 px apart');
  assert.match(bodyOf(THEME_RULES, '.ui-frame__foot'), /padding: 8px 22px;/);
  assert.match(bodyOf(THEME_RULES, '.ui-frame__title'), /font-size: 20px;/);
  const compact = mediaRules(THEME_CSS, COMPACT_STEP);
  assert.match(bodyOf(compact, '.ui-frame__head'), /min-height: 56px;\s*padding: 8px 14px;/, 'the compact head');
  assert.match(bodyOf(compact, '.ui-frame__title'), /font-size: 18px;/);
  assert.match(bodyOf(compact, '.ui-button--lg'), /font-size: 21px;/, 'every large button\'s label 21 px when compact');
  const touch = mediaRules(THEME_CSS, TOUCH_QUERY);
  assert.match(bodyOf(touch, '.ui-frame__head'), /min-height: 60px;\s*padding: 8px 10px;/, 'the touch head');
  assert.match(bodyOf(touch, '.ui-frame__title'), /font-size: 17px;/);
  assert.match(bodyOf(touch, '.ui-button--sm'), /min-height: 44px;/, 'a small button a finger tall; the md button already is');
  assert.ok(THEME_CSS.indexOf(`@media ${COMPACT_STEP}`) >= 0 && THEME_CSS.indexOf(`@media ${COMPACT_STEP}`) < THEME_CSS.lastIndexOf(`@media ${TOUCH_QUERY}`),
    'the touch step comes after the compact one, so a phone held sideways takes it');
  const title = bodyOf(RULES, '.ui-frame__title');
  assert.match(title, /white-space: nowrap;/, 'the title on one line at every step');
  assert.match(title, /text-overflow: ellipsis;/);
  // The game window's head takes the same steps: no head size of its own.
  assert.doesNotMatch(STYLE, /#c2d-frame > \.ui-frame__head \{[^}]*(min-height|padding)/, 'the Classic 2D window\'s head follows the steps');
  assert.doesNotMatch(STYLE, /#c2d-title \{[^}]*font-size/, 'and so does its title');
  assert.doesNotMatch(STYLE, /#replay-title \{[^}]*white-space: normal/, 'the replay viewer\'s title stays on one line on a phone');
});

test('the white action foot: board choices, Daily and results end in a white bar, the game window keeps its yellow foot', () => {
  const frame = KIT_CATALOGUE.find((c) => c.name === 'ui-frame');
  assert.ok(frame.variants.includes('ui-frame__foot--action'), 'the foot variant is catalogued');
  assert.match(RAW.match(/^\/\*([\s\S]*?)\*\//)[1], /ui-frame__foot--action/, 'and documented in the catalogue');
  assert.match(GALLERY, /class="ui-frame__foot ui-frame__foot--action"/, 'and shown in the gallery');
  for (const id of ['c2d-choice', 'board-choice', 'daily', 'results']) assert.match(footOf(id), /class="ui-frame__foot ui-frame__foot--action"/, `#${id}'s foot is the action foot`);
  assert.doesNotMatch(WINDOW_2D, /ui-frame__foot--action/, 'the game window keeps the yellow foot');
  const foot = bodyOf(THEME_RULES, '.ui-frame__foot--action');
  assert.match(foot, /border-top: 2px solid var\(--color-line\);/);
  assert.match(foot, /background: var\(--color-surface\);/);
  assert.match(foot, /padding: 14px 24px 18px;/);
  assert.match(bodyOf(THEME_RULES, '.ui-frame__foot--action .ui-frame__summary'), /font-size: 16px;[^;]*\s*font-weight: var\(--font-weight-bold\);/, 'the summary 16 px bold');
  assert.match(bodyOf(mediaRules(THEME_CSS, COMPACT_STEP), '.ui-frame__foot--action'), /padding: 10px 20px 14px;/);
  const phone = bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), '.ui-frame__foot--action');
  assert.match(phone, /min-height: 92px;/, 'a bottom bar 92 px tall on a phone');
  assert.match(phone, /justify-content: flex-end;/, 'its actions on the right');
  assert.match(phone, /box-shadow: 0 -10px 20px -12px var\(--shade-press\);/);
  // The results foot, the action bar, is roomier.
  assert.match(bodyOf(THEME_RULES, '#results-actions'), /padding: 16px 28px 20px;/);
  assert.match(bodyOf(mediaRules(THEME_CSS, COMPACT_STEP), '#results-actions'), /padding: 14px 22px 18px;/);
  assert.match(bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), '.ui-frame__foot--action'), /padding: 0 16px;/, 'on a phone the bar');
  assert.match(bodyOf(mediaRules(THEME_CSS, TOUCH_QUERY), '#results-actions'), /min-height: 0; padding: 14px 16px 18px; box-shadow: none;/, 'but the results bar stays in flow at the card\'s end');
  assert.doesNotMatch(STYLE, /#results-actions \{[^}]*padding/, 'its paddings are the theme\'s');
  assert.doesNotMatch(STYLE, /#c2d-frame > \.ui-frame__foot \{[^}]*padding/, 'the game window\'s foot follows the steps');
});

test('the message card: ink text, the canvas\'s type, and an even 14 px gap between badge, title, text and actions', () => {
  const card = bodyOf(RULES, '.ui-card');
  assert.match(card, /display: flex;\s*flex-direction: column;\s*gap: 14px;\s*padding: 24px 26px;/);
  assert.doesNotMatch(bodyOf(RULES, '.ui-card__icon'), /margin/, 'the gap sets the badge off, not a margin');
  assert.match(bodyOf(RULES, '.ui-card > .ui-card__title'), /margin: 0;\s*font-size: 28px;\s*line-height: 1\.1;/);
  assert.match(bodyOf(RULES, '.ui-card > .ui-text'), /line-height: 1\.4;/);
  assert.match(bodyOf(RULES, '.ui-screen'), /gap: 14px;/, 'a card column keeps the card\'s gap');
  assert.doesNotMatch(STYLE, /:is\(\.fatal, \.noscript, \.not-found\) > \.ui-card > \.ui-text \{/, 'the message pages\' line takes the gap, no margin');
  // The placeholder: its title 36 px, its line in ink.
  assert.match(bodyOf(rules(STYLE), '#coming-soon-heading'), /margin: 0;\s*font-size: 36px;\s*line-height: 1\.1;/);
  assert.match(bodyOf(rules(STYLE), '#coming-soon-text'), /line-height: 1\.4;/);
  // The replay failure card: its title, in a row with the spinner, takes the message card's type.
  assert.match(bodyOf(rules(STYLE), '#replay-message > .ui-row > .ui-card__title'), /margin: 0;\s*font-size: 28px;\s*line-height: 1\.1;/);
  assert.match(INDEX, /<p id="coming-soon-text" class="ui-text">/);
  assert.match(bodyOf(rules(STYLE), '#coming-soon-panel'), /gap: 16px;/, 'the placeholder\'s column 16 px apart, its lock badge leading it');
  // The context-lost card: 480 px, Click to reload with the refresh icon, Main menu with no Esc key hint.
  assert.match(bodyOf(rules(STYLE), '#ctx-lost > .ui-card'), /width: min\(480px, 100%\);/);
  assert.match(INDEX, /<button type="button" id="ctx-lost-btn" class="ui-button ui-button--primary ui-button--go" data-icon="refresh">Click to reload<\/button>/);
  assert.match(INDEX, /<button type="button" id="ctx-lost-menu" class="ui-button ui-button--secondary">Main menu<\/button>/);
});

test('the scrim: the plain backdrop colour, no blur, the same over 2D and 3D; behind the ready card, the pause card and results only the board or the scene and the window\'s logo', () => {
  const scrim = bodyOf(THEME_RULES, ':is(#pause, #ready, #results, #learn-end, #ctx-lost)');
  assert.match(scrim, /background: var\(--color-backdrop\);/);
  assert.doesNotMatch(THEME_CSS, /backdrop-filter/, 'no blur over any screen');
  assert.doesNotMatch(THEME_CSS, /var\(--color-backdrop-strong\)/, 'no stronger scrim over 3D or a lost context');
  assert.doesNotMatch(THEME_CSS, /#results\.results--over3d/, 'the results over 3D take the one scrim');
  const behind = ':is(#ready:not(.hidden):not(.ready--pending), #pause:not(.hidden), #results:not(.hidden))';
  assert.match(bodyOf(rules(STYLE), `body:has(> ${behind}) #hud`), /visibility: hidden;/, 'the HUD, the 3D overlay and its figures panel go');
  const chrome = bodyOf(rules(STYLE), `body:has(> ${behind}) #c2d-frame :is(.ui-frame__start, .ui-frame__end, #c2d-counters, #c2d-figures, #c2d-divider, .ui-frame__foot, #hud-tap)`);
  assert.match(chrome, /visibility: hidden;/, 'the Classic 2D window keeps its board and its title bar\'s logo alone');
});

test('the board status cards: centred on the board column, the canvas\'s spinner, progress and failure line, Retry and Back with their icons, a scrim in 3D', () => {
  assert.match(bodyOf(RULES, '.ui-spinner'), /width: 44px;\s*height: 44px;/);
  assert.match(bodyOf(THEME_RULES, '.ui-spinner'), /border: 5px solid/);
  assert.match(bodyOf(rules(STYLE), ':is(#c2d-status, #m3d-status) > .ui-row'), /gap: var\(--space-4\);/, 'a 16 px gap between the spinner and the title');
  assert.match(bodyOf(rules(STYLE), ':is(#c2d-status, #m3d-status) .ui-card__title'), /margin: 0;\s*font-size: var\(--font-size-xl\);/);
  assert.match(bodyOf(rules(STYLE), ':is(#c2d-progress, #m3d-progress)'), /margin: 4px 0 0;\s*font-size: 15px;/);
  assert.match(bodyOf(THEME_RULES, ':is(#c2d-progress, #m3d-progress)'), /font-family: var\(--font-family-mono\);/, 'the progress line in the mono face');
  for (const p of ['c2d', 'm3d']) {
    assert.match(INDEX, new RegExp(`<p id="${p}-status-text" class="ui-text hidden"></p>`), `#${p}-status-text in ink`);
    assert.match(INDEX, new RegExp(`<button type="button" id="${p}-retry" class="ui-button ui-button--primary ui-button--go" data-icon="refresh">Retry</button>`), `#${p}-retry carries the refresh icon`);
  }
  const ui = read('js/ui.js');
  assert.match(ui, /setButtonIcon\(menu, fixed \? 'arrow-left' : null\)/, 'a fixed board\'s Back carries the arrow icon, Main menu none');
  assert.match(ui, /_centreStatus2D\(\)/, 'the Classic 2D card is placed on the board column');
  // In 3D: a scrim over the scene, and no HUD, figures or hint strip behind the card.
  assert.match(bodyOf(THEME_RULES, '#m3d-status'), /0 0 0 100vmax var\(--color-backdrop\)/);
  assert.match(bodyOf(rules(STYLE), 'body:has(> #m3d-status:not(.hidden)) #hud'), /visibility: hidden;/);
});

// ---------------------------------------------------------------- the gallery beside J-Components

// Every part the canvas's components artboard (J-Components) draws, as the gallery marks it
// (data-canvas="<name>") and the class of the marked element, which the kit catalogue lists.
const CANVAS_PARTS = Object.freeze({
  'quiet-button': 'ui-button--quiet',
  'swap-clicks': 'ui-button--quiet',
  'confirm-go': 'ui-button--go',
  'title-bar-quit': 'ui-button--stop',
  'tap-toggle': 'ui-segmented',
  'hint-strip': 'hud-panel',
  'view-chip': 'chip',
  'hud-key-strip': 'hud-tools',
  'status-generating': 'ui-card',
  'status-failed': 'ui-card',
  'confirmation': 'ui-confirm',
  'help-card': 'hud-panel',
  'crosshair': 'crosshair',
  'aim-readout': 'aim-readout',
  'offscreen-arrow': 'crosshair-arrow',
  'field-invalid': 'ui-field__input',
  'board-preview': 'ui-scene-panel',
  '3d-preview': 'ui-scene-panel',
  'play-tile': 'ui-play-tile',
  'small-entry': 'ui-small-entry',
  'phone-row': 'ui-play-tile--row',
  'note-warn': 'ui-note--warn',
  'note-err': 'ui-note--err',
  'switch-row': 'ui-switchrow',
  'panel-toggle': 'ui-button--quiet',
  'drawer': 'ui-drawer',
  'icon-set': 'icon-set',
  'theme-list': 'theme-list',
  'touch-stick': 'touch-stick',
});
const CATALOGUED = new Set(KIT_CATALOGUE.flatMap((c) => [
  c.selector, ...(c.base ? [`.${c.base}`] : []), ...c.variants.map((v) => `.${v}`),
  ...c.parts.flatMap((p) => [p.selector, ...Object.values(p.states ?? {})]), ...c.slots.map((x) => x.selector),
]).flatMap((sel) => [...sel.matchAll(/\.([\w-]+)/g)].map((m) => m[1])));
// The gallery's own layout classes: the ones its inline <style> lays out and no theme draws.
const GALLERY_STYLE = [...GALLERY.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
const GALLERY_LAYOUT = new Set([...GALLERY_STYLE.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]).filter((c) => !CATALOGUED.has(c)));
const GALLERY_BODY_TAGS = TAGS.filter((t) => t.index > GALLERY.indexOf('<body>') && t.index < GALLERY.indexOf('<script type="module">'));

test('the gallery shows every part J-Components draws, each in the class the kit catalogue lists', () => {
  for (const [name, cls] of Object.entries(CANVAS_PARTS)) {
    const marked = GALLERY_BODY_TAGS.filter((t) => t.attrs['data-canvas'] === name);
    assert.ok(marked.length > 0, `the gallery shows ${name}`);
    assert.ok(marked.every((t) => classesOf(t).includes(cls)), `${name} is a ${cls}`);
    if (!['icon-set', 'theme-list'].includes(name)) assert.ok(CATALOGUED.has(cls), `the catalogue lists ${cls}`);
  }
  const swap = GALLERY_BODY_TAGS.filter((t) => t.attrs['data-canvas'] === 'swap-clicks');
  assert.deepEqual(swap.map((t) => t.attrs['aria-pressed']).sort(), ['false', 'true'], 'Swap clicks off and on');
  assert.ok(swap.every((t) => hasClasses(t, '.ui-button--sm') && 'title' in t.attrs), 'small, with its tooltip, as the game window\'s');
  const tap = GALLERY_BODY_TAGS.filter((t) => t.attrs['data-canvas'] === 'tap-toggle');
  assert.equal(tap.length, 2, 'Tap: Reveal and Tap: Flag, each chosen');
  assert.ok(GALLERY_BODY_TAGS.some((t) => t.attrs['data-canvas'] === 'hud-key-strip' && hasClasses(t, '.hud-panel')), 'the HUD key strip is a HUD panel');
  assert.ok(GALLERY_BODY_TAGS.some((t) => t.attrs.id === 'hint-strip-close' && t.attrs['aria-label']), 'the hint strip\'s dismiss button, named');
  assert.ok(GALLERY_BODY_TAGS.some((t) => t.attrs['data-canvas'] === 'view-chip' && hasClasses(t, '.chip')), 'a view chip');
  assert.ok(GALLERY_BODY_TAGS.some((t) => t.attrs['data-canvas'] === 'field-invalid' && hasClasses(t, '.is-invalid') && t.attrs['aria-invalid'] === 'true'), 'the field\'s invalid state');
  for (const id of ['crosshair', 'crosshair-arrow', 'aim-readout', 'hint-strip', 'help']) {
    assert.ok(GALLERY_BODY_TAGS.some((t) => t.attrs.id === id), `#${id}, the id the theme draws it by`);
  }
  // The game's markup carries the classes the catalogue names these parts by.
  for (const [id, cls] of [['crosshair', 'crosshair'], ['crosshair-arrow', 'crosshair-arrow'], ['aim-readout', 'aim-readout'], ['touch-stick', 'touch-stick']]) {
    assert.match(INDEX, new RegExp(`<div id="${id}" class="(?:[\\w-]+ )*${cls}(?: [\\w-]+)*"`), `index.html's #${id} is a ${cls}`);
  }
  // The text the canvas shows comes from the same sources as the game's.
  for (const name of ['hintStripHtml', 'hudStripHtml', 'helpListHtml', 'helpFootHtml']) assert.match(GALLERY, new RegExp(`\\b${name}\\('classic-2d', 'keyboard'\\)`), `the gallery draws ${name} as the game does`);
  assert.match(GALLERY, /settingControlHtml\('theme'/, 'the theme list is the Settings page\'s');
  assert.match(GALLERY, /bindSettingControls\(/, 'bound as the Settings page binds it');
  assert.match(GALLERY, /bindMenuPreview\(/, 'the Classic 2D board drawn into its scene panel as the menu draws it');
  assert.match(GALLERY, /new BoardRenderer\(/, 'the 3D preview drawn by the 3D renderer');
});

test('the kit catalogue lists every part the gallery shows; the rest is the gallery\'s own layout', () => {
  const shown = new Set(GALLERY_BODY_TAGS.flatMap(classesOf));
  for (const cls of shown) {
    assert.ok(CATALOGUED.has(cls) || GALLERY_LAYOUT.has(cls) || PLAIN_CONTENT.has(cls), `${cls} is catalogued or the gallery's layout`);
  }
  for (const cls of GALLERY_LAYOUT) assert.ok(!THEME_RULES.some(([sel]) => new RegExp(`\\.${cls}(?![\\w-])`).test(sel)), `no theme draws the gallery's layout class ${cls}`);
  // The overlay's own parts are catalogued components every theme is held to.
  for (const name of ['hud-panel', 'chip', 'crosshair', 'crosshair-arrow', 'aim-readout', 'touch-stick']) {
    assert.equal(kit(name)?.kind, 'component', `${name} is catalogued`);
  }
  assert.deepEqual(kit('hud-panel').variants, ['hud-tools']);
  assert.deepEqual(kit('hud-panel').parts.map((p) => [p.name, p.selector]), [
    ['hint', '#hint-strip'], ['step', '.hint-step'], ['dismiss', '.hint-close'], ['help', '#help'], ['title', '#help-title'], ['foot', '.help-foot'],
  ]);
});
// Plain content inside a catalogued component, drawn by the component around it in its ink: the
// overlay's glyphs (laid out by css/style.css) and a note's text.
const PLAIN_CONTENT = new Set(['aim-icon', 'aim-icon--cube', 'aim-icon--flag', 'chip__icon', 'ui-note__text']);

test('the gallery lays its demos out with gaps: the columns blocks, the results body and the cards', () => {
  assert.match(GALLERY_STYLE, /\.columns-demo \{[^}]*display: flex; flex-direction: column; gap: var\(--space-\d\)/, 'a gap between the columns blocks');
  assert.match(GALLERY_STYLE, /#g-results \.ui-frame__body \{[^}]*display: flex; flex-direction: column; gap: 18px;/, 'the results body as the screen lays it out');
  assert.doesNotMatch(GALLERY, /<div class="wide">/, 'no wrapper stacks the cards without the grid\'s gap');
});

test('in a browser, the gallery beside J-Components: no part overlaps another, every canvas part drawn, the theme list and both previews', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    for (const width of [1280, 760]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/dev/components.html`);
      await page.evaluate(() => globalThis.galleryReady);
      await page.waitForFunction(() => document.querySelector('[data-canvas="3d-preview"]').dataset.shows
        && document.querySelector('[data-canvas="board-preview"] canvas')
        && document.querySelector('#g-tile-hexagon .ui-play-tile__art canvas')
        && [...document.querySelectorAll('[data-canvas="theme-list"] .ui-segmented__swatch')].every((s) => s.style.background), null, { timeout: patience(10000) });
      const got = await page.evaluate(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
        const overlap = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
        const cards = [...document.querySelectorAll('.grid > *')].map(box);
        const cardOverlaps = [];
        for (let i = 0; i < cards.length; i++) for (let j = i + 1; j < cards.length; j++) if (overlap(cards[i], cards[j])) cardOverlaps.push([i, j]);
        const blocks = [...document.querySelectorAll('.columns-demo > .ui-columns')].map(box);
        const results = document.getElementById('g-results');
        const middle = document.querySelectorAll('.figures-row > .ui-figures')[1];
        const bar = middle.querySelector('.ui-figure__bar');
        const parts = {};
        for (const el of document.querySelectorAll('[data-canvas]')) {
          const b = box(el);
          parts[el.dataset.canvas] = Math.min(parts[el.dataset.canvas] ?? Infinity, b.width * b.height);
        }
        const list = document.querySelector('[data-canvas="theme-list"] .ui-segmented--list');
        const preview3d = document.querySelector('[data-canvas="3d-preview"]');
        const board = document.querySelector('[data-canvas="board-preview"] canvas');
        return {
          cardOverlaps,
          gaps: blocks.slice(1).map((b, i) => b.top - blocks[i].bottom),
          resultsGap: box(results.querySelector('.ui-stat-row')).top - box(results.querySelector('.ui-frame__body > .ui-text')).bottom,
          bar: bar ? box(bar).height : 0,
          parts,
          list: list && {
            options: [...list.querySelectorAll('.ui-segmented__option')].map((o) => [o.dataset.value, o.getAttribute('aria-checked')]),
            current: document.documentElement.dataset.theme,
          },
          preview3d: { shows: preview3d.dataset.shows, canvas: !!preview3d.querySelector('canvas'), tag: preview3d.querySelector('.ui-scene-panel__tag').textContent },
          board: board && box(board),
          boardTag: document.querySelector('[data-canvas="board-preview"] .ui-scene-panel__tag').textContent,
          tiles: ['g-tile-classic', 'g-tile-hexagon'].map((id) => document.querySelector(`#${id} .ui-play-tile__preview`).dataset.preview
            + (document.querySelector(`#${id} .ui-play-tile__art canvas`) ? ' drawn' : '')),
        };
      });
      assert.deepEqual(got.cardOverlaps, [], `${width}: no card overlaps another`);
      assert.deepEqual(got.tiles, ['board drawn', 'board drawn'], `${width}: the Classic 2D and Hexagon play tiles each draw their board`);
      assert.ok(got.gaps.length >= 2 && got.gaps.every((g) => g >= 12), `${width}: the columns blocks stand apart (${got.gaps})`);
      assert.ok(got.resultsGap >= 12, `${width}: the results' tiles stand below the board line (${got.resultsGap})`);
      assert.ok(got.bar > 0, `${width}: the panel with no best keeps its 3BV progress bar`);
      for (const name of Object.keys(CANVAS_PARTS)) assert.ok(got.parts[name] > 0, `${width}: ${name} is drawn`);
      assert.ok(got.list.options.length > 0 && got.list.options.every(([id, on]) => on === String(id === got.list.current)), `${width}: the theme list shows the active theme chosen`);
      assert.equal(got.boardTag, 'Classic 2D · Intermediate');
      assert.ok(got.board.width > 100 && got.board.height > 100, `${width}: the Classic 2D board drawn in its scene panel`);
      assert.match(got.preview3d.tag, /^3D · Demo board \d+ × \d+ × \d+$/);
      if (got.preview3d.shows === 'scene') assert.ok(got.preview3d.canvas, `${width}: the 3D preview drawn by the renderer`);
      else assert.ok(got.preview3d.shows === 'still' && !got.preview3d.canvas, `${width}: without WebGL 2 the 3D preview is its still panel`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser.close();
  }
});
