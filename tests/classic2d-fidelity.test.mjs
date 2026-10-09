// Classic 2D input fidelity: the reference behaviours the Classic 2D board owns — which inputs
// chord, when a flag toggles, pressed feedback, releasing off the pressed cell and the largest
// custom board — against tests/fidelity/minesweeper-online.md, the committed record of Minesweeper
// Online with its default options. Each test cites its entry by heading and asserts the pointer
// state machine (js/classic2d/pointer-input.js) or the board setup (js/classic2d/board-setup.js)
// reproduces it, through the reference profile's markers (js/engine/profiles.js). The file is the
// oracle: a failure here is fixed in the game, apart from the one deliberate difference
// classic-2d-square-play § Architecture, Board setup records (a free cell on boards of up to 36
// cells). In a browser, press feedback and release-off-cell are checked on the real board.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname, extname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { BUTTON, pointerRules, createPointerInput } from '../js/classic2d/pointer-input.js';
import {
  customMineCap, maxMines, validateCustom, boardSetup,
} from '../js/classic2d/board-setup.js';
import { createSquareGrid } from '../js/engine/square-grid.js';
import { createGameWithMines, CELL } from '../js/engine/rules.js';
import { REFERENCE_PROFILE, getRuleProfile, CUSTOM_LIMITS } from '../js/engine/profiles.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROFILE = getRuleProfile(REFERENCE_PROFILE, 1);
const { LEFT, MIDDLE, RIGHT } = BUTTON;

// The observation file's entries: heading (without its trailing "(task …)" parenthetical) →
// { tags, body }.
const FILE = readFileSync(join(ROOT, 'tests', 'fidelity', 'minesweeper-online.md'), 'utf8');
const ENTRIES = new Map();
for (const part of FILE.split(/^### /m).slice(1)) {
  const nl = part.indexOf('\n');
  const line = part.slice(0, nl).trim();
  const m = /^(.*?)\s*\(([^)]*)\)$/.exec(line);
  ENTRIES.set(m ? m[1] : line, { tags: m ? m[2] : '', body: part.slice(nl + 1).trim().replace(/\s+/g, ' ') });
}

// The entry under `heading`, its body on one line; fails when the file has none.
function entry(heading) {
  const e = ENTRIES.get(heading);
  assert.ok(e, `tests/fidelity/minesweeper-online.md has no entry "${heading}"`);
  return e.body;
}

// The Classic 2D behaviours this file pins, one or more tests each, by the heading of the entry.
const PINNED = [
  'Chording: which inputs chord',
  'Flag timing',
  'Pressed feedback',
  'Releasing off the pressed cell',
  'Largest custom board',
];

// The profile markers the Classic 2D board reads, and the entry each must cite.
const MARKERS = {
  chordInputs: 'Chording: which inputs chord',
  revealInputs: 'Chording: which inputs chord',
  flagToggle: 'Flag timing',
  pressFeedback: 'Pressed feedback',
  releaseOffCell: 'Releasing off the pressed cell',
  customLimits: 'Largest custom board',
};

// ---------- harness ----------

// The pointer state machine over a real reference game from row strings ('*' a mine): every
// press set reported and every action applied.
function harness(rows) {
  const width = rows[0].length;
  const height = rows.length;
  const grid = createSquareGrid(width, height);
  const mines = [];
  rows.forEach((line, row) => [...line].forEach((ch, col) => { if (ch === '*') mines.push(grid.index(col, row)); }));
  const game = createGameWithMines({ graph: grid.graph, profile: REFERENCE_PROFILE, version: 1, mines, dimensions: { width, height } });
  const presses = [];
  const actions = [];
  const input = createPointerInput({
    graph: grid.graph,
    game: () => game,
    rules: pointerRules(PROFILE),
    onPress: (cells) => presses.push([...cells].sort((a, b) => a - b)),
    onAction: (kind, c) => { actions.push([kind, c]); game[kind](c); },
  });
  return {
    game,
    input,
    actions,
    at: (col, row) => grid.index(col, row),
    get pressed() { return presses.length ? presses[presses.length - 1] : []; },
    neighbours: (c) => [...grid.graph.neighbours(c)].sort((a, b) => a - b),
  };
}

// 5 × 4, a mine in the top-left corner: (1, 1) is a 1 with eight closed neighbours once revealed.
const CORNER = ['*....', '.....', '.....', '.....'];

// A harness with (1, 1) revealed as a 1.
function onNumber() {
  const h = harness(CORNER);
  const n = h.at(1, 1);
  h.game.reveal(n);
  assert.equal(h.game.cellState(n), CELL.REVEALED);
  assert.equal(h.game.cellNumber(n), 1);
  h.n = n;
  return h;
}

// ---------- the oracle ----------

test('fidelity: every Classic 2D input entry the file records is pinned here, and each marker cites its entry', () => {
  const recorded = [...ENTRIES].filter(([, e]) => /\btask 37\b/.test(e.tags)).map(([h]) => h);
  assert.deepEqual([...recorded].sort(), [...PINNED].sort());
  for (const [marker, heading] of Object.entries(MARKERS)) {
    assert.equal(PROFILE.fidelity[marker], heading, `profile marker ${marker} cites "${heading}"`);
    assert.ok(ENTRIES.has(heading), `"${heading}" is an entry of the fidelity file`);
  }
  // The pointer input reads exactly the reference profile's markers.
  assert.deepEqual(pointerRules(), pointerRules(PROFILE));
  assert.equal(CUSTOM_LIMITS, PROFILE.customLimits);
});

// ---------- Chording: which inputs chord ----------

test('fidelity "Chording: which inputs chord": the left release on a revealed number chords', () => {
  const body = entry('Chording: which inputs chord');
  assert.match(body, /default chording setting is "Left click": releasing the left button on a revealed number chords/);
  assert.ok(PROFILE.chordInputs.includes('left'));
  assert.ok(PROFILE.revealInputs.includes('left'));

  const h = onNumber();
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(LEFT, h.n);
  assert.deepEqual(h.actions, [], 'nothing on the press');
  h.input.up(LEFT, h.n);
  assert.deepEqual(h.actions, [['chord', h.n]]);
  assert.equal(h.game.cellState(h.at(2, 2)), CELL.REVEALED, 'the chord opened the neighbours');
});

test('fidelity "Chording: which inputs chord": the middle button behaves exactly like the left', () => {
  assert.match(entry('Chording: which inputs chord'), /middle button behaves exactly like the left \(chords on a number, opens a closed cell\)/);
  assert.ok(PROFILE.chordInputs.includes('middle'));
  assert.ok(PROFILE.revealInputs.includes('middle'));

  // Opens a closed cell on its release.
  const h = harness(CORNER);
  const c = h.at(3, 2);
  h.input.down(MIDDLE, c);
  assert.deepEqual(h.actions, []);
  h.input.up(MIDDLE, c);
  assert.deepEqual(h.actions, [['reveal', c]]);

  // Chords on a number.
  const k = onNumber();
  k.game.toggleFlag(k.at(0, 0));
  k.input.down(MIDDLE, k.n);
  k.input.up(MIDDLE, k.n);
  assert.deepEqual(k.actions, [['chord', k.n]]);
});

test('fidelity "Chording: which inputs chord": left + right chords through the left release, whichever went down first', () => {
  assert.match(entry('Chording: which inputs chord'), /Left \+ right also chords, through the left release/);
  assert.ok(PROFILE.chordInputs.includes('left+right'));

  for (const order of [[LEFT, RIGHT], [RIGHT, LEFT]]) {
    const h = onNumber();
    h.game.toggleFlag(h.at(0, 0));
    for (const b of order) h.input.down(b, h.n);
    h.input.up(RIGHT, h.n);
    assert.deepEqual(h.actions, [], 'the right release does nothing');
    h.input.up(LEFT, h.n);
    assert.deepEqual(h.actions, [['chord', h.n]], 'the left release chords');
  }

  // Left released first: the chord happens there, and the later right release does nothing.
  const h = onNumber();
  h.input.down(LEFT, h.n);
  h.input.down(RIGHT, h.n);
  h.input.up(LEFT, h.n);
  h.input.up(RIGHT, h.n);
  assert.deepEqual(h.actions, [['chord', h.n]]);
});

test('fidelity "Chording: which inputs chord": a right press on a number does nothing', () => {
  assert.match(entry('Chording: which inputs chord'), /A right press on a number does nothing/);
  assert.equal(PROFILE.rightPressOnNumber, 'nothing');

  const h = onNumber();
  h.input.down(RIGHT, h.n);
  h.input.up(RIGHT, h.n);
  assert.deepEqual(h.actions, []);
  assert.deepEqual(h.pressed, [], 'nothing shows pressed either');
  assert.equal(h.game.cellState(h.n), CELL.REVEALED);
});

// ---------- Flag timing ----------

test('fidelity "Flag timing": a flag toggles on the right press, not the release', () => {
  assert.match(entry('Flag timing'), /A flag toggles on right press, not release/);
  assert.equal(PROFILE.flagToggle, 'right-press');

  const h = harness(CORNER);
  const c = h.at(0, 0);
  h.input.down(RIGHT, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]]);
  assert.equal(h.game.cellState(c), CELL.FLAGGED, 'flagged on the press');
  h.input.up(RIGHT, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]], 'the release does nothing');

  h.input.down(RIGHT, c);
  assert.equal(h.game.cellState(c), CELL.CLOSED, 'the next press removes it');
  h.input.up(RIGHT, c);
  assert.equal(h.actions.length, 2);
});

test('fidelity "Flag timing": a right press while left is held on a closed cell toggles its flag', () => {
  assert.match(entry('Flag timing'), /Pressing right while left is held on a closed cell toggles its flag/);

  const h = harness(CORNER);
  const c = h.at(0, 0);
  h.input.down(LEFT, c);
  assert.deepEqual(h.pressed, [c]);
  h.input.down(RIGHT, c);
  assert.deepEqual(h.actions, [['toggleFlag', c]]);
  assert.equal(h.game.cellState(c), CELL.FLAGGED);
  assert.deepEqual(h.pressed, [], 'a flagged cell shows nothing pressed');
});

// ---------- Pressed feedback ----------

test('fidelity "Pressed feedback": left or middle on a closed, unflagged cell shows that cell pressed', () => {
  assert.match(entry('Pressed feedback'), /Left or middle held on a closed, unflagged cell shows that cell pressed/);
  assert.equal(PROFILE.pressFeedback.closed, 'cell');

  for (const button of [LEFT, MIDDLE]) {
    const h = harness(CORNER);
    const c = h.at(3, 2);
    h.input.down(button, c);
    assert.deepEqual(h.pressed, [c]);
    h.input.up(button, c);
    assert.deepEqual(h.pressed, [], 'the release clears it');
  }

  // The right button alone shows nothing.
  const h = harness(CORNER);
  h.input.down(RIGHT, h.at(3, 2));
  assert.deepEqual(h.pressed, []);
});

test('fidelity "Pressed feedback": on a flagged cell nothing shows', () => {
  assert.match(entry('Pressed feedback'), /on a flagged cell nothing shows/);
  assert.equal(PROFILE.pressFeedback.flagged, 'none');

  for (const button of [LEFT, MIDDLE]) {
    const h = harness(CORNER);
    const c = h.at(0, 0);
    h.game.toggleFlag(c);
    h.input.down(button, c);
    assert.deepEqual(h.pressed, []);
    h.input.up(button, c);
    assert.deepEqual(h.actions, []);
  }
});

test('fidelity "Pressed feedback": on a revealed number its closed unflagged neighbours show, whatever the flag count, the number itself not', () => {
  const body = entry('Pressed feedback');
  assert.match(body, /Held on a revealed number, its closed unflagged neighbours show pressed, whether or not the flag count matches/);
  assert.match(body, /The number itself is not highlighted by default/);
  assert.equal(PROFILE.pressFeedback.number, 'closed-unflagged-neighbours');

  // No flag: the count differs, every closed neighbour shows.
  for (const button of [LEFT, MIDDLE]) {
    const h = onNumber();
    h.input.down(button, h.n);
    assert.deepEqual(h.pressed, h.neighbours(h.n));
    assert.ok(!h.pressed.includes(h.n), 'the number itself is not highlighted');
  }

  // Two flags on a 1: the count differs the other way; the flagged neighbours drop out.
  const h = onNumber();
  const flags = [h.at(0, 0), h.at(2, 2)];
  for (const f of flags) h.game.toggleFlag(f);
  h.input.down(LEFT, h.n);
  assert.deepEqual(h.pressed, h.neighbours(h.n).filter((c) => !flags.includes(c)));
});

test('fidelity "Pressed feedback": a left + right chord shows the same preview', () => {
  const h = onNumber();
  h.game.toggleFlag(h.at(0, 0));
  h.input.down(LEFT, h.n);
  h.input.down(RIGHT, h.n);
  assert.deepEqual(h.pressed, h.neighbours(h.n).filter((c) => c !== h.at(0, 0)));
  h.input.up(LEFT, h.n);
  assert.deepEqual(h.pressed, []);
});

// ---------- Releasing off the pressed cell ----------

test('fidelity "Releasing off the pressed cell": moving off un-presses the cell and clears a chord preview', () => {
  assert.match(entry('Releasing off the pressed cell'), /Moving off the cell un-presses it and clears its chord preview/);
  assert.equal(PROFILE.releaseOffCell, 'press-follows-pointer');

  const h = harness(CORNER);
  const c = h.at(3, 2);
  h.input.down(LEFT, c);
  h.input.move(h.at(4, 2));
  assert.ok(!h.pressed.includes(c), 'the first cell is un-pressed');

  const k = onNumber();
  k.input.down(LEFT, k.n);
  assert.equal(k.pressed.length, 8);
  k.input.move(-1);
  assert.deepEqual(k.pressed, [], 'the chord preview clears');
});

test('fidelity "Releasing off the pressed cell": moving onto another cell presses it, and the release acts there', () => {
  assert.match(entry('Releasing off the pressed cell'), /Moving onto another cell while holding presses that cell instead, and releasing there opens or chords that cell/);

  // Opens the cell released on.
  const h = harness(CORNER);
  const from = h.at(4, 0);
  const to = h.at(3, 3);
  h.input.down(LEFT, from);
  h.input.move(to);
  assert.deepEqual(h.pressed, [to]);
  h.input.up(LEFT, to);
  assert.deepEqual(h.actions, [['reveal', to]]);

  // Chords the number released on, its preview following the pointer.
  const k = onNumber();
  k.game.toggleFlag(k.at(0, 0));
  k.input.down(LEFT, k.at(4, 3));
  k.input.move(k.n);
  assert.deepEqual(k.pressed, k.neighbours(k.n).filter((c) => c !== k.at(0, 0)));
  k.input.up(LEFT, k.n);
  assert.deepEqual(k.actions, [['chord', k.n]]);
});

test('fidelity "Releasing off the pressed cell": releasing off the board does nothing', () => {
  assert.match(entry('Releasing off the pressed cell'), /Releasing off the board does nothing/);

  for (const button of [LEFT, MIDDLE]) {
    const h = harness(CORNER);
    h.input.down(button, h.at(3, 2));
    h.input.move(-1);
    assert.deepEqual(h.pressed, []);
    h.input.up(button, -1);
    assert.deepEqual(h.actions, []);
  }

  // A left + right chord released off the board does nothing either.
  const k = onNumber();
  k.input.down(LEFT, k.n);
  k.input.down(RIGHT, k.n);
  k.input.move(-1);
  k.input.up(RIGHT, -1);
  k.input.up(LEFT, -1);
  assert.deepEqual(k.actions, []);
});

// ---------- Largest custom board ----------

// The entry's numbers: the side range, the every-cell bound and the measured [cells, cap] points.
function measured() {
  const body = entry('Largest custom board');
  const sides = /Width and height are (\d+)–(\d+) each; larger values are refused/.exec(body);
  const every = /Boards of up to (\d+) cells take a mine in every cell/.exec(body);
  assert.ok(sides && every, 'the entry states the side range and the every-cell bound');
  const points = [...body.matchAll(/(\d+)×(\d+) → (\d+)/g)].map(([, w, h, cap]) => ({ width: +w, height: +h, cap: +cap }));
  assert.ok(points.length >= 2, 'the entry lists measured boards');
  return { minSide: +sides[1], maxSide: +sides[2], everyCellUpTo: +every[1], points };
}

test('fidelity "Largest custom board": width and height 1 to 100 each, larger refused', () => {
  const { minSide, maxSide } = measured();
  assert.equal(CUSTOM_LIMITS.minSide, minSide);
  assert.equal(CUSTOM_LIMITS.maxSide, maxSide);

  for (const [width, height] of [[minSide, minSide], [maxSide, maxSide], [maxSide, minSide], [minSide, maxSide]]) {
    assert.deepEqual(validateCustom({ width, height, mines: 0 }), { ok: true });
  }
  assert.equal(validateCustom({ width: maxSide + 1, height: 10, mines: 1 }).field, 'width');
  assert.equal(validateCustom({ width: 10, height: maxSide + 1, mines: 1 }).field, 'height');
  assert.equal(validateCustom({ width: minSide - 1, height: 10, mines: 1 }).field, 'width');
  assert.equal(validateCustom({ width: 10, height: minSide - 1, mines: 1 }).field, 'height');
  assert.throws(() => boardSetup({ size: 'custom', custom: { width: maxSide + 1, height: maxSide, mines: 1 }, noGuess: false }), RangeError);

  const largest = boardSetup({ size: 'custom', custom: { width: maxSide, height: maxSide, mines: maxMines(maxSide, maxSide) }, noGuess: false });
  assert.deepEqual([largest.grid.width, largest.grid.height], [maxSide, maxSide]);
});

test('fidelity "Largest custom board": the mine cap at every measured board', () => {
  const { points } = measured();
  assert.deepEqual(CUSTOM_LIMITS.mineCaps.map(([cells, cap]) => [cells, cap]), points.map((p) => [p.width * p.height, p.cap]));

  for (const { width, height, cap } of points) {
    assert.equal(customMineCap(width, height), cap, `${width}×${height}: the site's cap`);
    assert.equal(maxMines(width, height), cap, `${width}×${height}: the cap is the most mines here`);
    assert.deepEqual(validateCustom({ width, height, mines: cap }), { ok: true }, `${width}×${height} takes ${cap}`);
    assert.equal(validateCustom({ width, height, mines: cap + 1 }).field, 'mines', `${width}×${height} refuses ${cap + 1}`);
  }
});

test('fidelity "Largest custom board": up to 36 cells the cap is the cell count minus one, not every cell (the recorded deliberate difference)', () => {
  const { everyCellUpTo } = measured();
  assert.equal(CUSTOM_LIMITS.everyCellUpTo, everyCellUpTo);
  const feature = readFileSync(join(ROOT, '.claude', 'domain', 'features', 'classic-2d-square-play.md'), 'utf8').replace(/\s+/g, ' ');
  assert.match(feature, /The site takes a mine in every cell on boards of up to 36 cells; this game keeps one cell free so the first click is always safe — a deliberate difference from the reference/);

  for (const [width, height] of [[1, 1], [1, 2], [3, 3], [5, 5], [6, 6], [4, 9], [1, 36]]) {
    const cells = width * height;
    assert.ok(cells <= everyCellUpTo);
    assert.equal(customMineCap(width, height), cells, `${width}×${height}: the site takes a mine in every cell`);
    assert.equal(maxMines(width, height), cells - 1, `${width}×${height}: this game keeps one cell free`);
    assert.deepEqual(validateCustom({ width, height, mines: cells - 1 }), { ok: true });
    assert.equal(validateCustom({ width, height, mines: cells }).field, 'mines', `${width}×${height} refuses a mine in every cell`);
  }
});

// ---------------------------------------------------------------- browser

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' };

function serve() {
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const path = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!path.startsWith(ROOT) || !existsSync(path) || statSync(path).isDirectory()) {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
    res.end(readFileSync(path));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try {
      return await import(pathToFileURL(global).href);
    } catch {
      return null;
    }
  }
}

// Runs in the page: the drawn fill of a Beginner tile (col, row), sampled inside its edge, as the
// tile token it matches ('closed', 'pressed', 'revealed') or the raw colour.
async function tileFill([col, row]) {
  const { boardLayout } = await import('/js/classic2d/board-view.js');
  const canvas = document.querySelector('#c2d-board canvas');
  const box = canvas.getBoundingClientRect();
  const layout = boardLayout({ cols: 9, rows: 9, width: box.width, height: box.height });
  const ratio = canvas.width / box.width;
  const x = Math.round((layout.offsetX + col * layout.tile + layout.tile * 0.2) * ratio);
  const y = Math.round((layout.offsetY + row * layout.tile + layout.tile * 0.2) * ratio);
  const [r, g, b] = canvas.getContext('2d').getImageData(x, y, 1, 1).data;
  const style = getComputedStyle(document.documentElement);
  for (const name of ['closed', 'pressed', 'revealed']) {
    const hex = style.getPropertyValue(`--color-tile-${name}`).trim().replace('#', '');
    const t = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    if (Math.abs(t[0] - r) + Math.abs(t[1] - g) + Math.abs(t[2] - b) <= 6) return name;
  }
  return `rgb(${r}, ${g}, ${b})`;
}

test('fidelity in a browser: press feedback and releasing off the pressed cell on the real board', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) {
    t.skip('Playwright is not installed');
    return;
  }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1366, height: 768 }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    await page.click('#menu-entry-classic-2d');
    await page.click('#c2d-choice [data-size="beginner"]');
    assert.equal(await page.evaluate(() => globalThis.__ms.state.mode), 'classic-2d');

    const fill = (col, row) => page.evaluate(tileFill, [col, row]);
    const centre = (col, row) => page.evaluate(async ([c, r]) => {
      const { boardLayout } = await import('/js/classic2d/board-view.js');
      const box = document.querySelector('#c2d-board canvas').getBoundingClientRect();
      const l = boardLayout({ cols: 9, rows: 9, width: box.width, height: box.height });
      return { x: box.left + l.offsetX + (c + 0.5) * l.tile, y: box.top + l.offsetY + (r + 0.5) * l.tile };
    }, [col, row]);
    const moveTo = async (col, row) => { const p = await centre(col, row); await page.mouse.move(p.x, p.y, { steps: 2 }); };
    const started = () => page.evaluate(() => globalThis.__ms.modes.state.started);

    assert.equal(await fill(4, 4), 'closed');

    // "Pressed feedback": the held cell shows pressed, for the left and the middle button.
    await moveTo(4, 4);
    await page.mouse.down();
    assert.equal(await fill(4, 4), 'pressed', 'left held shows the cell pressed');
    assert.equal(await fill(5, 4), 'closed');

    // "Releasing off the pressed cell": moving onto another cell presses it instead...
    await moveTo(5, 4);
    assert.equal(await fill(4, 4), 'closed', 'the cell left is un-pressed');
    assert.equal(await fill(5, 4), 'pressed', 'the cell moved onto shows pressed');

    // ...moving off the board un-presses it, and releasing there does nothing.
    const box = await page.locator('#c2d-board canvas').boundingBox();
    await page.mouse.move(box.x + 2, box.y + 2, { steps: 2 });
    assert.equal(await fill(5, 4), 'closed', 'off the board nothing is pressed');
    await page.mouse.up();
    assert.equal(await started(), false, 'the release off the board did nothing');
    assert.equal(await fill(5, 4), 'closed');

    await moveTo(2, 6);
    await page.mouse.down({ button: 'middle' });
    assert.equal(await fill(2, 6), 'pressed', 'middle held shows the cell pressed');
    await page.mouse.move(box.x + 2, box.y + 2, { steps: 2 });
    await page.mouse.up({ button: 'middle' });
    assert.equal(await started(), false);

    // A press moved to another cell and released there opens that cell: the first click lands there.
    await moveTo(1, 1);
    await page.mouse.down();
    await moveTo(6, 6);
    assert.equal(await fill(1, 1), 'closed');
    assert.equal(await fill(6, 6), 'pressed');
    await page.mouse.up();
    await page.waitForFunction(() => globalThis.__ms.modes.state.started);
    await page.waitForFunction(async () => {
      const { boardLayout } = await import('/js/classic2d/board-view.js');
      const canvas = document.querySelector('#c2d-board canvas');
      const b = canvas.getBoundingClientRect();
      const l = boardLayout({ cols: 9, rows: 9, width: b.width, height: b.height });
      const ratio = canvas.width / b.width;
      const [r] = canvas.getContext('2d').getImageData(
        Math.round((l.offsetX + 6.2 * l.tile) * ratio), Math.round((l.offsetY + 6.2 * l.tile) * ratio), 1, 1).data;
      return r > 0xe0; // the revealed tile, far lighter than closed or pressed
    }, null, { timeout: 10000 });
    assert.equal(await fill(6, 6), 'revealed', 'the cell released on opened');
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
