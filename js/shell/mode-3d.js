// The 3D mode behind the mode-host contract: an adapter over the 3D game in js/main.js, and the
// 3D game itself on the shared rules engine (create3DGame). `flow` is the game's own start, pause,
// pointer-lock and end-of-game flow, handed in by js/main.js:
//   openBoardChoice()  show the 3D presets and custom board
//   start(choice)      build the board and show its click-to-play card
//   pause(note)        show the pause card over the hidden board (the timer runs only while playing)
//   resume(source)     'pad': lockless play; 'pointer': the click-to-play card re-acquires pointer
//                      lock; 'key': the click-to-play card
//   restart(source)    a new board with the same settings, entered as resume(source) enters play
//   leave()            drop the game, release pointer lock and lockless play
//   snapshot()         { settings, started, time, endState } of the current game
//   contextLost()      whether the WebGL context is gone

import { createBoxGrid } from '../engine/box-grid.js';
import { PROFILE_3D } from '../engine/profiles.js';
import { createGame, createGameWithMines, PHASE } from '../engine/rules.js';
import { createStateView3D } from '../engine/state-view-3d.js';
import { placeMines } from '../generation/placer.js';
import { createSeededSource } from '../generation/random.js';

const defaultSeed = () => globalThis.crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * A 3D game: the box graph and the 3D profile on the shared engine, with the 3D state view
 * (`view`) the renderer, picking and HUD read. From a mine count it awaits the first click, whose
 * board request the standard placer answers around that cell from a seeded source (`seed`, null
 * until then); from a mine set (`minePositions`) it plays that board from the start.
 * reveal(c), toggleFlag(c) and chord(c) apply the action, pass its result to the view and return
 * { changed, ended, exploded, revealed, flagged, unflagged }: the cells newly opened, flagged and
 * unflagged by it. `mines` is the board's mine count. randomSeed() → a seed 0 .. 2^32 - 1.
 */
export function create3DGame({ X, Y, Z, mines, minePositions }, { randomSeed = defaultSeed } = {}) {
  const box = createBoxGrid(X, Y, Z);
  const graph = box.graph;
  const game = minePositions
    ? createGameWithMines({ graph, profile: PROFILE_3D, mines: minePositions })
    : createGame({ graph, profile: PROFILE_3D, mineCount: mines });
  const view = createStateView3D(game, box);
  const { revealed: open, flagged: flags } = game.state;
  const opened = new Uint8Array(graph.count); // revealed as of the last action
  let seed = null;

  function apply(result) {
    view.apply(result);
    const ch = result.changed;
    let revealed = 0, flagged = 0, unflagged = 0;
    for (let t = 0; t < ch.length; t++) {
      const c = ch[t];
      if (open[c]) { if (!opened[c]) { opened[c] = 1; revealed++; } } else if (flags[c]) flagged++;
      else unflagged++;
    }
    const exploded = result.ended && game.phase === PHASE.LOST;
    return { changed: ch, ended: result.ended, exploded, revealed, flagged, unflagged };
  }

  return {
    view,
    get mines() { return game.mineCount; },
    get seed() { return seed; },
    reveal(c) {
      let r = game.reveal(c);
      if (r.boardNeeded >= 0) {
        seed = randomSeed();
        const board = placeMines({ graph, mineCount: game.mineCount, firstClick: r.boardNeeded, source: createSeededSource(seed) });
        r = game.supplyBoard(r.boardNeeded, board);
      }
      return apply(r);
    },
    toggleFlag(c) { return apply(game.toggleFlag(c)); },
    chord(c) { return apply(game.chord(c)); },
  };
}

/**
 * The 3D game's summary: the fields the game has — outcome, dimensions, mines and time.
 * Null before the first click.
 */
export function summary3d({ settings, started, time, endState }) {
  if (!settings || (!started && !endState)) return null;
  return {
    mode: '3d',
    outcome: endState ? endState.state : 'abandoned',
    dimensions: { X: settings.X, Y: settings.Y, Z: settings.Z },
    mines: settings.mines,
    time: endState ? endState.time : time,
  };
}

/**
 * The 3D mode for `createModeHost().register('3d', (report) => create3DMode(flow, report))`.
 * js/main.js calls gameStarted(), gameEnded() and contextLost() from the game's own flow.
 */
export function create3DMode(flow, report) {
  const summary = () => summary3d(flow.snapshot());
  const failed = () => report.failed('graphics context lost');
  return {
    failureScreen: 'ctxlost',
    openBoardChoice() { flow.openBoardChoice(); },
    start(choice) {
      if (flow.contextLost()) { failed(); return; }
      flow.start(choice);
    },
    pause(opts = {}) { flow.pause(opts.note ?? ''); },
    resume(opts = {}) { flow.resume(opts.source ?? 'pointer'); },
    restart(opts = {}) { flow.restart(opts.source ?? 'pointer'); },
    leave() { flow.leave(); },
    summary,
    gameStarted() { report.started(); report.canPause(true); },
    gameEnded() { report.canPause(false); report.finished(summary()); },
    contextLost() { failed(); },
  };
}
