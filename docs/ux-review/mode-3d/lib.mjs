export const DIR = '/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/mode-3d';

export async function launch(viewport = { width: 1280, height: 800 }) {
  const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
  const { chromium } = pw.default ?? pw;
  const browser = await chromium.launch({ args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist' ] });
  const page = await browser.newPage({ viewport });
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
  await page.goto('http://127.0.0.1:8080/index.html');
  await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu', null, { timeout: 30000 });
  return { browser, page };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function frames(page, n) {
  await page.evaluate((k) => new Promise((r) => { const f = () => (--k <= 0 ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n);
}

export async function shot(page, name) {
  await frames(page, 3);
  await page.screenshot({ path: `${DIR}/${name}.png`, timeout: 180000 });
  console.log('shot', name);
}

export const info = (page) => page.evaluate(() => globalThis.__ms.info());

/** Start a 3D board via the hook and enter lockless play. */
export async function start3D(page, X, Y, Z, mines, minePositions) {
  await page.evaluate(([X, Y, Z, mines, mp]) => { globalThis.__ms.modes.start('3d', { X, Y, Z, mines, minePositions: mp }); }, [X, Y, Z, mines, minePositions]);
  await frames(page, 2);
}

export async function forcePlay(page) {
  await page.evaluate(() => globalThis.__ms.forcePlay());
  await frames(page, 2);
}

/** First click on cell idx and wait for the board. */
export async function firstClick(page, idx) {
  await page.evaluate((c) => { globalThis.__ms.aimAt(c); globalThis.__ms.click('left'); }, idx);
  await page.waitForFunction(() => globalThis.__ms.state.started, null, { timeout: 30000 });
  await frames(page, 2);
}

export const mines = (page) => page.evaluate(() => { const g = globalThis.__ms.game; return [...Array(g.n).keys()].filter((c) => g.number[c] === -1); });

/** Hold a key for ms milliseconds (frame-loop driven movement). */
export async function hold(page, code, ms) {
  await page.evaluate((c) => globalThis.__ms.key(c, true), code);
  await sleep(ms);
  await page.evaluate((c) => globalThis.__ms.key(c, false), code);
  await frames(page, 2);
}

/** Project the board's 8 corners to NDC and report how much is on screen. */
export const boardOnScreen = (page) => page.evaluate(() => {
  const m = globalThis.__ms, g = m.game, T = m.THREE, cam = m.renderer.camera, p = 4 * m.state.spacing;
  const hx = (g.X - 1) / 2 * p + 2, hy = (g.Y - 1) / 2 * p + 2, hz = (g.Z - 1) / 2 * p + 2;
  const pts = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    const v = new T.Vector3(sx * hx, sy * hy, sz * hz).project(cam);
    pts.push({ x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2) });
  }
  const inside = pts.filter((q) => Math.abs(q.x) <= 1 && Math.abs(q.y) <= 1 && q.z < 1).length;
  const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
  return { cornersOnScreen: inside, ndcBox: { x: [Math.min(...xs), Math.max(...xs)], y: [Math.min(...ys), Math.max(...ys)] }, cam: m.info().cam };
});
