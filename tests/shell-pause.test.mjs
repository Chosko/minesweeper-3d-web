import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createModeHost } from '../js/shell/mode-host.js';
import { createPauseController, PAUSE_SOURCES, AUTO_SOURCES, HAND_OFFS, CONFIRMATIONS } from '../js/shell/pause.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SRC = read('js/shell/pause.js');

// A fake mode behind the real host: records every contract call; `play` drives its game.
function fakeMode() {
  const calls = [];
  let report = null;
  let game = null;
  const mode = {
    openBoardChoice() { calls.push(['openBoardChoice']); },
    start(choice) { calls.push(['start', choice]); game = { choice, started: false, outcome: null, time: 0 }; },
    pause(opts) { calls.push(['pause', opts]); },
    resume(opts) { calls.push(['resume', opts]); },
    restart(opts) { calls.push(['restart', opts]); game = { ...game, started: false, outcome: null, time: 0 }; },
    leave() { calls.push(['leave']); game = null; },
    summary() {
      if (!game || !game.started) return null;
      return { mode: 'fake', outcome: game.outcome ?? 'abandoned', choice: game.choice, time: game.time };
    },
  };
  const play = {
    click() { game.started = true; report.started(); report.canPause(true); },
    tick(t) { game.time = t; },
    end(outcome) { game.outcome = outcome; report.canPause(false); report.finished(mode.summary()); },
    fail() { report.failed('broken'); },
  };
  return { factory: (r) => { report = r; return mode; }, calls, play };
}

// The controller over a host with one fake mode, and a recording shell around it.
function setup() {
  const modes = createModeHost();
  const fake = fakeMode();
  modes.register('a', fake.factory);
  const shell = { cards: [], asked: [], menus: 0, guard: [], paused: false, onBoard: true, answer: true, generating: false, cancels: 0 };
  const handOffs = [];
  const pauser = createPauseController({
    modes,
    showCard: (o) => { shell.cards.push(o); shell.paused = true; },
    isPaused: () => shell.paused,
    onBoard: () => shell.onBoard,
    confirm: (req, proceed) => { shell.asked.push(req); if (shell.answer) proceed(); },
    goMenu: () => { shell.menus++; },
    guard: (on) => shell.guard.push(on),
    cancelGeneration: () => {
      if (!shell.generating) return false;
      shell.generating = false;
      shell.cancels += 1;
      return true;
    },
  });
  for (const h of HAND_OFFS) pauser.attach(h, (summary, mode) => handOffs.push([h, summary, mode]));
  const calls = () => fake.calls.map(([c]) => c);
  return { modes, fake, shell, pauser, handOffs, calls };
}

// ---------------------------------------------------------------- the vocabulary

test('the pause sources, the automatic ones, the hand-offs and the confirmations', () => {
  assert.deepEqual([...PAUSE_SOURCES], ['key', 'pad', 'button', 'blur', 'hidden']);
  assert.deepEqual([...AUTO_SOURCES], ['blur', 'hidden']);
  assert.deepEqual([...HAND_OFFS], ['finished', 'abandoned', 'inProgress']);
  for (const c of Object.values(CONFIRMATIONS)) assert.match(c.message, /count as a loss/);
  assert.deepEqual(Object.keys(CONFIRMATIONS), ['restart', 'menu']);
});

// ---------------------------------------------------------------- pause rules

test('every asked-for source pauses a started, unfinished game through the mode and shows the card', () => {
  for (const source of ['key', 'pad', 'button']) {
    const { modes, fake, shell, pauser, calls } = setup();
    modes.start('a', 1);
    fake.play.click();
    assert.equal(pauser.inProgress, true);
    assert.equal(pauser.pause(source, { note: 'n' }), true);
    assert.deepEqual(fake.calls.at(-1), ['pause', { note: 'n', source }]);
    assert.deepEqual(shell.cards, [{ note: 'n' }]);
    assert.deepEqual(calls().filter((c) => c === 'pause'), ['pause']);
  }
});

test('window blur and tab hide pause a started, unfinished game in play', () => {
  for (const source of AUTO_SOURCES) {
    const { modes, fake, shell, pauser } = setup();
    modes.start('a', 1);
    fake.play.click();
    assert.equal(pauser.pause(source), true);
    assert.deepEqual(fake.calls.at(-1), ['pause', { note: '', source }]);
    assert.equal(shell.cards.length, 1);
  }
});

test('before the first click the pause key opens the card with no timer to stop; blur and hide do nothing', () => {
  const { modes, shell, pauser, calls } = setup();
  modes.start('a', 1);
  assert.equal(pauser.inProgress, false);
  for (const source of AUTO_SOURCES) assert.equal(pauser.pause(source), false);
  assert.deepEqual(shell.cards, []);
  assert.equal(pauser.pause('key'), true);
  assert.deepEqual(shell.cards, [{ note: '' }]);
  assert.ok(!calls().includes('pause'), 'the mode is not asked to pause');
});

test('Back (Esc, the controller\'s back button) while a board is generated cancels it and opens no pause card', () => {
  for (const source of ['key', 'pad']) {
    const { modes, shell, pauser, calls } = setup();
    modes.start('a', 1);
    shell.generating = true; // the first click's board is being generated, card shown or not
    assert.equal(pauser.back(source), false, `${source}: no pause card`);
    assert.equal(shell.cancels, 1, `${source}: the generation is cancelled`);
    assert.deepEqual(shell.cards, []);
    assert.ok(!calls().includes('pause'));
    // With nothing being generated, Back pauses as it always did.
    assert.equal(pauser.back(source), true, `${source}: Back pauses otherwise`);
    assert.deepEqual(shell.cards, [{ note: '' }]);
    assert.equal(shell.cancels, 1);
  }
});

test('the pause button, Start, focus loss and tab hide still pause while a board is generated', () => {
  for (const source of ['button', 'pad', 'key']) {
    const { modes, shell, pauser } = setup();
    modes.start('a', 1);
    shell.generating = true;
    assert.equal(pauser.pause(source), true, `${source}: pause() itself never cancels`);
    assert.equal(shell.cancels, 0);
    assert.equal(shell.generating, true);
  }
  for (const source of AUTO_SOURCES) {
    const { modes, shell, pauser } = setup();
    modes.start('a', 1);
    shell.generating = true;
    assert.equal(pauser.pause(source), false, `${source}: as before the first click, nothing to pause`);
    assert.equal(shell.cancels, 0, `${source} never cancels`);
  }
  const { modes, fake, shell, pauser } = setup();
  modes.start('a', 1);
  fake.play.click();
  assert.equal(pauser.back('key'), true, 'Back in a started game pauses');
  assert.equal(shell.cancels, 0);
});

test('after the game ends the pause key opens the card only; blur and hide do nothing', () => {
  const { modes, fake, shell, pauser, calls } = setup();
  modes.start('a', 1);
  fake.play.click();
  fake.play.end('lost');
  assert.equal(pauser.inProgress, false);
  for (const source of AUTO_SOURCES) assert.equal(pauser.pause(source), false);
  assert.equal(pauser.pause('pad'), true);
  assert.equal(shell.cards.length, 1);
  assert.ok(!calls().includes('pause'));
});

test('automatic pause waits for the board to be in play, and nothing pauses twice', () => {
  const { modes, fake, shell, pauser, calls } = setup();
  modes.start('a', 1);
  fake.play.click();
  shell.onBoard = false;
  assert.equal(pauser.pause('blur'), false, 'the board is not in play (the click-to-play card)');
  shell.onBoard = true;
  assert.equal(pauser.pause('hidden'), true);
  for (const source of PAUSE_SOURCES) assert.equal(pauser.pause(source), false, `${source} while the card shows`);
  assert.equal(calls().filter((c) => c === 'pause').length, 1);
  assert.equal(shell.cards.length, 1);
});

test('with no active mode nothing pauses, and an unknown source is refused', () => {
  const { shell, pauser } = setup();
  for (const source of PAUSE_SOURCES) assert.equal(pauser.pause(source), false);
  assert.deepEqual(shell.cards, []);
  assert.throws(() => pauser.pause('elbow'), /unknown pause source/);
});

test('resume goes through the mode with its source', () => {
  const { modes, fake, shell, pauser } = setup();
  pauser.resume('pad');
  assert.deepEqual(fake.calls, [], 'no active mode: nothing to resume');
  modes.start('a', 1);
  fake.play.click();
  pauser.pause('key');
  shell.paused = false;
  pauser.resume('pad');
  pauser.resume();
  assert.deepEqual(fake.calls.slice(-2), [['resume', { source: 'pad' }], ['resume', { source: 'pointer' }]]);
});

// ---------------------------------------------------------------- restart and back to menu

test('restart of a started, unfinished game asks first, saying it counts as a loss', () => {
  const { modes, fake, shell, pauser, handOffs, calls } = setup();
  modes.start('a', 7);
  fake.play.click();
  shell.answer = false;
  pauser.restart('pad');
  assert.deepEqual(shell.asked, [CONFIRMATIONS.restart]);
  assert.ok(!calls().includes('restart'), 'declined: the game goes on');
  assert.equal(pauser.inProgress, true);
  shell.answer = true;
  pauser.restart('pad');
  assert.deepEqual(fake.calls.at(-1), ['restart', { source: 'pad' }]);
  assert.deepEqual(handOffs.filter(([h]) => h === 'abandoned').map(([, s]) => s.outcome), ['abandoned']);
  assert.equal(pauser.inProgress, false);
  assert.equal(shell.menus, 0, 'restart stays in the mode');
});

test('restart before the first click or after the end asks nothing', () => {
  const { modes, fake, shell, pauser } = setup();
  modes.start('a', 1);
  pauser.restart();
  fake.play.click();
  fake.play.end('won');
  pauser.restart('key');
  assert.deepEqual(shell.asked, []);
  assert.deepEqual(fake.calls.filter(([c]) => c === 'restart'), [['restart', { source: 'pointer' }], ['restart', { source: 'key' }]]);
});

test('back to menu of a started, unfinished game asks first, then leaves the mode', () => {
  const { modes, fake, shell, pauser, handOffs, calls } = setup();
  modes.start('a', 1);
  fake.play.click();
  shell.answer = false;
  pauser.toMenu();
  assert.deepEqual(shell.asked, [CONFIRMATIONS.menu]);
  assert.equal(shell.menus, 0);
  assert.equal(modes.active, 'a');
  shell.answer = true;
  pauser.toMenu();
  assert.equal(shell.menus, 1);
  assert.equal(modes.active, null);
  assert.equal(calls().at(-1), 'leave');
  assert.equal(handOffs.filter(([h]) => h === 'abandoned').length, 1);
});

test('back to menu before the first click or after the end asks nothing', () => {
  const a = setup();
  a.modes.start('a', 1);
  a.pauser.toMenu();
  assert.deepEqual(a.shell.asked, []);
  assert.equal(a.shell.menus, 1);
  const b = setup();
  b.modes.start('a', 1);
  b.fake.play.click();
  b.fake.play.end('won');
  b.pauser.toMenu();
  assert.deepEqual(b.shell.asked, []);
  assert.equal(b.shell.menus, 1);
  assert.equal(b.handOffs.filter(([h]) => h === 'abandoned').length, 0, 'a finished game is never abandoned');
});

// ---------------------------------------------------------------- hand-offs

test('game finished hands the summary off; the controller itself routes nowhere', () => {
  const { modes, fake, shell, handOffs } = setup();
  modes.start('a', 1);
  fake.play.click();
  fake.play.end('won');
  assert.deepEqual(handOffs.at(-1), ['finished', { mode: 'fake', outcome: 'won', choice: 1, time: 0 }, 'a']);
  assert.deepEqual(shell.cards, [], 'no pause card: the results flow attached to the hand-off shows the results');
  assert.doesNotMatch(SRC, /router/, 'the results flow, not the controller, routes to the results screen');
});

test('the in-progress hand-off gets the summary at game started, at every pause and on pagehide', () => {
  const { modes, fake, shell, pauser, handOffs } = setup();
  const kept = () => handOffs.filter(([h]) => h === 'inProgress').map(([, s, m]) => [s.time, s.outcome, m]);
  modes.start('a', 1);
  pauser.pageHide();
  pauser.pause('key');
  assert.deepEqual(kept(), [], 'nothing before the first click');
  shell.paused = false;
  fake.play.click();
  assert.deepEqual(kept(), [[0, 'abandoned', 'a']]);
  fake.play.tick(4);
  pauser.pause('blur');
  shell.paused = false;
  fake.play.tick(9);
  pauser.pause('button');
  fake.play.tick(11);
  pauser.pageHide();
  assert.deepEqual(kept(), [[0, 'abandoned', 'a'], [4, 'abandoned', 'a'], [9, 'abandoned', 'a'], [11, 'abandoned', 'a']]);
  fake.play.end('won');
  pauser.pageHide();
  assert.equal(kept().length, 4, 'a finished game is no longer in progress');
});

test('the leave-page guard is armed only while a game is started and unfinished', () => {
  const { modes, fake, shell, pauser } = setup();
  modes.start('a', 1);
  assert.deepEqual(shell.guard, []);
  fake.play.click();
  assert.deepEqual(shell.guard, [true]);
  fake.play.end('won');
  assert.deepEqual(shell.guard, [true, false]);
  pauser.restart();
  fake.play.click();
  pauser.toMenu();
  assert.deepEqual(shell.guard, [true, false, true, false], 'abandoned disarms it');
  modes.start('a', 1);
  fake.play.click();
  fake.play.fail();
  assert.deepEqual(shell.guard.at(-1), false, 'a failed mode disarms it');
});

test('a hand-off listener can detach, a throwing one does not stop the others, an unknown one is refused', () => {
  const { modes, fake, pauser } = setup();
  const seen = [];
  const off = pauser.attach('inProgress', () => seen.push('first'));
  pauser.attach('inProgress', () => { throw new Error('listener'); });
  pauser.attach('inProgress', () => seen.push('third'));
  modes.start('a', 1);
  fake.play.click();
  off();
  pauser.pageHide();
  assert.deepEqual(seen, ['first', 'third', 'third']);
  assert.throws(() => pauser.attach('nope', () => {}), /unknown hand-off/);
});

test('the pause controller is DOM-free and documents its rules and hand-offs', () => {
  const raw = read('js/shell/pause.js');
  const src = raw.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
  assert.doesNotMatch(src, /\b(document|window|navigator)\b/);
  assert.doesNotMatch(src, /^import /m);
  const head = raw.split('export ')[0];
  for (const word of [...HAND_OFFS, 'blur', 'hidden', 'pagehide', 'confirmation', 'leave-page guard']) assert.match(head, new RegExp(word));
});

// ---------------------------------------------------------------- the shell's wiring

const MAIN = read('js/main.js');

test('every pause source in the shell goes through the pause controller', () => {
  assert.match(MAIN, /createPauseController\(/);
  assert.match(MAIN, /function pauseGame\(source, opts\) \{[^\n]*PAUSE\.pause\(source, opts\)/, 'one way to the pause controller');
  assert.match(MAIN, /onPause: \(\) => pauseGame\(/, 'the overlay pause button (and controller START through it)');
  assert.match(MAIN, /playing: \{[^\n]*back: \(\{ source \}\) => backGame\(source/, 'Esc and the controller back button in play');
  assert.match(MAIN, /'classic-2d': \{[^\n]*back: \(\{ source \}\) => backGame\(source/, 'and on the Classic 2D board');
  assert.match(MAIN, /function backGame\(source\) \{[^\n]*PAUSE\.back\(/, 'Back on the board goes through the pause controller, which cancels a board being generated');
  assert.match(MAIN, /cancelGeneration: \(\) => cancelGeneration\(\)/, 'the controller cancels through the active mode');
  assert.match(MAIN, /onLockChange: \(locked\) => \{[\s\S]*?backGame\('key'\)[\s\S]*?\n {2}\},\n {2}onLockError/,
    'the Esc the browser consumes to release the pointer lock is that Back');
  assert.match(MAIN, /function padPlaying\([\s\S]*?backButtons\(S\.mode\)\.some\(pressed\)\) \{ backGame\('pad'\)/, 'the controller\'s back button in 3D play');
  assert.match(MAIN, /function padBoard2D\([\s\S]*?backButtons\(S\.mode\)\.some\(pressed\)\) \{ backGame\('pad'\)/, 'and on the Classic 2D board');
});

test('the failure offer of both modes renders above the pause card', () => {
  const css = read('css/style.css');
  const rule = css.match(/#c2d-status, #m3d-status \{([^}]*)\}/);
  assert.ok(rule, 'one rule places both board status cards');
  assert.match(rule[1], /position: fixed/, 'the 2D card is no longer stacked inside the board layer');
  assert.match(rule[1], /z-index: calc\(var\(--z-overlay\) \+ 1\)/, 'above the pause card\'s overlay layer');
  const html = read('index.html');
  const layer = html.slice(html.indexOf('<section id="c2d"'), html.indexOf('<!-- 3D board status'));
  assert.ok(layer.indexOf('id="c2d-status"') > layer.indexOf('</section>'), 'the 2D card sits outside the board layer');
  assert.match(MAIN, /addEventListener\('blur', \(\) => pauseGame\('blur'\)\)/, 'window blur');
  assert.match(MAIN, /visibilitychange[^\n]*pauseGame\('hidden'\)/, 'tab hidden');
  assert.match(MAIN, /addEventListener\('pagehide', \(\) => \{[^\n]*PAUSE\.pageHide\(\); \}\)/, 'pagehide');
  assert.match(MAIN, /onRestart: \(\) => PAUSE\.restart\(/);
  assert.match(MAIN, /onMainMenu: \(\) => PAUSE\.toMenu\(\)/);
  assert.match(MAIN, /onResume: \(\) => PAUSE\.resume\(/);
  assert.doesNotMatch(MAIN.replace(/const PAUSE = createPauseController\([\s\S]*?\n\}\);/, ''), /MODES\.(pause|resume|restart)\(/,
    'nothing but the pause controller pauses, resumes or restarts a mode');
});

test('the leave-page guard is a listener armed and disarmed by the controller', () => {
  assert.match(MAIN, /guard: \(on\) =>/);
  assert.match(MAIN, /removeEventListener\('beforeunload'/);
  assert.doesNotMatch(MAIN, /addEventListener\('beforeunload', \(e\)/, 'no always-on beforeunload handler');
});

test('the pause card holds the confirmation built from kit classes', () => {
  const html = read('index.html');
  const card = html.slice(html.indexOf('<section id="pause"'), html.indexOf('<noscript>'));
  const confirm = card.slice(card.indexOf('id="pause-confirm"'));
  assert.ok(card.includes('id="pause-confirm"'), 'a confirmation panel in the pause card');
  assert.match(confirm, /id="p-confirm-yes"[^>]*class="ui-button ui-button--primary"|class="ui-button ui-button--primary"[^>]*id="p-confirm-yes"/);
  assert.match(confirm, /id="p-confirm-no"/);
  assert.match(MAIN, /paused: \{[^\n]*'#p-confirm-no'/, 'an open confirmation focuses Cancel');
});

// ---------------------------------------------------------------- browser: pause / resume / restart / menu in 3D

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

test('in a browser, the 3D game pauses, resumes, restarts and goes back to menu through the pause controller', async (t) => {
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
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await ms(() => {
      globalThis.__hand = [];
      for (const h of ['finished', 'abandoned', 'inProgress']) {
        globalThis.__ms.pauser.attach(h, (summary) => globalThis.__hand.push([h, summary?.outcome ?? null]));
      }
    });
    const hand = () => ms(() => globalThis.__hand.map(([h]) => h));
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const visible = (id) => ms((i) => !document.getElementById(i).classList.contains('hidden'), id);
    const boardHidden = () => ms(() => getComputedStyle(document.getElementById('scene')).visibility === 'hidden');
    const frames = (n) => ms((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
    const BOARD = { X: 5, Y: 1, Z: 1, mines: 1, minePositions: [4] };
    const startAndClick = () => ms((b) => {
      globalThis.__ms.modes.start('3d', b);
      globalThis.__ms.forcePlay();
      globalThis.__ms.aimAt(3);
      globalThis.__ms.click('left');
    }, BOARD);

    // before the first click: the pause button opens the card over the hidden board, nothing is kept
    await ms((b) => { globalThis.__ms.modes.start('3d', b); globalThis.__ms.forcePlay(); }, BOARD);
    await ms(() => document.getElementById('hud-pause').click());
    assert.equal(await mode(), 'paused');
    assert.equal(await boardHidden(), true, 'the board is hidden under every pause card');
    assert.deepEqual(await hand(), []);
    await ms(() => document.getElementById('p-menu').click());
    assert.equal(await mode(), 'menu', 'back to menu before the first click asks nothing');

    // a started game: the pause key pauses it over a hidden board and keeps its summary
    await startAndClick();
    assert.deepEqual(await hand(), ['inProgress']);
    await frames(5);
    await ms(() => globalThis.__ms.pause());
    assert.equal(await mode(), 'paused');
    assert.equal(await boardHidden(), true, 'the board is hidden while paused');
    assert.deepEqual(await hand(), ['inProgress', 'inProgress']);
    const t0 = await ms(() => globalThis.__ms.state.time);
    await frames(10);
    assert.equal(await ms(() => globalThis.__ms.state.time), t0, 'the timer is stopped');
    assert.equal(await ms(() => globalThis.__ms.pauser.pause('key')), false, 'already paused');

    // resume from the controller: lockless play, the board shows again
    await ms(() => globalThis.__ms.pauser.resume('pad'));
    assert.equal(await mode(), 'playing');
    assert.equal(await boardHidden(), false);

    // automatic pause: window blur and tab hide during a started, unfinished game
    await ms(() => window.dispatchEvent(new Event('blur')));
    assert.equal(await mode(), 'paused', 'blur pauses');
    await ms(() => globalThis.__ms.pauser.resume('pad'));
    await ms(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
      delete document.visibilityState;
    });
    assert.equal(await mode(), 'paused', 'tab hide pauses');
    assert.equal((await hand()).filter((h) => h === 'inProgress').length, 4);
    await ms(() => window.dispatchEvent(new Event('pagehide')));
    assert.equal((await hand()).filter((h) => h === 'inProgress').length, 5, 'pagehide keeps the summary');

    // the leave-page guard is armed during a started, unfinished game
    const guarded = () => ms(() => {
      const e = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(e);
      return e.defaultPrevented;
    });
    assert.equal(await guarded(), true);

    // restart asks first; Cancel keeps the game, Restart abandons it
    await ms(() => document.getElementById('p-restart').click());
    assert.equal(await visible('pause-confirm'), true, 'restart asks for confirmation');
    assert.match(await ms(() => document.getElementById('pause-confirm').textContent), /count as a loss/);
    assert.equal(await ms(() => document.activeElement?.id), 'p-confirm-no', 'Cancel is focused');
    await ms(() => document.getElementById('p-confirm-no').click());
    assert.equal(await visible('pause-confirm'), false);
    assert.equal(await mode(), 'paused');
    assert.equal(await ms(() => globalThis.__ms.state.started), true, 'the game goes on');
    await ms(() => document.getElementById('p-restart').click());
    await ms(() => document.getElementById('p-confirm-yes').click());
    assert.ok(['ready', 'playing'].includes(await mode()), 'a new board with the same choice');
    assert.equal(await ms(() => globalThis.__ms.state.started), false);
    assert.equal((await hand()).at(-1), 'abandoned');
    assert.equal(await guarded(), false, 'disarmed once the game is abandoned');

    // Esc closes an open confirmation instead of resuming
    await startAndClick();
    await ms(() => globalThis.__ms.pause());
    await ms(() => document.getElementById('p-menu').click());
    assert.equal(await visible('pause-confirm'), true);
    await page.keyboard.press('Escape');
    assert.equal(await visible('pause-confirm'), false);
    assert.equal(await mode(), 'paused');

    // back to menu asks first, then leaves the mode with no results screen
    await ms(() => document.getElementById('p-menu').click());
    await ms(() => document.getElementById('p-confirm-yes').click());
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => globalThis.__ms.modes.active), null);
    assert.equal((await hand()).at(-1), 'abandoned');

    // a finished game is handed off; its card asks nothing on restart
    await startAndClick();
    await ms(() => { globalThis.__ms.aimAt(4); globalThis.__ms.click('left'); });
    assert.equal(await ms(() => globalThis.__ms.game.state), 'lost');
    await page.waitForFunction(() => globalThis.__hand.at(-1)[0] === 'finished', null, { timeout: 5000 });
    assert.equal(await guarded(), false);
    assert.equal(await mode(), 'paused', 'a fixed board has no results screen: it ends on the pause card');
    assert.equal(await boardHidden(), true, 'an ended game is hidden under the card too');
    await ms(() => document.getElementById('p-restart').click());
    assert.equal(await visible('pause-confirm'), false, 'no confirmation once the game ended');
    assert.ok(['ready', 'playing'].includes(await mode()));
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});

// Stand-in generation workers, served in place of js/generation/worker.js: one that never answers,
// one that fails at once and one that fails after a while.
const FAIL = "{ ok: false, reason: 'no board within the attempt budget', generatorVersion: 1 }";
const WORKERS = {
  hang: 'self.onmessage = () => {};',
  fail: `self.onmessage = (e) => self.postMessage({ id: e.data.id, result: ${FAIL} });`,
  failLater: `self.onmessage = (e) => setTimeout(() => self.postMessage({ id: e.data.id, result: ${FAIL} }), 800);`,
};

test('in a browser, the Classic 2D generating card cancels by Cancel and Esc, and the failure offer shows above the pause card with Back to menu', async (t) => {
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
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    let worker = 'hang';
    await page.route('**/js/generation/worker.js', (route) => route.fulfill({ contentType: 'text/javascript', body: WORKERS[worker] }));
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    await ms(() => {
      globalThis.__hand = [];
      for (const h of ['finished', 'abandoned']) globalThis.__ms.pauser.attach(h, () => globalThis.__hand.push(h));
    });
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const shown = (id) => ms((i) => { const el = document.getElementById(i); return !el.closest('.hidden') && el.getBoundingClientRect().width > 0; }, id);
    const active = () => ms(() => document.activeElement?.id);
    const clickBoard = async () => {
      const box = await page.locator('#c2d-board canvas').boundingBox();
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    };
    const open = async () => {
      await page.click('#menu-entry-classic-2d');
      assert.equal(await ms(() => document.getElementById('c2d-noguess').checked), true, 'no-guess on by default');
      await page.click('#c2d-choice [data-size="beginner"]');
      assert.equal(await mode(), 'classic-2d');
    };

    // The generating card: a spinner and Cancel, which takes the focus.
    await open();
    await clickBoard();
    await page.waitForFunction(() => !document.getElementById('c2d-status').classList.contains('hidden'));
    assert.equal(await ms(() => document.getElementById('c2d-status-title').textContent), 'Generating the board…');
    assert.equal(await shown('c2d-spinner'), true, 'a spinner');
    assert.equal(await shown('c2d-cancel'), true, 'and Cancel');
    assert.equal(await shown('c2d-offer'), false);
    assert.equal(await active(), 'c2d-cancel', 'Cancel takes the focus');
    // Esc cancels it instead of pausing: back to the closed board, nothing reported.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'classic-2d', 'Esc does not pause while a board is generated');
    assert.equal(await shown('c2d-status'), false);
    assert.equal(await ms(() => globalThis.__ms.modes.state.started), false);
    // Cancel does the same.
    await clickBoard();
    await page.waitForFunction(() => !document.getElementById('c2d-status').classList.contains('hidden'));
    await page.click('#c2d-cancel');
    assert.equal(await shown('c2d-status'), false);
    assert.equal(await mode(), 'classic-2d');
    // Paused while generating, the card hides under the pause card; on resume it shows with Cancel focused again.
    await clickBoard();
    await page.waitForFunction(() => !document.getElementById('c2d-status').classList.contains('hidden'));
    await page.click('#hud-pause');
    assert.equal(await mode(), 'paused');
    assert.equal(await shown('c2d-status'), false, 'the generating card does not show over the pause card');
    await page.click('#p-resume');
    assert.equal(await mode(), 'classic-2d');
    assert.equal(await shown('c2d-status'), true);
    assert.equal(await active(), 'c2d-cancel', 'Cancel takes the focus again');
    await page.keyboard.press('Enter');
    assert.equal(await shown('c2d-status'), false, 'Enter on the focused Cancel cancels');
    // Esc before the card shows cancels too.
    await clickBoard();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    assert.equal(await shown('c2d-status'), false, 'the card never shows for a cancelled request');
    assert.equal(await mode(), 'classic-2d');
    // With nothing being generated, Esc pauses as before.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    await page.click('#p-resume');
    assert.equal(await mode(), 'classic-2d');

    // A failure: the offer of three, Retry focused, then Play a standard board after a second failure.
    worker = 'fail';
    await clickBoard();
    await page.waitForFunction(() => document.getElementById('c2d-status-title').textContent === 'No board found');
    assert.equal(await shown('c2d-offer'), true);
    assert.deepEqual(await ms(() => [...document.querySelectorAll('#c2d-offer button')].map((b) => b.textContent)),
      ['Retry', 'Play a standard board', 'Back to menu']);
    assert.equal(await shown('c2d-cancel'), false, 'no Cancel on the offer');
    assert.equal(await active(), 'c2d-retry', 'a first failure focuses Retry');
    await page.click('#c2d-retry');
    await page.waitForFunction(() => document.activeElement?.id === 'c2d-standard');
    assert.equal(await shown('c2d-offer'), true, 'a second failure in a row focuses Play a standard board');
    // Back to menu leaves with no confirmation and records nothing.
    await page.click('#c2d-offer-menu');
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => globalThis.__ms.modes.active), null);
    assert.deepEqual(await ms(() => globalThis.__hand), [], 'nothing recorded: no game had started');

    // A failure arriving while paused shows above the pause card and takes the focus.
    worker = 'failLater';
    await open();
    await clickBoard();
    await page.click('#hud-pause');
    assert.equal(await mode(), 'paused', 'the pause button still pauses while a board is generated');
    await page.waitForFunction(() => document.getElementById('c2d-status-title').textContent === 'No board found' && !document.getElementById('c2d-status').classList.contains('hidden'));
    assert.equal(await mode(), 'paused');
    assert.equal(await active(), 'c2d-retry');
    const top = await ms(() => {
      const r = document.getElementById('c2d-offer-menu').getBoundingClientRect();
      return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.id;
    });
    assert.equal(top, 'c2d-offer-menu', 'the offer is above the pause card');
    await page.click('#c2d-offer-menu');
    assert.equal(await mode(), 'menu');
    assert.equal(await shown('c2d-status'), false);
    assert.deepEqual(await ms(() => globalThis.__hand), []);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
