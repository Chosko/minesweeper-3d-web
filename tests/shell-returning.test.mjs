// The returning player's surface: the board's bests on both board choices, over a records model built
// here, and the board choice panel's pin kept in its own document; that the main menu keeps no Play
// again and no session strip and the board options no detail line. In a browser, the bests are the board choices' tests'
// (tests/classic2d-mode.test.mjs, tests/mode3d-board-choice.test.mjs), the menu opening on the last mode
// and its board choice on the last board tests/classic2d-mode.test.mjs's first.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBoardIdentity } from '../js/records/board.js';
import { buildSummary } from '../js/records/summary.js';
import { createRecordsModel } from '../js/records/model.js';
import { createStorage } from '../js/platform/storage.js';
import { createMemoryBackend } from '../js/platform/memory-backend.js';
import * as RETURNING from '../js/shell/returning.js';

const { boardBests, NO_BEST, BOARD_PANEL_DOC, BOARD_PANEL_VERSION, createBoardPanelPin } = RETURNING;

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const square = (width, height, mines, noGuess = false) => createBoardIdentity({ mode: 'classic-2d', grid: 'square', width, height, mines, noGuess });
const box = (width, height, depth, mines, noGuess = false) => createBoardIdentity({ mode: '3d', width, height, depth, mines, noGuess });
const EXPERT = square(30, 16, 99);
const EXPERT_NG = square(30, 16, 99, true);
const CUBE_INT = box(8, 8, 8, 40);
const CUBE_INT_NG = box(8, 8, 8, 40, true);

let nextId = 1;
/** A summary through the real builder, ended at `endedAt` (a Date). */
function game({ board = EXPERT, outcome = 'won', ms = 13343, endedAt = new Date(2026, 9, 12, 12, 0) } = {}) {
  const engine = { bbbv: 20, bbbvSolved: outcome === 'won' ? 20 : 15, clicks: { reveal: { effective: 20, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } } };
  if (outcome !== 'abandoned') engine.outcome = outcome;
  return buildSummary({ engine, elapsedMs: ms, board, seed: 7, generatorVersion: 1, endedAt, id: `g-${nextId++}` });
}
function model(games) {
  const m = createRecordsModel();
  for (const g of games) m.record(game(g));
  return m;
}

// ---------------------------------------------------------------- the board's bests

test('the board\'s bests: time, 3BV/s and efficiency in the results formats, each with its date, or a dash and no best yet', () => {
  assert.equal(NO_BEST, 'no best yet');
  const none = [['time', 'Time', '—', 'no best yet'], ['bbbvPerSecond', '3BV/s', '—', 'no best yet'], ['efficiency', 'Efficiency', '—', 'no best yet']];
  const rows = (b) => b.map(({ stat, label, value, note }) => [stat, label, value, note]);
  assert.deepEqual(rows(boardBests(EXPERT, model([]))), none);
  assert.deepEqual(rows(boardBests(EXPERT, model([{ board: EXPERT, outcome: 'lost' }]))), none, 'a lost game sets no best');
  const m = model([
    { board: EXPERT, ms: 50000, endedAt: new Date(2026, 9, 2, 12) },
    { board: EXPERT, ms: 40000, endedAt: new Date(2026, 9, 9, 12) },
  ]);
  assert.deepEqual(rows(boardBests(EXPERT, m)), [
    ['time', 'Time', '40.000 s', '9 Oct 2026'], ['bbbvPerSecond', '3BV/s', '0.50', '9 Oct 2026'], ['efficiency', 'Efficiency', '100.0%', '2 Oct 2026'],
  ], 'each best with the date it was set');
  assert.deepEqual(rows(boardBests(EXPERT_NG, m)), none, 'the no-guess twin is another board');
  const cube = model([{ board: CUBE_INT_NG, ms: 71902, endedAt: new Date(2026, 9, 11, 12) }]);
  assert.deepEqual(rows(boardBests(CUBE_INT_NG, cube)).map((r) => r.slice(2)), [['71.902 s', '11 Oct 2026'], ['0.28', '11 Oct 2026'], ['100.0%', '11 Oct 2026']], 'a 3D board alike');
  assert.deepEqual(rows(boardBests(CUBE_INT, cube)), none);
});

// ---------------------------------------------------------------- the board choice panel's pin

const doc = (version, data) => JSON.stringify({ version, data });
function pinSetup({ initial = {}, available = true, failWrites = false } = {}) {
  const backend = createMemoryBackend({ initial, available });
  if (failWrites) backend.write = async () => { throw new Error('refused'); };
  const storage = createStorage({ backend });
  return { backend, storage, pin: createBoardPanelPin({ storage }) };
}

test('the panel\'s pin is the shell.boardPanel document at version 1, registered by the pin', () => {
  assert.equal(BOARD_PANEL_DOC, 'shell.boardPanel');
  assert.equal(BOARD_PANEL_VERSION, 1);
  const { storage } = pinSetup();
  assert.throws(() => storage.register(BOARD_PANEL_DOC, 1), /already|registered/i, 'registered once, by the pin');
});

test('the panel is unpinned while nothing is stored; a stored pin loads, every change is saved and kept after a reload', async () => {
  const fresh = pinSetup();
  assert.equal(fresh.pin.pinned, false);
  assert.equal(await fresh.pin.load(), false);
  const { pin, backend } = pinSetup({ initial: { [BOARD_PANEL_DOC]: doc(1, { pinned: true }) } });
  assert.equal(await pin.load(), true);
  assert.equal(pin.pinned, true);
  const saving = pin.setPinned(false);
  assert.equal(pin.pinned, false, 'the pin follows at once, before the save settles');
  await saving;
  assert.deepEqual(JSON.parse(backend.documents.get(BOARD_PANEL_DOC)), { version: 1, data: { pinned: false } });
  await pin.setPinned(true);
  const again = pinSetup({ initial: Object.fromEntries(backend.documents) });
  assert.equal(await again.pin.load(), true, 'kept across sessions');
});

test('a malformed or newer pin document reads as unpinned; a failed save keeps the pin for the session', async () => {
  for (const text of [doc(1, { pinned: 'yes' }), doc(1, null), doc(1, [true]), 'not json', doc(2, { pinned: true })]) {
    const { pin } = pinSetup({ initial: { [BOARD_PANEL_DOC]: text } });
    assert.equal(await pin.load(), false, text);
  }
  for (const opts of [{ failWrites: true }, { available: false }]) {
    const { pin } = pinSetup(opts);
    await pin.load();
    await pin.setPinned(true);
    assert.equal(pin.pinned, true);
  }
});

test('one pin, loaded before the first screen, is handed to both board choices', () => {
  const main = read('js/main.js');
  assert.match(main, /const BOARD_PANEL = createBoardPanelPin\(\{ storage \}\);/);
  assert.equal(main.match(/\n  pin: BOARD_PANEL,\n\}\);/g)?.length, 2, 'the 2D and the 3D board choice');
  assert.match(main, /await Promise\.all\(\[[^\]]*BOARD_PANEL\.load\(\)\.catch\(\(\) => \{\}\)[^\]]*\]\);\nshowMainMenu\(\);/);
});

// ---------------------------------------------------------------- no Play again, no session strip

test('the main menu keeps no Play again and no session strip, nor a board option a detail line: returning.js has the bests and the pin alone', () => {
  assert.deepEqual(Object.keys(RETURNING).sort(), ['BOARD_PANEL_DOC', 'BOARD_PANEL_VERSION', 'NO_BEST', 'boardBests', 'createBoardPanelPin']);
  const index = read('index.html');
  const menu = index.slice(index.indexOf('<section id="menu"'), index.indexOf('<!-- 3D board choice -->'));
  assert.doesNotMatch(menu, /menu-again|menu-strip|Play again/);
  const main = read('js/main.js');
  assert.doesNotMatch(main, /playAgainFromMenu|showReturning|returningMenu|lastBoard\(|onMenuPlayAgain/);
  assert.doesNotMatch(read('js/ui.js'), /setReturning|menu-again|menu-strip|onMenuPlayAgain/);
});

test('the helpers are DOM-free and read the records only through the queries they are handed', () => {
  const src = strip(read('js/shell/returning.js'));
  assert.doesNotMatch(src, /\b(document|window|localStorage)\b/);
  assert.doesNotMatch(src, /records\/store\.js|createRecordsStore/);
  assert.match(src, /import \{[^}]*\bformatTime\b[^}]*\} from '\.\.\/results\/view\.js'/, 'the results time format');
  for (const binder of ['js/mode3d/board-choice.js', 'js/classic2d/board-choice.js']) {
    assert.doesNotMatch(strip(read(binder)), /records\/|returning\.js/, `${binder} receives its bests as text, never the store`);
  }
});

// ---------------------------------------------------------------- the shell's markup and wiring

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const MENU = INDEX.slice(INDEX.indexOf('<section id="menu"'), INDEX.indexOf('<!-- 3D board choice -->'));

test('each no-guess switch says once that no-guess boards keep separate records', () => {
  const sections = [
    INDEX.slice(INDEX.indexOf('<section id="c2d-choice"'), INDEX.indexOf('<!-- Classic 2D board -->')),
    INDEX.slice(INDEX.indexOf('<section id="board-choice"'), INDEX.indexOf('<!-- Coming soon -->')),
  ];
  let switches = 0;
  for (const html of sections) {
    for (const m of html.matchAll(/<div class="ui-switchrow"><span class="ui-switchrow__text"><label class="ui-switchrow__label" for="([\w-]+)">([^<]+)<\/label>(<span class="ui-switchrow__help" id="[\w-]+-help">([^<]+)<\/span>)?<\/span><input type="checkbox" role="switch" id="\1"[^>]*data-noguess[^>]*><\/div>/g)) {
      switches++;
      const [, id, raw, , help] = m;
      const label = raw.replace(/&middot;/g, '·');
      const said = [label, help ?? ''].join(' ').match(/separate records/gi)?.length ?? 0;
      assert.equal(said, 1, `#${id} says it once`);
      assert.equal(label, 'No-guess', `#${id}: its label names it, its helper line says the rest`);
    }
  }
  assert.equal(switches, 3, 'the 2D switch and both 3D switches');
});

test('the shell hands both board choices their bests, redrawn on the records\' change notification, and no detail lines', () => {
  const table = MAIN.slice(MAIN.indexOf('const SHELL = createRouter('), MAIN.indexOf('// end of screen table'));
  assert.match(table, /'board-choice': \{[^\n]*showChoice3D\(/);
  assert.match(table, /'classic-2d-choice': \{[^\n]*showChoice2D\(/);
  assert.doesNotMatch(MAIN, /presetDetails|CHOICE_ITEMS|details: /, 'no detail lines on the options');
  assert.match(MAIN, /bests: \(identity\) => boardBests\(identity, RECORDS\)/, 'read through the store\'s queries');
  assert.match(MAIN, /bests: \(board\) => boardBests\(identity3D\(board\), RECORDS\)/);
  assert.match(MAIN, /RECORDS\.onChange\(\(\) => \{ CHOICE_2D\.refresh\(\); CHOICE_3D\.refresh\(\); \}\)/, 'and its change notification');
});

test('the catalogue documents both board choices\' bests, and no Play again or session strip on the main menu', () => {
  const head = read('css/components.css').match(/^\/\*([\s\S]*?)\*\//)[1];
  const menu = head.slice(head.indexOf('Main menu (index.html #menu)'), head.indexOf('3D board choice (index.html #board-choice)'));
  assert.doesNotMatch(menu, /Play again|session strip/);
  assert.match(head, /Classic 2D board choice \(index\.html #c2d-choice\)[\s\S]*?bests[\s\S]*?Default focus/);
  const three = head.slice(head.indexOf('3D board choice (index.html #board-choice)'));
  assert.doesNotMatch(three.slice(0, three.indexOf('Default focus')), /detail line|typical 3BV|streak/, 'no detail line on a 3D option');
});
