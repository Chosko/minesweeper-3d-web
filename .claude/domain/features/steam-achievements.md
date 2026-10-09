# Steam achievements

The first set of Steam achievements: about seventeen milestones for Classic
2D and 3D play — first wins, a no-guess-off Expert win, 3BV/s and efficiency
thresholds, a win without flags, and a win on each 3D preset — evaluated
from each finished game's summary, unlocked through Steam and shown by its
overlay, and caught up from the stats history whenever a game ran without
Steam.

## Purpose

[product-design.md § Steam features](../product-design.md#steam-features)
gives the game achievements shown through Steam's overlay, with no menu
entry of their own, and the m3-on-steam exit criteria require achievements
for Classic 2D and 3D play to unlock and show there. Enthusiasts care about
goals that reflect skill, not grind, so the m3 set is a small set of
milestones; the full achievement set arrives in `m6-launch`. This feature is
the catalogue, the rule that decides each unlock, and the path to Steam.

## Scope and non-goals

In scope (m3-on-steam):

- The m3 achievement catalogue, below, with each achievement's stable API
  name, its rule and its display text.
- Evaluation of each finished game's summary against the catalogue.
- Unlocking through the achievements capability of `steam-desktop-host`.
- Catch-up: re-evaluating the stats history at start-up and on reconnect,
  so a game won while Steam was absent still unlocks its achievement.

The catalogue — every rule applies to a won game on a standard board, with
no-guess on or off unless stated:

- **Classic 2D firsts** — a first win on Beginner, on Intermediate and on
  Expert (three).
- **Expert the hard way** — a Classic 2D Expert win with no-guess off.
- **Expert speed** — a Classic 2D Expert win at 3BV/s of at least 1, 2 and
  3 (three).
- **Efficiency** — a Classic 2D Intermediate or Expert win at an efficiency
  of at least 100 % and of at least 150 % (two).
- **No flags** — a Classic 2D Intermediate or Expert win without placing a
  flag.
- **3D presets** — a win on each of the six 3D presets: double layer and
  cube, Beginner, Intermediate and Expert (six).
- **3D speed** — a cube Expert win at 3BV/s of at least a set threshold.

Non-goals:

- Grind achievements — games played, win streaks, total cells cleared —
  left out of m3 by product decision; the full set is `m6-launch`'s.
- Campaign, daily, hexagonal, triangle and Surface achievements — deferred
  with their content.
- Achievements for custom boards — custom boards earn none, so a tiny board
  cannot unlock a skill milestone.
- Steam stats (counters shown on the Steam profile) and progress bars on
  achievements — in no milestone's slice.
- An in-game achievement list or notification — Steam's overlay shows them.
- Achievements in the web build — the web preview has no Steam; nothing is
  shown or kept for them there.
- Achievement icons and final display text — authored in the Steamworks app
  settings with the catalogue's names; see Open questions.

## Architecture

Built within the recorded technical direction — achievements through the
fixed bridge to Electron's main process, shown by Steam's overlay, and
syncing when a connection returns (see
[technical-direction.md](../technical-direction.md)). The evaluator is a
DOM-free ES module tested in Node.

- **Catalogue.** Fixed in code: each achievement's API name and its rule as
  a predicate over one summary — board identity, outcome, elapsed time,
  3BV, 3BV solved and clicks by kind. The same API names are defined in the
  Steamworks app settings; a name never changes once published.
- **Evaluator.** Pure: given one summary, the achievements it earns. 3BV/s
  and efficiency come from `game-summary`'s derivations, so an achievement
  agrees with the results screen to the digit. "Without placing a flag"
  means no flag action at all during the game, so placing and removing a
  flag still disqualifies the game.
- **Unlocker.** Given a set of achievement names, asks the adapter which
  are already set, sets the rest, and stores. Steam shows its own overlay
  notification on each new unlock. When Steam is offline, the Steam client
  keeps the unlock and syncs it later; when Steam is unavailable, the
  unlock is not attempted and catch-up covers it.
- **Catch-up.** At start-up once Steam is available, and on each logged-on
  event, evaluates every won game in `personal-records`' history and
  unlocks what is not yet set. Because every rule is a function of one
  summary and the history is the records' source of truth, nothing extra is
  stored to remember pending unlocks.
- **Hook.** The game shell's end-of-game hand-off calls the evaluator and
  the unlocker for each finished game after the summary is recorded.

## Data and state

- **Catalogue** — fixed in code and mirrored in the Steamworks settings.
- **Unlocked state** — Steam's, per player; read through the adapter, never
  stored by the game.
- **History** — `personal-records`' history document, read for catch-up;
  never written here.
- Nothing persisted by this feature.

## Interfaces and contracts

- **Evaluate** — `earned(summary)` → achievement names. Pure and
  deterministic.
- **Record game** — `onGameFinished(summary)`, from the end-of-game
  hand-off; returns at once, unlocking in the background.
- **Catch up** — `catchUp()`, run by the feature itself on start-up and on
  reconnect; idempotent.
- **Availability** — the achievements capability flag from
  `steam-desktop-host`; with it off, both calls do nothing.
- **Failure** — a failed set or store is retried at the next catch-up;
  nothing here interrupts play or the results flow.

## Dependencies

- `steam-desktop-host` — the bridge, the achievements capability, logged-on
  events and capability flags.
- `game-summary` and `3d-game-records` — board identity, standard-board
  recognition and the 3BV/s and efficiency derivations.
- `personal-records` — the history catch-up evaluates; it must keep each
  game's clicks by kind, or at least its flag actions, for the no-flags rule.
- `game-shell` — the end-of-game hand-off that calls the evaluator.

## Open questions

- The exact speed and efficiency thresholds, including the 3D cube Expert
  speed threshold. Calibrated against real play before the names are
  published in the Steamworks settings; blocks the catalogue's constants,
  not the design.
- Achievement display names, descriptions and icons. Authored before the
  Steamworks settings are published; blocks nothing in code.
- Whether `personal-records`' compact history keeps clicks by kind or only
  a total. If only a total, the no-flags achievement is evaluated at game
  end only and catch-up skips it.
