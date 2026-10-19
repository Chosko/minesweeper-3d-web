// The daily boards in the shell: today's local date, each row's counted attempt read from the
// records, the boards pre-generated when the main menu shows, and the Daily screen. The logic is
// DOM-free; bindDailyScreen binds the #daily markup handed in.
//
// Each day has the two DAILY_BOARDS (js/records/board-code.js): Expert no-guess and the cube
// 8 × 8 × 8 · 40 no-guess. "Today" is the player's local calendar date (dateText). A row's counted
// attempt is the first daily game of that date recorded on its Daily board — the board's identity
// with the daily flag — which a daily reaches at its first click: the records' game-in-progress
// marker makes a game started and then left, restarted or closed a loss of its own date, so a
// reload or midnight changes nothing. A daily left before its first click uses nothing.
//
// dailyIdentity(id) → the Daily board's identity of a row ('expert' | 'cube').
// countedAttempt(records, id, date) → the row's counted history entry for date, or null.
// dailyRows({ records, replays?, now?, unavailable? }) → one row per daily board, in DAILY_BOARDS
//   order: { id, label, board, date, dateLabel, code, state ('unplayed' | 'won' | 'lost'), result
//   ("Not played", "Won 48.213 s" (formatTime, js/results/view.js), "Lost"), current, longest
//   (days in a row, daysInARow, js/records/model.js), streak ("Days in a row 3 · longest 5"),
//   canPlay, attempt (its summary id or null), watch (that id when the replay library keeps its replay, else null), reason }.
//   unavailable maps a mode to the reason it cannot run here (the cube row's 3D, task 132's reason);
//   such a row cannot be played. A records query that throws reads as no game.
// createDailyBoards({ clients }) → { prepare(records, now?), take(code), has(code) }: clients maps a
//   mode to () → its generation client (js/generation/client.js), each mode's one warm client.
//   prepare asks, in the background, for every one of today's daily boards whose counted attempt is
//   unused and that is neither held nor in flight (pregenerate), and drops those of other dates; it
//   never waits. A finished board is held under its code: it is deterministic, so it equals a fresh
//   generation. take(code) hands the held board over (in flight or arrived) and forgets it; a failed
//   or cancelled one is not handed over, so the session generates it afresh.
// dailyPreview(now?) → the main menu's Daily preview: today's daily Expert board, closed, its start cell
//   marked — { board, startCell, date, dateLabel, tag } (tag "Daily · 16 Oct 2026"); nothing is
//   generated, the start cell comes with the day's board (dailyGame).
// bindDailyScreen({ root, onPlay, onWatch, onBack, onCopy? }) → { show(rows), defaultFocus() }: each
//   row's element [data-daily="<id>"] shows its date [data-date], board [data-board], state
//   [data-state], streak [data-streak], the reason [data-reason] (hidden without one), its code chip
//   [data-code] (js/ui/components.js bindCodeChip; Copy and Copy link call onCopy), Play
//   [data-play] (disabled while canPlay is false; onPlay(id)) and Watch replay [data-watch] (shown
//   for a kept replay; onWatch(replayId)); Back [data-back] calls onBack(). defaultFocus() is the
//   first enabled Play, else Back.

import { DAILY_BOARDS, dailyGame, dateText } from '../records/board-code.js';
import { createBoardIdentity, boardLabel } from '../records/board.js';
import { daysInARow } from '../records/model.js';
import { pregenerate } from '../generation/client.js';
import { bindCodeChip } from '../ui/components.js';
import { formatTime } from '../results/view.js';

export const DAILY_SCREEN = 'daily';
export const NOT_PLAYED = 'Not played';
export const LOST = 'Lost';

const attempt = (fn, fallback) => { try { return fn(); } catch { return fallback; } };
const rowOf = (id) => {
  const d = DAILY_BOARDS.find((b) => b.id === id);
  if (!d) throw new RangeError(`unknown daily board ${JSON.stringify(id)}`);
  return d;
};

export function dailyIdentity(id) {
  return createBoardIdentity({ ...rowOf(id).board, daily: true });
}

export function countedAttempt(records, id, date) {
  const history = attempt(() => records.history(dailyIdentity(id)), []);
  return history.find((e) => e?.daily === date) ?? null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** A YYYYMMDD date as "14 Oct 2026". */
export const dailyDateLabel = (date) => `${Number(date.slice(6, 8))} ${MONTHS[Number(date.slice(4, 6)) - 1]} ${date.slice(0, 4)}`;

export function dailyRows({ records, replays = null, now = new Date(), unavailable = {} } = {}) {
  const date = dateText(now);
  return DAILY_BOARDS.map((d) => {
    const game = dailyGame(d.id, date);
    const counted = countedAttempt(records, d.id, date);
    const counters = attempt(() => records.counters(dailyIdentity(d.id)), null);
    const days = daysInARow(counters, date);
    const state = !counted ? 'unplayed' : counted.outcome === 'won' ? 'won' : 'lost';
    const reason = unavailable[d.board.mode] ?? null;
    const kept = counted && attempt(() => replays?.has(counted.id), false) === true ? counted.id : null;
    return {
      id: d.id,
      label: d.label,
      board: boardLabel(dailyIdentity(d.id)).replace(/^Daily · /, ''), // a 3D board by its dimensions, as its code names it
      date,
      dateLabel: dailyDateLabel(date),
      code: game.code,
      state,
      result: state === 'unplayed' ? NOT_PLAYED : state === 'won' ? `Won ${formatTime(counted.elapsedMs)}` : LOST,
      current: days.current,
      longest: days.longest,
      streak: `Days in a row ${days.current} · longest ${days.longest}`,
      canPlay: !counted && !reason,
      attempt: counted?.id ?? null,
      watch: kept,
      reason,
    };
  });
}

/** The daily board the main menu's Daily preview shows: today's Expert. */
export const PREVIEW_DAILY = 'expert';

export function dailyPreview(now = new Date()) {
  const game = dailyGame(PREVIEW_DAILY, dateText(now));
  const dateLabel = dailyDateLabel(game.date);
  return {
    board: game.board, startCell: game.startCell, date: game.date, dateLabel, tag: `Daily · ${dateLabel}`,
  };
}

export function createDailyBoards({ clients }) {
  const held = new Map(); // code → the pre-generated board
  const usable = (pg) => !(pg.settled && !pg.result?.ok);
  return {
    prepare(records, now = new Date()) {
      const date = dateText(now);
      const today = new Set();
      for (const d of DAILY_BOARDS) {
        const game = dailyGame(d.id, date);
        today.add(game.code);
        if (countedAttempt(records, d.id, date)) continue; // a used attempt asks for nothing
        const pg = held.get(game.code);
        if (pg && usable(pg)) continue;
        const client = attempt(() => clients[d.board.mode]?.(), null);
        if (!client) continue;
        held.set(game.code, pregenerate(client, game.request));
      }
      for (const code of [...held.keys()]) if (!today.has(code)) held.delete(code);
    },
    take(code) {
      const pg = held.get(code) ?? null;
      held.delete(code);
      return pg && usable(pg) ? pg : null;
    },
    has(code) { return held.has(code); },
  };
}

export function bindDailyScreen({ root, onPlay, onWatch, onBack, onCopy = () => {} }) {
  const rows = new Map();
  for (const el of root.querySelectorAll('[data-daily]')) {
    const id = el.dataset.daily;
    const part = (name) => el.querySelector(`[data-${name}]`);
    const r = {
      el, date: part('date'), board: part('board'), state: part('state'), streak: part('streak'), reason: part('reason'),
      play: part('play'), watch: part('watch'), chip: bindCodeChip(part('code'), { onCopy: (c) => onCopy(c) }), replay: null,
    };
    r.play.addEventListener('click', () => { if (!r.play.disabled) onPlay(id); });
    r.watch.addEventListener('click', () => { if (r.replay) onWatch(r.replay); });
    rows.set(id, r);
  }
  const back = root.querySelector('[data-back]');
  back.addEventListener('click', () => onBack());
  return {
    show(list) {
      for (const row of list) {
        const r = rows.get(row.id);
        if (!r) continue;
        r.date.textContent = row.dateLabel;
        r.board.textContent = row.board;
        r.state.textContent = row.result;
        r.streak.textContent = row.streak;
        r.reason.textContent = row.reason ?? '';
        r.reason.classList.toggle('hidden', !row.reason);
        r.chip.show(row.code);
        r.play.disabled = !row.canPlay;
        r.replay = row.watch;
        r.watch.classList.toggle('hidden', !row.watch);
      }
    },
    defaultFocus() {
      const play = [...rows.values()].find((r) => !r.play.disabled);
      return play ? `#${play.play.id}` : `#${back.id}`;
    },
  };
}
