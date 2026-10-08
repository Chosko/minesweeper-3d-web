# Minesweeper 3D

Minesweeper 3D is a premium Minesweeper game for Steam, aimed at players who
take Minesweeper seriously. It offers a classic 2D mode that plays exactly
like the reference implementation enthusiasts already trust — on square,
hexagonal and triangle grids — a 3D mode where the board is a box of cubes
flown through in first person, a Surface mode where tiles cover the surface
of a 3D shape, and campaigns of designed levels. Every board can be played
no-guess, every game is measured with the stats competitive players track,
and personal records, replays, a daily board and Steam leaderboards give the
game its long tail. It is a
self-contained, single-player game: bought once, played offline.

Technical foundations (stack, architecture, hosting) are recorded in
[technical-direction.md](./technical-direction.md), not here.

## Target users

**Minesweeper enthusiasts on Steam.** Players who already know the game
deeply — they chord, they know what 3BV is, they care about guessing and
input feel. They search Steam for Minesweeper and compare the available
implementations before spending money, and today they find the options
unconvincing: clones that get the rules or the feel subtly wrong, or puzzle
games that are about Minesweeper rather than being it. They want a Minesweeper
they can grind for personal bests, and a reason to keep coming back.

For them the 3D mode is a new challenge on top of the game they have
mastered — hard enough that it comes with its own campaign as the route in.

## User experience and key flows

The game opens on a main menu. The flows below describe how players are
expected to use the game; none of them is enforced — from the menu any
unlocked mode is one click away, and the only thing that gates content is the
campaign's level order (and, in the demo, the demo's locks).

**Main menu.**

- **Start / Continue** — on first launch the button reads *Start* and opens
  the first 2D campaign level. Once there is progress it reads *Continue* and
  resumes the next unbeaten campaign level, or the last mode played.
- **Campaign** — choose 2D or 3D, then a difficulty, then a level from the
  sequence; locked levels are visible but not playable.
- **Classic 2D** — square, hexagonal or triangle grid; Beginner,
  Intermediate, Expert and Custom boards; a no-guess switch.
- **3D** — the 3D presets and custom boards, with a no-guess switch.
- **Surface** — a shape to play on, with a no-guess switch.
- **Daily** — today's 2D board and today's 3D board.
- **Records** — personal bests, stats history and the replay library.
- **Leaderboards** — Steam global and friends rankings, with the replay
  attached to each entry.
- **Settings** — controls, graphics, audio, accessibility.
- **Quit.**
- Achievements have no menu entry; they live in Steam's overlay.
- In the demo only, a **Buy full game** entry; locked content stays visible in
  the menus.

**First launch.** The player lands on the main menu. Nothing starts
automatically. *Start* drops them into the first level of the 2D campaign,
which works as a gentle introduction; finishing it unlocks the next level.

**The enthusiast loop.** The player opens Classic 2D, picks Expert with
no-guess on, and plays. The results screen shows the time, 3BV/s, efficiency,
the comparison against their personal best, and their Steam global and
friends rank. They can watch the replay, then play again in one step.

**The 3D on-ramp.** A player curious about 3D starts the 3D campaign rather
than free play. Its early levels are small, oddly shaped boards that teach
reading numbers in depth; as levels unlock, boards grow and shapes get more
demanding, until free 3D play is within reach.

## Design decisions

- **A game, not a platform.** Single-player and self-contained: no accounts,
  no servers, no online services of its own. Online features are limited to
  what Steam itself provides — achievements, cloud saves and leaderboards.
- **Fully playable offline.** Achievements and leaderboard submissions sync
  when a connection returns.
- **The 2D mode is real, classic Minesweeper.** Its logic reproduces
  Minesweeper Online exactly. It is drawn as a flat 2D board, never as a 3D
  scene. It is built new and does not derive from the 3D mode.
- **The 3D mode is the existing 3D game, made one mode among several.** Its
  look, controls and feel are kept. Its rules change in two ways: the first
  click is always safe, and a no-guess option is available.
- **No-guess boards and competitive stats are core, not extras.** Every mode
  offers no-guess generation; every game records the stats enthusiasts track
  (3BV, 3BV/s, efficiency) and a replay.
- **Campaign levels are designed challenges, not fixed boards.** Separate
  campaigns for 2D and 3D, and per difficulty within each. Levels form a fixed
  sequence, each unlocked by beating the previous one. A level fixes its board
  shape, holes and difficulty profile; its mines are placed afresh on every
  attempt within that profile, so a replay is never solved from memory.
  Levels use standard rules on unusual board shapes and boards with holes —
  shapes matter most in 3D.
- **Standard Minesweeper rules only.** No variant logic rules (multi-mine
  cells, partial-neighbour numbers, lying numbers, row totals). Variety comes
  from board shapes, grids and ways to play, not from new rules.
- **Local records are the competitive backbone.** Personal bests, stats
  history and replays live on the player's machine (synced by Steam Cloud).
- **Steam leaderboards cover every comparable board:** the standard
  free-play boards of each mode and grid (with and without no-guess), every
  campaign level, and each day's daily boards. Free-play boards rank by
  time; campaign levels and daily boards rank by 3BV/s, since every attempt
  is a different board, and still record and show the time. Custom boards get no leaderboard.
- **Visual direction: modern and catchy, with nothing decorative that does not
  serve play.** The current 3D look is the bar for every mode.
- **Mouse and keyboard first.** Controllers are supported in every mode;
  touch and mobile are not.
- **Platforms.** Windows at launch. Mac and Linux only if the port is close to
  free. Steam Deck Verified is a stretch goal.
- **A free demo with fixed locks.** The demo offers unlimited 2D Beginner,
  Intermediate and Expert boards on the square grid, unlimited Beginner boards
  on the hexagonal and triangle grids, unlimited 3D Beginner boards, and the
  first shape of the Surface mode, and the first 5 levels of each campaign
  (unlocked by progression as usual).
  Everything else is locked: custom boards, Intermediate and Expert on the
  hexagonal and triangle grids, the harder 3D presets, and pro options such as
  no-guess.
- **The browser build stays public until the Steam release**, as the
  author's work-in-progress preview. What happens to it after release is not
  decided.
- **Constraint:** the game is built with web technology and packaged as a
  desktop build for Steam.

## High-level features

Listed in the order a player meets them. The last two are after launch.

### Main menu and game shell

Everything around a game: the main menu (Start / Continue, every mode, Records,
Leaderboards, Settings, Quit), pausing and resuming, restarting, returning to
the menu, and the settings — controls, graphics, audio and accessibility
(colour-blind-safe numbers). Input is mouse and keyboard first, with
controller play available in every mode. *Start* opens the first 2D campaign
level until the player has progress; then *Continue* resumes the next
unbeaten level or the last mode played. Serves every player and every flow;
it is where the first-launch flow begins.

### Classic 2D

Real, flat Minesweeper whose logic reproduces Minesweeper Online exactly:
reveal, flag, chord, the safe first click, the timer. The player picks a grid —
square, hexagonal (6 neighbours) or triangle (12 neighbours) — and a size:
Beginner, Intermediate, Expert, or a custom size and mine count. A no-guess
switch generates boards solvable by logic alone. The look is modern and clean,
with nothing that distracts from reading the board. Serves the enthusiast
loop.

### 3D mode

The existing 3D game as one mode among several: a box of cubes, each with up
to 26 neighbours, flown through in first person, with solved cells hiding
themselves and the Shift / Space / Ctrl view modes for seeing inside. The
first click is always safe, and a no-guess switch is available. Presets from
small to very large, plus custom boards. Serves the 3D on-ramp, once the
campaign has taught the player to read numbers in depth.

### Surface

A mode in which 2D tiles cover the surface of a 3D shape — cube, sphere, torus
and other simple solids at launch, recognisable models possibly later. The
player turns the object to see every side instead of flying through it. Tiles
on corners and seams have unusual neighbour counts, and the game makes those
neighbourhoods readable. Standard rules, a safe first click and a no-guess
switch, as in the other modes. It looks and feels exactly like the 2D game —
the same tiles, numbers and interactions — with navigation around the object
as the only difference. Distinct from the 3D mode and never called "3D". It
has free play and leaderboards, and no campaign. Serves enthusiasts looking for a new challenge between flat 2D and full
3D.

### Campaign system

The structure that carries the player through designed levels: separate
campaigns for 2D and 3D, each split by difficulty, each a fixed sequence of
levels where beating one unlocks the next. Locked levels are visible. Each
attempt at a level gets a freshly generated board that matches the level's
designed shape and difficulty profile. Progress is saved and synced. Serves
the first-launch flow and the 3D on-ramp.

### Campaign levels

The content itself: the designed levels of every campaign, each defined by a
board shape (often unusual, with holes), a mine density and a difficulty
profile, ordered so each campaign teaches before it tests. The 3D campaign
starts with small, oddly shaped boards that teach reading numbers in depth and
builds towards full free 3D play. The first level of the 2D campaign is a
gentle introduction for a new player. A body of design work distinct from the
system that plays it.

### Daily board

One 2D board and one 3D board per day, the same for every player, worked out
from the date so no server is needed. Each day's board has its own Steam
leaderboard, ranked by 3BV/s. Gives enthusiasts a reason to return every day.

### Results and records

The end-of-game screen — time, 3BV, 3BV/s, efficiency, the comparison with the
personal best, and the Steam global and friends rank — with *Play again* and
*Watch replay* one step away. Behind it, the Records screen: personal bests
per board, stats history (3BV/s and efficiency over time, win rate, streaks).
Serves the enthusiast loop.

### Replays

Every finished game is recorded. The player can watch any game back, keep it
in a replay library, and watch the replay attached to a leaderboard entry —
their own or someone else's. Replays survive game updates. Serves the
enthusiast loop and keeps leaderboards honest.

### Steam features

The game's presence on Steam: leaderboards (global, friends, and around the
player's own rank) for every board listed under Design decisions, with a
replay attached to each entry; achievements, shown through Steam's overlay;
and cloud saves for progress, records and replays. Everything works offline
and syncs when a connection returns.

### Demo edition

The free demo build: the content listed under Design decisions, with locked
content visible in the menus rather than hidden, and a *Buy full game* entry
that opens the store page. Serves players deciding whether to buy.

### Endless board *(after launch)*

A board that keeps growing as the player clears towards its edge. The run ends
at the first mine; there is no recovery, only a restart on a newly generated
board. The score is the area cleared.

### Marathon and Zen *(after launch)*

Marathon: a run of several boards against a single clock. Zen: play with no
timer and no stats, for relaxed sessions.
