import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createLockFallback, LOCK_MESSAGES, RELOCK_COOLDOWN_MS } from '../js/shell/lock-fallback.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (f) => readFileSync(join(ROOT, f), 'utf8');

// ---------------------------------------------------------------- the refusal counter

test('the re-lock cooldown is the browser\'s 1500 ms after a release', () => {
  assert.equal(RELOCK_COOLDOWN_MS, 1500);
});

test('the first counted refusal keeps today\'s message; the second explains the block', () => {
  const fb = createLockFallback();
  assert.equal(fb.blocked, false);
  assert.equal(fb.refused(10_000, -Infinity), LOCK_MESSAGES.refused);
  assert.equal(LOCK_MESSAGES.refused, 'Could not capture the mouse. Click once more.');
  assert.equal(fb.blocked, false, 'one refusal is not a block');
  assert.equal(fb.refused(12_000, -Infinity), LOCK_MESSAGES.blocked);
  assert.equal(fb.blocked, true);
  assert.match(LOCK_MESSAGES.blocked, /blocking mouse capture on this page/);
  assert.equal(fb.refused(13_000, -Infinity), LOCK_MESSAGES.blocked, 'every later refusal says the same');
});

test('a refusal inside the re-lock cooldown is not counted', () => {
  const fb = createLockFallback();
  const msg = fb.refused(1_000 + RELOCK_COOLDOWN_MS - 1, 1_000);
  assert.equal(msg, LOCK_MESSAGES.cooldown);
  assert.equal(LOCK_MESSAGES.cooldown, 'The browser needs a moment before locking the mouse again. Click once more.');
  assert.equal(fb.refused(5_000, 4_000), LOCK_MESSAGES.cooldown);
  assert.equal(fb.blocked, false);
  assert.equal(fb.refused(9_000, 1_000), LOCK_MESSAGES.refused, 'outside the cooldown: the first counted refusal');
  assert.equal(fb.blocked, false);
});

test('an acquired lock resets the count', () => {
  const fb = createLockFallback();
  fb.refused(10_000, -Infinity);
  fb.locked();
  assert.equal(fb.refused(20_000, -Infinity), LOCK_MESSAGES.refused, 'the count starts again after a lock');
  assert.equal(fb.blocked, false);
});

test('once blocked, every later ready card shows the explanation at once, for the page session', () => {
  const fb = createLockFallback();
  assert.equal(fb.readyMessage(), '', 'no message before any block');
  assert.equal(fb.readyMessage('other'), 'other');
  fb.refused(10_000, -Infinity);
  fb.refused(11_000, -Infinity);
  assert.equal(fb.readyMessage(), LOCK_MESSAGES.blocked);
  fb.locked();
  assert.equal(fb.blocked, true, 'the block is remembered for the page session');
  assert.equal(fb.readyMessage(LOCK_MESSAGES.cooldown), LOCK_MESSAGES.cooldown, 'a message of its own wins');
});

test('the counter is pure: no DOM and no storage', () => {
  const src = read('js/shell/lock-fallback.js');
  assert.doesNotMatch(src, /document|window|localStorage|sessionStorage|storage/);
});

// ---------------------------------------------------------------- the ready card's offer

const INDEX = read('index.html');
const MAIN = read('js/main.js');
const UI_SRC = read('js/ui.js');
const READY = INDEX.slice(INDEX.indexOf('<section id="ready"'), INDEX.indexOf('<!-- Controls modal'));

test('the ready card holds the drag-to-look offer and the controller line outside the click-to-play card', () => {
  const card = READY.slice(READY.indexOf('<button id="ready-btn"'), READY.indexOf('</button>', READY.indexOf('<button id="ready-btn"')));
  assert.doesNotMatch(card, /ready-drag|ready-blocked/, 'the offer is not inside the click-to-play button');
  assert.match(READY, /<div id="ready-blocked" class="[^"]*\bhidden\b[^"]*"/, 'hidden until the lock is blocked');
  assert.match(READY, /<button type="button" id="ready-drag" class="ui-button ui-button--primary">Play with drag-to-look<\/button>/);
  const offer = READY.slice(READY.indexOf('id="ready-blocked"'), READY.indexOf('</div>', READY.indexOf('id="ready-blocked"')));
  assert.match(offer, /controller/i, 'a line names the controller');
  assert.match(offer, /press[^<]*<kbd[^>]*>A<\/kbd>/, 'and its A button');
  assert.ok(READY.indexOf('id="ready-blocked"') < READY.indexOf('id="ready-back"'), 'Back stays below the offer');
});

test('the shell counts refusals on the ready card and offers drag-to-look from the second', () => {
  assert.match(MAIN, /from '\.\/shell\/lock-fallback\.js'/);
  assert.match(MAIN, /LOCK_FALLBACK\.refused\(performance\.now\(\), input\.unlockedAt\)/, 'each refusal goes through the counter');
  assert.match(MAIN, /LOCK_FALLBACK\.locked\(\)/, 'an acquired lock resets it');
  assert.match(MAIN, /blocked: LOCK_FALLBACK\.blocked/, 'every ready card shows the offer once blocked');
  assert.match(MAIN, /onReadyDrag: \(\) => /, 'the offer enters drag-to-look play');
  assert.match(UI_SRC, /\$\('ready-drag'\)\.addEventListener\('click', \(\) => cb\.onReadyDrag/);
  assert.match(UI_SRC, /ready-blocked/);
});

test('drag-to-look play is lockless play with the cursor shown, kept across resume and ended by leaving', () => {
  assert.match(MAIN, /isDragLook: \(\) => /, 'the input knows when drag-to-look is on');
  assert.match(MAIN, /S\.dragLook/);
  const leave = MAIN.slice(MAIN.indexOf('function leaveGame()'), MAIN.indexOf('}', MAIN.indexOf('function leaveGame()')));
  assert.match(leave, /S\.dragLook = false/, 'leaving the game ends it');
  const resume = MAIN.slice(MAIN.indexOf('function resumeGame('), MAIN.indexOf('\n}', MAIN.indexOf('function resumeGame(')));
  assert.match(resume, /S\.dragLook/, 'resume returns to drag-to-look play');
  const css = read('css/style.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /body\.lockless\.drag-look #scene\s*\{[^}]*cursor:\s*(grab|default|auto)/, 'the system cursor shows');
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

test('in a browser that refuses pointer lock, the second refusal offers drag-to-look, which plays by dragging and clicking', async (t) => {
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
    const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    // An embedding page or a strict privacy setting: every pointer-lock request is refused, with
    // both signals Chromium gives — the pointerlockerror event and the rejected promise.
    await page.addInitScript(() => {
      Element.prototype.requestPointerLock = function requestPointerLock() {
        setTimeout(() => document.dispatchEvent(new Event('pointerlockerror')), 0);
        return Promise.reject(new Error('blocked'));
      };
    });
    await page.goto(`${base}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined);
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    const shown = (id) => ms((i) => !document.getElementById(i).classList.contains('hidden'), id);
    const msg = () => ms(() => document.getElementById('ready-msg').textContent);
    const body = () => ms(() => [...document.body.classList].sort().join(' '));

    await ms(() => globalThis.__ms.start(6, 6, 6, 10));
    assert.equal(await mode(), 'ready');
    assert.equal(await shown('ready-blocked'), false, 'no offer before any refusal');
    await page.click('#ready-btn');
    await page.waitForFunction(() => document.getElementById('ready-msg').textContent !== '');
    await page.waitForTimeout(50); // both signals of the refusal have arrived
    assert.equal(await msg(), LOCK_MESSAGES.refused, 'the first refusal keeps today\'s message: its two signals count once');
    assert.equal(await shown('ready-blocked'), false);
    await page.click('#ready-btn');
    await page.waitForFunction(() => !document.getElementById('ready-blocked').classList.contains('hidden'));
    assert.equal(await msg(), LOCK_MESSAGES.blocked, 'the second explains the block');
    assert.equal(await shown('ready-back'), true, 'Back stays');

    await page.click('#ready-drag');
    assert.equal(await mode(), 'playing');
    assert.equal(await body(), 'drag-look lockless');
    const cursor = await ms(() => getComputedStyle(document.getElementById('scene')).cursor);
    assert.notEqual(cursor, 'none', 'the system cursor shows');

    // A drag turns the camera and acts on nothing.
    const cell = await ms(() => globalThis.__ms.aimAt(globalThis.__ms.game.idx(3, 3, 0)));
    assert.ok(cell >= 0, 'the crosshair is on a cube');
    const yaw0 = await ms(() => globalThis.__ms.camera.yaw);
    await page.mouse.move(550, 400);
    await page.mouse.down();
    for (let i = 1; i <= 6; i++) await page.mouse.move(550 + i * 10, 400);
    await page.mouse.up();
    assert.notEqual(await ms(() => globalThis.__ms.camera.yaw), yaw0, 'the drag turned the camera');
    assert.equal(await ms(() => globalThis.__ms.state.started), false, 'the drag revealed nothing');

    // A click without a drag reveals the cube under the crosshair.
    await ms((c) => globalThis.__ms.aimAt(c), cell);
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(() => globalThis.__ms.state.started === true);

    // Esc pauses directly; Resume returns to drag-to-look play with no ready card.
    await page.keyboard.press('Escape');
    assert.equal(await mode(), 'paused');
    await page.click('#p-resume');
    assert.equal(await mode(), 'playing');
    assert.equal(await body(), 'drag-look lockless');

    // Leaving the game ends drag-to-look; the next ready card offers it at once, for the page session.
    await page.keyboard.press('Escape');
    await page.click('#p-menu');
    await page.click('#p-confirm-yes');
    assert.equal(await mode(), 'menu');
    assert.equal(await ms(() => globalThis.__ms.state.dragLook), false);
    assert.equal(await body(), '');
    await ms(() => globalThis.__ms.start(6, 6, 6, 10));
    assert.equal(await mode(), 'ready');
    assert.equal(await shown('ready-blocked'), true, 'the offer shows at once');
    assert.equal(await msg(), LOCK_MESSAGES.blocked);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    server.close();
  }
});
