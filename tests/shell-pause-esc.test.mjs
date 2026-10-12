// Esc on the pause card of a 3D game in play (task 126, P-36): the press that released the pointer
// lock already meant Pause and is ignored; every later press resumes as a keyboard Back does, however
// soon after the release, and a held Esc's auto-repeat never does. Chromium and Firefox keep the
// releasing press's keydown from the page; a browser that delivers it does so while the lock holds.
// In a browser, the lock's release is played with a stand-in pointer lock and synthetic key events.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join, dirname, normalize, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { escResumes } from '../js/input.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const MAIN = read('js/main.js');
const INPUT = read('js/input.js');

// ---------------------------------------------------------------- the decision

test('the Esc press that released the pointer lock does not resume; the next one does, at any delay', () => {
  assert.equal(escResumes({ repeat: false, locked: true }), false, 'a press that came while the lock held released it');
  assert.equal(escResumes({ repeat: false, locked: false }), true, 'a press with the pointer free is a deliberate one');
  assert.equal(escResumes.length, 1, 'the decision takes the press alone: no time, so no window');
});

test('the auto-repeat of a held Esc never resumes', () => {
  assert.equal(escResumes({ repeat: true, locked: false }), false);
  assert.equal(escResumes({ repeat: true, locked: true }), false);
});

// ---------------------------------------------------------------- the wiring

test('Input records each key press with its repeat flag and whether the pointer was locked, before onKey', () => {
  const keydown = INPUT.slice(INPUT.indexOf("window.addEventListener('keydown'"), INPUT.indexOf("window.addEventListener('keyup'"));
  const record = keydown.indexOf('this.lastKey = { code: e.code, repeat: e.repeat, locked: this.locked }');
  assert.ok(record >= 0, 'the press is recorded');
  assert.ok(record < keydown.indexOf('this.o.onKey'), 'before it reaches onKey');
});

test('the pause card resumes on every Esc but the releasing one, with no time window', () => {
  const fn = MAIN.slice(MAIN.indexOf('function resumeFromPause('), MAIN.indexOf('\n}\n', MAIN.indexOf('function resumeFromPause(')));
  assert.match(fn, /if \(source === 'key' && !escResumes\(input\.lastKey\)\) return;/);
  assert.match(fn, /PAUSE\.resume\('key'\)/, 'resumes as a keyboard Back');
  assert.doesNotMatch(fn, /unlockedAt|500/, 'the 500 ms window is gone');
  assert.match(MAIN, /import \{[^}]*\bescResumes\b[^}]*\} from '\.\/input\.js'/);
});

// ---------------------------------------------------------------- in a browser

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
    const file = join(ROOT, path || 'index.html');
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}
async function loadPlaywright() {
  try {
    return await import('playwright');
  } catch {
    const global = join(dirname(process.execPath), '..', 'lib', 'node_modules', 'playwright', 'index.mjs');
    if (!existsSync(global)) return null;
    try { return await import(pathToFileURL(global).href); } catch { return null; }
  }
}

test('in a browser, a quick Esc after the lock release resumes; the releasing press and a held Esc do not', async (t) => {
  const playwright = await loadPlaywright();
  if (!playwright) { t.skip('Playwright is not installed'); return; }
  let browser;
  try {
    browser = await playwright.chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  } catch (error) {
    t.skip(`chromium could not start: ${error.message.split('\n')[0]}`);
    return;
  }
  const server = await serve();
  try {
    const page = await browser.newPage({ viewport: { width: 1100, height: 700 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
    await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
    const ms = (fn, arg) => page.evaluate(fn, arg);
    const mode = () => ms(() => globalThis.__ms.state.mode);
    // A stand-in pointer lock: headless chromium grants none, so the lock and its release are played
    // through document.pointerLockElement and the pointerlockchange event Input listens to.
    await ms(() => {
      let locked = null;
      Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => locked });
      globalThis.fakeLock = (on) => { locked = on ? document.getElementById('scene') : null; document.dispatchEvent(new Event('pointerlockchange')); };
      globalThis.esc = (repeat = false) => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', repeat, cancelable: true }));
    });
    const lockedPlay = async () => {
      await ms(() => globalThis.fakeLock(true));
      assert.equal(await mode(), 'playing', 'the lock enters play');
    };

    await ms(() => globalThis.__ms.start(6, 1, 1, 2, [0, 3]));
    assert.equal(await mode(), 'ready');
    await lockedPlay();
    await ms(() => { globalThis.__ms.aimAt(1); globalThis.__ms.click('left'); });
    assert.equal(await ms(() => globalThis.__ms.state.started), true);

    // Chromium and Firefox: the releasing press never reaches the page, the release pauses, and an
    // Esc right after it resumes (to the click-to-play card, which takes the lock again).
    await ms(() => globalThis.fakeLock(false));
    assert.equal(await mode(), 'paused', 'the browser\'s Esc released the lock: paused');
    await ms(() => globalThis.esc());
    assert.equal(await mode(), 'ready', 'a second Esc at once resumes');

    // A held Esc's auto-repeat does not resume.
    await lockedPlay();
    await ms(() => globalThis.fakeLock(false));
    await ms(() => { globalThis.esc(true); globalThis.esc(true); });
    assert.equal(await mode(), 'paused', 'auto-repeat leaves the card');
    await ms(() => globalThis.esc());
    assert.equal(await mode(), 'ready');

    // A browser that delivers the releasing press does so while the lock holds: it pauses, the
    // release that follows changes nothing, and only the next press resumes.
    await lockedPlay();
    await ms(() => { globalThis.esc(); globalThis.fakeLock(false); });
    assert.equal(await mode(), 'paused', 'the releasing press paused');
    await ms(() => globalThis.esc());
    assert.equal(await mode(), 'ready', 'the next press resumes');

    // An ended game's card: Esc goes to the main menu, as before.
    await lockedPlay();
    await ms(() => { globalThis.__ms.aimAt(0); globalThis.__ms.click('left'); });
    await page.waitForFunction(() => globalThis.__ms.state.mode === 'paused', null, { timeout: 5000 });
    await ms(() => globalThis.esc());
    assert.equal(await mode(), 'menu');
    assert.deepEqual(errors, []);
  } finally {
    server.close();
    await browser.close();
  }
});
