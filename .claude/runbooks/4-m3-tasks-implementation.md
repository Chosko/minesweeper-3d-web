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

## [x] 15. Implement task 98 — Local leaderboards stand-in for the web build

Depends on: 3, 12

Context:
- 2026-10-25 (from step 3): the page's leaderboards slot is null on the web build until this step fills it; task 86 is `[PARTIAL]` (content size deferred, nothing this step needs).
- 2026-10-31 (from step 13): nothing creates or starts the submission yet — `createLeaderboardSubmission(...)` and its `start()` belong in `js/leaderboards/index.js`. The submitter it expects is `submit({ leaderboard, id, score, details, replay })` returning `{ result: 'submitted', rankBefore, rankAfter }`, `{ result: 'dropped', reason }` or `{ result: 'retry', reason }`; logged-on events come through an `onLoggedOn(listener)` option. The outbox takes an `openBlobStore(name)` factory and must get a store of its own: given the shared replay-library store, its start-up clean-up deletes every blob it does not list and wipes the replay library. `js/main.js` already hands the platform's `leaderboards` slot to `createResultsFlow`.

```prompt
/task-implement 98 --review
```

Done: 2026-11-04, commit `2b18a84` (8 files, +406/-14). Decision: the stand-in gets the records store and replay library through `leaderboards.connect({ records, replays })`, called in `js/main.js` (Steam's `connect` does nothing); both implementations carry a `local` flag. Premise wrong: step 13's note was already done — task 97 creates and starts the submission.

## [x] 16. Implement task 99 — Update documentation for feature `steam-leaderboards`

Depends on: 12, 13, 14, 15

Context:
- 2026-10-31 (from step 13): `.claude/context/app-shell-results.md` does not yet describe the results flow's new `leaderboards` option (added in `4669c60`). A game leaving the queue unsubmitted becomes `not-eligible` with a `reason` (`replaced`, `beaten`, `invalid`, `no-replay` or the submitter's own); a rejection carries `refused`, `differs`, `outcome`, `board` or `time` — a field the domain document does not list.
- 2026-11-03 (from step 14): the 12 Steam leaderboards are created from the game client with `FindOrCreateLeaderboard` (ascending, milliseconds), not in the Steamworks settings — boards created there with Writes Trusted kept refusing client uploads after it was cleared. A queued score is sent on reconnect while the game keeps running, as well as at start. Any document saying the boards are created in Steamworks, or that the queue resends only at start, is wrong.

- 2026-11-04 (from step 15): `.claude/context/testing-files.md` has no `leaderboards-` row for any leaderboards test file, the stand-in's included. The platform's browser slots constant is exported as `BROWSER_SLOTS`. The stand-in is wired through `leaderboards.connect({ records, replays })` in `js/main.js`, and both implementations carry a `local` flag.

```prompt
/task-implement 99 --review
```

Done: 2026-11-04, commit `b402192` (6 files, +273/-24).

## [x] 17. Implement task 100 — Achievement catalogue and evaluator

Depends on: none

Context:
- 2026-10-11 (amend): task 100 was re-planned for 14 achievements (a win on each of the three 3D cube presets) and waits on task 115, which step 32 runs.

```prompt
/task-implement 100 --review
```

Done: 2026-11-04, commit `4e34106` (5 files, +339/-7). Decision: a Daily board earns nothing; a challenge game on a standard board earns; 3BV/s and efficiency are compared at the results screen's precision; speed and efficiency API names carry their rank (`CLASSIC_EXPERT_SPEED_1`), not their value. Premise wrong: task 115 was already done, and the shipped cube presets are Intro, Beginner, Intermediate and Expert (10×10×10/100), not the body's 12×12×8/130.

## [x] 18. Implement task 101 — Achievement unlocker, catch-up and the end-of-game hook

Depends on: 3, 17

Context:
- 2026-10-25 (from step 3): the page's achievements slot is null until its own feature fills it; task 86 is `[PARTIAL]` (content size deferred, nothing this step needs).

- 2026-11-04 (from step 17): the compact history keeps each game's clicks by kind, so catch-up judges every rule ("no flags" included) by passing a history entry straight to `earned()`; the evaluator reads either `board` or `boardKey`. A Daily board earns nothing; a challenge game on a standard board earns.

```prompt
/task-implement 101 --review
```

Done: 2026-11-04, commit `3c01ffe` (10 files, +533/-12). Decision: the Steam achievements object gains `start({ history })`, called from `js/main.js` once the records load — catch-up needs the records, created after the platform; `onGameFinished` unlocks before it.

## [x] 19. Implement task 102 — Steamworks achievement definitions, threshold calibration and overlay check

Depends on: 4, 6, 18

Needs: agent+human

Context:
- 2026-10-28 (from step 5): the user added a test achievement with API name `SPIKE_PROBE` in Steamworks for the spike, and it unlocked on the user's account. It is not part of the catalogue. The overlay showed only with the switches step 6 adds to `desktop/main.js`.

- 2026-11-04 (from step 17): speed and efficiency API names carry their rank (`CLASSIC_EXPERT_SPEED_1`), so calibrating a threshold renames nothing. Every threshold is provisional, the 3D cube Expert speed one at 0.5 3BV/s. The shipped cube presets are Intro, Beginner, Intermediate and Expert (10×10×10/100); the evaluator looks presets up by name.

```prompt
/task-implement 102 --review
```

Done: 2026-11-04, commit `8a75132` (4 files, +50/-21). Decision: the records held only Beginner games, so thresholds were set from typical boards and the user's choice — Classic Expert speed 1 / 1.5 / 2.5 3BV/s, efficiency 100 % / 130 %, cube Expert speed 0.2 3BV/s (a 30-minute game); the Steamworks descriptions quote these numbers. The 14 achievements carry placeholder icons on Steamworks.

## [x] 20. Implement task 103 — Update documentation for feature `steam-achievements`

Depends on: 17, 18, 19

Context:
- 2026-11-04 (from step 18): `.claude/context/platform.md` still says the achievements slot is empty. The Steam achievements object has a `start({ history })` method the feature document does not name, called from `js/main.js` with `RECORDS.games()` (a new copy of the whole history); before it `catchUp()` does nothing, and catch-up may run twice at start-up, harmlessly. `js/platform/bridge-client.js` gains `achievementsSet`, `setAchievement` and `storeStats`.

- 2026-11-04 (from step 19): the thresholds are final, not provisional — Classic Expert speed 1 / 1.5 / 2.5 3BV/s, efficiency 100 % / 130 %, cube Expert speed 0.2 3BV/s — pinned by a test, and the feature document's open questions are replaced by a thresholds-and-display-text section. Changing a threshold means changing its Steamworks description too. Achievement icons on Steamworks are placeholders; final art is still to be authored. Catch-up unlocks history-earned achievements at launch, before any game.

```prompt
/task-implement 103 --review
```

Done: 2026-11-04, commit `b1049f7` (7 files, +136/-5). Premise wrong: the step-18 note was stale — `platform.md` names no achievements slot, and `platform-host.md` already describes the filled slot and `start({ history })`.

## [!] 21. Implement task 104 — Leaderboard screen: board picker, scope tabs, entries and states

Depends on: 14, 15

Needs: agent+human

Context:
- 2026-10-11 (amend): task 104 was re-planned so the 3D board picker lists the three cube presets only.
- 2026-10-13 (amend): task 104 was re-planned into the shared layout's screen frame: it now waits on task 163 (themes-tasks-implementation step 7) and is claude+human — the owner supplies the leaderboard screen's *Joyful tiles* artboard before any markup is written.
- Task 104 also builds the rankings (scope tabs, own standing, entry list, states) as one part for a given board, which the Records Leaderboards tab of task 107 (step 24) shows in place.

- 2026-11-04 (from step 15): both leaderboards implementations carry a `local` flag (`true` for the web stand-in), for the screen's "local only" state. Local entries are all `playerId: 'local'`, named `You`; `friends` and `around` return the whole list and `standing` gives `friendsRank: null`.

```prompt
/task-implement 104 --review
```

Done: Stopped at the owner's choice — the leaderboard screen's *Joyful tiles* artboard is not on the design canvas (only an unselected "Leaderboards" tab label on "Joyful · Records — states"); task 104 stays `[MISSING]`. 2026-11-04, no commit — nothing was implemented. Re-run once the artboard is published.

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

## [x] 28. Implement task 111 — Action catalogue, bindings resolver and the bindings setting

Depends on: none

Context:
- Task 111 also switches the shared layout's key hints and the in-game controls reminder to the resolver, and waits on tasks 163, 176 and 177 (themes-tasks-implementation steps 7, 68 and 69).

```prompt
/task-implement 111 --review --rounds 2
```

Done: 2026-11-04, commit `3880759` (19 files, +1154/-296). Decision: the bindings setting is a schema entry `bindings` of a new type `overrides`, validated by the resolver (`js/settings/resolver.js`), with no control of its own; the flat modes also reserve H, M and Shift, and F1–F12 are reserved everywhere; a swap that would leave the other action with no input on its device is refused (`last`). The shell key hints stay fixed.

## [x] 29. Implement task 112 — Classic 2D and 3D input read their actions through the bindings

Depends on: 28

Context:
- 2026-11-04 (from step 28): the input layers still read their own fixed keys — switching them to the resolver (`js/settings/resolver.js`) is this step. Numpad Enter counts as Enter in the flat modes only (Classic 2D, Hexagon, Triangle reveal); 3D keeps Enter-only reveal. The flat modes reserve B, H, M and Shift, and F1–F12 are reserved everywhere. `UI.setBindings(resolver)` is wired in `js/main.js`, and every help surface redraws on a binding change.

```prompt
/task-implement 112 --review --rounds 2
```

Done: 2026-11-04, commit `a708d1c` (24 files, +1003/-239). Two review rounds, nothing blocking. Deferred to step 30: the resolver accepts a mouse button bound to an action other than reveal, flag or chord, and no input layer fires it.

## [!] 30. Implement task 113 — Rebinding controls on the Settings page

Depends on: 28, 29

Needs: agent+human

Context:
- Task 113 builds into the framed Settings page and waits on task 171 (themes-tasks-implementation step 60); the owner supplies an artboard drawing the rebinding panels.

- 2026-11-04 (from step 28): the `bindings` setting (type `overrides`) has no Settings control of its own — this step adds it. A swap that would leave the other action with no input on its device is refused with reason `last`; reserved inputs are B, H, M and Shift in the flat modes, the shell's Back, and F1–F12. `keyHintKeys` accepts a catalogue action and shows its current inputs.

- 2026-11-04 (from step 29): `bind` accepts a mouse button on any catalogue action, but the input layers fire a mouse button only for reveal, flag and chord — a mouse button bound to a 3D move or view mode, or to a flat cursor move, is saved and does nothing. Settle it here: the mouse tab offers only reveal, flag and chord and the resolver refuses the rest, or the layers learn to honour them.

```prompt
/task-implement 113 --review
```

Done: Stopped at the owner's choice — no artboard on the design canvas draws the rebinding panels (the `J-Settings-*` artboards draw only the read-only bindings list); task 113 stays `[MISSING]`. 2026-11-04, no commit — nothing was implemented. The mouse-button question (step 29's note) is still open. Re-run once the artboard is published.

## [ ] 31. Implement task 114 — Update documentation for feature `input-rebinding`

Depends on: 28, 29, 30

Context:
- 2026-11-04 (from step 28): the bindings setting is type `overrides`, validated in `js/settings/resolver.js`; the help row tables in `js/settings/bindings.js` are templates filled from the current bindings; `keyHintKeys` takes a catalogue action. The shell key hints stay fixed.

```prompt
/task-implement 114 --review
```
