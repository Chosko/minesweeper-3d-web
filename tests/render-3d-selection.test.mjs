// The 3D selection and the win confetti drawn from the board module, DOM-free: the values the
// renderer derives for its selection uniforms (the outline, its width, the glow line inside it, its
// width and the selected face's tint) and for the confetti's colours are the module's, for Joyful
// tiles and for the fixture module, and js/render.js holds no selection or confetti colour of its
// own. tests/render-3d-feedback.test.mjs samples the drawing in a browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { register } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
// js/render.js imports 'three' through the page's import map; Node resolves it to the vendored build.
const THREE_URL = pathToFileURL(join(ROOT, 'vendor/three/three.module.min.js')).href;
register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, next) {
  return s === 'three' ? { url: ${JSON.stringify(THREE_URL)}, shortCircuit: true } : next(s, c);
}`)}`);
const { selectionUniforms, confettiColours } = await import('../js/render.js');
const { BOARD: JOYFUL } = await import('../themes/joyful-tiles/board.js');
const { BOARD: FIXTURE } = await import('./fixtures/themes/fixture-dusk/board.js');
const RENDER = readFileSync(join(ROOT, 'js/render.js'), 'utf8');

const unit = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const close = (got, want, what) => {
  assert.equal(got.length, want.length, `${what}: length`);
  got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 1e-6, `${what}[${i}]: ${v} is ${want[i]}`));
};

for (const [name, board] of [['Joyful tiles', JOYFUL], ['the fixture module', FIXTURE]]) {
  test(`the selection uniforms are ${name}'s: outline, width, glow line, its width and the face tint`, () => {
    const u = selectionUniforms(board);
    const s = board.selection;
    close(u.outline, unit(s.outline), 'outline');
    close(u.width, [s.width.face, s.width.px], 'width: a share of the face, a floor in px');
    close(u.glow, unit(s.glow), 'glow line');
    assert.equal(u.glowWidth, s.glowWidth, 'glow line width in px');
    close(u.tint, s.tint, 'selected face tint');
  });

  test(`the confetti colours are ${name}'s, cycled over the pieces`, () => {
    const n = 600;
    const col = confettiColours(board, n);
    assert.equal(col.length, n * 3);
    const pal = board.palette.confetti;
    for (let p = 0; p < n; p++) close([...col.subarray(p * 3, p * 3 + 3)], unit(pal[p % pal.length]), `piece ${p}`);
  });
}

test('the two modules differ, so the derived values follow the module handed in', () => {
  assert.notDeepEqual(selectionUniforms(JOYFUL), selectionUniforms(FIXTURE));
  assert.notDeepEqual([...confettiColours(JOYFUL, 7)], [...confettiColours(FIXTURE, 7)]);
});

test('Joyful tiles selects as J-3DSheet: navy outline at max(0.06 face, 3 px), a 1 px yellow glow line, a coral tint', () => {
  const u = selectionUniforms(JOYFUL);
  close(u.outline, unit('#16204a'), 'outline --color-ink');
  close(u.width, [0.06, 3], 'width');
  close(u.glow, unit('#ffc93c'), 'glow --color-head');
  assert.equal(u.glowWidth, 1);
  close(u.tint, [1, 0.86, 0.84], 'tint toward coral');
  close(confettiColours(JOYFUL, 7), ['#ff6b6b', '#ffc93c', '#49c6b8', '#78aaf8', '#6d4ee8', '#ffffff', '#ff8c42'].flatMap(unit),
    'coral, yellow, teal, blue, violet, white, orange');
});

test('js/render.js holds no selection or confetti colour of its own and rebuilds both on a board module', () => {
  const code = RENDER.replace(/\/\/.*$/gm, '');
  const frag = code.slice(code.indexOf('const FRAG ='), code.indexOf('const SKY_VERT'));
  // Every vec3 literal left in the cube shader is white or a cast; no colour.
  for (const [lit] of frag.matchAll(/vec3\(\s*-?[\d.]+\s*(,\s*-?[\d.]+\s*){2}\)/g)) {
    assert.match(lit, /^vec3\(\s*(0\.0|1\.0)\s*,\s*\1\s*,\s*\1\s*\)$/, `no constant colour in the cube shader: ${lit}`);
  }
  assert.match(frag, /uSelTint/, 'the selected face takes the module\'s tint');
  assert.match(frag, /uSelGlowColor/, 'the glow line takes the module\'s glow colour');
  assert.match(frag, /uSelGlowWidth/, 'at the module\'s glow width');
  assert.match(frag, /uSelOutline/, 'the outline the module\'s');
  const conf = code.slice(code.indexOf('\n  _buildConfetti() {'), code.indexOf('\n  }\n', code.indexOf('\n  _buildConfetti() {')));
  assert.ok(conf.length > 20, '_buildConfetti is defined');
  assert.doesNotMatch(conf, /\[\s*-?[\d.]+\s*,\s*-?[\d.]+\s*,\s*-?[\d.]+\s*\]/, 'no confetti palette of its own');
  const confShaders = code.slice(code.indexOf('const CONF_VERT'), code.indexOf('const CONF_FRAG'));
  assert.doesNotMatch(confShaders, /vec3\(\s*[\d.]+\s*,/, 'no colour in the confetti shader');
  const setBoard = code.slice(code.indexOf('\n  setBoard(board) {'), code.indexOf('\n  }\n', code.indexOf('\n  setBoard(board) {')));
  assert.match(setBoard, /selectionUniforms\(board\)/, 'the selection uniforms are rebuilt from the module');
  assert.match(setBoard, /confettiColours\(board/, 'and the confetti colours');
});
