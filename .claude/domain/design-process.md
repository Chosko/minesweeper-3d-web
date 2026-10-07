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
| 2 — interview | Product, users, experience, big decisions, business model | in progress |
| 3 — write-back | Fill product-design.md and business-model.md | not started |
| 4 — high-level features | Identify the feature set, user-experience angle | not started |
| 5 — feature write-back | Record the feature set in product-design.md | not started |
| 6 — technical direction | Decide the product's technical foundations | not started |
| 7 — technical write-back | Record the direction in technical-direction.md | not started |

## Current stage

**PHASE 2 — interview: in progress**

Covered: direction, target players, 2D logic reference, no-guess and stats,
campaign split, 3D rule changes, revenue shape. Open: the key flows, the
campaign's progression, the demo's limits, price, the fate of the free web
version, Steam platform features, and the rest of the business model.

- `product-design.md`, `technical-direction.md`, `business-model.md` — stubs only.

Next step: continue the interview from the last open questions put to the user.

## Decisions worth keeping

- Goal: become the best Minesweeper game on Steam — a multi-mode game, not a port of the 2011 original.
- Primary players: Minesweeper enthusiasts choosing between Steam implementations they find unconvincing.
- The existing 3D game is settled and becomes the 3D mode, unchanged in substance.
- The 2D mode is rebuilt from scratch as real 2D (no 3D rendering) with exact classic Minesweeper logic.
- Launch scope: 2D mode, 3D mode, campaign of designed levels, local scores.
- Scoped as a game, not a platform: no backend, online services or competitive infrastructure in the design.
- 2D logic follows Minesweeper Online exactly; visuals are modern and catchy with no decorative excess (the current 3D look is the bar).
- No-guess boards and competitive stats (3BV, 3BV/s, efficiency, replays) ship at launch.
- Campaigns are separate per dimension (2D, 3D) and per difficulty; the 3D campaign is the on-ramp, since free 3D play alone is too hard.
- The 3D mode gains a safe first click and a no-guess option, departing from the 2011 original.
- Revenue: free Steam demo with limitations; full game is a one-time purchase on Steam.
