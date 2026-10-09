// The 3D mode behind the mode-host contract: an adapter over the existing 3D game in js/main.js.
// It changes none of the game's rules, look or controls; `flow` is the game's own start, pause,
// pointer-lock and end-of-game flow, handed in by js/main.js:
//   openBoardChoice()  show the 3D presets and custom board
//   start(choice)      build the board and show its click-to-play card
//   pause(note)        show the pause card (the timer runs only while playing)
//   resume(source)     'pad': lockless play; 'pointer': the click-to-play card re-acquires pointer
//                      lock; 'key': the click-to-play card
//   restart(source)    a new board with the same settings, entered as resume(source) enters play
//   leave()            drop the game, release pointer lock and lockless play
//   snapshot()         { settings, started, time, endState } of the current game
//   contextLost()      whether the WebGL context is gone

/**
 * The 3D game's summary: the fields the game has — outcome, dimensions, mines and time.
 * Null before the first click, unless the board was decided without one.
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
