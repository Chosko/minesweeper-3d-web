// The Records screen's one remembered view choice: the replays list's Pinned first switch, kept in
// its own platform-storage document so it is not a setting on the Settings page. DOM-free.
//
// createRecordsViewPrefs({ storage }) → { pinnedFirst, load(), setPinnedFirst(on) }
//   Registers VIEW_PREFS_DOC with storage (js/platform/index.js's `storage`). load() → Promise of
//   the stored pinnedFirst, awaited before the Records screen first shows: a missing, malformed or
//   newer document gives false. setPinnedFirst(on) keeps the choice in memory, then saves it → the
//   save's Promise of { ok }; a failed save keeps the choice for the session and says nothing more.
//   Reset all data clears the document with every other (storage.clear()).

export const VIEW_PREFS_DOC = 'records.view';
export const VIEW_PREFS_VERSION = 1;

export function createRecordsViewPrefs({ storage }) {
  storage.register(VIEW_PREFS_DOC, VIEW_PREFS_VERSION);
  let pinnedFirst = false;
  return {
    get pinnedFirst() { return pinnedFirst; },
    async load() {
      const data = await storage.load(VIEW_PREFS_DOC);
      pinnedFirst = data !== null && typeof data === 'object' && typeof data.pinnedFirst === 'boolean' && data.pinnedFirst;
      return pinnedFirst;
    },
    async setPinnedFirst(on) {
      pinnedFirst = !!on;
      try {
        return await storage.save(VIEW_PREFS_DOC, { pinnedFirst });
      } catch (error) {
        return { ok: false, reason: 'write-failed', error };
      }
    },
  };
}
