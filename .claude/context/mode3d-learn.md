# 3D mode — Learn 3D

## OVERVIEW

Learn 3D, the guided board that teaches the 3D views and moves:
`js/mode3d/learn.js` holds the guided board `LEARN_BOARD`, `lessonCells`,
`learnChoice` and the prompt sequence `createLearnPrompts`. DOM-free. The
3D mode's map and its board choice, where Learn 3D is the first option,
are [mode3d.md](mode3d.md); the shell's wiring of the guided game is
[app-shell-3d-session.md](app-shell-3d-session.md) § Learn 3D. Its own play
layout, prompt strip and end cards are drawn by `js/ui.js`, `index.html` and
the stylesheets (§ Learn 3D's screens).

## PUBLIC API

`js/mode3d/learn.js`
- `LEARN_BOARD` — frozen `{X, Y, Z, mines, seed, generatorVersion,
  startCell, minePositions, proofNumber, lessonNumber, lessonMine}`: the
  lesson box, a size outside the presets, its seed and its start cell (the marked centre cell),
  the cells P (`proofNumber`), L (`lessonNumber`) and M (`lessonMine`); `LEARN_TITLE` 'Learn 3D'.
- `lessonCells(view, startCell)` → `{proofNumber, lessonNumber, lessonMine}`
  or null: the board conditions after the first reveal (not won, a cube
  hidden, a 1 with one closed neighbour M, another 1 L nearest the start
  with M and another closed cube).
- `learnChoice()` → `{X, Y, Z, mines, minePositions, noGuess: false, learn:
  true, forced: {startCell, seed, learn: true}}`: a fixed board with the
  session's forced, marked start cell ([mode3d-session.md](mode3d-session.md)).
- `LEARN_PROMPTS` (`start`, `shift`, `ctrl`, `flag`, `chord`, `rest`),
  `LEARN_HINTS` (each prompt's `HINT_TEXT` name,
  [settings-bindings.md](settings-bindings.md)), `learnStepOf(hint)` (a
  step prompt's place among the step prompts, as "<step> / <steps>", null for the start and the
  rest);
  `createLearnPrompts({lessonNumber, lessonMine})` → `current`,
  `done(name)`, `tinted`, `started()`, `shift(selected)`, `ctrl()`,
  `flagged(cells)`, `chorded(cell, revealed)`, `lessonClosed(count)` (L's
  closed, unflagged neighbour count; 0 completes the chord prompt);
  `closedAround(view, cell)` → that count on a 3D state view.

## INTERNAL PATTERNS

- **Learn 3D.** The guided board's mine positions are committed, found by
  `dev/find-learn-3d.mjs` (the first seed from 1 whose no-guess board meets
  `lessonCells`), so a later `GENERATOR_VERSION` changes no lesson. Each
  prompt is done by its action at any time after the first reveal and
  skipped when its turn comes; the chord prompt is also done once L has no
  closed, unflagged neighbour, since a chord on L can then open nothing; L
  carries the start-cell tint during the `shift` and `chord` prompts, M during `flag`. Starting it saves no choice and moves
  no last-board mark (`data-last`); the shell's wiring is
  [app-shell-3d-session.md](app-shell-3d-session.md).
- **Learn 3D's end.** A win offers *Play Cube Intro* — an ordinary pick of
  Cube Intro, saved as the last choice — a loss *Try again*
  ([app-shell-3d-session.md](app-shell-3d-session.md) § End sequence).
- **Learn 3D's screens** (J-Ready-states: "Learn 3D · prompt 1–4", "clear
  the rest", "end card · won", "end card · lost").
  - Play layout: `UI.setLearn(on)` puts `hud--learn` on `#hud` and hides
    the timer (the pause card then shows mines left alone). No title, no
    figures panel and no live-figures toggle: above a phone the floating
    Pause and the counter strip (mines and Restart) stand in a column at
    the top left, the help panel on the right edge; on a phone the overlay
    keeps the phone layouts with the timer gone. The layout is
    `css/style.css`'s, Pause's surface the theme's.
  - Prompt strip: a Learn 3D prompt takes the hint strip's own form
    (`hint-strip--learn`, set by `setHintStrip`'s `learn`): no close
    button, its own padding and gap, the step (`learnStepOf`) smaller in the mono
    face, before the prompt.
  - End cards: the "Learn 3D" section label above the title, the line in
    ink on both — the win's offer of Cube Intro, the loss's "The lesson box
    is always the same. Try it again." —, the primary action with the play
    icon (Play Cube Intro) or the restart icon (Try again), set by
    `showLearnEnd`, and Back to board choice at the default size with the
    arrow-left icon.

## DOMAIN DEPENDENCIES

- [../domain/features/3d-play-flow.md](../domain/features/3d-play-flow.md) —
  Learn 3D, its guided board and prompts.

## CROSS-REFERENCES

- [mode3d.md](mode3d.md) — the board choice's Learn 3D option and panel.
- [mode3d-session.md](mode3d-session.md) — the forced, marked start cell
  the guided board plays through.
- [app-shell-3d-session.md](app-shell-3d-session.md) — the guided game's
  wiring, its hint strip and end card; [app-shell-3d.md](app-shell-3d.md)
  — the ready card's Learn 3D line.
- [settings-bindings.md](settings-bindings.md) — the `HINT_TEXT` the
  prompts name.
- [engine-3d.md](engine-3d.md) — the 3D state view `lessonCells` and
  `closedAround` read.
- [app-shell-hud.md](app-shell-hud.md) — the 3D overlay and the hint strip
  the play layout changes.
- [testing.md](testing.md) — `tests/mode3d-learn.test.mjs` (the layout and
  the prompt strip in the Playwright lesson),
  `tests/components-learn-end.test.mjs` (the end cards).

## WHEN TO READ THE SOURCE

- Changing the guided board or its prompts: `learn.js`'s head comment; a
  changed board re-runs `node dev/find-learn-3d.mjs`.
- Changing the play layout, the prompt strip or the end cards: the
  `hud--learn` and `hint-strip--learn` rules in `css/style.css` and
  `themes/joyful-tiles/theme.css`, `UI.setLearn`, `setHintStrip` and
  `showLearnEnd` in `js/ui.js`, `#learn-end` in `index.html`.
