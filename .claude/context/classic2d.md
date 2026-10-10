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
  board, the first-click board request through the generation client, the
  slow-answer "generating" state, the failure offer, actions, pause, win or
  loss, restart and leave with their summaries and replays, and the game's
  replay recorder. DOM-free; generation is reached only through the client.
- `js/classic2d/board-view.js` — the board view: the fit rule, the layout,
  `cellAt`, per-cell redraw from the engine's change lists, scrolling and
  panning, the hidden board while paused, and `mountBoardView`, the browser
  wiring around it. DOM-free at import.
- `js/classic2d/pointer-input.js` — the mouse input: a press-and-release
  state machine over the buttons, its rules read from the reference
  profile, and `mountPointerInput`, its wiring to the view and the session.
  DOM-free at import.
- `js/classic2d/cursor-input.js` — the keyboard and controller input: a cell
  cursor with auto-repeat for held directions, reveal / flag / chord on keys
  and buttons with the mouse's press feedback and release rules, and
  `mountCursorInput`, its wiring to the view and the session. DOM-free at
  import.
- `js/classic2d/mode.js` — the Classic 2D mode behind the game shell's mode
  contract: one session, board view, pointer / cursor inputs and movement
  sampler per game, the overlay feed, pause by hiding the board. DOM-free:
  the shell hands in its flow.
- `js/classic2d/board-choice.js` — the board choice screen: the custom-board
  info line and validation, the choice its fields describe, and
  `bindBoardChoice`, which touches only the elements it is handed.
- `js/classic2d/tile-skin.js` — the stateless tile painter, the tile cache
  that pre-renders every state and number, and the shared minimum tile size.
  It holds no palette: every colour is a tile or number token from
  `css/tokens.css` read through the token reader `js/tokens.js`
  ([app-shell.md](app-shell.md)). DOM-free at import.

## PUBLIC API

`js/classic2d/board-setup.js` exports
- `MODE` (`'classic-2d'`), `GRID` (`'square'`), `BOARD_SIZES`
  (`beginner`, `intermediate`, `expert`, `custom`), `STANDARD_SIZES`
  (`{width, height, mines}` per standard size, from the records'
  `STANDARD_BOARDS`), `DEFAULT_CHOICE` (Beginner, custom 30 × 16 / 99,
  no-guess off).
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
  `changed`, `failed`, `finished`, `abandoned`).
- `createTimer({now})` → `{start, pause, resume, stop, elapsedMs(),
  seconds(), started, running, stopped}`.
- `createSession({choice, client, clock?, randomSeed?,
  generatingDelayMs?})` → `{state, choice, setup, game, seed,
  generatorVersion, generatingShown, paused, failure, minesLeft,
  elapsedMs(), seconds(), on(type, fn) → off, reveal(c), toggleFlag(c),
  chord(c), retry(), playStandard(), pause(), resume(), restart(), leave(),
  summary(), recording, recordSample(values), recordCursor(cell),
  replay(summary?)}` — `client` is the generation client `{request,
  cancel}`; `clock` `{now, setTimeout, clearTimeout}`. `finished` and
  `abandoned` carry `{summary, replay}`; `replay(summary = summary())` is
  the recording sealed with that summary, `{blob, listing}`, or null
  ([replay.md](replay.md)). The module head comment is the contract.

`js/classic2d/board-view.js` exports
- `fitTileSize(cols, rows, width, height, min = MIN_TILE_SIZE)` — the
  largest whole tile at which the board fits the area, never below `min`.
- `boardLayout({cols, rows, width, height, min})` → frozen `{width, height,
  tile, boardWidth, boardHeight, offsetX, offsetY, maxScrollX, maxScrollY,
  scrolls}`.
- `cellAtLayout(layout, scroll, cols, rows, x, y)` — the cell index under a
  canvas position, or -1.
- `BOARD_BACKGROUND` (`--color-board-frame`) — the token the area around
  the board is filled with; `CURSOR_RING` (`--color-tile-cursor`) — the
  board-only token the cursor's focus ring is drawn in, distinct from the
  tile edge it covers (the shell's focus outlines keep
  `--color-focus-ring`); `PAN_MODIFIER` (`shiftKey`) — the key a drag
  holds to pan.
- `createBoardView({canvas, grid, createSkin, token})` → `{resize(width,
  height, pixelRatio), setGame(game), update(changed), repaint(), cellAt(x,
  y), cellRect(c) → {x, y, size}, scroll, scrollTo, scrollBy, pan(dx, dy),
  wheel(event) → taken, ensureVisible(c) → scrolled, setHidden(hidden),
  setPressed(cells), pressed, setCursor(c), cursor, hidden, layout,
  pixelRatio, canvas, dispose}` — `grid` is the square grid
  ([engine.md](engine.md)); `game` is the engine game whose `cellState` /
  `cellNumber` it draws; `createSkin` defaults to `createTileSkin`, `token`
  to the token reader. Positions are canvas CSS pixels.
- `mountBoardView({container, grid, win, ...})` → the view plus
  `destroy()`: a canvas filling `container`, refitted on container resize
  and device-pixel-ratio change, scrolled by the wheel and panned by a
  primary-button drag with `PAN_MODIFIER` held.

`js/classic2d/pointer-input.js` exports
- `BUTTON` (`LEFT` 0, `MIDDLE` 1, `RIGHT` 2).
- `pointerRules(profile?)` → the frozen input rules `{chordInputs,
  revealInputs, flagToggle, pressFeedback, releaseOffCell}` of a rule
  profile, the reference one by default ([engine.md](engine.md)).
- `createPointerInput({graph, game, onPress, onAction, rules?, active?})` →
  `{down(button, c), up(button, c), move(c), reset(), holding}` — `c` the
  cell under the pointer or -1; `onPress(cells)` on every change of the
  pressed set; `onAction(kind, c)` with `'reveal' | 'toggleFlag' | 'chord'`.
- `mountPointerInput({view, session, graph?, win?, rules?})` →
  `{input, destroy()}`.

`js/classic2d/cursor-input.js` exports
- `CURSOR_KEYS` (key code → `up`/`down`/`left`/`right`/`reveal`/`flag`/
  `chord`), `PAD_MAP` (`BTN` index → the same), `STICK_THRESHOLD`.
- `createCursorInput({grid, game, onPress, onAction, onCursor?, rules?,
  active?, delay?, interval?})` → `{cell, setCell(c), move(dx, dy),
  hold(source, dir), let(source, dir), tick(now), down(source, button),
  up(source, button), pad(poll, now), reset(), holding, moving}` — `button`
  is `'reveal' | 'flag' | 'chord'`; `poll` is a `GamepadReader` poll
  (`held`, `ls`) after the shell's held-button suppression.
- `mountCursorInput({view, session, grid?, win?, rules?, delay?,
  interval?})` → `{input, pad(poll, now?), destroy()}`.

`js/classic2d/mode.js` exports
- `MODE_ID` (`'classic-2d'`); `createClassic2DMode(report, {flow,
  lastChoice, createClient?, mount?, clock?, randomSeed?,
  generatingDelayMs?})` → the contract methods plus `hideBoard(hidden)`,
  `tick()`, `pad(poll, now)`, `retry()`, `playStandard()`, `loadChoice()`,
  `status()` → `{state, time, minesLeft}`, `boardHidden`; the contract's
  optional `replay(summary)` is the session's. `flow` is
  `{openBoardChoice(choice), show(), container(), hud({seconds, minesLeft}),
  board({width, height, mines}), generating(shown), failed(failure|null)}`;
  `mount` defaults to `{board: mountBoardView, pointer: mountPointerInput,
  cursor: mountCursorInput, sampler: mountSampler2D}`; without `sampler`
  no movement is recorded. The module head comment is the contract.

`js/classic2d/board-choice.js` exports
- `CHOICE_SIZES`, `sizeLabel(size)`, `customStatus(custom)` → `{ok, field,
  max, text}`, `readChoice({size, fields, noGuess}, fallbackCustom?)` → a
  board choice or null, `bindBoardChoice({root, onStart, onBack})` →
  `{show(choice, {played}), destroy()}`.

`js/classic2d/tile-skin.js` exports
- `MIN_TILE_SIZE` (41) — the smallest tile size the board view allows,
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
  `tests/fidelity/minesweeper-online.md`); its mines run from 0 to the
  smaller of the site's cap — every cell up to 36 cells, then the measured
  caps interpolated by cell count, rounded down — and the cell count minus
  one, so the first click is always safe. No-guess is never refused up
  front, however dense the board: a failed no-guess request gets the
  session's failure offer. A stored choice that does not normalise reads
  as `DEFAULT_CHOICE`, and an invalid one is never saved.
- **Session.** A session opens a closed board (`ready`). Before the first
  reveal a flag or chord goes straight to the engine, with no request
  and no event; the first reveal sends the board request for its cell
  with a fresh seed (`generating`), and actions are ignored until the
  answer. The "generating" event shows only after `GENERATING_DELAY_MS`
  and hides when the answer arrives. A board starts the timer and emits `started` then
  `changed` (`playing`); a failure — a no-guess board not found or the
  worker failing — emits `failed` with both offers, and the timer never
  starts: `retry` asks again with a new seed, `playStandard` turns no-guess
  off for the same size, both for the same first cell. A request token
  drops a late answer after `restart` or `leave`, which also cancel the
  client. Win or loss stops the timer and emits `finished`; `restart` and
  `leave` after the first click and before the end emit `abandoned` first.
  Every summary is `buildSummary` over the engine's counts or summary, the
  board identity, the seed, the generator version and the game's id — one
  `crypto.randomUUID()` drawn when the board arrives, so the in-progress
  summary and the final one name the same game for the records store.
- **Recording.** Each closed board opens a recorder
  (`startRecording`, [replay.md](replay.md)); `restart` and `leave` discard
  it after sealing the abandoned game's replay. The first reveal is recorded
  at time 0 (a flag or chord before it changes nothing and is not recorded),
  every later action the session hands to the engine at the timer's elapsed
  time, wasted ones included. The mines, seed and generator version are
  added when the board arrives; a board played standard after a no-guess
  failure starts a new recording of the standard board with its first
  reveal. `recording` is true while the game is started, unpaused and
  unfinished, and only then do the sampler's `recordSample` and
  `recordCursor` record. `finished` and `abandoned` carry the replay sealed
  with their summary.
- **Timer.** Elapsed time accumulates over running stretches: it starts
  when the board is ready (a pause while generating starts it paused),
  freezes on pause, and keeps its time once stopped; `seconds()` is whole
  seconds for the overlay, `elapsedMs()` whole milliseconds for the result.
- **Fit rule.** The view fits the board to whatever area it is given;
  `MIN_TILE_SIZE` was measured for the area below the overlay bar with
  16 px margins
  ([square-tile-skin.md § Minimum tile size](../domain/features/square-tile-skin.md)).
  A board that fits is centred and
  never scrolls; one that does not keeps `MIN_TILE_SIZE`, starts at its
  top-left corner and scrolls on the overflowing axis only. Tiles sit edge
  to edge.
- **Redraw.** `update(changed)` draws only the listed cells that are in
  view, through the skin's `drawTile`; a full repaint (background plus every
  visible tile) happens on `resize` with a new size or pixel ratio, on
  `setGame`, on a scroll, on showing a hidden board and on a theme change,
  which reaches the view as the skin's `redraw` callback. The background
  token is read on every full repaint. The canvas is sized in device pixels
  with a `setTransform(ratio…)`; all drawing is in CSS pixels.
- **Scrolling.** The scroll position is whole CSS pixels clamped to
  `0..maxScroll`, re-clamped on resize. The wheel scrolls only a board that
  overflows (a line is a tile, a page is the view, shift turns a vertical
  wheel horizontal); `ensureVisible` scrolls the least that shows a cell's
  whole tile, for the cursor.
- **Pressed feedback.** `setPressed` redraws only the cells that gain or
  lose the press; a pressed cell draws as `pressed` only while the game
  has it closed, and `setGame` clears the set.
- **Focus ring.** `setCursor` redraws the cell the ring leaves and the one
  it enters; the ring is stroked inside its own tile after the tile, so a
  cell redraw is enough to move it.
- **Pointer input.** Reveal and chord act on the release of the last reveal
  button, a flag on the right press; a left + right gesture acts on the left
  release, as a chord only. Every branch reads a profile marker, so a rule
  change is a profile change, not a new state machine. The mounted input
  listens for `mousedown` on the canvas and `mousemove` / `mouseup` / `blur`
  on the page (a second button held during the first fires no
  `pointerdown`), suppresses the context menu, takes input only while the
  session is `ready` or `playing` and not paused, and leaves a
  `PAN_MODIFIER` + primary press on a scrolling board to the pan.
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
  `pad(poll)`, which the shell's poll calls through the mode. Each move draws the ring on the
  new cell and calls `ensureVisible`; input is taken only while the session
  is `ready` or `playing` and not paused.
- **The mode.** `start` normalises the choice, saves it as the last board
  choice and mounts a fresh view, inputs and movement sampler; the inputs
  see the session through a gate that reads paused while the board is
  hidden and redraws a flag placed before the first reveal (the session
  emits no event then). `tick()` drives the sampler every frame, and the
  cursor input's moves reach it beside the view. The session's `changed`
  redraws the listed cells and pushes the overlay; its board arriving
  reports started and can-pause, a win or loss can-pause false and finished
  with the session's replay. `restart` and `leave` leave the session
  (cancelling a pending generation) and destroy the view, inputs and
  sampler, releasing the canvas; `restart` reopens the session's own
  choice. `hideBoard` pauses the session with the board (a no-op before the
  first click or after the end) and drops held inputs.
- **Hidden.** While hidden (the game is paused) a repaint draws the
  background only and `update` draws nothing; showing repaints the board.
- **The engine is the source.** The view keeps no cell state; every tile is
  read from the game when drawn.
- **Painter.** Each state is a flat fill plus at most a simple edge and a
  plain glyph — no gradients, shadows or patterns. Closed and flagged tiles
  carry an edge (`--color-tile-edge`, width `max(2, round(size / 12))`), so
  closed and revealed differ by more than colour. A revealed number is its
  digit in `--color-number-<n>`; zero draws no glyph. Tokens used:
  `--color-tile-{closed,edge,pressed,revealed,flagged,flag,mine,mine-glyph,
  exploded,wrong-flag,wrong-flag-mark}` and `--color-number-1`…`-8`.
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
- **`MIN_TILE_SIZE`** is the tile an Expert board (30 × 16) gets fitted
  below the in-game overlay bar with 16 px (`--space-4`) between the window
  edges, the bar and the board — 41 px in a 1366×768 window and in a
  1280×800 window standing in for the Steam Deck. Every state and number is
  legible at it in both themes (the browser test in
  `tests/tile-skin.test.mjs`). A new board size or bar height that shrinks
  the Expert tile changes it.
- **No second palette.** The module holds no literal colour; a new tile
  colour is a token in `css/tokens.css` with a dark value, held to the
  contrast contract by `tests/tokens.test.mjs`.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — board setup and its custom limits (and the free cell kept on small
  boards, a deliberate difference from the reference), the game session,
  timer and failure offer, the board view (fitting, scrolling or panning,
  hit-testing, per-cell redraw, the board hidden while paused), the
  pointer and cursor inputs and the mode.
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
  skin neither reads nor feeds.
- [input.md](input.md) — `Repeat`, `stickCurve`, `BTN` and the
  `GamepadReader` poll the cursor input reads, and the shell's Back buttons
  it leaves unmapped.
- [testing.md](testing.md) — `tests/classic2d-session.test.mjs` pins board
  setup, the last choice, the timer and the session;
  `tests/classic2d-view.test.mjs` the board view;
  `tests/classic2d-pointer.test.mjs` the pointer input;
  `tests/classic2d-cursor.test.mjs` the cursor input;
  `tests/classic2d-mode.test.mjs` the mode and board choice;
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
- Changing the fit rule, the layout or what triggers a full repaint
  (`boardLayout`, `repaint`, `resize` in `board-view.js`).
- Changing a pointer gesture or adding an input rule (`createPointerInput`,
  `pointerRules`, the profile markers in `js/engine/profiles.js`).
- Changing a key or controller binding, or the cursor's repeat
  (`CURSOR_KEYS`, `PAD_MAP`, `createCursorInput`).
- Adding board input that competes with panning (`mountBoardView`'s pointer
  and wheel listeners, `PAN_MODIFIER`).
- Changing how a state looks, or adding a state (the `paintTileWith` switch
  and `TILE_STATES`, which the cache builds from).
- Changing the cache key or what invalidates it (`drawTile`, the
  `onThemeChange` subscription).
- A legibility failure in the browser test: read its per-tile glyph pixel
  counts and the screenshots it saved before changing a token or the glyph
  geometry.
