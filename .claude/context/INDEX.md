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
| [platform.md](platform.md) | Platform storage `js/platform/`: document interface, registration and upgrades, browser and memory backends, failure rules, start-up selection | done |
| [classic2d.md](classic2d.md) | Classic 2D Canvas board `js/classic2d/`: board view — fit rule, layout, hit-testing, per-cell redraw, scrolling and panning, hidden while paused, pressed feedback; pointer input — the mouse press-and-release state machine and its wiring; square tile skin — stateless tile painter, tile cache and its invalidation, `MIN_TILE_SIZE` | done |
| [records.md](records.md) | Records vocabulary `js/records/`: board identity, board key format and display label, standard boards, summary record and its builder, 3BV/s and efficiency, best eligibility | done |
| [logic.md](logic.md) | 3D rules engine `js/logic.js`: mine placement, reveal/flood fill, flags, chord, unlinking, win/loss | done |
| [rendering.md](rendering.md) | `js/render.js` + `js/textures.js`: instanced cubes, shaders, transparency sort, effects, render-on-demand | done |
| [input.md](input.md) | `js/input.js`, `js/controls.js`, `js/gamepad.js`, `js/shell/navigation.js`, `js/picking.js`: camera, mouse release/chord state machine, gamepad, shell navigation (Back inputs, held-button suppression), DDA picking | done |
| [app-shell.md](app-shell.md) | `js/main.js`, `js/shell/` (router, mode host, 3D adapter, menu, pause controller), `js/ui.js`, `js/ui/components.js`, `js/theme.js`, `js/tokens.js`, `index.html`, `css/tokens.css`, `css/components.css`, `css/style.css`, `dev/components.html`, `404.html`, deploy files: game shell (screen router and back stack, mode contract, main menu and placeholder, pause flow, confirmations, hand-offs, leave-page guard), 3D game flow, frame loop, menus/HUD, component kit and its gallery, overlay bar, kit-built screens, design tokens and light/dark theme, `__ms` debug hook | done |
| [audio.md](audio.md) | `js/audio.js`: synthesized WebAudio sound effects, volume/mute | done |
| [testing.md](testing.md) | `tests/*.test.mjs` (logic, engine, fidelity, generation, platform, records, gamepad, tokens, theme, components, tile skin, board view, pointer input, shell), `tests/fidelity/` observations, `.claude/external/` test scripts, Playwright via `__ms` and the contrast checks | done |
