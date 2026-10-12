import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CSS = readFileSync(new URL('../css/tokens.css', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

// ---------- parsing ----------
function block(selector) {
  const re = new RegExp(`(^|\\})\\s*${selector.replace(/[[\]"().]/g, '\\$&')}\\s*\\{([^}]*)\\}`);
  const m = CSS.match(re);
  assert.ok(m, `tokens.css has a ${selector} block`);
  const decls = new Map();
  for (const d of m[2].split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const name = d.slice(0, i).trim();
    if (name.startsWith('--')) decls.set(name, d.slice(i + 1).trim());
  }
  return decls;
}

const THEMES = {
  light: block(':root'),
  dark: block(':root[data-theme="dark"]'),
};

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

// Resolved, opaque colours for one theme. Translucent surfaces sit on the
// backdrop; the sunken surface sits inside a card.
function palette(theme) {
  const t = THEMES[theme];
  const c = (name) => {
    assert.ok(t.has(name), `${theme} theme declares ${name}`);
    return parseColor(t.get(name));
  };
  const backdrop = c('--color-backdrop');
  assert.equal(backdrop[3], 1, `${theme} --color-backdrop is opaque`);
  const surface = over(c('--color-surface'), backdrop);
  return {
    c: (name) => over(c(name), surface),
    surfaces: {
      backdrop,
      surface,
      'surface-raised': over(c('--color-surface-raised'), surface),
      'surface-sunken': over(c('--color-surface-sunken'), surface),
    },
  };
}

// ---------- token set ----------
test('tokens.css declares the full token set on :root', () => {
  const light = THEMES.light;
  const groups = {
    'colour: surfaces': ['--color-backdrop', '--color-surface', '--color-surface-raised', '--color-surface-sunken'],
    'colour: ink': ['--color-ink', '--color-ink-muted'],
    'colour: accent': ['--color-accent', '--color-accent-strong', '--color-accent-soft', '--color-accent-ink'],
    'colour: states': ['--color-success', '--color-danger', '--color-warning'],
    'colour: focus ring': ['--color-focus-ring'],
    'type: families': ['--font-family-sans', '--font-family-mono'],
    'type: numerals': ['--font-numeric-tabular'],
  };
  for (const [group, names] of Object.entries(groups)) {
    for (const n of names) assert.ok(light.has(n), `${group}: ${n} is declared`);
  }
  const prefixes = {
    'size scale': '--font-size-', weights: '--font-weight-', spacing: '--space-', radii: '--radius-',
    elevation: '--elevation-', durations: '--duration-', easings: '--easing-', 'z-layers': '--z-',
  };
  for (const [group, prefix] of Object.entries(prefixes)) {
    const n = [...light.keys()].filter((k) => k.startsWith(prefix)).length;
    assert.ok(n >= 2, `${group}: at least two ${prefix}* tokens (found ${n})`);
  }
  assert.equal(light.get('--font-numeric-tabular'), 'tabular-nums');
});

const TILE_TOKENS = [
  '--color-tile-closed', '--color-tile-cursor', '--color-tile-pressed', '--color-tile-revealed',
  '--color-tile-flagged', '--color-tile-flag', '--color-tile-mine', '--color-tile-mine-glyph',
  '--color-tile-exploded', '--color-tile-wrong-flag', '--color-tile-wrong-flag-mark',
  // the cube-face recipe (js/tile-art.js): the raised face's rim, bevel and shading, the
  // revealed and exploded faces' rim, edge and shading, the flag cloth's shading
  '--color-tile-rim', '--color-tile-bevel-light', '--color-tile-bevel-dark', '--color-tile-face-shade',
  '--color-tile-revealed-rim', '--color-tile-revealed-edge', '--color-tile-revealed-shade',
  '--color-tile-exploded-edge', '--color-tile-exploded-shade', '--color-tile-flag-shade',
  '--color-board-frame', '--color-board-gap',
];
// The recipe's translucent layers: the gloss and its fade, the mine's highlight, the flag
// cloth's and the number's shadows, the wrong-flag cross's outline.
const TILE_LAYER_TOKENS = [
  '--color-tile-gloss', '--color-tile-gloss-fade', '--color-tile-mine-highlight', '--color-tile-flag-shadow',
  '--color-tile-number-shadow', '--color-tile-wrong-flag-outline',
];
const NUMBER_TOKENS = Array.from({ length: 8 }, (_, i) => `--color-number-${i + 1}`);

test('tile tokens cover every state, the cube-face recipe, the board frame and gap, and numbers 1–8, in both themes', () => {
  for (const theme of ['light', 'dark']) {
    for (const name of [...TILE_TOKENS, ...NUMBER_TOKENS]) {
      assert.ok(THEMES[theme].has(name), `${theme} theme declares ${name}`);
      assert.equal(parseColor(THEMES[theme].get(name))[3], 1, `${theme} ${name} is opaque`);
    }
    for (const name of TILE_LAYER_TOKENS) {
      assert.ok(THEMES[theme].has(name), `${theme} theme declares ${name}`);
      assert.doesNotThrow(() => parseColor(THEMES[theme].get(name)), `${theme} ${name} is a colour`);
    }
  }
  assert.ok(!THEMES.light.has('--color-tile-edge'), 'the flat edge is gone: the rim and bevel replace it');
  const numbers = new Set(NUMBER_TOKENS.map((n) => THEMES.light.get(n).toLowerCase()));
  assert.equal(numbers.size, 8, 'the eight light number colours are distinct');
});

// The 3D atlas's own palette (js/textures.js ATLAS), read from its source: the 3D
// renderer imports three.js and stays unthemed, so it is never imported here.
const ATLAS_SRC = readFileSync(new URL('../js/textures.js', import.meta.url), 'utf8');
const ATLAS = (() => {
  const at = ATLAS_SRC.indexOf('const ATLAS = Object.freeze({');
  assert.ok(at >= 0, 'js/textures.js declares its literal ATLAS palette');
  const body = ATLAS_SRC.slice(at, ATLAS_SRC.indexOf('});', at));
  return new Map([...body.matchAll(/(\w+): '([^']+)'/g)].map((m) => [m[1], m[2]]));
})();

test('light, the 2D tile looks like the 3D cube: each recipe token is the 3D atlas colour', async () => {
  const { shade } = await import('../js/tile-art.js');
  const FACE_SHADE = -0.06; // the atlas shades a revealed face 6% darker toward its bottom-right
  const same = {
    '--color-tile-rim': 'rim', '--color-tile-bevel-light': 'bevelLight', '--color-tile-bevel-dark': 'bevelDark',
    '--color-tile-closed': 'face', '--color-tile-flagged': 'face', '--color-tile-face-shade': 'faceShade',
    '--color-tile-gloss': 'gloss', '--color-tile-gloss-fade': 'glossFade',
    '--color-tile-revealed-rim': 'revealedRim', '--color-tile-revealed-edge': 'revealedEdge',
    '--color-tile-revealed': 'revealed', '--color-tile-mine': 'revealed', '--color-tile-wrong-flag': 'revealed',
    '--color-tile-exploded': 'exploded', '--color-tile-exploded-edge': 'explodedEdge',
    '--color-tile-mine-glyph': 'mine', '--color-tile-mine-highlight': 'mineHighlight',
    '--color-tile-flag': 'flag', '--color-tile-flag-shade': 'flagShade', '--color-tile-flag-shadow': 'flagShadow',
    '--color-tile-number-shadow': 'numberShadow',
    '--color-tile-wrong-flag-mark': 'wrongFlagMark', '--color-tile-wrong-flag-outline': 'wrongFlagOutline',
  };
  for (const [name, key] of Object.entries(same)) {
    assert.ok(ATLAS.has(key), `the atlas palette has ${key}`);
    assert.deepEqual(parseColor(THEMES.light.get(name)), parseColor(ATLAS.get(key)), `light ${name} is the atlas's ${key}`);
  }
  assert.equal(THEMES.light.get('--color-tile-revealed-shade'), shade(ATLAS.get('revealed'), FACE_SHADE), 'the revealed face shades as the atlas does');
  assert.equal(THEMES.light.get('--color-tile-exploded-shade'), shade(ATLAS.get('exploded'), FACE_SHADE), 'the exploded face shades as the atlas does');
});

test('dark, the recipe is drawn for the dark theme: every face and band differs from its light value', () => {
  for (const name of ['--color-tile-rim', '--color-tile-bevel-light', '--color-tile-bevel-dark', '--color-tile-closed', '--color-tile-face-shade',
    '--color-tile-revealed-rim', '--color-tile-revealed-edge', '--color-tile-revealed', '--color-tile-revealed-shade', '--color-tile-pressed']) {
    assert.notDeepEqual(parseColor(THEMES.dark.get(name)), parseColor(THEMES.light.get(name)), `dark ${name} differs`);
  }
});

test('token names are semantic, never named after a hue', () => {
  const hues = /(^|-)(red|green|blue|navy|sky|yellow|orange|amber|purple|pink|teal|cyan|gr[ae]y|white|black)(-|$)/;
  for (const name of THEMES.light.keys()) assert.doesNotMatch(name.slice(2), hues, name);
});

test('every colour token has both a light and a dark value', () => {
  const colours = (t) => [...t.keys()].filter((k) => k.startsWith('--color-')).sort();
  const light = colours(THEMES.light);
  assert.ok(light.length >= 14, 'the palette is declared on :root');
  assert.deepEqual(colours(THEMES.dark), light);
  for (const theme of ['light', 'dark']) {
    for (const name of light) assert.doesNotThrow(() => parseColor(THEMES[theme].get(name)), `${theme} ${name}`);
  }
});

test('the z-layers stack the overlays in order', () => {
  const z = (n) => Number(THEMES.light.get(`--z-${n}`));
  const order = ['hud', 'help', 'flash', 'overlay', 'modal', 'context-lost', 'toast', 'fatal'];
  for (let i = 1; i < order.length; i++) assert.ok(z(order[i]) > z(order[i - 1]), `${order[i]} above ${order[i - 1]}`);
  assert.equal(THEMES.light.get('--z-banner'), undefined, 'no layer for the removed end banner');
});

// ---------- contrast contract ----------
for (const theme of ['light', 'dark']) {
  test(`${theme}: body text meets 4.5:1 on every surface`, () => {
    const p = palette(theme);
    for (const ink of ['--color-ink', '--color-ink-muted']) {
      for (const [s, bg] of Object.entries(p.surfaces)) {
        const r = contrast(p.c(ink), bg);
        assert.ok(r >= 4.5, `${ink} on ${s}: ${r.toFixed(2)}:1`);
      }
    }
  });

  test(`${theme}: large text and essential UI glyphs meet 3:1 on every surface`, () => {
    const p = palette(theme);
    const glyphs = ['--color-accent', '--color-accent-strong', '--color-success', '--color-danger',
      '--color-warning', '--color-focus-ring'];
    for (const g of glyphs) {
      for (const [s, bg] of Object.entries(p.surfaces)) {
        const r = contrast(p.c(g), bg);
        assert.ok(r >= 3, `${g} on ${s}: ${r.toFixed(2)}:1`);
      }
    }
    const label = contrast(p.c('--color-accent-ink'), p.c('--color-accent'));
    assert.ok(label >= 3, `--color-accent-ink on --color-accent: ${label.toFixed(2)}:1`);
  });

  test(`${theme}: every number colour meets 4.5:1 on every point of the shaded revealed face`, () => {
    const t = THEMES[theme];
    for (const face of ['--color-tile-revealed', '--color-tile-revealed-shade']) {
      const bg = parseColor(t.get(face));
      for (const n of NUMBER_TOKENS) {
        const r = contrast(parseColor(t.get(n)), bg);
        assert.ok(r >= 4.5, `${n} on ${face}: ${r.toFixed(2)}:1`);
      }
    }
  });

  test(`${theme}: closed and revealed differ by relief and border: a bevel lit and shaded, a rim unlike the revealed rim`, () => {
    const t = THEMES[theme];
    const lum = (name) => luminance(parseColor(t.get(name)));
    assert.ok(lum('--color-tile-bevel-light') > lum('--color-tile-closed'), `${theme}: the lit bevel is lighter than the face`);
    assert.ok(lum('--color-tile-bevel-dark') < lum('--color-tile-face-shade'), `${theme}: the dark bevel is darker than the face`);
    assert.notDeepEqual(parseColor(t.get('--color-tile-rim')), parseColor(t.get('--color-tile-revealed-rim')), `${theme}: the rims differ`);
  });

  test(`${theme}: a scrolling board's shadow and scroll bar are translucent tokens; the bar meets 3:1 on every tile`, () => {
    const t = THEMES[theme];
    for (const name of ['--color-board-shadow', '--color-board-scrollbar']) {
      assert.ok(t.has(name), `${theme} theme declares ${name}`);
      const a = parseColor(t.get(name))[3];
      assert.ok(a > 0 && a < 1, `${theme} ${name} is translucent`);
    }
    const bar = parseColor(t.get('--color-board-scrollbar'));
    for (const bg of ['--color-tile-closed', '--color-tile-pressed', '--color-tile-revealed', '--color-tile-flagged']) {
      const under = parseColor(t.get(bg));
      const r = contrast(over(bar, under), under);
      assert.ok(r >= 3, `--color-board-scrollbar on ${bg}: ${r.toFixed(2)}:1`);
    }
  });

  test(`${theme}: the cursor ring meets 3:1 on the lit bevel it covers and every tile face it can sit on`, () => {
    const t = THEMES[theme];
    const ring = parseColor(t.get('--color-tile-cursor'));
    for (const bg of ['--color-tile-bevel-light', '--color-tile-closed', '--color-tile-face-shade', '--color-tile-pressed', '--color-tile-revealed']) {
      const r = contrast(ring, parseColor(t.get(bg)));
      assert.ok(r >= 3, `--color-tile-cursor on ${bg}: ${r.toFixed(2)}:1`);
    }
  });
}

// ---------- consumers ----------
test('style.css declares no variables of its own and reads only declared tokens', () => {
  const style = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(style, /(^|[;{\s])--[\w-]+\s*:/, 'style.css declares a custom property');
  for (const [, name] of style.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(THEMES.light.has(name), `style.css reads undeclared ${name}`);
  }
});

test('index.html loads the token sheet before the shell stylesheet', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const tokens = html.indexOf('href="css/tokens.css"');
  const style = html.indexOf('href="css/style.css"');
  assert.ok(tokens >= 0, 'index.html links css/tokens.css');
  assert.ok(style > tokens, 'css/tokens.css is linked before css/style.css');
});

// ---------- the 3D scene: themed sky, theme-independent cubes ----------
// The sky gradient's three stops (also the fog and clear colour). The light values are the scene's
// original sky, so the light theme's scene is unchanged.
const SCENE_TOKENS = {
  '--color-scene-horizon': [200, 225, 255],
  '--color-scene-zenith': [158, 194, 243],
  '--color-scene-nadir': [222, 236, 255],
};

test('every sky token has an opaque light and dark value, the light ones being the original sky', () => {
  for (const [name, original] of Object.entries(SCENE_TOKENS)) {
    for (const theme of ['light', 'dark']) {
      assert.ok(THEMES[theme].has(name), `${theme} theme declares ${name}`);
      assert.equal(parseColor(THEMES[theme].get(name))[3], 1, `${theme} ${name} is opaque`);
    }
    assert.deepEqual(parseColor(THEMES.light.get(name)).slice(0, 3), original, `light ${name} is the original sky`);
    assert.notDeepEqual(parseColor(THEMES.dark.get(name)), parseColor(THEMES.light.get(name)), `dark ${name} differs`);
  }
});

test('the dark sky sits with the dark backdrop: darker than the light sky, no lighter than the backdrop highlight', () => {
  const highlight = luminance(parseColor(THEMES.dark.get('--color-backdrop-highlight')));
  for (const name of Object.keys(SCENE_TOKENS)) {
    const dark = luminance(parseColor(THEMES.dark.get(name)));
    assert.ok(dark < luminance(parseColor(THEMES.light.get(name))), `dark ${name} is darker than the light one`);
    assert.ok(dark <= highlight, `dark ${name} is no lighter than --color-backdrop-highlight`);
  }
});

test('the 3D renderer reads no token: the shell hands it the scene palette', () => {
  for (const f of ['../js/render.js', '../js/textures.js', '../js/tile-art.js']) {
    const src = readFileSync(new URL(f, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /--color-|data-theme|getPropertyValue/, f);
  }
});

// ---------- scrims over the scene ----------
// The translucent tints laid over the scene: the Controls modal's backdrop, the pause / ready /
// results overlays and the context-lost screen. The light values are the original tints.
const SCRIM_TOKENS = {
  '--color-backdrop-scrim': [150, 185, 235, 0.4],
  '--color-backdrop-scrim-soft': [170, 200, 240, 0.35],
  '--color-backdrop-scrim-strong': [150, 185, 235, 0.55],
};

test('every backdrop-scrim token has a translucent light and dark value, the light ones being the original tints', () => {
  for (const [name, original] of Object.entries(SCRIM_TOKENS)) {
    for (const theme of ['light', 'dark']) {
      assert.ok(THEMES[theme].has(name), `${theme} theme declares ${name}`);
      const a = parseColor(THEMES[theme].get(name))[3];
      assert.ok(a > 0 && a < 1, `${theme} ${name} is translucent`);
    }
    assert.deepEqual(parseColor(THEMES.light.get(name)), original, `light ${name} is the original tint`);
    const dark = parseColor(THEMES.dark.get(name));
    assert.ok(luminance(dark) < luminance(parseColor(THEMES.dark.get('--color-ink'))), `dark ${name} is a dark tint`);
  }
});

// The declarations of the rule whose selector list is exactly `selector`.
function styleRule(style, selector) {
  const esc = selector.replace(/[.#()[\]]/g, '\\$&').replace(/,\s*/g, ',\\s*');
  const m = style.match(new RegExp(`(^|\\})\\s*${esc}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `style.css has a ${selector} rule`);
  return m[2];
}

test('the Controls modal and the overlay scrims take their colours from the tokens, with no literal colour', () => {
  const style = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const literal = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|\b(white|black)\b/i;
  const expect = {
    '.modal': [['background', '--color-backdrop-scrim']],
    '.modal-card': [['background', '--color-surface'], ['border', '--color-surface-border']],
    '#pause, #ready, #results': [['background', '--color-backdrop-scrim-soft']],
    '#ctx-lost': [['background', '--color-backdrop-scrim-strong']],
  };
  for (const [selector, props] of Object.entries(expect)) {
    const body = styleRule(style, selector);
    assert.doesNotMatch(body, literal, `${selector} carries no literal colour`);
    for (const [prop, name] of props) {
      assert.match(body, new RegExp(`(^|;)\\s*${prop}\\s*:[^;]*var\\(${name}\\)`), `${selector} ${prop} reads ${name}`);
    }
  }
});
