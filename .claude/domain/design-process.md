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
Business modelling: undecided — awaiting the user's answer

## Phases

| Phase | What it does | State |
| --- | --- | --- |
| 0 — gate + resume | Verify the domain layer; resume or start fresh | done |
| 1 — orient + stub | Detect greenfield/brownfield, create the documents | in progress |
| 2 — interview | Product, users, experience, big decisions, business model | not started |
| 3 — write-back | Fill product-design.md and business-model.md | not started |
| 4 — high-level features | Identify the feature set, user-experience angle | not started |
| 5 — feature write-back | Record the feature set in product-design.md | not started |
| 6 — technical direction | Decide the product's technical foundations | not started |
| 7 — technical write-back | Record the direction in technical-direction.md | not started |

## Current stage

**PHASE 1 — orient + stub: in progress**

Brownfield detected; `product-design.md` and `technical-direction.md` are
stubbed and registered in the domain INDEX. The run stopped (unattended
policy) on the business-modelling question and the PHASE 2 opener: whether
the existing game is still the intended product, and what has drifted.

- `product-design.md` — stub only.
- `technical-direction.md` — stub only.

Next step: record the business-modelling answer (create `business-model.md`
if yes), mark PHASE 1 done, and open PHASE 2 from the user's answers.
