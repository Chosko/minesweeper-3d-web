# Common brief for the Minesweeper 3D UX review panel

You are one reviewer on a panel convened by the game director. The product
is Minesweeper 3D, a browser game (no build step, static files) at
`/home/user/minesweeper-3d-web`. It has two modes: Classic 2D (square grid)
and 3D (a box of cubes flown through in first person). Records, replays,
settings, light/dark theme, mouse, keyboard and controller play exist.

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

- The game is served at `http://127.0.0.1:8080/index.html` (already
  running; do not stop it, do not start another on 8080).
- Drive it with Playwright in headless Chromium. Import it like this (it
  is not resolvable by bare name from the scratchpad):

```js
const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
const { chromium, devices } = pw.default ?? pw;
const browser = await chromium.launch({ args: [
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist' ] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.goto('http://127.0.0.1:8080/index.html');
```

  WebGL works with those flags (verified). Run scripts with `node <file>`
  from your own folder (below). Give yourself generous waits: rendering is
  software.
- Pointer lock may not work headless. If the 3D mode needs it, look at how
  `tests/*.test.mjs` drive the 3D game and the `__ms` debug hook
  (`.claude/context/app-shell.md` and `.claude/context/input.md` describe
  it), or dispatch mouse/keyboard events directly. Controllers: the tests
  under `tests/` show how a gamepad is faked (look for `getGamepads`).
  Touch: use `devices['iPhone 13']` / `devices['iPad Pro 11']` contexts
  with `hasTouch: true` and `page.touchscreen`.
- Each browser context starts with empty storage. To review the "returning
  player" state, keep one context and play several games in it.
- Your working folder: `/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/<your-role>/`
  (create it). Put scripts and screenshots there. LOOK at your screenshots
  (Read tool) — a screenshot you did not look at is not evidence.
- Do not edit, create or delete any file under the repository. Do not run
  any git command that changes state. The repository is read-only for you.

## What to read before playing (player-facing knowledge, not code)

- `README.md` — how the game says it plays, all controls.
- `.claude/domain/product-design.md` — what the product intends to be and
  for whom (note: the Steam, campaign, daily and Surface parts are NOT built;
  the web build has Classic 2D, 3D, records, replays, settings).
- The feature documents under `.claude/domain/features/` relevant to your
  role (list in `.claude/domain/INDEX.md`).
- You MAY open source files to learn what a screen does or what an input
  triggers, when playing alone cannot tell you. Do not review the code
  itself and do not report code quality.

## Report

Write `report.md` in your working folder, in this shape. Do not number
findings (the director numbers them when merging); give each a short
stable title instead.

```
# <Role> — report

## Method
What you played (modes, boards, inputs, viewports), how many games, what
the headless environment prevented.

## Problems
### <short title>
- Severity: blocker | major | minor
- Player path: who hits it (e.g. first-time player, enthusiast on Expert,
  controller-only player, phone player, returning player)
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
