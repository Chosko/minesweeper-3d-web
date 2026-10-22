# UX-review scripts follow the current app

## Goal
The Playwright scripts under `docs/ux-review/` drive the game through ids,
presets and boards the app no longer has. Bring them back in line: swap a
selector, preset or board for its current equivalent wherever one exists,
drop a probe whose walk the app no longer has from a script that still has a
live walk, and delete a script whose whole walk is gone. Review tooling, not
the test suite; no game code changes.

## Acceptance criteria
- No script under `docs/ux-review/` references `#rp-position`; each read of
  the replay position reads `#rp-seek`'s `aria-valuetext`.
- No script references `#hint-h` or `#hint-h-close`; each uses `#hint-strip`
  / `#hint-strip-close`.
- No script clicks `data-preset="12,12,8,130"`; `enthusiast-loop/04-grind-3d.mjs`
  plays Cube Expert as `10,10,10,100` (`js/mode3d/board-choice.js` `PRESETS`).
- No script presses `#hud-pause`, or reads `#hud-time`, `#hud-mines` or
  `#hud-size`, during a Classic 2D game; each uses `#c2d-pause`,
  `#c2d-time`, `#c2d-mines-left` and `#c2d-size`. A 3D game's board name is
  read from `#hud-title`'s `title`.
- No script references `#chip-spacing`, `#hud-sound` or `#help-pad`; the
  spacing and sound states are read from the `#hud-tools` strip, the help
  panel's list from `#help .ui-controls`.
- No script references `#records-history-title` or `#records-next`; they
  read `#records-tabs` and click the Recent games pager's page-2 button.
- No script reads `#pause dl.controls`; each reads `#pause-controls`.
- Every Playwright locator on `#c2d-board canvas` takes `.first()`, the board
  canvas ahead of its motion and ring layers; no script reads
  `.ui-overlay-bar`, the Classic 2D counters being `#c2d-counters`.
- No script references the main menu's Controls modal (`#menu-help`,
  `#controls-modal`, `#controls-body`), sound button (`#menu-sound`) or
  volume (`#menu-vol`), or sets the `dark` or `light` theme: those probes
  are removed from scripts with a live walk, and `input-a11y/k5.mjs` and
  `ux-first-run/s18b-dark.mjs`, whose whole walk is one of them, are deleted.
- No script plays a custom board the board choice refuses: the 1 × 1 and
  2 × 2 zero-mine wins play 2 × 1 with 1 mine.
- A controller A on a Classic 2D preset that expects a game is followed by A
  on `#c2d-play`.
- `docs/ux-review/README.md` says that the scripts follow the current app
  and that a report citing a script its folder lacks describes a walk the
  app no longer has.
- Every changed script parses (`node --check`).

## Decisions
- A probe of a removed walk inside a script with a live walk is removed, not
  the script: the owner's "fix and/or delete" covers both, and the live walk
  stays rerunnable.
- Shot names that carried `-dark` drop it with the theme switch, so no output
  claims a theme the app does not have.
- Measured outputs (`*.log`) stay: they are the record the reports cite.

## Hints
- index.html (the current ids), js/ui.js (pause card order, the 3D title),
  js/settings/bindings.js (the HUD strip's spacing and sound), js/ui/components.js
  (`bindPager`), js/classic2d/board-setup.js and js/engine/profiles.js
  (custom limits), js/themes/registry.js (the one theme)

## Drift
none
