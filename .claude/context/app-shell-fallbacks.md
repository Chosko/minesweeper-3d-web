# App shell — context loss and the no-WebGL 2 path

## OVERVIEW

Part of the app shell ([app-shell.md](app-shell.md) is the core and map).
Covers what `js/main.js` does when WebGL fails: the WebGL context lost
during a session, and a browser with no WebGL 2 at all.

## PUBLIC API

None: wiring in `js/main.js`. `WEBGL2` (false without WebGL 2) is the flag
the 3D-only paths read; `createRenderer()` returns null then.

## INTERNAL PATTERNS

- **Context loss.** `webglcontextlost` sets `contextLost`; in a 3D game the
  adapter reports `failed` → `ctxlost`, otherwise the shell routes there; a
  later 3D `start` fails at once. `ctxlost` exits lock, hides the other
  overlays (the menu stays shown), holds them all inert (`holdInert`,
  [app-shell-navigation.md](app-shell-navigation.md)) and shows `#ctx-lost`
  (`#ctx-lost-btn` reloads, `#ctx-lost-menu` goes to the menu, released).
- **No WebGL 2.** `createRenderer()` returns null (three.js's expected
  console report held back through `THREE.setConsoleFunction`), and `WEBGL2`
  false is the one flag every 3D-only path reads: `body.no-webgl2` hides
  `#scene`; no menu demo; the 3D menu entry is disabled with its reason;
  `MODES.start('3d', …)`, the 3D board choice and Play again on a 3D result
  do nothing; `__ms.start` throws; the replay viewer gets no box viewer; the
  frame loop polls the pad and ticks the 2D board and replay viewer, then
  skips every renderer step; resize, pixel ratio, backdrop and scene
  palette do nothing.

## DOMAIN DEPENDENCIES

- [../domain/features/game-shell.md](../domain/features/game-shell.md) —
  the mode contract the failing 3D mode reports through.

## CROSS-REFERENCES

- [app-shell.md](app-shell.md) — the mode host whose `failed` routes to
  `ctxlost`, and `__ms`.
- [app-shell-navigation.md](app-shell-navigation.md) — `holdInert`.
- [app-shell-markup-game.md](app-shell-markup-game.md) — `#ctx-lost`'s
  markup.
- [rendering.md](rendering.md) — the renderer `createRenderer()` builds.

## WHEN TO READ THE SOURCE

- Adding a 3D-only path: make it read `WEBGL2` in `js/main.js`.
