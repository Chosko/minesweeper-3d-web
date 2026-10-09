# Tasks

Last task number: 8

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
