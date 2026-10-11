import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import {
  decimalsOf, formatSliderValue, segmentedTargetIndex, segmentedState,
  bindSlider, bindSegmented, initComponents, formatOverlayTime, formatMineCount,
} from '../js/ui/components.js';
import { UI } from '../js/ui.js';
import { FOCUSABLE } from '../js/shell/navigation.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
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
};
// Screen compositions: layout-only classes the screens are assembled with.
const COMPOSITIONS = ['ui-screen', 'ui-row', 'ui-grid', 'ui-heading', 'ui-text', 'ui-actions', 'ui-stat-row'];
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

test('low fidelity: no animation, and shadows and transitions come only from tokens', () => {
  assert.doesNotMatch(CSS, /@keyframes|animation\s*:/, 'no keyframed motion');
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

test('formatMineCount shows mines left clamped to -99 … 999', () => {
  assert.equal(formatMineCount(0), '0');
  assert.equal(formatMineCount(10), '10');
  assert.equal(formatMineCount(-12), '-12');
  assert.equal(formatMineCount(-99), '-99');
  assert.equal(formatMineCount(-100), '-99', 'below -99');
  assert.equal(formatMineCount(-5000), '-99');
  assert.equal(formatMineCount(999), '999');
  assert.equal(formatMineCount(1000), '999', 'above 999');
  assert.equal(formatMineCount(250000), '999');
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

test('the 3D HUD renders through the overlay bar: timer, mine counter and a named pause button', () => {
  const bar = HUD_TAGS.find((t) => hasClasses(t, '.ui-overlay-bar'));
  assert.ok(bar, '#hud holds a .ui-overlay-bar');
  for (const id of ['hud-time', 'hud-mines']) {
    const value = HUD_TAGS.find((t) => t.attrs.id === id);
    assert.ok(value && hasClasses(value, '.ui-stat__value'), `#${id} is a stat value`);
    assert.ok(value.index > bar.index, `#${id} sits in the overlay bar`);
  }
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
  assert.equal(fake.el.mines.textContent, '999');
  assert.ok(!cls.has('negative'));
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

test('the helper module keeps DOM access out of its logic and imports nothing', () => {
  const src = read('js/ui/components.js');
  assert.doesNotMatch(src, /^\s*import\s/m);
  assert.doesNotMatch(src, /\b(document|window)\./, 'DOM is reached only through the elements passed in');
});

// ---------------------------------------------------------------- browser: screenshots and contrast

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

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
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch();
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-components-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/dev/components.html`);
    const images = {};
    for (const theme of ['light', 'dark']) {
      await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), theme);
      images[theme] = await page.screenshot({ path: join(shots, `components-${theme}.png`), fullPage: true });
      assert.ok(images[theme].length > 1000, `${theme} screenshot taken`);
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
    await new Promise((resolve) => server.close(resolve));
  }
});

test('in a browser, the overlay bar over the 3D scene meets the contrast contract in both themes', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-overlay-'));
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
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
      images[theme] = await bar.screenshot({ path: join(shots, `overlay-${theme}.png`) });
      await page.screenshot({ path: join(shots, `overlay-scene-${theme}.png`) });
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
    await new Promise((resolve) => server.close(resolve));
  }
});

// The debug hook's surface, pinned so the screen rebuild leaves it unchanged.
const MS_HOOK = ['state', 'game', 'renderer', 'camera', 'fps', 'frameStats', 'startCameraPos', 'THREE', 'start', 'forcePlay',
  'controls', 'pads', 'pause', 'cellCenter', 'moveTo', 'look', 'aimAt', 'mouseDown', 'mouseUp', 'click', 'key', 'wheel',
  'selected', 'pickBrute', 'pickWith', 'info', 'modes', 'pauser', 'settings', 'records', 'replayViewer', 'watch'];

test('in a browser, the menu, the pause card and the results layout meet the contrast contract in both themes', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  const shots = mkdtempSync(join(tmpdir(), 'ms3d-screens-'));
  const base = `http://127.0.0.1:${server.address().port}`;
  const frames = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  // Contrast of the text inside one element, and the focus ring a keyboard focus draws there.
  const check = async (page, selector, label, theme) => {
    await page.evaluate((th) => globalThis.msTheme.setTheme(th), theme);
    await frames(page);
    const shot = await page.locator(selector).screenshot({ path: join(shots, `${label}-${theme}.png`) });
    assert.ok(shot.length > 1000, `${label} ${theme}: screenshot taken`);
    const { runs } = await page.evaluate(measureContrast);
    const own = await page.evaluate((sel) => [...document.querySelectorAll(`${sel} *`)]
      .filter((e) => [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
      .map((e) => e.textContent.trim().slice(0, 30)), selector);
    const mine = runs.filter((r) => own.includes(r.text));
    assert.ok(mine.length >= 5, `${label} ${theme}: its text is measured (${mine.length})`);
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
    await page.goto(`${base}/index.html`);
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

    // An ended game: the pause card leads with Play again.
    await page.evaluate(() => {
      globalThis.__ms.start(3, 3, 1, 1, [0]);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(0);
      globalThis.__ms.click('left');
      globalThis.__ms.pause();
    });
    assert.equal(await page.evaluate(() => globalThis.__ms.game.state), 'lost');
    const order = await page.evaluate(() => [...document.querySelectorAll('#pause .ui-actions button')].map((b) => [b.id, b.className]));
    assert.equal(order[0][0], 'p-restart', 'Play again comes first once the game ended');
    assert.match(order[0][1], /ui-button--primary/);
    assert.match(order.find(([id]) => id === 'p-resume')[1], /ui-button--secondary/);

    const results = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    results.on('pageerror', (e) => errors.push(e.message));
    await results.goto(`${base}/dev/components.html`);
    const layout = {};
    for (const theme of ['light', 'dark']) layout[theme] = await check(results, '#g-results', 'results', theme);
    assert.notDeepEqual(layout.light, layout.dark, 'the results layout follows the theme');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
