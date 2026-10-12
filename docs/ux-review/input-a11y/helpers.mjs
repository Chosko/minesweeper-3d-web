const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
export const { chromium, devices } = pw.default ?? pw;
export const URL = 'http://127.0.0.1:8080/index.html';
export const DIR = '/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/input-a11y';
export const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export async function launch() { return chromium.launch({ args: ARGS }); }
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export async function ready(page) {
  await page.waitForFunction(() => globalThis.__ms !== undefined);
  await sleep(300);
}
export const focused = (page) => page.evaluate(() => {
  const el = document.activeElement; if (!el) return 'none';
  const txt = (el.innerText || el.value || '').trim().slice(0, 30);
  return `${el.tagName.toLowerCase()}#${el.id || ''}[${el.className.split(' ')[0]}] "${txt}"`;
});
export const mode = (page) => page.evaluate(() => globalThis.__ms.state.mode);
export async function shot(page, name) { await page.screenshot({ path: `${DIR}/${name}.png`, timeout: 90000 }); console.log('shot', name); }
export const log = (...a) => console.log(...a);
