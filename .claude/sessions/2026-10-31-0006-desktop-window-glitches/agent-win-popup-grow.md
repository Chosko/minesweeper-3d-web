# Agent handoff — win-popup-grow

Problem (owner, Electron on Steam): a popup during a flat-mode game grows the
desktop window to fit the game window and the popup together.

## Root cause

- `js/platform/window-actions.js:30` `SCREEN_FRAMES = '.ui-frame, .ui-screen'`.
- `js/platform/window-actions.js:151-172` `bindScreenSize().measure()` takes the
  UNION box of every shown element matching `SCREEN_FRAMES`, shifts the root by
  its corner (`--window-x/-y`) and reports its size (`reportSize` →
  `client.setContentSize` → `desktop/window.js:51-67 fit()`, which keeps the
  window's top-left and only caps/moves it inside the work area).
- The union is deliberate: comment at window-actions.js:133 ("a card over the
  game window included"), `.claude/context/platform.md:162-176`, and the test
  `tests/platform-selection.test.mjs:446-463` ("the wider results take the
  window with them", expects `[1040, 700]`).
- Cards are laid out in the root area (the work area), not the game window:
  `.overlay` = `position: fixed; inset: 0; flex centre` (`css/style.css:42-48`),
  root has `contain: layout` (style.css:5) so fixed layers resolve against the
  work-area-sized root. `#c2d` has asymmetric padding `33px … 83px`
  (style.css:442), so the game frame's centre sits 25 px above the overlay's
  centre — even a smaller card can poke out at the bottom.
- 3D is not affected: `js/main.js:437` `fullArea: () => MODES.active === '3d' &&
  S.mode !== REPLAY_SCREEN` makes the window the whole work area for the whole
  3D mode (pause, ready, status, results, learn-end included).

## Affected popups (flat modes: Classic 2D, Hexagon, Triangle)

- Pause card `#pause-card` (`index.html:905`, `ui-card ui-screen ui-screen--wide`):
  width 920 / 880 / 860 px by root step (`css/components.css:2341-2343`); the
  game window behind stays shown (chrome hidden, `css/style.css:532`). Its
  confirm box `#pause-confirm` lives inside it (only changes the card height).
- Board status card `#c2d-status` (`index.html:141`, `ui-card ui-screen`):
  `min(480px, 100cqw - 2*space-4)`, fixed at 50%/50% of the root
  (style.css:524) — wider than a Beginner/narrow-custom game window.
- Results `#results-frame` (`index.html:651`, `.ui-frame`, 1040/1000/960 px,
  style.css:302-304) — the OTHER agent's "results widens the window": same
  cause, same function, same fix.
- `#ctx-lost` card (`index.html:421`, rare, any screen).
- Not measured, so never grow the window: help panel `#help` (`.hud-panel`),
  toast `#toast` — those can be clipped instead (toast agent's area).

## Constants / current values

- `SCREEN_FRAMES` `'.ui-frame, .ui-screen'`; shift vars `--window-x`, `--window-y`.
- Pause card 920/880/860 px; status card max 480 px; results 1040/1000/960 px.
- Game window minimum: `ui.fitTitle2D()` (`js/ui.js:504-514`) — Pause + window
  buttons; a Beginner window is far narrower than the pause card.

## Proposed fix (recommended: A — the popup is the window while it shows)

A. In `bindScreenSize().measure()` a shown frame inside an over-the-screen
   layer takes the window alone; the screen frames under it are not measured.
   - `index.html`: mark the layers shown over a screen with a generic attribute,
     e.g. `data-window-over` on `#pause`, `#results`, `#ctx-lost` (and `#ready`,
     `#learn-end` for consistency; 3D never measures them).
   - `window-actions.js`: export `OVER_FRAMES = '[data-window-over] :is(.ui-frame, .ui-screen)'`;
     in `measure()` collect shown frames; if any shown one `matches(OVER_FRAMES)`
     (or `closest('[data-window-over]')`), union only those; else as today.
     Platform code stays id-free (no shell ids in js/platform/).
   - `#c2d-status` is a notice over a board still generating: keep the window
     the game window and lay the card inside it instead — exclude it from
     measuring (drop `ui-screen` matching via a `data-window-inside` marker, or
     move it into `#c2d-frame`'s board column) and cap it to the window:
     `width: min(480px, var(--window-w, 100cqw) - 2*space-4)` centred on
     `var(--window-x) + var(--window-w)/2` (would need `bindScreenSize` to also
     set `--window-w/-h`). Simplest robust variant: move `#c2d-status` into
     `#c2d-frame` (absolute, centred on the stage, `max-width: calc(100% - 2*space-4)`).
B. Alternative (owner's call): the window stays the game window and every card
   lays out inside it. Needs `--window-w/-h`, over-game overlays inset to the
   window box, and the pause card's `@container root` breakpoints
   (components.css:2342-2363) re-pointed at a container on `#pause`; results'
   1040 px frame would be squeezed into a ~400 px window with no layout for it
   (its narrow layout is the touch `@media`, which the desktop never takes).
   Bigger and worse for small boards — not recommended.

Consequence of A: the window still changes size on pause (game → card), but
shows one frame, never "both". The host keeps the top-left (`fit()`), so it
grows right/down; re-centring would be a host change — not proposed.

## Tests

- Change `tests/platform-selection.test.mjs:446-463`: with a frame inside a
  `[data-window-over]` layer shown, the report is that frame's size and the
  shift its corner (fake `frame.closest`/`matches` needed in `fakeFrame`);
  hiding it reports the game frame again; a card not in such a layer and inside
  the game box changes nothing.
- Static CSS/markup test (components.test.mjs style) that `#pause`, `#results`,
  `#ctx-lost` carry the marker; if `#c2d-status` moves, the pause/status
  browser tests that read its position (search `c2d-status` in tests/).
- No Electron run possible here; a desktop-host browser test does not exist for
  measuring — the fake-document unit test is the oracle.

## Docs to update with the fix

- `js/platform/window-actions.js` head comment (l.11-13) and l.130-138.
- `.claude/context/platform.md:162-176` ("a card over the game window widening it").
- `.claude/domain/features/steam-desktop-host.md:84-91` and
  `shared-screen-layout.md:411-415` only if the owner wants the card rule stated.

## Rejected by owner / out of scope

- Window stays opaque. Width-vs-height frame steps (compact title bar below
  820 px height) kept for later. Never run deploy-steam.sh / SteamCMD.

## Pitfalls

- `getClientRects().length` is the "shown" test; `.hidden` = display:none.
- ResizeObserver watches only frames present at `screenChanged()`; all are in
  the DOM from start, so OK, but a frame moved/added later must be re-watched.
- Guessed, not measured: exact Beginner window width (~400 px) and pause card
  height; the "25 px" offset is from CSS padding arithmetic.
