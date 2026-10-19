// The main menu's preview of the selected entry (js/shell/menu.js menuPreview gives what it shows):
// a board drawn by the Classic 2D board view — the Intermediate demo board, or today's daily Expert
// board closed with its marked start cell — the 3D scene drawn live into the panel by the renderer,
// the panel's static background, or a card with the entry's badge, its name and a note.
//
// demoBoard2D()       → { grid, game }: an Intermediate board (STANDARD_SIZES) with a fixed mine set,
//                       an opening revealed and a few flags placed — a real engine game, the same on
//                       every load.
// dailyBoard2D(daily) → { grid, game, mark }: `daily` the shell's dailyPreview(now) (js/shell/daily.js);
//                       the closed board awaiting its first click, its start cell the mark.
// bindMenuPreview({ panel, stage, tag, iconOf, mountBoard, boardOf }) → { show(preview), shown }:
//   panel, stage, tag    the ui-scene-panel, its stage and its tag;
//   iconOf(entry)        the entry's icon, an element the card's badge takes a copy of;
//   mountBoard({ container, grid }) → a mounted Classic 2D board view (js/classic2d/board-view.js
//                        mountBoardView), asked once per board kind, the first time it shows;
//   boardOf(kind)        → { key, grid, game, mark? } for 'board' and 'daily'; a board whose key
//                        changed (a new day) is handed to its view again.
//   show(preview)        shows `preview`: the panel is ui-scene-panel--live only for 'scene', the tag
//                        names the board (hidden for a card and for an empty tag); `shown` is the
//                        preview showing.
// The board views stay mounted, each in its own [data-preview] layer of the stage, hidden while
// another preview shows.

import { createSquareGrid } from '../engine/square-grid.js';
import { createGame, createGameWithMines } from '../engine/rules.js';
import { REFERENCE_PROFILE } from '../engine/profiles.js';
import { STANDARD_SIZES } from '../classic2d/board-setup.js';

/** A small deterministic generator: the demo board is the same on every load. */
function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export const DEMO_SEED = 20261016;

export function demoBoard2D() {
  const { width, height, mines: count } = STANDARD_SIZES.intermediate;
  const grid = createSquareGrid(width, height);
  const random = lcg(DEMO_SEED);
  const centre = grid.index(width >> 1, height >> 1);
  const clear = new Set([centre, ...grid.graph.neighbours(centre)]);
  const mines = new Set();
  while (mines.size < count) {
    const c = Math.floor(random() * width * height);
    if (!clear.has(c)) mines.add(c);
  }
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines: [...mines], dimensions: { width, height } });
  game.reveal(centre);
  let flags = 0;
  for (let c = 0; c < width * height && flags < 6; c++) {
    if (!mines.has(c) || game.cellState(c) !== 'closed') continue;
    if (grid.graph.neighbours(c).some((n) => game.cellState(n) === 'revealed')) { game.toggleFlag(c); flags++; }
  }
  return { grid, game };
}

export function dailyBoard2D(daily) {
  const { width, height, mines } = daily.board;
  const grid = createSquareGrid(width, height);
  const game = createGame({ graph: grid.graph, profile: REFERENCE_PROFILE, mineCount: mines, dimensions: { width, height } });
  return { grid, game, mark: daily.startCell };
}

export function bindMenuPreview({ panel, stage, tag, iconOf, mountBoard, boardOf }) {
  const doc = panel.ownerDocument;
  const layers = new Map(); // kind → { el, view, key }
  let shown = null;

  const layer = (kind) => {
    let l = layers.get(kind);
    if (!l) {
      const el = doc.createElement('div');
      el.dataset.preview = kind;
      stage.append(el);
      l = { el, view: null, key: null };
      layers.set(kind, l);
    }
    return l;
  };

  function showBoard(kind) {
    const l = layer(kind);
    const b = boardOf(kind);
    if (!l.view) l.view = mountBoard({ container: l.el, grid: b.grid });
    if (l.key !== b.key) {
      l.view.setGame(b.game);
      l.view.setMark(b.mark ?? -1);
      l.key = b.key;
    }
    l.el.hidden = false;
  }

  function showCard({ entry, label, note, locked }) {
    const l = layer('card');
    const card = doc.createElement('div');
    card.className = 'ui-scene-panel__card';
    const badge = doc.createElement('span');
    badge.className = 'ui-scene-panel__badge';
    badge.dataset.entry = entry;
    if (locked) badge.dataset.unavailable = '';
    badge.setAttribute('aria-hidden', 'true');
    const icon = iconOf(entry);
    if (icon) badge.append(icon.cloneNode(true));
    const name = doc.createElement('span');
    name.className = 'ui-scene-panel__name';
    name.textContent = label;
    card.append(badge, name);
    if (note) {
      const line = doc.createElement('span');
      line.className = 'ui-scene-panel__note';
      line.textContent = note;
      card.append(line);
    }
    l.el.replaceChildren(card);
    l.el.hidden = false;
  }

  return {
    get shown() { return shown; },
    show(preview) {
      shown = preview;
      for (const l of layers.values()) l.el.hidden = true;
      panel.classList.toggle('ui-scene-panel--live', preview.kind === 'scene');
      tag.textContent = preview.kind === 'badge' ? preview.label : (preview.tag ?? '');
      tag.classList.toggle('hidden', preview.kind === 'badge' || !preview.tag);
      if (preview.kind === 'board' || preview.kind === 'daily') showBoard(preview.kind);
      else if (preview.kind === 'badge') showCard(preview);
    },
  };
}
