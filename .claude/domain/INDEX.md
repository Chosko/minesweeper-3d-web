# Domain index

Product and rules knowledge for Minesweeper 3D. Read this first, then the
files relevant to your task.

This layer answers WHAT the product is and WHY it is built this way. For
CODEBASE STRUCTURE — which file implements what — see
[../context/INDEX.md](../context/INDEX.md) if the project has a context
layer.

## Files

| File | Covers |
| --- | --- |
| [design-process.md](./design-process.md) | State of the `/product-design` run: method, phases, current-stage marker, decisions worth keeping |
| [product-design.md](./product-design.md) | The product design: what Minesweeper 3D is, its players, key flows, design decisions, high-level features |
| [technical-direction.md](./technical-direction.md) | The product's technical foundations: stack, topology, data, hosting, cross-cutting concerns |
| [business-model.md](./business-model.md) | The business model: revenue, costs, segments, pricing, go-to-market, unit economics, risks |
| [product-roadmap.md](./product-roadmap.md) | The product roadmap: ordered milestones, their goals, exit criteria, rationale and the scope slice each takes of each high-level feature |
| [features/design-tokens-and-themes.md](./features/design-tokens-and-themes.md) | Design tokens (palette, type, spacing, motion): their names, the token reader, the scene palette hand-off and the contrast contract; the values, the themes, the applier and the theme setting are theme-system's |
| [features/square-tile-skin.md](./features/square-tile-skin.md) | Classic 2D square tiles in every state and the number colours of the m1 light and dark looks; its theme parts are superseded by themed-board-art-and-motion |
| [features/screen-components.md](./features/screen-components.md) | The DOM component kit and the m1 screens built from it: main menu, in-game overlay, results screen; their styling and layout are superseded by theme-system, shared-screen-layout and in-game-layout |
| [features/cell-graph-rules-engine.md](./features/cell-graph-rules-engine.md) | The one rules engine over a graph of cells, the square-grid graph, and the reference ruleset pinned by fidelity tests |
| [features/board-generation.md](./features/board-generation.md) | Seeded deterministic mine placement around the first click, the no-guess solver, and the generation worker |
| [features/classic-2d-square-play.md](./features/classic-2d-square-play.md) | Classic 2D on the square grid: board choice, start-of-game flow, Canvas 2D board, mouse, keyboard and controller input, timer |
| [features/game-shell.md](./features/game-shell.md) | The main menu, screen routing, the mode host contract, and the shared pause, restart and back-to-menu flow |
| [features/settings.md](./features/settings.md) | The Settings page and settings store: controls, graphics, theme and audio, defaults, persistence and change notification |
| [features/platform-storage.md](./features/platform-storage.md) | The platform layer's storage interface: versioned documents, the browser implementation, failure handling |
| [features/game-summary.md](./features/game-summary.md) | Board identity, the summary of a won, lost or abandoned game, and how 3BV/s, efficiency and best eligibility are derived |
| [features/personal-records.md](./features/personal-records.md) | Personal bests per board, stats history, win rate and streaks: rules, stored documents, the game-in-progress marker that records a closed game as a loss, the comparison against bests |
| [features/results-screen.md](./features/results-screen.md) | The end-of-game results screen: stats shown, the three-best comparison, Play again, Records, Main menu |
| [features/records-screen.md](./features/records-screen.md) | The Records screen: board picker, bests, win rate, streaks, history chart and recent games |
| [features/3d-board-graph.md](./features/3d-board-graph.md) | The 3D box as a cell graph on the shared rules engine, the 3D rule profile (auto-hide, right-click on revealed cells) and the 3D state view |
| [features/3d-play-flow.md](./features/3d-play-flow.md) | 3D board choice, the safe first click and generation flow, the no-guess switch and its size limit, and the 3D mode's hand-off to results |
| [features/replay-recording.md](./features/replay-recording.md) | The replay format and its capture during 2D and 3D play: mines, rules version, timed actions, sampled cursor and camera movement, check values |
| [features/replay-playback.md](./features/replay-playback.md) | The replay simulator and verifier, and the replay viewer with its controls, entered from the results screen and the library |
| [features/replay-library.md](./features/replay-library.md) | The replay store behind the platform layer, retention of the newest 100 plus pinned replays, best and hand pinning, and the library view in Records |
| [features/3d-game-records.md](./features/3d-game-records.md) | The 3D board identity and labels, 3D summaries, and 3D games in bests, history, win rate and streaks kept per board and per mode |
| [features/3d-results-records-screens.md](./features/3d-results-records-screens.md) | The 3D end of game: end effect, then the results screen taking over; the Records screen's 2D \| 3D switch and 3D board picker |
| [features/steam-desktop-host.md](./features/steam-desktop-host.md) | The Windows Electron host: game window, Steamworks capability adapter and binding spike, the page bridge, platform selection, overlay, SteamPipe build |
| [features/steam-cloud-saves.md](./features/steam-cloud-saves.md) | The Steam build's storage: documents and replays as files in the save directory, safe writes, Steam Auto-Cloud sync and quota |
| [features/steam-leaderboards.md](./features/steam-leaderboards.md) | The free-play leaderboards, replay-verified submission with attached replay, the offline outbox, entry and replay queries, the web stand-in |
| [features/leaderboard-screen.md](./features/leaderboard-screen.md) | The leaderboard screen: 2D \| 3D board picker, global, friends and around-me rankings, own standing, watching an entry's replay |
| [features/steam-achievements.md](./features/steam-achievements.md) | The m3 achievement catalogue for Classic 2D and 3D, per-game evaluation, unlocking through Steam and catch-up from history |
| [features/leaderboards-menu-entry.md](./features/leaderboards-menu-entry.md) | The m3 Records Leaderboards tab showing the rankings of the board Records shows, in place, and Quit on the desktop build |
| [features/results-steam-rank.md](./features/results-steam-rank.md) | The Steam build's rank panel on the results screen: global and friends rank after a won standard-board game, the move on an improved entry, the wait and offline wording, and the *Leaderboard* action that opens this game's board |
| [features/input-rebinding.md](./features/input-rebinding.md) | Rebinding keys, mouse buttons and controller buttons for Classic 2D and 3D: the action catalogue, the bindings resolver, clashes and reserved inputs, and the rebinding controls in Settings |
| [features/theme-system.md](./features/theme-system.md) | The theme catalogue and contract: registry, kit catalogue with parts and decoration slots, base and per-theme stylesheets, self-hosted per-theme fonts, applying and switching themes, the Settings theme list with the light/dark carry-over, reduced motion, conformance tests and the per-theme gallery |
| [features/themed-board-art-and-motion.md](./features/themed-board-art-and-motion.md) | Every board in the chosen theme: the board module's shape, tile drawing styles, themed 2D tiles, 3D cubes, numbers 1–26 and sky, and per-theme cell motion played by both renderers |
| [features/shared-screen-layout.md](./features/shared-screen-layout.md) | The redesigned shared layout: backdrop, screen frame and the new kit components; the main menu, the board choice screens with their bests and the 3D presets, the Daily screen, and the other screens in the frame; the 3D scene in a panel |
| [features/in-game-layout.md](./features/in-game-layout.md) | The redesigned game window for Classic 2D and 3D: head, counter strip with Restart, the live figures panel (3BV progress, pace vs PB, 3BV/s, clicks, flags) and the foot line |
| [features/theme-implement-skill.md](./features/theme-implement-skill.md) | The project skill that adds or updates a theme from its Claude Design canvas: reading artboards, mapping them to the contract, fonts, verification, stop conditions, commit |
| [features/flat-grid-geometry.md](./features/flat-grid-geometry.md) | The flat grid geometry contract — layout, outline, hit-testing, cursor moves, floor and scale cap — with Classic 2D's board view, painter, motion, end effect, inputs, sampler and 2D replay viewer written against it; the square geometry |
| [features/hexagon-grid.md](./features/hexagon-grid.md) | The hexagonal grid: flat-top columns with odd columns lower, 6 neighbours, its generation description and start cell, its geometry, Hexagon's standard boards and custom limits, its board identity and board-code token |
| [features/triangle-grid.md](./features/triangle-grid.md) | The triangle grid: alternating triangles with 12 neighbours, its generation description and start cell, its geometry, Triangle's standard boards and custom limits, its board identity and board-code token |
| [features/hex-tri-board-art.md](./features/hex-tri-board-art.md) | Hexagonal and triangle tiles in the theme: per-grid gap and radius, 2D numbers to 12, the recipe's outlines, the board checks per grid, Joyful tiles' values and the theme skill's reading of the two sheets |
| [features/flat-grid-modes.md](./features/flat-grid-modes.md) | The Hexagon and Triangle modes from the Classic 2D flow: configuration, board choice screens, last board choice, board codes, session, game window, mouse, keyboard, controller and touch, help, end effect, results |
| [features/flat-grid-records-replays.md](./features/flat-grid-records-replays.md) | Hexagon and Triangle in the records: per-mode counters and the format step, the Records screen's mode switch; their replays: format version, recording, playback and the library |
| [features/flat-grid-menu-entries.md](./features/flat-grid-menu-entries.md) | The Hexagon and Triangle menu entries opening their modes, their board previews, the last mode played, and Daily keeping both as Coming soon |

## Features

Low-level feature documents live under [features/](./features/), one per
feature, written by `/architect`. The feature index — status and generated
task IDs per feature — is [../FEATURES.md](../FEATURES.md).
