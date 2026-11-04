# Product roadmap

The order in which Minesweeper 3D gets built, from the first playable piece
of the new game to the 1.0 Steam release and what follows it. Each milestone
states the outcome it delivers, what makes it shippable, why it sits where it
does, and the share of each high-level feature in
[product-design.md](./product-design.md) it takes on.

Strategy: enthusiasts judge a Minesweeper game by its core loop — exact
rules, no-guess boards, stats and records — so that loop is built first, on
the web preview where progress is visible and testable. The game moves onto
Steam as soon as there is a loop worth putting there, because the Steam
integration is the largest technical unknown and should be proven early.
The game's shipping look — the theme catalogue over a redesigned screen
layout — lands before the Steam work is finished, so the screens Steam adds
are drawn once, in the look that ships.
Content follows — campaigns, then the daily board and the demo — up to the
"core complete" bar, which is the game's first public release candidate
whether or not it ships through Early Access. Hexagon and Triangle join right
after the shipping look, ahead of Steam, because they reuse the shipped rules
engine and Classic 2D flow and need no Steam work. Breadth — Surface and the
rest of the campaign levels — closes 1.0, and new ways to play come after
launch.

---

## m1-classic-2d — Real Minesweeper on the web preview

Goal: an enthusiast can play Classic 2D on the web preview and gets the
rules, no-guess boards and stats they expect from Minesweeper Online, inside
the game's new look.

Exit criteria:
- Classic 2D plays Beginner, Intermediate, Expert and custom boards on the
  square grid, and its rules match Minesweeper Online on every action.
- No-guess boards are available at every size and never require a guess.
- Every finished game shows time, 3BV, 3BV/s, efficiency and the
  personal-best comparison; personal bests and stats history persist.
- The new main menu, the 2D board, the in-game overlay and the results
  screen are drawn in the visual design system, in both themes.
- The existing 3D game is still playable from the new menu.
- Classic 2D is fully playable with a controller.

Rationale: the core loop is what the target players judge first and what
every later milestone builds on; the visual language has to exist before the
first new screens, or they are designed twice.

Covers:
- product-design.md § Visual design system — palette and type, light and
  dark themes, square-grid tiles and number colours, the menus, the in-game
  overlay and the results screen. No hexagonal or triangle tiles, no Surface
  styling, no colour-blind-safe number set unless it falls out of the base
  palette; the 3D mode keeps its current look.
- product-design.md § Classic 2D — square grid only, the four sizes, the
  no-guess switch, controller play. No hexagonal or triangle grids.
- product-design.md § Main menu and game shell — the new menu with Classic
  2D, 3D, Records and Settings; pause, restart and back to menu; settings for
  controls, graphics and audio. No Start/Continue, Campaign, Daily, Surface or
  Leaderboards entries, no demo entries.
- product-design.md § Results and records — the results screen, personal
  bests per board, and stats history. No Steam ranks on the results screen.

---

## m2-3d-joins — 3D as a full member of the game

Goal: the 3D mode plays by the game's rules and shares its records, and any
finished game in either mode can be watched again.

Exit criteria:
- 3D games always open with a safe first click and offer the no-guess
  switch.
- 3D games feed the same results screen, personal bests and stats history as
  Classic 2D.
- Every finished 2D and 3D game is recorded, can be played back, and is kept
  in a replay library that survives game updates.

Rationale: before the game goes onto Steam, both launch modes need to share
one set of rules and records, and replays need to exist so leaderboard
entries can carry them.

Covers:
- product-design.md § 3D mode — safe first click, the no-guess switch, and
  shared results and records. No visual redesign of the 3D scene.
- product-design.md § Replays — recording, playback and the local replay
  library for 2D and 3D. No replays attached to leaderboard entries.
- product-design.md § Results and records — 3D games added to the results
  screen, personal bests and stats history.

---

## m2b-themes — The game wears its shipping look

Goal: the player picks the game's look from a catalogue of themes, starting
with *Joyful tiles*, over a redesigned layout of every screen, and a new
theme can join the catalogue whenever it is ready without being scheduled.

Exit criteria:
- Settings lists the catalogue's themes; picking one restyles every screen
  and every board at once. *Joyful tiles* is the default on first launch, and
  a player who had stored a light or dark choice lands on *Joyful tiles*.
- The light and dark looks are gone from the game.
- The menus, the in-game overlay, the results, Records and Settings screens
  and the other screens of the game at this point are drawn in the
  redesigned shared layout, styled by *Joyful tiles*.
- The Classic 2D tiles, the 3D cubes in every state, the numbers in both
  modes and the 3D sky, fog and background follow the theme.
- Board cells move as the theme describes each cell event; motion never
  delays input, the game, the timer or replays, and cell motion always plays,
  as the 2D and 3D game effects do. The shipped rule that drops screen
  animations and transitions under the operating system's reduce-motion
  preference is unchanged, and no theme overrides it.
- Every theme's fonts ship with the game; the game looks the same offline.
- A later theme is added from its Claude Design artboards by the theme skill,
  without a backlog task and without changing the shared layout.

Rationale: the remaining Steam work adds screens — leaderboards, the rank on
the results screen, rebinding in Settings — and building them before the
redesigned layout and its theme contract exist would mean building them
twice; the demo's theme locks in m5-core-complete also need the catalogue to
exist.

Covers:
- product-design.md § Visual design system — the theme system (the
  catalogue and the contract every theme fulfils, per-theme styling of the
  named screen components and decoration slots, themed square tiles and 3D
  cubes, number colours, the 3D sky, per-theme cell motion, fonts shipped
  with the game per theme), the redesigned shared layout of the screens, the
  first theme *Joyful tiles*, the removal of the light and dark looks, and
  the Claude skill that adds a later theme from its Claude Design artboards.
  No second theme, no hexagonal, triangle or Surface styling, no
  colour-blind-safe number set.
- product-design.md § Main menu and game shell — the Settings theme list in
  place of the light and dark choice, and a stored light or dark choice
  carried over to *Joyful tiles*; the Hexagon, Triangle and Surface entries
  enabled, each opening the *Coming soon* page; Leaderboards moved from the
  menu to a Records tab that says they are coming soon; Play again and the
  session strip removed, the menu opening on the last mode played; the Daily
  screen listing every mode; the board code as an option of each board
  choice, and a Random fill for the Classic 2D custom size. No new playable
  mode, no theme locks.
- product-design.md § 3D mode — the cubes, numbers and sky follow the
  chosen theme; the First box presets removed, Learn 3D's win offering Cube
  Intro. No change to its controls, pick rules or rules.

---

## m2c-flat-grids — Hexagon and Triangle join the game

Goal: the player gets two fresh flat boards, Hexagon and Triangle, each a
full mode of its own with the same exact rules, records and replays as
Classic 2D, on the web preview and the desktop build alike.

Exit criteria:
- Hexagon and Triangle are playable from their own main-menu entries, on
  Beginner, Intermediate, Expert and Custom boards, with the no-guess switch.
- Both follow the rules of Minesweeper Online exactly on their grids.
- Both play with the timer, by mouse, keyboard, controller and touch.
- A finished game shows its results with time, 3BV, 3BV/s and efficiency,
  and counts toward personal bests, stats history and replays.
- Each entry keeps its last board choice, and Continue counts each as a mode
  of its own.
- Each day has a Hexagon and a Triangle daily board, identical for every
  player and playable from the Daily screen.
- Hexagonal and triangle tiles are drawn in *Joyful tiles*.

Rationale: the flat modes reuse the shipped rules engine, generator and
Classic 2D flow and need no Steam work, so they land before m3-on-steam, and
m3-on-steam's leaderboards then meet boards the game already plays.

Covers:
- product-design.md § Hexagon — the mode whole on the web preview and the
  desktop build: Beginner, Intermediate, Expert and Custom boards, the
  no-guess switch, rules matching Minesweeper Online exactly, the timer,
  mouse, keyboard, controller and touch play, results with time, 3BV, 3BV/s
  and efficiency, personal bests, stats history and replays. No leaderboards,
  no achievements, no demo offers or locks, no campaign.
- product-design.md § Triangle — the mode whole on the web preview and the
  desktop build: Beginner, Intermediate, Expert and Custom boards, the
  no-guess switch, rules matching Minesweeper Online exactly, the timer,
  mouse, keyboard, controller and touch play, results with time, 3BV, 3BV/s
  and efficiency, personal bests, stats history and replays. No leaderboards,
  no achievements, no demo offers or locks, no campaign.
- product-design.md § Main menu and game shell — the Hexagon and Triangle
  entries each open its own mode instead of *Coming soon*, each keeps its
  last board choice, and Continue counts each as a mode of its own. Surface
  still opens *Coming soon*.
- product-design.md § Daily board — a Hexagon and a Triangle daily board
  each day, Expert with no-guess, worked out from the date and played from
  the Daily screen. No daily leaderboards.
- product-design.md § Visual design system — hexagonal and triangle tiles in
  *Joyful tiles*, the catalogue's only theme, as drawn on its Claude Design
  canvas (https://claude.ai/artifact/LeP32jxNxEnHLUtRwJ3FNC). No Surface
  styling, no colour-blind-safe number set.

---

## m3-on-steam — The game runs as a Steam app

Goal: a private Steam build of the game in which free-play boards are ranked
on Steam leaderboards, progress follows the player through cloud saves, and
the first achievements unlock.

Exit criteria:
- The game installs and runs from Steam on Windows, fully playable offline.
- Free-play standard boards of Classic 2D and 3D have global, friends and
  around-me leaderboards ranked by time, each entry carrying its replay.
- Records, replays and settings sync through Steam Cloud.
- Achievements for Classic 2D and 3D play unlock and show in Steam's
  overlay.
- The web preview still runs everything except Steam, with local-only
  leaderboards.

Rationale: the Steam integration is the largest unknown in the project;
proving it on a working loop before content is added keeps a late surprise
from blocking release.

Covers:
- product-design.md § Steam features — free-play leaderboards with attached
  replays, cloud saves, and achievements for the 2D and 3D modes. Windows
  only. No campaign or daily leaderboards, no campaign achievements.
- product-design.md § Main menu and game shell — the leaderboards in the
  Records screen's Leaderboards tab; the title bar's Quit button, which
  quits the game on the desktop build and shows in the web preview's title
  bar but does nothing there; and, in Settings, rebinding keys, mouse
  buttons and controller buttons for 3D and for the flat modes — Classic 2D,
  Hexagon and Triangle, which share one set of bindings. No Start/Continue
  or Campaign entries.
- product-design.md § Results and records — the Steam global and friends
  rank on the results screen.

---

## m4-campaigns — Campaigns playable

Goal: a new player can be guided through 2D and 3D by the campaigns, from
the first easy level to genuinely hard ones.

Exit criteria:
- The 2D and 3D campaigns each hold at least 30 levels, grouped into
  chapters, rising from easy to hard.
- Every attempt at a level generates a fresh board that matches the level's
  designed shape and difficulty profile.
- Levels unlock in order; locked levels are visible; progress is saved and
  synced.
- *Start* opens the first 2D campaign level on first launch; *Continue*
  resumes the next unbeaten level.
- Every campaign level has a leaderboard ranked by 3BV/s.

Rationale: campaigns are the 3D on-ramp and the clearest difference between
the demo and the paid game; they need the shared rules, records and Steam
leaderboards already in place.

Covers:
- product-design.md § Campaign system — complete for 2D and 3D: chapters,
  ordered unlocks, fresh boards per attempt, saved progress.
- product-design.md § Campaign levels — the first 30 levels of each
  campaign. Not the full set.
- product-design.md § Main menu and game shell — Start/Continue and the
  Campaign entry.
- product-design.md § Steam features — campaign-level leaderboards ranked by
  3BV/s, and campaign achievements.

---

## m5-core-complete — Ready for a first public release

Goal: the game has a reason to return every day and a free demo that sells
it, which makes it ready for a first public release — Early Access, a Next
Fest demo, or both.

Exit criteria:
- One 2D and one 3D daily board each day, identical for every player, and
  each daily board — 2D, 3D, Hexagon and Triangle — with its own leaderboard
  ranked by 3BV/s.
- A demo build with exactly the demo content for what exists at this point:
  unlimited 2D Beginner, Intermediate and Expert on the square grid,
  unlimited 3D Beginner, the first 5 levels of each campaign, 3 themes;
  everything else visibly locked, the other themes included; a *Buy full
  game* entry. The full game has every theme unlocked.
- The game meets the agreed Early Access bar: Classic 2D with no-guess,
  stats, replays and leaderboards; the 3D mode; the first part of each
  campaign; the demo.

Rationale: this is the core-complete bar; the demo and the daily board are
what a public release needs to convert and retain players, and both depend
on the campaigns and leaderboards before them.

Covers:
- product-design.md § Daily board — the 2D and 3D daily boards, and a
  leaderboard for each daily board: 2D, 3D, Hexagon and Triangle. The
  Hexagon and Triangle daily boards themselves are m2c-flat-grids'.
- product-design.md § Demo edition — the locks, visible locked content and
  the *Buy full game* entry, for the content that exists at this milestone;
  3 themes offered, the rest visible and locked in the Settings theme list.
  No theme locks in the full game. The Hexagon, Triangle and Surface locks
  arrive in m6-launch.
- product-design.md § Main menu and game shell — the Daily entry and the
  demo's menu entries.

---

## m6-launch — 1.0

Goal: the complete game as designed: every launch mode and full campaigns.

Exit criteria:
- Hexagon and Triangle have leaderboards for their standard boards.
- Surface is playable on its launch shapes, looks and plays exactly like
  Classic 2D apart from navigating the object, and has leaderboards.
- The 2D and 3D campaigns each hold at least 50 levels.
- The demo carries the first Surface shape and the Hexagon and Triangle
  Beginner boards from their own entries; the rest of Surface and the
  Intermediate, Expert and custom boards of Hexagon and Triangle are locked.
- The full achievement set is in place.

Rationale: breadth comes once the core is proven in public; these additions
make the paid game clearly larger than the demo without touching what is
already shipped.

Covers:
- product-design.md § Hexagon — leaderboards for its standard boards. No
  campaign; the mode itself is m2c-flat-grids'.
- product-design.md § Triangle — leaderboards for its standard boards. No
  campaign; the mode itself is m2c-flat-grids'.
- product-design.md § Surface — the simple launch shapes, its no-guess
  switch and its leaderboards. No recognisable models, no campaign.
- product-design.md § Campaign levels — the remaining levels, up to at least
  50 per campaign.
- product-design.md § Visual design system — the Surface mode in every
  theme of the catalogue, hexagonal and triangle tiles in every theme added
  after *Joyful tiles*, and the colour-blind-safe number set in every theme.
- product-design.md § Demo edition — Hexagon and Triangle Beginner boards
  offered from their own entries, their Intermediate, Expert and custom
  boards locked, and the Surface locks.
- product-design.md § Steam features — leaderboards for Hexagon, Triangle
  and Surface, and the full achievement set.
- product-design.md § Main menu and game shell — the Surface entry as its
  own mode, one entry with its shapes chosen inside it. The Hexagon and
  Triangle entries are m2c-flat-grids'.

---

## m7-after-launch — New ways to play

Goal: give returning players new ways to play the boards they already know.

Exit criteria:
- The Endless board, Marathon and Zen are playable from the menu.
- Settings offers a reduced-motion setting, on or off, whose first value is
  taken from the operating system's reduce-motion preference and which
  governs all motion: screen animation, cell motion, and the 2D and 3D game
  effects and pulses.

Rationale: these modes extend a finished game; none of them is needed to
judge, buy or complete it.

Covers:
- product-design.md § Endless board — the growing board, unrecoverable on a
  mine, restarting on a newly generated board, scored by area cleared.
- product-design.md § Marathon and Zen — both modes as designed.
- product-design.md § Main menu and game shell — the whole reduced-motion
  feature: the on/off setting in Settings, its first value taken from the
  operating system's reduce-motion preference, governing all motion — screen
  animation, cell motion, and the 2D and 3D game effects and pulses.
  No other new accessibility options.

---

## Not now

- Mac and Linux builds — when the Windows build shows the port is close to
  free.
- Steam Deck Verified — when controller play proves comfortable enough, or
  Deck players ask for it.
- Gameplay twists on top of standard rules — when one convinces the author.
- The web build's fate after the Steam release — decided at the Steam
  release.
- Themes after *Joyful tiles* — never scheduled in a milestone; each is
  added by the theme skill when its Claude Design artboards are ready.
- Steam store page artwork (capsules, trailer) — when the store page has to
  go live ahead of m5-core-complete.

## Open sequencing questions

- When to prove the Steam integration: as early as possible, alongside
  m1-classic-2d and m2-3d-joins, so m3-on-steam does not stall on it.
- The demo offers 3 themes, but themes after *Joyful tiles* are added out
  of schedule: m5-core-complete cannot ship its demo until at least two more
  themes have been added, so their designs need to be ready before it.
- Whether m5-core-complete ships publicly as Early Access or stays an
  internal checkpoint before a single 1.0 launch.
