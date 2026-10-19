/* Joyful tiles board module: everything the Classic 2D tile skin and the 3D renderer draw this theme
   with, in the shape js/themes/board-module.js documents (feature themed-board-art-and-motion). Every value is the canvas's (page "Joyful
   tiles"): the 2D tiles and the cell motion from J-BoardSheet, the 3D cubes ("Bevel 5 %"), numbers,
   sky, selection, start-cell tint, confetti and solved pulse from J-3DSheet, colours and easings
   named by token from J-Tokens. The theme applier loads it and hands it to its subscribers. */

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

const INK = '#16204a'; /* J-Tokens --color-ink */
const EASE_OUT = [0.2, 0.8, 0.2, 1]; /* J-Tokens --easing-out */
const EASE_SPRING = [0.34, 1.56, 0.64, 1]; /* J-Tokens --easing-spring */
/* A flip whose angle stays 0: the cell cuts from its state before the event to its state after
   at the track's midpoint, halfway between these two keyframes. */
const cut = (end) => ({ property: 'rotation', axis: [1, 0, 0], flip: true, keyframes: [{ at: 0, value: 0 }, { at: end, value: 0 }] }); /* J-BoardSheet face change */

export const BOARD = freeze({
  palette: {
    faces2d: {
      closed: { rim: '#2b56b5', bevelLight: '#a9c9fb', bevelDark: '#2b56b5', face: '#78aaf8' }, /* J-BoardSheet .t.c (tile-closed, -closed-top, -closed-edge) */
      sunk: { rim: '#2b56b5', bevelLight: '#a9c9fb', bevelDark: 'rgba(22,32,74,0.2)', face: '#6b9ef2' }, /* J-BoardSheet .t.p (tile-pressed, shade-press) */
      revealed: { rim: '#ddd3c1', edge: '#ddd3c1', face: '#f3f0ea' }, /* J-BoardSheet .t.o (tile-open, -open-border) */
      exploded: { rim: '#c9403f', edge: '#c9403f', face: '#ff6b6b' }, /* J-BoardSheet .t.b (tile-boom, -boom-edge) */
      marked: { rim: '#2a9488', bevelLight: 'rgba(255,255,255,0.32)', bevelDark: '#2a9488', face: '#49c6b8' }, /* J-BoardSheet .t.mk (tile-mark, highlight, teal-edge) */
    },
    faces3d: {
      closed: { rim: '#4a7bdb', bevelLight: '#b3d0fc', bevelDark: '#5385e4', face: '#78aaf8' }, /* J-3DSheet atlas: edge, top and bottom bevel, face */
      sunk: { rim: '#4a7bdb', bevelLight: '#b3d0fc', bevelDark: '#5385e4', face: '#78aaf8' }, /* J-3DSheet atlas: the closed cube pressed in */
      revealed: { rim: '#ddd3c1', edge: '#ddd3c1', face: '#f3f0ea' }, /* J-3DSheet atlas: flat cream inside its edge */
      exploded: { rim: '#c9403f', edge: '#c9403f', face: '#ff6b6b' }, /* J-3DSheet atlas: the exploded mine's coral face and edge */
    },
    flag: { base: '#1b1b1b', shadow: 'rgba(0,0,0,0.25)', cloth: '#ff3b30', clothShade: '#c4161c' }, /* J-BoardSheet flag (the game's final flag glyph) */
    mine: { body: INK, highlight: 'rgba(255,255,255,0.85)' }, /* J-BoardSheet mine in ink */
    cross: { outline: 'rgba(255,255,255,0.95)', mark: '#b42a2a' }, /* J-BoardSheet wrong-flag cross in danger (J-Tokens --color-danger) */
    numberShadow: 'rgba(0,0,0,0.12)', /* J-BoardSheet number glyph shadow */
    boardGround: '#ffffff', /* J-BoardSheet .j-board (board-frame) between the tiles */
    confetti: ['#ff6b6b', '#ffc93c', '#49c6b8', '#78aaf8', '#6d4ee8', '#ffffff', '#ff8c42'], /* J-3DSheet confetti: coral, yellow, teal, blue, violet, white, orange */
  },
  numbers: [
    null, /* J-3DSheet numbers start at 1 */
    '#135bad', '#26692a', '#ac2626', '#1a237e', '#8d1c1c', '#00656f', '#212121', '#5c5c5c', /* J-3DSheet numbers 1–8 */
    '#761895', '#5b5f07', '#166187', '#a10c44', '#186912', '#3810d1', '#874e16', '#086854', '#a21b98', /* J-3DSheet numbers 9–17 */
    '#426608', '#1c4bab', '#b90e15', '#116a28', '#6b0eb9', '#695a11', '#096573', '#ab1c6f', '#256a08', /* J-3DSheet numbers 18–26 */
  ],
  font: { family: 'Rubik', weight: 800 }, /* J-BoardSheet numbers in Rubik 800 */
  sky: { horizon: '#2b3f8a', zenith: '#0e1640', nadir: '#1a265f', fog: '#2b3f8a' }, /* J-3DSheet sky, fog = horizon */
  style2d: {
    name: 'flat', /* J-BoardSheet flat style */
    params: {
      band: 0.1, /* J-BoardSheet .t.c light top band, tile × .1 */
      edge: 0.1, /* J-BoardSheet .t.c dark bottom edge, tile × .1 */
      hairline: 1 / 48, /* J-BoardSheet .t.o 1 px hairline at the 48 px tile */
      radius: 0.15, /* J-BoardSheet corner radius, tile × .15 */
      gap: 0.09, /* J-BoardSheet gap, 9 % of the tile */
      frameRadius: 0.3, /* J-BoardSheet .j-board radius, tile × .3 */
    },
  },
  style3d: {
    name: 'bevel', /* J-3DSheet "Bevel 5 %" */
    params: {
      edge: 0.028, /* J-3DSheet thin dark edge, 2.8 % of the face */
      slope: 0.05, /* J-3DSheet bevel 5 % of the face wide */
      revealedEdge: 0.028, /* J-3DSheet revealed cubes: the 2.8 % edge, no slope */
      radius: 0, /* J-3DSheet cube faces meet edge to edge */
      sides: { top: 1, right: -0.67, bottom: -1, left: 0.536 }, /* J-3DSheet lit from the top left: right #5e92ec, left #98befa mixed from the face */
    },
  },
  cursor: { color: INK, inner: '#ffffff', width: 3, radius: { tile: 0.15, px: 3 } }, /* J-BoardSheet .t.cur: 3 px navy ring, white hairline, radius tile × .15 + 3 px */
  selection: {
    outline: INK, /* J-3DSheet selection outline --color-ink */
    width: { face: 0.06, px: 3 }, /* J-3DSheet max(0.06 face, 3 px) */
    glow: '#ffc93c', /* J-3DSheet 1 px --color-head line inside */
    glowWidth: 1, /* J-3DSheet 1 px glow line */
    tint: [1, 0.86, 0.84], /* J-3DSheet face tint × (1, .86, .84) toward coral */
  },
  mark: { tint: '#49c6b8', mix: 0.55, pulseMix: 0.9 }, /* J-3DSheet start cell: --color-tile-mark, mix .55 swelling to .9 */
  motion: {
    press: {
      duration: 90, /* J-BoardSheet Press · 90 ms */
      easing: EASE_OUT, /* J-BoardSheet Press · easing-out */
      tracks: [
        { property: 'depth', keyframes: [{ at: 0, value: 1 }, { at: 45, value: 0.5 }, { at: 90, value: 0 }] }, /* J-BoardSheet Press depth 1 → .5 → 0 */
        { property: 'offset', keyframes: [{ at: 0, value: { x: 0, y: 0 } }, { at: 45, value: { x: 0, y: 0.04 } }] }, /* J-BoardSheet Press offset y .04 */
      ],
    },
    release: {
      duration: 140, /* J-BoardSheet Release · 140 ms */
      easing: EASE_SPRING, /* J-BoardSheet Release · easing-spring */
      tracks: [
        { property: 'depth', keyframes: [{ at: 0, value: 0 }, { at: 90, value: 1.1 }, { at: 140, value: 1 }] }, /* J-BoardSheet Release depth 0 → 1.1 → 1 */
        { property: 'scale', keyframes: [{ at: 0, value: 1 }, { at: 90, value: 1.03 }, { at: 140, value: 1 }] }, /* J-BoardSheet Release scale 1.03 */
      ],
    },
    reveal: {
      duration: 160, /* J-BoardSheet Reveal · 160 ms */
      easing: EASE_SPRING, /* J-BoardSheet Reveal · easing-spring */
      tracks: [
        cut(120), /* J-BoardSheet Reveal: the revealed face from 60 ms */
        { property: 'scale', keyframes: [{ at: 0, value: 1 }, { at: 60, value: 0.82 }, { at: 120, value: 1.04 }, { at: 160, value: 1 }] }, /* J-BoardSheet Reveal scale .82 → 1.04 → 1 */
        { property: 'brightness', keyframes: [{ at: 0, value: 1 }, { at: 60, value: 1.12 }, { at: 160, value: 1 }] }, /* J-BoardSheet Reveal brightness 1.12 */
      ],
    },
    flag: {
      duration: 180, /* J-BoardSheet Flag · 180 ms */
      easing: EASE_SPRING, /* J-BoardSheet Flag · easing-spring */
      tracks: [
        cut(160), /* J-BoardSheet Flag: the flag face from 80 ms */
        { property: 'offset', keyframes: [{ at: 0, value: { x: 0, y: 0 } }, { at: 80, value: { x: 0, y: -0.15 } }, { at: 140, value: { x: 0, y: 0.02 } }, { at: 180, value: { x: 0, y: 0 } }] }, /* J-BoardSheet Flag offset y −.15 → .02 → rest */
        { property: 'scale', keyframes: [{ at: 0, value: 1 }, { at: 80, value: 1.18 }, { at: 140, value: 0.97 }, { at: 180, value: 1 }] }, /* J-BoardSheet Flag scale 1.18 → .97 → rest */
      ],
    },
    unflag: {
      duration: 120, /* J-BoardSheet Unflag · 120 ms */
      easing: EASE_OUT, /* J-BoardSheet Unflag · easing-out */
      tracks: [
        cut(120), /* J-BoardSheet Unflag: the closed face from 60 ms */
        { property: 'scale', keyframes: [{ at: 0, value: 1 }, { at: 60, value: 0.9 }, { at: 120, value: 1 }] }, /* J-BoardSheet Unflag scale .9 → rest */
      ],
    },
    chordPress: {
      duration: 90, /* J-BoardSheet Chord press · 90 ms */
      easing: EASE_OUT, /* J-BoardSheet Chord press · easing-out */
      tracks: [
        { property: 'depth', keyframes: [{ at: 0, value: 1 }, { at: 90, value: 0 }] }, /* J-BoardSheet Chord press depth 0 */
        { property: 'brightness', keyframes: [{ at: 0, value: 1 }, { at: 90, value: 0.96 }] }, /* J-BoardSheet Chord press brightness .96 */
      ],
    },
    solvedPulse: {
      duration: 450, /* J-3DSheet Solved pulse: hidden at 0.45 s */
      easing: 'linear', /* J-3DSheet Solved pulse keyframes */
      tracks: [
        { property: 'scale', keyframes: [{ at: 0, value: 1 }, { at: 120, value: 1.08 }, { at: 250, value: 1.15 }] }, /* J-3DSheet Solved pulse scale 1.08 → 1.15 */
        { property: 'brightness', keyframes: [{ at: 0, value: 1 }, { at: 120, value: 1.25 }, { at: 250, value: 1.45 }] }, /* J-3DSheet Solved pulse toward white .25 → .45 */
        { property: 'opacity', keyframes: [{ at: 0, value: 1 }, { at: 250, value: 1 }, { at: 350, value: 0.5 }, { at: 450, value: 0 }] }, /* J-3DSheet Solved pulse fading .5 → hidden */
      ],
    },
  },
});
