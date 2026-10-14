// Learn 3D (js/mode3d/learn.js): the guided board constant — the board generate() gives for its
// seed, the conditions its first reveal meets, the solver clearing it — the prompt sequence and its
// texts from the bindings source, the shell's wiring, and one Playwright run of the whole lesson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEARN_BOARD, LEARN_TITLE, LEARN_PROMPTS, LEARN_HINTS, lessonCells, learnChoice, createLearnPrompts,
} from '../js/mode3d/learn.js';
import { create3DGame } from '../js/mode3d/session.js';
import { generate, boardGraph } from '../js/generation/generate.js';
import { solve } from '../js/generation/solver.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { startCell } from '../js/generation/start-cell.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { PRESETS, startSpacing } from '../js/mode3d/board-choice.js';
import { hintText } from '../js/settings/bindings.js';
import { GLYPHS } from '../js/gamepad.js';
import { pauseLine } from '../js/ui.js';
import { findLearnBoard } from '../dev/find-learn-3d.mjs';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const suite = browserSuite();
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');

const MAIN = read('js/main.js');
const INDEX = read('index.html');
const B = LEARN_BOARD;
const BOX1 = PRESETS.find((p) => p.id === 'box-1');
const graphOf = () => ({ kind: 'box', X: B.X, Y: B.Y, Z: B.Z });

// ---------------------------------------------------------------- the guided board

test('the guided board is a frozen 4 × 4 × 3 box at First box 1\'s mine count, its start cell the marked centre cell', () => {
  assert.ok(Object.isFrozen(B) && Object.isFrozen(B.minePositions));
  assert.deepEqual([B.X, B.Y, B.Z], [4, 4, 3]);
  assert.deepEqual([BOX1.X, BOX1.Y, BOX1.Z, BOX1.mines], [B.X, B.Y, B.Z, B.mines], 'First box 1\'s size and count');
  assert.equal(B.minePositions.length, B.mines);
  assert.equal(B.startCell, startCell(graphOf()));
  assert.deepEqual(createBoxGrid(B.X, B.Y, B.Z).coords(B.startCell), [2, 2, 1], 'floor(X / 2), floor(Y / 2), floor(Z / 2)');
  assert.equal(startSpacing(B), 1.5, 'First box 1\'s start spacing');
  assert.equal(LEARN_TITLE, 'Learn 3D');
});

test('the guided board is what generate() gives for its seed, start cell, count and no-guess, at the recorded generator version', () => {
  if (GENERATOR_VERSION !== B.generatorVersion) return; // a later generator changes no lesson: the positions are committed
  const r = generate({ graph: graphOf(), mineCount: B.mines, firstClick: B.startCell, noGuess: true, seed: B.seed });
  assert.equal(r.ok, true);
  assert.deepEqual(Array.from(r.mines), [...B.minePositions]);
});

test('the first reveal on the start cell meets every board condition, and the solver clears the board from it', () => {
  const game = create3DGame({ X: B.X, Y: B.Y, Z: B.Z, minePositions: [...B.minePositions] });
  game.reveal(B.startCell);
  const v = game.view;
  assert.equal(v.state, 'playing', 'the first reveal does not win');
  assert.ok(v.unlinked.some(Boolean), 'auto-hide hid at least one cube');
  assert.deepEqual(lessonCells(v, B.startCell), { proofNumber: B.proofNumber, lessonNumber: B.lessonNumber, lessonMine: B.lessonMine });
  const { graph } = createBoxGrid(B.X, B.Y, B.Z);
  const closed = (c) => Array.from(graph.neighbours(c)).filter((nb) => !v.pressed[nb]);
  assert.equal(v.number[B.proofNumber], 1);
  assert.deepEqual(closed(B.proofNumber), [B.lessonMine], 'P has one closed neighbour, M');
  assert.ok(B.minePositions.includes(B.lessonMine), 'so M is a mine');
  assert.notEqual(B.lessonNumber, B.proofNumber);
  assert.equal(v.number[B.lessonNumber], 1);
  const around = closed(B.lessonNumber);
  assert.ok(around.includes(B.lessonMine) && around.length >= 2, 'L has M and another closed cube');
  assert.ok(around.every((c) => c === B.lessonMine || !B.minePositions.includes(c)), 'the others safe');
  // a chord on L after M is flagged opens cubes
  game.toggleFlag(B.lessonMine);
  assert.ok(game.chord(B.lessonNumber).revealed > 0);
  const cleared = solve({ graph: boardGraph(graphOf()), mines: [...B.minePositions], firstClick: B.startCell });
  assert.equal(cleared.cleared, true, 'no guess needed');
});

test('the dev script finds the guided board: the first seed from 1 that qualifies at First box 1\'s count', () => {
  const found = findLearnBoard({ X: B.X, Y: B.Y, Z: B.Z, count: B.mines, maxSeed: B.seed });
  assert.deepEqual(found, {
    X: B.X, Y: B.Y, Z: B.Z, mines: B.mines, seed: B.seed, generatorVersion: B.generatorVersion, startCell: B.startCell,
    minePositions: [...B.minePositions], proofNumber: B.proofNumber, lessonNumber: B.lessonNumber, lessonMine: B.lessonMine,
  });
  assert.equal(findLearnBoard({ X: B.X, Y: B.Y, Z: B.Z, count: B.mines, maxSeed: B.seed - 1, maxCount: B.mines }), null, 'no earlier seed');
  assert.match(read('js/mode3d/learn.js'), new RegExp(`seed ${B.seed}[\\s\\S]*mines ${B.minePositions.join(', ')}`), 'the head comment names them');
});

test('learnChoice is a fixed board with the forced, marked start cell, never a no-guess request', () => {
  const c = learnChoice();
  assert.deepEqual(c, {
    X: 4, Y: 4, Z: 3, mines: B.mines, minePositions: [...B.minePositions], noGuess: false, learn: true,
    forced: { startCell: B.startCell, seed: B.seed, learn: true },
  });
  c.minePositions.push(0);
  assert.equal(B.minePositions.length, B.mines, 'a copy');
});

// ---------------------------------------------------------------- the prompt sequence

const L = B.lessonNumber, M = B.lessonMine;

test('the prompts start after the first reveal and show in order: Shift on L, Ctrl, the flag on M, the chord on L, then the rest', () => {
  assert.deepEqual(LEARN_PROMPTS, ['start', 'shift', 'ctrl', 'flag', 'chord', 'rest']);
  const p = createLearnPrompts(B);
  assert.equal(p.current, 'start');
  assert.equal(p.ctrl(), false, 'nothing before the first reveal');
  assert.equal(p.done('ctrl'), false);
  assert.equal(p.started(), true);
  assert.equal(p.current, 'shift');
  assert.equal(p.tinted, L, 'L carries the tint while prompt 1 shows');
  assert.equal(p.shift(L + 1), false, 'Shift on another cube');
  assert.equal(p.shift(L), true);
  assert.equal(p.current, 'ctrl');
  assert.equal(p.tinted, -1);
  assert.equal(p.ctrl(), true);
  assert.equal(p.current, 'flag');
  assert.equal(p.tinted, M, 'M carries the tint while prompt 3 shows');
  assert.equal(p.chorded(L, 0), false, 'a chord before the flag opens nothing and does not advance');
  assert.equal(p.flagged([M + 1 === L ? M + 2 : M + 1]), false, 'a wrong flag does not advance');
  assert.equal(p.current, 'flag');
  assert.equal(p.flagged([M]), true);
  assert.equal(p.current, 'chord');
  assert.equal(p.tinted, L);
  assert.equal(p.chorded(L + 1, 3), false, 'a chord elsewhere');
  assert.equal(p.chorded(L, 2), true);
  assert.equal(p.current, 'rest');
  assert.equal(p.tinted, -1);
});

test('a prompt done early is skipped when its turn comes', () => {
  const p = createLearnPrompts(B);
  p.started();
  assert.equal(p.ctrl(), false, 'done, but the line stays on prompt 1');
  assert.equal(p.flagged([M]), false);
  assert.ok(p.done('ctrl') && p.done('flag'));
  assert.equal(p.current, 'shift');
  assert.equal(p.shift(L), true);
  assert.equal(p.current, 'chord', 'Ctrl and the flag were done: skipped');
  assert.equal(p.shift(L), false, 'done once');
});

test('the prompt texts come from the bindings source, in the controller\'s names for a controller player', () => {
  assert.deepEqual(Object.keys(LEARN_HINTS), LEARN_PROMPTS);
  const say = (name, device, glyphs) => hintText(LEARN_HINTS[name], device, glyphs);
  assert.equal(say('start', 'keyboard'), 'Click the marked cube to start');
  assert.equal(say('shift', 'keyboard'), 'Hold Shift to see what this number counts');
  assert.equal(say('ctrl', 'keyboard'), 'Hold Ctrl to see the cubes you cleared');
  assert.equal(say('flag', 'keyboard'), 'Flag the one cube that must be a mine');
  assert.equal(say('chord', 'keyboard'), 'Press left and right together on the number to chord');
  assert.equal(say('rest', 'keyboard'), 'Clear the rest of the box');
  assert.equal(say('start', 'controller', GLYPHS.xbox), 'Press RT on the marked cube to start');
  assert.equal(say('shift', 'controller', GLYPHS.xbox), 'Hold LB to see what this number counts');
  assert.equal(say('ctrl', 'controller', GLYPHS.playstation), 'Hold △ to see the cubes you cleared');
  assert.equal(say('flag', 'controller', GLYPHS.xbox), 'Press LT on the one cube that must be a mine');
  assert.equal(say('chord', 'controller', GLYPHS.xbox), 'Press LT and RT together on the number to chord');
});

test('no timer: the overlay hides its time and the pause card shows mines left alone', () => {
  assert.equal(pauseLine(12.5, 3, { timed: false }), '3 mines left');
  assert.equal(pauseLine(12.5, 1, { timed: false }), '1 mine left');
  assert.match(read('js/ui.js'), /setTimed\(on\) \{[\s\S]*?timeStat\.classList\.toggle\('hidden', !this\._timed\)/);
  assert.match(MAIN, /ui\.setTimed\(!learn\)/);
});

test('the learn module is DOM-free and documents itself', () => {
  const src = code('js/mode3d/learn.js');
  assert.doesNotMatch(src, /document\.|window\.|localStorage/);
  assert.match(read('js/mode3d/learn.js'), /^\/\/ Learn 3D/);
});

// ---------------------------------------------------------------- the shell's wiring


test('index.html holds the Learn 3D entry first on the 3D board choice, the ready card\'s line and the Learn 3D end card', () => {
  const board = INDEX.slice(INDEX.indexOf('<section id="board-choice"'), INDEX.indexOf('<!-- Coming soon -->'));
  const learn = board.indexOf('data-learn');
  assert.ok(learn > 0 && learn < board.indexOf('id="bc-box"'), 'above the First box group');
  assert.match(board, /data-learn[^>]*>[\s\S]*?Learn 3D[\s\S]*?A guided 4 &times; 4 &times; 3 box &middot; no timer, no records/);
  const ready = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<!-- Controls modal'));
  assert.match(ready, /id="ready-learn"[^>]*hidden[\s\S]*New to 3D\? Learn 3D walks you through a small box\.[\s\S]*id="ready-learn-btn"[^>]*>Learn 3D</);
  assert.ok(ready.indexOf('id="ready-learn"') > ready.indexOf('</button>'), 'outside the card\'s own button');
  assert.match(INDEX, /<section id="learn-end" class="overlay hidden"[\s\S]*?id="learn-end-title"[\s\S]*?id="learn-end-primary"[\s\S]*?id="learn-end-back"[^>]*>Back to board choice</);
});

test('js/main.js starts the guided board from the entry, the ready card and Try again, with none of the records\' hand-offs', () => {
  assert.match(MAIN, /LAYER_SCREEN = \{[^}]*'learn-end': 'learn-end'/, 'the controller and the arrow keys reach the end card');
  assert.match(MAIN, /CONTAINED = new Set\(\[[^\]]*'learn-end'/, 'Tab stays inside it');
  assert.match(MAIN, /onLearn: \(\) => startLearn\(/);
  assert.match(MAIN, /function startLearn\([^)]*\) \{[\s\S]*?MODES\.start\('3d', learnChoice\(\)\)/);
  assert.doesNotMatch(MAIN.slice(MAIN.indexOf('function startLearn'), MAIN.indexOf('function startLearn') + 600), /LAST_CHOICE_3D\.save/, 'never the last choice');
  assert.match(MAIN, /'learn-end': \{/);
  assert.match(MAIN, /unrecorded: \(\) => /, 'the pause controller asks nothing on the guided game');
  assert.match(MAIN, /window\.__ms = \{[\s\S]*learn\(\)/, 'the debug hook starts it');
});

// ---------------------------------------------------------------- browser

test('in a browser, Learn 3D: the entry, the marked cube, the four prompts, the cleared box, the win card, and the records untouched', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const shown = (id) => ms((i) => { const el = document.getElementById(i); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
    const strip = () => ms(() => document.getElementById('hint-strip-text').textContent);
    // Aim at a cell from just above it along +k: the cube above is glass (the fly-through skip).
    const aim = (c) => ms((cell) => {
      const m = globalThis.__ms, [x, y, z] = m.cellCenter(cell);
      m.moveTo(x, y, z + 7.5);
      return m.aimAt(cell);
    }, c);
    const docs = () => ms(() => Object.fromEntries(Object.keys(localStorage).filter((k) => /records|replays|lastChoice/.test(k)).map((k) => [k, localStorage.getItem(k)])));
    const before = await docs();

    await page.evaluate(() => document.querySelector('[data-entry="3d"]')?.click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'board-choice');
    const first = await ms(() => document.querySelector('#board-choice .ui-menu__item').hasAttribute('data-learn'));
    assert.ok(first, 'Learn 3D leads the board choice');
    await ms(() => document.querySelector('#board-choice [data-learn]').click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    assert.equal(await shown('ready-learn'), false, 'no Learn 3D line on its own ready card');
    assert.equal(await shown('ready-rules'), false, 'the "How 3D works" block does not show');
    assert.equal(await ms(() => document.getElementById('hud-size').textContent), 'Learn 3D');
    assert.equal(await shown('hud-time'), false, 'no timer');
    await ms(() => globalThis.__ms.forcePlay());
    const L = await ms(() => globalThis.__ms.learnBoard.lessonNumber);
    const M = await ms(() => globalThis.__ms.learnBoard.lessonMine);
    const start = await ms(() => globalThis.__ms.learnBoard.startCell);
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), start, 'the start cell is marked');
    assert.equal(await strip(), 'Click the marked cube to start');

    // A reveal off the start cell changes nothing and hints.
    await aim(start === 0 ? 1 : 0);
    await ms(() => globalThis.__ms.click('left'));
    assert.equal(await ms(() => globalThis.__ms.state.started), false);
    assert.match(await ms(() => document.getElementById('toast').textContent), /^Start on the marked/);

    assert.equal(await aim(start), start, 'the marked cube is aimed');
    await ms(() => globalThis.__ms.click('left'));
    await page.waitForFunction(() => globalThis.__ms.state.started);
    assert.equal(await strip(), 'Hold Shift to see what this number counts');
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), L, 'L carries the tint');
    assert.equal(await ms(() => document.getElementById('toast').classList.contains('on') && /Solved cubes hide/.test(document.getElementById('toast').textContent)), false, 'no auto-hide toast');

    assert.equal(await aim(L), L);
    await ms(() => globalThis.__ms.key('ShiftLeft', true));
    await page.waitForFunction(() => document.getElementById('hint-strip-text').textContent.startsWith('Hold Ctrl'));
    await ms(() => { globalThis.__ms.key('ShiftLeft', false); globalThis.__ms.key('ControlLeft', true); });
    await page.waitForFunction(() => document.getElementById('hint-strip-text').textContent === 'Flag the one cube that must be a mine');
    await ms(() => globalThis.__ms.key('ControlLeft', false));
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), M, 'M carries the tint');
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.firstUse'))?.data?.autoHideToast), true, 'prompt 2 marks the toast shown');
    assert.equal(await aim(M), M);
    await ms(() => globalThis.__ms.click('right'));
    assert.equal(await strip(), 'Press left and right together on the number to chord');
    assert.equal(await aim(L), L);
    await ms(() => globalThis.__ms.click('chord'));
    assert.equal(await strip(), 'Clear the rest of the box');

    // Clear the rest of the box.
    await ms((mines) => {
      const g = globalThis.__ms.game;
      for (let c = 0; c < g.n; c++) if (!mines.includes(c) && !g.pressed[c]) globalThis.__ms.state.play.reveal(c);
    }, await ms(() => [...globalThis.__ms.learnBoard.minePositions]));
    await page.waitForFunction(() => globalThis.__ms.game.state === 'won');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'learn-end', null, { timeout: patience(10000) });
    assert.equal(await ms(() => document.getElementById('learn-end-title').textContent), 'You\'ve got the basics of 3D.');
    assert.equal(await ms(() => document.getElementById('learn-end-primary').textContent), 'Play First box 1');
    assert.equal(await ms(() => document.getElementById('learn-end').textContent.includes('Time')), false, 'no time on the card');
    await page.waitForFunction(() => document.activeElement?.id === 'learn-end-primary', null, { timeout: patience(5000) });
    await page.keyboard.press('ArrowRight');
    assert.equal(await ms(() => document.activeElement?.id), 'learn-end-back', 'the arrow keys walk the card');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await ms(() => document.activeElement?.id), 'learn-end-primary');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.firstUse'))?.data?.finished3D === true,
      null, { timeout: patience(5000) });
    assert.deepEqual(await docs(), before, 'the records, the replays and the last choice are unchanged');
    assert.equal(await ms(() => JSON.parse(localStorage.getItem('ms3d:doc:shell.firstUse')).data.games['3d']), 0, 'counted toward no window');

    // Back goes to the board choice, with "Last played" untouched.
    await ms(() => document.getElementById('learn-end-back').click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'board-choice');
    assert.equal(await ms(() => document.querySelector('#board-choice [data-learn]').hasAttribute('data-last')), false);
    assert.deepEqual(errors, []);
    assert.equal(await mode(), 'board-choice');
  } finally {
    await browser.close();
  }
});
