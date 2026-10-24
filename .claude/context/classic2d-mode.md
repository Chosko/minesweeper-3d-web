# Classic 2D — mode, game window, sound, end delay

## OVERVIEW

`js/classic2d/mode.js` puts a flat mode's game — Classic 2D's, Hexagon's or
Triangle's — behind the game shell's mode contract, one instance per flat
mode built from its flat mode configuration
([classic2d.md](classic2d.md) § Flat mode configuration): one session, board view, pointer / cursor inputs and movement
sampler per game, the game window's feed, the sound cue of every action,
pause by hiding the board, the generation client and pre-generation, and the
end delay, which plays the end effect
([classic2d-end-effect.md](classic2d-end-effect.md)). DOM-free: the
shell hands in its flow and its sound sink. The area overview is
[classic2d.md](classic2d.md).

## PUBLIC API

`js/classic2d/mode.js`
- `MODE_ID` (`'classic-2d'`), `END_DELAY_MS` (1000).
- `createClassic2DMode(report, {config?, flow, lastChoice, createClient?,
  mount?, sound?, clock?, randomSeed?, generatingDelayMs?, place?,
  buttonSwap?})` →
  the contract methods plus `warm()`, `client` (the mode's one generation
  client), `fixed` (the open game's forced start, or null), `ending`, `finishNow()`,
  `hideBoard(hidden)`, `tick()`, `pad(poll, now)`, `setScale(scale)`,
  `tapMode` / `setTapMode('reveal' | 'flag')` (the Tap choice's value,
  `reveal` at first, kept for the page), `boardGame` (for the debug hook),
  `retry()`, `playStandard()`, `cancelGeneration()` → whether a board being
  generated was cancelled, `loadChoice()`, `status()` → `{state, pending (the
  first click's board being generated or failed), time, minesLeft}`, `boardHidden`, `boardView` (for the debug hook); the
  contract's optional `replay(summary)` is the session's.
- `config` is the flat mode configuration, `CLASSIC_2D` by default: every
  game's board setup, graph, geometry and pre-generated board's start cell
  are its grid's, and `lastChoice` is `createLastChoice` over the same
  configuration. An instance's sessions, views, inputs, sampler,
  generation client and pre-generated board are its own; the button swap
  and the board scale (`flow.scale`) are the page's, shared by every
  instance.
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

## INTERNAL PATTERNS

- **Start.** `start` normalises the choice, saves it as the last board
  choice and mounts a fresh view, inputs and sampler, the view and the
  cursor input on the configuration's geometry for the game's size
  (`config.createGeometry`, [geometry.md](geometry.md)), built once per
  game. The inputs see the
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
- **Game window** (`#c2d`, ids in [app-shell-hud.md](app-shell-hud.md)): title
  bar (Pause, the logo, the window buttons), body (counter strip with the
  icon-only Restart over the board area, the Tap choice on a coarse
  pointer, and while open the flat live figures column with the controls
  reminder), foot (the open mode's name and board, size, mines, no-guess; Swap clicks
  and the live-figures toggle at its right). The window hugs its content,
  centred above the HUD strip, shrinking to the board column while the
  live figures are closed: the fit rule works in the room the chrome
  leaves, and the board area takes the board's extent in it, left-aligned
  under the counter strip ([app-shell-2d.md](app-shell-2d.md) § Board area
  and panel). Too narrow for both, the open panel moves under the board;
  on a phone it hides with its toggle and the window is full-bleed, the
  board held sideways at the left edge beside a column of the counters,
  Restart and the Tap choice (`#c2d` in `css/style.css`).
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
- **Generation client and pre-generation.** One client per instance
  (`createClient`) is made on first use and kept for the page; `warm()`
  warms it as the mode's board choice opens. A finished no-guess game asks it for the next board of the
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
  last action's cell, `LOSS` from the exploded tile nearest it by the
  geometry's cell centres), `tick()`
  drawing each frame at the clock's time since the end; after
  `END_DELAY_MS` — frames drawn or not — or at `finishNow()` (any press,
  `pagehide`), the view is drawn in its end state and finished is reported
  once with the summary and replay. Pause and `hideBoard` are ignored
  during it; `restart` and `leave` cancel it.
- **Restart and leave** leave the session (cancelling a pending generation
  or end delay) and destroy the view, inputs and sampler; `restart` reopens
  the session's own choice. `hideBoard` pauses the session with the board
  (a no-op before the first click or after the end) and drops held inputs.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the sound of each action and the mode;
  [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the replay on the mode's reports.
- [../domain/features/flat-grid-geometry.md](../domain/features/flat-grid-geometry.md)
  — the geometry the mode builds per game;
  [../domain/features/flat-grid-modes.md](../domain/features/flat-grid-modes.md)
  — one mode instance per flat mode, Hexagon and Triangle played in the
  Classic 2D window.

## CROSS-REFERENCES

- [classic2d-session.md](classic2d-session.md) — its session;
  [classic2d-board-canvas.md](classic2d-board-canvas.md), [classic2d-input.md](classic2d-input.md) — what it mounts;
  [geometry.md](geometry.md) — the geometry it builds.
- [app-shell.md](app-shell.md) — the mode host;
  [app-shell-2d.md](app-shell-2d.md) — the flow, `main.js` handing in `sfx`
  and the button swap; [app-shell-end-delay.md](app-shell-end-delay.md) — the
  end delay's skip.
- [generation.md](generation.md) — the client and `pregenerate`;
  [replay-samplers.md](replay-samplers.md) — the 2D sampler the mode
  mounts; [audio.md](audio.md) — the `sfx` cues, volume and mute.
- [classic2d-end-effect.md](classic2d-end-effect.md) — the end effect the
  end delay plays.
- [testing.md](testing.md) — `tests/classic2d-mode.test.mjs` the mode, end
  delay, cues, figures feed and window in a browser;
  `tests/flat-modes.test.mjs` each instance built from its configuration;
  `tests/flat-modes-play.test.mjs` Hexagon and Triangle games in a browser;
  `tests/replay-2d.test.mjs` the replay on the mode's reports.

## WHEN TO READ THE SOURCE

- Changing the 2D end delay: `END_DELAY_MS` and the `finished` handler in
  `mode.js`.
- Changing which cue an action plays (`cue` and `act` in `mode.js`; the 3D
  game's mapping it mirrors is `onAction` in `js/main.js`).
