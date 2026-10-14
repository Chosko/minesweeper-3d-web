// Finds the Learn 3D guided board: the board behind LEARN_BOARD (js/mode3d/learn.js).
//
// Usage: node dev/find-learn-3d.mjs
//
// For First box 1's box (4 × 4 × 3) and mine count, it asks generate() for a no-guess board with the
// first click on the box's marked start cell (startCell, the centre cell floor(X / 2), floor(Y / 2),
// floor(Z / 2)), over seeds from 1 upwards, plays the first reveal on that cell through create3DGame
// and takes the first seed whose board meets lessonCells() (js/mode3d/learn.js): the first reveal
// does not win, auto-hide hid at least one cube, a revealed 1 (P) has exactly one closed neighbour,
// the lesson mine M, and another revealed 1, the lesson number L, nearest the start cell, has M and
// at least one other closed cube among its neighbours. With no seed up to MAX_SEED at a count, it
// tries the next count, up to MAX_COUNT.
//
// It prints the count, seed, generator version, start cell, mine positions, P, L and M, the lines
// LEARN_BOARD and its head comment carry.
//
// Found under Node 22: count 4 (First box 1's), seed 75, generator version 1, start cell 26, mines 1,
// 2, 3, 40; P 36, L 25, M 40.

import { generate } from '../js/generation/generate.js';
import { startCell } from '../js/generation/start-cell.js';
import { create3DGame } from '../js/mode3d/session.js';
import { lessonCells } from '../js/mode3d/learn.js';
import { PRESETS } from '../js/mode3d/board-choice.js';

export const MAX_SEED = 10000;
export const MAX_COUNT = 6;

/** The first qualifying board for an X × Y × Z box from `count` mines up, or null. */
export function findLearnBoard({ X, Y, Z, count, maxSeed = MAX_SEED, maxCount = MAX_COUNT }) {
  const graph = { kind: 'box', X, Y, Z };
  const start = startCell(graph);
  for (let mines = count; mines <= maxCount; mines++) {
    for (let seed = 1; seed <= maxSeed; seed++) {
      const r = generate({ graph, mineCount: mines, firstClick: start, noGuess: true, seed });
      if (!r.ok) continue;
      const game = create3DGame({ X, Y, Z, minePositions: Array.from(r.mines) });
      game.reveal(start);
      const lesson = lessonCells(game.view, start);
      if (lesson) return { X, Y, Z, mines, seed, generatorVersion: r.generatorVersion, startCell: start, minePositions: Array.from(r.mines), ...lesson };
    }
  }
  return null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const box = PRESETS.find((p) => p.id === 'box-1');
  const found = findLearnBoard({ X: box.X, Y: box.Y, Z: box.Z, count: box.mines });
  if (!found) {
    console.log(`no board up to seed ${MAX_SEED} at ${box.mines} to ${MAX_COUNT} mines`);
    process.exitCode = 1;
  } else {
    console.log(`count ${found.mines}${found.mines !== box.mines ? ` (First box 1 has ${box.mines})` : ''}`);
    console.log(`seed ${found.seed}, generator version ${found.generatorVersion}, start cell ${found.startCell}`);
    console.log(`mines ${found.minePositions.join(', ')}`);
    console.log(`P ${found.proofNumber}, L ${found.lessonNumber}, M ${found.lessonMine}`);
  }
}
