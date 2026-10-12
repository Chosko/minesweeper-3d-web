// Results flow: on the game shell's game-finished hand-off, records the summary with the records
// store, then routes to the results screen with the summary and the comparison; on the finished
// and abandoned hand-offs, adds the game's sealed replay to the replay library once its summary is
// recorded; Watch replay opens the replay viewer on the finished game's own replay. DOM-free: the
// shell hands in the records store, the replay library, the router and its restart and main-menu
// actions.
//
// createResultsFlow({ records, replays?, router, restart, goMenu }) → flow
//   records   the records store (js/records/store.js): record(summary) → comparison, available(),
//             and the queries counters(board), history(board), winRate(board) and
//             completedWinRate(board).
//   replays   the replay library (js/replay/library.js): load(), add(blob, listing, setBest).
//             Without it no replay is kept.
//   router    { has, go } (js/shell/router.js).
//   restart(source, current)  start the same board choice again; current is the shown data, whose
//             mode may already have been left (the records screen leaves it).
//   goMenu()  return to the main menu.
//
//   attach(pauser) → detach   hooks the pause controller's `finished` and `abandoned` hand-offs
//                             (js/shell/pause.js).
//   finished(summary, mode, replay?)  records, then routes to RESULTS_SCREEN with { summary, mode,
//                             comparison, saved, notSaved, watch, rank, streak, standing }; returns
//                             that data.
//                             Recording happens before the screen shows, so the comparison is
//                             against the bests that stood before this game. A summary that is not
//                             a record (a fixed 3D board's null) is ignored: no recording, no
//                             results screen, null. A recording that throws routes anyway, with
//                             comparison, rank, streak and standing null and saved false. streak is
//                             the board's { before, current, longest }: its current streak read with
//                             counters(board) before recording, then its current and longest streaks
//                             after. standing is the board's { winRate, completedWinRate,
//                             longestStreak, longestCompletedStreak } counting this game, from
//                             winRate(board), completedWinRate(board) and the counters after. rank is a won game's { position, of } among the board's won
//                             games, from history(board) after recording: position is 1 + the
//                             other won games whose time is at or below this one's (a tie ranks the
//                             earlier game first), of counts them and this one; null on a loss. A
//                             query that throws is logged and leaves its figure null. notSaved is
//                             true on the first results screen of a session whose
//                             records are not being saved (records.available() false), so the
//                             player is told once. watch is whether Watch replay is offered: the
//                             game handed over its sealed replay and the router has the replay
//                             viewer's route (REPLAY_SCREEN, js/records/replay-list.js). The replay
//                             is then kept (below).
//   abandoned(summary, mode, replay?)  records (a no-op when the records store already recorded
//                             it), then keeps the replay; no results screen.
//   Keeping a replay: replay is the sealed { blob, listing } (js/replay/recorder.js), or null when
//   recording failed or the mode records none — then nothing is added. Otherwise, after load(),
//   add(blob, listing, setBest), setBest true when the comparison shows a new best on any of the
//   board's three stats. A replay the library cannot save, or a session where nothing persists,
//   stays in the library's memory for the session. A library that throws or rejects is logged
//   and changes nothing else.
//   current                   the data of the results screen last shown, or null; the screen is
//                             shown again from it when Back returns to it without data.
//   playAgain(source)         restart(source, current): Play again by click, Enter or R ('pointer',
//                             'key') or the controller ('pad'); the shell enters a 3D board with
//                             the activation as its pointer-lock gesture.
//   openRecords()             routes as the menu's Records entry does, with this game's board
//                             ({ boardKey }): the records screen (js/records/screen.js), or the
//                             menu's placeholder on a router without it. Nothing before a
//                             results screen has shown.
//   watch()                   routes to REPLAY_SCREEN with { replay, returnTo: { screen:
//                             RESULTS_SCREEN } }: the replay the shown game handed over, so it plays
//                             whether or not the library could save it, and Back returns here.
//                             Nothing unless the shown data offers watch.
//   toMenu()                  goMenu().

import { boardKey } from '../records/board.js';
import { entryRoute, MENU_ENTRIES } from '../shell/menu.js';
import { REPLAY_SCREEN } from '../records/replay-list.js';

export const RESULTS_SCREEN = 'results';

const RECORDS_ENTRY = MENU_ENTRIES.find((e) => e.id === 'records');
const isRecordSummary = (s) => s !== null && typeof s === 'object' && typeof s.id === 'string' && s.board !== null && typeof s.board === 'object';
const setsBest = (comparison) => comparison !== null && typeof comparison === 'object'
  && Object.values(comparison).some((c) => c?.newBest === true);

/** A records query, or null when it throws: a figure the screen can do without. */
function query(fn) {
  try {
    return fn();
  } catch (err) {
    console.error(err);
    return null;
  }
}

/** A won game's place by time among the board's won games: ties rank the earlier game first. */
function rankOf(summary, history) {
  if (summary.outcome !== 'won' || !Array.isArray(history)) return null;
  const others = history.filter((e) => e.outcome === 'won' && e.id !== summary.id);
  return { position: 1 + others.filter((e) => e.elapsedMs <= summary.elapsedMs).length, of: others.length + 1 };
}

export function createResultsFlow({ records, replays = null, router, restart, goMenu }) {
  let current = null;
  let shownReplay = null;
  let told = false;

  function keep(replay, comparison) {
    if (!replays || !replay) return;
    const setBest = setsBest(comparison);
    Promise.resolve()
      .then(() => replays.load())
      .then(() => replays.add(replay.blob, replay.listing, setBest))
      .catch((err) => console.error(err));
  }

  const flow = {
    get current() { return current; },
    finished(summary, mode, replay = null) {
      if (!isRecordSummary(summary)) return null;
      let comparison = null;
      let saved = true;
      const before = query(() => records.counters(summary.board));
      try {
        comparison = records.record(summary);
      } catch (err) {
        console.error(err);
        saved = false;
      }
      let rank = null;
      let streak = null;
      let standing = null;
      if (saved) {
        const after = query(() => records.counters(summary.board));
        rank = rankOf(summary, query(() => records.history(summary.board)));
        if (before && after) streak = { before: before.currentStreak, current: after.currentStreak, longest: after.longestStreak };
        const rates = query(() => ({ winRate: records.winRate(summary.board), completedWinRate: records.completedWinRate(summary.board) }));
        if (after && rates) standing = { ...rates, longestStreak: after.longestStreak, longestCompletedStreak: after.longestCompletedStreak };
      }
      const notSaved = !told && !records.available();
      if (notSaved) told = true;
      shownReplay = replay?.blob ? replay : null;
      const watch = shownReplay !== null && router.has(REPLAY_SCREEN);
      current = { summary, mode, comparison, saved, notSaved, watch, rank, streak, standing };
      router.go(RESULTS_SCREEN, { data: current });
      keep(replay, comparison);
      return current;
    },
    abandoned(summary, mode, replay = null) {
      if (!isRecordSummary(summary)) return;
      let comparison = null;
      try {
        comparison = records.record(summary);
      } catch (err) {
        console.error(err);
      }
      keep(replay, comparison);
    },
    attach(pauser) {
      const offs = [
        pauser.attach('finished', (summary, mode, replay) => flow.finished(summary, mode, replay)),
        pauser.attach('abandoned', (summary, mode, replay) => flow.abandoned(summary, mode, replay)),
      ];
      return () => { for (const off of offs) off(); };
    },
    playAgain(source = 'pointer') { if (current) restart(source, current); },
    openRecords() {
      if (!current) return;
      const route = entryRoute(RECORDS_ENTRY, { hasMode: () => false, hasScreen: (s) => router.has(s) });
      router.go(route.screen, { data: { ...route.data, boardKey: boardKey(current.summary.board) } });
    },
    watch() {
      if (!current?.watch) return;
      router.go(REPLAY_SCREEN, { data: { replay: shownReplay, returnTo: { screen: RESULTS_SCREEN } } });
    },
    toMenu() { goMenu(); },
  };
  return flow;
}
