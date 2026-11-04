// Prints the top ten global entries of each named leaderboard, or `null` for a board Steam does not
// find. Writes nothing.
//
// Usage: node dev/steam/read-board.mjs <leaderboard>...
// e.g.   node dev/steam/read-board.mjs classic-2d-beginner-no-guess 3d-cube-expert-guess
//
// Steam must be running and logged on, and the game closed. Runs from any directory (see
// probe-steam.mjs).
import { json, withSteam } from './probe-steam.mjs';

const names = process.argv.slice(2);
if (!names.length) {
  console.log('usage: node dev/steam/read-board.mjs <leaderboard>...');
  process.exit(1);
}

await withSteam(async ({ binding }) => {
  for (const name of names) {
    const handle = await binding.findLeaderboard(name);
    const top = handle ? await binding.downloadEntries(handle, 'global', 1, 10) : null;
    console.log('BOARD', name, json(top));
  }
});
