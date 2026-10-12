const pw = await import('/opt/node-tools/node_modules/playwright/index.js');
export const { chromium, devices } = pw.default ?? pw;
export const DIR = '/tmp/claude-0/-home-user-minesweeper-3d-web/9dfa886f-25e5-5ab6-b45a-705c23db85f6/scratchpad/ux-first-run/';
export async function launch(viewport = { width: 1280, height: 800 }) {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', (e) => console.log('PAGEERROR', e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log('CONSOLE', m.type(), m.text()); });
  await page.goto('http://127.0.0.1:8080/index.html');
  await page.waitForFunction(() => globalThis.__ms !== undefined);
  await page.waitForTimeout(1500);
  return { browser, context, page };
}
export const shot = (page, name) => page.screenshot({ path: DIR + name + '.png', timeout: 180000 });
export const mode = (page) => page.evaluate(() => globalThis.__ms.state.mode);
export const visText = (page, sel) => page.evaluate((s) => {
  const root = document.querySelector(s); if (!root) return null;
  const out = [];
  const walk = (el) => {
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    if (el.children.length === 0 || ['BUTTON','A','LABEL','INPUT'].includes(el.tagName)) {
      const t = (el.tagName === 'INPUT' ? `[input ${el.type} ${el.id} value=${el.value}${el.disabled?' disabled':''}]` : el.textContent.trim());
      if (t) out.push(`${el.tagName.toLowerCase()}${el.id?'#'+el.id:''}${el.disabled?'[disabled]':''}: ${t.replace(/\s+/g,' ')}`);
      return;
    }
    for (const c of el.children) walk(c);
  };
  walk(root); return out;
}, sel);
