// The records store: the one owner and only writer of the personal records. It loads the records,
// history and game-in-progress documents through platform storage once at start-up, holds the
// records in memory (js/records/model.js), and saves after every change. DOM-free.
//
// createRecordsStore({ storage, onNotSaved? }) → store
//   storage     the platform storage interface (js/platform/index.js's `storage`).
//   onNotSaved  ({ reason }) — called at most once per store, the first time a save fails; the
//               session's records stay correct in memory.
//
//   load()               → Promise, awaited before the first screen; repeated calls return the
//                          first call's Promise. Reads the three documents once; an m1 records
//                          document (version 1) is stepped up by upgradeRecords and saved back.
//                          A missing or corrupt records document beside an intact history is
//                          rebuilt from the history and saved. A records or history document newer
//                          than this build, or one whose entries the model cannot read, is
//                          refused: the session runs on empty records and nothing is saved, so the
//                          stored documents stay untouched. A leftover game-in-progress marker is
//                          then recorded through record() — an abandoned game, a loss — and
//                          cleared; a marker whose id is already recorded changes nothing.
//   record(summary)      → the model's comparison. Updates memory first, notifies, then saves the
//                          records and history documents, and clears the marker when it holds the
//                          same summary id. The same id twice is a no-op returning the original
//                          comparison. Throws on a summary that is not a record (buildSummary's).
//   begin(summary)       saves the marker: the started game's summary so far, outcome abandoned.
//   checkpoint(summary)  saves the marker again with the game's later summary. Both ignore a
//                          summary whose id is already recorded, so a late save never revives it.
//   onChange(fn)         → unsubscribe. fn(comparison, summary) after each newly recorded game.
//   available()          → whether records are saved this session: false when storage will not
//                          persist or the stored records were refused.
//   settled()            → Promise that resolves once every save queued so far has finished.
//   attach(pauser)       → detach. Hooks the pause controller's hand-offs (js/shell/pause.js):
//                          `abandoned` records the summary; `inProgress` calls begin() for a new
//                          game and checkpoint() for the marker's game; `finished` clears the
//                          marker of that game (recording a finished game is the results flow's
//                          record() call). A summary that is not a record (a fixed 3D board's
//                          null) is ignored.
//   boardsPlayed(mode?), bests(board), counters(board), winRate(board), history(board),
//   overall(mode?), overallWinRate(mode?) — the model's queries.
// record, begin and checkpoint before load() throw: that is a programming error.

import { createRecordsModel, upgradeRecords } from './model.js';

export const RECORDS_DOC = 'records';
export const RECORDS_VERSION = 2;
export const HISTORY_DOC = 'records.history';
export const HISTORY_VERSION = 1;
export const IN_PROGRESS_DOC = 'records.inProgress';
export const IN_PROGRESS_VERSION = 1;

const QUERIES = ['boardsPlayed', 'bests', 'counters', 'winRate', 'history', 'overall', 'overallWinRate'];

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isRecordsDoc = (v) => isPlainObject(v) && isPlainObject(v.boards) && isPlainObject(v.overall);
const isHistoryEntry = (e) => isPlainObject(e) && typeof e.id === 'string' && typeof e.boardKey === 'string';
const isRecordSummary = (s) => isPlainObject(s) && typeof s.id === 'string' && isPlainObject(s.board);

export function createRecordsStore({ storage, onNotSaved = () => {} }) {
  const newer = new Set();
  const watch = { onIssue: (issue) => { if (issue.kind === 'newer-version') newer.add(issue.name); } };
  storage.register(RECORDS_DOC, RECORDS_VERSION, { 1: upgradeRecords }, watch);
  storage.register(HISTORY_DOC, HISTORY_VERSION, {}, watch);
  storage.register(IN_PROGRESS_DOC, IN_PROGRESS_VERSION, {}, watch);

  let model = createRecordsModel();
  let ids = new Set(); // the recorded summary ids
  let loading = null;
  let loaded = false;
  let refused = false; // a newer records format: nothing is saved this session
  let marker = null; // the game-in-progress summary, or null
  let reported = false;
  let queue = Promise.resolve();
  const listeners = new Set();

  const persists = () => !refused && storage.available();

  // Saves run one after another, in the order they were asked for.
  function save(name, data) {
    if (!persists()) return;
    queue = queue.then(async () => {
      const result = await storage.save(name, data);
      if (!result.ok && !reported) {
        reported = true;
        try { onNotSaved({ reason: result.reason }); } catch { /* reporting never fails a save */ }
      }
    });
  }

  function saveRecords() {
    const { records, history } = model.documents();
    save(RECORDS_DOC, records);
    save(HISTORY_DOC, history);
  }

  const ready = () => { if (!loaded) throw new Error('records: used before load()'); };

  async function doLoad() {
    const [records, history, leftover] = await Promise.all([
      storage.load(RECORDS_DOC), storage.load(HISTORY_DOC), storage.load(IN_PROGRESS_DOC),
    ]);
    if (newer.has(RECORDS_DOC) || newer.has(HISTORY_DOC)) {
      refused = true;
    } else {
      try {
        if (Array.isArray(history)) {
          if (!history.every(isHistoryEntry)) throw new RangeError('records: unreadable history entry');
          const intact = isRecordsDoc(records);
          model = createRecordsModel(intact ? { records, history } : { history });
          ids = new Set(model.documents().history.map((e) => e.id));
          if (!intact && history.length > 0) save(RECORDS_DOC, model.documents().records);
        } else if (isRecordsDoc(records)) {
          model = createRecordsModel({ records, history: [] });
        }
      } catch {
        refused = true; // documents this build cannot read are kept as they are
        model = createRecordsModel();
        ids = new Set();
      }
    }
    loaded = true;
    if (refused || leftover === undefined || leftover === null) return;
    marker = leftover;
    try {
      api.record(leftover);
    } catch {
      marker = null;
      save(IN_PROGRESS_DOC, null);
    }
  }

  function keepMarker(summary) {
    ready();
    if (ids.has(summary.id)) return;
    marker = summary;
    save(IN_PROGRESS_DOC, summary);
  }

  const api = {
    load() {
      loading ??= doLoad();
      return loading;
    },

    record(summary) {
      ready();
      const fresh = isRecordSummary(summary) && !ids.has(summary.id);
      const comparison = model.record(summary);
      if (fresh) {
        ids.add(summary.id);
        for (const fn of [...listeners]) {
          try { fn(comparison, summary); } catch (err) { console.error(err); }
        }
        saveRecords();
      }
      if (marker && marker.id === summary.id) {
        marker = null;
        save(IN_PROGRESS_DOC, null);
      }
      return comparison;
    },

    begin(summary) { keepMarker(summary); },

    checkpoint(summary) { keepMarker(summary); },

    onChange(fn) {
      listeners.add(fn);
      return () => { listeners.delete(fn); };
    },

    available() { return persists(); },

    settled() { return queue; },

    attach(pauser) {
      const offs = [
        pauser.attach('abandoned', (summary) => { if (isRecordSummary(summary)) api.record(summary); }),
        pauser.attach('finished', (summary) => {
          if (marker && isRecordSummary(summary) && marker.id === summary.id) {
            marker = null;
            save(IN_PROGRESS_DOC, null);
          }
        }),
        pauser.attach('inProgress', (summary) => {
          if (!isRecordSummary(summary)) return;
          if (marker && marker.id === summary.id) api.checkpoint(summary);
          else api.begin(summary);
        }),
      ];
      return () => { for (const off of offs) off(); };
    },
  };
  for (const q of QUERIES) api[q] = (...args) => model[q](...args);
  return api;
}
