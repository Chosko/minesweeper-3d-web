// The typical 3BV of each named board — Classic 2D's standard boards and the 3D presets — as
// the board choices' detail lines show it ("~124 3BV"). The values are the medians printed by
// dev/measure-typical-bbbv.mjs (400 seeds per board, no-guess on, the first click on cell
// seed % cells), never typed by hand: re-run the script and paste its lines whenever a named board
// changes. DOM-free.
//
// The table is keyed by the board's size and mine count — `<width>x<height>:<mines>` on the square
// grid, `<width>x<height>x<depth>:<mines>` in 3D — not by its name, so a preset whose size or mines
// change has no entry until it is measured again, and its detail line leaves the 3BV part out. A
// board and its no-guess twin share the entry.

// The 3D presets' curve (median 3BV): Cube Intro 22, Cube Beginner 63, Cube Intermediate 120,
// Cube Expert 358 — the cube steps from Beginner ×1.9 and ×3.0.
export const TYPICAL_BBBV = Object.freeze({
  '9x9:10': 15,
  '16x16:40': 63,
  '30x16:99': 171,
  '6x6x6:10': 22,
  '6x6x6:20': 63,
  '8x8x8:40': 120,
  '10x10x10:100': 358,
});

/** The table key of a board identity: its size and mines; null for a grid other than the square. */
export function typicalBbbvKey(board) {
  if (board.mode === '3d') return `${board.width}x${board.height}x${board.depth}:${board.mines}`;
  return board.grid === 'square' ? `${board.width}x${board.height}:${board.mines}` : null;
}

/** The typical 3BV of a board identity, or null when the table has no entry for it. */
export function typicalBbbv(board) {
  return TYPICAL_BBBV[typicalBbbvKey(board)] ?? null;
}
