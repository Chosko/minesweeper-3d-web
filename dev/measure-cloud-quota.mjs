// Measures whether the Steam build's save directory fits the Steam Cloud quota the owner set in the
// Steamworks app settings (feature steam-cloud-saves): the replay library's retention of unpinned
// replays plus its pinned ones, the leaderboard outbox's pending replays and every synced document,
// in bytes and in files, Auto-Cloud counting each file in the save directory once.
//
// Usage: node dev/measure-cloud-quota.mjs
//
// Replay sizes are real: the games dev/measure-replays.mjs plays through the real sessions,
// samplers and recorder (wins on every standard Classic 2D board and every 3D preset, the largest
// 3D preset included; Hexagon and Triangle record the same 2D streams as Classic 2D). A long game
// is the largest measured 3D replay with its movement stream grown at the busiest measured rate for
// that many minutes, up to MOVEMENT_CAP_BYTES, the recorder's cap, past which a game of any length
// adds actions only; the capped replay is the largest any game can seal.
//
// The retention is read from the code: the real library (js/replay/library.js) is driven over an
// in-memory store with more replays than it keeps, and the entries it keeps are counted. The
// library index and the records and history documents are the real stores' documents serialised
// as platform storage writes them; the history is sized at HISTORY_GAMES games played. The synced
// documents are every document the game registers less the machine-local ones the file service
// keeps in the machine prefs directory (desktop/file-service.js MACHINE_DOCUMENTS); the small ones
// are counted at SMALL_DOCUMENT_BYTES each. Kept-aside copies of a corrupt document are left out:
// they appear only after a corrupt read.
//
// How to read it. Each scenario fills the retention with replays of one size; pins are the pinned
// replays of that size that still fit beside it, by bytes and by files — pinning has no cap, so
// the headroom in pins is the fit's measure. A scenario fits when that headroom is not negative.

import { pathToFileURL } from 'node:url';

import { MEASURED_GAMES, playGame, movementBytes } from './measure-replays.mjs';
import { createReplayLibrary, RETAINED_UNPINNED, LIBRARY_DOC } from '../js/replay/library.js';
import { MOVEMENT_CAP_BYTES } from '../js/replay/recorder.js';
import { MODE_3D } from '../js/records/board.js';
import { createRecordsModel } from '../js/records/model.js';
import { RECORDS_DOC, HISTORY_DOC, IN_PROGRESS_DOC } from '../js/records/store.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import { createMemoryBlobStore } from '../js/platform/memory-blob-store.js';
import { createBlobStore } from '../js/platform/blob-store.js';
import { SETTINGS_DOC, MACHINE_SETTINGS_DOC } from '../js/settings/store.js';
import { VIEW_PREFS_DOC } from '../js/records/view-prefs.js';
import { FLAT_MODES } from '../js/flat-modes.js';
import { LAST_CHOICE_DOC as LAST_CHOICE_3D } from '../js/mode3d/board-choice.js';
import { FIRST_USE_DOC } from '../js/shell/first-use.js';
import { FIGURES_PANEL_DOC } from '../js/shell/live-figures.js';
import { LAST_MODE_DOC } from '../js/shell/menu.js';
import { BOARD_PANEL_DOC } from '../js/shell/returning.js';
import { OUTBOX_DOC } from '../js/leaderboards/outbox.js';
import { CATALOGUE } from '../js/leaderboards/catalogue.js';
import { MACHINE_DOCUMENTS } from '../desktop/file-service.js';

// The owner's Steamworks setting (steam-cloud-saves § Data and state), taken in decimal megabytes,
// the smaller reading of "100 MB".
export const QUOTA = Object.freeze({ bytes: 100 * 1000 * 1000, files: 1000 });

const HISTORY_GAMES = 10000; // the history's size in games played, a long-standing player's
const SMALL_DOCUMENT_BYTES = 4096; // the allowance for each small document
const LONG_GAME_MINUTES = [20, 60];

/**
 * Every document the game registers with platform storage (each `storage.register` under js/) that
 * the save directory holds: the machine-local ones excluded.
 */
export const SYNCED_DOCUMENTS = Object.freeze([
  SETTINGS_DOC, MACHINE_SETTINGS_DOC, RECORDS_DOC, HISTORY_DOC, IN_PROGRESS_DOC, VIEW_PREFS_DOC,
  LIBRARY_DOC, ...FLAT_MODES.map((m) => m.lastChoiceDoc), LAST_CHOICE_3D, FIRST_USE_DOC,
  FIGURES_PANEL_DOC, LAST_MODE_DOC, BOARD_PANEL_DOC, OUTBOX_DOC,
].filter((name) => !MACHINE_DOCUMENTS.includes(name)));

const stored = (data, version = 1) => JSON.stringify({ version, data }).length;
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

/** The real library over an in-memory store, given `unpinned` + `pinned` replays: → { kept, perEntry }. */
async function driveLibrary(listing, unpinned, pinned) {
  const backend = createMemoryBackend();
  const library = createReplayLibrary({ storage: createStorage({ backend }), blobStore: createBlobStore({ open: () => createMemoryBlobStore(), fallback: () => createMemoryBlobStore() }) });
  await library.load();
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < unpinned + pinned; i++) {
    const id = `measure-${String(i).padStart(6, '0')}`;
    await library.add(new Uint8Array(1), { ...listing, id, endedAt: new Date(start + i * 60000).toISOString() }, i < pinned);
  }
  await library.settled();
  const kept = library.entries();
  const text = backend.documents.get(LIBRARY_DOC);
  return {
    kept: kept.length,
    keptUnpinned: kept.filter((e) => e.pins.length === 0).length,
    keptPinned: kept.filter((e) => e.pins.length > 0).length,
    perEntry: text.length / kept.length,
  };
}

/** The records and history documents' bytes after `games` games recorded from `summaries`. */
function recordsDocuments(summaries, games) {
  const model = createRecordsModel();
  const start = Date.parse('2026-01-01T00:00:00Z');
  for (let i = 0; i < games; i++) {
    const s = summaries[i % summaries.length];
    model.record({ ...s, id: `measure-${i}`, endedAt: new Date(start + i * 60000).toISOString() });
  }
  const { records, history } = model.documents();
  return { records: stored(records), history: stored(history), perGame: stored(history) / games };
}

async function report() {
  const played = [];
  for (const spec of MEASURED_GAMES) played.push(await playGame(spec));

  console.log('Measured replays (bytes)');
  console.log('  board                              games  median     max  minutes  movement B/min');
  const byBoard = new Map();
  for (const g of played) {
    const key = g.replay.listing.boardKey;
    if (!byBoard.has(key)) byBoard.set(key, []);
    byBoard.get(key).push(g);
  }
  for (const [key, games] of byBoard) {
    const sizes = games.map((g) => g.replay.blob.length).sort((a, b) => a - b);
    const minutes = Math.max(...games.map((g) => g.summary.elapsedMs / 60000));
    const rate = Math.max(...games.map((g) => movementBytes(g.replay.blob) / (g.summary.elapsedMs / 60000)));
    console.log(`  ${key.padEnd(32)} ${String(games.length).padStart(5)} ${String(sizes[Math.floor(sizes.length / 2)]).padStart(7)} ${String(sizes.at(-1)).padStart(7)} ${minutes.toFixed(1).padStart(8)} ${rate.toFixed(0).padStart(15)}`);
  }

  const games3D = played.filter((g) => g.replay.listing.mode === MODE_3D);
  const largest = played.reduce((a, g) => (g.replay.blob.length > a.replay.blob.length ? g : a));
  const largest3D = games3D.reduce((a, g) => (g.replay.blob.length > a.replay.blob.length ? g : a));
  const busiest = Math.max(...games3D.map((g) => movementBytes(g.replay.blob) / (g.summary.elapsedMs / 60000)));
  const actionsOnly = largest3D.replay.blob.length - movementBytes(largest3D.replay.blob);
  const longGame = (minutes) => actionsOnly + Math.min(MOVEMENT_CAP_BYTES, busiest * minutes);
  const sizes = played.map((g) => g.replay.blob.length).sort((a, b) => a - b);

  // The retention, from the code.
  const lib = await driveLibrary(largest.replay.listing, RETAINED_UNPINNED + 25, 25);
  const retained = lib.keptUnpinned;
  console.log(`\nRetention (the real library given ${RETAINED_UNPINNED + 25} unpinned and 25 pinned replays): keeps ${lib.keptUnpinned} unpinned and ${lib.keptPinned} pinned; ${lib.perEntry.toFixed(0)} bytes of index per entry`);

  // The documents.
  const docs = recordsDocuments(played.map((g) => g.summary), HISTORY_GAMES);
  const outboxFiles = CATALOGUE.length; // at most one pending replay per leaderboard
  const small = SYNCED_DOCUMENTS.filter((n) => ![RECORDS_DOC, HISTORY_DOC, LIBRARY_DOC].includes(n));
  const documentBytes = (pins) => docs.records + docs.history + lib.perEntry * (retained + pins) + small.length * SMALL_DOCUMENT_BYTES;
  console.log(`Documents: ${SYNCED_DOCUMENTS.length} synced files (${MACHINE_DOCUMENTS.join(', ')} stays on the machine); history ${kb(docs.history)} at ${HISTORY_GAMES} games (${docs.perGame.toFixed(0)} bytes a game), records ${kb(docs.records)}, ${small.length} small documents at ${kb(SMALL_DOCUMENT_BYTES)} each`);
  console.log(`Leaderboard outbox: up to ${outboxFiles} pending replays, one per leaderboard`);
  console.log(`Quota: ${mb(QUOTA.bytes)} and ${QUOTA.files} files`);

  // The scenarios.
  const scenarios = [
    ['median measured replay', sizes[Math.floor(sizes.length / 2)]],
    ['largest measured replay', largest.replay.blob.length],
    ...LONG_GAME_MINUTES.map((m) => [`${m}-minute 3D game`, longGame(m)]),
    [`capped (a ${(MOVEMENT_CAP_BYTES / busiest / 60).toFixed(1)}-hour 3D game)`, actionsOnly + MOVEMENT_CAP_BYTES],
  ];
  console.log('\n  retention filled with             replay   unpinned+docs   pins by bytes  pins by files  fits');
  for (const [name, size] of scenarios) {
    const fixedFiles = retained + outboxFiles + SYNCED_DOCUMENTS.length;
    const fixedBytes = retained * size + outboxFiles * size + documentBytes(0);
    const pinsByBytes = Math.floor((QUOTA.bytes - fixedBytes) / (size + lib.perEntry));
    const pinsByFiles = QUOTA.files - fixedFiles;
    const pins = Math.min(pinsByBytes, pinsByFiles);
    console.log(`  ${name.padEnd(32)} ${kb(size).padStart(9)} ${mb(fixedBytes).padStart(14)} ${String(pinsByBytes).padStart(15)} ${String(pinsByFiles).padStart(14)}  ${pins >= 0 ? `yes, ${pins} pins` : 'no'}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await report();
