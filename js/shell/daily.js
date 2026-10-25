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
//   order: { id, mode, label, board, line, date, dateLabel, code, state ('unplayed' | 'won' | 'lost'),
//   result ("Not played", "Won 48.213 s" (formatTime, js/results/view.js), "Lost"), time (a won row's
//   time alone, "48.213 s", else null), current, longest
//   (days in a row, daysInARow, js/records/model.js), streak ("Days in a row 3 · longest 5"),
//   canPlay, attempt (its summary id or null), watch (that id for a won attempt whose replay the
//   replay library keeps, else null), reason }. board is the records' label ("Expert · no-guess", a 3D board by
//   its dimensions); line the Daily screen's board line ("Expert · 30 × 16 · 99 mines · no-guess").
//   unavailable maps a mode to the reason it cannot run here (the cube row's 3D, task 132's reason);
//   such a row cannot be played. A records query that throws reads as no game.
// dailyModes({ records, replays?, now?, unavailable?, entries? }) → the Daily screen's entries, one
//   per mode of the main menu in its order (MENU_ENTRIES, js/shell/menu.js): { mode, label, daily
//   (its dailyRows row, null for a mode with no daily board yet), line (the board line, the row's
//   reason, or COMING_SOON), title ("Classic 2D · Expert · no-guess", "Hexagon · daily"), summary
//   (the bottom bar: "Daily · <title>", "Daily · 3D · played today", "Daily · 3D · needs WebGL 2",
//   "Daily · Hexagon · coming soon"), note (a coming-soon mode's line, else null), canPlay }.
// dailyPanel(entry, { missing? }) → what the screen's scene panel shows for an entry, as the main
//   menu's preview binder takes it (js/shell/menu-preview.js): the closed Expert board ('daily'),
//   the 3D scene ('scene'; 'still' when `missing` holds 'webgl2'), or the mode's colour badge with
//   COMING_SOON ('badge').
// createDailyBoards({ clients }) → { prepare(records, now?), take(code), has(code) }: clients maps a
//   mode to () → its generation client (js/generation/client.js), each mode's one warm client.
//   prepare asks, in the background, for every one of today's daily boards whose counted attempt is
//   unused and that is neither held nor in flight (pregenerate), and drops those of other dates; it
//   never waits. A finished board is held under its code: it is deterministic, so it equals a fresh
//   generation. take(code) hands the held board over (in flight or arrived) and forgets it; a failed
//   or cancelled one is not handed over, so the session generates it afresh.
// dailyPreview(now?) → the Daily screen's Classic 2D preview: today's daily Expert board, closed, its start cell
//   marked — { board, startCell, date, dateLabel, tag } (tag "Daily · 16 Oct 2026"); nothing is
//   generated, the start cell comes with the day's board (dailyGame).
// bindDailyScreen({ root, onPlay, onWatch, onBack, onCopy?, onSelect? }) → { show(entries),
//   select(mode), selected, defaultFocus() }: one option [data-mode="<mode>"] per entry (aria-pressed
//   marks the selected one), its state chip [data-state] (the state alone — NOT_PLAYED, WON, LOST —
//   in ui-chip--muted, --won or --lost; hidden for a coming-soon mode), a won row's time apart from
//   it [data-time] (hidden otherwise) and board line [data-line]; an entry whose row has a reason is
//   disabled. Today's date [data-date]. For the selected entry: its title [data-title], the reason
//   [data-reason] and the note [data-note] (each hidden without one), the state [data-status] — its
//   chip [data-result], a won row's time [data-result-time] and days in a row [data-streak], hidden
//   for a coming-soon mode —, the code chip [data-code] under its label, the two in
//   [data-code-group] (js/ui/components.js bindCodeChip; hidden with no board; Copy and Copy link
//   call onCopy), the summary [data-summary], Watch replay [data-watch] (shown for a
//   kept replay; onWatch(replayId)) and Play [data-play] (disabled while canPlay is false;
//   onPlay(id)); Back [data-back] calls onBack(). A click (a tap, the controller's A) selects an
//   entry and calls onSelect(entry); Enter selects the entry it is pressed on and plays it, and
//   plays anywhere else in the screen but on another button. show keeps the selection while that
//   entry can still be selected, else selects the first entry that can be played, else the first
//   enabled one. defaultFocus() is the selected entry.

import { DAILY_BOARDS, dailyGame, dateText } from '../records/board-code.js';
import { createBoardIdentity, boardLabel } from '../records/board.js';
import { daysInARow } from '../records/model.js';
import { pregenerate } from '../generation/client.js';
import { bindCodeChip } from '../ui/components.js';
import { formatTime } from '../results/view.js';
import { MENU_ENTRIES, COMING_SOON } from './menu.js';

export const DAILY_SCREEN = 'daily';
export const NOT_PLAYED = 'Not played';
export const WON = 'Won';
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
    const kept = state === 'won' && attempt(() => replays?.has(counted.id), false) === true ? counted.id : null;
    return {
      id: d.id,
      mode: d.board.mode,
      label: d.label,
      board: boardLabel(dailyIdentity(d.id)).replace(/^Daily · /, ''), // a 3D board by its dimensions, as its code names it
      line: boardLine(d),
      date,
      dateLabel: dailyDateLabel(date),
      code: game.code,
      state,
      result: state === 'unplayed' ? NOT_PLAYED : state === 'won' ? `${WON} ${formatTime(counted.elapsedMs)}` : LOST,
      time: state === 'won' ? formatTime(counted.elapsedMs) : null,
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

/** A daily board's line on the Daily screen: its name, dimensions, mines and setting. */
function boardLine({ label, board: b }) {
  const dims = [b.width, b.height, b.depth].filter((n) => Number.isFinite(n)).join(' × ');
  return [label, dims, `${b.mines} ${b.mines === 1 ? 'mine' : 'mines'}`, ...(b.noGuess ? ['no-guess'] : [])].join(' · ');
}

/** A reason's short form for the bottom bar: "Needs WebGL 2 — not available …" → "needs WebGL 2". */
const shortReason = (reason) => {
  const head = reason.split(' — ')[0];
  return head.charAt(0).toLowerCase() + head.slice(1);
};

export function dailyModes({ records, replays = null, now = new Date(), unavailable = {}, entries = MENU_ENTRIES } = {}) {
  const rows = dailyRows({ records, replays, now, unavailable });
  return entries.filter((e) => e.mode).map(({ mode, label }) => {
    const row = rows.find((r) => r.mode === mode) ?? null;
    if (!row) {
      return {
        mode, label, daily: null, line: COMING_SOON, title: `${label} · daily`, summary: `Daily · ${label} · coming soon`,
        note: `${label} has no daily board yet.`, canPlay: false,
      };
    }
    // The board named by its label unless the records' label already names it ("Expert · no-guess").
    const title = `${label} · ${row.board.startsWith(row.label) ? row.board : `${row.label} ${row.board}`}`;
    const summary = row.reason ? `Daily · ${label} · ${shortReason(row.reason)}`
      : row.state !== 'unplayed' ? `Daily · ${label} · played today` : `Daily · ${title}`;
    return { mode, label, daily: row, line: row.reason ?? row.line, title, summary, note: null, canPlay: row.canPlay };
  });
}

export function dailyPanel(entry, { missing = [] } = {}) {
  if (!entry.daily) return { kind: 'badge', entry: entry.mode, label: COMING_SOON, note: null, locked: false };
  if (entry.mode === '3d') return { kind: missing.includes('webgl2') ? 'still' : 'scene', tag: '' };
  return { kind: 'daily', tag: '' };
}

/** The daily board the Daily screen's Classic 2D preview shows: today's Expert. */
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

const CHIP = Object.freeze({ won: 'ui-chip--won', lost: 'ui-chip--lost', unplayed: 'ui-chip--muted' });
const STATE = Object.freeze({ won: WON, lost: LOST, unplayed: NOT_PLAYED });
/** A state chip showing a row's state in its outcome's variant, and a won row's time apart from it. */
function showChip(chip, time, row) {
  chip.textContent = STATE[row?.state] ?? '';
  for (const [state, cls] of Object.entries(CHIP)) chip.classList.toggle(cls, row?.state === state);
  time.textContent = row?.time ?? '';
  time.classList.toggle('hidden', !row?.time);
}

export function bindDailyScreen({ root, onPlay, onWatch, onBack, onCopy = () => {}, onSelect = () => {} }) {
  const part = (name) => root.querySelector(`[data-${name}]`);
  const options = new Map();
  for (const el of root.querySelectorAll('[data-mode]')) {
    options.set(el.dataset.mode, { el, chip: el.querySelector('[data-state]'), time: el.querySelector('[data-time]'), line: el.querySelector('[data-line]') });
  }
  const date = part('date');
  const title = part('title');
  const reason = part('reason');
  const note = part('note');
  const status = part('status');
  const result = part('result');
  const resultTime = part('result-time');
  const streak = part('streak');
  const codeGroup = part('code-group');
  const chip = bindCodeChip(part('code'), { onCopy: (c) => onCopy(c) });
  const summary = part('summary');
  const watch = part('watch');
  const play = part('play');
  const back = part('back');
  let entries = [];
  let selected = null;

  const entryOf = (mode) => entries.find((e) => e.mode === mode) ?? null;
  const selectable = (e) => !!e && !!options.get(e.mode) && !e.daily?.reason;
  const render = () => {
    const e = entryOf(selected);
    const row = e?.daily ?? null;
    for (const [mode, o] of options) o.el.setAttribute('aria-pressed', String(mode === selected));
    title.textContent = e?.title ?? '';
    reason.textContent = row?.reason ?? '';
    reason.classList.toggle('hidden', !row?.reason);
    note.textContent = e?.note ?? '';
    note.classList.toggle('hidden', !e?.note);
    status.classList.toggle('hidden', !row);
    showChip(result, resultTime, row);
    streak.textContent = row?.streak ?? '';
    chip.show(row?.code ?? null);
    codeGroup.classList.toggle('hidden', !row?.code);
    summary.textContent = e?.summary ?? '';
    watch.classList.toggle('hidden', !row?.watch);
    play.disabled = !e?.canPlay;
  };
  const select = (mode) => {
    const e = entryOf(mode);
    if (!selectable(e)) return;
    selected = mode;
    render();
    onSelect(e);
  };
  const start = () => {
    const row = entryOf(selected)?.daily;
    if (row?.canPlay) onPlay(row.id);
  };

  for (const [mode, o] of options) o.el.addEventListener('click', () => select(mode));
  play.addEventListener('click', () => { if (!play.disabled) start(); });
  watch.addEventListener('click', () => { const id = entryOf(selected)?.daily?.watch; if (id) onWatch(id); });
  back.addEventListener('click', () => onBack());
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const opt = event.target?.closest?.('[data-mode]');
    if (!opt && event.target?.closest?.('button')) return; // another button activates itself
    event.preventDefault();
    if (opt) select(opt.dataset.mode);
    start();
  });

  return {
    get selected() { return selected; },
    show(list) {
      entries = list;
      date.textContent = list.find((e) => e.daily)?.daily.dateLabel ?? '';
      for (const e of list) {
        const o = options.get(e.mode);
        if (!o) continue;
        showChip(o.chip, o.time, e.daily);
        o.chip.classList.toggle('hidden', !e.daily);
        o.line.textContent = e.line;
        o.el.disabled = !!e.daily?.reason;
      }
      const keep = selectable(entryOf(selected)) ? selected : null;
      const next = keep ?? list.find((e) => selectable(e) && e.canPlay)?.mode ?? list.find(selectable)?.mode ?? null;
      selected = null;
      if (next) select(next);
      else render();
    },
    select,
    defaultFocus() {
      const o = options.get(selected);
      return o ? `#${o.el.id}` : `#${back.id}`;
    },
  };
}
