# Testing — unit tests, test scripts, browser verification

## OVERVIEW

Two layers: Node unit tests for the DOM-free modules, and Playwright-driven
browser checks for everything that needs WebGL or the DOM.

- `tests/engine-graph.test.mjs` — the cell graph (`js/engine/graph.js`) and the
  square-grid provider (`js/engine/square-grid.js`): construction from lists
  and flat arrays, immutability, invalid input, index/colRow round-trip,
  neighbour counts and the pinned neighbour order, symmetry, large-board build
  time, and that `js/engine/` is DOM-free and imports no separate 3D engine module.
- `tests/engine-box-grid.test.mjs` — the box graph provider
  (`js/engine/box-grid.js`): dimensions 1 .. 100, immutability, the index
  layout and `coords` round-trip, the pinned neighbour order and every access
  path against a reference enumeration, range checks, neighbour counts
  (7/11/17/26) and symmetry, 1 × 1 × 1 and 1 × 1 × N boxes, a
  100 × 100 × 100 build without per-cell allocation, the rules engine, placer
  and solver taking the box graph unchanged, DOM-free.
- `tests/engine-3d-profile.test.mjs` — the 3D rule profile
  (`minesweeper-3d`) on the box graph: the profile entry (version 2 current,
  version 1 kept, differing only by `revealedUnflag`), numbers, no mines
  placed by the engine, the mine cap, the flood that stops at a zero with a
  flagged neighbour, reveal on a revealed zero, chord, version 1's mass flag
  and unflag from a revealed cell, version 2's own-batch undo (hand and
  another number's flags kept, an empty batch one wasted click, a hand
  unflag leaving the batch, a flag-all over a live batch, the batch kept
  through an auto-hide, early flags hand-placed, snapshot and restore
  carrying membership), auto-hide and un-hide, the win without flags, the
  loss, changed cells, counts (a flag click on a revealed cell is one click,
  3BV over the box), a 100 × 100 × 100 performance test, and randomized
  comparisons against a naive full-pass port of the original (version 1)
  and of it with each number's batch (version 2) while the game is
  playing.
- `tests/engine-3d-view.test.mjs` — the 3D state view
  (`js/engine/state-view-3d.js`): geometry, a fresh view, pressed, flagged
  and unlinked after reveal, flag, mass flag, chord, hide and un-hide, the
  win and the loss presentation, awaiting the first click, the dirty drain,
  the change counter, the graph check, and the 100 × 100 × 100 memory
  figures the 3D board graph feature document records.
- `tests/engine-rules.test.mjs` — the rules engine (`js/engine/rules.js`,
  `js/engine/profiles.js`): the profile table, creation from a mine count or a
  mine set, the first-click hand-off, reveal/flood fill, flags, chord, the loss
  view, actions outside playing, iterative flood fill on 1000 × 1000, the
  cell-state vocabulary, the shared `changed` buffer, the action stream,
  determinism, and play over a non-square graph.
- `tests/engine-metrics.test.mjs` — 3BV, 3BV solved, effective/wasted click
  counts (`js/engine/metrics.js` and through the engine), `counts()` mid-game
  and `summary()` at a win or a loss.
- `tests/engine-fidelity.test.mjs` — the reference ruleset (profile
  `minesweeper-online`, version 1) against `tests/fidelity/minesweeper-online.md`;
  each test cites an entry by heading, and one test checks that every engine
  entry in the file is pinned and every profile marker cites an entry.
- `tests/fidelity/minesweeper-online.md` — the observation file: one entry per
  rule of Minesweeper Online with default options, each with its date, source
  (client code, help, live play) and confidence, and the tasks it serves —
  the engine rules, and the Classic 2D input entries (which inputs chord,
  flag timing, pressed feedback, releasing off the pressed cell) and the
  largest custom board.
- `tests/generation-placer.test.mjs` — the seeded source
  (`js/generation/random.js`: pinned first outputs, seed range, `int(n)`
  range, no `Math.random`) and the placer (`js/generation/placer.js`):
  distinct ascending cells never on the first click, the pinned Expert board,
  every other cell reachable (neighbours included), the densest legal board,
  impossible and malformed requests, a non-square graph, the rules engine
  accepting the mine set, and the version-bump rule stated in the module
  headers; the marked start cell (`js/generation/start-cell.js`) for square
  and box descriptions, odd and even sides and sides of 1, pure and
  DOM-free, a request input that changes no generator.
- `tests/generation-solver.test.mjs` — the solver (`js/generation/solver.js`)
  on hand-built boards with a known answer (single-cell only, the 1-2-1 wall
  through the subset stage, the remaining-mine count through the global
  stage, exactly one guess, a guess only at the end), agreement with an
  exhaustive reference on random small square boards and a 4 × 4 torus, that
  it learns the board only through `open()` on deduced-safe cells, that a
  group over its enumeration budget only loses deductions, an Expert board
  within a second.
- `tests/generation-noguess.test.mjs` — `generate()`
  (`js/generation/generate.js`): a standard board is the placer's first
  draw, the pinned no-guess board, candidates drawn one after another from
  one source, every accepted Beginner/Intermediate/Expert no-guess board
  (300/150/60 seeds) clearing with the solver, the exhausted-budget failure,
  rejected requests, the recorded attempt budget, DOM-free and importing no separate
  3D engine module; the progress callback at most every
  `PROGRESS_INTERVAL_MS` on a fake clock, never changing a board, silent on
  a standard request; a box board for its marked start cell rebuilt from
  its seed.
- `tests/generation-client.test.mjs` — the worker handler
  (`js/generation/worker.js::handleMessage`: reply per id, agreement with
  Node `generate()`, structured-clone data, rejected requests as failure
  messages, no state between requests) and the client
  (`js/generation/client.js`) over a fake worker: lazy worker reuse,
  cancellation, one request in flight, stale replies ignored, worker errors,
  undecodable replies (`messageerror`, the fake worker's `onmessageerror`),
  the module-worker default, and no generation import in the client; the
  warm-up message and its reply, `warm()` (once per worker, never a board,
  never settling a request, a fresh worker after a cancel, false on a
  failing worker), the worker's progress messages before its result, and
  per-request progress with a superseded or cancelled id's dropped.
- `tests/platform-storage.test.mjs` — the storage interface
  (`js/platform/storage.js`) over the memory backend: registration and its
  malformed declarations, `{ version, data }` round-trips, no cache, every
  upgrade path saved back, async steps, a failed save-back, newer documents
  refused on load and save, corrupt and unreadable documents kept aside,
  failing `onIssue` handlers, failed and non-serialisable saves, `clear()`
  (registered, unregistered, kept-aside and newer documents gone, an
  unavailable backend still cleared, a throwing backend clear reported, never
  rejected), the memory backend itself, and that `js/platform/` is DOM-free.
- `tests/platform-browser.test.mjs` — the browser backend
  (`js/platform/browser-backend.js`) over a `FakeStorage` with an optional
  quota: namespaced keys, the legacy `ms3d.*` keys never touched, blocked,
  throwing, missing and full storage, the kept-aside copy, `clear()`
  removing every document and kept-aside key and no other, the platform
  module's start-up selection (`js/platform/index.js`), that no other module
  imports a backend, and one Playwright test that a saved document survives
  a page reload (skipped when Playwright or chromium is unavailable).
- `tests/platform-blob-store.test.mjs` — the blob store
  (`js/platform/blob-store.js`, `memory-blob-store.js`,
  `indexeddb-blob-store.js`): asynchronous calls, byte-for-byte and empty
  round-trips, a missing name, the store's own copies (a view onto a larger
  buffer too), replacement, sorted listing, delete, bad names and bytes
  thrown at once, refused writes reported and failed reads rejected, the
  seeded memory implementation, the opened implementation persisting and
  the memory fallback when opening throws, rejects or gives nothing, calls
  waiting for the one open, IndexedDB refusing to open (missing, blocked,
  failed), the fixed database names, the platform module's `blobStore`
  falling back to memory without IndexedDB and writing nothing to
  `localStorage`, that only `js/platform/index.js` imports an
  implementation and the interface and memory store are DOM-free, and one
  Playwright test that a blob survives a page reload in IndexedDB (skipped
  when Playwright or chromium is unavailable).
- `tests/records-board.test.mjs` — the board identity (`js/records/board.js`):
  the six frozen fields and the impossible values that throw, the standard
  boards, the key pinned for the standard and custom boards, the same fields
  giving the same key and every field taking part, `parseBoardKey` giving
  back the identity and throwing on a malformed or impossible key, the labels (standard,
  custom, a custom board matching a standard size, standard sizes only on
  the square grid), and the module DOM-free, importing nothing and
  documenting its key format.
- `tests/records-board-3d.test.mjs` — the 3D board identity
  (`js/records/board.js`): `MODE_3D`, the six frozen fields with no grid,
  dimensions 1 .. 100 and mines 1 .. cells − 1, a 2D identity unchanged;
  `PRESETS_3D` equal to the 3D board choice's `PRESETS` and `preset3D`
  recognising them by exact size and mine count, never for a 2D board; the
  3D key pinned for the presets and custom boards, never equal to a 2D key,
  every field taking part, parsed back and throwing on a malformed or
  impossible key, a former double layer board keeping its key; the preset
  and custom labels, a custom board matching a preset labelled as it, a
  former double layer board labelled as custom; and the 3D key form
  documented in the module.
- `tests/records-summary.test.mjs` — the summary builder
  (`js/records/summary.js`) over real engine games: won, lost and abandoned
  records with every field, no summary before the first click, a stated
  outcome agreeing with the engine, default id and end date, the pause
  count and paused time (included in the elapsed time, a paused game still
  eligible), counted clicks,
  3BV/s and efficiency, zero divisors as not available, the built record's
  stats matching the exported functions, best eligibility, the invalid
  inputs that throw, and the module DOM-free and importing no separate 3D
  engine module.
- `tests/records-summary-3d.test.mjs` — 3D summaries: the builder over real
  3D games (`create3DGame`) with the 3D board identity — won, lost and
  abandoned records, no summary before the first click, a right-click on a
  revealed cell counted as one flag click in efficiency, invalid 3D input
  that throws, safe cells spanning the depth — and the 3D adapter
  (`create3DMode`) over a real session and the mode host: the started
  game's summary so far, game finished and game abandoned on restart with
  the builder's summary and one id per game, the pause count and paused
  time with the clock running through a pause (and one left open at a
  restart), and a fixed board's null.
- `tests/records-model.test.mjs` — the records model
  (`js/records/model.js`) over built summaries: three bests per board from
  won games only, replaced only when strictly better and independently, a
  tie keeping the earlier holder, an unavailable stat never a best, each
  exact board its own; per-board and Classic 2D overall counters and
  streaks, derived win rate; the completed counters (a win extends the
  completed streak, a loss ends it, an abandoned game leaves it) and the
  completed win rate per board and per mode; the history in play order and compact,
  JSON-safe form, carrying each game's pause count and paused time, an
  entry or summary without them reading as none; the comparison against the bests before the game; the same
  id twice a no-op, unrecordable summaries throwing; the rebuild from history
  equal to the incremental records; the documents, boards-played order,
  queries by identity or key returning copies, and the module DOM-free and
  storage-free.
- `tests/records-model-3d.test.mjs` — 3D boards in the records
  (`js/records/model.js`, `js/records/store.js`): bests and the comparison
  on 3D boards, each 3D board, its no-guess twin and a 2D board keeping
  their own; per-mode overall counters, a 3D game never moving a Classic 2D
  streak nor the reverse, an abandoned 3D game a loss for its board and
  mode, every mode at zero from the start; `boardsPlayed` by mode — the 3D
  cube presets in menu order then custom boards by last played, a former
  double layer board among them, Classic 2D the
  default and no mode listing another's boards; the per-mode counters,
  completed ones included, rebuilt from the history; and the records format
  steps — `RECORDS_VERSION` 3, `upgradeRecords` carrying m1 boards and
  Classic 2D counters over, starting 3D at zero and keeping 3D counters
  already present, an m1 document loaded with its completed counters
  derived from the history and saved back at the current version, a newer
  document refused untouched, and an m1 build refusing the stepped-up
  document.
- `tests/records-store.test.mjs` — the records store
  (`js/records/store.js`) over platform storage on the memory backend: the
  three documents registered at their versions, a single load, use before
  load throwing, memory-first saves, survival across a reload, `onChange`
  and a throwing listener, a failed save reported once, a missing or corrupt
  records document rebuilt from the history, a version 2 document gaining
  its completed counters from the history and saved back at version 3
  (which a version 2 build refuses as newer) or, with no history, keeping
  its counters with the completed ones at zero, unavailable storage, newer and
  unreadable documents left untouched with empty unsaved records, the
  `attach` hooks (abandoned, in-progress begin then checkpoint, a fixed 3D
  board's null summary ignored), the marker cleared by its own game and kept
  by another, a late checkpoint not reviving it, a leftover marker settled
  at load as a streak-ending loss or a no-op when already recorded, a
  history from before pauses loading unchanged and one with malformed
  pause fields refused, three
  runs through the real mode host and pause controller with a fake mode —
  closed mid-game, restart, finished — and the queries.
- `tests/records-screen.test.mjs` — the Records screen
  (`js/records/screen.js`) over a records model or a fake store: the picker's
  standard then custom boards, the last board played, the board opened (asked
  for, last played, Beginner), the bests with dates, counters and Classic 2D
  overall figures, the completed-games win rate and best streak beside the
  reference ones and their labels, the results screen's time format, the date, win-rate and
  dash formats, the empty state, unreadable records never throwing or
  blocking Back, the not-saving notice told once, the controller's live
  update and unsubscribe, a new custom board joining the picker live, and
  the module DOM-free apart from the view binder; static checks of the
  `#records` kit markup, its router entry, default focus, controller layer
  and Back in `js/main.js`, and its catalogue entry. One Playwright test
  opens the screen from the menu on the last board played, chooses a board
  in the picker and returns with Back (skipped when Playwright or chromium
  is unavailable).
- `tests/records-screen-3d.test.mjs` — the Records screen for 3D
  (`js/records/screen.js`) over a records model or a fake store: the 2D | 3D
  switch and the content's chosen mode, the 3D picker's three cube presets
  with and without no-guess then the custom 3D boards played under their 3D
  labels, a former double layer board among them under its size,
  a board key alone setting the switch, a mode alone opening on its last
  board played or its first board, the last game played choosing mode and
  board, the chosen 3D board's figures and the 3D overall figures (the
  completed ones leaving a restarted game out),
  `setMode` on the first games page, Open taking a mode beside a board key,
  Watch from a 3D board returning there, and the results screen's Records
  opening a 3D game's board; static checks of the `#records-mode` kit
  markup above the picker, the `records` route passing mode and board, the
  switch's wiring and its catalogue entry. One Playwright test operates the
  switch by mouse, keyboard and controller (skipped when Playwright or
  chromium is unavailable).
- `tests/records-history.test.mjs` — the history chart and games list
  (`js/records/history-chart.js` and its use in `js/records/screen.js`): the
  chart points, `niceCeiling`, the scale (both axes, one game in the middle,
  gaps, efficiency above 100%), the text alternative, drawing over a fake
  canvas in the `CHART_TOKENS` colours, the module DOM-free with no chart
  library and no literal colour, sizing at the pixel ratio and redrawing on
  a theme change and a resize until destroyed; `pageOf` and a long history
  paged fast; the games list newest first in the results formats, paged and
  clamped; unreadable history; the controller's paging and live redraw; the
  `#records-history` markup and the view's chart and pager wiring. One
  Playwright test charts a seeded history in both themes (saving
  screenshots) and pages the games list by keyboard (skipped when
  Playwright or chromium is unavailable).
- `tests/records-replays.test.mjs` — the library view
  (`js/records/replay-list.js` and its place in `js/records/screen.js`)
  over a fake replay library: the board's rows, their fields and order, the
  pin state, the pinned-first filter, the empty state and a missing or
  broken library, Pin / Unpin and the live redraw through the library's
  change notification, Watch on the replays, bests and recent games only
  once the `replay` route is registered and routing back to the board, the
  not-saving notice told once and not to a screen left before the load;
  the module DOM-free apart from its binder; static checks of the
  `#records-replays` markup, the wiring in `js/main.js` and the catalogue
  entry. One Playwright test lists, pins by keyboard keeping focus,
  filters, watches and shows the empty state (skipped when Playwright or
  chromium is unavailable).
- `tests/results.test.mjs` — the results screen (`js/results/`): the time
  format (thousandths, truncated, the one time formatter in the view, the
  pause card's `pauseLine` through it and no `fmtTime` left in `js/ui.js`),
  signed differences and "= best" at display precision, 3BV/s, efficiency
  to one decimal, the click row and the dash; `resultsContent` for a win
  (stats, the three bests with their differences, delta directions and new
  bests, the banner and highlighted stats, the second row with the rank),
  a loss (3BV solved, the greyed not-eligible comparison with the pace and
  its dash with no 3BV solved, no best yet), the next-target line in each
  of its forms, the standing line (win rate and longest streak, each with
  its completed-games figure), a missing stat, and a failed recording (no
  standing line); `createResultsView`
  over a fake root (a win's `data-delta` per best, a loss's
  `ui-panel--muted` and not-eligible note, a win's colours cleared on the
  next loss), the standing line shown and hidden; the flow over fakes
  — the streak read before recording and the counters, history, win rate
  and completed win rate after,
  the rank with ties to the earlier game, recorded before the screen shows
  and routed with the comparison, rank, streak and standing, a 3D record recorded and
  routed, a fixed 3D board's null summary ignored, a throwing recording or
  query still routed, "not being saved" told once, Play again / Records /
  Back to menu — and DOM-free; the keys — `resultsEnter` (Play again on
  Play again or no focus, another action's own Enter, a repeat ignored),
  `R` as Play again on `results` only through `restartInput` and the one
  `KeyR` in `js/main.js`, and a key that ended the end delay
  (`createEndSkip`) consumed through its repeat and release so it does
  not also play again; static checks of the `#results` kit markup
  in reading order with its `R: Play again` hint, its router entry, default focus, controller layer and
  the flow on the hand-off in `js/main.js`, the `ui-stat__detail`,
  `data-delta`, `ui-panel--muted` and `ui-banner` catalogue entries and
  gallery, and the delta colours' 4.5:1 contrast on the bests panel in
  both themes. One Playwright test wins a fixed Beginner board through the
  shell with the overlay's click count checked before the first click,
  after it and at the end, the win's end effect on the board and the
  results card only after the end delay, checks the results screen
  (formats, banner,
  highlights, second row, next target, standing line, the game's figures
  larger than the bests), opens Records on that board and returns with
  Back, plays again with Enter, wins the same board again and cuts its end
  delay with `R` (the card at once, the held, repeating and released `R`
  not playing again), leaves Ctrl+R to the browser and plays again with
  `R`, then loses — the loss wave from the exploded tile, a click during
  the delay showing the card at once, the game recorded lost — and Enter on
  a focused Main menu goes to the menu (skipped when Playwright or
  chromium is unavailable).
- `tests/mode3d-end.test.mjs` — the 3D end sequence and the results
  takeover (`js/shell/mode-3d.js`, `js/main.js`, `js/results/view.js`) over
  a fake session and a fake clock: `END_DELAY_MS` one second for a win and
  a loss, can-pause off at once and finished reported once after the delay
  with the game's summary at its end, a pause ignored during the delay, a
  hidden tab still reporting at the delay's end, a lost graphics context
  reporting finished before the failure, a page going away ending the delay
  as finished, never abandoned, a fixed board still reported finished, and
  a game no longer held reporting nothing; the skip over the adapter
  (`createEndSkip` as `js/main.js` builds it): a key, mouse button or
  controller button pressed during the delay reporting finished at once
  and consumed, a held key's repeat, a release and a still poll neither
  ending it, the skipping mouse press consumed through its release and
  trusted clicks until the next press, key or controller press (a script's
  click going through), every click consumed during the delay, `reset()`
  forgetting a release lost to another tab, and a lock released during the delay
  ending it; static checks that the end
  banner, its compact form and its best-time line are gone, that every
  pause in `js/main.js` goes through `pauseGame` and `endDelay()` reads
  either mode's `ending`, that the skip's listeners swallow in the capture
  phase and `handlePad` and `onLockChange` feed it, that Back, the browser's
  Back and camera movement are ignored during the delay, that the 3D flow
  releases pointer lock, that no frame is drawn under a 3D game's results
  screen and that the results screen takes over on an opaque surface over
  3D only. One Playwright test wins and loses a 3D board through the shell
  and lands on the results screen over the scene, the overlay's frozen
  click count matching the recorded game's and the card carrying the click
  row, the rank, the banner and the next target; another, over a stand-in
  pointer lock, wins a board and clicks during the delay — the results at
  once, recorded won — plays again with `R`, entering locked play with the
  ready card never shown, then, the lock refused, plays again with Enter
  and gets the ready card with its message (both skipped when Playwright
  or chromium is unavailable).
- `tests/results-watch.test.mjs` — Watch replay on the results screen
  (`js/results/flow.js`, `js/results/view.js`): offered only for a game
  that handed over its replay and while the viewer's route is registered,
  the content carrying it, the route opened with the finished game's own
  replay, saved or not, and the results screen to return to, Back
  returning there; the `#r-watch` markup beside Play again and its wiring
  in `js/main.js`. One Playwright test wins a fixed Beginner board through
  the shell, watches it from the results screen by mouse, keyboard and
  controller, then again from the Records screen's library view (skipped
  when Playwright or chromium is unavailable).
- `tests/gamepad.test.mjs` — controller helpers (`js/gamepad.js`), analog camera
  (`js/input.js::FlyCamera`), `js/controls.js::Controls`, and trigger sequences
  through `js/input.js::MouseActions`.
- `tests/audio-flag.test.mjs` — the flag sound's voice (`js/audio.js`
  `flagVoice`): count 1 the single flag sound with no step, steps and level
  never falling and capped at 26, counts 1, 2, 4, 8 and 16 distinct, an
  unflag the mirror of a flag; `Sfx.flag` over recorded primitives: count 1
  the single flag sound, placed and removed, a mass flag's rising steps and an
  undo's as many falling ones through the same ratios, louder with more
  cells.
- `tests/render-3d-flag-flash.test.mjs` — the flash of a flag click on a
  number (`js/render.js` through the resolve hook, `js/main.js`):
  `flashEnvelope` rising to its peak and gone within `FLASH_S`; static
  checks of the depth-test-free `FLASH` material, `_tickFlashes` visiting
  the flashing cells only, `isAnimating`, the drops in `setGame`, `sync`'s
  end of game and `_endEffects`, `onAction` flashing only on a revealed
  number, and no flash in the replay viewer. One Playwright test on a fixed
  4 × 3 × 1 board: the ready card's and the help surfaces' right-click
  copy, a flag-all making `isAnimating()` true, then false within the
  flash, the mines figure in `--color-danger` below zero at 4.5:1 or better
  in both themes and back to normal above it, the undo flashing, a hand
  flag not, a loss and a new game dropping a running flash (skipped when
  Playwright or chromium is unavailable).
- `tests/render-3d-feedback.test.mjs` — the renderer's Ctrl ghosts and
  "solved" pulse (`js/render.js`, imported in Node through a resolve hook that
  maps `three` to `vendor/three/`): `GHOST_ALPHA` 0.25 and its use for hidden
  cells under Ctrl in the transparent pass; `pulseEnvelope` rising, then
  fading to alpha 0 and done within `PULSE_GLOW_S + PULSE_FADE_S` (< 0.5 s);
  static checks of the opaque list, the transparent sort, the pulse's start
  and ends and `_tickPulses` visiting the pulsing cells only. One Playwright
  test on a fixed 6 × 1 × 1 row: a flag that hides a number makes
  `isAnimating()` true, then false within the pulse, with picking passing
  through at once; Ctrl (with Shift too) counts the hidden cell in
  `stats.trans`, not `stats.opaque`; unflagging during a pulse and a loss
  drop it (skipped when Playwright or chromium is unavailable).
- `tests/shell-pause-esc.test.mjs` — the pause card's Esc rule
  (`js/input.js::escResumes`): the press that came while the lock held and a
  held Esc's auto-repeat do not resume, any other press does, with no time
  input; static checks of `Input.lastKey` and `resumeFromPause`. One
  Playwright test plays the lock and its release with a stand-in
  `document.pointerLockElement` and `pointerlockchange`: an Esc right after
  the release resumes, auto-repeat does not, a releasing press delivered
  while locked pauses and only the next one resumes, an ended game's Esc goes
  to the menu (skipped when Playwright or chromium is unavailable).
- `tests/readability-3d.test.mjs` — the 3D readability aids (`js/readability.js`, `js/render.js`,
  `js/main.js`): `aimReadout` over hand-built 3D state views (inner, face, edge and corner counts,
  hidden neighbours counted as neither, flags apart, nothing off a revealed number or once the game
  is over) and `readoutText` (`cubes N`, `- flags M` only above zero); the module DOM-free; the
  readout's token-only styles and markup; the Shift back pass (faded cubes before the opaque pass,
  the neighbourhood's transparent cubes after it, the canvas kept opaque); `spaceAlpha` (0.7 nearest,
  never increasing, a 0.1 floor) and `boxDepth`, and the shader sharing them. One Playwright test on
  a fixed 4 × 3 × 1 board: the readout's text on an aimed number and its hiding off it, before the
  first reveal, with the setting off, while paused, in the end delay and in Classic 2D, clear of
  the off-screen arrow's ring (skipped when Playwright or chromium is unavailable).
- `tests/camera-spawn.test.mjs` — the 3D spawn pose (`js/input.js::spawnPose`)
  for the cube presets and 1 × 1 × 2, 30 × 16 × 1, 100 × 100 × 100 and
  2 × 9 × 40 at 16:9, 4:3, 21:9 and 9:16 and 45° and 90°, against
  three.js's own projection (vendored `three.module.min.js`): its named
  angles, every corner inside the margin, the camera beyond the near, top
  and one side face planes, no closer pose unless the face clearance binds,
  and `pickCell` aiming at the near face's centre cube; the spacing;
  `FlyCamera.place`; the off-screen arrow (`offscreenArrow`) hidden with any
  part of the box in view and its angle right, left, up, down and behind;
  static checks that every start goes through `placeAtSpawn` and of the
  Home / R wiring. One Playwright test: the framed start, Home and R
  returning during play at the current spacing with Home's default stopped,
  the arrow, nothing while paused or in the end delay, and the pause card's
  "Back to start" after Resume, resuming, absent on an ended game and in
  Classic 2D (skipped when Playwright or chromium is unavailable).
- `tests/input-drag-look.test.mjs` — the drag-to-look gesture (`DragLook`
  in `js/input.js`) over real `MouseActions`: a press released under the
  threshold reveals, flags or chords as in locked play; past the threshold
  the camera turns and the release, a chord and any press made during the
  drag act on nothing; movement with no button turns nothing; `reset`; the
  turn through `FlyCamera.look` honouring sensitivity and invert Y; and a
  static check that `Input` routes unlocked mouse events through it, and
  that a lock request reports its failure once across its two signals.
- `tests/tokens.test.mjs` — the token sheet (`css/tokens.css`, parsed as text):
  full token set on `:root`, semantic (non-hue) names, a dark value for every
  colour token, z-layer order, WCAG contrast per theme (4.5:1 body text, 3:1
  large text and essential glyphs, on every surface), the tile tokens (every
  tile state, the cube-face recipe's bands and shading, the board frame and
  gap, numbers 1–8, opaque, and the recipe's translucent layers, in both
  themes; no `--color-tile-edge`; the light recipe tokens equal to the 3D
  atlas palette `ATLAS` read from `js/textures.js`'s source, the shades
  computed as the atlas does; dark faces and bands differing from light;
  eight distinct light number colours, each 4.5:1 on both ends of the
  shaded revealed face; a lit and a shaded bevel and distinct rims; the
  cursor ring `--color-tile-cursor` 3:1 on the lit bevel and on the closed
  face, its shade, the pressed and the revealed tiles), `css/style.css` declaring
  no variables and reading only declared tokens, `index.html` loading
  `css/tokens.css` before `css/style.css`, the sky tokens (`--color-scene-*`,
  opaque, light values the original sky, dark values no lighter than the dark
  backdrop highlight), the backdrop-scrim tokens (translucent, light values the
  original tints) and the Controls modal and overlay scrims reading them with
  no literal colour, and the 3D renderer and `js/tile-art.js` not reading
  tokens.
- `tests/theme.test.mjs` — the theme applier (`js/theme.js`, run in a `node:vm`
  context against a stub root) and the token reader (`js/tokens.js`): Light
  before first paint, stored-getter fallback (missing, unknown, throwing),
  `setTheme` normalisation and listener order/isolation, `index.html` running
  the applier as a classic script before the stylesheets and module graph,
  `token()` values per theme, `onThemeChange` timing, the visible fallback
  colour and its development-only log, no copy of token values in
  `js/tokens.js`, the 3D renderer and `js/tile-art.js` never subscribing to
  theme changes; the
  scene palette (`js/shell/scene-palette.js`: `parseRgb`, `scenePalette`,
  `bindScenePalette` handing the renderer the active theme's sky at start-up
  and on a theme change), `js/main.js` binding it with a redraw, the
  renderer's sky carrying no constant colour, and only the sky being themed
  (neither the atlas nor the recipe it draws through).
- `tests/components.test.mjs` — the component kit (`css/components.css`,
  `js/ui/components.js`, `dev/components.html`): tokens only, no literal
  colour, no theme-specific rule, no animation but the `ui-spinner` turn; the head-comment catalogue
  documents every component and composition; every interactive component's
  states and focus ring; the `<head>` order of `index.html` and the gallery;
  the gallery showing every component in every state, the overlay bar and
  the results layout; controller reachability and accessible names; the
  helpers (`decimalsOf`, `formatSliderValue`, `segmentedTargetIndex`,
  `segmentedState`, `formatOverlayTime`, `formatMineCount` with no upper
  clamp and −99 kept, `mineCounterDigits`, the binders over stub elements);
  the HUD overlay bar markup (Time, Mines, Clicks, then the board),
  `UI.updateHud`'s formats and its click count written only on change, both
  modes' click feed in `js/main.js`, `UI.setBoard` /
  `setBoard2D` sizing `#hud-mines` to the board's digits past three, and a
  board of up to 999 mines left as today (no width of its own, left-aligned),
  with tabular figures, and the pause wiring (`onPause`, controller START); the shell's
  vocabulary (Main menu on every control that goes to the menu and no Back
  to menu label anywhere; Restart only while a game is unfinished, Play
  again once it ended, the confirmations' wording); the main menu and pause
  card built only from kit classes with no one-off rules left in
  `css/style.css`; the segmented choice's horizontal (Left/Right-only) mode;
  the "Esc: Back" hint beside each Back Esc triggers and none beside the
  pause card's Main menu. Four Playwright tests check the WCAG contrast contract
  in both themes on rendered pages: the gallery (plus a visible focus ring
  on every forced-focus control), the overlay bar over the running 3D scene
  (opaque surface, timer pinned at `999`, pause through the button), and the
  menu, the main menu's Controls panel, pause card, the 3D generating card
  (spinner, Cancel) and failure offer (three buttons) over stand-in
  generation workers, and results layout (plus
  focus rings, the renderer's sky following the theme and an unchanged
  `__ms` key list), and the "Esc: Back" hints on both board choices, the
  ready card, Settings and Records (none a focus stop); each skips when
  Playwright or chromium is unavailable.
- `tests/tile-skin.test.mjs` — the Classic 2D tile skin
  (`js/classic2d/tile-skin.js`) over a recording fake Canvas 2D context and
  the token maps parsed from `css/tokens.css` per theme (the fake records
  gradients with their stops, answers `measureText` and reports the scale it
  was set to): the states are the engine cell states plus `pressed`, each
  state's own tile tokens in both themes drawn at its position, each state
  drawn through the shared recipe `js/tile-art.js` with its tokens (the
  skin's trace equal to the recipe's, at pixel ratios 1 and 2), the raised
  face of closed and flagged, the sunken pressed face, relief and border
  telling closed from revealed, the 3D number glyph (shadow, outline of its
  hue, heavy weight) and no glyph for zero, the wrong flag's flag under the
  cross with no mine, the bands scaling with the tile and whole device
  pixels at least one wide at 26 px and `MIN_TILE_SIZE`, the placeholder for
  an unknown state or number, `paintTile` reading through the token reader,
  the cache (every state and number pre-rendered once, a redraw only image
  copies, keyed by size, pixel ratio and theme, dropped on a theme change
  before the renderer's redraw, `dispose` unsubscribing), `MIN_TILE_SIZE`
  26, the skin DOM-free at import with no literal colour and no three.js,
  and the recipe importing nothing, reading no token and holding no colour,
  with the atlas drawing through it and keeping no copy. Two Playwright
  tests (skipped when Playwright or chromium is unavailable): one checks
  that Expert fits a 1024 px wide window in the framed panel at
  `MIN_TILE_SIZE` or more — at the floor from the height the measured
  readouts leave room for, scrolling a pixel below it — and that every
  state and number shows its glyph at 26 px and `MIN_TILE_SIZE`, at pixel
  ratios 1 and 2, in both themes, with screenshots; one digests every 3D
  atlas layer `drawLayer` draws and compares it with the digests recorded
  before the atlas drew through the shared recipe, where a probe drawing
  digests as it did then (skipped otherwise, since text and anti-aliasing
  depend on the browser).
- `tests/classic2d-session.test.mjs` — Classic 2D board setup
  (`js/classic2d/board-setup.js`) and the game session
  (`js/classic2d/session.js`) over a fake generation client and a fake
  clock: the standard sizes and no-guess switch mapped to the square graph
  and the generation request, invalid choices, `CUSTOM_LIMITS` and the mine
  cap (measured and interpolated, at most the cell count minus one, a dense
  board keeping no-guess), `normaliseChoice`, the last choice document over
  the memory backend (no-guess on with nothing stored, a stored no-guess
  off kept), the timer running through pauses and its pause spans; the
  session's closed board, first-click
  request, the delayed "generating" state, the timer starting at the
  board, a standard first click placed at once (no request, no
  generating, the worker's own answer, the timer from the click), a
  pre-generated board on its mark (arrived or in flight, its seed
  recorded and rebuilding the board), discarded by a click elsewhere,
  failed and asked afresh, discarded by restart, leave and cancel, the
  progress while generating, Play a standard board from generating, actions and `changed`, win and loss with `buildSummary`
  summaries, one summary id per game, pause (also while generating, and
  one left open at an abandon) with the clock running and the summaries'
  pause count and paused time, the no-guess and worker
  failures with Retry and Play a standard board and their count of
  failures in a row, `cancel` while generating back to the closed board
  (the client cancelled, nothing reported, the next first click asking
  afresh), restart and leave
  (abandoned reports, cancelled generation, a late answer dropped), actions
  ignored while generating; both modules DOM-free and reaching generation
  only through the client.
- `tests/classic2d-end-effect.test.mjs` — the Classic 2D end effect
  (`js/classic2d/end-effect.js`): the 2D `END_DELAY_MS` about one second
  and of the 3D one's order, the loss wave's reach (zero at the exploded
  tile, proportional to the distance, at most `WAVE_STEP_MS` a tile, the
  farthest tile within the delay on Beginner, Expert and 100 × 100 from
  corners, centre and edge), pre-loss and won states, the win pulse
  passing the origin first and gone at the end, the centre for an unknown
  origin, the confetti inside the board's rectangle on boards from 2 × 1
  to 100 × 100 and none at the end, `done`, drawing with the colours
  handed in, and the module DOM-free with no literal colour.
- `tests/classic2d-view.test.mjs` — the Classic 2D board view
  (`js/classic2d/board-view.js`) over a fake canvas and a recording fake
  skin, with real engine games: the fit rule (the 26 px floor, the cap per
  board scale and the scales matching the settings' `boardScale`), Expert
  unclipped at 1024 × 768, 1280 × 800 and 1366 × 650 and in a 1024 px
  window with room for 16 rows at the floor, Beginner at 48 px at
  1280 × 800, the panel's rectangle around the view, a clipped board
  filling the area inside its frame, centred and scrolling layouts,
  `cellAt` in a fitted, a framed and a scrolled board, `cellRect`, the
  canvas sized at the pixel ratio, the background token under the board
  only, only changed cells redrawn after an action, full repaints on
  resize, pixel ratio, scale change (`onLayout` each refit) and the skin's
  theme redraw, only visible tiles drawn, clamped scrolling, the wheel,
  panning, `ensureVisible`, a clipped board's edge shadows and scroll bars
  (`clipMarks`, drawn only when it scrolls and kept over a redrawn tile),
  the ring shown and hidden redrawing one cell, the start-cell mark (a
  ring in the cursor ring's style from `--color-success`, redrawn on its
  cells only, under the cursor), the hidden board, the end
  effect (a loss's changed tiles drawn pre-loss until the wave reaches
  them, a redraw and a resize keeping the moment, the full end state at its
  end; a win's pulse at its origin first, its confetti clipped to the board
  in view, its mines turning to flags and the won board's end state with
  every unflagged mine a flag; none on a hidden board), and the
  module DOM-free with no literal colour. One Playwright test mounts the
  view below a 64 px bar with 16 px margins and checks tile size and pixel
  colours of Beginner and Expert in both themes (a tile's centre halfway
  along its face's shading), the clear canvas around a
  board that fits, a theme-change repaint, a 100 × 100 board scrolled by
  wheel, shift-drag and `ensureVisible` with its shaded edge and scroll bar,
  and a refit on window resize, with screenshots (skipped when Playwright
  or chromium is unavailable).
- `tests/classic2d-pointer.test.mjs` — the Classic 2D pointer input
  (`js/classic2d/pointer-input.js`) over real engine games: the profile's
  input markers and their fidelity entries, pressed feedback, reveal,
  middle as left, chord on a number, left + right through the left
  release, the flag on the right press (also under a held left), moving and
  releasing off the board, inactive boards and `reset`, rules other than
  the reference; the board view's `setPressed`; the mounted wiring over
  `EventTarget` fakes (context menu, shift-pan presses ignored, blur,
  `destroy`); DOM-free. One Playwright test plays a fixed Beginner board by
  mouse to a win (skipped when Playwright or chromium is unavailable).
- `tests/classic2d-button-swap.test.mjs` — the Classic 2D mouse button swap
  (`js/classic2d/button-swap.js`): the switch and its per-press
  translation, a release going to its press's button, `reset`; the mounted
  pointer wiring with a swap over real engine games and `EventTarget`
  fakes (a left press flagging and unflagging, a right press revealing on
  release, a number still chording, a press keeping its swap through a
  flip, blur and `destroy` forgetting presses, the shift-pan press still
  the pan's); the 3D overlay never showing the toggle. One Playwright test
  checks the toggle on the Classic 2D board — shown while unpaused, a
  swapped click, kept across games, never taking focus (skipped when
  Playwright or chromium is unavailable).
- `tests/classic2d-cursor.test.mjs` — the Classic 2D cursor input
  (`js/classic2d/cursor-input.js`) over real engine games: moving and
  clamping, auto-repeat of held directions, Space / Enter / F / D and the
  controller buttons (A / RT, X / LT, Y, both triggers; B, Start and Back
  unmapped) through `pad(poll)` with poll-shaped `held` arrays, the d-pad
  and the left stick, pressed feedback, press-follows-cursor, inactive
  boards and `reset`, `onUse` once per input the board takes; the board
  view's focus ring (`setCursor`, `CURSOR_RING`); the mounted wiring over
  `EventTarget` fakes with a fake `requestAnimationFrame` (no ring until a
  cursor key or controller input, hidden by a press or a moving pointer on
  the canvas but not a resting one, shown again on the cell it kept;
  system key repeat ignored, modified keys and Esc left alone, blur,
  `destroy`); DOM-free and reusing `Repeat` / `stickCurve`. Two Playwright
  tests (skipped when Playwright or chromium is unavailable): one plays a
  fixed Beginner board by keyboard to a win, the ring hidden until the
  first key and by a mouse move; one moves the cursor by arrow key in both
  themes and checks the ring's pixels differ from the lit bevel and from a
  neighbouring closed tile.
- `tests/classic2d-mode.test.mjs` — the Classic 2D mode
  (`js/classic2d/mode.js`) over a real mode host and pause controller with
  recording mounts, flow and generation clients and a fake clock: the
  contract, the board choice preselected from the last choice, `summary()`
  before the first click and mid-game (equal to the abandoned report),
  started / can-pause / finished (recorded and routed by the results flow),
  the end delay (`END_DELAY_MS`: can-pause off at once, finished once after
  the delay on the fake clock with the summary and replay at the end,
  frames drawn or not, a pause and `hideBoard` ignored and no action
  taken during it, `restart` and `leave` cancelling it, `finishNow()`
  finishing at once and only during it, the board's end effect from the
  last action's cell or the exploded tile drawn each tick and ended in the
  end state), redraw and the overlay feed with its click count (none before the first
  click, wasted clicks counted, frozen at the end), pause hiding
  the board while the time the pause card shows runs on, restart and leave releasing the canvas
  and the pending generation, Play again, the no-guess failure offer and
  its failure count, `cancelGeneration` back to the closed board, one
  generation client for the mode warmed by `warm()`, the next no-guess
  board pre-generated at a finished game for its marked start cell and
  taken over by Play again or Restart with the mark on the view, a click
  elsewhere generating afresh, none after a standard or abandoned game,
  discarded by another choice or the leave, the progress pushed to the flow,
  Play a standard board from the generating card, the
  controller poll, the board opened at the scale setting inside the panel's
  frame with its layouts and the player's scrolls reported and `setScale`
  refitting it, the ring reaching the sampler (-1 when hidden), the page's
  button swap handed to every game's pointer input and never the cursor
  input, the
  shell's scale, panel and scroll-hint wiring; the board choice helpers (`js/classic2d/board-choice.js`)
  against `CUSTOM_LIMITS`, the no-guess default and the density hint; the
  `#c2d-choice` markup (the switch under the sizes with its helper line,
  the density hint under the info line) and the `#c2d` / `#c2d-status`
  markup (spinner, Cancel, Main menu), the router entries and controller
  layers, the shell's Cancel and offer wiring, the catalogue entry. One Playwright test
  goes menu → Classic 2D → Expert → first click → pause → resume → back to
  menu and checks the timer and the pause card's time running while paused
  and the abandoned summary with its two pauses; one more, at 1024 × 768,
  1366 × 650 and 1280 × 800 in both themes, checks Expert unclipped in
  play and in the viewer, Beginner at 48 px, the panel's edge readouts and
  Pause, a clipped custom board's shadow, scroll bar and one-time hint
  (gone for good once scrolled), and no ring for a mouse player (both
  skipped when Playwright or chromium is unavailable).
- `tests/classic2d-fidelity.test.mjs` — the Classic 2D inputs and custom
  limits against `tests/fidelity/minesweeper-online.md`: each test cites
  an entry by heading ("Chording: which inputs chord", "Flag timing",
  "Pressed feedback", "Releasing off the pressed cell", "Largest custom
  board") and asserts the pointer state machine or board setup through the
  reference profile's markers; one test checks that every Classic 2D input
  entry is pinned and each marker cites its entry. The one deliberate
  difference — a free cell on boards of up to 36 cells — is pinned as such.
  One Playwright test checks press feedback and releasing off the pressed
  cell on the real Beginner board (skipped when Playwright or chromium is
  unavailable).
- `tests/shell-router.test.mjs` — the screen router (`js/shell/router.js`:
  the seven feature screens, one screen shown per change with its data, the
  back stack, unwinding, `replace`, default focus declared or computed, a
  screen's own Back and the input that asked) and shell navigation
  (`js/shell/navigation.js`: topmost layer, focus fallback, the focusable
  selector, held-button suppression across screen changes, Esc and the
  controller Back buttons, `arrowDirection` and `keepsArrow`); both
  DOM-free; static checks that every screen change in `js/main.js` goes
  through the router, each shown screen declares a default focus, Back
  always resolves through the router and the arrow keys reach `keyNav` with
  their repeats. Two Playwright tests: menu → screen → Back by keyboard with
  the default focus on each; and the menu, the 2D board choice, the pause
  card and Settings walked with arrows alone (keyboard ring, a field's and a
  slider's Left/Right, a Settings choice's and the Controls panel tabs'
  Left/Right, Settings' Back in
  view at the top and the bottom at 1280 × 800 and phone width).
- `tests/shell-history.test.mjs` — the session-history mirror
  (`js/shell/history.js`) over a fake history and the real router: the base
  entry and nothing pushed on the menu, a push per stacked screen, replace,
  consumption on an in-app Back and an unwind, a push held while a
  traversal is in flight, `popstate` routed to Back, the restored entry on
  the board, the pause card and during the end delay, leaving only from the
  menu, Forward undone, the walk past a reload's earlier entries whether
  they come back as a popstate or as a fresh page load (`tab`, a fake tab
  of loads over one history and session storage), the return after the page
  was dropped, and `storedSet`; DOM-free; static checks of the wiring in
  `js/main.js` (`historyBack`, the session-storage set) and the unchanged
  leave-page guard. One Playwright test drives `page.goBack()`: board choice
  → menu, a started Classic 2D game → pause card twice, Records → results →
  menu, and, after a reload on Settings, the menu off the page.
- `tests/shell-mode-host.test.mjs` — the mode host (`js/shell/mode-host.js`)
  over a recording fake mode: registration and its refusals, board choice,
  start/pause/resume/restart/leave, game state from the reports, `summary()`
  before and after the first click, `abandoned` on restart, leave and a
  replacing start, each `finished` and `abandoned` carrying `replay: null`
  for a mode that passes none, reports from an inactive mode ignored,
  failures (reported or thrown) with the failure screen, listeners; DOM-free, the contract
  documented in the module, and the shell reaching the 3D game only through
  the host. The 3D game on the shared engine (`create3DGame` of
  `js/mode3d/session.js`): a fixed mine set played to a loss and to a win
  with the result's counts, flags placed and removed, picking over the state
  view skipping hidden cells, the mine cap and the custom board's limit, and
  no separate 3D engine module or its tests present, with nothing importing
  them. One Playwright test plays a fixed mine set on the shared engine to a
  win and to a loss.
- `tests/shell-mode-3d.test.mjs` — the 3D adapter (`js/shell/mode-3d.js`)
  over a fake session and a fake flow: the builder's summaries, the contract, pause
  reaching the session without cancelling a pending board request, started
  and can-pause at the first applied reveal, `summary()` so far, the
  summaries' pause count and paused time from the session's spans,
  `cancelGeneration` through the session reporting nothing, the next
  no-guess box pre-generated at a finished game for its marked start cell
  and handed to Play again or the same board, discarded by another board or
  the leave, none for a standard or abandoned game, finished
  after the end delay at a win or loss, abandoned on restart and leave of a started game and
  nothing before the first applied reveal, reports of a session no longer
  held ignored, a lost graphics context; DOM-free, importing at most the
  session; static checks that `js/main.js` hands the adapter each session
  and leaves the reports to it. One Playwright test starts, pauses (the
  clock and the pause card's time running on, the click-to-play card
  stopping nothing), resumes, restarts and leaves the 3D game through the
  adapter, and ends a
  fixed board, which has no results screen, on the pause card. Another, on
  a slow stand-in worker, shows the generating card with its progress line
  by the delay in pointer-locked play — measured in the page against the
  main-thread long tasks a timer cannot fire inside — then, after a lost
  game and Play again, the marked start cell tinted and the card by the
  delay again for the pre-generated box still in flight.
- `tests/mode3d-board-choice.test.mjs` — the 3D board choice
  (`js/mode3d/board-choice.js`): the three cube presets and no flat or
  double layer one, custom validation per field, the one-cell board
  refused, the very-large-board warning, no-guess on every preset and on
  custom boards up to the limit, none on a side of 2 cells with its reason
  line and a side of 1 keeping it, the limit as one exported constant,
  choice normalising and `readChoice`, Random by the original formula, the
  last 3D choice through `createLastBoardChoice` over the memory backend (a
  malformed one, or one naming a double layer preset, falls back to cube
  Beginner with no-guess on, a document apart from the 2D choice; nothing
  stored opens with no-guess on, a stored no-guess off is kept), the
  density hint above 25 %, the `index.html` markup (the presets labelled
  Cube Beginner, … by `presetTitle` in a menu named Presets with no family
  heading, the helper line under the presets' switch, the density hint
  under the custom one), the old
  best times not read, the binder touching only its elements, and the
  shell's wiring. One Playwright test validates the custom board, follows
  the switch across the limit and onto a side of 2 cells, follows the
  density hint live and restores the choice.
- `tests/mode3d-session.test.mjs` — the 3D game session
  (`js/mode3d/session.js`) over a fake generation client and a fake clock:
  the 3D game awaiting its first click, the generator's `box` description
  and its first-click rule up to every cell but one, the closed box, the
  board request with the no-guess setting, a standard box placed at once
  (the worker's own answer, the timer from the click), a pre-generated box
  on its mark (flags before not counting, arrived or in flight), discarded
  elsewhere or failed and asked afresh, Play a standard board from
  generating, the delayed "generating" state
  and no board action meanwhile, the timer from the board's arrival to a
  win or loss, flags before the first reveal, pause during generation, the
  clock running through every pause and each pause a span until the return
  to play or the end,
  restart and leave cancelling the request and dropping a late answer,
  `cancel` back to the closed box with its flags, the no-guess failure's
  Retry and standard board and its count of failures in a row, a failing or rejecting
  worker, the fixed mine set, every preset's box, DOM-free, no placement on
  the main thread, the old best times left alone, actions from the
  existing mouse state machine and controller mapping. Two Playwright
  tests: a preset game generated by the worker and played to its end, and
  a failed no-guess board's offer with a restart keeping the standard
  board.
- `tests/mode3d-noguess-limit.test.mjs` — `NOGUESS_CELL_LIMIT` is the
  measured 20 × 20 × 20 board, and a board at the limit generates no-guess
  within the attempt budget at the presets' densities.
- `dev/measure-noguess-3d.mjs` — not a test: `node
  dev/measure-noguess-3d.mjs [seeds]` times no-guess requests on box boards
  of growing size at the presets' densities, the measurement behind
  `NOGUESS_CELL_LIMIT`; its head comment says how to read it.
- `dev/measure-typical-bbbv.mjs` — not a test: `node
  dev/measure-typical-bbbv.mjs [seeds]` generates no-guess boards for every
  named board through `generate` and prints the median 3BV per board as
  `TYPICAL_BBBV`'s lines (`js/records/typical-bbbv.js`).
- `tests/replay-format.test.mjs` — the replay format
  (`js/replay/format.js`): exact round-trips of 2D and 3D replays (mines
  given in any order come back ascending), an empty, an abandoned and a
  capped movement stream, compact delta encoding of large times and long
  streams, the action kinds, movement types and sample arity, the movement
  sampling interval the decoder gives each replay by mode and format
  version (equal to the samplers' constants at the current version, never
  stored in the blob), the encoder's
  `RangeError` on a malformed replay, a cursor event's -1 for a hidden ring
  round-tripping with no new type or version, the cursor event on the square graph
  and the view-mode event on the box only, a newer version refused with its
  own error, an older one decoded and upgraded step by step, version 2's
  pause spans round-tripping and their malformed forms refused, a version 1
  replay and every version 1 fixture upgrading to no pauses, a throwing
  upgrade step, a missing decoder and a corrupt blob unreadable, an
  `ArrayBuffer` accepted, and `cellStateDigest`.
- `tests/replay-recorder.test.mjs` — the recorder and sealer
  (`js/replay/recorder.js`): every action recorded in order with its time,
  the board's arrival completing the header, a backwards time held, an
  equal sample not stored, the cursor stream opening with -1 and carrying
  -1 while the ring hides (another negative cell failing it), typed
  buffers growing through thousands of
  events, the movement cap (2 MB by default) marking where movement ended
  while actions go on, sealing a win, a loss and an abandon — listing
  fields, size, the same replay on a second seal — that decode and
  reproduce, a game left before its first click sealing to nothing, a 3D
  game's samples, view modes and hidden state in the digest, the pause spans
  sealed into the header, and failures (a bad feed, an unencodable seal, a
  summary for another board, pause spans that are not the summary's, bad
  header fields) dropping the replay, reported once, never thrown into play.
- `tests/replay-2d.test.mjs` — Classic 2D capture
  (`js/replay/sampler-2d.js`, `js/classic2d/session.js`,
  `js/classic2d/mode.js`) with a fake clock: `boardPoint` in cell units on
  and off the board, a recorded 2D game with a pause — its span in the
  header, the actions after it later by the paused time — sealed at the win, nothing recorded
  before the first click and the recorder discarded on restart, a no-guess
  failure played standard, the sampler's schedule across frame jitter, the
  ring's visibility recorded as -1 while hidden and its cell while shown,
  `mountSampler2D` reading the last pointer position through the view, and
  the replay beside the summary in the mode's finished and abandoned
  reports through the mode host and the pause controller, null from a mode
  that passes none.
- `tests/replay-3d.test.mjs` — 3D capture (`js/replay/sampler-3d.js`,
  `js/mode3d/session.js`, `js/shell/mode-3d.js`) with a fake clock:
  `cameraSample` and `viewMode`, a recorded 3D game with flags before the
  first reveal at time 0 and a pause (its span in the header, the actions
  after it later by the paused time) sealed at the win, a loss and an abandon
  reproducing their check values, restart discarding and leave stopping the
  recording, a no-guess failure played standard, a fixed board recording
  but unsealed, the sampler's schedule, and the adapter's finished and
  abandoned reports with their replay, `tick()` driving the sampler and a
  lost graphics context after the first reveal abandoning the game with its
  replay; a rules version 2 game with a flag-all, a hand unflag of one of
  its flags and the undo verifying and seeking both ways, from the start
  and from periodic snapshots, with the flags of live play.
- `tests/replay-determinism.test.mjs` — the recording constants equal to
  the measured ones and the blob uncompressed; applying each replay's
  actions to a game built from its header reproduces its check values, on
  the recorded games under `tests/fixtures/replays/` and on games recorded
  now through the real sessions, samplers and recorder by
  `dev/measure-replays.mjs`'s simulated player, which it imports.
- `tests/replay-library.test.mjs` — the replay library
  (`js/replay/library.js`) over platform storage on the memory backend and
  the memory blob store: the registered, versioned index and its entry
  fields, one load, use before load throwing, add's order (blob, entry,
  retention) and the blob under the replay id, a repeated or concurrent
  add written once, best pinning, the newest 100 unpinned kept across both
  modes by end date with pinned replays never deleted, hand pin and unpin
  (retention after unpin, unknown ids), `forBoard`, `has` and `bytes`, the
  entries as copies, change notification with a throwing subscriber,
  start-up reconciliation both ways and a store that cannot list, a
  missing or malformed index, a store or index that cannot persist, a
  failed blob write or index save reported once, a newer, unreadable or
  corrupt index left untouched, no pinned replay lost to a failure, and the
  module DOM-free.
- `tests/replay-handoff.test.mjs` — the end-of-game hand-off
  (`js/results/flow.js`) over fakes and over the real library: finished and
  abandoned games recorded first, then their replay added with its listing
  fields, pinned when the comparison shows a new best, a throwing recording
  still adding it unpinned, both hand-offs attached and detached, a dropped
  replay or a summary that is not a record adding nothing, a throwing or
  rejecting library changing nothing else, a flow with no library, a
  session that saves nothing and a failed save keeping the replay for the
  session, and the static check that `js/main.js` builds the library over
  `storage` and `blobStore` and hands it to the results flow.
- `tests/replay-simulator.test.mjs` — the simulator and verifier
  (`js/replay/simulator.js`, `js/replay/verify.js`) and the engine game's
  `snapshot()` / `restore()` behind them: a restore setting state, counts,
  phase and action stream back with play going on from there, a later
  snapshot surviving a restore to an earlier one, another game's snapshot
  refused; `simulate` on every recorded game under
  `tests/fixtures/replays/` at several times against a game played to that
  time, pure and deterministic for a blob or a replay alike; forward and
  backward seeks and `seekIndex` with the cells changed between them, from
  the start on a small board and from the nearest periodic snapshot on a
  large one, the default snapshot sizing and the memory budget spacing them
  out, the constants equal to the measured ones; `verify` on every fixture
  and a large synthetic won and lost game, a tampered replay reporting the
  first check value that differs, an elapsed time never before the last
  action, each refusal (newer format, profile or rules version,
  unreadable), and both modules DOM-free.
- `tests/replay-viewer.test.mjs` — the replay viewer (`js/replay/clock.js`,
  `js/replay/viewer-2d.js`, `js/replay/viewer.js`): the clock's speeds,
  advance, end and restart, seek and speed bounds; the replay clock in the
  overlay timer format, the overlay figures and the end line in the results
  time format; the 2D pointer held through a still stretch and interpolated
  over the last sampling interval before the next sample, across a shorter
  gap throughout, at the replay's interval or the 2D sampler's by default,
  the ring only while the recorded cursor event is a cell (-1 hidden, an
  older recording's opening cell no ring, every 2D fixture with no ring),
  the same at any seek as in playback, the pointer placed through the
  board layout and scroll and following a refit while paused, the view
  following the pointer, else the cursor, on a scrolling board and never
  on one that fits, the board scale reaching the mounted viewer; the
  shell mounting the 2D viewer at the scale setting; opening from a blob, a
  replay object, the hand-off's `{blob}` or a library id, verification first
  and each failure line with Back still working, no viewer for the graph, a
  box replay with no 3D viewer showing the WebGL 2 line while a square one
  still plays, a replay still loading when the screen closes; ticks driving
  the clock and the simulator, the end of a replay, seek and step, the seek
  bar step, the seek bar's pause marks and their text, playback through a
  paused span, keyboard and controller commands, a lost game's loss view;
  the viewer reaching no records, sound or pause; static checks of the
  `#replay` kit markup and its wiring in `js/main.js`, the box viewer offered
  only with WebGL 2. Two Playwright tests: one plays a recorded 2D fixture
  through to the end and shows a replay's pause marks; one, without WebGL 2,
  plays a 2D fixture and shows the WebGL 2 line for the 3D fixture (skipped
  when Playwright or chromium is unavailable).
- `tests/replay-viewer-3d.test.mjs` — the 3D viewer
  (`js/replay/viewer-3d.js`): the recorded camera in cells and radians, held
  through a still stretch and interpolated over the last sampling interval
  before the next sample, across a shorter gap throughout, at the replay's
  interval or the 3D sampler's by default, whole turns kept, held after the
  movement cap (also on a capped fixture), the recorded view mode, the
  camera in world units at any spacing; drawing the simulator's 3D state
  view with its changes, every cell when the game crosses its end either
  way, a viewer that leaves the screen while it mounts dropped,
  `replay--scene`; DOM-free and reaching no records, sound, pause or player
  input; static checks of the box viewer, the replay camera, a lost
  graphics context and the seek sync before the playback's tick in
  `js/main.js`. One Playwright test plays a recorded 3D fixture through to
  the end on the renderer — its playback's "solved" pulses dropped by a seek,
  a seek over the hides starting none — seeks back past the end and loses
  the graphics context (skipped when Playwright or chromium is
  unavailable).
- `tests/fixtures/replays/` — recorded games, one `.msrp` blob each, listed
  in `index.json` with a note (2D and 3D, each with a win, a loss, an
  abandon and wasted clicks; a 3D game with flags before the first reveal).
  Written by `node dev/measure-replays.mjs --write-fixtures` only when the
  format changes, never by a test, so a replay recorded by an earlier build
  keeps reproducing.
- `dev/measure-replays.mjs` — not a test: `node dev/measure-replays.mjs`
  plays seeded simulated games through the real sessions, samplers and
  recorder and prints replay sizes, compressed and not, and playback error
  per candidate sampling interval and quantisation step — the measurement
  behind the sampler constants, `MOVEMENT_CAP_BYTES` and the uncompressed
  blob; its head comment says how the constants are chosen and how to read
  it.
- `tests/shell-returning.test.mjs` — the returning player's surfaces
  (`js/shell/returning.js`) over a records model built in the test: the
  density rounding, the preset detail line with and without its 3BV part,
  the dash, the best with and without a streak, a board and its no-guess
  twin read apart; the session strip (singular and plural games, `best —`,
  only today's games across a local day boundary, no strip without a last
  board), the Play again label, which board Play again starts
  (`lastBoard`), no Play again for a 3D board without WebGL 2; every named
  board's `TYPICAL_BBBV` entry and the table's measuring script; the
  markup, the switch wording, the shell wiring and the catalogue. Three
  Playwright tests: the detail lines on both board choices before and after
  a won game (recorded through `__ms.records`) and across the switch, the
  strip after games and Play again starting a 2D board by keyboard; a 3D
  last board entering play with a stand-in lock granted and showing the
  ready card when it is refused; and, without WebGL 2, the strip with no
  Play again.
- `tests/shell-menu.test.mjs` — the main menu (`js/shell/menu.js`): the four
  entries in order, each route (mode board choice, screen, or the shared
  placeholder), the last mode played as a platform-storage document over the
  memory backend (recorded on game started, read back at start-up, a
  malformed document read as none, storage that does not persist never
  stopping a game); the 3D entry unavailable without WebGL 2 (its reason, no
  route, the other entries unaffected); DOM-free; the menu, 3D board-choice
  and placeholder markup in `index.html`, their router entries and default
  focus, and their catalogue entries; the no-WebGL 2 wiring (the `WEBGL2`
  flag, the `no-webgl2` styles, the start hook, the `<noscript>` and README
  copy). Three Playwright tests: one opens each entry and returns with Back,
  the 3D entry enabled over the demo scene; one, without WebGL 2, checks the
  static background in both themes, the disabled 3D entry and its reason, a
  Classic 2D game to its results with its replay watched, the Records 3D
  side, a Settings change and no console error; one drives the 3D board
  choice and the placeholder with a fake
  controller alone (`page.addInitScript` stubs `navigator.getGamepads`;
  `press` holds a button for exactly one poll, so menu auto-repeat and
  held-button suppression never interfere) and reaches `coming-soon` by
  serving `js/shell/menu.js` through `page.route` with the Records entry
  naming an unregistered screen — the router refuses unknown screens, so
  the placeholder is only reachable through the menu's `entryRoute`
  fallback.
- `tests/shell-help.test.mjs` — mode-aware help: the bindings component
  (`bindingsHtml`) per mode × device with glyphs, H and M listed in both
  modes and F only in 3D, the HUD strip (`hudStripHtml`) per mode × device,
  the H panel's foot line, the active device (`createActiveDevice`), Space's
  `TapToggle` (tap, next tap, hold, outside play, reset) and the controller
  keeping its hold, the board lines with " · no-guess" (`boardLine3D`,
  `boardLine2D`); static checks that the pause card, Controls panel and H
  panel hold no hard-coded list, the HUD and hint strips show in Classic 2D,
  H and M on the Classic 2D board with F 3D-only, the pause card fed by the
  active mode, and nothing of the help in the replay viewer. Three
  Playwright tests: the Controls panel tabs, H, M and the HUD strip in
  Classic 2D and each mode's pause card (rows, board line, look settings)
  with no-guess boards in both modes; a fake controller as the active device
  redrawing the HUD strip, hint strip, H panel, pause card and Controls
  panel, and the mouse switching back; a Space tap (press and release in one
  task) versus a hold in 3D play.
- `tests/shell-first-use.test.mjs` — first-use hints
  (`js/shell/first-use.js`) over the memory backend: the `shell.firstUse`
  document registered, created on a first launch, seeded from the records'
  per-mode game counters, read back, a malformed one seeded afresh; games
  counted per mode at game started and the 3D rules block ended by a
  finished 3D game only; the one-time toast, aim hint and Classic 2D
  scroll hint across launches (a document stored before the scroll hint
  reading it as not yet seen);
  per-mode dismissal; non-persisting and throwing storage and failing
  records behaving as on first use; `stripShown` for both modes; the strips'
  words in either device's names; `hidCube`, `aimHintCell` and
  `createDwell`; static checks of the ready card's block and line, the
  removed "H controls" pill and its flag, and the shell's wiring. Two
  Playwright tests: a 3D first launch (rules block, strip, the toast at the
  first auto-hide and never again, an abandoned game keeping the block and a
  finished one ending it, the strip dismissed, all kept across a reload in
  the document); and the Classic 2D strip at the first key, in a fake
  PlayStation pad's glyphs while it is the active device, dismissed for good
  in Classic 2D only.
- `tests/shell-lock-fallback.test.mjs` — the pointer-lock refusal counter
  (`js/shell/lock-fallback.js`): the 1500 ms re-lock cooldown not counted,
  the first counted refusal's message, the block from the second, the count
  reset by an acquired lock, the block kept for the page session and
  `readyMessage`; static checks of the ready card's `#ready-blocked` offer
  (`#ready-drag` and the controller line outside the click-to-play card,
  Back below it) and of the shell's wiring (`LOCK_FALLBACK`, `onReadyDrag`,
  `isDragLook`, `S.dragLook` cleared on leave and kept on resume, the
  `body.lockless.drag-look` cursor). One Playwright test refuses every lock request
  with both signals, the `pointerlockerror` event and the rejected promise:
  the first refusal counts once, the second shows the offer, drag-to-look plays (a drag
  turns the camera and reveals nothing, a click reveals), Esc pauses and
  Resume returns to drag-to-look, and after Main menu the next ready card
  shows the offer at once.
- `tests/shell-pause.test.mjs` — the pause controller (`js/shell/pause.js`)
  over a real mode host, a fake mode and a recording shell: every pause
  source, automatic pauses (blur, tab hide, a controller disconnect) and
  manual ones counted alike with the clock running through them, automatic
  pauses only in play, no pause before the first click or
  after the end beyond the card, Back cancelling a board being generated
  while every pause source still pauses, resume through the mode, restart
  proceeding at once and reporting the game abandoned, the once-per-session
  restart notice, the restart confirmation under "Always ask" (from play it
  pauses first) and the back-to-menu one under either setting,
  `restartInput` for F2, Start + Y and R on every screen, the `finished` / `abandoned` / `inProgress`
  hand-offs with the controller itself routing nowhere, the leave-page guard armed
  only during a started, unfinished game; DOM-free; static checks that every
  pause source in `js/main.js` goes through `pauseGame` to the controller
  and every Back on the board (the lock-release Esc and the controller's
  back button included) through `backGame`, that the board status cards
  stack above the pause card, that the guard is
  a listener it arms, and that the confirmation is kit markup. Three
  Playwright tests: one pauses (the clock running on, the key, blur and
  tab-hide pauses counted alike), resumes, restarts — at once with its
  toast once, by `F2`, and under "Always ask" through the confirmation,
  `F2` in play opening it — keeps `R` and `Home` returning the camera, goes
  back to menu in the 3D game, and ends a fixed board, which has no results
  screen, on the pause card; one, over stand-in generation workers,
  cancels the Classic 2D generating card by Cancel and Esc (before and
  after it shows), meets the failure offer with Retry then Play a standard
  board focused, leaves by its Main menu, and finds an offer arriving while
  paused above the pause card; one restarts a Classic 2D game by `F2` in
  play and on the pause card and by a fake controller's Start + Y, `F2`
  doing nothing on the main menu.
- `tests/settings-store.test.mjs` — the schema (`js/settings/schema.js`:
  every setting's type, range or values and default, `isValid`, the
  `confirmRestart` boolean with no legacy key, the `aimReadout` boolean on by default, `boardScale` read as 100 %
  from a document written before it and remembered across a reload) and
  the
  store (`js/settings/store.js`) over the memory backend: missing, invalid
  and non-object documents filled with defaults, `get` before load and on an
  unknown key, validated whole-document saves, a rejected value kept out,
  a set during load, re-setting the current value, `onChange` at load, after
  load and its unsubscribe and listener isolation, the legacy carry-over
  (read once, the old readers' clamping and `'1'` flags, garbage and
  throwing readers), unreadable, non-persisting and newer storage, the
  failed save reported once, and the document registered once.
- `tests/settings-appliers.test.mjs` — the appliers (`js/settings/appliers.js`)
  over a store on the memory backend and recording owners: `pixelRatioFor`
  per resolution, the resolution, theme, audio and look appliers at load and
  on change, unsubscribes, fullscreen requested inside the setting's call,
  exited, followed when the browser leaves or refuses, `applySettings`; the
  module DOM-free and the store importing no applier; the theme script
  (`js/theme.js` in `node:vm`) starting from the document the store saved
  through the browser backend and falling back to Light; the sound module
  and `js/ui.js` keeping no settings keys of their own. One Playwright test
  applies a theme and a resolution change at once.
- `tests/settings-reset.test.mjs` — the reset (`js/settings/reset.js`) over
  the memory backend, the memory blob store and a fake legacy key store:
  `RESET_KEYS` (the four carried-over keys and `ms3d.hintH.done`, no unread
  key), every document, kept-aside copy, blob and reset key gone before the
  one reload, the wait for the replay library's load (a deferred load and a
  real `createReplayLibrary`), unavailable storage still cleared, each
  failure (documents, a blob list or delete, a key removal) named with the
  rest cleared and no reload, a retry, the default legacy remover over a
  fake and a blocked `localStorage`, and the module DOM-free.
- `tests/settings-page.test.mjs` — the bindings source
  (`js/settings/bindings.js`: every mode × device, the Classic 2D keyboard
  rows naming every `CURSOR_KEYS` key, the 3D right-click and `{lt}` on a
  number rows, both modes' `[F2]` and `{start} + {y}` Restart rows,
  `bindingsListHtml` keys, glyphs and
  escaping, the in-game help reading it through `bindingsHtml`) and the page
  (`js/settings/page.js`): the four sections holding every setting once,
  the "Always ask before restarting" toggle in Controls, the "3D neighbour count" toggle in
  Graphics, on by default,
  Audio's Sound (the `muted` toggle, on while not muted, both ways through
  the binder) before Volume and no Mute label, the Theme control named by
  its section heading with no label of its own, each control's kind and
  range from the schema, kit-only markup, the
  bindings section per device in the pad's glyphs, `bindSettingControls`
  over stub elements showing loaded and later values, writing at once and
  reporting the change, refusing an unknown setting; the Data panel after
  Bindings, `RESET_MESSAGE` naming every kind of data, and `bindResetPanel`
  over fakes (focus to Cancel and back, Cancel and `close()` changing
  nothing, one run per confirm, a failure's warning line, a throwing reset);
  the shell's reset wiring and Back closing the confirmation; static checks of the
  `#settings` markup, the sticky Back row (`#settings-actions`), the
  choices' and the Controls panel tabs' horizontal binding, the pause-card and menu `data-setting`
  shortcuts, the menu entry's route, focus, Back and controller layer, and
  the catalogue entry, and Sound before Volume on the main menu and the
  pause card. Three Playwright tests: Settings from the menu, Dark chosen and
  applied before the menu shows after a reload; the page operated by a
  fake controller; and a played profile (a lost Classic 2D game, Dark, the
  old keys) back to a new player's after Reset all data, with Cancel, Esc
  and the browser's Back closing the confirmation first.
- `.claude/external/run-full-tests.sh` — `cd` to repo root, then
  `node --test --test-concurrency=2 "tests/**/*.test.mjs"`: the glob keeps
  the review scripts under `docs/` out of the run, and the concurrency cap
  keeps the software-rendered browser tests from timing out on a 4-core box.
- `.claude/external/run-affected-tests.sh <test-file>...` — `node --test` on the
  given files; exits 2 with usage when called with no arguments.
- Browser verification: ad-hoc Playwright scripts drive `window.__ms`,
  defined at the end of `js/main.js`; the suite's browser tests are the
  reload tests in `tests/platform-browser.test.mjs` and
  `tests/platform-blob-store.test.mjs`, the contrast tests in
  `tests/components.test.mjs`, the minimum-tile-size test in
  `tests/tile-skin.test.mjs`, the board test in
  `tests/classic2d-view.test.mjs`, the mouse game in
  `tests/classic2d-pointer.test.mjs`, the swap toggle in
  `tests/classic2d-button-swap.test.mjs`, the keyboard game in
  `tests/classic2d-cursor.test.mjs`, the Classic 2D flow in
  `tests/classic2d-mode.test.mjs`, the input fidelity check in
  `tests/classic2d-fidelity.test.mjs`, the won game through the results
  screen in `tests/results.test.mjs`, the Records screen tests in
  `tests/records-screen.test.mjs`, `tests/records-history.test.mjs` and
  `tests/records-replays.test.mjs` and `tests/records-screen-3d.test.mjs`,
  the 3D end of game in `tests/mode3d-end.test.mjs`, the ghosts and pulse in
  `tests/render-3d-feedback.test.mjs`, the replay viewer tests in
  `tests/replay-viewer.test.mjs`, `tests/replay-viewer-3d.test.mjs` and
  `tests/results-watch.test.mjs`, the
  flow tests in `tests/shell-*.test.mjs` (one per file, two in
  `tests/shell-first-use.test.mjs`, three in `tests/shell-pause.test.mjs` and `tests/shell-help.test.mjs`), the spawn and
  return-to-start test in `tests/camera-spawn.test.mjs`, the 3D tests in
  `tests/mode3d-board-choice.test.mjs` and `tests/mode3d-session.test.mjs`, the
  theme-and-resolution test in `tests/settings-appliers.test.mjs` and the three page tests in
  `tests/settings-page.test.mjs`.

No `package.json`, no dependencies: Node 22 built-in runner (`node:test`,
`node:assert/strict`). The suite is `tests/*.test.mjs`, selected by the glob
in `run-full-tests.sh`; bare `node --test` also picks up any `*-test.mjs`
script under `docs/`.

## PUBLIC API

Tests consume, and so pin, these contracts:
- `js/gamepad.js::stickCurve`, `triggerHeld`, `Repeat`, `padFamily`,
  `padGlyphs`, `pickInDirection`, `GamepadReader` (injected `getGamepads`,
  `onConnect`, `onDisconnect`, `onActiveChange`; `poll()` →
  `{pad, pressed, held, released}`), `BTN`, `STICK_DEADZONE`.
- `js/input.js::FlyCamera.move`/`moveAxes`/`lookAxes`/`place`, `spawnPose`,
  `offscreenArrow`, the `SPAWN_*` constants, `MouseActions`
  (`down(b)`/`up(b)`, callback receives `'left'|'right'|'chord'`), `MOVE_SPEED`,
  `LOOK_DEG_PER_PX`, `PAD_LOOK_DEG_PER_S`; `js/controls.js::Controls`
  (`shift`/`space`/`ctrl` union, `pad`, `axes`, `hasAxes`, `releasePad()`).
- `js/engine/graph.js::createCellGraph`, `cellGraphFromLists`;
  `js/engine/square-grid.js::createSquareGrid` and
  `js/engine/box-grid.js::createBoxGrid` (index layout and neighbour order);
  `js/engine/profiles.js::PROFILES`, `REFERENCE_PROFILE`, `PROFILE_3D`,
  `getRuleProfile` and every marker's `fidelity` citation;
  `js/engine/state-view-3d.js::createStateView3D` and the members the 3D
  front-end reads;
  `js/engine/rules.js::createGame`, `createGameWithMines`, `PHASE`, `CELL` and
  the game's actions, queries, `counts()`, `summary()`, `actions()`;
  `js/engine/metrics.js::createBoardMetrics`, `createClickCounts`,
  `CLICK_KINDS`. Full list in [engine.md](engine.md).
- `js/generation/random.js::createSeededSource` (its pinned output stream);
  `js/generation/placer.js::placeMines`, `GENERATOR_VERSION`;
  `js/generation/solver.js::solve`, `solveFrom`;
  `js/generation/generate.js::generate`, `boardGraph`, `ATTEMPT_BUDGET`;
  `js/generation/worker.js::handleMessage` and the `{ id, request }` /
  `{ id, result | error }` messages; `js/generation/client.js::
  createGenerationClient`, `createModuleWorker`. Full list in
  [generation.md](generation.md).
- `css/tokens.css` token names and values (`:root` and
  `:root[data-theme="dark"]`); `js/theme.js::createThemeApplier`
  (`{root, readStored, onError}` → `apply`, `current`, `setTheme`, `onChange`)
  and the `globalThis.msTheme` it installs; `js/tokens.js::createTokenReader`
  (`{root, getStyle, theme, dev, log}` → `token`, `onThemeChange`),
  `FALLBACK_COLOR`; the `<head>` order in `index.html`.
- The kit's class names and markup patterns as catalogued in
  `css/components.css`, the gallery's coverage of them, the
  `js/ui/components.js` exports, the HUD ids (`#hud-time`, `#hud-mines`,
  `#hud-pause`) and `UI.prototype.updateHud`. Full list in
  [app-shell.md](app-shell.md).
- `js/classic2d/tile-skin.js::paintTile`, `paintTileWith`, `createTileSkin`
  (`drawTile`, `invalidate`, `cacheKey`, `dispose`), `TILE_STATES`,
  `MIN_TILE_SIZE`; `js/classic2d/board-view.js::fitTileSize`,
  `boardLayout`, `cellAtLayout`, `createBoardView`, `BOARD_BACKGROUND`,
  `CURSOR_RING`, `PAN_MODIFIER`; `js/classic2d/pointer-input.js::BUTTON`,
  `pointerRules`, `createPointerInput`, `mountPointerInput`;
  `js/classic2d/cursor-input.js::CURSOR_KEYS`, `PAD_MAP`, `STICK_THRESHOLD`,
  `createCursorInput`, `mountCursorInput`;
  `js/classic2d/board-setup.js::boardSetup`, `validateCustom`,
  `customMineCap`, `maxMines`, `normaliseChoice`, `createLastChoice`,
  `STANDARD_SIZES`, `DEFAULT_CHOICE`, `LAST_CHOICE_DOC`;
  `js/classic2d/session.js::createSession`, `createTimer`,
  `SESSION_STATE`, `FAILURE_OFFERS`, `GENERATING_DELAY_MS`;
  `js/classic2d/mode.js::createClassic2DMode`, `MODE_ID`;
  `js/classic2d/board-choice.js` exports. Full list in [classic2d.md](classic2d.md).
- `js/mode3d/board-choice.js::PRESETS`, `FAMILIES`, `BOARD_SIZES`,
  `DEFAULT_CHOICE`, `NOGUESS_CELL_LIMIT`, `validateCustom`, `customStatus`,
  `noGuessAvailable`, `noGuessReason`, `normaliseChoice`, `readChoice`,
  `boardOf`, `randomBoard`, `bindBoardChoice`, `LAST_CHOICE_DOC`;
  `js/mode3d/session.js::create3DGame`, `createSession`, `SESSION_STATE`,
  `SESSION_EVENTS`. Full list in [mode3d.md](mode3d.md).
- `js/platform/storage.js::createStorage` (`register`, `load`, `save`,
  `available`, the issue kinds and save reasons);
  `js/platform/browser-backend.js::createBrowserBackend`, `DOC_PREFIX`,
  `ASIDE_PREFIX`; `js/platform/memory-backend.js::createMemoryBackend`;
  `js/platform/blob-store.js::createBlobStore`;
  `js/platform/memory-blob-store.js::createMemoryBlobStore`;
  `js/platform/indexeddb-blob-store.js::openIndexedDBBlobStore`, `DB_NAME`,
  `STORE_NAME`; `js/platform/index.js` exports. Full list in
  [platform.md](platform.md).
- `js/replay/library.js::createReplayLibrary`, `LIBRARY_DOC`,
  `LIBRARY_VERSION`, `RETAINED_UNPINNED`, `PIN_BEST`, `PIN_HAND`;
  `js/replay/simulator.js::openReplay`, `createSimulator`, `simulate`,
  `REFUSAL`, the snapshot constants; `js/replay/verify.js::verify`;
  `js/replay/clock.js::createPlaybackClock`, `SPEEDS`;
  `js/replay/viewer.js::createReplayViewer`, `createReplayView`,
  `prepareReplay`, `overlayFigures`, `endLine`, `clockText`, `seekStep`,
  `FAILURES`, `REPLAY_KEYS`, `REPLAY_PAD`;
  `js/replay/viewer-2d.js` and `js/replay/viewer-3d.js` exports; the
  engine game's `snapshot()` / `restore()`. Full list in
  [replay.md](replay.md).
- `js/records/board.js::createBoardIdentity`, `boardKey` (its pinned 2D
  and 3D forms), `parseBoardKey`, `boardLabel`, `standardBoard`,
  `STANDARD_BOARDS`, `preset3D`, `PRESETS_3D`, `MODE_3D`,
  `BOARD_KEY_FORMAT`; `js/records/summary.js::buildSummary` and the record's
  shape, `countedClicks`, `bbbvPerSecond`, `efficiency`, `isBestEligible`,
  `BEST_STATS`, `OUTCOMES`; `js/records/model.js::createRecordsModel`,
  `compactSummary`, `rebuildRecords`, `emptyRecords`, `upgradeRecords`;
  `js/records/store.js::createRecordsStore` and the document names and
  versions; `js/records/screen.js::recordsContent`, `createRecordsScreen`,
  `createRecordsView`, `pickerBoards`, `lastBoardPlayed`, `formatDate`,
  `formatWinRate`, `RECORDS_SCREEN`, `EMPTY_TEXT`;
  `js/records/history-chart.js::chartPoints`, `niceCeiling`, `chartScale`,
  `chartText`, `drawHistoryChart`, `createHistoryChart`, `pageOf`,
  `CHART_TOKENS`, `PAGE_SIZE`, `NO_WON_GAMES`;
  `js/records/replay-list.js::replayList`, `pinState`, `togglePin`,
  `watchRoute`, `createReplayListView`, `REPLAY_SCREEN`,
  `REPLAYS_EMPTY_TEXT`, `REPLAYS_NOT_SAVED`. Full list in
  [records.md](records.md).
- `js/shell/router.js::createRouter`, `SHELL_SCREENS`;
  `js/shell/navigation.js::FOCUSABLE`, `topLayer`, `resolveFocus`,
  `isBackKey`, `backButtons`, `createHeldSuppressor`;
  `js/shell/mode-host.js::createModeHost`, `MODE_METHODS`, `MODE_EVENTS`;
  `js/shell/mode-3d.js::create3DMode`;
  `js/shell/menu.js::MENU_ENTRIES`, `PLACEHOLDER_SCREEN`, `entryRoute`,
  `createMenu`, `createLastMode`, `LAST_MODE_DOC`, `createLastBoardChoice`;
  `js/shell/pause.js::createPauseController`, `PAUSE_SOURCES`,
  `AUTO_SOURCES`, `HAND_OFFS`, `CONFIRMATIONS`;
  `js/results/flow.js::createResultsFlow` (its `watch()` too), `RESULTS_SCREEN`;
  `js/results/view.js::resultsContent`, `createResultsView`, `formatTime`
  and the other formats, `DASH`, `NOTES`. Full list in
  [app-shell.md](app-shell.md).
- `js/settings/schema.js::SCHEMA`, `SETTING_KEYS`, `DEFAULTS`, `isValid`;
  `js/settings/store.js::createSettingsStore`, `SETTINGS_DOC`,
  `SETTINGS_VERSION`, `LEGACY_KEYS`; `js/settings/appliers.js` exports;
  `js/settings/page.js::SETTINGS_SECTIONS`, `settingControl`,
  `settingControlHtml`, `settingsPageHtml`, `bindingsSectionHtml`,
  `bindSettingControls`; `js/settings/bindings.js::BINDINGS`,
  `bindingRows`, `bindingsListHtml`; the `ms3d:doc:settings` key
  `js/theme.js` reads. Full list in [settings.md](settings.md).

Browser hook `js/main.js::window.__ms` (full list in [app-shell.md](app-shell.md)):
- getters `state`, `game`, `renderer`, `camera`, `controls`, `pads`, `fps`,
  `frameStats`, `modes` (the mode host), `pauser` (the pause controller),
  `settings` (the settings store), `records` (the records store),
  `replayViewer` (the replay viewer); `THREE`, `spawnPose(X, Y, Z)`;
  `state.mode` is the router's current screen.
- `watch(data)` opens the replay viewer with its route's `{replay |
  replayId, returnTo}`.
- `start(X, Y, Z, mines, minePositions?)`, `forcePlay()`, `pause()`.
- `moveTo(x,y,z)`, `look(yaw,pitch)`, `aimAt(idx | [x,y,z])` → selected idx,
  `cellCenter(idx)`.
- `mouseDown(b)`, `mouseUp(b)`, `click('left'|'right'|'chord')`,
  `key(code, down)`, `wheel(notches)`.
- `selected()`, `pickBrute()`, `pickWith(o, d, space)` → `[dda, brute]`,
  `info()` → mode, selected, time, started, spacing, gameState, minesLeft, HUD
  text, camera, renderer stats, fps.

## INTERNAL PATTERNS

- **Testing policy is full-tdd** (`CLAUDE.md` "Tasks implementation"): every
  task runs tests first — write/extend the failing test, then implement, then
  run `.claude/external/run-full-tests.sh`.
- Determinism: randomness is injected. `mulberry32(seed)` for seeded runs;
  deterministic 3D boards via `createGameWithMines` over a box graph (helper
  `G` in `tests/engine-3d-profile.test.mjs`).
- `NaiveGame` in `tests/engine-3d-profile.test.mjs` is the oracle for the 3D
  profile while a game is playing: a direct port of the original
  `Cell.cs`/`Grid.cs`/`Minesweeper.cs` frame logic (recursive click,
  exception-based explosion, full unlink passes until stable) over a fixed
  mine set. Never "fix" the oracle to match the engine; the engine must match
  the oracle, except where the 3D board graph feature document records a
  deliberate difference, which is tested as the new rule.
- The fidelity observation, not the engine, is the oracle for the
  cell-graph engine: `tests/engine-fidelity.test.mjs` parses
  `tests/fidelity/minesweeper-online.md`, and a failure there is fixed in the
  engine against the file, never by editing the file, unless a feature
  document records the difference as deliberate. The fix ships as a new
  rules version; every earlier version's tests stay and keep passing. The
  same oracle rule holds for the Classic 2D inputs and custom limits in
  `tests/classic2d-fidelity.test.mjs`, fixed in the pointer input, board
  setup or profile markers.
- Generation determinism: the same request, seed and `GENERATOR_VERSION`
  give the same board. The generation tests pin exact outputs — the seeded
  source's first values, a placed Expert board, an accepted no-guess board —
  so a change that moves any of them is a generator change: bump
  `GENERATOR_VERSION` and re-pin, never re-pin alone. Seeds are fixed
  integers; nothing reads `Math.random`.
- Solver tests build boards from row strings (`'*'` a mine, `'o'` the first
  click, `'.'` safe) and check the solver against an exhaustive reference;
  the client tests drive a fake worker that answers through `handleMessage`
  after a macrotask (or on `flush()` when held).
- Engine tests build boards from row strings (`'*'` a mine) over
  `createSquareGrid`, and use `cellGraphFromLists` for non-square graphs.
  The summary tests reuse the pattern (`playing(rows)`) to play real engine
  games and feed their `summary()` / `counts()` to the builder, with a fixed
  `endedAt` and `id`.
- The randomized test runs 400 seeds × 40 actions and asserts per-cell
  equality via `assertSame` plus `minesLeft == mines - flagCount`; it requires
  `actions > 5000`, so do not make the action generator skip more often.
- Performance budget: 100×100×100 / 1000 mines construct < 1 s, construct +
  zero-region click < 2 s; mines == n on 10^6 cells < 2 s.
- Storage tests inject the backend: the memory backend (its `documents` /
  `aside` Maps edited directly) for the interface, a `FakeStorage` passed
  through `getStorage` for the browser backend. Blob store and library
  tests inject the memory blob store, its `blobs` Map edited directly and
  `failWrites` / `failReads` standing in for a failing IndexedDB. The
  platform-module tests swap `globalThis.localStorage` and import
  `js/platform/index.js` with a distinct query string, so each import
  evaluates the selection afresh; Node has no `indexedDB`, so the module's
  `blobStore` is the memory fallback there.
- Gamepad tests use a `fakePad` object (17 buttons, 4 axes, `mapping: 'standard'`)
  and a mutable `list` returned by `getGamepads`; no browser globals needed.
- `FlyCamera.moveAxes` is tested for exact equality with `move()` under keys,
  so the original forward-vector quirk is covered there.
- Static-file tests read `css/*.css`, `index.html` and `js/*.js` as text with
  `readFileSync`; CSS comments are stripped before parsing. Classic scripts
  (`js/theme.js`) run in a `node:vm` context whose global carries a stub
  `document.documentElement`; DOM-free factories take stub roots and
  `getStyle` functions instead of browser globals.
- Kit tests parse markup and CSS as text: `COMPONENTS` (component → root
  class, interactive control) and `COMPOSITIONS` are the catalogue's mirror,
  so a new kit piece is added there too; `UI` methods are called through
  `UI.prototype.<method>.call(fake)` with a fake `el`, since `js/ui.js`
  imports without a DOM. The Playwright tests serve the repo root from an
  in-process `node:http` server on a free port, load Playwright by
  `import('playwright')` falling back to the global install, measure contrast
  in the page (`measureContrast`: every visible text run composited over its
  effective background, 4.5:1 or 3:1 for large text and accent labels) and
  write screenshots to a `mkdtemp` directory.
- Shell tests drive the DOM-free modules with fakes: a recording `fakeMode`
  whose `play` helper reports a first click, an end or a failure, a recording
  router and shell callbacks, and the memory storage backend. Their static
  checks read `js/main.js` and `index.html` as text and slice them between
  markers — `const SHELL = createRouter(` … `// end of screen table`,
  `const FLOW_3D = {` … `// end of 3D flow`, and the `index.html` section
  comments (`<!-- 3D board choice -->`, `<!-- Coming soon -->`,
  `<!-- Click to play -->`) — so keep those markers when editing. The
  Playwright flow tests reuse the in-process server and drive the screens'
  buttons and keys, the mode-host and pause tests also `__ms.modes` /
  `__ms.pauser`.
- Tile-skin tests paint onto `fakeContext()`, a Proxy that records every
  call with the fill and stroke style in force, and build skins with an
  injected token function, theme source and canvas factory, so the painter
  and cache run in Node; the browser test reuses the in-process server and
  counts glyph-coloured pixels per tile.
- Board-view tests build the view with a fake canvas (a recording Proxy
  context) and a `createSkin` that records every `drawTile` and hands back
  the `redraw` callback, so layout, hit-testing and redraw run in Node; the
  browser test mounts it in `dev/components.html` with `mountBoardView`
  and keeps it on `globalThis.__view` for `page.evaluate`.
- Untested by Node beyond the static and stub checks above: `js/render.js`,
  `js/textures.js`, `js/picking.js`, `js/ui.js`, `js/main.js`, `js/audio.js`
  — verify in the browser. Computed styles and the rendered theme are
  browser-only too.

Browser verification (Playwright):
- Playwright 1.56 is installed globally (`/opt/node22/lib/node_modules/playwright`,
  CLI `/opt/node22/bin/playwright`); resolve it via `NODE_PATH` or an absolute
  import, not a local install. Browsers live in `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`
  (chromium build 1194). Do not run `playwright install`.
- 3D needs WebGL 2 and there is no GPU: launch chromium with SwiftShader,
  e.g. `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`.
  The no-WebGL 2 checks (`tests/shell-menu.test.mjs`,
  `tests/replay-viewer.test.mjs`) instead add an init script making
  `getContext('webgl2')` return null.
- Serve over HTTP (ES modules fail on `file://`), e.g. globally installed
  `http-server` or `serve` from the repo root.
- Headless has no pointer lock: call `__ms.start(...)` then `__ms.forcePlay()`
  (lockless play) before driving actions; aim with `aimAt`, act with `click`.
- Every hook mutator calls the synchronous `refresh()` (camera, toggles,
  spacing, picking), so `selected()`/`info()` are valid immediately; rendered
  pixels need a following animation frame. `pickWith` compares DDA against
  brute-force picking — use it for picking regressions.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original is the overriding rule; tests are where it
is enforced.
- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md):
  - "Mines & numbers" — 26-neighbourhood (box graph tests).
  - "Rules" — leftClick/chord/rightClick/unlinking/win/lose semantics
    (`NaiveGame`, the 3D profile's rule tests); timer start rule (browser
    only).
  - "Controls" — release-to-act chord state machine (`MouseActions` test),
    50 u/s movement, look rates, pitch clamp (`FlyCamera` tests); picking
    exclusions (browser `pickWith`/`aimAt`).
- [../domain/features/cell-graph-rules-engine.md](../domain/features/cell-graph-rules-engine.md)
  — the engine behaviours, 3BV and click-count definitions and the fidelity
  rule the `engine-*` tests encode.
- [../domain/features/3d-board-graph.md](../domain/features/3d-board-graph.md)
  — the box graph, 3D profile, state view, deliberate differences and memory
  figures `engine-box-grid`, `engine-3d-profile` and `engine-3d-view`
  encode.
- [../domain/features/board-generation.md](../domain/features/board-generation.md)
  — the determinism, failure, cancel and solver-correctness contracts the
  `generation-*` tests encode.
- [../domain/features/game-summary.md](../domain/features/game-summary.md)
  — the identity, key, summary, derivation and best-eligibility contracts
  `records-board.test.mjs` and `records-summary.test.mjs` encode.
- [../domain/features/personal-records.md](../domain/features/personal-records.md)
  — the bests, counters, history, comparison, persistence, marker and
  failure contracts `records-model.test.mjs` and `records-store.test.mjs`
  encode.
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — the contrast contract and applier/reader contracts `tokens.test.mjs` and
  `theme.test.mjs` encode.
- [../domain/features/platform-storage.md](../domain/features/platform-storage.md)
  — the versioning and failure contracts the `platform-*` tests encode.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit, state, focus, overlay and contrast contracts
  `components.test.mjs` encodes.
- [../domain/features/square-tile-skin.md](../domain/features/square-tile-skin.md)
  — the drawing, cache, contrast and minimum-size contracts
  `tile-skin.test.mjs` encodes.
- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the board setup, session, board view, input and mode contracts the
  `classic2d-*` tests encode, and the deliberate free-cell difference the
  fidelity test pins.
- [../domain/features/game-shell.md](../domain/features/game-shell.md)
  — the router, Back, mode contract, menu and pause contracts the
  `shell-*` tests encode.
- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md)
  — the presets, custom limits, no-guess limit, first-click flow, timer and
  the 3D mode's reports the `mode3d-*` and `shell-mode-3d` tests encode.
- [../domain/features/3d-results-records-screens.md](../domain/features/3d-results-records-screens.md)
  — the 3D end delay, input during it, the results takeover and the Records
  screen's mode switch and 3D picker `mode3d-end` and `records-screen-3d`
  encode.
- [../domain/features/replay-recording.md](../domain/features/replay-recording.md)
  — the format, recording, cap, failure and determinism contracts and the
  measured recording constants the `replay-*` tests encode.
- [../domain/features/replay-library.md](../domain/features/replay-library.md)
  — the replay store, index, retention, pinning, hand-off, library view and
  failure contracts `platform-blob-store`, `replay-library`,
  `replay-handoff` and `records-replays` encode.
- [../domain/features/replay-playback.md](../domain/features/replay-playback.md)
  — the simulator, verifier, snapshot interval, viewer, controls, overlay,
  entry points and failure contracts `replay-simulator`, `replay-viewer`,
  `replay-viewer-3d` and `results-watch` encode.
- [../domain/features/settings.md](../domain/features/settings.md)
  — the schema, store, carry-over, failure, applier and page contracts the
  `settings-*` tests encode.
- [../domain/features/results-screen.md](../domain/features/results-screen.md)
  — the record-before-show flow, content, time format, actions and failure
  note `results.test.mjs` encodes.
- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the picker, figures, history chart, games list, live update, empty
  state and navigation `records-screen.test.mjs` and
  `records-history.test.mjs` encode.
- [../domain/INDEX.md](../domain/INDEX.md) — feature documents whose acceptance
  criteria become tests.

## CROSS-REFERENCES

- [engine.md](engine.md) — `tests/engine-*.test.mjs` pin the cell-graph engine, the box graph, the 3D profile and the 3D state view; the fidelity test checks the reference profile against the observation file, the naive port the 3D profile.
- [generation.md](generation.md) — `tests/generation-*.test.mjs` pin the seeded generator, solver, no-guess loop, worker and client.
- [platform.md](platform.md) — `tests/platform-*.test.mjs` pin the storage interface, backends, the blob store and its implementations, and start-up selection.
- [records.md](records.md) — `tests/records-*.test.mjs` pin the board identity and key, the summary builder and its derived stats, the records model, the records store, the Records screen, its history chart and games list, and its library view.
- [input.md](input.md) — `tests/gamepad.test.mjs` covers gamepad helpers, `FlyCamera`, `Controls`, `MouseActions`.
- [app-shell.md](app-shell.md) — owns `window.__ms`, the surface Playwright drives,
  the token sheet, theme applier and token reader the token/theme tests pin,
  the component kit and kit-built screens `components.test.mjs` pins,
  the game shell (`js/shell/`) the `shell-*` tests pin, and the results
  flow and screen (`js/results/`) `results.test.mjs` pins, with the flow's
  hand-off to the replay library in `replay-handoff.test.mjs`.
- [mode3d.md](mode3d.md) — `tests/mode3d-*.test.mjs` pin the 3D board choice, its no-guess limit, the session and the end sequence; `tests/shell-mode-3d.test.mjs` the adapter.
- [classic2d.md](classic2d.md) — `tests/classic2d-*.test.mjs` pin the session and board setup, board view, pointer and cursor inputs and the mode, and check the inputs and custom limits against the observation file; `tests/tile-skin.test.mjs` the tile painter, cache and `MIN_TILE_SIZE`.
- [replay.md](replay.md) — `tests/replay-*.test.mjs` pin the format, the recorder and sealer, 2D and 3D capture, determinism over `tests/fixtures/replays/`, the replay library and the end-of-game hand-off to it, the simulator and verifier, the viewer and its 2D and 3D viewers; `tests/results-watch.test.mjs` pins Watch replay; `dev/measure-replays.mjs` is the measurement behind the recording constants.
- [rendering.md](rendering.md) — `tests/render-3d-feedback.test.mjs` pins the ghost alpha and the pulse envelope and checks the ghosts and pulses in a browser; the rest of the drawing has only the static not-themed checks and is verified visually via Playwright screenshots, a 3D replay played on the renderer in `tests/replay-viewer-3d.test.mjs`, and no frame drawn under a 3D game's results screen in `tests/mode3d-end.test.mjs`.
- [audio.md](audio.md) — no unit tests of the sounds; WebAudio only checkable in a browser.
- [settings.md](settings.md) — `tests/settings-*.test.mjs` pin the schema, store, appliers, page,
  binder and bindings source.

## WHEN TO READ THE SOURCE

- Adding a rule change to the 3D profile: extend `NaiveGame` only if the original
  behaves that way, then add a focused test next to the matching section.
- A fidelity-test failure: read the cited entry in
  `tests/fidelity/minesweeper-online.md` and the profile marker that cites
  it, then fix the engine.
- A randomized-test failure: read `assertSame` output (seed, action, cell) and
  replay that seed with the engine and `NaiveGame`.
- A pinned generation output fails: decide whether the change is a generator
  change (bump `GENERATOR_VERSION`, re-pin) or a regression; a solver
  failure prints the seed — replay it with `solve()` and read
  `js/generation/solver.js`.
- Adding a gamepad family, button mapping or trigger threshold (`padFamily`
  cases, `fakePad`, `press`).
- Writing a Playwright script that needs a hook method not listed above, or
  changing `__ms` (read the end of `js/main.js`).
- Investigating a perf-test timeout on slower hardware.
- A failure in `tests/mode3d-noguess-limit.test.mjs`: re-run
  `node dev/measure-noguess-3d.mjs` before moving `NOGUESS_CELL_LIMIT`.
- A failure in `tests/replay-determinism.test.mjs`: a fixture that no
  longer reproduces means the engine or the format changed under recorded
  replays — fix the regression, or add a format version and its upgrade;
  re-run `node dev/measure-replays.mjs` before moving a recording constant.
- A failure in the snapshot-constants test of
  `tests/replay-simulator.test.mjs`: the constants are measured — read
  feature replay-playback § Snapshot interval and the simulator's head
  comment before moving one.
- A contrast failure in `tests/tokens.test.mjs`: the message names the theme,
  token pair and ratio; read the colour parser there before changing a value
  format in `css/tokens.css`.
- A browser contrast failure in `tests/components.test.mjs`: the message lists
  the failing text runs per theme; read `measureContrast` there and the
  screenshots it saved before changing a token or a kit rule.
