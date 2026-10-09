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
feature is that shell; the screens' look comes from `screen-components`, the
settings from `settings`, and what each mode does on its board from that
mode's front-end.

## Scope and non-goals

In scope (m1-classic-2d):

- The main menu with four entries: Classic 2D, 3D, Records and Settings.
  Classic 2D opens its board choice; 3D opens the existing 3D presets and
  custom board; Records opens the records screen; Settings opens the
  Settings page.
- A screen router: which screen is showing, the transitions between them,
  and Back from every screen to the one it came from.
- A mode host: the one contract through which the shell starts, pauses,
  resumes, restarts and leaves a game, implemented by the Classic 2D
  front-end and by an adapter over the existing 3D game.
- Pause and resume, restart, and back to menu, from the pause card and from
  the keyboard and controller. While paused the board is hidden in every
  mode and the timer is stopped.
- Automatic pause when the window loses focus or the tab is hidden during a
  started, unfinished game, and the leave-page guard for such a game on the
  web build.
- Keyboard and controller navigation on every shell screen: focus order,
  default focus per screen, Back on Esc and the controller's back button,
  and suppression of a button held across a screen change.

Non-goals:

- Start / Continue and the Campaign entry — deferred to `m4-campaigns`.
- The Leaderboards entry — deferred to `m3-on-steam`.
- The Daily entry and the demo's menu entries (*Buy full game*, visible
  locks) — deferred to `m5-core-complete`.
- The Surface entry and grid choice in Classic 2D — deferred to `m6-launch`.
- Quit. The web build has no window to close; see Open questions.
- The records screen's contents and the results screen — Results and
  records (m1-classic-2d). The shell only routes to them.
- The look of any screen — `screen-components`.
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
  a route. The decorative 3D demo board behind the current menu stays as the
  menu's backdrop.
- **Mode host.** A registry of mode front-ends behind one contract (see
  Interfaces). The shell knows modes only through it. Classic 2D implements
  it directly; the 3D mode implements it through an adapter that wraps the
  existing start, pause, pointer-lock and end-of-game flow without changing
  its rules, look or controls.
- **Pause controller.** The one owner of pause: from Esc, the controller's
  Start button, the pause button in the in-game overlay, focus loss and tab
  hide. It asks the active mode to pause, shows the pause card over a hidden
  board, and on resume asks the mode to resume. In 3D, resume keeps the
  current behaviour of re-acquiring pointer lock, or entering lockless play
  when resumed from a controller.
- **Shell navigation.** Keyboard and controller navigation for every shell
  screen, built on the existing controller reader and spatial focus search
  ([input.md](../../context/input.md)): the topmost visible layer takes
  input, each screen declares its default focus, and buttons held across a
  screen change are ignored until released. On-board input belongs to the
  mode.

## Data and state

- **Shell state** — current screen, back stack, active mode and whether its
  game is started, paused or finished. In memory only.
- **Last mode played** — which mode and board choice the player last
  started, kept through `platform-storage` so later milestones' *Continue*
  can resume it. Each mode keeps its own last board choice; the shell keeps
  only which mode it was.
- **Source of truth** — the active mode owns its game and timer; the shell
  holds only whether a game is in progress and paused, as the mode reports
  it.

## Interfaces and contracts

- **Mode contract** — each mode front-end provides: `open board choice`,
  `start(choice)`, `pause()`, `resume()`, `restart()`, `leave()`, and reports
  `game started`, `game finished(record)` and `can pause` back to the shell.
  `pause()` stops the mode's timer and stops it accepting board input;
  `leave()` discards the game and releases everything the mode holds
  (pointer lock, canvas, worker requests).
- **Pause rules** — pause applies only to a started, unfinished game; before
  the first click or after the game ends, the pause key opens the pause card
  without a timer to stop, offering restart and back to menu. While the
  pause card shows, the board is hidden in every mode.
- **Restart** — discards the current game and starts a new one with the same
  board choice; during a started, unfinished game it asks for confirmation.
- **Back to menu** — leaves the mode and returns to the main menu; during a
  started, unfinished game it asks for confirmation.
- **Game finished** — the shell forwards the mode's finished-game record to
  Results and records and routes to the results screen; *Play again* comes
  back as `start` with the same choice.
- **Navigation contract** — every shell screen is fully operable by mouse,
  keyboard and controller; Esc and the controller's back button always mean
  Back or Pause, never a game action.
- **Failure** — a mode that fails to start (for example a lost graphics
  context in 3D) reports it; the shell shows the mode's failure screen and
  offers back to menu. A failure in one mode never leaves the shell
  unusable.

## Dependencies

- `screen-components` — every component and the m1 screen designs: main
  menu, pause card, in-game overlay.
- `settings` — the Settings page the menu routes to; look and audio values
  the 3D adapter reads.
- `platform-storage` — the last mode played.
- `classic-2d-square-play` — implements the mode contract for Classic 2D.
- Results and records (m1-classic-2d) — the results and records screens the
  shell routes to, and the finished-game records it forwards.
- No external libraries.

## Open questions

- Quit is in no milestone's scope slice, yet the m3-on-steam Electron build
  needs a way to close the game. Blocks only the Steam build; to be settled
  when `m3-on-steam` is architected, by adding Quit to its slice.
