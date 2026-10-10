// Records screen's library view (replay-library feature): the chosen board's kept replays from the
// replay library (js/replay/library.js), newest first, with their stats and pin state, Watch and
// Pin / Unpin. replayList() and the helpers are DOM-free; createReplayListView() binds the
// #records-replays markup handed in. The Records screen (js/records/screen.js) composes it.
//
// replayList(library, boardKey, { pinnedFirst, canWatch, formatDate, outcomeLabel }) →
//   { rows: [{ id, date, outcome, time, rate, efficiency, pinned, pin, action, actionLabel,
//   watch }], empty, emptyText, pinnedFirst, canWatch }: the board's entries (library.forBoard),
//   newest end date first, or pinned ones first under the filter, each group newest first. Times,
//   3BV/s and efficiency show in the results screen's formats (js/results/view.js); the date and
//   outcome through the formatters the screen hands in. pinned is whether the replay carries any
//   pin reason, pin its state as text (pinState), action 'unpin' for a pinned replay and 'pin'
//   otherwise, watch whether Watch is offered (canWatch). No library, or one whose query throws,
//   is the empty state.
// pinState(pins) → 'Not pinned' | 'Pinned' | 'Pinned · best'.
// togglePin(library, row) → the library's unpin(id) for a pinned row, pin(id) otherwise. Pinning
//   adds the hand pin; unpinning clears every reason (js/replay/library.js).
// watchRoute(replayId, returnTo) → { screen: REPLAY_SCREEN, data: { replayId, returnTo } }: the
//   replay viewer's route, returnTo the { screen, data } to come back to.
//
// createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst }) → { show(list) }: fills
// #records-replays by id — the pinned-first toggle, the empty state and one table row per replay
// with its Pin / Unpin button and, when list.canWatch, its Watch button. A rebuilt list keeps focus
// on the button of the replay that had it.

import { DASH, formatTime, formatRate, formatEfficiency } from '../results/view.js';
import { PIN_BEST } from '../replay/library.js';

/** The replay viewer's router screen (replay-playback); Watch shows once the shell registers it. */
export const REPLAY_SCREEN = 'replay';
export const REPLAYS_EMPTY_TEXT = 'No replays kept for this board yet.';
export const REPLAYS_NOT_SAVED = 'Replays are not being saved this session.';
export const REPLAY_HEADERS = Object.freeze(['Date', 'Outcome', 'Time', '3BV/s', 'Efficiency', 'Pin']);

const time = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? -Infinity : t; };
const newestFirst = (a, b) => time(b.endedAt) - time(a.endedAt);
const plain = (v) => (v === null || v === undefined ? DASH : String(v));

export function pinState(pins) {
  if (!pins.length) return 'Not pinned';
  return pins.includes(PIN_BEST) ? 'Pinned · best' : 'Pinned';
}

function replayRow(e, { canWatch, formatDate, outcomeLabel }) {
  const pinned = e.pins.length > 0;
  return {
    id: e.id, date: formatDate(e.endedAt), outcome: outcomeLabel(e.outcome), time: formatTime(e.elapsedMs),
    rate: formatRate(e.bbbvPerSecond), efficiency: formatEfficiency(e.efficiency),
    pinned, pin: pinState(e.pins), action: pinned ? 'unpin' : 'pin', actionLabel: pinned ? 'Unpin' : 'Pin',
    watch: canWatch,
  };
}

export function replayList(library, boardKey, {
  pinnedFirst = false, canWatch = false, formatDate = plain, outcomeLabel = plain,
} = {}) {
  let entries = [];
  try { entries = library ? [...library.forBoard(boardKey)] : []; } catch { entries = []; }
  entries.sort(newestFirst);
  if (pinnedFirst) entries.sort((a, b) => Number(b.pins.length > 0) - Number(a.pins.length > 0));
  return {
    rows: entries.map((e) => replayRow(e, { canWatch, formatDate, outcomeLabel })),
    empty: entries.length === 0,
    emptyText: REPLAYS_EMPTY_TEXT,
    pinnedFirst,
    canWatch,
  };
}

export function togglePin(library, row) {
  return row.pinned ? library.unpin(row.id) : library.pin(row.id);
}

export function watchRoute(replayId, returnTo) {
  return { screen: REPLAY_SCREEN, data: { replayId, returnTo } };
}

export function createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst }) {
  const $ = (id) => root.querySelector(`#${id}`);
  const doc = root.ownerDocument;
  const toggle = $('records-pinned-first');
  const body = $('records-replays-body');
  const table = $('records-replays-table');
  const empty = $('records-replays-empty');
  toggle.addEventListener('change', () => onPinnedFirst(toggle.checked));

  const button = (text, label, onClick, data) => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'ui-button ui-button--secondary';
    b.textContent = text;
    b.setAttribute('aria-label', label);
    Object.assign(b.dataset, data);
    b.addEventListener('click', onClick);
    return b;
  };

  return {
    show(list) {
      const focused = body.contains(doc.activeElement) ? doc.activeElement.dataset : null;
      toggle.checked = list.pinnedFirst;
      empty.textContent = list.emptyText;
      empty.classList.toggle('hidden', !list.empty);
      table.classList.toggle('hidden', list.empty);
      body.replaceChildren(...list.rows.map((r) => {
        const tr = doc.createElement('tr');
        for (const text of [r.date, r.outcome, r.time, r.rate, r.efficiency, r.pin]) {
          const td = doc.createElement('td');
          td.textContent = text;
          tr.append(td);
        }
        const actions = doc.createElement('td');
        const what = `replay of ${r.date}, ${r.time}`;
        if (r.watch) actions.append(button('Watch', `Watch ${what}`, () => onWatch(r.id), { id: r.id, act: 'watch' }));
        actions.append(button(r.actionLabel, `${r.actionLabel} ${what}`, () => onTogglePin(r.id), { id: r.id, act: 'pin' }));
        tr.append(actions);
        return tr;
      }));
      if (focused) {
        const again = [...body.querySelectorAll('button')].find((b) => b.dataset.id === focused.id && b.dataset.act === focused.act)
          ?? [...body.querySelectorAll('button')].find((b) => b.dataset.id === focused.id);
        (again ?? toggle).focus({ preventScroll: true });
      }
    },
  };
}
