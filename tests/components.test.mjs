import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  decimalsOf, formatSliderValue, segmentedTargetIndex, segmentedState,
  bindSlider, bindSegmented, initComponents, formatOverlayTime, formatMineCount, mineCounterDigits, pagerState, PAGER_WINDOW,
  boardLink, copyBoardCode, bindCodeChip, COPY_FALLBACK, COPIED, bindCodeField,
} from '../js/ui/components.js';
import { UI } from '../js/ui.js';
import { FOCUSABLE } from '../js/shell/navigation.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const RAW = read('css/components.css');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');
const GALLERY = read('dev/components.html');
const TOKENS = new Set([...read('css/tokens.css').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// The catalogue: every component the kit ships, its root class, and whether
// it is interactive (so it owns the five states and the focus contract).
const COMPONENTS = {
  'ui-button--primary': { interactive: true, control: '.ui-button.ui-button--primary' },
  'ui-button--secondary': { interactive: true, control: '.ui-button.ui-button--secondary' },
  'ui-menu': { interactive: true, control: '.ui-menu__item' },
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
};
// Screen compositions: layout-only classes the screens are assembled with.
const COMPOSITIONS = ['ui-screen', 'ui-row', 'ui-grid', 'ui-heading', 'ui-text', 'ui-actions', 'ui-stat-row', 'ui-columns'];
const STATES = ['hover', 'active', 'focus', 'disabled'];

// css rules as [selector, body] pairs (top level and inside @media).
function rules(css) {
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([m[1].trim(), m[2]]);
  return out;
}
const RULES = rules(CSS);
const rulesFor = (needle) => RULES.filter(([sel]) => sel.includes(needle));

// ---------------------------------------------------------------- tokens only

test('components.css declares no custom properties and reads only declared tokens', () => {
  assert.doesNotMatch(CSS, /(^|[;{\s])--[\w-]+\s*:/, 'components.css declares a custom property');
  const reads = [...CSS.matchAll(/var\((--[\w-]+)/g)].map((m) => m[1]);
  assert.ok(reads.length > 20, 'components read their values from tokens');
  for (const name of reads) assert.ok(TOKENS.has(name), `components.css reads undeclared ${name}`);
});

test('components.css carries no literal colour and no theme-specific rule', () => {
  assert.doesNotMatch(CSS, /#[0-9a-f]{3,8}\b/i, 'hex colour literal');
  assert.doesNotMatch(CSS, /\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklch|color-mix)\(/i, 'functional colour literal');
  const named = /:\s*[^;]*\b(white|black|red|green|blue|gray|grey|silver|navy|orange|yellow)\b/i;
  assert.doesNotMatch(CSS, named, 'named colour literal');
  assert.doesNotMatch(CSS, /data-theme|prefers-color-scheme/, 'theme-specific rule');
});

test('low fidelity: no animation but the spinner\'s turn, and shadows and transitions come only from tokens', () => {
  assert.deepEqual([...CSS.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]), ['ui-spinner-turn'], 'the spinner is the one keyframed motion');
  assert.deepEqual(RULES.filter(([, body]) => /animation[\w-]*\s*:/.test(body)).map(([sel]) => sel), ['.ui-spinner'], 'only the spinner animates');
  const [[, spinner]] = RULES.filter(([sel]) => sel === '.ui-spinner');
  assert.match(spinner, /animation: ui-spinner-turn calc\(var\(--duration-\w+\) \* \d+\) linear infinite;/, 'its pace comes from a motion token');
  assert.match(spinner, /border[\w-]*:[^;]*var\(--color-/, 'its colours come from tokens');
  for (const [sel, body] of RULES) {
    for (const m of body.matchAll(/(box-shadow|transition|text-shadow|filter)\s*:\s*([^;]+)/g)) {
      const [, prop, value] = m;
      if (prop === 'box-shadow') assert.match(value.trim(), /^(none|var\(--elevation-\d\))$/, `${sel} ${prop}: ${value}`);
      else if (prop === 'transition') {
        for (const part of value.split(',')) {
          assert.match(part.trim(), /^[\w-]+ var\(--duration-\w+\) var\(--easing-\w+\)$/, `${sel} transition: ${part}`);
        }
      } else assert.fail(`${sel} uses ${prop}`);
    }
  }
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
    assert.ok(rulesFor(`.${name}`).length > 0, `${name} is styled`);
  }
});

test('every interactive component has hover, pressed, focused and disabled states', () => {
  for (const [name, c] of Object.entries(COMPONENTS)) {
    if (!c.interactive) continue;
    const own = rulesFor(c.control.split('.').pop()).map(([sel]) => sel).join('\n');
    assert.match(own, /:hover/, `${name} hover`);
    assert.match(own, /:active/, `${name} pressed`);
    assert.match(own, /:focus-visible/, `${name} keyboard focus`);
    assert.match(own, /body\.pad-nav [^,]*:focus\b/, `${name} controller focus`);
    assert.match(own, /:disabled|\[aria-disabled="true"\]/, `${name} disabled`);
  }
});

test('the focus ring is drawn from --color-focus-ring and outranks the shell controller ring', () => {
  const focus = RULES.filter(([sel]) => /:focus-visible|:focus\b/.test(sel));
  assert.ok(focus.length > 0);
  for (const [sel, body] of focus) {
    assert.match(body, /outline\s*:\s*[^;]*var\(--color-focus-ring\)/, `${sel} draws the focus ring`);
    if (sel.includes('pad-nav')) assert.match(body, /box-shadow\s*:\s*none/, `${sel} replaces the shell ring`);
  }
});

// ---------------------------------------------------------------- pages

test('index.html loads tokens, then the component kit, then the shell stylesheet', () => {
  const html = read('index.html');
  const t = html.indexOf('href="css/tokens.css"');
  const c = html.indexOf('href="css/components.css"');
  const s = html.indexOf('href="css/style.css"');
  assert.ok(t >= 0 && c > t && s > c, 'tokens.css < components.css < style.css');
});

test('the gallery applies the theme first and loads only the token sheet and the kit', () => {
  const theme = GALLERY.indexOf('src="../js/theme.js"');
  const t = GALLERY.indexOf('href="../css/tokens.css"');
  const c = GALLERY.indexOf('href="../css/components.css"');
  assert.ok(theme >= 0 && t > theme && c > t, 'theme.js < tokens.css < components.css');
  assert.doesNotMatch(GALLERY, /css\/style\.css/);
  const inline = [...GALLERY.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n');
  assert.doesNotMatch(inline, /#[0-9a-f]{3,8}\b|\brgba?\(/i, 'gallery styles use tokens only');
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
    for (const s of ['hover', 'active', 'focus']) assert.ok(forced.has(s), `${name} shown ${s}`);
    const off = (t) => 'disabled' in t.attrs || t.attrs['aria-disabled'] === 'true';
    assert.ok(found.some(off), `${name} shown disabled`);
    assert.ok(found.some((t) => !off(t) && !t.attrs['data-force']), `${name} shown at rest`);
  }
});

test('the gallery preview hooks mirror the real pseudo-classes', () => {
  for (const s of ['hover', 'active', 'focus']) {
    const pseudo = s === 'focus' ? ':focus-visible' : `:${s}`;
    for (const [sel] of RULES.filter(([x]) => x.includes(`[data-force~="${s}"]`))) {
      assert.ok(sel.includes(pseudo), `${sel} pairs the ${s} hook with ${pseudo}`);
    }
    assert.ok(RULES.some(([x]) => x.includes(`[data-force~="${s}"]`)), `a rule previews ${s}`);
  }
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
  const bar = rulesFor('.ui-overlay-bar').find(([sel]) => sel === '.ui-overlay-bar');
  assert.ok(bar, '.ui-overlay-bar is styled');
  assert.match(bar[1], /background\s*:\s*var\(--color-surface-raised\)/, 'the bar carries its own surface');
});

test('the overlay surface is opaque in both themes, so the scene behind it never shows through', () => {
  const sheet = read('css/tokens.css').replace(/\/\*[\s\S]*?\*\//g, '');
  const light = sheet.match(/:root\s*\{([\s\S]*?)\}/)[1];
  const dark = sheet.match(/:root\[data-theme="dark"\]\s*\{([\s\S]*?)\}/)[1];
  for (const [theme, block] of [['light', light], ['dark', dark]]) {
    const value = block.match(/--color-surface-raised\s*:\s*([^;]+);/)[1].trim();
    assert.match(value, /^#[0-9a-f]{6}$|^rgb\(/i, `${theme}: --color-surface-raised is opaque (${value})`);
  }
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
  const panel = style.match(/\.c2d-panel\s*\{([^}]*)\}/);
  assert.ok(panel, '.c2d-panel is styled');
  assert.match(panel[1], /border\s*:\s*1px solid var\(--color-border\)/, 'its frame');
  assert.match(panel[1], /background\s*:\s*var\(--color-surface-raised\)/, 'the overlay\'s surface, opaque in both themes');
  assert.doesNotMatch(panel[1], /#[0-9a-f]{3,8}\b|rgba?\(/i, 'tokens only');
  assert.match(style, /#hud\.hud--2d \.hud-bar \{ padding: 0; border-width: 0; background: none; box-shadow: none; \}/, 'the bar sits on the panel with no surface of its own');
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
  for (const s of ['hover', 'active', 'focus']) assert.ok(forced.has(s), `pause shown ${s}`);
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
  for (const screen of ['Main menu', 'Pause card', 'Results screen']) assert.ok(head.includes(screen), `catalogue documents the ${screen} composition`);
});

test('the main menu and the pause card are built only from kit classes', () => {
  // Allowed besides ui-*: the shell's visibility utility and the shared controls list of the help panel.
  const allowed = new Set(['hidden', 'controls', 'compact']);
  for (const [name, html] of Object.entries(SCREENS)) {
    assert.ok(html.length > 200, `${name} found in index.html`);
    const [root, ...inner] = tags(html);
    assert.deepEqual(classesOf(root).filter((c) => c !== 'hidden'), ['overlay'], `#${name} is a shell overlay layer`);
    const card = inner.find((t) => classesOf(t).includes('ui-card'));
    assert.ok(card, `#${name} holds a ui-card`);
    assert.ok(card.attrs['aria-labelledby'], `#${name} card is named by its title`);
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
  assert.match(line('menu'), /^'\[data-entry\]\[data-last\]'/, 'the menu focuses the last mode played by default');
  assert.match(line('board-choice'), /^'[^']*data-preset/, 'the 3D board choice focuses the last played board by default');
});

test('the gallery holds the results screen composition with placeholder content', () => {
  assert.ok(RESULTS.length > 200, 'dev/components.html marks the results composition');
  const all = tags(RESULTS);
  const card = all.find((t) => classesOf(t).includes('ui-card') && classesOf(t).includes('ui-screen'));
  assert.ok(card && card.attrs['aria-labelledby'], 'a named ui-card screen');
  assert.ok(all.some((t) => classesOf(t).includes('ui-card__title') && t.attrs.id === card.attrs['aria-labelledby']), 'its title names it');
  const row = all.find((t) => classesOf(t).includes('ui-stat-row'));
  assert.ok(row, 'stat readouts sit in a ui-stat-row');
  assert.ok(all.filter((t) => classesOf(t).includes('ui-stat')).length >= 4, 'at least four stat readouts');
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

// ---------------------------------------------------------------- "Esc: Back" beside every Back

// Each button Esc triggers, with the hint beside it; the pause card's Main menu has none (Esc resumes there).
const ESC_BACKS = ['c2d-choice-back', 'board-choice-back', 'coming-soon-back', 'ready-back', 'settings-back', 'records-back', 'daily-back',
  'rp-back', 'replay-message-back', 'r-menu', 'ctx-lost-menu'];
const HINT = '<span class="ui-text ui-text--muted" data-esc-hint>Esc: Back</span>';

test('an "Esc: Back" hint sits beside each Back that Esc triggers, and is no focus stop', () => {
  const html = read('index.html');
  for (const id of ESC_BACKS) {
    const at = html.indexOf(`id="${id}"`);
    assert.ok(at > 0, `#${id} exists`);
    const after = html.slice(html.indexOf('</button>', at) + '</button>'.length).trimStart();
    assert.ok(after.startsWith(HINT), `#${id} is followed by the hint`);
  }
  assert.equal(html.split(HINT).length - 1, ESC_BACKS.length, 'one hint per Back, and no other');
  const pmenu = html.slice(html.indexOf('</button>', html.indexOf('id="p-menu"')) + 9).trimStart();
  assert.ok(!pmenu.startsWith(HINT), 'none beside the pause card\'s Main menu, where Esc resumes');
  assert.doesNotMatch(HINT, /tabindex|<button|<a /, 'the hint is plain text');
});

test('one vocabulary: Back returns one step, Main menu goes to the menu, and no Back to menu label remains', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /Back to menu/);
  for (const id of ['r-menu', 'ctx-lost-menu', 'c2d-offer-menu', 'm3d-offer-menu', 'p-menu']) {
    assert.match(html, new RegExp(`id="${id}"[^>]*>Main menu</button>`), `#${id} reads Main menu`);
  }
  for (const f of ['js/ui.js', 'js/main.js', 'js/settings/bindings.js', 'js/settings/page.js', 'js/shell/pause.js', 'js/results/view.js', 'dev/components.html']) {
    assert.doesNotMatch(read(f), /Back to menu/, `${f} says Main menu`);
  }
});

test('Restart discards an unfinished game; Play again starts the same choice once it ended; the help names only the restart keys', () => {
  const ui = read('js/ui.js');
  assert.match(ui, /this\.el\.restart\.textContent = ended \? 'Play again' : 'Restart';/, 'the pause card swaps them on the moment');
  assert.match(read('js/shell/pause.js'), /message: 'Restart this game\? It will count as a loss\.', confirmLabel: 'Restart'/);
  assert.match(read('js/shell/pause.js'), /'Leave this game for the main menu\? It will count as a loss\.'/);
  assert.match(read('index.html'), /id="r-again"[^>]*>Play again</);
  const lines = read('js/settings/bindings.js').split('\n').filter((l) => /Restart|Play again|New game/.test(l));
  assert.ok(lines.length > 0 && lines.every((l) => /^\s*\['(\[F2\]|\{start\} \+ \{y\})', 'Restart: a new board of the same choice'\],$/.test(l)),
    'only the F2 and Start + Y rows name a restart; no help line names Play again or a new game');
});

test('in a browser, the "Esc: Back" hints meet the contrast contract in both themes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html?still-backdrop`);
    await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
    const hints = async (label) => {
      for (const theme of ['light', 'dark']) {
        await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        const runs = (await page.evaluate(measureContrast)).runs.filter((r) => r.text === 'Esc: Back');
        assert.equal(runs.length, 1, `${label} ${theme}: one hint shows`);
        assert.ok(runs[0].ratio >= runs[0].min, `${label} ${theme}: ${runs[0].ratio.toFixed(2)}:1 meets ${runs[0].min}:1`);
      }
      const stop = await page.evaluate(() => [...document.querySelectorAll('[data-esc-hint]')].some((e) => e.tabIndex >= 0));
      assert.equal(stop, false, 'no hint is a focus stop');
    };
    await page.click('#menu-entry-classic-2d');
    await hints('2D board choice');
    await page.keyboard.press('Escape');
    await page.click('#menu-entry-3d');
    await hints('3D board choice');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'ready');
    await hints('ready card');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu');
    await page.click('#menu-entry-settings');
    await hints('Settings');
    await page.keyboard.press('Escape');
    await page.click('#menu-entry-records');
    await hints('Records');
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

test('the stat tile, the pager and the column composition are styled from tokens only', () => {
  const tile = rulesFor('.ui-stat--tile').map(([, b]) => b).join('');
  assert.match(tile, /padding:\s*var\(--space-/);
  assert.match(tile, /border[^;]*var\(--color-/);
  const figure = rulesFor('.ui-stat--tile .ui-stat__value').map(([, b]) => b).join('');
  assert.match(figure, /font-size:[^;]*var\(--font-size-[^;]*var\(--font-size-/, 'the figure scales between two token sizes');
  assert.match(figure, /white-space:\s*nowrap/, 'the figure keeps one line');
  assert.match(tile, /min-width:\s*max-content/, 'a tile never narrows past its figure');
  for (const m of (tile + figure + rulesFor('.ui-stat-row--tiles').map(([, b]) => b).join('')).matchAll(/(padding|gap|font-size|min-width)\s*:\s*([^;]+)/g)) {
    assert.doesNotMatch(m[2], /\d+(px|rem|em)\b/, `${m[1]}: ${m[2]} — tile sizes come from the tokens`);
  }
  const current = rulesFor('.ui-pager').filter(([sel]) => sel.includes('aria-current="page"'));
  assert.ok(current.length > 0, 'the current page has its own styling');
  assert.ok(rulesFor('.ui-columns').some(([, b]) => /gap:\s*var\(--space-/.test(b)), 'column spacing from the tokens');
});

test('the column composition has one breakpoint, 1024 px, stated once, used by Records and Settings', () => {
  const breakpoints = [...CSS.matchAll(/@media[^{]*min-width:\s*(\d+)px/g)].map((m) => m[1]);
  assert.deepEqual(breakpoints, ['1024'], 'one breakpoint block in the kit');
  assert.doesNotMatch(read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, ''), /min-width:\s*1024px/, 'no second copy in the shell stylesheet');
  const head = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
  assert.match(head, /ui-columns[\s\S]*1024 px/, 'the catalogue states the breakpoint');
  assert.match(INDEX, /<section class="ui-card ui-screen ui-screen--wide ui-screen--columns" aria-labelledby="records-title">/);
  assert.match(INDEX, /<section class="ui-card ui-screen ui-screen--wide ui-screen--columns" aria-labelledby="settings-title">/);
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

// The element screenshots are artefacts for a person to look at: taken only with MS_SHOTS=1 set. Without
// them, a theme's look is compared through the element's computed colours.
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

test('coarse pointers get 44 px switch and slider targets, 12 px labels and 11 px key caps, inside (pointer: coarse) only', () => {
  const coarse = rules(coarseBlocks(CSS));
  const has = (needle, prop) => coarse.some(([sel, body]) => sel.includes(needle) && body.includes(prop));
  assert.ok(has('.ui-toggle__input', '44px'), 'a 44 px switch hit area');
  assert.ok(has('.ui-slider__input', '44px'), 'a 44 px slider');
  assert.ok(has('::-webkit-slider-thumb', '44px') || has('.ui-slider__input', 'height: 44px'), 'a 44 px slider thumb hit area');
  assert.ok(has('.ui-stat__label', '12px'), 'labels at 12 px');
  const styleCoarse = rules(coarseBlocks(STYLE));
  assert.ok(styleCoarse.some(([sel, body]) => /\bkbd\b/.test(sel) && body.includes('11px')), 'key caps at 11 px');
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

test('on a fine pointer every size the coarse rules touch is as it was', () => {
  const top = rules(topLevel(CSS));
  const body = (sel) => top.filter(([s]) => s === sel).map(([, b]) => b).join(';');
  assert.match(body('.ui-toggle__input'), /width: 44px;[\s\S]*height: 24px;/);
  assert.match(body('.ui-slider__input'), /height: 28px;/);
  assert.match(body('.ui-slider__input::-webkit-slider-thumb'), /width: 20px;[\s\S]*height: 20px;/);
  assert.match(body('.ui-stat__label'), /font-size: var\(--font-size-xs\);/);
  assert.match(read('css/tokens.css'), /--font-size-xs: 11px;/, 'the token itself is unchanged');
  assert.match(rules(topLevel(STYLE)).filter(([s]) => s === 'kbd').map(([, b]) => b).join(';'), /font: 600 0\.78em\/1\.5/);
  assert.doesNotMatch(topLevel(STYLE), /#hud-tap[^{]*\{[^}]*display:\s*(inline-)?(flex|block)/, 'the switch shows only under the coarse rule');
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
  assert.match(body('#touch-modes .ui-button[aria-pressed="true"]'), /var\(--color-accent\)/, 'the pressed state is visible');
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

const SHOTS = process.env.MS_SHOTS === '1';
const looks = (page, selector) => page.evaluate((sel) => {
  const s = getComputedStyle(document.querySelector(sel));
  return `${s.color} ${s.backgroundColor} ${s.borderTopColor}`;
}, selector);

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
  const rootStyle = getComputedStyle(document.documentElement);
  const tokenRgb = (name) => {
    const probe = document.createElement('i');
    probe.style.color = rootStyle.getPropertyValue(name);
    document.body.appendChild(probe);
    const c = parse(getComputedStyle(probe).color);
    probe.remove();
    return c;
  };
  const accent = tokenRgb('--color-accent');
  const ink = tokenRgb('--color-accent-ink');
  const same = (a, b) => a && b && a.slice(0, 3).every((v, i) => Math.abs(v - b[i]) < 1);
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
    const accentLabel = same(fg, ink) && same(bg, accent);
    out.push({ text: n.textContent.trim().slice(0, 30), ratio: ratio(fg, bg), min: large || accentLabel ? 3 : 4.5 });
  }
  const focus = [...document.querySelectorAll('[data-force~="focus"]')].map((el) => {
    const s = getComputedStyle(el);
    return { cls: el.className, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
  return { runs: out, focus };
}

test('in a browser, the gallery renders in both themes and its text meets the contrast contract', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-components-')) : null;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html`);
    const images = {};
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      if (SHOTS) {
        images[theme] = await page.screenshot({ path: join(shots, `components-${theme}.png`), fullPage: true });
        assert.ok(images[theme].length > 1000, `${theme} screenshot taken`);
      } else images[theme] = await looks(page, 'body');
      const { runs, focus } = await page.evaluate(measureContrast);
      assert.ok(runs.length > 40, `${theme}: the gallery shows its text (${runs.length} runs)`);
      const failing = runs.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
      assert.deepEqual(failing, [], `${theme}: text below the contrast contract`);
      assert.ok(focus.length >= 6, 'every interactive component is shown focused');
      for (const f of focus) assert.ok(f.style !== 'none' && f.width >= 2, `${theme}: ${f.cls} shows a focus ring`);
    }
    assert.notDeepEqual(images.light, images.dark, 'the themes render differently');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the overlay bar over the 3D scene meets the contrast contract in both themes', async (t) => {
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
    const images = {};
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const bar = page.locator('#hud .ui-overlay-bar');
      if (SHOTS) {
        images[theme] = await bar.screenshot({ path: join(shots, `overlay-${theme}.png`) });
        assert.ok(images[theme].length > 1000, `${theme} overlay screenshot taken`);
        await page.screenshot({ path: join(shots, `overlay-scene-${theme}.png`) });
      } else images[theme] = await looks(page, '#hud .ui-overlay-bar');
      const background = await page.evaluate(() => getComputedStyle(document.querySelector('#hud .ui-overlay-bar')).backgroundColor);
      assert.match(background, /^rgb\(/, `${theme}: the overlay surface is opaque (${background})`);
      const { runs: text } = await page.evaluate(measureContrast);
      const own = await page.evaluate(() => [...document.querySelectorAll('#hud .ui-overlay-bar *')]
        .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
        .map((e) => e.textContent.trim().slice(0, 30)));
      const barRuns = text.filter((r) => own.includes(r.text));
      assert.ok(barRuns.length >= 4, `${theme}: the overlay shows its labels and values (${barRuns.length})`);
      const failing = barRuns.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
      assert.deepEqual(failing, [], `${theme}: overlay text below the contrast contract`);
    }
    assert.notDeepEqual(images.light, images.dark, 'the overlay follows the theme');
    // The pause button pauses the game.
    await page.click('#hud-pause');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

// The debug hook's surface, pinned so the screen rebuild leaves it unchanged.
const MS_HOOK = ['state', 'game', 'renderer', 'camera', 'fps', 'frameStats', 'spawnPose', 'THREE', 'start', 'learn', 'learnBoard', 'learnPrompts', 'forcePlay',
  'controls', 'pads', 'pause', 'cellCenter', 'moveTo', 'look', 'aimAt', 'mouseDown', 'mouseUp', 'click', 'key', 'wheel',
  'selected', 'pickBrute', 'pickWith', 'info', 'modes', 'pauser', 'settings', 'records', 'replayViewer', 'replays', 'board2D', 'game2D', 'watch', 'daily'];

test('in a browser, the menu, the pause card and the results layout meet the contrast contract in both themes', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  const shots = SHOTS ? mkdtempSync(join(tmpdir(), 'ms3d-screens-')) : null;
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Contrast of the text inside one element, and the focus ring a keyboard focus draws there.
  const check = async (page, selector, label, theme, minRuns = 5) => {
    await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
    await frames(page);
    let shot;
    if (SHOTS) {
      shot = await page.locator(selector).screenshot({ path: join(shots, `${label}-${theme}.png`) });
      assert.ok(shot.length > 1000, `${label} ${theme}: screenshot taken`);
    } else shot = await looks(page, selector);
    const { runs } = await page.evaluate(measureContrast);
    const own = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => e.textContent.trim().slice(0, 30)), selector);
    const mine = runs.filter((r) => own.includes(r.text));
    assert.ok(mine.length >= minRuns, `${label} ${theme}: its text is measured (${mine.length})`);
    const failing = mine.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`);
    assert.deepEqual(failing, [], `${label} ${theme}: text below the contrast contract`);
    return shot;
  };
  const ring = (page) => page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { id: document.activeElement.id, style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
  });
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

    const menu = {};
    for (const theme of ['light', 'dark']) menu[theme] = await check(page, '#menu .ui-card', 'menu', theme);
    assert.notDeepEqual(menu.light, menu.dark, 'the menu follows the theme');
    // Keyboard focus shows the kit ring on every control of the menu, in tab order.
    const menuControls = await page.evaluate(() => [...document.querySelectorAll('#menu button, #menu input, #menu a[href]')]
      .filter((e) => e.getBoundingClientRect().width > 0).length);
    // The menu opens with its default target focused: start the Tab walk from the menu layer's top instead.
    await page.mouse.click(2, 2);
    for (let i = 0; i < menuControls; i++) {
      await page.keyboard.press('Tab');
      const f = await ring(page);
      assert.ok(f.style !== 'none' && f.width >= 2, `menu control #${f.id || i} shows a focus ring (${f.style} ${f.width})`);
    }

    // The main menu's Controls panel: the kit's surface on a themed backdrop, readable in both themes.
    await page.click('#menu-help');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), false);
    const controls = {};
    for (const theme of ['light', 'dark']) controls[theme] = await check(page, '#controls-modal .modal-card', 'controls', theme);
    assert.notDeepEqual(controls.light, controls.dark, 'the Controls panel follows the theme');
    await page.click('#controls-close');
    assert.equal(await page.evaluate(() => document.getElementById('controls-modal').classList.contains('hidden')), true);

    // The menu's demo board: the shell hands the renderer each theme's sky, with no reload.
    const sky = {};
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      sky[theme] = await page.evaluate(() => globalThis.__ms.renderer.scenePalette);
    }
    assert.deepEqual(sky.light.horizon, [200, 225, 255], 'the light sky is the original sky');
    assert.notDeepEqual(sky.light, sky.dark, 'the sky follows the theme');

    // menu → 3D board choice → ready → playing → pause, as before.
    await page.click('#menu-entry-3d');
    await page.click('#board-choice [data-preset="6,6,6,10"]');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'ready');
    await page.evaluate(() => globalThis.__ms.forcePlay());
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'playing');
    await page.click('#hud-pause');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'paused');
    assert.equal(await page.evaluate(() => document.activeElement.id), 'p-resume', 'Resume takes the focus');
    assert.ok(await page.evaluate(() => document.getElementById('p-resume').classList.contains('ui-button--primary')), 'Resume is the primary action');
    const pause = {};
    for (const theme of ['light', 'dark']) pause[theme] = await check(page, '#pause .ui-card', 'pause', theme);
    assert.notDeepEqual(pause.light, pause.dark, 'the pause card follows the theme');
    await page.keyboard.press('Tab');
    const f = await ring(page);
    assert.ok(f.style !== 'none' && f.width >= 2, `pause control #${f.id} shows a focus ring`);
    await page.click('#p-menu');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Main menu returns to the menu');

    // The board status card: the generating card with its progress line, spinner, Cancel and Play a
    // standard board, then the failure offer with its three buttons, readable in both themes. Only a
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
    assert.ok(fs.style !== 'none' && fs.width >= 2, 'Play a standard board shows a focus ring');
    for (const theme of ['light', 'dark']) await check(page, '#m3d-status', 'generating', theme, 4);
    worker = 'fail';
    await page.click('#m3d-cancel');
    assert.equal(await page.evaluate(() => document.getElementById('m3d-status').classList.contains('hidden')), true, 'Cancel closes the card');
    await firstClick();
    await page.waitForFunction(() => !document.getElementById('m3d-offer').classList.contains('hidden'));
    assert.deepEqual(await page.evaluate(() => [...document.querySelectorAll('#m3d-offer button')].map((b) => b.textContent)),
      ['Retry', 'Play a standard board', 'Main menu']);
    for (const theme of ['light', 'dark']) await check(page, '#m3d-status', 'offer', theme);
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
    assert.equal(await page.evaluate(() => document.getElementById('p-restart').textContent), 'Play again');
    // Back on an ended game's card goes to the main menu, asking nothing.
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'menu', 'Back leaves an ended game for the menu');

    const results = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    results.on('pageerror', (e) => errors.push(e.message));
    await results.goto(`${base}/dev/components.html`);
    const layout = {};
    for (const theme of ['light', 'dark']) layout[theme] = await check(results, '#g-results', 'results', theme);
    assert.notDeepEqual(layout.light, layout.dark, 'the results layout follows the theme');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
