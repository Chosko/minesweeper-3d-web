# The reviewer roles

Authority for: the role catalogue — each role's id, the path it walks and
what it measures — and how a panel is chosen from it.

Read by `../SKILL.md` at ARGUMENTS, to check `--roles`, and at PANEL, to
write each role brief.

---

## Choosing the panel

- The default panel is every role below. The mode specialist appears once per
  mode that plays unlike the genre's reference, with the id `mode-<mode>`
  (`mode-3d` for a first-person 3D mode). A game with no such mode has no
  mode specialist.
- A role brief is the role's section below, its path rewritten against this
  game's screens, modes, presets and inputs, by name.
- The role id is the agent's scratch folder and its folder under
  `docs/<name>/`.

## first-run — First-run and casual UX

Walks, in fresh browser contexts:

- launch → main menu → every help surface → each mode's board choice;
- presets, then the custom form at its limits: minimum, maximum, invalid and
  empty values;
- a first game in each mode, to a loss and to the results screen;
- pause, restart and leave confirmations, Play again;
- Records and Settings while empty;
- error and empty states: storage blocked, pointer lock refused, renderer
  unavailable;
- viewports 1024×768, 1280×800 and 1920×1080, both themes;
- back to each board choice, to see what it remembers.

Measures: clicks from launch to play in each mode; what each help surface
says in each mode; the wording of every empty and error state.

## game-design — Game design

Walks every preset in every mode, standard and with each assist (no-guess):
the first click, a loss, a win, the rule edge cases (chord on a satisfied
number, flag-all on a number, zero-mine boards, the generator's failure
offer) and the progression the screens offer.

Measures, offline under Node with the game's own engine, generator and
solver, over 100 seeds per preset and first-click spot: density, mines per
neighbourhood, share of zero cells, median 3BV, how often a first click
opens, share of boards solvable by logic alone, assisted-generation time and
failures. The report carries the table its findings rest on.

Looks for: gaps in the difficulty curve, readability of the numbers, traps
(an action that lets a player brute-force the board, or lose without a
decision), progression and pull.

## mode-\<mode\> — Mode specialist

One per distinctive mode; for first-person 3D, walks the mode's own loop:
entry card → spawn → movement → aiming → reading the numbers → HUD →
feedback (sound, effects, end effects) → pause and its confirmations → a loss
and a win → the replay of each.

Measures: what the spawn view frames, aim precision at spawn distance, each
view mode's behaviour, the end effect's duration, the camera inside the
board.

## input-a11y — Input and accessibility

Walks every screen and every mode with:

- **keyboard only**;
- **a controller** — a faked standard pad, then another vendor's id: menus,
  forms, play, results, Records, the replay viewer, disconnect and
  reconnect;
- **touch** on emulated phones and tablets in both orientations: tap,
  long-press, two-finger tap, swipe;
- **mouse** conventions: press against release, drag-off, both-button chord,
  middle button, wheel, pan;
- **vision**: colour-vision simulation of the number colours, contrast in
  both themes, 200 % zoom, forced colours, reduced motion;
- **cognitive load**: what a player must hold in mind;
- **semantics**: focus order, focus restore, focus containment in overlays,
  roles and names.

Measures: which input class reaches play in which mode; contrast ratios and
colour distances; the result of the project's own contrast tests.

## enthusiast — Enthusiast and retention

Walks in one persistent browser profile, so records and replays accumulate:

- the grind loop on the hardest presets of each mode: many games, restarts,
  abandons, a browser killed mid-game;
- input feel at speed;
- results figures checked by hand (3BV, clicks, efficiency) against seeds
  forced through the game's generator;
- Records over many games; replays of a win, a loss and an abandon;
- returning-player paths; integrity: pause, kill, the leave guard, what a
  crash does to a record;
- the viewports a laptop has.

Measures: the cost of the loop between two games (end delay, cards, inputs);
the precision of every results figure; whether every figure matches the hand
computation.
