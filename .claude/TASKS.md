# Tasks

Last task number: 114

---

## 1. Token sheet with light and dark values

Status: [DONE]
Target: claude
Files: css/tokens.css, css/style.css, index.html, tests/tokens.test.mjs, .claude/domain/features/design-tokens-and-themes.md
Preconditions: none
Feature: design-tokens-and-themes

---

## 2. Theme applier and token reader

Status: [DONE]
Target: claude
Files: js/theme.js, js/tokens.js, index.html, tests/theme.test.mjs
Preconditions: 1
Feature: design-tokens-and-themes

---

## 3. Update documentation for feature `design-tokens-and-themes`

Status: [DONE]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 1, 2
Feature: design-tokens-and-themes

---

## 4. Cell graph and square-grid provider

Status: [DONE]
Target: claude
Files: js/engine/graph.js, js/engine/square-grid.js, tests/engine-graph.test.mjs
Preconditions: none
Feature: cell-graph-rules-engine

---

## 5. Rules engine: game state, actions and the first-click hand-off

Status: [MISSING]
Target: claude
Files: js/engine/rules.js, js/engine/profiles.js, tests/engine-rules.test.mjs
Preconditions: 4
Feature: cell-graph-rules-engine

---

## 6. Board metrics, click counts and the game summary

Status: [MISSING]
Target: claude
Files: js/engine/metrics.js, js/engine/rules.js, js/engine/profiles.js, tests/engine-metrics.test.mjs
Preconditions: 5
Feature: cell-graph-rules-engine

---

## 7. Fidelity tests for the reference ruleset

Status: [MISSING]
Target: claude
Files: tests/fidelity/minesweeper-online.md, tests/engine-fidelity.test.mjs, js/engine/rules.js, js/engine/profiles.js, js/engine/metrics.js
Preconditions: 5, 6
Feature: cell-graph-rules-engine

---

## 8. Update documentation for feature `cell-graph-rules-engine`

Status: [MISSING]
Target: claude
Files: .claude/context/engine.md, .claude/context/INDEX.md, .claude/context/logic.md, .claude/context/testing.md
Preconditions: 4, 5, 6, 7
Feature: cell-graph-rules-engine

---

## 9. Seeded source and standard mine placer

Status: [MISSING]
Target: claude
Files: js/generation/random.js, js/generation/placer.js, tests/generation-placer.test.mjs
Preconditions: 4, 5
Feature: board-generation

---

## 10. Logic-only solver

Status: [MISSING]
Target: claude
Files: js/generation/solver.js, tests/generation-solver.test.mjs
Preconditions: 4
Feature: board-generation

---

## 11. No-guess generation loop and attempt budget

Status: [MISSING]
Target: claude
Files: js/generation/generate.js, tests/generation-noguess.test.mjs, .claude/domain/features/board-generation.md
Preconditions: 9, 10
Feature: board-generation

---

## 12. Generation worker and message protocol

Status: [MISSING]
Target: claude
Files: js/generation/worker.js, js/generation/client.js, tests/generation-client.test.mjs
Preconditions: 11
Feature: board-generation

---

## 13. Update documentation for feature `board-generation`

Status: [MISSING]
Target: claude
Files: .claude/context/generation.md, .claude/context/INDEX.md, .claude/context/testing.md
Preconditions: 9, 10, 11, 12
Feature: board-generation

---

## 14. Storage interface and document versioning

Status: [MISSING]
Target: claude
Files: js/platform/storage.js, js/platform/memory-backend.js, tests/platform-storage.test.mjs
Preconditions: none
Feature: platform-storage

---

## 15. Browser storage implementation and start-up selection

Status: [MISSING]
Target: claude
Files: js/platform/browser-backend.js, js/platform/index.js, tests/platform-browser.test.mjs
Preconditions: 14
Feature: platform-storage

---

## 16. Update documentation for feature `platform-storage`

Status: [MISSING]
Target: claude
Files: .claude/context/platform.md, .claude/context/INDEX.md, .claude/context/testing.md
Preconditions: 14, 15
Feature: platform-storage

---

## 17. Component kit: styles, markup patterns and focus contract

Status: [MISSING]
Target: claude
Files: css/components.css, js/ui/components.js, dev/components.html, tests/components.test.mjs, index.html
Preconditions: 1, 2
Feature: screen-components

---

## 18. In-game overlay bar component

Status: [MISSING]
Target: claude
Files: css/components.css, index.html, js/ui.js, css/style.css, dev/components.html
Preconditions: 17
Feature: screen-components

---

## 19. Main menu, pause card and results layout from the kit

Status: [MISSING]
Target: claude
Files: index.html, css/style.css, css/components.css, js/ui.js, js/main.js
Preconditions: 17, 18
Feature: screen-components

---

## 20. Update documentation for feature `screen-components`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 17, 18, 19
Feature: screen-components

---

## 21. Tile and number colour tokens

Status: [MISSING]
Target: claude
Files: css/tokens.css, tests/tokens.test.mjs
Preconditions: 1
Feature: square-tile-skin

---

## 22. Tile painter, tile cache and minimum tile size

Status: [MISSING]
Target: claude
Files: js/classic2d/tile-skin.js, tests/tile-skin.test.mjs, .claude/domain/features/square-tile-skin.md
Preconditions: 2, 5, 21
Feature: square-tile-skin

---

## 23. Update documentation for feature `square-tile-skin`

Status: [MISSING]
Target: claude
Files: .claude/context/classic2d.md, .claude/context/INDEX.md, .claude/context/testing.md, .claude/context/rendering.md
Preconditions: 21, 22
Feature: square-tile-skin

---

## 24. Screen router and shell navigation

Status: [MISSING]
Target: claude
Files: js/shell/router.js, js/shell/navigation.js, js/main.js, js/ui.js, index.html, tests/shell-router.test.mjs
Preconditions: 19
Feature: game-shell

---

## 25. Mode host contract and the 3D adapter

Status: [MISSING]
Target: claude
Files: js/shell/mode-host.js, js/shell/mode-3d.js, js/main.js, js/ui.js, tests/shell-mode-host.test.mjs
Preconditions: 24
Feature: game-shell

---

## 26. Main menu entries and the last mode played

Status: [MISSING]
Target: claude
Files: index.html, js/shell/menu.js, js/ui.js, css/components.css, tests/shell-menu.test.mjs
Preconditions: 15, 24, 25
Feature: game-shell

---

## 27. Pause controller, restart, back to menu and game hand-offs

Status: [MISSING]
Target: claude
Files: js/shell/pause.js, js/shell/mode-host.js, js/shell/mode-3d.js, js/main.js, index.html, tests/shell-pause.test.mjs
Preconditions: 25
Feature: game-shell

---

## 28. Update documentation for feature `game-shell`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/input.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 24, 25, 26, 27
Feature: game-shell

---

## 29. Board identity, board key and display label

Status: [MISSING]
Target: claude
Files: js/records/board.js, tests/records-board.test.mjs
Preconditions: none
Feature: game-summary

---

## 30. Summary builder, derived stats and best eligibility

Status: [MISSING]
Target: claude
Files: js/records/summary.js, tests/records-summary.test.mjs
Preconditions: 6, 29
Feature: game-summary

---

## 31. Update documentation for feature `game-summary`

Status: [MISSING]
Target: claude
Files: .claude/context/records.md, .claude/context/INDEX.md, .claude/context/testing.md
Preconditions: 29, 30
Feature: game-summary

---

## 32. Classic 2D board setup, game session and timer

Status: [MISSING]
Target: claude
Files: js/classic2d/session.js, js/classic2d/board-setup.js, js/engine/profiles.js, tests/classic2d-session.test.mjs, .claude/domain/features/board-generation.md, .claude/domain/features/classic-2d-square-play.md
Preconditions: 5, 6, 12, 15, 30
Feature: classic-2d-square-play

---

## 33. Classic 2D Canvas board view

Status: [MISSING]
Target: claude
Files: js/classic2d/board-view.js, tests/classic2d-view.test.mjs
Preconditions: 22, 32
Feature: classic-2d-square-play

---

## 34. Classic 2D pointer input state machine

Status: [MISSING]
Target: claude
Files: js/classic2d/pointer-input.js, js/classic2d/board-view.js, js/engine/profiles.js, tests/classic2d-pointer.test.mjs
Preconditions: 33
Feature: classic-2d-square-play

---

## 35. Classic 2D keyboard and controller cursor

Status: [MISSING]
Target: claude
Files: js/classic2d/cursor-input.js, js/classic2d/board-view.js, tests/classic2d-cursor.test.mjs, .claude/domain/features/classic-2d-square-play.md
Preconditions: 24, 33
Feature: classic-2d-square-play

---

## 36. Classic 2D mode: board choice screen and shell integration

Status: [MISSING]
Target: claude
Files: js/classic2d/mode.js, js/classic2d/board-choice.js, index.html, js/shell/menu.js, css/components.css, tests/classic2d-mode.test.mjs
Preconditions: 18, 26, 27, 32, 33
Feature: classic-2d-square-play

---

## 37. Classic 2D input fidelity tests

Status: [MISSING]
Target: claude
Files: tests/fidelity/minesweeper-online.md, tests/classic2d-fidelity.test.mjs, js/classic2d/pointer-input.js, js/classic2d/board-setup.js, js/engine/profiles.js
Preconditions: 7, 34, 36
Feature: classic-2d-square-play

---

## 38. Update documentation for feature `classic-2d-square-play`

Status: [MISSING]
Target: claude
Files: .claude/context/classic2d.md, .claude/context/INDEX.md, .claude/context/testing.md, .claude/context/app-shell.md, README.md
Preconditions: 32, 33, 34, 35, 36, 37
Feature: classic-2d-square-play

---

## 39. Settings schema and store

Status: [MISSING]
Target: claude
Files: js/settings/schema.js, js/settings/store.js, tests/settings-store.test.mjs
Preconditions: 15
Feature: settings

---

## 40. Settings appliers: theme, audio, look, resolution, fullscreen

Status: [MISSING]
Target: claude
Files: js/settings/appliers.js, js/theme.js, js/audio.js, js/ui.js, js/render.js, js/main.js, tests/settings-appliers.test.mjs
Preconditions: 2, 39
Feature: settings

---

## 41. Settings page and pause-card shortcuts

Status: [MISSING]
Target: claude
Files: js/settings/page.js, js/settings/bindings.js, index.html, js/ui.js, js/shell/menu.js, css/components.css, tests/settings-page.test.mjs
Preconditions: 26, 27, 39, 40
Feature: settings

---

## 42. Update documentation for feature `settings`

Status: [MISSING]
Target: claude
Files: .claude/context/settings.md, .claude/context/app-shell.md, .claude/context/audio.md, .claude/context/rendering.md, .claude/context/INDEX.md, .claude/context/testing.md
Preconditions: 39, 40, 41
Feature: settings

---

## 43. Records model: bests, counters, history and comparison

Status: [MISSING]
Target: claude
Files: js/records/model.js, tests/records-model.test.mjs
Preconditions: 30
Feature: personal-records

---

## 44. Records store: persistence, recovery and the abandoned-game hook

Status: [MISSING]
Target: claude
Files: js/records/store.js, js/shell/pause.js, tests/records-store.test.mjs
Preconditions: 15, 27, 43
Feature: personal-records

---

## 45. Update documentation for feature `personal-records`

Status: [MISSING]
Target: claude
Files: .claude/context/records.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 43, 44
Feature: personal-records

---

## 46. Results flow and results view

Status: [MISSING]
Target: claude
Files: js/results/flow.js, js/results/view.js, index.html, css/components.css, tests/results.test.mjs
Preconditions: 19, 27, 36, 44
Feature: results-screen

---

## 47. Update documentation for feature `results-screen`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 46
Feature: results-screen

---

## 48. Records view: board picker and figures

Status: [MISSING]
Target: claude
Files: js/records/screen.js, index.html, js/shell/menu.js, css/components.css, tests/records-screen.test.mjs
Preconditions: 26, 44, 46
Feature: records-screen

---

## 49. Records history chart and recent games list

Status: [MISSING]
Target: claude
Files: js/records/history-chart.js, js/records/screen.js, tests/records-history.test.mjs
Preconditions: 2, 48
Feature: records-screen

---

## 50. Update documentation for feature `records-screen`

Status: [MISSING]
Target: claude
Files: .claude/context/records.md, .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 48, 49
Feature: records-screen

---

## 51. Box graph provider

Status: [MISSING]
Target: claude
Files: js/engine/box-grid.js, tests/engine-box-grid.test.mjs
Preconditions: 4
Feature: 3d-board-graph

---

## 52. 3D rule profile: revealed-cell flagging, chord, auto-hide and win

Status: [MISSING]
Target: claude
Files: js/engine/profiles.js, js/engine/rules.js, js/engine/metrics.js, tests/engine-3d-profile.test.mjs
Preconditions: 5, 6, 51
Feature: 3d-board-graph

---

## 53. 3D state view and the large-board memory check

Status: [MISSING]
Target: claude
Files: js/engine/state-view-3d.js, tests/engine-3d-view.test.mjs, .claude/domain/features/3d-board-graph.md
Preconditions: 52
Feature: 3d-board-graph

---

## 54. 3D front-end on the shared engine and retirement of the 3D engine

Status: [MISSING]
Target: claude
Files: js/main.js, js/render.js, js/picking.js, js/ui.js, js/shell/mode-3d.js, js/logic.js, tests/logic.test.mjs
Preconditions: 9, 25, 27, 53
Feature: 3d-board-graph

---

## 55. Update documentation for feature `3d-board-graph`

Status: [MISSING]
Target: claude
Files: .claude/context/engine.md, .claude/context/logic.md, .claude/context/rendering.md, .claude/context/input.md, .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 51, 52, 53, 54
Feature: 3d-board-graph

---

## 56. 3D board choice: presets, custom boards and the no-guess switch

Status: [MISSING]
Target: claude
Files: js/mode3d/board-choice.js, index.html, js/ui.js, js/shell/menu.js, css/components.css, tests/mode3d-board-choice.test.mjs
Preconditions: 26, 54
Feature: 3d-play-flow

---

## 57. 3D game session: safe first click, generation and timer

Status: [MISSING]
Target: claude
Files: js/mode3d/session.js, js/main.js, js/ui.js, js/shell/mode-3d.js, tests/mode3d-session.test.mjs
Preconditions: 12, 54, 56
Feature: 3d-play-flow

---

## 58. No-guess cell-count limit for 3D boards

Status: [MISSING]
Target: claude
Files: js/mode3d/board-choice.js, dev/measure-noguess-3d.mjs, tests/mode3d-noguess-limit.test.mjs, .claude/domain/features/3d-play-flow.md
Preconditions: 11, 57
Feature: 3d-play-flow

---

## 59. 3D mode adapter on the session

Status: [MISSING]
Target: claude
Files: js/shell/mode-3d.js, js/shell/mode-host.js, js/main.js, tests/shell-mode-3d.test.mjs
Preconditions: 27, 30, 57
Feature: 3d-play-flow

---

## 60. Update documentation for feature `3d-play-flow`

Status: [MISSING]
Target: claude
Files: .claude/context/mode3d.md, .claude/context/app-shell.md, .claude/context/input.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 56, 57, 58, 59
Feature: 3d-play-flow

---

## 61. 3D board identity, board key and labels

Status: [MISSING]
Target: claude
Files: js/records/board.js, tests/records-board-3d.test.mjs
Preconditions: 29, 56
Feature: 3d-game-records

---

## 62. 3D summaries and the 3D mode's summary hand-off

Status: [MISSING]
Target: claude
Files: js/records/summary.js, js/shell/mode-3d.js, tests/records-summary-3d.test.mjs, .claude/domain/features/3d-game-records.md
Preconditions: 7, 30, 52, 59, 61
Feature: 3d-game-records

---

## 63. Per-mode counters, mode-filtered board listing and the records format step

Status: [MISSING]
Target: claude
Files: js/records/model.js, js/records/store.js, tests/records-model-3d.test.mjs
Preconditions: 43, 44, 61
Feature: 3d-game-records

---

## 64. Update documentation for feature `3d-game-records`

Status: [MISSING]
Target: claude
Files: .claude/context/records.md, .claude/context/mode3d.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 61, 62, 63
Feature: 3d-game-records

---

## 65. Replay format: header, streams, encoder and decoder

Status: [MISSING]
Target: claude
Files: js/replay/format.js, tests/replay-format.test.mjs
Preconditions: 5, 29, 61
Feature: replay-recording

---

## 66. Recorder and sealer

Status: [MISSING]
Target: claude
Files: js/replay/recorder.js, tests/replay-recorder.test.mjs
Preconditions: 30, 53, 65
Feature: replay-recording

---

## 67. Classic 2D capture and the replay on the mode contract

Status: [MISSING]
Target: claude
Files: js/replay/sampler-2d.js, js/classic2d/session.js, js/classic2d/mode.js, js/shell/mode-host.js, js/shell/pause.js, tests/replay-2d.test.mjs
Preconditions: 35, 36, 66
Feature: replay-recording

---

## 68. 3D capture: recorder and camera sampler

Status: [MISSING]
Target: claude
Files: js/replay/sampler-3d.js, js/mode3d/session.js, js/shell/mode-3d.js, tests/replay-3d.test.mjs
Preconditions: 62, 66, 67
Feature: replay-recording

---

## 69. Replay determinism tests and the measured recording constants

Status: [MISSING]
Target: claude
Files: tests/replay-determinism.test.mjs, tests/fixtures/replays/, dev/measure-replays.mjs, js/replay/recorder.js, js/replay/format.js, js/replay/sampler-2d.js, js/replay/sampler-3d.js, .claude/domain/features/replay-recording.md
Preconditions: 67, 68
Feature: replay-recording

---

## 70. Update documentation for feature `replay-recording`

Status: [MISSING]
Target: claude
Files: .claude/context/replay.md, .claude/context/app-shell.md, .claude/context/classic2d.md, .claude/context/mode3d.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 65, 66, 67, 68, 69
Feature: replay-recording

---

## 71. Replay store: blob interface, in-memory and IndexedDB implementations

Status: [MISSING]
Target: claude
Files: js/platform/blob-store.js, js/platform/memory-blob-store.js, js/platform/indexeddb-blob-store.js, js/platform/index.js, tests/platform-blob-store.test.mjs
Preconditions: 14, 15
Feature: replay-library

---

## 72. Replay library: index, retention, pinning and recovery

Status: [MISSING]
Target: claude
Files: js/replay/library.js, tests/replay-library.test.mjs
Preconditions: 65, 71
Feature: replay-library

---

## 73. End-of-game hand-off to the replay library

Status: [MISSING]
Target: claude
Files: js/results/flow.js, js/shell/pause.js, tests/replay-handoff.test.mjs
Preconditions: 44, 46, 63, 67, 68, 72
Feature: replay-library

---

## 74. Library view in the Records screen

Status: [MISSING]
Target: claude
Files: js/records/replay-list.js, js/records/screen.js, css/components.css, index.html, tests/records-replays.test.mjs
Preconditions: 48, 49, 72
Feature: replay-library

---

## 75. Update documentation for feature `replay-library`

Status: [MISSING]
Target: claude
Files: .claude/context/platform.md, .claude/context/replay.md, .claude/context/app-shell.md, .claude/context/records.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 71, 72, 73, 74
Feature: replay-library

---

## 76. Replay simulator and verifier

Status: [MISSING]
Target: claude
Files: js/replay/simulator.js, js/replay/verify.js, tests/replay-simulator.test.mjs, .claude/domain/features/replay-playback.md
Preconditions: 53, 65, 69
Feature: replay-playback

---

## 77. Replay viewer screen with the 2D viewer, controls and overlay

Status: [MISSING]
Target: claude
Files: js/replay/viewer.js, js/replay/clock.js, js/replay/viewer-2d.js, js/shell/router.js, index.html, css/components.css, tests/replay-viewer.test.mjs
Preconditions: 18, 24, 33, 46, 72, 76
Feature: replay-playback

---

## 78. 3D replay viewer

Status: [MISSING]
Target: claude
Files: js/replay/viewer-3d.js, js/replay/viewer.js, js/render.js, js/main.js, tests/replay-viewer-3d.test.mjs
Preconditions: 59, 77
Feature: replay-playback

---

## 79. Watch replay on the results screen and from the library

Status: [MISSING]
Target: claude
Files: js/results/view.js, js/results/flow.js, js/records/replay-list.js, tests/results-watch.test.mjs
Preconditions: 73, 74, 77
Feature: replay-playback

---

## 80. Update documentation for feature `replay-playback`

Status: [MISSING]
Target: claude
Files: .claude/context/replay.md, .claude/context/app-shell.md, .claude/context/rendering.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 76, 77, 78, 79
Feature: replay-playback

---

## 81. 3D end sequence and the results takeover

Status: [MISSING]
Target: claude
Files: js/mode3d/session.js, js/shell/mode-3d.js, js/main.js, js/ui.js, js/render.js, index.html, js/results/view.js, css/components.css, tests/mode3d-end.test.mjs
Preconditions: 46, 62, 68
Feature: 3d-results-records-screens

---

## 82. Records 2D | 3D switch and the 3D board picker

Status: [MISSING]
Target: claude
Files: js/records/screen.js, js/records/replay-list.js, js/results/view.js, index.html, css/components.css, tests/records-screen-3d.test.mjs
Preconditions: 49, 61, 63, 74
Feature: 3d-results-records-screens

---

## 83. Update documentation for feature `3d-results-records-screens`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/mode3d.md, .claude/context/rendering.md, .claude/context/records.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 81, 82
Feature: 3d-results-records-screens

---

## 84. Electron main process: window, game protocol, window state and crash log

Status: [MISSING]
Target: claude
Files: desktop/package.json, desktop/main.js, desktop/protocol.js, desktop/window-state.js, desktop/crash-log.js, desktop/closing.js, tests/desktop-main.test.mjs
Preconditions: none
Feature: steam-desktop-host

---

## 85. Steamworks capability adapter, unavailable implementation and the page bridge

Status: [MISSING]
Target: claude
Files: desktop/adapter/interface.js, desktop/adapter/unavailable.js, desktop/preload.js, desktop/bridge.js, desktop/main.js, desktop/closing.js, tests/desktop-bridge.test.mjs
Preconditions: 84
Feature: steam-desktop-host

---

## 86. Page platform selection, capability flags, overlay pause and the quit flush

Status: [MISSING]
Target: claude
Files: js/platform/index.js, js/platform/capabilities.js, js/platform/bridge-client.js, js/shell/pause.js, js/main.js, desktop/closing.js, tests/platform-selection.test.mjs
Preconditions: 15, 27, 71, 85
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
Files: .claude/context/desktop.md, .claude/context/platform.md, .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
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
Preconditions: 14, 71, 86, 91
Feature: steam-cloud-saves

---

## 93. Steam Auto-Cloud configuration and quota

Status: [MISSING]
Target: claude+human
Files: dev/measure-cloud-quota.mjs, .claude/domain/features/steam-cloud-saves.md, .claude/domain/features/replay-library.md
Preconditions: 72, 87, 92
Feature: steam-cloud-saves

---

## 94. Update documentation for feature `steam-cloud-saves`

Status: [MISSING]
Target: claude
Files: .claude/context/desktop.md, .claude/context/platform.md, .claude/context/replay.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 91, 92, 93
Feature: steam-cloud-saves

---

## 95. Leaderboard catalogue, eligibility and score details

Status: [MISSING]
Target: claude
Files: js/leaderboards/catalogue.js, js/leaderboards/details.js, js/leaderboards/eligibility.js, tests/leaderboards-catalogue.test.mjs
Preconditions: 30, 61, 62
Feature: steam-leaderboards

---

## 96. Leaderboard outbox, verifier gate and submission state

Status: [MISSING]
Target: claude
Files: js/leaderboards/outbox.js, js/leaderboards/submit.js, js/leaderboards/state.js, js/results/flow.js, tests/leaderboards-submit.test.mjs
Preconditions: 14, 71, 73, 76, 95
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
Preconditions: 44, 72, 86, 95
Feature: steam-leaderboards

---

## 99. Update documentation for feature `steam-leaderboards`

Status: [MISSING]
Target: claude
Files: .claude/context/leaderboards.md, .claude/context/app-shell.md, .claude/context/platform.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 95, 96, 97, 98
Feature: steam-leaderboards

---

## 100. Achievement catalogue and evaluator

Status: [MISSING]
Target: claude
Files: js/achievements/catalogue.js, js/achievements/evaluate.js, tests/achievements-evaluate.test.mjs, .claude/domain/features/steam-achievements.md
Preconditions: 30, 43, 62
Feature: steam-achievements

---

## 101. Achievement unlocker, catch-up and the end-of-game hook

Status: [MISSING]
Target: claude
Files: js/achievements/unlock.js, js/achievements/index.js, js/results/flow.js, js/platform/index.js, tests/achievements-unlock.test.mjs
Preconditions: 44, 73, 86, 100
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
Files: .claude/context/achievements.md, .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 100, 101, 102
Feature: steam-achievements

---

## 104. Leaderboard screen: board picker, scope tabs, entries and states

Status: [MISSING]
Target: claude
Files: js/leaderboards/screen.js, js/shell/router.js, index.html, css/components.css, tests/leaderboards-screen.test.mjs, .claude/domain/features/leaderboard-screen.md, .claude/domain/features/steam-leaderboards.md
Preconditions: 17, 24, 61, 97, 98
Feature: leaderboard-screen

---

## 105. Watch replay from a leaderboard entry

Status: [MISSING]
Target: claude
Files: js/leaderboards/screen.js, js/replay/viewer.js, js/shell/router.js, tests/leaderboards-screen.test.mjs
Preconditions: 77, 78, 104
Feature: leaderboard-screen

---

## 106. Update documentation for feature `leaderboard-screen`

Status: [MISSING]
Target: claude
Files: .claude/context/leaderboards.md, .claude/context/app-shell.md, .claude/context/replay.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 104, 105
Feature: leaderboard-screen

---

## 107. Leaderboards and Quit entries in the main menu

Status: [MISSING]
Target: claude
Files: js/shell/menu.js, index.html, js/shell/router.js, tests/shell-menu.test.mjs
Preconditions: 26, 86, 104
Feature: leaderboards-menu-entry

---

## 108. Update documentation for feature `leaderboards-menu-entry`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/testing.md, README.md
Preconditions: 107
Feature: leaderboards-menu-entry

---

## 109. Steam rank panel on the results screen

Status: [MISSING]
Target: claude
Files: js/results/rank-panel.js, js/results/view.js, js/results/flow.js, css/components.css, index.html, tests/results-rank.test.mjs
Preconditions: 46, 81, 86, 97, 104
Feature: results-steam-rank

---

## 110. Update documentation for feature `results-steam-rank`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/leaderboards.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 109
Feature: results-steam-rank

---

## 111. Action catalogue, bindings resolver and the bindings setting

Status: [MISSING]
Target: claude
Files: js/settings/bindings.js, js/settings/resolver.js, js/settings/schema.js, js/settings/store.js, js/ui.js, tests/settings-bindings.test.mjs
Preconditions: 35, 39, 41
Feature: input-rebinding

---

## 112. Classic 2D and 3D input read their actions through the bindings

Status: [MISSING]
Target: claude
Files: js/input.js, js/controls.js, js/main.js, js/shell/mode-3d.js, js/classic2d/pointer-input.js, js/classic2d/cursor-input.js, tests/input-bindings.test.mjs
Preconditions: 37, 59, 111
Feature: input-rebinding

---

## 113. Rebinding controls on the Settings page

Status: [MISSING]
Target: claude
Files: js/settings/page.js, js/settings/rebind-panel.js, index.html, css/components.css, tests/settings-rebind.test.mjs
Preconditions: 111, 112
Feature: input-rebinding

---

## 114. Update documentation for feature `input-rebinding`

Status: [MISSING]
Target: claude
Files: README.md, .claude/context/input.md, .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 111, 112, 113
Feature: input-rebinding

---
