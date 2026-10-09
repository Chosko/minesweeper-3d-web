# App shell — game flow, frame loop, menus, HUD, component kit and theming

## OVERVIEW

The glue that turns the rules engine, renderer, input and audio into a game:
screen modes, the per-frame loop, action dispatch, timer, end of game, best
times, menus/HUD/overlays, the DOM component kit the screens are built from,
design tokens and the light/dark theme, the debug hook, and the static-site
files.

- `js/main.js` — entry module. Builds `BoardRenderer`, `FlyCamera`, `Input`,
  `MouseActions`, `Controls`, `GamepadReader`, `UI`; holds the single state
  object `S`; runs the `requestAnimationFrame` loop; exposes `window.__ms`.
  Also maps controller polls to game and menu actions (`handlePad`, `padNav`).
- `js/ui.js` — DOM only, no game rules: class `UI`, settings clamping, random
  board, best times and look settings in `localStorage`. Formats the overlay
  bar and slider readouts with the kit helpers from `js/ui/components.js`.
- `index.html` — every overlay is static markup toggled by the `.hidden` class;
  importmap maps `three` to `vendor/three/three.module.min.js` (vendored
  three.js r186, no build step); a module `onerror` shows a `.fatal` card.
  Head order: classic `js/theme.js`, then `css/tokens.css`, then
  `css/components.css`, then `css/style.css`, then the module graph. The HUD
  overlay bar, the main menu (`#menu`) and the pause card (`#pause-card`) are
  kit markup (§ Component kit).
- `css/tokens.css` — the design tokens, the single source of every shared
  visual value: palette (`--color-*`), typography (`--font-*`), spacing
  (`--space-*`), radii (`--radius-*`), elevation (`--elevation-*`), motion
  (`--duration-*`, `--easing-*`) and z-layers (`--z-*`). Light values on
  `:root`, dark overrides under `:root[data-theme="dark"]`.
- `css/components.css` — the component kit: `ui-*` component classes, their
  states and the layout compositions screens are assembled from. Its head
  comment is the catalogue — each component's element, role, accessible
  name and markup pattern, the states and focus contract, the compositions
  and the screens built from them.
- `js/ui/components.js` — the kit's behaviour helpers (ES module, imports
  nothing): pure formatting/selection logic plus binders that touch only the
  elements they are handed, so it runs under Node with stub elements.
- `dev/components.html` — the kit gallery (development only, not linked from
  the game): every component in every state, the overlay bar and the results
  screen layout (`#g-results`), with a Light/Dark switch. Loads only
  `js/theme.js`, `css/tokens.css` and `css/components.css`; `?theme=dark`
  opens it in Dark.
- `css/style.css` — shell styling: positioning of the fixed layers, the
  ready/help/banner/controls/ctx-lost overlays and the HUD placement; the
  menu and pause card carry no one-off rules of their own. Declares no
  custom properties and reads only tokens from `css/tokens.css`. Layered
  fixed overlays use the `--z-*` tokens (HUD 10, help 11, banner 12, flash
  15, overlays 20, controls modal 30, ctx-lost 40, toast 45, fatal 50).
- `js/theme.js` — theme applier, a classic (non-module) script run before
  first paint: sets the root `data-theme` attribute (`light` | `dark`) and
  exposes `globalThis.msTheme`.
- `js/tokens.js` — token reader (ES module) for consumers that cannot read
  stylesheet values directly, chiefly Canvas renderers.
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
  `onReadyBack`, `onResume`, `onRestart`, `onMainMenu`, `onPause` (the
  overlay bar's pause button), `onToggleSound`,
  `onLookSettings({sensitivity, invertY})`. Methods: screens `showMenu`,
  `showReady(settings, msg)`, `showPlaying`, `showPause({state,time,minesLeft,note})`;
  HUD `setBoard`, `updateHud(time, minesLeft)` (overlay formats, DOM write
  only on change),
  `setModes`, `setCrosshair`, `showSpacing`, `setSound(muted)`; help
  `toggleHelp`, `userToggleHelp`, `dismissHint`; banner `showBanner(state,time)`,
  `setBannerRecord`, `hideBanner`; `flash`, `toast(msg, ms)`, `setPad(info|null)`,
  `setNoMouse`, `initVolume(v, onChange)`, `openControls`/`closeControls`/
  `isControlsOpen`, `refreshBests`, `isPauseVisible`, `setReadyMessage`.

`js/ui/components.js` exports
- `formatOverlayTime(seconds)` → whole seconds, three digits, stopping at
  `'999'`; `formatMineCount(minesLeft)` → clamped to -99 … 999. Display only.
- `formatSliderValue(value, {format: 'number'|'percent'|'multiplier', step, max, unit})`,
  `decimalsOf(step)`.
- `segmentedTargetIndex(disabled, current, key)` (arrows wrap, Home/End,
  disabled skipped), `segmentedState(count, selected)` (aria-checked, roving
  tab order).
- `bindSlider(root)`, `bindSegmented(group, {onChange})` (dispatches `change`
  with `{value, index}`), `initComponents(root)` — each returns an unbind.

`js/theme.js` — `globalThis.msTheme` (also `createThemeApplier({root, readStored?, onError?})`,
the factory tests drive):
- `current()` → `'light' | 'dark'`; `setTheme(theme)` — an unknown value is
  `light`, never thrown; a no-op when unchanged.
- `onChange(listener)` → unsubscribe; listeners run after the attribute
  changes, and a throwing listener does not stop the others.

`js/tokens.js` exports
- `token(name)` → the token's computed value on the document root for the
  active theme (`name` with or without the leading `--`); an unknown token
  returns `FALLBACK_COLOR` (`#ff00ff`), logging once per name only in development (hostname
  localhost, 127.0.0.1, [::1] or empty).
- `onThemeChange(listener)` → unsubscribe (delegates to `msTheme.onChange`).
- `createTokenReader({root, getStyle, theme, dev?, log?})` — the factory behind both.

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
  overlay; `padDefault` chooses its default focus (menu: the last played
  board, `[data-preset][data-last]`; pause: Resume, or Play again once the
  game ended); buttons held across a screen change go into `padSuppress`
  until released.
- UI help panel: `_helpByUser` keeps an H-opened panel open across screens;
  screen methods otherwise hide it. The controls modal body is cloned from
  `#help .controls` at construction, so edit the list in `#help` only.
- Banner goes `compact` after 4 s and is `suppressed` while the pause card shows.

Component kit (`css/components.css`, catalogue in its head comment):
- The catalogue is the contract: a screen uses a component by its class and
  markup pattern exactly as catalogued, and renaming either is a breaking
  change for every screen using it. Components: `ui-button--primary`,
  `ui-button--secondary`, `ui-menu` (items `ui-menu__item`, optional
  `ui-menu__label` + `ui-menu__detail` lines), `ui-card` / `ui-card__title`,
  `ui-panel`, `ui-toggle`, `ui-slider`, `ui-segmented`, `ui-stat`,
  `ui-field` (number entry; `data-adjusted` marks a value just corrected),
  `ui-link`, `ui-overlay-bar`. Layout compositions: `ui-screen`
  (`--wide` for the main menu), `ui-row`, `ui-grid`, `ui-heading`, `ui-text`
  (`--muted`, `--warning`), `ui-actions` (`--row`), `ui-stat-row`.
- Every interactive control is a native `<button>`, `<input>` or `<a>` with
  hover, pressed (`:active`), focused (`:focus-visible`, and
  `body.pad-nav :focus` for the controller) and disabled states; the focus
  ring is a solid `--color-focus-ring` outline that outranks the shell's
  controller ring. `data-force="hover|active|focus"` previews a state
  statically and is used only by the gallery. Only the selected segmented
  option is in the Tab order. A screen's default focus is an id named for its
  layer in `padDefault`.
- Low fidelity: no theme-specific rule and no literal colour — both themes
  follow from the tokens; no animation, shadows and transitions only from
  tokens.
- A new component goes into the catalogue comment, the gallery (every state)
  and the `COMPONENTS` table in `tests/components.test.mjs`; a new
  composition into the catalogue and `COMPOSITIONS`.
- Overlay bar (`#hud .ui-overlay-bar.hud-bar`): `ui-stat` readouts `#hud-time`
  (`formatOverlayTime`, e.g. `047`, display stops at `999` while `S.time`
  keeps counting), `#hud-mines` (`formatMineCount`, `.negative` below zero)
  and the board size, then `#hud-pause` (secondary button, `aria-label`
  "Pause game"). Its click calls `onPause` → `padPause()`; controller START
  in play clicks `#hud-pause` through `padClick`, so every input pauses
  through the same control. The bar has its own opaque raised surface, so it
  reads the same over the 3D scene as over a plain board.
- Main menu (`#menu`): a `ui-card ui-screen--wide` with the title row, one
  `ui-menu` per board family in a `ui-grid` (items carry `data-preset`;
  `UI` appends a "Best" and a "Last played" `ui-menu__detail` line and sets
  `data-last` on the last played board), the custom board as a `ui-panel` of
  `ui-field` entries with Random/Start in `ui-actions--row`, and a `ui-row`
  footer (Controls, Sound, volume `ui-slider`, credit `ui-link`). The custom
  info line toggles `ui-text--warning` / `ui-text--muted`.
- Pause card (`#pause-card`): a `ui-card ui-screen` with `ui-text` status
  lines, `#pause-actions` (`showPause` moves the primary action first —
  Resume while playing, Play again once ended — before Main menu), the
  controls list and a Settings `ui-panel` (look sensitivity and volume
  sliders, invert-Y toggle), then the Sound button. Volume sliders on both screens carry
  `data-volume` and stay hidden until `initVolume`.
- Results screen: a layout only — the gallery's `#g-results` composition
  with placeholder content (outcome title, board line, a `ui-stat-row` of
  the game's stats, a `ui-panel` of best comparisons, Play again / Main
  menu); no game screen uses it.
- Theme: `js/theme.js` runs synchronously in `<head>`, so the root
  `data-theme` attribute is set before any stylesheet paints. Its stored-theme
  getter returns nothing until the settings feature wires the stored value in,
  so start-up applies Light; the applier reads the preference and never writes
  it. Switching theme is only the attribute change — every shell colour
  follows through the `:root[data-theme="dark"]` overrides.
- Styling values: a new colour, size, radius, shadow, duration or z-index goes
  into `css/tokens.css` (with a dark value for a colour) and `css/style.css`
  or `css/components.css` reads it by `var(--…)`; `tests/tokens.test.mjs` and
  `tests/components.test.mjs` reject a custom property declared in either
  stylesheet or a read of an undeclared token.
- The 3D scene (`js/render.js`, `js/textures.js`) keeps its own palette: it
  never reads tokens and never subscribes to theme changes.
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
- [../domain/features/design-tokens-and-themes.md](../domain/features/design-tokens-and-themes.md)
  — token categories, the contrast contract, the theme preference's owner
  (the settings feature) and the applier/reader contracts.
- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the kit's component set, states, focus and controller contract, the
  overlay bar's display formats and the screens composed from the kit.
- [../domain/INDEX.md](../domain/INDEX.md) — product domain index.

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
- [testing.md](testing.md) — browser tests drive the game through `window.__ms`;
  `tests/tokens.test.mjs` and `tests/theme.test.mjs` pin the token sheet, the
  applier and the reader; `tests/components.test.mjs` pins the kit, its
  helpers, the overlay bar, the kit-built screens and their contrast.

## WHEN TO READ THE SOURCE

- Adding a screen/mode or changing a transition (pause, ready, lockless, ctxlost).
- Changing timer start/freeze, end-of-game flow, or best-time recording.
- Adding a `__ms` hook method or changing what `info()` reports.
- Debugging frames that do not redraw (or never stop redrawing): `shouldRender`.
- Adding a menu preset, settings control, HUD element or overlay (HTML + `UI.el`
  + CSS z-index layer + `PAD_LAYERS`/`padDefault` for controller navigation).
- Adding or changing a kit component or composition, or building a new
  screen from the kit: read the catalogue comment at the head of
  `css/components.css` and the matching gallery section in
  `dev/components.html`.
- Changing controller button mapping in menus or play (`padPlaying`, `padMenus`).
- Changing deploy behaviour (custom domain, 404 redirect, vendored three.js path).
- Adding or renaming a token, or wiring the stored theme preference into the
  applier (`readStoredTheme` in `js/theme.js`).
