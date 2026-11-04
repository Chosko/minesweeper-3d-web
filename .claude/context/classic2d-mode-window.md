# Classic 2D mode — game window, sound and end delay

## OVERVIEW

What `js/classic2d/mode.js` shows and plays around a flat mode's game: the
game window it feeds, the sound cue of every action and the end delay,
which plays the end effect
([classic2d-end-effect.md](classic2d-end-effect.md)). The mode's contract,
start, feed, generation client and restart are
[classic2d-mode.md](classic2d-mode.md)'s; the area overview is
[classic2d.md](classic2d.md).

- `js/classic2d/mode.js` — `cue`, `act`, the `finished` handler and
  `END_DELAY_MS`.

## PUBLIC API

`js/classic2d/mode.js`
- `END_DELAY_MS`; `ending` and `finishNow()` on the mode
  ([classic2d-mode.md](classic2d-mode.md) holds the full contract).
- `sound` — the sound sink (`{reveal(count), flag(on, count), chord(count),
  noop(), explode(), win()}`, the `sfx` of `js/audio.js` that `main.js`
  hands in), null by default.

## INTERNAL PATTERNS

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
- **End delay.** A win or loss reports can-pause false at once and runs
  the end delay (`ending`): the view plays the end effect (`WIN` from the
  last action's cell, `LOSS` from the exploded tile nearest it by the
  geometry's cell centres), `tick()`
  drawing each frame at the clock's time since the end; after
  `END_DELAY_MS` — frames drawn or not — or at `finishNow()` (any press,
  `pagehide`), the view is drawn in its end state and finished is reported
  once with the summary and replay. Pause and `hideBoard` are ignored
  during it; `restart` and `leave` cancel it.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — the sound of each action;
  [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window.

## CROSS-REFERENCES

- [classic2d-mode.md](classic2d-mode.md) — the mode's contract, start,
  feed, generation client and restart.
- [app-shell-hud.md](app-shell-hud.md) — the window's ids;
  [app-shell-2d.md](app-shell-2d.md) — the board area and panel, `main.js`
  handing in `sfx`; [app-shell-end-delay.md](app-shell-end-delay.md) — the
  end delay's skip.
- [audio.md](audio.md) — the `sfx` cues, volume and mute.
- [classic2d-end-effect.md](classic2d-end-effect.md) — the end effect the
  end delay plays.
- [testing-files.md](testing-files.md) — `tests/classic2d-mode.test.mjs` the end
  delay, cues and window in a browser.

## WHEN TO READ THE SOURCE

- Changing the 2D end delay: `END_DELAY_MS` and the `finished` handler in
  `mode.js`.
- Changing which cue an action plays (`cue` and `act` in `mode.js`; the 3D
  game's mapping it mirrors is `onAction` in `js/main.js`).
