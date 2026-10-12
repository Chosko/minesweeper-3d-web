# Game design analyst (P-21, the anti-chord) — report

## Method

Everything below is measured with the game's own code under Node 22, not played by hand:
the rules engine (`js/engine/rules.js` through `createGame` + `supplyBoard`, the box graph and
the 3D profile for 3D, the square grid and the reference profile for 2D), the generator
(`js/generation/generate.js`, standard and no-guess) and the solver (`js/generation/solver.js`).
Scripts beside this report: `measure-spam.mjs` (the main run, output `results.txt`,
`results.json`) and `measure-variants.mjs` (tighter gates, flags per click, output
`variants.txt`). 100 seeds per preset and per no-guess setting (`seed * 7919 + 13`, the same
seeds as the game-design report), first click as the game's camera invites it: the face-centre
cell of the top face in 3D, the centre cell in 2D. The first click is applied exactly as the
game applies it (reveal, flood fill, auto-hide).

Players simulated on each board:

- **Anti-chord spam (A).** After the first click, pass over every visible number (revealed,
  not auto-hidden, number > 0): if its closed-unflagged neighbours equal its number minus its
  flags, right-click it (the engine's own flag-on-a-number action, which under that condition is
  exactly the proposed anti-chord), then chord it if its flags now equal its number. Repeat the
  pass until one changes nothing or the game ends. Recorded: share of safe cells revealed when
  stuck, boards fully won, passes.
- **Current-rule spam.** Same loop but the right-click is the rule today: flag every closed
  neighbour whatever the number, or unflag them all when none is left to flag. Two orders:
  interleaved (right-click a number, chord it, next number — the director's wording) and
  two-phase (right-click every visible number, then chord every visible number). Capped at
  200 passes; a capped run is an oscillation (flag all / unflag all for ever).
- **Alternative-B spam.** Flag-all unconditional, but a second right-click on the same number
  removes only the flags that number's own right-click added. Both orders.
- **Chord-only spam.** Chord every visible number, never flag: what blind spamming is in 2D
  today and what 3D would offer under alternative E.
- **Trivial-logic solver.** An independent single-constraint solver (closed == remaining mines
  → all mines; remaining == 0 → all safe), written for this report, run on the mine set. It
  must give the same reach as the anti-chord spam.
- **Full solver.** The game's `solve()`: cleared or not, and how many of its deductions came
  from the subset and global stages (reasoning the spam cannot do).
- **Trap size.** On the board as the first click leaves it: how many visible numbers there are,
  on what share of them the anti-chord would fire at once, and how many wrong flags one
  flag-all right-click on an average visible number places today.

Limits: the spam player clicks at engine level, with no camera cost. A real spammer has to
aim at every visible number through a box with occlusion (177 visible numbers after the first
click on no-guess Intermediate, 6 passes), so the spam's wall-clock time is poor; the figures
measure what spam can solve, not how fast. The 2D anti-chord row is hypothetical (the reference
profile has no flag-on-a-number action; it is emulated by flagging each neighbour) and is there
only to answer the 2D question.

## The measured tables

### 1. What blind spam solves with the anti-chord (A), against the logic baselines

Share of safe cells revealed when the spam loop stops; "solved" = boards won by spam alone.
"Trivial" is the independent single-constraint solver; it matched the spam on all 1,200 boards
(0 differing). "Full" is the game's solver. "Multi" = boards where the full solver needed at
least one subset/global deduction, with the share of all its deductions that were such.

| Preset | Boards | First click reveals | Spam revealed, mean (median; p10–p90) | Spam solved | Passes med/max | Trivial cleared | Full cleared | Multi boards / share of deductions |
|---|---|---|---|---|---|---|---|---|
| Cube Beginner 6x6x6/10 | standard | 43 % | 48 % (0 %; 0–100 %) | **35 %** | 1 / 5 | 35 % | 49 % | 14 % / 1.6 % |
| | **no-guess** | 87 % | **98 % (100 %; 94–100 %)** | **70 %** | 3 / 6 | 70 % | 100 % | 30 % / 1.7 % |
| Re-tune 6x6x6/16 | standard | 18 % | 22 % (1 %; 1–91 %) | 5 % | 1 / 7 | 5 % | 28 % | 23 % / 10.2 % |
| | **no-guess** | 61 % | **76 % (86 %; 31–100 %)** | **29 %** | 4 / 10 | 29 % | 100 % | 71 % / 9.5 % |
| Cube Intermediate 8x8x8/40 | standard | 12 % | 19 % (0 %; 0–99 %) | 9 % | 1 / 11 | 9 % | 20 % | 14 % / 3.2 % |
| | **no-guess** | 48 % | **77 % (99 %; 16–100 %)** | **47 %** | 6 / 14 | 47 % | 100 % | 53 % / 4.6 % |
| Re-tune 10x10x10/100 | standard | 4 % | 9 % (0 %; 0–30 %) | 3 % | 1 / 19 | 3 % | 18 % | 15 % / 9.6 % |
| | **no-guess** | 20 % | **52 % (46 %; 4–100 %)** | **26 %** | 7 / 21 | 26 % | 100 % | 74 % / 7.5 % |
| Cube Expert 12x12x8/130 | standard | 2 % | 4 % (0 %; 0–15 %) | 0 % | 1 / 15 | 0 % | 11 % | 14 % / 11.1 % |
| | **no-guess** | 14 % | **34 % (16 %; 4–99 %)** | **6 %** | 3 / 28 | 6 % | 100 % | 94 % / 10.4 % |
| 2D Expert 30x16/99 (hypothetical anti-chord) | standard | 3 % | 8 % (0 %) | 0 % | 1 / 26 | 0 % | 3 % | 17 % / 5.9 % |
| | no-guess | 11 % | 50 % (55 %; 8–90 %) | 1 % | 15 / 36 | 1 % | 100 % | 99 % / 5.1 % |

Reading it: on standard boards spam goes nowhere because the first click rarely opens (the
game-design report's finding); the exposure is on no-guess boards, which the director is making
the 3D default. There, spam wins 70 % of Beginner boards outright and leaves a median 0 % of the
board to the player; on Intermediate it wins 47 % and the median board is 99 % done; the
re-tunes lower it to 29 % / 26 % won but still half to three quarters revealed; Expert holds
(6 % won, median 16 % revealed), because 94 % of Expert boards need multi-constraint reasoning
at least once and the spam stops at the first such wall.

Chord-only spam (2D today, 3D under E): revealed exactly the first click's share on every
preset, 0 % solved. A chord without flags never fires.

### 2. What the current rule (and B) costs a spammer

| Preset (no-guess) | Current, interleaved: lost / progress | Current, two-phase: lost (passes) | B, interleaved: lost | B, two-phase: lost |
|---|---|---|---|---|
| Cube Beginner 6x6x6/10 | 0 % / none (100 % oscillate) | 99 % (1) | 98 % | 97 % |
| Re-tune 6x6x6/16 | 0 % / none | 98 % (1) | 93 % | 85 % |
| Cube Intermediate 8x8x8/40 | 0 % / none | 98 % (1) | 91 % | 89 % |
| Re-tune 10x10x10/100 | 0 % / none | 98 % (1) | 80 % | 70 % |
| Cube Expert 12x12x8/130 | 0 % / none | 98 % (1) | 74 % | 57 % |

On standard boards the losses are lower only because the lone first number gives the spam
almost nothing to chord (15–48 % lost, the rest oscillates without progress). No current-rule
or B run solved a board (one Beginner board out of 200 under B).

Why the interleaved current-rule spam never loses: a right-click immediately before the chord
on the same number leaves that number either with every closed neighbour flagged (the chord
has nothing to open) or with none flagged (count mismatch, no chord). So flag-all makes blind
spam harmless-and-useless in one order and suicidal in the other. Either way the mechanic
defends itself; what it does not do is defend the player who used it once by mistake.

### 3. The trap today, and what the anti-chord actually places

Measured on the board as the first click leaves it (no-guess), and over every anti-chord
firing in the spam runs (`variants.txt`).

| Preset (no-guess) | Visible numbers after first click (median) | Anti-chord fires at once on | Wrong flags one flag-all right-click places today, mean | Flags per anti-chord firing, mean (p90, max) | Firings that place exactly 1 flag |
|---|---|---|---|---|---|
| Cube Beginner 6x6x6/10 | 92 | 22 % | 2.1 (standard board: 9.0) | 1.06 (1, 4) | 95 % |
| Re-tune 6x6x6/16 | 78 | 9 % | 4.1 (12.2) | 1.11 (2, 4) | 90 % |
| Cube Intermediate 8x8x8/40 | 177 | 9 % | 4.9 (12.8) | 1.11 (2, 4) | 90 % |
| Re-tune 10x10x10/100 | 126 | 4 % | 6.5 (13.3) | 1.13 (2, 5) | 88 % |
| Cube Expert 12x12x8/130 | 103 | 3 % | 7.1 (13.6) | 1.15 (2, 6) | 88 % |

Two things follow. The trap is real: today an average right-click on a visible number places
2 to 7 wrong flags on a no-guess board and 9 to 14 on a standard board (where the one visible
number is a lone number with 17 closed neighbours). And the anti-chord is barely a mass-flag
tool: nine firings in ten place a single flag, the same click a hand flag on that cell would
take. Its value is not fewer clicks; it is (a) aiming at the visible number instead of the
closed cell behind it and (b) the engine deciding which cells are certain, which is the part
that worries the director.

### 4. Tighter gates (variants for alternative D)

Anti-chord spam on no-guess boards when the anti-chord also requires a minimum number of
flags to place, or a maximum number of closed neighbours (`variants.txt`).

| Preset (no-guess) | A as proposed: revealed / solved | Fires only for 2+ flags | Fires only for 3+ flags | Fires only when ≤ 3 closed |
|---|---|---|---|---|
| Cube Beginner 6x6x6/10 | 98 % / 70 % | 90 % / 0 % | 87 % / 0 % | 98 % / 70 % |
| Re-tune 6x6x6/16 | 76 % / 29 % | 65 % / 0 % | 62 % / 0 % | 76 % / 29 % |
| Cube Intermediate 8x8x8/40 | 77 % / 47 % | 55 % / 0 % | 49 % / 0 % | 77 % / 47 % |
| Re-tune 10x10x10/100 | 52 % / 26 % | 24 % / 0 % | 21 % / 0 % | 52 % / 26 % |
| Cube Expert 12x12x8/130 | 34 % / 6 % | 16 % / 0 % | 15 % / 0 % | 34 % / 6 % |

A "2+ flags" gate ends spam wins (a lone last mine must be flagged by hand) and roughly halves
the spam's reach on Intermediate and above, but still hands it 90 % of Beginner and 55 % of
Intermediate. A closed-count cap changes nothing, because nearly every firing is on a number
with 1–2 closed neighbours anyway. Counting the anti-chord as a click does not touch spam: the
spam player's clicks are all effective, its efficiency on solved boards is 90–117 %, better
than a human's. An "assisted flags" stat would label spam, not bound it.

## The answer to the concern

The director is right, in kind and, on the presets that matter most, in degree. The anti-chord
plus chord is a complete single-constraint solver that the player drives without reading: the
independent trivial-logic solver and the spam player reached the identical set of cells on all
1,200 boards. On the no-guess boards that are to become the 3D default, blind spam wins 70 % of
Cube Beginner boards and 47 % of Cube Intermediate boards outright, and the median board of
either is 99–100 % revealed when the spam stops; the re-tunes (6x6x6/16, 10x10x10/100) cut the
wins to 29 % and 26 % but still give spam half to three quarters of the board. Cube Expert
survives (6 % won, median 16 % revealed) because almost every Expert board needs a subset or
global deduction somewhere and spam halts at the first one. Standard boards are safe only
because their first click rarely opens, which is the problem the no-guess default removes. The
harm therefore lands exactly on the newcomer presets the fix was meant to help: it does not
change what is solvable (the trivial reach is the same with or without it), it removes the need
to read the numbers on the boards where reading them is the whole game. Auto-hide makes the loop
sharper still, since the visible numbers are precisely the unfinished frontier. The 2D analogy
does not rescue it, see below.

## Why blind chording in 2D is not brute force, and whether it transfers

In 2D the chord fires only when the player's own flags equal the number, and a wrong flag
chorded is a loss. The chord creates no information: it executes a claim the player has already
made, and punishes a false claim. Measured: chord-only spam reveals nothing beyond the first
click on any preset, 2D or 3D, 0 % solved. Enthusiasts accept blind chording because its yield
is exactly their own reading, delivered faster and at their own risk. The anti-chord is the other
kind of mechanic: it decides which cells are mines, it is never wrong, it costs nothing, and its
output is what makes the next chord fire. Chord is an effector; anti-chord is an oracle. Even a
player who does not spam gets a free oracle from it: a right-click that does nothing says "this
number is not determined on its own", one that fires says "it was" (on no-guess Beginner it
fires at first sight on 22 % of visible numbers). So the 2D argument transfers only to the
reading player who already knows the number is certain and wants one click instead of one per
cell, and the numbers above say that nine times in ten the anti-chord saves that player no
click at all, only an aim. The argument does not transfer to the mechanic, because the
mechanic cannot tell the reader from the spammer.

The one 3D action that does have the 2D chord's shape is today's flag-all: the player claims
"every closed neighbour of this number is a mine", the engine executes it, and a false claim
costs (wrong flags, a wrong counter, a loss on the next chord through them). The numbers say it
defends itself against spam completely (table 2). Its faults are not the rule; they are the
undo that destroys hand flags and the invisibility of what one click did (table 3).

## Alternatives

| | Stops blind brute force | Keeps fast 3D flagging | Keeps the trap cost (risk for careless use) | Effort | Measured support |
|---|---|---|---|---|---|
| **A. Anti-chord as proposed** | **No.** Wins 70 % / 47 % of no-guess Beginner / Intermediate, median board 99–100 % revealed; Expert 6 % won | Partly: 1.06–1.15 flags per firing, 88–95 % single flags; saves aiming, not clicks | **None.** Never wrong, never loses, free oracle on every number | Small rules change, but a new 3D rules version (replays, fidelity tests, spec, help) | Tables 1, 3, 4 |
| **B. Flag-all kept; second right-click undoes only its own flags** | **Yes.** Spam: no progress (interleaved) or 57–98 % lost (two-phase), 0–1 % solved | Yes, fully: one click flags up to 26 cells when the player has deduced them all | Yes, and the trap becomes recoverable in one click (the number stays visible exactly when its flags are wrong, since a satisfied number auto-hides) | Medium: per-number memory of the flags it added, carried through snapshot/restore and replays; a new 3D rules version | Tables 2, 3 |
| **C. Flag-all kept, made visible** (flash the box, scale the sound, tint a negative counter) | Yes (same rule as today) | Yes | Yes, and the player now sees it | Small, UI only, no rules change, no replay impact; the audio already plays a richer "mass flag" for count > 1 (`js/audio.js` `flag(on, count)`), so what is new is the flash and the counter tint | Tables 2, 3 |
| **D. Anti-chord bounded** | "2+ flags" gate: ends spam wins but still 90 % / 55 % of Beginner / Intermediate revealed. Counted click / assisted stat: no effect on spam (its efficiency is 90–117 %). "Only when all closed neighbours are on screen": not measurable here; an interior number's 26 neighbours surround it, so it would in practice restrict the anti-chord to surface numbers and still leave Beginner, whose no-guess board is mostly surface after the first click | Partly | None (still never wrong) | A plus a gate; the on-screen variant puts a rule in the input layer, which replays cannot reproduce | Table 4 |
| **E. Remove right-click on a number** | **Yes.** Chord-only spam: 0 % solved, nothing beyond the first click | **No.** Every flag is one aimed click at a closed cell, often behind other cells | Trap gone with the mechanic | Smallest rules change (marker off in a new 3D rules version), help and spec text | Table 1, chord-only row |

## Recommendation

**B together with C; not A.** Keep today's flag-all as the 3D counterpart of the 2D chord: the
player makes the claim, the engine executes it, a false claim costs. Fix the two things that
make it a trap rather than a tool: (B) a second right-click on the same number removes exactly
the flags that number's right-click added, never a hand flag, so one mistaken click is undone by
one click; (C) show the claim's size: flash the affected cells, keep the count-scaled sound,
tint the mine counter when it goes negative, and say in the Click-to-play card and the help what
right-click on a number does. This stops blind brute force completely (table 2), keeps the one
real speed advantage 3D needs (one click for a 26-cell box the player has read), and keeps the
cost that makes spamming a losing strategy.

Why not A: the measured yield (table 1) makes the no-guess newcomer presets a game of clicking
every visible number twice. Why not E: it removes the only bulk action a 3D player has, and the
numbers show flag-all is not the brute-force risk; its undo and its silence are.

If the director still prefers an always-correct right-click, the least harmful form in the data
is D's "2+ flags" gate (no spam wins, spam reach roughly halved above Beginner), on the
re-tuned densities; but it still gives away 90 % of Cube Beginner and remains an oracle on
every number, so it is a mitigation, not an answer.

Independent of the choice: the no-guess default together with Cube Beginner 6x6x6/10 is
already a 70 %-trivial-logic board (table 1, "Trivial cleared", with no anti-chord at all). The
re-tune to 16 mines brings that to 29 %, which is where the density choice should be argued,
separately from P-21.

## Open questions

- Should the spam exposure be judged on time as well? The simulation ignores aiming; a real
  spammer on no-guess Intermediate must right-click and chord ~177 visible numbers over ~6
  passes. If records are the only concern, A costs little; if the feel of solving is, the
  yield figures stand.
- Under B, what should a second right-click do when the number has gained new unflagged closed
  neighbours since (a hand unflag in between)? Flag the new ones (the undo set grows), or undo
  first? The former keeps "right-click = claim, right-click again = withdraw" readable.
- Under B, does the undo set survive auto-hide and un-hide of the number, and a pause/resume? It
  must be part of the engine snapshot for replays to stay deterministic.
- Is the on-screen-visibility variant of D wanted at all, given it cannot be replayed from the
  action stream unless the visibility verdict is recorded with the action?
- The 2D Expert hypothetical (anti-chord would hand spam 50 % of a no-guess Expert board, 1 %
  won) suggests 2D should never get the anti-chord either; the director may want that stated in
  the 3D feature document's deliberate differences.

Report: `/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/p21-analysis/report.md`
