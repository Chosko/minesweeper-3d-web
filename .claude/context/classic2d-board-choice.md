# Classic 2D — board choice screen and panel

## OVERVIEW

A flat mode's board choice screen and the board choice panel every mode's
board choice shares. The board setup it reads is
[classic2d-board-setup.md](classic2d-board-setup.md)'s; the flat mode
configuration and the Classic 2D map are [classic2d.md](classic2d.md)'s.

| File | Responsibility | Context file |
| --- | --- | --- |
| `js/classic2d/board-choice.js` | A flat mode's board choice screen (Classic 2D's, Hexagon's, Triangle's): custom info line, validation and Random, the choice its fields describe, the bests line, the board choice panel every mode's board choice shares (`bindChoicePanel`), `bindBoardChoice` (touches only the elements it is handed). | this file |

## PUBLIC API

`js/classic2d/board-choice.js` (its head comment is the contract)
- `CHOICE_SIZES`, `CUSTOM_HINT`, `boardLine(board)`, `sizeLabel(size,
  config?)`, `mineDensity(board)`, `customInfo(custom, config?)`,
  `customStatus(custom, config?)` → `{ok, field, max, text}`,
  `randomCustom(random?, config?)` (the Random fill, at most about one mine
  in five cells), `readChoice({size, fields, noGuess}, fallbackCustom?,
  config?)`, `densityHintShown(custom, noGuess, config?)` — each reading
  the configuration's standard sizes and custom limits, `SQUARE_SETUP`'s by
  default —, `bestsTitle({selected, custom, noGuess})`; `CODE_PROMPT`, the
  code field's empty line on every board choice; `showCodeLine(line,
  field, r)`, the code field's line on every board choice for
  `code.resolve`'s answer:
  the prompt muted, an accepted code `ui-text--success`, a code of the
  other mode (`r.otherMode`) a warn note, any other refused code an err
  note with the field `is-invalid`.
- The board choice panel: `PANEL_OPTIONS` (`custom`, `code`, `learn`, the
  options that open it on their own), `panelOpen(selected, pinned)`,
  `panelLabel(selected)` (the drawer's label: *Board code*, *Learn 3D*,
  else *Board settings*); `bindChoicePanel({root, pin})` →
  `{draw(selected), destroy()}` over a screen's panel `[data-panel]`, its
  rule `[data-panel-rule]`, the panel toggle `[data-panel-toggle]` and the
  drawer's bar `[data-drawer-bar]`; `pin` the shell's stored pin
  (`createBoardPanelPin`, [app-shell-menu.md](app-shell-menu.md)).
- `bindBoardChoice({root, onStart, onBack, onRecords?, code?, bests?, pin?,
  config?})` → `{show(choice, {held}), state(), refresh(), destroy()}` over
  `#c2d-choice`, `#hex-choice` or `#tri-choice`, the choices, identities
  and limits it reads its `config`'s: the options `[data-size]` (`beginner`, `intermediate`,
  `expert`, `custom`, `code`; `aria-pressed` the chosen one, `data-last`
  the last board played); `onRecords(identity)` — *All records* under the
  bests — with the chosen board's records identity (null with no board chosen);
  `code` `{resolve, onPlay}` validates the pasted code live; `bests(identity)`
  the shell's `boardBests` text ([app-shell-menu.md](app-shell-menu.md)),
  redrawn by `refresh()`; `held` (a `state()` taken before Records opened)
  brings the screen back as it was.

## INTERNAL PATTERNS

- **The board choice screen** (`css/components.css` head comment, *Classic
  2D board choice*; Hexagon's and Triangle's are its composition, the body
  headed by the mode's name and the options its standard boards): the Board list on the left — the standard sizes and
  Custom, then Insert Board Code, with no chip; the last board played is
  the chosen option when the window opens — and the foot holding Play
  alone, the go button, at the right. Everything else sits in the board
  choice panel to the list's right: a preset's no-guess switch row and the
  board's three bests with *All records* under them, Custom's switch row,
  form (on the panel, in no box of its own: the fields filling one row
  over the info line and Random) and refusal (a warn note) with the bests
  for that size, or Insert Board Code's field alone. Choosing an option is
  a click (a tap, the controller's A); Enter plays. The info line, refusal
  line, density hint, bests and Play follow the fields and the switch
  live; Play is disabled on a refused custom board and an empty or refused
  code. *All records* opens Records on the chosen board and switch. The
  binder reads no records: the shell hands it `bests` and calls
  `refresh()` on the records' change.
- **Board choice panel** (`bindChoicePanel`, one behaviour for every
  mode's board choice — the 3D one's and any flat mode configured on this
  binder): open while pinned or while an option of `PANEL_OPTIONS` is
  chosen, closed otherwise, the window widening for it. The panel toggle,
  at the right of the heading, flips the pin (`aria-pressed` while
  pinned); on a phone the drawer's bar does the same (`aria-expanded`
  while open) under the label `panelLabel` gives. While an option of
  `PANEL_OPTIONS` is chosen the panel stays open and a click changes only
  the stored preference; choosing a preset closes it again unless pinned.
  No pin handed in reads as unpinned.

## DOMAIN DEPENDENCIES

- [../domain/features/classic-2d-square-play.md](../domain/features/classic-2d-square-play.md)
  — board setup and its custom limits, the board choice.
- [../domain/features/flat-grid-modes.md](../domain/features/flat-grid-modes.md)
  — Hexagon's and Triangle's board choices.

## CROSS-REFERENCES

- [classic2d.md](classic2d.md) — the flat mode configuration and the
  Classic 2D map; [classic2d-board-setup.md](classic2d-board-setup.md) —
  the board setup, limits and density hint this screen reads.
- [app-shell-menu.md](app-shell-menu.md) — the stored pin and the bests
  text the shell hands in.
- [mode3d.md](mode3d.md) — the 3D board choice, under the same panel.
- [testing-files.md](testing-files.md) — `tests/classic2d-mode.test.mjs` board choice;
  `tests/flat-modes.test.mjs` the configured board choice helpers;
  `tests/shell-router.test.mjs` Hexagon's and Triangle's board choice
  markup held equal to Classic 2D's.

## WHEN TO READ THE SOURCE

- Changing the board choice screen's options, fields, info line, bests
  or panel (`customStatus`, `bindChoicePanel`, `bindBoardChoice` in
  `board-choice.js`; the `#c2d-choice` markup in `index.html`, which
  `#hex-choice` and `#tri-choice` copy).
