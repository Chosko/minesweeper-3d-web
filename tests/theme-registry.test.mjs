import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { THEMES, DEFAULT_THEME_ID, themeById } from '../js/themes/registry.js';
import { KIT_CATALOGUE, STATES } from '../js/ui/kit-catalogue.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const RAW = read('css/components.css');
const HEAD = RAW.match(/^\/\*([\s\S]*?)\*\//)[1];
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');
const SELECTORS = [...CSS.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap((m) => m[1].split(',').map((s) => s.trim()));
const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// ---------------------------------------------------------------- registry

test('the registry lists frozen entries of the documented shape', () => {
  assert.ok(Object.isFrozen(THEMES), 'the list is frozen');
  assert.ok(THEMES.length >= 1);
  for (const t of THEMES) {
    assert.ok(Object.isFrozen(t), `${t.id} is frozen`);
    assert.equal(typeof t.id, 'string');
    assert.equal(typeof t.name, 'string');
    assert.ok(t.name.length > 0);
    assert.equal(typeof t.stylesheet, 'string');
    assert.equal(typeof t.boardModule, 'string');
    assert.equal(typeof t.order, 'number');
    assert.equal(typeof t.demo, 'boolean');
    assert.ok(Object.isFrozen(t.fonts) && t.fonts.length > 0, `${t.id} names its fonts`);
    for (const f of t.fonts) {
      assert.ok(Object.isFrozen(f) && Object.isFrozen(f.files));
      assert.equal(typeof f.family, 'string');
      assert.equal(typeof f.licence, 'string');
      assert.ok(f.files.length > 0, `${f.family} has files`);
      for (const file of f.files) {
        assert.ok(Object.isFrozen(file));
        assert.equal(typeof file.weight, 'number');
        assert.equal(file.style, 'normal');
        assert.match(file.path, /\.woff2$/);
      }
    }
  }
});

test('ids are unique, kebab-case, and the entries come in catalogue order', () => {
  const ids = THEMES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length, 'ids are unique');
  for (const id of ids) assert.match(id, KEBAB, `${id} is kebab-case`);
  const orders = THEMES.map((t) => t.order);
  assert.equal(new Set(orders).size, orders.length, 'catalogue orders are unique');
  assert.deepEqual(orders, [...orders].sort((a, b) => a - b), 'entries in catalogue order');
});

test('Joyful tiles is the default and its entry names its files', () => {
  assert.equal(DEFAULT_THEME_ID, 'joyful-tiles');
  const joyful = THEMES.find((t) => t.id === 'joyful-tiles');
  assert.ok(joyful);
  assert.equal(joyful.name, 'Joyful tiles');
  assert.equal(joyful.stylesheet, 'themes/joyful-tiles/theme.css');
  assert.equal(joyful.boardModule, 'themes/joyful-tiles/board.js');
  assert.equal(joyful.demo, true);
  const families = Object.fromEntries(joyful.fonts.map((f) => [f.family, f.files.map((x) => x.weight)]));
  assert.deepEqual(families.Rubik, [500, 600, 700, 800, 900]);
  assert.deepEqual(families['JetBrains Mono'], [500, 700]);
  for (const f of joyful.fonts) {
    assert.ok(f.licence.startsWith('themes/joyful-tiles/fonts/'));
    for (const file of f.files) assert.ok(file.path.startsWith('themes/joyful-tiles/fonts/'));
  }
});

test('the lookup returns the entry, or the default for an unknown or absent id', () => {
  const def = THEMES.find((t) => t.id === DEFAULT_THEME_ID);
  for (const t of THEMES) assert.equal(themeById(t.id), t);
  for (const id of [undefined, null, '', 'light', 'dark', 'no-such-theme', 'constructor', '__proto__', 42]) {
    assert.equal(themeById(id), def, `${String(id)} → default`);
  }
});

test('every font file and licence the registry names exists on disk', () => {
  for (const t of THEMES) {
    for (const f of t.fonts) {
      assert.ok(existsSync(join(ROOT, f.licence)), `${f.licence} exists`);
      assert.match(read(f.licence), /SIL OPEN FONT LICENSE Version 1\.1/, `${f.licence} is the OFL text`);
      for (const file of f.files) {
        assert.ok(existsSync(join(ROOT, file.path)), `${file.path} exists`);
        const bytes = readFileSync(join(ROOT, file.path));
        assert.equal(bytes.subarray(0, 4).toString('latin1'), 'wOF2', `${file.path} is a woff2 file`);
      }
    }
  }
});

test('the Joyful tiles folder holds no remote URL and only the fonts the registry names', () => {
  const dir = join(ROOT, 'themes/joyful-tiles');
  const walk = (d) => readdirSync(d).flatMap((n) => (statSync(join(d, n)).isDirectory() ? walk(join(d, n)) : [join(d, n)]));
  const files = walk(dir);
  for (const file of files.filter((f) => !f.endsWith('.woff2'))) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /https?:|\/\//, `${file} holds no remote URL`);
  }
  const named = new Set(themeById('joyful-tiles').fonts.flatMap((f) => f.files.map((x) => join(ROOT, x.path))));
  assert.deepEqual(new Set(files.filter((f) => f.endsWith('.woff2'))), named, 'only the named font files ship');
});

test('the Joyful tiles board module is an empty frozen placeholder', async () => {
  const mod = await import(pathToFileURL(join(ROOT, themeById('joyful-tiles').boardModule)).href);
  assert.ok(Object.isFrozen(mod.BOARD));
  assert.deepEqual(Object.keys(mod.BOARD), []);
  assert.match(read('themes/joyful-tiles/board.js'), /themed-board-art-and-motion/, 'its header names the owning feature');
});

// ---------------------------------------------------------------- kit catalogue

const classesIn = (sel) => [...sel.matchAll(/\.(ui-[a-z0-9_-]+)/g)].map((m) => m[1]);

function catalogueSelectors() {
  const out = [];
  for (const c of KIT_CATALOGUE) {
    out.push(c.selector, ...(c.base ? [`.${c.base}`] : []), ...c.variants.map((v) => `.${v}`));
    for (const p of c.parts) {
      out.push(p.selector);
      for (const s of Object.values(p.states ?? {})) out.push(...s.split(',').map((x) => x.trim()));
    }
    for (const s of c.slots) out.push(s.selector);
  }
  return out;
}

test('the kit catalogue is frozen data of the documented shape', () => {
  assert.ok(Object.isFrozen(KIT_CATALOGUE) && Object.isFrozen(STATES));
  const names = KIT_CATALOGUE.map((c) => c.name);
  assert.equal(new Set(names).size, names.length, 'component names are unique');
  for (const c of KIT_CATALOGUE) {
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.parts) && Object.isFrozen(c.slots) && Object.isFrozen(c.variants), `${c.name} is frozen`);
    assert.ok(['component', 'composition'].includes(c.kind), `${c.name} kind`);
    assert.equal(c.selector, `.${c.className}`, `${c.name} selector is its class`);
    assert.ok(c.base === null || typeof c.base === 'string', `${c.name} base`);
    assert.deepEqual(c.slots, [], 'no decoration slot exists yet');
    for (const p of c.parts) {
      assert.ok(Object.isFrozen(p), `${c.name} ${p.name} is frozen`);
      assert.equal(typeof p.optional, 'boolean');
      assert.equal(typeof p.interactive, 'boolean');
      if (!p.interactive) { assert.equal(p.states, undefined, `${c.name} ${p.name} has no states`); continue; }
      assert.ok(Object.isFrozen(p.states));
      const keys = Object.keys(p.states);
      for (const k of keys) assert.ok(STATES.includes(k), `${c.name} ${p.name} state ${k} is in the vocabulary`);
      for (const k of ['default', 'pressed', 'disabled']) assert.ok(keys.includes(k), `${c.name} ${p.name} has ${k}`);
      // On buttons and menu entries hover and focus are the one selected state; every other control keeps its own.
      if (keys.includes('selected')) assert.ok(!keys.includes('hover') && !keys.includes('focused'), `${c.name} ${p.name} folds hover and focus into selected`);
      else for (const k of ['hover', 'focused']) assert.ok(keys.includes(k), `${c.name} ${p.name} has ${k}`);
    }
  }
});

test('the kit catalogue declares every component the stylesheet head documents', () => {
  const documented = ['ui-button--primary', 'ui-button--secondary', 'ui-menu', 'ui-card', 'ui-panel', 'ui-banner', 'ui-toggle',
    'ui-slider', 'ui-segmented', 'ui-stat', 'ui-stat--tile', 'ui-code', 'ui-pager', 'ui-field', 'ui-link', 'ui-spinner',
    'ui-overlay-bar', 'ui-screen', 'ui-row', 'ui-grid', 'ui-heading', 'ui-text', 'ui-actions', 'ui-stat-row', 'ui-columns'];
  for (const name of documented) {
    assert.ok(HEAD.includes(name), `the head documents ${name}`);
    assert.ok(KIT_CATALOGUE.some((c) => c.className === name), `the catalogue declares ${name}`);
  }
  for (const c of KIT_CATALOGUE) assert.ok(HEAD.includes(c.className), `${c.className} is documented in the head`);
});

test('the kit catalogue lists every ui-* class the stylesheet uses, and every catalogued class exists there', () => {
  const used = new Set(SELECTORS.flatMap(classesIn));
  const catalogued = new Set(catalogueSelectors().flatMap(classesIn));
  for (const cls of used) assert.ok(catalogued.has(cls), `${cls} is catalogued`);
  for (const cls of catalogued) assert.ok(RAW.includes(cls), `${cls} exists in css/components.css`);
});

test('every interactive part and state maps to a selector the stylesheet styles', () => {
  let count = 0;
  for (const c of KIT_CATALOGUE) {
    for (const p of c.parts.filter((x) => x.interactive)) {
      for (const [state, list] of Object.entries(p.states)) {
        for (const sel of list.split(',').map((x) => x.trim())) {
          count++;
          assert.ok(SELECTORS.some((s) => s.includes(sel)), `${c.name} ${p.name} ${state}: a rule styles ${sel}`);
        }
      }
    }
  }
  assert.ok(count > 40, 'the interactive parts carry their states');
});
