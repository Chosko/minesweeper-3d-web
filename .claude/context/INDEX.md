# Context index

Layout: flat
Last updated: 2026-10-09

Navigation layer for the Minesweeper 3D web port. Read this index, then only
the context files relevant to the task. Gameplay rules are defined in
[docs/ORIGINAL_SPEC.md](../../docs/ORIGINAL_SPEC.md); product knowledge lives in
[.claude/domain/INDEX.md](../domain/INDEX.md).

| File | Covers | Status |
| ---- | ------ | ------ |
| [engine.md](engine.md) | Cell-graph rules engine `js/engine/`: cell graph, square-grid provider, rule profiles and versions, actions and phases, first-click hand-off, 3BV, click counts, game summary (Classic 2D) | done |
| [generation.md](generation.md) | Board generation `js/generation/`: seeded source and generator version, placer and first-click region, logic-only solver and its deduction order, no-guess loop and attempt budget, generation worker protocol, page-side client and cancellation | done |
| [logic.md](logic.md) | 3D rules engine `js/logic.js`: mine placement, reveal/flood fill, flags, chord, unlinking, win/loss | done |
| [rendering.md](rendering.md) | `js/render.js` + `js/textures.js`: instanced cubes, shaders, transparency sort, effects, render-on-demand | done |
| [input.md](input.md) | `js/input.js`, `js/controls.js`, `js/gamepad.js`, `js/picking.js`: camera, mouse release/chord state machine, gamepad, DDA picking | done |
| [app-shell.md](app-shell.md) | `js/main.js`, `js/ui.js`, `js/theme.js`, `js/tokens.js`, `index.html`, `css/tokens.css`, `css/style.css`, `404.html`, deploy files: game flow, frame loop, menus/HUD, design tokens and light/dark theme, `__ms` debug hook | done |
| [audio.md](audio.md) | `js/audio.js`: synthesized WebAudio sound effects, volume/mute | done |
| [testing.md](testing.md) | `tests/*.test.mjs` (logic, engine, fidelity, generation, gamepad, tokens, theme), `tests/fidelity/` observations, `.claude/external/` test scripts, Playwright via `__ms` | done |
