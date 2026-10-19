// The theme board module: its shape and motion vocabulary (js/themes/board-module.js), the board
// conformance checks proved against broken fixture board modules, and Joyful tiles' module
// (themes/joyful-tiles/board.js) holding the canvas's values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CELL_EVENTS, MOTION_PROPERTIES, NAMED_EASINGS, FACE_ENTRIES, BOARD_ENTRIES, checkBoardModule,
} from '../js/themes/board-module.js';
import { STYLES } from '../js/tile-art.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { THEMES } from '../js/themes/registry.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const JOYFUL_ENTRY = THEMES.find((t) => t.id === 'joyful-tiles');

// A deep, unfrozen copy to break one thing in.
const copy = () => structuredClone(JOYFUL);
const has = (problems, check, subject) => problems.some((p) => p.check === check && p.subject === subject);

// ---------------------------------------------------------------- the shape

test('the shape names the cell events, the motion vocabulary and the named easings', () => {
  assert.deepEqual([...CELL_EVENTS], ['press', 'release', 'reveal', 'flag', 'unflag', 'chordPress', 'solvedPulse']);
  assert.deepEqual([...MOTION_PROPERTIES], ['scale', 'offset', 'rotation', 'depth', 'brightness', 'opacity']);
  assert.ok(NAMED_EASINGS.includes('linear') && NAMED_EASINGS.includes('ease-out'));
  assert.deepEqual(Object.keys(FACE_ENTRIES).sort(), ['closed', 'exploded', 'marked', 'revealed', 'sunk']);
  for (const face of ['closed', 'sunk', 'marked']) assert.deepEqual([...FACE_ENTRIES[face]], ['rim', 'bevelLight', 'bevelDark', 'face']);
  for (const face of ['revealed', 'exploded']) assert.deepEqual([...FACE_ENTRIES[face]], ['rim', 'edge', 'face']);
});

test('the palette entries cover every entry the feature document lists', () => {
  for (const path of [
    'palette.faces2d.closed.face', 'palette.faces2d.closed.bevelLight', 'palette.faces2d.closed.bevelDark',
    'palette.faces2d.sunk.face', 'palette.faces2d.revealed.face', 'palette.faces2d.revealed.rim',
    'palette.faces3d.closed.face', 'palette.faces3d.revealed.face', 'palette.faces3d.exploded.face',
    'palette.flag.base', 'palette.flag.cloth', 'palette.mine.body', 'palette.cross.mark', 'palette.boardGround',
    'palette.confetti', 'cursor.color', 'cursor.radius.tile', 'cursor.radius.px',
    'selection.outline', 'selection.width.face', 'selection.width.px', 'selection.glow', 'selection.tint', 'mark.tint',
  ]) assert.ok(BOARD_ENTRIES.includes(path), path);
});

// ---------------------------------------------------------------- the checks bite

const BROKEN = [
  ['a missing palette entry', (b) => { delete b.palette.flag.cloth; }, ['palette', 'palette.flag.cloth']],
  ['a missing 2D face palette', (b) => { delete b.palette.faces2d.revealed; }, ['palette', 'palette.faces2d.revealed.face']],
  ['a low-contrast number', (b) => { b.numbers[3] = '#c8bfb0'; }, ['contrast', 'numbers[3]']],
  ['only 25 number colours', (b) => { b.numbers.length = 26; }, ['numbers', 'numbers[26]']],
  ['an unknown style', (b) => { b.style2d.name = 'glass'; }, ['style', 'style2d']],
  ['a missing 3D style', (b) => { delete b.style3d; }, ['style', 'style3d']],
  ['a style missing one of its parameters', (b) => { delete b.style3d.params.slope; }, ['style', 'style3d.params.slope']],
  ['a 2D style without its gap', (b) => { delete b.style2d.params.gap; }, ['style', 'style2d.params.gap']],
  ['a motion track outside the vocabulary', (b) => { b.motion.flag.tracks[0].property = 'wobble'; }, ['motion', 'motion.flag.tracks[0]']],
  ['a motion description with no duration', (b) => { b.motion.press.duration = 0; }, ['motion', 'motion.press.duration']],
  ['an unknown easing', (b) => { b.motion.release.easing = 'bounce'; }, ['motion', 'motion.release.easing']],
  ['a keyframe past the duration', (b) => { b.motion.unflag.tracks[0].keyframes.push({ at: 999, value: 1 }); }, ['motion', 'motion.unflag.tracks[0]']],
  ['a missing cell event', (b) => { delete b.motion.chordPress; }, ['motion', 'motion.chordPress']],
  ['a closed face that differs from the revealed one by colour alone', (b) => { b.style3d.params.slope = 0; }, ['relief', 'style3d']],
  ['a revealed face the number contrast cannot be measured on', (b) => { b.palette.faces3d.revealed.face = 'rgba(243,240,234,1)'; b.numbers[3] = '#e8e0d0'; }, ['contrast', 'numbers[3]']],
  ['a cursor ring in a colour the contrast cannot be measured on', (b) => { b.cursor.color = 'rgba(240,236,230,1)'; }, ['contrast', 'cursor.color']],
  ['a cursor ring too faint on the revealed face', (b) => { b.cursor.color = '#e6e0d6'; }, ['contrast', 'cursor.color']],
  ['a selection outline too faint on the closed face', (b) => { b.selection.outline = '#80b0f8'; }, ['contrast', 'selection.outline']],
  ['a relief thinner than a pixel at the minimum tile size', (b) => { b.style2d.params.band = 0.01; b.style2d.params.edge = 0.01; }, ['legible', 'style2d']],
  ['a number font the theme does not ship', (b) => { b.font.weight = 300; }, ['font', 'font']],
  ['a missing sky colour', (b) => { delete b.sky.zenith; }, ['sky', 'sky.zenith']],
];

for (const [name, breakIt, [check, subject]] of BROKEN) {
  test(`the board checks catch ${name}`, () => {
    const board = copy();
    breakIt(board);
    const problems = checkBoardModule(board, { fonts: JOYFUL_ENTRY.fonts });
    assert.ok(has(problems, check, subject), `${check} ${subject} is caught (${JSON.stringify(problems.slice(0, 5))})`);
  });
}

test('the board checks report a module that is not an object, and never throw on a broken one', () => {
  assert.ok(checkBoardModule(undefined).length > 0);
  assert.ok(checkBoardModule({}).length > 0);
  assert.ok(has(checkBoardModule({}), 'style', 'style2d'));
  const board = copy();
  board.motion.reveal = { duration: 160, easing: 'linear', tracks: 'nope' };
  assert.ok(has(checkBoardModule(board), 'motion', 'motion.reveal.tracks'));
});

test('a motion entry of null leaves the event still', () => {
  const board = copy();
  board.motion.unflag = null;
  assert.deepEqual(checkBoardModule(board, { fonts: JOYFUL_ENTRY.fonts }), []);
});

test('the legibility check reads the shared minimum tile size', () => {
  const board = copy();
  board.style2d.params.band = 0.5 / MIN_TILE_SIZE;
  board.style2d.params.edge = 0.5 / MIN_TILE_SIZE;
  assert.ok(has(checkBoardModule(board), 'legible', 'style2d'));
  assert.ok(!has(checkBoardModule(board, { minTileSize: MIN_TILE_SIZE * 4 }), 'legible', 'style2d'));
});

// ---------------------------------------------------------------- Joyful tiles

test('Joyful tiles passes the board checks', () => {
  assert.deepEqual(checkBoardModule(JOYFUL, { fonts: JOYFUL_ENTRY.fonts }), []);
  assert.ok(Object.isFrozen(JOYFUL), 'the module is frozen');
});

test('Joyful tiles draws flat 2D tiles with a radius and gap that scale with the tile', () => {
  const { name, params } = JOYFUL.style2d;
  assert.equal(name, 'flat');
  for (const p of Object.keys(STYLES.flat.params)) assert.ok(p in params, `flat ${p}`);
  assert.equal(params.radius, 0.15);
  assert.equal(params.gap, 0.09);
  assert.equal(params.frameRadius, 0.3);
  assert.deepEqual({ ...JOYFUL.cursor.radius }, { tile: 0.15, px: 3 });
  assert.equal(JOYFUL.cursor.color, '#16204a');
  const f = JOYFUL.palette.faces2d;
  assert.deepEqual([f.closed.face, f.closed.bevelLight, f.closed.bevelDark], ['#78aaf8', '#a9c9fb', '#2b56b5']);
  assert.deepEqual([f.revealed.face, f.revealed.rim], ['#f3f0ea', '#ddd3c1']);
  assert.equal(f.sunk.face, '#6b9ef2');
  assert.equal(f.exploded.face, '#ff6b6b');
  assert.equal(f.marked.face, '#49c6b8');
});

test('Joyful tiles draws "Bevel 5 %" 3D cubes', () => {
  const { name, params } = JOYFUL.style3d;
  assert.equal(name, 'bevel');
  assert.equal(params.slope, 0.05);
  assert.equal(params.edge, 0.028);
  assert.equal(params.revealedEdge, params.edge, 'revealed cubes are flat inside their edge');
  const c = JOYFUL.palette.faces3d.closed;
  assert.deepEqual([c.face, c.rim, c.bevelLight, c.bevelDark], ['#78aaf8', '#4a7bdb', '#b3d0fc', '#5385e4']);
  assert.deepEqual([JOYFUL.palette.faces3d.revealed.face, JOYFUL.palette.faces3d.revealed.rim], ['#f3f0ea', '#ddd3c1']);
  assert.deepEqual([JOYFUL.palette.faces3d.exploded.face, JOYFUL.palette.faces3d.exploded.rim], ['#ff6b6b', '#c9403f']);
  assert.deepEqual({ ...JOYFUL.sky }, { horizon: '#2b3f8a', zenith: '#0e1640', nadir: '#1a265f', fog: '#2b3f8a' });
});

test('Joyful tiles carries the 3D sheet\'s numbers, selection and confetti', () => {
  assert.equal(JOYFUL.numbers.length, 27);
  assert.deepEqual(JOYFUL.numbers.slice(1, 9), ['#135bad', '#26692a', '#ac2626', '#1a237e', '#8d1c1c', '#00656f', '#212121', '#5c5c5c']);
  assert.equal(JOYFUL.numbers[26], '#256a08');
  assert.deepEqual({ ...JOYFUL.font }, { family: 'Rubik', weight: 800 });
  const s = JOYFUL.selection;
  assert.equal(s.outline, '#16204a');
  assert.deepEqual({ ...s.width }, { face: 0.06, px: 3 });
  assert.equal(s.glow, '#ffc93c');
  assert.equal(s.glowWidth, 1);
  assert.deepEqual([...s.tint], [1, 0.86, 0.84]);
  assert.deepEqual([...JOYFUL.palette.confetti], ['#ff6b6b', '#ffc93c', '#49c6b8', '#78aaf8', '#6d4ee8', '#ffffff', '#ff8c42']);
});

test('Joyful tiles animates every cell event from the board sheet\'s keyframes and the 3D sheet\'s pulse', () => {
  for (const event of CELL_EVENTS) assert.ok(JOYFUL.motion[event], event);
  assert.equal(JOYFUL.motion.press.duration, 90);
  assert.equal(JOYFUL.motion.release.duration, 140);
  assert.equal(JOYFUL.motion.reveal.duration, 160);
  assert.equal(JOYFUL.motion.flag.duration, 180);
  assert.equal(JOYFUL.motion.unflag.duration, 120);
  assert.equal(JOYFUL.motion.chordPress.duration, 90);
  assert.equal(JOYFUL.motion.solvedPulse.duration, 450);
  const scale = JOYFUL.motion.solvedPulse.tracks.find((t) => t.property === 'scale');
  assert.equal(Math.max(...scale.keyframes.map((k) => k.value)), 1.15, 'the reference pulse peaks at 1.15');
});

test('every value of Joyful tiles\' board module names the artboard it came from', () => {
  const src = readFileSync(`${ROOT}themes/joyful-tiles/board.js`, 'utf8');
  const lines = src.split('\n').filter((l) => !/^\s*(\/\*|\*)/.test(l));
  const holdsValue = (l) => /#[0-9a-f]{6}|:\s*-?\.?\d|:\s*['"[]|^\s*(null|['"])/i.test(l.replace(/\/\*.*?\*\//g, ''));
  const valued = lines.filter((l) => holdsValue(l) && !/[{[]\s*$/.test(l));
  assert.ok(valued.length > 40);
  for (const line of valued) assert.match(line, /\/\*[^*]*\bJ-(BoardSheet|3DSheet|Tokens)\b[^*]*\*\/\s*$/, line.trim());
});
