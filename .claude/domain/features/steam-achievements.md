# Steam achievements

The first set of Steam achievements: about fourteen milestones for Classic
2D and 3D play — first wins, a no-guess-off Expert win, 3BV/s and efficiency
thresholds, a win without flags, and a win on each 3D cube preset — evaluated
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
- **Expert speed** — a Classic 2D Expert win at 3BV/s of at least each
  tier's threshold (three).
- **Efficiency** — a Classic 2D Intermediate or Expert win at an efficiency
  of at least each tier's threshold (two).
- **No flags** — a Classic 2D Intermediate or Expert win without placing a
  flag.
- **3D presets** — a win on each of the three 3D cube presets: Beginner,
  Intermediate and Expert (three).
- **3D speed** — a cube Expert win at 3BV/s of at least a set threshold.

The thresholds and each achievement's display text are in
[§ Thresholds and display text](#thresholds-and-display-text).

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
- Final achievement icon art — the Steamworks settings carry placeholder
  icons until it is authored.

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
  stored to remember pending unlocks. The history keeps each game's clicks
  by kind, so catch-up judges every rule, no flags included.
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
- `personal-records` — the history catch-up evaluates, with each game's
  clicks by kind for the no-flags rule.
- `game-shell` — the end-of-game hand-off that calls the evaluator.

## Thresholds and display text

The thresholds are set from the play of a capable, not elite, player: a
typical Classic 2D Expert board is about 175 3BV, so the speed tiers are
about three minutes, two minutes and seventy seconds; efficiency counts every
click, flags included, so the top tier asks for very economical play; the
cube Expert speed is a 30-minute game on a typical cube Expert board of about
360 3BV. Each description quotes its threshold, so a threshold changes only
with its Steamworks text.

| API name | Display name | Description |
| -------- | ------------ | ----------- |
| `CLASSIC_BEGINNER_WIN` | First Sweep | Win a Classic 2D game on Beginner. |
| `CLASSIC_INTERMEDIATE_WIN` | Moving Up | Win a Classic 2D game on Intermediate. |
| `CLASSIC_EXPERT_WIN` | Expert Sweeper | Win a Classic 2D game on Expert. |
| `CLASSIC_EXPERT_HARD_WAY` | The Hard Way | Win a Classic 2D Expert game with no-guess off. |
| `CLASSIC_EXPERT_SPEED_1` | Quick Hands | Win a Classic 2D Expert game at 1 3BV/s or faster. |
| `CLASSIC_EXPERT_SPEED_2` | Fast Sweeper | Win a Classic 2D Expert game at 1.5 3BV/s or faster. |
| `CLASSIC_EXPERT_SPEED_3` | Lightning | Win a Classic 2D Expert game at 2.5 3BV/s or faster. |
| `CLASSIC_EFFICIENCY_1` | No Wasted Clicks | Win a Classic 2D Intermediate or Expert game at 100% efficiency or better. |
| `CLASSIC_EFFICIENCY_2` | Click Economist | Win a Classic 2D Intermediate or Expert game at 130% efficiency or better. |
| `CLASSIC_NO_FLAGS` | No Flags Needed | Win a Classic 2D Intermediate or Expert game without placing a single flag. |
| `CUBE_BEGINNER_WIN` | Into the Third Dimension | Win a 3D game on the Beginner cube. |
| `CUBE_INTERMEDIATE_WIN` | Cubed | Win a 3D game on the Intermediate cube. |
| `CUBE_EXPERT_WIN` | Master of the Cube | Win a 3D game on the Expert cube. |
| `CUBE_EXPERT_SPEED` | Cube Rush | Win a 3D Expert cube game at 0.2 3BV/s or faster. |
