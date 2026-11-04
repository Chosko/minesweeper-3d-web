# Achievements — catalogue, evaluator, unlocker and catch-up

## OVERVIEW

The Steam build's achievements, `js/achievements/`, all DOM-free: the
catalogue of API names and rules, the evaluator that says which achievements
one finished game earns, the unlocker that sets them through the desktop
host's bridge client, and the Steam achievements object the platform's
`achievements` slot holds — the end-of-game hook and catch-up over the
records' history. Steam's overlay shows each unlock; the game has no
achievement screen. The web build has none: the slot is null there
([platform-host.md](platform-host.md)).

| File | Responsibility |
| ---- | -------------- |
| `catalogue.js` | `THRESHOLDS` and `CATALOGUE`: each achievement's API name and its rule over the evaluator's game view. Head comment documents the view and the naming rule. |
| `evaluate.js` | `earned(summary)` and `NO_FLAGS_FROM_HISTORY`: the standard board a game was played on, the game view, the catalogue filtered by it. |
| `unlock.js` | `createUnlocker`: read which names are set, set the rest, store. |
| `index.js` | `createSteamAchievements`: the end-of-game hook, catch-up and their one queue. Head comment documents the object. |

## PUBLIC API

- `THRESHOLDS` — frozen: `expertSpeed` (the three Classic 2D Expert speed
  tiers, 3BV/s), `efficiency` (the two efficiency tiers, percent),
  `cubeExpertSpeed` (3BV/s). Each value is quoted in its achievement's
  Steamworks description, so changing one changes that text too
  ([../domain/features/steam-achievements.md](../domain/features/steam-achievements.md)
  § Thresholds and display text).
- `CATALOGUE` — frozen `[{ name, rule }]` in a fixed order: the Classic 2D
  firsts, Expert the hard way, the Expert speed tiers, the efficiency tiers,
  no flags, the cube preset wins, cube Expert speed. A name is the
  Steamworks API name and never changes once published; a tier's name
  carries its rank, never its threshold.
- `earned(summary)` → the API names the game earns, in catalogue order.
  Takes a summary (`js/records/summary.js`) or a compact history entry
  (`js/records/model.js`, its board named by `boardKey`). Pure.
- `createUnlocker({ client, log? })` → `{ unlock(names) }`, a promise that
  never rejects.
- `createSteamAchievements({ client, capabilities, log? })` →
  `onGameFinished(summary)` (returns at once, unlocks in the background),
  `start({ history })` (`history()` → every recorded game in play order),
  `catchUp()` → promise, `settled()` → promise once every unlock asked for
  so far has finished.

## INTERNAL PATTERNS

- **Rules over one game view.** The evaluator builds `{ classic, cube,
  noGuess, bbbvPerSecond, efficiency, flagClicks }` and every rule is a
  predicate over it. `classic` is the Classic 2D standard board's name on
  the square grid, `cube` the 3D cube preset's (Beginner, Intermediate,
  Expert of `PRESETS_3D`); a game with neither — lost or abandoned, a custom
  board, a former preset's size, a Daily board, a Hexagon or Triangle board,
  Cube Intro — earns nothing before any rule runs, so no rule restates it.
- **Judged as the results screen shows it.** 3BV/s and efficiency are
  `game-summary`'s derivations rounded to the results screen's precision
  (`RATE_DECIMALS`, `EFFICIENCY_DECIMALS`), so a threshold the screen shows
  is a threshold reached. A null derivation earns no tier.
- **No flags** counts every flag click, a removed flag's included. The
  compact history keeps clicks by kind, so a history entry is judged like
  its summary (`NO_FLAGS_FROM_HISTORY`).
- **Unlocker.** De-duplicates the names, asks `achievementsSet(names)`
  which are set, calls `setAchievement` for each of the rest and
  `storeStats` once when any was set. A failed read sets nothing and a
  failed set leaves its name unset, both for the next catch-up; a failed
  store is made again by the next unlock, even one with nothing new. Offline
  the Steam client keeps the unlock and syncs it later.
- **Gated on the flag.** With `capabilities.achievements` off — Steam
  unavailable, or the adapter without the capability — neither the hook nor
  catch-up attempts anything.
- **One queue.** Hook unlocks and catch-ups run one after another, never
  interleaved; a catch-up asked for while another waits its turn is that
  one. A game that cannot be evaluated is logged and earns nothing; nothing
  throws into the caller.
- **Catch-up.** `start({ history })` stores the history source and runs
  catch-up at once, again each time the flags turn `achievements` from off
  to on, and each time Steam reports it is logged on (`watchLoggedOn`,
  [leaderboards-steam.md](leaderboards-steam.md)) — at start-up when it is
  logged on already, which can add a second, idempotent run. Before
  `start`, `catchUp()` does nothing while the hook still unlocks. Catch-up
  evaluates every game of the history and unlocks the union; nothing of its
  own is stored, since the history is the records' source of truth and
  Steam holds the unlocked state.
- **Wiring.** The platform builds the object for its `achievements` slot
  on the desktop host (`STEAM_SLOTS`, [platform-host.md](platform-host.md));
  `js/main.js` calls `achievements?.start({ history: () => RECORDS.games() })`
  once the records have loaded ([records-store.md](records-store.md) —
  `games()`), and hands `achievements` to the results flow, whose
  end-of-game hand-off calls `onGameFinished` for a finished game
  ([app-shell-results.md](app-shell-results.md)).

## DOMAIN DEPENDENCIES

- [../domain/features/steam-achievements.md](../domain/features/steam-achievements.md)
  — the catalogue, its thresholds and display text, the evaluator, the
  unlocker, catch-up and the hook.
- [../domain/features/steam-desktop-host.md](../domain/features/steam-desktop-host.md)
  — the bridge's achievement requests, the capability flags, logged-on
  events.

## CROSS-REFERENCES

- [records.md](records.md) — board identity, `standardBoard`, `preset3D`;
  [records-summary.md](records-summary.md) — the summary, 3BV/s and
  efficiency; [records-store.md](records-store.md) — `games()`.
- [platform-host.md](platform-host.md) — the `achievements` slot, the
  capability flags and the bridge client's `achievementsSet`,
  `setAchievement` and `storeStats`; [desktop-steam.md](desktop-steam.md) —
  the host's side of those requests.
- [app-shell-results.md](app-shell-results.md) — the end-of-game hand-off.
- [testing-files.md](testing-files.md) — `tests/achievements-*.test.mjs`.

## WHEN TO READ THE SOURCE

- Adding an achievement or changing a rule: `catalogue.js` whole, with the
  API names the test pins and the Steamworks settings, which must match.
- Changing a threshold: `THRESHOLDS` and the feature document's display
  text together.
- A game earning more or less than expected: `evaluate.js`'s `standardOf`
  and the game view.
