// How informative is the first click on each preset, standard vs no-guess? Cascade size and timing.
import { launch, frames, forcePlay } from './lib.mjs';

const { browser, page } = await launch({ width: 800, height: 600 });
const presets = [
  { name: 'Beginner', X: 6, Y: 6, Z: 6, mines: 10 },
  { name: 'Intermediate', X: 8, Y: 8, Z: 8, mines: 40 },
  { name: 'Expert', X: 12, Y: 12, Z: 8, mines: 130 },
];
for (const p of presets) {
  for (const noGuess of [false, true]) {
    const results = [];
    for (let i = 0; i < 8; i++) {
      const r = await page.evaluate(async ({ X, Y, Z, mines, noGuess, i }) => {
        const m = globalThis.__ms;
        m.modes.start('3d', { X, Y, Z, mines, noGuess });
        m.forcePlay();
        // alternate: spawn-aim cell (whatever the crosshair hits at spawn), front-face centre, a corner
        let target;
        const which = i % 3;
        if (which === 0) target = m.selected();
        else if (which === 1) target = Math.floor(X / 2) + X * (Math.floor(Y / 2) + Y * 0);
        else target = 0;
        m.aimAt(target);
        const t0 = performance.now();
        m.click('left');
        let shownGenerating = false;
        while (!m.state.started && performance.now() - t0 < 60000) {
          await new Promise((r) => setTimeout(r, 20));
          if (!document.getElementById('m3d-status').classList.contains('hidden')) shownGenerating = true;
        }
        const t1 = performance.now();
        const g = m.game; let opened = 0, zeros = 0;
        for (let c = 0; c < g.n; c++) if (g.pressed[c]) { opened++; if (g.number[c] === 0) zeros++; }
        return { which: ['spawnAim', 'faceCentre', 'corner'][which], target, ms: Math.round(t1 - t0), opened, zeros, firstNumber: g.number[target], shownGenerating, hud: document.getElementById('hud-time').textContent };
      }, { ...p, noGuess, i });
      results.push(r);
    }
    console.log(p.name, noGuess ? 'NO-GUESS' : 'standard', JSON.stringify(results));
  }
}
await browser.close();
