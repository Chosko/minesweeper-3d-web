// The controller's D-pad walk in a browser (js/main.js padNav through js/shell/navigation.js
// focusMove and js/gamepad.js pickInDirection): the Classic 2D board choice walked control by
// control, the 3D board choice's walk as it stood before the DOM-order fallback, the Records walk over
// a seeded history with kept replays (each Watch and Pin a stop, Right from "Pinned first"), LB / RB /
// LT / RT in Records with their glyph hints, and the replay viewer's seek bar hint under pad
// navigation; and the rumble cues on a board — a trigger's press pulse, a controller flag's double
// pulse, nothing from the mouse. Skipped when Playwright or Chromium is unavailable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { browserSuite } from './helpers/browser.mjs';
import { patience } from './helpers/timing.mjs';

const suite = browserSuite();
const BTN = { A: 0, B: 1, X: 2, LB: 4, RB: 5, LT: 6, RT: 7, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };
const DIR = { up: BTN.UP, down: BTN.DOWN, left: BTN.LEFT, right: BTN.RIGHT };

/** A page with a faked standard controller (`__pad.press(button, on)`) and the shell loaded. */
async function open(browser, base) {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
    const pad = { id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e)', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons, timestamp: 0 };
    const rumbles = [];
    pad.vibrationActuator = { playEffect: (type, p) => { rumbles.push(p.duration); return Promise.resolve('complete'); } };
    navigator.getGamepads = () => [pad];
    globalThis.__pad = { rumbles, press(i, on) { buttons[i].pressed = on; buttons[i].value = on ? 1 : 0; pad.timestamp++; } };
  });
  await page.goto(`${base}/index.html?still-backdrop`);
  await page.waitForFunction(() => globalThis.__ms?.state.mode === 'menu');
  const ms = (fn, arg) => page.evaluate(fn, arg);
  const frames = (count) => ms((k) => new Promise((r) => { const f = () => (--k ? requestAnimationFrame(f) : r()); requestAnimationFrame(f); }), count);
  const hold = async (button, on) => { await ms(([b, o]) => globalThis.__pad.press(b, o), [button, on]); await frames(2); };
  // Held for exactly one poll: the shell's frame loop registers its next animation frame before this
  // callback, so within one frame its poll reads the press and this callback releases it, in the page,
  // with no round trip to the test in between — the menus' auto-repeat never fires however slow the
  // machine. Two more frames, so the release is polled before the next press.
  const tap = async (button) => {
    await ms((b) => new Promise((done) => {
      globalThis.__pad.press(b, true);
      requestAnimationFrame(() => { globalThis.__pad.press(b, false); done(); });
    }), button);
    await frames(2);
  };
  /** The focused control's name: its id, else its data-value / data-size / data-preset. */
  const focused = () => ms(() => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    return e.id || e.dataset.value || e.dataset.size || e.dataset.preset || e.textContent.trim();
  });
  /** Press each direction in turn, returning where focus is after each press. */
  const walk = async (dirs) => {
    const seen = [];
    for (const d of dirs) { await tap(DIR[d]); seen.push(await focused()); }
    return seen;
  };
  return { page, errors, ms, frames, hold, tap, focused, walk };
}

test('in a browser, the D-pad walks every control of the 2D board choice and the 3D board choice alike', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, tap, focused, walk } = await open(browser, base);

    // Classic 2D: Down walks the options, then the switch on the right, then the bar's Records and Play;
    // Up retraces the walk, and from the first option reaches Back.
    await page.click('#menu-entry-classic-2d');
    await ms(() => document.querySelector('#c2d-choice [data-size="beginner"]').focus());
    assert.equal(await focused(), 'beginner');
    assert.deepEqual(await walk(['down', 'down', 'down', 'down', 'down', 'down', 'down', 'down']),
      ['intermediate', 'expert', 'custom', 'c2d-code-option', 'c2d-noguess', 'c2d-records', 'c2d-play', 'c2d-play'], 'no wrap past Play');
    assert.deepEqual(await walk(['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up']),
      ['c2d-records', 'c2d-noguess', 'c2d-code-option', 'custom', 'expert', 'intermediate', 'beginner', 'c2d-choice-back']);
    // A on Custom chooses it: its form joins the walk, Left / Right walk its row.
    await ms(() => document.querySelector('#c2d-choice [data-size="custom"]').focus());
    await tap(BTN.A);
    assert.equal(await ms(() => document.querySelector('#c2d-choice [aria-pressed="true"]').dataset.size), 'custom');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'classic-2d-choice', 'A chooses, and starts nothing');
    await ms(() => document.getElementById('c2d-noguess').focus());
    assert.deepEqual(await walk(['down', 'right', 'right', 'left', 'left']), ['c2d-width', 'c2d-height', 'c2d-mines', 'c2d-height', 'c2d-width']);
    assert.deepEqual(await walk(['down', 'down', 'down']), ['c2d-random', 'c2d-records', 'c2d-play']);
    // Every focusable control on the screen is reached by the D-pad alone.
    const all = await ms(() => [...document.querySelectorAll('#c2d-choice button:not(:disabled), #c2d-choice input')]
      .filter((e) => e.getClientRects().length > 0).map((e) => e.id || e.dataset.size));
    const reached = new Set();
    const queue = ['beginner'];
    while (queue.length) {
      const at = queue.shift();
      if (reached.has(at)) continue;
      reached.add(at);
      for (const d of ['up', 'down', 'left', 'right']) {
        await ms((i) => (document.getElementById(i) ?? document.querySelector(`#c2d-choice [data-size="${i}"]`)).focus(), at);
        const [to] = await walk([d]);
        if (to && !reached.has(to)) queue.push(to);
      }
    }
    assert.deepEqual([...reached].sort(), all.sort(), 'every control reached');
    // LB / RB still step a focused number field, and the live validation still runs.
    await ms(() => document.getElementById('c2d-width').focus());
    const width = Number(await page.inputValue('#c2d-width'));
    await tap(BTN.RB);
    assert.equal(Number(await page.inputValue('#c2d-width')), width + 1);
    await tap(BTN.LB);
    assert.equal(Number(await page.inputValue('#c2d-width')), width);
    assert.match(await page.textContent('#c2d-info'), new RegExp(`${(width * Number(await page.inputValue('#c2d-height'))).toLocaleString('en-US')} cells`));
    await tap(BTN.B);
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'menu');

    // 3D, as Classic 2D: Down walks the options, then the switch on the right, then the bar's Records and
    // Play; Up retraces the walk, and from Learn 3D reaches Back.
    await page.click('#menu-entry-3d');
    await ms(() => document.querySelector('#board-choice [data-learn]').focus());
    assert.equal(await focused(), 'bc-learn');
    assert.deepEqual(await walk(Array(10).fill('down')),
      ['6,6,6,10', '6,6,6,20', '8,8,8,40', '10,10,10,100', 'custom', 'bc-code-option', 'bc-noguess', 'bc-records', 'bc-play', 'bc-play'], 'no wrap past Play');
    assert.deepEqual(await walk(Array(10).fill('up')),
      ['bc-noguess', 'bc-code-option', 'custom', '10,10,10,100', '8,8,8,40', '6,6,6,20', '6,6,6,10', 'bc-learn', 'board-choice-back', 'board-choice-back'],
      'Up from Play retraces the walk, no wrap past Back');
    // A on Custom chooses it: its switch and form join the walk, Left / Right walk its row.
    await ms(() => document.querySelector('#board-choice [data-preset="custom"]').focus());
    await tap(BTN.A);
    assert.equal(await ms(() => document.querySelector('#board-choice [aria-pressed="true"]').dataset.preset), 'custom');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'board-choice', 'A chooses, and starts nothing');
    await ms(() => document.getElementById('c-noguess').focus());
    assert.deepEqual(await walk(['down', 'right', 'right', 'right', 'left', 'left', 'left']), ['c-x', 'c-y', 'c-z', 'c-m', 'c-z', 'c-y', 'c-x']);
    assert.deepEqual(await walk(['down', 'down', 'down']), ['c-random', 'bc-records', 'bc-play']);
    // Every focusable control on the screen is reached by the D-pad alone.
    const all3d = await ms(() => [...document.querySelectorAll('#board-choice button:not(:disabled), #board-choice input:not(:disabled)')]
      .filter((e) => e.getClientRects().length > 0).map((e) => e.id || e.dataset.preset));
    const reached3d = new Set();
    const queue3d = ['bc-learn'];
    while (queue3d.length) {
      const at = queue3d.shift();
      if (reached3d.has(at)) continue;
      reached3d.add(at);
      for (const d of ['up', 'down', 'left', 'right']) {
        await ms((i) => (document.getElementById(i) ?? document.querySelector(`#board-choice [data-preset="${i}"]`)).focus(), at);
        const [to] = await walk([d]);
        if (to && !reached3d.has(to)) queue3d.push(to);
      }
    }
    assert.deepEqual([...reached3d].sort(), all3d.sort(), 'every control reached');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

/** Two won Beginner games, each with a kept replay (the recorded fixture's bytes under its id). */
async function seed(ms) {
  await ms(async () => {
    const bytes = new Uint8Array(await (await fetch('/tests/fixtures/replays/2d-beginner-won.msrp')).arrayBuffer());
    const { boardKey } = await import('/js/records/board.js');
    const board = { mode: 'classic-2d', grid: 'square', width: 9, height: 9, mines: 10, noGuess: false };
    const clicks = { reveal: { effective: 25, wasted: 0 }, flag: { effective: 0, wasted: 0 }, chord: { effective: 0, wasted: 0 } };
    const games = [['r1', 40000, '2026-10-08T12:00:00.000Z'], ['r2', 30000, '2026-10-09T12:00:00.000Z']];
    await globalThis.__ms.replays.load();
    for (const [id, elapsedMs, endedAt] of games) {
      globalThis.__ms.records.record({ id, board, outcome: 'won', elapsedMs, bbbv: 20, bbbvSolved: 20, clicks,
        bbbvPerSecond: 20 / (elapsedMs / 1000), efficiency: 80, seed: 1, generatorVersion: 1, endedAt });
      await globalThis.__ms.replays.add(bytes, { id, boardKey: boardKey(board), mode: 'classic-2d', outcome: 'won', elapsedMs,
        bbbvPerSecond: 20 / (elapsedMs / 1000), efficiency: 80, endedAt, size: bytes.length }, false);
    }
    await globalThis.__ms.replays.settled();
  });
}

test('in a browser, the Records walk stops on every Watch, Download, Pin and Delete of the shown tab, and Right from "Pinned first" enters the replays', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, tap, focused } = await open(browser, base);
    await seed(ms);
    await page.click('#menu-entry-records');
    assert.equal(await ms(() => globalThis.__ms.state.mode), 'records');
    const key = () => ms(() => {
      const e = document.activeElement;
      const table = e.closest('table');
      return table ? `${table.id}:${[...table.querySelectorAll('button')].indexOf(e)}` : e.id || `${e.parentElement.closest('[id]').id}:${e.dataset.value || e.textContent.trim()}`;
    });
    const buttonsOf = (id) => ms((i) => [...document.querySelectorAll(`#${i} button`)].map((_, n) => `${i}:${n}`), id);
    const games = await buttonsOf('records-games');
    const replays = await buttonsOf('records-replays-table');
    assert.deepEqual([games.length, replays.length], [2, 8], 'two Watch in the games list, a Watch, a Download, a Pin and a Delete on each replay');

    // Down from the picker visits every button of the shown tab's table in DOM order, to the end of the screen; Up from there retraces them.
    const walkDown = async () => {
      await ms(() => document.querySelector('#records-picker [aria-checked="true"]').focus());
      const down = [await key()];
      for (let i = 0; i < 40; i++) { await tap(BTN.DOWN); const k = await key(); if (k === down.at(-1)) break; down.push(k); }
      const up = [down.at(-1)];
      for (let i = 0; i < 40 && !(await ms(() => !!document.activeElement.closest('#records-picker'))); i++) { await tap(BTN.UP); up.push(await key()); }
      return { down, up };
    };
    for (const [tab, buttons] of [['recent', games], ['replays', replays]]) {
      await page.click(`#records-tab-${tab}`);
      const { down, up } = await walkDown();
      assert.deepEqual(down.filter((k) => /^records-(games|replays-table):/.test(k)), buttons, `${tab}: each button a stop, in DOM order`);
      assert.deepEqual(up.filter((k) => buttons.includes(k)), [...buttons].reverse(), `${tab}: Up visits them in reverse`);
    }

    // Right from "Pinned first" goes to Open replay file beside it, then on into the replays table's first button.
    await ms(() => document.getElementById('records-pinned-first').focus());
    await tap(BTN.RIGHT);
    assert.equal(await key(), 'records-replays-open');
    await tap(BTN.DOWN);
    assert.equal(await key(), 'records-replays-table:0');

    // A on Pin pins, as a click does, and focus stays on the row's button.
    const pin = await ms(() => [...document.querySelectorAll('#records-replays-table button')].findIndex((b) => b.dataset.act === 'pin'));
    await ms((i) => document.querySelectorAll('#records-replays-table button')[i].focus(), pin);
    assert.equal(await ms(() => document.activeElement.textContent), 'Pin');
    await tap(BTN.A);
    await page.waitForFunction(() => document.activeElement?.textContent === 'Unpin');
    assert.equal(await ms(() => document.activeElement.closest('table')?.id), 'records-replays-table');

    // The controller reaches every tab: Right walks the tabs and A selects one, Leaderboards' coming-soon panel among them.
    await ms(() => document.getElementById('records-tab-recent').focus());
    await page.click('#records-tab-recent');
    for (const next of ['records-tab-top', 'records-tab-replays', 'records-tab-leaderboards']) { await tap(BTN.RIGHT); assert.equal(await key(), next); }
    await tap(BTN.A);
    assert.equal(await ms(() => document.querySelector('#records-tabs [aria-selected="true"]').id), 'records-tab-leaderboards');
    assert.equal(await ms(() => document.getElementById('records-leaderboards').classList.contains('hidden')), false, 'A shows the coming-soon panel');

    // A on Watch opens the replay viewer, as a click does.
    await page.click('#records-tab-recent');
    await ms(() => document.querySelector('#records-games button[data-watch]').focus());
    await tap(BTN.A);
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'replay');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, LB / RB step the Records board and LT / RT switch 2D and 3D, with their glyphs shown only under pad navigation', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, frames, hold, tap } = await open(browser, base);
    await seed(ms);
    const checked = (id) => ms((i) => document.querySelector(`#${i} [aria-checked="true"]`)?.dataset.value, id);
    const board = () => checked('records-picker');
    const mode = () => checked('records-mode');

    // A trigger held through entering Records does nothing until released.
    await hold(BTN.RT, true);
    await page.click('#menu-entry-records');
    await frames(4);
    assert.equal(await mode(), 'classic-2d');
    await hold(BTN.RT, false);
    assert.equal(await mode(), 'classic-2d', 'the release of a suppressed trigger does nothing');

    const order = await ms(() => [...document.querySelectorAll('#records-picker .ui-segmented__option')].map((o) => o.dataset.value));
    assert.equal(await board(), order[0]);
    await ms(() => document.getElementById('records-export-csv').focus());
    await tap(BTN.LB);
    assert.equal(await board(), order[0], 'LB at the first board: held');
    await tap(BTN.RB);
    assert.equal(await board(), order[1], 'RB: the next board');
    assert.equal(await ms(() => document.activeElement.id), 'records-export-csv', 'focus stays on a control that still exists');
    await tap(BTN.RB);
    assert.equal(await board(), order[2]);
    await tap(BTN.LB);
    assert.equal(await board(), order[1], 'LB: the previous board');
    for (let i = 0; i < order.length; i++) await tap(BTN.RB);
    assert.equal(await board(), order.at(-1), 'RB at the last board: held');

    // A Watch focused on a board whose Watch goes away: focus moves to the picker's chosen option.
    await ms(() => { const o = document.querySelector('#records-picker .ui-segmented__option'); o.click(); });
    await ms(() => document.querySelector('#records-games button[data-watch]').focus());
    await tap(BTN.RB);
    assert.equal(await board(), order[1]);
    assert.equal(await ms(() => document.activeElement.closest('#records-picker') && document.activeElement.getAttribute('aria-checked')), 'true');

    await tap(BTN.RT);
    assert.equal(await mode(), '3d', 'RT: 3D');
    assert.equal(await ms(() => !!document.activeElement.closest('#records-picker')), true);
    await tap(BTN.RT);
    assert.equal(await mode(), '3d');
    await tap(BTN.LT);
    assert.equal(await mode(), 'classic-2d', 'LT: 2D');

    // The glyphs: the active pad's LB / RB at the picker's ends and LT / RT at the switch's, under pad navigation only.
    const glyphs = () => ms(() => [...document.querySelectorAll('#records [data-pad-glyph]')].map((e) => [e.dataset.padGlyph, e.textContent, getComputedStyle(e).visibility]));
    assert.equal(await ms(() => document.body.classList.contains('pad-nav')), true);
    assert.deepEqual(await glyphs(), [['lt', 'LT', 'visible'], ['rt', 'RT', 'visible'], ['lb', 'LB', 'visible'], ['rb', 'RB', 'visible']]);
    const rects = () => ms(() => ['records-mode', 'records-picker'].map((id) => JSON.stringify(document.getElementById(id).getBoundingClientRect())));
    const padRects = await rects();
    await page.mouse.move(5, 5);
    await page.mouse.move(40, 40);
    assert.deepEqual((await glyphs()).map((g) => g[2]), ['hidden', 'hidden', 'hidden', 'hidden'], 'hidden with the mouse');
    assert.deepEqual(await rects(), padRects, 'and the layout does not shift');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, the replay viewer\'s seek bar shows the D-pad hint under pad navigation and steps with Left / Right', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, tap } = await open(browser, base);
    await seed(ms);
    await page.click('#menu-entry-records');
    await page.click('#records-games button[data-watch]');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'replay' && globalThis.__ms.replayViewer.state.status === 'ready');
    const hint = () => ms(() => { const e = document.getElementById('rp-seek-pad'); return [e.textContent.replace(/\s+/g, ' ').trim(), getComputedStyle(e).visibility]; });
    assert.equal((await hint())[1], 'hidden', 'hidden with the mouse');
    // The seek bar is on the viewer's D-pad walk, above the transport.
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) { await tap(BTN.UP); reached = await ms(() => document.activeElement?.id === 'rp-seek'); }
    assert.equal(reached, true, 'Up reaches the seek bar');
    assert.deepEqual(await hint(), ['D-pad ◀ ▶ seek', 'visible']);
    const step = await ms(() => Number(document.getElementById('rp-seek').step));
    const at = await ms(() => Number(document.getElementById('rp-seek').value));
    await tap(BTN.RIGHT);
    assert.equal(await ms(() => Number(document.getElementById('rp-seek').value)), at + step, 'Right steps it by the seek step');
    await tap(BTN.LEFT);
    assert.equal(await ms(() => Number(document.getElementById('rp-seek').value)), at);
    await page.mouse.move(5, 5);
    await page.mouse.move(40, 40);
    assert.equal((await hint())[1], 'hidden', 'hidden after a mouse move');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});

test('in a browser, a trigger press on a board pulses, a controller flag double-pulses, and the mouse never rumbles', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, frames, hold, tap } = await open(browser, base);
    // The pulses so far: polled until `count` have come, or a fixed window that proves none comes.
    const rumbles = async (count = 0) => {
      if (count) await page.waitForFunction((n) => globalThis.__pad.rumbles.length >= n, count, { timeout: patience(1000) });
      else await page.waitForTimeout(150);
      return ms(() => globalThis.__pad.rumbles.splice(0));
    };

    // 3D: RT pressed pulses 10 ms, its release reveals with no pulse; LT on a closed cube pulses at the
    // press and double-pulses as its release flags it.
    await ms(() => globalThis.__ms.start(6, 6, 6, 10));
    await ms(() => globalThis.__ms.forcePlay());
    await frames(2);
    const cell = await ms(() => globalThis.__ms.selected());
    assert.ok(cell >= 0, 'a cube is aimed');
    await hold(BTN.LT, true);
    assert.deepEqual(await rumbles(1), [10], 'the press pulse');
    await hold(BTN.LT, false);
    assert.deepEqual(await rumbles(2), [30, 30], 'a flag: two pulses');
    assert.equal(await ms(() => globalThis.__ms.info().minesLeft), 9);
    await ms(() => globalThis.__ms.click('right'));
    assert.equal(await ms(() => globalThis.__ms.info().minesLeft), 10, 'the mouse unflags');
    assert.deepEqual(await rumbles(), [], 'without a rumble');
    await tap(BTN.A);
    await tap(BTN.X);
    await tap(BTN.X);
    assert.deepEqual(await rumbles(), [], 'A and X do not pulse in 3D');
    await ms(() => globalThis.__ms.pause());
    await frames(2);
    await tap(BTN.RT);
    assert.deepEqual(await rumbles(), [], 'paused: nothing');

    // Classic 2D: RT pulses at the press; LT on a closed cell flags with the double pulse in place of the press pulse.
    await ms(() => globalThis.__ms.pauser.toMenu());
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'menu');
    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="beginner"]');
    await page.click('#c2d-play');
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    await frames(2);
    await hold(BTN.LT, true);
    assert.deepEqual(await rumbles(2), [30, 30]);
    await hold(BTN.LT, false);
    await tap(BTN.X);
    assert.deepEqual(await rumbles(2), [30, 30], 'X unflags: the double pulse');
    await hold(BTN.RT, true);
    assert.deepEqual(await rumbles(1), [10]);
    await hold(BTN.RT, false);
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    assert.deepEqual(await rumbles(), [], 'the release reveals without a pulse');
    await page.keyboard.press('KeyF');
    assert.deepEqual(await rumbles(), [], 'the keyboard never rumbles');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
  }
});
