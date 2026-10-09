# Results Steam rank

The rank panel on the results screen of the Steam build: after a won game
on a standard board, the player's global and friends rank on that board's
Steam leaderboard, filled in while the screen is already open, with the
move shown when the win improved the player's entry and an offline wording
when Steam does not answer.

## Purpose

[product-design.md § Results and records](../product-design.md#results-and-records)
puts the Steam global and friends rank on the end-of-game screen, and the
m3-on-steam milestone takes exactly that slice. Seeing where a win lands
among everyone and among friends is the enthusiast loop's reward beyond the
personal bests. `steam-leaderboards` submits the win and answers the rank;
this feature shows it on `results-screen` without delaying the screen or
*Play again*.

## Scope and non-goals

In scope (m3-on-steam):

- A rank panel on the results screen in the Steam build, for a won game on
  a board in `steam-leaderboards`' catalogue — Classic 2D and 3D alike,
  since both use the one results screen.
- The panel's states: waiting, ranked, offline, and the rank of a win that
  did not improve the player's entry.
- After a win that improved the entry: the global rank with its move
  (#120 → #87, or "new entry" on a first one) and the friends rank.
- After a win that did not improve the entry: the player's standing global
  and friends rank, labelled "your best", with no move.
- Waiting about 5 seconds for Steam before showing the offline wording, and
  filling the panel in when a late answer arrives while the screen is open.

Non-goals:

- A rank panel in the web build — the web preview has only local
  leaderboards, and a local rank would repeat the personal-best comparison
  already on the screen.
- A rank panel after a lost game, on a custom board, or on any board
  without a leaderboard.
- Where this game's time would have ranked when it did not beat the
  player's best — it needs extra leaderboard downloads; the leaderboard
  screen shows the rankings.
- Telling the player the rank of a queued win once the outbox sends it
  later — the panel lives only while the results screen is open.
- Submission, verification and the offline outbox — `steam-leaderboards`.
- Campaign and daily ranks, ranked by 3BV/s — deferred with their
  leaderboards to `m4-campaigns` and `m5-core-complete`.

## Architecture

Built within the recorded technical direction — plain DOM in the game
shell, no framework (see [technical-direction.md](../technical-direction.md)),
composed from the `screen-components` kit. It extends `results-screen`'s
view and flow and reads everything from `steam-leaderboards`.

- **Rank panel.** A non-interactive block in the results view below the
  three-best comparison. It never takes focus, never moves the default
  focus off *Play again*, and its text changes are announced politely to
  assistive technology. Shown only when the leaderboards capability is
  present in the build, the game was won, and its board has a leaderboard;
  otherwise the view has no panel and keeps its m1 layout.
- **Rank resolver.** Started by the results flow when the screen shows, for
  the shown summary. It follows the summary's submission state in
  `steam-leaderboards`:
  - *submitted* — the win improved the entry: global rank and its move from
    the submission's previous and new global rank, friends rank from own
    standing;
  - *not eligible*, or the score was already beaten — reads own standing
    and shows it as "your best";
  - *rejected by verification* — shows own standing as "your best", as for
    a win that did not improve the entry;
  - *pending* — keeps waiting.
- **Wait and late answers.** The panel shows "ranking…" for up to about 5
  seconds. Without an answer by then it switches to the offline wording:
  "Will be ranked when you are back online" when the win is pending in the
  outbox, "Rank unavailable offline" otherwise. An answer that arrives later
  still fills the panel in while the results screen is open. Leaving the
  screen stops the resolver and drops its subscription.

## Data and state

- No persisted state. The panel's state — waiting, ranked, your best,
  offline — and the ranks shown are held while the results screen is open.
- **Source of truth** — Steam's leaderboards, through `steam-leaderboards`'
  submission state and own standing; nothing is cached here.

## Interfaces and contracts

- **Start** — from `results-screen`'s flow when it shows a won summary, with
  that summary and its board identity; **stop** — when the screen is left.
- **Reads** — `steam-leaderboards`' submission state for the summary id and
  its change notification, `standing(board)` for the global and friends
  rank, and the leaderboards capability flag.
- **Failure** — a rejected query or a dead connection ends in the offline
  wording, never an error on the screen; the rest of the results screen and
  its actions are never blocked or delayed by the panel.

## Dependencies

- `results-screen` — the view the panel sits in and the flow that starts
  and stops it.
- `steam-leaderboards` — the catalogue, the submission state with the
  previous and new global rank, own standing, and availability.
- `steam-desktop-host` — the leaderboards capability flag that tells the
  Steam build from the web build.
- `screen-components` — the panel's composition and its states' look.
- `3d-results-records-screens` — the 3D end of game that hands over to the
  same results screen.
- No external libraries.

## Open questions

- Whether the results screen gets a way to the leaderboard screen, opened
  on this game's board — `leaderboard-screen` allows that route, the
  product design names only *Play again* and *Watch replay* one step away,
  and the panel is non-interactive until it is decided. Blocks only that
  route.
