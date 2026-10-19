// The 3D game's overlay in a browser, at each of its artboard sizes (J-Game3D-xl, -l, -m, -p, -ls and
// J-Game3D-states): the counters, the figures panel or the phone's title and Pause, the help panel, the
// hint strip and the view chips in their places, every readout on a surface of its own, Pause and Restart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { browserSuite } from './helpers/browser.mjs';
import { measureContrast } from './helpers/contrast.mjs';

const suite = browserSuite();
const SHOTS = process.env.MS_SHOTS === '1';

// The 3D game's overlay at each artboard size (J-Game3D-xl, -l, -m, -p, -ls and J-Game3D-states): every part
// in its place on its own surface, readable over any sky the theme draws.
const GAME_3D_SIZES = [
  ['xl', { viewport: { width: 1920, height: 1080 } }, 300],
  ['l', { viewport: { width: 1366, height: 768 } }, 290],
  ['m', { viewport: { width: 1024, height: 768 } }, 280],
  ['p', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }, null],
  ['ls', { viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true }, null],
];
for (const [size, device, panelWidth] of GAME_3D_SIZES) {
  test(`in a browser, the 3D game's overlay at ${size} (${device.viewport.width} × ${device.viewport.height}): the counters at the top centre, the panel or the phone's title and Pause, every readout on its own surface and the contrast contract met`, async (t) => {
    const env = await suite.open(t);
    if (!env) return;
    const { browser, base } = env;
    const context = await browser.newContext({ ...device, deviceScaleFactor: 1 });
    const shots = SHOTS ? mkdtempSync(join(tmpdir(), `ms3d-game3d-${size}-`)) : null;
    try {
      const page = await context.newPage();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      await page.goto(`${base}/index.html?still-backdrop`);
      await page.waitForFunction(() => globalThis.__ms !== undefined && globalThis.__ms.state.mode === 'menu');
      const ms = (fn, arg) => page.evaluate(fn, arg);
      const frames = () => ms(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const touch = !!device.hasTouch;
      const { width: vw, height: vh } = device.viewport;
      await ms(() => globalThis.__ms.modes.start('3d', { X: 8, Y: 8, Z: 8, mines: 40 }));
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'ready');
      if (touch) await page.tap('#ready-btn');
      else await ms(() => globalThis.__ms.forcePlay());
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
      // A running time past the display limit: the counter stops at 999, the game keeps the real time.
      await ms(() => { globalThis.__ms.state.time = 1234.5; });
      await page.waitForFunction(() => document.getElementById('hud-time').textContent === '999');
      assert.equal(await ms(() => globalThis.__ms.state.time), 1234.5);
      await frames();
      if (shots) await page.screenshot({ path: join(shots, 'game.png') });
      const g = await ms(() => {
        const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
        const $ = (id) => document.getElementById(id);
        const shown = (el) => getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().width > 0;
        return {
          strip: box($('hud-counters')), panel: box($('hud-figures')), head: box($('hud-figures').querySelector('.ui-figures__head')),
          title: box($('hud-title')), pause: box($('hud-pause')), tools: box($('hud-tools')),
          body: shown($('hud-figures').querySelector('.ui-figures__body')), toolsShown: shown($('hud-tools')),
          text: $('hud-title').textContent, tip: $('hud-title').getAttribute('title'), name: $('hud-title').getAttribute('aria-label'),
          scroll: document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth,
        };
      });
      assert.ok(g.scroll, `${size}: no sideways scroll`);
      assert.deepEqual([g.tip, g.name], ['3D · Cube Intermediate', '3D · Cube Intermediate'], `${size}: the full name is the title's tooltip and name`);
      assert.ok(Math.abs((g.strip.x + g.strip.right) / 2 - vw / 2) < 2, `${size}: the counters centred (${g.strip.x}..${g.strip.right})`);
      if (panelWidth) {
        assert.ok(g.strip.y >= 16 && g.strip.y <= 32, `${size}: the counters at the top (${g.strip.y})`);
        assert.ok(Math.abs(g.panel.width - panelWidth) < 1 && Math.abs(g.panel.right - (vw - 24)) < 1, `${size}: the ${panelWidth} px panel on the right (${g.panel.width}, ${g.panel.right})`);
        assert.ok(Math.abs((g.panel.y + g.panel.bottom) / 2 - vh / 2) < 2, `${size}: the panel centred vertically (${g.panel.y}..${g.panel.bottom})`);
        assert.ok(g.body, `${size}: the live figures under the panel's head`);
        assert.ok(g.head.y === g.panel.y && g.title.x < g.pause.x && g.pause.right <= g.panel.right, `${size}: the head bar with the title and Pause`);
        assert.equal(g.text, '3D', `${size}: the full name does not fit the bar, so the difficulty is dropped`);
        assert.ok(g.toolsShown && Math.abs((g.tools.x + g.tools.right) / 2 - vw / 2) < 2 && g.tools.bottom <= vh - 16 && g.tools.y > g.panel.bottom, `${size}: the HUD strip at the bottom centre`);
      } else {
        assert.equal(g.body, false, `${size}: no figures on a phone`);
        assert.equal(g.text, '3D · Cube Intermediate', `${size}: a phone keeps the full name`);
        assert.equal(g.toolsShown, false, `${size}: no HUD key strip on a phone`);
        if (size === 'p') {
          assert.ok(g.head.y <= 16 && g.head.x <= 16 && g.head.right >= vw - 16, `${size}: the title and Pause bar on top`);
          assert.ok(g.strip.y >= g.head.bottom && g.pause.right <= vw - 12, `${size}: the counters below it`);
        } else {
          assert.ok(g.title.x <= 16 && g.title.y <= 14, `${size}: the title a pill at the top left`);
          assert.ok(g.strip.y <= 14, `${size}: the counters at the top centre`);
          assert.ok(g.pause.right >= vw - 16 && g.pause.y <= 14 && g.pause.width <= 52 && g.pause.width >= 44, `${size}: Pause an icon button at the top right (${g.pause.width} px)`);
          assert.ok(g.title.right < g.strip.x && g.strip.right < g.pause.x, `${size}: the three apart`);
        }
        const toolbar = await ms(() => document.getElementById('touch-modes').getBoundingClientRect().toJSON());
        assert.ok(toolbar.y > g.strip.bottom && toolbar.right <= vw - 12 && toolbar.bottom <= vh - 16, `${size}: the Shift / Space / Ctrl toolbar at the bottom right, clear of the overlay`);
      }
      // The first-use hint strip: on the screen whole, wrapping rather than overflowing.
      await page.waitForFunction(() => !document.getElementById('hint-strip').classList.contains('hidden'));
      const hint = await ms(() => { const el = document.getElementById('hint-strip'); return { ...el.getBoundingClientRect().toJSON(), fits: el.scrollWidth <= el.clientWidth }; });
      assert.ok(hint.x >= 0 && hint.right <= vw && hint.fits, `${size}: the hint strip inside the window (${hint.x}..${hint.right})`);
      if (touch) assert.ok(hint.y > g.strip.bottom, `${size}: the touch hint strip below the counters`);
      // A held view mode: its chip and the hint strip never overlap.
      await ms(() => globalThis.__ms.key('ShiftLeft'));
      await frames();
      const chip = await ms(() => document.getElementById('chip-shift').getBoundingClientRect().toJSON());
      const hint2 = await ms(() => document.getElementById('hint-strip').getBoundingClientRect().toJSON());
      if (chip.width) assert.ok(chip.bottom <= hint2.y || chip.y >= hint2.bottom || chip.right <= hint2.x || chip.x >= hint2.right, `${size}: the Shift chip clear of the hint strip`);
      await ms(() => globalThis.__ms.key('ShiftLeft', false));
      // Every readout over the scene sits on a surface of its own: its text measured against that surface,
      // never against the sky behind it, so it holds over the brightest and the darkest sky.
      await ms(() => globalThis.__ms.state.time = 47);
      await frames();
      const parts = await ms(() => {
        const out = [];
        for (const el of document.querySelectorAll('#hud *, #toast *')) {
          if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
          if (el.closest('[aria-hidden="true"], .hidden, .ui-figures__live') || !el.getBoundingClientRect().width) continue; // the live part is never shown
          let surface = null;
          for (let e = el; e && e !== document.body; e = e.parentElement) {
            const m = getComputedStyle(e).backgroundColor.match(/rgba?\(([^)]+)\)/);
            const a = m ? (m[1].split(/[\s,/]+/).filter(Boolean).map(Number)[3] ?? 1) : 0;
            if (a === 1) { surface = e.id || e.className || e.tagName; break; }
          }
          out.push({ text: el.textContent.trim().slice(0, 30), surface });
        }
        return out;
      });
      assert.ok(parts.length >= (touch ? 4 : 12), `${size}: the overlay's text is measured (${parts.length})`);
      assert.deepEqual(parts.filter((p) => !p.surface).map((p) => p.text), [], `${size}: text with no surface of its own over the scene`);
      const { runs } = await ms(measureContrast);
      const own = new Set(parts.map((p) => p.text));
      const mine = runs.filter((r) => own.has(r.text));
      assert.deepEqual(mine.filter((r) => r.ratio < r.min).map((r) => `${r.text}: ${r.ratio.toFixed(2)}:1 < ${r.min}`), [], `${size}: text below the contrast contract`);
      if (panelWidth) {
        // The H help panel beside the figures panel, centred vertically as it is.
        await page.keyboard.press('KeyH');
        await page.waitForFunction(() => !document.getElementById('help').classList.contains('hidden'));
        const help = await ms(() => document.getElementById('help').getBoundingClientRect().toJSON());
        assert.ok(help.right <= g.panel.x - 16 && help.right >= g.panel.x - 32, `${size}: the help panel beside the figures panel (${help.right}, ${g.panel.x})`);
        assert.ok(Math.abs((help.y + help.bottom) / 2 - vh / 2) < 2, `${size}: the help panel centred vertically`);
        await page.keyboard.press('KeyH');
      }
      // Pause pauses the game.
      if (touch) await page.tap('#hud-pause'); else await page.click('#hud-pause');
      assert.equal(await ms(() => globalThis.__ms.state.mode), 'paused');
      // Restart in the counter strip starts a fresh game of the same board: a mouse click enters it as the
      // ready card's click does (pointer lock), a tap stays in lockless touch play.
      if (touch) await page.tap('#p-resume'); else await ms(() => globalThis.__ms.forcePlay());
      await page.waitForFunction(() => globalThis.__ms.state.mode === 'playing');
      await ms(() => { globalThis.__before = globalThis.__ms.state.play; });
      if (touch) await page.tap('#hud-restart'); else await page.click('#hud-restart');
      await page.waitForFunction(() => globalThis.__ms.state.play !== globalThis.__before && globalThis.__ms.state.mode === 'playing');
      assert.deepEqual(await ms(() => ({ started: globalThis.__ms.state.started, mines: document.getElementById('hud-mines').textContent })), { started: false, mines: '040' }, `${size}: a fresh closed box`);
      if (touch) assert.equal(await ms(() => globalThis.__ms.state.lockless), true, `${size}: still lockless touch play`);
      assert.deepEqual(errors, []);
    } finally {
      await context.close();
    }
  });
}
