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
  // One frame held, so a slow frame never reaches the menus' auto-repeat.
  const tap = async (button) => {
    await ms((b) => globalThis.__pad.press(b, true), button);
    await frames(1);
    await hold(button, false);
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

test('in a browser, the D-pad walks every control of the 2D board choice and the 3D board choice as before', async (t) => {
  const env = await suite.open(t);
  if (!env) return;
  const { browser, base } = env;
  try {
    const { page, errors, ms, tap, focused, walk } = await open(browser, base);

    // Classic 2D: Down walks the sizes into the custom row; Left / Right walk the row; Down reaches the switch, then Back.
    await page.click('#menu-entry-classic-2d');
    await ms(() => document.querySelector('#c2d-choice [data-size="beginner"]').focus());
    assert.equal(await focused(), 'beginner');
    assert.deepEqual(await walk(['down', 'down', 'down']), ['intermediate', 'expert', 'c2d-width']);
    assert.deepEqual(await walk(['right', 'right', 'right']), ['c2d-height', 'c2d-mines', 'c2d-start']);
    assert.deepEqual(await walk(['left', 'left', 'left']), ['c2d-mines', 'c2d-height', 'c2d-width']);
    assert.deepEqual(await walk(['down', 'down', 'down']), ['c2d-noguess', 'c2d-choice-back', 'c2d-choice-back'], 'no wrap past Back');
    assert.deepEqual(await walk(['up', 'up', 'up', 'up', 'up', 'up']), ['c2d-noguess', 'c2d-width', 'expert', 'intermediate', 'beginner', 'beginner'],
      'Up retraces the walk');
    // From any control of the custom row, Down goes on to the switch.
    for (const id of ['c2d-height', 'c2d-mines', 'c2d-start']) {
      await ms((i) => document.getElementById(i).focus(), id);
      assert.deepEqual(await walk(['down']), ['c2d-noguess'], `Down from #${id}`);
    }
    // Every focusable control on the screen is reached by the D-pad alone.
    const all = await ms(() => [...document.querySelectorAll('#c2d-choice button, #c2d-choice input')].map((e) => e.id || e.dataset.size));
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

    // 3D: the walk pinned as it stood before the DOM-order fallback.
    await page.click('#menu-entry-3d');
    await ms(() => document.querySelector('#board-choice [data-preset="6,6,6,10"]').focus());
    assert.deepEqual(await walk(['down', 'down', 'down', 'down', 'down', 'down']),
      ['8,8,8,40', '12,12,8,130', 'bc-noguess', 'c-x', 'c-noguess', 'board-choice-back']);
    assert.deepEqual(await walk(['up', 'up', 'up', 'up', 'up', 'up']),
      ['c-noguess', 'c-x', 'bc-noguess', '12,12,8,130', '8,8,8,40', '6,6,6,10']);
    await ms(() => document.getElementById('c-x').focus());
    assert.deepEqual(await walk(['right', 'right', 'right', 'right', 'right']), ['c-y', 'c-z', 'c-m', 'c-random', 'c-start']);
    assert.deepEqual(await walk(['left', 'left', 'left', 'left', 'left']), ['c-random', 'c-m', 'c-z', 'c-y', 'c-x']);
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

test('in a browser, the Records walk stops on every Watch, Download, Pin and Delete, and Right from "Pinned first" enters the replays', async (t) => {
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
      return table ? `${table.id}:${[...table.querySelectorAll('button')].indexOf(e)}` : e.id || e.dataset.value || e.textContent.trim();
    });
    const tableButtons = await ms(() => ['records-games', 'records-replays-table'].flatMap((id) =>
      [...document.querySelectorAll(`#${id} button`)].map((_, i) => `${id}:${i}`)));
    assert.equal(tableButtons.length, 10, 'two Watch in the games list, a Watch, a Download, a Pin and a Delete on each replay');

    // Down from the picker visits every table button, table by table in DOM order, before Back.
    await ms(() => document.querySelector('#records-picker [aria-checked="true"]').focus());
    const down = [];
    for (let i = 0; i < 30 && (await focused()) !== 'records-back'; i++) { await tap(BTN.DOWN); down.push(await key()); }
    assert.equal(down.at(-1), 'records-back', 'Down reaches Back');
    assert.deepEqual(down.filter((k) => tableButtons.includes(k)), tableButtons, 'each Watch, Download, Pin and Delete a stop, in DOM order');
    // Up retraces them.
    const up = [];
    for (let i = 0; i < 30 && !(await ms(() => !!document.activeElement.closest('#records-picker'))); i++) { await tap(BTN.UP); up.push(await key()); }
    assert.deepEqual(up.filter((k) => tableButtons.includes(k)), [...tableButtons].reverse(), 'Up visits them in reverse');

    // Right from "Pinned first" goes to Open replay file beside it, then on into the replays table's first button, never to Back.
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

    // A on Watch opens the replay viewer, as a click does.
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
    await ms(() => document.getElementById('records-pinned-first').focus());
    await tap(BTN.LB);
    assert.equal(await board(), order[0], 'LB at the first board: held');
    await tap(BTN.RB);
    assert.equal(await board(), order[1], 'RB: the next board');
    assert.equal(await ms(() => document.activeElement.id), 'records-pinned-first', 'focus stays on a control that still exists');
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
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'replay' && !document.getElementById('replay-controls').classList.contains('hidden'));
    const hint = () => ms(() => { const e = document.getElementById('rp-seek-pad'); return [e.textContent.replace(/\s+/g, ' ').trim(), getComputedStyle(e).visibility]; });
    assert.equal((await hint())[1], 'hidden', 'hidden with the mouse');
    // The seek bar is on the viewer's D-pad walk.
    let reached = false;
    for (let i = 0; i < 12 && !reached; i++) { await tap(BTN.DOWN); reached = await ms(() => document.activeElement?.id === 'rp-seek'); }
    assert.equal(reached, true, 'Down reaches the seek bar');
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
    const rumbles = async () => { await page.waitForTimeout(150); return ms(() => globalThis.__pad.rumbles.splice(0)); };

    // 3D: RT pressed pulses 10 ms, its release reveals with no pulse; LT on a closed cube pulses at the
    // press and double-pulses as its release flags it.
    await ms(() => globalThis.__ms.start(6, 6, 6, 10));
    await ms(() => globalThis.__ms.forcePlay());
    await frames(2);
    const cell = await ms(() => globalThis.__ms.selected());
    assert.ok(cell >= 0, 'a cube is aimed');
    await hold(BTN.LT, true);
    assert.deepEqual(await rumbles(), [10], 'the press pulse');
    await hold(BTN.LT, false);
    assert.deepEqual(await rumbles(), [30, 30], 'a flag: two pulses');
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
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'classic-2d');
    await frames(2);
    await hold(BTN.LT, true);
    assert.deepEqual(await rumbles(), [30, 30]);
    await hold(BTN.LT, false);
    await tap(BTN.X);
    assert.deepEqual(await rumbles(), [30, 30], 'X unflags: the double pulse');
    await hold(BTN.RT, true);
    assert.deepEqual(await rumbles(), [10]);
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
