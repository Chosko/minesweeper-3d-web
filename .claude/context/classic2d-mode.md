# Classic 2D — mode, game window, sound, end delay and end effect

## OVERVIEW

`js/classic2d/mode.js` puts the Classic 2D game behind the game shell's mode
contract: one session, board view, pointer / cursor inputs and movement
sampler per game, the game window's feed, the sound cue of every action,
pause by hiding the board, the generation client and pre-generation, and the
end delay with its end effect (`js/classic2d/end-effect.js`). DOM-free: the
shell hands in its flow and its sound sink. The area overview is
[classic2d.md](classic2d.md).

## PUBLIC API

`js/classic2d/mode.js`
- `MODE_ID` (`'classic-2d'`), `END_DELAY_MS` (1000).
- `createClassic2DMode(report, {flow, lastChoice, createClient?, mount?,
  sound?, clock?, randomSeed?, generatingDelayMs?, place?, buttonSwap?})` →
  the contract methods plus `warm()`, `client` (the mode's one generation
  client), `fixed` (the open game's forced start, or null), `ending`, `finishNow()`,
  `hideBoard(hidden)`, `tick()`, `pad(poll, now)`, `setScale(scale)`,
  `tapMode` / `setTapMode('reveal' | 'flag')` (the Tap choice's value,
  `reveal` at first, kept for the page), `boardGame` (for the debug hook),
  `retry()`, `playStandard()`, `cancelGeneration()` → whether a board being
  generated was cancelled, `loadChoice()`, `status()` → `{state, pending (the
  first click's board being generated or failed), time, minesLeft}`, `boardHidden`, `boardView` (for the debug hook); the
  contract's optional `replay(summary)` is the session's.
- `flow` is `{openBoardChoice(choice), show(), container(), hud({seconds,
  minesLeft, clicks}), figures?(input, {tick}), board({width, height, mines,
  noGuess, identity}), generating(shown), progress?(p|null),
  failed(failure|null), hint?(text), scale?(), frame?(), mounted?(view),
  layout?(layout), scrolled?(), padCue?(kind)}` — `board` once per game and again when
  `playStandard()` turns no-guess off; `mounted` each fresh view before its
  first fit (`mountBoardView`'s `onMount`), for the shell to size the board
  area to the board's extent; `padCue` the cursor input's
  `onPadCue` (`'press'` | `'flag'`), which the shell answers with a rumble
  ([app-shell-3d-play.md](app-shell-3d-play.md)).
- `mount` defaults to `{board: mountBoardView, pointer: mountPointerInput,
  cursor: mountCursorInput, touch: mountTouchInput, sampler:
  mountSampler2D}`; without `touch` no touch input, without `sampler` no
  movement is recorded. The touch mount gets the gate, `flagMode` from
  `tapMode` and `flow.scrolled` as its `onUserScroll`. `sound` is the sound sink (`{reveal(count),
  flag(on, count), chord(count), noop(), explode(), win()}`, the `sfx` of
  `js/audio.js` that `main.js` hands in), null by default. `clock` is the
  session's and the end delay's. `buttonSwap` goes to every pointer mount
  as `swap`, never to the cursor input. The module head comment is the
  contract.

`js/classic2d/end-effect.js`
- `WIN`, `LOSS`, `WAVE_STEP_MS`, `WAVE_SHARE`, `WIN_WAVE`
  (`{peakMs, widthMs}`), `LOSS_SNAP_MS`, `CONFETTI_COUNT`.
- `createEndEffect({kind, geometry?, cols?, rows?, origin, duration, random?})`,
  `reachMs`, `preLossState`, `wonState`, `shownState`,
  `waveAt(effect, c, state, t, end2d)` → `{scale, flash}` or null,
  `confettiAt(effect, t, {tile, gap?, width?, height?})`, `done`,
  `drawWave(ctx, x, y, size, wave, board, paint)`, `drawConfetti`. The
  module head comment is the contract.

## INTERNAL PATTERNS

- **Start.** `start` normalises the choice, saves it as the last board
  choice and mounts a fresh view, inputs and sampler. The inputs see the
  session through a gate that reads paused while the board is hidden and
  redraws what an action before the first reveal changed (the session emits
  no event then). The view opens at `flow.scale()` inside `flow.frame()`,
  measured again at every refit, reports each layout to `flow.layout` (the
  shell places the panel) and each player scroll to `flow.scrolled`.
  `tick()` drives the sampler every frame, with the cursor's ring cell
  beside the view (-1 when hidden). The session's `changed` redraws the
  listed cells and pushes the window's feed; its board arriving reports
  started and can-pause.
- **The window's feed.** `flow.hud` gets the timer, mines left and clicks
  when any changed; `flow.figures` the live figures' input (`counts()`,
  flags, mines, `elapsedMs()`) on every count change, else on the timer's
  new second (`tick`).
- **Game window** (`#c2d`, ids in [app-shell-ui.md](app-shell-ui.md)): head
  (Swap clicks, title, Pause), body (counter strip over the board area, the
  Tap choice on a coarse pointer, the flat live figures column
  with the controls reminder), foot (size, mines, no-guess). The window
  hugs its content, centred above the HUD strip: the fit rule works in the
  room the chrome leaves, and the board area takes the board's extent in
  it, left-aligned under the counter strip ([app-shell-2d.md](app-shell-2d.md)
  § Board area and panel). Too narrow for both, the panel moves under the
  board; on a phone it hides and the window is full-bleed, the board held
  sideways at the left edge beside a column of the counters, Restart and
  the Tap choice (`#c2d` in `css/style.css`).
- **Sound.** Every action the gate passes on — mouse, keyboard or
  controller — plays the 3D game's cue for its outcome (`cue` in
  `mode.js`), read from the engine's changed cells and the game's phase:
  `flag(on, count)` (on when at least half the changed cells are flagged),
  `explode()` alone for a loss, `reveal(count)` or `chord(count)`, `noop()`
  for an action while playing that changed nothing, then `win()` once. The
  mode has no sound setting; volume and mute are the shared `sfx`'s
  ([audio.md](audio.md)). The first reveal's cue plays when its board
  arrives, not if the game was restarted or left first; a refused action
  is silent. A cue never changes or gates an action.
- **Generation client and pre-generation.** One client (`createClient`) is
  made on first use and kept for the page; `warm()` warms it as the board
  choice opens. A finished no-guess game asks it for the next board of the
  same choice (`pregenerate`, its `startCell`, a fresh `randomSeed`); the
  next `open` with the same choice (Play again, Restart) hands it to the
  session, whose `mark` drives `view.setMark`; another choice or `leave`
  discards it. `start({ ...choice, fixed, pregenerated? })` — a daily or a
  challenge — saves no last choice, discards that board for its own, starts
  the cursor input on the forced cell (`start`), and turns the session's
  `refused` into `view.pulseMark()` and `flow.hint(START_HINT)`; `restart()`
  keeps `fixed` while the game has not started, else plays free. `tick()` pushes the generating card's progress to
  `flow.progress`, null when the card hides.
- **End delay.** A win or loss reports can-pause false at once and runs
  the end delay (`ending`): the view plays the end effect (`WIN` from the
  last action's cell, `LOSS` from the exploded tile nearest it), `tick()`
  drawing each frame at the clock's time since the end; after
  `END_DELAY_MS` — frames drawn or not — or at `finishNow()` (any press,
  `pagehide`), the view is drawn in its end state and finished is reported
  once with the summary and replay. Pause and `hideBoard` are ignored
  during it; `restart` and `leave` cancel it.
- **Restart and leave** leave the session (cancelling a pending generation
  or end delay) and destroy the view, inputs and sampler; `restart` reopens
  the session's own choice. `hideBoard` pauses the session with the board
  (a no-op before the first click or after the end) and drops held inputs.
- **End effect.** Each tile is reached at a delay proportional to its
  distance in tiles from the origin, between cell centres on the board's
  grid geometry, at most `WAVE_STEP_MS` per tile, the
  farthest by `WAVE_SHARE` of the delay. A loss's changed tiles keep their
  pre-loss tile until reached, then snap to their revealed face from the
  board module's `end2d.loss.scale` with an overshoot (the 3D loss wave's
  curve, over `LOSS_SNAP_MS`) under its `end2d.loss.flash` of the light; a
  win's wave bumps each tile to `end2d.win.scale` and mixes it
  `end2d.win.mix` toward `end2d.light` as it passes (the 3D win wave's
  timing, `WIN_WAVE`), its closed mines turn to flags, and its confetti in
  the module's `palette.confetti` bursts from the origin's centre and falls
  over the geometry's extent. The board view draws it; the module reads no token.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the sound of each action and the mode;
  [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the replay on the mode's reports.

## CROSS-REFERENCES

- [classic2d-session.md](classic2d-session.md) — its session;
  [classic2d-board-view.md](classic2d-board-view.md), [classic2d-input.md](classic2d-input.md) — what it mounts.
- [app-shell.md](app-shell.md) — the mode host;
  [app-shell-2d.md](app-shell-2d.md) — the flow, `main.js` handing in `sfx`
  and the button swap; [app-shell-pause.md](app-shell-pause.md) — the end
  delay's skip.
- [generation.md](generation.md) — the client and `pregenerate`;
  [replay-samplers.md](replay-samplers.md) — the 2D sampler the mode
  mounts; [audio.md](audio.md) — the `sfx` cues, volume and mute.
- [testing.md](testing.md) — `tests/classic2d-mode.test.mjs` the mode, end
  delay, cues, figures feed and window in a browser;
  `tests/classic2d-end-effect.test.mjs`, `tests/replay-2d.test.mjs` the
  end effect and the replay on the mode's reports.

## WHEN TO READ THE SOURCE

- Tuning the end effect (wave speed, wave shape, confetti) or the 2D end delay
  (`end-effect.js`; `END_DELAY_MS` and the `finished` handler in `mode.js`).
- Changing which cue an action plays (`cue` and `act` in `mode.js`; the 3D
  game's mapping it mirrors is `onAction` in `js/main.js`).
