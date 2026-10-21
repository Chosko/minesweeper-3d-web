# App shell — component kit: behaviour helpers

## OVERVIEW

The component kit's behaviour (`js/ui/components.js`): the counter formats,
the binders of sliders, segmented choices, tabs, the one selected control,
key hints, the pager, the icon set with the button's leading icon, the code
chip and the figures panel. The catalogue
those binders follow is [app-shell-kit.md](app-shell-kit.md).

| File | Responsibility |
| ---- | -------------- |
| `js/ui/components.js` | the kit's behaviour helpers; imports nothing, binders touch only the elements handed in, so it runs under Node with stub elements |

## PUBLIC API

`js/ui/components.js`
- `formatOverlayTime(seconds)` (three digits, stops at `'999'`),
  `formatMineCount(minesLeft)` (three digits, a negative count's minus in
  the first, kept at -99), `mineCounterDigits(mines)` (at least 3; past 3
  `UI.setBoard` / `setBoard2D` set the mine counter's digits' `min-width`
  in `ch`) — the formats of every counter readout and the replay viewer's
  bar.
- `formatSliderValue(value, {format, step, max, unit})`, `decimalsOf(step)`,
  `sliderFill(value, min, max)` (the share of the range up to the value,
  0–1, clamped; an absent min or max the native 0 or 100).
- `segmentedTargetIndex(disabled, current, key, {horizontal?})`,
  `segmentedState(count, selected)`.
- `bindSliderFill(input)` — the fill updater: sets `--slider-fill` on the
  input on every input event and on every `value` a script sets (it hands
  the input's own `value` property on), so a programmatic change moves the
  fill too.
- `bindSlider(root)` (the value and the fill), `bindSegmented(group, {onChange, horizontal?})`
  (`horizontal` leaves Up/Down to the shell's focus moves),
  `bindTabs(list, {onChange})` (a `ui-tabs` tablist, Left / Right select,
  the selected tab alone in the Tab order), `bindSelectOnHover(root)` (the
  one selected control: a moving mouse focuses the enabled
  `SELECT_ON_HOVER` control under it — a button, menu entry, mode entry or
  board option — a disabled mode entry included),
  `initComponents(root)` (every slider, segmented choice and tablist) —
  each returns an unbind.
- `showKeyHints(root, keysFor)`: fills every `.ui-key-hint[data-action]`
  under `root` with the keys `keysFor(action)` gives (the bindings source's
  `keyHintKeys` for the active device), `ui-key-hint--pad` for controller
  buttons, hidden with none (touch); `UI` calls it on every device change
  ([app-shell-help.md](app-shell-help.md)).
- `PAGER_WINDOW` (the numbered pages shown), `pagerState(page, pages)` → `{hidden, page, pages,
  first, last, numbers: [{page, label, current}]}`; `bindPager(nav, {onPage,
  name?})` → `{show(state)}`: fills a `.ui-pager` with First, the numbered
  pages and Last (`data-page`), the current page `aria-current="page"` and
  `aria-disabled` (still focusable, so a pager button that becomes disabled
  hands focus to it).
- The icon set: `ICONS` (frozen, name → `{stroke, shapes: [[tag, attrs],
  …]}`), the kit's one source of the canvas's stroke icons,
  each drawn in `currentColor`; the catalogue head in `css/components.css`
  names them. `iconMarkup(name)` (svg text), `createIcon(doc, name)` (an
  `svg.ui-icon[data-icon]`, `aria-hidden`, in the SVG namespace) — an
  unknown name throws. The leading-icon slot:
  `setButtonIcon(button, name | null)` puts the icon before the label — or
  a note's text — (or removes it); `applyIcons(root)` draws the icon of
  every `.ui-button[data-icon]` and `.ui-note[data-icon]` in markup that
  has none yet, and `js/main.js` calls it on the page once the `UI` has
  built the Settings page; `createButton(doc, {label, icon?, variant?,
  size?, iconOnly?})` builds a kit button. How an icon and its button are
  named is [app-shell-kit.md](app-shell-kit.md)'s.
- The note: `setNote(el, text, {tone?, icon?})` writes `text` into `el`'s
  `.ui-note__text` after its leading icon (making the text part on first
  use, in place of any plain text), `tone` (`NOTE_TONES`: `'warn'`,
  `'err'`, or null for a plain line again) its `ui-note--<tone>` class and
  `icon` (a name or null) its `data-icon` and icon; either left out keeps
  what `el` has. Returns `el`.
- The code chip (`.ui-code`):
  `boardLink(code, location)` → `<origin><path>#board=<code>`;
  `copyBoardCode({kind, code, clipboard, location, select, toast})` →
  Promise of whether it copied (a refusal selects the code and toasts
  `COPY_FALLBACK`, else `COPIED[kind]`); `createCodeChip(doc)` — the chip
  ([app-shell-kit.md](app-shell-kit.md) holds its shape); `bindCodeChip(root, {onCopy})` →
  `{show(code | null), code}`.
- The figures panel: `bindFigures(panel)` → `{show(figures, names?)}`
  writes the panel's `.ui-figure[data-figure]` rows from the live figures
  model's `{text, detail, progress}` per figure (`js/shell/live-figures.js`
  `FIGURES`) — the named ones, or every one — each part only when its text
  changes; a null figure (pace with no best, or before the first 3BV) hides,
  a null detail hides its line, the progress bar's fill and
  `aria-valuenow` take the share solved. Its live part
  (`.ui-figures__live`, a polite live region the base hides; the figures
  themselves and the counter readouts are never live):
  `bindFiguresLive(panel, {interval?})` → `{announce(text), stop()}` writes
  it at most once per `LIVE_FIGURES_INTERVAL`, the latest held text
  winning, an unchanged text not written again. The Classic 2D window, the
  3D overlay and the replay viewer each bind their panel with both.

## INTERNAL PATTERNS

- **No imports.** A binder touches only the elements handed in and their
  `ownerDocument`, so every helper is tested under Node with stub elements.
- **The figures panel writes only on change**, so a per-frame feed costs
  nothing while nothing moves. The pager, by contrast, rebuilds its buttons
  on every `show` and puts focus back on the button of the same `data-page`,
  or on the current page when that one is gone or disabled.

## DOMAIN DEPENDENCIES

- [../domain/features/screen-components.md](../domain/features/screen-components.md)
  — the controls' keyboard and controller contract, the code chip.
- [../domain/features/shared-screen-layout.md](../domain/features/shared-screen-layout.md)
  — the icon set and its leading-icon slot, the notes, the slider's fill,
  the pager and the code chip's one shape.
- [../domain/features/in-game-layout.md](../domain/features/in-game-layout.md)
  — the counter formats and the figures panel's live part.

## CROSS-REFERENCES

- [app-shell-kit.md](app-shell-kit.md) — the catalogued markup each binder
  expects.
- [app-shell-ui.md](app-shell-ui.md) — the live figures model `bindFigures`
  shows and the panels it binds.
- [settings-bindings.md](settings-bindings.md) — `keyHintKeys`, the keys
  `showKeyHints` writes.
- [testing.md](testing.md) — `tests/components.test.mjs` (the helpers).

## WHEN TO READ THE SOURCE

- Changing a binder's keys or focus handling, the pager window or the code
  chip's copy and fallback: `js/ui/components.js`.
