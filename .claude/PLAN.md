# Plan

Roadmap: .claude/domain/product-roadmap.md
Last reconciled: 2026-10-09

---

## m1-classic-2d — Real Minesweeper on the web preview

Status: [ACTIVE]
Covers: product-design.md § Visual design system, product-design.md § Classic 2D, product-design.md § Main menu and game shell, product-design.md § Results and records
Features: design-tokens-and-themes, cell-graph-rules-engine, board-generation, platform-storage, screen-components, square-tile-skin, game-shell, game-summary, classic-2d-square-play, settings, personal-records, results-screen, records-screen

---

## m2-3d-joins — 3D as a full member of the game

Status: [PLANNED]
Covers: product-design.md § 3D mode, product-design.md § Replays, product-design.md § Results and records
Features: 3d-board-graph, 3d-play-flow, 3d-game-records, replay-recording, replay-library, replay-playback, 3d-results-records-screens

---

## m3-on-steam — The game runs as a Steam app

Status: [PLANNED]
Covers: product-design.md § Steam features, product-design.md § Main menu and game shell, product-design.md § Results and records
Features: steam-desktop-host, steam-cloud-saves, steam-leaderboards, steam-achievements, leaderboard-screen, leaderboards-menu-entry, results-steam-rank, input-rebinding

---

## m4-campaigns — Campaigns playable

Status: [PLANNED]
Covers: product-design.md § Campaign system, product-design.md § Campaign levels, product-design.md § Main menu and game shell, product-design.md § Steam features
Features: none

---

## m5-core-complete — Ready for a first public release

Status: [PLANNED]
Covers: product-design.md § Daily board, product-design.md § Demo edition, product-design.md § Main menu and game shell
Features: none

---

## m6-launch — 1.0

Status: [PLANNED]
Covers: product-design.md § Classic 2D, product-design.md § Surface, product-design.md § Campaign levels, product-design.md § Visual design system, product-design.md § Demo edition, product-design.md § Steam features, product-design.md § Main menu and game shell
Features: none

---

## m7-after-launch — New ways to play

Status: [PLANNED]
Covers: product-design.md § Endless board, product-design.md § Marathon and Zen
Features: none

---

## Unscheduled

Features: none

## Dependencies

- square-tile-skin: depends on design-tokens-and-themes
- screen-components: depends on design-tokens-and-themes
- board-generation: depends on cell-graph-rules-engine
- game-shell: depends on screen-components, platform-storage
- settings: depends on platform-storage, design-tokens-and-themes, screen-components, game-shell
- game-summary: depends on cell-graph-rules-engine
- classic-2d-square-play: depends on cell-graph-rules-engine, board-generation, square-tile-skin, design-tokens-and-themes, screen-components, game-shell, game-summary
- personal-records: depends on game-summary, platform-storage
- results-screen: depends on game-summary, personal-records, screen-components, game-shell
- records-screen: depends on personal-records, game-summary, screen-components, design-tokens-and-themes, game-shell
- 3d-board-graph: depends on cell-graph-rules-engine, board-generation
- 3d-play-flow: depends on 3d-board-graph, board-generation, cell-graph-rules-engine, game-shell, game-summary, settings
- replay-recording: depends on cell-graph-rules-engine, game-summary, classic-2d-square-play, 3d-play-flow, 3d-board-graph, game-shell
- replay-library: depends on platform-storage, replay-recording, personal-records, game-summary, records-screen, screen-components, game-shell
- replay-playback: depends on replay-recording, replay-library, cell-graph-rules-engine, 3d-board-graph, classic-2d-square-play, 3d-play-flow, square-tile-skin, screen-components, results-screen, game-shell
- 3d-game-records: depends on game-summary, personal-records, 3d-board-graph, 3d-play-flow, platform-storage
- 3d-results-records-screens: depends on 3d-game-records, results-screen, records-screen, 3d-play-flow, game-shell, screen-components, replay-playback, replay-library
- steam-desktop-host: depends on platform-storage, replay-library, game-shell
- steam-cloud-saves: depends on steam-desktop-host, platform-storage, replay-library
- steam-leaderboards: depends on steam-desktop-host, steam-cloud-saves, replay-playback, replay-recording, replay-library, game-summary, 3d-game-records, personal-records, game-shell, platform-storage
- leaderboard-screen: depends on steam-leaderboards, replay-playback, game-summary, 3d-game-records, screen-components, game-shell
- steam-achievements: depends on steam-desktop-host, game-summary, 3d-game-records, personal-records, game-shell
- leaderboards-menu-entry: depends on game-shell, leaderboard-screen, steam-desktop-host, screen-components
- results-steam-rank: depends on results-screen, steam-leaderboards, steam-desktop-host, screen-components, 3d-results-records-screens, leaderboard-screen
- input-rebinding: depends on settings, classic-2d-square-play, 3d-play-flow, game-shell, screen-components
