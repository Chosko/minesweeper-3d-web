// Results flow: on the game shell's game-finished hand-off, records the summary with the records
// store, then routes to the results screen with the summary and the comparison; on the finished
// and abandoned hand-offs, adds the game's sealed replay to the replay library once its summary is
// recorded. DOM-free: the shell hands in the records store, the replay library, the router and its
// restart and main-menu actions.
//
// createResultsFlow({ records, replays?, router, restart, goMenu }) → flow
//   records   the records store (js/records/store.js): record(summary) → comparison, available().
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
//                             comparison, saved, notSaved }; returns that data. Recording happens
//                             before the screen shows, so the comparison is against the bests that
//                             stood before this game. A summary that is not a record (a fixed
//                             3D board's null) is ignored: no recording, no results screen, null.
//                             A recording that throws routes anyway, with comparison null and saved
//                             false. notSaved is true on the first results screen of a session whose
//                             records are not being saved (records.available() false), so the
//                             player is told once. The replay is then kept (below).
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
//   playAgain(source)         restart(source, current).
//   openRecords()             routes as the menu's Records entry does, with this game's board
//                             ({ boardKey }): the records screen (js/records/screen.js), or the
//                             menu's placeholder on a router without it. Nothing before a
//                             results screen has shown.
//   toMenu()                  goMenu().

import { boardKey } from '../records/board.js';
import { entryRoute, MENU_ENTRIES } from '../shell/menu.js';

export const RESULTS_SCREEN = 'results';

const RECORDS_ENTRY = MENU_ENTRIES.find((e) => e.id === 'records');
const isRecordSummary = (s) => s !== null && typeof s === 'object' && typeof s.id === 'string' && s.board !== null && typeof s.board === 'object';
const setsBest = (comparison) => comparison !== null && typeof comparison === 'object'
  && Object.values(comparison).some((c) => c?.newBest === true);

export function createResultsFlow({ records, replays = null, router, restart, goMenu }) {
  let current = null;
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
      try {
        comparison = records.record(summary);
      } catch (err) {
        console.error(err);
        saved = false;
      }
      const notSaved = !told && !records.available();
      if (notSaved) told = true;
      current = { summary, mode, comparison, saved, notSaved };
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
    toMenu() { goMenu(); },
  };
  return flow;
}
