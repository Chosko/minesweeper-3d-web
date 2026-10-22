// Learn 3D (js/mode3d/learn.js): the guided board constant — the board generate() gives for its
// seed, the conditions its first reveal meets, the solver clearing it — the prompt sequence and its
// texts from the bindings source, the shell's wiring, and one Playwright run of the whole lesson.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  LEARN_BOARD, LEARN_TITLE, LEARN_PROMPTS, LEARN_HINTS, lessonCells, learnChoice, createLearnPrompts, closedAround, learnStepOf,
} from '../js/mode3d/learn.js';
import { create3DGame } from '../js/mode3d/session.js';
import { generate, boardGraph } from '../js/generation/generate.js';
import { solve } from '../js/generation/solver.js';
import { GENERATOR_VERSION } from '../js/generation/placer.js';
import { startCell } from '../js/generation/start-cell.js';
import { createBoxGrid } from '../js/engine/box-grid.js';
import { PRESETS } from '../js/mode3d/board-choice.js';
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
const INTRO = PRESETS.find((p) => p.id === 'cube-intro');
const graphOf = () => ({ kind: 'box', X: B.X, Y: B.Y, Z: B.Z });

// ---------------------------------------------------------------- the guided board

test('the guided board is a frozen 4 × 4 × 3 box with its own mine count, its start cell the marked centre cell', () => {
  assert.ok(Object.isFrozen(B) && Object.isFrozen(B.minePositions));
  assert.deepEqual([B.X, B.Y, B.Z, B.mines], [4, 4, 3, 4]);
  assert.ok(!PRESETS.some((p) => p.X === B.X && p.Y === B.Y && p.Z === B.Z), 'a board outside the presets');
  assert.doesNotMatch(read('js/mode3d/learn.js'), /First box/, 'not described as a preset\'s');
  assert.equal(B.minePositions.length, B.mines);
  assert.equal(B.startCell, startCell(graphOf()));
  assert.deepEqual(createBoxGrid(B.X, B.Y, B.Z).coords(B.startCell), [2, 2, 1], 'floor(X / 2), floor(Y / 2), floor(Z / 2)');
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

test('the dev script finds the guided board: the first seed from 1 that qualifies at the lesson box\'s count', () => {
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

test('the chord step is skipped once L has no closed, unflagged neighbour: the line moves on to the rest', () => {
  const p = createLearnPrompts(B);
  p.started();
  p.shift(L);
  p.ctrl();
  assert.equal(p.chorded(L, 0), false, 'a chord before the flag, with L\'s neighbours still closed, does not advance');
  assert.equal(p.lessonClosed(2), false);
  p.flagged([M]);
  assert.equal(p.current, 'chord');
  assert.equal(p.lessonClosed(1), false, 'a closed neighbour left: the chord can still teach');
  assert.equal(p.current, 'chord');
  assert.equal(p.lessonClosed(0), true, 'every neighbour open or flagged');
  assert.equal(p.current, 'rest');
  assert.equal(p.tinted, -1, 'L loses the tint');
  assert.equal(p.lessonClosed(0), false, 'done once');
});

test('the chord step done that way before its turn is skipped when its turn comes; nothing before the first reveal', () => {
  const p = createLearnPrompts(B);
  assert.equal(p.lessonClosed(0), false, 'nothing before the first reveal');
  assert.equal(p.done('chord'), false);
  p.started();
  assert.equal(p.lessonClosed(0), false, 'done, but the line stays on prompt 1');
  assert.equal(p.done('chord'), true);
  assert.equal(p.current, 'shift');
  p.shift(L);
  p.ctrl();
  assert.equal(p.flagged([M]), true);
  assert.equal(p.current, 'rest', 'the chord step was done: skipped');
});

test('a chord on L that opens cubes still completes the step', () => {
  const p = createLearnPrompts(B);
  p.started();
  p.shift(L);
  p.ctrl();
  p.flagged([M]);
  assert.equal(p.lessonClosed(3), false);
  assert.equal(p.chorded(L, 3), true);
  assert.equal(p.current, 'rest');
});

test('closedAround counts a cell\'s neighbours neither open nor flagged', () => {
  const game = create3DGame({ X: B.X, Y: B.Y, Z: B.Z, minePositions: [...B.minePositions] });
  game.reveal(B.startCell);
  const v = game.view;
  const { graph } = createBoxGrid(B.X, B.Y, B.Z);
  const closed = Array.from(graph.neighbours(L)).filter((nb) => !v.pressed[nb] && !v.flagged[nb]);
  assert.ok(closed.length >= 2);
  assert.equal(closedAround(v, L), closed.length);
  game.toggleFlag(M);
  assert.equal(closedAround(v, L), closed.length - 1, 'a flag is not closed');
});

test('the stuck sequence on the guided board ends on the rest: flag M, then open L\'s other closed neighbours one by one', () => {
  const game = create3DGame({ X: B.X, Y: B.Y, Z: B.Z, minePositions: [...B.minePositions] });
  const p = createLearnPrompts(B);
  const v = game.view;
  const feed = () => p.lessonClosed(closedAround(v, L));
  game.reveal(B.startCell);
  p.started();
  feed();
  p.shift(L);
  p.ctrl();
  assert.equal(p.current, 'flag');
  game.toggleFlag(M);
  p.flagged([M]);
  feed();
  assert.equal(p.current, 'chord');
  const { graph } = createBoxGrid(B.X, B.Y, B.Z);
  const others = Array.from(graph.neighbours(L)).filter((nb) => !v.pressed[nb] && !v.flagged[nb]);
  assert.ok(others.length >= 1);
  for (const c of others) {
    if (v.pressed[c]) continue; // a cascade opened it already
    assert.equal(p.current, 'chord');
    game.reveal(c);
    feed();
  }
  assert.equal(v.state, 'playing', 'the box is not cleared yet');
  assert.equal(game.chord(L).revealed, 0, 'a chord on L can open nothing now');
  assert.equal(p.current, 'rest');
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

test('the four steps\' prompts carry their place in the lesson ("1 / 4"); the start and the rest carry none', () => {
  assert.deepEqual(LEARN_PROMPTS.map((p) => learnStepOf(LEARN_HINTS[p])), [null, '1 / 4', '2 / 4', '3 / 4', '4 / 4', null]);
  assert.equal(learnStepOf('modeHint'), null, 'no other hint');
  assert.match(INDEX, /<div id="hint-strip"[^>]*><span id="hint-strip-step" class="hint-step hidden"><\/span><span id="hint-strip-text"><\/span>/, 'the step sits before the prompt');
  const set = code('js/ui.js').slice(code('js/ui.js').indexOf('setHintStrip(on, {'), code('js/ui.js').indexOf('_showHint()'));
  assert.match(set, /const step = on && learn \? learnStepOf\(learn\) : null;/);
  assert.match(set, /this\.el\.hintStep\.textContent = step \?\? '';/);
  assert.match(set, /this\.el\.hintStep\.classList\.toggle\('hidden', !step\);/);
  // As J-Ready-states draws it: the prompt in its own strip, 9 × 20 px padding and 12 px apart, the step 13 px.
  assert.match(set, /this\.el\.hintStrip\.classList\.toggle\('hint-strip--learn', this\._hintKind === 'learn'\);/);
  const css = read('css/style.css');
  assert.match(css, /#hint-strip\.hint-strip--learn \{ padding: 9px 20px; gap: 12px; \}/);
  assert.match(css, /#hint-strip\.hint-strip--learn \.hint-step \{ font-size: 13px; \}/);
  assert.match(read('themes/joyful-tiles/theme.css'), /#hint-strip \.hint-step \{ font-family: var\(--font-family-mono\); \}/, 'the step in the mono face');
});

test('on a coarse-only device the prompts name the touch toolbar\'s buttons and the touch gestures', () => {
  const say = (name) => hintText(LEARN_HINTS[name], 'touch', GLYPHS.xbox);
  assert.equal(say('start'), 'Aim at the marked cube and tap to start');
  assert.equal(say('shift'), 'Tap the Shift button to see what this number counts');
  assert.equal(say('ctrl'), 'Tap the Ctrl button to see the cubes you cleared');
  assert.equal(say('flag'), 'Aim at the one cube that must be a mine and long-press to flag it');
  // The chord: a second finger on the look half while the first is still a pending tap (js/touch-3d.js).
  assert.equal(say('chord'), 'Aim at the number and tap two fingers together on the right half to chord');
  assert.equal(say('rest'), 'Clear the rest of the box');
  for (const name of LEARN_PROMPTS) {
    assert.doesNotMatch(say(name), /\b(Hold|Click|Press)\b|\b(Ctrl|Space|Shift)\b(?! button)/, `${name}: no key named (${say(name)})`);
  }
  // The strip draws the prompt for the device every help surface speaks for.
  assert.match(read('js/ui.js'), /if \(learn\) this\.el\.hintStripText\.textContent = this\.hint\(learn\);/);
});

test('Learn 3D\'s play layout: no timer, no figures panel — a head with the title and Pause over a strip of mines and Restart, top left', () => {
  assert.equal(pauseLine(12.5, 3, { timed: false }), '3 mines left');
  assert.equal(pauseLine(12.5, 1, { timed: false }), '1 mine left');
  const ui = code('js/ui.js');
  const set = ui.slice(ui.indexOf('setLearn(on) {'), ui.indexOf('updateHud('));
  assert.match(set, /this\._timed = !on;/, 'the pause card shows mines left alone');
  assert.match(set, /this\.el\.timeStat\.classList\.toggle\('hidden', !this\._timed\);/);
  assert.match(set, /this\.el\.hud\.classList\.toggle\('hud--learn', !!on\);/);
  assert.doesNotMatch(ui, /setTimed|hud-figures--untimed/, 'one switch, the layout\'s');
  assert.match(MAIN, /ui\.setLearn\(learn\)/);
  assert.match(MAIN, /ui\.setLearn\(false\)/);
  assert.doesNotMatch(MAIN, /setTimed/);
  const css = read('css/style.css');
  assert.doesNotMatch(css, /hud-figures--untimed/);
  // J-Ready-states' "Learn 3D · prompt 1–4": a column at the top left, the head above the strip, 12 px apart, no figures.
  const wide = css.slice(css.indexOf('/* Learn 3D\'s own play layout'));
  assert.ok(wide.length < css.length, 'the layout is documented');
  assert.match(wide, /@media \(min-width: 720px\) and \(min-height: 501px\), \(min-width: 720px\) and \(orientation: portrait\) \{\s*#hud\.hud--learn \.hud-overlay \{ display: flex; flex-direction: column; align-items: flex-start; gap: 12px; position: absolute; top: 24px; left: 24px; \}/);
  assert.match(wide, /#hud\.hud--learn :is\(\.hud-counters, \.hud-figures\) \{ position: static; transform: none; width: auto; max-height: none; \}/);
  assert.match(wide, /#hud\.hud--learn \.hud-figures \{ order: -1; \}/, 'the head first');
  assert.match(wide, /#hud\.hud--learn \.hud-figures \.ui-figures__head \{ gap: 16px; padding: 8px 8px 8px 20px; \}/);
  assert.match(wide, /#hud\.hud--learn ~ #help \{ right: 24px; \}/, 'the help panel takes the right edge the panel left');
  assert.doesNotMatch(wide, /#hud:not\(\.hud--2d\) ~ #help/, 'after every step of the help panel\'s place beside the figures, so it wins');
  assert.match(css, /#hud\.hud--learn \.hud-figures :is\(\.ui-figures__body, \.ui-figures__live\) \{ display: none; \}/, 'no 3BV, Clicks, Flags or reminder');
  const theme = read('themes/joyful-tiles/theme.css');
  assert.match(theme, /#hud\.hud--learn \.hud-figures \{ box-shadow: 0 6px 0 var\(--color-head-edge\), var\(--elevation-1\); \}/, 'the head on its own surface');
  assert.match(theme, /#hud\.hud--learn \.hud-figures \.ui-figures__title \{ font-size: 18px; \}/, 'the title 18 px');
  assert.match(MAIN, /bests3D = board\.learn \? null : RECORDS\.bests/, 'the guided board reads no bests');
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
  assert.ok(learn > 0 && learn < board.indexOf('data-preset="6'), 'above the presets');
  assert.match(board, /data-learn>[\s\S]*?Learn 3D[\s\S]*?A guided 4 &times; 4 &times; 3 box</);
  assert.match(board, /<div id="bc-learn-panel"[^>]*>[\s\S]*?keeps no records[\s\S]*?How 3D works/, 'what it is, on the right when chosen');
  const ready = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<section id="ctx-lost"'));
  assert.match(ready, /id="ready-learn"[^>]*hidden[\s\S]*New to 3D\? Learn 3D walks you through a small box\.[\s\S]*id="ready-learn-btn"[^>]*>Learn 3D</);
  assert.ok(ready.indexOf('id="ready-learn"') > ready.indexOf('</button>'), 'outside the card\'s own button');
  assert.match(INDEX, /<section id="learn-end" class="overlay hidden"[\s\S]*?id="learn-end-title"[\s\S]*?id="learn-end-line"[\s\S]*?id="learn-end-primary"[\s\S]*?id="learn-end-back"[^>]*>Back to board choice</);
  const card = INDEX.slice(INDEX.indexOf('<section id="learn-end"'), INDEX.indexOf('<section id="pause"'));
  assert.doesNotMatch(card, /First box/, 'no First box on the end card');
  // As J-Ready-states draws it: the "Learn 3D" section label over the outcome, the line, then the large primary
  // action with its select key hint beside Back to board choice.
  assert.match(card, /<div class="ui-section-label"><span class="ui-section-label__text">Learn 3D<\/span><\/div>\s*<h2 class="ui-card__title" id="learn-end-title">/);
  assert.match(card, /<button type="button" id="learn-end-primary" class="ui-button ui-button--primary ui-button--lg" data-icon="play"><span id="learn-end-primary-label">Play Cube Intro<\/span> <span class="ui-key-hint" data-action="select" aria-hidden="true"><\/span><\/button>/);
  assert.match(card, /<button type="button" id="learn-end-back" class="ui-button ui-button--secondary" data-icon="arrow-left">Back to board choice<\/button>/, 'Back at the default size, with the arrow-left icon');
  assert.match(card, /<p class="ui-text" id="learn-end-line">/, 'the body text in ink');
});

test('the Learn 3D end card: a win reads "You cleared the box!" and offers Play Cube Intro, a loss says the box is always the same and offers Try again', () => {
  const ui = code('js/ui.js');
  const show = ui.slice(ui.indexOf('showLearnEnd(won) {'), ui.indexOf('hideLearnEnd()'));
  assert.match(show, /learnEndTitle\.textContent = won \? 'You cleared the box!' : 'That was a mine!'/);
  assert.match(show, /learnEndLine\.textContent = won \? 'Ready for a real board\? Cube Intro is a 6 × 6 × 6 box with 10 mines, a timer and records\.' : 'The lesson box is always the same\. Try it again\.'/);
  assert.match(show, /learnEndPrimaryLabel\.textContent = won \? 'Play Cube Intro' : 'Try again'/);
  assert.doesNotMatch(show, /learnEndLine\.classList/, 'the line shows on both');
  assert.match(show, /setButtonIcon\(this\.el\.learnEndPrimary, won \? 'play' : 'restart'\)/, 'the canvas\'s icons: play, restart');
  assert.deepEqual([INTRO.X, INTRO.Y, INTRO.Z, INTRO.mines], [6, 6, 6, 10], 'the line names Cube Intro\'s board');
  assert.match(ui, /learnEndLine: \$\('learn-end-line'\)/);
  assert.match(MAIN, /onLearnEnd: \(won\) => \(won \? playCubeIntro\(\) : PAUSE\.restart\(/);
  const play = MAIN.slice(MAIN.indexOf('function playCubeIntro('), MAIN.indexOf('\n}\n', MAIN.indexOf('function playCubeIntro(')));
  assert.match(play, /const choice = \{ size: 'cube-intro', custom: \{ \.\.\.last\.custom \}, noGuess: !!last\.noGuess \};/, 'Cube Intro with the presets\' no-guess switch as remembered');
  assert.match(play, /LAST_CHOICE_3D\.save\(choice\)/, 'saved as the last choice');
  assert.match(play, /MODES\.start\('3d', boardOf\(choice\)\)/);
  assert.doesNotMatch(MAIN, /playFirstBox|First box/, 'no First box left in the shell');
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

test('js/main.js feeds L\'s closed, unflagged neighbour count after every board action of the guided game, left-click reveals included', () => {
  const src = code('js/main.js');
  const body = src.slice(src.indexOf('function learnAction'), src.indexOf('function learnViews'));
  assert.match(body, /lessonClosed\(closedAround\(S\.game, LEARN_BOARD\.lessonNumber\)\)/);
  assert.doesNotMatch(body, /if \(type === 'left'\) return/, 'no action is left out');
  assert.match(body, /if \(changed\) learnChanged\(\)/, 'the strip and the tint follow a changed line');
  assert.match(src, /if \(S\.learn\) learnAction\(type, sel, r\)/, 'every synchronous action of onAction');
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
    const first = await ms(() => document.querySelector('#board-choice .ui-option').hasAttribute('data-learn'));
    assert.ok(first, 'Learn 3D leads the board choice');
    await ms(() => document.querySelector('#board-choice [data-learn]').click());
    assert.equal(await mode(), 'board-choice', 'a click chooses Learn 3D');
    await ms(() => document.getElementById('bc-play').click());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
    assert.equal(await shown('ready-learn'), false, 'no Learn 3D line on its own ready card');
    assert.equal(await shown('ready-rules'), false, 'the "How 3D works" block does not show');
    assert.equal(await ms(() => document.getElementById('hud-title').textContent), 'Learn 3D');
    assert.equal(await shown('hud-time'), false, 'no timer');
    await ms(() => globalThis.__ms.forcePlay());
    // Its own layout: the head (title and Pause) at the top left, the strip of mines and Restart under it, no figures.
    const box = (sel) => ms((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { left: r.left, top: r.top, bottom: r.bottom, width: r.width }; }, sel);
    const head = await box('#hud-figures .ui-figures__head'), counters = await box('#hud-counters');
    assert.deepEqual([Math.round(head.left), Math.round(head.top)], [24, 24], 'the head at the top left');
    assert.equal(Math.round(counters.left), 24, 'the strip under it, left-aligned');
    assert.equal(Math.round(counters.top - head.bottom), 12, '12 px apart');
    assert.equal(await ms(() => document.querySelector('#hud-figures .ui-figures__body').getClientRects().length), 0, 'no 3BV, Clicks, Flags or reminder');
    assert.equal(await ms(() => getComputedStyle(document.getElementById('hud-title')).fontSize), '18px');
    assert.equal(await shown('hud-pause'), true);
    assert.equal(await shown('hud-restart'), true);
    await page.keyboard.press('KeyH');
    await page.waitForFunction(() => !document.getElementById('help').classList.contains('hidden'));
    assert.equal(await ms(() => Math.round(innerWidth - document.getElementById('help').getBoundingClientRect().right)), 24, 'the help panel on the right edge');
    await page.keyboard.press('KeyH');
    await page.waitForFunction(() => document.getElementById('help').classList.contains('hidden'));
    const L = await ms(() => globalThis.__ms.learnBoard.lessonNumber);
    const M = await ms(() => globalThis.__ms.learnBoard.lessonMine);
    const start = await ms(() => globalThis.__ms.learnBoard.startCell);
    assert.equal(await ms(() => globalThis.__ms.renderer.mark), start, 'the start cell is marked');
    assert.equal(await strip(), 'Click the marked cube to start');
    assert.equal(await shown('hint-strip-step'), false, 'the start prompt carries no step');

    // A reveal off the start cell changes nothing and hints.
    await aim(start === 0 ? 1 : 0);
    await ms(() => globalThis.__ms.click('left'));
    assert.equal(await ms(() => globalThis.__ms.state.started), false);
    assert.match(await ms(() => document.getElementById('toast').textContent), /^Start on the marked/);

    assert.equal(await aim(start), start, 'the marked cube is aimed');
    await ms(() => globalThis.__ms.click('left'));
    await page.waitForFunction(() => globalThis.__ms.state.started);
    assert.equal(await strip(), 'Hold Shift to see what this number counts');
    assert.equal(await ms(() => document.getElementById('hint-strip-step').textContent), '1 / 4', 'the first step says so');
    assert.equal(await shown('hint-strip-step'), true);
    assert.deepEqual(await ms(() => { const s = getComputedStyle(document.getElementById('hint-strip')); return [s.paddingTop, s.paddingLeft, s.columnGap]; }), ['9px', '20px', '12px'], 'the prompt\'s own strip');
    assert.equal(await ms(() => getComputedStyle(document.getElementById('hint-strip-step')).fontSize), '13px');
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
    assert.equal(await shown('hint-strip-step'), false, 'the rest carries no step');

    // Clear the rest of the box.
    await ms((mines) => {
      const g = globalThis.__ms.game;
      for (let c = 0; c < g.n; c++) if (!mines.includes(c) && !g.pressed[c]) globalThis.__ms.state.play.reveal(c);
    }, await ms(() => [...globalThis.__ms.learnBoard.minePositions]));
    await page.waitForFunction(() => globalThis.__ms.game.state === 'won');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'learn-end', null, { timeout: patience(10000) });
    assert.equal(await ms(() => document.getElementById('learn-end-title').textContent), 'You cleared the box!');
    assert.equal(await ms(() => document.getElementById('learn-end-line').textContent), 'Ready for a real board? Cube Intro is a 6 × 6 × 6 box with 10 mines, a timer and records.');
    assert.equal(await ms(() => document.getElementById('learn-end-primary-label').textContent), 'Play Cube Intro');
    assert.equal(await ms(() => document.getElementById('learn-end-line').classList.contains('hidden')), false, 'the win\'s line shows');
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
