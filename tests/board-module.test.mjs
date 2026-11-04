// The theme board module: its shape and motion vocabulary (js/themes/board-module.js), the board
// conformance checks proved against broken fixture board modules, and Joyful tiles' module
// (themes/joyful-tiles/board.js) holding the canvas's values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CELL_EVENTS, MOTION_PROPERTIES, NAMED_EASINGS, FACE_ENTRIES, BOARD_ENTRIES, GRID_NUMBERS, checkBoardModule,
} from '../js/themes/board-module.js';
import { STYLES, mix } from '../js/tile-art.js';
import { MIN_TILE_SIZE } from '../js/classic2d/tile-skin.js';
import { THEMES } from '../js/themes/registry.js';
import { BOARD as JOYFUL } from '../themes/joyful-tiles/board.js';
import { createCellMotion } from '../js/cell-motion.js';
import { createGeometry } from '../js/geometry/index.js';

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
    'palette.confetti', 'end2d.light', 'end2d.win.scale', 'end2d.win.mix', 'end2d.loss.scale', 'end2d.loss.flash', 'cursor.color', 'cursor.radius.tile', 'cursor.radius.px',
    'palette.faces2d.marked.ring', 'cursor.inner', 'cursor.innerWidth',
    'selection.outline', 'selection.width.face', 'selection.width.px', 'selection.glow', 'selection.tint', 'mark.tint',
  ]) assert.ok(BOARD_ENTRIES.includes(path), path);
});

// ---------------------------------------------------------------- the checks bite

const BROKEN = [
  ['a missing palette entry', (b) => { delete b.palette.flag.cloth; }, ['palette', 'palette.flag.cloth']],
  ['a marked start cell without its ring', (b) => { delete b.palette.faces2d.marked.ring; }, ['palette', 'palette.faces2d.marked.ring']],
  ['a cursor ring without its inner band\'s width', (b) => { b.cursor.innerWidth = '2px'; }, ['palette', 'cursor.innerWidth']],
  ['a flat style without its pressed shade', (b) => { delete b.style2d.params.press; }, ['style', 'style2d.params.press']],
  ['a missing 2D face palette', (b) => { delete b.palette.faces2d.revealed; }, ['palette', 'palette.faces2d.revealed.face']],
  ['a low-contrast 3D number', (b) => { b.numbers3d[3] = '#c8bfb0'; }, ['contrast', 'numbers3d[3]']],
  ['only 25 3D number colours', (b) => { b.numbers3d.length = 26; }, ['numbers', 'numbers3d[26]']],
  ['a low-contrast 2D number', (b) => { b.numbers2d[2] = '#c8bfb0'; }, ['contrast', 'numbers2d[2]']],
  ['only 7 2D number colours', (b) => { b.numbers2d.length = 8; }, ['numbers', 'numbers2d[8]']],
  ['only 11 2D number colours, short of the triangle\'s 12', (b) => { b.numbers2d.length = 12; }, ['numbers', 'numbers2d[12]']],
  ['a low-contrast 2D number only a triangle shows', (b) => { b.numbers2d[11] = '#c8bfb0'; }, ['contrast', 'numbers2d[11]']],
  ['a hexagon grid without its gap', (b) => { delete b.style2d.grids.hex.gap; }, ['style', 'style2d.grids.hex.gap']],
  ['a triangle grid without its corner radius', (b) => { delete b.style2d.grids.tri.radius; }, ['style', 'style2d.grids.tri.radius']],
  ['a negative hexagon corner radius', (b) => { b.style2d.grids.hex.radius = -0.05; }, ['style', 'style2d.grids.hex.radius']],
  ['a 2D style with no per-grid shape', (b) => { delete b.style2d.grids; }, ['style', 'style2d.grids.tri.gap']],
  ['a 2D number too faint on the 2D revealed face', (b) => { b.palette.faces2d.revealed.face = '#5c6bc0'; }, ['contrast', 'numbers2d[1]']],
  ['a missing 2D end effect value', (b) => { delete b.end2d.win.scale; }, ['palette', 'end2d.win.scale']],
  ['a 2D end effect light the canvas cannot fill with', (b) => { b.end2d.light = 'white'; }, ['palette', 'end2d.light']],
  ['a bevel side that is neither a shade nor a colour', (b) => { b.style3d.params.sides.right = 'blue'; }, ['style', 'style3d.params.sides']],
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
  ['a revealed face the number contrast cannot be measured on', (b) => { b.palette.faces3d.revealed.face = 'rgba(243,240,234,1)'; b.numbers3d[3] = '#e8e0d0'; }, ['contrast', 'numbers3d[3]']],
  ['a cursor ring in a colour the contrast cannot be measured on', (b) => { b.cursor.color = 'rgba(240,236,230,1)'; }, ['contrast', 'cursor.color']],
  ['a cursor ring too faint on the revealed face', (b) => { b.cursor.color = '#e6e0d6'; }, ['contrast', 'cursor.color']],
  ['a selection outline too faint on the closed face', (b) => { b.selection.outline = '#80b0f8'; }, ['contrast', 'selection.outline']],
  ['a relief thinner than a pixel at the minimum tile size', (b) => { b.style2d.params.band = 0.01; b.style2d.params.edge = 0.01; }, ['legible', 'style2d']],
  ['a number font the theme does not ship', (b) => { b.font.weight = 300; }, ['font', 'font']],
  ['a missing sky colour', (b) => { delete b.sky.zenith; }, ['sky', 'sky.zenith']],
  ['a start-cell tint the 3D renderer cannot read', (b) => { b.mark.tint = 'rgb(73, 198, 184)'; }, ['palette', 'mark.tint']],
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
  assert.ok(!has(checkBoardModule(board, { floors: { square: MIN_TILE_SIZE * 4 } }), 'legible', 'style2d'));
});

test('each flat grid shows the numbers up to its most neighbours, and the 2D list covers them all', () => {
  assert.deepEqual({ ...GRID_NUMBERS }, { square: 8, hex: 6, tri: 12 });
  const board = copy();
  board.numbers2d.length = 13;
  assert.deepEqual(checkBoardModule(board, { fonts: JOYFUL_ENTRY.fonts }), [], 'numbers 1–12 are all the 2D list needs');
});

test('the relief stays legible at each flat grid\'s own floor: the hexagon at the square\'s, the triangle at its height on its own side', () => {
  const hexFloor = createGeometry('hex', 1, 1).minTile;
  const triFloor = (createGeometry('tri', 1, 1).minTile * Math.sqrt(3)) / 2;
  assert.equal(hexFloor, MIN_TILE_SIZE);
  // A relief a pixel wide at the triangle's floor height, under one at the square's floor.
  const board = copy();
  board.style2d.params.band = 1 / triFloor;
  board.style2d.params.edge = 1 / triFloor;
  let problems = checkBoardModule(board, { fonts: JOYFUL_ENTRY.fonts });
  assert.ok(has(problems, 'legible', 'style2d'), 'the square floor');
  assert.ok(has(problems, 'legible', 'style2d.grids.hex'), 'the hexagon floor, across the flats');
  assert.ok(!has(problems, 'legible', 'style2d.grids.tri'), 'the triangle floor, its height');
  problems = checkBoardModule(board, { fonts: JOYFUL_ENTRY.fonts, floors: { tri: triFloor / 2 } });
  assert.ok(has(problems, 'legible', 'style2d.grids.tri'), 'a floor passed in is the one read');
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
  assert.equal(f.marked.ring, '#16204a', 'J-BoardSheet .t.mk::before: a dashed ink ring');
  assert.deepEqual([params.press, params.hairline, params.border], [0.08, 1, 2], 'J-BoardSheet .t.p tile × .08, .t.o 1px, .t.b 2px');
  assert.deepEqual([JOYFUL.cursor.width, JOYFUL.cursor.inner, JOYFUL.cursor.innerWidth], [3, '#ffffff', 2], 'J-BoardSheet .t.cur: a 3px ring round a 2px white band');
  assert.equal(JOYFUL.palette.mine.body, '#16204a', 'the mine in ink');
  assert.equal(JOYFUL.palette.mine.highlight, '#ffffff', 'its highlight opaque white');
  assert.equal(JOYFUL.palette.cross.mark, '#c62f2f', 'the wrong-flag cross in its own red, not --color-danger');
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

test('each number list is measured on its own mode\'s revealed face: the 3D list on every point of it, the 2D list on the face its glyph sits on', () => {
  const board = copy();
  board.palette.faces3d.revealed.face = '#5c6bc0';
  let problems = checkBoardModule(board, { fonts: JOYFUL_ENTRY.fonts });
  assert.ok(has(problems, 'contrast', 'numbers3d[1]'), 'the 3D list on the 3D face');
  assert.ok(!problems.some((p) => p.subject.startsWith('numbers2d')), 'the 2D list is not measured on the 3D face');
  const rim = copy();
  rim.palette.faces3d.revealed.rim = '#5c6bc0';
  assert.ok(has(checkBoardModule(rim, { fonts: JOYFUL_ENTRY.fonts }), 'contrast', 'numbers3d[1]'), 'the 3D list on the 3D border too');
  const hairline = copy();
  hairline.palette.faces2d.revealed.rim = '#5c6bc0';
  hairline.palette.faces2d.revealed.edge = '#5c6bc0';
  problems = checkBoardModule(hairline, { fonts: JOYFUL_ENTRY.fonts });
  assert.ok(!problems.some((p) => p.subject.startsWith('numbers2d')), 'the 2D hairline holds no glyph');
});

test('Joyful tiles carries the board sheet\'s 2D numbers: the --color-number-1..8 tokens, then the triangle sheet\'s 9–12 in the 3D hues of the same numbers', () => {
  assert.equal(JOYFUL.numbers2d.length, 13);
  assert.equal(JOYFUL.numbers2d[0], null);
  assert.deepEqual(JOYFUL.numbers2d.slice(1, 9), ['#1565c0', '#2b742f', '#c32727', '#1a237e', '#8d1c1c', '#00717c', '#212121', '#666666']);
  assert.deepEqual(JOYFUL.numbers2d.slice(9), ['#761895', '#5b5f07', '#166187', '#a10c44']);
  assert.deepEqual(JOYFUL.numbers2d.slice(9), JOYFUL.numbers3d.slice(9, 13), 'a number has one colour in every mode');
});

test('Joyful tiles carries the hexagon and triangle sheets\' kept "B · Sharp" shape, and every other 2D value is the square\'s', () => {
  const { grids, params } = JOYFUL.style2d;
  assert.deepEqual({ ...grids.hex }, { gap: 0.06, radius: 0.05 }, 'J-HexSheet: gap 6 %, radius 5 % of the tile across the flats');
  assert.deepEqual({ ...grids.tri }, { gap: 0.06, radius: 0.06 }, 'J-TriSheet: gap 6 %, radius 6 % of the tile height');
  assert.deepEqual([params.gap, params.radius], [0.09, 0.15], 'the square keeps the board sheet\'s');
  assert.deepEqual(Object.keys(JOYFUL.style2d).sort(), ['grids', 'name', 'params']);
  assert.deepEqual(Object.keys(JOYFUL.style3d).sort(), ['name', 'params'], 'the 3D style has no per-grid shape');
});

test('Joyful tiles carries the 3D sheet\'s Classic 2D end effect: a win wave bumping and lightening each tile, a loss wave snapping it in with a flash', () => {
  const e = JOYFUL.end2d;
  assert.equal(e.light, '#ffffff');
  assert.deepEqual({ ...e.win }, { scale: 1.2, mix: 0.4 });
  assert.deepEqual({ ...e.loss }, { scale: 0.55, flash: 0.55 });
});

test('Joyful tiles\' closed cube is lit from the top left with the 3D sheet\'s exact side colours', () => {
  const c = JOYFUL.palette.faces3d.closed;
  const { sides } = JOYFUL.style3d.params;
  assert.equal(sides.top, 1, 'top: the light bevel');
  assert.equal(sides.bottom, -1, 'bottom: the dark bevel');
  assert.equal(sides.right, '#5e92ec', 'right: the sheet\'s colour, which no mix of the face and the dark bevel gives');
  assert.equal(mix(c.face, c.bevelLight, sides.left), '#98befa', 'left: mixed from the face');
});

test('Joyful tiles carries the 3D sheet\'s numbers, selection and confetti', () => {
  assert.equal(JOYFUL.numbers3d.length, 27);
  assert.deepEqual(JOYFUL.numbers3d.slice(1, 9), ['#135bad', '#26692a', '#ac2626', '#1a237e', '#8d1c1c', '#00656f', '#212121', '#5c5c5c']);
  assert.equal(JOYFUL.numbers3d[26], '#256a08');
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

// Each Joyful tiles cell event played on the player, sampled at the board sheet's keyframe times:
// the face shown, offset y (in tiles: 3 px at a 56 px tile ≈ .054), scale, brightness and opacity.
function joyfulAt(event, ms) {
  const p = createCellMotion({ now: () => 0 });
  p.start(0, event, 'before', 'after', JOYFUL.motion[event]);
  const v = p.valuesAt(ms).get(0);
  return v && { face: v.face, y: v.offset.y, scale: v.scale, brightness: v.brightness, opacity: v.opacity };
}
const pose = (event, ms, expected) => {
  const v = joyfulAt(event, ms);
  for (const [k, want] of Object.entries(expected)) {
    if (k === 'face') assert.equal(v.face, want, `${event} at ${ms} ms: face`);
    else assert.ok(Math.abs(v[k] - want) < 1e-6, `${event} at ${ms} ms: ${k} ${v[k]} ≠ ${want}`);
  }
};
const REST = { y: 0, scale: 1, brightness: 1, opacity: 1 };
const PRESSED_POSE = { y: 0.054, scale: 0.96 };

test('Joyful tiles keys the board sheet\'s press, release and chord press on offset, scale, brightness and the face cut', () => {
  pose('press', 0, { face: 'before', ...REST });
  pose('press', 45, { face: 'before', y: 0.04, scale: 0.98, brightness: 0.97 });
  pose('press', 89, { face: 'before' });
  pose('release', 0, { ...PRESSED_POSE, brightness: 1 });
  pose('release', 90, { y: -0.02, scale: 1.03, brightness: 1.04 });
  pose('chordPress', 0, { face: 'before', ...REST });
  pose('chordPress', 89, { face: 'before' });
  for (const event of ['press', 'chordPress']) {
    const cut = JOYFUL.motion[event].tracks.find((t) => t.property === 'rotation' && t.flip);
    assert.ok(cut, `${event} cuts from the closed face to the pressed face`);
    assert.equal(cut.keyframes[0].at + cut.keyframes.at(-1).at, 2 * 90, `${event} cuts at the pressed face's 90 ms`);
    const last = (property) => JOYFUL.motion[event].tracks.find((t) => t.property === property).keyframes.at(-1);
    assert.deepEqual([last('offset').at, last('offset').value.y], [90, 0.054], `${event} ends in the pressed pose`);
    assert.deepEqual([last('scale').at, last('scale').value], [90, 0.96]);
  }
  const brightness = JOYFUL.motion.chordPress.tracks.find((t) => t.property === 'brightness').keyframes.at(-1);
  assert.deepEqual([brightness.at, brightness.value], [90, 0.96]);
  const releaseEnd = JOYFUL.motion.release.tracks.filter((t) => t.property !== 'depth').map((t) => t.keyframes.at(-1));
  assert.ok(releaseEnd.every((k) => k.at === 140 && (k.value === 1 || k.value?.y === 0)), 'release rests at 140 ms');
});

test('Joyful tiles keys the board sheet\'s reveal, flag and unflag on opacity and brightness, cuts as shipped', () => {
  pose('reveal', 0, { face: 'before', ...PRESSED_POSE, brightness: 1, opacity: 1 });
  pose('reveal', 59, { face: 'before' });
  pose('reveal', 60, { face: 'after', y: 0, opacity: 0.6, scale: 0.82, brightness: 1.12 });
  pose('reveal', 120, { opacity: 1, brightness: 1.04, scale: 1.04 });
  pose('flag', 79, { face: 'before' });
  pose('flag', 80, { face: 'after', y: -0.15, scale: 1.18, brightness: 1.08 });
  pose('unflag', 59, { face: 'before' });
  pose('unflag', 60, { face: 'after', scale: 0.9, brightness: 1.06 });
  for (const [event, end] of [['reveal', 160], ['flag', 180], ['unflag', 120]]) {
    for (const t of JOYFUL.motion[event].tracks.filter((x) => x.property !== 'rotation')) {
      const k = t.keyframes.at(-1);
      assert.ok(k.at <= end && (k.value === 1 || k.value?.y === 0), `${event}.${t.property} rests by ${end} ms`);
    }
  }
  const easings = Object.fromEntries(['press', 'release', 'reveal', 'flag', 'unflag', 'chordPress'].map((e) => [e, JOYFUL.motion[e].easing.join()]));
  const OUT = '0.2,0.8,0.2,1', SPRING = '0.34,1.56,0.64,1';
  assert.deepEqual(easings, { press: OUT, release: SPRING, reveal: SPRING, flag: SPRING, unflag: OUT, chordPress: OUT });
});

test('every value of Joyful tiles\' board module names the artboard it came from', () => {
  const src = readFileSync(`${ROOT}themes/joyful-tiles/board.js`, 'utf8');
  const lines = src.split('\n').filter((l) => !/^\s*(\/\*|\*)/.test(l));
  const holdsValue = (l) => /#[0-9a-f]{6}|:\s*-?\.?\d|:\s*['"[]|^\s*(null|['"])/i.test(l.replace(/\/\*.*?\*\//g, ''));
  const valued = lines.filter((l) => holdsValue(l) && !/[{[]\s*$/.test(l));
  assert.ok(valued.length > 40);
  for (const line of valued) assert.match(line, /\/\*[^*]*\bJ-(BoardSheet|3DSheet|HexSheet|TriSheet|Tokens)\b[^*]*\*\/\s*$/, line.trim());
});
