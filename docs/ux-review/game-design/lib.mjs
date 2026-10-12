export const DIR = '/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/game-design';
export async function launch(opts = {}) {
  const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
  const { chromium } = pw.default ?? pw;
  const browser = await chromium.launch({ args: [
    '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await context.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  await page.goto('http://127.0.0.1:8080/index.html');
  await page.waitForFunction(() => globalThis.__ms !== undefined);
  await page.waitForTimeout(800);
  return { browser, context, page };
}
export const shot = (page, name) => page.screenshot({ path: `${DIR}/${name}.png` });
export const mode = (page) => page.evaluate(() => globalThis.__ms.state.mode);
export const info = (page) => page.evaluate(() => globalThis.__ms.info());
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 3D board stats from the session view exposed as __ms.game.
export const boardStats = (page) => page.evaluate(() => {
  const g = globalThis.__ms.game; if (!g) return null;
  const n = g.n, num = g.number, rev = g.pressed, fl = g.flagged, hid = g.unlinked;
  let revealed = 0, visible = 0, visibleNumbers = 0, flags = 0, hidden = 0, max = 0;
  const hist = {};
  for (let c = 0; c < n; c++) {
    if (rev[c]) { revealed++; if (!hid[c]) { visible++; if (num[c] > 0) { visibleNumbers++; hist[num[c]] = (hist[num[c]] || 0) + 1; if (num[c] > max) max = num[c]; } } else hidden++; }
    if (fl[c]) flags++;
  }
  return { n, X: g.X, Y: g.Y, Z: g.Z, revealed, visible, visibleNumbers, hidden, flags, max, hist, phase: g.phase, minesLeft: g.minesLeft };
});
