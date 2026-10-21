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
  const order = ['hud', 'help', 'flash', 'overlay', 'context-lost', 'toast', 'fatal'];
  for (let i = 1; i < order.length; i++) assert.ok(z(order[i]) > z(order[i - 1]), `${order[i]} above ${order[i - 1]}`);
  assert.equal(BASE.get('--z-banner'), undefined, 'no layer for the removed end banner');
  assert.equal(BASE.get('--z-modal'), undefined, 'no layer for a modal: none is left');
});

// ---------- Joyful tiles: the canvas's token block ----------
// J-Tokens, the canvas artboard the theme's tokens come from: every one, with its value. Its spacing
// scale is not here: spacing is structural, the base's (css/tokens.css).
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
  '--color-tile-mark': '#49c6b8', '--color-tile-closed': '#78aaf8', '--color-tile-pressed': '#6b9ef2', '--color-tile-cursor': '#16204a',
  '--color-board-frame': '#ffffff',
  '--color-number-1': '#1565c0', '--color-number-2': '#2b742f', '--color-number-3': '#c32727', '--color-number-4': '#1a237e',
  '--color-number-5': '#8d1c1c', '--color-number-6': '#00717c', '--color-number-7': '#212121', '--color-number-8': '#666666',
  '--color-scene-zenith': '#0e1640', '--color-scene-horizon': '#2b3f8a', '--color-scene-nadir': '#1a265f', '--color-scene-ink': '#dfe6ff',
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
const norm = (v) => v.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').toLowerCase();

test('Joyful tiles declares every token of the canvas\'s J-Tokens block, with its value', () => {
  for (const [name, value] of Object.entries(J_TOKENS)) {
    assert.ok(THEME.has(name), `declares ${name}`);
    if (name.startsWith('--color') || name.startsWith('--highlight') || name.startsWith('--veil') || name.startsWith('--shade')) {
      assert.deepEqual(parseColor(THEME.get(name)), parseColor(value), `${name} is ${value}`);
    } else assert.equal(norm(THEME.get(name)), norm(value), `${name} is ${value}`);
  }
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
// J-Tokens' board tokens: the 2D board view's frame and cursor ring and the aimed-cell readout's cube
// read them; the tiles, cubes, numbers and end effect draw from the board module, which carries the
// same values (the 2D numbers are its 2D list).
const TILE_TOKENS = ['--color-tile-closed', '--color-tile-pressed', '--color-tile-cursor', '--color-board-frame'];
const NUMBER_TOKENS = Array.from({ length: 8 }, (_, i) => `--color-number-${i + 1}`);
// Board tokens the canvas does not have: the tile skin's palette, which the board module replaced,
// and the board colours nothing reads once the board module draws them. No theme declares them.
const RETIRED_TILE_TOKENS = [
  '--color-tile-rim', '--color-tile-bevel-dark', '--color-tile-flagged', '--color-tile-face-shade',
  '--color-tile-gloss', '--color-tile-gloss-fade',
  '--color-tile-revealed-rim', '--color-tile-revealed-edge', '--color-tile-revealed', '--color-tile-revealed-shade',
  '--color-tile-mine', '--color-tile-wrong-flag', '--color-tile-exploded', '--color-tile-exploded-edge', '--color-tile-exploded-shade',
  '--color-tile-number-shadow', '--color-tile-mine-glyph', '--color-tile-mine-highlight',
  '--color-tile-flag', '--color-tile-flag-shade', '--color-tile-flag-shadow',
  '--color-tile-wrong-flag-mark', '--color-tile-wrong-flag-outline',
  '--color-tile-bevel-light', '--color-board-gap',
];

test('the board tokens are opaque and the eight number colours distinct', () => {
  for (const name of [...TILE_TOKENS, ...NUMBER_TOKENS]) assert.equal(color(name)[3], 1, `${name} is opaque`);
  const numbers = new Set(NUMBER_TOKENS.map((n) => THEME.get(n).toLowerCase()));
  assert.equal(numbers.size, 8, 'the eight number colours are distinct');
});

test('the number tokens are the board module\'s 2D list, and the tile tokens its 2D faces', () => {
  for (let n = 1; n <= 8; n++) assert.equal(THEME.get(`--color-number-${n}`).toLowerCase(), JOYFUL_BOARD.numbers2d[n], `--color-number-${n}`);
  assert.equal(THEME.get('--color-tile-closed').toLowerCase(), JOYFUL_BOARD.palette.faces2d.closed.face);
  assert.equal(THEME.get('--color-tile-pressed').toLowerCase(), JOYFUL_BOARD.palette.faces2d.sunk.face);
  assert.equal(THEME.get('--color-board-frame').toLowerCase(), JOYFUL_BOARD.palette.boardGround);
  assert.equal(THEME.get('--color-tile-cursor').toLowerCase(), JOYFUL_BOARD.cursor.color);
});

test('the board tokens the canvas lacks are retired: the board module draws the tiles', () => {
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
  for (const bg of ['--color-tile-closed-top', '--color-tile-closed']) {
    const r = contrast(ring, color(bg));
    assert.ok(r >= 3, `--color-tile-cursor on ${bg}: ${r.toFixed(2)}:1`);
  }
});

// ---------- the scene tokens: the sky the scene panel draws; the 3D scene reads no token ----------
test('the scene tokens are the board module\'s sky, opaque and dark under the scene ink', () => {
  for (const stop of ['zenith', 'horizon', 'nadir']) {
    const name = `--color-scene-${stop}`;
    assert.equal(color(name)[3], 1, `${name} is opaque`);
    assert.equal(THEME.get(name).toLowerCase(), JOYFUL_BOARD.sky[stop], `${name} is the sky's ${stop}`);
    assert.ok(contrast(color('--color-scene-ink'), color(name)) >= 4.5, `--color-scene-ink reads on ${name}`);
  }
  for (const old of ['--color-panel-night', '--color-panel-glow', '--color-panel-ink']) {
    assert.ok(!THEME.has(old), `${old} is renamed`);
    assert.doesNotMatch(THEME_CSS, new RegExp(`var\\(${old}\\)`), `nothing reads ${old}`);
  }
});

test('Joyful tiles sets its base text in the regular weight at a line height of 1.25', () => {
  const body = THEME_CSS.match(/:root\[data-theme="joyful-tiles"\] body \{([^}]*)\}/);
  assert.ok(body, 'a body rule');
  assert.match(body[1], /font-weight:\s*var\(--font-weight-regular\)/);
  assert.match(body[1], /line-height:\s*1\.25\b/);
  assert.equal(THEME.get('--font-weight-regular'), '500');
});

test('the 3D renderer reads no token: the shell hands it the board module', () => {
  for (const f of ['../js/render.js', '../js/textures.js', '../js/tile-art.js']) {
    assert.doesNotMatch(read(f), /--color-|data-theme|getPropertyValue/, f);
  }
});

// ---------- the scrims over the scene, read from the theme ----------
test('the overlays over the scene and the context-lost screen read the theme\'s scrims, with no hard-coded tint', () => {
  assert.match(THEME_CSS, /:is\(#pause, #ready, #results, #learn-end, #ctx-lost\) \{[^}]*background: var\(--color-backdrop\)/,
    'one scrim, over 2D and 3D and a lost context alike');
  assert.match(THEME_CSS, /\.ui-card \{[^}]*background: var\(--color-surface\)/, 'the ready and context-lost cards are kit cards, on the surface');
  assert.doesNotMatch(THEME_CSS, /\.ready-card/, 'no one-off card of their own');
  const style = strip(read('../css/style.css'));
  assert.doesNotMatch(style, /\{[^}]*:[^;{}]*(rgba?\(|#[0-9a-f]{3,8}\b)/i, 'css/style.css carries no tint in any declaration');
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

test('Show 3BV: the openings tinted in three confetti colours, distinct from each other; no replay palette of its own', () => {
  const tints = [2, 3, 5].map((i) => color(`--color-confetti-${i}`));
  for (let i = 0; i < tints.length; i++) for (let j = i + 1; j < tints.length; j++) assert.ok(distance(tints[i], tints[j]) > 60, `tints ${i + 1} and ${j + 1} differ`);
  assert.doesNotMatch(read('../themes/joyful-tiles/theme.css'), /--color-replay-bbbv/, 'the replay\'s own tints are retired');
});
