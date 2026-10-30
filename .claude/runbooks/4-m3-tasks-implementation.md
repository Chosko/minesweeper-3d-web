# Runbook: m3-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 17) · Model: opus
Last step number: 43

## [x] 32. Implement task 115 — Three cube 3D presets and no no-guess on a side of 2

Depends on: none

Context: none

```prompt
/task-implement 115 --review
```

Done: 2026-10-11, commit `b6a5977` (14 files, +211/-156). A remembered double-layer choice falls back to cube Beginner via `normaliseChoice`, dropping its saved custom fields; the 3D board choice is now a single Cube menu (no second column).

## [x] 33. Implement task 116 — Update documentation for feature `3d-play-flow`

Depends on: 32

Context:
- 2026-10-11 (from step 32): `noGuessReason(choice)` now takes the choice (side-of-2 line on a custom board with a side of 2, else the cell-limit line); the 3D board choice is a single Cube menu (the `ui-grid` second column is gone); the double-layer replay fixture is kept as a custom 8×8×2 board. `mode3d.md`, `records.md` and `README.md` still describe six presets.

```prompt
/task-implement 116 --review
```

Done: 2026-10-11, commit `222b091` (7 files, +84/-66).

## [x] 34. Implement task 117 — Movement playback holds each sample, then interpolates

Depends on: none

Context: none

```prompt
/task-implement 117 --review
```

Done: 2026-10-11, commit `3788ef0` (7 files, +143/-40). The interval comes from a fixed per-format-version table, `sampleIntervalMs(version, mode)` in `js/replay/format.js`, so a later sampler change never alters old replays; a new format version needs its own row.

## [x] 35. Implement task 118 — Update documentation for feature `replay-playback`

Depends on: 34

Context:
- 2026-10-11 (from step 34): a decoded replay carries `sampleIntervalMs` (from `sampleIntervalMs(version, mode)` in `js/replay/format.js`, a per-format-version table: v1 2D 50 ms, 3D 100 ms; not stored in the blob); `movementTrack` and `cameraTrack` take the interval (fallback `SAMPLE_INTERVAL_MS`); `.claude/context/replay.md` does not yet describe either or the hold-then-interpolate rule.

```prompt
/task-implement 118 --review
```

Done: 2026-10-11, commit `4132d08` (4 files, +85/-53).

## [x] 1. Implement task 84 — Electron main process: window, game protocol, window state and crash log

Depends on: none

Context:
- 2026-10-23 (amend): task 84 was re-planned for the frameless, transparent desktop window: windowed by default, dragged by the game's title bar, sized by the page's content, with Fullscreen / Windowed and Minimise; it no longer remembers the window size. Exact looks: canvas https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC, J-Components *Window title bar*, J-C2D-xl.

```prompt
/task-implement 84 --review
```

Done: 2026-10-25, commit `35561e8` (9 files, +841/-1). Fullscreen state is tracked from enter/leave events, because `isFullScreen()` always answers false for a transparent window on Windows; Electron is pinned at `44.9.3` with no lockfile.

## [x] 2. Implement task 85 — Steamworks capability adapter, unavailable implementation and the page bridge

Depends on: 1

Context:
- 2026-10-23 (amend): task 85 was re-planned: the bridge gains the window actions (minimise, toggle fullscreen, set content size) and a fullscreen event.

```prompt
/task-implement 85 --review --rounds 2
```

Done: 2026-10-25, commit `75b1764` (8 files, +955/-6). The page's global is `window.ms3dHost` (requests as `<group>.<request>`, events as subscribe functions under `ms3dHost.events`); a failed request rejects with a plain `{ code, message }` object, not an Error, because `contextBridge` drops custom Error properties.

## [x] 3. Implement task 86 — Page platform selection, capability flags, overlay pause and the quit flush

Depends on: 2

Context:
- 2026-10-23 (amend): task 86 was re-planned to drive the desktop window from the page (title bar drag region, Minimise, Fullscreen / Windowed, content size) and now waits on task 282, the m2b-themes title bar, which this runbook does not run.
- 2026-10-25 (from step 1): the host calls `setMovable(false)` while fullscreen, unverified until the page marks its drag region; the window opens at a default content size of 1280×800 until the page reports its size; the page still draws its web backdrop around the desktop window until it knows it is on desktop.
- 2026-10-25 (from step 2): the bridge is `window.ms3dHost` — `window.minimise/toggleFullscreen/setContentSize`, `quit.handshake/request`, events `steamStateChanged`, `overlayActivated`, `flushRequested`, `fullscreenChanged` (each a subscribe function returning its unsubscribe); failures reject with `{ code, message }`. Until the page answers `flushRequested`, closing the desktop window waits out the full `FLUSH_TIMEOUT_MS`.

```prompt
/task-implement 86 --review --rounds 2
```

Done: 2026-10-25, commit `f7c592c` (11 files, +730/-46). Task 86 is left `[PARTIAL]`: by the user's choice the page does not report its content size (the window stays at 1280×800; the sender is built and tested but uncalled), because the page's layout follows the window's size and the two would feed back — the desktop layout and content size go to a follow-up. The capability flags ignore logged-on state, contrary to the feature document: logged-on state is kept beside them, so going offline switches no feature off.

## [x] 36. Implement task 289 — Size steps from the available area

Depends on: 3

Context: none

```prompt
/task-implement 289 --review --rounds 2
```

Done: 2026-10-27, commit `a7af289` (19 files, +505/-103). The premise that a desktop work area is never phone-sized was wrong, because media queries measure the window. By the user's choice the web keeps its phone layout on window-size media queries, and the desktop host never gets it: `bindAreaMedia` in `js/platform/window-actions.js` evaluates every window-size `@media` rule against the work area. The other size steps are container queries on the root area, which is the work area when windowed and the whole screen in fullscreen. The 3D canvas still uses the window's size.

## [x] 37. Implement task 290 — Natural screen sizes

Depends on: 36

Context:
- 2026-10-27 (from step 36): size steps other than the phone layout are container queries on the root element's area (work area when windowed, whole screen in fullscreen); phone rules stay on window-size media queries, which `bindAreaMedia` (`js/platform/window-actions.js`) gates against the work area at the desktop host so the desktop never gets the phone layout.

```prompt
/task-implement 290 --review --rounds 2
```

Done: 2026-10-27, commit `9968800` (9 files, +173/-43). Every screen but the main menu already had its artboard's size; the menu now has a fixed natural size, and Records and Settings centre on the backdrop. The desktop step uses the J-*-xl artboards, the compact step J-*-l, and windows of 1199 px and below keep J-*-m. The frame steps on width only, while the theme's compact title bar also switches at 820 px of height, so a wide short area pairs the compact title bar with the desktop frame — left as is.

## [x] 38. Implement task 291 — Game windows against the available area

Depends on: 36

Context:
- 2026-10-27 (from step 36): the root area (work area when windowed, whole screen in fullscreen) drives the size steps through container queries on the root element; the 3D canvas still sizes from the window (`js/render.js`), and the desktop host never gets the phone layout (`bindAreaMedia`, `js/platform/window-actions.js`).

```prompt
/task-implement 291 --review
```

Done: 2026-10-27, commit `18795db` (9 files, +162/-14). The premise that `ui.sizeBoard2D` measured the desktop window was wrong: task 289's root sizing with `contain: layout` already made the game windows measure the work area, so the code changes are comments only. The commit adds browser tests that pin this behaviour, and `in-game-layout.md` now says 3D play's natural size is the whole available area. A browser test in `tests/tile-skin.test.mjs` ("Expert at 1024 px wide keeps the fit rule …", the triangle "1" glyph ink) was already failing on HEAD before this step.

## [x] 39. Implement task 292 — Update documentation for feature `shared-screen-layout`

Depends on: 36, 37

Context:
- 2026-10-27 (from step 36): `platform.md` and `app-shell-kit-layout.md` do not yet describe the root-area behaviour (container queries on the root element, `bindAreaMedia` gating the phone media queries at the desktop host); the touch-step decision in task 289 and the Size steps bullet of `shared-screen-layout.md` were reworded to say the desktop host never gets the phone layout, and `theme-system.md` gained the rule for writing a step-dependent value.
- 2026-10-27 (from step 37): the main menu has a fixed natural size per step, and Records and Settings centre on the backdrop like the replay viewer; the desktop step uses the J-*-xl artboards, the compact step J-*-l, and windows of 1199 px and below keep J-*-m. The frame steps on width only (1439 px, 1199 px), while the theme's compact title bar also switches at 820 px of height.

```prompt
/task-implement 292 --review
```

Done: 2026-10-27, commit `5954e8f` (11 files, +115/-54).

## [x] 40. Implement task 293 — Update documentation for feature `in-game-layout`

Depends on: 38

Context:
- 2026-10-27 (from step 38): task 291 made no behaviour change: the game windows already measured the work area through the root element's `contain: layout` (task 289). `in-game-layout.md` § Architecture, `app-shell-2d.md` and `testing.md` were already updated in that commit; the 3D canvas still sizes from the window (`js/render.js`).

```prompt
/task-implement 293 --review
```

Done: 2026-10-27, commit `66c3bbf` (6 files, +33/-18).

## [x] 41. Finish task 86 — Desktop window sized to the screen's natural frame

Depends on: 3, 36, 37, 38

Needs: agent+human

Context:
- 2026-10-27 (from step 36): until this step resizes the desktop window to its frame, screens are laid out and centred in the work area and look off-centre in the default 1280×800 window — expected, not a defect. The desktop host never gets the phone layout (`bindAreaMedia`, `js/platform/window-actions.js`), so a narrow frame no longer changes layout shape.
- 2026-10-27 (from step 37): every screen now has a fixed natural size from its artboard (desktop step J-*-xl, compact step J-*-l, 1199 px and below J-*-m); the frame steps on width only, at 1439 px and 1199 px.
- 2026-10-27 (from step 38): nothing calls `reportSize` yet, so this step is what makes the window take the whole work area during 3D play, as `in-game-layout.md` now says.
- 2026-10-27 (from step 40): `in-game-layout.md` § Architecture says the desktop window takes the whole work area during 3D play, but no code does it yet: `desktop/window.js` creates the window with `maximizable: false`, nothing resizes it for 3D play, and `js/render.js` sizes the canvas from `window.innerWidth`/`innerHeight`. The context files make no such claim.

```prompt
/task-implement 86 --review --rounds 2
```

Done: 2026-10-27, commit `be4fb9c` (14 files, +356/-59). Windowed, the root is shifted by `--window-x`/`--window-y` (state attribute `data-window-state`, since `data-window` on `<html>` made every fullscreen click leave fullscreen) and the frame box is reported through `setContentSize`; the host caps the window at its display's work area. No Electron was available, so the desktop-run checks are unverified; a toast can fall outside the frame-sized window.

## [x] 4. Implement task 87 — Windows packaging and the SteamPipe private build

Depends on: 1

Needs: agent+human

Context:
- 2026-10-25 (from step 1): `desktop/node_modules` is not git-ignored yet (only the root `node_modules` is) — task 87 should add it to `.gitignore`; Electron is pinned at `44.9.3` with no lockfile; the game protocol reads the game files from `resources/game` in the packaged build, so packaging must place `index.html`, `css`, `js`, `themes`, `assets` and `vendor` there.
- 2026-10-27 (from step 41): task 86's desktop-run checks were never made, because no Electron was installed: the window following the menu, the board choice panel opening, a game and 3D play with no shrinking step down, the overlay pausing a game, a click in fullscreen not leaving fullscreen, and drag regions working with the shifted root. The first packaged run is the place to check them.

```prompt
/task-implement 87 --review
```

Done: 2026-10-27, commit `6a41a20` (8 files, +563/-2). Electron 44.9.3 has no postinstall, so `npm run package` fetches the binary through Electron's `install.js`. Steamworks needed setup the task did not foresee: no private branch can exist until `default` has a build, and SteamPipe refused `SetLive "default"` from a script, so a one-file placeholder (BuildID 26249414, no game content) is live on `default` by hand. The game build (26249108) is live on the password-protected branch `internal`, and a Windows launch option `Minesweeper3D.exe` was added and published. The installed run reached the menu and played offline. The window's X button did not quit (Alt+F4 did), and Shift+Tab showed no overlay.

## [x] 5. Implement task 88 — Steamworks binding spike

Depends on: 2, 4

Needs: agent+human

Context:
- 2026-10-23 (amend): task 88 was re-planned: the overlay check now covers the frameless, transparent window, windowed and fullscreen.
- 2026-10-25 (from step 3): not yet checked in a real desktop run — the overlay (Shift+Tab) pausing a started game, the title bar drag region, and `setMovable(false)` while fullscreen.
- 2026-10-27 (from step 4): the first installed run from Steam (branch `internal`, build 26249108) showed no overlay on Shift+Tab, with no binding or `steam_api64.dll` yet; dragging by the title bar and clicks in fullscreen worked. The API library's slot is `desktop/redist/steam_api64.dll`, copied beside the exe, and the binding's slot is the host's runtime `dependencies` under `resources/app/node_modules`. Upload with `npm run package`, then `npm run steampipe`, which sets the build live on `internal` from the git-ignored `desktop/steampipe/config.json`, then the user runs SteamCMD: the agent's permission check refuses to run it as a production deploy. The user runs SteamCMD from `C:\steamworks_sdk_165\sdk\tools\ContentBuilder\builder\` with cached login `choskoxteam`.

```prompt
/task-implement 88 --review
```

Done: 2026-10-28, commit `321c54a` (6 files, +41/-20). The binding is steamworks-ffi-node 0.11.3, which covered every capability in two rounds of user runs from Steam. steamworks.js 0.4.0 has no leaderboard, shared-file or overlay-event calls. The overlay draws over the transparent window only with `in-process-gpu`, `disable-direct-composition` and `ui-disable-partial-swap`. While it is open, the page behind turns semi-transparent. An opaque window avoids that but loses the transparent corners, and its fullscreen sometimes keeps the windowed bounds. The choice between the two is left to `/architect amend feature=steam-desktop-host`. Two premises were wrong: an improved score upload clears the entry's attachment, and replacing a shared file under the same name is safe, because each share gets a new handle.

## [x] 6. Implement task 89 — Steam adapter implementation on the chosen binding

Depends on: 2, 3, 5

Needs: agent+human

Context:
- 2026-10-25 (from step 2): the bridge carries Steam ids, leaderboard handles and shared-file handles as decimal strings.
- 2026-10-25 (from step 3): task 86 is `[PARTIAL]` (content size deferred). The page's capability flags change only when Steam's state reports a different adapter or capability; logged-on state is kept beside them, and Steam calls reject with `offline` for callers to queue or degrade.
- 2026-10-28 (from step 5): the binding is steamworks-ffi-node, pinned at 0.11.3 in `desktop/package.json`; the spike code was deleted. The overlay switches `in-process-gpu`, `disable-direct-composition` and `ui-disable-partial-swap` go in `desktop/main.js`. The shared-file share/download calls and the overlay activation callback must be declared on the binding's own library handle. The binding decodes a downloaded entry's details wrongly, so the adapter reads the details array itself. The binding looks for the Steam API library under a `steamworks_sdk/redistributable_bin` layout or a path you set, and its init writes `steam_appid.txt` to the working directory. `buildWindows` copies only top-level runtime dependencies, so `koffi` and `@koromix/koffi-win32-x64` would be missing from the package. `desktop/node_modules` was installed with `--ignore-scripts`, because a plain install was refused by the permission check. There is no lock file. The window choice (transparent or opaque) is open, pending `/architect amend feature=steam-desktop-host`.

```prompt
/task-implement 89 --review --rounds 2
```

Done: 2026-10-28, commit `93cd785` (8 files, +1013/-27). Checked on the real Steam client in two rounds: the overlay opens every time, going offline and back works, and a direct launch with Steam closed makes Steam start and relaunch the game. The host keeps the page repainting while Steam runs, because Steam draws its overlay only when the game draws a frame and a paused game draws none; the feature document does not describe this yet. `npm run package` writes the app id into the build as `resources/app/steam-app.json` from the git-ignored Steam config, and `npm run steampipe` refuses a build whose app id is missing or mismatched. The premise that the binding writes `steam_appid.txt` was wrong: 0.11.3 only sets `SteamAppId`. The title bar's Quit and the in-game quit are unwired (task 107); taskbar close and Alt+F4 exit cleanly. The window stays transparent; the user prefers an opaque one, pending `/architect amend feature=steam-desktop-host`.

## [~] 42. Implement task 294 — Frame size steps follow the root area's height as well as its width

Depends on: 41

Context: none

```prompt
/task-implement 294 --review
```

## [~] 43. Implement task 295 — Desktop window size after a theme switch and the failed-board card over the pause card

Depends on: 41

Context: none

```prompt
/task-implement 295 --review
```

## [x] 7. Implement task 90 — Update documentation for feature `steam-desktop-host`

Depends on: 1, 2, 3, 4, 5, 6

Context:
- 2026-10-25 (from step 1): `.claude/context/` has no entry yet for `desktop/` or the `desktop-` tests.
- 2026-10-25 (from step 3): task 86 is `[PARTIAL]` — content size is not reported (desktop layout deferred to a follow-up); the capability flags ignore logged-on state, contrary to the feature document's wording.
- 2026-10-26 (amend): task 86 was re-planned for natural screen sizes and is finished by step 41 (inserted after step 3); this step also waits on step 41.
- 2026-10-28 (from step 5): the binding's capability table, by candidate, exists only in step 5's report, because the spike code is deleted. steamworks-ffi-node has all of them. steamworks.js 0.4.0 has only identity (its own id and name) and achievements.
- 2026-10-28 (from step 6): the host keeps the page repainting while Steam runs, because Steam draws its overlay and reacts to Shift+Tab only when the game draws a frame; the feature document does not describe this. The app id ships in the build as `resources/app/steam-app.json`, written by `npm run package` from the git-ignored Steam config; a development run reads `desktop/steam_appid.txt`, written by `npm run appid`. The Steam API library sits beside the executable when packaged and at `desktop/redist/steam_api64.dll` (git-ignored) in development. The adapter is tested against a stand-in for the binding; its layer over the real binding is covered only by the Steam client check. The window is still transparent; the user prefers an opaque one, pending `/architect amend feature=steam-desktop-host`.
- 2026-10-30 (amend): the `/architect amend feature=steam-desktop-host` the notes above wait on has landed (`9932480`), and the desktop window is opaque in code (`545f873`). The feature document describes a frameless, opaque window, records the three overlay switches with the options ruled out, and states the rule that the host keeps repainting while Steam runs. Document from the amended feature document; the notes above that call the window transparent or the repainting rule undocumented are out of date.
- 2026-10-30 (amend): a popup over a flat game (the pause card, the results, the context-lost card) is the desktop window alone while it shows, and the board status card stays inside the game window (`f394166`); the feature document's § The desktop window states it, and `platform.md`, `app-shell-ui.md`, `app-shell-markup.md` and `app-shell-stylesheet.md` already describe it.
- 2026-10-30 (amend): windowed, the frame that fills the desktop window takes Windows' 8 px corners and its drop edge is measured into the window (`98b84be`); the feature document's § The desktop window states it, and `platform.md` and `app-shell-kit-layout.md` already describe it.

```prompt
/task-implement 90 --review
```

Done: 2026-10-31, commit `9a18812` (7 files, +275/-10). `.claude/context/INDEX.md`'s Last updated date was left unchanged on purpose, so `/context-update` still covers earlier undescribed commits.

## [~] 8. Implement task 91 — Main-process file service and the bridge's storage and blob operations

Depends on: 2

Context:
- 2026-10-25 (from step 2): the bridge's `storage.read/write/setAside` and `blobs.put/get/delete/list` requests are empty slots that reject with `unavailable`; task 91 fills them with `bridge.register(...)`. The request and event lists live only in the main process — the sandboxed preload fetches them over one synchronous IPC call.

```prompt
/task-implement 91 --review --rounds 2
```

## [ ] 9. Implement task 92 — Steam document storage, Steam blob store and the quit flush

Depends on: 3, 8

Context:
- 2026-10-25 (from step 3): task 86 is `[PARTIAL]` (content size deferred, nothing this step needs). The page already answers `flushRequested` once the records and replay saves finish; `desktop/closing.js` holds the host's bounded wait.

```prompt
/task-implement 92 --review
```

## [ ] 10. Implement task 93 — Steam Auto-Cloud configuration and quota

Depends on: 4, 9

Needs: agent+human

Context:
- 2026-10-27 (from step 4): Steamworks settings changes reach the client only after Publish, which the user does by hand after reading the pending-changes list; the user asked that nothing else in Steamworks be touched and nothing made public. The game build lives on the password-protected branch `internal`, and `default` holds only a placeholder build.
- 2026-10-28 (from step 5): the user set a Steam Cloud byte quota and file count for the spike's shared-file checks. The values were not recorded, so check them against this task's quota.
- 2026-10-31 (amend): task 93 was re-planned around the Steam Cloud quota the owner set in Steamworks — 100 MB and 1000 files per user, recorded in `steam-cloud-saves.md`. This step runs the reconciled body: it measures whether the replay library fits that quota, configures the Auto-Cloud root and pattern and runs the two-machine sync check; it neither derives a quota nor has the owner enter one.

```prompt
/task-implement 93 --review
```

## [ ] 11. Implement task 94 — Update documentation for feature `steam-cloud-saves`

Depends on: 8, 9, 10

Context: none

```prompt
/task-implement 94 --review
```

## [ ] 12. Implement task 95 — Leaderboard catalogue, eligibility and score details

Depends on: none

Context:
- 2026-10-11 (amend): task 95 was re-planned for the three 3D cube presets (12 catalogue boards, not 18) and waits on task 115, which step 32 runs.

```prompt
/task-implement 95 --review
```

## [ ] 13. Implement task 96 — Leaderboard outbox, verifier gate and submission state

Depends on: 12

Context: none

```prompt
/task-implement 96 --review --rounds 2
```

## [ ] 14. Implement task 97 — Steam submitter, best cache, reader and replay fetcher

Depends on: 6, 9, 13

Needs: agent+human

Context:
- 2026-10-11 (amend): task 97 was re-planned for 12 leaderboards, not 18, after the double-layer 3D presets were dropped.
- 2026-10-28 (from step 5): an improved score upload clears the entry's attachment, so the attach must follow every improved upload. Replacing a shared file under the same name is safe, because each share gets a new handle and the old handle keeps returning the old file. The binding decodes downloaded details wrongly, so they are read from the raw array. The spike left a test leaderboard `SPIKE_PROBE` in Steamworks.

```prompt
/task-implement 97 --review --rounds 2
```

## [ ] 15. Implement task 98 — Local leaderboards stand-in for the web build

Depends on: 3, 12

Context:
- 2026-10-25 (from step 3): the page's leaderboards slot is null on the web build until this step fills it; task 86 is `[PARTIAL]` (content size deferred, nothing this step needs).

```prompt
/task-implement 98 --review
```

## [ ] 16. Implement task 99 — Update documentation for feature `steam-leaderboards`

Depends on: 12, 13, 14, 15

Context: none

```prompt
/task-implement 99 --review
```

## [ ] 17. Implement task 100 — Achievement catalogue and evaluator

Depends on: none

Context:
- 2026-10-11 (amend): task 100 was re-planned for 14 achievements (a win on each of the three 3D cube presets) and waits on task 115, which step 32 runs.

```prompt
/task-implement 100 --review
```

## [ ] 18. Implement task 101 — Achievement unlocker, catch-up and the end-of-game hook

Depends on: 3, 17

Context:
- 2026-10-25 (from step 3): the page's achievements slot is null until its own feature fills it; task 86 is `[PARTIAL]` (content size deferred, nothing this step needs).

```prompt
/task-implement 101 --review
```

## [ ] 19. Implement task 102 — Steamworks achievement definitions, threshold calibration and overlay check

Depends on: 4, 6, 18

Needs: agent+human

Context:
- 2026-10-28 (from step 5): the user added a test achievement with API name `SPIKE_PROBE` in Steamworks for the spike, and it unlocked on the user's account. It is not part of the catalogue. The overlay showed only with the switches step 6 adds to `desktop/main.js`.

```prompt
/task-implement 102 --review
```

## [ ] 20. Implement task 103 — Update documentation for feature `steam-achievements`

Depends on: 17, 18, 19

Context: none

```prompt
/task-implement 103 --review
```

## [ ] 21. Implement task 104 — Leaderboard screen: board picker, scope tabs, entries and states

Depends on: 14, 15

Needs: agent+human

Context:
- 2026-10-11 (amend): task 104 was re-planned so the 3D board picker lists the three cube presets only.
- 2026-10-13 (amend): task 104 was re-planned into the shared layout's screen frame: it now waits on task 163 (themes-tasks-implementation step 7) and is claude+human — the owner supplies the leaderboard screen's *Joyful tiles* artboard before any markup is written.
- Task 104 also builds the rankings (scope tabs, own standing, entry list, states) as one part for a given board, which the Records Leaderboards tab of task 107 (step 24) shows in place.

```prompt
/task-implement 104 --review
```

## [ ] 22. Implement task 105 — Watch replay from a leaderboard entry

Depends on: 21

Context: none

```prompt
/task-implement 105 --review
```

## [ ] 23. Implement task 106 — Update documentation for feature `leaderboard-screen`

Depends on: 21, 22

Context: none

```prompt
/task-implement 106 --review
```

## [ ] 24. Implement task 107 — Leaderboards tab in Records and Quit in the main menu

Depends on: 3, 21, 22

Context:
- Leaderboards is the Records screen's fourth tab, not a main-menu entry: it shows the rankings part of task 104 for the board Records shows, in place, inside Records; Quit is the main menu's final entry. Task 107 waits on tasks 165 and 170 (themes-tasks-implementation steps 53 and 59).
- 2026-10-23 (amend): task 107 was re-planned: Quit is the title bar's button on every desktop window, not a main menu entry — it asks the leave-game confirmation only while a game is in progress and does nothing on the web; the task is now titled "Leaderboards tab in Records and Quit in the title bar" and waits on task 282 (m2b-themes title bar), which this runbook does not run.
- 2026-10-28 (from step 6): on the installed Steam build neither the title bar's Quit nor the in-game quit does anything yet; taskbar close and Alt+F4 run the host's closing sequence (page flush, Steam shutdown, exit) and exit cleanly, so only the triggering buttons are missing.

```prompt
/task-implement 107 --review
```

## [ ] 25. Implement task 108 — Update documentation for feature `leaderboards-menu-entry`

Depends on: 24

Context: none

```prompt
/task-implement 108 --review
```

## [ ] 26. Implement task 109 — Steam rank panel on the results screen

Depends on: 3, 14, 21

Needs: agent+human

Context:
- 2026-10-09 (amend): task 109 also builds the results screen's *Leaderboard* action and now waits on task 104, the leaderboard screen (step 21).
- Task 109 builds into the framed results screen and waits on task 169 (themes-tasks-implementation step 58); the owner supplies an artboard drawing the rank panel and the *Leaderboard* action.

```prompt
/task-implement 109 --review
```

## [ ] 27. Implement task 110 — Update documentation for feature `results-steam-rank`

Depends on: 26

Context: none

```prompt
/task-implement 110 --review
```

## [ ] 28. Implement task 111 — Action catalogue, bindings resolver and the bindings setting

Depends on: none

Context:
- Task 111 also switches the shared layout's key hints and the in-game controls reminder to the resolver, and waits on tasks 163, 176 and 177 (themes-tasks-implementation steps 7, 68 and 69).

```prompt
/task-implement 111 --review --rounds 2
```

## [ ] 29. Implement task 112 — Classic 2D and 3D input read their actions through the bindings

Depends on: 28

Context: none

```prompt
/task-implement 112 --review --rounds 2
```

## [ ] 30. Implement task 113 — Rebinding controls on the Settings page

Depends on: 28, 29

Needs: agent+human

Context:
- Task 113 builds into the framed Settings page and waits on task 171 (themes-tasks-implementation step 60); the owner supplies an artboard drawing the rebinding panels.

```prompt
/task-implement 113 --review
```

## [ ] 31. Implement task 114 — Update documentation for feature `input-rebinding`

Depends on: 28, 29, 30

Context: none

```prompt
/task-implement 114 --review
```
