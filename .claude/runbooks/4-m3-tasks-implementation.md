# Runbook: m3-tasks-implementation

Created: 2026-10-09 · Source: /runbook-create interview (runbook planning-to-m3 step 17) · Model: opus
Last step number: 51
Parallelism: 4
Archive: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47

## [x] 50. Implement task 300 — Steam build's Data panel says the data is kept on this computer

Depends on: 3, 44

Context: none

```prompt
/task-implement 300 --review
```

Done: 2026-11-04, commit `fe1d578` (3 files, +15/-6).

## [x] 51. Implement task 301 — Update documentation for feature `steam-desktop-host`

Depends on: 50

Context: none

```prompt
/task-implement 301 --review
```

Done: 2026-11-04, commit `d2abdcb` (5 files, +11/-6).

## [x] 48. Implement task 93 — Steam Auto-Cloud configuration and quota

Depends on: 4, 9, 46

Needs: agent+human

Context:
- 2026-10-31 (amend): carried from struck step 10, where step 4 recorded it — Steamworks settings changes reach the client only after Publish, which the user does by hand after reading the pending-changes list; the user asked that nothing else in Steamworks be touched and nothing made public. The game build lives on the password-protected branch `internal`, and `default` holds only a placeholder build.
- 2026-10-31 (amend): carried from struck step 10, where step 5 recorded it — the user set a Steam Cloud byte quota and file count for the spike's shared-file checks. The values were not recorded, so check them against this task's quota.
- 2026-10-31 (amend): carried from struck step 10 — task 93 was re-planned around the Steam Cloud quota the owner set in Steamworks — 100 MB and 1000 files per user, recorded in `steam-cloud-saves.md`. This step runs the reconciled body: it measures whether the replay library fits that quota, configures the Auto-Cloud root and pattern and runs the two-machine sync check; it neither derives a quota nor has the owner enter one.
- 2026-10-31 (from step 46): the machine prefs directory is `<userData>/prefs/` beside `<userData>/saves/`; only `saves/` is the Auto-Cloud root. The file service routes `settings.machine` there by name (`MACHINE_DOCUMENTS` in `desktop/file-service.js`).

```prompt
/task-implement 93 --review
```

Done: 2026-11-04, commit `b36fe4f` (6 files, +192/-9). Decision: the Auto-Cloud root is saved with OS "All OSes", not Windows. Premise wrong: Publish alone does not start Auto-Cloud on an unreleased app — each machine needs `testappcloudpaths 5517360` in its Steam console.

## [x] 49. Implement task 299 — Update documentation for feature `steam-cloud-saves`

Depends on: 8, 9, 46, 48

Context:
- 2026-10-31 (amend): carried from struck step 47, which carried it from struck step 11, where step 9 recorded it — `.claude/context/platform.md` does not list the two Steam storage modules and still calls the Steam slots empty. The replay library uses the blob store named `replays` (`<userData>/saves/replays.blobs/`) and `openSteamBlobStore` opens any other store by name; the quit flush waits for every storage and blob request over the bridge, reads included. Reset all data on the Steam build is unsupported (no document clear in the bridge or file service). `js/theme.js` reads settings from `localStorage` before first paint, which the Steam build no longer writes — harmless while one theme ships.
- 2026-10-31 (from step 46): task 298 made the carried note's Reset and `js/theme.js` remarks obsolete — `storage.delete(name)` and `storage.list()` exist (both `saves/` and `prefs/`), Steam `clear()` lists then deletes, and `js/theme.js` takes the theme from a frozen `ms3dPrePaint = { theme }` global the preload exposes, read through a synchronous bridge reader on every page load. `desktop.md`, `platform.md` and `app-shell-theme-runtime.md` still describe the old state.

- 2026-11-04 (from step 48): the Auto-Cloud root is saved with OS "All OSes", not Windows. On an unreleased app Auto-Cloud syncs only after `testappcloudpaths 5517360` is entered in each machine's Steam console — recorded in `dev/steam/README.md`; Publish alone leaves every sync "Sync Disabled".

```prompt
/task-implement 299 --review
```

Done: 2026-11-04, commit `c1f702e` (9 files, +195/-55).

## [ ] 15. Implement task 98 — Local leaderboards stand-in for the web build

Depends on: 3, 12

Context:
- 2026-10-25 (from step 3): the page's leaderboards slot is null on the web build until this step fills it; task 86 is `[PARTIAL]` (content size deferred, nothing this step needs).
- 2026-10-31 (from step 13): nothing creates or starts the submission yet — `createLeaderboardSubmission(...)` and its `start()` belong in `js/leaderboards/index.js`. The submitter it expects is `submit({ leaderboard, id, score, details, replay })` returning `{ result: 'submitted', rankBefore, rankAfter }`, `{ result: 'dropped', reason }` or `{ result: 'retry', reason }`; logged-on events come through an `onLoggedOn(listener)` option. The outbox takes an `openBlobStore(name)` factory and must get a store of its own: given the shared replay-library store, its start-up clean-up deletes every blob it does not list and wipes the replay library. `js/main.js` already hands the platform's `leaderboards` slot to `createResultsFlow`.

```prompt
/task-implement 98 --review
```

## [ ] 16. Implement task 99 — Update documentation for feature `steam-leaderboards`

Depends on: 12, 13, 14, 15

Context:
- 2026-10-31 (from step 13): `.claude/context/app-shell-results.md` does not yet describe the results flow's new `leaderboards` option (added in `4669c60`). A game leaving the queue unsubmitted becomes `not-eligible` with a `reason` (`replaced`, `beaten`, `invalid`, `no-replay` or the submitter's own); a rejection carries `refused`, `differs`, `outcome`, `board` or `time` — a field the domain document does not list.
- 2026-11-03 (from step 14): the 12 Steam leaderboards are created from the game client with `FindOrCreateLeaderboard` (ascending, milliseconds), not in the Steamworks settings — boards created there with Writes Trusted kept refusing client uploads after it was cleared. A queued score is sent on reconnect while the game keeps running, as well as at start. Any document saying the boards are created in Steamworks, or that the queue resends only at start, is wrong.

```prompt
/task-implement 99 --review
```

## [ ] 17. Implement task 100 — Achievement catalogue and evaluator

Depends on: none

Context:
- 2026-10-11 (amend): task 100 was re-planned for 14 achievements (a win on each of the three 3D cube presets) and waits on task 115, which step 32 runs.

```prompt
/task-implement 100 --review
```

## [ ] 18. Implement task 101 — Achievement unlocker, catch-up and the end-of-game hook

Depends on: 3, 17

Context:
- 2026-10-25 (from step 3): the page's achievements slot is null until its own feature fills it; task 86 is `[PARTIAL]` (content size deferred, nothing this step needs).

```prompt
/task-implement 101 --review
```

## [ ] 19. Implement task 102 — Steamworks achievement definitions, threshold calibration and overlay check

Depends on: 4, 6, 18

Needs: agent+human

Context:
- 2026-10-28 (from step 5): the user added a test achievement with API name `SPIKE_PROBE` in Steamworks for the spike, and it unlocked on the user's account. It is not part of the catalogue. The overlay showed only with the switches step 6 adds to `desktop/main.js`.

```prompt
/task-implement 102 --review
```

## [ ] 20. Implement task 103 — Update documentation for feature `steam-achievements`

Depends on: 17, 18, 19

Context: none

```prompt
/task-implement 103 --review
```

## [ ] 21. Implement task 104 — Leaderboard screen: board picker, scope tabs, entries and states

Depends on: 14, 15

Needs: agent+human

Context:
- 2026-10-11 (amend): task 104 was re-planned so the 3D board picker lists the three cube presets only.
- 2026-10-13 (amend): task 104 was re-planned into the shared layout's screen frame: it now waits on task 163 (themes-tasks-implementation step 7) and is claude+human — the owner supplies the leaderboard screen's *Joyful tiles* artboard before any markup is written.
- Task 104 also builds the rankings (scope tabs, own standing, entry list, states) as one part for a given board, which the Records Leaderboards tab of task 107 (step 24) shows in place.

```prompt
/task-implement 104 --review
```

## [ ] 22. Implement task 105 — Watch replay from a leaderboard entry

Depends on: 21

Context: none

```prompt
/task-implement 105 --review
```

## [ ] 23. Implement task 106 — Update documentation for feature `leaderboard-screen`

Depends on: 21, 22

Context: none

```prompt
/task-implement 106 --review
```

## [ ] 24. Implement task 107 — Leaderboards tab in Records and Quit in the main menu

Depends on: 3, 21, 22

Context:
- Leaderboards is the Records screen's fourth tab, not a main-menu entry: it shows the rankings part of task 104 for the board Records shows, in place, inside Records; Quit is the main menu's final entry. Task 107 waits on tasks 165 and 170 (themes-tasks-implementation steps 53 and 59).
- 2026-10-23 (amend): task 107 was re-planned: Quit is the title bar's button on every desktop window, not a main menu entry — it asks the leave-game confirmation only while a game is in progress and does nothing on the web; the task is now titled "Leaderboards tab in Records and Quit in the title bar" and waits on task 282 (m2b-themes title bar), which this runbook does not run.
- 2026-10-28 (from step 6): on the installed Steam build neither the title bar's Quit nor the in-game quit does anything yet; taskbar close and Alt+F4 run the host's closing sequence (page flush, Steam shutdown, exit) and exit cleanly, so only the triggering buttons are missing.

```prompt
/task-implement 107 --review
```

## [ ] 25. Implement task 108 — Update documentation for feature `leaderboards-menu-entry`

Depends on: 24

Context: none

```prompt
/task-implement 108 --review
```

## [ ] 26. Implement task 109 — Steam rank panel on the results screen

Depends on: 3, 14, 21

Needs: agent+human

Context:
- 2026-10-09 (amend): task 109 also builds the results screen's *Leaderboard* action and now waits on task 104, the leaderboard screen (step 21).
- Task 109 builds into the framed results screen and waits on task 169 (themes-tasks-implementation step 58); the owner supplies an artboard drawing the rank panel and the *Leaderboard* action.

```prompt
/task-implement 109 --review
```

## [ ] 27. Implement task 110 — Update documentation for feature `results-steam-rank`

Depends on: 26

Context: none

```prompt
/task-implement 110 --review
```

## [ ] 28. Implement task 111 — Action catalogue, bindings resolver and the bindings setting

Depends on: none

Context:
- Task 111 also switches the shared layout's key hints and the in-game controls reminder to the resolver, and waits on tasks 163, 176 and 177 (themes-tasks-implementation steps 7, 68 and 69).

```prompt
/task-implement 111 --review --rounds 2
```

## [ ] 29. Implement task 112 — Classic 2D and 3D input read their actions through the bindings

Depends on: 28

Context: none

```prompt
/task-implement 112 --review --rounds 2
```

## [ ] 30. Implement task 113 — Rebinding controls on the Settings page

Depends on: 28, 29

Needs: agent+human

Context:
- Task 113 builds into the framed Settings page and waits on task 171 (themes-tasks-implementation step 60); the owner supplies an artboard drawing the rebinding panels.

```prompt
/task-implement 113 --review
```

## [ ] 31. Implement task 114 — Update documentation for feature `input-rebinding`

Depends on: 28, 29, 30

Context: none

```prompt
/task-implement 114 --review
```
