// Theme conformance: "a theme is done" as a mechanical fact. Every theme the registry lists runs every
// check below; a theme that fails one fails the suite. The deliberately broken fixture themes
// (tests/fixtures/themes/broken-themes.js) prove each check bites; the board module's checks
// (js/themes/board-module.js) are proved against broken board modules in tests/board-module.test.mjs. The development gallery
// (dev/components.html) renders every catalogued component in every state under any registered theme.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEMES, DEFAULT_THEME_ID } from '../js/themes/registry.js';
import { KIT_CATALOGUE, REQUIRED_TOKENS, CONTRAST_ROLES } from '../js/ui/kit-catalogue.js';
import { BROKEN_THEMES } from './fixtures/themes/broken-themes.js';
import { checkBoardModule } from '../js/themes/board-module.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const exists = (p) => existsSync(join(ROOT, p));
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const scopeOf = (id) => `:root[data-theme="${id}"]`;

// ---------- a small CSS reader: rules, @font-face, @keyframes, grouping and other at-rules ----------

// Splits `text` on `sep` outside quotes, parentheses and brackets.
function splitTop(text, sep) {
  const out = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === sep && depth === 0) {
      out.push(text.slice(start, i));
      start = i + 1;
    }
  }
  out.push(text.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();

function parseDecls(body) {
  return splitTop(body, ';').map((d) => {
    const i = d.indexOf(':');
    if (i < 0) return null;
    let value = d.slice(i + 1).trim();
    const important = /!\s*important\s*$/i.test(value);
    if (important) value = value.replace(/!\s*important\s*$/i, '').trim();
    return { prop: d.slice(0, i).trim().toLowerCase(), value, important };
  }).filter(Boolean);
}

// The index of the brace closing the block opened at `open`.
function blockEnd(css, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  throw new Error('unbalanced braces');
}

const GROUPS = new Set(['media', 'container', 'supports', 'layer']);

function parseCss(css, sheet = { rules: [], fontFaces: [], keyframes: [], groups: [], atRules: [] }) {
  let i = 0;
  while (i < css.length) {
    let j = i;
    let quote = null;
    let paren = 0;
    for (; j < css.length; j++) {
      const c = css[j];
      if (quote) {
        if (c === '\\') j++;
        else if (c === quote) quote = null;
      } else if (c === '"' || c === "'") quote = c;
      else if (c === '(') paren++;
      else if (c === ')') paren--;
      else if (paren === 0 && (c === '{' || c === ';')) break;
    }
    const prelude = norm(css.slice(i, j));
    if (j >= css.length) break;
    if (css[j] === ';') {
      if (prelude) sheet.atRules.push(prelude);
      i = j + 1;
      continue;
    }
    const end = blockEnd(css, j);
    const body = css.slice(j + 1, end);
    i = end + 1;
    if (prelude.startsWith('@')) {
      const name = prelude.slice(1).split(/[\s(]/)[0].toLowerCase();
      if (GROUPS.has(name)) {
        sheet.groups.push(prelude);
        parseCss(body, sheet);
      } else if (name === 'font-face') sheet.fontFaces.push(parseDecls(body));
      else if (name.endsWith('keyframes')) sheet.keyframes.push(prelude.split(' ')[1]);
      else sheet.atRules.push(prelude);
    } else {
      sheet.rules.push({ selectors: splitTop(prelude, ',').map(norm), decls: parseDecls(body) });
    }
  }
  return sheet;
}

function loadTheme(entry) {
  const text = exists(entry.stylesheet) ? read(entry.stylesheet) : '';
  const sheet = parseCss(stripComments(text));
  const scope = scopeOf(entry.id);
  // Each scoped rule's selectors with the scope taken off: what the rule draws inside the theme.
  const scoped = sheet.rules.map((r) => ({
    ...r,
    inner: r.selectors.filter((s) => s.startsWith(scope)).map((s) => s.slice(scope.length).trim()),
  }));
  return { entry, scope, sheet, scoped };
}

// ---------- the checks: each returns its problems, { check, subject } ----------

const problem = (check, subject) => ({ check, subject });

function themeFiles(entry) {
  return [entry.stylesheet, entry.boardModule, ...entry.fonts.flatMap((f) => [f.licence, ...f.files.map((x) => x.path)])];
}

function checkFiles({ entry }) {
  return themeFiles(entry).filter((p) => !exists(p)).map((p) => problem('files', p));
}

// Every @font-face source is one of the theme's own font files.
function checkFonts({ entry, sheet }) {
  const own = new Set(entry.fonts.flatMap((f) => f.files.map((x) => x.path)));
  const dir = posix.dirname(entry.stylesheet);
  const out = [];
  for (const decls of sheet.fontFaces) {
    for (const d of decls.filter((x) => x.prop === 'src')) {
      for (const [, , url] of d.value.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)) {
        if (!own.has(posix.normalize(posix.join(dir, url)))) out.push(problem('font', url));
      }
      for (const [local] of d.value.matchAll(/local\([^)]*\)/g)) out.push(problem('font', local));
    }
  }
  return out;
}

// No text file of the theme holds a remote URL; comments are not fetched, so they are left out.
const TEXT = /\.(css|js|mjs|txt|json|svg|html|md)$/i;
const SCRIPT = /\.m?js$/i;
const uncommented = (p, text) => {
  const t = /\.(css|m?js)$/i.test(p) ? stripComments(text) : text;
  return SCRIPT.test(p) ? t.replace(/(^|[^:'"`\w\\])\/\/.*$/gm, '$1') : t;
};
function checkRemote({ entry }) {
  return themeFiles(entry).filter((p) => TEXT.test(p) && exists(p) && /https?:|\/\//i.test(uncommented(p, read(p)))).map((p) => problem('remote', p));
}

// Every rule is scoped to the theme's id; keyframes are named after it; no other at-rule.
function checkScope({ entry, scope, sheet }) {
  const out = [];
  for (const r of sheet.rules) for (const s of r.selectors) if (!s.startsWith(scope)) out.push(problem('scope', s));
  for (const k of sheet.keyframes) if (!k.startsWith(`${entry.id}-`)) out.push(problem('scope', `@keyframes ${k}`));
  for (const a of sheet.atRules) out.push(problem('scope', a));
  return out;
}

// Nothing overrides the base stylesheet's prefers-reduced-motion rule.
function checkMotion({ sheet }) {
  const out = sheet.groups.filter((g) => /prefers-reduced-motion/i.test(g)).map((g) => problem('motion', g));
  for (const r of sheet.rules) {
    for (const d of r.decls) {
      if (d.important && /^(animation|transition)/.test(d.prop)) out.push(problem('motion', `${r.selectors.join(', ')} { ${d.prop} }`));
    }
  }
  return out;
}

function declaredTokens({ scope, sheet }) {
  const tokens = new Map();
  for (const r of sheet.rules) {
    if (!r.selectors.includes(scope)) continue;
    for (const d of r.decls) if (d.prop.startsWith('--')) tokens.set(d.prop, d.value);
  }
  return tokens;
}

function checkTokens(theme) {
  const declared = declaredTokens(theme);
  return REQUIRED_TOKENS.filter((t) => !declared.has(t)).map((t) => problem('token', t));
}

// Whether `haystack` holds the selector `needle` whole: not as the start of a longer name.
function holds(haystack, needle) {
  for (let i = haystack.indexOf(needle); i >= 0; i = haystack.indexOf(needle, i + 1)) {
    const before = haystack[i - 1];
    const after = haystack[i + needle.length];
    if ((before === undefined || !/[\w-]/.test(before)) && (after === undefined || !/[\w-]/.test(after))) return true;
  }
  return false;
}

// The last compound of a selector: `.ui-stat__label` of `.ui-stat--tile .ui-stat__label`.
const lastCompound = (sel) => sel.split(/\s*[\s>+~]\s*/).filter(Boolean).at(-1);

const VISIBLE = /^(outline(-style|-width|-color)?|box-shadow|transform|translate|scale|background(-color|-image)?|border(-(top|right|bottom|left))?(-color|-style|-width)?|color|text-decoration(-line|-color|-thickness|-style)?|filter|opacity)$/;
const INVISIBLE = /^(none|0|0px|transparent|initial|unset|inherit)$/i;

// Every part and state of every catalogued component has a rule; every interactive part shows focus.
function checkParts({ scoped }) {
  const inner = scoped.flatMap((r) => r.inner);
  const styled = (sel) => inner.some((s) => holds(s, sel));
  const out = [];
  for (const c of KIT_CATALOGUE.filter((x) => x.kind === 'component')) {
    if (c.parts.length === 0 && !styled(c.selector)) out.push(problem('part', c.name));
    for (const v of c.variants) if (!styled(`.${v}`)) out.push(problem('part', `${c.name} ${v}`));
    for (const p of c.parts) {
      const drawn = styled(p.selector) || styled(lastCompound(p.selector)) || (p.as && styled(`.${p.as}`));
      if (!drawn) out.push(problem('part', `${c.name} ${p.name}`));
      if (!p.interactive) continue;
      for (const [state, list] of Object.entries(p.states)) {
        if (!splitTop(list, ',').every(styled)) out.push(problem('state', `${c.name} ${p.name} ${state}`));
      }
      const focus = splitTop(p.states.focused ?? p.states.selected, ',');
      const rules = scoped.filter((r) => r.inner.some((s) => focus.some((f) => holds(s, f))));
      const shows = rules.some((r) => r.decls.some((d) => VISIBLE.test(d.prop) && !INVISIBLE.test(d.value)));
      if (!shows) out.push(problem('focus', `${c.name} ${p.name}`));
    }
  }
  return out;
}

const SLOT_NAMES = new Set(KIT_CATALOGUE.flatMap((c) => c.slots.map((s) => s.name)));

// Every decoration slot the theme fills is a catalogued slot.
function checkSlots({ sheet }) {
  const out = [];
  for (const r of sheet.rules) {
    for (const s of r.selectors) {
      for (const [, name] of s.matchAll(/\[data-slot\s*[~|^$*]?=\s*["']?([\w-]+)/g)) if (!SLOT_NAMES.has(name)) out.push(problem('slot', name));
    }
  }
  return out;
}

// ---------- contrast, on the theme's declared tokens ----------

function parseColor(v) {
  let m = v.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (m) {
    const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join('') : m[1];
    const [r, g, b, a = 255] = h.match(/../g).map((x) => parseInt(x, 16));
    return [r, g, b, a / 255];
  }
  m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  return null;
}
const over = ([r, g, b, a], base) => [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];
function luminance([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

// Body text on each surface token at least 4.5:1; large text and essential glyphs at least 3:1.
function checkContrast(theme) {
  const tokens = declaredTokens(theme);
  const resolve = (name, seen = new Set()) => {
    const v = tokens.get(name);
    if (v === undefined || seen.has(name)) return null;
    const ref = v.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    return ref ? resolve(ref[1], seen.add(name)) : parseColor(v);
  };
  const out = [];
  const colour = (name) => {
    const c = resolve(name);
    if (!c) out.push(problem('contrast', `${name} is not a declared colour`));
    return c;
  };
  for (const surface of CONTRAST_ROLES.surfaces) {
    const bg = colour(surface);
    if (!bg) continue;
    const page = resolve('--color-ground');
    const ground = over(bg, page && page[3] === 1 ? page : [255, 255, 255]);
    for (const [list, min] of [[CONTRAST_ROLES.bodyText, 4.5], [CONTRAST_ROLES.largeText, 3]]) {
      for (const ink of list) {
        const fg = colour(ink);
        if (fg && contrast(over(fg, ground), ground) < min) out.push(problem('contrast', `${ink} on ${surface}`));
      }
    }
  }
  return [...new Map(out.map((p) => [p.subject, p])).values()];
}

// The go and stop buttons' ink on their rest and selected colours, as the theme's own rules for the
// two states draw them (the last rule naming the selector and the property wins), at least 4.5:1.
const FILL_STATES = Object.freeze({
  'ui-button--go': Object.freeze({ rest: '.ui-button--go', selected: '.ui-button--go:focus' }),
  'ui-button--stop': Object.freeze({ rest: '.ui-button--stop', selected: '.ui-button--stop:focus' }),
});
function checkFillContrast(theme) {
  const tokens = declaredTokens(theme);
  const resolve = (v, seen = new Set()) => {
    const ref = v?.match(/^var\(\s*(--[\w-]+)\s*\)$/);
    if (!ref) return v === undefined ? null : parseColor(v);
    return seen.has(ref[1]) ? null : resolve(tokens.get(ref[1]), seen.add(ref[1]));
  };
  const drawn = (sel, prop) => theme.scoped.filter((r) => r.inner.includes(sel)).flatMap((r) => r.decls.filter((d) => d.prop === prop)).at(-1)?.value;
  const out = [];
  for (const [name, states] of Object.entries(FILL_STATES)) {
    for (const [state, sel] of Object.entries(states)) {
      const bg = resolve(drawn(sel, 'background') ?? drawn(sel, 'background-color'));
      const fg = resolve(drawn(sel, 'color'));
      if (!bg || !fg) { out.push(problem('contrast', `${name} ${state} has no declared ink and fill`)); continue; }
      const ground = over(bg, [255, 255, 255]);
      if (contrast(over(fg, ground), ground) < 4.5) out.push(problem('contrast', `${name} ${state}`));
    }
  }
  return out;
}

const CHECKS = [
  ['every file the registry names exists', checkFiles],
  ['every @font-face source is one of the theme\'s own font files', checkFonts],
  ['no theme file holds a remote URL', checkRemote],
  ['every rule is scoped to the theme\'s id', checkScope],
  ['nothing overrides the base stylesheet\'s prefers-reduced-motion rule', checkMotion],
  ['every required token is declared', checkTokens],
  ['every part and state of every catalogued component has a rule, and every interactive part shows focus', checkParts],
  ['every decoration slot the theme fills is a catalogued slot', checkSlots],
  ['body text meets 4.5:1 and large text and glyphs 3:1 on every surface token', checkContrast],
  ['the go and stop buttons\' ink meets 4.5:1 on their rest and selected colours', checkFillContrast],
];

const conformance = (entry) => {
  const theme = loadTheme(entry);
  return CHECKS.flatMap(([, check]) => check(theme));
};

// ---------- every registered theme ----------

test('the registry lists at least one theme, the default among them', () => {
  assert.ok(THEMES.length > 0);
  assert.ok(THEMES.some((t) => t.id === DEFAULT_THEME_ID));
});

for (const entry of THEMES) {
  const theme = loadTheme(entry);
  for (const [name, check] of CHECKS) {
    test(`${entry.name}: ${name}`, () => {
      assert.deepEqual(check(theme), []);
    });
  }
  test(`${entry.name}: the board module passes the board conformance checks`, async () => {
    const { BOARD } = await import(pathToFileURL(join(ROOT, entry.boardModule)).href);
    assert.deepEqual(checkBoardModule(BOARD, { fonts: entry.fonts }), []);
  });
}

// ---------- the shared layout's components in the catalogue ----------

const byName = (name) => KIT_CATALOGUE.find((c) => c.name === name);
const partNames = (name) => byName(name).parts.map((p) => p.name);
const opt = (name, part) => byName(name).parts.find((p) => p.name === part);

test('the catalogue declares the shared layout\'s components, their parts, states and slots, so every theme is held to them', () => {
  for (const name of ['ui-backdrop', 'ui-frame', 'ui-play-tile', 'ui-small-entry', 'ui-option', 'ui-section-label', 'ui-key-hint', 'ui-chip', 'ui-list-row',
    'ui-scene-panel', 'ui-button--danger', 'ui-button--go', 'ui-button--stop', 'ui-drawer', 'ui-divider', 'ui-tabs', 'ui-checkbox', 'ui-table', 'ui-toast']) {
    assert.equal(byName(name)?.kind, 'component', `${name} is catalogued`);
  }
  for (const name of ['ui-mode-list', 'ui-options', 'ui-key-hints', 'ui-list']) assert.equal(byName(name)?.kind, 'composition', `${name} is catalogued`);
  assert.deepEqual(byName('ui-frame').slots.map((s) => [s.name, s.selector]), [['window-chrome', '.ui-frame__chrome[data-slot="window-chrome"]']]);
  for (const p of ['head', 'back', 'title', 'action', 'body', 'foot', 'status', 'summary']) assert.ok(partNames('ui-frame').includes(p), `the frame's ${p}`);
  for (const name of ['ui-button--primary', 'ui-button--secondary']) assert.deepEqual(byName(name).variants, ['ui-button--sm', 'ui-button--lg'], `${name} sizes`);
  assert.equal(opt('ui-play-tile', 'tile').states.disabled, '.ui-play-tile[aria-disabled="true"]', 'a disabled play tile stays selectable');
  for (const p of ['tile', 'icon', 'label', 'reason', 'preview', 'lock']) assert.ok(partNames('ui-play-tile').includes(p), `the play tile's ${p}`);
  for (const p of ['entry', 'icon', 'label']) assert.ok(partNames('ui-small-entry').includes(p), `the small entry's ${p}`);
  assert.deepEqual(byName('ui-play-tile').variants, ['ui-play-tile--row', 'ui-play-tile__preview--light', 'ui-play-tile__preview--locked'], 'the phone row and the preview\'s grounds');
  assert.ok(!partNames('ui-play-tile').includes('last') && !partNames('ui-small-entry').includes('last'), 'no main menu button carries a Last played chip');
  for (const p of ['option', 'name', 'chip', 'meta', 'size', 'density', 'check', 'badge']) assert.ok(partNames('ui-option').includes(p), `the board option's ${p}`);
  assert.ok(!partNames('ui-option').includes('last'), 'no board option carries a Last played chip');
  assert.deepEqual(partNames('ui-drawer'), ['bar', 'label', 'chevron', 'body'], 'the drawer\'s bar over its body');
  assert.deepEqual(Object.keys(opt('ui-drawer', 'bar').states), ['default', 'selected', 'pressed', 'disabled', 'chosen']);
  assert.equal(opt('ui-drawer', 'bar').states.chosen, '.ui-drawer__bar[aria-expanded="true"]', 'chosen while open');
  assert.ok(partNames('ui-stat--tile').includes('badge'), 'the stat tile\'s badge');
  assert.deepEqual(partNames('ui-toast'), ['icon', 'text'], 'the toast\'s icon and text');
  assert.ok(partNames('ui-card').includes('icon'), 'a message card\'s badge');
  for (const [name, part] of [['ui-frame', 'status'], ['ui-frame', 'summary'], ['ui-play-tile', 'reason'], ['ui-play-tile', 'lock'],
    ['ui-option', 'size'], ['ui-option', 'density'], ['ui-option', 'badge'], ['ui-stat--tile', 'badge'], ['ui-section-label', 'aside'], ['ui-card', 'icon']]) {
    assert.equal(opt(name, part).optional, true, `${name} ${part} is optional`);
  }
  // Main menu buttons and board options follow the button rule: one selected state, no hover or focus of their own.
  assert.deepEqual(Object.keys(opt('ui-play-tile', 'tile').states), ['default', 'selected', 'pressed', 'disabled']);
  assert.deepEqual(Object.keys(opt('ui-small-entry', 'entry').states), ['default', 'selected', 'pressed', 'disabled']);
  assert.deepEqual(Object.keys(opt('ui-option', 'option').states), ['default', 'selected', 'pressed', 'disabled', 'chosen']);
  assert.equal(opt('ui-option', 'option').states.chosen, '.ui-option[aria-pressed="true"]');
  assert.ok(!Object.hasOwn(opt('ui-play-tile', 'tile').states, 'locked'), 'no locked state for a play tile: a locked one is disabled');
  for (const [name, part] of [['ui-option', 'chip'], ['ui-stat--tile', 'badge'], ['ui-list-row', 'outcome']]) {
    assert.equal(opt(name, part).as, 'ui-chip', `${name}'s ${part} is a chip`);
  }
});

test('Joyful tiles\' main menu buttons are readable: the navy ink on every pastel and on the stronger neutral at least 4.5:1, each full colour\'s ink too, the locked label at least 3:1 as large text, at rest and selected', () => {
  const theme = loadTheme(THEMES.find((t) => t.id === 'joyful-tiles'));
  const tokens = declaredTokens(theme);
  const colour = (name) => {
    const c = parseColor(tokens.get(name) ?? '');
    assert.ok(c, `${name} is a declared colour`);
    return c;
  };
  const ratio = (ink, fill) => {
    const ground = over(colour(fill), [255, 255, 255]);
    return contrast(over(colour(ink), ground), ground);
  };
  const ACCENTS = [['classic-2d', 'blue', '--color-blue', '--color-blue-on'], ['hexagon', 'teal', '--color-teal', '--color-teal-on'],
    ['triangle', 'green', '--color-green', '--color-green-on'], ['surface', 'orange', '--color-orange', '--color-orange-on'],
    ['3d', 'accent', '--color-accent-fill', '--color-accent-on'], ['daily', 'violet', '--color-violet', '--color-violet-on']];
  const rule = (sel) => theme.scoped.filter((r) => r.inner.includes(sel)).flatMap((r) => r.decls);
  for (const [entry, soft, full, on] of ACCENTS) {
    const decls = Object.fromEntries(rule(`.ui-play-tile[data-entry="${entry}"]`).map((d) => [d.prop, d.value]));
    assert.deepEqual([decls['--fs'], decls['--f'], decls['--o']], [`var(--color-${soft}-soft)`, `var(${full})`, `var(${on})`], `${entry}: its pastel at rest, its full colour and ink selected`);
    assert.ok(ratio('--color-ink', `--color-${soft}-soft`) >= 4.5, `the ink on ${soft}'s pastel: ${ratio('--color-ink', `--color-${soft}-soft`).toFixed(2)}:1`);
    assert.ok(ratio(on, full) >= 4.5, `${on} on ${full}: ${ratio(on, full).toFixed(2)}:1`);
  }
  for (const fill of ['--color-neutral-strong', '--color-surface-raised']) assert.ok(ratio('--color-ink', fill) >= 4.5, `the ink on ${fill}: ${ratio('--color-ink', fill).toFixed(2)}:1`);
  for (const fill of ['--color-locked', '--color-locked-edge']) assert.ok(ratio('--color-locked-ink', fill) >= 3, `the locked label on ${fill}: ${ratio('--color-locked-ink', fill).toFixed(2)}:1`);
});

test('the slot check passes the frame\'s window chrome and flags any other name', () => {
  const sheet = (sel) => ({ sheet: parseCss(`${sel} { display: block; }`) });
  assert.deepEqual(checkSlots(sheet(':root[data-theme="x"] .ui-frame__chrome[data-slot="window-chrome"]')), []);
  assert.deepEqual(checkSlots(sheet(':root[data-theme="x"] [data-slot="title-bar"]')), [{ check: 'slot', subject: 'title-bar' }]);
});

test('the fill contrast check passes readable go and stop buttons and flags a faint ink', () => {
  const scope = ':root[data-theme="x"]';
  const themeOf = (goInk) => {
    const sheet = parseCss(`${scope} { --ink: #16204a; --pale: #8fdca4; --faint: #7fbf90; }
      ${scope} .ui-button--go, ${scope} .ui-button--stop { background: var(--pale); color: var(--ink); }
      ${scope} .ui-button--go:focus { background: #5fd07e; color: ${goInk}; }
      ${scope} .ui-button--stop:focus { background: #ff6b6b; color: #16204a; }`);
    return { scope, sheet, scoped: sheet.rules.map((r) => ({ ...r, inner: r.selectors.filter((s) => s.startsWith(scope)).map((s) => s.slice(scope.length).trim()) })) };
  };
  assert.deepEqual(checkFillContrast(themeOf('var(--ink)')), []);
  assert.deepEqual(checkFillContrast(themeOf('var(--faint)')), [{ check: 'contrast', subject: 'ui-button--go selected' }]);
});

// ---------- the required token set ----------

const walk = (dir) => readdirSync(join(ROOT, dir), { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : e.name.endsWith('.js') ? [`${dir}/${e.name}`] : []));

test('the required token set is what the base stylesheets and the screens read, plus the contrast roles', () => {
  const structural = new Set([...read('css/tokens.css').matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
  const reads = new Set();
  for (const f of ['css/components.css', 'css/style.css']) {
    for (const [, name] of stripComments(read(f)).matchAll(/var\((--[\w-]+)/g)) {
      if (!structural.has(name) && !['--f', '--e', '--o'].includes(name)) reads.add(name); // the menu entries' own accent slots
    }
  }
  for (const f of walk('js')) {
    const src = read(f);
    for (const [, name] of src.matchAll(/'(--[a-z][\w-]*)'/g)) reads.add(name);
    for (const [, name] of src.matchAll(/\b(?:color|raised|revealed)\(token, '([\w-]+)'\)/g)) reads.add(`--color-${name}`);
  }
  for (const list of Object.values(CONTRAST_ROLES)) for (const name of list) reads.add(name);
  assert.deepEqual([...REQUIRED_TOKENS].sort(), [...reads].sort());
  assert.equal(new Set(REQUIRED_TOKENS).size, REQUIRED_TOKENS.length, 'each token listed once');
});

// ---------- the checks bite ----------

const has = (list, p) => list.some((x) => x.check === p.check && x.subject === p.subject);

for (const entry of BROKEN_THEMES) {
  test(`the conformance checks catch the broken fixture theme ${entry.id}`, () => {
    const problems = conformance(entry);
    for (const p of entry.expect) assert.ok(has(problems, p), `${entry.id}: ${p.check} ${p.subject} is caught (${JSON.stringify(problems.slice(0, 5))})`);
    for (const p of entry.clean) assert.ok(!has(problems, p), `${entry.id}: ${p.check} ${p.subject} is not flagged`);
  });
}

test('every broken fixture theme is a separate defect, and none is registered', () => {
  assert.equal(new Set(BROKEN_THEMES.map((t) => t.id)).size, BROKEN_THEMES.length);
  for (const t of BROKEN_THEMES) assert.ok(!THEMES.some((x) => x.id === t.id));
  const caught = new Set(BROKEN_THEMES.flatMap((t) => t.expect.map((p) => p.check)));
  for (const check of ['scope', 'token', 'state', 'font', 'remote', 'slot', 'motion', 'files']) assert.ok(caught.has(check), `a fixture breaks ${check}`);
});

// ---------- the gallery per theme ----------

const GALLERY = read('dev/components.html');

function tags(html) {
  const out = [];
  for (const m of html.matchAll(/<([a-z][\w-]*)((?:\s+[\w:-]+(?:="[^"]*")?)*)\s*\/?>/gi)) {
    const attrs = {};
    for (const a of m[2].matchAll(/([\w:-]+)(?:="([^"]*)")?/g)) attrs[a[1]] = a[2] ?? '';
    out.push({ tag: m[1].toLowerCase(), attrs });
  }
  return out;
}
const TAGS = tags(GALLERY);
const classes = (t) => (t.attrs.class ?? '').split(/\s+/);
const forced = (t, s) => (t.attrs['data-force'] ?? '').split(/\s+/).includes(s);
const off = (t) => 'disabled' in t.attrs || t.attrs['aria-disabled'] === 'true';
const SHOWS = {
  default: (t) => !off(t) && !t.attrs['data-force'],
  hover: (t) => forced(t, 'hover'),
  pressed: (t) => forced(t, 'active'),
  focused: (t) => forced(t, 'focus'),
  selected: (t) => forced(t, 'focus'),
  disabled: off,
  checked: (t) => 'checked' in t.attrs || t.attrs['aria-checked'] === 'true' || t.attrs['aria-selected'] === 'true',
  chosen: (t) => t.attrs['aria-pressed'] === 'true' || t.attrs['aria-expanded'] === 'true',
  invalid: (t) => classes(t).includes('is-invalid'),
};

test('the gallery renders every catalogued component, every interactive part in every state, and every decoration slot', () => {
  for (const c of KIT_CATALOGUE.filter((x) => x.kind === 'component')) {
    assert.ok(TAGS.some((t) => classes(t).includes(c.className)), `the gallery shows ${c.name}`);
    for (const p of c.parts.filter((x) => x.interactive)) {
      const cls = lastCompound(p.selector).match(/\.([\w-]+)/)[1];
      const shown = TAGS.filter((t) => classes(t).includes(cls));
      for (const state of Object.keys(p.states)) assert.ok(shown.some(SHOWS[state]), `${c.name} ${p.name} shown ${state}`);
    }
  }
  for (const c of KIT_CATALOGUE) {
    for (const s of c.slots) assert.ok(TAGS.some((t) => t.attrs['data-slot'] === s.name), `the gallery shows ${c.name}'s ${s.name} slot`);
  }
});

test('the gallery takes its theme from the registry, through a picker and a ?theme= parameter, and applies it with the applier', () => {
  assert.match(GALLERY, /from '\.\.\/js\/themes\/registry\.js'/);
  assert.match(GALLERY, /from '\.\.\/js\/themes\/applier\.js'/);
  assert.match(GALLERY, /searchParams\.get\('theme'\)|\.get\('theme'\)/);
  assert.ok(TAGS.some((t) => t.attrs.id === 'g-theme' && classes(t).includes('ui-segmented')), 'the picker is a segmented choice');
});

for (const entry of THEMES) {
  test(`in a browser, the gallery renders under ${entry.name} with no missing font, no failed request and no console error`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    try {
      const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
      const errors = [];
      const failed = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      page.on('requestfailed', (r) => failed.push(r.url()));
      page.on('response', (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`); });
      await page.goto(`${base}/dev/components.html?theme=${entry.id}`);
      assert.equal(await page.evaluate(() => globalThis.galleryReady), entry.id);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), entry.id);
      await page.evaluate(() => document.fonts.ready);
      const specs = entry.fonts.flatMap((f) => f.files.map((x) => `${x.style} ${x.weight} 16px "${f.family}"`));
      const missing = await page.evaluate((list) => list.filter((s) => !document.fonts.check(s)), specs);
      assert.deepEqual(missing, [], 'every font of the theme loads');
      const picker = await page.evaluate(() => [...document.querySelectorAll('#g-theme .ui-segmented__option')]
        .map((o) => [o.dataset.value, o.textContent.trim(), o.getAttribute('aria-checked')]));
      assert.deepEqual(picker, THEMES.map((x) => [x.id, x.name, x.id === entry.id ? 'true' : 'false']), 'the picker lists the registry, the theme shown checked');
      assert.deepEqual(failed, [], 'no request fails');
      assert.deepEqual(errors, [], 'no console error');
    } finally {
      await browser.close();
    }
  });
}

test('in a browser, the gallery falls back to the default theme for an unknown ?theme= id', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/dev/components.html?theme=no-such-theme`);
    assert.equal(await page.evaluate(() => globalThis.galleryReady), DEFAULT_THEME_ID);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), DEFAULT_THEME_ID);
    assert.equal(await page.evaluate(() => document.querySelector('#g-theme [aria-checked="true"]').dataset.value), DEFAULT_THEME_ID);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
