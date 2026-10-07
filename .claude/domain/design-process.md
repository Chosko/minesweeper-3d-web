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
| 4 — high-level features | Identify the feature set, user-experience angle | not started |
| 5 — feature write-back | Record the feature set in product-design.md | not started |
| 6 — technical direction | Decide the product's technical foundations | not started |
| 7 — technical write-back | Record the direction in technical-direction.md | not started |

## Current stage

**PHASE 3 — write-back: done**

The interview is closed and written back. Next session opens PHASE 4: identify
the high-level feature set with the user.

- `product-design.md` — product, target users, main menu and key flows, design decisions; features pending.
- `business-model.md` — all sections filled; Early Access is its open decision.
- `technical-direction.md` — stub only.

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
- The game opens on a main menu; key flows describe expected play, not enforced paths — only campaign locks gate anything.
- Base price $5.99 USD, one-time purchase; EUR set from Steam's recommended regional price (about €5.89–6.15 per a store-API sample).
- For PHASE 6: steamworks.js and Greenworks expose no leaderboard API, so Steam leaderboards need a different binding or an added one; Deck Verified needs full controller play at 1280×800.
- The game stays web-technology based and ships on Steam as a packaged desktop build; the packaging choice belongs to the technical direction.
- Campaign levels are a fixed sequence, unlocked in order; standard rules on unusual board shapes and holes, which matter most in 3D.
- Demo: unlimited 2D Beginner/Intermediate/Expert and 3D Beginner free play; the first 5 levels of each campaign, unlocked by progression; everything else locked (custom boards, harder 3D presets, pro options such as no-guess).
- First launch shows the menu, never auto-starts a level; the top button reads Start (first 2D campaign level) until there is progress to Continue.
- Platforms: Windows at launch; Mac and Linux only if the port is near-free; Steam Deck Verified is a stretch goal riding on controller support; never mobile or touch.
- The full game plays offline; Steam achievements and leaderboards sync when a connection returns.
- The free web version stays live until the Steam release, as the author's work-in-progress preview; its post-release fate is open.
- Steam achievements, cloud saves and Steam leaderboards are in for launch; leaderboards come from Steam because the game has no backend; custom boards get none since they cannot be compared.
- Early Access is open: if taken, enter it once the core is complete (Classic 2D with no-guess, stats, replays, leaderboards; 3D mode; first part of each campaign; demo), at $4.99 rising to $5.99 at 1.0.
- Demo free play is unlimited on its unlocked boards, not capped; per-day caps read as free-to-play nagging in a paid game.
- Rejected: auto-starting the tutorial on first launch; a Continue button before any progress.
