# Game shell

The frame around every game: the main menu, the screens it leads to, and the
in-game flow every mode shares — pausing and resuming, restarting and going
back to the menu — with the same keyboard, mouse and controller navigation
on every screen.

## Purpose

[product-design.md § Main menu and game shell](../product-design.md#main-menu-and-game-shell)
describes everything around a game. In m1-classic-2d the game stops being a
single 3D board behind a menu and becomes several modes behind one menu, so
the shell needs one way to host a mode, one pause/restart/menu flow that
behaves the same in each, and one navigation model for every screen. This
feature is that shell; the screens' layout comes from `shared-screen-layout`
and `in-game-layout` and their look from the chosen theme (`theme-system`), the
settings from `settings`, and what each mode does on its board from that
mode's front-end.

## Scope and non-goals

In scope (m1-classic-2d):

- The main menu's entries: the modes Classic 2D, Hexagon, Triangle,
  Surface and 3D, then Daily, Records and Settings, in the order
  and arrangement `shared-screen-layout` § Scope and non-goals, *Main
  menu*, gives them. Classic 2D opens its board choice; 3D opens the 3D
  board choice; Hexagon, Triangle and Surface each open the *Coming soon*
  page (the placeholder screen, Back returning to the menu) until their
  mode is built; Daily opens the Daily screen; Records opens the records
  screen; Settings opens the Settings page. Quit is no menu entry: it is a
  button of the title bar on every desktop window (`shared-screen-layout`),
  and what it does is `leaderboards-menu-entry`'s.
  In a browser without
  WebGL 2 the 3D entry is disabled, its line *Needs WebGL 2 — not available
  in this browser* under its label, no route
  starts a 3D game and the Daily screen's 3D row is disabled with that
  line; every other entry runs as everywhere else.
- The daily boards and challenges. Each day has two boards, Expert
  no-guess and the cube 8 × 8 × 8 · 40 no-guess, the same for everyone on
  that local calendar date; when the main menu shows, today's boards whose
  counted attempt is unused are pre-generated in the background through
  each mode's warm client, and the menu never waits for them. The Daily
  screen — with the router's focus and Back, by mouse, keyboard and
  controller — shows today's date and lists every mode in menu order:
  Classic 2D and 3D with their board and their state (*Not played*, *Won*
  with its time in the format `shared-screen-layout` gives, *Lost*), and
  Hexagon, Triangle and Surface as *Coming soon*, which cannot be played.
  For the selected mode it shows the days in a row (current and longest),
  today's code with Copy and Copy link, Play while today's counted attempt
  is unused, and Watch replay once won when the library kept the replay;
  Play is disabled once the attempt is used, on a coming-soon mode and on
  the 3D row without WebGL 2. Its arrangement is `shared-screen-layout`'s.
  A board code entered in a board choice's *Insert Board Code* option, or a
  `#board=<code>` link, starts a
  challenge in its mode; today's daily code opens the Daily screen instead,
  so the counted-attempt rules hold. A daily and a challenge open closed
  with their start cell marked and forced: a first reveal elsewhere changes
  nothing and is not recorded, the hint *Start on the marked cell* shows
  and the mark pulses; free play keeps its free first click. Play again
  after either starts a fresh free-play board of the same size, mines and
  no-guess setting, and neither changes the last board choice memory.
- The `#board=` link: at start-up, once settings and records have loaded,
  it opens the main menu and then its challenge, so Back leads to the menu;
  a `hashchange` to one is honoured the same way while no game is started
  and ignored with a toast during one; a refused code shows the main menu
  with a toast giving its reason. The hash is then removed with
  `history.replaceState`, adding no history entry, so the shell's own
  navigation never changes the URL. `/#board=…` is served by `/`, so
  `404.html` is unchanged.
- A screen router: which screen is showing, the transitions between them,
  and Back from every screen to the one it came from.
- A mode host: the one contract through which the shell starts, pauses,
  resumes, restarts and leaves a game, implemented by the Classic 2D
  front-end and by an adapter over the existing 3D game.
- Pause and resume, restart, and Main menu, from the pause card and from
  the keyboard and controller: `F2` and the controller's Start + Y restart
  in play and on the pause card, and `R` on the results screen is *Play
  again*. While paused the board is hidden in every mode and the timer
  keeps running.
- Automatic pause when the window loses focus or the tab is hidden during a
  started, unfinished game, and the leave-page guard for such a game on the
  web build.
- The in-progress hook that lets `personal-records` keep a started,
  unfinished game's summary so far, so a game ended by closing the window,
  the tab or the app counts as a loss.
- Keyboard and controller navigation on every shell screen: focus order,
  with the arrow keys moving focus as the controller's D-pad does, default
  focus per screen, Back on Esc, the controller's back button and the
  browser's Back (a mouse's back button through it), an "Esc: Back" hint
  beside each Back that Esc triggers, and suppression of a button held
  across a screen change.

Non-goals:

- Start / Continue and the Campaign entry — deferred to `m4-campaigns`.
- The leaderboards in the Records screen's Leaderboards tab, and Quit's
  action — deferred to `m3-on-steam` (`leaderboards-menu-entry`).
- The demo's menu entries (*Buy full game*, visible locks) — deferred to
  `m5-core-complete`.
- The Hexagon and Triangle modes — `flat-grid-modes`, their menu entries
  `flat-grid-menu-entries` (`m2c-flat-grids`), which also adds their daily
  boards and makes their Daily rows playable. The Surface mode and
  its daily board — deferred to `m6-launch`; until then its entry and Daily
  row say *Coming soon*.
- The records screen's contents and the results screen — Results and
  records (m1-classic-2d). The shell only routes to them.
- The layout and look of any screen — `shared-screen-layout`,
  `in-game-layout` and `theme-system`.
- The Settings page itself — `settings`.

## Architecture

Built within the recorded technical direction — the game shell is plain DOM
over ES modules with no framework and no build step, shared by every mode
front-end (see [technical-direction.md](../technical-direction.md)). It
grows out of the existing shell described in
[app-shell.md](../../context/app-shell.md), whose single 3D-only mode state
it generalises.

- **Screen router.** Owns the current screen (menu, mode board choice,
  playing, paused, results, records, settings) and a back stack. It shows
  one screen at a time, hands focus to the screen's default target, and
  resolves Back. Every screen change goes through it; no screen shows
  another directly.
- **Main menu.** The entry list composed from `screen-components`, each entry
  a route; each mode's play tile shows its own preview
  (`shared-screen-layout`). WebGL 2 is not a requirement of the shell:
  whether the 3D renderer could be created is the one availability flag
  every 3D-only path reads. Without it the screens that would show the 3D
  scene show a static background built from the theme's tokens in its
  place, the 3D tile is disabled with its reason and a locked preview, the
  menu's default focus falls to the first enabled entry, and no full-page
  "Cannot start" card shows — that card stays only for game files that
  fail to load. The menu opens with the last mode played selected, with no
  Last played mark, and that mode's board choice opens on its last board
  selected, so Enter and then *Play* replay it; with no mode played yet,
  the first entry is selected.
- **Mode host.** A registry of mode front-ends behind one contract (see
  Interfaces). The shell knows modes only through it. Classic 2D implements
  it directly; the 3D mode implements it through an adapter that wraps the
  existing start, pause, pointer-lock and end-of-game flow without changing
  its rules, look or controls.
- **Pause controller.** The one owner of pause: from Esc, the controller's
  Start button, the pause button in the in-game overlay, the browser's Back
  on the board (as the overlay's pause button pauses), focus loss and tab
  hide. It asks the active mode to pause, shows the pause card over a hidden
  board, and on resume asks the mode to resume. In 3D, resume keeps the
  current behaviour of re-acquiring pointer lock, or entering lockless play
  when resumed from a controller; on a coarse-only device it never requests
  pointer lock, and resume returns to lockless touch play.
- **Shell navigation.** Keyboard and controller navigation for every shell
  screen, built on the existing controller reader and spatial focus search
  ([input-controller.md](../../context/input-controller.md)): the topmost visible layer takes
  input; while an overlay is open (the pause card, the
  results card, the replay viewer) the rest of the page is inert, the status
  toast excepted, and Tab wraps at its edges where `inert` is unavailable;
  the pause confirmation contains the pause card the same way; each screen
  declares its default focus, and buttons held across a screen change are
  ignored until released. A move that finds nothing in
  the pressed direction goes to the next control in DOM order (the previous
  one for Up and Left), never wrapping, and Down / Up step a table's buttons
  and a menu's items in DOM order. The arrow keys are the
  keyboard's spatial focus moves, through the same search as the D-pad, on
  every layer it walks except the boards, Records and the replay viewer,
  which handle their own arrows; a control that owns an arrow keeps it (a
  slider's or a text field's Left/Right, a Settings choice's Left/Right). The
  browser's session history mirrors the back stack, so the browser's Back
  resolves through the same Back as Esc. On-board input belongs to the mode.

## Data and state

- **Shell state** — current screen, back stack, active mode and whether its
  game is started, paused or finished. In memory only; the back stack is
  also mirrored as one same-URL session-history entry per stacked screen,
  which carries the stack depth and no route, so nothing is persisted, no
  inner screen has a link and a reload opens the main menu. The one link
  the shell reads is a `#board=` challenge link, removed once followed.
- **Last mode played** — which mode and board choice the player last
  started, kept through `platform-storage` so later milestones' *Continue*
  can resume it. Each mode keeps its own last board choice; the shell keeps
  only which mode it was. Together they name the last board played — the
  last mode's last board choice, once it was played — which the menu's
  default selection and its board choice's selection follow. The Learn 3D guided
  board, outside the 3D board choice, is never the last mode or board
  played.
- **Source of truth** — the active mode owns its game and timer; the shell
  holds only whether a game is in progress and paused, as the mode reports
  it.

## Interfaces and contracts

- **Mode contract** — each mode front-end provides: `open board choice`,
  `start(choice)`, `pause()`, `resume()`, `restart()`, `leave()`,
  `summary()`, and reports `game started`, `game finished(summary, replay)`,
  `game abandoned(summary, replay)` and `can pause` back to the shell, the
  replay being the game's sealed recording from `replay-recording`, or none
  from a mode that does not record. `pause()` stops the mode accepting board
  input, and its timer keeps running; `leave()` discards the game and releases
  everything the mode holds (pointer lock, canvas, worker requests).
  `restart()` and `leave()` on a started, unfinished game first report
  `game abandoned` with the game's summary from `game-summary` and its
  replay; a game left before its first click reports nothing. `summary()`
  returns that same summary for a started, unfinished game at any moment,
  outcome abandoned.
- **Pause rules** — pause applies only to a started, unfinished game; before
  the first click or after the game ends, the pause key opens the pause card
  without a game to pause, its status line saying which
  (`shared-screen-layout.md` § Cards), offering Restart (Play again once
  the game ended) and Main menu. Back on that card resumes the board before the
  first click, and goes to the main menu only once the game has ended.
  While the first click's board is being
  generated, Esc and the controller's back button cancel the generation,
  back to the closed board, instead of opening the pause card; the
  overlay's pause button, Start, focus loss and tab hide still pause. While
  the pause card shows, the board is hidden in every mode.
- **Restart** — discards the current game and starts a new one with the same
  board choice, from the pause card's Restart, `F2` or the controller's
  Start + Y (`Y` pressed while `Start` is held; `Start` alone pauses and
  `Y` alone keeps its play meaning). A started, unfinished game is
  abandoned at once — still a loss — with no confirmation; the first such
  restart after each load of the game shows one toast saying the game
  counted as a loss and that the "Always ask before restarting" setting
  brings the confirmation back. Under that setting every restart of a
  started, unfinished game first asks for confirmation on the pause card,
  saying the game will count as a loss — `F2` and Start + Y in play open
  the pause card with the question showing — and no toast shows. A restart
  before the first click, while the first board is generated or after the
  end abandons nothing and neither asks nor shows the toast. `F2` and
  Start + Y do nothing during the 3D end delay, while a confirmation
  shows, or on a screen with no game; `R` and `Home` in 3D
  play keep returning the camera to the start view. On the Learn 3D guided
  game, which counts as no loss, restart proceeds at once with no
  confirmation and no toast, whatever the setting, and opens the guided
  board again from its closed box.
- **Main menu** — leaves the mode and returns to the main menu; during a
  started, unfinished game it asks for confirmation, saying the game will
  count as a loss — except on the Learn 3D guided game, where it proceeds at
  once.
- **Game finished** — the shell hands the mode's summary to `results-screen`
  and routes to it; *Play again* comes back as `start` with the same choice.
  The Learn 3D guided game has no summary: its end goes to the Learn 3D end
  card over the stopped scene, not the results screen, with the actions
  `3d-play-flow` gives it.
- **Game abandoned** — the shell records the mode's summary with
  `personal-records` and goes where the player asked, showing no results
  screen.
- **Game in progress** — at `game started`, at every pause of a started,
  unfinished game and on the page's `pagehide`, the shell passes the mode's
  `summary()` to the in-progress hook `personal-records` fills. A game ended
  by closing the window, the tab or the app is then recorded as abandoned —
  a loss — at the next launch, with the summary of the last of those
  moments.
- **Navigation contract** — every shell screen is fully operable by mouse,
  keyboard and controller; Esc and the browser's Back always mean Back or
  Pause, never a game action, and so does the controller's back button off
  the board — on the board it shows or hides the live figures
  (`in-game-layout`), and Start is the controller's only pause in play. The
  browser's Back differs from Esc only during a game: on the board it
  pauses, on the pause card and on a started game's ready card it keeps the
  game where it is, during the 3D end delay it does nothing, so it never
  resumes a game and never leaves one without the "It will count as a
  loss" confirmation; it leaves the site only from the main menu, and a
  browser Forward is undone. Controller operability is checked in a real
  browser with a controller alone, on the board choice and on the
  placeholder screen.
- **Failure** — a mode that fails to start (for example a lost graphics
  context in 3D) reports it; the shell shows the mode's failure screen and
  offers Main menu. A failure in one mode never leaves the shell
  unusable.

## Dependencies

- `screen-components` — every component and the m1 screen designs: main
  menu, pause card, in-game overlay.
- `settings` — the Settings page the menu routes to; look and audio values
  the 3D adapter reads.
- `platform-storage` — the last mode played.
- `classic-2d-square-play` — implements the mode contract for Classic 2D.
- `results-screen` and `records-screen` — the screens the shell routes to;
  the results screen receives each finished game's summary.
- `personal-records` — records each abandoned game's summary and keeps a
  started game's summary so far through the in-progress hook.
- No external libraries.
