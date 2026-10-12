# The reviewer brief

Authority for: the common brief every reviewer agent receives, its
placeholders, the report shape a reviewer writes, and the analysis variant.

Read by `../SKILL.md` each time a reviewer or an analysis agent is launched.

---

## Filling it in

The director fills every placeholder at launch, then appends the role brief
(`./roles.md`).

| Placeholder | Filled with |
| ----------- | ----------- |
| `{{GAME}}` | The game's name. |
| `{{REPO}}` | The repository's absolute path. |
| `{{PRODUCT}}` | Two or three sentences: what the game is, its modes, what exists (records, replays, settings, themes, inputs). |
| `{{URL}}` | The served build's URL, from SETUP. |
| `{{PLAYWRIGHT}}` | The Playwright module path proven at SETUP. |
| `{{DRIVE}}` | Where the project shows how its tests drive the game: debug hooks, a faked gamepad, the context files that describe them. |
| `{{DESIGN}}` | The product design document, and which of its parts are not built. |
| `{{FEATURES}}` | The domain index that lists the feature documents. |
| `{{SCRATCH}}` | The session's scratchpad path. |

## The brief

````
# Common brief for the {{GAME}} review panel

You are one reviewer on a panel convened by the game director. The product
is {{GAME}}, at `{{REPO}}`. {{PRODUCT}}

## What the director wants from you

A review of the game AS A PLAYER EXPERIENCES IT, from your role's point of
view. Not a code review, not an architecture review. Play the game, look at
every screen on your path, try the branches a real player would take, and
report what is wrong, confusing, missing or delightful. For every problem,
propose a solution. Also propose improvements that are not fixes.

Your report must distinguish what you OBSERVED (played, saw, screenshotted)
from what you only READ in docs. Observed beats read. If a limit of the
headless environment stopped you from observing something, say so and say
what you expected.

## Environment

- The game is served at `{{URL}}` (already running; do not stop it, do not
  start another on that port).
- Drive it with Playwright in headless Chromium:

```js
const pw = await import('{{PLAYWRIGHT}}');
const { chromium, devices } = pw.default ?? pw;
const browser = await chromium.launch({ args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist' ] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('{{URL}}');
```

  WebGL works with those flags (verified). Run scripts with `node <file>`
  from your own folder. Give yourself generous waits: rendering is software.
- Pointer lock, controllers and touch: {{DRIVE}}. Touch: use
  `devices['iPhone 13']` / `devices['iPad Pro 11']` contexts with
  `hasTouch: true` and `page.touchscreen`.
- Each browser context starts with empty storage. To review the returning
  player, keep one context and play several games in it.
- Your working folder: `{{SCRATCH}}/<your-role>/` (create it). Put scripts,
  measured outputs and screenshots there. LOOK at your screenshots (Read
  tool): a screenshot you did not look at is not evidence.
- Do not edit, create or delete any file under the repository. Do not run
  any git command that changes state. The repository is read-only for you.

## What to read before playing (player-facing knowledge, not code)

- `README.md` — how the game says it plays, all controls.
- {{DESIGN}} — what the product intends to be and for whom.
- The feature documents relevant to your role (list in {{FEATURES}}).
- You MAY open source files to learn what a screen does or what an input
  triggers, when playing alone cannot tell you. Do not review the code
  itself and do not report code quality.

## Report

Write `report.md` in your working folder, in this shape. Do not number
findings (the director numbers them when merging); give each a short stable
title instead.

```
# <Role> — report

## Method
What you played (modes, boards, inputs, viewports), how many games, what
the headless environment prevented.

## Problems
### <short title>
- Severity: blocker | major | minor
- Player path: who hits it (e.g. first-time player, enthusiast on the
  hardest preset, controller-only player, phone player, returning player)
- Where: screen / moment
- What happens: the observed behaviour, and why it hurts
- Evidence: observed | read — plus screenshot paths
- Proposed solution: concrete, player-facing; alternatives if two are viable

## Improvements
### <short title>
- Player path served
- Why it matters
- Sketch of the solution

## What works well
Three to eight lines. The director needs to know what not to break.

## Open questions for the director
```

Be concrete: name the screen, the button label, the key, the moment. Be
honest about severity: a blocker stops a player from playing or loses their
game; a major makes a path confusing or frustrating; a minor is polish.
Prefer fewer, verified findings over many speculative ones, but do not stop
early: walk your whole path.

## Your role

<the role brief>
````

## The analysis variant

An analysis agent answers one claim the owner's decision needs. Its brief is
the common brief with three changes:

- **What the director wants** becomes the claim, verbatim, and the rows of
  the document it bears on, by id.
- **Method**: measure with the game's own engine, generator and solver under
  Node, never by hand; 100 seeds per preset and setting, the same seeds as
  the game-design reviewer when there was one; the first click as the game
  invites it. Simulate each player strategy the claim names, and an
  independent check that must agree with the engine.
- **Report**: `# <Claim> — analysis`, then *Method*, the result tables, and
  *Answer*: the claim's verdict in one paragraph with its numbers, and what
  each option on the table would let a player do.

Its working folder is `{{SCRATCH}}/<id>-analysis/`, kept as
`docs/<name>/<id>-analysis/`, where `<id>` is the item's id in lower case.
