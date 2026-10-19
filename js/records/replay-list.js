// Records screen's library view (replay-library feature): the chosen board's kept replays from the
// replay library (js/replay/library.js), newest first, paged at PAGE_SIZE rows, with their stats and
// pin state, Watch, Pin / Unpin and Delete behind a confirmation. replayList() and the helpers are
// DOM-free; createReplayListView() binds the #records-replays markup handed in. The Records screen
// (js/records/screen.js) composes it.
//
// replayList(library, boardKey, { pinnedFirst, canWatch, formatDate, outcomeLabel, page }) →
//   { rows: [{ id, date, outcome, time, rate, efficiency, pinned, pin, action, actionLabel,
//   watch, deleteMessage, file, code }], empty, emptyText, pinnedFirst, canWatch, page, pages, label, pager }:
//   the board's entries (library.forBoard), newest end date first, or pinned ones first under the
//   filter, each group newest first; one page of them (pageOf, the page clamped to the last), label
//   its range ("Replays 11–20 of 23", empty for no replay) and pager the kit pager's state
//   (pagerState, js/ui/components.js). Times, 3BV/s and efficiency show in the results screen's
//   formats (js/results/view.js); the date (the screen hands in its date and time) and outcome
//   through the formatters the screen hands in. pinned is whether the replay carries any pin reason,
//   pin its state as text (pinState), action 'unpin' for a pinned replay and 'pin' otherwise, watch
//   whether Watch is offered (canWatch), deleteMessage its confirmation (deleteMessage), file the
//   name its Download saves under (replayFileName), code the listing's board code or null (a replay
//   from before codes). No library, or one whose query throws, is the
//   empty state.
// pinState(pins) → 'Not pinned' | 'Pinned' | 'Pinned · best'.
// deleteMessage({ date, outcome, pins }) → "Delete the replay of 11 Oct 2026 14:32, won? This cannot
//   be undone.", naming its pin reasons when pinned ("It is pinned as a best and by hand.").
// togglePin(library, row) → the library's unpin(id) for a pinned row, pin(id) otherwise. Pinning
//   adds the hand pin; unpinning clears every reason (js/replay/library.js).
// watchRoute(replayId, returnTo) → { screen: REPLAY_SCREEN, data: { replayId, returnTo } }: the
//   replay viewer's route, returnTo the { screen, data } to come back to.
// replayFileName(boardKey, endedAt) → "minesweeper-<board key>-<end date>.msrp", the name a replay
//   file is saved under (to the second, characters a file name cannot hold replaced by "-");
//   REPLAY_FILE_TYPE its extension, which Open replay file picks.
//
// createReplayListView({ root, onWatch, onTogglePin, onPinnedFirst, onPage, onDelete, onDownload,
//   onOpenFile, onCopy }) → { show(list), closeConfirm(), isConfirmOpen(), hide() }: fills
//   #records-replays by id — the Pinned first checkbox, Open replay file (#records-replays-open,
//   onOpenFile(), shown while list.canOpen), the empty state, one table row per replay with its
//   outcome as a kit chip (outcomeChip), its board code as a compact code chip (createCodeChip; Copy and Copy link call onCopy), its
//   Download (onDownload(id)), Pin / Unpin and Delete buttons and, when list.canWatch, its Watch
//   button, the range caption and the kit pager
//   (bindPager; onPage(page)). A rebuilt list keeps focus on the button of the replay that had it.
//   Delete shows the confirmation (#records-replays-confirm: the row's deleteMessage, Delete replay,
//   Cancel) in place of the list, focus on Cancel; Cancel or closeConfirm() (Back) hides it and
//   focuses that row's Delete again; Delete replay hides it and calls onDelete(id), and the next list
//   shown puts focus on the Delete of the row in its place, else the previous row's, else the Pinned
//   first checkbox. closeConfirm() → false when none is open; hide() closes it without moving focus.

import { DASH, formatTime, formatRate, formatEfficiency } from '../results/view.js';
import { PIN_BEST, PIN_HAND } from '../replay/library.js';
import { pagerState, bindPager, createCodeChip, bindCodeChip } from '../ui/components.js';
import { pageOf } from './history-chart.js';

/** The replay viewer's router screen (replay-playback); Watch shows once the shell registers it. */
export const REPLAY_SCREEN = 'replay';
export const REPLAYS_EMPTY_TEXT = 'No replays kept for this board yet.';
export const REPLAYS_NOT_SAVED = 'Replays are not being saved this session.';
export const REPLAY_HEADERS = Object.freeze(['Date', 'Outcome', 'Time', '3BV/s', 'Efficiency', 'Pin']);
export const CODE_HEADER = 'Board code';
export const REPLAY_FILE_TYPE = '.msrp';

const time = (iso) => { const t = Date.parse(iso); return Number.isNaN(t) ? -Infinity : t; };
const newestFirst = (a, b) => time(b.endedAt) - time(a.endedAt);
const plain = (v) => (v === null || v === undefined ? DASH : String(v));

export function pinState(pins) {
  if (!pins.length) return 'Not pinned';
  return pins.includes(PIN_BEST) ? 'Pinned · best' : 'Pinned';
}

export function deleteMessage({ date, outcome, pins }) {
  const best = pins.includes(PIN_BEST);
  const hand = pins.includes(PIN_HAND) || (pins.length > 0 && !best);
  const reasons = [best && 'as a best', hand && 'by hand'].filter(Boolean).join(' and ');
  const pinned = reasons ? ` It is pinned ${reasons}.` : '';
  return `Delete the replay of ${date}, ${String(outcome).toLowerCase()}?${pinned} This cannot be undone.`;
}

const UNSAFE = /[\\/:*?"<>|\s]/g;
export function replayFileName(boardKey, endedAt) {
  const end = String(endedAt).replace(/(\.\d+)?Z$/, '');
  return `minesweeper-${String(boardKey).replace(UNSAFE, '-')}-${end.replace(UNSAFE, '-')}${REPLAY_FILE_TYPE}`;
}

function replayRow(e, { canWatch, formatDate, outcomeLabel }) {
  const pinned = e.pins.length > 0;
  const date = formatDate(e.endedAt);
  const outcome = outcomeLabel(e.outcome);
  return {
    id: e.id, date, outcome, time: formatTime(e.elapsedMs),
    rate: formatRate(e.bbbvPerSecond), efficiency: formatEfficiency(e.efficiency),
    pinned, pin: pinState(e.pins), action: pinned ? 'unpin' : 'pin', actionLabel: pinned ? 'Unpin' : 'Pin',
    watch: canWatch, deleteMessage: deleteMessage({ date, outcome, pins: e.pins }), file: replayFileName(e.boardKey, e.endedAt),
    code: typeof e.code === 'string' && e.code ? e.code : null,
  };
}

export function replayList(library, boardKey, {
  pinnedFirst = false, canWatch = false, formatDate = plain, outcomeLabel = plain, page = 0,
} = {}) {
  let entries = [];
  try { entries = library ? [...library.forBoard(boardKey)] : []; } catch { entries = []; }
  entries.sort(newestFirst);
  if (pinnedFirst) entries.sort((a, b) => Number(b.pins.length > 0) - Number(a.pins.length > 0));
  const p = pageOf(entries, page);
  return {
    rows: p.items.map((e) => replayRow(e, { canWatch, formatDate, outcomeLabel })),
    empty: entries.length === 0,
    emptyText: REPLAYS_EMPTY_TEXT,
    pinnedFirst,
    canWatch,
    page: p.page, pages: p.pages,
    label: p.total ? `Replays ${p.from}–${p.to} of ${p.total}` : '',
    pager: pagerState(p.page, p.pages),
  };
}

const OUTCOME_CHIPS = Object.freeze({ Won: 'ui-chip--won', Lost: 'ui-chip--lost' });
/** A kit chip naming a game's outcome label: Won and Lost in their colours, any other muted. */
export function outcomeChip(doc, label) {
  const chip = doc.createElement('span');
  chip.className = `ui-chip ${OUTCOME_CHIPS[label] ?? 'ui-chip--muted'}`;
  chip.textContent = label;
  return chip;
}

/** A table cell holding a compact code chip for `code` (empty for none), for every Records row that names one game. */
export function codeCell(doc, code, onCopy) {
  const td = doc.createElement('td');
  td.dataset.label = CODE_HEADER;
  if (code) {
    const chip = createCodeChip(doc, { compact: true });
    bindCodeChip(chip, { onCopy }).show(code);
    td.append(chip);
  }
  return td;
}

export function togglePin(library, row) {
  return row.pinned ? library.unpin(row.id) : library.pin(row.id);
}

export function watchRoute(replayId, returnTo) {
  return { screen: REPLAY_SCREEN, data: { replayId, returnTo } };
}

export function createReplayListView({
  root, onWatch, onTogglePin, onPinnedFirst, onPage = () => {}, onDelete = () => {}, onDownload = () => {}, onOpenFile = () => {},
  onCopy = () => {},
}) {
  const $ = (id) => root.querySelector(`#${id}`);
  const doc = root.ownerDocument;
  const toggle = $('records-pinned-first');
  const toggleRow = toggle.closest('.ui-row') ?? toggle.closest('.ui-checkbox') ?? toggle;
  const body = $('records-replays-body');
  const table = $('records-replays-table');
  const empty = $('records-replays-empty');
  const caption = $('records-replays-page');
  const confirm = $('records-replays-confirm');
  const confirmText = $('records-replays-confirm-text');
  const yes = $('records-replays-yes');
  const no = $('records-replays-no');
  const pager = bindPager($('records-replays-pager'), { onPage: (page) => onPage(page), name: 'replays' });
  let last = null; // the list shown last
  let asking = null; // the id the confirmation asks about
  let afterDelete = null; // { id, index }: the deleted replay, and the row whose Delete takes focus once it is gone
  toggle.addEventListener('change', () => onPinnedFirst(toggle.checked));
  const openFile = $('records-replays-open');
  openFile?.addEventListener('click', () => onOpenFile());

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
  const deleteButtons = () => [...body.querySelectorAll('button[data-act="delete"]')];
  // The list, its tools row (Pinned first, Open replay file) and its pager show unless the confirmation stands in their place.
  const layout = () => {
    const open = asking !== null;
    confirm.classList.toggle('hidden', !open);
    toggleRow.classList.toggle('hidden', open);
    empty.classList.toggle('hidden', open || !last?.empty);
    table.classList.toggle('hidden', open || !!last?.empty);
    openFile?.classList.toggle('hidden', open || !last?.canOpen);
    if (last) pager.show(open ? { ...last.pager, hidden: true } : last.pager);
  };
  function close({ focus = true } = {}) {
    if (asking === null) return false;
    const id = asking;
    asking = null;
    layout();
    if (focus) (deleteButtons().find((b) => b.dataset.id === id) ?? toggle).focus({ preventScroll: true });
    return true;
  }
  function ask(row) {
    asking = row.id;
    confirmText.textContent = row.deleteMessage;
    layout();
    no.focus({ preventScroll: true });
  }
  no.addEventListener('click', () => close());
  yes.addEventListener('click', () => {
    if (asking === null) return;
    const id = asking;
    afterDelete = { id, index: Math.max(0, deleteButtons().findIndex((b) => b.dataset.id === id)), page: last?.page ?? 0 };
    asking = null;
    layout();
    toggle.focus({ preventScroll: true }); // until the list without it shows
    onDelete(id);
  });

  return {
    show(list) {
      const focused = body.contains(doc.activeElement) ? doc.activeElement.dataset : null;
      last = list;
      if (asking !== null && !list.rows.some((r) => r.id === asking)) close({ focus: false });
      toggle.checked = list.pinnedFirst;
      empty.textContent = list.emptyText;
      caption.textContent = list.label;
      body.replaceChildren(...list.rows.map((r) => {
        const tr = doc.createElement('tr');
        [r.date, r.outcome, r.time, r.rate, r.efficiency, r.pin].forEach((text, i) => {
          const td = doc.createElement('td');
          if (i === 1) td.append(outcomeChip(doc, text));
          else td.textContent = text;
          td.dataset.label = REPLAY_HEADERS[i];
          tr.append(td);
        });
        tr.append(codeCell(doc, r.code, onCopy));
        const actions = doc.createElement('td');
        const what = `replay of ${r.date}, ${r.time}`;
        if (r.watch) actions.append(button('Watch', `Watch ${what}`, () => onWatch(r.id), { id: r.id, act: 'watch' }));
        actions.append(button('Download', `Download ${what}`, () => onDownload(r.id), { id: r.id, act: 'download' }));
        actions.append(button(r.actionLabel, `${r.actionLabel} ${what}`, () => onTogglePin(r.id), { id: r.id, act: 'pin' }));
        actions.append(button('Delete', `Delete ${what}`, () => ask(r), { id: r.id, act: 'delete' }));
        tr.append(actions);
        return tr;
      }));
      layout();
      if (afterDelete !== null && asking === null && !list.rows.some((r) => r.id === afterDelete.id)) {
        const dels = deleteButtons();
        const at = list.page < afterDelete.page ? dels.length - 1 : Math.min(afterDelete.index, dels.length - 1);
        (dels[at] ?? toggle).focus({ preventScroll: true });
        afterDelete = null;
      } else if (focused) {
        const again = [...body.querySelectorAll('button')].find((b) => b.dataset.id === focused.id && b.dataset.act === focused.act)
          ?? [...body.querySelectorAll('button')].find((b) => b.dataset.id === focused.id);
        (again ?? toggle).focus({ preventScroll: true });
      }
    },
    closeConfirm: () => close(),
    isConfirmOpen: () => asking !== null,
    hide() {
      close({ focus: false });
      afterDelete = null;
    },
  };
}
