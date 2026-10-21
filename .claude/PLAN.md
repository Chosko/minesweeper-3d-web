# Plan

Roadmap: .claude/domain/product-roadmap.md
Last reconciled: 2026-10-21

---

## m1-classic-2d — Real Minesweeper on the web preview

Status: [SHIPPED]
Covers: product-design.md § Visual design system, product-design.md § Classic 2D, product-design.md § Main menu and game shell, product-design.md § Results and records
Features: design-tokens-and-themes, cell-graph-rules-engine, board-generation, platform-storage, screen-components, square-tile-skin, game-shell, game-summary, classic-2d-square-play, settings, personal-records, results-screen, records-screen

---

## m2-3d-joins — 3D as a full member of the game

Status: [SHIPPED]
Covers: product-design.md § 3D mode, product-design.md § Replays, product-design.md § Results and records
Features: 3d-board-graph, 3d-play-flow, 3d-game-records, replay-recording, replay-library, replay-playback, 3d-results-records-screens

---

## m2b-themes — The game wears its shipping look

Status: [ACTIVE]
Covers: product-design.md § Visual design system, product-design.md § Main menu and game shell, product-design.md § 3D mode
Features: theme-system, shared-screen-layout, in-game-layout, themed-board-art-and-motion, theme-implement-skill

---

## m2c-flat-grids — Hexagon and Triangle join the game

Status: [PLANNED]
Covers: product-design.md § Hexagon, product-design.md § Triangle, product-design.md § Main menu and game shell, product-design.md § Daily board, product-design.md § Visual design system
Features: flat-grid-geometry, hexagon-grid, triangle-grid, hex-tri-board-art, flat-grid-modes, flat-grid-records-replays, flat-grid-menu-entries

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
Covers: product-design.md § Hexagon, product-design.md § Triangle, product-design.md § Surface, product-design.md § Campaign levels, product-design.md § Visual design system, product-design.md § Demo edition, product-design.md § Steam features, product-design.md § Main menu and game shell
Features: none

---

## m7-after-launch — New ways to play

Status: [PLANNED]
Covers: product-design.md § Endless board, product-design.md § Marathon and Zen, product-design.md § Main menu and game shell
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
- records-screen: depends on personal-records, game-summary, screen-components, design-tokens-and-themes, game-shell, results-screen
- 3d-board-graph: depends on cell-graph-rules-engine, board-generation
- 3d-play-flow: depends on 3d-board-graph, board-generation, cell-graph-rules-engine, game-shell, game-summary, settings
- replay-recording: depends on cell-graph-rules-engine, game-summary, classic-2d-square-play, 3d-play-flow, 3d-board-graph, game-shell
- replay-library: depends on platform-storage, replay-recording, personal-records, game-summary, records-screen, screen-components, game-shell, results-screen
- replay-playback: depends on replay-recording, replay-library, cell-graph-rules-engine, 3d-board-graph, classic-2d-square-play, 3d-play-flow, square-tile-skin, screen-components, results-screen, game-shell
- 3d-game-records: depends on game-summary, personal-records, 3d-board-graph, 3d-play-flow, platform-storage
- 3d-results-records-screens: depends on 3d-game-records, results-screen, records-screen, 3d-play-flow, game-shell, screen-components, replay-playback, replay-library
- steam-desktop-host: depends on platform-storage, replay-library, game-shell
- steam-cloud-saves: depends on steam-desktop-host, platform-storage, replay-library
- steam-leaderboards: depends on steam-desktop-host, steam-cloud-saves, replay-playback, replay-recording, replay-library, game-summary, 3d-game-records, personal-records, game-shell, platform-storage
- leaderboard-screen: depends on steam-leaderboards, replay-playback, game-summary, 3d-game-records, screen-components, game-shell, results-screen, shared-screen-layout, theme-system
- steam-achievements: depends on steam-desktop-host, game-summary, 3d-game-records, personal-records, game-shell
- leaderboards-menu-entry: depends on records-screen, game-shell, leaderboard-screen, steam-desktop-host, shared-screen-layout, theme-system
- results-steam-rank: depends on results-screen, steam-leaderboards, steam-desktop-host, 3d-results-records-screens, leaderboard-screen, shared-screen-layout, theme-system
- input-rebinding: depends on settings, classic-2d-square-play, flat-grid-modes, 3d-play-flow, game-shell, screen-components, shared-screen-layout, in-game-layout, theme-system
- theme-system: depends on screen-components, settings, platform-storage
- themed-board-art-and-motion: depends on theme-system, classic-2d-square-play, 3d-board-graph, 3d-play-flow, replay-playback
- shared-screen-layout: depends on theme-system, screen-components, game-shell, settings, results-screen, records-screen, replay-playback, 3d-results-records-screens, 3d-play-flow, classic-2d-square-play, personal-records, 3d-game-records
- in-game-layout: depends on shared-screen-layout, theme-system, classic-2d-square-play, 3d-play-flow, cell-graph-rules-engine, game-summary, personal-records, 3d-game-records, replay-playback, game-shell
- theme-implement-skill: depends on theme-system, themed-board-art-and-motion, shared-screen-layout, in-game-layout
- flat-grid-geometry: depends on classic-2d-square-play, themed-board-art-and-motion, replay-recording, replay-playback, in-game-layout
- hexagon-grid: depends on cell-graph-rules-engine, board-generation, flat-grid-geometry, game-summary, classic-2d-square-play
- triangle-grid: depends on cell-graph-rules-engine, board-generation, flat-grid-geometry, game-summary, classic-2d-square-play
- hex-tri-board-art: depends on themed-board-art-and-motion, theme-system, flat-grid-geometry, hexagon-grid, triangle-grid, theme-implement-skill
- flat-grid-modes: depends on classic-2d-square-play, flat-grid-geometry, hexagon-grid, triangle-grid, hex-tri-board-art, game-shell, shared-screen-layout, in-game-layout, results-screen, game-summary
- flat-grid-records-replays: depends on game-summary, personal-records, records-screen, 3d-results-records-screens, replay-recording, replay-playback, replay-library, flat-grid-geometry, hexagon-grid, triangle-grid, flat-grid-modes
- flat-grid-menu-entries: depends on game-shell, shared-screen-layout, flat-grid-modes, flat-grid-geometry, hexagon-grid, triangle-grid, flat-grid-records-replays, game-summary, board-generation
