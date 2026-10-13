# Classic 2D — board setup, session and Canvas board

## OVERVIEW

The Classic 2D mode, independent of three.js: the board setup that turns a
board choice into a board request, the session that owns one game from
closed board to result, the board view that lays the board out, hit-tests
and scrolls it, the pointer and cursor inputs, the tile skin the view asks
to paint each tile, and the mode that joins them behind the game shell's
contract. The session owns the game and its timer; the view owns where
tiles go and the input that moves the board; the skin owns how a tile
looks.

- `js/classic2d/board-setup.js` — board choice → board request: the
  standard sizes, the custom-board limits and their validation, the square
  grid and records board identity of a choice, and the last board choice as
  a platform-storage document. DOM-free.
- `js/classic2d/session.js` — the game session and its timer: the closed
  board, the first click's board — a standard one placed at once with
  `generate()`, a no-guess one asked of the generation client, a
  pre-generated one taken over on its marked start cell — the slow-answer
  "generating" state and its progress, the failure offer, actions, pause,
  win or loss, restart and leave with their summaries and replays, and the
  game's replay recorder. DOM-free.
- `js/classic2d/board-view.js` — the board view: the fit rule with its
  floor, the board scale's cap and a page's frame, the layout and the
  panel's rectangle, `cellAt`, per-cell redraw from the engine's change
  lists, scrolling and panning with a clipped board's shadows and scroll
  bars, the hidden board while paused, and `mountBoardView`, the browser
  wiring around it. DOM-free at import.
- `js/classic2d/pointer-input.js` — the mouse input: a press-and-release
  state machine over the buttons, its rules read from the reference
  profile, and `mountPointerInput`, its wiring to the view and the session.
  DOM-free at import.
- `js/classic2d/button-swap.js` — the mouse button swap: the page's switch
  (off at creation, never saved) and its per-press translation that trades
  left and right on a closed or flagged cell, held from a press to its
  release. DOM-free.
- `js/classic2d/cursor-input.js` — the keyboard and controller input: a cell
  cursor with auto-repeat for held directions, reveal / flag / chord on keys
  and buttons with the mouse's press feedback and release rules, and
  `mountCursorInput`, its wiring to the view and the session. DOM-free at
  import.
- `js/classic2d/mode.js` — the Classic 2D mode behind the game shell's mode
  contract: one session, board view, pointer / cursor inputs and movement
  sampler per game, the overlay feed, the sound cue of every action, pause
  by hiding the board, the end delay with its end effect. DOM-free: the
  shell hands in its flow and its sound sink.
- `js/classic2d/end-effect.js` — the end effect: the 3D win and loss waves
  and the win confetti at board scale, as tile states, pulse strengths and
  confetti pieces over time, and their drawing onto a Canvas 2D context.
  DOM-free and token-free.
- `js/classic2d/board-choice.js` — the board choice screen: the custom-board
  info line and validation, the choice its fields describe, and
  `bindBoardChoice`, which touches only the elements it is handed.
- `js/classic2d/tile-skin.js` — the stateless tile painter, the tile cache
  that pre-renders every state and number, and the shared minimum tile size.
  It draws every tile through the shared tile recipe `js/tile-art.js` and
  holds no palette: every colour is a tile or number token from
  `css/tokens.css` read through the token reader `js/tokens.js`
  ([app-shell.md](app-shell.md)). DOM-free at import.
- `js/tile-art.js` — the shared tile recipe, the cube face of the 3D atlas
  ([rendering.md](rendering.md)) at any size: the raised, sunken and
  revealed faces, the number, mine and flag glyphs and the wrong-flag
  cross, every colour an argument. It imports nothing — neither three.js
  nor the token reader — and touches no DOM.

## PUBLIC API

`js/classic2d/board-setup.js` exports
- `MODE` (`'classic-2d'`), `GRID` (`'square'`), `BOARD_SIZES`
  (`beginner`, `intermediate`, `expert`, `custom`), `STANDARD_SIZES`
  (`{width, height, mines}` per standard size, from the records'
  `STANDARD_BOARDS`), `DEFAULT_CHOICE` (Beginner, custom 30 × 16 / 99,
  no-guess on).
- `NOGUESS_HELP_TEXT` — the helper line under the no-guess switch on both
  board choice screens; `NOGUESS_DENSITY_HINT` (0.25), `DENSITY_HINT_TEXT`
  and `aboveDensityHint(mines, cells)` — the density hint both board
  choices show, the 3D one importing them from here.
- `customMineCap(width, height)` — the reference site's mine cap;
  `maxMines(width, height)` — the cap here, at most the cell count minus
  one; `validateCustom({width, height, mines})` → `{ok: true}` or `{ok:
  false, field, reason}`; `normaliseChoice(choice)` → a plain valid copy or
  null.
- `boardSetup(choice)` → frozen `{choice, width, height, mines, noGuess,
  identity, grid, request(firstClick, seed)}` — `grid` the square grid
  ([engine.md](engine.md)), `identity` the records board identity
  ([records.md](records.md)), `request` the generation request
  ([generation.md](generation.md)); an invalid choice throws a
  `RangeError`. A choice is `{size, custom, noGuess}`.
- `LAST_CHOICE_DOC` (`'classic2d.lastChoice'`), `LAST_CHOICE_VERSION` (1),
  `createLastChoice({storage})` → `{current, load(), save(choice)}`
  ([platform.md](platform.md)).

`js/classic2d/session.js` exports
- `SESSION_STATE` (`ready`, `generating`, `playing`, `failed`, `won`,
  `lost`, `left`), `FAILURE_OFFERS` (`retry`, `standard`),
  `GENERATING_DELAY_MS` (200), `SESSION_EVENTS` (`generating`, `started`,
  `changed`, `failed`, `finished`, `abandoned`, `mark`).
- `createTimer({now})` → `{start, pause, resume, stop, elapsedMs(),
  seconds(), pauses(until?, count?), started, running, stopped, paused}` —
  the game clock, running through pauses; `pauses` the pause spans
  `[{start, end}]` begun by `until` (now by default), at most `count`, the
  open one clipped to `until`.
- `createSession({choice, client, clock?, randomSeed?,
  generatingDelayMs?, place?, pregenerated?})` → `{state, choice, setup, game, seed,
  generatorVersion, generatingShown, paused, failure, minesLeft,
  markedCell, progress ({candidates, seconds} while generating, else null),
  elapsedMs(), seconds(), pauses() (the pause spans so far), clicks() (the
  engine's counted clicks, wasted included), on(type, fn) → off, reveal(c), toggleFlag(c),
  chord(c), retry(), playStandard(), cancel(), pause(), resume(), restart(),
  leave(), summary(), recording, recordSample(values), recordCursor(cell),
  replay(summary?)}` — `client` is the generation client `{request,
  cancel}`, asked for no-guess boards only; `place` the standard placement
  (`generate` by default); `pregenerated` a `pregenerate()` board
  ([generation.md](generation.md)); `clock` `{now, setTimeout, clearTimeout}`. `finished` and
  `abandoned` carry `{summary, replay}`; `replay(summary = summary())` is
  the recording sealed with that summary, `{blob, listing}`, or null
  ([replay.md](replay.md)). The module head comment is the contract.

`js/classic2d/board-view.js` exports
- `fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE, max =
  Infinity)` — the largest whole tile at which the board fits the area, at
  most `max`, never below `min`.
- `BOARD_SCALES` (`fit`, `100`, `125` — the settings' `boardScale` values),
  `DEFAULT_BOARD_SCALE` (`100`), `TILE_CAP` (48), `tileCap(scale)` → 48 at
  100 %, 60 at 125 %, `Infinity` at Fit.
- `boardLayout({cols, rows, width, height, min, max, frame})` → frozen
  `{width, height, tile, boardWidth, boardHeight, viewX, viewY, viewWidth,
  viewHeight, offsetX, offsetY, maxScrollX, maxScrollY, scrolls}` — `frame`
  `{top, right, bottom, left, minWidth}` the room a page's frame takes
  around the board; the view rectangle is the board, centred with its
  frame, or the area inside the frame when it scrolls; `offsetX/Y` the
  board's corner at scroll 0 (the view's).
- `panelRect(layout, frame)` → `{x, y, width, height}` — the frame around
  the view, at least `frame.minWidth` wide, never wider than the area.
- `clipMarks(layout, scroll)` → `{left, right, top, bottom, barX, barY}` —
  the edges with hidden cells beyond (their inset shadows) and the scroll
  bar per overflowing axis (`{x, y, width, height}` or null);
  `SHADOW_DEPTH` (12), `SCROLLBAR` (`{thickness: 4, inset: 2}`).
- `cellAtLayout(layout, scroll, cols, rows, x, y)` — the cell index under a
  canvas position inside the view, or -1.
- `BOARD_BACKGROUND` (`--color-board-frame`) — the token the view is
  filled with under the tiles; `BOARD_SHADOW` (`--color-board-shadow`) and
  `BOARD_SCROLLBAR` (`--color-board-scrollbar`) — a clipped board's marks; `CURSOR_RING` (`--color-tile-cursor`) — the
  board-only token the cursor's focus ring is drawn in, distinct from the
  rim and lit bevel it covers (the shell's focus outlines keep
  `--color-focus-ring`); `START_MARK` (`--color-success`) — the token the
  marked start cell's ring is drawn in, in the cursor ring's style, under
  it; `PAN_MODIFIER` (`shiftKey`) — the key a drag holds to pan.
- `createBoardView({canvas, grid, createSkin, token, scale, frame,
  onLayout})` → `{resize(width, height, pixelRatio), setScale(scale),
  scale, setGame(game), update(changed), repaint(), cellAt(x, y),
  cellRect(c) → {x, y, size}, scroll, scrollTo, scrollBy, pan(dx, dy),
  wheel(event) → taken, ensureVisible(c) → scrolled, setHidden(hidden),
  setPressed(cells), pressed, setCursor(c), cursor, setMark(c), mark, showEffect(effect, t),
  effect, hidden, layout,
  pixelRatio, canvas, dispose}` — `onLayout(layout)` after every refit — `grid` is the square grid
  ([engine.md](engine.md)); `game` is the engine game whose `cellState` /
  `cellNumber` it draws; `createSkin` defaults to `createTileSkin`, `token`
  to the token reader. Positions are canvas CSS pixels.
- `mountBoardView({container, grid, win, onUserScroll, ...})` → the view
  plus `destroy()`: a canvas filling `container` above what it already
  holds, refitted on container resize and device-pixel-ratio change,
  scrolled by the wheel and panned by a primary-button drag with
  `PAN_MODIFIER` held, `onUserScroll()` after each such scroll.

`js/classic2d/pointer-input.js` exports
- `BUTTON` (`LEFT` 0, `MIDDLE` 1, `RIGHT` 2).
- `pointerRules(profile?)` → the frozen input rules `{chordInputs,
  revealInputs, flagToggle, pressFeedback, releaseOffCell}` of a rule
  profile, the reference one by default ([engine.md](engine.md)).
- `createPointerInput({graph, game, onPress, onAction, rules?, active?})` →
  `{down(button, c), up(button, c), move(c), reset(), holding}` — `c` the
  cell under the pointer or -1; `onPress(cells)` on every change of the
  pressed set; `onAction(kind, c)` with `'reveal' | 'toggleFlag' | 'chord'`.
- `mountPointerInput({view, session, graph?, win?, rules?, swap?})` →
  `{input, destroy()}` — `swap` a button swap: each press and release goes
  through it before the state machine, and it is reset on blur and
  destroy; the shift + primary pan check reads the physical button.

`js/classic2d/button-swap.js` exports
- `createButtonSwap()` → `{on, toggle(), onChange(fn), press(button,
  closed), release(button), reset()}` — `toggle()` returns the new state
  and tells every `onChange` listener; `press` trades `LEFT` and `RIGHT`
  only while on and `closed`, recording the result until `release(button)`
  returns it; a release with no recorded press passes through.

`js/classic2d/cursor-input.js` exports
- `CURSOR_KEYS` (key code → `up`/`down`/`left`/`right`/`reveal`/`flag`/
  `chord`), `PAD_MAP` (`BTN` index → the same), `STICK_THRESHOLD`.
- `createCursorInput({grid, game, onPress, onAction, onCursor?, onUse?,
  rules?, active?, delay?, interval?})` — `onUse()` before each cursor input
  the board takes (a direction held, a button pressed) → `{cell, setCell(c), move(dx, dy),
  hold(source, dir), let(source, dir), tick(now), down(source, button),
  up(source, button), pad(poll, now), reset(), holding, moving}` — `button`
  is `'reveal' | 'flag' | 'chord'`; `poll` is a `GamepadReader` poll
  (`held`, `ls`) after the shell's held-button suppression.
- `mountCursorInput({view, session, grid?, win?, rules?, delay?,
  interval?})` → `{input, pad(poll, now?), shown, destroy()}` — `shown`
  whether the ring shows.

`js/classic2d/mode.js` exports
- `MODE_ID` (`'classic-2d'`), `END_DELAY_MS` (1000, the 2D end delay);
  `createClassic2DMode(report, {flow,
  lastChoice, createClient?, mount?, sound?, clock?, randomSeed?,
  generatingDelayMs?, place?, buttonSwap?})` → the contract methods plus `warm()`, `ending`, `finishNow()`,
  `hideBoard(hidden)`,
  `tick()`, `pad(poll, now)`, `setScale(scale)`, `retry()`, `playStandard()`,
  `cancelGeneration()` → whether a board being generated was cancelled,
  `loadChoice()`, `status()` → `{state, time, minesLeft}`, `boardHidden`, `boardView` (the
  open view, for the debug hook); the contract's
  optional `replay(summary)` is the session's. `flow` is
  `{openBoardChoice(choice), show(), container(), hud({seconds, minesLeft,
  clicks}),
  board({width, height, mines, noGuess}), generating(shown),
  progress?(p|null), failed(failure|null), scale?(), frame?(), layout?(layout),
  scrolled?()}`, `board` once per game and again when
  `playStandard()` turns no-guess off; `scale` and `frame` are read as
  each board opens, `layout` follows every refit (the shell places the
  panel), `scrolled` each scroll the player made;
  `mount` defaults to `{board: mountBoardView, pointer: mountPointerInput,
  cursor: mountCursorInput, sampler: mountSampler2D}`; without `sampler`
  no movement is recorded; `sound` is the sound sink (`{reveal(count),
  flag(on, count), chord(count), noop(), explode(), win()}`, the `sfx`
  instance of `js/audio.js` that `main.js` hands in), null by default:
  without it nothing plays; `clock` (`{now, setTimeout, clearTimeout}`) is
  the session's and the end delay's; `buttonSwap` (none by default) is
  handed to every game's pointer mount as `swap`, never to the cursor
  input. The module head comment is the contract.

`js/classic2d/end-effect.js` exports
- `WIN`, `LOSS`, `WAVE_STEP_MS` (60), `WAVE_SHARE` (0.6), `PULSE`
  (`{peakMs, widthMs, alpha}`), `PULSE_COLOR` (`--color-tile-bevel-light`),
  `CONFETTI_COLORS` (`--color-number-1`…`-7`), `CONFETTI_COUNT`.
- `createEndEffect({kind, cols, rows, origin, duration, random?})` → a
  frozen effect (an origin outside the board is the centre);
  `reachMs(effect, c)`, `preLossState(state)`, `wonState(state)`,
  `shownState(effect, c, state, t)`, `pulseAlpha(effect, c, t)`,
  `confettiAt(effect, t, {width, height, tile})` → `[{x, y, size, angle,
  color, alpha}]` inside the board's rectangle, `done(effect, t)`,
  `drawPulse(ctx, x, y, size, alpha, colour)`, `drawConfetti(ctx, pieces,
  colours, x, y)`. The module head comment is the contract.

`js/classic2d/board-choice.js` exports
- `CHOICE_SIZES`, `sizeLabel(size)`, `customStatus(custom)` → `{ok, field,
  max, text}` (text: the refusal as a sentence, or "2 cells · up to 1 mine",
  both counts pluralised), `readChoice({size, fields, noGuess}, fallbackCustom?)` → a
  board choice or null, `densityHintShown(custom, noGuess)`,
  `bindBoardChoice({root, onStart, onBack})` → `{show(choice, {played,
  details}), destroy()}` — the density hint `[data-density-hint]` follows
  the fields and the switch live; `details` (`{ [size]: { guess, noGuess }
  }`, the shell's `presetDetails`, [app-shell.md](app-shell.md)) fills each
  size's detail line `[data-detail]`, between its size line and its "Last
  played" line, for the switch's position, refilled on its `change`.

`js/classic2d/tile-skin.js` exports
- `MIN_TILE_SIZE` (26) — the floor a board shrinks to before it scrolls,
  shared by the skin and the view.
- `TILE_STATES` — `closed`, `pressed`, `revealed`, `flagged`, `mine`,
  `exploded`, `wrong-flag`: the rules engine's cell states
  ([engine.md](engine.md), `CELL`) plus `pressed`, the board's feedback
  under a held click or chord.
- `paintTile(ctx, x, y, size, state, number)` — paints one tile at `x, y`,
  `size` CSS pixels on a Canvas 2D context, reading tokens through the
  token reader; `number` (0–8) matters only for `revealed`.
- `paintTileWith(token, ctx, x, y, size, state, number)` — the same with an
  injected `token(name)` function.
- `createTileSkin({token, onThemeChange, currentTheme, createCanvas, redraw})`
  → `{paintTile, drawTile(ctx, x, y, size, state, number, pixelRatio = 1),
  invalidate, cacheKey, dispose}` — one skin per board view. Every option
  defaults to the browser one (token reader, `globalThis.msTheme.current()`,
  `OffscreenCanvas` or a `<canvas>`); `redraw` is the board view's
  full repaint.

## INTERNAL PATTERNS

- **Board setup and limits.** The standard sizes are the records'
  standard boards. A custom board is 1 to 100 a side (`CUSTOM_LIMITS` in
  `js/engine/profiles.js`, citing "Largest custom board" in
  `tests/fidelity/minesweeper-online.md`); its mines run from 1 to the
  smaller of the site's cap — every cell up to 36 cells, then the measured
  caps interpolated by cell count, rounded down — and the cell count minus
  one, so the first click is always safe. A 1 × 1 board is refused on the
  mines field ("no room for a mine beside the safe first click", the 3D
  form's wording), after the side checks; the smallest is 1 × 2. The
  records identity still accepts 0 mines, so entries earned on such
  boards keep loading. No-guess is never refused up
  front, however dense the board: above `NOGUESS_DENSITY_HINT` the board
  choice shows its hint, and a failed no-guess request gets the session's
  failure offer. A stored choice that does not normalise reads as
  `DEFAULT_CHOICE`, and an invalid one is never saved.
- **Session.** A session opens a closed board (`ready`). Before the first
  reveal a flag or chord goes straight to the engine, with no request
  and no event. The first reveal of a standard board places it at once with
  `place` and a fresh seed, applied in the same call; on a no-guess board
  it sends the board request for its cell with a fresh seed
  (`generating`), and actions are ignored until the answer. A
  pre-generated board marks its start cell (`markedCell`, `mark` events)
  until the first reveal: on that cell it is taken over (at once when
  arrived, else waited for in `generating`, asked afresh when it failed);
  anywhere else it is discarded. The "generating" event shows only after
  `GENERATING_DELAY_MS` and hides when the answer arrives; `progress` is
  the worker's candidates and the whole seconds since the request began. A board starts the timer and emits `started` then
  `changed` (`playing`); a failure — a no-guess board not found or the
  worker failing — emits `failed` with both offers and its `count` of
  failures in a row, and the timer never starts: `retry` asks again with a
  new seed; `playStandard` — after a failure or while generating, which
  cancels the request — places the same size with no-guess off for the
  same first cell at once. `cancel` while generating cancels the client and
  goes back to `ready` on the same closed board, with a fresh recorder and
  nothing reported. A request token drops a late answer after `cancel`,
  `restart` or `leave`, which all cancel the client. Win or loss stops the timer and emits `finished`; `restart` and
  `leave` after the first click and before the end emit `abandoned` first.
  Every summary is `buildSummary` over the engine's counts or summary, the
  elapsed time and the pause spans up to it, the board identity, the seed,
  the generator version and the game's id — one
  `crypto.randomUUID()` drawn when the board arrives, so the in-progress
  summary and the final one name the same game for the records store.
- **Recording.** Each closed board opens a recorder
  (`startRecording`, [replay.md](replay.md)); `restart` and `leave` discard
  it after sealing the abandoned game's replay. The first reveal is recorded
  at time 0 (a flag or chord before it changes nothing and is not recorded),
  every later action the session hands to the engine at the timer's elapsed
  time, paused spans included, wasted ones included. The mines, seed and generator version are
  added when the board arrives; a board played standard after a no-guess
  failure starts a new recording of the standard board with its first
  reveal. `recording` is true while the game is started, unpaused and
  unfinished, and only then do the sampler's `recordSample` and
  `recordCursor` record. `finished` and `abandoned` carry the replay sealed
  with their summary and the pause spans it counted.
- **Timer.** The game clock starts when the board is ready, runs through
  pauses and keeps its time once stopped; `seconds()` is whole seconds for
  the overlay, `elapsedMs()` whole milliseconds for the result. A pause is
  marked from `pause()` to `resume()` on the clock, or to `stop()` when the
  game ends paused; one begun while generating counts from the start, and
  one ended before it does not count.
- **Fit rule.** The view fits the board to the area it is given less the
  frame, at the largest whole tile up to the scale's cap and never below
  `MIN_TILE_SIZE`
  ([square-tile-skin.md § Minimum tile size](../domain/features/square-tile-skin.md)).
  A board that fits is centred with its frame and never scrolls; one that
  does not keeps `MIN_TILE_SIZE`, fills the area inside the frame, starts
  at its top-left corner and scrolls on the overflowing axis only. Tiles
  sit edge to edge. `setScale` refits over the same area and repaints.
  In play the frame is the panel's (the shell's `panelFrame2D`); the
  replay viewer has none.
- **Redraw.** `update(changed)` draws only the listed cells that are in
  view, through the skin's `drawTile`; a full repaint (the canvas cleared,
  the view filled with the background, every visible tile, then the marks)
  happens on `resize` with a new size or pixel ratio, on a scale change, on
  `setGame`, on a scroll, on showing a hidden board and on a theme change,
  which reaches the view as the skin's `redraw` callback. On a board that
  scrolls, drawing is clipped to the view, and a redrawn tile under a
  shadow or a bar gets its part of them back. The background
  token is read on every full repaint. The canvas is sized in device pixels
  with a `setTransform(ratio…)`; all drawing is in CSS pixels.
- **Scrolling.** The scroll position is whole CSS pixels clamped to
  `0..maxScroll`, re-clamped on resize. The wheel scrolls only a board that
  overflows (a line is a tile, a page is the view, shift turns a vertical
  wheel horizontal); `ensureVisible` scrolls the least that shows a cell's
  whole tile inside the view, for the cursor. A scrolling board draws an
  inset shadow (`BOARD_SHADOW` to clear, `SHADOW_DEPTH` deep) on each edge
  with hidden cells beyond, and a thin bar (`BOARD_SCROLLBAR`) per
  overflowing axis whose length and place are the visible part's.
- **Pressed feedback.** `setPressed` redraws only the cells that gain or
  lose the press; a pressed cell draws as `pressed` only while the game
  has it closed, and `setGame` clears the set.
- **Focus ring.** `setCursor` redraws the cell the ring leaves and the one
  it enters, `setCursor(-1)` only the one it leaves; the ring is stroked
  inside its own tile after the tile, so a cell redraw is enough to move or
  hide it.
- **Pointer input.** Reveal and chord act on the release of the last reveal
  button, a flag on the right press; a left + right gesture acts on the left
  release, as a chord only. Every branch reads a profile marker, so a rule
  change is a profile change, not a new state machine. The mounted input
  listens for `mousedown` on the canvas and `mousemove` / `mouseup` / `blur`
  on the page (a second button held during the first fires no
  `pointerdown`), suppresses the context menu, takes input only while the
  session is `ready` or `playing` and not paused, and leaves a
  `PAN_MODIFIER` + primary press on a scrolling board to the pan.
- **Button swap.** The swap translates the physical button in front of the
  state machine, never the finished action, so a swapped left press on a
  closed cell flags at once and a swapped right press reveals on release,
  with the press feedback and chords of the button it stands for. The
  translation is chosen at the press (the cell's state read from
  `session.game`) and kept for that button until its release. `main.js`
  creates one swap for the page and hands it to the mode
  ([app-shell.md](app-shell.md)); the cursor input never sees it.
- **Cursor input.** Space / Enter and A / RT only reveal (no "smart"
  button: nothing on a number), F and X / LT flag (as the right button, on
  the press), D and Y only chord; a reveal and a flag held together (both
  triggers) are left + right, chording when the profile's `chordInputs` has
  `left+right`. B, Start and Back are the shell's and unmapped. Press
  feedback (`pressFeedback`) and a held press under a moving cursor
  (`releaseOffCell`) read the same profile markers as the pointer input. Directions repeat through `Repeat` from `js/gamepad.js`, the left
  stick through `stickCurve` past `STICK_THRESHOLD`; the mounted input
  ignores the system key repeat and ticks on animation frames while a
  direction key is held, and the controller reaches it only through
  `pad(poll)`, which the shell's poll calls through the mode. The ring is on demand: none when
  the board opens; the first cursor input (`onUse`) shows it on the
  cursor's cell, and a `mousedown`, or a `mousemove` with movement, on the
  canvas hides it (`setCursor(-1)`), the cursor keeping its cell. While it
  shows, each move draws it on the new cell and calls `ensureVisible`;
  input is taken only while the session is `ready` or `playing` and not
  paused.
- **The mode.** `start` normalises the choice, saves it as the last board
  choice and mounts a fresh view, inputs and movement sampler; the inputs
  see the session through a gate that reads paused while the board is
  hidden and redraws what an action before the first reveal changed (the
  session emits no event then; under the reference rules nothing changes). The view opens at `flow.scale()` inside
  `flow.frame()`, reports each layout to `flow.layout` and each player
  scroll to `flow.scrolled`; `setScale` refits it. `tick()` drives the
  sampler every frame, and the cursor's ring reaches it beside the view:
  its cell while shown, -1 when hidden. The session's `changed`
  redraws the listed cells and pushes the overlay; its board arriving
  reports started and can-pause.
- **Sound.** Every action the gate passes on — mouse, keyboard or
  controller alike — plays the 3D game's cue for its outcome (`cue` in
  `mode.js`), read from the engine's changed cells and the game's phase:
  `flag(on, count)` for a flag click (on when the cells flagged are at
  least half of those changed), `explode()` alone for a loss,
  `reveal(count)` or `chord(count)` for the cells opened, `noop()` for an
  action while playing that changed nothing, then `win()` once at a win.
  The cues play at the shared volume and mute, which the settings apply to
  the one `sfx` instance; the mode has no sound setting of its own and
  imports no sound module. A flag or chord before the first reveal changes
  nothing under the reference rules, so it is silent; the first reveal's
  cue plays when its board arrives (the action's Promise), not if the game
  was restarted or left first; an action the session refuses (null) is
  silent. A cue never changes or gates an action.
- **Generation client and pre-generation.** The mode makes one client
  (`createClient`) on first use and keeps it for the page; `warm()` warms
  it (the shell calls it as the board choice opens). A finished game whose
  board was no-guess asks it for the next board of the same choice
  (`pregenerate`, its `startCell`, a fresh `randomSeed`); the next `open`
  with the same choice (restart: Play again, Restart of the finished game)
  hands it to the session, whose `mark` drives `view.setMark`; another
  choice or `leave` discards it. `tick()` also pushes the generating card's
  progress to `flow.progress` when it changes, null when the card hides.
  `playStandard()` answers the failure offer and the generating card alike.
- **End delay.** A win or loss reports can-pause false at once and runs
  the end delay (`ending`): the view plays the end effect
  (`createEndEffect`, `WIN` from the last action's cell the inputs took,
  `LOSS` from the exploded tile nearest it), `tick()` drawing each frame at
  the mode clock's time since the end (`view.showEffect(effect, t)`); after
  `END_DELAY_MS` on the clock — frames drawn or not — or at `finishNow()`
  (any press of the player's, `pagehide`), the view is drawn in its end
  state (`showEffect(null)`) and finished is reported once with the
  session's summary and replay at the end. A pause and `hideBoard` are
  ignored during it; `restart` and `leave` cancel it.
- **Restart and leave.** `restart` and `leave` leave the session
  (cancelling a pending generation or end delay) and destroy the view, inputs and
  sampler, releasing the canvas; `restart` reopens the session's own
  choice. `hideBoard` pauses the session with the board (a no-op before the
  first click or after the end) and drops held inputs.
- **End effect.** The 3D waves at board scale (`js/classic2d/end-effect.js`):
  each tile is reached at a delay proportional to its distance in tiles
  from the origin, at most `WAVE_STEP_MS` per tile and so that the farthest
  tile is reached by `WAVE_SHARE` of the delay. A loss's changed tiles keep
  their pre-loss tile (a mine closed, a wrong flag flagged) until reached;
  a win's pulse brightens each tile as it passes (`PULSE_COLOR`) and its
  closed mines turn to flags, and its confetti bursts from the origin and
  falls over the board's rectangle (`CONFETTI_COLORS`), pieces outside it
  left out. The view draws the effect over the skin's static tiles: the
  tiles from `shownState`, the pulse after each tile, the confetti after
  all tiles clipped to the view; a full repaint (resize, scroll, theme)
  draws the same moment. Without an effect a won game's closed tiles (its
  unflagged mines) are drawn as flags (`wonState`).
- **Hidden.** While hidden (the game is paused) a repaint draws the
  background only and `update` draws nothing; showing repaints the board.
- **The engine is the source.** The view keeps no cell state; every tile is
  read from the game when drawn.
- **Painter.** Each state is the cube face of the 3D atlas, drawn through
  `js/tile-art.js` with tokens: closed and flagged the raised face (rim,
  bevel lit top-left and dark bottom-right, shaded face, gloss), flagged
  with the 3D flag; pressed the face sunk in (bevel inverted, no gloss,
  flat face); revealed, mine and wrong flag the revealed face (rim, flat
  edge, shaded face), exploded its exploded variant; a number is the 3D
  glyph (heavy weight, a darker outline of its hue, a soft shadow) in
  `--color-number-<n>`, zero none; the wrong flag is the 3D flag under the
  3D cross. Closed and revealed differ by relief and border, not colour
  alone. The painter translates to the tile and passes the recipe one
  device pixel (from the context's scale), so every rim, border and bevel
  band is whole device pixels, at least one. Tokens used: the
  `--color-tile-*` state, recipe and glyph tokens of `css/tokens.css` and
  `--color-number-1`…`-8`.
- **Placeholder.** An unknown state, or a revealed number outside 0–8,
  paints `FALLBACK_COLOR` with a black cross — visibly wrong on purpose,
  never blank.
- **Tile cache.** `drawTile` keys the cache on `size|pixelRatio|theme`; on a
  key change it rebuilds every image — each state, `revealed-0`…`revealed-8`
  and the placeholder — on offscreen canvases of `round(size × ratio)`
  device pixels, then every draw is one `drawImage` copy.
- **Invalidation.** A tile-size or pixel-ratio change rebuilds on the next
  `drawTile` through the key. A theme change arrives through the token
  reader's `onThemeChange`: the skin records the new theme, drops the cache
  and calls `redraw`. `invalidate()` drops it by hand; `dispose()`
  unsubscribes and drops it.
- **`MIN_TILE_SIZE`** is 26 px, the readable floor of decision 10 in
  `docs/UX_REVIEW.md`: Expert (30 × 16) fits, in the framed panel with
  16 px (`--space-4`) window margins, any window 1024 px wide from 520 px
  tall, and plays at 32 px at 1024 × 768. Every state and number is legible
  at it in both themes (the browser test in `tests/tile-skin.test.mjs`).
- **No second palette.** Neither the skin nor the recipe holds a literal
  colour; a new tile colour is a token in `css/tokens.css` with a dark
  value, held to the contrast contract by `tests/tokens.test.mjs`, and its
  light value is the 3D atlas's own where the atlas has one. The recipe
  stays token-free, so the 3D atlas draws through it unthemed.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — board setup and its custom limits (and the free cell kept on small
  boards, a deliberate difference from the reference), the game session,
  timer and failure offer, the board view (fitting, scrolling or panning,
  hit-testing, per-cell redraw, the board hidden while paused), the
  pointer and cursor inputs, the sound of each action and the mode.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — what the 2D session records, the pointer and cursor sampling and the
  replay on the mode's reports.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the states, the drawing contract, the cache and its invalidation, the
  contrast contract and the minimum tile size.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the tile and number tokens, the token reader and the theme-change
  notification.

## CROSS-REFERENCES

- [app-shell.md](app-shell.md) — owns `css/tokens.css` (the tile and number
  tokens), `js/tokens.js` (`token`, `onThemeChange`, `FALLBACK_COLOR`) and
  `js/theme.js` (`msTheme.current()`).
- [engine.md](engine.md) — the cell-state vocabulary the tile states mirror,
  the square grid's index layout the view hit-tests in, the `changed`
  lists it redraws from, the game the session holds, and the profile
  markers (`CUSTOM_LIMITS`, the input markers) board setup and the inputs
  read.
- [generation.md](generation.md) — the generation client and request the
  session's first click goes through.
- [records.md](records.md) — `STANDARD_BOARDS`, the board identity and
  `buildSummary` behind every session summary.
- [platform.md](platform.md) — the storage the last board choice is a
  document in.
- [replay.md](replay.md) — the recorder the session feeds and seals, and
  the 2D movement sampler the mode mounts.
- [rendering.md](rendering.md) — the 3D tile atlas, a separate palette the
  skin neither reads nor feeds, drawn through the same `js/tile-art.js`.
- [audio.md](audio.md) — the `sfx` cues the mode's `sound` option plays,
  and the volume and mute they play at.
- [input.md](input.md) — `Repeat`, `stickCurve`, `BTN` and the
  `GamepadReader` poll the cursor input reads, and the shell's Back buttons
  it leaves unmapped.
- [testing.md](testing.md) — `tests/classic2d-session.test.mjs` pins board
  setup, the last choice, the timer and the session;
  `tests/classic2d-view.test.mjs` the board view and its end-effect drawing;
  `tests/classic2d-end-effect.test.mjs` the end effect;
  `tests/classic2d-pointer.test.mjs` the pointer input;
  `tests/classic2d-button-swap.test.mjs` the button swap, the mount's use
  of it and the overlay bar's toggle;
  `tests/classic2d-cursor.test.mjs` the cursor input;
  `tests/classic2d-mode.test.mjs` the mode, its end delay, the cue each
  action plays and board choice;
  `tests/classic2d-fidelity.test.mjs` the inputs and custom limits against
  the fidelity observations; `tests/replay-2d.test.mjs` the session's
  recording, the sampler and the replay on the mode's reports;
  `tests/tile-skin.test.mjs` the painter, the cache and `MIN_TILE_SIZE`;
  `tests/tokens.test.mjs` the tile tokens.

## WHEN TO READ THE SOURCE

- Changing a session state, event or the first-click flow (`createSession`
  and its head comment in `session.js`).
- Changing the custom limits or the stored choice (`customMineCap`,
  `normaliseChoice` in `board-setup.js`, `CUSTOM_LIMITS` in
  `js/engine/profiles.js`).
- Changing the fit rule, the cap, the frame, the layout, the marks or what
  triggers a full repaint (`boardLayout`, `panelRect`, `clipMarks`,
  `repaint`, `resize`, `setScale` in `board-view.js`).
- Tuning the end effect — the wave's speed, the pulse, the confetti — or
  the 2D end delay (`end-effect.js`; `END_DELAY_MS` and the `finished`
  handler in `mode.js`; `showEffect`, `drawCell` and `drawEffectLayer` in
  `board-view.js`).
- Changing which cue an action plays (`cue` and `act` in `mode.js`; the 3D
  game's mapping it mirrors is `onAction` in `js/main.js`).
- Changing a pointer gesture or adding an input rule (`createPointerInput`,
  `pointerRules`, the profile markers in `js/engine/profiles.js`).
- Changing when the button swap trades buttons, or where it sits in the
  mouse path (`press` / `release` in `button-swap.js`; `onDown`, `onUp`
  and `closedAt` in `mountPointerInput`).
- Changing a key or controller binding, or the cursor's repeat
  (`CURSOR_KEYS`, `PAD_MAP`, `createCursorInput`).
- Adding board input that competes with panning (`mountBoardView`'s pointer
  and wheel listeners, `PAN_MODIFIER`).
- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`, which the cache builds from); a change to the shared
  geometry in `js/tile-art.js` changes the 3D atlas too, which
  `tests/tile-skin.test.mjs` pins pixel for pixel.
- Changing the cache key or what invalidates it (`drawTile`, the
  `onThemeChange` subscription).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and the screenshots it saved before changing a token or the glyph
  geometry.
