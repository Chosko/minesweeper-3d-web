# Tasks

Last task number: 47

---

## 1. Token sheet with light and dark values

Status: [MISSING]
Target: claude
Files: css/tokens.css, css/style.css, index.html, tests/tokens.test.mjs, .claude/domain/features/design-tokens-and-themes.md
Preconditions: none
Feature: design-tokens-and-themes

---

## 2. Theme applier and token reader

Status: [MISSING]
Target: claude
Files: js/theme.js, js/tokens.js, index.html, tests/theme.test.mjs
Preconditions: 1
Feature: design-tokens-and-themes

---

## 3. Update documentation for feature `design-tokens-and-themes`

Status: [MISSING]
Target: claude
Files: .claude/context/app-shell.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 1, 2
Feature: design-tokens-and-themes

---

## 4. Cell graph and square-grid provider

Status: [MISSING]
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
Target: claude+human
Files: tests/fidelity/minesweeper-online.md, tests/engine-fidelity.test.mjs, js/engine/rules.js, js/engine/profiles.js, js/engine/metrics.js, .claude/domain/features/cell-graph-rules-engine.md
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
Target: claude+human
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
