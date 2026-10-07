# App shell — game flow, frame loop, menus and HUD

## OVERVIEW

The glue that turns the rules engine, renderer, input and audio into a game:
screen modes, the per-frame loop, action dispatch, timer, end of game, best
times, menus/HUD/overlays, the debug hook, and the static-site files.

- `js/main.js` — entry module. Builds `BoardRenderer`, `FlyCamera`, `Input`,
  `MouseActions`, `Controls`, `GamepadReader`, `UI`; holds the single state
  object `S`; runs the `requestAnimationFrame` loop; exposes `window.__ms`.
  Also maps controller polls to game and menu actions (`handlePad`, `padNav`).
- `js/ui.js` — DOM only, no game rules: class `UI`, settings clamping, random
  board, best times and look settings in `localStorage`.
- `index.html` — every overlay is static markup toggled by the `.hidden` class;
  importmap maps `three` to `vendor/three/three.module.min.js` (vendored
  three.js r186, no build step); a module `onerror` shows a `.fatal` card.
- `css/style.css` — layered fixed overlays (z-index: HUD 10, help 11, banner 12,
  flash 15, overlays 20, controls modal 30, ctx-lost 40, toast 45, fatal 50).
- `404.html` — redirects to `/` (GitHub Pages). `CNAME` = `minesweeper3d.chosko.com`;
  `.nojekyll` disables Jekyll processing so files are served as-is.

## PUBLIC API

`js/ui.js` exports (consumed by `js/main.js`)
- `DIM_MIN`/`DIM_MAX` (1/100); `clampSettings(s)` → `{X,Y,Z,mines}` integers,
  dims 1..100, mines 1..X*Y*Z. `randomSettings()` — original Random formula.
- `fmtDims(s)`, `fmtTime(t)` (2 decimals), `NO_MOUSE_MSG`.
- `getBest(s)` → seconds or null; `recordBest(s, time)` → `{ best, prev, isNew }`,
  writes `ms3d.best.<X>x<Y>x<Z>x<mines>` only when faster.
- `loadLookSettings()` → `{ sensitivity (0.25..3), invertY }`.
- `UI` constructor `(cb)` with callbacks `onStart(settings)`, `onReadyClick`,
  `onReadyBack`, `onResume`, `onRestart`, `onMainMenu`, `onToggleSound`,
  `onLookSettings({sensitivity, invertY})`. Methods: screens `showMenu`,
  `showReady(settings, msg)`, `showPlaying`, `showPause({state,time,minesLeft,note})`;
  HUD `setBoard`, `updateHud(time, minesLeft)` (DOM write only on change),
  `setModes`, `setCrosshair`, `showSpacing`, `setSound(muted)`; help
  `toggleHelp`, `userToggleHelp`, `dismissHint`; banner `showBanner(state,time)`,
  `setBannerRecord`, `hideBanner`; `flash`, `toast(msg, ms)`, `setPad(info|null)`,
  `setNoMouse`, `initVolume(v, onChange)`, `openControls`/`closeControls`/
  `isControlsOpen`, `refreshBests`, `isPauseVisible`, `setReadyMessage`.

`js/main.js` exports nothing; its surface is `window.__ms` (tests, Playwright):
- getters `state` (the live `S`), `game`, `renderer`, `camera`, `controls`,
  `pads`, `fps`, `frameStats` (`{renders, skipped}`); `THREE`, `startCameraPos`.
- `start(X, Y, Z, mines, minePositions?)` → `startGame`; `forcePlay()` enters
  lockless play; `pause()`.
- camera/aim: `moveTo`, `look(yaw, pitch)`, `aimAt(idx | [x,y,z])` → selected idx,
  `cellCenter(idx)`; each calls the synchronous `refresh()` first.
- actions: `mouseDown(b)`, `mouseUp(b)`, `click('left'|'right'|'chord')`,
  `key(code, down)`, `wheel(notches)`; picking `selected()`, `pickBrute()`,
  `pickWith(o, d, space)` → `[dda, brute]`; `info()` → mode, time, HUD text, cam, stats.

## INTERNAL PATTERNS

- `S.mode` ∈ `'menu' | 'ready' | 'playing' | 'paused' | 'ctxlost'`. Transitions:
  `showMainMenu` → menu; `startGame` → ready; pointer lock acquired
  (`onLockChange`) or `padResume` → `enterPlaying`; lock lost / Esc lockless /
  Start → `pause`. Only `playing` moves the camera, runs the timer and accepts
  actions (`hasSelection`, `Input.isActive`).
- `S.lockless`: play without pointer lock (controller, `forcePlay`). Mirrors
  `body.lockless`; when set, losing lock does not pause and Esc pauses directly.
  A UI click made with controller A sets `padGesture`, which routes resume/
  restart to lockless play because it is not a user gesture for pointer lock.
- `onAction(type)` is the only dispatcher to `Game` (wired as `MouseActions`'
  callback): calls `renderer.snapshotBeforeAction()` before left/chord, sets
  `S.started` on any left release (timer starts even if nothing happens; chords
  do not start it), plays SFX from the result objects, `sfx.noop` when `version`
  is unchanged, and on a `playing → won/lost` transition runs
  `endGame(minesBefore)` then `afterEndGame()`.
- End state freeze: `endGame` stores `S.endState = {state, time, minesLeft}`,
  with `minesLeft` taken from before the final action (original HUD froze on the
  previous frame). HUD, pause card and timer read `S.endState` once set; the
  timer advances only when `playing && started && !endState`, clamped to 1 s/frame.
- `afterEndGame` (best times) is kept separate from `endGame`; a board that is
  already won at creation (all mines) runs both once in `enterPlaying`.
- `startCameraPos(X,Y,Z)` = original `(0, 10, -8M)` shifted by minus the original
  grid centre at spacing 1.1, because the port centres the grid on the origin.
  No snapping to a cell. Spacing resets to `SPACING_START` per game; menu demo
  board (`makeDemo`, 7³/30, decorative) uses 1.25 and an orbiting camera.
- Render on demand: `shouldRender` draws when in menu, `needRender` is set,
  `renderer.sync()` reported changes, `endState` changed, `renderer.isAnimating()`
  is true, or the signature string (camera, spacing, toggles, selection,
  `game.version`, aspect, mode) changed. The `animUntil` 6 s fallback applies
  only if the renderer exposes no animation hook. Set `needRender = true` after
  any change the signature does not capture.
- Picking is cached by `S.pickKey` (camera, spacing, `version`, Space, aspect);
  ray origin is the camera position pushed to the near plane.
- `applyPixelRatio(n)` caps DPR at 1 above 50³ cells, 1.5 above 20³, else 2.
- Context loss: `webglcontextlost` sets mode `ctxlost`, exits lock, hides and
  `inert`s pause/ready/controls (menu only inert), shows `#ctx-lost`; its button
  reloads with `reloading = true` to bypass the `beforeunload` prompt, which
  otherwise guards a started, unfinished game (Ctrl+W cannot be intercepted).
- Fullscreen (`F`) also requests Keyboard Lock on WASD/QE/Space/Ctrl/Shift.
- `onKey` ignores keys whose target is inside `input, select, textarea`, so
  settings sliders do not trigger H/M/F.
- Controller menus: `PAD_LAYERS` order picks the topmost visible, non-inert
  overlay; `padDefault` chooses its default focus; buttons held across a screen
  change go into `padSuppress` until released.
- UI help panel: `_helpByUser` keeps an H-opened panel open across screens;
  screen methods otherwise hide it. The controls modal body is cloned from
  `#help .controls` at construction, so edit the list in `#help` only.
- Banner goes `compact` after 4 s and is `suppressed` while the pause card shows.
- `localStorage` keys are all `ms3d.*` (custom, hintH.done, best.*, lookSens,
  invertY, lastPreset); access is try/catch-wrapped (`lsGet`/`lsSet`).

## DOMAIN DEPENDENCIES

Gameplay fidelity to the original game is the overriding rule.

- [../../docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md):
  - "Grid & geometry" — preset list (mirrored in `index.html` `data-preset`),
    custom limits, Random formula, spacing start/clamp/wheel step.
  - "Rules" — Timer (starts on first left release over a selected cell, chords
    do not start it, 2 decimals, freezes on win/loss) and HUD contents.
  - "Controls" — start camera position, Esc/F5 replaced by the pause menu.
- [../domain/INDEX.md](../domain/INDEX.md) — product domain index (no rules file
  specific to this area).

## CROSS-REFERENCES

- [logic.md](logic.md) — `startGame` constructs `Game`/`createGameFromMinePositions`;
  `onAction` calls `leftClick`/`rightClick`/`chord`; reads `state`, `minesLeft`, `version`.
- [rendering.md](rendering.md) — main owns `BoardRenderer`: `setGame`, `setToggles`,
  `setSpacing`, `setSelected`, `sync`, `render`, `snapshotBeforeAction`, `isAnimating`.
- [input.md](input.md) — `FlyCamera`, `Input` callbacks (`onLook`, `onWheel`,
  `onKey`, `onLockChange`, `onLockError`), `MouseActions`, `Controls`,
  gamepad helpers and `pickCell`/`pickCellBrute`.
- [audio.md](audio.md) — `sfx` calls: `unlock`, `reveal`, `flag`, `chord`,
  `explode`, `win`, `noop`, `toggleMute`, `setVolume`/`getVolume`.
- [testing.md](testing.md) — browser tests drive the game through `window.__ms`.

## WHEN TO READ THE SOURCE

- Adding a screen/mode or changing a transition (pause, ready, lockless, ctxlost).
- Changing timer start/freeze, end-of-game flow, or best-time recording.
- Adding a `__ms` hook method or changing what `info()` reports.
- Debugging frames that do not redraw (or never stop redrawing): `shouldRender`.
- Adding a menu preset, settings control, HUD element or overlay (HTML + `UI.el`
  + CSS z-index layer + `PAD_LAYERS`/`padDefault` for controller navigation).
- Changing controller button mapping in menus or play (`padPlaying`, `padMenus`).
- Changing deploy behaviour (custom domain, 404 redirect, vendored three.js path).
