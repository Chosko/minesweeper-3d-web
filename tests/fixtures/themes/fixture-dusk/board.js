// Test-only board module of the fixture theme, never shipped: a whole board module in the shape
// js/themes/board-module.js documents, every colour unlike Joyful tiles', its Classic 2D tiles in
// the bevel style with no gap and no corner radius on any flat grid, and no cell motion. `fixture` is a marker the
// tests read back from the hand-off.

function freeze(o) {
  for (const v of Object.values(o)) if (v && typeof v === 'object') freeze(v);
  return Object.freeze(o);
}

const RAISED = { rim: '#0b1424', bevelLight: '#3e5f9c', bevelDark: '#1d3157', face: '#8a5cc8', faceShade: '#5a3496' };
const SUNK = { rim: '#0b1424', bevelLight: '#3e5f9c', bevelDark: '#1d3157', face: '#2c3e60' };
const REVEALED = { rim: '#33415d', edge: '#141d31', face: '#40506a', faceShade: '#202a3c' };
const EXPLODED = { rim: '#33415d', edge: '#7a1712', face: '#b3261e', faceShade: '#a3221b' };

export const BOARD = freeze({
  fixture: 'fixture-dusk',
  palette: {
    faces2d: { closed: RAISED, sunk: SUNK, revealed: REVEALED, exploded: EXPLODED, marked: { ...RAISED, face: '#2f8a7e', ring: '#e6edf8' } },
    faces3d: { closed: RAISED, sunk: SUNK, revealed: REVEALED, exploded: EXPLODED },
    flag: { base: '#e6edf8', shadow: 'rgba(0,0,0,0.35)', cloth: '#ff7b7b', clothShade: '#e04a4a' },
    mine: { body: '#e6edf8', highlight: 'rgba(255,255,255,0.9)' },
    cross: { outline: 'rgba(11,20,36,0.95)', mark: '#ff7b7b' },
    numberShadow: 'rgba(0,0,0,0.3)',
    boardGround: '#0b1424',
    confetti: ['#82b1ff', '#81c784', '#ff8a80'],
  },
  numbers2d: [null, '#a0c4ff', '#9ad29d', '#ffa49b', '#c5b3e3', '#ffbfa9', '#7adbe8', '#f4f6f8', '#b8bfc9', '#a0c4ff', '#9ad29d', '#ffbfa9', '#7adbe8'],
  numbers3d: [
    null,
    '#82b1ff', '#81c784', '#ff8a80', '#b39ddb', '#ffab91', '#4dd0e1', '#eceff1', '#a0a8b4',
    '#82b1ff', '#81c784', '#ff8a80', '#b39ddb', '#ffab91', '#4dd0e1', '#eceff1', '#a0a8b4', '#82b1ff',
    '#81c784', '#ff8a80', '#b39ddb', '#ffab91', '#4dd0e1', '#eceff1', '#a0a8b4', '#82b1ff', '#81c784',
  ],
  font: { family: 'Fixture Sans', weight: 700 },
  sky: { horizon: '#33415d', zenith: '#0b1424', nadir: '#141d31' },
  style2d: { name: 'bevel', params: { edge: 1 / 64, slope: 0.075, revealedEdge: 3 / 64, radius: 0, sides: { top: 1, right: -1, bottom: -1, left: 1 }, gap: 0, frameRadius: 0 }, grids: { hex: { gap: 0, radius: 0 }, tri: { gap: 0, radius: 0 } } },
  style3d: { name: 'bevel', params: { edge: 1 / 64, slope: 0.075, revealedEdge: 3 / 64, radius: 0, sides: { top: 1, right: -1, bottom: -1, left: 1 } } },
  cursor: { color: '#ffd54f', inner: '#0b1424', width: 2, innerWidth: 1, radius: { tile: 0, px: 0 } },
  selection: { outline: '#ffd54f', width: { face: 0.06, px: 3 }, glow: '#ffffff', glowWidth: 1, tint: [1, 1, 1] },
  mark: { tint: '#2f8a7e', mix: 0.5, pulseMix: 0.9 },
  end2d: { light: '#ffffff', win: { scale: 1.1, mix: 0.3 }, loss: { scale: 0.7, flash: 0.4 } },
  motion: { press: null, release: null, reveal: null, flag: null, unflag: null, chordPress: null, solvedPulse: null },
});
