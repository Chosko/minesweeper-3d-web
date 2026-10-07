# Minesweeper 3D

Minesweeper 3D is a premium Minesweeper game for Steam, aimed at players who
take Minesweeper seriously. It offers a classic 2D mode that plays exactly
like the reference implementation enthusiasts already trust, a 3D mode where
the board is a box of cubes flown through in first person, and campaigns of
hand-designed levels for both. Every board can be played no-guess, every game
is measured with the stats competitive players track, and personal records,
replays and Steam leaderboards give the game its long tail. It is a
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
- **Classic 2D** — Beginner, Intermediate, Expert and Custom boards, with a
  no-guess switch.
- **3D** — the 3D presets and custom boards, with a no-guess switch.
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
- **Campaigns are designed, not generated.** Separate campaigns for 2D and 3D,
  and per difficulty within each. Levels form a fixed sequence, each unlocked
  by beating the previous one. Levels use standard rules on unusual board
  shapes and boards with holes — shapes matter most in 3D.
- **Local records are the competitive backbone.** Personal bests, stats
  history and replays live on the player's machine (synced by Steam Cloud);
  Steam leaderboards rank the standard boards — each 2D difficulty with and
  without no-guess, and the 3D presets. Custom boards get no leaderboard.
- **Visual direction: modern and catchy, with nothing decorative that does not
  serve play.** The current 3D look is the bar for both modes.
- **Mouse and keyboard first.** Controllers are supported; touch and mobile
  are not.
- **Platforms.** Windows at launch. Mac and Linux only if the port is close to
  free. Steam Deck Verified is a stretch goal.
- **A free demo with fixed locks.** The demo offers unlimited 2D Beginner,
  Intermediate and Expert boards, unlimited 3D Beginner boards, and the first
  5 levels of each campaign (unlocked by progression as usual). Everything
  else is locked: custom boards, the harder 3D presets, and pro options such
  as no-guess.
- **The browser build stays public until the Steam release**, as the
  author's work-in-progress preview. What happens to it after release is not
  decided.
- **Constraint:** the game is built with web technology and packaged as a
  desktop build for Steam.

## High-level features

<One subsection per high-level feature, from the player's angle — filled in
PHASE 5.>
