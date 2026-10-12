// Render every tile layer face-on as the player would see it, plus the number palette.
import { launch, DIR } from './lib.mjs';

const { browser, page } = await launch({ width: 1400, height: 700 });
const res = await page.evaluate(async () => {
  const T = await import('/js/textures.js');
  const cols = 9, size = 120, pad = 10;
  const items = [];
  for (let n = 0; n <= 26; n++) items.push({ layer: T.L_NUM0 + n, label: String(n) });
  items.push({ layer: T.L_CLOSED, label: 'closed' }, { layer: T.L_FLAG, label: 'flag' }, { layer: T.L_MINE, label: 'mine' }, { layer: T.L_MINE_EXPLODED, label: 'boom' }, { layer: T.L_WRONG_FLAG, label: 'wrong' });
  const rows = Math.ceil(items.length / cols);
  const c = document.createElement('canvas'); c.width = cols * (size + pad) + pad; c.height = rows * (size + pad + 16) + pad;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  const tile = document.createElement('canvas'); tile.width = T.TILE; tile.height = T.TILE; const tctx = tile.getContext('2d');
  items.forEach((it, i) => {
    tctx.clearRect(0, 0, T.TILE, T.TILE); T.drawLayer(tctx, it.layer);
    const x = pad + (i % cols) * (size + pad), y = pad + Math.floor(i / cols) * (size + pad + 16);
    ctx.drawImage(tile, x, y, size, size);
    ctx.fillStyle = '#333'; ctx.font = '12px sans-serif'; ctx.fillText(it.label, x, y + size + 12);
  });
  const colors = []; for (let n = 1; n <= 26; n++) colors.push([n, T.numberColor(n), T.contrastRatio(T.numberColor(n), T.REVEALED_DARK).toFixed(2)]);
  return { png: c.toDataURL('image/png'), colors };
});
const fs = await import('node:fs');
fs.writeFileSync(`${DIR}/30-tiles.png`, Buffer.from(res.png.split(',')[1], 'base64'));
console.log(JSON.stringify(res.colors));
await browser.close();
