// Records history: the chart of 3BV/s and efficiency per won game, the chart of the best time by
// date, their hover readouts, and the paging of the screen's lists. Everything here is DOM-free:
// each chart draws on the canvas handed in, its colours read from the token reader (js/tokens.js)
// and redrawn on its theme change; no chart library.
//
// formatDate(iso | ms) → "9 Oct 2026"; formatShortDate(iso | ms) → "9 Oct" (local); DASH without a
//   date.
// chartPoints(history) → [{ id, endedAt, rate, efficiency }]: the won games of a board's history
//   (the records model's compact entries, in play order), their stats computed by
//   js/records/summary.js.
// niceCeiling(v) → the value axis's end: the smallest 1, 2, 2.5 or 5 × 10^k at or above v; 1 for
//   nothing to show.
// chartScale(points, { width, height }) → { plot: { left, top, width, height }, rateMax,
//   efficiencyMax, xs, rate: [{ x, y } | null], efficiency: [{ x, y } | null] } in CSS pixels. The games
//   spread evenly left to right (one game in the middle); 3BV/s reads against the left axis
//   (0..rateMax), efficiency against the right (0..efficiencyMax, at least 100%). A missing value
//   is null, a gap in its line.
// chartText(points, empty = NO_WON_GAMES) → the chart's text alternative: the count of won games,
//   and each series' range and latest value in the results screen's formats; empty without one.
// drawHistoryChart(ctx, { width, height, pixelRatio, points, token, hover? }) draws the grid, the
//   axis labels, the legend and both lines in the CHART_TOKENS colours, and the hovered game's
//   marker and readout (rateReadout) when hover is its index.
// The best-time chart: its data is { steps, start, end, emptyText? } — steps from bestTimeSteps
//   (js/records/stats.js), start and end the first and last end date of the shown won games.
// dateTicks(start, end, count = DATE_TICKS) → [{ t, label }]: the first and last date and evenly
//   spaced dates between, labelled formatShortDate, a label repeating its neighbour left out.
// bestTimeScale(data, { width, height }) → { plot, timeMax, xs, points: [{ x, y }], ticks }: dates
//   left to right over start..end (one date in the middle), the time axis from 0 to timeMax.
// bestTimeText(steps, empty = NO_BEST_TIME) → the text alternative naming each new best and its date.
// drawBestTimeChart(ctx, { width, height, pixelRatio, data, token, hover? }) draws the grid, the
//   time axis (each tick formatTime'd with its trailing zeros dropped, the fewest decimals that show
//   it exactly: "2.5 s", "1.25 s", "0 s", never "2.500 s", which reads as thousands), the date axis,
//   the step line of the standing best (stepping down at each new best, held to the last date) with
//   a marker at each new best, the empty text without one, and the hovered best's marker and
//   readout (bestReadout).
// nearestIndex(xs, x) → the index of the x position nearest x (null entries skipped), or -1.
// rateReadout(points, i) → [date and time, "3BV/s 1.23", "Efficiency 80.0%"]; bestReadout(steps, i)
//   → [date and time, best time].
// createHistoryChart({ canvas, kind = 'rate' | 'best', token?, onThemeChange?, pixelRatio?,
//   observeResize? }) → { draw(data), hoverAt(x), leave(), readout, destroy() }: data is the rate
//   chart's points or the best-time chart's data; sizes the canvas from its CSS box at the pixel
//   ratio, skips a canvas with no size, and redraws the last data on every theme change and every
//   resize of the box (observeResize(canvas, fn) → stop; a ResizeObserver by default) until
//   destroyed. hoverAt(x) (CSS px from the canvas's left) marks the nearest point and draws its
//   readout, whose lines readout joins with " · " (null when none) and canvas.dataset.readout
//   carries; leave() clears it, as new data does. A pointer moving over the canvas hovers, leaving
//   it clears; a touch's press hovers and stays.
// pageOf(items, page, size = PAGE_SIZE) → { items, page, pages, from, to, total, hasPrev, hasNext }:
//   the page clamped to 0..pages - 1 (at least one page), from and to 1-based (0 when empty).

import { bbbvPerSecond, efficiency } from './summary.js';
import { DASH, formatTime, formatRate, formatEfficiency } from '../results/view.js';
import { token as readerToken, onThemeChange as readerThemeChange } from '../tokens.js';

export const PAGE_SIZE = 10;
export const NO_WON_GAMES = 'No won games on this board yet, so there is nothing to chart.';
export const NO_WON_GAMES_PERIOD = 'No won games in this period, so there is nothing to chart.';
export const NO_BEST_TIME = 'No won games on this board yet, so there is no best time to chart.';
export const NO_BEST_TIME_PERIOD = 'No won games in this period, so there is no best time to chart.';
export const DATE_TICKS = 4;
/** The design tokens the charts are drawn in. */
export const CHART_TOKENS = Object.freeze({
  rate: '--color-accent',
  efficiency: '--color-success',
  best: '--color-accent',
  grid: '--color-border',
  label: '--color-ink-muted',
  ink: '--color-ink',
  surface: '--color-surface-raised',
  font: '--font-family-sans',
  fontSize: '--font-size-xs',
});

const PAD = Object.freeze({ top: 22, right: 40, bottom: 8, left: 40 });
const BEST_PAD = Object.freeze({ top: 22, right: 24, bottom: 22, left: 56 });
const missing = (v) => v === null || v === undefined || !Number.isFinite(v);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const toDate = (v) => {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const two = (n) => String(n).padStart(2, '0');

/** A date as "9 Oct 2026", in local time. */
export function formatDate(v) {
  const d = toDate(v);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}` : DASH;
}
/** A date as "9 Oct", in local time: the best-time chart's date axis. */
export function formatShortDate(v) {
  const d = toDate(v);
  return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : DASH;
}
const dateTime = (v) => {
  const d = toDate(v);
  return d ? `${formatDate(v)} ${two(d.getHours())}:${two(d.getMinutes())}` : DASH;
};

export function chartPoints(history) {
  return history.filter((e) => e.outcome === 'won')
    .map((e) => ({ id: e.id, endedAt: e.endedAt, rate: bbbvPerSecond(e), efficiency: efficiency(e) }));
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
    xs: points.map((p, i) => x(i)),
    rate: points.map((p, i) => at(p.rate, rateMax, i)),
    efficiency: points.map((p, i) => at(p.efficiency, efficiencyMax, i)),
  };
}

function range(values, format) {
  const known = values.filter((v) => !missing(v));
  if (!known.length) return null;
  return `from ${format(Math.min(...known))} to ${format(Math.max(...known))}, latest ${format(known.at(-1))}`;
}

export function chartText(points, empty = NO_WON_GAMES) {
  if (!points.length) return empty;
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

export function drawHistoryChart(ctx, { width, height, pixelRatio = 1, points, token, hover = null }) {
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
  if (hover !== null && points[hover]) {
    const at = s.rate[hover] ?? s.efficiency[hover] ?? { x: s.xs[hover], y: top + h / 2 };
    drawReadout(ctx, at, rateReadout(points, hover), s.plot, token);
  }
}

export function nearestIndex(xs, x) {
  let best = -1;
  let gap = Infinity;
  xs.forEach((v, i) => {
    if (missing(v)) return;
    const d = Math.abs(v - x);
    if (d < gap) { gap = d; best = i; }
  });
  return best;
}

export function rateReadout(points, i) {
  const p = points[i];
  return p ? [dateTime(p.endedAt), `3BV/s ${formatRate(p.rate)}`, `Efficiency ${formatEfficiency(p.efficiency)}`] : [];
}

export function bestReadout(steps, i) {
  const s = steps[i];
  return s ? [dateTime(s.endedAt), `Best time ${formatTime(s.elapsedMs)}`] : [];
}

// The hovered point: a ring on it, and its values in a small box beside it, kept inside the plot.
function drawReadout(ctx, at, lines, plot, token) {
  if (!lines.length) return;
  ctx.strokeStyle = token(CHART_TOKENS.ink);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(at.x, at.y, 5, 0, 2 * Math.PI);
  ctx.stroke();
  const lineHeight = 14;
  const boxW = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 12;
  const boxH = lines.length * lineHeight + 8;
  let bx = at.x + 10;
  if (bx + boxW > plot.left + plot.width) bx = at.x - 10 - boxW;
  bx = Math.max(plot.left, bx);
  const by = Math.min(Math.max(plot.top, at.y - boxH / 2), plot.top + plot.height - boxH);
  ctx.fillStyle = token(CHART_TOKENS.surface);
  ctx.fillRect(bx, by, boxW, boxH);
  ctx.strokeStyle = token(CHART_TOKENS.grid);
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, boxW - 1, boxH - 1);
  ctx.fillStyle = token(CHART_TOKENS.ink);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  lines.forEach((l, k) => ctx.fillText(l, bx + 6, by + 4 + lineHeight * (k + 0.5)));
}

// ---------------------------------------------------------------- the best time by date

const timeLabel = (ms) => formatTime(ms).replace(/\.?0+ s$/, ' s');
const instant = (v) => toDate(v)?.getTime() ?? null;

export function dateTicks(start, end, count = DATE_TICKS) {
  const a = instant(start);
  const b = instant(end);
  if (a === null || b === null) return [];
  if (a === b || count < 2) return [{ t: a, label: formatShortDate(a) }];
  const ticks = [];
  for (let i = 0; i < count; i++) {
    const t = a + ((b - a) * i) / (count - 1);
    const label = formatShortDate(t);
    if (ticks.length && ticks.at(-1).label === label && i < count - 1) continue;
    if (ticks.length && ticks.at(-1).label === label) ticks.pop();
    ticks.push({ t, label });
  }
  return ticks;
}

export function bestTimeScale({ steps = [], start = null, end = null } = {}, { width, height }) {
  const plot = {
    left: BEST_PAD.left, top: BEST_PAD.top,
    width: Math.max(1, Math.round(width - BEST_PAD.left - BEST_PAD.right)),
    height: Math.max(1, Math.round(height - BEST_PAD.top - BEST_PAD.bottom)),
  };
  const timeMax = niceCeiling(largest(steps.map((s) => s.elapsedMs)));
  const a = instant(start) ?? instant(steps[0]?.endedAt);
  const b = instant(end) ?? instant(steps.at(-1)?.endedAt);
  const x = (t) => (a === null || b === null || a === b ? plot.left + plot.width / 2 : plot.left + (plot.width * (t - a)) / (b - a));
  const y = (v) => plot.top + plot.height * (1 - v / timeMax);
  const xs = steps.map((s) => x(instant(s.endedAt) ?? a));
  return {
    plot, timeMax, xs,
    points: steps.map((s, i) => ({ x: xs[i], y: y(s.elapsedMs) })),
    end: a === null ? null : x(b),
    ticks: dateTicks(a, b).map((t) => ({ ...t, x: x(t.t) })),
  };
}

export function bestTimeText(steps, empty = NO_BEST_TIME) {
  if (!steps.length) return empty;
  const named = steps.map((s) => `${formatTime(s.elapsedMs)} on ${formatDate(s.endedAt)}`);
  const list = named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`;
  return `Best time by date, ${steps.length} new best${steps.length === 1 ? '' : 's'}: ${list}.`;
}

export function drawBestTimeChart(ctx, { width, height, pixelRatio = 1, data, token, hover = null }) {
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const steps = data?.steps ?? [];
  const s = bestTimeScale(data ?? {}, { width, height });
  const { left, top, width: w, height: h } = s.plot;
  const ink = token(CHART_TOKENS.label);
  ctx.font = `${token(CHART_TOKENS.fontSize)} ${token(CHART_TOKENS.font)}`;
  ctx.textBaseline = 'middle';

  ctx.strokeStyle = token(CHART_TOKENS.grid);
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i++) {
    const gy = Math.round(top + (h * i) / 4) + 0.5;
    ctx.moveTo(left, gy);
    ctx.lineTo(left + w, gy);
  }
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 4; i += 2) ctx.fillText(timeLabel(s.timeMax * (1 - i / 4)), left - 6, top + (h * i) / 4);

  // Legend, top left.
  ctx.fillStyle = token(CHART_TOKENS.best);
  ctx.fillRect(left, 5, 12, 4);
  ctx.fillStyle = ink;
  ctx.textAlign = 'left';
  ctx.fillText('Best time', left + 16, 7);

  if (!steps.length) {
    ctx.textAlign = 'center';
    ctx.fillText(data?.emptyText ?? NO_BEST_TIME, left + w / 2, top + h / 2);
    return;
  }

  // The dated axis under the plot.
  ctx.textBaseline = 'top';
  s.ticks.forEach((t, i) => {
    ctx.textAlign = s.ticks.length === 1 ? 'center' : i === 0 ? 'left' : i === s.ticks.length - 1 ? 'right' : 'center';
    ctx.fillText(t.label, t.x, top + h + 6);
  });

  // The standing best: level until the next new best, then down to it; held to the last date.
  const color = token(CHART_TOKENS.best);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  s.points.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else { ctx.lineTo(p.x, s.points[i - 1].y); ctx.lineTo(p.x, p.y); }
  });
  if (s.end !== null) ctx.lineTo(Math.max(s.end, s.points.at(-1).x), s.points.at(-1).y);
  ctx.stroke();
  for (const p of s.points) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3.5, 0, 2 * Math.PI);
    ctx.fill();
  }
  if (hover !== null && s.points[hover]) drawReadout(ctx, s.points[hover], bestReadout(steps, hover), s.plot, token);
}

function observeBox(target, fn) {
  if (typeof globalThis.ResizeObserver !== 'function') return () => {};
  const observer = new globalThis.ResizeObserver(() => fn());
  observer.observe(target);
  return () => observer.disconnect();
}

export function createHistoryChart({
  canvas, kind = 'rate', token = readerToken, onThemeChange = readerThemeChange, pixelRatio = () => globalThis.devicePixelRatio || 1,
  observeResize = observeBox,
}) {
  const best = kind === 'best';
  let data = best ? { steps: [] } : [];
  let hover = null;
  let readout = null;
  const size = () => ({ width: canvas.clientWidth, height: canvas.clientHeight });
  const linesOf = (i) => (best ? bestReadout(data.steps ?? [], i) : rateReadout(data, i));
  const mark = (i) => {
    hover = i;
    readout = i === null ? null : linesOf(i).join(' · ') || null;
    if (canvas.dataset) {
      if (readout) canvas.dataset.readout = readout;
      else delete canvas.dataset.readout;
    }
  };
  const paint = () => {
    const { width, height } = size();
    if (!width || !height) return;
    const ratio = pixelRatio();
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    const ctx = canvas.getContext('2d');
    if (best) drawBestTimeChart(ctx, { width, height, pixelRatio: ratio, data, token, hover });
    else drawHistoryChart(ctx, { width, height, pixelRatio: ratio, points: data, token, hover });
  };
  const hoverAt = (x) => {
    const { width, height } = size();
    if (!width || !height) return;
    const xs = best ? bestTimeScale(data, { width, height }).xs : chartScale(data, { width, height }).xs;
    const i = nearestIndex(xs, x);
    mark(i < 0 ? null : i);
    paint();
  };
  const leave = () => {
    if (hover === null) return;
    mark(null);
    paint();
  };
  const on = (type, fn) => canvas.addEventListener?.(type, fn);
  on('pointermove', (e) => { if (e.pointerType !== 'touch') hoverAt(e.offsetX); });
  on('pointerdown', (e) => { if (e.pointerType === 'touch') hoverAt(e.offsetX); });
  on('pointerleave', (e) => { if (e.pointerType !== 'touch') leave(); });
  const off = onThemeChange(() => paint());
  const stop = observeResize(canvas, () => paint());
  return {
    draw(next = data) {
      if (next !== data) mark(null);
      data = next;
      paint();
    },
    hoverAt,
    leave,
    get readout() { return readout; },
    destroy() { off(); stop(); },
  };
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
