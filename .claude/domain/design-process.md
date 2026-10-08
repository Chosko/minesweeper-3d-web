# Design process

The state of this project's `/product-design` run. `/product-design` reads
this file to decide where to resume; nothing else records that.

## Method

Top-down product design. The user and Claude work through the phases below
conversationally; each phase's output is written into `product-design.md`
(and `business-model.md` when in scope) before the next begins, and the
technical foundations are written into `technical-direction.md` last.

Greenfield or brownfield: brownfield — a playable, deployed browser port
(three.js, static files on GitHub Pages) with a README, a gameplay spec and a
context layer already exists.
Business modelling: in scope

## Phases

| Phase | What it does | State |
| --- | --- | --- |
| 0 — gate + resume | Verify the domain layer; resume or start fresh | done |
| 1 — orient + stub | Detect greenfield/brownfield, create the documents | done |
| 2 — interview | Product, users, experience, big decisions, business model | done |
| 3 — write-back | Fill product-design.md and business-model.md | done |
| 4 — high-level features | Identify the feature set, user-experience angle | done |
| 5 — feature write-back | Record the feature set in product-design.md | done |
| 6 — technical direction | Decide the product's technical foundations | done |
| 7 — technical write-back | Record the direction in technical-direction.md | done |

## Current stage

**PHASE 7 — technical write-back: done — process complete**

The product design is complete. Later changes go through
`/product-design amend "<change>"`.

- `product-design.md` — product, players, menu and flows, design decisions, 14 high-level features.
- `business-model.md` — one-time Steam purchase at US$5.99 with a free demo; Early Access open.
- `technical-direction.md` — JS + three.js + Canvas 2D in Electron, one graph-based rules engine; Steam binding open.

Next step: `/architect <feature>`, then `/task-add feature=<slug>`.

## Decisions worth keeping

- The 2D mode is built new rather than derived from the 3D game: enthusiasts expect exact classic rules and a real flat board.
- Free 3D play is too hard alone, so the 3D campaign is its on-ramp.
- Campaign mines re-randomize per attempt because fixed layouts turn replays into muscle memory; hence campaign and daily leaderboards rank by 3BV/s.
- The demo is unlimited on its unlocked boards: per-day caps read as free-to-play nagging in a paid game.
- No variant logic rules: they feel like hardcore brain puzzles, and 14 Minesweeper Variants owns that ground; gameplay twists stay wanted but deferred until one convinces.
- Scanner charges and 3D fog were proposed and set aside.
- Leaderboards come from Steam because the game has no backend; custom boards are excluded because they cannot be compared.
- Electron over Tauri and NW.js: bundled Chromium keeps WebGL identical everywhere, Tauri's system webviews vary on Mac/Linux, NW.js's Greenworks is best-effort.
- Steam Deck is a stretch goal because Minesweeper with a controller is awkward, even though controllers are supported.
