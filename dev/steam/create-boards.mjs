// Creates every leaderboard of the catalogue (js/leaderboards/catalogue.js's CATALOGUE) from the
// client — ascending sort, time in milliseconds — and prints each board's handle, sort, display and
// entry count. A board that exists already is found, not changed. No score is uploaded.
//
// Usage: node dev/steam/create-boards.mjs
//
// Steam must be running and logged on, and the game closed. Runs from any directory (see
// probe-steam.mjs). Why the boards are made here and not on the Steamworks site: README.md.
import { CATALOGUE } from '../../js/leaderboards/catalogue.js';
import { withSteam } from './probe-steam.mjs';

const SORT_ASCENDING = 1;
const DISPLAY_TIME_MS = 3;

await withSteam(async ({ sdk }) => {
  for (const { name } of CATALOGUE) {
    const board = await sdk.leaderboards.findOrCreateLeaderboard(name, SORT_ASCENDING, DISPLAY_TIME_MS);
    console.log('RESULT', name, board
      ? `handle=${board.handle} sort=${board.sortMethod} display=${board.displayType} entries=${board.entryCount}`
      : 'FAILED');
  }
});
