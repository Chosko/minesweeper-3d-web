import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import {
  decimalsOf, formatSliderValue, segmentedTargetIndex, segmentedState,
  bindSlider, bindSegmented, initComponents,
} from '../js/ui/components.js';

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
};
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
  assert.match(text, /padDefault/, 'catalogue states how a screen declares its default focus target');
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
    assert.match(own, /:disabled/, `${name} disabled`);
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
    assert.ok(found.some((t) => 'disabled' in t.attrs), `${name} shown disabled`);
    assert.ok(found.some((t) => !('disabled' in t.attrs) && !t.attrs['data-force']), `${name} shown at rest`);
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

// The shell's controller navigation collects these elements (padFocusables).
const PAD_SELECTOR = read('js/main.js').match(/padFocusables[\s\S]*?querySelectorAll\('([^']+)'\)/)[1];
const PAD_TAGS = PAD_SELECTOR.split(',').map((s) => s.trim());

function accessibleName(t) {
  if (t.attrs['aria-label']) return t.attrs['aria-label'];
  if (t.attrs['aria-labelledby']) {
    const ids = t.attrs['aria-labelledby'].split(/\s+/);
    for (const id of ids) assert.ok(TAGS.some((x) => x.attrs.id === id), `aria-labelledby target #${id} exists`);
    return ids.join(' ');
  }
  if (t.attrs.id && TAGS.some((x) => x.tag === 'label' && x.attrs.for === t.attrs.id)) return 'label[for]';
  if (t.tag === 'button') {
    const close = GALLERY.indexOf('</button>', t.end);
    const text = GALLERY.slice(t.end, close).replace(/<[^>]+>/g, '').trim();
    if (text) return text;
  }
  // a wrapping <label>
  const before = GALLERY.slice(0, t.index);
  if (before.lastIndexOf('<label') > before.lastIndexOf('</label>')) return 'wrapping label';
  return '';
}

test('every interactive control is reachable by the controller layer and has an accessible name', () => {
  for (const [name, c] of Object.entries(COMPONENTS)) {
    if (!c.interactive) continue;
    for (const t of TAGS.filter((x) => hasClasses(x, c.control))) {
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
