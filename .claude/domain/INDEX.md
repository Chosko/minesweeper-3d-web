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

## Features

Low-level feature documents live under [features/](./features/), one per
feature, written by `/architect`. The feature index — status and generated
task IDs per feature — is [../FEATURES.md](../FEATURES.md).
