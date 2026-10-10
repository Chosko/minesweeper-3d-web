// Rules engine over a cell graph: game state, the first-click hand-off and the actions (no DOM).
//
// A game is created under a rule profile and rules version (js/engine/profiles.js) either from a
// mine count — phase *awaiting first click*, no mines yet — or from a full mine set — directly
// *playing*. The engine never chooses where mines go: the first reveal while awaiting returns a
// "board needed at cell c" request (`boardNeeded: c`) and changes nothing; the caller obtains a
// board from board-generation and hands it over with supplyBoard(c, mines), which applies that
// reveal. A board with a mine on c, or the wrong mine count, is rejected and the game is unchanged.
//
// Actions — reveal, toggleFlag, chord — take a cell index and return
//   { changed, ended, boardNeeded }
// where `changed` lists the cells whose visual state changed (an Int32Array view of one buffer
// reused by every action: read or copy it before the next action), `ended` is true when the
// action won or lost the game, and `boardNeeded` is the requested cell or -1. An action outside
// *playing* (other than the first reveal's request) changes nothing and is not recorded, and
// neither is a flag toggle on a revealed cell under a profile that does not flag from one.
//
// Profile markers the engine branches on: `flagRevealedCell` ('neighbours': a flag click on a
// revealed cell flags its closed neighbours, or unflags them all), `zeroFloodStopsAtFlag` (a zero
// with a flagged neighbour does not spread), `revealOnRevealedZero` ('chord'), `autoHide` (the
// per-cell `hidden` state, kept after every action while playing and reported among the changed
// cells; shown again at a loss) and `clickCounting`. The reference profile never sets `hidden`.
//
// State is flat typed arrays over the cell index (`state`, read-only for callers); flood fill and
// hide propagation are iterative walks in the graph's neighbour order. Actions allocate nothing
// per cell.
// The ordered stream of applied actions is kept for the game; the same board and the same
// actions always give the same game.
//
// Counts (js/engine/metrics.js): the board's 3BV once the mines are placed, the 3BV solved so
// far, and every recorded action as one click, effective or wasted by the profile's
// `clickCounting` rule. counts() reads them at any time; summary() is the game summary at a win
// or a loss (null before): outcome, board dimensions, mine count, 3BV, 3BV solved, clicks.

import { getRuleProfile } from './profiles.js';
import { createBoardMetrics, createClickCounts } from './metrics.js';

export const PHASE = Object.freeze({
  AWAITING_FIRST_CLICK: 'awaiting-first-click',
  PLAYING: 'playing',
  WON: 'won',
  LOST: 'lost',
});

// The visual states the tile skin paints.
export const CELL = Object.freeze({
  CLOSED: 'closed',
  FLAGGED: 'flagged',
  REVEALED: 'revealed',
  MINE: 'mine',
  EXPLODED: 'exploded',
  WRONG_FLAG: 'wrong-flag',
});

// Writes cell c's neighbours into `buf` in the graph's order and returns their count. One
// module-level collector keeps the graph's callback site monomorphic across games.
let fillBuf = null, fillLen = 0;
function collect(x) { fillBuf[fillLen++] = x; }
function fillNeighbours(graph, c, buf) {
  fillBuf = buf; fillLen = 0;
  graph.forEachNeighbour(c, collect);
  return fillLen;
}

const KIND_NAMES = ['reveal', 'flag', 'chord']; // also the click kinds of js/engine/metrics.js
const K_REVEAL = 0, K_FLAG = 1, K_CHORD = 2;

function checkGraph(graph) {
  if (!graph || !Number.isInteger(graph.count)) throw new RangeError('a cell graph is required');
}

// The most mines a board allows: every cell but the guaranteed-safe first-click cell.
function checkMineCount(count, mines) {
  if (!Number.isInteger(mines) || mines < 0 || mines > count - 1) {
    throw new RangeError(`mine count must be an integer from 0 to ${count - 1} on a ${count}-cell board`);
  }
}

// Validates a mine set against the board; returns it as an Int32Array.
function checkMineSet(count, mines) {
  if (mines == null || typeof mines[Symbol.iterator] !== 'function') throw new RangeError('a mine set is required');
  const list = Int32Array.from(mines, (m) => {
    if (!Number.isInteger(m) || m < 0 || m >= count) throw new RangeError(`mine index ${m} is out of range`);
    return m;
  });
  checkMineCount(count, list.length);
  const seen = new Uint8Array(count);
  for (const m of list) {
    if (seen[m]) throw new RangeError(`mine index ${m} is repeated`);
    seen[m] = 1;
  }
  return list;
}

// Board dimensions for the summary: a plain object of positive integers (e.g. { width, height });
// by default the cell count. Returned frozen.
function checkDimensions(graph, dimensions) {
  if (dimensions === undefined) return Object.freeze({ cells: graph.count });
  if (dimensions === null || typeof dimensions !== 'object' || Array.isArray(dimensions)
    || Object.keys(dimensions).length === 0) {
    throw new RangeError('board dimensions must be an object of positive integers');
  }
  const out = {};
  for (const [k, v] of Object.entries(dimensions)) {
    if (!Number.isInteger(v) || v < 1) throw new RangeError(`board dimension ${k} must be a positive integer`);
    out[k] = v;
  }
  return Object.freeze(out);
}

function build(graph, profileId, version, mineCount, dimensions) {
  const profile = getRuleProfile(profileId, version);
  const n = graph.count;

  const mine = new Uint8Array(n);
  const number = new Uint8Array(n);
  const revealed = new Uint8Array(n);
  const flagged = new Uint8Array(n);
  const hidden = new Uint8Array(n);
  const mark = new Uint32Array(n); // per-action dedupe stamp for `changed`
  const queue = new Int32Array(n);
  const changedBuf = new Int32Array(n);
  const state = Object.freeze({ mine, number, revealed, flagged, hidden });

  const flagsNeighbours = profile.flagRevealedCell === 'neighbours';
  const stopAtFlag = profile.zeroFloodStopsAtFlag === true;
  const chordsRevealedZero = profile.revealOnRevealedZero === 'chord';
  const autoHide = profile.autoHide === true;
  // Flagged-neighbour count per cell, for the profiles that read it.
  const flagNb = stopAtFlag || chordsRevealedZero || autoHide ? new Uint8Array(n) : null;
  const hideMark = autoHide ? new Uint32Array(n) : null; // per-action dedupe stamp for hideQueue
  const hideQueue = autoHide ? new Int32Array(n) : null; // cells to check for hiding this action
  let hideLen = 0;

  // Two neighbour buffers for the hot loops: one walk resolves a cell's neighbours once instead of
  // once per slot. A loop over buffer A may call code that fills buffer B, never A.
  const nbA = new Int32Array(Math.max(1, graph.maxDegree));
  const nbB = new Int32Array(Math.max(1, graph.maxDegree));
  const fill = (c, buf) => fillNeighbours(graph, c, buf);

  let phase = PHASE.AWAITING_FIRST_CLICK;
  let flagCount = 0;
  let safeLeft = n - mineCount;
  let exploded = -1;
  let stamp = 0;
  let changedLen = 0;

  let metrics = null; // board metrics, once the mines are placed
  const clicks = createClickCounts();

  let actKinds = new Uint8Array(64);
  let actCells = new Int32Array(64);
  let actLen = 0;

  const checkCell = (c) => {
    if (!Number.isInteger(c) || c < 0 || c >= n) throw new RangeError(`cell index ${c} is out of range`);
  };

  function placeMines(list) {
    for (const m of list) mine[m] = 1;
    for (const m of list) {
      for (let k = 0, d = fill(m, nbA); k < d; k++) number[nbA[k]]++;
    }
    metrics = createBoardMetrics(graph, mine, number);
  }

  function record(kind, c) {
    if (actLen === actKinds.length) {
      const k2 = new Uint8Array(actLen * 2); k2.set(actKinds); actKinds = k2;
      const c2 = new Int32Array(actLen * 2); c2.set(actCells); actCells = c2;
    }
    actKinds[actLen] = kind;
    actCells[actLen] = c;
    actLen++;
  }

  function begin() {
    changedLen = 0;
    hideLen = 0;
    stamp++;
    if (stamp === 0xffffffff) { mark.fill(0); if (hideMark) hideMark.fill(0); stamp = 1; }
  }

  function touch(c) {
    if (mark[c] !== stamp) { mark[c] = stamp; changedBuf[changedLen++] = c; }
  }

  // Opens a closed, unflagged safe cell and flood-fills through zeros. Iterative.
  function open(c) {
    let head = 0, tail = 0;
    revealed[c] = 1; safeLeft--; touch(c); metrics.opened(c);
    queue[tail++] = c;
    while (head < tail) {
      const cur = queue[head++];
      if (number[cur] !== 0 || (stopAtFlag && flagNb[cur] !== 0)) continue;
      for (let k = 0, d = fill(cur, nbA); k < d; k++) {
        const nb = nbA[k];
        if (revealed[nb]) { if (autoHide) queueHide(nb); continue; }
        if (flagged[nb] || mine[nb]) continue;
        revealed[nb] = 1; safeLeft--; touch(nb); metrics.opened(nb);
        queue[tail++] = nb;
      }
    }
  }

  // Flags (on = 1) or unflags (on = 0) a closed cell. Unflagging shows its hidden neighbours.
  function setFlag(c, on) {
    flagged[c] = on;
    flagCount += on ? 1 : -1;
    touch(c);
    if (!flagNb) return;
    for (let k = 0, d = fill(c, nbB); k < d; k++) {
      const nb = nbB[k];
      if (on) { flagNb[nb]++; continue; }
      flagNb[nb]--;
      if (hidden[nb]) { hidden[nb] = 0; touch(nb); }
    }
  }

  // Queues `c` for a hide check, at most once per action.
  function queueHide(c) {
    if (hideMark[c] !== stamp) { hideMark[c] = stamp; hideQueue[hideLen++] = c; }
  }

  // Hides `c` when it is revealed, unflagged, its flag count equals its number and it is a zero or
  // every neighbour is revealed or flagged.
  function tryHide(c) {
    if (!revealed[c] || flagged[c] || hidden[c] || flagNb[c] !== number[c]) return;
    if (number[c] !== 0) {
      for (let k = 0, d = fill(c, nbB); k < d; k++) {
        const nb = nbB[k];
        if (!revealed[nb] && !flagged[nb]) return;
      }
    }
    hidden[c] = 1;
    touch(c);
  }

  // Auto-hide after an action: only a changed cell or its neighbour can newly qualify, and a cell
  // that hides changes no other cell's condition, so one pass over them is the fixed point. After
  // an opening action the flood already queued the revealed neighbours of every zero it spread
  // from, so only the other opened cells have their neighbours walked here.
  function hidePass(opening) {
    const len = changedLen;
    for (let t = 0; t < len; t++) {
      const c = changedBuf[t];
      queueHide(c);
      if (opening && number[c] === 0 && flagNb[c] === 0) continue;
      for (let k = 0, d = fill(c, nbA); k < d; k++) queueHide(nbA[k]);
    }
    for (let t = 0; t < hideLen; t++) tryHide(hideQueue[t]);
  }

  // The loss view: the exploded mine, every unflagged mine, every wrong flag change look; every
  // hidden cell is shown again.
  function lose(c) {
    exploded = c;
    phase = PHASE.LOST;
    touch(c);
    for (let i = 0; i < n; i++) {
      if (mine[i] ? !flagged[i] : flagged[i]) touch(i);
      if (hidden[i]) { hidden[i] = 0; touch(i); }
    }
  }

  function result(ended, boardNeeded = -1) {
    return { changed: changedBuf.subarray(0, changedLen), ended, boardNeeded };
  }

  const nothing = () => { changedLen = 0; return result(false); };

  // Ends an action that did not lose: auto-hide, then the win check. `opening` is false for a flag
  // action, whose changed cells were not opened.
  function settle(opening = true) {
    if (autoHide && phase === PHASE.PLAYING) hidePass(opening);
    if (phase === PHASE.PLAYING && safeLeft === 0) phase = PHASE.WON;
    return result(phase !== PHASE.PLAYING);
  }

  // Opens every closed, unflagged neighbour of a revealed zero with no flagged neighbour.
  function openAround(c) {
    if (flagNb[c] !== 0) return;
    for (let k = 0, d = fill(c, nbB); k < d; k++) {
      const nb = nbB[k];
      if (!revealed[nb] && !flagged[nb]) open(nb);
    }
  }

  function applyReveal(c) {
    begin();
    record(K_REVEAL, c);
    if (chordsRevealedZero && revealed[c] && number[c] === 0) {
      openAround(c);
      clicks.add('reveal', changedLen === 0);
      return settle();
    }
    const wasted = revealed[c] || flagged[c];
    clicks.add('reveal', wasted);
    if (wasted) return result(false);
    if (mine[c]) { lose(c); return result(true); }
    open(c);
    return settle();
  }

  const game = {
    get profile() { return profile; },
    get rulesVersion() { return profile.version; },
    get graph() { return graph; },
    get phase() { return phase; },
    get mineCount() { return mineCount; },
    get flagCount() { return flagCount; },
    get minesLeft() { return mineCount - flagCount; },
    get explodedCell() { return exploded; },
    get state() { return state; },

    reveal(c) {
      checkCell(c);
      if (phase === PHASE.AWAITING_FIRST_CLICK) { changedLen = 0; return result(false, c); }
      if (phase !== PHASE.PLAYING) return nothing();
      return applyReveal(c);
    },

    supplyBoard(c, mines) {
      checkCell(c);
      if (phase !== PHASE.AWAITING_FIRST_CLICK) throw new Error('a board is only supplied while awaiting the first click');
      const list = checkMineSet(n, mines);
      if (list.length !== mineCount) throw new RangeError(`the board has ${list.length} mines, the game ${mineCount}`);
      if (list.includes(c)) throw new RangeError(`the board has a mine on the first-click cell ${c}`);
      placeMines(list);
      phase = PHASE.PLAYING;
      return applyReveal(c);
    },

    toggleFlag(c) {
      checkCell(c);
      if (phase !== PHASE.PLAYING) return nothing();
      if (revealed[c] && !flagsNeighbours) return nothing();
      begin();
      record(K_FLAG, c);
      if (revealed[c]) {
        // One flag click: flag every closed, unflagged neighbour, or unflag them all.
        let flaggedAny = false;
        const d = graph.degree(c);
        for (let k = 0; k < d; k++) {
          const nb = graph.neighbour(c, k);
          if (!revealed[nb] && !flagged[nb]) { setFlag(nb, 1); flaggedAny = true; }
        }
        if (!flaggedAny) {
          for (let k = 0; k < d; k++) {
            const nb = graph.neighbour(c, k);
            if (!revealed[nb]) setFlag(nb, 0);
          }
        }
        clicks.add('flag', !flaggedAny);
        return settle(false);
      }
      clicks.add('flag', flagged[c] === 1);
      setFlag(c, flagged[c] ^ 1);
      return settle(false);
    },

    chord(c) {
      checkCell(c);
      if (phase !== PHASE.PLAYING) return nothing();
      begin();
      record(K_CHORD, c);
      if (!revealed[c]) { clicks.add('chord', true); return result(false); }
      const d = graph.degree(c);
      let flags = 0;
      for (let k = 0; k < d; k++) flags += flagged[graph.neighbour(c, k)];
      if (flags !== number[c]) { clicks.add('chord', true); return result(false); }
      let hit = -1;
      for (let k = 0; k < d; k++) {
        const nb = graph.neighbour(c, k);
        if (revealed[nb] || flagged[nb]) continue;
        if (mine[nb]) { if (hit < 0) hit = nb; continue; }
        open(nb);
      }
      clicks.add('chord', changedLen === 0 && hit < 0);
      if (hit >= 0) { lose(hit); return result(true); }
      return settle();
    },

    cellState(c) {
      checkCell(c);
      if (revealed[c]) return CELL.REVEALED;
      if (phase === PHASE.LOST) {
        if (c === exploded) return CELL.EXPLODED;
        if (mine[c] && !flagged[c]) return CELL.MINE;
        if (flagged[c] && !mine[c]) return CELL.WRONG_FLAG;
      }
      return flagged[c] ? CELL.FLAGGED : CELL.CLOSED;
    },

    // The number on a revealed cell; -1 on any cell not revealed.
    cellNumber(c) {
      checkCell(c);
      return revealed[c] ? number[c] : -1;
    },

    // The counts so far: { bbbv (null until the mines are placed), bbbvSolved, clicks }, where
    // clicks is { reveal, flag, chord }, each { effective, wasted }.
    counts() {
      return Object.freeze({
        bbbv: metrics ? metrics.bbbv : null,
        bbbvSolved: metrics ? metrics.solved : 0,
        clicks: clicks.snapshot(),
      });
    },

    // The game summary at a win or a loss; null while the game has not ended.
    summary() {
      if (phase !== PHASE.WON && phase !== PHASE.LOST) return null;
      return Object.freeze({
        outcome: phase === PHASE.WON ? 'won' : 'lost',
        dimensions,
        mineCount,
        bbbv: metrics.bbbv,
        bbbvSolved: metrics.solved,
        clicks: clicks.snapshot(),
      });
    },

    // The applied actions in order: [{ kind: 'reveal' | 'flag' | 'chord', cell }].
    actions() {
      const out = new Array(actLen);
      for (let i = 0; i < actLen; i++) out[i] = { kind: KIND_NAMES[actKinds[i]], cell: actCells[i] };
      return out;
    },
  };

  return { game: Object.freeze(game), placeMines, start: () => { phase = PHASE.PLAYING; } };
}

// A game awaiting its first click: { graph, profile, version?, mineCount, dimensions? }.
export function createGame({ graph, profile, version, mineCount, dimensions } = {}) {
  checkGraph(graph);
  checkMineCount(graph.count, mineCount);
  return build(graph, profile, version, mineCount, checkDimensions(graph, dimensions)).game;
}

// A game playing a full mine set from the start: { graph, profile, version?, mines, dimensions? }.
export function createGameWithMines({ graph, profile, version, mines, dimensions } = {}) {
  checkGraph(graph);
  const list = checkMineSet(graph.count, mines);
  const g = build(graph, profile, version, list.length, checkDimensions(graph, dimensions));
  g.placeMines(list);
  g.start();
  return g.game;
}
