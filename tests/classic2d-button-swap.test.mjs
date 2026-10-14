// Classic 2D mouse button swap (js/classic2d/button-swap.js): the page's swap switch and its
// per-press translation of the physical mouse button, the pointer wiring's use of it
// (js/classic2d/pointer-input.js mountPointerInput), and in a browser the toggle on the board's
// overlay bar.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createButtonSwap } from '../js/classic2d/button-swap.js';
import { BUTTON, mountPointerInput } from '../js/classic2d/pointer-input.js';
import { PAN_MODIFIER } from '../js/classic2d/board-view.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE } from '../js/engine/profiles.js';
import { browserSuite } from './helpers/browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const suite = browserSuite();
const { LEFT, MIDDLE, RIGHT } = BUTTON;

// ---------- the switch and the translation ----------

test('the switch starts off, toggles and reports each change', () => {
  const swap = createButtonSwap();
  assert.equal(swap.on, false);
  const seen = [];
  const off = swap.onChange((on) => seen.push(on));
  assert.equal(swap.toggle(), true);
  assert.equal(swap.on, true);
  swap.toggle();
  assert.deepEqual(seen, [true, false]);
  off();
  swap.toggle();
  assert.deepEqual(seen, [true, false], 'an unsubscribed listener hears nothing');
});

test('a press on a closed or flagged cell trades left and right while the switch is on', () => {
  const swap = createButtonSwap();
  assert.equal(swap.press(LEFT, true), LEFT, 'off: unchanged');
  swap.reset();
  swap.toggle();
  assert.equal(swap.press(LEFT, true), RIGHT);
  assert.equal(swap.press(RIGHT, true), LEFT);
  assert.equal(swap.press(MIDDLE, true), MIDDLE, 'the middle button is never swapped');
  swap.reset();
  assert.equal(swap.press(LEFT, false), LEFT, 'a revealed cell or no cell: unchanged');
  assert.equal(swap.press(RIGHT, false), RIGHT);
});

test('a release goes to the button its press was translated to; reset forgets every press', () => {
  const swap = createButtonSwap();
  swap.toggle();
  assert.equal(swap.press(RIGHT, true), LEFT);
  swap.toggle();
  assert.equal(swap.release(RIGHT), LEFT, 'the switch flipped while held: the press keeps its swap');
  assert.equal(swap.release(RIGHT), RIGHT, 'a release with no recorded press passes through');
  swap.toggle();
  assert.equal(swap.press(LEFT, true), RIGHT);
  swap.reset();
  assert.equal(swap.release(LEFT), LEFT, 'forgotten');
});

// ---------- the pointer wiring ----------

const CORNER = ['*....', '.....', '.....', '.....'];

function mouse(type, props) {
  const event = new Event(type, { cancelable: true });
  return Object.assign(event, { button: 0, clientX: 0, clientY: 0, shiftKey: false, ...props });
}

// The wiring of tests/classic2d-pointer.test.mjs with a swap handed in: cells are 10 px squares
// from the canvas origin at (100, 50), the session records what it is asked.
function wiring({ scrolls = false, swap = createButtonSwap() } = {}) {
  const width = CORNER[0].length;
  const height = CORNER.length;
  const grid = createSquareGrid(width, height);
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, mines: [0], dimensions: { width, height } });
  const canvas = new EventTarget();
  canvas.getBoundingClientRect = () => ({ left: 100, top: 50, width: 50, height: 40 });
  const win = new EventTarget();
  const pressedCalls = [];
  const view = {
    canvas,
    layout: { scrolls },
    cellAt: (x, y) => (x >= 0 && y >= 0 && x < 50 && y < 40 ? Math.floor(x / 10) + 5 * Math.floor(y / 10) : -1),
    setPressed: (cells) => pressedCalls.push([...cells]),
  };
  const asked = [];
  const session = {
    state: 'playing',
    paused: false,
    game,
    reveal: (c) => { asked.push(['reveal', c]); return game.reveal(c); },
    toggleFlag: (c) => { asked.push(['toggleFlag', c]); return game.toggleFlag(c); },
    chord: (c) => { asked.push(['chord', c]); return game.chord(c); },
  };
  const mounted = mountPointerInput({ view, session, graph: grid.graph, win, swap });
  const xy = (col, row) => ({ clientX: 100 + col * 10 + 5, clientY: 50 + row * 10 + 5 });
  const click = (button, col, row) => {
    canvas.dispatchEvent(mouse('mousedown', { button, ...xy(col, row) }));
    win.dispatchEvent(mouse('mouseup', { button, ...xy(col, row) }));
  };
  return { grid, game, canvas, win, session, asked, pressedCalls, mounted, xy, click, swap };
}

test('mounted, swap on: a left press flags a closed cell at once; a right press shows it pressed and reveals it on release', () => {
  const w = wiring();
  w.swap.toggle();
  w.canvas.dispatchEvent(mouse('mousedown', { button: LEFT, ...w.xy(4, 3) }));
  assert.deepEqual(w.asked, [['toggleFlag', w.grid.index(4, 3)]], 'flagged on the press, as a right press does');
  assert.deepEqual(w.pressedCalls, [], 'nothing shows pressed');
  w.win.dispatchEvent(mouse('mouseup', { button: LEFT, ...w.xy(4, 3) }));
  assert.equal(w.asked.length, 1, 'the release does nothing more');

  w.canvas.dispatchEvent(mouse('mousedown', { button: RIGHT, ...w.xy(2, 2) }));
  assert.deepEqual(w.pressedCalls.at(-1), [w.grid.index(2, 2)], 'shown pressed, as a left press is');
  assert.equal(w.asked.length, 1, 'nothing acts on the press');
  w.win.dispatchEvent(mouse('mouseup', { button: RIGHT, ...w.xy(2, 2) }));
  assert.deepEqual(w.asked.at(-1), ['reveal', w.grid.index(2, 2)]);
});

test('mounted, swap on: a left press unflags a flagged cell, and a left release on a number still chords', () => {
  const w = wiring();
  w.swap.toggle();
  w.click(LEFT, 0, 0);
  assert.equal(w.game.cellState(0), CELL.FLAGGED);
  w.click(LEFT, 0, 0);
  assert.equal(w.game.cellState(0), CELL.CLOSED, 'unflagged');
  w.click(RIGHT, 1, 1);
  assert.equal(w.game.cellNumber(w.grid.index(1, 1)), 1);
  w.click(LEFT, 0, 0);
  w.asked.length = 0;
  w.click(LEFT, 1, 1);
  assert.deepEqual(w.asked, [['chord', w.grid.index(1, 1)]], 'a revealed number: never swapped');
});

test('mounted, swap off: the buttons keep their roles', () => {
  const w = wiring();
  w.click(LEFT, 2, 2);
  assert.deepEqual(w.asked, [['reveal', w.grid.index(2, 2)]]);
});

test('mounted: a press keeps its swap through its release when the switch flips while it is held', () => {
  const w = wiring();
  w.swap.toggle();
  w.canvas.dispatchEvent(mouse('mousedown', { button: RIGHT, ...w.xy(2, 2) }));
  w.swap.toggle();
  w.win.dispatchEvent(mouse('mouseup', { button: RIGHT, ...w.xy(2, 2) }));
  assert.deepEqual(w.asked, [['reveal', w.grid.index(2, 2)]]);
});

test('mounted: losing focus or unmounting forgets the swapped presses', () => {
  const w = wiring();
  w.swap.toggle();
  w.canvas.dispatchEvent(mouse('mousedown', { button: RIGHT, ...w.xy(2, 2) }));
  w.win.dispatchEvent(new Event('blur'));
  assert.equal(w.swap.release(RIGHT), RIGHT, 'forgotten on blur');
  w.canvas.dispatchEvent(mouse('mousedown', { button: RIGHT, ...w.xy(2, 2) }));
  w.mounted.destroy();
  assert.equal(w.swap.release(RIGHT), RIGHT, 'forgotten on destroy');
});

test('mounted, swap on: a shift + primary press on a board that scrolls is still the pan\'s', () => {
  const w = wiring({ scrolls: true });
  w.swap.toggle();
  w.canvas.dispatchEvent(mouse('mousedown', { button: LEFT, [PAN_MODIFIER]: true, ...w.xy(2, 2) }));
  w.win.dispatchEvent(mouse('mouseup', { button: LEFT, [PAN_MODIFIER]: true, ...w.xy(2, 2) }));
  assert.deepEqual(w.asked, []);
});

// ---------- the toggle on the board, in a browser ----------

test('in a browser: the swap toggle shows on the Classic 2D board while unpaused, swaps a click, keeps across games and never takes focus', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const shown = () => ms(() => {
      const b = document.getElementById('hud-swap');
      return !!b && b.offsetParent !== null && getComputedStyle(b).visibility !== 'hidden';
    });
    const pressed = () => ms(() => document.getElementById('hud-swap').getAttribute('aria-pressed'));

    // The densest 9 × 9 board, so the first reveal at the centre leaves the corner closed.
    await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'custom', custom: { width: 9, height: 9, mines: 31 }, noGuess: false }));
    await page.waitForFunction(() => globalThis.__ms.board2D);
    assert.equal(await shown(), true, 'on the board in play');
    assert.equal(await pressed(), 'false', 'off at page load');

    await page.click('#hud-swap');
    assert.equal(await pressed(), 'true');
    assert.notEqual(await ms(() => document.activeElement?.id), 'hud-swap', 'the board keeps the keys');

    const at = (col, row) => ms(([col, row]) => {
      const v = globalThis.__ms.board2D;
      const area = document.getElementById('c2d-board').getBoundingClientRect();
      const t = v.layout.tile;
      return { x: area.left + v.layout.viewX + (col + 0.5) * t, y: area.top + v.layout.viewY + (row + 0.5) * t };
    }, [col, row]);
    const centre = await at(4, 4);
    await page.mouse.click(centre.x, centre.y, { button: 'right' });
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    const corner = await at(0, 0);
    await page.mouse.click(corner.x, corner.y);
    assert.equal(await ms(() => document.getElementById('hud-mines').textContent), '30', 'a left click flags');

    await page.click('#hud-pause');
    assert.equal(await shown(), false, 'hidden while paused');
    await page.click('#p-resume');
    assert.equal(await shown(), true, 'back after resume');

    await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'beginner', noGuess: false }));
    assert.equal(await pressed(), 'true', 'kept for the next game');

    await page.reload();
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    await ms(() => globalThis.__ms.modes.start('classic-2d', { size: 'beginner', noGuess: false }));
    await page.waitForFunction(() => globalThis.__ms.board2D);
    assert.equal(await pressed(), 'false', 'a reload resets it');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('the 3D overlay never shows the swap toggle', () => {
  const css = readFileSync(join(ROOT, 'css', 'style.css'), 'utf8');
  assert.match(css, /#hud:not\(\.hud--2d\) #hud-swap\s*\{[^}]*display:\s*none/);
});
