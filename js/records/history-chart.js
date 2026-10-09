// Records history: the chart of 3BV/s and efficiency per won game and the recent games list's
// paging. Everything here is DOM-free: the chart draws on the canvas handed in, its colours read
// from the token reader (js/tokens.js) and redrawn on its theme change; no chart library.
//
// chartPoints(history) → [{ id, rate, efficiency }]: the won games of a board's history (the
//   records model's compact entries, in play order), their stats computed by js/records/summary.js.
// niceCeiling(v) → the value axis's end: the smallest 1, 2, 2.5 or 5 × 10^k at or above v; 1 for
//   nothing to show.
// chartScale(points, { width, height }) → { plot: { left, top, width, height }, rateMax,
//   efficiencyMax, rate: [{ x, y } | null], efficiency: [{ x, y } | null] } in CSS pixels. The games
//   spread evenly left to right (one game in the middle); 3BV/s reads against the left axis
//   (0..rateMax), efficiency against the right (0..efficiencyMax, at least 100%). A missing value
//   is null, a gap in its line.
// chartText(points) → the chart's text alternative: the count of won games, and each series' range
//   and latest value in the results screen's formats; NO_WON_GAMES without one.
// drawHistoryChart(ctx, { width, height, pixelRatio, points, token }) draws the grid, the axis
//   labels, the legend and both lines in the CHART_TOKENS colours.
// createHistoryChart({ canvas, token?, onThemeChange?, pixelRatio?, observeResize? }) →
//   { draw(points), destroy() }: sizes the canvas from its CSS box at the pixel ratio, skips a canvas
//   with no size, and redraws the last points on every theme change and every resize of the box
//   (observeResize(canvas, fn) → stop; a ResizeObserver by default) until destroyed.
// pageOf(items, page, size = PAGE_SIZE) → { items, page, pages, from, to, total, hasPrev, hasNext }:
//   the page clamped to 0..pages - 1 (at least one page), from and to 1-based (0 when empty).

import { bbbvPerSecond, efficiency } from './summary.js';
import { formatRate, formatEfficiency } from '../results/view.js';
import { token as readerToken, onThemeChange as readerThemeChange } from '../tokens.js';

export const PAGE_SIZE = 10;
export const NO_WON_GAMES = 'No won games on this board yet, so there is nothing to chart.';
/** The design tokens the chart is drawn in. */
export const CHART_TOKENS = Object.freeze({
  rate: '--color-accent',
  efficiency: '--color-success',
  grid: '--color-border',
  label: '--color-ink-muted',
  font: '--font-family-sans',
  fontSize: '--font-size-xs',
});

const PAD = Object.freeze({ top: 22, right: 40, bottom: 8, left: 40 });
const missing = (v) => v === null || v === undefined || !Number.isFinite(v);

export function chartPoints(history) {
  return history.filter((e) => e.outcome === 'won').map((e) => ({ id: e.id, rate: bbbvPerSecond(e), efficiency: efficiency(e) }));
}

export function niceCeiling(v) {
  if (missing(v) || v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

const largest = (values) => values.reduce((a, v) => (missing(v) ? a : Math.max(a, v)), 0);

export function chartScale(points, { width, height }) {
  const plot = {
    left: PAD.left, top: PAD.top,
    width: Math.max(1, Math.round(width - PAD.left - PAD.right)),
    height: Math.max(1, Math.round(height - PAD.top - PAD.bottom)),
  };
  const rateMax = niceCeiling(largest(points.map((p) => p.rate)));
  const efficiencyMax = Math.max(100, niceCeiling(largest(points.map((p) => p.efficiency))));
  const n = points.length;
  const x = (i) => (n === 1 ? plot.left + plot.width / 2 : plot.left + (i * plot.width) / (n - 1));
  const at = (v, max, i) => (missing(v) ? null : { x: x(i), y: plot.top + plot.height * (1 - v / max) });
  return {
    plot, rateMax, efficiencyMax,
    rate: points.map((p, i) => at(p.rate, rateMax, i)),
    efficiency: points.map((p, i) => at(p.efficiency, efficiencyMax, i)),
  };
}

function range(values, format) {
  const known = values.filter((v) => !missing(v));
  if (!known.length) return null;
  return `from ${format(Math.min(...known))} to ${format(Math.max(...known))}, latest ${format(known.at(-1))}`;
}

export function chartText(points) {
  if (!points.length) return NO_WON_GAMES;
  const parts = [];
  const rate = range(points.map((p) => p.rate), formatRate);
  const eff = range(points.map((p) => p.efficiency), formatEfficiency);
  if (rate) parts.push(`3BV/s ${rate}`);
  if (eff) parts.push(`efficiency ${eff}`);
  const games = `${points.length} won game${points.length === 1 ? '' : 's'}`;
  return `3BV/s and efficiency over ${games}, oldest to newest${parts.length ? `: ${parts.join('; ')}` : ''}.`;
}

function line(ctx, pts, color) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  let open = false;
  for (const p of pts) {
    if (!p) { open = false; continue; }
    if (open) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y);
    open = true;
  }
  ctx.stroke();
  for (const p of pts) {
    if (!p) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 2.5, 0, 2 * Math.PI);
    ctx.fill();
  }
}

export function drawHistoryChart(ctx, { width, height, pixelRatio = 1, points, token }) {
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const s = chartScale(points, { width, height });
  const { left, top, width: w, height: h } = s.plot;
  const ink = token(CHART_TOKENS.label);
  ctx.font = `${token(CHART_TOKENS.fontSize)} ${token(CHART_TOKENS.font)}`;
  ctx.textBaseline = 'middle';

  // Grid: four bands, each line labelled on both axes.
  ctx.strokeStyle = token(CHART_TOKENS.grid);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const y = Math.round(top + (h * i) / 4) + 0.5;
    ctx.moveTo(left, y);
    ctx.lineTo(left + w, y);
  }
  ctx.stroke();
  ctx.fillStyle = ink;
  for (let i = 0; i <= 4; i += 2) {
    const y = top + (h * i) / 4;
    const f = 1 - i / 4;
    ctx.textAlign = 'right';
    ctx.fillText(formatRate(s.rateMax * f), left - 6, y);
    ctx.textAlign = 'left';
    ctx.fillText(formatEfficiency(s.efficiencyMax * f), left + w + 6, y);
  }

  // Legend, top left: a swatch in each series' colour beside its name.
  const legend = [['3BV/s', token(CHART_TOKENS.rate)], ['Efficiency', token(CHART_TOKENS.efficiency)]];
  let lx = left;
  ctx.textAlign = 'left';
  for (const [name, color] of legend) {
    ctx.fillStyle = color;
    ctx.fillRect(lx, 5, 12, 4);
    ctx.fillStyle = ink;
    ctx.fillText(name, lx + 16, 7);
    lx += 16 + ctx.measureText(name).width + 16;
  }

  if (!points.length) return;
  line(ctx, s.efficiency, token(CHART_TOKENS.efficiency));
  line(ctx, s.rate, token(CHART_TOKENS.rate));
}

function observeBox(target, fn) {
  if (typeof globalThis.ResizeObserver !== 'function') return () => {};
  const observer = new globalThis.ResizeObserver(() => fn());
  observer.observe(target);
  return () => observer.disconnect();
}

export function createHistoryChart({
  canvas, token = readerToken, onThemeChange = readerThemeChange, pixelRatio = () => globalThis.devicePixelRatio || 1,
  observeResize = observeBox,
}) {
  let points = [];
  const draw = (next = points) => {
    points = next;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    if (!width || !height) return;
    const ratio = pixelRatio();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    drawHistoryChart(canvas.getContext('2d'), { width, height, pixelRatio: ratio, points, token });
  };
  const off = onThemeChange(() => draw());
  const stop = observeResize(canvas, () => draw());
  return { draw, destroy() { off(); stop(); } };
}

export function pageOf(items, page, size = PAGE_SIZE) {
  const total = items.length;
  const pages = Math.max(1, Math.ceil(total / size));
  const p = Number.isInteger(page) ? Math.min(Math.max(page, 0), pages - 1) : 0;
  const start = p * size;
  const slice = items.slice(start, start + size);
  return {
    items: slice, page: p, pages, total,
    from: slice.length ? start + 1 : 0,
    to: start + slice.length,
    hasPrev: p > 0,
    hasNext: p < pages - 1,
  };
}
