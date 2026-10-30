# Area handoff — domain-toast

## Scope
Documentation catch-ups for the desktop window fixes. Docs only.

## State
All four catch-ups done under `unattended`, no open question, not pushed.

- `32d6211` — windowed toast on the window (`90fd6a8`):
  `shared-screen-layout.md` toasts bullet; spec deleted.
- `97a928e` — windowed fatal card fills the window (`3f70df8`):
  `.claude/context/app-shell-stylesheet.md` `css/style.css` row, message pages'
  entry gains "windowed at the desktop host, the fatal card's backdrop filling
  the window"; spec deleted.
- `1269076` — a popup over a flat game is the window alone (`f394166`):
  runbook 4 step 7 (task 90) gains a dated `Context:` fact; spec deleted.
- `2ee10b2` — window edge frame takes Windows' 8 px corners (`98b84be`):
  runbook 4 step 7 gains a second dated `Context:` fact; spec deleted.

## Decisions taken
- Every Drift point was settled (editorial). The landing commits had already
  written `steam-desktop-host.md` § The desktop window and every context
  file except the one `app-shell-stylesheet.md` row, so no `/architect amend`
  and no task amend ran. Spec 3's "diverges" bullet is the owner's decision,
  already in the feature document, and no live task's contract depends on it.
- No domain edit for the fatal card: `shared-screen-layout.md` states no
  placement for it, so nothing lagged.
- The context step was a scoped edit of the one lagging row, not a full
  `/context-update`, which would have reached files outside this scope.
- Runbook facts: step 7 (task 90, document `steam-desktop-host`) is open and
  documents the window, so it records that the feature document and the
  context files already describe the popup and corner rules.
- Lint bracket: an unscoped evaluation of the drift catalogue before and
  after. The only change was the three L14 spec findings clearing. The
  findings already there (L2 on tasks 139–217 with no `Feature:` line, and
  L14 on the two older specs) were not touched.

## Open
- Nothing in this area. Two older specs remain under `.claude/specs/`
  (2026-10-21 lighten-the-browser-test-tier-leftovers, 2026-10-25
  accept-scene-off-on-the-menu-in-the-lock-fallback-test). Neither was in scope.
