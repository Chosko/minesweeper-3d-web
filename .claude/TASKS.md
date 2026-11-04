# Tasks

Last task number: 301

---

## 93. Steam Auto-Cloud configuration and quota fit check

Status: [DONE]
Target: claude+human
Files: dev/measure-cloud-quota.mjs, .claude/domain/features/steam-cloud-saves.md, .claude/domain/features/replay-library.md
Preconditions: none
Feature: steam-cloud-saves

---

## 98. Local leaderboards stand-in for the web build

Status: [DONE]
Target: claude
Files: js/leaderboards/local.js, js/leaderboards/index.js, js/platform/index.js, tests/leaderboards-local.test.mjs
Preconditions: none
Feature: steam-leaderboards

---

## 99. Update documentation for feature `steam-leaderboards`

Status: [DONE]
Target: claude
Files: .claude/context/leaderboards.md, .claude/context/app-shell-results.md, .claude/context/platform.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 98
Feature: steam-leaderboards

---

## 100. Achievement catalogue and evaluator

Status: [DONE]
Target: claude
Files: js/achievements/catalogue.js, js/achievements/evaluate.js, tests/achievements-evaluate.test.mjs, .claude/domain/features/steam-achievements.md
Preconditions: none
Feature: steam-achievements

---

## 101. Achievement unlocker, catch-up and the end-of-game hook

Status: [MISSING]
Target: claude
Files: js/achievements/unlock.js, js/achievements/index.js, js/results/flow.js, js/platform/index.js, tests/achievements-unlock.test.mjs
Preconditions: 100
Feature: steam-achievements

---

## 102. Steamworks achievement definitions, threshold calibration and overlay check

Status: [MISSING]
Target: claude+human
Files: js/achievements/catalogue.js, tests/achievements-evaluate.test.mjs, .claude/domain/features/steam-achievements.md
Preconditions: 101
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
Preconditions: 98
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
Preconditions: 104, 105
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
Preconditions: 104
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
Preconditions: none
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
Preconditions: 111, 112
Feature: input-rebinding

---

## 114. Update documentation for feature `input-rebinding`

Status: [MISSING]
Target: claude
Files: README.md, .claude/context/input.md, .claude/context/app-shell-ui.md, .claude/context/testing.md, .claude/context/INDEX.md
Preconditions: 111, 112, 113
Feature: input-rebinding

---

## 299. Update documentation for feature `steam-cloud-saves`

Status: [DONE]
Target: claude
Files: .claude/context/desktop.md, .claude/context/platform.md, .claude/context/replay-library.md, .claude/context/settings-appliers.md, .claude/context/testing.md, .claude/context/INDEX.md, README.md
Preconditions: 93
Feature: steam-cloud-saves

---

## 300. Steam build's Data panel says the data is kept on this computer

Status: [DONE]
Target: claude
Files: js/settings/page.js, tests/settings-page.test.mjs
Preconditions: none
Feature: steam-desktop-host

---

## 301. Update documentation for feature `steam-desktop-host`

Status: [DONE]
Target: claude
Files: .claude/context/settings-page.md, .claude/context/settings-reset.md, .claude/context/app-shell-ui.md, .claude/context/testing.md
Preconditions: 300
Feature: steam-desktop-host

---
