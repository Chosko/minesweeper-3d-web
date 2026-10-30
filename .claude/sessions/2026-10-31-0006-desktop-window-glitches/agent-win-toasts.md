# Area handoff: win-toasts (desktop window, the toast in the frame-sized window)

Done: committed 90fd6a8 "Show the windowed desktop toast at the bottom of the window" (not pushed).

## The change
- `css/style.css`, own rule block right after the windowed `#scene` rule:
  `:root[data-host="desktop"][data-window-state="windowed"] .toast { left: calc(var(--window-x, 0px) + 50vw);
  bottom: calc(100cqh - var(--window-y, 0px) - 100vh + 28px); max-width: min(640px, calc(100vw - 32px)); }`
  Viewport units are the window's own size windowed; the root area is the work area shifted by -window-x/-y.
- Base `.toast` rule unchanged (web, fullscreen). 3D play: `#hud:not(.hidden):not(.hud--2d) ~ #toast`
  (top 58%, bottom auto) outranks it; shift is 0 and window = area there, so left/max-width are equivalent.
- `tests/components.test.mjs` viewport-unit check admits the windowed toast selector before `#scene`
  (order = file order); its title says so.
- New browser test `tests/components-game-area.test.mjs` "on the desktop host windowed, the toast shows at
  the bottom of the window…": records `setContentSize`, sets the viewport to it, shows RESTART_NOTICE, asserts
  inside the window, bottom = innerHeight - 28 (+-1), centred, width <= min(640, w - 32). Failed before the fix
  (toast bottom 968 in a 952-high window), passes after.
- Docs: components.css catalogue Toast entry; context platform.md § The windowed window,
  app-shell-stylesheet.md (style.css row), app-shell-kit-layout.md § The root area (viewport-unit sentence),
  testing.md components row.
- Spec: `.claude/specs/2026-10-30-windowed-toast-on-the-window.md` (deleted only by /pipeline-revise --catch-up).

## Tests
run-full-tests.sh: fast 2643/2643, browser 23/23 and 9/9, all pass.

## Open
- Domain `shared-screen-layout.md` "toasts, centred at the bottom of the page": settled, not edited
  (catch-up follow-up: `/pipeline-revise --catch-up .claude/specs/2026-10-30-windowed-toast-on-the-window.md`).
- Not checked: the fatal card (`.fatal`, fixed inset 0) likely has the same root-vs-window placement windowed.
- Not observed in Electron (no agent launch).

## Owner verification (desktop build, windowed)
1. Main menu, switch on a controller and press a button: "Controller connected" 28 px above the window's bottom.
2. Classic 2D Beginner, click a cell, press R: the long restart notice, wrapped inside the window.
3. Finish a game, results Copy: "Board code copied". 4. Daily Classic 2D, first click off the marked cell.
5. Repeat 1 in fullscreen and in 3D play (below the crosshair): unchanged.

## Off limits (kept)
`js/platform/window-actions.js`, `desktop/window.js`, `.ui-frame`/`.ui-card`/`#results-frame` rules,
`tests/platform-selection.test.mjs`. Never deploy-steam.sh / SteamCMD.
