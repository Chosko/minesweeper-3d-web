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
| [features/design-tokens-and-themes.md](./features/design-tokens-and-themes.md) | Design tokens (palette, type, spacing, motion) with light and dark values, and how the chosen theme is applied |
| [features/square-tile-skin.md](./features/square-tile-skin.md) | Classic 2D square tiles in every state and the number colours, in both themes |
| [features/screen-components.md](./features/screen-components.md) | The DOM component kit and the m1 screens built from it: main menu, in-game overlay, results screen |
| [features/cell-graph-rules-engine.md](./features/cell-graph-rules-engine.md) | The one rules engine over a graph of cells, the square-grid graph, and the reference ruleset pinned by fidelity tests |
| [features/board-generation.md](./features/board-generation.md) | Seeded deterministic mine placement around the first click, the no-guess solver, and the generation worker |
| [features/classic-2d-square-play.md](./features/classic-2d-square-play.md) | Classic 2D on the square grid: board choice, start-of-game flow, Canvas 2D board, mouse, keyboard and controller input, timer |
| [features/game-shell.md](./features/game-shell.md) | The main menu, screen routing, the mode host contract, and the shared pause, restart and back-to-menu flow |
| [features/settings.md](./features/settings.md) | The Settings page and settings store: controls, graphics, theme and audio, defaults, persistence and change notification |
| [features/platform-storage.md](./features/platform-storage.md) | The platform layer's storage interface: versioned documents, the browser implementation, failure handling |
| [features/game-summary.md](./features/game-summary.md) | Board identity, the summary of a won, lost or abandoned game, and how 3BV/s, efficiency and best eligibility are derived |
| [features/personal-records.md](./features/personal-records.md) | Personal bests per board, stats history, win rate and streaks: rules, stored documents, the game-in-progress marker that records a closed game as a loss, the comparison against bests |
| [features/results-screen.md](./features/results-screen.md) | The end-of-game results screen: stats shown, the three-best comparison, Play again, Records, Back to menu |
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
| [features/steam-leaderboards.md](./features/steam-leaderboards.md) | The 18 free-play leaderboards, replay-verified submission with attached replay, the offline outbox, entry and replay queries, the web stand-in |
| [features/leaderboard-screen.md](./features/leaderboard-screen.md) | The leaderboard screen: 2D \| 3D board picker, global, friends and around-me rankings, own standing, watching an entry's replay |
| [features/steam-achievements.md](./features/steam-achievements.md) | The m3 achievement catalogue for Classic 2D and 3D, per-game evaluation, unlocking through Steam and catch-up from history |
| [features/leaderboards-menu-entry.md](./features/leaderboards-menu-entry.md) | The m3 main menu additions: the Leaderboards entry opening the leaderboard screen, and Quit on the desktop build |
| [features/results-steam-rank.md](./features/results-steam-rank.md) | The Steam build's rank panel on the results screen: global and friends rank after a won standard-board game, the move on an improved entry, the wait and offline wording, and the *Leaderboard* action that opens this game's board |
| [features/input-rebinding.md](./features/input-rebinding.md) | Rebinding keys, mouse buttons and controller buttons for Classic 2D and 3D: the action catalogue, the bindings resolver, clashes and reserved inputs, and the rebinding controls in Settings |

## Features

Low-level feature documents live under [features/](./features/), one per
feature, written by `/architect`. The feature index — status and generated
task IDs per feature — is [../FEATURES.md](../FEATURES.md).
