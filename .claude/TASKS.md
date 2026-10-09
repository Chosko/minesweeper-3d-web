# Tasks

Last task number: 20

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
