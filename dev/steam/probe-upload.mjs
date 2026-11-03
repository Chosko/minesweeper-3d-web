// Uploads one score to one existing leaderboard through the game's binding, then prints the board's
// top ten entries: the check that a client upload reaches a board.
//
// Usage: node dev/steam/probe-upload.mjs <leaderboard> <score ms> [details | none] [--yes]
//   details  comma-separated int32s (default: SAMPLE_DETAILS below), or `none` for no details
//   --yes    upload; without it the probe prints what it would upload and stops
// e.g.   node dev/steam/probe-upload.mjs classic-2d-beginner-no-guess 10488 none --yes
//
// The upload writes a real entry for the logged-on account, and Steam keeps it if it beats the
// account's entry: reset the entry in Steamworks afterwards. Steam must be running and logged on,
// and the game closed. Runs from any directory (see probe-steam.mjs).
import { json, withSteam } from './probe-steam.mjs';

const SAMPLE_DETAILS = [1, 3, 1, 10, 10, 1, 0, 10, 0, 8, 1];

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const [name, scoreArg, detailsArg] = args.filter((a) => a !== '--yes');
const score = Number(scoreArg);
if (!name || !Number.isInteger(score)) {
  console.log('usage: node dev/steam/probe-upload.mjs <leaderboard> <score ms> [details | none] [--yes]');
  process.exit(1);
}
const details = detailsArg === undefined ? SAMPLE_DETAILS
  : detailsArg === 'none' ? []
    : detailsArg.split(',').map(Number);
if (details.some((d) => !Number.isInteger(d))) {
  console.log('details must be comma-separated integers, or `none`');
  process.exit(1);
}

console.log(`upload to ${name}: score ${score}, details ${details.length ? `[${details}]` : 'none'}`);
if (!confirmed) {
  console.log('not uploaded: add --yes to write this entry');
  process.exit(0);
}

await withSteam(async ({ binding }) => {
  console.log('steamId', binding.steamId(), 'loggedOn', binding.loggedOn());
  const handle = await binding.findLeaderboard(name);
  console.log('handle', handle);
  if (!handle) return;
  try {
    console.log('upload', json(await binding.uploadScore(handle, score, details)));
  } catch (error) {
    console.log('upload error', error.message);
  }
  console.log('entries', json(await binding.downloadEntries(handle, 'global', 1, 10)));
});
