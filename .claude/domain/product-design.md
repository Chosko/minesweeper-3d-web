# Minesweeper 3D

Minesweeper 3D is a premium Minesweeper game for Steam, aimed at players who
take Minesweeper seriously. It offers flat modes that play exactly like the
reference implementation enthusiasts already trust — Classic 2D on the square
grid, Hexagon and Triangle on their own grids — a 3D mode where the board is a box of cubes
flown through in first person or, by a Controls setting, orbited around its
centre, a Surface mode where tiles cover the surface
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
- **Campaign** — choose 2D or 3D, then a chapter and a level in it; locked
  levels are visible but not playable.
- **Classic 2D** — the square grid: Beginner, Intermediate, Expert and
  Custom boards; a no-guess switch.
- **Hexagon** — the hexagonal grid, with the same board choice and no-guess
  switch.
- **Triangle** — the triangle grid, with the same board choice and no-guess
  switch.
- **Surface** — a shape to play on, chosen inside Surface, with a no-guess
  switch.
- **3D** — the 3D presets and custom boards, with a no-guess switch.
- **Daily** — today's board of every mode.
- **Records** — personal bests, stats history, the replay library and, in a
  tab of their own, the Steam global and friends leaderboards, with the
  replay attached to each entry.
- **Settings** — controls, graphics, theme, audio, accessibility.
- **Quit.**
- Every mode entry is enabled from the start: a mode not built yet opens a
  *Coming soon* page.
- The menu opens with the last mode played selected; its board choice opens
  on the last board played.
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

**The 3D on-ramp.** A player curious about 3D starts with Learn 3D on the 3D
board choice: one small guided box whose prompts teach that a number counts
the mines among up to 26 cubes in three layers and that solved cubes
disappear, with no timer and no records. Its win offers Cube Intro, the
smallest real cube. The 3D campaign follows, ahead of free
play: its early levels are small, oddly shaped boards that teach reading
numbers in depth; as levels unlock, boards grow and shapes get more
demanding, until free 3D play is within reach.

## Design decisions

- **A game, not a platform.** Single-player and self-contained: no accounts,
  no servers, no online services of its own. Online features are limited to
  what Steam itself provides — achievements, cloud saves and leaderboards.
- **Fully playable offline.** Achievements and leaderboard submissions sync
  when a connection returns.
- **The flat modes are real, classic Minesweeper.** The logic of Classic 2D,
  Hexagon and Triangle reproduces Minesweeper Online, played with its default
  options, exactly. Each is drawn as a flat 2D board, never as a 3D scene, and
  is built new rather than derived from the 3D mode.
- **The 3D mode is the existing 3D game, made one mode among several.** Its
  controls and feel are kept, and its look follows the chosen theme, except that a game starts framed from a
  three-quarter view with the whole box in sight instead of the original's
  start pose, and the scene gains a return to that view (a key and a pause
  card action), an arrow toward the box while it is out of view, and a faint
  ground grid below it; holding Ctrl shows hidden cells as translucent ghosts
  instead of opaque cubes, and a number plays a short pulse before it hides.
  Flying changes in four ways: forward follows the view, so the camera goes
  where the player looks; cubes near the camera fade to glass and cannot be
  picked, so the crosshair selects the first cube beyond them; the spacing
  steps 0.1 a notch with acceleration, has a toggle key between 1.1 and 2.0
  and carries the camera with it, keeping the framing; and the field of view
  is a setting.
  Its look also gains readability aids: a readout beside the crosshair
  counting the aimed number's unopened and flagged neighbours, the Shift
  neighbourhood drawn over the faded cubes, and numbers dimmed by depth under
  Space.
  Its rules change in three ways: the first click is always safe, a no-guess
  option is available, and a second right-click on a number takes back only
  the flags the first placed. Its games end on the shared results screen.
- **No-guess boards and competitive stats are core, not extras.** Every mode
  offers no-guess generation; every game records the stats enthusiasts track
  (3BV, 3BV/s, efficiency) and a replay.
- **Campaign levels are designed challenges, not fixed boards.** One campaign
  per dimension, 2D and 3D, each a single fixed sequence of levels grouped into
  chapters, with difficulty rising from easy to hard; each level is unlocked by
  beating the previous one. A level fixes its board
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
  free-play boards of each mode (with and without no-guess), every
  campaign level, and each day's daily boards. Free-play boards rank by
  time; campaign levels and daily boards rank by 3BV/s, since every attempt
  is a different board, and still record and show the time. Custom boards get no leaderboard.
- **Visual direction: modern and catchy, with nothing decorative that does not
  serve play.** The game is drawn in a catalogue of themes the player picks
  from; the screens share one layout and each theme restyles it. Each theme
  is one fixed look, with no light or dark variant. *Joyful tiles* is the
  first theme and the default on first launch.
- **Pausing hides the board in every mode.** The board is covered and the
  clock keeps running, so pausing never buys free study time and records
  stay comparable across modes; each game records its pauses — their count
  and total time, and in its replay their spans, shown on the replay seek
  bar.
- **Mouse and keyboard first.** Controllers are supported in every mode;
  touch is supported in Classic 2D and in 3D, where a touch-only device
  plays lockless by touch.
- **Platforms.** Windows at launch. Mac and Linux only if the port is close to
  free. Steam Deck Verified is a stretch goal.
- **A free demo with fixed locks.** The demo offers unlimited Classic 2D
  Beginner, Intermediate and Expert boards, unlimited Hexagon and Triangle
  Beginner boards from their own main-menu entries, unlimited 3D Beginner
  boards, the first shape of the Surface mode, the first 5 levels of each
  campaign (unlocked by progression as usual), and 3 of the themes, chosen
  when the demo is designed.
  Everything else is locked: the Intermediate and Expert boards of Hexagon
  and Triangle, custom boards in every mode, the harder 3D presets, the other
  themes, and pro options such as no-guess. In the full game every theme is
  unlocked.
- **The browser build stays public until the Steam release**, as the
  author's work-in-progress preview. What happens to it after release is not
  decided.
- **Constraint:** the game is built with web technology and packaged as a
  desktop build for Steam.

## High-level features

Listed in the order a player meets them. The last two are after launch.

### Main menu and game shell

Everything around a game: the main menu (Start / Continue, Campaign, the
Classic 2D, Hexagon, Triangle, Surface and 3D modes, Daily, Records,
Settings, Quit), pausing and resuming, restarting, returning to
the menu, and the settings — controls, graphics, the theme, picked from a
list of the catalogue's themes, audio and accessibility (colour-blind-safe
numbers, and after launch a reduced-motion setting, on or off, whose first
value is taken from the operating system's reduce-motion preference and which
governs all motion, as the Visual design system describes). Input
is mouse and keyboard first, with controller play available in every mode and touch play in Classic 2D and 3D. *Start* opens the first 2D campaign
level until the player has progress; then *Continue* resumes the next
unbeaten level or the last mode played, with Hexagon and Triangle each
counted as a mode of their own. Each mode keeps the player's last board
choice. Serves every player and every flow;
it is where the first-launch flow begins.

### Visual design system

The one visual language every mode and screen is drawn in, held to the visual
direction under Design decisions: one shared layout for the menus, the
in-game window around a board (timer, mine counter, restart, pause, and the
live figures — 3BV progress, pace against the personal best, 3BV/s, clicks
and flags) and the results screen, and a catalogue of themes that style it. The
player picks a theme from a list on the Settings page; *Joyful tiles* is
the default until they pick. The shared layout is designed together with
*Joyful tiles*, and both are finished: every screen, at every window size
the game supports, is drawn on the Claude Design canvas, with the theme's
tokens and every kit component in every state. Later themes add styles, not
layouts. Buttons, menu entries and board options have one *selected* state,
drawn by the theme rather than as a separate focus ring, and one control
shows it at a time, chosen by the input method in use: moving the mouse
selects the control under the pointer, keys and controller buttons move the
selection from control to control, and once a key or button is pressed the
pointer's hover counts for nothing until the mouse moves again. A chosen
board option keeps its own mark, so selected and chosen stay apart.

A theme is one fixed look and changes more than colour: borders and bevels,
shadows, corner radii, fonts, window chrome (such as a title bar with
decorative buttons) and the counter readouts. It restyles a fixed set of
named screen components and their parts, and may fill optional decoration
slots. It also styles every board: the tiles and the number colours, with a
colour-blind-safe number set for the accessibility setting, and in the 3D
scene the sky, fog and background, the cubes in every state and the number
colours 1–26. Every mode applies it to its own board,
so moving between modes never feels like moving between games. Each theme's
fonts ship with the game, so every theme works offline.

Each theme has its own motion. Buttons, toggles, cards and the other screen
components move in the theme's own style. Board cells move by the theme's
description of each cell event — press, release, reveal, flag, unflag,
chord press and the solved pulse — built from a fixed set of movements:
scaling, sliding, flipping about an axis (showing the other face halfway),
deepening a shadow or bevel, brightening and fading, each with its duration
and easing; one theme presses a cell down, another flips it. Motion is only
visual: it never delays input, the game, the timer or replays.

Until launch the game's one reduced-motion behaviour is the shipped one: when
the operating system asks for reduced motion, the menus and screens drop
their animations and transitions. That behaviour stays as it is, and no
theme overrides it. Nothing else reads the preference: cell motion always
plays, as the 2D and 3D game effects and pulses do. After launch the
reduced-motion setting in Settings governs all motion — screen animation,
cell motion, and the 2D and 3D game effects and pulses.

Themes are designed in Claude Design, each delivered as its screens plus one
catalogue of its components. More themes are added over time: once the
theme system exists, a new theme is added by a dedicated Claude skill
whenever it is ready, outside the milestone schedule and without a backlog
task. Serves every player and every flow.

### Classic 2D

Real, flat Minesweeper on the square grid, whose logic reproduces
Minesweeper Online, with its default options, exactly: reveal, flag, chord,
the safe first click, the timer. The player picks a size: Beginner,
Intermediate, Expert, or a custom size and mine count. A no-guess switch
generates boards solvable by logic alone. It is drawn in the visual design
system. Serves the enthusiast loop.

### Hexagon

Classic 2D's game on a hexagonal grid, where each tile has 6 neighbours: the
same rules, timing, board choice — Beginner, Intermediate, Expert or Custom —
and no-guess switch, as a mode of its own with its own main-menu entry. Serves
enthusiasts looking for a fresh flat board.

### Triangle

Classic 2D's game on a triangle grid, where each tile has 12 neighbours: the
same rules, timing, board choice — Beginner, Intermediate, Expert or Custom —
and no-guess switch, as a mode of its own with its own main-menu entry. Serves
enthusiasts looking for a fresh flat board.

### 3D mode

The existing 3D game as one mode among several: a box of cubes, each with up
to 26 neighbours, flown through in first person or, by a Controls setting,
orbited around its centre, with solved cells hiding
themselves and the Shift / Space / Ctrl view modes for seeing inside. The
first click is always safe, and a no-guess switch is available, except on a
box with a side of exactly 2 cells, which can never be solved without
guessing. The Intro, Beginner, Intermediate and Expert cubes, plus custom
boards; flat boards are Classic 2D's. When a game ends, its win or
loss effect plays — on a loss, the wave that shows where the mines were —
and then the results screen shows over the dimmed board; from it the
player can choose to fly over the frozen finished board, read-only. Serves
the 3D on-ramp, once Learn 3D and the campaign have taught the player to
read numbers in depth.

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

The structure that carries the player through designed levels: one campaign
for 2D and one for 3D, each a single fixed sequence of levels grouped into
chapters, where beating one level unlocks the next. The player picks a chapter,
then a level in it; locked levels are visible. Each
attempt at a level gets a freshly generated board that matches the level's
designed shape and difficulty profile. Progress is saved and synced. Serves
the first-launch flow and the 3D on-ramp.

### Campaign levels

The content itself: the designed levels of every campaign, each defined by a
board shape (often unusual, with holes), a mine density and a difficulty
profile, ordered from easy to hard across the campaign's chapters so each
campaign teaches before it tests. The 3D campaign
starts with small, oddly shaped boards that teach reading numbers in depth and
builds towards full free 3D play. The first level of the 2D campaign is a
gentle introduction for a new player. A body of design work distinct from the
system that plays it.

### Daily board

One 2D board and one 3D board per day, the same for every player, worked out
from the date so no server is needed. The Daily screen lists every mode in
menu order; a mode not built yet shows *Coming soon* and cannot be played.
Each day's board has its own Steam leaderboard, ranked by 3BV/s. Gives
enthusiasts a reason to return every day.

### Results and records

The end-of-game screen — time, 3BV, 3BV/s, efficiency, the comparison with the
personal bests, and the Steam global and friends rank — with *Play again* and
*Watch replay* one step away. Behind it, the Records screen: personal bests
per board, stats history (3BV/s and efficiency over time, win rate, streaks),
the replay library and the board's leaderboards.
Each board keeps three bests from won games — fastest time, best 3BV/s and
best efficiency — and every exact size, mine count and no-guess setting is
its own board, custom boards included; a 3D board is named by its X × Y × Z
size. Win rate and streaks are kept per board and per mode, never combined
across 2D and 3D, and the Records screen switches between the two modes. A
game restarted, left, or ended by closing the game after its first click
counts as a loss and breaks the win streak. Beside those reference figures
each board and mode keeps the completed games' ones — a win rate over the
games played to a win or a loss, and the best streak among them, which a
restarted or left game neither extends nor breaks — so a player who
restarts bad openings keeps figures that mean something. Serves the
enthusiast loop.

### Replays

Every finished game is recorded, movement included — the cursor in 2D, the
camera in 3D — so watching it back looks like watching the player. The
player can watch any game back, keep it in a replay library, and watch the
replay attached to a leaderboard entry — their own or someone else's. The
library keeps the most recent games and every pinned replay: a game that
set a personal best is pinned automatically, and the player can pin any
other. Replays survive game updates. Serves the enthusiast loop and keeps
leaderboards honest.

### Steam features

The game's presence on Steam: leaderboards (global, friends, and around the
player's own rank) for every board listed under Design decisions, with a
replay attached to each entry; achievements, shown through Steam's overlay;
and cloud saves for progress, records and replays. Everything works offline
and syncs when a connection returns.

### Demo edition

The free demo build: the content listed under Design decisions — 3 themes
among them — with locked content, the other themes included, visible in the
menus and the Settings theme list rather than hidden, and a *Buy full game* entry
that opens the store page. Serves players deciding whether to buy.

### Endless board *(after launch)*

A board that keeps growing as the player clears towards its edge. The run ends
at the first mine; there is no recovery, only a restart on a newly generated
board. The score is the area cleared.

### Marathon and Zen *(after launch)*

Marathon: a run of several boards against a single clock. Zen: play with no
timer and no stats, for relaxed sessions.
