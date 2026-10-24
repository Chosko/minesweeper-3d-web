// Board codes in the shell: what a code typed in a board choice or carried by a `#board=` link
// opens, how a daily or a challenge reaches its mode, and the link's start-up and hashchange
// handling. DOM-free: the shell hands in the window's location and history.
//
// resolveCode(text, { today, mode?, parse? }) → what the code opens:
//   { kind: 'refused', reason }   parseBoardCode's refusal (js/records/board-code.js), or — with
//                                 `mode`, a board choice's own — a code of the other mode, with a
//                                 hint naming the right one (otherModeHint) and `otherMode` its mode;
//   { kind: 'daily', id, parsed } today's code of a daily board (today YYYYMMDD): the Daily screen
//                                 opens instead, so the counted attempt rules hold;
//   { kind: 'challenge', parsed } any other code: a challenge in parsed.board.mode — its parse
//                                 without `daily`, so another day's daily code plays as a
//                                 challenge, never as a daily.
// otherModeHint(mode) → "This is a 3D board code. Paste it in the 3D board choice.".
// gameStart({ board, seed, startCell, daily?, pregenerated? }) → { mode, choice }: the mode host's
//   start for a daily (its `daily` date) or else a challenge, forcing that start cell and seed —
//   Classic 2D's choice carries `fixed` (js/classic2d/mode.js), the 3D board `forced`
//   (js/shell/mode-3d.js), each with the pre-generated board when there is one.
// freeStart(board) → { mode, choice }: a fresh free-play board of the same size, mines and no-guess
//   setting — Play again after a daily or a challenge once its mode was left; its Classic 2D
//   choice carries `remember: false`, so it saves no last board choice, as Play again from the
//   results screen does not.
// boardHash(hash) → the code a `#board=<code>` location hash carries, or null.
// createChallengeLinks({ location, history, onDaily, onChallenge, onRefused, started, today?,
//   unavailable?, toast? }) → { start(), hashchange() }:
//   start()       at start-up, once settings and records have loaded and the main menu shows: a
//                 `#board=` hash opens its daily (onDaily(id)) or challenge (onChallenge(parsed),
//                 which the shell starts over the menu, so Back leads to it); a refused code calls
//                 onRefused(reason), the shell's toast over the menu.
//   hashchange()  the window's hashchange: the same while no game is started; during one
//                 (started() true) it is ignored with toast(STARTED_TOAST).
//   Either way the hash is then removed with history.replaceState, keeping the entry's state, so
//   no history entry is added and the shell's own navigation never changes the URL. A code of a
//   mode this browser cannot run (unavailable(mode) → its reason) is refused with that reason.

import { parseBoardCode, dailyBoardOf, dateText } from '../records/board-code.js';
import { standardBoard, MODE_3D } from '../records/board.js';
import { DEFAULT_CHOICE } from '../classic2d/board-setup.js';

export const MODE_NAMES = Object.freeze({ 'classic-2d': 'Classic 2D', hexagon: 'Hexagon', triangle: 'Triangle', [MODE_3D]: '3D' });
export const STARTED_TOAST = 'Finish or leave this game to open the board link.';

export const otherModeHint = (mode) => `This is a ${MODE_NAMES[mode]} board code. Paste it in the ${MODE_NAMES[mode]} board choice.`;

export function resolveCode(text, { today = dateText(), mode = null, parse = parseBoardCode } = {}) {
  const parsed = parse(text);
  if (!parsed.ok) return { kind: 'refused', reason: parsed.reason };
  const daily = parsed.daily === today ? dailyBoardOf(parsed.board) : null;
  if (daily) return { kind: 'daily', id: daily.id, parsed };
  if (mode && parsed.board.mode !== mode) return { kind: 'refused', reason: otherModeHint(parsed.board.mode), otherMode: parsed.board.mode };
  const { daily: _date, ...challenge } = parsed;
  return { kind: 'challenge', parsed: challenge };
}

function choiceOf(board) {
  if (board.mode === MODE_3D) return { X: board.width, Y: board.height, Z: board.depth, mines: board.mines, noGuess: board.noGuess };
  const std = standardBoard({ ...board, daily: false });
  return std
    ? { size: std.name.toLowerCase(), custom: { ...DEFAULT_CHOICE.custom }, noGuess: board.noGuess }
    : { size: 'custom', custom: { width: board.width, height: board.height, mines: board.mines }, noGuess: board.noGuess };
}

export function gameStart({ board, seed, startCell, daily = null, pregenerated = null }) {
  const start = { startCell, seed, ...(daily ? { daily } : { challenge: true }) };
  const key = board.mode === MODE_3D ? 'forced' : 'fixed';
  return { mode: board.mode, choice: { ...choiceOf(board), [key]: start, ...(pregenerated ? { pregenerated } : {}) } };
}

export function freeStart(board) {
  const choice = choiceOf(board);
  return { mode: board.mode, choice: board.mode === MODE_3D ? choice : { ...choice, remember: false } };
}

const HASH = /^#board=(.+)$/;
export function boardHash(hash) {
  const m = typeof hash === 'string' ? HASH.exec(hash) : null;
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

export function createChallengeLinks({
  location, history, onDaily, onChallenge, onRefused, started = () => false, today = () => dateText(), unavailable = () => null,
  toast = () => {},
}) {
  const removeHash = () => {
    try { history.replaceState(history.state, '', `${location.pathname}${location.search}`); } catch { /* a URL the page cannot rewrite stays */ }
  };
  const open = (code) => {
    const r = resolveCode(code, { today: today() });
    if (r.kind === 'refused') { onRefused(r.reason); return; }
    const reason = unavailable(r.parsed.board.mode);
    if (reason) { onRefused(reason); return; }
    if (r.kind === 'daily') onDaily(r.id);
    else onChallenge(r.parsed);
  };
  const follow = (fromStart) => {
    const code = boardHash(location.hash);
    if (code === null) return false;
    removeHash();
    if (!fromStart && started()) { toast(STARTED_TOAST); return true; }
    open(code);
    return true;
  };
  return {
    start: () => follow(true),
    hashchange: () => follow(false),
  };
}
