# Minesweeper Online — observed behaviour

The fidelity reference for the rules engine (task 7), Classic 2D input
(task 37) and the in-game overlay (task 18): Minesweeper Online (https://minesweeper.online) with its default
options, played as an anonymous desktop user. One entry per rule, each a
single behaviour with its date and how it was established.

Sources:
- **client code** — the site's published game client (`/js/index-1036.js`,
  `/js/en-1036.js`, `/css/styles-1036.css`), read for default settings.
- **help** — the site's own help and guides pages.
- **live play** — anonymous games in a desktop Chromium, default options.

### Chording: which inputs chord (task 7, task 37)
2026-10-09 · client code + help · high confidence.
The default chording setting is "Left click": releasing the left button on a
revealed number chords. The middle button behaves exactly like the left
(chords on a number, opens a closed cell). Left + right also chords, through
the left release. A right press on a number does nothing.

### Chording with a wrong flag count (task 7)
2026-10-09 · client code · high confidence for what is sent.
A chord counts flags only; it cannot tell right flags from wrong ones. When
the flag count equals the number, every unflagged closed neighbour opens, so
a misplaced flag opens a mine. When the count differs, nothing opens and the
click counts as a wasted chord.

### Flagging a revealed cell (task 7)
2026-10-09 · client code · high confidence.
Not possible: a right press on an opened cell does nothing.

### Flag timing (task 37)
2026-10-09 · client code · high confidence.
A flag toggles on right press, not release. Pressing right while left is
held on a closed cell toggles its flag.

### What counts as a click for efficiency (task 7)
2026-10-09 · client code + help · high confidence.
Efficiency = solved 3BV ÷ every recorded click: left, right, chord and the
ineffective chord, wasted clicks included. Wasted clicks are left clicks that
open nothing, redundant right clicks and chords whose flag count is wrong. A
right click on a revealed cell is never sent and never counted.

### Pressed feedback (task 37)
2026-10-09 · client code · high confidence.
Left or middle held on a closed, unflagged cell shows that cell pressed; on
a flagged cell nothing shows. Held on a revealed number, its closed unflagged
neighbours show pressed, whether or not the flag count matches. The number
itself is not highlighted by default.

### Releasing off the pressed cell (task 37)
2026-10-09 · client code · high confidence.
Moving off the cell un-presses it and clears its chord preview. Moving onto
another cell while holding presses that cell instead, and releasing there
opens or chords that cell. Releasing off the board does nothing.

### No-guess starting cell (board-generation open question)
2026-10-09 · help + client code · high confidence.
No-guess mode provides a marked starting cell chosen by the server. This game
generates the no-guess board when the first click lands instead (the user's
decision), a deliberate difference from the reference.

### First-click guarantee (task 7)
2026-10-09 · live play · high confidence.
The first click is always safe, but not always an opening. Of 18 first
clicks (6 each on Beginner, Intermediate and Expert) all were safe; 4 opened
an area and 14 revealed a single number (1–4).

### Chording on a wrong flag (task 7)
2026-10-09 · live play · high confidence.
When the flag count matches the number, the chord opens every unflagged
neighbour even if a flag is wrong; it opens the mine and the game is lost.

### The board after a loss (task 7)
2026-10-09 · live play · high confidence.
The mine that was opened shows as an exploded mine. Every unflagged mine is
revealed as a plain mine. A wrong flag becomes a crossed-out mine. A correct
flag stays a closed, flagged cell. Every other closed cell stays closed.

### Largest custom board (task 37)
2026-10-09 · live play · high confidence for the measured points.
Width and height are 1–100 each; larger values are refused. The server lowers
the mine count to a cap that depends on the board's size. Boards of up to 36
cells take a mine in every cell. From 7×7 up the cap is, by measured board:
7×7 → 19, 8×8 → 24, 9×9 → 31, 10×10 → 38, 16×16 → 96, 20×20 → 140,
30×16 → 168, 50×50 → 712, 80×80 → 1659, 90×90 → 2051, 100×100 → 2480
(density from about 39% down to about 25%). No formula was found; between
measured points the cap is interpolated.

### Overlay time and mine displays (task 18)
2026-10-09 · site client code · high confidence.
The top-area time and mine displays are clamped to 999 and −99: the time
display stops at 999, and the mine display shows −99 … 999.
