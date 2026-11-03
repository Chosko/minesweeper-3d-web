// The replay fetcher: downloads a leaderboard entry's shared replay through the desktop host's
// bridge client and checks it against its entry before replay-playback is handed it (no DOM).
// Playback runs its own verification before playing.
//
// createReplayFetcher({ client, capabilities }) → { replayFor }
//   capabilities  the platform's flags (js/platform/capabilities.js); with `leaderboards` or
//                 `sharedFiles` off, replayFor rejects with { reason: 'unavailable' } and asks nothing.
//   replayFor(entry) → Promise of { ok: true, replay } — the decoded replay (js/replay/format.js) —
//                 or { ok: false, reason }, reason one of REPLAY_REASONS: no replay attached to the
//                 entry, the download failed, the bytes are not a readable replay, or the replay does
//                 not match the entry — its header's board is not the entry's leaderboard's, or its
//                 check-value time is not the entry's score. entry is a reader entry
//                 (js/leaderboards/reader.js): { leaderboard, score, replay, ... }.

import { leaderboardFor } from './catalogue.js';
import { decodeReplay } from '../replay/format.js';

export const REPLAY_REASONS = Object.freeze({
  NO_REPLAY: 'no-replay',
  DOWNLOAD_FAILED: 'download-failed',
  UNREADABLE: 'unreadable',
  MISMATCH: 'mismatch',
});

const no = (reason) => ({ ok: false, reason });

export function createReplayFetcher({ client, capabilities }) {
  return {
    async replayFor(entry) {
      if (!capabilities.leaderboards || !capabilities.sharedFiles) throw Object.freeze({ reason: 'unavailable' });
      if (entry?.replay == null) return no(REPLAY_REASONS.NO_REPLAY);
      let bytes;
      try {
        bytes = await client.downloadShared(entry.replay);
      } catch {
        return no(REPLAY_REASONS.DOWNLOAD_FAILED);
      }
      let replay;
      try {
        replay = decodeReplay(bytes);
      } catch {
        return no(REPLAY_REASONS.UNREADABLE);
      }
      if (leaderboardFor(replay.header.board) !== entry.leaderboard || replay.check.elapsedMs !== entry.score) {
        return no(REPLAY_REASONS.MISMATCH);
      }
      return { ok: true, replay };
    },
  };
}
