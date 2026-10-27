# Tasks

Last task number: 293

---

## 84. Electron main process: window, game protocol, window state and crash log

Status: [DONE]
Target: claude
Files: desktop/package.json, desktop/main.js, desktop/protocol.js, desktop/window.js, desktop/window-state.js, desktop/crash-log.js, desktop/closing.js, tests/desktop-main.test.mjs
Preconditions: none
Feature: steam-desktop-host

---

## 85. Steamworks capability adapter, unavailable implementation and the page bridge

Status: [DONE]
Target: claude
Files: desktop/adapter/interface.js, desktop/adapter/unavailable.js, desktop/preload.js, desktop/bridge.js, desktop/main.js, desktop/closing.js, tests/desktop-bridge.test.mjs
Preconditions: 84
Feature: steam-desktop-host

---

## 86. Page platform selection, capability flags, overlay pause and the quit flush

Status: [MISSING]
Target: claude
Files: js/platform/index.js, js/platform/capabilities.js, js/platform/bridge-client.js, js/platform/window-actions.js, js/shell/pause.js, js/main.js, desktop/closing.js, tests/platform-selection.test.mjs, css/style.css, desktop/window.js, desktop/bridge.js
Preconditions: 85, 282, 289, 290, 291
Feature: steam-desktop-host

---

## 87. Windows packaging and the SteamPipe private build

Status: [MISSING]
Target: claude+human
Files: desktop/package.json, desktop/build/package.mjs, desktop/steampipe/app_build.vdf, desktop/steampipe/depot_build.vdf, desktop/steampipe/config.example.json, .gitignore
Preconditions: 84
Feature: steam-desktop-host

---

## 88. Steamworks binding spike

Status: [MISSING]
Target: claude+human
Files: desktop/spike/, desktop/package.json, .claude/domain/features/steam-desktop-host.md, .claude/domain/features/steam-leaderboards.md
Preconditions: 85, 87
Feature: steam-desktop-host

---

## 89. Steam adapter implementation on the chosen binding

Status: [MISSING]
Target: claude+human
Files: desktop/adapter/steam.js, desktop/adapter/interface.js, desktop/main.js, desktop/closing.js, desktop/package.json, tests/desktop-adapter-steam.test.mjs
Preconditions: 85, 86, 88
Feature: steam-desktop-host

---

## 90. Update documentation for feature `steam-desktop-host`

Status: [MISSING]
Target: claude
Files: .claude/context/desktop.md, .claude/context/platform.md, .claude/context/app-shell-pause.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 84, 85, 86, 87, 88, 89
Feature: steam-desktop-host

---

## 91. Main-process file service and the bridge's storage and blob operations

Status: [MISSING]
Target: claude
Files: desktop/file-service.js, desktop/bridge.js, desktop/preload.js, tests/desktop-file-service.test.mjs
Preconditions: 85
Feature: steam-cloud-saves

---

## 92. Steam document storage, Steam blob store and the quit flush

Status: [MISSING]
Target: claude
Files: js/platform/steam-storage.js, js/platform/steam-blob-store.js, js/platform/index.js, tests/platform-steam-storage.test.mjs
Preconditions: 86, 91
Feature: steam-cloud-saves

---

## 93. Steam Auto-Cloud configuration and quota

Status: [MISSING]
Target: claude+human
Files: dev/measure-cloud-quota.mjs, .claude/domain/features/steam-cloud-saves.md, .claude/domain/features/replay-library.md
Preconditions: 87, 92
Feature: steam-cloud-saves

---

## 94. Update documentation for feature `steam-cloud-saves`

Status: [MISSING]
Target: claude
Files: .claude/context/desktop.md, .claude/context/platform.md, .claude/context/replay-library.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 91, 92, 93
Feature: steam-cloud-saves

---

## 95. Leaderboard catalogue, eligibility and score details

Status: [MISSING]
Target: claude
Files: js/leaderboards/catalogue.js, js/leaderboards/details.js, js/leaderboards/eligibility.js, tests/leaderboards-catalogue.test.mjs
Preconditions: none
Feature: steam-leaderboards

---

## 96. Leaderboard outbox, verifier gate and submission state

Status: [MISSING]
Target: claude
Files: js/leaderboards/outbox.js, js/leaderboards/submit.js, js/leaderboards/state.js, js/results/flow.js, tests/leaderboards-submit.test.mjs
Preconditions: 95
Feature: steam-leaderboards

---

## 97. Steam submitter, best cache, reader and replay fetcher

Status: [MISSING]
Target: claude+human
Files: js/leaderboards/steam-submitter.js, js/leaderboards/best-cache.js, js/leaderboards/reader.js, js/leaderboards/replay-fetch.js, js/leaderboards/index.js, js/platform/index.js, tests/leaderboards-steam.test.mjs
Preconditions: 89, 92, 96
Feature: steam-leaderboards

---

## 98. Local leaderboards stand-in for the web build

Status: [MISSING]
Target: claude
Files: js/leaderboards/local.js, js/leaderboards/index.js, js/platform/index.js, tests/leaderboards-local.test.mjs
Preconditions: 86, 95
Feature: steam-leaderboards

---

## 99. Update documentation for feature `steam-leaderboards`

Status: [MISSING]
Target: claude
Files: .claude/context/leaderboards.md, .claude/context/app-shell-results.md, .claude/context/platform.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 95, 96, 97, 98
Feature: steam-leaderboards

---

## 100. Achievement catalogue and evaluator

Status: [MISSING]
Target: claude
Files: js/achievements/catalogue.js, js/achievements/evaluate.js, tests/achievements-evaluate.test.mjs, .claude/domain/features/steam-achievements.md
Preconditions: none
Feature: steam-achievements

---

## 101. Achievement unlocker, catch-up and the end-of-game hook

Status: [MISSING]
Target: claude
Files: js/achievements/unlock.js, js/achievements/index.js, js/results/flow.js, js/platform/index.js, tests/achievements-unlock.test.mjs
Preconditions: 86, 100
Feature: steam-achievements

---

## 102. Steamworks achievement definitions, threshold calibration and overlay check

Status: [MISSING]
Target: claude+human
Files: js/achievements/catalogue.js, tests/achievements-evaluate.test.mjs, .claude/domain/features/steam-achievements.md
Preconditions: 87, 89, 101
Feature: steam-achievements

---

## 103. Update documentation for feature `steam-achievements`

Status: [MISSING]
Target: claude
Files: .claude/context/achievements.md, .claude/context/app-shell-results.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 100, 101, 102
Feature: steam-achievements

---

## 104. Leaderboard screen: board picker, scope tabs, entries and states

Status: [MISSING]
Target: claude+human
Files: js/leaderboards/screen.js, js/shell/router.js, index.html, css/components.css, tests/leaderboards-screen.test.mjs, .claude/domain/features/leaderboard-screen.md, .claude/domain/features/steam-leaderboards.md
Preconditions: 97, 98, 163
Feature: leaderboard-screen

---

## 105. Watch replay from a leaderboard entry

Status: [MISSING]
Target: claude
Files: js/leaderboards/screen.js, js/replay/viewer.js, js/shell/router.js, tests/leaderboards-screen.test.mjs
Preconditions: 104
Feature: leaderboard-screen

---

## 106. Update documentation for feature `leaderboard-screen`

Status: [MISSING]
Target: claude
Files: .claude/context/leaderboards.md, .claude/context/app-shell-navigation.md, .claude/context/replay-playback.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 104, 105
Feature: leaderboard-screen

---

## 107. Leaderboards tab in Records and Quit in the title bar

Status: [MISSING]
Target: claude
Files: js/records/screen.js, js/platform/window-actions.js, js/shell/pause.js, index.html, js/shell/router.js, js/main.js, tests/shell-pause.test.mjs, tests/records-screen.test.mjs
Preconditions: 86, 104, 105, 165, 170, 282
Feature: leaderboards-menu-entry

---

## 108. Update documentation for feature `leaderboards-menu-entry`

Status: [MISSING]
Target: claude
Files: .claude/context/records-screen-view.md, .claude/context/app-shell-pause.md, .claude/context/testing.md, README.md
Preconditions: 107
Feature: leaderboards-menu-entry

---

## 109. Steam rank panel on the results screen

Status: [MISSING]
Target: claude+human
Files: js/results/rank-panel.js, js/results/view.js, js/results/flow.js, css/components.css, index.html, tests/results-rank.test.mjs, .claude/domain/features/results-steam-rank.md
Preconditions: 86, 97, 104, 169
Feature: results-steam-rank

---

## 110. Update documentation for feature `results-steam-rank`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell-results.md, .claude/context/leaderboards.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 109
Feature: results-steam-rank

---

## 111. Action catalogue, bindings resolver and the bindings setting

Status: [MISSING]
Target: claude
Files: js/settings/bindings.js, js/settings/resolver.js, js/settings/schema.js, js/settings/store.js, js/ui.js, js/ui/components.js, tests/settings-bindings.test.mjs
Preconditions: 163, 176, 177
Feature: input-rebinding

---

## 112. Classic 2D and 3D input read their actions through the bindings

Status: [MISSING]
Target: claude
Files: js/input.js, js/controls.js, js/main.js, js/shell/mode-3d.js, js/classic2d/pointer-input.js, js/classic2d/cursor-input.js, tests/input-bindings.test.mjs
Preconditions: 111
Feature: input-rebinding

---

## 113. Rebinding controls on the Settings page

Status: [MISSING]
Target: claude+human
Files: js/settings/page.js, js/settings/rebind-panel.js, index.html, css/components.css, tests/settings-rebind.test.mjs, .claude/domain/features/input-rebinding.md
Preconditions: 111, 112, 171
Feature: input-rebinding

---

## 114. Update documentation for feature `input-rebinding`

Status: [MISSING]
Target: claude
Files: README.md, .claude/context/input.md, .claude/context/app-shell-ui.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 111, 112, 113
Feature: input-rebinding

---

## 139. 3D flight: fly-through fade, forward follows the view, spacing, FOV

Status: [DONE]
Target: claude
Files: js/input.js, js/picking.js, js/render.js, js/main.js, js/ui.js, js/settings/schema.js, js/settings/store.js, js/settings/appliers.js, js/settings/page.js, js/settings/bindings.js, index.html, css/style.css, tests/camera-flight.test.mjs, tests/gamepad.test.mjs, tests/settings-store.test.mjs, tests/settings-appliers.test.mjs, tests/settings-page.test.mjs, tests/replay-3d.test.mjs, docs/ORIGINAL_SPEC.md, README.md, .claude/domain/product-design.md, .claude/domain/features/settings.md
Preconditions: none

---

## 140. Look at the board and end delay

Status: [DONE]
Target: claude
Files: js/shell/mode-3d.js, js/render.js, js/main.js, js/results/view.js, js/results/flow.js, index.html, css/style.css, tests/mode3d-end.test.mjs, tests/shell-mode-3d.test.mjs, tests/results.test.mjs, README.md, .claude/domain/features/3d-results-records-screens.md, .claude/domain/features/results-screen.md, .claude/domain/features/3d-board-graph.md, .claude/domain/product-design.md
Preconditions: none

---

## 142. Touch Classic 2D and touch-safe 3D entry

Status: [DONE]
Target: claude
Files: js/classic2d/touch-input.js, js/classic2d/board-view.js, js/classic2d/mode.js, js/main.js, js/ui.js, index.html, css/style.css, css/components.css, tests/classic2d-touch.test.mjs, tests/classic2d-view.test.mjs, tests/classic2d-mode.test.mjs, tests/components.test.mjs, README.md, .claude/domain/product-design.md, .claude/domain/business-model.md, .claude/domain/features/classic-2d-square-play.md, .claude/domain/features/game-shell.md, .claude/domain/features/3d-play-flow.md, .claude/domain/features/screen-components.md
Preconditions: none

---

## 143. Keyboard-only 3D

Status: [DONE]
Target: claude
Files: js/input.js, js/main.js, js/settings/bindings.js, js/ui.js, index.html, tests/input-keyboard-3d.test.mjs, tests/gamepad.test.mjs, tests/settings-page.test.mjs, tests/replay-3d.test.mjs, README.md, docs/ORIGINAL_SPEC.md, .claude/domain/features/settings.md, .claude/domain/features/3d-play-flow.md
Preconditions: none

---

## 144. Controller walk, pad-aware Records and viewer, haptics

Status: [DONE]
Target: claude
Files: js/gamepad.js, js/shell/navigation.js, js/main.js, js/records/screen.js, js/classic2d/cursor-input.js, js/classic2d/mode.js, js/ui.js, index.html, css/style.css, tests/shell-router.test.mjs, tests/gamepad.test.mjs, tests/records-screen.test.mjs, tests/classic2d-cursor.test.mjs, tests/shell-pad-walk.test.mjs, README.md
Preconditions: none

---

## 145. Focus containment in overlays

Status: [DONE]
Target: claude
Files: js/shell/navigation.js, js/main.js, js/ui.js, tests/shell-router.test.mjs, tests/shell-focus-containment.test.mjs, tests/shell-pause.test.mjs, .claude/domain/features/game-shell.md
Preconditions: none

---

## 146. Orbit camera mode

Status: [DONE]
Target: claude
Files: js/input.js, js/main.js, js/settings/schema.js, js/settings/page.js, js/settings/appliers.js, js/settings/bindings.js, js/ui.js, index.html, tests/camera-orbit.test.mjs, tests/settings-store.test.mjs, tests/settings-appliers.test.mjs, tests/settings-page.test.mjs, tests/replay-3d.test.mjs, tests/gamepad.test.mjs, README.md, docs/ORIGINAL_SPEC.md, .claude/domain/product-design.md, .claude/domain/features/settings.md, .claude/domain/features/3d-results-records-screens.md
Preconditions: 143

---

## 147. Touch controls for 3D

Status: [DONE]
Target: claude
Files: js/touch-3d.js, js/input.js, js/controls.js, js/main.js, js/ui.js, js/settings/bindings.js, index.html, css/style.css, css/components.css, dev/components.html, tests/input-touch-3d.test.mjs, tests/shell-mode-3d.test.mjs, tests/shell-pause.test.mjs, tests/components.test.mjs, tests/settings-page.test.mjs, tests/replay-3d.test.mjs, README.md, docs/ORIGINAL_SPEC.md, .claude/domain/product-design.md, .claude/domain/features/3d-play-flow.md, .claude/domain/features/game-shell.md, .claude/domain/features/screen-components.md, .claude/domain/features/settings.md
Preconditions: 139, 142

---

## 148. Records layout, pagination and lists

Status: [DONE]
Target: claude
Files: js/records/screen.js, js/records/replay-list.js, js/records/history-chart.js, js/records/view-prefs.js, js/replay/library.js, js/ui/components.js, js/settings/page.js, js/main.js, js/shell/navigation.js, index.html, css/components.css, css/style.css, dev/components.html, tests/records-screen.test.mjs, tests/records-screen-3d.test.mjs, tests/records-replays.test.mjs, tests/records-history.test.mjs, tests/replay-library.test.mjs, tests/components.test.mjs, tests/settings-page.test.mjs, tests/records-view-prefs.test.mjs, .claude/domain/features/records-screen.md, .claude/domain/features/replay-library.md, .claude/domain/features/screen-components.md, .claude/domain/features/settings.md, .claude/domain/features/3d-results-records-screens.md
Preconditions: none

---

## 149. Richer Records and local top-10

Status: [DONE]
Target: claude
Files: js/records/stats.js, js/records/export.js, js/records/screen.js, js/records/history-chart.js, js/results/flow.js, js/replay/library.js, js/settings/page.js, js/ui/components.js, js/main.js, index.html, css/components.css, css/style.css, dev/components.html, tests/records-stats.test.mjs, tests/records-export.test.mjs, tests/records-screen.test.mjs, tests/records-screen-3d.test.mjs, tests/records-history.test.mjs, tests/results.test.mjs, tests/replay-library.test.mjs, tests/settings-page.test.mjs, tests/components.test.mjs, README.md, .claude/domain/features/records-screen.md, .claude/domain/features/replay-library.md, .claude/domain/features/settings.md
Preconditions: 148

---

## 150. Replay viewer as a study tool

Status: [DONE]
Target: claude
Files: js/replay/viewer.js, js/replay/clock.js, js/replay/viewer-2d.js, js/replay/viewer-3d.js, js/replay/simulator.js, js/engine/metrics.js, js/render.js, js/input.js, js/ui.js, js/results/flow.js, js/results/view.js, js/records/replay-list.js, js/records/screen.js, js/main.js, index.html, css/tokens.css, css/components.css, css/style.css, tests/replay-viewer.test.mjs, tests/replay-2d.test.mjs, tests/replay-viewer-3d.test.mjs, tests/replay-simulator.test.mjs, tests/engine-metrics.test.mjs, tests/results-watch.test.mjs, tests/results.test.mjs, tests/records-replays.test.mjs, tests/tokens.test.mjs, README.md, .claude/domain/features/replay-playback.md, .claude/domain/features/replay-library.md, .claude/domain/features/results-screen.md, .claude/domain/features/3d-results-records-screens.md
Preconditions: none

---

## 151. Daily board, board codes and challenge links

Status: [DONE]
Target: claude
Files: js/records/board-code.js, js/shell/daily.js, js/shell/challenge.js, js/classic2d/session.js, js/classic2d/mode.js, js/classic2d/board-choice.js, js/classic2d/board-view.js, js/mode3d/session.js, js/mode3d/board-choice.js, js/shell/mode-3d.js, js/render.js, js/shell/menu.js, js/shell/router.js, js/records/board.js, js/records/summary.js, js/records/model.js, js/records/store.js, js/records/screen.js, js/records/replay-list.js, js/records/history-chart.js, js/records/stats.js, js/results/view.js, js/results/flow.js, js/replay/viewer.js, js/replay/recorder.js, js/replay/library.js, js/ui/components.js, js/main.js, js/ui.js, index.html, css/components.css, css/style.css, dev/components.html, tests/records-board-code.test.mjs, tests/shell-daily.test.mjs, tests/shell-challenge.test.mjs, tests/records-board.test.mjs, tests/records-summary.test.mjs, tests/records-model.test.mjs, tests/records-store.test.mjs, tests/records-screen.test.mjs, tests/records-screen-3d.test.mjs, tests/records-replays.test.mjs, tests/records-history.test.mjs, tests/classic2d-session.test.mjs, tests/classic2d-mode.test.mjs, tests/mode3d-session.test.mjs, tests/mode3d-board-choice.test.mjs, tests/shell-mode-3d.test.mjs, tests/shell-menu.test.mjs, tests/results.test.mjs, tests/replay-viewer.test.mjs, tests/replay-library.test.mjs, tests/components.test.mjs, README.md, .claude/domain/features/board-generation.md, .claude/domain/features/game-shell.md, .claude/domain/features/classic-2d-square-play.md, .claude/domain/features/3d-play-flow.md, .claude/domain/features/game-summary.md, .claude/domain/features/personal-records.md, .claude/domain/features/3d-game-records.md, .claude/domain/features/records-screen.md, .claude/domain/features/3d-results-records-screens.md, .claude/domain/features/results-screen.md, .claude/domain/features/replay-playback.md, .claude/domain/features/replay-library.md, .claude/domain/features/screen-components.md
Preconditions: none

---

## 152. Cube preset re-tune and first-box presets

Status: [DONE]
Target: claude
Files: js/mode3d/board-choice.js, js/records/board.js, js/records/model.js, js/records/screen.js, js/main.js, js/records/typical-bbbv.js, dev/measure-first-box-3d.mjs, dev/measure-typical-bbbv.mjs, dev/measure-replays.mjs, index.html, css/components.css, tests/mode3d-board-choice.test.mjs, tests/records-board-3d.test.mjs, tests/records-model-3d.test.mjs, tests/records-screen-3d.test.mjs, tests/mode3d-session.test.mjs, tests/camera-spawn.test.mjs, tests/shell-returning.test.mjs, README.md, .claude/domain/features/3d-play-flow.md, .claude/domain/features/3d-game-records.md, .claude/domain/product-design.md
Preconditions: none

---

## 153. Learn 3D guided board

Status: [DONE]
Target: claude
Files: js/mode3d/learn.js, dev/find-learn-3d.mjs, js/mode3d/board-choice.js, js/mode3d/session.js, js/shell/mode-3d.js, js/shell/first-use.js, js/shell/pause.js, js/main.js, js/ui.js, js/render.js, index.html, css/style.css, tests/mode3d-learn.test.mjs, tests/mode3d-board-choice.test.mjs, tests/mode3d-session.test.mjs, tests/shell-mode-3d.test.mjs, tests/shell-first-use.test.mjs, tests/shell-pause.test.mjs, README.md, .claude/domain/product-design.md, .claude/domain/features/3d-play-flow.md, .claude/domain/features/game-shell.md
Preconditions: 152

---

## 154. Fast and slow test tiers and a cheaper browser suite

Status: [DONE]
Target: claude
Files: .claude/external/run-full-tests.sh, .claude/external/run-fast-tests.sh, .claude/external/run-browser-tests.sh, .claude/external/run-affected-tests.sh, tests/components.test.mjs, tests/classic2d-mode.test.mjs, tests/shell-pause.test.mjs, tests/settings-page.test.mjs, tests/shell-menu.test.mjs, tests/shell-help.test.mjs, tests/shell-returning.test.mjs, tests/results-watch.test.mjs, tests/shell-history.test.mjs, tests/records-history.test.mjs, tests/shell-router.test.mjs, tests/settings-appliers.test.mjs, tests/replay-viewer.test.mjs, tests/results.test.mjs, tests/classic2d-fidelity.test.mjs, tests/records-screen.test.mjs, tests/records-replays.test.mjs, tests/tile-skin.test.mjs, js/main.js, README.md, .claude/context/testing.md
Preconditions: none

---

## 155. Load-robust timing tests and one shared Chromium per test file

Status: [DONE]
Target: claude
Files: tests/helpers/browser.mjs, tests/engine-3d-profile.test.mjs, tests/engine-graph.test.mjs, tests/generation-solver.test.mjs, tests/records-history.test.mjs, tests/render-3d-flag-flash.test.mjs, tests/mode3d-end.test.mjs, tests/replay-viewer-3d.test.mjs, tests/classic2d-mode.test.mjs, tests/shell-mode-3d.test.mjs, tests/camera-spawn.test.mjs, tests/classic2d-cursor.test.mjs, tests/classic2d-fidelity.test.mjs, tests/classic2d-pointer.test.mjs, tests/classic2d-view.test.mjs, tests/components.test.mjs, tests/mode3d-board-choice.test.mjs, tests/mode3d-session.test.mjs, tests/platform-blob-store.test.mjs, tests/platform-browser.test.mjs, tests/records-replays.test.mjs, tests/records-screen-3d.test.mjs, tests/records-screen.test.mjs, tests/render-3d-feedback.test.mjs, tests/replay-viewer.test.mjs, tests/results-watch.test.mjs, tests/results.test.mjs, tests/settings-appliers.test.mjs, tests/settings-page.test.mjs, tests/shell-first-use.test.mjs, tests/shell-help.test.mjs, tests/shell-history.test.mjs, tests/shell-lock-fallback.test.mjs, tests/shell-menu.test.mjs, tests/shell-mode-host.test.mjs, tests/shell-pause-esc.test.mjs, tests/shell-pause.test.mjs, tests/shell-returning.test.mjs, tests/shell-router.test.mjs, tests/tile-skin.test.mjs, README.md, .claude/context/testing.md
Preconditions: 154

---

## 157. Theme registry, kit catalogue and the Joyful tiles theme folder

Status: [DONE]
Target: claude
Files: js/themes/registry.js, js/ui/kit-catalogue.js, themes/joyful-tiles/board.js, themes/joyful-tiles/fonts/, tests/theme-registry.test.mjs, css/components.css, dev/components.html
Preconditions: none
Feature: theme-system

---

## 158. Base stylesheet and the Joyful tiles theme stylesheet; retire light and dark

Status: [DONE]
Target: claude
Files: css/tokens.css, css/components.css, css/style.css, themes/joyful-tiles/theme.css, js/ui/components.js, index.html, js/theme.js, dev/components.html, js/shell/scene-palette.js, js/tokens.js, tests/tokens.test.mjs, tests/theme.test.mjs, tests/components.test.mjs, tests/settings-appliers.test.mjs
Preconditions: 157
Feature: theme-system

---

## 159. Registry-driven theme applier with run-time switch and board module hand-off

Status: [DONE]
Target: claude
Files: js/theme.js, js/tokens.js, js/shell/scene-palette.js, js/settings/appliers.js, js/main.js, index.html, dev/components.html, js/themes/registry.js, tests/theme.test.mjs, tests/settings-appliers.test.mjs
Preconditions: 157, 158
Feature: theme-system

---

## 160. Settings theme list and light/dark carry-over

Status: [DONE]
Target: claude
Files: js/settings/schema.js, js/settings/store.js, js/settings/page.js, js/settings/appliers.js, js/theme.js, index.html, tests/settings-store.test.mjs, tests/settings-page.test.mjs, tests/settings-appliers.test.mjs, tests/settings-reset.test.mjs
Preconditions: 159
Feature: theme-system

---

## 161. Theme conformance tests and the component gallery per theme

Status: [DONE]
Target: claude
Files: tests/theme-conformance.test.mjs, tests/fixtures/themes/, js/ui/kit-catalogue.js, themes/joyful-tiles/theme.css, dev/components.html
Preconditions: 157, 158, 159
Feature: theme-system

---

## 162. Update documentation for feature `theme-system`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-kit.md, .claude/context/settings.md, .claude/context/testing.md, .claude/context/rendering.md, .claude/context/INDEX.md, README.md, .claude/domain/features/theme-system.md, .claude/domain/features/design-tokens-and-themes.md, .claude/domain/features/settings.md
Preconditions: 157, 158, 159, 160, 161
Feature: theme-system

---

## 163. Layout kit components: backdrop, screen frame, mode entry, board option, stat tile and the rest

Status: [DONE]
Target: claude
Files: js/ui/kit-catalogue.js, css/components.css, themes/joyful-tiles/theme.css, js/ui/components.js, dev/components.html, tests/components.test.mjs, tests/theme-conformance.test.mjs
Preconditions: 158, 161
Feature: shared-screen-layout

---

## 164. 3D scene drawn into a screen's scene panel

Status: [DONE]
Target: claude
Files: js/render.js, js/main.js, js/shell/router.js, tests/shell-menu.test.mjs, tests/render-3d-feedback.test.mjs
Preconditions: 163
Feature: shared-screen-layout

---

## 165. Main menu in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/shell/menu.js, js/shell/returning.js, js/shell/daily.js, js/main.js, js/ui.js, js/settings/page.js, js/classic2d/board-view.js, themes/joyful-tiles/theme.css, tests/shell-menu.test.mjs, tests/shell-returning.test.mjs, tests/shell-router.test.mjs, tests/settings-page.test.mjs, tests/components.test.mjs
Preconditions: 163, 164
Feature: shared-screen-layout

---

## 166. Classic 2D board choice screen with its bests, Insert Board Code and Custom Random

Status: [DONE]
Target: claude
Files: index.html, js/classic2d/board-choice.js, js/classic2d/board-setup.js, js/main.js, tests/classic2d-mode.test.mjs, tests/shell-challenge.test.mjs, tests/shell-returning.test.mjs, tests/components.test.mjs
Preconditions: 163
Feature: shared-screen-layout

---

## 212. 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Status: [DONE]
Target: claude
Files: js/mode3d/board-choice.js, js/records/board.js, js/records/model.js, js/records/screen.js, js/records/typical-bbbv.js, js/mode3d/learn.js, js/ui.js, js/main.js, js/shell/returning.js, index.html, dev/measure-first-box-3d.mjs, tests/mode3d-board-choice.test.mjs, tests/records-board-3d.test.mjs, tests/records-model-3d.test.mjs, tests/records-screen-3d.test.mjs, tests/mode3d-learn.test.mjs, tests/camera-spawn.test.mjs, tests/shell-menu.test.mjs
Preconditions: none
Feature: shared-screen-layout

---

## 167. 3D board choice screen in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/mode3d/board-choice.js, js/shell/returning.js, js/main.js, tests/mode3d-board-choice.test.mjs, tests/shell-challenge.test.mjs, tests/shell-returning.test.mjs, tests/components.test.mjs
Preconditions: 166, 212
Feature: shared-screen-layout

---

## 168. Pause card, generating and failed-board cards, placeholder and confirmations in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/shell/pause.js, js/shell/menu.js, js/main.js, js/ui.js, tests/shell-pause.test.mjs, tests/shell-pause-esc.test.mjs, tests/shell-menu.test.mjs, tests/components.test.mjs
Preconditions: 163
Feature: shared-screen-layout

---

## 169. Results screen redesigned in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/results/view.js, js/results/flow.js, tests/results.test.mjs, tests/results-watch.test.mjs, tests/mode3d-end.test.mjs, tests/components.test.mjs
Preconditions: 163
Feature: shared-screen-layout

---

## 170. Records screen in the shared layout, with its Leaderboards tab

Status: [DONE]
Target: claude
Files: index.html, js/records/screen.js, js/records/history-chart.js, js/records/replay-list.js, tests/records-screen.test.mjs, tests/records-screen-3d.test.mjs, tests/records-replays.test.mjs, tests/components.test.mjs
Preconditions: 163, 212
Feature: shared-screen-layout

---

## 171. Settings page in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/settings/page.js, tests/settings-page.test.mjs, tests/settings-reset.test.mjs, tests/components.test.mjs
Preconditions: 160, 163
Feature: shared-screen-layout

---

## 172. Replay viewer in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/replay/viewer.js, js/replay/viewer-2d.js, js/replay/viewer-3d.js, tests/replay-viewer.test.mjs, tests/replay-viewer-3d.test.mjs, tests/components.test.mjs
Preconditions: 163
Feature: shared-screen-layout

---

## 173. Update documentation for feature `shared-screen-layout`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-kit.md, .claude/context/app-shell-menu.md, .claude/context/app-shell-markup.md, .claude/context/app-shell-pause.md, .claude/context/app-shell-results.md, .claude/context/app-shell-3d.md, .claude/context/rendering.md, .claude/context/classic2d.md, .claude/context/mode3d.md, .claude/context/records-screen.md, .claude/context/settings.md, .claude/context/replay-playback.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md, .claude/domain/features/shared-screen-layout.md
Preconditions: 163, 164, 165, 166, 167, 168, 169, 170, 171, 172, 206, 209, 210, 211, 212
Feature: shared-screen-layout

---

## 174. Live figures model: 3BV progress, pace vs PB, 3BV/s, clicks and flags

Status: [DONE]
Target: claude
Files: js/shell/live-figures.js, tests/live-figures.test.mjs
Preconditions: none
Feature: in-game-layout

---

## 175. Counter readout and figures panel kit components

Status: [DONE]
Target: claude
Files: js/ui/kit-catalogue.js, css/components.css, themes/joyful-tiles/theme.css, dev/components.html, tests/components.test.mjs
Preconditions: 163
Feature: in-game-layout

---

## 176. Classic 2D game window: counter strip, side panel and foot line

Status: [DONE]
Target: claude
Files: index.html, js/classic2d/mode.js, js/classic2d/session.js, js/classic2d/board-view.js, js/ui.js, js/ui/components.js, js/main.js, tests/classic2d-mode.test.mjs, tests/classic2d-view.test.mjs, tests/components.test.mjs
Preconditions: 163, 174, 175
Feature: in-game-layout

---

## 177. 3D game overlay in the in-game layout

Status: [DONE]
Target: claude
Files: index.html, js/shell/mode-3d.js, js/mode3d/session.js, js/ui.js, js/main.js, js/touch-3d.js, tests/shell-mode-3d.test.mjs, tests/mode3d-session.test.mjs, tests/input-touch-3d.test.mjs, tests/components.test.mjs
Preconditions: 176
Feature: in-game-layout

---

## 178. Live figures in the replay viewer

Status: [DONE]
Target: claude
Files: js/replay/viewer.js, js/replay/simulator.js, index.html, tests/replay-viewer.test.mjs, tests/replay-viewer-3d.test.mjs
Preconditions: 172, 174, 175
Feature: in-game-layout

---

## 179. Update documentation for feature `in-game-layout`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-ui.md, .claude/context/app-shell-kit.md, .claude/context/classic2d-board-view.md, .claude/context/classic2d-mode.md, .claude/context/mode3d-session.md, .claude/context/replay-playback.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md, .claude/domain/features/in-game-layout.md
Preconditions: 174, 175, 176, 177, 178
Feature: in-game-layout

---

## 180. Tile recipe drawing styles: flat and bevel, with corner radius and depth

Status: [DONE]
Target: claude
Files: js/tile-art.js, js/classic2d/tile-skin.js, js/textures.js, tests/tile-skin.test.mjs, tests/tile-art.test.mjs
Preconditions: none
Feature: themed-board-art-and-motion

---

## 181. Board module shape, the Joyful tiles board module and the board conformance checks

Status: [DONE]
Target: claude
Files: js/themes/board-module.js, themes/joyful-tiles/board.js, themes/joyful-tiles/fonts/, tests/theme-conformance.test.mjs, tests/board-module.test.mjs
Preconditions: 161, 180
Feature: themed-board-art-and-motion

---

## 182. Classic 2D tiles drawn from the active theme's board module

Status: [DONE]
Target: claude
Files: js/classic2d/tile-skin.js, js/classic2d/board-view.js, js/classic2d/mode.js, js/main.js, themes/joyful-tiles/theme.css, tests/tile-skin.test.mjs, tests/classic2d-view.test.mjs, tests/classic2d-pointer.test.mjs, tests/classic2d-touch.test.mjs
Preconditions: 159, 181
Feature: themed-board-art-and-motion

---

## 183. 3D cubes, numbers and sky drawn from the active theme's board module

Status: [DONE]
Target: claude
Files: js/textures.js, js/render.js, js/shell/scene-palette.js, js/main.js, themes/joyful-tiles/theme.css, tests/render-3d-feedback.test.mjs, tests/theme.test.mjs, tests/tokens.test.mjs
Preconditions: 159, 181
Feature: themed-board-art-and-motion

---

## 213. 3D selection glow line, selected-face tint and confetti colours drawn from the board module

Status: [DONE]
Target: claude
Files: js/render.js, tests/render-3d-selection.test.mjs, tests/render-3d-feedback.test.mjs
Preconditions: 181, 183
Feature: themed-board-art-and-motion

---

## 184. Cell motion player

Status: [DONE]
Target: claude
Files: js/cell-motion.js, tests/cell-motion.test.mjs
Preconditions: 181
Feature: themed-board-art-and-motion

---

## 185. Classic 2D cell motion: motion layer and event sources

Status: [DONE]
Target: claude
Files: js/classic2d/board-view.js, js/classic2d/motion-layer.js, js/classic2d/pointer-input.js, js/classic2d/cursor-input.js, js/classic2d/session.js, js/replay/viewer-2d.js, tests/classic2d-motion.test.mjs, tests/classic2d-fidelity.test.mjs
Preconditions: 182, 184
Feature: themed-board-art-and-motion

---

## 186. 3D cell motion: motion mesh, event sources and the solved pulse as a cell event

Status: [DONE]
Target: claude
Files: js/render.js, js/shell/mode-3d.js, js/replay/viewer-3d.js, tests/render-3d-feedback.test.mjs, tests/render-3d-motion.test.mjs
Preconditions: 183, 184
Feature: themed-board-art-and-motion

---

## 187. Update documentation for feature `themed-board-art-and-motion`

Status: [DONE]
Target: claude
Files: .claude/context/classic2d-tile-skin.md, .claude/context/classic2d-board-view.md, .claude/context/rendering.md, .claude/context/rendering-effects.md, .claude/context/app-shell-kit.md, .claude/context/replay-playback.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md, .claude/domain/features/themed-board-art-and-motion.md, .claude/domain/features/square-tile-skin.md
Preconditions: 180, 181, 182, 183, 184, 185, 186, 213
Feature: themed-board-art-and-motion

---

## 188. The theme-implement skill

Status: [DONE]
Target: claude
Files: .claude/skills/theme-implement/SKILL.md, .claude/skills/theme-implement/references/
Preconditions: 161, 163, 175, 181
Feature: theme-implement-skill

---

## 189. Update documentation for feature `theme-implement-skill`

Status: [DONE]
Target: claude
Files: README.md, .claude/context/INDEX.md, .claude/domain/features/theme-implement-skill.md
Preconditions: 188
Feature: theme-implement-skill

---

## 190. Classic 2D overlay bar fits a phone: Pause and Reveal / Flag on screen

Status: [DONE]
Target: claude
Files: css/style.css, css/components.css, index.html, js/ui.js, js/main.js, tests/classic2d-touch.test.mjs, tests/components.test.mjs, .claude/domain/features/classic-2d-square-play.md, .claude/domain/features/screen-components.md
Preconditions: none

---

## 191. Classic 2D touch help: touch binding rows and a touch clipped-board hint

Status: [DONE]
Target: claude
Files: js/settings/bindings.js, js/ui.js, js/main.js, js/classic2d/touch-input.js, tests/settings-page.test.mjs, tests/shell-help.test.mjs, tests/shell-first-use.test.mjs, tests/classic2d-mode.test.mjs, tests/classic2d-touch.test.mjs, .claude/domain/features/settings.md, .claude/domain/features/classic-2d-square-play.md
Preconditions: none

---

## 192. 3D ready and results cards: key hints that match the device and the screen

Status: [DONE]
Target: claude
Files: index.html, js/ui.js, js/results/, css/style.css, tests/shell-first-use.test.mjs, tests/results.test.mjs, tests/shell-mode-3d.test.mjs
Preconditions: none

---

## 193. Records: best tiles and tables keep their figures on one line

Status: [DONE]
Target: claude
Files: css/components.css, css/style.css, js/records/screen.js, js/records/replay-list.js, dev/components.html, tests/records-screen.test.mjs, tests/records-replays.test.mjs, tests/components.test.mjs
Preconditions: none

---

## 194. Best-time chart: axis ticks with the fewest decimals that tell them apart

Status: [DONE]
Target: claude
Files: js/records/history-chart.js, tests/records-history.test.mjs
Preconditions: none

---

## 195. Learn 3D guided board: the chord prompt moves on when a chord can no longer teach

Status: [DONE]
Target: claude
Files: js/mode3d/learn.js, js/main.js, tests/mode3d-learn.test.mjs, .claude/context/mode3d.md, .claude/context/app-shell-3d.md
Preconditions: none

---

## 196. Browser tests: root-cause and fix the flakes seen under full-suite load

Status: [DONE]
Target: claude
Files: tests/shell-pad-walk.test.mjs, tests/shell-mode-3d.test.mjs, tests/classic2d-touch.test.mjs, tests/replay-viewer.test.mjs, tests/shell-menu.test.mjs, tests/helpers/timing.mjs, tests/helpers/browser.mjs, .claude/context/testing-conventions.md
Preconditions: none

---

## 197. Bare `node --test` runs only the project's tests

Status: [DONE]
Target: claude
Files: docs/ux-review/ux-first-run/s7-hit-test.mjs, tests/affected-tests.test.mjs, .claude/context/testing.md
Preconditions: none

---

## 198. Classic 2D no-guess switch back under the presets, with the D-pad walk to match

Status: [DONE]
Target: claude
Files: index.html, css/style.css, tests/shell-pad-walk.test.mjs
Preconditions: none

---

## 199. Larger stat labels and key caps on every pointer, 44 px hit areas still touch-only

Status: [DONE]
Target: claude
Files: css/components.css, css/style.css, tests/components.test.mjs, .claude/domain/features/screen-components.md, .claude/context/app-shell-markup.md
Preconditions: none

---

## 200. Touch wording on a coarse-only device for the help foot, HUD strip and hint strip

Status: [DONE]
Target: claude
Files: js/settings/bindings.js, js/ui.js, tests/shell-help.test.mjs, tests/shell-first-use.test.mjs, tests/settings-page.test.mjs, tests/classic2d-touch.test.mjs, tests/shell-mode-3d.test.mjs, .claude/context/settings-bindings.md, .claude/context/app-shell-help.md
Preconditions: none

---

## 201. Pause card in two columns at 1024 px and wider, fitting a 1024 × 768 window

Status: [DONE]
Target: claude
Files: index.html, css/components.css, css/style.css, js/ui.js, tests/classic2d-mode.test.mjs, tests/shell-mode-3d.test.mjs, .claude/domain/features/screen-components.md, .claude/context/app-shell-markup.md
Preconditions: none

---

## 202. Records Averages table stays inside its panel on a phone

Status: [DONE]
Target: claude
Files: css/style.css, tests/records-screen.test.mjs, .claude/context/records-screen.md
Preconditions: none

---

## 203. Classic 2D hint strip from the game's start on a touch-only device

Status: [DONE]
Target: claude
Files: js/main.js, js/shell/first-use.js, tests/shell-first-use.test.mjs, tests/classic2d-touch.test.mjs, .claude/context/app-shell-help.md
Preconditions: none

---

## 204. Daily screen won time in the standard time format

Status: [SKIP]
Target: claude
Files: js/shell/daily.js, tests/shell-daily.test.mjs
Preconditions: none
Feature: game-shell

---

## 205. Update documentation for feature `game-shell`

Status: [SKIP]
Target: claude
Files: .claude/context/app-shell-menu.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: none
Feature: game-shell

---

## 206. Daily screen won time in the standard time format

Status: [DONE]
Target: claude
Files: js/shell/daily.js, tests/shell-daily.test.mjs
Preconditions: none
Feature: shared-screen-layout

---
## 207. 3D presets without First box 1 and 2; Learn 3D's win offers Cube Intro

Status: [SKIP]
Target: claude
Files: js/mode3d/board-choice.js, js/records/board.js, js/records/model.js, js/records/screen.js, js/records/typical-bbbv.js, js/mode3d/learn.js, js/ui.js, js/main.js, js/shell/returning.js, index.html, dev/measure-first-box-3d.mjs, tests/mode3d-board-choice.test.mjs, tests/records-board-3d.test.mjs, tests/records-model-3d.test.mjs, tests/records-screen-3d.test.mjs, tests/mode3d-learn.test.mjs, tests/camera-spawn.test.mjs, tests/shell-menu.test.mjs
Preconditions: none
Feature: 3d-play-flow

---

## 208. Update documentation for feature `3d-play-flow`

Status: [SKIP]
Target: claude
Files: .claude/context/mode3d.md, .claude/context/app-shell-3d.md, .claude/context/records-screen.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md, .claude/domain/features/3d-play-flow.md
Preconditions: none
Feature: 3d-play-flow

---

## 209. Daily screen in the board-choice layout, listing every mode

Status: [DONE]
Target: claude
Files: index.html, js/shell/daily.js, js/main.js, tests/shell-daily.test.mjs, tests/components.test.mjs
Preconditions: 163, 164, 166, 206
Feature: shared-screen-layout

---

## 210. 3D ready card, lock states and Learn 3D cards in the shared layout

Status: [DONE]
Target: claude
Files: index.html, js/ui.js, js/shell/mode-3d.js, js/shell/first-use.js, js/main.js, tests/shell-mode-3d.test.mjs, tests/shell-first-use.test.mjs, tests/mode3d-learn.test.mjs, tests/shell-lock-fallback.test.mjs, tests/components.test.mjs
Preconditions: 163, 212
Feature: shared-screen-layout

---

## 211. Toasts, fatal card, no-JavaScript notice and 404 page in the shared layout

Status: [DONE]
Target: claude
Files: index.html, 404.html, js/ui.js, js/main.js, tests/components.test.mjs, tests/shell-router.test.mjs
Preconditions: 163
Feature: shared-screen-layout

---

## 214. Full test runs reliable again: the stale counter test, the random first click, the theme-switch flakes and the slow components file

Status: [DONE]
Target: claude
Files: tests/render-3d-flag-flash.test.mjs, tests/classic2d-mode.test.mjs, tests/classic2d-view.test.mjs, tests/theme.test.mjs, tests/components.test.mjs, tests/helpers/timing.mjs, .claude/external/affected-tests.mjs, tests/affected-tests.test.mjs, .claude/context/testing.md, .claude/context/testing-conventions.md
Preconditions: none

---

## 215. Settings page tests hold with more than one shipped theme

Status: [DONE]
Target: claude
Files: tests/settings-page.test.mjs, js/settings/page.js
Preconditions: 214

---

## 216. Theme switch keeps every font weight the new theme declares loaded in Chromium

Status: [DONE]
Target: claude
Files: js/themes/applier.js, tests/theme.test.mjs, tests/fixtures/themes/fixture-theme.js, tests/fixtures/themes/fixture-dusk/, .claude/context/app-shell-themes.md, .claude/context/testing.md
Preconditions: 214

---

## 217. UX-review scripts follow the current board-choice markup

Status: [DONE]
Target: claude
Files: docs/ux-review/enthusiast-loop/, docs/ux-review/game-design/, docs/ux-review/input-a11y/, docs/ux-review/mode-3d/, docs/ux-review/ux-first-run/
Preconditions: 214

---

## 218. Kit buttons: md size, key hint ink, quiet variant, latched toggles, danger variant

Status: [DONE]
Target: claude
Files: css/components.css, themes/joyful-tiles/theme.css, css/style.css, js/ui/kit-catalogue.js, dev/components.html, index.html, js/settings/page.js, tests/components.test.mjs, .claude/context/app-shell-kit.md
Preconditions: 214
Feature: shared-screen-layout

---

## 219. Kit form controls: switch, switch row, slider fill, number field, invalid state, focus halo

Status: [DONE]
Target: claude
Files: css/components.css, themes/joyful-tiles/theme.css, js/ui/components.js, js/ui/kit-catalogue.js, dev/components.html, js/classic2d/board-choice.js, js/mode3d/board-choice.js, tests/components.test.mjs, .claude/context/app-shell-kit.md
Preconditions: 214
Feature: shared-screen-layout

---

## 220. Kit icon set and leading-icon slot

Status: [DONE]
Target: claude
Files: js/ui/components.js, js/ui/kit-catalogue.js, css/components.css, dev/components.html, tests/components.test.mjs, .claude/context/app-shell-kit.md
Preconditions: 218
Feature: shared-screen-layout

---

## 221. Kit feedback parts: confirm box, warn and err notes

Status: [DONE]
Target: claude
Files: css/components.css, themes/joyful-tiles/theme.css, index.html, js/shell/pause.js, js/ui.js, js/records/replay-list.js, js/settings/page.js, js/settings/reset.js, js/classic2d/board-choice.js, js/mode3d/board-choice.js, js/ui/kit-catalogue.js, dev/components.html, .claude/context/app-shell-kit.md
Preconditions: 218, 220
Feature: shared-screen-layout

---

## 222. Kit surfaces: plain stat tile, muted panel, tables, pager, code chip

Status: [DONE]
Target: claude
Files: themes/joyful-tiles/theme.css, css/components.css, js/ui/components.js, js/ui/kit-catalogue.js, dev/components.html, tests/components.test.mjs, .claude/context/app-shell-kit.md
Preconditions: 218, 220
Feature: shared-screen-layout

---

## 223. Kit frames: head and foot steps, white action foot, message cards, scrims, status cards

Status: [DONE]
Target: claude
Files: css/components.css, themes/joyful-tiles/theme.css, css/style.css, index.html, js/ui.js, js/replay/viewer.js, .claude/context/app-shell-kit.md, .claude/context/app-shell-ui.md
Preconditions: 218, 220
Feature: shared-screen-layout

---

## 224. Board module: 2D numbers, 2D end effect from the module, theme token cleanup

Status: [DONE]
Target: claude
Files: js/themes/board-module.js, themes/joyful-tiles/board.js, js/classic2d/tile-skin.js, js/classic2d/end-effect.js, themes/joyful-tiles/theme.css, tests/theme-conformance.test.mjs, .claude/context/app-shell-board-module.md, .claude/context/app-shell-themes.md
Preconditions: 214
Feature: themed-board-art-and-motion

---

## 225. Board module motion tracks: opacity, flip, scale and brightness

Status: [DONE]
Target: claude
Files: js/themes/board-module.js, js/cell-motion.js, js/tile-art.js, themes/joyful-tiles/board.js, .claude/context/classic2d-tile-motion.md, .claude/context/app-shell-board-module.md
Preconditions: 224
Feature: themed-board-art-and-motion

---

## 226. 2D tile art: glyphs, hairline, start cell, flat widths and the cursor ring outside the tile

Status: [DONE]
Target: claude
Files: js/tile-art.js, themes/joyful-tiles/board.js, js/classic2d/board-view.js, js/classic2d/tile-skin.js, .claude/context/classic2d-board-view.md, .claude/context/rendering-board-art.md
Preconditions: 224
Feature: themed-board-art-and-motion

---

## 227. Board frame and framed previews

Status: [DONE]
Target: claude
Files: themes/joyful-tiles/theme.css, js/ui.js, js/shell/menu-preview.js, js/shell/daily.js, js/replay/viewer-2d.js, index.html, css/style.css, .claude/context/classic2d-board-view.md, .claude/context/replay-viewers.md
Preconditions: 224
Feature: themed-board-art-and-motion

---

## 228. Main menu: mode entries, scene panel, per-size layout, build label and scroll

Status: [DONE]
Target: claude
Files: css/style.css, themes/joyful-tiles/theme.css, css/components.css, index.html, js/shell/menu.js, js/ui.js, .claude/context/app-shell-menu.md
Preconditions: 220, 223
Feature: shared-screen-layout

---

## 229. Daily screen to the canvas

Status: [DONE]
Target: claude
Files: index.html, js/shell/daily.js, js/ui.js, css/style.css, themes/joyful-tiles/theme.css, .claude/context/app-shell-daily.md
Preconditions: 222, 223, 227, 228
Feature: shared-screen-layout

---

## 230. Board choice screens to the canvas

Status: [DONE]
Target: claude
Files: index.html, css/style.css, themes/joyful-tiles/theme.css, css/components.css, js/classic2d/board-choice.js, js/mode3d/board-choice.js, .claude/context/app-shell-2d.md, .claude/context/app-shell-3d.md
Preconditions: 219, 221, 222, 223
Feature: shared-screen-layout

---

## 231. Classic 2D window layout and HUD density

Status: [DONE]
Target: claude
Files: css/style.css, js/classic2d/board-view.js, themes/joyful-tiles/theme.css, index.html, .claude/context/app-shell-2d.md, .claude/context/classic2d-board-view.md
Preconditions: 223, 227
Feature: in-game-layout

---

## 232. First-use hint strip and the Tap: Reveal / Flag segmented choice

Status: [DONE]
Target: claude
Files: css/style.css, js/settings/bindings.js, index.html, js/ui.js, .claude/context/app-shell-help.md, .claude/context/classic2d-input.md
Preconditions: 231
Feature: in-game-layout

---

## 233. Controls and bindings lists as one ruled two-column part

Status: [DONE]
Target: claude
Files: js/settings/bindings.js, js/settings/page.js, index.html, css/style.css, themes/joyful-tiles/theme.css, .claude/context/settings-bindings.md, .claude/context/app-shell-help.md
Preconditions: 223
Feature: shared-screen-layout

---

## 234. Pause card to the canvas

Status: [DONE]
Target: claude
Files: index.html, js/ui.js, js/shell/pause.js, css/components.css, .claude/context/app-shell-pause.md
Preconditions: 221, 233
Feature: shared-screen-layout

---

## 235. 3D ready card, HUD readouts and the touch stick

Status: [DONE]
Target: claude
Files: index.html, css/style.css, themes/joyful-tiles/theme.css, js/touch-3d.js, dev/components.html, .claude/context/app-shell-3d.md, .claude/context/app-shell-3d-play.md
Preconditions: 220, 223, 233
Feature: shared-screen-layout

---

## 236. Learn 3D play layout and end cards

Status: [DONE]
Target: claude
Files: css/style.css, js/ui.js, index.html, .claude/context/mode3d-learn.md
Preconditions: 235
Feature: in-game-layout

---

## 237. Results screen to the canvas

Status: [DONE]
Target: claude
Files: index.html, js/results/view.js, css/style.css, themes/joyful-tiles/theme.css, js/shell/first-use.js, .claude/context/app-shell-results.md
Preconditions: 222, 223
Feature: shared-screen-layout

---

## 238. Records screen to the canvas

Status: [DONE]
Target: claude
Files: index.html, css/style.css, js/records/screen.js, js/records/replay-list.js, js/records/history-chart.js, themes/joyful-tiles/theme.css, .claude/context/records-screen-view.md, .claude/context/records-library-view.md
Preconditions: 221, 222
Feature: shared-screen-layout

---

## 239. Replay viewer to the canvas

Status: [DONE]
Target: claude
Files: index.html, css/style.css, themes/joyful-tiles/theme.css, css/components.css, js/replay/viewer.js, js/replay/viewer-2d.js, .claude/context/replay-viewer-screen.md, .claude/context/replay-viewers.md
Preconditions: 222, 223, 227
Feature: shared-screen-layout

---

## 240. Settings screen to the canvas

Status: [DONE]
Target: claude
Files: css/style.css, themes/joyful-tiles/theme.css, js/settings/page.js, index.html, tests/settings-page.test.mjs, .claude/context/settings-page.md
Preconditions: 215, 219, 221
Feature: shared-screen-layout

---

## 241. Other surfaces: placeholder, fatal card and toasts

Status: [DONE]
Target: claude
Files: index.html, css/components.css, css/style.css, themes/joyful-tiles/theme.css, .claude/context/app-shell-ui.md
Preconditions: 223
Feature: shared-screen-layout

---

## 242. Copy alignment with the canvas

Status: [DONE]
Target: claude
Files: js/themes/applier.js, js/main.js, js/records/board-code.js, js/classic2d/board-choice.js, js/mode3d/board-choice.js, js/ui.js, index.html, js/results/view.js, js/shell/live-figures.js, .claude/context/records-board-code.md
Preconditions: 230, 237
Feature: shared-screen-layout

---

## 243. Component gallery coverage and the theme list

Status: [DONE]
Target: claude
Files: dev/components.html, js/ui/kit-catalogue.js, tests/components.test.mjs, .claude/context/app-shell-kit.md
Preconditions: 218, 219, 220, 221, 222, 223
Feature: theme-system

---

## 244. Update documentation for feature `shared-screen-layout`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-kit.md, .claude/context/app-shell-kit-helpers.md, .claude/context/app-shell-menu.md, .claude/context/app-shell-daily.md, .claude/context/app-shell-2d.md, .claude/context/app-shell-3d.md, .claude/context/app-shell-3d-play.md, .claude/context/app-shell-pause.md, .claude/context/app-shell-results.md, .claude/context/app-shell-ui.md, .claude/context/app-shell-help.md, .claude/context/settings-bindings.md, .claude/context/settings-page.md, .claude/context/records-screen.md, .claude/context/records-screen-view.md, .claude/context/records-library-view.md, .claude/context/records-board-code.md, .claude/context/replay-viewer-screen.md, .claude/context/replay-viewers.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/shared-screen-layout.md
Preconditions: 218, 219, 220, 221, 222, 223, 228, 229, 230, 233, 234, 235, 237, 238, 239, 240, 241, 242
Feature: shared-screen-layout

---

## 245. Update documentation for feature `in-game-layout`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-2d.md, .claude/context/app-shell-3d.md, .claude/context/app-shell-3d-play.md, .claude/context/app-shell-help.md, .claude/context/app-shell-ui.md, .claude/context/classic2d-board-view.md, .claude/context/classic2d-input.md, .claude/context/settings-bindings.md, .claude/context/mode3d-learn.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/in-game-layout.md
Preconditions: 231, 232, 236
Feature: in-game-layout

---

## 246. Update documentation for feature `themed-board-art-and-motion`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-board-module.md, .claude/context/app-shell-themes.md, .claude/context/classic2d-tile-skin.md, .claude/context/classic2d-tile-motion.md, .claude/context/classic2d-board-motion.md, .claude/context/classic2d-board-view.md, .claude/context/rendering-board-art.md, .claude/context/app-shell-menu.md, .claude/context/app-shell-daily.md, .claude/context/replay-viewers.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/themed-board-art-and-motion.md
Preconditions: 224, 225, 226, 227
Feature: themed-board-art-and-motion

---

## 247. Update documentation for feature `theme-system`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-kit.md, .claude/context/app-shell-themes.md, .claude/context/settings-page.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/theme-system.md
Preconditions: 243
Feature: theme-system

---

## 248. Flat grid geometry contract and the square geometry

Status: [DONE]
Target: claude
Files: js/geometry/index.js, js/geometry/square.js, tests/geometry-square.test.mjs
Preconditions: none
Feature: flat-grid-geometry

---

## 249. Classic 2D board view on the grid geometry

Status: [DONE]
Target: claude
Files: js/classic2d/board-view.js, js/classic2d/motion-layer.js, js/classic2d/mode.js, js/shell/menu-preview.js, js/shell/daily.js, js/replay/viewer-2d.js, js/main.js, tests/classic2d-view.test.mjs
Preconditions: 248
Feature: flat-grid-geometry

---

## 250. Tile painter and cache through the geometry's outline

Status: [DONE]
Target: claude
Files: js/classic2d/tile-skin.js, js/classic2d/board-view.js, tests/tile-art.test.mjs, tests/classic2d-view.test.mjs
Preconditions: 249
Feature: flat-grid-geometry

---

## 251. Cursor moves and end effect on the grid geometry

Status: [DONE]
Target: claude
Files: js/classic2d/cursor-input.js, js/classic2d/end-effect.js, js/classic2d/pointer-input.js, js/classic2d/touch-input.js, js/classic2d/mode.js, tests/classic2d-cursor.test.mjs, tests/classic2d-end-effect.test.mjs
Preconditions: 249
Feature: flat-grid-geometry

---

## 252. 2D movement sampler and replay viewer in board units

Status: [DONE]
Target: claude
Files: js/replay/sampler-2d.js, js/replay/viewer-2d.js, js/replay/viewer.js, tests/replay-2d.test.mjs, tests/replay-viewer.test.mjs
Preconditions: 249
Feature: flat-grid-geometry

---

## 253. Update documentation for feature `flat-grid-geometry`

Status: [DONE]
Target: claude
Files: .claude/context/classic2d-board-view.md, .claude/context/classic2d-board-motion.md, .claude/context/classic2d-tile-skin.md, .claude/context/classic2d-input.md, .claude/context/classic2d-mode.md, .claude/context/replay-samplers.md, .claude/context/replay-viewers.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/flat-grid-geometry.md
Preconditions: 248, 249, 250, 251, 252
Feature: flat-grid-geometry

---

## 254. Hexagon graph provider and the `hex` generation description

Status: [DONE]
Target: claude
Files: js/engine/hex-grid.js, js/generation/generate.js, js/generation/start-cell.js, js/generation/worker.js, tests/engine-hex-grid.test.mjs, tests/generation-placer.test.mjs, tests/generation-noguess.test.mjs
Preconditions: none
Feature: hexagon-grid

---

## 255. Hexagon geometry

Status: [DONE]
Target: claude
Files: js/geometry/hex.js, js/geometry/index.js, tests/geometry-hex.test.mjs
Preconditions: 248
Feature: hexagon-grid

---

## 256. Hexagon boards, limits, identity and board-code token

Status: [DONE]
Target: claude
Files: js/hexagon/board-setup.js, js/records/board.js, js/records/board-code.js, tests/hexagon-board-setup.test.mjs, tests/records-board.test.mjs, tests/records-board-code.test.mjs, tests/generation-noguess.test.mjs, dev/measure-noguess-hex.mjs
Preconditions: 254
Feature: hexagon-grid

---

## 257. Update documentation for feature `hexagon-grid`

Status: [DONE]
Target: claude
Files: .claude/context/engine.md, .claude/context/generation.md, .claude/context/records.md, .claude/context/records-board-code.md, .claude/context/classic2d.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/hexagon-grid.md
Preconditions: 254, 255, 256
Feature: hexagon-grid

---

## 258. Triangle graph provider and the `tri` generation description

Status: [DONE]
Target: claude
Files: js/engine/tri-grid.js, js/generation/generate.js, js/generation/start-cell.js, js/generation/worker.js, js/generation/solver.js, tests/engine-tri-grid.test.mjs, tests/generation-solver.test.mjs, tests/generation-noguess.test.mjs
Preconditions: none
Feature: triangle-grid

---

## 259. Triangle geometry

Status: [DONE]
Target: claude
Files: js/geometry/tri.js, js/geometry/index.js, tests/geometry-tri.test.mjs
Preconditions: 248
Feature: triangle-grid

---

## 260. Triangle boards, limits, identity and board-code token

Status: [DONE]
Target: claude
Files: js/triangle/board-setup.js, js/records/board.js, js/records/board-code.js, tests/triangle-board-setup.test.mjs, tests/records-board.test.mjs, tests/records-board-code.test.mjs
Preconditions: 256, 258
Feature: triangle-grid

---

## 261. Update documentation for feature `triangle-grid`

Status: [DONE]
Target: claude
Files: .claude/context/engine.md, .claude/context/generation.md, .claude/context/records.md, .claude/context/records-board-code.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/triangle-grid.md
Preconditions: 258, 259, 260
Feature: triangle-grid

---

## 262. Hexagon and triangle outlines in the tile recipe

Status: [DONE]
Target: claude
Files: js/tile-art.js, tests/tile-art.test.mjs
Preconditions: none
Feature: hex-tri-board-art

---

## 263. Board module per-grid shape, numbers to 12, checks, and Joyful tiles' values

Status: [DONE]
Target: claude
Files: js/themes/board-module.js, themes/joyful-tiles/board.js, tests/fixtures/themes/fixture-theme.js, tests/fixtures/themes/fixture-dusk, tests/fixtures/themes/fixture-fonts, tests/fixtures/themes/broken-themes.js, tests/board-module.test.mjs, tests/theme-conformance.test.mjs
Preconditions: 255, 259, 262
Feature: hex-tri-board-art

---

## 264. The tile painter draws hexagon and triangle tiles

Status: [DONE]
Target: claude
Files: js/classic2d/tile-skin.js, js/classic2d/board-view.js, tests/classic2d-view.test.mjs, tests/tile-art.test.mjs
Preconditions: 250, 262, 263
Feature: hex-tri-board-art

---

## 265. The theme skill reads Hexagon and Triangle board sheets

Status: [DONE]
Target: claude
Files: .claude/skills/theme-implement/SKILL.md, .claude/skills/theme-implement/references/reading.md, .claude/skills/theme-implement/references/mapping.md, .claude/skills/theme-implement/references/verification.md, .claude/skills/theme-implement/references/stops.md
Preconditions: 263
Feature: hex-tri-board-art

---

## 266. Update documentation for feature `hex-tri-board-art`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-board-module.md, .claude/context/app-shell-themes.md, .claude/context/classic2d-tile-skin.md, .claude/context/classic2d-tile-motion.md, .claude/context/rendering-board-art.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/hex-tri-board-art.md
Preconditions: 262, 263, 264, 265
Feature: hex-tri-board-art

---

## 267. Flat mode configuration, with Classic 2D as the square configuration

Status: [DONE]
Target: claude
Files: js/flat-modes.js, js/classic2d/mode.js, js/classic2d/board-setup.js, js/classic2d/board-choice.js, js/classic2d/session.js, js/main.js, tests/flat-modes.test.mjs, tests/classic2d-mode.test.mjs
Preconditions: 249, 251, 252
Feature: flat-grid-modes

---

## 268. Hexagon and Triangle modes with their board choice screens

Status: [DONE]
Target: claude
Files: js/main.js, js/shell/router.js, index.html, css/style.css, js/classic2d/board-choice.js, js/flat-modes.js, tests/shell-router.test.mjs, tests/components-menu-screens.test.mjs, tests/shell-daily.test.mjs
Preconditions: 255, 256, 259, 260, 267, 284
Feature: flat-grid-modes

---

## 269. Play in Hexagon and Triangle

Status: [DONE]
Target: claude
Files: js/main.js, js/classic2d/mode.js, js/classic2d/session.js, js/ui.js, js/shell/live-figures.js, js/shell/first-use.js, js/results/, tests/flat-modes-play.test.mjs, tests/results.test.mjs
Preconditions: 264, 268, 286
Feature: flat-grid-modes

---

## 270. Board codes and challenge links for Hexagon and Triangle

Status: [DONE]
Target: claude
Files: js/shell/challenge.js, js/main.js, js/classic2d/board-choice.js, tests/shell-challenge.test.mjs
Preconditions: 268
Feature: flat-grid-modes

---

## 271. Update documentation for feature `flat-grid-modes`

Status: [DONE]
Target: claude
Files: .claude/context/classic2d.md, .claude/context/classic2d-mode.md, .claude/context/classic2d-session.md, .claude/context/app-shell-2d.md, .claude/context/app-shell-ui.md, .claude/context/app-shell-help.md, .claude/context/app-shell-results.md, .claude/context/app-shell-navigation.md, .claude/context/app-shell-markup.md, .claude/context/app-shell-daily.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/flat-grid-modes.md
Preconditions: 267, 268, 269, 270
Feature: flat-grid-modes

---

## 272. Records model and summaries for Hexagon and Triangle

Status: [DONE]
Target: claude
Files: js/records/model.js, js/records/summary.js, js/records/board.js, js/records/store.js, tests/records-model.test.mjs, tests/records-summary.test.mjs, tests/records-store.test.mjs
Preconditions: 256, 260, 269
Feature: flat-grid-records-replays

---

## 273. Records screen's mode switch over four modes

Status: [DONE]
Target: claude
Files: js/records/screen.js, js/main.js, index.html, tests/records-screen.test.mjs, tests/records-screen-3d.test.mjs
Preconditions: 272
Feature: flat-grid-records-replays

---

## 274. Replay format version with `hex` and `tri`, and the 2D recorder over them

Status: [DONE]
Target: claude
Files: js/replay/format.js, js/replay/recorder.js, js/replay/sampler-2d.js, js/classic2d/session.js, tests/replay-format.test.mjs, tests/replay-recorder.test.mjs, tests/replay-handoff.test.mjs
Preconditions: 254, 258, 269
Feature: flat-grid-records-replays

---

## 275. Playback of Hexagon and Triangle replays

Status: [DONE]
Target: claude
Files: js/replay/simulator.js, js/replay/verify.js, js/replay/viewer-2d.js, js/replay/viewer.js, js/replay/library.js, js/main.js, tests/replay-simulator.test.mjs, tests/replay-viewer.test.mjs, tests/replay-2d.test.mjs
Preconditions: 264, 274
Feature: flat-grid-records-replays

---

## 276. Update documentation for feature `flat-grid-records-replays`

Status: [DONE]
Target: claude
Files: .claude/context/records.md, .claude/context/records-store.md, .claude/context/records-screen.md, .claude/context/records-screen-view.md, .claude/context/records-library-view.md, .claude/context/replay.md, .claude/context/replay-samplers.md, .claude/context/replay-playback.md, .claude/context/replay-viewers.md, .claude/context/replay-viewer-screen.md, .claude/context/replay-library.md, .claude/context/app-shell-replay.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/flat-grid-records-replays.md
Preconditions: 272, 273, 274, 275
Feature: flat-grid-records-replays

---

## 277. Menu previews for Hexagon and Triangle

Status: [DONE]
Target: claude
Files: js/shell/menu-preview.js, js/shell/menu.js, js/main.js, tests/shell-menu.test.mjs, tests/components-menu-screens.test.mjs
Preconditions: 264, 268, 283
Feature: flat-grid-menu-entries

---

## 278. Menu routes, last mode played and Daily for Hexagon and Triangle

Status: [DONE]
Target: claude
Files: js/shell/menu.js, js/shell/returning.js, js/shell/daily.js, js/main.js, tests/shell-menu.test.mjs, tests/shell-returning.test.mjs, tests/shell-daily.test.mjs
Preconditions: 268, 283
Feature: flat-grid-menu-entries

---

## 280. Hexagon and Triangle daily boards on the Daily screen

Status: [DONE]
Target: claude
Files: js/records/board-code.js, js/shell/daily.js, js/shell/challenge.js, js/main.js, js/records/screen.js, tests/records-board-code.test.mjs, tests/shell-daily.test.mjs, tests/shell-challenge.test.mjs, tests/records-screen.test.mjs
Preconditions: 278, 270, 273, 277
Feature: flat-grid-menu-entries

---

## 279. Update documentation for feature `flat-grid-menu-entries`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-menu.md, .claude/context/app-shell-daily.md, .claude/context/records-board-code.md, .claude/context/records-screen.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/flat-grid-menu-entries.md
Preconditions: 277, 278, 280
Feature: flat-grid-menu-entries

---

## 281. Button colour rule: go and stop buttons

Status: [DONE]
Target: claude
Files: css/components.css, themes/joyful-tiles/theme.css, css/tokens.css, js/ui/kit-catalogue.js, js/ui/components.js, index.html, js/shell/pause.js, js/results/view.js, js/classic2d/board-choice.js, js/mode3d/board-choice.js, js/shell/daily.js, js/mode3d/learn.js, js/shell/lock-fallback.js, js/main.js, dev/components.html, tests/components.test.mjs, tests/theme-conformance.test.mjs, tests/components-pause.test.mjs, tests/components-ready.test.mjs
Preconditions: none
Feature: shared-screen-layout

---

## 282. Window title bar and game logo on every screen

Status: [DONE]
Target: claude
Files: index.html, css/components.css, css/style.css, themes/joyful-tiles/theme.css, js/ui/kit-catalogue.js, js/ui/components.js, js/ui.js, js/shell/router.js, js/shell/navigation.js, js/main.js, js/records/screen.js, dev/components.html, tests/components.test.mjs, tests/components-menu-screens.test.mjs, tests/theme-conformance.test.mjs, tests/shell-router.test.mjs, tests/shell-menu.test.mjs, tests/records-screen.test.mjs
Preconditions: 281
Feature: shared-screen-layout

---

## 283. Main menu redesign: play tiles with their own previews

Status: [DONE]
Target: claude
Files: index.html, css/components.css, css/style.css, themes/joyful-tiles/theme.css, css/tokens.css, js/shell/menu.js, js/shell/menu-preview.js, js/shell/returning.js, js/main.js, js/ui/kit-catalogue.js, js/ui/components.js, dev/components.html, tests/shell-menu.test.mjs, tests/components-menu-screens.test.mjs, tests/theme-conformance.test.mjs, tests/shell-pad-walk.test.mjs
Preconditions: 282
Feature: shared-screen-layout

---

## 284. Collapsible board choice panel, Classic 2D and 3D

Status: [DONE]
Target: claude
Files: index.html, css/components.css, css/style.css, themes/joyful-tiles/theme.css, js/classic2d/board-choice.js, js/mode3d/board-choice.js, js/shell/returning.js, js/main.js, js/ui/kit-catalogue.js, js/ui/components.js, dev/components.html, tests/mode3d-board-choice.test.mjs, tests/components-menu-screens.test.mjs, tests/shell-challenge.test.mjs, tests/shell-returning.test.mjs, tests/theme-conformance.test.mjs
Preconditions: 282
Feature: shared-screen-layout

---

## 285. Update documentation for feature `shared-screen-layout`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-kit.md, .claude/context/app-shell-kit-layout.md, .claude/context/app-shell-menu.md, .claude/context/app-shell-menu-preview.md, .claude/context/app-shell-focus.md, .claude/context/app-shell-pause.md, .claude/context/app-shell-results-view.md, .claude/context/classic2d.md, .claude/context/mode3d.md, .claude/context/platform.md, .claude/context/records-screen-view.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/shared-screen-layout.md
Preconditions: 281, 282, 283, 284
Feature: shared-screen-layout

---

## 286. Classic 2D game window: title bar with Pause, mode in the footer, collapsed live figures

Status: [DONE]
Target: claude
Files: index.html, css/style.css, css/components.css, themes/joyful-tiles/theme.css, js/classic2d/mode.js, js/ui.js, js/ui/components.js, js/main.js, js/shell/live-figures.js, tests/classic2d-mode.test.mjs, tests/components.test.mjs, tests/live-figures.test.mjs
Preconditions: 281, 282, 284
Feature: in-game-layout

---

## 287. 3D game overlay without a title: floating Pause and live-figures toggle

Status: [DONE]
Target: claude
Files: index.html, css/style.css, css/components.css, themes/joyful-tiles/theme.css, js/ui.js, js/shell/mode-3d.js, js/mode3d/session.js, js/mode3d/learn.js, js/touch-3d.js, js/main.js, tests/shell-mode-3d.test.mjs, tests/components-game3d.test.mjs, tests/components-ready.test.mjs, tests/components.test.mjs
Preconditions: 286
Feature: in-game-layout

---

## 288. Update documentation for feature `in-game-layout`

Status: [DONE]
Target: claude
Files: .claude/context/classic2d-mode.md, .claude/context/app-shell-2d.md, .claude/context/app-shell-hud.md, .claude/context/app-shell-ui.md, .claude/context/app-shell-3d.md, .claude/context/mode3d-learn.md, .claude/context/platform.md, .claude/context/testing.md, .claude/context/INDEX.md, .claude/domain/features/in-game-layout.md
Preconditions: 286, 287
Feature: in-game-layout

---

## 289. Size steps from the available area

Status: [DONE]
Target: claude
Files: css/style.css, css/components.css, css/tokens.css, themes/joyful-tiles/theme.css, index.html, js/main.js, tests/components.test.mjs
Preconditions: none
Feature: shared-screen-layout

---

## 290. Natural screen sizes

Status: [DONE]
Target: claude
Files: css/style.css, css/components.css, themes/joyful-tiles/theme.css, index.html, js/shell/menu.js, tests/components.test.mjs
Preconditions: 289
Feature: shared-screen-layout

---

## 291. Game windows against the available area

Status: [DONE]
Target: claude
Files: js/ui.js, js/main.js, css/style.css, js/classic2d/board-view.js, .claude/domain/features/in-game-layout.md
Preconditions: 289
Feature: in-game-layout

---

## 292. Update documentation for feature `shared-screen-layout`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell-kit-layout.md, .claude/context/app-shell-kit.md, .claude/context/app-shell-menu.md, .claude/context/records-screen-view.md, .claude/context/settings-page.md, .claude/context/replay-viewer-view.md, .claude/context/platform.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 289, 290
Feature: shared-screen-layout

---

## 293. Update documentation for feature `in-game-layout`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell-2d.md, .claude/context/app-shell-3d.md, .claude/context/classic2d-board-view.md, .claude/context/app-shell-hud.md, .claude/context/INDEX.md
Preconditions: 291
Feature: in-game-layout

---
