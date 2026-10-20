import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BOARD as JOYFUL_BOARD } from '../themes/joyful-tiles/board.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const BASE_TOKENS_CSS = strip(read('../css/tokens.css'));
const THEME_CSS = strip(read('../themes/joyful-tiles/theme.css'));
const SCOPE = ':root[data-theme="joyful-tiles"]';

// ---------- parsing ----------
function block(css, selector, file) {
  const re = new RegExp(`(^|\\})\\s*${selector.replace(/[[\]"().:]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = css.match(re);
  assert.ok(m, `${file} has a ${selector} block`);
  const decls = new Map();
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const name = d.slice(0, i).trim();
    if (name.startsWith('--')) decls.set(name, d.slice(i + 1).trim());
  }
  return decls;
}

const BASE = block(BASE_TOKENS_CSS, ':root', 'css/tokens.css');
const THEME = block(THEME_CSS, SCOPE, 'theme.css');
const ALL = new Map([...BASE, ...THEME]);

function parseColor(v) {
  let m = v.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (m) {
    const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).concat(1);
  }
  m = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`unparseable colour value: ${v}`);
}

// Composite a (possibly translucent) colour over an opaque one.
const over = ([r, g, b, a], base) => [r * a + base[0] * (1 - a), g * a + base[1] * (1 - a), b * a + base[2] * (1 - a), 1];

function luminance([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
const color = (name) => {
  assert.ok(THEME.has(name), `Joyful tiles declares ${name}`);
  return parseColor(THEME.get(name));
};

// ---------- the base token sheet: structure only ----------
test('css/tokens.css keeps only structural tokens: spacing, z-layers and tabular numerals', () => {
  assert.ok(BASE.size > 0);
  for (const name of BASE.keys()) {
    assert.match(name, /^--(space-\d+|z-[\w-]+|font-numeric-tabular)$/, `${name} is structural`);
  }
  assert.equal(BASE.get('--font-numeric-tabular'), 'tabular-nums');
  assert.ok([...BASE.keys()].filter((k) => k.startsWith('--space-')).length >= 6, 'the spacing scale');
  assert.doesNotMatch(BASE_TOKENS_CSS, /data-theme|#[0-9a-f]{3,8}\b|rgba?\(/i, 'nothing per-theme');
  const rules = [...BASE_TOKENS_CSS.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim());
  assert.deepEqual(rules, [':root'], 'one :root block');
});

test('the z-layers stack the overlays in order', () => {
  const z = (n) => Number(BASE.get(`--z-${n}`));
  const order = ['hud', 'help', 'flash', 'overlay', 'modal', 'context-lost', 'toast', 'fatal'];
  for (let i = 1; i < order.length; i++) assert.ok(z(order[i]) > z(order[i - 1]), `${order[i]} above ${order[i - 1]}`);
  assert.equal(BASE.get('--z-banner'), undefined, 'no layer for the removed end banner');
});

// ---------- Joyful tiles: the canvas's token block ----------
// J-Tokens, the canvas artboard the theme's tokens come from: every one, with its value. Its spacing
// scale is not here: spacing is structural, the base's (css/tokens.css). Nor are its sky stops and its
// number 8, which no screen reads as a token: the board module carries the sky and the numbers
// (themes/joyful-tiles/board.js).
const J_TOKENS = {
  '--color-ground': '#fff6e8', '--color-ground-dot': '#dcc9ad',
  '--color-surface': '#ffffff', '--color-surface-raised': '#fff6e8', '--color-surface-sunk': '#fbf1df',
  '--color-border': '#ece2d0', '--color-line': '#f3dca0', '--color-edge': '#d6c6ab', '--color-edge-inset': '#e2d5bf', '--color-field-border': '#8a7a5c',
  '--color-ink': '#16204a', '--color-ink-muted': '#5a6385', '--color-ink-inverse': '#ffffff',
  '--color-head': '#ffc93c', '--color-head-edge': '#c9930c',
  '--color-accent': '#b8323a', '--color-accent-fill': '#ff6b6b', '--color-accent-edge': '#c9403f', '--color-accent-on': '#16204a',
  '--color-blue': '#3563d8', '--color-blue-edge': '#22409a', '--color-blue-on': '#ffffff',
  '--color-teal': '#49c6b8', '--color-teal-edge': '#2a9488', '--color-teal-on': '#16204a',
  '--color-yellow': '#ffc93c', '--color-yellow-edge': '#c9930c', '--color-yellow-on': '#16204a',
  '--color-violet': '#6d4ee8', '--color-violet-edge': '#4b30b8', '--color-violet-on': '#ffffff',
  '--color-green': '#5fd07e', '--color-green-edge': '#2f9a4f', '--color-green-on': '#16204a',
  '--color-orange': '#ff9a3c', '--color-orange-edge': '#c96a12', '--color-orange-on': '#16204a', '--color-ink-edge': '#0a1030',
  '--color-figure': '#0d7064', '--color-success': '#0d7064', '--color-success-fill': '#d9f4ef',
  '--color-danger': '#b42a2a', '--color-danger-edge': '#7d1c1c', '--color-danger-fill': '#ffe1de',
  '--color-warning': '#8a5f00', '--color-warning-fill': '#fff0c2',
  '--color-locked': '#ece5d8', '--color-locked-edge': '#d8cdb9', '--color-locked-ink': '#5a6385',
  '--color-focus-ring': '#16204a', '--color-focus-halo': '#ffc93c',
  '--color-backdrop': 'rgba(22, 32, 74, 0.55)', '--color-backdrop-strong': 'rgba(14, 22, 64, 0.72)',
  '--color-tile-closed-top': '#a9c9fb', '--color-tile-closed-edge': '#2b56b5',
  '--color-tile-open': '#f3f0ea', '--color-tile-open-border': '#ddd3c1', '--color-tile-boom': '#ff6b6b', '--color-tile-boom-edge': '#c9403f',
  '--color-tile-mark': '#49c6b8',
  '--color-number-1': '#1565c0', '--color-number-2': '#2b742f', '--color-number-3': '#c32727', '--color-number-4': '#1a237e',
  '--color-number-5': '#8d1c1c', '--color-number-6': '#00717c', '--color-number-7': '#212121',
  '--color-replay-reveal': '#3563d8', '--color-replay-flag': '#b8323a', '--color-replay-chord': '#0d7064', '--color-replay-pointer': '#16204a', '--color-replay-pause': '#c9930c',
  '--color-confetti-1': '#ff6b6b', '--color-confetti-2': '#ffc93c', '--color-confetti-3': '#49c6b8', '--color-confetti-4': '#78aaf8', '--color-confetti-5': '#6d4ee8',
  '--highlight': 'rgba(255, 255, 255, 0.32)', '--veil': 'rgba(255, 255, 255, 0.22)', '--shade-soft': 'rgba(22, 32, 74, 0.06)', '--shade-press': 'rgba(22, 32, 74, 0.2)',
  '--elevation-1': '0 24px 30px -14px rgba(22, 32, 74, 0.4)',
  '--elevation-2': '0 24px 28px -10px rgba(22, 32, 74, 0.22), 0 48px 70px -18px rgba(22, 32, 74, 0.35)',
  '--font-family-sans': '"Rubik", system-ui, sans-serif', '--font-family-mono': '"JetBrains Mono", ui-monospace, monospace', '--font-family-numbers': '"Rubik", sans-serif',
  '--font-size-xs': '12px', '--font-size-sm': '14px', '--font-size-md': '16px', '--font-size-lg': '19px', '--font-size-xl': '24px',
  '--font-size-2xl': '32px', '--font-size-3xl': '44px', '--font-size-display': '80px',
  '--font-weight-regular': '500', '--font-weight-bold': '700', '--font-weight-heavy': '800', '--font-weight-black': '900',
  '--radius-xs': '4px', '--radius-sm': '8px', '--radius-md': '12px', '--radius-lg': '16px', '--radius-xl': '20px', '--radius-2xl': '26px', '--radius-pill': '999px',
  '--edge-sm': '4px', '--edge-md': '6px', '--edge-lg': '8px',
  '--duration-fast': '90ms', '--duration-base': '160ms', '--duration-slow': '260ms',
  '--easing-out': 'cubic-bezier(.2, .8, .2, 1)', '--easing-spring': 'cubic-bezier(.34, 1.56, .64, 1)',
  '--touch-target': '44px',
};
// The canvas's tile tokens the theme declares with values of its own: the 2D board view's cursor ring
// and frame, and the aimed-cell readout's cube.
const SKIN_KEPT = ['--color-tile-closed', '--color-tile-cursor', '--color-board-frame'];

const norm = (v) => v.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').toLowerCase();

test('Joyful tiles declares every token of the canvas\'s J-Tokens block, with its value', () => {
  for (const [name, value] of Object.entries(J_TOKENS)) {
    assert.ok(THEME.has(name), `declares ${name}`);
    if (name.startsWith('--color') || name.startsWith('--highlight') || name.startsWith('--veil') || name.startsWith('--shade')) {
      assert.deepEqual(parseColor(THEME.get(name)), parseColor(value), `${name} is ${value}`);
    } else assert.equal(norm(THEME.get(name)), norm(value), `${name} is ${value}`);
  }
  for (const name of SKIN_KEPT) assert.ok(THEME.has(name), `declares the tile skin's ${name}`);
});

test('the theme declares every token the base stylesheets and the screens read', () => {
  const sources = ['../css/components.css', '../css/style.css', '../themes/joyful-tiles/theme.css'];
  for (const f of sources) {
    for (const [, name] of strip(read(f)).matchAll(/var\((--[\w-]+)/g)) {
      if (['--f', '--e', '--o'].includes(name)) continue; // the menu entries' own accent slots
      assert.ok(ALL.has(name), `${f} reads undeclared ${name}`);
    }
  }
  for (const f of ['../js/records/history-chart.js', '../js/classic2d/board-view.js', '../js/classic2d/end-effect.js', '../js/main.js', '../js/replay/viewer-2d.js', '../js/shell/scene-palette.js']) {
    for (const [, name] of read(f).matchAll(/'(--color-[\w-]+)'/g)) assert.ok(THEME.has(name), `${f} reads undeclared ${name}`);
  }
});

// ---------- contrast contract ----------
const SURFACES = ['--color-surface', '--color-surface-raised', '--color-surface-sunk', '--color-ground'];

test('Joyful tiles: body text meets 4.5:1 on every surface token', () => {
  for (const ink of ['--color-ink', '--color-ink-muted']) {
    for (const s of SURFACES) {
      const r = contrast(color(ink), color(s));
      assert.ok(r >= 4.5, `${ink} on ${s}: ${r.toFixed(2)}:1`);
    }
  }
});

test('Joyful tiles: large text and essential glyphs meet 3:1 on every surface token', () => {
  const glyphs = ['--color-accent', '--color-figure', '--color-success', '--color-danger', '--color-warning',
    '--color-focus-ring', '--color-field-border', '--color-teal-edge', '--color-blue-edge'];
  for (const g of glyphs) {
    for (const s of SURFACES) {
      const r = contrast(color(g), color(s));
      assert.ok(r >= 3, `${g} on ${s}: ${r.toFixed(2)}:1`);
    }
  }
});

test('Joyful tiles: text on every fill meets 4.5:1 (the canvas\'s measured pairs)', () => {
  const pairs = [
    ['--color-accent-on', '--color-accent-fill'], ['--color-blue-on', '--color-blue'], ['--color-teal-on', '--color-teal'],
    ['--color-yellow-on', '--color-yellow'], ['--color-violet-on', '--color-violet'], ['--color-green-on', '--color-green'],
    ['--color-orange-on', '--color-orange'], ['--color-ink-inverse', '--color-ink'], ['--color-locked-ink', '--color-locked'],
    ['--color-ink', '--color-head'], ['--color-ink', '--color-success-fill'], ['--color-warning', '--color-warning-fill'],
    ['--color-danger', '--color-danger-fill'], ['--color-success', '--color-success-fill'],
  ];
  for (const [fg, bg] of pairs) {
    const r = contrast(color(fg), color(bg));
    assert.ok(r >= 4.5, `${fg} on ${bg}: ${r.toFixed(2)}:1`);
  }
});

test('Joyful tiles: the scrims are translucent, so the scene shows dimmed behind the cards', () => {
  for (const name of ['--color-backdrop', '--color-backdrop-strong']) {
    const a = color(name)[3];
    assert.ok(a > 0 && a < 1, `${name} is translucent`);
  }
});

// ---------- the board tokens ----------
// What the screens still read of the board's colours as tokens: the 2D board view's frame, gap and
// cursor ring, its end effect's win pulse, the aimed-cell readout's cube, and the number colours the
// end effect's confetti takes. The tiles and cubes draw from the board module.
const TILE_TOKENS = ['--color-tile-closed', '--color-tile-cursor', '--color-tile-bevel-light', '--color-board-frame', '--color-board-gap'];
const NUMBER_TOKENS = Array.from({ length: 7 }, (_, i) => `--color-number-${i + 1}`);
// The tile skin's palette, which the board module replaced: no theme declares it.
const RETIRED_TILE_TOKENS = [
  '--color-tile-rim', '--color-tile-bevel-dark', '--color-tile-flagged', '--color-tile-face-shade',
  '--color-tile-gloss', '--color-tile-gloss-fade', '--color-tile-pressed',
  '--color-tile-revealed-rim', '--color-tile-revealed-edge', '--color-tile-revealed', '--color-tile-revealed-shade',
  '--color-tile-mine', '--color-tile-wrong-flag', '--color-tile-exploded', '--color-tile-exploded-edge', '--color-tile-exploded-shade',
  '--color-tile-number-shadow', '--color-tile-mine-glyph', '--color-tile-mine-highlight',
  '--color-tile-flag', '--color-tile-flag-shade', '--color-tile-flag-shadow',
  '--color-tile-wrong-flag-mark', '--color-tile-wrong-flag-outline', '--color-number-8',
];

test('the board tokens are opaque and the seven number colours distinct', () => {
  for (const name of [...TILE_TOKENS, ...NUMBER_TOKENS]) assert.equal(color(name)[3], 1, `${name} is opaque`);
  const numbers = new Set(NUMBER_TOKENS.map((n) => THEME.get(n).toLowerCase()));
  assert.equal(numbers.size, 7, 'the seven number colours are distinct');
});

test('the tile skin\'s palette is retired: the board module draws the tiles', () => {
  for (const name of RETIRED_TILE_TOKENS) assert.ok(!THEME.has(name), `Joyful tiles no longer declares ${name}`);
});

test('a scrolling board\'s shadow and scroll bar are translucent tokens; the bar meets 3:1 on every tile face the board module draws', () => {
  for (const name of ['--color-board-shadow', '--color-board-scrollbar']) {
    const a = color(name)[3];
    assert.ok(a > 0 && a < 1, `${name} is translucent`);
  }
  const bar = color('--color-board-scrollbar');
  for (const face of ['closed', 'sunk', 'revealed', 'exploded']) {
    const value = JOYFUL_BOARD.palette.faces2d[face].face;
    const under = parseColor(value);
    const r = contrast(over(bar, under), under);
    assert.ok(r >= 3, `--color-board-scrollbar on the ${face} face ${value}: ${r.toFixed(2)}:1`);
  }
});

test('the cursor ring meets 3:1 on the closed tile tokens it can sit on', () => {
  const ring = color('--color-tile-cursor');
  for (const bg of ['--color-tile-bevel-light', '--color-tile-closed']) {
    const r = contrast(ring, color(bg));
    assert.ok(r >= 3, `--color-tile-cursor on ${bg}: ${r.toFixed(2)}:1`);
  }
});

// ---------- the scene panel's night sky; the 3D scene reads no token ----------
test('the scene panel\'s night sky is opaque and dark under the panel ink', () => {
  for (const name of ['--color-panel-night', '--color-panel-glow']) {
    assert.equal(color(name)[3], 1, `${name} is opaque`);
    assert.ok(contrast(color('--color-panel-ink'), color(name)) >= 4.5, `--color-panel-ink reads on ${name}`);
  }
});

test('the 3D renderer reads no token: the shell hands it the board module', () => {
  for (const f of ['../js/render.js', '../js/textures.js', '../js/tile-art.js']) {
    assert.doesNotMatch(read(f), /--color-|data-theme|getPropertyValue/, f);
  }
});

// ---------- the scrims over the scene, read from the theme ----------
test('the overlays over the scene and the context-lost screen read the theme\'s scrims, with no hard-coded tint', () => {
  assert.match(THEME_CSS, /:is\(#pause, #ready, #results, #learn-end, \.modal\) \{[^}]*background: var\(--color-backdrop\)/);
  assert.match(THEME_CSS, /#ctx-lost \{[^}]*background: var\(--color-backdrop-strong\)/);
  assert.match(THEME_CSS, /#results\.results--over3d \{[^}]*background: var\(--color-backdrop-strong\)/);
  assert.match(THEME_CSS, /\.ui-card \{[^}]*background: var\(--color-surface\)/, 'the ready and context-lost cards are kit cards, on the surface');
  assert.doesNotMatch(THEME_CSS, /\.ready-card/, 'no one-off card of their own');
  const style = strip(read('../css/style.css'));
  assert.doesNotMatch(style, /:[^;{}]*(rgba?\(|#[0-9a-f]{3,8}\b)/i, 'css/style.css carries no tint');
});

// ---------- replay viewer marks ----------
const REPLAY_MARKS = ['--color-replay-reveal', '--color-replay-flag', '--color-replay-chord'];
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('the replay ticks and press rings: three colours, distinct from each other, the pause mark and the seek bar\'s track and thumb', () => {
  const marks = REPLAY_MARKS.map(color);
  const track = color('--color-line');
  const others = ['--color-replay-pause', '--color-surface'].map(color);
  for (let i = 0; i < marks.length; i++) {
    assert.ok(contrast(marks[i], track) >= 3, `${REPLAY_MARKS[i]} reads on the bar's track`);
    for (let j = i + 1; j < marks.length; j++) assert.ok(distance(marks[i], marks[j]) > 60, `${REPLAY_MARKS[i]} vs ${REPLAY_MARKS[j]}`);
    for (const o of [...others, track]) assert.ok(distance(marks[i], o) > 60, `${REPLAY_MARKS[i]} differs from the pause mark, track and thumb`);
  }
});

test('the replay pointer: a dark core in a light outline', () => {
  const core = color('--color-replay-pointer');
  const ring = color('--color-replay-pointer-outline');
  assert.ok(contrast(core, ring) >= 7, 'core against outline');
  assert.ok(luminance(core) < luminance(ring));
});

test('Show 3BV: a small cycle of translucent opening tints, neighbours distinct, and the isolated number\'s mark', () => {
  const tints = [1, 2, 3, 4, 5, 6].map((i) => color(`--color-replay-bbbv-${i}`));
  for (const c of tints) assert.ok(c[3] > 0 && c[3] < 1, 'a tint lets the tile show through');
  for (let i = 0; i < tints.length; i++) for (let j = i + 1; j < tints.length; j++) assert.ok(distance(tints[i], tints[j]) > 60, `tints ${i + 1} and ${j + 1} differ`);
  assert.equal(color('--color-replay-bbbv-isolated')[3], 1, 'the isolated mark is opaque');
});
