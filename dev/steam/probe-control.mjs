// Finds or creates a throwaway leaderboard from the client (ascending, time in milliseconds),
// uploads a fixed score with details to it and reads it back: the control beside probe-upload.mjs,
// telling a board that refuses client uploads from an upload path that is broken.
//
// Usage: node dev/steam/probe-control.mjs [leaderboard] [--yes]
//   leaderboard  default PROBE_CONTROL; never a catalogue name
//   --yes        create and upload; without it the probe prints what it would do and stops
//
// The board and its entry are real: delete the board in Steamworks afterwards. Steam must be
// running and logged on, and the game closed. Runs from any directory (see probe-steam.mjs).
import { json, withSteam } from './probe-steam.mjs';

const SORT_ASCENDING = 1;
const DISPLAY_TIME_MS = 3;
const SCORE = 10488;
const DETAILS = [1, 3, 1, 10, 10, 1, 0, 10, 0, 8, 1];

const args = process.argv.slice(2);
const confirmed = args.includes('--yes');
const name = args.find((a) => a !== '--yes') ?? 'PROBE_CONTROL';

console.log(`find or create ${name} (ascending, milliseconds), upload score ${SCORE}, details [${DETAILS}]`);
if (!confirmed) {
  console.log('nothing written: add --yes to create the board and upload');
  process.exit(0);
}

await withSteam(async ({ binding, sdk }) => {
  const board = await sdk.leaderboards.findOrCreateLeaderboard(name, SORT_ASCENDING, DISPLAY_TIME_MS);
  console.log('board', json(board));
  if (!board) return;
  const handle = String(board.handle ?? board);
  try {
    console.log('upload', json(await binding.uploadScore(handle, SCORE, DETAILS)));
  } catch (error) {
    console.log('upload error', error.message);
  }
  console.log('entries', json(await binding.downloadEntries(handle, 'global', 1, 10)));
});
