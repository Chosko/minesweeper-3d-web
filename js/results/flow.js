// Results flow: on the game shell's game-finished hand-off, records the summary with the records
// store, then routes to the results screen with the summary and the comparison. DOM-free: the
// shell hands in the records store, the router and its restart and main-menu actions.
//
// createResultsFlow({ records, router, restart, goMenu }) → flow
//   records   the records store (js/records/store.js): record(summary) → comparison, available().
//   router    { has, go } (js/shell/router.js).
//   restart(source, current)  start the same board choice again; current is the shown data, whose
//             mode may already have been left (the records screen leaves it).
//   goMenu()  return to the main menu.
//
//   attach(pauser) → detach   hooks the pause controller's `finished` hand-off (js/shell/pause.js).
//   finished(summary, mode)   records, then routes to RESULTS_SCREEN with { summary, mode,
//                             comparison, saved, notSaved }; returns that data. Recording happens
//                             before the screen shows, so the comparison is against the bests that
//                             stood before this game. A summary that is not a record (the 3D
//                             mode's) is ignored: no recording, no results screen, null.
//                             A recording that throws routes anyway, with comparison null and saved
//                             false. notSaved is true on the first results screen of a session whose
//                             records are not being saved (records.available() false), so the
//                             player is told once.
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

export function createResultsFlow({ records, router, restart, goMenu }) {
  let current = null;
  let told = false;

  const flow = {
    get current() { return current; },
    finished(summary, mode) {
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
      return current;
    },
    attach(pauser) { return pauser.attach('finished', (summary, mode) => flow.finished(summary, mode)); },
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
