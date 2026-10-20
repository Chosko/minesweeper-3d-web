# App shell — game shell core: entry module, mode host, map of the parts

## OVERVIEW

The glue that turns the rules engine, renderer, input and audio into a game.
The app shell is split by topic; this file is the core and the map of the
others:

| File | Covers |
| ---- | ------ |
| this file | `js/main.js` as a whole, mode host, context loss, no-WebGL 2 path, start-up loading, storage, `__ms` |
| [app-shell-navigation.md](app-shell-navigation.md) | router and back stack, session history and the browser's Back, Back inputs, default focus, overlay focus containment, the focus walk |
| [app-shell-pause.md](app-shell-pause.md) | pause controller, confirmations, restart keys, hand-offs, leave-page guard, both modes' end delay and its skip |
| [app-shell-menu.md](app-shell-menu.md) | main menu, placeholder, last mode and last board choices, the returning player's surfaces |
| [app-shell-3d.md](app-shell-3d.md) | the 3D game's flow: adapter flow, entering play, ready card and pointer lock, board status card, session, Learn 3D, end sequence |
| [app-shell-3d-play.md](app-shell-3d-play.md) | the 3D game's play inputs and camera: actions and rumble, keyboard-only, touch and controller play, the Camera setting's Fly and Orbit, camera aids, spacing, render on demand |
| [app-shell-2d.md](app-shell-2d.md) | the Classic 2D mode's wiring: `FLOW_2D`, button swap, board area and panel, status card, controller |
| [app-shell-results.md](app-shell-results.md) | results flow and view, Watch replay and Watch best, Look at the board |
| [app-shell-replay.md](app-shell-replay.md) | the replay viewer route, replay files, the 3D replay scene and its free camera |
| [app-shell-ui.md](app-shell-ui.md) | `js/ui.js` (`UI`), each mode's counters and live figures, the Classic 2D window's and the 3D overlay's parts, aimed-cell readout, controller menus |
| [app-shell-help.md](app-shell-help.md) | help surfaces from the bindings source, help panel, active device, first-use hints |
| [app-shell-kit.md](app-shell-kit.md) | component kit, tokens, theme, board modules and their hand-off to both boards, gallery, deploy files |
| [app-shell-markup.md](app-shell-markup.md) | kit-built screens' markup in `index.html` and the ids the shell wires, `css/style.css`, pointer sizes |

`js/main.js` — entry module, exports nothing. Builds the renderer (null
without WebGL 2; `WEBGL2`), `FlyCamera`, `Input`, `MouseActions`,
`Controls`, `GamepadReader`, `UI`, `SETTINGS` ([settings.md](settings.md)),
and the shell objects: `SHELL` (router), `HISTORY`, `MODES` (mode host: `'3d'`
the 3D adapter, `'classic-2d'` the Classic 2D mode), `PAUSE`, `MENU`,
`LAST_MODE`, `LAST_CHOICE_3D` / `CHOICE_3D`, `LAST_CHOICE_2D` / `CHOICE_2D`,
`GEN_3D` (warmed as `board-choice` shows, as `mode2d.warm()` is on
`classic-2d-choice`), `RECORDS`, `REPLAYS`, `REPLAY_VIEWER`, `REPLAY_SCENE`,
`RESULTS`, `RESULTS_VIEW`, `RECORDS_PAGE`, `END_SKIP`, `FIRST_USE`, `DEVICE`.
Holds the single state object `S`, runs the `requestAnimationFrame` loop,
maps controller polls (`handlePad`, `padPlaying`, `padMenus`, `padBoard2D`,
`padStatus3D`, `padReplay`) and exposes `window.__ms`.

`js/shell/` holds the shell's DOM-free modules; `js/main.js` hands each its
screens, elements and callbacks. `mode-host.js` is here, the others in the
part that owns their topic; `navigation.js` is
[input-controller.md](input-controller.md) and `mode-3d.js` is
[mode3d-adapter.md](mode3d-adapter.md).

## PUBLIC API

`js/shell/mode-host.js` (the mode contract is its head comment)
- `MODE_METHODS` (`openBoardChoice`, `start`, `pause`, `resume`, `restart`,
  `leave`, `summary`), `MODE_EVENTS` (`started`, `finished`, `abandoned`,
  `canPause`, `failed`).
- `createModeHost()` → `register(id, (report) => mode)` (duplicate id,
  missing method or non-factory throws), `has`, `ids`, `active`, `state`
  (`{mode, started, finished, canPause}`), `on(event, listener)` →
  unsubscribe, and the contract's methods. A mode reports through
  `report.started()`, `finished(summary, replay)`, `canPause(bool)`,
  `failed(reason)`. Optional mode members: `replay(summary)` (sealed replay
  or null; without it no replays are recorded), `ending` + `finishNow()`
  (end delay; both modes have them), `failureScreen`. `finished` /
  `abandoned` listeners receive `{mode, summary, replay}`.

`window.__ms` (tests, Playwright)
- getters `state` (`S`), `game`, `renderer`, `camera`, `controls`, `pads`,
  `fps`, `frameStats` (`{renders, skipped}`), `modes`, `pauser`, `settings`,
  `records`, `replays`, `replayViewer`, `board2D`, `game2D` (the open Classic 2D
  board's engine game), `daily` (the daily boards held since the menu
  showed: `has(code)`, `take(code)`); `THREE`, `spawnPose(X, Y, Z)`.
- `watch(data)` → `SHELL.go('replay', {data})`, `data` `{replay | replayId,
  returnTo}`; `start(X, Y, Z, mines, minePositions?)` →
  `MODES.start('3d', …)`; `learn()` (the Learn 3D guided board),
  `learnBoard` (`LEARN_BOARD`), `learnPrompts` (the open guided game's
  prompt sequence, or null); `forcePlay()` (lockless play); `pause()`.
- camera/aim `moveTo`, `look(yaw, pitch)`, `aimAt(idx | [x,y,z])` → idx,
  `cellCenter(idx)` (each runs `refresh()` first); actions `mouseDown`,
  `mouseUp`, `click('left'|'right'|'chord')`, `key(code, down)` (Enter and
  ' act as their keys do), `wheel(notches)` (spacing, or the orbit's dolly); picking `selected`, `pickBrute`, `pickWith(o, d, space)`
  → `[dda, brute]`; `info()` → mode, time, HUD text, readout, cam, stats.
- `?still-backdrop` in the page's address (`STILL_BACKDROP`, read once at
  load): the menu screens' demo board stops orbiting and is drawn only when
  `needRender` or `renderer.sync()` asks, so a software-rendered browser test
  is not slowed by a backdrop redrawn every frame. Without it nothing changes.

## INTERNAL PATTERNS

- **Mode host.** The shell reaches a game only through `MODES`: board
  choice, `start`, pause/resume/restart (through `PAUSE`) and `leave`.
  Every menu screen's `show` calls `MODES.leave()`. The host reports
  `abandoned` on the mode's behalf (restart, leave or a replacing start of a
  started, unfinished game) with `summary()` and `replay(summary)` (a
  throwing `replay` reports null), ignores an inactive mode's reports, turns
  a throwing `start` into `failed`, and `MODES.on('failed')` routes to the
  mode's `failureScreen`. `activeMode()` is the hosted `mode3d` or `mode2d`.
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
- **Start-up.** `await Promise.all([settingsLoaded, recordsLoaded,
  firstUseLoaded, …])` precedes `showMainMenu`. `applySettings` wires the
  owners and one `bindSettingControls` binds every `[data-setting]` control
  ([settings.md](settings.md)), unlocking audio after a volume or mute
  change. `RECORDS` loads beside the settings and is attached to `PAUSE`;
  `REPLAYS` loads in the background. A failed settings, records or replay
  save each toasts once (the replay stays watchable this session).
- **Storage.** `js/ui.js` keeps no `localStorage` key, and nothing touches
  the legacy `ms3d.custom`, `ms3d.best.*`, `ms3d.lastPreset` and
  `ms3d.hintH.done` keys. The shell's state lives in platform-storage
  documents ([platform.md](platform.md)): `shell.lastMode`,
  `shell.firstUse`, `mode3d.lastChoice`, `settings`.

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule
([../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md): "Grid &
geometry", "Rules" — timer freeze and HUD, "Controls" — start pose, Esc/F5
replaced by the pause menu).

- [../domain/features/game-shell.md](../domain/features/game-shell.md) — the
  mode contract; each part file names its other features.

## CROSS-REFERENCES

- [mode3d.md](mode3d.md), [classic2d.md](classic2d.md) — the two modes.
- [input.md](input.md) — `Input` callbacks, `MouseActions`;
  [input-camera.md](input-camera.md) — picking;
  [input-controller.md](input-controller.md) — `Controls`, gamepad, the
  shell navigation layer.
- [platform.md](platform.md), [settings.md](settings.md),
  [records.md](records.md), [replay.md](replay.md),
  [rendering.md](rendering.md), [audio.md](audio.md).
- [testing.md](testing.md) — browser tests drive the game through `__ms`;
  `tests/shell-*.test.mjs` pin the mode host and 3D adapter among the
  shell's modules.

## WHEN TO READ THE SOURCE

- Adding a mode: the contract in the head comment of
  `js/shell/mode-host.js`, register it on `MODES`, then
  `js/shell/mode-3d.js` as the worked example.
- Adding a `__ms` hook method or changing what `info()` reports.
- Adding a setting: [settings.md](settings.md) first, then the
  `// ---------- settings ----------` block of `js/main.js`.
