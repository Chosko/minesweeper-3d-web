# Minesweeper Online — observed behaviour

The fidelity reference for the rules engine (task 7) and Classic 2D input
(task 37): Minesweeper Online (https://minesweeper.online) with its default
options, played as an anonymous desktop user. One entry per rule, each a
single behaviour with its date and how it was established.

Sources:
- **client code** — the site's published game client (`/js/index-1036.js`,
  `/js/en-1036.js`, `/css/styles-1036.css`), read for default settings.
- **help** — the site's own help and guides pages.

## Settled

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

## Still open — need a person on the live site

The site serves headless browsers a page without the game client, so these
could not be observed without evading its bot detection.

- **First-click guarantee** (task 7): only safe, or always an opening.
  Boards are generated server-side and no documentation says. The help's
  advice to open corners "to get openings" hints that an opening is not
  guaranteed; unconfirmed.
- **The board after a loss** (task 7): the client has three end states (mine,
  exploded mine, wrong flag), but which cells the server reveals on a loss
  (all unflagged mines? correct flags kept as flags?) was not seen.
- **Largest custom board** (task 37): the client caps width and height at
  100 each and mines at 2480 and at width × height; the server may cap mine
  density further. Medium confidence on the client caps.
