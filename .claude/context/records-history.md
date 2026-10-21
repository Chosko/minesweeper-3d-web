# Records screen — history charts, paging and stats

## OVERVIEW

The figures and pictures the Records screen ([records-screen.md](records-screen.md))
draws from a board's history: the two history charts on a canvas with
their hover readouts and text alternatives, the paging both lists share,
and the pure stats — the one ranking (also the results screen's rank), the
Top 10, averages, the last-50 win rate, the period and outcome filters and
the best time's steps.

- `js/records/history-chart.js` — the 3BV/s and efficiency chart and the
  best-time-by-date chart (canvas, no chart library), hover readouts, and
  `pageOf`, the paging of both lists. Draws on the canvas it is handed.
- `js/records/stats.js` — pure figures over a board's history. DOM-free.

## PUBLIC API

History chart (`js/records/history-chart.js`)
- `chartPoints(history)`, `niceCeiling(v)`, `chartScale(points, size)`,
  `chartText(points, empty?)` / `NO_WON_GAMES`, `drawHistoryChart(ctx, opts)`,
  `CHART_TOKENS`; the best-time chart: `dateTicks`, `bestTimeScale`,
  `bestTimeText`, `drawBestTimeChart`; hover: `nearestIndex`,
  `rateReadout`, `bestReadout`; `formatDate`, `formatShortDate`;
  `createHistoryChart({ canvas, kind?: 'rate' | 'best', ... })` →
  `draw(data, emptyText?)`, `hoverAt(x)`, `leave()`, `readout`,
  `destroy()`. A chart with nothing to draw shows only its empty line,
  centred: no grid, axes or legend.
- `pageOf(items, page, size = PAGE_SIZE)`; `PAGE_SIZE` — 10.

Stats (`js/records/stats.js`)
- `rankedGames(history, stat)`, `gameRank(history, summary, stat?)`,
  `topGames`, `averages`, `recentWinRate`, `filterHistory(history,
  { period, outcome }, now)`, `periodStart`, `bestTimeSteps`, `statValue`;
  `PERIODS`, `OUTCOME_FILTERS`, `AVERAGE_WINDOWS`, `TOP_SIZE`,
  `RECENT_GAMES`.

## INTERNAL PATTERNS

- **The chart is a picture; text carries the numbers.** The canvas is
  `role="img"` with `chartText` as its label; 3BV/s reads on the left axis,
  efficiency on the right (at least 100%); a missing value is a gap.
- **Chart colours are tokens.** Every colour and its font come through the
  token reader; it redraws on every theme change and canvas resize
  (`ResizeObserver`) at the device pixel ratio; a zero-size canvas is
  skipped.
- **Hover readouts.** Each chart marks the nearest point under a pointer
  (or a tap) and draws its values beside it, also on
  `canvas.dataset.readout`; no focus stop.
- **Paged lists.** `pageOf` clamps a page past the end; the screen's two
  lists and the library view page through it.
- **Challenges are left out** of the ranking, the Top 10, the rank, the
  averages and the recent win rate.

## DOMAIN DEPENDENCIES

- [../domain/features/records-screen.md](../domain/features/records-screen.md)
  — the chart, the Top 10, averages, filters.

## CROSS-REFERENCES

- [records-screen.md](records-screen.md) — the screen that reads these.
- [app-shell-results.md](app-shell-results.md) — `gameRank` behind the
  results screen's rank.
- [app-shell-theme-runtime.md](app-shell-theme-runtime.md) — the token reader.
- [testing.md](testing.md) — `tests/records-history.test.mjs`,
  `tests/records-stats.test.mjs`.

## WHEN TO READ THE SOURCE

- Changing the chart's drawing, scale or colours: `drawHistoryChart` and
  `chartScale` in `history-chart.js`.
- Changing a ranking, an average, a filter or the best time's steps: the
  head comment of `stats.js`.
