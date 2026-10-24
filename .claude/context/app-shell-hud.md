# App shell — in-game readouts: counters, live figures, game window, 3D overlay

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers what `UI` (`js/ui.js`) draws during a game: each mode's counter
strip, the live figures through the live figures model
(`js/shell/live-figures.js`, whose head comment holds every figure's wording
and format), the Classic 2D game window's parts, the 3D overlay's parts and
the aimed-cell readout. The `UI` methods that write them are
[app-shell-ui.md](app-shell-ui.md) § PUBLIC API.

## PUBLIC API

- `UI`'s HUD writes: `updateHud(time, minesLeft, clicks?)`,
  `updateFigures2D` / `updateFigures3D(input, {tick, bests})`, `setBoard`,
  `setLearn`, `setArrow`, `setReadout`, `setSwap`, `setTapMode`,
  `setFigures2D` / `setFigures3D(open)`
  ([app-shell-ui.md](app-shell-ui.md)); each touches the DOM only on change.
- `liveFigures` (`js/shell/live-figures.js`) — the live figures model both
  modes' panels and the replay viewer's show; `createFiguresPanel` there —
  the panel's stored open state.

## INTERNAL PATTERNS

- **Counters.** Each mode's `ui-counter-strip`: mines left
  (`formatMineCount`, `data-negative` below zero (drawn by the theme in
  the danger colour), widened past three digits by `mineCounterDigits`),
  Restart (`#c2d-restart` / `#hud-restart`, icon-only, named and
  tooltipped *Restart*, never taking focus) and the
  timer (`formatOverlayTime`, stops at `999`).
  `updateHud` writes the Classic 2D window's (`#c2d-mines-left`,
  `#c2d-time`) while it shows, else the 3D overlay's (`#hud-mines`,
  `#hud-time`), and the Clicks figure (`#c2d-clicks`, `#hud-clicks`: counted
  clicks, wasted included).
- **Live figures.** `updateFigures2D` / `3D` run the live figures model
  (`liveFigures`, `js/shell/live-figures.js`: 3BV with its progress, pace vs
  PB, 3BV/s, clicks with efficiency, flags with mines left; the dash
  placeholder for a figure not yet computable) against the board's bests
  `js/main.js` reads once per game, and write the panel through
  `bindFigures`: on a count change each changed figure and the live part's
  `figuresLine` (`bindFiguresLive`), on the timer's second (`tick`) only
  pace and 3BV/s. Each panel's foot (`#c2d-reminder`, `#hud-reminder`) is
  the mode's `reminderKeys` for the active device.
- **Classic 2D window** (`#c2d`; `showClassic2D` marks `#hud` `hud--2d`,
  hiding the 3D overlay): Pause `#c2d-pause` (the pause icon in Back's
  place) and the logo in its title bar, no heading; `#hud-tap` under the board (the Tap choice,
  a `ui-segmented` radiogroup of "Tap: Reveal" and "Tap: Flag", only under
  `(pointer: coarse)`, its options never taking focus; its
  chosen option's value goes through `onTapMode` to every flat mode's `setTapMode`,
  written back with `setTapMode`); the foot line `#c2d-line` — the title
  `#c2d-title` (the open mode's name and board, which names the window), then the
  board line `#c2d-size` — and at its right `#c2d-tools`: `#hud-swap`
  (Swap clicks, `aria-pressed`, never under `(pointer: coarse)`) and the
  live-figures toggle `#c2d-figures-toggle` (`aria-pressed`, through
  `onToggleFigures`; none on a phone). Neither takes the focus from the
  mouse; the keyboard reaches both by Tab, and Enter or Space on them
  never reaches the board. The panel `#c2d-figures` shows while the
  stored preference (`createFiguresPanel`, the `shell.liveFigures`
  document, closed when nothing is stored) is open (`setFigures2D`). Its layout:
  [classic2d-mode.md](classic2d-mode.md) § Game window.
- **HUD density.** The counter digits, the figures' values and spacing, the
  panel titles and the touch buttons follow the frame's size steps
  (desktop, compact, touch) in the Classic 2D window and the 3D overlay
  alike: the sizes are the theme stylesheet's, its in-game readouts' steps
  after the readouts' own rules; the 3D touch toolbar's buttons take the
  coarse rule's size in `css/style.css`.
- **3D overlay** (`#hud-overlay`), with no title: Pause `#hud-pause`
  (icon-only) floating at the top left, the counter strip `#hud-counters`
  at the top centre, the live-figures toggle `#hud-figures-toggle` at the
  top right (`aria-pressed`, through `onToggleFigures`, never taking focus
  from the mouse, Enter or Space on it never reaching the scene) and the
  figures panel `#hud-figures` on the right, each on its own surface over
  the sky. The panel shows while the same stored preference as Classic
  2D's is open (`setFigures3D`, `#hud[data-figures="open"]`); one toggle
  flips both modes' panels. On a phone and in landscape only Pause remains
  of the floating controls. Learn 3D's overlay (`hud--learn`, from
  `setLearn`) is its own layout: no timer, no figures panel and no toggle,
  Pause over the counter strip at the top left —
  [mode3d-learn.md](mode3d-learn.md) § Learn 3D's screens. Start pauses through
  `#hud-pause` (`#c2d-pause` in Classic 2D); the controller's View button
  presses the mode's live-figures toggle while it shows. Layouts by window size:
  `css/components.css`'s head comment (*3D game overlay*).
- **Behind a card.** While the 3D ready card (not pending), the pause card
  or the results show, `#hud` is hidden — the 3D overlay, the key strip,
  the hint strip — and the Classic 2D window keeps its board and its
  title bar's logo alone; while the 3D board status card shows, `#hud` is hidden under its
  scrim. `css/style.css` does it from those screens' visibility
  (`body:has(…)`); `UI` toggles nothing for it.
- **Aimed-cell readout** `#aim-readout` sits below and right of the
  crosshair at the canvas's offsets (J-Game3D-states): an outline cube
  icon and `#aim-cubes`, then `#aim-flag-part` (a muted dash, an outline
  flag icon and `#aim-flags`) only while there are flags, the icons in the
  text colour.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the counters' display formats.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the game window, the 3D overlay and the live figures.

## CROSS-REFERENCES

- [app-shell-ui.md](app-shell-ui.md) — the `UI` methods and what hides the
  HUD behind a card.
- [app-shell-kit.md](app-shell-kit.md) — the in-game components;
  [app-shell-kit-helpers.md](app-shell-kit-helpers.md) — counter formats,
  `bindFigures`.
- [classic2d-mode.md](classic2d-mode.md) § Game window — the Classic 2D
  window's layout and feed; [mode3d-session.md](mode3d-session.md) — the 3D
  overlay's feed; [mode3d-learn.md](mode3d-learn.md) — Learn 3D's overlay.
- [testing.md](testing.md) — `tests/components.test.mjs`,
  `tests/components-game3d.test.mjs`, `tests/live-figures.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing a figure's wording or format: the head comment of
  `js/shell/live-figures.js`.
- Changing a readout's size step or its layout by window size: the theme
  stylesheet's in-game readouts and `css/components.css`'s head comment.
